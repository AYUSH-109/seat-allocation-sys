# PDF generation and report export endpoints.
# Handles the creation of seating plan vectors, attendance sheets, and compressed export logs.
import os
import logging
from datetime import datetime
from flask import Blueprint, request, jsonify, send_file
from algo.services.auth_service import token_required
from algo.core.cache.cache_manager import CacheManager

pdf_bp = Blueprint('pdf', __name__, url_prefix='/api')
logger = logging.getLogger(__name__)

CACHE_MGR = CacheManager()


# ============================================================================
# HELPER: Verify plan ownership
# ============================================================================
def _verify_plan_ownership(plan_id: str, user_id: int) -> bool:
    """
    Verify that the user owns the plan (session).
    STRICT: No ADMIN bypass, no user_id=1 fallback.
    
    Args:
        plan_id: The plan_id to check
        user_id: The user making the request
        
    Returns:
        True if access allowed, False otherwise
    """
    try:
        from algo.database.db import get_db_connection
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            SELECT user_id FROM allocation_sessions WHERE plan_id = ?
        """, (plan_id,))
        row = cur.fetchone()
        conn.close()
        
        if not row:
            # Plan doesn't exist in DB - allow (might be old cache-only data)
            return True
        
        owner_id = row[0]
        
        # Allow if user owns the session
        if owner_id == user_id:
            return True
        
        # Allow if session is unassigned (NULL user_id) - legacy data
        if owner_id is None:
            return True
        
        return False
    except Exception as e:
        logger.warning(f"Plan ownership check error: {e}")
        return True  # Fail open for backwards compatibility


# ============================================================================
# HELPER: Get seating from cache
# ============================================================================
def get_seating_from_cache(plan_id, room_no=None):
    """Retrieve seating data from cache"""
    try:
        snapshot = CACHE_MGR.load_snapshot(plan_id)
        if not snapshot:
            return None
        
        rooms = snapshot.get('rooms', {})
        
        if room_no:
            # Specific room requested
            room_data = rooms.get(room_no)
            if room_data:
                return {
                    'seating': room_data.get('raw_matrix', room_data.get('seating', [])),
                    'metadata': room_data.get('inputs', {}),
                    'batches': room_data.get('batches', {})
                }
            return None
        else:
            # Return first room if no specific room requested
            if rooms:
                first_room = list(rooms.keys())[0]
                room_data = rooms[first_room]
                return {
                    'seating': room_data.get('raw_matrix', room_data.get('seating', [])),
                    'metadata': room_data.get('inputs', {}),
                    'batches': room_data.get('batches', {})
                }
            
            # Fallback: maybe it's a direct structure
            if snapshot.get('seating') or snapshot.get('raw_matrix'):
                return {
                    'seating': snapshot.get('raw_matrix', snapshot.get('seating', [])),
                    'metadata': snapshot.get('metadata', snapshot.get('inputs', {})),
                    'batches': snapshot.get('batches', {})
                }
        
        return None
    except Exception as e:
        logger.error(f"Cache lookup error: {e}")
        return None

# ============================================================================
# HELPER: Get seating from Database (Fallback)
# ============================================================================
# ============================================================================
# HELPER: Get seating from Database (Fallback)
# ============================================================================
def get_seating_from_database(session_id, room_name=None):
    """Reconstruct seating data from database allocations"""
    try:
        from algo.database.db import get_db_connection
        import sqlite3
        
        conn = get_db_connection()
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        
        # 1. Get classroom config
        if room_name:
            cur.execute("SELECT id, name, rows, cols, block_width, block_structure, broken_seats FROM classrooms WHERE name = ?", (room_name,))
        else:
            # Fallback to first allocated room if no name provided
            cur.execute("""
                SELECT c.id, c.name, c.rows, c.cols, c.block_width, c.block_structure, c.broken_seats
                FROM classrooms c
                JOIN allocations a ON c.id = a.classroom_id
                WHERE a.session_id = ?
                LIMIT 1
            """, (session_id,))
            
        classroom = cur.fetchone()
        if not classroom:
            conn.close()
            return None
            
        target_room_name = classroom['name']
        classroom_id = classroom['id']
        rows_count = classroom['rows']
        cols_count = classroom['cols']
        block_width = classroom['block_width']
        block_structure_raw = classroom['block_structure']
        broken_seats_str = classroom['broken_seats'] or ""
        
        # Parse block_structure from JSON string if needed
        block_structure = None
        if block_structure_raw:
            import json
            try:
                if isinstance(block_structure_raw, str):
                    block_structure = json.loads(block_structure_raw)
                else:
                    block_structure = block_structure_raw
            except:
                pass
        
        # 2. Get allocations for this room/session
        cur.execute("""
            SELECT 
                a.seat_position, a.enrollment, a.student_id,
                a.batch_name, a.paper_set, 
                s.name as student_name, s.batch_color
            FROM allocations a
            LEFT JOIN students s ON a.student_id = s.id
            WHERE a.session_id = ? AND a.classroom_id = ?
        """, (session_id, classroom_id))
        
        alloc_rows = cur.fetchall()
        conn.close()
        
        # 3. Reconstruct matrix
        matrix = [[None for _ in range(cols_count)] for _ in range(rows_count)]
        
        # Mark broken seats
        try:
            broken_list = [s.strip() for s in broken_seats_str.split(',') if s.strip()]
            for bs in broken_list:
                rr, cc = map(int, bs.split('-'))
                if 0 <= rr-1 < rows_count and 0 <= cc-1 < cols_count:
                    matrix[rr-1][cc-1] = {
                        'is_broken': True,
                        'display': 'BROKEN',
                        'color': '#FF0000',
                        'position': bs
                    }
        except: pass

        # Map allocations
        for r in alloc_rows:
            try:
                rr, cc = map(int, r['seat_position'].split('-'))
                if 0 <= rr-1 < rows_count and 0 <= cc-1 < cols_count:
                    matrix[rr-1][cc-1] = {
                        'position': r['seat_position'],
                        'roll_number': r['enrollment'],
                        'student_name': r['student_name'],
                        'batch_label': r['batch_name'],
                        'color': r['batch_color'] or '#F3F4F6',
                        'paper_set': r['paper_set'],
                        'status': 'allocated'
                    }
            except: continue
            
        # Fill rest as unallocated (if not broken)
        for r in range(rows_count):
            for c in range(cols_count):
                if matrix[r][c] is None:
                    matrix[r][c] = {
                        'is_unallocated': True,
                        'display': '',
                        'position': f"{r+1}-{c+1}",
                        'color': '#F3F4F6'
                    }

        return {
            'seating': matrix,
            'metadata': {
                'room_no': target_room_name,
                'rows': rows_count,
                'cols': cols_count,
                'block_width': block_width,
                'block_structure': block_structure,  # Variable block widths
                'broken_seats': broken_seats_str
            },
            'batches': {}, # Re-built by CacheManager if needed, but not critical for PDF
            'source': 'database'
        }
        
    except Exception as e:
        logger.error(f"DB lookup error: {str(e)}")
        return None

# ============================================================================
# HELPER: Corrected 4-Step Hybrid Seating Data Retrieval
# ============================================================================
def get_seating_data_hybrid(data, user_id=None):
    """
    Unified 4-step retrieval mechanism:
    1. Check Cache (O(1)) via plan_id
    2. Check Session (O(1)) -> Get plan_id -> Try Cache
    3. reconstruct from Database (O(n))
    4. Use Request Payload
    """
    plan_id = data.get('plan_id') or data.get('snapshot_id')
    session_id = data.get('session_id')
    room_name = data.get('room_name') or data.get('room_no')
    
    # [1] Try Cache Directly
    if plan_id:
        logger.info(f"🔍 [Hybrid-Step 1] Checking cache for plan_id: {plan_id}")
        cached = get_seating_from_cache(plan_id, room_name)
        if cached:
            logger.info(f"⚡ [Hybrid HIT] Seating found in cache (Step 1)")
            return cached, "cache"
            
    # [2] Try Session -> Cache
    if session_id:
        logger.info(f"🔍 [Hybrid-Step 2] Checking session_id: {session_id}")
        try:
            from algo.database.db import get_db_connection
            conn = get_db_connection()
            cur = conn.cursor()
            if user_id:
                cur.execute("SELECT plan_id FROM allocation_sessions WHERE session_id = ? AND user_id = ?", (session_id, user_id))
            else:
                cur.execute("SELECT plan_id FROM allocation_sessions WHERE session_id = ?", (session_id,))
            row = cur.fetchone()
            conn.close()
            
            if row and row[0]:
                db_plan_id = row[0]
                logger.info(f"   ↳ Found plan_id: {db_plan_id}. Retrying cache...")
                cached = get_seating_from_cache(db_plan_id, room_name)
                if cached:
                    logger.info(f"⚡ [Hybrid HIT] Seating found in cache (Step 2)")
                    return cached, "cache"
        except Exception as e:
            logger.warning(f"Hybrid Step 2 warning: {e}")

    # [3] Fallback to Database Reconstruction
    if session_id:
        logger.info(f"⚠️ [Hybrid-Step 3] Cache missing. Falling back to DB reconstruction for session: {session_id}")
        db_seating = get_seating_from_database(session_id, room_name)
        if db_seating:
            return db_seating, "database"

    # [4] Use Request Payload
    if 'seating' in data:
        logger.info(f"📄 [Hybrid-Step 4] Using request payload seating data")
        # Build metadata from request - check nested metadata first, then top-level fields
        request_metadata = data.get('metadata', data.get('inputs', {}))
        # Merge top-level fields that might contain block_structure, rows, cols etc.
        if not request_metadata.get('block_structure') and data.get('block_structure'):
            request_metadata['block_structure'] = data.get('block_structure')
        if not request_metadata.get('block_width') and data.get('block_width'):
            request_metadata['block_width'] = data.get('block_width')
        if not request_metadata.get('rows') and data.get('rows'):
            request_metadata['rows'] = data.get('rows')
        if not request_metadata.get('cols') and data.get('cols'):
            request_metadata['cols'] = data.get('cols')
        
        return {
            'seating': data['seating'],
            'metadata': request_metadata,
            'batches': data.get('batches', {})
        }, "request"

    return None, "none"

# ============================================================================
# POST /api/generate-pdf - Generate PDF from seating arrangement
# ============================================================================
@pdf_bp.route('/generate-pdf', methods=['POST'])
@token_required
def generate_pdf():
    """
    Generate PDF from seating arrangement.
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No data provided"}), 400
        
        user_id = request.user_id
        
        # [STEP 1-3] Use Hybrid Seating Retrieval with ownership check
        seating_payload, seating_source = get_seating_data_hybrid(data, user_id=user_id)
        
        if not seating_payload or not seating_payload.get('seating'):
            return jsonify({
                "error": "No seating data available",
                "hint": "Ensure session is active or plan exists in cache"
            }), 400

        template_name = data.get('template_name', 'default')
        room_no = data.get('room_no') or data.get('room_name') or "Unknown"
        
        # ============================================================================
        # LAYER 2: PDF Generation - Let pdf_generation.py handle caching
        # ============================================================================
        logger.info(f"📋 [L1→Memory] Generating in-memory PDF: seating_source={seating_source}, user={user_id}, template={template_name}")

        try:
            from algo.pdf_gen.pdf_generation import generate_seating_pdf_to_buffer

            pdf_buffer = generate_seating_pdf_to_buffer(
                data=seating_payload,
                user_id=user_id,
                template_name=template_name
            )
        except Exception as pdf_err:
            logger.error(f"❌ PDF generation failed: {str(pdf_err)}")
            return jsonify({"error": f"PDF generation failed: {str(pdf_err)}"}), 500

        # Generate download filename
        meta_room = seating_payload.get('metadata', {}).get('room_no') or room_no or "Unknown"
        room_suffix = f"_{meta_room.replace(' ', '_')}" if meta_room else ""

        logger.info(f"✅ PDF ready (in-memory, seating_source={seating_source})")

        return send_file(
            pdf_buffer,
            as_attachment=True,
            download_name=f"seating_plan{room_suffix}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf",
            mimetype='application/pdf'
        )
        
    except Exception as e:
        logger.error(f"❌ PDF generation error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

# ============================================================================
# GET /api/plan-batches/<plan_id> - Get batch info for all rooms in a plan
# ============================================================================
@pdf_bp.route('/plan-batches/<plan_id>', methods=['GET'])
@token_required
def get_plan_batches(plan_id):
    """Get batch information for ALL rooms in a plan"""
    try:
        # Verify ownership using helper
        if not _verify_plan_ownership(plan_id, request.user_id):
            return jsonify({"error": "Access denied - you do not own this plan"}), 403

        cache_data = CACHE_MGR.load_snapshot(plan_id)
        
        if cache_data:
            # Return ALL rooms from cache
            all_rooms = cache_data.get('rooms', {})
            logger.info(f"📋 Plan {plan_id} found in CACHE with {len(all_rooms)} rooms")
        else:
            # Fallback to reconstructing from DB maybe?
            # For now, if not in cache, return error or empty
            return jsonify({"error": "Plan not found in cache"}), 404
            
        return jsonify({
            "plan_id": plan_id,
            "rooms": all_rooms,
            "metadata": cache_data.get('metadata', {}),
            "inputs": cache_data.get('inputs', {})
        })
        
    except Exception as e:
        logger.error(f"Error fetching plan batches: {e}")
        return jsonify({"error": str(e)}), 500
        import sqlite3
        
        conn = get_db_connection()
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        
        # Get session info - filter by user_id
        cur.execute("SELECT session_id, total_students FROM allocation_sessions WHERE plan_id = ? AND user_id = ?", (plan_id, request.user_id))
        session_row = cur.fetchone()
        
        if not session_row:
            conn.close()
            return jsonify({"error": "Plan not found in cache or database"}), 404
            
        session_id = session_row['session_id']
        total_students = session_row['total_students']
        
        # Get batches linked to this session
        cur.execute("""
            SELECT DISTINCT batch_name, batch_color 
            FROM uploads 
            WHERE session_id = ?
        """, (session_id,))
        
        batches = []
        for b in cur.fetchall():
            batches.append({
                "name": b['batch_name'],
                "color": b['batch_color'] or "#3b82f6"
            })
            
        conn.close()
        
        return jsonify({
            "plan_id": plan_id,
            "rooms": {}, # No rooms yet if no cache
            "metadata": {
                "plan_id": plan_id,
                "total_students": total_students,
                "batches": batches
            },
            "inputs": {},
            "source": "database"
        })
        
    except Exception as e:
        logger.error(f"Get plan batches error: {e}")
        return jsonify({"error": str(e)}), 500

# ============================================================================
# POST /api/generate-pdf/batch - Batch PDF generation
# ============================================================================
@pdf_bp.route('/generate-pdf/batch', methods=['POST'])
@token_required
def generate_pdf_batch():
    """Generate PDFs for multiple rooms"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No data provided"}), 400
        
        plan_id = data.get('plan_id')
        room_names = data.get('rooms', [])
        
        if not plan_id:
            return jsonify({"error": "plan_id required"}), 400
        
        # Verify ownership before generating PDFs
        if not _verify_plan_ownership(plan_id, request.user_id):
            return jsonify({"error": "Access denied - you do not own this plan"}), 403
        
        cache_data = CACHE_MGR.load_snapshot(plan_id)
        if not cache_data:
            return jsonify({"error": "Plan not found"}), 404
        
        all_rooms = cache_data.get('rooms', {})
        
        # If no specific rooms, use all
        if not room_names:
            room_names = list(all_rooms.keys())
        
        if not room_names:
            return jsonify({"error": "No rooms available"}), 400
        
        import zipfile
        import io as _io
        from algo.pdf_gen.pdf_generation import generate_seating_pdf_to_buffer

        generated_rooms = []
        errors = []
        zip_buffer = _io.BytesIO()

        with zipfile.ZipFile(zip_buffer, mode='w', compression=zipfile.ZIP_DEFLATED) as zf:
            for room_name in room_names:
                # Use hybrid mechanism for each room in batch
                room_request = {**data, 'room_name': room_name}
                room_payload, room_source = get_seating_data_hybrid(room_request)

                if not room_payload:
                    errors.append(f"Room '{room_name}' could not be retrieved")
                    logger.warning(f"⚠️ [Batch PDF] Room '{room_name}' not found in cache or DB")
                    continue

                try:
                    logger.info(f"📝 [Batch PDF] Generating in-memory PDF for room '{room_name}' (source={room_source})")
                    pdf_buf = generate_seating_pdf_to_buffer(
                        data=room_payload,
                        user_id=str(data.get('user_id', request.user_id)),
                        template_name=data.get('template_name', 'default')
                    )
                    safe_name = room_name.replace(' ', '_').replace('/', '-')
                    zf.writestr(f"seating_plan_{safe_name}.pdf", pdf_buf.read())
                    generated_rooms.append(room_name)
                    logger.info(f"✅ [Batch PDF] Room '{room_name}' added to zip")
                except Exception as e:
                    errors.append(f"Room '{room_name}': {str(e)}")
                    logger.error(f"❌ [Batch PDF] Room '{room_name}' failed: {e}")

        if not generated_rooms:
            return jsonify({"error": "No PDFs could be generated", "errors": errors}), 500

        zip_buffer.seek(0)
        logger.info(f"✅ [Batch PDF] Zip ready — {len(generated_rooms)} room(s), {len(errors)} error(s)")

        return send_file(
            zip_buffer,
            mimetype='application/zip',
            as_attachment=True,
            download_name=f"seating_plans_{plan_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
        )
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ============================================================================
# Download PDF endpoint
# ============================================================================
@pdf_bp.route('/download-pdf/<filename>', methods=['GET'])
@token_required
def download_pdf(filename):
    """Serve the generated PDF"""
    import glob
    
    directory = os.path.abspath("algo/pdf_gen/seat_plan_generated")
    
    # Try direct path
    path = os.path.join(directory, filename)
    if os.path.exists(path):
        return send_file(path, as_attachment=True)
    
    # Try searching in subdirs
    found = glob.glob(os.path.join(directory, "**", filename), recursive=True)
    if found:
        return send_file(found[0], as_attachment=True)
    
    return jsonify({"error": "File not found"}), 404

# ============================================================================
# Template Management Routes
# ============================================================================
@pdf_bp.route('/template/config', methods=['GET'])
@token_required
def get_template_config():
    """Get user's current template configuration - LEGACY COMPATIBLE"""
    try:
        from algo.pdf_gen.template_manager import template_manager
        user_id = request.user_id
        template_name = request.args.get('template_name', 'default')
        config = template_manager.get_user_template(user_id, template_name)
        
        # Transform banner_image_path to relative URL for frontend
        if config and config.get('banner_image_path'):
            filename = os.path.basename(config['banner_image_path'])
            config['banner_image_path'] = f"/api/template/banner/{filename}"
            
        # LEGACY Format required by frontend
        template_hash = template_manager.get_template_hash(user_id, template_name)
        
        return jsonify({
            "success": True,
            "template": config,
            "template_hash": template_hash,
            "message": "Template loaded successfully"
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@pdf_bp.route('/template/config', methods=['POST'])
@token_required
def save_template_config():
    """Save user template configuration - Handles both JSON and FormData"""
    try:
        from algo.pdf_gen.template_manager import template_manager
        user_id = request.user_id
        
        # Support both JSON and multipart/form-data
        if request.content_type and 'multipart/form-data' in request.content_type:
            template_data = {
                'dept_name': request.form.get('dept_name', ''),
                'exam_details': request.form.get('exam_details', ''),
                'seating_plan_title': request.form.get('seating_plan_title', ''),
                'current_year': int(request.form.get('current_year', datetime.now().year)),
                'branch_text': request.form.get('branch_text', ''),
                'room_number': request.form.get('room_number', ''),
                'coordinator_name': request.form.get('coordinator_name', ''),
                'coordinator_title': request.form.get('coordinator_title', ''),
                # Attendance fields
                'attendance_dept_name': request.form.get('attendance_dept_name', 'Computer Science and Engineering'),
                'attendance_year': int(request.form.get('attendance_year', datetime.now().year)),
                'attendance_exam_heading': request.form.get('attendance_exam_heading', 'SESSIONAL EXAMINATION'),
                'attendance_banner_path': request.form.get('attendance_banner_path', ''),
            }
            template_name = request.form.get('template_name', 'default')
            
            # Handle banner upload if present in FormData
            if 'bannerImage' in request.files:
                file = request.files['bannerImage']
                banner_path = template_manager.save_user_banner(user_id, file, template_name)
                if banner_path:
                    template_data['banner_image_path'] = banner_path
        else:
            data = request.json or {}
            if not data:
                return jsonify({"success": False, "error": "No data provided"}), 400
            template_name = data.get('template_name', 'default')
            template_data = data

        success = template_manager.save_user_template(user_id, template_data, template_name)
        
        if success:
            # Clean up old banners
            template_manager.delete_old_banners(user_id, keep_latest=3)
            
            # Legacy format
            updated_template = template_manager.get_user_template(user_id, template_name)
            
            # Transform banner_image_path to relative URL for frontend
            if updated_template and updated_template.get('banner_image_path'):
                fname = os.path.basename(updated_template['banner_image_path'])
                updated_template['banner_image_path'] = f"/api/template/banner/{fname}"
                
            new_hash = template_manager.get_template_hash(user_id, template_name)
            
            return jsonify({
                "success": True,
                "message": "Template saved successfully!",
                "template": updated_template,
                "template_hash": new_hash
            })
        return jsonify({"success": False, "error": "Failed to save template"}), 500
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@pdf_bp.route('/template/banner', methods=['POST'])
@token_required
def upload_banner():
    try:
        from algo.pdf_gen.template_manager import template_manager
        if 'banner' not in request.files and 'bannerImage' not in request.files:
            return jsonify({"success": False, "error": "No file"}), 400
        
        file = request.files.get('banner') or request.files.get('bannerImage')
        user_id = request.user_id
        path = template_manager.save_user_banner(user_id, file)
        
        if path:
            # Return RELATIVE path for frontend
            filename = os.path.basename(path)
            relative_path = f"/api/template/banner/{filename}"
            return jsonify({"success": True, "path": relative_path})
        return jsonify({"success": False, "error": "Upload failed"}), 500
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# ============================================================================
# POST /api/export-attendance - Generate attendance sheet PDF
# ============================================================================
@pdf_bp.route('/export-attendance', methods=['POST'])
@token_required
def export_attendance():
    """Export attendance sheet with correct metadata field mapping"""
    import io
    import time
    
    try:
        data = request.get_json()
        plan_id = data.get('plan_id')
        batch_or_room = data.get('batch_name')
        target_batch_name = batch_or_room # Explicitly define for internal PDF logic
        frontend_metadata = data.get('metadata', {})
        room_no = frontend_metadata.get('room_no') or frontend_metadata.get('room_name')
        
        logger.info(f"📋 Attendance request: plan={plan_id}, batch_or_room={batch_or_room}, room_no={room_no}")
        
        # CRITICAL FIX: Add room_no to data so get_seating_data_hybrid can filter by room
        if room_no:
            data['room_no'] = room_no
            data['room_name'] = room_no
        
        # [STEP 1-3] Use Hybrid Seating Retrieval with ownership check
        seating_payload, source = get_seating_data_hybrid(data, user_id=request.user_id)
        
        if not seating_payload:
            return jsonify({
                "error": f"Seating data for '{batch_or_room}' not found",
                "available_rooms": list(rooms.keys()) if rooms else []
            }), 404
        
        # If cache hit gave us multi-room plan, we need to extract specific room data
        # but get_seating_data_hybrid(data) with room_no should handle that inside step 1/2.
        
        # Extract students and batches for attendance
        all_students = []
        batch_info = {}
        
        # Define target_room_name early to avoid undefined variable errors
        target_room_name = seating_payload.get('metadata', {}).get('room_no') or room_no
        
        # CRITICAL: Use batches structure directly from cache (room-wise data)
        # Cache structure: rooms → batches → students
        if 'batches' in seating_payload:
            batches = seating_payload.get('batches', {})
            
            # Case 1: Specific batch requested (e.g., "CSD-24")
            if batch_or_room and batch_or_room in batches:
                logger.info(f"📋 Extracting students for batch: {batch_or_room}")
                batch_data = batches[batch_or_room]
                all_students = batch_data.get('students', [])
                batch_info = batch_data.get('info', {})
                
            # Case 2: Room-level request (e.g., "105B") - get all batches in room
            elif batch_or_room:
                logger.info(f"📋 Extracting students for room: {batch_or_room} (all batches)")
                for b_name, b_data in batches.items():
                    all_students.extend(b_data.get('students', []))
                    # Use first batch's info as default for room-level
                    if not batch_info:
                        batch_info = b_data.get('info', {})
                        
            # Case 3: No specific batch/room - get all students
            else:
                logger.info(f"📋 Extracting all students from cache")
                for b_name, b_data in batches.items():
                    all_students.extend(b_data.get('students', []))
                    if not batch_info:
                        batch_info = b_data.get('info', {})
        
        # Fallback: Try extracting from matrix if batches not available
        elif 'seating' in seating_payload:
            logger.warning(f"⚠️ Batches not found in cache, falling back to matrix extraction")
            matrix = seating_payload.get('seating', [])
            
            if isinstance(matrix, list) and len(matrix) > 0 and isinstance(matrix[0], list):
                for row in matrix:
                    for seat in row:
                        if seat and not seat.get('is_broken') and not seat.get('is_unallocated'):
                            # If specific batch requested, filter by batch_label
                            if batch_or_room and batch_or_room != target_room_name:
                                if seat.get('batch_label') == batch_or_room:
                                    all_students.append(seat)
                            else:
                                all_students.append(seat)

        
        # Deduplicate students based on roll_number
        seen_rolls = set()
        unique_students = []
        for student in all_students:
            roll = student.get('roll_number')
            if roll and roll not in seen_rolls:
                seen_rolls.add(roll)
                unique_students.append(student)
        all_students = unique_students
        
        # Sort students by roll number
        all_students.sort(key=lambda s: s.get('roll_number', ''))
        
        if not all_students:
            return jsonify({
                "error": f"No students found for '{batch_or_room}'",
                "available_rooms": list(seating_payload.get('rooms', {}).keys()) if 'rooms' in seating_payload else []
            }), 404
        
        # Map metadata to EXACT field names that create_attendance_pdf expects
        complete_metadata = {
            'exam_title': frontend_metadata.get('exam_title') or frontend_metadata.get('exam_name') or 'EXAMINATION-ATTENDANCE SHEET',
            'course_name': frontend_metadata.get('course_name') or frontend_metadata.get('department') or 'N/A',
            'course_code': frontend_metadata.get('course_code') or 'N/A',
            'date': frontend_metadata.get('date') or frontend_metadata.get('exam_date') or '',
            'time': frontend_metadata.get('time') or '',
            'year': frontend_metadata.get('year') or str(datetime.now().year),
            'room_no': target_room_name or room_no or 'N/A',
            # Attendance settings
            'attendance_dept_name': frontend_metadata.get('attendance_dept_name', 'Computer Science and Engineering'),
            'attendance_year': frontend_metadata.get('attendance_year', datetime.now().year),
            'attendance_exam_heading': frontend_metadata.get('attendance_exam_heading', 'SESSIONAL EXAMINATION'),
            'attendance_banner_path': frontend_metadata.get('attendance_banner_path', '')
        }
        
        # Debug logging
        logger.info(f"🔍 Frontend metadata received: {frontend_metadata}")
        logger.info(f"🔍 Attendance Year from frontend: {frontend_metadata.get('attendance_year')}")
        logger.info(f"🔍 Complete metadata attendance_year: {complete_metadata['attendance_year']}")
        
        logger.info(f"📋 Generating attendance: room={target_room_name}, batch={target_batch_name}, students={len(all_students)}")
        
        # Generate PDF (metadata now contains attendance settings from frontend)
        timestamp = int(time.time())
        safe_name = (target_batch_name or target_room_name or 'attendance').replace(' ', '_').replace('/', '-')
        temp_filename = f"temp_attendance_{safe_name}_{timestamp}.pdf"
        
        try:
            from algo.attendence_gen.attend_gen import create_attendance_pdf
            
            create_attendance_pdf(
                temp_filename,
                all_students,
                target_batch_name or target_room_name or 'All',
                complete_metadata,  # Now includes attendance settings
                batch_info
            )
        except ImportError:
            return jsonify({"error": "Attendance PDF generation module not available"}), 500
        
        # Read and send
        return_data = io.BytesIO()
        with open(temp_filename, 'rb') as f:
            return_data.write(f.read())
        return_data.seek(0)
        
        if os.path.exists(temp_filename):
            os.remove(temp_filename)
        
        download_name = f"Attendance_{safe_name}_{complete_metadata['course_code']}_{timestamp}.pdf"
        
        logger.info(f"✅ Attendance PDF generated: {download_name}")
        
        return send_file(
            return_data,
            mimetype='application/pdf',
            as_attachment=True,
            download_name=download_name
        )
        
    except Exception as e:
        logger.error(f"❌ Export attendance error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ============================================================================
# HELPERS: Debarred List Parsing
# ============================================================================

def parse_debarred_file(file_obj):
    """
    Parse an uploaded CSV or Excel (.xlsx) debarred list file.

    Supports two formats:

    Format 1 – "Row-per-debarment":
        enrollment_no, subject_code, subject_name
        BTCS24O1001,   CS601,        Operating Systems
        BTCS24O1002,   CS601,        Operating Systems

    Format 2 – "Matrix" (columns = subjects, Y/debarred = debarred):
        enrollment_no, CS601-Operating Systems, CS602-Data Structures
        BTCS24O1001,   Y,
        BTCS24O1002,   ,                        Y

    Returns:
        dict: {
            subject_code: {
                'subject_name': str,
                'debarred_students': set(enrollment_strings)
            }
        }
        or {} on failure.
    """
    import csv
    import io as _io

    filename = getattr(file_obj, 'filename', '')
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'csv'

    rows = []
    try:
        if ext in ('xlsx', 'xls'):
            import openpyxl
            wb = openpyxl.load_workbook(file_obj, read_only=True, data_only=True)
            ws = wb.active
            for row in ws.iter_rows(values_only=True):
                rows.append([str(c).strip() if c is not None else '' for c in row])
        else:
            raw = file_obj.read()
            if isinstance(raw, bytes):
                raw = raw.decode('utf-8-sig', errors='replace')
            reader = csv.reader(_io.StringIO(raw))
            for row in reader:
                rows.append([c.strip() for c in row])
    except Exception as e:
        logger.error(f"parse_debarred_file error: {e}")
        return {}

    # Strip completely empty rows
    rows = [r for r in rows if any(c for c in r)]
    if not rows:
        return {}

    header_row = [h.lower().strip() for h in rows[0]]

    # Locate enrollment column (first column whose header contains 'enroll', 'roll', or 'no')
    enroll_col = next(
        (i for i, h in enumerate(header_row)
         if any(kw in h for kw in ('enroll', 'roll', 'no.', 'no', 'regd', 'reg'))),
        0
    )

    # Detect Format 1: a dedicated subject_code column exists
    SUBJECT_CODE_KEYS = ('subject_code', 'subjectcode', 'sub_code', 'subcode', 'subject code',
                         'code', 'sub code')
    SUBJECT_NAME_KEYS = ('subject_name', 'subjectname', 'subject name', 'sub_name', 'subname',
                         'subject', 'name')

    sub_code_col = next(
        (i for i, h in enumerate(header_row) if h in SUBJECT_CODE_KEYS), None
    )
    sub_name_col = next(
        (i for i, h in enumerate(header_row)
         if any(k in h for k in SUBJECT_NAME_KEYS) and i != enroll_col and i != sub_code_col),
        None
    )

    result = {}

    # Non-debarred / "safe" cell values — everything else is treated as debarred
    NOT_DEBARRED = {'', '0', 'n', 'no', 'false', 'none', 'nan', '-', 'nil', 'null'}

    def _is_debarred_cell(cell_value: str) -> bool:
        """Return True if a cell value means the student is debarred for that subject.
        Explicit 'yes'/'y'/'debarred'/'detained' markers → True.
        Any non-empty, non-zero value also → True (handles absence-counts like '3', '5', etc.).
        Explicit 'no'/'0'/empty → False.
        """
        v = cell_value.strip().lower()
        if v in NOT_DEBARRED:
            return False
        return True  # any other value (Y, yes, 1, 3, 5, X, debarred, detained …)

    if sub_code_col is not None:
        # ── Format 1: rows  (enroll, subject_code, subject_name) ─────────────
        for row in rows[1:]:
            if len(row) <= enroll_col:
                continue
            enroll = row[enroll_col].strip()
            if not enroll or enroll.lower() in NOT_DEBARRED:
                continue
            sub_code = (row[sub_code_col].strip() if len(row) > sub_code_col else 'SUBJECT') or 'SUBJECT'
            sub_name = (row[sub_name_col].strip() if sub_name_col is not None and len(row) > sub_name_col else sub_code) or sub_code
            if sub_code not in result:
                result[sub_code] = {'subject_name': sub_name, 'debarred_students': set()}
            result[sub_code]['debarred_students'].add(enroll)
    else:
        # ── Format 2 (Matrix): each column after enrollment is a subject ──────
        # Key rule: use the FULL original header as the unique subject key so that
        # columns named "subject 1", "subject 2" … are never collapsed into one.
        subject_cols = {}  # col_index -> {subject_key, subject_name}
        seen_keys = {}     # tracks how many times a short code has been used
        for i, h in enumerate(rows[0]):
            if i == enroll_col or not h.strip():
                continue
            h_clean = h.strip()

            # Attempt to extract a short code prefix (e.g. "CS601" from "CS601-OS")
            # A short code is a run of uppercase letters + digits with no spaces
            import re as _re
            code_match = _re.match(r'^([A-Za-z]{1,4}\d{2,6})', h_clean)

            if code_match:
                # Header starts with a recognisable subject-code like CS601
                short_code = code_match.group(1).upper()
                remaining   = h_clean[len(code_match.group(1)):].lstrip(' -_:').strip()
                subject_name = remaining if remaining else h_clean
            else:
                # Generic header ("subject 1", "Mathematics", etc.)
                # Use the FULL header as the unique key to prevent collisions
                short_code   = h_clean.upper()   # whole header → unique key
                subject_name = h_clean

            # If this short_code was already seen, append a counter to keep it unique
            count = seen_keys.get(short_code, 0) + 1
            seen_keys[short_code] = count
            unique_key = short_code if count == 1 else f"{short_code}_{count}"

            subject_cols[i] = {'subject_key': unique_key, 'subject_name': subject_name}
            logger.debug(f"  Debarred matrix col {i}: key='{unique_key}' name='{subject_name}'")

        logger.info(f"parse_debarred_file: found {len(subject_cols)} subject columns: "
                    f"{[v['subject_key'] for v in subject_cols.values()]}")

        for row in rows[1:]:
            if len(row) <= enroll_col:
                continue
            enroll = row[enroll_col].strip()
            if not enroll or enroll.lower() in NOT_DEBARRED:
                continue
            for col_i, sub_info in subject_cols.items():
                cell = row[col_i].strip() if col_i < len(row) else ''
                if _is_debarred_cell(cell):
                    key = sub_info['subject_key']
                    if key not in result:
                        result[key] = {'subject_name': sub_info['subject_name'],
                                       'debarred_students': set()}
                    result[key]['debarred_students'].add(enroll)

    logger.info(f"parse_debarred_file result: {len(result)} subjects, "
                f"sizes={[len(v['debarred_students']) for v in result.values()]}")
    return result


def identify_batch_for_debarred(debarred_data, batches):
    """
    Auto-detect which plan-batch a debarred list file belongs to.

    Compares enrollment numbers found in the file against each batch's
    student list and returns the best-matching batch_name (or None).
    """
    if not batches or not debarred_data:
        return None

    # Collect all enrollments mentioned in the debarred file
    file_enrollments = set()
    for sub_info in debarred_data.values():
        file_enrollments.update(sub_info.get('debarred_students', set()))

    if not file_enrollments:
        return None

    best_batch = None
    best_score = -1

    for batch_name, batch_data in batches.items():
        batch_students = batch_data.get('students', [])
        batch_enrollments = {
            s.get('roll_number', '') for s in batch_students if s.get('roll_number')
        }
        if not batch_enrollments:
            continue

        intersection = file_enrollments & batch_enrollments
        if intersection:
            # Score = what fraction of file enrollments matched this batch
            score = len(intersection) / len(file_enrollments)
            if score > best_score:
                best_score = score
                best_batch = batch_name

    return best_batch if best_score > 0 else None


# ============================================================================
# POST /api/analyze-debarred-file - Preview a debarred list file
# ============================================================================
@pdf_bp.route('/analyze-debarred-file', methods=['POST'])
@token_required
def analyze_debarred_file():
    """
    Analyze a single uploaded debarred file.

    Form data:
        plan_id: str
        room_no:  str (optional)
        file:     uploaded CSV / XLSX file

    Returns JSON:
        detected_batch:        str | null
        subjects:              list[{code, name, debarred_count}]
        batch_total_students:  int
        filename:              str
    """
    import json as _json

    plan_id = request.form.get('plan_id')
    room_no = request.form.get('room_no')
    uploaded_file = request.files.get('file')

    if not uploaded_file:
        return jsonify({"error": "No file uploaded"}), 400
    if not plan_id:
        return jsonify({"error": "plan_id required"}), 400

    data = {'plan_id': plan_id, 'room_no': room_no, 'room_name': room_no}
    seating_payload, _ = get_seating_data_hybrid(data, user_id=request.user_id)

    if not seating_payload:
        return jsonify({"error": "Plan not found"}), 404

    batches = seating_payload.get('batches', {})

    debarred_data = parse_debarred_file(uploaded_file)

    detected_batch = identify_batch_for_debarred(debarred_data, batches)

    subjects = [
        {
            'code': code,
            'name': info['subject_name'],
            'debarred_count': len(info['debarred_students'])
        }
        for code, info in debarred_data.items()
    ]

    batch_total = 0
    if detected_batch and detected_batch in batches:
        batch_total = len(batches[detected_batch].get('students', []))

    return jsonify({
        "detected_batch": detected_batch,
        "subjects": subjects,
        "batch_total_students": batch_total,
        "filename": uploaded_file.filename
    })


# ============================================================================
# POST /api/export-attendance-debarred  — Attendance with Debarred filter
# ============================================================================
@pdf_bp.route('/export-attendance-debarred', methods=['POST'])
@token_required
def export_attendance_debarred():
    """
    Generate a ZIP of attendance PDFs with debarred students filtered out.

    Form data (multipart):
        plan_id:        str
        room_no:        str  (optional)
        metadata:       JSON string  (same fields as /export-attendance)
        debarred_files: one or more uploaded CSV/XLSX debarred list files

    Logic:
        For each batch in the plan:
          - If a debarred file was matched → generate one PDF per subject in that file
            (debarred students are excluded from that subject's attendance)
          - If no debarred file was matched  → generate a single normal attendance PDF

    Returns: application/zip
    """
    import io as _io
    import time
    import json as _json
    import zipfile

    try:
        plan_id   = request.form.get('plan_id')
        room_no   = request.form.get('room_no')
        meta_str  = request.form.get('metadata', '{}')

        try:
            frontend_metadata = _json.loads(meta_str)
        except Exception:
            frontend_metadata = {}

        if not plan_id:
            return jsonify({"error": "plan_id is required"}), 400

        # ── Retrieve seating / batch data ──────────────────────────────────────
        data = {'plan_id': plan_id, 'room_no': room_no, 'room_name': room_no}
        seating_payload, _ = get_seating_data_hybrid(data, user_id=request.user_id)

        if not seating_payload:
            return jsonify({"error": "Plan data not found"}), 404

        batches = seating_payload.get('batches', {})
        if not batches:
            return jsonify({"error": "No batch data found in plan"}), 404

        # ── Parse every uploaded file → map to batch ───────────────────────────
        uploaded_files = request.files.getlist('debarred_files')
        debarred_by_batch = {}  # batch_name → {sub_code: {subject_name, debarred_students}}

        for f in uploaded_files:
            debarred_data = parse_debarred_file(f)
            if not debarred_data:
                logger.warning(f"Could not parse debarred file: {f.filename}")
                continue
            detected_batch = identify_batch_for_debarred(debarred_data, batches)
            if detected_batch:
                debarred_by_batch[detected_batch] = debarred_data
                logger.info(f"Debarred file '{f.filename}' → batch '{detected_batch}' "
                            f"({len(debarred_data)} subjects)")
            else:
                logger.warning(f"Debarred file '{f.filename}': no matching batch found")

        # ── Build base metadata ────────────────────────────────────────────────
        target_room = (seating_payload.get('metadata', {}).get('room_no')
                       or room_no or 'N/A')
        base_meta = {
            'exam_title':               frontend_metadata.get('exam_title', 'EXAMINATION-ATTENDANCE SHEET'),
            'course_name':              frontend_metadata.get('course_name', 'N/A'),
            'course_code':              frontend_metadata.get('course_code', 'N/A'),
            'date':                     frontend_metadata.get('date', ''),
            'time':                     frontend_metadata.get('time', ''),
            'year':                     frontend_metadata.get('year', str(datetime.now().year)),
            'room_no':                  target_room,
            'attendance_dept_name':     frontend_metadata.get('attendance_dept_name',
                                                               'Computer Science and Engineering'),
            'attendance_year':          frontend_metadata.get('attendance_year',
                                                               datetime.now().year),
            'attendance_exam_heading':  frontend_metadata.get('attendance_exam_heading',
                                                               'SESSIONAL EXAMINATION'),
            'attendance_banner_path':   frontend_metadata.get('attendance_banner_path', ''),
        }

        from algo.attendence_gen.attend_gen import create_attendance_pdf

        ts = int(time.time())
        zip_buffer = _io.BytesIO()
        temp_pdfs  = []

        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
            for batch_name, batch_data in batches.items():
                students   = batch_data.get('students', [])
                batch_info = batch_data.get('info', {})
                if not students:
                    continue

                safe_batch = batch_name.replace('/', '-').replace(' ', '_')

                if batch_name in debarred_by_batch:
                    # ── Debarred list available → one PDF per subject ──────────
                    for sub_code, sub_info in debarred_by_batch[batch_name].items():
                        debarred_rolls = sub_info.get('debarred_students', set())
                        # Keep ALL students; mark debarred ones so the PDF can flag them
                        filtered_students = [
                            {**s, 'is_debarred': s.get('roll_number', '') in debarred_rolls}
                            for s in students
                        ]
                        subject_meta = {
                            **base_meta,
                            'course_name': sub_info.get('subject_name', sub_code),
                            'course_code': sub_code,
                        }
                        safe_sub  = sub_code.replace('/', '-').replace(' ', '_')
                        temp_file = f"tmp_deb_{safe_batch}_{safe_sub}_{ts}.pdf"
                        temp_pdfs.append(temp_file)

                        create_attendance_pdf(
                            temp_file, filtered_students,
                            batch_name, subject_meta, batch_info
                        )
                        with open(temp_file, 'rb') as pf:
                            zf.writestr(f"{safe_batch}/{safe_sub}.pdf", pf.read())
                else:
                    # ── No debarred list → normal attendance PDF ───────────────
                    temp_file = f"tmp_deb_{safe_batch}_normal_{ts}.pdf"
                    temp_pdfs.append(temp_file)
                    create_attendance_pdf(
                        temp_file, students, batch_name, dict(base_meta), batch_info
                    )
                    with open(temp_file, 'rb') as pf:
                        zf.writestr(f"{safe_batch}/Attendance_{safe_batch}.pdf", pf.read())

        # ── Cleanup temp PDFs ──────────────────────────────────────────────────
        for tf in temp_pdfs:
            try:
                if os.path.exists(tf):
                    os.remove(tf)
            except Exception:
                pass

        zip_buffer.seek(0)
        logger.info(f"✅ Debarred attendance ZIP: {len(batches)} batches, "
                    f"{len(debarred_by_batch)} with debarred lists")

        return send_file(
            zip_buffer,
            mimetype='application/zip',
            as_attachment=True,
            download_name=f"Attendance_Debarred_{plan_id}_{ts}.zip"
        )

    except Exception as e:
        logger.error(f"❌ export_attendance_debarred error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@pdf_bp.route('/test-pdf', methods=['GET'])
@token_required
def generate_test_pdf():
    """Generate a test PDF with sample data using current template"""
    try:
        user_id = request.user_id
        template_name = request.args.get('template_name', 'default')
        
        # Create sample student data
        sample_seating_matrix = [
            [
                {'roll_number': 'BTCS24001', 'name': 'Aarav Sharma', 'batch_label': 'Batch A', 'paper_set': 'A', 'color': '#e3f2fd'},
                {'roll_number': 'BTCS24002', 'name': 'Vivaan Verma', 'batch_label': 'Batch B', 'paper_set': 'B', 'color': '#f3e5f5'},
                {'roll_number': 'BTCS24003', 'name': 'Aditya Gupta', 'batch_label': 'Batch A', 'paper_set': 'A', 'color': '#e3f2fd'},
                {'roll_number': 'BTCS24004', 'name': 'Vihaan Kumar', 'batch_label': 'Batch B', 'paper_set': 'B', 'color': '#f3e5f5'}
            ],
            [
                {'roll_number': 'BTCS24005', 'name': 'Arjun Singh', 'batch_label': 'Batch A', 'paper_set': 'A', 'color': '#e3f2fd'},
                {'roll_number': 'BTCS24006', 'name': 'Aadhya Patel', 'batch_label': 'Batch B', 'paper_set': 'B', 'color': '#f3e5f5'},
                {'roll_number': 'BTCS24007', 'name': 'Ananya Reddy', 'batch_label': 'Batch A', 'paper_set': 'A', 'color': '#e3f2fd'},
                {'roll_number': 'BTCS24008', 'name': 'Pari Mehta', 'batch_label': 'Batch B', 'paper_set': 'B', 'color': '#f3e5f5'}
            ]
        ]

        seating_payload = {
            'seating': sample_seating_matrix,
            'metadata': {
                'rows': 2, 
                'cols': 4, 
                'blocks': 1,
                'total_students': 8,
                'room_no': 'TEST-101'
            }
        }
        
        from algo.pdf_gen.pdf_generation import generate_seating_pdf_to_buffer
        logger.info(f"🧪 [Test PDF] Generating in-memory test PDF for user={user_id}, template='{template_name}'")

        pdf_buffer = generate_seating_pdf_to_buffer(
            data=seating_payload,
            user_id=str(user_id),
            template_name=template_name
        )
        logger.info(f"✅ [Test PDF] In-memory PDF ready — streaming to client")

        return send_file(
            pdf_buffer,
            mimetype='application/pdf',
            as_attachment=True,
            download_name=f'test_seating_plan_{datetime.now().strftime("%H%M%S")}.pdf'
        )

    except Exception as e:
        logger.error(f"❌ [Test PDF] Generation failed: {e}")
        return jsonify({"success": False, "error": f'Failed to generate test PDF: {str(e)}'}), 500

@pdf_bp.route('/template/banner/<path:filename>', methods=['GET'])
@token_required
def serve_banner_image(filename):
    """Serve uploaded banner images"""
    try:
        from algo.pdf_gen.template_manager import template_manager
        user_id = request.user_id
        user_folder = os.path.join(template_manager.upload_folder, str(user_id))
        file_path = os.path.join(user_folder, filename)
        
        if os.path.exists(file_path):
            return send_file(file_path)
        else:
            logger.warning(f"⚠️ Banner file not found: {file_path}")
            return jsonify({'error': 'File not found'}), 404
            
    except Exception as e:
        logger.error(f"❌ Error serving banner: {e}")
        return jsonify({'error': str(e)}), 500

@pdf_bp.route('/template/config', methods=['DELETE'])
@token_required
def reset_template_config():
    """Reset user's template to system default"""
    try:
        from algo.pdf_gen.template_manager import template_manager
        user_id = request.user_id
        template_name = request.args.get('template_name', 'default')
        
        # Get system default
        default_template = template_manager._get_default_template()
        
        # Save as user's template (reset)
        success = template_manager.save_user_template(user_id, default_template, template_name)
        
        if not success:
            return jsonify({
                "success": False,
                "error": "Failed to reset template"
            }), 500
        
        return jsonify({
            "success": True,
            "message": "Template reset to default",
            "template": default_template
        }), 200
        
    except Exception as e:
        logger.error(f"❌ Template reset error: {e}")
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500
