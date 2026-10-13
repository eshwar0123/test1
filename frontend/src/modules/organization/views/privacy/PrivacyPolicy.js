import { useNavigate } from "react-router-dom";
import "../help/Help.css";

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <div className="org-info-page">
      <div className="org-info-inner">

        {/* Header row: hero + back */}
        <div className="org-info-header-row">
          <div className="org-info-hero">
            <div className="org-info-hero-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <div>
              <h1>Privacy Policy</h1>
              <p>How we handle and protect your data on this platform.</p>
            </div>
          </div>
          <button className="org-info-back-btn" onClick={() => navigate(-1)}>Back</button>
        </div>

        <div className="org-info-body">

          <div className="org-info-card">
            <p className="org-info-lead">
              This platform handles medical imaging and case-related information for clinical workflow.
              We aim to protect patient confidentiality and ensure secure access for authorized users only.
            </p>
          </div>

          {/* What We Process */}
          <section className="org-info-section">
            <h2>What Data We Process</h2>
            <ul className="org-info-policy-list">
              <li>Medical images (CT, MRI, XRAY, etc.) in formats like DICOM or NIfTI</li>
              <li>Case metadata (Case ID, scan date, modality/type)</li>
              <li>Limited patient identifiers (only what your organization provides)</li>
              <li>Reporting content (findings, impression, notes)</li>
            </ul>
          </section>

          {/* Security */}
          <section className="org-info-section">
            <h2>Security &amp; Access</h2>
            <ul className="org-info-policy-list">
              <li>Role-based access (Organization / Doctor / Admin)</li>
              <li>Audit logs may be maintained for access and actions (view/report)</li>
              <li>Uploads are stored securely on the server and are not shared publicly</li>
              <li>Session and authentication controls protect unauthorized access</li>
            </ul>
          </section>

          {/* Sharing & Retention */}
          <section className="org-info-section">
            <h2>Sharing &amp; Retention</h2>
            <ul className="org-info-policy-list">
              <li>No sharing of cases without appropriate authorization</li>
              <li>Data retention follows organization policy / contract requirements</li>
              <li>Reports and feedback are visible only to relevant authorized users</li>
            </ul>
          </section>

          <div className="org-info-warning">
            If you believe there is a privacy issue, contact your Admin/Support team immediately.
          </div>

        </div>
      </div>
    </div>
  );
}
