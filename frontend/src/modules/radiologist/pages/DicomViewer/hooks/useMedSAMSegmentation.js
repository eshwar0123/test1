// src/pages/DicomViewer/hooks/useMedSAMSegmentation.js
//
// Calls ONIX backend /radiology/medsam/segment -> gaming PC MedSAM vit_b
//
// Root-cause fix for inaccurate segmentation:
//   canvas.width/height    = internal Cornerstone pixel resolution (e.g. 1080x1080)
//   canvas.offsetWidth/Height = CSS display size (e.g. 540x540)
//   Box coords from pointer events are in CSS space.
//   drawImage must use INTERNAL dims as source to capture all pixels (sharp).
//   Backend receives CSS dims as coordinate reference so box maps correctly.

import { useCallback, useRef, useState } from "react";

const API_BASE    = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
const SEGMENT_URL = `${API_BASE}/radiology/medsam/segment`;
const MAX_CAPTURE_PX = 1024;   // long-edge cap for PNG sent to server

const SEG_COLORS = [
  [167, 139, 250], [52, 211, 153], [251, 146, 60],  [96, 165, 250],
  [244,  63,  94], [250, 204, 21], [34,  211, 238], [192, 132, 252],
];
let _ci = 0;
const nextColor = () => SEG_COLORS[(_ci++) % SEG_COLORS.length];


function captureCanvas(canvas) {
  const intW = canvas.width;             // internal pixel resolution
  const intH = canvas.height;
  const cssW = canvas.offsetWidth  || intW;   // CSS display size
  const cssH = canvas.offsetHeight || intH;

  const scale = Math.min(1, MAX_CAPTURE_PX / Math.max(intW, intH));
  const dstW  = Math.max(1, Math.round(intW * scale));
  const dstH  = Math.max(1, Math.round(intH * scale));

  const tmp = document.createElement("canvas");
  tmp.width = dstW; tmp.height = dstH;
  // Use internal dims as source so we capture every rendered pixel
  tmp.getContext("2d").drawImage(canvas, 0, 0, intW, intH, 0, 0, dstW, dstH);

  return {
    b64:  tmp.toDataURL("image/png").split(",")[1],
    cssW, cssH,   // coordinate reference for box
  };
}


async function recolorMask(maskB64, color) {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const raw = ctx.getImageData(0, 0, c.width, c.height);
      const d = raw.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] > 10) { d[i] = color[0]; d[i+1] = color[1]; d[i+2] = color[2]; }
      }
      ctx.putImageData(raw, 0, 0);
      resolve(c.toDataURL("image/png"));
    };
    img.src = `data:image/png;base64,${maskB64}`;
  });
}


export default function useMedSAMSegmentation() {
  const [modelStatus] = useState("ready");
  const [isReady]     = useState(true);
  const [error, setError] = useState(null);
  const errRef = useRef(setError);
  errRef.current = setError;

  const segmentBox = useCallback(async (canvas, box, canvasBounds) => {
    errRef.current(null);

    const { b64, cssW, cssH } = captureCanvas(canvas);

    // Translate page-space box to canvas-relative CSS coords
    const cb = canvasBounds || { left: 0, top: 0 };
    const x1 = box.x1 - cb.left;
    const y1 = box.y1 - cb.top;
    const x2 = box.x2 - cb.left;
    const y2 = box.y2 - cb.top;

    if (x2 - x1 < 4 || y2 - y1 < 4) throw new Error("Box too small");

    console.log(
      `[MedSAM] box [${x1.toFixed(0)},${y1.toFixed(0)}->${x2.toFixed(0)},${y2.toFixed(0)}]`,
      `css=${cssW}x${cssH} internal=${canvas.width}x${canvas.height}`
    );

    const color = nextColor();

    let resp;
    try {
      resp = await fetch(SEGMENT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image:  b64,
          box:    [x1, y1, x2, y2],
          width:  cssW,    // CSS coord reference
          height: cssH,
        }),
      });
    } catch (e) {
      throw new Error(`Unreachable: ${e.message}`);
    }

    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      throw new Error(`AI ${resp.status}: ${t.slice(0, 120)}`);
    }

    const data = await resp.json();
    console.log(`[MedSAM] model=${data.model} pixels=${data.pixels}`);

    if (!data.mask) return null;

    const dataUrl = await recolorMask(data.mask, color);
    return { dataUrl, color, score: data.score ?? null, model: data.model };
  }, []);

  return { isReady, modelStatus, error, segmentBox };
}
