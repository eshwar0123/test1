"""
AI Vision Report — MedGemma 1.5 4B full-dataset pipeline (ASYNC JOB VERSION)
----------------------------------------------------------------------------
- Legacy endpoint (sync, long-blocking): POST /ai/medgemma-vision-report  [kept for compat]
- New async endpoints (recommended):
    POST   /ai/medgemma-vision-report/start         -> returns { job_id } in <1s
    GET    /ai/medgemma-vision-report/status/{job_id} -> returns progress + result
    POST   /ai/medgemma-vision-report/cancel/{job_id} -> cancels a running job

Background workers run the pipeline off the request thread, so no proxy/CDN/nginx
timeout can kill it. Frontend polls every few seconds and displays live progress.
"""

import os, base64, io, re, logging, uuid, threading, time
import requests as _requests
from PIL import Image
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env"), override=True)

logger       = logging.getLogger(__name__)
router       = APIRouter(prefix="/ai", tags=["AI - MedGemma Vision"])
MEDGEMMA_URL = os.getenv("MEDGEMMA_URL", "http://100.88.115.54:11437")
BATCH_SIZE   = 5
SLICE_H      = 224

# Job retention (how long to keep finished jobs in memory before auto-purge)
JOB_TTL_SECONDS = 3600  # 1 hour

logger.info(f"[medgemma_router] server: {MEDGEMMA_URL}")


# ─── In-memory job store ──────────────────────────────────────────────────────

class JobStore:
    """Thread-safe dict of jobs with auto-cleanup of old entries."""
    def __init__(self):
        self._jobs: Dict[str, Dict[str, Any]] = {}
        self._lock = threading.Lock()

    def create(self, job_id: str, total_batches: int) -> None:
        with self._lock:
            self._jobs[job_id] = {
                "status": "queued",           # queued | running | done | failed | cancelled
                "progress": 0,                # 0–100
                "stage": "Queued",
                "result": None,               # final payload when done
                "error": None,
                "cancel_requested": False,
                "created_at": time.time(),
                "finished_at": None,
                "total_batches": total_batches,
                "batches_done": 0,
            }
        self._gc()

    def update(self, job_id: str, **fields) -> None:
        with self._lock:
            if job_id in self._jobs:
                self._jobs[job_id].update(fields)

    def get(self, job_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            return self._jobs.get(job_id)

    def request_cancel(self, job_id: str) -> bool:
        with self._lock:
            if job_id in self._jobs and self._jobs[job_id]["status"] in ("queued", "running"):
                self._jobs[job_id]["cancel_requested"] = True
                return True
            return False

    def is_cancelled(self, job_id: str) -> bool:
        with self._lock:
            return bool(self._jobs.get(job_id, {}).get("cancel_requested"))

    def _gc(self) -> None:
        """Remove finished jobs older than JOB_TTL_SECONDS."""
        now = time.time()
        with self._lock:
            stale = [
                jid for jid, j in self._jobs.items()
                if j.get("finished_at") and (now - j["finished_at"]) > JOB_TTL_SECONDS
            ]
            for jid in stale:
                del self._jobs[jid]

JOBS = JobStore()


# ─── Models ───────────────────────────────────────────────────────────────────

class SliceImage(BaseModel):
    view: str
    index: int
    image_base64: str

class MedGemmaVisionRequest(BaseModel):
    slices: List[SliceImage]
    patient_name: Optional[str] = None
    modality: Optional[str]     = None
    study: Optional[str]        = None
    case_id: Optional[str]      = None


# ─── Prompts (unchanged) ──────────────────────────────────────────────────────

def _batch_prompt(view, indices, modality):
    ct_terms  = "attenuation values (HU), density (hypo/iso/hyperdense)"
    mri_terms = "signal intensity (hypo/iso/hyperintense on T1/T2)"
    density   = ct_terms if "CT" in modality.upper() else mri_terms
    return (
        f"You are a radiologist performing systematic image analysis.\n"
        f"Imaging plane: {view}. Slice positions: {indices}. Modality: {modality}.\n\n"
        f"Describe in 3 precise radiological sentences:\n"
        f"1. Name each visible anatomical structure with its exact location (use anatomical "
        f"   directional terms: anterior/posterior, medial/lateral, superior/inferior).\n"
        f"2. Characterise each structure using {density}, contour regularity, "
        f"   border sharpness, and estimated dimensions in mm where discernible.\n"
        f"3. State any focal abnormality (mass, nodule, opacity, effusion, consolidation, "
        f"   lymphadenopathy, vascular anomaly) with size and location, "
        f"   OR state 'No acute abnormality identified in this plane.'\n\n"
        f"Use proper radiological terminology. Plain prose only. No JSON. No bounding boxes."
    )

def _technique_prompt(patient_info, modality, body_region):
    return (
        f"Write a precise 2-3 sentence TECHNIQUE paragraph for a formal radiology report.\n"
        f"Patient: {patient_info}\n"
        f"Modality: {modality}. Study: {body_region}.\n\n"
        f"Include all of the following that apply:\n"
        f"- Full modality name (e.g. multidetector CT, 1.5T MRI)\n"
        f"- Anatomical coverage (e.g. 'from lung apices to iliac crests')\n"
        f"- Slice thickness and reconstruction parameters if determinable\n"
        f"- Contrast administration (IV contrast with phase, or non-contrast)\n"
        f"- Patient positioning (supine, prone)\n"
        f"- Any relevant technical considerations (gating, breath-hold)\n\n"
        f"Use formal radiological language. Plain prose only. No JSON. No section headers."
    )

def _findings_prompt(patient_info, modality, observations):
    return (
        f"You are a consultant radiologist writing the FINDINGS section of a formal report.\n"
        f"Patient: {patient_info}. Modality: {modality}.\n\n"
        f"Systematic per-slice imaging observations:\n{observations}\n\n"
        f"Write the FINDINGS in organised paragraphs by organ system "
        f"(e.g. Lungs, Mediastinum, Heart, Liver, Kidneys, Bones, Soft Tissues).\n"
        f"For each structure describe:\n"
        f"- Size / dimensions in mm or cm\n"
        f"- Attenuation / signal characteristics\n"
        f"- Morphology: contour, margins, internal architecture\n"
        f"- Comparison of findings across axial / coronal / sagittal planes\n"
        f"- Any focal lesion: location, size, density/signal, enhancement pattern\n\n"
        f"Report ONLY what is supported by the observations above. "
        f"Use proper radiological and anatomical terminology (e.g. consolidation, "
        f"ground-glass opacity, hepatomegaly, lymphadenopathy, pleural effusion, "
        f"parenchymal attenuation, cortical thinning). "
        f"Plain prose paragraphs only. No JSON. No bullet points. No section headers."
    )

def _impression_prompt(findings):
    clean = re.sub(r"\bIMPRESSION\b.*", "", findings, flags=re.IGNORECASE | re.DOTALL).strip()
    return (
        f"Radiology findings summary:\n{clean}\n\n"
        f"List the 3 most clinically significant conclusions as a numbered list.\n"
        f"Use precise medical terminology. Start immediately with '1.'.\n"
        f"Example format:\n"
        f"1. Bilateral basal consolidation consistent with community-acquired pneumonia.\n"
        f"2. Small right-sided pleural effusion.\n"
        f"3. No acute bony injury identified.\n"
        f"Write your numbered list now:"
    )

def _recommendations_prompt(impression, modality):
    return (
        f"Radiology impression:\n{impression}\n\n"
        f"Write 2 specific clinical recommendation sentences for {modality} findings.\n"
        f"Use precise protocol names (e.g. 'contrast-enhanced CT', 'PET-CT', 'MRI with gadolinium').\n"
        f"Start immediately with the first sentence. No preamble. No explanation.\n"
        f"Write recommendations now:"
    )


# ─── Core helpers (unchanged) ─────────────────────────────────────────────────

def _call_medgemma(prompt: str, image_b64: Optional[str] = None, max_tokens: int = 300) -> str:
    resp = _requests.post(
        f"{MEDGEMMA_URL}/api/generate",
        json={"prompt": prompt, "image_base64": image_b64, "temperature": 0.0, "max_tokens": max_tokens},
        timeout=300,
    )
    resp.raise_for_status()
    data = resp.json()
    if not data.get("success"):
        raise RuntimeError(f"MedGemma failure: {data}")
    text = data["response"].strip()

    text = re.sub(r"<[^>]*thought[^>]*>.*?</[^>]*thought[^>]*>", "", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<unused\d+>[^\n]*\n?", "", text)
    text = re.sub(r"```[a-z]*\n?", "", text).strip("`")

    META_PATTERNS = re.compile(
        r"^(the user wants|i need to|let me|my plan|okay[,.]|here'?s my|"
        r"please provide|i understand|i will|i am going to|note:|"
        r"thinking|thought process|analysis:|step \d)",
        re.IGNORECASE
    )
    lines = text.splitlines()
    start = 0
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped and not META_PATTERNS.match(stripped) and not stripped.startswith("*"):
            start = i
            break
    text = "\n".join(lines[start:]).strip()
    return text


def _composite_batch(batch: List[SliceImage]) -> str:
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
        composite.paste(im, (x, 0)); x += im.width + sep

    buf = io.BytesIO(); composite.save(buf, "PNG")
    return base64.b64encode(buf.getvalue()).decode()


def _sanitize_section(text: str, max_words: int = 120) -> str:
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
    result, word_count = [], 0
    for sent in sentences:
        wc = len(sent.split())
        if word_count + wc > max_words:
            break
        if wc > 60:
            break
        result.append(sent.strip())
        word_count += wc

    return " ".join(result).strip()


def _sanitize_impression(text: str) -> str:
    items = []
    for line in text.splitlines():
        s = line.strip()
        m = re.match(r"^(\d+[\.\)])\s+(.{10,})", s)
        if m:
            item = re.sub(r"\*\*|\*", "", m.group(2)).strip()
            if not re.match(r"(I cannot|The user|Please|The provided|Based on my)", item, re.IGNORECASE):
                items.append(f"{m.group(1)} {item}")
    if items:
        return "\n".join(items[:4])
    return _sanitize_section(text, max_words=60)


def _patient_info_block(data: MedGemmaVisionRequest) -> str:
    return (
        f"Patient Name : {data.patient_name or 'Not provided'}\n"
        f"Modality     : {data.modality or 'Unknown'}\n"
        f"Study        : {data.study or 'Unknown'}"
    )


# ─── Pipeline with progress updates and cancellation ──────────────────────────

class JobCancelled(Exception):
    pass

def _check_cancel(job_id: str) -> None:
    if JOBS.is_cancelled(job_id):
        raise JobCancelled()


def _analyse_view_with_progress(
    slices: List[SliceImage],
    view: str,
    modality: str,
    job_id: str,
    total_batches: int,
    batches_done_start: int,
) -> (str, int):
    """Analyse one view (axial/coronal/sagittal), updating job progress after each batch."""
    group = sorted([s for s in slices if s.view.lower() == view], key=lambda s: s.index)
    if not group:
        return "", batches_done_start

    obs = []
    batches_done = batches_done_start
    for i in range(0, len(group), BATCH_SIZE):
        _check_cancel(job_id)
        batch   = group[i:i + BATCH_SIZE]
        indices = f"{batch[0].index}-{batch[-1].index}"
        comp    = _composite_batch(batch)

        JOBS.update(job_id,
            stage=f"Analysing {view} slices {indices}...",
        )

        text = _call_medgemma(
            _batch_prompt(view.upper(), indices, modality),
            image_b64=comp,
            max_tokens=300,
        )
        obs.append(f"Slices {indices}: {text}")

        batches_done += 1
        # Vision batches account for 70% of total progress; sections for remaining 30%
        pct = min(70, int((batches_done / max(1, total_batches)) * 70))
        JOBS.update(job_id, progress=pct, batches_done=batches_done)
        logger.info(f"[job {job_id}] [{view}] batch {indices} done — {pct}%")

    return f"{view.upper()} ({len(group)} slices):\n" + "\n".join(obs), batches_done


def _run_pipeline_with_progress(job_id: str, data: MedGemmaVisionRequest) -> Dict[str, Any]:
    patient_info = _patient_info_block(data)
    modality     = data.modality or "Unknown"

    total_batches = sum(
        max(1, (sum(1 for s in data.slices if s.view.lower() == v) + BATCH_SIZE - 1) // BATCH_SIZE)
        for v in ["axial", "coronal", "sagittal"]
        if any(s.view.lower() == v for s in data.slices)
    ) or 1

    JOBS.update(job_id, status="running", stage="Starting vision analysis...", total_batches=total_batches)

    # Step 1 — vision analysis per view
    view_blocks = []
    batches_done = 0
    for view in ["axial", "coronal", "sagittal"]:
        block, batches_done = _analyse_view_with_progress(
            data.slices, view, modality, job_id, total_batches, batches_done
        )
        if block:
            view_blocks.append(block)

    if not view_blocks:
        raise RuntimeError("No slices analysed.")
    all_obs = "\n\n".join(view_blocks)

    # Step 2 — generate each section
    body_region = data.study or "body"

    _check_cancel(job_id)
    JOBS.update(job_id, stage="Writing Technique section...", progress=75)
    technique = _call_medgemma(_technique_prompt(patient_info, modality, body_region), max_tokens=100)

    _check_cancel(job_id)
    JOBS.update(job_id, stage="Writing Findings section...", progress=82)
    findings = _call_medgemma(_findings_prompt(patient_info, modality, all_obs), max_tokens=300)

    _check_cancel(job_id)
    JOBS.update(job_id, stage="Writing Impression section...", progress=90)
    impression = _call_medgemma(_impression_prompt(all_obs), max_tokens=150)

    _check_cancel(job_id)
    JOBS.update(job_id, stage="Writing Recommendations section...", progress=96)
    recommendations = _call_medgemma(_recommendations_prompt(impression, modality), max_tokens=100)

    # Step 3 — sanitize
    def _strip_header(txt, *headers):
        for h in headers:
            txt = re.sub(rf"^{h}\s*:?\s*", "", txt, flags=re.IGNORECASE).strip()
        return txt

    technique       = _sanitize_section(_strip_header(technique,       "TECHNIQUE"),                          max_words=80)
    findings        = _sanitize_section(_strip_header(findings,        "FINDINGS"),                           max_words=150)
    impression      = _sanitize_impression(_strip_header(impression,   "IMPRESSION"))
    recommendations = _sanitize_section(_strip_header(recommendations, "RECOMMENDATIONS", "RECOMMENDATION"),  max_words=80)

    full_report = (
        f"TECHNIQUE:\n{technique}\n\n"
        f"FINDINGS:\n{findings}\n\n"
        f"IMPRESSION:\n{impression}\n\n"
        f"RECOMMENDATIONS:\n{recommendations}"
    )

    return {
        "report":          full_report,
        "technique":       technique,
        "findings":        findings,
        "impression":      impression,
        "recommendations": recommendations,
    }


# ─── Background worker ────────────────────────────────────────────────────────

def _run_job(job_id: str, data: MedGemmaVisionRequest, view_counts: Dict[str, int]) -> None:
    try:
        result = _run_pipeline_with_progress(job_id, data)
        payload = {
            "success":         True,
            "report":          result["report"],
            "technique":       result["technique"],
            "findings":        result["findings"],
            "impression":      result["impression"],
            "recommendations": result["recommendations"],
            "slices_analyzed": len(data.slices),
            "views":           view_counts,
            "model":           "medgemma-1.5-4b-multimodal",
            "pipeline":        "batch-vision → section-generation (async)",
        }
        JOBS.update(job_id,
            status="done",
            progress=100,
            stage="Complete",
            result=payload,
            finished_at=time.time(),
        )
        logger.info(f"[job {job_id}] done")
    except JobCancelled:
        JOBS.update(job_id,
            status="cancelled",
            stage="Cancelled",
            finished_at=time.time(),
        )
        logger.info(f"[job {job_id}] cancelled")
    except Exception as e:
        logger.exception(f"[job {job_id}] failed: {e}")
        JOBS.update(job_id,
            status="failed",
            stage="Failed",
            error=str(e),
            finished_at=time.time(),
        )


# ─── New async endpoints ──────────────────────────────────────────────────────

@router.post("/medgemma-vision-report/start")
async def start_medgemma_vision_report(data: MedGemmaVisionRequest, bg: BackgroundTasks):
    """Enqueue a report job. Returns immediately with a job_id."""
    if not data.slices:
        raise HTTPException(status_code=400, detail="No slices provided.")

    view_counts: Dict[str, int] = {}
    for s in data.slices:
        view_counts[s.view] = view_counts.get(s.view, 0) + 1

    total_batches = sum(
        max(1, (c + BATCH_SIZE - 1) // BATCH_SIZE)
        for v, c in view_counts.items()
        if v.lower() in ("axial", "coronal", "sagittal")
    ) or 1

    job_id = uuid.uuid4().hex
    JOBS.create(job_id, total_batches=total_batches)
    logger.info(f"[job {job_id}] queued — {len(data.slices)} slices, {view_counts}")

    # Run in its own daemon thread so it's independent of the HTTP request lifecycle.
    # (FastAPI BackgroundTasks run after response but still on the server loop; a
    # dedicated thread is more robust for long CPU+IO mixed pipelines.)
    t = threading.Thread(target=_run_job, args=(job_id, data, view_counts), daemon=True)
    t.start()

    return {
        "success": True,
        "job_id":  job_id,
        "status":  "queued",
        "total_batches":   total_batches,
        "slices_received": len(data.slices),
        "views":   view_counts,
    }


@router.get("/medgemma-vision-report/status/{job_id}")
async def medgemma_vision_report_status(job_id: str):
    """Poll job progress and result."""
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found or expired.")

    response = {
        "success":       True,
        "job_id":        job_id,
        "status":        job["status"],       # queued | running | done | failed | cancelled
        "progress":      job["progress"],
        "stage":         job["stage"],
        "batches_done":  job["batches_done"],
        "total_batches": job["total_batches"],
    }
    if job["status"] == "done":
        response.update(job["result"] or {})
    if job["status"] == "failed":
        response["error"] = job["error"]
    return response


@router.post("/medgemma-vision-report/cancel/{job_id}")
async def medgemma_vision_report_cancel(job_id: str):
    """Request cancellation. The job stops at the next checkpoint."""
    ok = JOBS.request_cancel(job_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Job not found or already finished.")
    return {"success": True, "job_id": job_id, "message": "Cancellation requested."}


# ─── Legacy sync endpoint (kept for backwards compat; NOT recommended) ────────

@router.post("/medgemma-vision-report")
async def generate_medgemma_vision_report(data: MedGemmaVisionRequest):
    """
    DEPRECATED: blocks until the entire pipeline finishes.
    Prefer /start + /status polling instead. Kept so existing clients don't break.
    """
    if not data.slices:
        raise HTTPException(status_code=400, detail="No slices provided.")

    view_counts: Dict[str, int] = {}
    for s in data.slices:
        view_counts[s.view] = view_counts.get(s.view, 0) + 1
    logger.info(f"[legacy sync] start: {len(data.slices)} slices — {view_counts}")

    # Run the async pipeline in a temp job so logs/progress are still tracked.
    job_id = uuid.uuid4().hex
    total_batches = sum(
        max(1, (c + BATCH_SIZE - 1) // BATCH_SIZE)
        for v, c in view_counts.items()
        if v.lower() in ("axial", "coronal", "sagittal")
    ) or 1
    JOBS.create(job_id, total_batches=total_batches)

    try:
        result = _run_pipeline_with_progress(job_id, data)
        JOBS.update(job_id, status="done", progress=100, stage="Complete",
                    result=result, finished_at=time.time())
        return {
            "success":         True,
            "report":          result["report"],
            "technique":       result["technique"],
            "findings":        result["findings"],
            "impression":      result["impression"],
            "recommendations": result["recommendations"],
            "slices_analyzed": len(data.slices),
            "views":           view_counts,
            "model":           "medgemma-1.5-4b-multimodal",
            "pipeline":        "batch-vision → section-generation",
        }
    except Exception as e:
        logger.error(f"[legacy sync] failed: {e}")
        raise HTTPException(status_code=503, detail=f"MedGemma pipeline failed: {e}")
