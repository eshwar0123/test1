# ============================================================
# backend/radiologist/earnings.py
#
# Radiologist "Billing" page: what a radiologist has earned from the reports
# they completed, using a per-examination payout rate card.
#
#   GET /radiology/earnings/status    {enabled}   is Billing on for this radiologist?
#   GET /radiology/earnings/summary   totals + per-case list (optional ?month=YYYY-MM)
#
# Only radiologists listed in EARNINGS_RAD_IDS can use it (403 otherwise).
# A case is "completed" when it has a row in admin_schema.case_submission with
# completed_at set; resubmitted/edited reports (several rows per case) count once.
# ============================================================

import re
from collections import defaultdict
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query
from psycopg2.extras import RealDictCursor

from auth.dependencies import get_current_user
from database import get_conn

router = APIRouter(prefix="/radiology/earnings", tags=["Radiologist Earnings"])

# Radiologists who have the Billing page. To roll it out to another radiologist, add their rad_id.
EARNINGS_RAD_IDS = {
    "GENRAD-RAD-732403",   # Sumit
    "GENRAD-RAD-262252",   # Dr. Akash Azad Jain
}

# Cases left out of the Billing list and earnings entirely.
EXCLUDED_CASES = {
    "GENRAD-SUB-540769",
    "GENRAD-SUB-182281",
    "GENRAD-SUB-942164",
}

XRAY_TYPES = ("XRAY", "XR", "X-RAY", "X RAY", "CR", "DX", "DR")

# ------------------------------------------------------------
# Rate card (INR per report)
# ------------------------------------------------------------
XRAY_RATE = 25.00   # any region, per examination

MRI_RATES: List[Tuple[str, float]] = [
    ("MRI Defecography", 480),
    ("MRI Breast", 480),
    ("MRI Pelvis with Contrast", 292.88),
    ("MRI Axilla Plain", 495),
    ("MRI MSK Thigh Plain — Right", 288.75),
    ("MRI Screening Whole Spine", 247.50),
    ("MRI Thorax Plain", 640),
    ("MRI SI Joint + Lumbosacral Spine", 640),
    ("MRI Orbits Plain", 231),
    ("MRI Fistulogram", 480),
    ("MRI Lumbosacral Spine Plain", 202.50),
    ("MRI Cervical Spine Plain", 202.50),
    ("MRI Dorsolumbar Spine Plain", 185.63),
    ("MRI Brain Plain", 252),
    ("MRI Brain + Orbits Contrast", 568),
    ("MRI Brain Contrast + MRA + MRV", 924),
    ("MRI MSK Knee", 288.75),
    ("MRI Brain Plain + Brain/Neck Angiography", 1544),
    ("MRI Elbow + Wrist Plain — Right", 664.13),
    ("MRI Abdomen & Pelvis Contrast — Female", 700),
    ("MRI MSK Knee Plain — Right", 332.06),
    ("MRI MSK Knee Plain — Left", 288.75),
    ("MRI Brachial Plexus", 480),
    ("MRI Pelvis + Both Hips Plain", 495),
]

CT_RATES: List[Tuple[str, float]] = [
    ("CT Face & Neck Contrast", 453.75),
    ("CT Abdomen Contrast — Male", 284.63),
    ("CT Thorax Contrast", 193.88),
    ("CT Abdomen & Pelvis Contrast — Female", 284.63),
    ("CT Abdomen & Pelvis + Thorax Contrast", 464),
    ("CT Brain Plain", 112.50),
    ("CT Peripheral Leg Angiography", 440),
]

# Exact overrides: normalised study name (see _norm) -> exam name in the rate card above.
# Use this when a case's study name doesn't line up with the card, e.g.
#   "mri brain": "MRI Brain Plain",
STUDY_ALIASES: Dict[str, str] = {}

_STOP = {"and", "the", "of", "for", "study", "scan", "mr", "mri", "ct", "xray", "x", "ray"}


def _norm(s: Optional[str]) -> str:
    return " ".join(re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).split())


def _tokens(s: Optional[str]) -> set:
    return {t for t in _norm(s).split() if t not in _STOP}


def _modality_bucket(modality: Optional[str]) -> str:
    m = (modality or "").strip().upper()
    if m in XRAY_TYPES:
        return "xray"
    if m in ("MRI", "MR"):
        return "mri"
    if m == "CT":
        return "ct"
    return "other"


def _rate_card(bucket: str) -> List[Tuple[str, float]]:
    return MRI_RATES if bucket == "mri" else CT_RATES if bucket == "ct" else []


def rate_for(modality: Optional[str], study: Optional[str]) -> Dict[str, Any]:
    """Payout for one case -> {amount, exam, match} where match is
    'flat' | 'exact' | 'approx' | 'none'. 'none' pays 0 and is flagged on the page."""
    bucket = _modality_bucket(modality)
    if bucket == "xray":
        return {"bucket": bucket, "amount": XRAY_RATE, "exam": "X-ray (per examination)", "match": "flat"}

    card = _rate_card(bucket)
    if not card:
        return {"bucket": bucket, "amount": 0.0, "exam": None, "match": "none"}

    by_norm = {_norm(name): (name, amt) for name, amt in card}
    key = _norm(study)
    alias = STUDY_ALIASES.get(key)
    if alias and _norm(alias) in by_norm:
        name, amt = by_norm[_norm(alias)]
        return {"bucket": bucket, "amount": float(amt), "exam": name, "match": "exact"}
    # "MRI Brain Plain" or just "Brain Plain" both match "MRI Brain Plain"
    for cand in (key, _norm(f"{bucket} {study}")):
        if cand in by_norm:
            name, amt = by_norm[cand]
            return {"bucket": bucket, "amount": float(amt), "exam": name, "match": "exact"}

    want = _tokens(study)
    if not want:
        return {"bucket": bucket, "amount": 0.0, "exam": None, "match": "none"}
    best = None
    for name, amt in card:
        have = _tokens(name)
        score = len(want & have) / len(want | have)
        if best is None or score > best[0] or (score == best[0] and amt < best[2]):
            best = (score, name, amt)
    if best and best[0] >= 0.5:
        return {"bucket": bucket, "amount": float(best[2]), "exam": best[1], "match": "approx"}
    return {"bucket": bucket, "amount": 0.0, "exam": None, "match": "none"}


# ------------------------------------------------------------
# Data
# ------------------------------------------------------------
def _radiologist(user) -> Dict[str, Any]:
    uid = user.get("user_id")
    if not uid:
        raise HTTPException(401, "Invalid token payload (user_id missing)")
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT rad_id, first_name, last_name FROM radiology_schema.radiologists WHERE user_id::text = %s",
                (str(uid),),
            )
            return cur.fetchone() or {}
    finally:
        conn.close()


def _enabled(rad: Dict[str, Any]) -> bool:
    return bool(rad.get("rad_id")) and rad["rad_id"] in EARNINGS_RAD_IDS


@router.get("/status")
def status(user=Depends(get_current_user)):
    return {"enabled": _enabled(_radiologist(user))}


_CASES_SQL = """
SELECT cs.case_id,
       MIN(cs.completed_at)                                         AS completed_at,
       MAX(cs.modality_type)                                        AS modality_type,
       MAX(NULLIF(TRIM(cs.study_type), ''))                         AS study_type,
       MAX(cs.organization_name)                                    AS organization_name,
       MAX(COALESCE(NULLIF(TRIM(bu.patient_name), ''), '-'))        AS patient_name
  FROM admin_schema.case_submission cs
  LEFT JOIN organization_schema.bulk_uploads bu ON bu.case_id = cs.case_id
 WHERE (cs.rad_id = %(rad_id)s)
   AND cs.completed_at IS NOT NULL
 GROUP BY cs.case_id
 ORDER BY MIN(cs.completed_at) DESC
"""


@router.get("/summary")
def summary(month: Optional[str] = Query(None, description="YYYY-MM"), user=Depends(get_current_user)):
    rad = _radiologist(user)
    if not _enabled(rad):
        raise HTTPException(403, "Billing is not enabled for this radiologist.")
    if month and not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", month):
        raise HTTPException(422, "month must be YYYY-MM")

    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(_CASES_SQL, {"rad_id": rad["rad_id"]})
            rows = [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()

    rows = [r for r in rows if r.get("case_id") not in EXCLUDED_CASES]

    months = sorted({r["completed_at"].strftime("%Y-%m") for r in rows}, reverse=True)

    cases: List[Dict[str, Any]] = []
    for r in rows:
        ym = r["completed_at"].strftime("%Y-%m")
        if month and ym != month:
            continue
        rt = rate_for(r["modality_type"], r["study_type"])
        cases.append({
            "case_id": r["case_id"],
            "date": r["completed_at"].strftime("%Y-%m-%d"),
            "time": r["completed_at"].strftime("%H:%M"),
            "patient_name": r["patient_name"],
            "organization": r["organization_name"] or "-",
            "modality": r["modality_type"] or "-",
            "study": r["study_type"] or "-",
            "category": rt["bucket"],
            "exam": rt["exam"],
            "match": rt["match"],
            "amount": round(rt["amount"], 2),
        })

    by_cat: Dict[str, Dict[str, float]] = defaultdict(lambda: {"cases": 0, "amount": 0.0})
    for c in cases:
        by_cat[c["category"]]["cases"] += 1
        by_cat[c["category"]]["amount"] += c["amount"]

    return {
        "ok": True,
        "radiologist": f"{rad.get('first_name') or ''} {rad.get('last_name') or ''}".strip(),
        "rad_id": rad["rad_id"],
        "month": month or "all",
        "months": months,
        "total_earnings": round(sum(c["amount"] for c in cases), 2),
        "total_cases": len(cases),
        "unpriced_cases": sum(1 for c in cases if c["match"] == "none"),
        "by_category": {k: {"cases": v["cases"], "amount": round(v["amount"], 2)} for k, v in by_cat.items()},
        "cases": cases[:1000],
    }
