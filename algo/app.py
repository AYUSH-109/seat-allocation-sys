
# app.py — FINAL STABLE VERSION (NO ROUTE LOSS)

import sys
import os
import time
import io
import json
import sqlite3
from pathlib import Path
from functools import wraps
from typing import Dict, List, Tuple
from pdf_gen import create_seating_pdf


from flask import Flask, jsonify, request, send_file
from flask_cors import CORS

# --------------------------------------------------
# Imports
# --------------------------------------------------
from student_parser import StudentDataParser
from algo import SeatingAlgorithm

# auth (optional but supported)
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "Backend"))
try:
    from auth_service import signup, login, verify_token, get_user_by_token, update_user_profile
except Exception:
    signup = login = verify_token = get_user_by_token = update_user_profile = None

# --------------------------------------------------
# App setup
# --------------------------------------------------
app = Flask(__name__)
CORS(app, supports_credentials=True)

BASE_DIR = Path(__file__).parent
DB_PATH = BASE_DIR / "demo.db"

# --------------------------------------------------
# DB bootstrap
# --------------------------------------------------
def ensure_demo_db():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS uploads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            batch_id TEXT UNIQUE,
            batch_name TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            upload_id INTEGER,
            batch_id TEXT,
            batch_name TEXT,
            enrollment TEXT NOT NULL,
            name TEXT,
            inserted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(upload_id, enrollment)
        );
    """)

    conn.commit()
    conn.close()

ensure_demo_db()

# --------------------------------------------------
# Helpers
# --------------------------------------------------
def get_batch_counts_and_labels_from_db():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT batch_name, COUNT(*) FROM students GROUP BY batch_name ORDER BY batch_name")
    rows = cur.fetchall()
    conn.close()

    counts, labels = {}, {}
    for i, (name, count) in enumerate(rows, start=1):
        counts[i] = count
        labels[i] = name
    return counts, labels


def get_batch_roll_numbers_from_db():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT batch_name, enrollment FROM students ORDER BY id")
    rows = cur.fetchall()
    conn.close()

    groups = {}
    for batch, enr in rows:
        groups.setdefault(batch, []).append(enr)

    return {i + 1: groups[k] for i, k in enumerate(sorted(groups))}

# --------------------------------------------------
# Auth decorator
# --------------------------------------------------
def token_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if verify_token is None:
            return fn(*args, **kwargs)

        auth = request.headers.get("Authorization")
        if not auth:
            return jsonify({"error": "Token missing"}), 401

        token = auth.split(" ")[1]
        payload = verify_token(token)
        if not payload:
            return jsonify({"error": "Invalid token"}), 401

        request.user_id = payload.get("user_id")
        return fn(*args, **kwargs)

    return wrapper

# --------------------------------------------------
# Upload + Commit
# --------------------------------------------------

@app.route("/api/upload-preview", methods=["POST"])
def api_upload_preview():
    """
    Preview uploaded file without committing to database
    Shows column detection and sample data
    """
    try:
        print("\n" + "="*60)
        print("👀 PREVIEW REQUEST")
        print("="*60)
        
        if "file" not in request.files:
            return jsonify({"error": "No file provided"}), 400
        
        file = request.files["file"]
        
        if file.filename == '':
            return jsonify({"error": "No file selected"}), 400
        
        print(f"📄 Preview file: {file.filename}")
        
        # Read file content
        file_content = file.read()
        
        print(f"📦 File size: {len(file_content)} bytes")
        
        # Create parser and get preview
        parser = StudentDataParser()
        
        # Use preview method - pass BytesIO
        preview_data = parser.preview(io.BytesIO(file_content), max_rows=10)
        
        print(f"✅ Preview generated:")
        print(f"  - Columns: {len(preview_data['columns'])}")
        print(f"  - Total rows: {preview_data['totalRows']}")
        print(f"  - Detected name: {preview_data['detectedColumns'].get('name')}")
        print(f"  - Detected enrollment: {preview_data['detectedColumns'].get('enrollment')}")
        print("="*60 + "\n")
        
        return jsonify({
            "success": True,
            **preview_data
        }), 200
        
    except Exception as e:
        print(f"❌ PREVIEW ERROR: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@app.route("/api/upload", methods=["POST"])
def api_upload():
    """
    Upload and parse file, store in cache for preview
    Returns parsed data with sample
    """
    try:
        print("\n" + "="*60)
        print("📥 UPLOAD REQUEST")
        print("="*60)
        
        if "file" not in request.files:
            return jsonify({"error": "No file provided"}), 400
        
        file = request.files["file"]
        
        if file.filename == '':
            return jsonify({"error": "No file selected"}), 400
        
        print(f"📄 File: {file.filename}")
        
        # Get parameters
        mode = int(request.form.get("mode", 2))
        batch_name = request.form.get("batch_name", "BATCH1")
        name_col = request.form.get("nameColumn", None)
        enrollment_col = request.form.get("enrollmentColumn", None)
        
        print(f"🔧 Mode: {mode}, Batch: {batch_name}")
        if name_col:
            print(f"📝 Custom name column: {name_col}")
        if enrollment_col:
            print(f"📝 Custom enrollment column: {enrollment_col}")
        
        # Read file content
        file_content = file.read()
        
        print(f"📦 File size: {len(file_content)} bytes")
        
        # Parse file
        parser = StudentDataParser()
        
        # Parse using BytesIO
        pr = parser.parse_file(
            io.BytesIO(file_content),
            mode=mode,
            batch_name=batch_name,
            name_col=name_col,
            enrollment_col=enrollment_col
        )
        
        print(f"✅ Parsing successful")
        print(f"📊 Extracted {pr.rows_extracted} students")
        
        # Cache the result
        if not hasattr(app, 'config'):
            app.config = {}
        if 'UPLOAD_CACHE' not in app.config:
            app.config['UPLOAD_CACHE'] = {}
        
        app.config['UPLOAD_CACHE'][pr.batch_id] = pr
        
        print(f"💾 Cached with ID: {pr.batch_id}")
        print("="*60 + "\n")
        
        # Return response with sample data
        return jsonify({
            "success": True,
            "batch_id": pr.batch_id,
            "batch_name": pr.batch_name,
            "rows_total": pr.rows_total,
            "rows_extracted": pr.rows_extracted,
            "warnings": pr.warnings,
            "errors": pr.errors,
            "sample": pr.data[pr.batch_name][:10],  # First 10 records
            # Add full preview data too
            "preview": {
                "columns": list(pr.data[pr.batch_name][0].keys()) if pr.mode == 2 and pr.data[pr.batch_name] else [],
                "totalRows": pr.rows_total,
                "extractedRows": pr.rows_extracted
            }
        }), 200
        
    except Exception as e:
        print(f"❌ UPLOAD ERROR: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@app.route("/api/commit-upload", methods=["POST"])
def commit_upload():
    """
    Commit cached upload to database
    """
    try:
        body = request.get_json(force=True)
        batch_id = body.get("batch_id")
        
        print(f"\n💾 Committing upload: {batch_id}")
        
        # Get from cache
        cache = app.config.get("UPLOAD_CACHE", {})
        pr = cache.get(batch_id)
        
        if not pr:
            return jsonify({"error": "Preview expired or invalid batch_id"}), 400
        
        # Insert into database
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        
        cur.execute("INSERT INTO uploads (batch_id, batch_name) VALUES (?, ?)",
                    (pr.batch_id, pr.batch_name))
        upload_id = cur.lastrowid
        
        inserted = 0
        skipped = 0
        
        for row in pr.data[pr.batch_name]:
            if isinstance(row, dict):
                enr = row.get("enrollmentNo")
                name = row.get("name")
            else:
                enr = str(row)
                name = None
            
            if not enr:
                skipped += 1
                continue
            
            try:
                cur.execute("""
                    INSERT INTO students
                    (upload_id, batch_id, batch_name, enrollment, name)
                    VALUES (?, ?, ?, ?, ?)
                """, (upload_id, pr.batch_id, pr.batch_name, enr, name))
                inserted += 1
            except sqlite3.IntegrityError:
                skipped += 1
        
        conn.commit()
        conn.close()
        
        # Remove from cache
        del app.config['UPLOAD_CACHE'][batch_id]
        
        print(f"✅ Committed: {inserted} inserted, {skipped} skipped\n")
        
        return jsonify({
            "success": True,
            "inserted": inserted,
            "skipped": skipped
        })
        
    except Exception as e:
        print(f"❌ COMMIT ERROR: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

# --------------------------------------------------
# Allocation (MAIN ENDPOINT)
# --------------------------------------------------
@app.route("/api/generate-seating", methods=["POST"])
def generate_seating():
    data = request.get_json(force=True)

    use_db = bool(data.get("use_demo_db", True))

    if use_db:
        counts, labels = get_batch_counts_and_labels_from_db()
        rolls = get_batch_roll_numbers_from_db()
        num_batches = len(counts)
    else:
        counts = {}
        labels = {}
        rolls = {}
        num_batches = int(data["num_batches"])

    algo = SeatingAlgorithm(
        rows=int(data["rows"]),
        cols=int(data["cols"]),
        num_batches=num_batches,
        block_width=int(data["block_width"]),
        batch_by_column=bool(data.get("batch_by_column", True)),
        enforce_no_adjacent_batches=bool(data.get("enforce_no_adjacent_batches", False)),
        broken_seats=[],
        batch_student_counts=counts,
        batch_roll_numbers=rolls,
        batch_labels=labels
    )

    algo.generate_seating()
    web = algo.to_web_format()
    web.setdefault("metadata", {})

    ok, errors = algo.validate_constraints()

    web["validation"] = {"is_valid": ok, "errors": errors}
    return jsonify(web)

# --------------------------------------------------
# Constraints
# --------------------------------------------------
@app.route("/api/constraints-status", methods=["POST"])
def constraints_status():
    data = request.get_json(force=True)
    algo = SeatingAlgorithm(
        rows=int(data["rows"]),
        cols=int(data["cols"]),
        num_batches=int(data["num_batches"]),
        block_width=int(data["block_width"]),
        batch_by_column=bool(data.get("batch_by_column", True)),
        enforce_no_adjacent_batches=bool(data.get("enforce_no_adjacent_batches", False)),
    )
    algo.generate_seating()
    return jsonify(algo.get_constraints_status())

# --------------------------------------------------
# PDF
# --------------------------------------------------
@app.route("/api/generate-pdf", methods=["POST"])
def generate_pdf():
    """
    Accepts seating JSON (same as /api/generate-seating output)
    Returns generated PDF file
    """
    try:
        data = request.get_json(force=True)
        if not data or "seating" not in data:
            return jsonify({"error": "Invalid seating data"}), 400

        output_dir = BASE_DIR / "seat_plan_generated"
        output_dir.mkdir(exist_ok=True)

        filename = output_dir / f"seating_{int(time.time())}.pdf"

        pdf_path = create_seating_pdf(
            filename=str(filename),
            data=data
        )

        return send_file(
            pdf_path,
            as_attachment=True,
            download_name=filename.name,
            mimetype="application/pdf"
        )

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# --------------------------------------------------
# IMPORTANT: NO index.html SERVED HERE
# --------------------------------------------------

if __name__ == "__main__":
    print("✔ Allocation API running at http://127.0.0.1:5000")
    app.run(debug=True, port=5000)
