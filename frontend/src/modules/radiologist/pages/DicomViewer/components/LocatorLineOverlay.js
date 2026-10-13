import React from "react";

/* ─── LocatorLineOverlay ──────────────────────────────────────────────────
   Thin SVG layer drawn on top of a single Cornerstone viewport. It is purely
   presentational: it renders whatever line segments the LocatorLineManager
   computed for this viewport. Coordinates are in CSS pixels relative to the
   viewport element (same space the parent overlay container uses), so the SVG
   sits at inset:0 with no viewBox and 1 user-unit == 1 CSS pixel.

   `lines` shape: [{ x1, y1, x2, y2, color }] | undefined
*/
export default function LocatorLineOverlay({ lines, opacity = 0.9 }) {
  if (!Array.isArray(lines) || lines.length === 0) return null;
  return (
    <svg
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        // Below the slice/info badges (z 30) but above the viewport canvas.
        zIndex: 26,
        overflow: "visible",
      }}
    >
      {lines.map((ln, i) => (
        <line
          key={`loc-${i}`}
          x1={ln.x1}
          y1={ln.y1}
          x2={ln.x2}
          y2={ln.y2}
          stroke={ln.color || "#FFFF00"}
          strokeWidth={1}
          shapeRendering="crispEdges"
          opacity={opacity}
        />
      ))}
    </svg>
  );
}
