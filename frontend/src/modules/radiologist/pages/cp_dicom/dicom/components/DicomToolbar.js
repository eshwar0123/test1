import React, { useEffect, useRef, useState } from "react";

const CT_PRESETS = [
  { label: "Brain",       width: 80,   center: 40 },
  { label: "Bone",        width: 1500, center: 300 },
  { label: "Lung",        width: 1500, center: -600 },
  { label: "Soft Tissue", width: 400,  center: 40 },
  { label: "Abdomen",     width: 350,  center: 40 },
  { label: "Mediastinum", width: 350,  center: 50 },
];

export default function DicomToolbar({
  showGridMenu,
  setShowGridMenu,
  dicomGridSelected,
  dicomGrid,
  setDicomGrid,
  setDicomGridSelected,
  showPlaneMenu,
  setShowPlaneMenu,
  activeDicomSlot,
  dicomSlotPlanes,
  setDicomSlotPlanes,
  dicomZoomMode,
  setDicomZoomMode,
  dicomTool,
  activateCornerstoneDicomTool,
  scrollCornerstoneDicom,
  rotateCornerstoneDicom,
  saveSelectedViewportAsPng,
  setIsPlaying,
  isPlaying,
  saveNotice,
  onMeasureActivate,
  // new
  applyWindowPreset,
  isFlipH,
  isFlipV,
  isInverted,
  onFlipH,
  onFlipV,
  onInvert,
}) {
  const [showMeasureMenu, setShowMeasureMenu] = useState(false);
  const [showPresetMenu, setShowPresetMenu] = useState(false);
  const toolbarMenusRef = useRef(null);

  const measurementTools = [
    { id: "measure", label: "Length" },
    { id: "measure-rect", label: "Rectangle ROI" },
    { id: "measure-circle", label: "Circle ROI" },
    { id: "measure-freehand", label: "Freehand ROI" },
  ];
  const isMeasureToolActive = typeof dicomTool === "string" && dicomTool.startsWith("measure");
  const activeMeasureTool = measurementTools.find((t) => t.id === dicomTool) || measurementTools[0];

  const toolItemStyle = {
    display: "flex", flexDirection: "column", alignItems: "center",
    gap: 5, minWidth: 48, flex: "0 0 auto",
  };
  const toolLabelStyle = {
    fontSize: 11, color: "#8b97ac", lineHeight: 1, userSelect: "none",
    whiteSpace: "nowrap", letterSpacing: "0.04em", fontWeight: 500,
  };

  const renderMeasureToolIcon = (toolId) => {
    if (toolId === "measure-rect") return (
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="10" height="10" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    );
    if (toolId === "measure-circle") return (
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    );
    if (toolId === "measure-freehand") return (
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M2.5 9.5c1.1-2 2.1-3 3.4-3 1.1 0 1.6 1.1 2.5 1.1 1 0 1.2-2.1 2.6-2.1 1.2 0 1.8 1 2.5 2.5.6 1.1.3 3.5-1.6 3.5H5.2c-1.8 0-3.4-.8-2.7-2z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
    return (
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M3 13l10-10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  };

  useEffect(() => {
    if (!showGridMenu && !showPlaneMenu && !showMeasureMenu && !showPresetMenu) return;
    const handler = (e) => {
      if (!toolbarMenusRef.current?.contains(e.target)) {
        setShowGridMenu(false); setShowPlaneMenu(false);
        setShowMeasureMenu(false); setShowPresetMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showGridMenu, showPlaneMenu, showMeasureMenu, showPresetMenu, setShowGridMenu, setShowPlaneMenu]);

  const closeAllMenus = () => {
    setShowGridMenu(false); setShowPlaneMenu(false);
    setShowMeasureMenu(false); setShowPresetMenu(false);
  };

  return (
    <>
      <style>{`
        .vtb-btn {
          cursor: pointer;
          transition: background 0.13s ease, box-shadow 0.13s ease, transform 0.08s ease;
          outline: none; font-family: inherit;
        }
        .vtb-btn:hover:not(:disabled) { background: #253047 !important; box-shadow: 0 0 0 1px rgba(255,255,255,0.07) !important; }
        .vtb-btn:active:not(:disabled) { transform: scale(0.91); }
        .vtb-btn:focus-visible { outline: 2px solid #3b82f6; outline-offset: 2px; }
        .vtb-sep {
          width: 1px; align-self: stretch; flex-shrink: 0; margin: 3px 6px;
          background: linear-gradient(to bottom, transparent, #2d3748 28%, #2d3748 72%, transparent);
          border-radius: 1px;
        }
      `}</style>

      <div
        ref={toolbarMenusRef}
        style={{
          position: "relative", zIndex: 5, display: "flex", gap: 3,
          alignItems: "flex-start", flexWrap: "wrap", padding: "8px 12px 6px",
          background: "linear-gradient(180deg, #0e1520 0%, #0b0f16 100%)",
          border: "1px solid #1e2a3a", borderRadius: 10,
          boxShadow: "0 2px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.03)",
        }}
      >
        {/* ── Layout ────────────────────────────────────────── */}
        <div style={toolItemStyle}>
          <div style={{ position: "relative" }}>
            <button
              className="vtb-btn"
              onClick={() => { const n = !showGridMenu; closeAllMenus(); if (n) setShowGridMenu(true); }}
              title="Grid" aria-label="Grid"
              style={{ background: "#1f2937", color: "#e5e7eb", border: dicomGridSelected ? "2px solid #3b82f6" : "1px solid #1e2a3a", borderRadius: 6, padding: "8px 10px", display: "flex", alignItems: "center", gap: 6 }}
            >
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 3l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {showGridMenu && (
              <div style={{ position: "absolute", top: 38, left: 0, background: "#131c2b", border: "1px solid #2d3748", borderRadius: 8, padding: 8, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, minWidth: 248, zIndex: 200, boxShadow: "0 8px 28px rgba(0,0,0,0.7)" }}>
                {[{ label: "Main+2", rows: 2, cols: 2, mode: "main2" }, { label: "1x1", rows: 1, cols: 1, mode: "grid" }, { label: "1x2", rows: 1, cols: 2, mode: "grid" }, { label: "2x1", rows: 2, cols: 1, mode: "grid" }, { label: "2x2", rows: 2, cols: 2, mode: "grid" }, { label: "3x1", rows: 3, cols: 1, mode: "grid" }, { label: "3x2", rows: 3, cols: 2, mode: "grid" }].map((g) => (
                  <button key={g.label} className="vtb-btn"
                    onClick={() => { setDicomGrid({ rows: g.rows, cols: g.cols, mode: g.mode }); setDicomGridSelected(true); setShowGridMenu(false); }}
                    title={g.label}
                    style={{ background: "#1f2937", color: "#e5e7eb", border: (dicomGrid.rows === g.rows && dicomGrid.cols === g.cols && dicomGrid.mode === g.mode) ? "2px solid #3b82f6" : "1px solid #2d3748", borderRadius: 6, width: 46, height: 40, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                  >
                    <svg width="22" height="18" viewBox="0 0 22 18" fill="none" aria-hidden="true">
                      {g.mode === "main2" ? (<><rect x="1" y="1" width="12" height="16" stroke="#d1d5db" strokeWidth="1.2" /><rect x="14.5" y="1" width="6.5" height="7.5" stroke="#d1d5db" strokeWidth="1.2" /><rect x="14.5" y="9.5" width="6.5" height="7.5" stroke="#d1d5db" strokeWidth="1.2" /></>) : (<><rect x="1" y="1" width="20" height="16" stroke="#d1d5db" strokeWidth="1.2" />{Array.from({ length: g.cols - 1 }).map((_, i) => { const x = 1 + ((i + 1) * 20) / g.cols; return <path key={`c${i}`} d={`M${x} 1V17`} stroke="#d1d5db" strokeWidth="1.2" />; })}{Array.from({ length: g.rows - 1 }).map((_, i) => { const y = 1 + ((i + 1) * 16) / g.rows; return <path key={`r${i}`} d={`M1 ${y}H21`} stroke="#d1d5db" strokeWidth="1.2" />; })}</>)}
                    </svg>
                  </button>
                ))}
              </div>
            )}
          </div>
          <span style={toolLabelStyle}>Grid</span>
        </div>

        <div style={toolItemStyle}>
          <div style={{ position: "relative" }}>
            <button
              className="vtb-btn"
              onClick={() => { if (!dicomGridSelected) return; const n = !showPlaneMenu; closeAllMenus(); if (n) setShowPlaneMenu(true); }}
              title="Plane" aria-label="Plane"
              style={{ background: "#1f2937", color: dicomGridSelected ? "#e5e7eb" : "#6b7280", border: "1px solid #1e2a3a", borderRadius: 6, padding: "8px 10px", display: "flex", alignItems: "center", gap: 6, cursor: dicomGridSelected ? "pointer" : "not-allowed" }}
            >
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                <path d="M3 10a5 5 0 0 1 10 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <path d="M8 5v8M5 7h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 3l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {showPlaneMenu && (
              <div style={{ position: "absolute", top: 38, left: 0, background: "#131c2b", border: "1px solid #2d3748", borderRadius: 8, padding: 4, minWidth: 130, zIndex: 200, boxShadow: "0 8px 28px rgba(0,0,0,0.7)" }}>
                {["axial", "coronal", "sagittal"].map((p) => (
                  <button key={p} className="vtb-btn"
                    onClick={() => { setDicomSlotPlanes((prev) => { const next = [...prev]; const slot = activeDicomSlot; const other = next.findIndex((x) => x === p); if (other >= 0) { const t = next[slot]; next[slot] = p; next[other] = t; } else { next[slot] = p; } return next; }); setShowPlaneMenu(false); }}
                    style={{ width: "100%", textAlign: "left", background: dicomSlotPlanes[activeDicomSlot] === p ? "#1e2e44" : "transparent", color: "#e5e7eb", border: "none", padding: "7px 10px", fontSize: 12, borderRadius: 4 }}
                  >{p[0].toUpperCase() + p.slice(1)}</button>
                ))}
              </div>
            )}
          </div>
          <span style={toolLabelStyle}>Plane</span>
        </div>

        <div className="vtb-sep" />

        {/* ── Window Presets ────────────────────────────────── */}
        <div style={toolItemStyle}>
          <div style={{ position: "relative" }}>
            <button
              className="vtb-btn"
              onClick={() => { const n = !showPresetMenu; closeAllMenus(); if (n) setShowPresetMenu(true); }}
              title="CT Window Presets" aria-label="CT Window Presets"
              style={{ background: "#1f2937", color: "#e5e7eb", border: "1px solid #1e2a3a", borderRadius: 6, padding: "8px 10px", display: "flex", alignItems: "center", gap: 6 }}
            >
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.2" />
                <path d="M2 8h12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                <path d="M8 2v12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeDasharray="2 2" />
              </svg>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 3l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {showPresetMenu && (
              <div style={{ position: "absolute", top: 38, left: 0, background: "#131c2b", border: "1px solid #2d3748", borderRadius: 8, padding: 4, minWidth: 170, zIndex: 200, boxShadow: "0 8px 28px rgba(0,0,0,0.7)" }}>
                {CT_PRESETS.map((p) => (
                  <button key={p.label} className="vtb-btn"
                    onClick={() => { applyWindowPreset?.(p.width, p.center); setShowPresetMenu(false); }}
                    style={{ width: "100%", textAlign: "left", background: "transparent", color: "#e5e7eb", border: "none", padding: "7px 10px", fontSize: 12, borderRadius: 4, display: "flex", justifyContent: "space-between", gap: 12 }}
                  >
                    <span>{p.label}</span>
                    <span style={{ color: "#64748b", fontFamily: "monospace", fontSize: 11 }}>W:{p.width} L:{p.center}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <span style={toolLabelStyle}>Presets</span>
        </div>

        <div className="vtb-sep" />

        {/* ── Interaction Tools ─────────────────────────────── */}
        <div style={toolItemStyle}>
          <button className="vtb-btn"
            onClick={() => { const next = !dicomZoomMode; setDicomZoomMode(next); activateCornerstoneDicomTool(next ? "zoom" : "brightness"); }}
            title="Zoom (scroll)" aria-label="Zoom"
            style={{ background: "#1f2937", color: "#e5e7eb", border: dicomZoomMode ? "2px solid #3b82f6" : "1px solid #1e2a3a", borderRadius: 6, padding: "8px 10px", display: "flex", alignItems: "center", gap: 6 }}
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" style={{ display: "block" }}>
              <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
              <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <path d="M7 5.5v3M5.5 7h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
          <span style={toolLabelStyle}>Zoom</span>
        </div>

        <div style={toolItemStyle}>
          <button className="vtb-btn"
            onClick={() => { activateCornerstoneDicomTool(dicomTool === "pan" ? "none" : "pan"); }}
            title="Pan" aria-label="Pan"
            style={{ background: "#1f2937", color: "#e5e7eb", border: dicomTool === "pan" ? "2px solid #3b82f6" : "1px solid #1e2a3a", borderRadius: 6, padding: "8px 10px", display: "flex", alignItems: "center" }}
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <path d="M5 7v-2a1 1 0 0 1 2 0v2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              <path d="M7 7v-3a1 1 0 0 1 2 0v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              <path d="M9 7v-2a1 1 0 0 1 2 0v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              <path d="M4.5 7.5v2.5c0 2 1.5 3.5 3.5 3.5h1.5c2 0 3-1.5 3-3.5V8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
          <span style={toolLabelStyle}>Pan</span>
        </div>

        <div style={toolItemStyle}>
          <button className="vtb-btn"
            onClick={() => { activateCornerstoneDicomTool(dicomTool === "brightness" ? "none" : "brightness"); }}
            title="Brightness / W·L" aria-label="Brightness"
            style={{ background: "#1f2937", color: "#e5e7eb", border: dicomTool === "brightness" ? "2px solid #3b82f6" : "1px solid #1e2a3a", borderRadius: 6, padding: "8px 10px", display: "flex", alignItems: "center" }}
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <path d="M8 2a6 6 0 1 0 0 12V2z" fill="currentColor" opacity="0.5" />
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
          <span style={toolLabelStyle}>W / L</span>
        </div>

        <div style={toolItemStyle}>
          <button className="vtb-btn"
            onClick={() => { setDicomZoomMode(false); activateCornerstoneDicomTool(dicomTool === "crosshair" ? "none" : "crosshair"); }}
            title="Crosshair" aria-label="Crosshair"
            style={{ background: "#1f2937", color: "#e5e7eb", border: dicomTool === "crosshair" ? "2px solid #3b82f6" : "1px solid #1e2a3a", borderRadius: 6, padding: "8px 10px", display: "flex", alignItems: "center" }}
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.2" />
              <path d="M8 2.5v3M8 10.5v3M2.5 8h3M10.5 8h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              <circle cx="8" cy="8" r="1.1" fill="currentColor" />
            </svg>
          </button>
          <span style={toolLabelStyle}>Crosshair</span>
        </div>

        <div className="vtb-sep" />

        {/* ── Image Manipulation ────────────────────────────── */}
        <div style={toolItemStyle}>
          <button className="vtb-btn" onClick={onFlipH}
            title="Flip Horizontal" aria-label="Flip Horizontal"
            style={{ background: "#1f2937", color: "#e5e7eb", border: isFlipH ? "2px solid #3b82f6" : "1px solid #1e2a3a", borderRadius: 6, padding: "8px 10px", display: "flex", alignItems: "center" }}
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M8 2v12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeDasharray="2 2" />
              <path d="M4 5L1 8l3 3V5zM12 5l3 3-3 3V5z" fill="currentColor" />
            </svg>
          </button>
          <span style={toolLabelStyle}>Flip H</span>
        </div>

        <div style={toolItemStyle}>
          <button className="vtb-btn" onClick={onFlipV}
            title="Flip Vertical" aria-label="Flip Vertical"
            style={{ background: "#1f2937", color: "#e5e7eb", border: isFlipV ? "2px solid #3b82f6" : "1px solid #1e2a3a", borderRadius: 6, padding: "8px 10px", display: "flex", alignItems: "center" }}
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M2 8h12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeDasharray="2 2" />
              <path d="M5 4L8 1l3 3H5zM5 12l3 3 3-3H5z" fill="currentColor" />
            </svg>
          </button>
          <span style={toolLabelStyle}>Flip V</span>
        </div>

        <div style={toolItemStyle}>
          <button className="vtb-btn" onClick={onInvert}
            title="Invert / Negative" aria-label="Invert"
            style={{ background: "#1f2937", color: isInverted ? "#fbbf24" : "#e5e7eb", border: isInverted ? "2px solid #f59e0b" : "1px solid #1e2a3a", borderRadius: 6, padding: "8px 10px", display: "flex", alignItems: "center" }}
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" />
              <path d="M8 2a6 6 0 0 1 0 12V2z" fill="currentColor" />
            </svg>
          </button>
          <span style={toolLabelStyle}>Invert</span>
        </div>

        <div className="vtb-sep" />

        {/* ── Capture & Rotation ───────────────────────────── */}
        <div style={toolItemStyle}>
          <button className="vtb-btn" onClick={saveSelectedViewportAsPng}
            title="Save selected view as PNG" aria-label="Save selected view as PNG"
            style={{ background: "#1f2937", color: "#e5e7eb", border: "1px solid #1e2a3a", borderRadius: 6, padding: "8px 10px", display: "flex", alignItems: "center" }}
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
              <circle cx="6" cy="7" r="1.2" fill="currentColor" />
              <path d="M4 11l2.2-2.1 1.8 1.7 2.2-2.3L12 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <span style={toolLabelStyle}>Capture</span>
        </div>

        <div style={toolItemStyle}>
          <button className="vtb-btn" onClick={() => rotateCornerstoneDicom(-90)}
            title="Rotate CCW" aria-label="Rotate CCW"
            style={{ background: "#1f2937", color: "#e5e7eb", border: "1px solid #1e2a3a", borderRadius: 6, padding: "8px 10px", display: "flex", alignItems: "center" }}
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <path d="M6 3H3v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M3 6a5 5 0 1 1 2 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
          <span style={toolLabelStyle}>Rotate L</span>
        </div>

        <div style={toolItemStyle}>
          <button className="vtb-btn" onClick={() => rotateCornerstoneDicom(90)}
            title="Rotate CW" aria-label="Rotate CW"
            style={{ background: "#1f2937", color: "#e5e7eb", border: "1px solid #1e2a3a", borderRadius: 6, padding: "8px 10px", display: "flex", alignItems: "center" }}
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <path d="M10 3h3v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M13 6a5 5 0 1 0-2 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
          <span style={toolLabelStyle}>Rotate R</span>
        </div>

        <div className="vtb-sep" />

        {/* ── Measurement ──────────────────────────────────── */}
        <div style={toolItemStyle}>
          <div style={{ position: "relative" }}>
            <button className="vtb-btn"
              onClick={() => { const n = !showMeasureMenu; closeAllMenus(); if (n) setShowMeasureMenu(true); }}
              title={`Measure (${activeMeasureTool.label})`} aria-label="Measure tools"
              style={{ background: "#1f2937", color: "#e5e7eb", border: isMeasureToolActive ? "2px solid #3b82f6" : "1px solid #1e2a3a", borderRadius: 6, padding: "8px 10px", display: "flex", alignItems: "center", gap: 6 }}
            >
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                {renderMeasureToolIcon(activeMeasureTool.id).props.children}
              </svg>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                <path d="M2 3l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {showMeasureMenu && (
              <div style={{ position: "absolute", top: 38, left: 0, background: "#131c2b", border: "1px solid #2d3748", borderRadius: 8, padding: 6, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 5, zIndex: 200, boxShadow: "0 8px 28px rgba(0,0,0,0.7)" }}>
                {measurementTools.map((tool) => (
                  <button key={tool.id} className="vtb-btn"
                    onClick={() => { const next = dicomTool === tool.id ? "none" : tool.id; if (next !== "none") onMeasureActivate?.(); activateCornerstoneDicomTool(next); setShowMeasureMenu(false); }}
                    style={{ width: 34, height: 34, background: dicomTool === tool.id ? "#1e3a5f" : "#1f2937", color: "#e5e7eb", border: dicomTool === tool.id ? "1px solid #3b82f6" : "1px solid #2d3748", padding: 0, borderRadius: 6, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                    title={tool.label} aria-label={tool.label}
                  >{renderMeasureToolIcon(tool.id)}</button>
                ))}
              </div>
            )}
          </div>
          <span style={toolLabelStyle}>Measure</span>
        </div>

        <div className="vtb-sep" />

        {/* ── Playback ─────────────────────────────────────── */}
        <div style={toolItemStyle}>
          <button className="vtb-btn" onClick={() => scrollCornerstoneDicom(-1)} title="Rewind" aria-label="Rewind"
            style={{ background: "#1f2937", border: "1px solid #1e2a3a", borderRadius: 6, padding: "8px 10px", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#e5e7eb" }}
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M7 4L3 8l4 4V4zM13 4L9 8l4 4V4z" fill="currentColor" /></svg>
          </button>
          <span style={toolLabelStyle}>Rewind</span>
        </div>

        <div style={toolItemStyle}>
          <button className="vtb-btn" onClick={() => setIsPlaying((p) => !p)} title={isPlaying ? "Pause" : "Play"} aria-label="Play/Pause"
            style={{ background: "#1f2937", border: isPlaying ? "2px solid #3b82f6" : "1px solid #1e2a3a", borderRadius: 6, padding: "8px 10px", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#e5e7eb" }}
          >
            {isPlaying
              ? <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M5 4h2v8H5zM9 4h2v8H9z" fill="currentColor" /></svg>
              : <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M5 3l8 5-8 5V3z" fill="currentColor" /></svg>}
          </button>
          <span style={toolLabelStyle}>Play</span>
        </div>

        <div style={toolItemStyle}>
          <button className="vtb-btn" onClick={() => scrollCornerstoneDicom(1)} title="Forward" aria-label="Forward"
            style={{ background: "#1f2937", border: "1px solid #1e2a3a", borderRadius: 6, padding: "8px 10px", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#e5e7eb" }}
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M9 4l4 4-4 4V4zM3 4l4 4-4 4V4z" fill="currentColor" /></svg>
          </button>
          <span style={toolLabelStyle}>Forward</span>
        </div>

        <div style={toolItemStyle}>
          <button className="vtb-btn" onClick={() => { setIsPlaying(false); scrollCornerstoneDicom(-100000); }} title="Stop" aria-label="Stop"
            style={{ background: "#1f2937", border: "1px solid #1e2a3a", borderRadius: 6, padding: "8px 10px", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#e5e7eb" }}
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="4" y="4" width="8" height="8" fill="currentColor" /></svg>
          </button>
          <span style={toolLabelStyle}>Stop</span>
        </div>
      </div>

      {saveNotice && (
        <div style={{ marginTop: 6, marginLeft: 6, fontSize: 12, color: "#93c5fd", letterSpacing: "0.02em" }}>{saveNotice}</div>
      )}
    </>
  );
}
