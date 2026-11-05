"""
backend/share/router.py

  GET  /share/patient/{token}/status  public. {requires_password, expires_at}; 404 / 410 for a
                                      bad or expired link (no password needed to learn that).
  POST /share/patient/{token}         public. Body {password}. Wrong password -> 403 (the link is
                                      locked after PATIENT_LINK_MAX_ATTEMPTS wrong tries -> 429).
                                      Correct -> images only (presigned URLs, ~15 min).
  GET  /organization/patient-links    organization only. {case_id: {url, password, expires_at, expired}}
                                      for the given cases of the caller's organization.
  POST /organization/patient-links/{case_id}
                                      organization only. Issues a NEW link + password (24h from now)
                                      for a submitted case; the previous link stops working.
"""
import json
import os
import secrets
from typing import List
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel

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

    if not series:
        # Plain JPG / JPEG / PNG X-rays: served as DICOM, converted on the fly by the backend
        # (radiologist.series_manifest.image_as_dicom - nothing is stored). Only reached when
        # the study has no .dcm files, so existing DICOM links behave exactly as before.
        listing = s3.list_objects_v2(Bucket=S3_BUCKET, Prefix=prefix)
        keys = sorted(
            o["Key"] for o in listing.get("Contents", [])
            if o["Key"].lower().endswith((".jpg", ".jpeg", ".png"))
        )
        if keys:
            series.append({
                "seriesUid": "images", "description": "", "modality": None, "isScout": False,
                "urls": [f"{crud.PATIENT_LINK_BASE_URL}/api/radiology/image-dicom/{quote(k)}.dcm" for k in keys],
            })
    return series


def _patient_summary(conn, case_id: str) -> dict:
    """Only what the patient page shows on the image: name, age, sex, modality, study type.
    Best-effort - a failed lookup just means no overlay, never a failed link."""
    out = {"name": None, "age": None, "sex": None, "modality": None, "study_type": None}
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT patient_name, patient_age, patient_sex, scan_type "
                "FROM radiology_schema.rad_scans WHERE case_id = %s LIMIT 1",
                (case_id,),
            )
            r = cur.fetchone()
            if r:
                out.update(name=r[0], age=r[1], sex=r[2], modality=r[3])
            cur.execute(
                "SELECT modality_type, modality_study_type FROM admin_schema.case_workflow "
                "WHERE case_id = %s ORDER BY 1 LIMIT 1",
                (case_id,),
            )
            w = cur.fetchone()
            if w:
                out["modality"] = w[0] or out["modality"]
                out["study_type"] = w[1]
    except Exception as exc:  # noqa: BLE001
        conn.rollback()
        print(f"[share] patient summary failed for {case_id}: {exc}")
    return {k: (str(v).strip() if v not in (None, "") else None) for k, v in out.items()}


class PatientOpenIn(BaseModel):
    password: str = ""


def _active_link_or_error(conn, token: str) -> dict:
    link = crud.get_link_by_token(conn, token)
    if not link:
        raise HTTPException(404, "Link not found")
    # Checked against the DB clock on every request.
    if not link["active"]:
        raise HTTPException(410, "This link has expired")
    return link


@router.get("/share/patient/{token}/status")
def patient_link_status(token: str):
    conn = get_conn()
    try:
        link = _active_link_or_error(conn, token)
        return Response(
            content=json.dumps({
                "requires_password": True,
                "locked": link["failed_attempts"] >= crud.MAX_PASSWORD_ATTEMPTS,
                "expires_at": link["expires_at"].isoformat(),
            }),
            media_type="application/json",
            headers=_NO_STORE,
        )
    finally:
        conn.close()


@router.post("/share/patient/{token}")
def patient_view(token: str, body: PatientOpenIn):
    conn = get_conn()
    try:
        link = _active_link_or_error(conn, token)

        # Password gate. A link without a stored password is never opened.
        if link["failed_attempts"] >= crud.MAX_PASSWORD_ATTEMPTS:
            raise HTTPException(429, "Too many wrong attempts. Please ask the centre for a new link.")
        code = (link["access_code"] or "").strip().upper()
        given = (body.password or "").strip().upper().replace(" ", "")
        if not code or not secrets.compare_digest(given.encode(), code.encode()):
            n = crud.register_failed_attempt(conn, link["link_id"])
            left = crud.MAX_PASSWORD_ATTEMPTS - n
            if left <= 0:
                raise HTTPException(429, "Too many wrong attempts. Please ask the centre for a new link.")
            raise HTTPException(403, f"Incorrect password. {left} attempt{'s' if left != 1 else ''} left.")
        crud.reset_failed_attempts(conn, link["link_id"])

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
                "patient": _patient_summary(conn, link["case_id"]),
                "series": series,
            }),
            media_type="application/json",
            headers=_NO_STORE,
        )
    finally:
        conn.close()


def _organization_org_id(user) -> str:
    """Organization-side callers only: technicians (role checked in the DB) are refused.
    Returns the caller's org_id."""
    from uuid import UUID
    from organization import crud as org_crud

    uid = user.get("user_id")
    if not uid:
        raise HTTPException(401, "Invalid token payload (user_id missing)")
    row = org_crud._one("SELECT role FROM core_schema.users WHERE user_id = %s", (str(uid),))
    if row and str(row.get("role") or "").strip().lower() == "technician":
        raise HTTPException(403, "Patient links are available to the organization only")
    org_id = org_crud.get_org_id_for_user(UUID(org_crud.resolve_org_user_id(uid)))
    if not org_id:
        raise HTTPException(404, "Organization profile not found — complete org setup first")
    return str(org_id)


@router.get("/organization/patient-links")
def organization_patient_links(
    case_ids: str = Query("", description="comma-separated case ids"),
    user=Depends(get_current_user),
):
    org_id = _organization_org_id(user)
    ids = [c.strip() for c in case_ids.split(",") if c.strip()][:500]
    conn = get_conn()
    try:
        links = crud.latest_links_for_cases(conn, ids, org_id)
    finally:
        conn.close()
    return {"success": True, "data": links}


@router.post("/organization/patient-links/{case_id}")
def organization_new_patient_link(case_id: str, user=Depends(get_current_user)):
    org_id = _organization_org_id(user)
    conn = get_conn()
    try:
        try:
            link = crud.create_fresh_link(conn, case_id, org_id)
        except ValueError as exc:
            conn.rollback()
            raise HTTPException(400, str(exc))
    finally:
        conn.close()
    return {"success": True, "data": link}
