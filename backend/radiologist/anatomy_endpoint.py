"""
anatomy_endpoint.py  -- mount in your FastAPI app:

    from anatomy_endpoint import router as anatomy_router
    app.include_router(anatomy_router)

POST /api/anatomy/label
    { "study_uid": "...", "x": 12.3, "y": -45.6, "z": 78.9 }   # world LPS mm from CS3D
  ->{ "label": "vertebrae_L2", "label_id": 32, "voxel": [45,88,30] }

Volumes are loaded lazily and cached in process memory keyed by study_uid.
"""
import json
import numpy as np
import nibabel as nib
import psycopg2
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/anatomy", tags=["anatomy"])

DB = dict(host="127.0.0.1", port=5433, dbname="onix_db", user="virue")

# study_uid -> {data, inv_affine, shape, label_map, seg_path}
_CACHE = {}
_CACHE_MAX = 8          # cap loaded volumes; simple FIFO eviction


class Point(BaseModel):
    study_uid: str
    x: float
    y: float
    z: float


def _db_row(study_uid):
    conn = psycopg2.connect(**DB)
    try:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT seg_nifti_path, affine, shape, label_map
                   FROM radiology_schema.anatomy_segmentations
                   WHERE study_uid = %s""",
                (study_uid,),
            )
            return cur.fetchone()
    finally:
        conn.close()


def _load(study_uid):
    if study_uid in _CACHE:
        return _CACHE[study_uid]
    row = _db_row(study_uid)
    if not row:
        return None
    seg_path, affine, shape, label_map = row
    affine = np.asarray(affine if isinstance(affine, list) else json.loads(affine), float)
    label_map = label_map if isinstance(label_map, dict) else json.loads(label_map)
    data = np.asanyarray(nib.load(seg_path).dataobj)
    entry = dict(
        data=data,
        inv_affine=np.linalg.inv(affine),   # RAS mm -> voxel
        shape=data.shape[:3],
        label_map=label_map,
        seg_path=seg_path,
    )
    if len(_CACHE) >= _CACHE_MAX:
        _CACHE.pop(next(iter(_CACHE)))      # evict oldest
    _CACHE[study_uid] = entry
    return entry


def _voxel_from_lps(x, y, z, inv_affine):
    # Cornerstone3D world = LPS mm; NIfTI affine = RAS mm -> negate X,Y.
    ras = np.array([-x, -y, z, 1.0])
    return np.round((inv_affine @ ras)[:3]).astype(int)


@router.post("/label")
def label(p: Point):
    entry = _load(p.study_uid)
    if entry is None:
        return {"label": None, "reason": "no_segmentation"}

    vx, vy, vz = _voxel_from_lps(p.x, p.y, p.z, entry["inv_affine"])
    nx, ny, nz = entry["shape"]
    if not (0 <= vx < nx and 0 <= vy < ny and 0 <= vz < nz):
        return {"label": None, "voxel": [int(vx), int(vy), int(vz)],
                "reason": "outside_volume"}

    lid = int(entry["data"][vx, vy, vz])
    if lid == 0:
        return {"label": None, "label_id": 0, "voxel": [int(vx), int(vy), int(vz)],
                "reason": "unlabeled_region"}

    name = entry["label_map"].get(str(lid))
    return {"label": name, "label_id": lid, "voxel": [int(vx), int(vy), int(vz)]}


@router.get("/cache/clear")
def clear():
    n = len(_CACHE)
    _CACHE.clear()
    return {"cleared": n}

