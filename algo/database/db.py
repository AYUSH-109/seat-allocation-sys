# Primary database connection and session management module.
# Provides global access to the SQLite database for both request-bound and standalone contexts.
import sqlite3
import logging
from flask import g
from algo.config.settings import Config

logger = logging.getLogger(__name__)

def get_db():
    """Get database connection for the current request"""
    if 'db' not in g:
        g.db = sqlite3.connect(Config.DB_PATH, timeout=20)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA journal_mode=WAL")
    return g.db

def close_db(e=None):
    """Close database connection at end of request"""
    db = g.pop('db', None)
    if db is not None:
        db.close()

def get_db_connection_standalone():
    """Get a standalone database connection (for scripts/outside context)"""
    conn = sqlite3.connect(Config.DB_PATH, timeout=20)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn

get_db_connection = get_db_connection_standalone
