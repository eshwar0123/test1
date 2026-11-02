// Plain JPG / JPEG / PNG X-rays are converted to DICOM by the BACKEND, on the fly
// (GET /api/radiology/image-dicom/<key> — nothing is stored). The viewer just loads that URL
// like any .dcm, so every DICOM tool works and the mobile app gets the same file.
//
// JPG/PNG carry no pixel spacing, so a calibrated scale (mm per pixel) is kept per image on
// the server (GET/PUT /api/radiology/image-scale) and written into the DICOM as PixelSpacing.

const IMG_RE = /\.(jpe?g|png)$/i;
const IMAGE_DICOM_PREFIX = "/api/radiology/image-dicom/";

export const isPlainImageUrl = (u) => {
  if (!u || typeof u !== "string") return false;
  const path = u.split("#")[0].split("?")[0];
  return IMG_RE.test(path) || path.includes(IMAGE_DICOM_PREFIX);
};

const safeDecode = (s) => {
  try { return decodeURIComponent(s); } catch { return s; }
};

/** Storage key of an image URL (presigned S3, bulk-case upload, or an image-dicom URL), or null. */
export const imageKeyOf = (url) => {
  if (!url || typeof url !== "string" || url.startsWith("blob:")) return null;
  try {
    const u = new URL(url, window.location.origin);
    const path = u.pathname;
    if (path.startsWith(IMAGE_DICOM_PREFIX)) {
      return safeDecode(path.slice(IMAGE_DICOM_PREFIX.length)).replace(/\.dcm$/i, "");
    }
    if (/[?&]x-amz-signature=/i.test(u.search)) return safeDecode(path.replace(/^\/+/, ""));
    if (path.startsWith("/api/uploads/")) return safeDecode(path.slice(5));
    if (path.startsWith("/uploads/")) return safeDecode(path.slice(1));
  } catch { /* fall through */ }
  return null;
};

/** Backend DICOM URL for a key. `mmPerPx` (number) forces a scale (0 = none); omit to use the saved one. */
export const toImageDicomUrl = (key, mmPerPx) => {
  const path = key.split("/").map(encodeURIComponent).join("/");
  const q = typeof mmPerPx === "number" ? `?mm_per_px=${mmPerPx}` : "";
  // ".dcm" suffix: nginx must not mistake the URL for a static .jpeg/.png file.
  return `${window.location.origin}${IMAGE_DICOM_PREFIX}${path}.dcm${q}`;
};

export const fetchImageScale = async (key) => {
  if (!key) return null;
  try {
    const res = await fetch(`/api/radiology/image-scale?key=${encodeURIComponent(key)}`);
    if (!res.ok) return null;
    const v = Number((await res.json())?.mm_per_px);
    return v > 0 ? v : null;
  } catch { return null; }
};

export const saveImageScale = async (key, mmPerPx) => {
  const res = await fetch("/api/radiology/image-scale", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, mm_per_px: mmPerPx > 0 ? mmPerPx : null }),
  });
  if (!res.ok) throw new Error("Could not save the scale on the server.");
};

/** Original image URL -> backend DICOM URL carrying the saved scale (if any). Unknown URLs pass through. */
export const imageUrlToBackendDicomUrl = async (url) => {
  const key = imageKeyOf(url);
  if (!key) return url;
  const mm = await fetchImageScale(key);
  return toImageDicomUrl(key, mm || undefined);
};

