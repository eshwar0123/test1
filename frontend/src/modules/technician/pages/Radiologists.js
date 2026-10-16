import React, { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../utils/caseData";
import { th, td, card, pill, EmptyRow } from "./tableStyles";

// Technician-managed radiologists (organizations with assign_by_technician).
// Creating one makes both the login (core_schema.users) and the radiologist
// profile in a single request; the radiologist then signs in at /radiologist/login.

const EMPTY = { name: "", email: "", dmc_no: "", password: "", signature: null };
const field = {
  padding: "9px 12px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14, width: "100%", boxSizing: "border-box",
};
const label = { display: "block", fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 4, letterSpacing: 0.5 };
const btn = (primary) => ({
  padding: "8px 16px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer",
  border: primary ? "none" : "1px solid #cbd5e1", background: primary ? "#2563eb" : "#fff", color: primary ? "#fff" : "#0f172a",
});

const POLICY = "At least 8 characters with an uppercase letter, a lowercase letter and a digit.";

export default function Radiologists() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState(null); // null = closed; { ...EMPTY, user_id? } = add / edit
  const [saving, setSaving] = useState(false);
  const [secret, setSecret] = useState(null); // { name, email, password } shown once

  const load = useCallback(() => {
    apiFetch("/technician/radiologists")
      .then((j) => { setRows(j.data || []); setError(""); })
      .catch((e) => { setRows((r) => r || []); setError(e.message || "Failed to load radiologists"); });
  }, []);
  useEffect(load, [load]);

  const editing = !!form?.user_id;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const fd = new FormData();
    fd.append("name", form.name);
    fd.append("email", form.email);
    fd.append("dmc_no", form.dmc_no);
    if (form.signature) fd.append("signature", form.signature);
    if (!editing) fd.append("password", form.password);
    setSaving(true);
    try {
      if (editing) {
        await apiFetch(`/technician/radiologists/${form.user_id}`, { method: "PUT", body: fd });
      } else {
        await apiFetch("/technician/radiologists", { method: "POST", body: fd });
        setSecret({ name: form.name, email: form.email, password: form.password });
      }
      setForm(null);
      setError("");
      load();
    } catch (err) {
      setError(err.message || "Could not save the radiologist");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (r) => {
    const fd = new FormData();
    fd.append("is_active", String(!r.is_active));
    try {
      await apiFetch(`/technician/radiologists/${r.user_id}`, { method: "PUT", body: fd });
      load();
    } catch (err) {
      setError(err.message || "Could not update the radiologist");
    }
  };

  const resetPassword = async (r) => {
    if (!window.confirm(`Generate a new password for ${r.name}? Their current password stops working.`)) return;
    try {
      const j = await apiFetch(`/technician/radiologists/${r.user_id}/reset-password`, { method: "POST" });
      setSecret({ name: r.name, email: r.email, password: j.data.password });
    } catch (err) {
      setError(err.message || "Could not reset the password");
    }
  };

  return (
    <div style={card}>
      <div style={{ background: "linear-gradient(135deg,#1e1b4b,#2563eb)", color: "#fff", padding: "22px 28px", display: "flex", alignItems: "center", gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, letterSpacing: 2, opacity: 0.8 }}>RADIOLOGISTS</div>
          <div style={{ fontSize: 30, fontWeight: 800 }}>{rows ? rows.length : "…"} Radiologists</div>
        </div>
        <button style={{ ...btn(false), marginLeft: "auto" }} onClick={() => { setSecret(null); setForm({ ...EMPTY }); }}>
          + Add radiologist
        </button>
      </div>

      {error && <div style={{ padding: "10px 24px", color: "#b91c1c", background: "#fef2f2", fontSize: 14 }}>{error}</div>}

      {secret && (
        <div style={{ padding: "14px 24px", background: "#ecfdf5", color: "#065f46", fontSize: 14, borderBottom: "1px solid #a7f3d0" }}>
          <strong>Login details for {secret.name}</strong> — share them securely. This password is shown only once.
          <div style={{ marginTop: 6, fontFamily: "monospace" }}>
            Email: {secret.email} &nbsp;·&nbsp; Password: {secret.password} &nbsp;·&nbsp; Sign in at /radiologist/login
          </div>
          <button style={{ ...btn(false), marginTop: 8 }} onClick={() => navigator.clipboard?.writeText(`Email: ${secret.email}\nPassword: ${secret.password}`)}>
            Copy
          </button>{" "}
          <button style={{ ...btn(false), marginTop: 8 }} onClick={() => setSecret(null)}>Dismiss</button>
        </div>
      )}

      {form && (
        <form onSubmit={submit} style={{ padding: 24, borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
          <div style={{ fontWeight: 800, marginBottom: 14 }}>{editing ? "Edit radiologist" : "Add radiologist"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
            <div><label style={label}>NAME</label><input style={field} required value={form.name} onChange={set("name")} /></div>
            <div><label style={label}>EMAIL</label><input style={field} type="email" required value={form.email} onChange={set("email")} /></div>
            <div><label style={label}>DMC NO</label><input style={field} required value={form.dmc_no} onChange={set("dmc_no")} /></div>
            {!editing && (
              <div>
                <label style={label}>PASSWORD</label>
                <input style={field} type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={set("password")} />
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>{POLICY}</div>
              </div>
            )}
            <div>
              <label style={label}>E-SIGN (PNG or JPG, max 2 MB){editing ? " — leave empty to keep" : ""}</label>
              <input
                type="file" accept="image/png,image/jpeg" required={!editing}
                onChange={(e) => setForm((f) => ({ ...f, signature: e.target.files?.[0] || null }))}
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button type="submit" style={btn(true)} disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Create radiologist"}</button>
            <button type="button" style={btn(false)} onClick={() => setForm(null)}>Cancel</button>
          </div>
        </form>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>{["Name", "Email", "DMC No", "Radiologist ID", "Status", "Actions"].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows === null && <EmptyRow cols={6} text="Loading radiologists…" />}
            {rows && rows.length === 0 && <EmptyRow cols={6} text="No radiologists yet — add one to start assigning cases" />}
            {(rows || []).map((r, i) => (
              <tr key={r.user_id} style={{ background: i % 2 ? "#f8fafc" : "#fff", opacity: r.is_active ? 1 : 0.65 }}>
                <td style={{ ...td, fontWeight: 700 }}>{r.name}</td>
                <td style={td}>{r.email}</td>
                <td style={td}>{r.dmc_no || "—"}</td>
                <td style={{ ...td, fontFamily: "monospace", color: "#475569" }}>{r.rad_id}</td>
                <td style={td}>
                  {r.is_active ? <span style={pill("#059669", "#d1fae5")}>● Active</span> : <span style={pill("#64748b", "#e2e8f0")}>● Inactive</span>}
                </td>
                <td style={td}>
                  <div style={{ display: "inline-flex", gap: 8 }}>
                    <button style={btn(false)} onClick={() => { setSecret(null); setForm({ user_id: r.user_id, name: r.name, email: r.email, dmc_no: r.dmc_no, password: "", signature: null }); }}>Edit</button>
                    <button style={btn(false)} onClick={() => toggleActive(r)}>{r.is_active ? "Deactivate" : "Activate"}</button>
                    <button style={btn(false)} onClick={() => resetPassword(r)}>Reset password</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
