# SQL schema definitions and database initialization logic.
# Includes table creation, primary keys, foreign key constraints, and initial system data setup.
import sqlite3
import logging
import sys
from pathlib import Path
from algo.config.settings import Config

logger = logging.getLogger(__name__)

def ensure_demo_db():
    """
    Initialize database with all required tables.
    
    ENHANCED: Now includes all missing columns and proper constraints.
    This function is idempotent - safe to run multiple times.
    """
    logger.info("🔧 Initializing database...")

    # Guard against accidental secondary DB creation inside algo/.
    # The canonical DB path is Config.DB_PATH (repo root/demo.db).
    root_dir = Path(Config.DB_PATH).parent
    stray_db = root_dir / "algo" / Path(Config.DB_PATH).name
    if stray_db.exists() and stray_db.resolve() != Path(Config.DB_PATH).resolve():
        try:
            if stray_db.stat().st_size == 0:
                stray_db.unlink()
                logger.info(f"🧹 Removed stray empty DB file: {stray_db}")
            else:
                logger.warning(
                    "⚠️ Found non-empty stray DB at %s. Keeping it untouched; app will continue using %s",
                    stray_db,
                    Config.DB_PATH,
                )
        except Exception as cleanup_err:
            logger.warning(f"⚠️ Could not inspect/remove stray DB {stray_db}: {cleanup_err}")
    
    conn = sqlite3.connect(Config.DB_PATH, timeout=20)
    cur = conn.cursor()
    cur.execute("PRAGMA journal_mode=WAL")
    cur.execute("PRAGMA busy_timeout=20000")

    try:
        # ====================================================================
        # 1. USER ACTIVITY TABLE (Last activity tracking)
        # ====================================================================
        cur.execute("""
            CREATE TABLE IF NOT EXISTS user_activity (
                user_id INTEGER PRIMARY KEY,
                last_activity DATETIME NOT NULL,
                last_endpoint TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        """)
        
        # ====================================================================
        # 1b. USER ACTIVITY LOG TABLE (Full activity history with 7-day retention)
        # ====================================================================
        cur.execute("""
            CREATE TABLE IF NOT EXISTS user_activity_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                action TEXT NOT NULL,
                details TEXT,
                endpoint TEXT,
                ip_address TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        """)

        # ── Migration: fix broken FK in user_activity_log (was users_old_backup) ──
        cur.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='user_activity_log'")
        row = cur.fetchone()
        if row and 'users_old_backup' in row[0]:
            logger.info("🔧 Migrating user_activity_log: fixing broken FK reference...")
            cur.executescript("""
                PRAGMA foreign_keys = OFF;
                CREATE TABLE user_activity_log_fixed (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    action TEXT NOT NULL,
                    details TEXT,
                    endpoint TEXT,
                    ip_address TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                );
                INSERT INTO user_activity_log_fixed
                    SELECT id, user_id, action, details, endpoint, ip_address, created_at
                    FROM user_activity_log;
                DROP TABLE user_activity_log;
                ALTER TABLE user_activity_log_fixed RENAME TO user_activity_log;
                PRAGMA foreign_keys = ON;
            """)
            logger.info("✅ user_activity_log FK fixed.")

        # ── Migration: fix broken FK in allocation_sessions ──────────────────
        cur.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='allocation_sessions'")
        row = cur.fetchone()
        if row and 'users_old_backup' in row[0]:
            logger.info("🔧 Migrating allocation_sessions: fixing broken FK reference...")
            cur.executescript("""
                PRAGMA foreign_keys = OFF;
                CREATE TABLE allocation_sessions_fixed (
                    session_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    plan_id TEXT UNIQUE NOT NULL,
                    user_id INTEGER DEFAULT 1,
                    name TEXT,
                    status TEXT CHECK(status IN ('active', 'completed', 'archived', 'draft', 'expired')) DEFAULT 'active',
                    total_students INTEGER DEFAULT 0,
                    allocated_count INTEGER DEFAULT 0,
                    total_capacity INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
                    completed_at DATETIME,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
                );
                INSERT INTO allocation_sessions_fixed
                    SELECT session_id, plan_id, user_id, name, status,
                           total_students, allocated_count, total_capacity,
                           created_at, last_activity, completed_at
                    FROM allocation_sessions;
                DROP TABLE allocation_sessions;
                ALTER TABLE allocation_sessions_fixed RENAME TO allocation_sessions;
                PRAGMA foreign_keys = ON;
            """)
            logger.info("✅ allocation_sessions FK fixed.")

        # ── Migration: fix broken FK in feedback ─────────────────────────────
        cur.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='feedback'")
        row = cur.fetchone()
        if row and 'users_old_backup' in row[0]:
            logger.info("🔧 Migrating feedback: fixing broken FK reference...")
            cur.executescript("""
                PRAGMA foreign_keys = OFF;
                CREATE TABLE feedback_fixed (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER,
                    issue_type TEXT NOT NULL,
                    priority TEXT NOT NULL CHECK(priority IN ('low', 'medium', 'high', 'critical')),
                    description TEXT NOT NULL,
                    feature_suggestion TEXT,
                    additional_info TEXT,
                    file_path TEXT,
                    file_name TEXT,
                    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'reviewed', 'resolved', 'closed')),
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    resolved_at DATETIME,
                    admin_response TEXT,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
                );
                INSERT INTO feedback_fixed
                    SELECT id, user_id, issue_type, priority, description,
                           feature_suggestion, additional_info, file_path, file_name,
                           status, created_at, resolved_at, admin_response
                    FROM feedback;
                DROP TABLE feedback;
                ALTER TABLE feedback_fixed RENAME TO feedback;
                PRAGMA foreign_keys = ON;
            """)
            logger.info("✅ feedback FK fixed.")
        
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_activity_log_user_date 
            ON user_activity_log(user_id, created_at DESC);
        """)

        # ====================================================================
        # 2. USERS TABLE (UNIFIED - auth + domain in one table)
        # ====================================================================
        # Check if users table exists with old constraint (uppercase-only roles)
        cur.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'")
        users_table_result = cur.fetchone()
        users_table_sql = users_table_result[0] if users_table_result else None
        
        has_old_constraint = (
            users_table_sql and 
            "CHECK(role IN ('STUDENT', 'ADMIN', 'TEACHER', 'FACULTY'))" in str(users_table_sql)
        )
        
        if has_old_constraint:
            logger.info("🔧 Detected old users table with uppercase-only role constraint. Rebuilding...")
            try:
                cur.executescript("""
                    PRAGMA foreign_keys = OFF;
                    CREATE TABLE users_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        username TEXT NOT NULL,
                        email TEXT UNIQUE NOT NULL,
                        password_hash TEXT,
                        role TEXT NOT NULL DEFAULT 'faculty' CHECK(role IN ('developer', 'admin', 'faculty', 'STUDENT', 'ADMIN', 'TEACHER', 'FACULTY')),
                        full_name TEXT,
                        auth_provider TEXT DEFAULT 'local',
                        google_id TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        last_login DATETIME
                    );
                    INSERT INTO users_new SELECT * FROM users;
                    DROP TABLE users;
                    ALTER TABLE users_new RENAME TO users;
                    PRAGMA foreign_keys = ON;
                """)
                logger.info("✅ Users table successfully migrated with new role constraint.")
            except Exception as migration_err:
                logger.warning(f"⚠️  Migration failed: {migration_err}. Dropping and recreating users table...")
                try:
                    cur.executescript("""
                        PRAGMA foreign_keys = OFF;
                        DROP TABLE IF EXISTS users;
                        PRAGMA foreign_keys = ON;
                    """)
                    # Will be recreated below in the CREATE TABLE IF NOT EXISTS
                except Exception as drop_err:
                    logger.error(f"❌ Failed to drop users table: {drop_err}")
        
        # Create table with correct constraint (if not already done)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT,
                role TEXT NOT NULL DEFAULT 'faculty' CHECK(role IN ('developer', 'admin', 'faculty', 'STUDENT', 'ADMIN', 'TEACHER', 'FACULTY')),
                full_name TEXT,
                auth_provider TEXT DEFAULT 'local',
                google_id TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_login DATETIME
            );
        """)

        # Unique index for Google ID
        cur.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_google_id 
            ON users(google_id) 
            WHERE google_id IS NOT NULL;
        """)

        # ====================================================================
        # 3. ALLOCATION SESSIONS TABLE (ENHANCED)
        # ====================================================================
        cur.execute("""
            CREATE TABLE IF NOT EXISTS allocation_sessions (
                session_id INTEGER PRIMARY KEY AUTOINCREMENT,
                plan_id TEXT UNIQUE NOT NULL,
                user_id INTEGER DEFAULT 1,
                name TEXT,
                status TEXT CHECK(status IN ('active', 'completed', 'archived', 'draft', 'expired')) DEFAULT 'active',
                total_students INTEGER DEFAULT 0,
                allocated_count INTEGER DEFAULT 0,
                total_capacity INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
                completed_at DATETIME,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
            );
        """)

        # ====================================================================
        # 4. UPLOADS TABLE (ENHANCED WITH BATCH_COLOR)
        # ====================================================================
        cur.execute("""
            CREATE TABLE IF NOT EXISTS uploads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER,
                batch_id TEXT UNIQUE NOT NULL,
                batch_name TEXT NOT NULL,
                batch_color TEXT DEFAULT '#BFDBFE',
                semester TEXT,
                original_filename TEXT,
                file_size INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES allocation_sessions(session_id) ON DELETE SET NULL
            );
        """)

        # ====================================================================
        # 5. STUDENTS TABLE (ENHANCED)
        # ====================================================================
        cur.execute("""
            CREATE TABLE IF NOT EXISTS students (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                upload_id INTEGER NOT NULL,
                batch_id TEXT NOT NULL,
                batch_name TEXT NOT NULL,
                batch_color TEXT DEFAULT '#BFDBFE',
                enrollment TEXT NOT NULL,
                name TEXT,
                department TEXT,
                inserted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(upload_id, enrollment),
                FOREIGN KEY (upload_id) REFERENCES uploads(id) ON DELETE CASCADE
            );
        """)

        # ====================================================================
        # 6. CLASSROOMS TABLE (WITH USER ISOLATION)
        # ====================================================================
        cur.execute("""
            CREATE TABLE IF NOT EXISTS classrooms (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER DEFAULT NULL,
                name TEXT NOT NULL,
                rows INTEGER NOT NULL CHECK(rows > 0 AND rows <= 50),
                cols INTEGER NOT NULL CHECK(cols > 0 AND cols <= 50),
                broken_seats TEXT DEFAULT '',
                block_width INTEGER DEFAULT 1 CHECK(block_width > 0),
                block_structure TEXT DEFAULT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        """)
        
        # Add user_id column if it doesn't exist (migration for existing DB)
        try:
            cur.execute("ALTER TABLE classrooms ADD COLUMN user_id INTEGER DEFAULT NULL")
            logger.info("✅ Added user_id column to classrooms table")
        except sqlite3.OperationalError:
            pass  # Column already exists
        
        # Create unique index for user_id + name (allows same name for different users)
        cur.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_classrooms_user_name 
            ON classrooms(user_id, name) WHERE user_id IS NOT NULL;
        """)

        # ====================================================================
        # 7. ALLOCATIONS TABLE (ENHANCED)
        # ====================================================================
        cur.execute("""
            CREATE TABLE IF NOT EXISTS allocations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL,
                classroom_id INTEGER NOT NULL,
                student_id INTEGER NOT NULL,
                enrollment TEXT NOT NULL,
                seat_position TEXT,
                batch_name TEXT,
                paper_set TEXT DEFAULT 'A',
                allocated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES allocation_sessions(session_id) ON DELETE CASCADE,
                FOREIGN KEY (classroom_id) REFERENCES classrooms(id) ON DELETE RESTRICT,
                FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
                UNIQUE(session_id, student_id)
            );
        """)

        # Create index for faster queries
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_allocations_session 
            ON allocations(session_id);
        """)
        
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_allocations_classroom 
            ON allocations(classroom_id);
        """)

        # ====================================================================
        # 8. ALLOCATION HISTORY TABLE
        # ====================================================================
        cur.execute("""
            CREATE TABLE IF NOT EXISTS allocation_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL,
                step_number INTEGER NOT NULL,
                classroom_id INTEGER,
                action_type TEXT CHECK(action_type IN ('allocate', 'undo', 'reset')) NOT NULL,
                students_affected INTEGER DEFAULT 0,
                snapshot_data TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES allocation_sessions(session_id) ON DELETE CASCADE,
                UNIQUE(session_id, step_number)
            );
        """)

        # ====================================================================
        # 9. EXTERNAL STUDENTS TABLE (Manual additions to empty seats)
        # ====================================================================
        cur.execute("""
            CREATE TABLE IF NOT EXISTS external_students (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL,
                plan_id TEXT NOT NULL,
                room_no TEXT NOT NULL,
                seat_position TEXT NOT NULL,
                seat_row INTEGER NOT NULL,
                seat_col INTEGER NOT NULL,
                roll_number TEXT NOT NULL,
                student_name TEXT,
                batch_label TEXT NOT NULL,
                batch_color TEXT DEFAULT '#3b82f6',
                paper_set TEXT DEFAULT 'A',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES allocation_sessions(session_id) ON DELETE CASCADE,
                UNIQUE(session_id, room_no, seat_position)
            );
        """)
        
        # Create index for faster lookups
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_external_students_session 
            ON external_students(session_id, room_no);
        """)

        # ====================================================================
        # 10. FEEDBACK TABLE
        # ====================================================================
        cur.execute("""
            CREATE TABLE IF NOT EXISTS feedback (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                issue_type TEXT NOT NULL,
                priority TEXT NOT NULL CHECK(priority IN ('low', 'medium', 'high', 'critical')),
                description TEXT NOT NULL,
                feature_suggestion TEXT,
                additional_info TEXT,
                file_path TEXT,
                file_name TEXT,
                status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'reviewed', 'resolved', 'closed')),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                resolved_at DATETIME,
                admin_response TEXT,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
            );
        """)

        # ====================================================================
        # 11. ENSURE COLUMNS EXIST (FOR MIGRATION FROM OLDER VERSIONS)
        # ====================================================================
        migration_queries = [
            ("ALTER TABLE uploads ADD COLUMN batch_color TEXT DEFAULT '#BFDBFE'", "uploads.batch_color"),
            ("ALTER TABLE uploads ADD COLUMN semester TEXT", "uploads.semester"),
            ("ALTER TABLE students ADD COLUMN batch_color TEXT DEFAULT '#BFDBFE'", "students.batch_color"),
            ("ALTER TABLE students ADD COLUMN department TEXT", "students.department"),
            ("ALTER TABLE allocation_sessions ADD COLUMN user_id INTEGER DEFAULT 1", "sessions.user_id"),
            ("ALTER TABLE allocation_sessions ADD COLUMN name TEXT", "sessions.name"),
            ("ALTER TABLE allocation_sessions ADD COLUMN last_activity DATETIME DEFAULT CURRENT_TIMESTAMP", "sessions.last_activity"),
            ("ALTER TABLE classrooms ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP", "classrooms.updated_at"),
            ("ALTER TABLE classrooms ADD COLUMN block_width INTEGER DEFAULT 2", "classrooms.block_width"),
            ("ALTER TABLE classrooms ADD COLUMN block_structure TEXT DEFAULT NULL", "classrooms.block_structure"),
            # Auth-related columns (consolidated from user_auth.db)
            ("ALTER TABLE users ADD COLUMN full_name TEXT", "users.full_name"),
            ("ALTER TABLE users ADD COLUMN auth_provider TEXT DEFAULT 'local'", "users.auth_provider"),
            ("ALTER TABLE users ADD COLUMN google_id TEXT", "users.google_id"),
            ("ALTER TABLE users ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP", "users.updated_at"),
        ]

        for query, col_name in migration_queries:
            try:
                cur.execute(query)
                logger.debug(f"✅ Added column: {col_name}")
            except sqlite3.OperationalError:
                # Column already exists
                pass

        conn.commit()
        logger.info(f"✅ Database initialized successfully at {Config.DB_PATH}")
        
        # Log table counts
        cur.execute("SELECT COUNT(*) FROM classrooms")
        classroom_count = cur.fetchone()[0]
        
        cur.execute("SELECT COUNT(*) FROM students")
        student_count = cur.fetchone()[0]
        
        cur.execute("SELECT COUNT(*) FROM allocation_sessions WHERE status='active'")
        active_sessions = cur.fetchone()[0]
        
        logger.info(f"📊 Database stats: {classroom_count} classrooms, {student_count} students, {active_sessions} active sessions")

    except Exception as e:
        logger.error(f"❌ Database initialization failed: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()
