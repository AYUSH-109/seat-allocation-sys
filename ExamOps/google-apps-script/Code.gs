/**
 * Google Apps Script for Exam Invigilation Reporting System
 * Handles Google Sheets database and Google Drive file storage
 * 
 * SETUP INSTRUCTIONS:
 * 1. Create a new Google Sheets document
 * 2. Note the Spreadsheet ID from the URL
 * 3. Create a folder in Google Drive for image storage
 * 4. Note the Folder ID from the URL
 * 5. Replace SPREADSHEET_ID and DRIVE_FOLDER_ID below
 * 6. Set API_KEY to match your backend configuration
 * 7. Deploy as Web App with "Anyone" access
 */

// ========================================
// CONFIGURATION
// ========================================

const CONFIG = {
  SPREADSHEET_ID: '1uaAaoKrCRm8quIhfL8aPCvsfxcfmJul6ie2lM8sAsT8',
  DRIVE_FOLDER_ID: '1ANgYJECOVApj9DrrNi5mgs9zoCYkJy1i',
  API_KEY: 'X9fT7qLm2ZpR4vYc8WjK1sHbN6uQeD3aGoVr5tUy', // Must match backend API key
  SHEET_NAME: 'Records',
  
  // Column indices (0-based)
  COLUMNS: {
    RECORD_ID: 0,
    EXAM_CODE: 1,
    EXAM_DATE: 2,
    SESSION: 3,
    ROOM_NUMBER: 4,
    STUDENTS_PRESENT: 5,
    MAIN_SHEETS: 6,
    SUPPLEMENTARY_SHEETS: 7,
    ATTENDANCE_IMAGE_URL: 8,
    LAST_UPDATED: 9
  }
};

// ========================================
// MAIN ENTRY POINT
// ========================================

/**
 * Handle HTTP GET requests (doGet)
 */
function doGet(e) {
  return handleRequest(e);
}

/**
 * Handle HTTP POST requests (doPost)
 */
function doPost(e) {
  return handleRequest(e);
}

/**
 * Main request handler
 */
function handleRequest(e) {
  try {
    // Verify API Key
    const apiKey = e.parameter.apiKey || e.parameters.apiKey?.[0] || getHeaderValue(e, 'X-API-Key');
    
    if (apiKey !== CONFIG.API_KEY) {
      return createResponse({
        success: false,
        message: 'Unauthorized: Invalid API Key'
      }, 401);
    }
    
    // Get action parameter
    const action = e.parameter.action || e.parameters.action?.[0];
    
    // Parse request body for POST requests
    let requestData = {};
    if (e.postData && e.postData.contents) {
      try {
        requestData = JSON.parse(e.postData.contents);
      } catch (error) {
        Logger.log('Failed to parse JSON, using parameters');
        requestData = e.parameter;
      }
    } else {
      requestData = e.parameter;
    }
    
    // Route to appropriate handler
    switch (action) {
      case 'submit':
        return handleSubmit(requestData);
      case 'get':
        return handleGet(requestData);
      case 'update':
        return handleUpdate(requestData);
      default:
        return createResponse({
          success: false,
          message: 'Invalid action. Use: submit, get, or update'
        }, 400);
    }
    
  } catch (error) {
    Logger.log('Error in handleRequest: ' + error.toString());
    return createResponse({
      success: false,
      message: 'Internal server error: ' + error.toString()
    }, 500);
  }
}

/**
 * Get header value (Apps Script doesn't provide easy access to headers)
 */
function getHeaderValue(e, headerName) {
  // Try to get from parameters (FastAPI might send it as parameter)
  return e.parameter[headerName] || null;
}

// ========================================
// ACTION HANDLERS
// ========================================

/**
 * Handle submit action (insert or update)
 */
function handleSubmit(data) {
  try {
    const sheet = getOrCreateSheet();
    const recordId = data.record_id;
    
    // Check if record exists
    const existingRow = findRowByRecordId(sheet, recordId);
    
    // Upload image(s) to Drive
    let imageUrls = [];
    if (Array.isArray(data.image_payloads) && data.image_payloads.length > 0) {
      imageUrls = uploadImagesToDrive(data.image_payloads, recordId);
    } else if (data.image_data) {
      imageUrls = [
        uploadImageToDrive(
          data.image_data,
          data.image_filename || `attendance_${recordId}.jpg`,
          data.image_content_type || 'image/jpeg'
        )
      ];
    }
    
    const rowData = [
      recordId,
      data.exam_code,
      data.exam_date,
      data.session,
      data.room_number,
      parseInt(data.students_present),
      parseInt(data.main_sheets),
      parseInt(data.supplementary_sheets),
      buildStoredImageValue(imageUrls),
      new Date().toISOString()
    ];
    
    if (existingRow) {
      // Update existing row
      sheet.getRange(existingRow, 1, 1, rowData.length).setValues([rowData]);
      Logger.log('Updated existing record: ' + recordId);
      
      return createResponse({
        success: true,
        message: 'Report updated successfully',
        data: { record_id: recordId, row: existingRow }
      });
    } else {
      // Insert new row
      sheet.appendRow(rowData);
      Logger.log('Inserted new record: ' + recordId);
      
      return createResponse({
        success: true,
        message: 'Report submitted successfully',
        data: { record_id: recordId }
      });
    }
    
  } catch (error) {
    Logger.log('Error in handleSubmit: ' + error.toString());
    return createResponse({
      success: false,
      message: 'Failed to submit report: ' + error.toString()
    }, 500);
  }
}

/**
 * Handle get action (retrieve record)
 */
function handleGet(data) {
  try {
    const sheet = getOrCreateSheet();
    const recordId = data.record_id;
    
    const rowIndex = findRowByRecordId(sheet, recordId);
    
    if (!rowIndex) {
      return createResponse({
        success: false,
        message: 'Report not found'
      }, 404);
    }
    
    const rowData = sheet.getRange(rowIndex, 1, 1, 10).getValues()[0];
    
    const parsedImageUrls = parseStoredImageUrls(rowData[CONFIG.COLUMNS.ATTENDANCE_IMAGE_URL]);

    const reportData = {
      record_id: rowData[CONFIG.COLUMNS.RECORD_ID],
      exam_code: rowData[CONFIG.COLUMNS.EXAM_CODE],
      exam_date: rowData[CONFIG.COLUMNS.EXAM_DATE],
      session: rowData[CONFIG.COLUMNS.SESSION],
      room_number: rowData[CONFIG.COLUMNS.ROOM_NUMBER],
      students_present: rowData[CONFIG.COLUMNS.STUDENTS_PRESENT],
      main_sheets: rowData[CONFIG.COLUMNS.MAIN_SHEETS],
      supplementary_sheets: rowData[CONFIG.COLUMNS.SUPPLEMENTARY_SHEETS],
      attendance_image_url: parsedImageUrls.length ? parsedImageUrls[0] : '',
      attendance_image_urls: parsedImageUrls,
      last_updated: rowData[CONFIG.COLUMNS.LAST_UPDATED]
    };
    
    return createResponse({
      success: true,
      message: 'Report retrieved successfully',
      data: reportData
    });
    
  } catch (error) {
    Logger.log('Error in handleGet: ' + error.toString());
    return createResponse({
      success: false,
      message: 'Failed to retrieve report: ' + error.toString()
    }, 500);
  }
}

/**
 * Handle update action
 */
function handleUpdate(data) {
  try {
    const sheet = getOrCreateSheet();
    const recordId = data.record_id;
    
    const rowIndex = findRowByRecordId(sheet, recordId);
    
    if (!rowIndex) {
      return createResponse({
        success: false,
        message: 'Report not found'
      }, 404);
    }
    
    // Handle image update
    let imageUrls = [];
    if (Array.isArray(data.image_payloads) && data.image_payloads.length > 0) {
      imageUrls = uploadImagesToDrive(data.image_payloads, recordId);
    } else if (data.image_data) {
      imageUrls = [
        uploadImageToDrive(
          data.image_data,
          data.image_filename || `attendance_${recordId}.jpg`,
          data.image_content_type || 'image/jpeg'
        )
      ];
    } else {
      imageUrls = parseStoredImageUrls(data.existing_image_urls || data.existing_image_url || '');
    }
    
    const rowData = [
      recordId,
      data.exam_code,
      data.exam_date,
      data.session,
      data.room_number,
      parseInt(data.students_present),
      parseInt(data.main_sheets),
      parseInt(data.supplementary_sheets),
      buildStoredImageValue(imageUrls),
      new Date().toISOString()
    ];
    
    sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
    Logger.log('Updated record: ' + recordId);
    
    return createResponse({
      success: true,
      message: 'Report updated successfully',
      data: { record_id: recordId }
    });
    
  } catch (error) {
    Logger.log('Error in handleUpdate: ' + error.toString());
    return createResponse({
      success: false,
      message: 'Failed to update report: ' + error.toString()
    }, 500);
  }
}

// ========================================
// GOOGLE SHEETS HELPERS
// ========================================

/**
 * Get or create the reports sheet
 */
function getOrCreateSheet() {
  const spreadsheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(CONFIG.SHEET_NAME);
  
  if (!sheet) {
    sheet = spreadsheet.insertSheet(CONFIG.SHEET_NAME);
    
    // Create header row
    const headers = [
      'Record ID',
      'Exam Code',
      'Exam Date',
      'Session',
      'Room Number',
      'Students Present',
      'Main Sheets',
      'Supplementary Sheets',
      'Attendance Image URL',
      'Last Updated'
    ];
    
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    
    Logger.log('Created new sheet: ' + CONFIG.SHEET_NAME);
  }
  
  return sheet;
}

/**
 * Find row index by record_id
 */
function findRowByRecordId(sheet, recordId) {
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  
  for (let i = 1; i < values.length; i++) { // Start at 1 to skip header
    if (values[i][CONFIG.COLUMNS.RECORD_ID] === recordId) {
      return i + 1; // Return 1-based row index
    }
  }
  
  return null;
}

// ========================================
// GOOGLE DRIVE HELPERS
// ========================================

/**
 * Upload image to Google Drive
 */
function uploadImageToDrive(base64Data, fileName, contentType) {
  try {
    const folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
    
    // Decode base64
    const blob = Utilities.newBlob(
      Utilities.base64Decode(base64Data),
      contentType,
      fileName
    );
    
    // Check if file with same name exists (for updates)
    const existingFiles = folder.getFilesByName(fileName);
    if (existingFiles.hasNext()) {
      const existingFile = existingFiles.next();
      existingFile.setTrashed(true);
      Logger.log('Deleted old file: ' + fileName);
    }
    
    // Upload new file
    const file = folder.createFile(blob);
    
    // Make file accessible via link
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    const fileUrl = file.getUrl();
    Logger.log('Uploaded file to Drive: ' + fileUrl);
    
    return fileUrl;
    
  } catch (error) {
    Logger.log('Error uploading to Drive: ' + error.toString());
    throw new Error('Failed to upload image: ' + error.toString());
  }
}

// ========================================
// RESPONSE HELPERS
// ========================================

/**
 * Create JSON response
 */
function createResponse(data, statusCode = 200) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  
  // Note: Apps Script Web Apps don't support custom status codes
  // The statusCode parameter is here for documentation
  
  return output;
}

// ========================================
// UTILITY FUNCTIONS
// ========================================

/**
 * Manual testing function
 */
function testSubmit() {
  const testData = {
    record_id: 'test123',
    exam_code: 'CS101',
    exam_date: '2026-02-25',
    session: 'Morning',
    room_number: 'Room 101',
    students_present: 30,
    main_sheets: 30,
    supplementary_sheets: 5,
    image_data: '', // Add base64 image data for testing
    image_filename: 'test_attendance.jpg'
  };
  
  const result = handleSubmit(testData);
  Logger.log(result.getContent());
}

/**
 * Manual testing function for get
 */
function testGet() {
  const testData = {
    record_id: 'test123'
  };
  
  const result = handleGet(testData);
  Logger.log(result.getContent());
}

/**
 * Clear all data (for testing only - use with caution!)
 */
function clearAllData() {
  const sheet = getOrCreateSheet();
  const lastRow = sheet.getLastRow();
  
  if (lastRow > 1) {
    sheet.deleteRows(2, lastRow - 1);
    Logger.log('Cleared all data rows');
  }
}

function debugSheets() {
  try {
    const sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sheets = sheet.getSheets();
    
    Logger.log("=== SPREADSHEET DEBUG ===");
    Logger.log("Spreadsheet ID: " + CONFIG.SPREADSHEET_ID);
    Logger.log("Total sheets found: " + sheets.length);
    Logger.log("");
    Logger.log("Sheet names:");
    sheets.forEach((s, index) => {
      Logger.log((index + 1) + ". '" + s.getName() + "'");
    });
    
  } catch (error) {
    Logger.log("ERROR: " + error.toString());
  }
}

/**
 * Upload multiple images to Google Drive
 */
function uploadImagesToDrive(imagePayloads, recordId) {
  if (!Array.isArray(imagePayloads) || imagePayloads.length === 0) {
    return [];
  }

  const urls = [];
  for (let i = 0; i < imagePayloads.length; i++) {
    const imagePayload = imagePayloads[i];
    if (!imagePayload || !imagePayload.image_data) continue;

    const fallbackName = `attendance_${recordId}_${i + 1}.jpg`;
    const imageUrl = uploadImageToDrive(
      imagePayload.image_data,
      imagePayload.image_filename || fallbackName,
      imagePayload.image_content_type || 'image/jpeg'
    );
    urls.push(imageUrl);
  }

  return urls;
}

/**
 * Parse image URL cell value into an array
 */
function parseStoredImageUrls(rawValue) {
  if (!rawValue) return [];

  if (Array.isArray(rawValue)) {
    return rawValue.filter(Boolean);
  }

  if (typeof rawValue !== 'string') {
    return [String(rawValue)].filter(Boolean);
  }

  const trimmed = rawValue.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.filter(Boolean);
      }
    } catch (error) {
      Logger.log('Failed to parse attendance image URL JSON: ' + error.toString());
    }
  }

  return [trimmed];
}

/**
 * Convert array of image URLs to storable sheet value
 */
function buildStoredImageValue(imageUrls) {
  const normalized = (imageUrls || []).filter(Boolean);
  if (!normalized.length) return '';
  if (normalized.length === 1) return normalized[0];
  return JSON.stringify(normalized);
}