// src/modules/radiologist/DicomViewer/hooks/useVolumeMprCrosshair.js
//
// IMAIOS-style canvas crosshair for the 3-pane Volume MPR layout.
// mode="line"    → full-viewport colored lines + center dot
// mode="pointer" → center dot only

import { useEffect, useRef } from "react";
import * as csCore from "@cornerstonejs/core";

const { Enums: csEnums } = csCore;

const DEFAULT_VP_IDS = ["MPR_VOL_AX", "MPR_VOL_SAG", "MPR_VOL_COR"];
const COLORS  = ["#378ADD", "#EF9F27", "#97C459"];

const dot3 = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];

// Stack viewports (2D image-by-image series, used by mpr3/compare/grid) do
// NOT reslice via camera focal-point translation the way volume/orthographic
// viewports do — vp.setCamera() only pans/zooms the currently displayed
// image on a stack. "Reslicing" a stack means jumping to whichever image in
// it sits closest to the target world point, via setImageIdIndex(). This is
// ONLY reached from the non-volMpr call site (stack vpIds) — the volMpr call
// always passes true volume/orthographic viewports, so this branch is never
// exercised there and that behavior is unchanged.
const isStackViewport = (vp) => {
  try { return vp?.type === csEnums.ViewportType.STACK; } catch { return false; }
};

const stackPlaneNormal = (imageId) => {
  try {
    const mod = csCore.metaData.get("imagePlaneModule", imageId);
    let row = mod?.rowCosines;
    let col = mod?.columnCosines;
    if ((!row || !col) && Array.isArray(mod?.imageOrientationPatient) && mod.imageOrientationPatient.length >= 6) {
      const iop = mod.imageOrientationPatient;
      row = [iop[0], iop[1], iop[2]];
      col = [iop[3], iop[4], iop[5]];
    }
    if (!row || !col) return null;
    const n = [
      row[1] * col[2] - row[2] * col[1],
      row[2] * col[0] - row[0] * col[2],
      row[0] * col[1] - row[1] * col[0],
    ];
    const len = Math.hypot(n[0], n[1], n[2]) || 1;
    return [n[0] / len, n[1] / len, n[2] / len];
  } catch {
    return null;
  }
};

// Derive a plane normal straight from a series' own parsed geometry
// (ImageOrientationPatient, falling back to the position delta between its
// first/last slice) — the same source useViewerSync already relies on for
// scroll-sync, used here only as a fallback for when the live Cornerstone
// metadata provider hasn't got imagePlaneModule for these imageIds yet.
const normalFromSeries = (series) => {
  if (Array.isArray(series?.iop) && series.iop.length >= 6) {
    const row = [series.iop[0], series.iop[1], series.iop[2]];
    const col = [series.iop[3], series.iop[4], series.iop[5]];
    const n = [
      row[1] * col[2] - row[2] * col[1],
      row[2] * col[0] - row[0] * col[2],
      row[0] * col[1] - row[1] * col[0],
    ];
    const len = Math.hypot(n[0], n[1], n[2]) || 1;
    if (len > 1e-9) return [n[0] / len, n[1] / len, n[2] / len];
  }
  const pts = (series?.positions || []).filter(Array.isArray);
  if (pts.length >= 2) {
    const a = pts[0];
    const b = pts[pts.length - 1];
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const len = Math.hypot(d[0], d[1], d[2]) || 1;
    if (len > 1e-6) return [d[0] / len, d[1] / len, d[2] / len];
  }
  return null;
};

const resliceStackViewport = (vp, worldPt, fallbackSeries) => {
  try {
    const imageIds = vp.getImageIds?.() || [];
    if (!imageIds.length) { console.log("[3D Pointer/stack] no imageIds on target vp", vp?.id); return; }
    const curIdx = vp.getCurrentImageIdIndex?.() ?? 0;

    // Prefer live Cornerstone metadata (works whenever the WADO loader has
    // already parsed IOP/IPP for these imageIds).
    let normal = stackPlaneNormal(imageIds[curIdx]);
    let source = "metadata";
    let getIpp = (i) => {
      const mod = csCore.metaData.get("imagePlaneModule", imageIds[i]);
      return Array.isArray(mod?.imagePositionPatient) ? mod.imagePositionPatient : null;
    };

    // Fall back to the pre-parsed series geometry (parallel to
    // vp.getImageIds() since both are built from series.urls in the same
    // order) when live metadata isn't available for this pane's images.
    if (!normal && fallbackSeries) {
      normal = normalFromSeries(fallbackSeries);
      source = "fallbackSeries";
      const positions = fallbackSeries.positions || [];
      getIpp = (i) => (Array.isArray(positions[i]) ? positions[i] : null);
    }
    if (!normal) {
      console.log("[3D Pointer/stack] no plane normal found", {
        vpId: vp?.id, hasFallbackSeries: !!fallbackSeries,
      });
      return;
    }

    const want = dot3(worldPt, normal);
    let best = -1;
    let bestErr = Infinity;
    let ippFound = 0;
    for (let i = 0; i < imageIds.length; i++) {
      const ipp = getIpp(i);
      if (!ipp) continue;
      ippFound++;
      const err = Math.abs(dot3(ipp, normal) - want);
      if (err < bestErr) { bestErr = err; best = i; }
    }
    console.log("[3D Pointer/stack] reslice", {
      vpId: vp?.id, source, curIdx, best, ippFound, total: imageIds.length,
      willJump: best >= 0 && best !== curIdx,
    });
    if (best >= 0 && best !== curIdx) vp.setImageIdIndex(best);
    vp.render?.();
  } catch (e) {
    console.log("[3D Pointer/stack] reslice threw", e);
  }
};

export default function useVolumeMprCrosshair({
  enabled,
  mode = "line",
  renderingEngineRef,
  refs,
  readyToken = 0,
  vpIds = DEFAULT_VP_IDS,
  // Optional — only used as a fallback source of slice geometry for STACK
  // viewports when the live Cornerstone metadata provider doesn't have
  // imagePlaneModule for a pane's images yet. Unused (and harmless if
  // omitted) for the volMpr call, which never hits the stack branch.
  availableSeries,
  seriesUidForSlot,
}) {
  const worldRef    = useRef(null);
  const overlaysRef = useRef({});
  const draggingRef = useRef(null);  // slot index being dragged
  const disposedRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      Object.values(overlaysRef.current).forEach(o => { try { o.wrap.remove(); } catch {} });
      overlaysRef.current = {};
      return;
    }

    disposedRef.current = false;
    const listeners = [];   // { el, evt, fn, capture }
    let retryTimer  = null;
    let retryCount  = 0;

    const addL = (el, evt, fn, capture = false) => {
      el.addEventListener(evt, fn, capture);
      listeners.push({ el, evt, fn, capture });
    };

    // ── viewport accessor ────────────────────────────────────────────────
    const getVp = slot => renderingEngineRef?.current?.getViewport?.(vpIds[slot]);

    // ── overlay creation ─────────────────────────────────────────────────
    const ensureOverlay = (slot) => {
      const ex = overlaysRef.current[slot];
      if (ex && ex.wrap.isConnected) return ex;
      const el = refs[slot]?.current;
      if (!el) return null;

      // Cornerstone renders a <canvas> inside the container div.
      // We must append the overlay to the container (not the canvas).
      const parent = el.parentElement || el;
      const color  = COLORS[slot];

      const wrap = document.createElement("div");
      wrap.dataset.mprCrosshair = String(slot);
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

      const o = { wrap, v, h, dot };
      overlaysRef.current[slot] = o;
      return o;
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

    // ── redraw all slots from current world point ─────────────────────────
    const drawAll = () => {
      for (let slot = 0; slot < 3; slot++) {
        const vp = getVp(slot);
        const el = refs[slot]?.current;
        if (!vp || !el) continue;
        let cx = null, cy = null;
        if (worldRef.current) {
          try {
            const c = vp.worldToCanvas(worldRef.current);
            if (c && Number.isFinite(c[0])) { cx = c[0]; cy = c[1]; }
          } catch {}
        }
        if (cx == null) { cx = (el.clientWidth||400)/2; cy = (el.clientHeight||400)/2; }
        drawSlot(slot, cx, cy);
      }
    };

    // ── reslice a volume viewport to a world point ────────────────────────
    const resliceViewport = (vp, worldPt, slot) => {
      if (!vp) return;
      if (isStackViewport(vp)) {
        const uid = seriesUidForSlot?.(slot);
        const fallbackSeries = uid ? availableSeries?.find?.((s) => s.seriesUid === uid) : null;
        resliceStackViewport(vp, worldPt, fallbackSeries);
        return;
      }
      try {
        const cam = vp.getCamera?.();
        if (!cam) return;
        const fp  = cam.focalPoint      || [0,0,0];
        const pos = cam.position        || [0,0,0];
        const vpn = cam.viewPlaneNormal || [0,0,1];
        const d   = [worldPt[0]-fp[0], worldPt[1]-fp[1], worldPt[2]-fp[2]];
        const s   = dot3(d, vpn);
        vp.setCamera({
          ...cam,
          focalPoint: [fp[0]+vpn[0]*s, fp[1]+vpn[1]*s, fp[2]+vpn[2]*s],
          position:   [pos[0]+vpn[0]*s, pos[1]+vpn[1]*s, pos[2]+vpn[2]*s],
        });
        vp.render?.();
      } catch {}
    };

    // ── apply a pointer position on a slot ───────────────────────────────
    const applyPos = (slot, clientX, clientY) => {
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
        for (let s = 0; s < 3; s++) {
          if (s !== slot) resliceViewport(getVp(s), world, s);
        }
        requestAnimationFrame(() => { if (!disposedRef.current) drawAll(); });
      } catch {}
    };

    // ── setup ─────────────────────────────────────────────────────────────
    const setup = () => {
      if (disposedRef.current) return;
      const ready = [0,1,2].every(s => {
        const vp = getVp(s);
        const el = refs[s]?.current;
        return vp && el && el.clientWidth > 0 && typeof vp.canvasToWorld === "function";
      });
      if (!ready) {
        if (retryCount++ < 80) retryTimer = setTimeout(setup, 200);
        else console.warn("[useVolumeMprCrosshair] gave up waiting");
        return;
      }
      console.log("[useVolumeMprCrosshair] attaching ✓");

      // Seed world point at center of axial pane
      const trySeed = (attempt = 0) => {
        if (disposedRef.current) return;
        const vp = getVp(0); const el = refs[0]?.current;
        if (!vp || !el) return;
        try {
          const world = vp.canvasToWorld([(el.clientWidth||400)/2, (el.clientHeight||400)/2]);
          if (world && world.every(Number.isFinite)) { worldRef.current = world; drawAll(); }
          else if (attempt < 30) setTimeout(() => trySeed(attempt+1), 200);
        } catch { if (attempt < 30) setTimeout(() => trySeed(attempt+1), 200); }
      };
      drawAll();
      trySeed();

      // Redraw whenever any viewport re-renders (scroll, zoom, pan)
      for (let slot = 0; slot < 3; slot++) {
        const el = refs[slot]?.current;
        if (!el) continue;
        const onRender = () => { if (!disposedRef.current && worldRef.current) drawAll(); };
        ["cornerstoneimagerendered", "cornerstoneVolumeNewImageEvent",
         "cornerstoneCameraModified", "CORNERSTONE_CAMERA_RESET"].forEach(evt => {
          addL(el, evt, onRender);
        });
      }

      // ── Pointer interaction ───────────────────────────────────────────
      // Strategy: intercept at CAPTURE phase on each viewport element so we
      // run BEFORE CS3D tools. We call applyPos for crosshair movement, then
      // let the event propagate normally so CS3D pan/zoom/scroll still work.
      //
      // pointerdown capture → mark dragging slot, apply pos
      // pointermove capture → if dragging, apply pos (runs alongside CS3D tool)
      // pointerup   capture → clear dragging

      for (let slot = 0; slot < 3; slot++) {
        const el = refs[slot]?.current;
        if (!el) continue;
        const s = slot;

        const onDown = (ev) => {
          if (ev.button !== 0) return;
          draggingRef.current = s;
          applyPos(s, ev.clientX, ev.clientY);
          // Do NOT stopPropagation — CS3D tools must still receive the event
        };
        const onMove = (ev) => {
          if (draggingRef.current !== s) return;
          applyPos(s, ev.clientX, ev.clientY);
        };
        const onUp = () => {
          if (draggingRef.current === s) draggingRef.current = null;
        };

        // Capture phase — runs before CS3D's bubble-phase listeners
        addL(el, "pointerdown",   onDown, true);
        addL(el, "pointermove",   onMove, true);
        addL(el, "pointerup",     onUp,   true);
        addL(el, "pointercancel", onUp,   true);
      }
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
