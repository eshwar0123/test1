import React, { useEffect, useRef, useState } from "react";

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
}) {
  const [showMeasureMenu, setShowMeasureMenu] = useState(false);
  const [showPresetMenu, setShowPresetMenu] = useState(false);
  const toolbarMenusRef = useRef(null);

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
  ];
  const isMeasureToolActive = typeof niftiTool === "string" && niftiTool.startsWith("measure");
  const activeMeasureTool = measurementTools.find((t) => t.id === niftiTool) || measurementTools[0];

  const renderMeasureToolIcon = (toolId) => {
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

  useEffect(() => {
    if (!showGridMenu && !showPlaneMenu && !showColormapMenu && !showMeasureMenu && !showPresetMenu) return;
    const onDocPointerDown = (evt) => {
      if (!toolbarMenusRef.current?.contains(evt.target)) {
        setShowGridMenu(false);
        setShowPlaneMenu(false);
        setShowColormapMenu(false);
        setShowMeasureMenu(false);
        setShowPresetMenu(false);
      }
    };
    document.addEventListener("mousedown", onDocPointerDown);
    return () => document.removeEventListener("mousedown", onDocPointerDown);
  }, [showGridMenu, showPlaneMenu, showColormapMenu, showMeasureMenu, showPresetMenu, setShowGridMenu, setShowPlaneMenu, setShowColormapMenu]);

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
          zIndex: 5,
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
              if (isCornerstoneNifti) { const next = !niftiZoomMode; setNiftiZoomMode(next); activateCornerstoneNiftiTool(next ? "zoom" : "brightness"); return; }
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

        <div style={toolItemStyle}>
          <button
            className="vtb-btn"
            onClick={() => {
              if (isCornerstoneNifti) { setNiftiZoomMode(false); const next = niftiTool === "crosshair" ? "none" : "crosshair"; activateCornerstoneNiftiTool(next); }
            }}
            disabled={!isNifti} title="3D Pointer" aria-label="3D Pointer"
            style={{
              background: "#1f2937",
              color: isNifti ? "#e5e7eb" : "#6b7280",
              border: isNifti && niftiTool === "crosshair" ? "2px solid #3b82f6" : "1px solid #1e2a3a",
              borderRadius: 6, padding: "8px 10px",
              display: "flex", alignItems: "center",
              cursor: isNifti ? "pointer" : "not-allowed",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.2" />
              <path d="M8 2.5v3M8 10.5v3M2.5 8h3M10.5 8h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              <circle cx="8" cy="8" r="1.1" fill="currentColor" />
            </svg>
          </button>
          <span style={toolLabelStyle}>3D Pointer</span>
        </div>

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
                        const next = niftiTool === tool.id ? "none" : tool.id;
                        if (next.startsWith("measure")) onMeasureActivate?.();
                        activateCornerstoneNiftiTool(next);
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
