// Lets the normal Cornerstone DICOM viewer open plain JPG / JPEG / PNG X-ray images.
//
// Each image is decoded in the browser, converted to 8-bit greyscale and wrapped into a
// minimal single-frame DICOM file (Explicit VR Little Endian, MONOCHROME2, uncompressed).
// The result is handed to the existing `wadouri:` loader as a blob URL, so the viewer's
// toolbar, window/level, zoom, pan, flip, rotate, Length/ROI measurements, annotations and
// slice scrolling all work exactly as they do for .dcm files.
//
// JPG/PNG carry no pixel spacing, so measurements read in pixels until the radiologist
// calibrates the scale. A calibrated scale is written into the DICOM as PixelSpacing
// (0028,0030) and remembered per image in this browser.

const IMG_RE = /\.(jpe?g|png)$/i;

export const isPlainImageUrl = (u) => {
  if (!u || typeof u !== "string") return false;
  const path = u.split("#")[0].split("?")[0];
  return IMG_RE.test(path);
};

/* ───────── remembered scale (mm per pixel), keyed by the URL without its query ───────── */
const spacingKey = (u) => `imgscale:${String(u || "").split("?")[0]}`;
export const getSavedSpacing = (u) => {
  try {
    const v = Number(localStorage.getItem(spacingKey(u)));
    return v > 0 ? v : null;
  } catch { return null; }
};
export const saveSpacing = (u, mmPerPx) => {
  try {
    if (mmPerPx > 0) localStorage.setItem(spacingKey(u), String(mmPerPx));
    else localStorage.removeItem(spacingKey(u));
  } catch { /* storage is optional */ }
};

/* ───────── minimal DICOM writer ───────── */
const enc = new TextEncoder();
const LONG_VRS = new Set(["OB", "OW", "OF", "SQ", "UT", "UN"]);

const pad = (bytes, padByte) => {
  if (bytes.length % 2 === 0) return bytes;
  const out = new Uint8Array(bytes.length + 1);
  out.set(bytes);
  out[bytes.length] = padByte;
  return out;
};

function element(group, el, vr, valueBytes) {
  const long = LONG_VRS.has(vr);
  const headLen = long ? 12 : 8;
  const out = new Uint8Array(headLen + valueBytes.length);
  const dv = new DataView(out.buffer);
  dv.setUint16(0, group, true);
  dv.setUint16(2, el, true);
  out[4] = vr.charCodeAt(0);
  out[5] = vr.charCodeAt(1);
  if (long) {
    dv.setUint32(8, valueBytes.length, true);
  } else {
    dv.setUint16(6, valueBytes.length, true);
  }
  out.set(valueBytes, headLen);
  return out;
}
const uiEl = (g, e, s) => element(g, e, "UI", pad(enc.encode(s), 0));
const csEl = (g, e, s) => element(g, e, "CS", pad(enc.encode(s), 0x20));
const dsEl = (g, e, s) => element(g, e, "DS", pad(enc.encode(s), 0x20));
const isEl = (g, e, s) => element(g, e, "IS", pad(enc.encode(s), 0x20));
const usEl = (g, e, n) => {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, n, true);
  return element(g, e, "US", b);
};

const concat = (parts) => {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  parts.forEach((p) => { out.set(p, o); o += p.length; });
  return out;
};

const rand = () => Math.floor(Math.random() * 1e9);
const newUid = () => `2.25.${Date.now()}${rand()}${rand()}`;

/** Wrap 8-bit greyscale pixels into a Part-10 DICOM file. */
export function buildDicomFromGray({ width, height, pixels, mmPerPx }) {
  const CR_STORAGE = "1.2.840.10008.5.1.4.1.1.1";
  const EXPLICIT_LE = "1.2.840.10008.1.2.1";
  const sopInstance = newUid();

  // File meta information (group 0002). Group length element is computed last.
  const metaBody = concat([
    element(0x0002, 0x0001, "OB", new Uint8Array([0x00, 0x01])),
    uiEl(0x0002, 0x0002, CR_STORAGE),
    uiEl(0x0002, 0x0003, sopInstance),
    uiEl(0x0002, 0x0010, EXPLICIT_LE),
    uiEl(0x0002, 0x0012, "1.2.826.0.1.3680043.9.7133.1"),
  ]);
  const groupLen = new Uint8Array(4);
  new DataView(groupLen.buffer).setUint32(0, metaBody.length, true);
  const meta = concat([element(0x0002, 0x0000, "UL", groupLen), metaBody]);

  // Data set — elements MUST be in ascending tag order.
  const parts = [
    uiEl(0x0008, 0x0016, CR_STORAGE),
    uiEl(0x0008, 0x0018, sopInstance),
    csEl(0x0008, 0x0060, "CR"),
    uiEl(0x0020, 0x000d, newUid()),
    uiEl(0x0020, 0x000e, newUid()),
    isEl(0x0020, 0x0013, "1"),
    usEl(0x0028, 0x0002, 1),
    csEl(0x0028, 0x0004, "MONOCHROME2"),
    usEl(0x0028, 0x0010, height),
    usEl(0x0028, 0x0011, width),
  ];
  if (mmPerPx > 0) {
    const s = mmPerPx.toFixed(6);
    parts.push(dsEl(0x0028, 0x0030, `${s}\\${s}`));
  }
  parts.push(
    usEl(0x0028, 0x0100, 8),
    usEl(0x0028, 0x0101, 8),
    usEl(0x0028, 0x0102, 7),
    usEl(0x0028, 0x0103, 0),
    dsEl(0x0028, 0x1050, "127"),
    dsEl(0x0028, 0x1051, "256"),
    element(0x7fe0, 0x0010, "OB", pad(pixels, 0)),
  );

  const preamble = new Uint8Array(128);
  const magic = enc.encode("DICM");
  return concat([preamble, magic, meta, concat(parts)]);
}

/* ───────── decode + cache ───────── */
async function decodeToGray(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Could not load image (HTTP ${resp.status})`);
  const blob = await resp.blob();
  const bmp = await createImageBitmap(blob);
  const width = bmp.width;
  const height = bmp.height;
  if (width > 65535 || height > 65535) throw new Error("Image is too large to display");
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  try { bmp.close?.(); } catch { /* ignore */ }
  const { data } = ctx.getImageData(0, 0, width, height);
  const pixels = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < pixels.length; i += 1, p += 4) {
    pixels[i] = (data[p] * 299 + data[p + 1] * 587 + data[p + 2] * 114) / 1000;
  }
  return { width, height, pixels };
}

const decodeCache = new Map();   // source url -> Promise<{width,height,pixels}>
const blobCache = new Map();     // `${url}|${mmPerPx}` -> Promise<blob url>
const sourceOfBlob = new Map();  // blob url -> source url (lets calibration rebuild from the original)

/** Source image URL -> blob URL of the wrapped DICOM (cached). */
export function imageUrlToDicomBlobUrl(url, { mmPerPx } = {}) {
  const spacing = mmPerPx > 0 ? mmPerPx : 0;
  const key = `${url}|${spacing}`;
  if (blobCache.has(key)) return blobCache.get(key);
  const promise = (async () => {
    if (!decodeCache.has(url)) decodeCache.set(url, decodeToGray(url));
    let decoded;
    try {
      decoded = await decodeCache.get(url);
    } catch (e) {
      decodeCache.delete(url);
      throw e;
    }
    const bytes = buildDicomFromGray({ ...decoded, mmPerPx: spacing });
    const blobUrl = URL.createObjectURL(new Blob([bytes], { type: "application/dicom" }));
    sourceOfBlob.set(blobUrl, url);
    return blobUrl;
  })();
  blobCache.set(key, promise);
  promise.catch(() => blobCache.delete(key));
  return promise;
}

/** blob URL made above -> the original image URL (or null). */
export const sourceUrlOfBlob = (blobUrl) => sourceOfBlob.get(blobUrl) || null;
