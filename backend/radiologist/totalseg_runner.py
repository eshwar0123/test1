#!/usr/bin/env python3
"""
totalseg_runner.py  -- run ONCE per study. Supports MULTIPLE tasks merged into one
labeled volume, so more of the image gets a name.

  --task vertebrae_mr            spine levels only (L1..L5, sacrum, ...)
  --task total_mr                ~50 MR organs/muscles (NO individual vertebrae)
  --task total_mr,vertebrae_mr   BOTH, merged (organs + muscles + spine)  <-- widest coverage

Tasks are merged left-to-right; later tasks win on overlap, so list vertebrae_mr LAST
so the spine takes precedence over surrounding tissue. Each task's labels are offset
into its own ID block (task #1 -> 1000+, task #2 -> 2000+, ...) so they never collide.

Reminder: segmentation only names structures it was trained on — discs, cord, fat,
and background stay unlabeled. There is no "every pixel" model.

A bulk folder holds several series; this picks ONE (--series N, else largest non-scout),
converts just that series to NIfTI (validators relaxed), then segments it.

  python totalseg_runner.py \
    --case GENRAD-SUB-33036555 --study GENRAD-SUB-33036555 \
    --task total_mr,vertebrae_mr --series 2 \
    --outdir /mnt/dev_onix/backend/anatomy_seg \
    --input /mnt/dev_onix/backend/uploads/organization/bulk_cases/GENRAD-SUB-33036555

--study MUST equal the caseId the viewer sends. No sudo (it loses the venv).
"""
import argparse, glob, json, os, shutil, sys, tempfile
import numpy as np
import nibabel as nib
import psycopg2

DB = dict(host="127.0.0.1", port=5433, dbname="onix_db", user="virue")


def group_series(dicom_dir):
    import pydicom
    groups = {}
    for f in sorted(glob.glob(os.path.join(dicom_dir, "*"))):
        if not os.path.isfile(f):
            continue
        try:
            ds = pydicom.dcmread(f, stop_before_pixels=True, force=True)
        except Exception:
            continue
        uid = getattr(ds, "SeriesInstanceUID", None)
        if not uid:
            continue
        g = groups.setdefault(uid, {"uid": uid, "number": getattr(ds, "SeriesNumber", None),
                                    "desc": str(getattr(ds, "SeriesDescription", "") or ""), "files": []})
        g["files"].append(f)
    return list(groups.values())


def plane_of(g):
    import pydicom
    try:
        ds = pydicom.dcmread(g["files"][0], stop_before_pixels=True, force=True)
        iop = [float(x) for x in ds.ImageOrientationPatient]
        n = np.cross(iop[0:3], iop[3:6])
        return {0: "sagittal", 1: "coronal", 2: "axial"}[int(np.argmax(np.abs(n)))]
    except Exception:
        return "?"


def pick_series(groups, series_arg):
    if series_arg is not None:
        for g in groups:
            if str(g["number"]) == str(series_arg) or g["uid"] == series_arg:
                return g
        raise SystemExit(f"[err] --series {series_arg} not found")
    cands = [g for g in groups if not any(k in g["desc"].lower() for k in ("loc", "scout"))] or groups
    return max(cands, key=lambda g: len(g["files"]))


def series_to_nifti(files, out_nii):
    import dicom2nifti
    import dicom2nifti.settings as s
    for fn in ("disable_validate_orientation", "disable_validate_slice_increment", "disable_validate_slicecount"):
        getattr(s, fn, lambda: None)()
    tmp = tempfile.mkdtemp(prefix="onix_series_")
    try:
        for f in files:
            shutil.copy(f, tmp)
        dicom2nifti.dicom_series_to_nifti(tmp, out_nii, reorient_nifti=True)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return out_nii


def run_one_task(input_nii, out_nii, task, fast):
    from totalsegmentator.python_api import totalsegmentator
    totalsegmentator(input=input_nii, output=out_nii, ml=True, fast=fast, task=task)
    return out_nii


def merge_tasks(input_nii, outdir, study, tasks, fast):
    """Run each task on the same NIfTI and merge into one labeled volume."""
    from totalsegmentator.map_to_binary import class_map
    merged, affine = None, None
    label_map = {}
    for idx, task in enumerate(tasks):
        block = (idx + 1) * 1000
        out = os.path.join(outdir, f"{study}_{task}.nii.gz")
        print(f"[run] task={task} (id block {block}+)")
        run_one_task(input_nii, out, task, fast)
        img = nib.load(out)
        data = np.asanyarray(img.dataobj).astype(np.int32)
        if merged is None:
            merged = np.zeros(data.shape, np.int32)
            affine = img.affine
        cmap = class_map.get(task) or {}
        for i in (int(v) for v in np.unique(data) if v != 0):
            if i in cmap:
                label_map[str(i + block)] = cmap[i]
        shifted = np.where(data > 0, data + block, 0)
        merged = np.where(shifted > 0, shifted, merged)   # later task wins on overlap
    seg_path = os.path.join(outdir, f"{study}_seg.nii.gz")
    nib.save(nib.Nifti1Image(merged, affine), seg_path)
    return seg_path, affine, list(merged.shape[:3]), label_map


def store(case_id, study_uid, seg_path, affine, shape, label_map, model):
    conn = psycopg2.connect(**DB)
    try:
        with conn, conn.cursor() as cur:
            cur.execute(
                """INSERT INTO radiology_schema.anatomy_segmentations
                   (case_id, study_uid, seg_nifti_path, affine, shape, label_map, model)
                   VALUES (%s,%s,%s,%s,%s,%s,%s)
                   ON CONFLICT (study_uid) DO UPDATE SET
                     case_id=EXCLUDED.case_id, seg_nifti_path=EXCLUDED.seg_nifti_path,
                     affine=EXCLUDED.affine, shape=EXCLUDED.shape,
                     label_map=EXCLUDED.label_map, model=EXCLUDED.model, created_at=now()""",
                (case_id, study_uid, seg_path, json.dumps(affine.tolist()),
                 json.dumps([int(x) for x in shape]), json.dumps(label_map), model),
            )
    finally:
        conn.close()
    print(f"[ok] {study_uid}: {len(label_map)} labels stored")
    print(f"[ok] labels: {sorted(label_map.values())}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--case", required=True)
    ap.add_argument("--study", required=True)
    ap.add_argument("--input", required=True)
    ap.add_argument("--task", default="vertebrae_mr", help="comma-separated, e.g. total_mr,vertebrae_mr")
    ap.add_argument("--series", default=None)
    ap.add_argument("--outdir", default="/mnt/dev_onix/backend/anatomy_seg")
    ap.add_argument("--fast", action="store_true")
    args = ap.parse_args()
    os.makedirs(args.outdir, exist_ok=True)
    tasks = [t.strip() for t in args.task.split(",") if t.strip()]

    seg_input = args.input
    if os.path.isdir(args.input):
        groups = group_series(args.input)
        if not groups:
            raise SystemExit("[err] no DICOM series found")
        print(f"[scan] {len(groups)} series:")
        for g in sorted(groups, key=lambda x: (x["number"] or 0)):
            print(f"   SE{g['number']:>3}  {plane_of(g):8}  {len(g['files']):>3} files  {g['desc']}")
        chosen = pick_series(groups, args.series)
        print(f"[pick] SE{chosen['number']} ({chosen['desc']}, {plane_of(chosen)})")
        seg_input = os.path.join(args.outdir, f"{args.study}_input.nii.gz")
        print("[conv] converting series to NIfTI ...")
        series_to_nifti(chosen["files"], seg_input)

    seg_path, affine, shape, label_map = merge_tasks(seg_input, args.outdir, args.study, tasks, args.fast)
    store(args.case, args.study, seg_path, affine, shape, label_map, "totalsegmentator:" + "+".join(tasks))


if __name__ == "__main__":
    sys.exit(main())
