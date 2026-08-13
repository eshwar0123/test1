// src/modules/radiologist/pages/DicomViewer/dicom/utils/projectionModes.js
//
// SLAB-PROJECTION FRAMEWORK for Cornerstone3D *volume* viewports (volMpr).
//
// This is the shared engine behind Maximum Intensity Projection (MIP) and,
// by design, MinIP and Average Intensity Projection (AIP) too. A Cornerstone3D
// ORTHOGRAPHIC volume viewport already knows how to ray-cast through a slab on
// the GPU (via VTK): you tell it (a) a blend mode and (b) a slab thickness in
// world units (mm), and for every output pixel it walks the voxels inside the
// slab along the current viewing direction and reduces them to one value:
//
//   MAXIMUM_INTENSITY_BLEND  -> max voxel in slab   (MIP)
//   MINIMUM_INTENSITY_BLEND  -> min voxel in slab   (MinIP)
//   AVERAGE_INTENSITY_BLEND  -> mean voxel in slab  (AIP / AvgIP)
//   COMPOSITE                -> normal single-slice MPR (no projection)
//
// Because all three projections differ ONLY by which BlendMode enum we hand to
// setBlendMode(), adding MinIP / AIP later is purely declarative — they are
// already wired here. The slab thickness control, the live re-apply on scroll,
// and the toolbar plumbing are identical for every mode.
//
// Real-time during scrolling: setSlabThickness installs a pair of VTK clipping
// planes centered on the camera focal point. StackScroll / Crosshairs move that
// focal point through the volume, and Cornerstone recenters the clipping planes
// on every camera-modified event, so the projection is recomputed each frame
// with no extra work from us. Changing thickness re-runs setSlabThickness and
// the GPU recomputes immediately.

import * as csCore from "@cornerstonejs/core";

/** Projection modes exposed to the UI. Keep these string ids stable — they are
 *  persisted in component state and passed through props. */
export const PROJECTION_MODES = {
  NONE: "none", // single-slice MPR (composite) — MIP/MinIP/AIP OFF
  MIP: "mip", // Maximum Intensity Projection
  MINIP: "minip", // Minimum Intensity Projection
  AVERAGE: "average", // Average Intensity Projection (AIP / AvgIP)
};

/** Slab thickness bounds (in millimetres / world units). The task spec calls
 *  for 5mm–100mm; the step keeps the slider/keyboard nudges radiology-friendly. */
export const SLAB_THICKNESS_MIN_MM = 5;
export const SLAB_THICKNESS_MAX_MM = 100;
export const SLAB_THICKNESS_DEFAULT_MM = 20;
export const SLAB_THICKNESS_STEP_MM = 5;

/** UI metadata for the toolbar dropdown. Order = display order. Adding a new
 *  projection here (plus a case in blendModeForMode) is all it takes to ship it. */
export const PROJECTION_MODE_OPTIONS = [
  { id: PROJECTION_MODES.NONE, label: "Off", short: "MPR", desc: "Single slice (no projection)" },
  { id: PROJECTION_MODES.MIP, label: "MIP", short: "MIP", desc: "Maximum Intensity Projection" },
  { id: PROJECTION_MODES.MINIP, label: "MinIP", short: "MinIP", desc: "Minimum Intensity Projection" },
  { id: PROJECTION_MODES.AVERAGE, label: "Average", short: "Avg", desc: "Average Intensity Projection" },
];

/** Clamp a thickness value into the supported [5mm, 100mm] window. */
export const clampSlabThickness = (mm) => {
  const n = Number(mm);
  if (!Number.isFinite(n)) return SLAB_THICKNESS_DEFAULT_MM;
  return Math.min(SLAB_THICKNESS_MAX_MM, Math.max(SLAB_THICKNESS_MIN_MM, n));
};

export const isProjectionActive = (mode) =>
  mode != null && mode !== PROJECTION_MODES.NONE;

/* ─── Render quality (interpolation + sampling density) ──────────
   MIP of a reformat is sharper when the GPU interpolates the volume well and
   samples it densely. These presets trade speed for clarity:
     SMOOTH  – linear interpolation (default; clinical-looking)
     SHARP   – nearest-neighbour (crisper edges, blockier)
     HIGH    – linear + dense sampling (sharpest, slower) */
export const RENDER_QUALITY = { SMOOTH: "smooth", SHARP: "sharp", HIGH: "high" };
export const DEFAULT_RENDER_QUALITY = RENDER_QUALITY.SMOOTH;
export const RENDER_QUALITY_OPTIONS = [
  { id: RENDER_QUALITY.SMOOTH, label: "Smooth", desc: "Linear interpolation (default)" },
  { id: RENDER_QUALITY.SHARP, label: "Sharp", desc: "Nearest-neighbour — crisper, blockier" },
  { id: RENDER_QUALITY.HIGH, label: "High-Q", desc: "Linear + dense sampling (sharpest, slower)" },
];

const qualityToProps = (quality) => {
  const I = csCore.Enums.InterpolationType;
  switch (quality) {
    case RENDER_QUALITY.SHARP:
      return { interpolationType: I.NEAREST, sampleDistanceMultiplier: 1 };
    case RENDER_QUALITY.HIGH:
      // <1 multiplier = finer ray sampling → less softening.
      return { interpolationType: I.LINEAR, sampleDistanceMultiplier: 0.5 };
    case RENDER_QUALITY.SMOOTH:
    default:
      return { interpolationType: I.LINEAR, sampleDistanceMultiplier: 1 };
  }
};

export const applyRenderQualityToViewport = (viewport, quality) => {
  if (!viewport || typeof viewport.setProperties !== "function" || !quality) return;
  try { viewport.setProperties(qualityToProps(quality)); }
  catch (e) { console.warn("[MIP] render quality apply failed", viewport?.id, e); }
};

const PLANE_NORMAL_AXIS = { sagittal: 0, coronal: 1, axial: 2 }; // patient X / Y / Z

/* Anatomical plane perpendicular to a patient-space normal vector. */
const planeForNormal = (n) => {
  const ax = [Math.abs(n[0]), Math.abs(n[1]), Math.abs(n[2])];
  const dom = ax.indexOf(Math.max(...ax));
  return dom === 0 ? "sagittal" : dom === 1 ? "coronal" : "axial";
};

const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/**
 * Inspect a loaded volume's geometry to drive radiology-quality MIP defaults:
 *  - acquisitionPlane: the plane the series was actually scanned in (sharpest).
 *  - isotropic: voxels ~cubic → axial/sagittal/coronal MIP are all crisp.
 *  - anisotropyRatio: max/min voxel spacing (1 = perfectly isotropic).
 *
 * Returns null if the volume geometry isn't available.
 */
export const analyzeVolume = (volume) => {
  try {
    const spacing =
      volume?.spacing ||
      volume?.imageData?.getSpacing?.() ||
      null;
    const direction =
      volume?.direction ||
      volume?.imageData?.getDirection?.() ||
      null;
    if (!spacing || !direction || direction.length < 6) return null;

    // Row & column cosines are the first two direction vectors; their cross
    // product is the slice normal (layout-independent, no assumption about how
    // the 3rd vector is stored).
    const row = [direction[0], direction[1], direction[2]];
    const col = [direction[3], direction[4], direction[5]];
    const normal = cross(row, col);
    const acquisitionPlane = planeForNormal(normal);

    const sp = [Math.abs(spacing[0]), Math.abs(spacing[1]), Math.abs(spacing[2])].filter((v) => v > 0);
    const sMax = Math.max(...sp);
    const sMin = Math.min(...sp);
    const anisotropyRatio = sMin > 0 ? sMax / sMin : 1;
    const isotropic = anisotropyRatio <= 1.5;

    return { acquisitionPlane, spacing: [...spacing], anisotropyRatio, isotropic };
  } catch {
    return null;
  }
};

/**
 * True when viewing `plane` projects across the volume's low-resolution axis,
 * i.e. the result will be blurry. Happens for an anisotropic series viewed in
 * any plane other than its acquisition plane.
 */
export const isCrossPlaneLowRes = (plane, info) => {
  if (!info || info.isotropic) return false;
  return plane !== info.acquisitionPlane;
};

/** Map a projection mode → Cornerstone/VTK BlendMode enum. */
export const blendModeForMode = (mode) => {
  const B = csCore.Enums.BlendModes;
  switch (mode) {
    case PROJECTION_MODES.MIP:
      return B.MAXIMUM_INTENSITY_BLEND;
    case PROJECTION_MODES.MINIP:
      return B.MINIMUM_INTENSITY_BLEND;
    case PROJECTION_MODES.AVERAGE:
      return B.AVERAGE_INTENSITY_BLEND;
    case PROJECTION_MODES.NONE:
    default:
      return B.COMPOSITE;
  }
};

/**
 * Apply a projection mode + slab thickness to a SINGLE volume viewport.
 * No-op (safely) on stack viewports, which lack setBlendMode/setSlabThickness.
 *
 * @param {object} viewport      a Cornerstone3D ORTHOGRAPHIC volume viewport
 * @param {string} mode          one of PROJECTION_MODES
 * @param {number} slabThicknessMm  slab thickness in mm (ignored when mode === NONE)
 */
export const applyProjectionToViewport = (viewport, mode, slabThicknessMm, quality) => {
  if (!viewport || typeof viewport.setBlendMode !== "function") {
    console.warn(
      "[MIP] skip viewport — not a volume viewport (no setBlendMode)",
      { id: viewport?.id, type: viewport?.type }
    );
    return false;
  }

  if (quality) applyRenderQualityToViewport(viewport, quality);

  const active = isProjectionActive(mode);
  const blend = blendModeForMode(active ? mode : PROJECTION_MODES.NONE);
  const mm = active ? clampSlabThickness(slabThicknessMm) : SLAB_THICKNESS_MIN_MM;

  try {
    // immediate=true so the mapper change is flushed without waiting on a
    // separate renderViewports pass.
    viewport.setBlendMode(blend, [], true);
    if (active) {
      viewport.setSlabThickness(mm);
    } else if (typeof viewport.resetSlabThickness === "function") {
      viewport.resetSlabThickness();
    } else {
      viewport.setSlabThickness(mm);
    }
    viewport.render?.();
    console.log("[MIP] applied", {
      id: viewport.id,
      mode,
      blend,
      slabMm: mm,
      readbackSlab: viewport.getSlabThickness?.(),
    });
    return true;
  } catch (e) {
    console.error("[MIP] apply failed on", viewport?.id, e);
    return false;
  }
};

/**
 * Apply a projection mode + slab thickness to every viewport id on an engine,
 * then render the ones that took it. This is what the axial / sagittal / coronal
 * MPR panes all run through so they stay in lock-step.
 *
 * @param {object} engine        the RenderingEngine instance
 * @param {string[]} viewportIds e.g. ["MPR_VOL_AX","MPR_VOL_SAG","MPR_VOL_COR"]
 * @param {string} mode          one of PROJECTION_MODES
 * @param {number} slabThicknessMm
 */
export const applyProjectionToViewports = (engine, viewportIds, mode, slabThicknessMm, quality) => {
  if (!engine || !Array.isArray(viewportIds) || viewportIds.length === 0) {
    console.warn("[MIP] no engine / no viewportIds", { hasEngine: !!engine, viewportIds });
    return;
  }
  const presentIds = engine.getViewports?.().map((v) => v.id) || [];
  console.log("[MIP] applyProjectionToViewports", {
    mode,
    slabThicknessMm,
    quality,
    wanted: viewportIds,
    presentOnEngine: presentIds,
  });
  const touched = [];
  viewportIds.forEach((id) => {
    const vp = engine.getViewport?.(id);
    if (!vp) {
      console.warn("[MIP] viewport not found on engine:", id);
      return;
    }
    if (applyProjectionToViewport(vp, mode, slabThicknessMm, quality)) touched.push(id);
  });
  if (touched.length) {
    try { engine.renderViewports(touched); } catch (e) { console.error("[MIP] renderViewports failed", e); }
  }
};
