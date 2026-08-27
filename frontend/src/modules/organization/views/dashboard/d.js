import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getCurrentLang } from "../../../../shared/components/GoogleTranslateSwitcher";

const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Space+Grotesk:wght@400;500;600;700&display=swap');
  @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
  @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
  .modal-scroll-green::-webkit-scrollbar { width: 7px; height: 7px; }
  .modal-scroll-green::-webkit-scrollbar-track { background: rgba(0,0,0,0.06); border-radius: 4px; }
  .modal-scroll-green::-webkit-scrollbar-thumb { background: rgba(5,150,105,0.55); border-radius: 4px; }
  .modal-scroll-green::-webkit-scrollbar-thumb:hover { background: rgba(5,150,105,0.85); }
  .modal-scroll-green::-webkit-scrollbar-corner { background: transparent; }
  .modal-scroll::-webkit-scrollbar { width: 7px; }
  .modal-scroll::-webkit-scrollbar-track { background: rgba(0,0,0,0.06); border-radius: 4px; }
  .modal-scroll::-webkit-scrollbar-thumb { background: rgba(37,99,235,0.45); border-radius: 4px; }
  .modal-scroll::-webkit-scrollbar-thumb:hover { background: rgba(37,99,235,0.75); }
  .modal-scroll-amber::-webkit-scrollbar { width: 7px; }
  .modal-scroll-amber::-webkit-scrollbar-track { background: rgba(0,0,0,0.06); border-radius: 4px; }
  .modal-scroll-amber::-webkit-scrollbar-thumb { background: rgba(217,119,6,0.55); border-radius: 4px; }
  .modal-scroll-amber::-webkit-scrollbar-thumb:hover { background: rgba(217,119,6,0.85); }
  .dash-card { animation: fadeUp 0.4s ease both; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); }
  ::-webkit-scrollbar { width:5px; height:5px; }
  ::-webkit-scrollbar-track { background:transparent; }
  ::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.15); border-radius:3px; }
  .wl-row:hover td { background:rgba(255,255,255,0.04) !important; transition:background 0.15s; }
  .filter-btn:hover { opacity:0.85; }

`;

const mono = { fontFamily: "'DM Mono','Fira Mono',monospace" };
const sg = { fontFamily: "'Space Grotesk',sans-serif" };
const isTh = getCurrentLang() === "th";

/* ── Data ─────────────────────────────────────────────────────────────────── */
/* KPI card style metadata. The actual numbers/sub-text are filled from the
   live /organization/dashboard/cases response inside the component. */
const KPI_META = {
  "Completed Cases": {
    icon: "✓",
    bg: "linear-gradient(135deg,#064e3b 0%,#065f46 45%,#059669 100%)",
    glow: "rgba(5,150,105,0.35)",
    accent: "#34d399",
  },
  "Case Queue": {
    icon: "◫",
    bg: "linear-gradient(135deg,#1e1b4b 0%,#1e3a8a 45%,#2563eb 100%)",
    glow: "rgba(37,99,235,0.35)",
    accent: "#60a5fa",
  },
  "Pending / Overdue": {
    icon: "⚠",
    bg: "linear-gradient(135deg,#451a03 0%,#78350f 45%,#d97706 100%)",
    glow: "rgba(217,119,6,0.35)",
    accent: "#fbbf24",
  },
};

/* Modality / priority style maps — frontend applies these by tag/text to
   color rows in the modals. The backend only sends normalized text. */
const MODALITY_STYLES = {
  CT:    { color: "#60a5fa", bg: "rgba(59,130,246,0.15)",  barBg: "rgba(37,99,235,0.18)",  name: "Computed Tomography",        bar: 78 },
  MRI:   { color: "#a78bfa", bg: "rgba(139,92,246,0.15)",  barBg: "rgba(124,58,237,0.18)", name: "Magnetic Resonance Imaging", bar: 62 },
  XR:    { color: "#22d3ee", bg: "rgba(6,182,212,0.15)",   barBg: "rgba(8,145,178,0.18)",  name: "X-Ray / Radiography",        bar: 56 },
  US:    { color: "#34d399", bg: "rgba(16,185,129,0.15)",  barBg: "rgba(5,150,105,0.18)",  name: "Ultrasound",                 bar: 42 },
  NM:    { color: "#fbbf24", bg: "rgba(217,119,6,0.15)",   barBg: "rgba(217,119,6,0.18)",  name: "Nuclear Medicine",           bar: 24 },
  PET:   { color: "#f87171", bg: "rgba(239,68,68,0.15)",   barBg: "rgba(185,28,28,0.18)",  name: "PET-CT / PET-MRI",           bar: 14 },
  OTHER: { color: "#94a3b8", bg: "rgba(148,163,184,0.15)", barBg: "rgba(100,116,139,0.18)",name: "Other",                      bar: 10 },
};

const PRIORITY_COLORS = {
  STAT:    "#f87171",
  Urgent:  "#fbbf24",
  Routine: "#60a5fa",
};

const modalityStyle = (tag) => MODALITY_STYLES[String(tag || "").toUpperCase()] || MODALITY_STYLES.OTHER;
const priorityColor = (p) => PRIORITY_COLORS[String(p || "")] || "#94a3b8";

const DEFAULT_KPIS = [
  {
    label: "Completed Cases",
    value: "—",
    sub: "Loading…",
    icon: "✓",
    bar: 0,
    bg: KPI_META["Completed Cases"].bg,
    glow: KPI_META["Completed Cases"].glow,
    accent: KPI_META["Completed Cases"].accent,
  },
  {
    label: "Case Queue",
    value: "—",
    sub: "Loading…",
    icon: "◫",
    bar: 0,
    bg: KPI_META["Case Queue"].bg,
    glow: KPI_META["Case Queue"].glow,
    accent: KPI_META["Case Queue"].accent,
  },
  {
    label: "Pending / Overdue",
    value: "—",
    sub: "Loading…",
    icon: "⚠",
    bar: 0,
    bg: KPI_META["Pending / Overdue"].bg,
    glow: KPI_META["Pending / Overdue"].glow,
    accent: KPI_META["Pending / Overdue"].accent,
  },
];

const tatData = [
  { label: isTh ? "เร่งด่วนพิเศษ / ฉุกเฉิน" : "STAT / Emergency", target: isTh ? "เป้าหมาย ≤ 1 ชั่วโมง" : "Target ≤ 1 hr", val: "0.8h", trend: "↓ 0.1", ok: "good" },
  { label: isTh ? "วิกฤต / เร่งด่วน" : "Critical / Urgent", target: isTh ? "เป้าหมาย ≤ 4 ชั่วโมง" : "Target ≤ 4 hr", val: "3.2h", trend: "↓ 0.4", ok: "good" },
  { label: isTh ? "ปกติ" : "Routine", target: isTh ? "เป้าหมาย ≤ 24 ชั่วโมง" : "Target ≤ 24 hr", val: "19.4h", trend: "↑ 1.8", ok: "warn" },
];

const tatColorMap = { good: "#34d399", warn: "#fbbf24", bad: "#f87171" };
const tatBgMap = {
  good: "rgba(52,211,153,0.1)",
  warn: "rgba(251,191,36,0.1)",
  bad: "rgba(248,113,113,0.1)",
};

const qcData = [
  { label: "Metadata QC",  value: 0, color: "#f87171", bg: "rgba(239,68,68,0.12)", bar: 0 },
  { label: "Image QC",     value: 0, color: "#fbbf24", bg: "rgba(245,158,11,0.12)", bar: 0 },
  { label: "Open queries", value: 0, color: "#fb923c", bg: "rgba(251,146,60,0.12)", bar: 0 },
];

const DEFAULT_MODALITY_DATA = [
  { tag: "CT", name: "Computed Tomography", count: 194, pct: "31%", bar: 78, color: "#60a5fa", bg: "rgba(37,99,235,0.18)" },
  { tag: "MRI", name: "Magnetic Resonance Imaging", count: 148, pct: "24%", bar: 62, color: "#a78bfa", bg: "rgba(124,58,237,0.18)" },
  { tag: "XR", name: "X-Ray / Radiography", count: 129, pct: "21%", bar: 56, color: "#22d3ee", bg: "rgba(8,145,178,0.18)" },
  { tag: "US", name: "Ultrasound", count: 94, pct: "15%", bar: 42, color: "#34d399", bg: "rgba(5,150,105,0.18)" },
  { tag: "NM", name: "Nuclear Medicine", count: 54, pct: "9%", bar: 24, color: "#fbbf24", bg: "rgba(217,119,6,0.18)" },
  { tag: "PET", name: "PET-CT / PET-MRI", count: 29, pct: "5%", bar: 14, color: "#f87171", bg: "rgba(185,28,28,0.18)" },
];

const DEFAULT_COMPLETED_CASES = [
  { caseId: "ONX-08700", uploadedAt: "26 Mar 2026, 06:14", modality: "CT",  modColor: "#60a5fa", modBg: "rgba(59,130,246,0.15)",  studyType: "CT Head w/o contrast",       priority: "STAT",    priorityColor: "#f87171", completedAt: "26 Mar 2026, 07:02", assignedTo: "Dr. R. Mehta" },
  { caseId: "ONX-08701", uploadedAt: "26 Mar 2026, 06:30", modality: "MRI", modColor: "#a78bfa", modBg: "rgba(139,92,246,0.15)",  studyType: "MRI Brain w/ contrast",      priority: "Urgent",  priorityColor: "#fbbf24", completedAt: "26 Mar 2026, 08:45", assignedTo: "Dr. A. Singh" },
  { caseId: "ONX-08703", uploadedAt: "26 Mar 2026, 06:55", modality: "XR",  modColor: "#22d3ee", modBg: "rgba(6,182,212,0.15)",   studyType: "Chest PA + Lateral",         priority: "Routine", priorityColor: "#60a5fa", completedAt: "26 Mar 2026, 09:10", assignedTo: "Dr. P. Iyer" },
  { caseId: "ONX-08705", uploadedAt: "26 Mar 2026, 07:05", modality: "US",  modColor: "#34d399", modBg: "rgba(16,185,129,0.15)",  studyType: "USG Abdomen & Pelvis",       priority: "Routine", priorityColor: "#60a5fa", completedAt: "26 Mar 2026, 09:30", assignedTo: "Dr. K. Nair" },
  { caseId: "ONX-08708", uploadedAt: "26 Mar 2026, 07:22", modality: "CT",  modColor: "#60a5fa", modBg: "rgba(59,130,246,0.15)",  studyType: "CT Chest w/ contrast",       priority: "Urgent",  priorityColor: "#fbbf24", completedAt: "26 Mar 2026, 09:55", assignedTo: "Dr. R. Mehta" },
  { caseId: "ONX-08710", uploadedAt: "26 Mar 2026, 07:40", modality: "PET", modColor: "#f87171", modBg: "rgba(239,68,68,0.15)",   studyType: "PET-CT Whole Body",          priority: "STAT",    priorityColor: "#f87171", completedAt: "26 Mar 2026, 08:30", assignedTo: "Dr. A. Singh" },
  { caseId: "ONX-08715", uploadedAt: "26 Mar 2026, 08:00", modality: "MRI", modColor: "#a78bfa", modBg: "rgba(139,92,246,0.15)",  studyType: "MRI Lumbar Spine",           priority: "Routine", priorityColor: "#60a5fa", completedAt: "26 Mar 2026, 11:00", assignedTo: "Dr. S. Gupta" },
  { caseId: "ONX-08719", uploadedAt: "26 Mar 2026, 08:15", modality: "XR",  modColor: "#22d3ee", modBg: "rgba(6,182,212,0.15)",   studyType: "X-Ray Knee AP & Lateral",    priority: "Routine", priorityColor: "#60a5fa", completedAt: "26 Mar 2026, 10:20", assignedTo: "Dr. P. Iyer" },
  { caseId: "ONX-08722", uploadedAt: "26 Mar 2026, 08:35", modality: "CT",  modColor: "#60a5fa", modBg: "rgba(59,130,246,0.15)",  studyType: "CT Abdomen & Pelvis",        priority: "Urgent",  priorityColor: "#fbbf24", completedAt: "26 Mar 2026, 10:50", assignedTo: "Dr. R. Mehta" },
  { caseId: "ONX-08726", uploadedAt: "26 Mar 2026, 09:00", modality: "NM",  modColor: "#fbbf24", modBg: "rgba(217,119,6,0.15)",   studyType: "Nuclear Medicine Bone Scan", priority: "Routine", priorityColor: "#60a5fa", completedAt: "26 Mar 2026, 13:00", assignedTo: "Dr. K. Nair" },
  { caseId: "ONX-08730", uploadedAt: "26 Mar 2026, 09:10", modality: "MRI", modColor: "#a78bfa", modBg: "rgba(139,92,246,0.15)",  studyType: "MRI Knee w/o contrast",      priority: "Routine", priorityColor: "#60a5fa", completedAt: "26 Mar 2026, 12:15", assignedTo: "Dr. S. Gupta" },
  { caseId: "ONX-08734", uploadedAt: "26 Mar 2026, 09:30", modality: "CT",  modColor: "#60a5fa", modBg: "rgba(59,130,246,0.15)",  studyType: "CT Coronary Angiography",   priority: "STAT",    priorityColor: "#f87171", completedAt: "26 Mar 2026, 10:15", assignedTo: "Dr. A. Singh" },
  { caseId: "ONX-08738", uploadedAt: "26 Mar 2026, 09:50", modality: "US",  modColor: "#34d399", modBg: "rgba(16,185,129,0.15)",  studyType: "USG Thyroid",                priority: "Routine", priorityColor: "#60a5fa", completedAt: "26 Mar 2026, 11:30", assignedTo: "Dr. P. Iyer" },
  { caseId: "ONX-08741", uploadedAt: "26 Mar 2026, 10:05", modality: "XR",  modColor: "#22d3ee", modBg: "rgba(6,182,212,0.15)",   studyType: "X-Ray Spine Cervical",       priority: "Urgent",  priorityColor: "#fbbf24", completedAt: "26 Mar 2026, 11:50", assignedTo: "Dr. R. Mehta" },
  { caseId: "ONX-08745", uploadedAt: "26 Mar 2026, 10:20", modality: "MRI", modColor: "#a78bfa", modBg: "rgba(139,92,246,0.15)",  studyType: "MRI Shoulder w/ contrast",   priority: "Routine", priorityColor: "#60a5fa", completedAt: "26 Mar 2026, 13:30", assignedTo: "Dr. K. Nair" },
];

const STATUS_META = {
  Assigned:   { color: "#34d399", bg: "rgba(52,211,153,0.12)",  label: "Assigned"   },
  Unassigned: { color: "#fbbf24", bg: "rgba(251,191,36,0.12)",  label: "Unassigned" },
  Rejected:   { color: "#f87171", bg: "rgba(248,113,113,0.12)", label: "Rejected"   },
};

const DEFAULT_ROUTINE_QUEUE_CASES = [
  { caseId: "ONX-08750", uploadedAt: "26 Mar 2026, 07:10", modality: "CT",  modColor: "#60a5fa", modBg: "rgba(59,130,246,0.15)",  studyType: "CT Head w/o contrast",        priority: "STAT",    priorityColor: "#f87171", status: "Assigned",   assignedTo: "Dr. R. Mehta" },
  { caseId: "ONX-08751", uploadedAt: "26 Mar 2026, 07:25", modality: "MRI", modColor: "#a78bfa", modBg: "rgba(139,92,246,0.15)",  studyType: "MRI Spine Cervical",          priority: "STAT",    priorityColor: "#f87171", status: "Unassigned", assignedTo: null },
  { caseId: "ONX-08752", uploadedAt: "26 Mar 2026, 07:40", modality: "PET", modColor: "#f87171", modBg: "rgba(239,68,68,0.15)",   studyType: "PET-CT Whole Body",           priority: "STAT",    priorityColor: "#f87171", status: "Assigned",   assignedTo: "Dr. A. Singh" },
  { caseId: "ONX-08753", uploadedAt: "26 Mar 2026, 08:00", modality: "CT",  modColor: "#60a5fa", modBg: "rgba(59,130,246,0.15)",  studyType: "CT Chest w/ contrast",        priority: "STAT",    priorityColor: "#f87171", status: "Rejected",   assignedTo: null },
  { caseId: "ONX-08754", uploadedAt: "26 Mar 2026, 08:05", modality: "MRI", modColor: "#a78bfa", modBg: "rgba(139,92,246,0.15)",  studyType: "MRI Brain w/ contrast",       priority: "STAT",    priorityColor: "#f87171", status: "Assigned",   assignedTo: "Dr. S. Gupta" },
  { caseId: "ONX-08755", uploadedAt: "26 Mar 2026, 08:20", modality: "CT",  modColor: "#60a5fa", modBg: "rgba(59,130,246,0.15)",  studyType: "CT Coronary Angiography",     priority: "Urgent",  priorityColor: "#fbbf24", status: "Assigned",   assignedTo: "Dr. R. Mehta" },
  { caseId: "ONX-08756", uploadedAt: "26 Mar 2026, 08:30", modality: "XR",  modColor: "#22d3ee", modBg: "rgba(6,182,212,0.15)",   studyType: "X-Ray Spine Lumbar",          priority: "Urgent",  priorityColor: "#fbbf24", status: "Unassigned", assignedTo: null },
  { caseId: "ONX-08757", uploadedAt: "26 Mar 2026, 08:45", modality: "US",  modColor: "#34d399", modBg: "rgba(16,185,129,0.15)",  studyType: "USG Abdomen & Pelvis",        priority: "Urgent",  priorityColor: "#fbbf24", status: "Assigned",   assignedTo: "Dr. P. Iyer" },
  { caseId: "ONX-08758", uploadedAt: "26 Mar 2026, 09:00", modality: "MRI", modColor: "#a78bfa", modBg: "rgba(139,92,246,0.15)",  studyType: "MRI Knee w/o contrast",       priority: "Urgent",  priorityColor: "#fbbf24", status: "Rejected",   assignedTo: null },
  { caseId: "ONX-08759", uploadedAt: "26 Mar 2026, 09:10", modality: "CT",  modColor: "#60a5fa", modBg: "rgba(59,130,246,0.15)",  studyType: "CT Abdomen & Pelvis",         priority: "Urgent",  priorityColor: "#fbbf24", status: "Assigned",   assignedTo: "Dr. A. Singh" },
  { caseId: "ONX-08760", uploadedAt: "26 Mar 2026, 09:20", modality: "XR",  modColor: "#22d3ee", modBg: "rgba(6,182,212,0.15)",   studyType: "Chest PA + Lateral",          priority: "Urgent",  priorityColor: "#fbbf24", status: "Unassigned", assignedTo: null },
  { caseId: "ONX-08761", uploadedAt: "26 Mar 2026, 09:35", modality: "NM",  modColor: "#fbbf24", modBg: "rgba(217,119,6,0.15)",   studyType: "Nuclear Medicine Bone Scan",  priority: "Urgent",  priorityColor: "#fbbf24", status: "Assigned",   assignedTo: "Dr. K. Nair" },
  { caseId: "ONX-08762", uploadedAt: "26 Mar 2026, 09:50", modality: "MRI", modColor: "#a78bfa", modBg: "rgba(139,92,246,0.15)",  studyType: "MRI Lumbar Spine",            priority: "Routine", priorityColor: "#60a5fa", status: "Unassigned", assignedTo: null },
  { caseId: "ONX-08763", uploadedAt: "26 Mar 2026, 10:00", modality: "CT",  modColor: "#60a5fa", modBg: "rgba(59,130,246,0.15)",  studyType: "CT Head w/ contrast",         priority: "Routine", priorityColor: "#60a5fa", status: "Assigned",   assignedTo: "Dr. R. Mehta" },
  { caseId: "ONX-08764", uploadedAt: "26 Mar 2026, 10:10", modality: "US",  modColor: "#34d399", modBg: "rgba(16,185,129,0.15)",  studyType: "USG Thyroid",                 priority: "Routine", priorityColor: "#60a5fa", status: "Rejected",   assignedTo: null },
  { caseId: "ONX-08765", uploadedAt: "26 Mar 2026, 10:25", modality: "XR",  modColor: "#22d3ee", modBg: "rgba(6,182,212,0.15)",   studyType: "X-Ray Knee AP & Lateral",     priority: "Routine", priorityColor: "#60a5fa", status: "Unassigned", assignedTo: null },
  { caseId: "ONX-08766", uploadedAt: "26 Mar 2026, 10:40", modality: "MRI", modColor: "#a78bfa", modBg: "rgba(139,92,246,0.15)",  studyType: "MRI Shoulder w/ contrast",    priority: "Routine", priorityColor: "#60a5fa", status: "Assigned",   assignedTo: "Dr. S. Gupta" },
  { caseId: "ONX-08767", uploadedAt: "26 Mar 2026, 10:55", modality: "CT",  modColor: "#60a5fa", modBg: "rgba(59,130,246,0.15)",  studyType: "CT Oncology Staging",         priority: "Routine", priorityColor: "#60a5fa", status: "Assigned",   assignedTo: "Dr. P. Iyer" },
  { caseId: "ONX-08768", uploadedAt: "26 Mar 2026, 11:10", modality: "XR",  modColor: "#22d3ee", modBg: "rgba(6,182,212,0.15)",   studyType: "X-Ray Spine Cervical",        priority: "Routine", priorityColor: "#60a5fa", status: "Unassigned", assignedTo: null },
  { caseId: "ONX-08769", uploadedAt: "26 Mar 2026, 11:20", modality: "US",  modColor: "#34d399", modBg: "rgba(16,185,129,0.15)",  studyType: "USG Pelvis",                  priority: "Routine", priorityColor: "#60a5fa", status: "Assigned",   assignedTo: "Dr. K. Nair" },
];

const PENDING_STATUS_META = {
  "Pending":     { color: "#fbbf24", bg: "rgba(251,191,36,0.12)"  },
  "Overdue":     { color: "#f87171", bg: "rgba(248,113,113,0.12)" },
  "SLA Breach":  { color: "#ef4444", bg: "rgba(239,68,68,0.14)"   },
  "Critical":    { color: "#dc2626", bg: "rgba(220,38,38,0.14)"   },
};

const DEFAULT_PENDING_OVERDUE_CASES = [
  { caseId: "ONX-08600", uploadedAt: "25 Mar 2026, 08:10", modality: "CT",  modColor: "#60a5fa", modBg: "rgba(59,130,246,0.15)",  studyType: "CT Head w/o contrast",        priority: "STAT",    priorityColor: "#f87171", pendingStatus: "Critical"   },
  { caseId: "ONX-08601", uploadedAt: "25 Mar 2026, 09:00", modality: "MRI", modColor: "#a78bfa", modBg: "rgba(139,92,246,0.15)",  studyType: "MRI Spine Cervical",          priority: "STAT",    priorityColor: "#f87171", pendingStatus: "SLA Breach" },
  { caseId: "ONX-08603", uploadedAt: "25 Mar 2026, 09:30", modality: "PET", modColor: "#f87171", modBg: "rgba(239,68,68,0.15)",   studyType: "PET-CT Whole Body",           priority: "STAT",    priorityColor: "#f87171", pendingStatus: "Overdue"    },
  { caseId: "ONX-08605", uploadedAt: "25 Mar 2026, 10:00", modality: "CT",  modColor: "#60a5fa", modBg: "rgba(59,130,246,0.15)",  studyType: "CT Coronary Angiography",     priority: "STAT",    priorityColor: "#f87171", pendingStatus: "Critical"   },
  { caseId: "ONX-08607", uploadedAt: "25 Mar 2026, 10:20", modality: "MRI", modColor: "#a78bfa", modBg: "rgba(139,92,246,0.15)",  studyType: "MRI Brain w/ contrast",       priority: "STAT",    priorityColor: "#f87171", pendingStatus: "SLA Breach" },
  { caseId: "ONX-08610", uploadedAt: "25 Mar 2026, 11:00", modality: "CT",  modColor: "#60a5fa", modBg: "rgba(59,130,246,0.15)",  studyType: "CT Chest w/ contrast",        priority: "Urgent",  priorityColor: "#fbbf24", pendingStatus: "SLA Breach" },
  { caseId: "ONX-08612", uploadedAt: "25 Mar 2026, 11:30", modality: "XR",  modColor: "#22d3ee", modBg: "rgba(6,182,212,0.15)",   studyType: "Chest PA + Lateral",          priority: "Urgent",  priorityColor: "#fbbf24", pendingStatus: "Overdue"    },
  { caseId: "ONX-08614", uploadedAt: "25 Mar 2026, 12:00", modality: "US",  modColor: "#34d399", modBg: "rgba(16,185,129,0.15)",  studyType: "USG Abdomen & Pelvis",        priority: "Urgent",  priorityColor: "#fbbf24", pendingStatus: "Overdue"    },
  { caseId: "ONX-08616", uploadedAt: "25 Mar 2026, 12:45", modality: "MRI", modColor: "#a78bfa", modBg: "rgba(139,92,246,0.15)",  studyType: "MRI Lumbar Spine",            priority: "Urgent",  priorityColor: "#fbbf24", pendingStatus: "SLA Breach" },
  { caseId: "ONX-08618", uploadedAt: "25 Mar 2026, 13:10", modality: "CT",  modColor: "#60a5fa", modBg: "rgba(59,130,246,0.15)",  studyType: "CT Abdomen & Pelvis",         priority: "Urgent",  priorityColor: "#fbbf24", pendingStatus: "Overdue"    },
  { caseId: "ONX-08620", uploadedAt: "25 Mar 2026, 13:40", modality: "NM",  modColor: "#fbbf24", modBg: "rgba(217,119,6,0.15)",   studyType: "Nuclear Medicine Bone Scan",  priority: "Urgent",  priorityColor: "#fbbf24", pendingStatus: "Pending"    },
  { caseId: "ONX-08622", uploadedAt: "25 Mar 2026, 14:00", modality: "XR",  modColor: "#22d3ee", modBg: "rgba(6,182,212,0.15)",   studyType: "X-Ray Spine Lumbar",          priority: "Routine", priorityColor: "#60a5fa", pendingStatus: "Overdue"    },
  { caseId: "ONX-08625", uploadedAt: "25 Mar 2026, 14:30", modality: "MRI", modColor: "#a78bfa", modBg: "rgba(139,92,246,0.15)",  studyType: "MRI Knee w/o contrast",       priority: "Routine", priorityColor: "#60a5fa", pendingStatus: "Pending"    },
  { caseId: "ONX-08628", uploadedAt: "25 Mar 2026, 15:00", modality: "CT",  modColor: "#60a5fa", modBg: "rgba(59,130,246,0.15)",  studyType: "CT Head w/ contrast",         priority: "Routine", priorityColor: "#60a5fa", pendingStatus: "Pending"    },
  { caseId: "ONX-08630", uploadedAt: "25 Mar 2026, 15:20", modality: "US",  modColor: "#34d399", modBg: "rgba(16,185,129,0.15)",  studyType: "USG Thyroid",                 priority: "Routine", priorityColor: "#60a5fa", pendingStatus: "Pending"    },
  { caseId: "ONX-08633", uploadedAt: "25 Mar 2026, 15:50", modality: "XR",  modColor: "#22d3ee", modBg: "rgba(6,182,212,0.15)",   studyType: "X-Ray Knee AP & Lateral",     priority: "Routine", priorityColor: "#60a5fa", pendingStatus: "Overdue"    },
  { caseId: "ONX-08636", uploadedAt: "25 Mar 2026, 16:10", modality: "MRI", modColor: "#a78bfa", modBg: "rgba(139,92,246,0.15)",  studyType: "MRI Shoulder w/ contrast",    priority: "Routine", priorityColor: "#60a5fa", pendingStatus: "Pending"    },
  { caseId: "ONX-08639", uploadedAt: "25 Mar 2026, 16:40", modality: "CT",  modColor: "#60a5fa", modBg: "rgba(59,130,246,0.15)",  studyType: "CT Oncology Staging",         priority: "Routine", priorityColor: "#60a5fa", pendingStatus: "Overdue"    },
  { caseId: "ONX-08642", uploadedAt: "25 Mar 2026, 17:00", modality: "US",  modColor: "#34d399", modBg: "rgba(16,185,129,0.15)",  studyType: "USG Pelvis",                  priority: "Routine", priorityColor: "#60a5fa", pendingStatus: "Pending"    },
  { caseId: "ONX-08645", uploadedAt: "25 Mar 2026, 17:30", modality: "XR",  modColor: "#22d3ee", modBg: "rgba(6,182,212,0.15)",   studyType: "X-Ray Spine Cervical",        priority: "Routine", priorityColor: "#60a5fa", pendingStatus: "Pending"    },
];


/* ── QC Report data ─────────────────────────────────────────────────────── */
const QC_CHK_C = {
  "ID Check":      { bg:"#E6F1FB", fg:"#0C447C" },
  "Slice Check":   { bg:"#EEEDFE", fg:"#3C3489" },
  "Content Check": { bg:"#E1F5EE", fg:"#085041" },
  "Pixel Check":   { bg:"#FAEEDA", fg:"#633806" },
};
const QC_MOD_C = {
  CT:["#E6F1FB","#0C447C"], MRI:["#EEEDFE","#3C3489"],
  XR:["#EAF3DE","#27500A"], MG:["#FBEAF0","#72243E"],
};

const QC_UPLOAD_DATA = {
  protocol: [
    { id:"UP01", patientId:"APL-2024-001", name:"Rajan Kumar",    modality:"CT",  file:"CT_Abdomen_001.dcm",  reason:"Arterial phase missing — only 2 of 3 phases uploaded",        fix:"Re-upload all 3 phases (plain + arterial + portal)", check:"Slice Check",   date:"16 Apr" },
    { id:"UP02", patientId:"VH-2024-045",  name:"Meena Pillai",   modality:"MRI", file:"brain_mri.nii.gz",    reason:"T2 FLAIR not uploaded — T2 TSE sent instead",                fix:"Re-acquire T2 FLAIR sequence at scanner",            check:"ID Check",     date:"16 Apr" },
    { id:"UP03", patientId:"FI-2024-018",  name:"Arjun Menon",    modality:"CT",  file:"CT_Chest_HRCT.dcm",   reason:"Slice thickness 5mm — HRCT protocol requires ≤ 1.5mm",      fix:"Re-acquire with HRCT protocol (thin slice)",         check:"Slice Check",   date:"15 Apr" },
    { id:"UP04", patientId:"CD-2024-092",  name:"Priya Sharma",   modality:"XR",  file:"chest_pa_only.jpg",   reason:"Lateral view missing — PA + Lateral ordered, only PA sent",  fix:"Upload the Lateral view file",                       check:"ID Check",     date:"15 Apr" },
  ],
  quality: [
    { id:"UQ01", patientId:"APL-2024-003", name:"Suresh Babu",    modality:"XR",  file:"chest_xray.jpg",      reason:"Mean intensity 1.2/255 — blank image, plate not exposed",    fix:"Re-expose X-ray plate with correct kVp/mAs",         check:"Content Check", failValue:"1.2/255",  threshold:"≥ 5/255",   date:"16 Apr" },
    { id:"UQ02", patientId:"FI-2024-021",  name:"Kavitha Raj",    modality:"CT",  file:"CT_Brain_002.dcm",    reason:"HU range −2500 to +4900 — wrong RescaleSlope tag",           fix:"Re-export from PACS with correct DICOM RescaleSlope",check:"Pixel Check",  failValue:"−2500→+4900",threshold:"−1074→+3121",date:"16 Apr" },
    { id:"UQ03", patientId:"VH-2024-047",  name:"Ramesh Nair",    modality:"MRI", file:"spine_mri_series/",   reason:"Laplacian var 8 — severely blurry, patient moved during scan",fix:"Re-acquire MRI after ensuring patient is still",      check:"Pixel Check",  failValue:"8",        threshold:"≥ 60",      date:"15 Apr" },
    { id:"UQ04", patientId:"CD-2024-088",  name:"Deepa Krishnan", modality:"XR",  file:"knee_xray.jpg",       reason:"91% near-black pixels — severely underexposed image",        fix:"Increase exposure — re-acquire X-ray",               check:"Content Check", failValue:"91% dark", threshold:"< 90% dark",date:"15 Apr" },
    { id:"UQ05", patientId:"FI-2024-019",  name:"Venkat Subbu",   modality:"MG",  file:"mammo_left.dcm",      reason:"4.2% pixels saturated — mammogram overexposed",              fix:"Reduce exposure — re-acquire mammogram",              check:"Pixel Check",  failValue:"4.2% sat", threshold:"< 5% sat",  date:"15 Apr" },
  ],
  open: [
    { id:"OQ01", patientId:"VH-2024-045", name:"Meena Pillai", modality:"MRI", file:"brain_mri.nii.gz", check:"ID Check",    query:"Referring physician tag (0008,0090) empty — cannot fill report header",   action:"Awaiting org response", org:"Vijaya Hospital", opened:"16 Apr", daysOpen:0 },
    { id:"OQ02", patientId:"FI-2024-019", name:"Venkat Subbu", modality:"MG",  file:"mammo_left.dcm",   check:"ID Check",    query:"Laterality tag missing — cannot confirm left or right breast",           action:"Admin review needed",   org:"Fortis Imaging",  opened:"15 Apr", daysOpen:1 },
    { id:"OQ03", patientId:"FI-2024-019", name:"Venkat Subbu", modality:"MG",  file:"mammo_left.dcm",   check:"Pixel Check", query:"4.2% pixels saturated — radiologist review needed before reporting",    action:"Radiologist flagged",   org:"Fortis Imaging",  opened:"15 Apr", daysOpen:1 },
  ],
  resolved: [
    { id:"RV01", patientId:"APL-2024-099", name:"Sunil Das",   modality:"CT", file:"CT_Liver_prev.dcm", check:"ID Check",      was:"Patient ID mismatch with Excel (APL-099 vs APL-090)", fix:"Org re-uploaded with correct Patient ID tag",        by:"Admin",  time:"09:14" },
    { id:"RV02", patientId:"CD-2024-077",  name:"Latha Menon", modality:"XR", file:"chest_xr_old.jpg",  check:"Content Check", was:"Mean intensity 0.8 — blank image, plate not exposed",  fix:"Org sent replacement file — passed all 4 QC checks", by:"System", time:"10:32" },
    { id:"RV03", patientId:"FI-2024-011",  name:"Ravi Kumar",  modality:"CT", file:"brain_ct.dcm",      check:"Pixel Check",   was:"HU range −3000 to +5000 — wrong RescaleSlope",         fix:"Re-exported from PACS with correct DICOM tags",       by:"Admin",  time:"11:50" },
  ],
};

const QC_REPORT_DATA = {
  // Protocol deviations — report field QC results (pass/error/warn per submitted report)
  protocol: [
    {
      id:"RP01", patientId:"APL-2024-001", name:"Rajan Kumar", modality:"CT",
      rad:"Dr. R. Menon", date:"16 Apr",
      checks:{
        identity:[
          {field:"Patient ID",        status:"pass", value:"APL-2024-001"},
          {field:"Patient name",      status:"pass", value:"Rajan Kumar"},
          {field:"Date of birth/age", status:"pass", value:"53 yrs"},
          {field:"Sex",               status:"pass", value:"Male"},
        ],
        study:[
          {field:"Study date",        status:"pass", value:"16 Apr 2026"},
          {field:"Modality",          status:"pass", value:"CT"},
          {field:"Body part",         status:"pass", value:"Abdomen"},
          {field:"Contrast",          status:"pass", value:"With contrast"},
          {field:"Clinical indication",status:"error", value:"Empty — reason for scan not documented"},
        ],
        content:[
          {field:"Technique",         status:"warn",  value:"Not filled — slice thickness not noted"},
          {field:"Findings",          status:"pass",  value:"Filled — 3 paragraphs"},
          {field:"Impression",        status:"pass",  value:"Filled — 2 lines"},
          {field:"Critical flag",     status:"pass",  value:"Not flagged — no critical finding"},
          {field:"Comparison/prior",  status:"warn",  value:"Not referenced — prior CT available"},
          {field:"Recommendation",    status:"pass",  value:"Repeat CT in 3 months"},
        ],
        signoff:[
          {field:"Radiologist name",  status:"pass",  value:"Dr. R. Menon MD"},
          {field:"E-signature",       status:"pass",  value:"Signed 16 Apr 2026 14:32"},
          {field:"Report date/time",  status:"pass",  value:"16 Apr 2026 · 14:32"},
          {field:"Referring doctor",  status:"pass",  value:"Dr. P. Suresh — Apollo"},
        ],
      }
    },
    {
      id:"RP02", patientId:"VH-2024-045", name:"Meena Pillai", modality:"MRI",
      rad:"Dr. S. Pillai", date:"16 Apr",
      checks:{
        identity:[
          {field:"Patient ID",        status:"pass",  value:"VH-2024-045"},
          {field:"Patient name",      status:"pass",  value:"Meena Pillai"},
          {field:"Date of birth/age", status:"pass",  value:"38 yrs"},
          {field:"Sex",               status:"pass",  value:"Female"},
        ],
        study:[
          {field:"Study date",        status:"pass",  value:"16 Apr 2026"},
          {field:"Modality",          status:"pass",  value:"MRI"},
          {field:"Body part",         status:"pass",  value:"Brain"},
          {field:"Contrast",          status:"error", value:"Empty — with/without contrast not stated"},
          {field:"Clinical indication",status:"pass", value:"Rule out MS lesion"},
        ],
        content:[
          {field:"Technique",         status:"pass",  value:"T1, T2, FLAIR, DWI sequences"},
          {field:"Findings",          status:"error", value:"Empty — findings section not filled"},
          {field:"Impression",        status:"error", value:"Empty — impression not filled"},
          {field:"Critical flag",     status:"pass",  value:"Not flagged"},
          {field:"Comparison/prior",  status:"warn",  value:"Not referenced"},
          {field:"Recommendation",    status:"warn",  value:"Not filled"},
        ],
        signoff:[
          {field:"Radiologist name",  status:"pass",  value:"Dr. S. Pillai MD"},
          {field:"E-signature",       status:"error", value:"Not signed — report submitted unsigned"},
          {field:"Report date/time",  status:"pass",  value:"16 Apr 2026 · 11:15"},
          {field:"Referring doctor",  status:"pass",  value:"Dr. A. Nair — Vijaya Hospital"},
        ],
      }
    },
    {
      id:"RP03", patientId:"FI-2024-018", name:"Arjun Menon", modality:"CT",
      rad:"Dr. K. Sharma", date:"15 Apr",
      checks:{
        identity:[
          {field:"Patient ID",        status:"pass",  value:"FI-2024-018"},
          {field:"Patient name",      status:"pass",  value:"Arjun Menon"},
          {field:"Date of birth/age", status:"warn",  value:"Not provided"},
          {field:"Sex",               status:"pass",  value:"Male"},
        ],
        study:[
          {field:"Study date",        status:"pass",  value:"15 Apr 2026"},
          {field:"Modality",          status:"pass",  value:"CT"},
          {field:"Body part",         status:"pass",  value:"Chest"},
          {field:"Contrast",          status:"pass",  value:"Without contrast"},
          {field:"Clinical indication",status:"pass", value:"HRCT for ILD follow-up"},
        ],
        content:[
          {field:"Technique",         status:"pass",  value:"HRCT — 1.25mm slices, lung window"},
          {field:"Findings",          status:"pass",  value:"Filled — 2 paragraphs"},
          {field:"Impression",        status:"pass",  value:"Progressive ILD — worsened from prior"},
          {field:"Critical flag",     status:"pass",  value:"Flagged — STAT notified to Dr. S. Kumar"},
          {field:"Comparison/prior",  status:"pass",  value:"Compared to CT dated 10 Jan 2026"},
          {field:"Recommendation",    status:"pass",  value:"Pulmonology referral advised"},
        ],
        signoff:[
          {field:"Radiologist name",  status:"pass",  value:"Dr. K. Sharma MD"},
          {field:"E-signature",       status:"pass",  value:"Signed 15 Apr 2026 16:48"},
          {field:"Report date/time",  status:"pass",  value:"15 Apr 2026 · 16:48"},
          {field:"Referring doctor",  status:"pass",  value:"Dr. S. Kumar — Fortis"},
        ],
      }
    },
  ],
  // Open queries — content-related issues only (no pixel/HU/image technical issues)
  open: [
    { id:"RO01", patientId:"VH-2024-045", name:"Meena Pillai", modality:"MRI", rad:"Dr. S. Pillai",
      section:"Report Content", field:"Findings + Impression",
      issue:"Both Findings and Impression sections are empty — report was submitted without clinical content",
      action:"Radiologist must complete and re-sign the report",
      assigned:"Dr. S. Pillai", opened:"16 Apr", days:0, severity:"error" },
    { id:"RO02", patientId:"VH-2024-045", name:"Meena Pillai", modality:"MRI", rad:"Dr. S. Pillai",
      section:"Sign-off & Legal", field:"Electronic signature",
      issue:"Report submitted without electronic signature — not legally valid",
      action:"Radiologist must e-sign before report can be released",
      assigned:"Dr. S. Pillai", opened:"16 Apr", days:0, severity:"error" },
    { id:"RO03", patientId:"APL-2024-001", name:"Rajan Kumar", modality:"CT", rad:"Dr. R. Menon",
      section:"Study Information", field:"Clinical indication",
      issue:"Clinical indication field is empty — reason for scan not documented",
      action:"Admin to confirm indication from referral letter and update report",
      assigned:"Admin", opened:"16 Apr", days:0, severity:"error" },
    { id:"RO04", patientId:"VH-2024-045", name:"Meena Pillai", modality:"MRI", rad:"Dr. S. Pillai",
      section:"Study Information", field:"Contrast used",
      issue:"With/without contrast not stated — affects interpretation of enhancement patterns",
      action:"Radiologist to clarify and add contrast information",
      assigned:"Dr. S. Pillai", opened:"16 Apr", days:0, severity:"warn" },
  ],
  // Resolved today — content-related queries that were fixed
  resolved: [
    { id:"RS01", patientId:"CT-2024-031", name:"Pradeep Varma", modality:"CT",  rad:"Dr. R. Menon",
      section:"Report Content", field:"Impression",
      was:"Impression section read only 'see above' — not a valid clinical summary",
      fix:"Radiologist rewrote impression with specific diagnosis and management plan",
      by:"Dr. R. Menon", time:"09:22" },
    { id:"RS02", patientId:"MR-2024-019", name:"Sunita Rao",    modality:"MRI", rad:"Dr. K. Sharma",
      section:"Report Content", field:"Critical finding flag",
      was:"Intracranial hemorrhage found but critical flag not raised — referring doctor not notified",
      fix:"Critical flag added, STAT call made to Dr. A. Nair, acknowledgement logged at 10:05",
      by:"Admin", time:"10:18" },
    { id:"RS03", patientId:"XR-2024-088", name:"Kavya Pillai",  modality:"XR",  rad:"Dr. S. Pillai",
      section:"Sign-off & Legal", field:"Radiologist name & credentials",
      was:"Report signed as 'Dr. S.P.' — full name and credentials missing, not legally valid",
      fix:"Report re-signed with full name Dr. S. Pillai MD DNB Radiology",
      by:"Dr. S. Pillai", time:"11:44" },
  ],
};

const QC_THRESHOLDS = {
  protocol: [
    { check:"ID Check",    items:[
      { field:"Patient ID (0010,0020)",   pass:"Non-empty, not a placeholder",           fail:"Missing or ANON, TEST, ^^^^" },
      { field:"Patient name (0010,0010)", pass:"Non-empty, not a placeholder",           fail:"Empty or ANONYMOUS, UNKNOWN" },
      { field:"Modality (0008,0060)",     pass:"CT / MR / CR / DR / MG / PT / NM / US", fail:"Missing or unrecognised code" },
      { field:"Study date (0008,0020)",   pass:"Valid YYYYMMDD, not future, after 1950", fail:"Missing, future, or malformed" },
    ]},
    { check:"Slice Check", items:[
      { field:"Spacing regularity (CV)",  pass:"CV ≤ 10% — uniform series",             fail:"CV > 10% — irregular or mixed series" },
      { field:"Missing slices",           pass:"No gap > 1.5× median spacing",           fail:"Gap found — Z position and count reported" },
      { field:"Duplicate positions",      pass:"No two slices at same Z",                fail:"Duplicate Z — same slice sent twice" },
    ]},
  ],
  quality: [
    { check:"Content Check", items:[
      { field:"Mean intensity",           pass:"Normalised mean ≥ 5/255",                fail:"< 5 — blank or unexposed image" },
      { field:"Pixel std deviation",      pass:"Std ≥ 3 — contrast present",             fail:"< 3 — flat image, no variation" },
      { field:"Non-zero pixel fraction",  pass:"≥ 1% non-zero pixels",                  fail:"< 1% — nearly empty frame" },
    ]},
    { check:"Pixel Check", items:[
      { field:"HU range (CT only)",       pass:"−1074 to +3121 HU after rescale",        fail:"Outside bounds — wrong RescaleSlope" },
      { field:"Metal artefact (CT)",      pass:"< 2% pixels at max HU",                  fail:"≥ 2% — metal implant, notify radiologist" },
      { field:"Blur / motion (MRI)",      pass:"Laplacian var ≥ 60",                     fail:"< 15: severe  /  15–60: possibly blurry" },
      { field:"Overexposure (X-ray)",     pass:"< 5% pixels saturated",                  fail:"≥ 5% — burned out, anatomy lost" },
      { field:"Underexposure (X-ray)",    pass:"< 90% near-black pixels",                fail:"≥ 90% — too dark, increase exposure" },
    ]},
  ],
};

const DEFAULT_WORKLIST = [
  { priority: "STAT", pColor: "#f87171", id: "ONX-08814", mod: "CT", mColor: "#60a5fa", mBg: "rgba(59,130,246,0.15)", study: "CT Head w/o contrast", site: "Site 003 · Pune", recv: "13:18", tat: "0:22 left", tatColor: "#f87171", assignee: "Dr. R. Mehta", status: "IN READ", sk: "reading" },
  { priority: "STAT", pColor: "#f87171", id: "ONX-08801", mod: "MRI", mColor: "#a78bfa", mBg: "rgba(139,92,246,0.15)", study: "MRI Spine Cervical", site: "Site 001 · Mumbai", recv: "12:55", tat: "OVERDUE", tatColor: "#f87171", assignee: "Unassigned", status: "OVERDUE", sk: "overdue" },
  { priority: "Urgent", pColor: "#fbbf24", id: "ONX-08799", mod: "PET", mColor: "#f87171", mBg: "rgba(239,68,68,0.15)", study: "PET-CT Whole Body", site: "Site 007 · Hyderabad", recv: "11:40", tat: "2:14 left", tatColor: "#fbbf24", assignee: "Dr. A. Singh", status: "IN READ", sk: "reading" },
  { priority: "Routine", pColor: "#60a5fa", id: "ONX-08788", mod: "XR", mColor: "#22d3ee", mBg: "rgba(6,182,212,0.15)", study: "Chest PA + Lateral", site: "Site 002 · Delhi", recv: "09:22", tat: "8:45 left", tatColor: "#34d399", assignee: "Dr. P. Iyer", status: "PENDING", sk: "pending" },
  { priority: "Routine", pColor: "#60a5fa", id: "ONX-08774", mod: "US", mColor: "#34d399", mBg: "rgba(16,185,129,0.15)", study: "USG Abdomen & Pelvis", site: "Site 005 · Chennai", recv: "08:10", tat: "11:20 left", tatColor: "#34d399", assignee: "Dr. K. Nair", status: "COMPLETE", sk: "complete" },
];


// (WL_FILTERS removed — replaced with four dropdown filters inside the component:
// Status / Priority / Radiologist / Study Type)

/* ── Card title ──────────────────────────────────────────────────────────── */
const Title = ({ children, color = "rgba(255,255,255,0.5)" }) => (
  <div
    style={{
      ...sg,
      fontSize: 15,
      letterSpacing: "2px",
      color,
      textTransform: "uppercase",
      marginBottom: 18,
      fontWeight: 600,
    }}
  >
    {children}
  </div>
);

/* ── Main ────────────────────────────────────────────────────────────────── */
export default function Dashboard() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState("Today");
  // (legacy wlFilter removed — see worklist dropdown filters below)
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [showCalendar, setShowCalendar] = useState(false);

  const [kpiModal, setKpiModal] = useState(null);
  const [qcModal, setQcModal] = useState(null);
  const [qcCardMode, setQcCardMode] = useState("upload"); // "upload" | "report" — controls card toggle only
  const [completedCasesModal, setCompletedCasesModal] = useState(false);
  const [routineQueueModal, setRoutineQueueModal] = useState(false);
  const [pendingOverdueModal, setPendingOverdueModal] = useState(false);
  const [downloadingCase, setDownloadingCase] = useState(null);

  // ── Routine Queue — workflow cases (from case_workflow table) ─────────────
  const [queueTab, setQueueTab]   = useState("Routine");   // "Critical" | "Urgent" | "Routine"
  const [wfCases, setWfCases]     = useState(null);         // null = loading, [] = empty
  const [wfLoading, setWfLoading] = useState(false);

  // ── Live QC numbers from backend ─────────────────────────────────────────
  // Overrides the static qcData counts with real /organization/qc/dashboard-summary.
  // Falls back silently to the module-level mock data if the backend isn't up.
  const [qcLive, setQcLive] = useState(null);   // { counts, cases } | null
  useEffect(() => {
    const API_BASE =
      (typeof import.meta !== "undefined" && import.meta.env &&
        (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE)) || "";
    const tokRaw =
      localStorage.getItem("token") ||
      localStorage.getItem("access_token") ||
      localStorage.getItem("authToken") ||
      localStorage.getItem("jwt");
    let tok = tokRaw;
    if (!tok) {
      for (const k of ["auth", "user", "authUser"]) {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        try {
          const p = JSON.parse(raw);
          tok = p.token || p.access_token || p.accessToken || p.jwt;
          if (tok) break;
        } catch {}
      }
    }
    const load = () =>
      fetch(`${API_BASE}/organization/qc/dashboard-summary`, {
        headers: tok ? { Authorization: `Bearer ${tok}` } : {},
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (d) setQcLive(d); })
        .catch(() => {});
    load();
    const id = setInterval(load, 15000);   // refresh every 15s
    return () => clearInterval(id);
  }, []);

  // ── Live dashboard data ──────────────────────────────────────────────────
  // Single endpoint that returns KPI counts, modality breakdown, and the
  // three table lists (completed / routine queue / pending-overdue) PLUS the
  // active worklist strip — all scoped to the logged-in user's org_id.
  const [dashData, setDashData] = useState(null);   // raw API response or null
  const [dashError, setDashError] = useState(null); // error msg or null
  const [dashToast, setDashToast] = useState(null); // tiny inline banner for download errors

  // Helper — read JWT from any of the storage shapes the app has used over
  // time. Same pattern as the qcLive effect above so we don't fight ourselves.
  const readToken = () => {
    const direct =
      localStorage.getItem("token") ||
      localStorage.getItem("access_token") ||
      localStorage.getItem("authToken") ||
      localStorage.getItem("jwt");
    if (direct) return direct;
    for (const k of ["auth", "user", "authUser"]) {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      try {
        const p = JSON.parse(raw);
        const tok = p.token || p.access_token || p.accessToken || p.jwt;
        if (tok) return tok;
      } catch {}
    }
    return null;
  };

  const API_BASE_DASH =
    (typeof import.meta !== "undefined" && import.meta.env &&
      (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE)) || "";

  useEffect(() => {
    const tok = readToken();
    const load = () =>
      fetch(`${API_BASE_DASH}/organization/dashboard/cases`, {
        headers: tok ? { Authorization: `Bearer ${tok}` } : {},
      })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((d) => { setDashData(d); setDashError(null); })
        .catch((e) => { setDashError(e?.message || "Failed to load dashboard"); });
    load();
    const id = setInterval(load, 30000);   // refresh every 30s
    return () => clearInterval(id);
  }, []);

  // ── Workflow cases (Routine Queue modal — from case_workflow table) ────────
  useEffect(() => {
    const tok = readToken();
    const load = () => {
      setWfLoading(true);
      fetch(`${API_BASE_DASH}/organization/dashboard/workflow-cases`, {
        headers: tok ? { Authorization: `Bearer ${tok}` } : {},
      })
        .then((r) => (r.ok ? r.json() : r.json().catch(() => ({ ok: false, cases: [], error: `HTTP ${r.status}` }))))
        .then((d) => {
          if (!d.ok) {
            console.error("[workflow-cases] backend error:", d.error || d, "org_id:", d.org_id);
          }
          if (Array.isArray(d?.cases)) setWfCases(d.cases);
        })
        .catch((err) => { console.error("[workflow-cases] fetch failed:", err); })
        .finally(() => setWfLoading(false));
    };
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Adapt a workflow-cases row (from case_workflow) into the Routine Queue table shape.
  const decorateWfCase = (c) => {
    const ms = modalityStyle(c.modality);
    const pc = priorityColor(c.priority);
    const first = (c.rad_first_name || "").trim();
    const last  = (c.rad_last_name  || "").trim();
    let radName = "Unassigned";
    if (first || last) {
      const full = `${first} ${last}`.trim();
      radName = full.toLowerCase().startsWith("dr") ? full : `Dr. ${full}`;
    }
    return {
      caseId:        c.case_id,
      uploadedAt:    c.uploaded_at || "—",
      modality:      c.modality    || "—",
      modColor:      ms.color,
      modBg:         ms.bg,
      studyType:     c.study_type  || "—",
      priority:      c.priority    || "Routine",
      priorityColor: pc,
      radiologist:   radName,
      status:        c.status      || "Assigned",
      subjectId:     c.subject_id  || "",
      imageFiles:    Array.isArray(c.image_file_names) ? c.image_file_names : [],
    };
  };

  // Adapt a raw backend case row into the shape each modal table expects.
  // The backend sends normalized text only; we attach colors here from
  // MODALITY_STYLES / PRIORITY_COLORS.
  const decorateCase = (c) => {
    const ms = modalityStyle(c.modality);
    const pc = priorityColor(c.priority);
    return {
      caseId:         c.case_id,
      uploadedAt:     c.uploaded_at || "—",
      completedAt:    c.completed_at || "—",
      modality:       c.modality,
      modColor:       ms.color,
      modBg:          ms.bg,
      studyType:      c.study_type,
      priority:       c.priority,
      priorityColor:  pc,
      assignedTo:     c.assigned_to || "Unassigned",
      status:         c.status || null,            // routine queue
      pendingStatus:  c.pending_status || null,    // pending/overdue
      hasReport:      !!c.has_report,
    };
  };

  // ── Shadow the module-level constants with live data when available ──────
  // Inside this function, `kpis`, `modalityValueData`, `COMPLETED_CASES`,
  // `ROUTINE_QUEUE_CASES`, `PENDING_OVERDUE_CASES`, and `WORKLIST` resolve to
  // the live arrays; outside, the DEFAULT_* fallbacks are used (e.g., if
  // anything else imports this module — none do currently).
  // eslint-disable-next-line no-shadow
  const kpis = (() => {
    if (!dashData || !dashData.kpis) return DEFAULT_KPIS;
    const k = dashData.kpis;
    const total =
      (k.completed?.count || 0) +
      (k.routine_queue?.count || 0) +
      (k.pending_overdue?.count || 0);
    const pct = (n) => (total ? Math.max(6, Math.min(100, Math.round((n / total) * 100))) : 0);
    const compSub =
      k.completed?.avg_tat_hours != null
        ? `Avg TAT ${k.completed.avg_tat_hours}h`
        : `${k.completed?.stat || 0} STAT · ${k.completed?.urgent || 0} urgent`;

    // Case Queue — prefer workflow cases count (from case_workflow table) when loaded
    const wfTotal   = Array.isArray(wfCases) ? wfCases.length : null;
    const wfCrit    = wfTotal !== null ? wfCases.filter(c => c.priority === "STAT" || c.priority === "Critical").length : null;
    const wfUrgent  = wfTotal !== null ? wfCases.filter(c => c.priority === "Urgent").length : null;
    const queueCount = wfTotal !== null ? wfTotal : (k.routine_queue?.count || 0);
    const queueSub   = wfTotal !== null
      ? `${wfCrit} critical · ${wfUrgent} urgent`
      : `${k.routine_queue?.urgent || 0} urgent  ·  ${k.routine_queue?.stat || 0} STAT`;

    const pendSub  = `SLA breach: ${k.pending_overdue?.sla_breach || 0}  ·  Critical: ${k.pending_overdue?.critical || 0}`;
    return [
      {
        label: "Completed Cases",
        value: String(k.completed?.count || 0),
        sub:   compSub,
        ...KPI_META["Completed Cases"],
        bar:   pct(k.completed?.count || 0),
      },
      {
        label: "Case Queue",
        value: String(queueCount),
        sub:   isTh ? `${wfCrit ?? k.routine_queue?.urgent ?? 0} เร่งด่วน  ·  ${wfUrgent ?? k.routine_queue?.stat ?? 0} เร่งด่วนพิเศษ` : queueSub,
        ...KPI_META["Case Queue"],
        bar:   pct(queueCount),
      },
      {
        label: "Pending / Overdue",
        value: String(k.pending_overdue?.count || 0),
        sub:   isTh ? `การละเมิด SLA: ${k.pending_overdue?.sla_breach || 0}  ·  วิกฤต: ${k.pending_overdue?.critical || 0}` : pendSub,
        ...KPI_META["Pending / Overdue"],
        bar:   pct(k.pending_overdue?.count || 0),
      },
    ];
  })();

  // eslint-disable-next-line no-shadow
  const modalityValueData = (() => {
    // While the API hasn't returned anything, show the default skeleton so
    // the card isn't blank on first paint.
    if (!dashData) return DEFAULT_MODALITY_DATA;
    // API returned — respect what it sent, even if empty. (Don't fall back
    // to fake "CT=194, MRI=148" demo numbers when the org genuinely has no
    // submissions yet — that's the bug the screenshots showed.)
    if (!Array.isArray(dashData.modality) || dashData.modality.length === 0) {
      // Fall back to workflow-cases modality breakdown when case_submission is empty
      // but case_workflow has rows (org uploaded scans not yet in case_submission).
      if (Array.isArray(wfCases) && wfCases.length > 0) {
        const countMap = {};
        wfCases.forEach(c => {
          const tag = (c.modality || "OTHER").toUpperCase();
          countMap[tag] = (countMap[tag] || 0) + 1;
        });
        const total = wfCases.length || 1;
        return Object.entries(countMap)
          .map(([tag, count]) => {
            const ms = modalityStyle(tag);
            return {
              tag,
              name: ms.name,
              count,
              pct: `${Math.round((count / total) * 100)}%`,
              bar: Math.max(6, Math.min(100, Math.round((count / total) * 100))),
              color: ms.color,
              bg: ms.barBg,
            };
          })
          .sort((a, b) => b.count - a.count);
      }
      return [];
    }
    const total = dashData.modality.reduce((acc, m) => acc + (m.count || 0), 0) || 1;
    return dashData.modality.map((m) => {
      const ms = modalityStyle(m.tag);
      return {
        tag:   m.tag,
        name:  m.name || ms.name,
        count: m.count || 0,
        pct:   `${m.pct ?? Math.round(((m.count || 0) / total) * 100)}%`,
        bar:   Math.max(6, Math.min(100, Math.round(((m.count || 0) / total) * 100))),
        color: ms.color,
        bg:    ms.barBg,
      };
    });
  })();

  // eslint-disable-next-line no-shadow
  const COMPLETED_CASES = dashData && Array.isArray(dashData.completed)
    ? dashData.completed.map(decorateCase)
    : (dashData ? [] : DEFAULT_COMPLETED_CASES);

  // eslint-disable-next-line no-shadow
  const ROUTINE_QUEUE_CASES = dashData && Array.isArray(dashData.routine_queue)
    ? dashData.routine_queue.map(decorateCase)
    : (dashData ? [] : DEFAULT_ROUTINE_QUEUE_CASES);

  // Workflow cases — from case_workflow table via /organization/dashboard/workflow-cases.
  // Mapped priority: "STAT" → bucket as "Critical", "Urgent" → "Urgent", "Routine" → "Routine"
  const WORKFLOW_CASES = Array.isArray(wfCases) ? wfCases.map(decorateWfCase) : [];
  const wfByTab = {
    Critical: WORKFLOW_CASES.filter(c => c.priority === "STAT" || c.priority === "Critical"),
    Urgent:   WORKFLOW_CASES.filter(c => c.priority === "Urgent"),
    Routine:  WORKFLOW_CASES.filter(c => c.priority === "Routine"),
  };
  const wfTabRows = wfByTab[queueTab] || WORKFLOW_CASES;

  // eslint-disable-next-line no-shadow
  const PENDING_OVERDUE_CASES = dashData && Array.isArray(dashData.pending_overdue)
    ? dashData.pending_overdue.map(decorateCase)
    : (dashData ? [] : DEFAULT_PENDING_OVERDUE_CASES);

  // eslint-disable-next-line no-shadow
  const WORKLIST = (() => {
    if (!dashData) return DEFAULT_WORKLIST;   // loading skeleton
    if (!Array.isArray(dashData.worklist) || dashData.worklist.length === 0) {
      return [];                              // org has no active cases yet
    }
    // Map backend wl_status → the `sk` key the table uses for row colors.
    // Backend returns OVERDUE / IN READ / PENDING / REJECTED; the table's
    // ssDark lookup uses overdue / reading / pending / complete.
    const skMap = {
      "OVERDUE":  "overdue",
      "IN READ":  "reading",
      "PENDING":  "pending",
      "COMPLETE": "complete",
      "REJECTED": "pending",
    };
    return dashData.worklist.map((w) => {
      const ms = modalityStyle(w.modality);
      const pc = priorityColor(w.priority);
      const tatColor =
        w.tat_left === "OVERDUE" ? "#f87171" :
        w.priority === "STAT"    ? "#f87171" :
        w.priority === "Urgent"  ? "#fbbf24" : "#34d399";
      return {
        priority:  w.priority,
        pColor:    pc,
        id:        w.case_id,
        mod:       w.modality,
        mColor:    ms.color,
        mBg:       ms.bg,
        study:     w.study_type,
        site:      w.site || "—",
        recv:      w.received_at || "—",
        tat:       w.tat_left || "—",
        tatColor,
        assignee:  w.assigned_to || "Unassigned",
        status:    w.wl_status || "PENDING",
        sk:        skMap[w.wl_status] || "pending",
      };
    });
  })();

  // Adapt a live case (from /qc/dashboard-summary) to the row shape each table expects.
  // The live case has: { id, case_id, patient, modality, study_type, file, check_failed, reason, date }.
  // The reason string looks like:
  //   "HU range -3024 to 7399 — wrong RescaleSlope/Intercept"  (already the detail portion)
  // We extract: the check name (ID/Slice/Content/Pixel), the human message,
  // and a best-effort "measured" / "threshold" / "action" where available.
  const adaptLiveCase = (c, idx) => {
    const r = (c.reason || "").trim();

    // Prefer explicit check_failed from backend, fall back to regex on the reason.
    let check = (c.check_failed || "").trim();
    if (!check) {
      if (/ID\s*Check/i.test(r))          check = "ID Check";
      else if (/Slice\s*Check/i.test(r))  check = "Slice Check";
      else if (/Content\s*Check/i.test(r)) check = "Content Check";
      else if (/Pixel\s*Check/i.test(r))  check = "Pixel Check";
      else check = "—";
    }

    // Short reason = the reason string, trimmed of leading preambles
    let shortReason = r.replace(/^All\s+\d+\s+file\(s\)\s+failed\s+QC\.\s*/i, "");
    const mParts = shortReason.split("|");
    if (mParts.length > 1) shortReason = mParts[0].trim() + ` (+${mParts.length - 1} more)`;

    // Best-effort measured / threshold / action extraction from the reason text.
    let measured  = "—";
    let threshold = "—";
    let fix       = "Re-upload corrected file";

    if (check === "Pixel Check") {
      const hu = r.match(/HU\s*range\s*(-?\d+)\s*to\s*(-?\d+)/i);
      if (hu)  { measured = `${hu[1]}..${hu[2]} HU`; threshold = "−1100..3100 HU"; fix = "Re-export from PACS with correct RescaleSlope"; }
      const blur = r.match(/var\s*=\s*(\d+)/i);
      if (blur){ measured = `var=${blur[1]}`; threshold = "≥ 60"; fix = "Re-acquire MRI (motion/blur)"; }
      const exp  = r.match(/(\d+\.?\d*)%\s*dark.*?(\d+\.?\d*)%\s*sat/i);
      if (exp) { measured = `${exp[1]}% dark / ${exp[2]}% sat`; threshold = "< 90% / < 5%"; fix = "Adjust exposure — re-acquire"; }
    } else if (check === "Content Check") {
      const mean = r.match(/Mean\s*=\s*([\d.]+)/i);
      if (mean) { measured = `${mean[1]}/255`; threshold = "≥ 5/255"; fix = "Re-expose — plate not exposed"; }
      const std  = r.match(/Std\s*=\s*([\d.]+)/i);
      if (std)  { measured = `σ=${std[1]}`; threshold = "≥ 3"; fix = "Re-acquire — no contrast in image"; }
      const nz   = r.match(/([\d.]+)%\s*non-zero/i);
      if (nz)   { measured = `${nz[1]}% non-zero`; threshold = "≥ 1%"; fix = "Re-acquire — nearly empty frame"; }
    } else if (check === "ID Check") {
      fix = "Re-upload with correct DICOM tags";
    } else if (check === "Slice Check") {
      fix = "Re-upload complete series";
    }

    // Threshold fallback — when regex couldn't extract a specific value,
    // fall back to the engine's nominal threshold so the column is never blank.
    if (threshold === "—") {
      if      (check === "Content Check") threshold = "Mean≥5 / Std≥3 / Non-zero≥1%";
      else if (check === "Pixel Check")   threshold = "See thresholds table";
      else if (check === "ID Check")      threshold = "Non-empty DICOM tags";
      else if (check === "Slice Check")   threshold = "≥ 2 slices, uniform CV ≤ 10%";
    }
    if (measured === "—" && shortReason) {
      // At minimum, surface the first short phrase as the measured "observation"
      const firstPhrase = shortReason.split(/[·—]/)[0].trim();
      if (firstPhrase && firstPhrase.length < 40) measured = firstPhrase;
    }

    // Parse a compact date from ISO
    let date = c.date || "";
    if (date) {
      try {
        date = new Date(date).toLocaleDateString(undefined, { day:"2-digit", month:"short" });
      } catch {}
    }

    const modality = (c.modality || "").toUpperCase();
    // patient name: backend sends `patient`; fall back to legacy `patient_name`
    const name = (c.patient || c.patient_name || "").trim() || "—";
    // file: backend sends `file` (first image file name); fall back to case id
    const file = (c.file || "").trim() || (c.case_id || "—");

    return {
      id:        `LV${idx}`,
      patientId: c.case_id || "—",
      name,
      modality:  modality || "—",
      file,
      check,
      reason:    shortReason,
      was:       shortReason,
      fix,
      failValue: measured,
      threshold,
      measured,
      action:    fix,
      date,
      by:        "System",
      time:      date,
    };
  };

  // Returns the live rows for a bucket, or null if no live data yet (caller
  // falls back to QC_UPLOAD_DATA in that case).
  const liveRowsFor = (bucket) => {
    if (!qcLive || !qcLive.cases || !Array.isArray(qcLive.cases[bucket])) return null;
    return qcLive.cases[bucket].map((c, i) => adaptLiveCase(c, i));
  };

  // Transforms backend threshold payload {id_check, slice_check, content_check, pixel_check}
  // into the {check, items}[] shape that ThreshBlock expects.
  const buildThreshGroups = (t, kind) => {
    if (!t) return null;
    if (kind === "protocol") {
      return [
        { check: "ID Check",    items: t.id_check    || [] },
        { check: "Slice Check", items: t.slice_check || [] },
      ];
    }
    if (kind === "quality") {
      return [
        { check: "Content Check", items: t.content_check || [] },
        { check: "Pixel Check",   items: t.pixel_check   || [] },
      ];
    }
    return null;
  };


  // Download the radiologist's PDF report for a case from the backend.
  // Falls back to a generated text-stub blob when:
  //   - we're on the static fallback data (no live API yet), or
  //   - the case has no report_path on the backend (still in progress)
  // so users on a fresh org always see something.
  const handleDownloadCase = async (caseItem) => {
    setDownloadingCase(caseItem.caseId);
    setDashToast(null);

    const isFallback = !dashData;
    const hasReport  = caseItem.hasReport === true;

    if (!isFallback && hasReport) {
      // Real PDF path — hit the backend
      try {
        const tok = readToken();
        const r = await fetch(
          `${API_BASE_DASH}/organization/dashboard/report/${encodeURIComponent(caseItem.caseId)}`,
          { headers: tok ? { Authorization: `Bearer ${tok}` } : {} },
        );
        if (!r.ok) {
          let msg = `Download failed (HTTP ${r.status})`;
          try { const j = await r.json(); if (j?.detail) msg = j.detail; } catch {}
          setDashToast({ kind: "error", text: msg });
          setDownloadingCase(null);
          setTimeout(() => setDashToast(null), 4000);
          return;
        }
        const blob = await r.blob();
        const url  = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${caseItem.caseId}_report.pdf`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
        setDownloadingCase(null);
        return;
      } catch (e) {
        setDashToast({ kind: "error", text: e?.message || "Network error during download" });
        setDownloadingCase(null);
        setTimeout(() => setDashToast(null), 4000);
        return;
      }
    }

    // ── Fallback: build a text-stub for fresh orgs with no real reports yet ──
    setTimeout(() => {
      const reportText =
        `RADIOLOGY REPORT\n` +
        `================\n` +
        `Case ID      : ${caseItem.caseId}\n` +
        `Study Type   : ${caseItem.studyType}\n` +
        `Modality     : ${caseItem.modality}\n` +
        `Priority     : ${caseItem.priority}\n` +
        `Uploaded     : ${caseItem.uploadedAt}\n` +
        `Completed    : ${caseItem.completedAt}\n` +
        `Radiologist  : ${caseItem.assignedTo}\n\n` +
        `FINDINGS:\n` +
        `Clinical indication and imaging findings for ${caseItem.studyType}.\n` +
        `(Stub — actual radiologist report not yet attached on the backend.)\n\n` +
        `IMPRESSION:\n` +
        `1. Pending radiologist sign-off.\n` +
        `2. Please correlate clinically.\n\n` +
        `Electronically signed by ${caseItem.assignedTo}\n` +
        `Completed: ${caseItem.completedAt}\n`;

      const blob = new Blob([reportText], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${caseItem.caseId}_report_stub.txt`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      setDownloadingCase(null);
    }, 400);
  };

  // ── Theme detection ────────────────────────────────────────────────────────
  const [isDark, setIsDark] = useState(
    () => document.documentElement.getAttribute("data-theme") === "dark"
  );
  useEffect(() => {
    const observer = new MutationObserver(() =>
      setIsDark(document.documentElement.getAttribute("data-theme") === "dark")
    );
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  // ── Theme tokens ───────────────────────────────────────────────────────────
  const cardBg     = isDark ? "rgba(15,23,42,0.70)"  : "rgba(255,255,255,0.28)";
  const cardBorder = isDark ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.50)";
  const cardShadow = isDark ? "0 8px 32px rgba(0,0,0,0.40)" : "0 8px 32px rgba(0,0,0,0.08)";
  const innerBg    = isDark ? "rgba(15,23,42,0.50)"  : "rgba(255,255,255,0.22)";
  const innerBorder= isDark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.45)";
  const textPri    = isDark ? "#f1f5f9" : "#0f172a";
  const textSec    = isDark ? "#94a3b8" : "#475569";
  const textMuted  = isDark ? "#64748b" : "#94a3b8";
  const titleClr   = isDark ? "rgba(255,255,255,0.85)" : "rgb(0,0,0)";
  const tblHeadBg  = isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.18)";
  const tblRowBg   = isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.12)";
  const tblBorder  = isDark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.25)";
  const tblHdrBorder = isDark ? "rgba(255,255,255,0.10)" : "#e2e8f0";

  useEffect(() => {
    const existing = document.getElementById("org-dash-css");
    if (existing) existing.remove();

    const el = document.createElement("style");
    el.id = "org-dash-css";
    el.innerHTML = GLOBAL_CSS;
    document.head.appendChild(el);

    return () => {
      const current = document.getElementById("org-dash-css");
      if (current) current.remove();
    };
  }, []);


  // ── Worklist filters ───────────────────────────────────────────────────
  // Four dropdowns: Status, Priority, Radiologist, Study Type. Each defaults
  // to "All" (no filtering). Options for Radiologist + Study Type are
  // derived from the current WORKLIST so they reflect whatever the org has.
  const [wlStatus,     setWlStatus]     = useState("All");
  const [wlPriority,   setWlPriority]   = useState("All");
  const [wlRadiologist, setWlRadiologist] = useState("All");
  const [wlStudyType,  setWlStudyType]  = useState("All");

  // Build unique option lists from current data, sorted, "All" first.
  const uniq = (arr) => Array.from(new Set(arr.filter(Boolean))).sort();
  const statusOptions     = ["All", "Pending", "In Read", "Complete", "Overdue", "Rejected"];
  const priorityOptions   = ["All", "STAT", "Urgent", "Routine"];
  const radiologistOptions = ["All", ...uniq(WORKLIST.map((r) => r.assignee))];
  const studyTypeOptions  = ["All", ...uniq(WORKLIST.map((r) => r.study))];

  const filteredWL = WORKLIST.filter((r) => {
    // Status — display tag is uppercase (PENDING / IN READ / OVERDUE / ...).
    // Compare case-insensitively so the dropdown labels can be Title Case.
    if (wlStatus !== "All" &&
        String(r.status).toUpperCase() !== wlStatus.toUpperCase()) {
      return false;
    }
    if (wlPriority    !== "All" && r.priority !== wlPriority)       return false;
    if (wlRadiologist !== "All" && r.assignee !== wlRadiologist)    return false;
    if (wlStudyType   !== "All" && r.study    !== wlStudyType)      return false;
    return true;
  });

  return (
    <>
      {/* Fixed full-viewport background */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          backgroundImage: isDark
            ? "linear-gradient(rgba(10,15,30,0.88),rgba(10,15,30,0.88)), url('/backgroundimg.png')"
            : "url('/backgroundimg.png')",
          backgroundSize: "cover",
          backgroundPosition: "center top",
          backgroundRepeat: "no-repeat",
          pointerEvents: "none",
        }}
      />

      {/* ── Inline toast for download/dashboard errors (no alerts) ─────── */}
      {dashToast && (
        <div
          style={{
            position: "fixed",
            top: 16,
            right: 16,
            zIndex: 30000,
            maxWidth: 360,
            padding: "12px 16px",
            borderRadius: 12,
            background: dashToast.kind === "error"
              ? "linear-gradient(135deg,#7f1d1d,#b91c1c)"
              : "linear-gradient(135deg,#065f46,#059669)",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            boxShadow: "0 8px 24px rgba(0,0,0,0.30)",
            display: "flex",
            alignItems: "center",
            gap: 10,
            animation: "fadeUp 0.25s ease both",
          }}
        >
          <span style={{ fontSize: 18, lineHeight: 1 }}>
            {dashToast.kind === "error" ? "⚠" : "✓"}
          </span>
          <span style={{ flex: 1 }}>{dashToast.text}</span>
          <button
            onClick={() => setDashToast(null)}
            style={{
              background: "rgba(255,255,255,0.18)",
              border: "none",
              borderRadius: 6,
              color: "#fff",
              width: 24,
              height: 24,
              cursor: "pointer",
              fontSize: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >×</button>
        </div>
      )}

      {/* ── Inline error banner if dashboard fetch keeps failing ─────── */}
      {dashError && !dashData && (
        <div
          style={{
            position: "fixed",
            top: 16,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 29000,
            padding: "8px 14px",
            borderRadius: 8,
            background: "rgba(239,68,68,0.92)",
            color: "#fff",
            fontSize: 12,
            fontWeight: 600,
            boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
          }}
        >
          Dashboard data unavailable ({dashError}). Showing fallback values.
        </div>
      )}

      <div
        style={{
          position: "relative",
          zIndex: 1,
          padding: "28px 28px",
          minHeight: "100%",
          fontFamily: "'Space Grotesk', sans-serif",
          boxSizing: "border-box",
        }}
      >
        {/* ── Header ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 24,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 13,
                letterSpacing: "3px",
                color: "rgba(255,255,255,0.3)",
                textTransform: "uppercase",
                marginBottom: 5,
              }}
            />
            <div
              style={{
                fontSize: 24,
                fontWeight: 700,
                color: "#e2e8f0",
                lineHeight: 1,
              }}
            />
          </div>

          <div style={{ display: "flex", gap: 7, alignItems: "center", position: "relative" }}>
            {["Today", "7d", "30d"].map((f) => (
              <button
                key={f}
                className="filter-btn"
                onClick={() => { setFilter(f); setShowCalendar(false); }}
                style={{
                  ...sg,
                  fontSize: 15,
                  padding: "7px 18px",
                  borderRadius: 22,
                  cursor: "pointer",
                  border: filter === f ? "none" : "1px solid rgba(255,255,255,0.60)",
                  color: filter === f ? "#fff" : "#374151",
                  background:
                    filter === f
                      ? "linear-gradient(135deg,#1e3a8a,#2563eb)"
                      : "rgba(255,255,255,0.85)",
                  fontWeight: 600,
                  boxShadow:
                    filter === f
                      ? "0 4px 14px rgba(37,99,235,0.4)"
                      : "none",
                }}
              >
                {f}
              </button>
            ))}

            {/* Custom button */}
            <div style={{ position: "relative" }}>
              <button
                className="filter-btn"
                onClick={() => { setFilter("Custom"); setShowCalendar((v) => !v); }}
                style={{
                  ...sg,
                  fontSize: 15,
                  padding: "7px 18px",
                  borderRadius: 22,
                  cursor: "pointer",
                  border: filter === "Custom" ? "none" : "1px solid rgba(255,255,255,0.60)",
                  color: filter === "Custom" ? "#fff" : "#374151",
                  background:
                    filter === "Custom"
                      ? "linear-gradient(135deg,#1e3a8a,#2563eb)"
                      : "rgba(255,255,255,0.85)",
                  fontWeight: 600,
                  boxShadow:
                    filter === "Custom"
                      ? "0 4px 14px rgba(37,99,235,0.4)"
                      : "none",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                Custom
              </button>

              {showCalendar && (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 10px)",
                    right: 0,
                    zIndex: 999,
                    background: "rgba(255,255,255,0.55)",
                    backdropFilter: "blur(20px)",
                    WebkitBackdropFilter: "blur(20px)",
                    borderRadius: 16,
                    boxShadow: "0 8px 32px rgba(0,0,0,0.10)",
                    border: "1px solid rgba(255,255,255,0.60)",
                    padding: "20px 20px 16px",
                    minWidth: 280,
                  }}
                >
                  <div style={{ ...sg, fontSize: 13, fontWeight: 700, color: "#475569", marginBottom: 14, letterSpacing: "1px", textTransform: "uppercase" }}>
                    Select Date Range
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div>
                      <label style={{ ...sg, fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 5 }}>From</label>
                      <input
                        type="date"
                        value={customFrom}
                        onChange={(e) => setCustomFrom(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          borderRadius: 10,
                          border: "1px solid #cbd5e1",
                          fontSize: 14,
                          color: "#1e293b",
                          outline: "none",
                          fontFamily: "'Space Grotesk', sans-serif",
                          boxSizing: "border-box",
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ ...sg, fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 5 }}>To</label>
                      <input
                        type="date"
                        value={customTo}
                        onChange={(e) => setCustomTo(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          borderRadius: 10,
                          border: "1px solid #cbd5e1",
                          fontSize: 14,
                          color: "#1e293b",
                          outline: "none",
                          fontFamily: "'Space Grotesk', sans-serif",
                          boxSizing: "border-box",
                        }}
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => setShowCalendar(false)}
                    style={{
                      ...sg,
                      marginTop: 14,
                      width: "100%",
                      padding: "9px",
                      borderRadius: 10,
                      border: "none",
                      background: "linear-gradient(135deg,#1e3a8a,#2563eb)",
                      color: "#fff",
                      fontWeight: 700,
                      fontSize: 14,
                      cursor: "pointer",
                    }}
                  >
                    Apply
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ════ ROW 1 — 3 KPI cards ════ */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3,1fr)",
            gap: 16,
            marginBottom: 16,
          }}
        >
          {kpis.map((k, i) => (
            <div
              key={k.label}
              className="dash-card"
              onClick={() => {
                if (k.label === "Completed Cases") setCompletedCasesModal(true);
                else if (k.label === "Case Queue") setRoutineQueueModal(true);
                else if (k.label === "Pending / Overdue") setPendingOverdueModal(true);
                else setKpiModal(k.label);
              }}
              style={{
                background: k.bg,
                borderRadius: 18,
                padding: "24px 24px 20px",
                boxShadow: `0 8px 32px ${k.glow}`,
                animationDelay: `${i * 70}ms`,
                position: "relative",
                overflow: "hidden",
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  right: -24,
                  top: -24,
                  width: 120,
                  height: 120,
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.06)",
                  pointerEvents: "none",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  right: 20,
                  bottom: -20,
                  width: 80,
                  height: 80,
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.04)",
                  pointerEvents: "none",
                }}
              />

              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  marginBottom: 14,
                }}
              >
                <div
                  style={{
                    fontSize: 15,
                    letterSpacing: "1.5px",
                    color: "rgba(255,255,255,0.6)",
                    textTransform: "uppercase",
                    fontWeight: 600,
                  }}
                >
                  {k.label}
                </div>
                <span style={{ fontSize: 22, lineHeight: 1, opacity: 0.7 }}>
                  {k.icon}
                </span>
              </div>

              <div
                style={{
                  fontSize: 48,
                  fontWeight: 700,
                  ...mono,
                  lineHeight: 1,
                  color: "#fff",
                  marginBottom: 10,
                }}
              >
                {k.value}
              </div>

              <div
                style={{
                  fontSize: 15,
                  color: "rgba(255,255,255,0.55)",
                  marginBottom: 16,
                }}
              >
                {k.sub}
              </div>

              <div
                style={{
                  height: 4,
                  background: "rgba(255,255,255,0.15)",
                  borderRadius: 3,
                }}
              >
                <div
                  style={{
                    width: `${k.bar}%`,
                    height: 4,
                    background: k.accent,
                    borderRadius: 3,
                    boxShadow: `0 0 8px ${k.accent}`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* ════ ROW 2 — TAT | Protocol QC | Cases by Modality ════ */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 16,
            marginBottom: 16,
            alignItems: "stretch",
          }}
        >
          {/* ── TAT Performance ── */}
          <div
            className="dash-card"
            style={{
              background: cardBg,
              borderRadius: 18,
              padding: 22,
              boxShadow: cardShadow,
              border: `1px solid ${cardBorder}`,
              animationDelay: "200ms",
            }}
          >
            <Title color={titleClr}>{isTh ? "ประสิทธิภาพ TAT · ชั่วโมง" : "TAT Performance · Hours"}</Title>

            {tatData.map((t, i) => (
              <div
                key={t.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "11px 14px",
                  marginBottom: i < tatData.length - 1 ? 8 : 0,
                  background: tatBgMap[t.ok],
                  borderRadius: 10,
                  borderLeft: `3px solid ${tatColorMap[t.ok]}`,
                }}
              >
                <div>
                  <div
                    style={{ fontSize: 17, color: textPri, fontWeight: 600 }}
                  >
                    {t.label}
                  </div>
                  <div
                    style={{ fontSize: 17, color: textMuted, marginTop: 3 }}
                  >
                    {t.target}
                  </div>
                </div>

                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div
                    style={{
                      ...mono,
                      fontSize: 20,
                      fontWeight: 700,
                      color: tatColorMap[t.ok],
                    }}
                  >
                    {t.val}
                  </div>
                  <div
                    style={{ fontSize: 17, color: textMuted, marginTop: 2 }}
                  >
                    {t.trend}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* ── QC Compliance Card ── */}
          <div className="dash-card" style={{ background:cardBg, borderRadius:18, padding:22, boxShadow:cardShadow, border:`1px solid ${cardBorder}`, animationDelay:"260ms" }}>

            {/* Header */}
            <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:16, gap:8 }}>
              <div>
                <div style={{ ...sg, fontSize:16, fontWeight:700,textTransform:"uppercase", letterSpacing:"2px", color:textPri }}>Quality Check</div>
                <div style={{ ...sg, fontSize:13, letterSpacing:"1.8px", color:isDark?"rgba(255,255,255,0.4)":"rgba(0,0,0,0.4)",  fontWeight:700, marginTop:3 }}>Validation</div>
              </div>

              {/* Slide toggle — Uploaded files | Report  (matches Values/Interactive View pill style) */}
              <div
                style={{
                  display: "inline-flex",
                  padding: 4,
                  borderRadius: 14,
                  background: isDark ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.35)",
                  border: `1px solid ${isDark ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.55)"}`,
                  flexShrink: 0,
                }}
              >
                {[["upload","Uploaded files"],["report","Report"]].map(([mode,label])=>{
                  const isActive = qcCardMode === mode;
                  return (
                    <button key={mode}
                      type="button"
                      onClick={()=>setQcCardMode(mode)}
                      style={{
                        border: "none",
                        background: isActive ? "#2563eb" : "transparent",
                        color:      isActive ? "#ffffff" : (isDark ? "#cbd5e1" : "#2563eb"),
                        padding: "9px 16px",
                        borderRadius: 10,
                        fontSize: 15,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >{label}</button>
                  );
                })}
              </div>
            </div>

            {/* metric rows — 4 for Upload mode, 3 for Report mode (no Image QC) */}
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {qcData.filter(q=> qcCardMode==="upload" || q.label!=="Image QC").map((q)=>{
                const tabKey = q.label==="Metadata QC"?"protocol":q.label==="Image QC"?"quality":"open";
                // Override the static number with live data when the backend has responded
                const liveCount = qcLive && qcLive.counts ? qcLive.counts[tabKey] : null;
                const displayValue = (qcCardMode === "upload" && liveCount != null) ? liveCount : q.value;
                return (
                  <div key={q.label}
                    onClick={()=>setQcModal({ mode: qcCardMode, tab: tabKey })}
                    onMouseEnter={e=>{
                      e.currentTarget.style.transform="translateX(3px)";
                      e.currentTarget.style.boxShadow=`0 2px 12px ${q.color}33`;
                    }}
                    onMouseLeave={e=>{
                      e.currentTarget.style.transform="none";
                      e.currentTarget.style.boxShadow="none";
                    }}
                    style={{ background:isDark?`${q.color}22`:q.bg, borderRadius:12, padding:"13px 16px", borderLeft:`3px solid ${q.color}`, display:"flex", alignItems:"center", justifyContent:"space-between", cursor:"pointer", transition:"transform 0.14s, box-shadow 0.14s" }}>
                    <div>
                      <div style={{ fontSize:16, color:textPri, fontWeight:600 }}>{q.label}</div>
                      <div style={{ marginTop:6, height:3, width:100, background:isDark?"rgba(255,255,255,0.1)":"rgba(0,0,0,0.07)", borderRadius:2 }}>
                        <div style={{ width:`${q.bar}%`, height:3, background:q.color, borderRadius:2 }}/>
                      </div>
                    </div>
                    <div style={{ ...mono, fontSize:30, fontWeight:700, color:q.color, flexShrink:0, marginLeft:14 }}>{displayValue}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── QC Modal ── */}
          {qcModal && (()=>{
            const isUpload = qcModal.mode !== "report";
            const tab = qcModal.tab || "protocol";
            const setTab = (t) => setQcModal(m=>({...m, tab:t}));
            const setMode = (m2) => setQcModal(m=>({...m, mode:m2, tab:"protocol"}));

            const mBg  = isDark?"#0d1117":"#ffffff";
            const mBdr = isDark?"rgba(255,255,255,0.10)":"#e2e8f0";
            const rBg  = isDark?"rgba(255,255,255,0.04)":"#f8fafc";
            const rBdr = isDark?"rgba(255,255,255,0.06)":"#f0f4f8";
            const tP   = isDark?"#f1f5f9":"#0f172a";
            const tS   = isDark?"#94a3b8":"#475569";

            // Live counts from backend override static lengths on the tab badges.
            // Null-safe: falls back to QC_UPLOAD_DATA.xxx.length while loading.
            const lc = (qcLive && qcLive.counts) ? qcLive.counts : null;
            // Combined 'open' count = Metadata QC + image rejects + backend open +
            // (resolved is now shown within this same tab, so its count folds in too).
            const combinedOpen = lc
              ? (lc.protocol || 0) + (lc.quality || 0) + (lc.open || 0) + (lc.resolved || 0)
              : QC_UPLOAD_DATA.open.length + QC_UPLOAD_DATA.resolved.length;

            const UPLOAD_TABS = [
              { id:"protocol", label:"Metadata QC",      color:"#f87171",
                count: lc ? (lc.protocol || 0) : QC_UPLOAD_DATA.protocol.length },
              { id:"quality",  label:"Image QC", color:"#fbbf24",
                count: lc ? (lc.quality  || 0) : QC_UPLOAD_DATA.quality.length  },
              { id:"open",     label:"Open queries",          color:"#fb923c",
                count: combinedOpen },
            ];
            const REPORT_TABS = [
              { id:"protocol", label:"Content rejects",        color:"#f87171", count:QC_REPORT_DATA.protocol.length },
              { id:"open",     label:"Open queries",           color:"#fb923c", count:QC_REPORT_DATA.open.length + QC_REPORT_DATA.resolved.length },
            ];
            const TABS = isUpload ? UPLOAD_TABS : REPORT_TABS;

            // helpers
            const ModBadge = ({mod}) => { const [bg,fg]=QC_MOD_C[mod]||["#333","#ccc"]; return <span style={{fontSize:13,fontWeight:700,padding:"2px 8px",borderRadius:99,background:bg,color:fg,whiteSpace:"nowrap"}}>{mod}</span>; };
            const ChkBadge = ({chk}) => { const c=QC_CHK_C[chk]||{bg:"#333",fg:"#ccc"}; return <span style={{fontSize:13,fontWeight:700,padding:"2px 9px",borderRadius:99,background:c.bg,color:c.fg,whiteSpace:"nowrap"}}>{chk}</span>; };
            const StatusPill = ({s}) => {
              const m={"pending":["#FAEEDA","#633806"],"re-submit":["#FCEBEB","#791F1F"],"re-acquire":["#FCEBEB","#791F1F"],"Review":["#FAEEDA","#633806"],"Re-acquire":["#FCEBEB","#791F1F"],"Re-export":["#EEEDFE","#3C3489"]};
              const [bg,fg]=m[s]||["#E6F1FB","#0C447C"];
              return <span style={{fontSize:13,fontWeight:700,padding:"2px 10px",borderRadius:99,background:bg,color:fg,whiteSpace:"nowrap"}}>{s}</span>;
            };
            const TH = ({ch}) => <th style={{padding:"9px 12px",textAlign:"left",fontSize:14,fontWeight:700,color:tS,textTransform:"uppercase",letterSpacing:".05em",background:isDark?"rgba(255,255,255,0.05)":"#f1f5f9",borderBottom:`1px solid ${mBdr}`,whiteSpace:"nowrap"}}>{ch}</th>;
            const TD = ({ch,clr,mono:m2}) => <td style={{padding:"10px 12px",fontSize:15,color:clr||tP,borderBottom:`1px solid ${rBdr}`,verticalAlign:"middle",fontFamily:m2?"'DM Mono',monospace":"inherit"}}>{ch}</td>;

            // threshold blocks
            const ThreshBlock = ({groups}) => (
              <div style={{marginTop:14}}>
                {groups.map(g=>{
                  const cc=QC_CHK_C[g.check]||{bg:"#333",fg:"#ccc"};
                  return (
                    <div key={g.check} style={{marginBottom:14}}>
                      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                        <span style={{fontSize:14,fontWeight:700,padding:"3px 10px",borderRadius:99,background:cc.bg,color:cc.fg}}>{g.check}</span>
                        <span style={{fontSize:15,color:tS}}>thresholds</span>
                      </div>
                      <div style={{border:`1px solid ${mBdr}`,borderRadius:8,overflow:"hidden"}}>
                        <div style={{display:"grid",gridTemplateColumns:"1.3fr 1fr 1fr",background:isDark?"rgba(255,255,255,0.05)":"#f9fafb",padding:"8px 12px",borderBottom:`1px solid ${mBdr}`}}>
                          <div style={{fontSize:14,fontWeight:700,color:tS,textTransform:"uppercase",letterSpacing:".05em"}}>Field</div>
                          <div style={{fontSize:14,fontWeight:700,color:"#34d399",textTransform:"uppercase",letterSpacing:".05em"}}>Pass ✓</div>
                          <div style={{fontSize:14,fontWeight:700,color:"#f87171",textTransform:"uppercase",letterSpacing:".05em"}}>Fail ✗</div>
                        </div>
                        {g.items.map((r,i)=>(
                          <div key={i} style={{display:"grid",gridTemplateColumns:"1.3fr 1fr 1fr",padding:"9px 12px",background:i%2===0?rBg:mBg,borderBottom:i<g.items.length-1?`1px solid ${rBdr}`:"none"}}>
                            <div style={{fontSize:15,fontWeight:600,color:tP}}>{r.field}</div>
                            <div style={{fontSize:15,color:"#34d399"}}>{r.pass}</div>
                            <div style={{fontSize:15,color:"#f87171"}}>{r.fail}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            );

            return (
              <div onClick={()=>setQcModal(null)} style={{position:"fixed",inset:0,zIndex:99999,background:"rgba(0,0,0,0.60)",display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"120px 20px 24px"}}>
                <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:1040,background:mBg,border:`1px solid ${mBdr}`,borderRadius:20,overflow:"hidden",boxShadow:"0 28px 70px rgba(0,0,0,0.4)",maxHeight:"calc(100vh - 144px)",display:"flex",flexDirection:"column"}}>

                  {/* Modal header — single compact row */}
                  <div style={{padding:"10px 20px",borderBottom:`1px solid ${mBdr}`,display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
                    <span style={{fontSize:18,fontWeight:700,color:tP,flex:1,whiteSpace:"nowrap"}}>Quality Check</span>
                    {/* Slide toggle in modal — matches Values/Interactive View pill style */}
                    <div
                      style={{
                        display: "inline-flex",
                        padding: 4,
                        borderRadius: 14,
                        background: isDark ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.35)",
                        border: `1px solid ${isDark ? "rgba(255,255,255,0.18)" : "rgba(226,232,240,0.9)"}`,
                        flexShrink: 0,
                      }}
                    >
                      {[["upload","Uploaded files"],["report","Report"]].map(([mode,label])=>{
                        const isAct = (!isUpload&&mode==="report")||(isUpload&&mode==="upload");
                        return (
                          <button key={mode}
                            type="button"
                            onClick={()=>{ setMode(mode); setQcCardMode(mode); }}
                            style={{
                              border: "none",
                              background: isAct ? "#2563eb" : "transparent",
                              color:      isAct ? "#ffffff" : (isDark ? "#cbd5e1" : "#2563eb"),
                              padding: "7px 14px",
                              borderRadius: 10,
                              fontSize: 15,
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >{label}</button>
                        );
                      })}
                    </div>
                    <button onClick={()=>setQcModal(null)} style={{background:"transparent",border:"none",color:tS,width:26,height:26,cursor:"pointer",fontSize:24,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,lineHeight:1,borderRadius:4}}>×</button>
                  </div>
                  {/* 4 Tabs */}
                  <div style={{display:"flex",gap:0,borderBottom:`1px solid ${mBdr}`,flexShrink:0,overflowX:"auto"}}>
                    {TABS.map(t=>(
                      <button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"10px 18px",fontSize:15,fontWeight:700,cursor:"pointer",border:"none",borderBottom: tab===t.id?`2.5px solid ${t.color}`:"2.5px solid transparent",background:"transparent",color: tab===t.id?t.color:tS,transition:"color 0.15s",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:7}}>
                        {t.label}
                        <span style={{fontSize:14,padding:"1px 9px",borderRadius:99,background:isDark?`${t.color}22`:t.color+"18",color:t.color,fontWeight:700}}>{t.count}</span>
                      </button>
                    ))}
                  </div>

                  {/* Body */}
                  <div className="modal-scroll" style={{overflowY:"auto",overflowX:"auto",padding:"16px 22px 22px",flex:1}}>

                    {/* ═══ UPLOADED FILES MODE ═══ */}

                    {isUpload && tab==="protocol" && (()=> {
                      const live = liveRowsFor("protocol");
                      // If backend has responded (live !== null), use it as-is — even empty arrays.
                      // Only fall back to mock while we're still loading (live === null).
                      const rows    = live ?? QC_UPLOAD_DATA.protocol;
                      return (
                      <div>
                        <div style={{padding:"12px 16px",background:isDark?"rgba(248,113,113,0.1)":"#FEF2F2",border:"1px solid #fca5a5",borderRadius:8,fontSize:15,lineHeight:1.5,color:"#f87171",marginBottom:16}}>
                          Scans where the correct file arrived but the <strong>wrong scan was done</strong> at the scanner — wrong body part, missing phase, wrong sequence, or wrong slice thickness. These files must be <strong>re-acquired or re-uploaded</strong>.
                        </div>
                        <div style={{fontSize:14,fontWeight:700,textTransform:"uppercase",letterSpacing:".05em",color:tS,marginBottom:10}}>Cases — rejection reason &amp; what to change</div>
                        <div style={{border:`1px solid ${mBdr}`,borderRadius:10,overflowX:"auto",marginBottom:18}}>
                          <table style={{width:"100%",minWidth:900,borderCollapse:"collapse"}}>
                            <thead><tr>
                              <TH ch="Patient ID"/><TH ch="Name"/><TH ch="Mod"/><TH ch="File"/><TH ch="Rejection reason"/><TH ch="What to change"/><TH ch="Check"/><TH ch="Date"/>
                            </tr></thead>
                            <tbody>{rows.length === 0 ? (
                              <tr><td colSpan={8} style={{textAlign:"center",padding:"26px 20px",color:tS,fontSize:15}}>No Metadata QC found — all uploaded cases passed ID &amp; Slice checks.</td></tr>
                            ) : rows.map((r,i)=>(
                              <tr key={r.id} style={{background:i%2===0?rBg:mBg}}>
                                <TD ch={<code style={{fontSize:13,background:isDark?"rgba(255,255,255,0.08)":"#F3F4F6",padding:"2px 7px",borderRadius:3,color:tP}}>{r.patientId}</code>}/>
                                <TD ch={<span style={{fontWeight:600}}>{r.name}</span>}/>
                                <TD ch={<ModBadge mod={r.modality}/>}/>
                                <TD ch={r.file} clr={tS}/>
                                <TD ch={<span style={{color:"#f87171"}}>{r.reason}</span>}/>
                                <TD ch={<span style={{color:"#34d399"}}>→ {r.fix}</span>}/>
                                <TD ch={<ChkBadge chk={r.check}/>}/>
                                <TD ch={r.date} clr={tS}/>
                              </tr>
                            ))}</tbody>
                          </table>
                        </div>
                        <div style={{fontSize:14,fontWeight:700,textTransform:"uppercase",letterSpacing:".05em",color:tS,marginBottom:6}}>Check thresholds for Metadata QC</div>
                        <ThreshBlock groups={buildThreshGroups(qcLive && qcLive.thresholds, "protocol") || QC_THRESHOLDS.protocol}/>
                      </div>
                      );
                    })()}

                    {isUpload && tab==="quality" && (()=> {
                      const live = liveRowsFor("quality");
                      const rows    = live ?? QC_UPLOAD_DATA.quality;
                      return (
                      <div>
                        <div style={{padding:"12px 16px",background:isDark?"rgba(251,191,36,0.1)":"#FFFBEB",border:"1px solid #fcd34d",borderRadius:8,fontSize:15,lineHeight:1.5,color:"#fbbf24",marginBottom:16}}>
                          Scans <strong>auto-rejected by Content Check or Pixel Check</strong> — blank images, severely blurry MRI, wrong HU values (CT), overexposed or underexposed X-rays. These require <strong>re-acquisition or re-export</strong>.
                        </div>
                        <div style={{fontSize:14,fontWeight:700,textTransform:"uppercase",letterSpacing:".05em",color:tS,marginBottom:10}}>Cases — rejection reason, measured value &amp; threshold</div>
                        <div style={{border:`1px solid ${mBdr}`,borderRadius:10,overflowX:"auto",marginBottom:18}}>
                          <table style={{width:"100%",minWidth:1100,borderCollapse:"collapse"}}>
                            <thead><tr>
                              <TH ch="Patient ID"/><TH ch="Name"/><TH ch="Mod"/><TH ch="File"/><TH ch="Check failed"/><TH ch="Rejection reason"/><TH ch="Measured"/><TH ch="Threshold"/><TH ch="Action"/><TH ch="Date"/>
                            </tr></thead>
                            <tbody>{rows.length === 0 ? (
                              <tr><td colSpan={10} style={{textAlign:"center",padding:"26px 20px",color:tS,fontSize:15}}>No Image QC found — all uploaded files passed Content &amp; Pixel checks.</td></tr>
                            ) : rows.map((r,i)=>(
                              <tr key={r.id} style={{background:i%2===0?rBg:mBg}}>
                                <TD ch={<code style={{fontSize:13,background:isDark?"rgba(255,255,255,0.08)":"#F3F4F6",padding:"2px 7px",borderRadius:3,color:tP}}>{r.patientId}</code>}/>
                                <TD ch={<span style={{fontWeight:600}}>{r.name}</span>}/>
                                <TD ch={<ModBadge mod={r.modality}/>}/>
                                <TD ch={r.file} clr={tS}/>
                                <TD ch={<ChkBadge chk={r.check}/>}/>
                                <TD ch={<span style={{color:"#f87171",fontSize:15}}>{r.reason}</span>}/>
                                <TD ch={<span style={{...{fontFamily:"'DM Mono',monospace"},fontSize:14,color:"#fb923c"}}>{r.failValue}</span>}/>
                                <TD ch={<span style={{...{fontFamily:"'DM Mono',monospace"},fontSize:14,color:"#34d399"}}>{r.threshold}</span>}/>
                                <TD ch={<StatusPill s={r.fix}/>}/>
                                <TD ch={r.date} clr={tS}/>
                              </tr>
                            ))}</tbody>
                          </table>
                        </div>
                        <div style={{fontSize:14,fontWeight:700,textTransform:"uppercase",letterSpacing:".05em",color:tS,marginBottom:6}}>Check thresholds for Image QC</div>
                        <ThreshBlock groups={buildThreshGroups(qcLive && qcLive.thresholds, "quality") || QC_THRESHOLDS.quality}/>
                      </div>
                      );
                    })()}

                    {isUpload && tab==="open" && (()=> {
                      // Merged 'Open queries' tab: pulls from metadata (protocol) +
                      // image quality + open warns, plus resolved items below.
                      // All live data — falls back to mock collections if backend hasn't responded.
                      const liveProt = liveRowsFor("protocol") || [];
                      const liveQual = liveRowsFor("quality")  || [];
                      const liveOpen = liveRowsFor("open")     || [];
                      const liveResolved = liveRowsFor("resolved") || [];

                      const unresolved = (qcLive === null)
                        ? QC_UPLOAD_DATA.open    // still loading → mock
                        : [...liveProt, ...liveQual, ...liveOpen].map(r => ({
                            ...r,
                            query:    r.reason || "Needs review",
                            action:   "Awaiting org response",
                            org:      "Your organisation",
                            opened:   r.date,
                            daysOpen: 0,
                          }));

                      const resolved = (qcLive === null)
                        ? QC_UPLOAD_DATA.resolved
                        : liveResolved.map(r => ({
                            ...r,
                            was:  r.reason || "QC rejected",
                            fix:  r.fix || "Acknowledged by organisation",
                            by:   "Admin",
                            time: r.date,
                          }));

                      return (
                      <div>
                        <div style={{padding:"12px 16px",background:isDark?"rgba(251,146,60,0.1)":"#FFF7ED",border:"1px solid #fdba74",borderRadius:8,fontSize:15,lineHeight:1.5,color:"#fb923c",marginBottom:16}}>
                          QC issues <strong>waiting for action</strong> — metadata &amp; Image QC plus warnings. Resolved items appear below in green.
                        </div>

                        {/* Unresolved — orange cards */}
                        {unresolved.length === 0 ? (
                          <div style={{padding:"26px 20px",textAlign:"center",color:tS,fontSize:15,background:isDark?"rgba(255,255,255,0.03)":"#f8fafc",border:`1px solid ${mBdr}`,borderRadius:10,marginBottom:16}}>
                            No open queries — nothing is currently waiting for admin or organisation review.
                          </div>
                        ) : unresolved.map(q=>{
                          const cc=QC_CHK_C[q.check]||{bg:"#333",fg:"#ccc"};
                          return (
                            <div key={q.id} style={{border:"1px solid #fb923c",borderRadius:10,marginBottom:10,overflow:"hidden"}}>
                              <div style={{display:"flex",alignItems:"flex-start",gap:12,padding:"13px 16px",background:isDark?"rgba(251,146,60,0.07)":"#FFF7ED"}}>
                                <span style={{fontSize:13,fontWeight:700,padding:"3px 8px",borderRadius:99,background:cc.bg,color:cc.fg,flexShrink:0,marginTop:2}}>{q.check}</span>
                                <div style={{flex:1}}>
                                  <div style={{fontWeight:700,fontSize:16,color:tP}}>{q.name} <span style={{color:tS,fontWeight:400,fontSize:15}}>· {q.patientId}</span> <ModBadge mod={q.modality}/></div>
                                  <div style={{fontSize:15,color:"#fb923c",margin:"5px 0"}}>{q.query}</div>
                                  <div style={{fontSize:14,color:tS}}>Assigned to: <strong style={{color:tP}}>{q.org}</strong> · Opened {q.opened} · Action: <em>{q.action}</em></div>
                                </div>
                                <span style={{fontSize:14,padding:"3px 11px",borderRadius:99,background:q.daysOpen===0?"#EAF3DE":"#FAEEDA",color:q.daysOpen===0?"#27500A":"#633806",fontWeight:700,flexShrink:0}}>{q.daysOpen===0?"Today":`${q.daysOpen}d open`}</span>
                              </div>
                            </div>
                          );
                        })}

                        {/* Resolved separator + cards below — only if there are any */}
                        {resolved.length > 0 && (
                          <>
                            <div style={{display:"flex",alignItems:"center",gap:10,margin:"22px 0 12px 0"}}>
                              <div style={{flex:1,height:1,background:mBdr}}/>
                              <span style={{fontSize:14,fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",color:"#34d399"}}>
                                ✓ Resolved ({resolved.length})
                              </span>
                              <div style={{flex:1,height:1,background:mBdr}}/>
                            </div>
                            {resolved.map(r=>{
                              const cc=QC_CHK_C[r.check]||{bg:"#333",fg:"#ccc"};
                              return (
                                <div key={r.id} style={{border:"1px solid #34d399",borderRadius:10,marginBottom:10,overflow:"hidden"}}>
                                  <div style={{display:"flex",alignItems:"flex-start",gap:12,padding:"13px 16px",background:isDark?"rgba(52,211,153,0.07)":"#F0FDF4"}}>
                                    <span style={{fontSize:13,fontWeight:700,padding:"3px 8px",borderRadius:99,background:cc.bg,color:cc.fg,flexShrink:0,marginTop:2}}>{r.check}</span>
                                    <div style={{flex:1}}>
                                      <div style={{fontWeight:700,fontSize:16,color:tP}}>{r.name} <span style={{color:tS,fontWeight:400,fontSize:15}}>· {r.patientId}</span> <ModBadge mod={r.modality}/></div>
                                      <div style={{fontSize:15,color:"#f87171",margin:"4px 0"}}>Was: {r.was}</div>
                                      <div style={{fontSize:15,color:"#34d399"}}>Fix: {r.fix}</div>
                                      <div style={{fontSize:14,color:tS,marginTop:4}}>Resolved by <strong style={{color:tP}}>{r.by}</strong> at {r.time}</div>
                                    </div>
                                    <span style={{fontSize:14,padding:"3px 11px",borderRadius:99,background:"#EAF3DE",color:"#27500A",fontWeight:700,flexShrink:0}}>✓ Resolved</span>
                                  </div>
                                </div>
                              );
                            })}
                          </>
                        )}
                      </div>
                      );
                    })()}

                    {/* ═══ REPORT MODE ═══ */}

                    {!isUpload && tab==="protocol" && (
                      <div>
                        <div style={{padding:"12px 16px",background:isDark?"rgba(248,113,113,0.1)":"#FEF2F2",border:"1px solid #fca5a5",borderRadius:8,fontSize:15,lineHeight:1.5,color:"#f87171",marginBottom:16}}>
                          Each report is checked against the <strong>4 mandatory sections</strong> — Patient Identity, Study Information, Report Content, Sign-off &amp; Legal. Green = pass · Red = error (blocks release) · Orange = warning.
                        </div>
                        {QC_REPORT_DATA.protocol.map(rep=>{
                          const allItems=[...rep.checks.identity,...rep.checks.study,...rep.checks.content,...rep.checks.signoff];
                          const errors=allItems.filter(x=>x.status==="error").length;
                          const warns=allItems.filter(x=>x.status==="warn").length;
                          const overallSt=errors>0?"error":warns>0?"warn":"pass";
                          const ovBd=overallSt==="pass"?"#97C459":overallSt==="warn"?"#EF9F27":"#F09595";
                          const ovBg=overallSt==="pass"?"#EAF3DE":overallSt==="warn"?"#FAEEDA":"#FCEBEB";
                          const ovFg=overallSt==="pass"?"#27500A":overallSt==="warn"?"#633806":"#791F1F";

                          const SECTIONS=[
                            {key:"identity", label:"Patient Identity",   bg:"#E6F1FB",fg:"#0C447C"},
                            {key:"study",    label:"Study Information",  bg:"#EEEDFE",fg:"#3C3489"},
                            {key:"content",  label:"Report Content",     bg:"#E1F5EE",fg:"#085041"},
                            {key:"signoff",  label:"Sign-off & Legal",   bg:"#FAEEDA",fg:"#633806"},
                          ];

                          return (
                            <div key={rep.id} style={{border:`1px solid ${ovBd}`,borderRadius:10,marginBottom:14,overflow:"hidden"}}>
                              {/* Report header */}
                              <div style={{padding:"11px 16px",background:isDark?"rgba(255,255,255,0.04)":"#F9FAFB",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap",borderBottom:`1px solid ${ovBd}`}}>
                                <span style={{fontWeight:700,fontSize:16,color:tP}}>{rep.name}</span>
                                <code style={{fontSize:13,background:isDark?"rgba(255,255,255,0.08)":"#F3F4F6",padding:"2px 7px",borderRadius:3,color:tS}}>{rep.patientId}</code>
                                <ModBadge mod={rep.modality}/>
                                <span style={{fontSize:14,color:tS}}>· {rep.rad} · {rep.date}</span>
                                <span style={{marginLeft:"auto",fontSize:14,fontWeight:700,padding:"3px 11px",borderRadius:99,background:ovBg,color:ovFg}}>
                                  {overallSt==="pass"?"✓ All checks passed":overallSt==="warn"?`⚠ ${warns} warning${warns>1?"s":""}`: `✗ ${errors} error${errors>1?"s":""}`}
                                </span>
                              </div>
                              {/* 4 sections grid */}
                              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:0}}>
                                {SECTIONS.map((sec,si)=>(
                                  <div key={sec.key} style={{padding:"10px 14px",borderRight:si%2===0?`1px solid ${mBdr}`:"none",borderBottom:si<2?`1px solid ${mBdr}`:"none"}}>
                                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                                      <span style={{fontSize:13,fontWeight:700,padding:"2px 8px",borderRadius:4,background:sec.bg,color:sec.fg}}>{sec.label}</span>
                                    </div>
                                    {rep.checks[sec.key].map((it,ii)=>{
                                      const dotC=it.status==="pass"?"#3B6D11":it.status==="warn"?"#BA7517":"#E24B4A";
                                      const valC=it.status==="pass"?tS:it.status==="warn"?"#BA7517":"#E24B4A";
                                      return (
                                        <div key={ii} style={{display:"flex",alignItems:"flex-start",gap:6,marginBottom:5}}>
                                          <div style={{width:7,height:7,borderRadius:"50%",background:dotC,flexShrink:0,marginTop:5}}/>
                                          <div style={{flex:1}}>
                                            <span style={{fontSize:14,fontWeight:600,color:tP}}>{it.field} </span>
                                            <span style={{fontSize:14,color:valC}}>— {it.value}</span>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {!isUpload && tab==="open" && (
                      <div>
                        <div style={{padding:"12px 16px",background:isDark?"rgba(251,146,60,0.1)":"#FFF7ED",border:"1px solid #fdba74",borderRadius:8,fontSize:15,lineHeight:1.5,color:"#fb923c",marginBottom:16}}>
                          Report content issues <strong>waiting for radiologist action</strong>. Resolved items appear below in green.
                        </div>
                        {QC_REPORT_DATA.open.map((r,i)=>{
                          const sc={error:{bg:"#FCEBEB",fg:"#791F1F",bd:"#F09595",icon:"✗"},warn:{bg:"#FAEEDA",fg:"#633806",bd:"#EF9F27",icon:"⚠"}};
                          const sv=sc[r.severity]||sc.warn;
                          const secColors={"Report Content":["#E1F5EE","#085041"],"Sign-off & Legal":["#FAEEDA","#633806"],"Study Information":["#EEEDFE","#3C3489"],"Patient Identity":["#E6F1FB","#0C447C"]};
                          const [secBg,secFg]=secColors[r.section]||["#eee","#333"];
                          return (
                            <div key={r.id} style={{border:`1px solid ${sv.bd}`,borderRadius:10,marginBottom:12,overflow:"hidden"}}>
                              <div style={{padding:"12px 16px",background:isDark?`${sv.bd}18`:`${sv.bg}66`,display:"flex",alignItems:"flex-start",gap:12}}>
                                <span style={{fontSize:14,fontWeight:700,padding:"3px 9px",borderRadius:99,background:sv.bg,color:sv.fg,flexShrink:0,marginTop:2}}>{sv.icon} {r.severity==="error"?"Error":"Warning"}</span>
                                <div style={{flex:1}}>
                                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,flexWrap:"wrap"}}>
                                    <span style={{fontWeight:700,fontSize:16,color:tP}}>{r.name}</span>
                                    <code style={{fontSize:13,background:isDark?"rgba(255,255,255,0.08)":"#F3F4F6",padding:"2px 7px",borderRadius:3,color:tS}}>{r.patientId}</code>
                                    <ModBadge mod={r.modality}/>
                                    <span style={{fontSize:13,color:tS}}>· {r.rad}</span>
                                    <span style={{marginLeft:"auto",fontSize:13,fontWeight:700,color:r.days===0?"#34d399":r.days<=1?"#fbbf24":"#f87171"}}>{r.days===0?"Today":`${r.days}d open`}</span>
                                  </div>
                                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                                    <span style={{fontSize:13,fontWeight:700,padding:"2px 8px",borderRadius:4,background:secBg,color:secFg}}>{r.section}</span>
                                    <span style={{fontSize:14,fontWeight:600,color:tP}}>→ {r.field}</span>
                                  </div>
                                  <div style={{fontSize:15,color:sv.fg,marginBottom:5}}>{r.issue}</div>
                                  <div style={{fontSize:14,color:tS}}>Action: <span style={{color:tP,fontWeight:600}}>{r.action}</span> · Assigned to: <span style={{color:tP,fontWeight:600}}>{r.assigned}</span></div>
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        {/* Resolved separator + cards */}
                        {QC_REPORT_DATA.resolved.length > 0 && (
                          <>
                            <div style={{display:"flex",alignItems:"center",gap:10,margin:"22px 0 12px 0"}}>
                              <div style={{flex:1,height:1,background:mBdr}}/>
                              <span style={{fontSize:14,fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",color:"#34d399"}}>
                                ✓ Resolved ({QC_REPORT_DATA.resolved.length})
                              </span>
                              <div style={{flex:1,height:1,background:mBdr}}/>
                            </div>
                            {QC_REPORT_DATA.resolved.map((r,i)=>{
                              const secColors={"Report Content":["#E1F5EE","#085041"],"Sign-off & Legal":["#FAEEDA","#633806"],"Study Information":["#EEEDFE","#3C3489"],"Patient Identity":["#E6F1FB","#0C447C"]};
                              const [secBg,secFg]=secColors[r.section]||["#eee","#333"];
                              return (
                                <div key={r.id} style={{border:"1px solid #34d399",borderRadius:10,marginBottom:12,overflow:"hidden"}}>
                                  <div style={{padding:"12px 16px",background:isDark?"rgba(52,211,153,0.07)":"#F0FDF4",display:"flex",alignItems:"flex-start",gap:12}}>
                                    <span style={{fontSize:14,fontWeight:700,padding:"3px 9px",borderRadius:99,background:"#EAF3DE",color:"#27500A",flexShrink:0,marginTop:2}}>✓ Resolved</span>
                                    <div style={{flex:1}}>
                                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,flexWrap:"wrap"}}>
                                        <span style={{fontWeight:700,fontSize:16,color:tP}}>{r.name}</span>
                                        <code style={{fontSize:13,background:isDark?"rgba(255,255,255,0.08)":"#F3F4F6",padding:"2px 7px",borderRadius:3,color:tS}}>{r.patientId}</code>
                                        <ModBadge mod={r.modality}/>
                                        <span style={{fontSize:13,color:tS}}>· {r.rad}</span>
                                        <span style={{marginLeft:"auto",fontSize:13,fontWeight:700,color:"#34d399"}}>{r.time}</span>
                                      </div>
                                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                                        <span style={{fontSize:13,fontWeight:700,padding:"2px 8px",borderRadius:4,background:secBg,color:secFg}}>{r.section}</span>
                                        <span style={{fontSize:14,fontWeight:600,color:tP}}>→ {r.field}</span>
                                      </div>
                                      <div style={{fontSize:15,color:"#f87171",marginBottom:6}}>Was: {r.was}</div>
                                      <div style={{fontSize:15,color:"#34d399",marginBottom:4}}>Fix: ✓ {r.fix}</div>
                                      <div style={{fontSize:14,color:tS}}>Resolved by <span style={{color:tP,fontWeight:600}}>{r.by}</span></div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </>
                        )}
                      </div>
                    )}

                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── Cases by Modality ── */}
          <div
            className="dash-card"
            style={{
              background: cardBg,
              borderRadius: 18,
              padding: 22,
              boxShadow: cardShadow,
              border: `1px solid ${cardBorder}`,
              animationDelay: "320ms",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 14,
                marginBottom: 18,
              }}
            >
              <Title color={titleClr}>Cases by Modality</Title>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
              </div>
            </div>

            <div>
              <div
                  style={{
                    background: innerBg,
                    borderRadius: 16,
                    padding: "14px 16px",
                    border: `1px solid ${innerBorder}`,
                    boxShadow: "0 4px 16px rgba(148,163,184,0.08)",
                  }}
                >
                  {modalityValueData.length === 0 ? (
                    <div style={{
                      padding: "32px 12px",
                      textAlign: "center",
                      fontSize: 14,
                      color: textSec,
                      fontStyle: "italic",
                    }}>
                      {dashData
                        ? "No case submissions for this organization yet."
                        : "Loading modality breakdown…"}
                    </div>
                  ) : modalityValueData.map((item, index) => (
                    <div
                      key={item.tag}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "48px 1fr 48px 52px",
                        alignItems: "center",
                        gap: 10,
                        padding: "12px 0",
                        borderBottom:
                          index < modalityValueData.length - 1
                            ? `1px solid ${tblBorder}`
                            : "none",
                      }}
                    >
                      {/* Tag badge */}
                      <span
                        style={{
                          ...mono,
                          fontSize: 13,
                          fontWeight: 700,
                          padding: "5px 2px",
                          borderRadius: 6,
                          textAlign: "center",
                          color: item.color,
                          background: item.bg,
                        }}
                      >
                        {item.tag}
                      </span>

                      {/* Name + bar stacked */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
                        <span
                          style={{
                            fontSize: 15,
                            color: textPri,
                            fontWeight: 500,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {item.name}
                        </span>
                        <div
                          style={{
                            width: "100%",
                            height: 4,
                            borderRadius: 999,
                            background: isDark ? "rgba(255,255,255,0.12)" : "#e2e8f0",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${item.bar}%`,
                              height: "100%",
                              borderRadius: 999,
                              background: item.color,
                            }}
                          />
                        </div>
                      </div>

                      {/* Count */}
                      <span
                        style={{
                          ...mono,
                          fontSize: 16,
                          fontWeight: 700,
                          color: textPri,
                          textAlign: "right",
                        }}
                      >
                        {item.count}
                      </span>

                      <span
                        style={{
                          fontSize: 16,
                          fontWeight: 600,
                          color: item.color,
                          textAlign: "right",
                        }}
                      >
                        {item.pct}
                      </span>
                    </div>
                  ))}
                </div>
            </div>
          </div>
        </div>

        {/* ════ ROW 3 — Active Worklist ════ */}
        <div
          className="dash-card"
          style={{
            background: cardBg,
            borderRadius: 18,
            padding: 0,
            boxShadow: cardShadow,
            border: `1px solid ${cardBorder}`,
            animationDelay: "380ms",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "18px 24px",
              borderBottom: `1px solid ${tblBorder}`,
              background: innerBg,
            }}
          >
            <div
              style={{
                fontSize: 15,
                letterSpacing: "1.5px",
                color: textSec,
                textTransform: "uppercase",
                fontWeight: 700,
              }}
            >
              Active Worklist · Priority Cases
            </div>

            {/* ── Four filter dropdowns: Status / Priority / Radiologist / Study Type ── */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              {[
                { label: "Status",      value: wlStatus,      setter: setWlStatus,      options: statusOptions },
                { label: "Priority",    value: wlPriority,    setter: setWlPriority,    options: priorityOptions },
                { label: "Radiologist", value: wlRadiologist, setter: setWlRadiologist, options: radiologistOptions },
                { label: "Study Type",  value: wlStudyType,   setter: setWlStudyType,   options: studyTypeOptions },
              ].map((f) => (
                <div
                  key={f.label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    background: "#fff",
                    border: "1px solid #cbd5e1",
                    borderRadius: 20,
                    padding: "4px 6px 4px 14px",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                  }}
                >
                  <label
                    htmlFor={`wl-${f.label}`}
                    style={{
                      ...sg,
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#64748b",
                      letterSpacing: "0.5px",
                      whiteSpace: "nowrap",
                      cursor: "pointer",
                    }}
                  >
                    {f.label}
                  </label>
                  <select
                    id={`wl-${f.label}`}
                    value={f.value}
                    onChange={(e) => f.setter(e.target.value)}
                    style={{
                      ...sg,
                      fontSize: 14,
                      fontWeight: 600,
                      color: f.value === "All" ? "#64748b" : "#1e293b",
                      background: "transparent",
                      border: "none",
                      outline: "none",
                      cursor: "pointer",
                      paddingRight: 4,
                      maxWidth: 180,
                    }}
                    title={f.value}    /* tooltip for long radiologist / study type names */
                  >
                    {f.options.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
              ))}

              {/* Show a small "Clear" affordance when any filter is active */}
              {(wlStatus !== "All" || wlPriority !== "All" ||
                wlRadiologist !== "All" || wlStudyType !== "All") && (
                <button
                  onClick={() => {
                    setWlStatus("All");
                    setWlPriority("All");
                    setWlRadiologist("All");
                    setWlStudyType("All");
                  }}
                  style={{
                    ...sg,
                    fontSize: 12,
                    fontWeight: 700,
                    padding: "6px 12px",
                    borderRadius: 16,
                    border: "1px solid #cbd5e1",
                    background: "#f1f5f9",
                    color: "#475569",
                    cursor: "pointer",
                  }}
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Scrollable worklist container — shows ~7 rows, scrolls for more.
              maxHeight tuned to header (~52px) + 7 rows (~56px each) ≈ 460px.
              Sticky <thead> keeps column labels in view while scrolling. */}
          <div style={{
            overflowX: "auto",
            overflowY: "auto",
            maxHeight: 460,
            border: `1px solid ${tblHdrBorder}`,
            borderRadius: 12,
          }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: tblHeadBg }}>
                  {[
                    "Priority",
                    "Case ID",
                    "Modality",
                    "Study Type",
                    "Received",
                    "TAT Left",
                    "Assigned To",
                    "Status",
                    "Files",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        ...sg,
                        fontSize: 15,
                        letterSpacing: "1.5px",
                        color: isDark ? "#ffffff" : "#0f172a",
                        textTransform: "uppercase",
                        padding: "12px 18px",
                        textAlign: "left",
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                        borderBottom: `1px solid ${tblHdrBorder}`,
                        // Sticky header stays pinned while body scrolls.
                        // Background MUST be fully opaque — semi-transparent
                        // tblHeadBg lets rows bleed through visually.
                        position: "sticky",
                        top: 0,
                        zIndex: 3,
                        background: isDark ? "#1e293b" : "#f1f5f9",
                        boxShadow: isDark
                          ? "0 1px 0 rgba(255,255,255,0.10)"
                          : "0 1px 0 #e2e8f0",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {filteredWL.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{
                      padding: "32px 18px",
                      textAlign: "center",
                      fontSize: 14,
                      color: textSec,
                      fontStyle: "italic",
                    }}>
                      {dashData
                        ? "No active cases for this organization."
                        : "Loading active worklist…"}
                    </td>
                  </tr>
                ) : filteredWL.map((r) => {
                  const ssDark = {
                    reading: { bg: "rgba(59,130,246,0.10)", color: "#2563eb" },
                    overdue: { bg: "rgba(239,68,68,0.10)", color: "#dc2626" },
                    pending: { bg: "rgba(245,158,11,0.10)", color: "#d97706" },
                    complete: { bg: "rgba(16,185,129,0.10)", color: "#059669" },
                  }[r.sk] || { bg: "rgba(148,163,184,0.10)", color: "#64748b" };

                  return (
                    <tr
                      key={r.id}
                      className="wl-row"
                      style={{
                        borderTop: `1px solid ${tblBorder}`,
                        background: tblRowBg,
                      }}
                    >
                      <td style={{ padding: "13px 18px", whiteSpace: "nowrap" }}>
                        <span
                          style={{
                            display: "inline-block",
                            width: 9,
                            height: 9,
                            borderRadius: "50%",
                            background: r.pColor,
                            marginRight: 9,
                            verticalAlign: "middle",
                            boxShadow: `0 0 6px ${r.pColor}80`,
                          }}
                        />
                        <span
                          style={{
                            fontSize: 15,
                            color: textPri,
                            fontWeight: 700,
                          }}
                        >
                          {r.priority}
                        </span>
                      </td>

                      <td
                        style={{
                          ...mono,
                          padding: "13px 18px",
                          fontSize: 15,
                          color: textSec,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {r.id}
                      </td>

                      <td style={{ padding: "13px 18px" }}>
                        <span
                          style={{
                            ...mono,
                            fontSize: 15,
                            fontWeight: 700,
                            background: r.mBg,
                            color: r.mColor,
                            padding: "3px 10px",
                            borderRadius: 6,
                          }}
                        >
                          {r.mod}
                        </span>
                      </td>

                      <td
                        style={{
                          padding: "13px 18px",
                          fontSize: 15,
                          color: textPri,
                          fontWeight: 600,
                        }}
                      >
                        {r.study}
                      </td>

                      <td
                        style={{
                          ...mono,
                          padding: "13px 18px",
                          fontSize: 15,
                          color: textSec,
                        }}
                      >
                        {r.recv}
                      </td>

                      <td
                        style={{
                          ...mono,
                          padding: "13px 18px",
                          fontSize: 15,
                          fontWeight: 700,
                          color: r.tatColor,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {r.tat}
                      </td>

                      <td
                        style={{
                          padding: "13px 18px",
                          fontSize: 15,
                          color:
                            r.assignee === "Unassigned"
                              ? "#d97706"
                              : textPri,
                          fontWeight:
                            r.assignee === "Unassigned" ? 700 : 600,
                        }}
                      >
                        {r.assignee}
                      </td>

                      <td style={{ padding: "13px 18px" }}>
                        <span
                          style={{
                            ...sg,
                            fontSize: 15,
                            padding: "4px 12px",
                            borderRadius: 6,
                            background: ssDark.bg,
                            color: ssDark.color,
                            fontWeight: 700,
                            letterSpacing: "0.5px",
                          }}
                        >
                          {r.status}
                        </span>
                      </td>

                      {/* ── Files / View button ── */}
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                        <button
                          onClick={() => navigate(`/organization/scan-view/${r.id}`)}
                          title={`View scan files for ${r.id}`}
                          style={{
                            ...sg,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            fontSize: 13,
                            fontWeight: 700,
                            padding: "6px 14px",
                            borderRadius: 8,
                            border: "1.5px solid rgba(96,165,250,0.55)",
                            background: "rgba(37,99,235,0.10)",
                            color: "#60a5fa",
                            cursor: "pointer",
                            letterSpacing: "0.3px",
                            transition: "background 0.15s, border-color 0.15s",
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.background = "rgba(37,99,235,0.22)";
                            e.currentTarget.style.borderColor = "#60a5fa";
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.background = "rgba(37,99,235,0.10)";
                            e.currentTarget.style.borderColor = "rgba(96,165,250,0.55)";
                          }}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                               stroke="currentColor" strokeWidth="2.2"
                               strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12S5 4 12 4s11 8 11 8-4 8-11 8S1 12 1 12z"/>
                            <circle cx="12" cy="12" r="3"/>
                          </svg>
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Completed Today Cases Modal ── */}
      {completedCasesModal && (
        <div
          onClick={() => setCompletedCasesModal(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 20000,
            background: "rgba(0,0,0,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 1260,
              maxHeight: "88vh",
              background: isDark ? "#0f172a" : "#ffffff",
              border: `1px solid ${isDark ? "rgba(255,255,255,0.10)" : "#e2e8f0"}`,
              borderRadius: 20,
              overflow: "hidden",
              boxShadow: "0 24px 60px rgba(0,0,0,0.40)",
              display: "flex", flexDirection: "column",
            }}
          >
            {/* Header */}
            <div style={{
              background: "linear-gradient(135deg,#064e3b 0%,#065f46 45%,#059669 100%)",
              padding: "20px 28px",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              flexShrink: 0,
            }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "2px", color: "rgba(255,255,255,0.6)", textTransform: "uppercase", marginBottom: 4 }}>
                  Completed Cases
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#fff", fontFamily: "'DM Mono',monospace", lineHeight: 1 }}>
                  {COMPLETED_CASES.length} Cases
                </div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>
                  {dashData?.kpis?.completed?.avg_tat_hours != null
                    ? `Avg TAT ${dashData.kpis.completed.avg_tat_hours}h · ${new Date().toLocaleDateString(undefined, { day:"2-digit", month:"short", year:"numeric" })}`
                    : `↑ 8.4% vs target · ${new Date().toLocaleDateString(undefined, { day:"2-digit", month:"short", year:"numeric" })}`}
                </div>
              </div>
              {/* Stats badges */}
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                {[
                  { label: isTh ? "เร่งด่วนพิเศษ" : "STAT",    value: COMPLETED_CASES.filter(c => c.priority === "STAT").length,    color: "#f87171" },
                  { label: isTh ? "เร่งด่วน" : "Urgent",        value: COMPLETED_CASES.filter(c => c.priority === "Urgent").length,  color: "#fbbf24" },
                  { label: isTh ? "ปกติ" : "Routine",           value: COMPLETED_CASES.filter(c => c.priority === "Routine").length, color: "#34d399" },
                  { label: isTh ? "TAT เฉลี่ย" : "Avg TAT",    value: dashData?.kpis?.completed?.avg_tat_hours != null ? `${dashData.kpis.completed.avg_tat_hours}h` : "—", color: "#60a5fa" },
                ].map(s => (
                  <div key={s.label} style={{
                    background: "rgba(255,255,255,0.12)", borderRadius: 10,
                    padding: "8px 14px", textAlign: "center",
                  }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: s.color, fontFamily: "'DM Mono',monospace" }}>{s.value}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", fontWeight: 600, marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
                <button
                  onClick={() => setCompletedCasesModal(false)}
                  style={{
                    background: "rgba(255,255,255,0.15)", border: "none",
                    borderRadius: 10, color: "#fff", width: 34, height: 34,
                    cursor: "pointer", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center",
                    marginLeft: 6,
                  }}
                >×</button>
              </div>
            </div>

            {/* Table */}
            <div className="modal-scroll-green" style={{ overflowY: "scroll", overflowX: "hidden", flex: 1 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
                  <tr style={{ background: isDark ? "rgba(15,23,42,0.98)" : "#f8fafc" }}>
                    {["Case ID", "Uploaded", "Modality", "Study Type", "Priority", "Completed", "Assigned To", "Download"].map(h => (
                      <th key={h} style={{
                        ...sg,
                        fontSize: 11, letterSpacing: "1.2px", fontWeight: 700,
                        color: isDark ? "rgba(255,255,255,0.5)" : "#64748b",
                        textTransform: "uppercase",
                        padding: "12px 16px", textAlign: "left", whiteSpace: "nowrap",
                        borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "#e2e8f0"}`,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {COMPLETED_CASES.map((c, i) => (
                    <tr key={c.caseId} style={{
                      background: i % 2 === 0
                        ? (isDark ? "rgba(255,255,255,0.02)" : "#fff")
                        : (isDark ? "rgba(255,255,255,0.04)" : "#f8fafc"),
                      borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.05)" : "#f1f5f9"}`,
                    }}>
                      {/* Case ID */}
                      <td style={{ ...mono, padding: "12px 16px", fontSize: 13, fontWeight: 600, color: "#34d399", whiteSpace: "nowrap" }}>
                        {c.caseId}
                      </td>
                      {/* Uploaded */}
                      <td style={{ ...mono, padding: "12px 16px", fontSize: 12, color: textSec, whiteSpace: "nowrap" }}>
                        {c.uploadedAt}
                      </td>
                      {/* Modality */}
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{
                          ...mono, fontSize: 12, fontWeight: 700,
                          background: c.modBg, color: c.modColor,
                          padding: "3px 10px", borderRadius: 6,
                        }}>{c.modality}</span>
                      </td>
                      {/* Study Type */}
                      <td style={{ padding: "12px 16px", fontSize: 13, color: textPri, fontWeight: 500, minWidth: 180 }}>
                        {c.studyType}
                      </td>
                      {/* Priority */}
                      <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 5,
                          fontSize: 12, fontWeight: 700, color: c.priorityColor,
                        }}>
                          <span style={{
                            width: 7, height: 7, borderRadius: "50%",
                            background: c.priorityColor,
                            boxShadow: `0 0 5px ${c.priorityColor}80`,
                            display: "inline-block",
                          }} />
                          {c.priority}
                        </span>
                      </td>
                      {/* Completed */}
                      <td style={{ ...mono, padding: "12px 16px", fontSize: 12, color: "#34d399", whiteSpace: "nowrap" }}>
                        {c.completedAt}
                      </td>
                      {/* Assigned To */}
                      <td style={{ padding: "12px 16px", fontSize: 13, color: textPri, fontWeight: 500, whiteSpace: "nowrap" }}>
                        {c.assignedTo}
                      </td>
                      {/* Download */}
                      <td style={{ padding: "12px 16px" }}>
                        <button
                          onClick={() => handleDownloadCase(c)}
                          disabled={downloadingCase === c.caseId}
                          style={{
                            ...sg,
                            display: "inline-flex", alignItems: "center", gap: 6,
                            padding: "7px 14px", borderRadius: 8, border: "none",
                            background: downloadingCase === c.caseId
                              ? "rgba(52,211,153,0.15)"
                              : "linear-gradient(135deg,#065f46,#059669)",
                            color: downloadingCase === c.caseId ? "#34d399" : "#fff",
                            fontSize: 12, fontWeight: 700, cursor: downloadingCase === c.caseId ? "wait" : "pointer",
                            whiteSpace: "nowrap",
                            transition: "opacity 0.2s",
                            boxShadow: downloadingCase === c.caseId ? "none" : "0 2px 8px rgba(5,150,105,0.35)",
                          }}
                        >
                          {downloadingCase === c.caseId ? (
                            <>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1s linear infinite" }}>
                                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                              </svg>
                              Downloading…
                            </>
                          ) : (
                            <>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                <polyline points="7 10 12 15 17 10"/>
                                <line x1="12" y1="15" x2="12" y2="3"/>
                              </svg>
                              Download
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div style={{
              padding: "12px 24px",
              borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "#e2e8f0"}`,
              display: "flex", alignItems: "center", justifyContent: "space-between",
              flexShrink: 0,
              background: isDark ? "rgba(15,23,42,0.98)" : "#f8fafc",
            }}>
              <span style={{ fontSize: 12, color: textMuted }}>
                Showing {COMPLETED_CASES.length} completed case{COMPLETED_CASES.length === 1 ? "" : "s"} · {new Date().toLocaleDateString(undefined, { day:"2-digit", month:"short", year:"numeric" })}
              </span>
              <span style={{ fontSize: 12, color: textMuted }}>
                Downloads include radiologist report + scan images (ZIP)
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Routine Queue Cases Modal (case_workflow) ── */}
      {routineQueueModal && (
        <div
          onClick={() => setRoutineQueueModal(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 20000,
            background: "rgba(0,0,0,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 1100,
              maxHeight: "90vh",
              background: isDark ? "#0f172a" : "#ffffff",
              border: `1px solid ${isDark ? "rgba(255,255,255,0.10)" : "#e2e8f0"}`,
              borderRadius: 20,
              overflow: "hidden",
              boxShadow: "0 24px 60px rgba(0,0,0,0.40)",
              display: "flex", flexDirection: "column",
            }}
          >
            {/* ── Header ── */}
            <div style={{
              background: "linear-gradient(135deg,#1e1b4b 0%,#1e3a8a 45%,#2563eb 100%)",
              padding: "20px 28px",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              flexShrink: 0,
            }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "2px", color: "rgba(255,255,255,0.6)", textTransform: "uppercase", marginBottom: 4 }}>
                  Case Queue
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#fff", fontFamily: "'DM Mono',monospace", lineHeight: 1 }}>
                  {WORKFLOW_CASES.length} Cases
                </div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>
                  {wfByTab.Critical.length} critical · {wfByTab.Urgent.length} urgent · {new Date().toLocaleDateString(undefined, { day:"2-digit", month:"short", year:"numeric" })}
                </div>
              </div>

              {/* ── Priority tab buttons (top-right) ── */}
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {[
                  { key: "Critical", color: "#f87171", count: wfByTab.Critical.length },
                  { key: "Urgent",   color: "#fbbf24", count: wfByTab.Urgent.length   },
                  { key: "Routine",  color: "#60a5fa", count: wfByTab.Routine.length  },
                ].map(tab => {
                  const active = queueTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setQueueTab(tab.key)}
                      style={{
                        ...sg,
                        display: "flex", flexDirection: "column", alignItems: "center",
                        padding: "8px 16px", borderRadius: 10, cursor: "pointer",
                        border: active ? `2px solid ${tab.color}` : "2px solid rgba(255,255,255,0.18)",
                        background: active ? `${tab.color}22` : "rgba(255,255,255,0.10)",
                        transition: "all 0.15s",
                        outline: "none",
                        minWidth: 72,
                      }}
                    >
                      <span style={{ fontSize: 18, fontWeight: 700, color: tab.color, fontFamily: "'DM Mono',monospace", lineHeight: 1 }}>
                        {tab.count}
                      </span>
                      <span style={{ fontSize: 10, color: active ? tab.color : "rgba(255,255,255,0.55)", fontWeight: 700, marginTop: 3, letterSpacing: "0.5px" }}>
                        {tab.key.toUpperCase()}
                      </span>
                    </button>
                  );
                })}
                <button
                  onClick={() => setRoutineQueueModal(false)}
                  style={{
                    background: "rgba(255,255,255,0.15)", border: "none",
                    borderRadius: 10, color: "#fff", width: 34, height: 34,
                    cursor: "pointer", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center",
                    marginLeft: 6,
                  }}
                >×</button>
              </div>
            </div>

            {/* ── Table ── */}
            <div className="modal-scroll" style={{ overflowY: "scroll", flex: 1 }}>
              {wfLoading && WORKFLOW_CASES.length === 0 ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 160, color: textMuted, fontSize: 13 }}>
                  Loading cases…
                </div>
              ) : wfTabRows.length === 0 ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 160, color: textMuted, fontSize: 13 }}>
                  No {queueTab.toLowerCase()} cases assigned
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
                    <tr style={{ background: isDark ? "rgba(15,23,42,0.98)" : "#f8fafc" }}>
                      {["Case ID", "Uploaded", "Modality", "Study Type", "Priority", "Status", "Radiologist"].map(h => (
                        <th key={h} style={{
                          ...sg,
                          fontSize: 11, letterSpacing: "1.2px", fontWeight: 700,
                          color: isDark ? "rgba(255,255,255,0.5)" : "#64748b",
                          textTransform: "uppercase",
                          padding: "12px 16px", textAlign: "left", whiteSpace: "nowrap",
                          borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "#e2e8f0"}`,
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {wfTabRows.map((c, i) => {
                      const sm = STATUS_META[c.status] || STATUS_META.Assigned;
                      return (
                        <tr key={c.caseId} style={{
                          background: i % 2 === 0
                            ? (isDark ? "rgba(255,255,255,0.02)" : "#fff")
                            : (isDark ? "rgba(255,255,255,0.04)" : "#f8fafc"),
                          borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.05)" : "#f1f5f9"}`,
                        }}>
                          {/* Case ID */}
                          <td style={{ ...mono, padding: "12px 16px", fontSize: 13, fontWeight: 600, color: "#60a5fa", whiteSpace: "nowrap" }}>
                            {c.caseId}
                          </td>
                          {/* Uploaded */}
                          <td style={{ ...mono, padding: "12px 16px", fontSize: 12, color: textSec, whiteSpace: "nowrap" }}>
                            {c.uploadedAt}
                          </td>
                          {/* Modality */}
                          <td style={{ padding: "12px 16px" }}>
                            <span style={{
                              ...mono, fontSize: 12, fontWeight: 700,
                              background: c.modBg, color: c.modColor,
                              padding: "3px 10px", borderRadius: 6,
                            }}>{c.modality}</span>
                          </td>
                          {/* Study Type */}
                          <td style={{ padding: "12px 16px", fontSize: 13, color: textPri, fontWeight: 500, minWidth: 180 }}>
                            {c.studyType}
                          </td>
                          {/* Priority */}
                          <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700, color: c.priorityColor }}>
                              <span style={{
                                width: 7, height: 7, borderRadius: "50%",
                                background: c.priorityColor, boxShadow: `0 0 5px ${c.priorityColor}80`,
                                display: "inline-block",
                              }} />
                              {c.priority}
                            </span>
                          </td>
                          {/* Status */}
                          <td style={{ padding: "12px 16px" }}>
                            <span style={{
                              ...sg, display: "inline-flex", alignItems: "center", gap: 6,
                              fontSize: 11, fontWeight: 700, color: sm.color, background: sm.bg,
                              padding: "3px 10px", borderRadius: 20,
                            }}>
                              <span style={{ width: 5, height: 5, borderRadius: "50%", background: sm.color, display: "inline-block" }} />
                              {c.status}
                            </span>
                          </td>
                          {/* Radiologist */}
                          <td style={{ padding: "12px 16px", fontSize: 13, color: textPri, fontWeight: 500, whiteSpace: "nowrap" }}>
                            {c.radiologist}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* ── Footer ── */}
            <div style={{
              padding: "12px 24px",
              borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "#e2e8f0"}`,
              display: "flex", alignItems: "center", justifyContent: "space-between",
              flexShrink: 0,
              background: isDark ? "rgba(15,23,42,0.98)" : "#f8fafc",
            }}>
              <span style={{ fontSize: 12, color: textMuted }}>
                Showing {wfTabRows.length} {queueTab.toLowerCase()} case{wfTabRows.length === 1 ? "" : "s"} · {new Date().toLocaleDateString(undefined, { day:"2-digit", month:"short", year:"numeric" })}
              </span>
              <span style={{ fontSize: 12, color: textMuted }}>
                Cases auto-assigned from workflow · click View to open scan
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Pending / Overdue Cases Modal ── */}
      {pendingOverdueModal && (
        <div
          onClick={() => setPendingOverdueModal(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 20000,
            background: "rgba(0,0,0,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 960,
              maxHeight: "88vh",
              background: isDark ? "#0f172a" : "#ffffff",
              border: `1px solid ${isDark ? "rgba(255,255,255,0.10)" : "#e2e8f0"}`,
              borderRadius: 20,
              overflow: "hidden",
              boxShadow: "0 24px 60px rgba(0,0,0,0.40)",
              display: "flex", flexDirection: "column",
            }}
          >
            {/* Header */}
            <div style={{
              background: "linear-gradient(135deg,#451a03 0%,#78350f 45%,#d97706 100%)",
              padding: "20px 28px",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              flexShrink: 0,
            }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "2px", color: "rgba(255,255,255,0.6)", textTransform: "uppercase", marginBottom: 4 }}>
                  Pending / Overdue
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#fff", fontFamily: "'DM Mono',monospace", lineHeight: 1 }}>
                  {PENDING_OVERDUE_CASES.length} Cases
                </div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>
                  {isTh
                    ? `การละเมิด SLA: ${dashData?.kpis?.pending_overdue?.sla_breach ?? 0} · วิกฤต: ${dashData?.kpis?.pending_overdue?.critical ?? 0} · ${new Date().toLocaleDateString(undefined, { day:"2-digit", month:"short", year:"numeric" })}`
                    : `SLA breach: ${dashData?.kpis?.pending_overdue?.sla_breach ?? 0} · Critical: ${dashData?.kpis?.pending_overdue?.critical ?? 0} · ${new Date().toLocaleDateString(undefined, { day:"2-digit", month:"short", year:"numeric" })}`}
                </div>
              </div>
              {/* Summary badges */}
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                {[
                  { label: "Critical",   value: PENDING_OVERDUE_CASES.filter(c => c.pendingStatus === "Critical").length,   ...PENDING_STATUS_META["Critical"]   },
                  { label: "SLA Breach", value: PENDING_OVERDUE_CASES.filter(c => c.pendingStatus === "SLA Breach").length, ...PENDING_STATUS_META["SLA Breach"] },
                  { label: "Overdue",    value: PENDING_OVERDUE_CASES.filter(c => c.pendingStatus === "Overdue").length,    ...PENDING_STATUS_META["Overdue"]    },
                  { label: "Pending",    value: PENDING_OVERDUE_CASES.filter(c => c.pendingStatus === "Pending").length,    ...PENDING_STATUS_META["Pending"]    },
                ].map(s => (
                  <div key={s.label} style={{
                    background: "rgba(255,255,255,0.12)", borderRadius: 10,
                    padding: "8px 14px", textAlign: "center",
                  }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: s.color, fontFamily: "'DM Mono',monospace" }}>{s.value}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", fontWeight: 600, marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
                <button
                  onClick={() => setPendingOverdueModal(false)}
                  style={{
                    background: "rgba(255,255,255,0.15)", border: "none",
                    borderRadius: 10, color: "#fff", width: 34, height: 34,
                    cursor: "pointer", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center",
                    marginLeft: 6,
                  }}
                >×</button>
              </div>
            </div>

            {/* Table */}
            <div className="modal-scroll-amber" style={{ overflowY: "scroll", flex: 1 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
                  <tr style={{ background: isDark ? "rgba(15,23,42,0.98)" : "#f8fafc" }}>
                    {["Case ID", "Uploaded", "Modality", "Study Type", "Priority", "Status"].map(h => (
                      <th key={h} style={{
                        ...sg,
                        fontSize: 11, letterSpacing: "1.2px", fontWeight: 700,
                        color: isDark ? "rgba(255,255,255,0.5)" : "#64748b",
                        textTransform: "uppercase",
                        padding: "12px 16px", textAlign: "left", whiteSpace: "nowrap",
                        borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "#e2e8f0"}`,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PENDING_OVERDUE_CASES.map((c, i) => {
                    const sm = PENDING_STATUS_META[c.pendingStatus];
                    return (
                      <tr key={c.caseId} style={{
                        background: i % 2 === 0
                          ? (isDark ? "rgba(255,255,255,0.02)" : "#fff")
                          : (isDark ? "rgba(255,255,255,0.04)" : "#f8fafc"),
                        borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.05)" : "#f1f5f9"}`,
                      }}>
                        {/* Case ID */}
                        <td style={{ ...mono, padding: "12px 16px", fontSize: 13, fontWeight: 600, color: "#fbbf24", whiteSpace: "nowrap" }}>
                          {c.caseId}
                        </td>
                        {/* Uploaded */}
                        <td style={{ ...mono, padding: "12px 16px", fontSize: 12, color: textSec, whiteSpace: "nowrap" }}>
                          {c.uploadedAt}
                        </td>
                        {/* Modality */}
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{
                            ...mono, fontSize: 12, fontWeight: 700,
                            background: c.modBg, color: c.modColor,
                            padding: "3px 10px", borderRadius: 6,
                          }}>{c.modality}</span>
                        </td>
                        {/* Study Type */}
                        <td style={{ padding: "12px 16px", fontSize: 13, color: textPri, fontWeight: 500, minWidth: 200 }}>
                          {c.studyType}
                        </td>
                        {/* Priority */}
                        <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: 5,
                            fontSize: 12, fontWeight: 700, color: c.priorityColor,
                          }}>
                            <span style={{
                              width: 7, height: 7, borderRadius: "50%",
                              background: c.priorityColor,
                              boxShadow: `0 0 5px ${c.priorityColor}80`,
                              display: "inline-block",
                            }} />
                            {c.priority}
                          </span>
                        </td>
                        {/* Pending Status */}
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{
                            ...sg,
                            display: "inline-flex", alignItems: "center", gap: 6,
                            fontSize: 12, fontWeight: 700,
                            color: sm.color,
                            background: sm.bg,
                            padding: "4px 12px", borderRadius: 20,
                          }}>
                            <span style={{
                              width: 6, height: 6, borderRadius: "50%",
                              background: sm.color, display: "inline-block",
                            }} />
                            {c.pendingStatus}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div style={{
              padding: "12px 24px",
              borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "#e2e8f0"}`,
              display: "flex", alignItems: "center", justifyContent: "space-between",
              flexShrink: 0,
              background: isDark ? "rgba(15,23,42,0.98)" : "#f8fafc",
            }}>
              <span style={{ fontSize: 12, color: textMuted }}>
                Showing {PENDING_OVERDUE_CASES.length} pending / overdue case{PENDING_OVERDUE_CASES.length === 1 ? "" : "s"} · {new Date().toLocaleDateString(undefined, { day:"2-digit", month:"short", year:"numeric" })}
              </span>
              <span style={{ fontSize: 12, color: textMuted }}>
                Critical &amp; SLA Breach cases require immediate escalation
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── KPI Detail Modal ── */}
      {kpiModal && (() => {
        const modalData = {
          "Completed Cases": {
            accent: "#34d399",
            headerBg: "linear-gradient(135deg,#064e3b,#059669)",
            rows: [
              { label: "CT Scans",           value: "98",  note: "31%" },
              { label: "MRI Studies",         value: "75",  note: "24%" },
              { label: "X-Ray / Radiography", value: "65",  note: "21%" },
              { label: "Ultrasound",          value: "47",  note: "15%" },
              { label: "PET-CT / Nuclear",    value: "27",  note: "9%" },
            ],
            stats: [
              { label: "vs Yesterday",   value: "+28",  color: "#34d399" },
              { label: "vs Target",      value: "+8.4%",color: "#34d399" },
              { label: "Avg TAT",        value: "7.6h", color: "#60a5fa" },
              { label: "Top Radiologist",value: "Dr. R. Mehta", color: "#a78bfa" },
            ],
          },
          "Case Queue": {
            accent: "#60a5fa",
            headerBg: "linear-gradient(135deg,#1e3a8a,#2563eb)",
            rows: [
              { label: "STAT Cases",     value: "6",   note: "Critical" },
              { label: "Urgent Cases",   value: "41",  note: "High" },
              { label: "Routine Cases",  value: "153", note: "Normal" },
              { label: "Unassigned",     value: "34",  note: "Pending" },
              { label: "Oldest Waiting", value: "4.2h",note: "Since 09:00" },
            ],
            stats: [
              { label: "STAT",      value: "6",    color: "#f87171" },
              { label: "Urgent",    value: "41",   color: "#fbbf24" },
              { label: "Sites",     value: "7",    color: "#60a5fa" },
              { label: "Avg Wait",  value: "1.8h", color: "#34d399" },
            ],
          },
          "Pending / Overdue": {
            accent: "#fbbf24",
            headerBg: "linear-gradient(135deg,#78350f,#d97706)",
            rows: [
              { label: "SLA Breached",    value: "17",  note: "Escalate" },
              { label: "Critical Cases",  value: "6",   note: "Immediate" },
              { label: "STAT Overdue",    value: "8",   note: "Overdue" },
              { label: "Urgent Overdue",  value: "23",  note: "Overdue" },
              { label: "Routine Delayed", value: "193", note: "Delayed" },
            ],
            stats: [
              { label: "SLA Breach", value: "17",  color: "#f87171" },
              { label: "Critical",   value: "6",   color: "#f87171" },
              { label: "Sites Affected", value: "5", color: "#fbbf24" },
              { label: "Avg Delay",  value: "3.4h",color: "#fb923c" },
            ],
          },
        }[kpiModal];

        const kpi = kpis.find(k => k.label === kpiModal);
        const modalBg = isDark ? "#0f172a" : "#ffffff";
        const modalBorder = isDark ? "rgba(255,255,255,0.10)" : "#e2e8f0";
        const rowBg = isDark ? "rgba(255,255,255,0.04)" : "#f8fafc";
        const rowBorder = isDark ? "rgba(255,255,255,0.06)" : "#f1f5f9";

        return (
          <div
            onClick={() => setKpiModal(null)}
            style={{
              position: "fixed", inset: 0, zIndex: 20000,
              background: "rgba(0,0,0,0.45)",
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: 24,
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                width: "100%", maxWidth: 420,
                background: modalBg,
                border: `1px solid ${modalBorder}`,
                borderRadius: 20,
                overflow: "hidden",
                boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
              }}
            >
              {/* Header */}
              <div style={{ background: kpi.bg, padding: "20px 22px", position: "relative" }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1.5px", color: "rgba(255,255,255,0.6)", textTransform: "uppercase", marginBottom: 6 }}>
                  {kpiModal}
                </div>
                <div style={{ fontSize: 42, fontWeight: 700, color: "#fff", lineHeight: 1, fontFamily: "'DM Mono',monospace" }}>
                  {kpi.value}
                </div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 6 }}>{kpi.sub}</div>
                <button
                  onClick={() => setKpiModal(null)}
                  style={{
                    position: "absolute", top: 14, right: 14,
                    background: "rgba(255,255,255,0.15)", border: "none",
                    borderRadius: 8, color: "#fff", width: 28, height: 28,
                    cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >×</button>
              </div>

              {/* Stats row */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 1, background: modalBorder }}>
                {modalData.stats.map(s => (
                  <div key={s.label} style={{ background: modalBg, padding: "12px 8px", textAlign: "center" }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: s.color, fontFamily: "'DM Mono',monospace" }}>{s.value}</div>
                    <div style={{ fontSize: 10, color: textSec, marginTop: 3, fontWeight: 600 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Breakdown rows */}
              <div style={{ padding: "10px 0 8px" }}>
                {modalData.rows.map((r, i) => (
                  <div key={r.label} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 22px",
                    background: i % 2 === 0 ? rowBg : modalBg,
                    borderBottom: `1px solid ${rowBorder}`,
                  }}>
                    <span style={{ fontSize: 13, color: textPri, fontWeight: 500 }}>{r.label}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: modalData.accent, fontFamily: "'DM Mono',monospace" }}>{r.value}</span>
                      <span style={{ fontSize: 11, color: textSec, background: rowBg, padding: "2px 8px", borderRadius: 20, border: `1px solid ${modalBorder}` }}>{r.note}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

    </>
  );
}
