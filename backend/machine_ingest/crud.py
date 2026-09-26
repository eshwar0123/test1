"""
backend/machine_ingest/crud.py

DB helpers for the S3 machine-ingest pipeline. Same _one/_all/_exec pattern
used throughout the rest of the backend (see qc/crud.py, organization/crud.py)
so this module fits the existing raw-psycopg2 style.

Two new tables, both created lazily (CREATE TABLE IF NOT EXISTS, same pattern
qc/crud.py already uses for admin_schema.notifications) so nothing needs a
manual migration:

  admin_schema.s3_ingest_cases      — idempotency ledger: one row per S3
                                       "case folder" ever seen, so a case is
                                       never processed twice across polls.
  organization_schema.s3_org_folder_map
                                     — manual override when an S3 client
                                       folder name doesn't match any
                                       org_profile.org_name exactly.
"""
import re
from typing import Any, Dict, List, Optional

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


def ensure_tables() -> None:
    _exec(
        """
        CREATE TABLE IF NOT EXISTS admin_schema.s3_ingest_cases (
            id            BIGSERIAL PRIMARY KEY,
            s3_prefix     TEXT UNIQUE NOT NULL,
            client_folder TEXT NOT NULL,
            case_folder   TEXT NOT NULL,
            status        TEXT NOT NULL DEFAULT 'processing',
            case_id       TEXT,
            org_id        TEXT,
            file_count    INT,
            error_message TEXT,
            detected_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            processed_at  TIMESTAMPTZ
        )
        """
    )
    _exec(
        """
        CREATE TABLE IF NOT EXISTS organization_schema.s3_org_folder_map (
            folder_name TEXT PRIMARY KEY,
            org_id      TEXT NOT NULL,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )


def claim_prefix(s3_prefix: str, client_folder: str, case_folder: str, file_count: int) -> bool:
    """Atomically reserve an S3 case-folder prefix for processing. Returns
    False if it's already tracked (processed, failed, unmatched, or being
    processed by another poll tick / worker) — the caller should skip it."""
    row = _one(
        """
        INSERT INTO admin_schema.s3_ingest_cases
          (s3_prefix, client_folder, case_folder, status, file_count)
        VALUES (%s, %s, %s, 'processing', %s)
        ON CONFLICT (s3_prefix) DO NOTHING
        RETURNING id
        """,
        (s3_prefix, client_folder, case_folder, file_count),
    )
    return bool(row)


def mark_case(
    *,
    s3_prefix: str,
    client_folder: str,
    case_folder: str,
    status: str,
    case_id: Optional[str] = None,
    org_id: Optional[str] = None,
    file_count: Optional[int] = None,
    error_message: Optional[str] = None,
) -> None:
    _exec(
        """
        INSERT INTO admin_schema.s3_ingest_cases
          (s3_prefix, client_folder, case_folder, status, case_id, org_id, file_count, error_message, processed_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())
        ON CONFLICT (s3_prefix) DO UPDATE SET
          status        = EXCLUDED.status,
          case_id       = COALESCE(EXCLUDED.case_id, admin_schema.s3_ingest_cases.case_id),
          org_id        = COALESCE(EXCLUDED.org_id, admin_schema.s3_ingest_cases.org_id),
          file_count    = EXCLUDED.file_count,
          error_message = EXCLUDED.error_message,
          processed_at  = NOW()
        """,
        (s3_prefix, client_folder, case_folder, status, case_id, org_id, file_count, error_message),
    )


def _normalise_folder_key(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (name or "").lower())


def resolve_org_for_folder(client_folder: str) -> Optional[Dict[str, Any]]:
    """Find the organization_schema.org_profile row an S3 client folder
    (e.g. 'TotalCare') belongs to.

    1. Manual override — organization_schema.s3_org_folder_map.
    2. Fallback — normalised (case/space/punctuation-insensitive) match
       against org_profile.org_name. Returns None if zero or more than one
       org matches, so an ambiguous folder never gets silently misfiled.
    """
    override = _one(
        """
        SELECT op.*
        FROM organization_schema.s3_org_folder_map m
        JOIN organization_schema.org_profile op ON op.org_id = m.org_id
        WHERE LOWER(m.folder_name) = LOWER(%s)
        LIMIT 1
        """,
        (client_folder,),
    )
    if override:
        return override

    candidates = _all("SELECT * FROM organization_schema.org_profile")
    target = _normalise_folder_key(client_folder)
    matches = [c for c in candidates if _normalise_folder_key(c.get("org_name") or "") == target]
    return matches[0] if len(matches) == 1 else None


def list_ingest_log(limit: int = 200) -> List[Dict[str, Any]]:
    return _all(
        "SELECT * FROM admin_schema.s3_ingest_cases ORDER BY detected_at DESC LIMIT %s",
        (int(limit),),
    )
