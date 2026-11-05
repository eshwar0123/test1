import { buildBrahmShaktiSignatureHtml } from "../utils/constants";

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

// The PDF is one tall html2canvas image sliced into A4 pages, so a block that
// straddles a page boundary gets cut in half (e.g. the signature image on one
// page and the doctor's name on the next). Before rendering, push any such
// block down to the top of the next page with a spacer.
const PDF_PAGE_PX = (794 * 297) / 210; // A4 page height at the 794px render width

async function keepBlocksTogether(mount) {
  const imgs = Array.from(mount.querySelectorAll("img"));
  await Promise.all(
    imgs.map((img) =>
      img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; })
    )
  );

  const targets = [];
  const add = (el) => { if (el && !targets.includes(el)) targets.push(el); };
  mount.querySelectorAll(".report-sign-section").forEach(add);
  mount.querySelectorAll('img[alt="Radiologist Signature"]').forEach((img) => {
    if (!img.closest(".report-sign-section")) add(img.parentElement?.parentElement || img);
  });

  for (const el of targets) {
    const mountTop = mount.getBoundingClientRect().top;
    const r = el.getBoundingClientRect();
    const top = r.top - mountTop;
    const bottom = r.bottom - mountTop;
    if (bottom - top >= PDF_PAGE_PX) continue; // taller than a page — can't keep whole
    const boundary = (Math.floor(top / PDF_PAGE_PX) + 1) * PDF_PAGE_PX;
    if (bottom > boundary + 0.5) {
      const spacer = document.createElement("div");
      spacer.style.height = `${Math.ceil(boundary - top)}px`;
      el.parentNode.insertBefore(spacer, el);
    }
  }
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
      .page { width: 794px; min-height: 1123px; box-sizing: border-box; padding-top: 170px; margin: 0 auto; background: #fff; font-family: Arial, sans-serif; }
      .report-answer { border-bottom: none !important; }
      .report-top { display: none !important; }
      .report-head { display: none !important; }
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
    await keepBlocksTogether(mount);

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
  const sexLabel = /^m(ale)?$/i.test(String(patientSex || "").trim()) ? "Male" : /^f(emale)?$/i.test(String(patientSex || "").trim()) ? "Female" : (patientSex || "-");
  const ageSex = `${String(patientAge || "-").replace(/y$/i, "")}/${sexLabel}`;
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
            <td><b>Patient Id:</b> ${caseId || "-"}</td>
            <td><b>Study Date &amp; Time:</b> <span class="report-answer report-scan-editor" contenteditable="true"></span></td>
          </tr>
          <tr>
            <td><b>Patient Name:</b> ${patientName || "-"}</td>
            <td><b>Referring Doctor:</b> <span class="report-answer report-ref-doctor" contenteditable="true"></span></td>
          </tr>
          <tr>
            <td><b>Age / Sex:</b> ${ageSex}</td>
            <td><b>Report Submit:</b> <span class="report-answer report-submit-editor" contenteditable="true"></span></td>
          </tr>
        </table>

        <div class="report-sec-title">Technique</div>
        <div class="report-answer block" contenteditable="true"></div>

        <div class="report-sec-title">REPORT</div>
        <div class="report-answer block" contenteditable="true">(Organ/system-wise structured description)</div>

        <div class="report-sec-title">Impression</div>
        <div class="report-answer block" contenteditable="true">(If any)</div>

        <div class="report-sec-title">ADVICE</div>
        <div class="report-answer block report-advice-box" contenteditable="true">(Clear, concise, clinically actionable summary)</div>

        ${radiologistProfile.isBrahmShakti ? buildBrahmShaktiSignatureHtml(radiologistProfile) : `
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
        </div>`}

        <div style="margin-top:10px;font-size:11px;color:#6b7280;">${hospitalProfile.website}</div>
      </div>
    </div>
  `;
}

/* =========================
   Standard report layout (title bar, bordered header grid, blue section headings,
   boxed section content, right-aligned signature). Used so that reports built from
   the Templates panel, and reports rebuilt from saved fields, export with the same
   design as the normal report.
========================= */
const STD_STYLE = {
  title: "text-align:center;font-weight:700;color:#1a3fd6;font-size:15px;letter-spacing:0.5px;border-bottom:2px solid #1a3fd6;padding-bottom:8px;margin-bottom:16px;text-transform:uppercase;",
  sec: "margin-top:14px;font-size:13px;font-weight:700;color:#1a3fd6;border-bottom:2px solid #1a3fd6;padding-bottom:6px;margin-bottom:8px;",
  body: "display:block;min-height:58px;width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:12px;line-height:1.6;",
  advice: "background:#eef3ff;border:1px solid #c7d6f5;",
  grid: "width:100%;border-collapse:collapse;margin-top:4px;margin-bottom:8px;font-size:12px;table-layout:fixed;",
  cell: "border:1px solid #222;padding:8px 10px;vertical-align:middle;",
};

const escHtml = (v) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Saved report text (markdown-ish plain text, or editor HTML) -> HTML for a section box.
export function reportTextToHtml(raw) {
  const src = String(raw ?? "").trim();
  if (!src) return "";
  if (/<[a-z][\s\S]*>/i.test(src)) return src;
  return escHtml(src)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\r?\n/g, "<br>");
}

// rows: [[ [label, value], [label, value] | null ], ...] — a null second cell makes the
// first span the whole row (used when e.g. Referring Doctor is left out).
export function buildStandardGridHtml(rows) {
  const cell = ([label, value], full) =>
    `<td${full ? ' colspan="2"' : ""} style="${STD_STYLE.cell}width:${full ? 100 : 50}%;"><b>${escHtml(label)}:</b> ${escHtml(value)}</td>`;
  return (
    `<table class="patient-grid" style="${STD_STYLE.grid}">` +
    rows.map(([l, r]) => `<tr>${r ? cell(l, false) + cell(r, false) : cell(l, true)}</tr>`).join("") +
    `</table>`
  );
}

export function buildStandardSignatureHtml({ imgHtml = "", name = "", reg = "", qualification = "", designation = "" }) {
  return (
    `<div class="report-sign-section">` +
      `<div class="report-sec-title" style="${STD_STYLE.sec}">Signature</div>` +
      `<div style="display:flex;justify-content:flex-end;margin-top:10px;width:100%;">` +
        `<div style="min-width:260px;text-align:center;display:flex;flex-direction:column;align-items:center;">` +
          imgHtml +
          (name ? `<div style="font-size:12px;font-weight:700;">${escHtml(name)}</div>` : "") +
          (reg ? `<div style="font-size:11px;font-weight:700;">DMC No: ${escHtml(reg)}</div>` : "") +
          (qualification ? `<div style="font-size:11px;line-height:1.35;">${escHtml(qualification)}</div>` : "") +
          (designation ? `<div style="font-size:11px;line-height:1.35;">${escHtml(designation)}</div>` : "") +
        `</div>` +
      `</div>` +
    `</div>`
  );
}

// sections: [{ name, html, advice? }] — gridHtml / signatureHtml are ready-made HTML.
export function buildStandardReportHtml({ title, gridHtml, sections, signatureHtml }) {
  return (
    `<style>.tplstd p{margin:0 0 4px;}.tplstd ul,.tplstd ol{margin:0 0 4px;padding-left:20px;}</style>` +
    `<div class="tplstd" style="padding:12px;font-family:Arial,sans-serif;color:#111827;">` +
      `<div class="report-title-bar" style="${STD_STYLE.title}">${escHtml(title || "Radiology Report")}</div>` +
      (gridHtml || "") +
      sections
        .map(
          (s) =>
            `<div class="report-sec-title" style="${STD_STYLE.sec}">${escHtml(s.name)}</div>` +
            `<div class="report-answer block" style="${STD_STYLE.body}${s.advice ? STD_STYLE.advice : ""}">${s.html || ""}</div>`
        )
        .join("") +
      (signatureHtml || "") +
    `</div>`
  );
}

// A report rebuilt from its saved fields (ai-cache row + radiologist profile) — used when
// no exported PDF exists for the case (e.g. it was submitted from mobile).
export function buildSavedReportHtml({ rep, caseItem, profile = {} }) {
  const p2 = (n) => String(n).padStart(2, "0");
  const fmtDateTime = (v) => {
    const d = v ? new Date(v) : null;
    if (!d || isNaN(d)) return null;
    const hasTime = /[T ]\d{2}:\d{2}/.test(String(v)) || /\d{1,2}:\d{2}/.test(String(v));
    return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}` + (hasTime ? ` ${p2(d.getHours())}:${p2(d.getMinutes())}` : "");
  };
  const modalityLabel =
    { XR: "XRAY", US: "ULTRASOUND", NM: "NUCLEAR MEDICINE", PET: "PET" }[String(caseItem.modality || "").toUpperCase()] ||
    String(caseItem.modality || "").toUpperCase();
  const studyUpper = String(caseItem.studyType || "").toUpperCase();
  const title = (studyUpper.startsWith(modalityLabel) ? studyUpper : `${modalityLabel} ${studyUpper}`).trim() || "RADIOLOGY REPORT";

  const sexRaw = String(rep.patient_sex || "").trim();
  const sexStr = /^m(ale)?$/i.test(sexRaw) ? "Male" : /^f(emale)?$/i.test(sexRaw) ? "Female" : sexRaw || "-";
  const ageRaw = rep.patient_age ?? "";
  const ageStr = ageRaw !== "" && ageRaw !== null ? String(ageRaw).replace(/y$/i, "") : "-";
  const submittedRaw = rep.completed_at || String(caseItem.completedAt || "").replace(",", "");
  const hasRef = /[^\s\-—–]/.test(String(rep.referring_doctor ?? ""));

  const gridHtml = buildStandardGridHtml([
    [["Patient Id", caseItem.patientId && caseItem.patientId !== "—" ? caseItem.patientId : caseItem.caseId],
      ["Study Date & Time", fmtDateTime(rep.scan_datetime) || caseItem.completedAt || "-"]],
    [["Patient Name", rep.patient_name || caseItem.patientName], hasRef ? ["Referring Doctor", rep.referring_doctor] : null],
    [["Age / Sex", `${ageStr}/${sexStr}`], ["Report Submit", fmtDateTime(submittedRaw) || caseItem.completedAt || "-"]],
  ]);

  const technique = rep.technique || rep.ai_technique;
  const impression = rep.impression || rep.ai_impression;
  const sections = [];
  if (reportTextToHtml(technique)) sections.push({ name: "Technique", html: reportTextToHtml(technique) });
  sections.push({ name: "REPORT", html: reportTextToHtml(rep.findings || rep.ai_findings) });
  if (reportTextToHtml(impression)) sections.push({ name: "Impression", html: reportTextToHtml(impression) });
  sections.push({ name: "ADVICE", html: reportTextToHtml(rep.opinions || rep.ai_opinions), advice: true });

  const displayName = `Dr. ${(profile.name || String(caseItem.assignedTo || "")).replace(/^\s*dr\.?\s*/i, "")}`.trim();
  const signatureHtml = buildStandardSignatureHtml({
    imgHtml: profile.signatureUrl
      ? `<img src="${escHtml(profile.signatureUrl)}" alt="Radiologist Signature" style="max-height:52px;max-width:220px;object-fit:contain;display:block;margin:0 auto 4px;" onerror="this.style.display='none'" />`
      : "",
    name: displayName,
    reg: profile.dmcNo || "",
    qualification: profile.qualification || "",
    designation: profile.designation || "",
  });

  return buildStandardReportHtml({ title, gridHtml, sections, signatureHtml });
}

// A report built from the Templates panel is a free-form block (a header grid, then a bold
// <p> heading followed by an editable <div> per section). Re-flow it into the standard layout.
// Returns null when the markup is not a built-in template, so the caller keeps it as is.
function templateToStandardHtml(holder) {
  const grid = Array.from(holder.querySelectorAll("table")).find((t) => t.querySelector(".report-submit-editor"));
  if (!grid || !grid.parentElement) return null;

  const norm = (el) => (el.textContent || "").replace(/[:：]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  const NAMES = {
    "clinical history": "Clinical History",
    technique: "Technique",
    sequences: "Technique",
    "study reveals": "REPORT",
    findings: "REPORT",
    report: "REPORT",
    impression: "Impression",
    "clinical advice": "ADVICE",
    advice: "ADVICE",
    recommendation: "ADVICE",
    recommendations: "ADVICE",
  };

  let title = "";
  let signCard = null;
  const sections = [];
  const items = Array.from(grid.parentElement.children);
  for (let i = 0; i < items.length; i++) {
    const el = items[i];
    if (el === grid || el.tagName === "TABLE" || el.tagName === "STYLE") continue;

    if (el.tagName === "DIV" && (el.querySelector(".report-sign-section") || el.querySelector('img[alt="Radiologist Signature"]'))) {
      signCard = el;
      continue;
    }
    if (el.tagName !== "P") continue;

    // centred title line (the one the radiologist can edit); the "ORGANIZATION NAME" line is dropped
    if (/center/.test(el.style.textAlign || "")) {
      if (!title && el.hasAttribute("contenteditable")) title = (el.textContent || "").trim();
      continue;
    }

    const next = items[i + 1];
    if (next && next.tagName === "DIV") {
      i += 1;
      const key = norm(el);
      if (key === "signature") continue; // empty signature placeholder
      if (next.querySelector(".report-sign-section") || next.querySelector('img[alt="Radiologist Signature"]')) {
        signCard = next;
        continue;
      }
      sections.push({
        name: NAMES[key] || (el.textContent || "").replace(/[:：]\s*$/, "").trim(),
        html: next.innerHTML,
        text: (next.textContent || "").trim(),
        hasImg: !!next.querySelector("img"),
      });
    } else if (sections.length) {
      // stand-alone line under a section (e.g. "BI-RADS Category: 4")
      sections[sections.length - 1].html += `<p>${el.innerHTML}</p>`;
    }
  }

  // keep REPORT always; drop other sections that were left empty
  const kept = sections
    .filter((s) => s.name === "REPORT" || s.text || s.hasImg)
    .map((s) => ({ name: s.name, html: s.html, advice: s.name === "ADVICE" }));

  // signature: standard card on the right under a blue "Signature" title
  let signatureHtml = "";
  if (signCard) {
    const card = signCard.querySelector(".report-sign-section");
    if (card) {
      const inner = card.firstElementChild; // the centred column
      const label = inner?.firstElementChild;
      if (label && /^signature$/i.test((label.textContent || "").trim())) label.remove(); // title moves out
      signatureHtml =
        `<div class="report-sign-section">` +
          `<div class="report-sec-title" style="${STD_STYLE.sec}">Signature</div>` +
          `<div style="display:flex;justify-content:flex-end;margin-top:10px;width:100%;">${inner ? inner.outerHTML : ""}</div>` +
        `</div>`;
    } else {
      signatureHtml = signCard.innerHTML; // e.g. the Brahm Shakti sign-off block, kept as is
    }
  }

  grid.setAttribute("style", STD_STYLE.grid);
  return buildStandardReportHtml({
    title: title || "Radiology Report",
    gridHtml: grid.outerHTML,
    sections: kept,
    signatureHtml,
  });
}

export function buildExportReportHtml({ reportRoot, formatDateTime }) {
  if (!reportRoot) return "";
  const holder = document.createElement("div");
  holder.innerHTML = reportRoot.innerHTML || "";

  // Reports built from the Templates panel export with the same design as the normal report.
  if (!holder.querySelector(".report-answer.block")) {
    try {
      const std = templateToStandardHtml(holder);
      if (std) holder.innerHTML = std;
    } catch (_e) { /* keep the template markup if re-flowing fails */ }
  }

  // The live patient-grid already renders Patient ID / Age-Sex / Patient Name from props —
  // only the Study Date cell is left for the radiologist to fill in, so backfill it with
  // "now" if still blank rather than shipping an empty cell in the exported PDF.
  const scanEditor = holder.querySelector(".report-scan-editor");
  if (scanEditor && !(scanEditor.textContent || "").trim()) {
    const n = new Date();
    scanEditor.textContent = `${String(n.getDate()).padStart(2, "0")}/${String(n.getMonth() + 1).padStart(2, "0")}/${n.getFullYear()}`;
  }

  // Referring Doctor is optional: when it was left empty, drop the field from the header
  // table and let the cell left in that row take the full width.
  const refDoctorEl = holder.querySelector(".report-ref-doctor");
  if (refDoctorEl && /^[\s\-—–]*$/.test(refDoctorEl.textContent || "")) {
    const refCell = refDoctorEl.closest("td");
    const refRow = refCell?.parentElement;
    if (refCell && refRow) {
      refCell.remove();
      const left = refRow.querySelectorAll("td");
      if (left.length === 0) {
        refRow.remove();
      } else if (left.length === 1) {
        left[0].setAttribute("colspan", "2");
        left[0].style.width = "100%";
      }
    }
  }

  // Report Submit: if the report hasn't been submitted before, this export IS the
  // submission, so stamp the current date & time (dd/mm/yyyy HH:MM).
  const submitEditor = holder.querySelector(".report-submit-editor");
  if (submitEditor && !(submitEditor.textContent || "").trim()) {
    const n = new Date();
    const p2 = (v) => String(v).padStart(2, "0");
    submitEditor.textContent = `${p2(n.getDate())}/${p2(n.getMonth() + 1)}/${n.getFullYear()} ${p2(n.getHours())}:${p2(n.getMinutes())}`;
  }

  // An empty "Clinical History" section shouldn't appear in the exported report:
  // drop the heading and its (empty) body block.
  holder.querySelectorAll("p").forEach((p) => {
    const t = (p.textContent || "").replace(/[:：]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
    if (t !== "clinical history") return;
    const body = p.nextElementSibling;
    if (!body || body.tagName !== "DIV") return;
    if ((body.textContent || "").trim() || body.querySelector("img")) return;
    body.remove();
    p.remove();
  });

  // Impression is optional: when it was left empty (or still shows the "(If any)"
  // placeholder) leave the whole section out of the exported report.
  const isBlank = (el) => {
    const t = (el.textContent || "").replace(/\s+/g, " ").trim();
    return !t || /^\(.*\)$/.test(t);
  };
  holder.querySelectorAll(".report-sec-title").forEach((h) => {
    if ((h.textContent || "").trim().toLowerCase() !== "impression") return;
    const body = h.nextElementSibling;
    if (body && body.classList.contains("report-answer") && isBlank(body)) {
      body.remove();
      h.remove();
    }
  });
  holder.querySelectorAll("p").forEach((p) => {
    const t = (p.textContent || "").replace(/[:：]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
    if (t !== "impression") return;
    const body = p.nextElementSibling;
    if (!body || body.tagName !== "DIV" || !isBlank(body) || body.querySelector("img")) return;
    body.remove();
    p.remove();
  });

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
          .page { width: 190mm; min-height: 277mm; box-sizing: border-box; padding-top: 45mm; margin: 0 auto; background: #fff; }
          .report-answer { border-bottom: none !important; }
          .report-top { display: none !important; }
          .report-head { display: none !important; }
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

export async function downloadReportPdfFromHtml({ bodyHtml, caseId, fileName }) {
  if (!bodyHtml) return;

  const mount = document.createElement("div");
  mount.style.position = "fixed";
  mount.style.left = "-10000px";
  mount.style.top = "0";
  mount.style.width = "794px";
  mount.style.background = "#ffffff";
  mount.innerHTML = `
    <style>
      .page { width: 794px; min-height: 1123px; box-sizing: border-box; padding-top: 170px; margin: 0 auto; background: #fff; font-family: Arial, sans-serif; }
      .report-answer { border-bottom: none !important; }
      .report-top { display: none !important; }
      .report-head { display: none !important; }
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
    await keepBlocksTogether(mount);
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
    pdf.save(fileName || `radiology_report_${safeId}.pdf`);
  } finally {
    document.body.removeChild(mount);
  }
}
