# Plan and history management endpoints.
# Allows users to retrieve and review recent seating plans and their associated batch/room counts.
from flask import Blueprint, jsonify, request
from algo.database.db import get_db_connection
from algo.services.auth_service import token_required
import sqlite3
import logging

plans_bp = Blueprint('plans', __name__, url_prefix='/api/plans')
logger = logging.getLogger(__name__)

@plans_bp.route('/recent', methods=['GET'])
@token_required
def get_recent_plans():
    """Get recent plans (sessions) with batch info"""
    user_id = request.user_id 
    try:
        conn = get_db_connection()
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        
        # Logic ported from legacy app.py
        cur.execute("""
            SELECT 
                s.session_id,
                s.plan_id,
                s.status,
                s.created_at,
                s.completed_at,
                s.last_activity,
                s.total_students,
                s.allocated_count,
                COUNT(DISTINCT a.classroom_id) as room_count
            FROM allocation_sessions s
            LEFT JOIN allocations a ON s.session_id = a.session_id
            WHERE s.status IN ('active', 'completed') AND s.user_id = ?
            GROUP BY s.session_id
            ORDER BY s.last_activity DESC
            LIMIT 20
        """, (user_id,))
        
        plans = []
        rows = cur.fetchall()
        
        for row in rows:
            plan = dict(row)
            
            # Get batch info
            batch_cur = conn.cursor() # specific cursor
            batch_cur.execute("""
                SELECT DISTINCT u.batch_name, u.batch_color
                FROM uploads u
                WHERE u.session_id = ?
                ORDER BY u.created_at
            """, (plan['session_id'],))
            
            batches = []
            for batch_row in batch_cur.fetchall():
                batches.append({
                    'name': batch_row[0],
                    'color': batch_row[1] or '#3b82f6'
                })
            
            plan['batches'] = batches
            plans.append(plan)
        
        conn.close()
        
        logger.info(f"📋 Retrieved {len(plans)} recent plans for user {user_id}")
        
        return jsonify({
            "success": True, 
            "plans": plans, 
            "total": len(plans)
        })
    except Exception as e:
        logger.error(f"Error fetching plans: {e}")
        return jsonify({"success": False, "error": str(e)}), 500
