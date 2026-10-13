import React from "react";

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
}) {
  const isMeasureToolActive = typeof dicomTool === "string" && dicomTool.startsWith("measure");

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
      <div>{`Slices: ${dicomSliceBySlot[slot]?.current || 1}/${dicomSliceBySlot[slot]?.total || 1}`}</div>
      <div>{`X:${dicomMouseBySlot[slot]?.x ?? "-"} Y:${dicomMouseBySlot[slot]?.y ?? "-"}`}</div>
    </div>
  );

  const renderCrosshair = (slot) => {
    if (!showDicomCrosshair || dicomTool !== "crosshair") return null;
    const pos = dicomCrosshairBySlot?.[slot];
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
            background: dicomCrosshairColor || "#00ff4c",
            pointerEvents: "none",
            zIndex: 28,
          }}
        />
        <div
          style={{
            position: "absolute",
            top: pos.y,
            left: 0,
            right: 0,
            height: 1,
            background: dicomCrosshairColor || "#00ff4c",
            pointerEvents: "none",
            zIndex: 28,
          }}
        />
      </>
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
      {renderCrosshair(slot)}
      {renderInfo(slot)}
    </div>
  );

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
        </div>
        <div style={{ color: "#cbd5e1", padding: "6px 8px", fontSize: 11, textAlign: "right" }}>{(dicomSlotPlanes[0] || "axial")[0].toUpperCase() + (dicomSlotPlanes[0] || "axial").slice(1)}</div>
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
            </div>
            <div style={{ color: "#cbd5e1", padding: "6px 8px", fontSize: 11, textAlign: "right" }}>{(dicomSlotPlanes[slot] || "axial")[0].toUpperCase() + (dicomSlotPlanes[slot] || "axial").slice(1)}</div>
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
            </div>
            <div style={{ color: "#cbd5e1", padding: "6px 8px", fontSize: 11, textAlign: "right" }}>{(dicomSlotPlanes[slot] || "axial")[0].toUpperCase() + (dicomSlotPlanes[slot] || "axial").slice(1)}</div>
          </div>
        );
      })}
    </div>
  );
}
