"""
Ad-hoc diagnostic: unlike diagnose_case.py (which samples one file per S3
"folder"), this groups by the actual DICOM SeriesInstanceUID tag — the way
the frontend (useSeriesGrouping.js) does — and reports TransferSyntaxUID,
Rows/Columns, and BitsAllocated for one representative file per REAL series,
plus flags any series where files disagree on rows/columns (which would
break the MPR volume's per-frame pixel insertion).

Run ON THE SERVER, from backend/:
    python3 /path/to/diagnose_all_series.py GENRAD-SUB-461095
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
            cur.execute("SELECT s3_key FROM radiology_schema.rad_scans WHERE case_id=%s", (case_id,))
            rs = cur.fetchone()
    finally:
        conn.close()

    if not rs or not rs["s3_key"]:
        print("No s3_key stored for this case.")
        return

    key = rs["s3_key"]
    prefix = key[: key.rfind("/") + 1]

    keys = []
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=S3_BUCKET, Prefix=prefix):
        for o in page.get("Contents", []):
            if o["Key"].lower().endswith(".dcm"):
                keys.append(o["Key"])
    print(f"Total .dcm files: {len(keys)}\n")

    by_series = defaultdict(list)  # seriesUID -> list of (key, ds_summary)
    unreadable = 0

    for k in keys:
        try:
            body = s3.get_object(Bucket=S3_BUCKET, Key=k)["Body"].read()
            ds = pydicom.dcmread(BytesIO(body), force=True, stop_before_pixels=True)
            suid = getattr(ds, "SeriesInstanceUID", "UNKNOWN")
            ts = getattr(ds.file_meta, "TransferSyntaxUID", None)
            by_series[suid].append({
                "key": k,
                "seriesNumber": getattr(ds, "SeriesNumber", None),
                "seriesDesc": getattr(ds, "SeriesDescription", None),
                "ts": ts.name if ts else "?",
                "rows": getattr(ds, "Rows", None),
                "cols": getattr(ds, "Columns", None),
                "bitsAllocated": getattr(ds, "BitsAllocated", None),
                "bitsStored": getattr(ds, "BitsStored", None),
                "pixelRep": getattr(ds, "PixelRepresentation", None),
                "hasPixelData": "PixelData" in ds if hasattr(ds, "__contains__") else "7FE00010" in ds,
            })
        except Exception as e:
            unreadable += 1

    print(f"Distinct series found: {len(by_series)}   (unreadable files: {unreadable})\n")
    print(f"{'SE#':<5} {'DESCRIPTION':<30} {'FILES':>5} {'TRANSFER SYNTAX':<28} {'ROWSxCOLS':<12} {'BITS(alloc/stored/rep)':<22} MIXED-DIMS?")
    print("-" * 130)

    for suid, files in sorted(by_series.items(), key=lambda kv: (kv[1][0]["seriesNumber"] or 0)):
        f0 = files[0]
        dims = {(f["rows"], f["cols"]) for f in files}
        bits = {(f["bitsAllocated"], f["bitsStored"], f["pixelRep"]) for f in files}
        ts_set = {f["ts"] for f in files}
        mixed = "YES <-- PROBLEM" if len(dims) > 1 or len(bits) > 1 or len(ts_set) > 1 else "no"
        rc = f"{f0['rows']}x{f0['cols']}"
        b = f"{f0['bitsAllocated']}/{f0['bitsStored']}/{f0['pixelRep']}"
        desc = (f0["seriesDesc"] or "?")[:29]
        print(f"{str(f0['seriesNumber']):<5} {desc:<30} {len(files):>5} {f0['ts']:<28} {rc:<12} {b:<22} {mixed}")
        if mixed.startswith("YES"):
            for d in dims:
                print(f"       dims variant: {d}")
            for bb in bits:
                print(f"       bits variant: {bb}")
            for t in ts_set:
                print(f"       transfer syntax variant: {t}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: python3 diagnose_all_series.py <CASE_ID>")
    main(sys.argv[1])
