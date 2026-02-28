# Deployment Guide

Complete step-by-step guide for deploying the Exam Invigilation Reporting System.

## 📋 Prerequisites

- Google Account
- Python 3.9 or higher
- Modern web browser
- Text editor (VS Code recommended)
- Basic command line knowledge

---

## Part 1: Google Sheets Setup

### Step 1: Create Google Sheet

1. Go to [Google Sheets](https://sheets.google.com)
2. Create a new blank spreadsheet
3. Name it: **"Exam Invigilation Reports"**
4. Copy the **Spreadsheet ID** from URL:
   ```
   https://docs.google.com/spreadsheets/d/SPREADSHEET_ID_HERE/edit
   ```
5. Save this ID - you'll need it later

### Step 2: Create Google Drive Folder

1. Go to [Google Drive](https://drive.google.com)
2. Create a new folder: **"Exam Attendance Images"**
3. Copy the **Folder ID** from URL:
   ```
   https://drive.google.com/drive/folders/FOLDER_ID_HERE
   ```
4. Save this ID - you'll need it later

---

## Part 2: Google Apps Script Deployment

### Step 1: Open Apps Script

1. In your Google Sheet, go to **Extensions > Apps Script**
2. Delete any default code in `Code.gs`

### Step 2: Add the Code

1. Copy all content from `google-apps-script/Code.gs`
2. Paste it into the Apps Script editor

### Step 3: Configure Settings

Update the following in the script:

```javascript
const CONFIG = {
  SPREADSHEET_ID: 'YOUR_SPREADSHEET_ID_HERE',  // From Part 1, Step 1
  DRIVE_FOLDER_ID: 'YOUR_DRIVE_FOLDER_ID_HERE', // From Part 1, Step 2
  API_KEY: 'your-secret-api-key-here',          // Generate a strong key
  // ... rest stays the same
};
```

#### Generate API Key (Windows PowerShell):

```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
```

Or use any strong random string (min 32 characters).

### Step 4: Deploy as Web App

1. Click **Deploy > New deployment**
2. Click the gear icon ⚙️ > Select **Web app**
3. Configure:
   - **Description**: Exam Invigilation API
   - **Execute as**: Me (your email)
   - **Who has access**: Anyone
4. Click **Deploy**
5. **Authorize access**:
   - Click "Authorize access"
   - Choose your Google account
   - Click "Advanced" > "Go to [Project Name] (unsafe)"
   - Click "Allow"
6. Copy the **Web App URL**:
   ```
https://script.google.com/macros/s/AKfycbx6Q6wbQ0VvQXjBxIhvufDh-ohYs2gUcdU3x1PGDbG_vIFCW-jOPTJYOBESbHMGt0E/exec
   ```
7. Save this URL - you'll need it for backend configuration

### Step 5: Test the Script

1. In Apps Script editor, select function: `testSubmit`
2. Click **Run**
3. Check your Google Sheet - a test row should appear
4. Check your Google Drive folder - (may be empty if no image data)

---

## Part 3: Backend Setup (FastAPI)

### Step 1: Install Python Dependencies

Open terminal/PowerShell in the `backend` directory:

```powershell
# Create virtual environment (recommended)
python -m venv venv

# Activate virtual environment
.\venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt
```

### Step 2: Configure Environment Variables

1. Copy `.env.example` to `.env`:
   ```powershell
   Copy-Item .env.example .env
   ```

2. Edit `.env` file with your values:
   ```env
   DEBUG=True
   HOST=0.0.0.0
   PORT=8010

   # URL from Part 2, Step 4
   GOOGLE_APPS_SCRIPT_URL=https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec

   # Same API key as in Google Apps Script
   GOOGLE_APPS_SCRIPT_API_KEY=your-secret-api-key-here

   CORS_ORIGINS=["http://localhost:3000","http://127.0.0.1:3000","http://localhost:8010","http://127.0.0.1:8010"]
   ```

### Step 3: Run the Backend

```powershell
# Make sure virtual environment is activated
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8010
```

You should see:
```
INFO:     Uvicorn running on http://0.0.0.0:8010
INFO:     Application startup complete.
```

### Step 4: Test the Backend

Open browser and visit:
- http://localhost:8010 - Should show API info
- http://localhost:8010/health - Should show health status
- http://localhost:8010/docs - Interactive API documentation

---

## Part 4: Frontend Setup

### Step 1: Configure API Endpoint

Edit `frontend/app.js` line 11:

```javascript
const CONFIG = {
   API_BASE_URL: 'http://localhost:8010/api',  // Change this for production
    // ... rest stays the same
};
```

For production, change to your backend URL (e.g., `https://yourdomain.com/api`).

### Step 2: Serve Frontend

**Option A: Simple HTTP Server (Python)**

```powershell
# In the frontend directory
python -m http.server 3000
```

Visit: http://localhost:3000

**Option B: Live Server (VS Code)**

1. Install "Live Server" extension in VS Code
2. Right-click `index.html`
3. Select "Open with Live Server"

**Option C: Direct File Access**

Simply open `frontend/index.html` in your browser.

---

## Part 5: Testing the Complete System

### Test 1: Submit New Report

1. Open frontend in browser
2. Fill in all fields:
   - Exam Code: `TEST101`
   - Exam Date: Today's date
   - Session: `Morning`
   - Room Number: `A101`
   - Students Present: `25`
   - Main Sheets: `25`
   - Supplementary Sheets: `3`
   - Upload a test image
3. Click **Submit Report**
4. Verify:
   - Success message appears
   - New row appears in Google Sheet
   - Uploaded image(s) appear in Google Drive folder

### Test 2: Edit Existing Report

1. Click **Edit Existing Report**
2. Enter the same details as Test 1:
   - Exam Code: `TEST101`
   - Exam Date: Same date
   - Session: `Morning`
   - Room Number: `A101`
3. Click **Fetch Report**
4. Verify:
   - Form fills with existing data
   - Fields are locked (exam_code, exam_date, session, room_number)
5. Change `Students Present` to `30`
6. Click **Update Report**
7. Verify:
   - Success message appears
   - Row in Google Sheet is updated (not duplicated)
   - Same record_id

### Test 3: Duplicate Prevention

1. Reset the form
2. Enter the SAME details as Test 1 again
3. Submit
4. Verify:
   - **NO new row is created**
   - Existing row is updated
   - Only one row exists for TEST101-Morning-A101

---

## Part 6: Production Deployment

### Backend Deployment Options

#### Option A: Railway.app (Recommended)

1. Create account at [Railway.app](https://railway.app)
2. New Project > Deploy from GitHub
3. Add environment variables from `.env`
4. Configure:
   ```
   Build Command: pip install -r requirements.txt
   Start Command: python -m uvicorn main:app --host 0.0.0.0 --port $PORT
   ```
5. Deploy and copy the URL

#### Option B: Heroku

```powershell
# Install Heroku CLI
# Create Procfile
echo "web: python -m uvicorn main:app --host 0.0.0.0 --port $PORT" > Procfile

# Create runtime.txt
echo "python-3.9.18" > runtime.txt

# Deploy
heroku create your-app-name
git push heroku main
heroku config:set GOOGLE_APPS_SCRIPT_URL=your_url
heroku config:set GOOGLE_APPS_SCRIPT_API_KEY=your_key
```

#### Option C: DigitalOcean App Platform

1. Create account at DigitalOcean
2. Create new App
3. Connect GitHub repository
4. Configure environment variables
5. Deploy

### Frontend Deployment Options

#### Option A: Netlify (Recommended)

1. Create account at [Netlify](https://netlify.com)
2. Drag and drop `frontend` folder
3. Update `app.js` with production backend URL
4. Done! Get your URL

#### Option B: Vercel

1. Create account at [Vercel](https://vercel.com)
2. Import `frontend` folder
3. Update `app.js` with production backend URL
4. Deploy

#### Option C: GitHub Pages

1. Create GitHub repository
2. Upload `frontend` folder
3. Enable GitHub Pages in Settings
4. Update `app.js` with production backend URL

### Update CORS After Deployment

After deploying frontend, update backend `.env`:

```env
CORS_ORIGINS=https://your-frontend-url.netlify.app,http://localhost:3000
```

---

## Part 7: Security Hardening (Production)

### 1. Secure API Key

- Use a strong 32+ character random key
- Never commit `.env` to Git
- Rotate keys periodically

### 2. HTTPS Only

- Use HTTPS for all deployments
- Update CORS to only allow HTTPS origins

### 3. Rate Limiting

Add to `main.py`:

```python
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

@app.post("/api/submit-report")
@limiter.limit("10/minute")
async def submit_report(...):
    ...
```

### 4. Google Sheet Permissions

- Share sheet with specific people only
- Don't make sheet public
- Same for Drive folder

---

## Part 8: Troubleshooting

### Issue: "Unauthorized: Invalid API Key"

**Solution**:
- Verify API key matches in both `.env` and `Code.gs`
- Check for extra spaces or quotes
- Regenerate key if needed

### Issue: "CORS Error"

**Solution**:
- Add frontend URL to CORS_ORIGINS in `.env`
- Restart backend after changing `.env`
- Clear browser cache

### Issue: "Failed to upload image"

**Solution**:
- Check Drive folder permissions
- Verify DRIVE_FOLDER_ID in `Code.gs`
- Check image file size (max 10MB)

### Issue: "Record not found" when editing

**Solution**:
- Ensure exact match of all 4 fields
- Check case sensitivity
- Verify record exists in Google Sheet

### Issue: Backend not starting

**Solution**:
```powershell
# Check Python version
python --version  # Should be 3.9+

# Reinstall dependencies
pip install --upgrade -r requirements.txt

# Check for port conflicts
netstat -ano | findstr :8010
```

---

## Part 9: Maintenance

### Monitoring

1. **Check Google Sheet regularly** for data integrity
2. **Monitor Drive storage** usage
3. **Review backend logs** for errors
4. **Test API health endpoint** regularly

### Backup

1. **Google Sheet**: File > Make a copy (weekly)
2. **Drive Images**: Download folder (monthly)
3. **Code**: Keep in Git repository

### Updates

1. Pull latest code from repository
2. Review CHANGELOG
3. Test in development environment
4. Deploy to production
5. Verify all functionality

---

## 📞 Support Checklist

Before seeking help, verify:

- [ ] All IDs (Spreadsheet, Folder, Script) are correct
- [ ] API key matches in both backend and Apps Script
- [ ] Google Apps Script is deployed as Web App
- [ ] Google Apps Script has "Anyone" access
- [ ] Backend is running (check http://localhost:8010/health)
- [ ] CORS origins include your frontend URL
- [ ] Environment variables are loaded (restart backend)
- [ ] Google Sheet has correct structure
- [ ] Internet connection is stable
- [ ] Browser console shows no errors (F12)

---

## 🎉 Success!

Your Exam Invigilation Reporting System is now fully deployed and operational!

**Next Steps**:
- Train users on how to use the system
- Monitor the first few submissions
- Set up regular backups
- Consider adding more features (see README)

---

**Need Help?** Check the code comments or Google Apps Script/FastAPI documentation.
