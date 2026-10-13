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
import os
import re
from typing import Any, Dict, Iterable, List, Optional

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
    # A folder left as 'unmatched_org' is retried after a while — the organization
    # may have been registered / mapped since, or the DICOM institution name may
    # now match. Every other status is final.
    retry_minutes = int(os.getenv("S3_INGEST_UNMATCHED_RETRY_MINUTES", "30"))
    row = _one(
        """
        INSERT INTO admin_schema.s3_ingest_cases
          (s3_prefix, client_folder, case_folder, status, file_count)
        VALUES (%s, %s, %s, 'processing', %s)
        ON CONFLICT (s3_prefix) DO UPDATE
          SET status = 'processing', file_count = EXCLUDED.file_count
          WHERE admin_schema.s3_ingest_cases.status = 'unmatched_org'
            AND admin_schema.s3_ingest_cases.processed_at
                < NOW() - (%s || ' minutes')::interval
        RETURNING id
        """,
        (s3_prefix, client_folder, case_folder, file_count, str(retry_minutes)),
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


def resolve_org_for_institution(names: Iterable[str]) -> Optional[Dict[str, Any]]:
    """Match the DICOM InstitutionName(s) of a case against
    organization_schema.org_profile.org_name.

    Pass 1 — normalised exact match (case / spaces / punctuation ignored).
    Pass 2 — one name contains the other (e.g. "BRAHM SHAKTI HOSPITAL" vs
             "Brahm Shakti Hospital Pvt Ltd"), only for names of 6+ characters.
    A pass only counts when it points at exactly ONE organization, so an
    ambiguous name never gets silently misfiled.
    """
    targets = [t for t in {_normalise_folder_key(n) for n in names if n} if t]
    if not targets:
        return None
    candidates = _all("SELECT * FROM organization_schema.org_profile")

    def uniq(rows):
        seen = {}
        for r in rows:
            seen[str(r.get("org_id"))] = r
        return list(seen.values())

    exact = uniq(c for c in candidates
                 if _normalise_folder_key(c.get("org_name") or "") in targets)
    if len(exact) == 1:
        return exact[0]
    if len(exact) > 1:
        return None

    partial = []
    for c in candidates:
        on = _normalise_folder_key(c.get("org_name") or "")
        if len(on) < 6:
            continue
        if any(len(t) >= 6 and (on in t or t in on) for t in targets):
            partial.append(c)
    partial = uniq(partial)
    return partial[0] if len(partial) == 1 else None


def remember_folder_mapping(folder_name: str, org_id: str) -> None:
    """Record client_folder -> org so the next case from this S3 folder is routed
    straight away (resolve_org_for_folder checks this table first)."""
    if not folder_name or not org_id:
        return
    _exec(
        """
        INSERT INTO organization_schema.s3_org_folder_map (folder_name, org_id)
        VALUES (%s, %s)
        ON CONFLICT (folder_name) DO NOTHING
        """,
        (folder_name, str(org_id)),
    )


def list_ingest_log(limit: int = 200) -> List[Dict[str, Any]]:
    return _all(
        "SELECT * FROM admin_schema.s3_ingest_cases ORDER BY detected_at DESC LIMIT %s",
        (int(limit),),
    )
