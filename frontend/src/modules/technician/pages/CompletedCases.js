import React, { useEffect, useMemo, useState } from "react";
import { fetchJson, apiFetch, decorateCase, modalityStyle, priorityColor } from "../utils/caseData";
import { makeReportDownloaders } from "../utils/reportDownloads";
import { th, td, card, pill, EmptyRow } from "./tableStyles";

// Tighter cell padding than the shared styles so every column, Download included, fits on screen.
const thC = { ...th, padding: "12px 10px", fontSize: 11, letterSpacing: 1 };
const tdC = { ...td, padding: "12px 10px", fontSize: 13 };

const CopyIcon = ({ done }) =>
  done ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );

// "Expires in 18h" / "Expires in 42m" for a link's expires_at.
function expiresIn(expiresAt, now) {
  const ms = new Date(expiresAt).getTime() - now;
  if (!(ms > 0)) return null;
  const mins = Math.floor(ms / 60000);
  return mins >= 60 ? `Expires in ${Math.floor(mins / 60)}h` : `Expires in ${Math.max(mins, 1)}m`;
}

// Same data + downloads as the organization's "Completed Cases" card
// (GET /organization/dashboard/cases -> completed[]).
export default function CompletedCases() {
  const [dashData, setDashData] = useState(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [downloadingCase, setDownloadingCase] = useState(null);
  const [downloadingFmt, setDownloadingFmt] = useState(null);
  const [links, setLinks] = useState({}); // case_id -> { url, expires_at }
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState(null);       // `${caseId}:link` | `${caseId}:pw`
  const [creating, setCreating] = useState(null);     // case_id whose link is being generated

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

  // Patient links for the listed cases; clock ticks so "Expires in" stays current.
  const caseIdsKey = rows.map((r) => r.caseId).filter(Boolean).join(",");
  useEffect(() => {
    if (!caseIdsKey) return undefined;
    let alive = true;
    apiFetch(`/technician/patient-links?case_ids=${encodeURIComponent(caseIdsKey)}`)
      .then((j) => alive && setLinks(j.data || {}))
      .catch(() => {});
    return () => { alive = false; };
  }, [caseIdsKey, dashData]); // dashData refreshes every 30s, so resubmitted cases pick up their new link
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const copyText = async (key, text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
  };

  // New link + new password for the same case (24h from now). The previous link stops working.
  const generateLink = async (caseId, hasActive) => {
    if (hasActive && !window.confirm("Create a new link and password? The current link will stop working.")) return;
    setCreating(caseId);
    try {
      const j = await apiFetch(`/technician/patient-links/${encodeURIComponent(caseId)}`, { method: "POST" });
      setLinks((prev) => ({ ...prev, [caseId]: j.data }));
      setNow(Date.now());
      setToast({ kind: "success", text: "New patient link created. Share the link and the password with the patient." });
    } catch (e) {
      setToast({ kind: "error", text: e.message || "Could not create the link" });
    } finally {
      setCreating(null);
      setTimeout(() => setToast(null), 5000);
    }
  };

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
              {["Patient ID", "Patient Name", "Uploaded", "Modality", "Study Type", "Priority", "Completed", "Assigned To", "Link", "Password", "Download"].map((h) => (
                <th key={h} style={h === "Download" ? { ...thC, position: "sticky", right: 0, zIndex: 1, boxShadow: "-6px 0 8px -6px rgba(15,23,42,0.18)" } : thC}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!dashData && !error && <EmptyRow cols={11} text="Loading cases…" />}
            {dashData && rows.length === 0 && <EmptyRow cols={11} text="No completed cases yet" />}
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
                  {(() => {
                    const l = links[r.caseId];
                    const left = l ? expiresIn(l.expires_at, now) : null;   // null = none / expired
                    const smallBtn = (primary) => ({
                      padding: "5px 10px", borderRadius: 8, fontWeight: 700, fontSize: 12, whiteSpace: "nowrap",
                      cursor: creating === r.caseId ? "wait" : "pointer",
                      border: `1px solid ${primary ? "#bfdbfe" : "#e2e8f0"}`,
                      background: primary ? "#eff6ff" : "#fff", color: primary ? "#1d4ed8" : "#475569",
                    });
                    const genBtn = (label, hasActive, primary) => (
                      <button
                        onClick={() => generateLink(r.caseId, hasActive)}
                        disabled={creating === r.caseId}
                        title={hasActive ? "Create a new link and password (the current one stops working)" : "Create a patient link and password"}
                        style={smallBtn(primary)}
                      >
                        {creating === r.caseId ? "Creating…" : label}
                      </button>
                    );
                    return (
                      <>
                        <td style={tdC}>
                          {left ? (
                            <div style={{ display: "inline-flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                              <button
                                onClick={() => copyText(`${r.caseId}:link`, l.url)}
                                title="Copy the patient link"
                                style={smallBtn(true)}
                              >
                                {copied === `${r.caseId}:link` ? "Copied ✓" : "Copy link"}
                              </button>
                              <span style={{ fontSize: 11, color: "#64748b" }}>{left}</span>
                              <button onClick={() => generateLink(r.caseId, true)} disabled={creating === r.caseId}
                                style={{ background: "none", border: "none", padding: 0, fontSize: 11, color: "#64748b", textDecoration: "underline", cursor: "pointer" }}>
                                New link
                              </button>
                            </div>
                          ) : l ? (
                            <div style={{ display: "inline-flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
                              <span style={{ ...pill("#94a3b8", "#f1f5f9"), cursor: "not-allowed" }} title="This link has expired">Expired</span>
                              {genBtn("Generate link", false, true)}
                            </div>
                          ) : (
                            genBtn("Generate link", false, true)
                          )}
                        </td>
                        <td style={tdC}>
                          {left && l.password ? (
                            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
                              <code style={{ fontFamily: "monospace", fontWeight: 800, fontSize: 13, letterSpacing: 1.5, color: "#0f172a", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 6, padding: "3px 7px", userSelect: "all" }}>
                                {l.password}
                              </code>
                              <button
                                onClick={() => copyText(`${r.caseId}:pw`, l.password)}
                                title={copied === `${r.caseId}:pw` ? "Copied" : "Copy password"}
                                aria-label="Copy password"
                                style={{ width: 28, height: 28, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0, borderRadius: 6, border: "none", background: "transparent", color: "#475569", cursor: "pointer" }}
                              >
                                <CopyIcon done={copied === `${r.caseId}:pw`} />
                              </button>
                            </div>
                          ) : (
                            <span style={{ color: "#94a3b8" }}>—</span>
                          )}
                        </td>
                      </>
                    );
                  })()}
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
