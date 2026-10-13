import React from "react";
import ReactDOM from "react-dom";
import { useNavigate } from "react-router-dom";
import "./Footer.css";

const Footer = () => {
  const navigate = useNavigate();

  const footer = (
    <footer className="app-footer">
      <div className="footer-inner">
        <span className="footer-version">Version: v1.0.0</span>
        <div className="footer-links">
          <span className="footer-link" onClick={() => navigate("/radiologist/help")}>Help</span>
          <span className="footer-sep">·</span>
          <span className="footer-link" onClick={() => navigate("/radiologist/privacy")}>Privacy Policy</span>
          <span className="footer-sep">·</span>
          <span className="footer-link" onClick={() => navigate("/radiologist/terms")}>Terms &amp; Conditions</span>
          <span className="footer-sep">·</span>
          <span className="footer-link" onClick={() => navigate("/radiologist/docs")}>Docs</span>
        </div>
        <span className="footer-copy">© 2026 GenPhase AI Inc. All rights reserved.</span>
      </div>
    </footer>
  );

  return ReactDOM.createPortal(footer, document.body);
};

export default Footer;
