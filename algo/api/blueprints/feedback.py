import logging
import sqlite3
from datetime import datetime
from flask import Blueprint, request, jsonify, current_app
from algo.database.db import get_db_connection
from algo.services.auth_service import token_required

feedback_bp = Blueprint('feedback', __name__)
logger = logging.getLogger(__name__)

@feedback_bp.route("/api/feedback", methods=["POST"])
@token_required
def submit_feedback():
    """
    Submit user feedback with optional file attachment.
    """
    try:
        issue_type = request.form.get('issueType')
        raw_priority = request.form.get('priority')
        description = request.form.get('description')
        feature_suggestion = request.form.get('featureSuggestion', '')
        additional_info = request.form.get('additionalInfo', '')
        
        # Map frontend labels to database constraints
        priority_map = {
            'High Priority': 'high',
            'Medium Priority': 'medium',
            'Low Priority': 'low',
            'Critical': 'critical'
        }
        priority = priority_map.get(raw_priority, raw_priority.lower() if raw_priority else 'medium')

        if not all([issue_type, priority, description]):
            return jsonify({"error": "Missing required fields"}), 400
        
        # Handle file upload
        file_path = None
        file_name = None
        if 'file' in request.files:
            file = request.files['file']
            if file and file.filename:
                try:
                    feedback_folder = current_app.config.get('FEEDBACK_FOLDER')
                    if not feedback_folder:
                         from pathlib import Path
                         feedback_folder = Path(current_app.root_path).parent / "feedback_files"
                    
                    feedback_folder.mkdir(exist_ok=True, parents=True)
                    timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
                    safe_filename = f"{timestamp}_{file.filename}"
                    target_path = feedback_folder / safe_filename
                    file.save(str(target_path))
                    file_path = str(target_path)
                    file_name = file.filename
                except Exception as file_error:
                    logger.error(f"File upload error: {file_error}")
        
        user_id = getattr(request, 'user_id', 1)
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            INSERT INTO feedback (
                user_id, issue_type, priority, description,
                feature_suggestion, additional_info, file_path, file_name
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            user_id, issue_type, priority, description,
            feature_suggestion, additional_info,
            file_path, file_name
        ))
        
        feedback_id = cur.lastrowid
        conn.commit()
        conn.close()
        
        logger.info(f"📝 Feedback submitted: ID={feedback_id}, User={user_id}, Priority={priority}")
        
        return jsonify({
            "success": True,
            "message": "Feedback submitted successfully",
            "feedback_id": feedback_id
        }), 201
        
    except Exception as e:
        logger.error(f"Feedback submission error: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500


@feedback_bp.route("/api/feedback", methods=["GET"])
@token_required
def get_user_feedback():
    """
    Get feedback submitted by current user.
    """
    try:
        user_id = getattr(request, 'user_id', None)
        if not user_id:
            return jsonify({"error": "User not authenticated"}), 401
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            SELECT id, issue_type, priority, description,
                   feature_suggestion, additional_info, file_name,
                   status, created_at, resolved_at, admin_response
            FROM feedback
            WHERE user_id = ?
            ORDER BY created_at DESC
        """, (user_id,))
        
        feedback_list = [dict(row) for row in cur.fetchall()]
        conn.close()
        
        return jsonify({
            "success": True,
            "feedback": feedback_list
        })
        
    except Exception as e:
        logger.error(f"Get feedback error: {str(e)}")
        return jsonify({"error": str(e)}), 500

@feedback_bp.route("/api/feedback/admin/all", methods=["GET"])
@token_required
def get_all_feedback_admin():
    """
    Get all feedback submitted by all users (Admin only).
    """
    try:
        user_role = getattr(request, 'user_role', None)

        if user_role not in ('admin', 'developer', 'ADMIN'):
            return jsonify({"error": "Admin access required"}), 403
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            SELECT 
                f.id, f.user_id, f.issue_type, f.priority, f.description,
                f.feature_suggestion, f.additional_info, f.file_name,
                f.status, f.created_at, f.resolved_at, f.admin_response,
                u.username, u.email
            FROM feedback f
            LEFT JOIN users u ON f.user_id = u.id
            ORDER BY f.created_at DESC
        """)
        
        feedback_list = []
        for row in cur.fetchall():
            feedback_dict = dict(row)
            feedback_list.append(feedback_dict)
        
        conn.close()
        
        return jsonify({
            "success": True,
            "feedback": feedback_list,
            "total": len(feedback_list)
        })
        
    except Exception as e:
        logger.error(f"Get all feedback error: {str(e)}")
        return jsonify({"error": str(e)}), 500


@feedback_bp.route("/api/feedback/<int:feedback_id>/status", methods=["PUT"])
@token_required
def update_feedback_status(feedback_id):
    """
    Update feedback status (Admin only).
    """
    try:
        user_role = getattr(request, 'user_role', None)
        
        if user_role not in ('admin', 'developer', 'ADMIN'):
            return jsonify({"error": "Admin access required"}), 403
        
        data = request.get_json()
        status = data.get('status')
        admin_response = data.get('admin_response', '')
        
        if not status:
            return jsonify({"error": "Status is required"}), 400
        
        if status not in ('pending', 'resolved', 'rejected'):
            return jsonify({"error": "Invalid status"}), 400
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Update feedback status
        resolved_at = None
        if status == 'resolved':
            resolved_at = datetime.now().isoformat()
        
        cur.execute("""
            UPDATE feedback
            SET status = ?, admin_response = ?, resolved_at = ?
            WHERE id = ?
        """, (status, admin_response, resolved_at, feedback_id))
        
        conn.commit()
        
        # Fetch updated feedback
        cur.execute("""
            SELECT 
                f.id, f.user_id, f.issue_type, f.priority, f.description,
                f.feature_suggestion, f.additional_info, f.file_name,
                f.status, f.created_at, f.resolved_at, f.admin_response,
                u.username, u.email
            FROM feedback f
            LEFT JOIN users u ON f.user_id = u.id
            WHERE f.id = ?
        """, (feedback_id,))
        
        row = cur.fetchone()
        conn.close()
        
        if not row:
            return jsonify({"error": "Feedback not found"}), 404
        
        feedback_dict = dict(row)
        
        logger.info(f"🔄 Feedback status updated: ID={feedback_id}, Status={status}")
        
        return jsonify({
            "success": True,
            "message": "Feedback status updated successfully",
            "feedback": feedback_dict
        }), 200
        
    except Exception as e:
        logger.error(f"Update feedback status error: {str(e)}")
        return jsonify({"error": str(e)}), 500