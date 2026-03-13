"""
core/extractor.py - Session extraction layer.
Transforms the raw parsed PLAN dict into a structured list of room sessions.
No file I/O here — receives already-loaded data.
"""

import logging
from .loader import convert_date_format
from .matrix import build_seat_matrix

logger = logging.getLogger(__name__)


def extract_room_sessions(plan_data: dict) -> list[tuple[str, dict]]:
    """
    Turn the top-level PLAN dict into a list of (room_name, session) tuples.

    A session dict contains everything needed to render one room:
      exam_date, start_time, end_time, classroom_number,
      layout, seats (2-D matrix), batches, room_config, metadata
    """
    if not plan_data:
        return []

    sessions: list[tuple[str, dict]] = []
    meta         = plan_data.get("metadata", {})
    room_configs = plan_data.get("inputs", {}).get("room_configs", {})
    rooms_data   = plan_data.get("rooms", {})

    # Exam date/time is shared across ALL rooms in one plan
    exam_date  = convert_date_format(meta.get("date", ""))
    time_slot  = meta.get("time_slot", "09:00-12:00")
    start_time, end_time = (
        time_slot.split("-") if "-" in time_slot else ("09:00", "12:00")
    )
    start_time = start_time.strip()
    end_time   = end_time.strip()

    logger.info(f"EXTRACT  date={exam_date} slot={start_time}-{end_time} rooms={len(rooms_data)}")

    for room_name, room_info in rooms_data.items():
        if room_name not in room_configs:
            logger.warning(f"SKIP  {room_name}: no room_config")
            continue

        room_config = room_configs[room_name]

        # Aggregate students from the room.
        # New schema: rooms.<room>.students
        # Legacy schema: rooms.<room>.batches.<batch>.students
        all_students: list[dict] = []
        batch_info_list: list[dict] = []

        if isinstance(room_info.get("students"), list):
            all_students.extend(room_info.get("students", []))
        else:
            for batch_name, batch_info in room_info.get("batches", {}).items():
                batch_meta = batch_info.get("info", {})
                batch_info_list.append({
                    "name":         batch_name,
                    "degree":       batch_meta.get("degree", ""),
                    "branch":       batch_meta.get("branch", ""),
                    "joining_year": batch_meta.get("joining_year", ""),
                })
                all_students.extend(batch_info.get("students", []))

        if not all_students:
            logger.warning(f"SKIP  {room_name}: 0 students")
            continue

        seat_matrix = build_seat_matrix(room_config, all_students)

        session: dict = {
            "exam_date":        exam_date,
            "start_time":       start_time,
            "end_time":         end_time,
            "classroom_number": room_name,
            "layout": {
                "rows":    room_config.get("rows", 10),
                "columns": room_config.get("cols",  10),
            },
            "seats":       seat_matrix,
            "batches":     batch_info_list,
            "room_config": room_config,
            "metadata": {
                "plan_id":       meta.get("plan_id", ""),
                "total_students": len(all_students),
                "status":        meta.get("status", ""),
                "last_updated":  meta.get("last_updated", ""),
            },
        }

        sessions.append((room_name, session))
        logger.info(f"  room={room_name} students={len(all_students)} batches={len(batch_info_list)}")

    return sessions
