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
}) {
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
          display: "grid",
          gridTemplateRows: "1fr auto",
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
        <div style={{ color: "#cbd5e1", padding: "6px 8px", fontSize: 11, textAlign: "right" }}>{(niftiSlotPlanes[0] || "axial")[0].toUpperCase() + (niftiSlotPlanes[0] || "axial").slice(1)}</div>
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
              display: "grid",
              gridTemplateRows: "1fr auto",
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
            <div style={{ color: "#cbd5e1", padding: "6px 8px", fontSize: 11, textAlign: "right" }}>{(niftiSlotPlanes[slot] || "axial")[0].toUpperCase() + (niftiSlotPlanes[slot] || "axial").slice(1)}</div>
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
              display: "grid",
              gridTemplateRows: "1fr auto",
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
            <div style={{ color: "#cbd5e1", padding: "6px 8px", fontSize: 11, textAlign: "right" }}>{(niftiSlotPlanes[slot] || "axial")[0].toUpperCase() + (niftiSlotPlanes[slot] || "axial").slice(1)}</div>
          </div>
        );
      })}
    </div>
  );
}
