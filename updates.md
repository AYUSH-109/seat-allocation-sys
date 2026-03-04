# Changes & Modifications

## Bug Fixes
- **`db_loader.py`** — Fixed column name extraction (`col[0]` → `list(result.keys())`), was silently extracting first character of column name
- **`schema.py`** — Fixed broken FK references pointing to dead table `users_old_backup`, auto-repair migration added for 3 affected tables
- **`requirements.txt`** — Upgraded `sqlalchemy` `2.0.23` → `2.0.36` (Python 3.13 crash fix), removed wrong `cors==1.0.1` package

## New Features
- **`clean_old_data.py`** — Rewrote as automated server-side daemon cleanup job
  - Cleans `user_activity_log` > **2 days** old
  - Cleans expired/completed sessions + all cascade children > **20 days** old
  - Cleans orphaned rows (allocations, uploads, students)
  - Cleans resolved feedback > **20 days** old
  - Cleans stale `cache/*.json` with no matching DB session
  - Cleans `temp_uploads/` > **20 days** old
  - Runs `VACUUM` post-cleanup to reclaim disk space
  - Repeats automatically every **20 days** via daemon thread
- **`main.py`** — Hooked `start_scheduler()` into server startup

## Removed
- **Windows artifacts** — `setup.bat`, `start.ps1` (×2), `backend/act/` (Windows venv)
- **Runtime artifacts** — `__pycache__/` dirs, leftover `demo.db` upload, stale `.python-version`
- **Doc bloat** — 9 redundant AI-generated `.md` files (`ARCHITECTURE.md`, `CHECKLIST.md`, `DEPLOYMENT.md`, `DEVELOPMENT.md`, `INDEX.md`, `MANIFEST.md`, `PROJECT_SUMMARY.md`, `QUICKSTART.md`, `START_HERE.md`)