// src/modules/radiologist/pages/DicomViewer/dicom/hooks/useVolumeProjection.js
//
// Drives MIP / MinIP / Average slab projection on the volume MPR viewports.
//
// This hook is intentionally thin: useVolumeMprLoader owns the engine, the
// volume, the tool group and the three reformat viewports. All this hook does
// is (re)apply the chosen projection mode + slab thickness to those viewports
// whenever the user changes them — and re-apply once the MPR finishes (re)loading
// (signalled by `readyToken` bumping).
//
// Scrolling does NOT need a handler here: a non-zero slab thickness installs
// VTK clipping planes that Cornerstone recenters on the camera focal point every
// camera-modified event, so the projection is recomputed live as the user scrolls
// or drags the crosshair. We only react to mode / thickness / ready changes.

import { useEffect } from "react";
import { applyProjectionToViewports } from "../utils/projectionModes";

/**
 * @param {Object} opts
 * @param {boolean}   opts.enabled            true only in volMpr (volume) mode
 * @param {RefObject} opts.renderingEngineRef ref to the active RenderingEngine
 * @param {string[]}  opts.viewportIds        the 3 reformat viewport ids
 * @param {string}    opts.projectionMode     one of PROJECTION_MODES
 * @param {number}    opts.slabThicknessMm    slab thickness in mm
 * @param {number}    opts.readyToken         bump this when MPR (re)loads
 */
export default function useVolumeProjection({
  enabled,
  renderingEngineRef,
  viewportIds,
  projectionMode,
  slabThicknessMm,
  renderQuality,
  readyToken,
}) {
  useEffect(() => {
    console.log("[MIP] useVolumeProjection effect", {
      enabled,
      hasEngine: !!renderingEngineRef.current,
      projectionMode,
      slabThicknessMm,
      renderQuality,
      readyToken,
    });
    if (!enabled) return;
    const engine = renderingEngineRef.current;
    if (!engine) {
      console.warn("[MIP] enabled but no rendering engine yet — waiting for readyToken");
      return;
    }

    // Re-apply on the next frame so we run after any pending layout / volume
    // attach / resetCamera from the loader has settled the actors + camera.
    // A short delayed retry covers the case where the actors/clipping planes
    // aren't ready on the immediate frame (common right after a volume load).
    const apply = () =>
      applyProjectionToViewports(engine, viewportIds, projectionMode, slabThicknessMm, renderQuality);
    const raf = requestAnimationFrame(apply);
    const t = setTimeout(apply, 120);
    return () => { cancelAnimationFrame(raf); clearTimeout(t); };
    // viewportIds is a stable set for volMpr; intentionally not in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, projectionMode, slabThicknessMm, renderQuality, readyToken]);
}
