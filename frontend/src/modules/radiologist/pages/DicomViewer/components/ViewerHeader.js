import React from "react";
import logo from "/logo1.png";

/* ─── Display-ID maps (must match repository_1.js) ──────────── */
const CASE_ID_DISPLAY_MAP = {
  'CASE-REAL-2001': 'GENRAD-SUB-54634582',
  'CASE-REAL-2002': 'GENRAD-SUB-78291364',
  'CASE-REAL-2003': 'GENRAD-SUB-62847193',
  'CASE-REAL-2004': 'GENRAD-SUB-93745128',
  'CASE-REAL-2005': 'GENRAD-SUB-41826597',
  'CASE-REAL-2006': 'GENRAD-SUB-85317624',
  'CASE-REAL-2007': 'GENRAD-SUB-16294837',
  'CASE-REAL-2008': 'GENRAD-SUB-73819264',
  'CASE-REAL-2009': 'GENRAD-SUB-48572913',
  'CASE-REAL-2010': 'GENRAD-SUB-92164738',
  'CASE-REAL-2011': 'GENRAD-SUB-58372914',
  'CASE-REAL-2012': 'GENRAD-SUB-31947528',
  'CASE-REAL-2013': 'GENRAD-SUB-26491837',
};

const CLIENT_ID_DISPLAY_MAP = {
  'CLIENT-001': 'GENRAD-ORG-46425629',
  'CLIENT-002': 'GENRAD-ORG-71938425',
  'CLIENT-003': 'GENRAD-ORG-83629471',
  'CLIENT-004': 'GENRAD-ORG-52487136',
  'CLIENT-005': 'GENRAD-ORG-94725183',
  'CLIENT-006': 'GENRAD-ORG-37162859',
  'CLIENT-007': 'GENRAD-ORG-62847159',
  'CLIENT-008': 'GENRAD-ORG-28364571',
  'CLIENT-009': 'GENRAD-ORG-71829364',
  'CLIENT-010': 'GENRAD-ORG-49183726',
  'CLIENT-011': 'GENRAD-ORG-83726415',
  'CLIENT-012': 'GENRAD-ORG-61728394',
  'CLIENT-013': 'GENRAD-ORG-61728394',
  'CLIENT-014': 'GENRAD-ORG-61728394',
  'CLIENT-015': 'GENRAD-ORG-61728394',
  'CLIENT-016': 'GENRAD-ORG-61728394',
};

/* Fallback so header still resolves ORG id if clientId isn't passed */
const CASE_TO_CLIENT_FALLBACK = {
  'CASE-REAL-2001': 'CLIENT-001',
  'CASE-REAL-2002': 'CLIENT-004',
  'CASE-REAL-2003': 'CLIENT-002',
  'CASE-REAL-2004': 'CLIENT-006',
  'CASE-REAL-2005': 'CLIENT-003',
  'CASE-REAL-2006': 'CLIENT-005',
  'CASE-REAL-2007': 'CLIENT-007',
  'CASE-REAL-2008': 'CLIENT-008',
  'CASE-REAL-2009': 'CLIENT-009',
  'CASE-REAL-2010': 'CLIENT-010',
  'CASE-REAL-2011': 'CLIENT-011',
  'CASE-REAL-2012': 'CLIENT-016',
  'CASE-REAL-2013': 'CLIENT-012',
  'CASE-REAL-2014': 'CLIENT-013',
  'CASE-REAL-2015': 'CLIENT-014',
  'CASE-REAL-2016': 'CLIENT-015',
};

export default function ViewerHeader({
  filename,
  isNifti,
  isCornerstoneNifti,
  isSeries,
  onToggleReport,
  onToggleFullscreen,
  isFullscreen,
  onCloseViewer,
  patientName, // still received, but NOT rendered
  patientAge,
  patientSex,
  caseId,
  clientId,
  // layoutMode / onChangeLayoutMode / showLayoutToggle still accepted
  // for compatibility but the toggle UI has been removed.
  layoutMode,
  onChangeLayoutMode,
  showLayoutToggle,
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

  // Resolve display IDs
  const displayCaseId = (caseId && CASE_ID_DISPLAY_MAP[caseId]) || caseId || null;
  const rawClientId = clientId || CASE_TO_CLIENT_FALLBACK[caseId] || null;
  const displayClientId =
    rawClientId ? (CLIENT_ID_DISPLAY_MAP[rawClientId] || rawClientId) : null;

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
        .vhdr-id-chip {
          font-size: 11px;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          background: rgba(255,255,255,0.04);
          border: 1px solid #1e2a3a;
          border-radius: 4px;
          padding: 1px 6px;
          white-space: nowrap;
        }
        .vhdr-id-label {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          margin-right: 4px;
        }
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
        {/* ── Single row: identity + filename + IDs + demographics + actions ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 16px",
            height: 48,
            gap: 10,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              minWidth: 0,
              overflow: "hidden",
            }}
          >
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
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 240,
                    flexShrink: 1,
                  }}
                  title={filename}
                >
                  {filename}
                </span>
              </>
            )}

            {/* ── Case ID → Org ID → demographics (moved up from row 2) ── */}
            {(displayCaseId || displayClientId || patientMeta) && (
              <span style={{ color: "#2d3748", fontSize: 16, flexShrink: 0 }}>|</span>
            )}

            {displayCaseId && (
              <span style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}>
                <span className="vhdr-id-label" style={{ color: "#60a5fa" }}>Case ID</span>
                <span className="vhdr-id-chip" style={{ color: "#bfdbfe" }} title={caseId || ""}>
                  {displayCaseId}
                </span>
              </span>
            )}

            {displayClientId && (
              <>
                {displayCaseId && <span style={{ color: "#334155", fontSize: 12, flexShrink: 0 }}>·</span>}
                <span style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}>
                  <span className="vhdr-id-label" style={{ color: "#facc15" }}>Org ID</span>
                  <span className="vhdr-id-chip" style={{ color: "#fde68a" }} title={rawClientId || ""}>
                    {displayClientId}
                  </span>
                </span>
              </>
            )}

            {patientMeta && (
              <>
                {(displayCaseId || displayClientId) && <span style={{ color: "#334155", fontSize: 12, flexShrink: 0 }}>·</span>}
                <span style={{ fontSize: 12, color: "#64748b", flexShrink: 0, whiteSpace: "nowrap" }}>{patientMeta}</span>
              </>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <button className="vhdr-btn vhdr-btn-primary" onClick={onToggleReport} title="Open report editor">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3 2h7l3 3v9H3V2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                <path d="M10 2v3h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5 7h6M5 9.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              Report
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
      </div>
    </>
  );
}
