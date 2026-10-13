from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Float
from sqlalchemy.orm import relationship
from database import Base


class Patient(Base):
    __tablename__ = "patients"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(String, unique=True, index=True, nullable=False)
    patient_name = Column(String, nullable=True)
    age = Column(Integer, nullable=True)
    gender = Column(String, nullable=True)
    study_date = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    images = relationship("ImageFile", back_populates="patient", cascade="all, delete-orphan")


class ImageFile(Base):
    __tablename__ = "image_files"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(String, ForeignKey("patients.case_id"), nullable=False, index=True)
    image_name = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    file_type = Column(String, nullable=True)
    file_size = Column(Float, nullable=True)
    modality = Column(String, nullable=True)
    series_description = Column(String, nullable=True)
    image_shape = Column(String, nullable=True)
    upload_status = Column(String, default="success")
    error_message = Column(Text, nullable=True)
    uploaded_at = Column(DateTime, default=datetime.utcnow)

    patient = relationship("Patient", back_populates="images")
