import { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  cilSpeedometer,
  cilSettings,
  cilDescription,
  cilNotes,
  cilTask,
  cilUser,
  cilContact,
  cilBriefcase,
} from "@coreui/icons";
import CIcon from "@coreui/icons-react";
import logoDark from "/logo.png";

const GAP = 10;
const SIDEBAR_WIDTH = 158;
const ACCENT = "#2563eb";
const TEXT = "#374151";
const TEXT_MUTED = "#9ca3af";
const LABEL = "#c5ccd8";
const BG = "#ffffff";
const ACTIVE_BG = "#eff6ff";
const HOVER_BG = "#f5f7fa";
const BORDER = "#e5e7eb";

const navLinkStyle = ({ isActive }) => ({
  display: "flex",
  alignItems: "center",
  gap: "10px",
  padding: "7px 12px",
  borderRadius: "6px",
  color: isActive ? ACCENT : TEXT,
  textDecoration: "none",
  fontSize: "13.5px",
  fontWeight: isActive ? 600 : 400,
  background: isActive ? ACTIVE_BG : "transparent",
  transition: "background 0.13s, color 0.13s",
  minHeight: "34px",
  boxSizing: "border-box",
});

const subLinkStyle = ({ isActive }) => ({
  display: "flex",
  alignItems: "center",
  gap: "9px",
  padding: "6px 12px 6px 34px",
  borderRadius: "6px",
  color: isActive ? ACCENT : TEXT,
  textDecoration: "none",
  fontSize: "13px",
  fontWeight: isActive ? 600 : 400,
  background: isActive ? ACTIVE_BG : "transparent",
  transition: "background 0.13s, color 0.13s",
  minHeight: "30px",
  boxSizing: "border-box",
});

const sectionLabel = {
  fontSize: "10px",
  fontWeight: 700,
  letterSpacing: "0.09em",
  color: LABEL,
  textTransform: "uppercase",
  padding: "0 0 4px 12px",
  display: "block",
};

export default function AppSidebar({ visible = true }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  if (!visible) return null;

  return (
    /* Outer wrapper — provides the gap from all edges */
    <div
      style={{
        position: "fixed",
        left: `${GAP}px`,
        top: `${GAP}px`,
        bottom: `${GAP}px`,
        width: `${SIDEBAR_WIDTH}px`,
        zIndex: 1300,
      }}
    >
      <aside
        style={{
          width: "100%",
          height: "100%",
          background: BG,
          color: TEXT,
          display: "flex",
          flexDirection: "column",
          borderRadius: "12px",
          border: `1px solid ${BORDER}`,
          boxShadow: "0 2px 12px rgba(0,0,0,0.07)",
          overflow: "hidden",
        }}
      >
        {/* Logo */}
        <div
          style={{
            padding: "0 18px",
            height: "58px",
            minHeight: "58px",
            display: "flex",
            alignItems: "center",
            borderBottom: `1px solid ${BORDER}`,
          }}
        >
          <img
            src={logoDark}
            alt="ONIX AI"
            style={{ width: "120px", height: "auto", objectFit: "contain", display: "block" }}
          />
        </div>

        {/* Nav items */}
        <div
          style={{
            padding: "14px 8px 8px",
            display: "flex",
            flexDirection: "column",
            gap: "1px",
            flex: 1,
            overflowY: "auto",
          }}
        >
          <span style={sectionLabel}>Main</span>

          <NavLink to="/admin/dashboard" style={navLinkStyle}>
            <CIcon icon={cilSpeedometer} style={{ width: 16, height: 16, flexShrink: 0, color: TEXT_MUTED }} />
            <span>Dashboard</span>
          </NavLink>
          <NavLink to="/admin/organizations" style={navLinkStyle}>
            <CIcon icon={cilBriefcase} style={{ width: 16, height: 16, flexShrink: 0, color: TEXT_MUTED }} />
            <span>Organisations</span>
          </NavLink>
          <NavLink to="/admin/radiologists" style={navLinkStyle}>
            <CIcon icon={cilContact} style={{ width: 16, height: 16, flexShrink: 0, color: TEXT_MUTED }} />
            <span>Radiologists</span>
          </NavLink>
          <NavLink to="/admin/auto-assign" style={navLinkStyle}>
            <CIcon icon={cilTask} style={{ width: 16, height: 16, flexShrink: 0, color: TEXT_MUTED }} />
            <span>Auto Assign</span>
          </NavLink>

          {/* Settings section */}
          <div style={{ marginTop: "14px" }}>
            <span style={sectionLabel}>Account</span>

            <button
              type="button"
              onClick={() => setSettingsOpen((s) => !s)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "7px 12px",
                borderRadius: "6px",
                color: TEXT,
                background: "transparent",
                border: "none",
                width: "100%",
                cursor: "pointer",
                fontSize: "13.5px",
                fontWeight: 400,
                minHeight: "34px",
                boxSizing: "border-box",
                justifyContent: "space-between",
                transition: "background 0.13s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = HOVER_BG; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <CIcon icon={cilSettings} style={{ width: 16, height: 16, flexShrink: 0, color: TEXT_MUTED }} />
                <span>Settings</span>
              </span>
              <span
                style={{
                  fontSize: 10,
                  transition: "transform 0.2s",
                  display: "inline-block",
                  transform: settingsOpen ? "rotate(180deg)" : "rotate(0deg)",
                  color: TEXT_MUTED,
                }}
              >
                ▾
              </span>
            </button>

            {settingsOpen && (
              <div style={{ display: "flex", flexDirection: "column", gap: 1, marginTop: 1 }}>
                <NavLink to="/admin/profile" style={subLinkStyle}>
                  <CIcon icon={cilUser} style={{ width: 14, height: 14, flexShrink: 0, color: TEXT_MUTED }} />
                  <span>Profile</span>
                </NavLink>
                <NavLink to="/admin/accounts" style={subLinkStyle}>
                  <CIcon icon={cilBriefcase} style={{ width: 14, height: 14, flexShrink: 0, color: TEXT_MUTED }} />
                  <span>Account</span>
                </NavLink>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "10px 8px",
            borderTop: `1px solid ${BORDER}`,
            display: "flex",
            flexDirection: "column",
            gap: "1px",
          }}
        >
          {[
            { to: "/admin/help",           icon: cilDescription, label: "Help" },
            { to: "/admin/privacy-policy", icon: cilDescription, label: "Privacy Policy" },
            { to: "/admin/terms",          icon: cilNotes,        label: "Terms & Conditions" },
          ].map(({ to, icon, label }) => (
            <NavLink
              key={to}
              to={to}
              style={({ isActive }) => ({
                display: "flex",
                alignItems: "center",
                gap: "7px",
                padding: "5px 12px",
                borderRadius: "5px",
                color: isActive ? ACCENT : TEXT_MUTED,
                textDecoration: "none",
                fontSize: "12px",
                fontWeight: isActive ? 600 : 400,
                background: isActive ? ACTIVE_BG : "transparent",
                transition: "background 0.13s, color 0.13s",
              })}
            >
              <CIcon icon={icon} style={{ width: 12, height: 12, flexShrink: 0 }} />
              <span>{label}</span>
            </NavLink>
          ))}
          <div style={{ marginTop: "6px", fontSize: "11px", color: LABEL, paddingLeft: "12px" }}>
            v1.0.0
          </div>
        </div>
      </aside>
    </div>
  );
}
