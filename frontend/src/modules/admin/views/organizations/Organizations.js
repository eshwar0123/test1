import React, { useEffect, useState } from "react";
import { useTheme } from "../../layout/ThemeContext";

// Same relative API address the dashboard uses (VITE_API_BASE_URL = /api in production).
const API_BASE =
  (typeof import.meta !== 'undefined' && import.meta.env &&
    (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE)) || '';

// Rows hidden from this admin page only (display filter; nothing is deleted from the database).
// Each entry is "organisation name|contact email", lower-case.
const HIDDEN_ORGS = new Set([
  "genphase|rjdk777@gmail.com",
  "genphase|eshwarramn2002@gmail.com",
  "vbc hospital|eshwarramn2002@gmail.com",
  "genphase hospitals|virudha000002@gmail.com",
  "cvxcvx|genphaseengg@gmail.com",
]);
const orgKey = (o) =>
  `${(o.organization_name || "").trim().toLowerCase()}|${(o.contact_email || o.email || "").trim().toLowerCase()}`;

const EMPTY_FORM = {
  organization_name: "",
  organization_type: "",
  contact_email: "",
  contact_phone: "",
  password: "",
};

function Field({ label, field, placeholder, hint, value, onChange, error, isDark, type = "text" }) {
  const text = isDark ? "#f1f5f9" : "#111827";
  const muted = isDark ? "#94a3b8" : "#6b7280";
  const inputBg = isDark ? "#0f172a" : "#f9fafb";
  const inputBorder = isDark ? "#334155" : "#d1d5db";
  const labelColor = isDark ? "#cbd5e1" : "#374151";

  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: labelColor, marginBottom: 5 }}>{label}</label>
      <input
        type={type}
        autoComplete={type === "password" ? "new-password" : "off"}
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


function CredentialsView({ title, email, password, isDark, onDone }) {
  const [copied, setCopied] = useState(false);
  const card = isDark ? "#1e293b" : "#ffffff";
  const text = isDark ? "#f1f5f9" : "#111827";
  const muted = isDark ? "#94a3b8" : "#6b7280";
  const box = isDark ? "#0f172a" : "#f0f7ff";
  const border = isDark ? "#334155" : "#bfdbfe";

  const copy = async () => {
    const payload = `Email: ${email}\nPassword: ${password}`;
    try {
      await navigator.clipboard.writeText(payload);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = payload;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch { /* ignore */ }
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const row = { fontSize: 15, color: text, margin: 0, wordBreak: "break-all" };
  const lbl = { display: "inline-block", width: 86, color: muted, fontSize: 13, fontWeight: 600 };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: card, borderRadius: 16, width: "100%", maxWidth: 480, padding: "28px 32px", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <h3 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 800, color: text }}>{title}</h3>
        <p style={{ fontSize: 13, color: muted, margin: "0 0 18px" }}>
          Share these login details now. The password can't be viewed again after you close this.
        </p>
        <div style={{ background: box, border: `1px solid ${border}`, borderRadius: 10, padding: "14px 16px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ ...row, marginBottom: 8 }}><span style={lbl}>Email</span>{email}</p>
            <p style={row}><span style={lbl}>Password</span>{password}</p>
          </div>
          <button
            onClick={copy}
            title="Copy email and password"
            style={{ flexShrink: 0, padding: "7px 14px", borderRadius: 8, border: "1px solid #1e3a5f", background: copied ? "#15803d" : "transparent", borderColor: copied ? "#15803d" : "#1e3a5f", color: copied ? "#ffffff" : (isDark ? "#93c5fd" : "#1e3a5f"), fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}
          >
            {copied ? "Copied ✓" : "Copy"}
          </button>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
          <button onClick={onDone} style={{ padding: "9px 24px", borderRadius: 8, border: "none", background: "#1e3a5f", color: "#ffffff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Done</button>
        </div>
      </div>
    </div>
  );
}

function AddOrgModal({ onClose, onSuccess, isDark }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [created, setCreated] = useState(null);

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
    if (!form.password) e.password = "Password is required";
    else if (form.password.length < 6) e.password = "Password must be at least 6 characters";
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
      const res = await fetch(`${API_BASE}/admin/organizations/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          organization_name: form.organization_name,
          organization_type: form.organization_type,
          contact_email: form.contact_email,
          phone: form.contact_phone,
          password: form.password,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to create organisation");
      }
      setCreated({ email: form.contact_email, password: form.password });
    } catch (err) {
      setSubmitError(err.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  if (created) {
    return <CredentialsView title="Organisation Created" email={created.email} password={created.password} isDark={isDark} onDone={() => onSuccess(form)} />;
  }

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
        <Field label="Password" field="password" type="password" placeholder="Minimum 6 characters" value={form.password} onChange={handleChange} error={errors.password} isDark={isDark} />

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
            {submitting ? "Creating..." : "Create Organisation"}
          </button>
        </div>

        <p style={{ fontSize: 12, color: muted, marginTop: 14, textAlign: "center" }}>
          The organisation can log in with this email and password and complete their profile.
        </p>
      </div>
    </div>
  );
}


function EditOrgModal({ item, onClose, onSuccess, isDark }) {
  const [form, setForm] = useState({
    organization_name: item.organization_name || "", organization_type: item.organization_type || "",
    contact_email: item.contact_email || item.email || "", phone: item.contact_phone || "",
    admin_name: item.admin_name || "",
    username: item.username || "", address: item.address || "",
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const card = isDark ? "#1e293b" : "#ffffff";
  const text = isDark ? "#f1f5f9" : "#111827";
  const muted = isDark ? "#94a3b8" : "#6b7280";
  const inputBg = isDark ? "#0f172a" : "#f9fafb";
  const inputBorder = isDark ? "#334155" : "#d1d5db";
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const handleSubmit = async () => {
    const e = {};
    if (!form.organization_name.trim()) e.organization_name = "Organisation name is required";
    if (!form.contact_email.trim()) e.contact_email = "Contact email is required";
    else if (!emailRe.test(form.contact_email)) e.contact_email = "Invalid email";
    if (!form.username.trim()) e.username = "Username is required";
    if (Object.keys(e).length > 0) { setErrors(e); return; }
    setSubmitting(true);
    setSubmitError("");
    const auth = (() => { try { return JSON.parse(localStorage.getItem("auth") || "null"); } catch { return null; } })();
    const token = auth?.token || auth?.access_token;
    try {
      const res = await fetch(`${API_BASE}/admin/organizations/${item.user_id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.detail === "string" ? data.detail : "Failed to save changes");
      }
      onSuccess();
    } catch (err) {
      setSubmitError(err.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: card, borderRadius: 16, width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto", padding: "28px 32px", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: text }}>Edit Organisation</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: muted, lineHeight: 1 }}>&times;</button>
        </div>
        <Field label="Organisation Name" field="organization_name" value={form.organization_name} onChange={handleChange} error={errors.organization_name} isDark={isDark} />
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: isDark ? "#cbd5e1" : "#374151", marginBottom: 5 }}>Type</label>
          <select
            value={form.organization_type}
            onChange={(e) => handleChange("organization_type", e.target.value)}
            style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${inputBorder}`, background: inputBg, color: text, fontSize: 14, outline: "none" }}
          >
            <option value="">Select type</option>
            {["Hospital", "Clinic", "Diagnostic Center", "Imaging Center", "Other"].concat(
              form.organization_type && !["Hospital", "Clinic", "Diagnostic Center", "Imaging Center", "Other"].includes(form.organization_type) ? [form.organization_type] : []
            ).map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <Field label="Contact Email" field="contact_email" value={form.contact_email} onChange={handleChange} error={errors.contact_email} isDark={isDark} />
        <Field label="Phone" field="phone" value={form.phone} onChange={handleChange} error={errors.phone} isDark={isDark} />
        <Field label="Admin Name" field="admin_name" value={form.admin_name} onChange={handleChange} error={errors.admin_name} isDark={isDark} />
        <Field label="Username" field="username" value={form.username} onChange={handleChange} error={errors.username} isDark={isDark} />
        <Field label="Address" field="address" value={form.address} onChange={handleChange} error={errors.address} isDark={isDark} />

        {submitError && (
          <div style={{ background: "#fee2e2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", marginBottom: 16, color: "#b91c1c", fontSize: 13 }}>{submitError}</div>
        )}
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 8 }}>
          <button onClick={onClose} style={{ padding: "9px 20px", borderRadius: 8, border: `1px solid ${inputBorder}`, background: "transparent", color: text, fontWeight: 600, fontSize: 14, cursor: "pointer" }}>Cancel</button>
          <button onClick={handleSubmit} disabled={submitting} style={{ padding: "9px 24px", borderRadius: 8, border: "none", background: submitting ? "#93c5fd" : "#1e3a5f", color: "#ffffff", fontWeight: 700, fontSize: 14, cursor: submitting ? "not-allowed" : "pointer" }}>
            {submitting ? "Saving..." : "Save Changes"}
          </button>
        </div>
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
  const [editing, setEditing] = useState(null);

  const fetchOrgs = () => {
    const auth = (() => { try { return JSON.parse(localStorage.getItem("auth") || "null"); } catch { return null; } })();
    const token = auth?.token || auth?.access_token;
    if (!token) { setError("Not logged in"); setLoading(false); return; }

    // Real organisations (organization_schema.org_profile) with their case counts.
    fetch(`${API_BASE}/admin/directory/organizations`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => { if (!res.ok) throw new Error(); return res.json(); })
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setOrgs(list.filter((o) => !HIDDEN_ORGS.has(orgKey(o))));
        setLoading(false);
      })
      .catch(() => { setError("Could not load organisations from the server."); setLoading(false); });
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

  const handleAddSuccess = (newOrg) => {
    setShowAddModal(false);
    setSuccessMsg(`Organisation account created for ${newOrg.contact_email}`);
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

      {editing && (
        <EditOrgModal
          item={editing}
          isDark={isDark}
          onClose={() => setEditing(null)}
          onSuccess={() => { setEditing(null); setSuccessMsg("Organisation updated"); setTimeout(() => setSuccessMsg(""), 5000); fetchOrgs(); }}
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
              {["#", "Organisation", "Type", "Contact Email", "Phone", "Admin Name", "Username", "Address", "Cases", "Logo", "Profile", "Action"].map((h) => (
                <th key={h} style={{ padding: "13px 16px", textAlign: "left", fontSize: 12, fontWeight: 700, color: theadText, whiteSpace: "nowrap", letterSpacing: "0.04em", textTransform: "uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orgs.length === 0 ? (
              <tr><td colSpan={12} style={{ padding: 32, textAlign: "center", color: muted }}>No organisations found</td></tr>
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
                <td style={{ padding: "14px 16px", fontSize: 14, color: text }}>{org.username || <span style={{ color: "#f59e0b", fontWeight: 600 }}>NIL</span>}</td>
                <td style={{ padding: "14px 16px", fontSize: 13, color: text, maxWidth: 180 }}>{org.address || <span style={{ color: "#f59e0b", fontWeight: 600 }}>NIL</span>}</td>
                <td style={{ padding: "14px 16px", fontSize: 14, color: text, fontWeight: 700 }}>{org.cases ?? 0}</td>
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
                  <button onClick={() => setEditing(org)} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #1e3a5f", background: "transparent", color: isDark ? "#93c5fd" : "#1e3a5f", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
