import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from passlib.context import CryptContext

from auth.dependencies import get_current_user
from database import get_conn
from gmail_sender import send_email

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

router = APIRouter(prefix="/admin", tags=["Admin"])

FRONTEND_URL = "http://localhost:3000"


# ─── Schemas ────────────────────────────────────────────────────────────────

class OrgInviteRequest(BaseModel):
    organization_name: str
    organization_type: str
    contact_email: EmailStr
    contact_phone: str
    admin_name: str

class OrgRegisterRequest(BaseModel):
    token: str
    username: str
    password: str
    npi_number: str
    ein_tax_id: str
    address: str

class RadInviteRequest(BaseModel):
    first_name: str
    last_name: str
    contact_email: EmailStr
    contact_phone: str
    workplace: str

class RadRegisterRequest(BaseModel):
    token: str
    username: str
    password: str
    qualification: str
    designation: str
    location: str


# ─── Helper ─────────────────────────────────────────────────────────────────

def require_admin(user=Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# ─── GET /admin/organizations ────────────────────────────────────────────────

@router.get("/organizations")
def list_organizations(user=Depends(require_admin)):
    conn = get_conn()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT
                id,
                user_id,
                organization_name,
                organization_type,
                contact_email,
                contact_phone,
                admin_name,
                npi_number,
                ein_tax_id,
                address,
                CASE WHEN user_id IS NOT NULL THEN TRUE ELSE FALSE END AS profile_completed
            FROM admin_schema.new_user_organization
            ORDER BY created_at DESC
        """)
        rows = cursor.fetchall()
        cols = [d[0] for d in cursor.description]
        return [dict(zip(cols, row)) for row in rows]
    finally:
        cursor.close()
        conn.close()


# ─── GET /admin/organizations/validate-token ─────────────────────────────────

@router.get("/organizations/validate-token")
def validate_org_token(token: str):
    conn = get_conn()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT contact_email, organization_name, used, expires_at
            FROM admin_schema.new_user_organization
            WHERE token = %s
        """, (token,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=400, detail="Invalid token")
        email, org_name, used, expires_at = row
        if used:
            raise HTTPException(status_code=400, detail="Invite already used")
        if datetime.now(timezone.utc) > expires_at:
            raise HTTPException(status_code=400, detail="Invite link has expired")
        return {"email": email, "organization_name": org_name}
    finally:
        cursor.close()
        conn.close()


# ─── GET /admin/radiologists/validate-token ──────────────────────────────────

@router.get("/radiologists/validate-token")
def validate_rad_token(token: str):
    conn = get_conn()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT contact_email, first_name, last_name, used, expires_at
            FROM admin_schema.new_user_radiologist
            WHERE token = %s
        """, (token,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=400, detail="Invalid token")
        email, first_name, last_name, used, expires_at = row
        if used:
            raise HTTPException(status_code=400, detail="Invite already used")
        if datetime.now(timezone.utc) > expires_at:
            raise HTTPException(status_code=400, detail="Invite link has expired")
        return {"email": email, "first_name": first_name, "last_name": last_name}
    finally:
        cursor.close()
        conn.close()


# ─── POST /admin/organizations/link-invite ───────────────────────────────────

class LinkInviteRequest(BaseModel):
    token: str
    email: EmailStr

@router.post("/organizations/link-invite")
def link_org_invite(data: LinkInviteRequest):
    conn = get_conn()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "SELECT user_id FROM core_schema.users WHERE email = %s AND role = 'organization'",
            (str(data.email),)
        )
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=400, detail="User not found")
        user_id = row[0]
        cursor.execute("""
            UPDATE admin_schema.new_user_organization
            SET user_id = %s, used = TRUE
            WHERE token = %s
        """, (str(user_id), data.token))
        conn.commit()
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()


# ─── POST /admin/radiologists/link-invite ────────────────────────────────────

@router.post("/radiologists/link-invite")
def link_rad_invite(data: LinkInviteRequest):
    conn = get_conn()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "SELECT user_id FROM core_schema.users WHERE email = %s AND role = 'radiologist'",
            (str(data.email),)
        )
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=400, detail="User not found")
        user_id = row[0]
        cursor.execute("""
            UPDATE admin_schema.new_user_radiologist
            SET user_id = %s, used = TRUE
            WHERE token = %s
        """, (str(user_id), data.token))
        conn.commit()
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()


# ─── DELETE /admin/organizations/{user_id} ───────────────────────────────────

@router.delete("/organizations/{user_id}")
def delete_organization(user_id: str, user=Depends(require_admin)):
    conn = get_conn()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "DELETE FROM admin_schema.new_user_organization WHERE id = %s", (user_id,)
        )
        conn.commit()
        return {"ok": True}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()


# ─── POST /admin/organizations/invite ────────────────────────────────────────

@router.post("/organizations/invite")
def invite_organization(data: OrgInviteRequest, user=Depends(require_admin)):
    conn = get_conn()
    cursor = conn.cursor()
    try:
        # Check if an active invite already exists for this email
        cursor.execute(
            """
            SELECT token FROM admin_schema.new_user_organization
            WHERE contact_email = %s AND used = FALSE AND expires_at > NOW()
            """,
            (str(data.contact_email),),
        )
        existing = cursor.fetchone()
        if existing:
            raise HTTPException(
                status_code=400,
                detail="An active invite already exists for this email",
            )

        # Generate a unique token valid for 7 days
        token = str(uuid.uuid4())
        expires_at = datetime.now(timezone.utc) + timedelta(days=7)

        cursor.execute(
            """
            INSERT INTO admin_schema.new_user_organization
            (organization_name, organization_type, contact_email,
             contact_phone, admin_name, token, expires_at, used)
            VALUES (%s, %s, %s, %s, %s, %s, %s, FALSE)
            """,
            (
                data.organization_name,
                data.organization_type,
                str(data.contact_email),
                data.contact_phone,
                data.admin_name,
                token,
                expires_at,
            ),
        )
        conn.commit()

        # Build the registration link
        register_link = f"{FRONTEND_URL}/organization/signup?token={token}"

        # Send invitation email
        subject = f"You're invited to join Onix — {data.organization_name}"
        body = f"""
<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:32px;border:1px solid #e2e8f0;border-radius:12px;">
  <h2 style="color:#1e3a5f;margin-bottom:8px;">Welcome to Onix</h2>
  <p style="color:#374151;font-size:15px;">
    Hello <strong>{data.admin_name}</strong>,
  </p>
  <p style="color:#374151;font-size:15px;">
    You have been invited to register <strong>{data.organization_name}</strong> on the Onix platform.
  </p>
  <p style="color:#374151;font-size:15px;">
    Click the button below to complete your registration. This link is valid for <strong>7 days</strong>.
  </p>
  <a href="{register_link}"
     style="display:inline-block;margin:20px 0;padding:12px 28px;background:#1e3a5f;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">
    Complete Registration
  </a>
  <p style="color:#6b7280;font-size:13px;margin-top:24px;">
    If the button doesn't work, copy and paste this link into your browser:<br/>
    <a href="{register_link}" style="color:#2563eb;">{register_link}</a>
  </p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;"/>
  <p style="color:#9ca3af;font-size:12px;">
    If you did not expect this invitation, please ignore this email.
  </p>
</div>
"""

        try:
            send_email(str(data.contact_email), subject, body)
        except Exception as e:
            # Roll back invite if email fails so admin can retry
            conn2 = get_conn()
            c2 = conn2.cursor()
            c2.execute("DELETE FROM admin_schema.new_user_organization WHERE token = %s", (token,))
            conn2.commit()
            c2.close()
            conn2.close()
            raise HTTPException(status_code=500, detail=f"Invite saved but email failed: {e}")

        return {"ok": True, "message": f"Invitation sent to {data.contact_email}"}

    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()


# ─── POST /admin/organizations/register ─────────────────────────────────────

@router.post("/organizations/register")
def register_organization(data: OrgRegisterRequest):
    conn = get_conn()
    cursor = conn.cursor()
    try:
        # Validate token
        cursor.execute("""
            SELECT id, contact_email, organization_name, used, expires_at
            FROM admin_schema.new_user_organization
            WHERE token = %s
        """, (data.token,))
        invite = cursor.fetchone()

        if not invite:
            raise HTTPException(status_code=400, detail="Invalid token")

        inv_id, contact_email, org_name, used, expires_at = invite

        if used:
            raise HTTPException(status_code=400, detail="Invite already used")

        if datetime.now(timezone.utc) > expires_at:
            raise HTTPException(status_code=400, detail="Invite link has expired")

        # Check username not taken
        cursor.execute("SELECT 1 FROM core_schema.users WHERE username = %s", (data.username,))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="Username already taken")

        # Create user in core_schema.users
        user_id = str(uuid.uuid4())
        hashed_password = pwd_context.hash(data.password)
        cursor.execute("""
            INSERT INTO core_schema.users (user_id, email, username, password, role, is_verified)
            VALUES (%s, %s, %s, %s, 'organization', TRUE)
        """, (user_id, contact_email, data.username, hashed_password))

        # Link user_id back and mark invite as used
        cursor.execute("""
            UPDATE admin_schema.new_user_organization
            SET user_id = %s, used = TRUE,
                npi_number = %s, ein_tax_id = %s, address = %s
            WHERE id = %s
        """, (user_id, data.npi_number, data.ein_tax_id, data.address, inv_id))

        conn.commit()
        return {"ok": True, "message": "Organisation registered successfully", "user_id": user_id}

    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()


# ═══════════════════════════════════════════════════════════════════════════════
# RADIOLOGIST ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

# ─── GET /admin/radiologists ─────────────────────────────────────────────────

@router.get("/radiologists")
def list_radiologists(user=Depends(require_admin)):
    conn = get_conn()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT
                id,
                user_id,
                first_name,
                last_name,
                contact_email,
                contact_phone,
                workplace,
                username,
                qualification,
                designation,
                location,
                profile_image_path,
                CASE WHEN user_id IS NOT NULL THEN TRUE ELSE FALSE END AS profile_completed
            FROM admin_schema.new_user_radiologist
            ORDER BY created_at DESC
        """)
        rows = cursor.fetchall()
        cols = [d[0] for d in cursor.description]
        return [dict(zip(cols, row)) for row in rows]
    finally:
        cursor.close()
        conn.close()


# ─── DELETE /admin/radiologists/{id} ─────────────────────────────────────────

@router.delete("/radiologists/{rad_id}")
def delete_radiologist(rad_id: int, user=Depends(require_admin)):
    conn = get_conn()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "DELETE FROM admin_schema.new_user_radiologist WHERE id = %s", (rad_id,)
        )
        conn.commit()
        return {"ok": True}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()


# ─── POST /admin/radiologists/invite ─────────────────────────────────────────

@router.post("/radiologists/invite")
def invite_radiologist(data: RadInviteRequest, user=Depends(require_admin)):
    conn = get_conn()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            SELECT token FROM admin_schema.new_user_radiologist
            WHERE contact_email = %s AND used = FALSE AND expires_at > NOW()
            """,
            (str(data.contact_email),),
        )
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="An active invite already exists for this email")

        token = str(uuid.uuid4())
        expires_at = datetime.now(timezone.utc) + timedelta(days=7)

        cursor.execute(
            """
            INSERT INTO admin_schema.new_user_radiologist
            (first_name, last_name, contact_email, contact_phone, workplace, token, expires_at, used)
            VALUES (%s, %s, %s, %s, %s, %s, %s, FALSE)
            """,
            (data.first_name, data.last_name, str(data.contact_email), data.contact_phone, data.workplace, token, expires_at),
        )
        conn.commit()

        register_link = f"{FRONTEND_URL}/radiologist/signup?token={token}"

        full_name = f"{data.first_name} {data.last_name}".strip()
        subject = f"You're invited to join Onix — {full_name}"
        body = f"""
<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:32px;border:1px solid #e2e8f0;border-radius:12px;">
  <h2 style="color:#1e3a5f;margin-bottom:8px;">Welcome to Onix</h2>
  <p style="color:#374151;font-size:15px;">
    Hello <strong>{full_name}</strong>,
  </p>
  <p style="color:#374151;font-size:15px;">
    You have been invited to join the Onix platform as a radiologist.
  </p>
  <p style="color:#374151;font-size:15px;">
    Click the button below to complete your registration. This link is valid for <strong>7 days</strong>.
  </p>
  <a href="{register_link}"
     style="display:inline-block;margin:20px 0;padding:12px 28px;background:#1e3a5f;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">
    Complete Registration
  </a>
  <p style="color:#6b7280;font-size:13px;margin-top:24px;">
    If the button doesn't work, copy and paste this link into your browser:<br/>
    <a href="{register_link}" style="color:#2563eb;">{register_link}</a>
  </p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;"/>
  <p style="color:#9ca3af;font-size:12px;">
    If you did not expect this invitation, please ignore this email.
  </p>
</div>
"""

        try:
            send_email(str(data.contact_email), subject, body)
        except Exception as e:
            conn2 = get_conn()
            c2 = conn2.cursor()
            c2.execute("DELETE FROM admin_schema.new_user_radiologist WHERE token = %s", (token,))
            conn2.commit()
            c2.close()
            conn2.close()
            raise HTTPException(status_code=500, detail=f"Invite saved but email failed: {e}")

        return {"ok": True, "message": f"Invitation sent to {data.contact_email}"}

    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()


# ─── POST /admin/radiologists/register ───────────────────────────────────────

@router.post("/radiologists/register")
def register_radiologist(data: RadRegisterRequest):
    conn = get_conn()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT id, contact_email, first_name, last_name, used, expires_at
            FROM admin_schema.new_user_radiologist
            WHERE token = %s
        """, (data.token,))
        invite = cursor.fetchone()

        if not invite:
            raise HTTPException(status_code=400, detail="Invalid token")

        inv_id, contact_email, first_name, last_name, used, expires_at = invite

        if used:
            raise HTTPException(status_code=400, detail="Invite already used")

        if datetime.now(timezone.utc) > expires_at:
            raise HTTPException(status_code=400, detail="Invite link has expired")

        cursor.execute("SELECT 1 FROM core_schema.users WHERE username = %s", (data.username,))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="Username already taken")

        user_id = str(uuid.uuid4())
        hashed_password = pwd_context.hash(data.password)
        cursor.execute("""
            INSERT INTO core_schema.users (user_id, email, username, password, role, is_verified)
            VALUES (%s, %s, %s, %s, 'radiologist', TRUE)
        """, (user_id, contact_email, data.username, hashed_password))

        cursor.execute("""
            UPDATE admin_schema.new_user_radiologist
            SET user_id = %s, used = TRUE,
                username = %s, qualification = %s, designation = %s, location = %s
            WHERE id = %s
        """, (user_id, data.username, data.qualification, data.designation, data.location, inv_id))

        conn.commit()
        return {"ok": True, "message": "Radiologist registered successfully", "user_id": user_id}

    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()


# ─── GET /admin/qc/summary ──────────────────────────────────────────────────
# Admin-wide QC roll-up across ALL organizations.
# Drives the "QC Cases" mini-card and drill-down modal on the admin dashboard.
#
# Data sources:
#   • admin_schema.qc_cases          — every file ever QC'd (audit trail)
#   • organization_schema.returned_cases — live pointer for rejected cases
#   • organization_schema.bulk_uploads   — live pointer for passed/warn cases
#
# Strategy:
#   Roll up per CASE (not per file) using admin_schema.qc_cases since that's
#   the append-only audit log.  For each case_id we take the worst file
#   status as the case-level status.
#
# Returns:
#   {
#     "counts": {"total": N, "passed": P, "failed": F, "warn": W},
#     "cases":  [ {
#         case_id, org, patient, priority, type, reason, file, qc_status,
#         user_id, checked_at
#     }, ... ]
#   }
@router.get("/qc/summary")
def admin_qc_summary(user=Depends(require_admin)):
    """Admin-wide QC roll-up. Tolerant of missing columns/tables — never raises."""
    import traceback
    conn = get_conn()
    cursor = conn.cursor()
    try:
        # ─── Step 1: roll up qc_cases per (case_id, user_id) ───────────────
        # If admin_schema.qc_cases doesn't exist or is empty, we return zeros.
        try:
            cursor.execute("""
                SELECT
                    qc.case_id,
                    qc.user_id,
                    MAX(qc.checked_at) AS checked_at,
                    CASE
                      WHEN COUNT(*) FILTER (WHERE qc.status = 'error') > 0
                           AND COUNT(*) FILTER (WHERE qc.status = 'error')
                             = COUNT(*)                                     THEN 'failed'
                      WHEN COUNT(*) FILTER (WHERE qc.status = 'error') > 0  THEN 'warn'
                      WHEN COUNT(*) FILTER (WHERE qc.status = 'warn')  > 0  THEN 'warn'
                      ELSE 'passed'
                    END AS case_status,
                    (ARRAY_AGG(qc.file_name ORDER BY
                        CASE qc.status WHEN 'error' THEN 1 WHEN 'warn' THEN 2 ELSE 3 END))[1] AS file_name,
                    (ARRAY_AGG(qc.reason    ORDER BY
                        CASE qc.status WHEN 'error' THEN 1 WHEN 'warn' THEN 2 ELSE 3 END))[1] AS reason
                FROM admin_schema.qc_cases qc
                GROUP BY qc.case_id, qc.user_id
                ORDER BY MAX(qc.checked_at) DESC NULLS LAST
                LIMIT 500
            """)
            per_case_rows = cursor.fetchall()
        except Exception as e:
            print(f"[admin/qc/summary] qc_cases query failed: {e}")
            traceback.print_exc()
            conn.rollback()
            per_case_rows = []

        # ─── Step 2: for each case, look up display metadata ──────────────
        # We do this in Python so a missing/renamed column in one table
        # doesn't break the whole endpoint.
        cases = []
        counts = {"total": 0, "passed": 0, "failed": 0, "warn": 0}

        for (case_id, uid, checked_at, case_status, file_name, reason) in per_case_rows:
            patient  = None
            modality = None
            priority = None
            case_reason = reason
            org_name = "—"

            # Try returned_cases first (has the richest metadata for failures)
            try:
                cursor.execute("""
                    SELECT patient_name, modality_type, priority_type, reason
                      FROM organization_schema.returned_cases
                     WHERE case_id = %s AND user_id = %s
                     ORDER BY returned_at DESC
                     LIMIT 1
                """, (case_id, uid))
                row = cursor.fetchone()
                if row:
                    patient, modality, priority, rc_reason = row
                    if rc_reason: case_reason = rc_reason
            except Exception as e:
                print(f"[admin/qc/summary] returned_cases lookup failed for {case_id}: {e}")
                conn.rollback()

            # Fall back to bulk_uploads
            if not patient:
                try:
                    cursor.execute("""
                        SELECT patient_name, modality_type, priority_type
                          FROM organization_schema.bulk_uploads
                         WHERE case_id = %s AND user_id = %s
                         ORDER BY uploaded_at DESC
                         LIMIT 1
                    """, (case_id, uid))
                    row = cursor.fetchone()
                    if row:
                        patient, modality, priority = row
                except Exception as e:
                    print(f"[admin/qc/summary] bulk_uploads lookup failed for {case_id}: {e}")
                    conn.rollback()

            # Org name — tolerant of whatever the org table is actually called
            try:
                cursor.execute("""
                    SELECT organization_name
                      FROM organization_schema.organization_profile
                     WHERE user_id = %s
                     LIMIT 1
                """, (uid,))
                row = cursor.fetchone()
                if row and row[0]:
                    org_name = row[0]
            except Exception:
                # Table/column may not exist — that's fine, leave as "—"
                conn.rollback()

            cases.append({
                "case_id":    case_id,
                "org":        org_name or "—",
                "patient":    patient or "—",
                "priority":   (priority or "routine").lower() if priority else "routine",
                "type":       modality or "—",
                "file":       file_name or "—",
                "reason":     case_reason or "—",
                "qc_status":  case_status,
                "user_id":    str(uid) if uid else None,
                "checked_at": checked_at.isoformat() if checked_at else None,
            })
            counts["total"] += 1
            if case_status == "passed":   counts["passed"] += 1
            elif case_status == "failed": counts["failed"] += 1
            elif case_status == "warn":   counts["warn"]   += 1

        return {"counts": counts, "cases": cases}

    except Exception as e:
        print(f"[admin/qc/summary] unexpected error: {e}")
        traceback.print_exc()
        # Still return a valid shape so the frontend doesn't break
        return {"counts": {"total": 0, "passed": 0, "failed": 0, "warn": 0}, "cases": []}
    finally:
        cursor.close()
        conn.close()

# ═════════════════════════════════════════════════════════════════════════════
#  Admin dashboard — REAL data from admin_schema.case_workflow (read-only)
#
#  GET /admin/dashboard/overview     -> the number cards
#  GET /admin/dashboard/assignments  -> Live Assignments table + History popup
#
#  Both accept ?range=overall|today|custom (&date_from=YYYY-MM-DD&date_to=...).
#  Times in case_workflow are naive UTC (DB timezone is Etc/UTC); "today" and
#  the custom range are evaluated in India time (Asia/Kolkata).
#  Failures raise 500 on purpose: the page must never show made-up zeros.
# ═════════════════════════════════════════════════════════════════════════════
from datetime import date as _date
from typing import Optional

from fastapi import Query

# In-time of a case = when it was assigned (falls back to when it was created).
_DASH_IN_TIME = "COALESCE(assigned_at, created_at)"
_DASH_IN_DAY_IST = f"((({_DASH_IN_TIME}) AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata')::date"
_DASH_TODAY_IST = "(now() AT TIME ZONE 'Asia/Kolkata')::date"


def _dash_range(range_: str, date_from: Optional[str], date_to: Optional[str]):
    """Return (sql_fragment, params) that limits case_workflow rows by in-time."""
    r = (range_ or "overall").lower()
    if r == "today":
        return f" AND {_DASH_IN_DAY_IST} = {_DASH_TODAY_IST}", ()
    if r == "custom":
        try:
            d_from = _date.fromisoformat(date_from) if date_from else None
            d_to = _date.fromisoformat(date_to) if date_to else None
        except ValueError:
            raise HTTPException(status_code=400, detail="date_from/date_to must be YYYY-MM-DD")
        frag, params = "", []
        if d_from:
            frag += f" AND {_DASH_IN_DAY_IST} >= %s"
            params.append(d_from)
        if d_to:
            frag += f" AND {_DASH_IN_DAY_IST} <= %s"
            params.append(d_to)
        return frag, tuple(params)
    return "", ()


@router.get("/dashboard/overview")
def admin_dashboard_overview(
    range_: str = Query("overall", alias="range"),
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    user=Depends(require_admin),
):
    """Counts for the dashboard cards. Definitions:
       critical  = priority STAT (or 'Critical');  urgent = 'Urgent';  regular = everything else
       completed = current_status 'completed'
       assigned_pending = assigned to a radiologist and not completed yet
       unassigned = not assigned to a radiologist
    """
    frag, params = _dash_range(range_, date_from, date_to)
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            f"""
            SELECT
                count(*),
                count(*) FILTER (WHERE upper(coalesce(priority_type,'')) IN ('STAT','CRITICAL')),
                count(*) FILTER (WHERE upper(coalesce(priority_type,'')) = 'URGENT'),
                count(*) FILTER (WHERE upper(coalesce(priority_type,'')) NOT IN ('STAT','CRITICAL','URGENT')),
                count(*) FILTER (WHERE lower(coalesce(current_status,'')) = 'completed'),
                count(*) FILTER (WHERE lower(coalesce(current_status,'')) <> 'completed'
                                   AND lower(coalesce(assignment_status,'')) = 'assigned'),
                count(*) FILTER (WHERE lower(coalesce(assignment_status,'')) <> 'assigned')
              FROM admin_schema.case_workflow
             WHERE true {frag}
            """,
            params,
        )
        total, critical, urgent, regular, completed, assigned_pending, unassigned = cur.fetchone()
        return {
            "range": (range_ or "overall").lower(),
            "total": total,
            "critical": critical,
            "urgent": urgent,
            "regular": regular,
            "completed": completed,
            "completion_pct": round(100.0 * completed / total, 1) if total else 0.0,
            "assigned_pending": assigned_pending,
            "unassigned": unassigned,
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"[admin/dashboard/overview] failed: {e}")
        traceback.print_exc()
        conn.rollback()
        raise HTTPException(status_code=500, detail="Could not load dashboard overview")
    finally:
        conn.close()


@router.get("/dashboard/assignments")
def admin_dashboard_assignments(
    range_: str = Query("overall", alias="range"),
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    limit: int = Query(300, ge=1, le=1000),
    user=Depends(require_admin),
):
    """Newest-first assignments in the exact shape the dashboard table expects.
       No patient names are returned. Times are epoch milliseconds (UTC).
       status is 'completed' or 'pending' ('working' is not recorded by the app).
       receivedTime = accepted_at (when the radiologist picked the case up);
       case_workflow.received_at is NOT used: it just equals the assignment time.
    """
    frag, params = _dash_range(range_, date_from, date_to)
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            f"""
            SELECT workflow_id::text,
                   case_id,
                   organization_name,
                   priority_type,
                   modality_type,
                   radiologist_name,
                   specialization_name,
                   current_status,
                   (EXTRACT(EPOCH FROM {_DASH_IN_TIME}) * 1000)::bigint,
                   (EXTRACT(EPOCH FROM accepted_at)     * 1000)::bigint,
                   (EXTRACT(EPOCH FROM completed_at)    * 1000)::bigint
              FROM admin_schema.case_workflow
             WHERE true {frag}
             ORDER BY {_DASH_IN_TIME} DESC NULLS LAST, id DESC
             LIMIT %s
            """,
            params + (limit,),
        )
        rows = []
        for (wf_id, case_id, org, prio, modality, rad_name, spec, status,
             in_ms, recv_ms, done_ms) in cur.fetchall():
            p = (prio or "").upper()
            m = (modality or "").upper().replace("-", "").replace(" ", "")
            rows.append({
                "id": wf_id,
                "caseId": case_id,
                "org": org or "—",
                "priority": "critical" if p in ("STAT", "CRITICAL") else "urgent" if p == "URGENT" else "regular",
                "type": {"XRAY": "X-Ray", "CT": "CT", "MRI": "MRI"}.get(m, "Others"),
                "inTime": in_ms,
                "radiologist": rad_name or "Unassigned",
                "specialisation": spec or "",
                "status": "completed" if (status or "").lower() == "completed" else "pending",
                "receivedTime": recv_ms,
                "completedTime": done_ms,
            })
        return {"range": (range_ or "overall").lower(), "count": len(rows), "rows": rows}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"[admin/dashboard/assignments] failed: {e}")
        traceback.print_exc()
        conn.rollback()
        raise HTTPException(status_code=500, detail="Could not load dashboard assignments")
    finally:
        conn.close()



# ─── GET /admin/assignable-radiologists ──────────────────────────────────────
# Every radiologist (active or not) for the admin's manual assign / reassign picker.

@router.get("/assignable-radiologists")
def assignable_radiologists(user=Depends(require_admin)):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT r.rad_id,
                       TRIM(COALESCE(r.first_name,'') || ' ' || COALESCE(r.last_name,'')) AS name,
                       COALESCE(to_jsonb(r)->>'specialization',
                                to_jsonb(r)->>'specialisation',
                                to_jsonb(r)->>'qualification', '') AS specialization,
                       COALESCE(r.is_active, TRUE) AS is_active
                  FROM radiology_schema.radiologists r
                 ORDER BY COALESCE(r.is_active, TRUE) DESC, name
            """)
            return [
                {"rad_id": str(a), "name": b or str(a), "specialization": c or "", "is_active": bool(d)}
                for a, b, c, d in cur.fetchall()
            ]
    finally:
        conn.close()


# ─── POST /admin/cases/{case_id}/assign ──────────────────────────────────────
# Manual assign / reassign by the admin. Same effect as the technician assign: updates the
# scan and case_workflow (which the dashboard reads), then notifies the radiologist.

class AdminAssignIn(BaseModel):
    rad_id: str


@router.post("/cases/{case_id}/assign")
def admin_assign_case(case_id: str, payload: AdminAssignIn, user=Depends(require_admin)):
    rad_id = (payload.rad_id or "").strip()
    if not rad_id:
        raise HTTPException(status_code=400, detail="rad_id is required")

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT user_id, first_name, last_name, is_active "
                "FROM radiology_schema.radiologists WHERE rad_id = %s",
                (rad_id,),
            )
            rad = cur.fetchone()
            if not rad:
                raise HTTPException(status_code=404, detail="Radiologist not found")
            if rad[3] is False:
                raise HTTPException(status_code=409, detail="This radiologist is deactivated")
            rad_user_id = str(rad[0])
            rad_name = f"{rad[1] or ''} {rad[2] or ''}".strip()

            cur.execute(
                "SELECT status FROM radiology_schema.rad_scans WHERE case_id = %s LIMIT 1",
                (case_id,),
            )
            scan = cur.fetchone()
            if not scan:
                raise HTTPException(status_code=404, detail="Scan not found for this case")
            if str(scan[0] or "").lower() in ("complete", "completed", "done"):
                raise HTTPException(status_code=409, detail="This case is already completed")

            cur.execute(
                "UPDATE radiology_schema.rad_scans SET assigned_rad_id = %s, assigned_at = NOW() "
                "WHERE case_id = %s",
                (rad_id, case_id),
            )
            cur.execute(
                """
                UPDATE admin_schema.case_workflow
                   SET radiologist_user_id = %s, radiologist_name = %s, rad_id = %s,
                       assignment_status = 'assigned', assigned_at = NOW()
                 WHERE case_id = %s
                """,
                (rad_user_id, rad_name, rad_id, case_id),
            )
            from radiologist.router import _create_notification
            _create_notification(
                cur, rad_user_id, case_id,
                "New Case Assigned",
                f"Case {case_id} has been assigned to you",
            )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    try:
        from assignment_mail import notify_cases_assigned
        notify_cases_assigned(rad_user_id, [case_id])
    except Exception as e:
        print(f"[admin assign] email failed: {e}")

    return {"success": True, "data": {"case_id": case_id, "assigned_rad_id": rad_id, "radiologist": rad_name}}


# ═════════════════════════════════════════════════════════════════════════════
#  Admin directory — REAL organisations and radiologists (read-only)
#
#  GET /admin/directory/organizations  <- organization_schema.org_profile
#                                         (+ core_schema.users for the username,
#                                          + admin_schema.case_workflow for case counts)
#  GET /admin/directory/radiologists   <- radiology_schema.radiologists
#                                         (+ core_schema.users, + rad_scans for case counts,
#                                          + admin_schema.new_user_radiologist only for a phone number)
#
#  These replace the invite lists (admin_schema.new_user_organization /
#  new_user_radiologist) on the admin pages. The invite routes and tables are untouched.
#  Failures raise 500 on purpose: the pages must never show made-up rows.
#
#  "profile_completed" definitions (shown as Complete / Incomplete):
#    organisation: organisation type, a phone number and an address are all filled in
#    radiologist:  qualification and designation are both filled in
# ═════════════════════════════════════════════════════════════════════════════


@router.get("/directory/organizations")
def admin_directory_organizations(user=Depends(require_admin)):
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT p.org_id,
                   p.user_id::text,
                   COALESCE(u.username, ''),
                   p.email,
                   p.org_name,
                   NULLIF(p.org_type, ''),
                   NULLIF(p.npi, ''),
                   NULLIF(p.ein, ''),
                   COALESCE(NULLIF(p.org_admin_email, ''), p.email),
                   COALESCE(NULLIF(p.contact_number, ''), NULLIF(p.org_admin_contact, '')),
                   NULLIF(p.org_admin_name, ''),
                   COALESCE(NULLIF(p.address, ''),
                            NULLIF(concat_ws(', ', NULLIF(p.street, ''), NULLIF(p.city, ''),
                                             NULLIF(p.state, ''), NULLIF(p.zip, '')), '')),
                   CASE WHEN NULLIF(p.logo_path, '') IS NULL THEN NULL
                        ELSE '/' || ltrim(p.logo_path, '/') END,
                   COALESCE(c.n, 0)
              FROM organization_schema.org_profile p
              LEFT JOIN core_schema.users u ON u.user_id = p.user_id
              LEFT JOIN (SELECT org_id, count(*) AS n
                           FROM admin_schema.case_workflow
                          GROUP BY org_id) c ON c.org_id = p.org_id
             ORDER BY COALESCE(c.n, 0) DESC, p.created_at DESC
            """
        )
        out = []
        for (org_id, uid, username, email, name, otype, npi, ein, contact_email, phone,
             admin_name, address, logo_url, cases) in cur.fetchall():
            out.append({
                "id": org_id,
                "user_id": uid,
                "username": username,
                "email": email,
                "organization_name": name,
                "organization_type": otype,
                "npi_number": npi,
                "ein_tax_id": ein,
                "contact_email": contact_email,
                "contact_phone": phone,
                "admin_name": admin_name,
                "address": address,
                "logo_url": logo_url,
                "cases": cases,
                "profile_completed": bool(otype and phone and address),
            })
        return out
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"[admin/directory/organizations] failed: {e}")
        traceback.print_exc()
        conn.rollback()
        raise HTTPException(status_code=500, detail="Could not load organisations")
    finally:
        conn.close()


@router.get("/directory/radiologists")
def admin_directory_radiologists(user=Depends(require_admin)):
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT r.user_id::text,
                   r.rad_id,
                   COALESCE(u.username, ''),
                   r.first_name,
                   r.last_name,
                   COALESCE(NULLIF(r.email, ''), u.email),
                   (SELECT n.contact_phone
                      FROM admin_schema.new_user_radiologist n
                     WHERE lower(n.contact_email) = lower(COALESCE(NULLIF(r.email, ''), u.email))
                       AND NULLIF(n.contact_phone, '') IS NOT NULL
                     ORDER BY n.id DESC LIMIT 1),
                   NULLIF(r.user_lab_name, ''),
                   NULLIF(r.qualification, ''),
                   NULLIF(r.designation, ''),
                   NULLIF(r.lab_address, ''),
                   CASE WHEN NULLIF(r.profile_image_path, '') IS NULL THEN NULL
                        ELSE '/uploads/' || ltrim(r.profile_image_path, '/') END,
                   r.is_active,
                   r.verification_status,
                   COALESCE(c.n, 0)
              FROM radiology_schema.radiologists r
              LEFT JOIN core_schema.users u ON u.user_id = r.user_id
              LEFT JOIN (SELECT user_id, count(*) AS n
                           FROM radiology_schema.rad_scans
                          GROUP BY user_id) c ON c.user_id = r.user_id
             ORDER BY COALESCE(c.n, 0) DESC, r.created_at DESC
            """
        )
        out = []
        for (uid, rad_id, username, first, last, email, phone, workplace, qual, desig,
             location, photo, active, verification, cases) in cur.fetchall():
            out.append({
                "id": uid,
                "user_id": uid,
                "rad_id": rad_id,
                "username": username,
                "first_name": first,
                "last_name": last,
                "contact_email": email,
                "contact_phone": phone,
                "workplace": workplace,
                "qualification": qual,
                "designation": desig,
                "location": location,
                "profile_image_url": photo,
                "is_active": bool(active),
                "verification_status": verification,
                "cases": cases,
                "profile_completed": bool(qual and desig),
            })
        return out
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"[admin/directory/radiologists] failed: {e}")
        traceback.print_exc()
        conn.rollback()
        raise HTTPException(status_code=500, detail="Could not load radiologists")
    finally:
        conn.close()



# ─── GET /admin/availability ─────────────────────────────────────────────────
# Every radiologist's availability slots from today (India time) for the next `days` days.

@router.get("/availability")
def admin_availability(days: int = 14, user=Depends(require_admin)):
    days = max(1, min(int(days), 60))
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT user_id::text,
                       COALESCE(radiologist_name, ''),
                       COALESCE(specialization_name, ''),
                       available_date::text,
                       to_char(from_time, 'HH24:MI'),
                       to_char(to_time, 'HH24:MI'),
                       COALESCE(availability_status, 'available'),
                       COALESCE(slot_type, ''),
                       COALESCE(notes, '')
                  FROM admin_schema.radiologist_availability
                 WHERE available_date >= (NOW() AT TIME ZONE 'Asia/Kolkata')::date
                   AND available_date <= (NOW() AT TIME ZONE 'Asia/Kolkata')::date + %s
                 ORDER BY available_date, from_time
            """, (days,))
            return [
                {
                    "user_id": r[0], "radiologist_name": r[1], "specialization": r[2],
                    "available_date": r[3], "from_time": r[4], "to_time": r[5],
                    "status": r[6], "slot_type": r[7], "notes": r[8],
                }
                for r in cur.fetchall()
            ]
    finally:
        conn.close()
