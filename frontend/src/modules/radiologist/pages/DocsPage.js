import React, { useEffect, useState, useCallback, useRef } from "react";
import "./DocsPage.css";

const getToken = () => {
  try { return JSON.parse(localStorage.getItem("auth") || "{}").token || ""; }
  catch { return ""; }
};
const WATERMARK_TEXT = "GenPhase ONIX";

// ── build TOC from PDF outline ───────────────────────────────────────────────
async function buildTocItems(pdf, items, depth = 0) {
  const result = [];
  for (const item of (items || [])) {
    if (!item.title?.trim()) continue;
    let page = 1;
    try {
      let dest = item.dest;
      if (typeof dest === "string") dest = await pdf.getDestination(dest);
      if (dest?.[0]) page = (await pdf.getPageIndex(dest[0])) + 1;
    } catch {}
    result.push({
      title: item.title.trim(), page, depth,
      children: depth < 3 ? await buildTocItems(pdf, item.items, depth + 1) : [],
    });
  }
  return result;
}

// ── TOC node ─────────────────────────────────────────────────────────────────
function TocNode({ item, activePage, onNavigate }) {
  return (
    <div>
      <div
        className={`toc-item depth-${Math.min(item.depth, 3)}${item.page === activePage ? " toc-active" : ""}`}
        onClick={() => onNavigate(item.page)}
        title={`Page ${item.page}`}
      >
        {item.title}
      </div>
      {item.children?.map((c, i) => (
        <TocNode key={i} item={c} activePage={activePage} onNavigate={onNavigate} />
      ))}
    </div>
  );
}

// ── single PDF page rendered on canvas (lazy — only renders when visible) ────
function PdfPage({ pdfDoc, pageNum, scale, innerRef }) {
  const canvasRef  = useRef(null);
  const wrapperRef = useRef(null);
  const [visible, setVisible] = useState(false);

  // observe visibility — render only when in/near viewport
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setVisible(true); },
      { rootMargin: "300px" }
    );
    if (wrapperRef.current) obs.observe(wrapperRef.current);
    return () => obs.disconnect();
  }, []);

  // render / re-render on scale change
  useEffect(() => {
    if (!visible || !pdfDoc) return;
    let cancelled = false;
    (async () => {
      try {
        const page     = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale });
        const canvas   = canvasRef.current;
        if (!canvas || cancelled) return;
        canvas.width   = viewport.width;
        canvas.height  = viewport.height;
        const ctx      = canvas.getContext("2d");
        ctx.fillStyle  = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [visible, pdfDoc, pageNum, scale]);

  const setRef = (el) => {
    wrapperRef.current = el;
    if (typeof innerRef === "function") innerRef(el);
  };

  return (
    <div ref={setRef} className="pdf-page-wrapper" data-page={pageNum}>
      <canvas ref={canvasRef} className="pdf-page-canvas" />
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────
export default function DocsPage() {
  const [pdfDoc, setPdfDoc]         = useState(null);
  const [totalPages, setTotalPages] = useState(0);
  const [toc, setToc]               = useState(null);
  const [activePage, setActivePage] = useState(1);
  const [scale, setScale]           = useState(1.2);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const pageRefs                    = useRef([]);
  const scrollRef                   = useRef(null);

  // load PDF + extract TOC
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/radiology/docs/onix-guide", {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (res.status === 401) throw new Error("Session expired — please log in again.");
        if (!res.ok)            throw new Error(`Failed to load (${res.status})`);

        const arrayBuffer = await res.arrayBuffer();
        const pdfjsLib    = await import("pdfjs-dist");
        const version     = pdfjsLib.version || "3.11.174";
        const major       = parseInt(version.split(".")[0], 10);
        const ext         = major >= 4 ? "mjs" : "js";
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.${ext}`;

        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer.slice() }).promise;
        setPdfDoc(pdf);
        setTotalPages(pdf.numPages);

        try {
          const outline = await pdf.getOutline();
          setToc(outline?.length ? await buildTocItems(pdf, outline) : []);
        } catch { setToc([]); }

      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // smooth-scroll to page — no flicker, no remount
  const navigateToPage = useCallback((pageNum) => {
    setActivePage(pageNum);
    pageRefs.current[pageNum - 1]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // zoom
  const zoomIn  = () => setScale(s => Math.min(+(s + 0.25).toFixed(2), 3.0));
  const zoomOut = () => setScale(s => Math.max(+(s - 0.25).toFixed(2), 0.5));

  // track active page while scrolling (update TOC highlight)
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || totalPages === 0) return;
    const onScroll = () => {
      const top = container.getBoundingClientRect().top;
      let closest = 1, minDist = Infinity;
      pageRefs.current.forEach((ref, i) => {
        if (!ref) return;
        const dist = Math.abs(ref.getBoundingClientRect().top - top);
        if (dist < minDist) { minDist = dist; closest = i + 1; }
      });
      setActivePage(closest);
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [totalPages]);

  // block keyboard shortcuts
  const blockKeys = useCallback((e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if ((ctrl && ["c","a","s","p","u"].includes(e.key.toLowerCase())) ||
        e.key === "F12" || e.key === "PrintScreen") {
      e.preventDefault(); e.stopPropagation();
    }
  }, []);
  useEffect(() => {
    window.addEventListener("keydown", blockKeys, true);
    document.addEventListener("keydown", blockKeys, true);
    return () => {
      window.removeEventListener("keydown", blockKeys, true);
      document.removeEventListener("keydown", blockKeys, true);
    };
  }, [blockKeys]);

  return (
    <div className="docs-page" onContextMenu={(e) => e.preventDefault()}>

      {/* watermark */}
      <div className="docs-watermark" aria-hidden="true">
        {Array.from({ length: 40 }).map((_, i) => (
          <span key={i} className="docs-watermark-text">{WATERMARK_TEXT}</span>
        ))}
      </div>

      <div className="docs-header">
        <h1 className="docs-title">ONIX AI — Documentation</h1>
        <p className="docs-subtitle">Platform user guide and reference</p>
      </div>

      {loading && <div className="docs-loading"><div className="docs-spinner"/><span>Loading documentation…</span></div>}
      {error   && <div className="docs-error"><span className="docs-error-icon">⚠</span><p>{error}</p></div>}

      {pdfDoc && !loading && !error && (
        <div className="docs-layout">

          {/* ── TOC sidebar ── */}
          <div className="docs-toc">
            <div className="docs-toc-header">Contents</div>
            {toc === null  && <p className="docs-toc-empty">Loading…</p>}
            {toc?.length === 0 && <p className="docs-toc-empty">No table of contents</p>}
            {toc?.length > 0 && toc.map((item, i) => (
              <TocNode key={i} item={item} activePage={activePage} onNavigate={navigateToPage} />
            ))}
          </div>

          {/* ── PDF canvas viewer ── */}
          <div className="docs-pdf-wrapper">

            {/* zoom + page indicator toolbar */}
            <div className="docs-zoom-bar">
              <button className="docs-zoom-btn" onClick={zoomOut} title="Zoom out">−</button>
              <span className="docs-zoom-label">{Math.round(scale * 100)}%</span>
              <button className="docs-zoom-btn" onClick={zoomIn}  title="Zoom in">+</button>
              <span className="docs-zoom-page">Page {activePage} / {totalPages}</span>
            </div>

            {/* scrollable page stack */}
            <div className="docs-pdf-scroll" ref={scrollRef}>
              {Array.from({ length: totalPages }, (_, i) => (
                <PdfPage
                  key={`${i}-${scale}`}
                  pdfDoc={pdfDoc}
                  pageNum={i + 1}
                  scale={scale}
                  innerRef={(el) => { pageRefs.current[i] = el; }}
                />
              ))}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
