# radiology/router.py
import os
import json
import base64
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
from PIL import Image
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Request, Body
from fastapi import APIRouter, HTTPException, UploadFile, File, Depends
from fastapi.responses import FileResponse, JSONResponse

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
            rows = crud.list_scans(conn, uid)
        finally:
            conn.close()

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

            if file_path and str(file_path).startswith("dicom-series/"):
                series_folder = str(file_path).split("/", 1)[1]
                file_url = f"{base}/radiology/dicom-series/{series_folder}/files"
            else:
                file_url = f"{base}/uploads/{file_path}" if file_path else None

            thumbnail = f"{base}/uploads/thumbnails/{thumb_path}" if thumb_path else None

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


@router.post("/ai/analyze")
async def ai_analyze(payload: AIAnalyzeIn = Body(...)):
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

