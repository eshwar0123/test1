// nifti/utils/niftiProjectionModes.js
//
// NIfTI slab-projection framework — MIP / MinIP / Average for volume NIfTI viewports.
// The underlying GPU logic (Cornerstone3D BlendMode + slabThickness) is identical to
// DICOM, so we re-export the shared projection engine and add NIfTI-specific viewport
// ID helpers on top.

export {
  PROJECTION_MODES,
  PROJECTION_MODE_OPTIONS,
  SLAB_THICKNESS_MIN_MM,
  SLAB_THICKNESS_MAX_MM,
  SLAB_THICKNESS_DEFAULT_MM,
  SLAB_THICKNESS_STEP_MM,
  RENDER_QUALITY,
  DEFAULT_RENDER_QUALITY,
  RENDER_QUALITY_OPTIONS,
  clampSlabThickness,
  isProjectionActive,
  blendModeForMode,
  applyProjectionToViewport,
  applyProjectionToViewports,
  applyRenderQualityToViewport,
  analyzeVolume,
  isCrossPlaneLowRes,
} from "../../dicom/utils/projectionModes";

/** Viewport IDs used by CornerstoneNiftiGrid slots: NIFTI_SLOT_0, NIFTI_SLOT_1, … */
export const getNiftiViewportIds = (visibleSlots) =>
  visibleSlots.map((s) => `NIFTI_SLOT_${s}`);
