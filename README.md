# Seat Allocation System

Two-part project: an admin seating plan generator (`algo/`) and a student-facing seat locator (`exam-seat-locator/`).

---

## What It Does

- **algo/** — Generates examination seating plans as `PLAN-*.json` files
  - Column-major multi-constraint algorithm with A/B paper set alternation
  - Batch isolation, broken-seat handling, adjacent-seating option
  - Outputs PDF attendance sheets + seating charts
  - Admin portal with JWT / Google OAuth2

- **exam-seat-locator/** — Lightweight Flask app for students to find their seat
  - Enter roll number + exam date + time → instantly shows classroom grid
  - Your seat highlighted; click it for a detail card (room, position, batch, set, grid ref)
  - Multi-file LRU cache — O(1) lookups, full dataset fits in L3 cache
  - Upload new plan files at runtime with no restart

---

## Project Structure

```
seat-allocation-sys/
├── algo/                        # Seating plan generator (Flask + algorithm)
│   ├── app.py
│   ├── main.py
│   ├── api/                     # REST endpoints (70+)
│   ├── core/                    # Seating algorithm
│   ├── services/                # PDF gen, data ingestion
│   ├── database/                # SQLite + SQLAlchemy models
│   └── requirements.txt
│
├── exam-seat-locator/           # Student seat finder (Flask)
│   ├── app.py                   # Routes: /, /search, /upload, /reload
│   ├── config.py
│   ├── seat_service.py
│   ├── core/
│   │   ├── cache.py             # AppCache — LRU + summary index coordinator
│   │   ├── lru_cache.py         # Thread-safe LRU (OrderedDict, maxsize=5)
│   │   ├── plan_index.py        # summary_index.json builder/loader
│   │   ├── extractor.py         # Session extraction from plan dict
│   │   ├── indexer.py           # O(1) student/session index builder
│   │   ├── loader.py            # JSON file reader + date parser
│   │   └── matrix.py            # 2-D seat matrix constructor
│   ├── data/                    # PLAN-*.json files
│   ├── templates/
│   │   ├── index.html           # Search form (date/time dropdowns from cache)
│   │   └── result.html          # Classroom grid + click-to-open info card
│   ├── static/
│   │   └── style.css
│   └── requirements.txt
│
├── Frontend/                    # React + Vite admin UI
│   ├── src/
│   └── package.json
│
├── tests/                       # Pytest suite
├── Details/                     # Architecture docs
├── README.md
└── updates.md
```

---

## How to Run

### exam-seat-locator (student seat finder)

```bash
cd exam-seat-locator
pip install -r requirements.txt

# Place one or more PLAN-*.json files in data/
python app.py
# → http://127.0.0.1:5000
```

### algo (plan generator + admin)

```bash
cd algo
pip install -r requirements.txt
python app.py
# → http://127.0.0.1:5000
```

### Frontend (React admin UI)

```bash
cd Frontend
npm install
npm start
# → http://localhost:5173
```

---

## Tech Stack

| Layer | Tech |
|---|---|
| Backend | Python 3.13, Flask |
| Cache | In-memory LRU (OrderedDict) + `summary_index.json` |
| Database | SQLite + SQLAlchemy ORM |
| Auth | JWT + Google OAuth2 |
| Frontend | React 18, Vite, Tailwind CSS |
| PDF | ReportLab |

---

## Performance (exam-seat-locator)

| Scenario | Time |
|---|---|
| Warm search (LRU hit) | ~4-9ms |
| Cold search (LRU miss, NVMe read) | ~80-190ms (once per file) |
| Info card open | <1ms JS + 300ms animation |
| RAM footprint (788 students, 3 files) | ~65MB |

All indexes (~8MB) fit entirely in L3 cache (16MB) after first few requests.
