import React from "react";

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
}) {
  return niftiGrid.mode === "main2" ? (
    <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 6, height: "100%", padding: 6 }}>
      <div style={{ border: "1px solid #2b2b2b", borderRadius: 8, overflow: "hidden", background: "#000", display: "grid" }}>
        <div style={{ color: "#cbd5e1", padding: "6px 8px", fontSize: 11 }}>
          {niftiPlane === "axial" ? `Axial (Z ${nzIndex + 1}/${niftiVol.d})` :
           niftiPlane === "sagittal" ? `Sagittal (X ${nxIndex + 1}/${niftiVol.w})` :
           `Coronal (Y ${nyIndex + 1}/${niftiVol.h})`}
        </div>
        <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
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

      <div style={{ display: "grid", gridTemplateRows: "1fr 1fr", gap: 6, height: "100%" }}>
        {["axial", "sagittal", "coronal"].filter((p) => p !== niftiPlane).map((plane) => (
          <div key={plane} style={{ border: "1px solid #2b2b2b", borderRadius: 8, overflow: "hidden", background: "#000", display: "grid" }}>
            <div style={{ color: "#cbd5e1", padding: "6px 8px", fontSize: 11 }}>
              {plane === "axial" ? `Axial (Z ${nzIndex + 1}/${niftiVol.d})` :
               plane === "sagittal" ? `Sagittal (X ${nxIndex + 1}/${niftiVol.w})` :
               `Coronal (Y ${nyIndex + 1}/${niftiVol.h})`}
            </div>
            <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
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
        const label =
          plane === "axial" ? `Axial (Z ${nzIndex + 1}/${niftiVol.d})` :
          plane === "sagittal" ? `Sagittal (X ${nxIndex + 1}/${niftiVol.w})` :
          `Coronal (Y ${nyIndex + 1}/${niftiVol.h})`;

        const onWheel =
          plane === "axial" ? onWheelNiftiAxial :
          plane === "sagittal" ? onWheelNiftiSagittal :
          onWheelNiftiCoronal;

        return (
          <div key={i} style={{ border: "1px solid #2b2b2b", borderRadius: 8, overflow: "hidden", background: "#000", display: "grid" }}>
            <div style={{ color: "#cbd5e1", padding: "6px 8px", fontSize: 11 }}>{label}</div>
            <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
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
