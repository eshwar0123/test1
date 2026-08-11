// src/modules/radiologist/DicomViewer/hooks/useSeriesGrouping.js
//
// Parses a flat list of DICOM URLs and groups them into renderable image
// series. Drives the bottom SeriesPickerStrip in Dicomviewer.js.
//
// WHAT CHANGED vs the previous version (and why your counts differed from IDV):
//   1. SOP-CLASS FILTERING. We now read SOPClassUID (0008,0016) and drop
//      non-image objects (SR, PhoenixZIPReport, Raw Data, Presentation State,
//      Encapsulated PDF, MR Spectroscopy...). These were the SE 99 / SE 9999
//      "error strips" — they have no pixel data and must never be mounted as
//      image series. A Rows/Columns presence check backs up the denylist for
//      unknown private classes.
//   2. DEDUP by SOPInstanceUID (0008,0018). A file present under two URLs was
//      previously counted twice.
//   3. DERIVED-FRAME HANDLING. Siemens packs DERIVED images (calc/recon/screen)
//      into the SAME SeriesInstanceUID as the ORIGINAL acquisition. IDV counts
//      only the primary stack; we were counting ORIGINAL + DERIVED, which is
//      why we read 20/20/20/18 where IDV read 18/18/12/16. We now drop DERIVED
//      instances ONLY when the series also has ORIGINAL ones (a pure-derived
//      series — e.g. a standalone MIP — is kept intact as its own strip).
//   4. POSITION SORT. Slices are ordered by ImagePositionPatient projected onto
//      the slice normal, falling back to InstanceNumber then URL. InstanceNumber
//      alone mis-orders Siemens interleaved acquisitions.
//
// Performance notes (unchanged):
//   - Only the first ~256KB of each file is fetched (Range header) to read
//     headers. Pixel data is skipped.
//   - Parsing is done in parallel chunks of 8.
//   - Results are cached in a module-level Map keyed by caseId, and in a
//     shared backend cache.

import { useEffect, useRef, useState } from "react";
import dicomParser from "dicom-parser";

/* ─── Cache version. Bump this whenever the series shape changes so stale
       backend caches (old grouping logic) are ignored and re-parsed. ─── */
const CACHE_VERSION = 4;

/* ─── Derived-frame policy ───────────────────────────────────
   "drop"  → remove DERIVED instances from a series that also has ORIGINALs
             (matches IDV; this is the default).
   "keep"  → count everything (the old behaviour). Flip to this if the console
             breakdown shows legitimate images being dropped. */
const DERIVED_MODE = "drop";

/* ─── Module-level cache (survives unmounts within a session) ─── */
const groupingCache = new Map(); // caseId -> { series: [...], parsedAt: number }
const inflight = new Map();      // caseId -> Promise so concurrent mounts share work

/* ─── Backend cache (shared across all users) ──────────────── */
const BACKEND_CACHE_BASE = "/api/radiology/series-cache";

async function loadSeriesCacheFromBackend(caseId) {
  try {
    const res = await fetch(`${BACKEND_CACHE_BASE}/${encodeURIComponent(caseId)}`);
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const obj = await res.json();
    // Ignore caches written by an older grouping version.
    if (!obj || obj.v !== CACHE_VERSION || !Array.isArray(obj.series)) return null;
    return { series: obj.series, parsedAt: obj.parsedAt || Date.now() };
  } catch { return null; }
}

async function saveSeriesCacheToBackend(caseId, data) {
  try {
    await fetch(`${BACKEND_CACHE_BASE}/${encodeURIComponent(caseId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ v: CACHE_VERSION, parsedAt: data.parsedAt || Date.now(), series: data.series }),
    });
  } catch (e) {
    console.warn("[useSeriesGrouping] backend save failed:", e && e.message || e);
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   PERF: server-side manifest (preferred path).

   Client-side header parsing means fetching the first 256 KB of every file:
   for a 299-slice CT that's ~76 MB pulled over the wire, in 38 sequential
   chunks, purely to read a handful of tags — and it happens WHILE
   useViewerDataLoader is downloading the same files for rendering.

   The backend already has these files on local disk. Have it walk the folder
   once at ingest with pydicom(stop_before_pixels=True) and cache the grouped
   result. Then this hook is a single ~20 KB JSON fetch.

   The client parser below is kept as a fallback for studies ingested before
   the manifest endpoint existed.
   ═══════════════════════════════════════════════════════════════════════ */
const MANIFEST_BASE = "/api/radiology/study";

async function loadManifestFromServer(caseId) {
  if (!caseId || caseId.startsWith("__files_")) return null;
  try {
    const res = await fetch(`${MANIFEST_BASE}/${encodeURIComponent(caseId)}/manifest`);
    if (!res.ok) return null;
    const obj = await res.json();
    if (!obj || obj.v !== CACHE_VERSION || !Array.isArray(obj.series)) return null;
    if (obj.series.length === 0) return null;
    console.log(
      "[useSeriesGrouping] server manifest hit —",
      obj.series.length, "series, no client-side header parsing needed"
    );
    return obj.series;
  } catch { return null; }
}

/* PERF: 24 parallel instead of 8 — modern browsers allow 6 per host over
   HTTP/1.1 and effectively unlimited over HTTP/2, so 8 left the pipe idle. */
const PARSE_CHUNK_SIZE = 24;
/* PERF: 256 KB → 32 KB. Everything we read (groups 0008/0018/0020/0028) sits
   before the pixel data. 32 KB covers the overwhelming majority; the rare
   file with a large private block (Siemens CSA) escalates on parse failure.
   For a 299-slice study this is 76 MB → 9.5 MB. */
const HEADER_RANGE_BYTES = 32 * 1024;
const HEADER_RANGE_ESCALATED = 512 * 1024;

/* ─── DICOM tag helpers ─────────────────────────────────────── */
const TAGS = {
  patientName:             "x00100010",
  patientId:               "x00100020",
  studyInstanceUID:        "x0020000d",
  seriesInstanceUID:       "x0020000e",
  sopInstanceUID:          "x00080018",
  sopClassUID:             "x00080016",
  seriesNumber:            "x00200011",
  seriesDescription:       "x0008103e",
  modality:                "x00080060",
  instanceNumber:          "x00200013",
  imageType:               "x00080008",
  numberOfFrames:          "x00280008",
  echoNumbers:             "x00180086",
  acquisitionNumber:       "x00200012",
  rows:                    "x00280010",
  columns:                 "x00280011",
  windowCenter:            "x00281050",
  windowWidth:             "x00281051",
  imageOrientationPatient: "x00200037",
  imagePositionPatient:    "x00200032",
  frameOfReferenceUID:     "x00200052",
};

const readString = (ds, tag) => {
  try {
    const v = ds.string(tag);
    return v ? String(v).trim() : null;
  } catch { return null; }
};

const readNumber = (ds, tag) => {
  try {
    const v = ds.string(tag);
    if (v == null) return null;
    const n = parseFloat(String(v).split("\\")[0]);
    return Number.isFinite(n) ? n : null;
  } catch { return null; }
};

const readFloatArray = (ds, tag) => {
  try {
    const v = ds.string(tag);
    if (v == null) return null;
    const arr = String(v).split("\\").map((s) => parseFloat(s));
    return arr.length && arr.every(Number.isFinite) ? arr : null;
  } catch { return null; }
};

/* ─── Non-image SOP class detection ────────────────────────── */
// Anything matching one of these prefixes carries no displayable pixel stack.
const NON_IMAGE_SOP_PREFIXES = [
  "1.2.840.10008.5.1.4.1.1.88",   // Structured Report family + Key Object Selection
  "1.2.840.10008.5.1.4.1.1.104",  // Encapsulated PDF / CDA / STL
  "1.2.840.10008.5.1.4.1.1.66",   // Raw Data, Spatial Registration, Surface, etc.
  "1.2.840.10008.5.1.4.1.1.11",   // Presentation State storage
  "1.2.840.10008.5.1.4.1.1.4.2",  // MR Spectroscopy (no image stack)
  "1.3.12.2.1107.5.9.1",          // Siemens CSA Non-Image (PhoenixZIPReport)
  "1.2.840.10008.1.3.10",         // Media Storage Directory (DICOMDIR)
];
const isNonImageSopClass = (sop) =>
  !!sop && NON_IMAGE_SOP_PREFIXES.some((p) => sop.startsWith(p));

/* ─── Derived-frame detection ──────────────────────────────── */
// ImageType is e.g. ORIGINAL\PRIMARY\M\ND  or  DERIVED\PRIMARY\PROJECTION IMAGE
const isDerivedType = (imageType) => {
  if (!imageType) return false;
  return String(imageType).toUpperCase().split("\\").includes("DERIVED");
};

/* ─── Detect orientation from ImageOrientationPatient ──────── */
const detectPlaneFromIop = (iop) => {
  if (!iop || iop.length < 6 || iop.some((n) => !Number.isFinite(n))) return null;
  const [rx, ry, rz, cx, cy, cz] = iop;
  const nx = ry * cz - rz * cy;
  const ny = rz * cx - rx * cz;
  const nz = rx * cy - ry * cx;
  const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
  const max = Math.max(ax, ay, az);
  if (max < 0.7) return "oblique";
  if (max === az) return "axial";
  if (max === ax) return "sagittal";
  if (max === ay) return "coronal";
  return null;
};

/* ─── Scout / localizer detection ──────────────────────────── */
const SCOUT_RE = /scout|localizer|survey|tracker|topogram|\bloc\b/i;
const isScoutDescription = (desc) => !!desc && SCOUT_RE.test(desc);

/* ─── Fetch + parse a single file's header ─────────────────── */
const fetchRange = async (url, bytes) => {
  const res = await fetch(url, { headers: { Range: `bytes=0-${bytes - 1}` } });
  if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
};

const tryParse = (byteArray) => {
  try {
    return dicomParser.parseDicom(byteArray, { untilTag: "x7fe00010" });
  } catch (e) {
    if (e && typeof e === "object" && e.dataSet) return e.dataSet;
    try {
      return dicomParser.parseDicom(byteArray);
    } catch (e2) {
      if (e2 && typeof e2 === "object" && e2.dataSet) return e2.dataSet;
      return null;
    }
  }
};

const parseHeader = async (url) => {
  /* PERF: escalating range. Small read first; only files that genuinely need
     more (large private blocks) pay for a second, bigger request. The old code
     fell back to downloading the ENTIRE file on any range hiccup. */
  let ds = null;
  try {
    ds = tryParse(await fetchRange(url, HEADER_RANGE_BYTES));
  } catch { /* fall through to escalation */ }

  if (!ds) {
    try {
      ds = tryParse(await fetchRange(url, HEADER_RANGE_ESCALATED));
    } catch { /* fall through to full fetch */ }
  }

  if (!ds) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    ds = tryParse(new Uint8Array(await res.arrayBuffer()));
  }
  if (!ds) throw new Error("dicom-parser returned no dataSet");

  const iop = readFloatArray(ds, TAGS.imageOrientationPatient);

  return {
    url,
    seriesInstanceUID:  readString(ds, TAGS.seriesInstanceUID),
    sopInstanceUID:     readString(ds, TAGS.sopInstanceUID),
    sopClassUID:        readString(ds, TAGS.sopClassUID),
    seriesNumber:       readNumber(ds, TAGS.seriesNumber),
    seriesDescription:  readString(ds, TAGS.seriesDescription),
    modality:           readString(ds, TAGS.modality),
    instanceNumber:     readNumber(ds, TAGS.instanceNumber),
    imageType:          readString(ds, TAGS.imageType),
    numberOfFrames:     readNumber(ds, TAGS.numberOfFrames),
    echoNumbers:        readNumber(ds, TAGS.echoNumbers),
    acquisitionNumber:  readNumber(ds, TAGS.acquisitionNumber),
    rows:               readNumber(ds, TAGS.rows),
    columns:            readNumber(ds, TAGS.columns),
    windowCenter:       readNumber(ds, TAGS.windowCenter),
    windowWidth:        readNumber(ds, TAGS.windowWidth),
    imageOrientationPatient: iop,
    imagePositionPatient:    readFloatArray(ds, TAGS.imagePositionPatient),
    frameOfReferenceUID:     readString(ds, TAGS.frameOfReferenceUID),
    plane:              detectPlaneFromIop(iop),
  };
};

/* ─── Run parseHeader over urls in throttled chunks ────────── */
const parseAllInChunks = async (urls, onProgress) => {
  const out = new Array(urls.length);
  let done = 0;
  for (let i = 0; i < urls.length; i += PARSE_CHUNK_SIZE) {
    const slice = urls.slice(i, i + PARSE_CHUNK_SIZE);
    const results = await Promise.all(
      slice.map(async (url) => {
        try { return await parseHeader(url); }
        catch (e) {
          console.warn("[useSeriesGrouping] parseHeader failed:", url, "→", e?.message || e);
          return { url, _parseError: true };
        }
      })
    );
    for (let j = 0; j < results.length; j++) out[i + j] = results[j];
    done += results.length;
    onProgress?.(done, urls.length);
    /* PERF: dropped the per-chunk `setTimeout(0)`. With 38 chunks that added
       38 macrotask hops on top of the network time for no benefit — the
       awaits above already yield to the event loop. */
  }
  return out;
};

/* ─── Build the series-metadata skeleton from one instance ─── */
const seriesMetaFrom = (p) => ({
  seriesInstanceUID: p.seriesInstanceUID,
  seriesNumber:      p.seriesNumber,
  seriesDescription: p.seriesDescription,
  modality:          p.modality,
  sopClassUID:       p.sopClassUID,
  plane:             p.plane,
  windowCenter:      p.windowCenter,
  windowWidth:       p.windowWidth,
  rows:              p.rows,
  columns:           p.columns,
  imageOrientationPatient: p.imageOrientationPatient,
  frameOfReferenceUID:     p.frameOfReferenceUID,
});

/* ─── Sort instances by patient position along the slice normal ─── */
const sortByPosition = (instances) => {
  const iop = instances.find((i) => i.iop && i.iop.length >= 6)?.iop;
  let normal = null;
  if (iop) {
    const [rx, ry, rz, cx, cy, cz] = iop;
    normal = [ry * cz - rz * cy, rz * cx - rx * cz, rx * cy - ry * cx];
  }
  instances.sort((a, b) => {
    if (normal && a.ipp && b.ipp) {
      const da = a.ipp[0] * normal[0] + a.ipp[1] * normal[1] + a.ipp[2] * normal[2];
      const db = b.ipp[0] * normal[0] + b.ipp[1] * normal[1] + b.ipp[2] * normal[2];
      if (da !== db) return da - db;
    }
    const an = a.instanceNumber ?? Infinity;
    const bn = b.instanceNumber ?? Infinity;
    if (an !== bn) return an - bn;
    return String(a.url).localeCompare(String(b.url), undefined, { numeric: true });
  });
};

/* ─── Group parsed entries into renderable image series ────── */
const groupBySeries = (parsed) => {
  const imageGroups = new Map();
  const nonImageGroups = new Map();
  const orphans = [];

  const classify = (p) => {
    if (!p || p._parseError || !p.seriesInstanceUID) return "orphan";
    const sop = p.sopClassUID || "";
    // Explicit non-image SOP classes (SR, PDF, raw, pres-state, spectroscopy,
    // Siemens CSA, DICOMDIR) are always non-image.
    if (isNonImageSopClass(sop)) return "nonimage";
    // If we have a SOP class and it's NOT denylisted, treat it as an image.
    // Do NOT demote on missing rows/columns: a partial header parse can miss
    // group 0028, which previously dropped whole valid series (empty strip).
    if (sop) return "image";
    // No SOP class parsed — fall back to pixel dimensions.
    const hasDims =
      Number.isFinite(p.rows) && Number.isFinite(p.columns) && p.rows > 0 && p.columns > 0;
    return hasDims ? "image" : "nonimage";
  };

  let multiFrameWarned = false;

  for (const p of parsed) {
    const kind = classify(p);
    if (kind === "orphan") { orphans.push(p); continue; }

    if (p.numberOfFrames && p.numberOfFrames > 1 && !multiFrameWarned) {
      console.warn(
        "[useSeriesGrouping] multi-frame instance detected (NumberOfFrames>1). " +
        "Counts treat each file as one image; enhanced/multi-frame objects need per-frame imageIds."
      );
      multiFrameWarned = true;
    }

    const target = kind === "image" ? imageGroups : nonImageGroups;
    const key = p.seriesInstanceUID;
    if (!target.has(key)) {
      target.set(key, { ...seriesMetaFrom(p), instances: [], _seenSop: new Set(), _dupCount: 0 });
    }
    const g = target.get(key);

    // Dedup by SOPInstanceUID — the same instance under two URLs counts once.
    if (p.sopInstanceUID) {
      if (g._seenSop.has(p.sopInstanceUID)) { g._dupCount++; continue; }
      g._seenSop.add(p.sopInstanceUID);
    }

    g.instances.push({
      url: p.url,
      instanceNumber: p.instanceNumber,
      imageType: p.imageType,
      ipp: p.imagePositionPatient,
      iop: p.imageOrientationPatient,
    });

    // Backfill series-level metadata from whichever instance has it.
    if (g.seriesNumber == null && p.seriesNumber != null) g.seriesNumber = p.seriesNumber;
    if (!g.seriesDescription && p.seriesDescription) g.seriesDescription = p.seriesDescription;
    if (!g.modality && p.modality) g.modality = p.modality;
    if (g.windowCenter == null && p.windowCenter != null) g.windowCenter = p.windowCenter;
    if (g.windowWidth == null && p.windowWidth != null) g.windowWidth = p.windowWidth;
    if (!g.plane && p.plane) g.plane = p.plane;
    if (!g.imageOrientationPatient && p.imageOrientationPatient) g.imageOrientationPatient = p.imageOrientationPatient;
    if (!g.frameOfReferenceUID && p.frameOfReferenceUID) g.frameOfReferenceUID = p.frameOfReferenceUID;
  }

  // ── Per-series: drop derived extras, sort, log a breakdown ──
  for (const g of imageGroups.values()) {
    const total = g.instances.length;
    const derived = g.instances.filter((i) => isDerivedType(i.imageType));
    const original = g.instances.filter((i) => !isDerivedType(i.imageType));

    let droppedDerived = 0;
    if (DERIVED_MODE === "drop" && original.length > 0 && derived.length > 0) {
      g.instances = original;       // keep only the primary stack (matches IDV)
      droppedDerived = derived.length;
    }

    sortByPosition(g.instances);

    // ImageType histogram for transparency in the console.
    const hist = {};
    for (const i of [...g.instances, ...(droppedDerived ? derived : [])]) {
      const k = i.imageType || "(none)";
      hist[k] = (hist[k] || 0) + 1;
    }
    console.log(
      `[useSeriesGrouping] SE ${g.seriesNumber ?? "?"} "${g.seriesDescription || "?"}": ` +
      `parsed=${total} dropped_derived=${droppedDerived} dropped_dup=${g._dupCount} ` +
      `→ final=${g.instances.length} | ImageType ${JSON.stringify(hist)}`
    );
    g._droppedDerived = droppedDerived;
  }

  // ── Report (but do NOT render) non-image objects and orphans ──
  if (nonImageGroups.size) {
    const desc = Array.from(nonImageGroups.values()).map(
      (g) => `SE ${g.seriesNumber ?? "?"} "${g.seriesDescription || "?"}" [${g.sopClassUID}] x${g.instances.length}`
    );
    console.log("[useSeriesGrouping] excluded non-image objects:", desc.join("; "));
  }
  if (orphans.length) {
    console.warn(
      `[useSeriesGrouping] excluded ${orphans.length} unparsed/headerless file(s):`,
      orphans.map((o) => o.url).slice(0, 10)
    );
  }

  // ── Build final array (image series only), sorted by SeriesNumber ──
  const arr = Array.from(imageGroups.values())
    .filter((g) => g.instances.length > 0)
    .sort((a, b) => {
      const an = a.seriesNumber ?? Infinity;
      const bn = b.seriesNumber ?? Infinity;
      return an - bn;
    });

  const finalShape = arr.map((g) => ({
    seriesUid:           g.seriesInstanceUID,
    seriesNumber:        g.seriesNumber,
    seriesDescription:   g.seriesDescription || (g.modality ? `${g.modality} series` : "Unnamed series"),
    modality:            g.modality,
    sopClassUID:         g.sopClassUID,
    plane:               g.plane,
    defaultWindowCenter: g.windowCenter,
    defaultWindowWidth:  g.windowWidth,
    rows:                g.rows,
    columns:             g.columns,
    instanceCount:       g.instances.length,
    urls:                g.instances.map((i) => i.url),
    // Geometry for cross-reference sync, linked crosshair, and MPR.
    positions:           g.instances.map((i) => (Array.isArray(i.ipp) ? i.ipp : null)),
    iop:                 g.imageOrientationPatient || null,
    frameOfReferenceUID: g.frameOfReferenceUID || null,
    isScout:             isScoutDescription(g.seriesDescription),
    isImageSeries:       true,
  }));

  console.log(
    "[useSeriesGrouping] grouped",
    parsed.length, "files →",
    finalShape.length, "image series:",
    finalShape.map((s) => `${s.seriesNumber ?? "?"}:${s.seriesDescription}(${s.instanceCount})`).join(", ")
  );

  return finalShape;
};

/* ─── Public hook ──────────────────────────────────────────── */
export default function useSeriesGrouping({ caseId, seriesFiles, enabled = true }) {
  const cacheKey = caseId || (Array.isArray(seriesFiles) ? `__files_${seriesFiles.length}_${seriesFiles[0] || ""}` : null);
  const [state, setState] = useState(() => {
    const cached = cacheKey ? groupingCache.get(cacheKey) : null;
    return {
      series:   cached?.series || null,
      loading:  enabled && !cached && Array.isArray(seriesFiles) && seriesFiles.length > 0,
      progress: null,
      error:    null,
    };
  });
  const cancelRef = useRef(false);

  useEffect(() => {
    cancelRef.current = false;

    if (!enabled || !Array.isArray(seriesFiles) || seriesFiles.length === 0 || !cacheKey) {
      setState({ series: null, loading: false, progress: null, error: null });
      return;
    }

    const cached = groupingCache.get(cacheKey);
    if (cached) {
      setState({ series: cached.series, loading: false, progress: null, error: null });
      return;
    }

    let promise = inflight.get(cacheKey);
    if (!promise) {
      promise = (async () => {
        /* PERF: fastest path first — a single JSON fetch, fully precomputed
           server-side. Skips both the client header parse AND the URL remap. */
        const manifest = await loadManifestFromServer(caseId);
        if (manifest) {
          const entry = { series: manifest, parsedAt: Date.now() };
          groupingCache.set(cacheKey, entry);
          inflight.delete(cacheKey);
          return manifest;
        }

        const persisted = await loadSeriesCacheFromBackend(cacheKey);
        if (persisted) {
          // Remap cached series.urls to fresh presigned URLs from current
          // seriesFiles. Cached URLs contain expired presigned query params.
          // Match by filename stem (stable UUID-prefixed .dcm name).
          const freshByFilename = new Map();
          for (const freshUrl of seriesFiles) {
            try {
              const stem = new URL(freshUrl).pathname.split("/").pop();
              if (stem) freshByFilename.set(stem, freshUrl);
            } catch {}
          }
          const remapped = persisted.series.map((s) => ({
            ...s,
            urls: s.urls.map((oldUrl) => {
              try {
                const stem = new URL(oldUrl).pathname.split("/").pop();
                return freshByFilename.get(stem) || oldUrl;
              } catch { return oldUrl; }
            }),
          }));
          const remappedEntry = { ...persisted, series: remapped };
          groupingCache.set(cacheKey, remappedEntry);
          inflight.delete(cacheKey);
          return remapped;
        }
        const parsed = await parseAllInChunks(seriesFiles, (done, total) => {
          if (!cancelRef.current) setState((s) => ({ ...s, progress: { done, total } }));
        });
        const grouped = groupBySeries(parsed);
        const cacheEntry = { series: grouped, parsedAt: Date.now() };
        groupingCache.set(cacheKey, cacheEntry);
        saveSeriesCacheToBackend(cacheKey, cacheEntry);
        inflight.delete(cacheKey);
        return grouped;
      })();
      inflight.set(cacheKey, promise);
    }

    setState({ series: null, loading: true, progress: { done: 0, total: seriesFiles.length }, error: null });

    promise.then(
      (grouped) => {
        if (cancelRef.current) return;
        setState({ series: grouped, loading: false, progress: null, error: null });
      },
      (err) => {
        if (cancelRef.current) return;
        setState({ series: null, loading: false, progress: null, error: err });
      }
    );

    return () => { cancelRef.current = true; };
  }, [cacheKey, enabled, seriesFiles]);

  return state;
}

/**
 * Imperative helper: clear the grouping cache for one case (or all).
 * Call after re-uploads or test data swaps.
 */
export function clearSeriesGroupingCache(caseId) {
  if (caseId) groupingCache.delete(caseId);
  else groupingCache.clear();
}
