"""
seat_service.py - Core service module for Exam Seat Locator System
Dynamically extracts exam sessions from PLAN-LVZWSW9M.json
All data is extracted in real-time - no hardcoded session files needed.
"""

import os
import json
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

DATA_FOLDER = os.path.join(os.path.dirname(__file__), "data")
PLAN_FILE = os.path.join(DATA_FOLDER, "PLAN-LVZWSW9M.json")


def load_plan_file(plan_path=PLAN_FILE):
    """
    Load the master PLAN file containing all exam information.
    Returns the plan data or None if file doesn't exist.
    """
    if not os.path.exists(plan_path):
        logger.error(f"PLAN file not found: {plan_path}")
        return None

    try:
        with open(plan_path, "r", encoding="utf-8") as f:
            plan_data = json.load(f)
        logger.info(f"✅ Loaded PLAN file successfully")
        return plan_data
    except json.JSONDecodeError as e:
        logger.error(f"❌ Invalid JSON in PLAN file: {e}")
        return None
    except IOError as e:
        logger.error(f"❌ Error reading PLAN file: {e}")
        return None


def convert_date_format(date_str):
    """Convert '02-06-2026' to '2026-02-06'"""
    try:
        d = datetime.strptime(date_str, "%m-%d-%Y")
        return d.strftime("%Y-%m-%d")
    except:
        return date_str


def position_to_coordinates(position):
    """
    Convert position string to (row, col) coordinates.
    Format: [Column Letter][Row Number]
    Example: "A1" -> (0, 0), "A2" -> (1, 0), "B1" -> (0, 1)
    Where: Letter (A,B,C...) = Column, Number (1,2,3...) = Row
    """
    if not position or len(position) < 2:
        return None
    
    try:
        col = ord(position[0].upper()) - ord('A')  # A=0, B=1, C=2...
        row = int(position[1:]) - 1  # 1=0, 2=1, 3=2...
        return (row, col)
    except (ValueError, IndexError):
        return None


def build_seat_matrix(room_config, students):
    """
    Create a 2D seat matrix from students and room configuration.
    Returns a 2D array with student objects containing full information:
    - For allocated seats: student dict with roll_number, paper_set, name, flags
    - For broken seats: {'status': 'broken'}
    - For empty seats: None
    """
    rows = room_config.get("rows", 10)
    cols = room_config.get("cols", 10)
    
    # Initialize empty matrix
    matrix = [[None for _ in range(cols)] for _ in range(rows)]
    
    # Get broken seats and mark them
    broken_seats = room_config.get("broken_seats", [])
    broken_set = {(seat[0], seat[1]) for seat in broken_seats}
    
    # Mark broken seats in matrix
    for row, col in broken_set:
        if 0 <= row < rows and 0 <= col < cols:
            matrix[row][col] = {"status": "broken"}
    
    # Place students in matrix based on position
    for student in students:
        position = student.get("position", "")
        roll_number = student.get("roll_number", "")
        
        if not position or not roll_number:
            continue
        
        coords = position_to_coordinates(position)
        if coords is None:
            continue
        
        row, col = coords
        
        # Check if seat is valid and not broken
        if 0 <= row < rows and 0 <= col < cols and (row, col) not in broken_set:
            # Store complete student information for display
            matrix[row][col] = {
                "roll_number": roll_number,
                "paper_set": student.get("paper_set", ""),
                "student_name": student.get("student_name", ""),
                "batch_label": student.get("batch_label", ""),
                "is_broken": student.get("is_broken", False),
                "is_unallocated": student.get("is_unallocated", False),
                "status": "allocated"
            }
    
    return matrix


def extract_room_sessions(plan_data):
    """
    Extract all room sessions from PLAN data.
    All rooms use the SAME exam date/time from the plan.
    Supports multiple rooms with the same exam time and different student sets.
    Returns a list of session dicts with all required information.
    """
    if not plan_data:
        return []
    
    sessions = []
    metadata = plan_data.get("metadata", {})
    room_configs = plan_data.get("inputs", {}).get("room_configs", {})
    rooms_data = plan_data.get("rooms", {})
    
    # Extract exam metadata (same for ALL rooms)
    exam_date = convert_date_format(metadata.get("date", ""))
    time_slot = metadata.get("time_slot", "09:00-12:00")
    start_time, end_time = time_slot.split("-") if "-" in time_slot else ("09:00", "12:00")
    start_time = start_time.strip()
    end_time = end_time.strip()
    
    logger.info(f"📅 Extracting all rooms for: {exam_date} | {start_time}-{end_time}")
    
    # Process each room
    for room_name, room_info in rooms_data.items():
        if room_name not in room_configs:
            logger.warning(f"Room {room_name} has no configuration, skipping")
            continue
        
        room_config = room_configs[room_name]
        
        # Collect all students from all batches in this room
        all_students = []
        batch_info_list = []
        batches = room_info.get("batches", {})
        
        for batch_name, batch_info in batches.items():
            batch_data = batch_info.get("info", {})
            batch_info_list.append({
                "name": batch_name,
                "degree": batch_data.get("degree", ""),
                "branch": batch_data.get("branch", ""),
                "joining_year": batch_data.get("joining_year", "")
            })
            students = batch_info.get("students", [])
            all_students.extend(students)
        
        if not all_students:
            logger.warning(f"Room {room_name} has no students")
            continue
        
        # Create seat matrix
        seat_matrix = build_seat_matrix(room_config, all_students)
        
        # All rooms share the SAME exam date/time
        session = {
            "exam_date": exam_date,
            "start_time": start_time,
            "end_time": end_time,
            "classroom_number": room_name,
            "layout": {
                "rows": room_config.get("rows", 10),
                "columns": room_config.get("cols", 10)
            },
            "seats": seat_matrix,
            "batches": batch_info_list,
            "room_config": room_config,
            "metadata": {
                "plan_id": metadata.get("plan_id", ""),
                "total_students": len(all_students),
                "status": metadata.get("status", ""),
                "last_updated": metadata.get("last_updated", "")
            }
        }
        
        sessions.append((room_name, session))
        logger.info(f"  ✅ {room_name}: {len(all_students)} students | Batches: {len(batch_info_list)}")
    
    return sessions


def build_session_index(data_folder=DATA_FOLDER):
    """
    Builds multiple indexes for efficient searching:
    1. session_index: Maps (exam_date, start_time, end_time, room) -> session_data
    2. student_index: Maps (enrollment, exam_date, start_time, end_time) -> (room, session_data)
    
    Dynamically extracts all data from PLAN-LVZWSW9M.json
    Handles multiple rooms with same exam date/time efficiently.
    """
    session_index = {}
    student_index = {}  # For direct student lookup without needing room
    
    # Load PLAN file
    plan_data = load_plan_file(os.path.join(data_folder, "PLAN-LVZWSW9M.json"))
    
    if plan_data:
        sessions = extract_room_sessions(plan_data)
        
        for room_name, session in sessions:
            # Index 1: By date+time+room (for room-specific lookups)
            room_key = (
                session["exam_date"],
                session["start_time"],
                session["end_time"],
                room_name
            )
            session_index[room_key] = session
            
            # Index 2: By student enrollment (for fast student lookup)
            # This allows finding a student without knowing which room they're in
            seats = session.get("seats", [])
            for row_idx, row in enumerate(seats):
                for col_idx, seat_data in enumerate(row):
                    if seat_data and isinstance(seat_data, dict):
                        # Extract enrollment/roll_number if it's an allocated seat
                        if seat_data.get("status") == "allocated":
                            enrollment = seat_data.get("roll_number")
                            if enrollment:
                                student_key = (
                                    enrollment,
                                    session["exam_date"],
                                    session["start_time"],
                                    session["end_time"]
                                )
                                student_index[student_key] = {
                                    "room": room_name,
                                    "session": session,
                                    "row": row_idx,
                                    "col": col_idx
                                }
    
    return session_index, student_index


def find_matching_session(exam_date, start_time, end_time, session_index):
    """
    Looks up the session index for a matching (date, start_time, end_time) key.
    Returns the session dict if found, else None.
    """
    key = (exam_date, start_time, end_time)
    return session_index.get(key, None)


def find_student_seat(enrollment, session):
    """
    Searches the 2D seats matrix for the given enrollment number.
    Returns a dict with seat info if found, else None.

    Returns:
        {
            "classroom_number": str,
            "row": int,         # 0-indexed
            "col": int,         # 0-indexed
            "rows": int,
            "columns": int,
            "seats": list[list]
        }
    """
    seats = session.get("seats", [])

    for row_idx, row in enumerate(seats):
        for col_idx, cell in enumerate(row):
            if cell == enrollment:
                return {
                    "classroom_number": session["classroom_number"],
                    "row": row_idx,
                    "col": col_idx,
                    "rows": session["layout"]["rows"],
                    "columns": session["layout"]["columns"],
                    "seats": seats,
                    "exam_date": session["exam_date"],
                    "start_time": session["start_time"],
                    "end_time": session["end_time"],
                }

    return None
