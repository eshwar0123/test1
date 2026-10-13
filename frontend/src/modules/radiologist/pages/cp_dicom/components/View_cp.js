import React, { useEffect, useRef, useState } from "react";
import { CButton } from "@coreui/react";
import { BACKEND_URL } from "../utils/constants";
import onixIcon from "/icon.png";


export default function ViewerSidePanel({
  showReport,
  showSidebar,
  setShowSidebar,
  setShowReport,
  exportReportPdf,
  downloadReportPdf,
  execCmd,
  reportEditorRef,
  rightTab,
  setRightTab,
  patientName,
  caseId,
  clientId,
  patientAge,
  patientSex,
  isNifti,
  filename,
  priority,
  status,
  study,
  caseModality,
  referredBy,
  caseLocation,
  waitMins,
  currentUserId,
  chatMessages,
  onChatFile,
  chatInput,
  setChatInput,
  sendChat,
  annTool,
  isCornerstone,
  activateCornerstoneAnnotationTool,
  setAnnTool,
  onAnnotationToolPick,
  annOwnerFilter,
  setAnnOwnerFilter,
  showAnnFilterMenu,
  setShowAnnFilterMenu,
  getCornerstoneAnnotationItems,
  cornerstoneAnnMeta,
  jumpToCornerstoneAnnotationByUid,
  cornerstoneAnnNotes,
  setCornerstoneAnnMeta,
  setCornerstoneAnnNotes,
  deleteCornerstoneAnnotationByUid,
  annotations,
  setSelectedAnnId,
  openBoxInViewer,
  setAnnotations,
  onixMessages,
  onixInput,
  setOnixInput,
  sendOnix,
  annSaveDialog,
  annDraftTitle,
  setAnnDraftTitle,
  annDraftComment,
  setAnnDraftComment,
  saveAnnotationDialog,
  closeAnnotationSaveDialog,
  dbAnnotations,
  setDbAnnotations,
}) {
  const recognitionRef = useRef(null);
  const activeMicTargetRef = useRef(null);
  const [activeMicTarget, setActiveMicTarget] = useState(null);
  const [micSupported, setMicSupported] = useState(true);
  const [editingDbAnnotationId, setEditingDbAnnotationId] = useState(null);
  const [editingDbAnnotationComment, setEditingDbAnnotationComment] = useState("");
  const [editingDbAnnotationSaving, setEditingDbAnnotationSaving] = useState(false);

  const manualClientIdMap = {
    "CASE-REAL-2001": "CLIENT-001",
    "CASE-REAL-2002": "CLIENT-004",
    "CASE-REAL-2003": "CLIENT-002",
    "CASE-REAL-2004": "CLIENT-006",
    "CASE-REAL-2005": "CLIENT-003",
    "CASE-REAL-2006": "CLIENT-005",
  };

  const resolvedClientId = clientId || manualClientIdMap[caseId] || "—";

  const appendTranscript = (prev, next) => {
    const a = (prev || "").trim();
    const b = (next || "").trim();
    if (!b) return prev;
    return a ? `${a} ${b}` : b;
  };

  const insertReportTranscript = (text) => {
    const root = reportEditorRef?.current;
    if (!root) return;
    const activeEl = document.activeElement;
    let target = null;

    if (activeEl && root.contains(activeEl) && activeEl.isContentEditable) {
      target = activeEl;
    } else {
      target = root.querySelector(
        '.report-answer.block[contenteditable="true"], .report-answer[contenteditable="true"]'
      );
    }
    if (!target) return;

    target.focus();
    try {
      document.execCommand("insertText", false, `${text.trim()} `);
    } catch {
      target.textContent = appendTranscript(target.textContent || "", text);
    }
  };

  const stopMic = () => {
    setActiveMicTarget(null);
    try {
      recognitionRef.current?.stop();
    } catch {}
  };

  const startMic = (target) => {
    const SpeechRecognitionCtor =
      typeof window !== "undefined" &&
      (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!SpeechRecognitionCtor) {
      setMicSupported(false);
      return;
    }
    setMicSupported(true);

    if (!recognitionRef.current) {
      const recognition = new SpeechRecognitionCtor();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = "en-US";
      recognition.onresult = (event) => {
        let finalText = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalText += result[0]?.transcript || "";
          }
        }
        if (!finalText.trim()) return;
        if (activeMicTargetRef.current === "chat") {
          setChatInput((prev) => appendTranscript(prev, finalText));
        } else if (activeMicTargetRef.current === "onix") {
          setOnixInput((prev) => appendTranscript(prev, finalText));
        } else if (activeMicTargetRef.current === "report") {
          insertReportTranscript(finalText);
        }
      };
      recognition.onerror = () => {
        setActiveMicTarget(null);
      };
      recognition.onend = () => {
        setActiveMicTarget((current) => (current ? null : current));
      };
      recognitionRef.current = recognition;
    }

    setActiveMicTarget(target);
    try {
      recognitionRef.current.start();
    } catch {}
  };

  const toggleMic = (target) => {
    if (activeMicTarget === target) {
      stopMic();
      return;
    }
    stopMic();
    startMic(target);
  };

  useEffect(() => {
    activeMicTargetRef.current = activeMicTarget;
  }, [activeMicTarget]);

  useEffect(() => {
    if (!activeMicTarget) return;
    if (activeMicTarget === "report" && !showReport) {
      stopMic();
      return;
    }
    if ((activeMicTarget === "chat" || activeMicTarget === "onix") && (rightTab !== "chat" && rightTab !== "onix")) {
      stopMic();
    }
  }, [rightTab, activeMicTarget, showReport]);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.abort();
      } catch {}
    };
  }, []);

  let safeCornerstoneItems = [];

  if (isCornerstone && typeof getCornerstoneAnnotationItems === "function") {
    try {
      const items = getCornerstoneAnnotationItems();
      safeCornerstoneItems = Array.isArray(items) ? items : [];
    } catch (e) {
      console.error("Failed to collect annotations", e);
      safeCornerstoneItems = [];
    }
  }
  
  // 🔥 NEW: build a set of saved annotation UIDs from DB
  const savedDbUids = new Set(
    (dbAnnotations || [])
      .map((a) => a.tool_data?.annotationUID)
      .filter(Boolean)
  );
  
  const filteredCornerstoneItems = safeCornerstoneItems
    // 🔥 hide ones already saved in DB
    .filter((a) => !savedDbUids.has(a.uid))
  
    // existing filter logic
    .filter((a) => !!cornerstoneAnnMeta?.[a.uid])
    .filter((a) => {
      const scope = cornerstoneAnnMeta?.[a.uid]?.scope || "me";
      if (annOwnerFilter === "mine") return scope === "me";
      if (annOwnerFilter === "others") return scope === "all";
      return true;
    });
  const itemByUid = new Map((safeCornerstoneItems || []).map((x) => [x.uid, x]));

  const getAuthUserId = () => {
    // prefer passed currentUserId; fallback to localStorage auth
    if (currentUserId) return currentUserId;
    try {
      const auth = JSON.parse(localStorage.getItem("auth") || "{}");
      return auth.userId || null;
    } catch {
      return null;
    }
  };

  const deleteChatMessage = async (chat) => {
    const chatId = chat?.chat_id;
    if (!chatId || String(chatId).startsWith("tmp_")) return;

    const ok = window.confirm("Delete this message?");
    if (!ok) return;

    const uid = getAuthUserId();
    if (!uid) return;

    // Optimistic remove: rely on polling reload in Dicomviewer

    try {
      const res = await fetch(
        `${BACKEND_URL}/radiology/chat/${encodeURIComponent(chatId)}?user_id=${encodeURIComponent(uid)}`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (!json?.success) {
        console.error("Delete chat failed", json);
        return;
      }
      // remove from UI list
      // (parent reload/poll will also refresh)
      // local remove:
      // NOTE: chatMessages is prop, so we can't set it directly; rely on polling reload in Dicomviewer.
    } catch (e) {
      console.error("Delete chat error", e);
    }
  };


  

  return (
    <>
      {!showReport && (
        <button
          onClick={() => setShowSidebar((v) => !v)}
          title={showSidebar ? "Hide Sidebar" : "Show Sidebar"}
          aria-label={showSidebar ? "Hide Sidebar" : "Show Sidebar"}
          style={{
            position: "absolute",
            top: "50%",
right: showSidebar ? 395 : 8,
            transform: "translateY(-50%)",
            zIndex: 20,
            width: 28,
            height: 44,
            borderRadius: 8,
            border: "1px solid #1f2937",
            background: "rgba(31,41,55,0.85)",
            color: "#d1d5db",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.3" />
            {showSidebar ? (
              <path d="M5.2 8h4.2M7.6 5.6L10 8l-2.4 2.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <path d="M10.8 8H6.6M8.4 5.6L6 8l2.4 2.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            )}
          </svg>
        </button>
      )}
      {(showReport || showSidebar) && (showReport ? (
        <div style={{ border: "1px solid #1d4ed8", borderRadius: 12, background: "#0b1a4b", color: "#e5e7eb", overflow: "hidden", display: "grid", gridTemplateRows: "auto auto 1fr" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 6, padding: "10px 12px", borderBottom: "1px solid #1f2937", background: "#2f2f2f" }}>
            <span style={{ fontSize: 16, color: "#e5e7eb", textAlign: "center", fontWeight: 600 }}>Generate Report</span>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <CButton color="light" size="sm" onClick={exportReportPdf}>
                Print Report
              </CButton>
              <CButton color="light" size="sm" onClick={downloadReportPdf}>
                Download Report
              </CButton>
              <CButton color="light" size="sm" onClick={() => setShowReport(false)}>
                Close
              </CButton>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: 6, borderBottom: "1px solid #b3b3b3", background: "#bfbfbf" }}>
            <button onClick={() => execCmd("undo")} style={{ background: "transparent", border: "none", fontSize: 12 }}>↶</button>
            <button onClick={() => execCmd("redo")} style={{ background: "transparent", border: "none", fontSize: 12 }}>↷</button>
            <div style={{ width: 1, height: 18, background: "#bdbdbd" }} />
            <button onClick={() => execCmd("bold")} style={{ background: "transparent", border: "none", fontWeight: "bold" }}>B</button>
            <button
              onClick={() => toggleMic("report")}
              disabled={!micSupported}
              title={!micSupported ? "Mic not supported in this browser" : activeMicTarget === "report" ? "Stop voice input" : "Start voice input"}
              style={{
                background: activeMicTarget === "report" ? "#991b1b" : "transparent",
                color: "#1f2937",
                border: "none",
                borderRadius: 4,
                width: 24,
                height: 24,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: micSupported ? 1 : 0.6,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <rect x="5.1" y="2.2" width="5.8" height="8.1" rx="2.9" stroke="currentColor" strokeWidth="1.2" />
                <path d="M3.5 7.8a4.5 4.5 0 0 0 9 0M8 12.3v2.2M5.9 14.5h4.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </button>
            <button onClick={() => execCmd("italic")} style={{ background: "transparent", border: "none", fontStyle: "italic" }}>I</button>
            <button onClick={() => execCmd("underline")} style={{ background: "transparent", border: "none", textDecoration: "underline" }}>U</button>
            <div style={{ width: 1, height: 18, background: "#bdbdbd" }} />
            <button onClick={() => execCmd("insertUnorderedList")} style={{ background: "transparent", border: "none" }} aria-label="Bulleted list" title="Bulleted list">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="3" cy="4" r="1" fill="#1f2937" />
                <circle cx="3" cy="8" r="1" fill="#1f2937" />
                <circle cx="3" cy="12" r="1" fill="#1f2937" />
                <path d="M6 4h8M6 8h8M6 12h8" stroke="#1f2937" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </button>
            <button onClick={() => execCmd("insertOrderedList")} style={{ background: "transparent", border: "none" }} aria-label="Numbered list" title="Numbered list">1.</button>
            <div style={{ width: 1, height: 18, background: "#bdbdbd" }} />
            <button onClick={() => execCmd("justifyLeft")} style={{ background: "transparent", border: "none" }} aria-label="Align left" title="Align left">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 4h10M3 8h7M3 12h10" stroke="#1f2937" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </button>
            <button onClick={() => execCmd("justifyCenter")} style={{ background: "transparent", border: "none" }} aria-label="Align center" title="Align center">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2.5 4h11M4.5 8h7M2.5 12h11" stroke="#1f2937" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </button>
            <button onClick={() => execCmd("justifyRight")} style={{ background: "transparent", border: "none" }} aria-label="Align right" title="Align right">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 4h10M6 8h7M3 12h10" stroke="#1f2937" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div style={{ padding: 10, overflow: "auto", background: "#ffffff", color: "#111827" }}>
            <div
              ref={reportEditorRef}
              style={{
                minHeight: "100%",
                outline: "none",
                whiteSpace: "normal",
                fontSize: 13,
                lineHeight: 1.5,
              }}
            />
          </div>
        </div>
      ) : (
        <div
            style={{
              width: 380, // change this to 380 or 400 if you want more
              minWidth: 380,
              border: "1px solid #2b2b2b",
              borderRadius: 12,
              background: "#0b0b0b",
              color: "#e5e7eb",
              overflow: "hidden",
              display: "grid",
              gridTemplateRows: "auto 1fr",
            }}
          >
          <div style={{ display: "flex", gap: 6, padding: 8, borderBottom: "1px solid #111827" }}>
            {["metadata", "chat", "annotations", "onix"].map((t) => {
              const isActive = rightTab === t;

              return (
                <button
                  key={t}
                  onClick={() => setRightTab(t)}
                  style={{
                    background: isActive ? "#1f2937" : "transparent",
                    color: "#e5e7eb",
                    border: "1px solid #111827",
                    borderRadius: 6,
                    padding: "6px 10px",
                    fontSize: 12,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontWeight: t === "onix" ? 600 : 500,
                  }}
                >
                  {t === "metadata" ? (
                    "Metadata"
                  ) : t === "chat" ? (
                    "Chat"
                  ) : t === "annotations" ? (
                    "Annotations"
                  ) : (
                    <>
                      <img
                        src={onixIcon}
                        alt="Onix"
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: 999,
                          objectFit: "contain",
                          display: "block",
                        }}
                      />
                      <span>Ask onix.ai</span>
                    </>
                  )}
                </button>
              );
            })}
          </div>

  

          <div style={{ padding: 10, overflow: "auto" }}>
            {rightTab === "metadata" && (
              <div style={{ border: "1px solid #1f2937", borderRadius: 8, overflow: "hidden", background: "#0b0f16" }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    padding: "10px 12px",
                    borderBottom: "1px solid #1f2937",
                    background: "#05070b",
                    fontWeight: 600,
                    fontSize: 13,
                    color: "#e5e7eb",
                  }}
                >
                  <div>Key</div>
                  <div>Value</div>
                </div>
                {/* ── Patient Info ── */}
                <div style={{ padding: "6px 12px", fontSize: 10, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", letterSpacing: "0.8px", background: "#05070b", borderBottom: "1px solid #1f2937" }}>
                  Patient Info
                </div>
                {[
                 
                  ["Case ID", caseId || "—"],
                  ["Age", patientAge ? `${patientAge}Y` : "—"],
                  ["Sex", patientSex === "M" ? "Male" : patientSex === "F" ? "Female" : patientSex || "—"],
                ].map(([k, v], idx) => (
                  <div key={k} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", padding: "8px 12px", borderBottom: "1px solid #1f2937", background: idx % 2 ? "#111827" : "#0b0f16", fontSize: 12, color: "#d1d5db" }}>
                    <div style={{ color: "#94a3b8" }}>{k}</div>
                    <div style={{ wordBreak: "break-word", fontWeight: 500 }}>{v}</div>
                  </div>
                ))}

                {/* ── Study Details ── */}
                <div style={{ padding: "6px 12px", fontSize: 10, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", letterSpacing: "0.8px", background: "#05070b", borderBottom: "1px solid #1f2937" }}>
                  Study Details
                </div>
                {[
                  ["Study", study || "—"],
                  ["Modality", caseModality || (isNifti ? "NIFTI" : "DICOM")],
                  ["File", filename || "—"],
                ].map(([k, v], idx) => (
                  <div key={k} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", padding: "8px 12px", borderBottom: "1px solid #1f2937", background: idx % 2 ? "#111827" : "#0b0f16", fontSize: 12, color: "#d1d5db" }}>
                    <div style={{ color: "#94a3b8" }}>{k}</div>
                    <div style={{ wordBreak: "break-word", fontWeight: 500 }}>{v}</div>
                  </div>
                ))}

                {/* ── Clinical Info ── */}
                <div style={{ padding: "6px 12px", fontSize: 10, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", letterSpacing: "0.8px", background: "#05070b", borderBottom: "1px solid #1f2937" }}>
                  Clinical Info
                </div>
                {[
  ["Client ID", resolvedClientId],
].map(([k, v], idx) => (
  <div
    key={k}
    style={{
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      padding: "8px 12px",
      borderBottom: "1px solid #1f2937",
      background: idx % 2 ? "#111827" : "#0b0f16",
      fontSize: 12,
      color: "#d1d5db"
    }}
  >
    <div style={{ color: "#94a3b8" }}>{k}</div>
    <div style={{ wordBreak: "break-word", fontWeight: 500 }}>{v}</div>
  </div>
))}

                {/* ── Case Status ── */}
                <div style={{ padding: "6px 12px", fontSize: 10, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", letterSpacing: "0.8px", background: "#05070b", borderBottom: "1px solid #1f2937" }}>
                  Case Status
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", padding: "8px 12px", borderBottom: "1px solid #1f2937", background: "#0b0f16", fontSize: 12, color: "#d1d5db" }}>
                  <div style={{ color: "#94a3b8" }}>Priority</div>
                  <div>
                    <span style={{
                      padding: "2px 8px",
                      borderRadius: 99,
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      background: priority === "stat" ? "rgba(239,68,68,0.15)" : priority === "urgent" ? "rgba(245,158,11,0.15)" : "rgba(100,116,139,0.15)",
                      color: priority === "stat" ? "#ef4444" : priority === "urgent" ? "#f59e0b" : "#94a3b8",
                    }}>
                      {priority || "—"}
                    </span>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", padding: "8px 12px", borderBottom: "1px solid #1f2937", background: "#111827", fontSize: 12, color: "#d1d5db" }}>
                  <div style={{ color: "#94a3b8" }}>Status</div>
                  <div>
                    <span style={{
                      padding: "2px 8px",
                      borderRadius: 99,
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "capitalize",
                      background: status === "completed" ? "rgba(34,197,94,0.15)" : status === "reading" ? "rgba(59,130,246,0.15)" : status === "pending" ? "rgba(245,158,11,0.15)" : "rgba(124,58,237,0.15)",
                      color: status === "completed" ? "#22c55e" : status === "reading" ? "#3b82f6" : status === "pending" ? "#f59e0b" : "#a78bfa",
                    }}>
                      {status === "reading" ? "In Review" : status || "—"}
                    </span>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", padding: "8px 12px", borderBottom: "1px solid #1f2937", background: "#0b0f16", fontSize: 12, color: "#d1d5db" }}>
                  <div style={{ color: "#94a3b8" }}>Wait Time</div>
                  <div style={{ fontWeight: 500 }}>{waitMins > 0 ? (waitMins < 60 ? `${waitMins}m` : `${Math.floor(waitMins / 60)}h ${waitMins % 60}m`) : "—"}</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", padding: "8px 12px", background: "#111827", fontSize: 12, color: "#d1d5db" }}>
                  <div style={{ color: "#94a3b8" }}>Deadline</div>
                  <div style={{ fontWeight: 500, color: priority === "stat" ? "#ef4444" : priority === "urgent" ? "#f59e0b" : "#d1d5db" }}>
                    {priority === "stat" ? "ASAP" : priority === "urgent" ? "Within 2 hrs" : "24 hrs"}
                  </div>
                </div>
              </div>
            )}

            
            {rightTab === "chat" && (
              <div style={{ display: "grid", gridTemplateRows: "1fr auto", gap: 8, height: "100%" }}>
                <div style={{ minHeight: 200, overflow: "auto" }}>
                  {(!chatMessages || chatMessages.length === 0) && (
                    <div style={{ fontSize: 12, color: "#6b7280" }}>Start a chat.</div>
                  )}

                  {(chatMessages || []).map((m, i) => {
                    if (m?.is_deleted) return null;

                    // ✅ supports both DB messages and old UI-only messages
                    const uid = m?.user_id || null;
                    const isMine =
                      uid && currentUserId ? String(uid) === String(currentUserId) : m?.role === "user";

                    const username = m?.username || "";
                    const text = m?.message ?? m?.text ?? "";
                    const time = m?.sent_at ? new Date(m.sent_at).toLocaleString() : "";

                    // ✅ only show delete on my saved messages
                    const canDelete =
                      isMine &&
                      m?.chat_id &&
                      !String(m.chat_id).startsWith("tmp_");

                    return (
                              <div
                              key={m?.chat_id || i}
                              style={{
                                marginBottom: 8,
                                textAlign: isMine ? "right" : "left",
                              }}
                            >
                              <div
                                style={{
                                  display: "inline-block",
                                  maxWidth: "86%",
                                  // ✅ extra top/right padding so the red X never overlaps the message
                                  padding: canDelete ? "22px 28px 7px 10px" : "7px 10px",
                                  borderRadius: 10,
                                  background: isMine ? "#1f2937" : "#111827",
                                  fontSize: 12,
                                  border: "1px solid #111827",
                                  position: "relative",
                                }}
                              >
                                {canDelete && (
                                        <button
                                          onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            deleteChatMessage(m);
                                          }}
                                          title="Delete message"
                                          style={{
                                            position: "absolute",
                                            top: 6,
                                            right: 8,
                                            background: "transparent",
                                            border: "none",
                                            padding: 0,
                                            cursor: "pointer",
                                            opacity: 0.6,
                                            transition: "opacity 0.2s ease",
                                          }}
                                          onMouseEnter={(e) => (e.currentTarget.style.opacity = 1)}
                                          onMouseLeave={(e) => (e.currentTarget.style.opacity = 0.6)}
                                        >
                                          <svg
                                            width="14"
                                            height="14"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="#ef4444"
                                            strokeWidth="2"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                          >
                                            <polyline points="3 6 5 6 21 6" />
                                            <path d="M19 6l-1 14H6L5 6" />
                                            <path d="M10 11v6M14 11v6" />
                                            <path d="M9 6V4h6v2" />
                                          </svg>
                                        </button>
                                      )}

                                {/* ✅ Show username only for OTHER users */}
                                {!isMine && m?.username && (
                                  <div
                                    style={{
                                      fontSize: 11,
                                      fontWeight: 600,
                                      marginBottom: 4,
                                      color: "#93c5fd",
                                    }}
                                  >
                                    {m.username}
                                  </div>
                                )}

                                <div style={{ whiteSpace: "pre-wrap" }}>{text}</div>

                                {time && (
                                  <div
                                    style={{
                                      marginTop: 4,
                                      fontSize: 10,
                                      color: "#9ca3af",
                                    }}
                                  >
                                    {time}
                                  </div>
                                )}
                              </div>
                            </div>

                    );
                  })}
                </div>

                <div style={{ display: "flex", gap: 6 }}>
                  <label
                    style={{
                      background: "#1f2937",
                      color: "#e5e7eb",
                      border: "1px solid #111827",
                      borderRadius: 6,
                      padding: "6px 8px",
                      cursor: "pointer",
                    }}
                    title="Upload file (UI only)"
                  >
                    +
                    <input type="file" style={{ display: "none" }} onChange={onChatFile} />
                  </label>

                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") sendChat();
                    }}
                    placeholder="Type message and press Enter"
                    style={{
                      flex: 1,
                      background: "#0f172a",
                      color: "#e5e7eb",
                      border: "1px solid #1f2937",
                      borderRadius: 6,
                      padding: 8,
                      fontSize: 12,
                    }}
                  />

                    <button
                      onClick={() => toggleMic("chat")}
                      disabled={!micSupported}
                      title={
                        !micSupported
                          ? "Mic not supported in this browser"
                          : activeMicTarget === "chat"
                            ? "Stop voice input"
                            : "Start voice input"
                      }
                      style={{
                        background: activeMicTarget === "chat" ? "#991b1b" : "#1f2937",
                        color: "#e5e7eb",
                        border: "1px solid #111827",
                        borderRadius: 6,
                        padding: "6px 10px",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: micSupported ? 1 : 0.6,
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <rect x="5.1" y="2.2" width="5.8" height="8.1" rx="2.9" stroke="currentColor" strokeWidth="1.2" />
                        <path
                          d="M3.5 7.8a4.5 4.5 0 0 0 9 0M8 12.3v2.2M5.9 14.5h4.2"
                          stroke="currentColor"
                          strokeWidth="1.2"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>


                  <button
                    onClick={sendChat}
                    style={{
                      background: "#1f2937",
                      color: "#e5e7eb",
                      border: "1px solid #111827",
                      borderRadius: 6,
                      padding: "6px 10px",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    title="Send"
                  >
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                      <path
                        d="M2.5 10.2L17.3 3.7c.5-.2 1 .3.8.8l-6.5 14.8c-.2.5-1 .4-1-.2l-1-6.4-6.4-1c-.6-.1-.7-.9-.2-1.5z"
                        fill="currentColor"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            )}


            {rightTab === "annotations" && (
              <div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                  {[
                    { id: "select", label: "Select" },
                    { id: "box", label: "Box" },
                    { id: "circle", label: "Circle" },
                    { id: "freehand", label: "Free" },
                    { id: "line", label: "Line" },
                    { id: "arrow", label: "Arrow" },
                  ].map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        if (typeof onAnnotationToolPick === "function") {
                          onAnnotationToolPick(t.id, isCornerstone);
                          return;
                        }
                        if (isCornerstone) {
                          activateCornerstoneAnnotationTool(t.id);
                          return;
                        }
                        setAnnTool(t.id);
                      }}
                      style={{
                        background: annTool === t.id ? "#1f2937" : "transparent",
                        color: "#e5e7eb",
                        border: "1px solid #111827",
                        borderRadius: 6,
                        padding: "4px 8px",
                        fontSize: 12
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 12, color: "#9ca3af" }}>Filter</span>
                  <div style={{ position: "relative" }}>
                    <button
                      onClick={() => setShowAnnFilterMenu((v) => !v)}
                      style={{
                        background: "#0f172a",
                        color: "#e5e7eb",
                        border: "1px solid #1f2937",
                        borderRadius: 6,
                        padding: "4px 8px",
                        fontSize: 12,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <span>
                        {annOwnerFilter === "all" ? "All" : annOwnerFilter === "mine" ? "User" : "Others"}
                      </span>
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                        <path d="M2 3l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    {showAnnFilterMenu && (
                      <div style={{ position: "absolute", top: 30, left: 0, minWidth: 120, background: "#0b0f16", border: "1px solid #1f2937", borderRadius: 6, overflow: "hidden", zIndex: 40 }}>
                        {[
                          { id: "all", label: "All", bg: "transparent", fg: "#e5e7eb", accent: "#e5e7eb" },
                          { id: "mine", label: "User", bg: "#0b2b63", fg: "#bfdbfe", accent: "#60a5fa" },
                          { id: "others", label: "Others", bg: "#4a3900", fg: "#fde68a", accent: "#facc15" },
                        ].map((f) => (
                          <button
                            key={f.id}
                            onClick={() => {
                              setAnnOwnerFilter(f.id);
                              setShowAnnFilterMenu(false);
                            }}
                            style={{
                              width: "100%",
                              textAlign: "left",
                              padding: "7px 10px",
                              border: "none",
                              borderBottom: "1px solid #1f2937",
                              background: annOwnerFilter === f.id ? f.bg : "transparent",
                              color: f.accent,
                              fontSize: 12,
                            }}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {isCornerstone ? (
                  <>
                    {filteredCornerstoneItems.length === 0 && (
                      <div style={{ fontSize: 12, color: "#6b7280" }}>Use tools to draw annotations. After drawing, save from popup to list here.</div>
                    )}
                    {Array.isArray(dbAnnotations) && dbAnnotations.length > 0 && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 6 }}>
                          Saved (from database)
                        </div>

                        {dbAnnotations
                          .filter((a) => {
                            if (annOwnerFilter === "mine") return a.visibility === "mine";
                            if (annOwnerFilter === "others") return a.visibility !== "mine";
                            return true;
                          })
                          .map((a) => {
                            const annUid = a?.tool_data?.annotationUID;
                            const meta = annUid ? itemByUid.get(annUid) : null;

                            const isOwner =
                              a?.user_id && currentUserId
                                ? String(a.user_id) === String(currentUserId)
                                : false;

                            const when = a?.created_at ? new Date(a.created_at).toLocaleString() : "";

                            const badgeText = a.visibility === "everybody" ? "Everybody" : "Mine";
                            const badgeBg = a.visibility === "everybody" ? "#3a2a00" : "#0b2b63";
                            const badgeFg = a.visibility === "everybody" ? "#facc15" : "#60a5fa";
                            const isEditing = editingDbAnnotationId === a.annotation_id;

                            return (
                              <div
                                key={a.annotation_id}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                
                                  const uid = a?.tool_data?.annotationUID;
                                  const slot = meta?.slot ?? 0;
                                  if (!uid) return;
                                
                                  // 🔥 VERY IMPORTANT FIX:
                                  // When rehydrating from DB, Cornerstone triggers "added" events.
                                  // We mark it as already saved BEFORE jump
                                  // so save popup does NOT open again.
                                
                                  try {
                                    const scope = a.visibility === "everybody" ? "all" : "me";
                                
                                    setCornerstoneAnnMeta?.((prev) => ({
                                      ...(prev || {}),
                                      [uid]: {
                                        title: (a.title || a.annotation_type || "annotation").trim(),
                                        comment: (a.comments || "").trim(),
                                        scope,
                                      },
                                    }));
                                
                                    setCornerstoneAnnNotes?.((prev) => ({
                                      ...(prev || {}),
                                      [uid]: (a.comments || "").trim(),
                                    }));
                                  } catch {}
                                
                                  // ✅ Now jump
                                  activateCornerstoneAnnotationTool("select"); // ✅ ADD THIS

                                  jumpToCornerstoneAnnotationByUid(uid, slot, a.tool_data);
                                }}
                                
                                style={{
                                  border: "1px solid #1f2937",
                                  borderRadius: 8,
                                  padding: 8,
                                  marginBottom: 8,
                                  background: "#0b0f16",
                                  cursor: annUid ? "pointer" : "default",
                                }}
                                title={annUid ? "Click to jump to annotation" : ""}
                              >
                                {/* ✅ Badge above title */}
                                <div style={{ marginBottom: 6 }}>
                                  <span
                                    style={{
                                      display: "inline-block",
                                      fontSize: 11,
                                      padding: "2px 8px",
                                      borderRadius: 999,
                                      border: "1px solid #1f2937",
                                      background: badgeBg,
                                      color: badgeFg,
                                      fontWeight: 700,
                                    }}
                                  >
                                    {badgeText}
                                  </span>
                                </div>

                                {/* Title row + actions */}
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                                  {/* ✅ Title (not a button) */}
                                  <div
                                    style={{
                                      fontSize: 12,
                                      fontWeight: 800,
                                      color: "#e5e7eb",
                                      textAlign: "left",
                                      lineHeight: 1.2,
                                    }}
                                  >
                                    {a.title || `${a.annotation_type}`}
                                  </div>

                                  {/* ✅ Owner actions */}
                                  {isOwner && (
                                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                      <button
                                        title="Click to edit the comments"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          setEditingDbAnnotationId(a.annotation_id);
                                          setEditingDbAnnotationComment(a.comments || "");
                                        }}
                                        style={{
                                          background: "transparent",
                                          color: "#93c5fd",
                                          border: "1px solid #1d4ed8",
                                          borderRadius: 6,
                                          padding: "2px 8px",
                                          fontSize: 11,
                                          cursor: "pointer",
                                        }}
                                      >
                                        Edit
                                      </button>
                                      <button
                                        title="Click to remove the annotation"
                                        onClick={async (e) => {
                                          e.preventDefault();
                                          e.stopPropagation(); // ✅ IMPORTANT: do not trigger jump

                                          try {
                                            // Local-only delete (no backend)
                                            setDbAnnotations((prev) =>
                                              (prev || []).filter((x) => x.annotation_id !== a.annotation_id)
                                            );

                                            if (annUid) {
                                              try {
                                                deleteCornerstoneAnnotationByUid?.(annUid, meta?.slot ?? 0);
                                              } catch (removeErr) {
                                                console.error("Delete linked cornerstone annotation failed", removeErr);
                                              }
                                            }

                                            if (editingDbAnnotationId === a.annotation_id) {
                                              setEditingDbAnnotationId(null);
                                              setEditingDbAnnotationComment("");
                                            }
                                          } catch (err) {
                                            console.error("Delete db annotation failed", err);
                                          }
                                        }}
                                        style={{
                                          background: "transparent",
                                          color: "#f87171",
                                          border: "1px solid #7f1d1d",
                                          borderRadius: 6,
                                          padding: "2px 8px",
                                          fontSize: 11,
                                          cursor: "pointer",
                                        }}
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  )}
                                </div>

                                {/* ✅ Dr. Username + time/date */}
                                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
                                  {(a.username || "Dr.")}{when ? ` · ${when}` : ""}
                                </div>

                                {/* type + visibility line */}
                                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
                                  type: {a.annotation_type} · visibility: {a.visibility}
                                  {meta?.plane ? ` · plane: ${meta.plane}` : ""}
                                  {Number.isInteger(meta?.slot) ? ` · slot: ${meta.slot + 1}` : ""}
                                </div>

                                {/* comment / edit comment */}
                                {isEditing ? (
                                  <div style={{ marginTop: 8 }}>
                                    <textarea
                                      value={editingDbAnnotationComment}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                      }}
                                      onChange={(e) => setEditingDbAnnotationComment(e.target.value)}
                                      placeholder="Edit comment..."
                                      style={{
                                        width: "100%",
                                        minHeight: 70,
                                        background: "#0f172a",
                                        color: "#e5e7eb",
                                        border: "1px solid #1f2937",
                                        borderRadius: 6,
                                        padding: 8,
                                        fontSize: 12,
                                        resize: "vertical",
                                      }}
                                    />
                                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 6 }}>
                                      <button
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          setEditingDbAnnotationId(null);
                                          setEditingDbAnnotationComment("");
                                        }}
                                        style={{
                                          background: "transparent",
                                          color: "#cbd5e1",
                                          border: "1px solid #334155",
                                          borderRadius: 6,
                                          padding: "2px 8px",
                                          fontSize: 11,
                                          cursor: "pointer",
                                        }}
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        disabled={editingDbAnnotationSaving}
                                        onClick={async (e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          if (!currentUserId) return;
                                          setEditingDbAnnotationSaving(true);
                                          try {
                                            // Local-only update (no backend)
                                            setDbAnnotations((prev) =>
                                              (prev || []).map((x) =>
                                                x.annotation_id === a.annotation_id
                                                  ? { ...x, comments: editingDbAnnotationComment }
                                                  : x
                                              )
                                            );
                                            setEditingDbAnnotationId(null);
                                            setEditingDbAnnotationComment("");
                                          } catch (err) {
                                            console.error("Update annotation failed", err);
                                          } finally {
                                            setEditingDbAnnotationSaving(false);
                                          }
                                        }}
                                        style={{
                                          background: "#1d4ed8",
                                          color: "#fff",
                                          border: "1px solid #1d4ed8",
                                          borderRadius: 6,
                                          padding: "2px 8px",
                                          fontSize: 11,
                                          cursor: "pointer",
                                          opacity: editingDbAnnotationSaving ? 0.7 : 1,
                                        }}
                                      >
                                        {editingDbAnnotationSaving ? "Saving..." : "Save"}
                                      </button>
                                    </div>
                                  </div>
                                ) : a.comments ? (
                                  <div
                                    style={{
                                      marginTop: 8,
                                      fontSize: 12,
                                      color: "#d1d5db",
                                      whiteSpace: "pre-wrap",
                                    }}
                                  >
                                    {a.comments}
                                  </div>
                                ) : (
                                  <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>—</div>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    )}


                    {filteredCornerstoneItems.map((a, idx) => (
                      <div key={a.uid} style={{ border: "1px solid #1f2937", borderRadius: 8, padding: 8, marginBottom: 8 }}>
                        <button
                          onClick={() => jumpToCornerstoneAnnotationByUid(a.uid, a.slot)}
                          style={{ background: "transparent", color: cornerstoneAnnMeta?.[a.uid]?.scope === "all" ? "#facc15" : "#60a5fa", border: "none", padding: 0, fontSize: 12, textAlign: "left", fontWeight: 600 }}
                        >
                          {(cornerstoneAnnMeta?.[a.uid]?.title || `${a.type} ${idx + 1}`)}
                        </button>
                        <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 6 }}>
                          plane: {a.plane} · slot: {a.slot + 1}
                        </div>
                        <textarea
                          value={cornerstoneAnnMeta?.[a.uid]?.comment ?? cornerstoneAnnNotes?.[a.uid] ?? ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCornerstoneAnnMeta((prev) => ({
                              ...prev,
                              [a.uid]: {
                                ...(prev[a.uid] || {}),
                                comment: val,
                              },
                            }));
                            setCornerstoneAnnNotes((prev) => ({ ...prev, [a.uid]: val }));
                          }}
                          placeholder="Write comment..."
                          style={{ width: "100%", minHeight: 60, background: "#0f172a", color: "#e5e7eb", border: "1px solid #1f2937", borderRadius: 6, padding: 6, fontSize: 12 }}
                        />
                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
                          <button
                            onClick={() => deleteCornerstoneAnnotationByUid(a.uid, a.slot)}
                            style={{ background: "transparent", color: "#f87171", border: "1px solid #7f1d1d", borderRadius: 6, padding: "2px 8px", fontSize: 11 }}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                ) : (
                  <>
                    {annotations.filter((a) => {
                      if (annOwnerFilter === "others") return false;
                      return true;
                    }).length === 0 && (
                      <div style={{ fontSize: 12, color: "#6b7280" }}>Use tools to draw annotations. Select to move/edit.</div>
                    )}
                    {annotations.filter((a) => {
                      if (annOwnerFilter === "others") return false;
                      return true;
                    }).map((a, idx) => (
                      <div key={a.id} style={{ border: "1px solid #1f2937", borderRadius: 8, padding: 8, marginBottom: 8 }}>
                        <button
                          onClick={() => { setSelectedAnnId(a.id); openBoxInViewer(a); }}
                          style={{ background: "transparent", color: "#60a5fa", border: "none", padding: 0, fontSize: 12, textAlign: "left" }}
                        >
                          {a.type} {idx + 1}
                        </button>
                        <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 6 }}>
                          plane: {a.plane} · slice: {a.slice}
                        </div>
                        <textarea
                          value={a.note}
                          onChange={(e) => {
                            const val = e.target.value;
                            setAnnotations((prev) => prev.map((x) => (x.id === a.id ? { ...x, note: val } : x)));
                          }}
                          placeholder="Write notes..."
                          style={{ width: "100%", minHeight: 60, background: "#0f172a", color: "#e5e7eb", border: "1px solid #1f2937", borderRadius: 6, padding: 6, fontSize: 12 }}
                        />
                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
                          <button
                            onClick={() => setAnnotations((arr) => arr.filter((x) => x.id !== a.id))}
                            style={{ background: "transparent", color: "#f87171", border: "1px solid #7f1d1d", borderRadius: 6, padding: "2px 8px", fontSize: 11 }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}

            {rightTab === "onix" && (
              <div style={{ display: "grid", gridTemplateRows: "1fr auto", gap: 8, height: "100%" }}>
                <div style={{ minHeight: 200 }}>
                  {onixMessages.map((m, i) => (
                    <div key={i} style={{ marginBottom: 6, textAlign: m.role === "user" ? "right" : "left" }}>
                      <span style={{ display: "inline-block", padding: "6px 8px", borderRadius: 8, background: m.role === "user" ? "#1f2937" : "#111827", fontSize: 12 }}>
                        {m.text}
                      </span>
                    </div>
                  ))}
                </div>
                  {/*    
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    value={onixInput}
                    onChange={(e) => setOnixInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") sendOnix(); }}
                    placeholder="Ask KVG Diagnostics (UI only)"
                    style={{ flex: 1, background: "#0f172a", color: "#e5e7eb", border: "1px solid #1f2937", borderRadius: 6, padding: 8, fontSize: 12 }}
                  />
                  <button
                    onClick={() => toggleMic("onix")}
                    disabled={!micSupported}
                    title={!micSupported ? "Mic not supported in this browser" : activeMicTarget === "onix" ? "Stop voice input" : "Start voice input"}
                    style={{
                      background: activeMicTarget === "onix" ? "#991b1b" : "#1f2937",
                      color: "#e5e7eb",
                      border: "1px solid #111827",
                      borderRadius: 6,
                      padding: "6px 10px",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      opacity: micSupported ? 1 : 0.6,
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <rect x="5.1" y="2.2" width="5.8" height="8.1" rx="2.9" stroke="currentColor" strokeWidth="1.2" />
                      <path d="M3.5 7.8a4.5 4.5 0 0 0 9 0M8 12.3v2.2M5.9 14.5h4.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                    </svg>
                  </button>
                  <button
                    onClick={sendOnix}
                    style={{ background: "#1f2937", color: "#e5e7eb", border: "1px solid #111827", borderRadius: 6, padding: "6px 10px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                    title="Send"
                  >
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                      <path d="M2.5 10.2L17.3 3.7c.5-.2 1 .3.8.8l-6.5 14.8c-.2.5-1 .4-1-.2l-1-6.4-6.4-1c-.6-.1-.7-.9-.2-1.5z" fill="currentColor" />
                    </svg>
                  </button>
                </div>
                */}
              </div>
            )}
          </div>
          {annSaveDialog.open && (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1200 }}>
              <div style={{ width: 420, maxWidth: "92vw", background: "#0b0f16", border: "1px solid #1f2937", borderRadius: 10, padding: 12, color: "#e5e7eb" }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Save Annotation</div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 8 }}>
                  type: {annSaveDialog.type || "annotation"} · plane: {annSaveDialog.plane} · slot: {annSaveDialog.slot + 1}
                </div>
                <input
                  value={annDraftTitle}
                  onChange={(e) => setAnnDraftTitle(e.target.value)}
                  placeholder="Title of the annotation"
                  style={{ width: "100%", background: "#0f172a", color: "#e5e7eb", border: "1px solid #1f2937", borderRadius: 6, padding: 8, fontSize: 12, marginBottom: 8 }}
                />
                <textarea
                  value={annDraftComment}
                  onChange={(e) => setAnnDraftComment(e.target.value)}
                  placeholder="Comments"
                  style={{ width: "100%", minHeight: 90, background: "#0f172a", color: "#e5e7eb", border: "1px solid #1f2937", borderRadius: 6, padding: 8, fontSize: 12, marginBottom: 10 }}
                />
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button
                    onClick={() => saveAnnotationDialog("me")}
                    style={{ background: "#1d4ed8", color: "#e5e7eb", border: "1px solid #1e40af", borderRadius: 6, padding: "6px 10px", fontSize: 12 }}
                  >
                    Save for me
                  </button>
                  <button
                    onClick={() => saveAnnotationDialog("all")}
                    style={{ background: "#a16207", color: "#fef3c7", border: "1px solid #92400e", borderRadius: 6, padding: "6px 10px", fontSize: 12 }}
                  >
                    Save for all
                  </button>
                  <button
                    onClick={() => {
                      if (annSaveDialog.uid) {
                        deleteCornerstoneAnnotationByUid(annSaveDialog.uid, annSaveDialog.slot);
                      }
                      closeAnnotationSaveDialog();
                    }}
                    style={{ background: "transparent", color: "#e5e7eb", border: "1px solid #374151", borderRadius: 6, padding: "6px 10px", fontSize: 12 }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </>
  );
}
