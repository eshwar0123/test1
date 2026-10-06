import React, { useCallback, useEffect, useState } from "react";
import {
  CCard,
  CCardBody,
  CCardHeader,
  CButton,
  CModal,
  CModalBody,
  CModalHeader,
  CModalTitle,
} from "@coreui/react";

import Calendar from "./Calendar";
import CalendarModal from "./CalendarModal";
import ScanQueueDetailsModal from "./ScanQueueDetailsModal";

const OUTER_CARD_BG_SOLID = "rgba(30, 45, 80, 0.75)";
const CALENDAR_OUTER_DARK_BG = "rgba(30, 65, 65, 0.75)";
const INNER_CARD_BG = "rgba(41, 73, 111, 0.6)";
const INNER_CARD_BG_HOVER = "rgba(49, 85, 127, 0.75)";
const INNER_CARD_BORDER = "rgba(159, 196, 255, 0.22)";
const LIGHT_TEXT = "#f4f8ff";
const MUTED_TEXT = "#c3d3ec";
const SUBTLE_TEXT = "#9fb3d4";

// Light-mode glass card styles (matches org dashboard)
const GLASS_CARD = {
  background: "rgba(255,255,255,0.62)",
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
  border: "1px solid rgba(200,222,255,0.50)",
  boxShadow: "0 8px 32px rgba(30,80,160,0.10)",
};
// Scans outer card — soft mint-green tint
const GLASS_CARD_GREEN = {
  background: "rgba(209, 250, 229, 0.52)",
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
  border: "1px solid rgba(110, 231, 183, 0.45)",
  boxShadow: "0 8px 32px rgba(16,185,129,0.10)",
};
// Calendar outer card — soft sky-blue tint
const GLASS_CARD_BLUE = {
  background: "rgba(219, 234, 254, 0.52)",
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
  border: "1px solid rgba(147, 197, 253, 0.45)",
  boxShadow: "0 8px 32px rgba(59,130,246,0.10)",
};
// Inner sub-cards (Due Today, Upcoming) — same transparent blue tint
const GLASS_INNER = {
  background: "rgba(219, 234, 254, 0.38)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  border: "1px solid rgba(147, 197, 253, 0.40)",
};
// Mini stat cards (CT, MRI, XRAY…) — transparent blue tint
const GLASS_MINI = {
  background: "rgba(219, 234, 254, 0.38)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  border: "1px solid rgba(147, 197, 253, 0.40)",
};
const GLASS_INNER_HOVER = "rgba(219,234,254,0.62)";

const EMPTY_QUEUE = { total: 0, critical: 0, urgent: 0, stat: 0, routine: 0, items: [] };
const EMPTY_SUMMARY = {
  total: 0, ct: 0, mri: 0, xray: 0, other: 0,
  tat: {
    urgent:  { target_hours: 4,  avg_hours: null, done: 0, delta_hours: null },
    routine: { target_hours: 24, avg_hours: null, done: 0, delta_hours: null },
  },
};

const MODALITY_ROWS = [
  { key: "mri",   code: "MRI",   name: "Magnetic Resonance Imaging", color: "#8b5cf6" },
  { key: "xray",  code: "XR",    name: "X-Ray / Radiography",        color: "#22b8d8" },
  { key: "ct",    code: "CT",    name: "Computed Tomography",        color: "#3b82f6" },
  { key: "other", code: "OTHER", name: "Other",                      color: "#94a3b8" },
];

const TAT_ROWS = [
  { key: "urgent",  label: "Critical / Urgent", targetLabel: "≤ 4 hr" },
  { key: "routine", label: "Routine",           targetLabel: "≤ 24 hr" },
];

const readAuth = () => {
  try { return JSON.parse(localStorage.getItem("auth") || "{}"); } catch { return {}; }
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const fmtTime = (iso) =>
  iso ? new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "—";

// Backend queue item → shape ScanQueueDetailsModal expects
const toModalItem = (it) => {
  const d = it.scan_date ? new Date(it.scan_date) : null;
  return {
    id: it.case_id,
    case_id: it.case_id,
    caseNumber: it.case_id,
    date: d ? d.toISOString().slice(0, 10) : "—",
    day: d ? DAYS[d.getDay()] : "",
    scanType: it.scan_type,
    bodyPart: it.body_part,
    fromTime: fmtTime(it.scan_date),
    endTime: "—",
    priority: it.priority_type,
  };
};

export default function Dashboard() {
  // Detect dark mode from parent .radiology-app.dark class
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const el = document.querySelector('.radiology-app');
    if (!el) return;
    const obs = new MutationObserver(() => setIsDark(el.classList.contains('dark')));
    setIsDark(el.classList.contains('dark'));
    obs.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  const [scanFilter, setScanFilter] = useState("overall");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [queue, setQueue] = useState({ due_today: EMPTY_QUEUE, upcoming: EMPTY_QUEUE });

  const fetchSummary = useCallback(async () => {
    const { userId } = readAuth();
    if (!userId) return;
    const qs = new URLSearchParams({ user_id: userId, range: scanFilter });
    if (scanFilter === "custom") {
      if (!fromDate || !toDate) return;
      qs.set("date_from", fromDate);
      qs.set("date_to", toDate);
    }
    try {
      const res = await fetch(`/api/radiology/dashboard/assigned-summary?${qs}`);
      const json = await res.json();
      if (json.success) setSummary({ ...EMPTY_SUMMARY, ...json.data });
    } catch (_) {}
  }, [scanFilter, fromDate, toDate]);

  const fetchQueue = useCallback(async () => {
    const { userId } = readAuth();
    if (!userId) return;
    try {
      const res = await fetch(`/api/radiology/dashboard/scans-queue?user_id=${userId}`);
      const json = await res.json();
      if (json.success) setQueue(json.data);
    } catch (_) {}
  }, []);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);
  useEffect(() => {
    fetchQueue();
    const id = setInterval(() => { fetchQueue(); fetchSummary(); }, 30000);
    return () => clearInterval(id);
  }, [fetchQueue, fetchSummary]);

  const dueTodayTotal = queue.due_today.total;
  const todayLabel = new Date()
    .toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" })
    .replace(",", "");

  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [notes, setNotes] = useState("");
  const [selectedDate, setSelectedDate] = useState(null);
  const [open, setOpen] = useState(false);
  const [availabilitySlots, setAvailabilitySlots] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const fetchAvailability = useCallback(async () => {
    const { userId } = readAuth();
    if (!userId) return;
    try {
      const res = await fetch(`/api/radiology/availability?user_id=${userId}`);
      const json = await res.json();
      if (json.success) setAvailabilitySlots(json.data || []);
    } catch (_) {}
  }, []);

  useEffect(() => {
    if (open) fetchAvailability();
  }, [open, fetchAvailability]);
  const [selectedQueueCard, setSelectedQueueCard] = useState(null);
  const [queueModalOpen, setQueueModalOpen] = useState(false);

  const toYMD = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const handleSaveAvailability = async () => {
    if (!selectedDate) return;
    setSaveError("");
    setIsSaving(true);
    const { userId } = readAuth();
    if (!userId) { setSaveError("User not logged in."); setIsSaving(false); return; }
    try {
      const res = await fetch("/api/radiology/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          available_date: toYMD(selectedDate),
          from_time: startTime,
          to_time: endTime,
          notes: notes || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setSaveError(json.detail || "Failed to save."); }
      else { await fetchAvailability(); setStartTime("09:00"); setEndTime("17:00"); setNotes(""); }
    } catch (e) {
      setSaveError("Network error.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveAvailability = async (availabilityId) => {
    try {
      await fetch(`/api/radiology/availability/${availabilityId}`, { method: "DELETE" });
      await fetchAvailability();
    } catch (_) {}
  };

  const onDateClick = (dateObj) => {
    setSelectedDate(dateObj);
    setStartTime("09:00");
    setEndTime("17:00");
    setNotes("");
    setSaveError("");
    setOpen(true);
  };

  // "Due today" click → open modal with all pending items
  const handleDueTodayClick = () => {
    setSelectedQueueCard({
      queueType: "pending",
      modality: "ALL",
      count: dueTodayTotal,
      items: queue.due_today.items.map(toModalItem),
    });
    setQueueModalOpen(true);
  };

  return (
    <div style={{
      width: "100%",
      minHeight: "calc(100vh - 80px)",
      margin: 0,
      padding: "0.5rem 1rem",
      position: "relative",
      background: "transparent",
      overflow: "auto",
      boxSizing: "border-box",
    }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.5fr 1fr",
          gap: 14,
          alignItems: "stretch",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        {/* LEFT COLUMN */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, height: "100%" }}>

          {/* ── SCANS CARD ── */}
          <div style={{ ...scansOuterStyle, ...(isDark ? { background: OUTER_CARD_BG_SOLID } : GLASS_CARD_BLUE) }}>
            <div style={{ ...scansOuterTitleStyle, color: isDark ? "#fff" : "#1e3a5f" }}>Scans</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10, flex: 1 }}>

              {/* Due Today */}
              <button
                type="button"
                onClick={handleDueTodayClick}
                style={{ ...scanInnerCardStyle, ...(isDark ? { background: INNER_CARD_BG, borderColor: INNER_CARD_BORDER } : { ...GLASS_INNER, backdropFilter: "blur(10px)" }) }}
                onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? INNER_CARD_BG_HOVER : GLASS_INNER_HOVER; e.currentTarget.style.transform = "translateY(-2px)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = isDark ? INNER_CARD_BG : GLASS_INNER.background; e.currentTarget.style.transform = "translateY(0)"; }}
              >
                <div style={{ position: "absolute", top: -22, right: -22, width: 80, height: 80, borderRadius: "50%", background: isDark ? "rgba(255,255,255,0.06)" : "rgba(19,78,94,0.06)" }} />
                <div style={{ fontSize: 11, fontWeight: 600, color: isDark ? MUTED_TEXT : "#6b7280", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.8px" }}>{todayLabel}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: isDark ? LIGHT_TEXT : "#111827", marginBottom: 10 }}>Due today</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginBottom: 8 }}>
                  <span style={{ fontSize: 36, fontWeight: 700, color: isDark ? LIGHT_TEXT : "#134e5e" }}>{dueTodayTotal}</span>
                  <span style={{ fontSize: 14, color: isDark ? MUTED_TEXT : "#6b7280" }}>scans</span>
                </div>
                <QueuePills queue={queue.due_today} />
                <div style={{ ...clickHintStyle, color: "#9ca3af" }}>Tap to view queue ›</div>
              </button>

            </div>
          </div>

          {/* CALENDAR */}
          <CCard style={{
            ...calendaroutCardStyle,
            ...(isDark ? { background: CALENDAR_OUTER_DARK_BG } : GLASS_CARD_BLUE),
            flex: 1,
            padding: "16px 20px 20px",
            display: "flex",
            flexDirection: "column",
          }}>
            <div style={{ ...cardHeaderStyle, color: isDark ? "#fff" : "#1e3a5f" }}>Calendar</div>
            <div style={{
              borderRadius: 12,
              background: isDark ? INNER_CARD_BG : "rgba(255,255,255,0.42)",
              padding: "16px 18px",
              flex: 1,
              backdropFilter: isDark ? "none" : "blur(12px)",
              WebkitBackdropFilter: isDark ? "none" : "blur(12px)",
              border: isDark ? "none" : "1px solid rgba(147,197,253,0.35)",
              boxShadow: isDark ? "inset 0 0 0 1px rgba(255,255,255,0.08)" : "none",
            }}>
              <Calendar onDateClick={onDateClick} isDark={isDark} />
            </div>
          </CCard>

        </div>{/* end left column */}

        {/* RIGHT COLUMN */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, alignSelf: "stretch", height: "100%" }}>
          <CCard style={{ ...(isDark ? { background: OUTER_CARD_BG_SOLID } : GLASS_CARD_BLUE), borderRadius: 14, overflow: "hidden", flex: 1, display: "flex", flexDirection: "column" }}>
            <div style={{ ...cardHeaderStyleRight, color: isDark ? "white" : "#1e3a5f" }}>
              <span>Assigned Scans</span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <select value={scanFilter} onChange={(e) => setScanFilter(e.target.value)} style={selectStyle}>
                  <option value="overall">Overall</option>
                  <option value="today">Today</option>
                  <option value="custom">Custom</option>
                </select>
                {scanFilter === "custom" && (
                  <>
                    <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={dateInputStyle} />
                    <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} style={dateInputStyle} />
                  </>
                )}
              </div>
            </div>

            <CCardBody style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>
              {/* Stats row */}
              <div style={{ display: "grid", gridTemplateColumns: "auto repeat(4, minmax(0, 1fr))", gap: 8, alignItems: "stretch" }}>
                <div style={{ ...totalValueCardStyle, ...(isDark ? { background: INNER_CARD_BG, borderColor: INNER_CARD_BORDER } : GLASS_MINI) }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: isDark ? LIGHT_TEXT : "#111827", letterSpacing: "0.3px" }}>Total</div>
                  <div style={{ fontSize: 26, fontWeight: 900, color: isDark ? LIGHT_TEXT : "#111827", lineHeight: 1, marginTop: 6 }}>{summary.total}</div>
                </div>
                <SmallMiniStat label="CT" value={summary.ct} isDark={isDark} />
                <SmallMiniStat label="MRI" value={summary.mri} isDark={isDark} />
                <SmallMiniStat label="XRAY" value={summary.xray} isDark={isDark} />
                <SmallMiniStat label="OTHER" value={summary.other} isDark={isDark} />
              </div>

              {/* Cases by modality */}
              <SectionTitle isDark={isDark}>Cases by modality</SectionTitle>
              <div style={panelStyle(isDark)}>
                {MODALITY_ROWS.map((m) => {
                  const count = summary[m.key] || 0;
                  const pct = summary.total ? Math.round((count / summary.total) * 100) : 0;
                  return (
                    <div key={m.key} style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 4px", borderBottom: isDark ? "1px solid rgba(159,196,255,0.12)" : "1px solid rgba(255,255,255,0.7)" }}>
                      <span style={{ minWidth: 54, textAlign: "center", fontFamily: "monospace", fontSize: 12, fontWeight: 700, padding: "6px 8px", borderRadius: 8, color: m.color, background: `${m.color}26` }}>{m.code}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: isDark ? LIGHT_TEXT : "#111827", marginBottom: 6 }}>{m.name}</div>
                        <div style={{ height: 4, borderRadius: 4, background: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.07)" }}>
                          <div style={{ width: `${pct}%`, height: "100%", borderRadius: 4, background: m.color, transition: "width .4s ease" }} />
                        </div>
                      </div>
                      <span style={{ fontSize: 15, fontWeight: 800, color: isDark ? LIGHT_TEXT : "#111827", minWidth: 18, textAlign: "right" }}>{count}</span>
                      <span style={{ fontSize: 15, fontWeight: 700, color: m.color, minWidth: 40, textAlign: "right" }}>{pct}%</span>
                    </div>
                  );
                })}
              </div>

              {/* TAT performance */}
              <SectionTitle isDark={isDark}>TAT performance</SectionTitle>
              <div style={{ ...panelStyle(isDark), display: "flex", flexDirection: "column", gap: 8, padding: "10px 12px" }}>
                {TAT_ROWS.map((r) => {
                  const t = summary.tat?.[r.key] || {};
                  const hasAvg = t.avg_hours !== null && t.avg_hours !== undefined;
                  const hasDelta = t.delta_hours !== null && t.delta_hours !== undefined;
                  const over = hasAvg && t.avg_hours > t.target_hours;
                  const worsening = hasDelta && t.delta_hours > 0;
                  // green: within target & not slowing · amber: within target but slowing · red: over target
                  const accent = !hasAvg ? "#94a3b8" : over ? "#ef4444" : worsening ? "#f5b73b" : "#5fd0a0";
                  return (
                    <div key={r.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderRadius: 12, borderLeft: `4px solid ${accent}`, background: `${accent}22` }}>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: isDark ? LIGHT_TEXT : "#111827" }}>{r.label}</div>
                        <div style={{ fontSize: 13, color: isDark ? SUBTLE_TEXT : "#94a3b8", marginTop: 3 }}>Target {r.targetLabel}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontFamily: "monospace", fontSize: 20, fontWeight: 800, color: accent }}>{hasAvg ? `${t.avg_hours}h` : "–"}</div>
                        <div style={{ fontSize: 13, color: isDark ? SUBTLE_TEXT : "#94a3b8", marginTop: 3 }}>
                          {hasDelta && t.delta_hours !== 0 ? `${t.delta_hours < 0 ? "↓" : "↑"} ${Math.abs(t.delta_hours)}` : "\u00A0"}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CCardBody>
          </CCard>
        </div>
      </div>

      {/* QUEUE MODAL */}
      <ScanQueueDetailsModal
        visible={queueModalOpen}
        onClose={() => setQueueModalOpen(false)}
        selectedData={selectedQueueCard}
        isDark={isDark}
      />

      {/* CALENDAR MODAL — 3-column: Availability | Calendar | Time+Notes */}
      <style>{`.calendar-big-modal .modal-dialog { max-width: 1290px !important; width: 95vw !important; }`}</style>
      <CModal visible={open} onClose={() => setOpen(false)} alignment="center" size="xl" className="calendar-big-modal" scrollable>
        <CModalHeader style={{ paddingBottom: 10, background: isDark ? "#1f2d45" : "#fff", borderBottomColor: isDark ? "rgba(159,196,255,0.14)" : "#e5e7eb" }}>
          <CModalTitle style={{ color: isDark ? "#f4f8ff" : "#111827" }}>{selectedDate ? selectedDate.toDateString() : "Select Date"}</CModalTitle>
        </CModalHeader>
        <CModalBody style={{ padding: "16px 20px 20px", overflowY: "auto", maxHeight: "82vh", background: isDark ? "#1f2d45" : "#fff" }}>
          <div style={{ display: "grid", gridTemplateColumns: "220px 1fr 320px", gap: 14, minHeight: "600px" }}>

            {/* LEFT — Availability for selected date */}
            <div style={{ border: isDark ? "1px solid rgba(159,196,255,0.14)" : "1px solid #e2e8f0", borderRadius: 14, padding: 16, background: isDark ? "#29496f" : "#f8fafc", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontWeight: 900, fontSize: 14, color: isDark ? "#f4f8ff" : "#0f172a", marginBottom: 4 }}>
                {selectedDate
                  ? `Availability — ${selectedDate.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" })}`
                  : "Availability"}
              </div>

              {selectedDate ? (
                <>
                  {availabilitySlots
                    .filter((s) => s.available_date === toYMD(selectedDate))
                    .map((slot) => (
                      <div key={slot.availability_id} style={{ border: isDark ? "1px solid rgba(159,196,255,0.14)" : "1px solid #e2e8f0", borderRadius: 10, padding: "10px 12px", background: isDark ? "#1e3a5f" : "#fff" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color: isDark ? "#f4f8ff" : "#0f172a" }}>
                            {selectedDate.toLocaleDateString("en-US", { day: "numeric", month: "long" })}
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#dcfce7", color: "#16a34a", border: "1px solid #bbf7d0" }}>
                            Available
                          </span>
                        </div>
                        <div style={{ fontSize: 13, color: isDark ? "#94a3b8" : "#475569", fontWeight: 600 }}>
                          {slot.from_time?.slice(0, 5)} to {slot.to_time?.slice(0, 5)}
                        </div>
                        {slot.notes ? <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>{slot.notes}</div> : null}
                        <button
                          type="button"
                          onClick={() => handleRemoveAvailability(slot.availability_id)}
                          style={{ marginTop: 8, fontSize: 11, fontWeight: 700, color: "#ef4444", border: "1px solid #fca5a5", borderRadius: 6, padding: "3px 10px", background: "#fff", cursor: "pointer" }}
                        >
                          Remove
                        </button>
                      </div>
                    ))
                  }
                  <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                    Set time &amp; notes on the right, then click Save.
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 8 }}>
                  Click a date on the calendar to see availability.
                </div>
              )}
            </div>

            {/* CENTER — Calendar */}
            <div style={{ border: isDark ? "1px solid rgba(159,196,255,0.14)" : "1px solid #e2e8f0", borderRadius: 14, padding: 20, background: isDark ? "#29496f" : "#fff" }}>
              <CalendarModal value={selectedDate} onSelectDate={(d) => setSelectedDate(d)} />
            </div>

            {/* RIGHT — Time + Notes */}
            <div style={{ border: isDark ? "1px solid rgba(159,196,255,0.14)" : "1px solid #e2e8f0", borderRadius: 14, padding: "20px 20px", background: isDark ? "#29496f" : "#f8fafc", display: "flex", flexDirection: "column" }}>
              <div style={{ fontWeight: 900, fontSize: 15, color: isDark ? "#f4f8ff" : "#0f172a", marginBottom: 16 }}>Time &amp; Notes</div>

              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: isDark ? "#94a3b8" : "#64748b", marginBottom: 6 }}>Start Time</div>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  style={modalInputStyle}
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: isDark ? "#94a3b8" : "#64748b", marginBottom: 6 }}>End Time</div>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  style={modalInputStyle}
                />
              </div>

              <div style={{ marginBottom: 16, flex: 1, display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: isDark ? "#94a3b8" : "#64748b", marginBottom: 6 }}>Notes</div>
                <textarea
                  rows={6}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add notes..."
                  style={{ ...modalInputStyle, resize: "none", flex: 1, minHeight: 160 }}
                />
              </div>

              {saveError && (
                <div style={{ fontSize: 12, color: "#ef4444", marginBottom: 8 }}>{saveError}</div>
              )}
              <div style={{ display: "flex", gap: 10, marginTop: "auto" }}>
                <CButton color="primary" style={{ flex: 1 }} onClick={handleSaveAvailability} disabled={isSaving || !selectedDate}>
                  {isSaving ? "Saving…" : "Save"}
                </CButton>
                <CButton color="secondary" variant="outline" onClick={() => setOpen(false)} style={{ flex: 1 }}>Close</CButton>
              </div>
            </div>

          </div>
        </CModalBody>
      </CModal>

    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function QueuePills({ queue }) {
  if (!queue.total) {
    return (
      <div style={{ display: "flex", gap: 6 }}>
        <div style={{ ...pillStyle, background: "rgba(107,114,128,0.14)", color: "#6b7280" }}>No scans</div>
      </div>
    );
  }
  const pills = [
    ["stat", "stat", "#7c3aed"],
    ["critical", "critical", "#ef4444"],
    ["urgent", "urgent", "#f59e0b"],
    ["routine", "routine", "#3b82f6"],
  ].filter(([k]) => queue[k] > 0);
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {pills.map(([k, label, c]) => (
        <div key={k} style={{ ...pillStyle, background: `${c}1a`, color: c }}>
          <span style={{ ...dotStyle, background: c }} />{queue[k]} {label}
        </div>
      ))}
    </div>
  );
}

function SectionTitle({ children, isDark }) {
  return (
    <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: isDark ? LIGHT_TEXT : "#111827", marginTop: 4 }}>
      {children}
    </div>
  );
}

const panelStyle = (isDark) => ({
  borderRadius: 16,
  padding: "8px 14px",
  background: isDark ? INNER_CARD_BG : "rgba(255,255,255,0.42)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  border: isDark ? `1px solid ${INNER_CARD_BORDER}` : "1px solid rgba(255,255,255,0.8)",
});

function SmallMiniStat({ label, value, isDark }) {
  const accentMap = {
    CT:    { dotColor: "#2563eb"   },
    MRI:   { dotColor: "#7c3aed"  },
    XRAY:  { dotColor: "#ea580c"  },
    OTHER: { dotColor: "#475569"  },
  };
  const accent = accentMap[label] || accentMap.CT;

  return (
    <div style={{ padding: "12px 14px", borderRadius: 12, ...(isDark ? { background: INNER_CARD_BG, border: `1px solid ${INNER_CARD_BORDER}` } : GLASS_MINI), minWidth: 0, minHeight: 70, display: "flex", flexDirection: "column", justifyContent: "space-between", boxShadow: isDark ? "0 1px 4px rgba(0,0,0,0.2)" : "0 1px 6px rgba(30,80,160,0.07)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: accent.dotColor, flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 800, color: isDark ? LIGHT_TEXT : "#111827", letterSpacing: "0.3px" }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 900, color: isDark ? LIGHT_TEXT : "#111827", lineHeight: 1, marginTop: 6 }}>{value}</div>
    </div>
  );
}

function MiniQueueCard({ modality, value, onClick, isDark }) {
  const accentMap = {
    CT:    { bg: isDark ? INNER_CARD_BG : "linear-gradient(135deg, #ffffff 0%)", border: isDark ? INNER_CARD_BORDER : "#ffffff", text: isDark ? "#dbeafe" : "#1d4ed8", dot: isDark ? "#60a5fa" : "#315efb", shadowHover: "0 6px 18px rgba(49,94,251,0.18)", shadowClick: "0 1px 4px rgba(49,94,251,0.10)" },
    MRI:   { bg: isDark ? INNER_CARD_BG : "linear-gradient(135deg, #ffffff 0%)", border: isDark ? INNER_CARD_BORDER : "#ffffff", text: isDark ? "#e9d5ff" : "#0369a1", dot: isDark ? "#a78bfa" : "#0ea5e9", shadowHover: "0 6px 18px rgba(14,165,233,0.18)", shadowClick: "0 1px 4px rgba(14,165,233,0.10)" },
    XRAY:  { bg: isDark ? INNER_CARD_BG : "linear-gradient(135deg, #ffffff 0%)", border: isDark ? INNER_CARD_BORDER : "#ffffff", text: isDark ? "#fde68a" : "#7e22ce", dot: isDark ? "#f59e0b" : "#a855f7", shadowHover: "0 6px 18px rgba(168,85,247,0.18)", shadowClick: "0 1px 4px rgba(168,85,247,0.10)" },
    OTHER: { bg: isDark ? INNER_CARD_BG : "linear-gradient(135deg, #ffffff 0%)", border: isDark ? INNER_CARD_BORDER : "#ffffff", text: isDark ? "#fdba74" : "#c2410c", dot: isDark ? "#f97316" : "#f97316", shadowHover: "0 6px 18px rgba(249,115,22,0.18)", shadowClick: "0 1px 4px rgba(249,115,22,0.10)" },
  };
  const accent = accentMap[modality] || accentMap.CT;

  return (
    <button
      type="button"
      onClick={onClick}
      style={{ border: `1.0px solid ${accent.border}`, borderRadius: 12, background: accent.bg, padding: "16px 14px", textAlign: "left", display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "space-between", cursor: "pointer", boxShadow: isDark ? "0 2px 8px rgba(0,0,0,0.2)" : "0 2px 8px rgba(0,0,0,0.06)", transition: "transform .15s ease, box-shadow .15s ease", width: "100%", minHeight: 90 }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = accent.shadowHover; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = isDark ? "0 2px 8px rgba(0,0,0,0.2)" : "0 2px 8px rgba(0,0,0,0.06)"; }}
      onMouseDown={(e) => { e.currentTarget.style.transform = "translateY(1px)"; e.currentTarget.style.boxShadow = accent.shadowClick; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = accent.shadowHover; }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: accent.dot, flexShrink: 0, boxShadow: `0 0 6px ${accent.dot}88` }} />
        <span style={{ fontSize: 11, fontWeight: 800, color: accent.text, letterSpacing: "0.3px" }}>{modality}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 900, color: isDark ? LIGHT_TEXT : "#111827", lineHeight: 1, marginTop: 10 }}>{value}</div>
    </button>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

// Outer teal-forest card wrapping the two inner scan sub-cards


const scansOuterTitleStyle = {
  fontSize: 18,
  fontWeight: 600,
  color: "#fff",
  marginBottom: 12,
};

// Inner frosted glass sub-card (button)
const scanInnerCardStyle = {
  background: INNER_CARD_BG,
  border: `1px solid ${INNER_CARD_BORDER}`,
  borderRadius: 12,
  padding: "14px 16px",
  display: "flex",
  flexDirection: "column",
  justifyContent: "flex-start",
  cursor: "pointer",
  position: "relative",
  overflow: "hidden",
  textAlign: "left",
  transition: "background 0.2s ease, transform 0.15s ease",
  boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
};

const pillStyle = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  fontSize: 12,
  fontWeight: 600,
  padding: "3px 9px",
  borderRadius: 20,
};

const dotStyle = {
  width: 6,
  height: 6,
  borderRadius: "50%",
  display: "inline-block",
};

const clickHintStyle = {
  fontSize: 14,
  color: "rgba(255,255,255,0.6)",
  marginTop: 8,
  fontStyle: "italic",
};

// Total value card — teal-to-crimson gradient
const totalValueCardStyle = {
  padding: "12px 14px",
  borderRadius: 12,
  background: INNER_CARD_BG,
  border: `1px solid ${INNER_CARD_BORDER}`,
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  minWidth: 72,
  minHeight: 70,
  boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
};

const scansOuterStyle = {
  borderRadius: 16,
  padding: 16,
  display: "flex",
  flexDirection: "column",
  gap: 0,
  boxShadow: "0 8px 24px rgba(30,80,160,0.10)",
};



// Glass card constants (used in light mode — see GLASS_CARD above)
const cardcolorleft  = GLASS_CARD;
const cardcolorright = GLASS_CARD;

const calendarCardStyle = {
  borderRadius: 14,
  overflow: "hidden",
  height: 420,
  width: "94%",
  marginLeft: 29,
  background: INNER_CARD_BG,
};

const calendaroutCardStyle = {
  borderRadius: 14,
  overflow: "hidden",
  minHeight: 300,
  boxShadow: "0 16px 32px rgba(3,10,24,0.28)",
};


const cardHeaderStyle = {
  display: "flex",
  alignItems: "center",
  gap: 20,
  fontSize: 18,
  fontWeight: 700,
  marginTop: 15,
  marginBottom: 20,
  marginLeft: 15,
  color: "#fff",
};

const cardHeaderStyleRight = {
  display: "flex",
  alignItems: "center",
  gap: 20,
  fontSize: 18,
  fontWeight: 700,
  marginTop: 15,
  marginBottom: 20,
  marginLeft: 15,
  color: "white",
};

const selectStyle = {
  padding: "6px 10px",
  borderRadius: 10,
  border: "1px solid rgba(147,197,253,0.55)",
  background: "rgba(219,234,254,0.45)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  fontWeight: 800,
  fontSize: 12,
  outline: "none",
  cursor: "pointer",
  color: "#1e3a5f",
};

const dateInputStyle = {
  padding: "6px 10px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "#fff",
  fontWeight: 800,
  fontSize: 12,
  outline: "none",
};

const modalInputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  fontWeight: 600,
};

function daysBetween(fromYYYYMMDD, toYYYYMMDD) {
  const a = new Date(fromYYYYMMDD + "T00:00:00");
  const b = new Date(toYYYYMMDD + "T00:00:00");
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
