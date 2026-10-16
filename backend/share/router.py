"""
backend/share/router.py

  GET /share/patient/{token}        public, no auth. 410 once expires_at has passed.
                                    Returns images only (presigned URLs, ~15 min).
  GET /technician/patient-links     technician only. {case_id: {url, expires_at, expired}}
                                    for the given cases of the caller's organization.
"""
import json
import os
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, Response

from auth.dependencies import get_current_user
from database import get_conn
from . import crud

router = APIRouter(tags=["Share"])

# Image URLs are short-lived so a leaked image URL cannot outlive the 24h link.
IMAGE_URL_TTL_SECONDS = int(os.getenv("PATIENT_IMAGE_URL_TTL", "900"))
_NO_STORE = {"Cache-Control": "no-store"}


def _series_for_prefix(prefix: str) -> List[dict]:
    """Series with presigned instance URLs for an S3 study folder."""
    from s3_storage import s3, S3_BUCKET, presigned_download
    from radiologist.series_manifest import get_s3_manifest

    series: List[dict] = []
    try:
        resp = get_s3_manifest(prefix)
        body = getattr(resp, "body", b"") or b""
        manifest = json.loads(body) if body else {}
    except Exception:
        manifest = {}

    for s in manifest.get("series") or []:
        keys = s.get("keys") or []
        if not keys:
            continue
        series.append({
            "seriesUid": s.get("seriesUid"),
            "description": s.get("seriesDescription") or "",
            "modality": s.get("modality"),
            "isScout": bool(s.get("isScout")),
            "urls": [presigned_download(k, IMAGE_URL_TTL_SECONDS) for k in keys],
        })

    if not series:
        # No parsable manifest: fall back to the folder's .dcm files as one stack.
        listing = s3.list_objects_v2(Bucket=S3_BUCKET, Prefix=prefix)
        keys = sorted(o["Key"] for o in listing.get("Contents", []) if o["Key"].lower().endswith(".dcm"))
        if keys:
            series.append({
                "seriesUid": "all", "description": "", "modality": None, "isScout": False,
                "urls": [presigned_download(k, IMAGE_URL_TTL_SECONDS) for k in keys],
            })
    return series


@router.get("/share/patient/{token}")
def patient_view(token: str):
    conn = get_conn()
    try:
        link = crud.get_link_by_token(conn, token)
        if not link:
            raise HTTPException(404, "Link not found")
        # Checked against the DB clock on every request.
        if not link["active"]:
            raise HTTPException(410, "This link has expired")

        with conn.cursor() as cur:
            cur.execute(
                "SELECT s3_key, storage_type FROM radiology_schema.rad_scans WHERE case_id = %s LIMIT 1",
                (link["case_id"],),
            )
            scan = cur.fetchone()
        if not scan:
            raise HTTPException(404, "Images not found")
        s3_key, storage_type = scan
        if storage_type != "s3" or not s3_key or "/" not in s3_key:
            raise HTTPException(501, "Images for this study are not available through a patient link")
        if s3_key.lower().endswith((".nii", ".nii.gz")):
            raise HTTPException(501, "This study type is not available through a patient link")

        prefix = s3_key[: s3_key.rfind("/") + 1]
        try:
            series = _series_for_prefix(prefix)
        except Exception as exc:
            print(f"[share] image listing failed for token ...{token[-6:]}: {exc}")
            raise HTTPException(502, "Could not load images")
        if not series:
            raise HTTPException(404, "Images not found")

        crud.record_access(conn, link["link_id"])
        return Response(
            content=json.dumps({
                "expires_at": link["expires_at"].isoformat(),
                "image_url_ttl_seconds": IMAGE_URL_TTL_SECONDS,
                "series": series,
            }),
            media_type="application/json",
            headers=_NO_STORE,
        )
    finally:
        conn.close()


@router.get("/technician/patient-links")
def technician_patient_links(
    case_ids: str = Query("", description="comma-separated case ids"),
    user=Depends(get_current_user),
):
    from technician.router import _technician_org

    t = _technician_org(user)
    ids = [c.strip() for c in case_ids.split(",") if c.strip()][:500]
    conn = get_conn()
    try:
        links = crud.latest_links_for_cases(conn, ids, t["org_id"])
    finally:
        conn.close()
    return {"success": True, "data": links}
