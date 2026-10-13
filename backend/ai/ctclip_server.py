"""
CT-CLIP Inference Server
========================
This file runs on the GPU server (not locally).
Copy this to the GPU server at ~/CT-CLIP/ctclip_server.py and run:

    conda activate ct2rep
    python ctclip_server.py

It will expose an API at port 11435 that the onix backend calls.
"""

import os
import sys
import torch
import numpy as np
import nibabel as nib
import tempfile
import base64

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import uvicorn

# Add CT-CLIP paths
CT_CLIP_DIR = os.path.expanduser("~/CT-CLIP")
sys.path.insert(0, os.path.join(CT_CLIP_DIR, "scripts"))
sys.path.insert(0, os.path.join(CT_CLIP_DIR, "CT_CLIP"))
sys.path.insert(0, os.path.join(CT_CLIP_DIR, "transformer_maskgit"))

from ct_clip import CTCLIP
from transformer_maskgit import CTViT
from transformers import BertTokenizer, BertModel

# ==================== CONFIG ====================
WEIGHTS_PATH = os.path.join(CT_CLIP_DIR, "weights", "CT-CLIP_v2.pt")
DEVICE = "cuda:0"  # Use GPU 0

# 18 pathologies CT-CLIP detects
PATHOLOGIES = [
    "Medical material",
    "Arterial wall calcification",
    "Cardiomegaly",
    "Pericardial effusion",
    "Coronary artery wall calcification",
    "Hiatal hernia",
    "Lymphadenopathy",
    "Emphysema",
    "Atelectasis",
    "Lung nodule",
    "Lung opacity",
    "Pulmonary fibrotic sequela",
    "Pleural effusion",
    "Mosaic attenuation pattern",
    "Peribronchial thickening",
    "Consolidation",
    "Bronchiectasis",
    "Interlobular septal thickening",
]

# ==================== MODEL LOADING ====================
print("Loading CT-CLIP model...")

tokenizer = BertTokenizer.from_pretrained(
    "microsoft/BiomedVLP-CXR-BERT-specialized", do_lower_case=True
)
text_encoder = BertModel.from_pretrained("microsoft/BiomedVLP-CXR-BERT-specialized")
text_encoder.resize_token_embeddings(len(tokenizer))

image_encoder = CTViT(
    dim=512,
    codebook_size=8192,
    image_size=480,
    patch_size=20,
    temporal_patch_size=10,
    spatial_depth=4,
    temporal_depth=4,
    dim_head=32,
    heads=8,
)

clip_model = CTCLIP(
    image_encoder=image_encoder,
    text_encoder=text_encoder,
    dim_image=294912,
    dim_text=768,
    dim_latent=512,
    extra_latent_projection=False,
    use_mlm=False,
    downsample_image_embeds=False,
    use_all_token_embeds=False,
)

# Load weights with strict=False to handle extra keys
state_dict = torch.load(WEIGHTS_PATH, map_location="cpu")
clip_model.load_state_dict(state_dict, strict=False)
clip_model = clip_model.to(DEVICE)
clip_model.eval()
print(f"CT-CLIP loaded on {DEVICE}")


# ==================== PREPROCESSING ====================
def preprocess_nifti(nifti_path):
    img = nib.load(nifti_path)
    img_data = img.get_fdata().astype(np.float32)

    if len(img_data.shape) == 4:
        img_data = img_data[:, :, :, 0]

    hu_min, hu_max = -1000, 200
    img_data = np.clip(img_data, hu_min, hu_max)
    img_data = ((img_data + 400) / 600).astype(np.float32)

    tensor = torch.tensor(img_data)
    target_shape = (480, 480, 240)
    h, w, d = tensor.shape
    dh, dw, dd = target_shape

    h_start = max((h - dh) // 2, 0)
    w_start = max((w - dw) // 2, 0)
    d_start = max((d - dd) // 2, 0)

    tensor = tensor[h_start:h_start+dh, w_start:w_start+dw, d_start:d_start+dd]

    pad_h = dh - tensor.size(0)
    pad_w = dw - tensor.size(1)
    pad_d = dd - tensor.size(2)

    tensor = torch.nn.functional.pad(
        tensor,
        (pad_d // 2, pad_d - pad_d // 2, pad_w // 2, pad_w - pad_w // 2, pad_h // 2, pad_h - pad_h // 2),
        value=-1,
    )

    tensor = tensor.permute(2, 0, 1)
    tensor = tensor.unsqueeze(0).unsqueeze(0)
    return tensor


def run_pathology_detection(volume_tensor):
    results = {}
    with torch.no_grad():
        volume_tensor = volume_tensor.to(DEVICE)
        for pathology in PATHOLOGIES:
            pos_tokens = tokenizer(
                f"{pathology} is present.", return_tensors="pt",
                padding="max_length", truncation=True, max_length=512
            ).to(DEVICE)
            neg_tokens = tokenizer(
                f"{pathology} is not present.", return_tensors="pt",
                padding="max_length", truncation=True, max_length=512
            ).to(DEVICE)

            pos_sim = clip_model(
                text=pos_tokens, image=volume_tensor, device=DEVICE, return_loss=False,
            )
            neg_sim = clip_model(
                text=neg_tokens, image=volume_tensor, device=DEVICE, return_loss=False,
            )

            logits = torch.stack([neg_sim, pos_sim], dim=-1)
            probs = torch.softmax(logits, dim=-1)
            confidence = probs[0, 1].item() * 100
            results[pathology] = round(confidence, 1)
    return results


# ==================== FASTAPI ====================
app = FastAPI(title="CT-CLIP Pathology Detection API")

app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "model": "CT-CLIP_v2", "device": DEVICE}


@app.post("/analyze")
async def analyze_nifti(file: UploadFile = File(...)):
    if not file.filename.endswith((".nii", ".nii.gz")):
        raise HTTPException(400, "File must be .nii or .nii.gz")

    suffix = ".nii.gz" if file.filename.endswith(".nii.gz") else ".nii"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        print(f"Processing file: {tmp_path}, size: {os.path.getsize(tmp_path)} bytes")
        volume = preprocess_nifti(tmp_path)
        print(f"Preprocessed volume shape: {volume.shape}")
        results = run_pathology_detection(volume)
        print(f"Detection complete: {results}")
        sorted_results = dict(sorted(results.items(), key=lambda x: x[1], reverse=True))
        detected = {k: v for k, v in sorted_results.items() if v >= 50.0}

        return {
            "success": True,
            "detected_pathologies": detected,
            "all_results": sorted_results,
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(500, f"Analysis failed: {str(e)}")
    finally:
        os.unlink(tmp_path)


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=11435)
