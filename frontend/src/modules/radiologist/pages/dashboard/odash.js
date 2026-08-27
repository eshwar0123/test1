import React, { useEffect, useMemo, useRef, useState } from "react";
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

import bodyImage from "/body.png";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

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
        {
          id: "P-CT-001",
          date: "2026-03-09",
          day: "Monday",
          scanType: "CT",
          fromTime: "08:00 AM",
          endTime: "12:00 PM",
          bodyPart: "Head",
          caseNumber: "CASE-CT-1001",
        },
        {
          id: "P-CT-002",
          date: "2026-03-10",
          day: "Tuesday",
          scanType: "CT",
          fromTime: "09:00 AM",
          endTime: "01:00 PM",
          bodyPart: "Chest",
          caseNumber: "CASE-CT-1002",
        },
        {
          id: "P-CT-003",
          date: "2026-03-11",
          day: "Wednesday",
          scanType: "CT",
          fromTime: "10:00 AM",
          endTime: "02:00 PM",
          bodyPart: "Abdomen",
          caseNumber: "CASE-CT-1003",
        },
        {
          id: "P-CT-004",
          date: "2026-03-12",
          day: "Thursday",
          scanType: "CT",
          fromTime: "01:00 PM",
          endTime: "05:00 PM",
          bodyPart: "Spine",
          caseNumber: "CASE-CT-1004",
        },
      ],
    },

    MRI: {
      modality: "MRI",
      count: 3,
      items: [
        {
          id: "P-MRI-001",
          date: "2026-03-09",
          day: "Monday",
          scanType: "MRI",
          fromTime: "08:30 AM",
          endTime: "12:30 PM",
          bodyPart: "Brain",
          caseNumber: "CASE-MRI-2001",
        },
        {
          id: "P-MRI-002",
          date: "2026-03-10",
          day: "Tuesday",
          scanType: "MRI",
          fromTime: "11:00 AM",
          endTime: "03:00 PM",
          bodyPart: "Knee",
          caseNumber: "CASE-MRI-2002",
        },
        {
          id: "P-MRI-003",
          date: "2026-03-11",
          day: "Wednesday",
          scanType: "MRI",
          fromTime: "02:00 PM",
          endTime: "06:00 PM",
          bodyPart: "Shoulder",
          caseNumber: "CASE-MRI-2003",
        },
      ],
    },

    XRAY: {
      modality: "XRAY",
      count: 2,
      items: [
        {
          id: "P-XRAY-001",
          date: "2026-03-09",
          day: "Monday",
          scanType: "XRAY",
          fromTime: "09:00 AM",
          endTime: "01:00 PM",
          bodyPart: "Hand",
          caseNumber: "CASE-XRAY-3001",
        },
        {
          id: "P-XRAY-002",
          date: "2026-03-10",
          day: "Tuesday",
          scanType: "XRAY",
          fromTime: "01:00 PM",
          endTime: "05:00 PM",
          bodyPart: "Leg",
          caseNumber: "CASE-XRAY-3002",
        },
      ],
    },

    OTHER: {
      modality: "OTHER",
      count: 1,
      items: [
        {
          id: "P-OTH-001",
          date: "2026-03-11",
          day: "Wednesday",
          scanType: "OTHER",
          fromTime: "03:00 PM",
          endTime: "07:00 PM",
          bodyPart: "Whole Body",
          caseNumber: "CASE-OTH-4001",
        },
      ],
    },
  },

  assigned: {
    CT: {
      modality: "CT",
      count: 4,
      items: [
        {
          id: "A-CT-001",
          date: "2026-03-09",
          day: "Monday",
          scanType: "CT",
          fromTime: "07:00 AM",
          endTime: "11:00 AM",
          bodyPart: "Abdomen",
          caseNumber: "CASE-ACT-5001",
        },
        {
          id: "A-CT-002",
          date: "2026-03-10",
          day: "Tuesday",
          scanType: "CT",
          fromTime: "10:30 AM",
          endTime: "02:30 PM",
          bodyPart: "Chest",
          caseNumber: "CASE-ACT-5002",
        },
        {
          id: "A-CT-003",
          date: "2026-03-11",
          day: "Wednesday",
          scanType: "CT",
          fromTime: "01:30 PM",
          endTime: "05:30 PM",
          bodyPart: "Head",
          caseNumber: "CASE-ACT-5003",
        },
        {
          id: "A-CT-004",
          date: "2026-03-12",
          day: "Thursday",
          scanType: "CT",
          fromTime: "09:30 AM",
          endTime: "01:30 PM",
          bodyPart: "Pelvis",
          caseNumber: "CASE-ACT-5004",
        },
      ],
    },

    MRI: {
      modality: "MRI",
      count: 3,
      items: [
        {
          id: "A-MRI-001",
          date: "2026-03-09",
          day: "Monday",
          scanType: "MRI",
          fromTime: "08:00 AM",
          endTime: "12:00 PM",
          bodyPart: "Spine",
          caseNumber: "CASE-AMRI-6001",
        },
        {
          id: "A-MRI-002",
          date: "2026-03-10",
          day: "Tuesday",
          scanType: "MRI",
          fromTime: "12:00 PM",
          endTime: "04:00 PM",
          bodyPart: "Brain",
          caseNumber: "CASE-AMRI-6002",
        },
        {
          id: "A-MRI-003",
          date: "2026-03-11",
          day: "Wednesday",
          scanType: "MRI",
          fromTime: "02:00 PM",
          endTime: "06:00 PM",
          bodyPart: "Shoulder",
          caseNumber: "CASE-AMRI-6003",
        },
      ],
    },

    XRAY: {
      modality: "XRAY",
      count: 2,
      items: [
        {
          id: "A-XRAY-001",
          date: "2026-03-09",
          day: "Monday",
          scanType: "XRAY",
          fromTime: "07:30 AM",
          endTime: "11:30 AM",
          bodyPart: "Knee",
          caseNumber: "CASE-AXRAY-7001",
        },
        {
          id: "A-XRAY-002",
          date: "2026-03-10",
          day: "Tuesday",
          scanType: "XRAY",
          fromTime: "11:00 AM",
          endTime: "03:00 PM",
          bodyPart: "Chest",
          caseNumber: "CASE-AXRAY-7002",
        },
      ],
    },

    OTHER: {
      modality: "OTHER",
      count: 1,
      items: [
        {
          id: "A-OTH-001",
          date: "2026-03-11",
          day: "Wednesday",
          scanType: "OTHER",
          fromTime: "04:00 PM",
          endTime: "08:00 PM",
          bodyPart: "Whole Body",
          caseNumber: "CASE-AOTH-8001",
        },
      ],
    },
  },
};

export default function Dashboard() {
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
  const [bodyOverviewOpen, setBodyOverviewOpen] = useState(false);
  const [bodyOverviewFullscreen, setBodyOverviewFullscreen] = useState(false);

  const [queueTab, setQueueTab] = useState("pending");
  const [selectedQueueCard, setSelectedQueueCard] = useState(null);
  const [queueModalOpen, setQueueModalOpen] = useState(false);

  useEffect(() => {
    if (isHoveringChart) return;

    timerRef.current = setInterval(() => {
      setActiveModalityIdx((i) => (i + 1) % MODALITIES.length);
    }, 3000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
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

  const queueCards = useMemo(() => {
    const current = queueData[queueTab];
    return [
      current.CT,
      current.MRI,
      current.XRAY,
      current.OTHER,
    ];
  }, [queueTab]);

  const onDateClick = (dateObj) => {
    setSelectedDate(dateObj);
    setStartTime("09:00");
    setEndTime("17:00");
    setNotes("");
    setOpen(true);
  };

  const handleQueueCardClick = (card) => {
    setSelectedQueueCard({
      queueType: queueTab,
      ...card,
    });
    setQueueModalOpen(true);
  };

  return (
    <div style={{ width: "100%" }}>
      {/* TOP ROW - 3 CARDS */}
      <div
        style={{
          display: "grid",
         gridTemplateColumns: "1fr 1fr 1.3fr",
          gap: 14,
          alignItems: "stretch",
        }}
      >
        {/* TOP LEFT - SCANS COMPLETED */}
        <CCard style={scanOverviewCardStyle}>
          <CCardHeader style={cardHeaderStyle}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <span>Scans Completed</span>
  
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <select
                  value={scanFilter}
                  onChange={(e) => setScanFilter(e.target.value)}
                  style={selectStyle}
                >
                  <option value="overall">Overall</option>
                  <option value="today">Today</option>
                  <option value="custom">Custom</option>
                </select>
  
                {scanFilter === "custom" && (
                  <>
                    <input
                      type="date"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                      style={dateInputStyle}
                    />
                    <input
                      type="date"
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                      style={dateInputStyle}
                    />
                  </>
                )}
              </div>
            </div>
          </CCardHeader>
  
          <CCardBody style={{ padding: "18px 20px" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "0.9fr 1.1fr",
                gap: 18,
                alignItems: "stretch",
                minHeight: 260,
              }}
            >
              <div
                style={{
                  minWidth: 0,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ fontSize: 34, fontWeight: 900, lineHeight: 1 }}>
                    {completedCount}
                  </div>
                  <div style={{ marginTop: 6, opacity: 0.75 }}>
                    {scanFilterLabel} completed (demo)
                  </div>
                </div>
  
                <div
                  style={{
                    marginTop: 16,
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    gap: 12,
                    maxWidth: 270,
                  }}
                >
                  <SmallMiniStat label="CT" value={totals.CT} />
                  <SmallMiniStat label="MRI" value={totals.MRI} />
                  <SmallMiniStat label="XRAY" value={totals.XRAY} />
                  <SmallMiniStat label="OTHER" value={totals.OTHER} />
                </div>
              </div>
  
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <button
                  type="button"
                  onClick={() => setBodyOverviewOpen(true)}
                  style={bodyButtonStyle}
                >
                  <img
                    src={bodyImage}
                    alt="Body scan overview"
                    style={bodyImageStyle}
                  />
                </button>
              </div>
            </div>
          </CCardBody>
        </CCard>
  
        {/* TOP CENTER - PENDING / ASSIGNED */}
        <CCard style={scanOverviewCardStyle}>
          <CCardHeader style={cardHeaderStyle}>

            
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div > Scans</div>
                <TopTabButton
                  active={queueTab === "pending"}
                  onClick={() => setQueueTab("pending")}
                >
                  Pending
                </TopTabButton>
  
                <TopTabButton
                  active={queueTab === "assigned"}
                  onClick={() => setQueueTab("assigned")}
                >
                  Assigned
                </TopTabButton>
              </div>
  
           
            </div>
          </CCardHeader>
  
          <CCardBody style={{ padding: 18 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 16,
                minHeight: 255,
                alignContent: "start",
              }}
            >
              {queueCards.map((item) => (
                <MiniQueueCard
                  key={`${queueTab}-${item.modality}`}
                  modality={item.modality}
                  value={item.count}
                  onClick={() => handleQueueCardClick(item)}
                />
              ))}
            </div>
          </CCardBody>
        </CCard>
  
        {/* TOP RIGHT - OLD GRAPH CARD */}
        <CCard style={scanOverviewCardStyle}>
          <CCardHeader style={cardHeaderStyle}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div style={{ fontWeight: 900 }}>
                Scan Types Completed{" "}
                <span style={{ opacity: 0.55, fontWeight: 700 }}>
                  ({activeModality.label})
                </span>
              </div>
  
              <div style={{ display: "flex", gap: 8 }}>
                <ToggleBtn active={range === "days"} onClick={() => setRange("days")}>
                  Days
                </ToggleBtn>
                <ToggleBtn active={range === "weeks"} onClick={() => setRange("weeks")}>
                  Weeks
                </ToggleBtn>
                <ToggleBtn active={range === "months"} onClick={() => setRange("months")}>
                  Months
                </ToggleBtn>
              </div>
            </div>
          </CCardHeader>
  
          <CCardBody style={{ paddingTop: 12 }}>
            <div
              style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}
              onMouseEnter={() => setIsHoveringChart(true)}
              onMouseLeave={() => setIsHoveringChart(false)}
            >
              {MODALITIES.map((m, idx) => (
                <Pill
                  key={m.key}
                  active={idx === activeModalityIdx}
                  onClick={() => setActiveModalityIdx(idx)}
                >
                  {m.label}
                </Pill>
              ))}
            </div>
  
            <div style={{ textAlign: "right", fontSize: 12, fontWeight: 800, opacity: 0.55, marginBottom: 6 }}>
              Auto
            </div>
  
            <div
              style={{ height: 220 }}
              onMouseEnter={() => setIsHoveringChart(true)}
              onMouseLeave={() => setIsHoveringChart(false)}
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 8, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="modFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--cui-primary)" stopOpacity={0.24} />
                      <stop offset="95%" stopColor="var(--cui-primary)" stopOpacity={0.06} />
                    </linearGradient>
                  </defs>
  
                  <CartesianGrid strokeDasharray="4 6" vertical={false} />
                  <XAxis dataKey="label" tickMargin={8} />
                  <YAxis tickMargin={8} />
                  <Tooltip
                    cursor={{ strokeDasharray: "3 3" }}
                    contentStyle={{
                      borderRadius: 10,
                      border: "1px solid rgba(0,0,0,0.12)",
                    }}
                  />
  
                  <Area
                    type="monotone"
                    dataKey={activeModality.key}
                    stroke="var(--cui-primary)"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#modFill)"
                    dot={{ r: 3, stroke: "var(--cui-primary)", strokeWidth: 2, fill: "#fff" }}
                    activeDot={{ r: 5, stroke: "var(--cui-primary)", strokeWidth: 2, fill: "#fff" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CCardBody>
        </CCard>
      </div>
  
      {/* BOTTOM ROW */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.2fr 1fr",
          gap: 14,
          marginTop: 14,
          alignItems: "start",
        }}
      >
        {/* BOTTOM LEFT - CALENDAR */}
        <CCard style={calendarCardStyle}>
          <CCardHeader style={cardHeaderStyle}>Calendar</CCardHeader>
          <CCardBody>
            <Calendar onDateClick={onDateClick} />
          </CCardBody>
        </CCard>
  
        {/* BOTTOM RIGHT - NOTES */}
        <CCard style={notesCardStyle}>
          <CCardHeader style={cardHeaderStyle}>Notes</CCardHeader>
          <CCardBody style={{ display: "grid", gap: 10 }}>
            <NoteCard title="Pending Follow-up" text="Review two MRI cases assigned yesterday." />
            <NoteCard title="Reminder" text="Update availability for next week." />
            <NoteCard title="Quick Tip" text="Coming soon...." />
          </CCardBody>
        </CCard>
      </div>
  
      {/* QUEUE MODAL */}
      <ScanQueueDetailsModal
        visible={queueModalOpen}
        onClose={() => setQueueModalOpen(false)}
        selectedData={selectedQueueCard}
      />
  
      {/* CALENDAR MODAL */}
      <CModal
        visible={open}
        onClose={() => setOpen(false)}
        alignment="center"
        size="xl"
        className="calendar-big-modal"
      >
        <CModalHeader>
          <CModalTitle>
            {selectedDate ? selectedDate.toDateString() : "Select Date"}
          </CModalTitle>
        </CModalHeader>
  
        <CModalBody>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.7fr 1fr",
              gap: 24,
              minHeight: "580px",
            }}
          >
            <div
              style={{
                border: "1px solid rgba(0,0,0,0.1)",
                borderRadius: 12,
                padding: 16,
                background: "#fafafa",
              }}
            >
              <CalendarModal
                value={selectedDate}
                onSelectDate={(d) => setSelectedDate(d)}
              />
            </div>
  
            <div
              style={{
                border: "1px solid rgba(0,0,0,0.1)",
                borderRadius: 12,
                padding: 16,
              }}
            >
              <div style={{ fontWeight: 900, marginBottom: 14 }}>Time</div>
  
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, marginBottom: 6 }}>Start Time</div>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  style={modalInputStyle}
                />
              </div>
  
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, marginBottom: 6 }}>End Time</div>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  style={modalInputStyle}
                />
              </div>
  
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, marginBottom: 6 }}>Notes</div>
                <textarea
                  rows={4}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add notes..."
                  style={{ ...modalInputStyle, resize: "none" }}
                />
              </div>
  
              <div style={{ display: "flex", gap: 10 }}>
                <CButton color="primary">Save</CButton>
                <CButton color="secondary" variant="outline" onClick={() => setOpen(false)}>
                  Close
                </CButton>
              </div>
            </div>
          </div>
        </CModalBody>
      </CModal>
  
      {/* BODY OVERVIEW MODAL */}
      <CModal
          visible={bodyOverviewOpen}
          onClose={() => setBodyOverviewOpen(false)}
          alignment="center"
          size={bodyOverviewFullscreen ? "fullscreen" : "xl"}
          backdrop="static"
          className="body-overview-modal"
        >
          <CModalBody
              style={{
                padding: bodyOverviewFullscreen ? 18 : "34px 20px 18px",
                background: "#f8fafc",
                maxHeight: bodyOverviewFullscreen ? "100vh" : "88vh",
                minHeight: bodyOverviewFullscreen ? "100vh" : "auto",
                overflowY: "auto",
              }}
            >
            <BodyScanOverview
              onClose={() => setBodyOverviewOpen(false)}
              isFullscreen={bodyOverviewFullscreen}
              onToggleFullscreen={() =>
                setBodyOverviewFullscreen((prev) => !prev)
              }
            />
          </CModalBody>
        </CModal>
    </div>
  );
}

function ToggleBtn({ active, children, onClick }) {
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
        fontWeight: 800,
        fontSize: 12,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function Pill({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "7px 12px",
        borderRadius: 999,
        border: active ? "1px solid #315efb" : "1px solid rgba(0,0,0,0.12)",
        background: active
          ? "linear-gradient(135deg, #315efb 0%,rgb(10, 39, 117) 100%)"
          : "#ffffff",
        color: active ? "#ffffff" : "#111827",
        fontWeight: 800,
        fontSize: 12,
        cursor: "pointer",
        boxShadow: active ? "0 8px 18px rgba(49,94,251,0.18)" : "none",
      }}
    >
      {children}
    </button>
  );
}

function TopTabButton({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        minWidth: 108,
        padding: "8px 12px",
        borderRadius: 10,
        border: active ? "1px solid #315efb" : "1px solid rgba(0,0,0,0.12)",
        background: active
          ? "linear-gradient(135deg, #315efb 0%,rgb(10, 39, 117) 100%)"
          : "#ffffff",
        color: active ? "#ffffff" : "#111827",
        fontSize: 15,
        fontWeight: 800,
        cursor: "pointer",
        boxShadow: active ? "0 8px 18px rgba(49,94,251,0.22)" : "none",
        transition: "all .2s ease",
      }}
    >
      {children}
    </button>
  );
}

function MiniQueueCard({ modality, value, onClick }) {
  const accentMap = {
    CT: {
      bg: "linear-gradient(135deg, rgba(49,94,251,0.10) 0%, rgba(29,78,216,0.04) 100%)",
      border: "rgba(49,94,251,0.22)",
      text: "#1d4ed8",
      shadow: "0 10px 22px rgba(49,94,251,0.12)",
    },
    MRI: {
      bg: "linear-gradient(135deg, rgba(14,165,233,0.10) 0%, rgba(6,182,212,0.04) 100%)",
      border: "rgba(14,165,233,0.22)",
      text: "#0369a1",
      shadow: "0 10px 22px rgba(14,165,233,0.12)",
    },
    XRAY: {
      bg: "linear-gradient(135deg, rgba(168,85,247,0.10) 0%, rgba(147,51,234,0.04) 100%)",
      border: "rgba(168,85,247,0.22)",
      text: "#7e22ce",
      shadow: "0 10px 22px rgba(168,85,247,0.12)",
    },
    OTHER: {
      bg: "linear-gradient(135deg, rgba(249,115,22,0.10) 0%, rgba(234,88,12,0.04) 100%)",
      border: "rgba(249,115,22,0.22)",
      text: "#c2410c",
      shadow: "0 10px 22px rgba(249,115,22,0.12)",
    },
  };

  const accent = accentMap[modality] || accentMap.CT;

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        minHeight: 108,
        border: `1px solid ${accent.border}`,
        borderRadius: 14,
        background: accent.bg,
        padding: "14px 16px",
        textAlign: "left",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        cursor: "pointer",
        transition: "transform .18s ease, box-shadow .18s ease, border-color .18s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = accent.shadow;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 800,
          color: accent.text,
          letterSpacing: "0.2px",
        }}
      >
        {modality}
      </div>

      <div
        style={{
          fontSize: 28,
          fontWeight: 900,
          color: "#111827",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
    </button>
  );
}

function SmallMiniStat({ label, value }) {
  const accentMap = {
    CT: {
      bg: "linear-gradient(135deg, rgba(49,94,251,0.10) 0%, rgba(29,78,216,0.04) 100%)",
      border: "rgba(49,94,251,0.22)",
      text: "#1d4ed8",
    },
    MRI: {
      bg: "linear-gradient(135deg, rgba(14,165,233,0.10) 0%, rgba(6,182,212,0.04) 100%)",
      border: "rgba(14,165,233,0.22)",
      text: "#0369a1",
    },
    XRAY: {
      bg: "linear-gradient(135deg, rgba(168,85,247,0.10) 0%, rgba(147,51,234,0.04) 100%)",
      border: "rgba(168,85,247,0.22)",
      text: "#7e22ce",
    },
    OTHER: {
      bg: "linear-gradient(135deg, rgba(249,115,22,0.10) 0%, rgba(234,88,12,0.04) 100%)",
      border: "rgba(249,115,22,0.22)",
      text: "#c2410c",
    },
  };

  const accent = accentMap[label] || accentMap.CT;

  return (
    <div
      style={{
        padding: "14px 14px",
        borderRadius: 14,
        border: `1px solid ${accent.border}`,
        background: accent.bg,
        minWidth: 0,
        height: 84,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 800,
          color: accent.text,
          letterSpacing: "0.2px",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 900,
          marginTop: 6,
          color: "#111827",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
    </div>
  );
}


function NoteCard({ title, text }) {
  return (
    <div
      style={{
        borderRadius: 12,
        border: "1px solid rgba(0,0,0,0.08)",
        padding: 12,
        background: "rgba(0,0,0,0.02)",
      }}
    >
      <div style={{ fontWeight: 900, marginBottom: 4 }}>{title}</div>
      <div style={{ opacity: 0.8 }}>{text}</div>
    </div>
  );
}

const cardStyle = {
  borderRadius: 14,
  overflow: "hidden",
};

const scanOverviewCardStyle = {
  borderRadius: 14,
  overflow: "hidden",
  minHeight: 332,
};

const calendarCardStyle = {
  borderRadius: 14,
  overflow: "hidden",
  minHeight: 500,
};

const notesCardStyle = {
  borderRadius: 14,
  overflow: "hidden",
  minHeight: 500,
};

const cardHeaderStyle = {
  fontWeight: 900,
  background: "rgba(0,0,0,0.02)",
};

const selectStyle = {
  padding: "6px 10px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "#fff",
  fontWeight: 800,
  fontSize: 12,
  outline: "none",
  cursor: "pointer",
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

const bodyButtonStyle = {
  width: "66%",
  height: 270,
  border: "1px solid rgba(0,0,0,0.1)",
  borderRadius: 18,
  background: "#ffffff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  cursor: "pointer",
  boxShadow: "0 6px 16px rgba(15,23,42,0.06)",
  overflow: "hidden",
};

const bodyImageStyle = {
  width: "110%",
  height: "100%",
  objectFit: "contain",
  display: "block",
  background: "#ffffff",
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