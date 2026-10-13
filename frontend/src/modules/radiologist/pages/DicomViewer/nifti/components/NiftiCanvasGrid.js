import React from "react";

const panelStyle = {
  border: "1px solid #2b2b2b",
  borderRadius: 8,
  overflow: "hidden",
  background: "#000",
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
};

const viewerStyle = {
  position: "relative",
  width: "100%",
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
  minHeight: 0,
};

const labelStyle = {
  position: "absolute",
  top: 8,
  left: 8,
  zIndex: 2,
  color: "#cbd5e1",
  padding: "4px 8px",
  fontSize: 11,
  borderRadius: 6,
  background: "rgba(0, 0, 0, 0.6)",
  pointerEvents: "none",
};

const getPlaneLabel = (plane, nxIndex, nyIndex, nzIndex, niftiVol) =>
  plane === "axial"
    ? `Axial (Z ${nzIndex + 1}/${niftiVol.d})`
    : plane === "sagittal"
      ? `Sagittal (X ${nxIndex + 1}/${niftiVol.w})`
      : `Coronal (Y ${nyIndex + 1}/${niftiVol.h})`;

export default function NiftiCanvasGrid({
  niftiGrid,
  niftiPlane,
  niftiVol,
  nxIndex,
  nyIndex,
  nzIndex,
  niftiTool,
  niftiPan,
  niftiZoom,
  niftiRotation,
  onWheelNiftiAxial,
  onWheelNiftiSagittal,
  onWheelNiftiCoronal,
  startNiftiDrag,
  updateNiftiDrag,
  endNiftiDrag,
  onNiftiContextMenu,
  // Step a single plane by one slice. up arrow → previous (-1), down → next (+1).
  onSliceStep,
}) {
  return niftiGrid.mode === "main2" ? (
    <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 6, height: "100%", padding: 6 }}>
      <div style={panelStyle}>
        <div style={viewerStyle}>
          <div style={labelStyle}>
            {getPlaneLabel(niftiPlane, nxIndex, nyIndex, nzIndex, niftiVol)}
          </div>
          <canvas
            onWheel={niftiPlane === "axial" ? onWheelNiftiAxial : niftiPlane === "sagittal" ? onWheelNiftiSagittal : onWheelNiftiCoronal}
            onMouseDown={(e) => startNiftiDrag(niftiPlane, e)}
            onMouseMove={(e) => updateNiftiDrag(niftiPlane, e)}
            onMouseUp={() => endNiftiDrag(niftiPlane)}
            onMouseLeave={() => endNiftiDrag(niftiPlane)}
            onContextMenu={(e) => onNiftiContextMenu(niftiPlane, e)}
            data-nifti-plane={niftiPlane}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              display: "block",
              imageRendering: "auto",
              cursor: niftiTool === "pan" ? "grab" : "crosshair",
              transform: `translate(${niftiPan[niftiPlane].x}px, ${niftiPan[niftiPlane].y}px) scale(${niftiZoom[niftiPlane] ?? 1}) rotate(${niftiRotation[niftiPlane]}deg)`,
              transformOrigin: "center",
            }}
          />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateRows: "1fr 1fr", gap: 6, height: "100%", minHeight: 0 }}>
        {["axial", "sagittal", "coronal"].filter((p) => p !== niftiPlane).map((plane) => (
          <div key={plane} style={panelStyle}>
            <div style={viewerStyle}>
              <div style={labelStyle}>
                {getPlaneLabel(plane, nxIndex, nyIndex, nzIndex, niftiVol)}
              </div>
              <canvas
                onWheel={plane === "axial" ? onWheelNiftiAxial : plane === "sagittal" ? onWheelNiftiSagittal : onWheelNiftiCoronal}
                onMouseDown={(e) => startNiftiDrag(plane, e)}
                onMouseMove={(e) => updateNiftiDrag(plane, e)}
                onMouseUp={() => endNiftiDrag(plane)}
                onMouseLeave={() => endNiftiDrag(plane)}
                onContextMenu={(e) => onNiftiContextMenu(plane, e)}
                data-nifti-plane={plane}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  display: "block",
                  imageRendering: "auto",
                  cursor: niftiTool === "pan" ? "grab" : "crosshair",
                  transform: `translate(${niftiPan[plane].x}px, ${niftiPan[plane].y}px) scale(${niftiZoom[plane] ?? 1}) rotate(${niftiRotation[plane]}deg)`,
                  transformOrigin: "center",
                }}
              />
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
        const plane = niftiPlane;
        const zoom = niftiZoom[plane] ?? 1;
        const label = getPlaneLabel(plane, nxIndex, nyIndex, nzIndex, niftiVol);

        const onWheel =
          plane === "axial" ? onWheelNiftiAxial :
          plane === "sagittal" ? onWheelNiftiSagittal :
          onWheelNiftiCoronal;

        return (
          <div key={i} style={panelStyle}>
            <div style={viewerStyle}>
              <div style={labelStyle}>{label}</div>
              <canvas
                onWheel={onWheel}
                onMouseDown={(e) => startNiftiDrag(plane, e)}
                onMouseMove={(e) => updateNiftiDrag(plane, e)}
                onMouseUp={() => endNiftiDrag(plane)}
                onMouseLeave={() => endNiftiDrag(plane)}
                onContextMenu={(e) => onNiftiContextMenu(plane, e)}
                data-nifti-plane={plane}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  display: "block",
                  imageRendering: "auto",
                  cursor: niftiTool === "pan" ? "grab" : "crosshair",
                  transform: `translate(${niftiPan[plane].x}px, ${niftiPan[plane].y}px) scale(${zoom}) rotate(${niftiRotation[plane]}deg)`,
                  transformOrigin: "center",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
