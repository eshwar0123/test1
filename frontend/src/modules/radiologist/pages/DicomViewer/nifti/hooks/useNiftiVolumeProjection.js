// nifti/hooks/useNiftiVolumeProjection.js
//
// Drives MIP / MinIP / Average slab projection on NIfTI Cornerstone3D volume viewports.
// Applies the chosen projection mode + slab thickness to all visible NIfTI slots
// whenever the user changes them, or when the NIfTI volume finishes loading.

import { useEffect } from "react";
import { applyProjectionToViewports } from "../utils/niftiProjectionModes";

/**
 * @param {Object} opts
 * @param {boolean}   opts.enabled              true only when isCornerstoneNifti
 * @param {RefObject} opts.renderingEngineRef   ref to the active RenderingEngine
 * @param {Function}  opts.getVisibleNiftiSlots returns currently visible slot indices
 * @param {string}    opts.niftiProjectionMode  one of PROJECTION_MODES
 * @param {number}    opts.niftiSlabThicknessMm slab thickness in mm
 * @param {string}    opts.renderQuality        one of RENDER_QUALITY
 * @param {number}    opts.readyToken           bump when NIfTI volume (re)loads
 */
export default function useNiftiVolumeProjection({
  enabled,
  renderingEngineRef,
  getVisibleNiftiSlots,
  niftiProjectionMode,
  niftiSlabThicknessMm,
  renderQuality,
  readyToken,
}) {
  useEffect(() => {
    if (!enabled) return;
    const engine = renderingEngineRef.current;
    if (!engine) return;

    const viewportIds = getVisibleNiftiSlots().map((s) => `NIFTI_SLOT_${s}`);
    if (!viewportIds.length) return;

    const apply = () =>
      applyProjectionToViewports(engine, viewportIds, niftiProjectionMode, niftiSlabThicknessMm, renderQuality);

    // Next frame + short retry so we run after any pending volume-attach / resetCamera.
    const raf = requestAnimationFrame(apply);
    const t = setTimeout(apply, 120);
    return () => { cancelAnimationFrame(raf); clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, niftiProjectionMode, niftiSlabThicknessMm, renderQuality, readyToken]);
}
