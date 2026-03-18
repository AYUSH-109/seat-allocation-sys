# Administrative and authentication endpoints.
# Handles user login/signup and provides utilities for bulk database table operations.
from flask import Blueprint, jsonify, request, send_file, current_app
from algo.database.db import get_db_connection
from algo.services.auth_service import token_required, login as auth_login, signup as auth_signup, google_auth_handler, get_user_by_token, get_user_by_id, update_user_profile, VALID_ROLES, role_required
import sqlite3

# Helper for optional rate limiting
def get_limiter():
    """Get rate limiter from app if available"""
    return getattr(current_app, 'limiter', None)

# Combined Auth and Admin for simplicity as per legacy app structure usually mostly admin
# But creating separate Blueprints is cleaner

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')
admin_bp = Blueprint('admin', __name__, url_prefix='/api')

# --- AUTH STUBS (Legacy had auth but MVP was single user) ---

@auth_bp.route('/login', methods=['POST'])
def login():
    # Apply rate limit if available (5 per minute on login)
    limiter = get_limiter()
    if limiter:
        limiter.limit("5 per minute")(lambda: None)()
    
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')
    
    success, user_data, token = auth_login(email, password)
    if success:
        return jsonify({"status": "success", "token": token, "user": user_data})
    return jsonify({"status": "error", "message": user_data or "Invalid email or password"}), 401

@auth_bp.route('/signup', methods=['POST'])
def signup():
    data = request.get_json()
    username = data.get('username')
    email = data.get('email')
    password = data.get('password')
    role = data.get('role', 'faculty').lower()
    
    success, user_data, token = auth_signup(username, email, password, role)
    if success:
        return jsonify({"status": "success", "token": token, "user": user_data})
    return jsonify({"status": "error", "message": user_data}), 400

@auth_bp.route('/profile', methods=['GET'])
@token_required
def profile():
    """Retrieve current user profile using JWT context"""
    try:
        user_id = getattr(request, 'user_id', None)
        if not user_id:
             return jsonify({
                "status": "error", 
                "message": "Auth context missing"
            }), 401

        user = get_user_by_id(user_id)
        
        if not user:
            return jsonify({
                "status": "error", 
                "message": "User profile not found"
            }), 404
            
        return jsonify({
            "status": "success", 
            "user": user
        })
    except Exception as e:
        return jsonify({
            "status": "error", 
            "message": f"Profile retrieval failed: {str(e)}"
        }), 500

@auth_bp.route('/profile', methods=['PUT'])
@token_required
def update_profile():
    """Update current user profile"""
    try:
        user_id = getattr(request, 'user_id', None)
        if not user_id:
            return jsonify({
                "status": "error",
                "message": "Auth context missing"
            }), 401

        data = request.get_json()
        username = data.get('username')
        email = data.get('email')

        success, message = update_user_profile(user_id, username, email)
        
        if success:
            # Fetch updated user data
            user = get_user_by_id(user_id)
            return jsonify({
                "status": "success",
                "message": message,
                "user": user
            })
        return jsonify({
            "status": "error",
            "message": message
        }), 400
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"Profile update failed: {str(e)}"
        }), 500

@auth_bp.route('/google', methods=['POST'])
def google_auth():
    data = request.get_json(silent=True) or {}
    token = data.get('token')
    role = data.get('role')  # Optional: provided when user selects role for new account
    signup_token = data.get('signup_token')  # Optional: continuation token for role-selection flow

    # For first step, Google token is required. For second step, signup_token may be used.
    if not token and not signup_token:
        return jsonify({"status": "error", "message": "Missing Google token"}), 400

    success, user_data, auth_token = google_auth_handler(token, role=role, signup_token=signup_token)
    if success:
        # Check if this is a needs_role response (new user without role selection)
        if isinstance(user_data, dict) and user_data.get('needs_role'):
            return jsonify({
                "status": "needs_role",
                "needs_role": True,
                "email": user_data.get('email'),
                "full_name": user_data.get('full_name'),
                "signup_token": user_data.get('signup_token'),
                "available_roles": VALID_ROLES
            })
        return jsonify({"status": "success", "token": auth_token, "user": user_data})
    return jsonify({"status": "error", "message": user_data}), 401

@auth_bp.route('/roles', methods=['GET'])
def get_roles():
    """Return available roles for signup"""
    return jsonify({
        "status": "success",
        "roles": VALID_ROLES,
        "descriptions": {
            "developer": "Full system access including database management",
            "admin": "Administrative access for managing seat plans and users",
            "faculty": "Faculty access for viewing plans and providing feedback"
        }
    })

@auth_bp.route('/logout', methods=['POST'])
def logout():
    """Logout endpoint (stateless)"""
    return jsonify({"status": "success", "message": "Logged out successfully"})

# --- CONSTANTS ---
ALLOWED_TABLES = ['students', 'classrooms', 'uploads', 'allocations', 'feedback', 'user_activity', 'allocation_sessions']

TABLE_CONFIG = {
    'students': {
        'searchable': ['name', 'enrollment', 'email'],
        'editable': ['name', 'email']
    },
    'classrooms': {
        'searchable': ['name'],
        'editable': ['name', 'rows', 'cols']
    },
    'uploads': {
        'searchable': ['filename', 'batch_name'],
        'editable': []
    },
    'allocations': {
        'searchable': ['student_id', 'room_id'],
        'editable': []
    },
    'allocation_sessions': {
        'searchable': ['plan_id', 'status'],
        'editable': ['status']
    }
}

# --- ADMIN / SYSTEM ROUTES ---

@admin_bp.route('/database/table/<table_name>', methods=['GET'])
@token_required
def get_table_data(table_name):
    if table_name not in ALLOWED_TABLES:
        return jsonify({"success": False, "error": "Table not allowed"}), 403
    try:
        page = max(1, int(request.args.get('page', 1)))
        per_page = min(100, max(1, int(request.args.get('per_page', 50))))
        search = request.args.get('search', '').strip()
        sort_by = request.args.get('sort_by', 'id').strip()
        sort_order = 'DESC' if request.args.get('sort_order', 'DESC').upper() == 'DESC' else 'ASC'
        
        conn = get_db_connection()
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        
        # Get columns
        cur.execute(f"PRAGMA table_info({table_name})")
        columns = [{'name': c[1], 'type': c[2], 'nullable': not c[3], 'primary_key': bool(c[5])} for c in cur.fetchall()]
        col_names = [c['name'] for c in columns]
        
        # Validate sort_by
        if sort_by not in col_names:
            sort_by = col_names[0] if col_names else 'id'
            
        # Build query with Data Isolation
        user_id = request.user_id
        searchable = TABLE_CONFIG.get(table_name, {}).get('searchable', col_names[:3])
        
        # User isolation logic
        where_clauses = []
        params = []

        if table_name == 'allocation_sessions':
            where_clauses.append("user_id = ?")
            params.append(user_id)
        elif table_name == 'uploads':
            where_clauses.append("session_id IN (SELECT session_id FROM allocation_sessions WHERE user_id = ?)")
            params.append(user_id)
        elif table_name == 'students':
            where_clauses.append("upload_id IN (SELECT u.id FROM uploads u JOIN allocation_sessions s ON u.session_id = s.session_id WHERE s.user_id = ?)")
            params.append(user_id)
        elif table_name == 'allocations':
            where_clauses.append("session_id IN (SELECT session_id FROM allocation_sessions WHERE user_id = ?)")
            params.append(user_id)
        elif table_name == 'feedback':
            where_clauses.append("user_id = ?")
            params.append(user_id)
        elif table_name == 'user_activity':
            where_clauses.append("user_id = ?")
            params.append(user_id)
        # classrooms is global

        if search and searchable:
            search_conditions = [f"{c} LIKE ?" for c in searchable if c in col_names]
            if search_conditions:
                where_clauses.append(f"({' OR '.join(search_conditions)})")
                params.extend([f"%{search}%" for _ in search_conditions])

        where_stmt = f" WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
        base_query = f"SELECT * FROM {table_name}{where_stmt}"
        count_query = f"SELECT COUNT(*) FROM {table_name}{where_stmt}"
        
        # Get total
        cur.execute(count_query, params)
        total = cur.fetchone()[0]
        
        # Get data
        base_query += f" ORDER BY {sort_by} {sort_order} LIMIT ? OFFSET ?"
        params.extend([per_page, (page - 1) * per_page])
        
        cur.execute(base_query, params)
        data = [dict(r) for r in cur.fetchall()]
        conn.close()
        
        return jsonify({
            "success": True, 
            "columns": columns, 
            "data": data,
            "pagination": {
                "page": page, 
                "per_page": per_page, 
                "total": total, 
                "pages": (total + per_page - 1) // per_page if per_page > 0 else 1
            }
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@admin_bp.route('/database/table/<table_name>/<int:record_id>', methods=['PUT', 'DELETE'])
@token_required
def modify_record(table_name, record_id):
    if table_name not in ALLOWED_TABLES:
        return jsonify({"success": False, "error": "Table not allowed"}), 403
    
    conn = get_db_connection()
    cur = conn.cursor()
    
    try:
        # Ownership check
        user_id = request.user_id
        ownership_query = ""
        ownership_params = [record_id]

        if table_name == 'allocation_sessions':
            ownership_query = f"SELECT 1 FROM {table_name} WHERE session_id = ? AND user_id = ?"
            ownership_params.append(user_id)
        elif table_name == 'uploads':
            ownership_query = f"SELECT 1 FROM {table_name} WHERE id = ? AND session_id IN (SELECT session_id FROM allocation_sessions WHERE user_id = ?)"
            ownership_params.append(user_id)
        elif table_name == 'students':
            ownership_query = f"SELECT 1 FROM {table_name} WHERE id = ? AND upload_id IN (SELECT u.id FROM uploads u JOIN allocation_sessions s ON u.session_id = s.session_id WHERE s.user_id = ?)"
            ownership_params.append(user_id)
        elif table_name == 'allocations':
            ownership_query = f"SELECT 1 FROM {table_name} WHERE id = ? AND session_id IN (SELECT session_id FROM allocation_sessions WHERE user_id = ?)"
            ownership_params.append(user_id)
        elif table_name == 'feedback' or table_name == 'user_activity':
            ownership_query = f"SELECT 1 FROM {table_name} WHERE id = ? AND user_id = ?"
            ownership_params.append(user_id)
        elif table_name == 'classrooms':
            ownership_query = f"SELECT 1 FROM {table_name} WHERE id = ?"
        
        if ownership_query:
            cur.execute(ownership_query, ownership_params)
            if not cur.fetchone():
                conn.close()
                return jsonify({"success": False, "error": "Access denied or record not found"}), 403

        if request.method == 'PUT':
            data = request.get_json()
            editable = TABLE_CONFIG.get(table_name, {}).get('editable', [])
            update_data = {k: v for k, v in data.items() if k in editable}
            
            if not update_data:
                return jsonify({"success": False, "error": "No editable fields"}), 400
            
            set_clause = ", ".join([f"{k} = ?" for k in update_data])
            # Use session_id for allocation_sessions table
            pk_col = 'session_id' if table_name == 'allocation_sessions' else 'id'
            cur.execute(f"UPDATE {table_name} SET {set_clause} WHERE {pk_col} = ?", list(update_data.values()) + [record_id])
            
            conn.commit()
            conn.close()
            return jsonify({"success": True, "message": "Updated"})
            
        elif request.method == 'DELETE':
            pk_col = 'session_id' if table_name == 'allocation_sessions' else 'id'
            cur.execute(f"DELETE FROM {table_name} WHERE {pk_col} = ?", (record_id,))
            
            conn.commit()
            conn.close()
            return jsonify({"success": True, "message": "Deleted"})
            
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@admin_bp.route('/database/table/<table_name>/bulk-delete', methods=['POST'])
@token_required
def bulk_delete(table_name):
    if table_name not in ALLOWED_TABLES:
        return jsonify({"success": False, "error": "Table not allowed"}), 403
        
    try:
        data = request.get_json()
        ids = data.get('ids', [])
        if not ids:
            return jsonify({"success": False, "error": "No IDs provided"}), 400
            
        user_id = request.user_id
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Ownership check for each ID
        placeholders = ','.join(['?'] * len(ids))
        ownership_query = ""
        ownership_params = ids + [user_id]

        if table_name == 'allocation_sessions':
            ownership_query = f"SELECT session_id FROM {table_name} WHERE session_id IN ({placeholders}) AND user_id = ?"
        elif table_name == 'uploads':
            ownership_query = f"SELECT id FROM {table_name} WHERE id IN ({placeholders}) AND session_id IN (SELECT session_id FROM allocation_sessions WHERE user_id = ?)"
        elif table_name == 'students':
            ownership_query = f"SELECT id FROM {table_name} WHERE id IN ({placeholders}) AND upload_id IN (SELECT u.id FROM uploads u JOIN allocation_sessions s ON u.session_id = s.session_id WHERE s.user_id = ?)"
        elif table_name == 'allocations':
            ownership_query = f"SELECT id FROM {table_name} WHERE id IN ({placeholders}) AND session_id IN (SELECT session_id FROM allocation_sessions WHERE user_id = ?)"
        elif table_name == 'feedback' or table_name == 'user_activity':
            ownership_query = f"SELECT id FROM {table_name} WHERE id IN ({placeholders}) AND user_id = ?"
        elif table_name == 'classrooms':
             ownership_query = f"SELECT id FROM {table_name} WHERE id IN ({placeholders})"
             ownership_params = ids

        if ownership_query:
            cur.execute(ownership_query, ownership_params)
            valid_ids = [row[0] for row in cur.fetchall()]
            if not valid_ids:
                conn.close()
                return jsonify({"success": False, "error": "Access denied or records not found"}), 403
            
            # Delete only valid IDs
            placeholders = ','.join(['?'] * len(valid_ids))
            pk_col = 'session_id' if table_name == 'allocation_sessions' else 'id'
            cur.execute(f"DELETE FROM {table_name} WHERE {pk_col} IN ({placeholders})", valid_ids)
        
        conn.commit()
        conn.close()
        return jsonify({"success": True, "message": f"Deleted {cur.rowcount} records"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@admin_bp.route('/database/table/<table_name>/export', methods=['GET'])
@token_required
def export_table(table_name):
    if table_name not in ALLOWED_TABLES:
        return jsonify({"success": False, "error": "Table not allowed"}), 403
        
    try:
        import csv
        import io
        from flask import make_response
        
        user_id = request.user_id
        conn = get_db_connection()
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        
        # User isolation logic (reusing get_table_data logic)
        where_clauses = []
        params = []

        if table_name == 'allocation_sessions':
            where_clauses.append("user_id = ?")
            params.append(user_id)
        elif table_name == 'uploads':
            where_clauses.append("session_id IN (SELECT session_id FROM allocation_sessions WHERE user_id = ?)")
            params.append(user_id)
        elif table_name == 'students':
            where_clauses.append("upload_id IN (SELECT u.id FROM uploads u JOIN allocation_sessions s ON u.session_id = s.session_id WHERE s.user_id = ?)")
            params.append(user_id)
        elif table_name == 'allocations':
            where_clauses.append("session_id IN (SELECT session_id FROM allocation_sessions WHERE user_id = ?)")
            params.append(user_id)
        elif table_name == 'feedback' or table_name == 'user_activity':
            where_clauses.append("user_id = ?")
            params.append(user_id)

        where_stmt = f" WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
        cur.execute(f"SELECT * FROM {table_name}{where_stmt}", params)
        rows = cur.fetchall()
        
        if not rows:
             return jsonify({"success": False, "error": "No data"}), 404
             
        keys = rows[0].keys()
        
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=keys)
        writer.writeheader()
        for row in rows:
            writer.writerow(dict(row))
            
        output.seek(0)
        conn.close()
        
        response = make_response(output.getvalue())
        response.headers["Content-Disposition"] = f"attachment; filename={table_name}.csv"
        response.headers["Content-type"] = "text/csv"
        return response
        
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@admin_bp.route('/reset-data', methods=['POST'])
@token_required
def reset_data():
    try:
        user_id = request.user_id
        conn = get_db_connection()
        cur = conn.cursor()
        # Order matters for FK
        tables = ['allocations', 'students', 'uploads', 'allocation_sessions', 'allocation_history', 'feedback']
        
        for t in tables:
            # User isolation deletion
            if t == 'allocation_sessions':
                cur.execute(f"DELETE FROM {t} WHERE user_id = ?", (user_id,))
            elif t == 'uploads':
                cur.execute(f"DELETE FROM {t} WHERE session_id IN (SELECT session_id FROM allocation_sessions WHERE user_id = ?)", (user_id,))
            elif t == 'students':
                cur.execute(f"DELETE FROM {t} WHERE upload_id IN (SELECT u.id FROM uploads u JOIN allocation_sessions s ON u.session_id = s.session_id WHERE s.user_id = ?)", (user_id,))
            elif t == 'allocations':
                cur.execute(f"DELETE FROM {t} WHERE session_id IN (SELECT session_id FROM allocation_sessions WHERE user_id = ?)", (user_id,))
            elif t == 'allocation_history':
                cur.execute(f"DELETE FROM {t} WHERE session_id IN (SELECT session_id FROM allocation_sessions WHERE user_id = ?)", (user_id,))
            elif t == 'feedback':
                cur.execute(f"DELETE FROM {t} WHERE user_id = ?", (user_id,))
            
        conn.commit()
        conn.close()
        return jsonify({"status": "success", "message": "User data cleared"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@admin_bp.route('/database/overview', methods=['GET'])
@token_required
def db_overview():
    try:
        user_id = request.user_id
        conn = get_db_connection()
        cur = conn.cursor()
        tables = ['students', 'classrooms', 'uploads', 'allocations', 'feedback']
        counts = {}
        for t in tables:
            where_stmt = ""
            params = []
            if t == 'uploads':
                where_stmt = " WHERE session_id IN (SELECT session_id FROM allocation_sessions WHERE user_id = ?)"
                params.append(user_id)
            elif t == 'students':
                where_stmt = " WHERE upload_id IN (SELECT u.id FROM uploads u JOIN allocation_sessions s ON u.session_id = s.session_id WHERE s.user_id = ?)"
                params.append(user_id)
            elif t == 'allocations':
                where_stmt = " WHERE session_id IN (SELECT session_id FROM allocation_sessions WHERE user_id = ?)"
                params.append(user_id)
            elif t == 'feedback':
                where_stmt = " WHERE user_id = ?"
                params.append(user_id)
            # classrooms is global
            
            cur.execute(f"SELECT COUNT(*) FROM {t}{where_stmt}", params)
            counts[t] = cur.fetchone()[0]
        conn.close()
        return jsonify({"success": True, "overview": {"tables": counts}})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@admin_bp.route('/database/hierarchy', methods=['GET'])
@token_required
def get_db_hierarchy():
    """Get database hierarchy data - LEGACY COMPATIBLE"""
    try:
        conn = get_db_connection()
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        
        # Main hierarchy query with Data Isolation
        user_id = request.user_id
        cur.execute("""
            SELECT s.session_id, s.plan_id, s.total_students, s.allocated_count, s.status, s.created_at,
                   u.batch_name, u.batch_color, u.batch_id, u.id as upload_id, COUNT(st.id) as batch_student_count
            FROM allocation_sessions s
            LEFT JOIN uploads u ON s.session_id = u.session_id
            LEFT JOIN students st ON u.id = st.upload_id
            WHERE s.user_id = ?
            GROUP BY s.session_id, u.batch_id
            ORDER BY s.created_at DESC, u.batch_name
        """, (user_id,))
        rows = cur.fetchall()
        
        hierarchy = {}
        for row in rows:
            sid = row['session_id']
            if sid not in hierarchy:
                hierarchy[sid] = {
                    'session_id': sid, 
                    'plan_id': row['plan_id'], 
                    'total_students': row['total_students'],
                    'allocated_count': row['allocated_count'], 
                    'status': row['status'], 
                    'created_at': row['created_at'], 
                    'batches': {}
                }
            
            if row['batch_name']:
                hierarchy[sid]['batches'][row['batch_name']] = {
                    'batch_name': row['batch_name'], 
                    'batch_id': row['batch_id'], 
                    'upload_id': row['upload_id'],
                    'batch_color': row['batch_color'], 
                    'student_count': row['batch_student_count'] or 0
                }
        
        # Populate students for each batch
        for sid in hierarchy:
            for bn in hierarchy[sid]['batches']:
                bid = hierarchy[sid]['batches'][bn]['batch_id']
                # Get students for this batch
                cur.execute("""
                    SELECT id, enrollment, name, department, batch_color 
                    FROM students 
                    WHERE batch_id = ? 
                    ORDER BY enrollment
                """, (bid,))
                hierarchy[sid]['batches'][bn]['students'] = [dict(r) for r in cur.fetchall()]
        
        conn.close()
        return jsonify({"success": True, "hierarchy": list(hierarchy.values())})
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500
