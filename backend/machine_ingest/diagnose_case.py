"""
backend/machine_ingest/diagnose_case.py

Read-only diagnostic for a case that won't open in the viewer. Run ON THE
SERVER, from backend/:
    python -m machine_ingest.diagnose_case GENRAD-SUB-593985

Prints what the DB stores for the case, what the viewer would list from S3,
and the DICOM format of each series (transfer syntax, frame count, size) so
we can tell "wrong folder" from "format the viewer can't open".
"""
import sys
from collections import defaultdict
from io import BytesIO

import pydicom
from psycopg2.extras import RealDictCursor

from database import get_conn
from s3_storage import s3, S3_BUCKET


def main(case_id: str) -> None:
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT s3_key, s3_bucket, storage_type FROM radiology_schema.rad_scans WHERE case_id=%s", (case_id,))
            rs = cur.fetchone()
            cur.execute("SELECT s3_key, uploaded_images_path FROM organization_schema.bulk_uploads WHERE case_id=%s", (case_id,))
            bu = cur.fetchone()
    finally:
        conn.close()

    print(f"rad_scans.s3_key      : {rs and rs['s3_key']!r}  (storage_type={rs and rs['storage_type']})")
    print(f"bulk_uploads.s3_key   : {bu and bu['s3_key']!r}")
    print(f"bulk_uploads.images_path: {bu and bu['uploaded_images_path']!r}")
    if not rs or not rs["s3_key"]:
        print("\nNo s3_key stored for this case.")
        return

    key = rs["s3_key"]
    prefix = key[: key.rfind("/") + 1]  # exactly what repository_1.js computes
    print(f"\nviewer prefix         : {prefix!r}")

    keys, sizes = [], {}
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=S3_BUCKET, Prefix=prefix):
        for o in page.get("Contents", []):
            if o["Key"].lower().endswith(".dcm"):
                keys.append(o["Key"])
                sizes[o["Key"]] = o["Size"]
    print(f".dcm files under prefix: {len(keys)}")
    if not keys:
        print("-> the viewer would find nothing here; s3_key points at the wrong folder.")
        return

    by_dir = defaultdict(list)
    for k in keys:
        by_dir[k.rsplit("/", 1)[0]].append(k)
    print(f"series folders         : {len(by_dir)}\n")
    print(f"{'FOLDER':<40} {'FILES':>5} {'SIZES(KB)':<18} {'FRAMES':>6} {'ROWSxCOLS':<10} TRANSFER SYNTAX / SOP CLASS")
    print("-" * 130)

    for d, ks in sorted(by_dir.items()):
        k0 = sorted(ks, key=lambda x: -sizes[x])[0]  # inspect the biggest file in the folder
        try:
            body = s3.get_object(Bucket=S3_BUCKET, Key=k0)["Body"].read()
            ds = pydicom.dcmread(BytesIO(body), force=True, stop_before_pixels=True)
            ts = getattr(ds.file_meta, "TransferSyntaxUID", None)
            sop = getattr(ds, "SOPClassUID", None)
            frames = getattr(ds, "NumberOfFrames", 1)
            info = f"{ts.name if ts else '?'} / {sop.name if sop else '?'}"
            rc = f"{getattr(ds, 'Rows', '?')}x{getattr(ds, 'Columns', '?')}"
        except Exception as e:
            frames, rc, info = "?", "?", f"UNREADABLE: {e}"
        kb = ",".join(str(sizes[k] // 1024) for k in sorted(ks)[:4])
        print(f"{d.rsplit('/', 1)[-1][:39]:<40} {len(ks):>5} {kb:<18} {str(frames):>6} {rc:<10} {info}")

    # Ask the backend itself (bypassing nginx) for one file, the way the viewer does.
    # 200/206 here but 404 in the browser => nginx is the problem, not the backend.
    from urllib.parse import quote
    import urllib.request
    import urllib.error

    probe = keys[0]
    url = f"http://127.0.0.1:8100/radiology/file/{S3_BUCKET}/{quote(probe)}"
    req = urllib.request.Request(url, headers={"Range": "bytes=0-31"})
    try:
        status = urllib.request.urlopen(req, timeout=15).status
    except urllib.error.HTTPError as e:
        status = e.code
    except Exception as e:
        status = f"failed: {e}"
    print(f"\nbackend /radiology/file probe on 127.0.0.1:8100 -> {status}")
    print(f"  key: {probe}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: python -m machine_ingest.diagnose_case <CASE_ID>")
    main(sys.argv[1])
