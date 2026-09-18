import { NavLink } from "react-router-dom";
import "./AppFooter.css";

export default function AppFooter() {
  return (
    <footer className="org-footer">
      <div className="org-footer-inner">
        <span className="org-footer-version">Version: v1.0.0</span>

        <nav className="org-footer-nav">
          <NavLink to="/organization/help" className="org-footer-link">Help</NavLink>
          <span className="org-footer-sep">&middot;</span>
          <NavLink to="/organization/privacy" className="org-footer-link">Privacy Policy</NavLink>
          <span className="org-footer-sep">&middot;</span>
          <NavLink to="/organization/terms" className="org-footer-link">Terms &amp; Conditions</NavLink>
        </nav>

        <span className="org-footer-copy">&copy; 2026 GenPhase AI Inc. All rights reserved.</span>
      </div>
    </footer>
  );
}
