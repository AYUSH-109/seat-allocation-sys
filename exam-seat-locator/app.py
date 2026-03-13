"""
app.py - Flask application entry point for Exam Seat Locator System.

Responsibilities:
  - Define routes
  - Validate HTTP input
  - Delegate all data work to the in-memory cache (core.cache)
  - Render templates

Zero data logic lives here — every lookup is an O(1) dict access on
the pre-built AppCache that was loaded once at process startup.
"""

import os
import logging

# ── Logging MUST be configured before any other import that logs ─────────────
_handler = logging.StreamHandler()
_handler.setFormatter(logging.Formatter(
    fmt="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
))
logging.getLogger().setLevel(logging.INFO)
logging.getLogger().addHandler(_handler)
logging.getLogger("werkzeug").setLevel(logging.INFO)
# ─────────────────────────────────────────────────────────────────────────────

from flask import Flask, render_template, request, redirect, url_for, flash
from werkzeug.utils import secure_filename

import config
from core import cache          # pre-loaded singleton — logs now visible
from core.cleanup import start_cleanup_daemon
from core.backend_sync import sync_backend_plans

# Start the background cleanup daemon as soon as the process is up.
# Runs cleanup immediately, then repeats every config.CLEANUP_INTERVAL_DAYS days.
start_cleanup_daemon(cache)


def _allowed_file(filename: str) -> bool:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    return ext in config.ALLOWED_EXTENSIONS
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.secret_key = config.SECRET_KEY

# Initial sync so newly published backend plans are available immediately.
sync_stats = sync_backend_plans()
if sync_stats.get("copied") or sync_stats.get("updated"):
    cache.reload()


# ── Routes ────────────────────────────────────────────────────────────────────

@app.route("/", methods=["GET"])
def index():
    return render_template(
        "index.html",
        dates=cache.unique_dates,
        time_slots=cache.unique_time_slots,
        file_count=cache.file_count,
        student_count=cache.student_count,
        plan_meta=cache.plan_meta(),
    )


@app.route("/search", methods=["POST"])
def search():
    enrollment = request.form.get("enrollment",  "").strip().upper()
    exam_date  = request.form.get("exam_date",   "").strip()
    time_slot  = request.form.get("time_slot",   "").strip()

    # ── Validate input ────────────────────────────────────────────────────────
    if not all([enrollment, exam_date, time_slot]):
        flash("All fields are required.", "error")
        return redirect(url_for("index"))

    if "-" not in time_slot:
        flash("Invalid time slot format.", "error")
        return redirect(url_for("index"))

    start_time, end_time = [t.strip() for t in time_slot.split("-", 1)]

    # ── O(1) cache lookup ─────────────────────────────────────────────────────
    student_info = cache.lookup_student(enrollment, exam_date, start_time, end_time)

    if student_info is None:
        logger.warning(f"SEARCH MISS  {enrollment} | {exam_date} {start_time}-{end_time}")
        flash(
            f"Enrollment number '{enrollment}' not found for exam on {exam_date} "
            f"from {start_time} to {end_time}. Please verify your details.",
            "error",
        )
        return redirect(url_for("index"))

    logger.info(f"SEARCH HIT   {enrollment} | {exam_date} {start_time}-{end_time} -> {student_info['room']} row={student_info['row']} col={student_info['col']}")

    # ── Build template context ────────────────────────────────────────────────
    session     = student_info["session"]
    room_config = session.get("room_config", {})

    seat_info = {
        "classroom_number": student_info["room"],
        "exam_date":        exam_date,
        "start_time":       start_time,
        "end_time":         end_time,
        "row":              student_info["row"],
        "col":              student_info["col"],
        "rows":             session["layout"]["rows"],
        "columns":          session["layout"]["columns"],
        "seats":            session["seats"],
        "batches":          session.get("batches", []),
        "total_students":   session.get("metadata", {}).get("total_students", 0),
        "block_structure":  room_config.get("block_structure", []),
        "block_width":      room_config.get("block_width", 0),
    }

    return render_template("result.html", enrollment=enrollment, seat=seat_info)


@app.route("/upload", methods=["POST"])
def upload_plan():
    """
    Accept a new PLAN-*.json file, save it to DATA_DIR, rebuild the summary
    index so the new plan is immediately searchable — no restart needed.
    """
    if "plan_file" not in request.files:
        flash("No file part in the request.", "error")
        return redirect(url_for("index"))

    f = request.files["plan_file"]
    if not f or not f.filename:
        flash("No file selected.", "error")
        return redirect(url_for("index"))

    filename = secure_filename(f.filename)
    if not _allowed_file(filename):
        flash("Only .json files are accepted.", "error")
        return redirect(url_for("index"))

    if not filename.upper().startswith("PLAN-"):
        flash("File name must start with 'PLAN-' (e.g. PLAN-XXXXX.json).", "error")
        return redirect(url_for("index"))

    save_path = os.path.join(config.DATA_DIR, filename)
    f.save(save_path)
    logger.info(f"UPLOAD {filename} -> saved, triggering index rebuild")

    cache.reload()   # rebuild summary index + refresh LRU
    flash(
        f"✅ '{filename}' uploaded and indexed — "
        f"{cache.student_count} students across {cache.file_count} plan file(s).",
        "success",
    )
    return redirect(url_for("index"))


@app.route("/reload", methods=["POST"])
def reload_data():
    """Rebuild the summary index from disk and refresh the LRU cache."""
    logger.info("RELOAD  triggered via HTTP")
    cache.reload()
    stats = cache.lru_stats()
    flash(
        f"✅ Index rebuilt — "
        f"{cache.student_count} students across {cache.file_count} plan file(s). "
        f"LRU: {stats['size']}/{stats['maxsize']} files cached "
        f"({stats['hit_rate']*100:.0f}% hit rate).",
        "success",
    )
    return redirect(url_for("index"))


@app.route("/fetch-backend-plans", methods=["POST"])
def fetch_backend_plans():
    """Sync PLAN-*.json from backend publish directory and rebuild indexes."""
    stats = sync_backend_plans()
    cache.reload()
    flash(
        f"✅ Backend sync done — copied={stats['copied']}, updated={stats['updated']}, "
        f"skipped={stats['skipped']}. "
        f"Now indexed {cache.student_count} students across {cache.file_count} plan file(s).",
        "success",
    )
    return redirect(url_for("index"))


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    app.run(debug=config.DEBUG, host=config.HOST, port= 5001)
