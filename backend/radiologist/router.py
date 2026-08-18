# radiology/router.py
import os
from collections import OrderedDict
import re
import json
import base64
import random
from dotenv import load_dotenv
load_dotenv()
from datetime import datetime
from uuid import UUID
from typing import Optional, List, Any, Dict
from auth.dependencies import get_current_user

import os, base64
from datetime import datetime, timezone
from pydantic import BaseModel, Field
from fastapi import Body, HTTPException
from uuid import UUID
import nibabel as nib
import numpy as np
import pydicom
from PIL import Image
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Request, Body
from fastapi import APIRouter, HTTPException, UploadFile, File, Depends
from fastapi.responses import FileResponse, JSONResponse, Response

from . import crud
from .schemas import RadiologistOut, ReportUpsertIn, AnnotationCreateIn, ChatCreateIn , ReportExportIn, ReportExportOut

# ✅ must return psycopg2 connection
from database import get_conn

router = APIRouter(prefix="/radiology", tags=["Radiology"])

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# where you store uploads on disk
NII_DIR = os.path.join(BASE_DIR, "nii")
THUMB_DIR = os.path.join(BASE_DIR, "uploads", "thumbnails")
DICOM_DIR = os.path.join(BASE_DIR, "dicom_series")
DICOM_FILE_DIR = os.path.join(BASE_DIR, "dicom_files")
BULK_CASES_DIR = os.path.join(os.path.dirname(BASE_DIR), "uploads", "organization", "bulk_cases")

os.makedirs(NII_DIR, exist_ok=True)
os.makedirs(THUMB_DIR, exist_ok=True)
os.makedirs(DICOM_DIR, exist_ok=True)
os.makedirs(DICOM_FILE_DIR, exist_ok=True)
os.makedirs(BULK_CASES_DIR, exist_ok=True)

# ✅ Organisation logos folder:
# backend/radiologist/uploads/organisation
BACKEND_DIR = os.path.dirname(BASE_DIR)
ORG_DIR = os.path.join(BACKEND_DIR, "radiologist", "uploads", "organisation")
os.makedirs(ORG_DIR, exist_ok=True)

# ===== Radiologist uploads =====
PROFILE_DIR = os.path.join(BACKEND_DIR, "radiologist", "uploads", "profile")
DEGREE_DIR = os.path.join(BACKEND_DIR, "radiologist", "uploads", "degree")
SIGNATURE_DIR = os.path.join(BACKEND_DIR, "radiologist", "uploads", "signature")
REPORTS_DIR = os.path.join(BACKEND_DIR, "radiologist", "uploads", "reports")

os.makedirs(PROFILE_DIR, exist_ok=True)
os.makedirs(DEGREE_DIR, exist_ok=True)
os.makedirs(SIGNATURE_DIR, exist_ok=True)
os.makedirs(REPORTS_DIR, exist_ok=True)
LOCAL_SCAN_CACHE_PATH = os.path.join(BACKEND_DIR, "radiologist", "uploads", "local_scans.json")


def _load_local_scans() -> List[Dict[str, Any]]:
    if not os.path.exists(LOCAL_SCAN_CACHE_PATH):
        return []
    try:
        with open(LOCAL_SCAN_CACHE_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _save_local_scans(items: List[Dict[str, Any]]) -> None:
    os.makedirs(os.path.dirname(LOCAL_SCAN_CACHE_PATH), exist_ok=True)
    tmp_path = f"{LOCAL_SCAN_CACHE_PATH}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=True, indent=2)
    os.replace(tmp_path, LOCAL_SCAN_CACHE_PATH)


def _append_local_scan(item: Dict[str, Any]) -> None:
    items = _load_local_scans()
    items.append(item)
    # keep cache bounded
    if len(items) > 3000:
        items = items[-3000:]
    _save_local_scans(items)

def safe_email_filename(email: str) -> str:
    email = (email or "").strip().lower()
    keep = []
    for ch in email:
        if ch.isalnum() or ch in (".", "_", "-"):
            keep.append(ch)
        elif ch in ("@", "+"):
            keep.append("_")
        else:
            keep.append("_")
    return "".join(keep) or "user"

def pick_ext(filename: str, default_ext: str) -> str:
    filename = (filename or "").lower()
    for ext in (".png", ".jpg", ".jpeg", ".pdf"):
        if filename.endswith(ext):
            return ext
    return default_ext

def pick_org_logo(seed: str) -> Optional[str]:
    """Pick a logo filename from ORG_DIR in a stable way."""
    try:
        files = [f for f in os.listdir(ORG_DIR) if f.lower().endswith((".png", ".jpg", ".jpeg"))]
        if not files:
            return None
        idx = (sum(ord(c) for c in (seed or "")) % len(files))
        return files[idx]
    except Exception:
        return None


def _is_legacy_absolute_scan_path(path: Optional[str]) -> bool:
    value = str(path or "").strip()
    return value.startswith("/mnt/onix/backend/radiologist/")


def _is_valid_file_path(path: Optional[str]) -> bool:
    """Return False for placeholder values that don't represent real file paths."""
    if not path:
        return False
    fp = str(path).strip()
    # Known placeholder values and anything that doesn't look like a path
    if fp in ("admin-assigned", "pending", ""):
        return False
    return fp.startswith(("uploads/", "dicom-series/", "organization/", "/"))


def _build_public_scan_urls(base: str, file_path: Optional[str], thumb_path: Optional[str], storage_type: Optional[str] = None):
    file_url = None
    thumbnail = None

    # ── S3 files: skip local path logic entirely ──────────────────────────
    # file_url stays None — ScanRepository.js uses s3_key + storage_type
    # to fetch a presigned URL from /api/storage/download-url instead.
    if storage_type == 's3':
        if thumb_path and not _is_legacy_absolute_scan_path(thumb_path):
            thumbnail = f"{base}/uploads/thumbnails/{thumb_path}"
        return file_url, thumbnail

    if file_path:
        fp = str(file_path).strip().replace("\\", "/").rstrip("/")
        if fp.startswith("dicom-series/"):
            series_folder = fp.split("/", 1)[1]
            file_url = f"{base}/api/radiology/dicom-series/{series_folder}/files"
        elif fp.startswith("uploads/organization/bulk_cases/"):
            # DICOM series folder from bulk upload — route to bulk-series endpoint
            subfolder = fp[len("uploads/organization/bulk_cases/"):]
            if subfolder:
                file_url = f"{base}/api/radiology/bulk-series/{subfolder}/files"
        elif fp.startswith("organization/bulk_cases/"):
            # Path stored without leading 'uploads/' prefix
            subfolder = fp[len("organization/bulk_cases/"):]
            if subfolder:
                file_url = f"{base}/api/radiology/bulk-series/{subfolder}/files"
        elif fp.startswith("uploads/"):
            file_url = f"{base}/{fp}"
        elif not _is_legacy_absolute_scan_path(fp):
            file_url = f"{base}/uploads/{fp}"

    if thumb_path and not _is_legacy_absolute_scan_path(thumb_path):
        thumbnail = f"{base}/uploads/thumbnails/{thumb_path}"

    return file_url, thumbnail

def generate_nii_thumbnail(nii_path: str, output_folder: str) -> Optional[str]:
    try:
        img = nib.load(nii_path)
        data = img.get_fdata()
        if len(data.shape) == 4:
            data = data[:, :, :, 0]

        mid_slice = data.shape[2] // 2
        slice_data = np.rot90(data[:, :, mid_slice])

        dmin = float(np.min(slice_data))
        dmax = float(np.max(slice_data))
        if dmax - dmin == 0:
            normalized = slice_data
        else:
            normalized = ((slice_data - dmin) / (dmax - dmin)) * 255.0

        img_obj = Image.fromarray(normalized.astype(np.uint8))

        base_name = os.path.basename(nii_path)
        name_no_ext = base_name.replace(".nii.gz", "").replace(".nii", "")
        thumb_filename = f"{name_no_ext}_thumb.png"
        thumb_path = os.path.join(output_folder, thumb_filename)

        img_obj.save(thumb_path)
        return thumb_filename
    except Exception as e:
        print("Thumbnail error:", e)
        return None


def _dicom_pixel_to_uint8(arr: np.ndarray, ds) -> np.ndarray:
    if arr.ndim == 3:
        arr = arr[arr.shape[0] // 2]
    slope = float(getattr(ds, "RescaleSlope", 1) or 1)
    intercept = float(getattr(ds, "RescaleIntercept", 0) or 0)
    arr = arr.astype(np.float32) * slope + intercept
    lo, hi = float(np.min(arr)), float(np.max(arr))
    if hi - lo == 0:
        return np.zeros_like(arr, dtype=np.uint8)
    return (((arr - lo) / (hi - lo)) * 255.0).astype(np.uint8)


def _save_dicom_thumb_from_path(dcm_path: str, out_path: str) -> bool:
    try:
        ds = pydicom.dcmread(dcm_path, force=True)
        arr_u8 = _dicom_pixel_to_uint8(ds.pixel_array, ds)
        img = Image.fromarray(arr_u8)
        if img.mode not in ("L", "RGB"):
            img = img.convert("L")
        img.thumbnail((384, 384), Image.LANCZOS)
        img.save(out_path, format="PNG", optimize=True)
        return True
    except Exception as e:
        print(f"DICOM thumbnail error for {dcm_path}: {e}")
        return False


def generate_dicom_thumbnail(dcm_path: str, output_folder: str, base_name: str) -> Optional[str]:
    thumb_filename = f"{base_name}_thumb.png"
    out_path = os.path.join(output_folder, thumb_filename)
    return thumb_filename if _save_dicom_thumb_from_path(dcm_path, out_path) else None


def generate_dicom_series_thumbnail(series_dir: str, output_folder: str, base_name: str) -> Optional[str]:
    paths = sorted(Path(series_dir).rglob("*.dcm"))
    if not paths:
        paths = sorted(p for p in Path(series_dir).rglob("*") if p.is_file())
    if not paths:
        return None
    # walk from the middle of the series outward — some files lack pixel data
    n = len(paths)
    order = [n // 2]
    for off in range(1, n):
        if n // 2 - off >= 0:
            order.append(n // 2 - off)
        if n // 2 + off < n:
            order.append(n // 2 + off)
    thumb_filename = f"{base_name}_thumb.png"
    out_path = os.path.join(output_folder, thumb_filename)
    for idx in order:
        if _save_dicom_thumb_from_path(str(paths[idx]), out_path):
            return thumb_filename
    return None


# -----------------------------
# DICOM series helper
# -----------------------------
@router.get("/dicom-series/{series_folder}/files")
def list_dicom_series_files(request: Request, series_folder: str):
    series_path = Path(DICOM_DIR) / series_folder

    if not series_path.exists() or not series_path.is_dir():
        raise HTTPException(status_code=404, detail="Series folder not found")

    dcm_files = sorted(series_path.rglob("*.dcm"))
    base = str(request.base_url).rstrip("/")

    out = []
    for p in dcm_files:
        rel = p.relative_to(series_path).as_posix()
        out.append({
            "name": rel,
            "url": f"{base}/uploads/dicom-series/{series_folder}/{rel}",
        })

    return {"success": True, "count": len(out), "files": out}


@router.api_route("/bulk-series/{case_folder:path}/files", methods=["GET", "HEAD"])
def list_bulk_series_files(request: Request, case_folder: str):
    """List DICOM files from a bulk-upload case folder stored in uploads/organization/bulk_cases/.
    Supports nested folder paths (e.g. org_id/subject_id).
    """
    # Prevent path traversal
    case_folder = case_folder.strip("/")
    series_path = (Path(BULK_CASES_DIR) / case_folder).resolve()
    bulk_root   = Path(BULK_CASES_DIR).resolve()

    # Safety: ensure resolved path stays inside BULK_CASES_DIR
    try:
        series_path.relative_to(bulk_root)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid folder path")

    if not series_path.exists() or not series_path.is_dir():
        # Fallback: search for a matching folder by case_id in rad_scans
        try:
            conn = get_conn()
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT file_path FROM radiology_schema.rad_scans WHERE case_id = %s LIMIT 1",
                    (case_folder,),
                )
                row = cur.fetchone()
            conn.close()
            if row and row[0]:
                fp = str(row[0]).strip().replace("\\", "/").rstrip("/")
                if fp.startswith("uploads/organization/bulk_cases/"):
                    alt_folder = fp[len("uploads/organization/bulk_cases/"):]
                    alt_path = (bulk_root / alt_folder).resolve()
                    try:
                        alt_path.relative_to(bulk_root)
                        if alt_path.exists() and alt_path.is_dir():
                            series_path = alt_path
                            case_folder = alt_folder
                        else:
                            raise HTTPException(status_code=404, detail=f"Bulk series folder not found: {case_folder}")
                    except ValueError:
                        raise HTTPException(status_code=404, detail=f"Bulk series folder not found: {case_folder}")
                else:
                    raise HTTPException(status_code=404, detail=f"Bulk series folder not found: {case_folder}")
            else:
                raise HTTPException(status_code=404, detail=f"Bulk series folder not found: {case_folder}")
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=404, detail=f"Bulk series folder not found: {case_folder}")

    if request.method == "HEAD":
        return Response(status_code=200)

    dcm_files = sorted(series_path.rglob("*.dcm"))
    base = str(request.base_url).rstrip("/")

    out = []
    for p in dcm_files:
        rel = p.relative_to(series_path).as_posix()
        out.append({
            "name": rel,
            "url": f"{base}/api/uploads/organization/bulk_cases/{case_folder}/{rel}",
        })

    return {"success": True, "count": len(out), "files": out}


# -----------------------------
# Upload scan (rad_scans)
# -----------------------------
@router.post("/scans/upload")
async def upload_scan(
    file: Optional[UploadFile] = File(None),
    files: Optional[List[UploadFile]] = File(None),

    case_id: str = Form(...),
    scan_type: str = Form(...),
    patient_name: str = Form(...),
    patient_sex: str = Form(...),
    patient_age: int = Form(...),
    user_id: str = Form(...),

    # optional org details
    ref_organisation: Optional[str] = Form(None),
    id_organisation: Optional[str] = Form(None),
):
    try:
        uid = UUID(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user_id (must be UUID)")

    org_uid: Optional[UUID] = None
    if id_organisation:
        try:
            org_uid = UUID(id_organisation)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid id_organisation (must be UUID)")

    scan_type = scan_type.upper().strip()
    allowed = {"MRI", "CT", "XRAY", "PET", "ULTRASOUND"}
    if scan_type not in allowed:
        raise HTTPException(status_code=400, detail=f"scan_type must be one of {sorted(allowed)}")

    has_series = bool(files) and len(files) > 0
    has_file = file is not None

    if not has_series and not has_file:
        raise HTTPException(status_code=400, detail="Provide 'file' or 'files'")

    saved_file_rel: Optional[str] = None
    thumb_filename: Optional[str] = None

    # 1) DICOM SERIES (folder)
    if has_series:
        series_folder = f"{case_id}_dicom_series"
        series_path = os.path.join(DICOM_DIR, series_folder)
        os.makedirs(series_path, exist_ok=True)

        def safe_relpath(p: str) -> str:
            p = (p or "").replace("\\", "/").lstrip("/")
            parts = [x for x in p.split("/") if x not in ("", ".", "..")]
            return "/".join(parts)

        for up in files:
            rel = safe_relpath(up.filename or "file.dcm").replace(" ", "_")
            dest = os.path.join(series_path, rel)
            os.makedirs(os.path.dirname(dest), exist_ok=True)

            with open(dest, "wb") as f:
                f.write(await up.read())

        saved_file_rel = f"dicom-series/{series_folder}"
        thumb_filename = generate_dicom_series_thumbnail(series_path, THUMB_DIR, case_id)

    # 2) SINGLE FILE (NIfTI or DICOM)
    else:
        filename = (file.filename or "").replace(" ", "_")
        lower = filename.lower()

        # NIfTI
        if lower.endswith(".nii") or lower.endswith(".nii.gz"):
            safe_name = f"{case_id}_{filename}"
            abs_path = os.path.join(NII_DIR, safe_name)

            with open(abs_path, "wb") as f:
                f.write(await file.read())

            thumb_filename = generate_nii_thumbnail(abs_path, THUMB_DIR)
            saved_file_rel = f"nii/{safe_name}"

        # DICOM single file
        elif lower.endswith(".dcm"):
            safe_name = f"{case_id}_{filename}"
            abs_path = os.path.join(DICOM_FILE_DIR, safe_name)

            with open(abs_path, "wb") as f:
                f.write(await file.read())

            thumb_filename = generate_dicom_thumbnail(abs_path, THUMB_DIR, case_id)
            saved_file_rel = f"dicom-file/{safe_name}"

        else:
            raise HTTPException(
                status_code=400,
                detail="Unsupported file type. Use .nii/.nii.gz or .dcm or folder series.",
            )

    # Decide org logo now (if org provided)
    org_logo_url: Optional[str] = None
    seed = str(org_uid or ref_organisation or case_id or "")
    picked = pick_org_logo(seed)
    if picked:
        org_logo_url = f"/uploads/organisation/{picked}"

    # Build file URL for the frontend
    if saved_file_rel and saved_file_rel.startswith("dicom-series/"):
        series_folder = saved_file_rel.split("/", 1)[1]
        file_url = f"/radiology/dicom-series/{series_folder}/files"
    elif saved_file_rel:
        file_url = f"/uploads/{saved_file_rel}"
    else:
        file_url = None

    scan_id: Any = None
    db_error: Optional[str] = None

    try:
        conn = get_conn()
        try:
            crud.ensure_radiologist_row(conn, uid)
            scan_id = crud.create_scan(
                conn=conn,
                case_id=case_id,
                user_id=uid,
                scan_type=scan_type,
                file_path=saved_file_rel,
                thumbnail_path=thumb_filename,
                patient_name=patient_name,
                patient_sex=patient_sex,
                patient_age=patient_age,
                ref_organisation=ref_organisation,
                org_logo_url=org_logo_url,
                id_organisation=org_uid
            )
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
    except Exception as e:
        # DB is optional for segmentation/UI flow; keep upload functional in local mode.
        db_error = str(e)
        scan_id = f"local-{case_id}-{int(datetime.now(timezone.utc).timestamp())}"
        _append_local_scan({
            "scan_id": scan_id,
            "case_id": case_id,
            "user_id": str(uid),
            "scan_type": scan_type,
            "scan_date": datetime.now(timezone.utc).isoformat(),
            "file_path": saved_file_rel,
            "thumbnail_path": thumb_filename,
            "patient_name": patient_name,
            "patient_sex": patient_sex,
            "patient_age": patient_age,
            "ref_organisation": ref_organisation,
            "org_logo_url": org_logo_url,
            "id_organisation": str(org_uid) if org_uid else None,
        })
        print(f"[Radiology] DB unavailable in /scans/upload; using local cache: {db_error}")

    resp = {"success": True, "scan_id": scan_id, "file_url": file_url}
    if db_error:
        resp["mode"] = "local-cache"
        resp["warning"] = "Database unavailable. Scan saved in local cache."
    return resp


# In-memory cache of (decoded pixel array, DICOM header metadata) tuples, keyed by
# s3_key — the S3 fetch+decode is the dominant cost (~3.3s for an 18MB uncompressed DICOM
# vs ~20ms to decode and <1s to encode), so caching means re-opening an image, toggling
# Invert/Sharpen/W-L, or fetching its metadata only re-does cheap work. Nothing written to
# disk or the database — this dies with the process, which is fine, it's just a speed-up.
_scan_preview_cache: "OrderedDict[str, Any]" = OrderedDict()
_SCAN_PREVIEW_CACHE_MAX = 20


def _extract_dicom_meta(ds) -> dict:
    """Header tags for the viewer's burn-in overlay. Patient ID/name/age/sex/body-part
    already come from rad_scans via /scans — this is only the fields that exist solely
    inside the DICOM file itself."""

    def g(tag):
        try:
            v = getattr(ds, tag, None)
            return str(v) if v is not None else None
        except Exception:
            return None

    # PixelSpacing is [row_mm, col_mm] — falls back to ImagerPixelSpacing, which some
    # X-ray/CR equipment populates instead (detector-plane spacing, not patient-plane, but
    # the closest available value when true PixelSpacing is absent).
    def get_pixel_spacing():
        try:
            ps = getattr(ds, "PixelSpacing", None) or getattr(ds, "ImagerPixelSpacing", None)
            if ps and len(ps) >= 2:
                return float(ps[0]), float(ps[1])
        except Exception:
            pass
        return None, None

    row_mm, col_mm = get_pixel_spacing()

    def gi(tag):
        try:
            v = getattr(ds, tag, None)
            return int(v) if v is not None else None
        except Exception:
            return None

    return {
        "pixel_spacing_row_mm": row_mm,
        "pixel_spacing_col_mm": col_mm,
        "rows": gi("Rows"),
        "columns": gi("Columns"),
        "modality": g("Modality"),
        "series_number": g("SeriesNumber"),
        "study_description": g("StudyDescription"),
        "body_part": g("BodyPartExamined"),
        "view_position": g("ViewPosition"),
        "study_date": g("StudyDate"),
        "study_time": g("StudyTime"),
        "institution_name": g("InstitutionName"),
        "institution_address": g("InstitutionAddress"),
        "kvp": g("KVP"),
        "tube_current": g("XRayTubeCurrent"),
        "exposure_time": g("ExposureTime"),
        "exposure_index": g("ExposureIndex"),
        "number_of_frames": g("NumberOfFrames"),
    }


def _get_cached_scan(s3_key: str):
    """Returns (arr, meta) for s3_key, fetching+decoding from S3 (and populating the
    cache) if not already cached. Shared by scan_preview and scan_metadata so both stay in
    sync and only pay the S3/decode cost once per file."""
    import io
    import tempfile
    from s3_storage import s3, S3_BUCKET

    cached = _scan_preview_cache.get(s3_key)
    if cached is not None:
        _scan_preview_cache.move_to_end(s3_key)
        return cached

    try:
        obj = s3.get_object(Bucket=S3_BUCKET, Key=s3_key)
        raw_bytes = obj["Body"].read()
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Could not fetch S3 object: {e}")

    lower_key = s3_key.lower()
    meta: dict = {}
    try:
        if lower_key.endswith(".nii") or lower_key.endswith(".nii.gz"):
            suffix = ".nii.gz" if lower_key.endswith(".nii.gz") else ".nii"
            with tempfile.NamedTemporaryFile(suffix=suffix) as tmp:
                tmp.write(raw_bytes)
                tmp.flush()
                nii_img = nib.load(tmp.name)
                data = nii_img.get_fdata()
            if data.ndim >= 3:
                mid = data.shape[2] // 2
                arr = data[:, :, mid]
            else:
                arr = data
            try:
                zooms = nii_img.header.get_zooms()
                meta = {
                    "pixel_spacing_row_mm": float(zooms[0]) if len(zooms) > 0 else None,
                    "pixel_spacing_col_mm": float(zooms[1]) if len(zooms) > 1 else None,
                    "rows": int(data.shape[0]) if data.ndim >= 1 else None,
                    "columns": int(data.shape[1]) if data.ndim >= 2 else None,
                }
            except Exception:
                pass
        else:
            from dicom_transcode import read_dicom_lenient
            # read_dicom_lenient handles both cases that weren't normalized
            # at ingest time (older upload, or the fix wasn't deployed yet):
            # compressed pixel data, and files missing the DICOM Part 10
            # header entirely (raw dataset stream with no preamble/DICM/
            # file-meta — force=True + a guessed transfer syntax).
            ds, _was_forced = read_dicom_lenient(io.BytesIO(raw_bytes))
            if ds is None:
                raise ValueError("not a readable DICOM file")
            try:
                arr = ds.pixel_array
            except Exception:
                ds.decompress()
                arr = ds.pixel_array
            meta = _extract_dicom_meta(ds)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not decode pixel data: {e}")

    arr = np.asarray(arr).astype(np.float32)
    _scan_preview_cache[s3_key] = (arr, meta)
    _scan_preview_cache.move_to_end(s3_key)
    if len(_scan_preview_cache) > _SCAN_PREVIEW_CACHE_MAX:
        _scan_preview_cache.popitem(last=False)
    return arr, meta


@router.get("/scan-metadata")
def scan_metadata(s3_key: str):
    """Real DICOM header tags (series/study/institution/exposure) for the mobile viewer's
    burn-in overlay — stateless, same cache as scan_preview, nothing persisted."""
    _arr, meta = _get_cached_scan(s3_key)
    return {"success": True, "data": meta}


@router.get("/scan-preview")
def scan_preview(s3_key: str, invert: bool = False, sharpen: bool = False, wl: str = "default"):
    """Fetch an S3-stored DICOM/NIfTI file (or reuse the cached decode), normalize its
    pixel data, and return a PNG directly. wl="bone" applies a narrower, upper-percentile
    window to emphasize high-density structures; invert/sharpen are applied
    client-request-driven, not baked into the cache."""
    import io

    arr, _meta = _get_cached_scan(s3_key)

    if wl == "bone":
        # np.percentile over the full multi-million-pixel array is the slow part of a
        # preset switch — a deterministic strided sample (every 37th pixel, prime stride
        # to avoid any row/column periodicity artifacts) gives a statistically equivalent
        # result in a fraction of the time.
        sample = arr.flat[::37]
        lo, hi = float(np.percentile(sample, 50)), float(np.percentile(sample, 99.5))
    else:
        lo, hi = float(np.min(arr)), float(np.max(arr))
    norm = (
        np.zeros_like(arr, dtype=np.uint8)
        if hi - lo == 0
        else np.clip((arr - lo) / (hi - lo) * 255, 0, 255).astype(np.uint8)
    )
    if invert:
        norm = 255 - norm

    png_img = Image.fromarray(norm)
    # Mobile only ever displays this in a ~320px box — encoding/transferring full native
    # resolution (often 3000px+) wastes time on both ends. Downscale before encoding;
    # thumbnail() only shrinks, never upscales, and preserves aspect ratio.
    png_img.thumbnail((1000, 1000), Image.LANCZOS)
    if sharpen:
        from PIL import ImageFilter

        png_img = png_img.filter(ImageFilter.SHARPEN)
    buf = io.BytesIO()
    png_img.save(buf, format="PNG")
    return Response(content=buf.getvalue(), media_type="image/png")


@router.get("/scans")
def get_scans(request: Request, user_id: Optional[str] = None):
    uid: Optional[UUID] = None
    if user_id:
        try:
            uid = UUID(user_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid user_id (must be UUID)")

    base = str(request.base_url).rstrip("/")
    data = []

    try:
        conn = get_conn()
        try:
            if uid is None:
                # Unauthenticated/legacy callers see the unfiltered list.
                rows = crud.list_scans(conn, None)
            else:
                is_master, rad_id = crud.get_radiologist_master_info(conn, uid)
                rows = crud.list_scans_for_radiologist(
                    conn, is_master=is_master, rad_id=rad_id
                )
        finally:
            conn.close()

        # Pre-fetch bulk_uploads paths for any cases with placeholder file_paths
        case_ids_needing_lookup = [
            row[1] for row in rows
            if not _is_valid_file_path(row[5])
        ]
        bulk_path_map: dict = {}
        if case_ids_needing_lookup:
            try:
                conn2 = get_conn()
                with conn2.cursor() as cur2:
                    cur2.execute(
                        "SELECT case_id, uploaded_images_path FROM organization_schema.bulk_uploads"
                        " WHERE case_id = ANY(%s)",
                        (case_ids_needing_lookup,),
                    )
                    for r in cur2.fetchall():
                        if r[1]:
                            bulk_path_map[r[0]] = str(r[1])
                conn2.close()
            except Exception:
                pass

        for (
            scan_id, case_id, uid_db, scan_type, scan_date,
            file_path, thumb_path,
            patient_name, patient_sex, patient_age,
            ref_organisation, org_logo_url, id_organisation,
            priority_type, status, modality_study_type,
            s3_key, storage_type
        ) in rows:

            # If file_path is a placeholder/invalid, fall back to bulk_uploads path
            if not _is_valid_file_path(file_path) and case_id in bulk_path_map:
                file_path = bulk_path_map[case_id]

            file_url, thumbnail = _build_public_scan_urls(base, file_path, thumb_path, storage_type)

            # If DB has no org_logo_url, generate fallback from folder
            if not org_logo_url:
                seed = str(id_organisation or ref_organisation or case_id or "")
                picked = pick_org_logo(seed)
                if picked:
                    org_logo_url = f"/uploads/organisation/{picked}"

            data.append({
                "scan_id": scan_id,
                "case_id": case_id,
                "user_id": str(uid_db),
                "scan_type": scan_type,
                "scan_date": scan_date.isoformat() if scan_date else None,
                "file_path": file_path,
                "thumbnail_path": thumb_path,
                "file_url": file_url,
                "thumbnail": thumbnail,

                "patient_name": patient_name,
                "patient_sex": patient_sex,
                "patient_age": patient_age,

                "ref_organisation": ref_organisation,
                "org_logo_url": org_logo_url,
                "id_organisation": str(id_organisation) if id_organisation else None,

                "priority": priority_type or "routine",
                "status": status or "pending",
                "study": modality_study_type or scan_type or "",

                # ── S3 storage fields ─────────────────────────────────
                "s3_key": s3_key,
                "storage_type": storage_type or "local",
            })
        return {"success": True, "data": data}
    except Exception as e:
        # Local fallback mode: allows UI/segmentation flow to work without PostgreSQL.
        print(f"[Radiology] DB unavailable in /scans; reading local cache: {e}")
        local_items = _load_local_scans()
        if uid:
            local_items = [x for x in local_items if str(x.get("user_id")) == str(uid)]

        local_items = sorted(local_items, key=lambda x: x.get("scan_date", ""), reverse=True)

        for item in local_items:
            file_path = item.get("file_path")
            thumb_path = item.get("thumbnail_path")
            case_id = item.get("case_id")
            ref_organisation = item.get("ref_organisation")
            id_organisation = item.get("id_organisation")
            org_logo_url = item.get("org_logo_url")

            file_url, thumbnail = _build_public_scan_urls(base, file_path, thumb_path)

            if not org_logo_url:
                seed = str(id_organisation or ref_organisation or case_id or "")
                picked = pick_org_logo(seed)
                if picked:
                    org_logo_url = f"/uploads/organisation/{picked}"

            data.append({
                "scan_id": item.get("scan_id"),
                "case_id": case_id,
                "user_id": str(item.get("user_id") or ""),
                "scan_type": item.get("scan_type"),
                "scan_date": item.get("scan_date") or datetime.now(timezone.utc).isoformat(),
                "file_path": file_path,
                "thumbnail_path": thumb_path,
                "file_url": file_url,
                "thumbnail": thumbnail,
                "patient_name": item.get("patient_name"),
                "patient_sex": item.get("patient_sex"),
                "patient_age": item.get("patient_age"),
                "ref_organisation": ref_organisation,
                "org_logo_url": org_logo_url,
                "id_organisation": id_organisation,
            })

        return {"success": True, "data": data, "mode": "local-cache"}


class AssignScanIn(BaseModel):
    rad_id: str = Field(..., min_length=1)


@router.post("/scans/{case_id}/assign")
def assign_scan(case_id: str, payload: AssignScanIn):
    """Assign the rad_scans row for case_id to the radiologist identified by
    rad_id (sets assigned_rad_id)."""
    rad_id = (payload.rad_id or "").strip()
    if not rad_id:
        raise HTTPException(status_code=400, detail="rad_id is required")

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT user_id FROM radiology_schema.radiologists WHERE rad_id=%s",
                (rad_id,),
            )
            rad_row = cur.fetchone()
            if not rad_row:
                raise HTTPException(status_code=404, detail="rad_id not found")
            rad_user_id = rad_row[0]

        result = crud.assign_scan(conn, case_id, rad_id)
        if result is None:
            raise HTTPException(status_code=404, detail="case_id not found")

        with conn.cursor() as cur:
            _create_notification(
                cur, rad_user_id, case_id,
                "New Case Assigned",
                f"Case {case_id} has been assigned to you",
            )
            conn.commit()

        return {"success": True, "data": result}
    finally:
        conn.close()


# -----------------------------
# Radiologist Profile
# -----------------------------
@router.get("/profile/{user_id}")
def get_radiologist_profile(user_id: str):
    try:
        uid = UUID(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user_id")

    conn = get_conn()
    try:
        crud.ensure_radiologist_row(conn, uid)
        data = crud.get_radiologist(conn, uid)
        return {"success": True, "data": data}
    finally:
        conn.close()


# -----------------------------
# Reports API
# -----------------------------
@router.get("/reports/{case_id}")
def get_or_create_report(case_id: str, user_id: str):
    try:
        uid = UUID(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user_id")

    conn = get_conn()
    try:
        crud.ensure_radiologist_row(conn, uid)
        # If a report already exists, return it. Otherwise try to snapshot from
        # rad_scans; if the case isn't seeded there (e.g. demo worklist cases),
        # still return the current radiologist's profile fields so the report
        # template can render the signature card (name/qualification/signature),
        # rather than a blank "Signature image not found" block.
        existing = crud.get_report(conn, case_id, uid)
        if existing:
            return {"success": True, "data": existing}
        try:
            data = crud.get_or_create_report(conn, case_id, uid)
        except ValueError:
            rad = crud.get_radiologist(conn, uid)
            first = (rad.get("first_name") or "").strip()
            last = (rad.get("last_name") or "").strip()
            # Strip a leading "Dr." / "Dr " from first_name so the prefix
            # doesn't get duplicated when we prepend "Dr." below.
            first_clean = re.sub(r"^(?:dr\.?\s+)+", "", first, flags=re.IGNORECASE).strip()
            name = f"Dr. {first_clean} {last}".strip() if (first_clean or last) else ""
            return {"success": True, "data": {
                "case_id": case_id,
                "user_id": str(uid),
                "radiologist_name": name,
                "qualification": rad.get("qualification") or "",
                "designation": rad.get("designation") or "",
                "signature_path": rad.get("signature_path"),
                "user_lab_name": rad.get("user_lab_name") or "",
                "lab_address": rad.get("lab_address") or "",
                "department": rad.get("department") or "",
                "lab_logo_url": rad.get("lab_logo_url") or "",
                "dmc_no": rad.get("dmc_no") or "",
            }}
        return {"success": True, "data": data or None}
    finally:
        conn.close()


@router.get("/reports/{case_id}/ai-cache")
def get_ai_cache(case_id: str):
    """Return any saved report content for this case, regardless of who saved it.

    Why case_id-only (no user_id): AI reports describe the case itself, not
    the radiologist viewing it. A demo case may have rows saved under multiple
    user_ids — the main GET /reports/{case_id} filters by user_id and would
    miss those rows for other readers.

    Why BOTH ai_* and main columns: in this codebase reports get persisted in
    two shapes depending on the save path:
      - AI auto-save populates ai_technique / ai_findings / etc.
      - Manual save / older flows populate the main technique / findings /
        impression / opinions columns and set status='ai_generated'.
    The cache lookup should serve either layout, with ai_* preferred when
    present (it's the canonical AI content) and main columns as fallback.
    """
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT ai_technique, ai_findings, ai_impression, ai_opinions,
                       technique,    findings,    impression,    opinions,
                       status, case_id, updated_at, user_id
                FROM radiology_schema.reports
                WHERE case_id = %s
                  AND (ai_technique IS NOT NULL
                       OR ai_findings IS NOT NULL
                       OR ai_impression IS NOT NULL
                       OR ai_opinions IS NOT NULL
                       OR technique  IS NOT NULL
                       OR findings   IS NOT NULL
                       OR impression IS NOT NULL
                       OR opinions   IS NOT NULL)
                ORDER BY updated_at DESC NULLS LAST
                LIMIT 1
                """,
                (case_id,),
            )
            row = cur.fetchone()
        if not row:
            return {"success": True, "data": None}

        # Prefer ai_* fields when populated; fall back to main columns.
        ai_t, ai_f, ai_i, ai_o, m_t, m_f, m_i, m_o, status, c_id, updated_at, report_uid = row
        return {
            "success": True,
            "data": {
                "ai_technique":  ai_t or m_t,
                "ai_findings":   ai_f or m_f,
                "ai_impression": ai_i or m_i,
                "ai_opinions":   ai_o or m_o,
                # Also return raw main columns for callers that want them.
                "technique":     m_t,
                "findings":      m_f,
                "impression":    m_i,
                "opinions":      m_o,
                "status":        status,
                "case_id":       c_id,
                "updated_at":    updated_at.isoformat() if updated_at else None,
                # Lets callers (e.g. the org dashboard's report-download fallback)
                # chain into GET /profile/{user_id} for signature_path/qualification/
                # designation — needed to render a real signature image, not just
                # the "Electronically signed by <name>" text line.
                "user_id":       str(report_uid) if report_uid else None,
            },
        }
    finally:
        try: conn.close()
        except Exception: pass


@router.put("/reports/{case_id}")
def upsert_report(case_id: str, payload: ReportUpsertIn = Body(...)):
    import traceback
    try:
        uid = UUID(str(payload.user_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user_id")

    if payload.case_id and payload.case_id != case_id:
        raise HTTPException(status_code=400, detail="case_id mismatch")

    conn = None
    try:
        conn = get_conn()
        crud.ensure_radiologist_row(conn, uid)
        data = crud.upsert_report(
            conn=conn,
            case_id=case_id,
            user_id=uid,
            referring_doctor=payload.referring_doctor,
            scan_datetime_iso=payload.scan_datetime.isoformat() if payload.scan_datetime else None,
            clinical_indication=payload.clinical_indication,
            technique=payload.technique,
            findings=payload.findings,
            impression=payload.impression,
            opinions=payload.opinions,
            ai_technique=payload.ai_technique,
            ai_findings=payload.ai_findings,
            ai_impression=payload.ai_impression,
            ai_opinions=payload.ai_opinions,
            eta_report=payload.eta_report,
        )

        return {"success": True, "data": data}
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        try:
            if conn is not None:
                conn.rollback()
        except Exception:
            pass
        raise HTTPException(
            status_code=500,
            detail=f"upsert_report failed: {type(e).__name__}: {e}",
        )
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass


@router.post("/reports/{case_id}/qc")
def run_report_qc_endpoint(case_id: str, user_id: str):
    """Run report QC validator. Persists qc_status to rad_scans, returns full result."""
    try:
        uid = UUID(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user_id")

    from . import qc_service

    conn = get_conn()
    try:
        try:
            result = qc_service.run_report_qc(conn, case_id, uid)
        except ValueError as ve:
            raise HTTPException(status_code=400, detail=str(ve))
        except FileNotFoundError as fe:
            raise HTTPException(status_code=500, detail=str(fe))
        except RuntimeError as re:
            raise HTTPException(status_code=500, detail=str(re))
        return {"success": True, "data": result}
    finally:
        conn.close()


@router.post("/reports/{case_id}/mark-completed")
def mark_report_completed_endpoint(case_id: str, user_id: str):
    """Finalize report (promote ai_* to main columns), flip case_workflow to
    'completed', and insert a row into admin_schema.case_submission.

    Data sources for case_submission (NO data read from case_workflow):
      - radiology_schema.rad_scans     -> modality/priority/study/org/qc/scan_date/uploader
      - radiology_schema.reports       -> findings/impression/recommendation/report_path/report_text
      - radiology_schema.radiologists  -> radiologist_name/specialization_name/rad_id

    Column mapping rad_scans -> case_submission:
      scan_type           -> modality_type
      priority_type       -> priority_type
      modality_study_type -> study_type
    """
    try:
        uid = UUID(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user_id")

    conn = get_conn()
    try:
        try:
            data = crud.mark_report_completed(conn, case_id, uid)
        except ValueError as ve:
            raise HTTPException(status_code=400, detail=str(ve))

        try:
            import uuid as _uuid_mod
            with conn.cursor() as _cur:
                # -- 1) Radiologist (radiology_schema.radiologists) --
                _cur.execute("""
                    SELECT
                      NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), ''),
                      COALESCE(NULLIF(qualification, ''), NULLIF(designation, ''), ''),
                      rad_id
                    FROM radiology_schema.radiologists
                    WHERE user_id = %s
                    LIMIT 1
                """, (str(uid),))
                _r = _cur.fetchone()
                _rad_name  = _r[0] if _r else None
                _spec_name = _r[1] if _r else None
                _rad_id    = _r[2] if _r else None

                # -- 2) Scan metadata (radiology_schema.rad_scans) --
                _cur.execute("""
                    SELECT
                      scan_type, priority_type, modality_study_type,
                      id_organisation, ref_organisation,
                      qc_status, scan_date,
                      user_id
                    FROM radiology_schema.rad_scans
                    WHERE case_id = %s
                    LIMIT 1
                """, (case_id,))
                _s = _cur.fetchone()
                if _s:
                    (_modality, _priority, _study,
                     _org_id, _org_name,
                     _qc_status, _scan_date,
                     _scan_uploader_id) = _s
                else:
                    _modality = _priority = _study = None
                    _org_id   = _org_name = None
                    _qc_status = None
                    _scan_date = None
                    _scan_uploader_id = None

                # Fallback for org_user_id when scan has no uploader (demo cases).
                _org_user_id = _scan_uploader_id or uid

                # -- 3) Report content (radiology_schema.reports) --
                _cur.execute("""
                    SELECT technique, findings, impression, opinions, report_file_path
                    FROM radiology_schema.reports
                    WHERE case_id = %s AND user_id = %s
                    LIMIT 1
                """, (case_id, str(uid)))
                _rpt = _cur.fetchone()
                if _rpt:
                    _technique, _findings, _impression, _opinions, _report_path = _rpt
                else:
                    _technique = _findings = _impression = _opinions = _report_path = None

                _recommendation = _opinions
                _parts = []
                if _technique:  _parts.append(f"TECHNIQUE:\n{_technique}")
                if _findings:   _parts.append(f"FINDINGS:\n{_findings}")
                if _impression: _parts.append(f"IMPRESSION:\n{_impression}")
                if _opinions:   _parts.append(f"OPINIONS:\n{_opinions}")
                _report_text = "\n\n".join(_parts) if _parts else None

                # -- 4) Turnaround seconds (scan_date -> now) --
                _turnaround = 0
                if _scan_date:
                    _cur.execute(
                        "SELECT GREATEST(0, EXTRACT(EPOCH FROM (NOW() - %s))::int)",
                        (_scan_date,),
                    )
                    _turnaround = _cur.fetchone()[0] or 0

                # -- 5) FK satisfaction only: case_workflow row must exist
                #     (we read ONLY id/workflow_id/upload_id for FK linkage;
                #     no business data is read from case_workflow). --
                _cur.execute("""
                    SELECT id, workflow_id, upload_id
                    FROM admin_schema.case_workflow
                    WHERE case_id = %s
                    ORDER BY created_at DESC NULLS LAST
                    LIMIT 1
                """, (case_id,))
                _cw = _cur.fetchone()
                if _cw and _cw[0] is not None:
                    _cw_id, _wf_id, _up_id = _cw
                    _wf_id = _wf_id or _uuid_mod.uuid4()
                    _up_id = _up_id or _uuid_mod.uuid4()
                else:
                    # Create a minimal case_workflow row only to satisfy the
                    # case_submission.case_workflow_id NOT NULL + FK constraint.
                    # Values populated from rad_scans + radiologists (NOT from
                    # any case_workflow source).
                    _wf_id = _uuid_mod.uuid4()
                    _up_id = _uuid_mod.uuid4()
                    _cur.execute("""
                        INSERT INTO admin_schema.case_workflow (
                            upload_id, case_id,
                            organization_user_id,
                            organization_name, org_id,
                            radiologist_user_id, radiologist_name,
                            modality_type, priority_type, modality_study_type,
                            current_status, assignment_status,
                            received_at, created_at, updated_at
                        ) VALUES (
                            %s, %s,
                            %s,
                            %s, %s,
                            %s, %s,
                            %s, %s, %s,
                            'completed', 'assigned',
                            NOW(), NOW(), NOW()
                        )
                        RETURNING id
                    """, (
                        str(_up_id), case_id,
                        str(_org_user_id),
                        _org_name, (str(_org_id) if _org_id else None),
                        str(uid), _rad_name,
                        _modality, _priority, _study,
                    ))
                    _cw_id = _cur.fetchone()[0]
                    print(f"[case_submission] created case_workflow id={_cw_id} for {case_id}")

                # -- 6) INSERT into case_submission --
                _cur.execute("""
                    INSERT INTO admin_schema.case_submission (
                        case_workflow_id, workflow_id, upload_id, case_id,
                        radiologist_user_id, rad_id, org_id,
                        organization_name, radiologist_name, specialization_name,
                        modality_type, priority_type, study_type,
                        findings, impression, recommendation,
                        report_text, report_path,
                        qc_status, turnaround_seconds,
                        submitted_status, final_status,
                        submitted_at, completed_at, created_at, updated_at
                    ) VALUES (
                        %s, %s, %s, %s,
                        %s, %s, %s,
                        %s, %s, %s,
                        %s, %s, %s,
                        %s, %s, %s,
                        %s, %s,
                        %s, %s,
                        'submitted', 'submitted',
                        NOW(), NOW(), NOW(), NOW()
                    )
                """, (
                    _cw_id, str(_wf_id), str(_up_id), case_id,
                    str(uid), _rad_id, (str(_org_id) if _org_id else None),
                    _org_name, _rad_name, _spec_name,
                    _modality, _priority, _study,
                    _findings, _impression, _recommendation,
                    _report_text, _report_path,
                    _qc_status, _turnaround,
                ))
            conn.commit()
            print(f"[case_submission] inserted row for case {case_id}")
        except Exception as _sub_err:
            conn.rollback()
            print(f"[case_submission] ERROR: {_sub_err}")

        return {"success": True, "data": data}
    finally:
        conn.close()


class ReportExportIn(BaseModel):

    report_format: str = "pdf"
    file_base64: str

@router.post("/reports/{case_id}/export")
def export_report(case_id: str, user_id: str, payload: ReportExportIn = Body(...)):
    try:
        uid = UUID(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user_id")

    # decode base64 pdf
    try:
        pdf_bytes = base64.b64decode(payload.file_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid file_base64")

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{case_id}__{uid}__{ts}.pdf"
    abs_path = os.path.join(REPORTS_DIR, filename)

    with open(abs_path, "wb") as f:
        f.write(pdf_bytes)

    # ✅ This should match your StaticFiles mount
    report_file_path = f"/uploads/reports/{filename}"

    conn = get_conn()
    try:
        data = crud.save_report_export(
            conn=conn,
            case_id=case_id,
            user_id=uid,
           
            report_file_path=report_file_path,
            report_format="pdf",
        )
        return {"success": True, "data": data}
    finally:
        conn.close()



# -----------------------------
# Report Version History
# -----------------------------
class ReportVersionIn(BaseModel):
    html: str
    label: Optional[str] = None
    user_id: Optional[str] = None


@router.get("/reports/{case_id}/versions")
def list_report_versions(case_id: str, user_id: Optional[str] = None):
    conn = get_conn()
    try:
        cur = conn.cursor()
        if user_id:
            cur.execute(
                """
                SELECT id, case_id, user_id, label, html, created_at
                FROM radiology_schema.report_versions
                WHERE case_id = %s AND user_id = %s
                ORDER BY created_at DESC, id DESC
                LIMIT 100
                """,
                (case_id, user_id),
            )
        else:
            cur.execute(
                """
                SELECT id, case_id, user_id, label, html, created_at
                FROM radiology_schema.report_versions
                WHERE case_id = %s
                ORDER BY created_at DESC, id DESC
                LIMIT 100
                """,
                (case_id,),
            )
        rows = cur.fetchall()
        cur.close()
        data = [
            {
                "id": r[0],
                "case_id": r[1],
                "user_id": r[2],
                "label": r[3],
                "html": r[4],
                "created_at": r[5].isoformat() if r[5] else None,
            }
            for r in rows
        ]
        return {"success": True, "data": data}
    finally:
        conn.close()


@router.delete("/reports/{case_id}/versions/{version_id}")
def delete_report_version(case_id: str, version_id: int):
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "DELETE FROM radiology_schema.report_versions WHERE id = %s AND case_id = %s",
            (version_id, case_id),
        )
        deleted = cur.rowcount
        conn.commit()
        cur.close()
        if not deleted:
            raise HTTPException(status_code=404, detail="Version not found")
        return {"success": True, "data": {"id": version_id}}
    finally:
        conn.close()


@router.post("/reports/{case_id}/versions")
def create_report_version(case_id: str, payload: ReportVersionIn = Body(...)):
    if not payload.html or not payload.html.strip():
        raise HTTPException(status_code=400, detail="html is required")

    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO radiology_schema.report_versions (case_id, user_id, label, html)
            VALUES (%s, %s, %s, %s)
            RETURNING id, created_at
            """,
            (case_id, payload.user_id, payload.label, payload.html),
        )
        new_id, created_at = cur.fetchone()
        conn.commit()
        cur.close()
        return {
            "success": True,
            "data": {
                "id": new_id,
                "case_id": case_id,
                "user_id": payload.user_id,
                "label": payload.label,
                "created_at": created_at.isoformat() if created_at else None,
            },
        }
    finally:
        conn.close()


# -----------------------------
# Annotations API
# -----------------------------
@router.get("/annotations/{case_id}")
def list_annotations(case_id: str, user_id: str):
    # user_id comes from query param: ?user_id=<uuid>
    try:
        _ = UUID(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user_id (must be UUID)")

    conn = get_conn()
    try:
        data = crud.list_annotations(conn, case_id, viewer_user_id=user_id)
        return {"success": True, "data": data}
    finally:
        conn.close()




@router.post("/reports/{case_id}/export", response_model=ReportExportOut)
async def export_report(case_id: str, payload: ReportExportIn, db=Depends(get_conn)):
    """Save the printed/downloaded report file (PDF) + HTML in backend and link it to reports table."""
    if payload.case_id != case_id:
        raise HTTPException(status_code=400, detail="case_id mismatch")

    # Decode base64 (allow data:...;base64, prefix)
    b64 = (payload.file_base64 or "").strip()
    if "," in b64:
        b64 = b64.split(",", 1)[1]
    try:
        file_bytes = base64.b64decode(b64, validate=True)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64")

    ts = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    safe_uid = str(payload.user_id).replace("-", "")
    filename = f"{case_id}_{safe_uid}_{ts}.pdf"
    abs_path = os.path.join(REPORTS_DIR, filename)
    with open(abs_path, "wb") as f:
        f.write(file_bytes)

    report_file_url = f"/uploads/reports/{filename}"

    res = crud.save_report_export(
        db,
        case_id=case_id,
        user_id=payload.user_id,
       
        report_format=payload.report_format,
        report_file_path=report_file_url,
    )

    return {
        "case_id": case_id,
        "user_id": payload.user_id,
        "report_file_url": report_file_url,
        "exported_at": datetime.utcnow(),
    }

@router.post("/annotations")
def create_annotation(payload: AnnotationCreateIn = Body(...)):
    try:
        uid = UUID(str(payload.user_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user_id")

    conn = get_conn()
    try:
        crud.ensure_radiologist_row(conn, uid)
        data = crud.create_annotation(
            conn=conn,
            case_id=payload.case_id,
            user_id=uid,
            annotation_type=payload.annotation_type,
            visibility=payload.visibility,
            title=payload.title,
            comments=payload.comments,
            tool_data=payload.tool_data,
        )
        return {"success": True, "data": data}
    finally:
        conn.close()


@router.delete("/annotations/{annotation_id}")
def delete_annotation(annotation_id: str):
    try:
        ann_id = UUID(annotation_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid annotation_id")

    conn = get_conn()
    try:
        crud.delete_annotation(conn, ann_id)
        return {"success": True}
    finally:
        conn.close()


# -----------------------------
# Live Chat API
# -----------------------------
@router.get("/chat/{case_id}")
def list_chat(case_id: str, limit: int = 200):
    conn = get_conn()
    try:
        data = crud.list_chat(conn, case_id, limit=limit)
        return {"success": True, "data": data}
    finally:
        conn.close()


@router.post("/chat")
def create_chat(payload: ChatCreateIn = Body(...)):
    try:
        uid = UUID(str(payload.user_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user_id")

    conn = get_conn()
    try:
        crud.ensure_radiologist_row(conn, uid)
        data = crud.create_chat_message(conn, payload.case_id, uid, payload.message)
        return {"success": True, "data": data}
    finally:
        conn.close()




@router.delete("/chat/{chat_id}")
def delete_chat(chat_id: str, user_id: str):
    """Soft-delete a chat message (only owner can delete)."""
    try:
        cid = UUID(chat_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid chat_id")

    try:
        uid = UUID(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user_id")

    conn = get_conn()
    try:
        ok = crud.delete_chat_message(conn, cid, uid)
        if not ok:
            raise HTTPException(status_code=404, detail="Chat message not found (or not owned by user)")
        return {"success": True}
    finally:
        conn.close()


# -----------------------------
# AI Analysis (LLaVA via Hugging Face Inference API)
# -----------------------------
from huggingface_hub import InferenceClient as HFInferenceClient
from dotenv import load_dotenv
import httpx

# Load AI-specific env
AI_ENV_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "ai", ".env")
if not os.path.exists(AI_ENV_PATH):
    AI_ENV_PATH = os.path.join(os.path.dirname(__file__), "..", "ai", ".env")
load_dotenv(AI_ENV_PATH, override=True)

HF_VISION_MODEL = os.getenv("HF_VISION_MODEL", "google/gemma-3-27b-it")
LLAVA_RAD_URL = os.getenv("LLAVA_RAD_URL", "http://100.88.115.54:11436")
CTCLIP_URL = os.getenv("CTCLIP_URL", "http://100.88.115.54:11435")
MEDGEMMA_URL = os.getenv("MEDGEMMA_URL", "http://100.88.115.54:11437")

class AIAnalyzeIn(BaseModel):
    image_base64: str = Field(..., description="Base64-encoded PNG image from viewport")
    prompt: str = Field(..., min_length=1, description="User question or instruction")
    case_id: Optional[str] = None
    mode: Optional[str] = "chat"  # "chat" or "report"
    model: Optional[str] = "gemma"  # "gemma" or "llava"

class AIReportIn(BaseModel):
    image_base64: str = Field(..., description="Base64-encoded PNG image from viewport")
    case_id: Optional[str] = None
    patient_name: Optional[str] = None
    modality: Optional[str] = None
    study: Optional[str] = None
    model: Optional[str] = "gemma"  # "gemma" or "llava"


def _call_gemma_model(image_base64: str, prompt: str, max_tokens: int = 1024) -> str:
    """Call Gemma vision model via Hugging Face Inference API."""
    hf_token = os.getenv("HF_API_TOKEN")
    if not hf_token:
        raise HTTPException(status_code=500, detail="HF_API_TOKEN not configured in .env")

    client = HFInferenceClient(api_key=hf_token)

    result = client.chat_completion(
        model=HF_VISION_MODEL,
        messages=[{
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image_base64}"}},
            ],
        }],
        max_tokens=max_tokens,
    )

    return result.choices[0].message.content


async def _call_llava_model(image_base64: str, prompt: str, max_tokens: int = 512) -> str:
    """Call MedGemma multimodal on GPU server."""
    payload = {"prompt": prompt, "max_tokens": max_tokens}
    if image_base64:
        payload["image_base64"] = image_base64
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(f"{MEDGEMMA_URL}/api/generate", json=payload)
        resp.raise_for_status()
        result = resp.json()
        return result.get("response", "")


def _call_vision_model(image_base64: str, prompt: str, max_tokens: int = 1024) -> str:
    """Call Gemma vision model (backward compatible)."""
    return _call_gemma_model(image_base64, prompt, max_tokens)


@router.get("/ai/chat-history/{case_id}")
def ai_chat_history(case_id: str, limit: int = 200, user=Depends(get_current_user)):
    """Return persisted AI chat turns for the case (Ask onix.ai panel)."""
    conn = get_conn()
    try:
        data = crud.list_ai_chat(conn, case_id, limit=limit)
        return {"success": True, "data": data}
    finally:
        conn.close()


@router.post("/ai/analyze")
async def ai_analyze(payload: AIAnalyzeIn = Body(...), user=Depends(get_current_user)):
    """Send viewport image + prompt to vision AI. Supports Gemma and LLaVA models."""
    system_prompt = (
        "You are a radiology AI assistant. You analyze medical images (X-ray, CT, MRI, Ultrasound) "
        "and provide professional observations. Always note that your analysis is for educational/assistive "
        "purposes and should not replace a qualified radiologist's diagnosis."
    )

    full_prompt = f"{system_prompt}\n\nUser: {payload.prompt}"

    try:
        if payload.model == "llava":
            result = await _call_llava_model(payload.image_base64, full_prompt)
        else:
            result = _call_gemma_model(payload.image_base64, full_prompt, max_tokens=1024)

        # Persist both turns to radiology_schema.ai_chat (only when we have a user + case).
        uid_raw = user.get("user_id") if isinstance(user, dict) else None
        try:
            uid = UUID(str(uid_raw)) if uid_raw else None
        except Exception:
            uid = None

        if uid and payload.case_id:
            conn = get_conn()
            try:
                crud.ensure_radiologist_row(conn, uid)
                crud.create_ai_chat(
                    conn=conn,
                    case_id=payload.case_id,
                    user_id=uid,
                    chatted_by="user",
                    chat_text=payload.prompt,
                    model=payload.model,
                )
                crud.create_ai_chat(
                    conn=conn,
                    case_id=payload.case_id,
                    user_id=uid,
                    chatted_by="ai",
                    chat_text=result,
                    model=payload.model,
                )
            except Exception as persist_err:
                print(f"[ai/analyze] persist failed: {persist_err}")
            finally:
                conn.close()

        return {"success": True, "response": result}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Vision AI error ({payload.model}): {e}")
        raise HTTPException(status_code=500, detail=f"AI analysis failed: {str(e)}")


@router.post("/ai/report")
async def ai_generate_report(payload: AIReportIn = Body(...)):
    """Generate a structured radiology report from viewport image. Supports Gemma and LLaVA models."""
    report_prompt = (
        "You are an expert radiology AI assistant. Analyze this medical image and generate a structured "
        "radiology report with the following sections:\n\n"
        "1. **TECHNIQUE**: Describe the imaging technique/modality used.\n"
        "2. **FINDINGS**: Provide detailed observations about anatomical structures, any abnormalities, "
        "lesions, masses, fractures, or other notable findings.\n"
        "3. **IMPRESSION**: Summarize your key findings and provide a differential diagnosis.\n"
        "4. **RECOMMENDATIONS**: Suggest any follow-up imaging or clinical correlation if needed.\n\n"
        f"Patient: {payload.patient_name or 'N/A'}\n"
        f"Modality: {payload.modality or 'N/A'}\n"
        f"Study: {payload.study or 'N/A'}\n\n"
        "Generate the report now. Note: This is an AI-assisted report for educational purposes."
    )

    try:
        if payload.model == "llava":
            result = await _call_llava_model(payload.image_base64, report_prompt)
        else:
            result = _call_gemma_model(payload.image_base64, report_prompt, max_tokens=2048)
        return {"success": True, "report": result}
    except HTTPException:
        raise
    except Exception as e:
        print(f"AI report generation error ({payload.model}): {e}")
        raise HTTPException(status_code=500, detail=f"Report generation failed: {str(e)}")


# -----------------------------
# CT-CLIP + LLaVA Full Volume Report Generation
# -----------------------------
class AIFullReportIn(BaseModel):
    case_id: Optional[str] = None
    file_url: Optional[str] = None
    patient_name: Optional[str] = None
    modality: Optional[str] = None
    study: Optional[str] = None
    model: Optional[str] = "llava"  # "llava" or "gemma"


@router.post("/ai/full-report")
async def ai_full_volume_report(payload: AIFullReportIn = Body(...)):
    """
    Generate a radiology report from a full 3D CT volume.
    Step 1: Send NIfTI file to CT-CLIP for pathology detection (18 pathologies)
    Step 2: Send CT-CLIP results + viewport image to LLaVA/Gemma to generate text report
    """
    # Find the NIfTI file from file_url or case_id
    nii_file = None

    if payload.file_url:
        url_path = payload.file_url
        # Extract just the filename from any URL format
        filename = url_path.split("/")[-1].split("?")[0]

        if filename.endswith((".nii", ".nii.gz")):
            # Search in nii directory
            candidate = os.path.join(NII_DIR, filename)
            if os.path.exists(candidate):
                nii_file = candidate

            # Search in dataset directory (frontend assets)
            if not nii_file:
                dataset_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "src", "modules", "radiologist", "dataset", "as_uploaded")
                candidate = os.path.join(dataset_dir, filename)
                if os.path.exists(candidate):
                    nii_file = candidate

        if not nii_file and "/uploads/nii/" in url_path:
            fname = url_path.split("/uploads/nii/")[-1]
            candidate = os.path.join(NII_DIR, fname)
            if os.path.exists(candidate):
                nii_file = candidate

    if not nii_file and payload.case_id:
        for f in os.listdir(NII_DIR):
            if f.startswith(payload.case_id) and (f.endswith(".nii") or f.endswith(".nii.gz")):
                nii_file = os.path.join(NII_DIR, f)
                break

    # Search nii dir by partial filename match
    if not nii_file and payload.file_url:
        filename = payload.file_url.split("/")[-1].split("?")[0]
        base = filename.replace(".nii.gz", "").replace(".nii", "")
        for f in os.listdir(NII_DIR):
            if base in f and (f.endswith(".nii") or f.endswith(".nii.gz")):
                nii_file = os.path.join(NII_DIR, f)
                break

    if not nii_file:
        raise HTTPException(404, f"NIfTI file not found. file_url={payload.file_url}, case_id={payload.case_id}")

    # Step 1: Send NIfTI to CT-CLIP server for pathology detection
    try:
        async with httpx.AsyncClient(timeout=300.0) as client:
            with open(nii_file, "rb") as f:
                files = {"file": (os.path.basename(nii_file), f, "application/octet-stream")}
                ctclip_resp = await client.post(f"{CTCLIP_URL}/analyze", files=files)
                ctclip_resp.raise_for_status()
                ctclip_results = ctclip_resp.json()
    except httpx.ConnectError:
        raise HTTPException(503, "Cannot connect to CT-CLIP server. Is it running on the GPU server?")
    except Exception as e:
        raise HTTPException(500, f"CT-CLIP analysis failed: {str(e)}")

    if not ctclip_results.get("success"):
        raise HTTPException(500, "CT-CLIP analysis returned no results")

    detected = ctclip_results.get("detected_pathologies", {})
    all_results = ctclip_results.get("all_results", {})

    # Format CT-CLIP findings for LLaVA
    findings_text = "CT-CLIP 3D Volume Analysis Results:\n\n"
    findings_text += "DETECTED PATHOLOGIES (>50% confidence):\n"
    if detected:
        for pathology, confidence in detected.items():
            findings_text += f"  - {pathology}: {confidence}% confidence\n"
    else:
        findings_text += "  - No significant pathologies detected\n"

    findings_text += "\nALL PATHOLOGY SCORES:\n"
    for pathology, confidence in all_results.items():
        findings_text += f"  - {pathology}: {confidence}%\n"

    # Step 2: Send findings to LLaVA/Gemma to generate structured report
    detected_list = "\n".join([f"- {k} ({v}% confidence)" for k, v in detected.items()])
    absent_high = {k: v for k, v in all_results.items() if 40 <= v < 50}
    borderline_list = "\n".join([f"- {k} ({v}%)" for k, v in absent_high.items()]) if absent_high else "None"

    report_prompt = f"""You are an expert radiologist writing a clinical radiology report.

An AI system (CT-CLIP) has analyzed a full 3D CT volume and detected the following pathologies:

DETECTED (above 50% confidence):
{detected_list if detected else "No significant pathologies detected."}

BORDERLINE (40-50% confidence, worth noting):
{borderline_list}

Patient: {payload.patient_name or 'N/A'}
Modality: {payload.modality or 'CT'}
Study: {payload.study or 'N/A'}

Now write a professional radiology report with exactly these 4 sections. Do NOT repeat the raw scores. Instead, interpret them clinically:

TECHNIQUE:
Write 1-2 sentences describing the CT imaging technique used.

FINDINGS:
For each detected pathology, write a clinical description. Explain what it means anatomically. If multiple findings are related, group them together.

IMPRESSION:
Summarize the 2-3 most important findings. Provide differential diagnosis where appropriate.

RECOMMENDATIONS:
Suggest clinical follow-up or additional imaging if warranted.

Write the report now. Be concise and professional."""

    try:
        if payload.model == "llava":
            report_text = await _call_llava_model("", report_prompt)
        else:
            report_text = _call_gemma_model("", report_prompt, max_tokens=2048)
    except Exception as e:
        # If LLaVA/Gemma fails, return CT-CLIP results as plain text
        report_text = findings_text

    return {
        "success": True,
        "report": report_text,
        "ctclip_results": all_results,
        "detected_pathologies": detected,
    }


# -----------------------------
# LLaVA-Rad Slice-by-Slice Volume Report
# -----------------------------
class AIVolumeReportIn(BaseModel):
    case_id: Optional[str] = None
    file_url: Optional[str] = None
    patient_name: Optional[str] = None
    modality: Optional[str] = None
    study: Optional[str] = None
    slice_step: int = 5  # every Nth slice
    max_slices: int = 60  # max slices to analyze (20 per plane)


@router.post("/ai/volume-report")
async def ai_volume_report(payload: AIVolumeReportIn = Body(...)):
    """
    Generate a radiology report from a 3D NIfTI volume using slice-by-slice LLaVA-Rad analysis.
    Step 1: Load NIfTI, extract every Nth slice as PNG
    Step 2: Send each slice to LLaVA-Rad in parallel → get findings per slice
    Step 3: Consolidate all findings with Gemma → generate final structured report
    """
    import asyncio
    import io

    # Determine file type: NIfTI or DICOM series
    nii_file = None
    dicom_series_dir = None
    is_dicom = False

    if payload.file_url:
        url_path = payload.file_url

        # Check if it's a DICOM series (URL contains /dicom-series/)
        if "/dicom-series/" in url_path:
            is_dicom = True
            # Extract series folder name from URL
            # e.g., /radiology/dicom-series/CASE-xxx_dicom_series/files
            parts = url_path.split("/dicom-series/")
            if len(parts) > 1:
                folder_name = parts[1].split("/")[0]
                candidate = os.path.join(DICOM_DIR, folder_name)
                if os.path.exists(candidate) and os.path.isdir(candidate):
                    dicom_series_dir = candidate

        # Check if it's a NIfTI file
        elif url_path.endswith((".nii", ".nii.gz")) or "/uploads/nii/" in url_path:
            filename = url_path.split("/")[-1].split("?")[0]
            candidate = os.path.join(NII_DIR, filename)
            if os.path.exists(candidate):
                nii_file = candidate
            elif "/uploads/nii/" in url_path:
                fname = url_path.split("/uploads/nii/")[-1]
                candidate = os.path.join(NII_DIR, fname)
                if os.path.exists(candidate):
                    nii_file = candidate

    # Fallback: search by case_id
    if not nii_file and not dicom_series_dir and payload.case_id:
        # Check NIfTI
        for f in os.listdir(NII_DIR):
            if f.startswith(payload.case_id) and (f.endswith(".nii") or f.endswith(".nii.gz")):
                nii_file = os.path.join(NII_DIR, f)
                break
        # Check DICOM series
        if not nii_file:
            for d in os.listdir(DICOM_DIR):
                if d.startswith(payload.case_id) and os.path.isdir(os.path.join(DICOM_DIR, d)):
                    dicom_series_dir = os.path.join(DICOM_DIR, d)
                    is_dicom = True
                    break

    if not nii_file and not dicom_series_dir:
        raise HTTPException(404, f"No NIfTI or DICOM series found. file_url={payload.file_url}, case_id={payload.case_id}")

    # Step 1: Extract slices as base64 PNGs
    slice_images = []

    if is_dicom and dicom_series_dir:
        # Load DICOM series — build 3D volume, then extract axial/coronal/sagittal
        try:
            import pydicom

            dcm_files = sorted([
                os.path.join(root, f)
                for root, _, files in os.walk(dicom_series_dir)
                for f in files if f.lower().endswith(".dcm")
            ])

            if not dcm_files:
                raise HTTPException(400, "No .dcm files found in series folder")

            # Read all DICOM slices and build 3D volume
            slices = []
            for dcm_path in dcm_files:
                ds = pydicom.dcmread(dcm_path)
                slices.append(ds)

            # Sort by ImagePositionPatient or InstanceNumber
            try:
                slices.sort(key=lambda s: float(s.ImagePositionPatient[2]))
            except Exception:
                try:
                    slices.sort(key=lambda s: int(s.InstanceNumber))
                except Exception:
                    pass

            # Build 3D numpy array
            volume = np.stack([s.pixel_array.astype(np.float32) for s in slices], axis=2)

            # Apply window/level from first slice if available
            ds0 = slices[0]
            if hasattr(ds0, 'WindowCenter') and hasattr(ds0, 'WindowWidth'):
                wc = float(ds0.WindowCenter[0]) if isinstance(ds0.WindowCenter, pydicom.multival.MultiValue) else float(ds0.WindowCenter)
                ww = float(ds0.WindowWidth[0]) if isinstance(ds0.WindowWidth, pydicom.multival.MultiValue) else float(ds0.WindowWidth)
                volume = np.clip(volume, wc - ww / 2, wc + ww / 2)

            # Now extract slices from all 3 planes (same as NIfTI)
            slices_per_plane = payload.max_slices // 3

            def extract_plane_slices(vol_data, axis, plane_name, count):
                dim = vol_data.shape[axis]
                step = max(1, dim // count)
                indices = list(range(0, dim, step))[:count]
                results = []
                for idx in indices:
                    if axis == 2:
                        s = vol_data[:, :, idx]
                    elif axis == 1:
                        s = vol_data[:, idx, :]
                    else:
                        s = vol_data[idx, :, :]
                    s_min, s_max = s.min(), s.max()
                    if s_max > s_min:
                        norm = ((s - s_min) / (s_max - s_min) * 255).astype(np.uint8)
                    else:
                        norm = np.zeros_like(s, dtype=np.uint8)
                    img = Image.fromarray(norm)
                    buf = io.BytesIO()
                    img.save(buf, format="PNG")
                    b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
                    results.append({"index": idx, "plane": plane_name, "base64": b64})
                return results, dim

            axial_slices, axial_total = extract_plane_slices(volume, 2, "Axial", slices_per_plane)
            coronal_slices, coronal_total = extract_plane_slices(volume, 1, "Coronal", slices_per_plane)
            sagittal_slices, sagittal_total = extract_plane_slices(volume, 0, "Sagittal", slices_per_plane)

            slice_images = axial_slices + coronal_slices + sagittal_slices
            total_slices = f"Axial:{axial_total}, Coronal:{coronal_total}, Sagittal:{sagittal_total}"

            print(f"[Volume Report] DICOM series: {len(dcm_files)} files → 3D volume {volume.shape}, analyzing {len(slice_images)} slices (20 per plane)")

        except ImportError:
            raise HTTPException(500, "pydicom is required for DICOM series. Install with: pip install pydicom")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(500, f"Failed to load DICOM series: {str(e)}")

    else:
        # Load NIfTI — extract axial, coronal, and sagittal slices
        try:
            nii = nib.load(nii_file)
            data = nii.get_fdata()

            if len(data.shape) == 4:
                data = data[:, :, :, 0]
            if len(data.shape) != 3:
                raise HTTPException(400, f"Unexpected NIfTI shape: {data.shape}")

            slices_per_plane = payload.max_slices // 3  # 20 per plane

            def extract_plane_slices(vol_data, axis, plane_name, count):
                dim = vol_data.shape[axis]
                step = max(1, dim // count)
                indices = list(range(0, dim, step))[:count]
                results = []
                for idx in indices:
                    if axis == 2:
                        s = vol_data[:, :, idx]
                    elif axis == 1:
                        s = vol_data[:, idx, :]
                    else:
                        s = vol_data[idx, :, :]
                    s_min, s_max = s.min(), s.max()
                    if s_max > s_min:
                        norm = ((s - s_min) / (s_max - s_min) * 255).astype(np.uint8)
                    else:
                        norm = np.zeros_like(s, dtype=np.uint8)
                    img = Image.fromarray(norm)
                    buf = io.BytesIO()
                    img.save(buf, format="PNG")
                    b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
                    results.append({"index": idx, "plane": plane_name, "base64": b64})
                return results, dim

            axial_slices, axial_total = extract_plane_slices(data, 2, "Axial", slices_per_plane)
            coronal_slices, coronal_total = extract_plane_slices(data, 1, "Coronal", slices_per_plane)
            sagittal_slices, sagittal_total = extract_plane_slices(data, 0, "Sagittal", slices_per_plane)

            slice_images = axial_slices + coronal_slices + sagittal_slices
            total_slices = f"Axial:{axial_total}, Coronal:{coronal_total}, Sagittal:{sagittal_total}"

            print(f"[Volume Report] NIfTI: {total_slices}, analyzing {len(slice_images)} slices (20 per plane)")

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(500, f"Failed to load NIfTI: {str(e)}")

    if not slice_images:
        raise HTTPException(400, "No slices could be extracted from the file.")

    # Step 2: Send slices to MedGemma in batches of 5
    BATCH_SIZE = 5

    async def _call_medgemma(prompt: str, image_b64: str = None, max_tokens: int = 512) -> str:
        payload = {"prompt": prompt, "max_tokens": max_tokens}
        if image_b64:
            payload["image_base64"] = image_b64
        async with httpx.AsyncClient(timeout=180.0) as client:
            resp = await client.post(f"{MEDGEMMA_URL}/api/generate", json=payload)
            resp.raise_for_status()
            return resp.json().get("response", "")

    async def analyze_batch(batch, batch_num, total_batches):
        """Analyze a batch of slices — send each to MedGemma but group the results."""
        results = []
        plane = batch[0].get("plane", "Axial")
        indices = [s["index"] for s in batch]
        print(f"[Volume Report] Batch {batch_num}/{total_batches}: {plane} slices {indices}")

        # Create a combined prompt for the batch
        batch_prompt = (
            f"You are a radiologist analyzing a {plane} CT/MRI slice. "
            f"Slice position: {indices[0]}. "
            f"Describe any abnormalities, pathologies, or notable findings. "
            f"If normal, say 'Normal appearance'. "
            f"Be concise — 1-3 sentences only. Use proper radiological terminology."
        )

        for s in batch:
            try:
                result = await _call_medgemma(batch_prompt, image_b64=s["base64"], max_tokens=256)
                results.append({"slice": s["index"], "plane": s.get("plane", "Axial"), "finding": result.strip()})
            except Exception as e:
                results.append({"slice": s["index"], "plane": s.get("plane", "Axial"), "finding": f"Analysis failed: {str(e)}"})
        return results

    # Process in batches of 5
    all_findings = []
    total_batches = (len(slice_images) + BATCH_SIZE - 1) // BATCH_SIZE
    for i in range(0, len(slice_images), BATCH_SIZE):
        batch = slice_images[i:i + BATCH_SIZE]
        batch_num = (i // BATCH_SIZE) + 1
        results = await analyze_batch(batch, batch_num, total_batches)
        all_findings.extend(results)

    print(f"[Volume Report] Got {len(all_findings)} slice findings from {total_batches} batches")

    # Step 3: Consolidate all findings
    # Group by plane
    axial_findings = [f for f in all_findings if f["plane"] == "Axial"]
    coronal_findings = [f for f in all_findings if f["plane"] == "Coronal"]
    sagittal_findings = [f for f in all_findings if f["plane"] == "Sagittal"]

    def format_findings(findings_list):
        return "\n".join([f"  Slice {f['slice']}: {f['finding']}" for f in findings_list])

    findings_text = f"""AXIAL PLANE ({len(axial_findings)} slices):
{format_findings(axial_findings)}

CORONAL PLANE ({len(coronal_findings)} slices):
{format_findings(coronal_findings)}

SAGITTAL PLANE ({len(sagittal_findings)} slices):
{format_findings(sagittal_findings)}"""

    consolidation_prompt = f"""You are an expert radiologist writing a clinical radiology report.

A 3D medical volume was analyzed across all three planes (Axial, Coronal, Sagittal) with {len(all_findings)} slices total.
Here are the findings organized by plane:

{findings_text}

Patient: {payload.patient_name or 'N/A'}
Modality: {payload.modality or 'N/A'}
Study: {payload.study or 'N/A'}

Based on these multi-planar findings, write a professional radiology report with these sections:

TECHNIQUE:
Describe the imaging technique and that multi-planar reconstruction was reviewed.

FINDINGS:
Consolidate findings from all three planes. Cross-reference axial, coronal, and sagittal findings to provide accurate anatomical descriptions. Group related findings together. Remove duplicates.

IMPRESSION:
Summarize the 2-3 most important findings with differential diagnosis.

RECOMMENDATIONS:
Suggest clinical follow-up or additional imaging if needed.

Be concise and professional. Do not list individual slice numbers."""

    try:
        # Send middle slice image for better consolidation accuracy
        mid_slice_b64 = slice_images[len(slice_images) // 2]["base64"]
        report_text = await _call_medgemma(consolidation_prompt, image_b64=mid_slice_b64, max_tokens=1024)
    except Exception as e:
        report_text = f"Consolidation failed. Raw findings:\n\n{findings_text}"

    return {
        "success": True,
        "report": report_text,
        "total_slices": total_slices,
        "analyzed_slices": len(all_findings),
        "slice_findings": all_findings,
    }


# -----------------------------
# MedSAM Segmentation
# -----------------------------

def _label_at_center(binary_img: np.ndarray, cx: int, cy: int):
    """Return the connected component containing (cx,cy), or None."""
    import cv2
    if binary_img[cy, cx] == 0:
        return None
    n, labels, _, _ = cv2.connectedComponentsWithStats(binary_img)
    if n <= 1:
        return None
    lbl = int(labels[cy, cx])
    return (labels == lbl) if lbl != 0 else None


def _prep_gray(roi: np.ndarray):
    """Convert ROI to normalised uint8 greyscale."""
    import cv2
    if roi.ndim == 3:
        gray = cv2.cvtColor(roi, cv2.COLOR_RGB2GRAY)
    else:
        gray = roi.copy()
    gray = gray.astype(np.float32)
    lo, hi = float(gray.min()), float(gray.max())
    if hi > lo:
        return ((gray - lo) / (hi - lo) * 255).astype(np.uint8)
    return np.zeros(gray.shape, dtype=np.uint8)


def _opencv_segment(img_np: np.ndarray, box: list) -> np.ndarray:
    """OpenCV fallback segmentation with multiple methods."""
    import cv2

    H, W = img_np.shape[:2]
    x1, y1 = max(0, int(round(box[0]))), max(0, int(round(box[1])))
    x2, y2 = min(W, int(round(box[2]))), min(H, int(round(box[3])))
    full_mask = np.zeros((H, W), dtype=bool)
    if x2 <= x1 or y2 <= y1:
        return full_mask

    roi_w, roi_h = x2 - x1, y2 - y1
    cx, cy = roi_w // 2, roi_h // 2
    gray = _prep_gray(img_np[y1:y2, x1:x2])

    def _best_component(bin_u8):
        n, labels, stats, centroids = cv2.connectedComponentsWithStats(bin_u8, connectivity=8)
        if n <= 1:
            return None
        best_lbl, best_score = -1, -1.0
        for lbl in range(1, n):
            area = stats[lbl, cv2.CC_STAT_AREA]
            if area < max(20, roi_w * roi_h * 0.005):
                continue
            dist = float(np.hypot(centroids[lbl, 0] - cx, centroids[lbl, 1] - cy))
            diag = float(np.hypot(roi_w, roi_h)) or 1.0
            score = area / (roi_w * roi_h) - 0.5 * dist / diag
            if score > best_score:
                best_score = score; best_lbl = lbl
        return None if best_lbl < 0 else (labels == best_lbl).astype(bool)

    # Method 1: GrabCut
    try:
        if img_np.ndim == 2:
            img_bgr = cv2.cvtColor(img_np, cv2.COLOR_GRAY2BGR)
        elif img_np.shape[2] == 4:
            img_bgr = cv2.cvtColor(img_np, cv2.COLOR_RGBA2BGR)
        else:
            img_bgr = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)
        img_bgr = cv2.bilateralFilter(img_bgr, d=9, sigmaColor=55, sigmaSpace=55)
        lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)
        clahe_gc = cv2.createCLAHE(clipLimit=4.0, tileGridSize=(6, 6))
        lab[:, :, 0] = clahe_gc.apply(lab[:, :, 0])
        img_bgr = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
        gc_mask = np.zeros(img_bgr.shape[:2], np.uint8)
        bgd_model = np.zeros((1, 65), np.float64)
        fgd_model = np.zeros((1, 65), np.float64)
        cv2.grabCut(img_bgr, gc_mask, (x1, y1, roi_w, roi_h), bgd_model, fgd_model, 7, cv2.GC_INIT_WITH_RECT)
        fg = np.where((gc_mask == cv2.GC_FGD) | (gc_mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
        fg[:y1, :] = 0; fg[y2:, :] = 0; fg[:, :x1] = 0; fg[:, x2:] = 0
        k_gc = max(5, min(17, min(roi_w, roi_h) // 12))
        kel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k_gc, k_gc))
        fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, kel, iterations=3)
        fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, kel, iterations=1)
        cand = _best_component(fg)
        if cand is not None and 0.03 <= float(cand.sum()) / max(1, roi_w * roi_h) <= 0.96:
            return cand
    except Exception as e:
        print(f"[Seg] GrabCut failed: {e}")

    # Method 2: Adaptive region growing
    try:
        sr = max(2, min(5, min(roi_w, roi_h) // 12))
        patch = gray[max(0, cy-sr):cy+sr+1, max(0, cx-sr):cx+sr+1]
        seed_mean = float(patch.mean())
        seed_std = float(patch.std())
        tol = max(15, min(70, int(seed_std * 2.5 + 18)))
        in_range = ((gray >= max(0, int(seed_mean - tol))) & (gray <= min(255, int(seed_mean + tol)))).astype(np.uint8) * 255
        k = max(3, min(13, min(roi_w, roi_h) // 18))
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
        in_range = cv2.morphologyEx(in_range, cv2.MORPH_CLOSE, kernel, iterations=2)
        in_range = cv2.morphologyEx(in_range, cv2.MORPH_OPEN, kernel, iterations=1)
        cand = _best_component(in_range)
        if cand is not None and 0.02 <= float(cand.sum()) / max(1, roi_w * roi_h) <= 0.96:
            full_mask[y1:y2, x1:x2] = cand
            return full_mask
    except Exception as e:
        print(f"[Seg] Region-grow failed: {e}")

    # Method 3: CLAHE + Otsu
    try:
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        for flags in (cv2.THRESH_BINARY + cv2.THRESH_OTSU, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU):
            _, thresh = cv2.threshold(enhanced, 0, 255, flags)
            k3 = max(3, min(13, min(roi_w, roi_h) // 15))
            kernel3 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k3, k3))
            thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel3, iterations=2)
            thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel3, iterations=1)
            cand = _best_component(thresh)
            if cand is not None and 0.02 <= float(cand.sum()) / max(1, roi_w * roi_h) <= 0.96:
                full_mask[y1:y2, x1:x2] = cand
                return full_mask
    except Exception as e:
        print(f"[Seg] Otsu failed: {e}")

    return full_mask


def _mask_to_b64_png(mask: np.ndarray) -> str:
    """Bool (H,W) mask → violet RGBA PNG → base64."""
    import io as _io
    H, W = mask.shape
    rgba = np.zeros((H, W, 4), dtype=np.uint8)
    rgba[mask, 0] = 167
    rgba[mask, 1] = 139
    rgba[mask, 2] = 250
    rgba[mask, 3] = 210
    buf = _io.BytesIO()
    Image.fromarray(rgba, "RGBA").save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


class MedSAMRequest(BaseModel):
    image: str
    box: Optional[List[float]] = None
    polygon: Optional[List[Dict]] = None
    width: int
    height: int


@router.post("/medsam/segment")
async def medsam_segment(req: MedSAMRequest):
    """Proxies to MedSAM server only (no OpenCV fallback)."""

    if not req.box and not req.polygon:
        raise HTTPException(status_code=400, detail="Provide 'box' or 'polygon'")

    if req.polygon and len(req.polygon) >= 2:
        xs = [p["x"] for p in req.polygon]
        ys = [p["y"] for p in req.polygon]
        box = [min(xs), min(ys), max(xs), max(ys)]
    else:
        box = list(req.box)

    if box[2] - box[0] < 2 or box[3] - box[1] < 2:
        raise HTTPException(status_code=400, detail="Bounding box too small")

    medsam_url = os.environ.get("MEDSAM2_URL", "http://100.88.115.54:7860").rstrip("/")
    payload = {
        "image": req.image,
        "box": box,
        "width": req.width,
        "height": req.height,
    }

    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            resp = await client.post(f"{medsam_url}/segment", json=payload)
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=503,
            detail=f"MedSAM server unreachable at {medsam_url}: {str(e)}",
        ) from e

    if not resp.is_success:
        msg = resp.text[:200] if resp.text else "No response body"
        raise HTTPException(
            status_code=503,
            detail=f"MedSAM server error ({resp.status_code}): {msg}",
        )

    try:
        data = resp.json()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Invalid MedSAM response: {str(e)}") from e

    return {
        "mask": data.get("mask"),
        "model": "medsam",
        "score": data.get("score"),
        "pixels": data.get("pixels"),
        "message": data.get("message"),
    }


@router.get("/medsam/health")
async def medsam_health():
    """Check if MedSAM server is running."""
    medsam_url = os.environ.get("MEDSAM2_URL", "http://100.88.115.54:7860")
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{medsam_url}/health")
        return {"onix": "ok", "medsam": resp.json()}
    except Exception:
        return {"onix": "ok", "medsam": "not reachable", "url": medsam_url}


# -----------------------------
# Existing profile upload endpoints (kept)
# -----------------------------
@router.post("/profile/{user_id}/qualification")
def update_qualification(user_id: str, qualification: str = Form(...)):
    try:
        uid = UUID(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user_id")

    q = (qualification or "").strip().upper()
    if q not in ("MBBS", "MD"):
        raise HTTPException(status_code=400, detail="qualification must be MBBS or MD")

    conn = get_conn()
    try:
        crud.ensure_radiologist_row(conn, uid)
        crud.update_qualification(conn, uid, q)
        rad_id = crud.ensure_rad_id(conn, uid)
    finally:
        conn.close()

    return {"success": True, "message": "Qualification updated", "rad_id": rad_id}


@router.post("/profile/{user_id}/save")
def save_radiologist_profile(
    user_id: str,
    qualification: Optional[str] = Form(None),
    dmc_no: Optional[str] = Form(None),
):
    try:
        uid = UUID(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user_id")

    q = (qualification or "MD").strip().upper()
    if q not in ("MBBS", "MD"):
        q = "MD"

    conn = get_conn()
    try:
        crud.ensure_radiologist_row(conn, uid)
        crud.update_qualification(conn, uid, q)
        if dmc_no is not None:
            crud.update_dmc_no(conn, uid, dmc_no.strip())
        rad_id = crud.ensure_rad_id(conn, uid)
        data = crud.get_radiologist(conn, uid)
    finally:
        conn.close()

    return {"success": True, "message": "Profile saved", "rad_id": rad_id, "data": data}


@router.post("/profile/{user_id}/dmc-no")
def update_dmc_no(user_id: str, dmc_no: str = Form(...)):
    try:
        uid = UUID(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user_id")

    conn = get_conn()
    try:
        crud.ensure_radiologist_row(conn, uid)
        crud.update_dmc_no(conn, uid, dmc_no.strip())
        data = crud.get_radiologist(conn, uid)
    finally:
        conn.close()

    return {"success": True, "message": "DMC No updated", "data": data}


@router.post("/profile/{user_id}/designation")
def update_designation_endpoint(user_id: str, designation: str = Form(...)):
    try:
        uid = UUID(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user_id")

    conn = get_conn()
    try:
        crud.ensure_radiologist_row(conn, uid)
        crud.update_designation(conn, uid, designation.strip())
        data = crud.get_radiologist(conn, uid)
    finally:
        conn.close()

    return {"success": True, "message": "Designation updated", "data": data}


@router.post("/profile/{user_id}/upload-photo")
async def upload_profile_photo(user_id: str, file: UploadFile = File(...)):
    try:
        uid = UUID(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user_id")

    conn = get_conn()
    try:
        crud.ensure_radiologist_row(conn, uid)
        email = crud.get_radiologist_email(conn, uid)
        if not email:
            raise HTTPException(status_code=400, detail="Email not found")

        ext = pick_ext(file.filename, ".png")
        fname = f"{safe_email_filename(email)}{ext}"
        abs_path = os.path.join(PROFILE_DIR, fname)

        with open(abs_path, "wb") as f:
            f.write(await file.read())

        rel_path = f"radiologist/profile/{fname}"
        crud.update_profile_image_path(conn, uid, rel_path)
    finally:
        conn.close()

    return {"success": True, "path": rel_path}


@router.post("/profile/{user_id}/upload-degree")
async def upload_degree(user_id: str, file: UploadFile = File(...)):
    try:
        uid = UUID(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user_id")

    conn = get_conn()
    try:
        crud.ensure_radiologist_row(conn, uid)
        email = crud.get_radiologist_email(conn, uid)
        if not email:
            raise HTTPException(status_code=400, detail="Email not found")

        ext = pick_ext(file.filename, ".pdf")
        fname = f"{safe_email_filename(email)}{ext}"
        abs_path = os.path.join(DEGREE_DIR, fname)

        with open(abs_path, "wb") as f:
            f.write(await file.read())

        rel_path = f"radiologist/degree/{fname}"
        crud.update_degree_path(conn, uid, rel_path)
    finally:
        conn.close()

    return {"success": True, "path": rel_path}


@router.post("/profile/{user_id}/upload-signature")
async def upload_signature(user_id: str, file: UploadFile = File(...)):
    try:
        uid = UUID(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user_id")

    conn = get_conn()
    try:
        crud.ensure_radiologist_row(conn, uid)
        email = crud.get_radiologist_email(conn, uid)
        if not email:
            raise HTTPException(status_code=400, detail="Email not found")

        ext = pick_ext(file.filename, ".png")
        fname = f"{safe_email_filename(email)}{ext}"
        abs_path = os.path.join(SIGNATURE_DIR, fname)

        with open(abs_path, "wb") as f:
            f.write(await file.read())

        rel_path = f"radiologist/signature/{fname}"
        crud.update_signature_path(conn, uid, rel_path)
    finally:
        conn.close()

    return {"success": True, "path": rel_path}


# ─────────────────────────────────────────────────────────────────────────────
# Radiologist availability (per-user) — used by Dashboard calendar modal
# ─────────────────────────────────────────────────────────────────────────────
def _ensure_availability_pk(cur):
    """Ensure schema is up-to-date and backfill any NULL name/spec/radiologist_id rows."""
    cur.execute("""
        ALTER TABLE admin_schema.radiologist_availability
        ADD COLUMN IF NOT EXISTS availability_id BIGSERIAL
    """)
    # Backfill radiologist_name, specialization_name, radiologist_id for NULL/empty rows.
    # Source: radiology_schema.radiologists (primary), admin_schema.new_user_radiologist (spec supplement).
    cur.execute("""
        UPDATE admin_schema.radiologist_availability ra
        SET
            radiologist_name = COALESCE(
                NULLIF(TRIM(CONCAT_WS(' ', r.first_name, r.last_name)), ''),
                ra.radiologist_name
            ),
            specialization_name = COALESCE(
                NULLIF(TRIM(COALESCE(
                    NULLIF(TRIM(r.qualification),    ''),
                    NULLIF(TRIM(r.designation),      ''),
                    NULLIF(TRIM(nur.qualification),  ''),
                    NULLIF(TRIM(nur.designation),    '')
                )), ''),
                ra.specialization_name
            ),
            radiologist_id = COALESCE(ra.radiologist_id, r.rad_id)
        FROM radiology_schema.radiologists r
        LEFT JOIN admin_schema.new_user_radiologist nur
               ON nur.user_id = r.user_id::uuid
        WHERE ra.user_id = r.user_id::uuid
          AND (
              ra.radiologist_name    IS NULL OR ra.radiologist_name    = ''
              OR ra.specialization_name IS NULL OR ra.specialization_name = ''
              OR ra.radiologist_id   IS NULL
          )
    """)


def _get_rad_info(cur, uid: UUID):
    """Return (radiologist_name, specialization_name, rad_id) for a user.

    Primary source: radiology_schema.radiologists.
    Spec supplement: admin_schema.new_user_radiologist (qualification/designation).
    If rad_id is NULL, generates and persists one immediately (GENRAD-RAD-XXXXXX).
    """
    rad_id = None
    rad_name = ""
    rad_spec = ""

    # 1. Fetch from radiology_schema.radiologists
    cur.execute("""
        SELECT NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), ''),
               COALESCE(NULLIF(TRIM(qualification), ''), NULLIF(TRIM(designation), ''), ''),
               rad_id
        FROM radiology_schema.radiologists
        WHERE user_id = %s
        LIMIT 1
    """, (str(uid),))
    row = cur.fetchone()
    if row:
        rad_name = row[0] or ""
        rad_spec = row[1] or ""
        rad_id   = row[2]

        # Auto-generate rad_id if missing
        if not rad_id:
            for _ in range(10):
                candidate = f"GENRAD-RAD-{random.randint(100000, 999999)}"
                cur.execute("""
                    UPDATE radiology_schema.radiologists
                    SET rad_id = %s, updated_at = NOW()
                    WHERE user_id = %s AND rad_id IS NULL
                    RETURNING rad_id
                """, (candidate, str(uid)))
                result = cur.fetchone()
                if result:
                    rad_id = result[0]
                    break
                # Another process set it first — read the current value
                cur.execute(
                    "SELECT rad_id FROM radiology_schema.radiologists WHERE user_id = %s",
                    (str(uid),)
                )
                existing = cur.fetchone()
                if existing and existing[0]:
                    rad_id = existing[0]
                    break

    # 2. Supplement spec from admin_schema.new_user_radiologist if still empty
    if not rad_spec:
        cur.execute("""
            SELECT COALESCE(NULLIF(TRIM(qualification), ''), NULLIF(TRIM(designation), ''), '')
            FROM admin_schema.new_user_radiologist
            WHERE user_id = %s
            LIMIT 1
        """, (str(uid),))
        row2 = cur.fetchone()
        if row2 and row2[0]:
            rad_spec = row2[0]

    return rad_name, rad_spec, rad_id


class AvailabilityIn(BaseModel):
    user_id: str              # UUID of the radiologist
    available_date: str       # YYYY-MM-DD
    day_name: Optional[str] = None
    from_time: str            # HH:MM
    to_time: str              # HH:MM
    notes: Optional[str] = None


@router.get("/availability")
def list_availability(user_id: str):
    try:
        uid = UUID(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user_id (must be UUID)")

    conn = get_conn()
    cur = conn.cursor()
    try:
        _ensure_availability_pk(cur)
        conn.commit()
        cur.execute("""
            SELECT availability_id,
                   available_date::text,
                   from_time::text,
                   to_time::text,
                   COALESCE(slot_type, 'regular'),
                   COALESCE(availability_status, 'available'),
                   notes
            FROM admin_schema.radiologist_availability
            WHERE user_id = %s
            ORDER BY available_date, from_time
        """, (str(uid),))
        rows = cur.fetchall()
        data = [{
            "availability_id": r[0],
            "available_date":  r[1],
            "from_time":       r[2],
            "to_time":         r[3],
            "slot_type":       r[4],
            "availability_status": r[5],
            "notes":           r[6] or "",
        } for r in rows]
        return {"success": True, "data": data}
    except Exception as e:
        conn.rollback()
        print(f"[radiology/availability GET] error: {e}")
        return {"success": True, "data": []}
    finally:
        cur.close()
        conn.close()


@router.post("/availability")
def create_availability(payload: AvailabilityIn):
    try:
        uid = UUID(payload.user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user_id (must be UUID)")

    conn = get_conn()
    cur = conn.cursor()
    try:
        _ensure_availability_pk(cur)

        # Overlap check
        cur.execute("""
            SELECT from_time::text, to_time::text
            FROM admin_schema.radiologist_availability
            WHERE user_id = %s AND available_date = %s
              AND from_time < %s::time AND to_time > %s::time
            LIMIT 1
        """, (str(uid), payload.available_date,
              payload.to_time, payload.from_time))
        overlap = cur.fetchone()
        if overlap:
            raise HTTPException(
                status_code=409,
                detail=f"Time slot overlaps with existing slot {overlap[0][:5]}-{overlap[1][:5]}"
            )

        rad_name, rad_spec, rad_id = _get_rad_info(cur, uid)

        # day_name is NOT NULL on the table; derive it if the client didn't send one.
        day_name = payload.day_name
        if not day_name:
            try:
                day_name = datetime.strptime(payload.available_date, "%Y-%m-%d").strftime("%A")
            except Exception:
                day_name = ""

        cur.execute("""
            INSERT INTO admin_schema.radiologist_availability
                (user_id, radiologist_name, specialization_name,
                 available_date, day_name, from_time, to_time,
                 slot_type, availability_status, notes, radiologist_id)
            VALUES (%s, %s, %s, %s, %s, %s::time, %s::time, 'regular', 'available', %s, %s)
            RETURNING availability_id
        """, (str(uid), rad_name, rad_spec,
              payload.available_date, day_name,
              payload.from_time, payload.to_time,
              payload.notes, rad_id))
        new_id = cur.fetchone()[0]
        conn.commit()
        return {"success": True, "data": {"availability_id": new_id}}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        print(f"[radiology/availability POST] error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()


@router.delete("/availability/{availability_id}")
def delete_availability(availability_id: str):
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute(
            "DELETE FROM admin_schema.radiologist_availability WHERE availability_id = %s RETURNING availability_id",
            (availability_id,)
        )
        deleted = cur.fetchone()
        conn.commit()
        if not deleted:
            raise HTTPException(status_code=404, detail="Availability slot not found")
        return {"success": True}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        print(f"[radiology/availability DELETE] error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()


# ─────────────────────────────────────────────────────────────────────────────
# Notifications — fired when a case is assigned to a radiologist
# ─────────────────────────────────────────────────────────────────────────────
def _ensure_notifications_table(cur):
    cur.execute("""
        CREATE TABLE IF NOT EXISTS admin_schema.notifications (
            notification_id BIGSERIAL PRIMARY KEY,
            user_id UUID NOT NULL,
            case_id TEXT,
            type TEXT NOT NULL DEFAULT 'case_assigned',
            title TEXT NOT NULL,
            message TEXT,
            is_read BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)


def _create_notification(cur, user_id, case_id, title, message, ntype="case_assigned"):
    """Best-effort notification insert — never raises, so it can't break the
    assignment flow it's attached to."""
    if not user_id:
        return
    try:
        _ensure_notifications_table(cur)
        cur.execute(
            """
            INSERT INTO admin_schema.notifications (user_id, case_id, type, title, message)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (str(user_id), case_id, ntype, title, message),
        )
    except Exception as e:
        print(f"[notifications] failed to create notification: {e}")


@router.get("/notifications")
def list_notifications(user_id: str, limit: int = 50):
    try:
        uid = UUID(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user_id (must be UUID)")

    conn = get_conn()
    cur = conn.cursor()
    try:
        _ensure_notifications_table(cur)
        conn.commit()
        cur.execute("""
            SELECT notification_id, case_id, type, title, message, is_read, created_at::text
            FROM admin_schema.notifications
            WHERE user_id = %s
            ORDER BY created_at DESC
            LIMIT %s
        """, (str(uid), limit))
        rows = cur.fetchall()
        data = [{
            "notification_id": r[0],
            "case_id":         r[1],
            "type":            r[2],
            "title":           r[3],
            "message":         r[4],
            "is_read":         r[5],
            "created_at":      r[6],
        } for r in rows]
        unread_count = sum(1 for d in data if not d["is_read"])
        return {"success": True, "data": data, "unread_count": unread_count}
    except Exception as e:
        conn.rollback()
        print(f"[radiology/notifications GET] error: {e}")
        return {"success": True, "data": [], "unread_count": 0}
    finally:
        cur.close()
        conn.close()


@router.post("/notifications/{notification_id}/read")
def mark_notification_read(notification_id: int):
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            UPDATE admin_schema.notifications
               SET is_read = TRUE
             WHERE notification_id = %s
            RETURNING notification_id
        """, (notification_id,))
        updated = cur.fetchone()
        conn.commit()
        if not updated:
            raise HTTPException(status_code=404, detail="Notification not found")
        return {"success": True}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()


@router.post("/notifications/read-all")
def mark_all_notifications_read(payload: dict = Body(...)):
    try:
        uid = UUID((payload or {}).get("user_id") or "")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user_id (must be UUID)")

    conn = get_conn()
    cur = conn.cursor()
    try:
        _ensure_notifications_table(cur)
        cur.execute("""
            UPDATE admin_schema.notifications
               SET is_read = TRUE
             WHERE user_id = %s AND is_read = FALSE
        """, (str(uid),))
        conn.commit()
        return {"success": True}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()


@router.post("/notifications/clear-read")
def clear_read_notifications(payload: dict = Body(...)):
    try:
        uid = UUID((payload or {}).get("user_id") or "")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user_id (must be UUID)")

    conn = get_conn()
    cur = conn.cursor()
    try:
        _ensure_notifications_table(cur)
        cur.execute("""
            DELETE FROM admin_schema.notifications
             WHERE user_id = %s AND is_read = TRUE
        """, (str(uid),))
        conn.commit()
        return {"success": True}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()


# ─────────────────────────────────────────────────────────────────────────────
# Dashboard tiles — Scans Completed + Scans Queue (Due today / Upcoming)
# ─────────────────────────────────────────────────────────────────────────────
def _norm_modality(m: Optional[str]) -> str:
    s = (m or "").strip().upper()
    if not s:
        return "OTHER"
    if "CT"   in s: return "CT"
    if "MRI"  in s or s in ("MR",): return "MRI"
    if "XRAY" in s or s in ("X-RAY", "XR", "X RAY"): return "XRAY"
    return "OTHER"


def _norm_priority(p: Optional[str]) -> str:
    u = (p or "").strip().upper()
    if u in ("STAT",): return "stat"
    if u in ("CRITICAL",): return "critical"
    if u in ("URGENT",): return "urgent"
    if u in ("ROUTINE", "REGULAR", ""): return "routine"
    return "routine"


@router.get("/dashboard/scans-completed")
def dashboard_scans_completed(user_id: str):
    try:
        uid = UUID(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user_id")

    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT modality_type, COUNT(*)
            FROM admin_schema.case_workflow
            WHERE radiologist_user_id = %s
              AND current_status IN ('completed', 'submitted')
            GROUP BY modality_type
        """, (str(uid),))

        counts = {"ct": 0, "mri": 0, "xray": 0, "other": 0}
        for modality, cnt in cur.fetchall():
            key = _norm_modality(modality).lower()
            counts[key] = counts.get(key, 0) + int(cnt or 0)

        total = sum(counts.values())
        return {
            "success": True,
            "data": {"total": total, **counts},
        }
    except Exception as e:
        print(f"[radiology/dashboard/scans-completed] error: {e}")
        return {
            "success": True,
            "data": {"total": 0, "ct": 0, "mri": 0, "xray": 0, "other": 0},
        }
    finally:
        cur.close()
        conn.close()


@router.get("/dashboard/scans-queue")
def dashboard_scans_queue(user_id: str):
    try:
        uid = UUID(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user_id")

    conn = get_conn()
    cur = conn.cursor()
    try:
        # Pull all open assignments for this radiologist; bucket in Python.
        cur.execute("""
            SELECT case_id,
                   modality_type,
                   modality_study_type,
                   priority_type,
                   patient_name,
                   assigned_at,
                   created_at,
                   received_at
            FROM admin_schema.case_workflow
            WHERE radiologist_user_id = %s
              AND assignment_status = 'assigned'
              AND COALESCE(current_status, 'pending') NOT IN
                  ('completed', 'submitted', 'rejected', 'cancelled')
            ORDER BY assigned_at ASC NULLS LAST
        """, (str(uid),))
        rows = cur.fetchall()

        today = datetime.utcnow().date()

        def _row_to_item(r):
            (case_id, modality, study_type, priority,
             patient, assigned_at, created_at, received_at) = r
            ref_dt = assigned_at or received_at or created_at
            ref_iso = ref_dt.isoformat() if ref_dt else None
            return {
                "case_id":      case_id,
                "scan_type":    _norm_modality(modality),
                "body_part":    study_type or "—",
                "patient_name": patient or "—",
                "priority_type": _norm_priority(priority),
                "assigned_at":  ref_iso,
                "scan_date":    ref_iso,
                "due_date":     ref_iso,
            }, ref_dt

        def _empty():
            return {"total": 0, "critical": 0, "urgent": 0,
                    "stat": 0, "routine": 0, "items": []}

        due_today = _empty()
        upcoming  = _empty()

        for r in rows:
            item, ref_dt = _row_to_item(r)
            ref_date = ref_dt.date() if ref_dt else today
            bucket = None
            if ref_date <= today:
                bucket = due_today
            elif (ref_date - today).days <= 3:
                bucket = upcoming
            if bucket is None:
                continue
            bucket["items"].append(item)
            bucket["total"] += 1
            p = item["priority_type"]
            if p in bucket:
                bucket[p] += 1

        return {"success": True, "data": {
            "due_today": due_today,
            "upcoming":  upcoming,
        }}
    except Exception as e:
        print(f"[radiology/dashboard/scans-queue] error: {e}")
        return {"success": True, "data": {
            "due_today": {"total": 0, "critical": 0, "urgent": 0,
                          "stat": 0, "routine": 0, "items": []},
            "upcoming":  {"total": 0, "critical": 0, "urgent": 0,
                          "stat": 0, "routine": 0, "items": []},
        }}
    finally:
        cur.close()
        conn.close()


def _update_case_status(case_id: str, user_id: str, new_status: str):
    """Set case_workflow.current_status for a radiologist's assigned case."""
    try:
        uid = UUID(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user_id")

    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            UPDATE admin_schema.case_workflow
               SET current_status = %s,
                   updated_at     = NOW()
             WHERE case_id = %s
               AND radiologist_user_id = %s
               AND assignment_status = 'assigned'
            RETURNING case_id, current_status
            """,
            (new_status, case_id, str(uid)),
        )
        row = cur.fetchone()
        if not row:
            conn.rollback()
            raise HTTPException(
                status_code=404,
                detail="Case not found or not assigned to this radiologist",
            )
        conn.commit()
        return {"case_id": row[0], "current_status": row[1]}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        print(f"[radiology/cases/{case_id}/{new_status}] error: {e}")
        raise HTTPException(status_code=500, detail="Failed to update case status")
    finally:
        cur.close()
        conn.close()


@router.post("/cases/{case_id}/accept")
def accept_case(case_id: str, user_id: str):
    """Radiologist accepts an auto-assigned case; it leaves the pending queue and
    appears in their Repository (current_status='accepted')."""
    data = _update_case_status(case_id, user_id, "accepted")
    return {"success": True, "data": data}


@router.post("/cases/{case_id}/reject")
def reject_case(case_id: str, user_id: str):
    """Radiologist rejects an auto-assigned case (current_status='rejected')."""
    data = _update_case_status(case_id, user_id, "rejected")
    return {"success": True, "data": data}



# === Series-cache endpoints (added for performance) =========================
import os as _os
_SERIES_CACHE_DIR = _os.path.join(BASE_DIR, "uploads", "series_cache")
_os.makedirs(_SERIES_CACHE_DIR, exist_ok=True)
_SERIES_CACHE_CASE_ID_RE = re.compile(r"^[A-Za-z0-9_.\-]{1,80}$")

def _series_cache_path(case_id: str):
    if not _SERIES_CACHE_CASE_ID_RE.match(case_id):
        return None
    return _os.path.join(_SERIES_CACHE_DIR, f"{case_id}.json")

@router.get("/series-cache/{case_id}")
async def get_series_cache(case_id: str):
    """Return cached series-grouping JSON for a case. 404 if not yet parsed."""
    path = _series_cache_path(case_id)
    if not path:
        return JSONResponse({"detail": "invalid case_id"}, status_code=400)
    if not _os.path.exists(path):
        # 204, not 404: a cache miss is expected on first open, and a 404 here
        # is indistinguishable in the console from a genuinely broken route.
        return Response(status_code=204)
    try:
        with open(path, "r") as f:
            return json.load(f)
    except Exception as e:
        return JSONResponse({"detail": f"read failed: {e}"}, status_code=500)

@router.post("/series-cache/{case_id}")
async def save_series_cache(case_id: str, payload: dict = Body(...)):
    """Persist parsed series-grouping JSON for a case so other users skip the parse."""
    path = _series_cache_path(case_id)
    if not path:
        return JSONResponse({"detail": "invalid case_id"}, status_code=400)
    try:
        with open(path, "w") as f:
            json.dump(payload, f)
        return {"ok": True, "bytes": _os.path.getsize(path)}
    except Exception as e:
        return JSONResponse({"detail": f"write failed: {e}"}, status_code=500)
