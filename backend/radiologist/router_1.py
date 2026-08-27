# radiology/router.py
import os
import base64
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
from PIL import Image
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Request, Body
from fastapi import APIRouter, HTTPException, UploadFile, File, Depends


from . import crud
from .schemas import RadiologistOut, ReportUpsertIn, AnnotationCreateIn, ChatCreateIn , ReportExportIn, ReportExportOut

# ✅ must return psycopg2 connection
from database import get_conn

router = APIRouter(prefix="/radiology", tags=["Radiology"])

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# where you store uploads on disk
NII_DIR = os.path.join(BASE_DIR, "nii")
THUMB_DIR = os.path.join(BASE_DIR, "nii_thumbnails")
DICOM_DIR = os.path.join(BASE_DIR, "dicom_series")
DICOM_FILE_DIR = os.path.join(BASE_DIR, "dicom_files")

os.makedirs(NII_DIR, exist_ok=True)
os.makedirs(THUMB_DIR, exist_ok=True)
os.makedirs(DICOM_DIR, exist_ok=True)
os.makedirs(DICOM_FILE_DIR, exist_ok=True)

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
        thumb_filename = None

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

            thumb_filename = None
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
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

    return {"success": True, "scan_id": scan_id}


@router.get("/scans")
def get_scans(request: Request, user_id: Optional[str] = None):
    uid: Optional[UUID] = None
    if user_id:
        try:
            uid = UUID(user_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid user_id (must be UUID)")

    conn = get_conn()
    try:
        rows = crud.list_scans(conn, uid)
    finally:
        conn.close()

    base = str(request.base_url).rstrip("/")

    data = []
    for (
        scan_id, case_id, uid_db, scan_type, scan_date,
        file_path, thumb_path,
        patient_name, patient_sex, patient_age,
        ref_organisation, org_logo_url, id_organisation
    ) in rows:

        if file_path and file_path.startswith("dicom-series/"):
            series_folder = file_path.split("/", 1)[1]
            file_url = f"{base}/radiology/dicom-series/{series_folder}/files"
        else:
            file_url = f"{base}/uploads/{file_path}" if file_path else None

        thumbnail = f"{base}/uploads/thumbnails/{thumb_path}" if thumb_path else None

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
            "scan_date": scan_date.isoformat(),
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
        })

    return {"success": True, "data": data}


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
        data = crud.get_or_create_report(conn, case_id, uid)
        if not data:
            raise HTTPException(status_code=404, detail="Report not found/created")
        return {"success": True, "data": data}
    finally:
        conn.close()


@router.put("/reports/{case_id}")
def upsert_report(case_id: str, payload: ReportUpsertIn = Body(...)):
    try:
        uid = UUID(str(payload.user_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user_id")

    # trust payload.case_id if present, but keep URL param as source of truth
    if payload.case_id and payload.case_id != case_id:
        raise HTTPException(status_code=400, detail="case_id mismatch")

    conn = get_conn()
    try:
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
        )
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
    finally:
        conn.close()

    return {"success": True, "message": "Qualification updated"}


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