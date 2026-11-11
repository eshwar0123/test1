import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchJson, decorateCase, modalityStyle, priorityColor } from "../utils/caseData";
import { makeReportDownloaders } from "../utils/reportDownloads";
import { openCaseInEditor } from "../utils/openCaseInEditor";
import { th, td, card, pill, EmptyRow } from "./tableStyles";

// Tighter cell padding than the shared styles so every column, Download included, fits on screen.
const thC = { ...th, padding: "12px 10px", fontSize: 11, letterSpacing: 1 };
const tdC = { ...td, padding: "12px 10px", fontSize: 13 };

// Same data + downloads as the organization's "Completed Cases" card
// (GET /organization/dashboard/cases -> completed[]).
export default function CompletedCases() {
  const navigate = useNavigate();
  const [opening, setOpening] = useState(null);   // case_id whose report editor is being opened
  const [dashData, setDashData] = useState(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [downloadingCase, setDownloadingCase] = useState(null);
  const [downloadingFmt, setDownloadingFmt] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchJson("/organization/dashboard/cases")
        .then((d) => { if (alive) { setDashData(d); setError(""); } })
        .catch((e) => alive && setError(e.message || "Failed to load cases"));
    load();
    const id = setInterval(load, 30000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const rows = useMemo(
    () => (Array.isArray(dashData?.completed) ? dashData.completed.map(decorateCase) : []),
    [dashData],
  );

  const { handleDownloadCase, handleDownloadWord } = useMemo(
    () =>
      makeReportDownloaders({
        setDownloadingCase,
        setDownloadingFmt,
        setDashToast: setToast,
        dashData,
      }),
    [dashData],
  );

  const k = dashData?.kpis?.completed || {};
  const urgent = rows.filter((r) => r.priority === "Urgent" || r.priority === "STAT").length;
  const routine = rows.filter((r) => r.priority === "Routine").length;

  // Reopen a submitted report in the editor. After the radiologist's report is edited and
  // submitted again, the PDF / Word downloads below carry the edited report.
  const edit = async (r) => {
    setOpening(r.caseId);
    try {
      await openCaseInEditor(navigate, r.caseId, { patientName: r.patientName, study: r.studyType, modality: r.modality });
    } catch (e) {
      setToast({ kind: "error", text: e.message || "Could not open the report editor" });
      setTimeout(() => setToast(null), 5000);
    } finally {
      setOpening(null);
    }
  };

  const busy = (r, fmt) => downloadingCase === r.caseId && downloadingFmt === fmt;

  const iconBtn = (title, onClick, disabled, children) => (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 36, height: 36, borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff",
        cursor: disabled ? "wait" : "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontWeight: 800, fontSize: 11,
      }}
    >
      {children}
    </button>
  );

  return (
    <div style={card}>
      <div style={{ background: "linear-gradient(135deg,#064e3b,#059669)", color: "#fff", padding: "22px 28px", display: "flex", alignItems: "center", gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, letterSpacing: 2, opacity: 0.8 }}>COMPLETED CASES</div>
          <div style={{ fontSize: 30, fontWeight: 800 }}>{rows.length} Cases</div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>
            {k.avg_tat_hours != null ? `Avg TAT ${k.avg_tat_hours}h · ` : ""}
            {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          {[["Urgent", urgent], ["Routine", routine], ["Avg TAT", k.avg_tat_hours != null ? `${k.avg_tat_hours}h` : "—"]].map(([l, v]) => (
            <div key={l} style={{ minWidth: 84, padding: "10px 14px", borderRadius: 12, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.3)", textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{v}</div>
              <div style={{ fontSize: 11 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {error && <div style={{ padding: "10px 24px", color: "#b91c1c", background: "#fef2f2", fontSize: 14 }}>{error}</div>}
      {toast && (
        <div style={{ padding: "10px 24px", fontSize: 14, color: toast.kind === "error" ? "#b91c1c" : "#047857", background: toast.kind === "error" ? "#fef2f2" : "#ecfdf5" }}>
          {toast.text}
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Patient ID", "Patient Name", "Uploaded", "Modality", "Study Type", "Priority", "Completed", "Assigned To", "Edit", "Download"].map((h) => (
                <th key={h} style={h === "Download" ? { ...thC, position: "sticky", right: 0, zIndex: 1, boxShadow: "-6px 0 8px -6px rgba(15,23,42,0.18)" } : thC}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!dashData && !error && <EmptyRow cols={10} text="Loading cases…" />}
            {dashData && rows.length === 0 && <EmptyRow cols={10} text="No completed cases yet" />}
            {rows.map((r, i) => {
              const ms = modalityStyle(r.modality);
              return (
                <tr key={`${r.caseId}-${i}`} style={{ background: i % 2 ? "#f8fafc" : "#fff" }}>
                  <td style={{ ...tdC, color: "#059669", fontWeight: 700 }}>{r.patientId}</td>
                  <td style={{ ...tdC, fontWeight: 700 }}>{r.patientName}</td>
                  <td style={{ ...tdC, fontFamily: "monospace", color: "#475569" }}>{r.uploadedAt}</td>
                  <td style={tdC}><span style={pill(ms.color, ms.bg)}>{r.modality}</span></td>
                  <td style={{ ...tdC, fontWeight: 600, maxWidth: 190, wordBreak: "break-word" }}>{r.studyType}</td>
                  <td style={tdC}><span style={{ color: priorityColor(r.priority), fontWeight: 700, whiteSpace: "nowrap" }}>● {r.priority}</span></td>
                  <td style={{ ...tdC, fontFamily: "monospace", color: "#059669" }}>{r.completedAt}</td>
                  <td style={{ ...tdC, fontWeight: 600 }}>{r.assignedTo}</td>
                  <td style={tdC}>
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
                  <td style={{ ...tdC, position: "sticky", right: 0, background: i % 2 ? "#f8fafc" : "#fff", boxShadow: "-6px 0 8px -6px rgba(15,23,42,0.18)" }}>
                    <div style={{ display: "inline-flex", gap: 6 }}>
                      {iconBtn("Download PDF report", () => handleDownloadCase(r), busy(r, "pdf"),
                        <span style={{ color: "#dc2626" }}>{busy(r, "pdf") ? "…" : "PDF"}</span>)}
                      {iconBtn("Download Word report", () => handleDownloadWord(r), busy(r, "word"),
                        <span style={{ color: "#1d4ed8" }}>{busy(r, "word") ? "…" : "DOC"}</span>)}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ padding: "12px 24px", color: "#94a3b8", fontSize: 13, borderTop: "1px solid #e2e8f0" }}>
        Showing {rows.length} completed case{rows.length === 1 ? "" : "s"}
      </div>
    </div>
  );
}
