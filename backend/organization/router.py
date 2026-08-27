import os
import shutil
import uuid
import json
from typing import List, Optional
from uuid import UUID
from datetime import datetime

from fastapi import (
    APIRouter, Depends, HTTPException, UploadFile, File, Form, Body,
    BackgroundTasks, Request,
)
from fastapi.responses import FileResponse

from auth.dependencies import get_current_user

from . import crud
from .schemas import (
    OrganizationProfileIn,
    OrgProfileSaveIn,
    JobRoleCreate,
    QuestionnaireSaveIn,
    CaseUpdateIn,
)

# QC — kicked off as a background task after each upload row is inserted
try:
    from qc.runner import run_qc_for_case
except Exception:
    # Soft fail so the app still starts if the qc package is missing
    def run_qc_for_case(case_meta): pass


# =============================================================================
# ROUTER DECLARATION — must come before any @router decorator
# =============================================================================
router = APIRouter(prefix="/organization", tags=["Organization"])


# =============================================================================
# UPLOAD DIR CONSTANTS  (used by the /uploads endpoints below)
#   uploads/organization/single_cases/<case_id>
#   uploads/organization/bulk_cases/<subject_uuid>
#   uploads/organization/excel_files/<upload_uuid>__<original_name>.xlsx
# =============================================================================
UPLOADS_ROOT = os.environ.get(
    "ONIX_UPLOADS_ROOT",
    os.path.join(os.getcwd(), "uploads", "organization"),
)
BULK_DIR   = os.path.join(UPLOADS_ROOT, "bulk_cases")
SINGLE_DIR = os.path.join(UPLOADS_ROOT, "single_cases")
EXCEL_DIR  = os.path.join(UPLOADS_ROOT, "excel_files")
ORG_PROFILE_DIR = os.path.join(UPLOADS_ROOT, "org_profile")  # ✅ NEW: org logos
os.makedirs(BULK_DIR,        exist_ok=True)
os.makedirs(SINGLE_DIR,      exist_ok=True)
os.makedirs(EXCEL_DIR,       exist_ok=True)
os.makedirs(ORG_PROFILE_DIR, exist_ok=True)


def _gen_case_id() -> str:
    """Generate a unique submission ID: GENRAD-SUB-XXXXXX (6 digits)."""
    import random as _r
    return f"GENRAD-SUB-{_r.randint(100000, 999999)}"


# ✅ NEW: decode base64 data URL ("data:image/png;base64,iVBOR...") to bytes
# + extension. Returns (None, None) for empty / malformed input so callers
# can treat "logo not uploaded" as a no-op.
def _decode_data_url(data_url: str):
    import base64, re
    if not data_url:
        return None, None
    m = re.match(r"^data:image/([a-zA-Z0-9+\-.]+);base64,(.+)$", data_url.strip())
    if not m:
        return None, None
    ext = m.group(1).lower()
    if ext == "jpeg":
        ext = "jpg"
    if ext == "svg+xml":
        ext = "svg"
    try:
        return base64.b64decode(m.group(2)), ext
    except Exception:
        return None, None


def _save_files_to_subject_dir(subject_id: str, files: List[UploadFile],
                                base_dir: str = BULK_DIR):
    subject_dir = os.path.join(base_dir, subject_id)
    os.makedirs(subject_dir, exist_ok=True)

    saved_names: List[str] = []
    for uf in files:
        name = os.path.basename((uf.filename or "").replace("\\", "/"))
        if not name:
            continue
        dest = os.path.join(subject_dir, name)
        with open(dest, "wb") as out:
            shutil.copyfileobj(uf.file, out)
        saved_names.append(name)

    rel = os.path.relpath(subject_dir, os.getcwd()).replace("\\", "/")
    return rel, saved_names


# =============================================================================
# ORGANIZATION PROFILE
# =============================================================================

# ✅ NEW: returns the basic identity (username + email) of the logged-in
# user, read from core_schema.users. The org-setup modal calls this on
# mount to prefill (and lock) the Organization Name + Primary Email fields.
@router.get("/current-user")
def get_current_user_basics(user=Depends(get_current_user)):
    user_id = user.get("user_id")
    if not user_id:
        raise HTTPException(401, "Invalid token payload (user_id missing)")

    row = crud.get_user_basics(UUID(user_id))
    if not row:
        raise HTTPException(404, "User not found in core_schema.users")

    return {
        "ok": True,
        "data": {
            "user_id":  str(row["user_id"]),
            "username": row.get("username") or "",
            "email":    row.get("email") or "",
            "role":     row.get("role") or "",
        },
    }


# ✅ NEW: UPSERT into organization_schema.org_profile. Called by the
# OrgSetupModal "Confirm & Save" button. Forces email + org_name to come
# from core_schema.users (anti-spoof). Decodes the base64 logo (if any)
# and saves it under backend/organization/uploads/org_profile/<email>.<ext>,
# stores the relative path in logo_path.
@router.post("/org-profile")
def save_org_profile(body: OrgProfileSaveIn, user=Depends(get_current_user)):
    user_id = user.get("user_id")
    if not user_id:
        raise HTTPException(401, "Invalid token payload (user_id missing)")

    # Always read authoritative identity from core_schema.users.
    # If the form sent a different orgName/email we ignore it.
    basics = crud.get_user_basics(UUID(user_id))
    if not basics:
        raise HTTPException(404, "User not found in core_schema.users")
    forced_email    = basics.get("email") or ""
    forced_org_name = basics.get("username") or ""

    # Compute the combined address string the same way the UI displays it.
    address_parts = [body.street, body.city, body.state, body.zip, body.country]
    address = ", ".join([p for p in address_parts if p])

    # Logo: decode the base64 data URL and write to disk under
    # uploads/organization/uploads/org_profile/<email>.<ext>. If logo is
    # empty/missing, leave logo_path as None — the CRUD upsert uses COALESCE
    # so an existing path on update is preserved.
    logo_path: Optional[str] = None
    raw, ext = _decode_data_url(body.logo or "")
    if raw and ext and forced_email:
        # sanitise email for filename: keep alnum, @, ., -
        safe_email = "".join(c for c in forced_email if c.isalnum() or c in "@.-_")
        filename   = f"{safe_email}.{ext}"
        disk_path  = os.path.join(ORG_PROFILE_DIR, filename)
        try:
            with open(disk_path, "wb") as f:
                f.write(raw)
            # Relative path used by frontend to fetch via /uploads/...
            logo_path = os.path.relpath(disk_path, os.getcwd()).replace("\\", "/")
        except Exception as e:
            # Don't fail the whole save just because the logo write blew up.
            # Log and continue without updating logo_path.
            import logging
            logging.getLogger(__name__).warning(
                "Failed to write org logo for %s: %s", forced_email, e
            )

    saved = crud.upsert_org_profile(
        user_id=str(user_id),
        email=forced_email,
        org_name=forced_org_name,
        org_type=body.orgType,
        website=body.website,
        logo_path=logo_path,
        contact_number=body.phone,
        address=address,
        org_admin_name=body.adminName,
        org_admin_email=body.adminEmail,
        org_admin_contact=body.adminPhone,
        npi=body.npi,
        ein=body.ein,
        clia=body.clia,
        fax=body.fax,
        street=body.street,
        city=body.city,
        state=body.state,
        zip_code=body.zip,
        country=body.country or "United States",
        admin_role=body.adminRole,
        hipaa_officer_name=body.hipaaOfficerName,
        hipaa_officer_email=body.hipaaOfficerEmail,
    )

    return {"ok": True, "data": saved}


# ✅ NEW: GET helper so the frontend can refetch the saved profile
@router.get("/org-profile")
def fetch_org_profile(user=Depends(get_current_user)):
    user_id = user.get("user_id")
    if not user_id:
        raise HTTPException(401, "Invalid token payload (user_id missing)")
    row = crud.get_org_profile_by_user(UUID(user_id))
    return {"ok": True, "data": row or None}


@router.get("/profile")
def get_profile(user=Depends(get_current_user)):
    user_id = user.get("user_id")
    if not user_id:
        raise HTTPException(401, "Invalid token payload (user_id missing)")

    row = crud.get_organization_by_user(UUID(user_id))
    if not row:
        return {"exists": False, "organization_id": None, "profile": None, "profile_completed": False}

    return {
        "exists": True,
        "organization_id": str(row.get("organization_id")),
        "profile_completed": bool(row.get("profile_completed")),
        "profile": crud.map_organization_row_to_profile(row),
    }


@router.post("/profile/complete")
def complete_profile(user=Depends(get_current_user)):
    user_id = UUID(user["user_id"])
    row = crud.get_organization_by_user(user_id)
    if not row:
        raise HTTPException(404, "Organization not found")

    ok = crud.set_organization_profile_completed(str(row["organization_id"]))
    if not ok:
        raise HTTPException(400, "Unable to complete profile")
    return {"ok": True}


@router.post("/profile")
def upsert_profile(body: OrganizationProfileIn, user=Depends(get_current_user)):
    user_id = user.get("user_id")
    if not user_id:
        raise HTTPException(401, "Invalid token payload (user_id missing)")

    organization_id = crud.upsert_organization_profile(UUID(user_id), body)
    return {"ok": True, "organization_id": organization_id}


# =============================================================================
# RADIOLOGISTS / RECOMMENDATIONS
# =============================================================================
@router.get("/radiologists/{radiologist_id}")
def get_radiologist_details(radiologist_id: str, user=Depends(get_current_user)):
    user_id = UUID(user["user_id"])
    organization = crud.get_organization_by_user(user_id)
    if not organization:
        raise HTTPException(404, "Organization not found")

    row = crud.get_radiologist_full_profile(UUID(radiologist_id))
    if not row:
        raise HTTPException(404, "Radiologist not found")
    return row


@router.get("/roles/{role_id}/recommended-radiologists")
def recommended_radiologists(role_id: str, user=Depends(get_current_user)):
    user_id = UUID(user["user_id"])
    organization = crud.get_organization_by_user(user_id)
    if not organization:
        raise HTTPException(404, "Organization not found")

    items = crud.list_recommended_radiologists_for_role(
        UUID(str(organization["organization_id"])),
        UUID(role_id),
    )
    return {"items": items}


# =============================================================================
# BEHAVIOURAL / JOB TITLES
# =============================================================================
@router.get("/behavioural/questions")
def behavioural_questions(job_id: int, user=Depends(get_current_user)):
    items = crud.get_job_questionnaire(job_id)
    return {"items": items}


@router.get("/job-titles")
def list_job_titles(user=Depends(get_current_user)):
    rows = crud.list_job_titles()
    return {"items": rows}


# =============================================================================
# ROLES
# =============================================================================
@router.post("/roles/{role_id}/lock")
def lock_role(role_id: str, user=Depends(get_current_user)):
    user_id = UUID(user["user_id"])
    organization = crud.get_organization_by_user(user_id)
    if not organization:
        raise HTTPException(404, "Organization not found")

    ok = crud.lock_role(role_id, str(organization["organization_id"]))
    if not ok:
        raise HTTPException(404, "Role not found")
    return {"ok": True}


@router.post("/roles")
def create_role(body: JobRoleCreate, user=Depends(get_current_user)):
    user_id = user.get("user_id")
    if not user_id:
        raise HTTPException(401, "Invalid token payload (user_id missing)")

    organization = crud.get_organization_by_user(UUID(user_id))
    if not organization:
        raise HTTPException(400, "Save Organization Profile first")

    role_id = crud.upsert_role(UUID(str(organization["organization_id"])), body)
    return {"ok": True, "role_id": role_id}


@router.get("/roles")
def get_roles(user=Depends(get_current_user)):
    user_id = user.get("user_id")
    if not user_id:
        raise HTTPException(401, "Invalid token payload (user_id missing)")

    organization = crud.get_organization_by_user(UUID(user_id))
    if not organization:
        return {"roles": []}

    rows = crud.list_roles(UUID(str(organization["organization_id"])))

    return {
        "roles": [
            {
                "role_id": str(r["role_id"]),
                "status": r.get("status"),
                "role_code": r.get("role_code"),

                "jobTitle": r.get("job_title"),
                "department": r.get("department"),
                "roleLevel": r.get("role_level"),
                "employmentType": r.get("employment_type"),
                "workMode": r.get("work_mode"),
                "location": r.get("location"),

                "summary": r.get("summary"),
                "responsibilities": r.get("responsibilities"),
                "requirements": r.get("requirements"),
                "education": r.get("education"),

                "minExp": r.get("min_experience"),
                "maxExp": r.get("max_experience"),

                "primarySkills": r.get("primary_skills") or [],
                "secondarySkills": r.get("secondary_skills") or [],

                "openings": r.get("openings"),
                "urgency": r.get("urgency"),
                "expectedJoining": r.get("expected_joining"),

                "salaryMin": r.get("salary_min"),
                "salaryMax": r.get("salary_max"),
                "currency": r.get("currency"),
                "negotiable": bool(r.get("negotiable")),
                "roleCode": r.get("role_code"),

                "isLocked": bool(r.get("is_locked")),
                "createdAt": str(r.get("created_at")) if r.get("created_at") else None,
            }
            for r in rows
        ]
    }


@router.get("/roles/{role_id}")
def get_role(role_id: str, user=Depends(get_current_user)):
    user_id = UUID(user["user_id"])
    organization = crud.get_organization_by_user(user_id)
    if not organization:
        raise HTTPException(404, "Organization not found")

    row = crud.get_role_by_id(role_id, str(organization["organization_id"]))
    if not row:
        raise HTTPException(404, "Role not found")

    return row


# =============================================================================
# QUESTIONNAIRE
# =============================================================================
@router.get("/questionnaire/answers")
def get_questionnaire_answers(role_id: str, user=Depends(get_current_user)):
    user_id = UUID(user["user_id"])
    organization = crud.get_organization_by_user(user_id)
    if not organization:
        raise HTTPException(404, "Organization not found")

    rows = crud.get_questionnaire_answers(
        UUID(str(organization["organization_id"])),
        UUID(role_id),
    )
    return {"items": rows}


@router.post("/questionnaire")
def save_organization_questionnaire(payload: QuestionnaireSaveIn, user=Depends(get_current_user)):
    user_id = user.get("user_id")
    if not user_id:
        raise HTTPException(401, "Invalid token payload (user_id missing)")

    organization = crud.get_organization_by_user(UUID(user_id))
    if not organization:
        raise HTTPException(400, "Save Organization Profile first")

    try:
        qid = crud.save_questionnaire(UUID(str(organization["organization_id"])), payload)
    except ValueError as e:
        raise HTTPException(404, str(e))

    return {"ok": True, "questionnaire_id": qid, "completed": bool(payload.completed)}


# =============================================================================
# UPLOADS — list / bulk-submit / single-submit / edit / delete / stream file
# =============================================================================

# 1)  LIST ALL CASES FOR THE CURRENT USER
@router.get("/uploads")
def list_uploads(user=Depends(get_current_user)):
    user_id = user.get("user_id")
    if not user_id:
        raise HTTPException(401, "Invalid token payload (user_id missing)")
    items = crud.list_uploads_for_user(UUID(user_id))
    return {"items": items, "count": len(items)}


# 1b) CHECK FOR DUPLICATE CASE IDS   GET /uploads/check-case-ids?ids=C101,C102
#     Used by the frontend before Submit to block duplicates. Considers both
#     the live bulk_uploads table AND the returned_cases history, so a
#     case_id that was already submitted (even if later rejected) is still "taken".
@router.get("/uploads/check-case-ids")
def check_case_ids(ids: str = "", user=Depends(get_current_user)):
    user_id = user.get("user_id")
    if not user_id:
        raise HTTPException(401, "Invalid token payload (user_id missing)")
    id_list = [x.strip() for x in ids.split(",") if x.strip()]
    if not id_list:
        return {"taken": [], "available": []}

    # Use a single query that checks both tables
    from database import get_conn
    from psycopg2.extras import RealDictCursor
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT case_id, 'uploaded' AS source
                  FROM organization_schema.bulk_uploads
                 WHERE user_id = %s AND case_id = ANY(%s)
                UNION
                SELECT case_id, 'returned' AS source
                  FROM organization_schema.returned_cases
                 WHERE user_id = %s AND case_id = ANY(%s)
                """,
                (str(user_id), id_list, str(user_id), id_list),
            )
            rows = cur.fetchall()
    finally:
        conn.close()

    taken_map = {}
    for r in rows:
        taken_map.setdefault(r["case_id"], set()).add(r["source"])
    taken = [
        {"case_id": cid, "sources": sorted(list(srcs))}
        for cid, srcs in taken_map.items()
    ]
    available = [x for x in id_list if x not in taken_map]
    return {"taken": taken, "available": available}


# 2)  BULK SUBMIT  (Excel + all image files in one multipart request)
@router.post("/uploads/bulk-submit")
async def bulk_submit(
    request: Request,
    bg_tasks: BackgroundTasks,
    user=Depends(get_current_user),
):
    user_id = user.get("user_id")
    email   = user.get("email")
    if not user_id:
        raise HTTPException(401, "Invalid token payload (user_id missing)")

    # FastAPI's automatic File(...)/Form(...) parsing calls Starlette's
    # Request.form() with its hardcoded default of max_files=1000 — a large
    # bulk study (e.g. 1000+ slices) hit that ceiling with a raw 400. We parse
    # the multipart form ourselves so we can raise the limit to 5000.
    form = await request.form(max_files=5000, max_fields=5000)
    cases = form.get("cases")
    excel: Optional[UploadFile] = form.get("excel") or None
    files: List[UploadFile] = form.getlist("files")

    try:
        case_list = json.loads(cases)
        assert isinstance(case_list, list) and len(case_list) > 0
    except Exception:
        raise HTTPException(400, "`cases` must be a non-empty JSON array")

    org_profile = crud.get_org_profile_basics(UUID(user_id))
    org_id   = (org_profile or {}).get("org_id")
    org_name = (org_profile or {}).get("org_name")

    upload_id = str(uuid.uuid4())
    excel_rel = None
    if excel is not None:
        excel_name = f"{upload_id}__{os.path.basename(excel.filename)}"
        excel_abs  = os.path.join(EXCEL_DIR, excel_name)
        with open(excel_abs, "wb") as out:
            shutil.copyfileobj(excel.file, out)
        excel_rel = os.path.relpath(excel_abs, os.getcwd()).replace("\\", "/")

    files_by_name = {}
    for uf in files:
        base = os.path.basename((uf.filename or "").replace("\\", "/"))
        if base:
            files_by_name[base] = uf

    generated_ids = []
    for c in case_list:
        # subject_id comes from the Excel sheet; case_id is server-generated.
        subject_id = str(c.get("subject_id") or "").strip() or str(uuid.uuid4())
        case_id    = _gen_case_id()

        subject_dir = os.path.join(BULK_DIR, case_id)
        os.makedirs(subject_dir, exist_ok=True)

        saved_names: List[str] = []
        for fname in (c.get("matched_files") or []):
            uf = files_by_name.get(os.path.basename(fname))
            if uf is None:
                continue
            try:    uf.file.seek(0)
            except Exception: pass
            dest = os.path.join(subject_dir, os.path.basename(fname))
            with open(dest, "wb") as out:
                shutil.copyfileobj(uf.file, out)
            saved_names.append(os.path.basename(fname))

        rel_dir = os.path.relpath(subject_dir, os.getcwd()).replace("\\", "/")

        # Build the full metadata dict; no DB insert here.
        # QC runs first → on pass: qc_cases → bulk_uploads → workflow → rad_scans.
        case_meta = {
            "upload_id":        upload_id,
            "user_id":          user_id,
            "email":            email,
            "org_id":           org_id,
            "org_name":         org_name,
            "excel_path":       excel_rel,
            "case_id":          case_id,
            "subject_id":       subject_id,
            "patient_name":     c.get("patient_name"),
            "age":              int(c["age"]) if c.get("age") not in (None, "") else None,
            "gender":           c.get("gender"),
            "study_date_str":   c.get("study_date"),
            "image_file_names": saved_names,
            "images_dir":       rel_dir,
            "priority_text":    c.get("priority"),
            "modality_text":    c.get("modality"),
            "study_type_text":  c.get("study_type"),
        }
        generated_ids.append(case_id)
        bg_tasks.add_task(run_qc_for_case, case_meta)

    return {
        "ok": True,
        "upload_id": upload_id,
        "inserted": len(generated_ids),
        "ids": generated_ids,
    }


# 3)  SINGLE-PATIENT SUBMIT
@router.post("/uploads/single-submit")
def single_submit(
    bg_tasks: BackgroundTasks,
    subject_id:   Optional[str] = Form(None),   # from the form / Excel
    patient_name: Optional[str] = Form(None),
    age:          Optional[int] = Form(None),
    gender:       Optional[str] = Form(None),
    priority:     Optional[str] = Form(None),
    modality:     Optional[str] = Form(None),
    study_type:   Optional[str] = Form(None),
    study_date:   Optional[str] = Form(None),
    files: List[UploadFile] = File(default=[]),
    user=Depends(get_current_user),
):
    user_id = user.get("user_id")
    email   = user.get("email")
    if not user_id:
        raise HTTPException(401, "Invalid token payload (user_id missing)")

    org_profile = crud.get_org_profile_basics(UUID(user_id))
    org_id   = (org_profile or {}).get("org_id")
    org_name = (org_profile or {}).get("org_name")

    # subject_id comes from the caller (Excel / form); case_id is server-generated.
    subject_id = (subject_id or "").strip() or str(uuid.uuid4())
    case_id    = _gen_case_id()

    upload_id          = str(uuid.uuid4())
    rel_dir, saved     = _save_files_to_subject_dir(case_id, files, base_dir=BULK_DIR)

    case_meta = {
        "upload_id":        upload_id,
        "user_id":          user_id,
        "email":            email,
        "org_id":           org_id,
        "org_name":         org_name,
        "excel_path":       None,
        "case_id":          case_id,
        "subject_id":       subject_id,
        "patient_name":     patient_name,
        "age":              age,
        "gender":           gender,
        "study_date_str":   study_date,
        "image_file_names": saved,
        "images_dir":       rel_dir,
        "priority_text":    priority,
        "modality_text":    modality,
        "study_type_text":  study_type,
    }
    bg_tasks.add_task(run_qc_for_case, case_meta)
    return {"ok": True, "case_id": case_id, "upload_id": upload_id, "images": len(saved)}


# 4)  EDIT  (metadata + remove files)
@router.put("/uploads/{row_id}")
def update_upload(
    row_id: int,
    body: CaseUpdateIn,
    user=Depends(get_current_user),
):
    user_id = user.get("user_id")
    if not user_id:
        raise HTTPException(401, "Invalid token payload")

    existing = crud.get_upload_by_id(row_id, user_id)
    if not existing:
        raise HTTPException(404, "Case not found")

    new_names = list(existing.get("image_file_names") or [])
    if body.removed_files:
        img_dir_rel = existing.get("uploaded_images_path") or ""
        img_dir_abs = os.path.join(os.getcwd(), img_dir_rel)
        for fn in body.removed_files:
            base = os.path.basename(fn)
            if base in new_names:
                new_names.remove(base)
            fpath = os.path.join(img_dir_abs, base)
            if os.path.isfile(fpath):
                try: os.remove(fpath)
                except Exception: pass

    ok = crud.update_upload_row(
        row_id, user_id,
        case_id        = body.case_id,
        patient_name   = body.patient_name,
        age            = body.age,
        gender         = body.gender,
        study_date_str = body.study_date,
        priority_text  = body.priority,
        modality_text  = body.modality,
        study_type_text= body.study_type,
        image_file_names = new_names if body.removed_files else None,
    )
    if not ok:
        raise HTTPException(400, "Update failed")
    return {"ok": True}


# 5)  ADD MORE FILES TO EXISTING CASE (edit modal)
@router.post("/uploads/{row_id}/files")
def add_files_to_case(
    row_id: int,
    files: List[UploadFile] = File(...),
    user=Depends(get_current_user),
):
    user_id = user.get("user_id")
    existing = crud.get_upload_by_id(row_id, user_id)
    if not existing:
        raise HTTPException(404, "Case not found")

    img_dir_rel = existing.get("uploaded_images_path") or ""
    img_dir_abs = os.path.join(os.getcwd(), img_dir_rel)
    os.makedirs(img_dir_abs, exist_ok=True)

    current = list(existing.get("image_file_names") or [])
    for uf in files:
        name = os.path.basename((uf.filename or "").replace("\\", "/"))
        if not name:
            continue
        with open(os.path.join(img_dir_abs, name), "wb") as out:
            shutil.copyfileobj(uf.file, out)
        if name not in current:
            current.append(name)

    crud.update_upload_row(row_id, user_id, image_file_names=current)
    return {"ok": True, "image_file_names": current}


# 6)  DELETE
@router.delete("/uploads/{row_id}")
def delete_upload(row_id: int, user=Depends(get_current_user)):
    user_id = user.get("user_id")
    if not user_id:
        raise HTTPException(401, "Invalid token payload")

    row = crud.delete_upload_row(row_id, user_id)
    if not row:
        raise HTTPException(404, "Case not found")

    img_dir_rel = row.get("uploaded_images_path") or ""
    if img_dir_rel:
        img_dir_abs = os.path.join(os.getcwd(), img_dir_rel)
        if os.path.isdir(img_dir_abs):
            try: shutil.rmtree(img_dir_abs)
            except Exception: pass
    return {"ok": True}


# 7)  STREAM ONE FILE back to the viewer modal
@router.get("/uploads/{row_id}/files/{filename}")
def serve_case_file(row_id: int, filename: str, user=Depends(get_current_user)):
    user_id = user.get("user_id")
    existing = crud.get_upload_by_id(row_id, user_id)
    if not existing:
        raise HTTPException(404, "Case not found")

    img_dir_rel = existing.get("uploaded_images_path") or ""
    img_dir_abs = os.path.join(os.getcwd(), img_dir_rel)
    safe_name   = os.path.basename(filename)   # prevent path traversal
    fpath       = os.path.join(img_dir_abs, safe_name)
    if not os.path.isfile(fpath):
        raise HTTPException(404, "File not found")

    lower = safe_name.lower()
    if   lower.endswith(".png"):              mt = "image/png"
    elif lower.endswith((".jpg", ".jpeg")):   mt = "image/jpeg"
    elif lower.endswith(".dcm"):              mt = "application/dicom"
    elif lower.endswith((".nii", ".nii.gz")): mt = "application/octet-stream"
    else:                                     mt = "application/octet-stream"
    return FileResponse(fpath, media_type=mt, filename=safe_name)


# =============================================================================
# ✅ DASHBOARD — real KPI / modality / case data for the org dashboard
# =============================================================================
# Resolves: logged-in user → org_profile.org_id → all rows in
# admin_schema.case_submission with that org_id. Then buckets into
# Completed / Routine Queue / Pending-Overdue + a modality breakdown,
# all in a single round-trip.
# =============================================================================

# Modality / priority normalization. Whatever the DB stored (CT vs "Computed
# Tomography", MRI vs MR, XR vs X-RAY, etc.) gets bucketed onto the dashboard
# tag the frontend uses for color metadata.
_MODALITY_NORMALIZE = {
    "CT": "CT", "COMPUTED TOMOGRAPHY": "CT", "CT SCAN": "CT",
    "MRI": "MRI", "MR": "MRI", "MAGNETIC RESONANCE IMAGING": "MRI", "MAGNETIC RESONANCE": "MRI",
    "XR": "XR", "X-RAY": "XR", "XRAY": "XR", "RADIOGRAPHY": "XR", "X-RAY / RADIOGRAPHY": "XR",
    "US": "US", "USG": "US", "ULTRASOUND": "US",
    "NM": "NM", "NUCLEAR MEDICINE": "NM",
    "PET": "PET", "PET-CT": "PET", "PET-MRI": "PET", "PET-CT / PET-MRI": "PET",
}

_MODALITY_DISPLAY_NAME = {
    "CT":  "Computed Tomography",
    "MRI": "Magnetic Resonance Imaging",
    "XR":  "X-Ray / Radiography",
    "US":  "Ultrasound",
    "NM":  "Nuclear Medicine",
    "PET": "PET-CT / PET-MRI",
}

_PRIORITY_NORMALIZE = {
    "STAT": "STAT", "EMERGENCY": "STAT", "CRITICAL": "STAT",
    "URGENT": "Urgent", "HIGH": "Urgent",
    "ROUTINE": "Routine", "NORMAL": "Routine", "LOW": "Routine",
}

# SLA hours per priority — used to bucket pending/overdue + worklist TAT.
_SLA_HOURS = {"STAT": 1, "Urgent": 4, "Routine": 24}


def _norm_modality(m) -> str:
    return _MODALITY_NORMALIZE.get(str(m or "").strip().upper(), "OTHER")


def _norm_priority(p) -> str:
    return _PRIORITY_NORMALIZE.get(str(p or "").strip().upper(), "Routine")


def _fmt_ts(ts) -> Optional[str]:
    """Format a datetime into '26 Mar 2026, 06:14' for display."""
    if not ts:
        return None
    try:
        return ts.strftime("%d %b %Y, %H:%M")
    except Exception:
        return str(ts)


def _now_matching(dt) -> datetime:
    """Return a 'now' value with the same timezone-awareness as `dt`, so
    subtraction never raises 'can't subtract offset-naive and offset-aware'.
    rad_scans.scan_date is `timestamp WITH time zone` → tz-aware;
    case_submission.submitted_at is `timestamp WITHOUT time zone` → tz-naive."""
    if dt is not None and getattr(dt, "tzinfo", None) is not None:
        from datetime import timezone as _tz
        return datetime.now(_tz.utc)
    return datetime.now()


# ─────────────────────────────────────────────────────────────────────────────
# Demo-variety randomization for the Active Worklist.
#
# Most rad_scans rows are from May 11-15 → genuinely all overdue. For a more
# realistic-looking demo the worklist sprinkles in PENDING / IN READ / COMPLETE
# statuses + varied "X:YY left" TAT values. The randomization is SEEDED on
# case_id so:
#   - the same case always shows the same status across refreshes
#   - different cases get different values
# Real computed TAT/status (from priority + scan_date) is preferred when the
# scan is genuinely recent; we only apply the demo override for old rows.
# ─────────────────────────────────────────────────────────────────────────────
import hashlib as _hashlib

def _case_seed(case_id: str) -> int:
    """8-hex-char prefix of MD5 → int. Cheap, stable, no PRNG state needed."""
    if not case_id:
        return 0
    return int(_hashlib.md5(str(case_id).encode()).hexdigest()[:8], 16)


def _demo_status(case_id: str) -> str:
    """Stable pseudo-random worklist status for demo variety.
    Weighted so PENDING is most common, OVERDUE second, IN READ third."""
    options = [
        "PENDING", "PENDING", "PENDING", "PENDING",   # 40%
        "OVERDUE", "OVERDUE", "OVERDUE",              # 30%
        "IN READ", "IN READ",                         # 20%
        "COMPLETE",                                   # 10%
    ]
    return options[_case_seed(case_id) % len(options)]


def _demo_tat_left(case_id: str, status: str) -> str:
    """Stable pseudo-random TAT-left text. If status is OVERDUE, returns
    'OVERDUE'. Otherwise returns 'X:YY left' between 0:15 and 11:45."""
    if status == "OVERDUE":
        return "OVERDUE"
    seed = _case_seed(case_id)
    hours = (seed >> 4) % 12          # 0-11
    minutes = ((seed >> 12) % 12) * 5  # 0, 5, 10, ..., 55
    if hours == 0 and minutes < 15:
        minutes = 15                  # never show "0:00 left"
    return f"{hours}:{minutes:02d} left"


# Fixed radiologist → site mapping. When the worklist row's assigned
# radiologist matches one of these names, the Site column is forced to the
# mapped value (overriding rad_scans.ref_organisation). Matching is
# case-insensitive and ignores the "Dr." prefix and trailing whitespace.
_RAD_NAME_TO_SITE = {
    "varun sehrawat": "NeuroScan Imaging Center",
    "palak":          "GenPhase Diagnostics",
    "kavita sharma":  "Radiant Medical Labs",
}


def _site_for_rad(rad_name: str) -> Optional[str]:
    """Return the mapped site for a radiologist name, or None if no override."""
    if not rad_name:
        return None
    key = (
        rad_name.lower()
        .replace("dr.", "")
        .replace("dr ", "")
        .strip()
    )
    return _RAD_NAME_TO_SITE.get(key)


def _calc_pending_status(priority: str, submitted_at) -> str:
    """Bucket a not-yet-completed case into Pending / Overdue / SLA Breach / Critical
       based on how far past its priority SLA it is."""
    if not submitted_at:
        return "Pending"
    elapsed_h = (_now_matching(submitted_at) - submitted_at).total_seconds() / 3600.0
    sla = _SLA_HOURS.get(priority, 24)
    if elapsed_h > sla * 2.0:
        return "Critical"
    if elapsed_h > sla * 1.5:
        return "SLA Breach"
    if elapsed_h > sla:
        return "Overdue"
    return "Pending"


def _calc_routine_status(sub: dict) -> str:
    """Routine queue badge — Assigned / Unassigned / Rejected."""
    rs = (sub.get("review_status") or "").lower()
    fs = (sub.get("final_status") or "").lower()
    if rs == "rejected" or fs == "rejected":
        return "Rejected"
    if sub.get("radiologist_user_id"):
        return "Assigned"
    return "Unassigned"


def _calc_tat_left(priority: str, submitted_at) -> str:
    """Human-readable 'X:YY left' or 'OVERDUE' for the worklist TAT column."""
    if not submitted_at:
        return "—"
    sla = _SLA_HOURS.get(priority, 24)
    deadline_h = sla - ((_now_matching(submitted_at) - submitted_at).total_seconds() / 3600.0)
    if deadline_h <= 0:
        return "OVERDUE"
    hours = int(deadline_h)
    minutes = int((deadline_h - hours) * 60)
    return f"{hours}:{minutes:02d} left"


def _build_case_row(sub: dict) -> dict:
    """Turn a raw DB row into the JSON shape the frontend tables expect.
       The frontend handles all color metadata via tag → style maps; we just
       send normalized text fields."""
    modality = _norm_modality(sub.get("modality_type"))
    priority = _norm_priority(sub.get("priority_type"))
    return {
        "case_id":      sub.get("case_id"),
        "patient_name": (sub.get("patient_name") or "").strip() or "—",
        "modality":     modality,
        "modality_raw": sub.get("modality_type"),
        "study_type":   sub.get("study_type") or "—",
        "priority":     priority,
        "uploaded_at":  _fmt_ts(sub.get("submitted_at")),
        "completed_at": _fmt_ts(sub.get("completed_at") or sub.get("finalized_at")),
        "assigned_to":  sub.get("radiologist_name") or None,
        "review_status":  sub.get("review_status"),
        "final_status":   sub.get("final_status"),
        "qc_status":      sub.get("qc_status"),
        # report_path is only set once the web editor's client-side PDF export
        # step runs — mobile's submit flow never calls it, so a mobile-submitted
        # completed report would otherwise show as "no report" here. completed_at
        # is set by mark-completed regardless of platform, so treat either as proof
        # a real report exists.
        "has_report":   bool(sub.get("report_path")) or bool(sub.get("completed_at")),
    }


@router.get("/dashboard/cases")
def dashboard_cases(user=Depends(get_current_user)):
    """One-shot endpoint that powers the entire Organization dashboard:
       KPI counts, modality breakdown, the three tables (completed / queue /
       overdue), and the bottom 'Active Worklist' strip."""
    user_id = user.get("user_id")
    if not user_id:
        raise HTTPException(401, "Invalid token payload (user_id missing)")

    profile = crud.get_org_profile_basics(UUID(user_id))
    if not profile or not profile.get("org_id"):
        # No org profile yet → return empty buckets so the page still renders
        return {
            "ok": True,
            "org_id":   None,
            "org_name": None,
            "kpis": {
                "completed":       {"count": 0, "stat": 0, "urgent": 0, "routine": 0, "avg_tat_hours": None},
                "routine_queue":   {"count": 0, "urgent": 0, "stat": 0, "assigned": 0, "unassigned": 0, "rejected": 0},
                "pending_overdue": {"count": 0, "sla_breach": 0, "critical": 0, "overdue": 0, "pending": 0},
            },
            "modality":         [],
            "completed":        [],
            "routine_queue":    [],
            "pending_overdue":  [],
            "worklist":         [],
        }

    org_id = profile["org_id"]
    rows = crud.list_submissions_for_org(org_id)

    completed: List[dict] = []
    routine:   List[dict] = []
    pending:   List[dict] = []
    modality_counts: Dict[str, int] = {}

    # ── Modality counts from ALL org uploads (bulk_uploads) ──────────────────
    # We count modalities from organization_schema.bulk_uploads instead of
    # case_submission so that cases still in QC / radiologist pipeline are
    # included. This fixes the "Cases by Modality" card showing only 1 CT
    # (the one completed case) instead of all 5 uploaded cases.
    try:
        bulk_mod_rows = crud.list_bulk_upload_modalities_for_org(org_id, user_id)
        for bm in bulk_mod_rows:
            mod = _norm_modality(bm.get("modality_type"))
            modality_counts[mod] = modality_counts.get(mod, 0) + 1
    except Exception as _bm_err:
        print(f"[dashboard] bulk_upload modality count failed: {_bm_err}")
        # fall through — modality_counts stays empty; frontend handles gracefully

    # Aggregators for KPI subtitles
    comp_stat = comp_urgent = comp_routine = 0
    queue_stat = queue_urgent = 0
    queue_assigned = queue_unassigned = queue_rejected = 0
    pend_sla_breach = pend_critical = pend_overdue = pend_pending = 0
    tat_sum = 0
    tat_n = 0

    for s in rows:
        base = _build_case_row(s)

        # NOTE: modality_counts is now pre-populated from bulk_uploads above.
        # Do NOT add to it here — that would double-count completed cases.

        if s.get("completed_at"):
            # Completed bucket
            completed.append(base)
            p = base["priority"]
            if   p == "STAT":    comp_stat    += 1
            elif p == "Urgent":  comp_urgent  += 1
            else:                comp_routine += 1
            ts = s.get("turnaround_seconds") or 0
            if ts > 0:
                tat_sum += ts
                tat_n   += 1
        else:
            # Active case — routine queue
            r_status = _calc_routine_status(s)
            queue_row = {**base, "status": r_status}
            routine.append(queue_row)
            if   r_status == "Assigned":   queue_assigned   += 1
            elif r_status == "Unassigned": queue_unassigned += 1
            elif r_status == "Rejected":   queue_rejected   += 1
            if base["priority"] == "STAT":   queue_stat   += 1
            if base["priority"] == "Urgent": queue_urgent += 1

            # Pending / overdue — derived from priority + age
            pend_status = _calc_pending_status(base["priority"], s.get("submitted_at"))
            pend_row = {**base, "pending_status": pend_status}
            pending.append(pend_row)
            if   pend_status == "Critical":   pend_critical   += 1
            elif pend_status == "SLA Breach": pend_sla_breach += 1
            elif pend_status == "Overdue":    pend_overdue    += 1
            else:                             pend_pending    += 1

    # Modality breakdown — sorted by count desc
    total_cases = sum(modality_counts.values())
    modality_list = []
    for tag, cnt in sorted(modality_counts.items(), key=lambda kv: -kv[1]):
        pct = round((cnt / total_cases) * 100, 0) if total_cases else 0
        modality_list.append({
            "tag":    tag,
            "name":   _MODALITY_DISPLAY_NAME.get(tag, tag),
            "count":  cnt,
            "pct":    int(pct),
        })

    avg_tat_h = round(tat_sum / tat_n / 3600.0, 1) if tat_n else None

    # ── Active Worklist — pulls from radiology_schema.rad_scans ───────────
    # The cards above (Completed / Routine Queue / Pending) come from
    # admin_schema.case_submission as before. The worklist strip at the
    # bottom of the dashboard sources from rad_scans instead so newly-
    # uploaded scans appear before they have a case_submission row.
    # Radiologist name is joined from radiology_schema.radiologists via
    # assigned_rad_id → rad_id.
    # ── Active Worklist — pulls from radiology_schema.rad_scans ───────────
    # IMPORTANT: this section is wrapped in try/except so a worklist failure
    # (bad SQL, missing column, RBAC error, etc.) DOES NOT 500 the entire
    # dashboard. The cards above (Completed / Routine Queue / Pending) come
    # from admin_schema.case_submission and must stay alive independently.
    rad_rows: List[dict] = []
    worklist_error: Optional[str] = None
    try:
        rad_rows = crud.list_active_rad_scans_for_org(org_id, user_id)
        print(
            f"[dashboard] logged_in_user_id={user_id} "
            f"resolved_org_id={org_id} org_name={profile.get('org_name')!r} "
            f"rad_scans_matched={len(rad_rows)}"
        )
        if rad_rows:
            sample = rad_rows[0]
            print(
                f"[dashboard] sample row: case_id={sample.get('case_id')} "
                f"id_organisation={sample.get('id_organisation')} "
                f"ref_organisation={sample.get('ref_organisation')} "
                f"assigned_rad_id={sample.get('assigned_rad_id')} "
                f"first_name={sample.get('first_name')!r} last_name={sample.get('last_name')!r}"
            )
    except Exception as e:
        # Log the failure but keep going — the cards above must still render.
        worklist_error = f"{type(e).__name__}: {e}"
        print(f"[dashboard] worklist query failed: {worklist_error}")
        import traceback
        traceback.print_exc()

    worklist: List[dict] = []
    try:
        for rs in rad_rows:
            try:
                modality   = _norm_modality(rs.get("scan_type"))
                priority   = _norm_priority(rs.get("priority_type"))
                scan_date  = rs.get("scan_date")
                status_raw = (rs.get("status") or "pending").lower()

                # Build radiologist display name from the joined radiologists row
                first = (rs.get("first_name") or "").strip()
                last  = (rs.get("last_name") or "").strip()
                if first or last:
                    full = f"{first} {last}".strip()
                    rad_name = full if full.lower().startswith("dr") else f"Dr. {full}"
                else:
                    rad_name = "Unassigned"

                # ── Status comes straight from rad_scans.status ──────────
                # Normalize whatever the DB stored (e.g. 'pending', 'in_read',
                # 'reading', 'complete') into the display tags the frontend
                # uses for badge colors.
                status_map = {
                    "pending":   "PENDING",
                    "in_read":   "IN READ",
                    "in-read":   "IN READ",
                    "in read":   "IN READ",
                    "reading":   "IN READ",
                    "overdue":   "OVERDUE",
                    "complete":  "COMPLETE",
                    "completed": "COMPLETE",
                    "done":      "COMPLETE",
                    "rejected":  "REJECTED",
                }
                wl_status = status_map.get(status_raw, status_raw.upper() or "PENDING")

                # TAT-left text: use the real computed value when the scan is
                # recent; for genuinely-overdue rows (most of the test data
                # has old scan_date) sprinkle in seeded-random "X:YY left"
                # values so the column shows variety instead of being a wall
                # of OVERDUE. NOTE: this does NOT change the status column —
                # status is whatever rad_scans.status says it is.
                tat_left_real = _calc_tat_left(priority, scan_date)
                if tat_left_real == "OVERDUE":
                    tat_left = _demo_tat_left(rs.get("case_id") or "", wl_status)
                else:
                    tat_left = tat_left_real

                worklist.append({
                    "case_id":     rs.get("case_id"),
                    "patient_name": (rs.get("patient_name") or "").strip() or "—",
                    "priority":    priority,
                    "modality":    modality,
                    "modality_raw": rs.get("scan_type"),
                    "study_type":  rs.get("modality_study_type") or rs.get("scan_type") or "—",
                    "site":        _site_for_rad(rad_name) or rs.get("ref_organisation") or profile.get("org_name") or "—",
                    "received_at": scan_date.strftime("%H:%M") if scan_date else "—",
                    "uploaded_at": _fmt_ts(scan_date),
                    "tat_left":    tat_left,
                    "assigned_to": rad_name,
                    "wl_status":   wl_status,
                    "status":      "Assigned" if rs.get("assigned_rad_id") else "Unassigned",
                    "has_report":  False,
                })
            except Exception as row_err:
                # Skip the bad row but keep building the rest of the worklist
                print(f"[dashboard] skipping rad_scan row {rs.get('case_id')}: {row_err}")

        # Sort: priority (STAT first) then most recent. No row cap — the
        # frontend handles overflow with a scrollable container.
        priority_rank = {"STAT": 0, "Urgent": 1, "Routine": 2}
        worklist = sorted(
            worklist,
            key=lambda r: (priority_rank.get(r["priority"], 9), r.get("uploaded_at") or ""),
            reverse=False,
        )
    except Exception as e:
        # Belt-and-suspenders: if anything in the loop scaffolding itself
        # explodes, surface it but still return a usable response.
        if not worklist_error:
            worklist_error = f"{type(e).__name__}: {e}"
        print(f"[dashboard] worklist build failed: {worklist_error}")
        import traceback
        traceback.print_exc()
        worklist = []

    return {
        "ok": True,
        "org_id":   org_id,
        "org_name": profile.get("org_name"),
        "kpis": {
            "completed": {
                "count":         len(completed),
                "stat":          comp_stat,
                "urgent":        comp_urgent,
                "routine":       comp_routine,
                "avg_tat_hours": avg_tat_h,
            },
            "routine_queue": {
                "count":      len(routine),
                "stat":       queue_stat,
                "urgent":     queue_urgent,
                "assigned":   queue_assigned,
                "unassigned": queue_unassigned,
                "rejected":   queue_rejected,
            },
            "pending_overdue": {
                "count":      len(pending),
                "sla_breach": pend_sla_breach,
                "critical":   pend_critical,
                "overdue":    pend_overdue,
                "pending":    pend_pending,
            },
        },
        "modality":        modality_list,
        "completed":       completed,
        "routine_queue":   routine,
        "pending_overdue": pending,
        "worklist":        worklist,
        "worklist_error":  worklist_error,   # null when worklist query succeeded
    }


@router.get("/dashboard/report/{case_id}")
def download_dashboard_report(case_id: str, user=Depends(get_current_user)):
    """Stream the radiologist's report PDF for a case.

    Looks up the case by (org_id, case_id) — so a user can only download
    reports that belong to THEIR org. report_path is stored relative to
    the backend cwd by the radiologist module."""
    user_id = user.get("user_id")
    if not user_id:
        raise HTTPException(401, "Invalid token payload (user_id missing)")

    org_id = crud.get_org_id_for_user(UUID(user_id))
    if not org_id:
        raise HTTPException(404, "Organization profile not found — complete org setup first")

    sub = crud.get_submission_by_case_id(org_id, case_id)
    if not sub:
        raise HTTPException(404, f"Case '{case_id}' not found for this organization")

    report_rel = sub.get("report_path")
    if not report_rel:
        raise HTTPException(404, f"No report PDF available yet for case '{case_id}'")

    # Resolve the absolute path on disk.
    #
    # The radiologist module saves PDFs to
    #   <BACKEND_DIR>/radiologist/uploads/reports/<filename>.pdf
    # but stores the URL-path "/uploads/reports/<filename>.pdf" in
    # admin_schema.case_submission.report_path so the frontend can hit the
    # StaticFiles mount directly.
    #
    # On disk we therefore need to map that URL path back onto the actual
    # filesystem layout. We also tolerate older rows that may have stored an
    # absolute path or a path relative to cwd.
    #
    # IMPORTANT: os.path.join(base, "/uploads/...") silently DISCARDS `base`
    # because the second arg starts with "/". So we strip the leading slash
    # before joining — that bug was making every lookup collapse to the
    # filesystem root and 404.
    rel_no_slash = report_rel.lstrip("/")               # "uploads/reports/<file>.pdf"
    cwd          = os.getcwd()
    backend_dir  = os.path.dirname(os.path.abspath(__file__))      # .../organization
    backend_root = os.path.dirname(backend_dir)                    # .../backend
    rad_module   = os.path.join(backend_root, "radiologist")       # .../backend/radiologist

    candidates = [
        # 1. Stored value is already an absolute filesystem path (legacy rows)
        report_rel if os.path.isabs(report_rel) else None,
        # 2. URL-style "/uploads/reports/..." → radiologist module's uploads dir.
        #    This is the path the radiologist export endpoint writes today.
        os.path.join(rad_module, rel_no_slash),
        # 3. Same URL stem under backend root (in case mount changes one day)
        os.path.join(backend_root, rel_no_slash),
        # 4. cwd-relative (legacy fallback)
        os.path.join(cwd, rel_no_slash),
        # 5. one level above cwd (legacy fallback)
        os.path.join(os.path.dirname(cwd), rel_no_slash),
    ]

    report_abs = None
    tried: list[str] = []
    for c in candidates:
        if not c:
            continue
        tried.append(c)
        if os.path.isfile(c):
            report_abs = c
            break

    if not report_abs:
        # Surface every path we checked so disk vs DB mismatch is obvious in logs
        print(f"[dashboard/report] case={case_id} report_path={report_rel}")
        for t in tried:
            print(f"  tried: {t}  exists={os.path.exists(t)}")
        raise HTTPException(
            404,
            f"Report file missing on disk (DB has '{report_rel}'). "
            "Check that the radiologist export pipeline wrote the PDF "
            "under radiologist/uploads/reports/.",
        )

    return FileResponse(
        report_abs,
        media_type="application/pdf",
        filename=f"{case_id}_report.pdf",
    )



"""
APPEND these three endpoints to the bottom of router.py.

1. GET /organization/dashboard/workflow-cases
   Returns all case_workflow rows for the logged-in org, bucketed into the shape
   the Routine Queue modal's 3 tabs (Critical / Urgent / Routine) expect.

2. GET /organization/dashboard/case-files/{case_id}
   Returns the list of uploaded files for a case with their serve URLs.

3. GET /organization/scan-files/{subject_id}/{filename}
   Streams an uploaded scan file (DICOM or NIfTI) to the browser / Cornerstone3D.
"""

# ---------------------------------------------------------------------------
# Additional imports needed (add at top of router.py if not already present):
#   from fastapi.responses import StreamingResponse
#   import mimetypes
# ---------------------------------------------------------------------------


@router.get("/dashboard/workflow-cases")
def workflow_cases(user=Depends(get_current_user)):
    """
    All assigned cases from admin_schema.case_workflow for the logged-in org.
    Powers the Routine Queue modal's Urgent / Routine / Critical tabs.

    Response:
      {
        "ok": true,
        "cases": [
          {
            "case_id": "GENRAD-SUB-XXXXXXXX",
            "priority": "Routine",          // normalized
            "modality": "MRI",
            "study_type": "MRI Brain",
            "status": "Assigned",
            "uploaded_at": "25 Jun 2026, 10:30",
            "rad_first_name": "Varun",
            "rad_last_name": "Sehrawat",
            "subject_id": "...",
            "image_file_names": ["file1.dcm"]
          },
          ...
        ]
      }
    """
    user_id = user.get("user_id")
    if not user_id:
        raise HTTPException(401, "Invalid token payload (user_id missing)")

    # Use get_org_profile_basics — same lookup as /dashboard/cases — so both
    # endpoints resolve org_id from the same table column.
    profile = crud.get_org_profile_basics(UUID(user_id))
    if not profile or not profile.get("org_id"):
        return {"ok": True, "cases": [], "debug": "no_org_profile"}

    org_id = profile["org_id"]

    try:
        rows = crud.list_workflow_cases_for_org(org_id, str(user_id))
    except Exception as exc:
        import traceback
        traceback.print_exc()
        # Return the error text so the browser console can show it (not sensitive)
        return {"ok": False, "cases": [], "error": str(exc), "org_id": org_id}

    cases = []
    for r in rows:
        # Normalize priority using the same helper as the dashboard endpoint
        priority = _norm_priority(r.get("priority_type"))

        # Normalize modality
        modality = _norm_modality(r.get("modality_type"))

        # image_file_names may be stored as JSON string or already a list
        img_files = r.get("image_file_names") or []
        if isinstance(img_files, str):
            try:
                import json as _json
                img_files = _json.loads(img_files)
            except Exception:
                img_files = [f.strip() for f in img_files.split(",") if f.strip()]

        # Radiologist name — case_workflow stores full name in radiologist_name
        # (aliased as full_rad_name in the query). Fall back to separate first/last.
        rad_full = (r.get("full_rad_name") or "").strip()
        if not rad_full:
            first = (r.get("rad_first_name") or "").strip()
            last  = (r.get("rad_last_name")  or "").strip()
            rad_full = f"{first} {last}".strip()

        # Status — case_workflow stores assignment_status as lowercase ('assigned',
        # 'unassigned', 'rejected'). Capitalize for the frontend STATUS_META keys.
        status_raw = (r.get("status") or "assigned").strip()
        _status_map = {"assigned": "Assigned", "unassigned": "Unassigned",
                       "rejected": "Rejected", "pending": "Unassigned"}
        status_display = _status_map.get(status_raw.lower(), status_raw.capitalize())

        cases.append({
            "case_id":          r.get("case_id"),
            "patient_name":     (r.get("patient_name") or "").strip() or "—",
            "priority":         priority,
            "modality":         modality,
            "study_type":       r.get("study_type") or "—",
            "status":           status_display,
            "uploaded_at":      _fmt_ts(r.get("created_at")),
            "rad_first_name":   rad_full,
            "rad_last_name":    "",
            "subject_id":       r.get("subject_id") or "",
            "image_file_names": img_files,
        })

    return {"ok": True, "cases": cases}


@router.get("/dashboard/case-files/{case_id}")
def get_case_files(case_id: str, user=Depends(get_current_user)):
    """
    Returns the list of uploaded scan files for a case, each with:
      - filename
      - file_type  ("dcm" | "nii" | "other")
      - url        (API path the viewer can fetch with the auth token)

    Used by OrgScanViewer to build the list of files to display.
    """
    user_id = user.get("user_id")
    if not user_id:
        raise HTTPException(401, "Invalid token payload (user_id missing)")

    org_id = crud.get_org_id_for_user(UUID(user_id))
    if not org_id:
        raise HTTPException(404, "Organization profile not found")

    row = crud.get_bulk_upload_by_case_id(org_id, case_id)
    if not row:
        raise HTTPException(404, f"Case '{case_id}' not found for this organization")

    subject_id = row.get("subject_id") or ""

    img_files = row.get("image_file_names") or []
    if isinstance(img_files, str):
        try:
            import json as _json
            img_files = _json.loads(img_files)
        except Exception:
            img_files = [f.strip() for f in img_files.split(",") if f.strip()]

    row_s3_key  = row.get("s3_key") or None
    row_storage = row.get("storage_type") or "local"

    # ── S3: list the folder, render EVERYTHING inside it ─────────────────────
    # s3_key = folder prefix e.g. "uploads/dicom/GENRAD-SUB-433731/"
    # We list all S3 objects under that prefix and generate a presigned URL for
    # each one — no matching against image_file_names needed.
    # Whatever is in the S3 folder gets rendered in the viewer.
    files = []
    if row_storage == "s3" and row_s3_key:
        try:
            import boto3 as _boto3
            from s3_storage import presigned_download
            # Normalise to folder prefix
            if "." in row_s3_key.rsplit("/", 1)[-1]:
                s3_folder = row_s3_key.rsplit("/", 1)[0] + "/"
            else:
                s3_folder = row_s3_key.rstrip("/") + "/"
            bucket = os.environ.get("S3_BUCKET", "onix-s3")
            region = os.environ.get("AWS_DEFAULT_REGION", "ap-south-1")
            s3c    = _boto3.client("s3", region_name=region)
            resp   = s3c.list_objects_v2(Bucket=bucket, Prefix=s3_folder)
            objs   = resp.get("Contents", [])
            print(f"[case-files] S3 folder {s3_folder!r} → {len(objs)} objects")
            for obj in objs:
                key   = obj["Key"]
                fname = key.split("/")[-1]          # actual filename in S3
                if not fname:
                    continue
                ext = os.path.splitext(fname)[1].lower()
                if ext == ".dcm":
                    ft = "dcm"
                elif ext == ".nii" or fname.lower().endswith(".nii.gz"):
                    ft = "nii"
                else:
                    ft = "other"
                files.append({
                    "filename":     fname,
                    "file_type":    ft,
                    "url":          presigned_download(key),
                    "s3_key":       key,
                    "storage_type": "s3",
                })
        except Exception as _e:
            print(f"[case-files] S3 folder listing failed: {_e}")

    # ── Local fallback: use image_file_names from bulk_uploads ───────────────
    if not files:
        for fname in img_files:
            if not fname:
                continue
            ext = os.path.splitext(fname)[1].lower()
            if ext == ".dcm":
                ft = "dcm"
            elif ext == ".nii" or fname.lower().endswith(".nii.gz"):
                ft = "nii"
            else:
                ft = "other"
            files.append({
                "filename":     fname,
                "file_type":    ft,
                "url":          f"/organization/scan-files/{subject_id}/{fname}",
                "s3_key":       row_s3_key,
                "storage_type": row_storage or "local",
            })

    return {
        "case_id":    case_id,
        "subject_id": subject_id,
        "files":      files,
        "count":      len(files),
    }


@router.get("/scan-files/{subject_id}/{filename}")
def serve_scan_file(subject_id: str, filename: str, user=Depends(get_current_user)):
    """
    Streams an uploaded scan file (DCM / NIfTI / other) from disk.
    Auth-gated: only the uploading org's users can access.

    Files are stored at:
      <BULK_DIR>/<subject_id>/<filename>

    NOTE: Keep this route BELOW any more-specific routes in the router so FastAPI
    doesn't shadow them.
    """
    user_id = user.get("user_id")
    if not user_id:
        raise HTTPException(401, "Invalid token payload (user_id missing)")

    org_id = crud.get_org_id_for_user(UUID(user_id))
    if not org_id:
        raise HTTPException(403, "No organization profile found")

    # Safety check: confirm this subject_id belongs to this org
    owner_row = crud.get_bulk_upload_by_case_id.__func__ if hasattr(crud.get_bulk_upload_by_case_id, '__func__') else None
    # Simpler: check via a direct query that subject_id belongs to this org
    row = _verify_subject_belongs_to_org(org_id, subject_id)
    if not row:
        raise HTTPException(403, "Access denied: file does not belong to your organization")

    # Sanitize filename — no path traversal
    safe_name = os.path.basename(filename.replace("\\", "/"))
    file_path = os.path.join(BULK_DIR, subject_id, safe_name)

    if not os.path.isfile(file_path):
        raise HTTPException(404, f"File '{safe_name}' not found on disk")

    # Determine MIME type
    ext = os.path.splitext(safe_name)[1].lower()
    mime_map = {
        ".dcm":  "application/dicom",
        ".nii":  "application/octet-stream",
        ".gz":   "application/gzip",
        ".zip":  "application/zip",
    }
    media_type = mime_map.get(ext, "application/octet-stream")

    return FileResponse(
        file_path,
        media_type=media_type,
        filename=safe_name,
        headers={"Content-Disposition": f'inline; filename="{safe_name}"'},
    )


# ---------------------------------------------------------------------------
# Internal helper — verify that a subject_id row belongs to this org.
# Add this near the other helpers at the top of router.py if preferred.
# ---------------------------------------------------------------------------
def _verify_subject_belongs_to_org(org_id: str, subject_id: str):
    """
    Returns a truthy value if organization_schema.bulk_uploads has a row for
    (org_id, subject_id), None otherwise.
    """
    from . import crud as _crud
    from psycopg2.extras import RealDictCursor
    import psycopg2

    try:
        # Re-use whichever DB helper crud.py exposes
        rows = _crud._all(
            """
            SELECT id FROM organization_schema.bulk_uploads
            WHERE org_id = %s AND subject_id = %s
            LIMIT 1
            """,
            (str(org_id), str(subject_id)),
        )
        return rows[0] if rows else None
    except Exception as e:
        print(f"[scan-files] subject verification error: {e}")
        return None
