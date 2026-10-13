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
} from "../utils/niftiProjectionModes";

export default function NiftiToolbar({
  showGridMenu,
  setShowGridMenu,
  niftiGridSelected,
  niftiGrid,
  setNiftiGrid,
  setNiftiGridSelected,
  showPlaneMenu,
  setShowPlaneMenu,
  isCornerstoneNifti,
  setNiftiSlotPlanes,
  activeNiftiSlot,
  niftiSlotPlanes,
  niftiPlane,
  setNiftiPlane,
  setNzIndex,
  setNxIndex,
  setNyIndex,
  showColormapMenu,
  setShowColormapMenu,
  isNifti,
  niftiSlotColormap,
  applyNiftiColormapToSlot,
  colormapPresets,
  niftiZoomMode,
  setNiftiZoomMode,
  activateCornerstoneNiftiTool,
  niftiTool,
  setNiftiTool,
  saveSelectedViewportAsPng,
  rotateCornerstoneNifti,
  setNiftiRotation,
  saveNotice,
  onMeasureActivate,
  applyWindowPreset,
  isFlipH,
  isFlipV,
  onFlipH,
  onFlipV,
  niftiSyncEnabled,
  setNiftiSyncEnabled,
  // 3D Pointer crosshair
  niftiCrosshairEnabled,
  setNiftiCrosshairEnabled,
  niftiCrosshairMode,
  setNiftiCrosshairMode,
  // MPR (triplanar toggle)
  niftiMprActive,
  onNiftiMprToggle,
  // MIP / MinIP / Average projection
  niftiProjectionMode,
  onNiftiProjectionModeChange,
  niftiSlabThicknessMm,
  onNiftiSlabThicknessChange,
  renderQuality = DEFAULT_RENDER_QUALITY,
}) {
  const [showMeasureMenu, setShowMeasureMenu] = useState(false);
  const [showPresetMenu, setShowPresetMenu] = useState(false);
  const [showProjectionMenu, setShowProjectionMenu] = useState(false);
  const [showPtrMenu, setShowPtrMenu] = useState(false);
  const [showMprMenu, setShowMprMenu] = useState(false);
  const toolbarMenusRef = useRef(null);

  const activeProjection = isProjectionActive(niftiProjectionMode);
  const activeProjectionOption =
    PROJECTION_MODE_OPTIONS.find((o) => o.id === niftiProjectionMode) || PROJECTION_MODE_OPTIONS[0];

  const CT_PRESETS = [
    { label: "Brain",       width: 80,   center: 40  },
    { label: "Bone",        width: 1500, center: 300 },
    { label: "Lung",        width: 1500, center: -600},
    { label: "Soft Tissue", width: 400,  center: 40  },
    { label: "Abdomen",     width: 350,  center: 40  },
    { label: "Mediastinum", width: 350,  center: 50  },
  ];

  const measurementTools = [
    { id: "measure", label: "Length" },
    { id: "measure-rect", label: "Rectangle ROI" },
    { id: "measure-circle", label: "Circle ROI" },
    { id: "measure-freehand", label: "Freehand ROI" },
    { id: "none", label: "Off" },
  ];
  const isMeasureToolActive = typeof niftiTool === "string" && niftiTool.startsWith("measure");
  const activeMeasureTool = measurementTools.find((t) => t.id === niftiTool) || measurementTools[0];

  const renderMeasureToolIcon = (toolId) => {
    if (toolId === "none") {
      return (
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    }
    if (toolId === "measure-rect") {
      return (
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="3" y="3" width="10" height="10" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    }
    if (toolId === "measure-circle") {
      return (
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    }
    if (toolId === "measure-freehand") {
      return (
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M2.5 9.5c1.1-2 2.1-3 3.4-3 1.1 0 1.6 1.1 2.5 1.1 1 0 1.2-2.1 2.6-2.1 1.2 0 1.8 1 2.5 2.5.6 1.1.3 3.5-1.6 3.5H5.2c-1.8 0-3.4-.8-2.7-2z"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    }
    return (
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M3 13l10-10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  };

  const closeAllMenus = () => {
    setShowGridMenu(false); setShowPlaneMenu(false); setShowColormapMenu(false);
    setShowMeasureMenu(false); setShowPresetMenu(false); setShowProjectionMenu(false);
    setShowPtrMenu(false); setShowMprMenu(false);
  };

  useEffect(() => {
    if (!showGridMenu && !showPlaneMenu && !showColormapMenu && !showMeasureMenu && !showPresetMenu && !showProjectionMenu) return;
    const onDocPointerDown = (evt) => {
      if (!toolbarMenusRef.current?.contains(evt.target)) closeAllMenus();
    };
    document.addEventListener("mousedown", onDocPointerDown);
    return () => document.removeEventListener("mousedown", onDocPointerDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showGridMenu, showPlaneMenu, showColormapMenu, showMeasureMenu, showPresetMenu, showProjectionMenu]);

  const toolItemStyle = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 5,
    minWidth: 48,
    flex: "0 0 auto",
  };
  const toolLabelStyle = {
    fontSize: 11,
    color: "#8b97ac",
    lineHeight: 1,
    userSelect: "none",
    whiteSpace: "nowrap",
    letterSpacing: "0.04em",
    fontWeight: 500,
  };

  return (
    <>
      <style>{`
        .vtb-btn {
          cursor: pointer;
          transition: background 0.13s ease, box-shadow 0.13s ease, transform 0.08s ease;
          outline: none;
          font-family: inherit;
        }
        .vtb-btn:hover:not(:disabled) {
          background: #253047 !important;
          box-shadow: 0 0 0 1px rgba(255,255,255,0.07) !important;
        }
        .vtb-btn:active:not(:disabled) {
          transform: scale(0.91);
        }
        .vtb-btn:focus-visible {
          outline: 2px solid #3b82f6;
          outline-offset: 2px;
        }
        .vtb-sep {
          width: 1px;
          align-self: stretch;
          flex-shrink: 0;
          margin: 3px 6px;
          background: linear-gradient(to bottom, transparent, #2d3748 28%, #2d3748 72%, transparent);
          border-radius: 1px;
        }
      `}</style>

      <div
        ref={toolbarMenusRef}
        style={{
          position: "relative",
          zIndex: 1000,
          display: "flex",
          gap: 3,
          alignItems: "flex-start",
          flexWrap: "wrap",
          padding: "8px 12px 6px",
          background: "linear-gradient(180deg, #0e1520 0%, #0b0f16 100%)",
          border: "1px solid #1e2a3a",
          borderRadius: 10,
          boxShadow: "0 2px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.03)",
        }}
      >
        {/* ── Layout ─────────────────────────────────────────── */}
        <div style={toolItemStyle}>
          <div style={{ position: "relative" }}>
            <button
              className="vtb-btn"
              onClick={() => {
                const next = !showGridMenu;
                setShowGridMenu(next);
                if (next) { setShowPlaneMenu(false); setShowColormapMenu(false); setShowMeasureMenu(false); setShowPresetMenu(false); }
              }}
              title="Grid" aria-label="Grid"
              style={{
                background: "#1f2937", color: "#e5e7eb",
                border: niftiGridSelected ? "2px solid #3b82f6" : "1px solid #1e2a3a",
                borderRadius: 6, padding: "8px 10px",
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 3l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {showGridMenu && (
              <div style={{
                position: "absolute", top: 38, left: 0,
                background: "#131c2b", border: "1px solid #2d3748",
                borderRadius: 8, padding: 8,
                display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8,
                minWidth: 248, zIndex: 200,
                boxShadow: "0 8px 28px rgba(0,0,0,0.7)",
              }}>
                {[
                  { label: "Main+2", rows: 2, cols: 2, mode: "main2" },
                  { label: "1x1", rows: 1, cols: 1, mode: "grid" },
                  { label: "1x2", rows: 1, cols: 2, mode: "grid" },
                  { label: "2x1", rows: 2, cols: 1, mode: "grid" },
                  { label: "2x2", rows: 2, cols: 2, mode: "grid" },
                  { label: "3x1", rows: 3, cols: 1, mode: "grid" },
                  { label: "3x2", rows: 3, cols: 2, mode: "grid" },
                ].map((g) => (
                  <button
                    key={g.label}
                    className="vtb-btn"
                    onClick={() => { setNiftiGrid({ rows: g.rows, cols: g.cols, mode: g.mode }); setNiftiGridSelected(true); setShowGridMenu(false); }}
                    title={g.label}
                    style={{
                      background: "#1f2937", color: "#e5e7eb",
                      border: (niftiGrid.rows === g.rows && niftiGrid.cols === g.cols && niftiGrid.mode === g.mode) ? "2px solid #3b82f6" : "1px solid #2d3748",
                      borderRadius: 6, width: 46, height: 40, padding: 0,
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    <svg width="22" height="18" viewBox="0 0 22 18" fill="none" aria-hidden="true">
                      {g.mode === "main2" ? (
                        <>
                          <rect x="1" y="1" width="12" height="16" stroke="#d1d5db" strokeWidth="1.2" />
                          <rect x="14.5" y="1" width="6.5" height="7.5" stroke="#d1d5db" strokeWidth="1.2" />
                          <rect x="14.5" y="9.5" width="6.5" height="7.5" stroke="#d1d5db" strokeWidth="1.2" />
                        </>
                      ) : (
                        <>
                          <rect x="1" y="1" width="20" height="16" stroke="#d1d5db" strokeWidth="1.2" />
                          {Array.from({ length: g.cols - 1 }).map((_, i) => {
                            const x = 1 + ((i + 1) * 20) / g.cols;
                            return <path key={`c-${g.label}-${i}`} d={`M${x} 1V17`} stroke="#d1d5db" strokeWidth="1.2" />;
                          })}
                          {Array.from({ length: g.rows - 1 }).map((_, i) => {
                            const y = 1 + ((i + 1) * 16) / g.rows;
                            return <path key={`r-${g.label}-${i}`} d={`M1 ${y}H21`} stroke="#d1d5db" strokeWidth="1.2" />;
                          })}
                        </>
                      )}
                    </svg>
                  </button>
                ))}
              </div>
            )}
          </div>
          <span style={toolLabelStyle}>Grid</span>
        </div>

        {/* ── Sync ────────────────────────────────────────────── */}
        <div style={toolItemStyle}>
          <button
            className="vtb-btn"
            onClick={() => setNiftiSyncEnabled?.((v) => !v)}
            title={niftiSyncEnabled ? "Scroll-sync ON — click to turn off" : "Scroll-sync OFF — click to turn on"}
            aria-label="Sync"
            style={{
              background: "#1f2937",
              color: niftiSyncEnabled ? "#60a5fa" : "#e5e7eb",
              border: niftiSyncEnabled ? "2px solid #3b82f6" : "1px solid #1e2a3a",
              borderRadius: 6, padding: "8px 10px",
              display: "flex", alignItems: "center",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M6.5 9.5l3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <path d="M9 4.5l1-1a2.5 2.5 0 0 1 3.5 3.5l-1 1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <path d="M7 11.5l-1 1A2.5 2.5 0 0 1 2.5 9l1-1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
          <span style={{ ...toolLabelStyle, color: niftiSyncEnabled ? "#60a5fa" : "#8b97ac" }}>Sync</span>
        </div>

        <div style={toolItemStyle}>
          <div style={{ position: "relative" }}>
            <button
              className="vtb-btn"
              onClick={() => {
                if (!niftiGridSelected) return;
                const next = !showPlaneMenu;
                setShowPlaneMenu(next);
                if (next) { setShowGridMenu(false); setShowColormapMenu(false); setShowMeasureMenu(false); setShowPresetMenu(false); }
              }}
              title="Plane" aria-label="Plane"
              style={{
                background: "#1f2937",
                color: niftiGridSelected ? "#e5e7eb" : "#6b7280",
                border: "1px solid #1e2a3a",
                borderRadius: 6, padding: "8px 10px",
                display: "flex", alignItems: "center", gap: 6,
                cursor: niftiGridSelected ? "pointer" : "not-allowed",
              }}
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
              <div style={{
                position: "absolute", top: 38, left: 0,
                background: "#131c2b", border: "1px solid #2d3748",
                borderRadius: 8, padding: 4, minWidth: 130,
                zIndex: 200, boxShadow: "0 8px 28px rgba(0,0,0,0.7)",
              }}>
                {["axial", "coronal", "sagittal"].map((p) => (
                  <button
                    key={p}
                    className="vtb-btn"
                    onClick={() => {
                      if (isCornerstoneNifti) {
                        setNiftiSlotPlanes((prev) => {
                          const next = [...prev];
                          const slot = activeNiftiSlot;
                          const other = next.findIndex((x) => x === p);
                          if (other >= 0) { const t = next[slot]; next[slot] = p; next[other] = t; } else { next[slot] = p; }
                          return next;
                        });
                        setShowPlaneMenu(false);
                        return;
                      }
                      setNiftiPlane(p);
                      if (p === "axial") setNzIndex(0);
                      if (p === "sagittal") setNxIndex(0);
                      if (p === "coronal") setNyIndex(0);
                      setShowPlaneMenu(false);
                    }}
                    style={{
                      width: "100%", textAlign: "left",
                      background: (isCornerstoneNifti ? niftiSlotPlanes[activeNiftiSlot] === p : niftiPlane === p) ? "#1e2e44" : "transparent",
                      color: "#e5e7eb", border: "none",
                      padding: "7px 10px", fontSize: 12, borderRadius: 4,
                    }}
                  >
                    {p[0].toUpperCase() + p.slice(1)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <span style={toolLabelStyle}>Plane</span>
        </div>

        <div style={toolItemStyle}>
          <div style={{ position: "relative" }}>
            <button
              className="vtb-btn"
              onClick={() => {
                const next = !showColormapMenu;
                setShowColormapMenu(next);
                if (next) { setShowGridMenu(false); setShowPlaneMenu(false); setShowMeasureMenu(false); setShowPresetMenu(false); }
              }}
              disabled={!isNifti} title="Colormap" aria-label="Colormap"
              style={{
                background: "#1f2937",
                color: isNifti ? "#e5e7eb" : "#6b7280",
                border: "1px solid #1e2a3a",
                borderRadius: 6, padding: "8px 10px",
                display: "flex", alignItems: "center", gap: 6,
                cursor: isNifti ? "pointer" : "not-allowed",
              }}
            >
              <span style={{
                width: 18, height: 18, borderRadius: 4,
                border: "1px solid #374151",
                background: (colormapPresets.find((p) => p.label === (niftiSlotColormap[activeNiftiSlot] || "BW")) || colormapPresets[1]).swatch,
                display: "inline-block", flexShrink: 0,
              }} />
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 3l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {showColormapMenu && (
              <div style={{
                position: "absolute", top: 38, left: 0,
                background: "#131c2b", border: "1px solid #2d3748",
                borderRadius: 8, padding: 4,
                minWidth: 230, maxHeight: 380, overflowY: "auto",
                zIndex: 200, boxShadow: "0 8px 28px rgba(0,0,0,0.7)",
                scrollbarWidth: "thin", scrollbarColor: "#374151 transparent",
              }}>
                {colormapPresets.map((m) => (
                  <button
                    key={m.label}
                    className="vtb-btn"
                    onClick={() => { applyNiftiColormapToSlot(activeNiftiSlot, m.label); setShowColormapMenu(false); }}
                    style={{
                      width: "100%", display: "grid", gridTemplateColumns: "74px 1fr",
                      alignItems: "center", gap: 8, textAlign: "left",
                      background: (niftiSlotColormap[activeNiftiSlot] || "BW") === m.label ? "#1e2e44" : "transparent",
                      color: "#e5e7eb", border: "none",
                      padding: "6px 8px", fontSize: 13, borderRadius: 4,
                    }}
                  >
                    <span style={{ height: 12, border: "1px solid #374151", background: m.swatch, borderRadius: 2 }} />
                    <span>{m.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <span style={toolLabelStyle}>Colormap</span>
        </div>

        <div className="vtb-sep" />

        {/* ── CT Window Presets ───────────────────────────────── */}
        <div style={toolItemStyle}>
          <div style={{ position: "relative" }}>
            <button
              className="vtb-btn"
              onClick={() => {
                const next = !showPresetMenu;
                setShowPresetMenu(next);
                if (next) { setShowGridMenu(false); setShowPlaneMenu(false); setShowColormapMenu(false); setShowMeasureMenu(false); }
              }}
              disabled={!isNifti} title="CT Window Presets" aria-label="CT Window Presets"
              style={{
                background: "#1f2937",
                color: isNifti ? "#e5e7eb" : "#6b7280",
                border: "1px solid #1e2a3a",
                borderRadius: 6, padding: "8px 10px",
                display: "flex", alignItems: "center", gap: 6,
                cursor: isNifti ? "pointer" : "not-allowed",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <rect x="1.5" y="3" width="13" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                <path d="M4 8h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <path d="M4 5.5h3M9 5.5h3M4 10.5h5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.6" />
              </svg>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 3l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {showPresetMenu && isNifti && (
              <div style={{
                position: "absolute", top: 38, left: 0,
                background: "#131c2b", border: "1px solid #2d3748",
                borderRadius: 8, padding: 4, minWidth: 188,
                zIndex: 200, boxShadow: "0 8px 28px rgba(0,0,0,0.7)",
              }}>
                {CT_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    className="vtb-btn"
                    onClick={() => { applyWindowPreset(p); setShowPresetMenu(false); }}
                    style={{
                      width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
                      background: "transparent", color: "#e5e7eb", border: "none",
                      padding: "7px 10px", fontSize: 12, borderRadius: 4,
                    }}
                  >
                    <span style={{ fontWeight: 500 }}>{p.label}</span>
                    <span style={{
                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                      fontSize: 10, color: "#6b7280", letterSpacing: "0.04em",
                    }}>
                      W:{p.width} L:{p.center}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <span style={toolLabelStyle}>Presets</span>
        </div>

        <div className="vtb-sep" />

        {/* ── Interaction Tools ───────────────────────────────── */}
        <div style={toolItemStyle}>
          <button
            className="vtb-btn"
            onClick={() => {
              if (isCornerstoneNifti) { const next = !niftiZoomMode; setNiftiZoomMode(next); activateCornerstoneNiftiTool(next ? "zoom" : "none"); return; }
              setNiftiZoomMode((v) => !v);
            }}
            disabled={!isNifti} title="Zoom (scroll)" aria-label="Zoom"
            style={{
              background: "#1f2937",
              color: isNifti ? "#e5e7eb" : "#6b7280",
              border: isNifti && niftiZoomMode ? "2px solid #3b82f6" : "1px solid #1e2a3a",
              borderRadius: 6, padding: "8px 10px",
              display: "flex", alignItems: "center", gap: 6,
              cursor: isNifti ? "pointer" : "not-allowed",
            }}
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
          <button
            className="vtb-btn"
            onClick={() => {
              if (isCornerstoneNifti) { const next = niftiTool === "pan" ? "none" : "pan"; activateCornerstoneNiftiTool(next); return; }
              setNiftiTool((t) => (t === "pan" ? "none" : "pan"));
            }}
            disabled={!isNifti} title="Pan" aria-label="Pan"
            style={{
              background: "#1f2937",
              color: isNifti ? "#e5e7eb" : "#6b7280",
              border: isNifti && niftiTool === "pan" ? "2px solid #3b82f6" : "1px solid #1e2a3a",
              borderRadius: 6, padding: "8px 10px",
              display: "flex", alignItems: "center",
              cursor: isNifti ? "pointer" : "not-allowed",
            }}
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
          <button
            className="vtb-btn"
            onClick={() => {
              if (isCornerstoneNifti) { const next = niftiTool === "brightness" ? "none" : "brightness"; activateCornerstoneNiftiTool(next); return; }
              setNiftiTool((t) => (t === "brightness" ? "none" : "brightness"));
            }}
            disabled={!isNifti} title="Brightness (scroll)" aria-label="Brightness"
            style={{
              background: "#1f2937",
              color: isNifti ? "#e5e7eb" : "#6b7280",
              border: isNifti && niftiTool === "brightness" ? "2px solid #3b82f6" : "1px solid #1e2a3a",
              borderRadius: 6, padding: "8px 10px",
              display: "flex", alignItems: "center",
              cursor: isNifti ? "pointer" : "not-allowed",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <path d="M8 2a6 6 0 1 0 0 12V2z" fill="currentColor" opacity="0.5" />
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
          <span style={toolLabelStyle}>Brightness</span>
        </div>

        {/* ── 3D Pointer — split-button matching DICOM style ── */}
        <div style={toolItemStyle}>
          <div style={{ position: "relative", display: "flex" }}>
            {/* Main toggle */}
            <button className="vtb-btn"
              onClick={() => {
                const next = !niftiCrosshairEnabled;
                setNiftiCrosshairEnabled?.(next);
                if (!next) activateCornerstoneNiftiTool?.("none");
                setShowPtrMenu(false);
              }}
              disabled={!isCornerstoneNifti}
              title={niftiCrosshairEnabled ? "3D Pointer ON — click to turn off" : "3D Pointer OFF — click to turn on"}
              aria-label="3D Pointer"
              style={{
                background: "#1f2937",
                color: niftiCrosshairEnabled ? "#60a5fa" : (isCornerstoneNifti ? "#e5e7eb" : "#6b7280"),
                border: niftiCrosshairEnabled ? "2px solid #3b82f6" : "1px solid #1e2a3a",
                borderRight: "none",
                borderRadius: "6px 0 0 6px",
                padding: "8px 10px",
                display: "flex", alignItems: "center",
                cursor: isCornerstoneNifti ? "pointer" : "not-allowed",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.2" />
                <path d="M8 2.5v3M8 10.5v3M2.5 8h3M10.5 8h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                <circle cx="8" cy="8" r="1.1" fill="currentColor" />
              </svg>
            </button>
            {/* Chevron */}
            <button className="vtb-btn"
              onClick={() => { const n = !showPtrMenu; closeAllMenus(); if (n) setShowPtrMenu(true); }}
              disabled={!isCornerstoneNifti}
              aria-label="3D Pointer mode"
              title="Switch between Line and Pointer mode"
              style={{
                background: "#1f2937",
                color: niftiCrosshairEnabled ? "#60a5fa" : "#6b7280",
                border: niftiCrosshairEnabled ? "2px solid #3b82f6" : "1px solid #1e2a3a",
                borderLeft: "1px solid #374151",
                borderRadius: "0 6px 6px 0",
                padding: "8px 5px",
                display: "flex", alignItems: "center",
                cursor: isCornerstoneNifti ? "pointer" : "not-allowed",
              }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {/* Dropdown */}
            {showPtrMenu && (
              <div onMouseLeave={() => setShowPtrMenu(false)}
                style={{
                  position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 200,
                  background: "#1e293b", border: "1px solid #334155", borderRadius: 8,
                  padding: "4px 0", minWidth: 148, boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                }}>
                {[
                  { key: "line",        label: "Line",          desc: "Lines + circle" },
                  { key: "pointer",     label: "Pointer",       desc: "Circle only" },
                  { key: "syncPointer", label: "Sync + Pointer", desc: "Scroll sync · circle · no ref lines" },
                  { key: "off",         label: "Off",           desc: "Disable 3D Pointer" },
                ].map(({ key, label, desc }) => {
                  const isSelected = key === "off" ? !niftiCrosshairEnabled : (niftiCrosshairMode === key && niftiCrosshairEnabled);
                  return (
                    <button key={key}
                      onClick={() => {
                        if (key === "off") {
                          setNiftiCrosshairEnabled?.(false);
                          activateCornerstoneNiftiTool?.("none");
                        } else {
                          setNiftiCrosshairMode?.(key);
                          setNiftiCrosshairEnabled?.(true);
                          if (key === "syncPointer") setNiftiSyncEnabled?.(true);
                        }
                        setShowPtrMenu(false);
                      }}
                      style={{
                        width: "100%", border: "none", padding: "8px 14px", cursor: "pointer",
                        textAlign: "left", display: "flex", flexDirection: "column", gap: 1,
                        borderLeft: isSelected ? "2px solid #3b82f6" : "2px solid transparent",
                        background: isSelected ? "rgba(59,130,246,0.08)" : "none",
                      }}
                    >
                      <span style={{ color: isSelected ? "#60a5fa" : "#e5e7eb", fontSize: 13, fontWeight: 500 }}>{label}</span>
                      <span style={{ color: "#6b7280", fontSize: 11 }}>{desc}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <span style={{ ...toolLabelStyle, color: niftiCrosshairEnabled ? "#60a5fa" : "#8b97ac" }}>
            3D Pointer{niftiCrosshairEnabled ? ` · ${niftiCrosshairMode === "pointer" ? "ptr" : niftiCrosshairMode === "syncPointer" ? "sync+ptr" : "line"}` : ""}
          </span>
        </div>

        {/* ── MPR — dropdown matching DICOM style ─────────────── */}
        <div style={toolItemStyle}>
          <div style={{ position: "relative" }}>
            <button
              className="vtb-btn"
              onClick={() => { const n = !showMprMenu; closeAllMenus(); if (n) setShowMprMenu(true); }}
              disabled={!isNifti || !isCornerstoneNifti}
              title={niftiMprActive ? "MPR ON — click for options" : "MPR — switch to triplanar view"}
              aria-label="MPR"
              style={{
                background: "#1f2937",
                color: niftiMprActive ? "#60a5fa" : (isNifti && isCornerstoneNifti ? "#e5e7eb" : "#6b7280"),
                border: niftiMprActive ? "2px solid #3b82f6" : "1px solid #1e2a3a",
                borderRadius: 6, padding: "8px 10px",
                display: "flex", alignItems: "center", gap: 6,
                cursor: isNifti && isCornerstoneNifti ? "pointer" : "not-allowed",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <rect x="1" y="1" width="7" height="16" rx="1" stroke="currentColor" strokeWidth="1.2" />
                <rect x="10" y="1" width="7" height="7.5" rx="1" stroke="currentColor" strokeWidth="1.2" />
                <rect x="10" y="9.5" width="7" height="7.5" rx="1" stroke="currentColor" strokeWidth="1.2" />
              </svg>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {showMprMenu && (
              <div onMouseLeave={() => setShowMprMenu(false)}
                style={{
                  position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 200,
                  background: "#1e293b", border: "1px solid #334155", borderRadius: 8,
                  padding: "4px 0", minWidth: 200, boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                }}
              >
                {/* Header */}
                <div style={{ padding: "8px 14px 6px", borderBottom: "1px solid #1e2a3a", marginBottom: 4 }}>
                  <span style={{ color: "#94a3b8", fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    Multiplanar Reconstruction
                  </span>
                </div>
                {/* Volume entry — click to enter MPR (or shows active state) */}
                <button
                  onClick={() => { if (!niftiMprActive) { onNiftiMprToggle?.(); setShowMprMenu(false); } }}
                  style={{
                    width: "100%", border: "none", padding: "8px 14px", cursor: niftiMprActive ? "default" : "pointer",
                    textAlign: "left", display: "flex", alignItems: "center", gap: 10,
                    background: niftiMprActive ? "rgba(59,130,246,0.06)" : "none",
                  }}
                >
                  <svg width="28" height="28" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0 }}>
                    <rect x="1" y="1" width="7" height="16" rx="1" stroke={niftiMprActive ? "#60a5fa" : "#475569"} strokeWidth="1.2" />
                    <rect x="10" y="1" width="7" height="7.5" rx="1" stroke={niftiMprActive ? "#60a5fa" : "#475569"} strokeWidth="1.2" />
                    <rect x="10" y="9.5" width="7" height="7.5" rx="1" stroke={niftiMprActive ? "#60a5fa" : "#475569"} strokeWidth="1.2" />
                  </svg>
                  <div style={{ display: "flex", flexDirection: "column", gap: 1, flex: 1, overflow: "hidden" }}>
                    <span style={{ color: niftiMprActive ? "#60a5fa" : "#e5e7eb", fontSize: 12, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      NIfTI Volume
                    </span>
                    <span style={{ color: "#475569", fontSize: 10 }}>
                      {niftiMprActive ? "Active — Ax · Sag · Cor" : "Click to enter MPR"}
                    </span>
                  </div>
                  {niftiMprActive && (
                    <span style={{ background: "rgba(59,130,246,0.15)", color: "#60a5fa", fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 4 }}>ON</span>
                  )}
                </button>
                {/* Exit button — only shown when MPR is active */}
                {niftiMprActive && (
                  <>
                    <div style={{ borderTop: "1px solid #1e2a3a", margin: "4px 0" }} />
                    <button
                      onClick={() => { onNiftiMprToggle?.(); setShowMprMenu(false); }}
                      style={{
                        width: "100%", border: "none", padding: "8px 14px", cursor: "pointer",
                        textAlign: "left", display: "flex", alignItems: "center", gap: 8,
                        background: "none",
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                        <path d="M3 3l10 10M13 3L3 13" stroke="#f87171" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                      <span style={{ color: "#f87171", fontSize: 13, fontWeight: 500 }}>Exit MPR</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          <span style={{ ...toolLabelStyle, color: niftiMprActive ? "#60a5fa" : "#8b97ac" }}>MPR</span>
        </div>

        {/* ── MIP / MinIP / Average (slab projection) ─────────── */}
        <div style={toolItemStyle}>
          <div style={{ position: "relative" }}>
            <button
              className="vtb-btn"
              onClick={() => {
                if (!isNifti || !isCornerstoneNifti) return;
                const next = !showProjectionMenu;
                closeAllMenus();
                if (next) setShowProjectionMenu(true);
              }}
              disabled={!isNifti || !isCornerstoneNifti}
              title={activeProjection ? `${activeProjectionOption.label} — ${activeProjectionOption.desc}` : "MIP / MinIP / Average (slab projection)"}
              aria-label="Slab projection mode"
              style={{
                background: "#1f2937",
                color: activeProjection ? "#34d399" : (isNifti && isCornerstoneNifti ? "#e5e7eb" : "#6b7280"),
                border: activeProjection ? "2px solid #10b981" : "1px solid #1e2a3a",
                borderRadius: 6, padding: "8px 10px",
                display: "flex", alignItems: "center", gap: 6,
                cursor: isNifti && isCornerstoneNifti ? "pointer" : "not-allowed",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M2 5l6-3 6 3-6 3-6-3z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                <path d="M2 8l6 3 6-3" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" opacity="0.7" />
                <path d="M2 11l6 3 6-3" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" opacity="0.45" />
              </svg>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 3l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {showProjectionMenu && isNifti && isCornerstoneNifti && (
              <div style={{
                position: "absolute", top: 38, left: 0,
                background: "#131c2b", border: "1px solid #2d3748",
                borderRadius: 8, padding: 4, minWidth: 200,
                zIndex: 200, boxShadow: "0 8px 28px rgba(0,0,0,0.7)",
              }}>
                {PROJECTION_MODE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    className="vtb-btn"
                    onClick={() => { onNiftiProjectionModeChange?.(opt.id); setShowProjectionMenu(false); }}
                    title={opt.desc}
                    style={{
                      width: "100%", textAlign: "left",
                      background: niftiProjectionMode === opt.id ? "#10362b" : "transparent",
                      color: "#e5e7eb", border: "none",
                      padding: "7px 10px", fontSize: 12, borderRadius: 4,
                      display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center",
                    }}
                  >
                    <span style={{ color: niftiProjectionMode === opt.id ? "#34d399" : "#e5e7eb", fontWeight: niftiProjectionMode === opt.id ? 600 : 400 }}>
                      {opt.label}
                    </span>
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

        {/* Slab thickness slider — only when a projection is active */}
        {activeProjection && isNifti && isCornerstoneNifti && (
          <div style={{ ...toolItemStyle, minWidth: 132 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "4px 6px", background: "#16202f", border: "1px solid #1e2a3a", borderRadius: 6, width: 120 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 10, color: "#8b97ac", letterSpacing: "0.03em" }}>Slab</span>
                <span style={{ fontSize: 11, color: "#34d399", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontWeight: 600 }}>
                  {Math.round(Number(niftiSlabThicknessMm) || 0)} mm
                </span>
              </div>
              <input
                type="range"
                min={SLAB_THICKNESS_MIN_MM}
                max={SLAB_THICKNESS_MAX_MM}
                step={SLAB_THICKNESS_STEP_MM}
                value={Number(niftiSlabThicknessMm) || SLAB_THICKNESS_MIN_MM}
                onChange={(e) => onNiftiSlabThicknessChange?.(Number(e.target.value))}
                title={`Slab thickness ${SLAB_THICKNESS_MIN_MM}–${SLAB_THICKNESS_MAX_MM} mm`}
                aria-label="Slab thickness (mm)"
                style={{ width: "100%", accentColor: "#10b981", cursor: "pointer", height: 4 }}
              />
            </div>
            <span style={toolLabelStyle}>Thickness</span>
          </div>
        )}

        <div className="vtb-sep" />

        {/* ── Flip ────────────────────────────────────────────── */}
        <div style={toolItemStyle}>
          <button
            className="vtb-btn"
            onClick={onFlipH}
            disabled={!isNifti} title="Flip Horizontal" aria-label="Flip Horizontal"
            style={{
              background: "#1f2937",
              color: isNifti ? "#e5e7eb" : "#6b7280",
              border: isNifti && isFlipH ? "2px solid #3b82f6" : "1px solid #1e2a3a",
              borderRadius: 6, padding: "8px 10px",
              display: "flex", alignItems: "center",
              cursor: isNifti ? "pointer" : "not-allowed",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M8 3v10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeDasharray="2 1.5" />
              <path d="M4 5l-2 3 2 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M12 5l2 3-2 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <span style={toolLabelStyle}>Flip H</span>
        </div>

        <div style={toolItemStyle}>
          <button
            className="vtb-btn"
            onClick={onFlipV}
            disabled={!isNifti} title="Flip Vertical" aria-label="Flip Vertical"
            style={{
              background: "#1f2937",
              color: isNifti ? "#e5e7eb" : "#6b7280",
              border: isNifti && isFlipV ? "2px solid #3b82f6" : "1px solid #1e2a3a",
              borderRadius: 6, padding: "8px 10px",
              display: "flex", alignItems: "center",
              cursor: isNifti ? "pointer" : "not-allowed",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 8h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeDasharray="2 1.5" />
              <path d="M5 4l3-2 3 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M5 12l3 2 3-2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <span style={toolLabelStyle}>Flip V</span>
        </div>

        <div className="vtb-sep" />

        {/* ── Capture & Rotation ──────────────────────────────── */}
        <div style={toolItemStyle}>
          <button
            className="vtb-btn"
            onClick={saveSelectedViewportAsPng}
            disabled={!isNifti} title="Save selected view as PNG" aria-label="Save selected view as PNG"
            style={{
              background: "#1f2937",
              color: isNifti ? "#e5e7eb" : "#6b7280",
              border: "1px solid #1e2a3a",
              borderRadius: 6, padding: "8px 10px",
              display: "flex", alignItems: "center",
              cursor: isNifti ? "pointer" : "not-allowed",
            }}
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
          <button
            className="vtb-btn"
            onClick={() => {
              if (isCornerstoneNifti) { rotateCornerstoneNifti(-90); return; }
              setNiftiRotation((r) => ({ ...r, [niftiPlane]: (r[niftiPlane] - 90) % 360 }));
            }}
            disabled={!isNifti} title="Rotate CCW" aria-label="Rotate CCW"
            style={{
              background: "#1f2937",
              color: isNifti ? "#e5e7eb" : "#6b7280",
              border: "1px solid #1e2a3a",
              borderRadius: 6, padding: "8px 10px",
              display: "flex", alignItems: "center",
              cursor: isNifti ? "pointer" : "not-allowed",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <path d="M6 3H3v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M3 6a5 5 0 1 1 2 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
          <span style={toolLabelStyle}>Rotate L</span>
        </div>

        <div style={toolItemStyle}>
          <button
            className="vtb-btn"
            onClick={() => {
              if (isCornerstoneNifti) { rotateCornerstoneNifti(90); return; }
              setNiftiRotation((r) => ({ ...r, [niftiPlane]: (r[niftiPlane] + 90) % 360 }));
            }}
            disabled={!isNifti} title="Rotate CW" aria-label="Rotate CW"
            style={{
              background: "#1f2937",
              color: isNifti ? "#e5e7eb" : "#6b7280",
              border: "1px solid #1e2a3a",
              borderRadius: 6, padding: "8px 10px",
              display: "flex", alignItems: "center",
              cursor: isNifti ? "pointer" : "not-allowed",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <path d="M10 3h3v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M13 6a5 5 0 1 0-2 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
          <span style={toolLabelStyle}>Rotate R</span>
        </div>

        <div className="vtb-sep" />

        {/* ── Measurement ─────────────────────────────────────── */}
        <div style={toolItemStyle}>
          <div style={{ position: "relative" }}>
            <button
              className="vtb-btn"
              onClick={() => {
                if (!isNifti) return;
                const next = !showMeasureMenu;
                setShowMeasureMenu(next);
                if (next) { setShowGridMenu(false); setShowPlaneMenu(false); setShowColormapMenu(false); setShowPresetMenu(false); }
              }}
              disabled={!isNifti} title="Measure Tools" aria-label="Measure Tools"
              style={{
                background: "#1f2937",
                color: isNifti ? "#e5e7eb" : "#6b7280",
                border: isNifti && isMeasureToolActive ? "2px solid #3b82f6" : "1px solid #1e2a3a",
                borderRadius: 6, padding: "8px 10px",
                display: "flex", alignItems: "center", gap: 6,
                cursor: isNifti ? "pointer" : "not-allowed",
              }}
            >
              {renderMeasureToolIcon(activeMeasureTool.id)}
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 3l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {showMeasureMenu && isNifti && (
              <div style={{
                position: "absolute", top: 38, left: 0,
                background: "#131c2b", border: "1px solid #2d3748",
                borderRadius: 8, padding: 6,
                display: "flex", gap: 5,
                zIndex: 200, boxShadow: "0 8px 28px rgba(0,0,0,0.7)",
              }}>
                {measurementTools.map((tool) => (
                  <button
                    key={tool.id}
                    className="vtb-btn"
                    onClick={() => {
                      if (isCornerstoneNifti) {
                        if (tool.id === "none") {
                          activateCornerstoneNiftiTool("none");
                        } else {
                          const next = niftiTool === tool.id ? "none" : tool.id;
                          if (next.startsWith("measure")) onMeasureActivate?.();
                          activateCornerstoneNiftiTool(next);
                        }
                      } else {
                        setNiftiTool((t) => { const next = t === "measure" ? "none" : "measure"; if (next === "measure") onMeasureActivate?.(); return next; });
                      }
                      setShowMeasureMenu(false);
                    }}
                    title={tool.label} aria-label={tool.label}
                    style={{
                      background: niftiTool === tool.id ? "#1e3a5f" : "#1f2937",
                      color: "#e5e7eb",
                      border: niftiTool === tool.id ? "1px solid #3b82f6" : "1px solid #2d3748",
                      borderRadius: 6, width: 34, height: 34, padding: 0,
                      display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                    }}
                  >
                    {renderMeasureToolIcon(tool.id)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <span style={toolLabelStyle}>Measure</span>
        </div>

      </div>

      {saveNotice && (
        <div style={{ marginTop: 6, marginLeft: 6, fontSize: 12, color: "#93c5fd", letterSpacing: "0.02em" }}>
          {saveNotice}
        </div>
      )}
    </>
  );
}
