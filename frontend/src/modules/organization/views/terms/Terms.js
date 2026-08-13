import { useNavigate } from "react-router-dom";
import "../help/Help.css";

export default function Terms() {
  const navigate = useNavigate();

  return (
    <div className="org-info-page">
      <div className="org-info-inner">

        {/* Header row: hero + back */}
        <div className="org-info-header-row">
          <div className="org-info-hero">
            <div className="org-info-hero-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
            </div>
            <div>
              <h1>Terms &amp; Conditions</h1>
              <p>Please read these terms carefully before using the platform.</p>
            </div>
          </div>
          <button className="org-info-back-btn" onClick={() => navigate(-1)}>Back</button>
        </div>

        <div className="org-info-body">

          <div className="org-info-card">
            <p className="org-info-lead">
              By using this radiology platform, you agree to follow clinical and organizational policies,
              protect patient confidentiality, and use the system only for authorized cases.
            </p>
          </div>

          {/* Acceptable Use */}
          <section className="org-info-section">
            <h2>Acceptable Use</h2>
            <ul className="org-info-policy-list">
              <li>Use the platform only for clinical cases assigned/authorized by your organization</li>
              <li>Ensure reports are accurate and created responsibly</li>
              <li>Do not attempt to bypass security or access other organizations' cases</li>
            </ul>
          </section>

          {/* Confidentiality */}
          <section className="org-info-section">
            <h2>Confidentiality</h2>
            <ul className="org-info-policy-list">
              <li>No unauthorized download, sharing, or redistribution of images/reports</li>
              <li>Follow your hospital/organization SOP and local regulations</li>
              <li>Do not share screenshots or patient data through personal channels</li>
            </ul>
          </section>

          {/* Account & Access */}
          <section className="org-info-section">
            <h2>Account &amp; Access</h2>
            <ul className="org-info-policy-list">
              <li>You are responsible for maintaining the confidentiality of your login credentials</li>
              <li>Misuse may lead to access removal or account suspension</li>
              <li>Admins can update permissions based on role and organization</li>
            </ul>
          </section>

          <div className="org-info-warning">
            If you do not agree to these terms, do not use the platform.
          </div>

        </div>
      </div>
    </div>
  );
}
