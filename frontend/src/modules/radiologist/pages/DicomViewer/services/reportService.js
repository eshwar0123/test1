async function getJsPdfCtor() {
  if (window?.jspdf?.jsPDF) return window.jspdf.jsPDF;

  await new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-lib="jspdf-umd"]');
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    script.async = true;
    script.dataset.lib = "jspdf-umd";
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });

  return window?.jspdf?.jsPDF || null;
}

async function getHtml2Canvas() {
  if (window?.html2canvas) return window.html2canvas;

  await new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-lib="html2canvas"]');
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
    script.async = true;
    script.dataset.lib = "html2canvas";
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });

  return window?.html2canvas || null;
}

// ✅ NEW: blob -> base64
export async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const s = reader.result || "";
      const base64 = String(s).split(",")[1] || "";
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ✅ NEW: Generate PDF as Blob (same settings as downloadReportPdfFromHtml)
export async function generateReportPdfBlobFromHtml({ bodyHtml, caseId }) {
  if (!bodyHtml) return null;

  const mount = document.createElement("div");
  mount.style.position = "fixed";
  mount.style.left = "-10000px";
  mount.style.top = "0";
  mount.style.width = "794px";
  mount.style.background = "#ffffff";
  mount.innerHTML = `
    <style>
      .page { width: 794px; min-height: 1123px; margin: 0 auto; background: #fff; font-family: Arial, sans-serif; }
      .report-answer { border-bottom: none !important; }
      .report-top { display: block !important; }
      .report-head { display: grid !important; }
      [contenteditable="true"] { outline: none; }
    </style>
    <div class="page">${bodyHtml}</div>
  `;
  document.body.appendChild(mount);

  try {
    const JsPdf = await getJsPdfCtor();
    const html2canvasFn = await getHtml2Canvas();
    if (!JsPdf || !html2canvasFn) return null;

    await new Promise((r) => requestAnimationFrame(r));

    const canvas = await html2canvasFn(mount, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
    });

    const pdf = new JsPdf("p", "mm", "a4");
    const imgData = canvas.toDataURL("image/png");
    const pageWidth = 210;
    const pageHeight = 297;
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight, undefined, "FAST");
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight, undefined, "FAST");
      heightLeft -= pageHeight;
    }

    // ✅ Return Blob instead of saving
    const blob = pdf.output("blob");
    return blob;
  } finally {
    document.body.removeChild(mount);
  }
}

// ✅ NEW: Save PDF + HTML to backend (stores file path + exported_at)
export async function saveReportExportPdfToBackend({
  backendUrl,
  caseId,
  userId,
 
  pdfBase64,
}) {
  const res = await fetch(
    `${backendUrl}/radiology/reports/${encodeURIComponent(caseId)}/export?user_id=${encodeURIComponent(userId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        
        report_format: "pdf",
        file_base64: pdfBase64 || "",
      }),
    }
  );

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new Error(json?.detail || "Export save failed");
  }
  return json.data;
}

/* =========================
   YOUR EXISTING FILE (unchanged below)
========================= */
export function getReportTemplateHtml({
  hospitalProfile,
  radiologistProfile,
  patientName,
  patientAge,
  patientSex,
  caseId,
  title,
}) {
  const ageSex = `${patientAge ? `${patientAge}y` : "-"} / ${patientSex || "-"}`;
  return `
    <style>
      .report-shell { max-width: 900px; margin: 0 auto; border: 1px solid #d1d5db; border-radius: 10px; overflow: hidden; background: #fff; font-family: Arial, sans-serif; }
      .report-top { display: none; height: 8px; background: linear-gradient(90deg, #0f67a8, #1f8bd1); }
      .report-head { display: none; grid-template-columns: 1fr 1fr; gap: 10px; padding: 10px 12px; border-bottom: 1px solid #d1d5db; }
      .report-logo-wrap { display: flex; gap: 10px; align-items: center; min-height: 42px; }
      .report-logo-wrap img { max-height: 42px; max-width: 160px; object-fit: contain; display: block; }
      .report-logo-fallback { width: 34px; height: 34px; border-radius: 50%; background: conic-gradient(from 220deg,#0f67a8 0 220deg,#f59e0b 220deg 360deg); }
      .report-hospital { text-align: right; font-size: 12px; line-height: 1.45; color: #0f67a8; }
      .report-title-bar { text-align: center; font-weight: 700; color: #1a3fd6; font-size: 15px; letter-spacing: 0.5px; border-bottom: 2px solid #1a3fd6; padding-bottom: 8px; margin-bottom: 16px; text-transform: uppercase; }
      .report-sec-title { margin-top: 14px; font-size: 13px; font-weight: 700; color: #1a3fd6; border-bottom: 2px solid #1a3fd6; padding-bottom: 6px; margin-bottom: 8px; }
      .patient-grid { width: 100%; border-collapse: collapse; margin-top: 4px; margin-bottom: 8px; font-size: 12px; table-layout: fixed; }
      .patient-grid td { border: 1px solid #222; padding: 8px 10px; vertical-align: middle; }
      .patient-grid .k { font-weight: 700; }
      .report-table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 12px; }
      .report-table td { padding: 4px 2px; vertical-align: top; color: #6b7280; }
      .report-label { width: 160px; font-weight: 600; color: #6b7280; user-select: none; }
      .report-colon { width: 12px; color: #6b7280; user-select: none; }
      .report-answer { min-height: 20px; outline: none; border-bottom: 1px dashed #93c5fd; padding: 1px 2px; display: inline-block; min-width: 180px; }
      .report-answer.block { display: block; min-height: 58px; width: 100%; border: 1px solid #d1d5db; border-radius: 6px; padding: 8px; font-size: 12px; line-height: 1.6; }
      .report-advice-box { background: #eef3ff; border: 1px solid #c7d6f5 !important; }
      .report-sign { max-height: 52px; max-width: 220px; object-fit: contain; display: block; margin: 0 auto 4px; }
      .report-sign-text { font-size: 12px; color: #374151; line-height: 1.35; }
      .report-sign-wrap { display: flex; justify-content: flex-end; margin-top: 10px; width: 100%; }
      .report-sign-card { min-width: 260px; text-align: center; display: flex; flex-direction: column; align-items: center; }
      .report-sign-name { font-size: 12px; font-weight: 700; letter-spacing: 0.2px; }
      .report-sign-meta { font-size: 11px; line-height: 1.35; }
      .report-sign-reg { font-size: 11px; font-weight: 700; }
      .report-sign-section { break-inside: avoid-page; page-break-inside: avoid; }
      .report-sign-wrap { break-inside: avoid-page; page-break-inside: avoid; }
      .report-sign-card { break-inside: avoid-page; page-break-inside: avoid; }
    </style>
    <div class="report-shell">
      <div class="report-top"></div>
      <div class="report-head">
        <div class="report-logo-wrap">
          <img src="${hospitalProfile.logoUrl}" alt="Hospital Logo" onerror="this.onerror=null; this.src='/src/assets/logo.png';" style="width:auto;height:64px;max-width:260px;object-fit:contain;display:block;" />
          <div class="report-logo-fallback" style="display:none;"></div>
          <div>
            <div style="font-size:16px;font-weight:700;">${hospitalProfile.name}</div>
            <div style="font-size:12px;">${hospitalProfile.department}</div>
            <div style="font-size:11px;color:#4b5563;">${hospitalProfile.accreditation}</div>
          </div>
        </div>
        <div class="report-hospital" style="justify-self:end;text-align:right;">
          <div>${hospitalProfile.addressLine1}</div>
          <div>${hospitalProfile.addressLine2}</div>
        </div>
      </div>

      <div style="padding:12px;">
        <div class="report-title-bar">${title || "Radiology Report"}</div>

        <table class="patient-grid">
          <tr>
            <td class="k">Patient ID</td>
            <td class="v">${caseId || "-"}</td>
            <td class="k">Age / Sex</td>
            <td class="v">${ageSex}</td>
          </tr>
          <tr>
            <td class="k">Patient Name</td>
            <td class="v">${patientName || "-"}</td>
            <td class="k">Study Date</td>
            <td class="v"><span class="report-answer report-scan-editor" contenteditable="true"></span></td>
          </tr>
          <tr>
            <td class="k">Referring Doctor</td>
            <td class="v" colspan="3"><span class="report-answer report-ref-doctor" contenteditable="true"></span></td>
          </tr>
        </table>

        <table class="report-table">
          <tr><td class="report-label">Investigation</td><td class="report-colon">:</td><td><span class="report-answer report-clinical-indication" contenteditable="true"></span></td></tr>
        </table>

        <div class="report-sec-title">Technique</div>
        <div class="report-answer block" contenteditable="true"></div>

        <div class="report-sec-title">REPORT</div>
        <div class="report-answer block" contenteditable="true">(Organ/system-wise structured description)</div>

        <div class="report-sec-title">ADVICE</div>
        <div class="report-answer block report-advice-box" contenteditable="true">(Clear, concise, clinically actionable summary)</div>

        <div class="report-sec-title">Impression</div>
        <div class="report-answer block" contenteditable="true">(If any)</div>

        <div class="report-sign-section">
          <div class="report-sec-title">Signature</div>
          <div class="report-sign-wrap">
          <div class="report-sign-card">
            <img class="report-sign" src="${radiologistProfile.signatureUrl}" alt="Radiologist Signature" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" />
            <div class="report-sign-text" style="display:none;">Signature image not found</div>
            <div class="report-sign-name">Dr. ${radiologistProfile.name}</div>
            ${radiologistProfile.registrationNumber ? `<div class="report-sign-reg">DMC No: ${radiologistProfile.registrationNumber}</div>` : ""}
            <div class="report-sign-meta">${radiologistProfile.qualification}</div>
            <div class="report-sign-meta">${radiologistProfile.designation || ""}</div>
          </div>
        </div>
        </div>

        <div style="margin-top:10px;font-size:11px;color:#6b7280;">${hospitalProfile.website}</div>
      </div>
    </div>
  `;
}

export function buildExportReportHtml({ reportRoot, formatDateTime }) {
  if (!reportRoot) return "";
  const holder = document.createElement("div");
  holder.innerHTML = reportRoot.innerHTML || "";

  // The live patient-grid already renders Patient ID / Age-Sex / Patient Name from props —
  // only the Study Date cell is left for the radiologist to fill in, so backfill it with
  // "now" if still blank rather than shipping an empty cell in the exported PDF.
  const scanEditor = holder.querySelector(".report-scan-editor");
  if (scanEditor && !(scanEditor.textContent || "").trim()) {
    scanEditor.textContent = formatDateTime(new Date());
  }

  return holder.innerHTML;
}

export function openPrintReport(bodyHtml) {
  if (!bodyHtml) return;
  const w = window.open("", "_blank", "width=1024,height=768");
  if (!w) return;

  w.document.open();
  w.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Radiology Report</title>
        <style>
          @page { size: A4; margin: 10mm; }
          body { margin: 0; background: #f3f4f6; font-family: Arial, sans-serif; }
          .page { width: 190mm; min-height: 277mm; margin: 0 auto; background: #fff; }
          .report-answer { border-bottom: none !important; }
          .report-top { display: block !important; }
          .report-head { display: grid !important; }
          [contenteditable="true"] { outline: none; }
        </style>
      </head>
      <body>
        <div class="page">${bodyHtml}</div>
      </body>
    </html>
  `);
  w.document.close();
  w.focus();
  setTimeout(() => {
    w.print();
  }, 200);
}

export async function downloadReportPdfFromHtml({ bodyHtml, caseId }) {
  if (!bodyHtml) return;

  const mount = document.createElement("div");
  mount.style.position = "fixed";
  mount.style.left = "-10000px";
  mount.style.top = "0";
  mount.style.width = "794px";
  mount.style.background = "#ffffff";
  mount.innerHTML = `
    <style>
      .page { width: 794px; min-height: 1123px; margin: 0 auto; background: #fff; font-family: Arial, sans-serif; }
      .report-answer { border-bottom: none !important; }
      .report-top { display: block !important; }
      .report-head { display: grid !important; }
      [contenteditable="true"] { outline: none; }
    </style>
    <div class="page">${bodyHtml}</div>
  `;
  document.body.appendChild(mount);

  try {
    const JsPdf = await getJsPdfCtor();
    const html2canvasFn = await getHtml2Canvas();
    if (!JsPdf || !html2canvasFn) {
      openPrintReport(bodyHtml);
      return;
    }

    await new Promise((r) => requestAnimationFrame(r));
    const canvas = await html2canvasFn(mount, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
    });

    const pdf = new JsPdf("p", "mm", "a4");
    const imgData = canvas.toDataURL("image/png");
    const pageWidth = 210;
    const pageHeight = 297;
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight, undefined, "FAST");
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight, undefined, "FAST");
      heightLeft -= pageHeight;
    }

    const safeId = (caseId || "scan").toString().replace(/[^a-zA-Z0-9_-]+/g, "_");
    pdf.save(`radiology_report_${safeId}.pdf`);
  } finally {
    document.body.removeChild(mount);
  }
}
