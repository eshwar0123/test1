// Reads an uploaded report file and returns its plain text.
// Supports: .txt, .docx (mammoth), .pdf (pdfjs), images (tesseract OCR).
// Heavy libs are dynamically imported so they only load when actually used.

export async function readReportFileToText(file, onProgress = () => {}) {
  const name = (file?.name || "").toLowerCase();
  const ext = name.includes(".") ? name.split(".").pop() : "";

  // Plain text
  if (ext === "txt") {
    return await file.text();
  }

  // Word .docx
  if (ext === "docx") {
    onProgress("Reading Word document…");
    const mammoth = (await import("mammoth")).default ?? (await import("mammoth"));
    const arrayBuffer = await file.arrayBuffer();
    const { value } = await mammoth.extractRawText({ arrayBuffer });
    return value || "";
  }

  // Legacy .doc isn't supported by mammoth
  if (ext === "doc") {
    throw new Error("Old .doc format isn't supported — save it as .docx or PDF, or paste the text.");
  }

  // PDF (text-based)
  if (ext === "pdf") {
    onProgress("Reading PDF…");
    const pdfjs = await import("pdfjs-dist");
    const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    let out = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      onProgress(`Reading PDF page ${i}/${pdf.numPages}…`);
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      out += tc.items.map((it) => ("str" in it ? it.str : "")).join(" ") + "\n";
    }
    return out;
  }

  // Images → OCR
  if (["png", "jpg", "jpeg", "webp", "bmp", "gif"].includes(ext)) {
    onProgress("Reading image (OCR)…");
    const Tesseract = (await import("tesseract.js")).default ?? (await import("tesseract.js"));
    const { data } = await Tesseract.recognize(file, "eng", {
      logger: (m) => {
        if (m.status === "recognizing text") {
          onProgress(`OCR ${Math.round((m.progress || 0) * 100)}%…`);
        }
      },
    });
    return data?.text || "";
  }

  throw new Error("Unsupported file type. Use .docx, .pdf, .txt, or an image (png/jpg).");
}
