// nifti/components/NiftiSeriesStrip.js
//
// Left-side file picker for the NIfTI viewer.
// Mirrors the style of SeriesPickerStrip but for NIfTI volumes —
// each tile shows F<n> badge, a brain-icon placeholder (or canvas thumbnail),
// and a truncated filename.

import React, { useRef, useEffect } from "react";

const TILE_WIDTH = 110;
const STRIP_WIDTH = 134;

const shortNiftiLabel = (name) => {
  if (!name) return "NIfTI";
  // Strip path prefix and common extensions
  const base = name.split("/").pop().replace(/\.nii\.gz$/i, "").replace(/\.nii$/i, "");
  return base.length > 28 ? base.slice(0, 27) + "…" : base;
};

/**
 * @param {Object} props
 * @param {Array<{url: string, name: string}>} props.files  — list of NIfTI files
 * @param {string|null} props.activeUrl                     — URL of the currently loaded file
 * @param {Function} props.onSelectFile                     — (url, name) => void
 * @param {Function} [props.onClose]
 * @param {Object}  [props.thumbs]                          — url -> dataURL (optional)
 */
export default function NiftiSeriesStrip({
  files = [],
  activeUrl = null,
  onSelectFile,
  onClose,
  thumbs = {},
}) {
  const scrollRef = useRef(null);
  const activeTileRef = useRef(null);

  useEffect(() => {
    if (activeTileRef.current && scrollRef.current) {
      try {
        scrollRef.current.scrollTop = activeTileRef.current.offsetTop - scrollRef.current.clientHeight / 2 + activeTileRef.current.offsetHeight / 2;
      } catch {}
    }
  }, [activeUrl]);

  if (!files.length) return null;

  return (
    <div style={stripBaseStyle}>
      {/* Header */}
      <div style={stripHeaderStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
          <span style={stripHeaderLabelStyle}>FILES · {files.length}</span>
          {onClose && (
            <button onClick={onClose} title="Hide files panel" style={closeButtonStyle} aria-label="Close">
              ‹
            </button>
          )}
        </div>
        {files.length > 1 && (
          <span style={{ color: "#475569", fontSize: 10 }}>tap to switch</span>
        )}
      </div>

      {/* Tiles */}
      <div ref={scrollRef} style={rowStyle}>
        {files.map((f, idx) => {
          const isActive = f.url === activeUrl || (!activeUrl && idx === 0);
          const ringColor = "#378ADD";
          const label = shortNiftiLabel(f.name);
          const thumb = thumbs[f.url];
          const isGz = (f.name || f.url || "").toLowerCase().endsWith(".gz");

          return (
            <button
              key={f.url || idx}
              ref={isActive ? activeTileRef : null}
              type="button"
              onClick={() => onSelectFile?.(f.url, f.name)}
              title={f.name || f.url}
              style={{
                ...tileButtonStyle,
                borderColor: isActive ? ringColor : "#1e2a3a",
                boxShadow: isActive ? `0 0 0 1px ${ringColor}66` : "none",
              }}
            >
              {/* Thumbnail area */}
              <div style={{ ...thumbBoxStyle, background: "#0a0a0a", overflow: "hidden" }}>
                {/* Real scan thumbnail when available */}
                {thumb ? (
                  <img
                    src={thumb}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                ) : (
                  <BrainIcon color={isActive ? ringColor : "#334155"} />
                )}

                {/* F<n> badge */}
                <span style={seBadgeStyle}>F{idx + 1}</span>

                {/* NIfTI type badge */}
                <span style={countBadgeStyle}>{isGz ? "NII.GZ" : "NII"}</span>

                {/* Active dot */}
                {isActive && (
                  <span style={activeDotStyle} title="Currently loaded" />
                )}
              </div>

              {/* Label */}
              <div style={{ ...tileLabelStyle, color: isActive ? ringColor : "#cbd5e1" }}>
                {label}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* Small SVG brain icon for the placeholder thumbnail */
function BrainIcon({ color = "#334155" }) {
  return (
    <svg
      width={32}
      height={32}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 5c-1.5-2-4-2.5-5.5-1S4 8 5 9.5c-2 1-2.5 3.5-1 5s4 1.5 5 0c.5 1.5 2 2.5 3 2.5s2.5-1 3-2.5c1 1.5 3.5 1.5 5 0s1-4-1-5c1-1.5.5-4-1-5S13.5 3 12 5z" />
      <path d="M12 5v14" />
    </svg>
  );
}

/* ─── Styles ─────────────────────────────────────────────── */
const stripBaseStyle = {
  width: STRIP_WIDTH,
  minWidth: STRIP_WIDTH,
  height: "100%",
  flexShrink: 0,
  background: "linear-gradient(90deg, #0b0f16 0%, #0e1520 100%)",
  borderRight: "1px solid #1e2a3a",
  display: "flex",
  flexDirection: "column",
  position: "relative",
  zIndex: 100,
};

const stripHeaderStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: 2,
  padding: "8px 10px 6px",
  borderBottom: "1px solid #1e2a3a",
  flexShrink: 0,
};

const stripHeaderLabelStyle = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.08em",
  color: "#60a5fa",
  textTransform: "uppercase",
};

const rowStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  overflowY: "auto",
  overflowX: "hidden",
  padding: "10px 12px 12px",
  flex: 1,
  scrollbarWidth: "thin",
  scrollbarColor: "#1e2a3a #0e1520",
};

const tileButtonStyle = {
  flexShrink: 0,
  width: TILE_WIDTH,
  background: "transparent",
  border: "2px solid #1e2a3a",
  borderRadius: 6,
  padding: 0,
  cursor: "pointer",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  transition: "border-color 0.12s ease, box-shadow 0.12s ease",
  fontFamily: "inherit",
};

const thumbBoxStyle = {
  width: "100%",
  height: 80,
  position: "relative",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const seBadgeStyle = {
  position: "absolute",
  top: 4,
  left: 4,
  fontSize: 9,
  fontWeight: 600,
  color: "#e2e8f0",
  background: "rgba(0,0,0,0.55)",
  padding: "1px 5px",
  borderRadius: 3,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
};

const countBadgeStyle = {
  position: "absolute",
  bottom: 4,
  right: 4,
  fontSize: 8,
  fontWeight: 500,
  color: "#cbd5e1",
  background: "rgba(0,0,0,0.55)",
  padding: "1px 4px",
  borderRadius: 3,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  letterSpacing: "0.04em",
};

const closeButtonStyle = {
  background: "transparent",
  border: "none",
  color: "#475569",
  cursor: "pointer",
  fontSize: 16,
  lineHeight: 1,
  padding: "0 2px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 4,
  transition: "color 0.12s",
};

const tileLabelStyle = {
  fontSize: 10,
  padding: "4px 6px",
  textAlign: "center",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  background: "#0b0f16",
};

const activeDotStyle = {
  position: "absolute",
  top: 4,
  right: 4,
  width: 7,
  height: 7,
  borderRadius: "50%",
  background: "#378ADD",
  boxShadow: "0 0 4px #378ADD",
};
