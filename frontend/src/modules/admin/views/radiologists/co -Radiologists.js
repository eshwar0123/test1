import React, { useEffect, useState } from "react";
import { useTheme } from "../../layout/ThemeContext";

const DUMMY_RADS = [
  { user_id: "1", username: "dr_vivek_rao",    email: "vivek.rao@onixai.com",     first_name: "Vivek",    last_name: "Rao",      qualification: "MD Radiology",    designation: "Senior Radiologist",  verification_status: "verified",      user_lab_name: "SRM Medical Hospital",   lab_address: "Chennai, India",    profile_image_path: "" },
  { user_id: "2", username: "dr_suresh_nair",  email: "suresh.nair@onixai.com",   first_name: "Suresh",   last_name: "Nair",     qualification: "DNB Radiology",   designation: "Neuro Radiologist",    verification_status: "verified",      user_lab_name: "Max Hospital",           lab_address: "Delhi, India",      profile_image_path: "" },
  { user_id: "3", username: "dr_priya_menon",  email: "priya.menon@onixai.com",   first_name: "Priya",    last_name: "Menon",    qualification: "DMRD",            designation: "Consultant Radiologist",verification_status: "verified",      user_lab_name: "Apollo Diagnostics",     lab_address: "Mumbai, India",     profile_image_path: "" },
  { user_id: "4", username: "dr_arun_kumar",   email: "arun.kumar@onixai.com",    first_name: "Arun",     last_name: "Kumar",    qualification: "MD Radiology",    designation: "Radiologist",          verification_status: "pending",       user_lab_name: "Fortis Scan Centre",     lab_address: "Bangalore, India",  profile_image_path: "" },
  { user_id: "5", username: "dr_meera_iyer",   email: "meera.iyer@onixai.com",    first_name: "Meera",    last_name: "Iyer",     qualification: "DNB Radiology",   designation: "Stroke Imaging Specialist", verification_status: "verified",   user_lab_name: "VCCMC Vellore",          lab_address: "Vellore, India",    profile_image_path: "" },
  { user_id: "6", username: "dr_rajesh_pillai",email: "rajesh.pillai@onixai.com", first_name: "Rajesh",   last_name: "Pillai",   qualification: "FRCR",            designation: "Interventional Radiologist", verification_status: "verified", user_lab_name: "Care Imaging Centre",    lab_address: "Hyderabad, India",  profile_image_path: "" },
  { user_id: "7", username: "dr_ananya_das",   email: "ananya.das@onixai.com",    first_name: "Ananya",   last_name: "Das",      qualification: "MD Radiology",    designation: "Junior Radiologist",   verification_status: "not_submitted", user_lab_name: "",                       lab_address: "",                  profile_image_path: "" },
];

const STATUS_STYLE = {
  verified:      { bg: "#dcfce7", color: "#15803d" },
  pending:       { bg: "#fef3c7", color: "#b45309" },
  not_submitted: { bg: "#f1f5f9", color: "#64748b" },
  rejected:      { bg: "#fee2e2", color: "#b91c1c" },
};

export default function Radiologists() {
  const { isDark } = useTheme();
  const [rads, setRads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const auth = (() => { try { return JSON.parse(localStorage.getItem("auth") || "null"); } catch { return null; } })();
    const token = auth?.token || auth?.access_token;
    if (!token) { setError("Not logged in"); setLoading(false); return; }

    fetch("http://127.0.0.1:8000/admin/radiologists", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => { if (!res.ok) throw new Error(); return res.json(); })
      .then((data) => { setRads(data.length ? data : DUMMY_RADS); setLoading(false); })
      .catch(() => { setRads(DUMMY_RADS); setLoading(false); });
  }, []);

  const card = isDark ? "var(--bg-card)" : "#ffffff";
  const border = isDark ? "var(--border)" : "#dbeafe";
  const text = isDark ? "var(--text)" : "#111827";
  const muted = isDark ? "var(--text-muted)" : "#6b7280";
  const page = isDark ? "var(--bg-page)" : "#f0f7ff";
  const theadBg = isDark ? "#1e293b" : "#1e3a5f";
  const theadText = "#ffffff";
  const rowAlt = isDark ? "rgba(255,255,255,0.02)" : "#f0f7ff";

  if (loading) return <p style={{ textAlign: "center", marginTop: 40, color: muted }}>Loading...</p>;
  if (error) return <p style={{ textAlign: "center", marginTop: 40, color: "#ef4444" }}>{error}</p>;

  return (
    <div style={{ padding: "24px 28px", background: page, minHeight: "100%" }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 24, fontWeight: 800, color: text, margin: 0 }}>Radiologists</h2>
        <p style={{ fontSize: 14, color: muted, marginTop: 4 }}>{rads.length} registered radiologist{rads.length !== 1 ? "s" : ""}</p>
      </div>

      <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 4px 16px rgba(30,58,95,0.08)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: theadBg }}>
              {["#", "Radiologist", "Email", "Qualification", "Designation", "Lab / Hospital", "Location", "Verification"].map((h) => (
                <th key={h} style={{ padding: "13px 16px", textAlign: "left", fontSize: 12, fontWeight: 700, color: theadText, whiteSpace: "nowrap", letterSpacing: "0.04em", textTransform: "uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rads.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 32, textAlign: "center", color: muted }}>No radiologists found</td></tr>
            ) : rads.map((rad, i) => {
              const fullName = [rad.first_name, rad.last_name].filter(Boolean).join(" ") || rad.username;
              const initials = fullName.slice(0, 2).toUpperCase();
              const status = rad.verification_status || "not_submitted";
              const s = STATUS_STYLE[status] || STATUS_STYLE.not_submitted;
              return (
                <tr key={rad.user_id} style={{ borderBottom: `1px solid ${border}`, background: i % 2 === 0 ? card : rowAlt }}>
                  <td style={{ padding: "14px 16px", color: muted, fontSize: 13, fontWeight: 600 }}>{i + 1}</td>
                  <td style={{ padding: "14px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {rad.profile_image_path
                        ? <img src={`http://127.0.0.1:8000/${rad.profile_image_path}`} alt="" style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover", border: `1px solid ${border}` }} />
                        : <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#7c3aed", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 13, flexShrink: 0 }}>{initials}</div>
                      }
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: text }}>{fullName}</div>
                        <div style={{ fontSize: 12, color: muted }}>{rad.username}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: "14px 16px", fontSize: 14, color: text }}>{rad.email}</td>
                  <td style={{ padding: "14px 16px", fontSize: 14, color: text }}>{rad.qualification || "—"}</td>
                  <td style={{ padding: "14px 16px", fontSize: 14, color: text }}>{rad.designation || "—"}</td>
                  <td style={{ padding: "14px 16px", fontSize: 14, color: text }}>{rad.user_lab_name || "—"}</td>
                  <td style={{ padding: "14px 16px", fontSize: 14, color: text }}>{rad.lab_address || "—"}</td>
                  <td style={{ padding: "14px 16px" }}>
                    <span style={{ padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700, background: s.bg, color: s.color, whiteSpace: "nowrap", display: "inline-block" }}>
                      {status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
