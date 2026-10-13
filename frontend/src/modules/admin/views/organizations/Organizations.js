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

const EMPTY_FORM = {
  organization_name: "",
  organization_type: "",
  contact_email: "",
  contact_phone: "",
  admin_name: "",
};

function Field({ label, field, placeholder, hint, value, onChange, error, isDark }) {
  const text = isDark ? "#f1f5f9" : "#111827";
  const muted = isDark ? "#94a3b8" : "#6b7280";
  const inputBg = isDark ? "#0f172a" : "#f9fafb";
  const inputBorder = isDark ? "#334155" : "#d1d5db";
  const labelColor = isDark ? "#cbd5e1" : "#374151";

  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: labelColor, marginBottom: 5 }}>{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(field, e.target.value)}
        placeholder={placeholder || ""}
        style={{
          width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${error ? "#ef4444" : inputBorder}`,
          background: inputBg, color: text, fontSize: 14, outline: "none", boxSizing: "border-box",
        }}
      />
      {hint && !error && <p style={{ fontSize: 11, color: muted, margin: "3px 0 0" }}>{hint}</p>}
      {error && <p style={{ fontSize: 11, color: "#ef4444", margin: "3px 0 0" }}>{error}</p>}
    </div>
  );
}

function AddOrgModal({ onClose, onSuccess, isDark }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const card = isDark ? "#1e293b" : "#ffffff";
  const text = isDark ? "#f1f5f9" : "#111827";
  const muted = isDark ? "#94a3b8" : "#6b7280";
  const inputBg = isDark ? "#0f172a" : "#f9fafb";
  const inputBorder = isDark ? "#334155" : "#d1d5db";
  const overlay = "rgba(0,0,0,0.55)";

  const validate = () => {
    const e = {};
    if (!form.organization_name.trim()) e.organization_name = "Organisation name is required";
    if (!form.organization_type.trim()) e.organization_type = "Type is required";
    if (!form.contact_email.trim()) e.contact_email = "Contact email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contact_email)) e.contact_email = "Invalid email";
    if (!form.contact_phone.trim()) e.contact_phone = "Phone is required";
    if (!form.admin_name.trim()) e.admin_name = "Admin name is required";
    return e;
  };

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const handleSubmit = async () => {
    const e = validate();
    if (Object.keys(e).length > 0) { setErrors(e); return; }

    setSubmitting(true);
    setSubmitError("");

    const auth = (() => { try { return JSON.parse(localStorage.getItem("auth") || "null"); } catch { return null; } })();
    const token = auth?.token || auth?.access_token;

    try {
      const res = await fetch("http://127.0.0.1:8000/admin/organizations/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to send invite");
      }
      onSuccess(form);
    } catch (err) {
      setSubmitError(err.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: overlay, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: card, borderRadius: 16, width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto", padding: "28px 32px", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: text }}>Add New Organisation</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: muted, lineHeight: 1 }}>&times;</button>
        </div>

        <Field label="Organisation Name" field="organization_name" placeholder="e.g. Apollo Diagnostics" value={form.organization_name} onChange={handleChange} error={errors.organization_name} isDark={isDark} />

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: isDark ? "#cbd5e1" : "#374151", marginBottom: 5 }}>Type</label>
          <select
            value={form.organization_type}
            onChange={(e) => handleChange("organization_type", e.target.value)}
            style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${errors.organization_type ? "#ef4444" : inputBorder}`, background: inputBg, color: text, fontSize: 14, outline: "none" }}
          >
            <option value="">Select type</option>
            <option value="Hospital">Hospital</option>
            <option value="Clinic">Clinic</option>
            <option value="Diagnostic Center">Diagnostic Center</option>
            <option value="Imaging Center">Imaging Center</option>
            <option value="Other">Other</option>
          </select>
          {errors.organization_type && <p style={{ fontSize: 11, color: "#ef4444", margin: "3px 0 0" }}>{errors.organization_type}</p>}
        </div>

        <Field label="Contact Email" field="contact_email" placeholder="admin@example.com" value={form.contact_email} onChange={handleChange} error={errors.contact_email} isDark={isDark} />
        <Field label="Phone" field="contact_phone" placeholder="e.g. (044) 123-4567" value={form.contact_phone} onChange={handleChange} error={errors.contact_phone} isDark={isDark} />
        <Field label="Admin Name" field="admin_name" placeholder="e.g. Dr. John Smith" value={form.admin_name} onChange={handleChange} error={errors.admin_name} isDark={isDark} />

        {submitError && (
          <div style={{ background: "#fee2e2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", marginBottom: 16, color: "#b91c1c", fontSize: 13 }}>
            {submitError}
          </div>
        )}

        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 8 }}>
          <button onClick={onClose} style={{ padding: "9px 20px", borderRadius: 8, border: `1px solid ${inputBorder}`, background: "transparent", color: text, fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{ padding: "9px 24px", borderRadius: 8, border: "none", background: submitting ? "#93c5fd" : "#1e3a5f", color: "#ffffff", fontWeight: 700, fontSize: 14, cursor: submitting ? "not-allowed" : "pointer" }}
          >
            {submitting ? "Sending Invite..." : "Send Invite"}
          </button>
        </div>

        <p style={{ fontSize: 12, color: muted, marginTop: 14, textAlign: "center" }}>
          An invitation link will be sent to the contact email to complete registration.
        </p>
      </div>
    </div>
  );
}

export default function Organizations() {
  const { isDark } = useTheme();
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  const fetchOrgs = () => {
    const auth = (() => { try { return JSON.parse(localStorage.getItem("auth") || "null"); } catch { return null; } })();
    const token = auth?.token || auth?.access_token;
    if (!token) { setError("Not logged in"); setLoading(false); return; }

    fetch("http://127.0.0.1:8000/admin/organizations", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => { if (!res.ok) throw new Error(); return res.json(); })
      .then((data) => { setOrgs(data.length ? data : DUMMY_ORGS); setLoading(false); })
      .catch(() => { setOrgs(DUMMY_ORGS); setLoading(false); });
  };

  useEffect(() => { fetchOrgs(); }, []);

  const card = isDark ? "var(--bg-card)" : "#ffffff";
  const border = isDark ? "var(--border)" : "#dbeafe";
  const text = isDark ? "var(--text)" : "#111827";
  const muted = isDark ? "var(--text-muted)" : "#6b7280";
  const page = isDark ? "var(--bg-page)" : "#f0f7ff";
  const theadBg = isDark ? "#1e293b" : "#1e3a5f";
  const theadText = "#ffffff";
  const rowAlt = isDark ? "rgba(255,255,255,0.02)" : "#f0f7ff";

  const handleDelete = (id) => {
    if (!window.confirm("Delete this organisation? This cannot be undone.")) return;
    const auth = (() => { try { return JSON.parse(localStorage.getItem("auth") || "null"); } catch { return null; } })();
    const token = auth?.token || auth?.access_token;
    fetch(`http://127.0.0.1:8000/admin/organizations/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }).then(() => setOrgs((prev) => prev.filter((o) => o.id !== id)));
  };

  const handleAddSuccess = (newOrg) => {
    setShowAddModal(false);
    setSuccessMsg(`Invitation sent to ${newOrg.contact_email}`);
    setTimeout(() => setSuccessMsg(""), 5000);
    fetchOrgs();
  };

  if (loading) return <p style={{ textAlign: "center", marginTop: 40, color: muted }}>Loading...</p>;
  if (error) return <p style={{ textAlign: "center", marginTop: 40, color: "#ef4444" }}>{error}</p>;

  return (
    <div style={{ padding: "24px 28px", background: page, minHeight: "100%" }}>
      {showAddModal && (
        <AddOrgModal
          isDark={isDark}
          onClose={() => setShowAddModal(false)}
          onSuccess={handleAddSuccess}
        />
      )}

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: text, margin: 0 }}>Organisations</h2>
          <p style={{ fontSize: 14, color: muted, marginTop: 4 }}>{orgs.length} registered organisation{orgs.length !== 1 ? "s" : ""}</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "#1e3a5f", color: "#ffffff", fontWeight: 700, fontSize: 14, cursor: "pointer", whiteSpace: "nowrap", marginTop: 4 }}
        >
          + Add Organization  
        </button>
      </div>

      {successMsg && (
        <div style={{ background: "#dcfce7", border: "1px solid #bbf7d0", borderRadius: 10, padding: "12px 18px", marginBottom: 20, color: "#15803d", fontSize: 14, fontWeight: 600 }}>
          {successMsg}
        </div>
      )}

      <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 14, overflow: "auto", boxShadow: "0 4px 16px rgba(30,58,95,0.08)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
          <thead>
            <tr style={{ background: theadBg }}>
              {["#", "Organisation", "Type", "Contact Email", "Phone", "Admin Name", "NPI Number", "EIN / Tax ID", "Username", "Address", "Logo", "Profile", "Action"].map((h) => (
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
                <td style={{ padding: "14px 16px", fontSize: 14, color: text }}>{org.organization_type || "NIL"}</td>
                <td style={{ padding: "14px 16px", fontSize: 14, color: text }}>{org.contact_email || org.email || "NIL"}</td>
                <td style={{ padding: "14px 16px", fontSize: 14, color: text, whiteSpace: "nowrap" }}>{org.contact_phone || "NIL"}</td>
                <td style={{ padding: "14px 16px", fontSize: 14, color: text }}>{org.admin_name || "NIL"}</td>
                <td style={{ padding: "14px 16px", fontSize: 14, color: text }}>{org.npi_number || <span style={{ color: "#f59e0b", fontWeight: 600 }}>NIL</span>}</td>
                <td style={{ padding: "14px 16px", fontSize: 14, color: text }}>{org.ein_tax_id || <span style={{ color: "#f59e0b", fontWeight: 600 }}>NIL</span>}</td>
                <td style={{ padding: "14px 16px", fontSize: 14, color: text }}>{org.username || <span style={{ color: "#f59e0b", fontWeight: 600 }}>NIL</span>}</td>
                <td style={{ padding: "14px 16px", fontSize: 13, color: text, maxWidth: 180 }}>{org.address || <span style={{ color: "#f59e0b", fontWeight: 600 }}>NIL</span>}</td>
                <td style={{ padding: "14px 16px", fontSize: 13, color: text }}>
                  {org.logo_url
                    ? <img src={org.logo_url} alt="" style={{ width: 34, height: 34, borderRadius: 8, objectFit: "contain", border: `1px solid ${border}` }} />
                    : <span style={{ color: "#f59e0b", fontWeight: 600 }}>NIL</span>}
                </td>
                <td style={{ padding: "14px 16px" }}>
                  <span style={{ padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", background: org.profile_completed ? "#dcfce7" : "#fef3c7", color: org.profile_completed ? "#15803d" : "#b45309" }}>
                    {org.profile_completed ? "Complete" : "Incomplete"}
                  </span>
                </td>
                <td style={{ padding: "14px 16px" }}>
                  <button
                    onClick={() => handleDelete(org.id)}
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
