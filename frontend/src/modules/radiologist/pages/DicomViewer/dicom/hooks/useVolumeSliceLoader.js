// src/modules/radiologist/pages/DicomViewer/dicom/hooks/useVolumeSliceLoader.js
//
// SINGLE-PANE volume viewport — "MIP without the 3-up MPR".
//
// Mounts ONE ORTHOGRAPHIC volume viewport (axial / sagittal / coronal of the
// SAME series) into a single element, so the user gets a full-size view they
// can scroll through and project (MIP / MinIP / Average) without the linked
// 3-pane crosshair layout. It is the single-viewport sibling of
// useVolumeMprLoader: same volume-loading + slab-projection machinery, minus
// the CrosshairsTool and the extra two reformats.
//
// Why a volume viewport (not a stack)? MIP needs true 3D data to project a slab
// along the view direction. A stack viewport only holds one 2D image, so it
// cannot project. This loader therefore builds a real volume just like the MPR
// path, then applies the chosen projection via the shared slab framework.
//
// Gating: enable only when layoutMode === "volMip". useViewerDataLoader bails in
// that mode so the two don't fight over the same DOM element.

import { useEffect, useRef } from "react";
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
import { initCornerstoneOnce } from "../../hooks/useCornerstoneInit";
import { buildImageId, waitForElementsReady } from "../../utils/viewerUtils";
import { applyProjectionToViewports, analyzeVolume } from "../utils/projectionModes";

export const VOL_MIP_VIEWPORT_ID = "MIP_VOL_SINGLE";

const orientationForPlane = (plane) => {
  const O = csCore.Enums.OrientationAxis;
  if (plane === "sagittal") return O.SAGITTAL;
  if (plane === "coronal") return O.CORONAL;
  return O.AXIAL;
};

const safeAddTool = (tg, name, opts) => {
  try { tg.addTool(name, opts); }
  catch (e) { if (!String(e?.message || e).includes("already")) throw e; }
};

/**
 * @param {Object} opts
 * @param {boolean}  opts.enabled            layoutMode === "volMip"
 * @param {string}   opts.seriesUid          the ONE series to project
 * @param {Array}    opts.availableSeries    useSeriesGrouping output
 * @param {RefObject} opts.containerRef       element for the single viewport
 * @param {string}   opts.plane              "axial" | "sagittal" | "coronal"
 * @param {Function} opts.setError
 * @param {Function} opts.setLoading
 * @param {RefObject} opts.renderingEngineRef
 * @param {RefObject} opts.renderingEngineIdRef
 * @param {RefObject} opts.toolGroupIdRef
 * @param {RefObject} opts.viewportIdsRef
 * @param {Function} [opts.getProjection]    () => ({ mode, slabThicknessMm })
 * @param {Function} [opts.onReady]
 */
export default function useVolumeSliceLoader({
  enabled,
  seriesUid,
  availableSeries,
  containerRef,
  plane,
  setError,
  setLoading,
  renderingEngineRef,
  renderingEngineIdRef,
  toolGroupIdRef,
  viewportIdsRef,
  getProjection,
  onVolumeInfo,
  onReady,
}) {
  // Latest plane, read inside the (heavy) load effect without making plane a
  // dependency — plane changes are handled by the lightweight effect below.
  const planeRef = useRef(plane);
  useEffect(() => { planeRef.current = plane; }, [plane]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let localEngine = null;
    let localTgId = null;

    const run = async () => {
      try {
        setLoading(true);
        setError(null);
        const plane0 = planeRef.current;
        console.log("[volMip] single-pane setup START", { plane: plane0, seriesUid });

        await initCornerstoneOnce();
        if (cancelled) return;

        await new Promise((r) => setTimeout(r, 120));
        await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
        if (cancelled) return;

        // Wait for the element to mount and lay out (retry like the MPR loader).
        let el = null;
        let ready = false;
        for (let attempt = 0; attempt < 20 && !cancelled; attempt++) {
          await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
          el = containerRef?.current;
          if (el && el.clientWidth > 0 && el.clientHeight > 0) { ready = true; break; }
          await new Promise((r) => setTimeout(r, 120));
        }
        if (cancelled) return;
        if (!ready) ready = await waitForElementsReady([el]);
        if (!ready) throw new Error("MIP viewport not ready (layout 0 size).");

        const series = availableSeries?.find?.((s) => s.seriesUid === seriesUid);
        if (!series || !Array.isArray(series.urls) || series.urls.length === 0) {
          throw new Error("No series selected for MIP.");
        }
        const imageIds = series.urls.map(buildImageId);
        if (imageIds.length < 3) {
          throw new Error("MIP needs a multi-slice series (3 or more slices).");
        }

        const reId = `volmip_engine_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const tgId = `volmip_tools_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        renderingEngineIdRef.current = reId;
        toolGroupIdRef.current = tgId;
        localTgId = tgId;

        const engine = new csCore.RenderingEngine(reId);
        localEngine = engine;
        renderingEngineRef.current = engine;

        engine.enableElement({
          viewportId: VOL_MIP_VIEWPORT_ID,
          type: csCore.Enums.ViewportType.ORTHOGRAPHIC,
          element: el,
          defaultOptions: {
            orientation: orientationForPlane(plane0),
            background: [0, 0, 0],
          },
        });
        viewportIdsRef.current = [VOL_MIP_VIEWPORT_ID];
        engine.resize(true, false);

        const volumeId = `cornerstoneStreamingImageVolume:onix_mip_${Date.now()}`;
        const volume = await csCore.volumeLoader.createAndCacheVolume(volumeId, { imageIds });
        await volume.load();
        if (cancelled) return;

        const vp = engine.getViewport(VOL_MIP_VIEWPORT_ID);
        await vp.setVolumes([{ volumeId }]);

        // Radiology-quality default: open MIP in the series' ACQUISITION plane
        // (sharpest — no cross-slice interpolation). Report geometry up so the
        // UI can sync the plane button and warn on cross-plane/anisotropic views.
        const info = analyzeVolume(volume);
        if (info?.acquisitionPlane) {
          try { vp.setOrientation(orientationForPlane(info.acquisitionPlane)); } catch {}
        }
        vp.resetCamera?.();
        onVolumeInfo?.(info);
        engine.renderViewports([VOL_MIP_VIEWPORT_ID]);

        // Tool group: scroll (wheel) through the volume, pan (middle), W/L (right).
        // Primary-button tool is owned by activateCornerstoneDicomTool, which
        // reconfigures this same toolGroupIdRef group.
        let tg = ToolGroupManager.getToolGroup(tgId) || ToolGroupManager.createToolGroup(tgId);
        if (!tg) throw new Error("Failed to create MIP tool group.");
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
        try { tg.addViewport(VOL_MIP_VIEWPORT_ID, reId); } catch {}
        // NOTE: scrolling through the volume is driven by the grid's onWheel
        // (handleCornerstoneDicomWheel -> vp.scroll), so StackScroll is NOT
        // bound to the wheel here — binding it too would double-scroll.
        tg.setToolActive(PanTool.toolName, { bindings: [{ mouseButton: ToolsEnums.MouseBindings.Auxiliary }] });
        // Default primary-button tool = W/L (the toolbar's activateCornerstoneDicomTool
        // reconfigures this on demand). Secondary keeps W/L too for parity.
        tg.setToolActive(WindowLevelTool.toolName, {
          bindings: [
            { mouseButton: ToolsEnums.MouseBindings.Primary },
            { mouseButton: ToolsEnums.MouseBindings.Secondary },
          ],
        });

        // Apply the active projection (MIP / MinIP / Average) right now, on the
        // freshly built viewport — the most reliable place to set it.
        const proj = getProjection?.() || {};
        applyProjectionToViewports(engine, [VOL_MIP_VIEWPORT_ID], proj.mode, proj.slabThicknessMm, proj.quality);

        engine.renderViewports([VOL_MIP_VIEWPORT_ID]);
        setLoading(false);
        onReady?.();
        console.log("[volMip] single-pane ready");
      } catch (e) {
        if (cancelled) return;
        console.error("[volMip] setup failed:", e);
        setError(e?.message || "Failed to set up MIP view.");
        setLoading(false);
      }
    };

    run();

    return () => {
      cancelled = true;
      try { if (localTgId) ToolGroupManager.destroyToolGroup(localTgId); } catch {}
      try { localEngine?.destroy(); } catch {}
      if (renderingEngineRef.current === localEngine) renderingEngineRef.current = null;
      try { csCore.cache.purgeCache(); } catch {}
    };
  }, [enabled, seriesUid]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Plane changes are reoriented in place (no volume reload): the volume is
     already loaded, so we just rotate the camera to the new plane and re-apply
     the projection. Re-decoding the whole series per plane switch would be slow. */
  useEffect(() => {
    if (!enabled) return;
    const engine = renderingEngineRef.current;
    const vp = engine?.getViewport?.(VOL_MIP_VIEWPORT_ID);
    if (!vp?.setOrientation) return; // not mounted yet — initial plane already set
    try {
      vp.setOrientation(orientationForPlane(plane));
      vp.resetCamera?.();
      const proj = getProjection?.() || {};
      applyProjectionToViewports(engine, [VOL_MIP_VIEWPORT_ID], proj.mode, proj.slabThicknessMm, proj.quality);
      vp.render?.();
    } catch (e) {
      console.error("[volMip] setOrientation failed:", e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plane]);
}
