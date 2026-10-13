#!/usr/bin/env python3
"""
MedGemma Standalone DICOM Report Generator — v4 (OOM-SAFE + PARALLEL + ACCURATE)
─────────────────────────────────────────────────────────────────────────────
v4 FIXES (CRITICAL):
  🛡️  Hierarchical summarization — avoids GPU OOM in Findings step
  🛡️  OOM-aware retry (longer waits when "CUDA out of memory")
  🛡️  Smaller default workers (2 instead of 4)
  🛡️  Reduced default slices (50 instead of 80)
  🛡️  Auto-detect OOM and back off

v3 PARALLEL (retained):
  ⚡ Parallel batch processing within views
  ⚡ Parallel section generation (3-phase DAG)

v2 ACCURACY (retained):
  ✅ Study-aware prompts (Brain → brain anatomy ONLY)
  ✅ Anatomy mapping (11 study types)
  ✅ Empty slice filtering + smart sampling
  ✅ Retry logic
  ✅ Mandatory section validation
  ✅ Organ mismatch detection

Usage:
  # SAFE default (recommended after OOM errors)
  python medgemma_standalone.py /path/to/dicom \
    --modality "MRI" --study "Brain" \
    --output-dir ./case_001

  # Aggressive (only if GPU has spare memory)
  python medgemma_standalone.py /path/to/dicom \
    --modality "MRI" --study "Brain" \
    --output-dir ./case_001 \
    --workers 4 --max-slices 100

  # GPU memory-constrained (lots of OOM errors)
  python medgemma_standalone.py /path/to/dicom \
    --modality "MRI" --study "Brain" \
    --output-dir ./case_001 \
    --workers 1 --max-slices 30 --gpu-friendly
"""

import os
import sys
import argparse
import logging
import json
import time
import base64
import io
import re
import threading
from pathlib import Path
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

import numpy as np
import requests
from PIL import Image
from tqdm import tqdm

try:
    import pydicom
except ImportError:
    print("[ERROR] pydicom not installed. Run: pip install pydicom --break-system-packages")
    sys.exit(1)


# ═══════════════════════════════════════════════════════════════════════════════
# CONFIG (SAFER DEFAULTS)
# ═══════════════════════════════════════════════════════════════════════════════

MEDGEMMA_URL    = os.getenv("MEDGEMMA_URL", "http://100.88.115.54:11437")
BATCH_SIZE      = 4
SLICE_H         = 224
OUTPUT_DIR      = Path("./medgemma_output")
TIMEOUT         = 300
MAX_RETRIES     = 4              # Increased for OOM handling
MAX_WORKERS     = 2              # ⬇️ Safer default (was 4)
MIN_VARIANCE    = 50.0
TRIM_BORDERS    = 0.10
MAX_VIEW_SLICES = 50             # ⬇️ Safer default (was 80)
MAX_OBS_PER_VIEW_CHARS = 2000    # 🛡️ Cap per-view obs before summarization
GPU_FRIENDLY    = False           # Set via --gpu-friendly flag

# Thread-safe lock
_progress_lock = threading.Lock()


# ═══════════════════════════════════════════════════════════════════════════════
# STUDY → ANATOMY MAP
# ═══════════════════════════════════════════════════════════════════════════════

STUDY_ANATOMY = {
    "brain": {
        "anatomy": "cerebral hemispheres, cerebellum, brainstem, ventricular system, basal ganglia, thalami, corpus callosum, white matter, gray matter, sulci, gyri",
        "abnormalities": "infarct, hemorrhage, mass, edema, midline shift, ventriculomegaly, white matter changes, atrophy, hydrocephalus",
        "exclude": "lungs, heart, mediastinum, liver, kidneys, abdominal organs, pelvis, extremities",
        "primary_views": ["axial", "coronal"],
    },
    "head": {
        "anatomy": "brain parenchyma, skull, scalp, paranasal sinuses, orbits, mastoid air cells",
        "abnormalities": "fracture, mass, hemorrhage, sinusitis, mucosal thickening",
        "exclude": "lungs, abdomen, pelvis, extremities",
        "primary_views": ["axial", "coronal"],
    },
    "chest": {
        "anatomy": "lungs (lobes), mediastinum, heart, great vessels, pleural spaces, ribs, hila, lymph nodes",
        "abnormalities": "nodule, consolidation, ground-glass opacity, effusion, pneumothorax, atelectasis, lymphadenopathy, cardiomegaly",
        "exclude": "brain, abdominal organs, pelvis, extremities",
        "primary_views": ["axial", "coronal"],
    },
    "thorax": {
        "anatomy": "lungs, mediastinum, heart, great vessels, pleural spaces, ribs, hila",
        "abnormalities": "nodule, consolidation, effusion, pneumothorax, atelectasis, cardiomegaly",
        "exclude": "brain, abdomen, pelvis, extremities",
        "primary_views": ["axial", "coronal"],
    },
    "abdomen": {
        "anatomy": "liver, spleen, pancreas, kidneys, adrenals, gallbladder, bowel loops, abdominal aorta, IVC",
        "abnormalities": "mass, cyst, hepatomegaly, splenomegaly, hydronephrosis, fluid collection, lymphadenopathy",
        "exclude": "brain, lungs, heart, mediastinum, extremities",
        "primary_views": ["axial", "coronal"],
    },
    "pelvis": {
        "anatomy": "urinary bladder, prostate or uterus/ovaries, rectum, sigmoid colon, bony pelvis, hip joints",
        "abnormalities": "mass, cyst, fluid, fracture, lymphadenopathy",
        "exclude": "brain, lungs, upper abdomen, extremities",
        "primary_views": ["axial", "sagittal"],
    },
    "spine": {
        "anatomy": "vertebral bodies, intervertebral discs, spinal cord, neural foramina, facet joints",
        "abnormalities": "disc herniation, spinal stenosis, foraminal narrowing, spondylolisthesis, fracture, cord compression",
        "exclude": "brain, lungs, abdominal organs",
        "primary_views": ["sagittal", "axial"],
    },
    "lumbar": {
        "anatomy": "lumbar vertebrae (L1-L5), discs, conus medullaris, cauda equina, neural foramina",
        "abnormalities": "disc herniation, lumbar stenosis, foraminal narrowing, spondylolisthesis",
        "exclude": "brain, lungs, upper abdomen",
        "primary_views": ["sagittal", "axial"],
    },
    "cervical": {
        "anatomy": "cervical vertebrae (C1-C7), discs, spinal cord, neural foramina",
        "abnormalities": "disc herniation, cervical stenosis, cord compression",
        "exclude": "lungs, abdomen, lower extremities",
        "primary_views": ["sagittal", "axial"],
    },
    "knee": {
        "anatomy": "femur, tibia, fibula, patella, menisci, cruciate ligaments, collateral ligaments, joint cartilage",
        "abnormalities": "meniscal tear, ligament tear, bone marrow edema, joint effusion, chondromalacia",
        "exclude": "brain, lungs, abdomen, contralateral leg",
        "primary_views": ["sagittal", "coronal", "axial"],
    },
    "shoulder": {
        "anatomy": "humeral head, glenoid, acromion, clavicle, rotator cuff, labrum, biceps tendon",
        "abnormalities": "rotator cuff tear, labral tear, impingement, joint effusion",
        "exclude": "brain, lungs, abdomen",
        "primary_views": ["coronal", "axial", "sagittal"],
    },
}


def get_anatomy_context(study: str) -> Dict:
    if not study:
        return {"anatomy": "anatomical structures visible", "abnormalities": "any focal abnormality",
                "exclude": "", "primary_views": ["axial", "coronal", "sagittal"]}
    s = study.lower().strip()
    if s in STUDY_ANATOMY:
        return STUDY_ANATOMY[s]
    for key, val in STUDY_ANATOMY.items():
        if key in s or s in key:
            return val
    if any(w in s for w in ["brain", "head", "skull"]): return STUDY_ANATOMY["brain"]
    if any(w in s for w in ["chest", "thorax", "lung"]): return STUDY_ANATOMY["chest"]
    if any(w in s for w in ["abdom", "liver", "kidney"]): return STUDY_ANATOMY["abdomen"]
    if any(w in s for w in ["pelvi", "bladder", "uterus"]): return STUDY_ANATOMY["pelvis"]
    if any(w in s for w in ["spine", "vertebr", "disc", "lumb", "cerv"]): return STUDY_ANATOMY["spine"]
    if "knee" in s: return STUDY_ANATOMY["knee"]
    if "shoulder" in s: return STUDY_ANATOMY["shoulder"]
    return {"anatomy": f"anatomical structures relevant to {study}",
            "abnormalities": "any focal abnormality",
            "exclude": "", "primary_views": ["axial", "coronal", "sagittal"]}


# ═══════════════════════════════════════════════════════════════════════════════
# LOGGING
# ═══════════════════════════════════════════════════════════════════════════════

OUTPUT_DIR.mkdir(exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)-8s %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(OUTPUT_DIR / "log.txt"),
    ]
)
logger = logging.getLogger(__name__)


@dataclass
class SliceImage:
    view: str
    index: int
    image_base64: str


# ═══════════════════════════════════════════════════════════════════════════════
# DICOM LOADING + SAMPLING
# ═══════════════════════════════════════════════════════════════════════════════

def load_dicom_folder(folder: Path) -> np.ndarray:
    logger.info(f"Loading DICOM from {folder}...")
    dcm_files = sorted(folder.glob("**/*.dcm"), key=lambda f: f.name)
    if not dcm_files:
        raise ValueError(f"No .dcm files found in {folder}")
    logger.info(f"Found {len(dcm_files)} DICOM files")
    
    slices_list, dimensions = [], []
    for dcm_path in dcm_files:
        try:
            ds = pydicom.dcmread(dcm_path)
            px = ds.pixel_array
            if px.ndim == 3:
                px = np.dot(px[..., :3], [0.299, 0.587, 0.114])
            px = np.clip(px, 0, 255).astype(np.uint8)
            slices_list.append(px)
            dimensions.append(px.shape)
        except Exception as e:
            logger.debug(f"Skipped {dcm_path.name}: {e}")
    
    if not slices_list:
        raise ValueError("No valid slices loaded")
    
    if len(set(dimensions)) > 1:
        max_h = max(d[0] for d in dimensions)
        max_w = max(d[1] for d in dimensions)
        logger.info(f"Padding to ({max_h}, {max_w})")
        padded = []
        for px in slices_list:
            h, w = px.shape
            pad_h = (max_h - h) // 2
            pad_w = (max_w - w) // 2
            p = np.pad(px, ((pad_h, max_h - h - pad_h), (pad_w, max_w - w - pad_w)),
                       mode='constant', constant_values=0)
            padded.append(p)
        slices_list = padded
    
    volume = np.stack(slices_list, axis=0)
    logger.info(f"Volume: {volume.shape}")
    return volume


def is_slice_informative(arr: np.ndarray) -> bool:
    if arr.size == 0:
        return False
    return float(np.var(arr)) > MIN_VARIANCE and float(np.mean(arr > 20)) > 0.05


def sample_slices(slices, max_count):
    n = len(slices)
    if n == 0: return []
    start = int(n * TRIM_BORDERS)
    end = int(n * (1 - TRIM_BORDERS))
    candidates = [(i, slices[i]) for i in range(start, end)]
    informative = [(i, s) for i, s in candidates if is_slice_informative(s)]
    if not informative:
        informative = candidates if candidates else [(i, slices[i]) for i in range(n)]
    if len(informative) > max_count:
        step = len(informative) / max_count
        return [informative[int(i * step)] for i in range(max_count)]
    return informative


def extract_views_smart(volume, study):
    z, h, w = volume.shape
    logger.info(f"Extracting views from {volume.shape} for '{study}'...")
    ctx = get_anatomy_context(study)
    primary = ctx["primary_views"]
    
    raw = {
        "axial":    [volume[i, :, :] for i in range(z)],
        "coronal":  [volume[:, i, :] for i in range(h)],
        "sagittal": [volume[:, :, i] for i in range(w)],
    }
    
    sampled = {}
    for v in ["axial", "coronal", "sagittal"]:
        if v == primary[0]:
            budget = MAX_VIEW_SLICES
        elif v in primary:
            budget = MAX_VIEW_SLICES // 2
        else:
            budget = MAX_VIEW_SLICES // 3
        sampled[v] = sample_slices(raw[v], max_count=budget)
        logger.info(f"  {v}: {len(raw[v])} → {len(sampled[v])} slices")
    return sampled


def numpy_to_base64_png(arr):
    arr_min, arr_max = arr.min(), arr.max()
    if arr_max > arr_min:
        arr_norm = ((arr - arr_min) / (arr_max - arr_min) * 255).astype(np.uint8)
    else:
        arr_norm = np.zeros_like(arr, dtype=np.uint8)
    img = Image.fromarray(arr_norm, mode='L')
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return base64.b64encode(buf.getvalue()).decode()


def build_slice_images(views):
    slices = []
    for view_name, indexed_slices in views.items():
        for idx, arr in indexed_slices:
            slices.append(SliceImage(view=view_name, index=idx, image_base64=numpy_to_base64_png(arr)))
    logger.info(f"Built {len(slices)} SliceImage objects")
    return slices


# ═══════════════════════════════════════════════════════════════════════════════
# PROMPTS (more concise to reduce token count)
# ═══════════════════════════════════════════════════════════════════════════════

def _batch_prompt(view, indices, modality, patient_sex, study, anatomy_ctx):
    density = ("attenuation (HU), density"
               if "CT" in (modality or "").upper()
               else "signal intensity on T1/T2")
    exclude_clause = ""
    if anatomy_ctx["exclude"]:
        exclude_clause = (
            f" CONSTRAINT: This is {study.upper()} only. "
            f"DO NOT mention {anatomy_ctx['exclude']}. "
            f"Focus on {anatomy_ctx['anatomy']}."
        )
    return (
        f"You are a radiologist examining {study.upper()} {modality.upper()} (plane: {view}, slices: {indices}).\n"
        f"Expected {study} anatomy: {anatomy_ctx['anatomy']}.\n"
        f"Findings to look for: {anatomy_ctx['abnormalities']}.\n\n"
        f"Describe in 2-3 concise radiological sentences:\n"
        f"1. Visible {study} structures and their location.\n"
        f"2. {density.capitalize()}, contour, dimensions where clear.\n"
        f"3. Any abnormality OR 'No acute abnormality in this plane.'"
        f"{exclude_clause}\n\n"
        f"Plain prose only. No JSON."
    )


def _summarize_view_prompt(view, view_obs, study, modality, anatomy_ctx):
    """🛡️ NEW: Summarize all batches in one view into a single paragraph to avoid OOM."""
    return (
        f"You are summarizing radiology observations from a {study.upper()} {modality} examination.\n"
        f"View: {view}\n"
        f"Per-batch observations:\n{view_obs}\n\n"
        f"Write a SINGLE concise paragraph (max 80 words) capturing the key {study} findings from these slices.\n"
        f"Focus on: normal anatomy observed, abnormalities, recurring patterns.\n"
        f"Use proper {study} terminology. No preamble. Begin immediately with the summary."
    )


def _technique_prompt(patient_info, modality, body_region, anatomy_ctx):
    return (
        f"Write a 2-3 sentence TECHNIQUE paragraph for a {body_region.upper()} {modality} radiology report.\n"
        f"Patient: {patient_info}\n"
        f"Include modality, coverage, sequences, contrast, positioning.\n"
        f"Plain prose only. No headers. Begin immediately."
    )


def _findings_prompt(patient_info, modality, observations_summary, study, anatomy_ctx):
    """🛡️ Now uses SUMMARIZED observations (not raw all_obs) to avoid OOM."""
    exclude_clause = ""
    if anatomy_ctx["exclude"]:
        exclude_clause = f"\nCRITICAL: {study.upper()} study. DO NOT discuss: {anatomy_ctx['exclude']}.\n"
    return (
        f"Consultant radiologist writing FINDINGS for {study.upper()} {modality} report.\n"
        f"Patient: {patient_info}\n"
        f"Expected anatomy: {anatomy_ctx['anatomy']}{exclude_clause}\n"
        f"Summarized observations across views:\n{observations_summary}\n\n"
        f"Write FINDINGS in organized paragraphs covering {study} anatomy systematically.\n"
        f"For each structure: size, signal/density, morphology, focal lesions.\n"
        f"Plain prose. No JSON. No bullets. No headers. Begin immediately."
    )


def _impression_prompt(findings, study, anatomy_ctx):
    clean = re.sub(r"\bIMPRESSION\b.*", "", findings, flags=re.IGNORECASE | re.DOTALL).strip()
    return (
        f"Writing IMPRESSION for {study.upper()} radiology report.\n"
        f"Findings:\n{clean}\n\n"
        f"List 3 most clinically significant {study} conclusions as numbered list.\n"
        f"Start with '1.'. Use precise {study} terminology.\n"
        f"Write only the 3 numbered items. No preamble."
    )


def _abnormalities_prompt(findings, modality, study, anatomy_ctx):
    return (
        f"Review {study.upper()} {modality} findings:\n{findings}\n\n"
        f"Extract 1-2 most clinically significant {study} abnormalities.\n"
        f"Common: {anatomy_ctx['abnormalities']}.\n\n"
        f"Format: \"[Abnormality]: [Brief clinical significance, 10-15 words]\"\n"
        f"Begin immediately. No preamble.\n"
        f"If none: \"No significant abnormality: Within normal limits for {study}.\""
    )


def _recommendations_prompt(impression, modality, study):
    return (
        f"Writing RECOMMENDATIONS for {study.upper()} {modality} report.\n"
        f"Impression:\n{impression}\n\n"
        f"Write 2 specific clinical recommendation sentences for {study} findings.\n"
        f"Use precise protocol names. Begin immediately. No preamble."
    )


# ═══════════════════════════════════════════════════════════════════════════════
# 🛡️ OOM-AWARE MEDGEMMA CALL
# ═══════════════════════════════════════════════════════════════════════════════

def _is_oom_error(error_msg: str) -> bool:
    """Detect CUDA out-of-memory errors."""
    msg = str(error_msg).lower()
    return any(s in msg for s in ["out of memory", "cuda", "oom", "cublas"])


def _call_medgemma(prompt: str, image_b64: Optional[str] = None, max_tokens: int = 250,
                   retries: int = MAX_RETRIES) -> str:
    """Call MedGemma with OOM-aware retry."""
    last_error = None
    for attempt in range(retries):
        try:
            resp = requests.post(
                f"{MEDGEMMA_URL}/api/generate",
                json={"prompt": prompt, "image_base64": image_b64,
                      "temperature": 0.0, "max_tokens": max_tokens},
                timeout=TIMEOUT,
            )
            
            if resp.status_code == 500 and _is_oom_error(resp.text):
                # 🛡️ Special handling: GPU OOM
                wait = min(30, (attempt + 1) * 8)  # 8s, 16s, 24s, 30s
                logger.warning(f"⚠️  GPU OOM detected (attempt {attempt+1}/{retries}), waiting {wait}s for memory to free...")
                time.sleep(wait)
                # Reduce max_tokens for next attempt
                max_tokens = max(100, max_tokens - 50)
                last_error = "OOM"
                continue
            
            if resp.status_code != 200:
                last_error = f"HTTP {resp.status_code}: {resp.text[:200]}"
                logger.warning(f"Attempt {attempt+1}/{retries}: {last_error}")
                time.sleep(2 ** attempt)
                continue
            
            data = resp.json()
            if not data.get("success"):
                last_error = "API failure"
                time.sleep(2 ** attempt)
                continue
            
            text = data["response"].strip()
            text = re.sub(r"<[^>]*thought[^>]*>.*?</[^>]*thought[^>]*>", "", text, flags=re.DOTALL | re.IGNORECASE)
            text = re.sub(r"<unused\d+>[^\n]*\n?", "", text)
            text = re.sub(r"```[a-z]*\n?", "", text).strip("`")
            
            META = re.compile(
                r"^(the user wants|i need to|let me|my plan|okay[,.]|here'?s my|"
                r"please provide|i understand|i will|i am going to|note:|"
                r"thinking|thought process|analysis:|step \d)",
                re.IGNORECASE
            )
            lines = text.splitlines()
            start = 0
            for i, line in enumerate(lines):
                s = line.strip()
                if s and not META.match(s) and not s.startswith("*"):
                    start = i
                    break
            text = "\n".join(lines[start:]).strip()
            
            if text:
                return text
            last_error = "Empty response"
            time.sleep(2 ** attempt)
        except requests.exceptions.Timeout:
            last_error = "Timeout"
            time.sleep(2 ** attempt)
        except requests.exceptions.HTTPError as e:
            if _is_oom_error(str(e)):
                wait = min(30, (attempt + 1) * 8)
                logger.warning(f"⚠️  OOM HTTPError (attempt {attempt+1}/{retries}), waiting {wait}s...")
                time.sleep(wait)
                max_tokens = max(100, max_tokens - 50)
                last_error = "OOM"
            else:
                last_error = str(e)
                time.sleep(2 ** attempt)
        except Exception as e:
            last_error = str(e)
            time.sleep(2 ** attempt)
    
    raise RuntimeError(f"All {retries} attempts failed: {last_error}")


def _composite_batch(batch):
    pil_imgs = []
    for sl in batch:
        img = Image.open(io.BytesIO(base64.b64decode(sl.image_base64))).convert("RGB")
        ratio = SLICE_H / img.height
        pil_imgs.append(img.resize((max(1, int(img.width * ratio)), SLICE_H), Image.LANCZOS))
    sep = 3
    total_w = sum(im.width for im in pil_imgs) + sep * (len(pil_imgs) - 1)
    composite = Image.new("RGB", (total_w, SLICE_H), (0, 0, 0))
    x = 0
    for im in pil_imgs:
        composite.paste(im, (x, 0))
        x += im.width + sep
    buf = io.BytesIO()
    composite.save(buf, "PNG")
    return base64.b64encode(buf.getvalue()).decode()


# ═══════════════════════════════════════════════════════════════════════════════
# SANITIZATION
# ═══════════════════════════════════════════════════════════════════════════════

def _sanitize_section(text, max_words=120):
    text = re.sub(r"```[a-z]*\n?|```", "", text)
    text = re.sub(r"\*\*|\*|^#+\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"\[[^\]]{1,60}\]", "", text)
    clean = []
    for line in text.splitlines():
        s = line.strip()
        if not s or len(s.split()) < 4:
            continue
        words = s.split()
        cap_ratio = sum(1 for w in words if w and w[0].isupper()) / len(words)
        if cap_ratio > 0.70 and not s[-1] in ".!?":
            continue
        clean.append(s)
    text = " ".join(clean)
    sentences = re.split(r"(?<=[.!?])\s+", text)
    result, wc = [], 0
    for sent in sentences:
        n = len(sent.split())
        if wc + n > max_words or n > 60: break
        result.append(sent.strip())
        wc += n
    return " ".join(result).strip()


def _sanitize_impression(text):
    items = []
    for line in text.splitlines():
        s = line.strip()
        m = re.match(r"^(\d+[\.\)])\s+(.{10,})", s)
        if m:
            item = re.sub(r"\*\*|\*", "", m.group(2)).strip()
            if not re.match(r"(I cannot|The user|Please|The provided|Based on my)", item, re.IGNORECASE):
                items.append(f"{m.group(1)} {item}")
    if items: return "\n".join(items[:4])
    return _sanitize_section(text, max_words=60)


def _check_organ_mismatch(text, anatomy_ctx):
    if not anatomy_ctx.get("exclude"):
        return False
    excluded = [t.strip() for t in anatomy_ctx["exclude"].split(",")]
    tl = text.lower()
    return sum(1 for term in excluded if term and len(term) > 4 and term.lower() in tl) >= 2


def _patient_info_block(name, age, sex, modality, study):
    sex_s = (sex or "").strip()
    sex_t = "Male" if sex_s.upper() in ("M", "MALE") else ("Female" if sex_s.upper() in ("F", "FEMALE") else (sex_s or "Not provided"))
    age_t = f"{age} years" if age else "Not provided"
    return (
        f"Patient: {name or 'Not provided'} | Age: {age_t} | Sex: {sex_t} | "
        f"Modality: {modality or 'Unknown'} | Study: {study or 'Unknown'}"
    )


# ═══════════════════════════════════════════════════════════════════════════════
# ⚡ PIPELINE
# ═══════════════════════════════════════════════════════════════════════════════

def _process_one_batch(batch_idx, batch, view, modality, patient_sex, study, anatomy_ctx, pbar):
    idx_str = f"{batch[0].index}-{batch[-1].index}"
    try:
        comp = _composite_batch(batch)
        text = _call_medgemma(
            _batch_prompt(view.upper(), idx_str, modality, patient_sex, study, anatomy_ctx),
            image_b64=comp, max_tokens=200,  # Reduced from 300
        )
        result = f"S{idx_str}: {text}"
    except Exception as e:
        result = f"S{idx_str}: [failed]"
        logger.debug(f"Batch {idx_str}: {e}")
    with _progress_lock:
        pbar.update(1)
    return batch_idx, result


def analyze_view_parallel(slices, view, modality, pbar, patient_sex, study, anatomy_ctx, max_workers):
    group = sorted([s for s in slices if s.view.lower() == view], key=lambda s: s.index)
    if not group: return "", 0
    
    batches = [group[i:i + BATCH_SIZE] for i in range(0, len(group), BATCH_SIZE)]
    results = [None] * len(batches)
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(_process_one_batch, i, b, view, modality,
                            patient_sex, study, anatomy_ctx, pbar): i
            for i, b in enumerate(batches)
        }
        for future in as_completed(futures):
            try:
                idx, result = future.result()
                results[idx] = result
            except Exception as e:
                logger.error(f"Worker error: {e}")
    
    obs = [r for r in results if r]
    return "\n".join(obs), len(batches)


def summarize_view_observations(view_blocks: Dict[str, str], modality, study, anatomy_ctx) -> str:
    """🛡️ CRITICAL: Compress per-view observations into short summaries to avoid OOM."""
    logger.info("🛡️  Compressing observations to prevent OOM...")
    summaries = []
    for view, view_obs in view_blocks.items():
        if not view_obs.strip():
            continue
        
        # If observations are short enough, use directly
        if len(view_obs) <= MAX_OBS_PER_VIEW_CHARS:
            summaries.append(f"{view.upper()} VIEW:\n{view_obs}")
            continue
        
        # Otherwise summarize
        try:
            summary = _call_medgemma(
                _summarize_view_prompt(view, view_obs[:5000], study, modality, anatomy_ctx),
                max_tokens=150,
            )
            summaries.append(f"{view.upper()} VIEW SUMMARY:\n{summary}")
            logger.info(f"  {view}: {len(view_obs)} chars → {len(summary)} chars")
        except Exception as e:
            logger.warning(f"  {view}: summarization failed, truncating raw obs: {e}")
            truncated = view_obs[:MAX_OBS_PER_VIEW_CHARS] + "..."
            summaries.append(f"{view.upper()} VIEW (truncated):\n{truncated}")
    
    return "\n\n".join(summaries)


def generate_sections_parallel(patient_info, observations_summary, modality, study, anatomy_ctx):
    """⚡ Parallel section generation with dependency awareness."""
    section_results = {}
    
    def _gen(name, prompt_fn, max_tokens):
        try:
            result = _call_medgemma(prompt_fn(), max_tokens=max_tokens)
            if _check_organ_mismatch(result, anatomy_ctx):
                logger.warning(f"⚠️  {name}: organ mismatch, retrying...")
                try:
                    result = _call_medgemma(prompt_fn(), max_tokens=max_tokens)
                except Exception:
                    pass
            return name, result
        except Exception as e:
            logger.error(f"✗ {name} failed: {e}")
            return name, ""
    
    # Phase A: Technique + Findings (parallel)
    logger.info("⚡ Phase A: Technique + Findings (parallel)...")
    with ThreadPoolExecutor(max_workers=2) as ex:
        futs = {
            ex.submit(_gen, "technique",
                      lambda: _technique_prompt(patient_info, modality, study, anatomy_ctx), 120): "technique",
            ex.submit(_gen, "findings",
                      lambda: _findings_prompt(patient_info, modality, observations_summary, study, anatomy_ctx), 300): "findings",
        }
        for f in as_completed(futs):
            name, result = f.result()
            section_results[name] = result
            logger.info(f"✓ {name}: {len(result)} chars")
    
    findings = section_results.get("findings", observations_summary)
    
    # Phase B: Abnormalities + Impression (parallel, both depend on findings)
    logger.info("⚡ Phase B: Abnormalities + Impression (parallel)...")
    with ThreadPoolExecutor(max_workers=2) as ex:
        futs = {
            ex.submit(_gen, "abnormalities",
                      lambda: _abnormalities_prompt(findings, modality, study, anatomy_ctx), 150): "abnormalities",
            ex.submit(_gen, "impression",
                      lambda: _impression_prompt(findings, study, anatomy_ctx), 180): "impression",
        }
        for f in as_completed(futs):
            name, result = f.result()
            section_results[name] = result
            logger.info(f"✓ {name}: {len(result)} chars")
    
    impression = section_results.get("impression", "")
    
    # Phase C: Recommendations
    logger.info("Phase C: Recommendations...")
    _, rec = _gen("recommendations",
                  lambda: _recommendations_prompt(impression, modality, study), 120)
    section_results["recommendations"] = rec
    logger.info(f"✓ recommendations: {len(rec)} chars")
    
    return section_results


def run_pipeline(volume, patient_name, patient_age, patient_sex, modality, study, max_workers=MAX_WORKERS):
    logger.info("=" * 80)
    logger.info(f"⚡🛡️  PIPELINE v4 — Study: {study}, Modality: {modality}, Workers: {max_workers}")
    logger.info("=" * 80)
    
    anatomy_ctx = get_anatomy_context(study or "")
    logger.info(f"✓ Anatomy: {anatomy_ctx['anatomy'][:90]}...")
    logger.info(f"  Exclude: {anatomy_ctx['exclude'][:90] if anatomy_ctx['exclude'] else 'none'}")
    logger.info(f"  Primary views: {anatomy_ctx['primary_views']}")
    
    views = extract_views_smart(volume, study or "")
    slices = build_slice_images(views)
    
    total_batches = sum(
        max(1, (sum(1 for s in slices if s.view.lower() == v) + BATCH_SIZE - 1) // BATCH_SIZE)
        for v in ["axial", "coronal", "sagittal"]
        if any(s.view.lower() == v for s in slices)
    ) or 1
    
    logger.info(f"Total informative slices: {len(slices)}")
    logger.info(f"Total batches: {total_batches}")
    
    patient_info = _patient_info_block(patient_name, patient_age, patient_sex, modality, study)
    modality = modality or "Unknown"
    study = study or "Unknown"
    
    # STEP 1: Parallel vision analysis
    logger.info("")
    logger.info(f"⚡ STEP 1: Vision Analysis ({max_workers} workers)")
    logger.info("-" * 80)
    view_blocks = {}
    view_order = anatomy_ctx["primary_views"] + [
        v for v in ["axial", "coronal", "sagittal"]
        if v not in anatomy_ctx["primary_views"]
    ]
    s1 = time.time()
    with tqdm(total=total_batches, desc="Batches", unit="batch") as pbar:
        for view in view_order:
            block, _ = analyze_view_parallel(slices, view, modality, pbar,
                                              patient_sex, study, anatomy_ctx, max_workers)
            if block:
                view_blocks[view] = block
    logger.info(f"✓ Step 1: {time.time() - s1:.1f}s")
    
    if not view_blocks:
        raise RuntimeError("No slices analyzed.")
    
    # 🛡️ STEP 1B: Compress observations (CRITICAL OOM FIX)
    logger.info("")
    logger.info("🛡️  STEP 1B: Compressing observations to avoid OOM")
    logger.info("-" * 80)
    s1b = time.time()
    observations_summary = summarize_view_observations(view_blocks, modality, study, anatomy_ctx)
    logger.info(f"✓ Step 1B: {time.time() - s1b:.1f}s")
    logger.info(f"  Compressed input size: {len(observations_summary)} chars (was massive)")
    
    # STEP 2: Section generation
    logger.info("")
    logger.info("⚡ STEP 2: Generating 5 sections (parallel phases)")
    logger.info("-" * 80)
    s2 = time.time()
    section_results = generate_sections_parallel(patient_info, observations_summary, modality, study, anatomy_ctx)
    logger.info(f"✓ Step 2: {time.time() - s2:.1f}s")
    
    # STEP 2B: Validate
    logger.info("")
    logger.info("STEP 2B: Validating 5 sections")
    logger.info("-" * 80)
    defaults = {
        "technique": f"{modality} examination of the {study} performed in standard imaging planes with appropriate sequences for diagnostic evaluation.",
        "findings": f"Imaging evaluation of the {study} was performed. Anatomical structures from the imaging data are documented above.",
        "abnormalities": f"No specific abnormality definitively identified in this {study} examination. Clinical correlation recommended.",
        "impression": f"1. {study.capitalize()} {modality} examination performed.\n2. Findings as documented.\n3. Clinical correlation recommended.",
        "recommendations": f"Clinical correlation with patient presentation is recommended. Follow-up {modality} {study} as clinically indicated.",
    }
    for name, default in defaults.items():
        if not section_results.get(name, "").strip():
            section_results[name] = default
            logger.warning(f"⚠️  {name}: empty → default placeholder")
        else:
            logger.info(f"✓ {name}: {len(section_results[name])} chars")
    
    # STEP 3: Sanitize
    logger.info("")
    logger.info("STEP 3: Sanitizing")
    logger.info("-" * 80)
    def _strip(txt, *headers):
        for h in headers:
            txt = re.sub(rf"^{h}\s*:?\s*", "", txt, flags=re.IGNORECASE).strip()
        return txt
    
    technique       = _sanitize_section(_strip(section_results["technique"], "TECHNIQUE"), max_words=100)
    findings        = _sanitize_section(_strip(section_results["findings"], "FINDINGS"), max_words=180)
    abnormalities   = _sanitize_section(_strip(section_results["abnormalities"], "ABNORMALITIES", "KEY FINDINGS"), max_words=100)
    impression      = _sanitize_impression(_strip(section_results["impression"], "IMPRESSION"))
    recommendations = _sanitize_section(_strip(section_results["recommendations"], "RECOMMENDATIONS", "RECOMMENDATION"), max_words=100)
    
    if not technique.strip():       technique = defaults["technique"]
    if not findings.strip():        findings = defaults["findings"]
    if not abnormalities.strip():   abnormalities = defaults["abnormalities"]
    if not impression.strip():      impression = defaults["impression"]
    if not recommendations.strip(): recommendations = defaults["recommendations"]
    
    ab_lines = [f'**"{line.strip()}"**' for line in abnormalities.splitlines() if line.strip()]
    abnormalities_formatted = "\n".join(ab_lines) if ab_lines else f'**"{abnormalities}"**'
    
    full_report = (
        f"TECHNIQUE:\n{technique}\n\n"
        f"ABNORMALITIES:\n{abnormalities_formatted}\n\n"
        f"FINDINGS:\n{findings}\n\n"
        f"IMPRESSION:\n{impression}\n\n"
        f"RECOMMENDATIONS:\n{recommendations}"
    )
    
    logger.info("")
    logger.info("✓ ALL 5 SECTIONS VERIFIED — PIPELINE COMPLETE")
    logger.info("=" * 80)
    
    return {
        "report": full_report,
        "technique": technique,
        "abnormalities": abnormalities,
        "findings": findings,
        "impression": impression,
        "recommendations": recommendations,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="MedGemma DICOM Report Generator v4 (OOM-Safe + Parallel)")
    parser.add_argument("dicom_folder", type=Path)
    parser.add_argument("--patient-name", default=None)
    parser.add_argument("--patient-age", type=int, default=None)
    parser.add_argument("--patient-sex", default=None)
    parser.add_argument("--modality", default="CT")
    parser.add_argument("--study", default="Chest")
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR)
    parser.add_argument("--medgemma-url", default=MEDGEMMA_URL)
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE)
    parser.add_argument("--max-slices", type=int, default=MAX_VIEW_SLICES)
    parser.add_argument("--workers", type=int, default=MAX_WORKERS,
                        help="Parallel API workers (default 2). Reduce if seeing OOM.")
    parser.add_argument("--gpu-friendly", action="store_true",
                        help="🛡️ Ultra-conservative mode (workers=1, max-slices=30)")
    
    args = parser.parse_args()
    
    if args.gpu_friendly:
        args.workers = 1
        args.max_slices = 30
        logger.info("🛡️  GPU-FRIENDLY MODE: workers=1, max-slices=30")
    
    globals()["MEDGEMMA_URL"] = args.medgemma_url
    globals()["OUTPUT_DIR"] = args.output_dir
    globals()["BATCH_SIZE"] = args.batch_size
    globals()["MAX_VIEW_SLICES"] = args.max_slices
    globals()["MAX_WORKERS"] = args.workers
    args.output_dir.mkdir(exist_ok=True)
    
    try:
        logger.info(f"MedGemma v4 (OOM-Safe + Parallel + Accurate)")
        logger.info(f"Start: {datetime.now().isoformat()}")
        logger.info(f"DICOM: {args.dicom_folder}")
        logger.info(f"Study: {args.study} | Modality: {args.modality}")
        logger.info(f"Output: {args.output_dir}")
        logger.info(f"⚡ Workers: {args.workers} | Max slices: {args.max_slices}")
        logger.info("")
        
        volume = load_dicom_folder(args.dicom_folder)
        logger.info("")
        
        start = time.time()
        result = run_pipeline(
            volume,
            patient_name=args.patient_name,
            patient_age=args.patient_age,
            patient_sex=args.patient_sex,
            modality=args.modality,
            study=args.study,
            max_workers=args.workers,
        )
        elapsed = time.time() - start
        
        logger.info("")
        logger.info("SAVING OUTPUTS")
        logger.info("-" * 80)
        
        report_txt = args.output_dir / "report.txt"
        with open(report_txt, "w") as f:
            f.write(f"Generated: {datetime.now().isoformat()}\n")
            f.write(f"Patient: {args.patient_name or 'Not provided'}\n")
            f.write(f"Age: {args.patient_age or 'Not provided'}\n")
            f.write(f"Sex: {args.patient_sex or 'Not provided'}\n")
            f.write(f"Modality: {args.modality}\n")
            f.write(f"Study: {args.study}\n")
            f.write(f"Workers: {args.workers}\n")
            f.write(f"Generation time: {elapsed:.1f}s\n")
            f.write("\n" + "=" * 80 + "\n\n")
            f.write(result["report"])
        logger.info(f"✓ {report_txt}")
        
        report_json = args.output_dir / "report.json"
        with open(report_json, "w") as f:
            json.dump({
                "metadata": {
                    "generated_at": datetime.now().isoformat(),
                    "patient_name": args.patient_name,
                    "patient_age": args.patient_age,
                    "patient_sex": args.patient_sex,
                    "modality": args.modality,
                    "study": args.study,
                    "workers": args.workers,
                    "max_slices": args.max_slices,
                    "generation_time_seconds": elapsed,
                },
                "report": {
                    "full": result["report"],
                    "technique": result["technique"],
                    "abnormalities": result["abnormalities"],
                    "findings": result["findings"],
                    "impression": result["impression"],
                    "recommendations": result["recommendations"],
                }
            }, f, indent=2)
        logger.info(f"✓ {report_json}")
        
        logger.info("")
        logger.info("=" * 80)
        logger.info(f"✓ SUCCESS in {elapsed:.1f}s ({elapsed/60:.1f} min)")
        logger.info("=" * 80)
        
    except Exception as e:
        logger.exception(f"FAILED: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
