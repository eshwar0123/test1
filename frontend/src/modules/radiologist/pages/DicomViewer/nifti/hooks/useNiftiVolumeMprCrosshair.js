// nifti/hooks/useNiftiVolumeMprCrosshair.js
//
// IMAIOS-style canvas crosshair for NIfTI viewports.
// Works with 2 or 3 panels — does not require all 3 slots to be mounted.
//
// mode="line"    → full-viewport colored lines + center dot
// mode="pointer" → center dot only

import { useEffect, useRef } from "react";

const NIFTI_VP_IDS = ["NIFTI_SLOT_0", "NIFTI_SLOT_1", "NIFTI_SLOT_2"];
const COLORS = ["#378ADD", "#EF9F27", "#97C459"];

const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export default function useNiftiVolumeMprCrosshair({
  enabled,
  mode = "line",
  renderingEngineRef,
  refs,              // [axRef, sagRef, corRef]
  readyToken = 0,
}) {
  const worldRef    = useRef(null);
  const overlaysRef = useRef({});
  const draggingRef = useRef(null);
  const disposedRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      Object.values(overlaysRef.current).forEach(o => { try { o.wrap.remove(); } catch {} });
      overlaysRef.current = {};
      return;
    }

    disposedRef.current = false;
    const listeners  = [];
    let retryTimer   = null;
    let retryCount   = 0;

    const addL = (el, evt, fn, capture = false) => {
      el.addEventListener(evt, fn, capture);
      listeners.push({ el, evt, fn, capture });
    };

    const getVp = slot =>
      renderingEngineRef?.current?.getViewport?.(NIFTI_VP_IDS[slot]);

    // ── overlay creation ─────────────────────────────────────────────────
    const ensureOverlay = (slot) => {
      const ex = overlaysRef.current[slot];
      if (ex && ex.wrap.isConnected) return ex;
      const el = refs[slot]?.current;
      if (!el) return null;

      const parent = el.parentElement || el;
      const color  = COLORS[slot];

      const wrap = document.createElement("div");
      wrap.dataset.niftiMprCrosshair = String(slot);
      wrap.style.cssText =
        "position:absolute;inset:0;pointer-events:none;z-index:50;overflow:hidden;";

      const v = document.createElement("div");
      v.style.cssText =
        `position:absolute;top:0;bottom:0;width:2px;background:${color};opacity:0.9;` +
        "pointer-events:none;transform:translateX(-50%);will-change:left;";

      const h = document.createElement("div");
      h.style.cssText =
        `position:absolute;left:0;right:0;height:2px;background:${color};opacity:0.9;` +
        "pointer-events:none;transform:translateY(-50%);will-change:top;";

      const dot = document.createElement("div");
      dot.style.cssText =
        `position:absolute;width:14px;height:14px;border-radius:50%;` +
        `border:2.5px solid ${color};background:rgba(0,0,0,0.35);` +
        "pointer-events:none;transform:translate(-50%,-50%);cursor:crosshair;";

      wrap.appendChild(v);
      wrap.appendChild(h);
      wrap.appendChild(dot);
      parent.appendChild(wrap);

      overlaysRef.current[slot] = { wrap, v, h, dot };
      return overlaysRef.current[slot];
    };

    // ── draw one slot ────────────────────────────────────────────────────
    const drawSlot = (slot, cx, cy) => {
      const o = ensureOverlay(slot);
      if (!o) return;
      if (!Number.isFinite(cx)) { o.wrap.style.display = "none"; return; }
      o.wrap.style.display = "block";
      const lines = mode === "line";
      o.v.style.display = lines ? "block" : "none";
      o.h.style.display = lines ? "block" : "none";
      o.v.style.left   = `${cx}px`;
      o.h.style.top    = `${cy}px`;
      o.dot.style.left = `${cx}px`;
      o.dot.style.top  = `${cy}px`;
    };

    // ── redraw all active slots ───────────────────────────────────────────
    const drawAll = (activeSlots) => {
      activeSlots.forEach(slot => {
        const vp = getVp(slot);
        const el = refs[slot]?.current;
        if (!vp || !el) return;
        let cx = null, cy = null;
        if (worldRef.current) {
          try {
            const c = vp.worldToCanvas(worldRef.current);
            if (c && Number.isFinite(c[0])) { cx = c[0]; cy = c[1]; }
          } catch {}
        }
        if (cx == null) { cx = (el.clientWidth || 400) / 2; cy = (el.clientHeight || 400) / 2; }
        drawSlot(slot, cx, cy);
      });
    };

    // ── reslice a viewport to a world point ──────────────────────────────
    const resliceViewport = (vp, worldPt) => {
      try {
        const cam = vp.getCamera?.();
        if (!cam) return;
        const fp  = cam.focalPoint      || [0, 0, 0];
        const pos = cam.position        || [0, 0, 0];
        const vpn = cam.viewPlaneNormal || [0, 0, 1];
        const d   = [worldPt[0] - fp[0], worldPt[1] - fp[1], worldPt[2] - fp[2]];
        const s   = dot3(d, vpn);
        vp.setCamera({
          ...cam,
          focalPoint: [fp[0] + vpn[0] * s, fp[1] + vpn[1] * s, fp[2] + vpn[2] * s],
          position:   [pos[0] + vpn[0] * s, pos[1] + vpn[1] * s, pos[2] + vpn[2] * s],
        });
        vp.render?.();
      } catch {}
    };

    // ── apply a pointer position on a slot ───────────────────────────────
    const applyPos = (slot, clientX, clientY, activeSlots) => {
      const vp = getVp(slot);
      const el = refs[slot]?.current;
      if (!vp || !el) return;
      const rect = el.getBoundingClientRect();
      const cx = clientX - rect.left;
      const cy = clientY - rect.top;
      try {
        const world = vp.canvasToWorld([cx, cy]);
        if (!world || !world.every(Number.isFinite)) return;
        worldRef.current = world;
        drawSlot(slot, cx, cy);
        activeSlots.forEach(s => {
          if (s !== slot) resliceViewport(getVp(s), world);
        });
        requestAnimationFrame(() => { if (!disposedRef.current) drawAll(activeSlots); });
      } catch {}
    };

    // ── setup — works with 2 or 3 ready slots ────────────────────────────
    const setup = () => {
      if (disposedRef.current) return;

      // Find whichever slots are ready (need at least 2)
      const activeSlots = [0, 1, 2].filter(s => {
        const vp = getVp(s);
        const el = refs[s]?.current;
        return vp && el && el.clientWidth > 0 && typeof vp.canvasToWorld === "function";
      });

      if (activeSlots.length < 2) {
        if (retryCount++ < 80) retryTimer = setTimeout(setup, 200);
        else console.warn("[useNiftiVolumeMprCrosshair] gave up waiting for viewports");
        return;
      }
      console.log("[useNiftiVolumeMprCrosshair] attaching slots:", activeSlots);

      // Seed world point at center of first available slot
      const seedSlot = activeSlots[0];
      const trySeed = (attempt = 0) => {
        if (disposedRef.current) return;
        const vp = getVp(seedSlot);
        const el = refs[seedSlot]?.current;
        if (!vp || !el) return;
        try {
          const world = vp.canvasToWorld([(el.clientWidth || 400) / 2, (el.clientHeight || 400) / 2]);
          if (world && world.every(Number.isFinite)) { worldRef.current = world; drawAll(activeSlots); }
          else if (attempt < 30) setTimeout(() => trySeed(attempt + 1), 200);
        } catch { if (attempt < 30) setTimeout(() => trySeed(attempt + 1), 200); }
      };
      drawAll(activeSlots);
      trySeed();

      // Redraw whenever any active viewport re-renders
      activeSlots.forEach(slot => {
        const el = refs[slot]?.current;
        if (!el) return;
        const onRender = () => { if (!disposedRef.current && worldRef.current) drawAll(activeSlots); };
        [
          "cornerstoneimagerendered",
          "cornerstoneVolumeNewImageEvent",
          "cornerstoneCameraModified",
          "CORNERSTONE_CAMERA_RESET",
        ].forEach(evt => addL(el, evt, onRender));
      });

      // Pointer interaction — capture phase so we run before CS3D tools
      activeSlots.forEach(slot => {
        const el = refs[slot]?.current;
        if (!el) return;
        const s = slot;

        const onDown = (ev) => {
          if (ev.button !== 0) return;
          draggingRef.current = s;
          applyPos(s, ev.clientX, ev.clientY, activeSlots);
        };
        const onMove = (ev) => {
          if (draggingRef.current !== s) return;
          applyPos(s, ev.clientX, ev.clientY, activeSlots);
        };
        const onUp = () => {
          if (draggingRef.current === s) draggingRef.current = null;
        };

        addL(el, "pointerdown",   onDown, true);
        addL(el, "pointermove",   onMove, true);
        addL(el, "pointerup",     onUp,   true);
        addL(el, "pointercancel", onUp,   true);
      });
    };

    setup();

    return () => {
      disposedRef.current = true;
      if (retryTimer) clearTimeout(retryTimer);
      listeners.forEach(({ el, evt, fn, capture }) =>
        el.removeEventListener(evt, fn, capture));
      Object.values(overlaysRef.current).forEach(o => { try { o.wrap.remove(); } catch {} });
      overlaysRef.current = {};
      draggingRef.current = null;
      worldRef.current    = null;
    };
  }, [enabled, mode, readyToken]); // eslint-disable-line react-hooks/exhaustive-deps
}
