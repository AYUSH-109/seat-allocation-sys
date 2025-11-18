# Classroom Seating Arrangement Algorithm - Complete Documentation

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Input Format & Types](#input-format--types)
4. [Algorithm Logic](#algorithm-logic)
5. [Output Format & Types](#output-format--types)
6. [API Endpoints](#api-endpoints)
7. [Data Models](#data-models)
8. [Examples](#examples)
9. [Integration Guide](#integration-guide)
10. [Constraint System](#constraint-system)

---

## Overview

The **Classroom Seating Arrangement Algorithm** is a sophisticated constraint-based seating system designed to allocate students from multiple batches to classroom seats while respecting various constraints like batch limits, broken seats, paper sets, and block structures.

### Key Features
- ✅ Dynamic number of batches (1-10 or more)
- ✅ Column-based batch assignment
- ✅ Configurable block widths
- ✅ Broken seat handling
- ✅ Per-batch student count limits
- ✅ Formatted roll numbers (customizable)
- ✅ Paper set alternation (A/B within blocks)
- ✅ Batch color coding
- ✅ Comprehensive constraint validation
- ✅ PDF export capability

---

## Architecture

### System Components

```
┌─────────────────────────────────────┐
│        Frontend (index.html)         │
│   Tailwind CSS + Vanilla JavaScript  │
└──────────┬──────────────────────────┘
           │ JSON POST Requests
           ▼
┌─────────────────────────────────────┐
│      Flask Backend (app.py)          │
│   REST API Endpoints                 │
└──────────┬──────────────────────────┘
           │ Instantiates & Calls
           ▼
┌─────────────────────────────────────┐
│  SeatingAlgorithm Core (algo.py)     │
│  - Generation Logic                  │
│  - Validation Logic                  │
│  - Constraint Checking               │
└─────────────────────────────────────┘
```

### Core Classes

#### 1. **PaperSet** (Enum)
```python
class PaperSet(Enum):
    A = "A"
    B = "B"
```
- Represents examination paper sets
- Alternates within blocks to avoid same paper adjacent

#### 2. **Seat** (Dataclass)
```python
@dataclass
class Seat:
    row: int                          # Row position (0-indexed)
    col: int                          # Column position (0-indexed)
    batch: Optional[int]              # Batch number (1 to num_batches)
    paper_set: Optional[PaperSet]     # A or B
    block: Optional[int]              # Block number
    roll_number: Optional[str]        # Assigned roll number or string
    is_broken: bool = False           # Is seat unavailable?
    color: str = "#FFFFFF"            # Hex color for display
```

#### 3. **SeatingAlgorithm** (Main Class)
Core engine that:
- Generates seating arrangements
- Validates constraints
- Returns web-formatted data
- Tracks constraint compliance

---

## Input Format & Types

### Frontend Input (User Form)

The frontend collects inputs as **HTML form fields** which are sent as **JSON** to the backend.

#### Basic Parameters

| Field | Type | Format | Example | Required | Notes |
|-------|------|--------|---------|----------|-------|
| **rows** | number | integer | 8 | ✓ | Total classroom rows |
| **cols** | number | integer | 10 | ✓ | Total classroom columns |
| **num_batches** | number | integer | 3 | ✓ | Number of batches (1-10+) |
| **block_width** | number | integer | 2 | ✓ | Columns per block |
| **broken_seats** | string | CSV "row-col" | "1-1,1-2,2-3" | ✗ | Unavailable seats (1-indexed) |

#### Advanced Parameters

| Field | Type | Format | Example | Required | Notes |
|-------|------|--------|---------|----------|-------|
| **batch_student_counts** | string | CSV "batch:count" | "1:10,2:8,3:7" | ✗ | Limit students per batch |
| **start_rolls** | string | CSV "batch:roll" | "1:BTCS24O1001,2:BTCD24O2001" | ✗ | Custom start roll per batch |
| **batch_prefixes** | string | CSV | "BTCS,BTCD,BTCE" | ✗ | Batch prefixes (if using template) |
| **year** | number | integer | 2024 | ✗ | Year for roll template |
| **roll_template** | string | template | "{prefix}{year}O{serial}" | ✗ | Roll number format |
| **serial_width** | number | integer | 4 | ✗ | Zero-pad width for serial |
| **batch_by_column** | boolean | true/false | true | ✓ | Batch-by-column assignment |
| **enforce_no_adjacent_batches** | boolean | true/false | false | ✗ | Prevent adjacent same batch |

### JSON Payload Format

```json
{
  "rows": 8,
  "cols": 10,
  "num_batches": 3,
  "block_width": 2,
  "batch_student_counts": "1:10,2:10,3:10",
  "broken_seats": "1-1,1-2",
  "start_rolls": "1:BTCS24O1001,2:BTCD24O2001,3:BTCE24O3001",
  "batch_prefixes": "BTCS,BTCD,BTCE",
  "year": 2024,
  "roll_template": "{prefix}{year}O{serial}",
  "serial_width": 4,
  "batch_by_column": true,
  "enforce_no_adjacent_batches": false
}
```

### Input Parsing (Backend)

The backend (`app.py`) parses inputs as follows:

```python
# Numeric inputs (direct conversion)
rows = int(data.get('rows', 10))
cols = int(data.get('cols', 15))
num_batches = int(data.get('num_batches', 3))
block_width = int(data.get('block_width', 3))

# Boolean inputs
batch_by_column = bool(data.get('batch_by_column', True))
enforce_no_adjacent_batches = bool(data.get('enforce_no_adjacent_batches', False))

# CSV Parsing: "1-1,1-2,2-3" → List[(row, col), ...]
broken_seats_str = data.get('broken_seats', '')
broken_seats = []
if broken_seats_str:
    parts = [p.strip() for p in broken_seats_str.split(',')]
    for part in parts:
        row_col = part.split('-')
        row = int(row_col[0].strip()) - 1  # Convert to 0-based
        col = int(row_col[1].strip()) - 1
        broken_seats.append((row, col))

# Dict Parsing: "1:35,2:30,3:25" → {1: 35, 2: 30, 3: 25}
batch_student_counts_str = data.get('batch_student_counts', '')
batch_student_counts = {}
if batch_student_counts_str:
    parts = [p.strip() for p in batch_student_counts_str.split(',')]
    for part in parts:
        k, v = part.split(':')
        batch_student_counts[int(k.strip())] = int(v.strip())
```

---

## Algorithm Logic

### Step-by-Step Execution Flow

#### **Phase 1: Initialization**

```
Input: rows, cols, num_batches, block_width, various constraints
│
├─ Calculate blocks = ceil(cols / block_width)
├─ Store all configuration parameters
├─ Parse batch templates from start_rolls
├─ Set up batch colors (default or custom)
└─ Create seating_plan matrix
```

#### **Phase 2: Batch Assignment to Columns**

The algorithm uses **column-major batch assignment**:

```
Total Columns = 10, Batches = 3
│
├─ Base columns per batch = 10 ÷ 3 = 3
├─ Remaining columns = 10 % 3 = 1
│
├─ Column Distribution:
│  ├─ Batch 1: Columns 0, 3, 6, 9 (4 cols)
│  ├─ Batch 2: Columns 1, 4, 7 (3 cols)
│  └─ Batch 3: Columns 2, 5, 8 (3 cols)
│
└─ Formula: batch[col % num_batches]
```

#### **Phase 3: Seat Allocation**

```
For each column (col = 0 to cols-1):
    batch_id = (col % num_batches) + 1
    
    For each row (row = 0 to rows-1):
        seat_position = (row, col)
        
        If (row, col) in broken_seats:
            Mark as BROKEN (red, no roll)
        
        Else if batch_allocated[batch_id] >= batch_limits[batch_id]:
            Mark as UNALLOCATED (light gray, no roll)
        
        Else:
            Assign roll number from batch_id
            Assign paper set (A/B alternating)
            Assign color (batch-specific)
            Increment batch_allocated[batch_id]
```

#### **Phase 4: Roll Number Generation**

Three modes supported:

**Mode 1: Simple Numeric**
```
Batch 1: 1001, 1002, 1003, ...
Batch 2: 1001, 1002, 1003, ...
Batch 3: 1001, 1002, 1003, ...
```

**Mode 2: Formatted with Template**
```
Template: "{prefix}{year}O{serial}"
Batch 1 (BTCS): BTCS2024O1001, BTCS2024O1002, ...
Batch 2 (BTCD): BTCD2024O2001, BTCD2024O2002, ...
Batch 3 (BTCE): BTCE2024O3001, BTCE2024O3002, ...
```

**Mode 3: Per-Batch Custom Strings**
```
Start Rolls: {1: "BTCS24O1135", 2: "BTCD24O2001", 3: "BTCE24O3001"}
Result: Parse and increment from these starting points
```

#### **Phase 5: Paper Set Assignment**

Within each **block**, paper sets alternate:

```
Block 0 (Cols 0-1):
  Row 0: Batch1-A, Batch2-B
  Row 1: Batch1-B, Batch2-A
  Row 2: Batch1-A, Batch2-B

Block 1 (Cols 2-3):
  Row 0: Batch3-A, Batch1-B
  Row 1: Batch3-B, Batch1-A
  Row 2: Batch3-A, Batch1-B
```

---

## Output Format & Types

### API Response Structure

The algorithm returns a **comprehensive JSON object** containing:

```json
{
  "metadata": {...},
  "seating": [...],
  "summary": {...},
  "validation": {...},
  "constraints_status": {...}
}
```

### Complete Response Example

```json
{
  "metadata": {
    "rows": 8,
    "cols": 10,
    "num_batches": 3,
    "blocks": 5,
    "block_width": 2
  },
  
  "seating": [
    [
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
      },
      ...
    ],
    ...
  ],
  
  "summary": {
    "batch_distribution": {
      "1": 10,
      "2": 10,
      "3": 10
    },
    "paper_set_distribution": {
      "A": 15,
      "B": 15
    },
    "total_available_seats": 78,
    "total_allocated_students": 30,
    "broken_seats_count": 2,
    "unallocated_per_batch": {
      "1": 0,
      "2": 0,
      "3": 0
    }
  },
  
  "validation": {
    "is_valid": true,
    "errors": []
  },
  
  "constraints_status": {
    "constraints": [
      {
        "name": "Broken Seats Handling",
        "description": "Marks 2 seats as unavailable",
        "applied": true,
        "satisfied": true
      },
      ...
    ],
    "total_satisfied": 7,
    "total_applied": 7
  }
}
```

### Output Field Definitions

#### **metadata**
| Field | Type | Description |
|-------|------|-------------|
| rows | int | Total rows in classroom |
| cols | int | Total columns in classroom |
| num_batches | int | Number of batches allocated |
| blocks | int | Number of seating blocks |
| block_width | int | Columns per block |

#### **seating[row][col]** (Seat Object)
| Field | Type | Description |
|-------|------|-------------|
| position | string | Display position (e.g., "A1", "B5") |
| batch | int or null | Batch number (1 to num_batches) |
| paper_set | string or null | "A" or "B" |
| block | int or null | Block number |
| roll_number | string or null | Student roll number |
| is_broken | bool | True if seat is unavailable |
| is_unallocated | bool | True if seat unallocated (room available but no student assigned) |
| display | string | Display format (e.g., "BTCS24O1001A") |
| css_class | string | CSS class for styling |
| color | string | Hex color code |

#### **summary**
| Field | Type | Description |
|-------|------|-------------|
| batch_distribution | dict | Students per batch {batch_id: count} |
| paper_set_distribution | dict | Papers per set {A: count, B: count} |
| total_available_seats | int | Total seats minus broken |
| total_allocated_students | int | Students actually assigned |
| broken_seats_count | int | Number of broken seats |
| unallocated_per_batch | dict | Unallocated per batch {batch_id: count} |

#### **validation**
| Field | Type | Description |
|-------|------|-------------|
| is_valid | bool | All constraints satisfied? |
| errors | list | List of validation error messages |

#### **constraints_status**
| Field | Type | Description |
|-------|------|-------------|
| constraints | list | Array of constraint objects |
| total_applied | int | Number of constraints applied |
| total_satisfied | int | Number of constraints satisfied |

### Color Coding System

```python
# Batch Colors (Customizable)
{
  1: "#DBEAFE",  # Light Blue
  2: "#DCFCE7",  # Light Green
  3: "#FEE2E2",  # Light Pink
  4: "#FEF3C7",  # Light Yellow
  5: "#E9D5FF"   # Light Purple
}

# Special Colors (Fixed)
BROKEN_SEAT = "#FF0000"      # Red
UNALLOCATED = "#F3F4F6"      # Light Gray
```

---

## API Endpoints

### 1. **GET `/`** - Main Page
Returns the HTML interface.

```
Request: GET /
Response: HTML page (Tailwind CSS + JavaScript)
Status: 200
```

### 2. **POST `/api/generate-seating`** - Generate Seating

Generates complete seating arrangement.

```
Request:
  POST /api/generate-seating
  Content-Type: application/json
  
  {
    "rows": 8,
    "cols": 10,
    "num_batches": 3,
    ...
  }

Response: 200
  {
    "metadata": {...},
    "seating": [...],
    "summary": {...},
    "validation": {...},
    "constraints_status": {...}
  }

Error: 400
  {"error": "Invalid rows/cols/num_batches"}

Error: 500
  {"error": "...exception message..."}
```

### 3. **POST `/api/constraints-status`** - Check Constraints Only

Returns constraint status without generating seating.

```
Request:
  POST /api/constraints-status
  Content-Type: application/json
  
  {
    "rows": 8,
    "cols": 10,
    "num_batches": 3,
    ...
  }

Response: 200
  {
    "constraints": [
      {
        "name": "Constraint Name",
        "description": "...",
        "applied": true/false,
        "satisfied": true/false
      },
      ...
    ],
    "total_applied": 6,
    "total_satisfied": 6
  }

Error: 500
  {"error": "...exception message..."}
```

---

## Data Models

### Class Hierarchy

```
PaperSet (Enum)
├── A
└── B

Seat (Dataclass)
├── row: int
├── col: int
├── batch: Optional[int]
├── paper_set: Optional[PaperSet]
├── block: Optional[int]
├── roll_number: Optional[str]
├── is_broken: bool
└── color: str

SeatingAlgorithm (Main)
├── Configuration
│   ├── rows, cols, num_batches
│   ├── block_width, blocks
│   ├── batch_by_column
│   └── enforce_no_adjacent_batches
│
├── Roll Formatting
│   ├── roll_template
│   ├── batch_prefixes
│   ├── year
│   ├── start_serial, start_serials
│   ├── start_rolls
│   ├── serial_width
│   ├── serial_mode
│   └── batch_templates
│
├── Constraints
│   ├── broken_seats (Set)
│   ├── batch_student_counts (Dict)
│   └── batch_colors (Dict)
│
└── Output
    ├── seating_plan (List[List[Seat]])
    ├── generate_seating()
    ├── validate_constraints()
    ├── get_constraints_status()
    ├── to_web_format()
    └── _generate_summary()
```

---

## Examples

### Example 1: Basic 3-Batch Setup

**Input:**
```json
{
  "rows": 5,
  "cols": 6,
  "num_batches": 3,
  "block_width": 2
}
```

**Allocation:**
```
Columns: 0, 1, 2, 3, 4, 5
Batches:  1, 2, 3, 1, 2, 3

Total seats: 30
Batch 1: 10 seats (cols 0, 3)
Batch 2: 10 seats (cols 1, 4)
Batch 3: 10 seats (cols 2, 5)
```

**Output:**
```json
{
  "summary": {
    "total_available_seats": 30,
    "total_allocated_students": 30,
    "batch_distribution": {"1": 10, "2": 10, "3": 10},
    "broken_seats_count": 0
  }
}
```

---

### Example 2: With Batch Limits

**Input:**
```json
{
  "rows": 5,
  "cols": 6,
  "num_batches": 3,
  "block_width": 2,
  "batch_student_counts": "1:10,2:8,3:7"
}
```

**Logic:**
```
Total seats: 30
Batch 1 limit: 10 ✓ (10/10 allocated)
Batch 2 limit: 8 ✓ (8/10 allocated, 2 unallocated)
Batch 3 limit: 7 ✓ (7/10 allocated, 3 unallocated)

Total allocated: 25
Total unallocated: 5
```

**Output:**
```json
{
  "summary": {
    "total_available_seats": 30,
    "total_allocated_students": 25,
    "batch_distribution": {"1": 10, "2": 8, "3": 7},
    "unallocated_per_batch": {"1": 0, "2": 2, "3": 3}
  }
}
```

---

### Example 3: With Broken Seats

**Input:**
```json
{
  "rows": 8,
  "cols": 10,
  "num_batches": 3,
  "block_width": 2,
  "broken_seats": "1-1,1-2"
}
```

**Processing:**
```
Total seats: 80
Broken seats: 2 (at row 0, cols 0 and 1)
Available seats: 78

Batch 1 gets 26 seats (10 cols × 8 rows / 3 - 2 broken)
Batch 2 gets 27 seats
Batch 3 gets 27 seats
```

**Output:**
```json
{
  "summary": {
    "total_available_seats": 78,
    "total_allocated_students": 80,
    "broken_seats_count": 2,
    "batch_distribution": {"1": 26, "2": 27, "3": 27}
  }
}
```

---

### Example 4: Formatted Roll Numbers

**Input:**
```json
{
  "rows": 5,
  "cols": 6,
  "num_batches": 3,
  "batch_prefixes": "BTCS,BTCD,BTCE",
  "year": 2024,
  "roll_template": "{prefix}{year}O{serial}",
  "serial_width": 4,
  "start_serials": "1:1001,2:2001,3:3001"
}
```

**Generated Roll Numbers:**
```
Batch 1 (BTCS): BTCS2024O1001, BTCS2024O1002, ...
Batch 2 (BTCD): BTCD2024O2001, BTCD2024O2002, ...
Batch 3 (BTCE): BTCE2024O3001, BTCE2024O3002, ...
```

**Output Seat:**
```json
{
  "position": "A1",
  "batch": 1,
  "roll_number": "BTCS2024O1001",
  "display": "BTCS2024O1001A",
  "color": "#DBEAFE"
}
```

---

## Integration Guide

### For Integrating with Existing Frontend

#### Step 1: Identify Your Frontend Stack
- React, Vue, Angular, or vanilla JavaScript?
- What's your current API structure?

#### Step 2: Set Up Backend (Flask)

```python
# requirements.txt
Flask==2.3.0
Flask-CORS==4.0.0
```

```bash
pip install -r requirements.txt
python app.py
# Server runs on http://localhost:5000
```

#### Step 3: Integrate with Your Frontend

**Making API Calls:**

```javascript
// Your Frontend Code
const generateSeating = async (params) => {
  const response = await fetch('http://localhost:5000/api/generate-seating', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      rows: params.rows,
      cols: params.cols,
      num_batches: params.numBatches,
      block_width: params.blockWidth,
      batch_student_counts: params.batchStudentCounts,
      broken_seats: params.brokenSeats,
      // ... other parameters
    })
  });
  
  const data = await response.json();
  return data;
};

// Usage in your component
const result = await generateSeating({
  rows: 8,
  cols: 10,
  numBatches: 3,
  blockWidth: 2,
  batchStudentCounts: "1:10,2:10,3:10",
  brokenSeats: "1-1,1-2"
});

// Access seating data
console.log(result.seating);           // 2D array of seats
console.log(result.summary);           // Summary statistics
console.log(result.validation);        // Validation results
console.log(result.constraints_status); // Constraint checks
```

#### Step 4: Render Seating Chart

**Example with React:**

```jsx
import React, { useState } from 'react';

function SeatingChart() {
  const [seatingData, setSeatingData] = useState(null);

  const handleGenerate = async () => {
    const response = await fetch('/api/generate-seating', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rows: 8,
        cols: 10,
        num_batches: 3,
        block_width: 2
      })
    });
    
    const data = await response.json();
    setSeatingData(data);
  };

  return (
    <div>
      <button onClick={handleGenerate}>Generate</button>
      
      {seatingData && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${seatingData.metadata.cols}, 80px)` }}>
          {seatingData.seating.flat().map((seat, idx) => (
            <div
              key={idx}
              style={{
                backgroundColor: seat.color,
                border: '1px solid #ccc',
                padding: '8px',
                textAlign: 'center',
                minHeight: '80px'
              }}
            >
              {seat.roll_number && <div>{seat.roll_number}</div>}
              {seat.is_broken && <div>BROKEN</div>}
              {seat.is_unallocated && <div>UNALLOCATED</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default SeatingChart;
```

#### Step 5: Handle Responses

```javascript
// Check if valid
if (data.validation.is_valid) {
  console.log("✓ All constraints satisfied!");
} else {
  console.log("✗ Errors:", data.validation.errors);
}

// Get summary
console.log(`Total Available: ${data.summary.total_available_seats}`);
console.log(`Total Allocated: ${data.summary.total_allocated_students}`);
console.log(`Batch Distribution:`, data.summary.batch_distribution);

// Check constraints
data.constraints_status.constraints.forEach(c => {
  console.log(`${c.name}: ${c.satisfied ? '✓' : '✗'}`);
});
```

---

## Constraint System

### 7 Built-in Constraints

#### 1. **Broken Seats Handling**
- **Description**: Marks seats as unavailable (broken/damaged)
- **Implementation**: Marks with `is_broken=True` and red color
- **Validation**: Verifies all broken seats are properly marked

#### 2. **Batch Student Counts**
- **Description**: Limits allocation per batch
- **Implementation**: Stops allocating to batch when limit reached
- **Validation**: Ensures no batch exceeds its limit

#### 3. **Block Width Enforcement**
- **Description**: Organizes seats into blocks of specified width
- **Implementation**: `block_id = col // block_width`
- **Validation**: Checks block count = ceil(cols / block_width)

#### 4. **Paper Set Alternation**
- **Description**: Ensures A/B papers alternate within blocks
- **Implementation**: Alternates based on (row + col) % 2
- **Validation**: Checks no adjacent seats have same paper

#### 5. **Batch-by-Column Assignment**
- **Description**: Each column assigned to single batch
- **Implementation**: `batch_id = (col % num_batches) + 1`
- **Validation**: Verifies each column has single batch

#### 6. **No Adjacent Same Batch**
- **Description**: Adjacent seats have different batches (optional)
- **Implementation**: Check all horizontal & vertical neighbors
- **Validation**: Enabled if `enforce_no_adjacent_batches=True`

#### 7. **Unallocated Seats Handling**
- **Description**: Marks unallocated seats (no student assigned)
- **Implementation**: `is_unallocated=True` with light gray color
- **Validation**: Always satisfied if handled correctly

### Constraint Validation Flow

```
Input Parameters
      ↓
Generate Seating
      ↓
Check Each Constraint:
  ├─ Broken seats marked correctly?
  ├─ Batch limits respected?
  ├─ Blocks correctly structured?
  ├─ Paper sets alternate?
  ├─ Columns have single batch?
  ├─ No adjacent same batch? (if enabled)
  └─ Unallocated seats marked?
      ↓
Return Validation Result:
  {
    "is_valid": boolean,
    "errors": [list of error messages],
    "constraints_status": {
      "constraints": [...],
      "total_satisfied": int,
      "total_applied": int
    }
  }
```

---

## Performance Considerations

### Time Complexity

| Operation | Complexity | Notes |
|-----------|-----------|-------|
| Generate Seating | O(rows × cols) | Linear scan |
| Validate Constraints | O(rows × cols) | Linear scan |
| Get Constraints Status | O(rows × cols) | All verification |
| Parse Inputs | O(num_batches) | Linear |

### Space Complexity

| Data Structure | Complexity | Notes |
|---|---|---|
| Seating Plan | O(rows × cols) | 2D array |
| Broken Seats | O(k) | k = number of broken seats |
| Batch Queues | O(total_students) | Per-batch roll numbers |

### Optimization Tips

1. **Cache seating results** if same parameters used repeatedly
2. **Lazy-load** validation only when needed
3. **Use constraints endpoint** for quick checks without generating full seating
4. **Batch process** multiple requests if possible

---

## Error Handling

### Common Error Codes

| Status | Error Message | Cause | Solution |
|--------|---------------|-------|----------|
| 400 | Invalid rows/cols/num_batches | Out of range | Validate inputs: rows, cols ≥ 1; num_batches ≥ 1 |
| 400 | Invalid block_width | Out of range | Ensure 1 ≤ block_width ≤ cols |
| 500 | Duplicate roll number None | Validation error | Check batch_student_counts and batch limits |
| 500 | Roll numbers count mismatch | Generation error | Verify batch allocation logic |
| 500 | Exception message | Parsing error | Check JSON format and field types |

### Error Response Format

```json
{
  "error": "Invalid rows/cols/num_batches"
}
```

---

## Future Enhancements

1. **Multiple Paper Sets**: Extend beyond A/B
2. **Custom Adjacency Rules**: More flexible batch arrangement
3. **Seat Preferences**: Allow preferred seat assignments
4. **Export Formats**: CSV, Excel, PDF generation
5. **Database Integration**: Store and retrieve saved arrangements
6. **Analytics**: Usage patterns, success rates
7. **Internationalization**: Multi-language support
8. **Mobile Support**: Responsive mobile app

---

## Quick Reference Cheat Sheet

### Format: "batch:count"
```
"1:10,2:8,3:7"
```

### Format: "row-col"
```
"1-1,1-2,2-3"
```

### Format: "batch:roll"
```
"1:BTCS24O1001,2:BTCD24O2001"
```

### Format: CSV prefixes
```
"BTCS,BTCD,BTCE"
```

### Template: Roll numbers
```
"{prefix}{year}O{serial}"
→ "BTCS2024O1001"
```

### Output Seat Example
```json
{
  "position": "A1",
  "batch": 1,
  "paper_set": "A",
  "block": 0,
  "roll_number": "BTCS24O1001",
  "is_broken": false,
  "is_unallocated": false,
  "color": "#DBEAFE"
}
```

---

## Contact & Support

For issues, questions, or feature requests:
- Check the error messages in validation output
- Review constraints_status for compliance details
- Verify input format matches specifications
- Run test cases to isolate issues

---

**Document Version**: 1.0  
**Last Updated**: November 19, 2025  
**Maintained By**: Classroom Seating Algorithm Team
