import os
import io
import json
import shutil
import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
load_dotenv()

_executor = ThreadPoolExecutor(max_workers=4)

import pandas as pd
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
IS_VERCEL = os.getenv("VERCEL") == "1"
STORAGE_ROOT = Path("/tmp/storage/patients") if IS_VERCEL else BASE_DIR / "storage/patients"

# ── Supabase client ────────────────────────────────────────────────────────────
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
BUCKET_NAME  = "medical-images"
_supa_client = None

def get_supabase():
    global _supa_client
    if _supa_client is None:
        from supabase import create_client
        _supa_client = create_client(SUPABASE_URL, SUPABASE_KEY)
        try:
            _supa_client.storage.create_bucket(
                BUCKET_NAME, options={"public": False, "file_size_limit": 524288000}
            )
        except Exception:
            pass  # already exists
    return _supa_client

USE_SUPABASE_STORAGE = bool(SUPABASE_URL and SUPABASE_KEY)
ALLOWED_EXTENSIONS = {".dcm", ".nii", ".gz", ".png", ".jpg", ".jpeg", ".mhd", ".raw"}

app = FastAPI(title="Medical Bulk Upload System", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    allow_credentials=False,
)


@app.on_event("startup")
def startup():
    STORAGE_ROOT.mkdir(parents=True, exist_ok=True)
    # Warm up Supabase only when env vars are configured
    if USE_SUPABASE_STORAGE:
        get_supabase()


# ── Static files ───────────────────────────────────────────────────────────────
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/", response_class=HTMLResponse)
def root():
    with open(STATIC_DIR / "index.html", encoding="utf-8") as f:
        return f.read()


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "medical-bulk-upload"}


# ── Helpers ────────────────────────────────────────────────────────────────────
def allowed_file(filename: str) -> bool:
    name = filename.lower()
    if name.endswith(".nii.gz"):
        return True
    return Path(name).suffix in ALLOWED_EXTENSIONS


# ── Shared Excel parsing helpers ───────────────────────────────────────────────

def _parse_excel_bytes(excel_bytes: bytes):
    """Try all supported readers. Returns (df, errors). df is None on total failure."""

    def try_xlrd(b):
        import xlrd
        wb = xlrd.open_workbook(file_contents=b)
        sheet = wb.sheet_by_index(0)
        headers = [str(sheet.cell_value(0, c)).strip() for c in range(sheet.ncols)]
        rows = [
            {headers[c]: sheet.cell_value(r, c) for c in range(sheet.ncols)}
            for r in range(1, sheet.nrows)
        ]
        return pd.DataFrame(rows)

    def try_numbers(b):
        import numbers_parser, tempfile, os
        with tempfile.NamedTemporaryFile(suffix=".numbers", delete=False) as tmp:
            tmp.write(b)
            tmp_path = tmp.name
        try:
            doc = numbers_parser.Document(tmp_path)
            sheet = doc.sheets[0]
            table = sheet.tables[0]
            rows = list(table.iter_rows())
            headers = [str(c.value).strip() if c.value is not None else f"col{i}"
                       for i, c in enumerate(rows[0])]
            data = [
                {headers[ci]: row[ci].value for ci in range(len(headers))}
                for row in rows[1:]
            ]
            return pd.DataFrame(data)
        finally:
            os.unlink(tmp_path)

    readers = [
        ("openpyxl (.xlsx)",          lambda b: pd.read_excel(io.BytesIO(b), engine="openpyxl")),
        ("numbers-parser (.numbers)", lambda b: try_numbers(b)),
        ("odf (.ods)",                lambda b: pd.read_excel(io.BytesIO(b), engine="odf")),
        ("xlrd (.xls)",               lambda b: try_xlrd(b)),
        ("csv utf-8",                 lambda b: pd.read_csv(io.BytesIO(b), encoding="utf-8")),
        ("csv latin-1",               lambda b: pd.read_csv(io.BytesIO(b), encoding="latin-1")),
        ("csv cp1252",                lambda b: pd.read_csv(io.BytesIO(b), encoding="cp1252")),
        ("tsv utf-8",                 lambda b: pd.read_csv(io.BytesIO(b), sep="\t", encoding="utf-8")),
        ("tsv latin-1",               lambda b: pd.read_csv(io.BytesIO(b), sep="\t", encoding="latin-1")),
    ]

    df, errors = None, []
    for label, reader in readers:
        try:
            df = reader(excel_bytes)
            break
        except Exception as e:
            errors.append(f"{label}: {e}")
    return df, errors


def _raise_if_unreadable(excel_bytes: bytes, errors: List[str]):
    hint = ""
    try:
        import zipfile
        with zipfile.ZipFile(io.BytesIO(excel_bytes)) as zf:
            names = zf.namelist()
        if any("iwa" in n or n.startswith("Index/") for n in names):
            hint = (
                "\n\nThis looks like an Apple Numbers file (.numbers). "
                "Open it in Numbers → File → Export To → Excel (.xlsx), then upload the .xlsx file."
            )
        else:
            hint = f"\n\nZIP contents: {names[:10]}"
    except Exception:
        hint = "\n\nThe file could not be opened as a ZIP archive either."
    raise HTTPException(
        status_code=400,
        detail="Cannot read metadata file. Tried all supported formats:\n" + "\n".join(errors) + hint,
    )


def _build_excel_map(df: "pd.DataFrame"):
    """Validate and build the excel_map. Returns (excel_map, validation_errors)."""
    df.columns = [c.strip() for c in df.columns]
    required_cols = {"Case_ID", "Image_File_Name"}
    missing_cols = required_cols - set(df.columns)
    if missing_cols:
        raise HTTPException(status_code=400, detail=f"Excel missing required columns: {missing_cols}")

    validation_errors: List[str] = []
    if df["Case_ID"].isnull().any():
        validation_errors.append(f"Missing Case_ID on rows: {df[df['Case_ID'].isnull()].index.tolist()}")
    if df["Image_File_Name"].isnull().any():
        validation_errors.append(f"Missing Image_File_Name on rows: {df[df['Image_File_Name'].isnull()].index.tolist()}")

    df = df.dropna(subset=["Case_ID", "Image_File_Name"])
    df["Case_ID"] = df["Case_ID"].astype(str).str.strip()
    df["Image_File_Name"] = df["Image_File_Name"].astype(str).str.strip()

    excel_map: Dict[str, Any] = {}
    for _, row in df.iterrows():
        fname = row["Image_File_Name"]
        fname_lower = fname.lower()
        has_extension = (
            fname_lower.endswith(".nii.gz") or
            "." in Path(fname_lower).name
        )
        if has_extension and not allowed_file(fname):
            validation_errors.append(f"Unsupported file type for '{fname}'")
            continue
        excel_map[fname] = {
            "case_id": str(row["Case_ID"]).strip(),
            "patient_name": str(row.get("Patient_Name", "")).strip() or None,
            "age": int(row["Age"]) if pd.notna(row.get("Age")) else None,
            "gender": str(row.get("Gender", "")).strip() or None,
            "study_date": str(row.get("Study_Date", "")).strip() or None,
        }

    return excel_map, validation_errors, df


def _upsert_patients(supa, excel_map: dict) -> int:
    patients_created = 0
    seen_cases: set = set()
    for meta in excel_map.values():
        cid = meta["case_id"]
        if cid in seen_cases:
            continue
        seen_cases.add(cid)
        existing = supa.table("patients").select("case_id").eq("case_id", cid).execute()
        if not existing.data:
            supa.table("patients").insert({
                "case_id": cid,
                "patient_name": meta["patient_name"],
                "age": meta["age"],
                "gender": meta["gender"],
                "study_date": meta["study_date"],
            }).execute()
            patients_created += 1
    return patients_created


def extract_dicom_metadata(file_bytes: bytes) -> dict:
    try:
        import pydicom
        ds = pydicom.dcmread(io.BytesIO(file_bytes), stop_before_pixels=True)
        return {
            "modality": getattr(ds, "Modality", None),
            "series_description": getattr(ds, "SeriesDescription", None),
        }
    except Exception:
        return {}


def extract_nifti_metadata(file_bytes: bytes, filename: str) -> dict:
    try:
        import nibabel as nib
        import tempfile
        suffix = ".nii.gz" if filename.endswith(".nii.gz") else ".nii"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name
        img = nib.load(tmp_path)
        shape = str(img.shape)
        os.unlink(tmp_path)
        return {"image_shape": shape}
    except Exception:
        return {}


async def extract_metadata_async(file_bytes: bytes, fname: str) -> dict:
    loop = asyncio.get_event_loop()
    lname = fname.lower()
    if lname.endswith(".dcm"):
        return await loop.run_in_executor(_executor, extract_dicom_metadata, file_bytes)
    if lname.endswith(".nii") or lname.endswith(".nii.gz"):
        return await loop.run_in_executor(_executor, extract_nifti_metadata, file_bytes, fname)
    return {}


def _upload_to_supabase(storage_path: str, data: bytes, content_type: str) -> str:
    supa = get_supabase()
    supa.storage.from_(BUCKET_NAME).upload(
        path=storage_path,
        file=data,
        file_options={"content-type": content_type, "upsert": "true"},
    )
    return storage_path


async def save_file(case_id: str, fname: str, data: bytes) -> str:
    loop = asyncio.get_event_loop()
    if USE_SUPABASE_STORAGE:
        storage_path = f"patients/{case_id}/{fname}"
        ext = fname.lower().split(".")[-1]
        mime = {"dcm": "application/dicom", "png": "image/png",
                "jpg": "image/jpeg", "jpeg": "image/jpeg"}.get(ext, "application/octet-stream")
        await loop.run_in_executor(_executor, _upload_to_supabase, storage_path, data, mime)
        return storage_path
    else:
        dest = STORAGE_ROOT / case_id / fname
        await loop.run_in_executor(_executor, dest.write_bytes, data)
        return str(dest)


# ── Main Upload Endpoint (local dev / non-Vercel) ─────────────────────────────
@app.post("/api/bulk-upload")
async def bulk_upload(
    metadata_file: UploadFile = File(...),
    images: List[UploadFile] = File(...),
):
    supa = get_supabase()

    # ── Step 1: Read Excel / CSV ───────────────────────────────────────────────
    excel_bytes = await metadata_file.read()
    df, errors = _parse_excel_bytes(excel_bytes)
    if df is None:
        _raise_if_unreadable(excel_bytes, errors)

    excel_map, validation_errors, df = _build_excel_map(df)

    if validation_errors and not excel_map:
        raise HTTPException(status_code=422, detail={"validation_errors": validation_errors})

    # ── Step 2: Upsert Patients ────────────────────────────────────────────────
    patients_created = _upsert_patients(supa, excel_map)

    # ── Steps 3–5: Process uploaded images ────────────────────────────────────
    images_uploaded = 0
    upload_errors: List[str] = []

    # Map by bare filename for exact file matches
    uploaded_map = {Path(uf.filename).name: uf for uf in images}

    # Map by folder name → list of UploadFiles inside it.
    # Browser sends webkitRelativePath as filename e.g. "fake_ct_dicom/done/slice_1.dcm"
    # Index by top-level folder (all files recursively) AND immediate parent folder.
    folder_map: dict = {}
    for uf in images:
        parts = Path(uf.filename.replace("\\", "/")).parts
        if len(parts) >= 2:
            top_folder = parts[0].rstrip("/")
            parent_folder = parts[-2].rstrip("/")
            folder_map.setdefault(top_folder, []).append(uf)
            if parent_folder != top_folder:
                folder_map.setdefault(parent_folder, []).append(uf)

    # Build a flat list of (real_filename, patient_meta, upload_file) to process.
    # Using a list avoids basename collisions when multiple patients have files
    # with the same name (e.g. done/slice_1.dcm vs root/slice_1.dcm).
    to_process: List[tuple] = []
    missing_images: List[str] = []

    for excel_entry, meta in excel_map.items():
        folder_key = excel_entry.rstrip("/")
        if folder_key in folder_map:
            # Folder reference → expand to every file inside
            for uf in folder_map[folder_key]:
                real_name = Path(uf.filename).name
                if allowed_file(real_name):
                    to_process.append((real_name, meta, uf))
        elif excel_entry in uploaded_map:
            to_process.append((excel_entry, meta, uploaded_map[excel_entry]))
        else:
            missing_images.append(excel_entry)

    if not USE_SUPABASE_STORAGE:
        seen_dirs: set = set()
        for _, meta, _ in to_process:
            cid = meta["case_id"]
            if cid not in seen_dirs:
                (STORAGE_ROOT / cid).mkdir(parents=True, exist_ok=True)
                seen_dirs.add(cid)

    raw_bytes_list = await asyncio.gather(*[uf.read() for _, _, uf in to_process])

    async def process_one(fname: str, meta: dict, file_bytes: bytes):
        cid = meta["case_id"]
        lname = fname.lower()
        suffix = ".nii.gz" if lname.endswith(".nii.gz") else Path(lname).suffix
        try:
            save_task = save_file(cid, fname, file_bytes)
            meta_task = extract_metadata_async(file_bytes, fname)
            saved_path, extra = await asyncio.gather(save_task, meta_task)
            return ("ok", fname, cid, saved_path, suffix,
                    round(len(file_bytes) / 1024, 2), extra)
        except Exception as e:
            return ("err", fname, cid, suffix, str(e))

    results = await asyncio.gather(*[
        process_one(fname, meta, data)
        for (fname, meta, _), data in zip(to_process, raw_bytes_list)
    ])

    for result in results:
        if result[0] == "ok":
            _, fname, cid, dest_path, suffix, size_kb, extra = result
            # Delete existing record for this image then insert fresh
            supa.table("image_files").delete().eq("case_id", cid).eq("image_name", fname).execute()
            supa.table("image_files").insert({
                "case_id": cid,
                "image_name": fname,
                "file_path": dest_path,
                "file_type": suffix,
                "file_size": size_kb,
                "modality": extra.get("modality"),
                "series_description": extra.get("series_description"),
                "image_shape": extra.get("image_shape"),
                "upload_status": "success",
            }).execute()
            images_uploaded += 1
        else:
            _, fname, cid, suffix, err_msg = result
            upload_errors.append(f"{fname}: {err_msg}")
            supa.table("image_files").insert({
                "case_id": cid,
                "image_name": fname,
                "file_path": "",
                "file_type": suffix,
                "upload_status": "failed",
                "error_message": err_msg,
            }).execute()

    return {
        "status": "completed",
        "summary": {
            "total_excel_rows": len(df),
            "patients_created": patients_created,
            "images_uploaded": images_uploaded,
            "missing_images": len(missing_images),
            "errors": len(upload_errors),
        },
        "missing_images": missing_images,
        "upload_errors": upload_errors,
        "validation_errors": validation_errors,
    }


# ── Direct-upload endpoints (Vercel / large-file path) ────────────────────────
#
# Phase 1: client sends Excel + a JSON list of filenames.
#   Server parses metadata, creates patients, and returns per-file Supabase
#   signed upload URLs.  No image bytes travel through the serverless function.
#
# Phase 2: client uploads each file directly to Supabase using those URLs,
#   then POSTs a small JSON manifest so the server can record them in the DB.

class _UploadRecord(BaseModel):
    case_id: str
    real_name: str
    storage_path: str
    size_kb: float

class _FinalizePayload(BaseModel):
    uploads: List[_UploadRecord]
    validation_errors: List[str] = []
    missing_images: List[str] = []
    patients_created: int = 0
    total_excel_rows: int = 0


@app.post("/api/prepare-bulk-upload")
async def prepare_bulk_upload(
    metadata_file: UploadFile = File(...),
    filenames: str = Form(...),   # JSON-encoded list of webkitRelativePath strings
):
    """
    Parse Excel, upsert patients, generate one Supabase signed upload URL per
    matched image file.  Returns use_direct_upload=False when Supabase storage
    is not configured (local dev — fall back to /api/bulk-upload).
    """
    if not USE_SUPABASE_STORAGE:
        return {"use_direct_upload": False}

    supa = get_supabase()

    # Parse filename list
    try:
        filename_list: List[str] = json.loads(filenames)
        if not isinstance(filename_list, list):
            raise ValueError
    except Exception:
        raise HTTPException(status_code=400, detail="filenames must be a JSON array of strings")

    # Parse Excel
    excel_bytes = await metadata_file.read()
    df, errors = _parse_excel_bytes(excel_bytes)
    if df is None:
        _raise_if_unreadable(excel_bytes, errors)

    excel_map, validation_errors, df = _build_excel_map(df)
    if validation_errors and not excel_map:
        raise HTTPException(status_code=422, detail={"validation_errors": validation_errors})

    # Upsert patients
    patients_created = _upsert_patients(supa, excel_map)

    # Build lookup structures (same logic as bulk_upload but over filename strings)
    uploaded_map = {Path(fn).name: fn for fn in filename_list}
    folder_map: Dict[str, List[str]] = {}
    for fn in filename_list:
        parts = Path(fn.replace("\\", "/")).parts
        if len(parts) >= 2:
            top_folder = parts[0].rstrip("/")
            parent_folder = parts[-2].rstrip("/")
            folder_map.setdefault(top_folder, []).append(fn)
            if parent_folder != top_folder:
                folder_map.setdefault(parent_folder, []).append(fn)

    to_process: List[tuple] = []   # (real_name, original_fn, meta)
    missing_images: List[str] = []
    for excel_entry, meta in excel_map.items():
        folder_key = excel_entry.rstrip("/")
        if folder_key in folder_map:
            for fn in folder_map[folder_key]:
                real_name = Path(fn).name
                if allowed_file(real_name):
                    to_process.append((real_name, fn, meta))
        elif excel_entry in uploaded_map:
            fn = uploaded_map[excel_entry]
            to_process.append((excel_entry, fn, meta))
        else:
            missing_images.append(excel_entry)

    # Generate one signed upload URL per file
    signed_urls = []
    for real_name, original_fn, meta in to_process:
        cid = meta["case_id"]
        storage_path = f"patients/{cid}/{real_name}"
        try:
            result = supa.storage.from_(BUCKET_NAME).create_signed_upload_url(storage_path)
            # supabase-py may return an object or a dict depending on version
            if hasattr(result, "signed_url"):
                upload_url = result.signed_url
            elif isinstance(result, dict):
                upload_url = result.get("signedURL") or result.get("signed_url") or result.get("url", "")
            else:
                upload_url = str(result)
            signed_urls.append({
                "filename": original_fn,
                "real_name": real_name,
                "storage_path": storage_path,
                "upload_url": upload_url,
                "case_id": cid,
            })
        except Exception as e:
            missing_images.append(f"{real_name}: signed-URL creation failed ({e})")

    return {
        "use_direct_upload": True,
        "signed_urls": signed_urls,
        "missing_images": missing_images,
        "validation_errors": validation_errors,
        "patients_created": patients_created,
        "total_excel_rows": len(df),
    }


@app.post("/api/finalize-bulk-upload")
def finalize_bulk_upload(payload: _FinalizePayload):
    """
    Record successfully uploaded files in the DB.
    Called after the client has PUT each file to its Supabase signed URL.
    """
    supa = get_supabase()
    images_uploaded = 0
    upload_errors: List[str] = []

    for rec in payload.uploads:
        lname = rec.real_name.lower()
        suffix = ".nii.gz" if lname.endswith(".nii.gz") else Path(lname).suffix
        try:
            supa.table("image_files").delete().eq("case_id", rec.case_id).eq("image_name", rec.real_name).execute()
            supa.table("image_files").insert({
                "case_id": rec.case_id,
                "image_name": rec.real_name,
                "file_path": rec.storage_path,
                "file_type": suffix,
                "file_size": rec.size_kb,
                "modality": None,
                "series_description": None,
                "image_shape": None,
                "upload_status": "success",
            }).execute()
            images_uploaded += 1
        except Exception as e:
            upload_errors.append(f"{rec.real_name}: {e}")

    return {
        "status": "completed",
        "summary": {
            "total_excel_rows": payload.total_excel_rows,
            "patients_created": payload.patients_created,
            "images_uploaded": images_uploaded,
            "missing_images": len(payload.missing_images),
            "errors": len(upload_errors),
        },
        "missing_images": payload.missing_images,
        "upload_errors": upload_errors,
        "validation_errors": payload.validation_errors,
    }


# ── Manual Add Patient ────────────────────────────────────────────────────────
@app.post("/api/patients")
async def add_patient(
    case_id: str = Form(...),
    patient_name: Optional[str] = Form(None),
    age: Optional[int] = Form(None),
    gender: Optional[str] = Form(None),
    study_date: Optional[str] = Form(None),
    images: Optional[List[UploadFile]] = File(None),
):
    supa = get_supabase()
    case_id = case_id.strip()
    if not case_id:
        raise HTTPException(status_code=400, detail="case_id is required")

    existing = supa.table("patients").select("case_id").eq("case_id", case_id).execute()
    if existing.data:
        raise HTTPException(status_code=409, detail=f"Patient with Case ID '{case_id}' already exists")

    supa.table("patients").insert({
        "case_id": case_id,
        "patient_name": patient_name or None,
        "age": age,
        "gender": gender or None,
        "study_date": study_date or None,
    }).execute()

    images_added = 0
    if images:
        if not USE_SUPABASE_STORAGE:
            (STORAGE_ROOT / case_id).mkdir(parents=True, exist_ok=True)
        for uf in images:
            if not uf.filename:
                continue
            fname = Path(uf.filename).name
            if not allowed_file(fname):
                continue
            file_bytes = await uf.read()
            lname = fname.lower()
            suffix = ".nii.gz" if lname.endswith(".nii.gz") else Path(lname).suffix
            size_kb = round(len(file_bytes) / 1024, 2)
            extra, dest_path = {}, ""
            try:
                extra = await extract_metadata_async(file_bytes, fname)
                dest_path = await save_file(case_id, fname, file_bytes)
            except Exception:
                pass
            supa.table("image_files").insert({
                "case_id": case_id,
                "image_name": fname,
                "file_path": dest_path,
                "file_type": suffix,
                "file_size": size_kb,
                "modality": extra.get("modality"),
                "series_description": extra.get("series_description"),
                "image_shape": extra.get("image_shape"),
                "upload_status": "success",
            }).execute()
            images_added += 1

    return {"status": "created", "case_id": case_id, "images_added": images_added}


# ── Read Endpoints ─────────────────────────────────────────────────────────────
@app.get("/api/patients")
def list_patients(skip: int = 0, limit: int = 100):
    supa = get_supabase()
    patients = supa.table("patients").select("*, image_files(id)").range(skip, skip + limit - 1).execute()
    return [
        {
            "id": p.get("id"),
            "case_id": p["case_id"],
            "patient_name": p.get("patient_name"),
            "age": p.get("age"),
            "gender": p.get("gender"),
            "study_date": p.get("study_date"),
            "image_count": len(p.get("image_files") or []),
            "created_at": p.get("created_at"),
        }
        for p in (patients.data or [])
    ]


@app.get("/api/patients/{case_id}")
def get_patient(case_id: str):
    supa = get_supabase()
    result = supa.table("patients").select("*, image_files(*)").eq("case_id", case_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Patient not found")
    p = result.data[0]
    return {
        "case_id": p["case_id"],
        "patient_name": p.get("patient_name"),
        "age": p.get("age"),
        "gender": p.get("gender"),
        "study_date": p.get("study_date"),
        "created_at": p.get("created_at"),
        "images": [
            {
                "image_name": img["image_name"],
                "file_type": img.get("file_type"),
                "file_size_kb": img.get("file_size"),
                "modality": img.get("modality"),
                "series_description": img.get("series_description"),
                "image_shape": img.get("image_shape"),
                "upload_status": img.get("upload_status"),
                "uploaded_at": img.get("uploaded_at"),
            }
            for img in (p.get("image_files") or [])
        ],
    }


@app.put("/api/patients/{case_id}")
async def update_patient(
    case_id: str,
    patient_name: Optional[str] = Form(None),
    age: Optional[int] = Form(None),
    gender: Optional[str] = Form(None),
    study_date: Optional[str] = Form(None),
    images: Optional[List[UploadFile]] = File(None),
):
    supa = get_supabase()
    existing = supa.table("patients").select("case_id").eq("case_id", case_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Patient not found")

    # Build update dict with only provided fields
    update_data = {}
    if patient_name is not None:
        update_data["patient_name"] = patient_name
    if age is not None:
        update_data["age"] = age
    if gender is not None:
        update_data["gender"] = gender
    if study_date is not None:
        update_data["study_date"] = study_date

    if update_data:
        supa.table("patients").update(update_data).eq("case_id", case_id).execute()

    images_added = 0
    images_replaced = 0
    if images:
        if not USE_SUPABASE_STORAGE:
            (STORAGE_ROOT / case_id).mkdir(parents=True, exist_ok=True)

        for uf in images:
            if not uf.filename:
                continue
            fname = Path(uf.filename).name
            if not allowed_file(fname):
                continue

            file_bytes = await uf.read()
            lname = fname.lower()
            suffix = ".nii.gz" if lname.endswith(".nii.gz") else Path(lname).suffix
            size_kb = round(len(file_bytes) / 1024, 2)

            existing_img = supa.table("image_files").select("id").eq("case_id", case_id).eq("image_name", fname).execute()
            extra, dest_path = {}, ""
            try:
                extra = await extract_metadata_async(file_bytes, fname)
                dest_path = await save_file(case_id, fname, file_bytes)
            except Exception:
                pass

            if existing_img.data:
                supa.table("image_files").update({
                    "file_path": dest_path,
                    "file_size": size_kb,
                    "modality": extra.get("modality"),
                    "series_description": extra.get("series_description"),
                    "image_shape": extra.get("image_shape"),
                    "upload_status": "success",
                    "error_message": None,
                    "uploaded_at": datetime.utcnow().isoformat(),
                }).eq("case_id", case_id).eq("image_name", fname).execute()
                images_replaced += 1
            else:
                supa.table("image_files").insert({
                    "case_id": case_id,
                    "image_name": fname,
                    "file_path": dest_path,
                    "file_type": suffix,
                    "file_size": size_kb,
                    "modality": extra.get("modality"),
                    "series_description": extra.get("series_description"),
                    "image_shape": extra.get("image_shape"),
                    "upload_status": "success",
                }).execute()
                images_added += 1

    return {
        "status": "updated",
        "case_id": case_id,
        "images_added": images_added,
        "images_replaced": images_replaced,
    }


@app.delete("/api/patients/{case_id}/images")
def delete_all_images(case_id: str):
    supa = get_supabase()
    files = supa.table("image_files").select("file_path").eq("case_id", case_id).execute()
    if not files.data:
        return {"status": "ok", "deleted": 0}
    # Remove files from storage
    if USE_SUPABASE_STORAGE:
        try:
            paths = [f["file_path"] for f in files.data if f.get("file_path")]
            if paths:
                supa.storage.from_(BUCKET_NAME).remove(paths)
        except Exception:
            pass
    else:
        for f in files.data:
            fp = f.get("file_path", "")
            if fp and Path(fp).exists():
                Path(fp).unlink()
    supa.table("image_files").delete().eq("case_id", case_id).execute()
    return {"status": "ok", "deleted": len(files.data)}


@app.delete("/api/patients/{case_id}/images/{image_name}")
def delete_image(case_id: str, image_name: str):
    supa = get_supabase()
    img = supa.table("image_files").select("file_path").eq("case_id", case_id).eq("image_name", image_name).execute()
    if not img.data:
        raise HTTPException(status_code=404, detail="Image not found")
    file_path = img.data[0].get("file_path", "")
    # Remove from storage
    if file_path:
        if USE_SUPABASE_STORAGE:
            try:
                supa.storage.from_(BUCKET_NAME).remove([file_path])
            except Exception:
                pass
        elif Path(file_path).exists():
            Path(file_path).unlink()
    supa.table("image_files").delete().eq("case_id", case_id).eq("image_name", image_name).execute()
    return {"status": "deleted", "image_name": image_name}


@app.delete("/api/patients/{case_id}")
def delete_patient(case_id: str):
    supa = get_supabase()
    p = supa.table("patients").select("case_id").eq("case_id", case_id).execute()
    if not p.data:
        raise HTTPException(status_code=404, detail="Patient not found")
    # Remove files from storage
    if USE_SUPABASE_STORAGE:
        try:
            files = supa.storage.from_(BUCKET_NAME).list(f"patients/{case_id}")
            if files:
                paths = [f"patients/{case_id}/{f['name']}" for f in files]
                supa.storage.from_(BUCKET_NAME).remove(paths)
        except Exception:
            pass
    else:
        patient_dir = STORAGE_ROOT / case_id
        if patient_dir.exists():
            shutil.rmtree(patient_dir)
    # ON DELETE CASCADE handles image_files
    supa.table("patients").delete().eq("case_id", case_id).execute()
    return {"status": "deleted", "case_id": case_id}


@app.get("/api/stats")
def get_stats():
    supa = get_supabase()
    total_patients = supa.table("patients").select("id", count="exact").execute().count or 0
    total_images   = supa.table("image_files").select("id", count="exact").execute().count or 0
    success_images = supa.table("image_files").select("id", count="exact").eq("upload_status", "success").execute().count or 0
    failed_images  = supa.table("image_files").select("id", count="exact").eq("upload_status", "failed").execute().count or 0
    return {
        "total_patients": total_patients,
        "total_images": total_images,
        "successful_uploads": success_images,
        "failed_uploads": failed_images,
    }
