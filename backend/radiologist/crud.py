# radiology/crud.py
from typing import Optional, List, Tuple, Dict, Any
from uuid import UUID
from psycopg2.extensions import connection
from datetime import datetime, timezone
import json
import re
import random
import socket
import platform


RAD_ID_PREFIX = "GENRAD-RAD-"
_RAD_ID_MAX_TRIES = 20


# ===============================================================
# Infrastructure detection
# Captures which machine + device is running the report save.
# Stored in radiology_schema.reports.infrastructure (JSONB).
# Result example:
#   { "device": "GPU",
#     "device_name": "NVIDIA GeForce RTX 4090",
#     "machine_name": "fusiongamingmasterpc-MS-7E34",
#     "ip": "100.88.115.54" }
# ===============================================================
def _detect_infrastructure() -> Dict[str, Any]:
    info: Dict[str, Any] = {"device": "CPU", "device_name": "unknown_cpu",
                            "machine_name": "unknown", "ip": "unknown"}
    try:
        info["device_name"] = platform.processor() or platform.machine() or "unknown_cpu"
    except BaseException:
        pass
    try:
        info["machine_name"] = socket.gethostname()
    except BaseException:
        pass
    try:
        info["ip"] = _detect_ip()
    except BaseException:
        pass
    try:
        import torch  # type: ignore
        if torch.cuda.is_available():
            info["device"] = "GPU"
            info["device_name"] = torch.cuda.get_device_name(0)
            return info
    except BaseException:
        pass
    try:
        import subprocess
        out = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
            stderr=subprocess.DEVNULL, timeout=2,
        ).decode().strip().splitlines()
        if out:
            info["device"] = "GPU"
            info["device_name"] = out[0]
    except BaseException:
        pass
    return info


def _detect_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))  # doesn't actually send; just resolves the route
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        try:
            return socket.gethostbyname(socket.gethostname())
        except Exception:
            return "unknown"


# -----------------------------
# Radiologist helpers
# -----------------------------
def ensure_radiologist_row(conn: connection, user_id: UUID) -> None:
    """
    Ensures radiology_schema.radiologists has a row for this user_id.
    You already have DB trigger that creates row on login. This is a safe fallback.
    """
    with conn.cursor() as cur:
        cur.execute(
            "SELECT 1 FROM radiology_schema.radiologists WHERE user_id=%s",
            (str(user_id),)
        )
        exists = cur.fetchone()
        if exists:
            return

        cur.execute(
            """
            SELECT username, email
            FROM core_schema.users
            WHERE user_id=%s
            """,
            (str(user_id),)
        )
        row = cur.fetchone()
        if not row:
            raise ValueError("User not found in core_schema.users")

        username, email = row
        first_name = (username or "").split(" ")[0] or "Unknown"
        last_name = " ".join((username or "").split(" ")[1:]).strip() or "Unknown"

        cur.execute(
            """
            INSERT INTO radiology_schema.radiologists (user_id, first_name, last_name, email)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (user_id) DO NOTHING
            """,
            (str(user_id), first_name, last_name, email)
        )
    conn.commit()


# -----------------------------
# Scans
# -----------------------------
def create_scan(
    conn: connection,
    case_id: str,
    user_id: UUID,
    scan_type: str,
    file_path: str,
    thumbnail_path: Optional[str],
    patient_name: Optional[str] = None,
    patient_sex: Optional[str] = None,
    patient_age: Optional[int] = None,
    ref_organisation: Optional[str] = None,
    org_logo_url: Optional[str] = None,
    id_organisation: Optional[UUID] = None,
) -> int:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO radiology_schema.rad_scans
              (case_id, file_path, user_id, scan_type, scan_date, thumbnail_path,
               patient_name, patient_sex, patient_age,
               ref_organisation, org_logo_url, id_organisation)
            VALUES
              (%s, %s, %s, %s, NOW(), %s,
               %s, %s, %s,
               %s, %s, %s)
            RETURNING scan_id
            """,
            (
                case_id,
                file_path,
                str(user_id),
                scan_type,
                thumbnail_path,
                patient_name,
                patient_sex,
                patient_age,
                ref_organisation,
                org_logo_url,
                str(id_organisation) if id_organisation else None,
            ),
        )
        scan_id = cur.fetchone()[0]
        # Backfill workflow fields (assigned_rad_id, qc_status, due_date, assigned_at)
        # from case_workflow (bulk-upload path) or radiologists table (admin-assigned path).
        cur.execute(
            """
            WITH src AS (
                SELECT
                    rs.scan_id,
                    COALESCE(
                        NULLIF(TRIM(CAST(cw.rad_id AS TEXT)), ''),
                        NULLIF(TRIM(CAST(r.rad_id  AS TEXT)), '')
                    )                              AS new_rad_id,
                    COALESCE(cw.qc_status, 'pending') AS new_qc_status,
                    cw.due_at    AS new_due_date,
                    cw.assigned_at AS new_assigned_at
                FROM radiology_schema.rad_scans rs
                JOIN radiology_schema.radiologists r ON r.user_id::TEXT = rs.user_id::TEXT
                LEFT JOIN admin_schema.case_workflow cw ON cw.case_id = rs.case_id
                WHERE rs.case_id = %s
            )
            UPDATE radiology_schema.rad_scans rs
            SET
                assigned_rad_id = COALESCE(NULLIF(src.new_rad_id, ''),   NULLIF(rs.assigned_rad_id, '')),
                qc_status       = COALESCE(rs.qc_status,  src.new_qc_status),
                due_date        = COALESCE(rs.due_date,   src.new_due_date),
                assigned_at     = COALESCE(rs.assigned_at, src.new_assigned_at)
            FROM src
            WHERE rs.scan_id = src.scan_id
            """,
            (case_id,),
        )
    conn.commit()
    return scan_id


def list_scans(conn: connection, user_id: Optional[UUID] = None) -> List[Tuple]:
    with conn.cursor() as cur:
        if user_id:
            cur.execute(
                """
                SELECT
                    scan_id, case_id, user_id, scan_type, scan_date,
                    file_path, thumbnail_path,
                    patient_name, patient_sex, patient_age,
                    ref_organisation, org_logo_url, id_organisation
                FROM radiology_schema.rad_scans
                WHERE user_id=%s
                ORDER BY scan_date DESC
                """,
                (str(user_id),),
            )
        else:
            cur.execute(
                """
                SELECT
                    scan_id, case_id, user_id, scan_type, scan_date,
                    file_path, thumbnail_path,
                    patient_name, patient_sex, patient_age,
                    ref_organisation, org_logo_url, id_organisation
                FROM radiology_schema.rad_scans
                ORDER BY scan_date DESC
                """
            )
        return cur.fetchall()


def get_radiologist_master_info(
    conn: connection, user_id: UUID
) -> Tuple[bool, Optional[str]]:
    """Returns (is_master, rad_id) for the radiologist identified by user_id."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT COALESCE(is_master, FALSE), rad_id
            FROM radiology_schema.radiologists
            WHERE user_id=%s
            """,
            (str(user_id),),
        )
        row = cur.fetchone()
        if not row:
            return False, None
        return bool(row[0]), row[1]


def list_scans_for_radiologist(
    conn: connection, *, is_master: bool, rad_id: Optional[str]
) -> List[Tuple]:
    """Master radiologists see every scan; everyone else sees only scans
    whose assigned_rad_id matches their rad_id."""
    with conn.cursor() as cur:
        select_cols = """
                    scan_id, case_id, user_id, scan_type, scan_date,
                    file_path, thumbnail_path,
                    patient_name, patient_sex, patient_age,
                    ref_organisation, org_logo_url, id_organisation,
                    COALESCE(priority_type, 'routine') AS priority_type,
                    COALESCE(status, 'pending') AS status,
                    modality_study_type,
                    s3_key, storage_type"""
        if is_master:
            cur.execute(
                f"SELECT {select_cols} FROM radiology_schema.rad_scans ORDER BY scan_date DESC"
            )
        else:
            if not rad_id:
                return []
            cur.execute(
                f"SELECT {select_cols} FROM radiology_schema.rad_scans WHERE assigned_rad_id=%s ORDER BY scan_date DESC",
                (rad_id,),
            )
        return cur.fetchall()


def assign_scan(conn: connection, case_id: str, rad_id: str) -> Optional[Dict[str, Any]]:
    """Set assigned_rad_id on the rad_scans row for case_id. Returns the
    updated row summary, or None if no matching case exists."""
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE radiology_schema.rad_scans
               SET assigned_rad_id=%s
             WHERE case_id=%s
            RETURNING scan_id, case_id, assigned_rad_id
            """,
            (rad_id, case_id),
        )
        row = cur.fetchone()
        if not row:
            conn.rollback()
            return None
    conn.commit()
    return {
        "scan_id": row[0],
        "case_id": row[1],
        "assigned_rad_id": row[2],
    }


def set_scan_status(
    conn: connection, case_id: str, status: str
) -> Optional[Dict[str, Any]]:
    """Set rad_scans.status for every row with case_id. Returns the updated
    row summary (case_id + status) or None if no matching case exists."""
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE radiology_schema.rad_scans
               SET status=%s
             WHERE case_id=%s
            RETURNING case_id, status
            """,
            (status, case_id),
        )
        row = cur.fetchone()
        if not row:
            conn.rollback()
            return None
    conn.commit()
    return {"case_id": row[0], "status": row[1]}


def get_scan_by_case(conn: connection, case_id: str) -> Dict[str, Any]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
              scan_id, case_id, user_id, scan_type, scan_date,
              file_path, thumbnail_path,
              patient_name, patient_sex, patient_age,
              ref_organisation, org_logo_url, id_organisation
            FROM radiology_schema.rad_scans
            WHERE case_id=%s
            """,
            (case_id,),
        )
        r = cur.fetchone()
        if not r:
            return {}
        return {
            "scan_id": r[0],
            "case_id": r[1],
            "user_id": str(r[2]),
            "scan_type": r[3],
            "scan_date": r[4].isoformat() if r[4] else None,
            "file_path": r[5],
            "thumbnail_path": r[6],
            "patient_name": r[7],
            "patient_sex": r[8],
            "patient_age": r[9],
            "ref_organisation": r[10],
            "org_logo_url": r[11],
            "id_organisation": str(r[12]) if r[12] else None,
        }


# -----------------------------
# Radiologist profile
# -----------------------------
def get_radiologist(conn: connection, user_id: UUID) -> dict:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT user_id, first_name, last_name, email, qualification,
                verification_status, profile_image_path, degree_path,
                signature_path, designation,
                user_lab_name, lab_address, department, lab_logo_url,
                rad_id
            FROM radiology_schema.radiologists
            WHERE user_id=%s
            """,
            (str(user_id),),
        )
        row = cur.fetchone()
        if not row:
            return {}
        return {
            "user_id": str(row[0]),
            "first_name": row[1],
            "last_name": row[2],
            "email": row[3],
            "qualification": row[4] or "",
            "verification_status": row[5] or "not_submitted",
            "profile_image_path": row[6],
            "degree_path": row[7],
            "signature_path": row[8],
            "designation": row[9] or "",
            "user_lab_name": row[10] or "",
            "lab_address": row[11] or "",
            "department": row[12] or "",
            "lab_logo_url": row[13] or "",
            "rad_id": row[14] or "",
        }


# -----------------------------
# rad_id (public-facing radiologist code: GENRAD-RAD-XXXXXX)
# -----------------------------
def _generate_rad_id_candidate() -> str:
    return f"{RAD_ID_PREFIX}{random.randint(100000, 999999)}"


def ensure_rad_id(conn: connection, user_id: UUID) -> Optional[str]:
    """
    Assigns a GENRAD-RAD-XXXXXX code to the radiologist if one is not already set.
    Idempotent: returns the existing rad_id when present, otherwise generates
    a unique 6-digit code, persists it, and returns it.
    """
    with conn.cursor() as cur:
        cur.execute(
            "SELECT rad_id FROM radiology_schema.radiologists WHERE user_id=%s",
            (str(user_id),),
        )
        row = cur.fetchone()
        if not row:
            return None
        if row[0]:
            return row[0]

    for _ in range(_RAD_ID_MAX_TRIES):
        candidate = _generate_rad_id_candidate()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE radiology_schema.radiologists
                    SET rad_id=%s, updated_at=NOW()
                    WHERE user_id=%s AND rad_id IS NULL
                    """,
                    (candidate, str(user_id)),
                )
            conn.commit()
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT rad_id FROM radiology_schema.radiologists WHERE user_id=%s",
                    (str(user_id),),
                )
                final = cur.fetchone()
            if final and final[0] == candidate:
                return candidate
        except Exception:
            conn.rollback()
            continue
    return None


def get_radiologist_email(conn: connection, user_id: UUID) -> str:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT email FROM radiology_schema.radiologists WHERE user_id=%s",
            (str(user_id),)
        )
        r = cur.fetchone()
        return r[0] if r else ""


def update_qualification(conn: connection, user_id: UUID, qualification: str) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE radiology_schema.radiologists
            SET qualification=%s, updated_at=NOW()
            WHERE user_id=%s
            """,
            (qualification, str(user_id))
        )
    conn.commit()


def update_profile_image_path(conn: connection, user_id: UUID, path: str) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE radiology_schema.radiologists
            SET profile_image_path=%s, updated_at=NOW()
            WHERE user_id=%s
            """,
            (path, str(user_id))
        )
    conn.commit()


def update_degree_path(conn: connection, user_id: UUID, path: str) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE radiology_schema.radiologists
            SET degree_path=%s, updated_at=NOW()
            WHERE user_id=%s
            """,
            (path, str(user_id))
        )
    conn.commit()


def update_signature_path(conn: connection, user_id: UUID, path: str) -> None:
    with conn.cursor() as cur:
        try:
            cur.execute(
                """
                UPDATE radiology_schema.radiologists
                SET signature_path=%s, signature_updated_at=NOW(), updated_at=NOW()
                WHERE user_id=%s
                """,
                (path, str(user_id))
            )
        except Exception:
            # Fallback for older schemas that don't have signature_updated_at.
            # Without it the UPDATE above aborts the whole transaction, so the
            # path never persists and the profile keeps showing "Not uploaded".
            conn.rollback()
            cur.execute(
                """
                UPDATE radiology_schema.radiologists
                SET signature_path=%s, updated_at=NOW()
                WHERE user_id=%s
                """,
                (path, str(user_id))
            )
    conn.commit()


# -----------------------------
# Reports (radiology_schema.reports)
# -----------------------------
def get_report(conn: connection, case_id: str, user_id: UUID) -> Dict[str, Any]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
            r.report_id, r.case_id, r.user_id,
            r.patient_name, r.patient_age, r.patient_sex,
            r.referring_doctor, r.scan_datetime, r.clinical_indication,
            r.technique, r.findings, r.impression, r.opinions,
            r.ai_technique, r.ai_findings, r.ai_impression, r.ai_opinions,
            r.radiologist_name, r.qualification, r.designation,
            r.user_lab_name, r.lab_address, r.department, r.lab_logo_url,
            rad.signature_path,
            r.created_at, r.updated_at,
            r.infrastructure, r.eta_report,
            rad.first_name, rad.last_name,
            rad.qualification AS rad_qualification,
            rad.designation   AS rad_designation,
            rad.user_lab_name AS rad_user_lab_name,
            rad.lab_address   AS rad_lab_address,
            rad.department    AS rad_department,
            rad.lab_logo_url  AS rad_lab_logo_url
            FROM radiology_schema.reports r
            LEFT JOIN radiology_schema.radiologists rad
            ON rad.user_id = r.user_id
            WHERE r.case_id=%s AND r.user_id=%s
            """,
            (case_id, str(user_id)),


        )
        r = cur.fetchone()
        if not r:
            return {}

        # Always prefer the CURRENT radiologist profile (from the JOIN) over
        # the reports-row snapshot. Older rows still carry stale values like
        # "JOHN BAKER" or "Dr. Dr. Palak" from earlier seed/test runs; if we
        # honor those, every case looks different even though the logged-in
        # radiologist is the same. The snapshot is only used as a last
        # resort when the user_id has no matching radiologists row.
        rad_first = (r[29] or "").strip()
        rad_last = (r[30] or "").strip()
        first_clean = re.sub(r"^(?:dr\.?\s+)+", "", rad_first, flags=re.IGNORECASE).strip()
        derived_rad_name = ""
        if first_clean or rad_last:
            derived_rad_name = f"Dr. {first_clean} {rad_last}".strip()

        return {
            "report_id": str(r[0]),
            "case_id": r[1],
            "user_id": str(r[2]),
            "patient_name": r[3],
            "patient_age": r[4],
            "patient_sex": r[5],
            "referring_doctor": r[6],
            "scan_datetime": r[7].isoformat() if r[7] else None,
            "clinical_indication": r[8],
            "technique": r[9],
            "findings": r[10],
            "impression": r[11],
            "opinions": r[12],
            "ai_technique": r[13],
            "ai_findings": r[14],
            "ai_impression": r[15],
            "ai_opinions": r[16],
            "radiologist_name": derived_rad_name or r[17] or "",
            "qualification": r[31] or r[18] or "",
            "designation": r[32] or r[19] or "",
            "user_lab_name": r[33] or r[20] or "",
            "lab_address": r[34] or r[21] or "",
            "department": r[35] or r[22] or "",
            "lab_logo_url": r[36] or r[23] or "",
            "signature_path": r[24],
            "created_at": r[25].isoformat() if r[25] else None,
            "updated_at": r[26].isoformat() if r[26] else None,
            "infrastructure": r[27],  # JSONB auto-decodes to dict via psycopg2
            "eta_report": float(r[28]) if r[28] is not None else None,
        }


# -----------------------------
# Reports (radiology_schema.reports)
# -----------------------------

def get_or_create_report(conn: connection, case_id: str, user_id: UUID) -> Dict[str, Any]:
    """
    Creates report row if missing.
    Snapshots:
      - Patient details from rad_scans
      - Radiologist + lab details from radiologists
    """

    with conn.cursor() as cur:

        # 1️⃣ Check if report already exists
        cur.execute(
            """
            SELECT report_id
            FROM radiology_schema.reports
            WHERE case_id=%s AND user_id=%s
            """,
            (case_id, str(user_id)),
        )
        if cur.fetchone():
            return get_report(conn, case_id, user_id)

        # 2️⃣ Get patient details from rad_scans
        cur.execute(
            """
            SELECT patient_name, patient_age, patient_sex
            FROM radiology_schema.rad_scans
            WHERE case_id=%s
            ORDER BY scan_date DESC
            LIMIT 1
            """,
            (case_id,),
        )
        scan_row = cur.fetchone()

        if not scan_row:
            raise ValueError("No scan found for case_id")

        patient_name, patient_age, patient_sex = scan_row

        # 3️⃣ Get radiologist details
        cur.execute(
            """
            SELECT
                first_name, last_name,
                qualification, designation,
                user_lab_name, lab_address,
                department, lab_logo_url
            FROM radiology_schema.radiologists
            WHERE user_id=%s
            """,
            (str(user_id),),
        )
        rad_row = cur.fetchone()

        if not rad_row:
            raise ValueError("Radiologist not found")

        (
            first_name,
            last_name,
            qualification,
            designation,
            user_lab_name,
            lab_address,
            department,
            lab_logo_url,
        ) = rad_row

        # Strip an existing "Dr." prefix from first_name so we don't end up
        # with "Dr. Dr. Foo" when first_name was saved as "Dr. Foo".
        first_clean = re.sub(r"^(?:dr\.?\s+)+", "", (first_name or "").strip(), flags=re.IGNORECASE).strip()
        last_clean = (last_name or "").strip()
        if first_clean or last_clean:
            radiologist_name = f"Dr. {first_clean} {last_clean}".strip()
        else:
            radiologist_name = ""

        # 4️⃣ Insert report snapshot
        cur.execute(
            """
            INSERT INTO radiology_schema.reports (
                case_id, user_id,
                patient_name, patient_age, patient_sex,
                radiologist_name, qualification, designation,
                user_lab_name, lab_address, department, lab_logo_url
            )
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """,
            (
                case_id,
                str(user_id),
                patient_name,
                patient_age,
                patient_sex,
                radiologist_name,
                qualification,
                designation,
                user_lab_name,
                lab_address,
                department,
                lab_logo_url,
            ),
        )

    conn.commit()
    return get_report(conn, case_id, user_id)




# ✅ UPDATED: Added ai_* parameters for edit persistence
#             + infrastructure (auto-detected) + eta_report (from frontend)
def upsert_report(
    conn: connection,
    case_id: str,
    user_id: UUID,
    referring_doctor: Optional[str] = None,
    scan_datetime_iso: Optional[str] = None,
    clinical_indication: Optional[str] = None,
    technique: Optional[str] = None,
    findings: Optional[str] = None,
    impression: Optional[str] = None,
    opinions: Optional[str] = None,
    # ✅ ADDED: AI fields for edit persistence
    ai_technique: Optional[str] = None,
    ai_findings: Optional[str] = None,
    ai_impression: Optional[str] = None,
    ai_opinions: Optional[str] = None,
    # ✅ ADDED: ETA (frontend-tracked seconds) — None preserves existing value on re-save
    eta_report: Optional[float] = None,
) -> Dict[str, Any]:
    # Always re-detect infrastructure on save — reflects the machine handling this save
    infra = _detect_infrastructure()
    infra_json = json.dumps(infra)

    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO radiology_schema.reports
              (case_id, user_id, referring_doctor, scan_datetime, clinical_indication,
               technique, findings, impression, opinions,
               ai_technique, ai_findings, ai_impression, ai_opinions,
               infrastructure, eta_report)
            VALUES
              (%s, %s, %s, %s, %s,
               %s, %s, %s, %s,
               %s, %s, %s, %s,
               %s::jsonb, %s)
            ON CONFLICT (case_id, user_id)
            DO UPDATE SET
              referring_doctor=EXCLUDED.referring_doctor,
              scan_datetime=EXCLUDED.scan_datetime,
              clinical_indication=EXCLUDED.clinical_indication,
              technique=EXCLUDED.technique,
              findings=EXCLUDED.findings,
              impression=EXCLUDED.impression,
              opinions=EXCLUDED.opinions,
              ai_technique=EXCLUDED.ai_technique,
              ai_findings=EXCLUDED.ai_findings,
              ai_impression=EXCLUDED.ai_impression,
              ai_opinions=EXCLUDED.ai_opinions,
              infrastructure=EXCLUDED.infrastructure,
              -- Preserve existing eta_report when caller did not provide a new value
              eta_report=COALESCE(EXCLUDED.eta_report, radiology_schema.reports.eta_report),
              updated_at=NOW()
            RETURNING report_id
            """,
            (
                case_id,
                str(user_id),
                referring_doctor,
                scan_datetime_iso,
                clinical_indication,
                technique,
                findings,
                impression,
                opinions,
                ai_technique,
                ai_findings,
                ai_impression,
                ai_opinions,
                infra_json,
                eta_report,
            ),
        )
        _ = cur.fetchone()
    conn.commit()
    return get_report(conn, case_id, user_id)


def get_report_with_scan_for_qc(
    conn: connection, case_id: str, user_id: UUID
) -> Optional[Dict[str, Any]]:
    """Merged report + latest rad_scans row, shaped for qc_service._build_payload."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
              r.case_id, r.patient_name, r.patient_age, r.patient_sex,
              r.referring_doctor, r.scan_datetime, r.clinical_indication,
              r.technique, r.findings, r.impression, r.opinions,
              r.radiologist_name, r.qualification, r.updated_at,
              rs.scan_date, rs.scan_type
            FROM radiology_schema.reports r
            LEFT JOIN radiology_schema.rad_scans rs
              ON rs.case_id = r.case_id
            WHERE r.case_id = %s AND r.user_id = %s
            ORDER BY rs.scan_date DESC NULLS LAST
            LIMIT 1
            """,
            (case_id, str(user_id)),
        )
        row = cur.fetchone()
        if not row:
            return None
        return {
            "case_id": row[0],
            "patient_name": row[1],
            "patient_age": row[2],
            "patient_sex": row[3],
            "referring_doctor": row[4],
            "scan_datetime": row[5].isoformat() if row[5] else None,
            "clinical_indication": row[6],
            "technique": row[7],
            "findings": row[8],
            "impression": row[9],
            "opinions": row[10],
            "radiologist_name": row[11],
            "qualification": row[12],
            "updated_at": row[13].isoformat() if row[13] else None,
            "scan_date": row[14].isoformat() if row[14] else None,
            "scan_type": row[15],
        }


def update_qc_status(
    conn: connection, case_id: str, user_id: UUID, status: str
) -> None:
    """Persist QC verdict onto rad_scans.qc_status for every row with this case_id."""
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE radiology_schema.rad_scans SET qc_status = %s WHERE case_id = %s",
            (status, case_id),
        )
    conn.commit()


def mark_report_completed(
    conn: connection, case_id: str, user_id: UUID
) -> Dict[str, Any]:
    """Finalize a report after QC pass:
    1. Promote ai_* into main columns when the main column is empty (so the
       'last saved' AI version becomes the canonical report body).
    2. Flip admin_schema.case_workflow.current_status to 'completed' for this case.
    Raises ValueError if no report row exists for (case_id, user_id).
    """
    with conn.cursor() as cur:
        cur.execute(
            "SELECT 1 FROM radiology_schema.reports WHERE case_id=%s AND user_id=%s",
            (case_id, str(user_id)),
        )
        if not cur.fetchone():
            raise ValueError("Report not found")

        cur.execute(
            """
            UPDATE radiology_schema.reports
            SET
              technique  = COALESCE(NULLIF(technique,  ''), ai_technique,  technique),
              findings   = COALESCE(NULLIF(findings,   ''), ai_findings,   findings),
              impression = COALESCE(NULLIF(impression, ''), ai_impression, impression),
              opinions   = COALESCE(NULLIF(opinions,   ''), ai_opinions,   opinions),
              updated_at = NOW()
            WHERE case_id = %s AND user_id = %s
            """,
            (case_id, str(user_id)),
        )

        # Workflow row may not exist for ad-hoc / demo cases — that's fine.
        cur.execute(
            """
            UPDATE admin_schema.case_workflow
            SET current_status = 'completed'
            WHERE case_id = %s
            """,
            (case_id,),
        )

    conn.commit()
    return get_report(conn, case_id, user_id)




# -----------------------------
# Annotations (radiology_schema.annotations)
# -----------------------------
def list_annotations(conn: connection, case_id: str, viewer_user_id: str) -> List[Dict[str, Any]]:
    """
    Show:
      - everybody annotations for the case (visible to all)
      - mine annotations only for the logged-in user (viewer_user_id)
    Also returns username like: "Dr. First Last"
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
              a.annotation_id, a.case_id, a.user_id,
              a.annotation_type, a.visibility, a.title, a.comments, a.tool_data,
              a.created_at, a.updated_at,
              r.first_name, r.last_name
            FROM radiology_schema.annotations a
            LEFT JOIN radiology_schema.radiologists r
              ON r.user_id = a.user_id
            WHERE a.case_id=%s
              AND (
                a.visibility = 'everybody'
                OR (a.visibility = 'mine' AND a.user_id = %s::uuid)
              )
            ORDER BY a.created_at DESC
            """,
            (case_id, viewer_user_id),
        )
        rows = cur.fetchall()

    out: List[Dict[str, Any]] = []
    for r in rows:
        first_name = r[10] or ""
        last_name = r[11] or ""
        username = f"Dr. {first_name} {last_name}".strip()

        out.append({
            "annotation_id": str(r[0]),
            "case_id": r[1],
            "user_id": str(r[2]),
            "annotation_type": r[3],
            "visibility": r[4],
            "title": r[5],
            "comments": r[6],
            "tool_data": r[7],
            "created_at": r[8].isoformat() if r[8] else None,
            "updated_at": r[9].isoformat() if r[9] else None,
            "username": username,
        })
    return out



def create_annotation(
    conn: connection,
    case_id: str,
    user_id: UUID,
    annotation_type: str,
    visibility: str,
    title: Optional[str],
    comments: Optional[str],
    tool_data: Dict[str, Any],
) -> Dict[str, Any]:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO radiology_schema.annotations
              (case_id, user_id, annotation_type, visibility, title, comments, tool_data)
            VALUES
              (%s, %s, %s, %s, %s, %s, %s::jsonb)
            RETURNING annotation_id
            """,
            (case_id, str(user_id), annotation_type, visibility, title, comments, json.dumps(tool_data or {})),
        )
        ann_id = cur.fetchone()[0]
    conn.commit()

    # return created row
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
              annotation_id, case_id, user_id,
              annotation_type, visibility, title, comments, tool_data,
              created_at, updated_at
            FROM radiology_schema.annotations
            WHERE annotation_id=%s
            """,
            (str(ann_id),),
        )
        r = cur.fetchone()

    return {
        "annotation_id": str(r[0]),
        "case_id": r[1],
        "user_id": str(r[2]),
        "annotation_type": r[3],
        "visibility": r[4],
        "title": r[5],
        "comments": r[6],
        "tool_data": r[7],
        "created_at": r[8].isoformat() if r[8] else None,
        "updated_at": r[9].isoformat() if r[9] else None,
    }


def delete_annotation(conn: connection, annotation_id: UUID) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "DELETE FROM radiology_schema.annotations WHERE annotation_id=%s",
            (str(annotation_id),),
        )
    conn.commit()


# -----------------------------
# Live chat (radiology_schema.live_chat)
# -----------------------------
def list_chat(conn: connection, case_id: str, limit: int = 200) -> List[Dict[str, Any]]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
              lc.chat_id,
              lc.case_id,
              lc.user_id,
              lc.message,
              lc.sent_at,
              lc.is_edited,
              lc.is_deleted,
              r.first_name,
              r.last_name
            FROM radiology_schema.live_chat lc
            LEFT JOIN radiology_schema.radiologists r
              ON r.user_id = lc.user_id
            WHERE lc.case_id=%s
              AND COALESCE(lc.is_deleted,false) = false
            ORDER BY lc.sent_at ASC
            LIMIT %s
            """,
            (case_id, int(limit)),
        )
        rows = cur.fetchall()

    out: List[Dict[str, Any]] = []
    for r in rows:
        first_name = r[7] or ""
        last_name = r[8] or ""
        username = f"DR. {first_name} {last_name}".strip()

        out.append({
            "chat_id": str(r[0]),
            "case_id": r[1],
            "user_id": str(r[2]),
            "message": r[3],
            "sent_at": r[4].isoformat() if r[4] else None,
            "is_edited": bool(r[5]),
            "is_deleted": bool(r[6]),
            "username": username,
        })

    return out


def create_chat_message(conn: connection, case_id: str, user_id: UUID, message: str) -> Dict[str, Any]:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO radiology_schema.live_chat (case_id, user_id, message)
            VALUES (%s, %s, %s)
            RETURNING chat_id
            """,
            (case_id, str(user_id), message),
        )
        chat_id = cur.fetchone()[0]
    conn.commit()

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT chat_id, case_id, user_id, message, sent_at, is_edited, is_deleted
            FROM radiology_schema.live_chat
            WHERE chat_id=%s
            """,
            (str(chat_id),),
        )
        r = cur.fetchone()

    return {
        "chat_id": str(r[0]),
        "case_id": r[1],
        "user_id": str(r[2]),
        "message": r[3],
        "sent_at": r[4].isoformat() if r[4] else None,
        "is_edited": bool(r[5]),
        "is_deleted": bool(r[6]),
    }





def delete_chat_message(conn: connection, chat_id: UUID, user_id: UUID) -> bool:
    """Soft-delete chat message. Only owner can delete."""
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE radiology_schema.live_chat
            SET is_deleted = true
            WHERE chat_id=%s AND user_id=%s
            """,
            (str(chat_id), str(user_id)),
        )
        ok = cur.rowcount > 0
    conn.commit()
    return ok


# -----------------------------
# AI chat (radiology_schema.ai_chat) — "Ask onix.ai" panel
# -----------------------------
def list_ai_chat(conn: connection, case_id: str, limit: int = 200) -> List[Dict[str, Any]]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT chat_id, case_id, user_id, chatted_by, chat_text, model, image_path, created_at
            FROM radiology_schema.ai_chat
            WHERE case_id=%s
            ORDER BY created_at ASC
            LIMIT %s
            """,
            (case_id, int(limit)),
        )
        rows = cur.fetchall()
    out: List[Dict[str, Any]] = []
    for r in rows:
        out.append({
            "chat_id": str(r[0]),
            "case_id": r[1],
            "user_id": str(r[2]) if r[2] else None,
            "chatted_by": r[3],
            "chat_text": r[4],
            "model": r[5],
            "image_path": r[6],
            "created_at": r[7].isoformat() if r[7] else None,
        })
    return out


def create_ai_chat(
    conn: connection,
    case_id: Optional[str],
    user_id: UUID,
    chatted_by: str,
    chat_text: str,
    model: Optional[str] = None,
    image_path: Optional[str] = None,
) -> Dict[str, Any]:
    if chatted_by not in ("user", "ai"):
        raise ValueError("chatted_by must be 'user' or 'ai'")
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO radiology_schema.ai_chat
              (case_id, user_id, chatted_by, chat_text, model, image_path)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING chat_id, created_at
            """,
            (case_id, str(user_id), chatted_by, chat_text, model, image_path),
        )
        chat_id, created_at = cur.fetchone()
    conn.commit()
    return {
        "chat_id": str(chat_id),
        "case_id": case_id,
        "user_id": str(user_id),
        "chatted_by": chatted_by,
        "chat_text": chat_text,
        "model": model,
        "image_path": image_path,
        "created_at": created_at.isoformat() if created_at else None,
    }


# =========================================================
# Report export (store printed/downloaded PDF in backend)
# Requires columns in radiology_schema.reports:
#   report_file_path TEXT,
#   report_html TEXT,
#   report_format VARCHAR(10),
#   exported_at TIMESTAMPTZ
# =========================================================
def save_report_export(conn, case_id: str, user_id,  report_format: str,
                      report_file_path: str):
    """Upsert report export metadata into radiology_schema.reports."""
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO radiology_schema.reports (case_id, user_id,  report_file_path, report_format, exported_at)
            VALUES (%s, %s, %s, %s, now())
            ON CONFLICT (case_id, user_id)
            DO UPDATE SET
               
                report_file_path = EXCLUDED.report_file_path,
                report_format = EXCLUDED.report_format,
                exported_at = now(),
                updated_at = now()
            RETURNING report_id, case_id, user_id, report_file_path, exported_at
            """,
            (case_id, str(user_id), report_file_path, report_format),
        )
        row = cur.fetchone()
    conn.commit()
    return {
        "report_id": str(row[0]),
        "case_id": row[1],
        "user_id": str(row[2]),
        "report_file_path": row[3],
        "exported_at": row[4].isoformat() if row[4] else None,
    }
