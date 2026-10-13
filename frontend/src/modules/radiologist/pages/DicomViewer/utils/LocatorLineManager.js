// LocatorLineManager.js
// ──────────────────────────────────────────────────────────────────────────
// PACS-style locator / reference lines (RadiAnt / OsiriX / Horos style).
//
// This is a PURELY ADDITIVE overlay layer. It does NOT touch the MPR setup,
// the CrosshairsTool, the tool groups, or any viewport configuration. It only
// READS camera + plane state from existing Cornerstone3D viewports and emits
// line segments (in canvas/CSS pixels) for an SVG overlay to draw.
//
// How it works
//   • Each viewport displays a plane in patient space defined by its camera:
//       point   = camera.focalPoint        (a point on the plane)
//       normal  = camera.viewPlaneNormal    (the plane's normal)
//   • For a TARGET viewport we draw, for every OTHER (SOURCE) viewport in the
//     same rendering engine, the line where the SOURCE plane intersects the
//     TARGET plane. That intersection line lies inside the target plane, so it
//     projects to a straight line on the target canvas via worldToCanvas().
//   • Parallel planes (same orientation) produce no line and are skipped.
//
// Self-discovering: it listens to the GLOBAL Cornerstone events
// ELEMENT_ENABLED / ELEMENT_DISABLED, so it picks up viewports created by the
// existing rebuild functions without those functions being modified, and it
// survives every series switch / grid-layout rebuild automatically.
//
// Cornerstone3D APIs used (all read-only):
//   eventTarget, Enums.Events.{ELEMENT_ENABLED, ELEMENT_DISABLED,
//     CAMERA_MODIFIED, VOLUME_NEW_IMAGE, STACK_NEW_IMAGE}
//   getRenderingEngine(id), getRenderingEngines()
//   viewport.getCamera()          -> { viewPlaneNormal, focalPoint, ... }
//   viewport.worldToCanvas([x,y,z]) -> [canvasX, canvasY]  (CSS pixels)
//   viewport.getCanvas()          -> <canvas> (for CSS size / clip bounds)

import {
  eventTarget,
  Enums,
  metaData,
  getRenderingEngine,
  getRenderingEngines,
} from "@cornerstonejs/core";

const LINE_COLOR = "#FFFF00";

/* Radiology-standard plane colors (RadiAnt / OsiriX / Horos / Slicer):
     Sagittal -> Blue   Coronal -> Green   Axial -> Orange
   A locator line in a TARGET viewport represents the slice plane of a SOURCE
   viewport, so it is colored by the SOURCE plane's orientation. Orientation is
   derived from the plane normal's dominant axis in patient (LPS) space:
     |x| dominant -> sagittal plane   |y| -> coronal   |z| -> axial            */
const PLANE_COLORS = {
  sagittal: "#378ADD", // Blue
  coronal: "#97C459", // Green
  axial: "#EF9F27", // Orange
};

function colorForNormal(n) {
  if (!n) return LINE_COLOR;
  const ax = Math.abs(n[0]);
  const ay = Math.abs(n[1]);
  const az = Math.abs(n[2]);
  if (ax >= ay && ax >= az) return PLANE_COLORS.sagittal;
  if (ay >= ax && ay >= az) return PLANE_COLORS.coronal;
  return PLANE_COLORS.axial;
}

/* ─── tiny vec3 helpers (plain arrays, no gl-matrix dependency) ─── */
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const normalize = (a) => {
  const len = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / len, a[1] / len, a[2] / len];
};

/* Derive a patient-space plane { n, f } from DICOM image-plane metadata
   (ImageOrientationPatient + ImagePositionPatient) for a given imageId.
   This is the RELIABLE source for StackViewports, where getCamera() may
   return a screen-space normal rather than the true patient-plane normal.
   Returns null when metadata is absent. */
function planeFromMetadata(imageId) {
  if (!imageId) return null;
  let mod = null;
  try {
    mod = metaData.get("imagePlaneModule", imageId);
  } catch {
    mod = null;
  }
  if (!mod) return null;

  let row = mod.rowCosines;
  let col = mod.columnCosines;
  if ((!row || !col) && Array.isArray(mod.imageOrientationPatient) && mod.imageOrientationPatient.length >= 6) {
    const iop = mod.imageOrientationPatient;
    row = [iop[0], iop[1], iop[2]];
    col = [iop[3], iop[4], iop[5]];
  }
  const pos = mod.imagePositionPatient;
  if (!row || !col || !pos) return null;

  const n = normalize(cross([row[0], row[1], row[2]], [col[0], col[1], col[2]]));
  return { n, f: [pos[0], pos[1], pos[2]] };
}

/* Intersection of two planes (n1·x = n1·p1) and (n2·x = n2·p2).
   Returns { point, dir } (a point on the line + its direction) or null when
   the planes are parallel. Normals are assumed (near) unit length — that is
   what Cornerstone cameras provide. */
function intersectPlanes(n1, p1, n2, p2) {
  const d1 = dot(n1, p1);
  const d2 = dot(n2, p2);
  const c = dot(n1, n2);
  const denom = 1 - c * c;
  if (denom < 1e-6) return null; // parallel / coincident → no locator line
  const a = (d1 - d2 * c) / denom;
  const b = (d2 - d1 * c) / denom;
  const point = add(scale(n1, a), scale(n2, b));
  const dir = cross(n1, n2);
  return { point, dir };
}

/* Collapse near-identical locator lines (e.g. two sagittal series at the same
   slice position both project to the ~same vertical line on an axial view).
   Two lines are "the same" when their angle and perpendicular offset match
   within tolerance, so each distinct anatomical plane shows exactly once. */
function dedupeLines(lines, angleTolDeg = 4, offsetTolPx = 8) {
  const seen = new Set();
  const out = [];
  for (const ln of lines) {
    let ang = Math.atan2(ln.y2 - ln.y1, ln.x2 - ln.x1);
    if (ang < 0) ang += Math.PI; // direction-agnostic: 0..π
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    // signed perpendicular distance of the line from the origin
    const offset = -dy * ln.x1 + dx * ln.y1;
    const aBucket = Math.round((ang * 180) / Math.PI / angleTolDeg);
    const oBucket = Math.round(offset / offsetTolPx);
    const key = `${aBucket}|${oBucket}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ln);
  }
  return out;
}

/* Clip an INFINITE line (through p0, direction d) to the rect [0,W]x[0,H].
   Liang–Barsky with t ∈ (-∞, +∞). Returns {x1,y1,x2,y2} or null. */
function clipInfiniteLineToRect(px, py, dx, dy, W, H) {
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return null;
  let tmin = -Infinity;
  let tmax = Infinity;
  const p = [-dx, dx, -dy, dy];
  const q = [px - 0, W - px, py - 0, H - py];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-9) {
      if (q[i] < 0) return null; // parallel to this edge and outside it
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) tmin = Math.max(tmin, t);
      else tmax = Math.min(tmax, t);
    }
  }
  if (tmin > tmax) return null;
  return {
    x1: px + tmin * dx,
    y1: py + tmin * dy,
    x2: px + tmax * dx,
    y2: py + tmax * dy,
  };
}

export default class LocatorLineManager {
  /**
   * @param {object}   opts
   * @param {function} opts.onChange      Called with linesByViewport whenever
   *                                      the lines change:
   *                                      { [viewportId]: [{x1,y1,x2,y2,color}] }
   * @param {string}   [opts.color]       Line color (default #FFFF00).
   * @param {function} [opts.getEnabled]  () => boolean. When it returns false,
   *                                      the manager emits an empty result and
   *                                      skips computation (cheap on/off).
   */
  constructor({ onChange, color = LINE_COLOR, getEnabled, debug = false } = {}) {
    this.onChange = typeof onChange === "function" ? onChange : () => {};
    this.color = color;
    this.getEnabled = typeof getEnabled === "function" ? getEnabled : () => true;
    this.debug = !!debug;

    // viewportId -> { element, renderingEngineId, resizeObserver }
    this.tracked = new Map();
    this.lastLines = {};
    this._rafId = null;
    this._destroyed = false;

    // bound handlers (stable refs for add/removeEventListener)
    this._onElementEnabled = this._onElementEnabled.bind(this);
    this._onElementDisabled = this._onElementDisabled.bind(this);
    this._onViewportChanged = this._scheduleRecompute.bind(this);
  }

  /* Begin listening. Also picks up any viewports that already exist. */
  start() {
    if (this._destroyed) return;
    eventTarget.addEventListener(
      Enums.Events.ELEMENT_ENABLED,
      this._onElementEnabled
    );
    eventTarget.addEventListener(
      Enums.Events.ELEMENT_DISABLED,
      this._onElementDisabled
    );

    // Adopt viewports that were enabled before we started.
    try {
      (getRenderingEngines() || []).forEach((engine) => {
        (engine.getViewports?.() || []).forEach((vp) => {
          const element = vp.element || engine.getViewport?.(vp.id)?.element;
          if (element) this._track(vp.id, element, engine.id);
        });
      });
    } catch {
      /* engines not ready yet — ELEMENT_ENABLED will cover them */
    }
    this._scheduleRecompute();
  }

  _onElementEnabled(evt) {
    const { element, viewportId, renderingEngineId } = evt.detail || {};
    if (!element || !viewportId) return;
    this._track(viewportId, element, renderingEngineId);
    this._scheduleRecompute();
  }

  _onElementDisabled(evt) {
    const { viewportId } = evt.detail || {};
    if (!viewportId) return;
    this._untrack(viewportId);
    this._scheduleRecompute();
  }

  _track(viewportId, element, renderingEngineId) {
    if (this.tracked.has(viewportId)) return;

    element.addEventListener(Enums.Events.CAMERA_MODIFIED, this._onViewportChanged);
    element.addEventListener(Enums.Events.VOLUME_NEW_IMAGE, this._onViewportChanged);
    element.addEventListener(Enums.Events.STACK_NEW_IMAGE, this._onViewportChanged);

    // Resizing a viewport changes the canvas bounds → recompute clip.
    let resizeObserver = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => this._scheduleRecompute());
      try {
        resizeObserver.observe(element);
      } catch {
        resizeObserver = null;
      }
    }

    this.tracked.set(viewportId, { element, renderingEngineId, resizeObserver });
  }

  _untrack(viewportId) {
    const entry = this.tracked.get(viewportId);
    if (!entry) return;
    const { element, resizeObserver } = entry;
    try {
      element.removeEventListener(Enums.Events.CAMERA_MODIFIED, this._onViewportChanged);
      element.removeEventListener(Enums.Events.VOLUME_NEW_IMAGE, this._onViewportChanged);
      element.removeEventListener(Enums.Events.STACK_NEW_IMAGE, this._onViewportChanged);
    } catch {}
    try {
      resizeObserver?.disconnect();
    } catch {}
    this.tracked.delete(viewportId);
  }

  _scheduleRecompute() {
    if (this._destroyed || this._rafId != null) return;
    const raf =
      typeof requestAnimationFrame === "function"
        ? requestAnimationFrame
        : (cb) => setTimeout(cb, 16);
    this._rafId = raf(() => {
      this._rafId = null;
      this._recompute();
    });
  }

  _recompute() {
    if (this._destroyed) return;

    if (!this.getEnabled()) {
      if (Object.keys(this.lastLines).length) {
        this.lastLines = {};
        this.onChange({});
      }
      return;
    }

    // Group tracked viewports by rendering engine and resolve live objects.
    const groups = new Map(); // renderingEngineId -> [{ viewportId, vp }]
    this.tracked.forEach((entry, viewportId) => {
      const engine = getRenderingEngine(entry.renderingEngineId);
      const vp = engine?.getViewport?.(viewportId);
      if (!vp) return;

      let plane = null;
      let planeSource = "none";

      // StackViewport: prefer real patient plane from DICOM IPP/IOP metadata,
      // since getCamera() can report a screen-space normal for 2D stacks.
      const isStack = vp.type === Enums.ViewportType.STACK;
      if (isStack) {
        let imageId = null;
        try {
          imageId = vp.getCurrentImageId?.();
        } catch {}
        plane = planeFromMetadata(imageId);
        if (plane) planeSource = "metadata";
      }

      // VolumeViewport (true MPR) — or stack fallback — use the camera, which
      // for orthographic volume viewports IS the patient-space slice plane.
      if (!plane) {
        try {
          const cam = vp.getCamera?.();
          if (cam?.viewPlaneNormal && cam?.focalPoint) {
            plane = { n: normalize(cam.viewPlaneNormal), f: cam.focalPoint };
            planeSource = "camera";
          }
        } catch {
          plane = null;
        }
      }

      if (!plane) return;
      const list = groups.get(entry.renderingEngineId) || [];
      list.push({ viewportId, vp, plane, planeSource });
      groups.set(entry.renderingEngineId, list);
    });

    if (this.debug) {
      const round = (v) =>
        Array.isArray(v) ? v.map((x) => Math.round(x * 1000) / 1000) : v;
      const summary = [];
      groups.forEach((members, engineId) => {
        members.forEach((m) => {
          summary.push({
            engine: engineId,
            viewportId: m.viewportId,
            source: m.planeSource,
            normal: round(m.plane.n),
            focal: round(m.plane.f),
          });
        });
      });
      // eslint-disable-next-line no-console
      console.log(
        `[Locator] tracked=${this.tracked.size} withPlane=${summary.length} ` +
          `engines=${groups.size} | If two viewports share the SAME normal, ` +
          `they are parallel → no line (Loc: 0).`,
        summary
      );
    }

    const linesByViewport = {};

    groups.forEach((members) => {
      if (members.length < 2) return;
      members.forEach((target) => {
        // Canvas (CSS) size of the target viewport for clipping.
        let W = 0;
        let H = 0;
        try {
          const canvasEl = target.vp.getCanvas?.();
          W = canvasEl?.clientWidth || canvasEl?.width || 0;
          H = canvasEl?.clientHeight || canvasEl?.height || 0;
        } catch {}
        if (!W || !H) return;

        const lines = [];
        members.forEach((source) => {
          if (source.viewportId === target.viewportId) return;

          const hit = intersectPlanes(
            source.plane.n,
            source.plane.f,
            target.plane.n,
            target.plane.f
          );
          if (!hit) return; // parallel planes → no locator line

          // Two world points on the intersection line, projected to canvas.
          const w0 = hit.point;
          const w1 = add(hit.point, hit.dir);
          let c0;
          let c1;
          try {
            c0 = target.vp.worldToCanvas(w0);
            c1 = target.vp.worldToCanvas(w1);
          } catch {
            return;
          }
          if (!c0 || !c1) return;

          const dx = c1[0] - c0[0];
          const dy = c1[1] - c0[1];
          const seg = clipInfiniteLineToRect(c0[0], c0[1], dx, dy, W, H);
          if (!seg) return;

          lines.push({
            x1: seg.x1,
            y1: seg.y1,
            x2: seg.x2,
            y2: seg.y2,
            // Color by the SOURCE plane's orientation so each reference line
            // matches the radiology-standard color of the plane it represents.
            color: colorForNormal(source.plane.n),
            sourceViewportId: source.viewportId,
          });
        });

        const distinct = dedupeLines(lines);
        if (distinct.length) linesByViewport[target.viewportId] = distinct;
      });
    });

    this.lastLines = linesByViewport;
    this.onChange(linesByViewport);
  }

  /* Force a recompute (e.g. after an external camera change you triggered). */
  refresh() {
    this._scheduleRecompute();
  }

  /* Remove every listener / observer. Safe to call multiple times. */
  destroy() {
    this._destroyed = true;
    if (this._rafId != null) {
      try {
        (typeof cancelAnimationFrame === "function"
          ? cancelAnimationFrame
          : clearTimeout)(this._rafId);
      } catch {}
      this._rafId = null;
    }
    try {
      eventTarget.removeEventListener(
        Enums.Events.ELEMENT_ENABLED,
        this._onElementEnabled
      );
      eventTarget.removeEventListener(
        Enums.Events.ELEMENT_DISABLED,
        this._onElementDisabled
      );
    } catch {}
    Array.from(this.tracked.keys()).forEach((vpId) => this._untrack(vpId));
    this.tracked.clear();
    this.lastLines = {};
  }
}
