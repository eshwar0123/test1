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

export default function useViewerReportChat({
  chatInput,
  setChatInput,
  setChatMessages,
  onixInput,
  setOnixInput,
  setOnixMessages,

  reportEditorRef,
  patientName,
  patientAge,
  patientSex,
  caseId,
  formatDateTime,

  reportData,
  backendUrl,
}) {
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

  const sendOnix = () => {
    const text = onixInput.trim();
    if (!text) return;
    setOnixMessages((m) => [
      ...m,
      { role: "user", text },
      { role: "ai", text: "Thanks! (UI only response)" },
    ]);
    setOnixInput("");
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
    execCmd,
    initReportTemplate,
    exportReportPdf,
    downloadReportPdf,
    saveReportToDb,
  };
}
