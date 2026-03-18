import sqlite3
import os

# Update this path to match your project structure
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE_PATH = os.path.join(BASE_DIR, "data", "pdf_templates.db")

def init_database():
    """Initialize the database with required tables"""
    # Ensure directory exists
    os.makedirs(os.path.dirname(DATABASE_PATH), exist_ok=True)
    
    conn = sqlite3.connect(DATABASE_PATH, timeout=20)
    cursor = conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA busy_timeout=20000")
    
    # Create user_templates table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS user_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            template_name TEXT NOT NULL DEFAULT 'default',
            dept_name TEXT,
            exam_details TEXT,
            seating_plan_title TEXT,
            current_year INTEGER,
            branch_text TEXT,
            room_number TEXT,
            coordinator_name TEXT,
            coordinator_title TEXT,
            banner_image_path TEXT,
            attendance_dept_name TEXT,
            attendance_year INTEGER,
            attendance_exam_heading TEXT,
            attendance_banner_path TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, template_name)
        )
    ''')
    
    
    # Migration: Add missing columns if they don't exist
    try:
        cursor.execute("PRAGMA table_info(user_templates)")
        columns = [column[1] for column in cursor.fetchall()]
        
        # List of columns that should exist
        required_columns = {
            'current_year': ('INTEGER', '2024'),
            'attendance_dept_name': ('TEXT', "'Computer Science and Engineering'"),
            'attendance_year': ('INTEGER', '2024'),
            'attendance_exam_heading': ('TEXT', "'SESSIONAL EXAMINATION'"),
            'attendance_banner_path': ('TEXT', "''")
        }
        
        migrations_applied = []
        for col_name, (col_type, default_val) in required_columns.items():
            if col_name not in columns:
                print(f"🔧 Migrating database: Adding {col_name} column...")
                cursor.execute(f'''
                    ALTER TABLE user_templates 
                    ADD COLUMN {col_name} {col_type} DEFAULT {default_val}
                ''')
                migrations_applied.append(col_name)
        
        if migrations_applied:
            print(f"✅ Migration complete: Added columns: {', '.join(migrations_applied)}")
        
    except Exception as e:
        print(f"⚠️ Migration check warning: {e}")
    
    system_banner_path = os.path.join(BASE_DIR, "data", "banner.png")
    
    # Insert system default template if not exists
    cursor.execute('''
        INSERT OR IGNORE INTO user_templates (
            user_id, template_name, dept_name, exam_details,
            seating_plan_title, branch_text, room_number,
            coordinator_name, coordinator_title, banner_image_path
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        'system', 'default',
        'Department of Computer Science & Engineering',
        'Minor-II Examination (2025 Admitted), November 2025',
        'Seating Plan',
        'Branch: B.Tech(CSE & CSD Ist year)',
        'Room no. 103A',
        'Dr. Dheeraj K. Dixit',
        'Dept. Exam Coordinator',
        os.path.join(BASE_DIR, 'data', 'banner.png')
    ))
    
    conn.commit()
    conn.close()
    print("✅ Database initialized and repaired successfully")

# Initialize on import
try:
    init_database()
except Exception as e:
    print(f"⚠️ Database initialization warning: {e}")
