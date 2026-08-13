import React, { useEffect, useState } from "react";
import {
  CModal,
  CModalBody,
  CModalHeader,
  CModalTitle,
  CButton,
} from "@coreui/react";

// Priority: prefer backend value, fall back to index-based heuristic
function getPriority(item, index) {
  const p = (item.priority || "").toUpperCase();
  if (p === "STAT" || p === "CRITICAL") return "critical";
  if (p === "URGENT") return "urgent";
  return index < 2 ? "critical" : "urgent";
}

// ─── Live countdown helpers ─────────────────────────────────────────────────
function formatSecondsLeft(seconds) {
  if (seconds == null || seconds <= 0) return "Expired";
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m > 0) return `${m}m ${sec.toString().padStart(2, "0")}s`;
  return `${sec}s`;
}

function expiryColor(seconds) {
  if (seconds == null || seconds <= 0) return "#9ca3af";
  if (seconds < 60)   return "#dc2626"; // < 1 min red
  if (seconds < 300)  return "#f59e0b"; // < 5 min amber
  return "#16a34a";                       // healthy green
}

export default function ScanQueueDetailsModal({
  visible,
  onClose,
  selectedData,
  isDark,
  onAccept,   // ⬅️ wired by Dashboard
  onReject,   // ⬅️ wired by Dashboard
}) {
  const [activeTab, setActiveTab] = useState(null);
  const [tick, setTick] = useState(0);

  // 1-second ticker — only while modal is open
  useEffect(() => {
    if (!visible) return;
    setTick(0); // reset on open
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [visible]);

  if (!selectedData) return null;

  const dm = {
    bg:      isDark ? "#1f2d45" : "#ffffff",
    border:  isDark ? "rgba(159,196,255,0.14)" : "rgba(0,0,0,0.08)",
    text:    isDark ? "#f4f8ff" : "#111827",
    muted:   isDark ? "#94a3b8" : "#6b7280",
    tabText: isDark ? "#94a3b8" : "#64748b",
  };

  const isUpcoming = selectedData.queueType === "assigned";
  const allItems = selectedData.items || [];

  const dateGroups = isUpcoming ? [...new Set(allItems.map((i) => i.date))].sort() : [];
  const currentDateTab = activeTab && isUpcoming ? activeTab : (dateGroups[0] || null);

  const taggedItems = !isUpcoming
    ? allItems.map((item, i) => ({ ...item, priority: getPriority(item, i) }))
    : [];

  const criticalItems = taggedItems.filter((i) => i.priority === "critical");
  const urgentItems   = taggedItems.filter((i) => i.priority === "urgent");

  const pendingTab = activeTab && !isUpcoming ? activeTab : "critical";
  const pendingDisplay = pendingTab === "critical" ? criticalItems : urgentItems;

  const upcomingDisplay = isUpcoming
    ? allItems.filter((i) => i.date === currentDateTab)
    : [];

  const displayItems = isUpcoming ? upcomingDisplay : pendingDisplay;
  const scrollNeeded = displayItems.length > 4;

  const dayLabel = (dateStr) => {
    const d = allItems.find((i) => i.date === dateStr);
    return d ? d.day : dateStr;
  };

  const modalTitle = isUpcoming
    ? "Upcoming Assigned Cases"
    : `${capitalize(selectedData.queueType)} Cases — ${selectedData.modality}`;

  // Live decorate items with ticking countdown
  const decoratedItems = displayItems.map((item) => {
    let live = item.secondsLeft;
    if (typeof live === "number") live = item.secondsLeft - tick;
    return { ...item, _secondsLeftLive: live };
  });

  return (
    <CModal
      visible={visible}
      onClose={onClose}
      alignment="center"
      size="xl"
      className="queue-details-modal"
      backdrop="static"
    >
      <CModalHeader style={{ borderBottom: `1px solid ${dm.border}`, paddingBottom: 12, background: dm.bg }}>
        <CModalTitle style={{ fontSize: 17, fontWeight: 800, color: dm.text }}>
          {modalTitle}
          <span style={{ fontSize: 13, fontWeight: 600, color: dm.muted, marginLeft: 8 }}>
            ({selectedData.count} total)
          </span>
        </CModalTitle>
      </CModalHeader>

      <CModalBody style={{ padding: "16px 20px 20px", background: dm.bg }}>

        {/* ── TABS ── */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          {isUpcoming ? (
            dateGroups.map((dateStr) => {
              const isActive = currentDateTab === dateStr;
              const count = allItems.filter((i) => i.date === dateStr).length;
              return (
                <button
                  key={dateStr}
                  onClick={() => setActiveTab(dateStr)}
                  style={{
                    padding: "8px 20px", borderRadius: 10, border: "none", cursor: "pointer",
                    fontWeight: 800, fontSize: 13, display: "flex", alignItems: "center", gap: 8,
                    transition: "all 0.2s",
                    background: isActive ? "linear-gradient(135deg,#134e5e,#71b280)" : (isDark ? "#1e3a5f" : "#f1f5f9"),
                    color: isActive ? "#fff" : dm.tabText,
                    boxShadow: isActive ? "0 4px 14px rgba(19,78,94,0.3)" : "none",
                  }}
                >
                  <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 900, lineHeight: 1 }}>{dateStr.slice(5).replace("-", " / ")}</span>
                    <span style={{ fontSize: 10, opacity: 0.8, fontWeight: 600 }}>{dayLabel(dateStr)}</span>
                  </span>
                  <span style={{
                    background: isActive ? "rgba(255,255,255,0.25)" : (isDark ? "rgba(255,255,255,0.1)" : "#e2e8f0"),
                    color: isActive ? "#fff" : dm.tabText,
                    fontSize: 11, fontWeight: 900, borderRadius: 20, padding: "1px 8px",
                  }}>{count}</span>
                </button>
              );
            })
          ) : (
            <>
              <button
                onClick={() => setActiveTab("critical")}
                style={{
                  padding: "8px 22px", borderRadius: 10, border: "none", cursor: "pointer",
                  fontWeight: 800, fontSize: 13, display: "flex", alignItems: "center", gap: 8,
                  background: pendingTab === "critical" ? "linear-gradient(135deg,#ef4444,#b91c1c)" : (isDark ? "#2d1a1a" : "#f1f5f9"),
                  color: pendingTab === "critical" ? "#fff" : dm.tabText,
                  boxShadow: pendingTab === "critical" ? "0 4px 14px rgba(239,68,68,0.3)" : "none",
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: pendingTab === "critical" ? "#fff" : "#ef4444", display: "inline-block" }} />
                Critical
                <span style={{ background: pendingTab === "critical" ? "rgba(255,255,255,0.25)" : (isDark ? "rgba(239,68,68,0.2)" : "#fee2e2"), color: pendingTab === "critical" ? "#fff" : "#ef4444", fontSize: 11, fontWeight: 900, borderRadius: 20, padding: "1px 8px" }}>
                  {criticalItems.length}
                </span>
              </button>
              <button
                onClick={() => setActiveTab("urgent")}
                style={{
                  padding: "8px 22px", borderRadius: 10, border: "none", cursor: "pointer",
                  fontWeight: 800, fontSize: 13, display: "flex", alignItems: "center", gap: 8,
                  background: pendingTab === "urgent" ? "linear-gradient(135deg,#f59e0b,#d97706)" : (isDark ? "#2d2210" : "#f1f5f9"),
                  color: pendingTab === "urgent" ? "#fff" : dm.tabText,
                  boxShadow: pendingTab === "urgent" ? "0 4px 14px rgba(245,158,11,0.3)" : "none",
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: pendingTab === "urgent" ? "#fff" : "#f59e0b", display: "inline-block" }} />
                Urgent
                <span style={{ background: pendingTab === "urgent" ? "rgba(255,255,255,0.25)" : (isDark ? "rgba(245,158,11,0.2)" : "#fef3c7"), color: pendingTab === "urgent" ? "#fff" : "#d97706", fontSize: 11, fontWeight: 900, borderRadius: 20, padding: "1px 8px" }}>
                  {urgentItems.length}
                </span>
              </button>
            </>
          )}
        </div>

        {/* ── Case List ── */}
        <div style={{
          display: "grid", gap: 10,
          maxHeight: scrollNeeded ? 440 : "unset",
          overflowY: scrollNeeded ? "auto" : "visible",
          paddingRight: scrollNeeded ? 4 : 0,
        }}>
          {decoratedItems.map((item, index) => (
            <CaseCard
              key={item.id || index}
              item={item}
              priority={isUpcoming ? "upcoming" : pendingTab}
              isUpcoming={isUpcoming}
              isDark={isDark}
              onAccept={onAccept}
              onReject={onReject}
              onClose={onClose}
            />
          ))}

          {decoratedItems.length === 0 && (
            <div style={{
              border: `1px dashed ${dm.border}`, borderRadius: 12, padding: 28,
              textAlign: "center", color: dm.muted, fontWeight: 700,
              background: isDark ? "#1a2a3a" : "#fafafa", fontSize: 14,
            }}>
              No cases found
            </div>
          )}
        </div>
      </CModalBody>
    </CModal>
  );
}

function CaseCard({ item, priority, isUpcoming, isDark, onAccept, onReject, onClose }) {
  const [busy, setBusy] = useState(false);
  const isCritical   = priority === "critical";
  const accentColor  = isUpcoming ? "#134e5e" : isCritical ? "#ef4444" : "#f59e0b";
  const accentBg     = isUpcoming ? (isDark ? "#0d2e20" : "#f0faf4") : isCritical ? (isDark ? "#2d1010" : "#fef2f2") : (isDark ? "#2d1f05" : "#fffbeb");
  const accentBorder = isUpcoming ? (isDark ? "#1a5c3a" : "#a7d9c0") : isCritical ? (isDark ? "#7f1d1d" : "#fecaca") : (isDark ? "#78350f" : "#fde68a");
  const cardBg       = isDark ? "#1e2d42" : "#f8fafc";
  const textColor    = isDark ? "#f4f8ff" : "#111827";
  const mutedColor   = isDark ? "#94a3b8" : "#6b7280";
  const borderColor  = isDark ? "rgba(159,196,255,0.14)" : accentBorder;
  const badgeLabel   = isUpcoming ? "upcoming" : priority;

  const secondsLeft   = item._secondsLeftLive;
  const hasCountdown  = typeof secondsLeft === "number";
  const isExpired     = hasCountdown && secondsLeft <= 0;
  const expColor      = expiryColor(secondsLeft);

  const handleAccept = async () => {
    if (!onAccept || !item.case_id) return;
    setBusy(true);
    try {
      await onAccept(item.case_id);
      onClose && onClose();
    } catch (e) {
      // parent shows error
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    if (!onReject || !item.case_id) return;
    const reason = window.prompt("Reason for rejecting (optional):", "");
    if (reason === null) return; // cancelled
    setBusy(true);
    try {
      await onReject(item.case_id, reason || "Declined");
    } catch (e) {
      // parent shows error
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      border: `1px solid ${borderColor}`,
      borderLeft: `4px solid ${accentColor}`,
      borderRadius: 12, padding: "14px 16px",
      background: cardBg,
      display: "flex", flexDirection: "column", gap: 12,
      opacity: isExpired ? 0.55 : 1,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{
            fontSize: 10, fontWeight: 900, letterSpacing: 1.5,
            color: accentColor, background: accentBg,
            border: `1px solid ${accentBorder}`,
            borderRadius: 20, padding: "3px 10px",
            textTransform: "uppercase",
            display: "flex", alignItems: "center", gap: 5,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: accentColor, display: "inline-block" }} />
            {badgeLabel}
          </span>

          {/* ⬅️ Live expiry countdown badge */}
          {hasCountdown && (
            <span style={{
              fontSize: 11, fontWeight: 800, letterSpacing: 0.3,
              color: "#fff", background: expColor,
              borderRadius: 20, padding: "3px 10px",
              display: "flex", alignItems: "center", gap: 5,
            }}>
              <span style={{ fontSize: 10 }}>⏱</span>
              {isExpired ? "Expired" : `Expires in ${formatSecondsLeft(secondsLeft)}`}
            </span>
          )}
        </div>

        <span style={{ fontSize: 11, color: mutedColor, fontWeight: 700, fontFamily: "'Courier New', monospace" }}>
          {item.id}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.7fr 1.3fr 0.9fr 1.1fr", gap: 12, alignItems: "start" }}>
        <DataBox label="Date / Day"      value={item.date}        sub={item.day}             textColor={textColor} mutedColor={mutedColor} />
        <DataBox label="Scan Type"       value={item.scanType}    accent={accentColor}       textColor={textColor} mutedColor={mutedColor} />
        <DataBox label="From → End Time" value={item.fromTime}    sub={`→ ${item.endTime}`}  textColor={textColor} mutedColor={mutedColor} />
        <DataBox label="Body Part"       value={item.bodyPart}                               textColor={textColor} mutedColor={mutedColor} />
        <DataBox label="Case Number"     value={item.caseNumber}  mono                       textColor={textColor} mutedColor={mutedColor} />
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <CButton
          color="primary" size="sm"
          disabled={busy || isExpired}
          onClick={handleAccept}
          style={{
            background: isExpired ? "#9ca3af" : "linear-gradient(135deg,#3b82f6,#1d4ed8)",
            border: "none", borderRadius: 8, fontWeight: 800,
            padding: "5px 20px", fontSize: 12,
            cursor: (busy || isExpired) ? "not-allowed" : "pointer",
          }}
        >
          {busy ? "…" : "Open"}
        </CButton>
        <CButton
          color="danger" variant="outline" size="sm"
          disabled={busy || isExpired}
          onClick={handleReject}
          style={{ borderRadius: 8, fontWeight: 800, padding: "5px 20px", fontSize: 12 }}
        >
          Reject
        </CButton>
      </div>
    </div>
  );
}

function DataBox({ label, value, sub, accent, mono, textColor, mutedColor }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: mutedColor, marginBottom: 4, letterSpacing: 0.4, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 800, color: accent || textColor, fontFamily: mono ? "'Courier New', monospace" : "inherit", lineHeight: 1.3 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, fontWeight: 600, color: mutedColor, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function capitalize(value = "") {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
