# api/blueprints/students.py - FIXED VERSION
from flask import Blueprint, request, jsonify
from algo.services.auth_service import token_required
import logging
import os
import json

student_bp = Blueprint('students', __name__, url_prefix='/api')
logger = logging.getLogger(__name__)

def _get_conn():
    from algo.database.db import get_db_connection
    return get_db_connection()

ALLOWED_EXTENSIONS = {'csv', 'xlsx', 'xls'}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS
@student_bp.route('/upload', methods=['POST'])
@token_required
def upload_students():
    """Step 1: Parse and preview student data"""
    try:
        from algo.utils.parser import StudentDataParser
        
        file = request.files.get('file')
        mode = int(request.form.get('mode', 2))
        batch_name = request.form.get('batch_name', 'Default')
        semester_name = request.form.get('semester_name', 'I')
        name_col = request.form.get('nameColumn')
        enrollment_col = request.form.get('enrollmentColumn')
        
        if not file:
            return jsonify({"error": "No file uploaded"}), 400
        if not allowed_file(file.filename):
            return jsonify({"error": f"Invalid file type. Allowed: {ALLOWED_EXTENSIONS}"}), 400
    
        # Check size
        file.seek(0, 2)  # Seek to end
        size = file.tell()
        file.seek(0)  # Reset
        
        if size > MAX_FILE_SIZE:
            return jsonify({"error": f"File too large. Max: {MAX_FILE_SIZE // 1024 // 1024}MB"}), 400
            
        parser = StudentDataParser()
        
        # Parse file
        parse_result = parser.parse_file(
            file_input=file,
            mode=mode,
            batch_name=batch_name,
            name_col=name_col,
            enrollment_col=enrollment_col
        )
        
        # Store in temp cache
        user_id = getattr(request, 'user_id', None)
        if not user_id:
            return jsonify({"error": "Authentication required"}), 401
        temp_dir = os.path.join('algo', 'cache', 'temp_uploads', str(user_id))
        os.makedirs(temp_dir, exist_ok=True)
        
        temp_file = os.path.join(temp_dir, f"{parse_result.batch_id}.json")
        
        # Save parse result
        with open(temp_file, 'w') as f:
            json.dump({
                'batch_id': parse_result.batch_id,
                'batch_name': parse_result.batch_name,
                'semester_name': semester_name,
                'batch_color': parse_result.batch_color,
                'source_filename': file.filename,
                'data': parse_result.data,
                'rows_extracted': parse_result.rows_extracted
            }, f)
        
        sample = parse_result.data.get(batch_name, [])[:10]
        
        return jsonify({
            "success": True,
            "batch_id": parse_result.batch_id,
            "batch_name": parse_result.batch_name,
            "batch_color": parse_result.batch_color,
            "rows_extracted": parse_result.rows_extracted,
            "sample": sample,
            "warnings": [str(w) for w in parse_result.warnings]
        }), 200
        
    except Exception as e:
        logger.error(f"Upload error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@student_bp.route('/commit-upload', methods=['POST'])
@token_required
def commit_upload():
    """
    Step 2: Persist parsed data to DB
    
    FIXED: Now updates session total_students after commit
    """
    try:
        data = request.get_json()
        batch_id = data.get('batch_id')
        session_id = data.get('session_id')
        
        if not batch_id:
            return jsonify({"error": "batch_id required"}), 400
        
        user_id = getattr(request, 'user_id', None)
        if not user_id:
            return jsonify({"error": "Authentication required"}), 401
        
        # Verify session ownership if session_id provided
        if session_id:
            conn_check = _get_conn()
            cur_check = conn_check.cursor()
            cur_check.execute("SELECT user_id FROM allocation_sessions WHERE session_id = ?", (session_id,))
            row = cur_check.fetchone()
            conn_check.close()
            if row and row[0] is not None and row[0] != user_id:
                return jsonify({"error": "Access denied - you do not own this session"}), 403
            
        # Load from temp cache
        temp_file = os.path.join('algo', 'cache', 'temp_uploads', str(user_id), f"{batch_id}.json")
        
        if not os.path.exists(temp_file):
            return jsonify({"error": "Upload session expired. Please re-upload."}), 404
            
        with open(temp_file, 'r') as f:
            parse_data = json.load(f)
            
        batch_name = parse_data['batch_name']
        semester_name = parse_data.get('semester_name', 'I')
        batch_color = parse_data.get('batch_color', '#BFDBFE')
        filename = parse_data.get('source_filename', 'uploaded_file')
        students_raw = parse_data['data'].get(batch_name, [])
        
        conn = _get_conn()
        cur = conn.cursor()
        
        try:
            # 1. Create upload record
            cur.execute("""
                INSERT INTO uploads (session_id, batch_id, batch_name, semester, original_filename, file_size, batch_color)
                VALUES (?, ?, ?, ?, ?, 0, ?)
            """, (session_id, batch_id, batch_name, semester_name, filename, batch_color))
            
            upload_id = cur.lastrowid
            
            # 2. Bulk insert students
            inserted = 0
            for s in students_raw:
                enrollment = s.get('enrollmentNo') or s.get('enrollment')
                if not enrollment:
                    continue
                    
                try:
                    cur.execute("""
                        INSERT INTO students (upload_id, batch_id, batch_name, enrollment, name, batch_color, department)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    """, (
                        upload_id,
                        batch_id,
                        batch_name,
                        str(enrollment).strip(),
                        s.get('name', ''),
                        batch_color,
                        s.get('department', '')
                    ))
                    inserted += 1
                except Exception as insert_err:
                    logger.warning(f"Skip duplicate: {enrollment}")
            
            # ✅ CRITICAL FIX: Update session total_students if linked to session
            if session_id:
                cur.execute("""
                    SELECT COUNT(*) FROM students s
                    JOIN uploads u ON s.upload_id = u.id
                    WHERE u.session_id = ?
                """, (session_id,))
                new_total = cur.fetchone()[0] or 0
                
                cur.execute("""
                    UPDATE allocation_sessions
                    SET total_students = ?, last_activity = CURRENT_TIMESTAMP
                    WHERE session_id = ?
                """, (new_total, session_id))
                
                logger.info(f"📊 Updated session {session_id} total to {new_total}")
            
            conn.commit()
            
            # Cleanup temp file
            try:
                os.remove(temp_file)
            except:
                pass
            
            logger.info(f"✅ Committed {inserted} students from batch {batch_name}")
            
            return jsonify({
                "success": True,
                "upload_id": upload_id,
                "batch_id": batch_id,
                "batch_name": batch_name,
                "batch_color": batch_color,
                "inserted": inserted,
                "session_id": session_id
            }), 200
            
        except Exception as db_err:
            conn.rollback()
            raise db_err
        finally:
            conn.close()
        
    except Exception as e:
        logger.error(f"Commit error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ✅ FIXED - Add user isolation
@student_bp.route('/students', methods=['GET'])
@token_required
def get_students():
    user_id = getattr(request, 'user_id', None)
    
    conn = _get_conn()
    conn.row_factory = lambda c, r: dict(zip([col[0] for col in c.description], r))
    cur = conn.cursor()
    
    # Only get students from user's sessions
    cur.execute("""
        SELECT s.* FROM students s
        JOIN uploads u ON s.upload_id = u.id
        JOIN allocation_sessions sess ON u.session_id = sess.session_id
        WHERE sess.user_id = ?
        ORDER BY s.id DESC LIMIT 1000
    """, (user_id,))
    
    rows = cur.fetchall()
    conn.close()
    
    return jsonify(rows), 200