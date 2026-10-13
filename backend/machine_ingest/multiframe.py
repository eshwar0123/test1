"""
backend/machine_ingest/multiframe.py

Philips (and other) scanners export Enhanced MR/CT: ONE DICOM file holding a
whole series as N frames. The viewer counts one file as one image, so those
cases show "Slices 1/1". This module splits an enhanced multi-frame dataset
into classic single-frame MR/CT Image Storage instances (one per frame), the
same layout the manual upload flow's CT cases already use.

Geometry (position, orientation, pixel spacing, window) lives in the
functional-group sequences; each is looked up per-frame first, then in the
shared group.
"""
import re
from typing import Any, List, Optional, Tuple

import numpy as np
import pydicom
from pydicom.dataset import Dataset, FileMetaDataset
from pydicom.uid import ExplicitVRLittleEndian, PYDICOM_IMPLEMENTATION_UID, generate_uid

MR_IMAGE_STORAGE = "1.2.840.10008.5.1.4.1.1.4"
CT_IMAGE_STORAGE = "1.2.840.10008.5.1.4.1.1.2"
ENHANCED_CT = "1.2.840.10008.5.1.4.1.1.2.1"

# Patient/study/series/image-pixel attributes that live at the top level of an
# enhanced object and carry over unchanged to every per-frame instance.
_COPY_KEYWORDS = [
    "PatientName", "PatientID", "PatientBirthDate", "PatientSex", "PatientAge",
    "StudyInstanceUID", "StudyDate", "StudyTime", "StudyID", "AccessionNumber",
    "StudyDescription", "ReferringPhysicianName", "Modality", "Manufacturer",
    "ManufacturerModelName", "InstitutionName", "SeriesInstanceUID", "SeriesNumber",
    "SeriesDescription", "SeriesDate", "SeriesTime", "FrameOfReferenceUID",
    "BodyPartExamined", "ProtocolName", "MagneticFieldStrength", "AcquisitionNumber",
    "PhotometricInterpretation", "BitsAllocated", "BitsStored", "HighBit",
    "PixelRepresentation",
]


def is_image(ds) -> bool:
    """False for presentation states, raw data, reports — anything without pixels."""
    return "PixelData" in ds


def is_multiframe(ds) -> bool:
    try:
        return int(getattr(ds, "NumberOfFrames", 1) or 1) > 1
    except (TypeError, ValueError):
        return False


def safe_stem(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", name).strip("_") or "img"


def _fg(ds, frame: int, sequence: str) -> Optional[Any]:
    """First item of a functional-group sequence for one frame: per-frame group
    wins, shared group is the fallback."""
    per_frame = ds.get("PerFrameFunctionalGroupsSequence")
    if per_frame and frame < len(per_frame):
        seq = per_frame[frame].get(sequence)
        if seq:
            return seq[0]
    shared = ds.get("SharedFunctionalGroupsSequence")
    if shared:
        seq = shared[0].get(sequence)
        if seq:
            return seq[0]
    return None


def expand_to_single_frames(ds, name_prefix: str) -> List[Tuple[str, Dataset]]:
    """Returns [(filename, single-frame Dataset)], one per frame. Raises on
    anything that isn't a plain grayscale multi-frame image."""
    n = int(ds.NumberOfFrames)
    if int(getattr(ds, "SamplesPerPixel", 1)) != 1:
        raise ValueError("only grayscale multi-frame images are supported")

    arr = ds.pixel_array
    if arr.ndim != 3 or arr.shape[0] != n:
        raise ValueError(f"unexpected pixel array shape {arr.shape} for {n} frames")

    bits = int(ds.BitsAllocated)
    signed = int(getattr(ds, "PixelRepresentation", 0)) == 1
    dtype = {8: np.uint8, 16: np.int16 if signed else np.uint16}.get(bits)
    if dtype is None:
        raise ValueError(f"unsupported BitsAllocated={bits}")

    out_class = CT_IMAGE_STORAGE if str(ds.SOPClassUID) == ENHANCED_CT else MR_IMAGE_STORAGE
    source_uid = str(ds.SOPInstanceUID)

    result: List[Tuple[str, Dataset]] = []
    for i in range(n):
        out = Dataset()
        for kw in _COPY_KEYWORDS:
            if kw in ds:
                out.add(ds[kw])

        sop_uid = generate_uid(entropy_srcs=[source_uid, str(i)])
        out.SOPClassUID = out_class
        out.SOPInstanceUID = sop_uid
        out.InstanceNumber = i + 1

        frame_type = _fg(ds, i, "MRImageFrameTypeSequence") or _fg(ds, i, "CTImageFrameTypeSequence")
        if frame_type is not None and "FrameType" in frame_type:
            out.ImageType = list(frame_type.FrameType)
        else:
            out.ImageType = list(ds.get("ImageType", ["ORIGINAL", "PRIMARY"]))

        orientation = _fg(ds, i, "PlaneOrientationSequence")
        if orientation is not None and "ImageOrientationPatient" in orientation:
            out.ImageOrientationPatient = list(orientation.ImageOrientationPatient)
        position = _fg(ds, i, "PlanePositionSequence")
        if position is not None and "ImagePositionPatient" in position:
            out.ImagePositionPatient = list(position.ImagePositionPatient)
        measures = _fg(ds, i, "PixelMeasuresSequence")
        if measures is not None:
            if "PixelSpacing" in measures:
                out.PixelSpacing = list(measures.PixelSpacing)
            if "SliceThickness" in measures:
                out.SliceThickness = measures.SliceThickness
        transform = _fg(ds, i, "PixelValueTransformationSequence")
        if transform is not None:
            if "RescaleIntercept" in transform:
                out.RescaleIntercept = transform.RescaleIntercept
            if "RescaleSlope" in transform:
                out.RescaleSlope = transform.RescaleSlope
        voi = _fg(ds, i, "FrameVOILUTSequence")
        if voi is not None and "WindowCenter" in voi and "WindowWidth" in voi:
            out.WindowCenter = voi.WindowCenter
            out.WindowWidth = voi.WindowWidth

        frame = np.ascontiguousarray(arr[i]).astype(dtype, copy=False)
        out.SamplesPerPixel = 1
        out.Rows, out.Columns = int(frame.shape[0]), int(frame.shape[1])
        out.add_new(0x7FE00010, "OW" if bits > 8 else "OB", frame.tobytes())

        out.file_meta = FileMetaDataset()
        out.file_meta.TransferSyntaxUID = ExplicitVRLittleEndian
        out.file_meta.MediaStorageSOPClassUID = out_class
        out.file_meta.MediaStorageSOPInstanceUID = sop_uid
        out.file_meta.ImplementationClassUID = PYDICOM_IMPLEMENTATION_UID
        out.is_little_endian = True
        out.is_implicit_VR = False

        result.append((f"{name_prefix}_{i + 1:04d}.dcm", out))
    return result


def save_dicom(ds: Dataset, path: str) -> None:
    if int(pydicom.__version__.split(".")[0]) >= 3:
        ds.save_as(path, enforce_file_format=True)
    else:
        ds.save_as(path, write_like_original=False)

