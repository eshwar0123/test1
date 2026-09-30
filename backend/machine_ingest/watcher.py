"""
backend/machine_ingest/watcher.py

Polls S3 under uploads/Clients/<ClientFolder>/<CaseFolder>/... for new MRI
cases the machine has uploaded directly (no human upload form involved),
extracts DICOM metadata, and feeds them through the SAME insert pipeline the
manual organization upload flow uses (qc/crud.py + qc/engine.py) so machine
cases end up identical to human-uploaded ones in every dashboard, worklist,
and the DICOM viewer.

Does not touch anything the manual flow (organization/router.py, qc/runner.py)
already does — this is a parallel, additive entry point into the same
downstream tables (organization_schema.bulk_uploads, radiology_schema.rad_scans).
radiology_schema.reports is deliberately never written here: it's created
lazily the first time a radiologist opens the case (radiologist/crud.py:
get_or_create_report), same as every other upload path in this app.

scan_once() is safe to call repeatedly (scheduler.py runs it on a timer) and
never raises — a bad case is logged and skipped, never crashes the poller.
"""
import os
import posixpath
import shutil
import tempfile
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Any, Dict, List, Tuple

import pydicom

from database import get_conn
from s3_storage import s3, S3_BUCKET, S3_PREFIX
from qc import engine, crud as qc_crud

from . import crud
from .dicom_meta import extract_case_metadata
from .multiframe import expand_to_single_frames, is_image, is_multiframe, safe_stem, save_dicom

CLIENTS_PREFIX = f"{S3_PREFIX}/Clients/"

# A case is only processed once no new file has landed in its folder for this
# long — the MRI machine may still be mid-upload when a poll tick fires.
STABILITY_SECONDS = int(os.getenv("S3_INGEST_STABILITY_SECONDS", "120"))

# Same target directory qc/runner.py's THUMB_DIR points at (both this file and
# qc/runner.py live one level under backend/) — worklist thumbnails look the
# same regardless of which pipeline generated them.
THUMB_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                          "radiologist", "uploads", "thumbnails")


def common_folder_prefix(keys: List[str]) -> str:
    """Deepest S3 folder containing every key, returned as 'a/b/c/'."""
    dirs = [posixpath.dirname(k) for k in keys]
    return posixpath.commonpath(dirs) + "/"


def load_dicom_entries(s3_prefix: str, keys: List[str], tmp_dir: str) -> Tuple[int, List[Tuple[str, str, Any]]]:
    """Download a case's files and keep the ones that are DICOM by content, not
    extension (MRI exports commonly have none). Returns (downloaded_count,
    [(s3_key, local_name, pydicom Dataset)]). Local names get '.dcm' appended
    when missing so qc/engine.py's extension-based dispatch recognises them."""
    downloaded: List[Tuple[str, str, str]] = []
    for key in sorted(keys):
        local_name = key[len(s3_prefix):].replace("/", "__")
        local_path = os.path.join(tmp_dir, local_name)
        try:
            s3.download_file(S3_BUCKET, key, local_path)
        except Exception as e:
            print(f"[s3-ingest] download failed for {key}: {e}")
            continue
        downloaded.append((key, local_name, local_path))

    entries: List[Tuple[str, str, Any]] = []
    for key, local_name, local_path in downloaded:
        try:
            ds = pydicom.dcmread(local_path, force=True)
            _ = ds.Modality  # cheap sanity check this is a real DICOM dataset
        except Exception:
            continue
        used_name = local_name
        if not local_name.lower().endswith((".dcm", ".dicom", ".ima")):
            used_name = local_name + ".dcm"
            os.replace(local_path, os.path.join(tmp_dir, used_name))
        entries.append((key, used_name, ds))
    return len(downloaded), entries


def normalize_for_viewer(case_id: str, tmp_dir: str, image_entries: List[Tuple[str, str, Any]]):
    """Upload the case's images to uploads/dicom/<case_id>/ as one file per
    slice (splitting multi-frame files; single-frame files are copied, and
    transcoded if compressed, exactly as the manual flow does). Returns
    (s3_key_of_first_file, file_names) or None if nothing could be produced.
    Raises if an upload fails, so the case is recorded as an error rather
    than left half-converted."""
    from s3_storage import build_key, upload_local_file

    out_dir = os.path.join(tmp_dir, "_normalized")
    os.makedirs(out_dir, exist_ok=True)

    files: List[Tuple[str, str]] = []  # (upload_name, local_path)
    for _key, local_name, ds in image_entries:
        stem = safe_stem(os.path.splitext(local_name)[0])
        src = os.path.join(tmp_dir, local_name)
        if is_multiframe(ds):
            try:
                frames = expand_to_single_frames(ds, stem)
            except Exception as e:
                print(f"[s3-ingest] {case_id}: cannot split multi-frame {local_name}: {e}")
                continue
            for name, frame_ds in frames:
                path = os.path.join(out_dir, name)
                save_dicom(frame_ds, path)
                files.append((name, path))
        else:
            try:
                from dicom_transcode import transcode_dicom_if_compressed
                transcode_dicom_if_compressed(src)
            except Exception as e:
                print(f"[s3-ingest] {case_id}: transcode check failed for {local_name}: {e}")
            files.append((f"{stem}.dcm", src))

    if not files:
        return None
    files.sort()
    keys = [build_key("dicom", case_id, name) for name, _ in files]
    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(lambda pair: upload_local_file(pair[1][1], pair[0]), zip(keys, files)))
    print(f"[s3-ingest] {case_id}: uploaded {len(keys)} slice files to {posixpath.dirname(keys[0])}/")
    return keys[0], [name for name, _ in files]


def _list_case_groups() -> Dict[Tuple[str, str], Dict[str, Any]]:
    """Group every object under uploads/Clients/ by (client_folder,
    case_folder) — the first two path segments after the Clients/ prefix.
    Nested subfolders under a case folder (e.g. separate series folders)
    are flattened into the same case, since they all share the same
    (client_folder, case_folder) key."""
    groups: Dict[Tuple[str, str], Dict[str, Any]] = {}
    paginator = s3.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=S3_BUCKET, Prefix=CLIENTS_PREFIX):
        for obj in page.get("Contents", []):
            key = obj["Key"]
            if key.endswith("/"):
                continue  # zero-byte "folder" placeholder object
            rel = key[len(CLIENTS_PREFIX):]
            parts = rel.split("/")
            if len(parts) < 3 or not parts[0] or not parts[1]:
                continue  # file sits directly under the client folder, not inside a case subfolder
            gkey = (parts[0], parts[1])
            g = groups.setdefault(gkey, {"keys": [], "last_modified": obj["LastModified"]})
            g["keys"].append(key)
            if obj["LastModified"] > g["last_modified"]:
                g["last_modified"] = obj["LastModified"]
    return groups


def scan_once() -> None:
    """One poll cycle: list S3, process every new stable case folder."""
    try:
        crud.ensure_tables()
        groups = _list_case_groups()
    except Exception:
        print("[s3-ingest] scan failed:")
        traceback.print_exc()
        return

    now = datetime.now(timezone.utc)
    for (client_folder, case_folder), info in groups.items():
        s3_prefix = f"{CLIENTS_PREFIX}{client_folder}/{case_folder}/"

        age_seconds = (now - info["last_modified"]).total_seconds()
        if age_seconds < STABILITY_SECONDS:
            continue  # still being written — re-check on the next poll

        try:
            if not crud.claim_prefix(s3_prefix, client_folder, case_folder, len(info["keys"])):
                continue  # already handled (or being handled) by a previous poll

            _process_case(client_folder, case_folder, s3_prefix, info["keys"])
        except Exception as e:
            traceback.print_exc()
            try:
                crud.mark_case(
                    s3_prefix=s3_prefix, client_folder=client_folder, case_folder=case_folder,
                    status="error", file_count=len(info["keys"]), error_message=str(e)[:1000],
                )
            except Exception:
                pass


def _process_case(client_folder: str, case_folder: str, s3_prefix: str, keys: List[str]) -> None:
    tmp_dir = tempfile.mkdtemp(prefix="s3ingest_")
    try:
        downloaded_count, dicom_entries = load_dicom_entries(s3_prefix, keys, tmp_dir)

        if not downloaded_count:
            crud.mark_case(s3_prefix=s3_prefix, client_folder=client_folder, case_folder=case_folder,
                            status="empty", file_count=0, error_message="No files could be downloaded from S3")
            return

        if not dicom_entries:
            crud.mark_case(s3_prefix=s3_prefix, client_folder=client_folder, case_folder=case_folder,
                            status="empty", file_count=downloaded_count,
                            error_message="No readable DICOM files found in this folder")
            return

        # Scanners also send presentation states, raw data and reports — DICOM
        # objects with no pixels. They aren't images: keep them out of QC (they
        # would always "fail" the pixel check), thumbnails and the viewer.
        image_entries = [e for e in dicom_entries if is_image(e[2])]
        if not image_entries:
            crud.mark_case(s3_prefix=s3_prefix, client_folder=client_folder, case_folder=case_folder,
                            status="empty", file_count=len(dicom_entries),
                            error_message="Only non-image DICOM found (presentation states / raw data)")
            return

        org = crud.resolve_org_for_folder(client_folder)
        if not org:
            crud.mark_case(
                s3_prefix=s3_prefix, client_folder=client_folder, case_folder=case_folder,
                status="unmatched_org", file_count=len(dicom_entries),
                error_message=(
                    f"No organization matched S3 folder '{client_folder}'. Add a row to "
                    f"organization_schema.s3_org_folder_map (folder_name='{client_folder}', "
                    f"org_id=<org's GENRAD-ORG-id>) to fix, then it will be picked up on the next poll "
                    f"— this folder is not retried automatically."
                ),
            )
            print(f"[s3-ingest] no org match for client folder '{client_folder}' — case left unprocessed")
            return

        _primary_key, _primary_local_name, primary_ds = image_entries[0]
        meta = extract_case_metadata(primary_ds)

        # Both viewers derive the case's file list from s3_key's parent folder
        # and list it recursively. Scanners nest each series in its own folder,
        # so store the deepest folder common to ALL image files (as a "folder/"
        # prefix) instead of one file's key — otherwise only one series loads.
        # (Replaced below if the case needs multi-frame splitting.)
        case_s3_key = common_folder_prefix([k for k, _, _ in image_entries])

        from organization.router import _gen_case_id  # lazy: avoid importing the router at module load
        case_id = _gen_case_id()
        upload_id = str(uuid.uuid4())
        user_id = org.get("user_id")

        case_meta = {
            "upload_id": upload_id,
            "user_id": user_id,
            "email": org.get("email"),
            "org_id": org.get("org_id"),
            "org_name": org.get("org_name"),
            "excel_path": None,
            "case_id": case_id,
            "subject_id": meta.get("patient_id") or case_folder,
            "patient_name": meta.get("patient_name"),
            "age": meta.get("age"),
            "gender": meta.get("gender"),
            "study_date_str": meta.get("study_date_str"),
            "study_datetime_str": meta.get("study_datetime_str"),
            "image_file_names": [key[len(s3_prefix):] for key, _, _ in image_entries],
            "images_dir": s3_prefix,
            "priority_text": "Routine",
            "modality_text": meta.get("modality_text"),
            "study_type_text": meta.get("study_type_text"),
            "referring_doctor": meta.get("referring_doctor"),
        }
        local_names = [name for _, name, _ in image_entries]

        thumb_filename = None
        try:
            thumb_filename = engine.generate_case_thumbnail(
                image_dir=tmp_dir, filenames=local_names,
                output_folder=THUMB_DIR, base_name=case_id,
            )
        except Exception as e:
            print(f"[s3-ingest] thumbnail generation failed for {case_id}: {e}")

        per_file = []
        for local_name in local_names:
            fpath = os.path.join(tmp_dir, local_name)
            try:
                result = engine.run_file_qc(fpath)
            except Exception as e:
                result = {"overall": "error", "reason": f"QC crashed: {e}", "checks": [],
                          "meta": {"type": "crash", "size": 0, "modality": ""}}
            per_file.append({"file_name": local_name, **result})
        rollup = engine.roll_up_case(per_file)
        if rollup["status"] == "error":
            rollup["status"] = "warn"  # TEMP HOLD (2026-09-30): show as warning, not hard-blocked -- revert when told to "revoke"

        # QC gating IS enforced here (unlike the manual pipeline, where it's
        # currently disabled) — an MRI machine case has no human curator to
        # notice/fix a bad upload, so a case that fails QC across every file
        # is blocked from reaching a radiologist and instead surfaced as a
        # flag on the organization's dashboard (qc/dashboard-summary reads
        # organization_schema.returned_cases). A partial 'warn' verdict still
        # flows through — it already shows up there too (bulk_uploads rows
        # with qc_status='warn').
        if rollup["status"] == "error":
            for pf in per_file:
                qc_crud.insert_qc_file_result(
                    upload_row_id=None, upload_id=upload_id, case_id=case_id,
                    user_id=str(user_id or ""), file_name=pf["file_name"],
                    status=pf["overall"], reason=pf["reason"], checks=pf["checks"],
                )
            qc_crud.insert_returned_case_from_meta(case_meta=case_meta, reason=rollup["reason"][:1000])
            crud.mark_case(s3_prefix=s3_prefix, client_folder=client_folder, case_folder=case_folder,
                            status="qc_failed", case_id=case_id, org_id=org.get("org_id"),
                            file_count=len(image_entries), error_message=rollup["reason"][:1000])
            print(f"[s3-ingest] {case_id}: QC failed, flagged on org dashboard — {rollup['reason'][:200]}")
            return

        # Enhanced multi-frame files (one file = a whole series) can't be shown
        # by the viewer, which counts one file as one slice. Split them into
        # one file per slice under uploads/dicom/<case_id>/ — the same flat
        # layout the manual flow's cases use. The machine's originals stay put.
        # Also done when the folder holds non-image DICOM (presentation states,
        # raw data): the viewer lists every .dcm it finds and shows each of
        # those as an empty series that fails to load.
        if any(is_multiframe(ds) for _, _, ds in image_entries) or len(image_entries) < len(dicom_entries):
            normalized = normalize_for_viewer(case_id, tmp_dir, image_entries)
            if normalized:
                case_s3_key, case_meta["image_file_names"] = normalized
            else:
                print(f"[s3-ingest] {case_id}: multi-frame split produced no files; viewing originals in place")

        row_id = qc_crud.insert_bulk_upload_after_qc(
            case_meta=case_meta, qc_status=rollup["status"], qc_summary=rollup["reason"][:500],
        )
        for pf in per_file:
            qc_crud.insert_qc_file_result(
                upload_row_id=row_id, upload_id=upload_id, case_id=case_id,
                user_id=str(user_id or ""), file_name=pf["file_name"],
                status=pf["overall"], reason=pf["reason"], checks=pf["checks"],
            )

        if row_id:
            row = qc_crud._one("SELECT * FROM organization_schema.bulk_uploads WHERE id = %s", (row_id,))
            if row:
                rad = qc_crud.find_available_radiologist()
                if rad:
                    wf_id = qc_crud.insert_case_workflow_with_rad(row, rad)
                    if wf_id:
                        qc_crud.insert_rad_scan_for_case(row, rad, thumbnail_path=thumb_filename)
                        try:
                            rad_user_id = rad.get("rad_user_id") or rad.get("user_id")
                            if rad_user_id:
                                from radiologist.router import _create_notification
                                notif_conn = get_conn()
                                try:
                                    with notif_conn.cursor() as cur:
                                        _create_notification(
                                            cur, rad_user_id, case_id,
                                            "New Case Assigned",
                                            f"Case {case_id} has been assigned to you",
                                        )
                                    notif_conn.commit()
                                finally:
                                    notif_conn.close()
                        except Exception as e:
                            print(f"[s3-ingest] notification failed: {e}")

                # Point both rows at the MRI machine's ORIGINAL S3 object —
                # files are read in place, never re-uploaded or moved.
                try:
                    conn = get_conn()
                    with conn.cursor() as cur:
                        cur.execute(
                            "UPDATE radiology_schema.rad_scans "
                            "SET s3_key=%s, s3_bucket=%s, storage_type='s3' WHERE case_id=%s",
                            (case_s3_key, S3_BUCKET, case_id),
                        )
                        cur.execute(
                            "UPDATE organization_schema.bulk_uploads "
                            "SET s3_key=%s, s3_bucket=%s, storage_type='s3' WHERE case_id=%s",
                            (case_s3_key, S3_BUCKET, case_id),
                        )
                    conn.commit()
                    conn.close()
                except Exception as e:
                    print(f"[s3-ingest] S3 key DB update failed: {e}")

        crud.mark_case(s3_prefix=s3_prefix, client_folder=client_folder, case_folder=case_folder,
                        status="processed", case_id=case_id, org_id=org.get("org_id"),
                        file_count=len(image_entries))
        print(f"[s3-ingest] processed {case_id} from {s3_prefix} ({len(image_entries)} image files)")
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)
