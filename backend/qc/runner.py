"""
backend/qc/runner.py

1. run_qc_for_row(row_id)
     Background-safe function. Reads the bulk_uploads row, runs QC on every
     file, writes per-file results to admin_schema.qc_cases, rolls up the
     case-level verdict, flags the row with qc_status, and if the case
     'fails' (ALL files error) copies it to organization_schema.returned_cases.

2. FastAPI endpoints:
     POST /organization/uploads/bulk-submit  — (already exists in organization/router.py)
          After inserting rows, we kick off run_qc_for_row via BackgroundTasks.
     GET  /organization/qc/status            — summary for the logged-in org.
     GET  /organization/qc/rows/{row_id}     — per-file QC results for one case.
     GET  /organization/returned-cases       — list returned cases.
     POST /organization/returned-cases/{id}/acknowledge — mark as acknowledged.
"""

import os
import traceback
from uuid import UUID
from typing import Dict, Any
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks

from auth.dependencies import get_current_user

from . import engine, crud as qc_crud
from organization import crud as org_crud   # for get_upload_by_id


# =============================================================================
# BACKGROUND TASK
# =============================================================================
def run_qc_for_row(row_id: int) -> None:
    """Blocking function — meant to be enqueued via BackgroundTasks.
       Never raises: everything is caught and logged, so a bad file
       can't poison the worker."""
    try:
        row = qc_crud._one(
            "SELECT * FROM organization_schema.bulk_uploads WHERE id=%s",
            (int(row_id),),
        )
        if not row:
            return

        # Mark as running (so the dashboard can show it)
        qc_crud.set_bulk_upload_qc_status(row_id, "pending", "QC running…")

        img_dir   = row.get("uploaded_images_path") or ""
        img_dir_a = os.path.join(os.getcwd(), img_dir) if img_dir else ""
        filenames = list(row.get("image_file_names") or [])

        per_file = []
        for fname in filenames:
            fpath = os.path.join(img_dir_a, fname)
            try:
                result = engine.run_file_qc(fpath)
            except Exception as e:
                result = {
                    "overall": "error",
                    "reason":  f"QC crashed: {e}",
                    "checks":  [],
                    "meta":    {"type": "crash", "size": 0, "modality": ""},
                }
            per_file.append({"file_name": fname, **result})

            # Persist per-file result
            qc_crud.insert_qc_file_result(
                upload_row_id = row_id,
                upload_id     = str(row.get("upload_id")),
                case_id       = row.get("case_id") or "",
                user_id       = str(row.get("user_id")),
                file_name     = fname,
                status        = result["overall"],
                reason        = result["reason"],
                checks        = result["checks"],
            )

        # Roll up the case-level verdict (lenient: only 'error' if ALL fail)
        rollup = engine.roll_up_case(per_file)
        qc_crud.set_bulk_upload_qc_status(
            row_id,
            rollup["status"],
            rollup["reason"][:500],
        )

        if False:  # QC gating disabled — all cases pass through
            qc_crud.insert_returned_case(
                original_row_id = row_id,
                src_row         = row,
                reason          = rollup["reason"][:1000],
            )
        else:
            rad = qc_crud.find_available_radiologist()
            if rad:
                wf_id = qc_crud.insert_case_workflow_with_rad(row, rad)
                if wf_id:
                    qc_crud.insert_rad_scan_for_case(row, rad)
    except Exception:
        # Last-resort logging — we never want a background task to crash uvicorn
        traceback.print_exc()
        try:
            qc_crud.set_bulk_upload_qc_status(row_id, "error", "QC runner crashed")
        except Exception:
            pass


# =============================================================================
# NEW BACKGROUND TASK — metadata-first flow
#
# Called by bulk_submit / single_submit instead of run_qc_for_row.
# No DB row exists yet when this runs.
#
# Flow:
#   1. Run QC on every file (collect results in memory)
#   2. Roll up case-level verdict
#   3a. QC FAILS  → insert per-file results into admin_schema.qc_cases
#                  → copy metadata to organization_schema.returned_cases
#   3b. QC PASSES → upload files to S3
#                  → insert into organization_schema.bulk_uploads (get row_id)
#                  → insert per-file results into admin_schema.qc_cases (with row_id)
#                  → push to case_workflow → auto-assign radiologist → rad_scans
#                  → delete local files (disk cleanup)
# =============================================================================
def run_qc_for_case(case_meta: dict) -> None:
    """Background-safe. Never raises — everything is caught and logged."""
    try:
        img_dir   = case_meta.get("images_dir") or ""
        img_dir_a = os.path.join(os.getcwd(), img_dir) if img_dir else ""
        filenames = list(case_meta.get("image_file_names") or [])
        case_id   = case_meta.get("case_id") or ""
        upload_id = case_meta.get("upload_id") or ""
        user_id   = str(case_meta.get("user_id") or "")

        # --- 1. Run QC per file (results held in memory) ---
        per_file = []
        for fname in filenames:
            fpath = os.path.join(img_dir_a, fname)
            try:
                result = engine.run_file_qc(fpath)
            except Exception as e:
                result = {
                    "overall": "error",
                    "reason":  f"QC crashed: {e}",
                    "checks":  [],
                    "meta":    {"type": "crash", "size": 0, "modality": ""},
                }
            per_file.append({"file_name": fname, **result})

        # --- 2. Case-level rollup ---
        rollup = engine.roll_up_case(per_file)

        if False:  # QC gating disabled — all cases pass through
            # --- 3a. QC failed ---
            for pf in per_file:
                qc_crud.insert_qc_file_result(
                    upload_row_id = None,
                    upload_id     = upload_id,
                    case_id       = case_id,
                    user_id       = user_id,
                    file_name     = pf["file_name"],
                    status        = pf["overall"],
                    reason        = pf["reason"],
                    checks        = pf["checks"],
                )
            qc_crud.insert_returned_case_from_meta(
                case_meta = case_meta,
                reason    = rollup["reason"][:1000],
            )
        else:
            # --- 3b. QC passed ---

            # ── Upload files to S3 (non-fatal — local fallback if S3 fails) ──
            primary_s3_key = None
            s3_uploaded_paths = []  # track which local files were uploaded OK

            try:
                from s3_storage import build_key, upload_local_file
                from dicom_transcode import transcode_dicom_if_compressed
                for fname in filenames:
                    fpath = os.path.join(img_dir_a, fname)
                    if not os.path.exists(fpath):
                        continue
                    ext    = os.path.splitext(fpath)[1].lower()
                    folder = "nifti" if ext in (".nii", ".gz") else "dicom"
                    # The frontend viewer can't decode compressed transfer
                    # syntaxes (JPEG-LS/JPEG2000/etc.) — normalize to
                    # uncompressed before it ever reaches S3.
                    if ext == ".dcm":
                        if transcode_dicom_if_compressed(fpath):
                            print(f"[runner] Transcoded to uncompressed: {fname}")
                    s3_key = build_key(folder, case_id, fname)
                    upload_local_file(fpath, s3_key)
                    if primary_s3_key is None:
                        primary_s3_key = s3_key
                    s3_uploaded_paths.append(fpath)
                    print(f"[runner] S3 uploaded: {fname} → {s3_key}")

                # ── Delete local files only after all uploads succeeded ──────
                for fpath in s3_uploaded_paths:
                    try:
                        os.remove(fpath)
                        print(f"[runner] Local deleted: {fpath}")
                    except Exception as del_err:
                        print(f"[runner] Local delete failed (non-fatal): {del_err}")

                # Remove subject dir if now empty
                try:
                    if img_dir_a and os.path.isdir(img_dir_a) and not os.listdir(img_dir_a):
                        os.rmdir(img_dir_a)
                        print(f"[runner] Empty dir removed: {img_dir_a}")
                except Exception:
                    pass

            except Exception as s3_err:
                print(f"[runner] S3 upload failed (non-fatal, using local): {s3_err}")
                primary_s3_key = None

            # Insert approved case into organization_schema.bulk_uploads
            row_id = qc_crud.insert_bulk_upload_after_qc(
                case_meta  = case_meta,
                qc_status  = rollup["status"],
                qc_summary = rollup["reason"][:500],
            )
            # Per-file results → admin_schema.qc_cases (with actual row_id)
            for pf in per_file:
                qc_crud.insert_qc_file_result(
                    upload_row_id = row_id,
                    upload_id     = upload_id,
                    case_id       = case_id,
                    user_id       = user_id,
                    file_name     = pf["file_name"],
                    status        = pf["overall"],
                    reason        = pf["reason"],
                    checks        = pf["checks"],
                )
            # Push through workflow pipeline
            if row_id:
                row = qc_crud._one(
                    "SELECT * FROM organization_schema.bulk_uploads WHERE id = %s",
                    (row_id,),
                )
                if row:
                    rad = qc_crud.find_available_radiologist()
                    if rad:
                        wf_id = qc_crud.insert_case_workflow_with_rad(row, rad)
                        if wf_id:
                            # ── Save S3 key to bulk_uploads BEFORE rad_scan insert ──
                            # This ensures S3 path is persisted even if rad_scan fails
                            if primary_s3_key:
                                try:
                                    from database import get_conn
                                    _conn_pre = get_conn()
                                    with _conn_pre.cursor() as _cur_pre:
                                        _cur_pre.execute(
                                            "UPDATE organization_schema.bulk_uploads "
                                            "SET s3_key=%s, s3_bucket='onix-s3', storage_type='s3' "
                                            "WHERE case_id=%s",
                                            (primary_s3_key, case_id)
                                        )
                                    _conn_pre.commit()
                                    _conn_pre.close()
                                    print(f"[runner] bulk_uploads S3 key pre-saved for {case_id}")
                                except Exception as _pre_err:
                                    print(f"[runner] pre-save bulk_uploads failed: {_pre_err}")

                            # Insert rad_scan — wrapped so S3 key update still runs if this fails
                            try:
                                qc_crud.insert_rad_scan_for_case(row, rad)
                            except Exception as _rad_err:
                                print(f"[runner] insert_rad_scan_for_case failed: {_rad_err}")

                            # ── Update rad_scans + bulk_uploads with S3 key ──────
                            if primary_s3_key:
                                try:
                                    from database import get_conn
                                    _conn = get_conn()
                                    with _conn.cursor() as _cur:
                                        _cur.execute("""
                                            UPDATE radiology_schema.rad_scans
                                            SET s3_key       = %s,
                                                s3_bucket    = 'onix-s3',
                                                storage_type = 's3'
                                            WHERE case_id = %s
                                        """, (primary_s3_key, case_id))
                                        _cur.execute("""
                                            UPDATE organization_schema.bulk_uploads
                                            SET s3_key       = %s,
                                                s3_bucket    = 'onix-s3',
                                                storage_type = 's3'
                                            WHERE case_id = %s
                                        """, (primary_s3_key, case_id))
                                    _conn.commit()
                                    _conn.close()
                                    print(f"[runner] rad_scans + bulk_uploads S3 key set for {case_id}")
                                except Exception as db_err:
                                    print(f"[runner] S3 key DB update failed: {db_err}")
    except Exception:
        traceback.print_exc()


# =============================================================================
# ROUTER
# =============================================================================
router = APIRouter(prefix="/organization", tags=["QC"])


@router.get("/qc/status")
def qc_status_summary(user=Depends(get_current_user)):
    user_id = user.get("user_id")
    if not user_id:
        raise HTTPException(401, "Invalid token payload")
    summary = qc_crud.qc_summary_for_user(user_id)
    return {"summary": summary}


# =============================================================================
# Dashboard Quality Check card — returns the 4 counts the UI wants and
# the list of cases per bucket (drill-down).
# =============================================================================
@router.get("/qc/dashboard-summary")
def qc_dashboard_summary(user=Depends(get_current_user)):
    user_id = user.get("user_id")
    if not user_id:
        raise HTTPException(401, "Invalid token payload")

    from database import get_conn
    from psycopg2.extras import RealDictCursor

    buckets = {
        "protocol": [], "quality":  [],
        "open":     [], "resolved": [],
    }

    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT returned_id, case_id, patient_name, modality_type,
                       modality_study_type, reason, image_file_names,
                       returned_at
                  FROM organization_schema.returned_cases
                 WHERE user_id = %s AND status <> 'acknowledged'
                """,
                (str(user_id),),
            )
            for r in cur.fetchall():
                parts = [p.strip() for p in (r["reason"] or "").split("|") if p.strip()]
                file0 = (r.get("image_file_names") or [None])[0] or "—"

                for p in parts:
                    if ":" not in p:  continue
                    check_name, detail = p.split(":", 1)
                    check_name = check_name.strip()
                    detail     = detail.strip()

                    fail_kind = _classify_check(check_name)
                    item = {
                        "id":           r["returned_id"],
                        "case_id":      r["case_id"],
                        "patient":      r["patient_name"],
                        "modality":     r["modality_type"],
                        "study_type":   r["modality_study_type"],
                        "file":         file0,
                        "check_failed": check_name.split("·")[0].strip(),
                        "reason":       detail,
                        "date":         str(r["returned_at"]) if r["returned_at"] else "",
                        "reason_full":  r["reason"],
                    }
                    if fail_kind == "protocol":
                        buckets["protocol"].append(item)
                    elif fail_kind == "quality":
                        buckets["quality"].append(item)

            cur.execute(
                """
                SELECT id AS returned_id, case_id, patient_name, modality_type,
                       modality_study_type, qc_summary AS reason,
                       image_file_names, qc_ran_at AS returned_at
                  FROM organization_schema.bulk_uploads
                 WHERE user_id = %s AND qc_status = 'warn'
                """,
                (str(user_id),),
            )
            buckets["open"] = [_dash_item_full(r) for r in cur.fetchall()]

            cur.execute(
                """
                SELECT returned_id, case_id, patient_name, modality_type,
                       modality_study_type, reason, image_file_names,
                       resolved_at AS returned_at
                  FROM organization_schema.returned_cases
                 WHERE user_id = %s
                   AND status = 'acknowledged'
                   AND resolved_at::date = CURRENT_DATE
                """,
                (str(user_id),),
            )
            buckets["resolved"] = [_dash_item_full(r) for r in cur.fetchall()]
    finally:
        conn.close()

    return {
        "counts": {k: len(v) for k, v in buckets.items()},
        "cases":  buckets,
        "thresholds": _thresholds_payload(),
    }


def _classify_check(check_name: str) -> str:
    n = (check_name or "").lower()
    if "id check" in n or "slice check" in n:
        return "protocol"
    if "content check" in n or "pixel check" in n:
        return "quality"
    return "other"


def _dash_item_full(r):
    file0 = (r.get("image_file_names") or [None])[0] or "—"
    return {
        "id":           r.get("returned_id"),
        "case_id":      r.get("case_id"),
        "patient":      r.get("patient_name"),
        "modality":     r.get("modality_type"),
        "study_type":   r.get("modality_study_type"),
        "file":         file0,
        "reason":       r.get("reason") or "",
        "date":         str(r["returned_at"]) if r.get("returned_at") else "",
    }


def _thresholds_payload():
    return {
        "id_check": [
            {"field": "Patient ID (0010,0020)",   "pass": "Non-empty, not a placeholder", "fail": "Missing or ANON/TEST/empty"},
            {"field": "Patient name (0010,0010)", "pass": "Non-empty, not a placeholder", "fail": "Empty or ANONYMOUS/UNKNOWN"},
            {"field": "Modality (0008,0060)",     "pass": "CT / MR / CR / DR / DX / MG / PT / NM / US / XA / RF", "fail": "Missing or unrecognised code"},
            {"field": "Study date (0008,0020)",   "pass": "Valid YYYYMMDD, 8 digits",     "fail": "Missing or malformed"},
        ],
        "slice_check": [
            {"field": "Series size",         "pass": "≥ 2 slices",                      "fail": "Single slice"},
            {"field": "Missing slices",      "pass": "Max gap ≤ 1.5× median",           "fail": "Max gap > 1.5× median"},
            {"field": "Spacing regularity",  "pass": "CV ≤ 10% — uniform series",       "fail": "CV > 10% — irregular"},
        ],
        "content_check": [
            {"field": "Mean intensity",            "pass": "Normalised mean ≥ 5/255",   "fail": "< 5 — blank/unexposed image"},
            {"field": "Pixel std deviation",       "pass": "Std ≥ 3 — contrast present","fail": "< 3 — flat image, no variation"},
            {"field": "Non-zero pixel fraction",   "pass": "≥ 1% non-zero pixels",      "fail": "< 1% — nearly empty frame"},
        ],
        "pixel_check": [
            {"field": "CT · HU range",             "pass": "−1100 .. 3100 HU",          "fail": "Outside — wrong RescaleSlope/Intercept"},
            {"field": "MR / NIfTI · Laplacian var","pass": "≥ 60 — sharp image",        "fail": "< 60 — blurred / motion"},
            {"field": "X-ray · Exposure",          "pass": "< 90% dark, < 5% saturated","fail": "Over- or under-exposed"},
        ],
    }


@router.get("/qc/rows/{row_id}")
def qc_for_row(row_id: int, user=Depends(get_current_user)):
    user_id = user.get("user_id")
    if not user_id:
        raise HTTPException(401, "Invalid token payload")

    row = org_crud.get_upload_by_id(row_id, UUID(user_id))
    if not row:
        raise HTTPException(404, "Case not found")

    return {
        "row_id":     row_id,
        "qc_status":  row.get("qc_status"),
        "qc_summary": row.get("qc_summary"),
        "qc_ran_at":  str(row.get("qc_ran_at")) if row.get("qc_ran_at") else None,
        "files":      qc_crud.list_qc_for_upload_row(row_id),
    }


@router.get("/returned-cases")
def list_returned(user=Depends(get_current_user)):
    user_id = user.get("user_id")
    if not user_id:
        raise HTTPException(401, "Invalid token payload")
    items = qc_crud.list_returned_cases(user_id)
    return {"items": items, "count": len(items)}


@router.post("/returned-cases/{returned_id}/acknowledge")
def acknowledge_returned(returned_id: int, user=Depends(get_current_user)):
    user_id = user.get("user_id")
    if not user_id:
        raise HTTPException(401, "Invalid token payload")
    row = qc_crud._one(
        """
        UPDATE organization_schema.returned_cases
           SET status='acknowledged', resolved_at=NOW()
         WHERE returned_id=%s AND user_id=%s
        RETURNING returned_id
        """,
        (int(returned_id), str(user_id)),
    )
    if not row:
        raise HTTPException(404, "Returned case not found")
    return {"ok": True}


@router.post("/qc/sync-rad-scans")
def sync_rad_scans(user=Depends(get_current_user)):
    """Backfill qc_status, assigned_rad_id, due_date, assigned_at in rad_scans
    from admin_schema.case_workflow for all rows where those fields are missing."""
    updated = qc_crud.sync_rad_scans_from_workflow()
    return {"ok": True, "updated": updated}
