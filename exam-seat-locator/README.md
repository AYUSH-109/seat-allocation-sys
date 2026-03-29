# Exam Seat Locator

Lightweight Flask app for students to visually find their assigned exam seats.

## ⚙️ Setup & Run
```bash
pip install -r requirements.txt
python app.py  # Runs on http://127.0.0.1:5000
```
> Place `PLAN-*.json` files into `data/` to read plans manually.

## 🚀 Key Features
- **Fast Lookups:** In-memory LRU plan caching & O(1) searches.
- **Auto Cleanup:** Background thread deletes old plan files.
- **Live Sync:** Active cloud sync receiver via HMAC-secured webhooks (`POST /webhook`).
- **Dynamic UI:** Dropdowns actively show only valid exam dates.

## 📍 Core Endpoints
- `GET /` — Search portal form
- `POST /search` — Look up a specific seat
- `POST /api/sync/notify` (webhook) — Cloudflare Worker sync receiver
- `POST /upload` — Upload new plan
- `POST /reload` — Build/refresh cache

## 🛠 Config (`config.py`)
- **`PLAN_RETENTION_DAYS`**: Auto-delete threshold.
- **`CLEANUP_INTERVAL_DAYS`**: File cleanup sweep interval.
