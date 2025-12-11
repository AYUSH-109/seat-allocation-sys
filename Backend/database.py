"""
database.py

Lightweight DB helper for auth microservice.
Defaults to SQLite (demo.db next to this file). Use get_db() to obtain connections.
init_db() creates users table and other skeleton tables.
"""

import sqlite3
from pathlib import Path
from typing import Optional

BASE_DIR = Path(__file__).parent
DB_FILE = BASE_DIR / "auth_demo.db"


def get_db() -> sqlite3.Connection:
    """Return a sqlite3 connection with Row factory. Caller should close()."""
    conn = sqlite3.connect(str(DB_FILE))
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Create tables if they don't exist. Safe to call multiple times."""
    conn = get_db()
    cur = conn.cursor()

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            email TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'STUDENT',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        """
    )

    # Additional tables for later expansion (kept minimal)
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            token TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        """
    )

    conn.commit()
    conn.close()


# When executed directly, init the DB
if __name__ == "__main__":
    init_db()
    print(f"Initialized DB at: {DB_FILE.resolve()}")
