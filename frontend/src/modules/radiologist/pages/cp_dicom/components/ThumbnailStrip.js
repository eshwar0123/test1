import React, { useRef, useEffect, useState, useCallback } from "react";

/**
 * Vertical thumbnail strip on the LEFT side of the viewport.
 * Shows mini slice preview images with a slice counter and hide toggle.
 */
export default function ThumbnailStrip({
  totalSlices,
  currentSlice,
  onSliceClick,
  renderingEngine,
  viewportId,
}) {
  const stripRef = useRef(null);
  const [hidden, setHidden] = useState(false);
  const [thumbs, setThumbs] = useState({}); // { sliceIdx: dataUrl }

  // Max thumbnails to show (for performance)
  const maxThumbs = Math.min(totalSlices || 0, 80);
  const step = !totalSlices || totalSlices <= maxThumbs ? 1 : totalSlices / maxThumbs;
  const indices = [];
  for (let i = 0; i < maxThumbs; i++) {
    indices.push(Math.round(i * step));
  }

  // Generate thumbnail previews from the viewport
  const generateThumbs = useCallback(() => {
    if (!renderingEngine || !viewportId || !totalSlices) return;

    let vp;
    try {
      vp = renderingEngine.getViewport(viewportId);
    } catch {
      return;
    }
    if (!vp) return;

    // Get the image IDs from the viewport
    const imageIds = vp.getImageIds?.() ?? [];
    if (imageIds.length === 0) return;

    // Only generate for visible indices, in batches
    const newThumbs = {};
    const THUMB_W = 64;
    const THUMB_H = 48;

    // Use the viewport's canvas to capture the current slice as a reference
    const vpCanvas = vp.canvas;
    if (vpCanvas) {
      const currentIdx = currentSlice ?? 0;
      try {
        const thumbCanvas = document.createElement("canvas");
        thumbCanvas.width = THUMB_W;
        thumbCanvas.height = THUMB_H;
        const ctx = thumbCanvas.getContext("2d");
        ctx.drawImage(vpCanvas, 0, 0, vpCanvas.width, vpCanvas.height, 0, 0, THUMB_W, THUMB_H);
        newThumbs[currentIdx] = thumbCanvas.toDataURL("image/jpeg", 0.5);
      } catch {}
    }

    setThumbs(prev => ({ ...prev, ...newThumbs }));
  }, [renderingEngine, viewportId, totalSlices, currentSlice]);

  // Capture thumbnail of current slice whenever it changes
  useEffect(() => {
    const timer = setTimeout(generateThumbs, 150);
    return () => clearTimeout(timer);
  }, [currentSlice, generateThumbs]);

  // Auto-scroll to keep active thumbnail visible
  useEffect(() => {
    if (!stripRef.current || currentSlice == null) return;
    const active = stripRef.current.querySelector(`[data-slice="${currentSlice}"]`);
    if (active) {
      active.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    }
  }, [currentSlice]);

  if (!totalSlices || totalSlices <= 1) return null;

  const isActive = (idx) => {
    if (totalSlices <= maxThumbs) return idx === (currentSlice ?? 0);
    const nextIdx = indices[indices.indexOf(idx) + 1] ?? totalSlices;
    return (currentSlice ?? 0) >= idx && (currentSlice ?? 0) < nextIdx;
  };

  // Find closest thumb image for a given index
  const getThumbSrc = (idx) => {
    if (thumbs[idx]) return thumbs[idx];
    // Find nearest captured thumb
    let closest = null;
    let minDist = Infinity;
    for (const key of Object.keys(thumbs)) {
      const d = Math.abs(Number(key) - idx);
      if (d < minDist) { minDist = d; closest = key; }
    }
    return closest && minDist < 5 ? thumbs[closest] : null;
  };

  return (
    <>
      {/* Toggle button — always visible */}
      <button
        onClick={() => setHidden(h => !h)}
        title={hidden ? "Show slice strip" : "Hide slice strip"}
        style={{
          position: "absolute",
          left: hidden ? 4 : 78,
          top: 6,
          zIndex: 20,
          background: "rgba(0,0,0,0.7)",
          border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 6,
          color: "#94a3b8",
          cursor: "pointer",
          padding: "3px 6px",
          fontSize: 11,
          fontWeight: 600,
          fontFamily: "monospace",
          transition: "left 0.25s ease",
          pointerEvents: "auto",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        {hidden ? "▶" : "◀"}
        <span style={{ fontSize: 9 }}>{hidden ? "Slices" : ""}</span>
      </button>

      {/* Strip panel */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 76,
          zIndex: 16,
          background: "rgba(0, 0, 0, 0.75)",
          backdropFilter: "blur(6px)",
          borderRight: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          flexDirection: "column",
          transition: "transform 0.25s ease",
          transform: hidden ? "translateX(-100%)" : "translateX(0)",
          pointerEvents: "auto",
        }}
      >
        {/* Slice counter header */}
        <div
          style={{
            padding: "8px 6px 6px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            textAlign: "center",
            flexShrink: 0,
          }}
        >
          <div style={{
            fontSize: 9,
            fontWeight: 600,
            color: "#64748b",
            textTransform: "uppercase",
            letterSpacing: "0.8px",
            marginBottom: 2,
            fontFamily: "monospace",
          }}>
            Slice
          </div>
          <div style={{
            fontSize: 15,
            fontWeight: 700,
            color: "#60a5fa",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            lineHeight: 1.2,
          }}>
            {(currentSlice ?? 0) + 1}
          </div>
          <div style={{
            fontSize: 10,
            color: "#475569",
            fontFamily: "monospace",
          }}>
            of {totalSlices}
          </div>
        </div>

        {/* Scrollable thumbnails */}
        <div
          ref={stripRef}
          style={{
            flex: 1,
            overflowY: "auto",
            overflowX: "hidden",
            padding: "4px 4px",
            display: "flex",
            flexDirection: "column",
            gap: 3,
            scrollbarWidth: "thin",
            scrollbarColor: "#3b82f6 transparent",
          }}
        >
          {indices.map((idx) => {
            const active = isActive(idx);
            const src = getThumbSrc(idx);

            return (
              <div
                key={idx}
                data-slice={idx}
                onClick={() => onSliceClick?.(idx)}
                title={`Slice ${idx + 1}`}
                style={{
                  flexShrink: 0,
                  width: "100%",
                  height: 48,
                  borderRadius: 6,
                  border: active
                    ? "2px solid #3b82f6"
                    : "1px solid rgba(255,255,255,0.08)",
                  background: active
                    ? "rgba(59, 130, 246, 0.15)"
                    : "rgba(255,255,255,0.03)",
                  cursor: "pointer",
                  position: "relative",
                  overflow: "hidden",
                  transition: "border-color 0.15s, background 0.15s",
                  boxShadow: active ? "0 0 8px rgba(59,130,246,0.3)" : "none",
                }}
              >
                {/* Preview image */}
                {src ? (
                  <img
                    src={src}
                    alt=""
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                      opacity: active ? 1 : 0.6,
                    }}
                  />
                ) : (
                  <div style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: active
                      ? "linear-gradient(135deg, rgba(59,130,246,0.2), rgba(30,64,175,0.2))"
                      : "rgba(255,255,255,0.02)",
                  }}>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: active ? "#60a5fa" : "#475569",
                      fontFamily: "monospace",
                    }}>
                      {idx + 1}
                    </span>
                  </div>
                )}

                {/* Slice number badge */}
                <div style={{
                  position: "absolute",
                  bottom: 1,
                  right: 2,
                  fontSize: 8,
                  fontWeight: 700,
                  color: active ? "#93c5fd" : "#64748b",
                  fontFamily: "monospace",
                  textShadow: "0 1px 2px rgba(0,0,0,0.8)",
                  lineHeight: 1,
                }}>
                  {idx + 1}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
