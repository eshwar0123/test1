import React from "react";
import { CCard, CCardBody, CCardHeader, CAlert } from "@coreui/react";

export default function PrivacyPage() {
  return (
    <CCard>
      <CCardHeader>
        <b>Privacy Policy</b>
      </CCardHeader>

      <CCardBody style={{ lineHeight: 1.7 }}>
        <p>
          This platform handles medical imaging and case-related information for clinical workflow.
          We aim to protect patient confidentiality and ensure secure access for authorized users only.
        </p>

       

        <h6 className="mt-4"><b>What Data We Process</b></h6>
        <ul>
          <li>Medical images (CT, MRI, XRAY, etc.) in formats like DICOM or NIfTI</li>
          <li>Case metadata (Case ID, scan date, modality/type)</li>
          <li>Limited patient identifiers (only what your organization provides)</li>
          <li>Reporting content (findings, impression, notes)</li>
        </ul>

        <h6 className="mt-4"><b>Security & Access</b></h6>
        <ul>
          <li><b>Role-based access</b> (Organization / Doctor / Admin)</li>
          <li><b>Audit logs</b> may be maintained for access and actions (view/report)</li>
          <li>Uploads are stored securely on the server and are not shared publicly</li>
          <li>Session and authentication controls protect unauthorized access</li>
        </ul>

        <h6 className="mt-4"><b>Sharing & Retention</b></h6>
        <ul>
          <li>No sharing of cases without appropriate authorization</li>
          <li>Data retention follows organization policy / contract requirements</li>
          <li>Reports and feedback are visible only to relevant authorized users</li>
        </ul>

        <p className="mb-0">
          If you believe there is a privacy issue, contact your Admin/Support team immediately.
        </p>
      </CCardBody>
    </CCard>
  );
}
