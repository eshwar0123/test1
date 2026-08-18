# medsam_server.py
# Run this separately:  python medsam_server.py
# It listens on port 7777 and connects to the HTML GUI

import os, base64, io
import numpy as np
from PIL import Image
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

app = FastAPI(title="MedSAM Server")

# Allow browser to call this from onixai.in
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Config — change these paths ──────────────────────────────────────────────
NII_DIR  = "/mnt/onix/backend/radiologist/nii"
WEB_ROOT = "/var/www/onix-home"
# ─────────────────────────────────────────────────────────────────────────────


# ── GET /slice — load a NIfTI slice and return as base64 JPEG ────────────────
@app.get("/slice")
def get_slice(file: str = Query(...), pct: int = Query(50)):
    import nibabel as nib

    safe  = os.path.basename(file)
    path  = os.path.join(NII_DIR, safe)
    if not os.path.exists(path):
        raise HTTPException(404, f"File not found: {safe}")

    try:
        data = nib.load(path).get_fdata()
        if data.ndim == 4:
            data = data[..., 0]

        n      = data.shape[2]
        idx    = max(0, min(n - 1, int(n * pct / 100)))
        sl     = np.rot90(data[:, :, idx]).astype(np.float32)
        lo, hi = sl.min(), sl.max()
        sl     = ((sl - lo) / max(hi - lo, 1e-8) * 255).astype(np.uint8)
        H, W   = sl.shape

        rgb = np.stack([sl, sl, sl], axis=-1)
        buf = io.BytesIO()
        Image.fromarray(rgb).save(buf, format="JPEG", quality=90)

        return {
            "image":     base64.b64encode(buf.getvalue()).decode(),
            "width":     W,
            "height":    H,
            "slice_idx": idx,
            "n_slices":  n,
            "filename":  safe,
        }
    except Exception as e:
        raise HTTPException(500, str(e))


# ── POST /segment — run OpenCV segmentation on the drawn box ─────────────────
class SegRequest(BaseModel):
    image:  str         # JPEG base64 (canvas capture)
    box:    list        # [x1, y1, x2, y2] display-pixel coords
    width:  int
    height: int


@app.post("/segment")
def segment(req: SegRequest):
    import cv2

    # Decode image
    img_bytes = base64.b64decode(req.image)
    img_np    = np.array(Image.open(io.BytesIO(img_bytes)).convert("RGB"))
    H, W      = img_np.shape[:2]

    # Scale box to image coords
    sx  = W / max(req.width,  1)
    sy  = H / max(req.height, 1)
    box = [
        max(0.0, req.box[0] * sx),
        max(0.0, req.box[1] * sy),
        min(float(W), req.box[2] * sx),
        min(float(H), req.box[3] * sy),
    ]

    mask = _segment(img_np, box)
    return {"mask": _to_png_b64(mask), "model": "opencv"}


# ── POST /save — save result PNG to web server ───────────────────────────────
class SaveRequest(BaseModel):
    image: str   # PNG base64

@app.post("/save")
def save_result(req: SaveRequest):
    try:
        out = os.path.join(WEB_ROOT, "medsam_result.png")
        with open(out, "wb") as f:
            f.write(base64.b64decode(req.image))
        return {"success": True, "url": "https://onixai.in/medsam_result.png"}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ── GET /files — list available NIfTI files ───────────────────────────────────
@app.get("/files")
def list_files():
    files = [f for f in os.listdir(NII_DIR)
             if f.endswith(".nii") or f.endswith(".nii.gz")]
    return {"files": sorted(files)}


# ── Segmentation logic ────────────────────────────────────────────────────────
def _segment(img_np: np.ndarray, box: list) -> np.ndarray:
    import cv2

    H, W   = img_np.shape[:2]
    x1, y1 = max(0, int(round(box[0]))), max(0, int(round(box[1])))
    x2, y2 = min(W, int(round(box[2]))), min(H, int(round(box[3])))
    mask   = np.zeros((H, W), dtype=bool)
    if x2 <= x1 or y2 <= y1:
        return mask

    roi_w, roi_h = x2 - x1, y2 - y1
    cx, cy = roi_w // 2, roi_h // 2

    # Grayscale + normalise
    roi  = img_np[y1:y2, x1:x2]
    gray = cv2.cvtColor(roi, cv2.COLOR_RGB2GRAY) if roi.ndim == 3 else roi.copy()
    gray = gray.astype(np.float32)
    lo, hi = gray.min(), gray.max()
    gray = ((gray - lo) / max(hi - lo, 1e-8) * 255).astype(np.uint8)

    # Method 1: adaptive region growing from center
    try:
        sr   = max(2, min(5, min(roi_w, roi_h) // 12))
        patch = gray[max(0,cy-sr):cy+sr+1, max(0,cx-sr):cx+sr+1]
        mean  = float(patch.mean())
        std   = float(patch.std())
        tol   = max(15, min(70, int(std * 2.5 + 18)))

        rng = ((gray >= max(0, mean - tol)) &
               (gray <= min(255, mean + tol))).astype(np.uint8) * 255
        k = max(3, min(11, min(roi_w, roi_h) // 18))
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
        rng = cv2.morphologyEx(rng, cv2.MORPH_CLOSE, kernel, iterations=2)
        result = _center_component(rng, cx, cy)
        if result is not None and 0.02 <= result.sum() / (roi_w * roi_h) <= 0.96:
            mask[y1:y2, x1:x2] = result
            return mask
    except Exception:
        pass

    # Method 2: contour tracing
    try:
        clahe = cv2.createCLAHE(3.0, (8, 8))
        enh   = clahe.apply(gray)
        thr, _ = cv2.threshold(enh, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        edges  = cv2.Canny(enh, thr * 0.5, thr)
        k2 = max(3, min(9, min(roi_w, roi_h) // 25))
        ker2 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k2, k2))
        edges = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, ker2, iterations=2)
        cnts, _ = cv2.findContours(edges, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
        for cnt in sorted(cnts, key=cv2.contourArea, reverse=True):
            if cv2.contourArea(cnt) < 50:
                continue
            if cv2.pointPolygonTest(cnt, (float(cx), float(cy)), False) >= 0:
                filled = np.zeros((roi_h, roi_w), dtype=np.uint8)
                cv2.drawContours(filled, [cnt], -1, 255, cv2.FILLED)
                ratio = filled.sum() / 255 / (roi_w * roi_h)
                if 0.02 <= ratio <= 0.96:
                    mask[y1:y2, x1:x2] = filled.astype(bool)
                    return mask
    except Exception:
        pass

    # Method 3: K-means
    try:
        flat = gray.reshape(-1, 1).astype(np.float32)
        _, lbl, _ = cv2.kmeans(flat, 3, None,
            (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0),
            5, cv2.KMEANS_RANDOM_CENTERS)
        lmap = lbl.reshape(roi_h, roi_w)
        km = (lmap == int(lmap[cy, cx]))
        if 0.02 <= km.sum() / (roi_w * roi_h) <= 0.96:
            mask[y1:y2, x1:x2] = km
            return mask
    except Exception:
        pass

    # Fallback: filled box
    mask[y1:y2, x1:x2] = True
    return mask


def _center_component(binary, cx, cy):
    import cv2
    if binary[cy, cx] == 0:
        return None
    _, labels, _, _ = cv2.connectedComponentsWithStats(binary)
    lbl = int(labels[cy, cx])
    return (labels == lbl) if lbl != 0 else None


def _to_png_b64(mask: np.ndarray) -> str:
    H, W  = mask.shape
    rgba  = np.zeros((H, W, 4), dtype=np.uint8)
    rgba[mask, 0] = 167
    rgba[mask, 1] = 139
    rgba[mask, 2] = 250
    rgba[mask, 3] = 210
    buf = io.BytesIO()
    Image.fromarray(rgba, "RGBA").save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


if __name__ == "__main__":
    print("MedSAM GUI Server starting on port 7777")
    print("GUI:  https://onixai.in/medsam.html")
    print("API:  http://localhost:7777")
    uvicorn.run(app, host="0.0.0.0", port=7777)
