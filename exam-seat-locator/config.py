"""
config.py - Central configuration for Exam Seat Locator.
All path constants and app-level settings live here.

Environment variables override defaults — set them in Railway / Render /
your VPS env to avoid touching this file between deployments.
"""

import os

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
