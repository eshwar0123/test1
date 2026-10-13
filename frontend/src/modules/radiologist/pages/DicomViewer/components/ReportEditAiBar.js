import React, { useState, useRef, useEffect } from "react";
import onixIcon from "../../../assets/onix.svg";
import ReportRewriteOverlay from "./ReportRewriteOverlay_WORKING";

function ReportEditAiBar({
  editReportWithCommand,
  phase,
  setPhase,
  setCurrentInstruction,
  reportEditorRef,
}) {
  const [command, setCommand] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [listening, setListening] = useState(false);
  const abortControllerRef = useRef(null);
  const editorLockedRef = useRef(false);
  const isAbortedRef = useRef(false);
  const micSupported = "webkitSpeechRecognition" in window || "SpeechRecognition" in window;

  const apply = async () => {
    if (!command.trim() || editorLockedRef.current) return;

    setBusy(true);
    editorLockedRef.current = false;
    isAbortedRef.current = false;
    setStatus(null);
    setPhase("thinking");
    abortControllerRef.current = new AbortController();

    setCurrentInstruction(command);

    const result = await editReportWithCommand(command, abortControllerRef.current.signal);

    if (isAbortedRef.current) {
      setBusy(false);
      return;
    }

    if (result?.ok) {
      setPhase("revealing");
      setStatus({ type: "ok", text: "Report updated successfully" });
    } else {
      setBusy(false);
      setPhase("idle");
      setStatus({ type: "error", text: result?.reason || "Update failed" });
    }

    setCommand("");
  };

  const stopHandler = () => {
    console.log("🛑 STOP clicked");
    editorLockedRef.current = true;
    isAbortedRef.current = true;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    if (reportEditorRef?.current) {
      reportEditorRef.current.innerHTML = "";
    }

    setPhase("idle");
    setCommand("");
    setStatus(null);
    setBusy(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Header - only show during idle */}
      {phase === "idle" && (
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#bfdbfe",
            letterSpacing: 0.6,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <img src={onixIcon} alt="" style={{ height: 14, width: "auto" }} />
          ONIX AI EDITOR — TELL IT WHAT TO CHANGE
        </div>
      )}

      {/* Overlay during processing */}
      {phase !== "idle" ? (
        <div
          style={{
            position: "relative",
            width: "100%",
            height: 140,
            borderRadius: 8,
            overflow: "hidden",
            background: "rgba(5,9,18,0.95)",
            border: "1px solid rgba(125,235,225,0.18)",
          }}
        >
          <ReportRewriteOverlay
            phase={phase}
            instruction={command}
            onRevealComplete={() => setPhase("idle")}
            onStop={stopHandler}
            status={status?.text}
          />
        </div>
      ) : (
        /* Input form - only show during idle */
        <div style={{ display: "flex", gap: 6 }}>
          <input
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !busy) apply();
            }}
            placeholder='e.g. "convert findings to bullets" or "make impression concise"'
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

          <button
            onClick={apply}
            disabled={busy || !command.trim()}
            style={{
              paddingLeft: 16,
              paddingRight: 16,
              borderRadius: 8,
              border: "none",
              background: "rgba(96,165,250,0.9)",
              color: "#fff",
              fontWeight: 600,
              cursor: busy ? "not-allowed" : "pointer",
              opacity: busy || !command.trim() ? 0.6 : 1,
            }}
          >
            {busy ? "…" : "Apply"}
          </button>
        </div>
      )}

      {/* Status message */}
      {status && phase === "idle" && (
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
