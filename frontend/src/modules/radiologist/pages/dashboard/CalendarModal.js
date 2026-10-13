import React, { useMemo, useState } from "react"

const dayNames = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]

function ymd(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}

function addMonths(date, n) {
  return new Date(date.getFullYear(), date.getMonth() + n, 1)
}

function isSameDay(a, b) {
  return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

/**
 * CalendarModal
 * - modal-only calendar
 * - shows dummy case counts per day (Case: 0..4 by default)
 *
 * Props:
 *  - value: Date (selected date)
 *  - onSelectDate: (date: Date) => void
 *  - month: Date (optional, current month shown)
 *  - onMonthChange: (monthDate: Date) => void (optional)
 *  - caseCounts: Record<"YYYY-MM-DD", number> (optional)
 */
export default function CalendarModal({
  value,
  onSelectDate,
  month,
  onMonthChange,
  caseCounts,
}) {
  const [internalMonth, setInternalMonth] = useState(startOfMonth(value || new Date()))
  const currentMonth = month ? startOfMonth(month) : internalMonth

  const setMonthSafe = (m) => {
    if (onMonthChange) onMonthChange(m)
    else setInternalMonth(m)
  }

  // Dummy case counts if not provided
  const dummyCounts = useMemo(() => {
    const map = {}
    const start = startOfMonth(currentMonth)
    const end = endOfMonth(currentMonth)
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = ymd(d)
      // deterministic "random" dummy value 0..4
      const seed = d.getDate() + (d.getMonth() + 1) * 7
      map[key] = seed % 5 // 0..4
    }
    return map
  }, [currentMonth])

  const counts = caseCounts || dummyCounts

  const grid = useMemo(() => {
    const first = startOfMonth(currentMonth)
    const last = endOfMonth(currentMonth)

    const startDayIndex = first.getDay() // 0..6
    const totalDays = last.getDate()

    // Build 6 weeks * 7 days grid
    const cells = []
    // previous month fill
    const prevMonthLast = new Date(first.getFullYear(), first.getMonth(), 0)
    const prevDays = prevMonthLast.getDate()

    for (let i = 0; i < startDayIndex; i++) {
      const dayNum = prevDays - (startDayIndex - 1 - i)
      const dateObj = new Date(first.getFullYear(), first.getMonth() - 1, dayNum)
      cells.push({ date: dateObj, inMonth: false })
    }

    // current month
    for (let d = 1; d <= totalDays; d++) {
      cells.push({ date: new Date(first.getFullYear(), first.getMonth(), d), inMonth: true })
    }

    // next month fill to complete 42 cells
    while (cells.length < 42) {
      const nextIndex = cells.length - (startDayIndex + totalDays) + 1
      const dateObj = new Date(first.getFullYear(), first.getMonth() + 1, nextIndex)
      cells.push({ date: dateObj, inMonth: false })
    }

    return cells
  }, [currentMonth])

  const title = useMemo(() => {
    return currentMonth.toLocaleString("en-US", { month: "long", year: "numeric" })
  }, [currentMonth])

  return (
    <div style={wrap}>
      <div style={topRow}>
        <div style={monthTitle}>{title}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => setMonthSafe(addMonths(currentMonth, -1))}
            style={navBtn}
            aria-label="Previous month"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => setMonthSafe(addMonths(currentMonth, 1))}
            style={navBtn}
            aria-label="Next month"
          >
            ›
          </button>
        </div>
      </div>

      <div style={dowRow}>
        {dayNames.map((d) => (
          <div key={d} style={dowCell}>{d}</div>
        ))}
      </div>

      <div style={gridWrap}>
        {grid.map((cell) => {
          const key = ymd(cell.date)
          const c = clamp(counts[key] ?? 0, 0, 99)
          const selected = isSameDay(cell.date, value)
          const inMonth = cell.inMonth

          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDate && onSelectDate(cell.date)}
              style={{
                ...dayCell,
                opacity: inMonth ? 1 : 0.35,
                borderColor: selected ? "var(--cui-primary, #1b4b7a)" : "rgba(0,0,0,0.10)",
                boxShadow: selected ? "0 0 0 2px rgba(27,75,122,0.18)" : "none",
                background: selected ? "rgba(27,75,122,0.10)" : "#f8f9fa",
              }}
            >
              <div style={dayNum}>{cell.date.getDate()}</div>

              {/* Case count badge */}
              <div style={caseBadge}>
                Case: <span style={{ fontWeight: 900 }}>{c}</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* styles */
const wrap = {
  width: "100%",
}

const topRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 10,
}

const monthTitle = {
  fontSize: 16,
  fontWeight: 900,
}

const navBtn = {
  width: 36,
  height: 36,
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "#fff",
  fontSize: 18,
  fontWeight: 900,
  cursor: "pointer",
}

const dowRow = {
  display: "grid",
  gridTemplateColumns: "repeat(7, 1fr)",
  gap: 8,
  marginBottom: 8,
}

const dowCell = {
  fontSize: 11,
  fontWeight: 900,
  opacity: 0.55,
  textAlign: "center",
}

const gridWrap = {
  display: "grid",
  gridTemplateColumns: "repeat(7, 1fr)",
  gap: 8,
}

const dayCell = {
  height: 68,
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "#f8f9fa",
  padding: "8px 8px",
  textAlign: "left",
  cursor: "pointer",
  position: "relative",
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
}

const dayNum = {
  fontSize: 16,
  fontWeight: 900,
}

const caseBadge = {
  fontSize: 13,
  fontWeight: 800,
  opacity: 0.85,
  alignSelf: "flex-start",
  padding: "2px 8px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "#fff",
}