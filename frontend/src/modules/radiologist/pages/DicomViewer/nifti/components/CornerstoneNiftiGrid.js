import React from "react";
import LocatorLineOverlay from "../../components/LocatorLineOverlay";

/* Minimal vertical scroll strip — renders at the right edge of its cell. */
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
    <div
      ref={trackRef}
      style={{
        position: "absolute", right: 0, top: 0, bottom: 0, width: 14,
        background: "rgba(0,0,0,0.38)", zIndex: 36, cursor: "ns-resize",
        borderLeft: "1px solid rgba(255,255,255,0.06)", userSelect: "none",
        pointerEvents: "auto",
      }}
      onPointerDown={(e) => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); seek(e.clientY, current); }}
      onPointerMove={(e) => { if (e.buttons !== 1) return; e.stopPropagation(); seek(e.clientY, current); }}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{
        position: "absolute", left: 2, right: 2, top: `${pct}%`,
        transform: "translateY(-50%)", height: `${thumbH}%`, minHeight: 10,
        background: "#3b82f6", borderRadius: 3, pointerEvents: "none",
        boxShadow: "0 0 0 1px rgba(59,130,246,0.45)", transition: "top 0.04s linear",
      }} />
    </div>
  );
}

export default function CornerstoneNiftiGrid({
  niftiGrid,
  activeNiftiSlot,
  setActiveNiftiSlot,
  axRef,
  sagRef,
  corRef,
  handleCornerstoneNiftiWheel,
  updateNiftiMouseCoords,
  clearNiftiMouseCoords,
  niftiTool,
  deleteLastLengthOnNiftiSlot,
  isScopedToolActive,
  niftiSliceBySlot,
  niftiMouseBySlot,
  niftiSlotPlanes,
  isCornerstoneNifti,
  niftiCrosshairBySlot,
  niftiCrosshairColor,
  showNiftiCrosshair,
  // Step a single pane by one slice. up arrow → previous (-1), down → next (+1).
  onSliceStep,
  // Anatomy label (idea 1) — shown in the clicked cell's top-left corner.
  anatomySlot = null,
  anatomyText = null,
  referenceLinesBySlot = {},
}) {
  const getPlaneLabel = (slot) => {
    const plane = niftiSlotPlanes[slot] || "axial";
    return plane[0].toUpperCase() + plane.slice(1);
  };

  const renderNiftiCrosshairOverlay = (slot) => {
    if (!showNiftiCrosshair || niftiTool !== "crosshair") return null;
    const pos = niftiCrosshairBySlot?.[slot];
    if (!pos || pos.x == null || pos.y == null) return null;
    return (
      <>
        <div
          style={{
            position: "absolute",
            left: pos.x,
            top: 0,
            bottom: 0,
            width: 1,
            background: niftiCrosshairColor || "#22c55e",
            pointerEvents: "none",
            opacity: 0.95,
          }}
        />
        <div
          style={{
            position: "absolute",
            top: pos.y,
            left: 0,
            right: 0,
            height: 1,
            background: niftiCrosshairColor || "#22c55e",
            pointerEvents: "none",
            opacity: 0.95,
          }}
        />
      </>
    );
  };

  const renderInfo = (slot) => (
    <div
      style={{
        position: "absolute",
        left: 8,
        bottom: 6,
        zIndex: 30,
        fontSize: 11,
        color: "#cbd5e1",
        background: "rgba(0,0,0,0.48)",
        padding: "2px 6px",
        borderRadius: 4,
        pointerEvents: "none",
        lineHeight: 1.3,
      }}
    >
      <div>{`Slices: ${niftiSliceBySlot[slot]?.current || 1}/${niftiSliceBySlot[slot]?.total || 1}`}</div>
      <div>{`X:${niftiMouseBySlot[slot]?.x ?? "-"} Y:${niftiMouseBySlot[slot]?.y ?? "-"}`}</div>
    </div>
  );

  const renderPlaneLabel = (slot) => (
    <div
      style={{
        position: "absolute",
        top: 8,
        left: 8,
        zIndex: 30,
        fontSize: 11,
        color: "#cbd5e1",
        background: "rgba(0,0,0,0.48)",
        padding: "2px 6px",
        borderRadius: 4,
        pointerEvents: "none",
        lineHeight: 1.3,
      }}
    >
      {getPlaneLabel(slot)}
    </div>
  );

  /* Per-cell slice stepper — ▲▼ horizontal row at top-right of every pane. */
  const renderSliceNav = (slot) => {
    const navBtnStyle = {
      background: "rgba(17,24,39,0.78)",
      border: "1px solid #2d3748",
      borderRadius: 6,
      width: 26,
      height: 24,
      padding: 0,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#e5e7eb",
      cursor: "pointer",
    };
    const step = (e, delta) => {
      e.stopPropagation();
      setActiveNiftiSlot?.(slot);
      onSliceStep?.(slot, delta);
    };
    return (
      <div
        style={{
          position: "absolute",
          top: 6,
          right: 20,
          zIndex: 40,
          display: "flex",
          flexDirection: "row",
          gap: 4,
          pointerEvents: "auto",
        }}
      >
        <button style={navBtnStyle} onClick={(e) => step(e, -1)} title="Previous slice" aria-label="Previous slice">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 10l4-4 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <button style={navBtnStyle} onClick={(e) => step(e, 1)} title="Next slice" aria-label="Next slice">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
    );
  };

  const renderCellStrip = (slot) => (
    <CellSliceStrip
      current={niftiSliceBySlot[slot]?.current ?? 1}
      total={niftiSliceBySlot[slot]?.total ?? 1}
      onStep={(delta) => { setActiveNiftiSlot?.(slot); onSliceStep?.(slot, delta); }}
    />
  );

  /* Anatomy label — below nav buttons, same font/color as info overlays, no background */
  const renderAnatomy = (slot) => {
    if (slot !== anatomySlot || !anatomyText) return null;
    return (
      <div
        style={{
          position: "absolute",
          top: 36,
          right: 20,
          zIndex: 31,
          maxWidth: "72%",
          color: "#cbd5e1",
          fontSize: 11,
          fontWeight: 500,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          lineHeight: 1.3,
          textAlign: "right",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          pointerEvents: "none",
        }}
      >
        {anatomyText}
      </div>
    );
  };

  const renderOverlay = (slot) => (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 20,
      }}
    >
      {renderNiftiCrosshairOverlay(slot)}
      <LocatorLineOverlay lines={referenceLinesBySlot[slot]} />
      {renderPlaneLabel(slot)}
      {renderSliceNav(slot)}
      {renderInfo(slot)}
      {renderAnatomy(slot)}
    </div>
  );

  return niftiGrid.mode === "main2" ? (
    <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 6, height: "100%", padding: 6 }}>
      <div
        onClick={() => setActiveNiftiSlot(0)}
        style={{
          border: activeNiftiSlot === 0 ? "2px solid #3b82f6" : "1px solid #2b2b2b",
          borderRadius: 8,
          overflow: "hidden",
          background: "#000",
          position: "relative",
          cursor: "pointer",
        }}
      >
        <div style={{ width: "100%", height: "100%", position: "relative" }}>
          <div
            ref={axRef}
            className="cornerstone3d-viewport"
            onWheel={(e) => handleCornerstoneNiftiWheel(0, e)}
            onMouseMove={(e) => updateNiftiMouseCoords(0, e)}
            onMouseLeave={() => clearNiftiMouseCoords(0)}
            onContextMenu={(e) => {
              if (isCornerstoneNifti && typeof niftiTool === "string" && niftiTool.startsWith("measure")) {
                e.preventDefault();
                setActiveNiftiSlot(0);
                deleteLastLengthOnNiftiSlot(0, e);
              }
            }}
            style={{ width: "100%", height: "100%" }}
          />
          {renderOverlay(0)}
          {renderCellStrip(0)}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateRows: "1fr 1fr", gap: 6, height: "100%" }}>
        {[1, 2].map((slot) => (
          <div
            key={slot}
            onClick={() => setActiveNiftiSlot(slot)}
            style={{
              border: activeNiftiSlot === slot ? "2px solid #3b82f6" : "1px solid #2b2b2b",
              borderRadius: 8,
              overflow: "hidden",
              background: "#000",
              position: "relative",
              cursor: "pointer",
            }}
          >
            <div style={{ width: "100%", height: "100%", position: "relative" }}>
              <div
                ref={slot === 1 ? sagRef : corRef}
                className="cornerstone3d-viewport"
                onWheel={(e) => handleCornerstoneNiftiWheel(slot, e)}
                onMouseMove={(e) => updateNiftiMouseCoords(slot, e)}
                onMouseLeave={() => clearNiftiMouseCoords(slot)}
                onContextMenu={(e) => {
                  if (isCornerstoneNifti && typeof niftiTool === "string" && niftiTool.startsWith("measure")) {
                    e.preventDefault();
                    setActiveNiftiSlot(slot);
                    deleteLastLengthOnNiftiSlot(slot, e);
                  }
                }}
                style={{ width: "100%", height: "100%", pointerEvents: !isScopedToolActive || activeNiftiSlot === slot ? "auto" : "none" }}
              />
              {renderOverlay(slot)}
              {renderCellStrip(slot)}
            </div>
          </div>
        ))}
      </div>
    </div>
  ) : (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${niftiGrid.cols}, 1fr)`,
        gridTemplateRows: `repeat(${niftiGrid.rows}, 1fr)`,
        gap: 6,
        height: "100%",
        padding: 6,
      }}
    >
      {Array.from({ length: niftiGrid.rows * niftiGrid.cols }).map((_, i) => {
        const slot = i;
        if (slot > 2) {
          return <div key={`blank-${i}`} style={{ border: "1px solid #2b2b2b", borderRadius: 8, background: "#000" }} />;
        }
        return (
          <div
            key={`slot-${slot}`}
            onClick={() => setActiveNiftiSlot(slot)}
            style={{
              border: activeNiftiSlot === slot ? "2px solid #3b82f6" : "1px solid #2b2b2b",
              borderRadius: 8,
              overflow: "hidden",
              background: "#000",
              position: "relative",
              cursor: "pointer",
            }}
          >
            <div style={{ width: "100%", height: "100%", position: "relative" }}>
              <div
                ref={slot === 0 ? axRef : slot === 1 ? sagRef : corRef}
                className="cornerstone3d-viewport"
                onWheel={(e) => handleCornerstoneNiftiWheel(slot, e)}
                onMouseMove={(e) => updateNiftiMouseCoords(slot, e)}
                onMouseLeave={() => clearNiftiMouseCoords(slot)}
                onContextMenu={(e) => {
                  if (isCornerstoneNifti && typeof niftiTool === "string" && niftiTool.startsWith("measure")) {
                    e.preventDefault();
                    setActiveNiftiSlot(slot);
                    deleteLastLengthOnNiftiSlot(slot, e);
                  }
                }}
                style={{ width: "100%", height: "100%", pointerEvents: !isScopedToolActive || activeNiftiSlot === slot ? "auto" : "none" }}
              />
              {renderOverlay(slot)}
              {renderCellStrip(slot)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
