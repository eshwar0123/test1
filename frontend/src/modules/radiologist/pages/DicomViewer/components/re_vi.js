import React, { useEffect, useRef, useState } from "react";
import { CButton } from "@coreui/react";
import { BACKEND_URL } from "../utils/constants";
import onixIcon from "/icon.png";
import ReportRewriteOverlay from "./ReportRewriteOverlay";


function ReportEditAiBar({ editReportWithCommand, phase, setPhase, setCurrentInstruction, reportEditorRef }) {
  const [command, setCommand] = useState("");
  const [status, setStatus] = useState(null); // { type: 'ok'|'err', text }
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);
  const abortControllerRef = useRef(null);
  const isMountedRef = useRef(true);
  const editorLockedRef = useRef(false);              // ← Lock flag
  const isAbortedRef = useRef(false);                 // ← Abort flag
  const originalDescriptorRef = useRef(null);         // ← Store original descriptor

  // The button/input is "busy" whenever the overlay is mid-animation.
  const busy = phase !== "idle";

  // Web Speech API support detection (Chrome/Edge — Firefox not supported)
  const SpeechRecognition =
    typeof window !== "undefined" &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);
  const micSupported = !!SpeechRecognition;

  // Set up editor property interceptor on mount
  useEffect(() => {
    if (!reportEditorRef?.current) return;

    const editorEl = reportEditorRef.current;
    
    // Get the original property descriptor for innerHTML
    const originalDescriptor = Object.getOwnPropertyDescriptor(editorEl, 'innerHTML') ||
                               Object.getOwnPropertyDescriptor(Object.getPrototypeOf(editorEl), 'innerHTML');
    
    if (!originalDescriptor) {
      console.warn("Could not get original innerHTML descriptor");
      return;
    }

    originalDescriptorRef.current = originalDescriptor;

    // Override innerHTML setter to check lock
    Object.defineProperty(editorEl, 'innerHTML', {
      get() {
        return originalDescriptor.get?.call(this) || this.textContent;
      },
      set(value) {
        if (editorLockedRef.current) {
          console.log("🔒 Editor is LOCKED - blocking innerHTML write:", value.substring(0, 50) + "...");
          return; // BLOCK the write!
        }
        console.log("✅ Editor unlocked - allowing write");
        originalDescriptor.set?.call(this, value);
      },
      configurable: true
    });

    // Cleanup
    return () => {
      try {
        if (originalDescriptor.set) {
          Object.defineProperty(editorEl, 'innerHTML', originalDescriptor);
        }
      } catch (e) {
        console.warn("Could not restore innerHTML descriptor", e);
      }
    };
  }, [reportEditorRef]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

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

    // ✅ UNLOCK editor for new request
    editorLockedRef.current = false;
    isAbortedRef.current = false;
    setStatus(null);
    setPhase("thinking");
    
    // Create new abort controller for this request
    abortControllerRef.current = new AbortController();
    
    try {
      const result = await editReportWithCommand(cmd, abortControllerRef.current.signal);
      
      // ✅ Check abort flag FIRST
      if (isAbortedRef.current) {
        console.log("🛑 Request was aborted - ignoring response");
        return;
      }

      // Only update state if component is still mounted and not aborted
      if (!isMountedRef.current || abortControllerRef.current.signal.aborted) {
        console.log("🛑 Component unmounted or signal aborted - ignoring response");
        return;
      }
      
      if (result?.ok) {
        // Editor DOM has been updated by the hook. Now play the reveal beam,
        // which uncovers the new content as it descends.
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
      // Only update state if not aborted
      if (isMountedRef.current && !isAbortedRef.current) {
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

      <div style={{ display: "flex", gap: 6 }}>
        {/* Show animation when processing, input otherwise */}
        {phase !== "idle" ? (
          <ReportRewriteOverlay
            phase={phase}
            instruction={command}
            onRevealComplete={() => setPhase("idle")}
            onStop={() => {
              console.log("🛑 STOP clicked - locking editor and aborting");
              
              // ✅ LOCK EDITOR IMMEDIATELY (before abort)
              editorLockedRef.current = true;
              isAbortedRef.current = true;
              
              // ✅ Abort the request
              if (abortControllerRef.current) {
                abortControllerRef.current.abort();
              }
              
              // ✅ Clear any pending content
              if (reportEditorRef?.current) {
                reportEditorRef.current.innerHTML = "";
                console.log("✅ Editor cleared");
              }
              
              // ✅ Reset UI
              setPhase("idle");
              setStatus(null);
              // DO NOT clear command - user wants to keep it
            }}
          />
        ) : (
          <>
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !busy) apply(); }}
              placeholder={listening ? "Listening… speak now" : 'e.g. "convert findings to bullets" or "make impression concise"'}
              disabled={busy}
              style={{
                flex: 1,
                border: "1px solid rgba(96,165,250,0.4)",
                borderRadius: 8,
                padding: "9px 12px",
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
                  width: 38,
                  borderRadius: 8,
                  border: "none",
                  cursor: busy ? "not-allowed" : "pointer",
                  background: listening ? "#ef4444" : "rgba(255,255,255,0.12)",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  animation: listening ? "onixMicPulse 1.2s ease-in-out infinite" : "none",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="9" y="3" width="6" height="12" rx="3" stroke="currentColor" strokeWidth="2" />
                  <path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            )}

            <button
              onClick={apply}
              disabled={busy || !command.trim()}
              style={{
                padding: "0 16px",
                borderRadius: 8,
                border: "none",
                cursor: busy || !command.trim() ? "not-allowed" : "pointer",
                background: busy || !command.trim() ? "rgba(255,255,255,0.18)" : "#3b82f6",
                color: "#fff",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 0.3,
                minWidth: 78,
              }}
            >
              {busy ? "…" : "Apply"}
            </button>
          </>
        )}
      </div>

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

export default ReportEditAiBar;
