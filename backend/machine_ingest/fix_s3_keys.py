"""
backend/machine_ingest/fix_s3_keys.py

One-off backfill for cases ingested before watcher.py started storing the
case's common folder in s3_key (they stored a single file's key, so the viewer
only loaded that file's series folder). Recomputes s3_key for every
'processed' row in admin_schema.s3_ingest_cases.

Run ON THE SERVER, from backend/:
    python -m machine_ingest.fix_s3_keys          # dry run, prints changes
    python -m machine_ingest.fix_s3_keys --apply  # writes them
"""
import sys

from database import get_conn
from psycopg2.extras import RealDictCursor
from s3_storage import s3, S3_BUCKET

from .watcher import common_folder_prefix


def main(apply: bool) -> None:
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT s3_prefix, case_id FROM admin_schema.s3_ingest_cases "
                "WHERE status = 'processed' AND case_id IS NOT NULL"
            )
            rows = [dict(r) for r in cur.fetchall()]

        for r in rows:
            keys = []
            for page in s3.get_paginator("list_objects_v2").paginate(Bucket=S3_BUCKET, Prefix=r["s3_prefix"]):
                keys += [o["Key"] for o in page.get("Contents", []) if o["Key"].lower().endswith(".dcm")]
            if not keys:
                print(f"{r['case_id']}: no .dcm files under {r['s3_prefix']} — skipped")
                continue

            new_key = common_folder_prefix(keys)
            print(f"{r['case_id']}: {len(keys)} files -> s3_key = {new_key}")
            if apply:
                with conn.cursor() as cur:
                    for table in ("radiology_schema.rad_scans", "organization_schema.bulk_uploads"):
                        cur.execute(f"UPDATE {table} SET s3_key = %s WHERE case_id = %s", (new_key, r["case_id"]))
                conn.commit()
    finally:
        conn.close()

    if not apply:
        print("\nDry run only. Re-run with --apply to write these changes.")


if __name__ == "__main__":
    main("--apply" in sys.argv)
