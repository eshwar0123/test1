// nifti/hooks/useNiftiReferenceLinesOverlay.js
//
// Horos-style reference lines for NIfTI MPR viewports.
// Returns linesBySlot: { [slot]: [{x1,y1,x2,y2,color}] }
// Pass linesBySlot[slot] to <LocatorLineOverlay lines={...} /> in each viewport cell.

import { useState, useEffect, useRef, useCallback } from "react";
import { subscribePosition } from "../../utils/WorldSyncStore";

const NIFTI_VP_IDS = ["NIFTI_SLOT_0", "NIFTI_SLOT_1", "NIFTI_SLOT_2"];
const COLORS       = ["#378ADD",      "#EF9F27",      "#97C459"];

// ── vector math ───────────────────────────────────────────────────────────────
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const add3   = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale3 = (s, a) => [s * a[0], s * a[1], s * a[2]];
const normalize3 = (a) => {
  const len = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / len, a[1] / len, a[2] / len];
};

function intersectPlanes(n1, p1, n2, p2) {
  const d1    = dot3(n1, p1);
  const d2    = dot3(n2, p2);
  const c     = dot3(n1, n2);
  const denom = 1 - c * c;
  if (denom < 1e-6) return null;
  const a     = (d1 - d2 * c) / denom;
  const b     = (d2 - d1 * c) / denom;
  const point = add3(scale3(a, n1), scale3(b, n2));
  const dir   = cross3(n1, n2);
  return { point, dir };
}

function worldToScreen(cam, worldPt, W, H) {
  const vu = normalize3(cam.viewUp);
  const vn = normalize3(cam.viewPlaneNormal);
  const vr = normalize3(cross3(vu, vn));
  const d = [
    worldPt[0] - cam.focalPoint[0],
    worldPt[1] - cam.focalPoint[1],
    worldPt[2] - cam.focalPoint[2],
  ];
  const pxPerUnit = (H / 2) / cam.parallelScale;
  const sx = W / 2 + dot3(d, vr) * pxPerUnit;
  const sy = H / 2 - dot3(d, vu) * pxPerUnit;
  return [sx, sy];
}

function clipInfiniteLineToRect(px, py, dx, dy, W, H) {
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return null;
  let tMin = -Infinity, tMax = Infinity;
  const p = [-dx, dx, -dy, dy];
  const q = [px, W - px, py, H - py];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-9) {
      if (q[i] < 0) return null;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) tMin = Math.max(tMin, t);
      else           tMax = Math.min(tMax, t);
    }
  }
  if (tMin > tMax) return null;
  return { x1: px + tMin * dx, y1: py + tMin * dy,
           x2: px + tMax * dx, y2: py + tMax * dy };
}

export default function useNiftiReferenceLinesOverlay({
  enabled,
  renderingEngineRef,
  refs,
  readyToken = 0,
}) {
  const [linesBySlot, setLinesBySlot] = useState({});
  const disposedRef  = useRef(false);

  // ── Stable refs so callbacks don't trigger re-runs on every render ──────────
  const refsRef              = useRef(refs);
  const renderingEngineRefRef = useRef(renderingEngineRef);
  useEffect(() => { refsRef.current = refs; });
  useEffect(() => { renderingEngineRefRef.current = renderingEngineRef; });

  // getVp never changes identity — reads from refs
  const getVp = useCallback((slot) =>
    renderingEngineRefRef.current?.current?.getViewport?.(NIFTI_VP_IDS[slot]),
  []); // eslint-disable-line react-hooks/exhaustive-deps

  // recompute never changes identity — reads from refs
  const recompute = useCallback((activeSlots) => {
    if (disposedRef.current) return;
    const refs_ = refsRef.current;
    const result = {};
    activeSlots.forEach((targetSlot) => {
      const targetVp = getVp(targetSlot);
      const el       = refs_[targetSlot]?.current;
      if (!targetVp || !el) return;

      const W = el.clientWidth  || 0;
      const H = el.clientHeight || 0;
      if (!W || !H) return;

      let tgtCam;
      try { tgtCam = targetVp.getCamera?.(); } catch {}
      if (!tgtCam?.viewPlaneNormal || !tgtCam?.focalPoint ||
          !tgtCam?.viewUp || !tgtCam?.parallelScale) return;

      const n2 = normalize3(tgtCam.viewPlaneNormal);
      const p2 = tgtCam.focalPoint;

      const srcSlot = activeSlots.find(s => s !== targetSlot);
      if (srcSlot == null) return;

      const srcVp = getVp(srcSlot);
      if (!srcVp) return;
      let srcCam;
      try { srcCam = srcVp.getCamera?.(); } catch {}
      if (!srcCam?.viewPlaneNormal || !srcCam?.focalPoint) return;

      const n1 = normalize3(srcCam.viewPlaneNormal);
      const p1 = srcCam.focalPoint;

      const hit = intersectPlanes(n1, p1, n2, p2);
      if (!hit) return;

      const dirNorm = normalize3(hit.dir);
      const toP2 = [p2[0] - hit.point[0], p2[1] - hit.point[1], p2[2] - hit.point[2]];
      const t = dot3(toP2, dirNorm);
      const refPt = [
        hit.point[0] + t * dirNorm[0],
        hit.point[1] + t * dirNorm[1],
        hit.point[2] + t * dirNorm[2],
      ];

      const c0 = worldToScreen(tgtCam, refPt, W, H);
      const c1 = worldToScreen(tgtCam, add3(refPt, dirNorm), W, H);

      if (!Number.isFinite(c0[0]) || !Number.isFinite(c0[1]) ||
          !Number.isFinite(c1[0]) || !Number.isFinite(c1[1])) return;

      const dx = c1[0] - c0[0];
      const dy = c1[1] - c0[1];
      const seg = clipInfiniteLineToRect(c0[0], c0[1], dx, dy, W, H);
      if (!seg) return;

      result[targetSlot] = [{ x1: seg.x1, y1: seg.y1, x2: seg.x2, y2: seg.y2, color: COLORS[srcSlot] }];
    });
    setLinesBySlot(result);
  }, [getVp]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!enabled) {
      setLinesBySlot({});
      return;
    }

    disposedRef.current = false;
    const listeners = [];
    let retryTimer = null, retryCount = 0;
    let unsubPos = null;
    let activeSlots = [];

    const addL = (el, evt, fn) => {
      el.addEventListener(evt, fn);
      listeners.push({ el, evt, fn });
    };

    const onUpdate = () => recompute(activeSlots);

    const setup = () => {
      if (disposedRef.current) return;
      activeSlots = [0, 1, 2].filter((s) => {
        const vp = getVp(s);
        const el = refsRef.current[s]?.current;
        return vp && el && el.clientWidth > 0;
      });

      if (activeSlots.length < 2) {
        if (retryCount++ < 80) retryTimer = setTimeout(setup, 200);
        else console.warn("[useNiftiReferenceLinesOverlay] gave up waiting for viewports");
        return;
      }

      recompute(activeSlots);

      activeSlots.forEach((slot) => {
        const el = refsRef.current[slot]?.current;
        if (!el) return;
        [
          "cornerstoneimagerendered",
          "cornerstoneVolumeNewImageEvent",
          "cornerstoneCameraModified",
          "CORNERSTONE_CAMERA_RESET",
        ].forEach((evt) => addL(el, evt, onUpdate));
      });

      unsubPos = subscribePosition(() => {
        requestAnimationFrame(onUpdate);
      });
    };

    setup();

    return () => {
      disposedRef.current = true;
      unsubPos?.();
      if (retryTimer) clearTimeout(retryTimer);
      listeners.forEach(({ el, evt, fn }) => el.removeEventListener(evt, fn));
    };
  }, [enabled, readyToken, recompute, getVp]); // refs removed — accessed via refsRef

  return linesBySlot;
}
