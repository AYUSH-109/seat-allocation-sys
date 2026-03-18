"""
Publish Plan Blueprint
======================
POST /api/plans/<plan_id>/publish

Reads the plan from the in-memory / JSON cache (algo/cache/PLAN-*.json),
transforms it to the exam-seat-locator schema (strips batch nesting,
keeps only the fields the locator needs, injects date + time_slot from
the request form), then writes the result to a local "fake object-bucket"
folder: algo/published_plans/<filename>.

This fake bucket mimics the GCS / S3 upload pattern so swapping it for a
real SDK call later is a one-liner.

Target schema (exam-seat-locator format):
{
    "metadata": {
        "plan_id":        str,
        "last_updated":   str,
        "total_students": int,
        "type":           "multi_room_snapshot",
        "date":           str,       ← user-supplied  e.g. "02-07-2026"
        "time_slot":      str,       ← user-supplied  e.g. "09:00-12:00"
        "active_rooms":   [str, ...],
        "status":         str
    },
    "inputs": {
        "room_configs": {
            "<room>": { "rows", "cols", "block_width", "block_structure", "broken_seats" }
        }
    },
    "rooms": {
        "<room>": {
            "students": [
                {
                    "position":     str,
                    "roll_number":  str,
                    "student_name": str,
                    "paper_set":    str,
                    "is_broken":    bool,
                    "is_unallocated": bool
                }, ...
            ]
        }
    }
}
"""

import os
import json
import logging
from datetime import datetime

from flask import Blueprint, request, jsonify
from algo.services.auth_service import token_required
from algo.core.cache.cache_manager import CacheManager
from algo.services.cloud_sync_service import CloudSyncService

logger = logging.getLogger(__name__)

publish_plan_bp = Blueprint("publish_plan", __name__, url_prefix="/api/plans")

# ── Fake object-bucket ────────────────────────────────────────────────────────
# In production replace this path with a GCS / S3 bucket upload call.
BUCKET_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))),  # → algo/
    "published_plans",
)
os.makedirs(BUCKET_DIR, exist_ok=True)

_CACHE_MGR = CacheManager()

# Fields to keep per student (everything else is dropped)
_STUDENT_KEEP_FIELDS = {
    "position",
    "batch",
    "batch_label",
    "paper_set",
    "block",
    "roll_number",
    "student_name",
    "is_broken",
    "is_unallocated",
    "display",
    "css_class",
    "color",
    "room_no",
}


# ─────────────────────────────────────────────────────────────────────────────
# Transformation helpers
# ─────────────────────────────────────────────────────────────────────────────

def _clean_student(raw: dict) -> dict:
    """Keep only the fields the exam-seat-locator needs."""
    return {k: raw.get(k) for k in _STUDENT_KEEP_FIELDS}


def _transform(plan: dict, date: str, time_slot: str) -> dict:
    """
    In-memory transformation: cache format → exam-seat-locator format.

    Drops:
      - inputs.*  (except room_configs)
      - rooms.<room>.batches   (the batch-nesting wrapper)
      - rooms.<room>.raw_matrix
      - rooms.<room>.student_count
      - per-student: batch, batch_label, block, display, css_class, color, room_no
    Adds:
      - metadata.date
      - metadata.time_slot
    """
    raw_meta = plan.get("metadata", {})
    raw_inputs = plan.get("inputs", {})
    raw_rooms = plan.get("rooms", {})

    # ── metadata ──────────────────────────────────────────────────────────────
    active_rooms = raw_meta.get("active_rooms") or list(raw_rooms.keys())
    out_meta = {
        "plan_id":        raw_meta.get("plan_id", ""),
        "last_updated":   raw_meta.get("last_updated", datetime.now().isoformat()),
        "total_students": raw_meta.get("total_students", 0),
        "type":           "multi_room_snapshot",
        "date":           date,
        "time_slot":      time_slot,
        "active_rooms":   active_rooms,
        "status":         raw_meta.get("status", "FINALIZED"),
    }

    # ── inputs (only room_configs) ────────────────────────────────────────────
    room_configs_raw = raw_inputs.get("room_configs", {})
    out_room_configs = {}
    for room_name, rc in room_configs_raw.items():
        out_room_configs[room_name] = {
            "rows":            rc.get("rows"),
            "cols":            rc.get("cols"),
            "block_width":     rc.get("block_width"),
            "block_structure": rc.get("block_structure"),
            "broken_seats":    rc.get("broken_seats", []),
        }

    # ── rooms: flatten batch nesting, keep only needed student fields ─────────
    out_rooms = {}
    for room_name, room_data in raw_rooms.items():
        students_flat = []
        batches_section = room_data.get("batches", {})

        for _batch_name, batch_info in batches_section.items():
            for student in batch_info.get("students", []):
                students_flat.append(_clean_student(student))

        out_rooms[room_name] = {"students": students_flat}

    return {
        "metadata": out_meta,
        "inputs":   {"room_configs": out_room_configs},
        "rooms":    out_rooms,
    }


def _fake_bucket_upload(filename: str, data: dict) -> str:
    """
    Simulate an object-bucket PUT.
    Writes the JSON file to BUCKET_DIR and returns the object "URI".
    Replace this function body with e.g. storage_client.bucket(<name>).blob(<path>).upload_from_string(...)
    """
    dest = os.path.join(BUCKET_DIR, filename)
    with open(dest, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=4, ensure_ascii=False)
    return f"bucket://published_plans/{filename}"   # fake URI


# ─────────────────────────────────────────────────────────────────────────────
# Route
# ─────────────────────────────────────────────────────────────────────────────

@publish_plan_bp.route("/<plan_id>/publish", methods=["POST"])
@token_required
def publish_plan(plan_id: str):
    """
    Publish a completed plan to the exam-seat-locator backend.

    Body (JSON):
        date      : str  – exam date, e.g. "02-07-2026"
        time_slot : str  – time slot, e.g. "09:00-12:00"
    """
    body = request.get_json(force=True, silent=True) or {}
    date      = (body.get("date") or "").strip()
    time_slot = (body.get("time_slot") or "").strip()

    # ── validate inputs ───────────────────────────────────────────────────────
    if not date:
        return jsonify({"success": False, "error": "date is required (e.g. 02-07-2026)"}), 400
    if not time_slot or "-" not in time_slot:
        return jsonify({"success": False, "error": "time_slot is required (e.g. 09:00-12:00)"}), 400

    # ── load plan from cache ──────────────────────────────────────────────────
    plan = _CACHE_MGR.load_snapshot(plan_id)
    if not plan:
        return jsonify({"success": False, "error": f"Plan '{plan_id}' not found in cache"}), 404

    # ── transform in-memory ───────────────────────────────────────────────────
    try:
        transformed = _transform(plan, date, time_slot)
    except Exception as exc:
        logger.error(f"Transform failed for {plan_id}: {exc}", exc_info=True)
        return jsonify({"success": False, "error": f"Transform error: {exc}"}), 500

    # ── upload to local bucket mirror (for local/dev workflows) ─────────────
    filename = f"{plan_id}.json"
    try:
        object_uri = _fake_bucket_upload(filename, transformed)
    except Exception as exc:
        logger.error(f"Bucket upload failed for {plan_id}: {exc}", exc_info=True)
        return jsonify({"success": False, "error": f"Upload error: {exc}"}), 500

    # ── notify cloud ingress (queue producer path) ───────────────────────────
    sync_result = CloudSyncService.push_plan(
        plan_id=plan_id,
        transformed_payload=transformed,
        date=date,
        time_slot=time_slot,
    )

    total_students = transformed["metadata"]["total_students"]
    rooms = list(transformed["rooms"].keys())

    logger.info(
        f"✅ Published {plan_id} → {object_uri} "
        f"(students={total_students}, rooms={rooms})"
    )

    return jsonify({
        "success":        True,
        "plan_id":        plan_id,
        "object_uri":     object_uri,
        "filename":       filename,
        "date":           date,
        "time_slot":      time_slot,
        "total_students": total_students,
        "rooms":          rooms,
        "cloud_sync":     sync_result,
        "message":        f"Plan published with {total_students} students across {len(rooms)} room(s).",
    })
