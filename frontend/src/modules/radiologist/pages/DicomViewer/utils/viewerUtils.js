import { BACKEND_URL } from "./constants";

export function formatDateTime(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const day = String(d.getDate()).padStart(2, "0");
  const mon = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  let hr = d.getHours();
  const ampm = hr >= 12 ? "PM" : "AM";
  hr = hr % 12 || 12;
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${day}-${mon}-${year} ${hr}:${min} ${ampm}`;
}

export function getAbsoluteUrl(raw) {
  if (!raw) return null;
  let value = raw;
  if (typeof value === "object") {
    value = value.url || value.file_url || value.fileUrl || value.path || value.name || "";
  }
  if (typeof value !== "string") return null;
  value = value.trim();
  if (!value) return null;
  if (value.startsWith("blob:")) return value;
  if (
    value.startsWith("/src/") ||
    value.startsWith("/assets/") ||
    value.startsWith("/@fs/")
  ) {
    return `${window.location.origin}${value}`;
  }
  if (/^https?:\/\//i.test(value)) {
    try {
      const incoming = new URL(value);
      // When BACKEND_URL is relative (e.g. "/api"), resolve through the Vite
      // dev-server origin so absolute backend URLs (http://127.0.0.1:8100/…)
      // are rewritten to go through the proxy instead of hitting the backend
      // directly — direct requests bypass the proxy and can silently fail.
      const backendBase = /^https?:\/\//i.test(BACKEND_URL)
        ? BACKEND_URL
        : window.location.origin;
      const backend = new URL(backendBase);
      const localHosts = new Set(["localhost", "127.0.0.1"]);
      const isLocalIncoming = localHosts.has(incoming.hostname);
      const isLocalBackend = localHosts.has(backend.hostname);
      const isBackendPath =
        incoming.pathname.startsWith("/uploads/") ||
        incoming.pathname.startsWith("/radiology/");

      if (isLocalIncoming && isLocalBackend && isBackendPath) {
        incoming.protocol = backend.protocol;
        incoming.hostname = backend.hostname;
        incoming.port = backend.port;
        return incoming.toString();
      }
    } catch {
      // fall through to original value if URL parsing fails
    }
    return value;
  }

  const base = BACKEND_URL.endsWith("/") ? BACKEND_URL.slice(0, -1) : BACKEND_URL;
  const path = value.startsWith("/") ? value : `/${value}`;
  return `${base}${path}`;
}

export function buildImageId(url) {
  // Blob URLs must NOT be encoded — encodeURI can corrupt the blob reference
  if (url && url.startsWith("blob:")) return `wadouri:${url}`;
  // S3 presigned URLs must NOT be encoded — encodeURI corrupts the signature
  if (url && (url.includes("X-Amz-Signature") || url.includes("x-amz-signature"))) return `wadouri:${url}`;
  return `wadouri:${encodeURI(url)}`;
}

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function makeGrayImageData(width, height) {
  return new ImageData(width, height);
}

export function applyWindowLevelToRGBA(dstImageData, getValueAt, width, height, wc, ww) {
  const data = dstImageData.data;
  const wLow = wc - ww / 2;
  const wHigh = wc + ww / 2;

  let p = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = getValueAt(x, y);
      let g = ((v - wLow) / (wHigh - wLow)) * 255;
      g = clamp(g, 0, 255) | 0;
      data[p++] = g;
      data[p++] = g;
      data[p++] = g;
      data[p++] = 255;
    }
  }
}

export function normalizeBox(box) {
  return {
    ...box,
    x0: Math.min(box.x0, box.x1),
    x1: Math.max(box.x0, box.x1),
    y0: Math.min(box.y0, box.y1),
    y1: Math.max(box.y0, box.y1),
    z0: Math.min(box.z0, box.z1),
    z1: Math.max(box.z0, box.z1),
  };
}

export function distPointToSegment(px, py, x0, y0, x1, y1) {
  const vx = x1 - x0;
  const vy = y1 - y0;
  const wx = px - x0;
  const wy = py - y0;
  const c1 = vx * wx + vy * wy;
  if (c1 <= 0) return Math.hypot(px - x0, py - y0);
  const c2 = vx * vx + vy * vy;
  if (c2 <= c1) return Math.hypot(px - x1, py - y1);
  const b = c1 / c2;
  const bx = x0 + b * vx;
  const by = y0 + b * vy;
  return Math.hypot(px - bx, py - by);
}

export function pointInBox(px, py, box) {
  return px >= Math.min(box.x0, box.x1) && px <= Math.max(box.x0, box.x1) &&
         py >= Math.min(box.y0, box.y1) && py <= Math.max(box.y0, box.y1);
}

export function sortDicomSliceUrls(urls) {
  return [...urls].sort((a, b) => {
    const ax = (a.match(/(\d+)(?=\.dcm$)/i) || [])[1];
    const bx = (b.match(/(\d+)(?=\.dcm$)/i) || [])[1];
    if (ax && bx) return Number(ax) - Number(bx);
    return a.localeCompare(b);
  });
}

export async function waitForElementsReady(elements, attempts = 120) {
  for (let i = 0; i < attempts; i++) {
    const ready = elements.every((el) => el && el.clientWidth > 10 && el.clientHeight > 10);
    if (ready) return true;
    await new Promise((r) => setTimeout(() => requestAnimationFrame(r), 50));
  }
  return false;
}
