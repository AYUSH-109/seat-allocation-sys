"""
core/sync_queue.py
Simple durable queue for cloud sync events backed by SQLite.
"""

import json
import sqlite3
import time
from pathlib import Path

DB_PATH = Path(__file__).resolve().parents[1] / "data" / "sync_queue.db"


def _conn():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(DB_PATH, timeout=15)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA journal_mode=WAL")
    return c


def init_db() -> None:
    with _conn() as con:
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS sync_jobs (
                event_id TEXT PRIMARY KEY,
                plan_id TEXT NOT NULL,
                payload TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'PENDING',
                attempts INTEGER NOT NULL DEFAULT 0,
                next_retry_at INTEGER NOT NULL DEFAULT 0,
                last_error TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )
            """
        )
        con.execute("CREATE INDEX IF NOT EXISTS idx_sync_jobs_status_retry ON sync_jobs(status, next_retry_at)")


def enqueue(event_id: str, plan_id: str, payload: dict) -> bool:
    now = int(time.time())
    with _conn() as con:
        try:
            con.execute(
                """
                INSERT INTO sync_jobs (event_id, plan_id, payload, status, attempts, next_retry_at, created_at, updated_at)
                VALUES (?, ?, ?, 'PENDING', 0, 0, ?, ?)
                """,
                (event_id, plan_id, json.dumps(payload), now, now),
            )
            return True
        except sqlite3.IntegrityError:
            return False


def acquire_next() -> dict | None:
    now = int(time.time())
    with _conn() as con:
        row = con.execute(
            """
            SELECT * FROM sync_jobs
            WHERE status IN ('PENDING', 'FAILED') AND next_retry_at <= ?
            ORDER BY created_at ASC
            LIMIT 1
            """,
            (now,),
        ).fetchone()
        if not row:
            return None

        con.execute(
            "UPDATE sync_jobs SET status='PROCESSING', updated_at=? WHERE event_id=?",
            (now, row['event_id']),
        )

        return {
            "event_id": row["event_id"],
            "plan_id": row["plan_id"],
            "payload": json.loads(row["payload"]),
            "attempts": row["attempts"],
        }


def mark_done(event_id: str) -> None:
    now = int(time.time())
    with _conn() as con:
        con.execute(
            "UPDATE sync_jobs SET status='DONE', updated_at=?, last_error=NULL WHERE event_id=?",
            (now, event_id),
        )


def mark_failed(event_id: str, attempts: int, error: str, max_attempts: int, base_backoff_sec: int) -> None:
    now = int(time.time())
    next_attempts = attempts + 1
    if next_attempts >= max_attempts:
        status = "DEAD"
        next_retry_at = now
    else:
        status = "FAILED"
        next_retry_at = now + (base_backoff_sec * (2 ** (next_attempts - 1)))

    with _conn() as con:
        con.execute(
            """
            UPDATE sync_jobs
            SET status=?, attempts=?, next_retry_at=?, last_error=?, updated_at=?
            WHERE event_id=?
            """,
            (status, next_attempts, next_retry_at, error[:1000], now, event_id),
        )


def stats() -> dict:
    with _conn() as con:
        rows = con.execute(
            "SELECT status, COUNT(*) AS c FROM sync_jobs GROUP BY status"
        ).fetchall()

    out = {"PENDING": 0, "PROCESSING": 0, "FAILED": 0, "DONE": 0, "DEAD": 0}
    for r in rows:
        out[r["status"]] = r["c"]
    return out
