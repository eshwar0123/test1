"""
backend/machine_ingest/dicom_meta.py

Pulls case-level metadata out of a DICOM dataset (already read via pydicom)
for the MRI-machine S3 auto-ingest pipeline, and translates it into the same
vocabulary the manual organization upload form uses (organization/crud.py's
resolve_priority_id / resolve_modality_id / resolve_study_type_id), so
machine-fed cases are bucketed identically to human-uploaded ones.
"""
import re
from typing import Any, Dict, Optional

PLACEHOLDERS = {"", "unknown", "anon", "anonymous", "test", "temp", "^^^^", "none", "n/a"}

# DICOM Modality codes -> the free-text values the app's dropdown/resolver
# expects (organization/crud.py:_MODALITY_IDS only recognises CT/MRI/XRAY;
# anything else correctly falls back to "Other").
_MODALITY_TEXT_MAP = {
    "MR": "MRI",
    "CT": "CT",
    "CR": "XRAY",
    "DX": "XRAY",
    "DR": "XRAY",
}


def normalise_person_name(raw: Any) -> Optional[str]:
    s = str(raw or "").replace("^", " ").strip()
    s = " ".join(s.split())
    if not s or s.lower() in PLACEHOLDERS:
        return None
    return s


def normalise_gender(raw: Any) -> Optional[str]:
    s = str(raw or "").strip().upper()
    return {"M": "Male", "F": "Female", "O": "Other"}.get(s)


def parse_patient_age(raw: Any) -> Optional[int]:
    """DICOM PatientAge is like '034Y' / '003M' / '002W' / '010D'."""
    if not raw:
        return None
    s = str(raw).strip().upper()
    m = re.match(r"^0*(\d+)\s*([YMWD])?$", s)
    if not m:
        try:
            return int(float(s))
        except Exception:
            return None
    value, unit = int(m.group(1)), (m.group(2) or "Y")
    return value if unit == "Y" else 0


def age_from_birth_date(birth: Any, study: Any) -> Optional[int]:
    """Fallback when PatientAge is empty: whole years between PatientBirthDate
    and StudyDate (both YYYYMMDD)."""
    b, s = str(birth or "").strip(), str(study or "").strip()
    if not (len(b) == 8 and b.isdigit() and len(s) == 8 and s.isdigit()):
        return None
    years = int(s[:4]) - int(b[:4]) - ((int(s[4:6]), int(s[6:8])) < (int(b[4:6]), int(b[6:8])))
    return years if years >= 0 else None


def format_study_date(raw: Any) -> Optional[str]:
    """DICOM StudyDate is YYYYMMDD -> 'YYYY-MM-DD' (parsed by
    organization/crud.py:_parse_date)."""
    s = str(raw or "").strip()
    if len(s) == 8 and s.isdigit():
        return f"{s[0:4]}-{s[4:6]}-{s[6:8]}"
    return None


def format_study_datetime(date_raw: Any, time_raw: Any) -> Optional[str]:
    """DICOM date (YYYYMMDD) + time (HHMMSS[.ffffff]) -> 'YYYY-MM-DD HH:MM:SS',
    or None if there is no usable date. A missing/garbled time becomes 00:00:00."""
    d = str(date_raw or "").strip()
    if not (len(d) == 8 and d.isdigit()):
        return None
    t = str(time_raw or "").strip().split(".")[0].replace(":", "")
    t = (t + "000000")[:6] if t.isdigit() else "000000"
    hh, mm, ss = int(t[0:2]), int(t[2:4]), int(t[4:6])
    if hh > 23 or mm > 59 or ss > 59:
        hh = mm = ss = 0
    return f"{d[0:4]}-{d[4:6]}-{d[6:8]} {hh:02d}:{mm:02d}:{ss:02d}"


def study_datetime_from_dataset(ds) -> Optional[str]:
    """When the study was taken, from the DICOM tags: StudyDate/StudyTime,
    falling back to Acquisition / Content / Series date+time."""
    for date_tag, time_tag in (
        ("StudyDate", "StudyTime"),
        ("AcquisitionDate", "AcquisitionTime"),
        ("ContentDate", "ContentTime"),
        ("SeriesDate", "SeriesTime"),
    ):
        val = format_study_datetime(getattr(ds, date_tag, None), getattr(ds, time_tag, None))
        if val:
            return val
    return None


def study_datetime_from_file(path: str) -> Optional[str]:
    """Read only the header of a DICOM file and return its study date-time."""
    try:
        import pydicom
        ds = pydicom.dcmread(path, stop_before_pixels=True, force=True)
        return study_datetime_from_dataset(ds)
    except Exception:
        return None


def map_dicom_modality(raw: Any) -> Optional[str]:
    s = str(raw or "").strip().upper()
    if not s:
        return None
    return _MODALITY_TEXT_MAP.get(s, s)


def extract_case_metadata(ds) -> Dict[str, Any]:
    """ds — a pydicom Dataset. Returns the fields needed to build a
    case_meta dict matching organization/router.py's bulk-submit shape."""
    study_desc = str(getattr(ds, "StudyDescription", "") or "").strip()
    body_part = str(getattr(ds, "BodyPartExamined", "") or "").strip()

    return {
        "patient_name": normalise_person_name(getattr(ds, "PatientName", None)),
        "patient_id": (str(getattr(ds, "PatientID", "") or "").strip() or None),
        "age": parse_patient_age(getattr(ds, "PatientAge", None))
        or age_from_birth_date(getattr(ds, "PatientBirthDate", None), getattr(ds, "StudyDate", None)),
        "gender": normalise_gender(getattr(ds, "PatientSex", None)),
        "study_date_str": format_study_date(getattr(ds, "StudyDate", None)),
        "study_datetime_str": study_datetime_from_dataset(ds),
        "modality_text": map_dicom_modality(getattr(ds, "Modality", None)),
        "study_type_text": (study_desc or body_part or None),
        "referring_doctor": normalise_person_name(getattr(ds, "ReferringPhysicianName", None)),
        "accession_number": (str(getattr(ds, "AccessionNumber", "") or "").strip() or None),
        "study_instance_uid": (str(getattr(ds, "StudyInstanceUID", "") or "").strip() or None),
    }

