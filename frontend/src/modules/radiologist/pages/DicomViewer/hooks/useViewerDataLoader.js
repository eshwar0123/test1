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

/* ═══════════════════════════════════════════════════════════════════════
   PERF: same-origin rewrite instead of eager blob download.

   Previously every slice URL that carried an S3 presigned signature was
   fetched in full and turned into a blob: URL, because S3 rejects requests
   that carry BOTH ?X-Amz-Signature AND an Authorization header. That meant
   downloading the entire study (299 files ≈ 150 MB) before the first pixel
   could be drawn.

   The files also live on the EC2 box on disk, so we route through our own
   origin instead: the presigned URL's object key becomes a path on our API,
   nginx X-Accel-Redirects it off local disk, and the wado loader streams it
   lazily one slice at a time. No prefetch, no blobs, no signature conflict.
   ═══════════════════════════════════════════════════════════════════════ */
/* Manifest results, cached for the session. The effect deps include
   dicomGrid?.mode, and the loader itself flips the mode to "main2" on first
   load — so this effect ALWAYS runs twice. That used to mean fetching the
   manifest twice and, worse, minting 299 brand-new blob URLs the second time
   (new URLs = new imageIds = Cornerstone cache miss = full re-download).
   With stable same-origin URLs plus this cache, run #2 is nearly free. */
const seriesUrlCache = new Map(); // manifest URL -> string[]

const S3_SIG_RE = /[?&]x-amz-signature=/i;
export const isPresignedS3 = (u) => !!u && S3_SIG_RE.test(u);

/** Presigned S3 URL → same-origin streaming endpoint. Pure string work, no I/O. */
const toSameOriginUrl = (url) => {
  if (!url || url.startsWith("blob:")) return url;
  if (!isPresignedS3(url)) return url;
  try {
    const key = new URL(url).pathname.replace(/^\/+/, "");
    return `${window.location.origin}/api/radiology/file/${key}`;
  } catch {
    return url;
  }
};

/**
 * Warm Cornerstone's cache for the rest of the stack, outward from the slice
 * the user is actually looking at, with bounded concurrency so we never
 * saturate the browser's per-host connection pool while they're scrolling.
 */
const PREFETCH_CONCURRENCY = 6;
const prefetchStack = (imageIds, centerIdx, isCancelled) => {
  const order = [];
  for (let d = 1; d < imageIds.length; d++) {
    const hi = centerIdx + d;
    const lo = centerIdx - d;
    if (hi < imageIds.length) order.push(imageIds[hi]);
    if (lo >= 0) order.push(imageIds[lo]);
  }
  let cursor = 0;
  const worker = async () => {
    while (cursor < order.length) {
      if (isCancelled?.()) return;
      const id = order[cursor++];
      try { await csCore.imageLoader.loadAndCacheImage(id); } catch { /* skip bad slice */ }
    }
  };
  for (let i = 0; i < PREFETCH_CONCURRENCY; i++) worker();
};

/** Poll for element layout using rAF instead of a fixed sleep. */
const waitForLayout = async (getEls, waitForElementsReady, maxMs = 2000) => {
  const started = performance.now();
  while (performance.now() - started < maxMs) {
    await new Promise((r) => requestAnimationFrame(r));
    const els = getEls();
    if (els.every(Boolean)) {
      const ok = await waitForElementsReady(els);
      if (ok) return true;
    }
  }
  return false;
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

        /* PERF: was a flat 800ms sleep "to let the DOM paint". One rAF is
           enough to get past the current commit; actual size readiness is
           handled by waitForLayout() below, which polls instead of guessing. */
        await new Promise((r) => requestAnimationFrame(r));
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

          // PERF: poll for layout readiness instead of sleeping 500ms blind.
          const ok = await waitForLayout(
            () => [axRef.current, sagRef.current, corRef.current],
            waitForElementsReady
          );
          if (cancelled) return;
          if (!ok) throw new Error("Viewport size is 0 (layout not ready).");

          const niftiCandidates = buildNiftiUrlCandidates(resolvedFileUrl, getAbsoluteUrl);
          const resolvedNiftiUrl = await findReachableUrl(niftiCandidates);

          /* PERF: NIfTI is one large file, so lazy slice loading doesn't apply —
             but we still avoid the double-buffer (download to blob, then let the
             loader read the blob). Same-origin means the loader streams it once
             and nginx can serve it with gzip_static + range support. */
          const niftiLoadUrl = toSameOriginUrl(resolvedNiftiUrl);

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
          } else if (seriesUrlCache.has(resolvedFileUrl)) {
            // PERF: second effect run (mode flip) reuses the first run's list.
            urls = seriesUrlCache.get(resolvedFileUrl);
            fromApi = true;
            setFetchedSeriesUrls?.(urls);
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
            seriesUrlCache.set(resolvedFileUrl, urls);
            // Expose to caller so useSeriesGrouping can parse series headers.
            setFetchedSeriesUrls?.(urls);
          }
          if (!urls.length) {
            throw new Error("No DICOM file URLs found in series.");
          }
          urls = sortDicomSliceUrls(urls);

          /* PERF: no network here at all. Presigned S3 URLs are rewritten to
             our own origin so the wado loader can fetch them lazily; every
             other URL passes through untouched. What used to be 299 full
             downloads (~150 MB) is now zero bytes. */
          let resolvedUrls;
          if (hasLocalSeries || fromApi) {
            resolvedUrls = urls.map(toSameOriginUrl).filter(Boolean);
          } else {
            /* Legacy path: probe candidate URL shapes. Only the FIRST slice is
               probed — the rest are rewritten with whichever shape won, since
               every slice in a series lives in the same folder. 299 HEADs → 1. */
            let winner = null;
            for (const u of urls) {
              try {
                winner = await findReachableUrl(buildDicomUrlCandidates(u, getAbsoluteUrl));
                break;
              } catch { /* try next */ }
            }
            if (!winner) {
              throw new Error("Requested DICOM slice files were not found (404).");
            }
            const stripName = (s) => s.slice(0, s.lastIndexOf("/") + 1);
            const winnerDir = stripName(winner);
            resolvedUrls = urls
              .map((u) => {
                const abs = getAbsoluteUrl(u) || u;
                const name = abs.split("?")[0].split("/").pop();
                return name ? winnerDir + name : abs;
              })
              .filter(Boolean);
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
          // PERF: same-origin rewrite instead of download-then-blob.
          resolvedDicomUrl = toSameOriginUrl(resolvedDicomUrl);
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
          // PERF: poll for layout readiness instead of sleeping 500ms blind.
          const ok = await waitForLayout(
            () => [axRef.current, sagRef.current, corRef.current],
            waitForElementsReady
          );
          if (cancelled) return;
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

          /* ── PERF: progressive mount ──────────────────────────────────
             Old flow: loadAndCacheImage(mid) — a full decode nobody used —
             then three sequential setStack(imageIds) calls, each handing
             Cornerstone all 299 ids. Nothing painted until all of it settled.

             New flow: mount a ONE-SLICE stack so the middle image paints
             immediately, drop the spinner, then swap in the full stack and
             warm the cache in the background. First pixel no longer waits
             on the other 298 slices. */
          const seedId = imageIds[midIdx];
          await Promise.all(
            viewportIds.map(async (vpId) => {
              const vp = engine.getViewport(vpId);
              if (!vp) return;
              try {
                await vp.setStack([seedId], 0);
                vp.render();
              } catch (e) {
                console.error("[DICOM] seed setStack failed:", vpId, e);
              }
            })
          );
          if (cancelled) return;
          setLoading(false);
          hasLoadedOnceRef.current = true;
          console.log("[DICOM] first pixel painted (seed slice)");

          // Swap to the full stack once the seed is on screen.
          queueMicrotask(async () => {
            if (cancelled) return;
            for (const vpId of viewportIds) {
              const vp = engine.getViewport(vpId);
              if (!vp) continue;
              try {
                await vp.setStack(imageIds, midIdx);
                vp.render();
              } catch (e) {
                console.warn("[DICOM] full setStack:", vpId, e?.message || e);
              }
            }
            if (!cancelled) prefetchStack(imageIds, midIdx, () => cancelled);
          });

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
          /* PERF: was 500ms sleep + up to 5 × 300ms retry sleeps = up to 2s of
             dead time even when the element was ready on the first frame.
             waitForLayout polls each frame and returns the moment it's sized. */
          const ok = await waitForLayout(
            () => [singleRef.current],
            waitForElementsReady
          );
          if (cancelled) return;
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

          // Load full stack in background after first image is visible,
          // then warm the cache outward so scrolling doesn't stutter.
          queueMicrotask(async () => {
            if (cancelled) return;
            try {
              const liveVp = engine.getViewport(viewportId);
              if (!liveVp) return;
              await liveVp.setStack(imageIds);
              liveVp.render();
              console.log("[DICOM] full stack mounted:", imageIds.length, "images");
              if (!cancelled) prefetchStack(imageIds, 0, () => cancelled);
            } catch (e) {
              console.warn("[DICOM] background stack load:", e);
            }
          });

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
