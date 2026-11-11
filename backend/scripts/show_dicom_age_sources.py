"""
backend/scripts/show_dicom_age_sources.py

Read-only diagnostic: shows where (if anywhere) a DICOM file carries the patient's age, and what
the ingest code (machine_ingest/dicom_meta.py:extract_case_metadata) would store for it.
Nothing is written to the database or to S3.

Use it on a case whose age shows as 0 / "—", either on a local file:

    cd backend
    python scripts/show_dicom_age_sources.py --file C:/path/to/any_slice.dcm

or on a case stored in S3 (reads the first .dcm under the prefix; needs the usual AWS env):

    python scripts/show_dicom_age_sources.py --prefix uploads/dicom/GENRAD-SUB-575172/

It prints the patient tags, every header value that looks like an age ("34Y", "34 yrs", "34/M"),
and the age the backend extracts.
"""
import argparse
import os
import re
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pydicom  # noqa: E402
from machine_ingest.dicom_meta import extract_case_metadata  # noqa: E402

PATIENT_TAGS = [
    "PatientName", "PatientID", "PatientAge", "PatientBirthDate", "PatientSex", "StudyDate",
    "PatientComments", "OtherPatientNames", "OtherPatientIDs", "AdditionalPatientHistory",
    "StudyDescription", "SeriesDescription", "ProtocolName", "InstitutionName",
    "ReferringPhysicianName", "AccessionNumber", "RequestedProcedureDescription",
]

# values that look like an age: "34Y", "34 YRS", "34 years", "34/M", "34Y/F", "034Y"
AGE_LIKE = re.compile(r"(?<!\d)(\d{1,3})\s*(?:Y(?:RS?|EARS?)?|/\s*[MFO])\b", re.IGNORECASE)


def _read_from_s3(prefix: str) -> str:
    from s3_storage import s3, S3_BUCKET  # lazy: only needed for --prefix

    resp = s3.list_objects_v2(Bucket=S3_BUCKET, Prefix=prefix)
    keys = [o["Key"] for o in resp.get("Contents", []) if not o["Key"].endswith("/")]
    if not keys:
        sys.exit(f"No objects under s3://{S3_BUCKET}/{prefix}")
    key = sorted(keys)[0]
    tmp = os.path.join(tempfile.mkdtemp(prefix="dcm_age_"), "slice.dcm")
    s3.download_file(S3_BUCKET, key, tmp)
    print(f"Read s3://{S3_BUCKET}/{key}")
    return tmp


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", help="local DICOM file")
    ap.add_argument("--prefix", help="S3 prefix of the case folder")
    args = ap.parse_args()
    if not args.file and not args.prefix:
        ap.error("give --file or --prefix")

    path = args.file or _read_from_s3(args.prefix)
    ds = pydicom.dcmread(path, stop_before_pixels=True, force=True)

    print("\n== Patient-related tags (raw) ==")
    for tag in PATIENT_TAGS:
        val = getattr(ds, tag, None)
        print(f"  {tag:32s} {val!r}")

    print("\n== Header values that look like an age ==")
    hits = 0
    for elem in ds.iterall():
        if elem.VR in ("OB", "OW", "OF", "OD", "UN", "SQ") or elem.value in (None, ""):
            continue
        text = str(elem.value)
        m = AGE_LIKE.search(text)
        if m:
            hits += 1
            print(f"  {elem.tag} {elem.keyword or '(private)':32s} {text[:80]!r}  -> {m.group(1)}")
    if not hits:
        print("  none - this file carries no age in any readable header value")

    meta = extract_case_metadata(ds)
    print(f"\n== What the backend stores ==\n  age = {meta.get('age')!r}   patient_name = {meta.get('patient_name')!r}")


if __name__ == "__main__":
    main()
