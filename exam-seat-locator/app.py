"""
app.py - Flask application entry point for Exam Seat Locator System
Now supports multiple rooms with same exam date/time using dual index system
"""

import logging
from flask import Flask, render_template, request, redirect, url_for, flash
from seat_service import build_session_index, find_matching_session, find_student_seat

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.secret_key = "exam-seat-locator-secret-key-2026"

# Build both indexes at startup
session_index, student_index = build_session_index()
logger.info(f"Session index built with {len(session_index)} room sessions.")
logger.info(f"Student index built with {len(student_index)} student records.")

# Extract unique date and time options for dropdowns
UNIQUE_TIMES = sorted(set(
    t for (_, s, e, _) in session_index.keys() for t in (s, e)
))
UNIQUE_DATES = sorted(set(d for (d, _, _, _) in session_index.keys()))


@app.route("/", methods=["GET"])
def index():
    """Render the search form."""
    dates = UNIQUE_DATES
    times = UNIQUE_TIMES
    return render_template("index.html", dates=dates, times=times)


@app.route("/search", methods=["POST"])
def search():
    """Handle form submission and return seat result."""
    enrollment = request.form.get("enrollment", "").strip().upper()
    exam_date = request.form.get("exam_date", "").strip()
    start_time = request.form.get("start_time", "").strip()
    end_time = request.form.get("end_time", "").strip()

    # Input validation
    if not all([enrollment, exam_date, start_time, end_time]):
        flash("All fields are required.", "error")
        return redirect(url_for("index"))

    if start_time >= end_time:
        flash("End time must be after start time.", "error")
        return redirect(url_for("index"))

    # Search for student in any room with matching date/time
    student_key = (enrollment, exam_date, start_time, end_time)
    
    if student_key not in student_index:
        flash(
            f"Enrollment number '{enrollment}' not found for exam on {exam_date} "
            f"from {start_time} to {end_time}. Please verify your details.",
            "error"
        )
        return redirect(url_for("index"))

    # Get student info and their room
    student_info = student_index[student_key]
    room = student_info["room"]
    session = student_info["session"]
    row = student_info["row"]
    col = student_info["col"]

    # Prepare seat information
    seat_info = {
        "classroom_number": room,
        "exam_date": exam_date,
        "start_time": start_time,
        "end_time": end_time,
        "row": row,
        "col": col,
        "rows": session["layout"]["rows"],
        "columns": session["layout"]["columns"],
        "seats": session["seats"],
        "batches": session.get("batches", []),
        "total_students": session.get("metadata", {}).get("total_students", 0)
    }

    return render_template(
        "result.html",
        enrollment=enrollment,
        seat=seat_info,
    )


@app.route("/reload", methods=["POST"])
def reload_sessions():
    """Admin endpoint to reload the session index without restarting the server."""
    global session_index, student_index
    session_index, student_index = build_session_index()
    flash(
        f"Indexes reloaded. {len(session_index)} room sessions, "
        f"{len(student_index)} student records.",
        "success"
    )
    return redirect(url_for("index"))


@app.route("/test-result")
def test_result():
    """Demo endpoint to show a sample result page for testing visualization."""
    sample_seat = {
        "classroom_number": "SH-7",
        "exam_date": "2026-02-06",
        "start_time": "09:00",
        "end_time": "12:00",
        "row": 0,
        "col": 2,
        "rows": 8,
        "columns": 10,
        "seats": [
            ["BTCS24O1001", "BTCS24O1002", "BTCS24O1003", "BTCS24O1004", "BTCS24O1005", "BTCS24O1006"],
            ["BTCS24O1007", "BTCS24O1008", "BTCS24O1009", "BTCS24O1010", None, None],
            ["BTCS24O1011", "BTCS24O1012", None, "BTCS24O1013", "BTCS24O1014", "BTCS24O1015"],
            [None, "BTCS24O1016", "BTCS24O1017", "BTCS24O1018", None, "BTCS24O1019"],
            ["BTCS24O1020", None, "BTCS24O1021", None, "BTCS24O1022", "BTCS24O1023"]
        ]
    }
    return render_template(
        "result.html",
        enrollment="BTCS24O1003",
        seat=sample_seat,
    )


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
