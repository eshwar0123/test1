// src/pages/DicomViewer/components/MedSAMSegmentOverlay.jsx
//
// Overlay for client-side box-prompt segmentation.
// Shows live box rectangle while drawing, then colored mask after segmentation.

import React from "react";
import onixIcon from "/icon.png";

export default function MedSAMSegmentOverlay({
  isDrawing, isLoading, maskDataUrl, polyBbox,
  error, popupOpen, liveBox,
  canvasBounds,
  savedMasks,
  currentColor,
  onPointerDown, onPointerMove, onPointerUp,
  onSaveAnnotation, onSaveImage, onDontSave,
  onAskOnixAI,
  onSaveToSlice,
  onApplyToAllSlices,
  currentSliceKey,
  allSliceKeys,
  isActive,
}) {
  if (!isActive && !maskDataUrl && !isLoading && !error) return null;

  // CSS color from [r,g,b,a] array
  const colorCss = currentColor
    ? `rgba(${currentColor[0]},${currentColor[1]},${currentColor[2]},0.7)`
    : "rgba(167,139,250,0.7)";

  return (
    <>
      {/* ── Viewport overlay ── */}
      <div
        style={{
          position:      "absolute",
          inset:         0,
          zIndex:        999,
          cursor:        isLoading ? "wait" : isActive ? "crosshair" : "default",
          userSelect:    "none",
          touchAction:   "none",
          pointerEvents: isActive ? "all" : "none",
        }}
        onPointerDown={(e) => isActive && onPointerDown(e, e.currentTarget.parentElement)}
        onPointerMove={(e) => isActive && onPointerMove(e)}
        onPointerUp={(e)   => isActive && onPointerUp(e, currentSliceKey)}
      >
        {/* 1. Segmentation mask — overlaid on exact canvas panel */}
        {maskDataUrl && !isLoading && (() => {
          const b = canvasBounds;
          return (
            <img
              src={maskDataUrl}
              alt="segmentation mask"
              style={{
                position:      "absolute",
                left:          b ? b.left   : 0,
                top:           b ? b.top    : 0,
                width:         b ? b.width  : "100%",
                height:        b ? b.height : "100%",
                objectFit:     "fill",
                opacity:       0.7,
                mixBlendMode:  "screen",
                pointerEvents: "none",
              }}
            />
          );
        })()}

        {/* 2. SVG — live box rect + color indicator */}
        <svg
          style={{
            position:      "absolute", inset: 0,
            width:         "100%", height: "100%",
            pointerEvents: "none", overflow: "visible",
          }}
        >
          {/* Live box while drawing */}
          {isDrawing && liveBox && (
            <>
              {/* Dim everything outside box */}
              <rect x="0" y="0" width="100%" height="100%"
                fill="rgba(0,0,0,0.25)" />
              {/* Clear the box area */}
              <rect
                x={liveBox.x} y={liveBox.y}
                width={liveBox.w} height={liveBox.h}
                fill="rgba(0,0,0,0)"
                style={{ mixBlendMode: "destination-out" }}
              />
              {/* Box border */}
              <rect
                x={liveBox.x} y={liveBox.y}
                width={liveBox.w} height={liveBox.h}
                fill="rgba(167,139,250,0.08)"
                stroke={colorCss}
                strokeWidth="2"
                strokeDasharray="8 4"
                rx="2"
              />
              {/* Corner handles */}
              {[
                [liveBox.x, liveBox.y],
                [liveBox.x + liveBox.w, liveBox.y],
                [liveBox.x, liveBox.y + liveBox.h],
                [liveBox.x + liveBox.w, liveBox.y + liveBox.h],
              ].map(([cx, cy], i) => (
                <rect key={i}
                  x={cx - 4} y={cy - 4} width={8} height={8}
                  fill={colorCss} rx="1"
                />
              ))}
              {/* Size label */}
              <text
                x={liveBox.x + liveBox.w / 2}
                y={liveBox.y - 6}
                textAnchor="middle"
                fontSize="11"
                fill={colorCss}
                fontFamily="monospace"
              >
                {Math.round(liveBox.w)} × {Math.round(liveBox.h)}
              </text>
            </>
          )}
        </svg>

        {/* 3. Spinner */}
        {isLoading && (
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            background: "rgba(0,0,0,0.52)", pointerEvents: "none",
          }}>
            <style>{`@keyframes mdspin{to{transform:rotate(360deg)}}`}</style>
            <div style={{
              width: 42, height: 42,
              border: "3px solid #374151",
              borderTop: `3px solid ${colorCss}`,
              borderRadius: "50%",
              animation: "mdspin 0.85s linear infinite",
            }} />
            <span style={{ marginTop: 12, fontSize: 13, color: colorCss, fontWeight: 600 }}>
              Segmenting…
            </span>
          </div>
        )}

        {/* 4. Error */}
        {error && (
          <div style={{
            position: "absolute", bottom: 14, left: "50%",
            transform: "translateX(-50%)",
            background: "#450a0a", border: "1px solid #7f1d1d",
            borderRadius: 8, padding: "8px 18px",
            fontSize: 12, color: "#fca5a5",
            pointerEvents: "none", whiteSpace: "nowrap",
          }}>
            ⚠ {error}
          </div>
        )}

        {/* 5. Idle hint */}
        {isActive && !isDrawing && !maskDataUrl && !isLoading && !error && (
          <div style={{
            position: "absolute", top: 10, left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(46,16,101,0.90)",
            border: "1px solid #7c3aed",
            borderRadius: 6, padding: "5px 14px",
            fontSize: 12, color: "#ddd6fe",
            pointerEvents: "none", whiteSpace: "nowrap",
          }}>
            ☐ Draw a box around the structure to segment
          </div>
        )}
      </div>

      {/* ── Save popup ── */}
      {popupOpen && (
        <div style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.62)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 4000,
        }}>
          <div style={{
            width: 440, maxWidth: "92vw",
            background: "#0b0f16",
            border: `1px solid ${colorCss}`,
            borderRadius: 14, padding: 26,
            color: "#e5e7eb",
            boxShadow: "0 16px 48px rgba(0,0,0,0.75)",
          }}>
            {/* Header */}
            <div style={{
              fontSize: 16, fontWeight: 700,
              marginBottom: 8,
              display: "flex", alignItems: "center", gap: 10,
            }}>
              {/* Color swatch */}
              <div style={{
                width: 18, height: 18, borderRadius: 4,
                background: colorCss, flexShrink: 0,
              }} />
              Segmentation Complete
              {savedMasks && Object.keys(savedMasks).length > 0 && (
                <span style={{
                  marginLeft: "auto", fontSize: 11,
                  background: "#312e81", color: "#a78bfa",
                  border: "1px solid #4338ca",
                  borderRadius: 20, padding: "2px 10px",
                }}>
                  {Object.keys(savedMasks).length} slice{Object.keys(savedMasks).length > 1 ? "s" : ""} saved
                </span>
              )}
            </div>

            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 16 }}>
              Client-side segmentation complete. Choose what to do next.
            </div>

            {/* Mask thumbnail */}
            {maskDataUrl && (
              <div style={{
                marginBottom: 14, borderRadius: 8,
                overflow: "hidden", border: "1px solid #1f2937",
                background: "#111827", height: 90,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <img src={maskDataUrl} alt="mask" style={{
                  maxHeight: "100%", maxWidth: "100%",
                  objectFit: "contain", opacity: 0.92,
                }} />
              </div>
            )}

            {/* Region info */}
            {polyBbox && (
              <div style={{
                fontSize: 11, color: "#4b5563",
                marginBottom: 18, fontFamily: "monospace",
              }}>
                Region [{polyBbox.x1},{polyBbox.y1}] → [{polyBbox.x2},{polyBbox.y2}]
                {` · ${polyBbox.x2 - polyBbox.x1}×${polyBbox.y2 - polyBbox.y1} px`}
                {currentSliceKey !== undefined && ` · Slice ${currentSliceKey}`}
              </div>
            )}

            {/* Buttons */}
            <div style={{
              display: "flex", gap: 10,
              justifyContent: "flex-end",
              alignItems: "center",
              flexWrap: "nowrap", marginBottom: 14,
            }}>
              <button onClick={onSaveAnnotation} style={{
                background: "#312e81", color: "#ddd6fe",
                border: "1px solid #4338ca", borderRadius: 8,
                padding: "9px 16px", fontSize: 13,
                fontWeight: 600, cursor: "pointer",
                whiteSpace: "nowrap",
              }}>
                Save as Annotation
              </button>
              <button onClick={() => onAskOnixAI && onAskOnixAI()} style={{
                background: "#1d4ed8", color: "#e5e7eb",
                border: "1px solid #1e40af", borderRadius: 8,
                padding: "9px 16px", fontSize: 13,
                fontWeight: 600, cursor: "pointer",
                display: "inline-flex", alignItems: "center", gap: 8,
                whiteSpace: "nowrap",
              }}>
                <img
                  src={onixIcon}
                  alt="Onix"
                  style={{ width: 16, height: 16, borderRadius: 999, objectFit: "contain", display: "block" }}
                />
                <span>Ask Onix AI</span>
              </button>
              <button onClick={onDontSave} style={{
                background: "transparent", color: "#9ca3af",
                border: "1px solid #374151", borderRadius: 8,
                padding: "9px 16px", fontSize: 13,
                fontWeight: 600, cursor: "pointer",
                whiteSpace: "nowrap",
              }}>
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
