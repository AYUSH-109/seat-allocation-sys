"""
core/cleanup.py - Background daemon for stale PLAN file cleanup.

Scans DATA_DIR every CLEANUP_INTERVAL_DAYS days and removes any PLAN-*.json
file whose last-modified time is older than PLAN_RETENTION_DAYS days.
If files are deleted the in-memory cache is reloaded automatically.

Single-point configuration (config.py):
    PLAN_RETENTION_DAYS   — age threshold for deletion
    CLEANUP_INTERVAL_DAYS — how often the daemon wakes up
"""

import glob
import logging
import os
import threading
import time

import config

logger = logging.getLogger(__name__)

# Convert days → seconds once so the math is clear throughout the module.
_SECS_PER_DAY = 86_400


def _cleanup_once(cache) -> int:
    """
    Delete PLAN-*.json files in DATA_DIR that are older than
    config.PLAN_RETENTION_DAYS days.

    Returns the number of files removed.
    """
    cutoff   = time.time() - config.PLAN_RETENTION_DAYS * _SECS_PER_DAY
    pattern  = os.path.join(config.DATA_DIR, "PLAN-*.json")
    removed  = 0

    for path in glob.glob(pattern):
        try:
            mtime = os.path.getmtime(path)
        except OSError:
            continue  # file vanished between glob and stat — skip

        age_days = (time.time() - mtime) / _SECS_PER_DAY
        if mtime < cutoff:
            try:
                os.remove(path)
                logger.info(
                    f"CLEANUP  removed {os.path.basename(path)} "
                    f"(age {age_days:.1f}d > {config.PLAN_RETENTION_DAYS}d)"
                )
                removed += 1
            except OSError as exc:
                logger.warning(f"CLEANUP  could not remove {path}: {exc}")

    if removed:
        logger.info(f"CLEANUP  {removed} file(s) removed — rebuilding index")
        cache.reload()
    else:
        logger.info("CLEANUP  scan complete — no stale files found")

    return removed


def _daemon_loop(cache) -> None:
    """Target function for the daemon thread — runs forever."""
    interval_secs = config.CLEANUP_INTERVAL_DAYS * _SECS_PER_DAY
    logger.info(
        f"CLEANUP  daemon started "
        f"(retention={config.PLAN_RETENTION_DAYS}d, "
        f"interval={config.CLEANUP_INTERVAL_DAYS}d)"
    )

    while True:
        # Run cleanup first, then sleep so stale files are caught at startup too.
        try:
            _cleanup_once(cache)
        except Exception:
            logger.exception("CLEANUP  unexpected error during cleanup pass")

        logger.info(
            f"CLEANUP  next run in {config.CLEANUP_INTERVAL_DAYS} day(s)"
        )
        time.sleep(interval_secs)


def start_cleanup_daemon(cache) -> threading.Thread:
    """
    Spawn and start the cleanup daemon thread.

    The thread is marked daemon=True so it does not block a clean process exit.

    Args:
        cache: The AppCache singleton (imported from core in app.py).

    Returns:
        The running Thread object (rarely needed, but useful for testing).
    """
    t = threading.Thread(
        target=_daemon_loop,
        args=(cache,),
        name="plan-cleanup-daemon",
        daemon=True,
    )
    t.start()
    return t
