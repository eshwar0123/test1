"""
radiology/series_manifest.py
────────────────────────────────────────────────────────────────────────────
Drop-in companion to radiology/router.py. Same "/radiology" prefix, so it
mounts exactly the same way in main.py:

    from radiology import router as radiology_router
    from radiology import series_manifest

    app.include_router(radiology_router.router, prefix="/api")
    app.include_router(series_manifest.router,  prefix="/api")

Adds three things:

  GET /api/radiology/study/{case_id}/manifest
      Precomputed series grouping, read off local disk. Replaces the
      client-side header scan in useSeriesGrouping.js, which fetched the
      first 256 KB of every slice — ~75 MB for a 299-slice CT, on every open.

  GET /api/radiology/segmentations/{case_id}
      204 stub. router.py has no segmentation route at all, so this request
      404s on every case, and useVolumeMprCrosshair sits in a retry loop
      until it logs "gave up waiting". 204 lets the hook proceed instantly.

  POST /api/radiology/study/{case_id}/manifest/rebuild
      Force a re-parse after re-upload.

Directory constants are imported from router.py so there is exactly one
definition of where files live.
"""

from __future__ import annotations

import hashlib
import io
import json
import logging
import re
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import pydicom
from fastapi import APIRouter, Body, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from PIL import Image as PILImage
from pydicom.errors import InvalidDicomError

# Reuse router.py's constants and its S3-file-to-pixel-array cache rather than
# redefining them — scan_projection below is built on the exact same decode path
# scan_preview uses, just fanned out over a series' whole slice list.
from .router import BASE_DIR, BULK_CASES_DIR, DICOM_DIR, _get_cached_scan

try:
    from database import get_conn
except Exception:  # noqa: BLE001
    get_conn = None

log = logging.getLogger(__name__)
router = APIRouter(prefix="/radiology", tags=["Radiology"])

MANIFEST_DIR = Path(BASE_DIR) / "uploads" / "series_manifests"
MANIFEST_DIR.mkdir(parents=True, exist_ok=True)

# MUST match CACHE_VERSION in useSeriesGrouping.js. Bump both together or
# clients will silently keep consuming a manifest built by older logic.
CACHE_VERSION = 4

CASE_ID_RE = re.compile(r"^[A-Za-z0-9_.\-]{1,80}$")
DERIVED_MODE = "drop"

# ── Grouping rules — mirrors useSeriesGrouping.js ──────────────────────────
NON_IMAGE_SOP_PREFIXES = (
    "1.2.840.10008.5.1.4.1.1.88",    # Structured Report + Key Object Selection
    "1.2.840.10008.5.1.4.1.1.104",   # Encapsulated PDF / CDA / STL
    "1.2.840.10008.5.1.4.1.1.66",    # Raw Data, Spatial Registration, Surface
    "1.2.840.10008.5.1.4.1.1.11",    # Presentation State
    "1.2.840.10008.5.1.4.1.1.4.2",   # MR Spectroscopy
    "1.3.12.2.1107.5.9.1",           # Siemens CSA Non-Image (PhoenixZIPReport)
    "1.2.840.10008.1.3.10",          # DICOMDIR
)
SCOUT_RE = re.compile(r"scout|localizer|survey|tracker|topogram|\bloc\b", re.I)


def _is_non_image(sop: Optional[str]) -> bool:
    return bool(sop) and sop.startswith(NON_IMAGE_SOP_PREFIXES)


def _is_derived(image_type: Any) -> bool:
    if not image_type:
        return False
    parts = (
        image_type.upper().split("\\")
        if isinstance(image_type, str)
        else [str(p).upper() for p in image_type]
    )
    return "DERIVED" in parts


def _detect_plane(iop: Optional[List[float]]) -> Optional[str]:
    if not iop or len(iop) < 6:
        return None
    rx, ry, rz, cx, cy, cz = (float(v) for v in iop[:6])
    nx, ny, nz = (ry * cz - rz * cy, rz * cx - rx * cz, rx * cy - ry * cx)
    ax, ay, az = abs(nx), abs(ny), abs(nz)
    mx = max(ax, ay, az)
    if mx < 0.7:
        return "oblique"
    if mx == az:
        return "axial"
    if mx == ax:
        return "sagittal"
    return "coronal"


def _num(v) -> Optional[float]:
    try:
        if v is None:
            return None
        if hasattr(v, "__iter__") and not isinstance(v, (str, bytes)):
            v = list(v)[0]
        return float(v)
    except Exception:  # noqa: BLE001
        return None


def _floats(v) -> Optional[List[float]]:
    try:
        return [float(x) for x in v] or None if v is not None else None
    except Exception:  # noqa: BLE001
        return None


def _read_header(path: Path) -> Optional[Dict[str, Any]]:
    """
    stop_before_pixels is the entire point: a few KB per slice instead of the
    full ~525 KB. Measured at ~0.25 ms/slice, so a 299-slice study parses in
    about 75 ms server-side.
    """
    try:
        ds = pydicom.dcmread(str(path), stop_before_pixels=True, force=True, defer_size="1 KB")
    except (InvalidDicomError, OSError, Exception) as exc:  # noqa: BLE001
        log.debug("[manifest] unreadable %s: %s", path, exc)
        return None

    if not getattr(ds, "SeriesInstanceUID", None):
        return None

    return _dataset_to_dict(ds, path)


def _dataset_to_dict(ds: Any, ref: Any) -> Optional[Dict[str, Any]]:
    """Shared local-disk / S3 tag extraction — `ref` is the path (local) or the
    s3_key (S3), carried through under the "path"/"key" field so the caller
    can tell instances apart and build a thumbnail URL."""
    if not getattr(ds, "SeriesInstanceUID", None):
        return None
    iop = _floats(getattr(ds, "ImageOrientationPatient", None))
    row_mm = col_mm = None
    try:
        ps = getattr(ds, "PixelSpacing", None) or getattr(ds, "ImagerPixelSpacing", None)
        if ps and len(ps) >= 2:
            row_mm, col_mm = float(ps[0]), float(ps[1])
    except Exception:  # noqa: BLE001
        pass
    return {
        "ref": ref,
        "seriesInstanceUID": str(ds.SeriesInstanceUID),
        "sopInstanceUID": str(getattr(ds, "SOPInstanceUID", "") or "") or None,
        "sopClassUID": str(getattr(ds, "SOPClassUID", "") or "") or None,
        "seriesNumber": _num(getattr(ds, "SeriesNumber", None)),
        "seriesDescription": (str(getattr(ds, "SeriesDescription", "") or "").strip() or None),
        "modality": (str(getattr(ds, "Modality", "") or "").strip() or None),
        "instanceNumber": _num(getattr(ds, "InstanceNumber", None)),
        "imageType": getattr(ds, "ImageType", None),
        "rows": _num(getattr(ds, "Rows", None)),
        "columns": _num(getattr(ds, "Columns", None)),
        "pixelSpacingRowMm": row_mm,
        "pixelSpacingColMm": col_mm,
        "windowCenter": _num(getattr(ds, "WindowCenter", None)),
        "windowWidth": _num(getattr(ds, "WindowWidth", None)),
        "imageOrientationPatient": iop,
        "imagePositionPatient": _floats(getattr(ds, "ImagePositionPatient", None)),
        "frameOfReferenceUID": (str(getattr(ds, "FrameOfReferenceUID", "") or "") or None),
        "plane": _detect_plane(iop),
    }


# ── S3-backed variant of _read_header ───────────────────────────────────────
# Mirrors useSeriesGrouping.js's client-side fallback (range-read + escalate)
# but runs server-side with pydicom, so an S3-backed case gets the same
# grouped-by-series manifest a locally-synced case gets from _read_header —
# mobile has no client-side DICOM header parser and shouldn't need one.
_S3_HEADER_RANGE_BYTES = 32 * 1024
_S3_HEADER_RANGE_ESCALATED = 512 * 1024


def _read_header_s3(s3_key: str) -> Optional[Dict[str, Any]]:
    from s3_storage import s3, S3_BUCKET

    def _get_range(nbytes: Optional[int]) -> bytes:
        kwargs: Dict[str, Any] = {"Bucket": S3_BUCKET, "Key": s3_key}
        if nbytes is not None:
            kwargs["Range"] = f"bytes=0-{nbytes - 1}"
        obj = s3.get_object(**kwargs)
        return obj["Body"].read()

    for nbytes in (_S3_HEADER_RANGE_BYTES, _S3_HEADER_RANGE_ESCALATED, None):
        try:
            data = _get_range(nbytes)
            ds = pydicom.dcmread(io.BytesIO(data), stop_before_pixels=True, force=True, defer_size="1 KB")
            result = _dataset_to_dict(ds, s3_key)
            if result:
                return result
        except Exception as exc:  # noqa: BLE001
            log.debug("[s3-manifest] header read failed for %s (range=%s): %s", s3_key, nbytes, exc)
    return None


def _sort_key_factory(instances: List[Dict[str, Any]]):
    """Order by ImagePositionPatient projected on the slice normal.
    InstanceNumber alone mis-orders Siemens interleaved acquisitions."""
    normal = None
    for inst in instances:
        iop = inst.get("imageOrientationPatient")
        if iop and len(iop) >= 6:
            rx, ry, rz, cx, cy, cz = iop[:6]
            normal = (ry * cz - rz * cy, rz * cx - rx * cz, rx * cy - ry * cx)
            break

    def key(inst):
        proj = 0.0
        ipp = inst.get("imagePositionPatient")
        if normal and ipp and len(ipp) >= 3:
            proj = sum(ipp[i] * normal[i] for i in range(3))
        return (proj, inst.get("instanceNumber") or float("inf"), str(inst["ref"]))

    return key


def _estimate_slice_spacing_mm(instances_sorted):
    """Median distance between consecutive (already position-sorted) slices, projected
    onto the slice normal -- mm-per-slice for this series, so the client can convert a
    Slab Thickness value in mm (matching the web viewer's slider) into the slice-index
    thickness scan_projection actually takes. None when there's no orientation/position
    data to compute it from (rare, but a private/edited DICOM can be missing both)."""
    iop = next((i.get("imageOrientationPatient") for i in instances_sorted if i.get("imageOrientationPatient")), None)
    if not iop or len(iop) < 6:
        return None
    rx, ry, rz, cx, cy, cz = iop[:6]
    normal = (ry * cz - rz * cy, rz * cx - rx * cz, rx * cy - ry * cx)
    projs = []
    for inst in instances_sorted:
        ipp = inst.get("imagePositionPatient")
        if ipp and len(ipp) >= 3:
            projs.append(sum(ipp[k] * normal[k] for k in range(3)))
    if len(projs) < 2:
        return None
    diffs = sorted(abs(projs[i + 1] - projs[i]) for i in range(len(projs) - 1))
    mid = len(diffs) // 2
    median = diffs[mid] if len(diffs) % 2 else (diffs[mid - 1] + diffs[mid]) / 2
    return round(median, 4) if median > 0 else None


# ── Case folder resolution — mirrors _build_public_scan_urls in router.py ──
def resolve_case_folder(case_id: str) -> Optional[tuple]:
    """
    Return (folder_path, url_builder) for a case, or None for S3-backed cases
    that have no local copy.

    url_builder(rel_posix, base) must produce exactly the same URL shape the
    existing /dicom-series and /bulk-series endpoints emit, so nothing else in
    the frontend has to change.
    """
    file_path = None
    if get_conn is not None:
        try:
            conn = get_conn()
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT file_path, storage_type FROM radiology_schema.rad_scans "
                    "WHERE case_id = %s LIMIT 1",
                    (case_id,),
                )
                row = cur.fetchone()
            conn.close()
            if row:
                file_path, storage_type = row[0], (row[1] if len(row) > 1 else None)
                # S3-backed cases have no local folder to walk.
                if storage_type == "s3":
                    return None
        except Exception as exc:  # noqa: BLE001
            log.warning("[manifest] DB lookup failed for %s: %s", case_id, exc)

    bulk_root = Path(BULK_CASES_DIR).resolve()

    def bulk_url(sub: str):
        return lambda rel, base: f"{base}/api/uploads/organization/bulk_cases/{sub}/{rel}"

    def series_url(folder: str):
        return lambda rel, base: f"{base}/uploads/dicom-series/{folder}/{rel}"

    if file_path:
        fp = str(file_path).strip().replace("\\", "/").rstrip("/")
        for prefix in ("uploads/organization/bulk_cases/", "organization/bulk_cases/"):
            if fp.startswith(prefix):
                sub = fp[len(prefix):]
                p = (bulk_root / sub).resolve()
                try:
                    p.relative_to(bulk_root)
                except ValueError:
                    return None  # traversal attempt
                if p.is_dir():
                    return (p, bulk_url(sub))
        if fp.startswith("dicom-series/"):
            folder = fp.split("/", 1)[1]
            p = (Path(DICOM_DIR) / folder).resolve()
            if p.is_dir():
                return (p, series_url(folder))

    # Fall back to probing by case_id.
    p = (bulk_root / case_id).resolve()
    if p.is_dir():
        return (p, bulk_url(case_id))
    p = (Path(DICOM_DIR) / case_id).resolve()
    if p.is_dir():
        return (p, series_url(case_id))
    return None


def build_manifest(case_id: str, folder: Path, url_builder, base: str) -> Dict[str, Any]:
    """Walk a study folder once, group into renderable series, cache to disk."""
    started = time.perf_counter()
    files = sorted(p for p in folder.rglob("*") if p.is_file())
    log.info("[manifest] %s: scanning %d files in %s", case_id, len(files), folder)

    groups: Dict[str, Dict[str, Any]] = {}
    skipped_non_image = skipped_dupes = orphans = 0

    for path in files:
        p = _read_header(path)
        if p is None:
            orphans += 1
            continue

        sop = p["sopClassUID"]
        if _is_non_image(sop) or (not sop and not (p["rows"] and p["columns"])):
            skipped_non_image += 1
            continue

        uid = p["seriesInstanceUID"]
        g = groups.setdefault(uid, {
            "seriesInstanceUID": uid,
            "seriesNumber": p["seriesNumber"],
            "seriesDescription": p["seriesDescription"],
            "modality": p["modality"],
            "sopClassUID": sop,
            "plane": p["plane"],
            "windowCenter": p["windowCenter"],
            "windowWidth": p["windowWidth"],
            "rows": p["rows"],
            "columns": p["columns"],
            "imageOrientationPatient": p["imageOrientationPatient"],
            "frameOfReferenceUID": p["frameOfReferenceUID"],
            "instances": [],
            "_seen_sop": set(),
        })

        # Dedup by SOPInstanceUID — same instance under two paths counts once.
        if p["sopInstanceUID"]:
            if p["sopInstanceUID"] in g["_seen_sop"]:
                skipped_dupes += 1
                continue
            g["_seen_sop"].add(p["sopInstanceUID"])

        g["instances"].append(p)

        for field in ("seriesNumber", "seriesDescription", "modality", "windowCenter",
                      "windowWidth", "plane", "imageOrientationPatient", "frameOfReferenceUID"):
            if g[field] is None and p.get(field) is not None:
                g[field] = p[field]

    series: List[Dict[str, Any]] = []
    for g in groups.values():
        insts = g["instances"]
        if not insts:
            continue

        # Siemens packs DERIVED frames into the same SeriesInstanceUID as the
        # ORIGINAL acquisition. Drop them only when ORIGINALs exist — a pure
        # derived series (standalone MIP) stays intact as its own strip.
        if DERIVED_MODE == "drop":
            original = [i for i in insts if not _is_derived(i["imageType"])]
            if original and len(original) != len(insts):
                insts = original

        insts.sort(key=_sort_key_factory(insts))

        desc = g["seriesDescription"] or (
            f"{g['modality']} series" if g["modality"] else "Unnamed series"
        )
        series.append({
            "seriesUid": g["seriesInstanceUID"],
            "seriesNumber": int(g["seriesNumber"]) if g["seriesNumber"] is not None else None,
            "seriesDescription": desc,
            "modality": g["modality"],
            "sopClassUID": g["sopClassUID"],
            "plane": g["plane"],
            "defaultWindowCenter": g["windowCenter"],
            "defaultWindowWidth": g["windowWidth"],
            "rows": g["rows"],
            "columns": g["columns"],
            "instanceCount": len(insts),
            "urls": [
                url_builder(i["ref"].relative_to(folder).as_posix(), base) for i in insts
            ],
            "positions": [i["imagePositionPatient"] for i in insts],
            "iop": g["imageOrientationPatient"],
            "frameOfReferenceUID": g["frameOfReferenceUID"],
            "isScout": bool(SCOUT_RE.search(desc)),
            "isImageSeries": True,
        })

    series.sort(key=lambda s: s["seriesNumber"] if s["seriesNumber"] is not None else 10**9)

    payload = {
        "v": CACHE_VERSION,
        "caseId": case_id,
        "parsedAt": int(time.time() * 1000),
        "series": series,
    }

    out = MANIFEST_DIR / f"{case_id}.json"
    tmp = out.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload), encoding="utf-8")
    tmp.replace(out)  # atomic — a concurrent reader never sees a partial file

    log.info(
        "[manifest] %s: %d series (%s) in %.0f ms | non-image=%d dupes=%d unreadable=%d",
        case_id, len(series),
        ", ".join(f"SE{s['seriesNumber']}:{s['instanceCount']}" for s in series),
        (time.perf_counter() - started) * 1000,
        skipped_non_image, skipped_dupes, orphans,
    )
    return payload


# ── Endpoints ──────────────────────────────────────────────────────────────
@router.get("/study/{case_id}/manifest")
def get_manifest(request: Request, case_id: str):
    if not CASE_ID_RE.match(case_id):
        raise HTTPException(status_code=400, detail="invalid case_id")

    base = str(request.base_url).rstrip("/")
    cached = MANIFEST_DIR / f"{case_id}.json"

    if cached.is_file():
        return Response(
            content=cached.read_bytes(),
            media_type="application/json",
            headers={"Cache-Control": "public, max-age=86400"},
        )

    resolved = resolve_case_folder(case_id)
    if resolved is None:
        # 204, not 404. "No local manifest" is a normal state the client falls
        # back from (S3 cases, legacy rows). A 404 reads as broken and invites
        # retry loops — which is exactly what the missing segmentation route
        # was doing to useVolumeMprCrosshair.
        return Response(status_code=204)

    folder, url_builder = resolved
    try:
        payload = build_manifest(case_id, folder, url_builder, base)
    except Exception as exc:  # noqa: BLE001
        log.exception("[manifest] build failed for %s", case_id)
        raise HTTPException(status_code=500, detail=f"Manifest build failed: {exc}")

    if not payload["series"]:
        return Response(status_code=204)

    return JSONResponse(payload, headers={"Cache-Control": "public, max-age=86400"})


@router.post("/study/{case_id}/manifest/rebuild")
def rebuild_manifest(request: Request, case_id: str):
    if not CASE_ID_RE.match(case_id):
        raise HTTPException(status_code=400, detail="invalid case_id")
    resolved = resolve_case_folder(case_id)
    if resolved is None:
        raise HTTPException(status_code=404, detail="No local folder for this case")
    folder, url_builder = resolved
    payload = build_manifest(case_id, folder, url_builder, str(request.base_url).rstrip("/"))
    return {"ok": True, "seriesCount": len(payload["series"])}


# ═══════════════════════════════════════════════════════════════════════════
# S3-backed manifest — the mobile app's cases are S3-only (storage_type="s3"),
# so resolve_case_folder() above always returns None for them and /manifest
# 204s. Rather than push client-side DICOM header parsing onto the mobile
# app (the web frontend's fallback — dicom-parser + range GETs through
# useSeriesGrouping.js — needs a JS DICOM parser mobile doesn't have), this
# does the same grouping server-side, reading each instance's header with a
# ranged S3 GET instead of a local file read. Keyed by the S3 folder prefix
# mobile already discovers via GET /storage/list-keys, not by case_id, since
# a prefix is what mobile has on hand (multi-series S3 cases have no local
# case_id folder to resolve).
# ═══════════════════════════════════════════════════════════════════════════
S3_MANIFEST_DIR = Path(BASE_DIR) / "uploads" / "s3_series_manifests"
S3_MANIFEST_DIR.mkdir(parents=True, exist_ok=True)

# Network-bound (S3 GETs), so a thread pool is effective despite the GIL —
# mirrors storage/router.py's _normalize_pool for the same reason.
_S3_MANIFEST_POOL = ThreadPoolExecutor(max_workers=16)


def _s3_manifest_cache_path(prefix: str) -> Path:
    digest = hashlib.sha1(prefix.encode("utf-8")).hexdigest()
    return S3_MANIFEST_DIR / f"{digest}.json"


def build_s3_manifest(prefix: str, keys: List[str]) -> Dict[str, Any]:
    """S3 equivalent of build_manifest(): same grouping/dedup/derived-drop
    rules, but instances are kept as bare s3_key strings (under "keys") rather
    than relative-path URLs, since mobile renders each one via
    GET /radiology/scan-preview?s3_key=."""
    started = time.perf_counter()
    log.info("[s3-manifest] %s: reading headers for %d keys", prefix, len(keys))

    parsed = list(_S3_MANIFEST_POOL.map(_read_header_s3, keys))

    groups: Dict[str, Dict[str, Any]] = {}
    skipped_non_image = skipped_dupes = orphans = 0

    for p in parsed:
        if p is None:
            orphans += 1
            continue

        sop = p["sopClassUID"]
        if _is_non_image(sop) or (not sop and not (p["rows"] and p["columns"])):
            skipped_non_image += 1
            continue

        uid = p["seriesInstanceUID"]
        g = groups.setdefault(uid, {
            "seriesInstanceUID": uid,
            "seriesNumber": p["seriesNumber"],
            "seriesDescription": p["seriesDescription"],
            "modality": p["modality"],
            "sopClassUID": sop,
            "plane": p["plane"],
            "windowCenter": p["windowCenter"],
            "windowWidth": p["windowWidth"],
            "rows": p["rows"],
            "columns": p["columns"],
            "pixelSpacingRowMm": p["pixelSpacingRowMm"],
            "pixelSpacingColMm": p["pixelSpacingColMm"],
            "imageOrientationPatient": p["imageOrientationPatient"],
            "frameOfReferenceUID": p["frameOfReferenceUID"],
            "instances": [],
            "_seen_sop": set(),
        })

        if p["sopInstanceUID"]:
            if p["sopInstanceUID"] in g["_seen_sop"]:
                skipped_dupes += 1
                continue
            g["_seen_sop"].add(p["sopInstanceUID"])

        g["instances"].append(p)

        for field in ("seriesNumber", "seriesDescription", "modality", "windowCenter",
                      "windowWidth", "plane", "imageOrientationPatient", "frameOfReferenceUID",
                      "rows", "columns", "pixelSpacingRowMm", "pixelSpacingColMm"):
            if g[field] is None and p.get(field) is not None:
                g[field] = p[field]

    series: List[Dict[str, Any]] = []
    for g in groups.values():
        insts = g["instances"]
        if not insts:
            continue

        if DERIVED_MODE == "drop":
            original = [i for i in insts if not _is_derived(i["imageType"])]
            if original and len(original) != len(insts):
                insts = original

        insts.sort(key=_sort_key_factory(insts))

        desc = g["seriesDescription"] or (
            f"{g['modality']} series" if g["modality"] else "Unnamed series"
        )
        series.append({
            "seriesUid": g["seriesInstanceUID"],
            "seriesNumber": int(g["seriesNumber"]) if g["seriesNumber"] is not None else None,
            "seriesDescription": desc,
            "modality": g["modality"],
            "instanceCount": len(insts),
            "keys": [i["ref"] for i in insts],
            # Parallel to "keys" — the 3D position (mm, patient space) of each instance,
            # in the same order. Lets the client compute exactly where one series'
            # currently-displayed slice plane intersects another (perpendicular) series'
            # image, for a reference-line overlay like the web MPR viewports draw.
            # None entries for any instance missing ImagePositionPatient.
            "positionsMm": [i.get("imagePositionPatient") for i in insts],
            # Direction cosines [rx,ry,rz,cx,cy,cz] — tracked at the group level for sorting/
            # plane-detection since forever, but never actually surfaced in the response
            # until now. The client needs it (paired with positionsMm) to compute plane
            # geometry for cross-series reference lines.
            "imageOrientationPatient": g["imageOrientationPatient"],
            "isScout": bool(SCOUT_RE.search(desc)),
            "sliceSpacingMm": _estimate_slice_spacing_mm(insts),
            "rows": int(g["rows"]) if g["rows"] is not None else None,
            "columns": int(g["columns"]) if g["columns"] is not None else None,
            "pixelSpacingRowMm": g["pixelSpacingRowMm"],
            "pixelSpacingColMm": g["pixelSpacingColMm"],
        })

    series.sort(key=lambda s: s["seriesNumber"] if s["seriesNumber"] is not None else 10**9)

    payload = {
        "v": CACHE_VERSION,
        "prefix": prefix,
        "parsedAt": int(time.time() * 1000),
        "series": series,
    }

    out = _s3_manifest_cache_path(prefix)
    tmp = out.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload), encoding="utf-8")
    tmp.replace(out)  # atomic — a concurrent reader never sees a partial file

    log.info(
        "[s3-manifest] %s: %d series (%s) in %.0f ms | non-image=%d dupes=%d unreadable=%d",
        prefix, len(series),
        ", ".join(f"SE{s['seriesNumber']}:{s['instanceCount']}" for s in series),
        (time.perf_counter() - started) * 1000,
        skipped_non_image, skipped_dupes, orphans,
    )
    return payload


@router.get("/s3-manifest")
def get_s3_manifest(prefix: str):
    prefix = (prefix or "").strip()
    if not prefix or ".." in prefix or prefix.startswith("/"):
        raise HTTPException(status_code=400, detail="invalid prefix")

    cached = _s3_manifest_cache_path(prefix)
    if cached.is_file():
        return Response(
            content=cached.read_bytes(),
            media_type="application/json",
            headers={"Cache-Control": "no-cache"},
        )

    try:
        from s3_storage import s3, S3_BUCKET
        resp = s3.list_objects_v2(Bucket=S3_BUCKET, Prefix=prefix)
        keys = [o["Key"] for o in resp.get("Contents", []) if o["Key"].lower().endswith(".dcm")]
    except Exception as exc:  # noqa: BLE001
        log.error("[s3-manifest] list_objects_v2 failed for prefix=%s: %s", prefix, exc)
        raise HTTPException(status_code=502, detail="Upstream storage error")

    if not keys:
        # 204, not 404 — same reasoning as /manifest: an empty/non-DICOM
        # folder is a normal state the client falls back from.
        return Response(status_code=204)

    try:
        payload = build_s3_manifest(prefix, keys)
    except Exception as exc:  # noqa: BLE001
        log.exception("[s3-manifest] build failed for prefix=%s", prefix)
        raise HTTPException(status_code=500, detail=f"Manifest build failed: {exc}")

    if not payload["series"]:
        return Response(status_code=204)

    return JSONResponse(payload, headers={"Cache-Control": "no-cache"})


@router.post("/s3-manifest/rebuild")
def rebuild_s3_manifest(prefix: str):
    prefix = (prefix or "").strip()
    if not prefix or ".." in prefix or prefix.startswith("/"):
        raise HTTPException(status_code=400, detail="invalid prefix")
    try:
        cached = _s3_manifest_cache_path(prefix)
        if cached.is_file():
            cached.unlink()
    except OSError:
        pass
    return get_s3_manifest(prefix)


# ── Projection (MIP / MinIP / Average) ──────────────────────────────────────
# Mirrors the web viewer's Project dropdown, but computed here as a pixel-wise
# max/min/mean across a series' 2D slice arrays rather than a real Cornerstone3D
# volume — mobile has no client-side voxel renderer. This is the same math a true
# MIP does; it just skips arbitrary-plane reformatting, which needs the full 3D
# volume MPR provides and which mobile intentionally doesn't have.
#
# Takes `prefix` + `seriesUid` rather than the series' raw key list: a 144-slice
# series' s3_keys would blow past a safe GET query-string length, and mobile
# already has both of these on hand from the s3-manifest it fetched to populate
# the series panel — no need to round-trip the key list back to the server.
_PROJECTION_MAX_SLICES = 200


@router.get("/scan-projection")
def scan_projection(
    prefix: str,
    series_uid: str,
    mode: str = "mip",
    wl: str = "default",
    invert: bool = False,
    center: Optional[int] = None,
    thickness: Optional[int] = None,
):
    prefix = (prefix or "").strip()
    if not prefix or ".." in prefix or prefix.startswith("/"):
        raise HTTPException(status_code=400, detail="invalid prefix")
    if mode not in ("mip", "minip", "average"):
        raise HTTPException(status_code=400, detail="mode must be mip, minip, or average")

    cached = _s3_manifest_cache_path(prefix)
    if not cached.is_file():
        raise HTTPException(status_code=404, detail="No manifest for this prefix — fetch /s3-manifest first")
    try:
        manifest = json.loads(cached.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=500, detail=f"Manifest read failed: {exc}")

    series = next((s for s in manifest.get("series", []) if s.get("seriesUid") == series_uid), None)
    if series is None:
        raise HTTPException(status_code=404, detail="Series not found in manifest")
    keys: List[str] = series.get("keys") or []
    if not keys:
        raise HTTPException(status_code=422, detail="Series has no slices")

    if thickness is not None and thickness > 0 and center is not None:
        half = thickness // 2
        lo_i = max(0, center - half)
        hi_i = min(len(keys), center + half + 1)
        keys = keys[lo_i:hi_i] or keys[center : center + 1]

    # Sample evenly across the full range rather than truncating, so a capped
    # projection still spans the whole series instead of just its first N slices.
    if len(keys) > _PROJECTION_MAX_SLICES:
        idx = sorted(set(np.linspace(0, len(keys) - 1, _PROJECTION_MAX_SLICES).round().astype(int).tolist()))
        keys = [keys[i] for i in idx]

    arrays = []
    shape = None
    for k in keys:
        try:
            arr, _meta = _get_cached_scan(k)
        except HTTPException:
            continue  # one unreadable slice shouldn't fail the whole projection
        if shape is None:
            shape = arr.shape
        if arr.shape == shape:
            arrays.append(arr)

    if not arrays:
        raise HTTPException(status_code=422, detail="No readable slices for projection")

    stack = np.stack(arrays, axis=0)
    if mode == "mip":
        proj = np.max(stack, axis=0)
    elif mode == "minip":
        proj = np.min(stack, axis=0)
    else:
        proj = np.mean(stack, axis=0)

    if wl == "bone":
        sample = proj.flat[::37]
        lo, hi = float(np.percentile(sample, 50)), float(np.percentile(sample, 99.5))
    else:
        lo, hi = float(np.min(proj)), float(np.max(proj))
    norm = (
        np.zeros_like(proj, dtype=np.uint8)
        if hi - lo == 0
        else np.clip((proj - lo) / (hi - lo) * 255, 0, 255).astype(np.uint8)
    )
    if invert:
        norm = 255 - norm

    png_img = PILImage.fromarray(norm)
    png_img.thumbnail((1000, 1000), PILImage.LANCZOS)
    buf = io.BytesIO()
    png_img.save(buf, format="PNG")
    return Response(content=buf.getvalue(), media_type="image/png")


# -- MPR (sagittal / coronal reformatting) -----------------------------------
# A genuine reconstruction -- stacks the series' real axial slices into a 3D array and
# resamples a plane out of it -- not the same thing as the web viewer's live, crosshair-
# synced 3-viewport MPR (which needs Cornerstone3D's full GPU volume renderer; nothing
# equivalent exists in React Native). Mobile requests one reformatted plane at a time,
# same pattern as scan-projection.
#
# Orientation caveat, disclosed rather than silently guessed: this stretches the
# reformatted plane to the correct physical aspect ratio (inter-slice spacing vs in-plane
# pixel spacing), which is the part that actually matters for not looking squashed/
# stretched. It does NOT attempt full radiological left/right or superior/inferior
# convention correction from ImageOrientationPatient direction cosines -- for a standard
# axial head/body acquisition (by far the common case) the result reads correctly; a
# heavily tilted/oblique gantry acquisition may not be perfectly conventional.
_MPR_MAX_SLICES = 300


@router.get("/scan-mpr")
def scan_mpr(prefix: str, series_uid: str, plane: str, index: int, wl: str = "default", invert: bool = False):
    prefix = (prefix or "").strip()
    if not prefix or ".." in prefix or prefix.startswith("/"):
        raise HTTPException(status_code=400, detail="invalid prefix")
    if plane not in ("sagittal", "coronal"):
        raise HTTPException(status_code=400, detail="plane must be sagittal or coronal")

    cached = _s3_manifest_cache_path(prefix)
    if not cached.is_file():
        raise HTTPException(status_code=404, detail="No manifest for this prefix -- fetch /s3-manifest first")
    try:
        manifest = json.loads(cached.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=500, detail=f"Manifest read failed: {exc}")

    series = next((s for s in manifest.get("series", []) if s.get("seriesUid") == series_uid), None)
    if series is None:
        raise HTTPException(status_code=404, detail="Series not found in manifest")
    keys: List[str] = series.get("keys") or []
    if len(keys) < 3:
        raise HTTPException(status_code=422, detail="Series too thin to reformat (need >= 3 slices)")

    rows = series.get("rows")
    columns = series.get("columns")
    row_mm = series.get("pixelSpacingRowMm")
    col_mm = series.get("pixelSpacingColMm")
    slice_mm = series.get("sliceSpacingMm")

    use_keys = keys
    if len(use_keys) > _MPR_MAX_SLICES:
        idx = sorted(set(np.linspace(0, len(use_keys) - 1, _MPR_MAX_SLICES).round().astype(int).tolist()))
        use_keys = [use_keys[i] for i in idx]

    arrays = []
    shape = None
    for k in use_keys:
        try:
            arr, _meta = _get_cached_scan(k)
        except HTTPException:
            continue
        if shape is None:
            shape = arr.shape
        if arr.shape == shape:
            arrays.append(arr)

    if len(arrays) < 3:
        raise HTTPException(status_code=422, detail="Not enough readable slices to reformat")

    volume = np.stack(arrays, axis=0)  # (Z, Y, X) = (slices, rows, columns)
    z, y, x = volume.shape

    if plane == "sagittal":
        idx = max(0, min(x - 1, index))
        img = volume[:, :, idx]  # (Z, Y)
        physical_w_per_px = row_mm or 1.0
    else:
        idx = max(0, min(y - 1, index))
        img = volume[:, idx, :]  # (Z, X)
        physical_w_per_px = col_mm or 1.0

    physical_h_per_px = slice_mm or physical_w_per_px

    if wl == "bone":
        sample = img.flat[::37] if img.size > 37 else img.flat
        lo, hi = float(np.percentile(sample, 50)), float(np.percentile(sample, 99.5))
    else:
        lo, hi = float(np.min(img)), float(np.max(img))
    norm = (
        np.zeros_like(img, dtype=np.uint8)
        if hi - lo == 0
        else np.clip((img - lo) / (hi - lo) * 255, 0, 255).astype(np.uint8)
    )
    if invert:
        norm = 255 - norm

    png_img = PILImage.fromarray(norm)
    scale = physical_h_per_px / physical_w_per_px if physical_w_per_px else 1.0
    if scale and abs(scale - 1.0) > 0.01:
        new_h = max(1, round(png_img.height * scale))
        png_img = png_img.resize((png_img.width, new_h), PILImage.LANCZOS)
    png_img.thumbnail((1000, 1000), PILImage.LANCZOS)

    buf = io.BytesIO()
    png_img.save(buf, format="PNG")
    return Response(content=buf.getvalue(), media_type="image/png")


@router.get("/file/{key:path}")
def stream_instance(key: str, request: Request):
    """
    Single-origin streaming endpoint for one DICOM instance.

    useViewerDataLoader rewrites presigned S3 URLs to this path. That rewrite
    exists to kill two costs at once:
      * the per-slice presign round-trip to /api/storage/download-url
      * the download-entire-study-into-blobs step that presigned URLs forced,
        because S3 rejects requests carrying both ?X-Amz-Signature and an
        Authorization header

    Resolution order is local disk first (nginx should already be serving
    those paths directly — see the sites-available/default patch), then a
    straight passthrough from S3 for cases that were never synced down.

    Range is honoured either way: useSeriesGrouping reads only the first 32 KB
    of a header, and Cornerstone issues ranges when scrubbing.
    """
    if ".." in key or key.startswith("/"):
        raise HTTPException(status_code=400, detail="Invalid key")

    # Path-style S3 endpoints (endpoint_url="https://s3.<region>.amazonaws.com")
    # put the bucket INSIDE the path:
    #   virtual-hosted: https://onix-s3.s3.ap-south-1.amazonaws.com/uploads/x.dcm
    #                   -> pathname "/uploads/x.dcm"          key = uploads/x.dcm
    #   path-style:     https://s3.ap-south-1.amazonaws.com/onix-s3/uploads/x.dcm
    #                   -> pathname "/onix-s3/uploads/x.dcm"  key = onix-s3/uploads/x.dcm  ✗
    # The frontend rewrite just takes pathname, so strip a leading bucket
    # segment here rather than trying to detect the style client-side.
    try:
        from s3_storage import S3_BUCKET as _bucket
        if _bucket and key.startswith(f"{_bucket}/"):
            key = key[len(_bucket) + 1:]
    except Exception:  # noqa: BLE001
        pass

    range_header = request.headers.get("range")

    # ── 1. Local disk ─────────────────────────────────────────────────────
    for root in (Path(BULK_CASES_DIR).parent.parent, Path(BASE_DIR).parent):
        try:
            candidate = (root / key).resolve()
            candidate.relative_to(root.resolve())
        except (ValueError, OSError):
            continue
        if candidate.is_file():
            from fastapi.responses import FileResponse
            return FileResponse(
                str(candidate),
                media_type="application/dicom",
                headers={
                    "Cache-Control": "public, max-age=31536000, immutable",
                    "Accept-Ranges": "bytes",
                },
            )

    # ── 2. S3 passthrough ─────────────────────────────────────────────────
    try:
        from s3_storage import s3, S3_BUCKET
    except Exception as exc:  # noqa: BLE001
        log.error("[file] no local copy of %s and S3 unavailable: %s", key, exc)
        raise HTTPException(status_code=404, detail="File not found")

    get_kwargs = {"Bucket": S3_BUCKET, "Key": key}
    if range_header:
        get_kwargs["Range"] = range_header

    try:
        obj = s3.get_object(**get_kwargs)
    except Exception as exc:  # noqa: BLE001
        # boto3 raises ClientError for a missing key, not a distinctly-named
        # exception — the code lives in .response["Error"]["Code"]. Checking
        # type(exc).__name__ alone silently turns every 404 into a 502.
        code = ""
        resp = getattr(exc, "response", None)
        if isinstance(resp, dict):
            code = str(resp.get("Error", {}).get("Code", ""))
            status = resp.get("ResponseMetadata", {}).get("HTTPStatusCode")
            if status == 404:
                code = code or "404"
        blob = f"{type(exc).__name__} {code} {exc}"
        if any(t in blob for t in ("NoSuchKey", "NoSuchBucket", "404")):
            raise HTTPException(status_code=404, detail="File not found")
        log.error("[file] S3 get_object failed for %s: %s", key, exc)
        raise HTTPException(status_code=502, detail="Upstream storage error")

    headers = {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Accept-Ranges": "bytes",
    }
    if obj.get("ETag"):
        headers["ETag"] = obj["ETag"]
    if obj.get("ContentRange"):
        headers["Content-Range"] = obj["ContentRange"]
    if obj.get("ContentLength") is not None:
        headers["Content-Length"] = str(obj["ContentLength"])

    from fastapi.responses import StreamingResponse

    def chunks():
        # Stream rather than buffering the whole instance in memory — a 299-
        # slice study at 512 KB each would otherwise be 150 MB of resident
        # bytes per concurrent viewer.
        try:
            for chunk in obj["Body"].iter_chunks(chunk_size=64 * 1024):
                yield chunk
        finally:
            try:
                obj["Body"].close()
            except Exception:  # noqa: BLE001
                pass

    return StreamingResponse(
        chunks(),
        status_code=206 if range_header and obj.get("ContentRange") else 200,
        media_type="application/dicom",
        headers=headers,
    )


@router.get("/segmentations/{case_id}")
def get_segmentations(case_id: str):
    """
    Stub. router.py registers no segmentation route, so this path 404s for
    every case — and useVolumeMprCrosshair treats 404 as "not ready yet" and
    retries until it logs "gave up waiting", which is dead time on every open.

    204 means "no segmentation for this case" unambiguously. When the
    anatomy_segmentations work lands, replace the body with the real lookup
    and keep returning 204 for cases that genuinely have none.
    """
    return Response(status_code=204)
