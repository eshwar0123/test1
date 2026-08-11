import React from "react";
import ViewerImageOverlay from "../../components/ViewerImageOverlay";
import LocatorLineOverlay from "../../components/LocatorLineOverlay";

/* ─── Viewport border colors for 2x2 compare mode ──────────────
   Must stay in sync with VIEWPORT_COLORS in SeriesPickerStrip.js
   so the strip rings match the viewport borders. */
const COMPARE_BORDER_COLORS = {
  0: "#378ADD", // blue
  1: "#EF9F27", // amber
  2: "#97C459", // green
  3: "#E24B4A", // red
};

/* ─── Per-viewport loading overlay (compare mode) ─────────────
   Shows a colored spinner + label while the slot's stack mounts.
   Replaces the "black viewport" with an obvious in-progress state. */
const CompareLoadingOverlay = ({ ringColor, label }) => (
  <>
    <style>{`@keyframes onixSpin { to { transform: rotate(360deg); } }`}</style>
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(8, 14, 24, 0.6)",
        zIndex: 25,
        pointerEvents: "none",
        gap: 10,
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          border: `3px solid ${ringColor}22`,
          borderTopColor: ringColor,
          borderRadius: "50%",
          animation: "onixSpin 0.9s linear infinite",
        }}
      />
      <div
        style={{
          color: ringColor,
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: "0.04em",
          textAlign: "center",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        }}
      >
        Loading slices…
        <div style={{ color: "#94a3b8", fontSize: 10, marginTop: 4, fontFamily: "inherit" }}>
          {label}
        </div>
      </div>
    </div>
  </>
);

/* Minimal vertical scroll strip — right edge of each cell */
function CellSliceStrip({ current, total, onStep }) {
  const trackRef = React.useRef(null);
  if (total <= 1) return null;
  const pct = ((current - 1) / Math.max(total - 1, 1)) * 100;
  const thumbH = Math.max(3, Math.min(25, (1 / total) * 100));
  const seek = (clientY, cur) => {
    if (!trackRef.current) return;
    const r = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientY - r.top) / r.height));
    const target = Math.round(ratio * (total - 1)) + 1;
    const delta = target - cur;
    if (delta !== 0) onStep?.(delta);
  };
  return (
    <div ref={trackRef} style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 14,
      background: "rgba(0,0,0,0.38)", zIndex: 36, cursor: "ns-resize",
      borderLeft: "1px solid rgba(255,255,255,0.06)", userSelect: "none", pointerEvents: "auto" }}
      onPointerDown={(e) => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); seek(e.clientY, current); }}
      onPointerMove={(e) => { if (e.buttons !== 1) return; e.stopPropagation(); seek(e.clientY, current); }}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ position: "absolute", left: 2, right: 2, top: `${pct}%`, transform: "translateY(-50%)",
        height: `${thumbH}%`, minHeight: 10, background: "#3b82f6", borderRadius: 3,
        pointerEvents: "none", boxShadow: "0 0 0 1px rgba(59,130,246,0.45)", transition: "top 0.04s linear" }} />
    </div>
  );
}

export default function CornerstoneDicomGrid({
  dicomGrid,
  activeDicomSlot,
  setActiveDicomSlot,
  axRef,
  sagRef,
  corRef,
  handleCornerstoneDicomWheel,
  updateDicomMouseCoords,
  clearDicomMouseCoords,
  dicomTool,
  deleteLastLengthOnDicomSlot,
  isScopedToolActive,
  dicomSliceBySlot,
  dicomMouseBySlot,
  dicomCrosshairBySlot,
  dicomCrosshairColor,
  showDicomCrosshair,
  dicomSlotPlanes,
  getDicomSlotPlaneLabel,
  // Step a single pane by one slice. up arrow → previous (-1), down → next (+1).
  onSliceStep,
  // ── Phase 2 additions ─────────────────────────────
  // When layoutMode === "compare2x2", render a 2x2 grid of 4 viewports
  // each bound to a different series.
  layoutMode = "mpr3",
  compareSlot3Ref,
  compareViewportSeries,            // { 0,1,2,3 } -> seriesUid (for label display)
  availableSeries,                  // for resolving uid -> display label
  focusedCompareSlot = 0,
  setFocusedCompareSlot,
  compareSlotLoading = {},          // { 0,1,2,3 } -> bool (drives spinner overlay)
  /* ─── Phase 3 multi-grid props ───────────────────────────────
     When useMultiGrid is true, render an NxM grid of viewports where each
     cell holds a different series. Generalizes the 2x2 compare layout. */
  useMultiGrid = false,
  multiGridSlotCount = 1,
  multiGridRows = 1,
  multiGridCols = 1,
  getOrCreateGridRef,
  // ── Single-pane volume MIP (layoutMode === "volMip") ──────────
  volMipPlane = "axial",
  projectionMode = "none",
  mipLowResWarning = false,
  volumeInfo = null,
  // ── Per-cell region tag (idea 2) + per-cell anatomy label (idea 1) ──
  // regionBySlot: { slot -> region label } shown top-right of each cell.
  // anatomyText renders inside the cell whose slot === anatomySlot.
  regionBySlot = {},
  anatomySlot = null,
  anatomyText = null,
  // "line" = crosshair lines + centre circle (default)
  // "pointer" = centre circle only, no lines
  crosshairMode = "line",
  // Per-cell PACS overlay data
  slotAnnotations = {},
  patientName,
  patientAge,
  patientSex,
  caseId,
  filename,
  overlayMeta = {},
  // Horos-style reference lines: plane-intersection lines per slot.
  // { [slot]: [{x1,y1,x2,y2,color}] } — computed by useLocatorLines.
  referenceLinesBySlot = {},
}) {
  const isMeasureToolActive = typeof dicomTool === "string" && dicomTool.startsWith("measure");

  const planeLabelForSlot = (slot) => {
    const p = (typeof getDicomSlotPlaneLabel === "function" ? getDicomSlotPlaneLabel(slot) : dicomSlotPlanes?.[slot]) || "axial";
    return p[0].toUpperCase() + p.slice(1);
  };

  /* Bottom-left: Slices + X/Y (no filename) */
  const renderInfo = (slot) => (
    <div style={{ position: "absolute", left: 8, bottom: 6, zIndex: 30, fontSize: 11,
      color: "#cbd5e1", background: "rgba(0,0,0,0.48)", padding: "2px 6px",
      borderRadius: 4, pointerEvents: "none", lineHeight: 1.3 }}>
      <div>{`Slices: ${dicomSliceBySlot[slot]?.current || 1}/${dicomSliceBySlot[slot]?.total || 1}`}</div>
      <div>{`X:${dicomMouseBySlot[slot]?.x ?? "-"} Y:${dicomMouseBySlot[slot]?.y ?? "-"}`}</div>
    </div>
  );

  /* Crosshair overlay */
  const renderCrosshair = (slot) => {
    if (!showDicomCrosshair) return null;
    const pos = dicomCrosshairBySlot?.[slot];
    if (!pos || pos.x == null || pos.y == null) return null;
    const color = dicomCrosshairColor || "#3b82f6";
    const R = 7;
    const showLines = crosshairMode === "line";
    return (
      <>
        {showLines && (
          <div style={{ position: "absolute", left: pos.x, top: 0, bottom: 0,
            width: 1, background: color, pointerEvents: "none", zIndex: 28 }} />
        )}
        {showLines && (
          <div style={{ position: "absolute", top: pos.y, left: 0, right: 0,
            height: 1, background: color, pointerEvents: "none", zIndex: 28 }} />
        )}
        <div style={{ position: "absolute", left: pos.x - R, top: pos.y - R,
          width: R * 2, height: R * 2, borderRadius: "50%",
          border: `2px solid ${color}`, background: "rgba(0,0,0,0.25)",
          pointerEvents: "none", zIndex: 29 }} />
      </>
    );
  };

  /* Top-left: patient identity */
  const renderTopLeft = () => {
    const m = overlayMeta || {};
    const mono = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      fontSize: 11, lineHeight: 1.65, whiteSpace: "nowrap",
      textShadow: "0 1px 4px rgba(0,0,0,1), 0 0 10px rgba(0,0,0,0.9)",
      display: "block", pointerEvents: "none" };
    const dim = { ...mono, color: "#9ca3af" };
    const bright = { color: "#e5e7eb" };
    const bold = { ...mono, color: "#e5e7eb", fontWeight: 600 };
    const displayId = m.patientId || caseId || null;
    if (!patientName && !displayId && !patientAge && !patientSex) return null;
    return (
      <div style={{ position: "absolute", top: 6, left: 8, zIndex: 30,
        display: "flex", flexDirection: "column", pointerEvents: "none" }}>
        {displayId && <span style={dim}>Patient ID: <span style={bright}>{displayId}</span></span>}
        {patientName && <span style={bold}>Patient Name: {patientName}</span>}
        {patientAge && <span style={dim}>Age: <span style={bright}>{patientAge}Y</span></span>}
        {patientSex && <span style={dim}>Sex: <span style={bright}>{patientSex}</span></span>}
      </div>
    );
  };

  /* Bottom-left: study date/time + institution + slices */
  const renderBottomLeft = (slot) => {
    const m = overlayMeta || {};
    const mono = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      fontSize: 11, lineHeight: 1.65, whiteSpace: "nowrap",
      textShadow: "0 1px 4px rgba(0,0,0,1), 0 0 10px rgba(0,0,0,0.9)",
      display: "block", pointerEvents: "none" };
    const dim = { ...mono, color: "#9ca3af" };
    const bright = { color: "#e5e7eb" };
    return (
      <div style={{ position: "absolute", left: 8, bottom: 6, zIndex: 30,
        display: "flex", flexDirection: "column", pointerEvents: "none" }}>
        {m.studyDate && <span style={dim}>Study Date: <span style={bright}>{m.studyDate}</span></span>}
        {m.studyTime && <span style={dim}>Study Time: <span style={bright}>{m.studyTime}</span></span>}
        {m.institutionName && <span style={dim}>Institution Name: <span style={bright}>{m.institutionName}</span></span>}
        {m.institutionAddress && <span style={{ ...dim, fontSize: 10 }}>Institution Residence: <span style={bright}>{m.institutionAddress}</span></span>}
        <span style={{ ...mono, color: "#cbd5e1", marginTop: 2 }}>
          {`Slices: ${dicomSliceBySlot[slot]?.current || 1}/${dicomSliceBySlot[slot]?.total || 1}`}
        </span>
        <span style={{ ...mono, color: "#cbd5e1" }}>
          {`X:${dicomMouseBySlot[slot]?.x ?? "-"} Y:${dicomMouseBySlot[slot]?.y ?? "-"}`}
        </span>
      </div>
    );
  };

  /* Bottom-right: exposure params */
  const renderBottomRight = () => {
    const m = overlayMeta || {};
    const mono = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      fontSize: 11, lineHeight: 1.65, whiteSpace: "nowrap",
      textShadow: "0 1px 4px rgba(0,0,0,1), 0 0 10px rgba(0,0,0,0.9)",
      display: "block", pointerEvents: "none" };
    const dim = { ...mono, color: "#9ca3af", textAlign: "right" };
    const bright = { color: "#e5e7eb" };
    if (!m.kvp && !m.ma && !m.msec && !m.mas && !m.ei) return null;
    return (
      <div style={{ position: "absolute", right: 8, bottom: 6, zIndex: 30,
        display: "flex", flexDirection: "column", alignItems: "flex-end", pointerEvents: "none" }}>
        {m.kvp  && <span style={dim}>kVp: <span style={bright}>{m.kvp}</span></span>}
        {m.ma   && <span style={dim}>mA: <span style={bright}>{m.ma}</span></span>}
        {m.msec && <span style={dim}>mSec: <span style={bright}>{m.msec}</span></span>}
        {m.mas  && <span style={dim}>mAs: <span style={bright}>{m.mas}</span></span>}
        {m.ei   && <span style={dim}>E.I: <span style={bright}>{m.ei}</span></span>}
      </div>
    );
  };

  /* Top-right: horizontal nav bar → series info → anatomy label (no colored headers) */
  const renderTopRight = (slot) => {
    const ann = slotAnnotations[slot] ?? slotAnnotations[0];
    const navBtnStyle = {
      background: "rgba(17,24,39,0.78)", border: "1px solid #2d3748", borderRadius: 6,
      width: 26, height: 24, padding: 0, display: "inline-flex", alignItems: "center",
      justifyContent: "center", color: "#e5e7eb", cursor: "pointer",
    };
    const step = (e, delta) => { e.stopPropagation(); setActiveDicomSlot?.(slot); onSliceStep?.(slot, delta); };
    const infoStyle = {
      fontSize: 11, color: "#cbd5e1", textAlign: "right", lineHeight: 1.4,
      pointerEvents: "none", maxWidth: 160,
    };
    return (
      <div style={{ position: "absolute", top: 6, right: 6, zIndex: 40,
        display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-end" }}>
        {/* Nav bar — horizontal row */}
        <div style={{ display: "flex", flexDirection: "row", gap: 4, pointerEvents: "auto" }}>
          <button style={navBtnStyle} onClick={(e) => step(e, -1)} title="Previous slice" aria-label="Previous slice">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M4 10l4-4 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button style={navBtnStyle} onClick={(e) => step(e, 1)} title="Next slice" aria-label="Next slice">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        {/* Series description — plain text, no background */}
        {ann && (
          <div style={infoStyle}>
            {ann.modality && <div>{ann.modality}</div>}
            {ann.seriesNumber != null && <div>{`Se: ${ann.seriesNumber}`}</div>}
            {ann.studyDescription && (
              <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {ann.studyDescription}
              </div>
            )}
            {ann.seriesDescription && (
              <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {ann.seriesDescription}
              </div>
            )}
            {overlayMeta?.bodyPart && (
              <div>{`Body Part: ${overlayMeta.bodyPart}`}</div>
            )}
            {overlayMeta?.projection && (
              <div>{`Projection: ${overlayMeta.projection}`}</div>
            )}
          </div>
        )}
        {/* Anatomy label — below series description, same font/color, no background */}
        {slot === anatomySlot && anatomyText && (
          <div style={{ ...infoStyle, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {anatomyText}
          </div>
        )}
      </div>
    );
  };

  /* Per-cell scroll strip helper */
  const renderCellStrip = (slot) => (
    <CellSliceStrip
      current={dicomSliceBySlot[slot]?.current ?? 1}
      total={dicomSliceBySlot[slot]?.total ?? 1}
      onStep={(delta) => { setActiveDicomSlot?.(slot); onSliceStep?.(slot, delta); }}
    />
  );

  /* Combined overlay: NO ViewerImageOverlay (removes patient info, filename, colored series header).
     renderTopRight handles nav + series description + anatomy in one non-overlapping column. */
  const renderOverlay = (slot) => (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 20 }}>
      <LocatorLineOverlay lines={referenceLinesBySlot[slot]} />
      {renderCrosshair(slot)}
      {renderTopLeft()}
      {renderTopRight(slot)}
      {renderBottomLeft(slot)}
      {renderBottomRight()}
    </div>
  );

  /* ─── PHASE 2 VOLUME MPR MODE ────────────────────────────────
     One series, three orthographic reformats (axial / sagittal / coronal)
     driven by useVolumeMprLoader. CrosshairsTool draws + drives the linked
     crosshairs, so these panes carry NO stack wheel/mouse handlers — we let
     Cornerstone tools own all interaction. */
  /* ─── SINGLE-PANE VOLUME MIP (volMip) ────────────────────────
     One full-size volume viewport in the chosen plane — "MIP without the
     3-up MPR". Scroll moves through the volume; the projection (MIP/MinIP/
     Average) + slab thickness are applied by useVolumeProjection. */
  if (layoutMode === "volMip") {
    const PROJ_LABELS = { none: "MPR", mip: "MIP", minip: "MinIP", average: "AvgIP" };
    const planeLabel = (volMipPlane || "axial");
    return (
      <div style={{ height: "100%", padding: 6 }}>
        <div
          onClick={() => setActiveDicomSlot?.(0)}
          style={{
            border: "2px solid #10b981", borderRadius: 8, overflow: "hidden",
            background: "#000", position: "relative", height: "100%", cursor: "crosshair",
          }}
        >
          <div
            ref={axRef}
            className="cornerstone3d-viewport"
            onWheel={(e) => handleCornerstoneDicomWheel?.(0, e)}
            onMouseMove={(e) => updateDicomMouseCoords?.(0, e)}
            onMouseDown={(e) => updateDicomMouseCoords?.(0, e)}
            onMouseLeave={() => clearDicomMouseCoords?.(0)}
            onContextMenu={(e) => {
              if (isMeasureToolActive) { e.preventDefault(); setActiveDicomSlot?.(0); deleteLastLengthOnDicomSlot?.(0, e); }
            }}
            style={{ width: "100%", height: "100%" }}
          />
          <div style={{ position: "absolute", top: 6, left: 8, zIndex: 30, fontSize: 11, fontWeight: 600, color: "#34d399", background: "rgba(0,0,0,0.55)", padding: "2px 8px", borderRadius: 4, pointerEvents: "none", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
            {`${PROJ_LABELS[projectionMode] || "MPR"} · ${planeLabel[0].toUpperCase() + planeLabel.slice(1)}`}
          </div>
          {/* Cross-plane low-resolution warning for anisotropic series. */}
          {mipLowResWarning && (
            <div style={{ position: "absolute", top: 6, right: 8, zIndex: 30, maxWidth: 320, fontSize: 11, fontWeight: 500, color: "#fde68a", background: "rgba(120,53,15,0.78)", border: "1px solid #b45309", padding: "4px 8px", borderRadius: 4, pointerEvents: "none", lineHeight: 1.35 }}>
              {`⚠ Low-resolution MIP — this series was acquired ${volumeInfo?.acquisitionPlane || "off-plane"}. Switch the plane to ${(volumeInfo?.acquisitionPlane || "acquisition")[0].toUpperCase() + (volumeInfo?.acquisitionPlane || "acquisition").slice(1)} for full detail.`}
            </div>
          )}
          {renderOverlay(0)}
          {renderCellStrip(0)}
        </div>
      </div>
    );
  }

  if (layoutMode === "volMpr") {
    // Radiology-standard plane colors (must match REF_COLORS in
    // useVolumeMprLoader): Axial -> Orange, Sagittal -> Blue, Coronal -> Green.
    // Each pane's label/border matches the color of its own reference line as
    // drawn in the other two panes.
    const MPR_COLORS = ["#EF9F27", "#378ADD", "#97C459"]; // Axial, Sagittal, Coronal
    const MPR_LABELS = ["Axial", "Sagittal", "Coronal"];
    const cell = (slot, ref) => (
      <div
        onClick={() => setActiveDicomSlot?.(slot)}
        style={{
          border: `2px solid ${activeDicomSlot === slot ? MPR_COLORS[slot] : "#2b2b2b"}`,
          boxShadow: activeDicomSlot === slot ? `0 0 0 2px ${MPR_COLORS[slot]}55` : "none",
          borderRadius: 8, overflow: "hidden", background: "#000",
          position: "relative", cursor: "crosshair",
        }}
      >
        <div ref={ref} className="cornerstone3d-viewport" style={{ width: "100%", height: "100%" }} />
        <div style={{ position: "absolute", top: 6, left: 8, zIndex: 30, fontSize: 11, fontWeight: 600, color: MPR_COLORS[slot], background: "rgba(0,0,0,0.55)", padding: "2px 8px", borderRadius: 4, pointerEvents: "none", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
          {MPR_LABELS[slot]}
        </div>
        {renderTopRight(slot)}
        {renderInfo(slot)}
        {renderCellStrip(slot)}
      </div>
    );
    return (
      <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 6, height: "100%", padding: 6 }}>
        {cell(0, axRef)}
        <div style={{ display: "grid", gridTemplateRows: "1fr 1fr", gap: 6, height: "100%" }}>
          {cell(1, sagRef)}
          {cell(2, corRef)}
        </div>
      </div>
    );
  }

  /* ─── PHASE 3 MULTI-GRID MODE ────────────────────────────────
     Generalized NxM grid where each cell holds a different series.
     Uses the same multi-series infrastructure as compare2x2 but with
     arbitrary slot count. */
  if (useMultiGrid) {
    const labelFor = (slot) => {
      const uid = compareViewportSeries?.[slot];
      if (!uid) return "—";
      const s = availableSeries?.find?.((s) => s.seriesUid === uid);
      if (!s) return "—";
      const num = s.seriesNumber != null ? `SE ${s.seriesNumber}` : "";
      const desc = (s.seriesDescription || s.modality || "").slice(0, 24);
      return [num, desc].filter(Boolean).join(" · ") || "Series";
    };

    /* Color palette cycles through the compare-mode colors for the first 4
       slots, then falls back to a neutral border for slots beyond that. */
    const colorForSlot = (i) => COMPARE_BORDER_COLORS[i % 4];

    /* Shared cell renderer used by both regular and custom layouts */
    const renderCell = (idx, gridStyle = {}) => {
      const ringColor = colorForSlot(idx);
      const isFocused = activeDicomSlot === idx;
      const ref = getOrCreateGridRef?.(idx);
      return (
        <div
          key={`mgrid-${idx}`}
          onClick={() => setActiveDicomSlot?.(idx)}
          style={{
            border: `2px solid ${isFocused ? ringColor : "#2b2b2b"}`,
            boxShadow: isFocused ? `0 0 0 2px ${ringColor}66` : "none",
            borderRadius: 8,
            overflow: "hidden",
            background: "#000",
            cursor: "pointer",
            position: "relative",
            transition: "box-shadow 0.12s ease, border-color 0.12s ease",
            ...gridStyle,
          }}
        >
          <div style={{ width: "100%", height: "100%", position: "relative" }}>
            <div
              ref={ref}
              className="cornerstone3d-viewport"
              onWheel={(e) => handleCornerstoneDicomWheel?.(idx, e)}
              onMouseMove={(e) => updateDicomMouseCoords?.(idx, e)}
              onMouseDown={(e) => updateDicomMouseCoords?.(idx, e)}
              onMouseLeave={() => clearDicomMouseCoords?.(idx)}
              onContextMenu={(e) => {
                if (isMeasureToolActive) {
                  e.preventDefault();
                  setActiveDicomSlot?.(idx);
                  deleteLastLengthOnDicomSlot?.(idx, e);
                }
              }}
              style={{
                width: "100%",
                height: "100%",
                pointerEvents: !isScopedToolActive || activeDicomSlot === idx ? "auto" : "none",
              }}
            />
            {compareSlotLoading[idx] && (
              <CompareLoadingOverlay ringColor={ringColor} label={labelFor(idx)} />
            )}
            {renderOverlay(idx)}
            {renderCellStrip(idx)}
          </div>
        </div>
      );
    };

    /* ── 1-Left / 2-Right asymmetric layout ──────────────────────
       Slot 0: full-height left panel
       Slot 1: top-right panel
       Slot 2: bottom-right panel                               */
    if (dicomGrid?.mode === "1l2r") {
      return (
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gridTemplateRows: "1fr 1fr",
          gap: 6,
          height: "100%",
          padding: 6,
        }}>
          {renderCell(0, { gridColumn: "1", gridRow: "1 / 3" })}
          {renderCell(1, { gridColumn: "2", gridRow: "1" })}
          {renderCell(2, { gridColumn: "2", gridRow: "2" })}
        </div>
      );
    }

    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${multiGridCols}, 1fr)`,
          gridTemplateRows: `repeat(${multiGridRows}, 1fr)`,
          gap: 6,
          height: "100%",
          padding: 6,
        }}
      >
        {Array.from({ length: multiGridSlotCount }).map((_, idx) => {
          const ringColor = colorForSlot(idx);
          const isFocused = activeDicomSlot === idx;
          const ref = getOrCreateGridRef?.(idx);
          return (
            <div
              key={`mgrid-${idx}`}
              onClick={() => setActiveDicomSlot?.(idx)}
              style={{
                border: `2px solid ${isFocused ? ringColor : "#2b2b2b"}`,
                boxShadow: isFocused ? `0 0 0 2px ${ringColor}66` : "none",
                borderRadius: 8,
                overflow: "hidden",
                background: "#000",
                display: "grid",
                gridTemplateRows: "1fr",
                cursor: "pointer",
                position: "relative",
                transition: "box-shadow 0.12s ease, border-color 0.12s ease",
              }}
            >
              <div style={{ width: "100%", height: "100%", position: "relative" }}>
                <div
                  ref={ref}
                  className="cornerstone3d-viewport"
                  onWheel={(e) => handleCornerstoneDicomWheel?.(idx, e)}
                  onMouseMove={(e) => updateDicomMouseCoords?.(idx, e)}
                  onMouseDown={(e) => updateDicomMouseCoords?.(idx, e)}
                  onMouseLeave={() => clearDicomMouseCoords?.(idx)}
                  onContextMenu={(e) => {
                    if (isMeasureToolActive) {
                      e.preventDefault();
                      setActiveDicomSlot?.(idx);
                      deleteLastLengthOnDicomSlot?.(idx, e);
                    }
                  }}
                  style={{
                    width: "100%",
                    height: "100%",
                    pointerEvents: !isScopedToolActive || activeDicomSlot === idx ? "auto" : "none",
                  }}
                />
                {/* Loading overlay while this slot's stack is mounting */}
                {compareSlotLoading[idx] && (
                  <CompareLoadingOverlay
                    ringColor={ringColor}
                    label={labelFor(idx)}
                  />
                )}
                {renderOverlay(idx)}
                {renderCellStrip(idx)}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  /* ─── 2x2 COMPARE MODE (Phase 2) ─────────────────────────── */
  if (layoutMode === "compare2x2") {
    const compareSlots = [
      { idx: 0, ref: axRef },
      { idx: 1, ref: sagRef },
      { idx: 2, ref: corRef },
      { idx: 3, ref: compareSlot3Ref },
    ];

    /* Resolve a series uid → short label for the corner badge. */
    const labelFor = (slot) => {
      const uid = compareViewportSeries?.[slot];
      if (!uid) return "—";
      const s = availableSeries?.find?.((s) => s.seriesUid === uid);
      if (!s) return "—";
      const num = s.seriesNumber != null ? `SE ${s.seriesNumber}` : "";
      const desc = (s.seriesDescription || s.modality || "").slice(0, 24);
      return [num, desc].filter(Boolean).join(" · ") || "Series";
    };

    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gridTemplateRows: "1fr 1fr",
          gap: 6,
          height: "100%",
          padding: 6,
        }}
      >
        {compareSlots.map(({ idx, ref }) => {
          const ringColor = COMPARE_BORDER_COLORS[idx];
          const isFocused = focusedCompareSlot === idx;
          return (
            <div
              key={`compare-${idx}`}
              onClick={() => {
                setActiveDicomSlot?.(idx);
                setFocusedCompareSlot?.(idx);
              }}
              style={{
                border: `2px solid ${ringColor}`,
                boxShadow: isFocused ? `0 0 0 2px ${ringColor}66` : "none",
                borderRadius: 8,
                overflow: "hidden",
                background: "#000",
                display: "grid",
                gridTemplateRows: "1fr auto",
                cursor: "pointer",
                position: "relative",
                transition: "box-shadow 0.12s ease",
              }}
            >
              <div style={{ width: "100%", height: "100%", position: "relative" }}>
                <div
                  ref={ref}
                  className="cornerstone3d-viewport"
                  onWheel={(e) => handleCornerstoneDicomWheel(idx, e)}
                  onMouseMove={(e) => updateDicomMouseCoords(idx, e)}
                  onMouseDown={(e) => updateDicomMouseCoords(idx, e)}
                  onMouseLeave={() => clearDicomMouseCoords(idx)}
                  onContextMenu={(e) => {
                    if (isMeasureToolActive) {
                      e.preventDefault();
                      setActiveDicomSlot(idx);
                      deleteLastLengthOnDicomSlot(idx, e);
                    }
                  }}
                  style={{
                    width: "100%",
                    height: "100%",
                    pointerEvents: !isScopedToolActive || activeDicomSlot === idx ? "auto" : "none",
                  }}
                />
                {/* Loading overlay while this slot's stack is mounting */}
                {compareSlotLoading[idx] && (
                  <CompareLoadingOverlay
                    ringColor={ringColor}
                    label={labelFor(idx)}
                  />
                )}
                {renderOverlay(idx)}
                {renderCellStrip(idx)}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  /* ─── 3-up MPR (existing main2 mode, unchanged from Phase 1) ─── */
  return dicomGrid.mode === "main2" ? (
    <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 6, height: "100%", padding: 6 }}>
      <div
        onClick={() => setActiveDicomSlot(0)}
        style={{
          border: activeDicomSlot === 0 ? "2px solid #3b82f6" : "1px solid #2b2b2b",
          borderRadius: 8,
          overflow: "hidden",
          background: "#000",
          display: "grid",
          gridTemplateRows: "1fr auto",
          cursor: "pointer",
        }}
      >
        <div
          style={{ width: "100%", height: "100%", position: "relative" }}
        >
          <div
            ref={axRef}
            className="cornerstone3d-viewport"
            onWheel={(e) => handleCornerstoneDicomWheel(0, e)}
            onMouseMove={(e) => updateDicomMouseCoords(0, e)}
            onMouseDown={(e) => updateDicomMouseCoords(0, e)}
            onMouseLeave={() => clearDicomMouseCoords(0)}
            onContextMenu={(e) => {
              if (isMeasureToolActive) {
                e.preventDefault();
                setActiveDicomSlot(0);
                deleteLastLengthOnDicomSlot(0, e);
              }
            }}
            style={{ width: "100%", height: "100%" }}
          />
          {renderOverlay(0)}
          {renderCellStrip(0)}
        </div>
        <div style={{ color: "#cbd5e1", padding: "6px 8px", fontSize: 11, textAlign: "right" }}>{planeLabelForSlot(0)}</div>
      </div>
      <div style={{ display: "grid", gridTemplateRows: "1fr 1fr", gap: 6, height: "100%" }}>
        {[1, 2].map((slot) => (
          <div
            key={slot}
            onClick={() => setActiveDicomSlot(slot)}
            style={{
              border: activeDicomSlot === slot ? "2px solid #3b82f6" : "1px solid #2b2b2b",
              borderRadius: 8,
              overflow: "hidden",
              background: "#000",
              display: "grid",
              gridTemplateRows: "1fr auto",
              cursor: "pointer",
            }}
          >
            <div
              style={{ width: "100%", height: "100%", position: "relative" }}
            >
              <div
                ref={slot === 1 ? sagRef : corRef}
                className="cornerstone3d-viewport"
                onWheel={(e) => handleCornerstoneDicomWheel(slot, e)}
                onMouseMove={(e) => updateDicomMouseCoords(slot, e)}
                onMouseDown={(e) => updateDicomMouseCoords(slot, e)}
                onMouseLeave={() => clearDicomMouseCoords(slot)}
                onContextMenu={(e) => {
                  if (isMeasureToolActive) {
                    e.preventDefault();
                    setActiveDicomSlot(slot);
                    deleteLastLengthOnDicomSlot(slot, e);
                  }
                }}
                style={{ width: "100%", height: "100%", pointerEvents: !isScopedToolActive || activeDicomSlot === slot ? "auto" : "none" }}
              />
              {renderOverlay(slot)}
              {renderCellStrip(slot)}
            </div>
            <div style={{ color: "#cbd5e1", padding: "6px 8px", fontSize: 11, textAlign: "right" }}>{planeLabelForSlot(slot)}</div>
          </div>
        ))}
      </div>
    </div>
  ) : (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${dicomGrid.cols}, 1fr)`,
        gridTemplateRows: `repeat(${dicomGrid.rows}, 1fr)`,
        gap: 6,
        height: "100%",
        padding: 6,
      }}
    >
      {Array.from({ length: dicomGrid.rows * dicomGrid.cols }).map((_, i) => {
        const slot = i;
        if (slot > 2) {
          return <div key={`blank-${i}`} style={{ border: "1px solid #2b2b2b", borderRadius: 8, background: "#000" }} />;
        }
        return (
          <div
            key={`slot-${slot}`}
            onClick={() => setActiveDicomSlot(slot)}
            style={{
              border: activeDicomSlot === slot ? "2px solid #3b82f6" : "1px solid #2b2b2b",
              borderRadius: 8,
              overflow: "hidden",
              background: "#000",
              display: "grid",
              gridTemplateRows: "1fr auto",
              cursor: "pointer",
            }}
          >
            <div
              style={{ width: "100%", height: "100%", position: "relative" }}
            >
              <div
                ref={slot === 0 ? axRef : slot === 1 ? sagRef : corRef}
                className="cornerstone3d-viewport"
                onWheel={(e) => handleCornerstoneDicomWheel(slot, e)}
                onMouseMove={(e) => updateDicomMouseCoords(slot, e)}
                onMouseDown={(e) => updateDicomMouseCoords(slot, e)}
                onMouseLeave={() => clearDicomMouseCoords(slot)}
                onContextMenu={(e) => {
                  if (isMeasureToolActive) {
                    e.preventDefault();
                    setActiveDicomSlot(slot);
                    deleteLastLengthOnDicomSlot(slot, e);
                  }
                }}
                style={{ width: "100%", height: "100%", pointerEvents: !isScopedToolActive || activeDicomSlot === slot ? "auto" : "none" }}
              />
              {renderOverlay(slot)}
              {renderCellStrip(slot)}
            </div>
            <div style={{ color: "#cbd5e1", padding: "6px 8px", fontSize: 11, textAlign: "right" }}>{planeLabelForSlot(slot)}</div>
          </div>
        );
      })}
    </div>
  );
}

