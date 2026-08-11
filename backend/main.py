# backend/main.py
# ─── load .env BEFORE anything else so JWT_SECRET, etc. are populated ────────
from dotenv import load_dotenv
load_dotenv()
# ─────────────────────────────────────────────────────────────────────────────

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI, HTTPException
from datetime import timezone

from passlib.context import CryptContext
from database import get_conn  # your DB connection function
from schemas import CompleteGoogleRegistrationSchema  # your Pydantic schema
from database import get_conn
from schemas import RegisterSchema, VerifyOTPSchema, LoginSchema
import random
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail
from gmail_sender import send_email
from fastapi import Request
from pathlib import Path
import os
import uuid
from datetime import datetime, timedelta
from typing import Optional
from pydantic import BaseModel, EmailStr
from radiologist.router import router as radiologist_router
from radiologist.series_manifest import router as series_manifest_router
from organization.router import router as organization_router
from ai.stt_router import router as stt_router
from ai.llava_router import router as llava_router
from admin.router import router as admin_router
from chatbot.router import router as chatbot_router
from ai.medgemma_router import router as medgemma_router
from ai.template_router import router as template_router
from docs_router import router as docs_router

from fastapi.responses import JSONResponse
from pathlib import Path



from pydantic import BaseModel
from passlib.context import CryptContext
from storage.router import router as storage_router
import os
import jwt

from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles




SECRET_KEY = os.getenv("JWT_SECRET", "dev_secret_change_me")  # ✅ fallback string
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 1 day
COMPANY_DIR = Path(__file__).parent / "static" / "organization"
ALLOWED_EXTS = {".png", ".jpg", ".jpeg", ".svg", ".webp"}

def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

import dicom_transcode  # noqa: F401 — logs a loud warning at startup if pylibjpeg is missing

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app = FastAPI()
ORG_DIR = os.path.join(BASE_DIR, "radiologist", "uploads", "organisation")
os.makedirs(ORG_DIR, exist_ok=True)

app.mount("/uploads/organisation", StaticFiles(directory=ORG_DIR), name="org-organisation-logos")

ORG_LOGO_DIR = os.path.join(BASE_DIR, "uploads", "organization", "logos")
os.makedirs(ORG_LOGO_DIR, exist_ok=True)
app.mount("/uploads/organization/logos", StaticFiles(directory=ORG_LOGO_DIR), name="org-logos")

ORG_SINGLE_CASES_DIR = os.path.join(BASE_DIR, "uploads", "organization", "single_cases")
os.makedirs(ORG_SINGLE_CASES_DIR, exist_ok=True)
app.mount("/uploads/organization/single_cases", StaticFiles(directory=ORG_SINGLE_CASES_DIR), name="org-single-cases")

ORG_BULK_CASES_DIR = os.path.join(BASE_DIR, "uploads", "organization", "bulk_cases")
os.makedirs(ORG_BULK_CASES_DIR, exist_ok=True)
app.mount("/uploads/organization/bulk_cases", StaticFiles(directory=ORG_BULK_CASES_DIR), name="org-bulk-cases")

# ✅ put this first (more specific)
RADIOLOGIST_UPLOADS_DIR = os.path.join(BASE_DIR, "radiologist", "uploads")
os.makedirs(RADIOLOGIST_UPLOADS_DIR, exist_ok=True)
app.mount(
    "/uploads/radiologist",
    StaticFiles(directory=RADIOLOGIST_UPLOADS_DIR),
    name="radiologist-uploads"
)
app.include_router(storage_router)
 






# ✅ ensure directories exist before mounting
os.makedirs(os.path.join(BASE_DIR, "radiologist/nii"), exist_ok=True)
os.makedirs(os.path.join(BASE_DIR, "radiologist/uploads/thumbnails"), exist_ok=True)
os.makedirs(os.path.join(BASE_DIR, "radiologist/dicom_files"), exist_ok=True)
os.makedirs(os.path.join(BASE_DIR, "radiologist/dicom_series"), exist_ok=True)

app.mount("/uploads/nii", StaticFiles(directory=os.path.join(BASE_DIR, "radiologist/nii")), name="nii")
app.mount("/uploads/thumbnails", StaticFiles(directory=os.path.join(BASE_DIR, "radiologist/uploads/thumbnails")), name="thumbnails")
app.mount("/uploads/dicom-file", StaticFiles(directory=os.path.join(BASE_DIR, "radiologist/dicom_files")), name="dicom_files")
app.mount("/uploads/dicom-series", StaticFiles(directory=os.path.join(BASE_DIR, "radiologist/dicom_series")), name="dicom_series")



pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
# Temporary password reset token storage
reset_tokens = {}  # {token: {"email": email, "expires": datetime}}


# ================= GOOGLE OAUTH FIX =================
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi import Request

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        # REQUIRED FOR GOOGLE POPUP LOGIN
        response.headers["Cross-Origin-Opener-Policy"] = "same-origin-allow-popups"
        response.headers["Cross-Origin-Embedder-Policy"] = "unsafe-none"
        response.headers["Cross-Origin-Resource-Policy"] = "cross-origin"

        return response

app.add_middleware(SecurityHeadersMiddleware)
# ====================================================

# CORS (must be added last so it runs outermost)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "*"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


SENDGRID_API_KEY = os.getenv("SENDGRID_API_KEY")

# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Temporary OTP storage for normal registration
otp_storage = {}  # {email: {"otp": "123456", "expires": datetime, "role": "radiologist"}}

app.include_router(radiologist_router)
# Precomputed DICOM series manifest + single-origin instance streaming.
# No prefix — the router carries its own /radiology, and nginx's
# `proxy_pass http://127.0.0.1:8100/` already strips the /api segment.
app.include_router(series_manifest_router)
app.include_router(organization_router)
app.include_router(stt_router)
app.include_router(llava_router)
app.include_router(admin_router)
app.include_router(chatbot_router)
app.include_router(medgemma_router)
app.include_router(template_router)
app.include_router(docs_router)

# QC — runs in the background after uploads; exposes /organization/qc/* endpoints
try:
    from qc.runner import router as qc_router
    app.include_router(qc_router)
except Exception as _e:
    print(f"[warn] QC router not loaded: {_e}")


# =======================
# Home
# =======================
@app.get("/")
def home():
    return {"message": "Backend running successfully"}

@app.get("/assets/organization", response_class=JSONResponse)
def list_organization_logos():
    if not COMPANY_DIR.exists():
        return []

    return sorted(
        [
            f.name
            for f in COMPANY_DIR.iterdir()
            if f.is_file() and f.suffix.lower() in ALLOWED_EXTS
        ],
        key=str.lower,
    )

# Serve static files
app.mount("/static", StaticFiles(directory=str(Path(__file__).parent / "static")), name="static")
# =======================
# Send OTP (for normal registration)
# =======================
@app.post("/send-otp")
def send_otp(data: dict):
    email = data.get("email")
    username = data.get("username", "")  # optional
    role = data.get("role")  # keep if needed

    if not email:
        raise HTTPException(status_code=400, detail="Email is required")

    # Generate OTP
    otp_code = str(random.randint(100000, 999999))
    expires = datetime.now(timezone.utc) + timedelta(minutes=5)

    otp_id = str(uuid.uuid4())

    conn = get_conn()
    cursor = conn.cursor()

    # Insert OTP into user_otps table
    cursor.execute(
        """
        INSERT INTO core_schema.user_otps
        (otp_id, email, purpose, otp_code, otp_expires_at, attempts)
        VALUES
        (%s, %s, %s, %s, %s, 0)
        """,
        (otp_id, email, "register", otp_code, expires)
    )
    conn.commit()
    cursor.close()
    conn.close()

    print(f"OTP for {email} is {otp_code}")  # debug

    # Send email
    subject = "Your OTP Verification Code"
    body = f"""
<p>Welcome to GenPhase, Please use the following verification code to complete your verification:</p>

<p style="font-size:26px; margin:10px 0;">
  <strong>{otp_code}</strong>
</p>

<p>For your security, do not share this code with anyone.</p>
"""


    try:
        send_email(email, subject, body)
        return {"message": "OTP sent successfully"}
    except Exception as e:
        print("Email error:", e)
        raise HTTPException(status_code=500, detail="Failed to send OTP")



# =======================
# Verify OTP
# =======================
# =======================
# Verify OTP
# =======================
@app.post("/verify-otp")
def verify_otp(data: VerifyOTPSchema):
    email = data.email
    otp_input = data.otp

    conn = get_conn()
    cursor = conn.cursor()

    # Fetch the latest OTP for this email
    cursor.execute(
        """
        SELECT otp_id, otp_code, otp_expires_at, attempts, consumed_at
        FROM core_schema.user_otps
        WHERE email=%s AND purpose='register'
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (email,)
    )
    row = cursor.fetchone()
    if not row:
        raise HTTPException(400, "OTP not found")

    otp_id, otp_code, otp_expires_at, attempts, consumed_at = row

    if consumed_at is not None:
        raise HTTPException(400, "OTP already used")

    if datetime.now(timezone.utc) > otp_expires_at:

        raise HTTPException(400, "OTP expired")

    if otp_input != otp_code:
        cursor.execute(
            "UPDATE core_schema.user_otps SET attempts = attempts + 1 WHERE otp_id=%s",
            (otp_id,)
        )
        conn.commit()
        raise HTTPException(400, "Invalid OTP")

    # mark used instead of delete
    cursor.execute(
        "UPDATE core_schema.user_otps SET consumed_at = now() WHERE otp_id=%s",
        (otp_id,)
    )
    conn.commit()

    cursor.close()
    conn.close()

    return {"message": "OTP verified successfully", "email": email }



# =======================
# Normal Registration (with OTP)
# =======================
@app.post("/register")
def register(data: RegisterSchema):
    conn = get_conn()
    cursor = conn.cursor()

    # Check if user already exists
    cursor.execute("SELECT * FROM core_schema.users WHERE email=%s", (data.email,))
    if cursor.fetchone():
        cursor.close()
        conn.close()
        raise HTTPException(status_code=400, detail="User already exists")

    # Hash password
    hashed_password = pwd_context.hash(data.password)

    user_id = str(uuid.uuid4())
    cursor.execute(
        """
        INSERT INTO core_schema.users (user_id, email, username, password, role, is_verified)
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (user_id, data.email, data.username, hashed_password, data.role, True)
    )

    conn.commit()
    cursor.close()
    conn.close()

    return {"message": "User registered successfully"}



# =======================
# Login (normal)
# =======================

from fastapi import Request

@app.post("/login")
def login(data: LoginSchema, request: Request):
    conn = get_conn()
    cursor = conn.cursor()

    # Find user by email only
    cursor.execute("""
        SELECT user_id, username, email, password, role, is_verified
        FROM core_schema.users
        WHERE email = %s
    """, (data.email,))
    
    user = cursor.fetchone()

    if not user:
        cursor.close()
        conn.close()
        raise HTTPException(status_code=400, detail="User not found")

    user_id, username, email, password, db_role, is_verified = user

    # Check verification
    if not is_verified:
        raise HTTPException(status_code=403, detail="User not verified")

    # Check password
    if not pwd_context.verify(data.password, password):
        raise HTTPException(status_code=400, detail="Invalid credentials")

    # ❌ REMOVED ROLE CHECK
    # User doesn’t select role; backend should not enforce it.

    # Save login info
    ip_address = request.client.host if request.client else None
    device_info = request.headers.get("user-agent")

    log_id = str(uuid.uuid4())
    cursor.execute("""
        INSERT INTO core_schema.login_logs
        (log_id, user_id, email, role, status, login_time, ip_address, device_info)
        VALUES (%s, %s, %s, %s, %s, NOW(), %s, %s)
    """, (log_id, user_id, email, db_role, "success", ip_address, device_info))


    conn.commit()
    cursor.close()
    conn.close()

    access_token = create_access_token({
        "user_id": str(user_id),
        "email": email,
        "role": db_role
    })


    return {
        "message": "Login successful",
        "access_token": access_token,
        "token_type": "bearer",
        "user_id": user_id,
        "username": username,
        "email": email,
        "role": db_role
    }



# =======================
# Google Registration/Login (no OTP)
# =======================


class GoogleLoginSchema(BaseModel):
    email: str
    name: str
    role: Optional[str] = None  # ✅ optional now


@app.post("/google-login")
def google_login(data: GoogleLoginSchema):
    conn = get_conn()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT user_id, email, username, role, is_verified
        FROM core_schema.users
        WHERE email = %s
    """, (data.email,))
    user = cursor.fetchone()

    # =========================
    # EXISTING USER → LOGIN
    # =========================
    if user:
        user_id, email, username, role, is_verified = user

        if not is_verified:
            raise HTTPException(status_code=403, detail="User not verified")

        access_token = create_access_token({
            "user_id": str(user_id),
            "email": email,
            "role": role
        })

        cursor.close()
        conn.close()

        return {
            "message": "Login successful",
            "access_token": access_token,   # ✅ FIX
            "token_type": "bearer",
            "email": email,
            "username": username,
            "role": role,
            "needs_registration": False
        }

    # =========================
    # NEW USER → REGISTER FLOW
    # =========================
    cursor.close()
    conn.close()

    return {
        "message": "New Google user. Please complete registration.",
        "email": data.email,
        "needs_registration": True
    }


# =======================
# Complete Google Registration (set username + password)
# =======================
class CompleteGoogleRegistrationSchema(BaseModel):
    email: str
    username: str
    password: str
    confirm_password: str
    role: str # radiologist or organization

@app.post("/complete-google-registration")
async def complete_google_registration(data: CompleteGoogleRegistrationSchema):
    if data.password != data.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")

    if data.role not in ["radiologist", "organization"]:
        raise HTTPException(status_code=400, detail="Role must be radiologist or organization")

    conn = get_conn()
    cursor = conn.cursor()

    # Check if user exists
    cursor.execute("SELECT email FROM core_schema.users WHERE email=%s", (data.email,))
    user = cursor.fetchone()

    # Hash password (truncate to 72 bytes for bcrypt)
    password_bytes = data.password.encode("utf-8")
    if len(password_bytes) > 72:
        password_bytes = password_bytes[:72]

    hashed_password = pwd_context.hash(password_bytes)

    if not user:
        # New Google user → INSERT
        user_id = str(uuid.uuid4())
        cursor.execute(
            """
            INSERT INTO core_schema.users (user_id, email, username, password, role, is_verified)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (user_id, data.email, data.username, hashed_password, data.role, True)
        )
    else:
        # Existing Google user → UPDATE
        cursor.execute(
            """
            UPDATE core_schema.users
            SET username=%s, password=%s, role=%s, is_verified=%s
            WHERE email=%s
            """,
            (data.username, hashed_password, data.role, True, data.email)
        )

    conn.commit()
    cursor.close()
    conn.close()

    return {"message": "Registration completed successfully"}


# =======================
# Dashboard Page
# =======================
@app.get("/dashboard")
def welcome(email: str):
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute("SELECT username, role FROM core_schema.users WHERE email=%s", (email,))
    user = cursor.fetchone()
    cursor.close()
    conn.close()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "message": f"Welcome {user[0]}!",
        "role": user[1]
    }



@app.post("/forgot-password")
async def forgot_password(data: dict):
    email = data.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")

    # Create DB connection
    conn = get_conn()
    cursor = conn.cursor()

    # Check user exists
    cursor.execute("SELECT email FROM core_schema.users WHERE email=%s", (email,))
    user = cursor.fetchone()

    if not user:
        cursor.close()
        conn.close()
        raise HTTPException(status_code=404, detail="Email not found")

    # Generate reset token
    token = str(uuid.uuid4())
    reset_link = f"http://localhost:3000/reset-password?token={token}"


    # Save token into DB
    expires = datetime.now(timezone.utc) + timedelta(minutes=10)


    cursor.execute(
        "UPDATE core_schema.users SET reset_token=%s, reset_token_expires=%s WHERE email=%s",
        (token, expires, email)
    )

    conn.commit()
    cursor.close()
    conn.close()

    # Send email
    send_email(
        to_email=email,
        subject="Password Reset",
        body=f"Click here to reset your password:\n{reset_link}"
    )

    return {"message": "Password reset link sent to email"}


# =======================
# Terms & Conditions
# =======================
@app.get("/terms-and-conditions")
def get_terms():
    terms_file = Path("terms.txt")  # path to your .txt file
    if terms_file.is_file():
        terms_text = terms_file.read_text(encoding="utf-8")
    else:
        terms_text = "Terms file not found."
    return {"terms": terms_text}





@app.post("/reset-password")
def reset_password(data: dict):
    token = data.get("token")
    new_password = data.get("password")
    confirm_password = data.get("confirm_password")

    if not token or not new_password or not confirm_password:
        raise HTTPException(status_code=400, detail="Token and passwords required")

    if new_password != confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")

    conn = get_conn()
    cursor = conn.cursor()

    # Verify token
    cursor.execute(
        "SELECT email FROM core_schema.users WHERE reset_token=%s",
        (token,)
    )
    user = cursor.fetchone()

    if not user:
        cursor.close()
        conn.close()
        raise HTTPException(status_code=400, detail="Invalid or expired token")

    email = user[0]

    hashed_password = pwd_context.hash(new_password)

    # Update password & clear token
    cursor.execute(
        """
        UPDATE core_schema.users
        SET password=%s,
            reset_token=NULL,
            reset_token_expires=NULL
        WHERE email=%s
        """,
        (hashed_password, email)
    )

    conn.commit()
    cursor.close()
    conn.close()

    return {"message": "Password reset successful"}



class ChangePasswordSchema(BaseModel):
    email: EmailStr
    old_password: str
    new_password: str
    confirm_password: str

class ChangeEmailSchema(BaseModel):
    email: EmailStr
    password: str
    new_email: EmailStr


@app.post("/change-password")
def change_password(data: ChangePasswordSchema):
    if data.new_password != data.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")

    conn = get_conn()
    cursor = conn.cursor()

    # Get current hashed password
    cursor.execute(
        "SELECT password FROM core_schema.users WHERE email=%s",
        (data.email,)
    )
    row = cursor.fetchone()
    if not row:
        cursor.close(); conn.close()
        raise HTTPException(status_code=404, detail="User not found")

    hashed = row[0]
    if not pwd_context.verify(data.old_password, hashed):
        cursor.close(); conn.close()
        raise HTTPException(status_code=400, detail="Old password is incorrect")

    # bcrypt safe: truncate to 72 bytes (you already do similar in google completion)
    pw_bytes = data.new_password.encode("utf-8")
    if len(pw_bytes) > 72:
        pw_bytes = pw_bytes[:72]
    new_hashed = pwd_context.hash(pw_bytes)

    cursor.execute(
        "UPDATE core_schema.users SET password=%s WHERE email=%s",
        (new_hashed, data.email)
    )
    conn.commit()
    cursor.close()
    conn.close()

    return {"message": "Password changed successfully"}


@app.post("/change-email")
def change_email(data: ChangeEmailSchema):
    conn = get_conn()
    cursor = conn.cursor()

    # Check user exists + password
    cursor.execute(
        "SELECT password FROM core_schema.users WHERE email=%s",
        (data.email,)
    )
    row = cursor.fetchone()
    if not row:
        cursor.close(); conn.close()
        raise HTTPException(status_code=404, detail="User not found")

    hashed = row[0]
    if not pwd_context.verify(data.password, hashed):
        cursor.close(); conn.close()
        raise HTTPException(status_code=400, detail="Password is incorrect")

    # Check new email already used
    cursor.execute(
        "SELECT 1 FROM core_schema.users WHERE email=%s",
        (str(data.new_email),)
    )
    if cursor.fetchone():
        cursor.close(); conn.close()
        raise HTTPException(status_code=400, detail="Email already exists")

    # Update email
    cursor.execute(
        "UPDATE core_schema.users SET email=%s WHERE email=%s",
        (str(data.new_email), data.email)
    )
    conn.commit()
    cursor.close()
    conn.close()

    return {"message": "Email changed successfully", "email": str(data.new_email)}
