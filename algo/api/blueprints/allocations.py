# Seating allocation endpoints.
# Orchestrates the generation of seating plans and manages the session-specific manual caching.
from flask import Blueprint, request, jsonify
from algo.core.cache.cache_manager import CacheManager
from algo.core.algorithm.seating import SeatingAlgorithm
from algo.utils.helpers import parse_str_dict, parse_int_dict
from algo.database.db import get_db_connection
from algo.services.auth_service import token_required
import uuid
import sqlite3

allocation_bp = Blueprint('allocations', __name__, url_prefix='/api')

# Module-level singleton — avoid re-instantiating per request
CACHE_MGR = CacheManager()

# ============================================================================
# HELPER: Get pending students for a session (delegates to query layer)
# ============================================================================
def get_pending_students(session_id):
    """Get students not yet allocated in this session"""
    from algo.database.queries.student_queries import StudentQueries
    return StudentQueries.get_pending_students(session_id)


def _get_verified_session(session_id, user_id, conn=None, fields='plan_id, user_id, status'):
    """
    Fetch a session row and verify ownership in one call.
    Returns (session_dict, error_response) — if error_response is not None, return it.
    
    Usage:
        session, err = _get_verified_session(session_id, request.user_id, conn)
        if err: return err
        plan_id = session['plan_id']
    """
    close_conn = False
    if conn is None:
        conn = get_db_connection()
        conn.row_factory = sqlite3.Row
        close_conn = True
    
    cur = conn.cursor()
    cur.execute(f"SELECT {fields} FROM allocation_sessions WHERE session_id = ?", (session_id,))
    row = cur.fetchone()
    
    if not row:
        if close_conn: conn.close()
        return None, (jsonify({"status": "error", "message": "Session not found"}), 404)
    
    session = dict(row)
    owner_id = session.get('user_id')
    
    if owner_id is not None and owner_id != user_id:
        if close_conn: conn.close()
        return None, (jsonify({"status": "error", "message": "Unauthorized"}), 403)
    
    return session, None

# ============================================================================
# POST /api/generate-seating - SESSION-BASED SEATING GENERATION
# ============================================================================
@allocation_bp.route('/generate-seating', methods=['POST'])
@token_required
def generate_seating():
    """Generate seating - FILTER by selected batches only (LEGACY COMPATIBLE)"""
    try:
        data = request.get_json(force=True)
        
        plan_id = data.get("plan_id")
        session_id = data.get("session_id")
        
        # Verify session exists and optionally claim it
        if session_id:
            conn = get_db_connection()
            cur = conn.cursor()
            cur.execute("SELECT user_id, status FROM allocation_sessions WHERE session_id = ?", (session_id,))
            session_row = cur.fetchone()
            
            if not session_row:
                conn.close()
                return jsonify({"error": "Session not found"}), 404
            
            owner_id, status = session_row
            
            if status != 'active':
                conn.close()
                return jsonify({"error": f"Session is {status}"}), 400
            
            # If session has no owner or owner is default (1), claim it
            # ✅ Only allow claiming truly orphaned sessions
            if owner_id is None:  # Only if truly unowned
                # Check if session is recent (created within last hour)
                cur.execute("""
                    SELECT created_at FROM allocation_sessions WHERE session_id = ?
                """, (session_id,))
                created = cur.fetchone()
                
                if created:
                    from datetime import datetime, timedelta
                    created_time = datetime.fromisoformat(created[0])
                    if datetime.now() - created_time < timedelta(hours=1):
                        cur.execute("""
                            UPDATE allocation_sessions SET user_id = ? WHERE session_id = ?
                        """, (request.user_id, session_id))
                        conn.commit()
            elif owner_id != request.user_id:
                conn.close()
                return jsonify({"error": "Unauthorized session"}), 403

        if not plan_id:
            plan_id = f"plan_{uuid.uuid4().hex[:8]}"
        
        use_db = bool(data.get("use_demo_db", True))
        
        # Get batch info from payload
        batch_labels = data.get("batch_labels", {})  # {1: "Batch A", 2: "Batch B"}
        # Convert string keys to int if needed
        if batch_labels:
            batch_labels = {int(k): v for k, v in batch_labels.items()}
        selected_batch_names = list(batch_labels.values()) if batch_labels else []
        
        counts = {}
        labels = {}
        rolls = {}
        colors = {}
        num_batches = 0
        
        if use_db and session_id:
            print(f"🔍 Selected batches: {selected_batch_names}")
            
            # Get ONLY pending students
            pending_students = get_pending_students(session_id)
            
            if not pending_students:
                return jsonify({
                    "error": "No pending students available",
                    "message": "All students have been allocated.",
                    "pending_count": 0
                }), 400
            
            # CRITICAL FIX: Filter by selected batch names ONLY
            filtered_students = [
                s for s in pending_students 
                if s.get('batch_name') in selected_batch_names
            ]
            
            if not filtered_students:
                return jsonify({
                    "error": "No pending students in selected batches",
                    "pending_count": 0
                }), 400
            
            print(f"📋 Filtered: {len(filtered_students)} / {len(pending_students)} pending")
            
            # Group by batch name
            batch_groups = {}
            for student in filtered_students:
                batch_name = student.get('batch_name') or 'Unknown'
                if batch_name not in batch_groups:
                    batch_groups[batch_name] = {
                        'students': [],
                        'color': student.get('batch_color', '#3b82f6')
                    }
                
                batch_groups[batch_name]['students'].append({
                    'roll': student.get('enrollment'),
                    'name': student.get('name', ''),
                    'semester': student.get('semester', 'I')
                })
            
            # Convert to algorithm format (1-indexed)
            batch_colors_from_payload = data.get("batch_colors", {})
            if batch_colors_from_payload:
                batch_colors_from_payload = {int(k): v for k, v in batch_colors_from_payload.items()}
            
            for idx, batch_name in enumerate(selected_batch_names, start=1):
                if batch_name in batch_groups:
                    students_list = batch_groups[batch_name]['students']
                    counts[idx] = len(students_list)
                    labels[idx] = batch_name
                    rolls[idx] = students_list
                    colors[idx] = batch_groups[batch_name]['color']
                else:
                    print(f"⚠️ Batch '{batch_name}' has no pending students")
                    counts[idx] = 0
                    labels[idx] = batch_name
                    rolls[idx] = []
                    colors[idx] = batch_colors_from_payload.get(idx, '#3b82f6')
            
            num_batches = len(selected_batch_names)
            
            print(f"📊 Batch counts: {counts}")
        
        else:
            # Fallback for non-session mode
            batch_student_counts = data.get("batch_student_counts", {})
            if batch_student_counts:
                counts = {int(k): int(v) for k, v in batch_student_counts.items()}
            labels = {int(k): v for k, v in batch_labels.items()} if batch_labels else {}
            rolls = data.get("batch_roll_numbers") or {}
            batch_colors_raw = data.get("batch_colors", {})
            if batch_colors_raw:
                colors = {int(k): v for k, v in batch_colors_raw.items()}
            num_batches = int(data.get("num_batches", len(counts)))
        
        if num_batches == 0 or not counts:
            return jsonify({"error": "No batch data available"}), 400
        
        # Parse broken seats
        broken_str = data.get("broken_seats", "")
        broken_seats = []
        
        if broken_str:
            if isinstance(broken_str, str) and broken_str.strip():
                for seat_str in broken_str.split(","):
                    seat_str = seat_str.strip()
                    if "-" in seat_str:
                        try:
                            r, c = seat_str.split("-")
                            broken_seats.append((int(r) - 1, int(c) - 1))
                        except (ValueError, IndexError):
                            pass
            elif isinstance(broken_str, list):
                for seat in broken_str:
                    if isinstance(seat, (list, tuple)) and len(seat) == 2:
                        broken_seats.append((int(seat[0]), int(seat[1])))
        
        total_pending = sum(counts.values())
        print(f"DEBUG: Starting generation for {total_pending} students") # EXTRA DEBUG
        print(f"🎯 Generating: {total_pending} students, {num_batches} batches")

        # Define room configuration for cache matching/saving (Renamed to avoid conflict)
        seating_room_config = {
            'rows': int(data.get("rows", 10)),
            'cols': int(data.get("cols", 6)),
            'block_width': int(data.get("block_width", 2)),
            'block_structure': data.get("block_structure"),  # Variable block widths
            'broken_seats': broken_seats
        }

        # [STEP 0] Resolve session plan_id ONCE (fixes double-lookup)
        if session_id:
            try:
                db_conn = get_db_connection()
                db_cur = db_conn.cursor()
                db_cur.execute("SELECT plan_id FROM allocation_sessions WHERE session_id = ? AND user_id = ?", (session_id, request.user_id))
                row = db_cur.fetchone()
                if row and row[0]:
                    plan_id = row[0]
                    print(f"✅ Using Session Plan ID: {plan_id}")
                db_conn.close()
            except: pass

        # [STEP 1] Check if seating for THIS plan and THIS room exists in cache
        target_room = data.get('room_no') or data.get('room_name') or "N/A"
        try:
            cached_data = CACHE_MGR.load_snapshot(plan_id)
            if cached_data:
                print(f"📂 [L1-CACHE] Found existing plan {plan_id}, will update room: {target_room}")
        except Exception as cache_lookup_err:
            print(f"⚠️ Cache info retrieval failed: {cache_lookup_err}")

        # Initialize algorithm
        algo = SeatingAlgorithm(
            rows=int(data.get("rows", 10)),
            cols=int(data.get("cols", 6)),
            num_batches=num_batches,
            block_width=int(data.get("block_width", 2)),
            block_structure=data.get("block_structure"),  # Variable block widths
            batch_by_column=bool(data.get("batch_by_column", True)),
            randomize_column=bool(data.get("randomize_column", False)),
            broken_seats=broken_seats,
            batch_student_counts=counts,
            batch_roll_numbers=rolls,
            batch_labels=labels,
            start_rolls=parse_str_dict(data.get("start_rolls")),
            batch_colors=colors,
            serial_mode=data.get("serial_mode", "per_batch"),
            serial_width=int(data.get("serial_width", 0)),
            allow_adjacent_same_batch=bool(data.get("allow_adjacent_same_batch", False))
        )

        # Generate seating
        algo.generate_seating()
        web = algo.to_web_format()

        # Add metadata
        web.setdefault("metadata", {})
        web["plan_id"] = plan_id
        web["session_id"] = session_id
        web["pending_count"] = total_pending
        web["selected_batches"] = selected_batch_names
        
        # Validate
        ok, errors = algo.validate_constraints()
        
        # Merge init_errors into validation errors for visibility
        if algo.init_errors:
            errors = algo.init_errors + errors
            ok = False # Critical initialization errors should invalidate the plan
            
        web["validation"] = {"is_valid": ok, "errors": errors}
        
        # Cache result
        room_name = data.get('room_no') or data.get('room_name') or "N/A"
        try:
            print(f"DEBUG: Attempting cache update for plan {plan_id}, room {room_name}")
            CACHE_MGR.save_or_update(
                plan_id=plan_id, 
                input_config=seating_room_config, 
                output_data=web, 
                room_no=room_name
            )
        except Exception as cache_err:
            print(f"⚠️ Cache save warning: {cache_err}")
            # If still failing, try using raw data as fallback
            try:
                print("DEBUG: Retrying with raw data...")
                CACHE_MGR.save_or_update(plan_id, data, web, room_name)
            except: pass
        
        print(f"✅ Seating generated for: {selected_batch_names}")
        
        return jsonify(web)
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Failed to generate seating: {str(e)}"}), 500

# ============================================================================
# POST /api/manual-generate-seating - MANUAL MODE (NO DB)
# ============================================================================
@allocation_bp.route('/manual-generate-seating', methods=['POST'])
@token_required
def manual_generate_seating():
    """Generate seating without DB (Manual Mode)"""
    try:
        data = request.get_json(force=True)
        num_batches = int(data.get("num_batches", 3))
        
        # Parse batch student counts
        counts = {}
        batch_student_counts_str = data.get("batch_student_counts", "")
        if batch_student_counts_str:
            if isinstance(batch_student_counts_str, dict):
                counts = {int(k): int(v) for k, v in batch_student_counts_str.items()}
            else:
                parts = [p.strip() for p in str(batch_student_counts_str).split(',') if p.strip()]
                for part in parts:
                    if ':' in part:
                        try:
                            k, v = part.split(':', 1)
                            counts[int(k.strip())] = int(v.strip())
                        except: pass

        # Parse batch names/labels
        labels = {}
        batch_names_str = data.get("batch_names", "")
        if batch_names_str:
            if isinstance(batch_names_str, dict):
                labels = {int(k): v for k, v in batch_names_str.items()}
            else:
                parts = [p.strip() for p in str(batch_names_str).split(',') if p.strip()]
                for part in parts:
                    if ':' in part:
                        try:
                            k, v = part.split(':', 1)
                            labels[int(k.strip())] = v.strip()
                        except: pass

        # Parse start_rolls
        start_rolls = {}
        start_rolls_str = data.get("start_rolls", "")
        if start_rolls_str:
            parts = [p.strip() for p in str(start_rolls_str).split(',') if p.strip()]
            for part in parts:
                if ':' in part:
                    try:
                        k, v = part.split(':', 1)
                        start_rolls[int(k.strip())] = v.strip()
                    except: pass

        # Parse broken seats
        broken_seats = []
        broken_str = data.get("broken_seats", "")
        if isinstance(broken_str, str) and "-" in broken_str:
            parts = [p.strip() for p in broken_str.split(',') if p.strip()]
            for part in parts:
                if '-' in part:
                    try:
                        row_col = part.split('-')
                        row = int(row_col[0].strip()) - 1
                        col = int(row_col[1].strip()) - 1
                        broken_seats.append((row, col))
                    except: pass
        elif isinstance(broken_str, list):
            broken_seats = broken_str

        # Initialize algorithm with all parameters
        algo = SeatingAlgorithm(
            rows=int(data.get("rows", 10)),
            cols=int(data.get("cols", 10)),
            num_batches=num_batches,
            block_width=int(data.get("block_width", 3)),
            block_structure=data.get("block_structure"),  # Variable block widths
            batch_by_column=bool(data.get("batch_by_column", True)),
            randomize_column=bool(data.get("randomize_column", False)),
            broken_seats=broken_seats,
            batch_student_counts=counts,
            batch_roll_numbers={},
            batch_labels=labels,
            start_rolls=start_rolls,
            batch_colors=parse_str_dict(data.get("batch_colors")),
            serial_mode=data.get("serial_mode", "per_batch"),
            serial_width=int(data.get("serial_width", 0)),
            allow_adjacent_same_batch=bool(data.get("allow_adjacent_same_batch", False))
        )
        
        algo.generate_seating()
        web = algo.to_web_format()
        
        web.setdefault("metadata", {})
        
        ok, errors = algo.validate_constraints()
        web["validation"] = {"is_valid": ok, "errors": errors}
        
        # Save to manual cache
        MANUAL_CACHE_FILE = "manual_seating_current"
        cm = CacheManager() 
        cm.save_or_update(MANUAL_CACHE_FILE, data, web)
        
        print(f"✅ Manual seating generated - Batches: {num_batches}")
        
        return jsonify(web)
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

# ============================================================================
# POST /api/constraints-status
# ============================================================================
@allocation_bp.route('/constraints-status', methods=['POST'])
@token_required
def constraints_status():
    """Get constraint validation status"""
    try:
        data = request.get_json(force=True)
        
        algo = SeatingAlgorithm(
            rows=int(data.get("rows", 10)),
            cols=int(data.get("cols", 6)),
            num_batches=int(data.get("num_batches", 3)),
            block_width=int(data.get("block_width", 2)),
            block_structure=data.get("block_structure"),  # Variable block widths
            batch_by_column=bool(data.get("batch_by_column", True)),
            randomize_column=bool(data.get("randomize_column", False))
        )
        
        algo.generate_seating()
        
        return jsonify(algo.get_constraints_status())
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ============================================================================
# Save/Reset Allocation Routes
# ============================================================================
@allocation_bp.route('/reset-allocation', methods=['POST'])
@token_required
def reset_allocation():
    data = request.json
    session_id = data.get('session_id')
    if not session_id:
        return jsonify({"status": "error", "message": "Session ID required"}), 400
    
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Verify ownership
        session, err = _get_verified_session(session_id, request.user_id, conn, fields='user_id')
        if err: return err

        cur.execute("DELETE FROM allocations WHERE session_id = ?", (session_id,))
        cur.execute("""
            UPDATE allocation_sessions 
            SET allocated_count = 0 
            WHERE session_id = ? AND user_id = ?
        """, (session_id, request.user_id))
        conn.commit()
        conn.close()
        return jsonify({"status": "success", "message": "Allocations reset"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@allocation_bp.route('/allocations', methods=['GET'])
@token_required
def get_allocations():
    return jsonify({"status": "success", "allocations": []})


# ============================================================================
# EXTERNAL STUDENT MANAGEMENT (Manual additions to empty seats)
# ============================================================================

@allocation_bp.route('/sessions/<int:session_id>/rooms/<room_no>/add-external-student', methods=['POST'])
@token_required
def add_external_student(session_id, room_no):
    """
    Add an external student to an empty seat in a finalized seating plan.
    This allows filling unused seats with students not in the original upload.
    """
    try:
        data = request.get_json(force=True)
        
        # Required fields
        seat_position = data.get('seat_position')  # e.g., "A1", "B3"
        seat_row = data.get('seat_row')  # 0-indexed
        seat_col = data.get('seat_col')  # 0-indexed
        roll_number = data.get('roll_number')
        batch_label = data.get('batch_label')
        
        # Optional fields
        student_name = data.get('student_name', '')
        batch_color = data.get('batch_color', '#3b82f6')
        paper_set = data.get('paper_set')  # If None, will auto-calculate
        
        if not all([seat_position, roll_number, batch_label, seat_row is not None, seat_col is not None]):
            return jsonify({
                "status": "error",
                "message": "Missing required fields: seat_position, seat_row, seat_col, roll_number, batch_label"
            }), 400
        
        conn = get_db_connection()
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        
        # 1. Verify session exists and user owns it
        session, err = _get_verified_session(session_id, request.user_id, conn, fields='plan_id, user_id, status')
        if err: return err
        
        plan_id, status = session['plan_id'], session['status']
        
        # 2. Load cache and verify seat is empty
        cached_data = CACHE_MGR.load_snapshot(plan_id)
        
        if not cached_data or 'rooms' not in cached_data:
            conn.close()
            return jsonify({"status": "error", "message": "No cached seating plan found"}), 404
        
        if room_no not in cached_data['rooms']:
            conn.close()
            return jsonify({"status": "error", "message": f"Room '{room_no}' not found in plan"}), 404
        
        room_data = cached_data['rooms'][room_no]
        seating_matrix = room_data.get('raw_matrix', [])
        
        # Validate seat coordinates
        rows = len(seating_matrix)
        cols = len(seating_matrix[0]) if rows > 0 else 0
        
        if seat_row < 0 or seat_row >= rows or seat_col < 0 or seat_col >= cols:
            conn.close()
            return jsonify({"status": "error", "message": "Invalid seat coordinates"}), 400
        
        current_seat = seating_matrix[seat_row][seat_col]
        
        if current_seat.get('is_broken'):
            conn.close()
            return jsonify({"status": "error", "message": "Cannot assign to a broken seat"}), 400
        
        if not current_seat.get('is_unallocated') and current_seat.get('roll_number'):
            conn.close()
            return jsonify({
                "status": "error", 
                "message": f"Seat already allocated to {current_seat.get('roll_number')}"
            }), 400
        
        # 3. Auto-calculate paper set if not provided
        if not paper_set:
            paper_set = _calculate_paper_set_for_seat(seating_matrix, seat_row, seat_col)
        
        # 4. Check for duplicate external student in same session/room/position
        cur.execute("""
            SELECT id FROM external_students 
            WHERE session_id = ? AND room_no = ? AND seat_position = ?
        """, (session_id, room_no, seat_position))
        
        if cur.fetchone():
            conn.close()
            return jsonify({"status": "error", "message": "Seat already has an external student"}), 400
        
        # 5. Insert into external_students table
        cur.execute("""
            INSERT INTO external_students 
            (session_id, plan_id, room_no, seat_position, seat_row, seat_col, 
             roll_number, student_name, batch_label, batch_color, paper_set)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (session_id, plan_id, room_no, seat_position, seat_row, seat_col,
              roll_number, student_name, batch_label, batch_color, paper_set))
        
        external_id = cur.lastrowid
        conn.commit()
        conn.close()
        
        # 6. Update cache with new student
        new_seat_data = {
            "position": seat_position,
            "batch": 0,  # External marker
            "batch_label": batch_label,
            "paper_set": paper_set,
            "block": current_seat.get('block', 0),
            "roll_number": roll_number,
            "student_name": student_name,
            "is_broken": False,
            "is_unallocated": False,
            "is_external": True,  # Mark as externally added
            "external_id": external_id,
            "display": f"{roll_number}{paper_set}",
            "css_class": f"external set-{paper_set}",
            "color": batch_color
        }
        
        # Patch the cache
        CACHE_MGR.patch_seat(plan_id, room_no, seat_row, seat_col, new_seat_data)
        
        return jsonify({
            "status": "success",
            "message": f"External student added to seat {seat_position}",
            "external_id": external_id,
            "seat": new_seat_data
        }), 201
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500


@allocation_bp.route('/sessions/<int:session_id>/rooms/<room_no>/remove-external-student', methods=['POST'])
@token_required
def remove_external_student(session_id, room_no):
    """Remove an externally added student from a seat"""
    try:
        data = request.get_json(force=True)
        seat_position = data.get('seat_position')
        
        if not seat_position:
            return jsonify({"status": "error", "message": "seat_position required"}), 400
        
        conn = get_db_connection()
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        
        # Verify ownership
        session, err = _get_verified_session(session_id, request.user_id, conn, fields='plan_id, user_id')
        if err: return err
        
        plan_id = session['plan_id']
        
        # Get the external student record
        cur.execute("""
            SELECT id, seat_row, seat_col FROM external_students 
            WHERE session_id = ? AND room_no = ? AND seat_position = ?
        """, (session_id, room_no, seat_position))
        
        ext_row = cur.fetchone()
        if not ext_row:
            conn.close()
            return jsonify({"status": "error", "message": "External student not found at this seat"}), 404
        
        seat_row, seat_col = ext_row['seat_row'], ext_row['seat_col']
        
        # Delete from database
        cur.execute("""
            DELETE FROM external_students 
            WHERE session_id = ? AND room_no = ? AND seat_position = ?
        """, (session_id, room_no, seat_position))
        
        conn.commit()
        conn.close()
        
        # Restore seat to unallocated state in cache
        empty_seat_data = {
            "position": seat_position,
            "batch": None,
            "batch_label": None,
            "paper_set": None,
            "roll_number": None,
            "student_name": None,
            "is_broken": False,
            "is_unallocated": True,
            "is_external": False,
            "display": "UNALLOCATED",
            "css_class": "unallocated",
            "color": "#F3F4F6"
        }
        
        CACHE_MGR.patch_seat(plan_id, room_no, seat_row, seat_col, empty_seat_data)
        
        return jsonify({
            "status": "success",
            "message": f"External student removed from seat {seat_position}"
        }), 200
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500


@allocation_bp.route('/sessions/<int:session_id>/external-students', methods=['GET'])
@token_required
def get_external_students(session_id):
    """Get all external students for a session"""
    try:
        room_no = request.args.get('room_no')
        
        conn = get_db_connection()
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        
        # Verify ownership
        session, err = _get_verified_session(session_id, request.user_id, conn, fields='user_id')
        if err: return err
        
        if room_no:
            cur.execute("""
                SELECT * FROM external_students 
                WHERE session_id = ? AND room_no = ?
                ORDER BY seat_position
            """, (session_id, room_no))
        else:
            cur.execute("""
                SELECT * FROM external_students 
                WHERE session_id = ?
                ORDER BY room_no, seat_position
            """, (session_id,))
        
        students = [dict(row) for row in cur.fetchall()]
        conn.close()
        
        return jsonify({
            "status": "success",
            "external_students": students,
            "count": len(students)
        }), 200
        
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


def _calculate_paper_set_for_seat(seating_matrix, row, col):
    """
    Calculate the appropriate paper set (A/B) for a seat based on neighbors.
    Rule: Adjacent seats (left/right) should have alternating paper sets.
    """
    rows = len(seating_matrix)
    cols = len(seating_matrix[0]) if rows > 0 else 0
    
    neighbors = []
    
    # Check left neighbor
    if col > 0:
        left = seating_matrix[row][col - 1]
        if left and not left.get('is_broken') and not left.get('is_unallocated'):
            neighbors.append(left.get('paper_set'))
    
    # Check right neighbor
    if col < cols - 1:
        right = seating_matrix[row][col + 1]
        if right and not right.get('is_broken') and not right.get('is_unallocated'):
            neighbors.append(right.get('paper_set'))
    
    # If we have neighbors, pick the opposite
    if neighbors:
        if 'A' in neighbors:
            return 'B'
        elif 'B' in neighbors:
            return 'A'
    
    # Default: alternate based on column (even=A, odd=B)
    return 'A' if col % 2 == 0 else 'B'


@allocation_bp.route('/sessions/<int:session_id>/rooms/<room_no>/empty-seats', methods=['GET'])
@token_required
def get_empty_seats(session_id, room_no):
    """Get all empty seats in a room for external student assignment"""
    try:
        conn = get_db_connection()
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        
        # Verify ownership
        session, err = _get_verified_session(session_id, request.user_id, conn, fields='plan_id, user_id')
        if err: return err
        
        plan_id = session['plan_id']
        conn.close()
        
        empty_seats = CACHE_MGR.get_empty_seats(plan_id, room_no)
        
        return jsonify({
            "status": "success",
            "empty_seats": empty_seats,
            "count": len(empty_seats)
        }), 200
        
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@allocation_bp.route('/sessions/<int:session_id>/rooms/<room_no>/batches', methods=['GET'])
@token_required
def get_room_batches(session_id, room_no):
    """Get all batches currently in a room for the batch dropdown"""
    try:
        conn = get_db_connection()
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        
        # Verify ownership
        session, err = _get_verified_session(session_id, request.user_id, conn, fields='plan_id, user_id')
        if err: return err
        
        plan_id = session['plan_id']
        conn.close()
        
        cached_data = CACHE_MGR.load_snapshot(plan_id, silent=True)
        
        if not cached_data or 'rooms' not in cached_data or room_no not in cached_data['rooms']:
            return jsonify({"status": "success", "batches": []}), 200
        
        room_data = cached_data['rooms'][room_no]
        batches = []
        
        # Extract unique batches from the seating
        seating_matrix = room_data.get('raw_matrix', [])
        batch_colors = {}
        
        for row in seating_matrix:
            for seat in row:
                if seat and not seat.get('is_broken') and not seat.get('is_unallocated'):
                    label = seat.get('batch_label')
                    color = seat.get('color')
                    if label and label not in batch_colors:
                        batch_colors[label] = color
        
        batches = [{"label": label, "color": color} for label, color in batch_colors.items()]
        
        return jsonify({
            "status": "success",
            "batches": batches
        }), 200
        
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
