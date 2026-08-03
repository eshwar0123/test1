import { useEffect, useRef } from "react";
import * as csCore from "@cornerstonejs/core";
import {
  ToolGroupManager,
  Enums as ToolsEnums,
  WindowLevelTool,
  PanTool,
  ZoomTool,
  StackScrollTool,
  LengthTool,
  RectangleROITool,
  CircleROITool,
  PlanarFreehandROITool,
  ArrowAnnotateTool,
} from "@cornerstonejs/tools";
import { createNiftiImageIdsAndCacheMetadata } from "@cornerstonejs/nifti-volume-loader";
import { initCornerstoneOnce } from "./useCornerstoneInit";
import { getFile } from "../../fileStore";

/**
 * If fileUrl is a local-file key (from the file store), retrieve the File
 * and create a blob URL. The blob URL is cached per key so React Strict Mode
 * re-invocations reuse the same URL instead of creating (and invalidating) new ones.
 */
const blobUrlCache = new Map();
const resolveFileUrl = async (fileUrl) => {
  if (fileUrl && fileUrl.startsWith("local-file-")) {
    // Return cached blob URL if we already created one for this key
    if (blobUrlCache.has(fileUrl)) {
      return { url: blobUrlCache.get(fileUrl), blobUrl: null };
    }
    const file = await getFile(fileUrl);
    if (file) {
      const blobUrl = URL.createObjectURL(file);
      blobUrlCache.set(fileUrl, blobUrl);
      return { url: blobUrl, blobUrl: null };
    }
    return { url: null, blobUrl: null, missingLocalFile: true };
  }
  return { url: fileUrl, blobUrl: null };
};

const safeAddTool = (toolGroup, toolName, options) => {
  try {
    toolGroup.addTool(toolName, options);
  } catch (e) {
    const msg = String(e?.message || e || "");
    if (!msg.includes("already registered")) {
      throw e;
    }
  }
};

const buildNiftiUrlCandidates = (rawUrl, getAbsoluteUrl) => {
  const set = new Set();
  // Blob URLs (local file uploads) — use directly
  if (rawUrl && rawUrl.startsWith("blob:")) { return [rawUrl]; }
  const abs = getAbsoluteUrl(rawUrl);
  if (abs) set.add(abs);
  if (rawUrl && rawUrl.startsWith("http")) set.add(rawUrl);

  // Backward-compat fallback:
  // some historical DB rows include case-id prefixed NIfTI names that no longer
  // exist on disk, while the underlying file is stored without that prefix.
  const pick = abs || rawUrl;
  if (pick) {
    try {
      const u = new URL(pick, window.location.origin);
      const m = u.pathname.match(/^\/uploads\/nii\/CASE-\d{8}-\d+_(.+\.nii(?:\.gz)?)$/i);
      if (m?.[1]) {
        u.pathname = `/uploads/nii/${m[1]}`;
        set.add(u.toString());
      }
    } catch {
      // ignore malformed URL and keep primary candidate(s)
    }
  }

  return Array.from(set);
};


const buildDicomUrlCandidates = (rawUrl, getAbsoluteUrl) => {
  const set = new Set();
  // Blob URLs (local file uploads) — use directly
  if (rawUrl && rawUrl.startsWith("blob:")) { return [rawUrl]; }
  const abs = getAbsoluteUrl(rawUrl);
  if (abs) set.add(abs);
  if (rawUrl && rawUrl.startsWith("http")) set.add(rawUrl);

  const pick = abs || rawUrl;
  if (pick) {
    try {
      const u = new URL(pick, window.location.origin);
      const m = u.pathname.match(/^\/uploads\/dicom-file\/CASE-\d{8}-\d+_(.+\.dcm)$/i);
      if (m?.[1]) {
        u.pathname = `/uploads/dicom-file/${m[1]}`;
        set.add(u.toString());
      }
    } catch {
      // ignore malformed URL and keep primary candidate(s)
    }
  }

  return Array.from(set);
};
const findReachableUrl = async (urls) => {
  let firstErr = null;
  for (const url of urls) {
    // Blob URLs are always reachable (local browser memory)
    if (url.startsWith("blob:")) return url;
    // S3 presigned URLs — skip HEAD (returns 403); valid by construction
    if (url.includes("X-Amz-Signature") || url.includes("x-amz-signature")) return url;
    // S3 presigned URLs — skip HEAD (returns 403); valid by construction
    if (url.includes("X-Amz-Signature") || url.includes("x-amz-signature")) return url;
    try {
      const res = await fetch(url, { method: "HEAD" });
      if (res.ok) return url;
      if (res.status !== 404 && !firstErr) {
        firstErr = new Error(`Unable to access file (${res.status})`);
      }
    } catch (e) {
      if (!firstErr) firstErr = e;
    }
  }
  throw firstErr || new Error("Requested scan file was not found (404).");
};

const withTimeout = (promise, ms, label) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);

const maybeWithTimeout = (promise, ms, label) => {
  if (!ms || ms <= 0) return promise;
  return withTimeout(promise, ms, label);
};

export default function useViewerDataLoader({
  fileUrl,
  filename,
  seriesFiles,
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
  dicomGridSelected,         // current selection flag — guards auto main2-switch
  dicomGrid,                 // current grid layout — used to keep engine setup matching
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
  // ── Phase 2 addition ─────────────────────────────
  // When 'compare2x2', useCompareModeLoader owns the engine.
  // This hook bails so the two don't fight for the same DOM refs.
  layoutMode = "mpr3",
  // Called with the resolved plain URL list when files are fetched from the
  // backend (bulk-series / dicom-series endpoints) so the caller can pass them
  // to useSeriesGrouping (which needs plain URLs, not wadouri: imageIds).
  setFetchedSeriesUrls,
}) {
  /* Keep a ref to dicomGridSelected so the run() async closure always reads
     the CURRENT value, not the value captured when the effect last set up.
     Without this, the guard against re-switching to 3-up MPR on strip clicks
     never fires because the closure sees the initial false. */
  const dicomGridSelectedRef = useRef(dicomGridSelected);
  useEffect(() => {
    dicomGridSelectedRef.current = dicomGridSelected;
  }, [dicomGridSelected]);

  /* Tracks whether the viewer has completed at least one successful series
     load. After the first load, ALL subsequent reloads (triggered by strip
     clicks, series switches, etc.) should respect the user's current grid
     choice and NEVER auto-switch back to 3-up MPR. This is a stronger guard
     than dicomGridSelected because it doesn't depend on the user explicitly
     touching the Grid menu. */
  const hasLoadedOnceRef = useRef(false);

  /* Ref for dicomGrid so the async run() closure always sees the latest
     layout choice (not the closure-captured initial value). */
  const dicomGridRef = useRef(dicomGrid);
  useEffect(() => {
    dicomGridRef.current = dicomGrid;
  }, [dicomGrid]);

  useEffect(() => {
    let syntheticMetaProvider = null;
    let cancelled = false;
    let localEngine = null;
    let localToolGroupId = null;
    let createdBlobUrl = null; // track so we can revoke on cleanup

    // Phase 2/3: compare, multi-grid, and volume modes are owned by their own
    // loaders. We do nothing here so we don't double-init on the same DOM refs.
    // volMpr is critical: when that layout is active the mpr3 stack viewports
    // are unmounted, so any attempt to run here throws "Viewport size is 0".
    if (layoutMode === "compare2x2" || layoutMode === "multiGrid" || layoutMode === "volMip" || layoutMode === "volMpr") {
      setLoading(false);
      return;
    }

    if (!fileUrl) {
      setError("No file specified. Please return to the repository.");
      setLoading(false);
      return;
    }

    const run = async () => {
      try {
        // If seriesFiles are provided, we don't need to resolve fileUrl —
        // the actual DICOM slice URLs come from seriesFiles directly.
        const hasLocalSeries = Array.isArray(seriesFiles) && seriesFiles.length > 0;
        let resolvedFileUrl = fileUrl;
        let createdBlobUrlInner = null;

        if (!hasLocalSeries) {
          const resolved = await resolveFileUrl(fileUrl);
          resolvedFileUrl = resolved.url;
          createdBlobUrlInner = resolved.blobUrl;
          createdBlobUrl = createdBlobUrlInner;

          if (!resolvedFileUrl) {
            setError(
              resolved.missingLocalFile
                ? "Local uploaded file is no longer available in this browser. Please upload it again."
                : "File not found. The uploaded file may have been cleared. Please re-upload."
            );
            setLoading(false);
            return;
          }
        } else {
          // For local series, use a placeholder so downstream code doesn't break
          resolvedFileUrl = fileUrl || "local-series";
        }

        const rawLower = (resolvedFileUrl || "").toLowerCase();
        const rawPath  = rawLower.split("?")[0];
        const nameLower = (filename || "").toLowerCase();
        const nifti =
          rawPath.endsWith(".nii") ||
          rawPath.endsWith(".nii.gz") ||
          nameLower.endsWith(".nii") ||
          nameLower.endsWith(".nii.gz");

        setIsNifti(nifti);
        setIsCornerstoneNifti(nifti);
        setIsCornerstoneDicom(!nifti);

        // Tear down any previous engine/toolgroup before creating a new one.
        try {
          const prevToolGroupId = toolGroupIdRef.current;
          if (prevToolGroupId) ToolGroupManager.destroyToolGroup(prevToolGroupId);
        } catch {}
        try {
          renderingEngineRef.current?.destroy();
        } catch {}
        renderingEngineRef.current = null;

        setLoading(true);
        setError(null);

        // Give the DOM time to paint before Cornerstone measures viewport sizes.
        // This is critical for local files where URL resolution is instant.
        await new Promise((r) => setTimeout(r, 800));
        if (cancelled) return;

        await initCornerstoneOnce();
        if (cancelled) return;

        const renderingEngineId = `engine_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const toolGroupId = `tools_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        renderingEngineIdRef.current = renderingEngineId;
        toolGroupIdRef.current = toolGroupId;
        localToolGroupId = toolGroupId;

        const engine = new csCore.RenderingEngine(renderingEngineId);
        localEngine = engine;
        renderingEngineRef.current = engine;

        if (nifti) {
          setIsSeries(true);
          setNiftiGrid({ rows: 2, cols: 2, mode: "main2" });
          setNiftiGridSelected(true);
          setNiftiSlotPlanes(["axial", "sagittal", "coronal"]);
          setActiveNiftiSlot(0);
          setDicomGrid({ rows: 1, cols: 1, mode: "grid" });
          setDicomGridSelected(false);
          setDicomSlotPlanes(["axial", "sagittal", "coronal"]);
          setActiveDicomSlot(0);
          setDicomTotalSlices(1);
          dicomImageIdsRef.current = [];

          // Wait for React to commit the grid layout and the browser to paint
          await new Promise((r) => setTimeout(r, 500));
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve))
          );
          if (cancelled) return;
          const ok = await waitForElementsReady([axRef.current, sagRef.current, corRef.current]);
          if (!ok) throw new Error("Viewport size is 0 (layout not ready).");

          const niftiCandidates = buildNiftiUrlCandidates(resolvedFileUrl, getAbsoluteUrl);
          const resolvedNiftiUrl = await findReachableUrl(niftiCandidates);

          // ── S3 presigned URL: fetch ourselves → blob URL ────────────────
          // Cornerstone's nifti-volume-loader uses internal XHR which may add
          // Authorization headers — S3 rejects requests with both URL signature
          // AND auth header (400 Bad Request). Fetching first and passing a
          // blob: URL bypasses this entirely.
          let niftiLoadUrl = resolvedNiftiUrl;
          if (resolvedNiftiUrl.includes("X-Amz-Signature") ||
              resolvedNiftiUrl.includes("x-amz-signature")) {
            try {
              const niftiResp = await fetch(resolvedNiftiUrl);
              if (!niftiResp.ok) throw new Error(`S3 fetch ${niftiResp.status}`);
              const niftiBlob = await niftiResp.blob();
              niftiLoadUrl = URL.createObjectURL(niftiBlob);
            } catch (blobErr) {
              console.warn("[useViewerDataLoader] blob fetch failed, using URL directly:", blobErr);
              niftiLoadUrl = resolvedNiftiUrl;
            }
          }

          const imageIds = await createNiftiImageIdsAndCacheMetadata({
            url: niftiLoadUrl,
          });
          if (!imageIds?.length) throw new Error("No NIfTI slices could be created.");

          const volumeId = `nifti:${Date.now()}`;
          const volume = await csCore.volumeLoader.createAndCacheVolume(volumeId, { imageIds });
          await volume.load();
          if (cancelled) return;
          niftiVolumeIdRef.current = volumeId;

          await rebuildCornerstoneNiftiViewports();
          if (cancelled) return;
          setNiftiVol(null);
          setIsPlaying(false);
          setLoading(false);
          return;
        }

        // If the URL points directly to a bulk_cases folder (not through the
        // bulk-series API), rewrite it to use the proper API endpoint so the
        // viewer can list and load the individual DICOM files inside that folder.
        const bulkCasesDirMatch = !resolvedFileUrl.includes("/bulk-series/") &&
          resolvedFileUrl.match(/\/uploads\/organization\/bulk_cases\/([^/?#]+)\/?$/i);
        if (bulkCasesDirMatch) {
          const caseFolder = bulkCasesDirMatch[1];
          try {
            const u = new URL(resolvedFileUrl);
            resolvedFileUrl = `${u.protocol}//${u.host}/radiology/bulk-series/${caseFolder}/files`;
          } catch {
            const base = resolvedFileUrl.replace(/\/uploads\/organization\/bulk_cases\/[^/?#]+\/?.*$/, '');
            resolvedFileUrl = `${base}/radiology/bulk-series/${caseFolder}/files`;
          }
        }

        const series = hasLocalSeries || resolvedFileUrl.includes("/dicom-series/") || resolvedFileUrl.includes("/bulk-series/");
        setIsSeries(series);
        setIsPlaying(false);

        let imageIds = [];
        let fromApi = false;
        if (series) {
          let urls = [];
          if (hasLocalSeries) {
            urls = seriesFiles.map((entry) => {
              if (!entry) return null;
              // Already absolute URL (S3 presigned) — return as-is
              if (typeof entry === 'string' && (entry.startsWith('http://') || entry.startsWith('https://'))) return entry;
              return getAbsoluteUrl(entry);
            }).filter(Boolean);
          } else {
            const res = await fetch(resolvedFileUrl);
            if (!res.ok) {
              throw new Error(`Series manifest not found (${res.status}). The scan folder may have been moved or deleted.`);
            }
            const json = await res.json();
            if (!json.files || json.files.length === 0) {
              throw new Error("No DICOM files found in series.");
            }
            urls = json.files
              .map((entry) => getAbsoluteUrl(typeof entry === 'string' ? entry : entry.url))
              .filter(Boolean);
            fromApi = true;
            // Expose to caller so useSeriesGrouping can parse series headers.
            setFetchedSeriesUrls?.(urls);
          }
          if (!urls.length) {
            throw new Error("No DICOM file URLs found in series.");
          }
          urls = sortDicomSliceUrls(urls);
          // Convert S3 presigned URLs to blob URLs to avoid auth header conflict
          const resolveS3ToBlobIfNeeded = async (url) => {
            if (url && (url.includes("X-Amz-Signature") || url.includes("x-amz-signature"))) {
              try {
                const r = await fetch(url);
                if (r.ok) return URL.createObjectURL(await r.blob());
              } catch {}
            }
            return url;
          };
          let resolvedUrls;
          if (hasLocalSeries || fromApi) {
            // Convert S3 presigned URLs to blob URLs; leave local/relative URLs as-is.
            // beforeSend guards are unreliable ("some versions ignore beforeSend"),
            // so blob is the only route that reliably avoids the S3 auth+signature 400.
            resolvedUrls = await Promise.all(urls.map(resolveS3ToBlobIfNeeded));
          } else {
            resolvedUrls = (
              await Promise.all(
                urls.map(async (url) => {
                  try {
                    return await findReachableUrl(buildDicomUrlCandidates(url, getAbsoluteUrl));
                  } catch {
                    return null;
                  }
                })
              )
            ).filter(Boolean);
          }
          if (!resolvedUrls.length) {
            throw new Error("Requested DICOM slice files were not found (404).");
          }
          imageIds = resolvedUrls.map(buildImageId);
          console.log("[DICOM] imageIds count:", imageIds.length, "first:", imageIds[0], "last:", imageIds[imageIds.length-1]);
        } else {
          let resolvedDicomUrl = await findReachableUrl(
            buildDicomUrlCandidates(resolvedFileUrl, getAbsoluteUrl)
          );
          // S3 presigned URL: fetch → blob URL to avoid auth header conflict
          if (resolvedDicomUrl.includes("X-Amz-Signature") ||
              resolvedDicomUrl.includes("x-amz-signature")) {
            try {
              const dcmResp = await fetch(resolvedDicomUrl);
              if (dcmResp.ok) {
                const dcmBlob = await dcmResp.blob();
                resolvedDicomUrl = URL.createObjectURL(dcmBlob);
              }
            } catch (blobErr) {
              console.warn("[useViewerDataLoader] DICOM blob fetch failed:", blobErr);
            }
          }
          imageIds = [buildImageId(resolvedDicomUrl)];
        }
        setDicomTotalSlices(imageIds.length || 1);
        dicomImageIdsRef.current = imageIds;

        const showTri = series && imageIds.length > 1;
        /* Decision tree:
           1. FIRST load + multi-image series → auto-switch to main2 (3-up MPR) AND run main2 engine setup
           2. NOT first load + current grid is main2 → run main2 engine setup (preserve user's layout)
           3. NOT first load + current grid is anything else → run single-viewport setup
           4. Single-image series (showTri false) → single-viewport setup
           This way: strip clicks in 1×1 stay in 1×1, strip clicks in 3-up MPR stay in 3-up MPR. */
        const isFirstLoad = !hasLoadedOnceRef.current;
        const currentMode = dicomGridRef.current?.mode || "grid";
        const shouldUseMain2 = showTri && (
          (isFirstLoad)                    // first load auto-switches to main2
          || (currentMode === "main2")     // OR user is currently in main2
        );
        console.log(
          `[useViewerDataLoader] isFirstLoad=${isFirstLoad} currentMode=${currentMode} ` +
          `showTri=${showTri} → shouldUseMain2=${shouldUseMain2}`
        );
        if (shouldUseMain2) {
          // Only flip grid state to main2 on first load. On subsequent reloads
          // where currentMode is already main2, we just re-run engine setup.
          if (isFirstLoad) {
            setDicomGrid({ rows: 2, cols: 2, mode: "main2" });
            setDicomGridSelected(true);
            setDicomSlotPlanes(["axial", "sagittal", "coronal"]);
            setActiveDicomSlot(0);
          }
          await new Promise((r) => setTimeout(r, 500));
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve))
          );
          if (cancelled) return;
          const ok = await waitForElementsReady([axRef.current, sagRef.current, corRef.current]);
          if (!ok) throw new Error("Viewport size is 0 (layout not ready).");

          // CrosshairsTool requires complete image plane metadata; some studies miss IPP.
          // Provide synthetic but stable positions/orientation so the tool does not crash.
          const basePlane = csCore.metaData.get("imagePlaneModule", imageIds[0]) || {};
          const hasIPP =
            Array.isArray(basePlane.imagePositionPatient) &&
            basePlane.imagePositionPatient.length >= 3;
          if (!hasIPP) {
            const pixelMod = csCore.metaData.get("imagePixelModule", imageIds[0]) || {};
            const rows = pixelMod.rows || basePlane.rows || 1;
            const columns = pixelMod.columns || basePlane.columns || 1;
            const pixelSpacing =
              Array.isArray(basePlane.pixelSpacing) && basePlane.pixelSpacing.length >= 2
                ? basePlane.pixelSpacing
                : [basePlane.rowPixelSpacing || 1, basePlane.columnPixelSpacing || 1];
            const rowPixelSpacing = basePlane.rowPixelSpacing || pixelSpacing[0] || 1;
            const columnPixelSpacing = basePlane.columnPixelSpacing || pixelSpacing[1] || 1;
            const imageOrientationPatient = basePlane.imageOrientationPatient || [1, 0, 0, 0, 1, 0];
            const spacingBetweenSlices = basePlane.spacingBetweenSlices || basePlane.sliceThickness || 1;
            const frameOfReferenceUID = basePlane.frameOfReferenceUID || "SYNTHETIC";
            const positions = new Map();
            imageIds.forEach((id, idx) => {
              positions.set(id, [0, 0, idx * spacingBetweenSlices]);
            });
            syntheticMetaProvider = (type, imageId) => {
              if (type !== "imagePlaneModule") return;
              if (!positions.has(imageId)) return;
              return {
                imageOrientationPatient,
                imagePositionPatient: positions.get(imageId),
                pixelSpacing: [rowPixelSpacing, columnPixelSpacing],
                rowPixelSpacing,
                columnPixelSpacing,
                rows,
                columns,
                sliceThickness: spacingBetweenSlices,
                spacingBetweenSlices,
                frameOfReferenceUID,
                usingDefaultValues: false,
              };
            };
            csCore.metaData.addProvider(syntheticMetaProvider, 10000);
          }

          const viewportIds = ["DICOM_SLOT_0", "DICOM_SLOT_1", "DICOM_SLOT_2"];
          viewportIdsRef.current = viewportIds;

          engine.setViewports([
            { viewportId: viewportIds[0], type: csCore.Enums.ViewportType.STACK, element: axRef.current, defaultOptions: {} },
            { viewportId: viewportIds[1], type: csCore.Enums.ViewportType.STACK, element: sagRef.current, defaultOptions: {} },
            { viewportId: viewportIds[2], type: csCore.Enums.ViewportType.STACK, element: corRef.current, defaultOptions: {} },
          ]);
          engine.resize(true, false);

          const midIdx = Math.floor(imageIds.length / 2);

          // Load first image to verify decoding works
          console.log("[DICOM] Pre-loading first image...");
          try {
            const firstImg = await csCore.imageLoader.loadAndCacheImage(imageIds[midIdx]);
            console.log("[DICOM] First image decoded OK:", firstImg.columns, "x", firstImg.rows);
          } catch (e) {
            console.error("[DICOM] First image decode failed:", e);
          }

          for (const vpId of viewportIds) {
            const vp = engine.getViewport(vpId);
            if (!vp) continue;
            console.log("[DICOM] setStack", vpId);
            try {
              await vp.setStack(imageIds, midIdx);
              vp.render();
              console.log("[DICOM] setStack + render done:", vpId);
            } catch (e) {
              console.error("[DICOM] setStack failed:", vpId, e);
            }
          }

          let tg = ToolGroupManager.getToolGroup(toolGroupId);
          if (!tg) {
            tg = ToolGroupManager.createToolGroup(toolGroupId);
          }
          if (!tg) {
            throw new Error("Failed to initialize DICOM tool group.");
          }
          viewportIds.forEach((vpId) => tg.addViewport(vpId, renderingEngineId));
          safeAddTool(tg, StackScrollTool.toolName);
          safeAddTool(tg, PanTool.toolName);
          safeAddTool(tg, WindowLevelTool.toolName);
          safeAddTool(tg, ZoomTool.toolName);
          safeAddTool(tg, LengthTool.toolName);
          safeAddTool(tg, RectangleROITool.toolName);
          safeAddTool(tg, CircleROITool.toolName);
          safeAddTool(tg, PlanarFreehandROITool.toolName);
          safeAddTool(tg, ArrowAnnotateTool.toolName, {
            configuration: {
              arrowFirst: true,
              getTextCallback: (doneChangingTextCallback) => doneChangingTextCallback(" "),
              changeTextCallback: (data, eventData, doneChangingTextCallback) =>
                doneChangingTextCallback(" "),
            },
          });
          tg.setToolActive(StackScrollTool.toolName, {
            bindings: [{ mouseButton: ToolsEnums.MouseBindings.Wheel }],
          });
          tg.setToolActive(PanTool.toolName, {
            bindings: [{ mouseButton: ToolsEnums.MouseBindings.Auxiliary }],
          });
          tg.setToolActive(WindowLevelTool.toolName, {
            bindings: [{ mouseButton: ToolsEnums.MouseBindings.Secondary }],
          });
          tg.setToolActive(ZoomTool.toolName, {
            bindings: [{ modifierKey: ToolsEnums.KeyboardBindings.Ctrl }],
          });
        } else {
          // Only force 1x1 layout if this is the first load OR there's
          // genuinely only a single image. Don't overwrite the user's
          // existing grid choice on subsequent reloads.
          if (isFirstLoad || !showTri) {
            setDicomGrid({ rows: 1, cols: 1, mode: "grid" });
            setDicomGridSelected(false);
            setDicomSlotPlanes(["axial", "sagittal", "coronal"]);
            setActiveDicomSlot(0);
          }
          // Wait for React to render the single viewport element
          await new Promise((r) => setTimeout(r, 500));
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve))
          );
          if (cancelled) return;
          // Retry until the ref is available and has dimensions
          let ok = false;
          for (let retry = 0; retry < 5 && !ok; retry++) {
            if (!singleRef.current) {
              await new Promise((r) => setTimeout(r, 300));
              continue;
            }
            ok = await waitForElementsReady([singleRef.current]);
            if (!ok) await new Promise((r) => setTimeout(r, 300));
          }
          if (!ok) throw new Error("Viewport size is 0 (layout not ready).");

          const viewportId = "DICOM_SINGLE";
          viewportIdsRef.current = [viewportId];
          engine.setViewports([
            { viewportId, type: csCore.Enums.ViewportType.STACK, element: singleRef.current, defaultOptions: {} },
          ]);
          engine.resize(true, false);

          const vp = engine.getViewport(viewportId);
          // Load just the first image for instant preview
          const firstId = [imageIds[0]];
          console.log("[DICOM] calling setStack with first image:", firstId[0]);
          console.log("[DICOM] viewport element size:", singleRef.current?.clientWidth, "x", singleRef.current?.clientHeight);
          try {
            await vp.setStack(firstId);
          } catch (e) {
            console.error("[DICOM] setStack failed:", e);
            throw e;
          }
          vp.render();
          console.log("[DICOM] first image rendered!");
          setLoading(false);

          // Load full stack in background after first image is visible
          setTimeout(async () => {
            try {
              const liveVp = engine.getViewport(viewportId);
              if (!liveVp) return;
              await liveVp.setStack(imageIds);
              liveVp.render();
              console.log("[DICOM] full stack loaded:", imageIds.length, "images");
            } catch (e) {
              console.warn("[DICOM] background stack load:", e);
            }
          }, 100);

          let tg = ToolGroupManager.getToolGroup(toolGroupId);
          if (!tg) {
            tg = ToolGroupManager.createToolGroup(toolGroupId);
          }
          if (!tg) {
            throw new Error("Failed to initialize DICOM tool group.");
          }
          tg.addViewport(viewportId, renderingEngineId);
          safeAddTool(tg, StackScrollTool.toolName);
          safeAddTool(tg, PanTool.toolName);
          safeAddTool(tg, WindowLevelTool.toolName);
          safeAddTool(tg, ZoomTool.toolName);
          safeAddTool(tg, LengthTool.toolName);
          safeAddTool(tg, RectangleROITool.toolName);
          safeAddTool(tg, CircleROITool.toolName);
          safeAddTool(tg, PlanarFreehandROITool.toolName);
          safeAddTool(tg, ArrowAnnotateTool.toolName, {
            configuration: {
              arrowFirst: true,
              getTextCallback: (doneChangingTextCallback) => doneChangingTextCallback(" "),
              changeTextCallback: (data, eventData, doneChangingTextCallback) =>
                doneChangingTextCallback(" "),
            },
          });
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
        // Mark the viewer as having loaded at least once. Any subsequent
        // strip clicks, series switches etc. will now skip the auto-switch
        // to 3-up MPR (see isFirstLoad guard above).
        hasLoadedOnceRef.current = true;
        console.log("[useViewerDataLoader] load complete; hasLoadedOnce now true");
      } catch (e) {
        if (cancelled) return;
        console.error(e);
        setError(e?.message || "Failed to load scan data.");
        setLoading(false);
      }
    };

    run();

    return () => {
      cancelled = true;
      if (syntheticMetaProvider) {
        try { csCore.metaData.removeProvider(syntheticMetaProvider); } catch {}
      }
      niftiVolumeIdRef.current = null;
      dicomImageIdsRef.current = [];
      try {
        const tgId = localToolGroupId || toolGroupIdRef.current;
        if (tgId) ToolGroupManager.destroyToolGroup(tgId);
      } catch {}
      try {
        localEngine?.destroy();
      } catch {}
      if (renderingEngineRef.current === localEngine) {
        renderingEngineRef.current = null;
      }
      // IMPORTANT: do NOT purge Cornerstone's image cache here. When the user
      // switches between series in the same case via the bottom strip, the
      // images they already decoded for the previous series will be re-used
      // if they ever click that series again. Purging here would re-download
      // every slice from scratch on every strip click.
      // Note: we intentionally do NOT revoke the blob URL here.
      // React Strict Mode double-invokes effects — revoking on first cleanup
      // would invalidate the URL before the second run's viewport can use it.
    };
  }, [fileUrl, filename, seriesFiles, layoutMode, dicomGrid?.mode]);
}
