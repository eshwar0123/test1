import React from "react";
import { CCard, CCardBody, CCardHeader, CRow, CCol } from "@coreui/react";

export default function Help() {
  return (
    <CCard>
      <CCardHeader>
        <b>Help & Support</b>
      </CCardHeader>
      <CCardBody style={{ lineHeight: 1.7 }}>
        <p>
          This radiology platform enables organizations to upload imaging studies
          (CT, MRI, X-Ray, etc.) and allows doctors to review scans, generate reports,
          and provide structured clinical feedback securely.
        </p>

        <h6 className="mt-4"><b>Common Issues</b></h6>
        <ul>
          <li>DICOM series not loading – verify full series upload.</li>
          <li>NIfTI file not opening – confirm valid .nii / .nii.gz format.</li>
          <li>Thumbnail missing – refresh repository.</li>
          <li>Report submission error – check required fields.</li>
        </ul>

        <h6 className="mt-4"><b>Clinical Workflow</b></h6>
        <ul>
          <li>Organization uploads scan → Case appears in Repository</li>
          <li>Doctor opens Viewer → Reviews slices</li>
          <li>Doctor generates report → Submits findings</li>
          <li>Organization receives report & feedback</li>
        </ul>

        <hr className="my-4" />

        <h6><b>Contact Support</b></h6>
        <CRow className="mt-3">
          <CCol md={6}>
            <p><b>Email:</b></p>
            <p style={{ fontSize: "15px" }}>support@genphase.ai</p>
          </CCol>
          <CCol md={6}>
            <p><b>Support Number:</b></p>
            <p style={{ fontSize: "15px" }}>+91 98765 43210</p>
          </CCol>
        </CRow>
        <p className="mt-3 mb-0">
          For urgent clinical or system issues, please contact your organization administrator.
        </p>
      </CCardBody>
    </CCard>
  );
}
