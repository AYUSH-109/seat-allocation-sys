from typing import List, Dict, Optional, Tuple
from algo.database.db import get_db

class StudentQueries:
    @staticmethod
    def create_upload(session_id: int, batch_id: str, batch_name: str, filename: str, file_size: int, batch_color: str) -> int:
        db = get_db()
        cursor = db.execute("""
            INSERT INTO uploads (session_id, batch_id, batch_name, original_filename, file_size, batch_color)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (session_id, batch_id, batch_name, filename, file_size, batch_color))
        db.commit()
        return cursor.lastrowid

    @staticmethod
    def bulk_insert_students(students_data: List[tuple]):
        """
        students_data: list of (upload_id, batch_id, batch_name, enrollment, name, color, department)
        """
        db = get_db()
        db.executemany("""
            INSERT OR IGNORE INTO students 
            (upload_id, batch_id, batch_name, enrollment, name, batch_color, department)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, students_data)
        db.commit()

    @staticmethod
    def get_students_by_session(session_id: int) -> List[Dict]:
        """Get all students associated with a session (via uploads)"""
        db = get_db()
        cursor = db.execute("""
            SELECT s.*, u.semester 
            FROM students s
            JOIN uploads u ON s.upload_id = u.id
            WHERE u.session_id = ?
        """, (session_id,))
        return [dict(row) for row in cursor.fetchall()]

    @staticmethod
    def get_batch_counts(session_id: Optional[int] = None) -> List[Dict]:
        db = get_db()
        if session_id:
            cursor = db.execute("""
                SELECT s.batch_name, COUNT(*) as count, MAX(s.batch_color) as color
                FROM students s
                JOIN uploads u ON s.upload_id = u.id
                WHERE u.session_id = ?
                GROUP BY s.batch_name
                ORDER BY s.batch_name
            """, (session_id,))
        else:
            cursor = db.execute("""
                SELECT batch_name, COUNT(*) as count, MAX(batch_color) as color
                FROM students
                GROUP BY batch_name
                ORDER BY batch_name
            """)
        return [dict(row) for row in cursor.fetchall()]
    
    @staticmethod
    def delete_upload_batch(upload_id: int):
        db = get_db()
        db.execute("DELETE FROM uploads WHERE id = ?", (upload_id,))
        # Students cascade deleted
        db.commit()

    @staticmethod
    def get_session_uploads(session_id: int) -> List[Dict]:
        """
        Get all uploads/batches for a session with student counts.
        
        Returns:
            List of upload dicts with upload_id, batch_id, batch_name, batch_color,
            original_filename, uploaded_at, and student_count
        """
        db = get_db()
        cursor = db.execute("""
            SELECT 
                u.id as upload_id,
                u.batch_id,
                u.batch_name,
                u.batch_color,
                u.original_filename,
                u.created_at as uploaded_at,
                COUNT(s.id) as student_count
            FROM uploads u
            LEFT JOIN students s ON u.id = s.upload_id
            WHERE u.session_id = ?
            GROUP BY u.id
            ORDER BY u.created_at DESC
        """, (session_id,))
        return [dict(row) for row in cursor.fetchall()]

    @staticmethod
    def get_pending_students(session_id: int) -> List[Dict]:
        """Get students not yet allocated in this session."""
        db = get_db()
        cursor = db.execute("""
            SELECT DISTINCT s.id, s.enrollment, s.name, s.batch_name, s.batch_id, s.batch_color, u.semester
            FROM students s
            JOIN uploads u ON s.upload_id = u.id
            WHERE u.session_id = ?
            AND s.id NOT IN (
                SELECT student_id FROM allocations WHERE session_id = ?
            )
            ORDER BY s.batch_name, s.enrollment
        """, (session_id, session_id))
        return [dict(row) for row in cursor.fetchall()]
