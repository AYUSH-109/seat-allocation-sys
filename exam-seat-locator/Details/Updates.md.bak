## 1. Project Overview

A Flask web application that allows students to find their exam seat by entering their enrollment number, exam date, and time slot. The system reads pre-generated JSON plan files and renders a full classroom layout with the student's seat highlighted.

```json
exam-seat-locator/
  app.py                  ← Flask routes only
  config.py               ← paths, constants, settings
  requirements.txt
  README.md
  core/
    __init__.py           ← singleton cache instantiation
    cache.py              ← AppCache coordinator
    lru_cache.py          ← thread-safe LRU implementation
    plan_index.py         ← summary_index.json build/read
    loader.py             ← ONLY place that touches disk
    extractor.py          ← plan dict → session list
    indexer.py            ← sessions → student/session indexes
    matrix.py             ← 2D seat grid builder
  data/
    PLAN-LVZWSW9M.json    ← 566 students, 8 rooms, 2026-02-06
    PLAN-27T9T8MB.json    ← 163 students, 4 rooms, 2026-02-07
    PLAN-H30Q4LHW.json    ←  59 students, 2 rooms, 2026-02-08
    summary_index.json    ← auto-generated, roll→filename map
  static/
    style.css
  templates/
    index.html
    result.html
```
---
## 2. What Was Built & Changed Today

---

### 2.1 Visual: Block/Aisle Separators in Classroom Layout

**Problem:** No visual separation between seat blocks in the classroom grid. Hard to read which aisle a seat belongs to.

**Solution:** Added visual aisle separators using `block_structure` (priority 1) or `block_width` (priority 2) from room config.
```json
block_structure: [3, 4, 3]  →  break after col 3, break after col 7
cols: 10

| C1 | C2 | C3 | ░░ | C4 | C5 | C6 | C7 | ░░ | C8 | C9 | C10 |
                  ↑ aisle                    ↑ aisle
```
---
**Files changed:**

- `app.py` — extracts `block_structure`/`block_width` from room config, passes to template
- `templates/result.html` — Jinja2 computes `break_cols` list, injects `<div class="block-sep-col">` after each break column, builds explicit `grid-template-columns` string
- `static/style.css` — `.block-sep-col`: 18px wide, centred 2px gradient line (fading at both ends)

---

### 2.2 Visual: Increased Classroom Layout Size


| What Changed                                                | Delta              |
| ----------------------------------------------------------- | ------------------ |
| seat column min-width, min-height, fonts, badge, axis-label | +10px / +5px fonts |
| Roll number left/right padding again                        | +10px → `2px 14px` |

**Final dimensions after all passes:**

|Property|Final Value|
|---|---|
|Seat column min-width|`85px`|
|Seat min-height|`67px`|
|Aisle separator width|`33px`|
|`.seat-label` font|`1.05rem`|
|`.seat-set` font|`0.90rem`|
|`.seat-badge` font|`0.95rem`|
|`.axis-label` font|`1.05rem`|
|`.seat-label` padding|`2px 14px`|

---

### 2.3 Visual: Solid Professional UI for Seats

**Problem:** Seats were translucent/glassy boxes — looked like a generic web app.

**Solution:** Redesigned every seat tile as a solid professional card with:

- **3px top-stripe accent** — colour signals state at a glance
- **Solid fills** per seat type (dark + light theme)
- **Inset inner shadow** for depth
- **Elevation hover** — `translateY(-4px)` + deep `box-shadow`
- **CSS variable system** — both `:root` (dark) and `[data-theme="light"]`

|Seat Type|Dark BG|Stripe|
|---|---|---|
|Occupied|`#0d1b3e`|`#2d5fcc`|
|Empty|`#0f1119`|`#1e2438`|
|Unallocated|`#161a26`|`#31394f`|
|Broken|`#1c0a10`|`#8b1a2a`|
|Mine (your seat)|`#c85e00 → #ff8c42` diagonal|white-tinted|

**Legend dots** updated to miniature versions of tiles — same solid bg + inset top-stripe shadow.

---

### 2.4 Visual: Batch-Specific Seat Colors

**Problem:** All occupied seats looked identical — impossible to visually distinguish batches.

**Solution:** Each batch gets a unique color (defined in `seat_service.py` / `matrix.py`). Color stored in each seat cell and injected as `--seat-color` CSS variable inline.

```html
<div class="seat seat-occupied"
     style="--seat-color: #93C5FD">
```
```javascript
     .seat-occupied::before {
    background: var(--seat-color, var(--seat-occ-stripe));
}
.seat-occupied .seat-label {
    color: var(--seat-color, var(--seat-occ-text));
}
```
- `.seat-occupied::before` → top stripe = batch color
- `.seat-occupied .seat-label` → roll number text = batch color
- `.seat-occupied .seat-set` → paper set = batch color at 75% opacity
- `.seat-mine::before` → your seat stripe also reflects your batch color

---
### 2.5 Mobile: Horizontal Scroll Fix (First Column Clipping)

**Problem:** On mobile, the first 1–2 columns of the classroom grid were clipped and unreachable — user could not scroll left to see them.

**Root cause:** `align-items: center` on a flex container + `overflow-x: auto` causes left-overflow to be permanently clipped (browser cannot scroll to negative `scrollLeft`).

**Fix:**

- `.layout-section` → `align-items: stretch` (children fill full width, no centering)
- New `.grid-scroller` wrapper div owns `overflow-x: auto` + `-webkit-overflow-scrolling: touch`
- `.layout-header`, `.blackboard`, `.scroll-hint` → `align-self: center` to stay centered
- `.seat-grid` / `.axis-row` → `width: max-content; min-width: 100%`

```html
<!-- result.html structure -->
<div class="layout-section">
  <div class="layout-header">...</div>
  <div class="blackboard">BLACKBOARD</div>
  <div class="grid-scroller">          ← NEW wrapper
    <div class="axis-row">...</div>
    <div class="seat-grid">...</div>
    <p class="scroll-hint">← swipe →</p>
  </div>
</div>
```

---
### 2.6 Architecture: Multi-File Support + Cache System

**Problem:** App was hardcoded to one file (`PLAN-LVZWSW9M.json`). Other plan files completely ignored. Full JSON reload on every single request. No caching.

**Solution:** Complete architecture rewrite.

#### Before
```txt
Every request:
  open PLAN-LVZWSW9M.json (hardcoded)
  → json.load() entire file
  → scan all students linearly
  → return result
  Total: full disk I/O + O(n) scan every time
```

#### After
```txt
Startup (once):
  read summary_index.json → _index in RAM
  pre-warm top-3 files → _lru in RAM

Every request:
  _index["roll_index"][roll] → filename     O(1), 0 I/O
  _lru.get(filename) → _PlanEntry           O(1), 0 I/O
  entry.student_index[(roll,date,s,e)]      O(1), 0 I/O
  Total: 3 dict lookups, < 0.1ms, 0 disk reads
```
---


for cache Management read the [memory management](exam-seat-locator/memory Management.md) file .

## Memory Layout (Current State)
```powershell
RAM (after startup)
│
├── _index (~50KB)
│     788 roll numbers → filenames
│     3 file hit counts
│     3 global dates
│     plan metadata for 3 files
│
└── _lru (~5–8MB total)
      ├── PLAN-LVZWSW9M.json → _PlanEntry
      │     student_index: 566 entries
      │     session_index: 1 session, 8 rooms, full grids
      ├── PLAN-27T9T8MB.json → _PlanEntry
      │     student_index: 163 entries
      │     session_index: 1 session, 4 rooms
      └── PLAN-H30Q4LHW.json → _PlanEntry
            student_index:  59 entries
            session_index: 1 session, 2 rooms

Disk I/O per search: 0
Disk I/O at startup: 4 reads (summary_index.json + 3 plan files)
```
---
## Performance & Capacity

|Operation|Complexity|Latency|Disk I/O|
|---|---|---|---|
|Startup|O(n students)|~500ms|4 reads|
|Search (LRU hit)|O(1)|**< 0.1ms**|**0**|
|Search (LRU miss)|O(file)|200–800ms|1 read|
|Index rebuild|O(n students)|~500ms|n+1 reads|

|Metric|Current|Theoretical Max|
|---|---|---|
|Total students indexed|788|~500,000 (RAM limit)|
|Plan files|3|Unlimited|
|LRU hot slots|3/5|5 (increase in config)|
|Concurrent users (dev server)|~50 req/s|—|
|Concurrent users (gunicorn 4w)|~400–800 req/s|—|
|Search latency (warm)|< 0.1ms|—|

---

## 5. Why Not SQLite / Other Databases

| |Current (Dict+LRU)|SQLite|PostgreSQL|Redis|
|---|---|---|---|---|
|Search latency|**< 0.1ms**|2–10ms|5–20ms|0.1–0.5ms|
|Disk I/O/search|**0**|1|1 (network)|0 (but network)|
|Setup|None|Schema+migrations|Server+schema|Server|
|Data is static?|✅ perfect fit|overkill|overkill|close but network overhead|
|Complex queries|❌|✅|✅|❌|
|Frequent writes|❌|✅|✅|✅|

**Verdict:** For read-heavy, static, small-scale exam seat lookup — a Python dict in RAM is the theoretical minimum latency. No database can beat a direct memory pointer lookup.
## When to Consider a Database

Only if:

- Students exceed **~500,000** (RAM pressure)
- Need queries like _"show all students in room 103"_
- Seats change live during exam (real-time writes)
- Multiple app servers need shared state## 6. Recent Stability Enhancements
- **Memory Bounds:** Webhook payloads and S3/R2 downloads are chunked () and capped by  to prevent OOM vulnerabilities.
- **Cache Debouncing:** The `_ReloadBatcher` defers `cache.reload()` execution until either a batch limit is met or a timeout expires, cutting down overhead during bulk downloads.
- **Queue Heartbeat:** Worker threads now have a `recover_stuck_processing` heartbeat that detects timeout exceptions and safely reverts pending jobs for a retry.
- **API Rate Limiting:** Applied dictionaries-based `FixedWindowRateLimiter` to `/upload` and `/api/sync/notify` to prevent DoS attacks.
- **Cache Debouncing:** The `_ReloadBatcher` defers cache reloading until a batch limit is reached, minimizing CPU thrash during bulk plan synchronization.
- **Queue Heartbeat:** Stuck sync jobs are automatically flagged and requeued through `recover_stuck_processing` logic.
- **UI Realism:** The frontend index dropdowns now only render strict valid `cache.unique_dates` directly scanned from active JSON plans.
- **API Rate Limiting:** A custom `FixedWindowRateLimiter` protects against DoS attempts on uploads and webhook endpoints.
- **UI Realism:** The frontend index dropdowns now only render strict valid `cache.unique_dates` directly scanned from active JSON plans.
- **API Rate Limiting:** A custom `FixedWindowRateLimiter` protects against DoS attempts on uploads and webhook endpoints.
