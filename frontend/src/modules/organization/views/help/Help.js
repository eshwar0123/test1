import { useNavigate } from "react-router-dom";
import "./Help.css";

export default function Help() {
  const navigate = useNavigate();

  return (
    <div className="org-info-page">
      <div className="org-info-inner">

        {/* Header row: hero + back */}
        <div className="org-info-header-row">
          <div className="org-info-hero">
            <div className="org-info-hero-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <div>
              <h1>Help &amp; Support</h1>
              <p>Everything you need to use the platform effectively.</p>
            </div>
          </div>
          <button className="org-info-back-btn" onClick={() => navigate(-1)}>Back</button>
        </div>

        <div className="org-info-body">

          {/* About */}
          <div className="org-info-card">
            <p className="org-info-lead">
              This radiology platform enables organizations to upload imaging studies (CT, MRI, X-Ray, etc.)
              and allows doctors to review scans, generate reports, and provide structured clinical feedback securely.
            </p>
          </div>

          {/* Common Issues */}
          <section className="org-info-section">
            <h2>Common Issues</h2>
            <div className="org-info-issue-list">
              {[
                { icon: "⚠️", title: "DICOM series not loading", fix: "Verify full series upload." },
                { icon: "⚠️", title: "NIfTI file not opening", fix: "Confirm valid .nii / .nii.gz format." },
                { icon: "⚠️", title: "Thumbnail missing", fix: "Refresh repository." },
                { icon: "⚠️", title: "Report submission error", fix: "Check required fields." },
              ].map((item) => (
                <div key={item.title} className="org-info-issue-item">
                  <span className="org-info-issue-icon">{item.icon}</span>
                  <div>
                    <div className="org-info-issue-title">{item.title}</div>
                    <div className="org-info-issue-fix">{item.fix}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Clinical Workflow */}
          <section className="org-info-section">
            <h2>Clinical Workflow</h2>
            <div className="org-info-flow">
              {[
                { step: "1", label: "Organization uploads scan", sub: "Case appears in Repository" },
                { step: "2", label: "Doctor opens Viewer", sub: "Reviews slices" },
                { step: "3", label: "Doctor generates report", sub: "Submits findings" },
                { step: "4", label: "Organization receives report", sub: "Reviews report & feedback" },
              ].map((item, idx, arr) => (
                <div key={item.step} className="org-info-flow-row">
                  <div className="org-info-flow-item">
                    <div className="org-info-flow-step">{item.step}</div>
                    <div>
                      <div className="org-info-flow-label">{item.label}</div>
                      <div className="org-info-flow-sub">{item.sub}</div>
                    </div>
                  </div>
                  {idx < arr.length - 1 && <div className="org-info-flow-arrow">↓</div>}
                </div>
              ))}
            </div>
          </section>

          {/* Contact */}
          <section className="org-info-section">
            <h2>Contact Support</h2>
            <div className="org-info-contact-grid">
              <div className="org-info-contact-card">
                <div className="org-info-contact-label">Email</div>
                <a href="mailto:support@genphase.ai" className="org-info-contact-value">support@genphase.ai</a>
              </div>
              <div className="org-info-contact-card">
                <div className="org-info-contact-label">Support Number</div>
                <a href="tel:+919876543210" className="org-info-contact-value">+91 98765 43210</a>
              </div>
            </div>
            <div className="org-info-note">
              For urgent clinical or system issues, please contact your organization administrator.
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
