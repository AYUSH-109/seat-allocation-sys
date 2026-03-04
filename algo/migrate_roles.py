"""
Role Migration Script
Migrates existing users from legacy uppercase roles to new lowercase role system.

Role mapping:
  ADMIN    → admin
  FACULTY  → faculty
  STUDENT  → faculty
  user     → faculty
  User     → faculty
  (empty)  → faculty

Usage:
  python -m algo.migrate_roles           # Dry run (preview changes)
  python -m algo.migrate_roles --apply   # Apply changes
"""

import sqlite3
import sys
import os

# Database path
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'demo.db')

ROLE_MAP = {
    'ADMIN': 'admin',
    'FACULTY': 'faculty',
    'STUDENT': 'faculty',
    'user': 'faculty',
    'User': 'faculty',
    '': 'faculty',
    None: 'faculty',
}

VALID_ROLES = ['developer', 'admin', 'faculty']


def migrate(apply=False):
    if not os.path.exists(DB_PATH):
        print(f"❌ Database not found at: {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    if apply:
        # SQLite doesn't support ALTER CHECK constraint, so recreate the table
        print("🔧 Updating table schema to support new roles...")
        cursor.executescript("""
            PRAGMA foreign_keys = OFF;
            
            CREATE TABLE IF NOT EXISTS users_new (
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
            
            CREATE UNIQUE INDEX IF NOT EXISTS idx_google_id 
            ON users(google_id) 
            WHERE google_id IS NOT NULL;
            
            PRAGMA foreign_keys = ON;
        """)
        print("✅ Schema updated successfully\n")

    # Get all users
    cursor.execute("SELECT id, username, email, role FROM users")
    users = cursor.fetchall()

    print(f"📊 Found {len(users)} users in database\n")
    print(f"{'ID':<5} {'Username':<20} {'Email':<30} {'Old Role':<12} {'New Role':<12} {'Action'}")
    print("-" * 95)

    changes = []
    for user in users:
        old_role = user['role'] or ''
        
        if old_role in VALID_ROLES:
            # Already using new role system
            print(f"{user['id']:<5} {user['username']:<20} {user['email']:<30} {old_role:<12} {old_role:<12} ✅ No change")
        elif old_role in ROLE_MAP:
            new_role = ROLE_MAP[old_role]
            changes.append((user['id'], old_role, new_role))
            print(f"{user['id']:<5} {user['username']:<20} {user['email']:<30} {old_role:<12} {new_role:<12} 🔄 Migrate")
        else:
            new_role = 'faculty'
            changes.append((user['id'], old_role, new_role))
            print(f"{user['id']:<5} {user['username']:<20} {user['email']:<30} {old_role:<12} {new_role:<12} ⚠️  Unknown → faculty")

    print(f"\n📋 Summary: {len(changes)} users need migration, {len(users) - len(changes)} already correct")

    if not changes:
        print("✅ All users already using new role system!")
        conn.close()
        return

    if apply:
        print(f"\n🔧 Applying {len(changes)} changes...")
        for user_id, old_role, new_role in changes:
            cursor.execute("UPDATE users SET role = ? WHERE id = ?", (new_role, user_id))
        conn.commit()
        print("✅ Migration complete!")
    else:
        print("\n⚠️  DRY RUN — no changes made. Run with --apply to execute.")

    conn.close()


if __name__ == '__main__':
    apply = '--apply' in sys.argv
    print(f"🚀 Role Migration {'(APPLYING)' if apply else '(DRY RUN)'}")
    print(f"📁 Database: {DB_PATH}\n")
    migrate(apply=apply)
