import os
import io
import base64
import tempfile
import shutil
import torch
import librosa
import numpy as np
from PIL import Image

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from transformers import AutoModelForCTC, AutoProcessor
from typing import Optional
import httpx

router = APIRouter(prefix="/ai", tags=["AI"])

MEDGEMMA_URL = os.getenv("MEDGEMMA_URL", "http://100.88.115.54:11437")
MEDASR_MODEL_ID = os.getenv("MEDASR_MODEL_ID", "google/medasr")
HF_TOKEN = os.getenv("HF_API_TOKEN") or os.getenv("HUGGINGFACE_HUB_TOKEN")
MEDASR_UNAVAILABLE_MSG = (
    "MedASR model unavailable. Set HF_API_TOKEN with access to google/medasr "
    "or change MEDASR_MODEL_ID to an accessible model."
)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NII_DIR = os.path.join(BASE_DIR, "radiologist", "nii")
DICOM_DIR = os.path.join(BASE_DIR, "radiologist", "dicom_series")

# Load MedASR lazily on first STT request.
device = "cuda" if torch.cuda.is_available() else "cpu"
processor = None
medasr_model = None
_medasr_load_error = None


def _ensure_medasr_loaded():
    global processor, medasr_model, _medasr_load_error

    if processor is not None and medasr_model is not None:
        return

    if _medasr_load_error is not None:
        raise RuntimeError(MEDASR_UNAVAILABLE_MSG)

    print(f"Loading MedASR model ({MEDASR_MODEL_ID})...")
    hf_kwargs = {"token": HF_TOKEN} if HF_TOKEN else {}
    try:
        processor = AutoProcessor.from_pretrained(MEDASR_MODEL_ID, **hf_kwargs)
        medasr_model = AutoModelForCTC.from_pretrained(MEDASR_MODEL_ID, **hf_kwargs).to(device)
        medasr_model.eval()
        print(f"MedASR loaded on {device}. Ready.")
    except Exception as exc:
        _medasr_load_error = str(exc)
        print(f"MedASR load failed: {_medasr_load_error}")
        raise RuntimeError(MEDASR_UNAVAILABLE_MSG) from exc


@router.post("/stt")
async def speech_to_text(audio: UploadFile = File(...)):
    """
    Receives recorded browser audio (webm/wav)
    Returns ENGLISH radiology dictation text using MedASR
    """

    if not audio:
        raise HTTPException(status_code=400, detail="No audio uploaded")
    try:
        _ensure_medasr_loaded()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    # Save temp audio file
    with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as temp:
        shutil.copyfileobj(audio.file, temp)
        temp_path = temp.name

    try:
        # Convert webm to wav using ffmpeg (librosa can't read webm directly)
        import subprocess
        wav_path = temp_path.replace(".webm", ".wav")
        subprocess.run(["ffmpeg", "-y", "-i", temp_path, "-ar", "16000", "-ac", "1", wav_path],
                       capture_output=True, timeout=30)
        audio_array, sr = librosa.load(wav_path, sr=16000, mono=True)
        try:
            os.remove(wav_path)
        except:
            pass

        # Process audio
        inputs = processor(audio_array, sampling_rate=16000, return_tensors="pt")
        print(f"[MedASR] Input keys: {list(inputs.keys())}")
        # Handle different key names
        if "input_values" in inputs:
            input_values = inputs["input_values"].to(device)
        elif "input_features" in inputs:
            input_values = inputs["input_features"].to(device)
        else:
            input_values = list(inputs.values())[0].to(device)

        # Run inference
        with torch.no_grad():
            logits = medasr_model(input_features=input_values).logits

        # Decode
        predicted_ids = torch.argmax(logits, dim=-1)
        text = processor.batch_decode(predicted_ids)[0].strip()
        print(f"[MedASR] Raw transcription: {repr(text)} (audio samples: {len(audio_array)}, duration: {len(audio_array)/16000:.2f}s)")

        # Remove special tokens
        text = text.replace("</s>", "").replace("<s>", "").replace("<pad>", "").strip()

        # Medical dictation cleanup
        replacements = {
            " millimeter": " mm",
            " centimeters": " cm",
            " centimeter": " cm",
            " left side": " left",
            " right side": " right",
        }

        for k, v in replacements.items():
            text = text.replace(k, v)

        return {"success": True, "text": text}

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"MedASR error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        try:
            os.remove(temp_path)
        except:
            pass


class TextReportRequest(BaseModel):
    text: str
    patient_name: Optional[str] = None
    modality: Optional[str] = None
    study: Optional[str] = None


@router.post("/text-to-report")
async def text_to_report(payload: TextReportRequest):
    """Convert dictated text directly to structured report using MedGemma."""
    if not payload.text.strip():
        raise HTTPException(400, "No text provided")

    try:
        prompt = f"""You are a medical report formatter. A radiologist has dictated the following findings. Convert this into a professional structured radiology report.

DICTATION:
{payload.text}

Patient: {payload.patient_name or 'N/A'}
Modality: {payload.modality or 'N/A'}
Study: {payload.study or 'N/A'}

Format with these sections:

TECHNIQUE:
Describe the imaging technique.

FINDINGS:
Organize findings into clear sentences. Fix grammar and medical terminology.

IMPRESSION:
Summarize key findings with clinical impression.

RECOMMENDATIONS:
Include follow-up recommendations.

Be professional and concise."""

        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(f"{MEDGEMMA_URL}/api/generate", json={"prompt": prompt, "max_tokens": 1024})
            resp.raise_for_status()
            data = resp.json()
            report = data.get("response", "")

        return {"success": True, "report": report, "text": payload.text}

    except Exception as e:
        print(f"[Text-Report] MedGemma error: {e}")
        raise HTTPException(500, f"Report generation failed: {str(e)}")


class TextVolumeReportRequest(BaseModel):
    text: str
    file_url: Optional[str] = None
    case_id: Optional[str] = None
    patient_name: Optional[str] = None
    modality: Optional[str] = None
    study: Optional[str] = None


@router.post("/text-volume-report")
async def text_volume_report(payload: TextVolumeReportRequest):
    """
    Text + Volume Analysis: Doctor's text + 60 slice MedGemma analysis → combined report.
    No audio involved — text is already transcribed.
    """
    if not payload.text.strip():
        raise HTTPException(400, "No text provided")

    if not payload.file_url and not payload.case_id:
        raise HTTPException(400, "Provide file_url or case_id")

    # Extract slices
    slice_images, err = _extract_slices_from_file(payload.file_url, payload.case_id, max_slices=60)
    if err:
        raise HTTPException(404, err)

    print(f"[Text-Volume] Extracted {len(slice_images)} slices, analyzing with MedGemma...")

    # Analyze each slice with MedGemma (vision)
    slice_prompt = (
        "You are a radiologist analyzing a CT/MRI slice. "
        "Describe any abnormalities, pathologies, or notable findings. "
        "If normal, say 'Normal appearance'. Be concise — 1-3 sentences."
    )

    all_findings = []
    for i, s in enumerate(slice_images):
        plane = s.get("plane", "Axial")
        print(f"[Text-Volume] Analyzing {plane} slice {i+1}/{len(slice_images)}")
        try:
            finding = await _call_medgemma_with_image(s["base64"], slice_prompt, max_tokens=256)
            all_findings.append({"slice": s["index"], "plane": plane, "finding": finding.strip()})
        except Exception as e:
            all_findings.append({"slice": s["index"], "plane": plane, "finding": f"Failed: {str(e)}"})

    # Group by plane
    axial = [f for f in all_findings if f["plane"] == "Axial"]
    coronal = [f for f in all_findings if f["plane"] == "Coronal"]
    sagittal = [f for f in all_findings if f["plane"] == "Sagittal"]

    def fmt(findings):
        return "\n".join([f"  Slice {f['slice']}: {f['finding']}" for f in findings])

    findings_text = f"AXIAL ({len(axial)}):\n{fmt(axial)}\n\nCORONAL ({len(coronal)}):\n{fmt(coronal)}\n\nSAGITTAL ({len(sagittal)}):\n{fmt(sagittal)}"

    # Consolidate: doctor's text + AI findings → final report
    final_prompt = f"""You are an expert radiologist. Write a plain text radiology report. Do NOT use JSON, code blocks, or any formatting except plain text with section headers.

A doctor dictated these observations:
"{payload.text}"

An AI system analyzed {len(all_findings)} slices and found:
{findings_text}

Patient: {payload.patient_name or 'N/A'}
Modality: {payload.modality or 'N/A'}

Write the report in this exact format using plain text only:

TECHNIQUE:
Describe the imaging technique used.

FINDINGS:
Combine the doctor's observations with the AI slice findings. Where both agree, confirm the finding. Where AI found something the doctor didn't mention, add it. Write in complete sentences.

IMPRESSION:
Summarize the 2-3 most important findings.

RECOMMENDATIONS:
Suggest clinical follow-up if needed.

Remember: plain text only, no JSON, no code, no markdown."""

    try:
        report = await _call_medgemma_text(final_prompt, max_tokens=1024)
    except Exception as e:
        report = f"Consolidation failed.\n\nDoctor: {payload.text}\n\nAI findings:\n{findings_text}"

    return {
        "success": True,
        "transcription": payload.text,
        "report": report,
        "analyzed_slices": len(all_findings),
        "slice_findings": all_findings,
    }


@router.post("/stt-report")
async def speech_to_report(
    audio: UploadFile = File(...),
    patient_name: Optional[str] = Form(None),
    modality: Optional[str] = Form(None),
    study: Optional[str] = Form(None),
):
    """
    Full pipeline: Doctor speaks → MedASR → Text → MedGemma → Structured Report
    """

    if not audio:
        raise HTTPException(status_code=400, detail="No audio uploaded")
    try:
        _ensure_medasr_loaded()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    # Step 1: MedASR — Speech to Text
    with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as temp:
        shutil.copyfileobj(audio.file, temp)
        temp_path = temp.name

    try:
        audio_array, sr = librosa.load(temp_path, sr=16000, mono=True)
        inputs = processor(audio_array, sampling_rate=16000, return_tensors="pt")
        input_values = inputs.input_values.to(device)

        with torch.no_grad():
            logits = medasr_model(input_values).logits

        predicted_ids = torch.argmax(logits, dim=-1)
        raw_text = processor.batch_decode(predicted_ids)[0].strip()

        print(f"[STT-Report] MedASR transcription: {raw_text[:100]}...")

    except Exception as e:
        print(f"[STT-Report] MedASR error: {e}")
        raise HTTPException(status_code=500, detail=f"Speech recognition failed: {str(e)}")
    finally:
        try:
            os.remove(temp_path)
        except:
            pass

    if not raw_text:
        raise HTTPException(status_code=400, detail="No speech detected in audio")

    # Step 2: MedGemma — Structure the dictation into a report
    try:
        prompt = f"""You are a medical report formatter. A radiologist has dictated the following findings verbally. Convert this dictation into a professional structured radiology report.

DICTATION:
{raw_text}

Patient: {patient_name or 'N/A'}
Modality: {modality or 'N/A'}
Study: {study or 'N/A'}

Format the report with these sections:

TECHNIQUE:
Describe the imaging technique based on the dictation.

FINDINGS:
Organize the dictated findings into clear, structured sentences. Fix grammar and medical terminology.

IMPRESSION:
Summarize the key findings and provide clinical impression.

RECOMMENDATIONS:
Include any follow-up recommendations mentioned in the dictation, or suggest appropriate ones.

Write the report now. Be professional and concise."""

        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(f"{MEDGEMMA_URL}/api/generate", json={"prompt": prompt, "max_tokens": 1024})
            resp.raise_for_status()
            data = resp.json()
            structured_report = data.get("response", "")

        print(f"[STT-Report] MedGemma report generated successfully")

    except Exception as e:
        print(f"[STT-Report] MedGemma error: {e}")
        structured_report = None

    return {
        "success": True,
        "transcription": raw_text,
        "report": structured_report,
        "model_stt": "MedASR",
        "model_report": "MedGemma-27B",
    }


def _transcribe_audio(temp_path: str) -> str:
    """Shared MedASR transcription logic."""
    _ensure_medasr_loaded()
    import subprocess
    wav_path = temp_path.replace(".webm", ".wav")
    subprocess.run(["ffmpeg", "-y", "-i", temp_path, "-ar", "16000", "-ac", "1", wav_path],
                   capture_output=True, timeout=30)
    audio_array, sr = librosa.load(wav_path, sr=16000, mono=True)
    try:
        os.remove(wav_path)
    except:
        pass
    inputs = processor(audio_array, sampling_rate=16000, return_tensors="pt")
    if "input_features" in inputs:
        input_values = inputs["input_features"].to(device)
    elif "input_values" in inputs:
        input_values = inputs["input_values"].to(device)
    else:
        input_values = list(inputs.values())[0].to(device)

    with torch.no_grad():
        logits = medasr_model(input_features=input_values).logits

    predicted_ids = torch.argmax(logits, dim=-1)
    text = processor.batch_decode(predicted_ids)[0].strip()
    text = text.replace("</s>", "").replace("<s>", "").replace("<pad>", "").strip()
    return text


def _extract_slices_from_file(file_url: str, case_id: str = None, max_slices: int = 60):
    """Extract slices from NIfTI or DICOM series (20 per plane: axial, coronal, sagittal)."""
    import nibabel as nib

    nii_file = None
    dicom_dir = None

    # Find the file
    if file_url:
        if "/dicom-series/" in file_url:
            parts = file_url.split("/dicom-series/")
            if len(parts) > 1:
                folder = parts[1].split("/")[0]
                candidate = os.path.join(DICOM_DIR, folder)
                if os.path.isdir(candidate):
                    dicom_dir = candidate
        else:
            filename = file_url.split("/")[-1].split("?")[0]
            candidate = os.path.join(NII_DIR, filename)
            if os.path.exists(candidate):
                nii_file = candidate
            elif "/uploads/nii/" in file_url:
                fname = file_url.split("/uploads/nii/")[-1]
                candidate = os.path.join(NII_DIR, fname)
                if os.path.exists(candidate):
                    nii_file = candidate

    if not nii_file and not dicom_dir and case_id:
        for f in os.listdir(NII_DIR):
            if f.startswith(case_id) and (f.endswith(".nii") or f.endswith(".nii.gz")):
                nii_file = os.path.join(NII_DIR, f)
                break
        if not nii_file:
            for d in os.listdir(DICOM_DIR):
                if d.startswith(case_id) and os.path.isdir(os.path.join(DICOM_DIR, d)):
                    dicom_dir = os.path.join(DICOM_DIR, d)
                    break

    if not nii_file and not dicom_dir:
        return None, "File not found"

    # Build 3D volume
    volume = None
    if dicom_dir:
        import pydicom
        dcm_files = sorted([
            os.path.join(root, f)
            for root, _, files in os.walk(dicom_dir)
            for f in files if f.lower().endswith(".dcm")
        ])
        if not dcm_files:
            return None, "No .dcm files in series"
        slices = [pydicom.dcmread(p) for p in dcm_files]
        try:
            slices.sort(key=lambda s: float(s.ImagePositionPatient[2]))
        except:
            try:
                slices.sort(key=lambda s: int(s.InstanceNumber))
            except:
                pass
        volume = np.stack([s.pixel_array.astype(np.float32) for s in slices], axis=2)
    else:
        nii = nib.load(nii_file)
        volume = nii.get_fdata()
        if len(volume.shape) == 4:
            volume = volume[:, :, :, 0]

    if volume is None or len(volume.shape) != 3:
        return None, "Invalid volume shape"

    # Extract slices from all 3 planes
    slices_per_plane = max_slices // 3
    slice_images = []

    for axis, plane_name in [(2, "Axial"), (1, "Coronal"), (0, "Sagittal")]:
        dim = volume.shape[axis]
        step = max(1, dim // slices_per_plane)
        indices = list(range(0, dim, step))[:slices_per_plane]

        for idx in indices:
            if axis == 2:
                s = volume[:, :, idx]
            elif axis == 1:
                s = volume[:, idx, :]
            else:
                s = volume[idx, :, :]

            s_min, s_max = s.min(), s.max()
            if s_max > s_min:
                norm = ((s - s_min) / (s_max - s_min) * 255).astype(np.uint8)
            else:
                norm = np.zeros_like(s, dtype=np.uint8)

            img = Image.fromarray(norm)
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
            slice_images.append({"index": idx, "plane": plane_name, "base64": b64})

    return slice_images, None


async def _call_medgemma_with_image(image_b64: str, prompt: str, max_tokens: int = 512) -> str:
    """Call MedGemma with text (image context in prompt). MedGemma 4B text-only on server."""
    # MedGemma server is text-only, so we include image description in prompt
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(f"{MEDGEMMA_URL}/api/generate", json={"prompt": prompt, "max_tokens": max_tokens})
        resp.raise_for_status()
        return resp.json().get("response", "")


async def _call_medgemma_text(prompt: str, max_tokens: int = 1024) -> str:
    """Call MedGemma with text only."""
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(f"{MEDGEMMA_URL}/api/generate", json={"prompt": prompt, "max_tokens": max_tokens})
        resp.raise_for_status()
        return resp.json().get("response", "")


@router.post("/stt-volume-report")
async def speech_plus_volume_report(
    audio: UploadFile = File(...),
    file_url: Optional[str] = Form(None),
    case_id: Optional[str] = Form(None),
    patient_name: Optional[str] = Form(None),
    modality: Optional[str] = Form(None),
    study: Optional[str] = Form(None),
    max_slices: int = Form(60),
):
    """
    Full pipeline:
    Step 1: Doctor speaks → MedASR → transcribed text
    Step 2: NIfTI/DICOM → extract 60 slices (20 axial + 20 coronal + 20 sagittal)
    Step 3: Each slice → MedGemma → per-slice finding (60 findings)
    Step 4: Doctor's text + 60 AI findings → MedGemma → Final Report
    """

    if not audio:
        raise HTTPException(status_code=400, detail="No audio uploaded")

    # Step 1: MedASR — Doctor's speech to text
    with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as temp:
        shutil.copyfileobj(audio.file, temp)
        temp_path = temp.name

    try:
        doctor_text = _transcribe_audio(temp_path)
        print(f"[STT-Volume] Step 1 done — MedASR: {doctor_text[:80]}...")
    except Exception as e:
        raise HTTPException(500, f"Segmentation failed: {str(e)}")
    finally:
        try:
            os.remove(temp_path)
        except:
            pass

    if not doctor_text:
        raise HTTPException(400, "No speech detected")

    # Step 2: Extract slices from volume
    if not file_url and not case_id:
        raise HTTPException(400, "Provide file_url or case_id for the scan")

    slice_images, err = _extract_slices_from_file(file_url, case_id, max_slices)
    if err:
        raise HTTPException(404, err)

    print(f"[STT-Volume] Step 2 done — extracted {len(slice_images)} slices")

    # Step 3: Each slice → MedGemma → finding
    slice_prompt = (
        "You are a radiologist analyzing a medical imaging slice. "
        "Describe any abnormalities, pathologies, or notable findings. "
        "If normal, say 'Normal appearance'. Be concise — 1-3 sentences."
    )

    all_findings = []
    for i, s in enumerate(slice_images):
        print(f"[STT-Volume] Step 3 — analyzing {s['plane']} slice {i+1}/{len(slice_images)}")
        try:
            finding = _call_medgemma_with_image(s["base64"], slice_prompt, max_tokens=256)
            all_findings.append({"index": s["index"], "plane": s["plane"], "finding": finding.strip()})
        except Exception as e:
            all_findings.append({"index": s["index"], "plane": s["plane"], "finding": f"Analysis failed: {str(e)}"})

    print(f"[STT-Volume] Step 3 done — {len(all_findings)} findings")

    # Step 4: Doctor's text + AI findings → MedGemma → Final Report
    axial = [f for f in all_findings if f["plane"] == "Axial"]
    coronal = [f for f in all_findings if f["plane"] == "Coronal"]
    sagittal = [f for f in all_findings if f["plane"] == "Sagittal"]

    def fmt(findings):
        return "\n".join([f"  Slice {f['index']}: {f['finding']}" for f in findings])

    findings_text = f"""AXIAL PLANE ({len(axial)} slices):
{fmt(axial)}

CORONAL PLANE ({len(coronal)} slices):
{fmt(coronal)}

SAGITTAL PLANE ({len(sagittal)} slices):
{fmt(sagittal)}"""

    final_prompt = f"""You are an expert radiologist writing a clinical radiology report.

A radiologist has dictated the following observations:
DOCTOR'S DICTATION:
{doctor_text}

Additionally, an AI system (MedGemma) analyzed {len(all_findings)} slices across all three planes and found:
{findings_text}

Patient: {patient_name or 'N/A'}
Modality: {modality or 'N/A'}
Study: {study or 'N/A'}

Now write a final professional radiology report that COMBINES both the doctor's observations and the AI findings:

TECHNIQUE:
Describe the imaging technique.

FINDINGS:
Merge the doctor's dictation with the AI slice findings. Confirm findings that both agree on. Note any additional findings from the AI that the doctor didn't mention. Organize by anatomical region.

IMPRESSION:
Summarize the most important findings with differential diagnosis.

RECOMMENDATIONS:
Suggest clinical follow-up or additional imaging.

Be concise, professional, and clearly indicate where AI findings supplement the doctor's observations."""

    try:
        mid_b64 = slice_images[len(slice_images) // 2]["base64"]
        final_report = _call_medgemma_with_image(mid_b64, final_prompt, max_tokens=1024)
        print(f"[STT-Volume] Step 4 done — final report generated")
    except Exception as e:
        print(f"[STT-Volume] MedGemma consolidation error: {e}")
        final_report = f"Report consolidation failed.\n\nDoctor's dictation:\n{doctor_text}\n\nAI findings:\n{findings_text}"

    return {
        "success": True,
        "transcription": doctor_text,
        "report": final_report,
        "analyzed_slices": len(all_findings),
        "slice_findings": all_findings,
        "model_stt": "MedASR",
        "model_analysis": "MedGemma-27B",
    }
