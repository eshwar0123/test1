import React from "react";
import { CCard, CCardBody, CCardHeader } from "@coreui/react";

export default function TermsConditions() {
  return (
    <CCard>
      <CCardHeader>
        <b>Terms & Conditions</b>
      </CCardHeader>
      <CCardBody style={{ lineHeight: 1.7 }}>
        <p>
          By using this radiology platform, you agree to follow clinical and organizational policies,
          protect patient confidentiality, and use the system only for authorized cases.
        </p>

        <h6 className="mt-4"><b>Acceptable Use</b></h6>
        <ul>
          <li>Use the platform only for clinical cases assigned/authorized by your organization</li>
          <li>Ensure reports are accurate and created responsibly</li>
          <li>Do not attempt to bypass security or access other organizations' cases</li>
        </ul>

        <h6 className="mt-4"><b>Confidentiality</b></h6>
        <ul>
          <li>No unauthorized download, sharing, or redistribution of images/reports</li>
          <li>Follow your hospital/organization SOP and local regulations</li>
          <li>Do not share screenshots or patient data through personal channels</li>
        </ul>

        <h6 className="mt-4"><b>Account & Access</b></h6>
        <ul>
          <li>You are responsible for maintaining the confidentiality of your login credentials</li>
          <li>Misuse may lead to access removal or account suspension</li>
          <li>Admins can update permissions based on role and organization</li>
        </ul>

        <p className="mb-0">
          If you do not agree to these terms, do not use the platform.
        </p>
      </CCardBody>
    </CCard>
  );
}
