import React, { useEffect, useRef, useState } from "react";
import {
  PROJECTION_MODES,
  PROJECTION_MODE_OPTIONS,
  SLAB_THICKNESS_MIN_MM,
  SLAB_THICKNESS_MAX_MM,
  SLAB_THICKNESS_STEP_MM,
  isProjectionActive,
  RENDER_QUALITY_OPTIONS,
  DEFAULT_RENDER_QUALITY,
} from "../utils/projectionModes";

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
  // Cross-reference sync (scroll-sync + reference lines)
  syncEnabled,
  setSyncEnabled,
  // Linked crosshair (separate on/off from sync)
  crosshairEnabled,
  setCrosshairEnabled,
  // "line" = lines + circle; "pointer" = circle only (anatomy on click)
  crosshairMode = "line",
  setCrosshairMode,
  // Phase 2 — volume MPR + crosshairs
  layoutMode,
  setLayoutMode,
  showPlaneMenu,
  setShowPlaneMenu,
  activeDicomSlot,
  dicomSlotPlanes,
  setDicomSlotPlanes,
  dicomTool,
  activateCornerstoneDicomTool,
  rotateCornerstoneDicom,
  saveSelectedViewportAsPng,
  saveNotice,
  onMeasureActivate,
  // new
  applyWindowPreset,
  isFlipH,
  isFlipV,
  onFlipH,
  onFlipV,
  canUndo,
  onUndo,
  // Metadata overlay (patient/study/institution/exposure info) — doctors toggle on/off
  showMetadata = true,
  onToggleMetadata,
  // Slab projection (MIP / MinIP / Average) — volume MPR only.
  projectionMode = PROJECTION_MODES.NONE,
  onProjectionModeChange,
  slabThicknessMm,
  onSlabThicknessChange,
  // Single-pane volume MIP plane (layoutMode === "volMip").
  volMipPlane,
  setVolMipPlane,
  // Render quality (interpolation + sampling) for volume views.
  renderQuality = DEFAULT_RENDER_QUALITY,
  setRenderQuality,
  isVolumeLayout = false,
  mprSeriesList = [],
  onMprSeriesSelect,
}) {
  const [showMeasureMenu, setShowMeasureMenu] = useState(false);
  const [showPresetMenu, setShowPresetMenu] = useState(false);
  const [showSyncMenu, setShowSyncMenu] = useState(false);
  const [showProjectionMenu, setShowProjectionMenu] = useState(false);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [showMprMenu, setShowMprMenu] = useState(false);
  const [showPtrMenu, setShowPtrMenu] = useState(false);
  const toolbarMenusRef = useRef(null);

  const measurementTools = [
    { id: "measure", label: "Length" },
    { id: "measure-rect", label: "Rectangle ROI" },
    { id: "measure-circle", label: "Circle ROI" },
    { id: "measure-freehand", label: "Freehand ROI" },
    { id: "none", label: "Off" },
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
    if (toolId === "none") return (
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
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
    if (!showGridMenu && !showPlaneMenu && !showMeasureMenu && !showPresetMenu && !showSyncMenu && !showProjectionMenu && !showQualityMenu) return;
    const handler = (e) => {
      if (!toolbarMenusRef.current?.contains(e.target)) {
        setShowGridMenu(false); setShowPlaneMenu(false);
        setShowMeasureMenu(false); setShowPresetMenu(false); setShowSyncMenu(false);
        setShowProjectionMenu(false); setShowQualityMenu(false); setShowMprMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showGridMenu, showPlaneMenu, showMeasureMenu, showPresetMenu, showSyncMenu, showProjectionMenu, showQualityMenu, setShowGridMenu, setShowPlaneMenu]);

  const closeAllMenus = () => {
    setShowGridMenu(false); setShowPlaneMenu(false);
    setShowMeasureMenu(false); setShowPresetMenu(false); setShowSyncMenu(false);
    setShowProjectionMenu(false); setShowQualityMenu(false); setShowMprMenu(false);
  };

  const activeProjection = isProjectionActive(projectionMode);
  const activeProjectionOption =
    PROJECTION_MODE_OPTIONS.find((o) => o.id === projectionMode) || PROJECTION_MODE_OPTIONS[0];
  const activeQualityOption =
    RENDER_QUALITY_OPTIONS.find((o) => o.id === renderQuality) || RENDER_QUALITY_OPTIONS[0];

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
          position: "relative", zIndex: 1000, display: "flex", gap: 3,
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
                {[{ label: "1x1", rows: 1, cols: 1, mode: "grid" }, { label: "1x2", rows: 1, cols: 2, mode: "grid" }, { label: "2x1", rows: 2, cols: 1, mode: "grid" }, { label: "2x2", rows: 2, cols: 2, mode: "grid" }, { label: "1x3", rows: 1, cols: 3, mode: "grid" }, { label: "1L2R", rows: 3, cols: 1, mode: "1l2r" }, { label: "3x1", rows: 3, cols: 1, mode: "grid" }, { label: "3x2", rows: 3, cols: 2, mode: "grid" }].map((g) => (
                  <button key={g.label} className="vtb-btn"
                    onClick={() => {
                      if (layoutMode === "volMpr" || layoutMode === "volMip") setLayoutMode?.("mpr3");
                      setDicomGrid({ rows: g.rows, cols: g.cols, mode: g.mode });
                      setDicomGridSelected(true);
                      setShowGridMenu(false);
                    }}
                    title={g.label}
                    style={{ background: "#1f2937", color: "#e5e7eb", border: (dicomGrid.mode === g.mode && (g.mode === "1l2r" ? true : dicomGrid.rows === g.rows && dicomGrid.cols === g.cols)) ? "2px solid #3b82f6" : "1px solid #2d3748", borderRadius: 6, width: 46, height: 40, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                  >
                    <svg width="22" height="18" viewBox="0 0 22 18" fill="none" aria-hidden="true">
                      {g.mode === "1l2r" ? (
                        /* 1 large left + 2 stacked right */
                        <><rect x="1" y="1" width="10" height="16" stroke="#d1d5db" strokeWidth="1.2" /><rect x="12" y="1" width="9" height="7.5" stroke="#d1d5db" strokeWidth="1.2" /><rect x="12" y="9.5" width="9" height="7.5" stroke="#d1d5db" strokeWidth="1.2" /></>
                      ) : g.mode === "main2" ? (
                        <><rect x="1" y="1" width="12" height="16" stroke="#d1d5db" strokeWidth="1.2" /><rect x="14.5" y="1" width="6.5" height="7.5" stroke="#d1d5db" strokeWidth="1.2" /><rect x="14.5" y="9.5" width="6.5" height="7.5" stroke="#d1d5db" strokeWidth="1.2" /></>
                      ) : (
                        <><rect x="1" y="1" width="20" height="16" stroke="#d1d5db" strokeWidth="1.2" />{Array.from({ length: g.cols - 1 }).map((_, i) => { const x = 1 + ((i + 1) * 20) / g.cols; return <path key={`c${i}`} d={`M${x} 1V17`} stroke="#d1d5db" strokeWidth="1.2" />; })}{Array.from({ length: g.rows - 1 }).map((_, i) => { const y = 1 + ((i + 1) * 16) / g.rows; return <path key={`r${i}`} d={`M1 ${y}H21`} stroke="#d1d5db" strokeWidth="1.2" />; })}</>
                      )}
                    </svg>
                  </button>
                ))}
              </div>
            )}
          </div>
          <span style={toolLabelStyle}>Grid</span>
        </div>

        {/* ── Sync — plain on/off toggle for position scroll-sync.
             Pick the layout (2/3/4 cells) from the Grid button; this just
             links scrolling across the cells. Independent of Crosshair. */}
        <div style={toolItemStyle}>
          <button
            className="vtb-btn"
            onClick={() => { setSyncEnabled?.((v) => !v); }}
            title={syncEnabled ? "Scroll-sync ON — click to turn off" : "Scroll-sync OFF — click to turn on"}
            aria-label="Sync"
            style={{ background: "#1f2937", color: syncEnabled ? "#60a5fa" : "#e5e7eb", border: syncEnabled ? "2px solid #3b82f6" : "1px solid #1e2a3a", borderRadius: 6, padding: "8px 10px", display: "flex", alignItems: "center" }}
          >
            {/* link / sync icon */}
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M6.5 9.5l3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <path d="M9 4.5l1-1a2.5 2.5 0 0 1 3.5 3.5l-1 1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <path d="M7 11.5l-1 1A2.5 2.5 0 0 1 2.5 9l1-1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
          <span style={{ ...toolLabelStyle, color: syncEnabled ? "#60a5fa" : "#8b97ac" }}>Sync</span>
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
                {["axial", "coronal", "sagittal"].map((p) => {
                  const isVolMip = layoutMode === "volMip";
                  const activePlane = isVolMip ? volMipPlane : dicomSlotPlanes[activeDicomSlot];
                  return (
                  <button key={p} className="vtb-btn"
                    onClick={() => {
                      if (isVolMip) {
                        setVolMipPlane?.(p);
                      } else {
                        setDicomSlotPlanes((prev) => { const next = [...prev]; const slot = activeDicomSlot; const other = next.findIndex((x) => x === p); if (other >= 0) { const t = next[slot]; next[slot] = p; next[other] = t; } else { next[slot] = p; } return next; });
                      }
                      setShowPlaneMenu(false);
                    }}
                    style={{ width: "100%", textAlign: "left", background: activePlane === p ? "#1e2e44" : "transparent", color: "#e5e7eb", border: "none", padding: "7px 10px", fontSize: 12, borderRadius: 4 }}
                  >{p[0].toUpperCase() + p.slice(1)}</button>
                  );
                })}
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
                    onClick={() => { applyWindowPreset?.(p); setShowPresetMenu(false); }}
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
            onClick={() => { activateCornerstoneDicomTool(dicomTool === "zoom" ? "none" : "zoom"); }}
            title="Zoom (scroll)" aria-label="Zoom"
            style={{ background: "#1f2937", color: "#e5e7eb", border: dicomTool === "zoom" ? "2px solid #3b82f6" : "1px solid #1e2a3a", borderRadius: 6, padding: "8px 10px", display: "flex", alignItems: "center", gap: 6 }}
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
          {/* ── 3D Pointer split-button ───────────────────────────────────
               Left  → toggle the crosshair ON / OFF
               Right → chevron opens Line | Pointer mode picker        */}
          <div style={{ position: "relative", display: "flex" }}>
            {/* Main toggle */}
            <button className="vtb-btn"
              onClick={() => {
                // Turning it ON always lands in Line mode — a leftover
                // Pointer/Sync+Pointer mode from a previous session shouldn't
                // silently persist onto a fresh activation. The chevron
                // dropdown remains the way to explicitly pick another mode.
                if (!crosshairEnabled) setCrosshairMode?.("line");
                setCrosshairEnabled?.((v) => !v);
                setShowPtrMenu(false);
              }}
              title={crosshairEnabled ? "3D Pointer ON — click to turn off" : "3D Pointer OFF — click to turn on"}
              aria-label="3D Pointer"
              style={{
                background: "#1f2937",
                color: crosshairEnabled ? "#60a5fa" : "#e5e7eb",
                border: crosshairEnabled ? "2px solid #3b82f6" : "1px solid #1e2a3a",
                borderRight: "none",
                borderRadius: "6px 0 0 6px",
                padding: "8px 10px",
                display: "flex", alignItems: "center",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.2" />
                <path d="M8 2.5v3M8 10.5v3M2.5 8h3M10.5 8h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                <circle cx="8" cy="8" r="1.1" fill="currentColor" />
              </svg>
            </button>

            {/* Chevron — opens mode dropdown */}
            <button className="vtb-btn"
              onClick={() => setShowPtrMenu((v) => !v)}
              aria-label="3D Pointer mode"
              title="Switch between Line and Pointer mode"
              style={{
                background: "#1f2937",
                color: crosshairEnabled ? "#60a5fa" : "#6b7280",
                border: crosshairEnabled ? "2px solid #3b82f6" : "1px solid #1e2a3a",
                borderLeft: "1px solid #374151",
                borderRadius: "0 6px 6px 0",
                padding: "8px 5px",
                display: "flex", alignItems: "center",
              }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {/* Dropdown menu */}
            {showPtrMenu && (
              <div
                onMouseLeave={() => setShowPtrMenu(false)}
                style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  left: 0,
                  zIndex: 200,
                  background: "#1e293b",
                  border: "1px solid #334155",
                  borderRadius: 8,
                  padding: "4px 0",
                  minWidth: 148,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                }}
              >
                {[
                  { key: "line",        label: "Line",          desc: "Lines + circle" },
                  { key: "pointer",     label: "Pointer",       desc: "Circle only · label on click" },
                  { key: "syncPointer", label: "Sync + Pointer", desc: "Scroll sync · circle · no ref lines" },
                  { key: "off",         label: "Off",           desc: "Disable 3D Pointer" },
                ].map(({ key, label, desc }) => (
                  <button key={key}
                    onClick={() => {
                      if (key === "off") {
                        setCrosshairEnabled?.(false);
                      } else {
                        setCrosshairMode?.(key);
                        if (!crosshairEnabled) setCrosshairEnabled?.(true);
                        if (key === "syncPointer") setSyncEnabled?.(true);
                      }
                      setShowPtrMenu(false);
                    }}
                    style={{
                      width: "100%", border: "none",
                      padding: "8px 14px", cursor: "pointer", textAlign: "left",
                      display: "flex", flexDirection: "column", gap: 1,
                      borderLeft: (key === "off" ? !crosshairEnabled : crosshairMode === key && crosshairEnabled)
                        ? "2px solid #3b82f6" : "2px solid transparent",
                      background: (key === "off" ? !crosshairEnabled : crosshairMode === key && crosshairEnabled)
                        ? "rgba(59,130,246,0.08)" : "none",
                    }}
                  >
                    <span style={{
                      color: (key === "off" ? !crosshairEnabled : crosshairMode === key && crosshairEnabled)
                        ? "#60a5fa" : "#e5e7eb",
                      fontSize: 13, fontWeight: 500
                    }}>
                      {label}
                    </span>
                    <span style={{ color: "#6b7280", fontSize: 11 }}>{desc}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <span style={{ ...toolLabelStyle, color: crosshairEnabled ? "#60a5fa" : "#8b97ac" }}>
            3D Pointer{crosshairEnabled ? ` · ${crosshairMode === "pointer" ? "ptr" : crosshairMode === "syncPointer" ? "sync+ptr" : "line"}` : ""}
          </span>
        </div>

        {/* ── MPR — IDV-style dropdown: best series first, scrollable, Off at bottom ── */}
        <div style={toolItemStyle}>
          <div style={{ position: "relative" }}>
            <button className="vtb-btn"
              onClick={() => { const n = !showMprMenu; closeAllMenus(); if (n) setShowMprMenu(true); }}
              title={layoutMode === "volMpr" ? "MPR ON — click for options" : "MPR — select series for 3-plane view"}
              aria-label="MPR"
              style={{
                background: "#1f2937",
                color: layoutMode === "volMpr" ? "#60a5fa" : "#e5e7eb",
                border: layoutMode === "volMpr" ? "2px solid #3b82f6" : "1px solid #1e2a3a",
                borderRadius: 6, padding: "8px 10px",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 4, minWidth: 38,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <rect x="1" y="1" width="7" height="16" rx="1" stroke="currentColor" strokeWidth="1.2" />
                <rect x="10" y="1" width="7" height="7.5" rx="1" stroke="currentColor" strokeWidth="1.2" />
                <rect x="10" y="9.5" width="7" height="7.5" rx="1" stroke="currentColor" strokeWidth="1.2" />
              </svg>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                <path d="M2 3l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {showMprMenu && (
              <div style={{
                position: "absolute", top: 42, left: "50%", transform: "translateX(-50%)",
                background: "#0f1824", border: "1px solid #1e2d40", borderRadius: 10,
                padding: "4px 0", minWidth: 240, zIndex: 300,
                boxShadow: "0 10px 32px rgba(0,0,0,0.8)",
              }}>
                {/* header */}
                <div style={{
                  padding: "6px 12px 6px", fontSize: 10, color: "#4b6080",
                  textTransform: "uppercase", letterSpacing: "0.08em",
                  borderBottom: "1px solid #1a2535", marginBottom: 2,
                  display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
                }}>
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                    <rect x="0.5" y="0.5" width="4.5" height="11" rx="0.8" stroke="currentColor" strokeWidth="1" />
                    <rect x="6.5" y="0.5" width="5" height="5" rx="0.8" stroke="currentColor" strokeWidth="1" />
                    <rect x="6.5" y="6.5" width="5" height="5" rx="0.8" stroke="currentColor" strokeWidth="1" />
                  </svg>
                  Multiplanar Reconstruction
                </div>

                {/* series list — scrollable, sorted best (most slices) first */}
                <div style={{ maxHeight: 240, overflowY: "auto", overflowX: "hidden" }}>
                  {mprSeriesList.length === 0 && (
                    <div style={{ padding: "10px 14px", color: "#4b6080", fontSize: 12 }}>No multi-slice series found</div>
                  )}
                  {mprSeriesList.map((s, i) => {
                    const isTop = i === 0;
                    return (
                      <button key={s.seriesUid} className="vtb-btn"
                        onClick={() => { onMprSeriesSelect?.(s.seriesUid); setShowMprMenu(false); }}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          width: "100%", padding: "7px 14px",
                          background: "transparent", border: "none",
                          color: "#dde4ef", fontSize: 12, cursor: "pointer", gap: 8,
                          borderLeft: isTop ? "2px solid #3b82f6" : "2px solid transparent",
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = "#141f30"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                      >
                        <span style={{ display: "flex", alignItems: "center", gap: 7, overflow: "hidden", flex: 1, minWidth: 0 }}>
                          {isTop && (
                            <svg width="9" height="9" viewBox="0 0 9 9" fill="none" style={{ flexShrink: 0 }}>
                              <circle cx="4.5" cy="4.5" r="3.5" fill="#3b82f6" opacity="0.8" />
                            </svg>
                          )}
                          <span style={{ color: "#4b6a8a", fontSize: 10, minWidth: 24, flexShrink: 0 }}>SE{s.seriesNumber}</span>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {s.seriesDescription || `Series ${s.seriesNumber}`}
                          </span>
                        </span>
                        <span style={{
                          color: "#3b6ea0", fontSize: 10, whiteSpace: "nowrap", flexShrink: 0,
                          background: "#0f1d2e", border: "1px solid #1e3a5a", borderRadius: 4,
                          padding: "1px 5px",
                        }}>
                          {s.mprScore} sl
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Off / exit */}
                <div style={{ borderTop: "1px solid #1a2535", margin: "3px 0 2px" }} />
                <button className="vtb-btn"
                  onClick={() => {
                    setLayoutMode?.("mpr3");
                    setDicomGrid?.({ rows: 1, cols: 1, mode: "grid" });
                    setShowMprMenu(false);
                  }}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    width: "100%", padding: "7px 14px",
                    background: "transparent", border: "none",
                    color: layoutMode === "volMpr" ? "#f87171" : "#4b6080",
                    fontSize: 12, cursor: "pointer",
                    borderLeft: layoutMode !== "volMpr" ? "2px solid #10b981" : "2px solid transparent",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "#141f30"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  {layoutMode === "volMpr" ? (
                    <>
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                        <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      </svg>
                      Exit MPR
                    </>
                  ) : (
                    <>
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                        <circle cx="6" cy="6" r="4.5" stroke="#10b981" strokeWidth="1.4" />
                        <path d="M4 6h4M6 4v4" stroke="#10b981" strokeWidth="1.2" strokeLinecap="round" />
                      </svg>
                      <span style={{ color: "#10b981" }}>Off</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
          <span style={{ ...toolLabelStyle, color: layoutMode === "volMpr" ? "#60a5fa" : "#8b97ac" }}>MPR</span>
        </div>

        {/* ── Slab projection: MIP / MinIP / Average ───────────
             Volume-only. Picking a mode here flips the layout to volume MPR
             (handled by onProjectionModeChange). The slab-thickness slider
             appears inline when a projection is active and recomputes live. */}
        <div style={toolItemStyle}>
          <div style={{ position: "relative" }}>
            <button
              className="vtb-btn"
              onClick={() => { const n = !showProjectionMenu; closeAllMenus(); if (n) setShowProjectionMenu(true); }}
              title={activeProjection ? `${activeProjectionOption.label} — ${activeProjectionOption.desc}` : "MIP / MinIP / Average (slab projection)"}
              aria-label="Slab projection mode"
              style={{ background: "#1f2937", color: activeProjection ? "#34d399" : "#e5e7eb", border: activeProjection ? "2px solid #10b981" : "1px solid #1e2a3a", borderRadius: 6, padding: "8px 10px", display: "flex", alignItems: "center", gap: 6 }}
            >
              {/* stacked-slabs glyph */}
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M2 5l6-3 6 3-6 3-6-3z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                <path d="M2 8l6 3 6-3" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" opacity="0.7" />
                <path d="M2 11l6 3 6-3" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" opacity="0.45" />
              </svg>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 3l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {showProjectionMenu && (
              <div style={{ position: "absolute", top: 38, left: 0, background: "#131c2b", border: "1px solid #2d3748", borderRadius: 8, padding: 4, minWidth: 200, zIndex: 200, boxShadow: "0 8px 28px rgba(0,0,0,0.7)" }}>
                {PROJECTION_MODE_OPTIONS.map((opt) => (
                  <button key={opt.id} className="vtb-btn"
                    onClick={() => { onProjectionModeChange?.(opt.id); setShowProjectionMenu(false); }}
                    title={opt.desc}
                    style={{ width: "100%", textAlign: "left", background: projectionMode === opt.id ? "#10362b" : "transparent", color: "#e5e7eb", border: "none", padding: "7px 10px", fontSize: 12, borderRadius: 4, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}
                  >
                    <span style={{ color: projectionMode === opt.id ? "#34d399" : "#e5e7eb", fontWeight: projectionMode === opt.id ? 600 : 400 }}>{opt.label}</span>
                    <span style={{ color: "#64748b", fontSize: 10.5 }}>{opt.desc}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <span style={{ ...toolLabelStyle, color: activeProjection ? "#34d399" : "#8b97ac" }}>
            {activeProjection ? activeProjectionOption.short : "Project"}
          </span>
        </div>

        {/* Slab thickness — only meaningful while a projection is active. */}
        {activeProjection && (
          <div style={{ ...toolItemStyle, minWidth: 132 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "4px 6px", background: "#16202f", border: "1px solid #1e2a3a", borderRadius: 6, width: 120 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 10, color: "#8b97ac", letterSpacing: "0.03em" }}>Slab</span>
                <span style={{ fontSize: 11, color: "#34d399", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontWeight: 600 }}>
                  {Math.round(Number(slabThicknessMm) || 0)} mm
                </span>
              </div>
              <input
                type="range"
                min={SLAB_THICKNESS_MIN_MM}
                max={SLAB_THICKNESS_MAX_MM}
                step={SLAB_THICKNESS_STEP_MM}
                value={Number(slabThicknessMm) || SLAB_THICKNESS_MIN_MM}
                onChange={(e) => onSlabThicknessChange?.(Number(e.target.value))}
                title={`Slab thickness ${SLAB_THICKNESS_MIN_MM}–${SLAB_THICKNESS_MAX_MM} mm`}
                aria-label="Slab thickness (mm)"
                style={{ width: "100%", accentColor: "#10b981", cursor: "pointer", height: 4 }}
              />
            </div>
            <span style={toolLabelStyle}>Thickness</span>
          </div>
        )}

        {/* Render quality — interpolation + sampling density (volume views only). */}
        {isVolumeLayout && (
          <div style={toolItemStyle}>
            <div style={{ position: "relative" }}>
              <button
                className="vtb-btn"
                onClick={() => { const n = !showQualityMenu; closeAllMenus(); if (n) setShowQualityMenu(true); }}
                title={`Render quality — ${activeQualityOption.desc}`}
                aria-label="Render quality"
                style={{ background: "#1f2937", color: "#e5e7eb", border: "1px solid #1e2a3a", borderRadius: 6, padding: "8px 10px", display: "flex", alignItems: "center", gap: 6 }}
              >
                <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M8 1.5l1.8 3.8 4.2.6-3 3 .7 4.1L8 11.7 4.3 13l.7-4.1-3-3 4.2-.6L8 1.5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
                </svg>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 3l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {showQualityMenu && (
                <div style={{ position: "absolute", top: 38, left: 0, background: "#131c2b", border: "1px solid #2d3748", borderRadius: 8, padding: 4, minWidth: 220, zIndex: 200, boxShadow: "0 8px 28px rgba(0,0,0,0.7)" }}>
                  {RENDER_QUALITY_OPTIONS.map((opt) => (
                    <button key={opt.id} className="vtb-btn"
                      onClick={() => { setRenderQuality?.(opt.id); setShowQualityMenu(false); }}
                      title={opt.desc}
                      style={{ width: "100%", textAlign: "left", background: renderQuality === opt.id ? "#1e2e44" : "transparent", color: "#e5e7eb", border: "none", padding: "7px 10px", fontSize: 12, borderRadius: 4, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}
                    >
                      <span style={{ fontWeight: renderQuality === opt.id ? 600 : 400 }}>{opt.label}</span>
                      <span style={{ color: "#64748b", fontSize: 10.5 }}>{opt.desc}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <span style={toolLabelStyle}>{activeQualityOption.label}</span>
          </div>
        )}

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
              <div style={{ position: "absolute", top: 38, left: 0, background: "#131c2b", border: "1px solid #2d3748", borderRadius: 8, padding: 6, display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 5, zIndex: 200, boxShadow: "0 8px 28px rgba(0,0,0,0.7)" }}>
                {measurementTools.map((tool) => (
                  <button key={tool.id} className="vtb-btn"
                    onClick={() => {
                      if (tool.id === "none") {
                        activateCornerstoneDicomTool("none");
                      } else {
                        const next = dicomTool === tool.id ? "none" : tool.id;
                        if (next !== "none") onMeasureActivate?.();
                        activateCornerstoneDicomTool(next);
                      }
                      setShowMeasureMenu(false);
                    }}
                    style={{ width: 34, height: 34, background: dicomTool === tool.id ? "#1e3a5f" : "#1f2937", color: "#e5e7eb", border: dicomTool === tool.id ? "1px solid #3b82f6" : "1px solid #2d3748", padding: 0, borderRadius: 6, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                    title={tool.label} aria-label={tool.label}
                  >{renderMeasureToolIcon(tool.id)}</button>
                ))}
              </div>
            )}
          </div>
          <span style={toolLabelStyle}>Measure</span>
        </div>

        {/* ── Undo — reverts the last preset / flip / rotate / measurement ── */}
        <div style={toolItemStyle}>
          <button className="vtb-btn"
            onClick={() => onUndo?.()}
            disabled={!canUndo}
            title="Undo last change" aria-label="Undo"
            style={{ background: "#1f2937", color: canUndo ? "#e5e7eb" : "#4b5563", border: "1px solid #1e2a3a", borderRadius: 6, padding: "8px 10px", display: "flex", alignItems: "center", cursor: canUndo ? "pointer" : "not-allowed", opacity: canUndo ? 1 : 0.5 }}
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M6 3L2.5 6.5 6 10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M2.5 6.5H9a3.5 3.5 0 0 1 0 7H6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <span style={toolLabelStyle}>Undo</span>
        </div>

        <div className="vtb-sep" />

        {/* ── Metadata overlay — show/hide patient, study, institution & exposure info ── */}
        <div style={toolItemStyle}>
          <button className="vtb-btn"
            onClick={() => onToggleMetadata?.()}
            title={showMetadata ? "Hide metadata overlay" : "Show metadata overlay"}
            aria-label="Toggle metadata overlay" aria-pressed={showMetadata}
            style={{ background: "#1f2937", color: "#e5e7eb", border: showMetadata ? "2px solid #3b82f6" : "1px solid #1e2a3a", borderRadius: 6, padding: "8px 10px", display: "flex", alignItems: "center" }}
          >
            {showMetadata ? (
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M1 8s2.5-4.5 7-4.5S15 8 15 8s-2.5 4.5-7 4.5S1 8 1 8Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M1 8s2.5-4.5 7-4.5S15 8 15 8s-2.5 4.5-7 4.5S1 8 1 8Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" />
                <path d="M2 2l12 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            )}
          </button>
          <span style={toolLabelStyle}>{showMetadata ? "Hide Info" : "Show Info"}</span>
        </div>

      </div>

      {saveNotice && (
        <div style={{ marginTop: 6, marginLeft: 6, fontSize: 12, color: "#93c5fd", letterSpacing: "0.02em" }}>{saveNotice}</div>
      )}
    </>
  );
}
