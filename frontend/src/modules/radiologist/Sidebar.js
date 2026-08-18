import React, { useState, useEffect } from "react";
import {
  CSidebar,
  CSidebarBrand,
  CSidebarNav,
  CNavItem,
} from "@coreui/react";
import {
  CDropdown,
  CDropdownToggle,
  CDropdownMenu,
  CDropdownItem,
} from "@coreui/react";
import { cilChevronBottom, cilUser } from "@coreui/icons";



import "./Sidebar.css"; // ✅ ADD THIS

import CIcon from "@coreui/icons-react";
import { cilFolder, cilSettings, cilContact, cilDescription, cilNotes, cilSpeedometer } from "@coreui/icons";
import { NavLink } from "react-router-dom";
import logoLight from "/logo.png";
import logoDark from "/logo1.png";

const Sidebar = ({ visible }) => {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const el = document.querySelector('.radiology-app');
    if (!el) return;
    const check = () => setIsDark(el.classList.contains('dark'));
    check();
    const obs = new MutationObserver(check);
    obs.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  const logo = isDark ? logoDark : logoLight;

  return (
    <CSidebar
      visible={visible}
      className={`sidebar gp-sidebar ${visible ? "" : "is-collapsed"}`}
      unfoldable={false}
    >
      {/* ===== BRAND (TOP) ===== */}
      <CSidebarBrand className="sidebar-brand gp-brand">
      <img
            src={logo}
            alt="Logo"
            style={{
              height: "60px",
              width: "205px",
              marginLeft: '-15px',
              marginTop: '-10px',
              marginBottom:'1px'
            }}
          />
      </CSidebarBrand>
      <div className="logo-divider" />

      {/* ✅ Full height flex column */}
      <CSidebarNav className="sidebar-nav-flex gp-nav">

        {/* ===== MAIN NAV ===== */}
        <CNavItem>
          <NavLink
            to="/radiologist/dashboard"
            className={({ isActive }) => `gp-link ${isActive ? "active" : ""}`}
          >
            <CIcon icon={cilSpeedometer} className="gp-ic" />
            <span>Dashboard</span>
          </NavLink>
        </CNavItem>
        <CNavItem>
          <NavLink
            to="/radiologist/repository1"
            className={({ isActive }) => `gp-link ${isActive ? "active" : ""}`}
          >
            <CIcon icon={cilFolder} className="gp-ic" />
            <span>Repository</span>
          </NavLink>
        </CNavItem>

        {/* SETTINGS (dropdown inside sidebar) */}
        <CNavItem className="gp-settings-item">
          <button
            type="button"
            className={`gp-link gp-settings-btn ${settingsOpen ? "open" : ""}`}
            onClick={() => setSettingsOpen((s) => !s)}
          >
            <CIcon icon={cilSettings} className="gp-ic" />
            <span>Settings</span>
            <span className={`gp-chevron ${settingsOpen ? "rot" : ""}`}>▾</span>
          </button>

          {settingsOpen && (
            <div className="gp-submenu">
              <NavLink
                to="/radiologist/settings"
                className={({ isActive }) => `gp-link ${isActive ? "active" : ""}`}
              >
                <CIcon icon={cilSettings} className="gp-ic" />
                <span>General Settings</span>
              </NavLink>

              <NavLink
                to="/radiologist/profile"
                className={({ isActive }) => `gp-link ${isActive ? "active" : ""}`}
              >
                <CIcon icon={cilUser} className="gp-ic" />
                <span>Profile</span>
              </NavLink>

              <NavLink
                to="/radiologist/accounts"
                className={({ isActive }) => `gp-link ${isActive ? "active" : ""}`}
              >
                <CIcon icon={cilContact} className="gp-ic" />
                <span>Account</span>
              </NavLink>
            </div>
          )}
        </CNavItem>


        {/* ✅ Spacer pushes footer to bottom */}
        <div className="sidebar-spacer" />

        {/* ===== FOOTER (LIKE LOMA) ===== */}
        <div className="gp-footer">
          <div className="gp-footer-divider" />

          <NavLink
            to="/radiologist/help"
            className={({ isActive }) => `gp-foot-link ${isActive ? "active" : ""}`}
          >
            <CIcon icon={cilContact} className="gp-ic" />
            <span>Help</span>
          </NavLink>

          <NavLink
            to="/radiologist/privacy"
            className={({ isActive }) => `gp-foot-link ${isActive ? "active" : ""}`}
          >
            <CIcon icon={cilDescription} className="gp-ic" />
            <span>Privacy Policy</span>
          </NavLink>

          <NavLink
            to="/radiologist/terms"
            className={({ isActive }) => `gp-foot-link ${isActive ? "active" : ""}`}
          >
            <CIcon icon={cilNotes} className="gp-ic" />
            <span>Terms & Conditions</span>
          </NavLink>

          <div className="gp-version">Version: v1.0.0</div>
        </div>
      </CSidebarNav>
    </CSidebar>
  );
};

export default Sidebar;
