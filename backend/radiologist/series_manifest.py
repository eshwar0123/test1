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

import json
import logging
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import pydicom
from fastapi import APIRouter, Body, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from pydicom.errors import InvalidDicomError

# Reuse router.py's constants rather than redefining them.
from .router import BASE_DIR, BULK_CASES_DIR, DICOM_DIR

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

    iop = _floats(getattr(ds, "ImageOrientationPatient", None))
    return {
        "path": path,
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
        "windowCenter": _num(getattr(ds, "WindowCenter", None)),
        "windowWidth": _num(getattr(ds, "WindowWidth", None)),
        "imageOrientationPatient": iop,
        "imagePositionPatient": _floats(getattr(ds, "ImagePositionPatient", None)),
        "frameOfReferenceUID": (str(getattr(ds, "FrameOfReferenceUID", "") or "") or None),
        "plane": _detect_plane(iop),
    }


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
        return (proj, inst.get("instanceNumber") or float("inf"), inst["path"].name)

    return key


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
                url_builder(i["path"].relative_to(folder).as_posix(), base) for i in insts
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
