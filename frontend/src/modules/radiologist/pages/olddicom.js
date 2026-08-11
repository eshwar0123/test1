// src/pages/Dicomviewer.jsx
// âœ… Stable Cornerstone3D Viewer (NO workers) +
// âœ… 3-view (Axial/Sagittal/Coronal) "tri-planar slicing" by showing 3 independent stacks (CPU-safe)
// âœ… Single DICOM (X-ray) => 1 stack view
// âœ… NIfTI (.nii/.nii.gz) => Cornerstone NIfTI stack loader
//
// IMPORTANT:
// - This does NOT do true GPU volume-MPR. It uses stack-based scrolling/viewports.
// - Works without GPU and avoids worker registration issues.

import React, { useEffect, useRef, useState } from "react";

import { NVImage } from "@niivue/niivue";


/* ===== INLINE VOICE INPUT ===== */
function VoiceInput({ onText }) {
  const recRef = React.useRef(null);
  const [rec,setRec]=React.useState(false);
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  const start=()=>{
    if(!SR){alert("Speech not supported");return;}
    const r=new SR();
    r.lang="en-IN";
    r.onresult=e=>{
      const t=e.results[0][0].transcript;
      onText && onText(t);
    };
    r.onend=()=>setRec(false);
    r.start();
    recRef.current=r;
    setRec(true);
  };
  const stop=()=>{recRef.current?.stop();setRec(false);};

  return (
    <button onClick={rec?stop:start}
      style={{width:36,height:36,borderRadius:"50%",border:"none",
      background:rec?"#ff3b30":"#25D366",display:"flex",alignItems:"center",justifyContent:"center"}}>
      {rec?<div style={{width:14,height:14,background:"white",borderRadius:3}}/>:
      <svg width="18" height="18" viewBox="0 0 24 24" stroke="black" strokeWidth="2" fill="none">
        <rect x="9" y="2" width="6" height="12" rx="3"/>
        <path d="M5 10a7 7 0 0 0 14 0"/>
        <line x1="12" y1="19" x2="12" y2="22"/>
        <line x1="8" y1="22" x2="16" y2="22"/>
      </svg>}
    </button>
  );
}
/* ============================= */
import { useLocation, useNavigate } from "react-router-dom";
import { CCard, CCardBody, CCardHeader, CButton, CSpinner } from "@coreui/react";
import "./DicomViewer.css";

import * as csCore from "@cornerstonejs/core";
import {
  init as csToolsInit,
  addTool,
  ToolGroupManager,
  Enums as ToolsEnums,
  WindowLevelTool,
  PanTool,
  ZoomTool,
  LengthTool,
  RectangleROITool,
  CircleROITool,
  PlanarFreehandROITool,
  ArrowAnnotateTool,
  StackScrollTool,
  CrosshairsTool,
  annotation as csAnnotation,
} from "@cornerstonejs/tools";

import dicomParser from "dicom-parser";
import * as cornerstoneDICOMImageLoader from "@cornerstonejs/dicom-image-loader";
import {
  init as initNiftiLoader,
  createNiftiImageIdsAndCacheMetadata,
  cornerstoneNiftiImageLoader,
} from "@cornerstonejs/nifti-volume-loader";

const BACKEND_URL = "/api";

// one-time init promise
let csInitPromise = null;

async function initCornerstoneOnce() {
  if (csInitPromise) return csInitPromise;

  csInitPromise = (async () => {
    await csCore.init();
    await initNiftiLoader();
    csCore.imageLoader.registerImageLoader("nifti", cornerstoneNiftiImageLoader);

    // âœ… FIX: loader might be in .default in Vite builds
    const dicomImageLoader =
      cornerstoneDICOMImageLoader.default || cornerstoneDICOMImageLoader;

    // âœ… FIX: ensure external exists
    dicomImageLoader.external = dicomImageLoader.external || {};
    dicomImageLoader.external.cornerstone = csCore;
    dicomImageLoader.external.dicomParser = dicomParser;

    // âœ… Disable workers to avoid "Worker type dicomImageLoader not registered"
    if (dicomImageLoader.internal?.setOptions) {
      dicomImageLoader.internal.setOptions({
        useWebWorkers: false,
      });
    }

    // âœ… register wadouri scheme (only if exists)
    dicomImageLoader.wadouri?.register?.();

    csToolsInit();
    addTool(WindowLevelTool);
    addTool(PanTool);
    addTool(ZoomTool);
    addTool(LengthTool);
    addTool(RectangleROITool);
    addTool(CircleROITool);
    addTool(PlanarFreehandROITool);
    addTool(ArrowAnnotateTool);
    addTool(StackScrollTool);
    addTool(CrosshairsTool);
  })();

  return csInitPromise;
}


function getAbsoluteUrl(raw) {
  if (!raw) return null;
  if (raw.startsWith("http")) return raw;

  const base = BACKEND_URL.endsWith("/") ? BACKEND_URL.slice(0, -1) : BACKEND_URL;
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  return `${base}${path}`;
}

function buildImageId(url) {
  return `wadouri:${encodeURI(url)}`;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function makeGrayImageData(width, height) {
  return new ImageData(width, height);
}

function applyWindowLevelToRGBA(dstImageData, getValueAt, width, height, wc, ww) {
  const data = dstImageData.data;
  const wLow = wc - ww / 2;
  const wHigh = wc + ww / 2;

  let p = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = getValueAt(x, y);
      let g = ((v - wLow) / (wHigh - wLow)) * 255;
      g = clamp(g, 0, 255) | 0;
      data[p++] = g;
      data[p++] = g;
      data[p++] = g;
      data[p++] = 255;
    }
  }
}

function normalizeBox(box) {
  return {
    ...box,
    x0: Math.min(box.x0, box.x1),
    x1: Math.max(box.x0, box.x1),
    y0: Math.min(box.y0, box.y1),
    y1: Math.max(box.y0, box.y1),
    z0: Math.min(box.z0, box.z1),
    z1: Math.max(box.z0, box.z1),
  };
}

const NIFTI_COLORMAP_PRESETS = [
  { label: "BlackBody", csName: "Black-Body Radiation", swatch: "linear-gradient(90deg,#300,#f00,#ff0,#fff)" },
  { label: "BW", csName: "Grayscale", swatch: "linear-gradient(90deg,#000,#fff)" },
  { label: "BWInverse", csName: "Grayscale", invert: true, swatch: "linear-gradient(90deg,#fff,#000)" },
  { label: "Cardiac", csName: "X Ray", swatch: "linear-gradient(90deg,#0af,#f22,#fff)" },
  { label: "Flow", csName: "Blue to Red Rainbow", swatch: "linear-gradient(90deg,#00f,#0ff,#ff0,#f00)" },
  { label: "French", csName: "coolwarm", swatch: "linear-gradient(90deg,#225,#79f,#fff,#f97,#922)" },
  { label: "GrayRainbow", csName: "Rainbow Blended Grey", swatch: "linear-gradient(90deg,#555,#0ff,#ff0,#f0f,#ddd)" },
  { label: "HotGreen", csName: "Haze_green", swatch: "linear-gradient(90deg,#020,#0f0,#dfd)" },
  { label: "HotIron", csName: "RED_TEMPERATURE", swatch: "linear-gradient(90deg,#200,#900,#f44,#fff)" },
  { label: "HotMetal", csName: "2hot", swatch: "linear-gradient(90deg,#000,#f00,#ff0,#fff)" },
  { label: "Hue1", csName: "Rainbow Blended White", swatch: "linear-gradient(90deg,#f0f,#0ff,#ff0,#fff)" },
  { label: "Hue2", csName: "Rainbow Blended Black", swatch: "linear-gradient(90deg,#00f,#0ff,#0f0,#ff0,#f00)" },
  { label: "Jet", csName: "Blue to Red Rainbow", swatch: "linear-gradient(90deg,#00f,#0ff,#ff0,#f00)" },
  { label: "NIH", csName: "X Ray", swatch: "linear-gradient(90deg,#000,#6aa,#fff)" },
  { label: "Perfusion", csName: "Inferno (matplotlib)", swatch: "linear-gradient(90deg,#110,#520,#b30,#f80,#ffb)" },
  { label: "PET", csName: "Plasma (matplotlib)", swatch: "linear-gradient(90deg,#140,#43a,#f35,#fd0)" },
  { label: "Rainbow", csName: "Rainbow Desaturated", swatch: "linear-gradient(90deg,#00f,#0ff,#0f0,#ff0,#f00)" },
  { label: "Rainbow2", csName: "Blue to Yellow", swatch: "linear-gradient(90deg,#00f,#0ff,#ff0)" },
  { label: "Rainbow3", csName: "Red to Blue Rainbow", swatch: "linear-gradient(90deg,#f00,#ff0,#0ff,#00f)" },
  { label: "Ratio", csName: "Cool to Warm", swatch: "linear-gradient(90deg,#36f,#fff,#f63)" },
  { label: "Rred", csName: "Reds", swatch: "linear-gradient(90deg,#300,#900,#f66,#fff)" },
  { label: "Spectrum", csName: "Spectral_lowBlue", swatch: "linear-gradient(90deg,#00f,#0ff,#0f0,#ff0,#f00)" },
  { label: "Stern", csName: "Cool to Warm (Extended)", swatch: "linear-gradient(90deg,#227,#9cf,#fff,#fc9,#722)" },
  { label: "UCLA", csName: "Viridis (matplotlib)", swatch: "linear-gradient(90deg,#440154,#31688e,#35b779,#fde725)" },
  { label: "VRBones", csName: "bone_Matlab", swatch: "linear-gradient(90deg,#000,#6d7d8d,#cfd8dc)" },
  { label: "VRMusclesBones", csName: "copper_Matlab", swatch: "linear-gradient(90deg,#000,#6b4a2f,#c58b55)" },
  { label: "VRRedVessels", csName: "RED-PURPLE", swatch: "linear-gradient(90deg,#200,#800,#f45,#f9f)" },
];

function distPointToSegment(px, py, x0, y0, x1, y1) {
  const vx = x1 - x0;
  const vy = y1 - y0;
  const wx = px - x0;
  const wy = py - y0;
  const c1 = vx * wx + vy * wy;
  if (c1 <= 0) return Math.hypot(px - x0, py - y0);
  const c2 = vx * vx + vy * vy;
  if (c2 <= c1) return Math.hypot(px - x1, py - y1);
  const b = c1 / c2;
  const bx = x0 + b * vx;
  const by = y0 + b * vy;
  return Math.hypot(px - bx, py - by);
}

function pointInBox(px, py, box) {
  return px >= Math.min(box.x0, box.x1) && px <= Math.max(box.x0, box.x1) &&
         py >= Math.min(box.y0, box.y1) && py <= Math.max(box.y0, box.y1);
}

// Sort slices (best-effort) so scrolling is correct
function sortDicomSliceUrls(urls) {
  // If filenames contain numbers like ".../001.dcm", ".../002.dcm"
  // This is a safe best-effort sort.
  return [...urls].sort((a, b) => {
    const ax = (a.match(/(\d+)(?=\.dcm$)/i) || [])[1];
    const bx = (b.match(/(\d+)(?=\.dcm$)/i) || [])[1];
    if (ax && bx) return Number(ax) - Number(bx);
    return a.localeCompare(b);
  });
}

async function waitForElementsReady(elements, attempts = 30) {
  for (let i = 0; i < attempts; i++) {
    const ready = elements.every((el) => el && el.clientWidth > 10 && el.clientHeight > 10);
    if (ready) return true;
    await new Promise((r) => requestAnimationFrame(r));
  }
  return false;
}

export default function DicomViewer() {
  const location = useLocation();
  const navigate = useNavigate();

  const axRef = useRef(null);
  const sagRef = useRef(null);
  const corRef = useRef(null);
  const singleRef = useRef(null);
  const niftiContainerRef = useRef(null);

  const { fileUrl, filename, patientName, patientAge, patientSex, caseId } = location.state || {};

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [isNifti, setIsNifti] = useState(false);
  const [isCornerstoneNifti, setIsCornerstoneNifti] = useState(false);
  const [isSeries, setIsSeries] = useState(false);

  const [niftiVol, setNiftiVol] = useState(null);
  const [nxIndex, setNxIndex] = useState(0);
  const [nyIndex, setNyIndex] = useState(0);
  const [nzIndex, setNzIndex] = useState(0);
  const [niftiBoxes, setNiftiBoxes] = useState([]);
  const [niftiDrag, setNiftiDrag] = useState(null);
  const [niftiGrid, setNiftiGrid] = useState({ rows: 1, cols: 1, mode: "grid" });
  const [niftiPlane, setNiftiPlane] = useState("axial");
  const [niftiSlotPlanes, setNiftiSlotPlanes] = useState(["axial", "sagittal", "coronal"]);
  const [activeNiftiSlot, setActiveNiftiSlot] = useState(0);
  const [showGridMenu, setShowGridMenu] = useState(false);
  const [showPlaneMenu, setShowPlaneMenu] = useState(false);
  const [showColormapMenu, setShowColormapMenu] = useState(false);
  const [niftiSlotColormap, setNiftiSlotColormap] = useState({ 0: "BW", 1: "BW", 2: "BW" });
  const [niftiSliceBySlot, setNiftiSliceBySlot] = useState({
    0: { current: 1, total: 1 },
    1: { current: 1, total: 1 },
    2: { current: 1, total: 1 },
  });
  const [niftiMouseBySlot, setNiftiMouseBySlot] = useState({
    0: { x: null, y: null },
    1: { x: null, y: null },
    2: { x: null, y: null },
  });
  const [niftiGridSelected, setNiftiGridSelected] = useState(false);
  const [niftiZoomMode, setNiftiZoomMode] = useState(false);
  const [niftiZoom, setNiftiZoom] = useState({ axial: 1, sagittal: 1, coronal: 1 });
  const [niftiTool, setNiftiTool] = useState("none"); // none | pan | brightness | measure | crosshair | zoom
  const [niftiWc, setNiftiWc] = useState(null);
  const [niftiWw, setNiftiWw] = useState(null);
  const [niftiRotation, setNiftiRotation] = useState({ axial: 0, sagittal: 0, coronal: 0 });
  const [niftiPan, setNiftiPan] = useState({ axial: { x: 0, y: 0 }, sagittal: { x: 0, y: 0 }, coronal: { x: 0, y: 0 } });
  const [niftiPanDrag, setNiftiPanDrag] = useState(null);
  const [niftiMeasureStart, setNiftiMeasureStart] = useState({ axial: null, sagittal: null, coronal: null });
  const [niftiMeasureHover, setNiftiMeasureHover] = useState({ axial: null, sagittal: null, coronal: null });
  const [niftiMeasures, setNiftiMeasures] = useState([]);
  const [annTool, setAnnTool] = useState("select"); // select | box | circle | freehand | line | arrow
  const [annColor, setAnnColor] = useState("#ff4de3");
  const [annOpacity, setAnnOpacity] = useState(0.6);
  const [annotations, setAnnotations] = useState([]);
  const [selectedAnnId, setSelectedAnnId] = useState(null);
  const [annOwnerFilter, setAnnOwnerFilter] = useState("all"); // all | mine | others
  const [showAnnFilterMenu, setShowAnnFilterMenu] = useState(false);
  const [annDrawing, setAnnDrawing] = useState(null);
  const [annDrag, setAnnDrag] = useState(null);
  const [, setCornerstoneAnnVersion] = useState(0);
  const [cornerstoneAnnNotes, setCornerstoneAnnNotes] = useState({});
  const [cornerstoneAnnMeta, setCornerstoneAnnMeta] = useState({});
  const [annSaveDialog, setAnnSaveDialog] = useState({ open: false, uid: null, slot: 0, plane: "axial", type: "" });
  const [annDraftTitle, setAnnDraftTitle] = useState("");
  const [annDraftComment, setAnnDraftComment] = useState("");
  const [rightTab, setRightTab] = useState("metadata"); // metadata | chat | annotations | onix
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [onixMessages, setOnixMessages] = useState([{ role: "ai", text: "Hi, I'm Onix.AI (UI only). Ask me anything." }]);
  const [onixInput, setOnixInput] = useState("");
  const [showReport, setShowReport] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const reportEditorRef = useRef(null);
  const promptBackupRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playMs, setPlayMs] = useState(120);
  const [saveNotice, setSaveNotice] = useState("");

  // keep viewport ids for reset/fit
  const renderingEngineRef = useRef(null);
  const renderingEngineIdRef = useRef("");
  const toolGroupIdRef = useRef("");
  const viewportIdsRef = useRef([]);
  const niftiVolumeIdRef = useRef(null);

  const getVisibleNiftiSlots = () => {
    const cells = niftiGrid.mode === "main2" ? 3 : Math.max(1, niftiGrid.rows * niftiGrid.cols);
    return Array.from({ length: Math.min(3, cells) }, (_, i) => i);
  };

  const getActiveNiftiViewport = () => {
    if (!isCornerstoneNifti) return null;
    const visibleSlots = getVisibleNiftiSlots();
    const safeSlot = visibleSlots.includes(activeNiftiSlot) ? activeNiftiSlot : visibleSlots[0];
    const vpId = `NIFTI_SLOT_${safeSlot}`;
    if (!vpId) return null;
    const engine = renderingEngineRef.current;
    return engine?.getViewport?.(vpId) || null;
  };

  const getNiftiVolumeDims = () => {
    const vid = niftiVolumeIdRef.current;
    const vol = vid ? csCore.cache.getVolume?.(vid) : null;
    const dims = vol?.dimensions;
    return Array.isArray(dims) && dims.length >= 3 ? dims : [1, 1, 1];
  };

  const getTotalSlicesForSlot = (slot) => {
    const plane = niftiSlotPlanes[slot] || "axial";
    const [dx, dy, dz] = getNiftiVolumeDims();
    if (plane === "sagittal") return Math.max(1, dx | 0);
    if (plane === "coronal") return Math.max(1, dy | 0);
    return Math.max(1, dz | 0);
  };

  const refreshNiftiSliceIndicators = (slots = getVisibleNiftiSlots()) => {
    if (!isCornerstoneNifti) return;
    setNiftiSliceBySlot((prev) => {
      const next = { ...prev };
      slots.forEach((slot) => {
        const vp = renderingEngineRef.current?.getViewport?.(`NIFTI_SLOT_${slot}`);
        const idx = Math.max(0, Number(vp?.getSliceIndex?.() ?? 0)) + 1;
        next[slot] = { current: idx, total: getTotalSlicesForSlot(slot) };
      });
      return next;
    });
  };

  const updateNiftiMouseCoords = (slot, e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.floor(e.clientX - rect.left));
    const y = Math.max(0, Math.floor(e.clientY - rect.top));
    setNiftiMouseBySlot((prev) => ({ ...prev, [slot]: { x, y } }));
  };

  const clearNiftiMouseCoords = (slot) => {
    setNiftiMouseBySlot((prev) => ({ ...prev, [slot]: { x: null, y: null } }));
  };

  const saveSelectedViewportAsPng = () => {
    let canvas = null;
    let plane = "view";
    let slice = 1;

    if (isCornerstoneNifti) {
      const slot = activeNiftiSlot;
      const vp = renderingEngineRef.current?.getViewport?.(`NIFTI_SLOT_${slot}`);
      canvas = vp?.getCanvas?.() || null;
      plane = niftiSlotPlanes[slot] || `slot${slot + 1}`;
      slice = niftiSliceBySlot[slot]?.current || 1;
    } else if (isNifti) {
      const el = document.querySelector(`canvas[data-nifti-plane=\"${niftiPlane}\"]`);
      canvas = el instanceof HTMLCanvasElement ? el : null;
      plane = niftiPlane;
      slice =
        niftiPlane === "axial" ? nzIndex + 1 :
        niftiPlane === "sagittal" ? nxIndex + 1 :
        nyIndex + 1;
    }

    if (!canvas) {
      setSaveNotice('Save failed: no active viewport canvas.');
      setTimeout(() => setSaveNotice(""), 2200);
      return;
    }

    const t = new Date();
    const stamp = `${t.getFullYear()}${String(t.getMonth() + 1).padStart(2, "0")}${String(t.getDate()).padStart(2, "0")}_${String(t.getHours()).padStart(2, "0")}${String(t.getMinutes()).padStart(2, "0")}${String(t.getSeconds()).padStart(2, "0")}`;
    const filename = `radiology_${plane}_slice_${slice}_${stamp}.png`;

    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setSaveNotice(`Saved to "Downloads/${filename}"`);
    setTimeout(() => setSaveNotice(""), 3200);
  };

  const getCornerstoneAnnotationToolName = (toolId) => {
    if (toolId === "box") return RectangleROITool.toolName;
    if (toolId === "circle") return CircleROITool.toolName;
    if (toolId === "freehand") return PlanarFreehandROITool.toolName;
    if (toolId === "line") return LengthTool.toolName;
    if (toolId === "arrow") return ArrowAnnotateTool.toolName;
    return null;
  };

  const activateCornerstoneAnnotationTool = (toolId) => {
    setAnnTool(toolId);
    if (!isCornerstoneNifti) return;
    const tg = ToolGroupManager.getToolGroup(toolGroupIdRef.current);
    if (!tg) return;
    const clearNames = [
      WindowLevelTool.toolName,
      PanTool.toolName,
      ZoomTool.toolName,
      LengthTool.toolName,
      CrosshairsTool.toolName,
      RectangleROITool.toolName,
      CircleROITool.toolName,
      PlanarFreehandROITool.toolName,
      ArrowAnnotateTool.toolName,
    ];
    clearNames.forEach((name) => {
      try { tg.setToolPassive(name); } catch {}
    });
    try { tg.setToolDisabled(CrosshairsTool.toolName); } catch {}
    const target = getCornerstoneAnnotationToolName(toolId);
    if (target) {
      tg.setToolActive(target, { bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }] });
    } else {
      tg.setToolActive(WindowLevelTool.toolName, { bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }] });
    }
  };

  const deleteCornerstoneAnnotationOnActiveSlot = () => {
    if (!isCornerstoneNifti) return;
    const vp = getActiveNiftiViewport();
    if (!vp?.element) return;
    const names = getCornerstoneAnnotationToolName(annTool)
      ? [getCornerstoneAnnotationToolName(annTool)]
      : [
          LengthTool.toolName,
          RectangleROITool.toolName,
          CircleROITool.toolName,
          PlanarFreehandROITool.toolName,
          ArrowAnnotateTool.toolName,
        ];
    for (const name of names) {
      const anns = csAnnotation?.state?.getAnnotations?.(name, vp.element) || [];
      if (anns.length) {
        const last = anns[anns.length - 1];
        if (last?.annotationUID) {
          csAnnotation.state.removeAnnotation(last.annotationUID);
          vp.render?.();
          return;
        }
      }
    }
  };

  const getCornerstoneAnnotationItems = () => {
    if (!isCornerstoneNifti) return [];
    const toolNames = [
      RectangleROITool.toolName,
      CircleROITool.toolName,
      PlanarFreehandROITool.toolName,
      LengthTool.toolName,
      ArrowAnnotateTool.toolName,
    ];
    const labels = {
      [RectangleROITool.toolName]: "box",
      [CircleROITool.toolName]: "circle",
      [PlanarFreehandROITool.toolName]: "free",
      [LengthTool.toolName]: "line",
      [ArrowAnnotateTool.toolName]: "arrow",
    };
    const items = [];
    const seen = new Set();
    [0, 1, 2].forEach((slot) => {
      const vp = renderingEngineRef.current?.getViewport?.(`NIFTI_SLOT_${slot}`);
      if (!vp?.element) return;
      const plane = niftiSlotPlanes[slot] || "axial";
      toolNames.forEach((toolName) => {
        const anns = csAnnotation?.state?.getAnnotations?.(toolName, vp.element) || [];
        anns.forEach((a) => {
          const uid = a.annotationUID;
          if (!uid || seen.has(uid)) return;
          seen.add(uid);
          items.push({
            uid,
            slot,
            plane,
            type: labels[toolName] || toolName,
          });
        });
      });
    });
    return items;
  };

  const getCornerstoneAnnotationItemByUid = (uid) => {
    if (!uid) return null;
    return getCornerstoneAnnotationItems().find((x) => x.uid === uid) || null;
  };

  const openAnnotationSaveDialog = (uid) => {
    const item = getCornerstoneAnnotationItemByUid(uid);
    if (!item) return;
    setAnnDraftTitle("");
    setAnnDraftComment("");
    setAnnSaveDialog({
      open: true,
      uid,
      slot: item.slot,
      plane: item.plane,
      type: item.type,
    });
  };

  const closeAnnotationSaveDialog = () => {
    setAnnSaveDialog({ open: false, uid: null, slot: 0, plane: "axial", type: "" });
    setAnnDraftTitle("");
    setAnnDraftComment("");
  };

  const saveAnnotationDialog = (scope) => {
    const uid = annSaveDialog.uid;
    if (!uid) return;
    const safeType = annSaveDialog.type || "annotation";
    const title = (annDraftTitle || `${safeType} ${Object.keys(cornerstoneAnnMeta).length + 1}`).trim();
    const comment = (annDraftComment || "").trim();
    setCornerstoneAnnMeta((prev) => ({
      ...prev,
      [uid]: {
        title,
        comment,
        scope,
      },
    }));
    setCornerstoneAnnNotes((prev) => ({ ...prev, [uid]: comment }));
    closeAnnotationSaveDialog();
  };

  const deleteCornerstoneAnnotationByUid = (uid, slot) => {
    if (!uid) return;
    csAnnotation?.state?.removeAnnotation?.(uid);
    const vp = Number.isInteger(slot)
      ? renderingEngineRef.current?.getViewport?.(`NIFTI_SLOT_${slot}`)
      : null;
    vp?.render?.();
    const vpIds = getVisibleNiftiSlots().map((s) => `NIFTI_SLOT_${s}`);
    renderingEngineRef.current?.renderViewports?.(vpIds);
    setCornerstoneAnnMeta((prev) => {
      const next = { ...prev };
      delete next[uid];
      return next;
    });
    setCornerstoneAnnNotes((prev) => {
      const next = { ...prev };
      delete next[uid];
      return next;
    });
    setCornerstoneAnnVersion((v) => v + 1);
  };

  const jumpToCornerstoneAnnotationByUid = (uid, slot) => {
    if (!uid || !isCornerstoneNifti) return;
    setActiveNiftiSlot(slot);
    const vp = renderingEngineRef.current?.getViewport?.(`NIFTI_SLOT_${slot}`);
    if (!vp) return;
    const ann = csAnnotation?.state?.getAnnotation?.(uid);
    if (!ann) return;

    const points = [];
    const handlePoints = ann?.data?.handles?.points;
    if (Array.isArray(handlePoints)) {
      handlePoints.forEach((p) => {
        if (Array.isArray(p) && p.length >= 3) points.push(p);
      });
    }
    const polyline = ann?.data?.contour?.polyline;
    if (Array.isArray(polyline)) {
      polyline.forEach((p) => {
        if (Array.isArray(p) && p.length >= 3) points.push(p);
      });
    }
    if (!points.length) return;

    const center = [0, 0, 0];
    for (const p of points) {
      center[0] += p[0];
      center[1] += p[1];
      center[2] += p[2];
    }
    center[0] /= points.length;
    center[1] /= points.length;
    center[2] /= points.length;

    const cam = vp.getCamera?.();
    if (!cam?.focalPoint || !cam?.position) return;
    const vpn = cam?.viewPlaneNormal;
    if (!Array.isArray(vpn) || vpn.length < 3) return;
    const fullDelta = [
      center[0] - cam.focalPoint[0],
      center[1] - cam.focalPoint[1],
      center[2] - cam.focalPoint[2],
    ];
    // Keep image centered: move only along slice direction, not in-plane XY.
    const d = fullDelta[0] * vpn[0] + fullDelta[1] * vpn[1] + fullDelta[2] * vpn[2];
    const delta = [vpn[0] * d, vpn[1] * d, vpn[2] * d];
    vp.setCamera?.({
      focalPoint: [
        cam.focalPoint[0] + delta[0],
        cam.focalPoint[1] + delta[1],
        cam.focalPoint[2] + delta[2],
      ],
      position: [
        cam.position[0] + delta[0],
        cam.position[1] + delta[1],
        cam.position[2] + delta[2],
      ],
    });
    vp.render?.();
  };

  const activateCornerstoneNiftiTool = (mode) => {
    setNiftiTool(mode);
    if (!isCornerstoneNifti) return;
    const tg = ToolGroupManager.getToolGroup(toolGroupIdRef.current);
    if (!tg) return;
    const clearNames = [
      WindowLevelTool.toolName,
      PanTool.toolName,
      ZoomTool.toolName,
      LengthTool.toolName,
      CrosshairsTool.toolName,
      RectangleROITool.toolName,
      CircleROITool.toolName,
      PlanarFreehandROITool.toolName,
      ArrowAnnotateTool.toolName,
    ];
    clearNames.forEach((name) => {
      try { tg.setToolPassive(name); } catch {}
    });
    try { tg.setToolDisabled(CrosshairsTool.toolName); } catch {}
    if (mode === "pan") {
      tg.setToolActive(PanTool.toolName, { bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }] });
    } else if (mode === "brightness") {
      tg.setToolActive(WindowLevelTool.toolName, { bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }] });
    } else if (mode === "measure") {
      tg.setToolActive(LengthTool.toolName, { bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }] });
    } else if (mode === "crosshair") {
      try { tg.setToolEnabled(CrosshairsTool.toolName); } catch {}
      tg.setToolActive(CrosshairsTool.toolName, { bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }] });
    } else if (mode === "zoom") {
      tg.setToolActive(ZoomTool.toolName, { bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }] });
    } else {
      tg.setToolActive(WindowLevelTool.toolName, { bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }] });
    }
    const visibleSlots = getVisibleNiftiSlots();
    const vpIds = visibleSlots.map((slot) => `NIFTI_SLOT_${slot}`);
    renderingEngineRef.current?.renderViewports?.(vpIds);
  };

  const scrollCornerstoneNifti = (delta) => {
    const vp = getActiveNiftiViewport();
    if (!vp?.scroll) return;
    vp.scroll(delta);
    vp.render();
    refreshNiftiSliceIndicators([activeNiftiSlot]);
  };

  const scrollCornerstoneNiftiBySlot = (slot, delta) => {
    if (!isCornerstoneNifti) return;
    const vpId = `NIFTI_SLOT_${slot}`;
    const vp = renderingEngineRef.current?.getViewport?.(vpId);
    if (!vp?.scroll) return;
    vp.scroll(delta);
    vp.render();
    refreshNiftiSliceIndicators([slot]);
  };

  const applyNiftiColormapToSlot = (slot, presetLabel) => {
    if (!isCornerstoneNifti) return;
    const preset = NIFTI_COLORMAP_PRESETS.find((p) => p.label === presetLabel) || NIFTI_COLORMAP_PRESETS[1];
    const volumeId = niftiVolumeIdRef.current;
    const vp = renderingEngineRef.current?.getViewport?.(`NIFTI_SLOT_${slot}`);
    if (!vp?.setProperties) return;
    const props = {
      colormap: { name: preset.csName },
      invert: !!preset.invert,
    };
    try {
      vp.setProperties(props, volumeId || undefined);
    } catch {
      try { vp.setProperties(props); } catch {}
    }
    vp.render?.();
  };

  const handleCornerstoneNiftiWheel = (slot, e) => {
    if (!isCornerstoneNifti) return;
    e.preventDefault();
    const vpId = `NIFTI_SLOT_${slot}`;
    const vp = renderingEngineRef.current?.getViewport?.(vpId);
    if (!vp) return;
    setActiveNiftiSlot(slot);

    if (niftiZoomMode || niftiTool === "zoom") {
      const cam = vp.getCamera?.();
      if (!cam?.parallelScale) return;
      const factor = e.deltaY > 0 ? 1.08 : 0.92;
      const next = clamp(cam.parallelScale * factor, 0.0001, 100000);
      vp.setCamera?.({ parallelScale: next });
      vp.render?.();
      return;
    }

    if (niftiTool === "brightness") {
      const props = vp.getProperties?.() || {};
      const range = props.voiRange || { lower: -150, upper: 250 };
      const shift = e.deltaY > 0 ? -12 : 12;
      vp.setProperties?.({ voiRange: { lower: range.lower + shift, upper: range.upper + shift } });
      vp.render?.();
      return;
    }

    const dir = e.deltaY > 0 ? 1 : -1;
    scrollCornerstoneNiftiBySlot(slot, dir);
  };

  const rotateCornerstoneNifti = (deltaDeg) => {
    const vp = getActiveNiftiViewport();
    if (!vp?.getViewPresentation || !vp?.setViewPresentation) return;
    const present = vp.getViewPresentation() || {};
    const rotation = (((present.rotation || 0) + deltaDeg) % 360 + 360) % 360;
    vp.setViewPresentation({ ...present, rotation });
    vp.render();
  };

  const rebuildNiftiToolGroup = (viewportIds) => {
    const tgId = toolGroupIdRef.current;
    if (!tgId) return null;
    try { ToolGroupManager.destroyToolGroup(tgId); } catch {}
    const tg = ToolGroupManager.createToolGroup(tgId);
    if (!tg) return null;

    tg.addTool(StackScrollTool.toolName);
    tg.addTool(PanTool.toolName);
    tg.addTool(WindowLevelTool.toolName);
    tg.addTool(ZoomTool.toolName);
    tg.addTool(LengthTool.toolName);
    tg.addTool(CrosshairsTool.toolName, {
      configuration: {
        getReferenceLineColor: () => "#22c55e",
        getReferenceLineControllable: () => true,
        getReferenceLineDraggableRotatable: () => true,
        getReferenceLineSlabThicknessControlsOn: () => false,
      },
    });
    tg.addTool(RectangleROITool.toolName);
    tg.addTool(CircleROITool.toolName);
    tg.addTool(PlanarFreehandROITool.toolName);
    tg.addTool(ArrowAnnotateTool.toolName, {
      configuration: {
        arrowFirst: true,
        getTextCallback: (doneChangingTextCallback) => doneChangingTextCallback(" "),
        changeTextCallback: (data, eventData, doneChangingTextCallback) =>
          doneChangingTextCallback(" "),
      },
    });

    viewportIds.forEach((vpId) => {
      try { tg.addViewport(vpId, renderingEngineIdRef.current); } catch {}
    });

    tg.setToolActive(StackScrollTool.toolName, {
      bindings: [{ mouseButton: ToolsEnums.MouseBindings.Wheel }],
    });
    try { tg.setToolDisabled(CrosshairsTool.toolName); } catch {}
    return tg;
  };

  const deleteLastLengthOnNiftiSlot = (slot) => {
    if (!isCornerstoneNifti) return;
    const vp = renderingEngineRef.current?.getViewport?.(`NIFTI_SLOT_${slot}`);
    if (!vp?.element) return;
    const anns = csAnnotation?.state?.getAnnotations?.(LengthTool.toolName, vp.element) || [];
    if (!anns.length) return;
    const last = anns[anns.length - 1];
    if (!last?.annotationUID) return;
    csAnnotation.state.removeAnnotation(last.annotationUID);
    vp.render?.();
  };

  const rebuildCornerstoneNiftiViewports = async () => {
    const engine = renderingEngineRef.current;
    const volumeId = niftiVolumeIdRef.current;
    if (!engine || !volumeId) return;

    const orientationMap = {
      axial: csCore.Enums.OrientationAxis.AXIAL,
      sagittal: csCore.Enums.OrientationAxis.SAGITTAL,
      coronal: csCore.Enums.OrientationAxis.CORONAL,
    };
    const slotElements = [axRef.current, sagRef.current, corRef.current];
    const slots = getVisibleNiftiSlots().filter((slot) => !!slotElements[slot]);
    if (!slots.length) return;

    const viewportsInput = slots.map((slot) => ({
      viewportId: `NIFTI_SLOT_${slot}`,
      type: csCore.Enums.ViewportType.ORTHOGRAPHIC,
      element: slotElements[slot],
      defaultOptions: { orientation: orientationMap[niftiSlotPlanes[slot] || "axial"] },
    }));
    const viewportIds = viewportsInput.map((v) => v.viewportId);
    viewportIdsRef.current = viewportIds;

    engine.setViewports(viewportsInput);
    rebuildNiftiToolGroup(viewportIds);
    await csCore.setVolumesForViewports(engine, [{ volumeId }], viewportIds);
    getVisibleNiftiSlots().forEach((slot) => {
      applyNiftiColormapToSlot(slot, niftiSlotColormap[slot] || "BW");
    });
    engine.resize(true, false);
    engine.renderViewports(viewportIds);
    refreshNiftiSliceIndicators(slots);
    activateCornerstoneNiftiTool(niftiZoomMode ? "zoom" : niftiTool);
  };
  const isScopedToolActive = isCornerstoneNifti && (niftiTool !== "none" || niftiZoomMode || annTool !== "select");

  useEffect(() => {
    if (!fileUrl) {
      setError("No file specified. Please return to the repository.");
      setLoading(false);
      return;
    }

    const rawLower = (fileUrl || "").toLowerCase();
    const nameLower = (filename || "").toLowerCase();

    const nifti =
      rawLower.endsWith(".nii") ||
      rawLower.endsWith(".nii.gz") ||
      nameLower.endsWith(".nii") ||
      nameLower.endsWith(".nii.gz");

    setIsNifti(nifti);
    setIsCornerstoneNifti(nifti);

    const run = async () => {
      try {
        setLoading(true);
        setError(null);

        // -------------------------
        // DICOM / NIfTI -> Cornerstone3D
        // -------------------------
        await initCornerstoneOnce();

        // Setup engine
        const renderingEngineId = `engine_${Date.now()}`;
        const toolGroupId = `tools_${Date.now()}`;

        renderingEngineIdRef.current = renderingEngineId;
        toolGroupIdRef.current = toolGroupId;

        const engine = new csCore.RenderingEngine(renderingEngineId);
        renderingEngineRef.current = engine;

        if (nifti) {
          setIsSeries(true);
          setNiftiGrid({ rows: 2, cols: 2, mode: "main2" });
          setNiftiGridSelected(true);
          setNiftiSlotPlanes(["axial", "sagittal", "coronal"]);
          setActiveNiftiSlot(0);
          // Let React commit the tri-planar layout before checking viewport sizes.
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve))
          );
          const ok = await waitForElementsReady([axRef.current, sagRef.current, corRef.current]);
          if (!ok) throw new Error("Viewport size is 0 (layout not ready).");

          const imageIds = await createNiftiImageIdsAndCacheMetadata({
            url: getAbsoluteUrl(fileUrl),
          });
          if (!imageIds?.length) throw new Error("No NIfTI slices could be created.");

          const volumeId = `nifti:${Date.now()}`;
          const volume = await csCore.volumeLoader.createAndCacheVolume(volumeId, { imageIds });
          await volume.load();
          niftiVolumeIdRef.current = volumeId;

          await rebuildCornerstoneNiftiViewports();

          // Keep old custom CPU NIfTI path disabled.
          setNiftiVol(null);
          setIsPlaying(false);
          setLoading(false);
          return;
        }

        const series = fileUrl.includes("/dicom-series/");
        setIsSeries(series);

        let imageIds = [];
        if (series) {
          const res = await fetch(fileUrl);
          const json = await res.json();

          if (!json.files || json.files.length === 0) {
            throw new Error("No DICOM files found in series.");
          }

          let urls = json.files.map(getAbsoluteUrl);
          urls = sortDicomSliceUrls(urls);
          imageIds = urls.map(buildImageId);
        } else {
          imageIds = [buildImageId(getAbsoluteUrl(fileUrl))];
        }

        // If series has multiple slices -> 3 stacks (same dataset) in 3 viewports
        // If single -> 1 stack
        const showTri = series && imageIds.length > 1;

        if (showTri) {
          // ensure elements have size
          const ok = await waitForElementsReady([axRef.current, sagRef.current, corRef.current]);
          if (!ok) throw new Error("Viewport size is 0 (layout not ready).");

          const viewportIds = ["AXIAL_STACK", "SAGITTAL_STACK", "CORONAL_STACK"];
          viewportIdsRef.current = viewportIds;

          engine.setViewports([
            {
              viewportId: viewportIds[0],
              type: csCore.Enums.ViewportType.STACK,
              element: axRef.current,
              defaultOptions: {},
            },
            {
              viewportId: viewportIds[1],
              type: csCore.Enums.ViewportType.STACK,
              element: sagRef.current,
              defaultOptions: {},
            },
            {
              viewportId: viewportIds[2],
              type: csCore.Enums.ViewportType.STACK,
              element: corRef.current,
              defaultOptions: {},
            },
          ]);

          // Set SAME stack on all three (Papaya-like: three panels, wheel scroll)
          for (const vpId of viewportIds) {
            const vp = engine.getViewport(vpId);
            await vp.setStack(imageIds);
            vp.render();
          }

          // Tool group (shared)
          const tg = ToolGroupManager.createToolGroup(toolGroupId);
          viewportIds.forEach((vpId) => tg.addViewport(vpId, renderingEngineId));

          tg.addTool(StackScrollTool.toolName);
          tg.addTool(CrosshairsTool.toolName, {
            configuration: {
              getReferenceLineColor: () => "#22c55e",
              getReferenceLineControllable: () => true,
              getReferenceLineDraggableRotatable: () => true,
              getReferenceLineSlabThicknessControlsOn: () => false,
            },
          });
          tg.addTool(PanTool.toolName);
          tg.addTool(WindowLevelTool.toolName);
          tg.addTool(ZoomTool.toolName);

          // Mousewheel scroll slices
          tg.setToolActive(StackScrollTool.toolName, {
            bindings: [{ mouseButton: ToolsEnums.MouseBindings.Wheel }],
          });

          // Crosshair left drag (works as overlay indicator, not true volume MPR)
          tg.setToolActive(CrosshairsTool.toolName, {
            bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }],
          });

          // Middle drag pan
          tg.setToolActive(PanTool.toolName, {
            bindings: [{ mouseButton: ToolsEnums.MouseBindings.Auxiliary }],
          });

          // Right drag window/level
          tg.setToolActive(WindowLevelTool.toolName, {
            bindings: [{ mouseButton: ToolsEnums.MouseBindings.Secondary }],
          });

          // Optional ctrl+wheel zoom
          tg.setToolActive(ZoomTool.toolName, {
            bindings: [{ modifierKey: ToolsEnums.KeyboardBindings.Ctrl }],
          });
        } else {
          // Single view
          const ok = await waitForElementsReady([singleRef.current]);
          if (!ok) throw new Error("Viewport size is 0 (layout not ready).");

          const viewportId = "SINGLE_STACK";
          viewportIdsRef.current = [viewportId];

          engine.setViewports([
            {
              viewportId,
              type: csCore.Enums.ViewportType.STACK,
              element: singleRef.current,
              defaultOptions: {},
            },
          ]);

          const vp = engine.getViewport(viewportId);
          await vp.setStack(imageIds);
          vp.render();

          const tg = ToolGroupManager.createToolGroup(toolGroupId);
          tg.addViewport(viewportId, renderingEngineId);

          tg.addTool(StackScrollTool.toolName);
          tg.addTool(PanTool.toolName);
          tg.addTool(WindowLevelTool.toolName);
          tg.addTool(ZoomTool.toolName);

          tg.setToolActive(StackScrollTool.toolName, {
            bindings: [{ mouseButton: ToolsEnums.MouseBindings.Wheel }],
          });
          tg.setToolActive(PanTool.toolName, {
            bindings: [{ mouseButton: ToolsEnums.MouseBindings.Auxiliary }],
          });
          tg.setToolActive(WindowLevelTool.toolName, {
            bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }],
          });
          tg.setToolActive(ZoomTool.toolName, {
            bindings: [{ mouseButton: ToolsEnums.MouseBindings.Secondary }],
          });
        }

        setLoading(false);
      } catch (e) {
        console.error(e);
        setError(e?.message || "Failed to load scan data.");
        setLoading(false);
      }
    };

    run();

    return () => {
      // Cleanup
      niftiVolumeIdRef.current = null;
      try {
        const tgId = toolGroupIdRef.current;
        if (tgId) ToolGroupManager.destroyToolGroup(tgId);
      } catch {}
      try {
        renderingEngineRef.current?.destroy();
      } catch {}
      try {
        csCore.cache.purgeCache();
      } catch {}
    };
  }, [fileUrl, filename]);

  // Attempt to enter fullscreen on first user interaction after openviewer
  const viewerRootRef = useRef(null);

  const requestViewerFullscreen = () => {
    const el = viewerRootRef.current;
    if (!el?.requestFullscreen) return;
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
      return;
    }
    el.requestFullscreen().catch(() => {});
  };

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  useEffect(() => {
    if (!isCornerstoneNifti) return;
    let cancelled = false;
    const id = setTimeout(() => {
      if (cancelled) return;
      rebuildCornerstoneNiftiViewports().catch(() => {});
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [isCornerstoneNifti, niftiGrid, niftiPlane, niftiSlotPlanes, showReport, showSidebar, isFullscreen]);

  useEffect(() => {
    if (!isCornerstoneNifti) return;
    getVisibleNiftiSlots().forEach((slot) => {
      applyNiftiColormapToSlot(slot, niftiSlotColormap[slot] || "BW");
    });
  }, [isCornerstoneNifti, niftiSlotColormap, niftiGrid, niftiSlotPlanes]);

  useEffect(() => {
    if (!isCornerstoneNifti) return;
    const visible = getVisibleNiftiSlots();
    if (!visible.includes(activeNiftiSlot)) {
      setActiveNiftiSlot(visible[0] ?? 0);
    }
  }, [isCornerstoneNifti, niftiGrid, activeNiftiSlot]);

  useEffect(() => {
    if (!isCornerstoneNifti) return;
    const id = setTimeout(() => refreshNiftiSliceIndicators(), 0);
    return () => clearTimeout(id);
  }, [isCornerstoneNifti, niftiSlotPlanes, niftiGrid, activeNiftiSlot]);

  useEffect(() => {
    if (!isCornerstoneNifti) return;
    const supported = new Set([
      RectangleROITool.toolName,
      CircleROITool.toolName,
      PlanarFreehandROITool.toolName,
      LengthTool.toolName,
      ArrowAnnotateTool.toolName,
    ]);
    const onAdded = () => {
      setCornerstoneAnnVersion((v) => v + 1);
    };
    const onCompleted = (evt) => {
      setCornerstoneAnnVersion((v) => v + 1);
      const uid = evt?.detail?.annotation?.annotationUID;
      const toolName = evt?.detail?.annotation?.metadata?.toolName;
      if (!uid || !toolName || !supported.has(toolName)) return;
      setTimeout(() => {
        if (cornerstoneAnnMeta[uid]) return;
        openAnnotationSaveDialog(uid);
      }, 0);
    };
    const onModified = () => setCornerstoneAnnVersion((v) => v + 1);
    const onRemoved = (evt) => {
      const uid = evt?.detail?.annotation?.annotationUID;
      if (uid) {
        setCornerstoneAnnMeta((prev) => {
          const next = { ...prev };
          delete next[uid];
          return next;
        });
        setCornerstoneAnnNotes((prev) => {
          const next = { ...prev };
          delete next[uid];
          return next;
        });
      }
      setCornerstoneAnnVersion((v) => v + 1);
    };
    const target = csCore.eventTarget;
    const added = "CORNERSTONE_TOOLS_ANNOTATION_ADDED";
    const completed = "CORNERSTONE_TOOLS_ANNOTATION_COMPLETED";
    const modified = "CORNERSTONE_TOOLS_ANNOTATION_MODIFIED";
    const removed = "CORNERSTONE_TOOLS_ANNOTATION_REMOVED";
    target.addEventListener(added, onAdded);
    target.addEventListener(completed, onCompleted);
    target.addEventListener(modified, onModified);
    target.addEventListener(removed, onRemoved);
    return () => {
      target.removeEventListener(added, onAdded);
      target.removeEventListener(completed, onCompleted);
      target.removeEventListener(modified, onModified);
      target.removeEventListener(removed, onRemoved);
    };
  }, [isCornerstoneNifti, cornerstoneAnnMeta]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const restorePrompt = () => {
      if (promptBackupRef.current) {
        window.prompt = promptBackupRef.current;
        promptBackupRef.current = null;
      }
    };

    if (!isCornerstoneNifti) {
      restorePrompt();
      return;
    }

    if (!promptBackupRef.current) {
      promptBackupRef.current = window.prompt;
    }
    // Block browser popup notes from ArrowAnnotateTool.
    window.prompt = () => " ";

    return () => {
      restorePrompt();
    };
  }, [isCornerstoneNifti]);

  // Playback slices (NIfTI) like video for current plane
  useEffect(() => {
    if (!isNifti || !isPlaying) return;
    if (isCornerstoneNifti) {
      const id = setInterval(() => {
        const vp = getActiveNiftiViewport();
        if (!vp?.scroll || !vp?.getCamera) return;
        const before = JSON.stringify(vp.getCamera()?.focalPoint || []);
        vp.scroll(1);
        vp.render();
        refreshNiftiSliceIndicators([activeNiftiSlot]);
        const after = JSON.stringify(vp.getCamera()?.focalPoint || []);
        if (before === after) {
          setIsPlaying(false);
        }
      }, playMs);
      return () => clearInterval(id);
    }
    if (!niftiVol) return;
    const id = setInterval(() => {
      if (niftiPlane === "axial") {
        setNzIndex((z) => {
          if (z + 1 >= niftiVol.d) {
            setIsPlaying(false);
            return z;
          }
          return z + 1;
        });
      } else if (niftiPlane === "sagittal") {
        setNxIndex((x) => {
          if (x + 1 >= niftiVol.w) {
            setIsPlaying(false);
            return x;
          }
          return x + 1;
        });
      } else {
        setNyIndex((y) => {
          if (y + 1 >= niftiVol.h) {
            setIsPlaying(false);
            return y;
          }
          return y + 1;
        });
      }
    }, playMs);
    return () => clearInterval(id);
  }, [isPlaying, playMs, isNifti, isCornerstoneNifti, niftiVol, niftiPlane, activeNiftiSlot]);

  // ---- NIfTI tri-planar draw ----
  useEffect(() => {
    if (!niftiVol) return;
    const { w, h, d, data, wc, ww, pixDims } = niftiVol;
    const wcUse = niftiWc ?? wc;
    const wwUse = niftiWw ?? ww;
    const wh = w * h;

    const container = niftiContainerRef.current;
    if (!container) return;
    const canvases = container.querySelectorAll("canvas[data-nifti-plane]");
    if (!canvases.length) return;

    const getAx = (x, y) => data[nzIndex * wh + y * w + x];
    const getSag = (z, y) => data[z * wh + y * w + nxIndex];
    const getCor = (x, z) => data[z * wh + nyIndex * w + x];

    const drawBoxesOnAxial = (ctx) => {
      const active = niftiDrag?.plane === "axial" ? niftiDrag.box : null;
      const all = active ? [...niftiBoxes, active] : niftiBoxes;
      all.forEach((b) => {
        if (nzIndex < b.z0 || nzIndex > b.z1) return;
        const x = b.x0;
        const y = b.y0;
        const bw = b.x1 - b.x0;
        const bh = b.y1 - b.y0;
        if (bw < 1 || bh < 1) return;
        ctx.fillStyle = "rgba(255,0,0,0.2)";
        ctx.strokeStyle = "rgba(255,0,0,0.9)";
        ctx.lineWidth = 1;
        ctx.fillRect(x, y, bw, bh);
        ctx.strokeRect(x + 0.5, y + 0.5, bw, bh);
      });
    };

    const drawBoxesOnSagittal = (ctx) => {
      const active = niftiDrag?.plane === "sagittal" ? niftiDrag.box : null;
      const all = active ? [...niftiBoxes, active] : niftiBoxes;
      all.forEach((b) => {
        if (nxIndex < b.x0 || nxIndex > b.x1) return;
        const x = b.z0;
        const y = b.y0;
        const bw = b.z1 - b.z0;
        const bh = b.y1 - b.y0;
        if (bw < 1 || bh < 1) return;
        ctx.fillStyle = "rgba(255,0,0,0.2)";
        ctx.strokeStyle = "rgba(255,0,0,0.9)";
        ctx.lineWidth = 1;
        ctx.fillRect(x, y, bw, bh);
        ctx.strokeRect(x + 0.5, y + 0.5, bw, bh);
      });
    };

    const drawBoxesOnCoronal = (ctx) => {
      const active = niftiDrag?.plane === "coronal" ? niftiDrag.box : null;
      const all = active ? [...niftiBoxes, active] : niftiBoxes;
      all.forEach((b) => {
        if (nyIndex < b.y0 || nyIndex > b.y1) return;
        const x = b.x0;
        const y = b.z0;
        const bw = b.x1 - b.x0;
        const bh = b.z1 - b.z0;
        if (bw < 1 || bh < 1) return;
        ctx.fillStyle = "rgba(255,0,0,0.2)";
        ctx.strokeStyle = "rgba(255,0,0,0.9)";
        ctx.lineWidth = 1;
        ctx.fillRect(x, y, bw, bh);
        ctx.strokeRect(x + 0.5, y + 0.5, bw, bh);
      });
    };

    canvases.forEach((canvas) => {
      const plane = canvas.dataset.niftiPlane;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      if (plane === "axial") {
        canvas.width = w; canvas.height = h;
        const img = makeGrayImageData(w, h);
        applyWindowLevelToRGBA(img, getAx, w, h, wcUse, wwUse);
        ctx.putImageData(img, 0, 0);
        drawBoxesOnAxial(ctx);
        // annotations
        const annList = annotations.filter((a) => a.plane === "axial" && a.slice === nzIndex);
        annList.forEach((a) => {
          ctx.strokeStyle = a.color;
          ctx.fillStyle = a.color;
          ctx.globalAlpha = a.opacity;
          if (a.type === "box") {
            const bw = a.x1 - a.x0;
            const bh = a.y1 - a.y0;
            ctx.fillRect(a.x0, a.y0, bw, bh);
            ctx.strokeRect(a.x0, a.y0, bw, bh);
          } else if (a.type === "circle") {
            const cx = (a.x0 + a.x1) / 2;
            const cy = (a.y0 + a.y1) / 2;
            const rx = Math.abs(a.x1 - a.x0) / 2;
            const ry = Math.abs(a.y1 - a.y0) / 2;
            ctx.beginPath();
            ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          } else if (a.type === "line" || a.type === "arrow") {
            ctx.beginPath();
            ctx.moveTo(a.x0, a.y0);
            ctx.lineTo(a.x1, a.y1);
            ctx.stroke();
            if (a.type === "arrow") {
              const ang = Math.atan2(a.y1 - a.y0, a.x1 - a.x0);
              const len = 8;
              ctx.beginPath();
              ctx.moveTo(a.x1, a.y1);
              ctx.lineTo(a.x1 - len * Math.cos(ang - 0.4), a.y1 - len * Math.sin(ang - 0.4));
              ctx.lineTo(a.x1 - len * Math.cos(ang + 0.4), a.y1 - len * Math.sin(ang + 0.4));
              ctx.closePath();
              ctx.fill();
            }
          } else if (a.type === "freehand") {
            ctx.beginPath();
            a.points.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        });
        if (annDrawing && annDrawing.plane === "axial" && annDrawing.slice === nzIndex) {
          ctx.strokeStyle = annDrawing.color;
          ctx.fillStyle = annDrawing.color;
          ctx.globalAlpha = annDrawing.opacity;
          if (annDrawing.type === "freehand") {
            ctx.beginPath();
            annDrawing.points.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
            ctx.stroke();
          } else if (annDrawing.type === "line" || annDrawing.type === "arrow") {
            ctx.beginPath();
            ctx.moveTo(annDrawing.x0, annDrawing.y0);
            ctx.lineTo(annDrawing.x1, annDrawing.y1);
            ctx.stroke();
            if (annDrawing.type === "arrow") {
              const ang = Math.atan2(annDrawing.y1 - annDrawing.y0, annDrawing.x1 - annDrawing.x0);
              const len = 8;
              ctx.beginPath();
              ctx.moveTo(annDrawing.x1, annDrawing.y1);
              ctx.lineTo(annDrawing.x1 - len * Math.cos(ang - 0.4), annDrawing.y1 - len * Math.sin(ang - 0.4));
              ctx.lineTo(annDrawing.x1 - len * Math.cos(ang + 0.4), annDrawing.y1 - len * Math.sin(ang + 0.4));
              ctx.closePath();
              ctx.fill();
            }
          } else if (annDrawing.type === "circle") {
            const cx = (annDrawing.x0 + annDrawing.x1) / 2;
            const cy = (annDrawing.y0 + annDrawing.y1) / 2;
            const rx = Math.abs(annDrawing.x1 - annDrawing.x0) / 2;
            const ry = Math.abs(annDrawing.y1 - annDrawing.y0) / 2;
            ctx.beginPath();
            ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          } else {
            const bw = annDrawing.x1 - annDrawing.x0;
            const bh = annDrawing.y1 - annDrawing.y0;
            ctx.fillRect(annDrawing.x0, annDrawing.y0, bw, bh);
            ctx.strokeRect(annDrawing.x0, annDrawing.y0, bw, bh);
          }
          ctx.globalAlpha = 1;
        }
        // measures
        const px = pixDims?.[1] || 1;
        const py = pixDims?.[2] || 1;
        niftiMeasures.filter((m) => m.plane === "axial").forEach((m) => {
          ctx.strokeStyle = "#ff4de3";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(m.x0 + 0.5, m.y0 + 0.5);
          ctx.lineTo(m.x1 + 0.5, m.y1 + 0.5);
          ctx.stroke();
          // endpoints
          ctx.fillStyle = "#5CFF5C";
          ctx.beginPath();
          ctx.arc(m.x0, m.y0, 2.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(m.x1, m.y1, 2.5, 0, Math.PI * 2);
          ctx.fill();
          const dx = (m.x1 - m.x0) * px;
          const dy = (m.y1 - m.y0) * py;
          const dist = Math.sqrt(dx * dx + dy * dy);
          ctx.fillStyle = "#ff4de3";
          ctx.font = "10px sans-serif";
          ctx.fillText(`${dist.toFixed(2)} mm`, m.x1 + 6, m.y1 - 6);
        });
        const hover = niftiMeasureHover.axial;
        const start = niftiMeasureStart.axial;
        if (start && hover) {
          ctx.strokeStyle = "#ff4de3";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(start.x + 0.5, start.y + 0.5);
          ctx.lineTo(hover.x + 0.5, hover.y + 0.5);
          ctx.stroke();
          ctx.fillStyle = "#5CFF5C";
          ctx.beginPath();
          ctx.arc(start.x, start.y, 2.5, 0, Math.PI * 2);
          ctx.fill();
          const dx = (hover.x - start.x) * px;
          const dy = (hover.y - start.y) * py;
          const dist = Math.sqrt(dx * dx + dy * dy);
          ctx.fillStyle = "#ff4de3";
          ctx.font = "10px sans-serif";
          ctx.fillText(`${dist.toFixed(2)} mm`, hover.x + 6, hover.y - 6);
        }
      } else if (plane === "sagittal") {
        canvas.width = d; canvas.height = h;
        const img = makeGrayImageData(d, h);
        applyWindowLevelToRGBA(img, getSag, d, h, wcUse, wwUse);
        ctx.putImageData(img, 0, 0);
        drawBoxesOnSagittal(ctx);
        const annList = annotations.filter((a) => a.plane === "sagittal" && a.slice === nxIndex);
        annList.forEach((a) => {
          ctx.strokeStyle = a.color;
          ctx.fillStyle = a.color;
          ctx.globalAlpha = a.opacity;
          if (a.type === "box") {
            const bw = a.x1 - a.x0;
            const bh = a.y1 - a.y0;
            ctx.fillRect(a.x0, a.y0, bw, bh);
            ctx.strokeRect(a.x0, a.y0, bw, bh);
          } else if (a.type === "circle") {
            const cx = (a.x0 + a.x1) / 2;
            const cy = (a.y0 + a.y1) / 2;
            const rx = Math.abs(a.x1 - a.x0) / 2;
            const ry = Math.abs(a.y1 - a.y0) / 2;
            ctx.beginPath();
            ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          } else if (a.type === "line" || a.type === "arrow") {
            ctx.beginPath();
            ctx.moveTo(a.x0, a.y0);
            ctx.lineTo(a.x1, a.y1);
            ctx.stroke();
            if (a.type === "arrow") {
              const ang = Math.atan2(a.y1 - a.y0, a.x1 - a.x0);
              const len = 8;
              ctx.beginPath();
              ctx.moveTo(a.x1, a.y1);
              ctx.lineTo(a.x1 - len * Math.cos(ang - 0.4), a.y1 - len * Math.sin(ang - 0.4));
              ctx.lineTo(a.x1 - len * Math.cos(ang + 0.4), a.y1 - len * Math.sin(ang + 0.4));
              ctx.closePath();
              ctx.fill();
            }
          } else if (a.type === "freehand") {
            ctx.beginPath();
            a.points.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        });
        if (annDrawing && annDrawing.plane === "sagittal" && annDrawing.slice === nxIndex) {
          ctx.strokeStyle = annDrawing.color;
          ctx.fillStyle = annDrawing.color;
          ctx.globalAlpha = annDrawing.opacity;
          if (annDrawing.type === "freehand") {
            ctx.beginPath();
            annDrawing.points.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
            ctx.stroke();
          } else if (annDrawing.type === "line" || annDrawing.type === "arrow") {
            ctx.beginPath();
            ctx.moveTo(annDrawing.x0, annDrawing.y0);
            ctx.lineTo(annDrawing.x1, annDrawing.y1);
            ctx.stroke();
            if (annDrawing.type === "arrow") {
              const ang = Math.atan2(annDrawing.y1 - annDrawing.y0, annDrawing.x1 - annDrawing.x0);
              const len = 8;
              ctx.beginPath();
              ctx.moveTo(annDrawing.x1, annDrawing.y1);
              ctx.lineTo(annDrawing.x1 - len * Math.cos(ang - 0.4), annDrawing.y1 - len * Math.sin(ang - 0.4));
              ctx.lineTo(annDrawing.x1 - len * Math.cos(ang + 0.4), annDrawing.y1 - len * Math.sin(ang + 0.4));
              ctx.closePath();
              ctx.fill();
            }
          } else if (annDrawing.type === "circle") {
            const cx = (annDrawing.x0 + annDrawing.x1) / 2;
            const cy = (annDrawing.y0 + annDrawing.y1) / 2;
            const rx = Math.abs(annDrawing.x1 - annDrawing.x0) / 2;
            const ry = Math.abs(annDrawing.y1 - annDrawing.y0) / 2;
            ctx.beginPath();
            ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          } else {
            const bw = annDrawing.x1 - annDrawing.x0;
            const bh = annDrawing.y1 - annDrawing.y0;
            ctx.fillRect(annDrawing.x0, annDrawing.y0, bw, bh);
            ctx.strokeRect(annDrawing.x0, annDrawing.y0, bw, bh);
          }
          ctx.globalAlpha = 1;
        }
        const px = pixDims?.[3] || 1;
        const py = pixDims?.[2] || 1;
        niftiMeasures.filter((m) => m.plane === "sagittal").forEach((m) => {
          ctx.strokeStyle = "#ff4de3";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(m.x0 + 0.5, m.y0 + 0.5);
          ctx.lineTo(m.x1 + 0.5, m.y1 + 0.5);
          ctx.stroke();
          ctx.fillStyle = "#5CFF5C";
          ctx.beginPath();
          ctx.arc(m.x0, m.y0, 2.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(m.x1, m.y1, 2.5, 0, Math.PI * 2);
          ctx.fill();
          const dx = (m.x1 - m.x0) * px;
          const dy = (m.y1 - m.y0) * py;
          const dist = Math.sqrt(dx * dx + dy * dy);
          ctx.fillStyle = "#ff4de3";
          ctx.font = "10px sans-serif";
          ctx.fillText(`${dist.toFixed(2)} mm`, m.x1 + 6, m.y1 - 6);
        });
        const hover = niftiMeasureHover.sagittal;
        const start = niftiMeasureStart.sagittal;
        if (start && hover) {
          ctx.strokeStyle = "#ff4de3";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(start.x + 0.5, start.y + 0.5);
          ctx.lineTo(hover.x + 0.5, hover.y + 0.5);
          ctx.stroke();
          ctx.fillStyle = "#5CFF5C";
          ctx.beginPath();
          ctx.arc(start.x, start.y, 2.5, 0, Math.PI * 2);
          ctx.fill();
          const dx = (hover.x - start.x) * px;
          const dy = (hover.y - start.y) * py;
          const dist = Math.sqrt(dx * dx + dy * dy);
          ctx.fillStyle = "#ff4de3";
          ctx.font = "10px sans-serif";
          ctx.fillText(`${dist.toFixed(2)} mm`, hover.x + 6, hover.y - 6);
        }
      } else if (plane === "coronal") {
        canvas.width = w; canvas.height = d;
        const img = makeGrayImageData(w, d);
        applyWindowLevelToRGBA(img, getCor, w, d, wcUse, wwUse);
        ctx.putImageData(img, 0, 0);
        drawBoxesOnCoronal(ctx);
        const annList = annotations.filter((a) => a.plane === "coronal" && a.slice === nyIndex);
        annList.forEach((a) => {
          ctx.strokeStyle = a.color;
          ctx.fillStyle = a.color;
          ctx.globalAlpha = a.opacity;
          if (a.type === "box") {
            const bw = a.x1 - a.x0;
            const bh = a.y1 - a.y0;
            ctx.fillRect(a.x0, a.y0, bw, bh);
            ctx.strokeRect(a.x0, a.y0, bw, bh);
          } else if (a.type === "circle") {
            const cx = (a.x0 + a.x1) / 2;
            const cy = (a.y0 + a.y1) / 2;
            const rx = Math.abs(a.x1 - a.x0) / 2;
            const ry = Math.abs(a.y1 - a.y0) / 2;
            ctx.beginPath();
            ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          } else if (a.type === "line" || a.type === "arrow") {
            ctx.beginPath();
            ctx.moveTo(a.x0, a.y0);
            ctx.lineTo(a.x1, a.y1);
            ctx.stroke();
            if (a.type === "arrow") {
              const ang = Math.atan2(a.y1 - a.y0, a.x1 - a.x0);
              const len = 8;
              ctx.beginPath();
              ctx.moveTo(a.x1, a.y1);
              ctx.lineTo(a.x1 - len * Math.cos(ang - 0.4), a.y1 - len * Math.sin(ang - 0.4));
              ctx.lineTo(a.x1 - len * Math.cos(ang + 0.4), a.y1 - len * Math.sin(ang + 0.4));
              ctx.closePath();
              ctx.fill();
            }
          } else if (a.type === "freehand") {
            ctx.beginPath();
            a.points.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        });
        if (annDrawing && annDrawing.plane === "coronal" && annDrawing.slice === nyIndex) {
          ctx.strokeStyle = annDrawing.color;
          ctx.fillStyle = annDrawing.color;
          ctx.globalAlpha = annDrawing.opacity;
          if (annDrawing.type === "freehand") {
            ctx.beginPath();
            annDrawing.points.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
            ctx.stroke();
          } else if (annDrawing.type === "line" || annDrawing.type === "arrow") {
            ctx.beginPath();
            ctx.moveTo(annDrawing.x0, annDrawing.y0);
            ctx.lineTo(annDrawing.x1, annDrawing.y1);
            ctx.stroke();
            if (annDrawing.type === "arrow") {
              const ang = Math.atan2(annDrawing.y1 - annDrawing.y0, annDrawing.x1 - annDrawing.x0);
              const len = 8;
              ctx.beginPath();
              ctx.moveTo(annDrawing.x1, annDrawing.y1);
              ctx.lineTo(annDrawing.x1 - len * Math.cos(ang - 0.4), annDrawing.y1 - len * Math.sin(ang - 0.4));
              ctx.lineTo(annDrawing.x1 - len * Math.cos(ang + 0.4), annDrawing.y1 - len * Math.sin(ang + 0.4));
              ctx.closePath();
              ctx.fill();
            }
          } else if (annDrawing.type === "circle") {
            const cx = (annDrawing.x0 + annDrawing.x1) / 2;
            const cy = (annDrawing.y0 + annDrawing.y1) / 2;
            const rx = Math.abs(annDrawing.x1 - annDrawing.x0) / 2;
            const ry = Math.abs(annDrawing.y1 - annDrawing.y0) / 2;
            ctx.beginPath();
            ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          } else {
            const bw = annDrawing.x1 - annDrawing.x0;
            const bh = annDrawing.y1 - annDrawing.y0;
            ctx.fillRect(annDrawing.x0, annDrawing.y0, bw, bh);
            ctx.strokeRect(annDrawing.x0, annDrawing.y0, bw, bh);
          }
          ctx.globalAlpha = 1;
        }
        const px = pixDims?.[1] || 1;
        const py = pixDims?.[3] || 1;
        niftiMeasures.filter((m) => m.plane === "coronal").forEach((m) => {
          ctx.strokeStyle = "#ff4de3";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(m.x0 + 0.5, m.y0 + 0.5);
          ctx.lineTo(m.x1 + 0.5, m.y1 + 0.5);
          ctx.stroke();
          ctx.fillStyle = "#5CFF5C";
          ctx.beginPath();
          ctx.arc(m.x0, m.y0, 2.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(m.x1, m.y1, 2.5, 0, Math.PI * 2);
          ctx.fill();
          const dx = (m.x1 - m.x0) * px;
          const dy = (m.y1 - m.y0) * py;
          const dist = Math.sqrt(dx * dx + dy * dy);
          ctx.fillStyle = "#ff4de3";
          ctx.font = "10px sans-serif";
          ctx.fillText(`${dist.toFixed(2)} mm`, m.x1 + 6, m.y1 - 6);
        });
        const hover = niftiMeasureHover.coronal;
        const start = niftiMeasureStart.coronal;
        if (start && hover) {
          ctx.strokeStyle = "#ff4de3";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(start.x + 0.5, start.y + 0.5);
          ctx.lineTo(hover.x + 0.5, hover.y + 0.5);
          ctx.stroke();
          ctx.fillStyle = "#5CFF5C";
          ctx.beginPath();
          ctx.arc(start.x, start.y, 2.5, 0, Math.PI * 2);
          ctx.fill();
          const dx = (hover.x - start.x) * px;
          const dy = (hover.y - start.y) * py;
          const dist = Math.sqrt(dx * dx + dy * dy);
          ctx.fillStyle = "#ff4de3";
          ctx.font = "10px sans-serif";
          ctx.fillText(`${dist.toFixed(2)} mm`, hover.x + 6, hover.y - 6);
        }
      }
    });
  }, [niftiVol, nxIndex, nyIndex, nzIndex, niftiBoxes, niftiDrag, niftiMeasures, niftiWc, niftiWw, niftiMeasureHover, niftiMeasureStart, annotations, annDrawing]);

  const niftiCanvasToVoxel = (canvas, e) => {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * canvas.width);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * canvas.height);
    return { x, y };
  };

  const startNiftiDrag = (plane, e) => {
    if (!niftiVol) return;
    const canvas2 = e.currentTarget;
    const p = niftiCanvasToVoxel(canvas2, e);
    if (niftiTool === "pan") {
      setNiftiPanDrag({ plane, startClient: { x: e.clientX, y: e.clientY }, startPan: { ...niftiPan[plane] } });
      return;
    }
    if (niftiTool === "measure") {
      const start = niftiMeasureStart[plane];
      if (!start) {
        setNiftiMeasureStart((s) => ({ ...s, [plane]: { x: p.x, y: p.y } }));
        setNiftiMeasureHover((h) => ({ ...h, [plane]: { x: p.x, y: p.y } }));
      } else {
        setNiftiMeasures((m) => [...m, { plane, x0: start.x, y0: start.y, x1: p.x, y1: p.y }]);
        setNiftiMeasureStart((s) => ({ ...s, [plane]: null }));
        setNiftiMeasureHover((h) => ({ ...h, [plane]: null }));
      }
      return;
    }
    if (annTool === "select") {
      const hit = hitTestAnnotation(plane, p);
      if (hit) {
        setSelectedAnnId(hit.id);
        setAnnDrag({ id: hit.id, plane, start: p });
      } else {
        setSelectedAnnId(null);
      }
      return;
    }
    if (annTool !== "select") {
      startAnnotation(plane, p);
      return;
    }
    let box;
    if (plane === "axial") {
      box = normalizeBox({
        x0: clamp(p.x, 0, niftiVol.w - 1),
        y0: clamp(p.y, 0, niftiVol.h - 1),
        x1: clamp(p.x, 0, niftiVol.w - 1),
        y1: clamp(p.y, 0, niftiVol.h - 1),
        z0: nzIndex,
        z1: nzIndex,
      });
    } else if (plane === "sagittal") {
      box = normalizeBox({
        x0: nxIndex,
        x1: nxIndex,
        y0: clamp(p.y, 0, niftiVol.h - 1),
        y1: clamp(p.y, 0, niftiVol.h - 1),
        z0: clamp(p.x, 0, niftiVol.d - 1),
        z1: clamp(p.x, 0, niftiVol.d - 1),
      });
    } else {
      box = normalizeBox({
        x0: clamp(p.x, 0, niftiVol.w - 1),
        x1: clamp(p.x, 0, niftiVol.w - 1),
        y0: nyIndex,
        y1: nyIndex,
        z0: clamp(p.y, 0, niftiVol.d - 1),
        z1: clamp(p.y, 0, niftiVol.d - 1),
      });
    }
    setNiftiDrag({ plane, start: p, box });
  };

  const updateNiftiDrag = (plane, e) => {
    if (!niftiVol) return;
    if (niftiTool === "pan" && niftiPanDrag && niftiPanDrag.plane === plane) {
      const dx = e.clientX - niftiPanDrag.startClient.x;
      const dy = e.clientY - niftiPanDrag.startClient.y;
      setNiftiPan((p) => ({
        ...p,
        [plane]: { x: niftiPanDrag.startPan.x + dx, y: niftiPanDrag.startPan.y + dy },
      }));
      return;
    }
    if (niftiTool === "measure") {
      const start = niftiMeasureStart[plane];
      if (start) {
        const canvas = e.currentTarget;
        const p = niftiCanvasToVoxel(canvas, e);
        setNiftiMeasureHover((h) => ({ ...h, [plane]: { x: p.x, y: p.y } }));
      }
      return;
    }
    const canvas = e.currentTarget;
    const p = niftiCanvasToVoxel(canvas, e);
    if (annDrag && annDrag.id) {
      const dx = p.x - annDrag.start.x;
      const dy = p.y - annDrag.start.y;
      setAnnotations((arr) =>
        arr.map((a) => {
          if (a.id !== annDrag.id) return a;
          if (a.type === "freehand") {
            return { ...a, points: a.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })) };
          }
          return { ...a, x0: a.x0 + dx, y0: a.y0 + dy, x1: a.x1 + dx, y1: a.y1 + dy };
        })
      );
      setAnnDrag({ ...annDrag, start: p });
      return;
    }
    if (annDrawing) {
      updateAnnotation(p);
      return;
    }
    if (!niftiDrag || niftiDrag.plane !== plane) return;
    let box = { ...niftiDrag.box };
    if (plane === "axial") {
      box.x1 = clamp(p.x, 0, niftiVol.w - 1);
      box.y1 = clamp(p.y, 0, niftiVol.h - 1);
    } else if (plane === "sagittal") {
      box.z1 = clamp(p.x, 0, niftiVol.d - 1);
      box.y1 = clamp(p.y, 0, niftiVol.h - 1);
    } else {
      box.x1 = clamp(p.x, 0, niftiVol.w - 1);
      box.z1 = clamp(p.y, 0, niftiVol.d - 1);
    }
    setNiftiDrag({ ...niftiDrag, box: normalizeBox(box) });
  };

  const endNiftiDrag = (plane) => {
    if (niftiTool === "pan") {
      setNiftiPanDrag(null);
      return;
    }
    if (niftiTool === "measure") {
      setNiftiMeasureHover((h) => ({ ...h, [plane]: null }));
      return;
    }
    if (annDrawing) finishAnnotation();
    setAnnDrag(null);
    if (!niftiDrag || niftiDrag.plane !== plane) return;
    const b = normalizeBox(niftiDrag.box);
    const isTiny =
      Math.abs(b.x1 - b.x0) < 2 &&
      Math.abs(b.y1 - b.y0) < 2 &&
      Math.abs(b.z1 - b.z0) < 2;
    if (!isTiny) {
      setNiftiBoxes((prev) => [
        ...prev,
        { id: `${Date.now()}_${Math.random().toString(16).slice(2)}`, ...b, note: "" },
      ]);
    }
    setNiftiDrag(null);
  };

  const onNiftiContextMenu = (plane, e) => {
    if (!niftiVol) return;
    if (niftiTool !== "measure") return;
    e.preventDefault();
    const p = niftiCanvasToVoxel(e.currentTarget, e);
    const measures = niftiMeasures
      .map((m, idx) => ({ ...m, idx }))
      .filter((m) => m.plane === plane);
    if (!measures.length) return;
    let best = null;
    for (const m of measures) {
      const d = distPointToSegment(p.x, p.y, m.x0, m.y0, m.x1, m.y1);
      if (!best || d < best.d) best = { d, idx: m.idx };
    }
    // threshold in pixels
    if (best && best.d <= 6) {
      setNiftiMeasures((arr) => arr.filter((_, i) => i !== best.idx));
    }
  };

  const currentSliceIndex = (plane) => {
    if (plane === "axial") return nzIndex;
    if (plane === "sagittal") return nxIndex;
    return nyIndex;
  };

  const startAnnotation = (plane, p) => {
    const slice = currentSliceIndex(plane);
    const base = {
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      type: annTool,
      plane,
      slice,
      color: annColor,
      opacity: annOpacity,
      note: "",
    };
    if (annTool === "freehand") {
      setAnnDrawing({ ...base, points: [p] });
    } else {
      setAnnDrawing({ ...base, x0: p.x, y0: p.y, x1: p.x, y1: p.y });
    }
  };

  const finishAnnotation = () => {
    if (!annDrawing) return;
    setAnnotations((a) => [...a, annDrawing]);
    setSelectedAnnId(annDrawing.id);
    setAnnDrawing(null);
  };

  const updateAnnotation = (p) => {
    if (!annDrawing) return;
    if (annDrawing.type === "freehand") {
      setAnnDrawing((d) => ({ ...d, points: [...d.points, p] }));
    } else {
      setAnnDrawing((d) => ({ ...d, x1: p.x, y1: p.y }));
    }
  };

  const hitTestAnnotation = (plane, p) => {
    const slice = currentSliceIndex(plane);
    const list = annotations.filter((a) => a.plane === plane && a.slice === slice);
    for (let i = list.length - 1; i >= 0; i--) {
      const a = list[i];
      if (a.type === "box") {
        if (pointInBox(p.x, p.y, a)) return a;
      } else if (a.type === "circle") {
        const cx = (a.x0 + a.x1) / 2;
        const cy = (a.y0 + a.y1) / 2;
        const rx = Math.abs(a.x1 - a.x0) / 2;
        const ry = Math.abs(a.y1 - a.y0) / 2;
        const v = ((p.x - cx) ** 2) / (rx * rx + 1e-6) + ((p.y - cy) ** 2) / (ry * ry + 1e-6);
        if (v <= 1.0) return a;
      } else if (a.type === "line" || a.type === "arrow") {
        const d = distPointToSegment(p.x, p.y, a.x0, a.y0, a.x1, a.y1);
        if (d <= 6) return a;
      } else if (a.type === "freehand") {
        for (let j = 1; j < a.points.length; j++) {
          const d = distPointToSegment(p.x, p.y, a.points[j - 1].x, a.points[j - 1].y, a.points[j].x, a.points[j].y);
          if (d <= 6) return a;
        }
      }
    }
    return null;
  };

  const openBoxInViewer = (box) => {
    if (!niftiVol) return;
    // If annotation has plane/slice, jump to that plane/slice
    if (box.plane && typeof box.slice === "number") {
      setNiftiPlane(box.plane);
      if (box.plane === "axial") setNzIndex(clamp(box.slice, 0, niftiVol.d - 1));
      if (box.plane === "sagittal") setNxIndex(clamp(box.slice, 0, niftiVol.w - 1));
      if (box.plane === "coronal") setNyIndex(clamp(box.slice, 0, niftiVol.h - 1));
    }
    // Center on geometry if coords exist
    if (typeof box.x0 === "number" && typeof box.x1 === "number") {
      const cx = Math.round((box.x0 + box.x1) / 2);
      const cy = Math.round((box.y0 + box.y1) / 2);
      setNxIndex(clamp(cx, 0, niftiVol.w - 1));
      setNyIndex(clamp(cy, 0, niftiVol.h - 1));
    } else if (box.points && box.points.length) {
      const xs = box.points.map((p) => p.x);
      const ys = box.points.map((p) => p.y);
      const cx = Math.round((Math.min(...xs) + Math.max(...xs)) / 2);
      const cy = Math.round((Math.min(...ys) + Math.max(...ys)) / 2);
      setNxIndex(clamp(cx, 0, niftiVol.w - 1));
      setNyIndex(clamp(cy, 0, niftiVol.h - 1));
    }
    setNiftiGridSelected(true);
  };

  const sendChat = () => {
    const text = chatInput.trim();
    if (!text) return;
    setChatMessages((m) => [...m, { role: "user", text }]);
    setChatInput("");
  };

  const onChatFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setChatMessages((m) => [...m, { role: "user", text: `ðŸ“Ž ${file.name}` }]);
    e.target.value = "";
  };

  const sendOnix = () => {
    const text = onixInput.trim();
    if (!text) return;
    setOnixMessages((m) => [...m, { role: "user", text }, { role: "ai", text: "Thanks! (UI only response)" }]);
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
    if (el.dataset.inited) return;
    el.dataset.inited = "1";
    el.innerHTML = `
      <div><b>Patient Info:</b> ${patientName ?? ""} ${patientAge ? "(" + patientAge + "y)" : ""} ${patientSex ? "â€¢ " + patientSex : ""} ${caseId ? "â€¢ " + caseId : ""}</div>
      <div><br/></div>
      <div><b>Clinical History:</b> </div>
      <div><br/></div>
      <div><b>Technique:</b> </div>
      <div><br/></div>
      <div><b>Findings:</b> </div>
      <div><br/></div>
      <div><b>Impression:</b> </div>
      <div><br/></div>
      <div><b>Recommendations:</b> </div>
      <div><br/></div>
    `;
  };

  const exportReportPdf = () => {
    window.print();
  };

  const onWheelNiftiAxial = (e) => {
    if (!niftiVol) return;
    e.preventDefault();
    if (niftiTool === "brightness") {
      const delta = e.deltaY > 0 ? -10 : 10;
      setNiftiWc((v) => (v ?? niftiVol.wc) + delta);
      return;
    }
    if (niftiZoomMode) {
      const dir = e.deltaY > 0 ? -1 : 1;
      setNiftiZoom((z) => ({ ...z, axial: clamp(z.axial + dir * 0.1, 0.5, 5) }));
      return;
    }
    const dir = e.deltaY > 0 ? 1 : -1;
    setNzIndex(clamp(nzIndex + dir, 0, niftiVol.d - 1));
  };

  const onWheelNiftiSagittal = (e) => {
    if (!niftiVol) return;
    e.preventDefault();
    if (niftiTool === "brightness") {
      const delta = e.deltaY > 0 ? -10 : 10;
      setNiftiWc((v) => (v ?? niftiVol.wc) + delta);
      return;
    }
    if (niftiZoomMode) {
      const dir = e.deltaY > 0 ? -1 : 1;
      setNiftiZoom((z) => ({ ...z, sagittal: clamp(z.sagittal + dir * 0.1, 0.5, 5) }));
      return;
    }
    const dir = e.deltaY > 0 ? 1 : -1;
    setNxIndex(clamp(nxIndex + dir, 0, niftiVol.w - 1));
  };

  const onWheelNiftiCoronal = (e) => {
    if (!niftiVol) return;
    e.preventDefault();
    if (niftiTool === "brightness") {
      const delta = e.deltaY > 0 ? -10 : 10;
      setNiftiWc((v) => (v ?? niftiVol.wc) + delta);
      return;
    }
    if (niftiZoomMode) {
      const dir = e.deltaY > 0 ? -1 : 1;
      setNiftiZoom((z) => ({ ...z, coronal: clamp(z.coronal + dir * 0.1, 0.5, 5) }));
      return;
    }
    const dir = e.deltaY > 0 ? 1 : -1;
    setNyIndex(clamp(nyIndex + dir, 0, niftiVol.h - 1));
  };

  const handleReset = () => {
    if (isCornerstoneNifti) {
      const engine = renderingEngineRef.current;
      const ids = viewportIdsRef.current || [];
      if (!engine || !ids.length) return;
      ids.forEach((id) => {
        const vp = engine.getViewport(id);
        if (!vp) return;
        try {
          vp.resetCamera?.();
          vp.resetProperties?.();
          vp.render?.();
        } catch {}
      });
      activateCornerstoneNiftiTool(niftiZoomMode ? "zoom" : niftiTool);
      return;
    }
    if (isNifti && niftiVol) {
      setNxIndex(Math.floor(niftiVol.w / 2));
      setNyIndex(Math.floor(niftiVol.h / 2));
      setNzIndex(Math.floor(niftiVol.d / 2));
      return;
    }
    const engine = renderingEngineRef.current;
    const ids = viewportIdsRef.current || [];
    if (!engine || !ids.length) return;

    ids.forEach((id) => {
      const vp = engine.getViewport(id);
      if (!vp) return;
      try {
        vp.resetCamera?.();
        vp.resetProperties?.();
        vp.render?.();
      } catch {}
    });
  };

  const handleFit = () => {
    const engine = renderingEngineRef.current;
    const ids = viewportIdsRef.current || [];
    if (!engine || !ids.length) return;

    ids.forEach((id) => {
      const vp = engine.getViewport(id);
      if (!vp) return;
      try {
        vp.resetCamera?.();
        vp.render?.();
      } catch {}
    });
  };

  const showTriPlanarStacks = isCornerstoneNifti || (!isNifti && isSeries);
  const showNiftiTriPlanar = isNifti && !!niftiVol;

  return (
    <div ref={viewerRootRef} className="p-4" style={{ height: "100vh", width: "100%" }}>
      <CCard className="h-100 d-flex flex-column">
        <CCardHeader
          className="d-flex justify-content-between align-items-center"
          style={{ position: "relative", zIndex: 1000 }}
        >
          <div>
            <strong>Radiology Viewer</strong>
            {filename && <span className="text-muted ms-2">| {filename}</span>}
            {(!isNifti || isCornerstoneNifti) && isSeries && <span className="text-muted ms-2">| 3-Panel Stack (Ax/Sag/Cor)</span>}
            {((!isNifti || isCornerstoneNifti) && !isSeries) && <span className="text-muted ms-2">| Single</span>}
          </div>

          <div className="d-flex gap-2">
            <CButton
              color="primary"
              size="sm"
              onClick={() => {
                setShowReport((v) => !v);
                setRightTab("chat");
                setTimeout(initReportTemplate, 0);
              }}
            >
              Generate Report
            </CButton>
            <CButton color="light" size="sm" onClick={requestViewerFullscreen}>
              {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            </CButton>
            <CButton color="secondary" size="sm" onClick={() => navigate("/repository")}>
              Close Viewer
            </CButton>
          </div>
        </CCardHeader>

        <CCardBody className="p-0 position-relative flex-grow-1" style={{ backgroundColor: "black", overflow: "hidden" }}>
          {error && (
            <div className="d-flex flex-column justify-content-center align-items-center h-100 text-danger position-relative" style={{ zIndex: 20 }}>
              <h4>{error}</h4>
              <CButton color="light" size="sm" onClick={() => navigate("/repository")} className="mt-3">
                Return to Repository
              </CButton>
            </div>
          )}

          {loading && !error && (
            <div
              className="d-flex justify-content-center align-items-center"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 20,
                color: "white",
                backgroundColor: "rgba(0,0,0,0.6)",
              }}
            >
              <CSpinner size="sm" className="me-2" />
              <span>Loading Scan Data...</span>
            </div>
          )}

          {/* Force a real height so viewport is NOT 0 */}
          {!isNifti && (
            <div style={{ height: "100%", width: "100%" }}>
              {showTriPlanarStacks ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, height: "100%", padding: 10 }}>
                  <div ref={axRef} className="cornerstone3d-viewport" style={{ height: "100%", border: "1px solid #2b2b2b", borderRadius: 12, overflow: "hidden" }} />
                  <div ref={sagRef} className="cornerstone3d-viewport" style={{ height: "100%", border: "1px solid #2b2b2b", borderRadius: 12, overflow: "hidden" }} />
                  <div ref={corRef} className="cornerstone3d-viewport" style={{ height: "100%", border: "1px solid #2b2b2b", borderRadius: 12, overflow: "hidden" }} />
                </div>
              ) : (
                <div ref={singleRef} className="cornerstone3d-viewport" style={{ height: "100%", width: "100%" }} />
              )}
            </div>
          )}

          {/* NIfTI tri-planar view */}
          {isNifti && (showNiftiTriPlanar || isCornerstoneNifti) && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: showReport
                  ? "minmax(0,1fr) 1fr"
                  : showSidebar
                    ? "minmax(0,1fr) 320px"
                    : "1fr",
                gap: 10,
                height: "100%",
                padding: 10,
                position: "relative",
              }}
            >
              <div ref={niftiContainerRef} style={{ position: "relative", border: "1px solid #2b2b2b", borderRadius: 12, overflow: "hidden", background: "#000" }}>
                {/* Toolbar */}
                <div style={{ position: "absolute", top: 8, left: 8, zIndex: 5, display: "flex", gap: 8 }}>
                  <div style={{ position: "relative" }}>
                    <button
                      onClick={() => setShowGridMenu((v) => !v)}
                      title="Grid"
                      aria-label="Grid"
                      style={{
                        background: "#1f2937",
                        color: "#e5e7eb",
                        border: niftiGridSelected ? "2px solid #3b82f6" : "1px solid #111827",
                        borderRadius: 6,
                        padding: "6px 8px",
                        display: "flex",
                        alignItems: "center",
                        gap: 6
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                      </svg>
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M2 3l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    {showGridMenu && (
                      <div style={{ position: "absolute", top: 34, left: 0, background: "#2b2b2b", border: "1px solid #111827", borderRadius: 6, padding: 8, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, minWidth: 248 }}>
                        {[
                          { label: "Main+2", rows: 2, cols: 2, mode: "main2" },
                          { label: "1x1", rows: 1, cols: 1, mode: "grid" },
                          { label: "1x2", rows: 1, cols: 2, mode: "grid" },
                          { label: "2x1", rows: 2, cols: 1, mode: "grid" },
                          { label: "2x2", rows: 2, cols: 2, mode: "grid" },
                          { label: "3x1", rows: 3, cols: 1, mode: "grid" },
                          { label: "3x2", rows: 3, cols: 2, mode: "grid" },
                        ].map((g) => (
                          <button
                            key={g.label}
                            onClick={() => { setNiftiGrid({ rows: g.rows, cols: g.cols, mode: g.mode }); setNiftiGridSelected(true); setShowGridMenu(false); }}
                            title={g.label}
                            style={{
                              background: "#1f2937",
                              color: "#e5e7eb",
                              border: (niftiGrid.rows === g.rows && niftiGrid.cols === g.cols && niftiGrid.mode === g.mode) ? "2px solid #3b82f6" : "1px solid #111827",
                              borderRadius: 4,
                              width: 46,
                              height: 40,
                              padding: 0,
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center"
                            }}
                          >
                            <svg width="22" height="18" viewBox="0 0 22 18" fill="none" aria-hidden="true">
                              {g.mode === "main2" ? (
                                <>
                                  <rect x="1" y="1" width="12" height="16" stroke="#d1d5db" strokeWidth="1.2" />
                                  <rect x="14.5" y="1" width="6.5" height="7.5" stroke="#d1d5db" strokeWidth="1.2" />
                                  <rect x="14.5" y="9.5" width="6.5" height="7.5" stroke="#d1d5db" strokeWidth="1.2" />
                                </>
                              ) : (
                                <>
                                  <rect x="1" y="1" width="20" height="16" stroke="#d1d5db" strokeWidth="1.2" />
                                  {Array.from({ length: g.cols - 1 }).map((_, i) => {
                                    const x = 1 + ((i + 1) * 20) / g.cols;
                                    return <path key={`c-${g.label}-${i}`} d={`M${x} 1V17`} stroke="#d1d5db" strokeWidth="1.2" />;
                                  })}
                                  {Array.from({ length: g.rows - 1 }).map((_, i) => {
                                    const y = 1 + ((i + 1) * 16) / g.rows;
                                    return <path key={`r-${g.label}-${i}`} d={`M1 ${y}H21`} stroke="#d1d5db" strokeWidth="1.2" />;
                                  })}
                                </>
                              )}
                            </svg>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{ position: "relative" }}>
                    <button
                      onClick={() => { if (niftiGridSelected) setShowPlaneMenu((v) => !v); }}
                      title="Plane"
                      aria-label="Plane"
                      style={{
                        background: "#1f2937",
                        color: niftiGridSelected ? "#e5e7eb" : "#6b7280",
                        border: "1px solid #111827",
                        borderRadius: 6,
                        padding: "6px 8px",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        cursor: niftiGridSelected ? "pointer" : "not-allowed"
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M3 10a5 5 0 0 1 10 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                        <path d="M8 5v8M5 7h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                      </svg>
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M2 3l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    {showPlaneMenu && (
                      <div style={{ position: "absolute", top: 34, left: 0, background: "#2b2b2b", border: "1px solid #111827", borderRadius: 6, padding: 4, minWidth: 120 }}>
                        {["axial", "coronal", "sagittal"].map((p) => (
                          <button
                            key={p}
                            onClick={() => {
                              if (isCornerstoneNifti) {
                                setNiftiSlotPlanes((prev) => {
                                  const next = [...prev];
                                  const slot = activeNiftiSlot;
                                  const other = next.findIndex((x) => x === p);
                                  if (other >= 0) {
                                    const t = next[slot];
                                    next[slot] = p;
                                    next[other] = t;
                                  } else {
                                    next[slot] = p;
                                  }
                                  return next;
                                });
                                setShowPlaneMenu(false);
                                return;
                              }
                              setNiftiPlane(p);
                              if (p === "axial") setNzIndex(0);
                              if (p === "sagittal") setNxIndex(0);
                              if (p === "coronal") setNyIndex(0);
                              setShowPlaneMenu(false);
                            }}
                            style={{ width: "100%", textAlign: "left", background: (isCornerstoneNifti ? niftiSlotPlanes[activeNiftiSlot] === p : niftiPlane === p) ? "#374151" : "transparent", color: "#e5e7eb", border: "none", padding: "6px 8px", fontSize: 12 }}
                          >
                            {p[0].toUpperCase() + p.slice(1)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{ position: "relative" }}>
                    <button
                      onClick={() => setShowColormapMenu((v) => !v)}
                      disabled={!isNifti}
                      title="Colormap"
                      aria-label="Colormap"
                      style={{
                        background: "#1f2937",
                        color: isNifti ? "#e5e7eb" : "#6b7280",
                        border: "1px solid #111827",
                        borderRadius: 6,
                        padding: "6px 8px",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        cursor: isNifti ? "pointer" : "not-allowed"
                      }}
                    >
                      <span
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 999,
                          border: "1px solid #111827",
                          background: (NIFTI_COLORMAP_PRESETS.find((p) => p.label === (niftiSlotColormap[activeNiftiSlot] || "BW")) || NIFTI_COLORMAP_PRESETS[1]).swatch,
                          display: "inline-block"
                        }}
                      />
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M2 3l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    {showColormapMenu && (
                      <div style={{ position: "absolute", top: 34, left: 0, background: "#2b2b2b", border: "1px solid #111827", borderRadius: 6, padding: 4, minWidth: 230, maxHeight: 420, overflowY: "auto", zIndex: 30 }}>
                        {NIFTI_COLORMAP_PRESETS.map((m) => (
                          <button
                            key={m.label}
                            onClick={() => {
                              setNiftiSlotColormap((prev) => ({ ...prev, [activeNiftiSlot]: m.label }));
                              applyNiftiColormapToSlot(activeNiftiSlot, m.label);
                              setShowColormapMenu(false);
                            }}
                            style={{
                              width: "100%",
                              display: "grid",
                              gridTemplateColumns: "74px 1fr",
                              alignItems: "center",
                              gap: 8,
                              textAlign: "left",
                              background: (niftiSlotColormap[activeNiftiSlot] || "BW") === m.label ? "#6b7280" : "transparent",
                              color: "#e5e7eb",
                              border: "none",
                              padding: "6px 8px",
                              fontSize: 14,
                            }}
                          >
                            <span style={{ height: 12, border: "1px solid #444", background: m.swatch }} />
                            <span>{m.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Zoom toggle (NIfTI only) */}
                  <button
                    onClick={() => {
                      if (isCornerstoneNifti) {
                        const next = !niftiZoomMode;
                        setNiftiZoomMode(next);
                        activateCornerstoneNiftiTool(next ? "zoom" : "brightness");
                        return;
                      }
                      setNiftiZoomMode((v) => !v);
                    }}
                    disabled={!isNifti}
                    title="Zoom (scroll)"
                    aria-label="Zoom"
                    style={{
                      background: "#1f2937",
                      color: isNifti ? "#e5e7eb" : "#6b7280",
                      border: isNifti && niftiZoomMode ? "2px solid #3b82f6" : "1px solid #111827",
                      borderRadius: 6,
                      padding: "6px 8px",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      cursor: isNifti ? "pointer" : "not-allowed"
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ display: "block" }}>
                      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
                      <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                      <path d="M7 5.5v3M5.5 7h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                    </svg>
                  </button>

                  {/* Pan */}
                  <button
                    onClick={() => {
                      if (isCornerstoneNifti) {
                        const next = niftiTool === "pan" ? "none" : "pan";
                        activateCornerstoneNiftiTool(next);
                        return;
                      }
                      setNiftiTool((t) => (t === "pan" ? "none" : "pan"));
                    }}
                    disabled={!isNifti}
                    title="Pan"
                    aria-label="Pan"
                    style={{
                      background: "#1f2937",
                      color: isNifti ? "#e5e7eb" : "#6b7280",
                      border: isNifti && niftiTool === "pan" ? "2px solid #3b82f6" : "1px solid #111827",
                      borderRadius: 6,
                      padding: "6px 8px",
                      display: "flex",
                      alignItems: "center",
                      cursor: isNifti ? "pointer" : "not-allowed"
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M5 7v-2a1 1 0 0 1 2 0v2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                      <path d="M7 7v-3a1 1 0 0 1 2 0v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                      <path d="M9 7v-2a1 1 0 0 1 2 0v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                      <path d="M4.5 7.5v2.5c0 2 1.5 3.5 3.5 3.5h1.5c2 0 3-1.5 3-3.5V8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                    </svg>
                  </button>

                  {/* Brightness */}
                  <button
                    onClick={() => {
                      if (isCornerstoneNifti) {
                        const next = niftiTool === "brightness" ? "none" : "brightness";
                        activateCornerstoneNiftiTool(next);
                        return;
                      }
                      setNiftiTool((t) => (t === "brightness" ? "none" : "brightness"));
                    }}
                    disabled={!isNifti}
                    title="Brightness (scroll)"
                    aria-label="Brightness"
                    style={{
                      background: "#1f2937",
                      color: isNifti ? "#e5e7eb" : "#6b7280",
                      border: isNifti && niftiTool === "brightness" ? "2px solid #3b82f6" : "1px solid #111827",
                      borderRadius: 6,
                      padding: "6px 8px",
                      display: "flex",
                      alignItems: "center",
                      cursor: isNifti ? "pointer" : "not-allowed"
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M8 2a6 6 0 1 0 0 12V2z" fill="currentColor" opacity="0.5" />
                      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" />
                    </svg>
                  </button>

                  {/* Crosshair (tri-planar sync) */}
                  <button
                    onClick={() => {
                      if (isCornerstoneNifti) {
                        setNiftiZoomMode(false);
                        const next = niftiTool === "crosshair" ? "none" : "crosshair";
                        activateCornerstoneNiftiTool(next);
                        return;
                      }
                    }}
                    disabled={!isNifti}
                    title="Crosshair"
                    aria-label="Crosshair"
                    style={{
                      background: "#1f2937",
                      color: isNifti ? "#e5e7eb" : "#6b7280",
                      border: isNifti && niftiTool === "crosshair" ? "2px solid #3b82f6" : "1px solid #111827",
                      borderRadius: 6,
                      padding: "6px 8px",
                      display: "flex",
                      alignItems: "center",
                      cursor: isNifti ? "pointer" : "not-allowed"
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.2" />
                      <path d="M8 2.5v3M8 10.5v3M2.5 8h3M10.5 8h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                      <circle cx="8" cy="8" r="1.1" fill="currentColor" />
                    </svg>
                  </button>

                  <button
                    onClick={saveSelectedViewportAsPng}
                    disabled={!isNifti}
                    title="Save selected view as PNG"
                    aria-label="Save selected view as PNG"
                    style={{
                      background: "#1f2937",
                      color: isNifti ? "#e5e7eb" : "#6b7280",
                      border: "1px solid #111827",
                      borderRadius: 6,
                      padding: "6px 8px",
                      display: "flex",
                      alignItems: "center",
                      cursor: isNifti ? "pointer" : "not-allowed"
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                      <circle cx="6" cy="7" r="1.2" fill="currentColor" />
                      <path d="M4 11l2.2-2.1 1.8 1.7 2.2-2.3L12 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>

                  {/* Rotate CCW */}
                  <button
                    onClick={() => {
                      if (isCornerstoneNifti) {
                        rotateCornerstoneNifti(-90);
                        return;
                      }
                      setNiftiRotation((r) => ({ ...r, [niftiPlane]: (r[niftiPlane] - 90) % 360 }));
                    }}
                    disabled={!isNifti}
                    title="Rotate CCW"
                    aria-label="Rotate CCW"
                    style={{
                      background: "#1f2937",
                      color: isNifti ? "#e5e7eb" : "#6b7280",
                      border: "1px solid #111827",
                      borderRadius: 6,
                      padding: "6px 8px",
                      display: "flex",
                      alignItems: "center",
                      cursor: isNifti ? "pointer" : "not-allowed"
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M6 3H3v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M3 6a5 5 0 1 1 2 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                    </svg>
                  </button>

                  {/* Rotate CW */}
                  <button
                    onClick={() => {
                      if (isCornerstoneNifti) {
                        rotateCornerstoneNifti(90);
                        return;
                      }
                      setNiftiRotation((r) => ({ ...r, [niftiPlane]: (r[niftiPlane] + 90) % 360 }));
                    }}
                    disabled={!isNifti}
                    title="Rotate CW"
                    aria-label="Rotate CW"
                    style={{
                      background: "#1f2937",
                      color: isNifti ? "#e5e7eb" : "#6b7280",
                      border: "1px solid #111827",
                      borderRadius: 6,
                      padding: "6px 8px",
                      display: "flex",
                      alignItems: "center",
                      cursor: isNifti ? "pointer" : "not-allowed"
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M10 3h3v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M13 6a5 5 0 1 0-2 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                    </svg>
                  </button>

                  {/* Measure */}
                  <button
                    onClick={() => {
                      if (isCornerstoneNifti) {
                        const next = niftiTool === "measure" ? "none" : "measure";
                        activateCornerstoneNiftiTool(next);
                        return;
                      }
                      setNiftiTool((t) => (t === "measure" ? "none" : "measure"));
                    }}
                    disabled={!isNifti}
                    title="Measure"
                    aria-label="Measure"
                    style={{
                      background: "#1f2937",
                      color: isNifti ? "#e5e7eb" : "#6b7280",
                      border: isNifti && niftiTool === "measure" ? "2px solid #3b82f6" : "1px solid #111827",
                      borderRadius: 6,
                      padding: "6px 8px",
                      display: "flex",
                      alignItems: "center",
                      cursor: isNifti ? "pointer" : "not-allowed"
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M3 13l10-10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                  </button>

                  {/* Playback controls */}
                  {/* no split between measure and playback */}
                  <button
                    onClick={() => {
                      if (isCornerstoneNifti) {
                        scrollCornerstoneNifti(-1);
                        return;
                      }
                      if (!isNifti || !niftiVol) return;
                      if (niftiPlane === "axial") setNzIndex((z) => Math.max(0, z - 1));
                      if (niftiPlane === "sagittal") setNxIndex((x) => Math.max(0, x - 1));
                      if (niftiPlane === "coronal") setNyIndex((y) => Math.max(0, y - 1));
                    }}
                    disabled={!isNifti}
                    title="Rewind"
                    aria-label="Rewind"
                    style={{ background: "#1f2937", border: "1px solid #111827", borderRadius: 6, padding: "6px 8px", display: "inline-flex", alignItems: "center", justifyContent: "center", color: isNifti ? "#e5e7eb" : "#6b7280", cursor: isNifti ? "pointer" : "not-allowed" }}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M7 4L3 8l4 4V4zM13 4L9 8l4 4V4z" fill="currentColor" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setIsPlaying((p) => !p)}
                    disabled={!isNifti}
                    title={isPlaying ? "Pause" : "Play"}
                    aria-label="Play/Pause"
                    style={{ background: "#1f2937", border: "1px solid #111827", borderRadius: 6, padding: "6px 8px", display: "inline-flex", alignItems: "center", justifyContent: "center", color: isNifti ? "#e5e7eb" : "#6b7280", cursor: isNifti ? "pointer" : "not-allowed" }}
                  >
                    {isPlaying ? (
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M5 4h2v8H5zM9 4h2v8H9z" fill="currentColor" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M5 3l8 5-8 5V3z" fill="currentColor" />
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      if (isCornerstoneNifti) {
                        scrollCornerstoneNifti(1);
                        return;
                      }
                      if (!isNifti || !niftiVol) return;
                      if (niftiPlane === "axial") setNzIndex((z) => Math.min(niftiVol.d - 1, z + 1));
                      if (niftiPlane === "sagittal") setNxIndex((x) => Math.min(niftiVol.w - 1, x + 1));
                      if (niftiPlane === "coronal") setNyIndex((y) => Math.min(niftiVol.h - 1, y + 1));
                    }}
                    disabled={!isNifti}
                    title="Forward"
                    aria-label="Forward"
                    style={{ background: "#1f2937", border: "1px solid #111827", borderRadius: 6, padding: "6px 8px", display: "inline-flex", alignItems: "center", justifyContent: "center", color: isNifti ? "#e5e7eb" : "#6b7280", cursor: isNifti ? "pointer" : "not-allowed" }}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M9 4l4 4-4 4V4zM3 4l4 4-4 4V4z" fill="currentColor" />
                    </svg>
                  </button>
                  <button
                    onClick={() => {
                      if (isCornerstoneNifti) {
                        setIsPlaying(false);
                        const vp = getActiveNiftiViewport();
                        if (vp?.scroll) {
                          vp.scroll(-100000);
                          vp.render();
                          refreshNiftiSliceIndicators([activeNiftiSlot]);
                        }
                        return;
                      }
                      if (!isNifti || !niftiVol) return;
                      setIsPlaying(false);
                      if (niftiPlane === "axial") setNzIndex(0);
                      if (niftiPlane === "sagittal") setNxIndex(0);
                      if (niftiPlane === "coronal") setNyIndex(0);
                    }}
                    disabled={!isNifti}
                    title="Stop"
                    aria-label="Stop"
                    style={{ background: "#1f2937", border: "1px solid #111827", borderRadius: 6, padding: "6px 8px", display: "inline-flex", alignItems: "center", justifyContent: "center", color: isNifti ? "#e5e7eb" : "#6b7280", cursor: isNifti ? "pointer" : "not-allowed" }}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <rect x="4" y="4" width="8" height="8" fill="currentColor" />
                    </svg>
                  </button></div>
                {saveNotice && (
                  <div style={{ marginTop: 6, marginLeft: 6, fontSize: 12, color: "#93c5fd" }}>{saveNotice}</div>
                )}

                {/* Grid views */}
                {isCornerstoneNifti && (
                  niftiGrid.mode === "main2" ? (
                    <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 6, height: "100%", padding: 6 }}>
                      <div
                        onClick={() => setActiveNiftiSlot(0)}
                        style={{
                          border: activeNiftiSlot === 0 ? "2px solid #3b82f6" : "1px solid #2b2b2b",
                          borderRadius: 8,
                          overflow: "hidden",
                          background: "#000",
                          display: "grid",
                          gridTemplateRows: "1fr auto",
                          cursor: "pointer",
                        }}
                      >
                        <div
                          ref={axRef}
                          className="cornerstone3d-viewport"
                          onWheel={(e) => handleCornerstoneNiftiWheel(0, e)}
                          onMouseMove={(e) => updateNiftiMouseCoords(0, e)}
                          onMouseLeave={() => clearNiftiMouseCoords(0)}
                          onContextMenu={(e) => {
                            if (isCornerstoneNifti && niftiTool === "measure") {
                              e.preventDefault();
                              setActiveNiftiSlot(0);
                              deleteLastLengthOnNiftiSlot(0);
                            }
                          }}
                          style={{ width: "100%", height: "100%", position: "relative" }}
                        >
                          <div style={{ position: "absolute", left: 8, bottom: 6, zIndex: 30, fontSize: 11, color: "#cbd5e1", background: "rgba(0,0,0,0.48)", padding: "2px 6px", borderRadius: 4, pointerEvents: "none", lineHeight: 1.3 }}>
                            <div>{`Slices: ${niftiSliceBySlot[0]?.current || 1}/${niftiSliceBySlot[0]?.total || 1}`}</div>
                            <div>{`X:${niftiMouseBySlot[0]?.x ?? "-"} Y:${niftiMouseBySlot[0]?.y ?? "-"}`}</div>
                          </div>
                        </div>
                        <div style={{ color: "#cbd5e1", padding: "6px 8px", fontSize: 11, textAlign: "right" }}>{(niftiSlotPlanes[0] || "axial")[0].toUpperCase() + (niftiSlotPlanes[0] || "axial").slice(1)}</div>
                      </div>
                      <div style={{ display: "grid", gridTemplateRows: "1fr 1fr", gap: 6, height: "100%" }}>
                        {[1, 2].map((slot) => (
                          <div
                            key={slot}
                            onClick={() => setActiveNiftiSlot(slot)}
                            style={{
                              border: activeNiftiSlot === slot ? "2px solid #3b82f6" : "1px solid #2b2b2b",
                              borderRadius: 8,
                              overflow: "hidden",
                              background: "#000",
                              display: "grid",
                              gridTemplateRows: "1fr auto",
                              cursor: "pointer",
                            }}
                          >
                            <div
                              ref={slot === 1 ? sagRef : corRef}
                              className="cornerstone3d-viewport"
                              onWheel={(e) => handleCornerstoneNiftiWheel(slot, e)}
                              onMouseMove={(e) => updateNiftiMouseCoords(slot, e)}
                              onMouseLeave={() => clearNiftiMouseCoords(slot)}
                              onContextMenu={(e) => {
                                if (isCornerstoneNifti && niftiTool === "measure") {
                                  e.preventDefault();
                                  setActiveNiftiSlot(slot);
                                  deleteLastLengthOnNiftiSlot(slot);
                                }
                              }}
                              style={{ width: "100%", height: "100%", pointerEvents: !isScopedToolActive || activeNiftiSlot === slot ? "auto" : "none", position: "relative" }}
                            >
                              <div style={{ position: "absolute", left: 8, bottom: 6, zIndex: 30, fontSize: 11, color: "#cbd5e1", background: "rgba(0,0,0,0.48)", padding: "2px 6px", borderRadius: 4, pointerEvents: "none", lineHeight: 1.3 }}>
                                <div>{`Slices: ${niftiSliceBySlot[slot]?.current || 1}/${niftiSliceBySlot[slot]?.total || 1}`}</div>
                                <div>{`X:${niftiMouseBySlot[slot]?.x ?? "-"} Y:${niftiMouseBySlot[slot]?.y ?? "-"}`}</div>
                              </div>
                            </div>
                            <div style={{ color: "#cbd5e1", padding: "6px 8px", fontSize: 11, textAlign: "right" }}>{(niftiSlotPlanes[slot] || "axial")[0].toUpperCase() + (niftiSlotPlanes[slot] || "axial").slice(1)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: `repeat(${niftiGrid.cols}, 1fr)`,
                        gridTemplateRows: `repeat(${niftiGrid.rows}, 1fr)`,
                        gap: 6,
                        height: "100%",
                        padding: 6,
                      }}
                    >
                      {Array.from({ length: niftiGrid.rows * niftiGrid.cols }).map((_, i) => {
                        const slot = i;
                        if (slot > 2) {
                          return <div key={`blank-${i}`} style={{ border: "1px solid #2b2b2b", borderRadius: 8, background: "#000" }} />;
                        }
                        return (
                          <div
                            key={`slot-${slot}`}
                            onClick={() => setActiveNiftiSlot(slot)}
                            style={{
                              border: activeNiftiSlot === slot ? "2px solid #3b82f6" : "1px solid #2b2b2b",
                              borderRadius: 8,
                              overflow: "hidden",
                              background: "#000",
                              display: "grid",
                              gridTemplateRows: "1fr auto",
                              cursor: "pointer",
                            }}
                          >
                            <div
                              ref={slot === 0 ? axRef : slot === 1 ? sagRef : corRef}
                              className="cornerstone3d-viewport"
                              onWheel={(e) => handleCornerstoneNiftiWheel(slot, e)}
                              onMouseMove={(e) => updateNiftiMouseCoords(slot, e)}
                              onMouseLeave={() => clearNiftiMouseCoords(slot)}
                              onContextMenu={(e) => {
                                if (isCornerstoneNifti && niftiTool === "measure") {
                                  e.preventDefault();
                                  setActiveNiftiSlot(slot);
                                  deleteLastLengthOnNiftiSlot(slot);
                                }
                              }}
                              style={{ width: "100%", height: "100%", pointerEvents: !isScopedToolActive || activeNiftiSlot === slot ? "auto" : "none", position: "relative" }}
                            >
                              <div style={{ position: "absolute", left: 8, bottom: 6, zIndex: 30, fontSize: 11, color: "#cbd5e1", background: "rgba(0,0,0,0.48)", padding: "2px 6px", borderRadius: 4, pointerEvents: "none", lineHeight: 1.3 }}>
                                <div>{`Slices: ${niftiSliceBySlot[slot]?.current || 1}/${niftiSliceBySlot[slot]?.total || 1}`}</div>
                                <div>{`X:${niftiMouseBySlot[slot]?.x ?? "-"} Y:${niftiMouseBySlot[slot]?.y ?? "-"}`}</div>
                              </div>
                            </div>
                            <div style={{ color: "#cbd5e1", padding: "6px 8px", fontSize: 11, textAlign: "right" }}>{(niftiSlotPlanes[slot] || "axial")[0].toUpperCase() + (niftiSlotPlanes[slot] || "axial").slice(1)}</div>
                          </div>
                        );
                      })}
                    </div>
                  )
                )}
                {!isCornerstoneNifti && (
                niftiGrid.mode === "main2" ? (
                  <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 6, height: "100%", padding: 6 }}>
                    <div style={{ border: "1px solid #2b2b2b", borderRadius: 8, overflow: "hidden", background: "#000", display: "grid" }}>
                      <div style={{ color: "#cbd5e1", padding: "6px 8px", fontSize: 11 }}>
                        {niftiPlane === "axial" ? `Axial (Z ${nzIndex + 1}/${niftiVol.d})` :
                         niftiPlane === "sagittal" ? `Sagittal (X ${nxIndex + 1}/${niftiVol.w})` :
                         `Coronal (Y ${nyIndex + 1}/${niftiVol.h})`}
                      </div>
                      <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                        <canvas
                          onWheel={niftiPlane === "axial" ? onWheelNiftiAxial : niftiPlane === "sagittal" ? onWheelNiftiSagittal : onWheelNiftiCoronal}
                          onMouseDown={(e) => startNiftiDrag(niftiPlane, e)}
                          onMouseMove={(e) => updateNiftiDrag(niftiPlane, e)}
                          onMouseUp={() => endNiftiDrag(niftiPlane)}
                          onMouseLeave={() => endNiftiDrag(niftiPlane)}
                          onContextMenu={(e) => onNiftiContextMenu(niftiPlane, e)}
                          data-nifti-plane={niftiPlane}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "contain",
                            display: "block",
                            imageRendering: "auto",
                            cursor: niftiTool === "pan" ? "grab" : "crosshair",
                            transform: `translate(${niftiPan[niftiPlane].x}px, ${niftiPan[niftiPlane].y}px) scale(${niftiZoom[niftiPlane] ?? 1}) rotate(${niftiRotation[niftiPlane]}deg)`,
                            transformOrigin: "center"
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateRows: "1fr 1fr", gap: 6, height: "100%" }}>
                      {["axial", "sagittal", "coronal"].filter((p) => p !== niftiPlane).map((plane) => (
                        <div key={plane} style={{ border: "1px solid #2b2b2b", borderRadius: 8, overflow: "hidden", background: "#000", display: "grid" }}>
                          <div style={{ color: "#cbd5e1", padding: "6px 8px", fontSize: 11 }}>
                            {plane === "axial" ? `Axial (Z ${nzIndex + 1}/${niftiVol.d})` :
                             plane === "sagittal" ? `Sagittal (X ${nxIndex + 1}/${niftiVol.w})` :
                             `Coronal (Y ${nyIndex + 1}/${niftiVol.h})`}
                          </div>
                          <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                            <canvas
                              onWheel={plane === "axial" ? onWheelNiftiAxial : plane === "sagittal" ? onWheelNiftiSagittal : onWheelNiftiCoronal}
                              onMouseDown={(e) => startNiftiDrag(plane, e)}
                              onMouseMove={(e) => updateNiftiDrag(plane, e)}
                              onMouseUp={() => endNiftiDrag(plane)}
                              onMouseLeave={() => endNiftiDrag(plane)}
                              onContextMenu={(e) => onNiftiContextMenu(plane, e)}
                              data-nifti-plane={plane}
                              style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "contain",
                                display: "block",
                                imageRendering: "auto",
                                cursor: niftiTool === "pan" ? "grab" : "crosshair",
                                transform: `translate(${niftiPan[plane].x}px, ${niftiPan[plane].y}px) scale(${niftiZoom[plane] ?? 1}) rotate(${niftiRotation[plane]}deg)`,
                                transformOrigin: "center"
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: `repeat(${niftiGrid.cols}, 1fr)`,
                      gridTemplateRows: `repeat(${niftiGrid.rows}, 1fr)`,
                      gap: 6,
                      height: "100%",
                      padding: 6,
                    }}
                  >
                    {Array.from({ length: niftiGrid.rows * niftiGrid.cols }).map((_, i) => {
                      const plane = niftiPlane;
                      const zoom = niftiZoom[plane] ?? 1;
                      const label =
                        plane === "axial" ? `Axial (Z ${nzIndex + 1}/${niftiVol.d})` :
                        plane === "sagittal" ? `Sagittal (X ${nxIndex + 1}/${niftiVol.w})` :
                        `Coronal (Y ${nyIndex + 1}/${niftiVol.h})`;

                      const onWheel =
                        plane === "axial" ? onWheelNiftiAxial :
                        plane === "sagittal" ? onWheelNiftiSagittal :
                        onWheelNiftiCoronal;

                      return (
                        <div key={i} style={{ border: "1px solid #2b2b2b", borderRadius: 8, overflow: "hidden", background: "#000", display: "grid" }}>
                          <div style={{ color: "#cbd5e1", padding: "6px 8px", fontSize: 11 }}>{label}</div>
                          <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                            <canvas
                              onWheel={onWheel}
                              onMouseDown={(e) => startNiftiDrag(plane, e)}
                              onMouseMove={(e) => updateNiftiDrag(plane, e)}
                              onMouseUp={() => endNiftiDrag(plane)}
                              onMouseLeave={() => endNiftiDrag(plane)}
                              onContextMenu={(e) => onNiftiContextMenu(plane, e)}
                              data-nifti-plane={plane}
                              style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "contain",
                                display: "block",
                                imageRendering: "auto",
                                cursor: niftiTool === "pan" ? "grab" : "crosshair",
                                transform: `translate(${niftiPan[plane].x}px, ${niftiPan[plane].y}px) scale(${zoom}) rotate(${niftiRotation[plane]}deg)`,
                                transformOrigin: "center"
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
                )}
              </div>


              {!showReport && (
                <button
                  onClick={() => setShowSidebar((v) => !v)}
                  title={showSidebar ? "Hide Sidebar" : "Show Sidebar"}
                  aria-label={showSidebar ? "Hide Sidebar" : "Show Sidebar"}
                  style={{
                    position: "absolute",
                    top: "50%",
                    right: showSidebar ? 325 : 8,
                    transform: "translateY(-50%)",
                    zIndex: 20,
                    width: 22,
                    height: 42,
                    borderRadius: 6,
                    border: "1px solid #111827",
                    background: "#3a3a3a",
                    color: "#d1d5db",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                    {showSidebar ? (
                      <path d="M3.5 2l3 3-3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    ) : (
                      <path d="M6.5 2L3.5 5l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    )}
                  </svg>
                </button>
              )}
              {(showReport || showSidebar) && (showReport ? (
                <div style={{ border: "1px solid #1d4ed8", borderRadius: 12, background: "#0b1a4b", color: "#e5e7eb", overflow: "hidden", display: "grid", gridTemplateRows: "auto auto 1fr" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 6, padding: "10px 12px", borderBottom: "1px solid #1f2937", background: "#2f2f2f" }}>
                    <span style={{ fontSize: 16, color: "#e5e7eb", textAlign: "center", fontWeight: 600 }}>Generate Report</span>
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <CButton color="light" size="sm" onClick={exportReportPdf}>
                        Export PDF
                      </CButton>
                      <CButton color="light" size="sm" onClick={() => setShowReport(false)}>
                        Close
                      </CButton>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 6, padding: 6, borderBottom: "1px solid #b3b3b3", background: "#bfbfbf" }}>
                    <button onClick={() => execCmd("undo")} style={{ background: "transparent", border: "none", fontSize: 12 }}>â†¶</button>
                    <button onClick={() => execCmd("redo")} style={{ background: "transparent", border: "none", fontSize: 12 }}>â†·</button>
                    <div style={{ width: 1, height: 18, background: "#bdbdbd" }} />
                    <button onClick={() => execCmd("bold")} style={{ background: "transparent", border: "none", fontWeight: "bold" }}>B</button>
                    <button onClick={() => execCmd("italic")} style={{ background: "transparent", border: "none", fontStyle: "italic" }}>I</button>
                    <button onClick={() => execCmd("underline")} style={{ background: "transparent", border: "none", textDecoration: "underline" }}>U</button>
                    <div style={{ width: 1, height: 18, background: "#bdbdbd" }} />
                    <button onClick={() => execCmd("insertUnorderedList")} style={{ background: "transparent", border: "none" }} aria-label="Bulleted list" title="Bulleted list">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <circle cx="3" cy="4" r="1" fill="#1f2937" />
                        <circle cx="3" cy="8" r="1" fill="#1f2937" />
                        <circle cx="3" cy="12" r="1" fill="#1f2937" />
                        <path d="M6 4h8M6 8h8M6 12h8" stroke="#1f2937" strokeWidth="1.2" strokeLinecap="round" />
                      </svg>
                    </button>
                    <button onClick={() => execCmd("insertOrderedList")} style={{ background: "transparent", border: "none" }} aria-label="Numbered list" title="Numbered list">1.</button>
                    <div style={{ width: 1, height: 18, background: "#bdbdbd" }} />
                    <button onClick={() => execCmd("justifyLeft")} style={{ background: "transparent", border: "none" }} aria-label="Align left" title="Align left">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M3 4h10M3 8h7M3 12h10" stroke="#1f2937" strokeWidth="1.2" strokeLinecap="round" />
                      </svg>
                    </button>
                    <button onClick={() => execCmd("justifyCenter")} style={{ background: "transparent", border: "none" }} aria-label="Align center" title="Align center">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M2.5 4h11M4.5 8h7M2.5 12h11" stroke="#1f2937" strokeWidth="1.2" strokeLinecap="round" />
                      </svg>
                    </button>
                    <button onClick={() => execCmd("justifyRight")} style={{ background: "transparent", border: "none" }} aria-label="Align right" title="Align right">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M3 4h10M6 8h7M3 12h10" stroke="#1f2937" strokeWidth="1.2" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>

                  <div style={{ padding: 10, overflow: "auto", background: "#ffffff", color: "#111827" }}>
                    <div
                      ref={reportEditorRef}
                      contentEditable
                      suppressContentEditableWarning
                      style={{
                        minHeight: "100%",
                        outline: "none",
                        whiteSpace: "pre-wrap",
                        fontSize: 13,
                        lineHeight: 1.5,
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div style={{ border: "1px solid #2b2b2b", borderRadius: 12, background: "#0b0b0b", color: "#e5e7eb", overflow: "hidden", display: "grid", gridTemplateRows: "auto 1fr" }}>
                <div style={{ display: "flex", gap: 6, padding: 8, borderBottom: "1px solid #111827" }}>
                  {["metadata", "chat", "annotations", "onix"].map((t) => (
                    <button
                      key={t}
                      onClick={() => setRightTab(t)}
                      style={{
                        background: rightTab === t ? "#1f2937" : "transparent",
                        color: "#e5e7eb",
                        border: "1px solid #111827",
                        borderRadius: 6,
                        padding: "6px 8px",
                        fontSize: 12
                      }}
                    >
                      {t === "metadata" ? "Metadata" : t === "chat" ? "Inbuilt Chat" : t === "annotations" ? "Annotations" : "Onix.AI"}
                    </button>
                  ))}
                </div>

                <div style={{ padding: 10, overflow: "auto" }}>
                  {rightTab === "metadata" && (
                    <div style={{ border: "1px solid #1f2937", borderRadius: 8, overflow: "hidden", background: "#0b0f16" }}>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          padding: "10px 12px",
                          borderBottom: "1px solid #1f2937",
                          background: "#05070b",
                          fontWeight: 600,
                          fontSize: 13,
                          color: "#e5e7eb",
                        }}
                      >
                        <div>Key</div>
                        <div>Value</div>
                      </div>
                      {[
                        ["PatientName", patientName || "—"],
                        ["PatientID", caseId || "—"],
                        ["Patient Age", patientAge ? `${patientAge}Y` : "—"],
                        ["PatientSex", patientSex || "—"],
                        ["StudyDate", "—"],
                        ["Modality", isNifti ? "NIFTI" : "DICOM"],
                        ["FileName", filename || "—"],
                      ].map(([k, v], idx) => (
                        <div
                          key={k}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            padding: "9px 12px",
                            borderBottom: idx === 6 ? "none" : "1px solid #1f2937",
                            background: idx % 2 ? "#111827" : "#0b0f16",
                            fontSize: 12,
                            color: "#d1d5db",
                          }}
                        >
                          <div>{k}</div>
                          <div style={{ wordBreak: "break-word" }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {rightTab === "chat" && (
                    <div style={{ display: "grid", gridTemplateRows: "1fr auto", gap: 8, height: "100%" }}>
                      <div style={{ minHeight: 200 }}>
                        {chatMessages.length === 0 && <div style={{ fontSize: 12, color: "#6b7280" }}>Start a chat.</div>}
                        {chatMessages.map((m, i) => (
                          <div key={i} style={{ marginBottom: 6, textAlign: m.role === "user" ? "right" : "left" }}>
                            <span style={{ display: "inline-block", padding: "6px 8px", borderRadius: 8, background: m.role === "user" ? "#1f2937" : "#111827", fontSize: 12 }}>
                              {m.text}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <label style={{ background: "#1f2937", color: "#e5e7eb", border: "1px solid #111827", borderRadius: 6, padding: "6px 8px", cursor: "pointer" }} title="Upload file">
                          +
                          <input type="file" style={{ display: "none" }} onChange={onChatFile} />
                        </label>
                        <input
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") sendChat(); }}
                          placeholder="Type message and press Enter"
                          style={{ flex: 1, background: "#0f172a", color: "#e5e7eb", border: "1px solid #1f2937", borderRadius: 6, padding: 8, fontSize: 12 }}
                        />

  <VoiceInput onText={(t)=>setChatInput(p => (p ? p + ' ' + t : t))} />
                        <button
                          onClick={sendChat}
                          style={{ background: "#1f2937", color: "#e5e7eb", border: "1px solid #111827", borderRadius: 6, padding: "6px 10px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                          title="Send"
                        >
                          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                            <path d="M2.5 10.2L17.3 3.7c.5-.2 1 .3.8.8l-6.5 14.8c-.2.5-1 .4-1-.2l-1-6.4-6.4-1c-.6-.1-.7-.9-.2-1.5z" fill="currentColor" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}

                  {rightTab === "annotations" && (
                    <div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                        {[
                          { id: "select", label: "Select" },
                          { id: "box", label: "Box" },
                          { id: "circle", label: "Circle" },
                          { id: "freehand", label: "Free" },
                          { id: "line", label: "Line" },
                          { id: "arrow", label: "Arrow" },
                        ].map((t) => (
                          <button
                            key={t.id}
                            onClick={() => {
                              if (isCornerstoneNifti) {
                                activateCornerstoneAnnotationTool(t.id);
                                return;
                              }
                              setAnnTool(t.id);
                            }}
                            style={{
                              background: annTool === t.id ? "#1f2937" : "transparent",
                              color: "#e5e7eb",
                              border: "1px solid #111827",
                              borderRadius: 6,
                              padding: "4px 8px",
                              fontSize: 12
                            }}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                        <span style={{ fontSize: 12, color: "#9ca3af" }}>Filter</span>
                        <div style={{ position: "relative" }}>
                          <button
                            onClick={() => setShowAnnFilterMenu((v) => !v)}
                            style={{
                              background: "#0f172a",
                              color: "#e5e7eb",
                              border: "1px solid #1f2937",
                              borderRadius: 6,
                              padding: "4px 8px",
                              fontSize: 12,
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <span>
                              {annOwnerFilter === "all" ? "All" : annOwnerFilter === "mine" ? "User" : "Others"}
                            </span>
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                              <path d="M2 3l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>
                          {showAnnFilterMenu && (
                            <div style={{ position: "absolute", top: 30, left: 0, minWidth: 120, background: "#0b0f16", border: "1px solid #1f2937", borderRadius: 6, overflow: "hidden", zIndex: 40 }}>
                              {[
                                { id: "all", label: "All", bg: "transparent", fg: "#e5e7eb", accent: "#e5e7eb" },
                                { id: "mine", label: "User", bg: "#0b2b63", fg: "#bfdbfe", accent: "#60a5fa" },
                                { id: "others", label: "Others", bg: "#4a3900", fg: "#fde68a", accent: "#facc15" },
                              ].map((f) => (
                                <button
                                  key={f.id}
                                  onClick={() => {
                                    setAnnOwnerFilter(f.id);
                                    setShowAnnFilterMenu(false);
                                  }}
                                  style={{
                                    width: "100%",
                                    textAlign: "left",
                                    padding: "7px 10px",
                                    border: "none",
                                    borderBottom: "1px solid #1f2937",
                                    background: annOwnerFilter === f.id ? f.bg : "transparent",
                                    color: f.accent,
                                    fontSize: 12,
                                  }}
                                >
                                  {f.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {isCornerstoneNifti ? (
                        <>
                          {getCornerstoneAnnotationItems().filter((a) => !!cornerstoneAnnMeta[a.uid]).filter((a) => {
                            const scope = cornerstoneAnnMeta[a.uid]?.scope || "me";
                            if (annOwnerFilter === "mine") return scope === "me";
                            if (annOwnerFilter === "others") return scope === "all";
                            return true;
                          }).length === 0 && (
                            <div style={{ fontSize: 12, color: "#6b7280" }}>Use tools to draw annotations. After drawing, save from popup to list here.</div>
                          )}
                          {getCornerstoneAnnotationItems().filter((a) => !!cornerstoneAnnMeta[a.uid]).filter((a) => {
                            const scope = cornerstoneAnnMeta[a.uid]?.scope || "me";
                            if (annOwnerFilter === "mine") return scope === "me";
                            if (annOwnerFilter === "others") return scope === "all";
                            return true;
                          }).map((a, idx) => (
                            <div key={a.uid} style={{ border: "1px solid #1f2937", borderRadius: 8, padding: 8, marginBottom: 8 }}>
                              <button
                                onClick={() => jumpToCornerstoneAnnotationByUid(a.uid, a.slot)}
                                style={{ background: "transparent", color: cornerstoneAnnMeta[a.uid]?.scope === "all" ? "#facc15" : "#60a5fa", border: "none", padding: 0, fontSize: 12, textAlign: "left", fontWeight: 600 }}
                              >
                                {(cornerstoneAnnMeta[a.uid]?.title || `${a.type} ${idx + 1}`)}
                              </button>
                              <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 6 }}>
                                plane: {a.plane} · slot: {a.slot + 1}
                              </div>
                              <textarea
                                value={cornerstoneAnnMeta[a.uid]?.comment ?? cornerstoneAnnNotes[a.uid] ?? ""}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setCornerstoneAnnMeta((prev) => ({
                                    ...prev,
                                    [a.uid]: {
                                      ...(prev[a.uid] || {}),
                                      comment: val,
                                    },
                                  }));
                                  setCornerstoneAnnNotes((prev) => ({ ...prev, [a.uid]: val }));
                                }}
                                placeholder="Write comment..."
                                style={{ width: "100%", minHeight: 60, background: "#0f172a", color: "#e5e7eb", border: "1px solid #1f2937", borderRadius: 6, padding: 6, fontSize: 12 }}
                              />
                              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
                                <button
                                  onClick={() => deleteCornerstoneAnnotationByUid(a.uid, a.slot)}
                                  style={{ background: "transparent", color: "#f87171", border: "1px solid #7f1d1d", borderRadius: 6, padding: "2px 8px", fontSize: 11 }}
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          ))}
                        </>
                      ) : (
                        <>
                          {annotations.filter((a) => {
                            if (annOwnerFilter === "others") return false;
                            return true;
                          }).length === 0 && (
                            <div style={{ fontSize: 12, color: "#6b7280" }}>Use tools to draw annotations. Select to move/edit.</div>
                          )}
                          {annotations.filter((a) => {
                            if (annOwnerFilter === "others") return false;
                            return true;
                          }).map((a, idx) => (
                            <div key={a.id} style={{ border: "1px solid #1f2937", borderRadius: 8, padding: 8, marginBottom: 8 }}>
                              <button
                                onClick={() => { setSelectedAnnId(a.id); openBoxInViewer(a); }}
                                style={{ background: "transparent", color: "#60a5fa", border: "none", padding: 0, fontSize: 12, textAlign: "left" }}
                              >
                                {a.type} {idx + 1}
                              </button>
                              <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 6 }}>
                                plane: {a.plane} Â· slice: {a.slice}
                              </div>
                              <textarea
                                value={a.note}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setAnnotations((prev) => prev.map((x) => (x.id === a.id ? { ...x, note: val } : x)));
                                }}
                                placeholder="Write notes..."
                                style={{ width: "100%", minHeight: 60, background: "#0f172a", color: "#e5e7eb", border: "1px solid #1f2937", borderRadius: 6, padding: 6, fontSize: 12 }}
                              />
                              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
                                <button
                                  onClick={() => setAnnotations((arr) => arr.filter((x) => x.id !== a.id))}
                                  style={{ background: "transparent", color: "#f87171", border: "1px solid #7f1d1d", borderRadius: 6, padding: "2px 8px", fontSize: 11 }}
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  )}

                  {rightTab === "onix" && (
                    <div style={{ display: "grid", gridTemplateRows: "1fr auto", gap: 8, height: "100%" }}>
                      <div style={{ minHeight: 200 }}>
                        {onixMessages.map((m, i) => (
                          <div key={i} style={{ marginBottom: 6, textAlign: m.role === "user" ? "right" : "left" }}>
                            <span style={{ display: "inline-block", padding: "6px 8px", borderRadius: 8, background: m.role === "user" ? "#1f2937" : "#111827", fontSize: 12 }}>
                              {m.text}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <input
                          value={onixInput}
                          onChange={(e) => setOnixInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") sendOnix(); }}
                          placeholder="Ask Onix.AI (UI only)"
                          style={{ flex: 1, background: "#0f172a", color: "#e5e7eb", border: "1px solid #1f2937", borderRadius: 6, padding: 8, fontSize: 12 }}
                        />

  <VoiceInput onText={(t)=>setOnixInput(p => (p ? p + ' ' + t : t))} />
                        <button
                          onClick={sendOnix}
                          style={{ background: "#1f2937", color: "#e5e7eb", border: "1px solid #111827", borderRadius: 6, padding: "6px 10px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                          title="Send"
                        >
                          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                            <path d="M2.5 10.2L17.3 3.7c.5-.2 1 .3.8.8l-6.5 14.8c-.2.5-1 .4-1-.2l-1-6.4-6.4-1c-.6-.1-.7-.9-.2-1.5z" fill="currentColor" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                {annSaveDialog.open && (
                  <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1200 }}>
                    <div style={{ width: 420, maxWidth: "92vw", background: "#0b0f16", border: "1px solid #1f2937", borderRadius: 10, padding: 12, color: "#e5e7eb" }}>
                      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Save Annotation</div>
                      <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 8 }}>
                        type: {annSaveDialog.type || "annotation"} · plane: {annSaveDialog.plane} · slot: {annSaveDialog.slot + 1}
                      </div>
                      <input
                        value={annDraftTitle}
                        onChange={(e) => setAnnDraftTitle(e.target.value)}
                        placeholder="Title of the annotation"
                        style={{ width: "100%", background: "#0f172a", color: "#e5e7eb", border: "1px solid #1f2937", borderRadius: 6, padding: 8, fontSize: 12, marginBottom: 8 }}
                      />
                      <textarea
                        value={annDraftComment}
                        onChange={(e) => setAnnDraftComment(e.target.value)}
                        placeholder="Comments"
                        style={{ width: "100%", minHeight: 90, background: "#0f172a", color: "#e5e7eb", border: "1px solid #1f2937", borderRadius: 6, padding: 8, fontSize: 12, marginBottom: 10 }}
                      />
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <button
                          onClick={() => saveAnnotationDialog("me")}
                          style={{ background: "#1d4ed8", color: "#e5e7eb", border: "1px solid #1e40af", borderRadius: 6, padding: "6px 10px", fontSize: 12 }}
                        >
                          View for me
                        </button>
                        <button
                          onClick={() => saveAnnotationDialog("all")}
                          style={{ background: "#a16207", color: "#fef3c7", border: "1px solid #92400e", borderRadius: 6, padding: "6px 10px", fontSize: 12 }}
                        >
                          View for all
                        </button>
                        <button
                          onClick={() => {
                            if (annSaveDialog.uid) {
                              deleteCornerstoneAnnotationByUid(annSaveDialog.uid, annSaveDialog.slot);
                            }
                            closeAnnotationSaveDialog();
                          }}
                          style={{ background: "transparent", color: "#e5e7eb", border: "1px solid #374151", borderRadius: 6, padding: "6px 10px", fontSize: 12 }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              ))}
            </div>
          )}
        </CCardBody>
      </CCard>
    </div>
  );
}
