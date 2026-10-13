import React from "react";
import { Outlet } from "react-router-dom";

import AppHeader from "../pages/AppHeader";
import { ThemeProvider, useTheme } from "./ThemeContext";

function Layout() {
  const { isDark } = useTheme();

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        html, body, #root { height: 100%; margin: 0; padding: 0; overflow: hidden; }
        body { font-family: 'Plus Jakarta Sans', sans-serif; }

        /* ── Light / Dark CSS variables ── */
        .admin-root {
          --bg-page:    #eef2f7;
          --bg-card:    #ffffff;
          --bg-sidebar: #f8f9fb;
          --bg-header:  #ffffff;
          --border:     #d7dce8;
          --text:       #111827;
          --text-muted: #6b7280;
          --input-bg:   #ffffff;
        }
        .admin-root.dark {
          --bg-page:    #0f172a;
          --bg-card:    #1e293b;
          --bg-sidebar: #1a2234;
          --bg-header:  #1e293b;
          --border:     #334155;
          --text:       #e2e8f0;
          --text-muted: #94a3b8;
          --input-bg:   #273348;
        }

        /* ── Content area cards & text ── */
        .admin-root.dark .card,
        .admin-root.dark .c-card { background: var(--bg-card) !important; border-color: var(--border) !important; color: var(--text) !important; }
        .admin-root.dark .card-body,
        .admin-root.dark .c-card-body { background: var(--bg-card) !important; color: var(--text) !important; }
        .admin-root.dark .card-header,
        .admin-root.dark .c-card-header { background: var(--bg-card) !important; border-color: var(--border) !important; color: var(--text) !important; }
        .admin-root.dark p,
        .admin-root.dark h1, .admin-root.dark h2, .admin-root.dark h3,
        .admin-root.dark h4, .admin-root.dark h5, .admin-root.dark h6,
        .admin-root.dark li, .admin-root.dark span:not([class*="badge"]) { color: var(--text); }
        .admin-root.dark .text-body-secondary { color: var(--text-muted) !important; }
        .admin-root.dark .form-control,
        .admin-root.dark .c-form-input { background: var(--input-bg) !important; border-color: var(--border) !important; color: var(--text) !important; }
        .admin-root.dark .input-group-text { background: var(--input-bg) !important; border-color: var(--border) !important; color: var(--text-muted) !important; }
        .admin-root.dark .modal-content { background: var(--bg-card) !important; color: var(--text) !important; }
        .admin-root.dark .modal-header,
        .admin-root.dark .modal-footer { border-color: var(--border) !important; background: var(--bg-card) !important; }
        .admin-root.dark hr { border-color: var(--border) !important; }
        .admin-root.dark .dropdown-menu { background: var(--bg-card) !important; border-color: var(--border) !important; }
        .admin-root.dark .dropdown-item { color: var(--text) !important; }
        .admin-root.dark .dropdown-item:hover { background: var(--bg-page) !important; }
        .admin-root.dark table { color: var(--text) !important; background: var(--bg-card) !important; }
        .admin-root.dark th, .admin-root.dark td { color: var(--text) !important; border-color: var(--border) !important; background: inherit; }
        .admin-root.dark thead th { background: var(--bg-page) !important; }
        .admin-root.dark tbody tr:nth-child(even) { background: var(--bg-page) !important; }
        .admin-root.dark tbody tr:nth-child(odd)  { background: var(--bg-card) !important; }
        .admin-root.dark tbody tr:hover { background: color-mix(in srgb, var(--bg-card) 80%, white 20%) !important; }
        .admin-root.dark [style*="border: 1px solid #e5e7eb"],
        .admin-root.dark [style*="border: \"1px solid #e5e7eb\""] { border-color: var(--border) !important; }
        .admin-root.dark .bg-white, .admin-root.dark [class*="bg-light"] { background: var(--bg-card) !important; color: var(--text) !important; }
        .admin-root.dark .text-muted { color: var(--text-muted) !important; }
        .admin-root.dark .border, .admin-root.dark [class*="border-"] { border-color: var(--border) !important; }
        .admin-root.dark .c-table { background: var(--bg-card) !important; color: var(--text) !important; }
        .admin-root.dark [style*="background: linear-gradient(160deg, #e8eef8"] { background: var(--bg-card) !important; }
      `}</style>

      <div
        className={`admin-root${isDark ? " dark" : ""}`}
        style={{ height: "100vh", width: "100vw", overflow: "hidden", background: "var(--bg-page)", display: "flex", flexDirection: "column" }}
      >
        <div style={{ position: "sticky", top: 0, zIndex: 1100 }}>
          <AppHeader />
        </div>

        <main style={{ flex: 1, overflowY: "auto", overflowX: "hidden", background: "var(--bg-page)" }}>
          <Outlet />
        </main>

        <footer style={{
          borderTop: "1px solid var(--border)",
          background: isDark ? "var(--bg-header)" : "#ffffff",
          padding: "10px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
          fontSize: "12px",
          color: "var(--text-muted)",
        }}>
          <span>v1.0.0</span>
          <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
            {[
              { to: "/admin/help",           label: "Help" },
              { to: "/admin/privacy-policy", label: "Privacy Policy" },
              { to: "/admin/terms",          label: "Terms & Conditions" },
            ].map(({ to, label }) => (
              <a
                key={to}
                href={to}
                style={{ color: "var(--text-muted)", textDecoration: "none", transition: "color 0.15s" }}
                onMouseEnter={(e) => e.currentTarget.style.color = "#2563eb"}
                onMouseLeave={(e) => e.currentTarget.style.color = "var(--text-muted)"}
              >
                {label}
              </a>
            ))}
          </div>
        </footer>
      </div>
    </>
  );
}

const DefaultLayout = () => (
  <ThemeProvider>
    <Layout />
  </ThemeProvider>
);

export default DefaultLayout;