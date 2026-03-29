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
import json
import logging
from datetime import date, timedelta

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

from flask import Flask, render_template, request, redirect, url_for, flash, jsonify
from werkzeug.utils import secure_filename

import config
from core import cache          # pre-loaded singleton — logs now visible
from core.cleanup import start_cleanup_daemon
from core.backend_sync import sync_backend_plans
from core.cloud_sync import verify_signature
from core.rate_limit import FixedWindowRateLimiter, get_client_ip

# Start the background cleanup daemon as soon as the process is up.
# Runs cleanup immediately, then repeats every config.CLEANUP_INTERVAL_DAYS days.
start_cleanup_daemon(cache)

_upload_rl = FixedWindowRateLimiter(getattr(config, 'UPLOAD_RATE_LIMIT_PER_MIN', 10))
_sync_notify_rl = FixedWindowRateLimiter(getattr(config, 'SYNC_NOTIFY_RATE_LIMIT_PER_MIN', 60))

def _client_ip() -> str:
    return get_client_ip(request.headers.get("X-Forwarded-For"), request.remote_addr)


def _allowed_file(filename: str) -> bool:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    return ext in config.ALLOWED_EXTENSIONS
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.secret_key = config.SECRET_KEY


def _next_three_dates() -> list[str]:
    """Return [today, tomorrow, day-after-tomorrow] in YYYY-MM-DD format."""
    today = date.today()
    return [
        (today + timedelta(days=offset)).strftime("%Y-%m-%d")
        for offset in range(3)
    ]

# Initial sync so newly published backend plans are available immediately.
sync_stats = sync_backend_plans()
if sync_stats.get("copied") or sync_stats.get("updated"):
    cache.reload()

# ── Routes ────────────────────────────────────────────────────────────────────

@app.route("/", methods=["GET"])
def index():
    # Use dates that we actually have exam plans for
    date_options = sorted(cache.unique_dates) if hasattr(cache, 'unique_dates') and cache.unique_dates else _next_three_dates()
    return render_template(
        "index.html",
        dates=date_options,
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
    if not _upload_rl.allow(_client_ip()):
        flash("Rate limit exceeded. Please try again later.", "error")
        return redirect(url_for("index"))

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


logger = logging.getLogger(__name__)

@app.route("/webhook", methods=["POST"])
def sync_notify():
    """Receive signed cloud notification and process payload inline."""
    client_ip = _client_ip()
    logger.info(f"🔔 [WEBHOOK] Received cloud notification from IP: {client_ip}")

    # Temporarily bypass auth & signature logic for testing:
    # if not _sync_notify_rl.allow(client_ip):
    #     logger.warning(f"Rate limit exceeded for IP {client_ip} on /webhook")
    #     return jsonify({"accepted": False, "error": "rate limit exceeded"}), 429

    raw = request.get_data(cache=False)
    try:
        payload = json.loads(raw.decode("utf-8")) if raw else {}
    except Exception as e:
        logger.error(f"❌ [WEBHOOK] Invalid JSON received: {e}")
        return jsonify({"accepted": False, "error": "Invalid JSON"}), 400

    logger.info(f"🔔 [WEBHOOK] Payload: {json.dumps(payload)}")
    
    # Temporarily bypassed signature check for testing:
    # sig = (
    #     request.headers.get("X-Signature")
    #     or request.headers.get("X-Hub-Signature-256")
    #     or request.headers.get("X-Sync-Signature")
    # )
    # if not verify_signature(raw, sig):
    #     logger.warning(f"Invalid signature from {client_ip}. Headers: {dict(request.headers)}")
    #     return jsonify({"accepted": False, "error": "invalid signature"}), 401

    import boto3
    from botocore.client import Config as BotoConfig
    import os
    
    try:
        # Extract filename / file_key from incoming JSON
        # Worker uses prepended "plans/" as per requirements
        file_key = payload.get("file_key") or payload.get("filename")
        if not file_key and payload.get("plan_id"):
            plan_id = payload["plan_id"]
            if not str(plan_id).upper().startswith("PLAN-"):
                plan_id = f"PLAN-{plan_id}"
            file_key = f"plans/{plan_id}.json"

        if not file_key:
            logger.warning("🔔 [WEBHOOK] Missing file_key, filename, or plan_id in payload")
            return jsonify({"accepted": False, "error": "file_key or filename missing"}), 400
        
        # Ensure correct R2 keys are used
        account_id = os.getenv("R2_ACCOUNT_ID", "").strip()
        access_key = os.getenv("R2_ACCESS_KEY_ID", "").strip()
        secret_key = os.getenv("R2_SECRET_ACCESS_KEY", "").strip()
        bucket = os.getenv("R2_BUCKET_NAME", "").strip()

        if not all([account_id, access_key, secret_key, bucket]):
            logger.error("❌ [WEBHOOK] Missing R2 configuration in .env")
            return jsonify({"accepted": False, "error": "Server misconfiguration"}), 500

        endpoint = f"https://{account_id}.r2.cloudflarestorage.com"
        
        client = boto3.client(
            "s3",
            endpoint_url=endpoint,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name="auto",
            config=BotoConfig(signature_version="s3v4", s3={"addressing_style": "path"}),
        )

        # Download file to local DATA_DIR safely handling 'plan/' prefix
        save_name = os.path.basename(file_key) 
        if not save_name.endswith(".json"):
            save_name += ".json"
            
        save_path = os.path.join(config.DATA_DIR, save_name)
        
        logger.info(f"🔔 [WEBHOOK] Downloading '{file_key}' from R2 bucket '{bucket}' -> '{save_path}'")
        client.download_file(bucket, file_key, save_path)
        
        # Reload cache to make it instantly searchable
        cache.reload()
        
        logger.info(f"✅ [WEBHOOK] Successfully synchronised: {file_key}")
        
        return jsonify({
            "accepted": True,
            "state": "processed_inline",
            "file": save_name
        }), 200

    except Exception as e:
        logger.error(f"❌ [WEBHOOK] Sync failed: {e}")
        return jsonify({"accepted": False, "error": str(e)}), 400


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    app.run(debug=config.DEBUG, host=config.HOST, port=3001)
