### What Lives in RAM (In-Memory) After Startup

```powershell
Python Process Memory
│
├── _index  (dict)                          ← from summary_index.json, ~50KB
│     ├── roll_index        {788 entries}   roll → [filenames]
│     ├── file_hit_counts   {3 entries}     filename → int
│     ├── global_dates      [3 dates]
│     ├── global_times      [2 times]
│     └── plan_meta         {3 entries}     filename → metadata
│
└── _lru  (OrderedDict, maxsize=5)          ← built from parsing plan files
      │
      ├── "PLAN-LVZWSW9M.json"  →  _PlanEntry
      │     ├── student_index  (dict)
      │     │     {
      │     │       ("BTCS24O1001","2026-02-06","09:00","12:00"): {
      │     │           "room":    "103A",
      │     │           "row":     2,
      │     │           "col":     4,
      │     │           "batch":   "CSE24",
      │     │           "color":   "#93C5FD",
      │     │           "paper_set": "A",
      │     │           "student_name": "SOME NAME",
      │     │           "session": <SessionData obj>
      │     │       },
      │     │       ...566 entries
      │     │     }
      │     │
      │     └── session_index  (dict)
      │           {
      │             ("2026-02-06","09:00","12:00"): {
      │                 "SH-7":  { grid: [[...]], rows, cols, colors, block_structure },
      │                 "103A":  { grid: [[...]], rows, cols, ... },
      │                 "113A":  { grid: [[...]], ... },
      │                 ...8 rooms
      │             }
      │           }
      │
      ├── "PLAN-27T9T8MB.json"  →  _PlanEntry  (163 students, 4 rooms)
      └── "PLAN-H30Q4LHW.json"  →  _PlanEntry  (59 students, 2 rooms)
```


### Two-Layer Lookup Flow (Technical)
```powershell
Request: enrollment="BTCS24O1001", date="2026-02-07", start="09:00", end="12:00"

LAYER 1 — _index (always in RAM, never evicted)
──────────────────────────────────────────────
  _index["roll_index"]["BTCS24O1001"]
  → ["PLAN-27T9T8MB.json", "PLAN-LVZWSW9M.json"]
  
  iterate filenames:
    check plan_meta["PLAN-27T9T8MB.json"]["date"] == "2026-02-07" ✓
    → target_file = "PLAN-27T9T8MB.json"

LAYER 2 — _lru (in RAM, evictable)
──────────────────────────────────
  _lru.get("PLAN-27T9T8MB.json")
  → _PlanEntry  (HIT - was pre-warmed)
  
  entry.student_index[("BTCS24O1001","2026-02-07","09:00","12:00")]
  → { room="103", row=0, col=2, batch="CSE24", ... }
  
  entry.session_index[("2026-02-07","09:00","12:00")]
  → { "103": {grid, rows, cols}, "113": {...}, ... }

Total: 3 dict lookups, 0 disk I/O, < 0.1ms
```
### Files Involved & Their Role
```powershell
data/
  summary_index.json   ← ONLY read at startup / rebuild
                          never touched during search
  PLAN-LVZWSW9M.json   ← only read if LRU evicted it (rare)
  PLAN-27T9T8MB.json   ← only read if LRU evicted it (rare)
  PLAN-H30Q4LHW.json   ← only read if LRU evicted it (rare)

core/
  plan_index.py   ← builds/reads summary_index.json
  lru_cache.py    ← LRUCache class (OrderedDict + Lock)
  cache.py        ← AppCache: coordinates _index + _lru
  loader.py       ← ONLY place that opens .json files
  extractor.py    ← plan dict → list of (room, session) tuples
  indexer.py      ← sessions → student_index + session_index
```
---
### Full Request Lifecycle
```powershell
User submits: enrollment=BTCS24O1001, date=2026-02-06, 09:00-12:00
                              │
                              ▼
            ┌─────────────────────────────────┐
            │  _index["roll_index"]           │  O(1) dict lookup, ZERO I/O
            │  ["BTCS24O1001"]                │
            │  → "PLAN-LVZWSW9M.json"         │
            └─────────────────────────────────┘
                              │
                              ▼
            ┌─────────────────────────────────┐
            │  _lru.get("PLAN-LVZWSW9M.json") │  O(1), ZERO I/O
            │  → _PlanEntry (HIT)             │
            └─────────────────────────────────┘
                              │
                              ▼
            ┌──────────────────────────────────────────────┐
            │  entry.student_index[                        │  O(1), ZERO I/O
            │   ("BTCS24O1001","2026-02-06","09:00","12:00")│
            │  ] → SeatData {room, row, col, batch, color} │
            └──────────────────────────────────────────────┘
                              │
                              ▼
                    render result.html
            Total time: < 1ms, 0 disk reads
```

---
### LRU Eviction (When It Kicks In)
```powershell
LRU maxsize = 5, you have 3 files → all 3 always fit, eviction NEVER happens

If you add 6 files:
  LRU holds: [A, B, C, D, E]  ← 5 most recently used
  Search hits F (not in LRU)
      → disk read PLAN-F.json (one time)
      → build indexes
      → LRU evicts A (least recently used)
      → stores F
  Next search for A:
      → disk read again (A was evicted)
```
---
### Startup Sequence Step by Step
```powershell
1. logging setup          ← handlers attached to root logger
2. from core import cache
      │
      ├─ plan_index.load_index()
      │     └─ reads summary_index.json (1 I/O) → _index in RAM
      │
      ├─ get_top_files(_index, n=3)
      │     └─ sorts file_hit_counts → ["PLAN-LVZWSW9M.json", ...]
      │
      └─ for each top file:
            ├─ loader.load_plan_file(fname)   ← disk read
            ├─ extractor.extract_sessions()   ← parse rooms
            ├─ indexer.build_indexes()        ← build dicts
            └─ _lru.put(fname, _PlanEntry)    ← into RAM

3. Flask starts listening
```
---

## Questions
### What `summary_index.json` Stores

It stores where each roll number belongs (pre-built map) — NOT search history.
**All entries — every single roll number from every plan file.**

When `build_index()` runs it scans **every** `PLAN-*.json` file and adds **every** student it finds:
```powershell
PLAN-LVZWSW9M.json  → 566 students → all 566 added to roll_index
PLAN-27T9T8MB.json  → 163 students → all 163 added to roll_index
PLAN-H30Q4LHW.json  →  59 students →  all 59 added to roll_index
                                      ─────────────────────────
                         total →      788 entries in roll_index
```

So `summary_index.json` is a **complete directory** of every student across all plan files. No student is missing, no entry is random.

**Why all of them?** — because the whole point is:

- Any roll number searched → instantly know which file it's in
- If a roll number is NOT in `roll_index` → it genuinely doesn't exist in any plan file → show "not found" error immediately, without opening a single file

```json
{
  "roll_index": {
    "BTCS24O1001": ["PLAN-LVZWSW9M.json"],
    "BTCS24O1135": ["PLAN-27T9T8MB.json"],
    "BTCD25O1001": ["PLAN-LVZWSW9M.json"]
  },
  "file_hit_counts": {
    "PLAN-LVZWSW9M.json": 42,
    "PLAN-27T9T8MB.json": 18
  },
  "built_at": "2026-03-05T01:07:41"
}
```

- **Built once** when app starts or new file uploaded
- **Never updated per search** (hit_counts updated in RAM only, not written back to disk per search)
- Think of it as a **pre-built phone book** — roll number → which file to open
- Does NOT store seat positions, room, row, col — just the filename mapping
---
### What `session_index` Is
```powershell
_PlanEntry (per plan file in LRU)
  ├── student_index   ← roll+date+slot → exact seat (row, col, room, batch)
  └── session_index   ← date+slot → full room grid (all seats, all students)
```
- **`student_index`** answers: _"Where is THIS student sitting?"_
- **`session_index`** answers: _"Give me the full room layout for this exam session"_
---
### Why Some Roll Numbers Appear in 2 or in multiple Files like :
```json
"BTCS24O1001": ["PLAN-27T9T8MB.json", "PLAN-LVZWSW9M.json"]
```
This means `BTCS24O1001` exists in **both** plan files — meaning that student has **2 different exams on 2 different dates**:

- `PLAN-27T9T8MB.json` → exam on `2026-02-07`
- `PLAN-LVZWSW9M.json` → exam on `2026-02-06`

This is correct and expected. The date+slot in the search form disambiguates which one to use.


---
---


 


### Compare to plan.json file, what infomration is stored we are storing in ram 

#### RAM vs PLAN-LVZWSW9M.json — Side by Side
Top Level Structure
```powershell
PLAN-LVZWSW9M.json (disk)          RAM (_index + _lru)
──────────────────────────          ──────────────────────────
{                                   _index (from summary_index.json)
  "metadata": { ... }          →      plan_meta["PLAN-LVZWSW9M.json"]
  "inputs":   { ... }          →      NOT stored
  "rooms":    { ... }          →      _lru["PLAN-LVZWSW9M.json"] (_PlanEntry)
}
```
metadata ,inputs → Where It Goes
```powershell
"metadata": {
    "plan_id":        "PLAN-LVZWSW9M",      → _index["plan_meta"]["PLAN-LVZWSW9M.json"]["plan_id"]
    "date":           "02-06-2026",          → _index["plan_meta"]["PLAN-LVZWSW9M.json"]["date"] = "2026-02-06"
    "time_slot":      "09:00-12:00",         → _index["plan_meta"]["PLAN-LVZWSW9M.json"]["time_slot"]
    "total_students": 566,                   → _index["plan_meta"]["PLAN-LVZWSW9M.json"]["total_students"]
    "status":         "FINALIZED",           → _index["plan_meta"]["PLAN-LVZWSW9M.json"]["status"]
    "active_rooms":   ["SH-7", "LT-2"],      → NOT stored in RAM
    "latest_room":    "LT-2",               → NOT stored in RAM
    "last_updated":   "2026-02-06T12:11:45" → NOT stored in RAM
}

"inputs": {
    "rows":            9,       → NOT stored (per-room config used instead)
    "cols":            4,       → NOT stored
    "block_width":     2,       → NOT stored
    "block_structure": [2],     → NOT stored
    "broken_seats":    [],      → NOT stored
    "room_configs":    {},      → used DURING matrix build, not stored after
    "room_no":         "SH-7"  → NOT stored
}
```
rooms → Where It Goes (Most Important)
```powershell
"rooms": {
    "SH-7": {
        "batches": {
            "CSD25": {
                "students": [
                    {
                        "roll_number":   "BTCD25O1001",
                        "student_name":  "AAYUSH RATHORE",
                        "paper_set":     "A",
                        "batch_label":   "CSD25",
                        "block":         0,
                        "room_no":       "SH-7"
                    },
                    ...
                ]
            }
        },
        "room_config": {
            "rows":            9,
            "cols":            4,
            "block_structure": [2],
            "block_width":     2,
            "direction":       "row",
            "fill":            "batch"
        }
    },
    ...7 more rooms
}
```
Gets transformed into:
```powershell
_lru["PLAN-LVZWSW9M.json"]  →  _PlanEntry
│
├── student_index  (dict, 566 entries)
│     key:   ("BTCD25O1001", "2026-02-06", "09:00", "12:00")
│     value: {
│               "room":         "SH-7",
│               "row":          2,          ← computed by matrix.py
│               "col":          1,          ← computed by matrix.py
│               "batch":        "CSD25",
│               "paper_set":    "A",
│               "student_name": "AAYUSH RATHORE",
│               "color":        "#86EFAC",  ← assigned by batch color map
│               "session":      <ref to session_index entry>
│            }
│
└── session_index  (dict, 1 entry for this file)
      key:   ("2026-02-06", "09:00", "12:00")
      value: {
                "SH-7": {
                    "grid": [              ← full 2D matrix (9×4)
                        [ {roll, batch, color, paper_set, type}, ... ],
                        [ ... ],
                        ...9 rows
                    ],
                    "rows":            9,
                    "cols":            4,
                    "block_structure": [2],
                    "block_width":     2,
                    "colors":          {"CSD25": "#86EFAC", ...},
                    "room_no":         "SH-7"
                },
                "103A": { grid, rows, cols, ... },
                "113A": { ... },
                "113B": { ... },
                "M004": { ... },
                "105":  { ... },
                "SH-8": { ... },
                "LT-2": { ... }
             }
```

#### Complete Mapping Table

| JSON field | Stored in RAM? | Where | Used for |
| :--- | :---: | :--- | :--- |
| `metadata.plan_id` | ✅ | `_index["plan_meta"]` | identifying file |
| `metadata.date` | ✅ | `_index["plan_meta"]` | matching search date |
| `metadata.time_slot` | ✅ | `_index["plan_meta"]` | matching search slot |
| `metadata.total_students` | ✅ | `_index["plan_meta"]` | display on index page |
| `metadata.status` | ✅ | `_index["plan_meta"]` | display |
| `metadata.active_rooms` | ❌ | discarded | — |
| `metadata.last_updated` | ❌ | discarded | — |
| `inputs.*` | ❌ | consumed + discarded | matrix build only |
| `rooms.*.room_config` | ✅ | session_index per room | grid rendering |
| `rooms.*.batches.*.students[].roll_number` | ✅ | student_index key + summary_index | lookup |
| `rooms.*.batches.*.students[].student_name` | ✅ | student_index value | display |
| `rooms.*.batches.*.students[].paper_set` | ✅ | student_index value + grid cell | display |
| `rooms.*.batches.*.students[].batch_label` | ✅ | student_index value + grid cell | color + display |
| `rooms.*.batches.*.students[].block` | ✅ | matrix.py during build | seat positioning |
| `rooms.*.batches.*.students[].room_no` | ✅ | student_index value | display |
| `computed row` | ✅ | student_index value | highlight seat |
| `computed col` | ✅ | student_index value | highlight seat |
| `computed color` | ✅ | student_index + grid cell | batch color visual |
| `full 2D grid` | ✅ | session_index per room | render classroom |

one line summary per store :
```powershell
_index          ← lightweight directory (who is where, which file, what dates)
student_index   ← exact seat answer for every student (row, col, room, color)
session_index   ← full classroom grid for every room (for visual rendering)
summary_index   ← persistent version of _index on disk (survives restart)
```

# ## Summary Table

| Storage            | Location         | Size            | Built When                    | Evictable                   |
| ------------------ | ---------------- | --------------- | ----------------------------- | --------------------------- |
| summary_index.json | Disk             | ~50KB           | On upload/rebuild             | Never (persistent)          |
| `_index`           | RAM              | ~50KB           | Startup (read from json)      | No (lives forever)          |
| `_lru`             | RAM              | ~5MB total      | Startup pre-warm / cache miss | Yes (LRU evicts least used) |
| `student_index`    | RAM (inside LRU) | ~200KB per file | When file loaded into LRU     | With parent LRU entry       |
| `session_index`    | RAM (inside LRU) | ~2MB per file   | When file loaded into LRU     | With parent LRU entry       |
