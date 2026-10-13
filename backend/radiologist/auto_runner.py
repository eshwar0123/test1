#!/usr/bin/env python3
"""
auto_runner.py  -- ONIX unified anatomy segmentation runner.

Reads BodyPartExamined + StudyDescription from the DICOM header once,
detects the body region, picks the right series, and runs the correct tool:

  Brain     → antspynet deep_atropos     (pip install antspyx antspynet)
                labels: csf, cortical_gray_matter, white_matter,
                        deep_gray_matter, brain_stem, cerebellum

  Spine     → TotalSegmentator total_mr + vertebrae_mr
                labels: vertebrae_L1-L5, sacrum, discs, organs in FOV

  Chest     → TotalSegmentator total_mr
                labels: heart, aorta, lungs, pulmonary vessels,
                        sternum, ribs, spinal_cord ...

  Abdomen   → TotalSegmentator total_mr
                labels: liver, kidney_L/R, spleen, pancreas,
                        gallbladder, stomach, bowel, adrenals, aorta ...

  Pelvis    → TotalSegmentator total_mr
                labels: bladder, prostate/uterus, rectum,
                        hip bones, iliac vessels ...

  Head/Neck → TotalSegmentator total_mr
                labels: brain (one blob), spinal_cord, muscles,
                        cervical vertebrae if vertebrae_mr added

  Extremity → TotalSegmentator total_mr
                labels: bones, muscles, vessels in FOV

Usage:
  python auto_runner.py \\
      --case  GENRAD-SUB-33036555 \\
      --study GENRAD-SUB-33036555 \\
      --input /path/to/dicom_dir \\
      --outdir /mnt/dev_onix/backend/anatomy_seg

Overrides:
  --region  brain|spine|chest|abdomen|pelvis|head_neck|extremity|body
  --series  N          force a specific DICOM series number
  --modality t1|t2|flair   brain modality hint (default: auto)
  --task    total_mr,...    override TotalSegmentator tasks
  --fast                   use lower-res TotalSegmentator model

--study MUST equal the caseId the viewer uses. Never run with sudo.
"""
import argparse
import glob
import json
import os
import shutil
import sys
import tempfile

import nibabel as nib
import numpy as np
import psycopg2

# ─────────────────────────────────────────────────────────────────────────────
# Config
# ─────────────────────────────────────────────────────────────────────────────
DB = dict(host="127.0.0.1", port=5433, dbname="onix_db", user="virue")

# antspynet deep_atropos labels (brain only)
ATROPOS_LABELS = {
    1: "csf",
    2: "cortical_gray_matter",
    3: "white_matter",
    4: "deep_gray_matter",      # thalamus, basal ganglia, hippocampus area
    5: "brain_stem",
    6: "cerebellum",
}

# TotalSegmentator tasks per region (None = use antspynet instead)
REGION_TASKS = {
    "brain":      None,                         # antspynet
    "spine":      ["total_mr", "vertebrae_mr"], # organs + individual vertebrae
    "chest":      ["total_mr"],
    "abdomen":    ["total_mr"],
    "pelvis":     ["total_mr"],
    "head_neck":  ["total_mr"],
    "extremity":  ["total_mr"],
    "body":       ["total_mr"],                 # generic fallback
}

# Preferred acquisition plane for each region (affects series picker)
REGION_PLANE = {
    "brain":      "axial",      # antspynet handles any plane
    "spine":      "sagittal",   # sag T2 is the standard spine sequence
    "chest":      "axial",
    "abdomen":    "axial",
    "pelvis":     "axial",
    "head_neck":  "axial",
    "extremity":  None,         # no strong preference; pick largest
    "body":       "axial",
}

# What to expect — shown in the printed log so users know what's coming
REGION_PREVIEW = {
    "brain":      "csf · gray_matter · white_matter · deep_gray_matter · brain_stem · cerebellum",
    "spine":      "vertebrae_L1-L5 · sacrum · intervertebral_discs · spinal_cord · organs in FOV",
    "chest":      "heart · aorta · lungs · pulmonary_vessels · sternum · spinal_cord",
    "abdomen":    "liver · kidney_L/R · spleen · pancreas · gallbladder · stomach · bowel · adrenals · aorta",
    "pelvis":     "bladder · prostate/uterus · rectum · sigmoid · hip_bones · iliac_vessels",
    "head_neck":  "brain (blob) · spinal_cord · muscles · parotid · submandibular",
    "extremity":  "bones · muscles · vessels in FOV",
    "body":       "all total_mr organs/muscles in FOV",
}

# ─────────────────────────────────────────────────────────────────────────────
# Region detection — keyword maps
# ─────────────────────────────────────────────────────────────────────────────

# Exact / prefix matches against BodyPartExamined (DICOM standard values)
_EXACT = {
    # Brain / head
    "BRAIN": "brain",        "HEAD": "brain",         "SKULL": "brain",
    "ORBIT": "brain",        "ORBITS": "brain",       "SELLA": "brain",
    "IAC":   "brain",        "PETROUS": "brain",      "POSTERIOR FOSSA": "brain",
    "HEADBRAIN": "brain",    "BRAIN STEM": "brain",
    # Spine
    "SPINE": "spine",        "CSPINE": "spine",       "TSPINE": "spine",
    "LSPINE": "spine",       "SSPINE": "spine",       "CSPINE_TSPINE": "spine",
    "TSPINE_LSPINE": "spine","LSPINE_SSPINE": "spine","LUMBAR SPINE": "spine",
    "THORACIC SPINE": "spine","CERVICAL SPINE": "spine","SACRUM": "spine",
    "SACRAL SPINE": "spine",
    # Chest
    "CHEST": "chest",        "THORAX": "chest",       "LUNG": "chest",
    "LUNGS": "chest",        "HEART": "chest",        "MEDIASTINUM": "chest",
    "CARDIAC": "chest",
    # Abdomen
    "ABDOMEN": "abdomen",    "LIVER": "abdomen",      "PANCREAS": "abdomen",
    "SPLEEN": "abdomen",     "KIDNEY": "abdomen",     "KIDNEYS": "abdomen",
    "GALLBLADDER": "abdomen","ADRENAL": "abdomen",
    # Pelvis
    "PELVIS": "pelvis",      "PROSTATE": "pelvis",    "UTERUS": "pelvis",
    "BLADDER": "pelvis",     "RECTUM": "pelvis",      "OVARY": "pelvis",
    "CERVIX": "pelvis",
    # Extremities
    "KNEE": "extremity",     "KNEES": "extremity",    "SHOULDER": "extremity",
    "ANKLE": "extremity",    "WRIST": "extremity",    "ELBOW": "extremity",
    "HIP":  "extremity",     "FOOT": "extremity",     "HAND": "extremity",
    "FINGER": "extremity",   "TOE": "extremity",      "FEMUR": "extremity",
    "TIBIA": "extremity",    "FIBULA": "extremity",   "HUMERUS": "extremity",
    "FOREARM": "extremity",  "LOWER LEG": "extremity","UPPER ARM": "extremity",
}

# Substring keyword lists (checked in priority order, higher = first)
_BRAIN_KW     = ["BRAIN", "INTRACRANIAL", "CEREBR", "CRANI", "NEURO",
                  "SELLA", "SKULL BASE", "ORBIT", "TEMPORAL BONE", "ACOUSTIC"]
_SPINE_KW     = ["SPINE", "LUMBAR", "LSPINE", "LUMBOSACRAL", "L-S",
                  "THORACIC SPINE", "T-SPINE", "TSPINE", "T SPINE",
                  "CERVICAL SPINE", "C-SPINE", "CSPINE", "C SPINE",
                  "VERTEBR", "SACRAL", "SACRUM", "DISC "]
_CHEST_KW     = ["CHEST", "THORAX", "LUNG", "CARDIAC", "HEART",
                  "MEDIASTIN", "PLEURA", "PERICARDIAL", "PULMONARY"]
_ABDOMEN_KW   = ["ABDOMEN", "ABDOMINAL", "LIVER", "SPLEEN", "PANCREAS",
                  "GALLBLADDER", "BILIARY", "STOMACH", "BOWEL", "COLON",
                  "ADRENAL", "KIDNEY", "RENAL"]
_PELVIS_KW    = ["PELVIS", "PELVIC", "PROSTATE", "UTERUS", "BLADDER",
                  "RECTUM", "OVARY", "CERVIX", "VAGINA", "SEMINAL VESICLE"]
_HEAD_NECK_KW = ["NECK", "THYROID", "PAROTID", "LARYNX", "PHARYNX",
                  "OROPHARYNX", "NASOPHARYNX", "SALIVARY"]
_EXTREMITY_KW = ["KNEE", "SHOULDER", "ANKLE", "WRIST", "ELBOW",
                  "FOOT", "HAND", "FEMUR", "TIBIA", "FIBULA",
                  "HUMERUS", "RADIUS", "ULNA", "TOE", "FINGER",
                  "LOWER LEG", "UPPER ARM", "FOREARM"]

# Series description substrings to skip during series selection
_SKIP_DESC = ["scout", "loc", "localizer", "aah", "phoenix", "report",
               "ziprepor", "swi", "mag_image", "pha_image", "mip_image",
               "adc", "dwi", "trace", "b0_map", "b1_map", "tof",
               "angio", "mra", "perfusion"]


def _detect_from_string(text):
    """Try to resolve a region from a plain text string (UPPER-CASED)."""
    text = text.strip().upper()
    # 1. Exact lookup
    if text in _EXACT:
        return _EXACT[text]
    # 2. Prefix / contains
    for kw_list, region in [
        (_BRAIN_KW,     "brain"),
        (_SPINE_KW,     "spine"),
        (_CHEST_KW,     "chest"),
        (_ABDOMEN_KW,   "abdomen"),
        (_PELVIS_KW,    "pelvis"),
        (_HEAD_NECK_KW, "head_neck"),
        (_EXTREMITY_KW, "extremity"),
    ]:
        if any(kw in text for kw in kw_list):
            return region
    return None


def detect_region(groups):
    """
    Read BodyPartExamined + StudyDescription from the DICOM header,
    keyword-match, return one of:
      brain | spine | chest | abdomen | pelvis | head_neck | extremity | body
    """
    import pydicom

    body_part  = ""
    study_desc = ""
    for g in sorted(groups, key=lambda x: x["number"]):
        for f in g["files"][:2]:
            try:
                ds = pydicom.dcmread(f, stop_before_pixels=True, force=True)
                body_part  = str(ds.get("BodyPartExamined", "") or "").strip()
                study_desc = str(ds.get("StudyDescription",  "") or "").strip()
                if body_part or study_desc:
                    break
            except Exception:
                pass
        if body_part or study_desc:
            break

    print(f"[detect] BodyPartExamined='{body_part}'  "
          f"StudyDescription='{study_desc}'")

    # Try BodyPartExamined first (most reliable), then StudyDescription,
    # then aggregate of all SeriesDescriptions.
    for text in [body_part, study_desc,
                 " ".join(g["desc"] for g in groups)]:
        region = _detect_from_string(text)
        if region:
            return region

    print("[detect] region unknown → defaulting to 'body' (total_mr)")
    return "body"


# ─────────────────────────────────────────────────────────────────────────────
# DICOM helpers
# ─────────────────────────────────────────────────────────────────────────────
def group_series(dicom_dir):
    import pydicom
    groups = {}
    for f in sorted(glob.glob(
            os.path.join(dicom_dir, "**", "*"), recursive=True)):
        if not os.path.isfile(f):
            continue
        try:
            ds = pydicom.dcmread(f, stop_before_pixels=True, force=True)
        except Exception:
            continue
        uid = getattr(ds, "SeriesInstanceUID", None)
        if not uid:
            continue
        g = groups.setdefault(uid, {
            "uid":    uid,
            "number": int(getattr(ds, "SeriesNumber", 0) or 0),
            "desc":   str(getattr(ds, "SeriesDescription", "") or ""),
            "files":  [],
        })
        g["files"].append(f)
    return list(groups.values())


def plane_of(g):
    import pydicom
    try:
        ds  = pydicom.dcmread(g["files"][0], stop_before_pixels=True, force=True)
        iop = [float(x) for x in ds.ImageOrientationPatient]
        n   = np.cross(iop[0:3], iop[3:6])
        return {0: "sagittal", 1: "coronal", 2: "axial"}[int(np.argmax(np.abs(n)))]
    except Exception:
        return "?"


def _is_skip(desc):
    d = desc.lower()
    return any(k in d for k in _SKIP_DESC)


def _mod_score(desc):
    """FLAIR=3 > T2=2 > T1=1 > other=0 — for brain series ranking."""
    d = desc.lower()
    if any(x in d for x in ("flair", "tirm", "dark-fluid")):
        return 3
    if "t2" in d:
        return 2
    if any(x in d for x in ("t1", "mprage", "fl2d", "ir_tra")):
        return 1
    return 0


def _modality_hint(desc):
    d = desc.lower()
    if any(x in d for x in ("flair", "tirm", "dark-fluid")):
        return "flair"
    if "t2" in d:
        return "t2"
    if any(x in d for x in ("t1", "mprage", "fl2d")):
        return "t1"
    return None


def pick_series(groups, series_arg, region):
    """Pick the best series for a given region."""
    if series_arg is not None:
        for g in groups:
            if str(g["number"]) == str(series_arg):
                return g
        raise SystemExit(f"[err] --series {series_arg} not found")

    cands = [g for g in groups
             if not _is_skip(g["desc"]) and len(g["files"]) > 1]
    if not cands:
        cands = [g for g in groups if len(g["files"]) > 1] or groups

    pref_plane = REGION_PLANE.get(region)

    if region == "brain":
        # Prefer FLAIR > T2 > T1; then most files
        return max(cands, key=lambda g: (_mod_score(g["desc"]), len(g["files"])))

    if pref_plane:
        in_plane = [g for g in cands if plane_of(g) == pref_plane]
        if in_plane:
            if region == "spine":
                # Among sagittal: prefer T2
                t2 = [g for g in in_plane if "t2" in g["desc"].lower()]
                return max(t2 or in_plane, key=lambda g: len(g["files"]))
            return max(in_plane, key=lambda g: len(g["files"]))

    return max(cands, key=lambda g: len(g["files"]))


def series_to_nifti(files, out_nii):
    import dicom2nifti
    import dicom2nifti.settings as s
    for fn in ("disable_validate_orientation",
               "disable_validate_slice_increment",
               "disable_validate_slicecount"):
        getattr(s, fn, lambda: None)()
    tmp = tempfile.mkdtemp(prefix="onix_series_")
    try:
        for f in files:
            shutil.copy(f, tmp)
        dicom2nifti.dicom_series_to_nifti(tmp, out_nii, reorient_nifti=True)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    if not os.path.exists(out_nii):
        raise RuntimeError(f"dicom2nifti produced no output → {out_nii}")
    return out_nii


# ─────────────────────────────────────────────────────────────────────────────
# Segmentation engines
# ─────────────────────────────────────────────────────────────────────────────
def run_brain(nii_input, outdir, study, modality="flair"):
    try:
        import ants
        import antspynet
    except ImportError:
        raise SystemExit(
            "[err] antspyx / antspynet not installed.\n"
            "      Run:  pip install antspyx antspynet"
        )
    print(f"[brain] loading {nii_input}")
    img = ants.image_read(nii_input)
    print(f"        shape={img.shape}  "
          f"spacing={tuple(round(s, 2) for s in img.spacing)}")

    print(f"[brain] skull-strip (modality={modality}) ...")
    mask      = antspynet.brain_extraction(img, modality=modality, verbose=False)
    brain_img = img * ants.threshold_image(mask, 0.5, 1.0, 1, 0)

    print("[brain] deep_atropos tissue segmentation ...")
    result   = antspynet.deep_atropos(brain_img, do_preprocessing=True,
                                      verbose=False)
    seg      = result["segmentation_image"]
    seg_path = os.path.join(outdir, f"{study}_brain_seg.nii.gz")
    # ants.to_nibabel() was removed in newer antspyx — write then reload instead
    ants.image_write(seg, seg_path)
    seg_nib  = nib.load(seg_path)

    seg_np    = np.asarray(seg_nib.dataobj).astype(np.int32)
    present   = [int(v) for v in np.unique(seg_np) if v > 0]
    label_map = {str(lid): ATROPOS_LABELS[lid]
                 for lid in present if lid in ATROPOS_LABELS}
    return seg_path, seg_nib.affine, list(seg_nib.shape[:3]), label_map


def run_totalseg(nii_input, outdir, study, tasks, fast=False):
    from totalsegmentator.python_api import totalsegmentator
    from totalsegmentator.map_to_binary import class_map

    merged, affine = None, None
    label_map = {}
    for idx, task in enumerate(tasks):
        block   = (idx + 1) * 1000
        out_nii = os.path.join(outdir, f"{study}_{task}.nii.gz")
        print(f"[tseg]  task={task}  label block={block}+")
        totalsegmentator(input=nii_input, output=out_nii,
                         ml=True, fast=fast, task=task)
        img  = nib.load(out_nii)
        data = np.asanyarray(img.dataobj).astype(np.int32)
        if merged is None:
            merged, affine = np.zeros(data.shape, np.int32), img.affine
        cmap = class_map.get(task) or {}
        for i in (int(v) for v in np.unique(data) if v != 0):
            if i in cmap:
                label_map[str(i + block)] = cmap[i]
        merged = np.where(data > 0, data + block, merged)

    seg_path = os.path.join(outdir, f"{study}_seg.nii.gz")
    nib.save(nib.Nifti1Image(merged, affine), seg_path)
    return seg_path, affine, list(merged.shape[:3]), label_map


# ─────────────────────────────────────────────────────────────────────────────
# DB store  (ON CONFLICT → upsert, same as totalseg_runner.py)
# ─────────────────────────────────────────────────────────────────────────────
def store(case_id, study_uid, seg_path, affine, shape, label_map, model):
    conn = psycopg2.connect(**DB)
    try:
        with conn, conn.cursor() as cur:
            cur.execute(
                """INSERT INTO radiology_schema.anatomy_segmentations
                   (case_id, study_uid, seg_nifti_path, affine, shape,
                    label_map, model)
                   VALUES (%s,%s,%s,%s,%s,%s,%s)
                   ON CONFLICT (study_uid) DO UPDATE SET
                     case_id         = EXCLUDED.case_id,
                     seg_nifti_path  = EXCLUDED.seg_nifti_path,
                     affine          = EXCLUDED.affine,
                     shape           = EXCLUDED.shape,
                     label_map       = EXCLUDED.label_map,
                     model           = EXCLUDED.model,
                     created_at      = now()""",
                (case_id, study_uid, seg_path,
                 json.dumps(affine.tolist()),
                 json.dumps([int(x) for x in shape]),
                 json.dumps(label_map), model),
            )
    finally:
        conn.close()
    print(f"[ok]    {study_uid}: {len(label_map)} labels stored")
    print(f"[ok]    labels: {sorted(label_map.values())}")


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser(
        description="ONIX auto-detect & segment anatomy runner")
    ap.add_argument("--case",     required=True)
    ap.add_argument("--study",    required=True,
                    help="study_uid stored in DB (must match caseId in viewer)")
    ap.add_argument("--input",    required=True,
                    help="DICOM folder or NIfTI path")
    ap.add_argument("--outdir",   default="/mnt/dev_onix/backend/anatomy_seg")
    ap.add_argument("--series",   default=None,
                    help="Force a specific DICOM series number")
    ap.add_argument("--region",   default=None,
                    choices=list(REGION_TASKS.keys()),
                    help="Override auto-detection")
    ap.add_argument("--modality", default=None,
                    choices=["t1", "t2", "flair"],
                    help="Brain modality hint (default: auto)")
    ap.add_argument("--task",     default=None,
                    help="Override TotalSegmentator tasks (comma-separated)")
    ap.add_argument("--fast",     action="store_true",
                    help="Lower-res TotalSegmentator model")
    args = ap.parse_args()

    os.makedirs(args.outdir, exist_ok=True)

    # ── 1. Scan DICOM folder ──────────────────────────────────────────────
    nii_input = args.input
    groups    = []
    if os.path.isdir(args.input):
        groups = group_series(args.input)
        if not groups:
            raise SystemExit("[err] no DICOM series found in input folder")
        print(f"[scan]  {len(groups)} series:")
        for g in sorted(groups, key=lambda x: x["number"]):
            print(f"   SE{g['number']:>3}  {plane_of(g):10}  "
                  f"{len(g['files']):>3} files  {g['desc']}")

    # ── 2. Detect body region ─────────────────────────────────────────────
    region = args.region
    if region is None and groups:
        region = detect_region(groups)
    region = region or "body"
    print(f"[detect] region → {region.upper()}")
    print(f"[detect] expected labels: {REGION_PREVIEW.get(region, '?')}")

    # ── 3. Pick series and convert to NIfTI ───────────────────────────────
    modality = args.modality
    if groups:
        chosen = pick_series(groups, args.series, region)
        if region == "brain" and modality is None:
            modality = _modality_hint(chosen["desc"]) or "flair"
        print(f"[pick]   SE{chosen['number']} "
              f"({chosen['desc']}, {len(chosen['files'])} files"
              + (f", modality={modality}" if region == "brain" else "") + ")")
        nii_input = os.path.join(args.outdir, f"{args.study}_input.nii.gz")
        print("[conv]   converting DICOM → NIfTI ...")
        series_to_nifti(chosen["files"], nii_input)

    # ── 4. Segment ────────────────────────────────────────────────────────
    if region == "brain":
        modality = modality or "flair"
        print(f"\n[route]  BRAIN → antspynet deep_atropos  (modality={modality})")
        seg_path, affine, shape, label_map = run_brain(
            nii_input, args.outdir, args.study, modality)
        model = f"antspynet:deep_atropos:{modality}"
    else:
        if args.task:
            tasks = [t.strip() for t in args.task.split(",") if t.strip()]
        else:
            tasks = REGION_TASKS.get(region) or ["total_mr"]
        print(f"\n[route]  {region.upper()} → TotalSegmentator  tasks={tasks}")
        seg_path, affine, shape, label_map = run_totalseg(
            nii_input, args.outdir, args.study, tasks, args.fast)
        model = "totalsegmentator:" + "+".join(tasks)

    # ── 5. Store ──────────────────────────────────────────────────────────
    store(args.case, args.study, seg_path, affine, shape, label_map, model)


if __name__ == "__main__":
    sys.exit(main())
