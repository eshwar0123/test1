# radiology/schemas.py
from pydantic import BaseModel, Field
from typing import Optional, Literal, Any, Dict, List
from uuid import UUID
from datetime import datetime

ScanType = Literal["MRI", "CT", "XRAY", "PET", "ULTRASOUND"]
AnnotationType = Literal["box", "free", "line", "circle", "arrow"]
AnnotationVisibility = Literal["mine", "everybody", "user", "others"]


class RadiologistOut(BaseModel):
    user_id: UUID
    first_name: str
    last_name: str
    email: Optional[str] = None
    qualification: str = ""
    verification_status: str = "not_submitted"
    profile_image_path: Optional[str] = None
    degree_path: Optional[str] = None
    signature_path: Optional[str] = None
    designation: Optional[str] = ""
    user_lab_name: Optional[str] = ""
    lab_address: Optional[str] = ""
    department: Optional[str] = ""
    lab_logo_url: Optional[str] = ""


class ScanCreate(BaseModel):
    case_id: str = Field(..., max_length=50)
    user_id: UUID
    scan_type: ScanType
    file_path: str
    thumbnail_path: Optional[str] = None

    patient_name: Optional[str] = None
    patient_sex: Optional[str] = None
    patient_age: Optional[int] = None

    ref_organisation: Optional[str] = None
    org_logo_url: Optional[str] = None
    id_organisation: Optional[UUID] = None


class ScanOut(BaseModel):
    scan_id: int
    case_id: str
    user_id: UUID
    scan_type: ScanType
    scan_date: datetime
    file_path: str
    thumbnail_path: Optional[str] = None

    patient_name: Optional[str] = None
    patient_sex: Optional[str] = None
    patient_age: Optional[int] = None

    ref_organisation: Optional[str] = None
    org_logo_url: Optional[str] = None
    id_organisation: Optional[UUID] = None


# -----------------------------
# Reports
# -----------------------------
class ReportOut(BaseModel):
    report_id: UUID
    case_id: str
    user_id: UUID

    patient_name: Optional[str] = None
    patient_age: Optional[int] = None
    patient_sex: Optional[str] = None

    referring_doctor: Optional[str] = None
    scan_datetime: Optional[datetime] = None
    clinical_indication: Optional[str] = None

    technique: Optional[str] = None
    findings: Optional[str] = None
    impression: Optional[str] = None
    opinions: Optional[str] = None

    radiologist_name: Optional[str] = None
    qualification: Optional[str] = None
    designation: Optional[str] = None

    user_lab_name: Optional[str] = None
    lab_address: Optional[str] = None
    department: Optional[str] = None
    lab_logo_url: Optional[str] = None

    created_at: datetime
    updated_at: datetime


class ReportUpsertIn(BaseModel):
    case_id: str = Field(..., max_length=50)
    user_id: UUID
    referring_doctor: Optional[str] = None
    scan_datetime: Optional[datetime] = None
    clinical_indication: Optional[str] = None
    technique: Optional[str] = None
    findings: Optional[str] = None
    impression: Optional[str] = None
    opinions: Optional[str] = None




# -----------------------------
# Report Export (PDF/HTML saved copy)
# -----------------------------
class ReportExportIn(BaseModel):
    case_id: str = Field(..., max_length=50)
    user_id: UUID
    report_html: str  # full HTML used for printing (stored for audit/reprint)
    report_format: str = Field("pdf", max_length=10)  # pdf/png/html
    file_base64: str  # base64-encoded file bytes (PDF)

class ReportExportOut(BaseModel):
    case_id: str
    user_id: UUID
    report_file_url: str
    exported_at: datetime

# -----------------------------
# Annotations
# -----------------------------
class AnnotationOut(BaseModel):
    annotation_id: UUID
    case_id: str
    user_id: UUID
    annotation_type: AnnotationType
    visibility: AnnotationVisibility
    title: Optional[str] = None
    comments: Optional[str] = None
    tool_data: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class AnnotationCreateIn(BaseModel):
    case_id: str = Field(..., max_length=50)
    user_id: UUID
    annotation_type: AnnotationType
    visibility: AnnotationVisibility = "mine"
    title: Optional[str] = None
    comments: Optional[str] = None
    tool_data: Dict[str, Any] = Field(default_factory=dict)


# -----------------------------
# Live Chat
# -----------------------------
class ChatOut(BaseModel):
    chat_id: UUID
    case_id: str
    user_id: UUID
    message: str
    sent_at: datetime
    is_edited: bool = False
    is_deleted: bool = False


class ChatCreateIn(BaseModel):
    case_id: str = Field(..., max_length=50)
    user_id: UUID
    message: str = Field(..., min_length=1)
