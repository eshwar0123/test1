import React, { useEffect, useMemo, useState } from 'react';
import AvailabilitySchedule from "../availability/AvailabilitySchedule";
import { useTheme } from "../../layout/ThemeContext";

const CONFIG = {
  layout: {
    pagePadding: '18px 20px',
    sectionGap: '18px',
    panelGap: '16px',
    leftCardWidth: '40%',
    rightCardWidth: '60%',
    bottomCardWidth: '100%',
    topCardsMinHeight: '240px',
    bottomCardMinHeight: '520px',
    organisationInnerMinHeight: '165px',
    radiologistStatsMinHeight: '165px',
    liveVisibleRows: 6,
    liveTableHeaderHeight: 56,
    liveTableRowHeight: 64,
    modalMaxWidth: '1760px',
    modalTableMinWidth: '1680px',
  },
  cards: {
    leftCard: { radius: '16px', padding: '20px' },
    rightCard: { radius: '16px', padding: '20px' },
    bottomCard: { radius: '16px', padding: '18px' },
    statCard: { radius: '14px', padding: '20px 16px', minHeight: '170px' },
    miniCard: { radius: '14px', padding: '18px 16px', minHeight: '210px' },
    modalRadius: '18px',
    statsGap: '14px',
  },
  fonts: {
    min: '15px',
    xs: '15px',
    sm: '15px',
    md: '16px',
    lg: '18px',
    xl: '20px',
    title: '22px',
    sectionTitle: '24px',
    bigNumber: '54px',
    statNumber: '46px',
    modalTitle: '30px',
    badge: '15px',
    tableHeader: '15px',
    tableCell: '15px',
    timer: '15px',
  },
  colors: {
    pageBg: '#eef2f7',
    cardBg: '#ffffff',
    cardBorder: '#e2e8f0',
    primary: '#1e3a5f',
    primaryLight: '#2d5a8e',
    critical: '#ef4444',
    criticalBadge: '#fee2e2',
    urgent: '#f59e0b',
    urgentBadge: '#fef3c7',
    success: '#10b981',
    successBadge: '#dcfce7',
    info: '#3b82f6',
    infoBadge: '#dbeafe',
    text: '#1e293b',
    textMuted: '#64748b',
    textLight: '#94a3b8',
    pendingTimer: '#ef4444',
    workingTimer: '#3b82f6',
    completedTimer: '#10b981',
    headerGradient: 'linear-gradient(135deg,#1e3a5f 0%,#2d5a8e 100%)',
    liveCardGradient: 'linear-gradient(135deg,#0f2744 0%,#1e3a5f 55%,#0d4f7a 100%)',
  },
  labels: {
    orgHeader: 'Organisation',
    totalCases: 'Total Cases',
    qcCases: 'QC Cases',
    scansCompleted: 'Scans Completed',
    radioHeader: 'Radiologist Panel',
    assigned2: 'Assigned',
    rejected: 'Rejected Cases',
    reassigned: 'Reassigned',
    cases: 'Cases',
    reportQc: 'Report QC',
    liveTitle: 'Live Assignments',
    historyBtn: '🕘 History',
    overall: 'Overall',
    today: 'Today',
    custom: 'Custom',
    modalTitle: 'Assignment History',
    thIndex: '#',
    thInTime: 'In Time',
    thCaseId: 'Case ID',
    thOrg: 'Organisation',
    thPriority: 'Priority',
    thType: 'Type',
    thRadiologist: 'Radiologist',
    thSpecial: 'Specialisation',
    thAvail: 'Availability',
    thStatus: 'Status',
    thPending: 'Pending Time',
    thReceived: 'Received',
    thWorkTime: 'Working Time',
  },
};

const _now = Date.now();
const mins = (n) => _now - n * 60 * 1000;

const SAMPLE_LIVE = [
  { id:'L001', caseId:'C-20240101', org:'Apollo Hospitals',   priority:'critical', type:'MRI',   inTime:mins(47),  radiologist:'Dr. Priya Menon',   specialisation:'MRI Expert',          availability:'9:00 AM – 5:00 PM',  status:'working',   receivedTime:mins(30),  completedTime:null },
  { id:'L002', caseId:'C-20240102', org:'Fortis Healthcare',  priority:'urgent',   type:'CT',    inTime:mins(22),  radiologist:'Dr. Arun Sharma',    specialisation:'CT Expert',           availability:'10:00 AM – 6:00 PM', status:'pending',   receivedTime:null,      completedTime:null },
  { id:'L003', caseId:'C-20240103', org:'Narayana Health',    priority:'regular',  type:'X-Ray', inTime:mins(90),  radiologist:'Dr. Kavitha Rajan',  specialisation:'General Radiology',   availability:'8:00 AM – 4:00 PM',  status:'completed', receivedTime:mins(75),  completedTime:mins(15) },
  { id:'L004', caseId:'C-20240104', org:'Max Hospital',       priority:'critical', type:'MRI',   inTime:mins(12),  radiologist:'Dr. Suresh Nair',    specialisation:'Neuro Radiology',     availability:'11:00 AM – 7:00 PM', status:'pending',   receivedTime:null,      completedTime:null },
  { id:'L005', caseId:'C-20240105', org:'MIOT International', priority:'regular',  type:'Others',inTime:mins(130), radiologist:'Dr. Rekha Pillai',   specialisation:'Musculoskeletal',     availability:'9:00 AM – 3:00 PM',  status:'completed', receivedTime:mins(110), completedTime:mins(40) },
  { id:'L006', caseId:'C-20240106', org:'Kauvery Hospital',   priority:'urgent',   type:'CT',    inTime:mins(18),  radiologist:'Dr. Nithin Varma',   specialisation:'Emergency Radiology', availability:'2:00 PM – 10:00 PM', status:'working',   receivedTime:mins(10),  completedTime:null },
  { id:'L007', caseId:'C-20240107', org:'Gleneagles Health',  priority:'regular',  type:'MRI',   inTime:mins(155), radiologist:'Dr. Asha Thomas',    specialisation:'Body Imaging',        availability:'8:00 AM – 2:00 PM',  status:'completed', receivedTime:mins(140), completedTime:mins(70) },
  { id:'L008', caseId:'C-20240108', org:'SRM Medical',        priority:'critical', type:'CT',    inTime:mins(9),   radiologist:'Dr. Vivek Rao',      specialisation:'Stroke Imaging',      availability:'12:00 PM – 8:00 PM', status:'pending',   receivedTime:null,      completedTime:null },
];

const SAMPLE_HISTORY = [
  ...SAMPLE_LIVE,
  { id:'H001', caseId:'C-20240099', org:'Apollo Hospitals',   priority:'urgent',   type:'CT',    inTime:mins(200), radiologist:'Dr. Priya Menon',   specialisation:'MRI Expert',          availability:'9:00 AM – 5:00 PM',  status:'completed', receivedTime:mins(180), completedTime:mins(120) },
  { id:'H002', caseId:'C-20240098', org:'Fortis Healthcare',  priority:'critical', type:'MRI',   inTime:mins(300), radiologist:'Dr. Arun Sharma',   specialisation:'CT Expert',           availability:'10:00 AM – 6:00 PM', status:'completed', receivedTime:mins(280), completedTime:mins(200) },
  { id:'H003', caseId:'C-20240097', org:'Care Hospitals',     priority:'regular',  type:'X-Ray', inTime:mins(400), radiologist:'Dr. Kavitha Rajan', specialisation:'General Radiology',   availability:'8:00 AM – 4:00 PM',  status:'completed', receivedTime:mins(380), completedTime:mins(310) },
  { id:'H004', caseId:'C-20240096', org:'Meenakshi Mission',  priority:'urgent',   type:'CT',    inTime:mins(500), radiologist:'Dr. Suresh Nair',   specialisation:'Neuro Radiology',     availability:'11:00 AM – 7:00 PM', status:'completed', receivedTime:mins(475), completedTime:mins(390) },
  { id:'H005', caseId:'C-20240095', org:'Kauvery Hospital',   priority:'regular',  type:'MRI',   inTime:mins(600), radiologist:'Dr. Nithin Varma',  specialisation:'Emergency Radiology', availability:'2:00 PM – 10:00 PM', status:'completed', receivedTime:mins(585), completedTime:mins(520) },
];

function formatTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatDayDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

function formatShortDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function formatDuration(ms) {
  if (!ms || ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2,'0')}m ${String(sec).padStart(2,'0')}s`;
  if (m > 0) return `${m}m ${String(sec).padStart(2,'0')}s`;
  return `${sec}s`;
}

function toInputDate(ts) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isSameDate(ts, inputDate) {
  const d = new Date(ts);
  return toInputDate(d) === inputDate;
}

function inDateRange(ts, from, to) {
  const current = toInputDate(ts);
  if (from && current < from) return false;
  if (to && current > to) return false;
  return true;
}

function sortByNewest(data) {
  return [...data].sort((a, b) => b.inTime - a.inTime);
}

function useTick(ms = 1000) {
  const [t, setT] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setT(n => n + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
  return t;
}

function PriorityBadge({ priority }) {
  const map = {
    critical: { bg: CONFIG.colors.criticalBadge, color: CONFIG.colors.critical, text: 'Critical' },
    urgent: { bg: CONFIG.colors.urgentBadge, color: CONFIG.colors.urgent, text: 'Urgent' },
    regular: { bg: CONFIG.colors.infoBadge, color: CONFIG.colors.info, text: 'Regular' },
  };
  const s = map[priority] || map.regular;
  return <span style={{ background: s.bg, color: s.color, padding: '4px 10px', borderRadius: 20, fontSize: CONFIG.fonts.badge, fontWeight: 700, whiteSpace: 'nowrap' }}>{s.text}</span>;
}

function TypeBadge({ type }) {
  const c = { MRI: '#7c3aed', CT: '#0891b2', 'X-Ray': '#0284c7', Others: '#475569' }[type] || '#475569';
  return <span style={{ background: c + '1a', color: c, padding: '4px 10px', borderRadius: 20, fontSize: CONFIG.fonts.badge, fontWeight: 600, whiteSpace: 'nowrap' }}>{type}</span>;
}

function StatusBadge({ status }) {
  const map = {
    pending: { bg: '#fef3c7', color: '#b45309', dot: '#f59e0b' },
    working: { bg: '#dbeafe', color: '#1d4ed8', dot: '#3b82f6' },
    completed: { bg: '#dcfce7', color: '#15803d', dot: '#22c55e' },
  };
  const s = map[status] || map.pending;
  return (
    <span style={{ background: s.bg, color: s.color, padding: '4px 10px', borderRadius: 20, fontSize: CONFIG.fonts.badge, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.dot, ...(status === 'working' ? { animation: 'pulse 1.5s infinite' } : {}) }} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function FilterTabs({ value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      {[CONFIG.labels.overall, CONFIG.labels.today, CONFIG.labels.custom].map(tab => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          style={{
            padding: '6px 14px',
            borderRadius: 20,
            border: 'none',
            cursor: 'pointer',
            background: value === tab ? CONFIG.colors.primary : '#f1f5f9',
            color: value === tab ? '#fff' : CONFIG.colors.textMuted,
            fontSize: CONFIG.fonts.sm,
            fontWeight: 600,
            transition: 'all 0.15s',
          }}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

const INP = {
  padding: '6px 8px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  fontSize: CONFIG.fonts.sm,
  color: 'var(--text)',
  background: 'var(--input-bg)',
};

const LIVE_COLUMNS = [
  { key: 'index', label: '#', width: '52px' },
  { key: 'inTime', label: 'In Time', width: '120px' },
  { key: 'caseId', label: 'Case ID', width: '120px' },
  { key: 'org', label: 'Organisation', width: '170px' },
  { key: 'priority', label: 'Priority', width: '110px' },
  { key: 'type', label: 'Type', width: '90px' },
  { key: 'divider', label: '', width: '3px' },
  { key: 'radiologist', label: 'Radiologist', width: '170px' },
  { key: 'specialisation', label: 'Specialisation', width: '190px' },
  { key: 'status', label: 'Status', width: '130px' },
  { key: 'pending', label: 'Pending Time', width: '130px' },
  { key: 'received', label: 'Received', width: '120px' },
  { key: 'work', label: 'Working Time', width: '170px' },
];

function HistoryModal({ open, onClose, data }) {
  const tick = useTick(1000);
  const [historyFilter, setHistoryFilter] = useState(CONFIG.labels.today);
  const todayInput = useMemo(() => toInputDate(Date.now()), []);
  const [fromDate, setFromDate] = useState(todayInput);
  const [toDate, setToDate] = useState(todayInput);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const filteredData = useMemo(() => {
    const sorted = sortByNewest(data);
    if (historyFilter === CONFIG.labels.today) return sorted.filter(row => isSameDate(row.inTime, todayInput));
    if (historyFilter === CONFIG.labels.custom) return sorted.filter(row => inDateRange(row.inTime, fromDate, toDate));
    return sorted;
  }, [data, historyFilter, fromDate, toDate, todayInput]);

  const activeDateLabel = useMemo(() => {
    if (historyFilter === CONFIG.labels.today) return `Today · ${formatDayDate(Date.now())}`;
    if (historyFilter === CONFIG.labels.custom) return `${fromDate || 'Start'} → ${toDate || 'End'}`;
    if (!filteredData.length) return 'All records';
    return `All dates · ${formatShortDate(filteredData[filteredData.length - 1].inTime)} → ${formatShortDate(filteredData[0].inTime)}`;
  }, [historyFilter, filteredData, fromDate, toDate]);

  if (!open) return null;
  void tick;

  const thS = {
    padding: '12px 12px',
    fontSize: CONFIG.fonts.tableHeader,
    color: CONFIG.colors.textMuted,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    whiteSpace: 'nowrap',
    background: 'var(--bg-page)',
    borderBottom: `2px solid var(--border)`,
    position: 'sticky',
    top: 0,
    zIndex: 2,
  };
  const tdS = { padding: '12px 12px', fontSize: CONFIG.fonts.tableCell, verticalAlign: 'middle' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(10,25,50,0.76)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, animation: 'fadeIn 0.2s ease' }}>
      <div style={{ background: 'var(--bg-card)', borderRadius: CONFIG.cards.modalRadius, width: '100%', maxWidth: CONFIG.layout.modalMaxWidth, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 28px 70px rgba(0,0,0,0.32)', overflow: 'hidden' }}>
        <div style={{ background: CONFIG.colors.headerGradient, padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', flexShrink: 0 }}>
          <div>
            <div style={{ color: '#93c5fd', fontSize: CONFIG.fonts.sm, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Full Assignment Log</div>
            <div style={{ color: '#fff', fontSize: CONFIG.fonts.modalTitle, fontWeight: 800, marginBottom: 10 }}>{CONFIG.labels.modalTitle}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ background: 'rgba(255,255,255,0.15)', color: '#e2e8f0', padding: '5px 12px', borderRadius: 20, fontSize: CONFIG.fonts.sm, fontWeight: 700 }}>{activeDateLabel}</span>
              <span style={{ background: 'rgba(255,255,255,0.1)', color: '#e2e8f0', padding: '5px 12px', borderRadius: 20, fontSize: CONFIG.fonts.sm, fontWeight: 600 }}>{filteredData.length} records</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <FilterTabs value={historyFilter} onChange={setHistoryFilter} />
            {historyFilter === CONFIG.labels.custom && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={INP} />
                <span style={{ color: '#dbeafe', fontSize: CONFIG.fonts.sm }}>→</span>
                <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={INP} />
              </div>
            )}
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.22)', color: '#fff', borderRadius: 9, width: 38, height: 38, cursor: 'pointer', fontSize: CONFIG.fonts.lg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>✕</button>
          </div>
        </div>
        <div style={{ overflow: 'auto', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: CONFIG.layout.modalTableMinWidth }}>
            <thead>
              <tr>
                {[CONFIG.labels.thIndex, CONFIG.labels.thInTime, CONFIG.labels.thCaseId, CONFIG.labels.thOrg, CONFIG.labels.thPriority, CONFIG.labels.thType].map((h, i) => <th key={i} style={thS}>{h}</th>)}
                <th style={{ ...thS, width: 4, padding: 0, background: '#e2e8f0' }} />
                {[CONFIG.labels.thRadiologist, CONFIG.labels.thSpecial, CONFIG.labels.thAvail, CONFIG.labels.thStatus, CONFIG.labels.thPending, CONFIG.labels.thReceived, CONFIG.labels.thWorkTime].map((h, i) => <th key={i + 10} style={thS}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {filteredData.map((row, idx) => (
                <tr key={row.id} style={{ borderBottom: `1px solid ${CONFIG.colors.cardBorder}`, background: idx % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-page)' }}>
                  <td style={tdS}><span style={{ width: 28, height: 28, borderRadius: '50%', background: CONFIG.colors.primary, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: CONFIG.fonts.sm, fontWeight: 700 }}>{idx + 1}</span></td>
                  <td style={tdS}><div style={{ fontWeight: 600, color: CONFIG.colors.text }}>{formatTime(row.inTime)}</div><div style={{ fontSize: CONFIG.fonts.sm, color: CONFIG.colors.textMuted }}>{formatDayDate(row.inTime)}</div></td>
                  <td style={tdS}><span style={{ fontFamily: 'monospace', fontWeight: 700, color: CONFIG.colors.primaryLight }}>{row.caseId}</span></td>
                  <td style={{ ...tdS, maxWidth: 150 }}><span style={{ fontWeight: 500 }}>{row.org}</span></td>
                  <td style={tdS}><PriorityBadge priority={row.priority} /></td>
                  <td style={tdS}><TypeBadge type={row.type} /></td>
                  <td style={{ width: 4, background: '#e2e8f0', padding: 0 }} />
                  <td style={{ ...tdS, maxWidth: 170 }}><span style={{ fontWeight: 700, color: CONFIG.colors.text }}>{row.radiologist}</span></td>
                  <td style={tdS}><span style={{ fontSize: CONFIG.fonts.sm, color: '#7c3aed', background: '#f5f3ff', padding: '4px 8px', borderRadius: 20, fontWeight: 600, whiteSpace: 'nowrap' }}>{row.specialisation}</span></td>
                  <td style={tdS}><span style={{ fontSize: CONFIG.fonts.sm, color: CONFIG.colors.textMuted, whiteSpace: 'nowrap' }}>{row.availability}</span></td>
                  <td style={tdS}><StatusBadge status={row.status} /></td>
                  <td style={tdS}>
                    {row.status === 'pending'
                      ? <span style={{ color: CONFIG.colors.pendingTimer, fontWeight: 700, fontFamily: 'monospace', fontSize: CONFIG.fonts.timer }}>▶ {formatDuration(Date.now() - row.inTime)}</span>
                      : row.receivedTime
                        ? <span style={{ color: CONFIG.colors.pendingTimer, fontWeight: 600, fontFamily: 'monospace', fontSize: CONFIG.fonts.timer, opacity: 0.75 }}>{formatDuration(row.receivedTime - row.inTime)}</span>
                        : <span style={{ color: CONFIG.colors.textLight }}>—</span>}
                  </td>
                  <td style={tdS}>{row.receivedTime ? <span style={{ color: CONFIG.colors.success, fontWeight: 700, fontFamily: 'monospace', fontSize: CONFIG.fonts.timer }}>{formatTime(row.receivedTime)}</span> : <span style={{ color: CONFIG.colors.textLight }}>—</span>}</td>
                  <td style={tdS}>
                    {row.status === 'completed' && row.completedTime
                      ? (() => { const dur = row.completedTime - row.receivedTime; const h = Math.floor(dur / 3600000); const m = Math.floor((dur % 3600000) / 60000); return <div><span style={{ color: CONFIG.colors.completedTimer, fontWeight: 700, fontFamily: 'monospace', fontSize: CONFIG.fonts.timer }}>✓ {h > 0 ? `${h}h ` : ''}{String(m).padStart(2, '0')}m</span><div style={{ fontSize: CONFIG.fonts.sm, color: CONFIG.colors.textMuted }}>{formatTime(row.receivedTime)} → {formatTime(row.completedTime)}</div></div>; })()
                      : row.status === 'working' && row.receivedTime
                        ? <span style={{ color: CONFIG.colors.workingTimer, fontWeight: 700, fontFamily: 'monospace', fontSize: CONFIG.fonts.timer }}>▶ {formatDuration(Date.now() - row.receivedTime)}</span>
                        : <span style={{ color: CONFIG.colors.textLight }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function LiveTable({ data }) {
  const tick = useTick(1000);
  void tick;
  const { isDark } = useTheme();

  const sortedData = useMemo(() => sortByNewest(data), [data]);
  const bodyHeight = CONFIG.layout.liveVisibleRows * CONFIG.layout.liveTableRowHeight;

  const cellBase = {
    fontSize: CONFIG.fonts.tableCell,
    color: isDark ? 'rgba(255,255,255,0.88)' : '#1e3a5f',
    padding: '0 10px',
    verticalAlign: 'middle',
  };

  const nullColor  = isDark ? 'rgba(255,255,255,0.25)' : 'rgba(30,58,95,0.35)';
  const subColor   = isDark ? 'rgba(255,255,255,0.34)' : 'rgba(30,58,95,0.55)';
  const dividerBg  = isDark ? 'rgba(255,255,255,0.1)'  : 'rgba(30,58,95,0.12)';
  const rowBorder  = isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(30,58,95,0.1)';
  const hoverBg    = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(30,58,95,0.07)';
  const thBg       = isDark ? '#0f2744' : '#bfdbfe';
  const thColor    = isDark ? 'rgba(255,255,255,0.55)' : '#111827';
  const thBorder   = isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(30,58,95,0.15)';
  const badgeBg    = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(30,58,95,0.15)';
  const caseColor  = isDark ? '#93c5fd' : '#1d4ed8';
  const radioColor = isDark ? '#93c5fd' : '#1d4ed8';
  const specColor  = isDark ? '#c4b5fd' : '#7c3aed';
  const specBg     = isDark ? 'rgba(124,58,237,0.22)' : '#f5f3ff';
  const recvColor  = isDark ? '#6ee7b7' : CONFIG.colors.success;

  const totalWidth = LIVE_COLUMNS.reduce((s, c) => s + parseInt(c.width), 0);

  return (
    <div style={{ flex: 1, minHeight: 0, overflowX: 'auto', overflowY: 'auto', maxHeight: bodyHeight + CONFIG.layout.liveTableHeaderHeight }}>
      <table style={{ minWidth: totalWidth, width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <colgroup>
          {LIVE_COLUMNS.map(col => <col key={col.key} style={{ width: col.width }} />)}
        </colgroup>
        <thead>
          <tr style={{ height: CONFIG.layout.liveTableHeaderHeight }}>
            {LIVE_COLUMNS.map(col => (
              <th
                key={col.key}
                style={{
                  padding: col.key === 'divider' ? 0 : '10px 10px',
                  fontSize: CONFIG.fonts.tableHeader,
                  color: thColor,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  whiteSpace: 'nowrap',
                  borderBottom: thBorder,
                  textAlign: 'left',
                  background: thBg,
                  position: 'sticky',
                  top: 0,
                  zIndex: 2,
                }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedData.map((row, idx) => (
            <tr key={row.id} style={{ height: CONFIG.layout.liveTableRowHeight, borderBottom: rowBorder, transition: 'background 0.12s' }} onMouseEnter={e => { e.currentTarget.style.background = hoverBg; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
              <td style={cellBase}><span style={{ width: 24, height: 24, borderRadius: '50%', background: badgeBg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: CONFIG.fonts.sm, fontWeight: 700, color: isDark ? '#fff' : '#1e3a5f' }}>{idx + 1}</span></td>
              <td style={cellBase}><div style={{ fontWeight: 600 }}>{formatTime(row.inTime)}</div><div style={{ fontSize: CONFIG.fonts.sm, color: subColor }}>{formatShortDate(row.inTime)}</div></td>
              <td style={cellBase}><span style={{ fontFamily: 'monospace', fontWeight: 700, color: caseColor }}>{row.caseId}</span></td>
              <td style={cellBase}>{row.org}</td>
              <td style={cellBase}><PriorityBadge priority={row.priority} /></td>
              <td style={cellBase}><TypeBadge type={row.type} /></td>
              <td style={{ background: dividerBg, padding: 0 }} />
              <td style={cellBase}><span style={{ fontWeight: 700, color: radioColor }}>{row.radiologist}</span></td>
              <td style={cellBase}><span style={{ fontSize: CONFIG.fonts.sm, color: specColor, background: specBg, padding: '4px 8px', borderRadius: 20, fontWeight: 600, whiteSpace: 'nowrap' }}>{row.specialisation}</span></td>
              <td style={cellBase}><StatusBadge status={row.status} /></td>
              <td style={cellBase}>
                {row.status === 'pending'
                  ? <span style={{ color: CONFIG.colors.pendingTimer, fontWeight: 700, fontFamily: 'monospace', fontSize: CONFIG.fonts.timer }}>▶ {formatDuration(Date.now() - row.inTime)}</span>
                  : row.receivedTime
                    ? <span style={{ color: CONFIG.colors.pendingTimer, fontWeight: 600, fontFamily: 'monospace', fontSize: CONFIG.fonts.timer, opacity: 0.75 }}>{formatDuration(row.receivedTime - row.inTime)}</span>
                    : <span style={{ color: nullColor }}>—</span>}
              </td>
              <td style={cellBase}>{row.receivedTime ? <span style={{ color: recvColor, fontWeight: 700, fontFamily: 'monospace', fontSize: CONFIG.fonts.timer }}>{formatTime(row.receivedTime)}</span> : <span style={{ color: nullColor }}>—</span>}</td>
              <td style={cellBase}>
                {row.status === 'completed' && row.completedTime
                  ? (() => { const dur = row.completedTime - row.receivedTime; const h = Math.floor(dur / 3600000); const m = Math.floor((dur % 3600000) / 60000); return <div><span style={{ color: CONFIG.colors.completedTimer, fontWeight: 700, fontFamily: 'monospace', fontSize: CONFIG.fonts.timer }}>✓ {h > 0 ? `${h}h ` : ''}{String(m).padStart(2, '0')}m</span><div style={{ fontSize: CONFIG.fonts.sm, color: subColor }}>{formatTime(row.receivedTime)} → {formatTime(row.completedTime)}</div></div>; })()
                  : row.status === 'working' && row.receivedTime
                    ? <span style={{ color: CONFIG.colors.workingTimer, fontWeight: 700, fontFamily: 'monospace', fontSize: CONFIG.fonts.timer }}>▶ {formatDuration(Date.now() - row.receivedTime)}</span>
                    : <span style={{ color: nullColor }}>—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const DRILLDOWN_DATA = {
  'Total Cases': [
    { caseId: 'C-20240101', org: 'Apollo Hospitals',   patient: 'Priya M.',    priority: 'critical', type: 'MRI',   radiologist: 'Dr. Priya Menon',   specialisation: 'MRI Expert',          status: 'working'  },
    { caseId: 'C-20240102', org: 'Fortis Healthcare',  patient: 'Arun S.',     priority: 'urgent',   type: 'CT',    radiologist: 'Dr. Arun Sharma',   specialisation: 'CT Expert',           status: 'working'  },
    { caseId: 'C-20240103', org: 'Max Hospital',       patient: 'Suresh N.',   priority: 'critical', type: 'MRI',   radiologist: 'Dr. Suresh Nair',   specialisation: 'Neuro Radiology',     status: 'pending'  },
    { caseId: 'C-20240104', org: 'SRM Medical',        patient: 'Vivek R.',    priority: 'critical', type: 'CT',    radiologist: 'Dr. Vivek Rao',    specialisation: 'Stroke Imaging',      status: 'pending'  },
    { caseId: 'C-20240105', org: 'Kauvery Hospital',   patient: 'Nithin V.',   priority: 'urgent',   type: 'CT',    radiologist: 'Dr. Nithin Varma',  specialisation: 'Emergency Radiology', status: 'working'  },
    { caseId: 'C-20240106', org: 'Narayana Health',    patient: 'Kavitha R.',  priority: 'regular',  type: 'X-Ray', radiologist: 'Dr. Kavitha Rajan', specialisation: 'General Radiology',   status: 'pending'  },
    { caseId: 'C-20240107', org: 'Care Hospitals',     patient: 'Arjun K.',    priority: 'urgent',   type: 'CT',    radiologist: 'Dr. Arjun Kumar',   specialisation: 'General Radiology',   status: 'working'  },
    { caseId: 'C-20240108', org: 'Meenakshi Mission',  patient: 'Rekha P.',    priority: 'critical', type: 'MRI',   radiologist: 'Dr. Rekha Pillai',  specialisation: 'Musculoskeletal',     status: 'pending'  },
    { caseId: 'C-20240109', org: 'Gleneagles Health',  patient: 'Asha T.',     priority: 'regular',  type: 'CT',    radiologist: 'Dr. Asha Thomas',   specialisation: 'Body Imaging',        status: 'working'  },
    { caseId: 'C-20240110', org: 'MIOT International', patient: 'Deepak M.',   priority: 'urgent',   type: 'MRI',   radiologist: 'Dr. Deepak Menon',  specialisation: 'Neuro Radiology',     status: 'working'  },
    { caseId: 'C-20240111', org: 'Apollo Hospitals',   patient: 'Ramesh K.',   priority: 'regular',  type: 'X-Ray', radiologist: 'Dr. Priya Menon',   specialisation: 'MRI Expert',          status: 'pending'  },
    { caseId: 'C-20240112', org: 'Fortis Healthcare',  patient: 'Sunita P.',   priority: 'critical', type: 'CT',    radiologist: 'Dr. Arun Sharma',   specialisation: 'CT Expert',           status: 'working'  },
    { caseId: 'C-20240113', org: 'Max Hospital',       patient: 'Divya S.',    priority: 'urgent',   type: 'MRI',   radiologist: 'Dr. Suresh Nair',   specialisation: 'Neuro Radiology',     status: 'pending'  },
    { caseId: 'C-20240114', org: 'Kauvery Hospital',   patient: 'Meena L.',    priority: 'regular',  type: 'CT',    radiologist: 'Dr. Nithin Varma',  specialisation: 'Emergency Radiology', status: 'working'  },
    { caseId: 'C-20240115', org: 'Narayana Health',    patient: 'Kiran V.',    priority: 'critical', type: 'MRI',   radiologist: 'Dr. Kavitha Rajan', specialisation: 'General Radiology',   status: 'working'  },
    { caseId: 'C-20240116', org: 'SRM Medical',        patient: 'Anand T.',    priority: 'urgent',   type: 'CT',    radiologist: 'Dr. Vivek Rao',    specialisation: 'Stroke Imaging',      status: 'pending'  },
    { caseId: 'C-20240117', org: 'Care Hospitals',     patient: 'Ravi B.',     priority: 'regular',  type: 'X-Ray', radiologist: 'Dr. Arjun Kumar',   specialisation: 'General Radiology',   status: 'working'  },
    { caseId: 'C-20240118', org: 'Gleneagles Health',  patient: 'Pooja S.',    priority: 'urgent',   type: 'MRI',   radiologist: 'Dr. Asha Thomas',   specialisation: 'Body Imaging',        status: 'pending'  },
  ],
  'QC Cases': [
    { caseId: 'C-20240201', org: 'Apollo Hospitals',   patient: 'Priya M.',    priority: 'critical', type: 'MRI',   radiologist: 'Dr. Priya Menon',   specialisation: 'MRI Expert',          qcStatus: 'passed'  },
    { caseId: 'C-20240202', org: 'Fortis Healthcare',  patient: 'Arun S.',     priority: 'urgent',   type: 'CT',    radiologist: 'Dr. Arun Sharma',   specialisation: 'CT Expert',           qcStatus: 'passed'  },
    { caseId: 'C-20240203', org: 'Max Hospital',       patient: 'Suresh N.',   priority: 'critical', type: 'MRI',   radiologist: 'Dr. Suresh Nair',   specialisation: 'Neuro Radiology',     qcStatus: 'failed'  },
    { caseId: 'C-20240204', org: 'SRM Medical',        patient: 'Vivek R.',    priority: 'urgent',   type: 'CT',    radiologist: 'Dr. Vivek Rao',    specialisation: 'Stroke Imaging',      qcStatus: 'passed'  },
    { caseId: 'C-20240205', org: 'Kauvery Hospital',   patient: 'Nithin V.',   priority: 'regular',  type: 'CT',    radiologist: 'Dr. Nithin Varma',  specialisation: 'Emergency Radiology', qcStatus: 'pending' },
    { caseId: 'C-20240206', org: 'Narayana Health',    patient: 'Kavitha R.',  priority: 'regular',  type: 'X-Ray', radiologist: 'Dr. Kavitha Rajan', specialisation: 'General Radiology',   qcStatus: 'passed'  },
    { caseId: 'C-20240207', org: 'Care Hospitals',     patient: 'Arjun K.',    priority: 'urgent',   type: 'CT',    radiologist: 'Dr. Arjun Kumar',   specialisation: 'General Radiology',   qcStatus: 'pending' },
    { caseId: 'C-20240208', org: 'Meenakshi Mission',  patient: 'Rekha P.',    priority: 'critical', type: 'MRI',   radiologist: 'Dr. Rekha Pillai',  specialisation: 'Musculoskeletal',     qcStatus: 'passed'  },
    { caseId: 'C-20240209', org: 'Gleneagles Health',  patient: 'Asha T.',     priority: 'regular',  type: 'CT',    radiologist: 'Dr. Asha Thomas',   specialisation: 'Body Imaging',        qcStatus: 'passed'  },
    { caseId: 'C-20240210', org: 'MIOT International', patient: 'Deepak M.',   priority: 'urgent',   type: 'MRI',   radiologist: 'Dr. Deepak Menon',  specialisation: 'Neuro Radiology',     qcStatus: 'failed'  },
    { caseId: 'C-20240211', org: 'Apollo Hospitals',   patient: 'Ramesh K.',   priority: 'regular',  type: 'X-Ray', radiologist: 'Dr. Priya Menon',   specialisation: 'MRI Expert',          qcStatus: 'passed'  },
    { caseId: 'C-20240212', org: 'Fortis Healthcare',  patient: 'Sunita P.',   priority: 'critical', type: 'CT',    radiologist: 'Dr. Arun Sharma',   specialisation: 'CT Expert',           qcStatus: 'pending' },
    { caseId: 'C-20240213', org: 'Max Hospital',       patient: 'Divya S.',    priority: 'urgent',   type: 'MRI',   radiologist: 'Dr. Suresh Nair',   specialisation: 'Neuro Radiology',     qcStatus: 'passed'  },
    { caseId: 'C-20240214', org: 'Kauvery Hospital',   patient: 'Meena L.',    priority: 'regular',  type: 'CT',    radiologist: 'Dr. Nithin Varma',  specialisation: 'Emergency Radiology', qcStatus: 'failed'  },
    { caseId: 'C-20240215', org: 'Narayana Health',    patient: 'Kiran V.',    priority: 'critical', type: 'MRI',   radiologist: 'Dr. Kavitha Rajan', specialisation: 'General Radiology',   qcStatus: 'passed'  },
    { caseId: 'C-20240216', org: 'SRM Medical',        patient: 'Anand T.',    priority: 'urgent',   type: 'CT',    radiologist: 'Dr. Vivek Rao',    specialisation: 'Stroke Imaging',      qcStatus: 'passed'  },
    { caseId: 'C-20240217', org: 'Care Hospitals',     patient: 'Ravi B.',     priority: 'regular',  type: 'X-Ray', radiologist: 'Dr. Arjun Kumar',   specialisation: 'General Radiology',   qcStatus: 'pending' },
    { caseId: 'C-20240218', org: 'Gleneagles Health',  patient: 'Pooja S.',    priority: 'urgent',   type: 'MRI',   radiologist: 'Dr. Asha Thomas',   specialisation: 'Body Imaging',        qcStatus: 'failed'  },
  ],
  'Scans Completed': [
    { caseId: 'C-20240001', org: 'Apollo Hospitals',   patient: 'Priya M.',    priority: 'critical', type: 'MRI',   radiologist: 'Dr. Priya Menon',   specialisation: 'MRI Expert',          completedAt: mins(60)  },
    { caseId: 'C-20240002', org: 'Fortis Healthcare',  patient: 'Arun S.',     priority: 'urgent',   type: 'CT',    radiologist: 'Dr. Arun Sharma',   specialisation: 'CT Expert',           completedAt: mins(75)  },
    { caseId: 'C-20240003', org: 'Max Hospital',       patient: 'Suresh N.',   priority: 'critical', type: 'MRI',   radiologist: 'Dr. Suresh Nair',   specialisation: 'Neuro Radiology',     completedAt: mins(90)  },
    { caseId: 'C-20240004', org: 'SRM Medical',        patient: 'Vivek R.',    priority: 'urgent',   type: 'CT',    radiologist: 'Dr. Vivek Rao',    specialisation: 'Stroke Imaging',      completedAt: mins(110) },
    { caseId: 'C-20240005', org: 'Kauvery Hospital',   patient: 'Nithin V.',   priority: 'regular',  type: 'X-Ray', radiologist: 'Dr. Nithin Varma',  specialisation: 'Emergency Radiology', completedAt: mins(120) },
    { caseId: 'C-20240006', org: 'Narayana Health',    patient: 'Kavitha R.',  priority: 'regular',  type: 'X-Ray', radiologist: 'Dr. Kavitha Rajan', specialisation: 'General Radiology',   completedAt: mins(130) },
    { caseId: 'C-20240007', org: 'Care Hospitals',     patient: 'Arjun K.',    priority: 'urgent',   type: 'CT',    radiologist: 'Dr. Arjun Kumar',   specialisation: 'General Radiology',   completedAt: mins(145) },
    { caseId: 'C-20240008', org: 'Meenakshi Mission',  patient: 'Rekha P.',    priority: 'critical', type: 'MRI',   radiologist: 'Dr. Rekha Pillai',  specialisation: 'Musculoskeletal',     completedAt: mins(160) },
    { caseId: 'C-20240009', org: 'Gleneagles Health',  patient: 'Asha T.',     priority: 'regular',  type: 'CT',    radiologist: 'Dr. Asha Thomas',   specialisation: 'Body Imaging',        completedAt: mins(180) },
    { caseId: 'C-20240010', org: 'MIOT International', patient: 'Deepak M.',   priority: 'urgent',   type: 'MRI',   radiologist: 'Dr. Deepak Menon',  specialisation: 'Neuro Radiology',     completedAt: mins(200) },
    { caseId: 'C-20240011', org: 'Apollo Hospitals',   patient: 'Ramesh K.',   priority: 'regular',  type: 'X-Ray', radiologist: 'Dr. Priya Menon',   specialisation: 'MRI Expert',          completedAt: mins(220) },
    { caseId: 'C-20240012', org: 'Fortis Healthcare',  patient: 'Sunita P.',   priority: 'critical', type: 'CT',    radiologist: 'Dr. Arun Sharma',   specialisation: 'CT Expert',           completedAt: mins(240) },
    { caseId: 'C-20240013', org: 'Max Hospital',       patient: 'Divya S.',    priority: 'urgent',   type: 'MRI',   radiologist: 'Dr. Suresh Nair',   specialisation: 'Neuro Radiology',     completedAt: mins(260) },
    { caseId: 'C-20240014', org: 'Kauvery Hospital',   patient: 'Meena L.',    priority: 'regular',  type: 'CT',    radiologist: 'Dr. Nithin Varma',  specialisation: 'Emergency Radiology', completedAt: mins(280) },
    { caseId: 'C-20240015', org: 'Narayana Health',    patient: 'Kiran V.',    priority: 'critical', type: 'MRI',   radiologist: 'Dr. Kavitha Rajan', specialisation: 'General Radiology',   completedAt: mins(300) },
  ],
  Assigned: [
    { caseId: 'C-20240108', org: 'SRM Medical',       patient: 'Vivek R.',    priority: 'critical', type: 'CT',    radiologist: 'Dr. Vivek Rao',    specialisation: 'Stroke Imaging',      status: 'pending',   assignedAt: mins(9)  },
    { caseId: 'C-20240104', org: 'Max Hospital',       patient: 'Suresh N.',   priority: 'critical', type: 'MRI',   radiologist: 'Dr. Suresh Nair',   specialisation: 'Neuro Radiology',     status: 'pending',   assignedAt: mins(12) },
    { caseId: 'C-20240102', org: 'Fortis Healthcare',  patient: 'Arun S.',     priority: 'urgent',   type: 'CT',    radiologist: 'Dr. Arun Sharma',   specialisation: 'CT Expert',           status: 'working',   assignedAt: mins(22) },
    { caseId: 'C-20240106', org: 'Kauvery Hospital',   patient: 'Nithin V.',   priority: 'urgent',   type: 'CT',    radiologist: 'Dr. Nithin Varma',  specialisation: 'Emergency Radiology', status: 'working',   assignedAt: mins(18) },
    { caseId: 'C-20240101', org: 'Apollo Hospitals',   patient: 'Priya M.',    priority: 'critical', type: 'MRI',   radiologist: 'Dr. Priya Menon',   specialisation: 'MRI Expert',          status: 'working',   assignedAt: mins(47) },
    { caseId: 'C-20240110', org: 'Care Hospitals',     patient: 'Arjun K.',    priority: 'regular',  type: 'X-Ray', radiologist: 'Dr. Arjun Kumar',   specialisation: 'General Radiology',   status: 'pending',   assignedAt: mins(5)  },
    { caseId: 'C-20240111', org: 'Meenakshi Mission',  patient: 'Rekha P.',    priority: 'urgent',   type: 'MRI',   radiologist: 'Dr. Rekha Pillai',  specialisation: 'Musculoskeletal',     status: 'pending',   assignedAt: mins(3)  },
    { caseId: 'C-20240112', org: 'Gleneagles Health',  patient: 'Asha T.',     priority: 'regular',  type: 'CT',    radiologist: 'Dr. Asha Thomas',   specialisation: 'Body Imaging',        status: 'working',   assignedAt: mins(30) },
    { caseId: 'C-20240113', org: 'Narayana Health',    patient: 'Kavitha R.',  priority: 'regular',  type: 'X-Ray', radiologist: 'Dr. Kavitha Rajan', specialisation: 'General Radiology',   status: 'pending',   assignedAt: mins(8)  },
    { caseId: 'C-20240114', org: 'MIOT International', patient: 'Deepak M.',   priority: 'urgent',   type: 'MRI',   radiologist: 'Dr. Deepak Menon',  specialisation: 'Neuro Radiology',     status: 'working',   assignedAt: mins(55) },
  ],
  'Rejected Cases': [
    { caseId: 'C-20240081', org: 'Apollo Hospitals',   patient: 'Ramesh K.',   priority: 'critical', type: 'CT',    radiologist: 'Dr. Priya Menon',   specialisation: 'MRI Expert',          rejectedAt: mins(60),  reason: 'Radiologist unavailable' },
    { caseId: 'C-20240082', org: 'Fortis Healthcare',  patient: 'Sunita P.',   priority: 'urgent',   type: 'MRI',   radiologist: 'Dr. Arun Sharma',   specialisation: 'CT Expert',           rejectedAt: mins(120), reason: 'Outside specialisation scope' },
    { caseId: 'C-20240083', org: 'Narayana Health',    patient: 'Kiran V.',    priority: 'regular',  type: 'X-Ray', radiologist: 'Dr. Kavitha Rajan', specialisation: 'General Radiology',   rejectedAt: mins(200), reason: 'Technical issue with file' },
    { caseId: 'C-20240084', org: 'Max Hospital',       patient: 'Divya S.',    priority: 'critical', type: 'CT',    radiologist: 'Dr. Suresh Nair',   specialisation: 'Neuro Radiology',     rejectedAt: mins(90),  reason: 'Patient data incomplete' },
  ],
  Reassigned: [
    { caseId: 'C-20240081', org: 'Apollo Hospitals',   patient: 'Ramesh K.',   priority: 'critical', type: 'CT',    from: 'Dr. Priya Menon',  to: 'Dr. Arun Sharma',   specialisation: 'CT Expert',           reassignedAt: mins(50),  reason: 'Radiologist unavailable' },
    { caseId: 'C-20240082', org: 'Fortis Healthcare',  patient: 'Sunita P.',   priority: 'urgent',   type: 'MRI',   from: 'Dr. Arun Sharma',  to: 'Dr. Kavitha Rajan', specialisation: 'General Radiology',   reassignedAt: mins(110), reason: 'Outside specialisation scope' },
    { caseId: 'C-20240083', org: 'Narayana Health',    patient: 'Kiran V.',    priority: 'regular',  type: 'X-Ray', from: 'Dr. Kavitha Rajan',to: 'Dr. Rekha Pillai',  specialisation: 'Musculoskeletal',     reassignedAt: mins(190), reason: 'Technical issue with file' },
    { caseId: 'C-20240084', org: 'Max Hospital',       patient: 'Divya S.',    priority: 'critical', type: 'CT',    from: 'Dr. Suresh Nair',  to: 'Dr. Nithin Varma',  specialisation: 'Emergency Radiology', reassignedAt: mins(80),  reason: 'Patient data incomplete' },
    { caseId: 'C-20240085', org: 'MIOT International', patient: 'Ravi B.',     priority: 'urgent',   type: 'MRI',   from: 'Dr. Asha Thomas',  to: 'Dr. Vivek Rao',     specialisation: 'Stroke Imaging',      reassignedAt: mins(30),  reason: 'Radiologist on leave' },
    { caseId: 'C-20240086', org: 'Kauvery Hospital',   patient: 'Meena L.',    priority: 'regular',  type: 'CT',    from: 'Dr. Deepak Menon', to: 'Dr. Priya Menon',   specialisation: 'MRI Expert',          reassignedAt: mins(15),  reason: 'Workload rebalancing' },
    { caseId: 'C-20240087', org: 'Care Hospitals',     patient: 'Anand T.',    priority: 'critical', type: 'X-Ray', from: 'Dr. Arjun Kumar',  to: 'Dr. Suresh Nair',   specialisation: 'Neuro Radiology',     reassignedAt: mins(65),  reason: 'Priority escalation' },
  ],
};


const CASES_CARD_ITEMS = [
  { key: 'Assigned', label: 'Assigned', accent: CONFIG.colors.info },
  { key: 'Rejected Cases', label: 'Rejected', accent: CONFIG.colors.critical },
  { key: 'Reassigned', label: 'Reassigned', accent: CONFIG.colors.urgent },
];

function getCasesSummary() {
  return CASES_CARD_ITEMS.map(item => ({
    ...item,
    value: (DRILLDOWN_DATA[item.key] || []).length,
  }));
}

function getReportQCSummary(qcLive) {
  const liveCounts = qcLive && qcLive.counts ? qcLive.counts : null;
  if (liveCounts) {
    return [
      { key: 'passed', label: 'Passed', value: liveCounts.passed || 0, accent: CONFIG.colors.success },
      { key: 'failed', label: 'Failed', value: liveCounts.failed || 0, accent: CONFIG.colors.critical },
    ];
  }
  const fallbackRows = DRILLDOWN_DATA['QC Cases'] || [];
  return [
    { key: 'passed', label: 'Passed', value: fallbackRows.filter(r => r.qcStatus === 'passed').length, accent: CONFIG.colors.success },
    { key: 'failed', label: 'Failed', value: fallbackRows.filter(r => r.qcStatus === 'failed').length, accent: CONFIG.colors.critical },
  ];
}

function SummaryListCard({ label, icon, accent, accentBg, rows, totalValue, dark = false, onClick }) {
  const { isDark } = useTheme();
  const darkBg = isDark ? CONFIG.colors.liveCardGradient : 'linear-gradient(135deg,#bfdbfe 0%,#93c5fd 100%)';
  const total = typeof totalValue === 'number' ? totalValue : rows.reduce((sum, row) => sum + row.value, 0);

  return (
    <div
      onClick={onClick}
      style={{
        background: dark ? darkBg : CONFIG.colors.cardBg,
        border: dark ? 'none' : `1px solid ${CONFIG.colors.cardBorder}`,
        borderRadius: CONFIG.cards.statCard.radius,
        padding: CONFIG.cards.statCard.padding,
        minWidth: 0,
        boxShadow: dark ? '0 6px 18px rgba(14,165,233,0.12)' : '0 2px 6px rgba(0,0,0,0.04)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: CONFIG.cards.statCard.minHeight,
        height: '100%',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'box-shadow 0.15s, transform 0.15s',
      }}
      onMouseEnter={e => { if (onClick) { e.currentTarget.style.boxShadow = `0 6px 20px ${accent}44`; e.currentTarget.style.transform = 'translateY(-2px)'; } }}
      onMouseLeave={e => { if (onClick) { e.currentTarget.style.boxShadow = dark ? '0 6px 18px rgba(14,165,233,0.12)' : '0 2px 6px rgba(0,0,0,0.04)'; e.currentTarget.style.transform = 'none'; } }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <span style={{ fontSize: CONFIG.fonts.lg, color: dark ? (isDark ? 'rgba(255,255,255,0.82)' : '#1e40af') : CONFIG.colors.textMuted, fontWeight: 600, lineHeight: 1.3 }}>{label}</span>
        <span style={{ background: accentBg, color: accent, width: 34, height: 34, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: CONFIG.fonts.md, flexShrink: 0 }}>{icon}</span>
      </div>

      <div style={{ fontSize: CONFIG.fonts.statNumber, fontWeight: 800, color: dark ? (isDark ? '#fff' : '#1e3a5f') : accent, lineHeight: 1, letterSpacing: '-0.03em', marginBottom: 14 }}>
        {total}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 'auto' }}>
        {rows.map((row, index) => {
          const percent = total > 0 ? (row.value / total) * 100 : 0;
          return (
            <div key={row.key || row.label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, alignItems: 'center' }}>
                <span style={{ fontSize: CONFIG.fonts.sm, color: dark ? (isDark ? 'rgba(255,255,255,0.75)' : '#1e40af') : CONFIG.colors.textMuted, fontWeight: 600 }}>
                  {row.label}
                </span>
                <span style={{ fontSize: CONFIG.fonts.sm, color: dark ? (isDark ? '#fff' : '#1e3a5f') : row.accent, fontWeight: 700 }}>
                  {row.value}
                </span>
              </div>
              <div style={{ height: 4, background: dark ? (isDark ? 'rgba(255,255,255,0.12)' : 'rgba(30,58,95,0.15)') : accentBg, borderRadius: 999 }}>
                <div style={{ height: '100%', width: `${percent}%`, background: row.accent, borderRadius: 999, transition: 'width 0.4s ease' }} />
              </div>
              {index !== rows.length - 1 && <div style={{ height: 1, background: dark ? (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(30,58,95,0.08)') : CONFIG.colors.cardBorder, marginTop: 10 }} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}


function DrilldownModal({ type, qcLive, onClose }) {
  const groupedCases = type === 'Cases';
  const groupedQc = type === 'Report QC';
  const isQC = type === 'QC Cases' || groupedQc;

  const caseTabs = CASES_CARD_ITEMS.map(item => item.key);
  const qcTabs = ['passed', 'failed'];

  const [activeTab, setActiveTab] = useState(
    groupedCases ? 'Assigned' : groupedQc ? 'passed' : 'all'
  );
  const [filterValue, setFilterValue] = useState('all');

  useEffect(() => {
    setActiveTab(groupedCases ? 'Assigned' : groupedQc ? 'passed' : 'all');
    setFilterValue('all');
  }, [type, groupedCases, groupedQc]);

  const liveQcRows = qcLive && Array.isArray(qcLive.cases)
    ? qcLive.cases.map(r => ({
        caseId: r.case_id,
        org: r.org,
        patient: r.patient,
        priority: r.priority,
        type: r.type,
        reason: r.reason,
        file: r.file,
        qcStatus: r.qc_status,
      }))
    : [];

  const effectiveType = groupedCases
    ? activeTab
    : groupedQc
      ? 'QC Cases'
      : type;

  const allRows = groupedQc
    ? (liveQcRows.length ? liveQcRows.filter(r => r.qcStatus === activeTab) : (DRILLDOWN_DATA['QC Cases'] || []).filter(r => r.qcStatus === activeTab))
    : effectiveType === 'QC Cases'
      ? (liveQcRows.length ? liveQcRows : [])
      : (DRILLDOWN_DATA[effectiveType] || []);

  const rows = (!groupedCases && !groupedQc && effectiveType !== 'QC Cases' && filterValue !== 'all')
    ? allRows.filter(r => r.priority === filterValue)
    : allRows;

  const thS = {
    padding: '11px 12px', fontSize: CONFIG.fonts.tableHeader, color: CONFIG.colors.textMuted,
    fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap',
    background: '#f8fafc', borderBottom: `2px solid ${CONFIG.colors.cardBorder}`,
    position: 'sticky', top: 0, zIndex: 2,
  };
  const tdS = { padding: '11px 12px', fontSize: CONFIG.fonts.tableCell, verticalAlign: 'middle' };

  const accentMap = {
    'Total Cases':     { color: CONFIG.colors.info,     bg: CONFIG.colors.infoBadge,     icon: '📁' },
    'QC Cases':        { color: CONFIG.colors.primary,  bg: CONFIG.colors.infoBadge,     icon: '🔍' },
    'Scans Completed': { color: CONFIG.colors.success,  bg: CONFIG.colors.successBadge,  icon: '✓'  },
    'Assigned':        { color: CONFIG.colors.info,     bg: CONFIG.colors.infoBadge,     icon: '📋' },
    'Rejected Cases':  { color: CONFIG.colors.critical, bg: CONFIG.colors.criticalBadge, icon: '✗'  },
    'Reassigned':      { color: CONFIG.colors.urgent,   bg: CONFIG.colors.urgentBadge,   icon: '↺'  },
    'Cases':           { color: CONFIG.colors.info,     bg: CONFIG.colors.infoBadge,     icon: '📚' },
    'Report QC':       { color: CONFIG.colors.success,  bg: CONFIG.colors.successBadge,  icon: '🛡️' },
  };
  const modalAccent = accentMap[type] || accentMap[effectiveType] || {};
  const { color, bg, icon } = modalAccent;

  const filterOptions = [
    { value: 'all', label: 'All' },
    { value: 'critical', label: 'Critical' },
    { value: 'urgent', label: 'Urgent' },
    { value: 'regular', label: 'Regular' },
  ];

  const caseTabLabels = {
    'Assigned': 'Assigned',
    'Rejected Cases': 'Rejected',
    'Reassigned': 'Reassigned',
  };

  const qcTabLabels = {
    passed: 'Passed',
    failed: 'Failed',
  };

  const modalTitle = groupedCases ? 'Cases Details' : groupedQc ? 'Report QC Details' : type;
  const modalCount = rows.length;

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(10,25,50,0.76)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, animation: 'fadeIn 0.2s ease' }}>
      <div style={{ background: '#fff', borderRadius: CONFIG.cards.modalRadius, width: '100%', maxWidth: 1100, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 28px 70px rgba(0,0,0,0.32)', overflow: 'hidden' }}>
        <div style={{ background: CONFIG.colors.headerGradient, padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ background: bg, color, width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700 }}>{icon}</span>
            <div style={{ color: '#fff', fontSize: CONFIG.fonts.title, fontWeight: 800 }}>{modalTitle}</div>
            <span style={{ background: 'rgba(255,255,255,0.15)', color: '#e2e8f0', padding: '4px 12px', borderRadius: 20, fontSize: CONFIG.fonts.sm, fontWeight: 700 }}>{modalCount} cases</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {groupedCases && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {caseTabs.map(tab => {
                  const count = (DRILLDOWN_DATA[tab] || []).length;
                  const active = activeTab === tab;
                  return (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      style={{
                        padding: '8px 14px',
                        borderRadius: 999,
                        border: '1px solid rgba(255,255,255,0.24)',
                        background: active ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.1)',
                        color: '#fff',
                        fontSize: CONFIG.fonts.sm,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {caseTabLabels[tab]} ({count})
                    </button>
                  );
                })}
              </div>
            )}

            {groupedQc && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {qcTabs.map(tab => {
                  const count = getReportQCSummary(qcLive).find(item => item.key === tab)?.value || 0;
                  const active = activeTab === tab;
                  return (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      style={{
                        padding: '8px 14px',
                        borderRadius: 999,
                        border: '1px solid rgba(255,255,255,0.24)',
                        background: active ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.1)',
                        color: '#fff',
                        fontSize: CONFIG.fonts.sm,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {qcTabLabels[tab]} ({count})
                    </button>
                  );
                })}
              </div>
            )}

            {!groupedCases && !groupedQc && effectiveType !== 'QC Cases' && (
              <select
                value={filterValue}
                onChange={e => setFilterValue(e.target.value)}
                style={{ marginLeft: 8, padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.12)', color: '#fff', fontSize: CONFIG.fonts.sm, fontWeight: 600, cursor: 'pointer', outline: 'none' }}
              >
                {filterOptions.map(opt => (
                  <option key={opt.value} value={opt.value} style={{ background: '#1e3a5f', color: '#fff' }}>
                    {opt.label}
                  </option>
                ))}
              </select>
            )}

            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.22)', color: '#fff', borderRadius: 9, width: 38, height: 38, cursor: 'pointer', fontSize: CONFIG.fonts.lg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>✕</button>
          </div>
        </div>

        <div style={{ overflow: 'auto', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thS}>#</th>
                <th style={thS}>Case ID</th>
                <th style={thS}>Organisation</th>
                <th style={thS}>Patient</th>
                <th style={thS}>Priority</th>
                <th style={thS}>Type</th>
                {effectiveType === 'Total Cases' && <><th style={thS}>Radiologist</th><th style={thS}>Specialisation</th><th style={thS}>Status</th></>}
                {effectiveType === 'QC Cases' && <><th style={thS}>Reason</th><th style={thS}>QC Status</th></>}
                {effectiveType === 'Scans Completed' && <><th style={thS}>Radiologist</th><th style={thS}>Specialisation</th><th style={thS}>Completed At</th></>}
                {effectiveType === 'Assigned' && <><th style={thS}>Radiologist</th><th style={thS}>Specialisation</th><th style={thS}>Status</th><th style={thS}>Assigned At</th></>}
                {effectiveType === 'Rejected Cases' && <><th style={thS}>Radiologist</th><th style={thS}>Rejected At</th><th style={thS}>Reason</th></>}
                {effectiveType === 'Reassigned' && <><th style={thS}>From</th><th style={thS}>To</th><th style={thS}>Reassigned At</th><th style={thS}>Reason</th></>}
              </tr>
            </thead>
            <tbody>
              {effectiveType === 'QC Cases' && rows.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '40px 20px', textAlign: 'center', color: CONFIG.colors.textMuted }}>
                    {qcLive === null ? (
                      <>
                        <div style={{ fontSize: 14, marginBottom: 6 }}>⏳ Loading QC data…</div>
                        <div style={{ fontSize: 12 }}>If this doesn't load, the <code>/admin/qc/summary</code> endpoint may not be reachable — check uvicorn logs.</div>
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize: 14, marginBottom: 6 }}>No {groupedQc ? qcTabLabels[activeTab].toLowerCase() : 'QC'} cases found</div>
                        <div style={{ fontSize: 12 }}>Upload and submit cases from an organisation account to populate this view.</div>
                      </>
                    )}
                  </td>
                </tr>
              ) : rows.map((row, idx) => (
                <tr key={row.caseId} style={{ borderBottom: `1px solid ${CONFIG.colors.cardBorder}`, background: idx % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-page)' }}>
                  <td style={tdS}><span style={{ width: 28, height: 28, borderRadius: '50%', background: CONFIG.colors.primary, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: CONFIG.fonts.sm, fontWeight: 700 }}>{idx + 1}</span></td>
                  <td style={tdS}><span style={{ fontFamily: 'monospace', fontWeight: 700, color: CONFIG.colors.primaryLight }}>{row.caseId}</span></td>
                  <td style={tdS}>{row.org}</td>
                  <td style={tdS}><span style={{ fontWeight: 600 }}>{row.patient}</span></td>
                  <td style={tdS}><PriorityBadge priority={row.priority} /></td>
                  <td style={tdS}><TypeBadge type={row.type} /></td>
                  {effectiveType === 'Total Cases' && (
                    <>
                      <td style={tdS}><span style={{ fontWeight: 700 }}>{row.radiologist}</span></td>
                      <td style={tdS}><span style={{ fontSize: CONFIG.fonts.sm, color: '#7c3aed', background: '#f5f3ff', padding: '4px 8px', borderRadius: 20, fontWeight: 600, whiteSpace: 'nowrap' }}>{row.specialisation}</span></td>
                      <td style={tdS}><StatusBadge status={row.status} /></td>
                    </>
                  )}
                  {effectiveType === 'QC Cases' && (
                    <>
                      <td style={tdS}>
                        <div style={{ fontSize: CONFIG.fonts.sm, color: row.qcStatus === 'passed' ? CONFIG.colors.textMuted : '#b91c1c', maxWidth: 420, lineHeight: 1.4 }}>
                          {row.reason || '—'}
                        </div>
                        {row.file && row.file !== '—' && (
                          <div style={{ fontSize: 11, color: CONFIG.colors.textMuted, fontFamily: 'monospace', marginTop: 2 }}>
                            📄 {row.file}
                          </div>
                        )}
                      </td>
                      <td style={tdS}>
                        <span style={{ fontSize: CONFIG.fonts.sm, fontWeight: 700, padding: '4px 10px', borderRadius: 20,
                          color: row.qcStatus === 'passed' ? CONFIG.colors.success : CONFIG.colors.critical,
                          background: row.qcStatus === 'passed' ? CONFIG.colors.successBadge : CONFIG.colors.criticalBadge,
                        }}>{row.qcStatus.charAt(0).toUpperCase() + row.qcStatus.slice(1)}</span>
                      </td>
                    </>
                  )}
                  {effectiveType === 'Scans Completed' && (
                    <>
                      <td style={tdS}><span style={{ fontWeight: 700 }}>{row.radiologist}</span></td>
                      <td style={tdS}><span style={{ fontSize: CONFIG.fonts.sm, color: '#7c3aed', background: '#f5f3ff', padding: '4px 8px', borderRadius: 20, fontWeight: 600, whiteSpace: 'nowrap' }}>{row.specialisation}</span></td>
                      <td style={tdS}><div style={{ fontWeight: 600 }}>{formatTime(row.completedAt)}</div><div style={{ fontSize: CONFIG.fonts.sm, color: CONFIG.colors.textMuted }}>{formatShortDate(row.completedAt)}</div></td>
                    </>
                  )}
                  {effectiveType === 'Assigned' && (
                    <>
                      <td style={tdS}><span style={{ fontWeight: 700 }}>{row.radiologist}</span></td>
                      <td style={tdS}><span style={{ fontSize: CONFIG.fonts.sm, color: '#7c3aed', background: '#f5f3ff', padding: '4px 8px', borderRadius: 20, fontWeight: 600, whiteSpace: 'nowrap' }}>{row.specialisation}</span></td>
                      <td style={tdS}><StatusBadge status={row.status} /></td>
                      <td style={tdS}><div style={{ fontWeight: 600 }}>{formatTime(row.assignedAt)}</div><div style={{ fontSize: CONFIG.fonts.sm, color: CONFIG.colors.textMuted }}>{formatShortDate(row.assignedAt)}</div></td>
                    </>
                  )}
                  {effectiveType === 'Rejected Cases' && (
                    <>
                      <td style={tdS}><span style={{ fontWeight: 700 }}>{row.radiologist}</span></td>
                      <td style={tdS}><div style={{ fontWeight: 600 }}>{formatTime(row.rejectedAt)}</div><div style={{ fontSize: CONFIG.fonts.sm, color: CONFIG.colors.textMuted }}>{formatShortDate(row.rejectedAt)}</div></td>
                      <td style={tdS}><span style={{ color: CONFIG.colors.critical, fontWeight: 600, fontSize: CONFIG.fonts.sm }}>{row.reason}</span></td>
                    </>
                  )}
                  {effectiveType === 'Reassigned' && (
                    <>
                      <td style={tdS}><span style={{ color: CONFIG.colors.textMuted, fontWeight: 600 }}>{row.from}</span></td>
                      <td style={tdS}><span style={{ color: CONFIG.colors.info, fontWeight: 700 }}>{row.to}</span></td>
                      <td style={tdS}><div style={{ fontWeight: 600 }}>{formatTime(row.reassignedAt)}</div><div style={{ fontSize: CONFIG.fonts.sm, color: CONFIG.colors.textMuted }}>{formatShortDate(row.reassignedAt)}</div></td>
                      <td style={tdS}><span style={{ color: CONFIG.colors.urgent, fontWeight: 600, fontSize: CONFIG.fonts.sm }}>{row.reason}</span></td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function RadioSubCard({ label, value, icon, accent, accentBg, dark = false, extraLabel, extraValue, onClick }) {
  const { isDark } = useTheme();
  const darkBg = isDark ? CONFIG.colors.liveCardGradient : 'linear-gradient(135deg,#bfdbfe 0%,#93c5fd 100%)';
  return (
    <div
      onClick={onClick}
      style={{
        background: dark ? darkBg : CONFIG.colors.cardBg,
        border: dark ? 'none' : `1px solid ${CONFIG.colors.cardBorder}`,
        borderRadius: CONFIG.cards.statCard.radius,
        padding: CONFIG.cards.statCard.padding,
        minWidth: 0,
        boxShadow: dark ? '0 6px 18px rgba(14,165,233,0.12)' : '0 2px 6px rgba(0,0,0,0.04)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: CONFIG.cards.statCard.minHeight,
        height: '100%',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'box-shadow 0.15s, transform 0.15s',
      }}
      onMouseEnter={e => { if (onClick) { e.currentTarget.style.boxShadow = `0 6px 20px ${accent}44`; e.currentTarget.style.transform = 'translateY(-2px)'; } }}
      onMouseLeave={e => { if (onClick) { e.currentTarget.style.boxShadow = dark ? '0 6px 18px rgba(14,165,233,0.12)' : '0 2px 6px rgba(0,0,0,0.04)'; e.currentTarget.style.transform = 'none'; } }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span style={{ fontSize: CONFIG.fonts.lg, color: dark ? (isDark ? 'rgba(255,255,255,0.82)' : '#1e40af') : CONFIG.colors.textMuted, fontWeight: 600, lineHeight: 1.3 }}>{label}</span>
        <span style={{ background: accentBg, color: accent, width: 34, height: 34, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: CONFIG.fonts.md, flexShrink: 0 }}>{icon}</span>
      </div>

      {/* Push number to bottom */}
      <div style={{ flex: 1 }} />

      {/* Big number */}
      <div style={{ fontSize: CONFIG.fonts.statNumber, fontWeight: 800, color: dark ? (isDark ? '#fff' : '#1e3a5f') : accent, lineHeight: 1, letterSpacing: '-0.03em', marginBottom: extraLabel ? 10 : 0 }}>{value}</div>

      {/* Completion rate */}
      {extraLabel && extraValue && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: CONFIG.fonts.sm, color: dark ? (isDark ? 'rgba(255,255,255,0.65)' : '#1e40af') : CONFIG.colors.textMuted, fontWeight: 600, marginBottom: 2 }}>{extraLabel}</div>
          <div style={{ fontSize: CONFIG.fonts.xl, color: isDark ? '#6ee7b7' : '#166534', fontWeight: 800 }}>{extraValue}</div>
        </div>
      )}

      {/* Progress bar */}
      <div style={{ height: 4, background: dark ? (isDark ? 'rgba(255,255,255,0.12)' : 'rgba(30,58,95,0.15)') : accentBg, borderRadius: 2 }}>
        <div style={{ height: '100%', width: `${Math.min(value * 7, 100)}%`, background: accent, borderRadius: 2, transition: 'width 0.5s' }} />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [orgFilter, setOrgFilter] = useState(CONFIG.labels.overall);
  const [radioFilter, setRadioFilter] = useState(CONFIG.labels.overall);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [drilldown, setDrilldown] = useState(null);

  // ─── Live QC data from admin backend ─────────────────────────────────────
  // Overrides the static QC Cases counts AND the modal rows when available.
  // Falls back to hardcoded numbers silently if the endpoint isn't up.
  const [qcLive, setQcLive] = useState(null); // { counts: {...}, cases: [...] }
  useEffect(() => {
    const API_BASE =
      (typeof import.meta !== 'undefined' && import.meta.env &&
        (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE)) || '';
    const tokRaw =
      localStorage.getItem('token') ||
      localStorage.getItem('access_token') ||
      localStorage.getItem('authToken') ||
      localStorage.getItem('jwt');
    let tok = tokRaw;
    if (!tok) {
      for (const k of ['auth', 'user', 'authUser']) {
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
      fetch(`${API_BASE}/admin/qc/summary`, {
        headers: tok ? { Authorization: `Bearer ${tok}` } : {},
      })
        .then(r => (r.ok ? r.json() : null))
        .then(d => { if (d) setQcLive(d); })
        .catch(() => {});
    load();
    const id = setInterval(load, 15000);  // refresh every 15s
    return () => clearInterval(id);
  }, []);

  const { isDark } = useTheme();
  const C = isDark ? { card: 'var(--bg-card)', border: 'var(--border)', text: 'var(--text)', muted: 'var(--text-muted)', page: 'var(--bg-page)' } : { card: CONFIG.colors.cardBg, border: CONFIG.colors.cardBorder, text: CONFIG.colors.text, muted: CONFIG.colors.textMuted, page: CONFIG.colors.pageBg };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Plus Jakarta Sans', sans-serif; }
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(1.35)} }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        @keyframes slideUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: rgba(255,255,255,0.08); }
        ::-webkit-scrollbar-thumb { background: rgba(148,163,184,0.7); border-radius: 5px; }
      `}</style>

      <div style={{ width: '100%', minHeight: '100%', background: C.page, fontFamily: "'Plus Jakarta Sans', sans-serif", padding: CONFIG.layout.pagePadding, color: C.text }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: CONFIG.layout.sectionGap, animation: 'slideUp 0.4s ease' }}>
          <div style={{ display: 'flex', gap: CONFIG.layout.panelGap, alignItems: 'stretch', minHeight: CONFIG.layout.topCardsMinHeight }}>
            <div style={{ width: CONFIG.layout.leftCardWidth, flexShrink: 0, display: 'flex' }}>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: CONFIG.cards.leftCard.radius, padding: CONFIG.cards.leftCard.padding, boxShadow: '0 2px 12px rgba(0,0,0,0.05)', width: '100%', display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: CONFIG.fonts.sm, color: CONFIG.colors.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Overview</div>
                    <div style={{ fontSize: CONFIG.fonts.sectionTitle, fontWeight: 800, color: isDark ? '#ffffff' : '#000000' }}>{CONFIG.labels.orgHeader}</div>
                  </div>
                  <FilterTabs value={orgFilter} onChange={setOrgFilter} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, flex: 1, minHeight: CONFIG.layout.organisationInnerMinHeight }}>
                  <div onClick={() => setDrilldown('Total Cases')} style={{ background: isDark ? CONFIG.colors.headerGradient : 'linear-gradient(135deg,#bfdbfe 0%,#93c5fd 100%)', borderRadius: CONFIG.cards.miniCard.radius, padding: CONFIG.cards.miniCard.padding, color: isDark ? '#fff' : '#1e3a5f', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: CONFIG.cards.miniCard.minHeight, cursor: 'pointer' }}>
                    <div style={{ fontSize: CONFIG.fonts.sm, color: isDark ? 'rgba(255,255,255,0.72)' : '#1e40af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{CONFIG.labels.totalCases}</div>
                    <div style={{ fontSize: CONFIG.fonts.bigNumber, fontWeight: 800, lineHeight: 1, letterSpacing: '-0.03em' }}>248</div>
                    <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {[['Critical', 18, CONFIG.colors.critical], ['Urgent', 54, CONFIG.colors.urgent], ['Regular', 176, '#60a5fa']].map(([lbl, val, c]) => (
                        <div key={lbl}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontSize: CONFIG.fonts.sm, color: isDark ? 'rgba(255,255,255,0.75)' : '#1e40af' }}>{lbl}</span>
                            <span style={{ fontSize: CONFIG.fonts.sm, color: isDark ? '#fff' : '#1e3a5f', fontWeight: 700 }}>{val}</span>
                          </div>
                          <div style={{ height: 4, background: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(30,58,95,0.15)', borderRadius: 2 }}>
                            <div style={{ height: '100%', width: `${(val / 248) * 100}%`, background: c, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div onClick={() => setDrilldown('QC Cases')} style={{ background: isDark ? CONFIG.colors.headerGradient : 'linear-gradient(135deg,#bfdbfe 0%,#93c5fd 100%)', borderRadius: CONFIG.cards.miniCard.radius, padding: CONFIG.cards.miniCard.padding, color: isDark ? '#fff' : '#1e3a5f', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: CONFIG.cards.miniCard.minHeight, cursor: 'pointer' }}>
                    <div style={{ fontSize: CONFIG.fonts.sm, color: isDark ? 'rgba(255,255,255,0.72)' : '#1e40af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{CONFIG.labels.qcCases}</div>
                    {(() => {
                      // Live counts if backend responded. No more mock fallback —
                      // show 0 until data arrives.  This avoids misleading numbers.
                      const c       = qcLive && qcLive.counts ? qcLive.counts : null;
                      const total   = c ? c.total  : 0;
                      const passed  = c ? c.passed : 0;
                      const failed  = c ? c.failed : 0;
                      const denom   = Math.max(total, 1);
                      return (
                        <>
                          <div style={{ fontSize: CONFIG.fonts.bigNumber, fontWeight: 800, lineHeight: 1, letterSpacing: '-0.03em' }}>{total}</div>
                          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {[['Passed', passed, CONFIG.colors.success], ['Failed', failed, CONFIG.colors.critical]].map(([lbl, val, clr]) => (
                              <div key={lbl}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                  <span style={{ fontSize: CONFIG.fonts.sm, color: isDark ? 'rgba(255,255,255,0.75)' : '#1e40af' }}>{lbl}</span>
                                  <span style={{ fontSize: CONFIG.fonts.sm, color: isDark ? '#fff' : '#1e3a5f', fontWeight: 700 }}>{val}</span>
                                </div>
                                <div style={{ height: 4, background: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(30,58,95,0.15)', borderRadius: 2 }}>
                                  <div style={{ height: '100%', width: `${(val / denom) * 100}%`, background: clr, borderRadius: 2 }} />
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ width: CONFIG.layout.rightCardWidth, minWidth: 0, display: 'flex' }}>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: CONFIG.cards.rightCard.radius, padding: CONFIG.cards.rightCard.padding, boxShadow: '0 2px 12px rgba(0,0,0,0.05)', width: '100%', display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: CONFIG.fonts.sm, color: CONFIG.colors.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Overview</div>
                    <div style={{ fontSize: CONFIG.fonts.sectionTitle, fontWeight: 800, color: isDark ? '#ffffff' : '#000000' }}>{CONFIG.labels.radioHeader}</div>
                  </div>
                  <FilterTabs value={radioFilter} onChange={setRadioFilter} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: CONFIG.cards.statsGap, flex: 1, alignItems: 'stretch', minHeight: CONFIG.layout.radiologistStatsMinHeight }}>
                  <RadioSubCard
                    label={CONFIG.labels.scansCompleted}
                    value={187}
                    icon="✓"
                    accent={CONFIG.colors.success}
                    accentBg={CONFIG.colors.successBadge}
                    dark
                    extraLabel="Completion Rate"
                    extraValue="75.4%"
                    onClick={() => setDrilldown('Scans Completed')}
                  />
                  <SummaryListCard
                    label={CONFIG.labels.cases}
                    icon="📚"
                    accent={CONFIG.colors.info}
                    accentBg={CONFIG.colors.infoBadge}
                    rows={getCasesSummary()}
                    dark
                    onClick={() => setDrilldown('Cases')}
                  />
                  <SummaryListCard
                    label={CONFIG.labels.reportQc}
                    icon="🛡️"
                    accent={CONFIG.colors.success}
                    accentBg={CONFIG.colors.successBadge}
                    rows={getReportQCSummary(qcLive)}
                    totalValue={getReportQCSummary(qcLive).reduce((sum, item) => sum + item.value, 0)}
                    dark
                    onClick={() => setDrilldown('Report QC')}
                  />
                </div>
              </div>
            </div>
          </div>

                          <div
            style={{
              width: CONFIG.layout.bottomCardWidth,
              background: isDark ? CONFIG.colors.liveCardGradient : 'linear-gradient(135deg,#bfdbfe 0%,#93c5fd 100%)',
              borderRadius: CONFIG.cards.bottomCard.radius,
              padding: CONFIG.cards.bottomCard.padding,
              boxShadow: '0 6px 24px rgba(14,165,233,0.16)',
              minHeight: CONFIG.layout.bottomCardMinHeight,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 5,
                flexWrap: 'wrap',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#4ade80',
                    boxShadow: '0 0 7px #4ade80',
                    animation: 'pulse 1.5s infinite',
                    display: 'inline-block',
                  }}
                />
                <span
                  style={{
                    fontSize: CONFIG.fonts.sectionTitle,
                    fontWeight: 800,
                    color: isDark ? '#fff' : '#1e3a5f',
                  }}
                >
                  {CONFIG.labels.liveTitle}
                </span>
                <span
                  style={{
                    background: 'rgba(74,222,128,0.16)',
                    color: '#4ade80',
                    padding: '4px 10px',
                    borderRadius: 20,
                    fontSize: CONFIG.fonts.sm,
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                  }}
                >
                  LIVE
                </span>
              </div>

              <button
                onClick={() => setHistoryOpen(true)}
                style={{
                  background: isDark ? 'rgba(255,255,255,0.11)' : 'rgba(30,58,95,0.1)',
                  border: isDark ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(30,58,95,0.25)',
                  color: isDark ? '#e0f2fe' : '#1e3a5f',
                  borderRadius: 8,
                  padding: '8px 14px',
                  fontSize: CONFIG.fonts.sm,
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                {CONFIG.labels.historyBtn}
              </button>
            </div>

            <div
              style={{
                fontSize: CONFIG.fonts.sm,
                color: isDark ? 'rgba(255,255,255,0.48)' : 'rgba(30,58,95,0.6)',
                marginBottom: 14,
              }}
            >
              Showing newest first · scroll to see remaining assignments
            </div>

            <LiveTable data={SAMPLE_LIVE} />
          </div>

          <div
            style={{
              width: '100%',
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: CONFIG.cards.bottomCard.radius,
              padding: '18px',
              boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
            }}
          >
            <AvailabilitySchedule defaultView="admin" hideViewToggle />
          </div>
        </div>
      </div>



      <HistoryModal open={historyOpen} onClose={() => setHistoryOpen(false)} data={SAMPLE_HISTORY} />
      {drilldown && <DrilldownModal type={drilldown} qcLive={qcLive} onClose={() => setDrilldown(null)} />}
    </>
  );
}