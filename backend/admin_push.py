"""Alerts for admins when a new case arrives: a saved notification (shows in the app's bell
list) plus a push to every admin phone. Best-effort: runs in a background thread and never
raises, so it can't break case ingestion."""
import threading
import requests
from database import get_conn

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
TITLE = "New case received"
_recent = []  # last case ids alerted in this process - guards against duplicate alerts


def _admin_tokens(cur):
    cur.execute("""
        SELECT pt.push_token
          FROM admin_schema.push_tokens pt
          JOIN core_schema.users u ON u.user_id = pt.user_id
         WHERE lower(COALESCE(u.role, '')) = 'admin'
    """)
    return [r[0] for r in cur.fetchall()]


def _run(case_id, org_id, priority, assigned_to):
    conn = None
    try:
        conn = get_conn()
        with conn.cursor() as cur:
            org_name = ""
            if org_id:
                cur.execute(
                    "SELECT org_name FROM organization_schema.org_profile WHERE org_id = %s LIMIT 1",
                    (org_id,),
                )
                row = cur.fetchone()
                org_name = (row[0] if row else "") or ""
        parts = [case_id, org_name, (priority or "").upper() or None,
                 f"Assigned to {assigned_to}" if assigned_to else "Not assigned"]
        body = " · ".join(p for p in parts if p)

        # 1) Saved notification for every admin (the bell list in the admin app).
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO admin_schema.notifications (user_id, case_id, type, title, message)
                    SELECT u.user_id, %s, 'new_case', %s, %s
                      FROM core_schema.users u
                     WHERE lower(COALESCE(u.role, '')) = 'admin'
                """, (case_id, TITLE, body))
            conn.commit()
        except Exception as e:
            conn.rollback()
            print(f"[admin-push] saving notifications failed for {case_id}: {e}")

        # 2) Push to every admin phone that has registered.
        with conn.cursor() as cur:
            tokens = _admin_tokens(cur)
        if not tokens:
            print(f"[admin-push] no admin tokens for new case {case_id}")
            return
        msgs = [{
            "to": t, "title": TITLE, "body": body,
            "sound": "default", "priority": "high", "channelId": "new-cases",
            "data": {"caseId": case_id, "type": "new_case"},
        } for t in tokens]
        # One request per message: Expo rejects a whole request when its tokens belong to
        # different Expo projects (old Play app vs new build).
        items = []
        for m_ in msgs:
            try:
                r = requests.post(EXPO_PUSH_URL, json=m_, timeout=10, headers={"Accept": "application/json", "Content-Type": "application/json"})
                print(f"[admin-push] to={m_['to'][:26]} status={r.status_code} body={r.text[:200]}")
                items.append((r.json() or {}).get("data") or {})
            except Exception as e:
                print(f"[admin-push] send failed: {e}")
                items.append({})
        dead = [t for t, it in zip(tokens, items)
                if it.get("status") == "error"
                and (it.get("details") or {}).get("error") == "DeviceNotRegistered"]
        if dead:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM admin_schema.push_tokens WHERE push_token = ANY(%s)", (dead,))
            conn.commit()
    except Exception as e:
        print(f"[admin-push] failed for {case_id}: {e}")
    finally:
        if conn:
            conn.close()


def notify_admins_new_case(case_id, org_id=None, priority=None, assigned_to=None):
    if not case_id or case_id in _recent:
        return
    _recent.append(case_id)
    del _recent[:-200]
    threading.Thread(target=_run, args=(case_id, org_id, priority, assigned_to), daemon=True).start()
