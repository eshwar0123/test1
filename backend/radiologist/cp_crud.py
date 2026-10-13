# radiology/crud.py
from typing import Optional, List, Tuple, Dict, Any
from uuid import UUID
from psycopg2.extensions import connection
from datetime import datetime, timezone
import json

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
                user_lab_name, lab_address, department, lab_logo_url
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
        }


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
        cur.execute(
            """
            UPDATE radiology_schema.radiologists
            SET signature_path=%s, signature_updated_at=NOW(), updated_at=NOW()
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
            r.radiologist_name, r.qualification, r.designation,
            r.user_lab_name, r.lab_address, r.department, r.lab_logo_url,
            rad.signature_path,
            r.created_at, r.updated_at
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
            "radiologist_name": r[13],
            "qualification": r[14],
            "designation": r[15],
            "user_lab_name": r[16],
            "lab_address": r[17],
            "department": r[18],
            "lab_logo_url": r[19],
            "signature_path": r[20],

            "created_at": r[21].isoformat() if r[21] else None,
            "updated_at": r[22].isoformat() if r[22] else None,
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

        radiologist_name = f"Dr. {first_name} {last_name}"

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



def upsert_report(
    conn: connection,
    case_id: str,
    user_id: UUID,
    referring_doctor: Optional[str] = None,
    scan_datetime_iso: Optional[str] = None,  # ISO string from frontend
    clinical_indication: Optional[str] = None,
    technique: Optional[str] = None,
    findings: Optional[str] = None,
    impression: Optional[str] = None,
    opinions: Optional[str] = None,
) -> Dict[str, Any]:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO radiology_schema.reports
              (case_id, user_id, referring_doctor, scan_datetime, clinical_indication,
               technique, findings, impression, opinions)
            VALUES
              (%s, %s, %s, %s, %s,
               %s, %s, %s, %s)
            ON CONFLICT (case_id, user_id)
            DO UPDATE SET
              referring_doctor=EXCLUDED.referring_doctor,
              scan_datetime=EXCLUDED.scan_datetime,
              clinical_indication=EXCLUDED.clinical_indication,
              technique=EXCLUDED.technique,
              findings=EXCLUDED.findings,
              impression=EXCLUDED.impression,
              opinions=EXCLUDED.opinions
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
            ),
        )
        _ = cur.fetchone()
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
