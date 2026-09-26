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


def format_study_date(raw: Any) -> Optional[str]:
    """DICOM StudyDate is YYYYMMDD -> 'YYYY-MM-DD' (parsed by
    organization/crud.py:_parse_date)."""
    s = str(raw or "").strip()
    if len(s) == 8 and s.isdigit():
        return f"{s[0:4]}-{s[4:6]}-{s[6:8]}"
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
        "age": parse_patient_age(getattr(ds, "PatientAge", None)),
        "gender": normalise_gender(getattr(ds, "PatientSex", None)),
        "study_date_str": format_study_date(getattr(ds, "StudyDate", None)),
        "modality_text": map_dicom_modality(getattr(ds, "Modality", None)),
        "study_type_text": (study_desc or body_part or None),
        "referring_doctor": normalise_person_name(getattr(ds, "ReferringPhysicianName", None)),
        "accession_number": (str(getattr(ds, "AccessionNumber", "") or "").strip() or None),
        "study_instance_uid": (str(getattr(ds, "StudyInstanceUID", "") or "").strip() or None),
    }
