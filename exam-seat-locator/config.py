"""
config.py - Central configuration for Exam Seat Locator.
All path constants and app-level settings live here.

Environment variables override defaults — set them in Railway / Render /
your VPS env to avoid touching this file between deployments.
"""

import os


def _load_local_env() -> None:
	"""Minimal .env loader for local runs (no external dependency required)."""
	env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
	if not os.path.exists(env_path):
		return

	try:
		with open(env_path, "r", encoding="utf-8") as f:
			for raw in f:
				line = raw.strip()
				if not line or line.startswith("#") or "=" not in line:
					continue
				key, val = line.split("=", 1)
				key = key.strip()
				val = val.strip().strip('"').strip("'")
				# Do not overwrite variables already provided by the host shell.
				os.environ.setdefault(key, val)
	except Exception:
		# Keep startup resilient if .env is malformed.
		pass


_load_local_env()

# ── Paths ────────────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
BACKEND_PUBLISHED_DIR = os.environ.get(
	"BACKEND_PUBLISHED_DIR",
	os.path.abspath(os.path.join(BASE_DIR, "..", "algo", "published_plans")),
)
# PLAN_FILE removed — the system now supports multiple plan files.
# The summary index (data/summary_index.json) maps roll numbers → filenames.

# ── Flask ─────────────────────────────────────────────────────────────────────
# SECRET_KEY: MUST be set as an env var in production.
SECRET_KEY  = os.environ.get("SECRET_KEY", "exam-seat-locator-secret-key-2026")

# DEBUG: set env var DEBUG=true to enable, anything else (or absent) = off.
DEBUG       = os.environ.get("DEBUG", "false").lower() == "true"

# HOST / PORT: Railway and Render inject $PORT automatically.
HOST        = os.environ.get("HOST", "0.0.0.0")
PORT        = int(os.environ.get("PORT", 5000))

# Allowed extensions for plan file uploads
ALLOWED_EXTENSIONS = {"json"}

# ── Data Retention ────────────────────────────────────────────────────────────
# Change either env var (or edit the defaults below) — all cleanup logic picks
# it up automatically with no further code changes.
#
#   PLAN_RETENTION_DAYS   — delete plan files older than this many days
#   CLEANUP_INTERVAL_DAYS — how often the daemon wakes up to scan
PLAN_RETENTION_DAYS   = int(os.environ.get("PLAN_RETENTION_DAYS",   15))
CLEANUP_INTERVAL_DAYS = int(os.environ.get("CLEANUP_INTERVAL_DAYS", 15))

# ── Cloud Sync / Notification Queue ─────────────────────────────────────────
SYNC_SHARED_SECRET = os.environ.get("CLOUD_SYNC_SHARED_SECRET", "")
SYNC_WORKER_POLL_SECONDS = int(os.environ.get("SYNC_WORKER_POLL_SECONDS", 3))
SYNC_MAX_RETRIES = int(os.environ.get("SYNC_MAX_RETRIES", 6))
SYNC_BACKOFF_BASE_SECONDS = int(os.environ.get("SYNC_BACKOFF_BASE_SECONDS", 2))
SYNC_DOWNLOAD_TIMEOUT_SEC = int(os.environ.get("SYNC_DOWNLOAD_TIMEOUT_SEC", 20))
