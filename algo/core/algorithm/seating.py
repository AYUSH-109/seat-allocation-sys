# Core seating allocation algorithm.
# Implements the logic for placing students in rows/columns with batch constraints and paper set alternation.
import math
import re
from typing import List, Dict, Tuple, Optional
from collections import deque
import logging

from algo.core.models.allocation import Seat, PaperSet

logger = logging.getLogger(__name__)

class SeatingAlgorithm:
    # Default batch colors (can be customized)
    DEFAULT_BATCH_COLORS = {
        1: "#BFDBFE",  # Blue (Tailwind 200)
        2: "#BBF7D0",  # Green
        3: "#FECACA",  # Red/Pink
        4: "#FDE68A",  # Amber/Yellow
        5: "#E9D5FF",  # Purple
    }

    def __init__(
        self,
        rows: int,
        cols: int,
        num_batches: int,
        block_width: int = 3,
        block_structure: Optional[List[int]] = None,  # NEW: Variable block widths [3,2,3,1]
        batch_by_column: bool = True,
        randomize_column: bool = False,
        # roll formatting options
        roll_template: Optional[str] = None,
        batch_prefixes: Optional[Dict[int, str]] = None,
        year: Optional[int] = None,
        # sensible defaults: 1001 as starting serial and 4-digit serial width
        start_serial: int = 1001,
        start_serials: Optional[Dict[int, int]] = None,
        # Allow users to provide start roll strings per-batch e.g. {1: 'BTCS24O1135'}
        start_rolls: Optional[Dict[int, str]] = None,
        serial_width: int = 4,
        serial_mode: str = "per_batch",
        broken_seats: Optional[List[Tuple[int, int]]] = None,
        # batch student counts: {1: 35, 2: 30, 3: 25} etc
        batch_student_counts: Optional[Dict[int, int]] = None,
        # batch colors: {1: "#DBEAFE", 2: "#DCFCE7"} etc
        batch_colors: Optional[Dict[int, str]] = None,
        # NEW: human-readable labels for batches (e.g. branches) {1: "CSE", 2: "ECE"}
        batch_labels: Optional[Dict[int, str]] = None,
        # NEW: real enrollment numbers per batch.
        # Example: {1: ["BTCS24O1001", "BTCS24O1002"], 2: ["BTCD24O2001", ...]}
        batch_roll_numbers: Optional[Dict[int, List[str]]] = None,
        # NEW: Allow adjacent seating for same batch (useful for single-batch scenarios)
        allow_adjacent_same_batch: bool = False,
    ):
        """
        rows, cols, num_batches: as before
        block_width: number of columns per block (default 3 as requested) - used if block_structure is None
        block_structure: list of variable block widths, e.g. [3,2,3] for 8 columns
                        Takes precedence over block_width if provided.
        batch_by_column: if True, assign each column to a batch and fill that column
                         top->down using that batch's roll-number pool (matches your example)
        enforce_no_adjacent_batches: when True validate that adjacent seats don't share same batch
        broken_seats: list of (row, col) tuples for seats that are broken/unavailable
        batch_student_counts: dict mapping batch number to total students in that batch
                            e.g. {1: 35, 2: 30, 3: 25} - determines how many from each batch to seat
        batch_colors: dict mapping batch number to color code (hex)
                     e.g. {1: "#DBEAFE", 2: "#DCFCE7"}
        batch_labels: dict mapping batch number to human-readable label (e.g. branch names)
                     e.g. {1: "CSE", 2: "ECE"}
        batch_roll_numbers: OPTIONAL: if provided, these are the actual roll/enrollment numbers
                            used instead of auto-generated serials.
        """
        self.rows = rows
        self.cols = cols
        self.num_batches = num_batches
        
        # Handle block structure - variable widths take precedence
        self.block_structure = block_structure
        if self.block_structure:
            # Validate and use variable block structure
            self._build_block_map()
            self.block_width = self.block_structure[0] if self.block_structure else block_width
            self.blocks = len(self.block_structure)
        else:
            # Legacy: uniform block width
            self.block_width = max(1, block_width)
            self.blocks = math.ceil(cols / self.block_width)
            # Build legacy block map
            self._build_uniform_block_map()
        
        self.batch_by_column = batch_by_column
        self.randomize_column = randomize_column
        # broken seats as a set for O(1) lookup
        self.broken_seats = set(broken_seats) if broken_seats else set()
        # batch student counts - total students available per batch
        self.batch_student_counts = batch_student_counts or {}
        # batch colors - use provided or fall back to defaults
        self.batch_colors = batch_colors or {}
        for b in range(1, num_batches + 1):
            if b not in self.batch_colors:
                self.batch_colors[b] = self.DEFAULT_BATCH_COLORS.get(b, "#E5E7EB")

        # NEW: batch labels (branch names etc.)
        self.batch_labels = batch_labels or {}

        # roll formatting
        self.roll_template = roll_template
        # map batch number -> prefix string (e.g. 1->'BTCS')
        self.batch_prefixes = batch_prefixes or {}
        # numeric year used in template if provided
        self.year = year
        # default start serial for batches
        self.start_serial = start_serial
        # per-batch start serial overrides
        self.start_serials = start_serials or {}
        # user-provided start roll strings per batch (e.g. {1: 'BTCS24O1135'})
        self.start_rolls = start_rolls or {}
        # NEW: per-batch real enrollment/roll strings
        self.batch_roll_numbers = batch_roll_numbers or {}
        # NEW: Allow adjacent seating for same batch
        self.allow_adjacent_same_batch = allow_adjacent_same_batch
        # zero-pad width for serial portion
        self.serial_width = max(0, serial_width)
        # serial_mode: 'per_batch' or 'global'
        self.serial_mode = serial_mode
        self.init_errors = []
        self.seating_plan: List[List[Seat]] = []
        # Per-batch templates derived from start_rolls or batch_prefixes/year
        # batch_templates[b] is a string containing '{serial}' where the serial digits go
        self.batch_templates: Dict[int, str] = {}

        # populate batch_templates and per-batch start_serials from start_rolls if provided
        for b, s in list(self.start_rolls.items()):
            if not isinstance(s, str):
                continue
            s = s.strip()
            # find trailing digits (serial)
            m = re.search(r"(\d+)$", s)
            if m:
                serial_digits = m.group(1)
                prefix_part = s[: -len(serial_digits)]
                try:
                    serial_val = int(serial_digits)
                except ValueError:
                    continue
                # build template by replacing trailing digits with {serial}
                template = prefix_part + "{serial}"
                self.batch_templates[b] = template
                # set start serial and width inferred from provided string unless already set
                if b not in self.start_serials:
                    self.start_serials[b] = serial_val
                # if user didn't set serial_width explicitly, infer from length
                if (serial_width is None) or (serial_width == 0):
                    self.serial_width = max(self.serial_width, len(serial_digits))

    def _build_block_map(self):
        """
        Build column-to-block mapping for variable block structure.
        
        Example: block_structure = [3, 2, 3] for 8 columns
        - Columns 0, 1, 2 → Block 0
        - Columns 3, 4 → Block 1
        - Columns 5, 6, 7 → Block 2
        """
        self.col_to_block = {}
        self.block_ranges = []  # [(start_col, end_col), ...]
        
        start = 0
        for block_idx, width in enumerate(self.block_structure):
            end = start + width - 1
            self.block_ranges.append((start, end))
            for c in range(start, start + width):
                if c < self.cols:  # Safety check
                    self.col_to_block[c] = block_idx
            start += width
        
        logger.debug(f"Block structure: {self.block_structure}, Block ranges: {self.block_ranges}")
    
    def _build_uniform_block_map(self):
        """
        Build column-to-block mapping for uniform block width (legacy).
        """
        self.col_to_block = {}
        self.block_ranges = []
        
        for c in range(self.cols):
            block_idx = c // self.block_width
            self.col_to_block[c] = block_idx
        
        # Build ranges
        for block_idx in range(self.blocks):
            start = block_idx * self.block_width
            end = min(start + self.block_width - 1, self.cols - 1)
            self.block_ranges.append((start, end))
    
    def _get_block_index(self, col: int) -> int:
        """Get block index for a given column using the prebuilt mapping."""
        return self.col_to_block.get(col, 0)
    
    def _is_same_block(self, col1: int, col2: int) -> bool:
        """Check if two columns are in the same block."""
        return self._get_block_index(col1) == self._get_block_index(col2)
    
    def _get_col_in_block(self, col: int) -> int:
        """Get the position of a column within its block (0-indexed)."""
        block_idx = self._get_block_index(col)
        if block_idx < len(self.block_ranges):
            block_start = self.block_ranges[block_idx][0]
            return col - block_start
        return col % self.block_width  # Fallback

    def generate_seating(self) -> List[List[Seat]]:
        """Generate seating arrangement with all constraints"""
        self.seating_plan = []

        # If using batch-by-column placement, construct roll pools per batch
        if self.batch_by_column:
            total = self.rows * self.cols
            # Count available seats (not broken)
            available_seats = total - len(self.broken_seats)

            # For column-major batch assignment, seats per batch should be based on how many
            # columns are assigned to each batch (not simply total // num_batches). Compute
            # columns distribution first, then multiply by rows to get seats per batch.
            base_cols = self.cols // self.num_batches
            rem_cols = self.cols % self.num_batches
            cols_per_batch = [
                base_cols + (1 if i < rem_cols else 0) for i in range(self.num_batches)
            ]
            batch_sizes = [cols_per_batch[i] * self.rows for i in range(self.num_batches)]

            # If batch_student_counts is provided, use those limits instead of batch_sizes
            # If batch_roll_numbers is provided, we prefer len(roll_numbers) as limit
            batch_limits: Dict[int, int] = {}
            for b in range(1, self.num_batches + 1):
                if self.batch_student_counts and b in self.batch_student_counts:
                    batch_limits[b] = self.batch_student_counts[b]
                elif self.batch_roll_numbers and b in self.batch_roll_numbers:
                    # Only map if the key exists to avoid KeyError
                    batch_limits[b] = len(self.batch_roll_numbers[b])
                else:
                    batch_limits[b] = batch_sizes[b - 1]

            # Track how many students have been allocated per batch
            batch_allocated = {b: 0 for b in range(1, self.num_batches + 1)}

            # Build roll queues
            batch_queues: Dict[int, deque] = {}
            next_roll = self.start_serial

            for i, size in enumerate(batch_sizes):
                b = i + 1

                # NEW: if real enrollment list is provided for this batch, use that directly
                if self.batch_roll_numbers and b in self.batch_roll_numbers:
                    # We don't pad or format; we just treat them as final roll/enrollment strings
                    rolls = [r for r in self.batch_roll_numbers[b] if r]
                    batch_queues[b] = deque(rolls)
                    continue

                # If no explicit template was provided but we have prefixes/year,
                # build a sensible default template e.g. 'BTCS24O{serial}'
                effective_template = self.roll_template
                if not effective_template and self.batch_prefixes and self.year is not None:
                    effective_template = "{prefix}{year}O{serial}"

                # Per-batch template preference: if user supplied a start-roll string for this batch,
                # it overrides the generic effective_template.
                batch_template = self.batch_templates.get(b, effective_template)

                # If roll_template/effective_template is not provided, keep numeric global numbering
                if not batch_template:
                    rolls = [str(next_roll + j) for j in range(size)]
                    batch_queues[b] = deque(rolls)
                    next_roll += size
                    continue

                # If serial_mode is 'per_batch', pre-generate per-batch formatted rolls
                if self.serial_mode == "per_batch":
                    s = self.start_serials.get(b, self.start_serial)
                    rolls = []
                    for j in range(size):
                        serial_val = s + j
                        prefix = self.batch_prefixes.get(b, "")
                        serial_str = (
                            str(serial_val).zfill(self.serial_width)
                            if self.serial_width
                            else str(serial_val)
                        )
                        # Try formatting with named fields; fall back to simple replacement if needed
                        try:
                            rolls.append(
                                batch_template.format(
                                    prefix=prefix, year=self.year or "", serial=serial_str
                                )
                            )
                        except Exception:
                            # If batch_template only contains '{serial}', do a replacement
                            rolls.append(batch_template.replace("{serial}", serial_str))
                    batch_queues[b] = deque(rolls)
                    next_roll += size
                    continue

                # serial_mode == 'global': we will assign serials on-the-fly during fill (use next_roll as global counter)
                # prepare an empty deque (we'll not use it)
                batch_queues[b] = deque()

            # Prepare seating grid
            for r in range(self.rows):
                self.seating_plan.append([None] * self.cols)

            # Fill seating column by column; each column assigned to a batch (col % num_batches)+1
            import random
            
            # Column-major assignment (Batch by Column)
            for col in range(self.cols):
                # BLOCK-AWARE GAP: If only one batch is assigned, skip odd columns WITHIN each block
                # to prevent same-batch horizontal neighbors (unless allow_adjacent_same_batch is True)
                if self.num_batches == 1 and not self.allow_adjacent_same_batch:
                    col_in_block = self._get_col_in_block(col)
                    if col_in_block % 2 != 0:
                        # This is a gap column within a block
                        for row in range(self.rows):
                            is_broken = (row, col) in self.broken_seats
                            self.seating_plan[row][col] = Seat(
                                row=row, col=col, is_broken=is_broken, roll_number=None, 
                                color="#FF0000" if is_broken else "#F3F4F6", # Red if broken
                                paper_set=self._calculate_paper_set(row, col, b),
                                block=self._get_block_index(col)
                            )
                        continue

                b = (col % self.num_batches) + 1
                
                # Pre-calculate students needed for this column to allow randomization
                available_seats_in_col = []
                for r in range(self.rows):
                    if (r, col) not in self.broken_seats:
                        available_seats_in_col.append(r)
                
                # Fetch students for these seats
                needed_count = min(len(available_seats_in_col), batch_limits[b] - batch_allocated[b])
                column_students = []
                
                for _ in range(needed_count):
                    # Fetch student data (real enrollment or generated)
                    rn = None
                    st_name = ""
                    
                    template_for_this_batch = self.batch_templates.get(b, self.roll_template or "{prefix}{year}O{serial}")
                    
                    if (template_for_this_batch and self.serial_mode == "global" and 
                        not (self.batch_roll_numbers and b in self.batch_roll_numbers)):
                        serial_val = next_roll
                        next_roll += 1
                        prefix = self.batch_prefixes.get(b, "")
                        serial_str = str(serial_val).zfill(self.serial_width) if self.serial_width else str(serial_val)
                        try:
                            rn = template_for_this_batch.format(prefix=prefix, year=self.year or "", serial=serial_str)
                        except:
                            rn = template_for_this_batch.replace("{serial}", serial_str)
                    elif batch_queues[b]:
                        data_item = batch_queues[b].popleft()
                        if isinstance(data_item, dict):
                            rn = data_item.get('roll', '')
                            st_name = data_item.get('name', '')
                            semester = data_item.get('semester', 'I')
                            # Strict check: roll should not be empty if real data is expected
                            if not rn:
                                self.init_errors.append(f"Batch {b} student record missing roll number")
                        else:
                            rn = str(data_item)
                            st_name = ""
                            semester = "I"
                            # Check if it looks like a real enrollment (not just a single digit)
                            if self.batch_roll_numbers and not re.search(r'[A-Z]', rn):
                                self.init_errors.append(f"Batch {b} using numeric fallback instead of enrollment string: {rn}")
                    
                    if rn:
                        column_students.append({'roll': rn, 'name': st_name, 'semester': semester})
                        batch_allocated[b] += 1

                # Randomize within the column if feature is active
                if self.randomize_column:
                    random.shuffle(column_students)

                # Assign students to rows in this column
                student_idx = 0
                for row in range(self.rows):
                    # Check if this seat is broken
                    if (row, col) in self.broken_seats:
                        self.seating_plan[row][col] = Seat(row=row, col=col, is_broken=True, color="#FF0000")
                        continue

                    # If we have a student for this seat
                    if student_idx < len(column_students):
                        student = column_students[student_idx]
                        self.seating_plan[row][col] = Seat(
                            row=row,
                            col=col,
                            batch=b,
                            paper_set=self._calculate_paper_set(row, col, b),
                            block=self._get_block_index(col),
                            roll_number=student['roll'],
                            student_name=student['name'],
                            semester=student.get('semester', 'I'),
                            color=self.batch_colors.get(b, "#E5E7EB"),
                        )
                        student_idx += 1
                    else:
                        # No more students for this column/batch
                        self.seating_plan[row][col] = Seat(
                            row=row,
                            col=col,
                            batch=b,
                            paper_set=self._calculate_paper_set(row, col, b),
                            block=self._get_block_index(col),
                            roll_number=None,
                            color="#F3F4F6",
                        )
        else:
            # Alternative mode: simple row-wise assignment with sequential numbers
            roll = 1
            for row in range(self.rows):
                current_row: List[Seat] = []
                for col in range(self.cols):
                    # Check if this seat is broken
                    if (row, col) in self.broken_seats:
                        seat = Seat(row=row, col=col, is_broken=True, color="#FF0000")  # Red for broken
                        current_row.append(seat)
                        continue

                    # Calculate batch using row+column pattern to avoid vertical/horizontal collisions
                    batch = self._calculate_batch(row, col)

                    # Calculate paper set using row-based alternation
                    paper_set = self._calculate_paper_set(row, col, batch)

                    # Calculate block
                    block = self._get_block_index(col)

                    # Get batch color
                    batch_color = self.batch_colors.get(batch, "#E5E7EB")

                    seat = Seat(
                        row=row,
                        col=col,
                        batch=batch,
                        paper_set=paper_set,
                        block=block,
                        roll_number=str(roll),
                        color=batch_color,
                    )
                    current_row.append(seat)
                    roll += 1
                self.seating_plan.append(current_row)

        return self.seating_plan

    def _calculate_batch(self, row: int, col: int) -> int:
        """Calculate batch using both row and column so adjacent seats get different batches.

        This uses a simple offset pattern: (row + col) % num_batches + 1. It provides
        a good spread and avoids vertical/horizontal collisions for num_batches >= 2.
        """
        if self.num_batches <= 1:
            return 1
        return ((row + col) % self.num_batches) + 1

    def _calculate_paper_set(self, row: int, col: int, current_batch: int) -> PaperSet:
        """Enhanced paper-set calculation with strict same-batch alternation.
        
        Priority (3-Tier System):
          P1 (Highest): Vertical same-batch check - if student directly above is same batch, alternate
          P2 (Medium): Horizontal same-batch check within SAME BLOCK - check all left neighbors in block
          P3 (Lowest): Standard checkerboard alternation
          
        This ensures same-batch students NEVER have the same paper set when adjacent,
        and within the same block horizontally.
        """
        current_label = self.batch_labels.get(current_batch, str(current_batch))
        
        # P1: Check IMMEDIATE vertical neighbor (row-1, same col)
        if row > 0:
            above_seat = self.seating_plan[row - 1][col]
            # Only check if seat exists, is not broken, and has a student assigned
            if above_seat and not above_seat.is_broken and above_seat.roll_number:
                above_label = self.batch_labels.get(above_seat.batch, str(above_seat.batch))
                # If same batch, MUST alternate
                if above_label == current_label:
                    return PaperSet.B if above_seat.paper_set == PaperSet.A else PaperSet.A
        
        # P2: Check ALL horizontal neighbors within the SAME BLOCK (left side only)
        # This ensures same-batch students in the same row within a block have different sets
        current_block = self._get_block_index(col)
        block_start, block_end = self.block_ranges[current_block] if current_block < len(self.block_ranges) else (0, self.cols - 1)
        
        # Scan from current column backwards to the start of the block
        for c in range(col - 1, block_start - 1, -1):
            if c < 0:
                break
            left_seat = self.seating_plan[row][c]
            # Only check if seat exists, is not broken, and has a student assigned
            if left_seat and not left_seat.is_broken and left_seat.roll_number:
                left_label = self.batch_labels.get(left_seat.batch, str(left_seat.batch))
                # If same batch, MUST alternate from this neighbor
                if left_label == current_label:
                    return PaperSet.B if left_seat.paper_set == PaperSet.A else PaperSet.A
        
        # P3: Standard checkerboard alternation (fallback)
        # Use (row + col) % 2 for true checkerboard pattern
        return PaperSet.A if (row + col) % 2 == 0 else PaperSet.B

    # ------------------ validation helpers (unchanged) ------------------ #

    def validate_constraints(self) -> Tuple[bool, List[str]]:
        """Validate all seating constraints"""
        errors = []

        # Check 2: Paper Set Alternation
        # 2a: Vertical alternation (Same Label Focus)
        for c in range(self.cols):
            # Track state per batch LABEL
            last_label_student = {} # label -> (row, paper_set)
            for r in range(self.rows):
                seat = self.seating_plan[r][c]
                if not seat or seat.is_broken or not seat.roll_number:
                    continue
                
                # Check: Same Label Sequence
                label = self.batch_labels.get(seat.batch, str(seat.batch))
                if label in last_label_student:
                    last_r, last_set = last_label_student[label]
                    dist = r - last_r
                    if seat.paper_set == last_set:
                        # Report as error if physically adjacent (dist 1), otherwise warning
                        if dist == 1:
                            errors.append(f"Same paper set vertically for batch {label} at col {c}, rows {last_r} and {r}")
                        else:
                            # Use a specific prefix to distinguish warnings if needed
                            errors.append(f"Same paper set for batch {label} vertically (Integrity Warning at dist {dist}) at col {c}, rows {last_r}-{r}")
                last_label_student[label] = (r, seat.paper_set)

        # 2b: Horizontal alternation (Same Label Focus)
        for r in range(self.rows):
            last_label_student = {}
            for c in range(self.cols):
                seat = self.seating_plan[r][c]
                if not seat or seat.is_broken or not seat.roll_number:
                    continue
                
                # Check: Same Label Sequence
                label = self.batch_labels.get(seat.batch, str(seat.batch))
                if label in last_label_student:
                    last_c, last_set = last_label_student[label]
                    dist = c - last_c
                    if seat.paper_set == last_set:
                        # Report as error if physically adjacent (dist 1), otherwise warning
                        if dist == 1:
                            errors.append(f"Same paper set horizontally for batch {label} at row {r}, cols {last_c}-{c}")
                        else:
                            errors.append(f"Same paper set for batch {label} horizontally (Integrity Warning at dist {dist}) in row {r}, cols {last_c}-{c}")
                last_label_student[label] = (c, seat.paper_set)

        # Check 3: No duplicate roll numbers and coverage (skip broken seats)
        seen_rolls = set()
        assigned_count = 0
        for r in range(self.rows):
            for c in range(self.cols):
                seat = self.seating_plan[r][c]
                if seat.is_broken or seat.roll_number is None:
                    continue
                rn = seat.roll_number
                if rn in seen_rolls:
                    errors.append(f"Duplicate roll number {rn} at row {r}, col {c}")
                seen_rolls.add(rn)
                assigned_count += 1
        # Expected total is number of non-broken, non-unallocated seats
        expected_total = assigned_count
        if len(seen_rolls) != expected_total:
            errors.append(
                f"Roll numbers count mismatch: expected {expected_total}, found {len(seen_rolls)}"
            )

        # Check 5: Batch Isolation (Inside Blocks only)
        for r in range(self.rows):
            for c in range(self.cols - 1):
                seat = self.seating_plan[r][c]
                right = self.seating_plan[r][c + 1]
                
                if (not seat.is_broken and seat.roll_number and 
                    not right.is_broken and right.roll_number):
                    # Only flag if both students are in the same batch AND same block
                    if seat.batch == right.batch:
                        if self._is_same_block(c, c + 1):
                            label = self.batch_labels.get(seat.batch, seat.batch)
                            errors.append(f"Same batch {label} sitting horizontally at row {r}, cols {c}-{c+1} (Same Block)")

        # Final Decision: Separation of Errors and Warnings
        # A plan is "correct" if it has no physical adjacency same-set violations (dist 1)
        # and no duplicate roll numbers. Sequence violations (dist > 1) are flagged as 
        # "Integrity Warnings" but allow validation to pass.
        critical_errors = [e for e in errors if "Integrity Warning" not in e]
        return len(critical_errors) == 0, errors

    def get_constraints_status(self) -> Dict:
        """Get status of all applied constraints"""
        constraints = []

        # 1. Broken seats constraint
        constraints.append(
            {
                "name": "Broken Seats Handling",
                "description": f"Marks {len(self.broken_seats)} seats as unavailable",
                "applied": len(self.broken_seats) > 0,
                "satisfied": True
                if len(self.broken_seats) == 0
                else self._verify_broken_seats_respected(),
            }
        )

        # 2. Batch student counts constraint
        constraints.append(
            {
                "name": "Batch Student Counts",
                "description": f"Limits per-batch allocations: {dict(self.batch_student_counts) if self.batch_student_counts else 'Not set'}",
                "applied": bool(self.batch_student_counts),
                "satisfied": self._verify_batch_counts_respected(),
            }
        )

        # 3. Block width constraint
        block_desc = (
            f"Variable blocks: {self.block_structure}" 
            if self.block_structure 
            else f"Uniform: {self.blocks} blocks of {self.block_width} columns each"
        )
        constraints.append(
            {
                "name": "Block Structure",
                "description": block_desc,
                "applied": True,
                "satisfied": self._verify_blocks_correct(),
            }
        )

        # 4. Paper set alternation constraint
        constraints.append(
            {
                "name": "Paper Set Alternation",
                "description": "Paper sets A and B follow the student sequence, skipping broken/empty seats",
                "applied": True,
                "satisfied": self._verify_paper_sets_alternate(),
            }
        )

        # 5. Batch-by-column assignment
        constraints.append(
            {
                "name": "Batch-by-Column Assignment",
                "description": "Each column assigned to single batch, filled top-to-bottom",
                "applied": self.batch_by_column,
                "satisfied": self._verify_column_batch_assignment()
                if self.batch_by_column
                else True,
            }
        )

        # 6. Randomize within column status
        constraints.append(
            {
                "name": "Within-Column Randomization",
                "description": "Randomizes seating order within assigned columns",
                "applied": self.randomize_column,
                "satisfied": True,
            }
        )

        # 6. Batch Isolation status
        constraints.append(
            {
                "name": "Batch Isolation",
                "description": "No students of same batch in adjacent seats (horizontal/vertical)" if not self.allow_adjacent_same_batch else "Adjacent seating allowed for same batch",
                "applied": not self.allow_adjacent_same_batch,
                "satisfied": self._verify_no_adjacent_batches() if not self.allow_adjacent_same_batch else True,
            }
        )

        # 7. Unallocated seats constraint
        unallocated_count = sum(
            1
            for row in self.seating_plan
            for seat in row
            if not seat.is_broken and seat.roll_number is None
        )
        constraints.append(
            {
                "name": "Unallocated Seats Handling",
                "description": f"Marks {unallocated_count} seats as unallocated (light gray)",
                "applied": unallocated_count > 0,
                "satisfied": True,
            }
        )

        # 8. Roll Number Integrity
        numeric_fallback_detected = any(err for err in self.init_errors if "numeric fallback" in err or "missing roll" in err)
        constraints.append(
            {
                "name": "Roll Number Integrity",
                "description": "Ensures real enrollment strings are used without numeric fallback",
                "applied": bool(self.batch_roll_numbers),
                "satisfied": not numeric_fallback_detected,
            }
        )

        return {
            "constraints": constraints,
            "total_satisfied": sum(1 for c in constraints if c["satisfied"]),
            "total_applied": sum(1 for c in constraints if c["applied"]),
        }

    def _verify_broken_seats_respected(self) -> bool:
        """Verify all broken seats are properly marked"""
        for row, col in self.broken_seats:
            if not self.seating_plan[row][col].is_broken:
                return False
        return True

    def _verify_batch_counts_respected(self) -> bool:
        """Verify batch student counts are respected"""
        if not self.batch_student_counts:
            return True
        allocated: Dict[int, int] = {}
        for row in self.seating_plan:
            for seat in row:
                if seat.roll_number and not seat.is_broken:
                    allocated[seat.batch] = allocated.get(seat.batch, 0) + 1
        for b, limit in self.batch_student_counts.items():
            if allocated.get(b, 0) > limit:
                return False
        return True

    def _verify_blocks_correct(self) -> bool:
        """Verify block structure is correct"""
        if self.block_structure:
            # Variable blocks - verify sum equals cols
            return sum(self.block_structure) == self.cols and len(self.block_structure) == self.blocks
        else:
            # Uniform blocks
            calculated = math.ceil(self.cols / self.block_width)
            return calculated == self.blocks

    def _verify_paper_sets_alternate(self) -> bool:
        """Verify paper sets alternate for physically adjacent students of the same batch"""
        # 1. Vertical check (Same Label physical neighbors)
        for c in range(self.cols):
            for r in range(self.rows - 1):
                seat = self.seating_plan[r][c]
                down = self.seating_plan[r + 1][c]
                if (not seat.is_broken and not down.is_broken and 
                    seat.roll_number and down.roll_number):
                    label1 = self.batch_labels.get(seat.batch, str(seat.batch))
                    label2 = self.batch_labels.get(down.batch, str(down.batch))
                    if label1 == label2 and seat.paper_set == down.paper_set:
                        return False
        
        # 2. Horizontal check (Same Label physical neighbors)
        for r in range(self.rows):
            for c in range(self.cols - 1):
                seat = self.seating_plan[r][c]
                right = self.seating_plan[r][c + 1]
                if (not seat.is_broken and not right.is_broken and 
                    seat.roll_number and right.roll_number):
                    label1 = self.batch_labels.get(seat.batch, str(seat.batch))
                    label2 = self.batch_labels.get(right.batch, str(right.batch))
                    if label1 == label2 and seat.paper_set == right.paper_set:
                        return False
        return True

    def _verify_column_batch_assignment(self) -> bool:
        """Verify each column is assigned to single batch"""
        for col in range(self.cols):
            batches_in_col = set()
            for row in range(self.rows):
                seat = self.seating_plan[row][col]
                if not seat.is_broken and seat.roll_number:
                    batches_in_col.add(seat.batch)
            if len(batches_in_col) > 1:
                return False
        return True

    def _verify_no_adjacent_batches(self) -> bool:
        """Verify no adjacent seats in the same row/block have same batch"""
        for r in range(self.rows):
            for c in range(self.cols - 1):
                seat = self.seating_plan[r][c]
                right = self.seating_plan[r][c + 1]
                if (not seat.is_broken and seat.roll_number and 
                    not right.is_broken and right.roll_number):
                    # Relax across block boundaries
                    if seat.batch == right.batch and (c // self.block_width == (c + 1) // self.block_width):
                        return False
        return True

    # ------------------ web format ------------------ #

    def to_web_format(self) -> Dict:
        """Convert seating plan to web-friendly JSON format"""
        web_data = {
            "metadata": {
                "rows": self.rows,
                "cols": self.cols,
                "num_batches": self.num_batches,
                "blocks": self.blocks,
                "block_width": self.block_width,
                "block_structure": self.block_structure,  # Variable block widths
            },
            "seating": [],
            "summary": self._generate_summary(),
            "init_errors": self.init_errors,
            "constraints_status": self.get_constraints_status(),
        }

        for row_idx, row in enumerate(self.seating_plan):
            row_data = []
            for col_idx, seat in enumerate(row):
                # Human friendly batch label (branch name etc.)
                batch_label = self.batch_labels.get(seat.batch) if seat.batch else None

                # Handle broken seats
                if seat.is_broken:
                    seat_data = {
                        "position": f"{chr(65 + col_idx)}{row_idx + 1}",
                        "batch": None,
                        "batch_label": None,
                        "paper_set": None,
                        "block": None,
                        "roll_number": None,
                        "is_broken": True,
                        "display": "BROKEN",
                        "css_class": "seat-broken",
                        "color": "#FF0000",  # Red for broken
                    }
                else:
                    # Check if unallocated (no roll number assigned)
                    is_unallocated = seat.roll_number is None
                    set_val = seat.paper_set.value if seat.paper_set else ""
                    # This display string now effectively shows: enrollment + set
                    display_value = (
                        f"{seat.roll_number}{set_val}" if seat.roll_number else "UNALLOCATED"
                    )
                    css_class = (
                        f"batch-{seat.batch} set-{set_val}"
                        if seat.roll_number
                        else "seat-unallocated"
                    )
                    seat_data = {
                        "position": f"{chr(65 + col_idx)}{row_idx + 1}",
                        "batch": seat.batch,
                        # NEW: human readable branch/batch label
                        "batch_label": batch_label,
                        "paper_set": set_val or None,
                        "block": seat.block,
                        # This is now your enrollment number when batch_roll_numbers is used
                        "roll_number": seat.roll_number,
                        "student_name": seat.student_name,
                        "semester": seat.semester,
                        "is_broken": False,
                        "is_unallocated": is_unallocated,
                        "display": display_value,
                        "css_class": css_class,
                        "color": seat.color,
                    }
                row_data.append(seat_data)
            web_data["seating"].append(row_data)

        return web_data

    def _generate_summary(self) -> Dict:
        """Generate summary statistics including unallocated students"""
        batch_counts: Dict[int, int] = {}
        set_counts = {"A": 0, "B": 0}
        allocated_per_batch: Dict[int, int] = {}

        for row in self.seating_plan:
            for seat in row:
                if seat.is_broken or seat.roll_number is None:
                    continue
                batch_counts[seat.batch] = batch_counts.get(seat.batch, 0) + 1
                allocated_per_batch[seat.batch] = allocated_per_batch.get(seat.batch, 0) + 1
                if seat.paper_set:
                    set_counts[seat.paper_set.value] += 1

        # Calculate unallocated students per batch
        total_seats = self.rows * self.cols
        broken_seats_count = len(self.broken_seats)
        available_seats = total_seats - broken_seats_count

        # Calculate unallocated per batch
        unallocated_per_batch: Dict[int, int] = {}
        total_allocated = 0
        for b in range(1, self.num_batches + 1):
            allocated = allocated_per_batch.get(b, 0)
            total_allocated += allocated

            if self.batch_student_counts and b in self.batch_student_counts:
                # If batch_student_counts was provided, use those as expected limits
                expected = self.batch_student_counts[b]
            elif self.batch_roll_numbers and b in self.batch_roll_numbers:
                # Otherwise, if we know exact roll list, use its length
                expected = len(self.batch_roll_numbers[b])
            else:
                # Otherwise estimate based on column distribution
                base_per_batch = available_seats // self.num_batches
                rem_batches = available_seats % self.num_batches
                expected = base_per_batch + (1 if b - 1 < rem_batches else 0)

            unallocated = max(0, expected - allocated)
            unallocated_per_batch[b] = unallocated

        return {
            "batch_distribution": batch_counts,
            "paper_set_distribution": set_counts,
            "total_available_seats": available_seats,
            "total_allocated_students": total_allocated,
            "broken_seats_count": broken_seats_count,
            "unallocated_per_batch": unallocated_per_batch,
        }
