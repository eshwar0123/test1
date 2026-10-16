import React, { useEffect, useMemo, useState } from "react";
import { fetchJson, apiFetch, decorateCase, modalityStyle, priorityColor } from "../utils/caseData";
import { makeReportDownloaders } from "../utils/reportDownloads";
import { th, td, card, pill, EmptyRow } from "./tableStyles";

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
  const [copied, setCopied] = useState(null);

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

  const copyLink = async (caseId, url) => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(caseId);
    setTimeout(() => setCopied((c) => (c === caseId ? null : c)), 2000);
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
              {["Patient ID", "Patient Name", "Uploaded", "Modality", "Study Type", "Priority", "Completed", "Assigned To", "Link", "Download"].map((h) => (
                <th key={h} style={th}>{h}</th>
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
                  <td style={{ ...td, color: "#059669", fontWeight: 700 }}>{r.patientId}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{r.patientName}</td>
                  <td style={{ ...td, fontFamily: "monospace", color: "#475569" }}>{r.uploadedAt}</td>
                  <td style={td}><span style={pill(ms.color, ms.bg)}>{r.modality}</span></td>
                  <td style={{ ...td, fontWeight: 600 }}>{r.studyType}</td>
                  <td style={td}><span style={{ color: priorityColor(r.priority), fontWeight: 700 }}>● {r.priority}</span></td>
                  <td style={{ ...td, fontFamily: "monospace", color: "#059669" }}>{r.completedAt}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{r.assignedTo}</td>
                  <td style={td}>
                    {(() => {
                      const l = links[r.caseId];
                      if (!l) return <span style={{ color: "#94a3b8" }}>—</span>;
                      const left = expiresIn(l.expires_at, now);
                      if (!left) {
                        return (
                          <span style={{ ...pill("#94a3b8", "#f1f5f9"), cursor: "not-allowed" }} title="This link has expired">Expired</span>
                        );
                      }
                      return (
                        <div style={{ display: "inline-flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                          <button
                            onClick={() => copyLink(r.caseId, l.url)}
                            title="Copy the patient link"
                            style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
                          >
                            {copied === r.caseId ? "Copied ✓" : "Copy link"}
                          </button>
                          <span style={{ fontSize: 11, color: "#64748b" }}>{left}</span>
                        </div>
                      );
                    })()}
                  </td>
                  <td style={td}>
                    <div style={{ display: "inline-flex", gap: 8 }}>
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
