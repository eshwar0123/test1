import React from "react";

/**
 * Prominent slice counter overlay — centered bottom of viewport.
 * Shows "Slice 24 / 112" in a pill-shaped badge.
 */
export default function SliceCounterOverlay({ current, total }) {
  if (!total || total <= 1) return null;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 14,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 12,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          background: "rgba(0, 0, 0, 0.7)",
          backdropFilter: "blur(6px)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: 20,
          padding: "5px 16px",
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
          fontSize: 13,
          fontWeight: 600,
          color: "#e2e8f0",
          textShadow: "0 1px 3px rgba(0,0,0,0.6)",
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ color: "#94a3b8", fontSize: 11 }}>Slice</span>
        <span style={{ color: "#60a5fa", fontWeight: 700 }}>{current ?? 0}</span>
        <span style={{ color: "#64748b" }}>/</span>
        <span style={{ color: "#cbd5e1" }}>{total}</span>
      </div>
    </div>
  );
}
