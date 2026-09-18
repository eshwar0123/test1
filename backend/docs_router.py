import os
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from auth.dependencies import get_current_user

router = APIRouter(prefix="/radiology/docs", tags=["Docs"])

BASE_DIR  = os.path.dirname(os.path.abspath(__file__))
DOCS_FILE = os.environ.get(
    "ONIX_DOCS_PATH",
    os.path.join(BASE_DIR, "docs", "onix-docs.pdf")
)

@router.get("/onix-guide")
async def serve_docs(current_user=Depends(get_current_user)):
    if not os.path.exists(DOCS_FILE):
        raise HTTPException(status_code=404, detail="Documentation file not found.")

    return FileResponse(
        path=DOCS_FILE,
        media_type="application/pdf",
        headers={
            "Content-Disposition":    "inline; filename=onix-docs.pdf",
            "Cache-Control":          "no-store, no-cache, must-revalidate",
            "X-Content-Type-Options": "nosniff",
        },
    )
