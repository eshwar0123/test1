import React, { useEffect, useState } from "react";
import { Routes, Route, Navigate, NavLink, useNavigate } from "react-router-dom";
import CaseQueue from "./pages/CaseQueue";
import CompletedCases from "./pages/CompletedCases";
import { readToken } from "./utils/reportDownloads";

const NAV = [
  { to: "/technician/case-queue", label: "Case Queue" },
  { to: "/technician/completed-cases", label: "Completed Cases" },
];

export default function TechnicianApp() {
  const navigate = useNavigate();
  const [orgName, setOrgName] = useState("");
  const [orgError, setOrgError] = useState("");

  useEffect(() => {
    const tok = readToken();
    fetch("/api/technician/me", { headers: tok ? { Authorization: `Bearer ${tok}` } : {} })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (ok && j?.data?.org_name) setOrgName(j.data.org_name);
        else setOrgError(j?.detail || "No organization matches your username");
      })
      .catch(() => setOrgError("Could not reach the server"));
  }, []);

  const logout = () => {
    try { sessionStorage.removeItem("report_as_user_id"); } catch { /* ignore */ }
    ["auth", "token", "access_token", "role", "user_id"].forEach((k) => localStorage.removeItem(k));
    navigate("/technician/login", { replace: true });
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", fontFamily: "Inter, Arial, sans-serif" }}>
      <header
        style={{
          display: "flex", alignItems: "center", gap: 24, padding: "0 28px", height: 64,
          background: "linear-gradient(135deg,#0b1a4b,#1e3a8a)", color: "#fff",
        }}
      >
        {/* Same Onix AI logo the other portals use (dark-theme variant: the header is dark). */}
        <img
          src="/logo1.png"
          alt="Onix AI"
          onClick={() => navigate("/technician/case-queue")}
          style={{ height: "auto", width: 140, display: "block", cursor: "pointer" }}
          onError={(e) => { e.currentTarget.style.display = "none"; }}
        />
        <nav style={{ display: "flex", gap: 6, marginLeft: 12 }}>
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              style={({ isActive }) => ({
                padding: "8px 16px", borderRadius: 8, textDecoration: "none", fontSize: 14, fontWeight: 600,
                color: "#fff", background: isActive ? "rgba(255,255,255,0.18)" : "transparent",
              })}
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 16, fontSize: 14 }}>
          <span style={{ opacity: 0.85 }}>{orgName ? `Organization: ${orgName}` : ""}</span>
          <button
            onClick={logout}
            style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 8, padding: "6px 14px", cursor: "pointer" }}
          >
            Logout
          </button>
        </div>
      </header>

      {orgError && (
        <div style={{ margin: "16px 28px 0", padding: "10px 14px", borderRadius: 8, background: "#fef2f2", color: "#b91c1c", fontSize: 14 }}>
          {orgError}. Your technician username must match your organization name exactly.
        </div>
      )}

      <main style={{ padding: 28 }}>
        <Routes>
          <Route index element={<Navigate to="case-queue" replace />} />
          <Route path="case-queue" element={<CaseQueue />} />
          <Route path="completed-cases" element={<CompletedCases />} />
          <Route path="*" element={<Navigate to="case-queue" replace />} />
        </Routes>
      </main>
    </div>
  );
}

