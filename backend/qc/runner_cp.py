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

        # If the case failed QC, copy to returned_cases THEN hard-delete the
        # original bulk_uploads row (files on disk stay — they're preserved
        # in uploaded_images_path for reference).
        if rollup["status"] == "error":
            qc_crud.insert_returned_case(
                original_row_id = row_id,
                src_row         = row,
                reason          = rollup["reason"][:1000],
            )
            # Hard delete — qc_cases has ON DELETE CASCADE so those go too.
            # The returned_cases copy is now the only trace in the DB.
#            qc_crud._exec(
 #               "DELETE FROM organization_schema.bulk_uploads WHERE id = %s",
  #              (int(row_id),),
   #         )
    except Exception:
        # Last-resort logging — we never want a background task to crash uvicorn
        traceback.print_exc()
        try:
            qc_crud.set_bulk_upload_qc_status(row_id, "error", "QC runner crashed")
        except Exception:
            pass


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
#
# Bucket mapping:
#   protocol — QC failures where ID Check or Slice Check errored
#   quality  — QC failures where Content Check or Pixel Check errored
#   open     — bulk_uploads with qc_status='warn' (needs attention, not rejected)
#   resolved — returned_cases marked acknowledged today
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
            # -----------------------------------------------------------------
            # Protocol deviations & image-quality rejects
            # -----------------------------------------------------------------
            # Instead of guessing from returned_cases.reason, join back to
            # qc_cases.checks_json (preserved via original_row_id in the v1
            # migration is null after delete — we stored checks_json while
            # the row existed, but the DELETE cascade removed it).  So we
            # have two choices:
            #   (a) use the reason string (fast, no extra table)
            #   (b) preserve checks at returned_cases insert time
            # (a) is what's already here.  We enrich it with per-failed-check
            # rows so the modal can show a rich table.
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
                # Parse the reason string into individual failed checks.
                # Format from engine.py: "Check name: detail | Check name: detail | …"
                parts = [p.strip() for p in (r["reason"] or "").split("|") if p.strip()]
                file0 = (r.get("image_file_names") or [None])[0] or "—"

                for p in parts:
                    # Each part looks like "ID Check · Patient ID: Missing or placeholder (empty)"
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
                        "check_failed": check_name.split("·")[0].strip(),  # "ID Check" / "Slice Check" / "Content Check" / "Pixel Check"
                        "reason":       detail,
                        "date":         str(r["returned_at"]) if r["returned_at"] else "",
                        "reason_full":  r["reason"],
                    }
                    if fail_kind == "protocol":
                        buckets["protocol"].append(item)
                    elif fail_kind == "quality":
                        buckets["quality"].append(item)

            # Open queries — live warns
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

            # Resolved today
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
        # Thresholds are configured in engine.py — send them along so the
        # modal can render the exact numbers actually used in QC.
        "thresholds": _thresholds_payload(),
    }


def _classify_check(check_name: str) -> str:
    """Map gui.py check names to dashboard buckets."""
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
    """Thresholds live in engine.py; we hard-code the same numbers here so
       the dashboard modal can display them honestly.  If you later move
       them into a config table, read from there instead."""
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

    # Make sure the row belongs to this user
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
