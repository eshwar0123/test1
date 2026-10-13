"""
Chatbot API router — fully AI-powered personal assistant for Onix platform.
Every message goes through Gemma 3 27B with real DB context.
"""

from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel, Field
from typing import Optional

from .chatbot_db import get_chatbot_conn
from .ai_engine import chat as ai_chat

router = APIRouter(prefix="/chatbot", tags=["Chatbot"])


class ChatRequest(BaseModel):
    user_id: str = Field(..., description="UUID of the logged-in user")
    message: str = Field(..., min_length=1, description="User's chat message")
    role: str = Field("radiologist", description="User role: radiologist or organization")


class ChatResponse(BaseModel):
    reply: str


@router.post("/chat", response_model=ChatResponse)
def chat_endpoint(payload: ChatRequest = Body(...)):
    """Main chatbot endpoint — every message goes through AI."""
    print(f"[CHATBOT DEBUG] user_id={payload.user_id}, role={payload.role}, message={payload.message}")
    conn = get_chatbot_conn()
    try:
        reply = ai_chat(conn, payload.user_id, payload.message.strip(), payload.role)
        print(f"[CHATBOT DEBUG] reply={reply[:100]}")
        return ChatResponse(reply=reply)
    except Exception as e:
        print(f"Chatbot error: {e}")
        raise HTTPException(status_code=500, detail=f"Chatbot error: {str(e)}")
    finally:
        conn.close()
