# System Architecture & Flow Documentation

## System Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                                │
│                     (Web Browser / Frontend)                         │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Tailwind CSS + Vanilla JavaScript / React / Vue / Angular  │  │
│  │  - HTML Form Inputs                                         │  │
│  │  - Seating Grid Display                                     │  │
│  │  - Summary Statistics                                       │  │
│  │  - Constraints Modal                                        │  │
│  │  - PDF Export                                               │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────┬───────────────────────────────┘
                                      │ JSON over HTTP
                                      │ (POST Requests)
                                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      API LAYER (Flask)                              │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  Route: GET /                                                  │ │
│  │  - Serves HTML interface                                      │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  Route: POST /api/generate-seating                            │ │
│  │  - Parse JSON inputs                                          │ │
│  │  - Validate input parameters                                 │ │
│  │  - Call SeatingAlgorithm                                     │ │
│  │  - Format response                                            │ │
│  │  - Return full seating + metadata                            │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  Route: POST /api/constraints-status                          │ │
│  │  - Parse JSON inputs                                          │ │
│  │  - Call SeatingAlgorithm.get_constraints_status()           │ │
│  │  - Return constraint results only                            │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────┬───────────────────────────────┘
                                      │ Python Objects
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    ALGORITHM LAYER (Python)                         │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  SeatingAlgorithm Class                                        │ │
│  │  ├─ __init__()           - Initialize with parameters        │ │
│  │  ├─ generate_seating()   - Create seating arrangement       │ │
│  │  ├─ validate_constraints() - Check all constraints           │ │
│  │  ├─ get_constraints_status() - Detailed constraint status   │ │
│  │  ├─ to_web_format()      - Convert to JSON                  │ │
│  │  └─ _generate_summary()  - Calculate statistics             │ │
│  │                                                               │ │
│  │  Helper Classes                                              │ │
│  │  ├─ Seat                 - Single seat data                 │ │
│  │  └─ PaperSet             - Paper set enum (A/B)            │ │
│  │                                                               │ │
│  │  Internal Methods                                            │ │
│  │  ├─ _calculate_batch()                                       │ │
│  │  ├─ _calculate_paper_set()                                  │ │
│  │  ├─ _verify_* methods (7 constraint checks)                 │ │
│  │  └─ [... 20+ supporting methods ...]                         │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Diagram

### Generation Flow

```
START
  │
  ├─ User fills form (rows, cols, batches, etc.)
  │
  ├─ Frontend validates inputs (client-side)
  │
  ├─ Send POST /api/generate-seating (JSON)
  │
  ├─ Backend receives JSON
  │  └─ Parse all fields
  │  └─ Convert formats (CSV → lists/dicts, 1-indexed → 0-indexed)
  │
  ├─ Create SeatingAlgorithm instance
  │  └─ Store all parameters
  │  └─ Validate ranges
  │
  ├─ Call generate_seating()
  │  │
  │  ├─ Calculate columns-per-batch distribution
  │  │
  │  ├─ For each column:
  │  │  └─ Assign to batch (col % num_batches)
  │  │
  │  ├─ For each row in column:
  │  │  │
  │  │  ├─ If seat is broken:
  │  │  │  └─ Mark BROKEN (red, is_broken=True)
  │  │  │
  │  │  ├─ Else if batch limit reached:
  │  │  │  └─ Mark UNALLOCATED (gray, roll_number=None)
  │  │  │
  │  │  ├─ Else:
  │  │  │  ├─ Generate/fetch roll number
  │  │  │  ├─ Calculate paper set (A/B)
  │  │  │  ├─ Assign batch color
  │  │  │  └─ Create Seat object
  │  │  │
  │  │  └─ Place seat in seating_plan[row][col]
  │  │
  │  └─ Return seating_plan (2D array)
  │
  ├─ Call validate_constraints()
  │  └─ Check all 7 constraint types
  │  └─ Return is_valid boolean + error list
  │
  ├─ Call get_constraints_status()
  │  └─ Return detailed constraint info
  │
  ├─ Call _generate_summary()
  │  ├─ Count allocated students
  │  ├─ Count unallocated per batch
  │  ├─ Calculate batch distribution
  │  └─ Return summary stats
  │
  ├─ Call to_web_format()
  │  ├─ Convert Seat objects to JSON
  │  ├─ Add metadata
  │  ├─ Add summary
  │  └─ Add validation & constraints
  │
  ├─ Return JSON response
  │
  ├─ Frontend receives response
  │  ├─ Parse JSON
  │  ├─ Extract seating data
  │  ├─ Render seating grid
  │  ├─ Display summary
  │  ├─ Show validation status
  │  └─ Highlight constraint status
  │
  └─ END (Display seating chart)
```

---

## Seating Generation Algorithm

### Column-Based Batch Assignment

```
Example: 10 columns, 3 batches

Step 1: Calculate distribution
  base_cols = 10 ÷ 3 = 3
  remainder = 10 % 3 = 1
  
  Batch 1: 3 + 1 = 4 columns
  Batch 2: 3 + 0 = 3 columns
  Batch 3: 3 + 0 = 3 columns

Step 2: Assign columns to batches
  Batch 1: Columns [0, 3, 6, 9]
  Batch 2: Columns [1, 4, 7]
  Batch 3: Columns [2, 5, 8]
  
  (Calculated as: col % 3 gives batch)
  Col 0: 0 % 3 = 0 → Batch 1
  Col 1: 1 % 3 = 1 → Batch 2
  Col 2: 2 % 3 = 2 → Batch 3
  Col 3: 3 % 3 = 0 → Batch 1
  ...

Step 3: Fill columns top-to-bottom
  For Batch 1 (columns 0, 3, 6, 9):
    Row 0: [Roll1, -, -, -]
    Row 1: [Roll2, -, -, -]
    Row 2: [Roll3, -, -, -]
    ...

Step 4: Apply constraints
  ├─ Skip broken seats
  ├─ Check batch limits
  ├─ Assign paper sets (A/B alternating)
  ├─ Apply colors
  └─ Mark unallocated
```

---

## Input Parsing Flow

```
Raw HTML Form Input
  │
  ├─ rows (number) → int
  │
  ├─ cols (number) → int
  │
  ├─ num_batches (number) → int
  │
  ├─ broken_seats (string)
  │  └─ "1-1,1-2,2-3"
  │     split(',') → ["1-1", "1-2", "2-3"]
  │     for each: split('-') → [row, col]
  │     convert to 0-indexed: row-1, col-1
  │     result: [(0,0), (0,1), (1,2)]
  │
  ├─ batch_student_counts (string)
  │  └─ "1:10,2:8,3:7"
  │     split(',') → ["1:10", "2:8", "3:7"]
  │     for each: split(':') → [batch, count]
  │     result: {1: 10, 2: 8, 3: 7}
  │
  ├─ start_rolls (string)
  │  └─ "1:BTCS24O1001,2:BTCD24O2001"
  │     split(',') → ["1:BTCS24O1001", "2:BTCD24O2001"]
  │     for each: split(':') → [batch, roll_string]
  │     result: {1: "BTCS24O1001", 2: "BTCD24O2001"}
  │
  └─ Other parameters → Parse similarly

Final: Python Dictionary with typed values
```

---

## Output Generation Flow

```
Seat Object (Python)
  {
    row: 0,
    col: 0,
    batch: 1,
    paper_set: PaperSet.A,
    block: 0,
    roll_number: "BTCS24O1001",
    is_broken: False,
    color: "#DBEAFE"
  }
  
  │
  ├─ to_web_format() converts to
  │
  └─ JSON Seat Object
     {
       "position": "A1",
       "batch": 1,
       "paper_set": "A",
       "block": 0,
       "roll_number": "BTCS24O1001",
       "is_broken": false,
       "is_unallocated": false,
       "display": "BTCS24O1001A",
       "css_class": "batch-1 set-A",
       "color": "#DBEAFE"
     }
     
     │
     └─ Rendered as HTML
        <div style="background-color: #DBEAFE; border: 1px solid #ccc;">
          BTCS24O1001<br/>A
        </div>
```

---

## Constraint Validation Flow

```
After seating generation, validate_constraints() runs:

┌─ Constraint 1: Broken Seats
│  └─ For each broken_seat in configuration:
│     └─ Check seating_plan[row][col].is_broken == True
│     └─ Error if False

├─ Constraint 2: Paper Set Alternation
│  └─ For each block:
│     └─ For each seat in block:
│        └─ Check (right neighbor.paper_set != seat.paper_set)
│        └─ Check (down neighbor.paper_set != seat.paper_set)
│        └─ Error if same adjacent

├─ Constraint 3: No Duplicate Roll Numbers
│  └─ Track all roll_number values
│  └─ Error if any duplicate (except None)

├─ Constraint 4: Batch Limits Respected
│  └─ Count allocated per batch
│  └─ Error if any batch exceeds limit

├─ Constraint 5: Column-Batch Mapping
│  └─ For each column:
│     └─ Verify only one batch in column
│     └─ Error if multiple

├─ Constraint 6: Block Structure
│  └─ Verify blocks = ceil(cols / block_width)
│  └─ Error if mismatch

└─ Constraint 7: Optional Adjacent Batch Constraint
   └─ If enforce_no_adjacent_batches:
      └─ For each seat:
         └─ Check neighbors don't have same batch
         └─ Error if any do

Final: Return (is_valid=all_pass, errors=[error_list])
```

---

## PDF Export Flow

```
Frontend triggers PDF download

├─ Get seating chart HTML
├─ Create new container for PDF
├─ Copy all seat elements to new container
│  └─ Apply print-friendly styling
│  └─ Resize seats for PDF
│  └─ Add metadata (title, date, etc.)
│
├─ Configure pdf options
│  {
│    filename: "seating_arrangement_[timestamp].pdf",
│    orientation: "landscape",
│    format: "a4",
│    margin: 10,
│    scale: 2
│  }
│
└─ html2pdf.js generates and downloads PDF
```

---

## Class Relationships

```
┌─────────────────────────────────┐
│      PaperSet (Enum)            │
├─────────────────────────────────┤
│ A = "A"                         │
│ B = "B"                         │
└─────────────────────────────────┘
          ▲
          │ uses
          │
┌─────────────────────────────────┐
│      Seat (Dataclass)           │
├─────────────────────────────────┤
│ row: int                        │
│ col: int                        │
│ batch: int                      │
│ paper_set: PaperSet             │
│ block: int                      │
│ roll_number: str                │
│ is_broken: bool                 │
│ color: str                      │
└─────────────────────────────────┘
          ▲
          │ contains (2D array)
          │
┌─────────────────────────────────┐
│  SeatingAlgorithm (Main)        │
├─────────────────────────────────┤
│ + Configuration params          │
│ + Constraint params             │
│ + generate_seating()            │
│ + validate_constraints()        │
│ + get_constraints_status()      │
│ + to_web_format()               │
│ + _generate_summary()           │
│ + [7 verification methods]      │
└─────────────────────────────────┘
```

---

## State Transitions

```
Seat States During Generation:

EMPTY (Initial)
  │
  ├─ Is (row,col) broken?
  │  YES → BROKEN (red, is_broken=True)
  │  │
  │  NO → Check batch limit
  │        │
  │        ├─ Batch limit reached?
  │        │  YES → UNALLOCATED (gray, roll_number=None)
  │        │  │
  │        │  NO → Roll available?
  │        │       │
  │        │       ├─ YES → ALLOCATED (colored, roll_number=assigned)
  │        │       │
  │        │       └─ NO → UNALLOCATED (gray, roll_number=None)
  │        │
  │        └─ Final state reached

FINAL STATES:
├─ BROKEN: Red (#FF0000), is_broken=True, roll_number=None
├─ UNALLOCATED: Gray (#F3F4F6), is_unallocated=True, roll_number=None
└─ ALLOCATED: Batch color, roll_number=assigned, paper_set=A/B
```

---

## Performance Characteristics

### Time Complexity

```python
# Generation
O(rows × cols)
  Loops: for col in cols → for row in rows
  Operations per iteration: O(1) (dictionary lookups, arithmetic)

# Validation
O(rows × cols)
  Paper set check: O(rows × cols)
  Roll duplicate check: O(rows × cols)
  Other checks: O(rows × cols)

# Total: O(rows × cols)
```

### Space Complexity

```python
# Seating plan
O(rows × cols)
  Each Seat object: ~200-300 bytes

# Auxiliary data
O(num_batches + num_broken_seats)
  batch_limits dict: O(num_batches)
  broken_seats set: O(num_broken_seats)
  batch_allocated dict: O(num_batches)

# Total: O(rows × cols + num_batches)
```

### Example Performance

```
8 × 10 grid (80 seats):        ~5ms
10 × 15 grid (150 seats):      ~8ms
20 × 30 grid (600 seats):      ~15ms
50 × 50 grid (2500 seats):     ~40ms
100 × 100 grid (10000 seats):  ~150ms
```

---

## Extension Points

### To Add New Constraints

1. Add verification method:
```python
def _verify_new_constraint(self) -> bool:
    # Implementation
    return True/False
```

2. Add to get_constraints_status():
```python
constraints.append({
    "name": "New Constraint",
    "description": "...",
    "applied": self.new_constraint_param is not None,
    "satisfied": self._verify_new_constraint()
})
```

3. Add parameter to __init__():
```python
def __init__(self, ..., new_constraint_param=None):
    self.new_constraint_param = new_constraint_param
```

### To Add New Output Fields

1. Add to Seat dataclass
2. Calculate in generate_seating()
3. Include in to_web_format()
4. Use in frontend

### To Add New Roll Formats

1. Add to roll_template parsing logic
2. Extend {placeholder} support
3. Update formatting in generate_seating()

---

## Testing Strategy

```
Unit Tests
├─ Seat creation
├─ Batch distribution calculation
├─ Roll number generation
├─ Constraint verification
└─ Summary calculation

Integration Tests
├─ Full generation workflow
├─ API endpoint responses
├─ Input parsing
└─ Output formatting

End-to-End Tests
├─ Frontend form submission
├─ Seating chart display
├─ PDF export
├─ Constraint modal
└─ Real user workflows
```

---

## Deployment Checklist

- [ ] Install Python 3.8+
- [ ] Install dependencies: Flask, Flask-CORS
- [ ] Set environment variables (if needed)
- [ ] Configure CORS for frontend domain
- [ ] Test all API endpoints
- [ ] Verify constraint validation
- [ ] Test with various grid sizes
- [ ] Check PDF export
- [ ] Performance test with large grids
- [ ] Set up logging
- [ ] Document API for team
- [ ] Create backup strategy

---

**Document Version**: 1.0  
**Last Updated**: November 19, 2025
