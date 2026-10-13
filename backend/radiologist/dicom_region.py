"""
dicom_region.py -- pull the region label (the "SPINE L-S" text) and the rest of
the corner overlay straight out of the DICOM header. No AI: these tags are baked
into the file, which is exactly why the viewer prints them.

Mount:
    from dicom_region import router as region_router
    app.include_router(region_router)

GET /api/dicom/region?path=/path/to/series_folder_or_file
  -> { "region": "SPINE L-S", "series_description": "t2_tse_sag_384", ... }

Region is SERIES-LEVEL: same value for every slice. For per-vertebra labels
("L4") use the segmentation flow (idea 1).
"""
import glob
import os

import pydicom
from fastapi import APIRouter, Query

router = APIRouter(prefix="/api/dicom", tags=["dicom"])


def _first_dicom(path):
    if os.path.isdir(path):
        for f in sorted(glob.glob(os.path.join(path, "*"))):
            if os.path.isfile(f):
                try:
                    return pydicom.dcmread(f, stop_before_pixels=True, force=True)
                except Exception:
                    continue
        return None
    return pydicom.dcmread(path, stop_before_pixels=True, force=True)


def _coded_region(ds):
    seq = ds.get("AnatomicRegionSequence")
    if seq and len(seq):
        item = seq[0]
        return item.get("CodeMeaning") or item.get("CodeValue")
    return None


def extract_region(path):
    ds = _first_dicom(path)
    if ds is None:
        return {"region": None, "reason": "no_dicom"}

    body_part = ds.get("BodyPartExamined")        # 0018,0015  e.g. "SPINE L-S"
    coded = _coded_region(ds)                      # 0008,2218  coded fallback
    series_desc = ds.get("SeriesDescription")      # 0008,103E  e.g. "t2_tse_sag_384"
    region = body_part or coded or series_desc

    return {
        "region": region,
        "body_part_examined": body_part,
        "anatomic_region_coded": coded,
        "series_description": series_desc,
        "protocol_name": ds.get("ProtocolName"),
        "modality": ds.get("Modality"),
        "series_number": str(ds.get("SeriesNumber") or ""),
        "study_date": str(ds.get("StudyDate") or ""),
        "patient_sex": ds.get("PatientSex"),
        "scope": "series",   # reminder: not per-slice
    }


@router.get("/region")
def region(path: str = Query(..., description="DICOM file or series folder")):
    return extract_region(path)
