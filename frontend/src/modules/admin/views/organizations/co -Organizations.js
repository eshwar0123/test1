import React, { useEffect, useState } from "react";
import { useTheme } from "../../layout/ThemeContext";

const DUMMY_ORGS = [
  { user_id: "1", username: "srm_medical",  email: "admin@srmmedicalhospital.com",  organization_name: "SRM Medical Hospital",  organization_type: "Hospital",  npi_number: "1234567890", ein_tax_id: "12-3456789", contact_email: "admin@srmmedicalhospital.com",  contact_phone: "(044) 123-4567", admin_name: "Dr. Ramesh Kumar",   address: "24, Anna Salai, Chennai, TN, India",       logo_url: "", profile_completed: true  },
  { user_id: "2", username: "max_hospital",  email: "contact@maxhospital.in",       organization_name: "Max Hospital",          organization_type: "Hospital",  npi_number: "9876543210", ein_tax_id: "98-7654321", contact_email: "contact@maxhospital.in",        contact_phone: "(011) 987-6543", admin_name: "Sunita Arora",       address: "2, Press Enclave Road, Delhi, India",      logo_url: "", profile_completed: true  },
  { user_id: "3", username: "apollo_diag",   email: "info@apollodiagnostics.com",   organization_name: "Apollo Diagnostics",    organization_type: "Clinic",    npi_number: "1122334455", ein_tax_id: "11-2233445", contact_email: "info@apollodiagnostics.com",    contact_phone: "(022) 456-7890", admin_name: "Priya Shah",         address: "Andheri West, Mumbai, MH, India",          logo_url: "", profile_completed: true  },
  { user_id: "4", username: "fortis_scan",   email: "scan@fortishealthcare.com",    organization_name: "Fortis Scan Centre",    organization_type: "Clinic",    npi_number: "5566778899", ein_tax_id: "55-6677889", contact_email: "scan@fortishealthcare.com",     contact_phone: "(080) 555-0123", admin_name: "Anil Menon",         address: "Bannerghatta Road, Bangalore, KA, India",  logo_url: "", profile_completed: false },
  { user_id: "5", username: "vccmc_vellore", email: "admin@vccmc.in",               organization_name: "VCCMC Vellore",         organization_type: "Hospital",  npi_number: "6677889900", ein_tax_id: "66-7788990", contact_email: "admin@vccmc.in",               contact_phone: "(0416) 220-1234",admin_name: "Dr. S. Natarajan",   address: "Ida Scudder Road, Vellore, TN, India",     logo_url: "", profile_completed: true  },
  { user_id: "6", username: "care_imaging",  email: "info@careimaging.com",         organization_name: "Care Imaging Centre",   organization_type: "Clinic",    npi_number: "3344556677", ein_tax_id: "33-4455667", contact_email: "info@careimaging.com",          contact_phone: "(040) 333-4444", admin_name: "Rekha Pillai",       address: "Banjara Hills, Hyderabad, TS, India",      logo_url: "", profile_completed: false },
];

export default function Organizations() {
  const { isDark } = useTheme();
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const auth = (() => { try { return JSON.parse(localStorage.getItem("auth") || "null"); } catch { return null; } })();
    const token = auth?.token || auth?.access_token;
    if (!token) { setError("Not logged in"); setLoading(false); return; }

    fetch("http://127.0.0.1:8000/admin/organizations", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => { if (!res.ok) throw new Error(); return res.json(); })
      .then((data) => { setOrgs(data.length ? data : DUMMY_ORGS); setLoading(false); })
      .catch(() => { setOrgs(DUMMY_ORGS); setLoading(false); });
  }, []);

  const card = isDark ? "var(--bg-card)" : "#ffffff";
  const border = isDark ? "var(--border)" : "#dbeafe";
  const text = isDark ? "var(--text)" : "#111827";
  const muted = isDark ? "var(--text-muted)" : "#6b7280";
  const page = isDark ? "var(--bg-page)" : "#f0f7ff";
  const theadBg = isDark ? "#1e293b" : "#1e3a5f";
  const theadText = "#ffffff";
  const rowAlt = isDark ? "rgba(255,255,255,0.02)" : "#f0f7ff";

  const handleDelete = (userId) => {
    if (!window.confirm("Delete this organisation and its account? This cannot be undone.")) return;
    const auth = (() => { try { return JSON.parse(localStorage.getItem("auth") || "null"); } catch { return null; } })();
    const token = auth?.token || auth?.access_token;
    fetch(`http://127.0.0.1:8000/admin/organizations/${userId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }).then(() => setOrgs((prev) => prev.filter((o) => o.user_id !== userId)));
  };

  if (loading) return <p style={{ textAlign: "center", marginTop: 40, color: muted }}>Loading...</p>;
  if (error) return <p style={{ textAlign: "center", marginTop: 40, color: "#ef4444" }}>{error}</p>;

  return (
    <div style={{ padding: "24px 28px", background: page, minHeight: "100%" }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 24, fontWeight: 800, color: text, margin: 0 }}>Organisations</h2>
        <p style={{ fontSize: 14, color: muted, marginTop: 4 }}>{orgs.length} registered organisation{orgs.length !== 1 ? "s" : ""}</p>
      </div>

      <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 14, overflow: "auto", boxShadow: "0 4px 16px rgba(30,58,95,0.08)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
          <thead>
            <tr style={{ background: theadBg }}>
              {["#", "Organisation", "Type", "Contact Email", "Phone", "NPI Number", "EIN / Tax ID", "Admin Name", "Address", "Profile", "Action"].map((h) => (
                <th key={h} style={{ padding: "13px 16px", textAlign: "left", fontSize: 12, fontWeight: 700, color: theadText, whiteSpace: "nowrap", letterSpacing: "0.04em", textTransform: "uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orgs.length === 0 ? (
              <tr><td colSpan={11} style={{ padding: 32, textAlign: "center", color: muted }}>No organisations found</td></tr>
            ) : orgs.map((org, i) => (
              <tr key={org.user_id} style={{ borderBottom: `1px solid ${border}`, background: i % 2 === 0 ? card : rowAlt }}>
                <td style={{ padding: "14px 16px", color: muted, fontSize: 13, fontWeight: 600 }}>{i + 1}</td>
                <td style={{ padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {org.logo_url
                      ? <img src={org.logo_url} alt="" style={{ width: 34, height: 34, borderRadius: 8, objectFit: "contain", border: `1px solid ${border}` }} />
                      : <div style={{ width: 34, height: 34, borderRadius: 8, background: "#2457b8", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 14, flexShrink: 0 }}>{(org.organization_name || org.username || "O")[0].toUpperCase()}</div>
                    }
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: text }}>{org.organization_name || org.username}</div>
                      <div style={{ fontSize: 12, color: muted }}>{org.username}</div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: "14px 16px", fontSize: 14, color: text }}>{org.organization_type || "—"}</td>
                <td style={{ padding: "14px 16px", fontSize: 14, color: text }}>{org.contact_email || org.email}</td>
                <td style={{ padding: "14px 16px", fontSize: 14, color: text, whiteSpace: "nowrap" }}>{org.contact_phone || "—"}</td>
                <td style={{ padding: "14px 16px", fontSize: 14, color: text }}>{org.npi_number || "—"}</td>
                <td style={{ padding: "14px 16px", fontSize: 14, color: text }}>{org.ein_tax_id || "—"}</td>
                <td style={{ padding: "14px 16px", fontSize: 14, color: text }}>{org.admin_name || "—"}</td>
                <td style={{ padding: "14px 16px", fontSize: 13, color: text, maxWidth: 180 }}>{org.address || "—"}</td>
                <td style={{ padding: "14px 16px" }}>
                  <span style={{ padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", background: org.profile_completed ? "#dcfce7" : "#fef3c7", color: org.profile_completed ? "#15803d" : "#b45309" }}>
                    {org.profile_completed ? "Complete" : "Incomplete"}
                  </span>
                </td>
                <td style={{ padding: "14px 16px" }}>
                  <button
                    onClick={() => handleDelete(org.user_id)}
                    style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#fee2e2", color: "#b91c1c", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
