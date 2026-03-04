"""
Automatic Data Cleanup Service
================================
Runs in a background daemon thread every 20 days.
Started automatically by create_app() on server start.

Fixed retention policy (not configurable at runtime):
  - activity_log rows          : older than  2 days
  - completed/expired sessions : older than 20 days  (+ all cascaded rows)
  - orphaned child records     : always
  - resolved/closed feedback   : older than 20 days
  - stale cache JSON files     : session no longer in DB
  - temp_uploads files         : always

DO NOT add CLI arguments - this is a server-side scheduled process.

"""

import sqlite3
import logging
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

log = logging.getLogger(__name__)

# ── Retention policy (fixed) ──────────────────────────────────────────────────
_LOG_RETENTION_DAYS     = 2
_DATA_RETENTION_DAYS    = 20
_SCHEDULE_INTERVAL_DAYS = 20
_INTERVAL_SECONDS       = _SCHEDULE_INTERVAL_DAYS * 24 * 3600

# ── Paths ─────────────────────────────────────────────────────────────────────
_BACKEND_DIR  = Path(__file__).resolve().parent.parent   # algo/
_PROJECT_ROOT = _BACKEND_DIR.parent
_DB_PATH      = _PROJECT_ROOT / "demo.db"
_CACHE_DIR    = _BACKEND_DIR / "cache"
_TEMP_UPLOADS = _CACHE_DIR / "temp_uploads"


# ─────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────────────────────

def _cutoff(days: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()


# ─────────────────────────────────────────────────────────────────────────────
# Cleanup stages
# ─────────────────────────────────────────────────────────────────────────────

def _clean_activity_logs(cur) -> int:
    cutoff = _cutoff(_LOG_RETENTION_DAYS)
    cur.execute("DELETE FROM user_activity_log WHERE created_at < ?", (cutoff,))
    n = cur.rowcount
    if n:
        log.info(f"  [logs]       {n} activity log rows (>{_LOG_RETENTION_DAYS}d)")
    return n


def _clean_sessions(cur) -> int:
    cutoff = _cutoff(_DATA_RETENTION_DAYS)
    cur.execute(
        """
        SELECT session_id FROM allocation_sessions
        WHERE  status IN ('expired', 'archived')
            OR (status = 'completed' AND completed_at < ?)
        """,
        (cutoff,),
    )
    ids = [r[0] for r in cur.fetchall()]
    if not ids:
        return 0

    ph = ",".join("?" * len(ids))

    # Log cascaded counts before delete
    for tbl, col in [
        ("allocations",        "session_id"),
        ("allocation_history", "session_id"),
        ("external_students",  "session_id"),
        ("uploads",            "session_id"),
    ]:
        cur.execute(f"SELECT COUNT(*) FROM {tbl} WHERE {col} IN ({ph})", ids)
        n = cur.fetchone()[0]
        if n:
            log.info(f"  [sessions]   {n} rows in {tbl}")

    cur.execute(
        f"SELECT COUNT(*) FROM students WHERE upload_id IN "
        f"(SELECT id FROM uploads WHERE session_id IN ({ph}))", ids,
    )
    n_stu = cur.fetchone()[0]
    if n_stu:
        log.info(f"  [sessions]   {n_stu} student rows")

    # FK ON DELETE CASCADE handles all child rows automatically
    cur.execute(f"DELETE FROM allocation_sessions WHERE session_id IN ({ph})", ids)
    n = cur.rowcount
    log.info(f"  [sessions]   {n} sessions removed (>{_DATA_RETENTION_DAYS}d)")
    return n


def _clean_orphans(cur) -> int:
    queries = [
        ("allocations",
         "session_id NOT IN (SELECT session_id FROM allocation_sessions)"),
        ("allocation_history",
         "session_id NOT IN (SELECT session_id FROM allocation_sessions)"),
        ("external_students",
         "session_id NOT IN (SELECT session_id FROM allocation_sessions)"),
        ("uploads",
         "session_id NOT IN (SELECT session_id FROM allocation_sessions) AND session_id IS NOT NULL"),
        ("students",
         "upload_id NOT IN (SELECT id FROM uploads)"),
    ]
    total = 0
    for tbl, where in queries:
        cur.execute(f"DELETE FROM {tbl} WHERE {where}")
        n = cur.rowcount
        if n:
            log.info(f"  [orphans]    {n} rows from {tbl}")
        total += n
    return total


def _clean_feedback(cur) -> int:
    cutoff = _cutoff(_DATA_RETENTION_DAYS)
    cur.execute(
        "DELETE FROM feedback WHERE status IN ('resolved','closed') AND created_at < ?",
        (cutoff,),
    )
    n = cur.rowcount
    if n:
        log.info(f"  [feedback]   {n} resolved/closed rows (>{_DATA_RETENTION_DAYS}d)")
    return n


def _clean_cache_files(cur) -> int:
    if not _CACHE_DIR.exists():
        return 0
    cur.execute("SELECT plan_id FROM allocation_sessions")
    live = {r[0] for r in cur.fetchall()}
    removed = 0
    for f in _CACHE_DIR.glob("PLAN-*.json"):
        if f.stem not in live:
            try:
                size_kb = f.stat().st_size // 1024
                f.unlink()
                log.info(f"  [cache]      removed {f.name} ({size_kb} KB)")
                removed += 1
            except OSError as exc:
                log.warning(f"  [cache]      could not remove {f.name}: {exc}")
    return removed


def _clean_temp_uploads() -> int:
    if not _TEMP_UPLOADS.exists():
        return 0
    removed = 0
    for f in _TEMP_UPLOADS.iterdir():
        if f.is_file():
            try:
                f.unlink()
                removed += 1
            except OSError:
                pass
    if removed:
        log.info(f"  [temp]       {removed} temp upload file(s) removed")
    return removed


# ─────────────────────────────────────────────────────────────────────────────
# Public entry point
# ─────────────────────────────────────────────────────────────────────────────

def run_cleanup() -> dict:
    """
    Execute a full cleanup pass and return a summary dict.
    Commits on success, rolls back on error. Safe to call at any time.
    """
    if not _DB_PATH.exists():
        log.error(f"Cleanup aborted: DB not found at {_DB_PATH}")
        return {}

    log.info("=== Data cleanup started ===")
    summary = {}

    conn = sqlite3.connect(_DB_PATH, timeout=20)
    # NOTE: foreign_keys is enabled AFTER log cleanup because user_activity_log
    # may have a stale FK on older DBs; cascade deletes for sessions need it ON.

    try:
        cur = conn.cursor()
        # Step 1: clean logs WITHOUT FK enforcement (table may have a stale FK ref)
        summary["logs"]     = _clean_activity_logs(cur)
        conn.commit()

        # Enable FK enforcement for cascade session deletes
        conn.execute("PRAGMA foreign_keys = ON")
        summary["sessions"] = _clean_sessions(cur)
        summary["orphans"]  = _clean_orphans(cur)
        summary["feedback"] = _clean_feedback(cur)
        summary["cache"]    = _clean_cache_files(cur)
        summary["temp"]     = _clean_temp_uploads()

        conn.commit()
        conn.execute("VACUUM")

        db_rows = sum(v for k, v in summary.items() if k not in ("cache", "temp"))
        log.info(
            f"=== Cleanup complete: {db_rows} DB rows removed, "
            f"{summary['cache']} cache files, {summary['temp']} temp files ==="
        )
    except Exception as exc:
        conn.rollback()
        log.error(f"Cleanup failed and was rolled back: {exc}", exc_info=True)
    finally:
        conn.close()

    return summary


# ─────────────────────────────────────────────────────────────────────────────
# Background scheduler
# ─────────────────────────────────────────────────────────────────────────────

_scheduler_started = False
_scheduler_lock    = threading.Lock()


def _scheduler_loop():
    log.info(f"Cleanup scheduler started (runs every {_SCHEDULE_INTERVAL_DAYS} days)")
    while True:
        try:
            run_cleanup()
        except Exception as exc:
            log.error(f"Unhandled error in cleanup scheduler: {exc}", exc_info=True)
        time.sleep(_INTERVAL_SECONDS)


def start_scheduler():
    """
    Start the background cleanup daemon thread.
    Idempotent — safe to call multiple times.
    Runs cleanup immediately on first call, then every 20 days.
    """
    global _scheduler_started
    with _scheduler_lock:
        if _scheduler_started:
            return
        t = threading.Thread(
            target=_scheduler_loop,
            name="data-cleanup-scheduler",
            daemon=True,   # exits automatically when the server stops
        )
        t.start()
        _scheduler_started = True
        log.info("Data cleanup scheduler registered.")
