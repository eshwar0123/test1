from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional


# =======================
# Registration (No OTP)
# =======================
class RegisterSchema(BaseModel):
    email: EmailStr
    username: str
    password: str
    role: str  # radiologist or organization
   

# =======================
# OTP Verification
# =======================
class VerifyOTPSchema(BaseModel):
    email: EmailStr
    otp: str

# =======================
# Standard Login
# =======================
class LoginSchema(BaseModel):
    email: str
    password: str
  


# =======================
# Complete Google Registration
# =======================
class CompleteGoogleRegistrationSchema(BaseModel):
    email: EmailStr
    username: str
    password: str
    confirm_password: str

# =======================
# Google Login Data
# =======================
class GoogleLoginSchema(BaseModel):
    email: EmailStr
    name: str
    role: str  # radiologist / organization


# # =======================
# # UPDATE PROFILE (VERY IMPORTANT)
# # =======================
# class UpdateProfileSchema(BaseModel):
#     first_name: Optional[str] = None
#     last_name: Optional[str] = None
#     qualification: Optional[str] = None

#     # remove spaces & avoid empty string overwrite
#     @field_validator("first_name", "last_name", "qualification")
#     @classmethod
#     def clean_text(cls, v):
#         if v is None:
#             return None
#         v = v.strip()
#         return v if v else None
