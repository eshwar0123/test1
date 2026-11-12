"""Re-sends the pending-case alarm every NAG_EVERY_MIN minutes until the person taps it or
opens the app (which calls /radiology/reminders/ack), up to NAG_MAX repeats. Run by cron every
minute. send_reminders.py (hourly) arms it by writing admin_schema.reminder_nag."""
import sys
import datetime as dt
import requests
from database import get_conn

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
NAG_EVERY_MIN = 0
NAG_MAX = 30               # up to 30 repeats (about 30 minutes), then wait for the next hourly reminder
QUIET_HOURS = None         # e.g. (22, 7) = no repeats from 22:00 to 07:00 India time
DRY = "--dry-run" in sys.argv


def log(m):
    print(f"{dt.datetime.now().isoformat(timespec='seconds')} [nags] {m}", flush=True)


def quiet():
    if not QUIET_HOURS:
        return False
    h = dt.datetime.now(dt.timezone(dt.timedelta(hours=5, minutes=30))).hour
    a, b = QUIET_HOURS
    return (a <= h or h < b) if a > b else (a <= h < b)


def main():
    if quiet():
        return
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT n.user_id, n.case_id, n.title, n.body, n.nag_count
                  FROM admin_schema.reminder_nag n
                 WHERE n.acked_at IS NULL
                   AND n.nag_count < %s
                   AND n.last_sent_at <= NOW() - make_interval(mins => %s)
            """, (NAG_MAX, NAG_EVERY_MIN))
            rows = cur.fetchall()
            if not rows:
                return
            msgs = []
            for uid, case_id, title, body, count in rows:
                cur.execute("SELECT push_token FROM admin_schema.push_tokens WHERE user_id::text = %s", (uid,))
                for (tok,) in cur.fetchall():
                    msgs.append({
                        "to": tok, "title": title or "Pending case reminder", "body": body or "",
                        "sound": "default", "priority": "high", "channelId": "new-cases",
                        "data": {"caseId": case_id, "type": "reminder"},
                    })
            log(f"{len(rows)} person(s) still not responded; {len(msgs)} push(es)")
            if DRY:
                return
            # One request per message: Expo rejects a whole request when its tokens belong to
            # different Expo projects (old Play app vs new build).
            for m in msgs:
                try:
                    r = requests.post(EXPO_PUSH_URL, json=m, timeout=15, headers={"Accept": "application/json", "Content-Type": "application/json"})
                    log(f"push status={r.status_code}")
                except Exception as e:
                    log(f"push failed: {e}")
            cur.execute("""
                UPDATE admin_schema.reminder_nag
                   SET last_sent_at = NOW(), nag_count = nag_count + 1
                 WHERE user_id = ANY(%s)
            """, ([r[0] for r in rows],))
        conn.commit()
    finally:
        conn.close()


if __name__ == "__main__":
    main()
