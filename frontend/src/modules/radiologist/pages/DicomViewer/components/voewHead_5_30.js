import React from "react";
import logo from "/logo1.png";

export default function ViewerHeader({
  filename,
  isNifti,
  isCornerstoneNifti,
  isSeries,
  onToggleReport,
  onToggleFullscreen,
  isFullscreen,
  onCloseViewer,
  patientName,
  patientAge,
  patientSex,
  caseId,
}) {
  const scanType = isNifti ? "NIfTI" : "DICOM";
  const scanMode =
    (!isNifti || isCornerstoneNifti) && isSeries ? "Multiplanar" : "Single";

  const patientMeta = [
    patientSex,
    patientAge && `${patientAge}y`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <style>{`
        .vhdr-btn {
          cursor: pointer;
          border: none;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 500;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          transition: background 0.13s ease, box-shadow 0.13s ease;
          outline: none;
          white-space: nowrap;
          font-family: inherit;
        }
        .vhdr-btn:focus-visible { outline: 2px solid #3b82f6; outline-offset: 2px; }
        .vhdr-btn-primary { background: #1d4ed8; color: #fff; padding: 6px 14px; }
        .vhdr-btn-primary:hover { background: #2563eb; box-shadow: 0 0 0 1px rgba(59,130,246,0.4); }
        .vhdr-btn-ghost { background: #1f2937; color: #d1d5db; padding: 6px 10px; }
        .vhdr-btn-ghost:hover { background: #273548; color: #f3f4f6; }
        .vhdr-btn-close { background: #1f2937; color: #d1d5db; padding: 6px 10px; }
        .vhdr-btn-close:hover { background: #450a0a; color: #fca5a5; box-shadow: 0 0 0 1px rgba(239,68,68,0.35); }
      `}</style>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          background: "linear-gradient(180deg, #0e1520 0%, #0b0f16 100%)",
          borderBottom: "1px solid #1e2a3a",
          boxShadow: "0 1px 0 rgba(255,255,255,0.03)",
          position: "relative",
          zIndex: 1000,
        }}
      >
        {/* ── Row 1: App identity + actions ────────────────── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 16px",
            height: 48,
          }}
        >
          {/* Left */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
             <img
            src={logo}
            alt="ONIX"
            style={{
              height: 28,
              width: "auto",
              objectFit: "contain",
              flexShrink: 0,
              display: "block",
            }}
          />

            {/* Scan type badge */}
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
              color: isNifti ? "#34d399" : "#60a5fa",
              background: isNifti ? "rgba(52,211,153,0.1)" : "rgba(96,165,250,0.1)",
              border: `1px solid ${isNifti ? "rgba(52,211,153,0.25)" : "rgba(96,165,250,0.25)"}`,
              borderRadius: 4, padding: "2px 7px", flexShrink: 0,
            }}>
              {scanType}
            </span>

            <span style={{
              fontSize: 10, fontWeight: 500, color: "#8b97ac",
              background: "rgba(255,255,255,0.04)", border: "1px solid #1e2a3a",
              borderRadius: 4, padding: "2px 7px", flexShrink: 0,
            }}>
              {scanMode}
            </span>

            {filename && (
              <>
                <span style={{ color: "#2d3748", fontSize: 16, flexShrink: 0 }}>|</span>
                <span
                  style={{
                    fontSize: 11, color: "#64748b",
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 300,
                  }}
                  title={filename}
                >
                  {filename}
                </span>
              </>
            )}
          </div>

          {/* Right: actions */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <button className="vhdr-btn vhdr-btn-primary" onClick={onToggleReport} title="Generate AI Report">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3 2h7l3 3v9H3V2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                <path d="M10 2v3h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5 7h6M5 9.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              Generate Report
            </button>

            <button
              className="vhdr-btn vhdr-btn-ghost"
              onClick={onToggleFullscreen}
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
              aria-label={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? (
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M6 2H2v4M10 2h4v4M6 14H2v-4M10 14h4v-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              {isFullscreen ? "Exit" : "Fullscreen"}
            </button>

            <button
              className="vhdr-btn vhdr-btn-close"
              onClick={onCloseViewer}
              title="Close Viewer"
              aria-label="Close Viewer"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              Close
            </button>
          </div>
        </div>

        {/* ── Row 2: Patient info strip ─────────────────────── */}
        {(patientName || patientMeta || caseId) && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "4px 16px 6px",
              borderTop: "1px solid rgba(255,255,255,0.04)",
            }}
          >
            {/* Patient icon */}
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0, color: "#475569" }}>
              <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.2" />
              <path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>

{caseId && (
              <>
                <span style={{ color: "#334155", fontSize: 12 }}>·</span>
                <span style={{
                  fontSize: 11, color: "#94a3b8",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid #1e2a3a",
                  borderRadius: 4, padding: "1px 6px",
                }}>
                  {caseId}
                </span>
              </>
            )}

            {patientMeta && (
              <>
                <span style={{ color: "#334155", fontSize: 12 }}>·</span>
                <span style={{ fontSize: 12, color: "#64748b" }}>{patientMeta}</span>
              </>
            )}

          </div>
        )}
      </div>
    </>
  );
}
