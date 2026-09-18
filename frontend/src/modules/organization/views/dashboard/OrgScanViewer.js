/**
 * OrgScanViewer.js  —  Unified Slice Viewer  v3  (instant-load edition)
 * Route: /organization/scan-view/:caseId
 *
 * PERFORMANCE STRATEGY
 * ────────────────────
 * Module-level caches survive re-renders and navigation:
 *   BUFFER_CACHE  url → ArrayBuffer   (raw fetched bytes)
 *   RENDER_CACHE  url → {blobUrl,meta} (decoded DICOM → JPEG blob → <img>)
 *   IMAGE_CACHE   url → blobUrl       (pre-fetched JPG/PNG blobs)
 *   NIFTI_CACHE   url → {data,nx,ny,nz,wMin,wRange}
 *
 * On page open → fetch file list → immediately pre-fetch + pre-decode
 * ALL files in parallel.  By the time user sees "1/2" pill the first
 * DICOM is already decoded.  Navigation → instant cache hit.
 *
 * LOGO  → tries /onix-logo.png → /logo.png → inline SVG badge
 * CLOSE → navigate("/organization/dashboard")
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";

/* ── CSS ───────────────────────────────────────────────────────────────── */
const VIEWER_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Space+Grotesk:wght@400;500;600;700&display=swap');
  @keyframes spin   { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
  @keyframes fadeIn { from{opacity:0} to{opacity:1} }
  .osv-root, .osv-root * { box-sizing:border-box; }
  .osv-btn { transition:all 0.14s ease; outline:none; }
  .osv-btn:not(:disabled):hover  { opacity:0.82; transform:translateY(-1px); }
  .osv-btn:not(:disabled):active { transform:translateY(0); }
  .osv-btn:disabled { opacity:0.25; cursor:not-allowed !important; }
  .osv-range { -webkit-appearance:none; appearance:none; height:4px; border-radius:2px; outline:none; cursor:pointer; border:none; }
  .osv-range::-webkit-slider-thumb { -webkit-appearance:none; width:16px; height:16px; border-radius:50%; background:#60a5fa; cursor:pointer; box-shadow:0 0 0 3px rgba(96,165,250,0.22); }
  .osv-range::-moz-range-thumb    { width:16px; height:16px; border-radius:50%; background:#60a5fa; border:none; cursor:pointer; }
`;

const mono = { fontFamily:"'DM Mono','Fira Mono',monospace" };
const sg   = { fontFamily:"'Space Grotesk',sans-serif" };

/* ── Type helpers ──────────────────────────────────────────────────────── */
const TYPE_LABEL = { dcm:"DICOM", nii:"NIfTI", jpg:"JPEG", png:"PNG", other:"FILE" };
const TYPE_COLOR = { dcm:"#60a5fa", nii:"#a78bfa", jpg:"#34d399", png:"#34d399", other:"#94a3b8" };
const TYPE_BG    = { dcm:"rgba(59,130,246,0.18)", nii:"rgba(139,92,246,0.18)", jpg:"rgba(16,185,129,0.18)", png:"rgba(16,185,129,0.18)", other:"rgba(148,163,184,0.14)" };

const detectType = (filename = "") => {
  const f = filename.toLowerCase();
  if (f.endsWith(".dcm"))                            return "dcm";
  if (f.endsWith(".nii.gz") || f.endsWith(".nii"))  return "nii";
  if (f.endsWith(".jpg")    || f.endsWith(".jpeg"))  return "jpg";
  if (f.endsWith(".png"))                            return "png";
  return "other";
};

/* ── Token helper ──────────────────────────────────────────────────────── */
const readToken = () => {
  for (const k of ["token","access_token","authToken","jwt"]) {
    const v = localStorage.getItem(k); if (v) return v;
  }
  for (const k of ["auth","user","authUser"]) {
    try {
      const p = JSON.parse(localStorage.getItem(k)||"{}");
      const t = p.token||p.access_token||p.accessToken||p.jwt;
      if (t) return t;
    } catch {}
  }
  return null;
};

const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env &&
    (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE)) || "";

/* ══════════════════════════════════════════════════════════════════════════
   MODULE-LEVEL CACHES  — survive component re-renders & file navigation
   ══════════════════════════════════════════════════════════════════════════ */
const BUFFER_CACHE = new Map();  // fullUrl → ArrayBuffer
const RENDER_CACHE = new Map();  // fullUrl → { blobUrl, meta }
const IMAGE_CACHE  = new Map();  // fullUrl → blobUrl
const NIFTI_CACHE  = new Map();  // fullUrl → { data, nx, ny, nz, wMin, wRange }
let   _dp          = null;       // cached dicom-parser module (import once)

/* ── URL resolver: handles both relative API paths and absolute presigned URLs ── */
function resolveUrl(apiUrl) {
  if (!apiUrl) return apiUrl;
  // Already absolute (presigned S3 URL or external URL) — use as-is
  if (apiUrl.startsWith('http://') || apiUrl.startsWith('https://')) return apiUrl;
  // Relative path — prepend API_BASE
  return API_BASE + apiUrl;
}

/* ── fetch to buffer (with caching) ─────────────────────────────────────── */
async function fetchBuf(fullUrl, tok) {
  if (BUFFER_CACHE.has(fullUrl)) return BUFFER_CACHE.get(fullUrl);
  // For presigned S3 URLs, don't send Authorization header (signature is in URL)
  const isPresigned = fullUrl.includes('X-Amz-Signature') || fullUrl.includes('x-amz-signature');
  const headers = (!isPresigned && tok) ? { Authorization:`Bearer ${tok}` } : {};
  const res = await fetch(fullUrl, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  BUFFER_CACHE.set(fullUrl, buf);
  return buf;
}

/* ── load dicom-parser once ──────────────────────────────────────────────── */
async function loadDp() {
  if (_dp) return _dp;
  _dp = await import("dicom-parser");
  return _dp;
}

/* ── decode one DICOM → JPEG blob URL (with streaming progress) ─────────── */
async function decodeDicom(apiUrl, tok, onProgress = () => {}) {
  const full = resolveUrl(apiUrl);
  if (RENDER_CACHE.has(full)) { onProgress(100); return RENDER_CACHE.get(full); }

  /* ── Phase 1: Fetch (3 → 65%) ─────────────────────────────────────────── */
  onProgress(3);
  let buf;
  if (BUFFER_CACHE.has(full)) {
    buf = BUFFER_CACHE.get(full);
    onProgress(65); // already downloaded — jump straight to decode
  } else {
    const isPresigned = full.includes('X-Amz-Signature') || full.includes('x-amz-signature');
    const fetchHeaders = (!isPresigned && tok) ? { Authorization:`Bearer ${tok}` } : {};
    const res = await fetch(full, { headers: fetchHeaders });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const cl = parseInt(res.headers.get("Content-Length") || "0", 10);
    const reader = res.body.getReader();
    const chunks = [];
    let received = 0;
    onProgress(5);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      // Real progress when Content-Length available; heuristic otherwise
      if (cl > 0) {
        onProgress(Math.round(5 + (received / cl) * 58));        // 5 → 63%
      } else {
        onProgress(Math.min(60, Math.round(5 + received / 8000))); // fallback
      }
    }

    // Assemble ArrayBuffer from chunks
    onProgress(65);
    const u8all = new Uint8Array(received);
    let off = 0;
    for (const c of chunks) { u8all.set(c, off); off += c.length; }
    buf = u8all.buffer;
    BUFFER_CACHE.set(full, buf);
  }

  /* ── Phase 2: Parse DICOM header (65 → 72%) ──────────────────────────── */
  onProgress(66);
  const dp  = await loadDp();
  const u8  = new Uint8Array(buf);
  const ds  = (dp.default || dp).parseDicom(u8);
  onProgress(72);

  const str = (tag) => { try { return (ds.string(tag)||"").trim(); } catch { return ""; } };
  const int = (tag, d=0) => { try { return ds.uint16(tag)??d; } catch { return d; } };

  const rows=int("x00280010"), cols=int("x00280011");
  const bitsAll=int("x00280100",16), pixRep=int("x00280103",0);
  const slope=parseFloat(str("x00281053")||"1")||1;
  const inter=parseFloat(str("x00281052")||"0")||0;
  const wc=parseFloat(str("x00281050")||"0");
  const ww=parseFloat(str("x00281051")||"0");

  /* ── Phase 3: Extract pixel data (72 → 80%) ──────────────────────────── */
  onProgress(73);
  const pe = ds.elements.x7fe00010;
  if (!pe) throw new Error("No pixel data (7FE0,0010)");

  let pix;
  if (bitsAll<=8)      pix=new Uint8Array(buf,pe.dataOffset,pe.length);
  else if (pixRep===1) pix=new Int16Array(buf,pe.dataOffset,pe.length/2);
  else                 pix=new Uint16Array(buf,pe.dataOffset,pe.length/2);

  const rsc=new Float32Array(pix.length);
  for (let i=0;i<pix.length;i++) rsc[i]=pix[i]*slope+inter;
  onProgress(80);

  /* ── Phase 4: Windowing (80 → 86%) ───────────────────────────────────── */
  let wLow,wHigh;
  if (ww>0) { wLow=wc-ww/2; wHigh=wc+ww/2; }
  else {
    const sorted=Float32Array.from(rsc).sort();
    wLow =sorted[Math.floor(sorted.length*0.02)];
    wHigh=sorted[Math.floor(sorted.length*0.98)];
  }
  const wRng=wHigh-wLow||1;
  onProgress(86);

  /* ── Phase 5: Render canvas (86 → 94%) ───────────────────────────────── */
  const cv=document.createElement("canvas");
  cv.width=cols; cv.height=rows;
  const ctx=cv.getContext("2d");
  const id=ctx.createImageData(cols,rows);
  for (let i=0;i<rows*cols;i++) {
    const v=Math.max(0,Math.min(255,Math.round(((rsc[i]-wLow)/wRng)*255)));
    const p=i*4; id.data[p]=id.data[p+1]=id.data[p+2]=v; id.data[p+3]=255;
  }
  ctx.putImageData(id,0,0);
  onProgress(94);

  /* ── Phase 6: Canvas → JPEG blob URL (94 → 100%) ─────────────────────── */
  onProgress(96);
  const blobUrl = await new Promise((res,rej)=>
    cv.toBlob(b=> b ? res(URL.createObjectURL(b)) : rej(new Error("toBlob failed")), "image/jpeg", 0.96)
  );
  onProgress(100);

  const meta = {
    patient:     str("x00100010")||"",
    modality:    str("x00080060")||"",
    series:      str("x0008103e")||"",
    studyDate:   str("x00080020")||"",
    instanceNum: str("x00200013")||"",   // InstanceNumber — changes per slice
    rows, cols,
  };
  const result = { blobUrl, meta };
  RENDER_CACHE.set(full, result);
  return result;
}

/* ── fetch image → blob URL ──────────────────────────────────────────────── */
async function fetchImgBlob(apiUrl, tok) {
  const full = resolveUrl(apiUrl);
  if (IMAGE_CACHE.has(full)) return IMAGE_CACHE.get(full);
  const isPresigned = full.includes('X-Amz-Signature') || full.includes('x-amz-signature');
  const res = await fetch(full, { headers: (!isPresigned && tok) ? { Authorization:`Bearer ${tok}` } : {} });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  IMAGE_CACHE.set(full, url);
  return url;
}

/* ── parse NIfTI → typed data array ─────────────────────────────────────── */
async function parseNifti(apiUrl, tok) {
  const full = resolveUrl(apiUrl);
  if (NIFTI_CACHE.has(full)) return NIFTI_CACHE.get(full);
  const nifti = await import("nifti-reader-js");
  let buf = await fetchBuf(full, tok);
  if (nifti.isCompressed(buf)) buf = nifti.decompress(buf);
  if (!nifti.isNIFTI(buf)) throw new Error("Not a valid NIfTI file");
  const hdr = nifti.readHeader(buf);
  const raw = nifti.readImage(hdr, buf);
  const d   = hdr.dims;
  const nx=d[1]||1, ny=d[2]||1, nz=d[3]||1;
  const dtc=hdr.datatypeCode, NI=nifti.NIFTI1;
  let data;
  if      (dtc===NI.TYPE_INT16)   data=new Int16Array(raw);
  else if (dtc===NI.TYPE_INT32)   data=new Int32Array(raw);
  else if (dtc===NI.TYPE_FLOAT32) data=new Float32Array(raw);
  else if (dtc===NI.TYPE_FLOAT64) data=new Float64Array(raw);
  else                             data=new Uint8Array(raw);
  const sorted=Float32Array.from(data).sort();
  const wMin=sorted[Math.floor(sorted.length*0.02)]??0;
  const wMax=sorted[Math.floor(sorted.length*0.98)]??255;
  const result = { data, nx, ny, nz, wMin, wRange:(wMax-wMin)||1 };
  NIFTI_CACHE.set(full, result);
  return result;
}

/* ══════════════════════════════════════════════════════════════════════════
   Spinner
   ══════════════════════════════════════════════════════════════════════════ */
function Spinner({ size=32, color="#60a5fa" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2.5"
      style={{ animation:"spin 0.9s linear infinite", flexShrink:0 }}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
  );
}

/* ── LoadingOverlay — big % shown while DICOM decodes for the first time ── */
function LoadingOverlay({ progress = 0, filename = "" }) {
  const phase =
    progress < 5  ? "Starting…"           :
    progress < 65 ? "Rendering…"        :
    progress < 73 ? "Parsing header…"     :
    progress < 87 ? "Processing pixels…"  :
    progress < 95 ? "Rendering…"          :
    progress < 100? "Finalising…"         : "Ready";

  return (
    <div style={{
      position:"absolute", inset:0,
      display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center",
      background:"#030712", zIndex:2,
    }}>
      {/* Giant gradient percentage */}
      <div style={{
        fontSize:88, fontWeight:800, lineHeight:1, letterSpacing:"-3px",
        fontFamily:"'DM Mono','Fira Mono',monospace",
        background:"linear-gradient(135deg,#3b82f6 0%,#818cf8 50%,#a78bfa 100%)",
        WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
        userSelect:"none",
      }}>
        {progress}%
      </div>

      {/* Phase label */}
      <div style={{ marginTop:12, fontSize:13, fontWeight:600, letterSpacing:"0.6px", color:"#475569", ...sg }}>
        {phase}
      </div>

      {/* Progress bar track */}
      <div style={{ marginTop:20, width:300, height:3, background:"rgba(255,255,255,0.07)", borderRadius:2, overflow:"hidden" }}>
        <div style={{
          width:`${progress}%`, height:"100%",
          background:"linear-gradient(90deg,#2563eb,#7c3aed)",
          borderRadius:2, transition:"width 0.35s ease",
        }}/>
      </div>

      {/* Filename */}
      {filename && (
        <div style={{ marginTop:14, fontSize:11, color:"#374151", fontFamily:"'DM Mono','Fira Mono',monospace", maxWidth:380, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
          {filename}
        </div>
      )}
    </div>
  );
}
function InlineLogo() {
  return (
    <div style={{
      display:"flex", alignItems:"center", gap:8, flexShrink:0,
      background:"linear-gradient(135deg,#1e3a8a 0%,#4c1d95 100%)",
      borderRadius:9, padding:"5px 12px",
    }}>
      {/* Medical cross */}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <rect x="9"  y="2"  width="6" height="20" rx="2" fill="rgba(255,255,255,0.95)"/>
        <rect x="2"  y="9"  width="20" height="6"  rx="2" fill="rgba(255,255,255,0.95)"/>
      </svg>
      <span style={{ fontWeight:800, fontSize:14, letterSpacing:"0.3px", color:"#fff", whiteSpace:"nowrap" }}>
        ONIX<span style={{color:"#c4b5fd"}}>·AI</span>
      </span>
    </div>
  );
}

/* ── Logo with fallback chain ────────────────────────────────────────────── */
const LOGO_PATHS = ["/onix-logo.png", "/logo.png", "/assets/logo.png", "/brand/logo.png"];
function OrgLogo() {
  const [idx, setIdx] = useState(0);
  if (idx >= LOGO_PATHS.length) return <InlineLogo />;
  return (
    <img
      src={LOGO_PATHS[idx]}
      alt="ONIX AI"
      height={34}
      style={{ objectFit:"contain", flexShrink:0 }}
      onError={() => setIdx(i => i + 1)}
    />
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   DicomViewer  — renders from RENDER_CACHE (pre-decoded) or decodes on demand
   Uses <img> so maxWidth/maxHeight/objectFit:contain work natively.
   ══════════════════════════════════════════════════════════════════════════ */
function DicomViewer({ file, onProgress }) {
  const full    = (file.url && (file.url.startsWith('http://') || file.url.startsWith('https://')))
                    ? file.url : API_BASE + file.url;
  const cached  = RENDER_CACHE.get(full);
  const [result,   setResult]   = useState(cached || null);
  const [status,   setStatus]   = useState(cached ? "ok" : "loading");
  const [errMsg,   setErrMsg]   = useState("");
  const [progress, setProgress] = useState(cached ? 100 : 0);
  const [zoom,     setZoom]     = useState(1.0);

  useEffect(() => {
    setZoom(1.0); // reset zoom when file changes
    if (RENDER_CACHE.has(full)) {
      setResult(RENDER_CACHE.get(full)); setStatus("ok"); setProgress(100);
      onProgress?.(100); return;
    }
    let cancelled = false;
    setStatus("loading"); setProgress(0);
    const handleProgress = (pct) => { if (cancelled) return; setProgress(pct); onProgress?.(pct); };
    decodeDicom(file.url, readToken(), handleProgress)
      .then(r => { if (!cancelled) { setResult(r); setStatus("ok"); } })
      .catch(e => { if (!cancelled) { setErrMsg(e.message||"decode error"); setStatus("error"); } });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full]);

  return (
    <div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center", position:"relative", overflow:"hidden" }}>

      {status === "loading" && <LoadingOverlay progress={progress} filename={file.filename} />}

      {status === "error" && (
        <div style={{ color:"#f87171", ...mono, fontSize:13, textAlign:"center", padding:"0 32px" }}>
          ⚠ DICOM error: {errMsg}
        </div>
      )}

      {result?.blobUrl && (
        <>
          {/* Image always fills the container — transform:scale handles zoom.
              width/height 100% + objectFit:contain normalises all image sizes. */}
          <img
            src={result.blobUrl}
            alt="DICOM"
            style={{
              width:"100%", height:"100%",
              objectFit:"contain", imageRendering:"pixelated",
              borderRadius:6,
              display: status === "ok" ? "block" : "none",
              animation: "fadeIn 0.3s ease",
              transform: `scale(${zoom})`,
              transformOrigin: "center center",
              transition: "transform 0.12s ease",
            }}
          />

          {/* ── Zoom controls (top-right) ── */}
          {status === "ok" && (
            <div style={{ position:"absolute", top:8, right:8, display:"flex", flexDirection:"column", gap:4, zIndex:10 }}>
              <button onClick={() => setZoom(z => Math.min(5.0, +(z+0.2).toFixed(1)))}
                style={{ width:32, height:32, borderRadius:6, border:"1px solid rgba(255,255,255,0.15)", background:"rgba(20,25,40,0.88)", color:"#e2e8f0", fontSize:18, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}
                title="Zoom in">＋</button>
              <button onClick={() => setZoom(1.0)}
                style={{ width:32, height:32, borderRadius:6, border:"1px solid rgba(255,255,255,0.15)", background:"rgba(20,25,40,0.88)", color:"#94a3b8", fontSize:10, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"monospace" }}
                title="Reset zoom">{Math.round(zoom*100)}%</button>
              <button onClick={() => setZoom(z => Math.max(0.2, +(z-0.2).toFixed(1)))}
                style={{ width:32, height:32, borderRadius:6, border:"1px solid rgba(255,255,255,0.15)", background:"rgba(20,25,40,0.88)", color:"#e2e8f0", fontSize:22, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", lineHeight:1 }}
                title="Zoom out">−</button>
            </div>
          )}

          {result.meta && (
            <div style={{ position:"absolute", bottom:12, left:12, ...MetaOverlayStyle }}>
              {result.meta.patient     && <span>Pt: <b style={{color:"#e2e8f0"}}>{result.meta.patient}</b></span>}
              {result.meta.modality    && <span>Mod: <b style={{color:"#60a5fa"}}>{result.meta.modality}</b></span>}
              {result.meta.instanceNum && <span>Inst: <b style={{color:"#fbbf24"}}>{result.meta.instanceNum}</b></span>}
              {result.meta.series      && <span>{result.meta.series}</span>}
              {result.meta.studyDate   && <span>{result.meta.studyDate}</span>}
              <span>{result.meta.cols}×{result.meta.rows}px</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   NiftiViewer  — uses NIFTI_CACHE data (pre-parsed), renders slices on demand
   ══════════════════════════════════════════════════════════════════════════ */
function NiftiViewer({ file }) {
  const full         = (file.url && (file.url.startsWith('http://') || file.url.startsWith('https://')))
                         ? file.url
                         : API_BASE + file.url;
  const cachedData   = NIFTI_CACHE.get(full);
  const canvasRef    = useRef(null);
  const containerRef = useRef(null);
  const imgDataRef   = useRef(cachedData || null);

  const [status,      setStatus]      = useState(cachedData ? "ok" : "loading");
  const [errMsg,      setErrMsg]      = useState("");
  const [sliceIdx,    setSliceIdx]    = useState(() => cachedData ? Math.floor(cachedData.nz/2) : 0);
  const [totalSlices, setTotalSlices] = useState(cachedData?.nz || 1);
  const [dims,        setDims]        = useState(cachedData ? { nx:cachedData.nx, ny:cachedData.ny, nz:cachedData.nz } : null);
  const [zoom,        setZoom]        = useState(1.0);

  const renderSlice = useCallback((idx) => {
    const d = imgDataRef.current; if (!d || !canvasRef.current) return;
    const { data, nx, ny, nz, wMin, wRange } = d;
    const i  = Math.max(0, Math.min(idx, nz-1));
    const cv = canvasRef.current;
    cv.width=nx; cv.height=ny;
    const ctx=cv.getContext("2d");
    const img=ctx.createImageData(nx,ny);
    for (let y=0;y<ny;y++) for (let x=0;x<nx;x++) {
      const v=Math.max(0,Math.min(255,Math.round(((data[x+y*nx+i*nx*ny]-wMin)/wRange)*255)));
      const p=(y*nx+x)*4; img.data[p]=img.data[p+1]=img.data[p+2]=v; img.data[p+3]=255;
    }
    ctx.putImageData(img,0,0);
  }, []);

  useEffect(() => {
    if (NIFTI_CACHE.has(full)) {
      const d = NIFTI_CACHE.get(full);
      imgDataRef.current = d;
      setTotalSlices(d.nz); setDims({nx:d.nx,ny:d.ny,nz:d.nz});
      setSliceIdx(Math.floor(d.nz/2)); setStatus("ok");
      return;
    }
    let cancelled=false; setStatus("loading");
    parseNifti(file.url, readToken())
      .then(d => {
        if (cancelled) return;
        imgDataRef.current=d;
        setTotalSlices(d.nz); setDims({nx:d.nx,ny:d.ny,nz:d.nz});
        setSliceIdx(Math.floor(d.nz/2)); setStatus("ok");
      })
      .catch(e => { if (!cancelled) { setErrMsg(e.message||"NIfTI error"); setStatus("error"); } });
    return () => { cancelled=true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full]);

  useEffect(() => { if (status==="ok") renderSlice(sliceIdx); }, [sliceIdx, status, renderSlice]);

  const handleNiftiWheel = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
    if (e.ctrlKey || e.metaKey) {
      // Ctrl+scroll → zoom
      setZoom(z => Math.max(0.5, Math.min(5.0, z + (e.deltaY > 0 ? -0.1 : 0.1))));
    } else {
      // Normal scroll → step slices
      setSliceIdx(p => Math.max(0, Math.min(totalSlices-1, p+(e.deltaY>0?1:-1))));
    }
  }, [totalSlices]);

  useEffect(() => {
    const el=containerRef.current; if (!el) return;
    el.addEventListener("wheel", handleNiftiWheel, { passive:false });
    return () => el.removeEventListener("wheel", handleNiftiWheel);
  }, [handleNiftiWheel]);

  return (
    <div ref={containerRef} style={{ width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", position:"relative", overflow:"hidden" }}>
      {status==="loading" && (
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:14, color:"#475569" }}>
          <Spinner color="#a78bfa"/>
          <span style={{...mono,fontSize:13}}>Loading NIfTI…</span>
        </div>
      )}
      {status==="error" && (
        /* PNG/JPG files saved with .nii extension — try native <img> first.
           If the browser can render it, great. If not, show the error text. */
        <div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", position:"relative" }}>
          <img
            src={full}
            alt="scan"
            style={{ width:"100%", height:"100%", objectFit:"contain", imageRendering:"pixelated", display:"block" }}
            onError={(e) => { e.target.style.display="none"; e.target.nextSibling.style.display="block"; }}
          />
          <div style={{ display:"none", color:"#f87171", ...mono, fontSize:13, textAlign:"center", padding:"0 32px" }}>
            ⚠ NIfTI error: {errMsg}
          </div>
          <div style={{ position:"absolute", bottom:8, left:8, background:"rgba(0,0,0,0.55)", borderRadius:6, padding:"3px 10px", fontSize:10, color:"#94a3b8", ...mono }}>
            ⚠ PNG rendered (wrong .nii extension)
          </div>
        </div>
      )}
      <canvas ref={canvasRef} style={{
        display:status==="ok"?"block":"none",
        maxWidth:"100%", maxHeight:"calc(100% - 52px)",
        width:"auto", height:"auto",
        imageRendering:"pixelated", borderRadius:6, animation:"fadeIn 0.2s ease",
        transform:`scale(${zoom})`, transformOrigin:"center center",
        transition:"transform 0.1s ease",
      }}/>
      {status==="ok" && dims && (
        <>
          {/* ── Zoom controls ─────────────────────────────────────── */}
          <div style={{ position:"absolute", top:8, right:8, display:"flex", flexDirection:"column", gap:4, zIndex:10 }}>
            <button onClick={() => setZoom(z => Math.min(5.0, +(z+0.2).toFixed(1)))}
              style={{ width:32, height:32, borderRadius:6, border:"1px solid rgba(255,255,255,0.15)", background:"rgba(30,30,40,0.85)", color:"#e2e8f0", fontSize:18, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}
              title="Zoom in">＋</button>
            <button onClick={() => setZoom(1.0)}
              style={{ width:32, height:32, borderRadius:6, border:"1px solid rgba(255,255,255,0.15)", background:"rgba(30,30,40,0.85)", color:"#94a3b8", fontSize:11, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}
              title="Reset zoom">{Math.round(zoom*100)}%</button>
            <button onClick={() => setZoom(z => Math.max(0.5, +(z-0.2).toFixed(1)))}
              style={{ width:32, height:32, borderRadius:6, border:"1px solid rgba(255,255,255,0.15)", background:"rgba(30,30,40,0.85)", color:"#e2e8f0", fontSize:18, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}
              title="Zoom out">－</button>
          </div>
          <div style={{ position:"absolute", bottom:8, left:"50%", transform:"translateX(-50%)", display:"flex", flexDirection:"column", alignItems:"center", gap:5, width:"100%", maxWidth:420, padding:"0 16px" }}>
            <input type="range" min={0} max={totalSlices-1} value={sliceIdx}
              onChange={e=>setSliceIdx(Number(e.target.value))}
              className="osv-range"
              style={{ width:"100%", accentColor:"#a78bfa", background:`linear-gradient(to right,#a78bfa ${(sliceIdx/(totalSlices-1||1))*100}%,rgba(255,255,255,0.12) ${(sliceIdx/(totalSlices-1||1))*100}%)` }}
            />
            <span style={{...mono,fontSize:11,color:"#475569"}}>
              Axial {sliceIdx+1}/{totalSlices} · {dims.nx}×{dims.ny}×{dims.nz} · scroll to step
            </span>
          </div>
          <div style={{ position:"absolute", bottom:58, left:12, ...MetaOverlayStyle }}>
            NIfTI · {dims.nx}×{dims.ny}×{dims.nz}
          </div>
        </>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   ImageViewer  — renders from IMAGE_CACHE (pre-fetched) or fetches on demand
   ══════════════════════════════════════════════════════════════════════════ */
function ImageViewer({ file }) {
  const full       = (file.url && (file.url.startsWith('http://') || file.url.startsWith('https://')))
                       ? file.url
                       : API_BASE + file.url;
  const cached     = IMAGE_CACHE.get(full);
  const [blobUrl,  setBlobUrl]  = useState(cached || null);
  const [status,   setStatus]   = useState(cached ? "ok" : "loading");
  const [dims,     setDims]     = useState(null);
  const [errMsg,   setErrMsg]   = useState("");

  useEffect(() => {
    if (IMAGE_CACHE.has(full)) {
      setBlobUrl(IMAGE_CACHE.get(full)); setStatus("ok"); return;
    }
    let cancelled=false, objUrl=null;
    setStatus("loading");
    fetchImgBlob(file.url, readToken())
      .then(url => { if (!cancelled) { objUrl=url; setBlobUrl(url); setStatus("ok"); } })
      .catch(e  => { if (!cancelled) { setErrMsg(e.message||"fetch error"); setStatus("error"); } });
    return () => { cancelled=true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full]);

  return (
    <div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center", position:"relative" }}>
      {status==="loading" && <Spinner color="#34d399"/>}
      {status==="error"   && <div style={{ color:"#f87171",...mono,fontSize:13 }}>⚠ {errMsg}</div>}
      {blobUrl && (
        <>
          <img src={blobUrl} alt={file.filename}
            onLoad={e=>setDims({w:e.target.naturalWidth,h:e.target.naturalHeight})}
            style={{ maxWidth:"100%", maxHeight:"100%", objectFit:"contain", borderRadius:6, animation:"fadeIn 0.2s ease" }}
          />
          {dims && <div style={{ position:"absolute", bottom:12, left:12, ...MetaOverlayStyle }}>{dims.w}×{dims.h}px</div>}
        </>
      )}
    </div>
  );
}

/* ── FallbackViewer ──────────────────────────────────────────────────────── */
function FallbackViewer({ file }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:18, padding:48 }}>
      <div style={{ fontSize:52 }}>📄</div>
      <div style={{...mono,fontSize:14,color:"#475569"}}>No preview available</div>
      <a href={`${API_BASE}${file.url}`} download={file.filename}
        style={{ ...sg, fontSize:14, fontWeight:700, color:"#60a5fa", textDecoration:"none", padding:"9px 22px", borderRadius:8, border:"1px solid rgba(96,165,250,0.35)", background:"rgba(37,99,235,0.10)" }}>
        ↓ Download {file.filename}
      </a>
    </div>
  );
}

/* ── Shared meta overlay style ───────────────────────────────────────────── */
const MetaOverlayStyle = {
  background:"rgba(3,7,18,0.82)", backdropFilter:"blur(10px)",
  border:"1px solid rgba(255,255,255,0.07)",
  borderRadius:9, padding:"5px 12px",
  display:"flex", gap:12, flexWrap:"wrap",
  fontSize:11, color:"#64748b", ...mono,
};

/* ══════════════════════════════════════════════════════════════════════════
   OrgScanViewer  —  Main
   ══════════════════════════════════════════════════════════════════════════ */
export default function OrgScanViewer() {
  const { caseId } = useParams();
  const navigate   = useNavigate();
  const viewerRef  = useRef(null);

  const [files,      setFiles]      = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  /* Track how many files are pre-decoded (for progress indicator) */
  const [readyCnt,        setReadyCnt]        = useState(0);
  /* Progress (0-100) of the currently visible DICOM file */
  const [currentProgress, setCurrentProgress] = useState(100);

  /* ── Inject CSS ── */
  useEffect(() => {
    let el=document.getElementById("osv-css"); if (el) el.remove();
    const s=document.createElement("style"); s.id="osv-css"; s.innerHTML=VIEWER_CSS;
    document.head.appendChild(s);
    return () => { const c=document.getElementById("osv-css"); if (c) c.remove(); };
  }, []);

  /* ── Fetch file list ── */
  useEffect(() => {
    if (!caseId) return;
    const tok = readToken();
    setLoading(true); setError(null); setReadyCnt(0);
    fetch(`${API_BASE}/organization/dashboard/case-files/${encodeURIComponent(caseId)}`, {
      headers: tok ? { Authorization:`Bearer ${tok}` } : {},
    })
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(async (d) => {
        const rawFiles = Array.isArray(d?.files) ? d.files : [];

        // ── Resolve presigned URLs for any S3-backed files ───────────────
        const resolved = await Promise.all(rawFiles.map(async (f) => {
          if (f.storage_type === 's3' && f.s3_key) {
            try {
              const presignedRes = await fetch(
                `/api/storage/download-url?s3_key=${encodeURIComponent(f.s3_key)}`,
                { headers: tok ? { Authorization:`Bearer ${tok}` } : {} }
              );
              const presignedData = await presignedRes.json();
              if (presignedData?.url) return { ...f, url: presignedData.url };
            } catch (e) {
              console.warn('[OrgScanViewer] S3 URL resolve failed for', f.filename, e);
            }
          }
          return f;
        }));

        setFiles(resolved);
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [caseId]);

  /* ── PRE-FETCH + PRE-DECODE files with limited concurrency ─────────────── */
  /* Fires at most 4 parallel decode workers. Launching all 95 simultaneously
     chokes the browser (6-connection limit) and causes most fetches to fail. */
  useEffect(() => {
    if (!files.length) return;
    const tok = readToken();
    let nextIdx = 0;
    let cancelled = false;

    const runWorker = async () => {
      while (!cancelled) {
        const myIdx = nextIdx++;
        if (myIdx >= files.length) break;
        const f = files[myIdx];
        const ft = detectType(f.filename);
        try {
          if      (ft==="dcm")             await decodeDicom(f.url, tok);
          else if (ft==="jpg"||ft==="png") await fetchImgBlob(f.url, tok);
          else if (ft==="nii")             await parseNifti(f.url, tok);
        } catch (e) {
          console.warn("[OSV prefetch]", f.filename, e?.message || e);
        }
        if (!cancelled) setReadyCnt(n => n + 1);
      }
    };

    // 4 parallel workers — enough to saturate connection pool without killing it
    const CONCURRENCY = 4;
    Array.from({ length: CONCURRENCY }, () => runWorker());

    return () => { cancelled = true; };
  }, [files]);

  /* ── Navigation ── */
  const goTo = useCallback((idx) => {
    const n = files.length; if (!n) return;
    const next = Math.max(0, Math.min(idx, n - 1));
    setCurrentIdx(next);
    // Only reset progress to 0 if the target file isn't already decoded.
    // For cached files, image renders instantly — no 0% flash.
    const targetFile = files[next];
    if (targetFile) {
      const targetFull = resolveUrl(targetFile.url);
      setCurrentProgress(RENDER_CACHE.has(targetFull) ? 100 : 0);
    } else {
      setCurrentProgress(0);
    }
  }, [files]);

  /* ── Keyboard ← → ── */
  useEffect(() => {
    const h = (e) => {
      if (["INPUT","TEXTAREA","SELECT"].includes(e.target.tagName)) return;
      if (e.key==="ArrowLeft" ||e.key==="ArrowUp")   { e.preventDefault(); goTo(currentIdx-1); }
      if (e.key==="ArrowRight"||e.key==="ArrowDown") { e.preventDefault(); goTo(currentIdx+1); }
    };
    window.addEventListener("keydown",h);
    return () => window.removeEventListener("keydown",h);
  }, [currentIdx, goTo]);

  /* ── Mouse wheel on viewer (NiftiViewer handles its own via stopPropagation) ── */
  const currentType = detectType(files[currentIdx]?.filename);
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    if (currentType==="nii") return; // NiftiViewer intercepts wheel internally
    goTo(currentIdx + (e.deltaY>0?1:-1));
  }, [currentIdx, currentType, goTo]);

  useEffect(() => {
    const el=viewerRef.current; if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive:false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  /* ── Derived ── */
  const currentFile = files[currentIdx] || null;
  const ft          = currentFile ? detectType(currentFile.filename) : "other";
  const total       = files.length;
  const canPrev     = currentIdx > 0;
  const canNext     = currentIdx < total - 1;
  const curColor    = TYPE_COLOR[ft] || "#94a3b8";
  const curBg       = TYPE_BG[ft]    || "rgba(148,163,184,0.14)";
  const curLabel    = TYPE_LABEL[ft] || "FILE";
  const sliderPct   = total > 1 ? (currentIdx/(total-1))*100 : 100;

  /* Pre-decode progress: show only while actively loading */
  const prefetching = !loading && !error && readyCnt < total && total > 0;

  /* ── RENDER ── */
  return (
    <div className="osv-root" style={{
      height:"100vh", display:"flex", flexDirection:"column",
      background:"#050a14", color:"#f1f5f9", overflowY:"auto", ...sg,
    }}>

      {/* ═══ HEADER ═══ */}
      <div style={{
        height:56, flexShrink:0,
        display:"flex", alignItems:"center", gap:16, padding:"0 22px",
        background:"rgba(5,10,20,0.98)",
        borderBottom:"1px solid rgba(255,255,255,0.07)",
        backdropFilter:"blur(16px)", zIndex:20,
        position:"sticky", top:0,
      }}>

        {/* Logo */}
        <OrgLogo />

        {/* Divider */}
        <div style={{ width:1, height:26, background:"rgba(255,255,255,0.10)", flexShrink:0 }} />

        {/* Case label */}
        <div style={{ minWidth:0 }}>
          <div style={{ fontSize:10, fontWeight:700, color:"#475569", letterSpacing:"1.5px", textTransform:"uppercase" }}>
            Scan Viewer
          </div>
          <div style={{ ...mono, fontSize:13, fontWeight:700, color:"#e2e8f0", lineHeight:1.25, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {caseId || "—"}
          </div>
        </div>

        {/* Current file pill */}
        {!loading && !error && files.length > 0 && currentFile && (
          <div style={{
            display:"flex", alignItems:"center", gap:8,
            background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)",
            borderRadius:20, padding:"4px 14px", minWidth:0, overflow:"hidden",
          }}>
            <span style={{ ...mono, fontSize:11, fontWeight:700, color:curColor, background:curBg, padding:"2px 9px", borderRadius:5, letterSpacing:"0.5px", flexShrink:0 }}>
              {curLabel}
            </span>
            <span style={{ ...mono, fontSize:11, color:"#475569", flexShrink:0 }}>
              {currentIdx+1}/{total}
            </span>
            <span style={{ ...mono, fontSize:11, color:"#64748b", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              {currentFile.filename}
            </span>
          </div>
        )}

        {/* Progress pill — shows % for current DICOM while loading; replaces "Caching X/Y" */}
        {!loading && !error && ft === "dcm" && currentProgress < 100 && (
          <div style={{
            display:"flex", alignItems:"center", gap:10, flexShrink:0,
            background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)",
            borderRadius:20, padding:"5px 14px",
          }}>
            <Spinner size={12} color="#60a5fa"/>
            <span style={{ ...mono, fontSize:11, fontWeight:700, color:"#60a5fa", minWidth:34, textAlign:"right" }}>
              {currentProgress}%
            </span>
            {/* Mini progress bar */}
            <div style={{ width:80, height:3, background:"rgba(255,255,255,0.08)", borderRadius:2, overflow:"hidden" }}>
              <div style={{
                width:`${currentProgress}%`, height:"100%",
                background:"linear-gradient(90deg,#2563eb,#7c3aed)",
                borderRadius:2, transition:"width 0.3s ease",
              }}/>
            </div>
          </div>
        )}

        {/* Close → /organization/dashboard */}
        <button
          onClick={() => navigate("/organization/dashboard")}
          className="osv-btn"
          style={{
            ...sg, marginLeft:"auto", flexShrink:0,
            display:"flex", alignItems:"center", gap:7,
            background:"rgba(239,68,68,0.09)", border:"1px solid rgba(239,68,68,0.28)",
            borderRadius:8, color:"#f87171",
            fontSize:13, fontWeight:700, padding:"7px 18px", cursor:"pointer",
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
          Close
        </button>
      </div>

      {/* ═══ VIEWER ═══ */}
      <div ref={viewerRef} style={{
        flex:1, minHeight:0, position:"relative",
        overflow:"hidden",
        display:"flex", alignItems:"center", justifyContent:"center",
        background:"#030712",
      }}>
        {/* Loading file list */}
        {loading && (
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:16, color:"#475569" }}>
            <Spinner size={40}/><span style={{...mono,fontSize:14}}>Loading case files…</span>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div style={{ background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.18)", borderRadius:12, padding:"24px 32px", maxWidth:480, textAlign:"center", color:"#f87171", ...mono, fontSize:14 }}>
            Failed to load files: {error}
          </div>
        )}

        {/* Empty */}
        {!loading && !error && files.length===0 && (
          <div style={{ textAlign:"center", color:"#475569", ...mono, fontSize:14 }}>
            No scan files found for <b style={{color:"#f1f5f9"}}>{caseId}</b>
          </div>
        )}

        {/* Active viewer — key forces remount on file change */}
        {!loading && !error && currentFile && (
          <div style={{ width:"100%", height:"100%", position:"relative", animation:"fadeIn 0.18s ease" }}>
            {ft==="dcm"                    && <DicomViewer   key={currentFile.url} file={currentFile} onProgress={setCurrentProgress}/>}
            {ft==="nii"                    && <NiftiViewer   key={currentFile.url} file={currentFile}/>}
            {(ft==="jpg"||ft==="png")      && <ImageViewer   key={currentFile.url} file={currentFile}/>}
            {ft==="other"                  && <FallbackViewer file={currentFile}/>}
          </div>
        )}

        {/* Nav hint */}
        {!loading && !error && total > 1 && (
          <div style={{ position:"absolute", top:12, right:14, pointerEvents:"none", background:"rgba(3,7,18,0.75)", backdropFilter:"blur(8px)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:8, padding:"5px 12px", fontSize:11, color:"#374151", ...mono }}>
            ← → keys · scroll to navigate
          </div>
        )}
      </div>

      {/* ═══ FOOTER NAV ═══ */}
      {!loading && !error && total > 0 && (
        <div style={{
          height:68, flexShrink:0,
          display:"flex", alignItems:"center", gap:14, padding:"0 22px",
          background:"rgba(5,10,20,0.98)",
          borderTop:"1px solid rgba(255,255,255,0.07)",
        }}>

          {/* ← Prev */}
          <button onClick={()=>goTo(currentIdx-1)} disabled={!canPrev} className="osv-btn"
            style={{
              ...sg, flexShrink:0, display:"flex", alignItems:"center", gap:6,
              background:canPrev?"rgba(37,99,235,0.12)":"rgba(255,255,255,0.03)",
              border:`1px solid ${canPrev?"rgba(96,165,250,0.35)":"rgba(255,255,255,0.06)"}`,
              borderRadius:8, color:canPrev?"#60a5fa":"#1f2937",
              fontSize:13, fontWeight:700, padding:"8px 18px", cursor:canPrev?"pointer":"not-allowed",
            }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            Prev
          </button>

          {/* Slider + info */}
          <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:6, minWidth:0 }}>
            <input type="range" min={0} max={Math.max(0,total-1)} value={currentIdx}
              onChange={e=>goTo(Number(e.target.value))}
              className="osv-range"
              style={{ width:"100%", accentColor:curColor, background:`linear-gradient(to right,${curColor} ${sliderPct}%,rgba(255,255,255,0.10) ${sliderPct}%)` }}
            />
            <div style={{ display:"flex", alignItems:"center", gap:10, ...mono, fontSize:11, color:"#475569", overflow:"hidden", width:"100%", justifyContent:"center" }}>
              <span style={{ color:curColor, fontWeight:700, background:curBg, padding:"1px 8px", borderRadius:4, flexShrink:0 }}>{curLabel}</span>
              <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", color:"#64748b" }}>{currentFile?.filename||""}</span>
              <span style={{ flexShrink:0 }}><b style={{color:"#f1f5f9"}}>{currentIdx+1}</b><span style={{color:"#374151"}}> / {total}</span></span>
            </div>
          </div>

          {/* Next → */}
          <button onClick={()=>goTo(currentIdx+1)} disabled={!canNext} className="osv-btn"
            style={{
              ...sg, flexShrink:0, display:"flex", alignItems:"center", gap:6,
              background:canNext?"rgba(37,99,235,0.12)":"rgba(255,255,255,0.03)",
              border:`1px solid ${canNext?"rgba(96,165,250,0.35)":"rgba(255,255,255,0.06)"}`,
              borderRadius:8, color:canNext?"#60a5fa":"#1f2937",
              fontSize:13, fontWeight:700, padding:"8px 18px", cursor:canNext?"pointer":"not-allowed",
            }}>
            Next
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>

        </div>
      )}
    </div>
  );
}
