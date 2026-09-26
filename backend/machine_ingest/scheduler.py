"""
backend/machine_ingest/scheduler.py

Starts a background poller that calls watcher.scan_once() every
S3_INGEST_INTERVAL_MINUTES (default 12, i.e. within the 10-15 min window).
Wired into main.py's FastAPI startup event — additive only, nothing in the
existing app changes if this fails to start (see the try/except at the call
site in main.py).
"""
import os
from datetime import datetime


def start_s3_ingest_scheduler():
    if os.getenv("S3_INGEST_ENABLED", "true").strip().lower() in ("0", "false", "no"):
        print("[s3-ingest] disabled via S3_INGEST_ENABLED")
        return None

    from apscheduler.schedulers.background import BackgroundScheduler
    from . import watcher

    interval_minutes = int(os.getenv("S3_INGEST_INTERVAL_MINUTES", "12"))

    scheduler = BackgroundScheduler(timezone="UTC")
    scheduler.add_job(
        watcher.scan_once,
        "interval",
        minutes=interval_minutes,
        id="s3_machine_ingest",
        max_instances=1,
        coalesce=True,
        next_run_time=datetime.now(),  # also run once immediately on startup
    )
    scheduler.start()
    print(f"[s3-ingest] scheduler started — polling uploads/Clients/ every {interval_minutes} min")
    return scheduler
