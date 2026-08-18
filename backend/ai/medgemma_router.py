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
import anthropic as _anthropic
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
    patient_age: Optional[int]  = None
    patient_sex: Optional[str]  = None
    modality: Optional[str]     = None
    study: Optional[str]        = None
    case_id: Optional[str]      = None


# ─── Prompts (unchanged) ──────────────────────────────────────────────────────

def _batch_prompt(view, indices, modality, patient_sex=None, study=None):
    ct_terms  = "attenuation values (HU), density (hypo/iso/hyperdense)"
    mri_terms = "signal intensity (hypo/iso/hyperintense on T1/T2)"
    density   = ct_terms if "CT" in modality.upper() else mri_terms
    return (
        f"You are a radiologist performing systematic image analysis.\n"
        f"Imaging plane: {view}. Slice positions: {indices}. Modality: {modality}. Study: {study or 'Unknown'}. Patient sex: {patient_sex or 'Not provided'}.\n\n"
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
        f"Write the TECHNIQUE description for a radiology report.\n"
        f"Patient: {patient_info}\n"
        f"Modality: {modality}. Study: {body_region}.\n\n"
        f"Write 1-2 short paragraphs in the style of a real radiology report. Mention:\n"
        f"- Pulse sequences and weighting (e.g. 'Spin Echo STIR, T1W and T2W coronal "
        f"and axial images of the {body_region} were obtained')\n"
        f"- Additional reconstructions (e.g. 'correlated with T2W sagittal images')\n"
        f"- Any contrast administration (or 'non-contrast study')\n"
        f"- Patient positioning (supine, prone) and coverage area\n\n"
        f"Example: 'Spin Echo STIR, T1W and T2W coronal and axial images of "
        f"bilateral hip joints and pelvis regions were obtained and correlated with "
        f"T2W sagittal images. Non-contrast study performed in supine position.'\n\n"
        f"CRITICAL: Do NOT begin with 'TECHNIQUE:', 'STUDY PROTOCOL', 'STUDY PROTOCOLS', "
        f"'STUDY PROTOCOL AND TECHNIQUE:', or any heading. Begin directly with the first sentence.\n"
        f"Plain prose only. No JSON. No section headers."
    )

def _sex_constraint(patient_sex):
    sex = (patient_sex or "").strip().upper()
    if sex in ("F", "FEMALE"):
        return (
            "PATIENT IS FEMALE. Female reproductive/pelvic anatomy includes: "
            "uterus, ovaries, fallopian tubes, cervix, vagina, endometrium, myometrium. "
            "NEVER mention prostate, seminal vesicles, testes, scrotum, penis, "
            "or any male reproductive organ. Any such mention is a fatal hallucination."
        )
    if sex in ("M", "MALE"):
        return (
            "PATIENT IS MALE. Male reproductive/pelvic anatomy includes: "
            "prostate, seminal vesicles, testes, scrotum. "
            "NEVER mention uterus, ovaries, fallopian tubes, cervix, vagina, endometrium, "
            "or any female reproductive organ. Any such mention is a fatal hallucination."
        )
    return ""


def _findings_prompt(patient_info, modality, observations, patient_sex=None):
    sex_rule = _sex_constraint(patient_sex)
    sex_block = f"\n*** ANATOMICAL CONSTRAINT ***\n{sex_rule}\n\n" if sex_rule else "\n"
    return (
        f"You are a consultant radiologist writing the FINDINGS section of a formal report.\n"
        f"Patient: {patient_info}. Modality: {modality}.\n"
        f"{sex_block}"
        f"Systematic per-slice imaging observations:\n{observations}\n\n"
        f"REQUIRED OUTPUT FORMAT — organ-by-organ, each on its own block:\n"
        f"For EACH organ/structure, write the organ name as a bold header on its own line, "
        f"followed by 1-3 plain-prose sentences on the next line(s).\n\n"
        f"EXACT FORMAT — copy this structure:\n"
        f"**Liver:**\n"
        f"Normal in size and outline. Homogeneous signal intensity. No focal lesions.\n"
        f"\n"
        f"**Kidneys:**\n"
        f"Both kidneys are normal in size and corticomedullary differentiation is preserved.\n"
        f"\n"
        f"**Uterus:**\n"
        f"**Bulky uterus** with heterogeneous myometrial signal suggestive of adenomyosis.\n"
        f"\n"
        f"FORMATTING RULES — absolute:\n"
        f"- One organ per block. Header on its own line, wrapped in **bold** with trailing colon.\n"
        f"- Description starts on the NEXT line, NEVER on the same line as the header.\n"
        f"- Separate organ blocks with ONE blank line. Do NOT write the literal text '<BLANKLINE>', '<BR>', "
        f"or any other placeholder — use an actual empty line.\n"
        f"- Within the description, wrap any ABNORMAL term in **bold** "
        f"(e.g. **bulky uterus**, **edema**, **mass lesion**, **hepatomegaly**).\n"
        f"- Do NOT bold normal/unremarkable structures or descriptions.\n"
        f"- Do NOT use 'Organ - Subname:' or 'Organ / Subname:' combined headers. Each organ stands alone.\n"
        f"- Do NOT write any preamble like 'BY ORGAN SYSTEM:', 'FINDINGS:', or 'Findings are as follows:'. "
        f"Start directly with the first **Organ:** header.\n\n"
        f"SCOPE — strict:\n"
        f"- Include ONLY organs/structures that actually appear in the per-slice observations above.\n"
        f"- Do NOT invent or describe organs that are NOT visible on the scan "
        f"(e.g. for a pelvis study, do NOT mention brain, lungs, chorionic villi, "
        f"circumventricular organs, pineal gland, thymus, etc.).\n"
        f"- Maximum 6-8 organ blocks. Pick the most clinically relevant ones for this study type.\n"
        f"- If an organ is normal, one short sentence is enough. Do not pad.\n\n"
        f"Report ONLY what is supported by the observations above. "
        f"Use proper radiological and anatomical terminology. "
        f"No JSON. No bullet points (dashes). Headers ONLY for organ names."
    )

def _impression_prompt(findings, patient_sex=None):
    clean = re.sub(r"\bIMPRESSION\b.*", "", findings, flags=re.IGNORECASE | re.DOTALL).strip()
    sex_rule = _sex_constraint(patient_sex)
    sex_block = f"\n*** ANATOMICAL CONSTRAINT ***\n{sex_rule}\n\n" if sex_rule else "\n"
    return (
        f"Radiology findings summary:\n{clean}\n"
        f"{sex_block}"
        f"List the 3 most clinically significant conclusions as a numbered list.\n"
        f"Use precise medical terminology. Start immediately with '1.'.\n"
        f"IMPORTANT FORMATTING: Wrap the ABNORMALITY NAME at the start of each item "
        f"in **bold** markdown (e.g. **Pleural Effusion**, **Cerebral Edema**, **Mass Lesion**). "
        f"The descriptive explanation after the colon stays plain.\n"
        f"Example format:\n"
        f"1. **Bilateral basal consolidation** consistent with community-acquired pneumonia.\n"
        f"2. **Small right-sided pleural effusion** in the costophrenic angle.\n"
        f"3. No acute bony injury identified.\n"
        f"Write your numbered list now:"
    )

def _strip_markdown_for_medgemma(txt: str, max_chars: int = 1500) -> str:
    """Strip **bold**, numbered headers, and trim long sections before feeding
    text into MedGemma. The 4B model gets confused by rich markdown structure;
    plain prose works better for downstream prompts."""
    if not txt:
        return ""
    t = txt
    t = re.sub(r"\*\*([^*]+)\*\*", r"\1", t)  # **bold** → bold
    t = re.sub(r"\*([^*]+)\*", r"\1", t)       # *italic* → italic
    t = re.sub(r"^\s*\d+\.\s*", "", t, flags=re.MULTILINE)  # drop "1. " prefixes
    t = re.sub(r"\n{3,}", "\n\n", t).strip()
    if len(t) > max_chars:
        t = t[:max_chars].rsplit(".", 1)[0] + "."
    return t


def _recommendations_prompt(technique, findings, impression, modality):
    """Build the recommendations prompt with full report context. Inputs are
    stripped of markdown so MedGemma sees plain prose (the 4B model gets confused
    by bold/numbering and starts echoing them back as fake content)."""
    tech_clean = _strip_markdown_for_medgemma(technique, max_chars=400)
    find_clean = _strip_markdown_for_medgemma(findings, max_chars=1500)
    imp_clean  = _strip_markdown_for_medgemma(impression, max_chars=800)
    return (
        f"You are a consultant radiologist writing the clinical RECOMMENDATIONS "
        f"section of a {modality} report.\n\n"
        f"Technique used:\n{tech_clean}\n\n"
        f"Findings observed:\n{find_clean}\n\n"
        f"Impression / diagnoses:\n{imp_clean}\n\n"
        f"Write 2-3 specific clinical recommendation sentences based ONLY on the "
        f"impression above. Each sentence should specify a concrete next step — "
        f"a follow-up scan, lab test, specialist referral, or clinical correlation.\n"
        f"Use precise protocol names where relevant (e.g. 'contrast-enhanced MRI', "
        f"'PET-CT', 'transvaginal ultrasound', 'DSA cerebral angiography').\n\n"
        f"STRICT RULES:\n"
        f"- Do NOT invent any new findings or measurements (e.g. no 'lesion measuring "
        f"approximately ... cm' — those are hallucinations).\n"
        f"- Do NOT include any heading like 'IMPRESSION:', 'RECOMMENDATIONS:', "
        f"'OPINIONS:'. Start directly with the first recommendation sentence.\n"
        f"- Do NOT mention organs or pathology that are not in the impression above.\n"
        f"- Plain prose only. No JSON. No section markers.\n"
        f"Write the recommendations now:"
    )


# ─── Core helpers (unchanged) ─────────────────────────────────────────────────

def _call_medgemma(prompt: str, image_b64: Optional[str] = None, max_tokens: int = 300) -> str:
    resp = _requests.post(
        f"{MEDGEMMA_URL}/api/generate",
        json={"prompt": prompt, "image_base64": image_b64, "temperature": 0.0, "max_tokens": max_tokens},
        timeout=300,
    )
    if resp.status_code != 200:
        logger.error(f"[medgemma] {resp.status_code} body: {resp.text[:500]} | prompt[:200]={prompt[:200]} | img_b64_len={len(image_b64) if image_b64 else 0}")
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


_PLACEHOLDER_TAG_RE = re.compile(
    r"<[^<>\n]{0,40}?B[A-Z]{0,3}NK[^<>\n]{0,20}?LINES?[^<>\n]{0,10}?>",
    re.IGNORECASE,
)
_HTML_ENTITY_PLACEHOLDER_RE = re.compile(
    r"&lt;[^&\n]{0,40}?B[A-Z]{0,3}NK[^&\n]{0,20}?LINES?[^&\n]{0,10}?&gt;",
    re.IGNORECASE,
)
# Any stray all-caps tag like <BLOCKQUOTE>, </BLOCKQUOTE>, <BR>, <HR>, <P>, etc.
# Markdown never uses these, so we can strip them blindly.
_STRAY_CAPS_TAG_RE = re.compile(r"</?[A-Z][A-Z0-9_\s-]{0,30}\s*/?>")
# Truncated placeholder tokens — '<BLANKLINE' / '<BLINKLINE' / '<BLANK LINE'
# WITHOUT the closing '>'. MedGemma sometimes cuts the token off mid-word.
# Word-boundary anchor prevents matching inside a larger word.
_TRUNCATED_PLACEHOLDER_RE = re.compile(
    r"<\s*B[A-Z]{0,3}NK[\s_-]*LINES?\b",
    re.IGNORECASE,
)


def _strip_placeholder_tags(text: str) -> str:
    """Remove literal placeholder/HTML tags MedGemma emits in place of blank lines,
    e.g. <BLANKLINE>, <BLINKLINE>, <BLANK LINE>, &lt;BLANKLINE&gt;, </BLOCKQUOTE>,
    <BR>, etc., and truncated forms like '<BLANKLINE' (no closing >).
    Returns text with tokens removed but surrounding newlines kept."""
    text = _PLACEHOLDER_TAG_RE.sub("", text)
    text = _HTML_ENTITY_PLACEHOLDER_RE.sub("", text)
    text = _STRAY_CAPS_TAG_RE.sub("", text)
    text = _TRUNCATED_PLACEHOLDER_RE.sub("", text)
    text = re.sub(r"<\s*br\s*/?\s*>", "\n", text, flags=re.IGNORECASE)
    return text


def _sanitize_section(text: str, max_words: int = 120) -> str:
    text = re.sub(r"```[a-z]*\n?|```", "", text)
    text = _strip_placeholder_tags(text)
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


def _sanitize_findings(text: str) -> str:
    """Force organ-by-organ structure with **bold** headers and line breaks.
    Different from _sanitize_section which collapses everything to one paragraph
    and strips markdown."""
    # Remove code fences only, keep ** markers
    text = re.sub(r"```[a-z]*\n?|```", "", text)
    # Drop literal placeholder tokens the model emits for empty lines
    text = _strip_placeholder_tags(text)
    # Drop heading markers like "# FINDINGS" but keep ** intact
    text = re.sub(r"^#+\s+\w[\w\s]*\n", "", text, flags=re.MULTILINE)

    # Scrub any internal preambles the model may emit at the start, even after the outer strip.
    PREAMBLE = re.compile(
        r"^\s*(?:\*\*)?\s*"
        r"(BY ORGAN SYSTEMS?|ORGAN[- ]BY[- ]ORGAN|FINDINGS BY ORGAN(?: SYSTEM)?|"
        r"FINDINGS ARE AS FOLLOWS|THE FOLLOWING FINDINGS(?: ARE NOTED)?|FINDINGS)"
        r"\s*\**\s*:?\s*\n*",
        re.IGNORECASE,
    )
    for _ in range(3):
        new = PREAMBLE.sub("", text)
        if new == text:
            break
        text = new

    # Normalise "Organ - Subname:" / "Organ – Subname:" / "Organ / Subname:" into "Organ:"
    # so we don't get compound headers like "Abdomen - General:".
    text = re.sub(
        r"^(\s*\**\s*)([A-Z][A-Za-z]+)\s*[-–/]\s*[A-Za-z][A-Za-z\s]{0,30}?(\s*:)",
        r"\1\2\3",
        text,
        flags=re.MULTILINE,
    )
    # Same pattern when the compound header appears mid-paragraph (after a sentence end)
    text = re.sub(
        r"([.!?])\s+(\*\*)?([A-Z][A-Za-z]+)\s*[-–/]\s*[A-Za-z][A-Za-z\s]{0,30}?(\s*:)",
        r"\1\n\n\2\3\4",
        text,
    )

    # If MedGemma returned multiple organs on one line (e.g. "Liver: text. Kidneys: text"),
    # split before each "OrganName:" / "**OrganName:**" so each is its own block.
    text = re.sub(
        r"([.!?])\s+(\*\*)?([A-Z][A-Za-z]+(?:\s+[A-Za-z]+){0,3}?\s*:)",
        r"\1\n\n\2\3",
        text,
    )

    # Walk lines: ensure organ headers are bolded and description starts on its own line.
    cleaned = []
    for line in text.splitlines():
        s = line.strip()
        if not s:
            cleaned.append("")
            continue
        # Already-bolded header on its own line — keep it, ensure header is alone
        m_bold = re.match(r"^\*\*([^*\n]{1,60}?):\*\*\s*(.*)$", s)
        if m_bold:
            header = m_bold.group(1).strip()
            rest = m_bold.group(2).strip()
            cleaned.append(f"**{header}:**")
            if rest:
                cleaned.append(rest)
            continue
        # Plain "Organ Name:" header (no ** yet) — wrap in bold, push rest to next line
        m = re.match(r"^([A-Z][A-Za-z][A-Za-z\s/&-]{0,50}?):\s*(.*)$", s)
        if m:
            header = m.group(1).strip()
            rest = m.group(2).strip()
            # Only treat as header if 1-6 short words (avoid mangling sentences with a colon)
            if 1 <= len(header.split()) <= 6 and not header.lower().startswith(("findings", "by organ", "the ")):
                cleaned.append(f"**{header}:**")
                if rest:
                    cleaned.append(rest)
                continue
        cleaned.append(s)

    # Ensure a blank line BEFORE every **Header:** that isn't already preceded by one
    out_lines = []
    for i, ln in enumerate(cleaned):
        if re.match(r"^\*\*[^*]+:\*\*\s*$", ln) and out_lines and out_lines[-1].strip():
            out_lines.append("")
        out_lines.append(ln)

    out = "\n".join(out_lines)
    out = re.sub(r"\n{3,}", "\n\n", out)
    return out.strip()


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


def _enforce_organ_header_format(text: str) -> str:
    """Walk findings line-by-line and rewrite every organ header into
    **N. Organ Name:** with sequential N (1, 2, 3, ...).
    The leading `**` prevents the frontend's markdownToHtml regex
    (`^\\s*\\d+[.)]`) from parsing it as an ordered list, so each header
    renders as plain bold text with description lines aligned underneath."""
    counter = 0
    out_lines = []
    # Matches a "header-like" line. Captures the organ name.
    # Accepts: **N. Organ:**, N. Organ:, **Organ:**, Organ:, N) Organ:, etc.
    header_re = re.compile(
        r"^\s*(?:\*\*)?\s*(?:\d+\s*[.):]\s*)?\s*"
        r"([A-Z][A-Za-z][A-Za-z\s/&'-]{0,60}?)"
        r"\s*:\s*(?:\*\*)?\s*$"
    )
    SKIP_PREFIXES = ("findings", "by organ", "the ", "patient", "study", "modality",
                     "impression", "technique", "recommendations", "note",
                     "abnormal", "notable", "summary", "overall", "key",
                     "comment", "remark")

    for line in text.split("\n"):
        stripped = line.strip()
        if not stripped:
            out_lines.append("")
            continue
        m = header_re.match(stripped)
        if m:
            organ = m.group(1).strip()
            words = organ.split()
            looks_like_header = (
                1 <= len(words) <= 6
                and not organ.lower().startswith(SKIP_PREFIXES)
                and all(len(w) <= 25 for w in words)
            )
            if looks_like_header:
                counter += 1
                out_lines.append(f"**{counter}. {organ}:**")
                continue
        out_lines.append(stripped)

    return "\n".join(out_lines)


def _claude_reformat_technique(raw_technique: str, modality: Optional[str],
                               study: Optional[str], patient_info: str) -> str:
    """Reformat MedGemma's raw TECHNIQUE into a clean radiology-style paragraph.
    If MedGemma's output is unusable (e.g. it echoed the prompt instructions back
    as the answer — 'The user wants me to write...'), Claude rewrites it from
    scratch using the modality + study + patient context.
    Returns empty string on failure, in which case the caller falls back to
    MedGemma's raw text."""
    if not raw_technique or not raw_technique.strip():
        raw_technique = "(none)"
    try:
        client = _get_claude_client()
    except RuntimeError as e:
        logger.warning(f"[claude reformat technique] no API key; skipping. {e}")
        return ""

    study_label = study or "this imaging study"
    modality_label = modality or "MRI"

    system_prompt = (
        "You are a precise radiology report editor. Produce the TECHNIQUE section "
        "of a formal radiology report — 1-2 short paragraphs in standard radiology "
        "style mentioning the pulse sequences / acquisition parameters, planes "
        "covered, any correlation views, contrast administration (or non-contrast), "
        "and patient positioning / coverage area.\n\n"
        "If the raw technique text supplied below is salvageable, clean it up and "
        "rephrase. If it is just an echo of prompt instructions (e.g. 'The user "
        "wants me to write a technique...'), discard it and write a fresh technique "
        "paragraph from the modality and study context provided.\n\n"
        "EXAMPLE STYLE:\n"
        "'Spin Echo STIR, T1W and T2W coronal and axial images of the brain "
        "parenchyma were obtained and correlated with T2W sagittal images. "
        "Non-contrast study performed in the supine position covering from the "
        "vertex through the foramen magnum.'\n\n"
        "ABSOLUTE RULES:\n"
        "- Plain prose only. No headings. Do NOT begin with 'TECHNIQUE:', "
        "'STUDY PROTOCOL:', or any label.\n"
        "- Do NOT include phrases like 'The user wants', 'I need to write', "
        "'I will produce', or any meta-commentary.\n"
        "- Do NOT include placeholder gaps like 'on a  scanner' or 'dated .' — "
        "if a value is missing, omit that detail entirely.\n"
        "- 1-2 short paragraphs, ending with a full stop.\n"
        "- CRITICAL: never ask for clarification. Always produce a best-effort "
        "technique paragraph.\n"
        "- Output ONLY the technique. No preamble, no closing remarks."
    )

    user_msg = (
        f"Modality: {modality_label}\n"
        f"Study: {study_label}\n"
        f"Patient context:\n{patient_info}\n\n"
        f"RAW TECHNIQUE (to be cleaned, or replaced if unusable):\n\n{raw_technique}\n\n"
        "Produce the final technique paragraph now."
    )

    try:
        resp = client.messages.create(
            model=_CLAUDE_MODEL,
            max_tokens=400,
            system=system_prompt,
            messages=[{"role": "user", "content": user_msg}],
        )
        parts = [b.text for b in resp.content if b.type == "text"]
        out = "\n".join(parts).strip()
        if _looks_like_claude_meta_response(out):
            logger.warning("[claude reformat technique] meta-response detected; returning empty")
            return ""
        return out
    except Exception as e:
        logger.error(f"[claude reformat technique] failed: {e}")
        return ""


def _claude_reformat_impression(raw_impression: str, findings: str,
                                patient_sex: Optional[str], study: Optional[str]) -> str:
    """Reformat MedGemma's raw IMPRESSION into the standard numbered template.
    Claude is used to rearrange/clean the existing impression — not to regenerate
    from scratch — preserving the clinical content MedGemma produced.
    The cleaned findings are passed as supporting context only.
    Returns empty string on failure, in which case the caller falls back to MedGemma."""
    if not raw_impression or not raw_impression.strip():
        return ""
    try:
        client = _get_claude_client()
    except RuntimeError as e:
        logger.warning(f"[claude reformat impression] no API key; skipping. {e}")
        return ""

    sex_rule = _sex_constraint(patient_sex)
    study_label = study or "this imaging study"
    sex_line = f"- {sex_rule}\n" if sex_rule else ""

    system_prompt = (
        "You are a precise radiology report editor. Reformat the IMPRESSION text "
        "provided into a standard, numbered impression block. Preserve the clinical "
        "content the original author produced — your job is to rearrange and clean "
        "it, not to invent new diagnoses.\n\n"
        "EXACT OUTPUT FORMAT — copy this structure:\n\n"
        "**1. Bulky Uterus with Probable Adenomyosis:**\n"
        "Heterogeneous T2 signal of the myometrium with an ill-defined junctional zone "
        "is suggestive of adenomyosis. Clinical correlation and dedicated pelvic "
        "ultrasound is recommended for confirmation.\n"
        "\n"
        "**2. Bilateral Adnexal Cystic Lesions:**\n"
        "Subtle cystic densities are identified in both adnexal regions; definitive "
        "ovarian characterisation could not be established on the available sequences. "
        "Dedicated transvaginal ultrasound correlation is recommended.\n"
        "\n"
        "**3. Lumbar Degenerative Disc Disease:**\n"
        "Multilevel disc degeneration with facet arthropathy and minor neural foraminal "
        "narrowing is noted within the imaged volume. No significant canal compromise "
        "identified.\n\n"
        "ABSOLUTE RULES:\n"
        "- Use ONLY the diagnoses and clinical conclusions present in the raw impression. "
        "Do NOT invent new diagnoses, measurements, or findings. You may consult the "
        "findings text for context, but the impressions themselves must come from the "
        "raw impression input.\n"
        "- Output 2-4 numbered impression entries, each derived from the raw impression.\n"
        "- Header format: **N. Diagnosis or Impression Title:** on its own line. "
        "The line MUST begin with `**` and the diagnosis name MUST end with a colon "
        "before the closing `**`.\n"
        "- Numbers MUST increment sequentially 1, 2, 3, 4. Never restart at 1.\n"
        "- Description: 1-2 clinically focused sentences below the header — explain "
        "the radiological basis and recommend a next step (correlation, follow-up, "
        "biopsy, ultrasound, etc.) where appropriate, drawn from the raw impression. "
        "Each sentence on its own line.\n"
        "- If the raw impression is entirely normal, output ONE entry: "
        "`**1. No Significant Abnormality:**` followed by a single sentence.\n"
        "- Separate entries with exactly ONE blank line. No horizontal rules.\n"
        "- Use precise radiological/medical terminology. Drop vague phrases like "
        "'review the findings' or 'evaluate significance'.\n"
        "- Do NOT echo prompt instructions back as impression content.\n"
        "- CRITICAL: Never ask for clarification, never say the input is missing or cut off, "
        "never request more text. Always produce a best-effort reformatted impression from "
        "whatever raw text is provided. If the raw impression is sparse, output "
        "'**1. No Significant Abnormality Detected:**' with a single concluding sentence "
        "rather than refusing.\n"
        f"{sex_line}"
        "- Output ONLY the impression block. No preamble, no '=== IMPRESSION ===' "
        "marker, no closing remarks, no meta-commentary."
    )

    user_msg = (
        f"Study: {study_label}\n\n"
        f"RAW IMPRESSION (to be reformatted):\n\n{raw_impression}\n\n"
        f"FINDINGS (supporting context only):\n\n{findings}\n\n"
        "Reformat the raw impression now."
    )

    try:
        resp = client.messages.create(
            model=_CLAUDE_MODEL,
            max_tokens=1200,
            system=system_prompt,
            messages=[{"role": "user", "content": user_msg}],
        )
        parts = [b.text for b in resp.content if b.type == "text"]
        out = "\n".join(parts).strip()
        if _looks_like_claude_meta_response(out):
            logger.warning("[claude impression] meta-response detected; returning empty")
            return ""
        return out
    except Exception as e:
        logger.error(f"[claude impression] failed: {e}")
        return ""


_CLAUDE_META_RESPONSE_RE = re.compile(
    r"\b(i need|i'?d need|could you (please )?(re)?send|"
    r"appears (your )?(message|content|text) (was |is )?(cut off|missing|empty|truncated)|"
    r"please (re)?send|please provide|once you provide|"
    r"i (cannot|can'?t) (process|reformat|see)|"
    r"no (content|findings|text) (was )?provided)\b",
    re.IGNORECASE,
)


def _looks_like_claude_meta_response(text: str) -> bool:
    """True if Claude responded with a clarification request instead of report content
    (e.g. 'I need the raw findings text...'). We reject these and fall back to the
    MedGemma output so the editor never shows a chatbot-style apology."""
    if not text:
        return False
    head = text.strip()[:400]
    return bool(_CLAUDE_META_RESPONSE_RE.search(head))


def _claude_reformat_findings(raw: str, patient_sex: Optional[str], study: Optional[str]) -> str:
    """Pass MedGemma's findings through Claude to reformat into a numbered,
    organ-by-organ template (matches the user's preferred Claude output style).
    Falls back to the raw text if the API isn't reachable OR if MedGemma's input
    is too short to be reformatted meaningfully."""
    if not raw or not raw.strip():
        return raw
    try:
        client = _get_claude_client()
    except RuntimeError as e:
        logger.warning(f"[claude reformat findings] no API key; returning raw. {e}")
        return raw

    sex_rule = _sex_constraint(patient_sex)
    study_label = study or "this imaging study"
    sex_line = f"- {sex_rule}\n" if sex_rule else ""

    system_prompt = (
        "You are a precise radiology report editor. Reformat the FINDINGS text below "
        "into a clean radiology-report findings section.\n\n"
        "EXPECTED OUTPUT STRUCTURE — follow this layout exactly:\n\n"
        "[OPTIONAL ABNORMALITY LEAD-IN — only if there are abnormal findings.\n"
        "One short paragraph (1-3 sentences) summarising the key abnormalities, "
        "with each abnormal term in **bold**. Example:\n"
        "  Notable findings include **bulky uterus with adenomyosis**, "
        "**free intraperitoneal fluid** in the pelvis, and **fat stranding** "
        "suggesting mesenteric edema.\n"
        "Then a blank line, then the organ-by-organ list.\n"
        "If everything is normal, skip this lead-in entirely.]\n\n"
        "**1. Urinary Bladder:**\n"
        "Partially visualized within the pelvis with a smooth contour and normal wall thickness.\n"
        "No discrete intraluminal calculus or mass lesion identified on the visualized sections.\n"
        "Perivesical fat planes are preserved.\n"
        "\n"
        "**2. Uterus:**\n"
        "The uterus is anteverted and normal in overall size, measuring approximately within expected dimensions.\n"
        "**Bulky myometrium** demonstrates heterogeneous T2 signal with ill-defined junctional zone, "
        "findings suggestive of **adenomyosis**.\n"
        "Endometrium appears unremarkable on the visualised sections.\n"
        "\n"
        "**3. Ovaries:**\n"
        "Both ovaries are normal in size and demonstrate preserved follicular architecture.\n"
        "No adnexal mass or cyst identified.\n\n"
        "ABSOLUTE RULES:\n"
        "- LEAD-IN: if any abnormality appears in the raw text, include the lead-in paragraph "
        "at the very top, with each key abnormal term wrapped in **bold**. If the raw text is "
        "entirely normal, omit the lead-in.\n"
        "- After the optional lead-in, list the organ blocks for ALL relevant organs "
        "(normal and abnormal alike) — not just the abnormal ones.\n"
        "- Each organ block: header on its own line wrapped in **bold** as **N. Organ Name:** "
        "(no space between asterisks and digit; this prevents markdown from parsing it as an "
        "ordered list).\n"
        "- Numbers MUST increment sequentially: 1, 2, 3, 4, ... across the whole findings. "
        "NEVER restart at 1.\n"
        "- Each organ description must contain 2-3 substantive radiological sentences — "
        "covering size, signal/attenuation, contour, mucosa, contents, and any focal lesion. "
        "Avoid one-line descriptions like 'appears normal'.\n"
        "- Each sentence on its OWN line within the description.\n"
        "- Separate two organ blocks with exactly ONE blank line. Do NOT write '---', "
        "'***', '___', or any horizontal-rule separator — only a blank line.\n"
        "- Wrap ABNORMAL terms inside descriptions in **bold** (e.g. **edema**, "
        "**mass lesion**). Do NOT bold normal/unremarkable descriptions.\n"
        "- REMOVE any stray HTML/XML-like tags: <BLANKLINE>, </BLOCKQUOTE>, <BR>, etc.\n"
        "- REMOVE any template placeholders like '[insert measurement]', '[X mm]', "
        "'[size]', etc. Either drop the sentence or rephrase to omit the placeholder.\n"
        f"- SCOPE: drop any organ NOT clinically relevant to {study_label}. "
        "Specifically drop 'Chorionic Villi', 'Circumventricular Organs', and any "
        "CNS anatomy for body studies. Keep only relevant organs.\n"
        "- Do NOT invent new findings. Use only the content provided in the raw text; you may "
        "rephrase or expand existing observations with appropriate radiological vocabulary, "
        "but do not introduce conditions, measurements, or organs not present in the raw text.\n"
        f"{sex_line}"
        "- CRITICAL: Never ask for clarification, never say the input is missing/cut off/empty, "
        "never request more text. Always produce a best-effort reformatted findings block from "
        "whatever raw text is provided, even if it is short, fragmented, or low-quality. If a "
        "section is sparse, write '**N. Organ:**' followed by a brief statement such as "
        "'Appears unremarkable on the visualised sections' rather than refusing.\n"
        "- Output ONLY the reformatted findings. No preamble, no '=== FINDINGS ===' "
        "marker, no closing remarks, no horizontal rules, no meta-commentary."
    )

    user_msg = (
        f"Study: {study_label}\n\n"
        f"Raw findings to reformat:\n\n{raw}"
    )

    try:
        resp = client.messages.create(
            model=_CLAUDE_MODEL,
            max_tokens=2000,
            system=system_prompt,
            messages=[{"role": "user", "content": user_msg}],
        )
        parts = [b.text for b in resp.content if b.type == "text"]
        out = "\n".join(parts).strip()
        if not out:
            return raw
        if _looks_like_claude_meta_response(out):
            logger.warning("[claude reformat findings] meta-response detected; returning raw")
            return raw
        return out
    except Exception as e:
        logger.error(f"[claude reformat findings] failed: {e}; returning raw")
        return raw


def _patient_info_block(data: MedGemmaVisionRequest) -> str:
    sex = (data.patient_sex or "").strip()
    if sex.upper() in ("M", "MALE"):
        sex_text = "Male"
    elif sex.upper() in ("F", "FEMALE"):
        sex_text = "Female"
    else:
        sex_text = sex or "Not provided"

    age_text = f"{data.patient_age} years" if data.patient_age else "Not provided"

    return (
        f"Patient Name : {data.patient_name or 'Not provided'}\n"
        f"Age          : {age_text}\n"
        f"Sex          : {sex_text}\n"
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
    patient_sex: Optional[str] = None,
    study: Optional[str] = None,
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
            _batch_prompt(view.upper(), indices, modality, patient_sex, study),
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
            data.slices, view, modality, job_id, total_batches, batches_done,
            patient_sex=data.patient_sex,
            study=data.study,
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
    findings = _call_medgemma(
        _findings_prompt(patient_info, modality, all_obs, patient_sex=data.patient_sex),
        max_tokens=400,
    )

    _check_cancel(job_id)
    JOBS.update(job_id, stage="Writing Impression section...", progress=90)
    impression = _call_medgemma(
        _impression_prompt(findings, patient_sex=data.patient_sex),
        max_tokens=200,
    )

    # Recommendations is generated AFTER impression is sanitized and reformatted —
    # see below, after the Claude impression reformat. This keeps the input clean
    # and lets MedGemma write recommendations grounded in the final impression.
    recommendations = ""

    # Step 3 — sanitize
    def _strip_header(txt, *headers):
        # Try multiple times in case the model emitted nested/repeated preambles
        for _ in range(3):
            stripped_any = False
            for h in headers:
                new = re.sub(rf"^\**\s*{h}\s*\**\s*:?\s*\n*", "", txt, flags=re.IGNORECASE).strip()
                if new != txt:
                    txt = new
                    stripped_any = True
            if not stripped_any:
                break
        return txt

    technique_headers = (
        "STUDY PROTOCOL AND TECHNIQUE", "STUDY PROTOCOLS AND TECHNIQUE",
        "STUDY PROTOCOL / TECHNIQUE", "STUDY PROTOCOLS / TECHNIQUE",
        "STUDY PROTOCOLS", "STUDY PROTOCOL", "PROTOCOL", "TECHNIQUE",
    )
    findings_headers = (
        "BY ORGAN SYSTEM", "BY ORGAN", "ORGAN BY ORGAN", "ORGAN-BY-ORGAN",
        "FINDINGS BY ORGAN SYSTEM", "FINDINGS ARE AS FOLLOWS",
        "THE FOLLOWING FINDINGS", "FINDINGS",
    )

    technique       = _sanitize_section(_strip_header(technique, *technique_headers), max_words=80)
    findings        = _sanitize_findings(_strip_header(findings, *findings_headers))
    impression      = _sanitize_impression(_strip_header(impression, "IMPRESSION"))

    # Final defensive sweep — kill any placeholder tags that slipped through.
    technique       = _strip_placeholder_tags(technique).strip()
    findings        = _strip_placeholder_tags(findings).strip()
    impression      = _strip_placeholder_tags(impression).strip()

    # Reformat technique via Claude. MedGemma sometimes echoes the prompt
    # back as the answer ('The user wants me to write...'); Claude either
    # cleans up the raw text or generates a fresh one from the patient/study
    # context. Falls back to MedGemma's text if Claude is unreachable.
    _check_cancel(job_id)
    JOBS.update(job_id, stage="Reformatting Technique...", progress=93)
    claude_technique = _claude_reformat_technique(technique, modality, data.study, patient_info)
    if claude_technique:
        technique = _strip_placeholder_tags(claude_technique).strip()

    # Reformat findings via Claude to match the target numbered-list template.
    # If Claude is unreachable, the raw sanitized findings are returned.
    _check_cancel(job_id)
    JOBS.update(job_id, stage="Reformatting findings...", progress=95)
    findings = _claude_reformat_findings(findings, data.patient_sex, data.study)
    # Defensive sweep: strip placeholder tags, horizontal-rule lines, and template tokens.
    findings = _strip_placeholder_tags(findings)
    findings = re.sub(r"^\s*[-*_]{3,}\s*$\n?", "", findings, flags=re.MULTILINE)
    findings = re.sub(r"\[(?:insert |x |X |size|measurement|value|number)[^\]\n]{0,40}\]", "", findings)
    # Force every organ header into **N. Organ:** with sequential N. Done LAST so
    # whatever Claude emitted (with or without bold, with or without numbers) is
    # normalized into a single canonical format the frontend renders correctly.
    findings = _enforce_organ_header_format(findings)
    findings = re.sub(r"\n{3,}", "\n\n", findings).strip()

    # Reformat MedGemma's IMPRESSION via Claude. Claude rearranges what MedGemma
    # produced into the standard numbered template — it does NOT generate a new
    # impression from scratch. The cleaned findings is passed as supporting context.
    _check_cancel(job_id)
    JOBS.update(job_id, stage="Reformatting Impression...", progress=97)
    claude_impression = _claude_reformat_impression(impression, findings, data.patient_sex, data.study)
    if claude_impression:
        impression = _strip_placeholder_tags(claude_impression).strip()
        impression = re.sub(r"^\s*[-*_]{3,}\s*$\n?", "", impression, flags=re.MULTILINE)
        impression = re.sub(r"\n{3,}", "\n\n", impression).strip()

    # Recommendations is generated by MedGemma using the finalised technique +
    # findings + impression as context. The inputs are markdown-stripped inside
    # _recommendations_prompt so the 4B model isn't confused by bold/numbering.
    _check_cancel(job_id)
    JOBS.update(job_id, stage="Writing Recommendations section...", progress=99)
    recommendations = _call_medgemma(
        _recommendations_prompt(technique, findings, impression, modality),
        max_tokens=200,
    )
    recommendations = _sanitize_section(
        _strip_header(recommendations,
                      "RECOMMENDATIONS", "RECOMMENDATION", "OPINIONS", "OPINION", "IMPRESSION"),
        max_words=120,
    )
    # Strip leaked headers and empty/placeholder measurements that MedGemma sometimes echoes.
    recommendations = re.sub(
        r"\b(IMPRESSION|FINDINGS|TECHNIQUE|OPINIONS|RECOMMENDATIONS?)\s*:\s*",
        "",
        recommendations,
        flags=re.IGNORECASE,
    )
    # Strip MedGemma's chatty preambles like:
    #   "Based on the provided Impression, here are two potential clinical ..."
    #   "Based solely on the provided Impression/diagnoses (...), here are ..."
    #   "Here are 3 recommendations:"
    #   "Following the impression above, ..."
    # Match from the start of the text up to the first numbered item ("1." or "1)").
    # "based(\s+\w+){0,3}\s+on" catches "based on", "based solely on", "based purely on", etc.
    recommendations = re.sub(
        r"^\s*(based(\s+\w+){0,3}\s+on|given|following|considering|in light of|"
        r"here (are|is)|the following|please find|below (are|is))[^\n]{0,300}?"
        r"(?=(\b\d+[\.\)]\s)|$)",
        "",
        recommendations,
        flags=re.IGNORECASE,
    )
    # If preamble didn't reach a numbered item (no list), strip a trailing comma-led intro
    # like "..., here are two potential clinical " at the start of the string.
    recommendations = re.sub(
        r"^\s*(based(\s+\w+){0,3}\s+on|given|following|considering)[^.\n]{0,200}[.,]\s*",
        "",
        recommendations,
        flags=re.IGNORECASE,
    )
    recommendations = re.sub(r"approximately\s+(?=cm|mm|m)\b", "", recommendations, flags=re.IGNORECASE)
    recommendations = re.sub(r"measuring\s+(?=cm|mm|m)\b", "", recommendations, flags=re.IGNORECASE)
    recommendations = _strip_placeholder_tags(recommendations).strip()

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
    Blocks until the entire pipeline finishes. Prefer /start + /status polling
    for new clients, but this stays around for the current UI.

    Cache: if ai_* columns already exist for this case_id, return them directly
    and skip the (slow) MedGemma pipeline. Cache lookup is by case_id alone —
    the AI report is content about the case, not about the radiologist viewing
    it, so any prior generation can serve any subsequent reader.
    """
    if not data.slices:
        raise HTTPException(status_code=400, detail="No slices provided.")

    # ── Cache check (any prior AI report for this case_id) ──────────────────
    if data.case_id:
        try:
            from database import get_conn
            conn = get_conn()
            try:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        SELECT ai_technique, ai_findings, ai_impression, ai_opinions
                        FROM radiology_schema.reports
                        WHERE case_id = %s
                          AND (ai_technique IS NOT NULL
                               OR ai_findings IS NOT NULL
                               OR ai_impression IS NOT NULL
                               OR ai_opinions IS NOT NULL)
                        ORDER BY updated_at DESC NULLS LAST
                        LIMIT 1
                        """,
                        (data.case_id,),
                    )
                    row = cur.fetchone()
                if row:
                    ai_technique, ai_findings, ai_impression, ai_opinions = row
                    if ai_technique or ai_findings or ai_impression or ai_opinions:
                        logger.info(
                            f"[medgemma cache] HIT case_id={data.case_id} "
                            f"— skipping pipeline"
                        )
                        view_counts_cache: Dict[str, int] = {}
                        for s in data.slices:
                            view_counts_cache[s.view] = view_counts_cache.get(s.view, 0) + 1
                        return {
                            "success":         True,
                            "cached":          True,
                            "source":          "database_cache",
                            "report":          "\n\n".join(
                                p for p in [ai_technique, ai_findings, ai_impression, ai_opinions] if p
                            ),
                            "technique":       ai_technique,
                            "findings":        ai_findings,
                            "impression":      ai_impression,
                            "recommendations": ai_opinions,
                            "slices_analyzed": len(data.slices),
                            "views":           view_counts_cache,
                            "model":           "cache",
                            "pipeline":        "database_cache",
                        }
            finally:
                try: conn.close()
                except Exception: pass
        except Exception as cache_err:
            # Fail open: if cache lookup explodes, fall through to fresh generation.
            logger.warning(f"[medgemma cache] lookup failed, generating fresh: {cache_err}")

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
        raise HTTPException(status_code=503, detail=f"AI pipeline failed: {e}")


# ─── Editor AI: apply natural-language edits to a report ─────────────────────
# This endpoint uses Claude (Anthropic API) instead of MedGemma. The vision
# report pipeline above still uses MedGemma — only the editor calls Claude.

class EditReportRequest(BaseModel):
    technique: Optional[str]  = None
    findings: Optional[str]   = None
    impression: Optional[str] = None
    opinions: Optional[str]   = None
    command: str  # natural-language instruction from radiologist


# Claude client + model config
_CLAUDE_MODEL = os.getenv("CLAUDE_EDITOR_MODEL", "claude-sonnet-4-6")
_CLAUDE_CLIENT: Optional[_anthropic.Anthropic] = None

# Static system prompt for the editor — never changes per request, so we
# attach cache_control. (Caches only kick in if the prefix is large enough,
# but no harm leaving the marker.)
_EDITOR_SYSTEM_PROMPT = (
    "You are a precise radiology report editor. The radiologist will give you "
    "an instruction; apply it to the report and return the FULL updated report.\n\n"
    "**CRITICAL RULE — SECTION PRESERVATION**\n"
    "First, identify which section(s) the instruction is targeting. Examples:\n"
    "  - 'convert findings to bullets' → only FINDINGS\n"
    "  - 'make impression concise' → only IMPRESSION\n"
    "  - 'add recommendations' → only OPINIONS\n"
    "  - 'replace heart with lungs' → all sections (word replacement is global)\n"
    "For sections NOT targeted by the instruction, return them BYTE-FOR-BYTE\n"
    "IDENTICAL to the input. Do NOT reformat, re-flow, re-order, rephrase, or\n"
    "'clean up' those sections. If the input findings already has bullet points\n"
    "(`- ` prefix on lines), the output findings MUST keep the same bullet points\n"
    "unless the instruction was specifically about findings.\n\n"
    "OTHER RULES:\n"
    "1. Do NOT invent new findings or alter unrelated sections.\n"
    "2. Preserve clinical/radiological tone and medical terminology.\n"
    "3. FORMATTING — you may use simple Markdown to convey formatting:\n"
    "   - **bold text** for emphasis (e.g. organ names like **Pelvic Organs:**)\n"
    "   - *italic text* for terms requiring stress\n"
    "   - `- ` at the start of a line for bullet points\n"
    "   - `1. ` at the start of a line for numbered lists\n"
    "   - Blank lines for paragraph breaks\n"
    "   When the user asks to make something bold/italic, USE the markdown above.\n"
    "   When converting findings to bullet points, use `- ` prefix on each item.\n"
    "4. Return the result in EXACTLY this format with the four section markers — "
    "even sections that did not change must be returned unchanged:\n\n"
    "=== TECHNIQUE ===\n<technique text>\n\n"
    "=== FINDINGS ===\n<findings text>\n\n"
    "=== IMPRESSION ===\n<impression text>\n\n"
    "=== OPINIONS ===\n<opinions text>\n\n"
    "No preamble. No explanation. Output only the four sections."
)


def _get_claude_client() -> _anthropic.Anthropic:
    """Lazily initialise the Anthropic client. Reads ANTHROPIC_API_KEY (preferred)
    or CLAUDE_API_KEY from the environment."""
    global _CLAUDE_CLIENT
    if _CLAUDE_CLIENT is None:
        api_key = os.getenv("ANTHROPIC_API_KEY") or os.getenv("CLAUDE_API_KEY")
        if not api_key:
            raise RuntimeError(
                "ANTHROPIC_API_KEY not set in backend/.env "
                "(CLAUDE_API_KEY also accepted as fallback)"
            )
        _CLAUDE_CLIENT = _anthropic.Anthropic(api_key=api_key)
    return _CLAUDE_CLIENT


def _build_editor_user_message(data: EditReportRequest) -> str:
    """Per-request payload — separated from the static system prompt so the
    system prompt remains cacheable across requests."""
    return (
        f"USER INSTRUCTION: {data.command.strip()}\n\n"
        f"CURRENT REPORT:\n"
        f"=== TECHNIQUE ===\n{data.technique or '(empty)'}\n\n"
        f"=== FINDINGS ===\n{data.findings or '(empty)'}\n\n"
        f"=== IMPRESSION ===\n{data.impression or '(empty)'}\n\n"
        f"=== OPINIONS ===\n{data.opinions or '(empty)'}"
    )


def _call_claude_editor(data: EditReportRequest, max_tokens: int = 8192) -> str:
    """Run the editor prompt through Claude. Returns the raw response text
    (the parser downstream extracts the four sections)."""
    client = _get_claude_client()
    user_content = _build_editor_user_message(data)

    response = client.messages.create(
        model=_CLAUDE_MODEL,
        max_tokens=max_tokens,
        thinking={"type": "adaptive"},
        system=[
            {
                "type": "text",
                "text": _EDITOR_SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[{"role": "user", "content": user_content}],
    )

    # Concatenate text blocks; skip thinking blocks
    parts = [b.text for b in response.content if b.type == "text"]
    return "\n".join(parts).strip()


def _edit_report_prompt(data: EditReportRequest) -> str:
    return (
        f"You are a precise radiology report editor. The radiologist will give you "
        f"an instruction; apply it to the report below and return the FULL updated report.\n\n"
        f"USER INSTRUCTION: {data.command.strip()}\n\n"
        f"CURRENT REPORT:\n"
        f"=== TECHNIQUE ===\n{data.technique or '(empty)'}\n\n"
        f"=== FINDINGS ===\n{data.findings or '(empty)'}\n\n"
        f"=== IMPRESSION ===\n{data.impression or '(empty)'}\n\n"
        f"=== OPINIONS ===\n{data.opinions or '(empty)'}\n\n"
        f"RULES:\n"
        f"1. Apply the instruction only where it logically belongs (e.g. word replacements "
        f"   apply to all sections; a section-specific instruction applies only to that section).\n"
        f"2. Do NOT invent new findings or alter unrelated sections.\n"
        f"3. Preserve clinical/radiological tone and medical terminology.\n"
        f"4. Return the result in EXACTLY this format with the four section markers — "
        f"   even sections that did not change must be returned unchanged:\n\n"
        f"=== TECHNIQUE ===\n<technique text>\n\n"
        f"=== FINDINGS ===\n<findings text>\n\n"
        f"=== IMPRESSION ===\n<impression text>\n\n"
        f"=== OPINIONS ===\n<opinions text>\n\n"
        f"No preamble. No explanation. Begin output now:"
    )


def _parse_edited_sections(text: str) -> Dict[str, Any]:
    """Parse the 4 sections out of the editor's response.
    Returns {"sections": {...}, "matched": set(keys actually present in the output)}
    so callers can distinguish "section omitted" from "section deliberately empty"."""
    out = {"technique": "", "findings": "", "impression": "", "opinions": ""}
    matched: set = set()
    pattern = re.compile(
        r"===\s*(TECHNIQUE|FINDINGS|IMPRESSION|OPINIONS)\s*===\s*(.*?)(?=(?:===\s*(?:TECHNIQUE|FINDINGS|IMPRESSION|OPINIONS)\s*===)|\Z)",
        re.DOTALL | re.IGNORECASE,
    )
    for m in pattern.finditer(text):
        key = m.group(1).strip().lower()
        body = m.group(2).strip()
        if body.lower() == "(unchanged)":
            # Explicit signal from the prompt that this section is unchanged — skip
            # so the caller falls back to the original. "(empty)" is NOT treated this
            # way: it means the section is intentionally blank.
            continue
        if body.lower() == "(empty)":
            body = ""
        out[key] = body
        matched.add(key)
    return {"sections": out, "matched": matched}


# Generic, user-facing message shown in the report editor when the AI call fails.
# The real cause (vendor name, credit balance, etc.) is kept only in the server logs.
EDITOR_ERROR_MESSAGE = "AI Service error, Please contact Admin"


@router.post("/edit-report")
async def edit_report(data: EditReportRequest):
    """Apply a natural-language edit instruction to the current report.
    Powered by Claude (Anthropic API) in this build. Returns the four updated sections."""
    cmd = (data.command or "").strip()
    if not cmd:
        raise HTTPException(status_code=400, detail="command is required")

    try:
        raw = _call_claude_editor(data)
    except RuntimeError as e:
        # Missing API key
        logger.error(f"[edit-report] Claude config error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    except _anthropic.APIError as e:
        logger.error(f"[edit-report] Claude API error: {e}")   # real cause stays in server logs
        raise HTTPException(status_code=503, detail=EDITOR_ERROR_MESSAGE)
    except Exception as e:
        logger.error(f"[edit-report] Claude call failed: {e}")  # real cause stays in server logs
        raise HTTPException(status_code=503, detail=EDITOR_ERROR_MESSAGE)

    parsed = _parse_edited_sections(raw)
    sections = parsed["sections"]
    matched = parsed["matched"]

    # Fallback fires only when Claude returned text without any section markers at all.
    # An "all empty" parse is a valid clear-the-report response — don't treat it as a parse failure.
    if not matched:
        return {
            "success": True,
            "data": {
                "technique":  data.technique or "",
                "findings":   raw.strip(),
                "impression": data.impression or "",
                "opinions":   data.opinions or "",
                "_warning":   "Editor response could not be parsed into sections; raw text returned in findings.",
            },
        }

    # For each section: if Claude actually returned a header for it, use that value
    # (including the empty string, which means "intentionally cleared"). If Claude
    # omitted the section entirely, fall back to the original.
    def pick(key: str, original: Optional[str]) -> str:
        return sections[key] if key in matched else (original or "")

    return {
        "success": True,
        "data": {
            "technique":  pick("technique",  data.technique),
            "findings":   pick("findings",   data.findings),
            "impression": pick("impression", data.impression),
            "opinions":   pick("opinions",   data.opinions),
        },
    }
