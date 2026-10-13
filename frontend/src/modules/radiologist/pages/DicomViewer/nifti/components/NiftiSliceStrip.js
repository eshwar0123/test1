// nifti/components/NiftiSliceStrip.js
//
// Left-side slice navigator for the NIfTI viewer.
// Shows a live thumbnail of each visible plane (Axial / Sagittal / Coronal),
// updated every time that viewport re-renders. Clicking a tile makes that
// plane the active slot; the up/down arrows step through slices.

import React, { useEffect, useRef, useState } from "react";

const PLANE_COLORS = {
  axial:    "#378ADD",
  sagittal: "#EF9F27",
  coronal:  "#97C459",
};
const PLANE_SHORT = { axial: "Ax", sagittal: "Sag", coronal: "Cor" };
const STRIP_WIDTH = 134;
const TILE_WIDTH  = 110;
const THUMB_H     = 86;

export default function NiftiSliceStrip({
  slots,            // visible slot indices, e.g. [0,1,2]
  niftiSliceBySlot, // { 0:{current,total}, 1:{current,total}, … }
  activeSlot,
  onSetActiveSlot,
  renderingEngineRef,
  refs,             // [axRef, sagRef, corRef]
  readyToken,
  onSliceStep,      // (slot, delta) => void
  niftiSlotPlanes,  // ["axial","sagittal","coronal"]
  onClose,
}) {
  const [thumbs, setThumbs] = useState({});
  const captureRef = useRef({});

  // Capture canvas → dataURL for one slot
  const captureSlot = (slot) => {
    try {
      const vp = renderingEngineRef?.current?.getViewport?.(`NIFTI_SLOT_${slot}`);
      const canvas = vp?.getCanvas?.();
      if (!canvas || canvas.width === 0) return;
      const dataUrl = canvas.toDataURL("image/jpeg", 0.5);
      setThumbs((prev) => prev[slot] === dataUrl ? prev : { ...prev, [slot]: dataUrl });
    } catch {}
  };

  useEffect(() => {
    if (!slots?.length || !refs) return;

    const listeners = [];

    const attach = (slot) => {
      const el = refs[slot]?.current;
      if (!el) return;
      const onRender = () => {
        // Debounce captures to at most once per 200 ms per slot
        clearTimeout(captureRef.current[slot]);
        captureRef.current[slot] = setTimeout(() => captureSlot(slot), 200);
      };
      const EVENTS = [
        "cornerstoneimagerendered",
        "cornerstoneVolumeNewImageEvent",
        "cornerstoneCameraModified",
      ];
      EVENTS.forEach((evt) => {
        el.addEventListener(evt, onRender);
        listeners.push({ el, evt, fn: onRender });
      });
      // Initial capture after a short delay so the viewport has painted
      captureRef.current[slot] = setTimeout(() => captureSlot(slot), 700);
    };

    slots.forEach(attach);

    return () => {
      listeners.forEach(({ el, evt, fn }) => el.removeEventListener(evt, fn));
      Object.values(captureRef.current).forEach(clearTimeout);
      captureRef.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, readyToken]);

  if (!slots?.length) return null;

  return (
    <div style={stripBaseStyle}>
      {/* Header */}
      <div style={stripHeaderStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
          <span style={stripHeaderLabelStyle}>SLICES</span>
          {onClose && (
            <button onClick={onClose} title="Hide slices panel" style={closeButtonStyle} aria-label="Close">
              ‹
            </button>
          )}
        </div>
        <span style={{ color: "#475569", fontSize: 10 }}>tap to focus</span>
      </div>

      {/* Tiles */}
      <div style={rowStyle}>
        {slots.map((slot) => {
          const plane  = niftiSlotPlanes?.[slot] || "axial";
          const color  = PLANE_COLORS[plane] || "#60a5fa";
          const label  = PLANE_SHORT[plane] || plane;
          const info   = niftiSliceBySlot?.[slot] || { current: 1, total: 1 };
          const thumb  = thumbs[slot];
          const isActive = slot === activeSlot;
          const pct = info.total > 1 ? (info.current - 1) / (info.total - 1) : 0;

          return (
            <div key={slot} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>
              <button
                type="button"
                onClick={() => onSetActiveSlot?.(slot)}
                title={`${label} — slice ${info.current} / ${info.total}`}
                style={{
                  ...tileButtonStyle,
                  borderColor: isActive ? color : "#1e2a3a",
                  boxShadow: isActive ? `0 0 0 1px ${color}55` : "none",
                }}
              >
                {/* Thumbnail */}
                <div style={{ ...thumbBoxStyle, overflow: "hidden", position: "relative" }}>
                  {thumb ? (
                    <img src={thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  ) : (
                    <PlaceholderIcon color={isActive ? color : "#334155"} />
                  )}
                  {/* Plane badge */}
                  <span style={{ ...planeBadgeStyle, background: color + "cc" }}>{label}</span>
                  {/* Slice progress bar on right edge */}
                  <div style={progressTrackStyle}>
                    <div style={{ ...progressThumbStyle, background: color, top: `${pct * 100}%` }} />
                  </div>
                </div>

                {/* Slice counter */}
                <div style={{ ...sliceLabelStyle, color: isActive ? color : "#94a3b8" }}>
                  {info.current} / {info.total}
                </div>
              </button>

              {/* Step buttons */}
              <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                <button
                  type="button"
                  title="Previous slice"
                  onClick={() => onSliceStep?.(slot, -1)}
                  style={{ ...stepBtnStyle, color: isActive ? color : "#475569" }}
                >
                  ▲
                </button>
                <button
                  type="button"
                  title="Next slice"
                  onClick={() => onSliceStep?.(slot, 1)}
                  style={{ ...stepBtnStyle, color: isActive ? color : "#475569" }}
                >
                  ▼
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PlaceholderIcon({ color }) {
  return (
    <svg width={28} height={28} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="3" x2="12" y2="7" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <line x1="3" y1="12" x2="7" y2="12" />
      <line x1="17" y1="12" x2="21" y2="12" />
    </svg>
  );
}

/* ─── Styles ─────────────────────────────────────────────── */
const stripBaseStyle = {
  width: STRIP_WIDTH,
  minWidth: STRIP_WIDTH,
  height: "100%",
  flexShrink: 0,
  background: "linear-gradient(90deg, #0b0f16 0%, #0e1520 100%)",
  borderRight: "1px solid #1e2a3a",
  display: "flex",
  flexDirection: "column",
  position: "relative",
  zIndex: 100,
};

const stripHeaderStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: 2,
  padding: "8px 10px 6px",
  borderBottom: "1px solid #1e2a3a",
  flexShrink: 0,
};

const stripHeaderLabelStyle = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.08em",
  color: "#60a5fa",
  textTransform: "uppercase",
};

const rowStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 14,
  overflowY: "auto",
  overflowX: "hidden",
  padding: "10px 12px 12px",
  flex: 1,
  scrollbarWidth: "thin",
  scrollbarColor: "#1e2a3a #0e1520",
};

const tileButtonStyle = {
  flexShrink: 0,
  width: TILE_WIDTH,
  background: "transparent",
  border: "2px solid #1e2a3a",
  borderRadius: 6,
  padding: 0,
  cursor: "pointer",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  transition: "border-color 0.12s ease, box-shadow 0.12s ease",
  fontFamily: "inherit",
};

const thumbBoxStyle = {
  width: "100%",
  height: THUMB_H,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#0a0a0a",
};

const planeBadgeStyle = {
  position: "absolute",
  top: 4,
  left: 4,
  fontSize: 9,
  fontWeight: 700,
  color: "#fff",
  padding: "1px 5px",
  borderRadius: 3,
  letterSpacing: "0.05em",
};

const progressTrackStyle = {
  position: "absolute",
  right: 3,
  top: 4,
  bottom: 4,
  width: 3,
  borderRadius: 2,
  background: "rgba(255,255,255,0.08)",
};

const progressThumbStyle = {
  position: "absolute",
  left: 0,
  right: 0,
  height: 6,
  borderRadius: 2,
  marginTop: -3,
  transition: "top 0.1s ease",
};

const sliceLabelStyle = {
  fontSize: 9,
  padding: "3px 6px",
  textAlign: "center",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontWeight: 500,
  background: "#0b0f16",
  letterSpacing: "0.04em",
};

const closeButtonStyle = {
  background: "transparent",
  border: "none",
  color: "#475569",
  cursor: "pointer",
  fontSize: 16,
  lineHeight: 1,
  padding: "0 2px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 4,
  transition: "color 0.12s",
};

const stepBtnStyle = {
  background: "transparent",
  border: "1px solid #1e2a3a",
  borderRadius: 4,
  width: 30,
  height: 20,
  fontSize: 9,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "inherit",
  transition: "color 0.12s, border-color 0.12s",
  lineHeight: 1,
  padding: 0,
};
