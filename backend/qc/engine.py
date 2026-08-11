"""
backend/qc/engine.py

Pure QC logic extracted from the desktop gui.py tool.
Every function here is synchronous and side-effect free so it can be
called from a FastAPI background task.

Public API:
    run_file_qc(filepath)           -> {overall, checks, meta}
    run_folder_qc(folder_path)      -> {overall, checks, files, meta}
    roll_up_case(per_file_results)  -> {status, reason, files_total, files_error, files_warn}
"""
import os
from pathlib import Path
from typing import Dict, Any, List, Optional

# Heavy imports — graceful fallback mirrors gui.py
try:
    import numpy as np;   NUMPY   = True
except ImportError:       NUMPY   = False
try:
    import pydicom;       PYDICOM = True
except ImportError:       PYDICOM = False
try:
    import nibabel as nib; NIBABEL = True
except ImportError:        NIBABEL = False
try:
    from PIL import Image as PILImage; PILLOW = True
except ImportError:                    PILLOW = False


PLACEHOLDERS = {
    "unknown", "anon", "anonymous", "test", "temp", "patient",
    "dummy", "n/a", "na", "-", "none", "", "^^^^",
}
XRAY_MODS = {"CR", "DR", "DX", "MG", "XA", "RF"}


# ══════════════════════════════════════════════════════════════════════════════
# Check result
# ══════════════════════════════════════════════════════════════════════════════
class Check:
    """One QC check result. Serializable to dict via .to_dict()."""
    def __init__(self, check, passed, severity, detail, value=None):
        self.check    = check         # e.g. "ID Check · Patient ID"
        self.passed   = bool(passed)
        self.severity = severity      # 'error' | 'warning' | 'info'
        self.detail   = detail
        self.value    = value

    def to_dict(self):
        return {
            "check":    self.check,
            "passed":   self.passed,
            "severity": self.severity,
            "detail":   self.detail,
            "value":    self.value,
        }


# ══════════════════════════════════════════════════════════════════════════════
# Pixel helpers
# ══════════════════════════════════════════════════════════════════════════════
def _pix_stats(arr):
    if not NUMPY or arr is None: return None
    a = np.asarray(arr, dtype=np.float32)
    if a.size == 0: return None
    return {
        "mean":    float(a.mean()),
        "std":     float(a.std()),
        "min":     float(a.min()),
        "max":     float(a.max()),
        "nonzero": float((a != 0).sum() / a.size),
    }


def _norm255(arr):
    if not NUMPY or arr is None: return None
    a = np.asarray(arr, dtype=np.float32)
    lo, hi = float(a.min()), float(a.max())
    if hi <= lo: return np.zeros_like(a)
    return (a - lo) / (hi - lo) * 255.0


def _lap_var(arr2d, max_px=128):
    if not NUMPY or arr2d is None or arr2d.ndim < 2: return 0.0
    h, w = arr2d.shape[:2]
    if max(h, w) > max_px:
        step = max(1, max(h, w) // max_px)
        arr2d = arr2d[::step, ::step]
    a = arr2d.astype(np.float32)
    lap = (
        -4 * a[1:-1, 1:-1]
        + a[:-2, 1:-1] + a[2:, 1:-1]
        + a[1:-1, :-2] + a[1:-1, 2:]
    )
    return float(lap.var()) if lap.size else 0.0


# ══════════════════════════════════════════════════════════════════════════════
# CHECK 1 — ID Check
# ══════════════════════════════════════════════════════════════════════════════
def run_id_check(ds) -> List[Check]:
    out = []

    pid = str(getattr(ds, "PatientID", "")).strip()
    pid_bad = not pid or pid.lower() in PLACEHOLDERS
    out.append(Check("ID Check · Patient ID",
                     not pid_bad,
                     "error",
                     "Patient ID present"
                     if not pid_bad
                     else f"Missing or placeholder ({pid or 'empty'})",
                     pid or "—"))

    raw_name = getattr(ds, "PatientName", "")
    pname = str(raw_name).replace("^", " ").strip()
    pname_bad = not pname or pname.lower() in PLACEHOLDERS
    out.append(Check("ID Check · Patient name",
                     not pname_bad,
                     "error",
                     "Patient name present"
                     if not pname_bad
                     else f"Missing or placeholder ({pname or 'empty'})",
                     pname or "—"))

    mod = str(getattr(ds, "Modality", "")).strip().upper()
    valid_mods = {"CT", "MR", "CR", "DR", "DX", "MG", "PT", "NM", "US", "XA", "RF"}
    mod_ok = mod in valid_mods
    out.append(Check("ID Check · Modality",
                     mod_ok,
                     "error",
                     f"Modality: {mod}" if mod_ok
                     else f"Unrecognised modality ({mod or 'empty'})",
                     mod or "—"))

    sdate = str(getattr(ds, "StudyDate", "")).strip()
    sdate_ok = bool(sdate) and len(sdate) == 8 and sdate.isdigit()
    pretty = f"{sdate[:4]}-{sdate[4:6]}-{sdate[6:]}" if sdate_ok else sdate or "—"
    out.append(Check("ID Check · Study date",
                     sdate_ok,
                     "error",
                     f"Study date: {pretty}" if sdate_ok
                     else f"Missing or malformed ({sdate or 'empty'})",
                     pretty))
    return out


# ══════════════════════════════════════════════════════════════════════════════
# CHECK 2 — Slice Check (across a series)
# ══════════════════════════════════════════════════════════════════════════════
def run_slice_check(slice_infos: List[Dict]) -> List[Check]:
    out = []
    n = len(slice_infos)
    if n < 2:
        out.append(Check("Slice Check · Series size",
                         False, "warning",
                         "Cannot check slice continuity — need 2+ slices",
                         f"{n} slice(s)"))
        return out

    zs = sorted((s["z"] for s in slice_infos))
    gaps = [abs(zs[i+1] - zs[i]) for i in range(len(zs)-1)]
    if not gaps:
        return out
    median = sorted(gaps)[len(gaps)//2]
    max_gap = max(gaps)
    missing = max_gap > median * 1.5 if median > 0 else False

    cv = 0.0
    if NUMPY and median > 0:
        g = np.asarray(gaps, dtype=np.float32)
        cv = float(g.std() / g.mean()) if g.mean() else 0.0

    out.append(Check("Slice Check · Series size",
                     True, "info",
                     f"Series has {n} slices", f"{n} slices"))
    out.append(Check("Slice Check · Missing slices",
                     not missing, "error",
                     "No missing slices detected" if not missing
                     else f"Max gap {max_gap:.2f}mm > 1.5× median ({median:.2f}mm)",
                     f"max {max_gap:.2f} / median {median:.2f}"))
    out.append(Check("Slice Check · Spacing regularity",
                     cv <= 0.10, "warning",
                     f"CV = {cv*100:.1f}% — {'uniform' if cv <= 0.10 else 'irregular'}",
                     f"{cv*100:.1f}%"))
    return out


# ══════════════════════════════════════════════════════════════════════════════
# CHECK 3 — Content Check (is the image empty/blank?)
# ══════════════════════════════════════════════════════════════════════════════
def run_content_check(pixel_arr) -> List[Check]:
    out = []
    if pixel_arr is None or not NUMPY:
        out.append(Check("Content Check · Pixel data",
                         False, "error",
                         "Unable to read pixel data"))
        return out

    norm = _norm255(pixel_arr)
    st = _pix_stats(norm)
    if not st:
        out.append(Check("Content Check · Pixel data",
                         False, "error", "No pixel data"))
        return out

    mean_ok = st["mean"] >= 5
    out.append(Check("Content Check · Mean intensity",
                     mean_ok, "error",
                     f"Mean = {st['mean']:.1f}/255 — {'OK' if mean_ok else 'blank image'}",
                     f"{st['mean']:.1f}"))

    std_ok = st["std"] >= 3
    out.append(Check("Content Check · Pixel std deviation",
                     std_ok, "error",
                     f"Std = {st['std']:.1f} — {'contrast present' if std_ok else 'flat image'}",
                     f"{st['std']:.1f}"))

    nz_ok = st["nonzero"] >= 0.01
    out.append(Check("Content Check · Non-zero pixel fraction",
                     nz_ok, "error",
                     f"{st['nonzero']*100:.1f}% non-zero"
                     + ("" if nz_ok else " — nearly empty frame"),
                     f"{st['nonzero']*100:.1f}%"))
    return out


# ══════════════════════════════════════════════════════════════════════════════
# CHECK 4 — Pixel Check (modality-specific)
# ══════════════════════════════════════════════════════════════════════════════
def run_pixel_check(pixel_arr, modality, rows=0, cols=0) -> List[Check]:
    out = []
    if pixel_arr is None or not NUMPY:
        return out
    mod = (modality or "").upper()

    # --- CT: HU range sanity --------------------------------------------------
    if mod == "CT":
        lo, hi = float(pixel_arr.min()), float(pixel_arr.max())
        hu_ok = -1100 <= lo and hi <= 3100
        out.append(Check("Pixel Check · HU range",
                         hu_ok, "error",
                         f"HU range {lo:.0f} to {hi:.0f}"
                         + ("" if hu_ok else " — wrong RescaleSlope/Intercept"),
                         f"{lo:.0f}..{hi:.0f}"))

    # --- MR / NIfTI: blur detection ------------------------------------------
    if mod in ("MR", "NIFTI"):
        var = _lap_var(pixel_arr)
        blur_ok = var >= 60
        out.append(Check("Pixel Check · Laplacian variance (blur)",
                         blur_ok, "error",
                         f"var = {var:.0f} — {'sharp' if blur_ok else 'blurred / motion'}",
                         f"{var:.0f}"))

    # --- X-ray: exposure -----------------------------------------------------
    if mod in XRAY_MODS or mod in ("CR", "DR"):
        norm = _norm255(pixel_arr)
        st = _pix_stats(norm)
        if st:
            dark = (norm < 25).sum() / norm.size if NUMPY else 0
            bright = (norm > 230).sum() / norm.size if NUMPY else 0
            exp_ok = dark < 0.90 and bright < 0.05
            out.append(Check("Pixel Check · Exposure",
                             exp_ok, "error",
                             f"{dark*100:.1f}% dark, {bright*100:.1f}% saturated"
                             + ("" if exp_ok else " — re-expose"),
                             f"{dark*100:.1f}%/{bright*100:.1f}%"))
    return out


# ══════════════════════════════════════════════════════════════════════════════
# FILE / FOLDER RUNNERS
# ══════════════════════════════════════════════════════════════════════════════
def qc_dicom_file(filepath) -> (List[Check], Dict):
    checks, meta = [], {"type": "DICOM", "size": os.path.getsize(filepath), "modality": ""}
    if not PYDICOM:
        checks.append(Check("ID Check · pydicom missing", False, "error",
                            "pip install pydicom required"))
        return checks, meta
    try:
        ds = pydicom.dcmread(filepath, force=True)
    except Exception as e:
        checks.append(Check("ID Check · File read", False, "error", str(e)))
        return checks, meta

    mod = str(getattr(ds, "Modality", "")).strip().upper()
    meta["modality"] = mod

    checks += run_id_check(ds)

    # Slice
    n_frames = int(getattr(ds, "NumberOfFrames", 1) or 1)
    if n_frames > 1:
        checks.append(Check("Slice Check · Multi-frame DICOM", True, "warning",
                            f"{n_frames} frames in one file — mid-frame used for pixel checks",
                            f"{n_frames} frames"))
    else:
        checks.append(Check("Slice Check · Single file", True, "info",
                            "Single 2D slice — upload a folder to check continuity"))

    # Pixel array -> always 2D
    pixel_arr = None
    if NUMPY:
        try:
            raw       = ds.pixel_array.astype(np.float32)
            slope     = float(getattr(ds, "RescaleSlope", 1))
            intercept = float(getattr(ds, "RescaleIntercept", 0))
            rescaled  = raw * slope + intercept
            if rescaled.ndim == 3:
                pixel_arr = rescaled[rescaled.shape[0] // 2]
            elif rescaled.ndim == 2:
                pixel_arr = rescaled
            else:
                pixel_arr = rescaled.reshape(rescaled.shape[-2], rescaled.shape[-1])
        except Exception:
            pass

    checks += run_content_check(pixel_arr)
    checks += run_pixel_check(pixel_arr, mod,
                              int(getattr(ds, "Rows", 0)),
                              int(getattr(ds, "Columns", 0)))
    return checks, meta


def qc_nifti_file(filepath) -> (List[Check], Dict):
    checks, meta = [], {"type": "NIfTI", "size": os.path.getsize(filepath), "modality": "NIfTI"}
    if not NIBABEL:
        checks.append(Check("ID Check · nibabel missing", False, "error",
                            "pip install nibabel required"))
        return checks, meta
    try:
        img = nib.load(filepath)
    except Exception as e:
        checks.append(Check("ID Check · File read", False, "error", str(e)))
        return checks, meta

    _m = getattr(img.header, "magic", b"")
    magic = (_m.decode("utf-8", "ignore") if isinstance(_m, bytes) else str(_m)).strip("\x00")
    checks.append(Check("ID Check · File format", True, "info",
                        f'Valid NIfTI-1 (magic: "{magic}")'))

    shape = img.shape
    dim_ok = all(d > 1 for d in shape[:2])
    checks.append(Check("ID Check · Dimensions", dim_ok, "error",
                        f"Volume: {'×'.join(str(d) for d in shape)}" if dim_ok
                        else f"Invalid dimensions {shape}",
                        "×".join(str(d) for d in shape)))

    nz = shape[2] if len(shape) >= 3 else 1
    checks.append(Check("Slice Check · Z slices", nz > 1, "warning",
                        f"{nz} slices along Z axis" if nz > 1 else "Single-slice volume",
                        f"{nz} slices"))

    zooms = img.header.get_zooms()
    pz = float(zooms[2]) if len(zooms) >= 3 else 0
    vox_ok = 0.05 < pz < 30
    checks.append(Check("Slice Check · Voxel spacing", vox_ok, "warning",
                        f"Z voxel {pz:.3f}mm — {'plausible' if vox_ok else 'bad resampling'}",
                        f"{pz:.3f}mm"))

    if NUMPY:
        try:
            data = np.asarray(img.dataobj, dtype=np.float32)
        except Exception:
            data = None
        if data is not None and data.ndim >= 3:
            mid_z = data.shape[2] // 2
            slice2d = data[:, :, mid_z]
        else:
            slice2d = data
        checks += run_content_check(slice2d)
        checks += run_pixel_check(slice2d, "MR")
    return checks, meta


def qc_image_file(filepath) -> (List[Check], Dict):
    checks, meta = [], {"type": "Image", "size": os.path.getsize(filepath), "modality": "X-ray"}
    if not PILLOW:
        checks.append(Check("ID Check · Pillow missing", False, "error",
                            "pip install Pillow required"))
        return checks, meta
    try:
        pil = PILImage.open(filepath).convert("L")
        w, h = pil.size
    except Exception as e:
        checks.append(Check("ID Check · File decode", False, "error", str(e)))
        return checks, meta

    checks.append(Check("ID Check · File signature", True, "info",
                        f"Valid {Path(filepath).suffix.upper()} — {w}×{h}px"))
    res_ok = w >= 512 and h >= 512
    checks.append(Check("ID Check · Resolution", res_ok, "warning",
                        f"{w}×{h}px — {'OK' if res_ok else 'below 512×512 minimum'}",
                        f"{w}×{h}px"))
    checks.append(Check("Slice Check · N/A", True, "info",
                        "Single 2D image — slice analysis not applicable"))

    if NUMPY:
        arr = np.array(pil, dtype=np.float32)
        checks += run_content_check(arr)
        checks += run_pixel_check(arr, "CR", h, w)
    return checks, meta


# ══════════════════════════════════════════════════════════════════════════════
# PUBLIC API  — called from router / background task
# ══════════════════════════════════════════════════════════════════════════════
_EXT_DICOM  = (".dcm", ".ima", ".dicom")
_EXT_NIFTI  = (".nii", ".nii.gz")
_EXT_IMAGE  = (".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp")


def _overall_from_checks(checks: List[Check]) -> str:
    """'pass' if every check passed; 'error' if any failed check is severity=error;
       otherwise 'warn'."""
    worst = "pass"
    for c in checks:
        if not c.passed:
            if c.severity == "error":
                return "error"
            if c.severity == "warning":
                worst = "warn"
    return worst


def _reason_from_checks(checks: List[Check], limit: int = 3) -> str:
    """Concise human-readable summary of the failures (first N)."""
    bad = [c for c in checks if not c.passed and c.severity in ("error", "warning")]
    if not bad:
        return ""
    parts = [f"{c.check}: {c.detail}" for c in bad[:limit]]
    if len(bad) > limit:
        parts.append(f"…and {len(bad) - limit} more")
    return " | ".join(parts)


def run_file_qc(filepath: str) -> Dict[str, Any]:
    """Run QC on a single file. Dispatches by extension."""
    if not os.path.isfile(filepath):
        return {
            "overall": "error",
            "reason":  "File not found on disk",
            "checks":  [],
            "meta":    {"type": "missing", "size": 0, "modality": ""},
        }

    low = filepath.lower()
    if   low.endswith(_EXT_DICOM):  checks, meta = qc_dicom_file(filepath)
    elif low.endswith(_EXT_NIFTI):  checks, meta = qc_nifti_file(filepath)
    elif low.endswith(_EXT_IMAGE):  checks, meta = qc_image_file(filepath)
    else:
        checks = [Check("ID Check · File type", False, "error",
                        f"Unsupported extension: {Path(filepath).suffix}")]
        meta = {"type": "unknown", "size": os.path.getsize(filepath), "modality": ""}

    return {
        "overall": _overall_from_checks(checks),
        "reason":  _reason_from_checks(checks),
        "checks":  [c.to_dict() for c in checks],
        "meta":    meta,
    }


def roll_up_case(per_file: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Lenient case-level verdict:
       - 'error'  only if EVERY file is error
       - 'warn'   if any file is warn or error (but not all error)
       - 'pass'   if every file passes
    """
    n = len(per_file)
    if n == 0:
        return {"status": "error", "reason": "No files to QC",
                "files_total": 0, "files_error": 0, "files_warn": 0}

    errs  = sum(1 for f in per_file if f["overall"] == "error")
    warns = sum(1 for f in per_file if f["overall"] == "warn")

    if errs == n:
        status = "error"
        reason = f"All {n} file(s) failed QC. " + (per_file[0].get("reason") or "")
    elif errs > 0 or warns > 0:
        status = "warn"
        reason = (f"{errs} error(s), {warns} warning(s) across {n} file(s). "
                  + (next((f["reason"] for f in per_file if f["reason"]), "") or ""))
    else:
        status = "pass"
        reason = ""

    return {
        "status":      status,
        "reason":      reason.strip(),
        "files_total": n,
        "files_error": errs,
        "files_warn":  warns,
    }
