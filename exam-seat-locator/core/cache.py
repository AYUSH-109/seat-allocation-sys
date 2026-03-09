"""
core/cache.py - Multi-file in-memory cache with LRU + summary index.

Flow
----
  lookup_student(enrollment, date, start, end)
    1. summary index  → which plan file(s) contain this roll?   O(1)
    2. LRU hit?       → use pre-built in-memory indexes          O(1)
       LRU miss       → load file → build indexes → store in LRU
    3. search student_index for (enrollment, date, start, end)
    4. return result dict or None

Zero disk I/O on cache hits.  Maximum one file-read on an LRU miss.
"""

import os
import logging

import config
from .lru_cache  import LRUCache
from .plan_index import (
    load_index, build_index,
    get_filenames_for_roll, increment_hit, get_top_files,
)
from .loader    import load_plan_file
from .extractor import extract_room_sessions
from .indexer   import build_indexes

logger = logging.getLogger(__name__)


class _PlanEntry:
    """Holds all pre-built index data for one plan file."""
    __slots__ = ("session_index", "student_index")

    def __init__(self, session_index: dict, student_index: dict) -> None:
        self.session_index = session_index
        self.student_index = student_index


class AppCache:
    """
    Multi-file cache coordinator.

    Public attributes
    -----------------
    unique_dates : list[str]  — all exam dates across all known plan files
    unique_times : list[str]  — all time tokens across all known plan files
    loaded       : bool
    """

    def __init__(self) -> None:
        self._lru:             LRUCache = LRUCache(maxsize=5)
        self._index:           dict     = {}
        self.unique_dates:     list     = []
        self.unique_times:     list     = []
        self.unique_time_slots: list    = []
        self.loaded:           bool     = False

    # ── public API ────────────────────────────────────────────────────────────

    def load(self) -> None:
        """
        Load the summary index into memory and pre-warm the LRU cache
        with the most-accessed plan files.  Called once at startup.
        """
        logger.info("CACHE  loading summary index")
        self._index            = load_index()
        self.unique_dates      = self._index.get("global_dates", [])
        self.unique_times      = self._index.get("global_times", [])
        self.unique_time_slots = self._derive_time_slots()

        # Pre-warm LRU with historically most-used files
        for fname in get_top_files(self._index, n=3):
            if fname:
                self._get_entry(fname)

        self.loaded = True
        logger.info(
            f"CACHE  ready | students={len(self._index.get('roll_index', {}))} "
            f"files={len(self._index.get('file_hit_counts', {}))} "
            f"dates={self.unique_dates}"
        )

    def reload(self) -> None:
        """
        Rebuild the summary index from scratch (scans DATA_DIR for all
        PLAN-*.json files) then refresh LRU warmup.
        Call this after uploading a new plan file.
        """
        logger.info("CACHE  rebuild triggered")
        self._index            = build_index()
        self.unique_dates      = self._index.get("global_dates", [])
        self.unique_times      = self._index.get("global_times", [])
        self.unique_time_slots = self._derive_time_slots()
        self._lru.clear()
        for fname in get_top_files(self._index, n=3):
            if fname:
                self._get_entry(fname)
        self.loaded = True
        logger.info(f"CACHE  rebuild done | students={self.student_count} files={self.file_count}")

    def lookup_student(
        self,
        enrollment: str,
        exam_date:  str,
        start_time: str,
        end_time:   str,
    ) -> dict | None:
        """
        Find a student across all plan files.
        Returns { room, session, row, col } or None.

        Complexity: O(1) on LRU hit, O(file_size) on first LRU miss (once).
        """
        candidate_files = get_filenames_for_roll(self._index, enrollment)
        if not candidate_files:
            return None

        student_key = (enrollment, exam_date, start_time, end_time)

        for fname in candidate_files:
            entry = self._get_entry(fname)
            if entry is None:
                continue
            result = entry.student_index.get(student_key)
            if result is not None:
                increment_hit(self._index, fname)   # in-memory only, no disk write
                return result

        return None

    # ── private helpers ───────────────────────────────────────────────────────

    def _derive_time_slots(self) -> list:
        """Return sorted unique time-slot strings (e.g. '09:00-12:00') from plan metadata."""
        slots = sorted(set(
            m.get("time_slot", "")
            for m in self._index.get("plan_meta", {}).values()
            if m.get("time_slot")
        ))
        return slots

    # ── stats helpers (used by /reload flash + future /stats endpoint) ───────

    @property
    def student_count(self) -> int:
        """Total unique roll numbers known across all plan files."""
        return len(self._index.get("roll_index", {}))

    @property
    def file_count(self) -> int:
        return len(self._index.get("file_hit_counts", {}))

    def lru_stats(self) -> dict:
        return self._lru.stats()

    def plan_meta(self) -> dict:
        return self._index.get("plan_meta", {})

    # ── private ───────────────────────────────────────────────────────────────

    def _get_entry(self, fname: str) -> _PlanEntry | None:
        """Return LRU entry for fname, loading from disk on miss."""
        entry = self._lru.get(fname)
        if entry is not None:
            return entry
        return self._load_into_lru(fname)

    def _load_into_lru(self, fname: str) -> _PlanEntry | None:
        """Load a plan file from disk, build indexes, store in LRU."""
        plan_path = os.path.join(config.DATA_DIR, fname)
        plan_data = load_plan_file(plan_path)
        if not plan_data:
            return None
        sessions = extract_room_sessions(plan_data)
        sess_idx, stu_idx = build_indexes(sessions)
        entry = _PlanEntry(sess_idx, stu_idx)
        self._lru.put(fname, entry)
        logger.info(f"LRU MISS  {fname} -> loaded {len(stu_idx)} students")
        return entry
