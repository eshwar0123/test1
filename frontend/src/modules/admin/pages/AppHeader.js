import React, { useEffect, useRef, useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import {
  CDropdown,
  CDropdownToggle,
  CDropdownMenu,
  CDropdownItem,
} from "@coreui/react";
import CIcon from "@coreui/icons-react";
import { cilUser, cilAccountLogout, cilBell, cilSun, cilMoon, cilSettings } from "@coreui/icons";

import logoDark from "/logo.png";
import logoLight from "/logo1.png";
import { useTheme } from "../layout/ThemeContext";
import GoogleTranslateSwitcher from "../../../shared/components/GoogleTranslateSwitcher";

const SAMPLE_NOTIFICATIONS = [
  {
    id: 1, icon: "📋", type: "Assigned", title: "Case Assigned",
    text: "Patient John D. — Chest CT scan assigned to Dr. Ravi Kumar.", time: "2 min ago", read: false,
    details: { "Case ID": "CASE-1058", "Patient": "John D.", "Scan Type": "Chest CT", "Assigned To": "Dr. Ravi Kumar", "Study Date": "2026-03-24", "Priority": "High", "Status": "Assigned", "Notes": "Patient has history of pulmonary fibrosis. Please review with prior scans." },
  },
  {
    id: 2, icon: "↺", type: "Reassigned", title: "Rejected Cases Reassigned",
    text: "3 rejected cases have been reassigned to available radiologists.", time: "10 min ago", read: false,
    details: { "Total Reassigned": "3", "Cases": "CASE-1041, CASE-1043, CASE-1047", "Reason": "Original radiologist unavailable", "Reassigned To": "Dr. Priya Menon, Dr. Arjun Seth", "Reassigned At": "2026-03-24 10:45 AM", "Status": "Pending Review" },
  },
  {
    id: 3, icon: "✅", type: "Completed", title: "Report Completed",
    text: "Dr. Smith has completed the report for Case #1042.", time: "15 min ago", read: false,
    details: { "Case ID": "CASE-1042", "Patient": "Maria L.", "Radiologist": "Dr. Smith", "Scan Type": "Brain MRI", "Completed At": "2026-03-24 10:32 AM", "Findings": "No acute intracranial abnormality detected.", "Status": "Reported" },
  },
  {
    id: 4, icon: "📁", type: "Upload", title: "Bulk Upload Completed",
    text: "12 cases added successfully via bulk upload.", time: "1 hr ago", read: true,
    details: { "Total Cases": "12", "Uploaded By": "Admin", "Uploaded At": "2026-03-24 09:15 AM", "Scan Types": "CT (7), MRI (3), X-Ray (2)", "Status": "Ready for Assignment" },
  },
];

const NAV_LINKS = [
  { to: "/admin/dashboard",     label: "Dashboard" },
  { to: "/admin/organizations", label: "Organisations" },
  { to: "/admin/radiologists",  label: "Radiologists" },
  { to: "/admin/auto-assign",   label: "Auto Assign" },
];


const ACCENT = "#2563eb";

export default function AppHeader() {
  const navigate = useNavigate();

  const auth = (() => { try { return JSON.parse(localStorage.getItem("auth") || "null"); } catch { return null; } })();
  const name = auth?.username || auth?.name || "Admin";
  const initials = name.slice(0, 2).toUpperCase();

  const { isDark, toggle: toggleTheme } = useTheme();
  const [avatarUrl, setAvatarUrl] = useState(localStorage.getItem("adminAvatarUrl") || "");
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState(SAMPLE_NOTIFICATIONS);
  const [selectedNotif, setSelectedNotif] = useState(null);
  const notifRef = useRef(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!notifOpen) setSelectedNotif(null);
  }, [notifOpen]);

  useEffect(() => {
    const refresh = () => setAvatarUrl(localStorage.getItem("adminAvatarUrl") || "");
    window.addEventListener("avatar-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("avatar-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("auth");
    localStorage.removeItem("token");
    localStorage.removeItem("access_token");
    localStorage.removeItem("adminAvatarUrl");
    navigate("/admin/login", { replace: true });
  };

  const navLinkStyle = ({ isActive }) => ({
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "6px 10px",
    borderRadius: "6px",
    color: isActive ? ACCENT : (isDark ? "#cbd5e1" : "#374151"),
    textDecoration: "none",
    fontSize: "13.5px",
    fontWeight: isActive ? 600 : 400,
    background: isActive ? (isDark ? "rgba(37,99,235,0.15)" : "#eff6ff") : "transparent",
    borderBottom: isActive ? `2px solid ${ACCENT}` : "2px solid transparent",
    transition: "all 0.13s",
    whiteSpace: "nowrap",
  });

  return (
    <header
      style={{
        height: "58px",
        minHeight: "58px",
        background: isDark ? "var(--bg-header)" : "#ffffff",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        padding: "0 24px",
        gap: "20px",
      }}
    >
      {/* Logo */}
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>
        <img
          src={isDark ? logoLight : logoDark}
          alt="ONIX AI"
          style={{ height: "32px", width: "auto", objectFit: "contain", display: "block" }}
        />
      </div>

      {/* Divider */}
      <div style={{ width: "1px", height: "24px", background: "var(--border)", flexShrink: 0 }} />

      {/* Nav links */}
      <nav style={{ display: "flex", alignItems: "center", gap: "2px", flex: 1, overflow: "hidden" }}>
        {NAV_LINKS.map(({ to, label }) => (
          <NavLink key={to} to={to} style={navLinkStyle}>
            <span>{label}</span>
          </NavLink>
        ))}

      </nav>

      {/* Right actions */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          title={isDark ? "Switch to Light mode" : "Switch to Dark mode"}
          style={{
            background: isDark ? "#334155" : "#f1f5f9",
            border: "none",
            borderRadius: "50%",
            width: 34,
            height: 34,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            flexShrink: 0,
            transition: "background 0.2s",
          }}
        >
          <CIcon icon={isDark ? cilSun : cilMoon} style={{ width: 16, height: 16, color: isDark ? "#fbbf24" : "#4b5563" }} />
        </button>

        <GoogleTranslateSwitcher />

        {/* Notification bell */}
        <div ref={notifRef} style={{ position: "relative" }}>
          <button
            onClick={() => {
              setNotifOpen((v) => !v);
              if (!notifOpen) setNotifications((ns) => ns.map((n) => ({ ...n, read: true })));
            }}
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              position: "relative", padding: 5, borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
            aria-label="Notifications"
          >
            <CIcon icon={cilBell} style={{ width: 20, height: 20, color: isDark ? "#94a3b8" : "#4b5563" }} />
            {unreadCount > 0 && (
              <span style={{
                position: "absolute", top: 2, right: 2,
                background: "#ef4444", color: "#fff",
                borderRadius: "50%", width: 14, height: 14,
                fontSize: 9, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div style={{
              position: "absolute", top: "calc(100% + 10px)", right: 0,
              width: 360, background: "var(--bg-card)",
              borderRadius: 14, boxShadow: "0 8px 32px rgba(0,0,0,0.22)",
              zIndex: 2000, overflow: "hidden",
              border: "1px solid var(--border)",
              maxHeight: 480, display: "flex", flexDirection: "column",
            }}>
              <div style={{ padding: "13px 18px 11px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                {selectedNotif && (
                  <button onClick={() => setSelectedNotif(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#2457b8", fontSize: 18, lineHeight: 1, padding: 0, marginRight: 2 }}>‹</button>
                )}
                <span style={{ fontWeight: 700, fontSize: 15, color: "var(--text)", flex: 1 }}>
                  {selectedNotif ? selectedNotif.title : "Notifications"}
                </span>
                {!selectedNotif && notifications.length > 0 && (
                  <button onClick={() => setNotifications([])} style={{ background: "none", border: "none", color: "#9ca3af", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>Clear all</button>
                )}
              </div>
              <div style={{ overflowY: "auto", flex: 1 }}>
                {selectedNotif ? (
                  <div style={{ padding: "16px 18px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                      <span style={{ fontSize: 28 }}>{selectedNotif.icon}</span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: isDark ? "#e2e8f0" : "#111827" }}>{selectedNotif.title}</div>
                        <div style={{ fontSize: 12, color: isDark ? "#94a3b8" : "#6b7280", marginTop: 2 }}>{selectedNotif.time}</div>
                      </div>
                    </div>
                    <p style={{ fontSize: 13, color: isDark ? "#cbd5e1" : "#374151", marginBottom: 16, lineHeight: 1.6 }}>{selectedNotif.text}</p>
                    <div style={{ border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "#e5e7eb"}`, borderRadius: 10, overflow: "hidden" }}>
                      {Object.entries(selectedNotif.details).map(([label, value]) => (
                        <div key={label} style={{ display: "flex", padding: "9px 14px", borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "#f1f5f9"}`, fontSize: 13 }}>
                          <div style={{ width: 130, fontWeight: 600, color: isDark ? "#94a3b8" : "#6b7280", flexShrink: 0 }}>{label}</div>
                          <div style={{ color: isDark ? "#e2e8f0" : "#111827", fontWeight: 500 }}>{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : notifications.length === 0 ? (
                  <div style={{ padding: "24px 18px", color: isDark ? "#64748b" : "#9ca3af", fontSize: 14, textAlign: "center" }}>No notifications</div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => { setSelectedNotif(n); setNotifications((ns) => ns.map((x) => x.id === n.id ? { ...x, read: true } : x)); }}
                      style={{
                        padding: "12px 18px",
                        borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "#f1f5f9"}`,
                        background: n.read ? (isDark ? "transparent" : "#fff") : (isDark ? "rgba(36,87,184,0.12)" : "#eff6ff"),
                        display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer",
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.06)" : "#f0f4ff"}
                      onMouseLeave={(e) => e.currentTarget.style.background = n.read ? (isDark ? "transparent" : "#fff") : (isDark ? "rgba(36,87,184,0.12)" : "#eff6ff")}
                    >
                      <span style={{ fontSize: 20, marginTop: 1, flexShrink: 0 }}>{n.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: "#2457b8", background: isDark ? "rgba(36,87,184,0.2)" : "#eff6ff", borderRadius: 6, padding: "1px 7px" }}>{n.type}</span>
                          {!n.read && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#ef4444", display: "inline-block" }} />}
                        </div>
                        <div style={{ fontSize: 13, color: isDark ? "#cbd5e1" : "#1f2937", lineHeight: 1.45 }}>{n.text}</div>
                        <div style={{ fontSize: 11, color: isDark ? "#64748b" : "#9ca3af", marginTop: 3 }}>{n.time}</div>
                      </div>
                      <span style={{ color: isDark ? "#64748b" : "#9ca3af", fontSize: 16, flexShrink: 0, alignSelf: "center" }}>›</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User avatar */}
        <CDropdown alignment="end">
          <CDropdownToggle
            style={{
              background: "#2457b8", border: "none", borderRadius: "50%",
              width: 36, height: 36, padding: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", overflow: "hidden",
              color: "#fff", fontWeight: 700, fontSize: 14,
            }}
            caret={false}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl} alt="avatar"
                style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover", display: "block" }}
                onError={() => { localStorage.removeItem("adminAvatarUrl"); setAvatarUrl(""); }}
              />
            ) : (
              <span>{initials}</span>
            )}
          </CDropdownToggle>
          <CDropdownMenu>
            <CDropdownItem style={{ cursor: "pointer" }} onClick={() => navigate("/admin/profile")}>
              <CIcon icon={cilUser} className="me-2" /> Profile
            </CDropdownItem>
            <CDropdownItem style={{ cursor: "pointer" }} onClick={() => navigate("/admin/accounts")}>
              <CIcon icon={cilSettings} className="me-2" /> Settings
            </CDropdownItem>
            <CDropdownItem style={{ cursor: "pointer" }} onClick={handleLogout}>
              <CIcon icon={cilAccountLogout} className="me-2" /> Logout
            </CDropdownItem>
          </CDropdownMenu>
        </CDropdown>
      </div>
    </header>
  );
}
