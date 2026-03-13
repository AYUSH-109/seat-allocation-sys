"""
core/backend_sync.py - Sync PLAN-*.json files from the seat-allocation backend
publish directory into this service's local DATA_DIR.
"""

import os
import glob
import shutil
import logging

import config

logger = logging.getLogger(__name__)


def sync_backend_plans() -> dict:
    """
    Copy PLAN-*.json from config.BACKEND_PUBLISHED_DIR to config.DATA_DIR.

    Returns:
        {
            "source_exists": bool,
            "copied": int,
            "updated": int,
            "skipped": int,
            "files": [str, ...]
        }
    """
    source_dir = config.BACKEND_PUBLISHED_DIR
    dest_dir = config.DATA_DIR

    stats = {
        "source_exists": os.path.isdir(source_dir),
        "copied": 0,
        "updated": 0,
        "skipped": 0,
        "files": [],
    }

    if not stats["source_exists"]:
        logger.warning(f"SYNC  source missing: {source_dir}")
        return stats

    os.makedirs(dest_dir, exist_ok=True)

    source_files = sorted(glob.glob(os.path.join(source_dir, "PLAN-*.json")))
    for src in source_files:
        name = os.path.basename(src)
        dst = os.path.join(dest_dir, name)

        if not os.path.exists(dst):
            shutil.copy2(src, dst)
            stats["copied"] += 1
            stats["files"].append(name)
            continue

        src_mtime = os.path.getmtime(src)
        dst_mtime = os.path.getmtime(dst)

        if src_mtime > dst_mtime:
            shutil.copy2(src, dst)
            stats["updated"] += 1
            stats["files"].append(name)
        else:
            stats["skipped"] += 1

    logger.info(
        f"SYNC  backend_plans copied={stats['copied']} updated={stats['updated']} "
        f"skipped={stats['skipped']} source={source_dir}"
    )
    return stats
