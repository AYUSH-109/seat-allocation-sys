# Testing Guide

Complete guide for testing the Exam Invigilation Reporting System.

## 🧪 Test Categories

1. Unit Tests (Component Level)
2. Integration Tests (System Level)
3. User Acceptance Tests (UAT)
4. Performance Tests
5. Security Tests

---

## Part 1: Pre-Test Setup

### Checklist

- [ ] Google Sheet is accessible and empty (or test sheet)
- [ ] Google Drive folder is accessible
- [ ] Backend is running (`http://localhost:8010/health` returns 200)
- [ ] Frontend is accessible
- [ ] All configuration is correct
- [ ] Test images ready (various sizes and formats)

---

## Part 2: Unit Tests

### 2.1 Frontend Validation

#### Test Case: Empty Form Submission
```
Steps:
1. Load frontend
2. Click "Submit Report" without filling form
3. Expected: Validation errors appear for all required fields
```

#### Test Case: Invalid Exam Code
```
Steps:
1. Enter special characters in Exam Code (e.g., "CS@101!")
2. Tab out of field
3. Expected: Validation error message
```

#### Test Case: Future Date
```
Steps:
1. Try to select a future date
2. Expected: Date picker doesn't allow future dates
```

#### Test Case: Negative Numbers
```
Steps:
1. Enter -5 in "Students Present"
2. Expected: Validation error or field resets to 0
```

#### Test Case: Image File Type
```
Steps:
1. Try to upload a PDF file
2. Expected: Error message "Please select a valid image file"
```

### 2.2 Backend API Tests

Use the API docs at `http://localhost:8010/docs` or curl/PowerShell:

#### Test Case: Health Check
```powershell
Invoke-RestMethod -Uri "http://localhost:8010/health" -Method Get
```
Expected: `{"status": "healthy", "timestamp": "..."}`

#### Test Case: Submit Without Images
```powershell
$form = @{
    exam_code = "TEST101"
    exam_date = "2026-02-25"
    session = "Morning"
    room_number = "A101"
    students_present = 30
    main_sheets = 30
    supplementary_sheets = 5
}

Invoke-RestMethod -Uri "http://localhost:8010/api/submit-report" -Method Post -Form $form
```
Expected: 400 error (missing at least one image)

### 2.3 Google Apps Script Tests

In Apps Script Editor:

#### Test Case: Manual Submit
```javascript
function testSubmit() {
  const testData = {
    record_id: 'test123',
    exam_code: 'CS101',
    exam_date: '2026-02-25',
    session: 'Morning',
    room_number: 'A101',
    students_present: 30,
    main_sheets: 30,
    supplementary_sheets: 5
  };
  
  const result = handleSubmit(testData);
  Logger.log(result.getContent());
}
```
Run function and check logs.

---

## Part 3: Integration Tests

### 3.1 Complete Flow: New Submission

```
Test ID: INT-001
Priority: Critical
```

**Steps:**
1. Open frontend
2. Fill all fields with valid data:
   - Exam Code: `INT001`
   - Exam Date: Today
   - Session: `Morning`
   - Room Number: `TestRoom101`
   - Students: `25`
   - Main Sheets: `25`
   - Supplementary: `3`
   - Image: Upload test.jpg (2MB)
3. Click "Submit Report"

**Expected Results:**
- ✓ Success message appears
- ✓ Form resets
- ✓ Google Sheet has new row with data
- ✓ record_id is generated correctly
- ✓ Image appears in Drive folder
- ✓ Image URL is stored in Sheet
- ✓ last_updated timestamp is current

**Validation:**
```
Record ID format: 16-character hash
All data matches input
Image is viewable (click URL)
```

### 3.2 Complete Flow: Duplicate Prevention

```
Test ID: INT-002
Priority: Critical
```

**Steps:**
1. Submit a new report (use INT-001 data)
2. Note the row number in Sheet and record_id
3. Submit SAME data again (change only students_present)

**Expected Results:**
- ✓ Success message: "Report updated successfully"
- ✓ NO new row created
- ✓ Existing row is updated
- ✓ Same record_id
- ✓ Row count in Sheet didn't increase
- ✓ last_updated is newer

**Critical Check:**
```sql
Before: 1 row for INT001-Morning-TestRoom101
After: Still 1 row (updated, not duplicated)
```

### 3.3 Complete Flow: Edit Existing

```
Test ID: INT-003
Priority: Critical
```

**Steps:**
1. Submit report: CS101, Today, Morning, E201, 30, 30, 5
2. Click "Edit Existing Report"
3. Enter: CS101, Today, Morning, E201
4. Click "Fetch Report"
5. Verify form fills with data
6. Change students_present to 35
7. Click "Update Report"

**Expected Results:**
- ✓ Form auto-fills correctly
- ✓ Unique fields are readonly/disabled
- ✓ Image is optional (can skip)
- ✓ Success message appears
- ✓ Sheet row is updated
- ✓ No duplicate row
- ✓ Same record_id

### 3.4 Edge Case: Edit Non-Existent Record

```
Test ID: INT-004
Priority: High
```

**Steps:**
1. Click "Edit Existing Report"
2. Enter: NONEXIST, Today, Morning, FAKE123
3. Click "Fetch Report"

**Expected Results:**
- ✓ Error message: "No report found"
- ✓ Form doesn't populate
- ✓ No errors in console
- ✓ User can try again

### 3.5 Image Compression Test

```
Test ID: INT-005
Priority: Medium
```

**Steps:**
1. Prepare large image (5MB, 4000x3000px)
2. Submit form with this image
3. Wait for "Compressing image..." message

**Expected Results:**
- ✓ Compression message appears
- ✓ Upload succeeds
- ✓ Image in Drive is smaller (<2MB)
- ✓ Image dimensions reduced to max 1920px
- ✓ Image quality acceptable

**Measure:**
```
Original: 5MB, 4000x3000
Compressed: ~1MB, 1920x1440
Compression ratio: ~80%
```

### 3.6 Network Failure Test

```
Test ID: INT-006
Priority: High
```

**Steps:**
1. Start filling form
2. Stop backend server (Ctrl+C)
3. Try to submit form

**Expected Results:**
- ✓ Loading spinner appears
- ✓ After timeout, error message appears
- ✓ Error is user-friendly
- ✓ Form data is NOT lost
- ✓ User can restart backend and retry

### 3.7 Concurrent Submissions

```
Test ID: INT-007
Priority: Medium
```

**Steps:**
1. Open frontend in 2 browser tabs
2. Submit different reports simultaneously
3. Check Google Sheet

**Expected Results:**
- ✓ Both reports appear
- ✓ No data loss
- ✓ Unique record_ids
- ✓ No row conflicts
- ✓ Both images in Drive

---

## Part 4: User Acceptance Tests

### UAT-001: Invigilator Workflow

```
Persona: Exam Invigilator (non-technical)
Scenario: After exam, submit attendance
```

1. Open app on mobile phone
2. Fill in exam details from memory
3. Take photo of attendance sheet with phone camera
4. Submit report
5. Verify success

**Acceptance Criteria:**
- Can complete in < 2 minutes
- No technical issues
- Mobile UI is clear and usable
- Photo upload works from phone camera
- Success confirmation is clear

### UAT-002: Coordinator Workflow

```
Persona: Exam Coordinator (reviewing reports)
Scenario: Check if all rooms submitted reports
```

1. Open Google Sheet
2. Filter by exam_date
3. Verify all rooms present
4. Click image URLs to verify attendance sheets

**Acceptance Criteria:**
- Sheet data is accurate
- Easy to filter and sort
- All images are accessible
- Data export to Excel works

### UAT-003: Correction Workflow

```
Persona: Invigilator (made a mistake)
Scenario: Submitted wrong count, need to fix
```

1. Realize students_present was 31, not 30
2. Click "Edit Existing Report"
3. Enter exam details
4. Change count to 31
5. Submit update

**Acceptance Criteria:**
- Easy to find and edit
- Changes save correctly
- No duplicate created
- Can verify change in Sheet

---

## Part 5: Performance Tests

### PERF-001: Response Time

```
Test: Submit report response time
```

**Measure:**
- Form submission → Success message

**Targets:**
- < 3 seconds with 500KB image
- < 5 seconds with 2MB image
- < 10 seconds with 5MB image

### PERF-002: Concurrent Users

```
Test: Multiple simultaneous submissions
Setup: 10 users submit at same time
```

**Targets:**
- All submissions succeed
- No data loss or corruption
- Response time < 10 seconds per user

### PERF-003: Large Dataset

```
Test: Sheet with 1000+ rows
```

**Targets:**
- Search by record_id: < 2 seconds
- Submit new report: < 5 seconds
- Sheet remains responsive

---

## Part 6: Security Tests

### SEC-001: API Key Validation

```
Test: Invalid API key rejection
```

**Steps:**
1. Modify backend to use wrong API key
2. Try to submit report

**Expected:**
- Request fails with 401 Unauthorized
- No data written to Sheet

### SEC-002: XSS Prevention

```
Test: Script injection in form fields
```

**Steps:**
1. Enter `<script>alert('XSS')</script>` in exam_code
2. Submit form

**Expected:**
- Data is sanitized/escaped
- No script execution
- Data stored safely

### SEC-003: File Upload Validation

```
Test: Upload malicious file
```

**Steps:**
1. Rename virus.exe to virus.jpg
2. Try to upload

**Expected:**
- File type validation fails
- Upload rejected
- Error message shown

### SEC-004: SQL Injection (N/A)

Not applicable - using Google Sheets, not SQL database.

---

## Part 7: Browser Compatibility

Test on multiple browsers:

### Desktop
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Edge (latest)
- [ ] Safari (latest)

### Mobile
- [ ] Chrome Mobile (Android)
- [ ] Safari Mobile (iOS)
- [ ] Firefox Mobile

**Test Cases:**
- Form display
- Image upload
- Form submission
- Edit functionality
- Responsive design

---

## Part 8: Regression Testing

After any code changes, run this checklist:

### Critical Path
1. [ ] Submit new report
2. [ ] Submit duplicate → Verify update
3. [ ] Edit existing report
4. [ ] Image upload and compression
5. [ ] Form validation
6. [ ] Backend API health check
7. [ ] Google Sheet data integrity

### Quick Smoke Test (5 minutes)
```
1. Submit report → Success ✓
2. Check Sheet → Row present ✓
3. Check Drive → Image present ✓
4. Edit report → Update works ✓
5. Submit duplicate → No duplicate row ✓
```

---

## Part 9: Test Data

### Valid Test Records

```javascript
// Record 1
{
  exam_code: "CS101",
  exam_date: "2026-02-25",
  session: "Morning",
  room_number: "A101",
  students_present: 30,
  main_sheets: 30,
  supplementary_sheets: 5
}

// Record 2
{
  exam_code: "MATH201",
  exam_date: "2026-02-25",
  session: "Afternoon",
  room_number: "B202",
  students_present: 45,
  main_sheets: 45,
  supplementary_sheets: 10
}

// Record 3 (Same exam, different room)
{
  exam_code: "CS101",
  exam_date: "2026-02-25",
  session: "Morning",
  room_number: "A102",
  students_present: 28,
  main_sheets: 28,
  supplementary_sheets: 3
}
```

### Test Images

Prepare these test images:
- small.jpg (100KB, 800x600)
- medium.jpg (1MB, 1920x1080)
- large.jpg (5MB, 4000x3000)
- test.png (PNG format)
- test.webp (WebP format)

---

## Part 10: Bug Report Template

When you find a bug, document it:

```
Bug ID: BUG-001
Title: [Brief description]
Severity: Critical/High/Medium/Low
Priority: P1/P2/P3

Steps to Reproduce:
1. 
2. 
3. 

Expected Result:
[What should happen]

Actual Result:
[What actually happened]

Environment:
- Browser: 
- OS: 
- Backend version: 
- Frontend version: 

Screenshots:
[Attach if applicable]

Workaround:
[If any]
```

---

## ✅ Testing Checklist Summary

Before deployment, ensure:

- [ ] All critical integration tests pass
- [ ] UAT scenarios work smoothly
- [ ] Performance meets targets
- [ ] Security tests show no vulnerabilities
- [ ] Cross-browser compatibility verified
- [ ] Mobile responsiveness confirmed
- [ ] Error handling works properly
- [ ] Google Sheet data is accurate
- [ ] Google Drive images are accessible
- [ ] Backup and recovery tested

---

## 📊 Test Results Log

Keep a log of test runs:

```
Date: 2026-02-25
Tester: [Name]
Test Suite: Integration Tests
Results: 10/10 Passed
Issues Found: None
Notes: All tests passed successfully
```

---

**Happy Testing! 🧪**
