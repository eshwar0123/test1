"""
backend/technician/router.py

Technician portal helpers. A technician's core_schema.users.username is the
name of the organization they work for; their Case Queue / Completed Cases
read the organization's own endpoints (organization/router.py resolves a
technician to the org owner via crud.resolve_org_user_id). This router adds:

  GET /technician/me               -> org the technician is bound to
  GET /technician/scan/{case_id}   -> the rad_scans row (same shape as
                                      /radiology/scans) so the radiologist
                                      report editor / viewer can open a case

Organizations with org_profile.assign_by_technician = TRUE also get (technician
only; 403 for any other organization):

  GET  /technician/radiologists                      list this org's radiologists
  POST /technician/radiologists                      create user + radiologist (one transaction)
  PUT  /technician/radiologists/{user_id}            edit / activate / deactivate
  POST /technician/radiologists/{user_id}/reset-password
  POST /technician/cases/{case_id}/assign            assign a case to a radiologist
"""
import os
import re
import secrets
import string
import uuid as uuid_mod
from typing import Optional
from uuid import UUID

import psycopg2
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from passlib.context import CryptContext
from pydantic import BaseModel, Field

from auth.dependencies import get_current_user
from database import get_conn
from organization import crud as org_crud
from radiologist import crud as rad_crud
from radiologist.router import (
    SIGNATURE_DIR,
    _build_public_scan_urls,
    _create_notification,
    _is_valid_file_path,
    pick_org_logo,
    safe_email_filename,
)
from qc import crud as qc_crud

router = APIRouter(prefix="/technician", tags=["Technician"])


def _technician_org(user) -> dict:
    """Validate the caller is a technician (role checked in the DB, not just
    the JWT) and return {user_id, org_user_id, org_id, org_name}."""
    uid = user.get("user_id")
    if not uid:
        raise HTTPException(401, "Invalid token payload (user_id missing)")
    row = org_crud._one(
        "SELECT role FROM core_schema.users WHERE user_id = %s", (str(uid),)
    )
    if not row or str(row.get("role") or "").strip().lower() != "technician":
        raise HTTPException(403, "Technician access only")
    org_user_id = org_crud.resolve_org_user_id(uid)
    profile = org_crud.get_org_profile_basics(UUID(org_user_id))
    if not profile or not profile.get("org_id"):
        raise HTTPException(404, "No organization matches this technician's username")
    return {
        "user_id": str(uid),
        "org_user_id": org_user_id,
        "org_id": profile["org_id"],
        "org_name": profile.get("org_name"),
    }



def _assigned_radiologist_user_id(conn, cur, case_id, assigned_rad_id):
    """user_id of the radiologist assigned to this case, or None.
    Order: rad_scans.assigned_rad_id -> case_workflow.rad_id ->
    case_submission.radiologist_user_id -> latest report author."""
    def q(sql, params):
        try:
            cur.execute(sql, params)
            r = cur.fetchone()
            return r[0] if r else None
        except Exception:
            conn.rollback()
            return None

    uid = None
    if assigned_rad_id:
        uid = q("SELECT user_id FROM radiology_schema.radiologists WHERE rad_id = %s", (str(assigned_rad_id),))
    if not uid:
        uid = q(
            """SELECT r.user_id FROM admin_schema.case_workflow cw
               JOIN radiology_schema.radiologists r ON r.rad_id::text = cw.rad_id::text
               WHERE cw.case_id = %s AND r.user_id IS NOT NULL LIMIT 1""",
            (case_id,),
        )
    if not uid:
        uid = q(
            "SELECT radiologist_user_id FROM admin_schema.case_submission WHERE case_id = %s AND radiologist_user_id IS NOT NULL ORDER BY id DESC LIMIT 1",
            (case_id,),
        )
    if not uid:
        uid = q(
            """SELECT user_id FROM radiology_schema.reports r
               WHERE case_id = %s
                 AND NOT EXISTS (SELECT 1 FROM core_schema.users u
                                 WHERE u.user_id = r.user_id AND lower(u.role) = 'technician')
               ORDER BY updated_at DESC NULLS LAST LIMIT 1""",
            (case_id,),
        )
    return str(uid) if uid else None

@router.get("/me")
def technician_me(user=Depends(get_current_user)):
    t = _technician_org(user)
    return {
        "success": True,
        "data": {
            "org_id": t["org_id"],
            "org_name": t["org_name"],
            "assign_by_technician": qc_crud.org_assigns_by_technician(t["org_id"]),
        },
    }


@router.get("/scan/{case_id}")
def technician_scan(case_id: str, request: Request, user=Depends(get_current_user)):
    t = _technician_org(user)

    # The case must belong to the technician's organization.
    owned = bool(
        org_crud.get_submission_by_case_id(t["org_id"], case_id)
        or org_crud.get_bulk_upload_by_case_id(t["org_id"], case_id)
        or any(
            str(w.get("case_id")) == case_id
            for w in org_crud.list_workflow_cases_for_org(t["org_id"], t["org_user_id"])
        )
    )
    if not owned:
        raise HTTPException(404, f"Case '{case_id}' not found for this organization")

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT scan_id, case_id, user_id, scan_type, scan_date,
                       file_path, thumbnail_path,
                       patient_name, patient_sex, patient_age,
                       ref_organisation, org_logo_url, id_organisation,
                       COALESCE(priority_type, 'routine'),
                       COALESCE(status, 'pending'),
                       modality_study_type, s3_key, storage_type, history,
                       assigned_rad_id
                FROM radiology_schema.rad_scans
                WHERE case_id = %s
                ORDER BY scan_date DESC
                LIMIT 1
                """,
                (case_id,),
            )
            r = cur.fetchone()
            if not r:
                raise HTTPException(404, "Scan not found")
            (scan_id, cid, uid_db, scan_type, scan_date, file_path, thumb_path,
             patient_name, patient_sex, patient_age, ref_org, org_logo_url, id_org,
             priority, status, study, s3_key, storage_type, history, assigned_rad_id) = r

            report_user_id = _assigned_radiologist_user_id(conn, cur, case_id, assigned_rad_id)

            if not _is_valid_file_path(file_path):
                cur.execute(
                    "SELECT uploaded_images_path FROM organization_schema.bulk_uploads WHERE case_id=%s",
                    (case_id,),
                )
                b = cur.fetchone()
                if b and b[0]:
                    file_path = str(b[0])
    finally:
        conn.close()

    base = str(request.base_url).rstrip("/")
    file_url, thumbnail = _build_public_scan_urls(base, file_path, thumb_path, storage_type)
    if not org_logo_url:
        picked = pick_org_logo(str(id_org or ref_org or cid or ""))
        if picked:
            org_logo_url = f"/uploads/organisation/{picked}"

    return {
        "success": True,
        "data": {
            "scan_id": scan_id,
            "case_id": cid,
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
            "ref_organisation": ref_org,
            "org_logo_url": org_logo_url,
            "id_organisation": str(id_org) if id_org else None,
            "priority": priority or "routine",
            "status": status or "pending",
            "study": study or scan_type or "",
            "history": history,
            "s3_key": s3_key,
            "storage_type": storage_type or "local",
            # The technician edits the ASSIGNED RADIOLOGIST's report (same
            # case + radiologist user), so it is signed by that radiologist and
            # shows whatever they last saved.
            "report_user_id": report_user_id,
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# Radiologist management + case assignment (assign_by_technician orgs only)
# ─────────────────────────────────────────────────────────────────────────────
_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
_SIGNATURE_MAX_BYTES = 2 * 1024 * 1024
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _assigning_technician(user) -> dict:
    """Caller must be a technician whose organization has assign_by_technician."""
    t = _technician_org(user)
    if not qc_crud.org_assigns_by_technician(t["org_id"]):
        raise HTTPException(403, "Radiologist management is not enabled for this organization")
    qc_crud.ensure_assign_schema()
    return t


def _check_password_policy(pw: str) -> None:
    problems = []
    if len(pw) < 8:
        problems.append("at least 8 characters")
    if len(pw.encode("utf-8")) > 72:
        problems.append("at most 72 bytes")
    if not re.search(r"[a-z]", pw):
        problems.append("a lowercase letter")
    if not re.search(r"[A-Z]", pw):
        problems.append("an uppercase letter")
    if not re.search(r"\d", pw):
        problems.append("a digit")
    if problems:
        raise HTTPException(400, "Password needs " + ", ".join(problems))


def _generate_password() -> str:
    alphabet = string.ascii_letters + string.digits
    while True:
        pw = "".join(secrets.choice(alphabet) for _ in range(12))
        if re.search(r"[a-z]", pw) and re.search(r"[A-Z]", pw) and re.search(r"\d", pw):
            return pw


def _split_name(name: str):
    parts = name.split()
    return parts[0], " ".join(parts[1:])


async def _read_signature(file: UploadFile):
    """Validate a PNG/JPG e-sign upload. Returns (bytes, ext)."""
    data = await file.read(_SIGNATURE_MAX_BYTES + 1)
    if len(data) > _SIGNATURE_MAX_BYTES:
        raise HTTPException(400, "Signature file must be 2 MB or smaller")
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return data, ".png"
    if data.startswith(b"\xff\xd8\xff"):
        return data, ".jpg"
    raise HTTPException(400, "Signature must be a PNG or JPG image")


def _save_signature(email: str, data: bytes, ext: str) -> str:
    os.makedirs(SIGNATURE_DIR, exist_ok=True)
    fname = f"{safe_email_filename(email)}{ext}"
    with open(os.path.join(SIGNATURE_DIR, fname), "wb") as f:
        f.write(data)
    # same relative form the existing upload-signature endpoint stores
    return f"radiologist/signature/{fname}"


def _new_rad_id(cur) -> str:
    for _ in range(20):
        candidate = rad_crud._generate_rad_id_candidate()
        cur.execute("SELECT 1 FROM radiology_schema.radiologists WHERE rad_id = %s", (candidate,))
        if not cur.fetchone():
            return candidate
    raise HTTPException(500, "Could not generate a radiologist id, try again")


_RAD_COLS = """r.user_id, r.rad_id, r.first_name, r.last_name, r.email, r.dmc_no,
               r.signature_path, r.is_active"""


def _rad_dict(row) -> dict:
    return {
        "user_id": str(row[0]),
        "rad_id": row[1],
        "name": f"{row[2] or ''} {row[3] or ''}".strip(),
        "email": row[4],
        "dmc_no": row[5] or "",
        "signature_path": row[6],
        "is_active": bool(row[7]),
    }


def _get_org_radiologist(cur, org_id: str, user_id: str):
    try:
        UUID(user_id)
    except Exception:
        raise HTTPException(400, "Invalid user_id")
    cur.execute(
        f"SELECT {_RAD_COLS} FROM radiology_schema.radiologists r "
        "WHERE r.user_id = %s AND r.org_id = %s",
        (user_id, org_id),
    )
    row = cur.fetchone()
    if not row:
        raise HTTPException(404, "Radiologist not found")
    return row


@router.get("/radiologists")
def list_radiologists(active_only: bool = False, user=Depends(get_current_user)):
    t = _assigning_technician(user)
    conn = get_conn()
    try:
        rad_crud._ensure_dmc_no_column(conn)
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT {_RAD_COLS} FROM radiology_schema.radiologists r "
                "WHERE r.org_id = %s AND (NOT %s OR r.is_active) "
                "ORDER BY r.first_name, r.last_name",
                (t["org_id"], active_only),
            )
            return {"success": True, "data": [_rad_dict(r) for r in cur.fetchall()]}
    finally:
        conn.close()


@router.post("/radiologists")
async def create_radiologist(
    name: str = Form(...),
    email: str = Form(...),
    dmc_no: str = Form(...),
    password: str = Form(...),
    signature: UploadFile = File(...),
    user=Depends(get_current_user),
):
    t = _assigning_technician(user)
    name = " ".join(name.split())
    email = email.strip().lower()
    dmc_no = dmc_no.strip()
    if not name:
        raise HTTPException(400, "Name is required")
    if not _EMAIL_RE.match(email):
        raise HTTPException(400, "Enter a valid email address")
    if not dmc_no:
        raise HTTPException(400, "DMC number is required")
    _check_password_policy(password)
    sig_bytes, sig_ext = await _read_signature(signature)

    first, last = _split_name(name)
    new_user_id = str(uuid_mod.uuid4())
    conn = get_conn()
    signature_path = None
    try:
        rad_crud._ensure_dmc_no_column(conn)
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM core_schema.users WHERE lower(email) = %s "
                "UNION ALL SELECT 1 FROM radiology_schema.radiologists WHERE lower(email) = %s",
                (email, email),
            )
            if cur.fetchone():
                raise HTTPException(409, "A user with this email already exists")

            signature_path = _save_signature(email, sig_bytes, sig_ext)
            rad_id = _new_rad_id(cur)

            # Same insert /register does, so the existing /login works unchanged.
            cur.execute(
                """
                INSERT INTO core_schema.users (user_id, email, username, password, role, is_verified)
                VALUES (%s, %s, %s, %s, 'radiologist', TRUE)
                """,
                (new_user_id, email, name, _pwd.hash(password)),
            )
            # ON CONFLICT: a DB trigger may already have created the row for this user.
            cur.execute(
                """
                INSERT INTO radiology_schema.radiologists
                    (user_id, first_name, last_name, email, dmc_no, signature_path,
                     rad_id, org_id, created_by, is_active)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, TRUE)
                ON CONFLICT (user_id) DO UPDATE SET
                    first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
                    email = EXCLUDED.email, dmc_no = EXCLUDED.dmc_no,
                    signature_path = EXCLUDED.signature_path, rad_id = EXCLUDED.rad_id,
                    org_id = EXCLUDED.org_id, created_by = EXCLUDED.created_by,
                    is_active = TRUE
                """,
                (new_user_id, first, last, email, dmc_no, signature_path,
                 rad_id, t["org_id"], t["user_id"]),
            )
        conn.commit()
    except psycopg2.errors.UniqueViolation:
        conn.rollback()
        raise HTTPException(409, "A user with this email already exists")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    return {
        "success": True,
        "data": {
            "user_id": new_user_id, "rad_id": rad_id, "name": name, "email": email,
            "dmc_no": dmc_no, "signature_path": signature_path, "is_active": True,
        },
    }


@router.put("/radiologists/{user_id}")
async def update_radiologist(
    user_id: str,
    name: Optional[str] = Form(None),
    email: Optional[str] = Form(None),
    dmc_no: Optional[str] = Form(None),
    is_active: Optional[bool] = Form(None),
    signature: Optional[UploadFile] = File(None),
    user=Depends(get_current_user),
):
    t = _assigning_technician(user)
    sig = await _read_signature(signature) if signature is not None and signature.filename else None

    conn = get_conn()
    try:
        rad_crud._ensure_dmc_no_column(conn)
        with conn.cursor() as cur:
            cur_row = _get_org_radiologist(cur, t["org_id"], user_id)
            cur_dict = _rad_dict(cur_row)

            new_name = " ".join(name.split()) if name is not None else cur_dict["name"]
            new_email = email.strip().lower() if email is not None else cur_dict["email"]
            new_dmc = dmc_no.strip() if dmc_no is not None else cur_dict["dmc_no"]
            if not new_name:
                raise HTTPException(400, "Name is required")
            if not _EMAIL_RE.match(new_email or ""):
                raise HTTPException(400, "Enter a valid email address")
            if not new_dmc:
                raise HTTPException(400, "DMC number is required")
            if new_email != (cur_dict["email"] or "").lower():
                cur.execute(
                    "SELECT 1 FROM core_schema.users WHERE lower(email) = %s AND user_id <> %s",
                    (new_email, user_id),
                )
                if cur.fetchone():
                    raise HTTPException(409, "A user with this email already exists")

            sig_path = cur_dict["signature_path"]
            if sig:
                sig_path = _save_signature(new_email, sig[0], sig[1])
            active = cur_dict["is_active"] if is_active is None else is_active
            first, last = _split_name(new_name)

            cur.execute(
                """
                UPDATE radiology_schema.radiologists
                   SET first_name = %s, last_name = %s, email = %s, dmc_no = %s,
                       signature_path = %s, is_active = %s, updated_at = NOW()
                 WHERE user_id = %s
                """,
                (first, last, new_email, new_dmc, sig_path, active, user_id),
            )
            # A deactivated radiologist can't log in (/login rejects unverified users).
            cur.execute(
                "UPDATE core_schema.users SET username = %s, email = %s, is_verified = %s "
                "WHERE user_id = %s",
                (new_name, new_email, active, user_id),
            )
        conn.commit()
    except psycopg2.errors.UniqueViolation:
        conn.rollback()
        raise HTTPException(409, "A user with this email already exists")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    return {
        "success": True,
        "data": {**cur_dict, "name": new_name, "email": new_email, "dmc_no": new_dmc,
                 "signature_path": sig_path, "is_active": active},
    }


class ResetPasswordIn(BaseModel):
    password: Optional[str] = Field(None, description="omit to generate one")


@router.post("/radiologists/{user_id}/reset-password")
def reset_radiologist_password(
    user_id: str,
    payload: Optional[ResetPasswordIn] = None,
    user=Depends(get_current_user),
):
    t = _assigning_technician(user)
    new_pw = (payload.password if payload and payload.password else None) or _generate_password()
    _check_password_policy(new_pw)
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            _get_org_radiologist(cur, t["org_id"], user_id)
            cur.execute(
                "UPDATE core_schema.users SET password = %s WHERE user_id = %s AND role = 'radiologist'",
                (_pwd.hash(new_pw), user_id),
            )
        conn.commit()
    finally:
        conn.close()
    # Shown once; only the bcrypt hash is stored.
    return {"success": True, "data": {"user_id": user_id, "password": new_pw}}


class TechnicianAssignIn(BaseModel):
    rad_id: str = Field(..., min_length=1)


@router.post("/cases/{case_id}/assign")
def technician_assign_case(case_id: str, payload: TechnicianAssignIn, user=Depends(get_current_user)):
    """Same effect as POST /radiology/scans/{case_id}/assign, plus the
    case_workflow update: sets rad_scans.assigned_rad_id, marks
    case_workflow assigned to the radiologist, and sends "New Case Assigned"."""
    t = _assigning_technician(user)
    rad_id = payload.rad_id.strip()

    owned = bool(
        org_crud.get_submission_by_case_id(t["org_id"], case_id)
        or org_crud.get_bulk_upload_by_case_id(t["org_id"], case_id)
        or any(
            str(w.get("case_id")) == case_id
            for w in org_crud.list_workflow_cases_for_org(t["org_id"], t["org_user_id"])
        )
    )
    if not owned:
        raise HTTPException(404, f"Case '{case_id}' not found for this organization")

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT user_id, first_name, last_name, is_active
                  FROM radiology_schema.radiologists
                 WHERE rad_id = %s AND org_id = %s
                """,
                (rad_id, t["org_id"]),
            )
            rad = cur.fetchone()
            if not rad:
                raise HTTPException(404, "Radiologist not found")
            if not rad[3]:
                raise HTTPException(409, "This radiologist is deactivated")
            rad_user_id = str(rad[0])
            rad_name = f"{rad[1] or ''} {rad[2] or ''}".strip()

            cur.execute(
                "SELECT status FROM radiology_schema.rad_scans WHERE case_id = %s LIMIT 1",
                (case_id,),
            )
            scan = cur.fetchone()
            if not scan:
                raise HTTPException(404, "Scan not found for this case")
            if str(scan[0] or "").lower() in ("complete", "completed", "done"):
                raise HTTPException(409, "This case is already completed")

            cur.execute(
                "UPDATE radiology_schema.rad_scans SET assigned_rad_id = %s, assigned_at = NOW() "
                "WHERE case_id = %s",
                (rad_id, case_id),
            )
            cur.execute(
                """
                UPDATE admin_schema.case_workflow
                   SET radiologist_user_id = %s, radiologist_name = %s, rad_id = %s,
                       assignment_status = 'assigned', assigned_at = NOW()
                 WHERE case_id = %s
                """,
                (rad_user_id, rad_name, rad_id, case_id),
            )
            _create_notification(
                cur, rad_user_id, case_id,
                "New Case Assigned",
                f"Case {case_id} has been assigned to you",
            )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    return {"success": True, "data": {"case_id": case_id, "assigned_rad_id": rad_id, "radiologist": rad_name}}
