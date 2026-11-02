"""
backend/share/crud.py

Patient image links: one read-only link per submitted case, valid for 24 hours
from the report's submit time (reports.completed_at, a naive IST timestamp ->
converted with AT TIME ZONE 'Asia/Kolkata'). Every link has its own password
(access_code); the patient must enter it to open the images. The technician can
issue a fresh link (new token + new password, 24h from now) for the same case
at any time; issuing one revokes the previous link.
"""
import os
import secrets
from typing import Any, Dict, List, Optional

from database import get_conn

PATIENT_LINK_BASE_URL = os.getenv("PATIENT_LINK_BASE_URL", "https://onixai.in").rstrip("/")
MAX_PASSWORD_ATTEMPTS = int(os.getenv("PATIENT_LINK_MAX_ATTEMPTS", "5"))
# No 0/O/1/I/L so the password is easy to read out and type.
_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def new_access_code() -> str:
    return "".join(secrets.choice(_CODE_ALPHABET) for _ in range(8))

_SCHEMA_READY = False


def ensure_schema(conn) -> None:
    global _SCHEMA_READY
    if _SCHEMA_READY:
        return
    with conn.cursor() as cur:
        cur.execute("CREATE SCHEMA IF NOT EXISTS share_schema")
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS share_schema.patient_view_links (
              link_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              case_id          TEXT NOT NULL,
              org_id           TEXT,
              token            TEXT NOT NULL UNIQUE,
              expires_at       TIMESTAMPTZ NOT NULL,
              revoked_at       TIMESTAMPTZ,
              access_count     INT NOT NULL DEFAULT 0,
              last_accessed_at TIMESTAMPTZ,
              created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS patient_view_links_case_id_idx "
            "ON share_schema.patient_view_links (case_id)"
        )
        cur.execute("ALTER TABLE share_schema.patient_view_links ADD COLUMN IF NOT EXISTS access_code TEXT")
        cur.execute(
            "ALTER TABLE share_schema.patient_view_links "
            "ADD COLUMN IF NOT EXISTS failed_attempts INT NOT NULL DEFAULT 0"
        )
    conn.commit()
    _SCHEMA_READY = True


def link_url(token: str) -> str:
    return f"{PATIENT_LINK_BASE_URL}/view/{token}"


def create_link_for_case(conn, case_id: str, report_user_id: str) -> Optional[Dict[str, Any]]:
    """Called right after a report is submitted. Expires any earlier link for the
    case (resubmit => old link dies, new one is issued) and inserts a new one with
    expires_at = completed_at + 24h. Returns None if the report has no completed_at.
    Commits on success."""
    ensure_schema(conn)
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT (completed_at AT TIME ZONE 'Asia/Kolkata') + INTERVAL '24 hours'
              FROM radiology_schema.reports
             WHERE case_id = %s AND user_id = %s AND completed_at IS NOT NULL
             LIMIT 1
            """,
            (case_id, str(report_user_id)),
        )
        row = cur.fetchone()
        if not row or row[0] is None:
            return None
        expires_at = row[0]

        cur.execute(
            "SELECT id_organisation FROM radiology_schema.rad_scans WHERE case_id = %s LIMIT 1",
            (case_id,),
        )
        r = cur.fetchone()
        org_id = str(r[0]) if r and r[0] else None

        link_id, token, code, exp = _issue_link(cur, case_id, org_id, expires_at)
    conn.commit()
    return {"link_id": link_id, "token": token, "access_code": code, "expires_at": exp}


def _issue_link(cur, case_id: str, org_id: Optional[str], expires_at):
    """Revoke the case's earlier link(s) and insert a new one with its own password."""
    cur.execute(
        """
        UPDATE share_schema.patient_view_links
           SET revoked_at = NOW()
         WHERE case_id = %s AND revoked_at IS NULL
        """,
        (case_id,),
    )
    token = secrets.token_urlsafe(32)
    code = new_access_code()
    cur.execute(
        """
        INSERT INTO share_schema.patient_view_links (case_id, org_id, token, expires_at, access_code)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING link_id, expires_at
        """,
        (case_id, org_id, token, expires_at, code),
    )
    link_id, exp = cur.fetchone()
    return str(link_id), token, code, exp


def create_fresh_link(conn, case_id: str, org_id: str) -> Dict[str, Any]:
    """Technician-requested link for a submitted case of their own organization:
    new token + new password, valid 24h from now. The previous link stops working.
    Raises ValueError with a user-facing message when the case isn't eligible."""
    ensure_schema(conn)
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id_organisation FROM radiology_schema.rad_scans WHERE case_id = %s LIMIT 1",
            (case_id,),
        )
        r = cur.fetchone()
        if not r or not r[0] or str(r[0]) != str(org_id):
            raise ValueError("Case not found for your organization")
        cur.execute(
            "SELECT 1 FROM radiology_schema.reports WHERE case_id = %s AND completed_at IS NOT NULL LIMIT 1",
            (case_id,),
        )
        if not cur.fetchone():
            raise ValueError("A link can only be created after the report is submitted")
        cur.execute("SELECT NOW() + INTERVAL '24 hours'")
        expires_at = cur.fetchone()[0]
        link_id, token, code, exp = _issue_link(cur, case_id, str(org_id), expires_at)
    conn.commit()
    return {"url": link_url(token), "password": code, "expires_at": exp.isoformat(), "expired": False}


def get_link_by_token(conn, token: str) -> Optional[Dict[str, Any]]:
    ensure_schema(conn)
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT link_id, case_id, expires_at, revoked_at,
                   (expires_at > NOW() AND revoked_at IS NULL) AS active,
                   access_code, failed_attempts
              FROM share_schema.patient_view_links
             WHERE token = %s
            """,
            (token,),
        )
        r = cur.fetchone()
    if not r:
        return None
    return {
        "link_id": r[0], "case_id": r[1], "expires_at": r[2], "revoked_at": r[3], "active": r[4],
        "access_code": r[5], "failed_attempts": r[6] or 0,
    }


def register_failed_attempt(conn, link_id) -> int:
    """Count a wrong password; returns the new total."""
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE share_schema.patient_view_links SET failed_attempts = failed_attempts + 1 "
            "WHERE link_id = %s RETURNING failed_attempts",
            (link_id,),
        )
        n = cur.fetchone()[0]
    conn.commit()
    return n


def reset_failed_attempts(conn, link_id) -> None:
    with conn.cursor() as cur:
        cur.execute("UPDATE share_schema.patient_view_links SET failed_attempts = 0 WHERE link_id = %s", (link_id,))
    conn.commit()


def record_access(conn, link_id) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE share_schema.patient_view_links
               SET access_count = access_count + 1, last_accessed_at = NOW()
             WHERE link_id = %s
            """,
            (link_id,),
        )
    conn.commit()


def latest_links_for_cases(conn, case_ids: List[str], org_id: str) -> Dict[str, Dict[str, Any]]:
    """Newest non-revoked link per case (with its password), restricted to the caller's
    organization. A still-active link created before passwords existed gets one now."""
    ensure_schema(conn)
    if not case_ids:
        return {}
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT DISTINCT ON (case_id) case_id, token, expires_at, (expires_at > NOW()) AS active,
                   access_code, link_id
              FROM share_schema.patient_view_links
             WHERE case_id = ANY(%s) AND org_id = %s AND revoked_at IS NULL
             ORDER BY case_id, created_at DESC
            """,
            (list(case_ids), org_id),
        )
        rows = cur.fetchall()
        out: Dict[str, Dict[str, Any]] = {}
        changed = False
        for case_id, token, expires_at, active, code, link_id in rows:
            if active and not code:
                code = new_access_code()
                cur.execute(
                    "UPDATE share_schema.patient_view_links SET access_code = %s WHERE link_id = %s",
                    (code, link_id),
                )
                changed = True
            out[case_id] = {
                "url": link_url(token),
                "password": code if active else None,
                "expires_at": expires_at.isoformat(),
                "expired": not active,
            }
    if changed:
        conn.commit()
    return out

