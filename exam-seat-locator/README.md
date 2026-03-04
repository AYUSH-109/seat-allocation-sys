# Exam Seat Locator System

A Flask-based web application to help students find their exam seat by entering their enrollment number and exam session details.

---

## Project Structure

```
exam-seat-locator/
├── app.py              # Flask application entry point
├── seat_service.py     # Core business logic (load, index, search)
├── requirements.txt
├── data/
│   ├── session1.json   # Exam session data (add more freely)
│   ├── session2.json
│   └── session3.json
├── templates/
│   ├── index.html      # Search form
│   └── result.html     # Seat result with grid layout
└── static/
    └── style.css       # Dark industrial theme
```

---

## Setup & Run

### 1. Install dependencies
```bash
pip install -r requirements.txt
```

### 2. Run the application
```bash
python app.py
```

### 3. Open in browser
```
http://localhost:5000
```

---

## Adding New Exam Sessions

Simply create a new `.json` file in the `/data/` folder with this structure:

```json
{
  "exam_date": "2026-04-15",
  "start_time": "09:00",
  "end_time": "11:00",
  "classroom_number": "D-101",
  "layout": {
    "rows": 4,
    "columns": 5
  },
  "seats": [
    ["BTCS24O1001", "BTCS24O1002", null, "BTCS24O1003", null],
    ...
  ]
}
```

**No code changes required!** Click the **⟳ Reload Sessions** button in the footer or restart the app.

---

## Sample Enrollments to Test

| Enrollment     | Date       | Start | End   |
|----------------|------------|-------|-------|
| BTCS24O1001    | 2026-03-10 | 10:00 | 12:00 |
| BTCS24O1010    | 2026-03-10 | 10:00 | 12:00 |
| BTME24O2005    | 2026-03-10 | 14:00 | 16:00 |
| BTEC24O3015    | 2026-03-12 | 09:00 | 11:00 |

---

## Architecture

- `load_all_sessions()` — scans `/data/` dynamically using `os.listdir`
- `build_session_index()` — maps `(date, start, end)` → session data for O(1) lookup
- `find_matching_session()` — looks up a session by the 3-tuple key
- `find_student_seat()` — scans the 2D seats matrix for the enrollment number
