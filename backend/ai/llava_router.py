import os
import base64
import httpx

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/ai", tags=["AI - LLaVA-Rad"])

LLAVA_RAD_URL = os.getenv("LLAVA_RAD_URL", "http://100.88.115.54:11436")


class ChatRequest(BaseModel):
    prompt: str
    image_base64: Optional[str] = None


@router.post("/llava/chat")
async def llava_chat(data: ChatRequest):
    """Send a text prompt (and optional base64 image) to LLaVA-Rad."""
    img = data.image_base64 or ""
    if "," in img:
        img = img.split(",", 1)[1]

    payload = {
        "prompt": data.prompt,
        "image_base64": img,
        "temperature": 0.0,
        "max_tokens": 512,
    }

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(f"{LLAVA_RAD_URL}/api/generate", json=payload)
            resp.raise_for_status()
            result = resp.json()
            return {
                "success": True,
                "response": result.get("response", ""),
                "model": "llava-rad",
            }
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="LLaVA-Rad took too long to respond")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"LLaVA-Rad error: {e.response.text}")
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="Cannot connect to LLaVA-Rad server. Is it running?")


@router.post("/llava/chat-with-file")
async def llava_chat_with_file(
    prompt: str = Form(...),
    image: UploadFile = File(None),
):
    """Send a text prompt with an uploaded image file to LLaVA-Rad."""
    img_base64 = ""
    if image:
        contents = await image.read()
        img_base64 = base64.b64encode(contents).decode("utf-8")

    payload = {
        "prompt": prompt,
        "image_base64": img_base64,
        "temperature": 0.0,
        "max_tokens": 512,
    }

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(f"{LLAVA_RAD_URL}/api/generate", json=payload)
            resp.raise_for_status()
            result = resp.json()
            return {
                "success": True,
                "response": result.get("response", ""),
                "model": "llava-rad",
            }
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="LLaVA-Rad took too long to respond")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"LLaVA-Rad error: {e.response.text}")
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="Cannot connect to LLaVA-Rad server. Is it running?")
