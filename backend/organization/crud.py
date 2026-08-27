# ============================================================
# backend/organization/crud.py
# ============================================================

import os
import uuid
from typing import List, Dict, Any, Optional
from datetime import datetime
from psycopg2.extras import RealDictCursor
from database import get_conn


# ------------------------------------------------------------
# Low-level DB helpers (used by every function below)
# ------------------------------------------------------------
def _one(sql: str, params: tuple = ()) -> Optional[Dict[str, Any]]:
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql, params)
            row = cur.fetchone()
            conn.commit()
            return dict(row) if row else None
    finally:
        conn.close()


def _all(sql: str, params: tuple = ()) -> List[Dict[str, Any]]:
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()
            conn.commit()
            return [dict(r) for r in rows]
    finally:
        conn.close()


def _exec(sql: str, params: tuple = ()) -> None:
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            conn.commit()
    finally:
        conn.close()


def get_organization_by_user(user_id) -> Optional[Dict[str, Any]]:
    """Minimal stand-in so routes that call this don't 500.
       Your original has much more logic — restore from git when you can."""
    return _one(
        "SELECT * FROM organization_schema.companies WHERE user_id = %s LIMIT 1",
        (str(user_id),),
    )


# ============================================================
# ✅ ORG IDENTITY  — used by /organization/current-user
#   Returns the username + email of the logged-in user (read from
#   core_schema.users) so the OrgSetupModal can prefill and lock
#   the Organization Name + Primary Email fields.
# ============================================================
def get_user_basics(user_id) -> Optional[Dict[str, Any]]:
    return _one(
        """
        SELECT user_id, username, email, role
        FROM core_schema.users
        WHERE user_id = %s
        """,
        (str(user_id),),
    )


# ============================================================
# ✅ ORG PROFILE — UPSERT into organization_schema.org_profile
#   Called by POST /organization/org-profile when the operator
#   clicks "Confirm & Save" in the OrgSetupModal.
#
#   - user_id is the FK back to core_schema.users.user_id
#   - email + org_name are authoritative from core_schema.users
#     and must NOT be taken from the request body (the form locks
#     these but a tampered request could still send them; we
#     overwrite server-side from the JWT-identified user).
#   - org_id is generated once on insert (GENRAD-ORG-XXXXXXXX,
#     digits only). On update we keep the existing org_id.
#   - logo_path is set by the router AFTER decoding the base64
#     payload and writing the file to disk; pass it in here.
# ============================================================
import random as _random

def _gen_org_id() -> str:
    return f"GENRAD-ORG-{_random.randint(10000000, 99999999)}"


def upsert_org_profile(
    *,
    user_id: str,
    email: str,                       # forced from core_schema.users.email
    org_name: str,                    # forced from core_schema.users.username
    org_type: Optional[str] = None,
    website: Optional[str] = None,
    logo_path: Optional[str] = None,  # relative path to saved logo file, or None
    contact_number: Optional[str] = None,
    address: Optional[str] = None,
    org_admin_name: Optional[str] = None,
    org_admin_email: Optional[str] = None,
    org_admin_contact: Optional[str] = None,
    npi: Optional[str] = None,
    ein: Optional[str] = None,
    clia: Optional[str] = None,
    fax: Optional[str] = None,
    street: Optional[str] = None,
    city: Optional[str] = None,
    state: Optional[str] = None,
    zip_code: Optional[str] = None,
    country: Optional[str] = None,
    admin_role: Optional[str] = None,
    hipaa_officer_name: Optional[str] = None,
    hipaa_officer_email: Optional[str] = None,
) -> Dict[str, Any]:
    """Insert or update the org_profile row keyed by user_id.

    Returns the saved row (after the upsert) so the router can pass
    it back to the frontend (incl. the newly-assigned org_id and
    resolved logo_path)."""
    new_org_id = _gen_org_id()

    row = _one(
        """
        INSERT INTO organization_schema.org_profile (
            user_id, email, org_name, org_type, website, logo_path,
            contact_number, address,
            org_admin_name, org_admin_email, org_admin_contact,
            org_id, npi, ein, clia, fax,
            street, city, state, zip, country,
            admin_role, hipaa_officer_name, hipaa_officer_email
        ) VALUES (
            %s, %s, %s, %s, %s, %s,
            %s, %s,
            %s, %s, %s,
            %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s,
            %s, %s, %s
        )
        ON CONFLICT (user_id) DO UPDATE SET
            email              = EXCLUDED.email,
            org_name           = EXCLUDED.org_name,
            org_type           = EXCLUDED.org_type,
            website            = EXCLUDED.website,
            -- only overwrite logo_path if a new one was supplied; otherwise keep the existing one
            logo_path          = COALESCE(EXCLUDED.logo_path, organization_schema.org_profile.logo_path),
            contact_number     = EXCLUDED.contact_number,
            address            = EXCLUDED.address,
            org_admin_name     = EXCLUDED.org_admin_name,
            org_admin_email    = EXCLUDED.org_admin_email,
            org_admin_contact  = EXCLUDED.org_admin_contact,
            -- preserve existing org_id on update
            -- (the newly-generated one in EXCLUDED is discarded)
            npi                = EXCLUDED.npi,
            ein                = EXCLUDED.ein,
            clia               = EXCLUDED.clia,
            fax                = EXCLUDED.fax,
            street             = EXCLUDED.street,
            city               = EXCLUDED.city,
            state              = EXCLUDED.state,
            zip                = EXCLUDED.zip,
            country            = EXCLUDED.country,
            admin_role         = EXCLUDED.admin_role,
            hipaa_officer_name = EXCLUDED.hipaa_officer_name,
            hipaa_officer_email= EXCLUDED.hipaa_officer_email,
            updated_at         = NOW()
        RETURNING id, user_id, email, org_name, org_type, website, logo_path,
                  contact_number, address, org_admin_name, org_admin_email,
                  org_admin_contact, org_id, npi, ein, clia, fax,
                  street, city, state, zip, country, admin_role,
                  hipaa_officer_name, hipaa_officer_email,
                  created_at, updated_at
        """,
        (
            str(user_id), email, org_name, org_type, website, logo_path,
            contact_number, address,
            org_admin_name, org_admin_email, org_admin_contact,
            new_org_id, npi, ein, clia, fax,
            street, city, state, zip_code, country,
            admin_role, hipaa_officer_name, hipaa_officer_email,
        ),
    )
    return row or {}


def get_org_profile_by_user(user_id) -> Optional[Dict[str, Any]]:
    return _one(
        """
        SELECT id, user_id, email, org_name, org_type, website, logo_path,
               contact_number, address, org_admin_name, org_admin_email,
               org_admin_contact, org_id, npi, ein, clia, fax,
               street, city, state, zip, country, admin_role,
               hipaa_officer_name, hipaa_officer_email,
               created_at, updated_at
        FROM organization_schema.org_profile
        WHERE user_id = %s
        """,
        (str(user_id),),
    )


# ------------------------------------------------------------
# ID resolvers
# ------------------------------------------------------------
# If you ever want MRI=1 / CT=2 / XRAY=3 instead, change these dicts —
# nothing else in the code hard-codes the numbers.
_MODALITY_IDS = {
    "CT":    1,
    "MRI":   2,
    "XRAY":  3,
    "XR":    3,     # alias
    "X-RAY": 3,     # alias
}
_MODALITY_OTHER_ID = 4

_PRIORITY_IDS = {
    "ROUTINE": 1,
    "URGENT":  2,
    "STAT":    3,
}
_PRIORITY_OTHER_ID = 4

# Organ keywords -> study_type_id.  Order matters (first match wins).
_STUDY_TYPE_KEYWORDS = [
    (1,  ("head", "brain", "skull", "cranium")),
    (2,  ("spine", "cervical", "lumbar", "vertebra", "thoracic spine")),
    (4,  ("chest", "thorax", "lung", "heart", "cardiac", "pa+lateral", "pa + lateral")),
    (3,  ("abdomen", "liver", "kidney", "pancreas", "bowel", "stomach")),
    (5,  ("pelvis", "hip")),
    (6,  ("knee", "shoulder", "elbow", "wrist", "ankle", "femur", "humerus", "foot", "hand")),
]
_STUDY_TYPE_OTHER_ID = 99


def resolve_modality_id(text: Optional[str]) -> int:
    if not text:
        return _MODALITY_OTHER_ID
    key = text.strip().upper().replace(" ", "").replace("-", "")
    # allow "X-RAY" / "X RAY" / "XRAY"
    if key in ("XRAY",):
        return 3
    return _MODALITY_IDS.get(text.strip().upper(), _MODALITY_OTHER_ID)


def resolve_priority_id(text: Optional[str]) -> int:
    if not text:
        return _PRIORITY_OTHER_ID
    return _PRIORITY_IDS.get(text.strip().upper(), _PRIORITY_OTHER_ID)


def resolve_study_type_id(text: Optional[str]) -> int:
    if not text:
        return _STUDY_TYPE_OTHER_ID
    t = text.lower()
    for sid, keywords in _STUDY_TYPE_KEYWORDS:
        for k in keywords:
            if k in t:
                return sid
    return _STUDY_TYPE_OTHER_ID


def _parse_date(s: Optional[str]):
    if not s:
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y",
                "%m/%d/%y", "%d/%m/%y", "%d-%m-%y", "%Y/%m/%d"):
        try:
            return datetime.strptime(str(s).strip(), fmt).date()
        except Exception:
            pass
    return None


# ------------------------------------------------------------
# LIST  — right-side patient table
# ------------------------------------------------------------
def list_uploads_for_user(user_id) -> List[Dict[str, Any]]:
    rows = _all(
        """
        SELECT
          id,
          upload_id,
          user_id,
          email,
          uploaded_excel_file_path,
          case_id,
          patient_name,
          age,
          gender,
          study_date,
          image_file_names,
          uploaded_images_path,
          uploaded_at,
          priority_type,
          modality_type,
          created_at,
          modality_study_type,
          modality_type_id,
          modality_study_type_id,
          subject_id,
          priority_type_id,
          qc_status,
          qc_summary,
          qc_ran_at
        FROM organization_schema.bulk_uploads
        WHERE user_id = %s
        ORDER BY uploaded_at DESC, id DESC
        """,
        (str(user_id),),
    )
    out = []
    for r in rows:
        out.append({
            "id":                     r["id"],
            "upload_id":              str(r["upload_id"]) if r.get("upload_id") else None,
            "case_id":                r.get("case_id"),
            "patient_name":           r.get("patient_name"),
            "age":                    r.get("age"),
            "gender":                 r.get("gender"),
            "priority_type":          r.get("priority_type"),
            "priority_type_id":       r.get("priority_type_id"),
            "modality_type":          r.get("modality_type"),
            "modality_type_id":       r.get("modality_type_id"),
            "modality_study_type":    r.get("modality_study_type"),
            "modality_study_type_id": r.get("modality_study_type_id"),
            "study_date":             str(r["study_date"]) if r.get("study_date") else None,
            "image_file_names":       list(r.get("image_file_names") or []),
            "uploaded_images_path":   r.get("uploaded_images_path"),
            "uploaded_excel_file_path": r.get("uploaded_excel_file_path"),
            "subject_id":             str(r["subject_id"]) if r.get("subject_id") else None,
            "uploaded_at":            str(r["uploaded_at"]) if r.get("uploaded_at") else None,
            "qc_status":              r.get("qc_status") or "pending",
            "qc_summary":             r.get("qc_summary"),
            "qc_ran_at":              str(r["qc_ran_at"]) if r.get("qc_ran_at") else None,
        })
    return out


def get_upload_by_id(row_id: int, user_id) -> Optional[Dict[str, Any]]:
    return _one(
        """
        SELECT * FROM organization_schema.bulk_uploads
        WHERE id = %s AND user_id = %s
        """,
        (int(row_id), str(user_id)),
    )


# ------------------------------------------------------------
# INSERT — called by /uploads/bulk-submit  and  /uploads/single-submit
# ------------------------------------------------------------
def insert_upload_row(
    *,
    upload_id: str,
    user_id: str,
    email: Optional[str],
    org_id: Optional[str],
    org_name: Optional[str],
    excel_path: Optional[str],
    case_id: str,
    patient_name: Optional[str],
    age: Optional[int],
    gender: Optional[str],
    study_date_str: Optional[str],
    image_file_names: List[str],
    images_dir: str,
    priority_text: Optional[str],
    modality_text: Optional[str],
    study_type_text: Optional[str],
    subject_id: str,
) -> int:
    row = _one(
        """
        INSERT INTO organization_schema.bulk_uploads (
          upload_id, user_id, email,
          org_id, org_name,
          uploaded_excel_file_path,
          case_id, patient_name, age, gender, study_date,
          image_file_names, uploaded_images_path,
          priority_type,       priority_type_id,
          modality_type,       modality_type_id,
          modality_study_type, modality_study_type_id,
          subject_id
        ) VALUES (
          %s, %s, %s,
          %s, %s,
          %s,
          %s, %s, %s, %s, %s,
          %s, %s,
          %s, %s,
          %s, %s,
          %s, %s,
          %s
        )
        RETURNING id
        """,
        (
            upload_id, str(user_id), email,
            org_id, org_name,
            excel_path,
            case_id, patient_name, age, gender, _parse_date(study_date_str),
            image_file_names, images_dir,
            priority_text, resolve_priority_id(priority_text),
            modality_text, resolve_modality_id(modality_text),
            study_type_text, resolve_study_type_id(study_type_text),
            subject_id,
        ),
    )
    return int(row["id"])


# ------------------------------------------------------------
# UPDATE — edit modal -> Finish -> Submit
# ------------------------------------------------------------
def update_upload_row(
    row_id: int,
    user_id: str,
    *,
    case_id: Optional[str] = None,
    patient_name: Optional[str] = None,
    age: Optional[int] = None,
    gender: Optional[str] = None,
    priority_text: Optional[str] = None,
    modality_text: Optional[str] = None,
    study_type_text: Optional[str] = None,
    study_date_str: Optional[str] = None,
    image_file_names: Optional[List[str]] = None,
) -> bool:
    # Build dynamic SET clause so None fields are left untouched
    sets, params = [], []

    def add(col, val):
        sets.append(f"{col} = %s")
        params.append(val)

    if case_id      is not None: add("case_id",      case_id)
    if patient_name is not None: add("patient_name", patient_name)
    if age          is not None: add("age",          age)
    if gender       is not None: add("gender",       gender)
    if study_date_str is not None:
        add("study_date", _parse_date(study_date_str))
    if priority_text is not None:
        add("priority_type",    priority_text)
        add("priority_type_id", resolve_priority_id(priority_text))
    if modality_text is not None:
        add("modality_type",    modality_text)
        add("modality_type_id", resolve_modality_id(modality_text))
    if study_type_text is not None:
        add("modality_study_type",    study_type_text)
        add("modality_study_type_id", resolve_study_type_id(study_type_text))
    if image_file_names is not None:
        add("image_file_names", image_file_names)

    if not sets:
        return True   # no-op

    params.extend([int(row_id), str(user_id)])
    sql = (
        "UPDATE organization_schema.bulk_uploads SET "
        + ", ".join(sets)
        + " WHERE id = %s AND user_id = %s RETURNING id"
    )
    row = _one(sql, tuple(params))
    return bool(row)


# ------------------------------------------------------------
# DELETE
# ------------------------------------------------------------
def delete_upload_row(row_id: int, user_id) -> Optional[Dict[str, Any]]:
    """Returns the deleted row so the router can also remove files from disk."""
    return _one(
        """
        DELETE FROM organization_schema.bulk_uploads
        WHERE id = %s AND user_id = %s
        RETURNING id, uploaded_images_path, subject_id
        """,
        (int(row_id), str(user_id)),
    )


# ============================================================
# ✅ DASHBOARD — case submissions for the org's dashboard
# ============================================================
# These helpers power the Organization → Dashboard page. They
# resolve the logged-in user → org_id → all rows in
# admin_schema.case_submission for that org. The router then
# buckets them into completed / routine queue / pending-overdue
# and computes summary KPIs on top.
# ============================================================

def get_org_id_for_user(user_id) -> Optional[str]:
    """Look up the org_id (e.g. 'GENRAD-ORG-12345678') for the given user
       from organization_schema.org_profile."""
    row = _one(
        "SELECT org_id FROM organization_schema.org_profile WHERE user_id = %s",
        (str(user_id),),
    )
    return (row or {}).get("org_id") if row else None


def get_org_profile_basics(user_id) -> Optional[Dict[str, Any]]:
    """Return {org_id, org_name, email} for the given user — used to display
       the org name in the dashboard header / modal subtitles."""
    return _one(
        """
        SELECT org_id, org_name, email
        FROM organization_schema.org_profile
        WHERE user_id = %s
        """,
        (str(user_id),),
    )


def list_submissions_for_org(org_id: str) -> List[Dict[str, Any]]:
    """All case submissions for the given org, newest first.
       Pulls every column the dashboard needs in a single round-trip.
       LEFT JOINs bulk_uploads on case_id to get patient_name."""
    return _all(
        """
        SELECT
            cs.id,
            cs.case_id,
            cs.org_id,
            cs.radiologist_user_id,
            cs.radiologist_name,
            cs.organization_name,
            cs.modality_type,
            cs.study_type,
            cs.priority_type,
            cs.report_path,
            cs.report_text,
            cs.impression,
            cs.findings,
            cs.recommendation,
            cs.submitted_status,
            cs.review_status,
            cs.final_status,
            cs.qc_status,
            cs.submitted_at,
            cs.reviewed_at,
            cs.finalized_at,
            cs.completed_at,
            cs.turnaround_seconds,
            cs.result_file_path,
            cs.diagnosed_file_path,
            COALESCE(bu.patient_name, '') AS patient_name
        FROM admin_schema.case_submission cs
        LEFT JOIN organization_schema.bulk_uploads bu ON bu.case_id = cs.case_id
        WHERE cs.org_id = %s
        ORDER BY cs.submitted_at DESC NULLS LAST, cs.id DESC
        """,
        (str(org_id),),
    )


def get_submission_by_case_id(org_id: str, case_id: str) -> Optional[Dict[str, Any]]:
    """Fetch ONE submission for download/serve flows. Scoped by org so
       a user can't pull another org's report by guessing a case_id."""
    return _one(
        """
        SELECT
            id, case_id, org_id, report_path, result_file_path,
            radiologist_name, modality_type, study_type, priority_type,
            submitted_at, completed_at
        FROM admin_schema.case_submission
        WHERE org_id = %s AND case_id = %s
        LIMIT 1
        """,
        (str(org_id), str(case_id)),
    )


def list_active_rad_scans_for_org(org_id: str, org_user_id) -> List[Dict[str, Any]]:
    """Worklist source for the org dashboard.

    ORG MATCH — accepts the org_id text in either varchar column, plus the
    org user's UUID-as-text as a legacy fallback:
      - rs.id_organisation  = org_id        (e.g. GENRAD-ORG-29839121)
      - rs.ref_organisation = org_id        (same value in the ref column)
      - rs.id_organisation  = org_user_id   (legacy UUID-as-text rows)

    RADIOLOGIST NAME — comes from radiology_schema.radiologists joined on
    radiologists.rad_id = rad_scans.assigned_rad_id. Each case shows the
    NAME OF THE RADIOLOGIST ASSIGNED TO IT, not the uploader.

    ALL scans are returned (including completed). The worklist renders
    completed cases with a COMPLETE status badge so the org can see the
    full picture; the Case Queue card separately excludes completed cases.
    """
    return _all(
        """
        SELECT
            rs.scan_id,
            rs.case_id,
            rs.scan_type,
            rs.scan_date,
            COALESCE(rs.patient_name, bu.patient_name, '') AS patient_name,
            rs.patient_sex,
            rs.patient_age,
            rs.ref_organisation,
            rs.id_organisation,
            COALESCE(rs.priority_type, 'routine')   AS priority_type,
            COALESCE(rs.status,        'pending')   AS status,
            rs.modality_study_type,
            rs.assigned_rad_id,
            r.first_name,
            r.last_name
        FROM radiology_schema.rad_scans rs
        LEFT JOIN radiology_schema.radiologists r
               ON r.rad_id = rs.assigned_rad_id
        LEFT JOIN organization_schema.bulk_uploads bu
               ON bu.case_id = rs.case_id
        WHERE
            (rs.id_organisation  = %(org_id)s
             OR rs.ref_organisation = %(org_id)s
             OR rs.id_organisation  = %(user_id)s)
        ORDER BY rs.scan_date DESC NULLS LAST
        LIMIT 100
        """,
        {"org_id": str(org_id), "user_id": str(org_user_id)},
    )



"""
APPEND these two functions to the bottom of crud.py.

list_workflow_cases_for_org  — powers GET /organization/dashboard/workflow-cases
get_bulk_upload_by_case_id   — used by the case-files endpoint (may already exist)
"""


def list_workflow_cases_for_org(org_id: str, org_user_id: str = None) -> List[Dict[str, Any]]:
    """
    Return all case_workflow rows for an org.

    ACTUAL admin_schema.case_workflow column names (verified from DB):
      - modality_study_type   (NOT study_type)
      - assignment_status     (NOT status)
      - rad_id                (NOT assigned_rad_id)
      - radiologist_name      (full name already stored — no radiologists JOIN needed)
      - organization_user_id  (org user UUID — alternate match key)

    Strategy A — cw.org_id::text OR cw.organization_user_id::text match.
    Strategy B — INNER JOIN rad_scans on id_organisation / ref_organisation
                 (same logic as active worklist, known working).
    Strategy C — match via bulk_uploads.org_id.

    Each strategy is isolated in try/except so a column-not-found or type error
    in one never silently kills the others.
    """
    uid = str(org_user_id) if org_user_id else ""
    oid = str(org_id)

    # ── Correct SELECT using real column names ────────────────────────────────
    _CW_SELECT = """
        SELECT DISTINCT ON (cw.case_id)
            cw.case_id,
            cw.org_id,
            COALESCE(cw.priority_type,        'Routine')  AS priority_type,
            COALESCE(cw.modality_type,        'OTHER')     AS modality_type,
            COALESCE(cw.modality_study_type,  '')          AS study_type,
            COALESCE(cw.assignment_status,    'assigned')  AS status,
            COALESCE(cw.patient_name, bu.patient_name, '') AS patient_name,
            cw.created_at,
            cw.radiologist_name                            AS full_rad_name,
            bu.image_file_names,
            bu.uploaded_images_path,
            bu.subject_id
        FROM admin_schema.case_workflow cw
        LEFT JOIN organization_schema.bulk_uploads bu ON bu.case_id = cw.case_id
    """

    # ── Strategy A: direct org match on cw.org_id or cw.organization_user_id ──
    try:
        candidates = list({oid, uid} - {""})
        if candidates:
            placeholders = ", ".join(["%s"] * len(candidates))
            rows = _all(
                f"{_CW_SELECT}"
                f"WHERE (cw.org_id::text IN ({placeholders})"
                f"       OR cw.organization_user_id::text IN ({placeholders}))"
                f"  AND NOT EXISTS ("
                f"      SELECT 1 FROM admin_schema.case_submission cs_done"
                f"      WHERE cs_done.case_id = cw.case_id"
                f"        AND cs_done.completed_at IS NOT NULL"
                f"  )"
                f" ORDER BY cw.case_id, cw.created_at DESC NULLS LAST LIMIT 300",
                tuple(candidates) * 2,          # doubled: once for org_id, once for user_id check
            )
            if rows:
                print(f"[workflow_cases] strategy A: {len(rows)} rows for org {oid}")
                return rows
    except Exception as e:
        print(f"[workflow_cases] strategy A failed for org {oid}: {e}")

    # ── Strategy B: INNER JOIN rad_scans (same org logic as active worklist) ──
    try:
        rows = _all(
            """
            SELECT DISTINCT ON (cw.case_id)
                cw.case_id,
                cw.org_id,
                COALESCE(cw.priority_type, rs.priority_type, 'Routine')              AS priority_type,
                COALESCE(cw.modality_type, rs.scan_type, 'OTHER')                    AS modality_type,
                COALESCE(cw.modality_study_type, rs.modality_study_type, '')         AS study_type,
                COALESCE(cw.assignment_status, 'assigned')                           AS status,
                COALESCE(cw.patient_name, rs.patient_name, bu.patient_name, '')      AS patient_name,
                cw.created_at,
                cw.radiologist_name                                                  AS full_rad_name,
                bu.image_file_names,
                bu.uploaded_images_path,
                bu.subject_id
            FROM admin_schema.case_workflow cw
            INNER JOIN radiology_schema.rad_scans rs
                    ON rs.case_id = cw.case_id
                   AND (
                       rs.id_organisation  = %s
                       OR rs.ref_organisation = %s
                       OR rs.id_organisation  = %s
                   )
            LEFT JOIN organization_schema.bulk_uploads bu ON bu.case_id = cw.case_id
            WHERE NOT EXISTS (
                SELECT 1 FROM admin_schema.case_submission cs_done
                WHERE cs_done.case_id = cw.case_id
                  AND cs_done.completed_at IS NOT NULL
            )
            ORDER BY cw.case_id, cw.created_at DESC NULLS LAST
            LIMIT 300
            """,
            (oid, oid, uid if uid else oid),
        )
        if rows:
            print(f"[workflow_cases] strategy B: {len(rows)} rows for org {oid}")
            return rows
    except Exception as e:
        print(f"[workflow_cases] strategy B failed for org {oid}: {e}")

    # ── Strategy C: bulk_uploads.org_id ───────────────────────────────────────
    try:
        rows = _all(
            f"{_CW_SELECT}"
            f"WHERE bu.org_id = %s"
            f"  AND NOT EXISTS ("
            f"      SELECT 1 FROM admin_schema.case_submission cs_done"
            f"      WHERE cs_done.case_id = cw.case_id"
            f"        AND cs_done.completed_at IS NOT NULL"
            f"  )"
            f" ORDER BY cw.case_id, cw.created_at DESC NULLS LAST LIMIT 300",
            (oid,),
        )
        print(f"[workflow_cases] strategy C: {len(rows)} rows for org {oid}")
        return rows
    except Exception as e:
        print(f"[workflow_cases] strategy C failed for org {oid}: {e}")

    return []


def list_bulk_upload_modalities_for_org(org_id: str) -> List[Dict[str, Any]]:
    """Return (case_id, modality_type) for every bulk_upload row belonging to this org.

    Used by the dashboard endpoint to compute Cases-by-Modality counts across ALL
    org-uploaded cases, not just those that have reached admin_schema.case_submission.
    This ensures the modality card reflects the true upload mix (XR/CT/MRI count)
    even for cases still in QC or radiologist assignment pipeline.
    """
    return _all(
        """
        SELECT case_id, modality_type
        FROM organization_schema.bulk_uploads
        WHERE org_id = %s
        """,
        (str(org_id),),
    )


def get_bulk_upload_by_case_id(org_id: str, case_id: str) -> Optional[Dict[str, Any]]:
    """
    Fetch one bulk_uploads row for (org_id, case_id).
    Used by the /dashboard/case-files/{case_id} endpoint to get file paths.
    """
    return _one(
        """
        SELECT
            id,
            upload_id,
            case_id,
            subject_id,
            image_file_names,
            uploaded_images_path,
            uploaded_excel_file_path,
            s3_key,
            s3_bucket,
            storage_type
        FROM organization_schema.bulk_uploads
        WHERE org_id = %s AND case_id = %s
        LIMIT 1
        """,
        (str(org_id), str(case_id)),
    )
