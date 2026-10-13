"""
backend/machine_ingest/check_org_folder_match.py

One-off diagnostic — run this ON THE SERVER (where the real DB/AWS
credentials live) to see exactly which S3 client folders under
uploads/Clients/ already match a registered organization by name, and which
ones need a manual entry in organization_schema.s3_org_folder_map.

Usage (from backend/):
    python -m machine_ingest.check_org_folder_match
"""
import re

from database import get_conn
from psycopg2.extras import RealDictCursor
from s3_storage import s3, S3_BUCKET, S3_PREFIX

CLIENTS_PREFIX = f"{S3_PREFIX}/Clients/"


def _normalise(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (name or "").lower())


def list_s3_client_folders():
    """Top-level folder names under uploads/Clients/ (one level deep only)."""
    folders = []
    paginator = s3.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=S3_BUCKET, Prefix=CLIENTS_PREFIX, Delimiter="/"):
        for cp in page.get("CommonPrefixes", []):
            prefix = cp["Prefix"]  # e.g. "uploads/Clients/TotalCare/"
            name = prefix[len(CLIENTS_PREFIX):].rstrip("/")
            if name:
                folders.append(name)
    return folders


def list_orgs():
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT org_id, org_name FROM organization_schema.org_profile ORDER BY org_name")
            return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def existing_overrides():
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT folder_name FROM organization_schema.s3_org_folder_map
            """)
            return {r["folder_name"] for r in cur.fetchall()}
    except Exception:
        return set()  # table doesn't exist yet — fine, means no overrides yet
    finally:
        conn.close()


def main():
    print(f"Bucket: {S3_BUCKET}   Prefix: {CLIENTS_PREFIX}\n")

    folders = list_s3_client_folders()
    orgs = list_orgs()
    overrides = existing_overrides()

    if not folders:
        print("No client folders found under uploads/Clients/ yet.")
        return

    org_by_norm = {}
    for o in orgs:
        org_by_norm.setdefault(_normalise(o["org_name"]), []).append(o)

    print(f"Found {len(folders)} S3 client folder(s), {len(orgs)} registered organization(s).\n")
    print(f"{'S3 FOLDER':<30} {'STATUS':<14} DETAIL")
    print("-" * 90)

    for folder in sorted(folders):
        if folder in overrides:
            print(f"{folder:<30} {'OK (mapped)':<14} manual override already exists in s3_org_folder_map")
            continue

        matches = org_by_norm.get(_normalise(folder), [])
        if len(matches) == 1:
            org = matches[0]
            print(f"{folder:<30} {'OK (auto)':<14} matches org '{org['org_name']}' ({org['org_id']})")
        elif len(matches) == 0:
            print(f"{folder:<30} {'NEEDS FIX':<14} no organization named like '{folder}' — "
                  f"needs a row in organization_schema.s3_org_folder_map")
        else:
            names = ", ".join(f"{m['org_name']} ({m['org_id']})" for m in matches)
            print(f"{folder:<30} {'NEEDS FIX':<14} AMBIGUOUS — multiple orgs match: {names}")

    print("\nTo fix a 'NEEDS FIX' row, run:")
    print("  INSERT INTO organization_schema.s3_org_folder_map (folder_name, org_id)")
    print("  VALUES ('<exact S3 folder name>', '<org_id from organization_schema.org_profile>');")


if __name__ == "__main__":
    main()
