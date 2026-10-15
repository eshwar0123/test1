import React from "react";

export const card = {
  background: "#fff", borderRadius: 16, overflow: "hidden",
  boxShadow: "0 8px 32px rgba(15,23,42,0.10)", border: "1px solid #e2e8f0",
};

export const th = {
  textAlign: "left", padding: "14px 20px", fontSize: 12, letterSpacing: 1.5, color: "#64748b",
  background: "#f8fafc", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap", textTransform: "uppercase",
};

export const td = { padding: "16px 20px", fontSize: 14, color: "#0f172a", borderBottom: "1px solid #eef2f7" };

export const pill = (color, bg) => ({
  display: "inline-block", padding: "4px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, color, background: bg,
});

export function EmptyRow({ cols, text }) {
  return (
    <tr>
      <td colSpan={cols} style={{ ...td, textAlign: "center", color: "#94a3b8", padding: 40 }}>{text}</td>
    </tr>
  );
}
