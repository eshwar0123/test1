// src/pages/Dicomviewer.jsx
// ✅ Stable Cornerstone3D Viewer (NO workers) +
// ✅ 3-view (Axial/Sagittal/Coronal) "tri-planar slicing" by showing 3 independent stacks (CPU-safe)
// ✅ Single DICOM (X-ray) => 1 stack view
// ✅ NIfTI (.nii/.nii.gz) => Cornerstone NIfTI stack loader
//
// IMPORTANT:
// - This does NOT do true GPU volume-MPR. It uses stack-based scrolling/viewports.
// - Works without GPU and avoids worker registration issues.

import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CCard, CCardBody, CButton, CSpinner } from "@coreui/react";
import "./DicomViewer.css";

import * as csCore from "@cornerstonejs/core";
import {
  LengthTool,
  RectangleROITool,
  CircleROITool,
  PlanarFreehandROITool,
  ArrowAnnotateTool,
  annotation as csAnnotation,
} from "@cornerstonejs/tools";
import {
  BACKEND_URL,
  NIFTI_COLORMAP_PRESETS,
} from "./DicomViewer/utils/constants";
import {
  buildImageId,
  clamp,
  distPointToSegment,
  getAbsoluteUrl,
  normalizeBox,
  pointInBox,
  sortDicomSliceUrls,
  waitForElementsReady,
} from "./DicomViewer/utils/viewerUtils";
import ViewerHeader from "./DicomViewer/components/ViewerHeader";
import ViewerImageOverlay from "./DicomViewer/components/ViewerImageOverlay";
import ViewerSidePanel from "./DicomViewer/components/ViewerSidePanel";
import NiftiToolbar from "./DicomViewer/components/NiftiToolbar";
import NiftiCanvasGrid from "./DicomViewer/components/NiftiCanvasGrid";
import CornerstoneNiftiGrid from "./DicomViewer/components/CornerstoneNiftiGrid";
import DicomToolbar from "./DicomViewer/dicom/components/DicomToolbar";
import CornerstoneDicomGrid from "./DicomViewer/dicom/components/CornerstoneDicomGrid";
import ThumbnailStrip from "./DicomViewer/components/ThumbnailStrip";
import Minimap from "./DicomViewer/components/Minimap";
import useCornerstoneAnnotations from "./DicomViewer/hooks/useCornerstoneAnnotations";
import useNiftiCanvasInteractions from "./DicomViewer/hooks/useNiftiCanvasInteractions";
import useNiftiCanvasRenderer from "./DicomViewer/hooks/useNiftiCanvasRenderer";
import useNiftiPlayback from "./DicomViewer/hooks/useNiftiPlayback";
import useDicomPlayback from "./DicomViewer/dicom/hooks/useDicomPlayback";
import useCornerstonePromptBlock from "./DicomViewer/hooks/useCornerstonePromptBlock";
import useViewerReportChat from "./DicomViewer/hooks/useViewerReportChat";
import useMedSAMSegmentation from "./DicomViewer/hooks/useMedSAMSegmentation";
import MedSAMSegmentOverlay from "./DicomViewer/components/MedSAMSegmentOverlay";
import useCornerstoneNiftiControls from "./DicomViewer/hooks/useCornerstoneNiftiControls";
import useCornerstoneDicomControls from "./DicomViewer/dicom/hooks/useCornerstoneDicomControls";
import useViewerDataLoader from "./DicomViewer/hooks/useViewerDataLoader";
import useSeriesGrouping from "./DicomViewer/hooks/useSeriesGrouping";
import useSeriesThumbnails from "./DicomViewer/hooks/useSeriesThumbnails";
import SeriesPickerStrip from "./DicomViewer/components/SeriesPickerStrip";
import useCompareModeLoader from "./DicomViewer/hooks/useCompareModeLoader";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function DicomViewer() {
  const location = useLocation();
  const navigate = useNavigate();

  const axRef = useRef(null);
  const sagRef = useRef(null);
  const corRef = useRef(null);
  const singleRef = useRef(null);
  // Phase 2: 4th viewport ref, only used in compare2x2 mode
  const compareSlot3Ref = useRef(null);
  const niftiContainerRef = useRef(null);

// AFTER
const {
  fileUrl, filename, seriesFiles, patientName, patientAge, patientSex, caseId, clientId,
  priority, status, study, modality: caseModality, referredBy, location: caseLocation, waitMins,
} = location.state || {};

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [isNifti, setIsNifti] = useState(false);
  const [isCornerstoneNifti, setIsCornerstoneNifti] = useState(false);
  const [isCornerstoneDicom, setIsCornerstoneDicom] = useState(false);
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
  const [niftiCrosshairBySlot, setNiftiCrosshairBySlot] = useState({
    0: { x: null, y: null },
    1: { x: null, y: null },
    2: { x: null, y: null },
  });
  const [niftiCrosshairColor] = useState("#22c55e");
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
  const [cornerstoneAnnVersion, setCornerstoneAnnVersion] = useState(0);
  const [cornerstoneAnnNotes, setCornerstoneAnnNotes] = useState({});
  const [cornerstoneAnnMeta, setCornerstoneAnnMeta] = useState({});
  const [annSaveDialog, setAnnSaveDialog] = useState({ open: false, uid: null, slot: 0, plane: "axial", type: "" });
  const [annDraftTitle, setAnnDraftTitle] = useState("");
  const [annDraftComment, setAnnDraftComment] = useState("");
  const [rightTab, setRightTab] = useState("metadata"); // metadata | chat | annotations | onix
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [onixMessages, setOnixMessages] = useState([]);
  const [onixInput, setOnixInput] = useState("");
  const [onixLoading, setOnixLoading] = useState(false);
  const [onixStatusText, setOnixStatusText] = useState("");
  const [aiModel, setAiModel] = useState("llava"); // "llava" = MedGemma
  const [sidePanelWidth, setSidePanelWidth] = useState(440);
  const [markAndAskActive, setMarkAndAskActive] = useState(false);
  const [showReport, setShowReport] = useState(false);
  // QC + PDF preview flow (after Submit Report)
  const [qcStage, setQcStage] = useState("idle"); // idle | running | passed | failed
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
  const [qcResult, setQcResult] = useState(null); // full QC payload from backend
  const [showSidebar, setShowSidebar] = useState(true);

  // MedSAM Segmentation
  const { isReady: medsamReady, segmentBox } = useMedSAMSegmentation();
  const [medsamActive, setMedsamActive] = useState(false);
  const [medsamDrawing, setMedsamDrawing] = useState(false);
  const [medsamLoading, setMedsamLoading] = useState(false);
  const [medsamMask, setMedsamMask] = useState(null);
  const [medsamError, setMedsamError] = useState(null);
  const [medsamPopup, setMedsamPopup] = useState(false);
  const [medsamBox, setMedsamBox] = useState(null);
  const [medsamCanvasBounds, setMedsamCanvasBounds] = useState(null);
  const [medsamSavedMasks, setMedsamSavedMasks] = useState({});
  const [savedSegmentations, setSavedSegmentations] = useState([]);
  const medsamStartRef = useRef(null);
  const medsamLiveRef = useRef(null);
  const medsamCanvasRef = useRef(null);
  const reportEditorRef = useRef(null);
  const promptBackupRef = useRef(null);
  const reportUnsavedRef = useRef(false);
  const reportSaveFnRef = useRef(null);
  const [showViewerCloseConfirm, setShowViewerCloseConfirm] = useState(false);
  const [viewerCloseSaving, setViewerCloseSaving] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playMs, setPlayMs] = useState(120);
  const [saveNotice, setSaveNotice] = useState("");
  const annPopupQueuedRef = useRef(new Set());
  const transientMeasureUidRef = useRef(new Set());
  // Synchronous mirror of dbAnnotations UIDs. Scanners that may run before
  // setCornerstoneAnnMeta's state update commits (network/load race) read this.
  const savedDbAnnotationUidsRef = useRef(new Set());
  // Until the first /annotations GET resolves, scanners must not pop the save
  // dialog — they'd open it for a cached Cornerstone annotation we just haven't
  // learned is already saved yet.
  const dbAnnotationsLoadedRef = useRef(false);
  const toolSyncPrevRef = useRef({ annTool: "select", dicomTool: "none", niftiTool: "none" });

  const [dicomGrid, setDicomGrid] = useState({ rows: 1, cols: 1, mode: "grid" });
  const [dicomGridSelected, setDicomGridSelected] = useState(false);
  const [dicomSlotPlanes, setDicomSlotPlanes] = useState(["axial", "sagittal", "coronal"]);
  const [activeDicomSlot, setActiveDicomSlot] = useState(0);
  const [dicomZoomMode, setDicomZoomMode] = useState(false);
  const [dicomTool, setDicomTool] = useState("none");
  const [dicomSliceBySlot, setDicomSliceBySlot] = useState({
    0: { current: 1, total: 1 },
    1: { current: 1, total: 1 },
    2: { current: 1, total: 1 },
  });
  const [dicomMouseBySlot, setDicomMouseBySlot] = useState({
    0: { x: null, y: null },
    1: { x: null, y: null },
    2: { x: null, y: null },
  });
  const [dicomCrosshairBySlot, setDicomCrosshairBySlot] = useState({
    0: { x: null, y: null },
    1: { x: null, y: null },
    2: { x: null, y: null },
  });
  const [dicomCrosshairColor] = useState("#00ff4c");
  const [dicomTotalSlices, setDicomTotalSlices] = useState(1);

  const [dicomFlipH, setDicomFlipH] = useState(false);
  const [dicomFlipV, setDicomFlipV] = useState(false);
  const [dicomInvert, setDicomInvert] = useState(false);
  const [niftiFlipH, setNiftiFlipH] = useState(false);
  const [niftiFlipV, setNiftiFlipV] = useState(false);
  const [niftiInvert, setNiftiInvert] = useState(false);
  /* ─── Series picker (Phase 1) ───────────────────────────────
     `seriesFiles` arrives as a single flat list of DICOM URLs.
     useSeriesGrouping parses headers and groups them by
     SeriesInstanceUID. `currentSeriesUid` selects which group is
     active. When it changes, the memoised `effectiveSeriesFiles`
     below becomes a new array reference, which triggers a full
     teardown + rebuild inside useViewerDataLoader. */
  const [currentSeriesUid, setCurrentSeriesUid] = useState(null);
  const [layoutMode, setLayoutMode] = useState("mpr3"); // Phase 2 will use 'compare2x2'
  const seriesGrouping = useSeriesGrouping({
    caseId,
    seriesFiles,                              // ← raw flat list, plain reference
    enabled: !isNifti && Array.isArray(seriesFiles) && seriesFiles.length > 1,
  });
  const seriesThumbs = useSeriesThumbnails(seriesGrouping.series, {
    enabled: !!seriesGrouping.series && !loading,
    batch: 3,
  });

  // Auto-pick the first non-scout series on first parse, then never override.
  useEffect(() => {
    if (currentSeriesUid) return;
    const list = seriesGrouping.series;
    if (!Array.isArray(list) || list.length === 0) return;
    const firstNonScout = list.find((s) => !s.isScout) || list[0];
    setCurrentSeriesUid(firstNonScout.seriesUid);
  }, [seriesGrouping.series, currentSeriesUid]);

  // Effective files passed to useViewerDataLoader. When the user picks a
  // different series tile, this array becomes a new reference and the loader
  // tears down + remounts on the new series. If grouping isn't ready yet,
  // we fall back to the raw flat list so first-paint isn't blocked on parsing.
  const effectiveSeriesFiles = React.useMemo(() => {
    if (!seriesGrouping.series || !currentSeriesUid) return seriesFiles;
    const found = seriesGrouping.series.find((s) => s.seriesUid === currentSeriesUid);
    return found && Array.isArray(found.urls) && found.urls.length > 0 ? found.urls : seriesFiles;
  }, [seriesGrouping.series, currentSeriesUid, seriesFiles]);

  /* ─── Compare-mode (2x2) state (Phase 2) ────────────────────
     Each of 4 viewports holds a different series. focusedCompareSlot
     is the slot that gets the next tile click. */
  const [compareViewportSeries, setCompareViewportSeries] = useState({
    0: null, 1: null, 2: null, 3: null,
  });
  const [focusedCompareSlot, setFocusedCompareSlot] = useState(0);
  // Per-slot loading state — drives the spinner overlay on each viewport
  // while its stack is being mounted.
  const [compareSlotLoading, setCompareSlotLoading] = useState({
    0: false, 1: false, 2: false, 3: false,
  });

  // Auto-populate the 4 viewports with the first 4 non-scout series when
  // the user first enters compare mode (or when new groupings arrive).
  // Existing assignments are preserved.
  useEffect(() => {
    if (layoutMode !== "compare2x2") return;
    if (!seriesGrouping.series || seriesGrouping.series.length === 0) return;

    const nonScouts = seriesGrouping.series.filter((s) => !s.isScout);
    const pool = nonScouts.length > 0 ? nonScouts : seriesGrouping.series;

    setCompareViewportSeries((prev) => {
      const next = { ...prev };
      let changed = false;
      for (let i = 0; i < 4; i++) {
        if (!next[i]) {
          const pick = pool[i] || pool[pool.length - 1] || null;
          if (pick) {
            next[i] = pick.seriesUid;
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
  }, [layoutMode, seriesGrouping.series]);

  /* ─── 3-up MPR per-viewport series state (Phase 2.5) ──────────
     Mirrors compareViewportSeries but with 3 slots. When the user clicks
     a strip tile, only mprViewportSeries[activeDicomSlot] is updated —
     a follow-up effect calls setStack on that ONE viewport without tearing
     down the engine, so the other 2 viewports stay as-is. */
  const [mprViewportSeries, setMprViewportSeries] = useState({
    0: null, 1: null, 2: null,
  });
  // Tracks which UID is currently mounted in each MPR viewport. Used to
  // diff and avoid redundant setStack calls.
  const mprMountedUidRef = useRef({ 0: null, 1: null, 2: null });

  // Reset mprViewportSeries when the case changes (caseId via fileUrl)
  useEffect(() => {
    setMprViewportSeries({ 0: null, 1: null, 2: null });
    mprMountedUidRef.current = { 0: null, 1: null, 2: null };
  }, [fileUrl, filename]);

  // Initialize MPR slots to the default series whenever we enter MPR mode
  // with a known currentSeriesUid. Slots with explicit overrides are kept.
  useEffect(() => {
    if (layoutMode !== "mpr3") return;
    if (!currentSeriesUid) return;
    setMprViewportSeries((prev) => {
      const next = { ...prev };
      let changed = false;
      for (let i = 0; i < 3; i++) {
        if (!next[i]) {
          next[i] = currentSeriesUid;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [layoutMode, currentSeriesUid]);

  // keep viewport ids for reset/fit
  const renderingEngineRef = useRef(null);
  const renderingEngineIdRef = useRef("");
  const toolGroupIdRef = useRef("");
  const viewportIdsRef = useRef([]);
  const niftiVolumeIdRef = useRef(null);
  const dicomImageIdsRef = useRef([]);

  const getVisibleNiftiSlots = () => {
    const cells = niftiGrid.mode === "main2" ? 3 : Math.max(1, niftiGrid.rows * niftiGrid.cols);
    return Array.from({ length: Math.min(3, cells) }, (_, i) => i);
  };

  const getVisibleDicomSlots = () => {
    // Phase 2: compare mode has 4 viewports
    if (layoutMode === "compare2x2") return [0, 1, 2, 3];
    const cells = dicomGrid.mode === "main2" ? 3 : Math.max(1, dicomGrid.rows * dicomGrid.cols);
    return Array.from({ length: Math.min(3, cells) }, (_, i) => i);
  };

  const getDicomViewportIdForSlot = (slot) => {
    // Phase 2: compare mode uses its own viewport IDs
    if (layoutMode === "compare2x2") return `COMPARE_SLOT_${slot}`;
    const multi = isSeries && dicomTotalSlices > 1;
    if (!multi) return "DICOM_SINGLE";
    return `DICOM_SLOT_${slot}`;
  };

  const getActiveDicomViewport = () => {
    const visibleSlots = getVisibleDicomSlots();
    const safeSlot = visibleSlots.includes(activeDicomSlot) ? activeDicomSlot : visibleSlots[0];
    const vpId = getDicomViewportIdForSlot(safeSlot);
    const engine = renderingEngineRef.current;
    return engine?.getViewport?.(vpId) || null;
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
  

  const applyDicomWindowPreset = (preset) => {
    const lower = preset.center - preset.width / 2;
    const upper = preset.center + preset.width / 2;
    getVisibleDicomSlots().forEach((slot) => {
      const vp = renderingEngineRef.current?.getViewport?.(getDicomViewportIdForSlot(slot));
      if (vp) { vp.setProperties({ voiRange: { lower, upper } }); vp.render(); }
    });
  };

  const flipDicomH = () => {
    setDicomFlipH((prev) => {
      const next = !prev;
      getVisibleDicomSlots().forEach((slot) => {
        const vp = renderingEngineRef.current?.getViewport?.(getDicomViewportIdForSlot(slot));
        if (vp) { const cam = vp.getCamera(); vp.setCamera({ ...cam, flipHorizontal: next }); vp.render(); }
      });
      return next;
    });
  };

  const flipDicomV = () => {
    setDicomFlipV((prev) => {
      const next = !prev;
      getVisibleDicomSlots().forEach((slot) => {
        const vp = renderingEngineRef.current?.getViewport?.(getDicomViewportIdForSlot(slot));
        if (vp) { const cam = vp.getCamera(); vp.setCamera({ ...cam, flipVertical: next }); vp.render(); }
      });
      return next;
    });
  };

  const invertDicom = () => {
    setDicomInvert((prev) => {
      const next = !prev;
      getVisibleDicomSlots().forEach((slot) => {
        const vp = renderingEngineRef.current?.getViewport?.(getDicomViewportIdForSlot(slot));
        if (vp) { vp.setProperties({ invert: next }); vp.render(); }
      });
      return next;
    });
  };

  const applyNiftiWindowPreset = (preset) => {
    const lower = preset.center - preset.width / 2;
    const upper = preset.center + preset.width / 2;
    getVisibleNiftiSlots().forEach((slot) => {
      const vp = renderingEngineRef.current?.getViewport?.(`NIFTI_SLOT_${slot}`);
      if (vp) { vp.setProperties({ voiRange: { lower, upper } }); vp.render(); }
    });
  };

  const flipNiftiH = () => {
    setNiftiFlipH((prev) => {
      const next = !prev;
      getVisibleNiftiSlots().forEach((slot) => {
        const vp = renderingEngineRef.current?.getViewport?.(`NIFTI_SLOT_${slot}`);
        if (vp) { const cam = vp.getCamera(); vp.setCamera({ ...cam, flipHorizontal: next }); vp.render(); }
      });
      return next;
    });
  };

  const flipNiftiV = () => {
    setNiftiFlipV((prev) => {
      const next = !prev;
      getVisibleNiftiSlots().forEach((slot) => {
        const vp = renderingEngineRef.current?.getViewport?.(`NIFTI_SLOT_${slot}`);
        if (vp) { const cam = vp.getCamera(); vp.setCamera({ ...cam, flipVertical: next }); vp.render(); }
      });
      return next;
    });
  };

  const invertNifti = () => {
    setNiftiInvert((prev) => {
      const next = !prev;
      getVisibleNiftiSlots().forEach((slot) => {
        const vp = renderingEngineRef.current?.getViewport?.(`NIFTI_SLOT_${slot}`);
        if (vp) { vp.setProperties({ invert: next }); vp.render(); }
      });
      return next;
    });
  };

  const getNiftiVolumeDims = () => {
    const vid = niftiVolumeIdRef.current;
    const vol = vid ? csCore.cache.getVolume?.(vid) : null;
    const dims = vol?.dimensions;
    return Array.isArray(dims) && dims.length >= 3 ? dims : [1, 1, 1];
    
  };

  const getUserId = () => {
    try {
      const auth = JSON.parse(localStorage.getItem("auth") || "{}");
      return auth.userId || "local-user";
    } catch {
      return "local-user";
    }
  };
  const currentUserId = getUserId();

  const loadLiveChat = async () => {
    if (!caseId) return;
    try {
      const res = await fetch(
        `${BACKEND_URL}/radiology/chat/${encodeURIComponent(caseId)}`
      );
      const json = await res.json();
      if (json?.success && Array.isArray(json.data)) {
        setChatMessages(json.data);
      }
    } catch (e) {
      console.error("Load live chat failed", e);
    }
  };

  useEffect(() => {
    if (!caseId) return;
    loadLiveChat();
    const t = setInterval(loadLiveChat, 5000);
    return () => clearInterval(t);
  }, [caseId]);

  const sendLiveChat = async () => {
    const msg = (chatInput || "").trim();
    if (!msg) return;

    const uid = getUserId();
    const tmpId = `tmp_${Date.now()}`;

    // Optimistic append
    setChatMessages((prev) => [
      ...(prev || []),
      {
        chat_id: tmpId,
        case_id: caseId,
        user_id: uid,
        message: msg,
        sent_at: new Date().toISOString(),
      },
    ]);
    setChatInput("");

    if (!uid || !UUID_RE.test(uid)) {
      console.warn("[Chat] No valid UUID user — message kept local only.");
      return;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/radiology/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ case_id: caseId, user_id: uid, message: msg }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success || !json?.data) {
        throw new Error(json?.detail || `HTTP ${res.status}`);
      }
      // Replace temp with server row
      setChatMessages((prev) =>
        (prev || []).map((m) => (m.chat_id === tmpId ? json.data : m))
      );
    } catch (e) {
      console.error("[Chat] Send failed; reverting:", e);
      setChatMessages((prev) => (prev || []).filter((m) => m.chat_id !== tmpId));
    }
  };


  const loadDbAnnotations = async () => {
    if (!caseId) return;
    const uid = getUserId();
    if (!uid || !UUID_RE.test(uid)) {
      dbAnnotationsLoadedRef.current = true;
      return;
    }
    try {
      const res = await fetch(
        `${BACKEND_URL}/radiology/annotations/${encodeURIComponent(caseId)}?user_id=${encodeURIComponent(uid)}`
      );
      const json = await res.json();
      if (json?.success && Array.isArray(json.data)) {
        setDbAnnotations(json.data);

        // Seed save-dialog guards: Cornerstone's annotation state is module-level
        // and outlives the React mount, so ANNOTATION_ADDED can re-fire on remount.
        const metaPatch = {};
        const seededUids = [];
        for (const a of json.data) {
          const annUid = a?.tool_data?.annotationUID;
          if (!annUid) continue;
          seededUids.push(annUid);
          metaPatch[annUid] = {
            title: (a.title || a.annotation_type || "annotation").trim(),
            comment: (a.comments || "").trim(),
            scope: a.visibility === "everybody" ? "all" : "me",
          };
          savedDbAnnotationUidsRef.current.add(annUid);
        }
        if (seededUids.length) {
          setCornerstoneAnnMeta((prev) => ({ ...(prev || {}), ...metaPatch }));
          setSavedCornerstoneUids((prev) => {
            const next = new Set(prev);
            seededUids.forEach((u) => next.add(u));
            return next;
          });
        }
      }
    } catch (e) {
      console.error("Load annotations failed", e);
    } finally {
      dbAnnotationsLoadedRef.current = true;
    }
  };

  useEffect(() => {
    savedDbAnnotationUidsRef.current = new Set();
    dbAnnotationsLoadedRef.current = false;
    // Cornerstone's annotation state is module-level and persists across
    // viewer remounts AND case switches. Without this, a leftover annotation
    // from the previous case re-fires ANNOTATION_ADDED when the new case's
    // viewport mounts, popping the save dialog for the wrong case.
    try { csAnnotation?.state?.removeAllAnnotations?.(); } catch {}
    annPopupQueuedRef.current = new Set();
    transientMeasureUidRef.current = new Set();
    loadDbAnnotations();
  }, [caseId]);
  
  
  

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

  const refreshDicomSliceIndicators = (slots = getVisibleDicomSlots()) => {
    if (!isCornerstoneDicom) return;
    setDicomSliceBySlot((prev) => {
      const next = { ...prev };
      slots.forEach((slot) => {
        const vp = renderingEngineRef.current?.getViewport?.(getDicomViewportIdForSlot(slot));
        const idxRaw = vp?.getCurrentImageIdIndex?.() ?? vp?.getSliceIndex?.() ?? 0;
        const idx = Math.max(0, Number(idxRaw)) + 1;
        const total = Math.max(1, dicomTotalSlices || 1);
        next[slot] = { current: idx, total };
      });
      return next;
    });
  };

  const updateNiftiMouseCoords = (slot, e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.floor(e.clientX - rect.left));
    const y = Math.max(0, Math.floor(e.clientY - rect.top));
    setNiftiMouseBySlot((prev) => ({ ...prev, [slot]: { x, y } }));
    if (niftiTool === "crosshair") {
      const plane = niftiSlotPlanes[slot] || "axial";
      const [dx, dy, dz] = getNiftiVolumeDims();
      const toNorm = (v, size) => (size > 1 ? v / (size - 1) : 0);
      const fromNorm = (n, size) => Math.max(0, Math.min(size - 1, Math.round(n * (size - 1))));
      const nX = toNorm(x, Math.max(1, rect.width));
      const nY = toNorm(y, Math.max(1, rect.height));

      let ix = 0;
      let iy = 0;
      let iz = 0;

      const srcVp = renderingEngineRef.current?.getViewport?.(`NIFTI_SLOT_${slot}`);
      const srcSlice = Math.max(0, Number(srcVp?.getSliceIndex?.() ?? 0));

      if (plane === "axial") {
        ix = fromNorm(nX, Math.max(1, dx));
        iy = fromNorm(nY, Math.max(1, dy));
        iz = Math.max(0, Math.min(Math.max(1, dz) - 1, srcSlice));
      } else if (plane === "sagittal") {
        iz = fromNorm(nX, Math.max(1, dz));
        iy = fromNorm(nY, Math.max(1, dy));
        ix = Math.max(0, Math.min(Math.max(1, dx) - 1, srcSlice));
      } else {
        ix = fromNorm(nX, Math.max(1, dx));
        iz = fromNorm(nY, Math.max(1, dz));
        iy = Math.max(0, Math.min(Math.max(1, dy) - 1, srcSlice));
      }

      // Sync slice index across all 3 viewports to the same anatomical point
      getVisibleNiftiSlots().forEach((s) => {
        const p = niftiSlotPlanes[s] || "axial";
        const vp = renderingEngineRef.current?.getViewport?.(`NIFTI_SLOT_${s}`);
        if (!vp?.scroll) return;
        const current = Math.max(0, Number(vp.getSliceIndex?.() ?? 0));
        const target = p === "axial" ? iz : p === "sagittal" ? ix : iy;
        const delta = target - current;
        if (delta !== 0) {
          vp.scroll(delta);
          vp.render?.();
        }
      });
      refreshNiftiSliceIndicators();

      const makeCrosshairForSlot = (s) => {
        const el =
          s === 0 ? axRef.current :
          s === 1 ? sagRef.current :
          corRef.current;
        const w = Math.max(1, el?.clientWidth || 1);
        const h = Math.max(1, el?.clientHeight || 1);
        const p = niftiSlotPlanes[s] || "axial";
        let cx = 0;
        let cy = 0;
        if (p === "axial") {
          cx = Math.round((ix / Math.max(1, dx - 1)) * (w - 1));
          cy = Math.round((iy / Math.max(1, dy - 1)) * (h - 1));
        } else if (p === "sagittal") {
          cx = Math.round((iz / Math.max(1, dz - 1)) * (w - 1));
          cy = Math.round((iy / Math.max(1, dy - 1)) * (h - 1));
        } else {
          cx = Math.round((ix / Math.max(1, dx - 1)) * (w - 1));
          cy = Math.round((iz / Math.max(1, dz - 1)) * (h - 1));
        }
        return { x: cx, y: cy };
      };

      setNiftiCrosshairBySlot((prev) => ({
        ...prev,
        0: makeCrosshairForSlot(0),
        1: makeCrosshairForSlot(1),
        2: makeCrosshairForSlot(2),
      }));
    }
  };

  const clearNiftiMouseCoords = (slot) => {
    setNiftiMouseBySlot((prev) => ({ ...prev, [slot]: { x: null, y: null } }));
    setNiftiCrosshairBySlot((prev) => ({ ...prev, [slot]: { x: null, y: null } }));
  };

  const updateDicomMouseCoords = (slot, e) => {
    // Avoid high-frequency React re-renders while drawing ROI/measure tools,
    // which can make in-progress annotation feedback look delayed.
    if (annTool !== "select" && dicomTool !== "crosshair") {
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.floor(e.clientX - rect.left));
    const y = Math.max(0, Math.floor(e.clientY - rect.top));
    setDicomMouseBySlot((prev) => ({ ...prev, [slot]: { x, y } }));
    if (dicomTool === "crosshair") {
      setDicomCrosshairBySlot((prev) => ({ ...prev, [slot]: { x, y } }));
    }
  };

  const clearDicomMouseCoords = (slot) => {
    setDicomMouseBySlot((prev) => ({ ...prev, [slot]: { x: null, y: null } }));
  };

  useEffect(() => {
    if (dicomTool === "crosshair") return;
    setDicomCrosshairBySlot({
      0: { x: null, y: null },
      1: { x: null, y: null },
      2: { x: null, y: null },
    });
  }, [dicomTool]);

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
    } else if (isCornerstoneDicom) {
      const vp = getActiveDicomViewport();
      canvas = vp?.getCanvas?.() || null;
      plane = dicomSlotPlanes[activeDicomSlot] || "axial";
      const idx = vp?.getCurrentImageIdIndex?.() ?? vp?.getSliceIndex?.() ?? 0;
      slice = Number(idx) + 1;
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
  const [reportData, setReportData] = useState(null);
  const [reportExists, setReportExists] = useState(false);
  const [latestReportVersionHtml, setLatestReportVersionHtml] = useState(null);
  const [dbAnnotations, setDbAnnotations] = useState([]);

  // Step 2: Fetch saved report on case load
  useEffect(() => {
    if (!caseId) return;
    const uid = localStorage.getItem("user_id") || (() => {
      try { return JSON.parse(localStorage.getItem("auth") || "{}").userId || null; } catch { return null; }
    })();
    if (!uid) return;

    fetch(`${BACKEND_URL}/radiology/reports/${encodeURIComponent(caseId)}?user_id=${encodeURIComponent(uid)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((json) => {
        if (json?.success && json.data) {
          const d = json.data;
          // Fake-mode for "Generate AI Report" should trigger ONLY when an
          // AI-generated report was previously saved (ai_* columns set).
          // Manual saves populate the main columns but should NOT flip the
          // AI panel into "Showing previously saved AI report".
          const hasAiSaved =
            d.ai_technique || d.ai_findings || d.ai_impression || d.ai_opinions;
          setReportData((prev) => ({ ...(prev || {}), ...d }));
          setReportExists(!!hasAiSaved);
        }
      })
      .catch(() => {});
  }, [caseId]);

  // Fetch latest report version snapshot (preserves full HTML/formatting across reloads).
  // NOTE: do NOT touch reportExists here — that flag governs the "Showing previously
  // saved AI report" fake-mode and must only flip on when an actual AI report has
  // been saved (ai_* fields), not when an HTML version snapshot exists.
  useEffect(() => {
    setLatestReportVersionHtml(null);
    if (!caseId) return;
    const uid = localStorage.getItem("user_id") || (() => {
      try { return JSON.parse(localStorage.getItem("auth") || "{}").userId || null; } catch { return null; }
    })();
    if (!uid) return;
    fetch(`${BACKEND_URL}/radiology/reports/${encodeURIComponent(caseId)}/versions?user_id=${encodeURIComponent(uid)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((json) => {
        if (json?.success && Array.isArray(json.data) && json.data.length > 0) {
          const latest = json.data[0];
          if (latest?.html) {
            // Older snapshots may have a doubled "Dr. Dr." prefix in the
            // signature card from a prior write path. Collapse it down to a
            // single "Dr." inside the HTML before it ever lands in state.
            const fixed = String(latest.html).replace(
              /(<div[^>]*class="[^"]*report-sign-name[^"]*"[^>]*>)([\s\S]*?)(<\/div>)/i,
              (_, open, inner, close) => {
                const stripped = String(inner)
                  .trim()
                  .replace(/^(?:dr\.\s*|dr\s+)+/i, "")
                  .trim();
                return open + (stripped ? `Dr. ${stripped}` : "") + close;
              }
            );
            setLatestReportVersionHtml(fixed);
          }
        }
      })
      .catch(() => {});
  }, [caseId]);

  // Safety net: once AI has produced fresh content, drop the cached snapshot
  // so the version overlay cannot accidentally re-apply older history HTML.
  useEffect(() => {
    if (reportData?.report_mode === "ai") {
      setLatestReportVersionHtml(null);
    }
  }, [reportData?.report_mode]);

  // Fetch saved segmentations on case load
  useEffect(() => {
    if (!caseId) return;
    let authToken = null;
    try {
      const auth = JSON.parse(localStorage.getItem("auth") || "{}");
      authToken = auth.token || null;
    } catch { authToken = null; }
    if (!authToken) return;

    fetch(`${BACKEND_URL}/radiology/segmentations/${encodeURIComponent(caseId)}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then((r) => r.ok ? r.json() : null)
      .then((json) => {
        if (json?.success && Array.isArray(json.data)) {
          setSavedSegmentations(json.data);
        }
      })
      .catch(() => {});
  }, [caseId]);

  const [savedCornerstoneUids, setSavedCornerstoneUids] = useState(() => new Set());

  // Capture current viewport as base64 PNG (for AI analysis)
  const captureViewportBase64 = () => {
    let canvas = null;
    if (isCornerstoneNifti) {
      const slot = activeNiftiSlot;
      const vp = renderingEngineRef.current?.getViewport?.(`NIFTI_SLOT_${slot}`);
      canvas = vp?.getCanvas?.() || null;
    } else if (isNifti) {
      const el = document.querySelector(`canvas[data-nifti-plane="${niftiPlane}"]`);
      canvas = el instanceof HTMLCanvasElement ? el : null;
    } else if (isCornerstoneDicom) {
      const vp = getActiveDicomViewport();
      canvas = vp?.getCanvas?.() || null;
    }
    if (!canvas) return null;
    const dataUrl = canvas.toDataURL("image/png");
    return dataUrl.split(",")[1];
  };

  const waitFrames = async (count = 2) => {
    for (let i = 0; i < count; i += 1) {
      // Wait for paint cycles after slice changes.
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    }
  };

  const downscaleCanvasToBase64 = (canvas, targetWidth = 256) => {
    if (!(canvas instanceof HTMLCanvasElement)) return null;
    const srcW = canvas.width || 0;
    const srcH = canvas.height || 0;
    if (!srcW || !srcH) return null;

    const scale = srcW > targetWidth ? targetWidth / srcW : 1;
    const outW = Math.max(1, Math.round(srcW * scale));
    const outH = Math.max(1, Math.round(srcH * scale));

    const out = document.createElement("canvas");
    out.width = outW;
    out.height = outH;
    const ctx = out.getContext("2d", { alpha: false });
    if (!ctx) return null;
    ctx.drawImage(canvas, 0, 0, outW, outH);
    return out.toDataURL("image/png").split(",")[1];
  };

  const getViewportSliceIndex = (vp) => {
    const idxA = vp?.getCurrentImageIdIndex?.();
    if (Number.isFinite(idxA)) return Number(idxA);
    const idxB = vp?.getSliceIndex?.();
    if (Number.isFinite(idxB)) return Number(idxB);
    return 0;
  };

  const setViewportSliceIndex = (vp, targetIdx) => {
    if (!vp) return;
    const safeTarget = Math.max(0, Math.floor(targetIdx));
    const current = getViewportSliceIndex(vp);
    if (typeof vp.setImageIdIndex === "function") {
      vp.setImageIdIndex(safeTarget);
    } else if (typeof vp.scroll === "function") {
      vp.scroll(safeTarget - current);
    }
    vp.render?.();
  };

  const makeAbortError = (message = "AI report generation was stopped.") => {
    const error = new Error(message);
    error.name = "AbortError";
    return error;
  };

  const captureAllSlicesForAiReport = async ({
    targetWidth = 256,
    onProgress,
    shouldCancel,
  } = {}) => {
    const isCancelled = () => (typeof shouldCancel === "function" ? shouldCancel() : false);
    if (isCancelled()) throw makeAbortError();

    const engine = renderingEngineRef.current;
    if (!engine) throw new Error("Viewer engine is not ready.");
    if (!isCornerstoneDicom && !isCornerstoneNifti) {
      throw new Error("Full-slice AI report is available only in Cornerstone mode.");
    }

    // Capture from ONLY the active viewport — works regardless of grid mode
    // (1x1, 2x2, main2). Avoids OOM and "no slices captured" bugs when grid
    // switches don't fully re-wire visible slots.
    const descriptors = [];
    if (isCornerstoneDicom) {
      const slot = activeDicomSlot;
      let viewportId = getDicomViewportIdForSlot(slot);
      let vp = engine.getViewport?.(viewportId);
      // Fallback if the expected viewport doesn't exist (happens after grid switches)
      if (!vp) {
        try {
          const allVps = engine.getViewports?.() || [];
          const fallback = allVps.find((v) => (v.id || "").startsWith("DICOM") && (v.getImageIds?.()?.length || 0) > 0);
          if (fallback) {
            vp = fallback;
            viewportId = fallback.id;
            console.log("[AI Capture] Fallback viewport:", viewportId);
          }
        } catch (e) {
          console.warn("[AI Capture] enumerate failed:", e);
        }
      }
      if (vp) {
        const fromState = Number(dicomSliceBySlot?.[slot]?.total || 0);
        const fromViewport = Array.isArray(vp.getImageIds?.()) ? vp.getImageIds().length : 0;
        const total = Math.max(1, fromState || fromViewport || dicomImageIdsRef.current?.length || 1);
        const rawView = (dicomSlotPlanes?.[slot] || `slot${slot + 1}`).toLowerCase();
        const view = ["axial", "coronal", "sagittal"].includes(rawView) ? rawView : "axial";
        console.log("[AI Capture] using viewportId:", viewportId, "total:", total, "view:", view);
        descriptors.push({ viewportId, total, view });
      } else {
        console.warn("[AI Capture] No viewport found");
      }
    } else {
      const dims = getNiftiVolumeDims();
      const slot = activeNiftiSlot;
      const viewportId = `NIFTI_SLOT_${slot}`;
      const vp = engine.getViewport?.(viewportId);
      if (vp) {
        const rawView = (niftiSlotPlanes?.[slot] || "axial").toLowerCase();
        const view = ["axial", "coronal", "sagittal"].includes(rawView) ? rawView : "axial";
        const dimTotal = view === "axial" ? dims[2] : view === "coronal" ? dims[1] : dims[0];
        const fromState = Number(niftiSliceBySlot?.[slot]?.total || 0);
        const fromViewport = Array.isArray(vp.getImageIds?.()) ? vp.getImageIds().length : 0;
        const total = Math.max(1, fromState || dimTotal || fromViewport || 1);
        descriptors.push({ viewportId, total, view });
      }
    }

    const plannedTotal = descriptors.reduce((sum, d) => sum + d.total, 0);
    const slices = [];
    const viewCounts = {};
    let captured = 0;

    for (const d of descriptors) {
      if (isCancelled()) throw makeAbortError();
      const vp = engine.getViewport?.(d.viewportId);
      if (!vp) continue;

      const originalIndex = getViewportSliceIndex(vp);
      try {
        for (let idx = 0; idx < d.total; idx += 1) {
          if (isCancelled()) throw makeAbortError();

          setViewportSliceIndex(vp, idx);
          // eslint-disable-next-line no-await-in-loop
          await waitFrames(2);
          if (isCancelled()) throw makeAbortError();

          const canvas = vp.getCanvas?.();
          const image_base64 = downscaleCanvasToBase64(canvas, targetWidth);
          if (idx < 3 || idx % 100 === 0) {
            console.log(`[AI Capture] iter idx=${idx} actualIdx=${getViewportSliceIndex(vp)} canvas=${!!canvas} w=${canvas?.width} h=${canvas?.height} b64Len=${image_base64?.length || 0}`);
          }
          if (!image_base64) continue;

          slices.push({
            view: d.view,
            index: idx,
            image_base64,
          });
          viewCounts[d.view] = (viewCounts[d.view] || 0) + 1;
          captured += 1;
          if (typeof onProgress === "function") {
            onProgress({ captured, total: plannedTotal, view: d.view, index: idx });
          }
        }
      } finally {
        setViewportSliceIndex(vp, originalIndex);
        // eslint-disable-next-line no-await-in-loop
        await waitFrames(1);
      }
    }

    return { slices, viewCounts, totalPlanned: plannedTotal };
  };

  const {
    activateCornerstoneAnnotationTool,
    getCornerstoneAnnotationItems,
    openAnnotationSaveDialog,
    closeAnnotationSaveDialog,
    saveAnnotationDialog,
    deleteCornerstoneAnnotationByUid,
    jumpToCornerstoneAnnotationByUid,
  } = useCornerstoneAnnotations({
    isCornerstoneActive: isCornerstoneNifti || isCornerstoneDicom,
    toolGroupIdRef,
    renderingEngineRef,
    slotPlanes: isCornerstoneNifti ? niftiSlotPlanes : dicomSlotPlanes,
    setAnnTool,
    setAnnDraftTitle,
    setAnnDraftComment,
    setAnnSaveDialog,
    annSaveDialog,
    annDraftTitle,
    annDraftComment,
    cornerstoneAnnMeta,
    setCornerstoneAnnMeta,
    setCornerstoneAnnNotes,
    setCornerstoneAnnVersion,
    setActiveSlot: isCornerstoneNifti ? setActiveNiftiSlot : setActiveDicomSlot,
    getVisibleSlots: isCornerstoneNifti ? getVisibleNiftiSlots : getVisibleDicomSlots,
    getViewportIdForSlot: isCornerstoneNifti
      ? (slot) => `NIFTI_SLOT_${slot}`
      : (slot) => getDicomViewportIdForSlot(slot),
    backendUrl: BACKEND_URL,
    caseId,
    getUserId,
    setDbAnnotations,
    setSavedCornerstoneUids,
  });

  // Mark & Ask: independent box drawing overlay (no annotation system)
  const markOverlayRef = useRef(null);
  const markDrawingRef = useRef(null);

  const startMarkAndAsk = () => {
    setMarkAndAskActive(true);
    setRightTab("onix");
    setOnixMessages((m) => [
      ...m,
      { role: "ai", text: "Draw a box around the region you want to ask about. When done, type your question below and press Send." },
    ]);

    // Create overlay canvas on top of the viewport
    setTimeout(() => {
      const viewportEl = document.querySelector(".cornerstone3d-viewport") ||
        document.querySelector(`canvas[data-nifti-plane]`)?.parentElement;
      if (!viewportEl) return;

      // Remove any existing overlay
      const existing = viewportEl.querySelector(".mark-ask-overlay");
      if (existing) existing.remove();

      const overlay = document.createElement("canvas");
      overlay.className = "mark-ask-overlay";
      overlay.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;z-index:100;cursor:crosshair;";
      overlay.width = viewportEl.offsetWidth;
      overlay.height = viewportEl.offsetHeight;
      viewportEl.style.position = "relative";
      viewportEl.appendChild(overlay);
      markOverlayRef.current = overlay;

      const ctx = overlay.getContext("2d");
      let startX = 0, startY = 0, drawing = false;

      const onMouseDown = (e) => {
        e.stopPropagation();
        e.preventDefault();
        const rect = overlay.getBoundingClientRect();
        startX = e.clientX - rect.left;
        startY = e.clientY - rect.top;
        drawing = true;
      };

      const onMouseMove = (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (!drawing) return;
        const rect = overlay.getBoundingClientRect();
        const curX = e.clientX - rect.left;
        const curY = e.clientY - rect.top;
        ctx.clearRect(0, 0, overlay.width, overlay.height);
        ctx.strokeStyle = "#00ff00";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 3]);
        ctx.strokeRect(startX, startY, curX - startX, curY - startY);
        ctx.fillStyle = "rgba(0, 255, 0, 0.1)";
        ctx.fillRect(startX, startY, curX - startX, curY - startY);
      };

      const onMouseUp = (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (!drawing) return;
        drawing = false;
        const rect = overlay.getBoundingClientRect();
        const endX = e.clientX - rect.left;
        const endY = e.clientY - rect.top;

        // Get the box coordinates
        const x = Math.min(startX, endX);
        const y = Math.min(startY, endY);
        const w = Math.abs(endX - startX);
        const h = Math.abs(endY - startY);

        if (w < 10 || h < 10) return; // too small

        // Capture the cropped region from the actual viewport canvas
        let sourceCanvas = null;
        if (isCornerstoneNifti) {
          const slot = activeNiftiSlot;
          const vp = renderingEngineRef.current?.getViewport?.(`NIFTI_SLOT_${slot}`);
          sourceCanvas = vp?.getCanvas?.() || null;
        } else if (isNifti) {
          sourceCanvas = document.querySelector(`canvas[data-nifti-plane="${niftiPlane}"]`);
        } else if (isCornerstoneDicom) {
          const vp = getActiveDicomViewport();
          sourceCanvas = vp?.getCanvas?.() || null;
        }

        if (!sourceCanvas) return;

        // Scale box coords to match source canvas resolution
        const scaleX = sourceCanvas.width / overlay.width;
        const scaleY = sourceCanvas.height / overlay.height;

        const cropCanvas = document.createElement("canvas");
        cropCanvas.width = w * scaleX;
        cropCanvas.height = h * scaleY;
        const cropCtx = cropCanvas.getContext("2d");
        cropCtx.drawImage(
          sourceCanvas,
          x * scaleX, y * scaleY, w * scaleX, h * scaleY,
          0, 0, cropCanvas.width, cropCanvas.height
        );

        const croppedBase64 = cropCanvas.toDataURL("image/png");

        // Send cropped image to chat
        setOnixMessages((m) => [
          ...m,
          { role: "user", text: "", image: croppedBase64 },
          { role: "ai", text: "Region captured. Type your question about this area and press Send." },
        ]);

        // Store the cropped image for sending with the next question
        markDrawingRef.current = croppedBase64.split(",")[1];

        // Clean up overlay
        overlay.remove();
        markOverlayRef.current = null;
      };

      overlay.addEventListener("mousedown", onMouseDown);
      overlay.addEventListener("mousemove", onMouseMove);
      overlay.addEventListener("mouseup", onMouseUp);
    }, 100);
  };

  const finishMarkAndAsk = () => {
    setMarkAndAskActive(false);
    if (markOverlayRef.current) {
      markOverlayRef.current.remove();
      markOverlayRef.current = null;
    }
  };

  const cancelMarkAndAsk = () => {
    setMarkAndAskActive(false);
    markDrawingRef.current = null;
    if (markOverlayRef.current) {
      markOverlayRef.current.remove();
      markOverlayRef.current = null;
    }
  };

  const {
    startNiftiDrag,
    updateNiftiDrag,
    endNiftiDrag,
    onNiftiContextMenu,
    openBoxInViewer,
    onWheelNiftiAxial,
    onWheelNiftiSagittal,
    onWheelNiftiCoronal,
  } = useNiftiCanvasInteractions({
    niftiVol,
    niftiTool,
    niftiPan,
    setNiftiPan,
    niftiPanDrag,
    setNiftiPanDrag,
    niftiMeasureStart,
    setNiftiMeasureStart,
    setNiftiMeasureHover,
    niftiMeasures,
    setNiftiMeasures,
    annTool,
    annColor,
    annOpacity,
    annotations,
    setAnnotations,
    setSelectedAnnId,
    annDrawing,
    setAnnDrawing,
    annDrag,
    setAnnDrag,
    niftiDrag,
    setNiftiDrag,
    setNiftiBoxes,
    nxIndex,
    nyIndex,
    nzIndex,
    setNxIndex,
    setNyIndex,
    setNzIndex,
    setNiftiWc,
    niftiZoomMode,
    setNiftiZoom,
    setNiftiPlane,
    setNiftiGridSelected,
    clamp,
    normalizeBox,
    pointInBox,
    distPointToSegment,
  });

  useNiftiCanvasRenderer({
    niftiVol,
    nxIndex,
    nyIndex,
    nzIndex,
    niftiBoxes,
    niftiDrag,
    niftiMeasures,
    niftiWc,
    niftiWw,
    niftiMeasureHover,
    niftiMeasureStart,
    annotations,
    annDrawing,
    niftiContainerRef,
  });

  useNiftiPlayback({
    isNifti,
    isPlaying,
    isCornerstoneNifti,
    playMs,
    getActiveNiftiViewport,
    refreshNiftiSliceIndicators,
    activeNiftiSlot,
    setIsPlaying,
    niftiVol,
    niftiPlane,
    setNzIndex,
    setNxIndex,
    setNyIndex,
  });

  useDicomPlayback({
    isDicom: !isNifti,
    isPlaying,
    playMs,
    getActiveDicomViewport,
    refreshDicomSliceIndicators,
    activeDicomSlot,
    setIsPlaying,
  });

  useCornerstonePromptBlock({
    isCornerstoneNifti,
    promptBackupRef,
  });

  const {
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
    submitReport,
    markComplete,
    cancelQcPreview,
    editReportWithCommand,
  } = useViewerReportChat({
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
    formatDateTime: (date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      const hh = String(date.getHours()).padStart(2, "0");
      const mm = String(date.getMinutes()).padStart(2, "0");
      return `${y}-${m}-${d} ${hh}:${mm}`;
    },
    reportData,
    backendUrl: BACKEND_URL,
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
    setQcStage,
    setPdfPreviewUrl,
    pdfPreviewUrl,
    setQcResult,
  });

  const {
    activateCornerstoneNiftiTool,
    scrollCornerstoneNifti,
    applyNiftiColormapToSlot,
    handleCornerstoneNiftiWheel,
    rotateCornerstoneNifti,
    deleteLastLengthOnNiftiSlot,
    rebuildCornerstoneNiftiViewports,
    isScopedToolActive,
  } = useCornerstoneNiftiControls({
    isCornerstoneNifti,
    setNiftiTool,
    toolGroupIdRef,
    getVisibleNiftiSlots,
    renderingEngineRef,
    activeNiftiSlot,
    refreshNiftiSliceIndicators,
    setActiveNiftiSlot,
    axRef,
    sagRef,
    corRef,
    niftiZoomMode,
    niftiTool,
    clamp,
    getActiveNiftiViewport,
    colormapPresets: NIFTI_COLORMAP_PRESETS,
    niftiVolumeIdRef,
    renderingEngineIdRef,
    viewportIdsRef,
    niftiSlotPlanes,
    niftiSlotColormap,
    annTool,
    isTransientMeasurementUid: (uid) => transientMeasureUidRef.current.has(uid),
  });

  const {
    activateCornerstoneDicomTool,
    scrollCornerstoneDicom,
    handleCornerstoneDicomWheel,
    rotateCornerstoneDicom,
    deleteLastLengthOnDicomSlot,
    rebuildCornerstoneDicomViewports,
    isScopedToolActive: isScopedDicomToolActive,
  } = useCornerstoneDicomControls({
    isCornerstoneDicom,
    setDicomTool,
    toolGroupIdRef,
    getVisibleDicomSlots,
    renderingEngineRef,
    renderingEngineIdRef,
    activeDicomSlot,
    refreshDicomSliceIndicators,
    setActiveDicomSlot,
    dicomZoomMode,
    dicomTool,
    clamp,
    getActiveDicomViewport,
    annTool,
    getViewportIdForSlot: getDicomViewportIdForSlot,
    dicomImageIdsRef,
    axRef,
    sagRef,
    corRef,
    singleRef,
    isTransientMeasurementUid: (uid) => transientMeasureUidRef.current.has(uid),
  });

  const handleMeasureActivate = () => {
    if (annTool === "select") return;
    if (isCornerstoneDicom || isCornerstoneNifti) {
      activateCornerstoneAnnotationTool("select");
    } else {
      setAnnTool("select");
    }
  };

  const handleAnnotationToolPick = (toolId, useCornerstone) => {
    const isMeasureMode = (tool) => typeof tool === "string" && tool.startsWith("measure");
    if (toolId !== "select") {
      if (isMeasureMode(dicomTool)) {
        if (isCornerstoneDicom) activateCornerstoneDicomTool("none");
        else setDicomTool("none");
      }
      if (isMeasureMode(niftiTool)) {
        if (isCornerstoneNifti) activateCornerstoneNiftiTool("none");
        else setNiftiTool("none");
      }
    }
    if (useCornerstone) {
      activateCornerstoneAnnotationTool(toolId);
    } else {
      setAnnTool(toolId);
    }
  };

  useEffect(() => {
    const prev = toolSyncPrevRef.current;
    const annChangedFromSelect = prev.annTool === "select" && annTool !== "select";
    const prevDicomMeasure = typeof prev.dicomTool === "string" && prev.dicomTool.startsWith("measure");
    const prevNiftiMeasure = typeof prev.niftiTool === "string" && prev.niftiTool.startsWith("measure");
    const dicomMeasureActive = typeof dicomTool === "string" && dicomTool.startsWith("measure");
    const niftiMeasureActive = typeof niftiTool === "string" && niftiTool.startsWith("measure");
    const dicomChangedToMeasure = !prevDicomMeasure && dicomMeasureActive;
    const niftiChangedToMeasure = !prevNiftiMeasure && niftiMeasureActive;
    const measureNowActive = dicomMeasureActive || niftiMeasureActive;

    // If user activates any Measure tool from viewer toolbar, force annotation tool -> Select.
    if ((dicomChangedToMeasure || niftiChangedToMeasure) && annTool !== "select") {
      if (isCornerstoneDicom || isCornerstoneNifti) {
        activateCornerstoneAnnotationTool("select");
      } else {
        setAnnTool("select");
      }
      toolSyncPrevRef.current = { annTool, dicomTool, niftiTool };
      return;
    }

    // If user activates any annotation drawing tool, disable active Measure tool in viewer.
    if (annChangedFromSelect && measureNowActive) {
      if (typeof dicomTool === "string" && dicomTool.startsWith("measure")) {
        if (isCornerstoneDicom) activateCornerstoneDicomTool("none");
        else setDicomTool("none");
      }
      if (typeof niftiTool === "string" && niftiTool.startsWith("measure")) {
        if (isCornerstoneNifti) activateCornerstoneNiftiTool("none");
        else setNiftiTool("none");
      }
    }

    toolSyncPrevRef.current = { annTool, dicomTool, niftiTool };
  }, [
    annTool,
    dicomTool,
    niftiTool,
    isCornerstoneDicom,
    isCornerstoneNifti,
    activateCornerstoneAnnotationTool,
    activateCornerstoneDicomTool,
    activateCornerstoneNiftiTool,
  ]);



    useViewerDataLoader({
      fileUrl,
      filename,
      seriesFiles: effectiveSeriesFiles,
      setError,
      setLoading,
      setIsNifti,
      setIsCornerstoneNifti,
      setIsCornerstoneDicom,
      renderingEngineIdRef,
      toolGroupIdRef,
      renderingEngineRef,
      setIsSeries,
      setDicomGrid,
      setDicomGridSelected,
      setDicomSlotPlanes,
      setActiveDicomSlot,
      setNiftiGrid,
      setNiftiGridSelected,
      setNiftiSlotPlanes,
      setActiveNiftiSlot,
      axRef,
      sagRef,
      corRef,
      waitForElementsReady,
      getAbsoluteUrl,
      niftiVolumeIdRef,
      rebuildCornerstoneNiftiViewports,
      setNiftiVol,
      setIsPlaying,
      setDicomTotalSlices,
      dicomImageIdsRef,
      sortDicomSliceUrls,
      buildImageId,
      singleRef,
      viewportIdsRef,
      layoutMode,
    });

    /* ─── Compare-mode (2x2) loader (Phase 2) ──────────────────
       Activates only when layoutMode === "compare2x2". Manages its own
       engine + tool group; useViewerDataLoader bails while this is active. */
    useCompareModeLoader({
      enabled: layoutMode === "compare2x2" && !isNifti,
      availableSeries: seriesGrouping.series,
      viewportSeriesMap: compareViewportSeries,
      refs: { 0: axRef, 1: sagRef, 2: corRef, 3: compareSlot3Ref },
      setError,
      setLoading,
      renderingEngineRef,
      renderingEngineIdRef,
      toolGroupIdRef,
      viewportIdsRef,
      onSliceCountChange: (slot, total) => {
        setDicomSliceBySlot((prev) => ({
          ...prev,
          [slot]: { current: Math.floor(total / 2) + 1, total },
        }));
      },
      onSlotLoading: (slot, isLoading) => {
        setCompareSlotLoading((prev) =>
          prev[slot] === isLoading ? prev : { ...prev, [slot]: isLoading }
        );
      },
    });

  /* ─── MPR per-viewport sync effect ──────────────────────────
     After useViewerDataLoader finishes (loading -> false), all 3 viewports
     show currentSeriesUid. Sync mprMountedUidRef so the override effect
     below knows the baseline. */
  useEffect(() => {
    if (layoutMode !== "mpr3") return;
    if (loading) return;
    if (!currentSeriesUid) return;
    mprMountedUidRef.current = {
      0: currentSeriesUid,
      1: currentSeriesUid,
      2: currentSeriesUid,
    };
  }, [layoutMode, loading, currentSeriesUid, fileUrl, filename]);

  /* ─── MPR per-viewport override effect ──────────────────────
     When mprViewportSeries[slot] differs from what's currently mounted in
     that viewport, call setStack on that ONE viewport. Does NOT tear down
     the engine, does NOT touch the other 2 viewports.

     This is the "only update the clicked viewport" behavior — strip clicks
     in 3-up MPR change mprViewportSeries[activeDicomSlot], which triggers
     this effect to swap just that one viewport's stack. */
  useEffect(() => {
    if (layoutMode !== "mpr3") return;
    if (loading) return;
    if (!seriesGrouping.series || seriesGrouping.series.length === 0) return;
    const engine = renderingEngineRef.current;
    if (!engine) return;

    let cancelled = false;
    const overrideSlot = async (slot) => {
      if (cancelled) return;
      const targetUid = mprViewportSeries[slot];
      const mountedUid = mprMountedUidRef.current[slot];
      if (!targetUid || targetUid === mountedUid) return;

      const series = seriesGrouping.series.find((s) => s.seriesUid === targetUid);
      if (!series || !Array.isArray(series.urls) || series.urls.length === 0) {
        console.warn("[mpr-override] series not found for uid:", targetUid);
        return;
      }

      const vpId = getDicomViewportIdForSlot(slot);
      const vp = engine.getViewport?.(vpId);
      if (!vp) {
        console.warn(`[mpr-override] viewport ${vpId} not in engine yet`);
        return;
      }

      const imageIds = series.urls.map(buildImageId);
      const midIdx = Math.floor(imageIds.length / 2);
      console.log(
        `[mpr-override] slot ${slot} → ${series.seriesDescription} (${imageIds.length} images)`
      );
      try {
        await vp.setStack(imageIds, midIdx);
        if (cancelled) return;
        try { engine.resize(true, false); } catch {}
        try { vp.resetCamera(); } catch {}
        vp.render();
        mprMountedUidRef.current[slot] = targetUid;
        // Update slice indicator for this slot
        setDicomSliceBySlot?.((prev) => ({
          ...prev,
          [slot]: { current: midIdx + 1, total: imageIds.length },
        }));
        console.log(`[mpr-override] slot ${slot} OK`);
      } catch (e) {
        console.error(`[mpr-override] slot ${slot} failed:`, e);
      }
    };

    // Fire all override checks in parallel; most will be no-ops
    Promise.all([0, 1, 2].map(overrideSlot));

    return () => { cancelled = true; };
  }, [layoutMode, loading, mprViewportSeries, seriesGrouping.series]);
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
    const ids = [];
    const schedule = (delay) => {
      const id = setTimeout(() => {
        if (cancelled) return;
        rebuildCornerstoneNiftiViewports().catch(() => {});
      }, delay);
      ids.push(id);
    };
    // Run a few staggered attempts to avoid first-open layout/ref race
    // where only axial viewport gets initialized.
    [0, 120, 320, 650].forEach(schedule);
    return () => {
      cancelled = true;
      ids.forEach((id) => clearTimeout(id));
    };
  }, [isCornerstoneNifti, niftiGrid, niftiPlane, niftiSlotPlanes, showReport, showSidebar, isFullscreen]);

  useEffect(() => {
    if (!isCornerstoneDicom) return;
    let cancelled = false;
    const id = setTimeout(() => {
      if (cancelled) return;
      rebuildCornerstoneDicomViewports().catch(() => {});
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [isCornerstoneDicom, dicomGrid, dicomSlotPlanes, dicomTotalSlices, showReport, showSidebar, isFullscreen]);


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
    if (!isCornerstoneDicom) return;
    const visible = getVisibleDicomSlots();
    if (!visible.includes(activeDicomSlot)) {
      setActiveDicomSlot(visible[0] ?? 0);
    }
  }, [isCornerstoneDicom, dicomGrid, activeDicomSlot]);

  useEffect(() => {
    if (!isCornerstoneNifti) return;
    const id = setTimeout(() => refreshNiftiSliceIndicators(), 0);
    return () => clearTimeout(id);
  }, [isCornerstoneNifti, niftiSlotPlanes, niftiGrid, activeNiftiSlot]);

  useEffect(() => {
    if (!isCornerstoneDicom) return;
    const id = setTimeout(() => refreshDicomSliceIndicators(), 0);
    return () => clearTimeout(id);
  }, [isCornerstoneDicom, dicomGrid, activeDicomSlot, dicomTotalSlices, dicomSlotPlanes]);

  useEffect(() => {
    if (!isCornerstoneDicom || loading) return;
    const engine = renderingEngineRef.current;
    if (!engine) return;

    const renderNow = () => {
      try {
        engine.resize(true, false);
        const ids = viewportIdsRef.current?.length
          ? viewportIdsRef.current
          : ["DICOM_SINGLE"];
        engine.renderViewports?.(ids);
      } catch {}
    };

    const t1 = setTimeout(renderNow, 60);
    const t2 = setTimeout(renderNow, 180);
    const t3 = setTimeout(renderNow, 360);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [isCornerstoneDicom, loading, isSeries, dicomTotalSlices, showReport, showSidebar, isFullscreen]);
  const [reportInitialized, setReportInitialized] = useState(false);
  const [reportDirty, setReportDirty] = useState(false);
  
  useEffect(() => {
    if (!showReport) {
      // reset when closing
      setReportInitialized(false);
      return;
    }

    if (!reportData) return;
    if (!reportEditorRef.current) return;

    // ALWAYS reinitialize when opening (also re-fill when AI report updates reportData)
    initReportTemplate();
    setReportInitialized(true);
    setReportDirty(false);

    // If a saved version snapshot exists, restore its full HTML (preserves
    // formatting, lists, etc.) AFTER the template has been laid down. This is
    // the source of truth when the user previously clicked the green Save or
    // Submit button — even if structured fields in the main reports row are
    // empty (e.g. saved before the structured-save fix landed).
    //
    // Skip the overlay when the AI flow has touched reportData (fresh AI
    // generation OR a previously-saved AI report). Otherwise the stale
    // snapshot would clobber the AI content the user expects to see.
    //
    // Also skip on re-runs caused by reportData changing — e.g. when the Onix
    // AI Editor applies an edit, it calls setReportData which re-fires this
    // effect; reapplying the snapshot would undo the edit the user just made.
    const aiInvolved =
      reportData?.report_mode === "ai" ||
      reportData?.ai_technique ||
      reportData?.ai_findings ||
      reportData?.ai_impression ||
      reportData?.ai_opinions;

    const isFirstOpen = !reportInitialized;

    if (!aiInvolved && latestReportVersionHtml && isFirstOpen) {
      const html = latestReportVersionHtml;
      const t = setTimeout(() => {
        const el = reportEditorRef.current;
        if (!el) return;
        el.innerHTML = html;
        // Older saved snapshots can have a double "Dr. Dr." prefix baked into
        // the signature card. The title already comes from the profile, so
        // collapse any repeated "Dr." prefix down to a single one after the
        // snapshot is restored.
        const signNameEl = el.querySelector(".report-sign-name");
        if (signNameEl) {
          const raw = (signNameEl.textContent || "").trim();
          const stripped = raw.replace(/^(?:dr\.\s*|dr\s+)+/i, "").trim();
          signNameEl.textContent = stripped ? `Dr. ${stripped}` : "";
        }
      }, 10);
      return () => clearTimeout(t);
    }
  }, [showReport, reportData, latestReportVersionHtml]);
  

  
  useEffect(() => {
    const el = reportEditorRef.current;
    if (!el) return;
  
    const onInput = () => setReportDirty(true);
    el.addEventListener("input", onInput);
  
    return () => el.removeEventListener("input", onInput);
  }, [showReport]);
  

  useEffect(() => {
    if (!isCornerstoneNifti && !isCornerstoneDicom) return;
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
      const toolName =
        evt?.detail?.annotation?.metadata?.toolName ||
        evt?.detail?.annotation?.toolName;
      if (!uid || (toolName && !supported.has(toolName))) return;
      const measurementToolNames = new Set([
        LengthTool.toolName,
        RectangleROITool.toolName,
        CircleROITool.toolName,
        PlanarFreehandROITool.toolName,
      ]);
      const dicomMeasureModeActive =
        isCornerstoneDicom && typeof dicomTool === "string" && dicomTool.startsWith("measure");
      const niftiMeasureModeActive =
        isCornerstoneNifti && typeof niftiTool === "string" && niftiTool.startsWith("measure");
      // If the annotation was created from a toolbar tool (not the annotation panel),
      // treat it as transient — don't open the save dialog / annotation tab.
      const isFromAnnotationPanel = ["line", "box", "circle", "free", "arrow"].includes(annTool);
      if (
        !isFromAnnotationPanel ||
        (toolName === LengthTool.toolName && annTool !== "line") ||
        (
          (dicomMeasureModeActive || niftiMeasureModeActive) &&
          annTool === "select" &&
          measurementToolNames.has(toolName)
        )
      ) {
        transientMeasureUidRef.current.add(uid);
        return;
      }
      const fallbackType =
        toolName === RectangleROITool.toolName ? "box" :
        toolName === CircleROITool.toolName ? "circle" :
        toolName === PlanarFreehandROITool.toolName ? "free" :
        toolName === LengthTool.toolName ? "line" :
        toolName === ArrowAnnotateTool.toolName ? "arrow" :
        "annotation";
      const fallbackSlot = isCornerstoneNifti ? activeNiftiSlot : activeDicomSlot;
      const fallbackPlane = isCornerstoneNifti
        ? (niftiSlotPlanes[fallbackSlot] || "axial")
        : (dicomSlotPlanes[fallbackSlot] || "axial");
      setTimeout(() => {
        if (cornerstoneAnnMeta[uid]) return;
        if (savedDbAnnotationUidsRef.current.has(uid)) return;
        setShowReport(false);
        setShowSidebar(true);
        setRightTab("annotations");
        openAnnotationSaveDialog(uid, {
          uid,
          slot: fallbackSlot,
          plane: fallbackPlane,
          type: fallbackType,
        });
      }, 0);
    };
    const onModified = () => setCornerstoneAnnVersion((v) => v + 1);
    const onRemoved = (evt) => {
      const uid = evt?.detail?.annotation?.annotationUID;
      if (uid) {
        transientMeasureUidRef.current.delete(uid);
        annPopupQueuedRef.current.delete(uid);
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
  }, [
    isCornerstoneNifti,
    isCornerstoneDicom,
    cornerstoneAnnMeta,
    activeNiftiSlot,
    activeDicomSlot,
    niftiSlotPlanes,
    dicomSlotPlanes,
    annTool,
    dicomTool,
    niftiTool,
  ]);

  useEffect(() => {
    if (!isCornerstoneNifti && !isCornerstoneDicom) return;
    if (annSaveDialog.open) return;
    if (!dbAnnotationsLoadedRef.current) return;
    let items = [];
    try {
      items = getCornerstoneAnnotationItems();
    } catch (e) {
      console.error("Failed to inspect annotations for save popup", e);
      return;
    }
    if (!Array.isArray(items) || !items.length) return;
    const currentIds = new Set(items.map((a) => a.uid));
    annPopupQueuedRef.current.forEach((uid) => {
      if (!currentIds.has(uid) || cornerstoneAnnMeta?.[uid]) {
        annPopupQueuedRef.current.delete(uid);
      }
    });
    const unsaved = items.find((a) =>
      !cornerstoneAnnMeta?.[a.uid] &&
      !annPopupQueuedRef.current.has(a.uid) &&
      !transientMeasureUidRef.current.has(a.uid) &&
      !savedDbAnnotationUidsRef.current.has(a.uid)
    );
    if (!unsaved?.uid) return;
    annPopupQueuedRef.current.add(unsaved.uid);

    // Mark & Ask mode is now handled independently via overlay canvas
    if (markAndAskActive) return;

    const id = setTimeout(() => {
      if (cornerstoneAnnMeta?.[unsaved.uid]) return;
      if (savedDbAnnotationUidsRef.current.has(unsaved.uid)) return;
      setShowReport(false);
      setShowSidebar(true);
      setRightTab("annotations");
      openAnnotationSaveDialog(unsaved.uid, unsaved);
    }, 120);
    return () => clearTimeout(id);
  }, [
    isCornerstoneNifti,
    isCornerstoneDicom,
    annSaveDialog.open,
    cornerstoneAnnMeta,
    cornerstoneAnnVersion,
    markAndAskActive,
  ]);

  useEffect(() => {
    if (!isCornerstoneNifti && !isCornerstoneDicom) return;
    if (annSaveDialog.open) return;
    const id = setInterval(() => {
      if (!dbAnnotationsLoadedRef.current) return;
      let items = [];
      try {
        items = getCornerstoneAnnotationItems();
      } catch {
        return;
      }
      if (!Array.isArray(items) || !items.length) return;
      const unsaved = items.find(
        (a) =>
          !cornerstoneAnnMeta?.[a.uid] &&
          !annPopupQueuedRef.current.has(a.uid) &&
          !transientMeasureUidRef.current.has(a.uid) &&
          !savedDbAnnotationUidsRef.current.has(a.uid)
      );
      if (!unsaved?.uid) return;
      annPopupQueuedRef.current.add(unsaved.uid);
      setShowReport(false);
      setShowSidebar(true);
      setRightTab("annotations");
      openAnnotationSaveDialog(unsaved.uid, unsaved);
    }, 400);
    return () => clearInterval(id);
  }, [isCornerstoneNifti, isCornerstoneDicom, annSaveDialog.open, cornerstoneAnnMeta]);

  const showDicomTriPlanar = !isNifti && (
    (dicomGrid.mode === "main2" && dicomTotalSlices > 1) ||
    layoutMode === "compare2x2"
  );
  const showNiftiTriPlanar = isNifti && !!niftiVol;

  // ─── MedSAM Segmentation handlers ─────────────────────────────────────
  const toggleMedsam = () => {
    if (medsamActive) { resetMedsam(); } else { setMedsamActive(true); }
  };

  const resetMedsam = () => {
    setMedsamActive(false); setMedsamDrawing(false); setMedsamLoading(false);
    setMedsamMask(null); setMedsamError(null); setMedsamPopup(false);
    setMedsamBox(null); medsamStartRef.current = null; medsamLiveRef.current = null;
  };

  const medsamPointerDown = (e, container) => {
    if (!medsamActive || medsamLoading) return;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    medsamStartRef.current = { x, y };
    medsamLiveRef.current = { x, y };
    setMedsamDrawing(true);
    setMedsamMask(null); setMedsamError(null);

    // Find the canvas element
    const canvases = container.querySelectorAll("canvas");
    if (canvases.length > 0) {
      medsamCanvasRef.current = canvases[0];
      const cb = canvases[0].getBoundingClientRect();
      setMedsamCanvasBounds({ left: cb.left - rect.left, top: cb.top - rect.top, width: cb.width, height: cb.height });
    }
  };

  const medsamPointerMove = (e) => {
    if (!medsamDrawing || !medsamStartRef.current) return;
    const container = e.currentTarget;
    const rect = container.getBoundingClientRect();
    medsamLiveRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    // Force re-render for live box
    setMedsamBox({
      x1: Math.min(medsamStartRef.current.x, medsamLiveRef.current.x),
      y1: Math.min(medsamStartRef.current.y, medsamLiveRef.current.y),
      x2: Math.max(medsamStartRef.current.x, medsamLiveRef.current.x),
      y2: Math.max(medsamStartRef.current.y, medsamLiveRef.current.y),
    });
  };

  const medsamPointerUp = async (e) => {
    if (!medsamDrawing || !medsamStartRef.current) return;
    setMedsamDrawing(false);
    const container = e.currentTarget;
    const rect = container.getBoundingClientRect();
    const endX = e.clientX - rect.left;
    const endY = e.clientY - rect.top;
    const box = {
      x1: Math.min(medsamStartRef.current.x, endX),
      y1: Math.min(medsamStartRef.current.y, endY),
      x2: Math.max(medsamStartRef.current.x, endX),
      y2: Math.max(medsamStartRef.current.y, endY),
    };
    setMedsamBox(box);

    if (box.x2 - box.x1 < 5 || box.y2 - box.y1 < 5) {
      setMedsamError("Box too small — draw a larger box");
      return;
    }

    const canvas = medsamCanvasRef.current;
    if (!canvas) { setMedsamError("No canvas found"); return; }

    setMedsamLoading(true);
    try {
      const result = await segmentBox(canvas, box, medsamCanvasBounds);
      if (result && result.dataUrl) {
        setMedsamMask(result.dataUrl);
        setMedsamPopup(true);
        setMedsamActive(false); // Auto-stop segmentation mode after success
      } else {
        setMedsamError("No segmentation mask returned");
      }
    } catch (err) {
      setMedsamError(err.message || "Segmentation failed");
    } finally {
      setMedsamLoading(false);
    }
  };

  return (
    <div ref={viewerRootRef} className="p-4" style={{ height: "100vh", width: "100%" }}>
      <CCard className="h-100 d-flex flex-column">
        <ViewerHeader
          filename={filename}
          isNifti={isNifti}
          isCornerstoneNifti={isCornerstoneNifti}
          isSeries={isSeries}
          isFullscreen={isFullscreen}
          onToggleFullscreen={requestViewerFullscreen}
          onCloseViewer={() => {
            if (reportUnsavedRef.current) {
              setShowViewerCloseConfirm(true);
            } else {
              navigate("/radiologist/repository");
            }
          }}
          patientName={patientName}
          patientAge={patientAge}
          patientSex={patientSex}
          caseId={caseId}
clientId={clientId}

          onToggleReport={async () => {
            // Open the editor and restore the latest snapshot from
            // radiology_schema.report_versions for this case (if any).
            // After my recent changes, every Save and every AI generate
            // appends a row to report_versions, so the latest snapshot is
            // the source of truth for "what the user last saw / worked on".
            // If no snapshot exists yet, the editor opens with the empty
            // template (which is the correct behavior for a brand-new case).
            setReportData((prev) => ({
              // Preserve everything that was already loaded (e.g. radiologist
              // snapshot fields from GET /reports/{case_id}) so the signature
              // card keeps name/qualification/designation/signature_path when
              // the editor re-renders.
              ...(prev || {}),
              report_id: prev?.report_id || `RPT-${caseId}`,
              case_id: caseId,
              patient_name: prev?.patient_name || patientName || "—",
              patient_age: prev?.patient_age || patientAge || "—",
              patient_sex: prev?.patient_sex || patientSex || "—",
              modality: prev?.modality || (isNifti ? "NIfTI" : "DICOM"),
              status: prev?.status || "draft",
              created_at: prev?.created_at || new Date().toISOString(),
              // Keep whatever is already in state (don't wipe ai_* / main
              // columns) so the editor's structured fields stay coherent
              // with the version snapshot we're about to overlay.
              technique:  prev?.technique  || "",
              findings:   prev?.findings   || "",
              impression: prev?.impression || "",
              opinions:   prev?.opinions   || "",
              report_mode: prev?.report_mode || "manual",
            }));
            setRightTab("chat");
            setShowReport(true);

            // Refetch the latest version snapshot from
            // radiology_schema.report_versions and overlay its raw HTML on
            // the editor so the user sees what they last had open
            // (including any AI generation that was auto-snapshotted).
            try {
              const uid = localStorage.getItem("user_id") || (() => {
                try { return JSON.parse(localStorage.getItem("auth") || "{}").userId || null; } catch { return null; }
              })();
              const versionsUrl = uid
                ? `${BACKEND_URL}/radiology/reports/${encodeURIComponent(caseId)}/versions?user_id=${encodeURIComponent(uid)}`
                : `${BACKEND_URL}/radiology/reports/${encodeURIComponent(caseId)}/versions`;
              const resp = await fetch(versionsUrl);
              const j = await resp.json().catch(() => null);
              const rows = Array.isArray(j?.data) ? j.data : [];
              const latest = rows[0]; // endpoint returns rows ORDER BY created_at DESC
              if (latest?.html && latest.html.trim()) {
                // Collapse any doubled "Dr. Dr." prefix inside the saved
                // signature card before the snapshot lands in state or in
                // the editor.
                const fixed = String(latest.html).replace(
                  /(<div[^>]*class="[^"]*report-sign-name[^"]*"[^>]*>)([\s\S]*?)(<\/div>)/i,
                  (_, open, inner, close) => {
                    const stripped = String(inner)
                      .trim()
                      .replace(/^(?:dr\.\s*|dr\s+)+/i, "")
                      .trim();
                    return open + (stripped ? `Dr. ${stripped}` : "") + close;
                  }
                );
                setLatestReportVersionHtml(fixed);
                // Overlay onto the editor after the template has had a
                // chance to mount. The reportData-watching effect lays
                // down the template first; this overwrites the inner HTML
                // with the snapshot.
                setTimeout(() => {
                  const el = reportEditorRef.current;
                  if (el) el.innerHTML = fixed;
                }, 80);
              }
            } catch (e) {
              console.warn("[onToggleReport] fetch latest report_versions failed:", e);
            }
          }}
          layoutMode={layoutMode}
          onChangeLayoutMode={(next) => {
            setLayoutMode(next);
          }}
          
          
        />

        <CCardBody className="p-0 position-relative flex-grow-1" style={{ backgroundColor: "black", overflow: "hidden" }}>
          {error && (
            <div className="d-flex flex-column justify-content-center align-items-center h-100 text-danger position-relative" style={{ zIndex: 20 }}>
              <h4>{error}</h4>
              <CButton color="light" size="sm" onClick={() => navigate("/radiologist/repository")} className="mt-3">
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

          {/* DICOM layout (NIfTI-like) */}
          {!isNifti && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: showReport
                  ? "minmax(0,1fr) 1fr"
                  : showSidebar
                    ? `minmax(0,1fr) ${sidePanelWidth}px`
                    : "1fr",
                gap: 10,
                height: "100%",
                padding: 10,
                /* No bottom reservation here — the side panel on the right
                   should extend to the full height. The viewer column on the
                   left handles its own bottom space for the absolute-positioned
                   strip via paddingBottom on its inner flex container below. */
                position: "relative",
              }}
            >
              <div style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                minWidth: 0,
                height: "100%",
                /* Reserve room at the bottom for the absolute-positioned series
                   strip (142px tall) which sits inside CCardBody. Only the LEFT
                   column needs this — the right side panel should extend to the
                   full height since the strip doesn't span over it. */
                paddingBottom: 172,
                boxSizing: "border-box",
              }}>
                <DicomToolbar
                  showGridMenu={showGridMenu}
                  setShowGridMenu={setShowGridMenu}
                  dicomGridSelected={dicomGridSelected}
                  dicomGrid={dicomGrid}
                  setDicomGrid={setDicomGrid}
                  setDicomGridSelected={setDicomGridSelected}
                  showPlaneMenu={showPlaneMenu}
                  setShowPlaneMenu={setShowPlaneMenu}
                  activeDicomSlot={activeDicomSlot}
                  dicomSlotPlanes={dicomSlotPlanes}
                  setDicomSlotPlanes={setDicomSlotPlanes}
                  dicomZoomMode={dicomZoomMode}
                  setDicomZoomMode={setDicomZoomMode}
                  dicomTool={dicomTool}
                  activateCornerstoneDicomTool={activateCornerstoneDicomTool}
                  scrollCornerstoneDicom={scrollCornerstoneDicom}
                  rotateCornerstoneDicom={rotateCornerstoneDicom}
                  saveSelectedViewportAsPng={saveSelectedViewportAsPng}
                  setIsPlaying={setIsPlaying}
                  isPlaying={isPlaying}
                  saveNotice={saveNotice}
                  onMeasureActivate={handleMeasureActivate}
                  applyWindowPreset={applyDicomWindowPreset}
                  isFlipH={dicomFlipH}
                  isFlipV={dicomFlipV}
                  isInverted={dicomInvert}
                  onFlipH={flipDicomH}
                  onFlipV={flipDicomV}
                  onInvert={invertDicom}
                />

                <div style={{ position: "relative", flex: 1, minHeight: 0, border: "1px solid #2b2b2b", borderRadius: 12, overflow: "hidden", background: "#000" }}>
                  <ViewerImageOverlay
                    patientName={patientName}
                    patientAge={patientAge}
                    patientSex={patientSex}
                    caseId={caseId}
                    modality="CT"
                    plane={dicomSlotPlanes[activeDicomSlot]}
                    sliceCurrent={dicomSliceBySlot[activeDicomSlot]?.current}
                    sliceTotal={dicomSliceBySlot[activeDicomSlot]?.total}
                    filename={filename}
                    isInverted={dicomInvert}
                  />

                  {/* Minimap (visible only when zoomed) */}
                  <Minimap
                    renderingEngine={renderingEngineRef.current}
                    viewportId={getDicomViewportIdForSlot(activeDicomSlot)}
                  />

                  {showDicomTriPlanar ? (
                    <CornerstoneDicomGrid
                      dicomGrid={dicomGrid}
                      activeDicomSlot={activeDicomSlot}
                      setActiveDicomSlot={setActiveDicomSlot}
                      axRef={axRef}
                      sagRef={sagRef}
                      corRef={corRef}
                      handleCornerstoneDicomWheel={handleCornerstoneDicomWheel}
                      updateDicomMouseCoords={updateDicomMouseCoords}
                      clearDicomMouseCoords={clearDicomMouseCoords}
                      dicomTool={dicomTool}
                      deleteLastLengthOnDicomSlot={deleteLastLengthOnDicomSlot}
                      isScopedToolActive={isScopedDicomToolActive}
                      dicomSliceBySlot={dicomSliceBySlot}
                      dicomMouseBySlot={dicomMouseBySlot}
                      dicomCrosshairBySlot={dicomCrosshairBySlot}
                      dicomCrosshairColor={dicomCrosshairColor}
                      showDicomCrosshair={dicomTool === "crosshair"}
                      dicomSlotPlanes={dicomSlotPlanes}
                      /* ─ Phase 2 props ───────────────────── */
                      layoutMode={layoutMode}
                      compareSlot3Ref={compareSlot3Ref}
                      compareViewportSeries={compareViewportSeries}
                      availableSeries={seriesGrouping.series}
                      focusedCompareSlot={focusedCompareSlot}
                      setFocusedCompareSlot={setFocusedCompareSlot}
                      compareSlotLoading={compareSlotLoading}
                    />
                  ) : (
                    <div ref={singleRef} className="cornerstone3d-viewport" style={{ height: "100%", width: "100%" }} />
                  )}

                  {/* Thumbnail strip — left side vertical panel */}
                  <ThumbnailStrip
                    totalSlices={dicomSliceBySlot[activeDicomSlot]?.total}
                    currentSlice={dicomSliceBySlot[activeDicomSlot]?.current}
                    renderingEngine={renderingEngineRef.current}
                    viewportId={getDicomViewportIdForSlot(activeDicomSlot)}
                    onSliceClick={(idx) => {
                      try {
                        const vp = renderingEngineRef.current?.getViewport?.(getDicomViewportIdForSlot(activeDicomSlot));
                        if (!vp) return;
                        const cur = dicomSliceBySlot[activeDicomSlot]?.current ?? 0;
                        const delta = idx - cur;
                        if (delta !== 0 && vp.scroll) {
                          vp.scroll(delta);
                          vp.render();
                        } else if (vp.setImageIdIndex) {
                          vp.setImageIdIndex(idx);
                          vp.render();
                        }
                        refreshDicomSliceIndicators?.();
                      } catch {}
                    }}
                  />
                  {/* MedSAM Segmentation Overlay */}
                  <MedSAMSegmentOverlay
                    isActive={medsamActive}
                    isDrawing={medsamDrawing}
                    isLoading={medsamLoading}
                    maskDataUrl={medsamMask}
                    error={medsamError}
                    popupOpen={medsamPopup}
                    liveBox={medsamBox ? { x: medsamBox.x1, y: medsamBox.y1, w: medsamBox.x2 - medsamBox.x1, h: medsamBox.y2 - medsamBox.y1 } : null}
                    canvasBounds={medsamCanvasBounds}
                    savedMasks={medsamSavedMasks}
                    onPointerDown={(e, container) => medsamPointerDown(e, container)}
                    onPointerMove={(e) => medsamPointerMove(e)}
                    onPointerUp={(e) => medsamPointerUp(e)}
                    onSaveAnnotation={async () => {
                      setMedsamPopup(false);
                      setMedsamMask(null);
                      // Save segmentation mask to DB (best-effort)
                      try {
                        const auth = JSON.parse(localStorage.getItem("auth") || "{}");
                        const authToken = auth.token || null;
                        if (authToken && medsamMask && caseId) {
                          const b64 = medsamMask.split(",")[1] || medsamMask;
                          await fetch("/api/radiology/segmentations", {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                              Authorization: `Bearer ${authToken}`,
                            },
                            body: JSON.stringify({
                              case_id: caseId,
                              source_file_path: fileUrl || "",
                              source_type: isNifti ? "nii" : "dicom",
                              plane: niftiPlane || "axial",
                              seed_slice_index: typeof currentSlice === "number" ? currentSlice : null,
                              prompt_box: medsamBox ? [medsamBox.x1, medsamBox.y1, medsamBox.x2, medsamBox.y2] : null,
                              mask_base64: b64,
                            }),
                          });
                        }
                      } catch (err) {
                        console.warn("Failed to save segmentation to DB:", err);
                      }
                      setAnnSaveDialog({ open: true, uid: `medsam_${Date.now()}`, slot: 0, plane: "axial", type: "segment", maskImage: medsamMask });
                    }}
                    onAskOnixAI={async () => {
                      setMedsamPopup(false);
                      setMedsamMask(null);
                      setRightTab("onix");
                      const prompt = "Analyze this segmented region. What organ or structure is highlighted? Describe any abnormalities.";
                      setOnixMessages((m) => [...m, { role: "user", text: prompt, image: medsamMask }]);
                      if (medsamMask) {
                        setOnixLoading(true);
                        // Get JWT token for auth
                        let authToken = null;
                        try {
                          const auth = JSON.parse(localStorage.getItem("auth") || "{}");
                          authToken = auth.token || null;
                        } catch { authToken = null; }
                        try {
                          const b64 = medsamMask.split(",")[1] || "";
                          const res = await fetch("/api/radiology/ai/analyze", {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                              ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
                            },
                            body: JSON.stringify({ image_base64: b64, prompt, case_id: caseId || null, model: aiModel || "llava" }),
                          });
                          const data = await res.json();
                          if (data.success) setOnixMessages((m) => [...m, { role: "ai", text: data.response }]);
                          else setOnixMessages((m) => [...m, { role: "ai", text: "Analysis failed: " + (data.detail || "") }]);
                        } catch (err) {
                          setOnixMessages((m) => [...m, { role: "ai", text: "Network error: " + err.message }]);
                        }
                        setOnixLoading(false);
                      }
                    }}
                    onDontSave={() => { setMedsamPopup(false); setMedsamMask(null); }}
                  />
                </div>
              </div>

              <ViewerSidePanel
                showReport={showReport}
                showSidebar={showSidebar}
                setShowSidebar={setShowSidebar}
                setShowReport={setShowReport}
                reportExists={reportExists}
                exportReportPdf={exportReportPdf}
                downloadReportPdf={downloadReportPdf}
                saveReportToDb={saveReportToDb}
                setLatestReportVersionHtml={setLatestReportVersionHtml}
                reportData={reportData}
                submitReport={submitReport}
                backendUrl={BACKEND_URL}
                currentUserId={currentUserId}
                reportUnsavedRef={reportUnsavedRef}
                reportSaveFnRef={reportSaveFnRef}
                qcStage={qcStage}
                pdfPreviewUrl={pdfPreviewUrl}
                qcResult={qcResult}
                markComplete={markComplete}
                cancelQcPreview={cancelQcPreview}
                editReportWithCommand={editReportWithCommand}
                execCmd={execCmd}
                reportEditorRef={reportEditorRef}
                rightTab={rightTab}
                setRightTab={setRightTab}
                patientName={patientName}
                caseId={caseId}
clientId={clientId}
                patientAge={patientAge}
                patientSex={patientSex}
                isNifti={isNifti}
                filename={filename}
                priority={priority}
                status={status}
                study={study}
                caseModality={caseModality}
                referredBy={referredBy}
                caseLocation={caseLocation}
                waitMins={waitMins}
                chatMessages={chatMessages}
                onChatFile={onChatFile}
                chatInput={chatInput}
                setChatInput={setChatInput}
                sendChat={sendLiveChat}
                annTool={annTool}
                isCornerstone={isCornerstoneDicom}
                activateCornerstoneAnnotationTool={activateCornerstoneAnnotationTool}
                setAnnTool={setAnnTool}
                onAnnotationToolPick={handleAnnotationToolPick}
                annOwnerFilter={annOwnerFilter}
                setAnnOwnerFilter={setAnnOwnerFilter}
                showAnnFilterMenu={showAnnFilterMenu}
                setShowAnnFilterMenu={setShowAnnFilterMenu}
                getCornerstoneAnnotationItems={getCornerstoneAnnotationItems}
                cornerstoneAnnMeta={cornerstoneAnnMeta}
                jumpToCornerstoneAnnotationByUid={jumpToCornerstoneAnnotationByUid}
                cornerstoneAnnNotes={cornerstoneAnnNotes}
                setCornerstoneAnnMeta={setCornerstoneAnnMeta}
                setCornerstoneAnnNotes={setCornerstoneAnnNotes}
                deleteCornerstoneAnnotationByUid={deleteCornerstoneAnnotationByUid}
                annotations={annotations}
                setSelectedAnnId={setSelectedAnnId}
                openBoxInViewer={openBoxInViewer}
                setAnnotations={setAnnotations}
                onixMessages={onixMessages}
                setOnixMessages={setOnixMessages}
                onixInput={onixInput}
                setOnixInput={setOnixInput}
                sendOnix={sendOnix}
                onixLoading={onixLoading}
                onixStatusText={onixStatusText}
                setOnixLoading={setOnixLoading}
                generateAIReport={generateAIReport}
                generateMedGemmaVisionReport={generateAIReport}
                stopAIReport={stopAIReport}
                aiModel={aiModel}
                setAiModel={setAiModel}
                sidePanelWidth={sidePanelWidth}
                setSidePanelWidth={setSidePanelWidth}
                markAndAskActive={markAndAskActive}
                onMedsamToggle={toggleMedsam}
                medsamActive={medsamActive}
                onMedsamGetMask={() => medsamMask}
                startMarkAndAsk={startMarkAndAsk}
                finishMarkAndAsk={finishMarkAndAsk}
                cancelMarkAndAsk={cancelMarkAndAsk}
                annSaveDialog={annSaveDialog}
                annDraftTitle={annDraftTitle}
                setAnnDraftTitle={setAnnDraftTitle}
                annDraftComment={annDraftComment}
                setAnnDraftComment={setAnnDraftComment}
                saveAnnotationDialog={saveAnnotationDialog}
                closeAnnotationSaveDialog={closeAnnotationSaveDialog}
                dbAnnotations={dbAnnotations}
                setDbAnnotations={setDbAnnotations}
                savedCornerstoneUids={savedCornerstoneUids}
                currentUserId={currentUserId}
               
               
                
               

              
              />
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
                    ? `minmax(0,1fr) ${sidePanelWidth}px`
                    : "1fr",
                gap: 10,
                height: "100%",
                padding: 10,
                position: "relative",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0, height: "100%" }}>
                <NiftiToolbar
                  showGridMenu={showGridMenu}
                  setShowGridMenu={setShowGridMenu}
                  niftiGridSelected={niftiGridSelected}
                  niftiGrid={niftiGrid}
                  setNiftiGrid={setNiftiGrid}
                  setNiftiGridSelected={setNiftiGridSelected}
                  showPlaneMenu={showPlaneMenu}
                  setShowPlaneMenu={setShowPlaneMenu}
                  isCornerstoneNifti={isCornerstoneNifti}
                  setNiftiSlotPlanes={setNiftiSlotPlanes}
                  activeNiftiSlot={activeNiftiSlot}
                  niftiSlotPlanes={niftiSlotPlanes}
                  niftiPlane={niftiPlane}
                  setNiftiPlane={setNiftiPlane}
                  setNzIndex={setNzIndex}
                  setNxIndex={setNxIndex}
                  setNyIndex={setNyIndex}
                  showColormapMenu={showColormapMenu}
                  setShowColormapMenu={setShowColormapMenu}
                  isNifti={isNifti}
                  niftiSlotColormap={niftiSlotColormap}
                  applyNiftiColormapToSlot={applyNiftiColormapToSlot}
                  colormapPresets={NIFTI_COLORMAP_PRESETS}
                  niftiZoomMode={niftiZoomMode}
                  setNiftiZoomMode={setNiftiZoomMode}
                  activateCornerstoneNiftiTool={activateCornerstoneNiftiTool}
                  niftiTool={niftiTool}
                  setNiftiTool={setNiftiTool}
                  saveSelectedViewportAsPng={saveSelectedViewportAsPng}
                  rotateCornerstoneNifti={rotateCornerstoneNifti}
                  setNiftiRotation={setNiftiRotation}
                  scrollCornerstoneNifti={scrollCornerstoneNifti}
                  setIsPlaying={setIsPlaying}
                  isPlaying={isPlaying}
                  niftiVol={niftiVol}
                  getActiveNiftiViewport={getActiveNiftiViewport}
                  refreshNiftiSliceIndicators={refreshNiftiSliceIndicators}
                  saveNotice={saveNotice}
                  onMeasureActivate={handleMeasureActivate}
                  applyWindowPreset={applyNiftiWindowPreset}
                  isFlipH={niftiFlipH}
                  isFlipV={niftiFlipV}
                  isInverted={niftiInvert}
                  onFlipH={flipNiftiH}
                  onFlipV={flipNiftiV}
                  onInvert={invertNifti}
                />

                <div ref={niftiContainerRef} style={{ position: "relative", flex: 1, minHeight: 0, border: "1px solid #2b2b2b", borderRadius: 12, overflow: "hidden", background: "#000" }}>
                  <ViewerImageOverlay
                    patientName={patientName}
                    patientAge={patientAge}
                    patientSex={patientSex}
                    caseId={caseId}
                    modality="NIfTI"
                    plane={isCornerstoneNifti ? niftiSlotPlanes[activeNiftiSlot] : niftiPlane}
                    sliceCurrent={niftiSliceBySlot[activeNiftiSlot]?.current}
                    sliceTotal={niftiSliceBySlot[activeNiftiSlot]?.total}
                    filename={filename}
                    isInverted={niftiInvert}
                  />

                  {/* Minimap (visible only when zoomed) */}
                  {isCornerstoneNifti && (
                    <Minimap
                      renderingEngine={renderingEngineRef.current}
                      viewportId={`NIFTI_SLOT_${activeNiftiSlot}`}
                    />
                  )}

                {/* Grid views */}
                {isCornerstoneNifti && (
                  <CornerstoneNiftiGrid
                    niftiGrid={niftiGrid}
                    activeNiftiSlot={activeNiftiSlot}
                    setActiveNiftiSlot={setActiveNiftiSlot}
                    axRef={axRef}
                    sagRef={sagRef}
                    corRef={corRef}
                    handleCornerstoneNiftiWheel={handleCornerstoneNiftiWheel}
                    updateNiftiMouseCoords={updateNiftiMouseCoords}
                    clearNiftiMouseCoords={clearNiftiMouseCoords}
                    niftiTool={niftiTool}
                    deleteLastLengthOnNiftiSlot={deleteLastLengthOnNiftiSlot}
                    isScopedToolActive={isScopedToolActive}
                    niftiSliceBySlot={niftiSliceBySlot}
                    niftiMouseBySlot={niftiMouseBySlot}
                    niftiSlotPlanes={niftiSlotPlanes}
                    isCornerstoneNifti={isCornerstoneNifti}
                    niftiCrosshairBySlot={niftiCrosshairBySlot}
                    niftiCrosshairColor={niftiCrosshairColor}
                    showNiftiCrosshair={niftiTool === "crosshair"}
                  />
                )}
                {!isCornerstoneNifti && (
                  <NiftiCanvasGrid
                    niftiGrid={niftiGrid}
                    niftiPlane={niftiPlane}
                    niftiVol={niftiVol}
                    nxIndex={nxIndex}
                    nyIndex={nyIndex}
                    nzIndex={nzIndex}
                    niftiTool={niftiTool}
                    niftiPan={niftiPan}
                    niftiZoom={niftiZoom}
                    niftiRotation={niftiRotation}
                    onWheelNiftiAxial={onWheelNiftiAxial}
                    onWheelNiftiSagittal={onWheelNiftiSagittal}
                    onWheelNiftiCoronal={onWheelNiftiCoronal}
                    startNiftiDrag={startNiftiDrag}
                    updateNiftiDrag={updateNiftiDrag}
                    endNiftiDrag={endNiftiDrag}
                    onNiftiContextMenu={onNiftiContextMenu}
                  />
                )}

                  {/* Thumbnail strip — left side vertical panel */}
                  <ThumbnailStrip
                    totalSlices={niftiSliceBySlot[activeNiftiSlot]?.total}
                    currentSlice={niftiSliceBySlot[activeNiftiSlot]?.current}
                    renderingEngine={renderingEngineRef.current}
                    viewportId={isCornerstoneNifti ? `NIFTI_SLOT_${activeNiftiSlot}` : null}
                    onSliceClick={(idx) => {
                      try {
                        if (isCornerstoneNifti) {
                          const vp = renderingEngineRef.current?.getViewport?.(`NIFTI_SLOT_${activeNiftiSlot}`);
                          if (!vp) return;
                          const cur = niftiSliceBySlot[activeNiftiSlot]?.current ?? 0;
                          const delta = idx - cur;
                          if (delta !== 0 && vp.scroll) {
                            vp.scroll(delta);
                            vp.render();
                          } else if (vp.setImageIdIndex) {
                            vp.setImageIdIndex(idx);
                            vp.render();
                          }
                          refreshNiftiSliceIndicators?.();
                        }
                      } catch {}
                    }}
                  />
                  {/* MedSAM Segmentation Overlay for NIfTI */}
                  <MedSAMSegmentOverlay
                    isActive={medsamActive}
                    isDrawing={medsamDrawing}
                    isLoading={medsamLoading}
                    maskDataUrl={medsamMask}
                    error={medsamError}
                    popupOpen={medsamPopup}
                    liveBox={medsamBox ? { x: medsamBox.x1, y: medsamBox.y1, w: medsamBox.x2 - medsamBox.x1, h: medsamBox.y2 - medsamBox.y1 } : null}
                    canvasBounds={medsamCanvasBounds}
                    savedMasks={medsamSavedMasks}
                    onPointerDown={(e, container) => medsamPointerDown(e, container)}
                    onPointerMove={(e) => medsamPointerMove(e)}
                    onPointerUp={(e) => medsamPointerUp(e)}
                    onSaveAnnotation={async () => {
                      setMedsamPopup(false);
                      setMedsamMask(null);
                      // Save segmentation mask to DB (best-effort)
                      try {
                        const auth = JSON.parse(localStorage.getItem("auth") || "{}");
                        const authToken = auth.token || null;
                        if (authToken && medsamMask && caseId) {
                          const b64 = medsamMask.split(",")[1] || medsamMask;
                          await fetch("/api/radiology/segmentations", {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                              Authorization: `Bearer ${authToken}`,
                            },
                            body: JSON.stringify({
                              case_id: caseId,
                              source_file_path: fileUrl || "",
                              source_type: isNifti ? "nii" : "dicom",
                              plane: niftiPlane || "axial",
                              seed_slice_index: typeof currentSlice === "number" ? currentSlice : null,
                              prompt_box: medsamBox ? [medsamBox.x1, medsamBox.y1, medsamBox.x2, medsamBox.y2] : null,
                              mask_base64: b64,
                            }),
                          });
                        }
                      } catch (err) {
                        console.warn("Failed to save segmentation to DB:", err);
                      }
                      setAnnSaveDialog({ open: true, uid: `medsam_${Date.now()}`, slot: 0, plane: "axial", type: "segment", maskImage: medsamMask });
                    }}
                    onAskOnixAI={async () => {
                      setMedsamPopup(false);
                      setMedsamMask(null);
                      setRightTab("onix");
                      const prompt = "Analyze this segmented region. What organ or structure is highlighted? Describe any abnormalities.";
                      setOnixMessages((m) => [...m, { role: "user", text: prompt, image: medsamMask }]);
                      if (medsamMask) {
                        setOnixLoading(true);
                        // Get JWT token for auth
                        let authToken = null;
                        try {
                          const auth = JSON.parse(localStorage.getItem("auth") || "{}");
                          authToken = auth.token || null;
                        } catch { authToken = null; }
                        try {
                          const b64 = medsamMask.split(",")[1] || "";
                          const res = await fetch("/api/radiology/ai/analyze", {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                              ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
                            },
                            body: JSON.stringify({ image_base64: b64, prompt, case_id: caseId || null, model: aiModel || "llava" }),
                          });
                          const data = await res.json();
                          if (data.success) setOnixMessages((m) => [...m, { role: "ai", text: data.response }]);
                          else setOnixMessages((m) => [...m, { role: "ai", text: "Analysis failed: " + (data.detail || "") }]);
                        } catch (err) {
                          setOnixMessages((m) => [...m, { role: "ai", text: "Network error: " + err.message }]);
                        }
                        setOnixLoading(false);
                      }
                    }}
                   onDontSave={() => { setMedsamPopup(false); setMedsamMask(null); }}
                  />
                </div>

                {/* Series picker moved to CCardBody level — see the
                   absolute-positioned strip near the close of CCardBody. */}
              </div>

              <ViewerSidePanel
                showReport={showReport}
                showSidebar={showSidebar}
                setShowSidebar={setShowSidebar}
                setShowReport={setShowReport}
                reportExists={reportExists}
                exportReportPdf={exportReportPdf}
                downloadReportPdf={downloadReportPdf}
                saveReportToDb={saveReportToDb}
                setLatestReportVersionHtml={setLatestReportVersionHtml}
                reportData={reportData}
                submitReport={submitReport}
                backendUrl={BACKEND_URL}
                currentUserId={currentUserId}
                reportUnsavedRef={reportUnsavedRef}
                reportSaveFnRef={reportSaveFnRef}
                qcStage={qcStage}
                pdfPreviewUrl={pdfPreviewUrl}
                qcResult={qcResult}
                markComplete={markComplete}
                cancelQcPreview={cancelQcPreview}
                editReportWithCommand={editReportWithCommand}
                execCmd={execCmd}
                reportEditorRef={reportEditorRef}
                rightTab={rightTab}
                setRightTab={setRightTab}
                patientName={patientName}
                caseId={caseId}
                patientAge={patientAge}
                patientSex={patientSex}
                isNifti={isNifti}
                filename={filename}
                priority={priority}
                status={status}
                study={study}
                caseModality={caseModality}
                referredBy={referredBy}
                caseLocation={caseLocation}
                waitMins={waitMins}
                chatMessages={chatMessages}
                onChatFile={onChatFile}
                chatInput={chatInput}
                setChatInput={setChatInput}
                sendChat={sendLiveChat}
                annTool={annTool}
                isCornerstone={isCornerstoneNifti}
                activateCornerstoneAnnotationTool={activateCornerstoneAnnotationTool}
                setAnnTool={setAnnTool}
                onAnnotationToolPick={handleAnnotationToolPick}
                annOwnerFilter={annOwnerFilter}
                setAnnOwnerFilter={setAnnOwnerFilter}
                showAnnFilterMenu={showAnnFilterMenu}
                setShowAnnFilterMenu={setShowAnnFilterMenu}
                getCornerstoneAnnotationItems={getCornerstoneAnnotationItems}
                cornerstoneAnnMeta={cornerstoneAnnMeta}
                jumpToCornerstoneAnnotationByUid={jumpToCornerstoneAnnotationByUid}
                cornerstoneAnnNotes={cornerstoneAnnNotes}
                setCornerstoneAnnMeta={setCornerstoneAnnMeta}
                setCornerstoneAnnNotes={setCornerstoneAnnNotes}
                deleteCornerstoneAnnotationByUid={deleteCornerstoneAnnotationByUid}
                annotations={annotations}
                setSelectedAnnId={setSelectedAnnId}
                openBoxInViewer={openBoxInViewer}
                setAnnotations={setAnnotations}
                onixMessages={onixMessages}
                setOnixMessages={setOnixMessages}
                onixInput={onixInput}
                setOnixInput={setOnixInput}
                sendOnix={sendOnix}
                onixLoading={onixLoading}
                onixStatusText={onixStatusText}
                setOnixLoading={setOnixLoading}
                generateAIReport={generateAIReport}
                generateMedGemmaVisionReport={generateAIReport}
                stopAIReport={stopAIReport}
                aiModel={aiModel}
                setAiModel={setAiModel}
                sidePanelWidth={sidePanelWidth}
                setSidePanelWidth={setSidePanelWidth}
                markAndAskActive={markAndAskActive}
                onMedsamToggle={toggleMedsam}
                medsamActive={medsamActive}
                onMedsamGetMask={() => medsamMask}
                startMarkAndAsk={startMarkAndAsk}
                finishMarkAndAsk={finishMarkAndAsk}
                cancelMarkAndAsk={cancelMarkAndAsk}
                annSaveDialog={annSaveDialog}
                annDraftTitle={annDraftTitle}
                setAnnDraftTitle={setAnnDraftTitle}
                annDraftComment={annDraftComment}
                setAnnDraftComment={setAnnDraftComment}
                saveAnnotationDialog={saveAnnotationDialog}
                closeAnnotationSaveDialog={closeAnnotationSaveDialog}
                dbAnnotations={dbAnnotations}
                setDbAnnotations={setDbAnnotations}
                savedCornerstoneUids={savedCornerstoneUids}
                currentUserId={currentUserId}


              
               
               
              />
            </div>
          )}

          {/* ─── Series picker (bottom strip) ──────────────────────────
             Pinned to the bottom of CCardBody via position:absolute so it
             ALWAYS occupies its 142px regardless of how the viewer columns
             above distribute their flex space. Spans the full viewer width
             (across both the viewport area and the side panel). Hidden for
             NIfTI cases. */}
          {!isNifti && (
            <div
              style={{
                position: "absolute",
                /* Match the grid wrapper's padding so the strip aligns flush with
                   the viewer column. Right offset accounts for the side panel
                   width + the grid gap so we don't overlap it. */
                bottom: 10,
                left: 10,
                right: showReport
                  ? "calc(50% + 5px)"          // 50/50 split with 10px gap
                  : (showSidebar ? sidePanelWidth + 20 : 10),
                zIndex: 50,
              }}
            >
              <SeriesPickerStrip
                series={seriesGrouping.series}
                thumbs={seriesThumbs}
                activeSeriesUid={layoutMode === "mpr3" ? mprViewportSeries[activeDicomSlot] : null}
                viewportSeriesMap={
                  layoutMode === "compare2x2" ? compareViewportSeries
                  : layoutMode === "mpr3" ? mprViewportSeries
                  : null
                }
                loading={seriesGrouping.loading}
                progress={seriesGrouping.progress}
                forceShow={true}
                onSelectSeries={(uid) => {
                  if (!uid) return;
                  if (layoutMode === "compare2x2") {
                    setCompareViewportSeries((prev) => {
                      if (prev[focusedCompareSlot] === uid) return prev;
                      return { ...prev, [focusedCompareSlot]: uid };
                    });
                    return;
                  }
                  /* 3-up MPR: update ONLY the focused (activeDicomSlot)
                     viewport. The MPR override effect picks up this change
                     and calls setStack on just that one viewport, leaving
                     the other 2 untouched. */
                  setMprViewportSeries((prev) => {
                    if (prev[activeDicomSlot] === uid) return prev;
                    return { ...prev, [activeDicomSlot]: uid };
                  });
                }}
              />
            </div>
          )}
        </CCardBody>
      </CCard>

      {showViewerCloseConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "Segoe UI, -apple-system, BlinkMacSystemFont, sans-serif",
          }}
          onClick={() => !viewerCloseSaving && setShowViewerCloseConfirm(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 320,
              background: "#ffffff",
              color: "#1f2937",
              borderRadius: 10,
              boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
              padding: "18px 18px 14px",
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
              Save the changes?
            </div>
            <div style={{ fontSize: 13, color: "#4b5563", marginBottom: 14 }}>
              Would you like to save a version before closing the viewer?
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <CButton
                color="light"
                size="sm"
                disabled={viewerCloseSaving}
                onClick={() => {
                  setShowViewerCloseConfirm(false);
                  navigate("/radiologist/repository");
                }}
              >
                No
              </CButton>
              <CButton
                color="primary"
                size="sm"
                disabled={viewerCloseSaving}
                onClick={async () => {
                  setViewerCloseSaving(true);
                  try {
                    if (typeof reportSaveFnRef.current === "function") {
                      await reportSaveFnRef.current("Saved on close");
                    }
                  } finally {
                    setViewerCloseSaving(false);
                    setShowViewerCloseConfirm(false);
                    navigate("/radiologist/repository");
                  }
                }}
              >
                {viewerCloseSaving ? "Saving…" : "Yes"}
              </CButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
