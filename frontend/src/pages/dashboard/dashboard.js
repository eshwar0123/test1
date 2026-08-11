// src/views/dashboard/Dashboard.js
import React, { useState } from "react";
import {
  CButton,
} from "@coreui/react";
import CIcon from "@coreui/icons-react";
import {
  cilMenu,
  cilAccountLogout,
  cilBell,
  cilMoon,
  cilSun,
} from "@coreui/icons";
import { apptheme } from "src/views/theme/colors/apptheme";

const Dashboard = () => {

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  // USER NAME SAFE FALLBACK
  const storedUser = (() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "null");
    } catch {
      return null;
    }
  })();

  const displayName =
    storedUser?.firstName ||
    localStorage.getItem("username") ||
    localStorage.getItem("email") ||
    "User";

  const toggleSidebar = () => setSidebarOpen((p) => !p);
  const toggleDarkMode = () => setIsDarkMode((p) => !p);
  const handleLogout = () => {
    localStorage.clear();
    window.location.href = "/login";
  };

  const sidebarWidth = 260;

  const fontBase = {
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial',
    color: "#111827",
  };

  const containerStyle = {
    minHeight: "100vh",
    padding: 20,
    marginLeft: sidebarOpen ? sidebarWidth : 0,
    transition: "margin-left .25s ease",
  };

  return (
    <div style={{ minHeight: "100vh", background: apptheme.dashboard.pageBg }}>

      {/* SIDEBAR */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          width: sidebarOpen ? sidebarWidth : 0,
          background: "rgba(255,255,255,0.8)",
          backdropFilter: "blur(10px)",
          overflow: "hidden",
          transition: "width .25s ease",
          zIndex: 20,
        }}
      >
        <div style={{ padding: 20, borderBottom: "1px solid #e5e7eb" }}>
          <img src="/logo.png" alt="logo" style={{ height: 40 }} />
        </div>
      </div>

      {/* MAIN */}
      <div style={containerStyle}>

        {/* TOPBAR */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {!sidebarOpen && <img src="/logo.png" alt="logo" style={{ height: 40 }} />}

            <CButton variant="outline" onClick={toggleSidebar}>
              <CIcon icon={cilMenu} />
            </CButton>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <CButton variant="outline" onClick={toggleDarkMode}>
              <CIcon icon={isDarkMode ? cilSun : cilMoon} />
            </CButton>

            <CButton variant="outline" onClick={() => setNotifOpen(true)}>
              <CIcon icon={cilBell} />
            </CButton>

            {/* PROFILE */}
            <div style={{ position: "relative" }}>
              <div
                onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: "50%",
                  background: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  boxShadow: "0 4px 12px rgba(0,0,0,.15)",
                  fontWeight: 700,
                }}
              >
                👤
              </div>

              {profileMenuOpen && (
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    top: 46,
                    width: 200,
                    background: "#fff",
                    borderRadius: 12,
                    boxShadow: "0 10px 25px rgba(0,0,0,.15)",
                    padding: 10,
                  }}
                >
                  <div style={{ padding: 10, borderBottom: "1px solid #eee" }}>
                    <b>{displayName}</b>
                  </div>

                  <div
                    onClick={handleLogout}
                    style={{
                      padding: 10,
                      cursor: "pointer",
                      color: "#dc2626",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <CIcon icon={cilAccountLogout} /> Logout
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* EMPTY CONTENT AREA */}
        <div
          style={{
            height: "75vh",
            borderRadius: 18,
            background: "rgba(255,255,255,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#6b7280",
            fontSize: 18,
            fontWeight: 600,
          }}
        >
          Dashboard Content Will Appear Here
        </div>

      </div>
    </div>
  );
};

export default Dashboard;
