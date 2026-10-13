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

  const sendOnix = async () => {
    const text = onixInput.trim();
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

      const res = await fetch(`${backendUrl}/radiology/ai/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      if (reportData.technique && blocks[0]) blocks[0].innerText = reportData.technique;
      if (reportData.findings && blocks[1]) blocks[1].innerText = reportData.findings;
      if (reportData.impression && blocks[2]) blocks[2].innerText = reportData.impression;
      if (reportData.opinions && blocks[3]) blocks[3].innerText = reportData.opinions;
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
  const saveReportToDb = async () => {
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

    const fields = extractReportFields(reportEditorRef.current) || {};

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
    };

    const res = await fetch(`${backendUrl}/radiology/reports/${encodeURIComponent(caseId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.success) {
      console.error("Save report failed", res.status, json);
      return { ok: false, reason: "save_failed" };
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
  };
}
