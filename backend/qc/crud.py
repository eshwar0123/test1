"""
backend/qc/crud.py

Database helpers for QC tables.  Uses the same connection pool
as organization/crud.py (via the shared _one/_all/_exec helpers).
"""
import json
from typing import Dict, Any, List, Optional
from psycopg2.extras import RealDictCursor
from database import get_conn


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


# ------------------------------------------------------------
# Writes — called from the background task
# ------------------------------------------------------------
def insert_qc_file_result(
    *,
    upload_row_id: int,
    upload_id:     str,
    case_id:       str,
    user_id:       str,
    file_name:     str,
    status:        str,
    reason:        str,
    checks:        List[Dict[str, Any]],
) -> int:
    row = _one(
        """
        INSERT INTO admin_schema.qc_cases
          (upload_row_id, upload_id, case_id, user_id,
           file_name, status, reason, checks_json)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb)
        RETURNING qc_id
        """,
        (int(upload_row_id) if upload_row_id is not None else None, str(upload_id), case_id, str(user_id),
         file_name, status, reason, json.dumps(checks)),
    )
    return int(row["qc_id"]) if row else 0


def set_bulk_upload_qc_status(
    row_id: int,
    status: str,
    summary: str = "",
) -> bool:
    row = _one(
        """
        UPDATE organization_schema.bulk_uploads
           SET qc_status  = %s,
               qc_ran_at  = NOW(),
               qc_summary = %s
         WHERE id = %s
        RETURNING id
        """,
        (status, summary, int(row_id)),
    )
    return bool(row)


def insert_returned_case(*,
    original_row_id: int,
    src_row: Dict[str, Any],     # the full bulk_uploads row
    reason: str,
) -> int:
    """Copy the upload row into organization_schema.returned_cases
       with a reason. Caller decides whether to delete the original."""
    row = _one(
        """
        INSERT INTO organization_schema.returned_cases
          (original_row_id, upload_id, user_id,
           case_id, patient_name, age, gender,
           priority_type, priority_type_id,
           modality_type, modality_type_id,
           modality_study_type, modality_study_type_id,
           study_date, image_file_names, uploaded_images_path,
           status, reason)
        VALUES (%s, %s, %s,
                %s, %s, %s, %s,
                %s, %s,
                %s, %s,
                %s, %s,
                %s, %s, %s,
                %s, %s)
        RETURNING returned_id
        """,
        (
            int(original_row_id),
            src_row.get("upload_id"),
            str(src_row.get("user_id")),
            src_row.get("case_id"),
            src_row.get("patient_name"),
            src_row.get("age"),
            src_row.get("gender"),
            src_row.get("priority_type"),
            src_row.get("priority_type_id"),
            src_row.get("modality_type"),
            src_row.get("modality_type_id"),
            src_row.get("modality_study_type"),
            src_row.get("modality_study_type_id"),
            src_row.get("study_date"),
            list(src_row.get("image_file_names") or []),
            src_row.get("uploaded_images_path"),
            "returned",
            reason,
        ),
    )
    return int(row["returned_id"]) if row else 0


# ------------------------------------------------------------
# Reads — for the frontend dashboards
# ------------------------------------------------------------
def list_qc_for_upload_row(row_id: int) -> List[Dict[str, Any]]:
    return _all(
        """
        SELECT qc_id, file_name, status, reason, checked_at
          FROM admin_schema.qc_cases
         WHERE upload_row_id = %s
         ORDER BY qc_id
        """,
        (int(row_id),),
    )


def qc_summary_for_user(user_id: str) -> Dict[str, Any]:
    """Used by the dashboard cards — counts by severity."""
    row = _one(
        """
        SELECT
          COUNT(*) FILTER (WHERE qc_status = 'pending') AS pending,
          COUNT(*) FILTER (WHERE qc_status = 'pass')    AS passed,
          COUNT(*) FILTER (WHERE qc_status = 'warn')    AS warned,
          COUNT(*) FILTER (WHERE qc_status = 'error')   AS errored,
          COUNT(*)                                      AS total
        FROM organization_schema.bulk_uploads
        WHERE user_id = %s
        """,
        (str(user_id),),
    )
    return dict(row) if row else {"pending": 0, "passed": 0, "warned": 0,
                                  "errored": 0, "total": 0}


def insert_bulk_upload_after_qc(
    case_meta: Dict[str, Any],
    qc_status: str,
    qc_summary: str,
) -> Optional[int]:
    """Insert an approved (QC-passed) case into organization_schema.bulk_uploads.
    Called by run_qc_for_case after QC passes — bulk_uploads is the final
    destination, not the staging area."""
    from organization.crud import resolve_priority_id, resolve_modality_id, resolve_study_type_id, _parse_date

    row = _one(
        """
        INSERT INTO organization_schema.bulk_uploads (
          upload_id, user_id, email,
          org_id,
          uploaded_excel_file_path,
          case_id, patient_name, age, gender, study_date,
          image_file_names, uploaded_images_path,
          priority_type,       priority_type_id,
          modality_type,       modality_type_id,
          modality_study_type, modality_study_type_id,
          referring_doctor,
          history,
          subject_id,
          qc_status, qc_summary, qc_ran_at
        ) VALUES (
          %s, %s, %s,
          %s,
          %s,
          %s, %s, %s, %s, %s,
          %s, %s,
          %s, %s,
          %s, %s,
          %s, %s,
          %s,
          %s,
          %s, %s, %s, NOW()
        ) RETURNING id
        """,
        (
            case_meta.get("upload_id"),
            str(case_meta.get("user_id") or ""),
            case_meta.get("email"),
            case_meta.get("org_id"),
            case_meta.get("excel_path"),
            case_meta.get("case_id"),
            case_meta.get("patient_name"),
            case_meta.get("age"),
            case_meta.get("gender"),
            _parse_date(case_meta.get("study_date_str")),
            list(case_meta.get("image_file_names") or []),
            case_meta.get("images_dir"),
            case_meta.get("priority_text"),
            resolve_priority_id(case_meta.get("priority_text")),
            case_meta.get("modality_text"),
            resolve_modality_id(case_meta.get("modality_text")),
            case_meta.get("study_type_text"),
            resolve_study_type_id(case_meta.get("study_type_text")),
            case_meta.get("referring_doctor"),
            case_meta.get("history"),
            case_meta.get("subject_id"),
            qc_status,
            qc_summary,
        ),
    )
    return int(row["id"]) if row else None


def insert_returned_case_from_meta(case_meta: Dict[str, Any], reason: str) -> int:
    """Copy case_meta into organization_schema.returned_cases when QC fails.
    Mirrors insert_returned_case but takes a case_meta dict (no bulk_uploads
    row exists yet) so original_row_id is set to 0."""
    from organization.crud import resolve_priority_id, resolve_modality_id, resolve_study_type_id, _parse_date

    row = _one(
        """
        INSERT INTO organization_schema.returned_cases
          (original_row_id, upload_id, user_id,
           case_id, patient_name, age, gender,
           priority_type, priority_type_id,
           modality_type, modality_type_id,
           modality_study_type, modality_study_type_id,
           study_date, image_file_names, uploaded_images_path,
           status, reason)
        VALUES (0, %s, %s,
                %s, %s, %s, %s,
                %s, %s,
                %s, %s,
                %s, %s,
                %s, %s, %s,
                'returned', %s)
        RETURNING returned_id
        """,
        (
            case_meta.get("upload_id"),
            str(case_meta.get("user_id") or ""),
            case_meta.get("case_id"),
            case_meta.get("patient_name"),
            case_meta.get("age"),
            case_meta.get("gender"),
            case_meta.get("priority_text"),
            resolve_priority_id(case_meta.get("priority_text")),
            case_meta.get("modality_text"),
            resolve_modality_id(case_meta.get("modality_text")),
            case_meta.get("study_type_text"),
            resolve_study_type_id(case_meta.get("study_type_text")),
            _parse_date(case_meta.get("study_date_str")),
            list(case_meta.get("image_file_names") or []),
            case_meta.get("images_dir"),
            reason,
        ),
    )
    return int(row["returned_id"]) if row else 0


def find_available_radiologist() -> Optional[Dict[str, Any]]:
    """Find the best available radiologist using admin_schema.radiologist_availability.

    Strategy (in priority order):
      1. Radiologist with a slot on TODAY whose availability_status = 'available'
         and current time falls within from_time..to_time — least active cases first.
      2. Fallback: any slot on TODAY with availability_status = 'available'
         (ignores time range) — least active cases first.
      3. Fallback: any radiologist in radiology_schema.radiologists regardless
         of availability — least active cases first (original behaviour).

    Returns a dict with keys: rad_id, rad_user_id, first_name, last_name,
    radiologist_name, specialization_name.
    """
    # --- Attempt 1: today's slot, current time within window ---
    rad = _one(
        """
        SELECT
            r.rad_id,
            ra.radiologist_id                           AS availability_rad_id,
            r.user_id                                   AS rad_user_id,
            r.first_name,
            r.last_name,
            ra.radiologist_name,
            COALESCE(ra.specialization_name, r.designation, r.department, '') AS specialization_name,
            COUNT(rs.scan_id)                           AS active_count
        FROM admin_schema.radiologist_availability ra
        JOIN radiology_schema.radiologists r
               ON r.user_id = ra.user_id
        LEFT JOIN radiology_schema.rad_scans rs
               ON rs.assigned_rad_id = r.rad_id
              AND LOWER(COALESCE(rs.status, '')) NOT IN ('complete', 'completed', 'done')
        WHERE ra.available_date = CURRENT_DATE
          AND ra.availability_status = 'available'
          AND CURRENT_TIME BETWEEN ra.from_time AND ra.to_time
        GROUP BY r.rad_id, ra.radiologist_id, r.user_id, r.first_name, r.last_name,
                 ra.radiologist_name, ra.specialization_name, r.designation, r.department
        ORDER BY active_count ASC
        LIMIT 1
        """
    )

    if not rad:
        # --- Attempt 2: today's slot, any time ---
        rad = _one(
            """
            SELECT
                r.rad_id,
                ra.radiologist_id                           AS availability_rad_id,
                r.user_id                                   AS rad_user_id,
                r.first_name,
                r.last_name,
                ra.radiologist_name,
                COALESCE(ra.specialization_name, r.designation, r.department, '') AS specialization_name,
                COUNT(rs.scan_id)                           AS active_count
            FROM admin_schema.radiologist_availability ra
            JOIN radiology_schema.radiologists r
                   ON r.user_id = ra.user_id
            LEFT JOIN radiology_schema.rad_scans rs
                   ON rs.assigned_rad_id = r.rad_id
                  AND LOWER(COALESCE(rs.status, '')) NOT IN ('complete', 'completed', 'done')
            WHERE ra.available_date = CURRENT_DATE
              AND ra.availability_status = 'available'
            GROUP BY r.rad_id, ra.radiologist_id, r.user_id, r.first_name, r.last_name,
                     ra.radiologist_name, ra.specialization_name, r.designation, r.department
            ORDER BY active_count ASC
            LIMIT 1
            """
        )

    if not rad:
        # --- Attempt 3: any radiologist (load-balance fallback, no availability slot) ---
        rad = _one(
            """
            SELECT
                r.rad_id,
                r.rad_id                                    AS availability_rad_id,
                r.user_id                                   AS rad_user_id,
                r.first_name,
                r.last_name,
                CONCAT(r.first_name, ' ', r.last_name)      AS radiologist_name,
                COALESCE(r.designation, r.department, '')   AS specialization_name,
                COUNT(rs.scan_id)                           AS active_count
            FROM radiology_schema.radiologists r
            LEFT JOIN radiology_schema.rad_scans rs
                   ON rs.assigned_rad_id = r.rad_id
                  AND LOWER(COALESCE(rs.status, '')) NOT IN ('complete', 'completed', 'done')
            GROUP BY r.rad_id, r.user_id, r.first_name, r.last_name,
                     r.designation, r.department
            ORDER BY active_count ASC
            LIMIT 1
            """
        )

    return dict(rad) if rad else None


def insert_case_workflow_with_rad(
    src_row: Dict[str, Any],
    rad: Dict[str, Any],
) -> Optional[int]:
    """Insert a QC-approved case into admin_schema.case_workflow with full
    patient details from bulk_uploads and assigned radiologist details.

    src_row — organization_schema.bulk_uploads row (read back after QC insert).
    rad     — result from find_available_radiologist().
    """
    rad_user_id    = str(rad.get("rad_user_id") or rad.get("user_id") or "")
    rad_name       = (
        rad.get("radiologist_name")
        or f"{rad.get('first_name', '')} {rad.get('last_name', '')}".strip()
    )
    specialization = rad.get("specialization_name") or ""
    # rad_id from radiologist_availability.radiologist_id (or radiologists.rad_id fallback)
    rad_id         = str(rad.get("availability_rad_id") or rad.get("rad_id") or "")

    # Calculate due_at from priority
    priority = (src_row.get("priority_type") or "").strip().lower()
    if priority == "stat":
        due_hours = 2
    elif priority == "urgent":
        due_hours = 24
    else:
        due_hours = 72   # Routine

    row = _one(
        """
        INSERT INTO admin_schema.case_workflow
          (upload_id, case_id, org_id,
           organization_user_id,
           patient_name, age, gender, study_date,
           priority_type,
           modality_type,       modality_type_id,
           modality_study_type, modality_study_type_id,
           radiologist_user_id, radiologist_name, specialization_name,
           rad_id,
           organization_name,
           assignment_status,
           assigned_at,
           due_at,
           qc_status,
           uploaded_file_path,
           received_at)
        VALUES (%s, %s, %s,
                %s,
                %s, %s, %s, %s,
                %s,
                %s, %s,
                %s, %s,
                %s, %s, %s,
                %s,
                (SELECT org_name FROM organization_schema.org_profile
                  WHERE org_id = %s LIMIT 1),
                'assigned',
                NOW(),
                NOW() + INTERVAL '%s hours',
                %s,
                %s,
                NOW())
        RETURNING id
        """,
        (
            str(src_row.get("upload_id") or ""),
            src_row.get("case_id"),
            src_row.get("org_id"),
            str(src_row.get("user_id") or ""),
            src_row.get("patient_name"),
            src_row.get("age"),
            src_row.get("gender"),
            src_row.get("study_date"),
            src_row.get("priority_type"),
            src_row.get("modality_type"),
            src_row.get("modality_type_id"),
            src_row.get("modality_study_type"),
            src_row.get("modality_study_type_id"),
            rad_user_id,
            rad_name,
            specialization,
            rad_id,
            src_row.get("org_id"),        # for the org_name subquery
            due_hours,
            src_row.get("qc_status"),
            src_row.get("uploaded_images_path"),
        ),
    )

    if row and rad_user_id:
        try:
            _exec("""
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
            case_id = src_row.get("case_id")
            _exec(
                """
                INSERT INTO admin_schema.notifications (user_id, case_id, type, title, message)
                VALUES (%s, %s, 'case_assigned', %s, %s)
                """,
                (
                    rad_user_id,
                    case_id,
                    "New Case Assigned",
                    f"Case {case_id} has been assigned to you",
                ),
            )
        except Exception as e:
            print(f"[notifications] failed to create notification: {e}")

    return int(row["id"]) if row else None


def _normalise_scan_type(raw: str) -> str:
    """Map raw modality strings to allowed chk_scan_type values."""
    if not raw:
        return "CT"
    m = str(raw).upper().strip()
    mapping = {
        "X-RAY": "XRAY", "XRAY": "XRAY", "XR": "XRAY",
        "CR": "XRAY", "DX": "XRAY", "DR": "XRAY",
        "MRI": "MRI", "MR": "MRI",
        "CT": "CT",
        "PET": "PET", "PT": "PET",
        "US": "ULTRASOUND", "ULTRASOUND": "ULTRASOUND",
        "MG": "MG", "MAMMOGRAPHY": "MG",
    }
    return mapping.get(m, "CT")


def insert_rad_scan_for_case(src_row: Dict[str, Any], rad: Dict[str, Any], thumbnail_path: Optional[str] = None) -> None:
    """Insert a fully-populated row into radiology_schema.rad_scans.

    src_row — organization_schema.bulk_uploads row (read back after QC insert).
    rad     — result from find_available_radiologist().

    Column mapping
    ──────────────
    rad_scans column        ← source
    ─────────────────────────────────────────────────────────────
    case_id                 ← bulk_uploads.case_id
    file_path               ← bulk_uploads.uploaded_images_path
    user_id                 ← rad.rad_user_id  (radiologist's core_schema UUID)
    scan_type               ← bulk_uploads.modality_type
    scan_date               ← NOW()
    thumbnail_path          ← generated by qc/engine.generate_case_thumbnail() (optional)
    patient_name            ← bulk_uploads.patient_name
    patient_sex             ← bulk_uploads.gender
    patient_age             ← bulk_uploads.age
    ref_organisation        ← bulk_uploads.org_name
    id_organisation         ← bulk_uploads.org_id
    priority_type           ← bulk_uploads.priority_type
    modality_study_type     ← bulk_uploads.modality_study_type
    assigned_rad_id         ← rad.rad_id
    status                  ← 'pending'
    """
    rad_user_id = str(rad.get("rad_user_id") or rad.get("user_id") or "")
    rad_id      = str(rad.get("rad_id") or "")
    org_id      = src_row.get("org_id")

    _exec(
        """
        INSERT INTO radiology_schema.rad_scans
          (case_id,
           file_path,
           user_id,
           scan_type,
           scan_date,
           thumbnail_path,
           patient_name,
           patient_sex,
           patient_age,
           ref_organisation,
           org_logo_url,
           id_organisation,
           priority_type,
           modality_study_type,
           referring_doctor,
           history,
           assigned_rad_id,
           due_date,
           assigned_at,
           qc_status,
           status)
        VALUES
          (%s,
           %s,
           %s,
           %s,
           NOW(),
           %s,
           %s,
           %s,
           %s,
           (SELECT org_name  FROM organization_schema.org_profile WHERE org_id = %s LIMIT 1),
           (SELECT logo_path FROM organization_schema.org_profile WHERE org_id = %s LIMIT 1),
           %s,
           %s,
           %s,
           %s,
           %s,
           %s,
           (SELECT due_at      FROM admin_schema.case_workflow WHERE case_id = %s LIMIT 1),
           (SELECT assigned_at FROM admin_schema.case_workflow WHERE case_id = %s LIMIT 1),
           (SELECT qc_status   FROM admin_schema.case_workflow WHERE case_id = %s LIMIT 1),
           'pending')
        ON CONFLICT (case_id) DO UPDATE SET
           file_path        = EXCLUDED.file_path,
           user_id          = EXCLUDED.user_id,
           scan_type        = EXCLUDED.scan_type,
           thumbnail_path   = COALESCE(EXCLUDED.thumbnail_path, radiology_schema.rad_scans.thumbnail_path),
           patient_name     = EXCLUDED.patient_name,
           patient_sex      = EXCLUDED.patient_sex,
           patient_age      = EXCLUDED.patient_age,
           ref_organisation = EXCLUDED.ref_organisation,
           org_logo_url     = EXCLUDED.org_logo_url,
           id_organisation  = EXCLUDED.id_organisation,
           priority_type    = EXCLUDED.priority_type,
           modality_study_type = EXCLUDED.modality_study_type,
           referring_doctor = EXCLUDED.referring_doctor,
           history          = EXCLUDED.history,
           assigned_rad_id  = EXCLUDED.assigned_rad_id,
           due_date         = EXCLUDED.due_date,
           assigned_at      = EXCLUDED.assigned_at,
           qc_status        = EXCLUDED.qc_status
        """,
        (
            src_row.get("case_id"),
            src_row.get("uploaded_images_path"),
            rad_user_id,
            _normalise_scan_type(src_row.get("modality_type")),
            thumbnail_path,
            src_row.get("patient_name"),
            src_row.get("gender"),
            src_row.get("age"),
            org_id,           # for org_name subquery
            org_id,           # for logo_path subquery
            org_id,
            src_row.get("priority_type"),
            src_row.get("modality_study_type"),
            src_row.get("referring_doctor"),
            src_row.get("history"),
            rad_id,
            src_row.get("case_id"),   # for due_at subquery
            src_row.get("case_id"),   # for assigned_at subquery
            src_row.get("case_id"),   # for qc_status subquery
        ),
    )


def list_returned_cases(user_id: str) -> List[Dict[str, Any]]:
    rows = _all(
        """
        SELECT *
        FROM organization_schema.returned_cases
        WHERE user_id = %s
        ORDER BY returned_at DESC
        """,
        (str(user_id),),
    )
    out = []
    for r in rows:
        out.append({
            "returned_id":            r["returned_id"],
            "original_row_id":        r.get("original_row_id"),
            "upload_id":              str(r["upload_id"]) if r.get("upload_id") else None,
            "case_id":                r.get("case_id"),
            "patient_name":           r.get("patient_name"),
            "age":                    r.get("age"),
            "gender":                 r.get("gender"),
            "priority_type":          r.get("priority_type"),
            "modality_type":          r.get("modality_type"),
            "modality_study_type":    r.get("modality_study_type"),
            "study_date":             str(r["study_date"]) if r.get("study_date") else None,
            "image_file_names":       list(r.get("image_file_names") or []),
            "uploaded_images_path":   r.get("uploaded_images_path"),
            "status":                 r.get("status"),
            "reason":                 r.get("reason"),
            "returned_at":            str(r["returned_at"]) if r.get("returned_at") else None,
            "resolved_at":            str(r["resolved_at"]) if r.get("resolved_at") else None,
        })
    return out
