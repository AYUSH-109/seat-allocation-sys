import json
import hashlib
import os
import sqlite3
from datetime import datetime
from .database import DATABASE_PATH, init_database

# Simple secure_filename fallback
def secure_filename(filename):
    """Basic secure filename function"""
    import re
    filename = re.sub(r'[^\w\s.-]', '', filename).strip()
    return re.sub(r'[-\s]+', '_', filename)

class TemplateManager:
    def __init__(self, db_path=DATABASE_PATH):
        self.db_path = db_path
        # Ensure base directory exists relative to this file
        base_dir = os.path.dirname(os.path.abspath(__file__))
        self.upload_folder = os.path.join(base_dir, "data", "user_uploads")
        os.makedirs(self.upload_folder, exist_ok=True)
        
        # Initialize database tables on startup
        try:
            init_database()
        except Exception as e:
            print(f"⚠️ Warning: Could not init PDF database: {e}")
    
    def get_db_connection(self):
        """Get database connection with proper setup"""
        # Ensure directory exists to prevent connection errors
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        conn = sqlite3.connect(self.db_path, timeout=20)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=20000")
        return conn
    
    def _get_default_template(self):
        """Fallback default template"""
        from datetime import datetime
        return {
            # Seating Plan Fields
            'dept_name': 'Department of Computer Science & Engineering',
            'exam_details': 'Minor-II Examination (2025 Admitted), November 2025',
            'seating_plan_title': 'Seating Plan',
            'current_year': datetime.now().year,
            'coordinator_name': 'Dr. Dheeraj K. Dixit',
            'coordinator_title': 'Dept. Exam Coordinator',
            'banner_image_path': os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'banner.png'),
            
            # Attendance Sheet Fields
            'attendance_dept_name': 'Computer Science and Engineering',
            'attendance_year': datetime.now().year,
            'attendance_exam_heading': 'SESSIONAL EXAMINATION',
            'attendance_banner_path': os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'banner.png')
        }

    def get_user_template(self, user_id, template_name='default'):
        """Get template for specific user, fallback to system default"""
        try:
            conn = self.get_db_connection()
            cursor = conn.cursor()
            
            # Try user-specific template first
            cursor.execute('''
                SELECT * FROM user_templates 
                WHERE user_id = ? AND template_name = ?
            ''', (user_id, template_name))
            
            result = cursor.fetchone()
            
            if not result:
                # Fallback to system default
                cursor.execute('''
                    SELECT * FROM user_templates 
                    WHERE user_id = 'system' AND template_name = 'default'
                ''')
                result = cursor.fetchone()
            
            conn.close()

            if result:
                return dict(result)
            else:
                return self._get_default_template()
            
        except sqlite3.OperationalError as e:
            print(f"⚠️ PDF DB table missing: {e}. Using default template.")
            return self._get_default_template()
        except Exception as e:
            print(f"Template fetch error: {e}")
            return self._get_default_template()
    
    def save_user_template(self, user_id, template_data, template_name='default'):
        """Save or update user template"""
        conn = None
        try:
            conn = self.get_db_connection()
            cursor = conn.cursor()
            
            cursor.execute('''
                INSERT OR REPLACE INTO user_templates (
                    user_id, template_name, dept_name, exam_details, 
                    seating_plan_title, current_year,
                    coordinator_name, coordinator_title, banner_image_path,
                    attendance_dept_name, attendance_year, attendance_exam_heading, attendance_banner_path,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                user_id, template_name,
                template_data.get('dept_name', ''),
                template_data.get('exam_details', ''),
                template_data.get('seating_plan_title', ''),
                template_data.get('current_year', 2024),
                template_data.get('coordinator_name', ''),
                template_data.get('coordinator_title', ''),
                template_data.get('banner_image_path', ''),
                template_data.get('attendance_dept_name', 'Computer Science'),
                template_data.get('attendance_year', datetime.now().year),
                template_data.get('attendance_exam_heading', 'SESSIONAL EXAMINATION'),
                template_data.get('attendance_banner_path', ''),
                datetime.now().isoformat()
            ))
            conn.commit()
            print(f"✅ Template saved for user: {user_id}")
            return True
            
        except Exception as e:
            print(f"❌ Template save error: {e}")
            if conn:
                conn.rollback()
            return False
        finally:
            if conn:
                conn.close()
    
    def save_user_banner(self, user_id, file, template_name='default'):
        """Save user banner image and return the path"""
        if not file or not file.filename:
            return None
            
        if not self._allowed_file(file.filename):
            print(f"❌ Invalid file type: {file.filename}")
            return None
            
        try:
            # Create user-specific directory
            user_folder = os.path.join(self.upload_folder, str(user_id))
            os.makedirs(user_folder, exist_ok=True)
            
            # Generate unique filename
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            original_filename = secure_filename(file.filename)
            filename = f"banner_{template_name}_{timestamp}_{original_filename}"
            file_path = os.path.join(user_folder, filename)
            
            # Save file
            file.save(file_path)
            print(f"✅ Banner saved: {file_path}")
            return file_path
            
        except Exception as e:
            print(f"❌ Error saving banner: {e}")
            return None
    
    def get_template_hash(self, user_id, template_name='default'):
        """Generate hash for template content (for caching)"""
        template = self.get_user_template(user_id, template_name)
        
        # Only hash the relevant fields (excluding room_number and branch_text as they're now dynamic)
        template_data = {
            'dept_name': template.get('dept_name', ''),
            'exam_details': template.get('exam_details', ''),
            'seating_plan_title': template.get('seating_plan_title', ''),
            'current_year': template.get('current_year', 2024),
            'coordinator_name': template.get('coordinator_name', ''),
            'coordinator_title': template.get('coordinator_title', ''),
            'banner_image_path': template.get('banner_image_path', ''),
            'attendance_dept_name': template.get('attendance_dept_name', ''),
            'attendance_year': template.get('attendance_year', 2024),
            'attendance_exam_heading': template.get('attendance_exam_heading', ''),
            'attendance_banner_path': template.get('attendance_banner_path', '')
        }
        
        normalized = json.dumps(template_data, sort_keys=True, separators=(',', ':'))
        return hashlib.sha256(normalized.encode('utf-8')).hexdigest()
    
    def delete_old_banners(self, user_id, keep_latest=3):
        """Clean up old banner images, keep only latest N"""
        try:
            user_folder = os.path.join(self.upload_folder, str(user_id))
            if not os.path.exists(user_folder):
                return
            
            # Get all banner files
            files = []
            for f in os.listdir(user_folder):
                if f.startswith('banner_'):
                    file_path = os.path.join(user_folder, f)
                    files.append((file_path, os.path.getmtime(file_path)))
            
            # Sort by modification time (newest first)
            files.sort(key=lambda x: x[1], reverse=True)
            
            # Delete old files
            for file_path, _ in files[keep_latest:]:
                try:
                    os.remove(file_path)
                    print(f"🗑️ Deleted old banner: {file_path}")
                except Exception as e:
                    print(f"⚠️ Could not delete {file_path}: {e}")
                    
        except Exception as e:
            print(f"⚠️ Error cleaning up banners: {e}")
    
    def _allowed_file(self, filename):
        """Check if file extension is allowed"""
        allowed = {'png', 'jpg', 'jpeg', 'gif', 'bmp'}
        return '.' in filename and filename.rsplit('.', 1)[1].lower() in allowed

# Global instance
template_manager = TemplateManager()