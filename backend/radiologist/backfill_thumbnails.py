"""One-off backfill: generate a PNG thumbnail for every row in radiology_schema.rad_scans.

Saves PNGs to backend/radiologist/uploads/thumbnails/<scan_id>_thumb.png and updates
the row's thumbnail_path column to the filename. Runs from repo root or anywhere.

Usage:
    python3 backend/radiologist/backfill_thumbnails.py            # apply changes
    python3 backend/radiologist/backfill_thumbnails.py --dry-run  # plan only
"""
import os
import sys
import argparse
from pathlib import Path

import numpy as np
import nibabel as nib
import pydicom
from PIL import Image
from dotenv import load_dotenv

THIS_FILE = Path(__file__).resolve()
RADIOLOGIST_DIR = THIS_FILE.parent
BACKEND_DIR = RADIOLOGIST_DIR.parent
REPO_ROOT = BACKEND_DIR.parent

sys.path.insert(0, str(BACKEND_DIR))
load_dotenv(BACKEND_DIR / ".env")

from database import get_conn  # noqa: E402

THUMB_DIR = RADIOLOGIST_DIR / "uploads" / "thumbnails"
THUMB_DIR.mkdir(parents=True, exist_ok=True)

FRONTEND_DATASET_DIR = REPO_ROOT / "frontend" / "src" / "modules" / "radiologist" / "dataset"
BACKEND_NII_DIR = RADIOLOGIST_DIR / "nii"
BACKEND_DICOM_SERIES_DIR = RADIOLOGIST_DIR / "dicom_series"
BACKEND_DICOM_FILE_DIR = RADIOLOGIST_DIR / "dicom_files"

# case_id -> dataset folder/file for frontend-bundled rows (from seed files
# repository_1.js / cp_repo_now.js)
FRONTEND_BUNDLED_MAP = {
    "CASE-REAL-2001": "Head_CT_dicom",
    "CASE-REAL-2002": "MRI_Brain_nifti.nii",
    "CASE-REAL-2003": "pelvic_CT_dicom",
    "CASE-REAL-2004": "CT_Abdo_nifti.nii",
    "CASE-REAL-2005": "CT_Brain_nifti.nii",
    "CASE-REAL-2006": "MRI_Head_nifti.nii",
    "CASE-REAL-2007": "XRay_Chest_dicom",
    "CASE-REAL-2008": "XRay_Leg_dicom",
    "CASE-REAL-2009": "XRay_Knee_dicom",
    "CASE-REAL-2010": "Mammography_Left_dicom",
    "CASE-REAL-2011": "Mammography_Right_dicom",
    "CASE-REAL-2012": "MRI_Pelvis_Hemalata_dicom",
}


def _normalize_to_uint8(arr: np.ndarray) -> np.ndarray:
    arr = arr.astype(np.float32)
    lo, hi = float(np.min(arr)), float(np.max(arr))
    if hi - lo == 0:
        return np.zeros_like(arr, dtype=np.uint8)
    return (((arr - lo) / (hi - lo)) * 255.0).astype(np.uint8)


def _save_png(arr_uint8: np.ndarray, out_path: Path, max_dim: int = 384) -> None:
    img = Image.fromarray(arr_uint8)
    if img.mode != "L" and img.mode != "RGB":
        img = img.convert("L")
    img.thumbnail((max_dim, max_dim), Image.LANCZOS)
    img.save(out_path, format="PNG", optimize=True)


def thumb_from_nifti(nii_path: Path, out_path: Path) -> bool:
    try:
        img = nib.load(str(nii_path))
        data = img.get_fdata()
        if data.ndim == 4:
            data = data[:, :, :, 0]
        if data.ndim < 3:
            return False
        mid = data.shape[2] // 2
        slc = np.rot90(data[:, :, mid])
        _save_png(_normalize_to_uint8(slc), out_path)
        return True
    except Exception as e:
        print(f"   nifti error: {e}")
        return False


def thumb_from_dicom_file(dcm_path: Path, out_path: Path) -> bool:
    try:
        ds = pydicom.dcmread(str(dcm_path), force=True)
        arr = ds.pixel_array
        if arr.ndim == 3:
            # multi-frame DICOM — take middle frame
            arr = arr[arr.shape[0] // 2]
        # apply rescale slope/intercept if present
        slope = float(getattr(ds, "RescaleSlope", 1) or 1)
        intercept = float(getattr(ds, "RescaleIntercept", 0) or 0)
        arr = arr.astype(np.float32) * slope + intercept
        _save_png(_normalize_to_uint8(arr), out_path)
        return True
    except Exception as e:
        print(f"   dicom error: {e}")
        return False


def thumb_from_dicom_series(folder: Path, out_path: Path) -> bool:
    dcms = sorted(folder.rglob("*.dcm"))
    if not dcms:
        # some series use files without extensions
        dcms = sorted(p for p in folder.rglob("*") if p.is_file())
    if not dcms:
        return False
    # Try middle file first, then walk outward — some files in a series lack
    # pixel data (e.g. presentation states, dose reports).
    n = len(dcms)
    order = [n // 2]
    for offset in range(1, n):
        if n // 2 - offset >= 0:
            order.append(n // 2 - offset)
        if n // 2 + offset < n:
            order.append(n // 2 + offset)
    for idx in order:
        if thumb_from_dicom_file(dcms[idx], out_path):
            return True
    return False


def resolve_source(case_id: str, file_path: str | None) -> tuple[str, Path | None]:
    """Return (kind, path). kind in {'nii', 'dcm_file', 'dcm_series', 'missing'}."""
    fp = (file_path or "").strip()

    # 1) frontend-bundled rows: use hardcoded case_id map → frontend dataset folder
    if fp.startswith("frontend-bundled/"):
        mapped = FRONTEND_BUNDLED_MAP.get(case_id)
        if not mapped:
            return ("missing", None)
        candidate = FRONTEND_DATASET_DIR / mapped
        if candidate.suffix in (".nii", ".gz") or mapped.endswith(".nii.gz"):
            return ("nii", candidate) if candidate.exists() else ("missing", None)
        if candidate.is_dir():
            return ("dcm_series", candidate)
        return ("missing", None)

    # 2) bulk_cases series: backend disk doesn't have them — fall through to
    #    frontend dataset by basename
    if fp.startswith("uploads/organization/bulk_cases/"):
        basename = fp[len("uploads/organization/bulk_cases/"):].strip("/")
        candidate = FRONTEND_DATASET_DIR / basename
        if candidate.is_dir():
            return ("dcm_series", candidate)
        # might be a single file
        if candidate.exists() and candidate.is_file():
            if candidate.name.endswith((".nii", ".nii.gz")):
                return ("nii", candidate)
            return ("dcm_file", candidate)
        return ("missing", None)

    # 3) backend-local NIfTI uploads
    if fp.startswith("nii/"):
        candidate = RADIOLOGIST_DIR / fp
        return ("nii", candidate) if candidate.exists() else ("missing", None)

    # 4) backend-local DICOM single
    if fp.startswith("dicom-file/"):
        candidate = RADIOLOGIST_DIR / "dicom_files" / fp.split("/", 1)[1]
        return ("dcm_file", candidate) if candidate.exists() else ("missing", None)

    # 5) backend-local DICOM series
    if fp.startswith("dicom-series/"):
        candidate = BACKEND_DICOM_SERIES_DIR / fp.split("/", 1)[1]
        return ("dcm_series", candidate) if candidate.is_dir() else ("missing", None)

    # 6) legacy absolute path or unknown — skip
    return ("missing", None)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT scan_id, case_id, scan_type, file_path, thumbnail_path
        FROM radiology_schema.rad_scans
        ORDER BY scan_id
        """
    )
    rows = cur.fetchall()
    print(f"loaded {len(rows)} rows")
    print(f"thumb dir: {THUMB_DIR}")
    print(f"dry-run: {args.dry_run}")
    print()

    done, skipped, failed = 0, 0, 0
    for scan_id, case_id, scan_type, file_path, existing_thumb in rows:
        kind, src = resolve_source(case_id, file_path)
        thumb_name = f"{scan_id}_thumb.png"
        out_path = THUMB_DIR / thumb_name
        print(f"#{scan_id} {case_id} [{scan_type}] {file_path}")
        print(f"   -> {kind}: {src}")
        if kind == "missing" or src is None:
            print("   SKIP (source not found)\n")
            skipped += 1
            continue

        if args.dry_run:
            print("   (dry-run, not generating)\n")
            done += 1
            continue

        ok = False
        if kind == "nii":
            ok = thumb_from_nifti(src, out_path)
        elif kind == "dcm_file":
            ok = thumb_from_dicom_file(src, out_path)
        elif kind == "dcm_series":
            ok = thumb_from_dicom_series(src, out_path)

        if not ok:
            print("   FAILED to generate\n")
            failed += 1
            continue

        cur.execute(
            "UPDATE radiology_schema.rad_scans SET thumbnail_path = %s WHERE scan_id = %s",
            (thumb_name, scan_id),
        )
        conn.commit()
        print(f"   wrote {out_path.name}\n")
        done += 1

    print(f"summary: {done} done, {skipped} skipped, {failed} failed")
    conn.close()


if __name__ == "__main__":
    main()
