import React from "react";
import { CCard, CCardBody, CCardHeader } from "@coreui/react";

export default function PrivacyPolicy() {
  return (
    <CCard>
      <CCardHeader>
        <b>Privacy Policy</b>
      </CCardHeader>
      <CCardBody style={{ lineHeight: 1.7 }}>
        <p>
          We are committed to protecting the privacy of all users and patients on this platform.
          This policy explains how data is collected, used, and protected.
        </p>

        <h6 className="mt-4"><b>Data Collection</b></h6>
        <ul>
          <li>We collect only the information necessary to operate the platform (name, email, role)</li>
          <li>Patient imaging data is stored securely and accessed only by authorized personnel</li>
          <li>Login activity and access logs are maintained for security purposes</li>
        </ul>

        <h6 className="mt-4"><b>Data Usage</b></h6>
        <ul>
          <li>Patient data is used solely for clinical review and reporting</li>
          <li>No patient data is shared with third parties without explicit consent</li>
          <li>Aggregated, anonymized data may be used to improve platform performance</li>
        </ul>

        <h6 className="mt-4"><b>Data Security</b></h6>
        <ul>
          <li>All data is encrypted in transit and at rest</li>
          <li>Access is role-based — radiologists see only their assigned cases</li>
          <li>Admins have audit access but cannot modify clinical reports</li>
        </ul>

        <h6 className="mt-4"><b>Your Rights</b></h6>
        <ul>
          <li>You may request access to or deletion of your account data</li>
          <li>Contact support to raise a data-related concern</li>
        </ul>

        <hr className="my-4" />
        <p className="mb-0">
          For privacy concerns, contact us at <b>privacy@genphase.ai</b>
        </p>
      </CCardBody>
    </CCard>
  );
}
