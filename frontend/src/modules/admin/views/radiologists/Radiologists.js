import React, { useEffect, useState } from "react";
import { useTheme } from "../../layout/ThemeContext";

const DUMMY_RADS = [
  { id: "d1", first_name: "Vivek",  last_name: "Rao",    username: "dr_vivek_rao",    contact_email: "vivek.rao@onixai.com",     contact_phone: "(044) 123-4567", workplace: "SRM Medical Hospital",  qualification: "MD Radiology",  designation: "Senior Radiologist",          location: "Chennai, India",    profile_image_path: "", profile_completed: true  },
  { id: "d2", first_name: "Suresh", last_name: "Nair",   username: "dr_suresh_nair",  contact_email: "suresh.nair@onixai.com",   contact_phone: "(011) 987-6543", workplace: "Max Hospital",          qualification: "DNB Radiology", designation: "Neuro Radiologist",            location: "Delhi, India",      profile_image_path: "", profile_completed: true  },
  { id: "d3", first_name: "Priya",  last_name: "Menon",  username: "dr_priya_menon",  contact_email: "priya.menon@onixai.com",   contact_phone: "(022) 456-7890", workplace: "Apollo Diagnostics",    qualification: "DMRD",          designation: "Consultant Radiologist",       location: "Mumbai, India",     profile_image_path: "", profile_completed: true  },
  { id: "d4", first_name: "Arun",   last_name: "Kumar",  username: "dr_arun_kumar",   contact_email: "arun.kumar@onixai.com",    contact_phone: "(080) 555-0123", workplace: "Fortis Scan Centre",    qualification: "MD Radiology",  designation: "Radiologist",                 location: "Bangalore, India",  profile_image_path: "", profile_completed: false },
  { id: "d5", first_name: "Meera",  last_name: "Iyer",   username: "dr_meera_iyer",   contact_email: "meera.iyer@onixai.com",    contact_phone: "(0416) 220-1234",workplace: "VCCMC Vellore",         qualification: "DNB Radiology", designation: "Stroke Imaging Specialist",    location: "Vellore, India",    profile_image_path: "", profile_completed: true  },
  { id: "d6", first_name: "Rajesh", last_name: "Pillai", username: "dr_rajesh_pillai",contact_email: "rajesh.pillai@onixai.com", contact_phone: "(040) 333-4444", workplace: "Care Imaging Centre",   qualification: "FRCR",          designation: "Interventional Radiologist",   location: "Hyderabad, India",  profile_image_path: "", profile_completed: true  },
  { id: "d7", first_name: "Ananya", last_name: "Das",    username: "dr_ananya_das",   contact_email: "ananya.das@onixai.com",    contact_phone: "(033) 222-1111", workplace: "",                      qualification: "MD Radiology",  designation: "Junior Radiologist",           location: "",                  profile_image_path: "", profile_completed: false },
];

const EMPTY_FORM = {
  first_name: "",
  last_name: "",
  contact_email: "",
  contact_phone: "",
  workplace: "",
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

function AddRadModal({ onClose, onSuccess, isDark }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const card = isDark ? "#1e293b" : "#ffffff";
  const text = isDark ? "#f1f5f9" : "#111827";
  const muted = isDark ? "#94a3b8" : "#6b7280";
  const inputBorder = isDark ? "#334155" : "#d1d5db";
  const overlay = "rgba(0,0,0,0.55)";

  const validate = () => {
    const e = {};
    if (!form.first_name.trim()) e.first_name = "First name is required";
    if (!form.last_name.trim()) e.last_name = "Last name is required";
    if (!form.contact_email.trim()) e.contact_email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contact_email)) e.contact_email = "Invalid email";
    if (!form.contact_phone.trim()) e.contact_phone = "Phone is required";
    if (!form.workplace.trim()) e.workplace = "Workplace is required";
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
      const res = await fetch("http://127.0.0.1:8000/admin/radiologists/invite", {
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
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: text }}>Add New Radiologist</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: muted, lineHeight: 1 }}>&times;</button>
        </div>

        <Field label="First Name" field="first_name" placeholder="e.g. Vivek" value={form.first_name} onChange={handleChange} error={errors.first_name} isDark={isDark} />
        <Field label="Last Name" field="last_name" placeholder="e.g. Rao" value={form.last_name} onChange={handleChange} error={errors.last_name} isDark={isDark} />
        <Field label="Email" field="contact_email" placeholder="doctor@example.com" value={form.contact_email} onChange={handleChange} error={errors.contact_email} isDark={isDark} />
        <Field label="Phone Number" field="contact_phone" placeholder="e.g. (044) 123-4567" value={form.contact_phone} onChange={handleChange} error={errors.contact_phone} isDark={isDark} />
        <Field label="Workplace (Lab / Hospital)" field="workplace" placeholder="e.g. SRM Medical Hospital" value={form.workplace} onChange={handleChange} error={errors.workplace} isDark={isDark} />

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
          An invitation link will be sent to the email to complete registration.
        </p>
      </div>
    </div>
  );
}

export default function Radiologists() {
  const { isDark } = useTheme();
  const [rads, setRads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  const fetchRads = () => {
    const auth = (() => { try { return JSON.parse(localStorage.getItem("auth") || "null"); } catch { return null; } })();
    const token = auth?.token || auth?.access_token;
    if (!token) { setError("Not logged in"); setLoading(false); return; }

    fetch("http://127.0.0.1:8000/admin/radiologists", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => { if (!res.ok) throw new Error(); return res.json(); })
      .then((data) => { setRads(data.length ? data : DUMMY_RADS); setLoading(false); })
      .catch(() => { setRads(DUMMY_RADS); setLoading(false); });
  };

  useEffect(() => { fetchRads(); }, []);

  const card = isDark ? "var(--bg-card)" : "#ffffff";
  const border = isDark ? "var(--border)" : "#dbeafe";
  const text = isDark ? "var(--text)" : "#111827";
  const muted = isDark ? "var(--text-muted)" : "#6b7280";
  const page = isDark ? "var(--bg-page)" : "#f0f7ff";
  const theadBg = isDark ? "#1e293b" : "#1e3a5f";
  const theadText = "#ffffff";
  const rowAlt = isDark ? "rgba(255,255,255,0.02)" : "#f0f7ff";

  const handleDelete = (id) => {
    if (!window.confirm("Delete this radiologist? This cannot be undone.")) return;
    const auth = (() => { try { return JSON.parse(localStorage.getItem("auth") || "null"); } catch { return null; } })();
    const token = auth?.token || auth?.access_token;
    fetch(`http://127.0.0.1:8000/admin/radiologists/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }).then(() => setRads((prev) => prev.filter((r) => r.id !== id)));
  };

  const handleAddSuccess = (newRad) => {
    setShowAddModal(false);
    setSuccessMsg(`Invitation sent to ${newRad.contact_email}`);
    setTimeout(() => setSuccessMsg(""), 5000);
    fetchRads();
  };

  if (loading) return <p style={{ textAlign: "center", marginTop: 40, color: muted }}>Loading...</p>;
  if (error) return <p style={{ textAlign: "center", marginTop: 40, color: "#ef4444" }}>{error}</p>;

  return (
    <div style={{ padding: "24px 28px", background: page, minHeight: "100%" }}>
      {showAddModal && (
        <AddRadModal
          isDark={isDark}
          onClose={() => setShowAddModal(false)}
          onSuccess={handleAddSuccess}
        />
      )}

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: text, margin: 0 }}>Radiologists</h2>
          <p style={{ fontSize: 14, color: muted, marginTop: 4 }}>{rads.length} registered radiologist{rads.length !== 1 ? "s" : ""}</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "#1e3a5f", color: "#ffffff", fontWeight: 700, fontSize: 14, cursor: "pointer", whiteSpace: "nowrap", marginTop: 4 }}
        >
          + Add Radiologist
        </button>
      </div>

      {successMsg && (
        <div style={{ background: "#dcfce7", border: "1px solid #bbf7d0", borderRadius: 10, padding: "12px 18px", marginBottom: 20, color: "#15803d", fontSize: 14, fontWeight: 600 }}>
          {successMsg}
        </div>
      )}

      <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 14, overflow: "auto", boxShadow: "0 4px 16px rgba(30,58,95,0.08)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
          <thead>
            <tr style={{ background: theadBg }}>
              {["#", "Radiologist", "Email", "Phone", "Workplace", "Username", "Qualification", "Designation", "Location", "Profile", "Action"].map((h) => (
                <th key={h} style={{ padding: "13px 16px", textAlign: "left", fontSize: 12, fontWeight: 700, color: theadText, whiteSpace: "nowrap", letterSpacing: "0.04em", textTransform: "uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rads.length === 0 ? (
              <tr><td colSpan={11} style={{ padding: 32, textAlign: "center", color: muted }}>No radiologists found</td></tr>
            ) : rads.map((rad, i) => {
              const initials = (`${rad.first_name || ''} ${rad.last_name || ''}`.trim() || "R").slice(0, 2).toUpperCase();
              return (
                <tr key={rad.id} style={{ borderBottom: `1px solid ${border}`, background: i % 2 === 0 ? card : rowAlt }}>
                  <td style={{ padding: "14px 16px", color: muted, fontSize: 13, fontWeight: 600 }}>{i + 1}</td>
                  <td style={{ padding: "14px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {rad.profile_image_path
                        ? <img src={`http://127.0.0.1:8000/${rad.profile_image_path}`} alt="" style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover", border: `1px solid ${border}` }} />
                        : <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#7c3aed", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 13, flexShrink: 0 }}>{initials}</div>
                      }
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: text }}>{`${rad.first_name || ''} ${rad.last_name || ''}`.trim()}</div>
                        {rad.username && <div style={{ fontSize: 12, color: muted }}>{rad.username}</div>}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: "14px 16px", fontSize: 14, color: text }}>{rad.contact_email}</td>
                  <td style={{ padding: "14px 16px", fontSize: 14, color: text, whiteSpace: "nowrap" }}>{rad.contact_phone}</td>
                  <td style={{ padding: "14px 16px", fontSize: 14, color: text }}>{rad.workplace || <span style={{ color: "#f59e0b", fontWeight: 600 }}>NIL</span>}</td>
                  <td style={{ padding: "14px 16px", fontSize: 14, color: text }}>{rad.username || <span style={{ color: "#f59e0b", fontWeight: 600 }}>NIL</span>}</td>
                  <td style={{ padding: "14px 16px", fontSize: 14, color: text }}>{rad.qualification || <span style={{ color: "#f59e0b", fontWeight: 600 }}>NIL</span>}</td>
                  <td style={{ padding: "14px 16px", fontSize: 14, color: text }}>{rad.designation || <span style={{ color: "#f59e0b", fontWeight: 600 }}>NIL</span>}</td>
                  <td style={{ padding: "14px 16px", fontSize: 14, color: text }}>{rad.location || <span style={{ color: "#f59e0b", fontWeight: 600 }}>NIL</span>}</td>
                  <td style={{ padding: "14px 16px" }}>
                    <span style={{ padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", background: rad.profile_completed ? "#dcfce7" : "#fef3c7", color: rad.profile_completed ? "#15803d" : "#b45309" }}>
                      {rad.profile_completed ? "Complete" : "Incomplete"}
                    </span>
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <button
                      onClick={() => handleDelete(rad.id)}
                      style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#fee2e2", color: "#b91c1c", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                    >
                      Delete
                    </button>
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
