// Report PDF / Word download for the Technician portal.
// Extracted verbatim from organization/views/dashboard/Dashboard.js
// (handleDownloadCase / handleDownloadWord) so a technician downloads the
// exact same report the organization does.
import { downloadReportPdfFromHtml } from "../../radiologist/pages/DicomViewer/services/reportService";

export const API_BASE_DASH =
  (typeof import.meta !== "undefined" && import.meta.env &&
    (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE)) || "";

export const readToken = () => {
  const direct =
    localStorage.getItem("token") ||
    localStorage.getItem("access_token") ||
    localStorage.getItem("authToken") ||
    localStorage.getItem("jwt");
  if (direct) return direct;
  for (const k of ["auth", "user", "authUser"]) {
    const raw = localStorage.getItem(k);
    if (!raw) continue;
    try {
      const p = JSON.parse(raw);
      const tok = p.token || p.access_token || p.accessToken || p.jwt;
      if (tok) return tok;
    } catch {}
  }
  return null;
};

export function makeReportDownloaders({ setDownloadingCase, setDownloadingFmt, setDashToast, dashData }) {
  // Downloaded report file name:  <Patient ID>_<Patient Name (no age)>_<Study Type>.<ext>
  const reportFileName = (caseItem, ext) => {
    const clean = (v) => String(v ?? "")
      .replace(/[\\/:*?"<>|]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    // "AISHWARIYA KHURANA 33/F" / "NARENDER KUMAR 34Y/M" -> drop the trailing age/sex
    const name = clean(caseItem.patientName).replace(/\s+\d{1,3}\s*[YMWD]?\s*[\/-]?\s*[MFO]?\s*$/i, "").trim();
    const parts = [clean(caseItem.patientId && caseItem.patientId !== "—" ? caseItem.patientId : caseItem.caseId), name, clean(caseItem.studyType)]
      .filter((x) => x && x !== "—");
    return `${parts.join("_") || "report"}.${ext}`;
  };

  // Download the radiologist's PDF report for a case from the backend.
  // Falls back to a generated text-stub blob when:
  //   - we're on the static fallback data (no live API yet), or
  //   - the case has no report_path on the backend (still in progress)
  // so users on a fresh org always see something.
  const handleDownloadCase = async (caseItem) => {
    setDownloadingCase(caseItem.caseId);
    setDownloadingFmt("pdf");
    setDashToast(null);

    const isFallback = !dashData;
    const hasReport  = caseItem.hasReport === true;

    if (!isFallback && hasReport) {
      // Real PDF path — hit the backend
      try {
        const tok = readToken();
        const r = await fetch(
          `${API_BASE_DASH}/organization/dashboard/report/${encodeURIComponent(caseItem.caseId)}`,
          { headers: tok ? { Authorization: `Bearer ${tok}` } : {} },
        );
        if (!r.ok) {
          // No exported PDF file on disk (report_path unset) — most commonly
          // because the report was submitted from mobile, which never runs the
          // web-only client-side PDF export step. Try the case_id-only ai-cache
          // endpoint (no user_id filter, works "regardless of who saved it") for
          // the report's real saved fields, and build a real-content PDF from
          // those instead of erroring or falling back to placeholder stub text.
          if (r.status === 404) {
            try {
              const cacheRes = await fetch(
                `${API_BASE_DASH}/radiology/reports/${encodeURIComponent(caseItem.caseId)}/ai-cache`,
              );
              const cacheJson = await cacheRes.json().catch(() => null);
              const rep = cacheJson?.data;
              if (rep && (rep.technique || rep.findings || rep.impression || rep.opinions)) {
                // ai-cache tells us which radiologist (user_id) actually submitted this
                // report — chain into their profile for a real signature image instead
                // of just a text line. profile/{user_id} has no ownership check (any
                // valid id works), and signature_path's directory portion isn't
                // reliable (same issue fixed elsewhere this session), so rebuild the
                // URL from just the filename against the known-correct uploads layout.
                let signatureImgHtml = "";
                let qualification = "";
                let designation = "";
                if (rep.user_id) {
                  try {
                    const profRes = await fetch(`${API_BASE_DASH}/radiology/profile/${encodeURIComponent(rep.user_id)}`);
                    const profJson = await profRes.json().catch(() => null);
                    const prof = profJson?.data;
                    qualification = prof?.qualification || "";
                    designation = prof?.designation || "";
                    if (prof?.signature_path) {
                      const fname = String(prof.signature_path).split("/").pop();
                      if (fname) {
                        const sigUrl = `/uploads/radiologist/signature/${encodeURIComponent(fname)}`;
                        signatureImgHtml = `<img src="${sigUrl}" style="max-height:52px; max-width:220px; display:block; margin-bottom:4px;" />`;
                      }
                    }
                  } catch (_e) {
                    // no signature image available — text-only sign-off below still renders
                  }
                }
                const bodyHtml = `
                  <div style="font-family:Arial, sans-serif; color:#111827;">
                    <h2 style="margin:0 0 12px; font-size:16px;">Radiology Report</h2>
                    <table style="width:100%; border-collapse:collapse; font-size:12px;">
                      <tr><td style="font-weight:700; width:150px; padding:3px 0;">Patient ID</td><td>: ${caseItem.patientId && caseItem.patientId !== "—" ? caseItem.patientId : caseItem.caseId}</td></tr>
                      <tr><td style="font-weight:700; padding:3px 0;">Study Type</td><td>: ${caseItem.studyType}</td></tr>
                      <tr><td style="font-weight:700; padding:3px 0;">Modality</td><td>: ${caseItem.modality}</td></tr>
                      <tr><td style="font-weight:700; padding:3px 0;">Priority</td><td>: ${caseItem.priority}</td></tr>
                      <tr><td style="font-weight:700; padding:3px 0;">Uploaded</td><td>: ${caseItem.uploadedAt}</td></tr>
                      <tr><td style="font-weight:700; padding:3px 0;">Completed</td><td>: ${caseItem.completedAt}</td></tr>
                      <tr><td style="font-weight:700; padding:3px 0;">Radiologist</td><td>: ${caseItem.assignedTo}</td></tr>
                    </table>
                    <div style="margin-top:16px; font-weight:700; background:#e8f2ff; border:1px solid #bfdbfe; padding:6px 8px; border-radius:6px; font-size:13px;">Technique</div>
                    <p style="font-size:12px; line-height:1.5; white-space:pre-wrap;">${rep.technique || rep.ai_technique || "—"}</p>
                    <div style="margin-top:10px; font-weight:700; background:#e8f2ff; border:1px solid #bfdbfe; padding:6px 8px; border-radius:6px; font-size:13px;">Findings</div>
                    <p style="font-size:12px; line-height:1.5; white-space:pre-wrap;">${rep.findings || rep.ai_findings || "—"}</p>
                    <div style="margin-top:10px; font-weight:700; background:#e8f2ff; border:1px solid #bfdbfe; padding:6px 8px; border-radius:6px; font-size:13px;">Impression</div>
                    <p style="font-size:12px; line-height:1.5; white-space:pre-wrap;">${rep.impression || rep.ai_impression || "—"}</p>
                    <div style="margin-top:10px; font-weight:700; background:#e8f2ff; border:1px solid #bfdbfe; padding:6px 8px; border-radius:6px; font-size:13px;">Opinions</div>
                    <p style="font-size:12px; line-height:1.5; white-space:pre-wrap;">${rep.opinions || rep.ai_opinions || "—"}</p>
                    <div style="margin-top:28px;">
                      ${signatureImgHtml}
                      <p style="font-size:12px; margin:0;">Electronically signed by ${caseItem.assignedTo}${qualification ? ` (${qualification})` : ""}${designation ? `, ${designation}` : ""}<br/>Completed: ${caseItem.completedAt}</p>
                    </div>
                  </div>
                `;
                await downloadReportPdfFromHtml({ bodyHtml, caseId: caseItem.caseId, fileName: reportFileName(caseItem, "pdf") });
                setDownloadingCase(null);
                return;
              }
            } catch (_e) {
              // fall through to the generic error below
            }
          }
          let msg = `Download failed (HTTP ${r.status})`;
          try { const j = await r.json(); if (j?.detail) msg = j.detail; } catch {}
          setDashToast({ kind: "error", text: msg });
          setDownloadingCase(null);
          setTimeout(() => setDashToast(null), 4000);
          return;
        }
        const blob = await r.blob();
        const url  = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = reportFileName(caseItem, "pdf");
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
        setDownloadingCase(null);
        return;
      } catch (e) {
        setDashToast({ kind: "error", text: e?.message || "Network error during download" });
        setDownloadingCase(null);
        setTimeout(() => setDashToast(null), 4000);
        return;
      }
    }

    // ── Fallback: letterheaded PDF stub for fresh orgs with no real report yet ──
    // Same downloadReportPdfFromHtml() pipeline the DICOM viewer's report export
    // uses (jsPDF + html2canvas + the org letterhead at /letterhead.png) instead
    // of a bare .txt file, so a case with no report attached yet still downloads
    // something that looks like an actual report.
    const bodyHtml = `
      <div style="font-family:Arial, sans-serif; color:#111827;">
        <h2 style="margin:0 0 12px; font-size:16px;">Radiology Report</h2>
        <table style="width:100%; border-collapse:collapse; font-size:12px;">
          <tr><td style="font-weight:700; width:150px; padding:3px 0;">Patient ID</td><td>: ${caseItem.patientId && caseItem.patientId !== "—" ? caseItem.patientId : caseItem.caseId}</td></tr>
          <tr><td style="font-weight:700; padding:3px 0;">Study Type</td><td>: ${caseItem.studyType}</td></tr>
          <tr><td style="font-weight:700; padding:3px 0;">Modality</td><td>: ${caseItem.modality}</td></tr>
          <tr><td style="font-weight:700; padding:3px 0;">Priority</td><td>: ${caseItem.priority}</td></tr>
          <tr><td style="font-weight:700; padding:3px 0;">Uploaded</td><td>: ${caseItem.uploadedAt}</td></tr>
          <tr><td style="font-weight:700; padding:3px 0;">Completed</td><td>: ${caseItem.completedAt}</td></tr>
          <tr><td style="font-weight:700; padding:3px 0;">Radiologist</td><td>: ${caseItem.assignedTo}</td></tr>
        </table>
        <div style="margin-top:16px; font-weight:700; background:#e8f2ff; border:1px solid #bfdbfe; padding:6px 8px; border-radius:6px; font-size:13px;">Findings</div>
        <p style="font-size:12px; line-height:1.5;">Clinical indication and imaging findings for ${caseItem.studyType}.<br/>(Stub — actual radiologist report not yet attached on the backend.)</p>
        <div style="margin-top:10px; font-weight:700; background:#e8f2ff; border:1px solid #bfdbfe; padding:6px 8px; border-radius:6px; font-size:13px;">Impression</div>
        <p style="font-size:12px; line-height:1.5;">1. Pending radiologist sign-off.<br/>2. Please correlate clinically.</p>
        <p style="margin-top:28px; font-size:12px;">Electronically signed by ${caseItem.assignedTo}<br/>Completed: ${caseItem.completedAt}</p>
      </div>
    `;

    try {
      await downloadReportPdfFromHtml({ bodyHtml, caseId: caseItem.caseId, fileName: reportFileName(caseItem, "pdf") });
    } catch (e) {
      setDashToast({ kind: "error", text: e?.message || "Could not generate report PDF" });
      setTimeout(() => setDashToast(null), 4000);
    } finally {
      setDownloadingCase(null);
    }
  };

  // Download the radiologist's report as a real Word document (.docx), built
  // with the `docx` library from the saved report text (technique / findings /
  // impression / opinions) plus the radiologist's signature image from their
  // profile (radiology profile → signature_path).
  const handleDownloadWord = async (caseItem) => {
    setDownloadingCase(caseItem.caseId);
    setDownloadingFmt("word");
    setDashToast(null);
    try {
      const cacheRes = await fetch(
        `${API_BASE_DASH}/radiology/reports/${encodeURIComponent(caseItem.caseId)}/ai-cache`,
      );
      const rep = (await cacheRes.json().catch(() => null))?.data;
      if (!rep || !(rep.technique || rep.findings || rep.impression || rep.opinions ||
                    rep.ai_technique || rep.ai_findings || rep.ai_impression || rep.ai_opinions)) {
        throw new Error("No report content available yet for this case.");
      }

      // ── Radiologist profile: qualification, designation, signature image ──
      let qualification = "";
      let designation = "";
      let radName = "";
      let dmcNo = "";
      let sigData = null;   // { data: ArrayBuffer, type: "png"|"jpg"|"gif", width, height }
      if (rep.user_id) {
        try {
          const profRes = await fetch(`${API_BASE_DASH}/radiology/profile/${encodeURIComponent(rep.user_id)}`);
          const prof = (await profRes.json().catch(() => null))?.data;
          qualification = prof?.qualification || "";
          designation = prof?.designation || "";
          radName = `${prof?.first_name || ""} ${prof?.last_name || ""}`.trim();
          dmcNo = prof?.dmc_no || "";
          if (prof?.signature_path) {
            // Directory part of signature_path isn't reliable — rebuild from the filename.
            const fname = String(prof.signature_path).split(/[\\/]/).pop();
            const ext = (fname.split(".").pop() || "").toLowerCase();
            const type = ext === "jpg" || ext === "jpeg" ? "jpg" : ext === "gif" ? "gif" : ext === "png" ? "png" : null;
            if (fname && type) {
              const sigRes = await fetch(`/uploads/radiologist/signature/${encodeURIComponent(fname)}`);
              if (sigRes.ok) {
                const blob = await sigRes.blob();
                const buf = await blob.arrayBuffer();
                let w = 180, h = 50;
                try {
                  const bmp = await createImageBitmap(blob);
                  const scale = Math.min(180 / bmp.width, 60 / bmp.height, 1);
                  w = Math.max(1, Math.round(bmp.width * scale));
                  h = Math.max(1, Math.round(bmp.height * scale));
                  bmp.close?.();
                } catch (_e) { /* keep default size */ }
                sigData = { data: buf, type, width: w, height: h };
              }
            }
          }
        } catch (_e) { /* signature is optional — sign-off text still renders */ }
      }

      const {
        Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType,
        Table, TableRow, TableCell, WidthType, BorderStyle,
      } = await import("docx");

      // ── Report sections may be plain text or editor HTML → paragraphs ──
      // True when a section has real text (ignores empty markup and whitespace).
      const hasText = (raw) =>
        String(raw ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").trim().length > 0;

      const htmlToParagraphs = (raw) => {
        const src = String(raw ?? "").trim();
        if (!src) return [new Paragraph({ children: [new TextRun("—")] })];
        if (!/<[a-z][\s\S]*>/i.test(src)) {
          return src.split(/\r?\n/).map((line) =>
            new Paragraph({
              spacing: { after: 80 },
              // render **bold** markers instead of showing the asterisks
              children: line.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((part) =>
                /^\*\*[^*]+\*\*$/.test(part)
                  ? new TextRun({ text: part.slice(2, -2), bold: true })
                  : new TextRun(part)),
            }));
        }
        const doc = new DOMParser().parseFromString(src, "text/html");
        const out = [];
        const runsOf = (node, fmt = {}) => {
          const runs = [];
          node.childNodes.forEach((n) => {
            if (n.nodeType === 3) {
              const t = n.textContent.replace(/\s+/g, " ");
              if (t) runs.push(new TextRun({ text: t, ...fmt }));
            } else if (n.nodeType === 1) {
              const tag = n.tagName.toLowerCase();
              if (tag === "br") { runs.push(new TextRun({ text: "", break: 1 })); return; }
              if (["ul", "ol", "p", "div", "li", "h1", "h2", "h3", "h4", "table"].includes(tag)) return;
              const f = { ...fmt };
              if (tag === "b" || tag === "strong") f.bold = true;
              if (tag === "i" || tag === "em") f.italics = true;
              if (tag === "u") f.underline = {};
              runs.push(...runsOf(n, f));
            }
          });
          return runs;
        };
        const walk = (node, prefix = "", fmt = {}) => {
          node.childNodes.forEach((n, idx) => {
            if (n.nodeType === 3) {
              const t = n.textContent.trim();
              if (t) out.push(new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: prefix + t, ...fmt })] }));
              return;
            }
            if (n.nodeType !== 1) return;
            const tag = n.tagName.toLowerCase();
            if (tag === "ul" || tag === "ol") {
              let i = 0;
              n.childNodes.forEach((li) => {
                if (li.nodeType !== 1) return;
                i += 1;
                const bullet = tag === "ol" ? `${i}. ` : "• ";
                out.push(new Paragraph({
                  spacing: { after: 60 }, indent: { left: 360 },
                  children: [new TextRun(bullet), ...runsOf(li, fmt)],
                }));
              });
            } else if (["p", "div", "h1", "h2", "h3", "h4", "li"].includes(tag)) {
              const heading = tag.startsWith("h");
              const hasBlockChild = Array.from(n.children).some((c) =>
                ["p", "div", "ul", "ol", "h1", "h2", "h3", "h4"].includes(c.tagName.toLowerCase()));
              if (hasBlockChild) {
                walk(n, prefix, fmt);
              } else {
                const runs = runsOf(n, heading ? { ...fmt, bold: true } : fmt);
                if (runs.length) out.push(new Paragraph({ spacing: { after: 80 }, children: runs }));
              }
            } else {
              const runs = runsOf({ childNodes: [n] }, fmt);
              if (runs.length) out.push(new Paragraph({ spacing: { after: 80 }, children: runs }));
            }
          });
        };
        walk(doc.body);
        return out.length ? out : [new Paragraph({ children: [new TextRun("—")] })];
      };

      // Same content as the PDF report, in a plain layout.
      const modalityLabel = { XR: "XRAY", US: "ULTRASOUND", NM: "NUCLEAR MEDICINE", PET: "PET" }[
        String(caseItem.modality || "").toUpperCase()] || String(caseItem.modality || "").toUpperCase();
      const studyUpper = String(caseItem.studyType || "").toUpperCase();
      const reportTitle = (studyUpper.startsWith(modalityLabel) ? studyUpper : `${modalityLabel} ${studyUpper}`).trim() || "RADIOLOGY REPORT";

      const ageRaw = rep.patient_age ?? "";
      const sexRaw = String(rep.patient_sex || "").trim();
      const sexStr = /^m(ale)?$/i.test(sexRaw) ? "Male" : /^f(emale)?$/i.test(sexRaw) ? "Female" : (sexRaw || "-");
      const ageStr = ageRaw !== "" && ageRaw !== null ? String(ageRaw).replace(/y$/i, "") : "-";
      const ageSex = `${ageStr}/${sexStr}`;

      const fmtDate = (v) => {
        const d = v ? new Date(v) : null;
        if (!d || isNaN(d)) return null;
        return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
      };
      // Study Date & Time and Report Submit, both as dd/mm/yyyy HH:MM.
      const fmtDateTime = (v) => {
        const d = v ? new Date(v) : null;
        if (!d || isNaN(d)) return null;
        const p2 = (n) => String(n).padStart(2, "0");
        const hasTime = /[T ]\d{2}:\d{2}/.test(String(v)) || /\d{1,2}:\d{2}/.test(String(v));
        return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}` + (hasTime ? ` ${p2(d.getHours())}:${p2(d.getMinutes())}` : "");
      };
      const studyDate = fmtDateTime(rep.scan_datetime) || caseItem.completedAt || "-";
      const submittedRaw = rep.completed_at || String(caseItem.completedAt || "").replace(",", "");
      const reportSubmit = fmtDateTime(submittedRaw) || caseItem.completedAt || "-";

      // Bordered two-column header grid (same layout as the PDF report).
      const thin = { style: BorderStyle.SINGLE, size: 6, color: "222222" };
      const cellBorders = { top: thin, bottom: thin, left: thin, right: thin };
      const infoCell = (label, value) =>
        new TableCell({
          borders: cellBorders,
          width: { size: 4853, type: WidthType.DXA },
          margins: { top: 100, bottom: 100, left: 140, right: 140 },
          children: [new Paragraph({
            children: [
              new TextRun({ text: `${label}: `, bold: true }),
              new TextRun(String(value || "")),
            ],
          })],
        });
      const infoGrid = (rows) =>
        new Table({
          width: { size: 9706, type: WidthType.DXA },
          columnWidths: [4853, 4853],
          rows: rows.map(([l, r]) => new TableRow({ children: [infoCell(...l), infoCell(...r)] })),
        });

      const sectionTitle = (text) =>
        new Paragraph({
          spacing: { before: 240, after: 80 },
          children: [new TextRun({ text, bold: true, size: 24 })],
        });

      // Field → heading mapping (matches what the viewer saves: the Impression section
      // goes to `impression`, the Clinical Advice / ADVICE section to `opinions`).
      // Order: Technique, REPORT, Impression, ADVICE, Signature.
      const technique  = rep.technique  || rep.ai_technique;
      const findings   = rep.findings   || rep.ai_findings;
      const impression = rep.impression || rep.ai_impression;
      const advice     = rep.opinions   || rep.ai_opinions;

      const displayName = `Dr. ${(radName || String(caseItem.assignedTo || "")).replace(/^\s*dr\.?\s*/i, "")}`.trim();
      const sigLine = (text, bold = false) =>
        new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text, bold })] });

      const signature = [sectionTitle("Signature")];
      if (sigData) {
        signature.push(new Paragraph({
          spacing: { after: 60 },
          children: [new ImageRun({
            data: sigData.data,
            type: sigData.type,
            transformation: { width: sigData.width, height: sigData.height },
          })],
        }));
      }
      signature.push(sigLine(displayName, true));
      if (dmcNo) signature.push(sigLine(`DMC No: ${dmcNo}`, true));
      if (qualification) signature.push(sigLine(qualification));
      if (designation) signature.push(sigLine(designation));

      const docx = new Document({
        creator: "ONIX",
        title: `Radiology Report - ${caseItem.caseId}`,
        styles: { default: { document: { run: { font: "Arial", size: 22 } } } },
        sections: [{
          properties: { page: { margin: { top: 2600, bottom: 1000, left: 1100, right: 1100 } } },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 240 },
              children: [new TextRun({ text: reportTitle, bold: true, size: 28 })],
            }),
            infoGrid([
              [["Patient Id", caseItem.patientId && caseItem.patientId !== "—" ? caseItem.patientId : caseItem.caseId], ["Study Date & Time", studyDate]],
              [["Patient Name", rep.patient_name || caseItem.patientName], ["Referring Doctor", rep.referring_doctor]],
              [["Age / Sex", ageSex], ["Report Submit", reportSubmit]],
            ]),
            // Technique is left out entirely when the radiologist didn't fill it in.
            ...(hasText(technique) ? [sectionTitle("Technique"), ...htmlToParagraphs(technique)] : []),
            sectionTitle("REPORT"),     ...htmlToParagraphs(findings),
            ...(hasText(impression) ? [sectionTitle("Impression"), ...htmlToParagraphs(impression)] : []),
            sectionTitle("ADVICE"),     ...htmlToParagraphs(advice),
            ...signature,
          ],
        }],
      });

      const blob = await Packer.toBlob(docx);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = reportFileName(caseItem, "docx");
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setDashToast({ kind: "error", text: e?.message || "Could not generate Word report" });
      setTimeout(() => setDashToast(null), 4000);
    } finally {
      setDownloadingCase(null);
      setDownloadingFmt(null);
    }
  };
  return { handleDownloadCase, handleDownloadWord, reportFileName };
}
