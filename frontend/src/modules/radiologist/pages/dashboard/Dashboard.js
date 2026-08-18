import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import BodyScanOverview from "./BodyScanOverview";
import ScanQueueDetailsModal from "./ScanQueueDetailsModal";
import InteractiveBody from "./InteractiveBody";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

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

const MODALITIES = [
  { key: "CT", label: "CT" },
  { key: "MRI", label: "MRI" },
  { key: "XRAY", label: "XRAY" },
  { key: "OTHER", label: "OTHER" },
];

const queueData = {
  pending: {
    CT: {
      modality: "CT",
      count: 4,
      items: [
        { id: "P-CT-001", date: "2026-03-09", day: "Monday", scanType: "CT", fromTime: "08:00 AM", endTime: "12:00 PM", bodyPart: "Head", caseNumber: "CASE-CT-1001" },
        { id: "P-CT-002", date: "2026-03-10", day: "Tuesday", scanType: "CT", fromTime: "09:00 AM", endTime: "01:00 PM", bodyPart: "Chest", caseNumber: "CASE-CT-1002" },
        { id: "P-CT-003", date: "2026-03-11", day: "Wednesday", scanType: "CT", fromTime: "10:00 AM", endTime: "02:00 PM", bodyPart: "Abdomen", caseNumber: "CASE-CT-1003" },
        { id: "P-CT-004", date: "2026-03-12", day: "Thursday", scanType: "CT", fromTime: "01:00 PM", endTime: "05:00 PM", bodyPart: "Spine", caseNumber: "CASE-CT-1004" },
      ],
    },
    MRI: {
      modality: "MRI",
      count: 3,
      items: [
        { id: "P-MRI-001", date: "2026-03-09", day: "Monday", scanType: "MRI", fromTime: "08:30 AM", endTime: "12:30 PM", bodyPart: "Brain", caseNumber: "CASE-MRI-2001" },
        { id: "P-MRI-002", date: "2026-03-10", day: "Tuesday", scanType: "MRI", fromTime: "11:00 AM", endTime: "03:00 PM", bodyPart: "Knee", caseNumber: "CASE-MRI-2002" },
        { id: "P-MRI-003", date: "2026-03-11", day: "Wednesday", scanType: "MRI", fromTime: "02:00 PM", endTime: "06:00 PM", bodyPart: "Shoulder", caseNumber: "CASE-MRI-2003" },
      ],
    },
    XRAY: {
      modality: "XRAY",
      count: 2,
      items: [
        { id: "P-XRAY-001", date: "2026-03-09", day: "Monday", scanType: "XRAY", fromTime: "09:00 AM", endTime: "01:00 PM", bodyPart: "Hand", caseNumber: "CASE-XRAY-3001" },
        { id: "P-XRAY-002", date: "2026-03-10", day: "Tuesday", scanType: "XRAY", fromTime: "01:00 PM", endTime: "05:00 PM", bodyPart: "Leg", caseNumber: "CASE-XRAY-3002" },
      ],
    },
    OTHER: {
      modality: "OTHER",
      count: 1,
      items: [
        { id: "P-OTH-001", date: "2026-03-11", day: "Wednesday", scanType: "OTHER", fromTime: "03:00 PM", endTime: "07:00 PM", bodyPart: "Whole Body", caseNumber: "CASE-OTH-4001" },
      ],
    },
  },

  assigned: {
    CT: {
      modality: "CT",
      count: 4,
      items: [
        { id: "A-CT-001", date: "2026-03-09", day: "Monday", scanType: "CT", fromTime: "07:00 AM", endTime: "11:00 AM", bodyPart: "Abdomen", caseNumber: "CASE-ACT-5001" },
        { id: "A-CT-002", date: "2026-03-10", day: "Tuesday", scanType: "CT", fromTime: "10:30 AM", endTime: "02:30 PM", bodyPart: "Chest", caseNumber: "CASE-ACT-5002" },
        { id: "A-CT-003", date: "2026-03-11", day: "Wednesday", scanType: "CT", fromTime: "01:30 PM", endTime: "05:30 PM", bodyPart: "Head", caseNumber: "CASE-ACT-5003" },
        { id: "A-CT-004", date: "2026-03-12", day: "Thursday", scanType: "CT", fromTime: "09:30 AM", endTime: "01:30 PM", bodyPart: "Pelvis", caseNumber: "CASE-ACT-5004" },
      ],
    },
    MRI: {
      modality: "MRI",
      count: 3,
      items: [
        { id: "A-MRI-001", date: "2026-03-09", day: "Monday", scanType: "MRI", fromTime: "08:00 AM", endTime: "12:00 PM", bodyPart: "Spine", caseNumber: "CASE-AMRI-6001" },
        { id: "A-MRI-002", date: "2026-03-10", day: "Tuesday", scanType: "MRI", fromTime: "12:00 PM", endTime: "04:00 PM", bodyPart: "Brain", caseNumber: "CASE-AMRI-6002" },
        { id: "A-MRI-003", date: "2026-03-11", day: "Wednesday", scanType: "MRI", fromTime: "02:00 PM", endTime: "06:00 PM", bodyPart: "Shoulder", caseNumber: "CASE-AMRI-6003" },
      ],
    },
    XRAY: {
      modality: "XRAY",
      count: 2,
      items: [
        { id: "A-XRAY-001", date: "2026-03-09", day: "Monday", scanType: "XRAY", fromTime: "07:30 AM", endTime: "11:30 AM", bodyPart: "Knee", caseNumber: "CASE-AXRAY-7001" },
        { id: "A-XRAY-002", date: "2026-03-10", day: "Tuesday", scanType: "XRAY", fromTime: "11:00 AM", endTime: "03:00 PM", bodyPart: "Chest", caseNumber: "CASE-AXRAY-7002" },
      ],
    },
    OTHER: {
      modality: "OTHER",
      count: 1,
      items: [
        { id: "A-OTH-001", date: "2026-03-11", day: "Wednesday", scanType: "OTHER", fromTime: "04:00 PM", endTime: "08:00 PM", bodyPart: "Whole Body", caseNumber: "CASE-AOTH-8001" },
      ],
    },
  },
};

// Combine pending + assigned totals for the "Due today" and "Upcoming" cards
const dueTodayTotal = Object.values(queueData.pending).reduce((sum, m) => sum + m.count, 0);

// Upcoming = next 3 days assigned cases (Mar 14, 15, 16)
const upcomingAssignedData = [
  { id: "UP-CT-001",    date: "2026-03-14", day: "Saturday", scanType: "CT",    fromTime: "08:00 AM", endTime: "12:00 PM", bodyPart: "Chest",      caseNumber: "CASE-UP-CT-001"  },
  { id: "UP-MRI-001",   date: "2026-03-14", day: "Saturday", scanType: "MRI",   fromTime: "09:30 AM", endTime: "01:30 PM", bodyPart: "Brain",      caseNumber: "CASE-UP-MRI-001" },
  { id: "UP-XRAY-001",  date: "2026-03-14", day: "Saturday", scanType: "XRAY",  fromTime: "11:00 AM", endTime: "01:00 PM", bodyPart: "Hand",       caseNumber: "CASE-UP-XR-001"  },
  { id: "UP-CT-002",    date: "2026-03-15", day: "Sunday",   scanType: "CT",    fromTime: "07:30 AM", endTime: "11:30 AM", bodyPart: "Abdomen",    caseNumber: "CASE-UP-CT-002"  },
  { id: "UP-MRI-002",   date: "2026-03-15", day: "Sunday",   scanType: "MRI",   fromTime: "10:00 AM", endTime: "02:00 PM", bodyPart: "Knee",       caseNumber: "CASE-UP-MRI-002" },
  { id: "UP-OTHER-001", date: "2026-03-15", day: "Sunday",   scanType: "OTHER", fromTime: "01:00 PM", endTime: "05:00 PM", bodyPart: "Whole Body", caseNumber: "CASE-UP-OTH-001" },
  { id: "UP-CT-003",    date: "2026-03-16", day: "Monday",   scanType: "CT",    fromTime: "08:30 AM", endTime: "12:30 PM", bodyPart: "Spine",      caseNumber: "CASE-UP-CT-003"  },
  { id: "UP-XRAY-002",  date: "2026-03-16", day: "Monday",   scanType: "XRAY",  fromTime: "09:00 AM", endTime: "11:00 AM", bodyPart: "Chest",      caseNumber: "CASE-UP-XR-002"  },
  { id: "UP-MRI-003",   date: "2026-03-16", day: "Monday",   scanType: "MRI",   fromTime: "02:00 PM", endTime: "06:00 PM", bodyPart: "Shoulder",   caseNumber: "CASE-UP-MRI-003" },
];
const upcomingTotal = upcomingAssignedData.length;

// Flatten all pending items for the "Due today" modal
const dueTodayItems = Object.values(queueData.pending).flatMap((m) =>
  m.items.map((item) => ({ ...item, queueType: "pending" }))
);

// Upcoming items = next 3 days assigned cases
const upcomingItems = upcomingAssignedData;

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

  const totals = useMemo(() => {
    const overall = { CT: 60, MRI: 34, XRAY: 80, OTHER: 18 };
    const today = { CT: 10, MRI: 6, XRAY: 7, OTHER: 1 };

    if (scanFilter === "today") return today;
    if (scanFilter === "overall") return overall;

    if (!fromDate || !toDate) return overall;

    const days = clamp(daysBetween(fromDate, toDate) + 1, 1, 60);
    const dailyBase = { CT: 2, MRI: 1, XRAY: 3, OTHER: 1 };

    return {
      CT: dailyBase.CT * days,
      MRI: dailyBase.MRI * days,
      XRAY: dailyBase.XRAY * days,
      OTHER: dailyBase.OTHER * days,
    };
  }, [scanFilter, fromDate, toDate]);

  const completedCount = totals.CT + totals.MRI + totals.XRAY + totals.OTHER;

  const scanFilterLabel = useMemo(() => {
    if (scanFilter === "overall") return "Overall";
    if (scanFilter === "today") return "Today";
    if (!fromDate || !toDate) return "Custom";
    return `Custom (${fromDate} → ${toDate})`;
  }, [scanFilter, fromDate, toDate]);

  const [range, setRange] = useState("days");
  const [activeModalityIdx, setActiveModalityIdx] = useState(0);
  const [isHoveringChart, setIsHoveringChart] = useState(false);
  const timerRef = useRef(null);

  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [notes, setNotes] = useState("");
  const [selectedDate, setSelectedDate] = useState(null);
  const [open, setOpen] = useState(false);
  const [availabilitySlots, setAvailabilitySlots] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const readAuth = () => {
    try { return JSON.parse(localStorage.getItem("auth") || "{}"); } catch { return {}; }
  };

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
  const [bodyOverviewOpen, setBodyOverviewOpen] = useState(false);
  const [bodyOverviewFullscreen, setBodyOverviewFullscreen] = useState(true);
  const [selectedQueueCard, setSelectedQueueCard] = useState(null);
  const [queueModalOpen, setQueueModalOpen] = useState(false);

  useEffect(() => {
    if (isHoveringChart) return;
    timerRef.current = setInterval(() => {
      setActiveModalityIdx((i) => (i + 1) % MODALITIES.length);
    }, 3000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isHoveringChart]);

  const activeModality = MODALITIES[activeModalityIdx];

  const chartData = useMemo(() => {
    if (range === "days") {
      return [
        { label: "Day 1", CT: 2, MRI: 1, XRAY: 3, OTHER: 1 },
        { label: "Day 2", CT: 3, MRI: 2, XRAY: 4, OTHER: 1 },
        { label: "Day 3", CT: 4, MRI: 2, XRAY: 5, OTHER: 2 },
        { label: "Day 4", CT: 5, MRI: 3, XRAY: 6, OTHER: 2 },
        { label: "Day 5", CT: 6, MRI: 3, XRAY: 7, OTHER: 2 },
        { label: "Day 6", CT: 7, MRI: 4, XRAY: 7, OTHER: 3 },
        { label: "Day 7", CT: 8, MRI: 4, XRAY: 8, OTHER: 3 },
      ];
    }
    if (range === "weeks") {
      return [
        { label: "Week 1", CT: 12, MRI: 8, XRAY: 16, OTHER: 4 },
        { label: "Week 2", CT: 18, MRI: 9, XRAY: 20, OTHER: 6 },
        { label: "Week 3", CT: 22, MRI: 12, XRAY: 24, OTHER: 7 },
        { label: "Week 4", CT: 28, MRI: 14, XRAY: 30, OTHER: 9 },
      ];
    }
    return [
      { label: "Jan", CT: 60, MRI: 34, XRAY: 80, OTHER: 18 },
      { label: "Feb", CT: 72, MRI: 40, XRAY: 92, OTHER: 20 },
      { label: "Mar", CT: 85, MRI: 45, XRAY: 110, OTHER: 22 },
      { label: "Apr", CT: 96, MRI: 48, XRAY: 120, OTHER: 25 },
      { label: "May", CT: 110, MRI: 55, XRAY: 138, OTHER: 30 },
      { label: "Jun", CT: 120, MRI: 60, XRAY: 150, OTHER: 32 },
      { label: "Jul", CT: 130, MRI: 66, XRAY: 158, OTHER: 35 },
    ];
  }, [range]);

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
      items: dueTodayItems,
    });
    setQueueModalOpen(true);
  };

  // "Upcoming" click → open modal with all assigned items
  const handleUpcomingClick = () => {
    setSelectedQueueCard({
      queueType: "assigned",
      modality: "ALL",
      count: upcomingTotal,
      items: upcomingItems,
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
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, flex: 1 }}>

              {/* Due Today */}
              <button
                type="button"
                onClick={handleDueTodayClick}
                style={{ ...scanInnerCardStyle, ...(isDark ? { background: INNER_CARD_BG, borderColor: INNER_CARD_BORDER } : { ...GLASS_INNER, backdropFilter: "blur(10px)" }) }}
                onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? INNER_CARD_BG_HOVER : GLASS_INNER_HOVER; e.currentTarget.style.transform = "translateY(-2px)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = isDark ? INNER_CARD_BG : GLASS_INNER.background; e.currentTarget.style.transform = "translateY(0)"; }}
              >
                <div style={{ position: "absolute", top: -22, right: -22, width: 80, height: 80, borderRadius: "50%", background: isDark ? "rgba(255,255,255,0.06)" : "rgba(19,78,94,0.06)" }} />
                <div style={{ fontSize: 11, fontWeight: 600, color: isDark ? MUTED_TEXT : "#6b7280", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.8px" }}>Fri 13 Mar</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: isDark ? LIGHT_TEXT : "#111827", marginBottom: 10 }}>Due today</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginBottom: 8 }}>
                  <span style={{ fontSize: 36, fontWeight: 700, color: isDark ? LIGHT_TEXT : "#134e5e" }}>{dueTodayTotal}</span>
                  <span style={{ fontSize: 14, color: isDark ? MUTED_TEXT : "#6b7280" }}>scans</span>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <div style={{ ...pillStyle, background: "rgba(239,68,68,0.1)", color: "#dc2626" }}><span style={{ ...dotStyle, background: "#ef4444" }} />2 critical</div>
                  <div style={{ ...pillStyle, background: "rgba(245,158,11,0.1)", color: "#d97706" }}><span style={{ ...dotStyle, background: "#f59e0b" }} />3 urgent</div>
                </div>
                <div style={{ ...clickHintStyle, color: "#9ca3af" }}>Tap to view queue ›</div>
              </button>

              {/* Upcoming */}
              <button
                type="button"
                onClick={handleUpcomingClick}
                style={{ ...scanInnerCardStyle, ...(isDark ? { background: INNER_CARD_BG, borderColor: INNER_CARD_BORDER } : { ...GLASS_INNER, backdropFilter: "blur(10px)" }) }}
                onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? INNER_CARD_BG_HOVER : GLASS_INNER_HOVER; e.currentTarget.style.transform = "translateY(-2px)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = isDark ? INNER_CARD_BG : GLASS_INNER.background; e.currentTarget.style.transform = "translateY(0)"; }}
              >
                <div style={{ position: "absolute", top: -22, right: -22, width: 80, height: 80, borderRadius: "50%", background: isDark ? "rgba(255,255,255,0.06)" : "rgba(19,78,94,0.06)" }} />
                <div style={{ fontSize: 11, fontWeight: 600, color: isDark ? MUTED_TEXT : "#6b7280", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.8px" }}>Next 3 days</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: isDark ? LIGHT_TEXT : "#111827", marginBottom: 10 }}>Upcoming</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginBottom: 8 }}>
                  <span style={{ fontSize: 36, fontWeight: 700, color: isDark ? LIGHT_TEXT : "#134e5e" }}>{upcomingTotal}</span>
                  <span style={{ fontSize: 14, color: isDark ? MUTED_TEXT : "#6b7280" }}>scans</span>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <div style={{ ...pillStyle, background: "rgba(59,130,246,0.1)", color: "#2563eb" }}><span style={{ ...dotStyle, background: "#3b82f6" }} />17 routine</div>
                </div>
                <div style={{ ...clickHintStyle, color: isDark ? "#9ca3af" : "#64748b" }}>Tap to view queue ›</div>
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
              <span>Scans Completed</span>
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
                  <div style={{ fontSize: 10, fontWeight: 500, color: isDark ? MUTED_TEXT : "#6b7280", marginTop: 3 }}></div>
                  <div style={{ fontSize: 26, fontWeight: 900, color: isDark ? LIGHT_TEXT : "#111827", lineHeight: 1, marginTop: 6 }}>{completedCount}</div>
                </div>
                <SmallMiniStat label="CT" value={totals.CT} isDark={isDark} />
                <SmallMiniStat label="MRI" value={totals.MRI} isDark={isDark} />
                <SmallMiniStat label="XRAY" value={totals.XRAY} isDark={isDark} />
                <SmallMiniStat label="OTHER" value={totals.OTHER} isDark={isDark} />
              </div>

              {/* Interactive Body */}
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 180 }}>
                <InteractiveBody onClick={() => setBodyOverviewOpen(true)} isDark={isDark} />
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

      {/* BODY OVERVIEW MODAL */}
      <CModal visible={bodyOverviewOpen} onClose={() => setBodyOverviewOpen(false)} alignment="center" size={bodyOverviewFullscreen ? "fullscreen" : "xl"} backdrop="static" className="body-overview-modal">
        <CModalBody style={{ padding: bodyOverviewFullscreen ? 18 : "34px 20px 18px", background: isDark ? "#1f2d45" : "#f8fafc", maxHeight: bodyOverviewFullscreen ? "100vh" : "88vh", minHeight: bodyOverviewFullscreen ? "100vh" : "auto", overflowY: "auto" }}>
          <BodyScanOverview onClose={() => setBodyOverviewOpen(false)} isFullscreen={bodyOverviewFullscreen} onToggleFullscreen={() => setBodyOverviewFullscreen((prev) => !prev)} isDark={isDark} />
        </CModalBody>
      </CModal>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

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
      <div style={{ fontSize: 10, fontWeight: 500, color: isDark ? MUTED_TEXT : "#6b7280", marginTop: 3, lineHeight: 1.2 }}>{accent.subName}</div>
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
