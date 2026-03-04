# Quick Start Guide

## 🚀 5-Minute Setup

### 1. Google Setup (2 minutes)

```
1. Create Google Sheet → Copy Spreadsheet ID
2. Create Drive Folder → Copy Folder ID  
3. Generate API Key (32+ random characters)
```

### 2. Apps Script (1 minute)

```
1. Extensions > Apps Script
2. Paste Code.gs content
3. Update: SPREADSHEET_ID, DRIVE_FOLDER_ID, API_KEY
4. Deploy > Web App > Anyone access
5. Copy deployment URL
```

### 3. Backend (1 minute)

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
# Edit .env with your URLs and keys
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8010
```

### 4. Frontend (30 seconds)

```powershell
cd frontend
# Update app.js API_BASE_URL with your backend URL if needed
python -m http.server 3000
```

### 5. Test (30 seconds)

```
1. Open http://localhost:3000
2. Fill form and submit
3. Check Google Sheet for new row
4. Check Drive for image
```

## ✅ Success Indicators

- ✅ Google Sheet has header row
- ✅ Backend shows "running" at http://localhost:8010
- ✅ Frontend loads without errors
- ✅ Form submission creates Sheet row
- ✅ Image appears in Drive

## 🔑 Critical Values to Configure

| Location | Variable | Where to Get |
|----------|----------|--------------|
| Code.gs | SPREADSHEET_ID | Google Sheet URL |
| Code.gs | DRIVE_FOLDER_ID | Drive Folder URL |
| Code.gs | API_KEY | Generate random |
| .env | GOOGLE_APPS_SCRIPT_URL | Apps Script deployment |
| .env | GOOGLE_APPS_SCRIPT_API_KEY | Same as Code.gs |
| app.js | API_BASE_URL | Backend URL |

## 🆘 Quick Fixes

**"Unauthorized"** → API keys don't match  
**"CORS Error"** → Add frontend URL to CORS_ORIGINS  
**"Not Found"** → Check Apps Script deployment URL  
**"Import Error"** → Run `pip install -r requirements.txt`

## 📱 Valid Test Data

```
Exam Code: CS101
Exam Date: 2026-02-25
Session: Morning
Room Number: A101
Students Present: 30
Main Sheets: 30
Supplementary Sheets: 5
Images: One or more JPG/PNG files
```

---

For detailed instructions, see [DEPLOYMENT.md](DEPLOYMENT.md)

```