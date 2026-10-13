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
  import cornerstoneWADOImageLoader from "cornerstone-wado-image-loader";
  import useAnatomyLabel from "./DicomViewer/hooks/useAnatomyLabel";
  import ViewerHeader from "./DicomViewer/components/ViewerHeader";
  import ViewerImageOverlay from "./DicomViewer/components/ViewerImageOverlay";
  import ViewerSidePanel from "./DicomViewer/components/ViewerSidePanel";
  import NiftiToolbar from "./DicomViewer/nifti/components/NiftiToolbar";
  import NiftiCanvasGrid from "./DicomViewer/nifti/components/NiftiCanvasGrid";
  import CornerstoneNiftiGrid from "./DicomViewer/nifti/components/CornerstoneNiftiGrid";
  import DicomToolbar from "./DicomViewer/dicom/components/DicomToolbar";
  import CornerstoneDicomGrid from "./DicomViewer/dicom/components/CornerstoneDicomGrid";
  import { readDicomOverlayTags } from "./DicomViewer/utils/dicomTags";
  import Minimap from "./DicomViewer/components/Minimap";
  import useCornerstoneAnnotations from "./DicomViewer/hooks/useCornerstoneAnnotations";
  import useNiftiCanvasInteractions from "./DicomViewer/nifti/hooks/useNiftiCanvasInteractions";
  import useNiftiCanvasRenderer from "./DicomViewer/nifti/hooks/useNiftiCanvasRenderer";
  import useNiftiPlayback from "./DicomViewer/nifti/hooks/useNiftiPlayback";
  import useDicomPlayback from "./DicomViewer/dicom/hooks/useDicomPlayback";
  import useCornerstonePromptBlock from "./DicomViewer/hooks/useCornerstonePromptBlock";
  import useViewerReportChat from "./DicomViewer/hooks/useViewerReportChat";
  import useMedSAMSegmentation from "./DicomViewer/hooks/useMedSAMSegmentation";
  import MedSAMSegmentOverlay from "./DicomViewer/components/MedSAMSegmentOverlay";
  import useCornerstoneNiftiControls from "./DicomViewer/nifti/hooks/useCornerstoneNiftiControls";
  import useNiftiVolumeProjection from "./DicomViewer/nifti/hooks/useNiftiVolumeProjection";
  import useNiftiVolumeMprCrosshair from "./DicomViewer/nifti/hooks/useNiftiVolumeMprCrosshair";
  import useNiftiReferenceLinesOverlay from "./DicomViewer/nifti/hooks/useNiftiReferenceLinesOverlay";
  import ThumbnailStrip from "./DicomViewer/components/ThumbnailStrip";
  import useCornerstoneDicomControls from "./DicomViewer/dicom/hooks/useCornerstoneDicomControls";
  import useViewerDataLoader from "./DicomViewer/hooks/useViewerDataLoader";
  import useSeriesGrouping from "./DicomViewer/hooks/useSeriesGrouping";
  import useSeriesThumbnails from "./DicomViewer/hooks/useSeriesThumbnails";
  import SeriesPickerStrip from "./DicomViewer/components/SeriesPickerStrip";
  import useCompareModeLoader from "./DicomViewer/hooks/useCompareModeLoader";
  import useViewerSync from "./DicomViewer/hooks/useViewerSync";
  import useLinkedCrosshair from "./DicomViewer/hooks/useLinkedCrosshair";
  import useLocatorLines from "./DicomViewer/hooks/useLocatorLines";
  import { setSyncMode, setWorldPoint, reset as resetWorldSync } from "./DicomViewer/utils/WorldSyncStore";
  import useVolumeMprCrosshair from "./DicomViewer/hooks/useVolumeMprCrosshair";
  import useVolumeMprLoader from "./DicomViewer/hooks/useVolumeMprLoader";
  import useVolumeSliceLoader, { VOL_MIP_VIEWPORT_ID } from "./DicomViewer/dicom/hooks/useVolumeSliceLoader";
  import useVolumeProjection from "./DicomViewer/dicom/hooks/useVolumeProjection";
  import {
    PROJECTION_MODES,
    SLAB_THICKNESS_DEFAULT_MM,
    clampSlabThickness,
    DEFAULT_RENDER_QUALITY,
    isCrossPlaneLowRes,
  } from "./DicomViewer/dicom/utils/projectionModes";

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  /* ─── Single-viewport helpers (slice strip + nav button style) ──────────── */
  const _SINGLE_VP_BTN = {
    background: "rgba(17,24,39,0.78)", border: "1px solid #2d3748",
    borderRadius: 6, width: 26, height: 24, padding: 0,
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    color: "#e5e7eb", cursor: "pointer",
  };
  const SingleSliceStrip = React.memo(function SingleSliceStrip({ current, total, onStep }) {
    const trackRef = React.useRef(null);
    if (total <= 1) return null;
    const pct      = ((current - 1) / (total - 1)) * 100;
    const thumbPct = Math.max(3, Math.min(25, (1 / total) * 100));
    const seekTo = (clientY, cur) => {
      if (!trackRef.current) return;
      const rect   = trackRef.current.getBoundingClientRect();
      const ratio  = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      const target = Math.round(ratio * (total - 1)) + 1;
      const delta  = target - cur;
      if (delta !== 0) onStep?.(delta);
    };
    return (
      <div ref={trackRef}
        style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 14,
          background: "rgba(0,0,0,0.38)", zIndex: 36, cursor: "ns-resize",
          borderLeft: "1px solid rgba(255,255,255,0.06)", userSelect: "none" }}
        onPointerDown={(e) => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); seekTo(e.clientY, current); }}
        onPointerMove={(e) => { if (e.buttons !== 1) return; e.stopPropagation(); seekTo(e.clientY, current); }}
        onPointerUp={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom,rgba(255,255,255,0.04),rgba(255,255,255,0.01))", pointerEvents: "none" }} />
        <div style={{ position: "absolute", left: 2, right: 2, top: `${pct}%`,
          transform: "translateY(-50%)", height: `${thumbPct}%`, minHeight: 10,
          background: "#3b82f6", borderRadius: 3, pointerEvents: "none",
          boxShadow: "0 0 0 1px rgba(59,130,246,0.45)", transition: "top 0.04s linear" }} />
      </div>
    );
  });

  export default function DicomViewer() {
    const location = useLocation();
    const navigate = useNavigate();

    const axRef = useRef(null);
    const sagRef = useRef(null);
    const corRef = useRef(null);
    const singleRef = useRef(null);
    // Phase 2: 4th viewport ref, only used in compare2x2 mode
    const compareSlot3Ref = useRef(null);
    // Phase 3: extra refs for grid slots 4+ (e.g. 3x3 = 9 slots). Created
    // lazily inside the grid render so that NxM grids of any reasonable size
    // get a stable ref per slot without us having to declare each one.
    const gridRefsMap = useRef({});
    // Build/get a ref for an arbitrary grid slot index. Slots 0-3 map to the
    // legacy refs so all existing single/triplanar/compare logic keeps working.
    const getOrCreateGridRef = (slot) => {
      if (slot === 0) return axRef;
      if (slot === 1) return sagRef;
      if (slot === 2) return corRef;
      if (slot === 3) return compareSlot3Ref;
      if (!gridRefsMap.current[slot]) {
        gridRefsMap.current[slot] = { current: null };
      }
      return gridRefsMap.current[slot];
    };
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
    // When the report is open, lets the radiologist collapse the DICOM viewer
    // column to zero width (toggled by the edge arrow on the report panel) so the
    // report expands to fill the area. The viewer toolbar/header stays put.
    const [reportViewerCollapsed, setReportViewerCollapsed] = useState(false);
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
    const [showSeriesStrip, setShowSeriesStrip] = useState(true);
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
    // Cross-reference sync (scroll-sync + reference lines) across grid cells.
    const [syncEnabled, setSyncEnabled] = useState(true);
    // Scroll-sync across NIfTI panels.
    const [niftiSyncEnabled, setNiftiSyncEnabled] = useState(true);
    // NIfTI MPR — triplanar layout active flag.
    const [niftiMprActive, setNiftiMprActive] = useState(false);
    // NIfTI 3D Pointer crosshair (canvas overlay, same as DICOM crosshairEnabled/Mode).
    const [niftiCrosshairEnabled, setNiftiCrosshairEnabled] = useState(false);
    const [niftiCrosshairMode, setNiftiCrosshairMode] = useState("line");
    // NIfTI slab projection (MIP / MinIP / Average).
    const [niftiProjectionMode, setNiftiProjectionMode] = useState("none");
    const [niftiSlabThicknessMm, setNiftiSlabThicknessMm] = useState(20);
    const [niftiProjectionReadyToken, setNiftiProjectionReadyToken] = useState(0);
    // Linked crosshair lines — independent on/off from scroll-sync.
    const [crosshairEnabled, setCrosshairEnabled] = useState(true);
    // "line" = crosshair lines + centre circle (current default)
    // "pointer" = centre circle only (no lines); single-click fires anatomy lookup
    const [crosshairMode, setCrosshairMode] = useState("line");

    // Keep WorldSyncStore's syncMode in sync with the toolbar buttons.
    useEffect(() => {
      if (syncEnabled && crosshairEnabled) setSyncMode("full");
      else if (syncEnabled)               setSyncMode("position");
      else if (crosshairEnabled)          setSyncMode("crosshair");
      else                                setSyncMode("off");
    }, [syncEnabled, crosshairEnabled]);

    // Reset world coordinate when the case or file changes (new anatomy).
    useEffect(() => { resetWorldSync(); }, [fileUrl, filename, caseId]);
    // Clear fetched URLs whenever the case changes so stale URLs don't
    // carry over into the next case's series strip.
    useEffect(() => { setFetchedSeriesUrls(null); }, [fileUrl, caseId]);

    const lastAnatomyMsRef = useRef(0); // debounce pointer-mode clicks
    const pointerDownPosRef = useRef({ x: 0, y: 0 }); // drag-distance tracking
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
    const [dicomCrosshairColor] = useState("#3b82f6");
    const [dicomTotalSlices, setDicomTotalSlices] = useState(1);
    // Populated by useViewerDataLoader when it fetches a bulk/api series list.
    // Used to drive useSeriesGrouping for backend-only cases that have no static seriesFiles.
    const [fetchedSeriesUrls, setFetchedSeriesUrls] = useState(null);

    const [dicomFlipH, setDicomFlipH] = useState(false);
    const [dicomOverlayMeta, setDicomOverlayMeta] = useState(null);
    const [dicomFlipV, setDicomFlipV] = useState(false);
    const [niftiFlipH, setNiftiFlipH] = useState(false);
    const [niftiFlipV, setNiftiFlipV] = useState(false);
    /* ─── Series picker (Phase 1) ───────────────────────────────
      `seriesFiles` arrives as a single flat list of DICOM URLs.
      useSeriesGrouping parses headers and groups them by
      SeriesInstanceUID. `currentSeriesUid` selects which group is
      active. When it changes, the memoised `effectiveSeriesFiles`
      below becomes a new array reference, which triggers a full
      teardown + rebuild inside useViewerDataLoader. */
    const [currentSeriesUid, setCurrentSeriesUid] = useState(null);
    const [layoutMode, setLayoutMode] = useState("mpr3"); // Phase 2 will use 'compare2x2'

    // Auto-sync 3D Pointer with MPR: ON when volMpr activates, OFF when it exits.
    // volMip (3D model) is intentionally excluded.
    useEffect(() => {
      if (layoutMode === "volMpr") setCrosshairEnabled(true);
      // mpr3: don't force crosshairs off — user controls via 3D Pointer button
    }, [layoutMode]); // eslint-disable-line react-hooks/exhaustive-deps

    /* ─── Slab projection (MIP / MinIP / Average) state ─────────────
      Operates on the volume MPR (volMpr) viewports only — it needs true 3D
      volume data, not a stack. projectionMode === "none" is plain single-slice
      MPR; "mip"/"minip"/"average" turn on GPU slab projection at slabThicknessMm.
      useVolumeProjection re-applies these to the ax/sag/cor reformats live, and
      mprReadyToken bumps whenever the MPR (re)loads so we re-apply after rebuilds. */
    const [projectionMode, setProjectionMode] = useState(PROJECTION_MODES.NONE);
    const [slabThicknessMm, setSlabThicknessMm] = useState(SLAB_THICKNESS_DEFAULT_MM);
    const [mprReadyToken, setMprReadyToken] = useState(0);
    // Plane shown by the single-pane volume MIP view (layoutMode === "volMip").
    const [volMipPlane, setVolMipPlane] = useState("axial");
    // Render quality (interpolation + sampling density) for the volume views.
    const [renderQuality, setRenderQuality] = useState(DEFAULT_RENDER_QUALITY);
    // Loaded-volume geometry (acquisition plane / isotropy) for radiology-quality
    // defaults + the cross-plane low-resolution warning. Null until a volume loads.
    const [volumeInfo, setVolumeInfo] = useState(null);

    // Latest projection settings exposed to the volume loaders (which run in an
    // effect closure and would otherwise capture stale values) so they can apply
    // MIP/MinIP/Average to freshly built viewports on (re)load.
    const projectionModeRef = useRef(projectionMode);
    const slabThicknessRef = useRef(slabThicknessMm);
    const renderQualityRef = useRef(renderQuality);
    useEffect(() => { projectionModeRef.current = projectionMode; }, [projectionMode]);
    useEffect(() => { slabThicknessRef.current = slabThicknessMm; }, [slabThicknessMm]);
    useEffect(() => { renderQualityRef.current = renderQuality; }, [renderQuality]);
    const getProjection = () => ({
      mode: projectionModeRef.current,
      slabThicknessMm: slabThicknessRef.current,
      quality: renderQualityRef.current,
    });

    const isVolumeLayout = layoutMode === "volMpr" || layoutMode === "volMip";

    // Warn when the current single-pane MIP plane projects across the volume's
    // low-resolution axis (anisotropic series viewed off its acquisition plane).
    const mipLowResWarning =
      layoutMode === "volMip" && projectionMode !== PROJECTION_MODES.NONE
        ? isCrossPlaneLowRes(volMipPlane, volumeInfo)
        : false;

    /* Projection (MIP/MinIP/Average) only exists in the volume layouts. If the
      user leaves them by any path (Grid menu, header "3-up MPR" / "2x2 compare",
      etc.), drop projection back to Off so the toolbar stays truthful and we
      don't try to project onto stack viewports. */
    useEffect(() => {
      if (!isVolumeLayout && projectionMode !== PROJECTION_MODES.NONE) {
        setProjectionMode(PROJECTION_MODES.NONE);
      }
    }, [isVolumeLayout, projectionMode]);

    /* Selecting a projection mode (MIP/MinIP/Avg) implies a VOLUME layout, since
      projection needs 3D data. Default to the single-pane volume view (volMip)
      — "MIP without the 3-up MPR" — unless we're already in the 3-up volMpr,
      which also supports projection. Turning projection Off leaves the layout. */
    const handleProjectionModeChange = (mode) => {
      setProjectionMode(mode);
      if (mode !== PROJECTION_MODES.NONE && !isVolumeLayout) {
        setLayoutMode("volMip");
        setDicomGridSelected(true);
      } else if (mode === PROJECTION_MODES.NONE && layoutMode === "volMip") {
        // Single-pane volume MIP only exists to host a projection. Turning it Off
        // returns to the normal stack 3-up so the Grid / layout controls work
        // again (the 3-up volMpr is a real layout, so it stays put when Off).
        setLayoutMode("mpr3");
      }
    };
    const handleSlabThicknessChange = (mm) => setSlabThicknessMm(clampSlabThickness(mm));

    /* ─── Multi-grid layout computation (Phase 3) ──────────────────
      When the user picks an NxM grid from the toolbar's Grid menu (other
      than 1x1), we treat it like a generalized compare-mode layout: each
      cell gets a different series. Reuses the compare-mode loader.

      - dicomGrid.mode === "grid" with rows*cols > 1 → multi-grid mode (N cells)
      - layoutMode === "compare2x2" → forces 4 slots (existing pill)
      - dicomGrid.mode === "main2"  → existing 3-up MPR (axial/sag/cor)
      - dicomGrid.mode === "grid" 1x1 → single viewport (existing)

      Declared EARLY (right after layoutMode) so the auto-populate useEffect
      below can reference these in its deps array without hitting a TDZ. */
    const dicomGridCells = dicomGrid?.mode === "1l2r"
      ? 3
      : Math.max(1, (dicomGrid?.rows | 0) * (dicomGrid?.cols | 0));
    const useMultiGrid =
      !isNifti &&
      layoutMode !== "compare2x2" &&
      layoutMode !== "volMpr" &&
      layoutMode !== "volMip" &&
      (dicomGrid?.mode === "grid" || dicomGrid?.mode === "1l2r") &&
      dicomGridCells > 1;
    const effectiveSlotCount =
      layoutMode === "compare2x2" ? 4 :
      layoutMode === "volMip" ? 1 :
      useMultiGrid ? dicomGridCells :
      1;

    // For backend-only cases (GENRAD bulk uploads), seriesFiles is empty but
    // useViewerDataLoader fetches the file list from the API and sets fetchedSeriesUrls.
    // Fall back to that so useSeriesGrouping can parse series headers and populate the strip.
    const effectiveSeriesFilesForGrouping =
      (Array.isArray(seriesFiles) && seriesFiles.length > 1)
        ? seriesFiles
        : (Array.isArray(fetchedSeriesUrls) && fetchedSeriesUrls.length > 1 ? fetchedSeriesUrls : seriesFiles);

    const seriesGrouping = useSeriesGrouping({
      caseId,
      seriesFiles: effectiveSeriesFilesForGrouping,
      enabled: !isNifti && Array.isArray(effectiveSeriesFilesForGrouping) && effectiveSeriesFilesForGrouping.length > 1,
    });
    const mprSeriesList = React.useMemo(() => {
      const list = seriesGrouping.series;
      if (!list || list.length === 0) return [];
      return [...list]
        .filter(s => {
          if (s.isScout) return false;
          const d = (s.seriesDescription || "").toLowerCase();
          if (d.includes("scout") || d.includes("localizer") || d === "loc") return false;
          return Array.isArray(s.urls) && s.urls.length >= 3;
        })
        .map(s => ({ ...s, mprScore: s.urls.length }))
        .sort((a, b) => b.mprScore - a.mprScore);
    }, [seriesGrouping.series]);

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

    // Effective files passed to useViewerDataLoader. ONLY changes during the
    // FIRST load to seed the initial series. After first load, we lock this
    // value — subsequent strip clicks are handled via per-viewport setStack
    // overrides (mprOverride for main2, singleOverride for 1x1) so the engine
    // does NOT tear down and rebuild (which was the cause of the 5+ second
    // strip-click delay).
    const initialSeriesFilesRef = useRef(null);
    const effectiveSeriesFiles = React.useMemo(() => {
      // Once initialized, never change it
      if (initialSeriesFilesRef.current) return initialSeriesFilesRef.current;

      let resolved = seriesFiles;
      if (seriesGrouping.series && currentSeriesUid) {
        const found = seriesGrouping.series.find((s) => s.seriesUid === currentSeriesUid);
        if (found && Array.isArray(found.urls) && found.urls.length > 0) {
          resolved = found.urls;
        }
      }
      initialSeriesFilesRef.current = resolved;
      return resolved;
    }, [seriesGrouping.series, currentSeriesUid, seriesFiles]);

    /* ─── Compare-mode (2x2) state (Phase 2) ────────────────────
      Each of 4 viewports holds a different series. focusedCompareSlot
      is the slot that gets the next tile click. */
    const [compareViewportSeries, setCompareViewportSeries] = useState({
      0: null, 1: null, 2: null, 3: null,
    });
    const [focusedCompareSlot, setFocusedCompareSlot] = useState(0);
    // Per-slot loading state — drives the spinner overlay on each viewport
    // while its stack is being mounted. Stored as a sparse object so it can
    // hold any slot index (multi-grid may have up to N*M slots).
    const [compareSlotLoading, setCompareSlotLoading] = useState({
      0: false, 1: false, 2: false, 3: false,
    });

    // Auto-populate viewports with series when entering a multi-cell layout.
    // - compare2x2: 4 cells, cells get first 4 non-scout series (cell 0 = current)
    // - multi-grid: N cells, cell 0 = currentSeriesUid, cells 1..N-1 = next non-scouts
    // Importantly: any existing slot whose uid is no longer in the non-scout
    // pool (e.g. a scout assigned in a previous session) is EVICTED. This
    // prevents stale scout/report series from carrying over and silently
    // failing in setStack.
    useEffect(() => {
      const isCompare = layoutMode === "compare2x2";
      const isMulti = useMultiGrid;
      if (!isCompare && !isMulti) return;
      if (!seriesGrouping.series || seriesGrouping.series.length === 0) return;

      const slotCount = isCompare ? 4 : dicomGridCells;
      const nonScouts = seriesGrouping.series.filter((s) => !s.isScout);
      const pool = nonScouts.length > 0 ? nonScouts : seriesGrouping.series;
      const validUids = new Set(pool.map((s) => s.seriesUid));

      console.log(
        `[autoPopulate] entry: layoutMode=${layoutMode} useMulti=${isMulti} slotCount=${slotCount} ` +
        `totalSeries=${seriesGrouping.series.length} nonScouts=${nonScouts.length}`
      );
      console.log(
        `[autoPopulate] non-scout pool (${pool.length}):`,
        pool.map((s) => `SE${s.seriesNumber}:${s.seriesDescription}(scout=${s.isScout})`).join(" | ")
      );

      setCompareViewportSeries((prev) => {
        const next = {};
        let changed = false;

        // First pass: KEEP existing valid (non-scout) assignments. Anything
        // pointing to a scout or unknown uid gets evicted.
        const nonScoutUids = new Set(nonScouts.map((s) => s.seriesUid));
        for (let i = 0; i < slotCount; i++) {
          const existing = prev[i];
          if (existing && nonScoutUids.has(existing)) {
            next[i] = existing;
          } else if (existing) {
            changed = true;
            const found = seriesGrouping.series.find((s) => s.seriesUid === existing);
            console.log(
              `[autoPopulate] evicting slot ${i}: ${existing} ` +
              `(SE${found?.seriesNumber}:${found?.seriesDescription} scout=${found?.isScout})`
            );
          }
        }

        // Cell 0 special handling for multi-grid: prefer currentSeriesUid
        // (only if it's a non-scout; otherwise we'd be back-doored into showing scouts).
        if (isMulti && !next[0] && currentSeriesUid && nonScoutUids.has(currentSeriesUid)) {
          next[0] = currentSeriesUid;
          changed = true;
        }

        // Second pass: fill empty slots from non-scouts only, skipping used uids.
        // If non-scouts < slotCount, the remaining slots stay EMPTY (null) —
        // we'd rather show a black/empty cell than a broken scout.
        const used = new Set(Object.values(next));
        let poolIdx = 0;
        for (let i = 0; i < slotCount; i++) {
          if (next[i]) continue;
          while (poolIdx < nonScouts.length) {
            const uid = nonScouts[poolIdx].seriesUid;
            poolIdx++;
            if (!used.has(uid)) {
              next[i] = uid;
              used.add(uid);
              changed = true;
              break;
            }
          }
          // If non-scouts exhausted: as a last resort, repeat the FIRST non-scout
          // so the cell isn't black. (This is preferable to assigning a scout.)
          if (!next[i] && nonScouts.length > 0) {
            next[i] = nonScouts[0].seriesUid;
            changed = true;
          }
        }

        // Detect difference vs prev so we only update when there's a real change
        if (!changed) {
          for (const k of Object.keys(prev)) {
            if (next[k] !== prev[k]) { changed = true; break; }
          }
        }
        if (!changed && Object.keys(prev).length !== Object.keys(next).length) {
          changed = true;
        }
        if (changed) {
          console.log(`[autoPopulate] ${isCompare ? "compare2x2" : "multiGrid"} slots:`, next);
        }
        return changed ? next : prev;
      });
    }, [layoutMode, useMultiGrid, dicomGridCells, seriesGrouping.series, currentSeriesUid]);

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
      setLayoutMode("mpr3");
      setDicomGrid({ rows: 1, cols: 1, mode: "grid" });
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
      // Single-pane volume MIP: one viewport.
      if (layoutMode === "volMip") return [0];
      // Phase 2 (volume MPR): three orthographic reformats.
      if (layoutMode === "volMpr") return [0, 1, 2];
      // Phase 2: compare mode has 4 viewports
      if (layoutMode === "compare2x2") return [0, 1, 2, 3];
      // Phase 3: multi-grid has N viewports = rows * cols
      if (useMultiGrid) {
        return Array.from({ length: effectiveSlotCount }, (_, i) => i);
      }
      const cells = dicomGrid.mode === "main2" ? 3 : Math.max(1, dicomGrid.rows * dicomGrid.cols);
      return Array.from({ length: Math.min(3, cells) }, (_, i) => i);
    };

    const getDicomViewportIdForSlot = (slot) => {
      // Single-pane volume MIP: one dedicated orthographic viewport.
      if (layoutMode === "volMip") return VOL_MIP_VIEWPORT_ID;
      // Phase 2 (volume MPR): dedicated orthographic viewport ids.
      if (layoutMode === "volMpr") return ["MPR_VOL_AX", "MPR_VOL_SAG", "MPR_VOL_COR"][slot];
      // Phase 2/3: compare mode AND multi-grid mode both use the compare engine
      // with COMPARE_SLOT_N viewport ids.
      if (layoutMode === "compare2x2" || useMultiGrid) return `COMPARE_SLOT_${slot}`;
      const multi = isSeries && dicomTotalSlices > 1;
      if (!multi) return "DICOM_SINGLE";
      return `DICOM_SLOT_${slot}`;
    };

    /* Truthful per-slot plane label for the stack ("3-up" / multi-grid) DICOM
      modes. A stack viewport shows its series' images as-stored — it cannot
      reformat — so the label must reflect the ACTUAL acquisition plane of the
      series loaded in that slot (detected from ImageOrientationPatient in
      useSeriesGrouping), not a fixed Axial/Sagittal/Coronal slot assumption.
      Falls back to the static dicomSlotPlanes label when the plane is unknown.
      (volMpr / volMip are true volume reformats and label themselves.) */
    const getDicomSlotPlaneLabel = (slot) => {
      const uid =
        (layoutMode === "mpr3" ? mprViewportSeries : compareViewportSeries)?.[slot] ||
        currentSeriesUid;
      const series = seriesGrouping.series?.find?.((s) => s.seriesUid === uid);
      const plane = series?.plane;
      if (plane === "axial" || plane === "coronal" || plane === "sagittal") return plane;
      if (plane === "oblique") return "oblique";
      return dicomSlotPlanes[slot] || "axial";
    };

    const getActiveDicomViewport = () => {
      const visibleSlots = getVisibleDicomSlots();
      const safeSlot = visibleSlots.includes(activeDicomSlot) ? activeDicomSlot : visibleSlots[0];
      const vpId = getDicomViewportIdForSlot(safeSlot);
      const engine = renderingEngineRef.current;
      return engine?.getViewport?.(vpId) || null;
    };

    // ── Anatomy labeling (idea 1): double-click a diagnostic pane → backend
    //    resolves world→voxel→organ and shows it inside the clicked cell. ──
    const {
      label: anatomyLabel,
      loading: anatomyLoading,
      lookupAt,
    } = useAnatomyLabel(caseId || "default-study");
    const [anatomyNote, setAnatomyNote] = useState(null);
    // Which grid slot the label belongs to, so it renders in THAT cell's corner.
    const [anatomySlot, setAnatomySlot] = useState(0);

    // Per-slot series resolver covering every layout (mirrors the sync-hook
    // lambda, plus the single-pane fallback to currentSeriesUid).
    const regionSeriesUidForSlot = (slot) => {
      if (layoutMode === "mpr3") return mprViewportSeries?.[slot] || currentSeriesUid || null;
      if (layoutMode === "compare2x2" || useMultiGrid) return compareViewportSeries?.[slot] || null;
      return currentSeriesUid || null;
    };

    const handleAnatomyDoubleClick = async (e) => {
      // Pointer mode (DICOM only): debounce so mouseUp and dblclick don't both fire.
      if (isCornerstoneDicom && crosshairMode === "pointer") {
        const now = Date.now();
        if (now - lastAnatomyMsRef.current < 350) return;
        lastAnatomyMsRef.current = now;
      }
      if ((!isCornerstoneDicom && !isCornerstoneNifti) || !caseId) return;

      // Resolve the viewport under the cursor (works on any pane), else active.
      let vp = null;
      const ees = csCore.getEnabledElements?.() || [];
      for (const ee of ees) {
        const r = ee?.viewport?.element?.getBoundingClientRect?.();
        if (r && e.clientX >= r.left && e.clientX <= r.right &&
                e.clientY >= r.top && e.clientY <= r.bottom) {
          vp = ee.viewport;
          break;
        }
      }
      if (!vp) vp = isCornerstoneNifti ? getActiveNiftiViewport() : getActiveDicomViewport();
      if (!vp) return;

      // Slot resolution — NIfTI slots use NIFTI_SLOT_N IDs; DICOM uses its own map.
      let clickedSlot = null;
      if (isCornerstoneNifti) {
        const m = vp.id?.match(/NIFTI_SLOT_(\d+)/);
        clickedSlot = m ? parseInt(m[1]) : null;
      } else {
        clickedSlot = getVisibleDicomSlots().find(
          (s) => getDicomViewportIdForSlot(s) === vp.id
        );
      }
      if (clickedSlot != null) setAnatomySlot(clickedSlot);

      // Scout guard (DICOM only — NIfTI has no scouts).
      if (isCornerstoneDicom) {
        try {
          const slot = clickedSlot;
          const uid = slot != null ? regionSeriesUidForSlot(slot) : null;
          const sObj = uid ? seriesGrouping.series?.find((s) => s.seriesUid === uid) : null;
          const desc = (sObj?.seriesDescription || sObj?.bodyPartExamined || "").toLowerCase();
          if (sObj?.isScout || desc.includes("scout") || desc.includes("localizer") || desc === "loc") {
            setAnatomyNote("Anatomy labels are available on the diagnostic series, not the scout.");
            return;
          }
        } catch (err) { /* fall through to normal lookup */ }
      }

      const canvas = vp.getCanvas?.();
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const canvasX = e.clientX - rect.left;
      const canvasY = e.clientY - rect.top;
      if (canvasX < 0 || canvasY < 0 || canvasX > rect.width || canvasY > rect.height) return;
      const world = vp.canvasToWorld?.([canvasX, canvasY]);
      if (!world || world.length < 3) return;

      setAnatomyNote(null);
      await lookupAt(vp, [canvasX, canvasY]);
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

    /* PACS-style corner annotation: read study/series description straight from
      the active viewport's current DICOM image tags, falling back to the parsed
      series list / case study fields. Recomputed each render, so it stays in
      sync as you scroll slices or switch series. */
    const getSlotAnnotation = (slot) => {
      try {
        const vpId = getDicomViewportIdForSlot(slot);
        const vp = renderingEngineRef.current?.getViewport?.(vpId);
        const imageId = vp?.getCurrentImageId?.() || vp?.getImageIds?.()?.[0] || null;
        const ser = imageId ? csCore.metaData.get("generalSeriesModule", imageId) : null;
        const std = imageId ? csCore.metaData.get("generalStudyModule", imageId) : null;
        const uid =
          layoutMode === "compare2x2" || useMultiGrid
            ? compareViewportSeries?.[slot]
            : mprViewportSeries?.[slot] || currentSeriesUid;
        const grp = seriesGrouping?.series?.find?.((s) => s.seriesUid === uid);
        return {
          studyDescription: std?.studyDescription || study || null,
          seriesDescription: ser?.seriesDescription || grp?.seriesDescription || null,
          seriesNumber: ser?.seriesNumber ?? grp?.seriesNumber ?? null,
          modality: ser?.modality || grp?.modality || caseModality || null,
        };
      } catch {
        return { studyDescription: study || null, modality: caseModality || null };
      }
    };

    const getActiveDicomAnnotation = () => getSlotAnnotation(activeDicomSlot);

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

    // MPR toggle — switches between triplanar (main2) and single-panel layouts.
    // Bumps niftiProjectionReadyToken after layout settles so useNiftiVolumeProjection
    // and useNiftiVolumeMprCrosshair both re-initialize on the fresh viewports.
    const handleNiftiMprToggle = () => {
      if (!niftiMprActive) {
        // Entering MPR: switch to triplanar layout, ensure slot planes are Ax/Sag/Cor
        setNiftiSlotPlanes(["axial", "sagittal", "coronal"]);
        setNiftiGrid({ rows: 2, cols: 2, mode: "main2" });
        setNiftiGridSelected(true);
        setNiftiMprActive(true);
        setNiftiCrosshairEnabled(true);  // auto-enable crosshair like DICOM
        setNiftiCrosshairMode("line");
        // Let the layout rebuild settle before signalling readiness
        setTimeout(() => setNiftiProjectionReadyToken((t) => t + 1), 350);
      } else {
        setNiftiGrid({ rows: 1, cols: 1, mode: "grid" });
        setNiftiMprActive(false);
        setNiftiCrosshairEnabled(false); // disable crosshair when leaving MPR
        setNiftiProjectionMode("none");
      }
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
        let changed = false;
        slots.forEach((slot) => {
          const vp = renderingEngineRef.current?.getViewport?.(`NIFTI_SLOT_${slot}`);
          const idx = Math.max(0, Number(vp?.getSliceIndex?.() ?? 0)) + 1;
          const total = getTotalSlicesForSlot(slot);
          if (!prev[slot] || prev[slot].current !== idx || prev[slot].total !== total) {
            next[slot] = { current: idx, total };
            changed = true;
          }
        });
        // Bail out with the SAME reference when nothing changed so React skips
        // the re-render — some callers invoke this from effects that re-run on
        // every render, and re-rendering here would re-trigger those effects,
        // looping forever ("Maximum update depth exceeded").
        return changed ? next : prev;
      });
    };

    const refreshDicomSliceIndicators = (slots = getVisibleDicomSlots()) => {
      if (!isCornerstoneDicom) return;
      setDicomSliceBySlot((prev) => {
        const next = { ...prev };
        let changed = false;
        slots.forEach((slot) => {
          const vp = renderingEngineRef.current?.getViewport?.(getDicomViewportIdForSlot(slot))
                    ?? renderingEngineRef.current?.getViewport?.("DICOM_SINGLE");
          /* Volume (ORTHOGRAPHIC) viewports reformat the volume, so the number of
            slices along the CURRENT view direction comes from getNumberOfSlices()
            — not the original acquisition imageIds count (which caused the
            "41/38" overflow when reformatting an anisotropic series). Stack
            viewports keep using the image index + imageIds length. */
          const isVolumeVp = vp?.type === "orthographic";
          const vpImageIds = vp?.getImageIds?.();
          const vpStackLen = Array.isArray(vpImageIds) ? vpImageIds.length : 0;
          let idxRaw;
          let total;
          if (isVolumeVp) {
            idxRaw = vp?.getSliceIndex?.() ?? 0;
            const nSlices = vp?.getNumberOfSlices?.();
            total = Math.max(1, Number.isFinite(nSlices) && nSlices > 0 ? nSlices : (vpStackLen || 1));
          } else {
            idxRaw = vp?.getCurrentImageIdIndex?.() ?? vp?.getSliceIndex?.() ?? 0;
            total = Math.max(1, vpStackLen || dicomTotalSlices || 1);
          }
          const idx = Math.min(total, Math.max(0, Number(idxRaw)) + 1);
          if (!prev[slot] || prev[slot].current !== idx || prev[slot].total !== total) {
            next[slot] = { current: idx, total };
            changed = true;
          }
        });
        // Bail out with the SAME reference when nothing changed so React skips
        // the re-render — some callers invoke this from effects that re-run on
        // every render, and re-rendering here would re-trigger those effects,
        // looping forever ("Maximum update depth exceeded").
        return changed ? next : prev;
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
      const crosshairActive = dicomTool === "crosshair" || crosshairEnabled;
      if (annTool !== "select" && !crosshairActive) {
        return;
      }
      const rect = e.currentTarget.getBoundingClientRect();
      const x = Math.max(0, Math.floor(e.clientX - rect.left));
      const y = Math.max(0, Math.floor(e.clientY - rect.top));
      setDicomMouseBySlot((prev) => ({ ...prev, [slot]: { x, y } }));
      if (!crosshairActive) return;
      // Reposition the crosshair only on an actual click/drag (mousedown, or
      // mousemove with the primary button held) — not on plain hover, which
      // fires continuously and would otherwise drag the crosshair around
      // just by moving the cursor over the pane.
      if (e.type === "mousemove" && e.buttons !== 1) return;

      // Project the clicked point into patient (world) space via the source
      // viewport, then re-project that same world point into every other
      // visible viewport's canvas space, so the crosshair lands on the same
      // anatomy in every pane instead of only the pane that was clicked.
      const engine = renderingEngineRef.current;
      const srcVp = engine?.getViewport?.(getDicomViewportIdForSlot(slot));
      const world = srcVp?.canvasToWorld?.([x, y]);
      if (!world) {
        setDicomCrosshairBySlot((prev) => ({ ...prev, [slot]: { x, y } }));
        return;
      }
      setWorldPoint(world, slot);
      const next = { [slot]: { x, y } };
      getVisibleDicomSlots().forEach((s) => {
        if (s === slot) return;
        try {
          const vp = engine?.getViewport?.(getDicomViewportIdForSlot(s));
          const canvasPt = vp?.worldToCanvas?.(world);
          // worldToCanvas can return [NaN, NaN] (rather than throw) when the
          // target pane's camera/plane geometry isn't fully resolved yet — a
          // truthy-array check alone lets that NaN position through, which
          // pins the crosshair off-screen and makes the "opposite" pane look
          // like its pointer never moves. Require finite coordinates.
          if (canvasPt && Number.isFinite(canvasPt[0]) && Number.isFinite(canvasPt[1])) {
            next[s] = { x: Math.round(canvasPt[0]), y: Math.round(canvasPt[1]) };
          }
        } catch {
          // Leave this pane's crosshair at its last known position rather
          // than letting one bad viewport abort the update for every pane.
        }
      });
      setDicomCrosshairBySlot((prev) => ({ ...prev, ...next }));
      // Mirror the same per-slot coordinates into the X/Y readout so every
      // pane's text label matches its crosshair position, not just the
      // clicked pane's.
      setDicomMouseBySlot((prev) => ({ ...prev, ...next }));
    };

    const clearDicomMouseCoords = (slot) => {
      setDicomMouseBySlot((prev) => ({ ...prev, [slot]: { x: null, y: null } }));
    };

    useEffect(() => {
      if (dicomTool === "crosshair" || crosshairEnabled) return;
      setDicomCrosshairBySlot({
        0: { x: null, y: null },
        1: { x: null, y: null },
        2: { x: null, y: null },
      });
    }, [dicomTool, crosshairEnabled]);

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
      scrollCornerstoneNiftiBySlot,
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
      niftiSyncEnabled,
    });

    // NIfTI volume projection (MIP / MinIP / Average).
    useNiftiVolumeProjection({
      enabled: isCornerstoneNifti,
      renderingEngineRef,
      getVisibleNiftiSlots,
      niftiProjectionMode,
      niftiSlabThicknessMm,
      renderQuality: "smooth",
      readyToken: niftiProjectionReadyToken,
    });

    // NIfTI MPR crosshair — IMAIOS-style canvas overlay, mirrors DICOM crosshairEnabled/Mode.
    useNiftiVolumeMprCrosshair({
      enabled: niftiCrosshairEnabled && isCornerstoneNifti,
      mode: niftiCrosshairMode,
      renderingEngineRef,
      refs: [axRef, sagRef, corRef],
      readyToken: niftiProjectionReadyToken,
    });

    // NIfTI reference lines — plane-intersection lines, shown when sync is on.
    const niftiReferenceLinesBySlot = useNiftiReferenceLinesOverlay({
      enabled: isCornerstoneNifti && niftiSyncEnabled && niftiCrosshairMode !== "syncPointer",
      renderingEngineRef,
      refs: [axRef, sagRef, corRef],
      readyToken: niftiProjectionReadyToken,
    });

    const {
      activateCornerstoneDicomTool,
      scrollCornerstoneDicom,
      scrollCornerstoneDicomBySlot,
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
        dicomGridSelected,
        dicomGrid,
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
        // Pass a synthetic layoutMode so useViewerDataLoader treats multi-grid
        // the same as compare2x2 (i.e. bails out and lets useCompareModeLoader
        // own the engine).
        layoutMode: useMultiGrid ? "multiGrid" : layoutMode,
        // Callback: receives the plain URL list when a bulk/api series is fetched.
        // Feeds useSeriesGrouping so the series strip works for backend-only cases.
        setFetchedSeriesUrls,
      });

      /* ─── Compare-mode (2x2) / multi-grid loader (Phase 2-3) ──────
        Activates when layoutMode === "compare2x2" OR when the user picks
        an NxM grid (>1 cells). Manages its own engine + tool group;
        useViewerDataLoader bails while this is active. */
      useCompareModeLoader({
        enabled: (layoutMode === "compare2x2" || useMultiGrid) && !isNifti,
        slotCount: effectiveSlotCount,
        availableSeries: seriesGrouping.series,
        viewportSeriesMap: compareViewportSeries,
        // Refs lookup: slots 0-3 use the legacy refs, 4+ via gridRefsMap
        refs: (() => {
          const m = {};
          for (let i = 0; i < effectiveSlotCount; i++) {
            m[i] = getOrCreateGridRef(i);
          }
          return m;
        })(),
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

      /* ─── Phase 2: volume MPR + linked crosshairs ───────────────
        One series, three orthographic reformats (axial/sagittal/coronal).
        CrosshairsTool links them — drag in any pane recenters all three.
        useViewerDataLoader + useCompareModeLoader both bail while volMpr. */
      useVolumeMprLoader({
        enabled: layoutMode === "volMpr" && !isNifti,
        seriesUid: currentSeriesUid,
        availableSeries: seriesGrouping.series,
        refs: [axRef, sagRef, corRef],
        setError,
        setLoading,
        renderingEngineRef,
        renderingEngineIdRef,
        toolGroupIdRef,
        viewportIdsRef,
        // Apply the active projection on freshly built viewports (defensive: the
        // live useVolumeProjection effect also re-applies on changes).
        getProjection,
        // Bump a token whenever the volume MPR (re)loads so useVolumeProjection
        // re-applies the active MIP/MinIP/Average slab to the fresh viewports.
        onReady: () => {
          setMprReadyToken((t) => t + 1);
          // Seed slice counters after volume loads.
          setTimeout(() => refreshDicomSliceIndicators([0, 1, 2]), 100);
          // Subscribe to volume camera/render events so the slice counter stays
          // live as the user drags the crosshair (which reslices each viewport).
          const engine = renderingEngineRef.current;
          if (!engine) return;
          const vpIds = ["MPR_VOL_AX", "MPR_VOL_SAG", "MPR_VOL_COR"];
          vpIds.forEach((id) => {
            const el = engine.getViewport?.(id)?.element;
            if (!el) return;
            const refresh = () => refreshDicomSliceIndicators([0, 1, 2]);
            ["cornerstoneimagerendered", "cornerstoneVolumeNewImageEvent",
            "cornerstoneCameraModified"].forEach((evt) =>
              el.addEventListener(evt, refresh, { passive: true })
            );
          });
        },
      });

    useVolumeMprCrosshair({
      // In volMpr the crosshair IS the sync — enable when either button is on.
      enabled: layoutMode === "volMpr" && !isNifti && (crosshairEnabled || syncEnabled),
      mode: crosshairMode,
      renderingEngineRef,
      refs: [axRef, sagRef, corRef],
      // Re-attach after every engine rebuild (series switch / re-open MPR).
      readyToken: mprReadyToken,
    });

    // ── Stack DICOM grids (mpr3 / compare2x2 / multi-grid) 3D Pointer:
    // the EXACT same hook/call shape as the volMpr one above — same refs,
    // same "line"/"pointer" mode, same click-drag-reslice behavior — just
    // pointed at this layout's stack viewport ids instead of the volume
    // MPR ids. This is copied from the volMpr call, not a new mechanism.
    const mprPointerSlots3 = (() => {
      const slots = getVisibleDicomSlots();
      if (slots.length >= 3) return slots.slice(0, 3);
      if (slots.length === 2) return [slots[0], slots[1], slots[1]];
      if (slots.length === 1) return [slots[0], slots[0], slots[0]];
      return [0, 1, 2];
    })();
    useVolumeMprCrosshair({
      // Exact same rule as the volMpr call above — layoutMode !== "volMpr"
      // is the only thing that differs, so "off MPR" 3D Pointer turns on
      // under the identical condition MPR uses to turn its own on.
      enabled: layoutMode !== "volMpr" && !isNifti && (crosshairEnabled || syncEnabled),
      mode: crosshairMode,
      renderingEngineRef,
      // The hook itself is untouched — it still hard-requires 3 real slots
      // (same as MPR's fixed axial/sagittal/coronal triplet). A 2-pane
      // compare/grid only has 2 real panes, so pad up to 3 by repeating the
      // last real slot — it resolves to the same real viewport/element MPR
      // itself would resolve, it's just listed twice, satisfying the
      // hook's "all 3 ready" check without changing what the hook does.
      refs: mprPointerSlots3.map((slot) => getOrCreateGridRef(slot)),
      vpIds: mprPointerSlots3.map((slot) => getDicomViewportIdForSlot(slot)),
      readyToken: mprReadyToken,
      // Fallback slice geometry for stack panes (see hook comment) — the
      // same series list + per-slot uid lookup useViewerSync already uses.
      availableSeries: seriesGrouping.series,
      seriesUidForSlot: (slot) => {
        const real = mprPointerSlots3[slot];
        return (layoutMode === "mpr3" ? mprViewportSeries : compareViewportSeries)?.[real] || null;
      },
    });

      /* ─── Single-pane volume MIP (volMip) ───────────────────────
        "MIP without the 3-up MPR": one full-size volume viewport in the chosen
        plane, scroll through it, projection applied. Shares the slab framework
        with the MPR loader. useViewerDataLoader bails in this mode. */
      useVolumeSliceLoader({
        enabled: layoutMode === "volMip" && !isNifti,
        seriesUid: currentSeriesUid,
        availableSeries: seriesGrouping.series,
        containerRef: axRef,
        plane: volMipPlane,
        setError,
        setLoading,
        renderingEngineRef,
        renderingEngineIdRef,
        toolGroupIdRef,
        viewportIdsRef,
        getProjection,
        // Volume geometry → default to acquisition plane + drive the low-res warning.
        onVolumeInfo: (info) => {
          setVolumeInfo(info || null);
          if (info?.acquisitionPlane) setVolMipPlane(info.acquisitionPlane);
        },
        onReady: () => {
          setMprReadyToken((t) => t + 1);
          setTimeout(() => refreshDicomSliceIndicators([0]), 0);
        },
      });

      /* ─── Slab projection: MIP / MinIP / Average ────────────────
        Volume-only. Applies the chosen blend mode + slab thickness (mm) to the
        active volume viewport(s) and recomputes live as the user scrolls (the
        slab clip planes track the camera focal point) or drags the thickness
        control. Covers both the 3-up volMpr and the single-pane volMip. */
      useVolumeProjection({
        enabled: isVolumeLayout && !isNifti,
        renderingEngineRef,
        viewportIds: layoutMode === "volMip"
          ? [VOL_MIP_VIEWPORT_ID]
          : ["MPR_VOL_AX", "MPR_VOL_SAG", "MPR_VOL_COR"],
        projectionMode,
        slabThicknessMm,
        renderQuality,
        readyToken: mprReadyToken,
      });

      /* ─── Cross-reference sync (scroll-sync + reference lines) ───
        Covers mpr3 / compare2x2 / multi-grid — all route through
        getDicomViewportIdForSlot. Disabled in volMpr (crosshairs handle it). */
      useViewerSync({
        enabled: syncEnabled && isCornerstoneDicom && layoutMode !== "volMpr" && getVisibleDicomSlots().length > 1,
        renderingEngineRef,
        toolGroupIdRef,
        visibleSlots: getVisibleDicomSlots(),
        getViewportIdForSlot: getDicomViewportIdForSlot,
        seriesUidForSlot: (slot) =>
          (layoutMode === "mpr3" ? mprViewportSeries : compareViewportSeries)?.[slot] || null,
        availableSeries: seriesGrouping.series,
        activeSlot: activeDicomSlot,
        onAfterSync: refreshDicomSliceIndicators,
      });

      // The 3D Pointer for these stack grids is the useVolumeMprCrosshair
      // call above (same mechanism as volMpr) — no separate useLinkedCrosshair
      // here, so only one system ever draws a crosshair on a given pane.

      // Horos-style locator lines (plane-intersection reference lines).
      // Hidden in "syncPointer" mode: sync works but ref lines are suppressed.
      const { linesByViewport } = useLocatorLines({
        enabled: isCornerstoneDicom && syncEnabled && crosshairMode !== "syncPointer" && layoutMode !== "volMpr",
      });

      // Remap viewportId → slot so CornerstoneDicomGrid doesn't need to know IDs.
      const referenceLinesBySlot = React.useMemo(() => {
        if (!linesByViewport || Object.keys(linesByViewport).length === 0) return {};
        const out = {};
        getVisibleDicomSlots().forEach((slot) => {
          const vpId = getDicomViewportIdForSlot(slot);
          if (linesByViewport[vpId]) out[slot] = linesByViewport[vpId];
        });
        return out;
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [linesByViewport]);

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


        const resolvedUrls = await Promise.all(series.urls.map(async (url) => {
          if (url && (url.includes("X-Amz-Signature") || url.includes("x-amz-signature"))) {
            try { const r = await fetch(url); if (r.ok) return URL.createObjectURL(await r.blob()); } catch {}
          }
          return url;
        }));
        const imageIds = resolvedUrls.map(buildImageId);
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

    /* ─── Single viewport (1×1 grid) override effect ─────────────
      When the user clicks a strip tile in 1×1 grid mode, we want to swap
      the series instantly without tearing down the engine. This effect
      calls setStack directly on the DICOM_SINGLE viewport whenever
      currentSeriesUid changes. */
    const singleMountedUidRef = useRef(null);
    useEffect(() => {
      if (loading) return;
      if (isNifti) return;
      if (layoutMode === "compare2x2" || useMultiGrid) return;
      if (dicomGrid?.mode !== "grid") return;          // only for 1x1 single grid
      if ((dicomGrid?.rows || 1) * (dicomGrid?.cols || 1) !== 1) return;
      if (!currentSeriesUid) return;
      if (!seriesGrouping.series || seriesGrouping.series.length === 0) return;
      if (singleMountedUidRef.current === currentSeriesUid) return;
      const engine = renderingEngineRef.current;
      if (!engine) return;

      let cancelled = false;
      (async () => {
        const series = seriesGrouping.series.find((s) => s.seriesUid === currentSeriesUid);
        if (!series || !Array.isArray(series.urls) || series.urls.length === 0) {
          console.warn("[single-override] series not found for uid:", currentSeriesUid);
          return;
        }
        const vp = engine.getViewport?.("DICOM_SINGLE");
        if (!vp) {
          console.warn("[single-override] DICOM_SINGLE viewport not in engine yet");
          return;
        }

        const resolvedUrls = await Promise.all(series.urls.map(async (url) => {
          if (url && (url.includes("X-Amz-Signature") || url.includes("x-amz-signature"))) {
            try { const r = await fetch(url); if (r.ok) return URL.createObjectURL(await r.blob()); } catch {}
          }
          return url;
        }));
        const imageIds = resolvedUrls.map(buildImageId);
        const midIdx = Math.floor(imageIds.length / 2);
        console.log(
          `[single-override] → ${series.seriesDescription} (${imageIds.length} images)`
        );
        try {
          await vp.setStack(imageIds, midIdx);
          if (cancelled) return;
          try { engine.resize(true, false); } catch {}
          try { vp.resetCamera(); } catch {}
          vp.render();
          singleMountedUidRef.current = currentSeriesUid;
          // Update global slice indicator
          setDicomSliceBySlot?.((prev) => ({
            ...prev,
            0: { current: midIdx + 1, total: imageIds.length },
          }));
          setDicomTotalSlices?.(imageIds.length);
          dicomImageIdsRef.current = imageIds;
          console.log(`[single-override] OK`);
        } catch (e) {
          console.error("[single-override] failed:", e);
        }
      })();
      return () => { cancelled = true; };
    }, [
      loading, isNifti, layoutMode, useMultiGrid,
      dicomGrid?.mode, dicomGrid?.rows, dicomGrid?.cols,
      currentSeriesUid, seriesGrouping.series,
    ]);

    // Reset singleMountedUidRef when case changes
    useEffect(() => {
      singleMountedUidRef.current = null;
    }, [fileUrl, filename]);

    // Attempt to enter fullscreen on first user interaction after openviewer
    const viewerRootRef = useRef(null);
    // Guards the unmount-exit-fullscreen effect below against React 18
    // StrictMode's dev-only double-invoke (mount → cleanup → mount again in
    // the same tick), which was killing the fullscreen entered by the
    // repository's "Open Viewer" click the instant this component mounted.
    const fsExitTimerRef = useRef(null);

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
      console.log('[fs] Dicomviewer MOUNT, document.fullscreenElement=', document.fullscreenElement?.tagName || null);
      const onFsChange = () => {
        console.log('[fs] fullscreenchange event fired, document.fullscreenElement=', document.fullscreenElement?.tagName || null);
        setIsFullscreen(!!document.fullscreenElement);
      };
      document.addEventListener("fullscreenchange", onFsChange);
      return () => document.removeEventListener("fullscreenchange", onFsChange);
    }, []);

    // "Open Viewer" already requests fullscreen inside its own click handler
    // (repository_1.js), which persists across the route change into this
    // component. Don't request it again here on mount — Chrome treats a
    // second fullscreen request in quick succession as suspicious and
    // downgrades the exit hint from a single "press Esc" to a stricter
    // "press and hold Esc" warning. Only fall back to requesting it here if
    // the user lands on this route without having gone through that click
    // (e.g. a direct link), via the first click inside the viewer itself.
    useEffect(() => {
      if (document.fullscreenElement) return;
      const enterOnce = () => {
        const target = viewerRootRef.current;
        if (target?.requestFullscreen && !document.fullscreenElement) {
          target.requestFullscreen().catch(() => {});
        }
        window.removeEventListener("pointerdown", enterOnce, true);
      };
      window.addEventListener("pointerdown", enterOnce, true);
      return () => window.removeEventListener("pointerdown", enterOnce, true);
    }, []);

    // Exit fullscreen when the viewer unmounts (Close / back / any navigation
    // away), so the repository shows in normal mode, not fullscreen.
    //
    // Deferred via setTimeout(0) + cancel-on-remount: StrictMode's dev-only
    // double-invoke runs this cleanup synchronously right before immediately
    // re-running the effect. Without the defer, that phantom "unmount" would
    // exit fullscreen the instant the repository's "Open Viewer" click entered
    // it. A REAL unmount never re-runs the effect, so the timer always fires.
    useEffect(() => {
      if (fsExitTimerRef.current) {
        clearTimeout(fsExitTimerRef.current);
        fsExitTimerRef.current = null;
      }
      return () => {
        fsExitTimerRef.current = setTimeout(() => {
          console.log('[fs] Dicomviewer UNMOUNT cleanup running, fullscreenElement=', document.fullscreenElement?.tagName || null);
          if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
        }, 0);
      };
    }, []);

    useEffect(() => {
      if (!isCornerstoneNifti) return;
      let cancelled = false;
      const ids = [];
      const schedule = (delay) => {
        const id = setTimeout(() => {
          if (cancelled) return;
          rebuildCornerstoneNiftiViewports().catch(() => {}).then(() => {
            setNiftiProjectionReadyToken((t) => t + 1);
          });
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
    }, [isCornerstoneNifti, niftiGrid, niftiPlane, niftiSlotPlanes, showReport, showSidebar, isFullscreen, reportViewerCollapsed]);

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
    }, [isCornerstoneDicom, dicomGrid, dicomSlotPlanes, dicomTotalSlices, showReport, showSidebar, isFullscreen, reportViewerCollapsed]);

    useEffect(() => {
      if (!isCornerstoneDicom) { setDicomOverlayMeta(null); return; }
      const ids = dicomImageIdsRef.current;
      if (!ids || !ids.length) return;
      let cancelled = false;
      readDicomOverlayTags(ids).then((meta) => {
        if (!cancelled) setDicomOverlayMeta(meta);
      });
      return () => { cancelled = true; };
    }, [isCornerstoneDicom, loading]);


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
    }, [isCornerstoneDicom, loading, isSeries, dicomTotalSlices, showReport, showSidebar, isFullscreen, reportViewerCollapsed]);
    const [reportInitialized, setReportInitialized] = useState(false);
    const [reportDirty, setReportDirty] = useState(false);
    
    useEffect(() => {
      if (!showReport) {
        // reset when closing
        setReportInitialized(false);
        setReportViewerCollapsed(false);
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
      layoutMode === "volMpr" ||
      layoutMode === "volMip" ||
      (dicomGrid.mode === "main2" && dicomTotalSlices > 1) ||
      layoutMode === "compare2x2" ||
      useMultiGrid
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

    /* ── Region label + per-cell region map (idea 2) and anatomy text (idea 1).
      Reads BodyPartExamined (0018,0015) off the WADO-parsed dataset (generalSeries
      Module doesn't expose it), falling back to SeriesDescription. Region pills
      show only in 1- and 3-cell layouts. All plain consts — no extra hooks. */
    const activeRegionImageId = (() => {
      if (!isCornerstoneDicom) return null;
      try {
        const vp = renderingEngineRef.current?.getViewport?.(
          getDicomViewportIdForSlot(activeDicomSlot)
        );
        return vp?.getCurrentImageId?.() || dicomImageIdsRef.current?.[0] || null;
      } catch (e) {
        return null;
      }
    })();

    const bodyPartFromImageId = (imageId) => {
      if (!imageId) return null;
      try {
        const uri = imageId.replace(/^wadouri:/, "");
        const ds = cornerstoneWADOImageLoader?.wadouri?.dataSetCacheManager?.get?.(uri);
        const v = ds?.string?.("x00180015");
        return v && v.trim() ? v.trim() : null;
      } catch (e) {
        return null;
      }
    };

    const imageIdForSlot = (slot) => {
      try {
        const vp = renderingEngineRef.current?.getViewport?.(getDicomViewportIdForSlot(slot));
        const cur = vp?.getCurrentImageId?.();
        if (cur) return cur;
      } catch (e) { /* fall back to series url */ }
      const uid = regionSeriesUidForSlot(slot);
      const sObj = seriesGrouping.series?.find((s) => s.seriesUid === uid) || null;
      return sObj?.urls?.length ? buildImageId(sObj.urls[0]) : null;
    };

    const regionLabel = (() => {
      const uid = regionSeriesUidForSlot(activeDicomSlot);
      const sObj = seriesGrouping.series?.find((s) => s.seriesUid === uid) || null;
      const fromTag = bodyPartFromImageId(activeRegionImageId);
      const fromSeries = sObj?.bodyPartExamined || sObj?.seriesDescription || null;
      return fromTag || fromSeries || null;
    })();

    const regionBySlot = (() => {
      const slots = getVisibleDicomSlots();
      if (slots.length !== 1 && slots.length !== 3) return {};
      const out = {};
      slots.forEach((slot) => {
        const uid = regionSeriesUidForSlot(slot);
        const sObj = seriesGrouping.series?.find((s) => s.seriesUid === uid) || null;
        out[slot] =
          bodyPartFromImageId(imageIdForSlot(slot)) ||
          sObj?.bodyPartExamined ||
          sObj?.seriesDescription ||
          null;
      });
      return out;
    })();

    const anatomyText = (anatomyLoading || anatomyLabel || anatomyNote)
      ? (anatomyLoading
          ? "Checking anatomy..."
          : anatomyNote
          ? anatomyNote
          : (typeof anatomyLabel === "string"
              ? anatomyLabel
              : anatomyLabel?.label
                  ? anatomyLabel.label
                  : `No label · ${anatomyLabel?.reason || "?"}` +
                    (anatomyLabel?.voxel ? ` · vox ${anatomyLabel.voxel.join(",")}` : "")))
      : null;

    return (
      <div ref={viewerRootRef} style={{ height: "100vh", width: "100%", background: "#000" }}>
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
                navigate(-1);
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
                <CButton color="light" size="sm" onClick={() => navigate("/radiologist/repository1")} className="mt-3">
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
                    ? (reportViewerCollapsed ? "0px minmax(0,1fr)" : "minmax(0,1fr) 1fr")
                    : showSidebar
                      ? `minmax(0,1fr) ${sidePanelWidth}px`
                      : "1fr",
                  gap: showReport && reportViewerCollapsed ? 0 : 10,
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
                  /* Reserve room on the left for the absolute-positioned series
                    strip (134px wide + 10px inset). When strip is hidden, only
                    reserve 28px for the reopen tab. */
                  paddingLeft: showSeriesStrip ? 144 : 28,
                  boxSizing: "border-box",
                  /* Clip the toolbar/viewports when the column is collapsed to
                    zero width via the report panel's edge arrow. */
                  overflow: showReport && reportViewerCollapsed ? "hidden" : undefined,
                }}>
                  <DicomToolbar
                    showGridMenu={showGridMenu}
                    setShowGridMenu={setShowGridMenu}
                    dicomGridSelected={dicomGridSelected}
                    dicomGrid={dicomGrid}
                    setDicomGrid={setDicomGrid}
                    setDicomGridSelected={setDicomGridSelected}
                    syncEnabled={syncEnabled}
                    setSyncEnabled={setSyncEnabled}
                    crosshairEnabled={crosshairEnabled}
                    setCrosshairEnabled={(updater) => {
                      if (layoutMode === "volMpr") return; // locked ON while MPR is active
                      // Allow crosshairs in mpr3 (stack series) — useLinkedCrosshair handles them
                      setCrosshairEnabled(updater);
                    }}
                    crosshairMode={crosshairMode}
                    setCrosshairMode={setCrosshairMode}
                    layoutMode={layoutMode}
                    setLayoutMode={setLayoutMode}
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
                    onFlipH={flipDicomH}
                    onFlipV={flipDicomV}
                    /* ─ Slab projection: MIP / MinIP / Average ─ */
                    projectionMode={projectionMode}
                    onProjectionModeChange={handleProjectionModeChange}
                    slabThicknessMm={slabThicknessMm}
                    onSlabThicknessChange={handleSlabThicknessChange}
                    volMipPlane={volMipPlane}
                    setVolMipPlane={setVolMipPlane}
                    renderQuality={renderQuality}
                    setRenderQuality={setRenderQuality}
                    isVolumeLayout={isVolumeLayout}
                    mprSeriesList={mprSeriesList}
                    onMprSeriesSelect={(uid) => {
                      if (layoutMode === "volMpr") {
                        // Bounce through mpr3 so React fully unmounts/remounts
                        // the volMpr viewport divs — gives fresh DOM elements to
                        // the new engine (avoids CS3D stale-registration issues).
                        setLayoutMode("mpr3");
                        setCurrentSeriesUid(uid);
                        requestAnimationFrame(() =>
                          requestAnimationFrame(() => {
                            setLayoutMode("volMpr");
                            setDicomGridSelected?.(true);
                          })
                        );
                      } else {
                        setCurrentSeriesUid(uid);
                        setTimeout(() => setLayoutMode("volMpr"), 0);
                        setDicomGridSelected?.(true);
                      }
                    }}
                  />

                  <div
                    onDoubleClick={handleAnatomyDoubleClick}
                    onMouseDown={(e) => {
                      pointerDownPosRef.current = { x: e.clientX, y: e.clientY };
                    }}
                    onMouseUp={(e) => {
                      if (!crosshairEnabled) return;
                      const start = pointerDownPosRef.current;
                      const dist = start
                        ? Math.hypot(e.clientX - start.x, e.clientY - start.y)
                        : 0;
                      // Pointer: fire on any click or drag.
                      // Line:    fire only when the user dragged (> 8 px).
                      const shouldFire =
                        crosshairMode === "pointer" ||
                        (crosshairMode === "line" && dist > 8);
                      if (!shouldFire) return;
                      const now = Date.now();
                      if (now - lastAnatomyMsRef.current < 350) return; // debounce
                      lastAnatomyMsRef.current = now;
                      if (!isCornerstoneDicom || !caseId) return;
                      let vp = null;
                      const ees = csCore.getEnabledElements?.() || [];
                      for (const ee of ees) {
                        const r = ee?.viewport?.element?.getBoundingClientRect?.();
                        if (r && e.clientX >= r.left && e.clientX <= r.right &&
                                e.clientY >= r.top  && e.clientY <= r.bottom) {
                          vp = ee.viewport; break;
                        }
                      }
                      if (!vp) vp = getActiveDicomViewport?.();
                      if (!vp) return;
                      const clickedSlot = getVisibleDicomSlots().find(
                        (s) => getDicomViewportIdForSlot(s) === vp.id
                      );
                      if (clickedSlot != null) setAnatomySlot(clickedSlot);
                      const canvas = vp.getCanvas?.();
                      if (!canvas) return;
                      const rect = canvas.getBoundingClientRect();
                      const cx = e.clientX - rect.left;
                      const cy = e.clientY - rect.top;
                      if (cx < 0 || cy < 0 || cx > rect.width || cy > rect.height) return;
                      setAnatomyNote(null);
                      lookupAt?.(vp, [cx, cy]);
                    }}
                    style={{ position: "relative", flex: 1, minHeight: 0, border: "1px solid #2b2b2b", borderRadius: 12, overflow: "hidden", background: "#000" }}>

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
                        getDicomSlotPlaneLabel={getDicomSlotPlaneLabel}
                        onSliceStep={(slot, delta) => scrollCornerstoneDicomBySlot(slot, delta)}
                        /* ─ volMpr per-cell interaction ──────────── */
                        onVolMprMouseMove={(slot, e) => updateDicomMouseCoords(slot, e)}
                        onVolMprMouseLeave={(slot) => clearDicomMouseCoords(slot)}
                        onVolMprDoubleClick={(slot, e) => {
                          setAnatomySlot(slot);
                          handleAnatomyDoubleClick(e);
                        }}
                        volMprSeries={layoutMode === "volMpr"
                          ? (() => {
                              const s = seriesGrouping.series?.find?.(
                                (x) => x.seriesUid === currentSeriesUid
                              );
                              return s ? {
                                seriesNumber: s.seriesNumber,
                                seriesDescription: s.seriesDescription,
                                modality: s.modality,
                              } : null;
                            })()
                          : null
                        }
                        /* ─ Phase 2 props ───────────────────── */
                        layoutMode={layoutMode}
                        compareSlot3Ref={compareSlot3Ref}
                        compareViewportSeries={compareViewportSeries}
                        availableSeries={seriesGrouping.series}
                        focusedCompareSlot={focusedCompareSlot}
                        setFocusedCompareSlot={setFocusedCompareSlot}
                        compareSlotLoading={compareSlotLoading}
                        /* ─ Phase 3 multi-grid props ─────────── */
                        useMultiGrid={useMultiGrid}
                        multiGridSlotCount={effectiveSlotCount}
                        multiGridRows={dicomGrid?.rows || 1}
                        multiGridCols={dicomGrid?.cols || 1}
                        getOrCreateGridRef={getOrCreateGridRef}
                        /* ─ Single-pane volume MIP ───────────── */
                        volMipPlane={volMipPlane}
                        projectionMode={projectionMode}
                        mipLowResWarning={mipLowResWarning}
                        volumeInfo={volumeInfo}
                        regionBySlot={regionBySlot}
                        anatomySlot={anatomySlot}
                        anatomyText={anatomyText}
                        crosshairMode={crosshairMode}
                        referenceLinesBySlot={referenceLinesBySlot}
                        /* ─ Per-cell PACS overlay ─────────────── */
                        slotAnnotations={(() => {
                          const map = {};
                          getVisibleDicomSlots().forEach((s) => { map[s] = getSlotAnnotation(s); });
                          return map;
                        })()}
                        patientName={patientName}
                        patientAge={patientAge}
                        patientSex={patientSex}
                        caseId={caseId}
                        filename={filename}
                        overlayMeta={dicomOverlayMeta}
                      />
                    ) : (
                      <div ref={singleRef} className="cornerstone3d-viewport" style={{ height: "100%", width: "100%" }} />
                    )}

                    {/* Single-viewport: top-left patient identity */}
                    {!showDicomTriPlanar && (() => {
                      const _m = dicomOverlayMeta || {};
                      const _mono = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", fontSize: 11, lineHeight: 1.65, whiteSpace: "nowrap", textShadow: "0 1px 4px rgba(0,0,0,1), 0 0 10px rgba(0,0,0,0.9)", display: "block", pointerEvents: "none" };
                      const _dim = { ..._mono, color: "#9ca3af" };
                      const _bright = { color: "#e5e7eb" };
                      const _bold = { ..._mono, color: "#e5e7eb", fontWeight: 600 };
                      const _id = _m.patientId || caseId || null;
                      if (!patientName && !_id && !patientAge && !patientSex) return null;
                      return (
                        <div style={{ position: "absolute", top: 6, left: 8, zIndex: 40, display: "flex", flexDirection: "column", pointerEvents: "none" }}>
                          {_id && <span style={_dim}>Patient ID: <span style={_bright}>{_id}</span></span>}
                          {patientName && <span style={_bold}>Patient Name: {patientName}</span>}
                          {patientAge && <span style={_dim}>Age: <span style={_bright}>{patientAge}Y</span></span>}
                          {patientSex && <span style={_dim}>Sex: <span style={_bright}>{patientSex}</span></span>}
                        </div>
                      );
                    })()}

                    {/* Single-viewport: unified top-right — nav bar → plain series info → anatomy */}
                    {!showDicomTriPlanar && (() => {
                      const ann = getActiveDicomAnnotation();
                      const _step = (delta) => scrollCornerstoneDicomBySlot(activeDicomSlot, delta);
                      const infoStyle = { fontSize: 11, color: "#cbd5e1", textAlign: "right", lineHeight: 1.4, pointerEvents: "none", maxWidth: 160 };
                      return (
                        <div style={{ position: "absolute", top: 6, right: 6, zIndex: 40, display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-end" }}>
                          <div style={{ display: "flex", flexDirection: "row", gap: 4, pointerEvents: "auto" }}>
                            <button style={_SINGLE_VP_BTN} title="Previous slice" aria-label="Previous slice" onClick={(e) => { e.stopPropagation(); _step(-1); }}>
                              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M10 4l-4 4 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                            </button>
                            <button style={_SINGLE_VP_BTN} title="Next slice" aria-label="Next slice" onClick={(e) => { e.stopPropagation(); _step(1); }}>
                              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                            </button>
                          </div>
                          {ann && (
                            <div style={infoStyle}>
                              {ann.modality && <div>{ann.modality}</div>}
                              {ann.seriesNumber != null && <div>{`Se: ${ann.seriesNumber}`}</div>}
                              {ann.studyDescription && <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ann.studyDescription}</div>}
                              {ann.seriesDescription && <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ann.seriesDescription}</div>}
                              {dicomOverlayMeta?.bodyPart && <div>{`Body Part: ${dicomOverlayMeta.bodyPart}`}</div>}
                              {dicomOverlayMeta?.projection && <div>{`Projection: ${dicomOverlayMeta.projection}`}</div>}
                            </div>
                          )}
                          {anatomyText && <div style={{ ...infoStyle, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{anatomyText}</div>}
                        </div>
                      );
                    })()}

                    {/* Single-viewport: bottom-left — study info + slices */}
                    {!showDicomTriPlanar && (() => {
                      const _m = dicomOverlayMeta || {};
                      const _mono = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", fontSize: 11, lineHeight: 1.65, whiteSpace: "nowrap", textShadow: "0 1px 4px rgba(0,0,0,1), 0 0 10px rgba(0,0,0,0.9)", display: "block", pointerEvents: "none" };
                      const _dim = { ..._mono, color: "#9ca3af" };
                      const _bright = { color: "#e5e7eb" };
                      return (
                        <div style={{ position: "absolute", left: 8, bottom: 6, zIndex: 30, display: "flex", flexDirection: "column", pointerEvents: "none" }}>
                          {_m.studyDate && <span style={_dim}>Study Date: <span style={_bright}>{_m.studyDate}</span></span>}
                          {_m.studyTime && <span style={_dim}>Study Time: <span style={_bright}>{_m.studyTime}</span></span>}
                          {_m.institutionName && <span style={_dim}>Institution Name: <span style={_bright}>{_m.institutionName}</span></span>}
                          {_m.institutionAddress && <span style={{ ..._mono, fontSize: 10, color: "#9ca3af" }}>Institution Residence: <span style={_bright}>{_m.institutionAddress}</span></span>}
                          <span style={{ ..._mono, color: "#cbd5e1", marginTop: 2 }}>{`Slices: ${dicomSliceBySlot[activeDicomSlot]?.current ?? 1}/${dicomSliceBySlot[activeDicomSlot]?.total ?? 1}`}</span>
                          <span style={{ ..._mono, color: "#cbd5e1" }}>{`X:${dicomMouseBySlot[activeDicomSlot]?.x ?? "-"} Y:${dicomMouseBySlot[activeDicomSlot]?.y ?? "-"}`}</span>
                        </div>
                      );
                    })()}

                    {/* Single-viewport: bottom-right — exposure params */}
                    {!showDicomTriPlanar && (() => {
                      const _m = dicomOverlayMeta || {};
                      const _mono = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", fontSize: 11, lineHeight: 1.65, whiteSpace: "nowrap", textShadow: "0 1px 4px rgba(0,0,0,1), 0 0 10px rgba(0,0,0,0.9)", display: "block", pointerEvents: "none" };
                      const _dim = { ..._mono, color: "#9ca3af", textAlign: "right" };
                      const _bright = { color: "#e5e7eb" };
                      if (!_m.kvp && !_m.ma && !_m.msec && !_m.mas && !_m.ei) return null;
                      return (
                        <div style={{ position: "absolute", right: 8, bottom: 6, zIndex: 30, display: "flex", flexDirection: "column", alignItems: "flex-end", pointerEvents: "none" }}>
                          {_m.kvp  && <span style={_dim}>kVp: <span style={_bright}>{_m.kvp}</span></span>}
                          {_m.ma   && <span style={_dim}>mA: <span style={_bright}>{_m.ma}</span></span>}
                          {_m.msec && <span style={_dim}>mSec: <span style={_bright}>{_m.msec}</span></span>}
                          {_m.mas  && <span style={_dim}>mAs: <span style={_bright}>{_m.mas}</span></span>}
                          {_m.ei   && <span style={_dim}>E.I: <span style={_bright}>{_m.ei}</span></span>}
                        </div>
                      );
                    })()}
                    {/* Single-viewport: vertical slice scroll strip */}
                    {!showDicomTriPlanar && (
                      <SingleSliceStrip
                        current={dicomSliceBySlot[activeDicomSlot]?.current ?? 1}
                        total={dicomSliceBySlot[activeDicomSlot]?.total ?? 1}
                        onStep={(delta) => scrollCornerstoneDicomBySlot(activeDicomSlot, delta)}
                      />
                    )}


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
                  reportViewerCollapsed={reportViewerCollapsed}
                  setReportViewerCollapsed={setReportViewerCollapsed}
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
                
                
                  
                

                
                  onRequestFullscreen={() => viewerRootRef.current?.requestFullscreen?.().catch(() => {})}
                />
              </div>
            )}

            {/* NIfTI tri-planar view */}
            {isNifti && (showNiftiTriPlanar || isCornerstoneNifti) && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: showReport
                    ? (reportViewerCollapsed ? "0px minmax(0,1fr)" : "minmax(0,1fr) 1fr")
                    : showSidebar
                      ? `minmax(0,1fr) ${sidePanelWidth}px`
                      : "1fr",
                  gap: showReport && reportViewerCollapsed ? 0 : 10,
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
                    onFlipH={flipNiftiH}
                    onFlipV={flipNiftiV}
                    niftiSyncEnabled={niftiSyncEnabled}
                    setNiftiSyncEnabled={setNiftiSyncEnabled}
                    niftiCrosshairEnabled={niftiCrosshairEnabled}
                    setNiftiCrosshairEnabled={(updater) => {
                      if (niftiMprActive) return; // locked ON while NIfTI MPR is active
                      setNiftiCrosshairEnabled(updater);
                    }}
                    niftiCrosshairMode={niftiCrosshairMode}
                    setNiftiCrosshairMode={setNiftiCrosshairMode}
                    niftiMprActive={niftiMprActive}
                    onNiftiMprToggle={handleNiftiMprToggle}
                    niftiProjectionMode={niftiProjectionMode}
                    onNiftiProjectionModeChange={setNiftiProjectionMode}
                    niftiSlabThicknessMm={niftiSlabThicknessMm}
                    onNiftiSlabThicknessChange={setNiftiSlabThicknessMm}
                  />

                  {/* Viewer — flex:1, fully below the slice row, never overlapping */}
                  <div ref={niftiContainerRef} style={{ position: "relative", flex: 1, minHeight: 0, border: "1px solid #2b2b2b", borderRadius: 12, overflow: "hidden", background: "#000" }}>
                    <ViewerImageOverlay
                      modality="NIfTI"
                      plane={isCornerstoneNifti ? niftiSlotPlanes[activeNiftiSlot] : niftiPlane}
                      sliceCurrent={niftiSliceBySlot[activeNiftiSlot]?.current}
                      sliceTotal={niftiSliceBySlot[activeNiftiSlot]?.total}
                    />




                    {/* Minimap (visible only when zoomed) */}
                    {isCornerstoneNifti && (
                      <Minimap
                        renderingEngine={renderingEngineRef.current}
                        viewportId={`NIFTI_SLOT_${activeNiftiSlot}`}
                      />
                    )}

                    {/* Slice navigator strip */}
                    {isCornerstoneNifti && (
                      <ThumbnailStrip
                        totalSlices={niftiSliceBySlot[activeNiftiSlot]?.total}
                        currentSlice={(niftiSliceBySlot[activeNiftiSlot]?.current ?? 1) - 1}
                        renderingEngine={renderingEngineRef.current}
                        viewportId={`NIFTI_SLOT_${activeNiftiSlot}`}
                        onSliceClick={(idx) => {
                          try {
                            const vp = renderingEngineRef.current?.getViewport?.(`NIFTI_SLOT_${activeNiftiSlot}`);
                            if (!vp) return;
                            const cur = (niftiSliceBySlot[activeNiftiSlot]?.current ?? 1) - 1;
                            const delta = idx - cur;
                            if (delta !== 0 && vp.scroll) {
                              vp.scroll(delta);
                              vp.render?.();
                            }
                            refreshNiftiSliceIndicators?.([activeNiftiSlot]);
                          } catch {}
                        }}
                      />
                    )}

                  {/* Grid views */}
                  {isCornerstoneNifti && (
                    <div
                      style={{ width: "100%", height: "100%", position: "relative" }}
                      onDoubleClick={handleAnatomyDoubleClick}
                      onMouseDown={(e) => {
                        pointerDownPosRef.current = { x: e.clientX, y: e.clientY };
                      }}
                      onMouseUp={(e) => {
                        // Drag (>8 px) fires anatomy label in NIfTI mode
                        const start = pointerDownPosRef.current;
                        const dist = start
                          ? Math.hypot(e.clientX - start.x, e.clientY - start.y)
                          : 0;
                        if (dist <= 8) return;
                        const now = Date.now();
                        if (now - lastAnatomyMsRef.current < 350) return;
                        lastAnatomyMsRef.current = now;
                        if (!isCornerstoneNifti || !caseId) return;
                        let vp = null;
                        const ees = csCore.getEnabledElements?.() || [];
                        for (const ee of ees) {
                          const r = ee?.viewport?.element?.getBoundingClientRect?.();
                          if (r && e.clientX >= r.left && e.clientX <= r.right &&
                                  e.clientY >= r.top && e.clientY <= r.bottom) {
                            vp = ee.viewport; break;
                          }
                        }
                        if (!vp) vp = getActiveNiftiViewport?.();
                        if (!vp) return;
                        const m = vp.id?.match(/NIFTI_SLOT_(\d+)/);
                        const clickedSlot = m ? parseInt(m[1]) : null;
                        if (clickedSlot != null) setAnatomySlot(clickedSlot);
                        const canvas = vp.getCanvas?.();
                        if (!canvas) return;
                        const rect = canvas.getBoundingClientRect();
                        const cx = e.clientX - rect.left;
                        const cy = e.clientY - rect.top;
                        if (cx < 0 || cy < 0 || cx > rect.width || cy > rect.height) return;
                        setAnatomyNote(null);
                        lookupAt?.(vp, [cx, cy]);
                      }}
                    >
                    <CornerstoneNiftiGrid
                      niftiGrid={niftiGrid}
                      activeNiftiSlot={activeNiftiSlot}
                      setActiveNiftiSlot={setActiveNiftiSlot}
                      axRef={axRef}
                      sagRef={sagRef}
                      corRef={corRef}
                      referenceLinesBySlot={niftiReferenceLinesBySlot}
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
                      anatomySlot={anatomySlot}
                      anatomyText={anatomyText}
                      onSliceStep={(slot, delta) => {
                        if (niftiSyncEnabled) {
                          getVisibleNiftiSlots().forEach((s) => scrollCornerstoneNiftiBySlot(s, delta));
                        } else {
                          scrollCornerstoneNiftiBySlot(slot, delta);
                        }
                      }}
                    />
                    </div>
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
                      onSliceStep={(plane, delta) => {
                        if (!niftiVol) return;
                        if (plane === "axial") {
                          setNzIndex((z) => Math.max(0, Math.min((niftiVol.d || 1) - 1, z + delta)));
                        } else if (plane === "sagittal") {
                          setNxIndex((x) => Math.max(0, Math.min((niftiVol.w || 1) - 1, x + delta)));
                        } else if (plane === "coronal") {
                          setNyIndex((y) => Math.max(0, Math.min((niftiVol.h || 1) - 1, y + delta)));
                        }
                      }}
                    />
                  )}

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
                  </div>{/* end niftiContainerRef */}

                  {/* Series picker moved to CCardBody level — see the
                    absolute-positioned strip near the close of CCardBody. */}
                </div>

                <ViewerSidePanel
                  showReport={showReport}
                  showSidebar={showSidebar}
                  setShowSidebar={setShowSidebar}
                  setShowReport={setShowReport}
                  reportViewerCollapsed={reportViewerCollapsed}
                  setReportViewerCollapsed={setReportViewerCollapsed}
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
                  onRequestFullscreen={() => viewerRootRef.current?.requestFullscreen?.().catch(() => {})}
                />
              </div>
            )}

            {/* ─── Series picker (left strip) ─────────────────────────── */}
            {!isNifti && (showReport && reportViewerCollapsed ? null : (
              <>
                {/* Collapsed reopen tab */}
                {!showSeriesStrip && (
                  <div style={{
                    position: "absolute",
                    top: 10,
                    left: 10,
                    bottom: 10,
                    width: 18,
                    zIndex: 51,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}>
                    <button
                      onClick={() => setShowSeriesStrip(true)}
                      title="Show series"
                      style={{
                        background: "#0e1520",
                        border: "1px solid #1e2a3a",
                        borderRadius: "0 6px 6px 0",
                        color: "#60a5fa",
                        width: 18,
                        padding: "14px 2px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 14,
                        lineHeight: 1,
                      }}
                    >
                      ›
                    </button>
                  </div>
                )}
                {/* Strip panel */}
                {showSeriesStrip && (
              <div
                style={{
                  position: "absolute",
                  top: 10,
                  left: 10,
                  bottom: 10,
                  zIndex: 50,
                }}
              >
                <SeriesPickerStrip
                  series={seriesGrouping.series}
                  thumbs={seriesThumbs}
                  activeSeriesUid={
                    // For multi-cell layouts (compare/multi-grid), activeSeriesUid
                    // is null because viewportSeriesMap drives the colored rings.
                    // For 3-up MPR (main2), use the focused viewport's series.
                    // For 1x1 single grid, use currentSeriesUid so the tile gets
                    // the blue selected ring.
                    (layoutMode === "compare2x2" || useMultiGrid)
                      ? null
                      : (layoutMode === "volMpr" || layoutMode === "volMip")
                        ? currentSeriesUid   // volume layouts: one series
                        : dicomGrid?.mode === "main2"
                          ? (mprViewportSeries[activeDicomSlot] || currentSeriesUid)
                          : currentSeriesUid   // single 1x1 grid
                  }
                  viewportSeriesMap={
                    (layoutMode === "compare2x2" || useMultiGrid) ? compareViewportSeries
                    : (layoutMode === "volMpr" || layoutMode === "volMip") ? null
                    : dicomGrid?.mode === "main2" ? mprViewportSeries
                    : null
                  }
                  loading={seriesGrouping.loading}
                  progress={seriesGrouping.progress}
                  forceShow={true}
                  onClose={() => setShowSeriesStrip(false)}
                  onSelectSeries={(uid) => {
                    if (!uid) return;
                    if (layoutMode === "compare2x2" || useMultiGrid) {
                      const targetSlot = useMultiGrid
                        ? activeDicomSlot
                        : focusedCompareSlot;
                      setCompareViewportSeries((prev) => {
                        if (prev[targetSlot] === uid) return prev;
                        return { ...prev, [targetSlot]: uid };
                      });
                      return;
                    }

                    /* Volume layouts (3-up volMpr / single-pane volMip) reformat
                      ONE series, driven by currentSeriesUid. Must be checked
                      BEFORE the dicomGrid.mode === "main2" branch, because
                      dicomGrid.mode is often still "main2" while in a volume
                      layout — otherwise series clicks route to mprViewportSeries
                      (which the volume loaders ignore) and nothing changes. */
                    if (layoutMode === "volMpr" || layoutMode === "volMip") {
                      if (uid !== currentSeriesUid) setCurrentSeriesUid(uid);
                      return;
                    }

                    /* 3-up MPR (main2): update only the focused viewport via
                      mprViewportSeries — the MPR override effect calls setStack
                      on that one. */
                    if (dicomGrid?.mode === "main2") {
                      setMprViewportSeries((prev) => {
                        if (prev[activeDicomSlot] === uid) return prev;
                        return { ...prev, [activeDicomSlot]: uid };
                      });
                      return;
                    }

                    /* Single viewport (1x1 grid). */
                    if (uid !== currentSeriesUid) {
                      setCurrentSeriesUid(uid);
                    }
                  }}
                />
              </div>
                )}
              </>
            ))}
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
                    navigate(-1);
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
                      navigate(-1);
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
