import React, { useEffect, useState, useRef } from "react";
import {
  CHeader,
  CContainer,
  CDropdown,
  CDropdownToggle,
  CDropdownMenu,
  CDropdownItem,
  CButton,
} from "@coreui/react";
import CIcon from "@coreui/icons-react";
import { cilUser, cilAccountLogout, cilBell, cilSpeedometer, cilFolder, cilSettings } from "@coreui/icons";
import { useNavigate, NavLink } from "react-router-dom";
import GoogleTranslateSwitcher from "../../../shared/components/GoogleTranslateSwitcher";
import api from "../../../shared/api/axios";

const NOTIF_POLL_MS = 20000;

function timeAgo(isoString) {
  if (!isoString) return "";
  // Postgres TIMESTAMPTZ::text looks like "2026-08-03 08:03:59.739342+00" —
  // normalize to something Date can reliably parse cross-browser.
  let s = isoString.trim().replace(" ", "T");
  if (/[+-]\d{2}$/.test(s)) s += ":00";
  else if (!/[zZ]$/.test(s) && !/[+-]\d{2}:\d{2}$/.test(s)) s += "Z";
  const then = new Date(s);
  const diffMs = Date.now() - then.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return "";
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

const Header = ({ darkMode, toggleDarkMode, onViewerExit }) => {
  const navigate = useNavigate();

  // When onViewerExit is provided (viewer route), trigger the two-step exit:
  // unmount DicomViewer first, then navigate — bypasses Cornerstone render loops.
  const navTo = (path) => {
    if (onViewerExit) onViewerExit(path);
    else navigate(path);
  };

  const auth = JSON.parse(localStorage.getItem("auth"));
  const isLoggedIn = auth?.isLoggedIn;

  const userName = auth ? `${auth.firstName} ${auth.lastName}` : "";
  const initials = userName
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const [avatarUrl, setAvatarUrl] = useState(localStorage.getItem("avatarUrl") || "");
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const notifRef = useRef(null);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const fetchNotifications = async () => {
    if (!auth?.userId) return;
    try {
      const res = await api.get("/radiology/notifications", { params: { user_id: auth.userId } });
      if (res.data?.success) setNotifications(res.data.data || []);
    } catch (_) {}
  };

  // Case-assignment notifications — poll since there's no push/websocket
  // channel for this yet.
  useEffect(() => {
    if (!auth?.userId) return;
    fetchNotifications();
    const id = setInterval(fetchNotifications, NOTIF_POLL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.userId]);

  const markAllRead = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    try {
      await api.post("/radiology/notifications/read-all", { user_id: auth?.userId });
    } catch (_) {}
  };

  const handleNotificationClick = async (n) => {
    setNotifOpen(false);
    if (!n.is_read) {
      setNotifications(prev => prev.map(x => x.notification_id === n.notification_id ? { ...x, is_read: true } : x));
      api.post(`/radiology/notifications/${n.notification_id}/read`).catch(() => {});
    }
    if (n.case_id) {
      // navTo handles the two-step exit when currently inside the DICOM
      // viewer, but that path doesn't carry navigation state — falls back to
      // landing on Repository without auto-opening the case in that case.
      if (onViewerExit) navTo("/radiologist/repository1");
      else navigate("/radiologist/repository1", { state: { openCaseId: n.case_id } });
    }
  };

  useEffect(() => {
    const handler = (e) => { if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    const refresh = () => setAvatarUrl(localStorage.getItem("avatarUrl") || "");
    window.addEventListener("avatar-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("avatar-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  // The Profile page is what normally fetches and caches the avatar URL
  // (via localStorage["avatarUrl"] + an "avatar-updated" event) — so right
  // after login, before the user ever visits Profile, there's nothing cached
  // and this falls back to initials. Fetch it here too so the real photo
  // shows up immediately instead of only after a Profile visit.
  useEffect(() => {
    if (avatarUrl || !auth?.userId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/radiology/profile/${auth.userId}`);
        const path = res.data?.data?.profile_image_path;
        if (cancelled || !path) return;
        const base = (api?.defaults?.baseURL || "").replace(/\/$/, "").replace(/\/api$/i, "")
          || window.location.origin;
        const name = path.startsWith("http") ? null : path.split("/").pop();
        const url = path.startsWith("http")
          ? path
          : `${base}/uploads/radiologist/profile/${encodeURIComponent(name)}?v=${Date.now()}`;
        localStorage.setItem("avatarUrl", url);
        setAvatarUrl(url);
      } catch (_) {}
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.userId]);

  const handleLogout = () => {
    localStorage.removeItem("auth");
    localStorage.removeItem("avatarUrl");
    navigate("/login");
  };

  const logoSrc = darkMode ? "/logo1.png" : "/logo.png";

  return (
    <CHeader className="header">
      <CContainer fluid className="header-inner">

        {/* LEFT — Logo + Nav (NO Settings here) */}
        <div className="header-left">
          <div className="header-logo-wrap" onClick={() => navTo("/radiologist/repository1")} title="ONIX AI">
            <img src={logoSrc} alt="ONIX AI" className="header-logo-img"
              onError={(e) => { e.currentTarget.style.display = "none"; }} />
          </div>

          <nav className="header-nav">
            <NavLink
              to="/radiologist/dashboard"
              className={({ isActive }) => `header-nav-link ${isActive ? "active" : ""}`}
              onClick={onViewerExit ? (e) => { e.preventDefault(); navTo("/radiologist/dashboard"); } : undefined}
            >
              <CIcon icon={cilSpeedometer} size="sm" /> Dashboard
            </NavLink>
            <NavLink
              to="/radiologist/repository1"
              className={({ isActive }) => `header-nav-link ${isActive ? "active" : ""}`}
              onClick={onViewerExit ? (e) => { e.preventDefault(); navTo("/radiologist/repository1"); } : undefined}
            >
              <CIcon icon={cilFolder} size="sm" /> Repository
            </NavLink>
            {/* ✅ Settings removed from nav — moved to avatar dropdown */}
          </nav>
        </div>

        {/* RIGHT */}
        <div className="header-right">

          {/* Dark mode toggle */}
          <button
            className="dm-toggle"
            onClick={toggleDarkMode}
            title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {darkMode ? "☀" : "☾"}
          </button>

          <GoogleTranslateSwitcher />

          {/* Notification bell */}
          <div className="notif-wrapper" ref={notifRef}>
            <button
              className="notif-bell"
              onClick={() => setNotifOpen(prev => !prev)}
              title="Notifications"
            >
              <CIcon icon={cilBell} size="lg" />
              {unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
            </button>

            {notifOpen && (
              <div className="notif-dropdown">
                <div className="notif-dropdown-header">
                  <span className="notif-dropdown-title">Notifications</span>
                  {unreadCount > 0 && (
                    <button className="notif-mark-read" onClick={markAllRead}>
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="notif-dropdown-list">
                  {notifications.length === 0 && (
                    <div className="notif-empty" style={{ padding: "16px 12px", textAlign: "center", color: "#8b97ac", fontSize: 13 }}>
                      No notifications yet
                    </div>
                  )}
                  {notifications.map(n => (
                    <div
                      key={n.notification_id}
                      className={`notif-item ${!n.is_read ? "unread" : ""}`}
                      onClick={() => handleNotificationClick(n)}
                      style={{ cursor: n.case_id ? "pointer" : "default" }}
                    >
                      <div className={`notif-dot ${n.type}`} />
                      <div className="notif-content">
                        <div className="notif-item-title">{n.title}</div>
                        <div className="notif-item-desc">{n.message}</div>
                        <div className="notif-item-time">{timeAgo(n.created_at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {isLoggedIn ? (
            <CDropdown alignment="end">
              <CDropdownToggle className="profile-toggle green-profile-toggle">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="avatar"
                    style={{
                      width: "100%",
                      height: "100%",
                      borderRadius: "50%",
                      objectFit: "cover",
                      display: "block",
                    }}
                    onError={() => {
                      localStorage.removeItem("avatarUrl");
                      setAvatarUrl("");
                    }}
                  />
                ) : (
                  <span>{initials || "U"}</span>
                )}
              </CDropdownToggle>

              <CDropdownMenu>
                {/* ✅ Profile */}
                <CDropdownItem
                  className="profile-dropdown-item"
                  onClick={() => navigate("/radiologist/profile")}
                >
                  <CIcon icon={cilUser} className="me-2" />
                  Profile
                </CDropdownItem>

                {/* ✅ Settings — moved here from nav */}
                <CDropdownItem
                  className="profile-dropdown-item"
                  onClick={() => navigate("/radiologist/settings")}
                >
                  <CIcon icon={cilSettings} className="me-2" />
                  Settings
                </CDropdownItem>

                {/* ✅ Logout */}
                <CDropdownItem
                  className="profile-dropdown-item"
                  onClick={handleLogout}
                >
                  <CIcon icon={cilAccountLogout} className="me-2" />
                  Logout
                </CDropdownItem>
              </CDropdownMenu>
            </CDropdown>
          ) : (
            <CButton className="header-login-btn" onClick={() => navigate("/login")}>
              Login
            </CButton>
          )}
        </div>

      </CContainer>
    </CHeader>
  );
};

export default Header;

