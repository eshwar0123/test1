import { useEffect, useRef } from "react";
import {
  buildExportReportHtml as buildExportReportHtmlMarkup,
  downloadReportPdfFromHtml,
  generateReportPdfBlobFromHtml,
  blobToBase64,
  saveReportExportPdfToBackend,
  getReportTemplateHtml,
  openPrintReport,
} from "../services/reportService";
import { HOSPITAL_PROFILE, RADIOLOGIST_PROFILE } from "../utils/constants";

// HTML-escape user/AI text so we can safely inject as innerHTML below.
function escapeHtml(s) {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Tiny markdown → HTML converter for the report editor.
// Handles: **bold**, *italic*, `code`, "- " bullets, "1. " ordered lists,
// and preserves paragraph breaks.
function markdownToHtml(src) {
  if (!src) return "";
  const lines = String(src).split(/\r?\n/);
  const out = [];
  let inUL = false;
  let inOL = false;
  const closeLists = () => {
    if (inUL) { out.push("</ul>"); inUL = false; }
    if (inOL) { out.push("</ol>"); inOL = false; }
  };
  const inlineFmt = (raw) => {
    let s = escapeHtml(raw);
    // Bold first (so *italic* inside **bold** still works)
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");
    s = s.replace(/`([^`]+)`/g, '<code style="background:#f1f5f9;padding:1px 4px;border-radius:3px">$1</code>');
    return s;
  };
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    // unordered bullet
    const ul = /^\s*[-•]\s+(.*)$/.exec(line);
    // ordered list
    const ol = /^\s*\d+[\.\)]\s+(.*)$/.exec(line);
    if (ul) {
      if (inOL) { out.push("</ol>"); inOL = false; }
      if (!inUL) { out.push("<ul style='margin:4px 0 4px 18px;padding:0'>"); inUL = true; }
      out.push("<li>" + inlineFmt(ul[1]) + "</li>");
      continue;
    }
    if (ol) {
      if (inUL) { out.push("</ul>"); inUL = false; }
      if (!inOL) { out.push("<ol style='margin:4px 0 4px 22px;padding:0'>"); inOL = true; }
      out.push("<li>" + inlineFmt(ol[1]) + "</li>");
      continue;
    }
    // Blank line → paragraph break
    if (line.trim() === "") {
      closeLists();
      out.push("<br>");
      continue;
    }
    closeLists();
    out.push("<div>" + inlineFmt(line) + "</div>");
  }
  closeLists();
  return out.join("");
}

// Reverse of markdownToHtml — read an editor block's innerHTML and reconstruct
// the original markdown so the next AI edit doesn't lose formatting.
function htmlToMarkdown(htmlStr) {
  if (!htmlStr) return "";
  let s = String(htmlStr);

  // <ol>…<li>X</li>…</ol>  →  1. X\n2. Y\n…
  s = s.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_m, inner) => {
    let i = 0;
    return (
      "\n" +
      inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (__m, li) => {
        i += 1;
        return `${i}. ${li.trim()}\n`;
      })
    );
  });

  // <ul>…<li>X</li>…</ul>  →  - X\n- Y\n…
  s = s.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_m, inner) =>
    "\n" + inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (__m, li) => `- ${li.trim()}\n`)
  );

  // <strong>X</strong> | <b>X</b>  →  **X**
  s = s.replace(/<\s*(strong|b)[^>]*>([\s\S]*?)<\s*\/\s*\1\s*>/gi, "**$2**");
  // <em>X</em> | <i>X</i>  →  *X*
  s = s.replace(/<\s*(em|i)[^>]*>([\s\S]*?)<\s*\/\s*\1\s*>/gi, "*$2*");
  // <code>X</code>  →  `X`
  s = s.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, "`$1`");
  // Preserve <p>/<div> as paragraph breaks
  s = s.replace(/<\s*\/?\s*(div|p)\s*[^>]*>/gi, "\n");
  // <br>  →  newline
  s = s.replace(/<\s*br\s*\/?\s*>/gi, "\n");
  // Strip any other tags
  s = s.replace(/<[^>]+>/g, "");
  // Decode common HTML entities
  s = s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  // Collapse 3+ consecutive newlines into 2 (preserves paragraph breaks)
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

function safeText(v) {
  const t = (v ?? "").toString().trim();
  return t.length ? t : null;
}

function toIsoIfPossible(dateTimeText) {
  const t = safeText(dateTimeText);
  if (!t) return null;
  if (t.includes("T")) {
    const d = new Date(t);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  const hasSpace = t.includes(" ");
  if (hasSpace) {
    let iso = t.replace(" ", "T");
    const timePart = iso.split("T")[1] || "";
    if (timePart.length === 5) iso = `${iso}:00`;
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function extractReportFields(reportRoot) {
  if (!reportRoot) return null;

  const refDoctor = safeText(reportRoot.querySelector(".report-ref-doctor")?.innerText);
  const scanText = safeText(reportRoot.querySelector(".report-scan-editor")?.innerText);
  const clinical = safeText(reportRoot.querySelector(".report-clinical-indication")?.innerText);

  const blocks = Array.from(reportRoot.querySelectorAll(".report-answer.block"));

  const cleanBlock = (txt) => {
    const t = safeText(txt);
    if (!t) return null;
    if (t.startsWith("(") && t.endsWith(")")) return null;
    return t;
  };

  return {
    referring_doctor: refDoctor,
    scan_datetime: toIsoIfPossible(scanText),
    clinical_indication: clinical,
    technique: cleanBlock(blocks[0]?.innerText),
    findings: cleanBlock(blocks[1]?.innerText),
    impression: cleanBlock(blocks[2]?.innerText),
    opinions: cleanBlock(blocks[3]?.innerText),
  };
}

const AVG_BATCH_SEC_KEY = "onix_medgemma_avg_batch_sec";
const AVG_SECTION_SEC_KEY = "onix_medgemma_avg_section_sec";

function getStoredNumber(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    const num = raw ? Number(raw) : NaN;
    return Number.isFinite(num) && num > 0 ? num : fallback;
  } catch {
    return fallback;
  }
}

function setStoredNumber(key, value) {
  try {
    if (Number.isFinite(value) && value > 0) {
      localStorage.setItem(key, String(value));
    }
  } catch {}
}

function smoothAverage(prev, next, alpha = 0.35) {
  return prev * (1 - alpha) + next * alpha;
}

function formatDuration(seconds) {
  const sec = Math.max(0, Math.round(seconds));
  const mins = Math.floor(sec / 60);
  const rem = sec % 60;
  if (mins <= 0) return `${rem}s`;
  return `${mins}m ${String(rem).padStart(2, "0")}s`;
}

export default function useViewerReportChat({
  chatInput,
  setChatInput,
  setChatMessages,
  onixInput,
  setOnixInput,
  setOnixMessages,
  onixLoading,
  setOnixLoading,

  reportEditorRef,
  patientName,
  patientAge,
  patientSex,
  caseId,
  formatDateTime,

  reportData,
  backendUrl,
  captureViewportBase64,
  caseModality,
  study,
  aiModel,
  markDrawingRef,
  fileUrl,
  captureAllSlicesForAiReport,
  setOnixStatusText,
  setReportData,
  setShowReport,
  setReportExists,
  reportExists,
  setQcStage,
  setPdfPreviewUrl,
  pdfPreviewUrl,
  setQcResult,
}) {
  const aiReportAbortRef = useRef(null);
  const aiReportCancelRef = useRef(false);

  const makeAbortError = (message = "AI report generation was stopped.") => {
    const error = new Error(message);
    error.name = "AbortError";
    return error;
  };

  useEffect(() => () => {
    aiReportCancelRef.current = true;
    if (aiReportAbortRef.current) {
      aiReportAbortRef.current.abort();
      aiReportAbortRef.current = null;
    }
  }, []);

  // Load AI chat history from DB when case opens
  useEffect(() => {
    if (!caseId) return;

    let authToken = null;
    try {
      const auth = JSON.parse(localStorage.getItem("auth") || "{}");
      authToken = auth.token || null;
    } catch {
      authToken = null;
    }
    if (!authToken) return;

    fetch(`${backendUrl}/radiology/ai/chat-history/${encodeURIComponent(caseId)}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (json?.success && Array.isArray(json.data) && json.data.length > 0) {
          const restored = json.data.map((c) => ({
            role: c.chatted_by === "user" ? "user" : "ai",
            text: c.chat_text,
            image: c.image_path ? `${backendUrl}${c.image_path}` : null,
          }));
          setOnixMessages(restored);
        }
      })
      .catch(() => {});
  }, [caseId]);

  // ✅ AUTO-SAVE on manual typing in report blocks (direct editing)
  useEffect(() => {
    if (!reportEditorRef?.current || !caseId) return;

    const saveReportChanges = async () => {
      try {
        const uid =
          reportData?.user_id ||
          localStorage.getItem("user_id") ||
          (() => {
            try {
              const auth = JSON.parse(localStorage.getItem("auth") || "{}");
              return auth.userId || null;
            } catch { return null; }
          })();

        if (!uid || !caseId) return;

        const root = reportEditorRef.current;
        const blocks = Array.from(root.querySelectorAll(".report-answer.block"));

        const technique = htmlToMarkdown(blocks[0]?.innerHTML || "");
        const findings = htmlToMarkdown(blocks[1]?.innerHTML || "");
        const impression = htmlToMarkdown(blocks[2]?.innerHTML || "");
        const opinions = htmlToMarkdown(blocks[3]?.innerHTML || "");

        // Only save if something has content
        if (!technique && !findings && !impression && !opinions) return;

        const isAiReport = reportData?.report_mode === "ai";

        const savePayload = {
          case_id: caseId,
          user_id: uid,
          referring_doctor: reportData?.referring_doctor || null,
          scan_datetime: reportData?.scan_datetime || null,
          clinical_indication: reportData?.clinical_indication || null,
          ...(isAiReport ? {
            ai_technique: technique || null,
            ai_findings: findings || null,
            ai_impression: impression || null,
            ai_opinions: opinions || null,
          } : {
            technique: technique || null,
            findings: findings || null,
            impression: impression || null,
            opinions: opinions || null,
          }),
        };

        const res = await fetch(
          `${backendUrl}/radiology/reports/${encodeURIComponent(caseId)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(savePayload),
          }
        );

        if (res.ok) {
          console.log("✅ Manual typing auto-saved to DB");
        } else {
          console.warn("Manual auto-save failed:", res.status);
        }
      } catch (err) {
        console.warn("Manual auto-save error:", err);
      }
    };

    // Debounce timer - save 1.5 seconds after user stops typing
    let debounceTimer = null;

    const handleInput = () => {
      // Cancel previous timer
      if (debounceTimer) clearTimeout(debounceTimer);

      // Set new timer - save after 1.5 seconds of no typing
      debounceTimer = setTimeout(() => {
        saveReportChanges();
      }, 1500);
    };

    // Add event listeners to all report blocks
    const root = reportEditorRef.current;
    const blocks = Array.from(root.querySelectorAll(".report-answer.block"));

    blocks.forEach((block) => {
      block.addEventListener("input", handleInput);
    });

    // Cleanup
    return () => {
      blocks.forEach((block) => {
        block.removeEventListener("input", handleInput);
      });
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [reportEditorRef, caseId, reportData, backendUrl]);

  const sendChat = () => {
    const text = chatInput.trim();
    if (!text) return;
    setChatMessages((m) => [...m, { role: "user", text }]);
    setChatInput("");
  };

  const onChatFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setChatMessages((m) => [...m, { role: "user", text: `📎 ${file.name}` }]);
    e.target.value = "";
  };

  const sendOnix = async (overrideText) => {
    const text = (typeof overrideText === "string" ? overrideText : onixInput).trim();
    if (!text) return;

    setOnixMessages((m) => [...m, { role: "user", text }]);
    setOnixInput("");
    setOnixLoading(true);

    try {
      // Use cropped Mark & Ask image if available, otherwise capture full viewport
      let imageBase64 = null;
      if (markDrawingRef?.current) {
        imageBase64 = markDrawingRef.current;
        markDrawingRef.current = null; // clear after use
      } else {
        imageBase64 = captureViewportBase64 ? captureViewportBase64() : null;
      }

      if (!imageBase64) {
        setOnixMessages((m) => [
          ...m,
          { role: "ai", text: "No viewport image available. Please ensure a scan is loaded and visible." },
        ]);
        setOnixLoading(false);
        return;
      }

      // Get JWT token for auth (backend uses it to extract user_id and save chat to DB)
      let authToken = null;
      try {
        const auth = JSON.parse(localStorage.getItem("auth") || "{}");
        authToken = auth.token || null;
      } catch {
        authToken = null;
      }

      if (!authToken) {
        setOnixMessages((m) => [
          ...m,
          { role: "ai", text: "Error: not signed in. Please log in again to use AI chat." },
        ]);
        setOnixLoading(false);
        return;
      }

      const res = await fetch(`${backendUrl}/radiology/ai/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          image_base64: imageBase64,
          prompt: text,
          case_id: caseId || null,
          mode: "chat",
          model: aiModel || "gemma",
        }),
      });

      const json = await res.json();

      if (res.ok && json.success) {
        setOnixMessages((m) => [...m, { role: "ai", text: json.response }]);
      } else {
        setOnixMessages((m) => [
          ...m,
          { role: "ai", text: `Error: ${json.detail || "AI analysis failed. Please try again."}` },
        ]);
      }
    } catch (err) {
      console.error("Onix AI error:", err);
      setOnixMessages((m) => [
        ...m,
        { role: "ai", text: "Network error. Please check that the backend is running." },
      ]);
    } finally {
      setOnixLoading(false);
    }
  };

  const updateOnixStatus = (text) => {
    if (typeof setOnixStatusText === "function") setOnixStatusText(text || "");
  };

  const stopAIReport = () => {
    aiReportCancelRef.current = true;
    updateOnixStatus("Stopping AI report...");
    if (aiReportAbortRef.current) {
      aiReportAbortRef.current.abort();
    }
  };

  const generateAIReport = async (options = {}) => {
    const { dictationText = "", skipUserMessage = false } = options;
    let etaTimer = null;
    const requestAbortController = new AbortController();

    if (typeof captureAllSlicesForAiReport !== "function") {
      setOnixMessages((m) => [
        ...m,
        { role: "ai", text: "AI report capture is not configured in the viewer." },
      ]);
      return null;
    }

    // FAKE MODE: If report already exists, play through slices for visual effect, then show saved report
    if (reportExists) {
      setOnixLoading(true);
      updateOnixStatus("Loading saved AI report...");
      aiReportCancelRef.current = false;

      if (!skipUserMessage) {
        setOnixMessages((m) => [
          ...m,
          { role: "user", text: "Generate AI report." },
        ]);
      }

      try {
        // Play through slices in all views for visual effect — no AI call
        await captureAllSlicesForAiReport({
          targetWidth: 256,
          onProgress: ({ captured, total, view, index }) => {
            updateOnixStatus(`Analyzing slice ${captured}/${total} (${view} ${index + 1})...`);
          },
          shouldCancel: () => aiReportCancelRef.current,
        });

        // Populate editor fields from ai_* (or main fallback) so the saved
        // report renders instead of an empty editor.
        if (typeof setReportData === "function") {
          setReportData((prev) => {
            const base = prev || {};
            return {
              ...base,
              technique: base.ai_technique || base.technique || "",
              findings: base.ai_findings || base.findings || "",
              impression: base.ai_impression || base.impression || "",
              opinions: base.ai_opinions || base.opinions || "",
              report_mode: "ai",
            };
          });
        }

        if (typeof setShowReport === "function") setShowReport(true);
        updateOnixStatus("Saved report loaded.");
        setOnixMessages((m) => [
          ...m,
          { role: "ai", text: "Showing previously saved AI report." },
        ]);
      } catch (e) {
        console.warn("Fake capture animation error:", e);
        if (typeof setShowReport === "function") setShowReport(true);
      } finally {
        setOnixLoading(false);
        setTimeout(() => updateOnixStatus(""), 1500);
      }
      return "SAVED_REPORT_LOADED";
    }

    aiReportCancelRef.current = false;
    aiReportAbortRef.current = requestAbortController;

    setOnixLoading(true);
    updateOnixStatus("Preparing full-slice capture...");

    if (!skipUserMessage) {
      setOnixMessages((m) => [
        ...m,
        { role: "user", text: dictationText?.trim()
          ? `Generate AI report with this context:\n${dictationText.trim()}`
          : "Generate a full AI report from all visible slices."
        },
      ]);
    }

    try {
      const captureStart = performance.now();
      const capture = await captureAllSlicesForAiReport({
        targetWidth: 256,
        onProgress: ({ captured, total, view, index }) => {
          updateOnixStatus(`Capturing slices ${captured}/${total} (${view} ${index + 1})...`);
        },
        shouldCancel: () => aiReportCancelRef.current,
      });

      if (aiReportCancelRef.current) {
        throw makeAbortError();
      }

      const captureSec = (performance.now() - captureStart) / 1000;
      const slices = capture?.slices || [];

      if (!slices.length) {
        setOnixMessages((m) => [
          ...m,
          { role: "ai", text: "No slices captured. Ensure the scan is loaded and visible before generating report." },
        ]);
        return null;
      }

      const totalSlices = slices.length;
      const totalBatches = Math.max(1, Math.ceil(totalSlices / 5));
      const avgBatchSec = getStoredNumber(AVG_BATCH_SEC_KEY, 4.2);
      const avgSectionSec = getStoredNumber(AVG_SECTION_SEC_KEY, 2.4);
      const estimatedServerSec = Math.max(15, Math.round(totalBatches * avgBatchSec + 4 * avgSectionSec));

      updateOnixStatus(
        `Estimated ${formatDuration(estimatedServerSec)} (${totalSlices} slices, ${totalBatches} batches of 5)`
      );

      const requestStartedAt = performance.now();
      etaTimer = setInterval(() => {
        const elapsedSec = (performance.now() - requestStartedAt) / 1000;
        const approxBatch = Math.min(totalBatches, Math.floor(elapsedSec / Math.max(avgBatchSec, 1)) + 1);
        const remainingSec = Math.max(0, estimatedServerSec - elapsedSec);
        updateOnixStatus(`Batch ~${approxBatch}/${totalBatches} · ETA ${formatDuration(remainingSec)}`);
      }, 1000);

      const res = await fetch(`${backendUrl}/ai/medgemma-vision-report`, {
        method: "POST",
        signal: requestAbortController.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slices,
          case_id: caseId || null,
          patient_name: patientName || null,
          patient_age: patientAge || null,
          patient_sex: patientSex || null,
          modality: caseModality || null,
          study: study || null,
        }),
      });

      const json = await res.json();
      if (etaTimer) clearInterval(etaTimer);

      if (res.ok && json.success) {
        const totalServerSec = (performance.now() - requestStartedAt) / 1000;
        const observedBatchSec = Math.max(0.8, (totalServerSec - 4 * avgSectionSec) / totalBatches);
        const observedSectionSec = Math.max(0.8, (totalServerSec - observedBatchSec * totalBatches) / 4);
        setStoredNumber(AVG_BATCH_SEC_KEY, smoothAverage(avgBatchSec, observedBatchSec));
        setStoredNumber(AVG_SECTION_SEC_KEY, smoothAverage(avgSectionSec, observedSectionSec));

        const analyzed = json.slices_analyzed || totalSlices;
        const viewText = json.views
          ? Object.entries(json.views).map(([k, v]) => `${k}: ${v}`).join(", ")
          : "";

        setOnixMessages((m) => [
          ...m,
          {
            role: "ai",
            text:
              `AI report ready in ${formatDuration(totalServerSec)}.\n` +
              `Captured ${totalSlices} slices in ${formatDuration(captureSec)}.\n` +
              `Analyzed ${analyzed} slices${viewText ? ` (${viewText})` : ""}.\n\n` +
              (json.report || ""),
          },
        ]);

        if (typeof setReportData === "function") {
          setReportData((prev) => ({
            ...(prev || {}),
            case_id: caseId,
            patient_name: patientName || prev?.patient_name || "—",
            patient_age: patientAge || prev?.patient_age || "—",
            patient_sex: patientSex || prev?.patient_sex || "—",
            modality: caseModality || prev?.modality || (aiModel === "llava" ? "DICOM/NIfTI" : "Scan"),
            scan_datetime: prev?.scan_datetime || new Date().toISOString(),
            clinical_indication: prev?.clinical_indication || study || null,
            technique: json.technique || prev?.technique || "",
            findings: json.findings || prev?.findings || "",
            impression: json.impression || prev?.impression || "",
            opinions: json.recommendations || prev?.opinions || "",
            status: "draft",
            report_mode: "ai",
            created_at: prev?.created_at || new Date().toISOString(),
          }));
        }
        if (typeof setShowReport === "function") {
          setShowReport(true);
        }

        // Step 3: Auto-save AI report to DB
        setTimeout(async () => {
          try {
            const saved = await saveReportToDb();
            if (saved?.ok && typeof setReportExists === "function") {
              setReportExists(true);
            }
          } catch (e) {
            console.warn("Auto-save of AI report failed:", e);
          }
        }, 100);

        updateOnixStatus(`Completed in ${formatDuration(totalServerSec)}`);
        return json.report;
      } else {
        setOnixMessages((m) => [
          ...m,
          { role: "ai", text: `Error: ${json.detail || "Report generation failed."}` },
        ]);
        updateOnixStatus("AI report generation failed.");
        return null;
      }
    } catch (err) {
      if (err?.name === "AbortError" || aiReportCancelRef.current) {
        setOnixMessages((m) => [
          ...m,
          { role: "ai", text: "AI report generation stopped." },
        ]);
        updateOnixStatus("Stopped.");
        return null;
      }
      console.error("AI report error:", err);
      setOnixMessages((m) => [
        ...m,
        { role: "ai", text: "Network error during report generation." },
      ]);
      updateOnixStatus("Network error during report generation.");
      return null;
    } finally {
      if (etaTimer) clearInterval(etaTimer);
      aiReportAbortRef.current = null;
      aiReportCancelRef.current = false;
      setOnixLoading(false);
      setTimeout(() => updateOnixStatus(""), 1800);
    }
  };

  const execCmd = (cmd, value) => {
    try {
      document.execCommand(cmd, false, value);
      reportEditorRef.current?.focus();
    } catch {}
  };

  const initReportTemplate = () => {
    const el = reportEditorRef.current;
    if (!el) return;

    const hospitalProfile = HOSPITAL_PROFILE(reportData);
    const radiologistProfile = RADIOLOGIST_PROFILE(reportData);

    el.innerHTML = getReportTemplateHtml({
      hospitalProfile,
      radiologistProfile,
      patientName,
      patientAge,
      patientSex,
      caseId,
    });

    setTimeout(() => {
      const root = reportEditorRef.current;
      if (!root || !reportData) return;

      if (reportData.referring_doctor)
        root.querySelector(".report-ref-doctor").innerText = reportData.referring_doctor;

      if (reportData.scan_datetime) {
        const d = new Date(reportData.scan_datetime);
        if (!isNaN(d.getTime())) {
          const pad = (n) => String(n).padStart(2, "0");
          const val = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
            d.getHours()
          )}:${pad(d.getMinutes())}`;
          root.querySelector(".report-scan-editor").innerText = val;
        }
      }

      if (reportData.clinical_indication)
        root.querySelector(".report-clinical-indication").innerText = reportData.clinical_indication;

      const blocks = Array.from(root.querySelectorAll(".report-answer.block"));
      if (reportData.technique && blocks[0]) blocks[0].innerHTML = markdownToHtml(reportData.technique);
      if (reportData.findings && blocks[1]) blocks[1].innerHTML = markdownToHtml(reportData.findings);
      if (reportData.impression && blocks[2]) blocks[2].innerHTML = markdownToHtml(reportData.impression);
      if (reportData.opinions && blocks[3]) blocks[3].innerHTML = markdownToHtml(reportData.opinions);
    }, 0);
  };

  const buildExportReportHtml = () =>
    buildExportReportHtmlMarkup({
      reportRoot: reportEditorRef.current,
      patientName,
      patientAge,
      patientSex,
      caseId,
      formatDateTime,
    });

  // ✅ COLUMN-WISE SAVE (PUT /reports/{case_id})
  const saveReportToDb = async (modeOverride) => {
    const uid =
      reportData?.user_id ||
      localStorage.getItem("user_id") ||
      (() => {
        try {
          const auth = JSON.parse(localStorage.getItem("auth") || "{}");
          return auth.userId || null;
        } catch {
          return null;
        }
      })();

    if (!uid) {
      console.error("Cannot save report: user_id not found.");
      return { ok: false, reason: "missing_user_id" };
    }

    if (!caseId) {
      console.error("Cannot save report: caseId is empty.");
      return { ok: false, reason: "missing_case_id" };
    }

    if (!reportEditorRef?.current) {
      console.error("Cannot save report: report editor is not mounted yet.");
      return { ok: false, reason: "editor_not_mounted" };
    }

    const fields = extractReportFields(reportEditorRef.current) || {};
    const mode = modeOverride || reportData?.report_mode || null;
    console.log("[saveReportToDb] uid =", uid, "mode =", mode, "fields =", fields);

    const payload = {
      case_id: caseId,
      user_id: uid,
      referring_doctor: fields.referring_doctor,
      scan_datetime: fields.scan_datetime,
      clinical_indication: fields.clinical_indication,
      technique: fields.technique,
      findings: fields.findings,
      impression: fields.impression,
      opinions: fields.opinions,
      mode,
    };

    let res;
    try {
      res = await fetch(`${backendUrl}/radiology/reports/${encodeURIComponent(caseId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (netErr) {
      console.error("[saveReportToDb] network error:", netErr);
      return { ok: false, reason: "network_error" };
    }

    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.success) {
      console.error("[saveReportToDb] HTTP", res.status, json);
      return { ok: false, reason: `http_${res.status}` };
    }
    return { ok: true, data: json.data, userId: uid };
  };

  // ✅ PRINT: save column-wise + save pdf to backend path + then print
  const exportReportPdf = async () => {
    const saved = await saveReportToDb();
    if (!saved.ok) return;

    const bodyHtml = buildExportReportHtml();

    // generate pdf blob
    const blob = await generateReportPdfBlobFromHtml({ bodyHtml, caseId });
    if (blob) {
      const pdfBase64 = await blobToBase64(blob);
      await saveReportExportPdfToBackend({
        backendUrl,
        caseId,
        userId: saved.userId,
       
        pdfBase64,
      });
    }

    openPrintReport(bodyHtml);
  };

  // ✅ DOWNLOAD: save column-wise + save pdf to backend path + then download
  const downloadReportPdf = async () => {
    const saved = await saveReportToDb();
    if (!saved.ok) return;

    const bodyHtml = buildExportReportHtml();

    const blob = await generateReportPdfBlobFromHtml({ bodyHtml, caseId });
    if (blob) {
      const pdfBase64 = await blobToBase64(blob);
      await saveReportExportPdfToBackend({
        backendUrl,
        caseId,
        userId: saved.userId,
        
        pdfBase64,
      });
    }

    await downloadReportPdfFromHtml({ bodyHtml, caseId });
  };

  // Submit report — saves to ai_* or manual_* columns + runs QC + on pass shows PDF preview
  const submitReport = async () => {
    const mode = reportData?.report_mode || "manual";

    let saved;
    try {
      saved = await saveReportToDb(mode);
    } catch (e) {
      console.error("[submitReport] saveReportToDb threw:", e);
      alert("Submit failed: " + (e?.message || "network error"));
      return;
    }

    if (!saved?.ok) {
      const reason = saved?.reason || "unknown";
      alert("Submit failed: " + reason + ". Check console for details.");
      setOnixMessages((m) => [
        ...m,
        { role: "ai", text: `Failed to submit report (${reason}). Please try again.` },
      ]);
      return;
    }

    // Stage 1: QC running
    if (typeof setQcStage === "function") setQcStage("running");
    if (typeof setQcResult === "function") setQcResult(null);

    // Stage 2: call real QC endpoint
    let qcData;
    try {
      const res = await fetch(
        `${backendUrl}/radiology/reports/${encodeURIComponent(caseId)}/qc?user_id=${encodeURIComponent(saved.userId)}`,
        { method: "POST" }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.detail || `HTTP ${res.status}`);
      }
      qcData = json.data;
    } catch (e) {
      console.error("[submitReport] QC call failed:", e);
      if (typeof setQcStage === "function") setQcStage("failed");
      if (typeof setQcResult === "function") {
        setQcResult({
          status: "fail",
          errors: 1,
          warnings: 0,
          passed: 0,
          total: 0,
          checks: [],
          _network_error: e?.message || "QC service unreachable",
        });
      }
      setOnixMessages((m) => [
        ...m,
        { role: "ai", text: `QC service error: ${e?.message || "unreachable"}. Try again.` },
      ]);
      return;
    }

    if (typeof setQcResult === "function") setQcResult(qcData);

    // Stage 3: branch on QC verdict
    if (qcData.status === "fail") {
      if (typeof setQcStage === "function") setQcStage("failed");
      setOnixMessages((m) => [
        ...m,
        { role: "ai", text: `QC failed (${qcData.errors} error${qcData.errors === 1 ? "" : "s"}). Fix issues then re-submit.` },
      ]);
      return;
    }

    // pass or warn → render PDF preview, save PDF to backend so admin push has the path
    if (typeof setQcStage === "function") setQcStage("passed");
    try {
      const bodyHtml = buildExportReportHtml();
      const blob = await generateReportPdfBlobFromHtml({ bodyHtml, caseId });
      if (blob && typeof setPdfPreviewUrl === "function") {
        const url = URL.createObjectURL(blob);
        setPdfPreviewUrl(url);
      }
      if (blob) {
        try {
          const pdfBase64 = await blobToBase64(blob);
          await saveReportExportPdfToBackend({
            backendUrl,
            caseId,
            userId: saved.userId,
            pdfBase64,
          });
        } catch (saveErr) {
          console.warn("PDF backend save failed (admin push will skip report_path):", saveErr);
        }
      }
    } catch (e) {
      console.warn("PDF preview generation failed:", e);
    }
  };

  // Mark Complete — copies last_saved → main columns + status='completed'
  const markComplete = async () => {
    const uid =
      reportData?.user_id ||
      localStorage.getItem("user_id") ||
      (() => {
        try {
          const auth = JSON.parse(localStorage.getItem("auth") || "{}");
          return auth.userId || null;
        } catch { return null; }
      })();
    if (!uid) {
      alert("Cannot mark complete: user_id not found.");
      return;
    }
    try {
      const res = await fetch(
        `${backendUrl}/radiology/reports/${encodeURIComponent(caseId)}/mark-completed?user_id=${encodeURIComponent(uid)}`,
        { method: "POST" }
      );
      const json = await res.json();
      if (res.ok && json?.success) {
        setOnixMessages((m) => [
          ...m,
          { role: "ai", text: "Report finalized. Status: completed." },
        ]);
        // Reset QC + close preview
        if (typeof setQcStage === "function") setQcStage("idle");
        if (typeof setPdfPreviewUrl === "function") {
          if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
          setPdfPreviewUrl(null);
        }
        if (typeof setShowReport === "function") setShowReport(false);
      } else {
        alert("Mark complete failed: " + (json?.detail || "unknown"));
      }
    } catch (e) {
      alert("Network error: " + e.message);
    }
  };

  const cancelQcPreview = () => {
    if (typeof setQcStage === "function") setQcStage("idle");
    if (pdfPreviewUrl) {
      URL.revokeObjectURL(pdfPreviewUrl);
      if (typeof setPdfPreviewUrl === "function") setPdfPreviewUrl(null);
    }
  };

  // Editor AI: send a natural-language command + current report sections to backend,
  // receive updated sections, write them back into the contenteditable blocks.
  const editReportWithCommand = async (command, signal) => {
    const cmd = (command || "").trim();
    if (!cmd) return { ok: false, reason: "empty_command" };

    const root = reportEditorRef?.current;
    if (!root) return { ok: false, reason: "editor_not_mounted" };

    const blocks = Array.from(root.querySelectorAll(".report-answer.block"));
    // Read innerHTML and convert back to markdown so previously-rendered
    // **bold** and "- bullets" survive the round-trip. innerText would strip
    // them, causing Claude to re-flow the section as plaintext on the next
    // edit even when the user didn't ask to change it.
    const current = {
      technique:  htmlToMarkdown(blocks[0]?.innerHTML || ""),
      findings:   htmlToMarkdown(blocks[1]?.innerHTML || ""),
      impression: htmlToMarkdown(blocks[2]?.innerHTML || ""),
      opinions:   htmlToMarkdown(blocks[3]?.innerHTML || ""),
    };

    let res;
    try {
      res = await fetch(`${backendUrl}/ai/edit-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...current, command: cmd }),
        signal: signal,  // ✅ ADD ABORT SIGNAL
      });
    } catch (netErr) {
      // ✅ Check if error was due to abort
      if (netErr?.name === "AbortError" || signal?.aborted) {
        console.log("🛑 editReportWithCommand: fetch was aborted");
        return { ok: false, reason: "aborted", error: "Request was stopped" };
      }
      console.error("[editReportWithCommand] network error:", netErr);
      return { ok: false, reason: "network_error", error: netErr?.message };
    }

    // ✅ Check if aborted BEFORE processing response
    if (signal?.aborted) {
      console.log("🛑 editReportWithCommand: signal aborted after fetch");
      return { ok: false, reason: "aborted", error: "Request was stopped" };
    }

    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) {
      return {
        ok: false,
        reason: `http_${res.status}`,
        error: json?.detail || "edit-report failed",
      };
    }

    const updated = json.data || {};
    // Convert Claude's markdown to HTML so **bold** and "- bullets" actually render.
    if (blocks[0]) blocks[0].innerHTML = markdownToHtml(updated.technique  ?? current.technique);
    if (blocks[1]) blocks[1].innerHTML = markdownToHtml(updated.findings   ?? current.findings);
    if (blocks[2]) blocks[2].innerHTML = markdownToHtml(updated.impression ?? current.impression);
    if (blocks[3]) blocks[3].innerHTML = markdownToHtml(updated.opinions   ?? current.opinions);

    if (typeof setReportData === "function") {
      setReportData((prev) => ({
        ...(prev || {}),
        technique:  updated.technique  ?? prev?.technique,
        findings:   updated.findings   ?? prev?.findings,
        impression: updated.impression ?? prev?.impression,
        opinions:   updated.opinions   ?? prev?.opinions,
      }));
    }

    // ✅ AUTO-SAVE: Persist AI report edits to database so changes survive navigation
    try {
      const uid =
        reportData?.user_id ||
        localStorage.getItem("user_id") ||
        (() => {
          try {
            const auth = JSON.parse(localStorage.getItem("auth") || "{}");
            return auth.userId || null;
          } catch { return null; }
        })();

      if (uid && caseId) {
        // Detect if report is AI mode (was generated by batch)
        const isAiReport = reportData?.report_mode === "ai";
        
        // Save to appropriate columns based on report type
        const savePayload = {
          case_id: caseId,
          user_id: uid,
          referring_doctor: reportData?.referring_doctor || null,
          scan_datetime: reportData?.scan_datetime || null,
          clinical_indication: reportData?.clinical_indication || null,
          // ✅ Save to ai_* columns if AI report, regular columns if manual
          ...(isAiReport ? {
            ai_technique: updated.technique ?? current.technique,
            ai_findings: updated.findings ?? current.findings,
            ai_impression: updated.impression ?? current.impression,
            ai_opinions: updated.opinions ?? current.opinions,
          } : {
            technique: updated.technique ?? current.technique,
            findings: updated.findings ?? current.findings,
            impression: updated.impression ?? current.impression,
            opinions: updated.opinions ?? current.opinions,
          }),
        };

        const saveRes = await fetch(
          `${backendUrl}/radiology/reports/${encodeURIComponent(caseId)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(savePayload),
            signal: signal,  // ✅ ADD ABORT SIGNAL HERE TOO
          }
        );

        if (saveRes.ok) {
          console.log("✅ AI report edits auto-saved to DB");
        } else {
          console.warn("[editReportWithCommand] auto-save to DB failed:", saveRes.status);
        }
      }
    } catch (saveErr) {
      // ✅ Check if error was due to abort
      if (saveErr?.name === "AbortError" || signal?.aborted) {
        console.log("🛑 editReportWithCommand: auto-save was aborted");
        return { ok: false, reason: "aborted", error: "Auto-save was stopped" };
      }
      console.warn("[editReportWithCommand] auto-save exception:", saveErr);
    }

    return { ok: true, data: updated, warning: updated._warning || null };
  };

  return {
    sendChat,
    onChatFile,
    sendOnix,
    generateAIReport,
    stopAIReport,
    execCmd,
    initReportTemplate,
    exportReportPdf,
    downloadReportPdf,
    saveReportToDb,
    submitReport,
    markComplete,
    cancelQcPreview,
    editReportWithCommand,
  };
}
