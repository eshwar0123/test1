"""
Radiologist Report QC service.

Wraps backend/qc/report_qc_tool.py — a standalone Python QC validator.
Builds the JSON payload from radiology_schema.reports + rad_scans rows,
runs the script as a subprocess, parses the JSON output, and persists
the resulting status into rad_scans.qc_status.
"""

import json
import os
import subprocess
import sys
import tempfile
from typing import Any, Dict, Optional
from uuid import UUID

from . import crud


# Resolve backend/qc/report_qc_tool.py from this file's location.
_QC_SCRIPT_PATH = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "qc", "report_qc_tool.py")
)


def _format_dt(iso: Optional[str], with_time: bool = False) -> str:
    if not iso:
        return ""
    # iso looks like "2025-09-10T11:26:18+00:00" or "2025-09-10"
    date_part, _, rest = iso.partition("T")
    if not with_time:
        return date_part
    if not rest:
        return date_part
    time_part = rest.split("+")[0].split(".")[0]
    hh_mm = ":".join(time_part.split(":")[:2])
    return f"{date_part} {hh_mm}"


def _build_radiologist_label(name: Optional[str], qualification: Optional[str]) -> str:
    parts = [(name or "").strip(), (qualification or "").strip()]
    return " ".join(p for p in parts if p)


def _build_payload(report: Dict[str, Any]) -> Dict[str, str]:
    """Map merged report+scan row to QC field names."""
    body_part = (report.get("modality_study_type") or "").strip() or "general"
    return {
        "patientId": report.get("case_id") or "",
        "patientName": report.get("patient_name") or "",
        "age": str(report.get("patient_age") or "").strip(),
        "sex": (report.get("patient_sex") or "").strip(),
        "studyDate": _format_dt(report.get("scan_date")),
        "modality": (report.get("scan_type") or "").strip(),
        "bodyPart": body_part,
        "clinicalIndication": (report.get("clinical_indication") or "").strip(),
        "technique": (report.get("technique") or "").strip(),
        "findings": (report.get("findings") or "").strip(),
        "impression": (report.get("impression") or "").strip(),
        "recommendation": (report.get("opinions") or "").strip(),
        "radiologistName": _build_radiologist_label(
            report.get("radiologist_name"), report.get("qualification")
        ),
        "eSigned": "yes",  # Submit implies sign-off
        "reportDate": _format_dt(report.get("updated_at"), with_time=True),
        "referringDoctor": (report.get("referring_doctor") or "").strip(),
    }


def _run_subprocess(payload: Dict[str, str]) -> Dict[str, Any]:
    """Write payload to a temp file and run the QC script with --json --file."""
    if not os.path.exists(_QC_SCRIPT_PATH):
        raise FileNotFoundError(f"QC script not found: {_QC_SCRIPT_PATH}")

    fd, tmp = tempfile.mkstemp(prefix="qc_", suffix=".json")
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(payload, f)

        proc = subprocess.run(
            [sys.executable, _QC_SCRIPT_PATH, "--json", "--file", tmp],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if proc.returncode != 0:
            raise RuntimeError(
                f"QC script exited with {proc.returncode}: {proc.stderr.strip()}"
            )
        try:
            return json.loads(proc.stdout)
        except json.JSONDecodeError as e:
            raise RuntimeError(f"QC script produced invalid JSON: {e}") from e
    finally:
        try:
            os.remove(tmp)
        except OSError:
            pass


def run_report_qc(conn, case_id: str, user_id: UUID) -> Dict[str, Any]:
    """
    Public entry point. Loads the report, runs QC, persists qc_status, returns
    the parsed QC result (status/errors/warnings/checks).
    """
    report = crud.get_report_with_scan_for_qc(conn, case_id, user_id)
    if not report:
        raise ValueError("Report not found for QC")

    payload = _build_payload(report)
    result = _run_subprocess(payload)

    status = result.get("status") or "fail"
    if status not in ("pass", "warn", "fail"):
        status = "fail"

    crud.update_qc_status(conn, case_id, user_id, status)
    return result
