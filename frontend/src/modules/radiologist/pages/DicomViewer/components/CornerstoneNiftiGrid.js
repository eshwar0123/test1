import React from "react";

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

  /* Per-view slice stepper, top-right of every pane. Up arrow → previous
     slice, down arrow → next slice. Replaces the old global playback bar. */
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
          right: 6,
          zIndex: 40,
          display: "flex",
          flexDirection: "column",
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
      {renderPlaneLabel(slot)}
      {renderSliceNav(slot)}
      {renderInfo(slot)}
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
            </div>
          </div>
        );
      })}
    </div>
  );
}
