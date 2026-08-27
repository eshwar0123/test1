from typing import List, Optional
from datetime import date, datetime
from uuid import UUID
from pydantic import BaseModel, EmailStr, Field


# =============================================================================
# ORGANIZATION PROFILE
# =============================================================================
class OrganizationProfileIn(BaseModel):
    organizationName: str
    legalName: Optional[str] = None
    website: str
    industry: Optional[str] = None
    organizationType: Optional[str] = None
    foundedYear: Optional[int] = None
    organizationSize: Optional[str] = None
    hqLocation: Optional[str] = None
    otherLocations: Optional[str] = None

    linkedIn: Optional[str] = None
    twitter: Optional[str] = None
    otherLink: Optional[str] = None

    aboutShort: Optional[str] = None
    aboutLong: Optional[str] = None
    mission: Optional[str] = None
    vision: Optional[str] = None
    values: Optional[str] = None
    cultureKeywords: Optional[str] = None

    logoUrl: Optional[str] = None

    hrName: Optional[str] = None
    hrEmail: Optional[EmailStr] = None
    hrPhone: Optional[str] = None
    workModel: Optional[str] = None
    workingHours: Optional[str] = None
    interviewProcess: Optional[str] = None
    benefits: Optional[str] = None

    registeredAddress: Optional[str] = None
    billingAddress: Optional[str] = None
    gstVat: Optional[str] = None
    registrationNo: Optional[str] = None
    taxId: Optional[str] = None


class OrganizationProfileOut(BaseModel):
    exists: bool
    organization_id: Optional[str] = None
    profile: Optional[OrganizationProfileIn] = None


# =============================================================================
# ✅ ORG PROFILE SAVE  (OrgSetupModal → POST /organization/org-profile)
# Matches the field names sent by the React modal (camelCase) so the router
# can map them straight into organization_schema.org_profile.
# - logo: full base64 data URL ("data:image/png;base64,iVBORw0KGgo...") or
#   empty string. Router decodes + saves to disk if provided.
# - email + orgName from the form are IGNORED on the backend; the actual
#   values are forced from core_schema.users so a tampered request can't
#   change them.
# =============================================================================
class OrgProfileSaveIn(BaseModel):
    orgName: Optional[str] = None       # ignored on backend; forced from users.username
    orgType: Optional[str] = None
    npi: Optional[str] = None
    ein: Optional[str] = None
    clia: Optional[str] = None
    website: Optional[str] = None
    email: Optional[str] = None         # ignored on backend; forced from users.email
    phone: Optional[str] = None
    fax: Optional[str] = None
    street: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip: Optional[str] = None
    country: Optional[str] = None
    adminName: Optional[str] = None
    adminEmail: Optional[str] = None
    adminPhone: Optional[str] = None
    adminRole: Optional[str] = None
    hipaaOfficerName: Optional[str] = None
    hipaaOfficerEmail: Optional[str] = None
    logo: Optional[str] = None          # base64 data URL or ""


# =============================================================================
# JOB ROLES
# =============================================================================
class RoleExperience(BaseModel):
    minYears: int = Field(ge=0)
    maxYears: int = Field(ge=0)


class RoleSkills(BaseModel):
    primary: List[str] = []
    secondary: List[str] = []


class RoleSalary(BaseModel):
    min: Optional[str] = None
    max: Optional[str] = None
    currency: Optional[str] = None
    negotiable: bool = True


class JobRoleCreate(BaseModel):
    roleId: Optional[UUID] = None
    roleCode: Optional[int] = None
    jobTitle: str
    department: str
    roleLevel: Optional[str] = None
    employmentType: str
    workMode: str
    location: str

    summary: str
    responsibilities: str
    requirements: str

    experience: RoleExperience
    skills: RoleSkills
    education: Optional[str] = None

    openings: int = 1
    urgency: Optional[str] = None
    expectedJoining: Optional[str] = None

    salary: RoleSalary
    status: str = "Draft"   # Draft | Published


# =============================================================================
# QUESTIONNAIRE
# =============================================================================
class QuestionnaireAnswerIn(BaseModel):
    questionNo: int
    questionText: str
    selectedOptionNo: int
    selectedOptionText: Optional[str] = None


class QuestionnaireSaveIn(BaseModel):
    roleId: UUID
    jobId: int
    completed: bool = True
    answers: List[QuestionnaireAnswerIn]


# =============================================================================
# UPLOADS  (new — Upload page)
# =============================================================================
class CaseRowIn(BaseModel):
    """A single case row, either from Excel preview or single-upload form."""
    case_id:        str
    patient_name:   Optional[str] = None
    age:            Optional[int] = None
    gender:         Optional[str] = None
    priority:       Optional[str] = None          # "STAT" | "Urgent" | "Routine"
    modality:       Optional[str] = None          # "CT" | "MRI" | "XRAY" | ...
    study_type:     Optional[str] = None          # free text, e.g. "Head w/o Contrast"
    study_date:     Optional[str] = None          # ISO string, parsed server-side
    file_name:      Optional[str] = None          # the unique key used to match images
    matched_files:  List[str] = []                # relative names from upload bag


class CaseRowOut(BaseModel):
    """What we return to the UI for each stored row."""
    id:                     int
    upload_id:              str
    case_id:                str
    patient_name:           Optional[str] = None
    age:                    Optional[int] = None
    gender:                 Optional[str] = None
    priority_type:          Optional[str] = None
    priority_type_id:       Optional[int] = None
    modality_type:          Optional[str] = None
    modality_type_id:       Optional[int] = None
    modality_study_type:    Optional[str] = None
    modality_study_type_id: Optional[int] = None
    study_date:             Optional[str] = None
    image_file_names:       List[str] = []
    uploaded_images_path:   Optional[str] = None
    uploaded_excel_file_path: Optional[str] = None
    subject_id:             Optional[str] = None
    uploaded_at:            Optional[str] = None


class CaseUpdateIn(BaseModel):
    """PUT /organization/uploads/{id} body."""
    patient_name:   Optional[str] = None
    age:            Optional[int] = None
    gender:         Optional[str] = None
    priority:       Optional[str] = None
    modality:       Optional[str] = None
    study_type:     Optional[str] = None
    study_date:     Optional[str] = None
    case_id:        Optional[str] = None
    removed_files:  List[str] = []
