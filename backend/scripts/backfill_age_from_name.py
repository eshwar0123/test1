"""
backend/scripts/backfill_age_from_name.py

One-off backfill for cases ingested before the "age after the patient name" rule existed
(machine_ingest/dicom_meta.py:age_from_patient_name). Those cases have no age stored (NULL / 0)
and show as "0y" in the app, but the scanner put the age right after the patient name,
e.g. "NARENDER KUMAR 34Y/M". This reads that number from the stored patient name and fills in the
age in organization_schema.bulk_uploads, radiology_schema.rad_scans and radiology_schema.reports.
Only rows whose age is empty / 0 are touched; an age that is already set is never overwritten.

This does NOT run automatically. Run it manually, review the dry-run output first, and only pass
--apply once you're sure:

    cd backend
    python scripts/backfill_age_from_name.py            # dry run: lists what would change
    python scripts/backfill_age_from_name.py --apply    # write the ages

Requires the same environment as the running backend (DB_* variables / .env).
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import get_conn  # noqa: E402
from machine_ingest.dicom_meta import age_from_patient_name  # noqa: E402

# (table, name column, age column, key column)
TARGETS = [
    ("organization_schema.bulk_uploads", "patient_name", "age", "case_id"),
    ("radiology_schema.rad_scans", "patient_name", "patient_age", "case_id"),
    ("radiology_schema.reports", "patient_name", "patient_age", "case_id"),
]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="write the ages (default: dry run)")
    args = ap.parse_args()

    conn = get_conn()
    total = 0
    try:
        with conn.cursor() as cur:
            for table, name_col, age_col, key_col in TARGETS:
                cur.execute(
                    f"SELECT {key_col}, {name_col} FROM {table} "
                    f"WHERE ({age_col} IS NULL OR {age_col} = 0) AND {name_col} IS NOT NULL"
                )
                rows = cur.fetchall()
                fixes = [(k, n, age_from_patient_name(n)) for k, n in rows]
                fixes = [(k, n, a) for k, n, a in fixes if a]
                print(f"{table}: {len(fixes)} of {len(rows)} rows without an age have one in the name")
                for key, name, age in fixes:
                    print(f"   {key}: {name!r} -> {age}")
                    if args.apply:
                        cur.execute(
                            f"UPDATE {table} SET {age_col} = %s "
                            f"WHERE {key_col} = %s AND ({age_col} IS NULL OR {age_col} = 0)",
                            (age, key),
                        )
                total += len(fixes)
        if args.apply:
            conn.commit()
            print(f"Done - {total} age value(s) written.")
        else:
            conn.rollback()
            print(f"Dry run - {total} age value(s) would be written. Re-run with --apply to save them.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()

