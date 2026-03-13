"""
core/plan_index.py - Summary index for multi-file plan management.

summary_index.json is written to DATA_DIR once (at build time) and loaded
into memory at startup — zero disk I/O during live searches.

Schema
------
{
  "roll_index":      { "BTXY25O1001": ["PLAN-XXX.json", ...], ... },
  "file_hit_counts": { "PLAN-XXX.json": 42, ... },
  "global_dates":    ["2026-02-06", ...],
  "global_times":    ["09:00", "12:00", ...],
  "plan_meta":       { "PLAN-XXX.json": { "plan_id": ..., "date": ...,
                                          "time_slot": ...,
                                          "total_students": ... }, ... },
  "built_at":        "2026-03-05T10:00:00"
}
"""

import os
import json
import glob
import logging
from datetime import datetime

import config

logger = logging.getLogger(__name__)

INDEX_PATH = os.path.join(config.DATA_DIR, "summary_index.json")


# ── Build ─────────────────────────────────────────────────────────────────────

def build_index() -> dict:
    """
    Scan every PLAN-*.json in DATA_DIR and build the summary index.

    - Collects roll_number → [filenames] mapping
    - Collects union of all exam dates and time tokens
    - Preserves existing hit counts if the index already existed
    - Writes summary_index.json to disk, returns the in-memory dict
    """
    # Preserve existing hit counts so stats survive a rebuild
    existing_hits: dict = {}
    if os.path.exists(INDEX_PATH):
        try:
            with open(INDEX_PATH, "r", encoding="utf-8") as f:
                old = json.load(f)
            existing_hits = old.get("file_hit_counts", {})
        except Exception:
            pass

    roll_index:      dict[str, list[str]] = {}
    file_hit_counts: dict[str, int]       = {}
    plan_meta:       dict[str, dict]      = {}
    global_dates:    set                  = set()
    global_times:    set                  = set()

    plan_files = sorted(glob.glob(os.path.join(config.DATA_DIR, "PLAN-*.json")))
    if not plan_files:
        logger.warning("INDEX  no PLAN-*.json files found in data/")

    for plan_path in plan_files:
        fname = os.path.basename(plan_path)
        # Preserve old hit count, default 0 for new files
        file_hit_counts[fname] = existing_hits.get(fname, 0)

        try:
            with open(plan_path, "r", encoding="utf-8") as f:
                plan = json.load(f)
        except Exception as e:
            logger.error(f"READ ERR  {fname}: {e}")
            continue

        # ── Metadata ──────────────────────────────────────────────────────────
        meta      = plan.get("metadata", {})
        raw_date  = meta.get("date", "")
        time_slot = meta.get("time_slot", "")

        converted_date = raw_date
        if raw_date:
            try:
                converted_date = datetime.strptime(raw_date, "%m-%d-%Y").strftime("%Y-%m-%d")
            except ValueError:
                pass
            global_dates.add(converted_date)

        if time_slot and "-" in time_slot:
            start, end = time_slot.split("-", 1)
            global_times.add(start.strip())
            global_times.add(end.strip())

        plan_meta[fname] = {
            "plan_id":        meta.get("plan_id", fname),
            "date":           converted_date,
            "time_slot":      time_slot,
            "total_students": meta.get("total_students", 0),
            "status":         meta.get("status", ""),
        }

        # ── Roll number extraction ─────────────────────────────────────────────
        # Primary (new schema): scan rooms.<room>.students
        rooms_data = plan.get("rooms", {})
        for room_data in rooms_data.values():
            for student in room_data.get("students", []):
                rn = student.get("roll_number") or student.get("enrollment")
                if rn:
                    bucket = roll_index.setdefault(rn, [])
                    if fname not in bucket:
                        bucket.append(fname)

        # Legacy: scan batches → students
        for room_data in rooms_data.values():
            for batch_info in room_data.get("batches", {}).values():
                for student in batch_info.get("students", []):
                    rn = student.get("roll_number") or student.get("enrollment")
                    if rn:
                        bucket = roll_index.setdefault(rn, [])
                        if fname not in bucket:
                            bucket.append(fname)

        # Fallback: raw_matrix cells (handles plans that only have raw_matrix)
        for room_data in rooms_data.values():
            for row in room_data.get("raw_matrix", []):
                for cell in row:
                    if not cell or not isinstance(cell, dict):
                        continue
                    rn = cell.get("roll_number") or cell.get("enrollment")
                    if rn:
                        bucket = roll_index.setdefault(rn, [])
                        if fname not in bucket:
                            bucket.append(fname)

    index = {
        "roll_index":      roll_index,
        "file_hit_counts": file_hit_counts,
        "global_dates":    sorted(global_dates),
        "global_times":    sorted(global_times),
        "plan_meta":       plan_meta,
        "built_at":        datetime.now().isoformat(),
    }

    try:
        with open(INDEX_PATH, "w", encoding="utf-8") as f:
            json.dump(index, f, separators=(",", ":"))
        logger.info(
            f"INDEX  built | students={len(roll_index)} "
            f"files={len(plan_files)} -> summary_index.json"
        )
    except IOError as e:
        logger.error(f"WRITE ERR  summary_index.json: {e}")

    return index


# ── Load ──────────────────────────────────────────────────────────────────────

def load_index() -> dict:
    """
    Load summary_index.json from disk into memory.
    If missing or corrupt, triggers a full build automatically.
    """
    if os.path.exists(INDEX_PATH):
        try:
            with open(INDEX_PATH, "r", encoding="utf-8") as f:
                index = json.load(f)
            logger.info(
                f"INDEX  loaded | students={len(index.get('roll_index', {}))} "
                f"files={len(index.get('file_hit_counts', {}))}"
            )
            return index
        except Exception as e:
            logger.warning(f"INDEX  summary_index.json corrupt ({e}), rebuilding")

    return build_index()


# ── Query helpers ─────────────────────────────────────────────────────────────

def get_filenames_for_roll(index: dict, roll_number: str) -> list[str]:
    """
    Return the list of plan filenames that contain the given roll number.
    O(1) dict lookup — no disk I/O.
    """
    return index.get("roll_index", {}).get(roll_number, [])


def increment_hit(index: dict, filename: str) -> None:
    """
    Bump the in-memory hit counter for a file.
    Not written to disk per-request — persisted only on explicit rebuild.
    """
    counts = index.setdefault("file_hit_counts", {})
    counts[filename] = counts.get(filename, 0) + 1


def get_top_files(index: dict, n: int = 3) -> list[str]:
    """
    Return the top-N filenames ranked by hit count (descending).
    Used at startup to pre-warm the LRU cache.
    """
    counts = index.get("file_hit_counts", {})
    return sorted(counts, key=lambda k: counts[k], reverse=True)[:n]
