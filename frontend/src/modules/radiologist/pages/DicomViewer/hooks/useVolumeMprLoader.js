// src/modules/radiologist/pages/DicomViewer/hooks/useVolumeMprLoader.js
//
// 3-PANE VOLUME MPR — axial / sagittal / coronal reformats of ONE series.
//
// Strategy: register unconditional metadata providers for imagePixelModule and
// imagePlaneModule BEFORE calling createAndCacheVolume. This bypasses the
// unreliable loadAndCacheImage warm-up that fails on S3 blob URLs. The volume
// builder reads our providers, allocates the volume, and volume.load() handles
// actual DICOM pixel loading internally via the WADO image loader.

import { useEffect } from "react";
import * as csCore from "@cornerstonejs/core";
import {
  ToolGroupManager,
  Enums as ToolsEnums,
  StackScrollTool,
  PanTool,
  ZoomTool,
  WindowLevelTool,
  LengthTool,
  RectangleROITool,
  CircleROITool,
  PlanarFreehandROITool,
  ArrowAnnotateTool,
} from "@cornerstonejs/tools";
import { initCornerstoneOnce } from "./useCornerstoneInit";
import { buildImageId, waitForElementsReady } from "../utils/viewerUtils";
import { applyProjectionToViewports } from "../dicom/utils/projectionModes";

export const MPR_VP_IDS = ["MPR_VOL_AX", "MPR_VOL_SAG", "MPR_VOL_COR"];

const ORIENTATIONS = () => {
  const O = csCore.Enums.OrientationAxis;
  return [O.AXIAL, O.SAGITTAL, O.CORONAL];
};

const safeAddTool = (tg, name, opts) => {
  try { tg.addTool(name, opts); }
  catch (e) { if (!String(e?.message || e).includes("already")) throw e; }
};

export default function useVolumeMprLoader({
  enabled,
  seriesUid,
  availableSeries,
  refs,
  setError,
  setLoading,
  renderingEngineRef,
  renderingEngineIdRef,
  toolGroupIdRef,
  viewportIdsRef,
  getProjection,
  onReady,
}) {
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let localEngine = null;
    let localTgId = null;
    const registeredProviders = [];

    const run = async () => {
      try {
        setLoading?.(true);
        setError?.(null);
        console.log("[volMpr] 3-pane setup START", { seriesUid });

        await initCornerstoneOnce();
        if (cancelled) return;

        await new Promise((r) => setTimeout(r, 120));
        await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
        if (cancelled) return;

        // ── Wait for all three elements to mount ──────────────────────────
        const els = () => (refs || []).map((r) => r?.current);
        let ready = false;
        for (let attempt = 0; attempt < 25 && !cancelled; attempt++) {
          await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
          const e = els();
          if (e.length === 3 && e.every((x) => x && x.clientWidth > 0 && x.clientHeight > 0)) {
            ready = true; break;
          }
          await new Promise((r) => setTimeout(r, 120));
        }
        if (cancelled) return;
        if (!ready) ready = await waitForElementsReady(els());
        if (!ready) throw new Error("MPR viewports not ready (layout 0 size).");
        const [axEl, sagEl, corEl] = els();

        // ── Find the selected series ──────────────────────────────────────
        const series = availableSeries?.find?.((s) => s.seriesUid === seriesUid);
        if (!series || !Array.isArray(series.urls) || series.urls.length === 0) {
          throw new Error("No series selected for MPR.");
        }

        // ── Convert S3 presigned URLs → blob URLs ─────────────────────────
        console.log("[volMpr] converting", series.urls.length, "URLs to blobs…");
        const BLOB_CHUNK = 6;
        const resolvedUrls = [];
        for (let i = 0; i < series.urls.length && !cancelled; i += BLOB_CHUNK) {
          const chunk = series.urls.slice(i, i + BLOB_CHUNK);
          const results = await Promise.all(
            chunk.map(async (url) => {
              if (url && (url.includes("X-Amz-Signature") || url.includes("x-amz-signature"))) {
                try {
                  const r = await fetch(url);
                  if (r.ok) return URL.createObjectURL(await r.blob());
                  console.warn("[volMpr] blob fetch status:", r.status);
                } catch (e) {
                  console.warn("[volMpr] blob fetch err:", e?.message);
                }
              }
              return url;
            })
          );
          resolvedUrls.push(...results);
        }
        if (cancelled) return;
        const blobCount = resolvedUrls.filter((u) => u && u.startsWith("blob:")).length;
        console.log("[volMpr] resolved", resolvedUrls.length, "URLs,", blobCount, "blobs");

        const imageIds = resolvedUrls.map(buildImageId);
        if (imageIds.length < 3) {
          throw new Error("MPR needs a multi-slice series (3+ slices).");
        }

        // ── Register metadata providers BEFORE volume build ───────────────
        // The streaming volume builder needs imagePixelModule AND
        // imagePlaneModule for every imageId BEFORE it allocates the voxel
        // array. Instead of relying on loadAndCacheImage warm-up (which
        // fails on S3 blob URLs), we register providers directly from
        // the series object + safe MR defaults. volume.load() will then
        // load actual pixel data via the WADO loader.
        const imageIdSet = new Set(imageIds);

        // — imagePixelModule: uniform for all slices in an MR series.
        const rows = series.rows || 512;
        const columns = series.columns || 512;
        const pixelProvider = (type, imageId) => {
          if (type !== "imagePixelModule") return;
          if (!imageIdSet.has(imageId)) return;
          return {
            bitsAllocated: 16,
            bitsStored: 16,
            highBit: 15,
            pixelRepresentation: 1,   // signed (standard for MR)
            samplesPerPixel: 1,
            photometricInterpretation: "MONOCHROME2",
            rows,
            columns,
          };
        };
        csCore.metaData.addProvider(pixelProvider, 10000);
        registeredProviders.push(pixelProvider);

        // — imagePlaneModule: per-slice geometry from series.positions/iop.
        const pos = Array.isArray(series.positions) ? series.positions : [];
        const iop = Array.isArray(series.iop) && series.iop.length >= 6
          ? series.iop : [1, 0, 0, 0, 1, 0];
        const forUID = series.frameOfReferenceUID || "SYNTHETIC_MPR";

        // Derive spacing from real positions if available
        let spacing = 1;
        if (pos.length >= 2 && Array.isArray(pos[0]) && Array.isArray(pos[1])) {
          const dx = (pos[1][0]||0) - (pos[0][0]||0);
          const dy = (pos[1][1]||0) - (pos[0][1]||0);
          const dz = (pos[1][2]||0) - (pos[0][2]||0);
          const d = Math.sqrt(dx*dx + dy*dy + dz*dz);
          if (d > 0.01) spacing = d;
        }

        const posMap = new Map();
        imageIds.forEach((id, idx) => {
          const pp = Array.isArray(pos[idx]) && pos[idx].length >= 3
            ? pos[idx] : [0, 0, idx * spacing];
          posMap.set(id, pp);
        });

        const planeProvider = (type, imageId) => {
          if (type !== "imagePlaneModule") return;
          if (!posMap.has(imageId)) return;
          return {
            imageOrientationPatient: iop,
            imagePositionPatient: posMap.get(imageId),
            pixelSpacing: [1, 1],
            rowPixelSpacing: 1,
            columnPixelSpacing: 1,
            rows,
            columns,
            sliceThickness: spacing,
            spacingBetweenSlices: spacing,
            frameOfReferenceUID: forUID,
            usingDefaultValues: false,
          };
        };
        csCore.metaData.addProvider(planeProvider, 10000);
        registeredProviders.push(planeProvider);

        // — generalSeriesModule: modality info.
        const seriesProvider = (type, imageId) => {
          if (type !== "generalSeriesModule") return;
          if (!imageIdSet.has(imageId)) return;
          return { modality: series.modality || "MR" };
        };
        csCore.metaData.addProvider(seriesProvider, 10000);
        registeredProviders.push(seriesProvider);

        // Verify both modules resolve
        const testPx = csCore.metaData.get("imagePixelModule", imageIds[0]);
        const testPl = csCore.metaData.get("imagePlaneModule", imageIds[0]);
        console.log("[volMpr] metadata check — pixel:", !!testPx, "plane:", !!testPl);

        // ── Engine + orthographic viewports ───────────────────────────────
        const reId = `volmpr_engine_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const tgId = `volmpr_tools_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        renderingEngineIdRef.current = reId;
        toolGroupIdRef.current = tgId;
        localTgId = tgId;

        const engine = new csCore.RenderingEngine(reId);
        localEngine = engine;
        renderingEngineRef.current = engine;

        const [oAx, oSag, oCor] = ORIENTATIONS();
        engine.setViewports([
          { viewportId: MPR_VP_IDS[0], type: csCore.Enums.ViewportType.ORTHOGRAPHIC, element: axEl,  defaultOptions: { orientation: oAx,  background: [0, 0, 0] } },
          { viewportId: MPR_VP_IDS[1], type: csCore.Enums.ViewportType.ORTHOGRAPHIC, element: sagEl, defaultOptions: { orientation: oSag, background: [0, 0, 0] } },
          { viewportId: MPR_VP_IDS[2], type: csCore.Enums.ViewportType.ORTHOGRAPHIC, element: corEl, defaultOptions: { orientation: oCor, background: [0, 0, 0] } },
        ]);
        viewportIdsRef.current = [...MPR_VP_IDS];
        engine.resize(true, false);

        // ── Build volume ──────────────────────────────────────────────────
        console.log("[volMpr] building volume from", imageIds.length, "imageIds…");
        const volumeId = `cornerstoneStreamingImageVolume:onix_mpr_${Date.now()}`;
        const volume = await csCore.volumeLoader.createAndCacheVolume(volumeId, { imageIds });
        console.log("[volMpr] volume created, loading pixel data…");
        await volume.load();
        if (cancelled) return;
        console.log("[volMpr] volume loaded ✓");

        for (const vpId of MPR_VP_IDS) {
          const vp = engine.getViewport(vpId);
          await vp.setVolumes([{ volumeId }]);
          vp.resetCamera?.();
        }
        engine.renderViewports(MPR_VP_IDS);

        // ── Tool group ────────────────────────────────────────────────────
        let tg = ToolGroupManager.getToolGroup(tgId) || ToolGroupManager.createToolGroup(tgId);
        if (!tg) throw new Error("Failed to create MPR tool group.");
        safeAddTool(tg, StackScrollTool.toolName);
        safeAddTool(tg, PanTool.toolName);
        safeAddTool(tg, ZoomTool.toolName);
        safeAddTool(tg, WindowLevelTool.toolName);
        safeAddTool(tg, LengthTool.toolName);
        safeAddTool(tg, RectangleROITool.toolName);
        safeAddTool(tg, CircleROITool.toolName);
        safeAddTool(tg, PlanarFreehandROITool.toolName);
        safeAddTool(tg, ArrowAnnotateTool.toolName, {
          configuration: {
            arrowFirst: true,
            getTextCallback: (cb) => cb(" "),
            changeTextCallback: (d, e, cb) => cb(" "),
          },
        });
        MPR_VP_IDS.forEach((id) => { try { tg.addViewport(id, reId); } catch {} });
        tg.setToolActive(PanTool.toolName, {
          bindings: [{ mouseButton: ToolsEnums.MouseBindings.Auxiliary }],
        });
        tg.setToolActive(WindowLevelTool.toolName, {
          bindings: [
            { mouseButton: ToolsEnums.MouseBindings.Primary },
            { mouseButton: ToolsEnums.MouseBindings.Secondary },
          ],
        });

        const proj = getProjection?.() || {};
        applyProjectionToViewports(engine, MPR_VP_IDS, proj.mode, proj.slabThicknessMm, proj.quality);
        engine.renderViewports(MPR_VP_IDS);

        setLoading?.(false);
        onReady?.();
        console.log("[volMpr] 3-pane ready ✓");
      } catch (e) {
        if (cancelled) return;
        console.error("[volMpr] setup failed:", e);
        setError?.(e?.message || "Failed to set up MPR view.");
        setLoading?.(false);
      }
    };

    run();

    return () => {
      cancelled = true;
      // Clean up registered providers so they don't leak across mode switches
      registeredProviders.forEach((p) => {
        try { csCore.metaData.removeProvider(p); } catch {}
      });
      try { if (localTgId) ToolGroupManager.destroyToolGroup(localTgId); } catch {}
      try { localEngine?.destroy(); } catch {}
      if (renderingEngineRef.current === localEngine) renderingEngineRef.current = null;
      try { csCore.cache.purgeCache(); } catch {}
    };
  }, [enabled, seriesUid]); // eslint-disable-line react-hooks/exhaustive-deps
}
