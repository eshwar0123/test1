// Shared row mapping for the Technician pages — mirrors decorateCase /
// decorateWfCase in organization/views/dashboard/Dashboard.js so the same
// backend rows render identically.
import { API_BASE_DASH, readToken } from "./reportDownloads";

export const MODALITY_STYLES = {
  CT:    { color: "#2563eb", bg: "rgba(59,130,246,0.14)" },
  MRI:   { color: "#7c3aed", bg: "rgba(139,92,246,0.14)" },
  XR:    { color: "#0891b2", bg: "rgba(6,182,212,0.16)" },
  US:    { color: "#059669", bg: "rgba(16,185,129,0.14)" },
  NM:    { color: "#d97706", bg: "rgba(217,119,6,0.14)" },
  PET:   { color: "#dc2626", bg: "rgba(239,68,68,0.14)" },
  OTHER: { color: "#475569", bg: "rgba(148,163,184,0.2)" },
};
export const PRIORITY_COLORS = { STAT: "#ef4444", Critical: "#ef4444", Urgent: "#f59e0b", Routine: "#3b82f6" };

export const modalityStyle = (t) => MODALITY_STYLES[String(t || "").toUpperCase()] || MODALITY_STYLES.OTHER;
export const priorityColor = (p) => PRIORITY_COLORS[String(p || "")] || "#94a3b8";

export const authHeaders = () => {
  const tok = readToken();
  return tok ? { Authorization: `Bearer ${tok}` } : {};
};

export async function fetchJson(path) {
  const r = await fetch(`${API_BASE_DASH}${path}`, { headers: authHeaders() });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// Authenticated call to the technician endpoints. Throws Error(detail) on non-2xx.
export async function apiFetch(path, options = {}) {
  const r = await fetch(`/api${path}`, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers || {}) },
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) {
    const d = j?.detail;
    throw new Error(typeof d === "string" ? d : Array.isArray(d) ? d.map((x) => x.msg).join(", ") : `HTTP ${r.status}`);
  }
  return j;
}

const drName = (n) => (n ? (/^\s*dr\b\.?/i.test(n) ? n : `Dr. ${n}`) : "Unassigned");

// workflow-cases row -> Case Queue row
export const decorateWfCase = (c) => ({
  caseId: c.case_id,
  patientId: (c.subject_id || "").toString().trim() || "—",
  patientName: (c.patient_name || "").trim() || "—",
  uploadedAt: c.uploaded_at || "—",
  modality: c.modality || "—",
  studyType: c.study_type || "—",
  priority: c.priority || "Routine",
  status: c.status || "Assigned",
  assignedRadId: c.assigned_rad_id || "",
});

// dashboard/cases "completed" row -> Completed Cases row
export const decorateCase = (c) => ({
  caseId: c.case_id,
  patientId: c.patient_id || "—",
  patientName: (c.patient_name || "").trim() || "—",
  uploadedAt: c.uploaded_at || "—",
  completedAt: c.completed_at || "—",
  modality: c.modality,
  studyType: c.study_type,
  priority: c.priority,
  assignedTo: drName(c.assigned_to),
  status: c.status || null,
  hasReport: !!c.has_report,
});
