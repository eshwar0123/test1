"""
backend/dicom_transcode.py

Normalizes DICOM files at ingest time so every consumer downstream (the
desktop Cornerstone viewer fetching straight from S3, the mobile
scan-preview endpoint, anything else) can always load them. Two distinct
problems get fixed here:

1. Compressed pixel data (JPEG-LS, JPEG2000, JPEG-Lossless, RLE, ...).
   Cornerstone3D running in a Web Worker can't decode these in this build —
   the codec loader throws "Codec loader requires a browser environment"
   because it checks `typeof window`, which doesn't exist inside a Worker's
   `self` scope. We decompress to an uncompressed transfer syntax instead of
   fighting that client-side.

2. Missing DICOM Part 10 header (no 128-byte preamble / no "DICM" magic /
   no file meta group). Some scanners export a raw implicit-VR dataset
   stream with no wrapper at all. pydicom (and Cornerstone's wadouri loader,
   which is equally strict) refuse to parse these without being told
   force=True — surfaced as "File is missing DICOM File Meta Information
   header or the 'DICM' prefix is missing". We rebuild a proper Part 10
   file around the raw dataset instead.
"""
import traceback

import pydicom
from pydicom.uid import ImplicitVRLittleEndian, ExplicitVRLittleEndian, ExplicitVRBigEndian, generate_uid

# Decompressing JPEG-LS/JPEG2000/JPEG-Lossless/RLE requires at least one of
# these plugins to actually be importable in the RUNNING process (being in
# requirements.txt isn't enough if the venv this process uses never had
# `pip install` re-run against it) — without one, ds.decompress() raises and
# transcode_dicom_if_compressed() silently falls back to leaving the file
# compressed, which then fails again downstream (scan-preview, the frontend
# viewer) with no obvious link back to "a package is missing." Log it loudly
# once at import time instead, and say exactly which plugin(s) are missing.
_PLUGIN_STATUS = {}
for _pkg in ("pylibjpeg", "gdcm"):
    try:
        __import__(_pkg)
        _PLUGIN_STATUS[_pkg] = True
    except ImportError:
        _PLUGIN_STATUS[_pkg] = False

if not any(_PLUGIN_STATUS.values()):
    print(
        "[dicom_transcode] WARNING: no pixel-data decode plugin is importable "
        f"in this environment ({_PLUGIN_STATUS}) — compressed DICOM files "
        "(JPEG-LS/JPEG2000/JPEG-Lossless/RLE) will fail to decode both here "
        "and in scan-preview. Run `pip install -r requirements.txt` in the "
        "venv THIS PROCESS actually uses (check with `import sys; sys.executable` "
        "or `which python` inside the same shell/service that starts uvicorn), "
        "then fully restart the backend process — not just redeploy files."
    )
else:
    missing = [p for p, ok in _PLUGIN_STATUS.items() if not ok]
    if missing:
        print(f"[dicom_transcode] note: {missing} not available, but at least one decode plugin is — {_PLUGIN_STATUS}")


def read_dicom_lenient(path_or_buffer):
    """Read a DICOM file (path string or file-like object, e.g. BytesIO) the
    normal way, falling back to force=True for raw dataset streams that lack
    the standard Part 10 preamble/DICM/file-meta wrapper. When forced, fills
    in file_meta.TransferSyntaxUID from pydicom's own
    is_implicit_VR/is_little_endian guess (it reads those heuristically even
    without a file meta group) so callers can treat the result exactly like a
    normally-read dataset. Returns (ds, was_forced) or (None, False) if the
    file genuinely isn't readable as DICOM."""
    seekable = hasattr(path_or_buffer, "seek")

    try:
        return pydicom.dcmread(path_or_buffer), False
    except Exception:
        pass

    if seekable:
        path_or_buffer.seek(0)

    try:
        ds = pydicom.dcmread(path_or_buffer, force=True)
    except Exception:
        return None, False

    if not hasattr(ds, "file_meta") or "TransferSyntaxUID" not in getattr(ds, "file_meta", {}):
        if ds.is_implicit_VR:
            ts = ImplicitVRLittleEndian
        else:
            ts = ExplicitVRLittleEndian if ds.is_little_endian else ExplicitVRBigEndian
        ds.file_meta.TransferSyntaxUID = ts
        ds.file_meta.MediaStorageSOPClassUID = getattr(ds, "SOPClassUID", generate_uid())
        ds.file_meta.MediaStorageSOPInstanceUID = getattr(ds, "SOPInstanceUID", generate_uid())

    return ds, True


def transcode_dicom_if_compressed(path: str) -> bool:
    """Normalize the DICOM file at `path` so any standard DICOM reader
    (pydicom, Cornerstone's wadouri loader) can load it: decompress
    compressed pixel data, and rebuild a proper Part 10 header for files that
    arrived as a raw/headerless dataset stream. Returns True if the file was
    rewritten, False if it was already fine or isn't a readable DICOM file at
    all (never raises — callers should treat failures as non-fatal and fall
    back to the original file)."""
    ds, was_forced = read_dicom_lenient(path)
    if ds is None:
        return False

    try:
        transfer_syntax = ds.file_meta.TransferSyntaxUID
    except Exception:
        return False

    needs_decompress = getattr(transfer_syntax, "is_compressed", False)
    if not needs_decompress and not was_forced:
        return False  # already a normal, uncompressed Part 10 file

    try:
        if needs_decompress:
            ds.decompress()
        ds.save_as(path, enforce_file_format=True)
        return True
    except Exception as e:
        print(f"[dicom_transcode] failed to normalize {path}: {e}")
        traceback.print_exc()
        return False
