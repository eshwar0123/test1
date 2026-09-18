import { useEffect, useRef, useState } from "react";
import {
  CHeader,
  CButton,
} from "@coreui/react";
import CIcon from "@coreui/icons-react";
import { cilUser, cilAccountLogout, cilSettings } from "@coreui/icons";
import { useNavigate, NavLink } from "react-router-dom";
import GoogleTranslateSwitcher from "../../../shared/components/GoogleTranslateSwitcher";
import "./AppHeader.css";

/* =========================================================================
 *  API helper — same shape as Profile.js / OrgSetupModal.js.
 *  Pulls JWT from localStorage.auth.token; no cookies.
 * ======================================================================= */
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8100";

const getToken = () => {
  try {
    const auth = JSON.parse(localStorage.getItem("auth") || "null");
    if (auth?.token) return auth.token;
  } catch (_) { /* ignore */ }
  return localStorage.getItem("token") || localStorage.getItem("access_token") || "";
};

const apiFetch = async (path, opts = {}) => {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
  }
  return res.json();
};

/* ========================================================================= */

const Header = () => {
  const navigate = useNavigate();
  const auth = JSON.parse(localStorage.getItem("auth"));
  const isLoggedIn = auth?.isLoggedIn;

  const firstName = auth?.firstName || localStorage.getItem("firstname") || "";
  const lastName  = auth?.lastName  || localStorage.getItem("lastname")  || "";
  const userName  = [firstName, lastName].filter(Boolean).join(" ").trim()
                    || (auth?.email ? auth.email.split("@")[0] : "");

  const [avatarUrl, setAvatarUrl] = useState(localStorage.getItem("avatarUrl") || "");

  // ── Org identity ───────────────────────────────────────────────────────────
  // Canonical source for the org profile (name + logo + email) is the
  // OrgSetupModal, which writes the full form blob to localStorage.org_profile
  // (key "org_profile") and also dispatches the "org-profile-updated" event
  // on save. We read directly from that key — no backend fetch — so the
  // header logo and name stay in sync with the Profile page exactly.
  //
  // Seed values from JWT/login payload so the dropdown is never blank while
  // we read from localStorage on first mount.
  const [orgName,   setOrgName]   = useState(auth?.username || "");
  const [orgLogo,   setOrgLogo]   = useState("");
  const [userEmail, setUserEmail] = useState(auth?.email || "");

  const loadOrgProfile = () => {
    if (!isLoggedIn) return;
    try {
      const raw = localStorage.getItem("org_profile");
      if (!raw) {
        // No profile saved yet — keep JWT-seeded values
        setOrgName(prev => prev || auth?.username || "");
        setUserEmail(prev => prev || auth?.email || "");
        setOrgLogo("");
        return;
      }
      const p = JSON.parse(raw);
      // OrgSetupModal stores the logo as a base64 data URL under p.logo
      setOrgLogo(p?.logo || "");
      // Prefer the form value, but fall back to auth (the locked username
      // sourced from core_schema.users).
      setOrgName(p?.orgName || auth?.username || "");
      setUserEmail(p?.email || auth?.email || "");
    } catch (err) {
      // Stay quiet — header should never crash; just fall back to defaults.
      console.warn("[Header] localStorage.org_profile parse failed:", err.message);
    }
  };

  useEffect(() => {
    loadOrgProfile();
    // Re-read when the profile is saved elsewhere (OrgSetupModal dispatches this).
    const onProfileUpdated = () => loadOrgProfile();
    window.addEventListener("org-profile-updated", onProfileUpdated);
    // Also react to localStorage changes from other tabs/windows
    window.addEventListener("storage", onProfileUpdated);
    return () => {
      window.removeEventListener("org-profile-updated", onProfileUpdated);
      window.removeEventListener("storage", onProfileUpdated);
    };
  }, [isLoggedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Theme ──────────────────────────────────────────────────────────────────
  const [theme, setTheme] = useState(() => localStorage.getItem("appTheme") || "light");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("appTheme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));
  const headerStyle = theme === "dark"
    ? {
        backgroundColor: "#0f172a",
        backgroundImage: 'linear-gradient(rgba(10, 15, 30, 0.58), rgba(10, 15, 30, 0.58)), url("/header.png")',
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }
    : {
        backgroundColor: "#d8ebf8",
        backgroundImage: 'url("/header.png")',
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      };

  // ── Notifications ──────────────────────────────────────────────────────────
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([
    { id: 1, title: "Upload Complete", desc: "Batch of 24 images uploaded successfully for C001.", time: "2 min ago", read: false },
    { id: 2, title: "Validation Warning", desc: "3 rows failed validation in the last bulk upload.", time: "15 min ago", read: false },
  ]);
  const notifRef = useRef(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const clearNotifications = () => {
    setNotifications([]);
    setNotifOpen(false);
  };

  // ── Avatar ─────────────────────────────────────────────────────────────────
  const [avatarOpen, setAvatarOpen] = useState(false);
  const avatarRef = useRef(null);

  useEffect(() => {
    const refresh = () => setAvatarUrl(localStorage.getItem("avatarUrl") || "");
    window.addEventListener("avatar-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("avatar-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
      if (avatarRef.current && !avatarRef.current.contains(e.target)) setAvatarOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("auth");
    localStorage.removeItem("avatarUrl");
    navigate("/login");
  };

  return (
    <CHeader className="header" style={headerStyle}>
      <div className="header-inner">
        {/* LEFT — logo + nav links */}
        <div className="header-left">
          <div className="header-brand" onClick={() => navigate("/organization/dashboard")}>
            <img
              src={theme === "dark" ? "/logo1.png" : "/logo.png"}
              alt="Onix AI"
              style={{ height: "auto", width: "140px", display: "block" }}
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          </div>
          <nav className="header-nav">
            <NavLink
              to="/organization/dashboard"
              className={({ isActive }) => `header-nav-link${isActive ? " active" : ""}`}
            >
              Dashboard
            </NavLink>
            <NavLink
              to="/organization/upload"
              className={({ isActive }) => `header-nav-link${isActive ? " active" : ""}`}
            >
              Upload
            </NavLink>
          </nav>
        </div>

{/* RIGHT */}
        <div className="header-right">
          {/* Theme Toggle */}
          <button
            type="button"
            className="hdr-icon-btn"
            onClick={toggleTheme}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? (
              /* Sun icon */
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"/>
                <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
            ) : (
              /* Moon icon */
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            )}
          </button>

          <GoogleTranslateSwitcher />

          {/* Notification Bell */}
          <div className="hdr-notif-wrap" ref={notifRef}>
            <button
              type="button"
              className="hdr-icon-btn"
              onClick={() => setNotifOpen((o) => !o)}
              title="Notifications"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              {unreadCount > 0 && (
                <span className="hdr-notif-badge">{unreadCount}</span>
              )}
            </button>

            {notifOpen && (
              <div className="hdr-notif-dropdown">
                <div className="hdr-notif-header">
                  <span>Notifications</span>
                  <button type="button" className="hdr-notif-clear" onClick={clearNotifications}>
                    Clear all
                  </button>
                </div>
                <div className="hdr-notif-list">
                  {notifications.length === 0 ? (
                    <div className="hdr-notif-empty">No new notifications</div>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        className={`hdr-notif-item${n.read ? "" : " unread"}`}
                        onClick={() => {
                          setNotifications((prev) =>
                            prev.map((x) => x.id === n.id ? { ...x, read: true } : x)
                          );
                        }}
                      >
                        <div className={`hdr-notif-dot${n.read ? " read" : ""}`} />
                        <div className="hdr-notif-content">
                          <div className="hdr-notif-title">{n.title}</div>
                          <div className="hdr-notif-desc">{n.desc}</div>
                          <div className="hdr-notif-time">{n.time}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Avatar */}
          {isLoggedIn ? (
            <div className="hdr-avatar-wrap" ref={avatarRef}>
              <button
                type="button"
                className="hdr-avatar-btn"
                onClick={() => setAvatarOpen((o) => !o)}
                title="Account"
              >
                <div className="hdr-avatar">
                  {orgLogo ? (
                    <img
                      src={orgLogo}
                      alt="org logo"
                      onError={() => setOrgLogo("")}
                    />
                  ) : avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="avatar"
                      onError={() => { localStorage.removeItem("avatarUrl"); setAvatarUrl(""); }}
                    />
                  ) : (
                    <img
                      src="/hv_logo.png"
                      alt="avatar"
                      style={{ width: "100%", height: "100%", objectFit: "contain", padding: 4, background: "#ffffff" }}
                    />
                  )}
                </div>
              </button>

              {avatarOpen && (
                <div className="hdr-avatar-dropdown" style={{ width: 250, maxWidth: 300 }}>
                  <div className="hdr-avatar-profile">
                    <div className="hdr-avatar hdr-avatar--lg">
                      {orgLogo ? (
                        <img src={orgLogo} alt="org logo" onError={() => setOrgLogo("")} />
                      ) : avatarUrl ? (
                        <img src={avatarUrl} alt="avatar" />
                      ) : (
                        <img
                          src="/hv_logo.png"
                          alt="avatar"
                          style={{ width: "100%", height: "100%", objectFit: "contain", padding: 5, background: "#ffffff" }}
                        />
                      )}
                    </div>
                    <div>
                      <div className="hdr-avatar-name">{orgName || userName || "Organization"}</div>
                      <div className="hdr-avatar-email">{userEmail || auth?.email || ""}</div>
                    </div>
                  </div>
                  <div className="hdr-avatar-menu">
                    <button
                      type="button"
                      className="hdr-avatar-menu-item"
                      onClick={() => { setAvatarOpen(false); navigate("/organization/profile"); }}
                    >
                      <CIcon icon={cilUser} style={{ width: 14, height: 14 }} />
                      Profile
                    </button>
                    <button
                      type="button"
                      className="hdr-avatar-menu-item"
                      onClick={() => { setAvatarOpen(false); navigate("/organization/account"); }}
                    >
                      <CIcon icon={cilSettings} style={{ width: 14, height: 14 }} />
                      Account
                    </button>
                    <div className="hdr-avatar-divider" />
                    <button
                      type="button"
                      className="hdr-avatar-menu-item hdr-avatar-menu-item--danger"
                      onClick={handleLogout}
                    >
                      <CIcon icon={cilAccountLogout} style={{ width: 14, height: 14 }} />
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <CButton color="primary" onClick={() => navigate("/login")}>Login</CButton>
          )}
        </div>
      </div>
    </CHeader>
  );
};

export default Header;
