"""Hourly reminders for cases that are assigned but not finished.

Run by cron every 5 minutes. For each case assigned >= REMIND_AFTER_HOURS ago and still not
completed, and not reminded in the last REPEAT_EVERY_HOURS, it sends:
  - one push per radiologist (their pending count), and
  - one push to every admin (total pending),
with a beep sound, via Expo push (works with the app closed). Also saves an in-app
notification for each recipient so the bell shows it.

  python send_reminders.py            -> real run
  python send_reminders.py --dry-run  -> show who would be alerted; sends/saves nothing
"""
import sys
import datetime as dt
import requests
from database import get_conn

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
REMIND_AFTER_HOURS = 1     # first reminder this long after assignment
REPEAT_EVERY_HOURS = 1     # then repeat this often until the case is completed
QUIET_HOURS = None         # e.g. (22, 7) = no reminders from 22:00 to 07:00 India time
MAX_AGE_DAYS = 7           # ignore cases assigned longer ago than this (old/stale backlog)
IDS_IN_TEXT = 3
DRY = "--dry-run" in sys.argv


def log(msg):
    print(f"{dt.datetime.now().isoformat(timespec='seconds')} [reminders] {msg}", flush=True)


def in_quiet_hours():
    if not QUIET_HOURS:
        return False
    ist = dt.datetime.now(dt.timezone(dt.timedelta(hours=5, minutes=30)))
    start, end = QUIET_HOURS
    h = ist.hour
    return (start <= h or h < end) if start > end else (start <= h < end)


def describe(case_ids):
    n = len(case_ids)
    if n == 1:
        return f"{case_ids[0]} is still pending"
    shown = ", ".join(case_ids[:IDS_IN_TEXT])
    more = f" +{n - IDS_IN_TEXT} more" if n > IDS_IN_TEXT else ""
    return f"{n} assigned cases are still pending: {shown}{more}"


def push(messages):
    # One request per message: Expo rejects a WHOLE request when its tokens belong to different
    # Expo projects (old Play app vs new build), which silenced everyone.
    for m in messages:
        try:
            r = requests.post(EXPO_PUSH_URL, json=m, timeout=15, headers={"Accept": "application/json", "Content-Type": "application/json"})
            log(f"push to {m['to'][:26]}...: {r.status_code} {r.text[:160]}")
        except Exception as e:
            log(f"push failed: {e}")


def msg(token, title, body, case_id):
    return {
        "to": token, "title": title, "body": body,
        "sound": "default", "priority": "high", "channelId": "new-cases",
        "data": {"caseId": case_id, "type": "reminder"},
    }


def main():
    if in_quiet_hours():
        log("quiet hours - skipping")
        return
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS admin_schema.case_reminders (
                    case_id TEXT PRIMARY KEY,
                    last_reminded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    reminder_count INT NOT NULL DEFAULT 1
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS admin_schema.reminder_nag (
                    user_id TEXT PRIMARY KEY,
                    case_id TEXT, title TEXT, body TEXT,
                    first_sent_at TIMESTAMPTZ, last_sent_at TIMESTAMPTZ,
                    nag_count INT NOT NULL DEFAULT 0,
                    acked_at TIMESTAMPTZ
                )
            """)
            conn.commit()
            cur.execute("""
                SELECT cw.case_id, cw.radiologist_user_id::text
                  FROM admin_schema.case_workflow cw
                  LEFT JOIN admin_schema.case_reminders cr ON cr.case_id = cw.case_id
                 WHERE lower(COALESCE(cw.assignment_status, '')) = 'assigned'
                   AND lower(COALESCE(cw.current_status, '')) <> 'completed'
                   AND cw.assigned_at IS NOT NULL
                   AND cw.assigned_at <= NOW() - make_interval(hours => %s)
                   AND cw.assigned_at >= NOW() - make_interval(days => %s)
                   AND (cr.last_reminded_at IS NULL
                        OR cr.last_reminded_at <= NOW() - make_interval(hours => %s))
                 ORDER BY cw.assigned_at
            """, (REMIND_AFTER_HOURS, MAX_AGE_DAYS, REPEAT_EVERY_HOURS))
            due = cur.fetchall()
        if not due:
            log("nothing due")
            return
        log(f"{len(due)} case(s) due for a reminder")

        by_rad = {}
        for case_id, rad_user in due:
            if rad_user:
                by_rad.setdefault(rad_user, []).append(case_id)
        all_ids = [c for c, _ in due]

        with conn.cursor() as cur:
            cur.execute("""
                SELECT u.user_id::text, pt.push_token
                  FROM core_schema.users u
                  LEFT JOIN admin_schema.push_tokens pt ON pt.user_id = u.user_id
                 WHERE lower(COALESCE(u.role, '')) = 'admin'
            """)
            admin_rows = cur.fetchall()
            cur.execute(
                "SELECT user_id::text, push_token FROM admin_schema.push_tokens WHERE user_id::text = ANY(%s)",
                (list(by_rad.keys()),),
            )
            rad_tokens = {}
            for uid, tok in cur.fetchall():
                rad_tokens.setdefault(uid, []).append(tok)

        admin_ids = sorted({a for a, _ in admin_rows})
        admin_tokens = sorted({t for _, t in admin_rows if t})
        messages, notes = [], []

        for rad_user, ids in by_rad.items():
            body = describe(ids)
            log(f"radiologist {rad_user}: {len(ids)} case(s), {len(rad_tokens.get(rad_user, []))} phone(s)")
            notes.append((rad_user, ids[0], "Pending case reminder", body))
            messages += [msg(t, "Pending case reminder", body, ids[0]) for t in rad_tokens.get(rad_user, [])]

        admin_body = f"{len(all_ids)} assigned case(s) are still pending: " + ", ".join(all_ids[:IDS_IN_TEXT]) + (
            f" +{len(all_ids) - IDS_IN_TEXT} more" if len(all_ids) > IDS_IN_TEXT else "")
        log(f"admins: {len(admin_ids)} account(s), {len(admin_tokens)} phone(s)")
        for a in admin_ids:
            notes.append((a, all_ids[0], "Pending cases reminder", admin_body))
        messages += [msg(t, "Pending cases reminder", admin_body, all_ids[0]) for t in admin_tokens]

        if DRY:
            log(f"DRY RUN - would send {len(messages)} push(es) and save {len(notes)} notification(s); nothing sent")
            return

        push(messages)
        with conn.cursor() as cur:
            for uid, case_id, title, body in notes:
                try:
                    cur.execute("SAVEPOINT n")
                    cur.execute(
                        "INSERT INTO admin_schema.notifications (user_id, case_id, type, title, message) "
                        "VALUES (%s, %s, 'reminder', %s, %s)",
                        (uid, case_id, title, body),
                    )
                except Exception as e:
                    cur.execute("ROLLBACK TO SAVEPOINT n")
                    log(f"saving notification failed: {e}")
            for uid, case_id, title, body in notes:
                cur.execute("""
                    INSERT INTO admin_schema.reminder_nag
                        (user_id, case_id, title, body, first_sent_at, last_sent_at, nag_count, acked_at)
                    VALUES (%s, %s, %s, %s, NOW(), NOW(), 0, NULL)
                    ON CONFLICT (user_id) DO UPDATE
                       SET case_id = EXCLUDED.case_id, title = EXCLUDED.title, body = EXCLUDED.body,
                           first_sent_at = NOW(), last_sent_at = NOW(), nag_count = 0, acked_at = NULL
                """, (uid, case_id, title, body))
            cur.execute("""
                INSERT INTO admin_schema.case_reminders (case_id)
                SELECT unnest(%s::text[])
                ON CONFLICT (case_id) DO UPDATE
                   SET last_reminded_at = NOW(), reminder_count = case_reminders.reminder_count + 1
            """, (all_ids,))
        conn.commit()
        log(f"done: reminded {len(all_ids)} case(s)")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
