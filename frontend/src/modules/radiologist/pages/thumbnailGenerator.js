/**
 * Generate a real scan-slice thumbnail from uploaded NIfTI or DICOM files.
 * Returns a data-URL (PNG) suitable for <img src>.
 */
import * as nifti from 'nifti-reader-js';
import dicomParser from 'dicom-parser';

const THUMB_SIZE = 128;

/**
 * Main entry: pass a File object, returns a Promise<string|null> (data URL).
 */
export async function generateThumbnail(file) {
  if (!file) return null;
  const name = (file.name || '').toLowerCase();
  try {
    const buf = await file.arrayBuffer();
    if (name.endsWith('.nii') || name.endsWith('.nii.gz')) {
      return renderNiftiSlice(buf);
    }
    if (name.endsWith('.dcm')) {
      return renderDicomSlice(buf);
    }
    // Try DICOM first (many DICOM files have no extension)
    try { return renderDicomSlice(buf); } catch {}
    return null;
  } catch (e) {
    console.warn('Thumbnail generation failed:', e);
    return null;
  }
}

/* ── NIfTI ──────────────────────────────────────────────────── */
function renderNiftiSlice(rawBuf) {
  let buf = rawBuf;
  if (nifti.isCompressed(buf)) {
    buf = nifti.decompress(buf);
  }
  if (!nifti.isNIFTI(buf)) return null;

  const header = nifti.readHeader(buf);
  const image = nifti.readImage(header, buf);

  const dims = header.dims;          // [ndim, x, y, z, ...]
  const nx = dims[1], ny = dims[2], nz = dims[3] || 1;
  const sliceSize = nx * ny;
  const midSlice = Math.floor(nz / 2);

  // Get typed array for the image data
  const typedData = toTypedArray(header.datatypeCode, image);
  const offset = midSlice * sliceSize;
  const slice = typedData.slice(offset, offset + sliceSize);

  // Find min/max for windowing
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < slice.length; i++) {
    if (slice[i] < min) min = slice[i];
    if (slice[i] > max) max = slice[i];
  }
  const range = max - min || 1;

  return renderToCanvas(slice, nx, ny, min, range);
}

/* ── DICOM ─────────────────────────────────────────────────── */
function renderDicomSlice(buf) {
  const byteArray = new Uint8Array(buf);
  const dataSet = dicomParser.parseDicom(byteArray);

  const rows = dataSet.uint16('x00280010');
  const cols = dataSet.uint16('x00280011');
  const bitsAllocated = dataSet.uint16('x00280100') || 16;
  const pixelRepresentation = dataSet.uint16('x00280103') || 0;
  const pixelDataElement = dataSet.elements['x7fe00010'];

  if (!pixelDataElement || !rows || !cols) return null;

  const pixelDataOffset = pixelDataElement.dataOffset;
  const pixelDataLength = pixelDataElement.length;

  let pixelData;
  if (bitsAllocated === 16) {
    if (pixelRepresentation === 1) {
      pixelData = new Int16Array(buf, pixelDataOffset, pixelDataLength / 2);
    } else {
      pixelData = new Uint16Array(buf, pixelDataOffset, pixelDataLength / 2);
    }
  } else if (bitsAllocated === 8) {
    pixelData = new Uint8Array(buf, pixelDataOffset, pixelDataLength);
  } else {
    pixelData = new Uint16Array(buf, pixelDataOffset, pixelDataLength / 2);
  }

  // Use first frame only
  const sliceSize = rows * cols;
  const slice = pixelData.length > sliceSize ? pixelData.slice(0, sliceSize) : pixelData;

  let min = Infinity, max = -Infinity;
  for (let i = 0; i < slice.length; i++) {
    if (slice[i] < min) min = slice[i];
    if (slice[i] > max) max = slice[i];
  }
  const range = max - min || 1;

  return renderToCanvas(slice, cols, rows, min, range);
}

/* ── Shared: render a 2D pixel array to a canvas thumbnail ─── */
function renderToCanvas(slice, width, height, min, range) {
  const canvas = document.createElement('canvas');
  canvas.width = THUMB_SIZE;
  canvas.height = THUMB_SIZE;
  const ctx = canvas.getContext('2d');

  // Create full-res ImageData then draw scaled
  const full = document.createElement('canvas');
  full.width = width;
  full.height = height;
  const fctx = full.getContext('2d');
  const imgData = fctx.createImageData(width, height);

  for (let i = 0; i < width * height; i++) {
    const v = Math.round(((slice[i] - min) / range) * 255);
    const idx = i * 4;
    imgData.data[idx]     = v;
    imgData.data[idx + 1] = v;
    imgData.data[idx + 2] = v;
    imgData.data[idx + 3] = 255;
  }
  fctx.putImageData(imgData, 0, 0);

  // Draw scaled to thumbnail size (maintain aspect ratio)
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, THUMB_SIZE, THUMB_SIZE);
  const scale = Math.min(THUMB_SIZE / width, THUMB_SIZE / height);
  const sw = width * scale;
  const sh = height * scale;
  const sx = (THUMB_SIZE - sw) / 2;
  const sy = (THUMB_SIZE - sh) / 2;
  ctx.drawImage(full, 0, 0, width, height, sx, sy, sw, sh);

  return canvas.toDataURL('image/png');
}

/* ── NIfTI datatype → TypedArray ──────────────────────────── */
function toTypedArray(code, buffer) {
  switch (code) {
    case 2:   return new Uint8Array(buffer);
    case 4:   return new Int16Array(buffer);
    case 8:   return new Int32Array(buffer);
    case 16:  return new Float32Array(buffer);
    case 64:  return new Float64Array(buffer);
    case 256: return new Int8Array(buffer);
    case 512: return new Uint16Array(buffer);
    case 768: return new Uint32Array(buffer);
    default:  return new Uint8Array(buffer);
  }
}
