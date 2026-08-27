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
}) {
  return `
    <style>
      .report-shell { max-width: 900px; margin: 0 auto; border: 1px solid #d1d5db; border-radius: 10px; overflow: hidden; background: #fff; font-family: Arial, sans-serif; }
      .report-top { display: none; height: 8px; background: linear-gradient(90deg, #0f67a8, #1f8bd1); }
      .report-head { display: none; grid-template-columns: 1fr 1fr; gap: 10px; padding: 10px 12px; border-bottom: 1px solid #d1d5db; }
      .report-logo-wrap { display: flex; gap: 10px; align-items: center; min-height: 42px; }
      .report-logo-wrap img { max-height: 42px; max-width: 160px; object-fit: contain; display: block; }
      .report-logo-fallback { width: 34px; height: 34px; border-radius: 50%; background: conic-gradient(from 220deg,#0f67a8 0 220deg,#f59e0b 220deg 360deg); }
      .report-hospital { text-align: right; font-size: 12px; line-height: 1.45; color: #0f67a8; }
      .report-sec-title { margin-top: 12px; font-size: 13px; font-weight: 700; background: #e8f2ff; border: 1px solid #bfdbfe; padding: 6px 8px; border-radius: 6px; }
      .report-table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px; }
      .report-table td { padding: 5px 2px; vertical-align: top; }
      .report-label { width: 250px; font-weight: 600; color: #111827; user-select: none; }
      .report-colon { width: 12px; color: #111827; user-select: none; }
      .report-answer { min-height: 20px; outline: none; border-bottom: 1px dashed #93c5fd; padding: 1px 2px; display: inline-block; min-width: 180px; }
      .report-answer.block { display: block; min-height: 58px; width: 100%; border: 1px solid #d1d5db; border-radius: 6px; padding: 8px; }
      .report-fixed { color: #111827; }
      .patient-grid { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px; table-layout: fixed; }
      .patient-grid td { border: 1px solid #111827; padding: 6px 8px; vertical-align: middle; }
      .patient-grid .k { font-weight: 700; width: 15%; }
      .patient-grid .v { width: 35%; }
      .report-sign { max-height: 52px; max-width: 220px; object-fit: contain; display: block; margin: 0 auto 4px; }
      .report-sign-text { font-size: 12px; color: #374151; line-height: 1.35; }
      .report-sign-wrap { display: flex; justify-content: flex-end; margin-top: 10px; width: 100%; }
      .report-sign-card { min-width: 260px; text-align: center; display: flex; flex-direction: column; align-items: center; }
      .report-sign-name { font-size: 12px; font-weight: 700; letter-spacing: 0.2px; text-transform: uppercase; }
      .report-sign-meta { font-size: 12px; line-height: 1.35; text-transform: uppercase; }
      .report-sign-reg { font-size: 12px; font-weight: 700; }
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
        <div class="report-sec-title">Patient Details</div>
        <table class="report-table">
          <tr><td class="report-label">Case No.</td><td class="report-colon">:</td><td class="report-fixed">${caseId || "-"}</td></tr>
          <tr><td class="report-label">Age / Sex</td><td class="report-colon">:</td><td class="report-fixed">${patientAge ? `${patientAge} Years` : "-"} ${patientSex || ""}</td></tr>
          
          <tr><td class="report-label">Referring Doctor</td><td class="report-colon">:</td><td><span class="report-answer report-ref-doctor" contenteditable="true"></span></td></tr>
          <tr><td class="report-label">Date & Time of Scan</td><td class="report-colon">:</td><td><span class="report-answer report-scan-editor" contenteditable="true"></span></td></tr>
          <tr><td class="report-label">Investigation</td><td class="report-colon">:</td><td><span class="report-answer report-clinical-indication" contenteditable="true"></span></td></tr>
        </table>

        <div class="report-sec-title">Technique</div>
        <div class="report-answer block" contenteditable="true"></div>

        <div class="report-sec-title">Findings</div>
        <div class="report-answer block" contenteditable="true">(Organ/system-wise structured description)</div>

        <div class="report-sec-title">Impression</div>
        <div class="report-answer block" contenteditable="true">(Clear, concise, clinically actionable summary)</div>

        <div class="report-sec-title">Opinions</div>
        <div class="report-answer block" contenteditable="true">(If any)</div>

        <div class="report-sign-section">
          <div class="report-sec-title">Signature</div>
          <div class="report-sign-wrap">
          <div class="report-sign-card">
            <img class="report-sign" src="${radiologistProfile.signatureUrl}" alt="Radiologist Signature" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" />
            <div class="report-sign-text" style="display:none;">Signature image not found</div>
            <div class="report-sign-name">${radiologistProfile.name}</div>
            <div class="report-sign-meta">${radiologistProfile.qualification}</div>
            <div class="report-sign-meta">${radiologistProfile.designation || ""}</div>
            <div class="report-sign-reg">${radiologistProfile.registrationNumber}</div>
          </div>
        </div>
        </div>

        <div style="margin-top:10px;font-size:11px;color:#6b7280;">${hospitalProfile.website}</div>
      </div>
    </div>
  `;
}

export function buildExportReportHtml({
  reportRoot,
  patientName,
  patientAge,
  patientSex,
  caseId,
  formatDateTime,
}) {
  if (!reportRoot) return "";
  const holder = document.createElement("div");
  holder.innerHTML = reportRoot.innerHTML || "";
  const nowText = formatDateTime(new Date());
  const refPhys = (holder.querySelector(".report-ref-doctor")?.textContent || "-").trim() || "-";
  const clinical = (holder.querySelector(".report-clinical-indication")?.textContent || "-").trim() || "-";

  const patientTitle = Array.from(holder.querySelectorAll(".report-sec-title")).find(
    (el) => (el.textContent || "").trim().toLowerCase() === "patient details"
  );
  const patientTable = patientTitle?.nextElementSibling;
  if (patientTable && patientTable.tagName === "TABLE") {
    patientTable.outerHTML = `
      <table class="patient-grid">
         <tr>
          <td class="k">Case No.</td>
          <td class="v">${caseId || "-"}</td>
        </tr>
        
        <tr>
          <td class="k">Age / Sex</td>
          <td class="v">${patientAge ? `${patientAge} Years` : "-"} ${patientSex || ""}</td>
        </tr>
       
        <tr>
          <td class="k">Referring Doctor</td>
          <td class="v">${refPhys}</td>
        </tr>
        <tr>
          <td class="k">Date &amp; Time of Scan</td>
          <td class="v">${nowText}</td>
        </tr>
        <tr>
          <td class="k">Investigation</td>
          <td class="v">${clinical}</td>
        </tr>
      </table>`;
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

