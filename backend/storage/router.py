import os
import tempfile
from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from s3_storage import (
    build_key,
    upload_fileobj,
    upload_local_file,
    presigned_download,
    presigned_upload,
)
from dicom_transcode import transcode_dicom_if_compressed

router = APIRouter(prefix="/storage", tags=["storage"])

# Self-heals every .dcm key the FIRST time it's ever handed out as a
# presigned URL (compressed pixel data and/or missing Part 10 header — see
# dicom_transcode.py) — no manual backfill script needed for cases uploaded
# before that fix existed. Once a key is confirmed good, it's remembered
# for the life of this process so repeat views of the same case don't pay
# the S3 download+check cost again.
_verified_dcm_keys: set = set()
_normalize_pool = ThreadPoolExecutor(max_workers=8)


def _ensure_dcm_normalized(s3_key: str) -> None:
    if not s3_key.lower().endswith(".dcm") or s3_key in _verified_dcm_keys:
        return
    from s3_storage import s3, S3_BUCKET
    try:
        with tempfile.NamedTemporaryFile(suffix=".dcm", delete=False) as tmp:
            tmp_path = tmp.name
            s3.download_file(S3_BUCKET, s3_key, tmp_path)
        try:
            if transcode_dicom_if_compressed(tmp_path):
                s3.upload_file(tmp_path, S3_BUCKET, s3_key)
                print(f"[storage] self-healed on view: {s3_key}")
        finally:
            try:
                os.remove(tmp_path)
            except OSError:
                pass
        _verified_dcm_keys.add(s3_key)
    except Exception as e:
        # Non-fatal — the viewer will just fail to decode this one file the
        # way it already does today; don't block handing out the URL.
        print(f"[storage] self-heal check failed for {s3_key}: {e}")


@router.post("/upload")
async def upload_file(
    folder: str      = Form(...),  # dicom | nifti | reports | signatures | degrees
    sub_id: str      = Form(...),  # case_id or user_id
    file: UploadFile = File(...),
):
    try:
        s3_key = build_key(folder, sub_id, file.filename)

        if folder == "dicom" and (file.filename or "").lower().endswith(".dcm"):
            # Normalize compressed transfer syntaxes before they land in S3 —
            # the desktop Cornerstone viewer fetches straight from S3 and
            # can't decode them client-side, so this is the only place that
            # can fix it for this upload path.
            with tempfile.NamedTemporaryFile(suffix=".dcm", delete=False) as tmp:
                tmp_path = tmp.name
                content = await file.read()
                tmp.write(content)
            try:
                transcode_dicom_if_compressed(tmp_path)
                upload_local_file(tmp_path, s3_key)
            finally:
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass
        else:
            upload_fileobj(file.file, s3_key, content_type=file.content_type)

        return {"success": True, "s3_key": s3_key}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/download-url")
def download_url(s3_key: str):
    _ensure_dcm_normalized(s3_key)
    url = presigned_download(s3_key)
    return {"url": url, "expires_seconds": 3600}


@router.post("/presigned-upload-url")
def get_presigned_upload_url(
    folder: str,
    sub_id: str,
    filename: str,
    content_type: str = "application/octet-stream",
):
    s3_key = build_key(folder, sub_id, filename)
    url    = presigned_upload(s3_key, content_type)
    return {"upload_url": url, "s3_key": s3_key}

@router.get("/list-keys")
def list_s3_keys(prefix: str):
    """List all S3 keys under a given prefix — used to load multi-file DICOM series."""
    try:
        from s3_storage import s3, S3_BUCKET
        resp = s3.list_objects_v2(Bucket=S3_BUCKET, Prefix=prefix)
        keys = [o["Key"] for o in resp.get("Contents", [])]
        return {"keys": keys, "count": len(keys)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/presigned-series")
def presigned_series(prefix: str):
    """Return presigned download URLs for all files under an S3 prefix.
    Self-heals every not-yet-verified .dcm file in the series first (in
    parallel — a case can be a few hundred files, checking them one at a
    time would make the viewer visibly wait on first open)."""
    try:
        from s3_storage import s3, S3_BUCKET, presigned_download
        resp = s3.list_objects_v2(Bucket=S3_BUCKET, Prefix=prefix)
        keys = [o["Key"] for o in resp.get("Contents", []) if o["Key"].lower().endswith(".dcm")]

        to_check = [k for k in keys if k not in _verified_dcm_keys]
        if to_check:
            list(_normalize_pool.map(_ensure_dcm_normalized, to_check))

        urls = [{"key": k, "url": presigned_download(k)} for k in keys]
        return {"urls": urls, "count": len(urls)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
