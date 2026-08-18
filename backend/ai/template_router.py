import os, re, json, logging
import anthropic as _anthropic
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env"), override=True)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ai", tags=["AI - Template"])

_CLIENT = None

def _get_client() -> _anthropic.Anthropic:
    global _CLIENT
    if _CLIENT is None:
        api_key = os.getenv("ANTHROPIC_API_KEY") or os.getenv("CLAUDE_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not set in .env")
        _CLIENT = _anthropic.Anthropic(api_key=api_key)
    return _CLIENT


class TemplateRequest(BaseModel):
    text: str


SYSTEM_PROMPT = """You are a radiology report template extractor.

Given a filled-in radiology report, return a BLANK HTML template preserving only the STRUCTURE — strip all clinical content but keep EVERY heading and sub-heading.

STRICT OUTPUT RULES:
- Return RAW HTML only. No markdown. No code fences. No backticks. No explanation.
- Start your response directly with: <div style="font-family:Arial,sans-serif;font-size:13px;line-height:1.6;color:#111827;padding:8px;">

STRUCTURE RULES:

1. HEADER TABLE — use this EXACT format with table-layout:fixed so columns stay aligned:
<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:12px;table-layout:fixed;">
  <tr>
    <td style="font-weight:700;white-space:nowrap;padding:5px 8px 5px 0;width:160px;">LABEL1:</td>
    <td style="border-bottom:1px dashed #bbb;padding:5px 8px;" contenteditable="true"></td>
    <td style="font-weight:700;white-space:nowrap;padding:5px 8px 5px 20px;width:160px;">LABEL2:</td>
    <td style="border-bottom:1px dashed #bbb;padding:5px 8px;" contenteditable="true"></td>
  </tr>
</table>
Pair 2 fields per row. If odd number of fields, leave last row's right side empty.

2. STUDY TITLE — centered, bold, underlined:
<p style="text-align:center;font-weight:700;text-decoration:underline;font-size:14px;margin:12px 0;">TITLE HERE</p>

3. SECTION AND SUB-SECTION HEADINGS — CRITICAL RULE: Keep EVERY heading that appears in the original report. Do NOT skip or merge any heading. Each heading gets a bold label + empty editable div:
<p style="font-weight:700;margin:12px 0 4px;">Section Name:</p>
<div style="min-height:52px;border-bottom:1px dashed #bbb;margin-bottom:10px;" contenteditable="true"></div>

4. DROP COMPLETELY: hospital name, department, org lines, all doctor/radiologist signature lines, reporting radiologist, designation, all clinical content and values under headings. Keep heading labels only."""


def _truncate(text: str, max_lines: int = 60) -> str:
    lines = [l for l in text.splitlines() if l.strip()]
    return "\n".join(lines[:max_lines])


def _strip_fences(html: str) -> str:
    html = html.strip()
    html = re.sub(r'^```(?:html)?\s*\n?', '', html)
    html = re.sub(r'\n?```\s*$', '', html)
    return html.strip()


@router.post("/report-to-template")
async def report_to_template(req: TemplateRequest):
    raw = (req.text or "").strip()
    if not raw:
        raise HTTPException(status_code=400, detail="text is required")
    truncated = _truncate(raw)
    try:
        client = _get_client()
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=2048,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": f"Report:\n{truncated}"}],
        )
        html = _strip_fences(msg.content[0].text)
        if not html.endswith("</div>"):
            html += "</div>"
        input_tokens  = msg.usage.input_tokens
        output_tokens = msg.usage.output_tokens
        cost_usd = (input_tokens * 0.80 + output_tokens * 4.00) / 1_000_000
        logger.info("report-to-template — in:%d out:%d cost:$%.5f", input_tokens, output_tokens, cost_usd)
        return {
            "html": html,
            "usage": {
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "cost_usd": round(cost_usd, 5),
            },
        }
    except _anthropic.APIError as e:
        logger.error("Anthropic API error: %s", e)
        raise HTTPException(status_code=502, detail=f"AI error: {e}")


SECTIONS_PROMPT = """You are a radiology report structure parser.
Extract the structure from the provided radiology report and return a JSON object with exactly three keys:

"header_fields": array of patient detail field labels found in the report header (e.g. Patient Name, Age / Sex, OP / IP No., Referring Doctor, Date & Time of Scan, Investigation). These are the top patient info fields — NOT clinical headings.

"study_title": the investigation/study title that typically appears centered and bold in the report (e.g. "MRI OF BRAIN", "MRCP (MAGNETIC RESONANCE CHOLANGIO PANCREATICOGRAM)", "CE MRI BILATERAL BREASTS"). Return as a single string. If not found, return "".

"sections": array of clinical section heading strings found in the report body (e.g. Clinical Details, Technique, Sequences, Findings, Right Breast, Left Breast, Impression, Advice). Do NOT include the study title here.

RULES:
- Return ONLY valid JSON. No markdown, no code fences, no explanation.
- Keep EVERY section heading — do not skip or merge any.
- Example: {"header_fields":["Patient Name","Age / Sex","OP / IP No.","Referring Doctor","Date & Time of Scan","Investigation"],"study_title":"MRI OF BRAIN","sections":["Clinical Details","Sequences","Study reveals","Impression"]}"""


class SectionsRequest(BaseModel):
    text: str


def _extract_json_obj(text: str) -> dict:
    text = _strip_fences(text).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    m = re.search(r'\{.*\}', text, re.DOTALL)
    if m:
        return json.loads(m.group(0))
    raise ValueError("No JSON object found in response")


@router.post("/extract-sections")
async def extract_sections(req: SectionsRequest):
    raw = (req.text or "").strip()
    if not raw:
        raise HTTPException(status_code=400, detail="text is required")
    truncated = _truncate(raw)
    try:
        client = _get_client()
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=600,
            system=SECTIONS_PROMPT,
            messages=[{"role": "user", "content": f"Report:\n{truncated}"}],
        )
        raw_text = msg.content[0].text
        logger.debug("extract-sections raw response: %r", raw_text[:400])
        result = _extract_json_obj(raw_text)
        header_fields = [str(s).strip() for s in result.get("header_fields", []) if str(s).strip()]
        study_title   = str(result.get("study_title", "")).strip()
        sections      = [str(s).strip() for s in result.get("sections", [])       if str(s).strip()]
        logger.info("extract-sections — in:%d out:%d headers:%d sections:%d",
                    msg.usage.input_tokens, msg.usage.output_tokens, len(header_fields), len(sections))
        return {"header_fields": header_fields, "study_title": study_title, "sections": sections}
    except (json.JSONDecodeError, ValueError) as e:
        logger.error("extract-sections parse error: %s", e)
        raise HTTPException(status_code=500, detail="Could not detect sections. Try a different report.")
    except _anthropic.APIError as e:
        logger.error("Anthropic API error: %s", e)
        raise HTTPException(status_code=502, detail=f"AI error: {e}")
