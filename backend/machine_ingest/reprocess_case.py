"""
backend/machine_ingest/reprocess_case.py

Converts ALREADY-ingested machine cases whose images are enhanced multi-frame
DICOM (or that include non-image DICOM such as presentation states) into
one-file-per-slice files the viewer can open, then points the case at them.
New cases get this automatically from watcher.py; this is only for cases
ingested before that existed.

Run ON THE SERVER, from backend/:
    python -m machine_ingest.reprocess_case GENRAD-SUB-593985           # dry run, prints per-file details
    python -m machine_ingest.reprocess_case GENRAD-SUB-593985 --apply
    python -m machine_ingest.reprocess_case --all                       # dry run over every machine case
    python -m machine_ingest.reprocess_case --all --apply

The machine's original files in uploads/Clients/ are never modified. Cases
already converted are skipped, so re-running is safe.
"""
import shutil
import sys
import tempfile

from psycopg2.extras import RealDictCursor

from database import get_conn
from s3_storage import s3, S3_BUCKET

from .multiframe import expand_to_single_frames, is_image, is_multiframe
from .watcher import load_dicom_entries, normalize_for_viewer


def _sop_name(ds) -> str:
    uid = getattr(ds, "SOPClassUID", None)
    return getattr(uid, "name", str(uid)) if uid else "?"


def reprocess(case_id: str, apply: bool, verbose: bool) -> None:
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT s3_prefix FROM admin_schema.s3_ingest_cases "
                "WHERE case_id = %s AND status = 'processed'", (case_id,))
            ledger = cur.fetchone()
            cur.execute("SELECT s3_key FROM organization_schema.bulk_uploads WHERE case_id = %s", (case_id,))
            bulk = cur.fetchone()
    finally:
        conn.close()

    if not ledger:
        print(f"{case_id}: not a machine-ingested case (no 'processed' row in s3_ingest_cases) — skipped")
        return
    if bulk and (bulk["s3_key"] or "").startswith(f"uploads/dicom/{case_id}/"):
        print(f"{case_id}: already converted — skipped")
        return

    prefix = ledger["s3_prefix"]
    keys = []
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=S3_BUCKET, Prefix=prefix):
        keys += [o["Key"] for o in page.get("Contents", []) if not o["Key"].endswith("/")]

    tmp = tempfile.mkdtemp(prefix="reprocess_")
    try:
        _, entries = load_dicom_entries(prefix, keys, tmp)
        images = [e for e in entries if is_image(e[2])]
        multi = [e for e in images if is_multiframe(e[2])]
        non_image = len(entries) - len(images)
        frames = sum(int(e[2].NumberOfFrames) for e in multi)
        print(f"{case_id}: {len(images)} image files ({len(multi)} multi-frame, ~{frames} slices), "
              f"{non_image} non-image DICOM")

        if verbose:
            for _key, name, ds in entries:
                print(f"    {name[-52:]:<52} pixels={'yes' if is_image(ds) else 'NO ':<3} "
                      f"frames={str(getattr(ds, 'NumberOfFrames', 1)):>3} "
                      f"{getattr(ds, 'Rows', '?')}x{getattr(ds, 'Columns', '?')}  {_sop_name(ds)}")

        if multi:
            # Run the real split in memory (nothing is uploaded) so a file the
            # converter can't handle shows up here, not on a live case.
            ok, problems = 0, []
            for _key, name, ds in multi:
                try:
                    out = expand_to_single_frames(ds, "check")
                    if len(out) != int(ds.NumberOfFrames):
                        problems.append(f"{name}: produced {len(out)} of {ds.NumberOfFrames} frames")
                    no_pos = sum(1 for _n, f in out if "ImagePositionPatient" not in f)
                    if no_pos:
                        problems.append(f"{name}: {no_pos}/{len(out)} frames have no ImagePositionPatient")
                    ok += 1
                except Exception as e:
                    problems.append(f"{name}: {e}")
            print(f"    split check: {ok}/{len(multi)} multi-frame files convert without error")
            for p in problems:
                print(f"      ! {p}")

        if not multi and not non_image:
            print("    nothing to convert")
            return
        if not apply:
            print("    dry run — add --apply to convert")
            return

        result = normalize_for_viewer(case_id, tmp, images)
        if not result:
            print("    conversion produced no files; case left unchanged")
            return
        new_key, names = result

        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute("UPDATE radiology_schema.rad_scans SET s3_key = %s WHERE case_id = %s", (new_key, case_id))
                cur.execute(
                    "UPDATE organization_schema.bulk_uploads SET s3_key = %s, image_file_names = %s WHERE case_id = %s",
                    (new_key, names, case_id))
            conn.commit()
        finally:
            conn.close()
        print(f"    done: {len(names)} slice files, s3_key = {new_key}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def main(argv) -> None:
    apply = "--apply" in argv
    args = [a for a in argv if not a.startswith("--")]

    if "--all" in argv:
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT case_id FROM admin_schema.s3_ingest_cases "
                    "WHERE status = 'processed' AND case_id IS NOT NULL ORDER BY detected_at")
                case_ids = [r[0] for r in cur.fetchall()]
        finally:
            conn.close()
        for cid in case_ids:
            try:
                reprocess(cid, apply, verbose=False)
            except Exception as e:  # one bad case must not stop the rest
                print(f"{cid}: FAILED — {e}")
        return

    if len(args) != 1:
        sys.exit("usage: python -m machine_ingest.reprocess_case <CASE_ID> [--apply]   or   --all [--apply]")
    reprocess(args[0], apply, verbose=True)


if __name__ == "__main__":
    main(sys.argv[1:])
