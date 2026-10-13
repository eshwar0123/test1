import React, { useEffect, useRef, useState } from "react";
import { CButton } from "@coreui/react";
import { BACKEND_URL } from "../utils/constants";


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
  onixLoading,
  onixStatusText,
  generateAIReport,
  generateMedGemmaVisionReport,
  stopAIReport,
  markAndAskActive,
  startMarkAndAsk,
  finishMarkAndAsk,
  cancelMarkAndAsk,
  annSaveDialog,
  annDraftTitle,
  setAnnDraftTitle,
  annDraftComment,
  setAnnDraftComment,
  saveAnnotationDialog,
  closeAnnotationSaveDialog,
  dbAnnotations,
  setDbAnnotations,
  onMedsamToggle,
  medsamActive,
  onMedsamGetMask,
  setOnixMessages,
  setOnixLoading,
  sidePanelWidth = 440,
  setSidePanelWidth,
}) {
  const resizingRef = useRef(false);
  useEffect(() => {
    const onMove = (e) => {
      if (!resizingRef.current || !setSidePanelWidth) return;
      const next = Math.min(Math.max(window.innerWidth - e.clientX - 10, 280), Math.min(900, window.innerWidth - 320));
      setSidePanelWidth(next);
    };
    const onUp = () => {
      if (!resizingRef.current) return;
      resizingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [setSidePanelWidth]);
  const startResize = () => {
    resizingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };
  const recognitionRef = useRef(null);
  const activeMicTargetRef = useRef(null);
  const onixChatBottomRef = useRef(null);
  const markAskPopupWrapRef = useRef(null);
  const dictatePopupWrapRef = useRef(null);
  const [activeMicTarget, setActiveMicTarget] = useState(null); // null | "chat" | "onix" | "report" | "dictate" | "aiReport"
  const [micSupported, setMicSupported] = useState(true);
  const [showOnixActions, setShowOnixActions] = useState(false);
  const [activeOnixActionCard, setActiveOnixActionCard] = useState(null); // null | "fullReport" | "markAsk" | "dictate" | "aiReport"
  const [showQuickAiConfirm, setShowQuickAiConfirm] = useState(false);
  const [hoverQuickAi, setHoverQuickAi] = useState(false);
  const [editingDbAnnotationId, setEditingDbAnnotationId] = useState(null);
  const [editingDbAnnotationComment, setEditingDbAnnotationComment] = useState("");
  const [editingDbAnnotationSaving, setEditingDbAnnotationSaving] = useState(false);
  const [showMarkAskPopup, setShowMarkAskPopup] = useState(false);
  const [showDictatePopup, setShowDictatePopup] = useState(false);
  const [dictateDraftText, setDictateDraftText] = useState("");
  const [aiReportDraftText, setAiReportDraftText] = useState("");

  // Simple inline markdown → JSX (bold, italic, headers, bullets)
  const renderMarkdown = (text) => {
    if (!text) return null;
    return text.split("\n").map((line, i) => {
      // H2 ##
      if (line.startsWith("## ")) return <div key={i} style={{ fontWeight: 700, fontSize: 12, color: "#93c5fd", marginTop: 8, marginBottom: 2 }}>{line.slice(3)}</div>;
      // H3 ###
      if (line.startsWith("### ")) return <div key={i} style={{ fontWeight: 600, fontSize: 11, color: "#7dd3fc", marginTop: 6, marginBottom: 1 }}>{line.slice(4)}</div>;
      // Bullet
      if (line.startsWith("- ") || line.startsWith("• ")) {
        return <div key={i} style={{ paddingLeft: 10, marginBottom: 1 }}>{"• " + line.slice(2)}</div>;
      }
      // Empty line → spacer
      if (line.trim() === "") return <div key={i} style={{ height: 4 }} />;
      // Inline bold **text**
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      return (
        <div key={i} style={{ marginBottom: 1 }}>
          {parts.map((p, j) =>
            p.startsWith("**") && p.endsWith("**")
              ? <strong key={j}>{p.slice(2, -2)}</strong>
              : p
          )}
        </div>
      );
    });
  };

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
        // } else if (activeMicTargetRef.current === "dictate") {
        //   setDictateDraftText((prev) => appendTranscript(prev, finalText));
        // } else if (activeMicTargetRef.current === "aiReport") {
        //   setAiReportDraftText((prev) => appendTranscript(prev, finalText));
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

  const handleDictateReport = async () => {
    if (!navigator.mediaDevices) { alert("Microphone not supported"); return; }
    setOnixLoading(true);
    setDictateDraftText("");
    setOnixMessages((m) => [...m, { role: "user", text: "Dictate a structured report (MedASR + MedGemma)" }]);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      const chunks = [];

      setOnixMessages((m) => [...m, { role: "ai", text: "Recording... Click the button again to stop." }]);

      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: "audio/webm" });
        const formData = new FormData();
        formData.append("audio", blob, "dictation.webm");
        if (patientName) formData.append("patient_name", patientName);
        if (caseModality) formData.append("modality", caseModality);
        if (study) formData.append("study", study);

        setOnixMessages((m) => [...m, { role: "ai", text: "Processing: MedASR transcribing → MedGemma formatting..." }]);

        try {
          const res = await fetch("/api/ai/stt-report", { method: "POST", body: formData });
          const data = await res.json();
          if (data.success) {
            let msg = "";
            if (data.transcription) {
              setDictateDraftText(data.transcription);
              msg += `**Transcription (MedASR):**\n${data.transcription}\n\n`;
            }
            if (data.report) msg += `**Structured Report (MedGemma):**\n${data.report}`;
            else msg += "MedGemma report generation failed. Use the transcription above.";
            setOnixMessages((m) => [...m, { role: "ai", text: msg }]);
          } else {
            setOnixMessages((m) => [...m, { role: "ai", text: "Report generation failed." }]);
          }
        } catch (err) {
          setOnixMessages((m) => [...m, { role: "ai", text: "Network error: " + err.message }]);
        }
        setOnixLoading(false);
      };

      mediaRecorder.start();

      // Auto-stop after 30 seconds, or click button to stop early
      const stopBtn = document.getElementById("dictate-stop-btn");
      if (stopBtn) stopBtn.onclick = () => mediaRecorder.stop();
      setTimeout(() => { if (mediaRecorder.state === "recording") mediaRecorder.stop(); }, 30000);
    } catch (err) {
      setOnixMessages((m) => [...m, { role: "ai", text: "Microphone error: " + err.message }]);
      setOnixLoading(false);
    }
  };

  // MedASR mic recording for dictation
  const dictateMicRef = useRef(null);
  const [dictateRecording, setDictateRecording] = useState(false);
  const [dictateMode, setDictateMode] = useState(null); // "report" or "analyses"

  const startDictateMic = async () => {
    if (dictateRecording) {
      // Stop recording
      if (dictateMicRef.current?.recorder?.state === "recording") {
        dictateMicRef.current.recorder.stop();
      }
      if (dictateMicRef.current?.recognition) {
        try { dictateMicRef.current.recognition.stop(); } catch {}
      }
      setDictateRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      let mime = "audio/webm";
      if (!MediaRecorder.isTypeSupported(mime)) mime = "audio/webm;codecs=opus";
      if (!MediaRecorder.isTypeSupported(mime)) mime = "";
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      const chunks = [];

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setDictateRecording(false);
        if (!chunks.length) return;
        const blob = new Blob(chunks, { type: mime || "audio/webm" });
        // Send to MedASR
        const fd = new FormData();
        fd.append("audio", blob, "dictation.webm");
        try {
          const res = await fetch("/api/ai/stt", { method: "POST", body: fd });
          const data = await res.json();
          if (data.success && data.text) {
            if (dictateMode === "report" || dictateMode === "dictate") {
              setDictateDraftText((prev) => prev ? prev + " " + data.text : data.text);
            } else {
              setAiReportDraftText((prev) => prev ? prev + " " + data.text : data.text);
            }
          }
        } catch {}
      };

      dictateMicRef.current = { recorder };
      setDictateRecording(true);
      recorder.start(1000);
      setTimeout(() => { if (recorder.state === "recording") recorder.stop(); }, 60000);
    } catch (err) {
      console.error("Mic error:", err);
      setDictateRecording(false);
    }
  };

  const handleGenerateReport = async () => {
    const text = dictateMode === "aiReport" ? aiReportDraftText : dictateDraftText;
    if (!text.trim()) { alert("No dictation text. Speak first."); return; }

    if (dictateMode === "aiReport") {
      // Full-slice MedGemma vision flow (frontend captures all visible slices).
      try {
        if (typeof generateMedGemmaVisionReport === "function") {
          await generateMedGemmaVisionReport({
            dictationText: text,
            skipUserMessage: false,
          });
        } else {
          setOnixMessages((m) => [...m, { role: "ai", text: "AI report generator is not available." }]);
        }
      } catch (err) {
        setOnixMessages((m) => [...m, { role: "ai", text: "Network error: " + err.message }]);
      }
      return;
    } else {
      if (typeof setOnixLoading === "function") setOnixLoading(true);
      if (typeof setOnixMessages === "function") {
        setOnixMessages((m) => [...m, { role: "user", text: text }]);
      }
      // Dictate + Report: text only → MedGemma report
      setOnixMessages((m) => [...m, { role: "ai", text: "Formatting with MedGemma..." }]);
      try {
        const res = await fetch("http://127.0.0.1:8000/ai/text-to-report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, patient_name: patientName || null, modality: caseModality || null, study: study || null }),
        });
        const data = await res.json();
        if (data.success) {
          setOnixMessages((m) => [...m, { role: "ai", text: `**Structured Report (MedGemma):**\n${data.report}` }]);
        } else {
          setOnixMessages((m) => [...m, { role: "ai", text: "Report generation failed." }]);
        }
      } catch (err) {
        setOnixMessages((m) => [...m, { role: "ai", text: "Network error: " + err.message }]);
      }
      if (typeof setOnixLoading === "function") setOnixLoading(false);
    }
  };

  const openOnixActionCard = (action) => {
    setActiveOnixActionCard(action);
    if (action === "fullReport") generateAIReport();
    if (action === "markAsk" && !markAndAskActive) startMarkAndAsk();
    if (action === "dictate") { setDictateMode("report"); setDictateDraftText(""); }
    if (action === "aiReport") { setDictateMode("aiReport"); setAiReportDraftText(""); }
  };

  const goBackToOnixActions = () => {
    if (activeOnixActionCard === "markAsk" && markAndAskActive) {
      cancelMarkAndAsk();
    }
    setActiveOnixActionCard(null);
  };

  const submitOnixPrompt = () => {
    if (markAndAskActive) finishMarkAndAsk();
    sendOnix();
  };

  const confirmQuickAiReport = () => {
    setShowQuickAiConfirm(false);
    setHoverQuickAi(false);
    openOnixActionCard("fullReport");
  };

  const handleOnixMicClick = () => {
    const target =
      activeOnixActionCard === "dictate"
        ? "dictate"
        : activeOnixActionCard === "aiReport"
          ? "aiReport"
          : "onix";
    toggleMic(target);
  };

  useEffect(() => {
    activeMicTargetRef.current = activeMicTarget;
  }, [activeMicTarget]);

  // Auto-scroll Onix AI chat to bottom whenever messages change
  useEffect(() => {
    if (onixChatBottomRef.current) {
      onixChatBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [onixMessages]);

  useEffect(() => {
    if (!activeMicTarget) return;
    if (activeMicTarget === "report" && !showReport) {
      stopMic();
      return;
    }
    if (activeMicTarget === "dictate" && (rightTab !== "onix" || activeOnixActionCard !== "dictate")) {
      stopMic();
      return;
    }
    if (activeMicTarget === "aiReport" && (rightTab !== "onix" || activeOnixActionCard !== "aiReport")) {
      stopMic();
      return;
    }
    if ((activeMicTarget === "chat" || activeMicTarget === "onix") && (rightTab !== "chat" && rightTab !== "onix")) {
      stopMic();
    }
  }, [rightTab, activeMicTarget, showReport, activeOnixActionCard]);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.abort();
      } catch {}
    };
  }, []);

  useEffect(() => {
    if (markAndAskActive) {
      setShowOnixActions(true);
      setActiveOnixActionCard("markAsk");
    }
  }, [markAndAskActive]);

  useEffect(() => {
    if (!showMarkAskPopup) return undefined;

    const handleOutsideClick = (event) => {
      if (markAskPopupWrapRef.current?.contains(event.target)) return;
      setShowMarkAskPopup(false);
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") setShowMarkAskPopup(false);
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("touchstart", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showMarkAskPopup]);

  useEffect(() => {
    if (!showDictatePopup) return undefined;

    const handleOutsideClick = (event) => {
      if (dictatePopupWrapRef.current?.contains(event.target)) return;
      setShowDictatePopup(false);
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") setShowDictatePopup(false);
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("touchstart", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showDictatePopup]);

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
      <style>{`
        .onix-scroll-dark {
          scrollbar-width: thin;
          scrollbar-color: #4b5563 #0b1018;
        }
        .onix-scroll-dark::-webkit-scrollbar {
          width: 10px;
          height: 10px;
        }
        .onix-scroll-dark::-webkit-scrollbar-track {
          background: #0b1018;
          border-radius: 999px;
        }
        .onix-scroll-dark::-webkit-scrollbar-thumb {
          background: #4b5563;
          border: 2px solid #0b1018;
          border-radius: 999px;
        }
        .onix-scroll-dark::-webkit-scrollbar-thumb:hover {
          background: #6b7280;
        }
        .onix-followup-input::placeholder {
          color: #8ea2bd;
          opacity: 1;
        }
        .radiology-app.dark .onix-followup-input {
          background: rgba(8, 20, 38, 0.88) !important;
          border: 1px solid rgba(82, 119, 163, 0.45) !important;
          color: #e6edf7 !important;
          border-radius: 10px;
          padding: 10px 12px !important;
          box-shadow: inset 0 1px 0 rgba(148, 163, 184, 0.08);
        }
        .radiology-app.dark .onix-followup-input:focus {
          border-color: rgba(56, 189, 248, 0.55) !important;
          box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.18);
        }
        .radiology-app.dark .onix-followup-input::placeholder {
          color: #9fb3d4 !important;
        }
      `}</style>
      {!showReport && showSidebar && setSidePanelWidth && (
        <div
          onMouseDown={(e) => { e.preventDefault(); startResize(); }}
          onDoubleClick={() => setSidePanelWidth(440)}
          title="Drag to resize"
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            right: sidePanelWidth + 5,
            width: 8,
            cursor: "col-resize",
            zIndex: 19,
            background: "transparent",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(59,130,246,0.25)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        />
      )}
      {!showReport && (
        <button
          onClick={() => setShowSidebar((v) => !v)}
          title={showSidebar ? "Hide Sidebar" : "Show Sidebar"}
          aria-label={showSidebar ? "Hide Sidebar" : "Show Sidebar"}
          style={{
            position: "absolute",
            top: "50%",
            right: showSidebar ? sidePanelWidth + 5 : 8,
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
        <div style={{ border: "1px solid #2b2b2b", borderRadius: 12, background: "#0b0b0b", color: "#e5e7eb", overflow: "hidden", display: "grid", gridTemplateRows: "auto 1fr" }}>
          <div style={{ display: "flex", gap: 6, padding: 8, borderBottom: "1px solid #111827" }}>
            {["metadata", "chat", "annotations", "onix"].map((t) => (
              <button
                key={t}
                onClick={() => setRightTab(t)}
                style={{
                  background: rightTab === t ? "#1f2937" : "transparent",
                  color: "#e5e7eb",
                  border: "1px solid #111827",
                  borderRadius: 6,
                  padding: "6px 8px",
                  fontSize: 12
                }}
              >
                {t === "metadata" ? "Metadata" : t === "chat" ? "Chat" : t === "annotations" ? "Annotations" : "onix.ai"}
              </button>
            ))}
          </div>

          <div style={{ padding: 10, overflow: rightTab === "onix" ? "hidden" : "auto", minHeight: 0 }}>
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
                  ["Patient Name", patientName || "—"],
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
                  ["Referred By", referredBy || "—"],
                  ["Location", caseLocation || "—"],
                ].map(([k, v], idx) => (
                  <div key={k} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", padding: "8px 12px", borderBottom: "1px solid #1f2937", background: idx % 2 ? "#111827" : "#0b0f16", fontSize: 12, color: "#d1d5db" }}>
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

                                {/* Ask Onix AI button */}
                                <button
                                  onClick={async (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();

                                    let imageUrl = null;
                                    let imageB64 = "";

                                    if (a.annotation_type === "segment" && typeof onMedsamGetMask === "function") {
                                      const mask = onMedsamGetMask();
                                      if (mask) { imageUrl = mask; imageB64 = mask.split(",")[1] || ""; }
                                    }

                                    if (!imageUrl) {
                                      const uid = a?.tool_data?.annotationUID;
                                      const slot = meta?.slot ?? 0;
                                      if (uid) jumpToCornerstoneAnnotationByUid(uid, slot, a.tool_data);
                                      await new Promise(r => setTimeout(r, 500));
                                      try {
                                        const canvas = document.querySelector("canvas");
                                        if (canvas) { imageUrl = canvas.toDataURL("image/png"); imageB64 = imageUrl.split(",")[1] || ""; }
                                      } catch {}
                                    }

                                    setRightTab("onix");
                                    const prompt = `Analyze this ${a.annotation_type || "annotated"} region.${a.title ? " Title: " + a.title + "." : ""} What do you observe?`;

                                    if (typeof setOnixMessages === "function") {
                                      setOnixMessages((m) => [...m, { role: "user", text: prompt, image: imageUrl }]);
                                    }
                                    if (typeof setOnixLoading === "function") setOnixLoading(true);
                                    try {
                                      const res = await fetch("http://127.0.0.1:8000/radiology/ai/analyze", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ image_base64: imageB64, prompt, model: "llava" }),
                                      });
                                      const data = await res.json();
                                      if (data.success) setOnixMessages((m) => [...m, { role: "ai", text: data.response }]);
                                      else setOnixMessages((m) => [...m, { role: "ai", text: "Analysis failed" }]);
                                    } catch (err) {
                                      setOnixMessages((m) => [...m, { role: "ai", text: "Network error: " + err.message }]);
                                    }
                                    if (typeof setOnixLoading === "function") setOnixLoading(false);
                                  }}
                                  style={{
                                    marginTop: 8, width: "100%",
                                    background: "#7c3aed", color: "#e5e7eb",
                                    border: "1px solid #6d28d9", borderRadius: 6,
                                    padding: "4px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer",
                                  }}
                                >
                                  Ask Onix AI
                                </button>
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
              <div style={{ display: "grid", gridTemplateRows: "1fr auto", gap: 8, height: "100%", minHeight: 0 }}>
                <div className="onix-scroll-dark" style={{ minHeight: 0, overflow: "auto" }}>
                  {onixMessages.map((m, i) => (
                    <div key={i} style={{ marginBottom: 8, textAlign: m.role === "user" ? "right" : "left" }}>
                      <span style={{
                        display: "inline-block",
                        maxWidth: "90%",
                        padding: "8px 10px",
                        borderRadius: 10,
                        background: m.role === "user" ? "#1f2937" : "#0d2137",
                        border: m.role === "ai" ? "1px solid #1e3a5f" : "1px solid #111827",
                        fontSize: 12,
                        lineHeight: 1.5,
                        textAlign: "left",
                      }}>
                        {m.role === "ai" && (
                          <span style={{ fontSize: 10, color: "#60a5fa", fontWeight: 600, display: "block", marginBottom: 4 }}>
                            Onix.AI
                          </span>
                        )}
                        {m.image && (
                          <img
                            src={m.image}
                            alt="Marked region"
                            style={{
                              maxWidth: "100%",
                              maxHeight: 180,
                              borderRadius: 6,
                              border: "1px solid #1e3a5f",
                              marginBottom: 6,
                              display: "block",
                            }}
                          />
                        )}
                        {m.role === "ai" ? renderMarkdown(m.text) : m.text}
                      </span>
                    </div>
                  ))}
                  {onixLoading && (
                    <div style={{ marginBottom: 8, textAlign: "left" }}>
                      <span style={{
                        display: "inline-block",
                        padding: "8px 14px",
                        borderRadius: 10,
                        background: "#0d2137",
                        border: "1px solid #1e3a5f",
                        fontSize: 12,
                        color: "#60a5fa",
                      }}>
                        <span style={{ fontSize: 10, fontWeight: 600, display: "block", marginBottom: 4 }}>Onix.AI</span>
                        {onixStatusText || "Estimating remaining time..."}
                      </span>
                      {!!onixStatusText && typeof stopAIReport === "function" && (
                        <div style={{ marginTop: 8 }}>
                          <button
                            onClick={stopAIReport}
                            style={{
                              background: "#7f1d1d",
                              border: "1px solid #991b1b",
                              color: "#fecaca",
                              borderRadius: 8,
                              padding: "6px 10px",
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            Stop
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  <div ref={onixChatBottomRef} />
                </div>

                <div
                  style={{
                    position: "relative",
                    border: "1px solid #1d2530",
                    background: "linear-gradient(180deg, #0f1319 0%, #11151b 100%)",
                    borderRadius: 24,
                    padding: "10px 12px 8px",
                    opacity: onixLoading ? 0.75 : 1,
                  }}
                >
                  {showOnixActions && activeOnixActionCard && (
                        <div style={{
                          border: "1px solid #1f2937",
                          borderRadius: 10,
                          background: "#081122",
                          padding: 10,
                          marginBottom: 8,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "#dbeafe" }}>
                              {activeOnixActionCard === "fullReport" && "Full Volume Report"}
                              {activeOnixActionCard === "markAsk" && "Mark & Ask"}
                              {activeOnixActionCard === "dictate" && "Dictate Report"}
                              {activeOnixActionCard === "aiReport" && "Natural Voice to Structured Report"}
                            </div>
                            <button
                              onClick={goBackToOnixActions}
                              style={{
                                background: "#0f172a",
                                color: "#cbd5e1",
                                border: "1px solid #334155",
                                borderRadius: 6,
                                padding: "4px 8px",
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              ← Back
                            </button>
                          </div>

                          {activeOnixActionCard === "markAsk" && (
                            <div style={{
                              background: "#0d3320",
                              border: "1px solid #065f34",
                              borderRadius: 6,
                              padding: "8px 10px",
                              fontSize: 11,
                              color: "#6ee7b7",
                              marginBottom: 8,
                              textAlign: "center",
                            }}>
                              Draw on the scan, then type your question below
                            </div>
                          )}

                          {activeOnixActionCard === "dictate" && (
                            <div style={{ marginBottom: 8, position: "relative" }}>
                              {dictateRecording && (
                                <div style={{ fontSize: 12, color: "#f87171", marginBottom: 6, fontWeight: 600 }}>
                                  Recording... (MedASR will transcribe after stop)
                                </div>
                              )}
                              <textarea
                                value={dictateDraftText}
                                onChange={(e) => setDictateDraftText(e.target.value)}
                                placeholder={dictateRecording ? "Listening..." : "Click mic to start dictation. Text appears here."}
                                rows={3}
                                style={{
                                  width: "100%",
                                  minHeight: 74,
                                  resize: "vertical",
                                  background: "#f3f4f6",
                                  color: "#111827",
                                  border: "1px solid #d1d5db",
                                  borderRadius: 12,
                                  padding: "10px 52px 10px 12px",
                                  fontSize: 12,
                                  lineHeight: 1.45,
                                }}
                              />
                              <button
                                onClick={startDictateMic}
                                disabled={onixLoading}
                                title={dictateRecording ? "Stop recording" : "Start MedASR recording"}
                                aria-label="Dictate mic"
                                style={{
                                  position: "absolute",
                                  right: 10,
                                  top: dictateRecording ? 32 : 10,
                                  width: 34,
                                  minWidth: 34,
                                  height: 34,
                                  borderRadius: 999,
                                  border: "none",
                                  background: dictateRecording ? "#ef4444" : "#e5e7eb",
                                  color: dictateRecording ? "#ffffff" : "#1f2937",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  cursor: onixLoading ? "not-allowed" : "pointer",
                                  opacity: onixLoading ? 0.6 : 1,
                                  boxShadow: dictateRecording ? "0 0 0 3px rgba(239,68,68,0.2)" : "inset 0 0 0 1px #d1d5db",
                                }}
                              >
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                                  <rect x="5.1" y="2.2" width="5.8" height="8.1" rx="2.9" stroke="currentColor" strokeWidth="1.2" />
                                  <path d="M3.5 7.8a4.5 4.5 0 0 0 9 0M8 12.3v2.2M5.9 14.5h4.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                                </svg>
                              </button>
                            </div>
                          )}

                          {activeOnixActionCard === "aiReport" && (
                            <div style={{ marginBottom: 8, position: "relative" }}>
                              {dictateRecording && (
                                <div style={{ fontSize: 12, color: "#f87171", marginBottom: 6, fontWeight: 600 }}>
                                  Recording... (MedASR will transcribe after stop)
                                </div>
                              )}
                              <textarea
                                value={aiReportDraftText}
                                onChange={(e) => setAiReportDraftText(e.target.value)}
                                placeholder={dictateRecording ? "Listening..." : "Click mic to start dictation. Text appears here."}
                                rows={3}
                                style={{
                                  width: "100%",
                                  minHeight: 74,
                                  resize: "vertical",
                                  background: "#f3f4f6",
                                  color: "#111827",
                                  border: "1px solid #d1d5db",
                                  borderRadius: 12,
                                  padding: "10px 52px 10px 12px",
                                  fontSize: 12,
                                  lineHeight: 1.45,
                                }}
                              />
                              <button
                                onClick={startDictateMic}
                                disabled={onixLoading}
                                title={dictateRecording ? "Stop recording" : "Start MedASR recording"}
                                aria-label="AI report mic"
                                style={{
                                  position: "absolute",
                                  right: 10,
                                  top: dictateRecording ? 32 : 10,
                                  width: 34,
                                  minWidth: 34,
                                  height: 34,
                                  borderRadius: 999,
                                  border: "none",
                                  background: dictateRecording ? "#ef4444" : "#e5e7eb",
                                  color: dictateRecording ? "#ffffff" : "#1f2937",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  cursor: onixLoading || !micSupported ? "not-allowed" : "pointer",
                                  opacity: onixLoading ? 0.6 : micSupported ? 1 : 0.6,
                                  boxShadow: activeMicTarget === "aiReport" ? "0 0 0 3px rgba(239,68,68,0.2)" : "inset 0 0 0 1px #d1d5db",
                                }}
                              >
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                                  <rect x="5.1" y="2.2" width="5.8" height="8.1" rx="2.9" stroke="currentColor" strokeWidth="1.2" />
                                  <path d="M3.5 7.8a4.5 4.5 0 0 0 9 0M8 12.3v2.2M5.9 14.5h4.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                                </svg>
                              </button>
                            </div>
                          )}

                          <div style={{ display: "flex", gap: 6 }}>
                            {activeOnixActionCard === "fullReport" && (
                              <button
                                onClick={generateAIReport}
                                disabled={onixLoading || markAndAskActive}
                                style={{
                                  flex: 1,
                                  background: onixLoading ? "#374151" : "#1d4ed8",
                                  color: "#e5e7eb",
                                  border: "1px solid #1e40af",
                                  borderRadius: 6,
                                  padding: "8px 6px",
                                  fontSize: 11,
                                  fontWeight: 600,
                                  cursor: onixLoading || markAndAskActive ? "not-allowed" : "pointer",
                                  opacity: onixLoading || markAndAskActive ? 0.6 : 1,
                                }}
                              >
                                {onixLoading ? (onixStatusText || "Estimating...") : "Generate Again"}
                              </button>
                            )}

                            {activeOnixActionCard === "markAsk" && (
                              <button
                                onClick={markAndAskActive ? cancelMarkAndAsk : startMarkAndAsk}
                                disabled={onixLoading}
                                style={{
                                  flex: 1,
                                  background: markAndAskActive ? "#991b1b" : "#0d6e3f",
                                  color: "#e5e7eb",
                                  border: markAndAskActive ? "1px solid #7f1d1d" : "1px solid #065f34",
                                  borderRadius: 6,
                                  padding: "8px 6px",
                                  fontSize: 11,
                                  fontWeight: 600,
                                  cursor: onixLoading ? "not-allowed" : "pointer",
                                  opacity: onixLoading ? 0.6 : 1,
                                }}
                              >
                                {markAndAskActive ? "Cancel Mark" : "Start Mark"}
                              </button>
                            )}

                            {activeOnixActionCard === "dictate" && (
                              <button
                                onClick={dictateDraftText.trim() ? handleGenerateReport : startDictateMic}
                                disabled={onixLoading}
                                style={{
                                  flex: 1,
                                  background: onixLoading ? "#374151" : dictateDraftText.trim() ? "#1d4ed8" : "#7c3aed",
                                  color: "#e5e7eb",
                                  border: dictateDraftText.trim() ? "1px solid #1e40af" : "1px solid #6d28d9",
                                  borderRadius: 6,
                                  padding: "8px 6px",
                                  fontSize: 11,
                                  fontWeight: 600,
                                  cursor: onixLoading ? "not-allowed" : "pointer",
                                  opacity: onixLoading ? 0.6 : 1,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  gap: 6,
                                }}
                              >
                                {onixLoading ? (onixStatusText || "Estimating...") : dictateDraftText.trim() ? "Generate Report" : "Dictate"}
                              </button>
                            )}

                            {activeOnixActionCard === "aiReport" && (
                              <button
                                onClick={aiReportDraftText.trim() ? handleGenerateReport : startDictateMic}
                                disabled={onixLoading}
                                style={{
                                  flex: 1,
                                  background: onixLoading ? "#374151" : "linear-gradient(135deg, #065f46 0%, #047857 100%)",
                                  color: "#e5e7eb",
                                  border: "1px solid #059669",
                                  borderRadius: 6,
                                  padding: "8px 6px",
                                  fontSize: 11,
                                  fontWeight: 600,
                                  cursor: onixLoading ? "not-allowed" : "pointer",
                                  opacity: onixLoading ? 0.6 : 1,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  gap: 5,
                                }}
                              >
                                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                                  <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2" />
                                  <path d="M5 8.5l2 2 4-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                                  <path d="M8 3v1.5M8 11.5V13M3 8h1.5M11.5 8H13" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
                                </svg>
                                {onixLoading ? (onixStatusText || "Estimating...") : "Generate Report"}
                              </button>
                            )}
                          </div>
                        </div>
                  )}
                  <div
                    style={{
                      position: "absolute",
                      left: 8,
                      right: 8,
                      bottom: "calc(100% + 10px)",
                      background: "#111827",
                      border: "1px solid #374151",
                      borderRadius: 10,
                      padding: "8px 10px",
                      zIndex: 35,
                      boxShadow: "0 6px 14px rgba(0,0,0,0.28)",
                      opacity: showQuickAiConfirm ? 1 : 0,
                      transform: showQuickAiConfirm ? "translateY(0)" : "translateY(8px)",
                      transition: "opacity 280ms ease, transform 360ms cubic-bezier(0.22, 1, 0.36, 1)",
                      pointerEvents: showQuickAiConfirm ? "auto" : "none",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#dbeafe", marginBottom: 2 }}>
                          AI Report
                        </div>
                        <div style={{ fontSize: 11, color: "#e5e7eb" }}>
                          Generate an AI report from the current study now?
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          onClick={confirmQuickAiReport}
                          style={{
                            minWidth: 66,
                            background: "#0b8a4b",
                            color: "#ecfeff",
                            border: "1px solid #0f9f59",
                            borderRadius: 6,
                            padding: "4px 10px",
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setShowQuickAiConfirm(false)}
                          style={{
                            minWidth: 66,
                            background: "#1f2937",
                            color: "#d1d5db",
                            border: "1px solid #374151",
                            borderRadius: 6,
                            padding: "4px 10px",
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          No
                        </button>
                      </div>
                    </div>
                  </div>

                  <textarea
                    className="onix-followup-input"
                    value={onixInput}
                    onChange={(e) => setOnixInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey && !onixLoading) {
                        e.preventDefault();
                        submitOnixPrompt();
                      }
                    }}
                    placeholder={markAndAskActive ? "Ask for follow-up on marked region..." : "Ask for follow-up changes"}
                    disabled={onixLoading}
                    rows={1}
                    style={{
                      width: "100%",
                      resize: "none",
                      background: "transparent",
                      color: "#e6edf7",
                      border: "none",
                      outline: "none",
                      fontSize: 15,
                      lineHeight: 1.35,
                      padding: "4px 6px 8px",
                      minHeight: 42,
                    }}
                  />

                  <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0, flex: 1, paddingBottom: 5 }}>
                      <div style={{ position: "relative", display: "inline-flex" }}>
                        {hoverQuickAi && !showQuickAiConfirm && (
                          <div
                            style={{
                              position: "absolute",
                              bottom: "calc(100% + 8px)",
                              left: "50%",
                              transform: "translateX(-50%)",
                              background: "#0f172a",
                              border: "1px solid #334155",
                              borderRadius: 6,
                              padding: "4px 7px",
                              fontSize: 10,
                              color: "#e2e8f0",
                              whiteSpace: "nowrap",
                              zIndex: 25,
                            }}
                          >
                            AI Report
                          </div>
                        )}

                        <button
                          onClick={() => setShowQuickAiConfirm((prev) => !prev)}
                          onMouseEnter={() => setHoverQuickAi(true)}
                          onMouseLeave={() => setHoverQuickAi(false)}
                          disabled={onixLoading}
                          title="AI Report"
                          style={{
                            width: 38,
                            height: 38,
                            borderRadius: 999,
                            border: "1px solid rgba(56,189,248,0.35)",
                            background: "rgba(15,23,42,0.6)",
                            color: "#38bdf8",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: onixLoading ? "not-allowed" : "pointer",
                            opacity: onixLoading ? 0.5 : 1,
                          }}
                        >
                          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2" />
                            <path d="M5 8.5l2 2 4-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M8 3v1.5M8 11.5V13M3 8h1.5M11.5 8H13" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
                          </svg>
                        </button>
                      </div>

                      <div ref={markAskPopupWrapRef} style={{ position: "relative", display: "inline-flex" }}>
                        <button
                          onClick={() => {
                            setShowDictatePopup(false);
                            setShowMarkAskPopup((prev) => !prev);
                          }}
                          disabled={onixLoading}
                          title="Mark and Ask"
                          style={{
                            width: 38,
                            height: 38,
                            borderRadius: 999,
                            border: "1px solid rgba(56,189,248,0.35)",
                            background: "rgba(15,23,42,0.6)",
                            color: showMarkAskPopup ? "#34d399" : "#38bdf8",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: onixLoading ? "not-allowed" : "pointer",
                            opacity: onixLoading ? 0.5 : 1,
                          }}
                        >
                          {/* Pen icon */}
                          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                            <path d="M14.85 2.85a2.1 2.1 0 0 1 2.97 2.97L6.44 17.2l-4.1 1.13 1.13-4.1L14.85 2.85Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M12.5 5.2l2.3 2.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          </svg>
                        </button>

                        {showMarkAskPopup && (
                          <div
                            style={{
                              position: "absolute",
                              bottom: "calc(100% + 12px)",
                              left: 0,
                              background: "#0f172a",
                              border: "1px solid #334155",
                              borderRadius: 12,
                              padding: 8,
                              zIndex: 60,
                              boxShadow: "0 16px 28px rgba(2, 6, 23, 0.55)",
                              minWidth: 220,
                              maxWidth: "min(250px, calc(100vw - 40px))",
                              overflow: "hidden",
                            }}
                          >
                            <div style={{ padding: "4px 10px 8px", fontSize: 12, fontWeight: 700, color: "#dbeafe" }}>
                              Mark and Ask
                            </div>
                            <button
                              onClick={() => {
                                setShowMarkAskPopup(false);
                                if (typeof onMedsamToggle === "function") onMedsamToggle();
                              }}
                              style={{
                                width: "100%",
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                background: "transparent",
                                color: "#e5e7eb",
                                border: "none",
                                borderRadius: 8,
                                padding: "10px 12px",
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: "pointer",
                                textAlign: "left",
                                whiteSpace: "nowrap",
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = "#1f2937")}
                              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                            >
                              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
                                <rect x="2" y="2" width="16" height="16" rx="3" stroke="#34d399" strokeWidth="1.3" />
                                <path d="M6 10h8M10 6v8" stroke="#34d399" strokeWidth="1.4" strokeLinecap="round" />
                              </svg>
                              Mark with Segmentation
                            </button>
                            <div style={{ height: 1, background: "#1f2937", margin: "4px 8px" }} />
                            <button
                              onClick={() => {
                                setShowMarkAskPopup(false);
                                if (!markAndAskActive) startMarkAndAsk();
                                setShowOnixActions(true);
                                setActiveOnixActionCard("markAsk");
                              }}
                              style={{
                                width: "100%",
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                background: "transparent",
                                color: "#e5e7eb",
                                border: "none",
                                borderRadius: 8,
                                padding: "10px 12px",
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: "pointer",
                                textAlign: "left",
                                whiteSpace: "nowrap",
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = "#1f2937")}
                              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                            >
                              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
                                <path d="M14.85 2.85a2.1 2.1 0 0 1 2.97 2.97L6.44 17.2l-4.1 1.13 1.13-4.1L14.85 2.85Z" stroke="#60a5fa" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                                <circle cx="16" cy="16" r="3.5" fill="#111827" stroke="#60a5fa" strokeWidth="1.2" />
                                <path d="M15 15.5h2M14.8 17a1.2 1.2 0 0 0 2.4 0" stroke="#60a5fa" strokeWidth="1" strokeLinecap="round" />
                              </svg>
                              Mark and Ask
                            </button>
                          </div>
                        )}
                      </div>

                      <div ref={dictatePopupWrapRef} style={{ position: "relative", display: "inline-flex" }}>
                        <button
                          onClick={() => {
                            setShowMarkAskPopup(false);
                            setShowDictatePopup(false);
                            setShowOnixActions(true);
                            openOnixActionCard("aiReport");
                          }}
                          disabled={onixLoading}
                          title="Dictate Report"
                          aria-label="Dictate Report"
                          style={{
                            width: 38,
                            height: 38,
                            borderRadius: 999,
                            border: "1px solid rgba(56,189,248,0.35)",
                            background: "rgba(15,23,42,0.6)",
                            color: "#38bdf8",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: onixLoading ? "not-allowed" : "pointer",
                            opacity: onixLoading ? 0.5 : 1,
                          }}
                        >
                          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                            <path d="M3 8v4M6 6v8M9 4v12M12 7v6M15 9v2M18 8v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                          </svg>
                        </button>
                      </div>

                    </div>

                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      <button
                        onClick={() => {
                          setShowMarkAskPopup(false);
                          setShowDictatePopup(false);
                          handleOnixMicClick();
                        }}
                        disabled={onixLoading || !micSupported}
                        title={
                          !micSupported
                            ? "Mic not supported in this browser"
                            : activeMicTarget === (
                              activeOnixActionCard === "dictate"
                                ? "dictate"
                                : activeOnixActionCard === "aiReport"
                                  ? "aiReport"
                                  : "onix"
                            )
                              ? "Stop mic"
                              : "Start mic"
                        }
                        aria-label="Mic"
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 999,
                          border: activeMicTarget === (
                            activeOnixActionCard === "dictate"
                              ? "dictate"
                              : activeOnixActionCard === "aiReport"
                                ? "aiReport"
                                : "onix"
                          ) ? "1px solid #ef4444" : "1px solid #334155",
                          background: activeMicTarget === (
                            activeOnixActionCard === "dictate"
                              ? "dictate"
                              : activeOnixActionCard === "aiReport"
                                ? "aiReport"
                                : "onix"
                          ) ? "#b91c1c" : (onixLoading ? "#334155" : "#0f172a"),
                          color: activeMicTarget === (
                            activeOnixActionCard === "dictate"
                              ? "dictate"
                              : activeOnixActionCard === "aiReport"
                                ? "aiReport"
                                : "onix"
                          ) ? "#fee2e2" : "#dbeafe",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: onixLoading || !micSupported ? "not-allowed" : "pointer",
                          opacity: onixLoading ? 0.5 : micSupported ? 1 : 0.6,
                          flexShrink: 0,
                          boxShadow: activeMicTarget === (
                            activeOnixActionCard === "dictate"
                              ? "dictate"
                              : activeOnixActionCard === "aiReport"
                                ? "aiReport"
                                : "onix"
                          ) ? "0 0 0 3px rgba(239,68,68,0.2)" : "inset 0 0 0 1px rgba(56,189,248,0.08)",
                        }}
                      >
                        <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                          <rect x="5.1" y="2.2" width="5.8" height="8.1" rx="2.9" stroke="currentColor" strokeWidth="1.4" />
                          <path d="M3.5 7.8a4.5 4.5 0 0 0 9 0M8 12.3v2.2M5.9 14.5h4.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                        </svg>
                      </button>

                      <button
                        onClick={submitOnixPrompt}
                        disabled={onixLoading}
                        title={markAndAskActive ? "Send question about marked region" : "Send"}
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 999,
                          border: "1px solid #334155",
                          background: onixLoading ? "#334155" : "#0f172a",
                          color: "#dbeafe",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: onixLoading ? "not-allowed" : "pointer",
                          flexShrink: 0,
                          boxShadow: "inset 0 0 0 1px rgba(56,189,248,0.08)",
                        }}
                      >
                        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                          <path d="M10 16V4M10 4 5 9M10 4l5 5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
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

