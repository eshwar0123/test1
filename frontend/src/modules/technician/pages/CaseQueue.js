import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchJson, decorateWfCase, modalityStyle, priorityColor } from "../utils/caseData";
import { openCaseInEditor } from "../utils/openCaseInEditor";
import { th, td, card, pill, EmptyRow } from "./tableStyles";

const TABS = ["All", "Critical", "Urgent", "Routine"];

// Same data as the organization's "Case Queue" card
// (GET /organization/dashboard/workflow-cases) + a Report column whose edit
// icon opens that case in the radiologist report editor.
export default function CaseQueue() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("All");
  const [opening, setOpening] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchJson("/organization/dashboard/workflow-cases")
        .then((d) => { if (alive && Array.isArray(d?.cases)) { setRows(d.cases.map(decorateWfCase)); setError(""); } })
        .catch((e) => alive && setError(e.message || "Failed to load cases"))
        .finally(() => alive && setLoading(false));
    load();
    const id = setInterval(load, 30000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const counts = useMemo(() => ({
    Critical: rows.filter((r) => r.priority === "STAT" || r.priority === "Critical").length,
    Urgent: rows.filter((r) => r.priority === "Urgent").length,
    Routine: rows.filter((r) => r.priority === "Routine").length,
  }), [rows]);

  const shown = rows.filter((r) =>
    tab === "All" ? true
      : tab === "Critical" ? (r.priority === "STAT" || r.priority === "Critical")
      : r.priority === tab);

  const edit = async (r) => {
    setOpening(r.caseId);
    try {
      await openCaseInEditor(navigate, r.caseId, { patientName: r.patientName, study: r.studyType, modality: r.modality });
    } catch (e) {
      setError(e.message || "Could not open the report editor");
    } finally {
      setOpening(null);
    }
  };

  return (
    <div style={card}>
      <div style={{ background: "linear-gradient(135deg,#1e1b4b,#2563eb)", color: "#fff", padding: "22px 28px", display: "flex", alignItems: "center", gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, letterSpacing: 2, opacity: 0.8 }}>CASE QUEUE</div>
          <div style={{ fontSize: 30, fontWeight: 800 }}>{rows.length} Cases</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          {["Critical", "Urgent", "Routine"].map((k) => (
            <button
              key={k}
              onClick={() => setTab(tab === k ? "All" : k)}
              style={{
                minWidth: 92, padding: "10px 14px", borderRadius: 12, cursor: "pointer", color: "#fff",
                border: `1px solid ${tab === k ? "#fff" : "rgba(255,255,255,0.3)"}`,
                background: tab === k ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.1)",
              }}
            >
              <div style={{ fontSize: 20, fontWeight: 800, color: priorityColor(k) === "#3b82f6" ? "#93c5fd" : priorityColor(k) }}>{counts[k]}</div>
              <div style={{ fontSize: 11, letterSpacing: 1 }}>{k.toUpperCase()}</div>
            </button>
          ))}
        </div>
      </div>

      {error && <div style={{ padding: "10px 24px", color: "#b91c1c", background: "#fef2f2", fontSize: 14 }}>{error}</div>}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Patient ID", "Patient Name", "Uploaded", "Modality", "Study Type", "Priority", "Status", "Report"].map((h) => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <EmptyRow cols={8} text="Loading cases…" />}
            {!loading && shown.length === 0 && <EmptyRow cols={8} text="No cases in the queue" />}
            {shown.map((r, i) => {
              const ms = modalityStyle(r.modality);
              return (
                <tr key={`${r.caseId}-${i}`} style={{ background: i % 2 ? "#f8fafc" : "#fff" }}>
                  <td style={{ ...td, color: "#2563eb", fontWeight: 700 }}>{r.patientId}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{r.patientName}</td>
                  <td style={{ ...td, fontFamily: "monospace", color: "#475569" }}>{r.uploadedAt}</td>
                  <td style={td}><span style={pill(ms.color, ms.bg)}>{r.modality}</span></td>
                  <td style={{ ...td, fontWeight: 600 }}>{r.studyType}</td>
                  <td style={td}>
                    <span style={{ color: priorityColor(r.priority), fontWeight: 700 }}>● {r.priority}</span>
                  </td>
                  <td style={td}><span style={pill("#059669", "#d1fae5")}>● {r.status}</span></td>
                  <td style={td}>
                    <button
                      title="Edit report"
                      aria-label={`Edit report for ${r.caseId}`}
                      onClick={() => edit(r)}
                      disabled={opening === r.caseId}
                      style={{
                        width: 34, height: 34, borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff",
                        cursor: opening === r.caseId ? "wait" : "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center",
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                      </svg>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ padding: "12px 24px", color: "#94a3b8", fontSize: 13, borderTop: "1px solid #e2e8f0" }}>
        Showing {shown.length} of {rows.length} cases · {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
      </div>
    </div>
  );
}
