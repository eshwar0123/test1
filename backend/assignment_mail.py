# assignment_mail.py
"""Email a radiologist when cases are assigned to them.

notify_cases_assigned() is fire-and-forget: it runs in a daemon thread, never
raises, and is meant to be called AFTER the assignment transaction commits.
"""
import html
import os
import threading
from typing import Iterable

from database import get_conn
from gmail_sender import TOKEN_PATH, send_email

_MAX_ROWS = 20   # cases listed in one email; the rest are summarised as "+N more"


def _load(rad_user_id: str, case_ids: list) -> tuple:
    """Return (email, first_name, rows) where rows = one dict per case."""
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT u.email, r.first_name
                  FROM core_schema.users u
                  LEFT JOIN radiology_schema.radiologists r ON r.user_id = u.user_id
                 WHERE u.user_id = %s
                 LIMIT 1
                """,
                (str(rad_user_id),),
            )
            u = cur.fetchone()
            if not u or not u[0]:
                return None, None, []

            cur.execute(
                """
                SELECT DISTINCT ON (cw.case_id)
                       cw.case_id,
                       COALESCE(NULLIF(cw.organization_name, ''),
                                (SELECT op.org_name FROM organization_schema.org_profile op
                                  WHERE op.org_id = cw.org_id LIMIT 1), '')      AS org_name,
                       COALESCE(NULLIF(cw.modality_type, ''), rs.scan_type, '')  AS modality,
                       COALESCE(NULLIF(cw.modality_study_type, ''),
                                rs.modality_study_type, '')                      AS study_type,
                       COALESCE(NULLIF(cw.priority_type, ''), rs.priority_type, 'Routine') AS priority
                  FROM admin_schema.case_workflow cw
                  LEFT JOIN radiology_schema.rad_scans rs ON rs.case_id = cw.case_id
                 WHERE cw.case_id = ANY(%s)
                 ORDER BY cw.case_id, cw.created_at DESC NULLS LAST
                """,
                (list(case_ids),),
            )
            rows = [
                {"case_id": r[0], "org": r[1], "modality": r[2],
                 "study_type": r[3], "priority": r[4]}
                for r in cur.fetchall()
            ]
            return u[0], u[1], rows
    finally:
        conn.close()


def _build(first_name: str, rows: list) -> tuple:
    e = lambda v: html.escape(str(v or "—"))
    orgs = sorted({r["org"] for r in rows if r["org"]})
    from_org = orgs[0] if len(orgs) == 1 else "your organizations"

    if len(rows) == 1:
        r = rows[0]
        subject = f"New case assigned: {r['modality'] or 'Study'} {r['study_type']}".strip()
    else:
        subject = f"{len(rows)} new cases assigned to you"

    body_rows = "".join(
        f"<tr><td>{e(r['case_id'])}</td><td>{e(r['org'])}</td><td>{e(r['modality'])}</td>"
        f"<td>{e(r['study_type'])}</td><td>{e(r['priority'])}</td></tr>"
        for r in rows[:_MAX_ROWS]
    )
    more = (f"<p>…and {len(rows) - _MAX_ROWS} more.</p>" if len(rows) > _MAX_ROWS else "")
    body = (
        f"<p>Hello {e(first_name) if first_name else 'Doctor'},</p>"
        f"<p>{'A new case has' if len(rows) == 1 else 'New cases have'} been assigned to you "
        f"by <b>{e(from_org)}</b>.</p>"
        "<table border='1' cellpadding='6' cellspacing='0' style='border-collapse:collapse'>"
        "<tr><th>Case ID</th><th>Organization</th><th>Modality</th><th>Study type</th><th>Priority</th></tr>"
        f"{body_rows}</table>{more}"
        "<p>Please log in to Onix AI to review.</p>"
    )
    return subject, body


def _send(rad_user_id: str, case_ids: list) -> None:
    try:
        # send_email() would start an interactive OAuth flow without a token.
        if not os.path.exists(TOKEN_PATH):
            print("[assignment_mail] skipped: Gmail token.json not found")
            return
        email, first_name, rows = _load(rad_user_id, case_ids)
        if not email or not rows:
            print(f"[assignment_mail] skipped: no email/cases for rad_user_id={rad_user_id}")
            return
        subject, body = _build(first_name, rows)
        send_email(email, subject, body)
    except Exception as err:
        print(f"[assignment_mail] failed for rad_user_id={rad_user_id}: {err}")


def notify_cases_assigned(rad_user_id, case_ids: Iterable[str]) -> None:
    """Email the radiologist one message listing the newly assigned cases."""
    case_ids = [c for c in case_ids if c]
    if not rad_user_id or not case_ids:
        return
    threading.Thread(
        target=_send, args=(str(rad_user_id), case_ids), daemon=True
    ).start()
