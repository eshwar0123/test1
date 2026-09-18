import React from "react";

/**
 * PACS-style corner overlay that appears on top of each image viewport.
 * pointer-events: none — never blocks interaction.
 */
export default function ViewerImageOverlay({
  patientName,
  patientAge,
  patientSex,
  caseId,
  sliceCurrent,
  sliceTotal,
  filename,
  isInverted,
}) {
  const mono = {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    fontSize: 11,
    lineHeight: 1.65,
    whiteSpace: "nowrap",
    textShadow: "0 1px 4px rgba(0,0,0,1), 0 0 10px rgba(0,0,0,0.9)",
    display: "block",
  };

  const patientLine = [patientSex, patientAge && `${patientAge}y`, caseId && `#${caseId}`]
    .filter(Boolean)
    .join(" · ");

  const shortFile = filename
    ? filename.length > 30
      ? filename.slice(0, 27) + "…"
      : filename
    : null;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 10,
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      {/* Top row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        {/* Top-left: patient identity */}
        <div>
          {patientName && (
            <span style={{ ...mono, color: "#e5e7eb", fontWeight: 600 }}>
              {patientName}
            </span>
          )}
          {patientLine && (
            <span style={{ ...mono, color: "#9ca3af" }}>{patientLine}</span>
          )}
        </div>

        {/* Top-right: inversion state only */}
        <div style={{ textAlign: "right" }}>
          {isInverted && (
            <span style={{ ...mono, color: "#f59e0b" }}>INV</span>
          )}
        </div>
      </div>

      {/* Bottom row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        {/* Bottom-left: filename */}
        <div>
          {shortFile && (
            <span style={{ ...mono, color: "#6b7280" }}>{shortFile}</span>
          )}
        </div>

        {/* Bottom-right: slice indicator */}
        <div style={{ textAlign: "right" }}>
          {sliceTotal > 1 && (
            <span style={{ ...mono, color: "#d1d5db" }}>
              {sliceCurrent} / {sliceTotal}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
