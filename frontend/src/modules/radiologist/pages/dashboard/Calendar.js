import React, { useMemo, useState } from "react";

/**
 * Simple calendar (no external library)
 * - Month view grid like your screenshot
 * - Tabs: Days / Weeks / Months (UI toggle)
 * - Click a date => calls onDateClick(dateObj)
 */
export default function Calendar({ onDateClick, isDark }) {
  const [mode, setMode] = useState("months"); // "days" | "weeks" | "months"
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const title = useMemo(() => {
    const m = cursor.toLocaleString("en-US", { month: "long" });
    return `${m} ${cursor.getFullYear()}`;
  }, [cursor]);

  const monthGrid = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const startWeekday = firstDay.getDay(); // 0=Sun
    const totalDays = lastDay.getDate();

    // Build 6 weeks x 7 days grid
    const cells = [];
    let day = 1;

    for (let row = 0; row < 6; row++) {
      const week = [];
      for (let col = 0; col < 7; col++) {
        const idx = row * 7 + col;
        if (idx < startWeekday || day > totalDays) {
          week.push(null);
        } else {
          week.push(new Date(year, month, day));
          day++;
        }
      }
      cells.push(week);
    }

    return cells;
  }, [cursor]);

  const goPrev = () => {
    if (mode === "months") {
      setCursor((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
      return;
    }
    // For weeks/days modes, you can customize later
    setCursor((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  };

  const goNext = () => {
    if (mode === "months") {
      setCursor((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
      return;
    }
    setCursor((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  };

  const today = new Date();
  const isSameDay = (a, b) =>
    a &&
    b &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const navBtn = {
    ...navBtnStyle,
    background: isDark ? "#334155" : "#fff",
    borderColor: isDark ? "#475569" : "rgba(0,0,0,0.12)",
    color: isDark ? "#f1f5f9" : "#111",
  };

  return (
    <div style={{ width: "100%" }}>
      {/* Header row (Month title + arrows) */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: isDark ? "#f1f5f9" : "#111" }}>{title}</div>

        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={goPrev} style={navBtn}>
            ‹
          </button>
          <button type="button" onClick={goNext} style={navBtn}>
            ›
          </button>
        </div>
      </div>

      {/* Mode tabs */}
      <div style={{ display: "flex", gap: 8, marginTop: 10, marginBottom: 10 }}>
      </div>

      {/* Month grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
        {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((d) => (
          <div key={d} style={{ fontSize: 11, fontWeight: 700, opacity: 0.7, padding: "6px 2px", color: isDark ? "#94a3b8" : undefined }}>
            {d}
          </div>
        ))}

        {monthGrid.flat().map((dateObj, i) => {
          const isToday = isSameDay(dateObj, today);

          return (
            <button
              key={i}
              type="button"
              disabled={!dateObj}
              onClick={() => dateObj && onDateClick?.(dateObj)}
              style={{
                height: 42,
                borderRadius: 8,
                border: `1px solid ${isDark ? "#334155" : "rgba(0,0,0,0.08)"}`,
                background: !dateObj
                  ? "transparent"
                  : isToday
                  ? "#3b82f6"
                  : isDark
                  ? "#0f172a"
                  : "rgba(0,0,0,0.04)",
                color: isToday ? "#fff" : isDark ? "#e2e8f0" : "#111",
                cursor: dateObj ? "pointer" : "default",
                fontWeight: 700,
              }}
              title={dateObj ? dateObj.toDateString() : ""}
            >
              {dateObj ? dateObj.getDate() : ""}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ModeBtn({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "6px 10px",
        borderRadius: 8,
        border: "1px solid rgba(0,0,0,0.12)",
        background: active ? "#111827" : "#fff",
        color: active ? "#fff" : "#111827",
        fontWeight: 700,
        fontSize: 12,
      }}
    >
      {children}
    </button>
  );
}

const navBtnStyle = {
  width: 34,
  height: 30,
  borderRadius: 8,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};