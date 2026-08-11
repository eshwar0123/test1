// src/modules/radiologist/DicomViewer/components/SeriesPickerStrip.js
//
// Vertical series picker that sits on the left side of the DICOM viewer.
// Renders one tile per series with thumbnail + SE# + slice count + description.
//
// Active state in Phase 1:
//   - Exactly one series is "active" (the currently mounted series in the
//     3-up MPR view). It gets a single colored ring.
//
// Active state in Phase 2 (when 2x2 compare mode lands):
//   - Up to 4 series can be active at once, each with a different colored
//     ring corresponding to the viewport it's mounted in.
//   - This component already accepts a `viewportColorByUid` map for that.

import React, { useRef, useEffect } from "react";

const TILE_WIDTH = 110;
const TILE_HEIGHT = 96;
const STRIP_WIDTH = 134;

/* Colors must match the viewport border colors used in CornerstoneDicomGrid
   (Phase 2). Blue is the Phase 1 single-active-series color. */
const VIEWPORT_COLORS = {
  0: "#378ADD", // blue   — slot 0 (axial in 3-up; top-left in compare)
  1: "#EF9F27", // amber  — slot 1 (sagittal in 3-up; top-right in compare)
  2: "#97C459", // green  — slot 2 (coronal in 3-up; bottom-left in compare)
  3: "#E24B4A", // red    — slot 3 (compare only — bottom-right)
};

/* Shortform mapping so long sequence descriptions still fit in a tile */
const shortSeriesLabel = (desc, modality) => {
  if (!desc) return modality || "Unnamed";
  const d = String(desc).trim();
  // Replace common verbose pieces with concise ones for the tile.
  return d
    .replace(/AAHead_Scout/i, "Scout")
    .replace(/Localizer/i, "Loc")
    .replace(/ax(?:ial)?/i, "Ax")
    .replace(/sag(?:ittal)?/i, "Sag")
    .replace(/cor(?:onal)?/i, "Cor")
    .replace(/\s+/g, " ")
    .slice(0, 28);
};

/**
 * @param {Object} props
 * @param {Array} props.series           — output of useSeriesGrouping
 * @param {Object} props.thumbs          — output of useSeriesThumbnails (seriesUid -> dataURL)
 * @param {string|null} props.activeSeriesUid   — single active in 3-up mode
 * @param {Object} [props.viewportSeriesMap]    — { slotIndex: seriesUid } for compare mode
 * @param {Function} props.onSelectSeries — (seriesUid) => void
 * @param {boolean} [props.loading]      — show progress shimmer
 * @param {Object}  [props.progress]     — { done, total }
 * @param {boolean} [props.forceShow]    — render even if only one series exists (useful in compare mode)
 * @param {Object}  [props.style]
 */
export default function SeriesPickerStrip({
  series,
  thumbs = {},
  activeSeriesUid = null,
  viewportSeriesMap = null, // Phase 2 — null in Phase 1
  onSelectSeries,
  onClose,
  loading = false,
  progress = null,
  forceShow = false,
  style,
}) {
  const scrollRef = useRef(null);
  const activeTileRef = useRef(null);

  // Auto-scroll to keep the active tile in view when it changes.
  useEffect(() => {
    if (activeTileRef.current && scrollRef.current) {
      try {
        scrollRef.current.scrollTop = activeTileRef.current.offsetTop - scrollRef.current.clientHeight / 2 + activeTileRef.current.offsetHeight / 2;
      } catch { /* ignore */ }
    }
  }, [activeSeriesUid]);

  /* Build seriesUid -> color map */
  const colorByUid = {};
  if (viewportSeriesMap && typeof viewportSeriesMap === "object") {
    Object.entries(viewportSeriesMap).forEach(([slot, uid]) => {
      if (uid && VIEWPORT_COLORS[slot]) colorByUid[uid] = VIEWPORT_COLORS[slot];
    });
  } else if (activeSeriesUid) {
    colorByUid[activeSeriesUid] = VIEWPORT_COLORS[0];
  }

  /* ── Loading / empty states ────────────────────────────── */
  if (loading) {
    const pct = progress?.total ? Math.round((progress.done / progress.total) * 100) : 0;
    return (
      <div style={{ ...stripBaseStyle, ...style }}>
        <div style={stripHeaderStyle}>
          <span style={stripHeaderLabelStyle}>SERIES</span>
          <span style={{ color: "#64748b", fontSize: 10 }}>
            {progress?.done ?? 0} / {progress?.total ?? "…"} ({pct}%)
          </span>
        </div>
        <div style={{ ...rowStyle, justifyContent: "center", color: "#64748b", fontSize: 11 }}>
          Reading…
        </div>
      </div>
    );
  }

  if (!Array.isArray(series) || series.length === 0) return null;
  if (series.length <= 1 && !forceShow) return null; // Don't show a one-tile picker (unless caller forces).

  // One-time diagnostic so the user can confirm in DevTools that the strip
  // mounted with N tiles. If you see "0 tiles" the parsing failed upstream.
  if (typeof window !== "undefined" && !window.__onixStripLogged) {
    window.__onixStripLogged = true;
    console.log(`[SeriesPickerStrip] rendered with ${series.length} tiles, forceShow=${forceShow}`);
    setTimeout(() => { window.__onixStripLogged = false; }, 1000);
  }

  /* ── Normal render ─────────────────────────────────────── */
  return (
    <div style={{ ...stripBaseStyle, ...style }}>
      <div style={stripHeaderStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
          <span style={stripHeaderLabelStyle}>SERIES · {series.length}</span>
          {onClose && (
            <button
              onClick={onClose}
              title="Hide series panel"
              style={closeButtonStyle}
              aria-label="Close series panel"
            >
              ‹
            </button>
          )}
        </div>
        <span style={{ color: "#475569", fontSize: 10 }}>tap to mount</span>
      </div>

      <div ref={scrollRef} style={rowStyle}>
        {series.map((s, idx) => {
          const isActive = !!colorByUid[s.seriesUid];
          const ringColor = colorByUid[s.seriesUid] || "transparent";
          const seNum = s.seriesNumber != null ? `SE ${s.seriesNumber}` : `#${idx + 1}`;
          const label = shortSeriesLabel(s.seriesDescription, s.modality);
          const thumb = thumbs[s.seriesUid];

          return (
            <button
              key={s.seriesUid}
              ref={isActive ? activeTileRef : null}
              type="button"
              onClick={() => onSelectSeries?.(s.seriesUid)}
              title={`${seNum} — ${s.seriesDescription || s.modality || ""}\n${s.instanceCount} slice${s.instanceCount === 1 ? "" : "s"}`}
              style={{
                ...tileButtonStyle,
                borderColor: isActive ? ringColor : "#1e2a3a",
                boxShadow: isActive ? `0 0 0 1px ${ringColor}66` : "none",
              }}
            >
              <div
                style={{
                  ...thumbBoxStyle,
                  background: thumb ? `url("${thumb}") center/cover no-repeat #0a0a0a` : "#0a0a0a",
                }}
              >
                {!thumb && (
                  <span style={thumbPlaceholderStyle}>
                    {s.modality || "DCM"}
                  </span>
                )}
                {/* SE badge */}
                <span style={seBadgeStyle}>{seNum}</span>
                {/* Slice count */}
                <span style={countBadgeStyle}>{s.instanceCount}</span>
                {/* Scout marker */}
                {s.isScout && (
                  <span style={scoutBadgeStyle} title="Scout / localizer">
                    Scout
                  </span>
                )}
              </div>
              <div
                style={{
                  ...tileLabelStyle,
                  color: isActive ? ringColor : "#cbd5e1",
                }}
              >
                {label}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Styles (matches existing ViewerHeader dark palette) ─── */
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
  height: TILE_HEIGHT,
  position: "relative",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const thumbPlaceholderStyle = {
  fontSize: 11,
  fontWeight: 600,
  color: "#475569",
  letterSpacing: "0.06em",
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
  fontSize: 9,
  fontWeight: 500,
  color: "#cbd5e1",
  background: "rgba(0,0,0,0.55)",
  padding: "1px 5px",
  borderRadius: 3,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
};

const scoutBadgeStyle = {
  position: "absolute",
  top: 4,
  right: 4,
  fontSize: 8,
  fontWeight: 600,
  color: "#fde68a",
  background: "rgba(120, 53, 15, 0.7)",
  padding: "1px 4px",
  borderRadius: 3,
  textTransform: "uppercase",
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
