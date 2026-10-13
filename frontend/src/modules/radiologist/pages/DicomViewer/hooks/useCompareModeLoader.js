// src/modules/radiologist/DicomViewer/hooks/useCompareModeLoader.js
//
// Drives the 2x2 compare layout: four independent stack viewports, each
// bound to a different DICOM series from the same study. Coexists with
// useViewerDataLoader — only one of them is "active" at a time, gated by
// `layoutMode`.
//
// Key design decisions:
//   - We give the compare engine its own renderingEngineId + toolGroupId so
//     when the user toggles back to 3-up MPR, useViewerDataLoader rebuilds
//     cleanly without colliding with us.
//   - On a tile click, only the CHANGED viewport gets a new setStack call.
//     The other three viewports keep their state (scroll position, W/L).
//     This is much smoother than nuking the engine.
//   - We track "previously mounted UID per viewport" in a ref so the mount
//     effect can diff without triggering its own re-renders.
//   - Tools are wired to all 4 viewports so wheel-scroll / right-click W/L
//     work consistently with the 3-up mode.

import { useEffect, useRef, useState } from "react";
import * as csCore from "@cornerstonejs/core";
import {
  ToolGroupManager,
  Enums as ToolsEnums,
  WindowLevelTool,
  PanTool,
  ZoomTool,
  StackScrollTool,
  LengthTool,
  RectangleROITool,
  CircleROITool,
  PlanarFreehandROITool,
  ArrowAnnotateTool,
} from "@cornerstonejs/tools";
import { initCornerstoneOnce } from "./useCornerstoneInit";
import { buildImageId, waitForElementsReady } from "../utils/viewerUtils";

const buildViewportIds = (slotCount) =>
  Array.from({ length: slotCount }, (_, i) => `COMPARE_SLOT_${i}`);

const safeAddTool = (toolGroup, toolName, options) => {
  try {
    toolGroup.addTool(toolName, options);
  } catch (e) {
    const msg = String(e?.message || e || "");
    if (!msg.includes("already registered")) throw e;
  }
};

/**
 * @param {Object} opts
 * @param {boolean} opts.enabled                 Only run when true (i.e. layoutMode === 'compare2x2')
 * @param {Array} opts.availableSeries           Output of useSeriesGrouping
 * @param {{0,1,2,3}} opts.viewportSeriesMap     seriesUid (or null) per viewport slot
 * @param {Object} opts.refs                     { 0: axRef, 1: sagRef, 2: corRef, 3: compareSlot3Ref }
 * @param {Function} opts.setError
 * @param {Function} opts.setLoading
 * @param {React.MutableRefObject} opts.renderingEngineRef
 * @param {React.MutableRefObject} opts.renderingEngineIdRef
 * @param {React.MutableRefObject} opts.toolGroupIdRef
 * @param {React.MutableRefObject} opts.viewportIdsRef
 * @param {Function} opts.onSliceCountChange     Called per slot when stack is mounted: (slot, total) => void
 * @param {Function} opts.onSlotLoading          Called per slot at start/end of mount: (slot, isLoading) => void
 */
export default function useCompareModeLoader({
  enabled,
  availableSeries,
  viewportSeriesMap,
  refs,                         // Array<RefObject> length=slotCount, or {0,1,2,3} legacy
  slotCount = 4,                // total viewport slots; default 4 for legacy compare2x2
  setError,
  setLoading,
  renderingEngineRef,
  renderingEngineIdRef,
  toolGroupIdRef,
  viewportIdsRef,
  onSliceCountChange,
  onSlotLoading,
}) {
  const VIEWPORT_IDS = buildViewportIds(slotCount);
  // Build an empty {0,1,...,N-1} keyed map of any uniform value
  const emptyMap = (val = null) =>
    Object.fromEntries(VIEWPORT_IDS.map((_, i) => [i, val]));
  // Resolve a ref by slot index — supports both array and legacy object form.
  const getRef = (slot) => (Array.isArray(refs) ? refs[slot] : refs?.[slot]);

  /* Track what's currently mounted per viewport so the mount effect can
     diff without re-renders. Cleared on every enable/disable cycle. */
  const mountedUidRef = useRef(emptyMap(null));
  const engineLocalRef = useRef(null);
  const toolGroupLocalIdRef = useRef(null);
  // engineReady gates the mount effect — without it, the auto-populate
  // useEffect in Dicomviewer can fire BEFORE engine setup completes, and the
  // resulting mount silently no-ops (vp = engine.getViewport(...) = undefined).
  // Toggling engineReady at the end of setup forces the mount effect to
  // re-fire with the now-populated viewportSeriesMap.
  const [engineReady, setEngineReady] = useState(false);

  /* ─── Engine setup / teardown effect ──────────────────────────
     Runs once per enabled toggle. When we enable, build a fresh engine
     with N viewports. When we disable (or unmount), tear it all down. */
  useEffect(() => {
    if (!enabled) {
      mountedUidRef.current = emptyMap(null);
      setEngineReady(false);
      return;
    }

    let cancelled = false;
    let localEngine = null;
    let localToolGroupId = null;

    const run = async () => {
      try {
        setLoading(true);
        setError(null);

        console.log(`[useCompareModeLoader] setup START (slotCount=${slotCount})`);

        // Make sure Cornerstone is initialized
        await initCornerstoneOnce();
        if (cancelled) return;

        // Give React more time to commit the grid DOM, especially for larger
        // grids (3x3 etc). Larger N → more elements → more layout work.
        const initialWait = Math.max(150, slotCount * 50);
        await new Promise((r) => setTimeout(r, initialWait));
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        );
        if (cancelled) return;

        const elements = VIEWPORT_IDS.map((_, idx) => getRef(idx)?.current);
        console.log(
          `[useCompareModeLoader] elements check:`,
          elements.map((el, i) => `slot${i}: ${el ? `${el.clientWidth}x${el.clientHeight}` : "NULL"}`).join(", ")
        );
        const allReady = await waitForElementsReady(elements);
        if (!allReady) {
          console.error(
            `[useCompareModeLoader] elements NOT ready after wait:`,
            elements.map((el, i) => `slot${i}: ${el ? `${el.clientWidth}x${el.clientHeight}` : "NULL"}`).join(", ")
          );
          throw new Error("Compare viewports not ready (layout 0 size).");
        }
        console.log(
          `[useCompareModeLoader] elements ready:`,
          elements.map((el, i) => `slot${i}: ${el.clientWidth}x${el.clientHeight}`).join(", ")
        );

        // Build a fresh engine for compare mode. Use a distinct id so we
        // never collide with the MPR engine when switching modes quickly.
        const renderingEngineId = `compare_engine_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const toolGroupId = `compare_tools_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        renderingEngineIdRef.current = renderingEngineId;
        toolGroupIdRef.current = toolGroupId;
        localToolGroupId = toolGroupId;

        const engine = new csCore.RenderingEngine(renderingEngineId);
        localEngine = engine;
        engineLocalRef.current = engine;
        renderingEngineRef.current = engine;

        // Register each viewport individually via enableElement instead of
        // the batch setViewports API — Cornerstone3D's setViewports silently
        // drops viewports past the first 2 in our setup (observed in our
        // version). enableElement is the per-viewport API that works reliably.
        for (let idx = 0; idx < VIEWPORT_IDS.length; idx++) {
          const vpId = VIEWPORT_IDS[idx];
          const el = elements[idx];
          if (!el) {
            console.warn(`[useCompareModeLoader] slot ${idx}: no element, cannot enable`);
            continue;
          }
          try {
            engine.enableElement({
              viewportId: vpId,
              type: csCore.Enums.ViewportType.STACK,
              element: el,
              defaultOptions: {},
            });
            console.log(`[useCompareModeLoader] enabled viewport ${vpId}`);
          } catch (e) {
            console.error(`[useCompareModeLoader] enableElement failed for ${vpId}:`, e);
          }
        }
        viewportIdsRef.current = [...VIEWPORT_IDS];
        engine.resize(true, false);

        // Verify all N viewports actually got registered
        const registered = VIEWPORT_IDS.map((vpId) => !!engine.getViewport(vpId));
        console.log(
          `[useCompareModeLoader] viewports registered:`,
          VIEWPORT_IDS.map((vpId, i) => `${vpId}: ${registered[i]}`).join(", ")
        );
        if (registered.some((r) => !r)) {
          console.error("[useCompareModeLoader] some viewports failed to register!");
        }

        // Build the tool group covering all 4 viewports
        let tg = ToolGroupManager.getToolGroup(toolGroupId);
        if (!tg) tg = ToolGroupManager.createToolGroup(toolGroupId);
        if (!tg) throw new Error("Failed to create compare-mode tool group.");

        VIEWPORT_IDS.forEach((vpId) => {
          try { tg.addViewport(vpId, renderingEngineId); } catch {}
        });
        safeAddTool(tg, StackScrollTool.toolName);
        safeAddTool(tg, PanTool.toolName);
        safeAddTool(tg, WindowLevelTool.toolName);
        safeAddTool(tg, ZoomTool.toolName);
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
        tg.setToolActive(StackScrollTool.toolName, {
          bindings: [{ mouseButton: ToolsEnums.MouseBindings.Wheel }],
        });
        tg.setToolActive(PanTool.toolName, {
          bindings: [{ mouseButton: ToolsEnums.MouseBindings.Auxiliary }],
        });
        tg.setToolActive(WindowLevelTool.toolName, {
          bindings: [{ mouseButton: ToolsEnums.MouseBindings.Secondary }],
        });

        // Reset mount tracker; the next effect will populate
        mountedUidRef.current = emptyMap(null);
        setLoading(false);
        // Signal that the engine is ready. The mount effect depends on this
        // and will re-fire to populate the viewports, even if auto-populate
        // ran before this effect completed.
        setEngineReady(true);
        console.log("[useCompareModeLoader] engine ready");
      } catch (e) {
        if (cancelled) return;
        console.error("[useCompareModeLoader] setup failed:", e);
        setError(e?.message || "Failed to set up compare mode.");
        setLoading(false);
      }
    };

    run();

    return () => {
      cancelled = true;
      try {
        const tgId = localToolGroupId || toolGroupIdRef.current;
        if (tgId) ToolGroupManager.destroyToolGroup(tgId);
      } catch {}
      try { localEngine?.destroy(); } catch {}
      if (renderingEngineRef.current === localEngine) {
        renderingEngineRef.current = null;
      }
      engineLocalRef.current = null;
      mountedUidRef.current = emptyMap(null);
      setEngineReady(false);
      try { csCore.cache.purgeCache(); } catch {}
    };
  }, [enabled, slotCount]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ─── Per-viewport mount effect ───────────────────────────────
     Runs whenever the viewport-series mapping changes. For each slot
     whose UID differs from what's currently mounted there, set a new
     stack. We do NOT touch slots that haven't changed. */
  useEffect(() => {
    if (!enabled) return;
    if (!engineReady) return;            // wait for setup to finish
    if (!availableSeries || availableSeries.length === 0) return;
    const engine = engineLocalRef.current || renderingEngineRef.current;
    if (!engine) return;

    console.log(
      `[useCompareModeLoader] mount effect FIRED: slotCount=${slotCount}, viewportSeriesMap=`,
      Object.fromEntries(
        VIEWPORT_IDS.map((_, i) => [i, viewportSeriesMap?.[i] || "(empty)"])
      )
    );

    let cancelled = false;

    const mountIfChanged = async () => {
      /* Per-slot mount task. Each slot runs independently — Promise.all below
         fires all 4 in parallel so total mount time is ~max(slot) instead of
         sum(slots). For a 4-sequence MRI this brings 2x2 entry from ~25s to
         under ~8s on typical hardware. */
      const mountSlot = async (slot) => {
        if (cancelled) return;
        const targetUid = viewportSeriesMap[slot];
        const currentUid = mountedUidRef.current[slot];
        if (targetUid === currentUid) return;

        const vpId = VIEWPORT_IDS[slot];
        const vp = engine.getViewport(vpId);
        if (!vp) {
          console.warn(`[useCompareModeLoader] slot ${slot}: viewport ${vpId} not in engine (skip)`);
          return;
        }

        if (!targetUid) {
          // No series assigned — clear via empty stack call swallowed in try
          try { await vp.setStack([]); } catch {}
          mountedUidRef.current[slot] = null;
          onSliceCountChange?.(slot, 0);
          return;
        }

        const series = availableSeries.find((s) => s.seriesUid === targetUid);
        if (!series || !Array.isArray(series.urls) || series.urls.length === 0) {
          console.warn(`[useCompareModeLoader] slot ${slot}: series not found or empty for uid`, targetUid);
          // Clear loading flag so the spinner doesn't get stuck
          onSlotLoading?.(slot, false);
          return;
        }

        try {
          const imageIds = series.urls.map(buildImageId);
          const midIdx = Math.floor(imageIds.length / 2);
          console.log(
            `[useCompareModeLoader] mounting slot ${slot}: SE ${series.seriesNumber} "${series.seriesDescription}" ` +
            `(${imageIds.length} images, midIdx=${midIdx}, isScout=${series.isScout})`
          );
          onSlotLoading?.(slot, true);
          // Pre-load the middle image. If this throws we still try setStack
          // (some series have partial decodes that work for other slices).
          try {
            await csCore.imageLoader.loadAndCacheImage(imageIds[midIdx]);
          } catch (e) {
            console.warn(`[useCompareModeLoader] slot ${slot} mid-image pre-load failed:`, e?.message || e);
          }
          if (cancelled) { onSlotLoading?.(slot, false); return; }
          try {
            await vp.setStack(imageIds, midIdx);
          } catch (e) {
            // If setStack with the whole stack fails, try first image only as
            // a last-ditch fallback. Some series (mixed orientations, multi-
            // frame DICOMDIR files) reject the full stack.
            console.warn(`[useCompareModeLoader] slot ${slot}: setStack(full) failed: ${e?.message}; retrying with first image only`);
            await vp.setStack([imageIds[0]], 0);
          }
          // Force engine to re-measure canvas; the viewport's div may have
          // resized between setup and this mount (e.g. when the strip
          // appears/disappears).
          try { engine.resize(true, false); } catch {}
          // Reset camera so the image fits the viewport. Without this, the
          // image can land off-center / zoomed past the visible area and
          // look like a black viewport.
          try { vp.resetCamera(); } catch {}
          vp.render();
          mountedUidRef.current[slot] = targetUid;
          // Use the viewport's actual imageIds count (in case fallback above
          // reduced the stack to 1).
          const finalCount = vp.getImageIds?.()?.length || imageIds.length;
          onSliceCountChange?.(slot, finalCount);
          onSlotLoading?.(slot, false);
          console.log(`[useCompareModeLoader] slot ${slot} mounted OK (final imageIds count=${finalCount})`);
        } catch (e) {
          console.error(`[useCompareModeLoader] slot ${slot}: FATAL mount error:`, e);
          onSlotLoading?.(slot, false);
        }
      };

      // Fire all slot-mounts SEQUENTIALLY. Parallel Promise.all was fast but
      // Cornerstone3D's setStack appears to fail on concurrent calls when
      // there are more than 2 viewports. Sequential is slower but reliable.
      console.log(`[useCompareModeLoader] starting sequential mount of ${slotCount} slots`);
      for (let slot = 0; slot < slotCount; slot++) {
        if (cancelled) break;
        await mountSlot(slot);
      }
      console.log(`[useCompareModeLoader] done mounting all ${slotCount} slots`);
    };

    mountIfChanged();

    return () => { cancelled = true; };
    // Build a stable key from all per-slot uids so the effect re-fires on
    // any change. This replaces the previous hardcoded
    // viewportSeriesMap[0..3] deps so it scales with slotCount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    enabled,
    engineReady,
    availableSeries,
    slotCount,
    Array.from({ length: slotCount }, (_, i) => viewportSeriesMap?.[i] || "").join("|"),
  ]);
}
