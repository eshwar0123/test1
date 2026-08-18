import { useEffect } from "react";
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
}) {
  useEffect(() => {
    let syntheticMetaProvider = null;
    let cancelled = false;
    let localEngine = null;
    let localToolGroupId = null;
    let createdBlobUrl = null; // track so we can revoke on cleanup

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
        const nameLower = (filename || "").toLowerCase();
        const nifti =
          rawLower.endsWith(".nii") ||
          rawLower.endsWith(".nii.gz") ||
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
          const imageIds = await createNiftiImageIdsAndCacheMetadata({
            url: resolvedNiftiUrl,
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

        const series = hasLocalSeries || resolvedFileUrl.includes("/dicom-series/") || resolvedFileUrl.includes("/bulk-series/");
        setIsSeries(series);
        setIsPlaying(false);

        let imageIds = [];
        if (series) {
          let urls = [];
          if (hasLocalSeries) {
            urls = seriesFiles.map((entry) => getAbsoluteUrl(entry)).filter(Boolean);
          } else {
            const res = await fetch(resolvedFileUrl);
            const json = await res.json();
            if (!json.files || json.files.length === 0) {
              throw new Error("No DICOM files found in series.");
            }
            urls = json.files
              .map((entry) => getAbsoluteUrl(entry))
              .filter(Boolean);
          }
          if (!urls.length) {
            throw new Error("No DICOM file URLs found in series.");
          }
          urls = sortDicomSliceUrls(urls);
          let resolvedUrls;
          const isBulkSeries = resolvedFileUrl.includes("/bulk-series/");
          if (hasLocalSeries || isBulkSeries) {
            // Local dataset files and bulk-upload series: skip per-file reachability checks.
            // For bulk-series the endpoint only returns files that exist on disk.
            resolvedUrls = urls;
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
          const resolvedDicomUrl = await findReachableUrl(
            buildDicomUrlCandidates(resolvedFileUrl, getAbsoluteUrl)
          );
          imageIds = [buildImageId(resolvedDicomUrl)];
        }
        setDicomTotalSlices(imageIds.length || 1);
        dicomImageIdsRef.current = imageIds;

        const showTri = series && imageIds.length > 1;
        if (showTri) {
          setDicomGrid({ rows: 2, cols: 2, mode: "main2" });
          setDicomGridSelected(true);
          setDicomSlotPlanes(["axial", "sagittal", "coronal"]);
          setActiveDicomSlot(0);
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

          const previewStep = hasLocalSeries
            ? Math.max(Math.ceil(imageIds.length / 24), 1)
            : 3;
          const previewIds = imageIds.filter((_, idx) => idx % previewStep === 0);
          const initialIds = previewIds.length ? previewIds : imageIds;
          const initialTimeoutMs = hasLocalSeries ? 0 : 15000;

          for (const vpId of viewportIds) {
            const vp = engine.getViewport(vpId);
            if (!vp) continue;
            await maybeWithTimeout(vp.setStack(initialIds), initialTimeoutMs, `DICOM setStack (${vpId})`);
            vp.render();
          }

          if (initialIds !== imageIds) {
            setTimeout(() => {
              viewportIds.forEach((vpId) => {
                const vp = engine.getViewport(vpId);
                if (!vp) return;
                vp.setStack(imageIds).then(() => vp.render()).catch(() => {});
              });
            }, 0);
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
          setDicomGrid({ rows: 1, cols: 1, mode: "grid" });
          setDicomGridSelected(false);
          setDicomSlotPlanes(["axial", "sagittal", "coronal"]);
          setActiveDicomSlot(0);
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
            await Promise.race([
              vp.setStack(firstId),
              new Promise((_, rej) => setTimeout(() => rej(new Error("setStack timeout after 30s")), 30000)),
            ]);
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
      try {
        csCore.cache.purgeCache();
      } catch {}
      // Note: we intentionally do NOT revoke the blob URL here.
      // React Strict Mode double-invokes effects — revoking on first cleanup
      // would invalidate the URL before the second run's viewport can use it.
    };
  }, [fileUrl, filename, seriesFiles]);
}
