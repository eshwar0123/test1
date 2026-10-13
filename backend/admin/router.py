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