import React, { useState } from "react";

/**
 * Small bar shown over the viewer for plain JPG/PNG X-rays (which have no pixel spacing):
 * shows whether lengths are in pixels or calibrated, and lets the radiologist set the
 * scale from the last Length line they drew (enter its real size in mm).
 */
export default function ImageScaleBar({ spacing, onApply, onClear }) {
  const [open, setOpen] = useState(false);
  const [mm, setMm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const apply = async () => {
    const v = parseFloat(mm);
    if (!(v > 0)) { setMsg("Enter a length greater than zero."); return; }
    setBusy(true);
    setMsg("");
    try {
      const problem = await onApply(v);
      if (problem) setMsg(problem);
      else { setOpen(false); setMm(""); }
    } catch (e) {
      setMsg(e?.message || "Could not set the scale.");
    } finally {
      setBusy(false);
    }
  };

  const chip = {
    background: "rgba(17,24,39,0.88)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 8,
    color: "#e5e7eb", fontSize: 12, padding: "5px 10px", display: "flex", alignItems: "center", gap: 8,
  };
  const btn = (primary) => ({
    background: primary ? "#2563eb" : "rgba(255,255,255,0.08)", color: "#fff",
    border: `1px solid ${primary ? "#60a5fa" : "rgba(255,255,255,0.2)"}`, borderRadius: 6,
    padding: "3px 9px", fontSize: 12, fontWeight: 600, cursor: busy ? "wait" : "pointer",
  });

  return (
    <div
      style={{ position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)", zIndex: 45, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div style={chip}>
        <span style={{ color: spacing ? "#34d399" : "#fbbf24" }}>
          {spacing ? `Scale: ${spacing.toFixed(4)} mm/px` : "Not calibrated — lengths in pixels"}
        </span>
        <button style={btn(false)} onClick={() => { setOpen((o) => !o); setMsg(""); }}>
          {open ? "Close" : "Set scale"}
        </button>
        {spacing ? <button style={btn(false)} onClick={onClear}>Clear scale</button> : null}
      </div>
      {open && (
        <div style={{ ...chip, flexDirection: "column", alignItems: "stretch", maxWidth: 360 }}>
          <div style={{ fontSize: 12, color: "#cbd5e1" }}>
            Draw a <b>Length</b> line (Measure → Length) over something of known size, then enter its real length.
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="number" min="0" step="any" value={mm} placeholder="e.g. 50"
              onChange={(e) => setMm(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") apply(); }}
              style={{ width: 90, padding: "3px 6px", borderRadius: 4, border: "1px solid #374151", background: "#0b1220", color: "#fff" }}
            />
            <span>mm</span>
            <button style={btn(true)} onClick={apply} disabled={busy}>{busy ? "Applying…" : "Apply"}</button>
          </div>
          {msg && <div style={{ color: "#fca5a5", fontSize: 12 }}>{msg}</div>}
        </div>
      )}
    </div>
  );
}

