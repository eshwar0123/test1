import React, { useEffect, useRef, useState } from "react";
import { CButton } from "@coreui/react";
import { BACKEND_URL } from "../utils/constants";
import onixIcon from "/icon.png";
import ReportRewriteOverlay from "./ReportRewriteOverlay";
import useReportGhostAutocomplete from "../hooks/useReportGhostAutocomplete";
import { regionFromStudy } from "../utils/radiologyPhrases";
import { readReportFileToText } from "../utils/reportFileReader";
import { GiBrain, GiKneeCap, GiLeg, GiLungs, GiHeartOrgan, GiRibcage, GiStethoscope } from "react-icons/gi";
import spineImg from "./tpl-icons/spine.png";
import shoulderImg from "./tpl-icons/shoulder.png";
import mammographyImg from "./tpl-icons/mammography.png";
import neckRaw from "./tpl-icons/neck.svg?raw";
import abdomenRaw from "./tpl-icons/abdomen.svg?raw";
import pelvisRaw from "./tpl-icons/pelvis.svg?raw";

// Report-template icons (all rendered purple to match):
//  - Game Icons for most categories
//  - custom PNGs (spine, shoulder) tinted via CSS mask (uses their alpha)
//  - custom SVGs (neck, pelvis, abdomen) injected inline + recolored
//    (Vite inlines small SVGs as data-URIs which don't mask correctly).
const _ri = (Comp) => () => <Comp size={26} />;
// Transparent PNG tinted to theme purple via CSS mask (uses the PNG alpha).
const _mask = (src) => () => (
  <span
    style={{
      display: "inline-block",
      width: 26,
      height: 26,
      backgroundColor: "#1c4e80",
      WebkitMask: `url(${src}) no-repeat center / contain`,
      mask: `url(${src}) no-repeat center / contain`,
    }}
  />
);
// Inline raw SVG markup, recolored to purple (fill/stroke -> currentColor) and
// sized to 20px. Done once when the entry is created.
const _svg = (raw) => {
  const html = raw
    .replace(/<\?xml[^>]*\?>/i, "")
    .replace(/<!DOCTYPE[^>]*>/i, "")
    .replace(/#000000/gi, "currentColor")
    .replace(/width="800px"/i, 'width="20"')
    .replace(/height="800px"/i, 'height="20"');
  return () => (
    <span
      style={{ color: "#1c4e80", display: "inline-flex", width: 26, height: 26 }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
const TPL_ICON = {
  brain: _ri(GiBrain),       // brain, CT head
  spine: _mask(spineImg),    // spine (png, masked purple)
  neck: _svg(neckRaw),       // neck (inline svg, purple)
  bone: _svg(pelvisRaw),     // pelvis, hip (inline svg, purple)
  knee: _ri(GiKneeCap),      // knee
  leg: _ri(GiLeg),           // leg
  shoulder: _mask(shoulderImg), // shoulder (png, masked purple)
  lungs: _ri(GiLungs),       // chest
  heart: _ri(GiHeartOrgan),  // cardiac
  abdomen: _svg(abdomenRaw), // abdomen (inline svg, purple)
  breast: _mask(mammographyImg), // breast, mammography (custom png)
  scan: _ri(GiStethoscope),  // general report
};


function ReportEditAiBar({ editReportWithCommand, phase, setPhase, setCurrentInstruction }) {
  const [command, setCommand] = useState("");
  const [status, setStatus] = useState(null); // { type: 'ok'|'err', text }
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);
  const abortControllerRef = useRef(null);
  const isMountedRef = useRef(true);

  // The button/input is "busy" whenever the overlay is mid-animation.
  const busy = phase !== "idle";

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Web Speech API support detection (Chrome/Edge — Firefox not supported)
  const SpeechRecognition =
    typeof window !== "undefined" &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);
  const micSupported = !!SpeechRecognition;

  const apply = async () => {
    if (!command.trim() || busy) return;
    const cmd = command.trim();
    if (typeof setCurrentInstruction === "function") setCurrentInstruction(cmd);

    // DEBUG: "/preview" steps through both overlay phases (thinking → revealing)
    // without calling Claude. Lets you preview the animation for free.
    if (cmd.toLowerCase() === "/preview") {
      setStatus(null);
      setCommand("");
      setPhase("thinking");
      // After 4s of thinking, kick off the reveal phase. The overlay's
      // onRevealComplete will flip back to 'idle' when its animation ends.
      setTimeout(() => setPhase("revealing"), 4000);
      setStatus({ type: "ok", text: "Preview only — no API call was made." });
      return;
    }

    setStatus(null);
    setPhase("thinking");

    abortControllerRef.current = new AbortController();

    try {
      const result = await editReportWithCommand(cmd, abortControllerRef.current.signal);

      console.log("[apply] DEBUG after await", {
        isMounted: isMountedRef.current,
        aborted: abortControllerRef.current?.signal?.aborted,
        resultOk: result?.ok,
        result,
      });

      if (!isMountedRef.current || abortControllerRef.current.signal.aborted) {
        console.log("[apply] DEBUG bailing early — isMounted/aborted guard");
        return;
      }

      if (result?.ok) {
        // Editor DOM has been updated by the hook. Now play the reveal beam,
        // which uncovers the new content as it descends.
        console.log("[apply] DEBUG setPhase(revealing)");
        setPhase("revealing");
        setCommand("");
        if (result.warning) {
          setStatus({ type: "ok", text: result.warning });
        }
      } else {
        setPhase("idle");
        setStatus({
          type: "err",
          text: result?.error || `Edit failed (${result?.reason || "unknown"})`,
        });
      }
    } catch (e) {
      console.log("[apply] DEBUG catch", e);
      if (isMountedRef.current && !abortControllerRef.current?.signal.aborted) {
        setPhase("idle");
        setStatus({ type: "err", text: e?.message || "Network error" });
      }
    }
  };

  const startMic = () => {
    if (!micSupported || listening || busy) return;
    const rec = new SpeechRecognition();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    rec.onresult = (event) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setCommand(transcript);
    };
    rec.onerror = (event) => {
      console.warn("[mic] error:", event.error);
      setStatus({ type: "err", text: `Mic error: ${event.error}` });
      setListening(false);
    };
    rec.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  };

  const stopMic = () => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
  };

  return (
    <div
      style={{
        marginTop: 16,
        padding: 12,
        borderRadius: 10,
        border: "1px solid #1e3a8a",
        background: "linear-gradient(135deg, #0b1a4b 0%, #1e3a8a 100%)",
        position: "sticky",
        bottom: 0,
        boxShadow: "0 6px 18px rgba(11,26,75,0.18)",
      }}
    >
      <style>{`
        @keyframes onixMicPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.55); }
          50%      { box-shadow: 0 0 0 8px rgba(239,68,68,0);    }
        }
        @keyframes tplSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "#bfdbfe",
          marginBottom: 8,
          letterSpacing: 0.6,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <img src={onixIcon} alt="" style={{ height: 14, width: "auto" }} />
        {phase === "idle" ? "ONIX AI EDITOR — TELL IT WHAT TO CHANGE" : `ONIX AI EDITOR — ${command}`}
      </div>

      {phase !== "idle" ? (
        <div style={{
          position: "relative",
          height: 56,
          borderRadius: 8,
          overflow: "hidden",
          background: "rgba(5,9,18,0.95)",
          border: "1px solid rgba(125,235,225,0.18)",
        }}>
          <ReportRewriteOverlay
            phase={phase}
            instruction={command}
            onRevealComplete={() => setPhase("idle")}
          />
          <button
            onClick={() => {
              if (abortControllerRef.current) abortControllerRef.current.abort();
              setPhase("idle");
              setCommand("");
              setStatus(null);
            }}
            title="Stop generation"
            aria-label="Stop generation"
            style={{
              position: "absolute",
              right: 8,
              top: "50%",
              transform: "translateY(-50%)",
              width: 30,
              height: 30,
              borderRadius: 8,
              border: "1px solid rgba(125,235,225,0.4)",
              background: "rgba(5,9,18,0.85)",
              color: "rgba(160,250,240,0.95)",
              cursor: "pointer",
              zIndex: 60,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "auto",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
              <path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 6 }}>
          <div style={{ flex: 1, position: "relative" }}>
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !busy) apply(); }}
              placeholder={listening ? "Listening… speak now" : 'e.g. "convert findings to bullets" or "make impression concise"'}
              disabled={busy}
              style={{
                width: "100%",
                boxSizing: "border-box",
                border: "1px solid rgba(96,165,250,0.4)",
                borderRadius: 8,
                padding: micSupported ? "9px 38px 9px 12px" : "9px 12px",
                fontSize: 13,
                background: "rgba(255,255,255,0.96)",
                color: "#0f172a",
                outline: "none",
              }}
            />
            {micSupported && (
              <button
                onClick={listening ? stopMic : startMic}
                disabled={busy}
                title={listening ? "Stop listening" : "Speak your instruction"}
                aria-label={listening ? "Stop voice input" : "Start voice input"}
                style={{
                  position: "absolute",
                  right: 6,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 26,
                  height: 26,
                  borderRadius: 4,
                  border: "none",
                  cursor: busy ? "not-allowed" : "pointer",
                  background: listening ? "#ef4444" : "transparent",
                  color: listening ? "#fff" : "#6b7280",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  animation: listening ? "onixMicPulse 1.2s ease-in-out infinite" : "none",
                  flexShrink: 0,
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/>
                  <path d="M19 11a7 7 0 0 1-14 0H3a9 9 0 0 0 8 8.94V22h2v-2.06A9 9 0 0 0 21 11h-2z"/>
                </svg>
              </button>
            )}
          </div>

          <button
            onClick={apply}
            disabled={busy || !command.trim()}
            title="Apply"
            aria-label="Apply"
            style={{
              width: 38,
              height: 38,
              borderRadius: 8,
              border: "none",
              cursor: busy || !command.trim() ? "not-allowed" : "pointer",
              background: busy || !command.trim() ? "rgba(255,255,255,0.18)" : "#3b82f6",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {busy ? (
              <span style={{ fontSize: 16, fontWeight: 700 }}>…</span>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M2 21L23 12 2 3v7l15 2-15 2v7z"/>
              </svg>
            )}
          </button>
        </div>
      )}

      {status && (
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            fontWeight: 500,
            color: status.type === "ok" ? "#86efac" : "#fca5a5",
          }}
        >
          {status.text}
        </div>
      )}
    </div>
  );
}


export default function ViewerSidePanel({
  showReport,
  showSidebar,
  setShowSidebar,
  setShowReport,
  exportReportPdf,
  downloadReportPdf,
  saveReportToDb,
  setLatestReportVersionHtml,
  reportData,
  submitReport,
  qcStage = "idle",
  pdfPreviewUrl,
  qcResult,
  markComplete,
  cancelQcPreview,
  editReportWithCommand,
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
  waitMins,
  history,
  currentUserId,
  onRequestFullscreen,
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
  reportExists,
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
  backendUrl,
  reportUnsavedRef,
  reportSaveFnRef,
  reportViewerCollapsed = false,
  setReportViewerCollapsed,
}) {
  // 'idle' | 'thinking' | 'revealing' | 'done' — drives ReportRewriteOverlay.
  // 'thinking' = particles + rings + status rotation while Claude is processing
  // 'revealing' = beam descends, uncovers the (already-updated) editor content
  const [editPhase, setEditPhase] = useState("idle");
  const [editInstruction, setEditInstruction] = useState("");
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
  // Tracks the last contenteditable inside the report editor that held the
  // caret, plus its selection range. Used to route dictated text back to the
  // field the user was actually editing when they clicked the mic button —
  // otherwise focus has already moved off the contenteditable by the time the
  // transcript arrives.
  const lastReportFocusRef = useRef(null);
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
  const [loadingPhraseIndex, setLoadingPhraseIndex] = useState(0);
  const loadingPhrases = ["Thinking..."];

  const [reportHistory, setReportHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  // ---- Custom templates: paste a report or upload a file (docx/pdf/img) and
  // keep only the structure (header labels, known section headings, footer),
  // stripping the filled-in content. Result fills the editor AND is saved. ----
  const [pasteTplStep, setPasteTplStep] = useState(null); // null | 'loading' | 'review'
  const [pasteTplName, setPasteTplName] = useState("");
  const [pasteTplStudyTitle, setPasteTplStudyTitle] = useState("");
  const [pasteTplHeaderFields, setPasteTplHeaderFields] = useState([]);
  const [pasteTplSections, setPasteTplSections] = useState([]);
  const [pasteTplEditIdx, setPasteTplEditIdx] = useState(null);
  const [pasteTplEditVal, setPasteTplEditVal] = useState("");
  const [pasteTplNewHeader, setPasteTplNewHeader] = useState("");
  const [pasteTplNewSection, setPasteTplNewSection] = useState("");
  const [pasteTplErr, setPasteTplErr] = useState("");
  const [pasteTplEditId, setPasteTplEditId] = useState(null); // id of template being edited
  const [savedTemplates, setSavedTemplates] = useState([]);

  useEffect(() => {
    try {
      setSavedTemplates(JSON.parse(localStorage.getItem("onixUserTemplates") || "[]"));
    } catch {
      setSavedTemplates([]);
    }
  }, []);

  const applyTemplateHtml = (html) => {
    const editor = reportEditorRef?.current;
    if (!editor) return;
    editor.innerHTML = html;
    setHasUnsavedChanges(true);
    setShowTemplates(false);
  };

  const saveCustomTemplate = (name, html) => {
    const tpl = { id: "user-" + Date.now(), name: (name || "My Template").trim(), modality: "USER", html };
    const next = [tpl, ...savedTemplates];
    setSavedTemplates(next);
    try { localStorage.setItem("onixUserTemplates", JSON.stringify(next)); } catch {}
  };

  const extractSections = async (text) => {
    const res = await fetch("/api/ai/extract-sections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || "Section extraction failed");
    return { headerFields: data.header_fields || [], studyTitle: data.study_title || "", sections: data.sections || [] };
  };

  const buildTemplateHtml = (headerFields, studyTitle, sections) => {
    const rows = [];
    for (let i = 0; i < headerFields.length; i += 2) {
      const left = headerFields[i];
      const right = headerFields[i + 1] || null;
      rows.push(`<tr>
        <td style="font-weight:700;white-space:nowrap;padding:5px 8px 5px 0;width:155px;">${left}:</td>
        <td style="border-bottom:1px dashed #bbb;padding:5px 8px;" contenteditable="true"></td>
        ${right
          ? `<td style="font-weight:700;white-space:nowrap;padding:5px 8px 5px 18px;width:155px;">${right}:</td>
             <td style="border-bottom:1px dashed #bbb;padding:5px 8px;" contenteditable="true"></td>`
          : `<td></td><td></td>`}
      </tr>`);
    }
    const headerTable = headerFields.length
      ? `<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:14px;table-layout:fixed;">${rows.join("")}</table>`
      : "";
    const titleHtml = studyTitle
      ? `<p style="text-align:center;font-weight:700;text-decoration:underline;font-size:14px;margin:10px 0 14px;" contenteditable="true">${studyTitle}</p>`
      : "";
    const sectionBlocks = sections
      .map((s) => `<p style="font-weight:700;margin:12px 0 4px;">${s}:</p><div style="min-height:52px;border-bottom:1px dashed #bbb;margin-bottom:10px;" contenteditable="true"></div>`)
      .join("");
    return `<div style="font-family:Arial,sans-serif;font-size:13px;line-height:1.6;color:#111827;padding:8px;">${headerTable}${titleHtml}${sectionBlocks}</div>`;
  };

  const resetWizard = () => {
    setPasteTplStep(null); setPasteTplName(""); setPasteTplStudyTitle("");
    setPasteTplHeaderFields([]); setPasteTplSections([]); setPasteTplErr("");
    setPasteTplEditId(null); setPasteTplNewHeader(""); setPasteTplNewSection("");
  };

  const createTemplateFromSections = () => {
    const html = buildTemplateHtml(pasteTplHeaderFields, pasteTplStudyTitle, pasteTplSections);
    if (pasteTplEditId) {
      const next = savedTemplates.map((t) =>
        t.id === pasteTplEditId
          ? { ...t, name: pasteTplName.trim() || t.name, html, headerFields: pasteTplHeaderFields, studyTitle: pasteTplStudyTitle, sections: pasteTplSections }
          : t
      );
      setSavedTemplates(next);
      try { localStorage.setItem("onixUserTemplates", JSON.stringify(next)); } catch {}
      applyTemplateHtml(html);
    } else {
      applyTemplateHtml(html);
      const tpl = { id: "user-" + Date.now(), name: (pasteTplName || "My Template").trim(), modality: "USER", html, headerFields: pasteTplHeaderFields, studyTitle: pasteTplStudyTitle, sections: pasteTplSections };
      const next = [tpl, ...savedTemplates];
      setSavedTemplates(next);
      try { localStorage.setItem("onixUserTemplates", JSON.stringify(next)); } catch {}
    }
    resetWizard();
  };

  const openEditTemplate = (tpl) => {
    setPasteTplEditId(tpl.id);
    setPasteTplName(tpl.name);
    setPasteTplStudyTitle(tpl.studyTitle || "");
    setPasteTplHeaderFields(tpl.headerFields || []);
    setPasteTplSections(tpl.sections || []);
    setPasteTplErr("");
    setPasteTplStep("review");
  };

  // Header field helpers
  const hdrRemove   = (i) => setPasteTplHeaderFields(pasteTplHeaderFields.filter((_, j) => j !== i));
  const hdrAddField = () => {
    const t = pasteTplNewHeader.trim(); if (!t) return;
    setPasteTplHeaderFields([...pasteTplHeaderFields, t]); setPasteTplNewHeader("");
  };

  // Section helpers
  const secMoveUp   = (i) => { const s = [...pasteTplSections]; [s[i-1], s[i]] = [s[i], s[i-1]]; setPasteTplSections(s); };
  const secMoveDown = (i) => { const s = [...pasteTplSections]; [s[i], s[i+1]] = [s[i+1], s[i]]; setPasteTplSections(s); };
  const secRemove   = (i) => setPasteTplSections(pasteTplSections.filter((_, j) => j !== i));
  const secStartEdit = (i) => { setPasteTplEditIdx(i); setPasteTplEditVal(pasteTplSections[i]); };
  const secCommitEdit = () => {
    if (pasteTplEditIdx == null) return;
    const t = pasteTplEditVal.trim();
    if (t) { const s = [...pasteTplSections]; s[pasteTplEditIdx] = t; setPasteTplSections(s); }
    setPasteTplEditIdx(null);
  };
  const secAddSection = () => {
    const t = pasteTplNewSection.trim(); if (!t) return;
    setPasteTplSections([...pasteTplSections, t]); setPasteTplNewSection("");
  };

  const createTemplateFromPaste = () => {}; // kept for legacy ref, unused

  const deleteSavedTemplate = (id) => {
    const next = savedTemplates.filter((t) => t.id !== id);
    setSavedTemplates(next);
    try { localStorage.setItem("onixUserTemplates", JSON.stringify(next)); } catch {}
  };

  const tplFileInputRef = useRef(null);
  const handleTemplateFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = "";
    if (!file) return;
    // Try re-entering fullscreen immediately (works in Chrome)
    onRequestFullscreen?.();
    // Firefox fallback — small delay
    setTimeout(() => { if (!document.fullscreenElement) onRequestFullscreen?.(); }, 200);
    setPasteTplErr("");
    setPasteTplStep("loading");
    try {
      const text = await readReportFileToText(file, () => {});
      if (!text || !text.trim()) throw new Error("Couldn't read any text from that file.");
      const { headerFields, studyTitle, sections } = await extractSections(text);
      if (!sections.length && !headerFields.length) throw new Error("No structure detected. Try a different file.");
      setPasteTplName((file.name || "").replace(/\.[^.]+$/, ""));
      setPasteTplHeaderFields(headerFields);
      setPasteTplStudyTitle(studyTitle);
      setPasteTplSections(sections);
      setPasteTplStep("review");
    } catch (err) {
      setPasteTplErr(err?.message || String(err));
      setPasteTplStep(null);
    }
  };

  // Region-aware inline word suggestions in the report editor. The region
  // follows the template the user picks from the Templates panel; until one is
  // picked we auto-detect from the study (e.g. "MRI OF SPINE" -> spine).
  const [templateRegion, setTemplateRegion] = useState(null);
  const effectiveRegion = templateRegion || regionFromStudy(study);
  useReportGhostAutocomplete(reportEditorRef, () => effectiveRegion);

  // Map a picked skeleton template to one of the autocomplete word-list regions.
  // "CT Head" has no "brain" keyword in its name, so handle head -> brain first;
  // CT Chest/Abdomen is pointed at abdomen (richer word list). Everything else
  // is derived from the template name via regionFromStudy.
  const regionForTemplate = (tpl) => {
    const id = (tpl?.id || "").toLowerCase();
    if (/head|brain/.test(id)) return "brain";
    if (id === "ct-chest-abdomen") return "abdomen";
    return regionFromStudy(tpl?.name || "");
  };

  useEffect(() => {
    const el = reportEditorRef?.current;
    if (!el) return;
    const onInput = () => setHasUnsavedChanges(true);
    el.addEventListener("input", onInput);
    return () => el.removeEventListener("input", onInput);
  }, [reportEditorRef, showReport]);

  useEffect(() => {
    const root = reportEditorRef?.current;
    if (!root || !showReport) return;
    const onFocusIn = (e) => {
      const t = e.target;
      if (t && t.isContentEditable && root.contains(t)) {
        lastReportFocusRef.current = { el: t, range: null };
      }
    };
    const onSelectionChange = () => {
      const sel = typeof window !== "undefined" ? window.getSelection?.() : null;
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      const node = range.startContainer;
      const startEl = node.nodeType === 1 ? node : node.parentElement;
      const host = startEl?.closest?.('[contenteditable="true"]');
      if (host && root.contains(host)) {
        lastReportFocusRef.current = { el: host, range: range.cloneRange() };
      }
    };
    root.addEventListener("focusin", onFocusIn);
    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      root.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("selectionchange", onSelectionChange);
    };
  }, [reportEditorRef, showReport]);

  useEffect(() => {
    if (!showReport) setHasUnsavedChanges(false);
  }, [showReport, caseId]);

  // AI generation programmatically updates the editor — that doesn't fire
  // input events, so hasUnsavedChanges wouldn't otherwise flip. Mark dirty
  // when AI content has been produced in this session so the close-confirm
  // dialog prompts the user to save.
  const aiSeenRef = useRef(false);
  useEffect(() => {
    if (!showReport) {
      aiSeenRef.current = false;
      return;
    }
    if (reportData?.report_mode === "ai" && !aiSeenRef.current) {
      aiSeenRef.current = true;
      setHasUnsavedChanges(true);
    }
  }, [showReport, reportData?.report_mode]);

  useEffect(() => {
    if (reportUnsavedRef) reportUnsavedRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges, reportUnsavedRef]);

  const fetchReportVersions = async () => {
    if (!backendUrl || !caseId) return;
    setHistoryLoading(true);
    try {
      const versionsUrl = currentUserId
        ? `${backendUrl}/radiology/reports/${encodeURIComponent(caseId)}/versions?user_id=${encodeURIComponent(currentUserId)}`
        : `${backendUrl}/radiology/reports/${encodeURIComponent(caseId)}/versions`;
      const res = await fetch(versionsUrl);
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        setReportHistory(json.data || []);
      }
    } catch (e) {
      console.error("[reportVersions] list failed:", e);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    setReportHistory([]);
    setShowHistory(false);
    if (caseId && backendUrl) {
      fetchReportVersions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, backendUrl]);

  const saveReportVersion = async (label) => {
    if (!backendUrl || !caseId) return;
    const html = reportEditorRef?.current?.innerHTML || "";
    if (!html.trim()) return;
    try {
      const res = await fetch(
        `${backendUrl}/radiology/reports/${encodeURIComponent(caseId)}/versions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            html,
            label: label || "Snapshot",
            user_id: currentUserId || null,
          }),
        }
      );
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        setHasUnsavedChanges(false);
        await fetchReportVersions();
      } else {
        console.error("[reportVersions] save failed:", json);
      }
    } catch (e) {
      console.error("[reportVersions] save threw:", e);
    }
  };

  const restoreReportVersion = async (entry, { snapshot = true } = {}) => {
    if (!entry || !reportEditorRef?.current) return;
    if (snapshot) {
      await saveReportVersion("Before restore");
    }
    reportEditorRef.current.innerHTML = entry.html;
    setShowHistory(false);
  };

  const deleteReportVersion = async (entry) => {
    if (!entry?.id || !backendUrl || !caseId) return;
    try {
      const res = await fetch(
        `${backendUrl}/radiology/reports/${encodeURIComponent(caseId)}/versions/${entry.id}`,
        { method: "DELETE" }
      );
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        setReportHistory((prev) => prev.filter((e) => e.id !== entry.id));
      } else {
        console.error("[reportVersions] delete failed:", json);
      }
    } catch (e) {
      console.error("[reportVersions] delete threw:", e);
    }
  };

  const formatHistoryTs = (ts) => {
    try {
      const d = new Date(ts);
      return d.toLocaleString(undefined, {
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return String(ts);
    }
  };

  const handleSubmitReportWithHistory = async () => {
    await saveReportVersion("Submitted");
    if (typeof submitReport === "function") submitReport();
  };

  useEffect(() => {
    if (reportSaveFnRef) reportSaveFnRef.current = saveReportVersion;
    return () => {
      if (reportSaveFnRef && reportSaveFnRef.current === saveReportVersion) {
        reportSaveFnRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendUrl, caseId, currentUserId]);

const manualClientIdMap = {
    "CASE-REAL-2001": "CLIENT-001",
    "CASE-REAL-2002": "CLIENT-004",
    "CASE-REAL-2003": "CLIENT-002",
    "CASE-REAL-2004": "CLIENT-006",
    "CASE-REAL-2005": "CLIENT-003",
    "CASE-REAL-2006": "CLIENT-005",
    "CASE-REAL-2007": "CLIENT-007",
    "CASE-REAL-2008": "CLIENT-008",
    "CASE-REAL-2009": "CLIENT-009",
    "CASE-REAL-2010": "CLIENT-010",
    "CASE-REAL-2011": "CLIENT-011",
    "CASE-REAL-2012": "CLIENT-016",
    "CASE-REAL-2013": "CLIENT-012",
    "CASE-REAL-2014": "CLIENT-013",
    "CASE-REAL-2015": "CLIENT-014",
    "CASE-REAL-2016": "CLIENT-015",
  };

  const caseIdDisplayMap = {
    "CASE-REAL-2001": "GENRAD-SUB-54634582",
    "CASE-REAL-2002": "GENRAD-SUB-78291364",
    "CASE-REAL-2003": "GENRAD-SUB-62847193",
    "CASE-REAL-2004": "GENRAD-SUB-93745128",
    "CASE-REAL-2005": "GENRAD-SUB-41826597",
    "CASE-REAL-2006": "GENRAD-SUB-85317624",
    "CASE-REAL-2007": "GENRAD-SUB-16294837",
    "CASE-REAL-2008": "GENRAD-SUB-73819264",
    "CASE-REAL-2009": "GENRAD-SUB-48572913",
    "CASE-REAL-2010": "GENRAD-SUB-92164738",
    "CASE-REAL-2011": "GENRAD-SUB-58372914",
    "CASE-REAL-2012": "GENRAD-SUB-31947528",
    "CASE-REAL-2013": "GENRAD-SUB-26491837",
    "CASE-REAL-2014": "GENRAD-SUB-67384521",
    "CASE-REAL-2015": "GENRAD-SUB-94827156",
    "CASE-REAL-2016": "GENRAD-SUB-52381749",
    "CASE-REAL-2017": "GENRAD-SUB-29183746",
    "CASE-REAL-2018": "GENRAD-SUB-74829163",
    "CASE-REAL-2019": "GENRAD-SUB-38196274",
    "CASE-REAL-2020": "GENRAD-SUB-61473829",
    "CASE-REAL-2021": "GENRAD-SUB-57293841",
    "CASE-REAL-2022": "GENRAD-SUB-83641927",
    "CASE-REAL-2023": "GENRAD-SUB-29471836",
    "CASE-REAL-2024": "GENRAD-SUB-46183729",
    "CASE-REAL-2025": "GENRAD-SUB-72914638",
    "CASE-REAL-2026": "GENRAD-SUB-35819274",
    "CASE-REAL-2027": "GENRAD-SUB-18274639",
    "CASE-REAL-2028": "GENRAD-SUB-93614728",
    "CASE-REAL-2029": "GENRAD-SUB-47382916",
    "CASE-REAL-2030": "GENRAD-SUB-62917483",
    "CASE-REAL-2031": "GENRAD-SUB-81934726",
    "CASE-REAL-2032": "GENRAD-SUB-37461829",
    "CASE-REAL-2033": "GENRAD-SUB-56219473",
    "CASE-REAL-2034": "GENRAD-SUB-94736281",
    "CASE-REAL-2035": "GENRAD-SUB-21847369",
    "CASE-REAL-2036": "GENRAD-SUB-73916248",
    "CASE-REAL-2037": "GENRAD-SUB-48263917",
    "CASE-REAL-2038": "GENRAD-SUB-16394728",
    "CASE-REAL-2039": "GENRAD-SUB-85729163",
    "CASE-REAL-2040": "GENRAD-SUB-39481726",
    "CASE-REAL-2041": "GENRAD-SUB-67192834",
    "CASE-REAL-2042": "GENRAD-SUB-24738169",
    "CASE-REAL-2043": "GENRAD-SUB-91274836",
    "CASE-REAL-2044": "GENRAD-SUB-53847219",
    "CASE-REAL-2045": "GENRAD-SUB-78163942",
    "CASE-REAL-2046": "GENRAD-SUB-42691837",
    "CASE-REAL-2047": "GENRAD-SUB-16837429",
    "CASE-REAL-2048": "GENRAD-SUB-83742619",
    "CASE-REAL-2049": "GENRAD-SUB-29163874",
    "CASE-REAL-2050": "GENRAD-SUB-64817293",
    "CASE-REAL-2051": "GENRAD-SUB-37291648",
    "CASE-REAL-2052": "GENRAD-SUB-91628473",
    "CASE-REAL-2053": "GENRAD-SUB-48371926",
    "CASE-REAL-2054": "GENRAD-SUB-72914836",
    "CASE-REAL-2055": "GENRAD-SUB-19283746",
    "CASE-REAL-2056": "GENRAD-SUB-64839271",
    "CASE-REAL-2057": "GENRAD-SUB-83162947",
    "CASE-REAL-2058": "GENRAD-SUB-27493816",
    "CASE-REAL-2059": "GENRAD-SUB-51836294",
    "CASE-REAL-2060": "GENRAD-SUB-96274831",
    "CASE-REAL-2061": "GENRAD-SUB-43817296",
    "CASE-REAL-2062": "GENRAD-SUB-71392846",
    "CASE-REAL-2063": "GENRAD-SUB-28461937",
    "CASE-REAL-2064": "GENRAD-SUB-56293174",
  };
  const displayCaseId = caseIdDisplayMap[caseId] || caseId || "—";

  const clientIdDisplayMap = {
    "CLIENT-001": "GENRAD-ORG-46425629",
    "CLIENT-002": "GENRAD-ORG-71938425",
    "CLIENT-003": "GENRAD-ORG-83629471",
    "CLIENT-004": "GENRAD-ORG-52487136",
    "CLIENT-005": "GENRAD-ORG-94725183",
    "CLIENT-006": "GENRAD-ORG-37162859",
    "CLIENT-007": "GENRAD-ORG-62847159",
    "CLIENT-008": "GENRAD-ORG-28364571",
    "CLIENT-009": "GENRAD-ORG-71829364",
    "CLIENT-010": "GENRAD-ORG-49183726",
    "CLIENT-011": "GENRAD-ORG-83726415",
    "CLIENT-012": "GENRAD-ORG-61728394",
    "CLIENT-013": "GENRAD-ORG-61728394",
    "CLIENT-014": "GENRAD-ORG-61728394",
    "CLIENT-015": "GENRAD-ORG-61728394",
    "CLIENT-016": "GENRAD-ORG-61728394",
    "CLIENT-017": "GENRAD-ORG-61728394",
    "CLIENT-018": "GENRAD-ORG-61728394",
    "CLIENT-019": "GENRAD-ORG-61728394",
    "CLIENT-020": "GENRAD-ORG-61728394",
    "CLIENT-021": "GENRAD-ORG-61728394",
    "CLIENT-022": "GENRAD-ORG-61728394",
    "CLIENT-023": "GENRAD-ORG-61728394",
    "CLIENT-024": "GENRAD-ORG-61728394",
    "CLIENT-025": "GENRAD-ORG-61728394",
    "CLIENT-026": "GENRAD-ORG-61728394",
    "CLIENT-027": "GENRAD-ORG-61728394",
    "CLIENT-028": "GENRAD-ORG-61728394",
    "CLIENT-029": "GENRAD-ORG-61728394",
    "CLIENT-030": "GENRAD-ORG-61728394",
    "CLIENT-031": "GENRAD-ORG-61728394",
    "CLIENT-032": "GENRAD-ORG-61728394",
    "CLIENT-033": "GENRAD-ORG-61728394",
    "CLIENT-034": "GENRAD-ORG-61728394",
    "CLIENT-035": "GENRAD-ORG-61728394",
    "CLIENT-036": "GENRAD-ORG-61728394",
    "CLIENT-037": "GENRAD-ORG-61728394",
    "CLIENT-038": "GENRAD-ORG-61728394",
    "CLIENT-039": "GENRAD-ORG-61728394",
    "CLIENT-040": "GENRAD-ORG-61728394",
    "CLIENT-041": "GENRAD-ORG-61728394",
    "CLIENT-042": "GENRAD-ORG-61728394",
    "CLIENT-043": "GENRAD-ORG-61728394",
    "CLIENT-044": "GENRAD-ORG-61728394",
    "CLIENT-045": "GENRAD-ORG-61728394",
    "CLIENT-046": "GENRAD-ORG-61728394",
    "CLIENT-047": "GENRAD-ORG-61728394",
    "CLIENT-048": "GENRAD-ORG-61728394",
    "CLIENT-049": "GENRAD-ORG-61728394",
    "CLIENT-050": "GENRAD-ORG-61728394",
    "CLIENT-051": "GENRAD-ORG-61728394",
    "CLIENT-052": "GENRAD-ORG-61728394",
    "CLIENT-053": "GENRAD-ORG-61728394",
    "CLIENT-054": "GENRAD-ORG-61728394",
  };
  const rawClientId = clientId || manualClientIdMap[caseId] || null;
  const resolvedClientId = rawClientId ? (clientIdDisplayMap[rawClientId] || rawClientId) : "—";
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
    let savedRange = null;

    if (activeEl && root.contains(activeEl) && activeEl.isContentEditable) {
      target = activeEl;
    } else {
      const remembered = lastReportFocusRef.current;
      if (
        remembered?.el &&
        root.contains(remembered.el) &&
        remembered.el.isContentEditable
      ) {
        target = remembered.el;
        savedRange = remembered.range;
      } else {
        // Last-resort fallback: prefer the large block-level fields
        // (Technique, Findings, etc.) over the small inline header inputs
        // like Referring Doctor, which would otherwise win by DOM order.
        target =
          root.querySelector('.report-answer.block[contenteditable="true"]') ||
          root.querySelector('.report-answer[contenteditable="true"]');
      }
    }
    if (!target) return;

    target.focus();
    if (savedRange) {
      try {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(savedRange);
      } catch {}
    }
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

  // Report editor mic uses MedASR (via /api/ai/stt) instead of browser SpeechRecognition.
  const reportRecorderRef = useRef(null);

  const stopReportMicMedASR = () => {
    const rec = reportRecorderRef.current?.recorder;
    if (rec && rec.state === "recording") {
      try { rec.stop(); } catch {}
    }
  };

  const startReportMicMedASR = async () => {
    if (!navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      let mime = "audio/webm";
      if (!MediaRecorder.isTypeSupported(mime)) mime = "audio/webm;codecs=opus";
      if (!MediaRecorder.isTypeSupported(mime)) mime = "";
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      const chunks = [];

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setActiveMicTarget((curr) => (curr === "report" ? null : curr));
        reportRecorderRef.current = null;
        if (!chunks.length) return;
        const blob = new Blob(chunks, { type: mime || "audio/webm" });
        const fd = new FormData();
        fd.append("audio", blob, "report-dictation.webm");
        try {
          const res = await fetch("/api/ai/stt", { method: "POST", body: fd });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data?.success || !data?.text) return;
          insertReportTranscript(data.text);
        } catch {}
      };

      reportRecorderRef.current = { recorder };
      setActiveMicTarget("report");
      recorder.start(1000);
      setTimeout(() => { if (recorder.state === "recording") recorder.stop(); }, 60000);
    } catch {
      setActiveMicTarget((curr) => (curr === "report" ? null : curr));
    }
  };

  const toggleMic = (target) => {
    if (target === "report") {
      if (activeMicTarget === "report") {
        stopMic();
        stopReportMicMedASR();
        return;
      }
      stopMic();
      startMic("report");
      return;
    }
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
    setOnixMessages((m) => [...m, { role: "user", text: "Dictate a structured report" }]);

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

        setOnixMessages((m) => [...m, { role: "ai", text: "Processing your audio..." }]);

        try {
          const res = await fetch("/api/ai/stt-report", { method: "POST", body: formData });
          const data = await res.json();
          if (data.success) {
            let msg = "";
            if (data.transcription) {
              setDictateDraftText(data.transcription);
              msg += `**Transcription:**\n${data.transcription}\n\n`;
            }
            if (data.report) msg += `**Structured Report:**\n${data.report}`;
            else msg += "Report generation failed. Use the transcription above.";
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
        if (!chunks.length) {
          setOnixMessages((m) => [...m, { role: "ai", text: "Mic error: no audio captured. Check that the browser has microphone permission for this site." }]);
          return;
        }
        const blob = new Blob(chunks, { type: mime || "audio/webm" });
        // Send to MedASR
        const fd = new FormData();
        fd.append("audio", blob, "dictation.webm");
        try {
          const res = await fetch("/api/ai/stt", { method: "POST", body: fd });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            const detail = data?.detail || `HTTP ${res.status}`;
            setOnixMessages((m) => [...m, { role: "ai", text: `Transcription failed: ${detail}` }]);
            return;
          }
          if (!data.success || !data.text) {
            setOnixMessages((m) => [...m, { role: "ai", text: "Transcription returned empty text. Try speaking louder or longer." }]);
            return;
          }
          if (dictateMode === "report" || dictateMode === "dictate") {
            setDictateDraftText((prev) => prev ? prev + " " + data.text : data.text);
          } else {
            setAiReportDraftText((prev) => prev ? prev + " " + data.text : data.text);
          }
        } catch (err) {
          setOnixMessages((m) => [...m, { role: "ai", text: `Transcription network error: ${err.message}` }]);
        }
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
      setOnixMessages((m) => [...m, { role: "ai", text: "Formatting report..." }]);
      try {
        const res = await fetch("/api/ai/text-to-report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, patient_name: patientName || null, modality: caseModality || null, study: study || null }),
        });
        const data = await res.json();
        if (data.success) {
          setOnixMessages((m) => [...m, { role: "ai", text: `**Structured Report:**\n${data.report}` }]);
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
    if (onixChatBottomRef.current && onixChatBottomRef.current.parentElement) {
      onixChatBottomRef.current.parentElement.scrollTop = onixChatBottomRef.current.parentElement.scrollHeight;
    }
  }, [onixMessages]);

  useEffect(() => {
    if (!onixLoading) {
      setLoadingPhraseIndex(0);
      return undefined;
    }

    if ((onixStatusText || "").trim()) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      setLoadingPhraseIndex((prev) => (prev + 1) % loadingPhrases.length);
    }, 2200);

    return () => clearInterval(intervalId);
  }, [onixLoading, onixStatusText]);

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

  const activeOnixLoadingText = (onixStatusText || "").trim() || loadingPhrases[loadingPhraseIndex];

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

      {qcStage === "passed" && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(8, 12, 22, 0.85)",
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 20px",
              background: "#0b1a4b",
              borderBottom: "1px solid #1e3a8a",
              color: "#e5e7eb",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span
                style={{
                  display: "inline-flex",
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: "#10b981",
                  color: "#fff",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                ✓
              </span>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>Report Preview · QC Passed</div>
                <div style={{ fontSize: 12, color: "#9ca3af" }}>
                  Review the PDF and finalize the report.
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <CButton color="success" size="sm" onClick={markComplete}>
                Save & Mark Complete
              </CButton>
              <CButton color="light" size="sm" onClick={cancelQcPreview}>
                Edit
              </CButton>
            </div>
          </div>
          <div style={{ flex: 1, padding: 16, overflow: "hidden", background: "#111827" }}>
            {pdfPreviewUrl ? (
              <iframe
                title="Report PDF Full Preview"
                src={pdfPreviewUrl}
                style={{
                  width: "100%",
                  height: "100%",
                  border: "none",
                  borderRadius: 6,
                  background: "#fff",
                }}
              />
            ) : (
              <div style={{ padding: 40, color: "#cbd5e1", textAlign: "center" }}>
                Generating PDF preview…
              </div>
            )}
          </div>
        </div>
      )}

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
        <div style={{ position: "relative", border: "1px solid #1d4ed8", borderRadius: 12, background: "#0b1a4b", color: "#e5e7eb", overflow: "hidden", display: "grid", gridTemplateRows: "auto auto 1fr" }}>
          {typeof setReportViewerCollapsed === "function" && (
            <button
              onClick={() => setReportViewerCollapsed((v) => !v)}
              title={reportViewerCollapsed ? "Show viewer" : "Hide viewer (expand report)"}
              aria-label={reportViewerCollapsed ? "Show viewer" : "Hide viewer"}
              style={{
                position: "absolute",
                top: "50%",
                left: 4,
                transform: "translateY(-50%)",
                zIndex: 40,
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
                cursor: "pointer",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.3" />
                {reportViewerCollapsed ? (
                  /* viewer hidden → right arrow to bring it back */
                  <path d="M5.2 8h4.2M7.6 5.6L10 8l-2.4 2.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                ) : (
                  /* viewer visible → left arrow to collapse it */
                  <path d="M10.8 8H6.6M8.4 5.6L6 8l2.4 2.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                )}
              </svg>
            </button>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 6, padding: "10px 12px", borderBottom: "1px solid #1f2937", background: "#2f2f2f" }}>
            <span style={{ fontSize: 16, color: "#e5e7eb", textAlign: "center", fontWeight: 600 }}>
              {qcStage === "running"
                ? "QC In Progress"
                : qcStage === "failed"
                ? "QC Failed"
                : "Generate Report"}
            </span>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <CButton
                color="primary"
                size="sm"
                onClick={handleSubmitReportWithHistory}
                disabled={qcStage === "running"}
              >
                {qcStage === "running" ? "Submitting…" : "Submit Report"}
              </CButton>
              <CButton
                color="light"
                size="sm"
                onClick={() => {
                  if (hasUnsavedChanges) {
                    setShowCloseConfirm(true);
                  } else {
                    setShowReport(false);
                  }
                }}
                disabled={qcStage === "running"}
              >
                Close
              </CButton>
            </div>
          </div>

          {showHistory && (
            <div
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                bottom: 0,
                width: 320,
                background: "#ffffff",
                borderLeft: "1px solid #e5e7eb",
                boxShadow: "-4px 0 16px rgba(0,0,0,0.18)",
                zIndex: 30,
                color: "#1f2937",
                display: "flex",
                flexDirection: "column",
                fontFamily: "Segoe UI, -apple-system, BlinkMacSystemFont, sans-serif",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 16px 10px",
                  borderBottom: "1px solid #f3f4f6",
                }}
              >
                <span style={{ fontSize: 16, fontWeight: 600, color: "#1f2937" }}>
                  Version History
                </span>
                <button
                  onClick={() => setShowHistory(false)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#6b7280",
                    fontSize: 18,
                    cursor: "pointer",
                    lineHeight: 1,
                    padding: 0,
                  }}
                  aria-label="Close history"
                >
                  ×
                </button>
              </div>

              <div style={{ overflowY: "auto", flex: 1 }}>
                {historyLoading && reportHistory.length === 0 ? (
                  <div style={{ padding: 16, fontSize: 13, color: "#6b7280" }}>
                    Loading…
                  </div>
                ) : reportHistory.length === 0 ? (
                  <div style={{ padding: 16, fontSize: 13, color: "#6b7280" }}>
                    No versions saved yet. A version is saved each time the
                    report is submitted.
                  </div>
                ) : (
                  <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                    {reportHistory.map((entry, idx) => {
                      const isCurrent = idx === 0;
                      return (
                      <li
                        key={entry.id ?? `${entry.created_at}-${idx}`}
                        onClick={() => {
                          restoreReportVersion(entry, { snapshot: !isCurrent });
                        }}
                        style={{
                          padding: "12px 16px",
                          borderBottom: "1px solid #f3f4f6",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 10,
                          background: isCurrent ? "#f9fafb" : "transparent",
                          position: "relative",
                        }}
                        title={isCurrent ? "Open the current version" : "Click to restore this version"}
                      >
                        <span
                          style={{
                            marginTop: 6,
                            width: 8,
                            height: 8,
                            borderRadius: 2,
                            background: "#9ca3af",
                            flexShrink: 0,
                            transform: "rotate(45deg)",
                          }}
                        />
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <span style={{ fontSize: 14, color: "#1f2937", fontWeight: 500 }}>
                            {formatHistoryTs(entry.created_at)}
                          </span>
                          {idx === 0 && (
                            <span style={{ fontSize: 12, color: "#6b7280" }}>
                              Current Version
                            </span>
                          )}
                          {entry.label && (
                            <span style={{ fontSize: 12, color: "#6b7280" }}>
                              {entry.label}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteReportVersion(entry);
                          }}
                          aria-label="Delete this version"
                          title="Delete this version"
                          style={{
                            marginLeft: "auto",
                            background: "transparent",
                            border: "none",
                            color: "#9ca3af",
                            cursor: "pointer",
                            fontSize: 16,
                            lineHeight: 1,
                            padding: "2px 6px",
                            borderRadius: 4,
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = "#dc2626";
                            e.currentTarget.style.background = "#fee2e2";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = "#9ca3af";
                            e.currentTarget.style.background = "transparent";
                          }}
                        >
                          ×
                        </button>
                      </li>
                    );
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* ── Full-screen template review modal ── */}
          {pasteTplStep === "review" && (
            <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ background: "#fff", borderRadius: 12, width: "min(680px, 95vw)", maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.3)", fontFamily: "Segoe UI, -apple-system, sans-serif" }}>
                {/* Modal header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid #e5e7eb" }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: "#1c4e80" }}>
                    {pasteTplEditId ? "Edit template" : "Review template"}
                  </span>
                  <button onClick={resetWizard} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#6b7280", lineHeight: 1, padding: 4 }}>✕</button>
                </div>

                {/* Scrollable body */}
                <div style={{ overflowY: "auto", flex: 1, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>

                  {/* Template name */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Template name</div>
                    <input value={pasteTplName} onChange={(e) => setPasteTplName(e.target.value)}
                      placeholder="e.g. MRI Brain — custom"
                      style={{ width: "100%", boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 6, padding: "7px 10px", fontSize: 13 }} />
                  </div>

                  {/* Study title */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Study title (centered)</div>
                    <input value={pasteTplStudyTitle} onChange={(e) => setPasteTplStudyTitle(e.target.value)}
                      placeholder="e.g. MRI OF BRAIN, MRCP…"
                      style={{ width: "100%", boxSizing: "border-box", border: "1px solid #e9d5ff", borderRadius: 6, padding: "7px 10px", fontSize: 13, textAlign: "center", fontWeight: 600, color: "#6b21a8", background: "#faf5ff" }} />
                  </div>

                  {/* Header fields */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Header fields</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginBottom: 6 }}>
                      {pasteTplHeaderFields.map((f, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", background: "#f0f9ff", border: "1px solid #bae6fd", borderLeft: "3px solid #0ea5e9", borderRadius: 4, paddingLeft: 8 }}>
                          <span style={{ flex: 1, fontSize: 13, padding: "5px 4px", color: "#0c4a6e" }}>{f}</span>
                          <button onClick={() => hdrRemove(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: "2px 8px", fontSize: 14 }}>✕</button>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input value={pasteTplNewHeader} onChange={(e) => setPasteTplNewHeader(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && hdrAddField()}
                        placeholder="Add header field…"
                        style={{ flex: 1, border: "1px solid #bae6fd", borderRadius: 6, padding: "6px 10px", fontSize: 13, fontFamily: "inherit" }} />
                      <button onClick={hdrAddField} style={{ background: "#e0f2fe", color: "#0369a1", border: "1px solid #bae6fd", borderRadius: 6, padding: "6px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>＋ Add</button>
                    </div>
                  </div>

                  {/* Report sections */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Report sections ({pasteTplSections.length})</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 6 }}>
                      {pasteTplSections.map((s, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", background: "#f8fafc", border: "1px solid #e2e8f0", borderLeft: "3px solid #1c4e80", borderRadius: 4, paddingLeft: 8 }}>
                          {pasteTplEditIdx === i ? (
                            <input autoFocus value={pasteTplEditVal}
                              onChange={(e) => setPasteTplEditVal(e.target.value)}
                              onBlur={secCommitEdit}
                              onKeyDown={(e) => e.key === "Enter" && secCommitEdit()}
                              style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 13, fontFamily: "inherit", padding: "7px 4px", color: "#111827" }} />
                          ) : (
                            <span onDoubleClick={() => secStartEdit(i)} title="Double-click to edit"
                              style={{ flex: 1, fontSize: 13, padding: "7px 4px", cursor: "text", userSelect: "none", color: "#111827" }}>{s}</span>
                          )}
                          <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "0 6px", flexShrink: 0 }}>
                            <button onClick={() => secMoveUp(i)} disabled={i === 0}
                              style={{ background: "none", border: "none", cursor: i === 0 ? "default" : "pointer", color: i === 0 ? "#d1d5db" : "#6b7280", padding: "3px 4px", fontSize: 11 }}>▲</button>
                            <button onClick={() => secMoveDown(i)} disabled={i === pasteTplSections.length - 1}
                              style={{ background: "none", border: "none", cursor: i === pasteTplSections.length - 1 ? "default" : "pointer", color: i === pasteTplSections.length - 1 ? "#d1d5db" : "#6b7280", padding: "3px 4px", fontSize: 11 }}>▼</button>
                            <button onClick={() => secRemove(i)}
                              style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: "3px 6px", fontSize: 14 }}>✕</button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input value={pasteTplNewSection} onChange={(e) => setPasteTplNewSection(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && secAddSection()}
                        placeholder="Add a section heading…"
                        style={{ flex: 1, border: "1px solid #cbd5e1", borderRadius: 6, padding: "6px 10px", fontSize: 13, fontFamily: "inherit" }} />
                      <button onClick={secAddSection} style={{ background: "#dbeafe", color: "#1c4e80", border: "1px solid #bfdbfe", borderRadius: 6, padding: "6px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>＋ Add</button>
                    </div>
                  </div>
                </div>

                {/* Modal footer */}
                <div style={{ padding: "12px 20px", borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "flex-end", gap: 10 }}>
                  <button onClick={resetWizard} style={{ background: "#f1f5f9", color: "#334155", border: "1px solid #cbd5e1", borderRadius: 6, padding: "8px 18px", fontSize: 13, cursor: "pointer" }}>Cancel</button>
                  <button onClick={createTemplateFromSections} disabled={!pasteTplName.trim()}
                    style={{ background: pasteTplName.trim() ? "#16a34a" : "#9ca3af", color: "#fff", border: "none", borderRadius: 6, padding: "8px 22px", fontSize: 13, fontWeight: 600, cursor: pasteTplName.trim() ? "pointer" : "default" }}>
                    ✓ {pasteTplEditId ? "Update template" : "Save template"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {showTemplates && (
            <div
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                bottom: 0,
                width: 340,
                background: "#ffffff",
                borderLeft: "1px solid #e5e7eb",
                boxShadow: "-4px 0 16px rgba(0,0,0,0.18)",
                zIndex: 30,
                color: "#1f2937",
                display: "flex",
                flexDirection: "column",
                fontFamily: "Segoe UI, -apple-system, BlinkMacSystemFont, sans-serif",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px 10px", borderBottom: "1px solid #f3f4f6" }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: "#1f2937" }}>Report Templates</span>
                <button onClick={() => setShowTemplates(false)} style={{ background: "transparent", border: "none", color: "#6b7280", fontSize: 18, cursor: "pointer", lineHeight: 1, padding: 0 }}>×</button>
              </div>
              <div style={{ padding: "10px 12px", fontSize: 12, color: "#6b7280", borderBottom: "1px solid #f3f4f6" }}>
                Select a template to pre-fill the report structure. Existing content will be replaced.
              </div>

              {/* Template wizard: Upload file → AI extracts header fields + sections → Review & edit → Save */}
              <div style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>
                <input ref={tplFileInputRef} type="file" accept=".txt,.docx,.pdf,.png,.jpg,.jpeg,.webp" style={{ display: "none" }} onChange={handleTemplateFileUpload} />

                {/* IDLE */}
                {!pasteTplStep && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <button onClick={() => tplFileInputRef.current?.click()}
                      style={{ width: "100%", background: "#1c4e80", color: "#fff", border: "none", borderRadius: 6, padding: "9px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                      ⬆ Upload report to create template
                    </button>
                    {pasteTplErr && (
                      <div style={{ fontSize: 11, color: "#dc2626", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, padding: "6px 8px" }}>{pasteTplErr}</div>
                    )}
                  </div>
                )}

                {/* LOADING */}
                {pasteTplStep === "loading" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 4px" }}>
                    <div style={{ width: 18, height: 18, border: "2px solid #dbeafe", borderTopColor: "#1c4e80", borderRadius: "50%", animation: "tplSpin 0.8s linear infinite", flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: "#1c4e80", fontWeight: 600 }}>Scanning report structure with AI…</span>
                  </div>
                )}

                {/* REVIEW — rendered as full-screen modal, see below */}
              </div>
              <div style={{ overflowY: "auto", flex: 1, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                {savedTemplates.length > 0 && (
                  <>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "#9ca3af", padding: "6px 2px 2px" }}>MY TEMPLATES</div>
                    {savedTemplates.map((tpl) => (
                      <div
                        key={tpl.id}
                        onClick={() => applyTemplateHtml(tpl.html)}
                        style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 12px", cursor: "pointer", background: "#fafafa", display: "flex", alignItems: "center", gap: 10 }}
                      >
                        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, width: 44, height: 44, borderRadius: 10, background: "#dbeafe", color: "#1c4e80", fontSize: 18 }}>📝</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{tpl.name}</span>
                          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>Custom template</div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); openEditTemplate(tpl); }}
                          title="Edit template"
                          style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 5, color: "#0369a1", cursor: "pointer", fontSize: 11, fontWeight: 600, padding: "3px 8px" }}
                        >Edit</button>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteSavedTemplate(tpl.id); }}
                          title="Delete template"
                          style={{ background: "transparent", border: "none", color: "#9ca3af", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "2px 6px" }}
                        >×</button>
                      </div>
                    ))}
                    <div style={{ height: 1, background: "#f3f4f6", margin: "4px 0" }} />
                  </>
                )}
                {(() => {
                  const H = `<div style="font-family:Arial,sans-serif;font-size:13px;line-height:1.7;color:#111827;padding:8px;"><p style="text-align:center;font-style:italic;font-weight:700;font-size:14px;margin:0 0 10px;">ORGANIZATION NAME</p><table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:12px;"><tr><td style="font-weight:700;width:160px;padding:3px 0;">Age / Sex</td><td style="padding:3px 4px;">:</td><td style="border-bottom:1px dashed #999;min-width:160px;padding:3px 2px;" contenteditable="true"></td></tr><tr><td style="font-weight:700;padding:3px 0;">Case Id</td><td style="padding:3px 4px;">:</td><td style="border-bottom:1px dashed #999;padding:3px 2px;" contenteditable="true"></td></tr><tr><td style="font-weight:700;padding:3px 0;">Referring Doctor</td><td style="padding:3px 4px;">:</td><td style="border-bottom:1px dashed #999;padding:3px 2px;" contenteditable="true"></td></tr><tr><td style="font-weight:700;padding:3px 0;">Date &amp; Time</td><td style="padding:3px 4px;">:</td><td style="border-bottom:1px dashed #999;padding:3px 2px;" contenteditable="true"></td></tr><tr><td style="font-weight:700;padding:3px 0;">Investigation</td><td style="padding:3px 4px;">:</td><td style="border-bottom:1px dashed #999;padding:3px 2px;" contenteditable="true"></td></tr></table>`;
                  const F = `<p style="font-weight:700;margin:10px 0 4px;">IMPRESSION:</p><div style="min-height:60px;border-bottom:1px solid #d1d5db;margin-bottom:10px;" contenteditable="true"></div><p style="font-weight:700;margin:10px 0 4px;">Clinical Advice:</p><div style="min-height:36px;border-bottom:1px solid #d1d5db;margin-bottom:20px;" contenteditable="true"></div><p style="font-weight:700;margin:10px 0 4px;">Signature</p><div style="min-height:36px;" contenteditable="true"></div></div>`;
                  const s = (label, body) => `<p style="font-weight:700;margin:10px 0 4px;">${label}</p><div style="min-height:${body ? '32' : '60'}px;border-bottom:1px solid #d1d5db;margin-bottom:10px;" contenteditable="true">${body || ''}</div>`;
                  const title = (t) => `<p style="text-align:center;font-weight:700;text-decoration:underline;font-size:14px;margin:12px 0;" contenteditable="true">${t}</p>`;

                  const TEMPLATES = [
                    { type: "header", label: "GENERAL" },
                    {
                      id: "general", name: "General Report", modality: "GEN", icon: "scan",
                      desc: "Blank structured report — any modality",
                      html: H + `<p style="text-align:center;font-weight:700;text-decoration:underline;font-size:14px;margin:12px 0;" contenteditable="true">INVESTIGATION TITLE</p>` + s("Clinical History:") + s("Technique:") + s("Study reveals:", "<p></p><p></p><p></p><p></p>") + s("IMPRESSION:") + s("Clinical Advice:") + `<p style="font-weight:700;margin:10px 0 4px;">Signature</p><div style="min-height:36px;" contenteditable="true"></div></div>`,
                    },
                    { type: "header", label: "MRI" },
                    {
                      id: "mri-brain", name: "MRI Brain", modality: "MRI", icon: "brain",
                    desc: "T1/T2/FLAIR sequences, brain parenchyma",
                    html: `<div style="font-family:Arial,sans-serif;font-size:13px;line-height:1.7;color:#111827;padding:8px;">
<p style="text-align:center;font-style:italic;font-weight:700;font-size:14px;margin:0 0 10px;">ORGANIZATION NAME</p>
<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:12px;">
<tr><td style="font-weight:700;width:160px;padding:3px 0;">Age / Sex</td><td style="padding:3px 4px;">:</td><td style="border-bottom:1px dashed #999;min-width:160px;padding:3px 2px;" contenteditable="true"></td></tr>
<tr><td style="font-weight:700;padding:3px 0;">Case Id</td><td style="padding:3px 4px;">:</td><td style="border-bottom:1px dashed #999;padding:3px 2px;" contenteditable="true"></td></tr>
<tr><td style="font-weight:700;padding:3px 0;">Referring Doctor</td><td style="padding:3px 4px;">:</td><td style="border-bottom:1px dashed #999;padding:3px 2px;" contenteditable="true"></td></tr>
<tr><td style="font-weight:700;padding:3px 0;">Date &amp; Time</td><td style="padding:3px 4px;">:</td><td style="border-bottom:1px dashed #999;padding:3px 2px;" contenteditable="true"></td></tr>
<tr><td style="font-weight:700;padding:3px 0;">Investigation</td><td style="padding:3px 4px;">:</td><td style="border-bottom:1px dashed #999;padding:3px 2px;" contenteditable="true"></td></tr>
</table>
<p style="text-align:center;font-weight:700;text-decoration:underline;font-size:14px;margin:12px 0;" contenteditable="true">M.R.I OF BRAIN</p>
<p style="font-weight:700;margin:10px 0 4px;">Clinical History:</p>
<div style="min-height:40px;border-bottom:1px solid #d1d5db;margin-bottom:10px;" contenteditable="true"></div>
<p style="font-weight:700;margin:10px 0 4px;">Sequences:</p>
<div style="min-height:32px;border-bottom:1px solid #d1d5db;margin-bottom:10px;" contenteditable="true">T1W, T2W, FLAIR, DWI, SWI sequences in axial, coronal and sagittal planes.</div>
<p style="font-weight:700;margin:10px 0 4px;">Study reveals:</p>
<div style="min-height:120px;border-bottom:1px solid #d1d5db;margin-bottom:10px;" contenteditable="true"><p>Brain parenchyma: </p><p>Grey-white matter differentiation: </p><p>Ventricles and sulci: </p><p>Midline: </p><p>Cerebellum and brainstem: </p><p>Basal ganglia and thalami: </p><p>Corpus callosum: </p><p>Sella and parasellar region: </p><p>Orbits: </p><p>Paranasal sinuses and mastoids: </p></div>
<p style="font-weight:700;margin:10px 0 4px;">IMPRESSION:</p>
<div style="min-height:60px;border-bottom:1px solid #d1d5db;margin-bottom:10px;" contenteditable="true"></div>
<p style="font-weight:700;margin:10px 0 4px;">Clinical Advice:</p>
<div style="min-height:36px;border-bottom:1px solid #d1d5db;margin-bottom:20px;" contenteditable="true"></div>
<p style="font-weight:700;margin:10px 0 4px;">Signature</p>
<div style="min-height:36px;" contenteditable="true"></div>
</div>`,
                  },
                  {
                    id: "mri-spine", name: "MRI Spine", modality: "MRI", icon: "spine",
                    desc: "Lumbar / Cervical / Thoracic spine",
                    html: `<div style="font-family:Arial,sans-serif;font-size:13px;line-height:1.7;color:#111827;padding:8px;">
<p style="text-align:center;font-style:italic;font-weight:700;font-size:14px;margin:0 0 10px;">ORGANIZATION NAME</p>
<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:12px;">
<tr><td style="font-weight:700;width:160px;padding:3px 0;">Age / Sex</td><td style="padding:3px 4px;">:</td><td style="border-bottom:1px dashed #999;min-width:160px;padding:3px 2px;" contenteditable="true"></td></tr>
<tr><td style="font-weight:700;padding:3px 0;">Case Id</td><td style="padding:3px 4px;">:</td><td style="border-bottom:1px dashed #999;padding:3px 2px;" contenteditable="true"></td></tr>
<tr><td style="font-weight:700;padding:3px 0;">Referring Doctor</td><td style="padding:3px 4px;">:</td><td style="border-bottom:1px dashed #999;padding:3px 2px;" contenteditable="true"></td></tr>
<tr><td style="font-weight:700;padding:3px 0;">Date &amp; Time</td><td style="padding:3px 4px;">:</td><td style="border-bottom:1px dashed #999;padding:3px 2px;" contenteditable="true"></td></tr>
<tr><td style="font-weight:700;padding:3px 0;">Investigation</td><td style="padding:3px 4px;">:</td><td style="border-bottom:1px dashed #999;padding:3px 2px;" contenteditable="true"></td></tr>
</table>
<p style="text-align:center;font-weight:700;text-decoration:underline;font-size:14px;margin:12px 0;" contenteditable="true">M.R.I OF LUMBO-SACRAL SPINE</p>
<p style="font-weight:700;margin:10px 0 4px;">Clinical History:</p>
<div style="min-height:40px;border-bottom:1px solid #d1d5db;margin-bottom:10px;" contenteditable="true"></div>
<p style="font-weight:700;margin:10px 0 4px;">Sequences:</p>
<div style="min-height:32px;border-bottom:1px solid #d1d5db;margin-bottom:10px;" contenteditable="true">Sagittal T1W, T2W, STIR; Axial T2W sequences.</div>
<p style="font-weight:700;margin:10px 0 4px;">Study reveals:</p>
<div style="min-height:140px;border-bottom:1px solid #d1d5db;margin-bottom:10px;" contenteditable="true"><p>Vertebral alignment: </p><p>Vertebral body height and marrow signal: </p><p>Intervertebral disc spaces (L1-S1): </p><p>Disc at L1-L2: </p><p>Disc at L2-L3: </p><p>Disc at L3-L4: </p><p>Disc at L4-L5: </p><p>Disc at L5-S1: </p><p>Spinal canal and cord/conus: </p><p>Neural foramina: </p><p>Facet joints and ligaments: </p><p>Paraspinal soft tissues: </p></div>
<p style="font-weight:700;margin:10px 0 4px;">IMPRESSION:</p>
<div style="min-height:60px;border-bottom:1px solid #d1d5db;margin-bottom:10px;" contenteditable="true"></div>
<p style="font-weight:700;margin:10px 0 4px;">Clinical Advice:</p>
<div style="min-height:36px;border-bottom:1px solid #d1d5db;margin-bottom:20px;" contenteditable="true"></div>
<p style="font-weight:700;margin:10px 0 4px;">Signature</p>
<div style="min-height:36px;" contenteditable="true"></div>
</div>`,
                  },
                  {
                    id: "mri-pelvis", name: "MRI Pelvis", modality: "MRI", icon: "bone",
                    desc: "Pelvic structures, multi-sequence",
                    html: `<div style="font-family:Arial,sans-serif;font-size:13px;line-height:1.7;color:#111827;padding:8px;">
<p style="text-align:center;font-style:italic;font-weight:700;font-size:14px;margin:0 0 10px;">ORGANIZATION NAME</p>
<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:12px;">
<tr><td style="font-weight:700;width:160px;padding:3px 0;">Age / Sex</td><td style="padding:3px 4px;">:</td><td style="border-bottom:1px dashed #999;min-width:160px;padding:3px 2px;" contenteditable="true"></td></tr>
<tr><td style="font-weight:700;padding:3px 0;">Case Id</td><td style="padding:3px 4px;">:</td><td style="border-bottom:1px dashed #999;padding:3px 2px;" contenteditable="true"></td></tr>
<tr><td style="font-weight:700;padding:3px 0;">Referring Doctor</td><td style="padding:3px 4px;">:</td><td style="border-bottom:1px dashed #999;padding:3px 2px;" contenteditable="true"></td></tr>
<tr><td style="font-weight:700;padding:3px 0;">Date &amp; Time</td><td style="padding:3px 4px;">:</td><td style="border-bottom:1px dashed #999;padding:3px 2px;" contenteditable="true"></td></tr>
<tr><td style="font-weight:700;padding:3px 0;">Investigation</td><td style="padding:3px 4px;">:</td><td style="border-bottom:1px dashed #999;padding:3px 2px;" contenteditable="true"></td></tr>
</table>
<p style="text-align:center;font-weight:700;text-decoration:underline;font-size:14px;margin:12px 0;" contenteditable="true">M.R.I OF PELVIS</p>
<p style="font-weight:700;margin:10px 0 4px;">Clinical History:</p>
<div style="min-height:40px;border-bottom:1px solid #d1d5db;margin-bottom:10px;" contenteditable="true"></div>
<p style="font-weight:700;margin:10px 0 4px;">Sequences:</p>
<div style="min-height:32px;border-bottom:1px solid #d1d5db;margin-bottom:10px;" contenteditable="true">T2W coronal, axial, sagittal; T1W axial; STIR sequences.</div>
<p style="font-weight:700;margin:10px 0 4px;">Study reveals:</p>
<div style="min-height:130px;border-bottom:1px solid #d1d5db;margin-bottom:10px;" contenteditable="true"><p>Uterus (size, signal, morphology): </p><p>Endometrium: </p><p>Cervix: </p><p>Ovaries (right / left): </p><p>Adnexal region: </p><p>Urinary bladder: </p><p>Rectum and sigmoid: </p><p>Lymph nodes: </p><p>Pelvic floor and muscles: </p><p>Bony pelvis: </p></div>
<p style="font-weight:700;margin:10px 0 4px;">IMPRESSION:</p>
<div style="min-height:60px;border-bottom:1px solid #d1d5db;margin-bottom:10px;" contenteditable="true"></div>
<p style="font-weight:700;margin:10px 0 4px;">Clinical Advice:</p>
<div style="min-height:36px;border-bottom:1px solid #d1d5db;margin-bottom:20px;" contenteditable="true"></div>
<p style="font-weight:700;margin:10px 0 4px;">Signature</p>
<div style="min-height:36px;" contenteditable="true"></div>
</div>`,
                  },
                  {
                    id: "mri-knee", name: "MRI Knee", modality: "MRI", icon: "knee",
                    desc: "Knee joint, meniscus, ligaments",
                    html: `<div style="font-family:Arial,sans-serif;font-size:13px;line-height:1.7;color:#111827;padding:8px;">
<p style="text-align:center;font-style:italic;font-weight:700;font-size:14px;margin:0 0 10px;">ORGANIZATION NAME</p>
<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:12px;">
<tr><td style="font-weight:700;width:160px;padding:3px 0;">Age / Sex</td><td style="padding:3px 4px;">:</td><td style="border-bottom:1px dashed #999;min-width:160px;padding:3px 2px;" contenteditable="true"></td></tr>
<tr><td style="font-weight:700;padding:3px 0;">Case Id</td><td style="padding:3px 4px;">:</td><td style="border-bottom:1px dashed #999;padding:3px 2px;" contenteditable="true"></td></tr>
<tr><td style="font-weight:700;padding:3px 0;">Referring Doctor</td><td style="padding:3px 4px;">:</td><td style="border-bottom:1px dashed #999;padding:3px 2px;" contenteditable="true"></td></tr>
<tr><td style="font-weight:700;padding:3px 0;">Date &amp; Time</td><td style="padding:3px 4px;">:</td><td style="border-bottom:1px dashed #999;padding:3px 2px;" contenteditable="true"></td></tr>
<tr><td style="font-weight:700;padding:3px 0;">Investigation</td><td style="padding:3px 4px;">:</td><td style="border-bottom:1px dashed #999;padding:3px 2px;" contenteditable="true"></td></tr>
</table>
<p style="text-align:center;font-weight:700;text-decoration:underline;font-size:14px;margin:12px 0;" contenteditable="true">M.R.I OF KNEE JOINT</p>
<p style="font-weight:700;margin:10px 0 4px;">Clinical History:</p>
<div style="min-height:40px;border-bottom:1px solid #d1d5db;margin-bottom:10px;" contenteditable="true"></div>
<p style="font-weight:700;margin:10px 0 4px;">Sequences:</p>
<div style="min-height:32px;border-bottom:1px solid #d1d5db;margin-bottom:10px;" contenteditable="true">PD FS, T2W, T1W sequences in sagittal, coronal and axial planes.</div>
<p style="font-weight:700;margin:10px 0 4px;">Study reveals:</p>
<div style="min-height:140px;border-bottom:1px solid #d1d5db;margin-bottom:10px;" contenteditable="true"><p>Medial meniscus: </p><p>Lateral meniscus: </p><p>Anterior cruciate ligament (ACL): </p><p>Posterior cruciate ligament (PCL): </p><p>Medial collateral ligament (MCL): </p><p>Lateral collateral ligament (LCL): </p><p>Articular cartilage (femoral/tibial/patellar): </p><p>Joint effusion: </p><p>Baker's cyst: </p><p>Bony marrow signal: </p><p>Quadriceps/patellar tendons: </p></div>
<p style="font-weight:700;margin:10px 0 4px;">IMPRESSION:</p>
<div style="min-height:60px;border-bottom:1px solid #d1d5db;margin-bottom:10px;" contenteditable="true"></div>
<p style="font-weight:700;margin:10px 0 4px;">Clinical Advice:</p>
<div style="min-height:36px;border-bottom:1px solid #d1d5db;margin-bottom:20px;" contenteditable="true"></div>
<p style="font-weight:700;margin:10px 0 4px;">Signature</p>
<div style="min-height:36px;" contenteditable="true"></div>
</div>`,
                  },
                    // ── new MRI templates ────────────────────────────────────
                    {
                      id: "mri-breast", name: "MRI Breast", modality: "MRI", icon: "breast",
                      desc: "Bilateral breast MRI with DCE",
                      html: H + title("M.R.I OF BREAST") + s("Clinical History:") + s("Sequences:", "Axial T1W, T2W FS, DCE (pre + post-contrast) sequences.") + s("Study reveals:", "<p>Breast composition (fibroglandular tissue): </p><p>Background parenchymal enhancement: </p><p>Right breast (mass / NME / focus): </p><p>Left breast (mass / NME / focus): </p><p>Kinetic curve analysis: </p><p>Skin and nipple-areolar complex: </p><p>Chest wall and pectoral muscles: </p><p>Axillary lymph nodes (right / left): </p>") + F,
                    },
                    {
                      id: "mri-leg", name: "MRI Leg", modality: "MRI", icon: "leg",
                      desc: "Thigh, leg or ankle joint",
                      html: H + title("M.R.I OF LEG") + s("Clinical History:") + s("Sequences:", "T1W, T2W FS, STIR sequences in axial and coronal planes.") + s("Study reveals:", "<p>Muscles and soft tissues: </p><p>Bone marrow signal (femur / tibia / fibula): </p><p>Subcutaneous fat: </p><p>Vessels: </p><p>Tendons and ligaments: </p><p>Neurovascular bundle: </p><p>Joints included in FOV: </p>") + F,
                    },
                    {
                      id: "mri-cardiac", name: "MRI Cardiac", modality: "MRI", icon: "heart",
                      desc: "Cardiac structure and function",
                      html: H + title("CARDIAC MRI") + s("Clinical History:") + s("Sequences:", "Cine SSFP (4-chamber, 2-chamber, LVOT, RVOT, SAX stack); LGE T1 inversion recovery; T2 STIR; mapping sequences.") + s("Study reveals:", "<p>Left ventricle (size, wall thickness, EF%): </p><p>Right ventricle (size, function): </p><p>Left atrium: </p><p>Right atrium: </p><p>Valves (mitral / aortic / tricuspid / pulmonary): </p><p>Myocardial signal (T2 STIR): </p><p>Late gadolinium enhancement (LGE): </p><p>Pericardium: </p><p>Great vessels: </p>") + F,
                    },
                    {
                      id: "mri-shoulder", name: "MRI Shoulder", modality: "MRI", icon: "shoulder",
                      desc: "Rotator cuff, labrum, AC joint",
                      html: H + title("M.R.I OF SHOULDER JOINT") + s("Clinical History:") + s("Sequences:", "Coronal PD FS, T1W; Sagittal T2W FS; Axial PD FS sequences.") + s("Study reveals:", "<p>Rotator cuff (supraspinatus / infraspinatus / subscapularis / teres minor): </p><p>Subacromial space and bursa: </p><p>Biceps tendon (long head): </p><p>Glenohumeral joint (effusion, cartilage): </p><p>Glenoid labrum: </p><p>Acromioclavicular joint: </p><p>Bony marrow signal (humeral head / glenoid): </p><p>Neurovascular structures: </p>") + F,
                    },
                    {
                      id: "mri-abdomen", name: "MRI Abdomen", modality: "MRI", icon: "abdomen",
                      desc: "Upper abdomen, liver, pancreas, kidneys",
                      html: H + title("M.R.I OF ABDOMEN") + s("Clinical History:") + s("Sequences:", "T1W in-phase/out-of-phase, T2W FS, DWI, dynamic post-contrast (arterial/portal/delayed) sequences.") + s("Study reveals:", "<p>Liver (size, signal, focal lesions): </p><p>Gallbladder and biliary tree: </p><p>Spleen: </p><p>Pancreas (parenchyma / duct): </p><p>Right kidney: </p><p>Left kidney: </p><p>Adrenal glands: </p><p>Bowel loops: </p><p>Mesentery and peritoneum: </p><p>Lymph nodes: </p><p>Vasculature (aorta / IVC / portal vein): </p>") + F,
                    },
                    {
                      id: "mri-neck", name: "MRI Neck", modality: "MRI", icon: "neck",
                      desc: "Cervical soft tissues, lymph nodes",
                      html: H + title("M.R.I OF NECK") + s("Clinical History:") + s("Sequences:", "T1W, T2W FS, STIR in axial, coronal and sagittal planes; post-contrast T1W FS.") + s("Study reveals:", "<p>Thyroid gland: </p><p>Parathyroid region: </p><p>Lymph nodes (levels I–VI): </p><p>Salivary glands (parotid / submandibular / sublingual): </p><p>Pharynx and larynx: </p><p>Carotid and jugular vessels: </p><p>Cervical vertebrae and spinal canal: </p><p>Prevertebral / retropharyngeal space: </p><p>Muscles and deep fascial spaces: </p>") + F,
                    },
                    // ── CT templates ─────────────────────────────────────────
                    { type: "header", label: "CT" },
                    {
                      id: "ct-head", name: "CT Head", modality: "CT", icon: "brain",
                      desc: "Plain / contrast CT brain",
                      html: `<div style="font-family:Arial,sans-serif;font-size:13px;line-height:1.7;color:#111827;padding:8px;">
<p style="text-align:center;font-style:italic;font-weight:700;font-size:14px;margin:0 0 10px;">ORGANIZATION NAME</p>
<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:12px;">
<tr><td style="font-weight:700;width:160px;padding:3px 0;">Age / Sex</td><td style="padding:3px 4px;">:</td><td style="border-bottom:1px dashed #999;min-width:160px;padding:3px 2px;" contenteditable="true"></td></tr>
<tr><td style="font-weight:700;padding:3px 0;">Case Id</td><td style="padding:3px 4px;">:</td><td style="border-bottom:1px dashed #999;padding:3px 2px;" contenteditable="true"></td></tr>
<tr><td style="font-weight:700;padding:3px 0;">Referring Doctor</td><td style="padding:3px 4px;">:</td><td style="border-bottom:1px dashed #999;padding:3px 2px;" contenteditable="true"></td></tr>
<tr><td style="font-weight:700;padding:3px 0;">Date &amp; Time</td><td style="padding:3px 4px;">:</td><td style="border-bottom:1px dashed #999;padding:3px 2px;" contenteditable="true"></td></tr>
<tr><td style="font-weight:700;padding:3px 0;">Investigation</td><td style="padding:3px 4px;">:</td><td style="border-bottom:1px dashed #999;padding:3px 2px;" contenteditable="true"></td></tr>
</table>
<p style="text-align:center;font-weight:700;text-decoration:underline;font-size:14px;margin:12px 0;" contenteditable="true">C.T. OF BRAIN</p>
<p style="font-weight:700;margin:10px 0 4px;">Clinical History:</p>
<div style="min-height:40px;border-bottom:1px solid #d1d5db;margin-bottom:10px;" contenteditable="true"></div>
<p style="font-weight:700;margin:10px 0 4px;">Technique:</p>
<div style="min-height:32px;border-bottom:1px solid #d1d5db;margin-bottom:10px;" contenteditable="true">Axial CT sections of the brain were obtained without intravenous contrast.</div>
<p style="font-weight:700;margin:10px 0 4px;">Study reveals:</p>
<div style="min-height:120px;border-bottom:1px solid #d1d5db;margin-bottom:10px;" contenteditable="true"><p>Brain parenchyma: </p><p>Grey-white matter differentiation: </p><p>Hypodense / hyperdense lesions: </p><p>Ventricles: </p><p>Midline shift: </p><p>Sulci and cisterns: </p><p>Cerebellum and brainstem: </p><p>Bony calvarium: </p><p>Paranasal sinuses and mastoids: </p></div>
<p style="font-weight:700;margin:10px 0 4px;">IMPRESSION:</p>
<div style="min-height:60px;border-bottom:1px solid #d1d5db;margin-bottom:10px;" contenteditable="true"></div>
<p style="font-weight:700;margin:10px 0 4px;">Clinical Advice:</p>
<div style="min-height:36px;border-bottom:1px solid #d1d5db;margin-bottom:20px;" contenteditable="true"></div>
<p style="font-weight:700;margin:10px 0 4px;">Signature</p>
<div style="min-height:36px;" contenteditable="true"></div>
</div>`,
                    },
                    {
                      id: "ct-chest-abdomen", name: "CT Chest/Abdomen", modality: "CT", icon: "lungs",
                      desc: "Thorax, abdomen and pelvis",
                      html: `<div style="font-family:Arial,sans-serif;font-size:13px;line-height:1.7;color:#111827;padding:8px;">
<p style="text-align:center;font-style:italic;font-weight:700;font-size:14px;margin:0 0 10px;">ORGANIZATION NAME</p>
<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:12px;">
<tr><td style="font-weight:700;width:160px;padding:3px 0;">Age / Sex</td><td style="padding:3px 4px;">:</td><td style="border-bottom:1px dashed #999;min-width:160px;padding:3px 2px;" contenteditable="true"></td></tr>
<tr><td style="font-weight:700;padding:3px 0;">Case Id</td><td style="padding:3px 4px;">:</td><td style="border-bottom:1px dashed #999;padding:3px 2px;" contenteditable="true"></td></tr>
<tr><td style="font-weight:700;padding:3px 0;">Referring Doctor</td><td style="padding:3px 4px;">:</td><td style="border-bottom:1px dashed #999;padding:3px 2px;" contenteditable="true"></td></tr>
<tr><td style="font-weight:700;padding:3px 0;">Date &amp; Time</td><td style="padding:3px 4px;">:</td><td style="border-bottom:1px dashed #999;padding:3px 2px;" contenteditable="true"></td></tr>
<tr><td style="font-weight:700;padding:3px 0;">Investigation</td><td style="padding:3px 4px;">:</td><td style="border-bottom:1px dashed #999;padding:3px 2px;" contenteditable="true"></td></tr>
</table>
<p style="text-align:center;font-weight:700;text-decoration:underline;font-size:14px;margin:12px 0;" contenteditable="true">C.T. CHEST &amp; ABDOMEN</p>
<p style="font-weight:700;margin:10px 0 4px;">Clinical History:</p>
<div style="min-height:40px;border-bottom:1px solid #d1d5db;margin-bottom:10px;" contenteditable="true"></div>
<p style="font-weight:700;margin:10px 0 4px;">Technique:</p>
<div style="min-height:32px;border-bottom:1px solid #d1d5db;margin-bottom:10px;" contenteditable="true">Axial CT sections with coronal and sagittal reconstructions.</div>
<p style="font-weight:700;margin:10px 0 4px;">Study reveals:</p>
<div style="min-height:160px;border-bottom:1px solid #d1d5db;margin-bottom:10px;" contenteditable="true"><p><strong>CHEST:</strong></p><p>Lungs and pleura: </p><p>Mediastinum and hila: </p><p>Heart and pericardium: </p><p>Chest wall and bony thorax: </p><p><br/></p><p><strong>ABDOMEN:</strong></p><p>Liver: </p><p>Gallbladder and biliary system: </p><p>Spleen: </p><p>Pancreas: </p><p>Kidneys and adrenals: </p><p>Bowel loops: </p><p>Lymph nodes: </p><p>Peritoneum and ascites: </p></div>
<p style="font-weight:700;margin:10px 0 4px;">IMPRESSION:</p>
<div style="min-height:60px;border-bottom:1px solid #d1d5db;margin-bottom:10px;" contenteditable="true"></div>
<p style="font-weight:700;margin:10px 0 4px;">Clinical Advice:</p>
<div style="min-height:36px;border-bottom:1px solid #d1d5db;margin-bottom:20px;" contenteditable="true"></div>
<p style="font-weight:700;margin:10px 0 4px;">Signature</p>
<div style="min-height:36px;" contenteditable="true"></div>
</div>`,
                    },
                    {
                      id: "ct-pelvis", name: "CT Pelvis", modality: "CT", icon: "bone",
                      desc: "Pelvic organs, bones and vessels",
                      html: H + title("C.T. OF PELVIS") + s("Clinical History:") + s("Technique:", "Axial CT sections with coronal and sagittal reconstructions; oral and IV contrast administered.") + s("Study reveals:", "<p>Urinary bladder: </p><p>Prostate / Uterus and cervix: </p><p>Rectum and sigmoid colon: </p><p>Iliac vessels: </p><p>Inguinal and pelvic lymph nodes: </p><p>Bony pelvis (ilium / ischium / pubis / sacrum): </p><p>Hip joints (in FOV): </p><p>Pelvic floor muscles: </p><p>Free fluid / ascites: </p>") + F,
                    },
                    {
                      id: "ct-neck", name: "CT Neck", modality: "CT", icon: "neck",
                      desc: "Cervical soft tissues and vessels",
                      html: H + title("C.T. OF NECK") + s("Clinical History:") + s("Technique:", "Axial CT sections from skull base to thoracic inlet with IV contrast; coronal and sagittal reconstructions.") + s("Study reveals:", "<p>Thyroid gland: </p><p>Lymph nodes (levels I–VI, retropharyngeal): </p><p>Pharynx and larynx: </p><p>Salivary glands: </p><p>Carotid arteries and jugular veins: </p><p>Cervical vertebrae: </p><p>Prevertebral space: </p><p>Trachea and oesophagus: </p>") + F,
                    },
                    {
                      id: "ct-brain", name: "CT Head/Brain", modality: "CT", icon: "brain",
                      desc: "Plain + contrast brain protocol",
                      html: H + title("C.T. OF HEAD / BRAIN") + s("Clinical History:") + s("Technique:", "Pre- and post-contrast axial CT sections of the brain with bone and soft tissue windows.") + s("Study reveals:", "<p>Brain parenchyma (plain): </p><p>Grey-white differentiation: </p><p>Haemorrhage / infarct / oedema: </p><p>Post-contrast enhancement pattern: </p><p>Ventricles and CSF spaces: </p><p>Midline: </p><p>Cerebellum and brainstem: </p><p>Bony calvarium (bone window): </p><p>Orbits: </p><p>Paranasal sinuses and mastoids: </p>") + F,
                    },
                    {
                      id: "ct-spine", name: "CT Spine", modality: "CT", icon: "spine",
                      desc: "Cervical / Thoracic / Lumbar spine",
                      html: H + title("C.T. OF SPINE") + s("Clinical History:") + s("Technique:", "Axial CT sections with sagittal and coronal reconstructions.") + s("Study reveals:", "<p>Vertebral alignment: </p><p>Vertebral body height and density: </p><p>Fracture / lytic / sclerotic lesions: </p><p>Disc spaces: </p><p>Spinal canal diameter: </p><p>Neural foramina: </p><p>Facet joints: </p><p>Paraspinal soft tissues: </p>") + F,
                    },
                    // ── X-Ray templates ───────────────────────────────────────
                    { type: "header", label: "X-RAY" },
                    {
                      id: "xray-chest", name: "X-Ray Chest", modality: "XR", icon: "lungs",
                      desc: "PA / AP chest radiograph",
                      html: `<div style="font-family:Arial,sans-serif;font-size:13px;line-height:1.7;color:#111827;padding:8px;">
<p style="text-align:center;font-style:italic;font-weight:700;font-size:14px;margin:0 0 10px;">ORGANIZATION NAME</p>
<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:12px;">
<tr><td style="font-weight:700;width:160px;padding:3px 0;">Age / Sex</td><td style="padding:3px 4px;">:</td><td style="border-bottom:1px dashed #999;min-width:160px;padding:3px 2px;" contenteditable="true"></td></tr>
<tr><td style="font-weight:700;padding:3px 0;">Case Id</td><td style="padding:3px 4px;">:</td><td style="border-bottom:1px dashed #999;padding:3px 2px;" contenteditable="true"></td></tr>
<tr><td style="font-weight:700;padding:3px 0;">Referring Doctor</td><td style="padding:3px 4px;">:</td><td style="border-bottom:1px dashed #999;padding:3px 2px;" contenteditable="true"></td></tr>
<tr><td style="font-weight:700;padding:3px 0;">Date &amp; Time</td><td style="padding:3px 4px;">:</td><td style="border-bottom:1px dashed #999;padding:3px 2px;" contenteditable="true"></td></tr>
<tr><td style="font-weight:700;padding:3px 0;">Investigation</td><td style="padding:3px 4px;">:</td><td style="border-bottom:1px dashed #999;padding:3px 2px;" contenteditable="true"></td></tr>
</table>
<p style="text-align:center;font-weight:700;text-decoration:underline;font-size:14px;margin:12px 0;" contenteditable="true">X-RAY CHEST PA VIEW</p>
<p style="font-weight:700;margin:10px 0 4px;">Clinical History:</p>
<div style="min-height:40px;border-bottom:1px solid #d1d5db;margin-bottom:10px;" contenteditable="true"></div>
<p style="font-weight:700;margin:10px 0 4px;">Study reveals:</p>
<div style="min-height:120px;border-bottom:1px solid #d1d5db;margin-bottom:10px;" contenteditable="true"><p>Trachea and carina: </p><p>Lung fields (right / left): </p><p>Hilar shadows: </p><p>Costophrenic angles: </p><p>Diaphragm: </p><p>Cardiac size and contour (CTR): </p><p>Mediastinum: </p><p>Bony thorax: </p><p>Soft tissues: </p></div>
<p style="font-weight:700;margin:10px 0 4px;">IMPRESSION:</p>
<div style="min-height:60px;border-bottom:1px solid #d1d5db;margin-bottom:10px;" contenteditable="true"></div>
<p style="font-weight:700;margin:10px 0 4px;">Clinical Advice:</p>
<div style="min-height:36px;border-bottom:1px solid #d1d5db;margin-bottom:20px;" contenteditable="true"></div>
<p style="font-weight:700;margin:10px 0 4px;">Signature</p>
<div style="min-height:36px;" contenteditable="true"></div>
</div>`,
                    },
                    {
                      id: "xray-abdomen", name: "X-Ray Abdomen", modality: "XR", icon: "abdomen",
                      desc: "Erect and supine abdomen",
                      html: H + title("X-RAY ABDOMEN") + s("Clinical History:") + s("Study reveals:", "<p>Gas pattern (small bowel / large bowel): </p><p>Air-fluid levels: </p><p>Free gas under diaphragm: </p><p>Psoas shadows: </p><p>Renal outlines: </p><p>Calcifications (renal / biliary / vascular): </p><p>Bony structures (vertebrae / pelvis): </p><p>Soft tissue shadows: </p>") + F,
                    },
                    {
                      id: "xray-spine", name: "X-Ray Spine", modality: "XR", icon: "spine",
                      desc: "Cervical / Thoracic / Lumbar spine",
                      html: H + title("X-RAY SPINE") + s("Clinical History:") + s("Study reveals:", "<p>Vertebral alignment (AP and lateral): </p><p>Vertebral body height and density: </p><p>Disc spaces: </p><p>Posterior elements (pedicles / laminae / spinous processes): </p><p>Foramina: </p><p>Sacroiliac joints (if lumbar): </p><p>Prevertebral soft tissues: </p>") + F,
                    },
                    {
                      id: "xray-pelvis", name: "X-Ray Pelvis", modality: "XR", icon: "bone",
                      desc: "AP pelvis and hip joints",
                      html: H + title("X-RAY PELVIS AP VIEW") + s("Clinical History:") + s("Study reveals:", "<p>Pelvic ring (ilium / ischium / pubis / sacrum): </p><p>Symphysis pubis: </p><p>Sacroiliac joints: </p><p>Hip joints (right / left): </p><p>Femoral heads and necks: </p><p>Acetabuli: </p><p>Soft tissue shadows: </p>") + F,
                    },
                    {
                      id: "xray-knee", name: "X-Ray Knee", modality: "XR", icon: "knee",
                      desc: "AP, lateral and skyline views",
                      html: H + title("X-RAY KNEE JOINT") + s("Clinical History:") + s("Study reveals:", "<p>Alignment (varus / valgus): </p><p>Joint spaces (medial / lateral / patellofemoral): </p><p>Femoral condyles: </p><p>Tibial plateaux: </p><p>Patella (position, density): </p><p>Tibial tuberosity: </p><p>Osteophytes: </p><p>Soft tissue calcifications: </p><p>Periarticular soft tissues: </p>") + F,
                    },
                    {
                      id: "xray-shoulder", name: "X-Ray Shoulder", modality: "XR", icon: "shoulder",
                      desc: "AP and axillary shoulder views",
                      html: H + title("X-RAY SHOULDER JOINT") + s("Clinical History:") + s("Study reveals:", "<p>Glenohumeral joint (alignment, joint space): </p><p>Humeral head (density, contour): </p><p>Glenoid: </p><p>Acromioclavicular joint: </p><p>Acromion morphology: </p><p>Coracoid: </p><p>Subacromial space: </p><p>Soft tissue calcifications: </p><p>Periarticular soft tissues: </p>") + F,
                    },
                    // ── Mammography ───────────────────────────────────────────
                    { type: "header", label: "MAMMOGRAPHY" },
                    {
                      id: "mammography", name: "Mammography", modality: "MG", icon: "breast",
                      desc: "Bilateral / unilateral breast imaging",
                      html: `<div style="font-family:Arial,sans-serif;font-size:13px;line-height:1.7;color:#111827;padding:8px;">
<p style="text-align:center;font-style:italic;font-weight:700;font-size:14px;margin:0 0 10px;">ORGANIZATION NAME</p>
<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:12px;">
<tr><td style="font-weight:700;width:160px;padding:3px 0;">Age / Sex</td><td style="padding:3px 4px;">:</td><td style="border-bottom:1px dashed #999;min-width:160px;padding:3px 2px;" contenteditable="true"></td></tr>
<tr><td style="font-weight:700;padding:3px 0;">Case Id</td><td style="padding:3px 4px;">:</td><td style="border-bottom:1px dashed #999;padding:3px 2px;" contenteditable="true"></td></tr>
<tr><td style="font-weight:700;padding:3px 0;">Referring Doctor</td><td style="padding:3px 4px;">:</td><td style="border-bottom:1px dashed #999;padding:3px 2px;" contenteditable="true"></td></tr>
<tr><td style="font-weight:700;padding:3px 0;">Date &amp; Time</td><td style="padding:3px 4px;">:</td><td style="border-bottom:1px dashed #999;padding:3px 2px;" contenteditable="true"></td></tr>
<tr><td style="font-weight:700;padding:3px 0;">Investigation</td><td style="padding:3px 4px;">:</td><td style="border-bottom:1px dashed #999;padding:3px 2px;" contenteditable="true"></td></tr>
</table>
<p style="text-align:center;font-weight:700;text-decoration:underline;font-size:14px;margin:12px 0;" contenteditable="true">MAMMOGRAPHY</p>
<p style="font-weight:700;margin:10px 0 4px;">Clinical History:</p>
<div style="min-height:40px;border-bottom:1px solid #d1d5db;margin-bottom:10px;" contenteditable="true"></div>
<p style="font-weight:700;margin:10px 0 4px;">Technique:</p>
<div style="min-height:32px;border-bottom:1px solid #d1d5db;margin-bottom:10px;" contenteditable="true">Bilateral CC and MLO views obtained.</div>
<p style="font-weight:700;margin:10px 0 4px;">Study reveals:</p>
<div style="min-height:130px;border-bottom:1px solid #d1d5db;margin-bottom:10px;" contenteditable="true"><p>Breast composition (ACR density): </p><p>Right breast: </p><p>&nbsp;&nbsp;Masses: </p><p>&nbsp;&nbsp;Calcifications: </p><p>&nbsp;&nbsp;Architectural distortion: </p><p>&nbsp;&nbsp;Asymmetries: </p><p>Left breast: </p><p>&nbsp;&nbsp;Masses: </p><p>&nbsp;&nbsp;Calcifications: </p><p>&nbsp;&nbsp;Architectural distortion: </p><p>&nbsp;&nbsp;Asymmetries: </p><p>Axillary lymph nodes: </p></div>
<p style="font-weight:700;margin:10px 0 4px;">IMPRESSION:</p>
<div style="min-height:32px;border-bottom:1px solid #d1d5db;margin-bottom:4px;" contenteditable="true"></div>
<p style="font-weight:700;margin:4px 0;">BI-RADS Category: <span contenteditable="true" style="font-weight:400;border-bottom:1px dashed #999;min-width:60px;display:inline-block;"></span></p>
<p style="font-weight:700;margin:10px 0 4px;">Clinical Advice:</p>
<div style="min-height:36px;border-bottom:1px solid #d1d5db;margin-bottom:20px;" contenteditable="true"></div>
<p style="font-weight:700;margin:10px 0 4px;">Signature</p>
<div style="min-height:36px;" contenteditable="true"></div>
</div>`,
                    },
                    // ── General ───────────────────────────────────────────────
                  ];

                  return TEMPLATES.map((tpl) => tpl.type === "header" ? (
                    <div
                      key={tpl.label}
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        color: "#9ca3af",
                        padding: "6px 2px 2px",
                        borderBottom: "1px solid #f3f4f6",
                        marginTop: 4,
                      }}
                    >
                      {tpl.label}
                    </div>
                  ) : (
                  <div
                    key={tpl.id}
                    onClick={() => {
                      const editor = reportEditorRef?.current;
                      if (!editor) return;
                      // Apply directly. We intentionally do NOT use a native
                      // window.confirm() here — a native dialog forces the
                      // browser out of fullscreen. The panel already warns that
                      // existing content will be replaced.
                      editor.innerHTML = tpl.html;
                      setTemplateRegion(regionForTemplate(tpl));
                      setHasUnsavedChanges(true);
                      setShowTemplates(false);
                    }}
                    style={{
                      border: "1px solid #e5e7eb",
                      borderRadius: 8,
                      padding: "10px 12px",
                      cursor: "pointer",
                      background: "#fafafa",
                      transition: "background 0.15s, border-color 0.15s",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#f3f0ff";
                      e.currentTarget.style.borderColor = "#7c3aed";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "#fafafa";
                      e.currentTarget.style.borderColor = "#e5e7eb";
                    }}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, width: 44, height: 44, borderRadius: 10, background: "#dbeafe", color: "#1c4e80" }}>{(TPL_ICON[tpl.icon] || TPL_ICON.scan)()}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{tpl.name}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, background: "#ede9fe", color: "#7c3aed", borderRadius: 4, padding: "1px 6px" }}>{tpl.modality}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{tpl.desc}</div>
                    </div>
                  </div>
                  ))
                })()}
              </div>
            </div>
          )}

          {showCloseConfirm && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(0,0,0,0.55)",
                zIndex: 40,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "Segoe UI, -apple-system, BlinkMacSystemFont, sans-serif",
              }}
              onClick={() => !saveBusy && setShowCloseConfirm(false)}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: 320,
                  background: "#ffffff",
                  color: "#1f2937",
                  borderRadius: 10,
                  boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
                  padding: "18px 18px 14px",
                }}
              >
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
                  Save the changes?
                </div>
                <div style={{ fontSize: 13, color: "#4b5563", marginBottom: 14 }}>
                  Would you like to save a version before closing?
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <CButton
                    color="light"
                    size="sm"
                    disabled={saveBusy}
                    onClick={() => {
                      setShowCloseConfirm(false);
                      setShowReport(false);
                    }}
                  >
                    No
                  </CButton>
                  <CButton
                    color="primary"
                    size="sm"
                    disabled={saveBusy}
                    onClick={async () => {
                      setSaveBusy(true);
                      try {
                        // Snapshot the editor HTML so the parent's mirror
                        // matches what we're about to persist (prevents the
                        // overlay from re-applying a stale version on reopen).
                        const snapshotHtml = reportEditorRef?.current?.innerHTML || "";
                        if (snapshotHtml.trim() && typeof setLatestReportVersionHtml === "function") {
                          setLatestReportVersionHtml(snapshotHtml);
                        }
                        // Save writes ONLY to radiology_schema.report_versions
                        // (one row per Save). radiology_schema.reports stays
                        // untouched — the ai_* columns there are written only
                        // by the AI generate auto-save and read by the next
                        // "Generate AI Report" click.
                        await saveReportVersion("Saved on close");
                      } finally {
                        setSaveBusy(false);
                        setShowCloseConfirm(false);
                        setShowReport(false);
                      }
                    }}
                  >
                    {saveBusy ? "Saving…" : "Yes"}
                  </CButton>
                </div>
              </div>
            </div>
          )}

          <div
            style={{
              display: qcStage === "idle" ? "flex" : "none",
              alignItems: "center",
              gap: 6,
              padding: 6,
              borderBottom: "1px solid #b3b3b3",
              background: "#bfbfbf",
            }}
          >
            <button onClick={() => execCmd("undo")} style={{ background: "transparent", border: "none", fontSize: 12 }}>↶</button>
            <button onClick={() => execCmd("redo")} style={{ background: "transparent", border: "none", fontSize: 12 }}>↷</button>
            <div style={{ width: 1, height: 18, background: "#bdbdbd" }} />
            <button onClick={() => execCmd("bold")} style={{ background: "transparent", border: "none", fontWeight: "bold" }}>B</button>
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
            <button
              onClick={() => toggleMic("report")}
              disabled={!micSupported}
              title={!micSupported ? "Mic not supported in this browser" : activeMicTarget === "report" ? "Stop voice input" : "Start voice input"}
              style={{
                background: activeMicTarget === "report" ? "#991b1b" : "#111827",
                color: "#fff",
                border: "none",
                borderRadius: 4,
                width: 26,
                height: 26,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: micSupported ? "pointer" : "not-allowed",
                opacity: micSupported ? 1 : 0.6,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/>
                <path d="M19 11a7 7 0 0 1-14 0H3a9 9 0 0 0 8 8.94V22h2v-2.06A9 9 0 0 0 21 11h-2z"/>
              </svg>
            </button>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
              <button
                onClick={async () => {
                  setSaveBusy(true);
                  try {
                    // Snapshot the editor HTML so the parent's "latest version"
                    // mirror matches what we're about to persist.
                    const snapshotHtml = reportEditorRef?.current?.innerHTML || "";
                    if (snapshotHtml.trim() && typeof setLatestReportVersionHtml === "function") {
                      setLatestReportVersionHtml(snapshotHtml);
                    }
                    // Save writes ONLY to radiology_schema.report_versions
                    // (one row per Save). radiology_schema.reports stays
                    // untouched — the ai_* columns there are written only
                    // by the AI generate auto-save and read by the next
                    // "Generate AI Report" click.
                    await saveReportVersion("Saved");
                  } finally {
                    setSaveBusy(false);
                  }
                }}
                disabled={saveBusy}
                title="Save a version snapshot"
                style={{
                  background: "#16a34a",
                  color: "#fff",
                  border: "none",
                  borderRadius: 4,
                  padding: "2px 10px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: saveBusy ? "default" : "pointer",
                  opacity: saveBusy ? 0.7 : 1,
                }}
              >
                {saveBusy ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => {
                  setShowTemplates((v) => !v);
                  setShowHistory(false);
                }}
                title="Report templates"
                style={{
                  background: "#7c3aed",
                  color: "#fff",
                  border: "none",
                  borderRadius: 4,
                  padding: "2px 10px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Templates
              </button>
              <button
                onClick={() => {
                  if (!showHistory) fetchReportVersions();
                  setShowHistory((v) => !v);
                  setShowTemplates(false);
                }}
                title="Version history"
                style={{
                  background: "#2563eb",
                  color: "#fff",
                  border: "none",
                  borderRadius: 4,
                  padding: "2px 10px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                History
              </button>
            </div>
          </div>

          <div style={{ background: "#ffffff", color: "#111827", position: "relative", display: "flex", flexDirection: "column", minHeight: 0 }}>
            {/* Scrolling report content — only this scrolls; the AI bar below stays put. */}
            <div style={{ flex: 1, overflow: "auto", minHeight: 0, padding: 10 }}>
            <div style={{ position: "relative", minHeight: 360 }}>
              <div
                ref={reportEditorRef}
                style={{
                  minHeight: "100%",
                  outline: "none",
                  whiteSpace: "normal",
                  fontSize: 13,
                  lineHeight: 1.5,
                  display: qcStage === "idle" ? "block" : "none",
                }}
              />
            </div>

            {qcStage === "running" && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 16,
                  padding: 40,
                  minHeight: 360,
                  color: "#1f2937",
                }}
              >
                <style>{`
                  @keyframes onixQcSpin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                `}</style>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    border: "4px solid #e5e7eb",
                    borderTopColor: "#1d4ed8",
                    borderRadius: "50%",
                    animation: "onixQcSpin 0.9s linear infinite",
                  }}
                />
                <div style={{ fontSize: 15, fontWeight: 600, color: "#1f2937" }}>
                  Running QC checks…
                </div>
                <div style={{ fontSize: 12, color: "#6b7280", textAlign: "center", maxWidth: 320 }}>
                  Validating sections, formatting, and required fields. This usually takes a few seconds.
                </div>
              </div>
            )}

            {qcStage === "passed" && (
              <div style={{ padding: 20, fontSize: 12, color: "#6b7280", textAlign: "center" }}>
                Report preview opened in a separate window.
                {qcResult?.warnings > 0 && (
                  <div style={{ marginTop: 12, color: "#92400e" }}>
                    QC passed with {qcResult.warnings} warning{qcResult.warnings === 1 ? "" : "s"} —
                    review them in the preview window before marking complete.
                  </div>
                )}
              </div>
            )}

            {qcStage === "failed" && (
              <div style={{ padding: 20, minHeight: 360 }}>
                <div
                  style={{
                    padding: "10px 12px",
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    borderRadius: 8,
                    color: "#991b1b",
                    fontWeight: 600,
                    fontSize: 13,
                    marginBottom: 14,
                  }}
                >
                  ✕ QC failed — fix the issues below and re-submit.
                  {qcResult && (
                    <div style={{ fontWeight: 400, fontSize: 12, marginTop: 4 }}>
                      {qcResult.errors} error{qcResult.errors === 1 ? "" : "s"} ·{" "}
                      {qcResult.warnings} warning{qcResult.warnings === 1 ? "" : "s"} ·{" "}
                      {qcResult.passed}/{qcResult.total} passed
                    </div>
                  )}
                </div>

                {qcResult?._network_error && (
                  <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
                    {qcResult._network_error}
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {(qcResult?.checks || [])
                    .filter((c) => !c.passed && (c.severity === "error" || c.severity === "warning"))
                    .map((c, i) => {
                      const isErr = c.severity === "error";
                      return (
                        <div
                          key={i}
                          style={{
                            padding: "8px 10px",
                            borderRadius: 6,
                            background: isErr ? "#fef2f2" : "#fffbeb",
                            border: `1px solid ${isErr ? "#fecaca" : "#fde68a"}`,
                            fontSize: 12,
                            color: isErr ? "#991b1b" : "#92400e",
                          }}
                        >
                          <div style={{ fontWeight: 600 }}>
                            {isErr ? "✕" : "⚠"} {c.check}
                          </div>
                          <div style={{ marginTop: 2, opacity: 0.85 }}>{c.detail}</div>
                        </div>
                      );
                    })}
                </div>

                <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
                  <CButton color="primary" size="sm" onClick={cancelQcPreview}>
                    Back to editor
                  </CButton>
                </div>
              </div>
            )}
            </div>
            {/* AI editor bar — pinned at the bottom; only the report above scrolls. */}
            {qcStage === "idle" && typeof editReportWithCommand === "function" && (
              <ReportEditAiBar
                editReportWithCommand={editReportWithCommand}
                phase={editPhase}
                setPhase={setEditPhase}
                setCurrentInstruction={setEditInstruction}
                reportEditorRef={reportEditorRef}
              />
            )}
          </div>
        </div>
      ) : (
        <div style={{ border: "1px solid #2b2b2b", borderRadius: 12, background: "#0b0b0b", color: "#e5e7eb", overflow: "hidden", display: "grid", gridTemplateRows: "auto 1fr" }}>
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
                  ["Case ID", displayCaseId],
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
                  ["History", history || "—"],
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

                                          const annotationId = a.annotation_id;
                                          const isLocal = !annotationId || String(annotationId).startsWith("local_");

                                          // Optimistic remove
                                          setDbAnnotations((prev) =>
                                            (prev || []).filter((x) => x.annotation_id !== annotationId)
                                          );

                                          if (annUid) {
                                            try {
                                              deleteCornerstoneAnnotationByUid?.(annUid, meta?.slot ?? 0);
                                            } catch (removeErr) {
                                              console.error("Delete linked cornerstone annotation failed", removeErr);
                                            }
                                          }

                                          if (editingDbAnnotationId === annotationId) {
                                            setEditingDbAnnotationId(null);
                                            setEditingDbAnnotationComment("");
                                          }

                                          if (!isLocal && backendUrl) {
                                            try {
                                              const res = await fetch(
                                                `${backendUrl}/radiology/annotations/${encodeURIComponent(annotationId)}`,
                                                { method: "DELETE" }
                                              );
                                              const json = await res.json().catch(() => ({}));
                                              if (!res.ok || !json?.success) {
                                                console.error("Delete annotation backend failed", json);
                                              }
                                            } catch (err) {
                                              console.error("Delete annotation request error", err);
                                            }
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
                                      let authToken = null;
                                      try {
                                        authToken = (JSON.parse(localStorage.getItem("auth") || "{}")).token || null;
                                      } catch { authToken = null; }
                                      if (!authToken) {
                                        setOnixMessages((m) => [...m, { role: "ai", text: "Error: not signed in. Please log in again to use AI chat." }]);
                                      } else {
                                        const res = await fetch("/api/radiology/ai/analyze", {
                                          method: "POST",
                                          headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
                                          body: JSON.stringify({ image_base64: imageB64, prompt, model: "llava" }),
                                        });
                                        const data = await res.json();
                                        if (data.success) setOnixMessages((m) => [...m, { role: "ai", text: data.response }]);
                                        else setOnixMessages((m) => [...m, { role: "ai", text: "Analysis failed" }]);
                                      }
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
                                    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                                  }}
                                >
                                  <img
                                    src={onixIcon}
                                    alt="Onix"
                                    style={{ width: 14, height: 14, borderRadius: 999, objectFit: "contain", display: "block" }}
                                  />
                                  <span>Ask Onix AI</span>
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
                  {onixMessages.length === 0 && !onixLoading && (
                    <div
                      style={{
                        minHeight: 240,
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 18,
                        textAlign: "center",
                        padding: "28px 16px",
                      }}
                    >
                      <img
                        src={onixIcon}
                        alt="Onix"
                        style={{
                          width: 92,
                          height: 92,
                          objectFit: "contain",
                          display: "block",
                          filter: "drop-shadow(0 10px 28px rgba(96,165,250,0.16))",
                        }}
                      />
                      <div
                        style={{
                          fontFamily: '"Palatino Linotype", "Book Antiqua", Georgia, "Times New Roman", serif',
                          fontSize: 16,
                          fontWeight: 500,
                          letterSpacing: "0.03em",
                          lineHeight: 1.4,
                          color: "#dbeafe",
                          textAlign: "center",
                          maxWidth: 280,
                        }}
                      >
                        How can I help you today?
                      </div>

                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 10,
                          width: "100%",
                          maxWidth: 300,
                          marginTop: 8,
                        }}
                      >
                        {[
                          { icon: "💡", text: "What can you do?" },
                          { icon: "🔬", text: "Analyse this image" },
                          { icon: "📝", text: "Describe what you see" },
                        ].map((chip, i) => (
                          <button
                            key={i}
                            onClick={() => sendOnix(chip.text)}
                            disabled={onixLoading}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 12,
                              padding: "11px 14px",
                              borderRadius: 12,
                              border: "1px solid rgba(96,165,250,0.25)",
                              background: "rgba(13,33,55,0.7)",
                              color: "#dbeafe",
                              fontSize: 14,
                              fontWeight: 500,
                              cursor: onixLoading ? "not-allowed" : "pointer",
                              textAlign: "left",
                              transition: "background 0.15s ease, border-color 0.15s ease, transform 0.1s ease",
                              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                            }}
                            onMouseEnter={(e) => {
                              if (!onixLoading) {
                                e.currentTarget.style.background = "rgba(29,78,216,0.35)";
                                e.currentTarget.style.borderColor = "rgba(96,165,250,0.55)";
                                e.currentTarget.style.transform = "translateY(-1px)";
                              }
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "rgba(13,33,55,0.7)";
                              e.currentTarget.style.borderColor = "rgba(96,165,250,0.25)";
                              e.currentTarget.style.transform = "translateY(0)";
                            }}
                          >
                            <span style={{ fontSize: 18 }}>{chip.icon}</span>
                            <span>{chip.text}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
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
                        {activeOnixLoadingText}
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
                                  Recording...
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
                                title={dictateRecording ? "Stop recording" : "Start recording"}
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
                                  Recording...
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
                                title={dictateRecording ? "Stop recording" : "Start recording"}
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
                    placeholder={markAndAskActive ? "Ask ONIX AI about the marked region..." : "Ask ONIX AI"}
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
                              Region Segmentation
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
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
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
                    onClick={async () => {
                      let imageUrl = null;
                      let imageB64 = "";
                      try {
                        const canvas = document.querySelector("canvas");
                        if (canvas) {
                          imageUrl = canvas.toDataURL("image/png");
                          imageB64 = imageUrl.split(",")[1] || "";
                        }
                      } catch {}

                      closeAnnotationSaveDialog();
                      setRightTab("onix");

                      const title = (annDraftTitle || "").trim();
                      const comment = (annDraftComment || "").trim();
                      const prompt = `Analyze this ${annSaveDialog.type || "annotated"} region.${title ? " Title: " + title + "." : ""}${comment ? " Notes: " + comment + "." : ""} What do you observe?`;

                      if (typeof setOnixMessages === "function") {
                        setOnixMessages((m) => [...m, { role: "user", text: prompt, image: imageUrl }]);
                      }
                      if (typeof setOnixLoading === "function") setOnixLoading(true);
                      try {
                        let authToken = null;
                        try {
                          authToken = (JSON.parse(localStorage.getItem("auth") || "{}")).token || null;
                        } catch { authToken = null; }
                        if (!authToken) {
                          setOnixMessages((m) => [...m, { role: "ai", text: "Error: not signed in. Please log in again to use AI chat." }]);
                        } else {
                          const res = await fetch("/api/radiology/ai/analyze", {
                            method: "POST",
                            headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
                            body: JSON.stringify({ image_base64: imageB64, prompt, model: "llava" }),
                          });
                          const data = await res.json();
                          if (data.success) setOnixMessages((m) => [...m, { role: "ai", text: data.response }]);
                          else setOnixMessages((m) => [...m, { role: "ai", text: "Analysis failed" }]);
                        }
                      } catch (err) {
                        setOnixMessages((m) => [...m, { role: "ai", text: "Network error: " + err.message }]);
                      }
                      if (typeof setOnixLoading === "function") setOnixLoading(false);
                    }}
                    style={{
                      background: "#7c3aed",
                      color: "#e5e7eb",
                      border: "1px solid #6d28d9",
                      borderRadius: 6,
                      padding: "6px 10px",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <img
                      src={onixIcon}
                      alt="Onix"
                      style={{ width: 14, height: 14, borderRadius: 999, objectFit: "contain", display: "block" }}
                    />
                    <span>Ask Onix AI</span>
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
