// src/modules/radiologist/pages/DicomViewer/hooks/useVolumeMprLoader.js
//
// 3-PANE VOLUME MPR — axial / sagittal / coronal reformats of ONE series.
//
// Strategy: register unconditional metadata providers for imagePixelModule and
// imagePlaneModule BEFORE calling createAndCacheVolume. This bypasses the
// unreliable loadAndCacheImage warm-up that fails on S3 blob URLs. The volume
// builder reads our providers, allocates the volume, and volume.load() handles
// actual DICOM pixel loading internally via the WADO image loader.

import { useEffect } from "react";
import * as csCore from "@cornerstonejs/core";
import dicomParser from "dicom-parser";
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
import { initCornerstoneOnce } from "./useCornerstoneInit";
import { buildImageId, waitForElementsReady } from "../utils/viewerUtils";
import { applyProjectionToViewports } from "../dicom/utils/projectionModes";

export const MPR_VP_IDS = ["MPR_VOL_AX", "MPR_VOL_SAG", "MPR_VOL_COR"];

const ORIENTATIONS = () => {
  const O = csCore.Enums.OrientationAxis;
  return [O.AXIAL, O.SAGITTAL, O.CORONAL];
};

const safeAddTool = (tg, name, opts) => {
  try { tg.addTool(name, opts); }
  catch (e) { if (!String(e?.message || e).includes("already")) throw e; }
};

export default function useVolumeMprLoader({
  enabled,
  seriesUid,
  availableSeries,
  refs,
  setError,
  setLoading,
  renderingEngineRef,
  renderingEngineIdRef,
  toolGroupIdRef,
  viewportIdsRef,
  getProjection,
  onReady,
}) {
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let localEngine = null;
    let localTgId = null;
    const registeredProviders = [];

    // Capture specific internal Cornerstone3D console.warn messages so we
    // can surface them directly in the on-screen error, instead of needing
    // DevTools console access to see whether a known failure mode (cache
    // eviction, image-not-found) occurred during this attempt.
    const capturedWarnings = [];
    const WATCH_PATTERNS = ["purged from the cache", "Image not found for imageId", "truncated fetch"];
    const originalWarn = console.warn.bind(console);
    console.warn = (...args) => {
      try {
        const text = args.map((a) => (typeof a === "string" ? a : "")).join(" ");
        if (WATCH_PATTERNS.some((p) => text.includes(p))) {
          capturedWarnings.push(text.slice(0, 200));
        }
      } catch {}
      originalWarn(...args);
    };

    const run = async () => {
      try {
        setLoading?.(true);
        setError?.(null);
        console.log("[volMpr] 3-pane setup START", { seriesUid });

        await initCornerstoneOnce();
        if (cancelled) return;

        await new Promise((r) => setTimeout(r, 120));
        await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
        if (cancelled) return;

        // ── Wait for all three elements to mount ──────────────────────────
        const els = () => (refs || []).map((r) => r?.current);
        let ready = false;
        for (let attempt = 0; attempt < 25 && !cancelled; attempt++) {
          await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
          const e = els();
          if (e.length === 3 && e.every((x) => x && x.clientWidth > 0 && x.clientHeight > 0)) {
            ready = true; break;
          }
          await new Promise((r) => setTimeout(r, 120));
        }
        if (cancelled) return;
        if (!ready) ready = await waitForElementsReady(els());
        if (!ready) throw new Error("MPR viewports not ready (layout 0 size).");
        const [axEl, sagEl, corEl] = els();

        // ── Find the selected series ──────────────────────────────────────
        const series = availableSeries?.find?.((s) => s.seriesUid === seriesUid);
        if (!series || !Array.isArray(series.urls) || series.urls.length === 0) {
          throw new Error("No series selected for MPR.");
        }

        // Cornerstone's image cache evicts old entries once it hits its max
        // size (default is fairly small relative to a long browsing session
        // with many series already opened) — confirmed via the internal
        // "purged from the cache before it completed loading" warning.
        // purgeCache() itself is NOT safe to call here: if this effect
        // re-fires quickly (switching series, a re-render), a NEW run's
        // purge can wipe out a PREVIOUS run's still-in-flight prefetches,
        // which are cornerstone-internal and don't stop just because our
        // own `cancelled` flag is set. Only raise the ceiling — never purge.
        try {
          csCore.cache.setMaxCacheSize(3 * 1024 * 1024 * 1024); // 3GB
        } catch (cacheErr) {
          console.warn("[volMpr] cache resize failed:", cacheErr?.message);
        }

        // ── Convert S3 presigned URLs → blob URLs ─────────────────────────
        // Fetching dozens of large S3 objects in parallel chunks occasionally
        // yields a response that's truncated/short relative to its own
        // Content-Length (browser connection pressure, a flaky proxy hop,
        // etc). A truncated DICOM file loses its PixelData element — which
        // sits at the very end — producing "the pixel data is missing"
        // downstream with no indication the raw fetch was ever the problem.
        // Verify blob size against Content-Length and retry a couple of
        // times before giving up on that one file.
        const fetchBlobVerified = async (url, attempts = 3) => {
          for (let attempt = 1; attempt <= attempts; attempt++) {
            try {
              const r = await fetch(url, { cache: "no-store" });
              if (!r.ok) {
                console.warn("[volMpr] blob fetch status:", r.status, `(attempt ${attempt}/${attempts})`);
                continue;
              }
              const expected = Number(r.headers.get("content-length"));
              const blob = await r.blob();
              if (Number.isFinite(expected) && expected > 0 && blob.size !== expected) {
                console.warn(
                  `[volMpr] truncated fetch: got ${blob.size}B, expected ${expected}B (attempt ${attempt}/${attempts})`
                );
                continue;
              }
              return URL.createObjectURL(blob);
            } catch (e) {
              console.warn("[volMpr] blob fetch err:", e?.message, `(attempt ${attempt}/${attempts})`);
            }
          }
          return null;
        };

        console.log("[volMpr] converting", series.urls.length, "URLs to blobs…");
        const BLOB_CHUNK = 6;
        const resolvedUrls = [];
        for (let i = 0; i < series.urls.length && !cancelled; i += BLOB_CHUNK) {
          const chunk = series.urls.slice(i, i + BLOB_CHUNK);
          const results = await Promise.all(
            chunk.map(async (url) => {
              if (url && (url.includes("X-Amz-Signature") || url.includes("x-amz-signature"))) {
                const blobUrl = await fetchBlobVerified(url);
                // Fall back to the raw presigned URL (loader fetches it directly)
                // rather than silently dropping the slice if all retries failed.
                return blobUrl || url;
              }
              return url;
            })
          );
          resolvedUrls.push(...results);
        }
        if (cancelled) return;
        const blobCount = resolvedUrls.filter((u) => u && u.startsWith("blob:")).length;
        console.log("[volMpr] resolved", resolvedUrls.length, "URLs,", blobCount, "blobs");

        const imageIds = resolvedUrls.map(buildImageId);
        if (imageIds.length < 3) {
          throw new Error("MPR needs a multi-slice series (3+ slices).");
        }

        // ── Register metadata providers BEFORE volume build ───────────────
        // The streaming volume builder needs imagePixelModule AND
        // imagePlaneModule for every imageId BEFORE it allocates the voxel
        // array. Instead of relying on loadAndCacheImage warm-up (which
        // fails on S3 blob URLs), we register providers directly from
        // the series object + safe MR defaults. volume.load() will then
        // load actual pixel data via the WADO loader.
        const imageIdSet = new Set(imageIds);

        // series.rows/columns/etc come from useSeriesGrouping's lightweight,
        // range-limited header parse, which can silently miss group 0028
        // tags for some files/vendors — when that happens `series.rows` is
        // null and the `|| 512` fallback kicks in with a value that has NO
        // relationship to the real image, guaranteeing every per-frame pixel
        // insertion fails (confirmed: a 260x320 series wrongly declared as
        // 512x512 produced a fully empty volume with zero WebGL errors and
        // no thrown exception — completely silent). Re-parsing the first
        // actual file directly here, with a real (non-range-limited) fetch,
        // is the only way to guarantee these values are correct before we
        // commit to allocating the whole volume around them.
        let realRows = series.rows;
        let realColumns = series.columns;
        let realBitsAllocated = series.bitsAllocated;
        let realPixelSpacing = series.pixelSpacing;
        try {
          // Probe the ORIGINAL S3 URL, not resolvedUrls[0] (the blob: URL
          // the volume loader will use for this same image) — fetching and
          // reading a blob's arrayBuffer here was the likely cause of that
          // exact first image later showing "Image not found for imageId"
          // when the volume loader went to actually consume it.
          const probeUrl = series.urls[0];
          const res = await fetch(probeUrl);
          const buf = new Uint8Array(await res.arrayBuffer());
          let ds;
          try {
            ds = dicomParser.parseDicom(buf, { untilTag: "x7fe00010" });
          } catch (e) {
            ds = e && typeof e === "object" && e.dataSet ? e.dataSet : null;
          }
          if (ds) {
            const dsRows = ds.uint16("x00280010");
            const dsCols = ds.uint16("x00280011");
            const dsBitsAlloc = ds.uint16("x00280100");
            const dsPixSpacing = ds.string("x00280030");
            if (Number.isFinite(dsRows) && dsRows > 0) realRows = dsRows;
            if (Number.isFinite(dsCols) && dsCols > 0) realColumns = dsCols;
            if (Number.isFinite(dsBitsAlloc) && dsBitsAlloc > 0) realBitsAllocated = dsBitsAlloc;
            if (dsPixSpacing) {
              const parts = String(dsPixSpacing).split("\\").map(Number);
              if (parts.length >= 2 && parts.every(Number.isFinite)) realPixelSpacing = parts;
            }
            if (realRows !== series.rows || realColumns !== series.columns) {
              console.warn(
                `[volMpr] series.rows/columns (${series.rows}x${series.columns}) disagreed with ` +
                `direct re-parse (${realRows}x${realColumns}) — using the re-parsed values.`
              );
            }
          }
        } catch (probeErr) {
          console.warn("[volMpr] direct dimension re-parse failed, falling back to series metadata:", probeErr?.message);
        }

        // — imagePixelModule: uniform for all slices in an MR series.
        const rows = realRows || 512;
        const columns = realColumns || 512;
        const bitsAllocated = realBitsAllocated ?? 16;
        // Declaring the REAL BitsStored/HighBit (e.g. 12/11 for a common MR
        // encoding that allocates 16 bits but only uses 12) triggers a
        // Cornerstone3D/WebGL texture-upload bug — texSubImage3D rejects the
        // buffer as "not big enough" when bitsStored != bitsAllocated (same
        // class of bug as cornerstonejs/cornerstone3D#1379, a known
        // int16/uint16 buffer-size mismatch in the volume texture path).
        // The physical memory layout is genuinely bitsAllocated-wide either
        // way, so keeping stored==allocated here only affects the *declared*
        // precision Cornerstone reports, not the actual pixel values or the
        // window/level range we compute separately — but it avoids the
        // texture allocator taking the broken code path entirely.
        const bitsStored = bitsAllocated;
        const highBit = bitsAllocated - 1;
        const pixelRepresentation = series.pixelRepresentation ?? 1; // signed (standard for MR)
        const pixelProvider = (type, imageId) => {
          if (type !== "imagePixelModule") return;
          if (!imageIdSet.has(imageId)) return;
          return {
            bitsAllocated,
            bitsStored,
            highBit,
            pixelRepresentation,
            samplesPerPixel: 1,
            photometricInterpretation: "MONOCHROME2",
            rows,
            columns,
          };
        };
        csCore.metaData.addProvider(pixelProvider, 10000);
        registeredProviders.push(pixelProvider);

        // — imagePlaneModule: per-slice geometry from series.positions/iop.
        const pos = Array.isArray(series.positions) ? series.positions : [];
        const iop = Array.isArray(series.iop) && series.iop.length >= 6
          ? series.iop : [1, 0, 0, 0, 1, 0];
        const forUID = series.frameOfReferenceUID || "SYNTHETIC_MPR";

        // In-plane pixel spacing (row, column) in mm/px, from DICOM tag
        // (0028,0030). Falls back to isotropic 1mm/px only when a series
        // genuinely has none (e.g. a synthetic/derived stack).
        const [rowSpacing, colSpacing] = Array.isArray(realPixelSpacing) && realPixelSpacing.length >= 2
          ? realPixelSpacing
          : [1, 1];

        // Derive spacing from real positions if available
        let spacing = 1;
        if (pos.length >= 2 && Array.isArray(pos[0]) && Array.isArray(pos[1])) {
          const dx = (pos[1][0]||0) - (pos[0][0]||0);
          const dy = (pos[1][1]||0) - (pos[0][1]||0);
          const dz = (pos[1][2]||0) - (pos[0][2]||0);
          const d = Math.sqrt(dx*dx + dy*dy + dz*dz);
          if (d > 0.01) spacing = d;
        }

        const posMap = new Map();
        imageIds.forEach((id, idx) => {
          const pp = Array.isArray(pos[idx]) && pos[idx].length >= 3
            ? pos[idx] : [0, 0, idx * spacing];
          posMap.set(id, pp);
        });

        const planeProvider = (type, imageId) => {
          if (type !== "imagePlaneModule") return;
          if (!posMap.has(imageId)) return;
          return {
            imageOrientationPatient: iop,
            imagePositionPatient: posMap.get(imageId),
            pixelSpacing: [rowSpacing, colSpacing],
            rowPixelSpacing: rowSpacing,
            columnPixelSpacing: colSpacing,
            rows,
            columns,
            sliceThickness: spacing,
            spacingBetweenSlices: spacing,
            frameOfReferenceUID: forUID,
            usingDefaultValues: false,
          };
        };
        csCore.metaData.addProvider(planeProvider, 10000);
        registeredProviders.push(planeProvider);

        // — generalSeriesModule: modality info.
        const seriesProvider = (type, imageId) => {
          if (type !== "generalSeriesModule") return;
          if (!imageIdSet.has(imageId)) return;
          return { modality: series.modality || "MR" };
        };
        csCore.metaData.addProvider(seriesProvider, 10000);
        registeredProviders.push(seriesProvider);

        // Verify both modules resolve
        const testPx = csCore.metaData.get("imagePixelModule", imageIds[0]);
        const testPl = csCore.metaData.get("imagePlaneModule", imageIds[0]);
        console.log("[volMpr] metadata check — pixel:", !!testPx, "plane:", !!testPl);

        // ── Engine + orthographic viewports ───────────────────────────────
        const reId = `volmpr_engine_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const tgId = `volmpr_tools_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        renderingEngineIdRef.current = reId;
        toolGroupIdRef.current = tgId;
        localTgId = tgId;

        const engine = new csCore.RenderingEngine(reId);
        localEngine = engine;
        renderingEngineRef.current = engine;

        const [oAx, oSag, oCor] = ORIENTATIONS();
        engine.setViewports([
          { viewportId: MPR_VP_IDS[0], type: csCore.Enums.ViewportType.ORTHOGRAPHIC, element: axEl,  defaultOptions: { orientation: oAx,  background: [0, 0, 0] } },
          { viewportId: MPR_VP_IDS[1], type: csCore.Enums.ViewportType.ORTHOGRAPHIC, element: sagEl, defaultOptions: { orientation: oSag, background: [0, 0, 0] } },
          { viewportId: MPR_VP_IDS[2], type: csCore.Enums.ViewportType.ORTHOGRAPHIC, element: corEl, defaultOptions: { orientation: oCor, background: [0, 0, 0] } },
        ]);
        viewportIdsRef.current = [...MPR_VP_IDS];
        engine.resize(true, false);

        // ── Build volume ──────────────────────────────────────────────────
        // A single flaky image (one blob occasionally reporting "Image not
        // found for imageId" to Cornerstone's own internal loader, for
        // reasons independent of anything in our own code — confirmed by
        // eliminating every cache-purge race and probe-fetch interaction we
        // could find) makes Cornerstone treat the ENTIRE volume as empty,
        // not just that one slice. Since it's non-deterministic (different
        // image fails each attempt, or none at all), retry the whole build
        // once with a fresh set of blobs/imageIds before giving up.
        let volume = null;
        let volumeId = null;
        const MAX_VOLUME_ATTEMPTS = 2;
        for (let attempt = 1; attempt <= MAX_VOLUME_ATTEMPTS && !cancelled; attempt++) {
          console.log(`[volMpr] building volume from ${imageIds.length} imageIds… (attempt ${attempt}/${MAX_VOLUME_ATTEMPTS})`);
          const attemptVolumeId = `cornerstoneStreamingImageVolume:onix_mpr_${Date.now()}_${attempt}`;
          const candidate = await csCore.volumeLoader.createAndCacheVolume(attemptVolumeId, { imageIds });
          console.log("[volMpr] volume created, loading pixel data…");
          await candidate.load();
          if (cancelled) return;

          // Log ground-truth geometry BEFORE any check that might throw, so
          // we always see it even when the volume turns out to be empty.
          try {
            const dims = candidate.dimensions;
            const spacing = candidate.spacing;
            const scalarLen = candidate.voxelManager?.getCompleteScalarDataArray?.()?.length
              ?? candidate.voxelManager?.getScalarDataLength?.();
            const expectedLen = dims ? dims[0] * dims[1] * dims[2] : null;
            console.log(
              `[volMpr] DIAGNOSTIC-TEXT dims=${JSON.stringify(dims)} spacing=${JSON.stringify(spacing)} ` +
              `rows=${rows} columns=${columns} bitsAllocated=${bitsAllocated} bitsStored=${bitsStored} ` +
              `scalarArrayLength=${scalarLen} expectedLength(dimX*dimY*dimZ)=${expectedLen} ` +
              `imageCount=${imageIds.length}`
            );
          } catch (diagErr) {
            console.log("[volMpr] DIAGNOSTIC-TEXT failed:", diagErr?.message);
          }

          // volume.load() resolves even when every per-frame pixel insertion
          // failed internally — it just leaves the voxel buffer at its
          // allocated-but-empty default. That renders as a flat, textureless
          // shape instead of throwing, so check for it explicitly.
          let isEmpty = false;
          try {
            const range = candidate.voxelManager?.getRange?.();
            if (range && range[0] === range[1]) isEmpty = true;
          } catch { /* range check itself failing isn't fatal — treat as non-empty */ }

          if (!isEmpty) {
            volume = candidate;
            volumeId = attemptVolumeId;
            break;
          }
          console.warn(`[volMpr] attempt ${attempt} produced an empty volume; ${attempt < MAX_VOLUME_ATTEMPTS ? "retrying" : "giving up"}.`);
          try { csCore.cache.removeVolumeLoadObject(attemptVolumeId); } catch {}
        }
        if (cancelled) return;
        if (!volume) {
          throw new Error("Volume loaded but contains no pixel data (flat/empty voxel buffer).");
        }
        console.log("[volMpr] volume loaded ✓");

        // Nothing ever sets an initial display window for the volume — the
        // per-slice WindowCenter/WindowWidth DICOM tags aren't wired to a
        // streaming volume the way they are for a stack viewport, so without
        // this the volume renders using whatever default VOI Cornerstone
        // picks, which can clip real (non-empty) pixel data to solid black
        // for narrow-range data like 12-bit-stored MR. Prefer the series'
        // own WindowCenter/WindowWidth; fall back to an auto window from the
        // 1st-99th percentile of the volume's actual scalar data — plain
        // min/max is a known-bad auto-window for MR, since a handful of
        // bright outlier voxels (common artifacts) stretch the range enough
        // to make real tissue render as near-black.
        let voiRange = null;
        if (Number.isFinite(series.defaultWindowCenter) && Number.isFinite(series.defaultWindowWidth)) {
          const wc = series.defaultWindowCenter;
          const ww = series.defaultWindowWidth;
          voiRange = { lower: wc - ww / 2, upper: wc + ww / 2 };
        } else {
          try {
            // Same voxelManager API as the empty-volume check above — the
            // imageData/vtkPointData path doesn't reliably expose scalars
            // for a streaming volume.
            const data = volume.voxelManager?.getCompleteScalarDataArray?.()
              ?? volume.voxelManager?.getScalarData?.();
            const range = volume.voxelManager?.getRange?.();
            if (data && data.length && range && range[1] > range[0]) {
              const [min, max] = range;
              const BINS = 1024;
              const scale = BINS / (max - min);
              const hist = new Uint32Array(BINS);
              // Sampling every voxel on a multi-million-element volume is
              // unnecessary for a histogram — a stride keeps this fast
              // without materially changing the percentile estimate.
              const stride = Math.max(1, Math.floor(data.length / 2_000_000));
              let sampled = 0;
              for (let i = 0; i < data.length; i += stride) {
                let bin = Math.floor((data[i] - min) * scale);
                if (bin < 0) bin = 0; else if (bin >= BINS) bin = BINS - 1;
                hist[bin]++;
                sampled++;
              }
              const lowCut = sampled * 0.01;
              const highCut = sampled * 0.99;
              let cum = 0, lowerBin = 0, upperBin = BINS - 1;
              for (let b = 0; b < BINS; b++) {
                cum += hist[b];
                if (cum >= lowCut) { lowerBin = b; break; }
              }
              cum = 0;
              for (let b = 0; b < BINS; b++) {
                cum += hist[b];
                if (cum >= highCut) { upperBin = b; break; }
              }
              const lower = min + lowerBin / scale;
              const upper = min + (upperBin + 1) / scale;
              voiRange = upper > lower ? { lower, upper } : { lower: min, upper: max };
            }
          } catch { /* fall through — viewport keeps its own default */ }
        }

        console.log("[volMpr] DIAGNOSTIC-TEXT voiRange:", JSON.stringify(voiRange));

        for (const vpId of MPR_VP_IDS) {
          const vp = engine.getViewport(vpId);
          await vp.setVolumes([{ volumeId }]);
          // resetCamera() can reset VOI back to its own auto default, so it
          // must run BEFORE we apply our explicit window — otherwise it
          // silently clobbers the voiRange set right after it.
          vp.resetCamera?.();
          if (voiRange) { try { vp.setProperties({ voiRange }, volumeId); } catch {} }
          try {
            const cam = vp.getCamera?.();
            console.log(`[volMpr] DIAGNOSTIC ${vpId} camera:`, cam);
          } catch {}
        }
        engine.renderViewports(MPR_VP_IDS);

        // ── Tool group ────────────────────────────────────────────────────
        let tg = ToolGroupManager.getToolGroup(tgId) || ToolGroupManager.createToolGroup(tgId);
        if (!tg) throw new Error("Failed to create MPR tool group.");
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
        MPR_VP_IDS.forEach((id) => { try { tg.addViewport(id, reId); } catch {} });
        tg.setToolActive(PanTool.toolName, {
          bindings: [{ mouseButton: ToolsEnums.MouseBindings.Auxiliary }],
        });
        tg.setToolActive(WindowLevelTool.toolName, {
          bindings: [
            { mouseButton: ToolsEnums.MouseBindings.Primary },
            { mouseButton: ToolsEnums.MouseBindings.Secondary },
          ],
        });

        const proj = getProjection?.() || {};
        applyProjectionToViewports(engine, MPR_VP_IDS, proj.mode, proj.slabThicknessMm, proj.quality);
        engine.renderViewports(MPR_VP_IDS);

        setLoading?.(false);
        onReady?.();
        console.log("[volMpr] 3-pane ready ✓");
      } catch (e) {
        if (cancelled) return;
        console.error("[volMpr] setup failed:", e);
        // Fold any captured internal warnings into the on-screen message so
        // the actual cause (cache eviction, missing image, truncated fetch)
        // is visible without needing to open DevTools at all.
        const uniqueWarnings = [...new Set(capturedWarnings)];
        const suffix = uniqueWarnings.length
          ? ` [DIAG: ${uniqueWarnings.length} internal warning(s) — ${uniqueWarnings.slice(0, 2).join(" | ")}]`
          : " [DIAG: no matching internal warnings captured]";
        setError?.((e?.message || "Failed to set up MPR view.") + suffix);
        setLoading?.(false);
      } finally {
        console.warn = originalWarn;
      }
    };

    run();

    return () => {
      cancelled = true;
      // Clean up registered providers so they don't leak across mode switches
      registeredProviders.forEach((p) => {
        try { csCore.metaData.removeProvider(p); } catch {}
      });
      try { if (localTgId) ToolGroupManager.destroyToolGroup(localTgId); } catch {}
      try { localEngine?.destroy(); } catch {}
      if (renderingEngineRef.current === localEngine) renderingEngineRef.current = null;
      // NOT purging the cache here anymore: run() above isn't awaited, so
      // this cleanup can fire while a previous run's volume.load() is still
      // mid-flight (the effect deps changing, or the hosting component just
      // re-rendering, is enough to trigger it). Purging then wipes out the
      // very images that in-flight load just fetched, before it gets to use
      // them — this matched the console's own internal warning verbatim:
      // "The image was purged from the cache before it completed loading."
      // The purge-at-start of run() already keeps the cache from growing
      // unbounded across series switches; that's sufficient.
    };
  }, [enabled, seriesUid]); // eslint-disable-line react-hooks/exhaustive-deps
}
