"""
backend/scripts/retranscode_s3_dicom.py

One-off backfill for DICOM files already uploaded to S3 before the
ingest-time normalize fix existed — either compressed (JPEG-LS/JPEG2000/
JPEG-Lossless/RLE) or missing their Part 10 header entirely (raw dataset
stream, no preamble/DICM/file-meta — a scanner export quirk unrelated to
compression). The desktop Cornerstone viewer fetches straight from S3 and
can't handle either case client-side, so — unlike the mobile scan-preview
endpoint, which self-heals on every request — these files need to be fixed
in place in S3 for the desktop viewer to work on them.

This does NOT run automatically. Run it manually, review the dry-run output
first, and only pass --apply once you're sure. --prefix can be the whole
dicom tree to sweep every case in one pass, or narrowed to a single case:

    cd backend
    python scripts/retranscode_s3_dicom.py --prefix uploads/dicom/                          # dry run, everything
    python scripts/retranscode_s3_dicom.py --prefix uploads/dicom/ --apply                   # fix everything
    python scripts/retranscode_s3_dicom.py --prefix uploads/dicom/GENRAD-SUB-115515/ --apply # one case

Requires the same pip environment as the running backend (pydicom +
pylibjpeg/gdcm) and valid AWS credentials for the target bucket.
"""
import argparse
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from s3_storage import s3, S3_BUCKET  # noqa: E402
from dicom_transcode import transcode_dicom_if_compressed, read_dicom_lenient  # noqa: E402


def needs_fix(path: str) -> bool:
    """True if this file is compressed and/or missing its Part 10 header —
    i.e. transcode_dicom_if_compressed would actually rewrite it."""
    ds, was_forced = read_dicom_lenient(path)
    if ds is None:
        return False
    try:
        is_compressed = getattr(ds.file_meta.TransferSyntaxUID, "is_compressed", False)
    except Exception:
        return False
    return is_compressed or was_forced

# Keep console output readable on a full-bucket sweep — still counted, just
# not all individually printed once there are a lot of them.
MAX_LISTED = 100


def iter_dcm_keys(prefix: str):
    paginator = s3.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=S3_BUCKET, Prefix=prefix):
        for obj in page.get("Contents", []):
            key = obj["Key"]
            if key.lower().endswith(".dcm"):
                yield key


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--prefix", required=True, help="S3 key prefix to scan, e.g. uploads/dicom/ (everything) or uploads/dicom/CASE-ID/ (one case)")
    ap.add_argument("--apply", action="store_true", help="Actually rewrite objects in S3. Without this, only reports what would change.")
    args = ap.parse_args()

    checked = 0
    rewritten = []
    would_transcode = []
    failed = []  # needed a fix (compressed and/or headerless) but couldn't be fixed

    for key in iter_dcm_keys(args.prefix):
        checked += 1
        try:
            with tempfile.NamedTemporaryFile(suffix=".dcm", delete=False) as tmp:
                tmp_path = tmp.name
                s3.download_file(S3_BUCKET, key, tmp_path)
        except Exception as e:
            print(f"[retranscode] could not download {key}: {e}")
            failed.append(key)
            continue

        try:
            if args.apply:
                # Check before transcoding, not after — once
                # transcode_dicom_if_compressed succeeds it rewrites tmp_path
                # in place, so re-reading it afterward would always look fine.
                needed = needs_fix(tmp_path)
                changed = transcode_dicom_if_compressed(tmp_path)
                if changed:
                    s3.upload_file(tmp_path, S3_BUCKET, key)
                    rewritten.append(key)
                    if len(rewritten) <= MAX_LISTED:
                        print(f"[retranscode] rewrote {key}")
                elif needed:
                    # Needed fixing (compressed and/or headerless) but no
                    # available codec/heuristic could actually fix it.
                    failed.append(key)
            else:
                # Dry run: just report which files need fixing, don't touch S3.
                if needs_fix(tmp_path):
                    would_transcode.append(key)
        finally:
            try:
                os.remove(tmp_path)
            except OSError:
                pass

        if checked % 50 == 0:
            print(f"[retranscode] checked {checked} files so far "
                  f"({len(rewritten) or len(would_transcode)} flagged, {len(failed)} failed)...")

    print(f"\n[retranscode] done. Checked {checked} .dcm files under '{args.prefix}'.")

    if args.apply:
        print(f"[retranscode] rewrote {len(rewritten)} file(s) (decompressed and/or rebuilt Part 10 header).")
        if len(rewritten) > MAX_LISTED:
            print(f"  (only the first {MAX_LISTED} were printed above)")
    else:
        print(f"[retranscode] {len(would_transcode)} file(s) need fixing and would be rewritten with --apply:")
        for k in would_transcode[:MAX_LISTED]:
            print(f"  - {k}")
        if len(would_transcode) > MAX_LISTED:
            print(f"  ... and {len(would_transcode) - MAX_LISTED} more")

    if failed:
        print(f"\n[retranscode] {len(failed)} file(s) could NOT be fixed — compressed with no available "
              f"decoder, or unreadable even with force=True. These need a different codec plugin or manual investigation:")
        for k in failed[:MAX_LISTED]:
            print(f"  - {k}")
        if len(failed) > MAX_LISTED:
            print(f"  ... and {len(failed) - MAX_LISTED} more")


if __name__ == "__main__":
    main()
