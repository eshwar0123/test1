// src/modules/radiologist/DicomViewer/hooks/useSeriesThumbnails.js
//
// Generates a small (96x96) thumbnail PNG dataURL for each series, using the
// MIDDLE instance of that series. Lazy: only generates when invoked.
//
// Strategy:
//   1. Use cornerstone3D's csCore.imageLoader.loadAndCacheImage(imageId) for
//      the middle slice — this reuses the existing wado-image-loader pipeline
//      so we don't have to reimplement DICOM decompression / windowing.
//   2. After load, get image.getCanvas() if available, else paint pixel data
//      into a small canvas with the series default window/level.
//   3. Cache the dataURL by seriesUid in a module-level Map so re-renders
//      and re-mounts don't regenerate.

import { useEffect, useRef, useState } from "react";
import * as csCore from "@cornerstonejs/core";
import { buildImageId } from "../utils/viewerUtils";
import { initCornerstoneOnce } from "./useCornerstoneInit";

/* PERF: match useViewerDataLoader — presigned S3 URLs are rewritten to our own
   origin rather than downloaded into a blob. Keeping the imageId identical to
   the one the main viewport uses is what lets a thumbnail and its series share
   a single Cornerstone cache entry instead of downloading the slice twice. */
const S3_SIG_RE = /[?&]x-amz-signature=/i;
const toSameOriginUrl = (url) => {
  if (!url || url.startsWith("blob:") || !S3_SIG_RE.test(url)) return url;
  try {
    const key = new URL(url).pathname.replace(/^\/+/, "");
    return `${window.location.origin}/api/radiology/file/${key}`;
  } catch { return url; }
};

/* Run thumbnail work only when the main thread is idle, so it never competes
   with the first slice render. */
const whenIdle = () =>
  new Promise((resolve) => {
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(resolve, { timeout: 1500 });
    } else {
      setTimeout(resolve, 200);
    }
  });

const THUMB_SIZE = 96;
const thumbCache = new Map();   // seriesUid -> dataURL
const inflight = new Map();     // seriesUid -> Promise

/* ─── Paint a cornerstone image into a small canvas ────────── */
const paintImageToCanvas = (image, size) => {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Letterbox preserving aspect
  const iw = image.columns || image.width || size;
  const ih = image.rows || image.height || size;
  const scale = Math.min(size / iw, size / ih);
  const dw = Math.round(iw * scale);
  const dh = Math.round(ih * scale);
  const dx = Math.round((size - dw) / 2);
  const dy = Math.round((size - dh) / 2);
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, size, size);

  // Cornerstone images often expose getCanvas() after decode.
  if (typeof image.getCanvas === "function") {
    try {
      const srcCanvas = image.getCanvas();
      if (srcCanvas && srcCanvas.width && srcCanvas.height) {
        ctx.drawImage(srcCanvas, dx, dy, dw, dh);
        return canvas.toDataURL("image/png");
      }
    } catch { /* fall through */ }
  }

  // Fallback: render pixel data manually with window/level.
  try {
    const pixelData =
      (typeof image.getPixelData === "function" && image.getPixelData()) ||
      image.imageFrame?.pixelData ||
      null;
    if (!pixelData) return null;

    const wc = image.windowCenter ?? image.imageFrame?.windowCenter ?? 127;
    const ww = image.windowWidth  ?? image.imageFrame?.windowWidth  ?? 256;
    const lo = wc - ww / 2;
    const hi = wc + ww / 2;
    const invert = !!image.invert;

    const tmp = document.createElement("canvas");
    tmp.width = iw; tmp.height = ih;
    const tctx = tmp.getContext("2d");
    if (!tctx) return null;
    const imgData = tctx.createImageData(iw, ih);

    const len = iw * ih;
    for (let i = 0; i < len; i++) {
      const v = pixelData[i];
      let g;
      if (v <= lo) g = 0;
      else if (v >= hi) g = 255;
      else g = ((v - lo) / (hi - lo)) * 255;
      if (invert) g = 255 - g;
      const o = i * 4;
      imgData.data[o]     = g;
      imgData.data[o + 1] = g;
      imgData.data[o + 2] = g;
      imgData.data[o + 3] = 255;
    }
    tctx.putImageData(imgData, 0, 0);
    ctx.drawImage(tmp, dx, dy, dw, dh);
    return canvas.toDataURL("image/png");
  } catch (e) {
    console.warn("[thumbnail] pixel render failed:", e?.message || e);
    return null;
  }
};

/* ─── Generate one thumbnail for one series ────────────────── */
const makeThumbnail = async (seriesUid, urls) => {
  if (!urls || urls.length === 0) return null;
  if (thumbCache.has(seriesUid)) return thumbCache.get(seriesUid);

  const existing = inflight.get(seriesUid);
  if (existing) return existing;

  const promise = (async () => {
    // initCornerstoneOnce is memoized — safe to call repeatedly. This avoids
    // a race where thumbnails try to use imageLoader before useViewerDataLoader
    // has finished initializing Cornerstone.
    try { await initCornerstoneOnce(); } catch { /* fall through; loadAndCacheImage will error if truly broken */ }
    const midIdx = Math.floor(urls.length / 2);
    const url = toSameOriginUrl(urls[midIdx]);
    const imageId = buildImageId(url);
    try {
      const image = await csCore.imageLoader.loadAndCacheImage(imageId);
      const dataUrl = paintImageToCanvas(image, THUMB_SIZE);
      if (dataUrl) thumbCache.set(seriesUid, dataUrl);
      return dataUrl;
    } catch (e) {
      console.warn("[thumbnail] load failed", seriesUid, e?.message || e);
      return null;
    } finally {
      inflight.delete(seriesUid);
    }
  })();

  inflight.set(seriesUid, promise);
  return promise;
};

/* ─── Public hook ──────────────────────────────────────────── */
/**
 * @param {Array<{seriesUid:string, urls:string[]}>} series
 * @param {Object} opts
 * @param {boolean} opts.enabled   — set false to defer all work
 * @param {number}  opts.batch     — how many concurrent loads (default 3)
 * @returns {Object} thumbs map: { seriesUid: dataURL | null }
 */
export default function useSeriesThumbnails(series, { enabled = true, batch = 3 } = {}) {
  const [thumbs, setThumbs] = useState({});
  const cancelRef = useRef(false);

  useEffect(() => {
    cancelRef.current = false;
    if (!enabled || !Array.isArray(series) || series.length === 0) {
      setThumbs({});
      return;
    }

    // Seed with anything we already have cached so the UI doesn't blink
    const seeded = {};
    for (const s of series) {
      if (thumbCache.has(s.seriesUid)) seeded[s.seriesUid] = thumbCache.get(s.seriesUid);
    }
    setThumbs(seeded);

    // Queue up the ones we don't have
    const todo = series.filter((s) => !thumbCache.has(s.seriesUid));

    const run = async () => {
      // PERF: yield until the main viewport has painted before pulling slices.
      await whenIdle();
      if (cancelRef.current) return;
      for (let i = 0; i < todo.length; i += batch) {
        if (cancelRef.current) return;
        const slice = todo.slice(i, i + batch);
        const results = await Promise.all(
          slice.map(async (s) => [s.seriesUid, await makeThumbnail(s.seriesUid, s.urls)])
        );
        if (cancelRef.current) return;
        setThumbs((prev) => {
          const next = { ...prev };
          for (const [uid, dataUrl] of results) next[uid] = dataUrl;
          return next;
        });
      }
    };
    run();

    return () => { cancelRef.current = true; };
  }, [series, enabled, batch]);

  return thumbs;
}

/** Clear cached thumbnails (e.g. after a re-upload). */
export function clearSeriesThumbnailCache(seriesUid) {
  if (seriesUid) thumbCache.delete(seriesUid);
  else thumbCache.clear();
}
