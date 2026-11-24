# ============================================================
# backend/organization/billing/router.py
#
#   GET  /organization/billing/status    {enabled}  - is Payment on for this org?
#   GET  /organization/billing/summary   balance + ledger
#   GET  /organization/billing/payments/{id}/invoice   data for the invoice PDF
#   POST /organization/billing/pay       record a payment (adds to the balance)
#
# Only organizations listed in crud.BILLING_ORG_IDS / BILLING_ORG_NAMES can use these (403 otherwise).
# ============================================================

import re
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth.dependencies import get_current_user
from organization import crud as org_crud

from . import crud

router = APIRouter(prefix="/organization/billing", tags=["Organization Billing"])

MAX_PAYMENT = 1_000_000          # Rs per payment; stops typo credits like 10000000
_UTR_RE = re.compile(r"^[A-Za-z0-9]{6,40}$")


class PayRequest(BaseModel):
    amount: float
    payment_ref: str             # UPI / bank transaction reference (UTR)


def _profile(user) -> dict:
    user_id = user.get("user_id")
    if not user_id:
        raise HTTPException(401, "Invalid token payload (user_id missing)")
    return org_crud.get_org_profile_basics(UUID(user_id)) or {}


def _billed_org(user) -> str:
    p = _profile(user)
    if not p.get("org_id") or not crud.is_billed_org(p.get("org_id"), p.get("org_name")):
        raise HTTPException(403, "Payment is not enabled for this organization.")
    return p["org_id"]


@router.get("/status")
def status(user=Depends(get_current_user)):
    p = _profile(user)
    return {"enabled": bool(p.get("org_id")) and crud.is_billed_org(p.get("org_id"), p.get("org_name"))}


@router.get("/summary")
def summary(user=Depends(get_current_user)):
    org_id = _billed_org(user)
    return {"ok": True, **crud.get_summary(org_id)}


@router.get("/payments/{payment_id}/invoice")
def payment_invoice(payment_id: int, user=Depends(get_current_user)):
    org_id = _billed_org(user)
    inv = crud.get_payment_invoice(org_id, payment_id)
    if not inv:
        raise HTTPException(404, "Payment not found.")
    return {"ok": True, "invoice": inv}


@router.post("/pay")
def pay(body: PayRequest, user=Depends(get_current_user)):
    org_id = _billed_org(user)

    amount = round(float(body.amount), 2)
    if not (0 < amount <= MAX_PAYMENT):
        raise HTTPException(422, f"Enter an amount between 1 and {MAX_PAYMENT:,}.")
    ref = (body.payment_ref or "").strip()
    if not _UTR_RE.match(ref):
        raise HTTPException(422, "Enter the 6-40 character UPI / bank transaction reference (UTR).")

    try:
        crud.add_payment(org_id, amount, ref, "UPI/Bank transfer")
    except crud.DuplicateReference:
        raise HTTPException(409, "This transaction reference has already been recorded.")

    return {"ok": True, **crud.get_summary(org_id)}
