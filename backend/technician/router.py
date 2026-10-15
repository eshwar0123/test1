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
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request

from auth.dependencies import get_current_user
from database import get_conn
from organization import crud as org_crud
from radiologist.router import (
    _build_public_scan_urls,
    _is_valid_file_path,
    pick_org_logo,
)

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
    return {"success": True, "data": {"org_id": t["org_id"], "org_name": t["org_name"]}}


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
