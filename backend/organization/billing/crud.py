# ============================================================
# backend/organization/billing/crud.py
#
# Prepaid-balance ("wallet") billing for selected organizations.
#
#   balance = opening_balance
#             + SUM(payments received)
#             - rate * (X-ray cases completed after charge_from)
#
#   opening_balance = -(rate * every case the org had completed the first time
#   it opened Payment); charge_from is that same moment, so nothing is counted twice.
#
# The balance is never stored — it is recomputed from the payments table and
# the completed cases every time, so it cannot drift out of sync.
#
# Tables are created on first use (CREATE TABLE IF NOT EXISTS):
#   organization_schema.billing_wallet    one row per billed org (opening balance, rate, start date)
#   organization_schema.billing_payments  one row per payment the org reports
# ============================================================

import csv
import json
from datetime import timedelta
from typing import Any, Dict, List, Optional

from psycopg2.extras import RealDictCursor

from database import get_conn

# Only these organizations have the Payment feature. An org is enabled when its
# org_id is listed OR its org_profile.org_name matches (case/spacing-insensitive).
# To roll out to another organization, add its org_id (or name) here.
BILLING_ORG_IDS = {
    "GENRAD-ORG-29839121",   # Caring Hand Diagnostic And Cure Centre
    "GENRAD-ORG-35570243",   # EXPERT IMAGING (folder "EXPERT IMAGING AND PATH LAB")
    "GENRAD-ORG-16835271",   # Radisure Imaging Centre
}
BILLING_ORG_NAMES = {
    "caring hand diagnostic and cure centre",
    "expert imaging centre",
    "expert imaging and path lab",
    "radisure imaging centre",
}

RATE_PER_CASE = 32   # Rs per completed case (opening balance) / per completed X-ray (afterwards)

def _norm(name: Optional[str]) -> str:
    return " ".join((name or "").lower().split())

# case_submission.modality_type values that count as an X-ray.
XRAY_TYPES = ("XRAY", "XR", "X-RAY", "X RAY", "CR", "DX", "DR")

_tables_ready = False

_DDL = """
CREATE SCHEMA IF NOT EXISTS organization_schema;

CREATE TABLE IF NOT EXISTS organization_schema.billing_wallet (
    org_id          VARCHAR(100) PRIMARY KEY,
    opening_balance NUMERIC(12,2) NOT NULL,
    rate_per_xray   NUMERIC(12,2) NOT NULL,
    charge_from     TIMESTAMP NOT NULL,   -- IST wall-clock, like case_submission.completed_at
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization_schema.billing_payments (
    id         BIGSERIAL PRIMARY KEY,
    org_id     VARCHAR(100) NOT NULL,
    amount     NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    utr        VARCHAR(60) NOT NULL,
    method     VARCHAR(30) NOT NULL DEFAULT 'UPI/Bank transfer',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- the same bank reference can only ever credit one payment
CREATE UNIQUE INDEX IF NOT EXISTS billing_payments_utr_uq
    ON organization_schema.billing_payments (upper(utr));
CREATE INDEX IF NOT EXISTS billing_payments_org_idx
    ON organization_schema.billing_payments (org_id, created_at DESC);
"""


def _run(fn):
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            result = fn(cur)
        conn.commit()
        return result
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def ensure_tables() -> None:
    global _tables_ready
    if _tables_ready:
        return

    _run(lambda cur: cur.execute(_DDL))
    _tables_ready = True


def invoice_number(payment_id: int, created_at) -> str:
    """GP/<financial year>/<payment id>, e.g. GP/2026-27/00012 (India FY: Apr-Mar)."""
    ist = created_at + timedelta(hours=5, minutes=30) if created_at.tzinfo else created_at
    fy = ist.year if ist.month >= 4 else ist.year - 1
    return f"GP/{fy}-{(fy + 1) % 100:02d}/{int(payment_id):05d}"


def is_billed_org(org_id: Optional[str], org_name: Optional[str] = None) -> bool:
    return (org_id in BILLING_ORG_IDS) or (_norm(org_name) in BILLING_ORG_NAMES)


# ------------------------------------------------------------
# Completed X-ray cases (the chargeable events)
# ------------------------------------------------------------
# One row per case. case_submission can hold several rows per case (a report
# that was edited and re-submitted), so collapse by case_id and keep the
# first completion date.
_CHARGES_SQL = """
SELECT cs.case_id,
       MIN(cs.completed_at)::date                              AS completed_on,
       MAX(COALESCE(NULLIF(TRIM(bu.patient_name), ''), '-'))   AS patient_name,
       MAX(COALESCE(NULLIF(cs.study_type, ''), cs.modality_type, '-')) AS study,
       (SELECT b2.image_file_names::text
          FROM organization_schema.bulk_uploads b2
         WHERE b2.case_id = cs.case_id LIMIT 1)                  AS image_names
  FROM admin_schema.case_submission cs
  LEFT JOIN organization_schema.bulk_uploads bu ON bu.case_id = cs.case_id
 WHERE cs.org_id = %(org_id)s
   AND cs.completed_at IS NOT NULL
   AND cs.completed_at > %(charge_from)s
   AND UPPER(COALESCE(cs.modality_type, '')) IN %(xray)s
 GROUP BY cs.case_id
 ORDER BY MIN(cs.completed_at) DESC
"""


def count_slices(image_names: Optional[str]) -> int:
    """Number of images in a case, from bulk_uploads.image_file_names cast to text.
    Handles a Postgres array ('{a.dcm,b.dcm}') and a JSON list ('["a.dcm","b.dcm"]')."""
    s = (image_names or "").strip()
    if not s:
        return 0
    if s.startswith("["):
        try:
            return len([x for x in json.loads(s) if x])
        except ValueError:
            pass
    if s.startswith("{") and s.endswith("}"):
        inner = s[1:-1].strip()
        if not inner:
            return 0
        return len([x for x in next(csv.reader([inner])) if x.strip()])
    return len([x for x in s.split(",") if x.strip()])


EXTRA_SLICE_FEE = 3   # Rs for each additional slice in a pair (the 2nd, 4th, 6th ...)


def fee_for_slices(slices: int, rate: float) -> float:
    """Fee for one X-ray case:  rate x ceil(n/2)  +  EXTRA_SLICE_FEE x floor(n/2)

        slices : 1    2    3    4    5     6
        fee    : 32   35   67   70   102   105      (rate = 32)

    A case with no images still counts as one (1 slice)."""
    n = max(int(slices), 1)
    return round(rate * ((n + 1) // 2) + EXTRA_SLICE_FEE * (n // 2), 2)


def get_summary(org_id: str, ledger_limit: int = 200) -> Dict[str, Any]:
    ensure_tables()

    def run(cur):
        # First visit: snapshot the opening balance = -(rate x cases already completed).
        cur.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", ("billing_wallet:" + org_id,))
        cur.execute(
            """INSERT INTO organization_schema.billing_wallet
                   (org_id, opening_balance, rate_per_xray, charge_from)
               SELECT %(org)s,
                      -%(rate)s * COUNT(DISTINCT cs.case_id),
                      %(rate)s,
                      (now() AT TIME ZONE 'Asia/Kolkata')
                 FROM admin_schema.case_submission cs
                WHERE cs.org_id = %(org)s AND cs.completed_at IS NOT NULL
               ON CONFLICT (org_id) DO NOTHING""",
            {"org": org_id, "rate": RATE_PER_CASE},
        )
        cur.execute(
            "SELECT opening_balance, rate_per_xray, charge_from "
            "FROM organization_schema.billing_wallet WHERE org_id = %s",
            (org_id,),
        )
        w = cur.fetchone()
        opening, rate, charge_from = float(w["opening_balance"]), float(w["rate_per_xray"]), w["charge_from"]

        cur.execute(_CHARGES_SQL, {"org_id": org_id, "charge_from": charge_from, "xray": XRAY_TYPES})
        charges = [dict(r) for r in cur.fetchall()]

        cur.execute(
            """SELECT id, amount, utr, method, created_at
                 FROM organization_schema.billing_payments
                WHERE org_id = %s ORDER BY created_at DESC, id DESC""",
            (org_id,),
        )
        payments = [dict(r) for r in cur.fetchall()]

        total_paid = round(sum(float(p["amount"]) for p in payments), 2)
        # Fee per case = rate x views, where one view = 2 slices (rounded up).
        for c in charges:
            c["slices"] = count_slices(c.get("image_names"))
            c["fee"] = fee_for_slices(c["slices"], rate)

        total_charged = round(sum(c["fee"] for c in charges), 2)
        balance = round(opening + total_paid - total_charged, 2)

        ledger = (
            [{"kind": "charge", "date": c["completed_on"].isoformat(),
              "sort": c["completed_on"].isoformat() + "T00:00:00",
              "description": (f"X-ray report - {c['patient_name']} ({c['case_id']}) - "
                              f"{max(c['slices'], 1)} view{'s' if max(c['slices'], 1) != 1 else ''}"),
              "case_id": c["case_id"], "amount": -c["fee"]} for c in charges]
            + [{"kind": "payment", "date": p["created_at"].date().isoformat(),
                "sort": p["created_at"].isoformat(),
                "payment_id": p["id"],
                "transaction_id": p["utr"],
                "datetime": p["created_at"].isoformat(),
                "invoice_number": invoice_number(p["id"], p["created_at"]),
                "description": "Payment received",
                "case_id": None, "amount": float(p["amount"])} for p in payments]
        )
        ledger.sort(key=lambda r: r["sort"], reverse=True)
        for r in ledger:
            r.pop("sort")

        return {
            "balance": balance,
            "opening_balance": opening,
            "rate_per_xray": rate,
            "charge_from": charge_from.strftime("%Y-%m-%d %H:%M"),
            "xray_cases": len(charges),
            "total_charged": total_charged,
            "total_paid": total_paid,
            "ledger": ledger[:ledger_limit],
        }

    return _run(run)


# ------------------------------------------------------------
# Payments
# ------------------------------------------------------------
class DuplicateReference(Exception):
    pass


def add_payment(org_id: str, amount: float, utr: str, method: str) -> None:
    ensure_tables()

    def run(cur):
        cur.execute(
            "SELECT 1 FROM organization_schema.billing_payments WHERE upper(utr) = upper(%s)",
            (utr,),
        )
        if cur.fetchone():
            raise DuplicateReference()
        cur.execute(
            """INSERT INTO organization_schema.billing_payments (org_id, amount, utr, method)
               VALUES (%s, %s, %s, %s)""",
            (org_id, amount, utr, method),
        )

    _run(run)


def list_payments(org_id: str) -> List[Dict[str, Any]]:
    ensure_tables()

    def run(cur):
        cur.execute(
            """SELECT id, amount, utr, method, created_at
                 FROM organization_schema.billing_payments
                WHERE org_id = %s ORDER BY created_at DESC, id DESC""",
            (org_id,),
        )
        return [dict(r) for r in cur.fetchall()]

    return _run(run)


def get_payment_invoice(org_id: str, payment_id: int) -> Optional[Dict[str, Any]]:
    """One payment of this org plus the org's billing details, for the invoice."""
    ensure_tables()
    from organization import crud as org_crud
    org_crud._ensure_gst_column()

    def run(cur):
        cur.execute(
            """SELECT id, amount, utr, method, created_at
                 FROM organization_schema.billing_payments
                WHERE org_id = %s AND id = %s""",
            (org_id, payment_id),
        )
        p = cur.fetchone()
        if not p:
            return None
        cur.execute(
            """SELECT org_name, email, contact_number, gst,
                      COALESCE(NULLIF(street, ''), address) AS address_line,
                      city, state, zip, country
                 FROM organization_schema.org_profile WHERE org_id = %s""",
            (org_id,),
        )
        b = cur.fetchone() or {}
        return {
            "invoice_number": invoice_number(p["id"], p["created_at"]),
            "transaction_id": p["utr"],
            "method": p["method"],
            "amount": float(p["amount"]),
            "datetime": p["created_at"].isoformat(),
            "buyer": {
                "name": b.get("org_name"), "email": b.get("email"),
                "phone": b.get("contact_number"), "gstin": b.get("gst"),
                "address": b.get("address_line"), "city": b.get("city"),
                "state": b.get("state"), "pin": b.get("zip"),
                "country": b.get("country") or "India",
            },
        }

    return _run(run)
