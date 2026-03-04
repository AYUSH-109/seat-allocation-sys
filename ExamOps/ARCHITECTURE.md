# System Architecture Overview

## 🏗️ Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE                           │
│  ┌────────────────────────────────────────────────────────┐     │
│  │  Frontend (HTML/CSS/JavaScript)                        │     │
│  │  - Mobile-first responsive design                      │     │
│  │  - Form validation                                     │     │
│  │  - Image compression                                   │     │
│  │  - Edit functionality                                  │     │
│  └─────────────────────┬──────────────────────────────────┘     │
└────────────────────────┼────────────────────────────────────────┘
                         │
                         │ HTTP/HTTPS
                         │ (FormData)
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     BACKEND API LAYER                            │
│  ┌────────────────────────────────────────────────────────┐     │
│  │  FastAPI (Python)                                      │     │
│  │  - Request validation                                  │     │
│  │  - Record ID generation (SHA256 hash)                 │     │
│  │  - Image handling                                      │     │
│  │  - Retry logic                                         │     │
│  │  - Error handling                                      │     │
│  └─────────────────────┬──────────────────────────────────┘     │
└────────────────────────┼────────────────────────────────────────┘
                         │
                         │ HTTP/HTTPS
                         │ (JSON + API Key)
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                  GOOGLE APPS SCRIPT LAYER                        │
│  ┌────────────────────────────────────────────────────────┐     │
│  │  Google Apps Script (Web App)                          │     │
│  │  - API key authentication                              │     │
│  │  - Duplicate detection                                 │     │
│  │  - Sheet operations (insert/update)                    │     │
│  │  - Drive file upload                                   │     │
│  └──────────┬─────────────────────────┬────────────────────┘     │
└─────────────┼─────────────────────────┼──────────────────────────┘
              │                         │
              │                         │
              ▼                         ▼
┌──────────────────────────┐  ┌──────────────────────────┐
│   GOOGLE SHEETS          │  │   GOOGLE DRIVE           │
│   (Database)             │  │   (File Storage)         │
│                          │  │                          │
│  - Report data           │  │  - Attendance images     │
│  - Metadata              │  │  - Shareable links       │
│  - Record tracking       │  │  - Auto-generated URLs   │
└──────────────────────────┘  └──────────────────────────┘
```

## 🔄 Data Flow

### 1. Submit New Report

```
┌─────────┐  1. Fill Form    ┌──────────┐
│  User   │ ───────────────> │ Frontend │
└─────────┘                  └────┬─────┘
                                  │ 2. Validate & Compress Image
                                  │
                             ┌────▼─────┐
                             │ Frontend │
                             └────┬─────┘
                                  │ 3. POST /submit-report
                                  │    (FormData)
                             ┌────▼─────┐
                             │ FastAPI  │
                             └────┬─────┘
                                  │ 4. Generate record_id
                                  │    hash(exam_code + date
                                  │         + session + room)
                             ┌────▼─────┐
                             │ FastAPI  │
                             └────┬─────┘
                                  │ 5. POST to Apps Script
                                  │    ?action=submit
                                  │    + API Key
                             ┌────▼────────┐
                             │ Apps Script │
                             └────┬────────┘
                                  │ 6. Search Sheet by record_id
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
             Found  │                           │ Not Found
                    ▼                           ▼
            ┌───────────────┐          ┌────────────────┐
            │ UPDATE row    │          │ INSERT new row │
            └───────┬───────┘          └────────┬───────┘
                    │                           │
                    └─────────┬─────────────────┘
                              │
                              │ 7. Upload image to Drive
                              │
                    ┌─────────▼─────────┐
                    │ Google Drive API  │
                    └─────────┬─────────┘
                              │ 8. Get image URL
                              │
                    ┌─────────▼─────────┐
                    │ Store URL in Sheet│
                    └─────────┬─────────┘
                              │ 9. Return success
                              │
                         Response flows back
                              to user
```

### 2. Edit Existing Report

```
User → "Edit" → Modal (fetch) → Apps Script → Sheet → Return data
                                    ↓
User ← Form Auto-Fill ←────────────────────────────────┘
  ↓
Modify data
  ↓
Submit → FastAPI → Apps Script → UPDATE Sheet row (same record_id)
                                     ↓
User ← Success ←───────────────────────┘
```

### 3. Duplicate Prevention Mechanism

```
Input:
  exam_code = "CS101"
  exam_date = "2026-02-25"
  session = "Morning"
  room_number = "A101"

                 ↓

Generate record_id:
  string = "cs101|2026-02-25|morning|a101"
  record_id = SHA256(string)[:16]
  result = "a1b2c3d4e5f6g7h8"

                 ↓

Search Google Sheet:
  FOR each row in Sheet:
    IF row[0] == "a1b2c3d4e5f6g7h8":
      RETURN row_index
      
                 ↓
           
  ┌────────┴────────┐
  │                 │
Found               Not Found
  │                 │
  ▼                 ▼
UPDATE            INSERT
row_index         new row
```

## 📦 Component Breakdown

### Frontend Components

```
frontend/
│
├── index.html
│   ├── Form Structure
│   ├── Modal (Edit)
│   ├── Alert Box
│   └── Loading Spinner
│
├── styles.css
│   ├── Mobile-first (< 640px)
│   ├── Tablet (640-1024px)
│   └── Desktop (> 1024px)
│
└── app.js
    ├── Form Validation
    ├── Image Compression
    ├── API Communication
    ├── Edit Functionality
    └── Error Handling
```

### Backend Components

```
backend/
│
├── main.py
│   ├── FastAPI App
│   ├── CORS Middleware
│   ├── Endpoints:
│   │   ├── POST /api/submit-report
│   │   ├── GET /api/get-report
│   │   ├── POST /api/update-report
│   │   └── GET /health
│   └── Error Handlers
│
├── config.py
│   ├── Settings Class
│   ├── Environment Variables
│   └── Configuration
│
└── utils.py
    ├── API Key Generator
    ├── Config Checker
    └── Connection Tester
```

### Google Apps Script Components

```
Code.gs
│
├── Request Handler (doGet/doPost)
│   ├── API Key Validation
│   ├── Action Routing
│   └── Error Handling
│
├── Action Handlers
│   ├── handleSubmit()
│   ├── handleGet()
│   └── handleUpdate()
│
├── Sheet Operations
│   ├── getOrCreateSheet()
│   ├── findRowByRecordId()
│   └── Data Validation
│
└── Drive Operations
    ├── uploadImageToDrive()
    ├── File Management
    └── Permission Setting
```

## 🔐 Security Flow

```
Frontend                Backend               Apps Script
   │                       │                       │
   │  FormData            │                       │
   ├──────────────────────>│                       │
   │                       │  HTTP Request         │
   │                       │  + X-API-Key header   │
   │                       ├──────────────────────>│
   │                       │                       │ Validate Key
   │                       │                       ├────┐
   │                       │                       │    │ Match?
   │                       │                       │<───┘
   │                       │                       │
   │                       │  ✓ Authorized         │
   │                       │  Process Request      │
   │                       │<──────────────────────┤
   │  ✓ Success           │                       │
   │<──────────────────────┤                       │
   │                       │                       │
```

## 📊 Database Schema (Google Sheets)

```
┌────────────┬────────────┬────────────┬─────────┬─────────────┐
│ record_id  │ exam_code  │ exam_date  │ session │ room_number │
├────────────┼────────────┼────────────┼─────────┼─────────────┤
│ STRING(16) │ STRING     │ DATE       │ STRING  │ STRING      │
│ PK, UNIQUE │            │            │         │             │
└────────────┴────────────┴────────────┴─────────┴─────────────┘

┌─────────────────┬─────────────┬──────────────────┬──────────────────────┬──────────────┐
│ students_present│ main_sheets │ supplementary_.. │ attendance_image_url │ last_updated │
├─────────────────┼─────────────┼──────────────────┼──────────────────────┼──────────────┤
│ NUMBER          │ NUMBER      │ NUMBER           │ STRING (URL)         │ DATETIME     │
│                 │             │                  │                      │              │
└─────────────────┴─────────────┴──────────────────┴──────────────────────┴──────────────┘

Indexes: record_id (Column A)
Constraints: Unique on record_id
```

## 🎯 Key Design Decisions

### 1. **Why Google Sheets as Database?**
   - No separate database setup required
   - Easy to view/export/analyze data
   - Built-in collaboration features
   - Free and scalable for moderate use
   - Familiar interface for non-technical users

### 2. **Why FastAPI as Middle Layer?**
   - Python ecosystem (easy to extend)
   - Type validation with Pydantic
   - Automatic API documentation
   - Async support for better performance
   - Easy deployment

### 3. **Why Google Apps Script?**
   - Direct access to Google APIs
   - No authentication complexity
   - Server-side execution
   - Free hosting
   - Tight integration with Sheets/Drive

### 4. **Why Client-Side Image Compression?**
   - Reduces upload bandwidth
   - Faster upload times
   - Lower storage costs
   - Better mobile experience
   - Instant user feedback

### 5. **Why SHA256 Hash for record_id?**
   - Deterministic (same input = same hash)
   - Collision-resistant
   - Fast computation
   - URL-safe
   - No need for auto-increment

## 🚀 Scalability Considerations

### Current Limits
- Google Sheets: ~5 million cells
- Google Drive: 15GB free storage
- Apps Script: 6 min execution time limit
- Concurrent requests: ~30/minute

### When to Scale Up

**Migrate to SQL Database when:**
- > 10,000 records
- Complex queries needed
- Multi-table relationships
- High concurrent writes

**Add CDN when:**
- Images > 1TB
- Global users
- High traffic

**Add Caching when:**
- Frequent reads
- Performance < 2 seconds
- Load > 100 requests/min

## 🔄 State Management

```
Frontend State:
  - isEditMode (boolean)
  - currentRecordId (string | null)
  - formData (object)

Backend State:
  - Stateless (each request independent)

Apps Script State:
  - Stateless (each call independent)

Persistent State:
  - Google Sheet (source of truth)
  - Google Drive (file storage)
```

## 📱 Mobile Optimization

```
Optimization Strategy:

1. Mobile-First CSS
   └─> Base styles for mobile
       └─> Media queries for larger screens

2. Touch-Friendly UI
   └─> Large buttons (44px min)
       └─> Adequate spacing

3. Image Handling
   └─> Camera access from phone
       └─> Client-side compression
           └─> Reduced upload size

4. Network Resilience
   └─> Retry mechanism
       └─> Offline detection
           └─> User feedback
```

## 🎨 UI/UX Flow

```
Landing Page
    │
    ├─> Fill Form
    │    │
    │    ├─> Validate (real-time)
    │    │
    │    ├─> Upload Image
    │    │    └─> Preview
    │    │
    │    └─> Submit
    │         │
    │         ├─> Loading Spinner
    │         │
    │         └─> Success/Error Alert
    │
    └─> Edit Mode
         │
         ├─> Open Modal
         │
         ├─> Enter Identifiers
         │
         ├─> Fetch Report
         │    └─> Loading
         │
         ├─> Auto-fill Form
         │    └─> Lock Unique Fields
         │
         ├─> Modify Data
         │
         └─> Update
              └─> Success/Error Alert
```

---

## 📚 Technology Stack Summary

| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | HTML5 | Structure |
| Frontend | CSS3 | Styling (Mobile-first) |
| Frontend | Vanilla JS | Logic & Interaction |
| Backend | Python 3.9+ | Application Language |
| Backend | FastAPI | Web Framework |
| Backend | Uvicorn | ASGI Server |
| Backend | Pydantic | Data Validation |
| Backend | httpx | HTTP Client |
| Integration | Google Apps Script | Google API Bridge |
| Database | Google Sheets | Data Storage |
| File Storage | Google Drive | Image Storage |
| Deployment | Railway/Heroku/etc | Backend Hosting |
| Deployment | Netlify/Vercel/etc | Frontend Hosting |

---

**System is production-ready and fully documented! 🚀**
