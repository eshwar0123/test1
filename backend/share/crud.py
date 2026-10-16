"""
backend/share/crud.py

Patient image links: one read-only, password-less link per submitted case,
valid for 24 hours from the report's submit time (reports.completed_at, a
naive IST timestamp -> converted with AT TIME ZONE 'Asia/Kolkata').
"""
import os
import secrets
from typing import Any, Dict, List, Optional

from database import get_conn

PATIENT_LINK_BASE_URL = os.getenv("PATIENT_LINK_BASE_URL", "https://onixai.in").rstrip("/")

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

        # Old link(s) for this case stop working immediately.
        cur.execute(
            """
            UPDATE share_schema.patient_view_links
               SET revoked_at = NOW()
             WHERE case_id = %s AND revoked_at IS NULL
            """,
            (case_id,),
        )

        token = secrets.token_urlsafe(32)
        cur.execute(
            """
            INSERT INTO share_schema.patient_view_links (case_id, org_id, token, expires_at)
            VALUES (%s, %s, %s, %s)
            RETURNING link_id, expires_at
            """,
            (case_id, org_id, token, expires_at),
        )
        link_id, exp = cur.fetchone()
    conn.commit()
    return {"link_id": str(link_id), "token": token, "expires_at": exp}


def get_link_by_token(conn, token: str) -> Optional[Dict[str, Any]]:
    ensure_schema(conn)
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT link_id, case_id, expires_at, revoked_at,
                   (expires_at > NOW() AND revoked_at IS NULL) AS active
              FROM share_schema.patient_view_links
             WHERE token = %s
            """,
            (token,),
        )
        r = cur.fetchone()
    if not r:
        return None
    return {"link_id": r[0], "case_id": r[1], "expires_at": r[2], "revoked_at": r[3], "active": r[4]}


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
    """Newest non-revoked link per case, restricted to the caller's organization."""
    ensure_schema(conn)
    if not case_ids:
        return {}
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT DISTINCT ON (case_id) case_id, token, expires_at, (expires_at > NOW()) AS active
              FROM share_schema.patient_view_links
             WHERE case_id = ANY(%s) AND org_id = %s AND revoked_at IS NULL
             ORDER BY case_id, created_at DESC
            """,
            (list(case_ids), org_id),
        )
        rows = cur.fetchall()
    return {
        r[0]: {"url": link_url(r[1]), "expires_at": r[2].isoformat(), "expired": not r[3]}
        for r in rows
    }
