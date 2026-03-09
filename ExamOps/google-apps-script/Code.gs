/**
 * Google Apps Script for Exam Invigilation Reporting System
 * Updated: March 9, 2026
 * Features: Time-slot based storage, Master sheet, Gmail authentication, Edit functionality
 *
 * SETUP INSTRUCTIONS:
 * 1. Create a new Google Sheets document
 * 2. Note the Spreadsheet ID from the URL
 * 3. Create a folder in Google Drive for image storage
 * 4. Note the Folder ID from the URL
 * 5. Replace SPREADSHEET_ID and DRIVE_FOLDER_ID below
 * 6. Set API_KEY to match your backend configuration
 * 7. Deploy as Web App with "Execute as: Me" and "Who has access: Anyone"
 * 8. Run initializeSheets() once to create the Master sheet + all time-slot sheets
 *    (Master will be the first/default tab — used by the published CSV export)
 */

// ========================================
// CONFIGURATION  
// ========================================

const CONFIG = {
  SPREADSHEET_ID: '1uaAaoKrCRm8quIhfL8aPCvsfxcfmJul6ie2lM8sAsT8',
  DRIVE_FOLDER_ID: '1ANgYJECOVApj9DrrNi5mgs9zoCYkJy1i',
  API_KEY: 'X9fT7qLm2ZpR4vYc8WjK1sHbN6uQeD3aGoVr5tUy', // Must match backend API key

  // Master sheet name — this is the DEFAULT tab and the one exported by the published CSV URL
  MASTER_SHEET: 'Master',

  // Sheet names for different time slots
  SHEETS: {
    '9AM-11AM': '9AM-11AM',
    '11AM-1PM': '11AM-1PM',
    '1PM-4PM': '1PM-4PM',
    '4PM-6PM': '4PM-6PM'
  },
  
  // Column headers
  HEADERS: [
    'Record ID',
    'User Email',
    'Date',
    'Time Slot',
    'Faculty Invigilator 1',
    'Faculty Invigilator 2',
    'Faculty Invigilator 3',
    'Blank Copies Received (DU)',
    'Copies Used (DU)',
    'Cancelled Copies',
    'Copies Returned',
    'Room Number',
    'Class 1',
    'Subject Code & Name (Class 1)',
    'Students Present (Class 1)',
    'Class 2',
    'Subject Code & Name (Class 2)',
    'Students Present (Class 2)',
    'Class 3',
    'Subject Code & Name (Class 3)',
    'Students Present (Class 3)',
    'Attendance Images',
    'Remarks',
    'Last Updated'
  ],
  
  // Column indices (0-based)
  COLUMNS: {
    RECORD_ID: 0,
    USER_EMAIL: 1,
    EXAM_DATE: 2,
    EXAM_TIME: 3,
    FACULTY_INVIGILATOR1: 4,
    FACULTY_INVIGILATOR2: 5,
    FACULTY_INVIGILATOR3: 6,
    BLANK_COPIES_RECEIVED: 7,
    COPIES_USED: 8,
    CANCELLED_COPIES: 9,
    COPIES_RETURNED: 10,
    ROOM_NUMBER: 11,
    CLASS1: 12,
    SUBJECT_CLASS1: 13,
    STUDENTS_CLASS1: 14,
    CLASS2: 15,
    SUBJECT_CLASS2: 16,
    STUDENTS_CLASS2: 17,
    CLASS3: 18,
    SUBJECT_CLASS3: 19,
    STUDENTS_CLASS3: 20,
    ATTENDANCE_IMAGES: 21,
    REMARKS: 22,
    LAST_UPDATED: 23
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
    Logger.log('Processing submit request');
    
    // Validate required fields
    const requiredFields = [
      'record_id', 'user_email', 'exam_date', 'exam_time',
      'faculty_invigilator1', 'faculty_invigilator2',
      'blank_copies_received', 'copies_used', 'cancelled_copies', 'copies_returned',
      'room_number', 'class1', 'subject_class1', 'students_class1'
    ];
    
    for (const field of requiredFields) {
      if (!data[field] && data[field] !== 0) {
        return createResponse({
          success: false,
          message: `Missing required field: ${field}`
        }, 400);
      }
    }
    
    // Get or create the appropriate sheet based on time slot
    const sheet = getOrCreateSheet(data.exam_time);
    
    if (!sheet) {
      return createResponse({
        success: false,
        message: `Invalid time slot: ${data.exam_time}`
      }, 400);
    }
    
    // Check if record already exists
    const existingRow = findRecordRow(sheet, data.record_id);
    
    // Upload images to Drive
    let imageUrls = '';
    if (data.image_payloads && Array.isArray(data.image_payloads)) {
      const urls = [];
      for (let i = 0; i < data.image_payloads.length; i++) {
        const payload = data.image_payloads[i];
        const url = uploadImageToDrive(
          payload.image_data,
          payload.image_filename,
          data.record_id
        );
        if (url) {
          urls.push(url);
        }
      }
      imageUrls = urls.join(', ');
    }
    
    // Prepare row data
    const rowData = [
      data.record_id || '',
      data.user_email || '',
      data.exam_date || '',
      data.exam_time || '',
      data.faculty_invigilator1 || '',
      data.faculty_invigilator2 || '',
      data.faculty_invigilator3 || '',
      data.blank_copies_received || 0,
      data.copies_used || 0,
      data.cancelled_copies || 0,
      data.copies_returned || 0,
      data.room_number || '',
      data.class1 || '',
      data.subject_class1 || '',
      data.students_class1 || 0,
      data.class2 || '',
      data.subject_class2 || '',
      data.students_class2 || 0,
      data.class3 || '',
      data.subject_class3 || '',
      data.students_class3 || 0,
      imageUrls,
      data.remarks || '',
      new Date().toISOString()
    ];
    
    // Add or update record
    if (existingRow > 0) {
      // Update existing record
      sheet.getRange(existingRow, 1, 1, rowData.length).setValues([rowData]);
      Logger.log('Updated existing record at row ' + existingRow);
    } else {
      // Add new record
      sheet.appendRow(rowData);
      Logger.log('Added new record to time-slot sheet: ' + sheet.getName());
    }

    // Mirror every submission to the Master sheet so the published CSV export shows all entries
    upsertMasterRow(rowData, data.record_id);

    return createResponse({
      success: true,
      message: existingRow > 0 ? 'Report updated successfully' : 'Report submitted successfully',
      data: { record_id: data.record_id }
    });

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
    Logger.log('Processing get request for record_id: ' + data.record_id);
    
    if (!data.record_id) {
      return createResponse({
        success: false,
        message: 'Missing record_id'
      }, 400);
    }
    
    // Search in all time-slot sheets
    const spreadsheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    
    for (const timeSlot of Object.keys(CONFIG.SHEETS)) {
      const sheetName = CONFIG.SHEETS[timeSlot];
      const sheet = spreadsheet.getSheetByName(sheetName);
      
      if (!sheet) continue;
      
      const row = findRecordRow(sheet, data.record_id);
      
      if (row > 0) {
        const values = sheet.getRange(row, 1, 1, CONFIG.HEADERS.length).getValues()[0];
        
        const recordData = {
          record_id: values[CONFIG.COLUMNS.RECORD_ID],
          user_email: values[CONFIG.COLUMNS.USER_EMAIL],
          exam_date: values[CONFIG.COLUMNS.EXAM_DATE],
          exam_time: values[CONFIG.COLUMNS.EXAM_TIME],
          faculty_invigilator1: values[CONFIG.COLUMNS.FACULTY_INVIGILATOR1],
          faculty_invigilator2: values[CONFIG.COLUMNS.FACULTY_INVIGILATOR2],
          faculty_invigilator3: values[CONFIG.COLUMNS.FACULTY_INVIGILATOR3],
          blank_copies_received: values[CONFIG.COLUMNS.BLANK_COPIES_RECEIVED],
          copies_used: values[CONFIG.COLUMNS.COPIES_USED],
          cancelled_copies: values[CONFIG.COLUMNS.CANCELLED_COPIES],
          copies_returned: values[CONFIG.COLUMNS.COPIES_RETURNED],
          room_number: values[CONFIG.COLUMNS.ROOM_NUMBER],
          class1: values[CONFIG.COLUMNS.CLASS1],
          subject_class1: values[CONFIG.COLUMNS.SUBJECT_CLASS1],
          students_class1: values[CONFIG.COLUMNS.STUDENTS_CLASS1],
          class2: values[CONFIG.COLUMNS.CLASS2],
          subject_class2: values[CONFIG.COLUMNS.SUBJECT_CLASS2],
          students_class2: values[CONFIG.COLUMNS.STUDENTS_CLASS2],
          class3: values[CONFIG.COLUMNS.CLASS3],
          subject_class3: values[CONFIG.COLUMNS.SUBJECT_CLASS3],
          students_class3: values[CONFIG.COLUMNS.STUDENTS_CLASS3],
          attendance_image_urls: values[CONFIG.COLUMNS.ATTENDANCE_IMAGES] ? 
            values[CONFIG.COLUMNS.ATTENDANCE_IMAGES].toString().split(', ') : [],
          remarks: values[CONFIG.COLUMNS.REMARKS],
          last_updated: values[CONFIG.COLUMNS.LAST_UPDATED]
        };
        
        return createResponse({
          success: true,
          message: 'Record found',
          data: recordData
        });
      }
    }
    
    // Record not found in any sheet
    return createResponse({
      success: false,
      message: 'Record not found'
    }, 404);
    
  } catch (error) {
    Logger.log('Error in handleGet: ' + error.toString());
    return createResponse({
      success: false,
      message: 'Failed to retrieve record: ' + error.toString()
    }, 500);
  }
}

/**
 * Handle update action
 */
function handleUpdate(data) {
  try {
    Logger.log('Processing update request for record_id: ' + data.record_id);
    
    if (!data.record_id) {
      return createResponse({
        success: false,
        message: 'Missing record_id'
      }, 400);
    }
    
    // Search in all time-slot sheets
    const spreadsheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    let found = false;
    let sourceSheet = null;
    let sourceRow = -1;
    
    for (const timeSlot of Object.keys(CONFIG.SHEETS)) {
      const sheetName = CONFIG.SHEETS[timeSlot];
      const sheet = spreadsheet.getSheetByName(sheetName);
      
      if (!sheet) continue;
      
      const row = findRecordRow(sheet, data.record_id);
      
      if (row > 0) {
        sourceSheet = sheet;
        sourceRow = row;
        found = true;
        break;
      }
    }
    
    if (found) {
      const targetSheet = getOrCreateSheet(data.exam_time);
      if (!targetSheet) {
        return createResponse({
          success: false,
          message: 'Invalid exam_time for update'
        }, 400);
      }

      // Upload new images if provided
      let imageUrls = data.existing_image_urls || '';
      if (data.image_payloads && Array.isArray(data.image_payloads) && data.image_payloads.length > 0) {
        const urls = [];
        for (let i = 0; i < data.image_payloads.length; i++) {
          const payload = data.image_payloads[i];
          const url = uploadImageToDrive(
            payload.image_data,
            payload.image_filename,
            data.record_id
          );
          if (url) {
            urls.push(url);
          }
        }
        imageUrls = urls.join(', ');
      }

      const rowData = [
        data.record_id,
        data.user_email || '',
        data.exam_date || '',
        data.exam_time || '',
        data.faculty_invigilator1 || '',
        data.faculty_invigilator2 || '',
        data.faculty_invigilator3 || '',
        data.blank_copies_received || 0,
        data.copies_used || 0,
        data.cancelled_copies || 0,
        data.copies_returned || 0,
        data.room_number || '',
        data.class1 || '',
        data.subject_class1 || '',
        data.students_class1 || 0,
        data.class2 || '',
        data.subject_class2 || '',
        data.students_class2 || 0,
        data.class3 || '',
        data.subject_class3 || '',
        data.students_class3 || 0,
        imageUrls,
        data.remarks || '',
        new Date().toISOString()
      ];

      // Upsert into target sheet
      const targetRow = findRecordRow(targetSheet, data.record_id);
      if (targetRow > 0) {
        targetSheet.getRange(targetRow, 1, 1, rowData.length).setValues([rowData]);
      } else {
        targetSheet.appendRow(rowData);
      }

      // Remove old row if moved across sheets
      if (sourceSheet && sourceSheet.getName() !== targetSheet.getName() && sourceRow > 0) {
        sourceSheet.deleteRow(sourceRow);
      } else if (sourceSheet && sourceSheet.getName() === targetSheet.getName() && sourceRow > 0 && sourceRow !== targetRow) {
        sourceSheet.deleteRow(sourceRow);
      }

      // Mirror update to Master sheet
      upsertMasterRow(rowData, data.record_id);

      Logger.log('Updated record and ensured correct slot sheet placement for record_id: ' + data.record_id);

      return createResponse({
        success: true,
        message: 'Report updated successfully',
        data: { record_id: data.record_id }
      });
    } else {
      return createResponse({
        success: false,
        message: 'Record not found'
      }, 404);
    }
    
  } catch (error) {
    Logger.log('Error in handleUpdate: ' + error.toString());
    return createResponse({
      success: false,
      message: 'Failed to update record: ' + error.toString()
    }, 500);
  }
}

// ========================================
// GOOGLE SHEETS HELPERS
// ========================================

/**
 * Upsert a row into the Master sheet.
 * The Master sheet is the default/first tab so that the published CSV
 * URL (without a gid= param) shows all submissions across all time slots.
 *
 * @param {Array} rowData  - Same rowData array used for the time-slot sheet
 * @param {string} recordId - The record ID for deduplication
 */
function upsertMasterRow(rowData, recordId) {
  try {
    const spreadsheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    let masterSheet = spreadsheet.getSheetByName(CONFIG.MASTER_SHEET);

    if (!masterSheet) {
      // Create Master sheet and move it to the front so it becomes the default tab
      masterSheet = spreadsheet.insertSheet(CONFIG.MASTER_SHEET, 0);
      const headerRange = masterSheet.getRange(1, 1, 1, CONFIG.HEADERS.length);
      headerRange.setValues([CONFIG.HEADERS]);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#1a73e8');
      headerRange.setFontColor('#ffffff');
      masterSheet.setFrozenRows(1);
      for (let i = 1; i <= CONFIG.HEADERS.length; i++) {
        masterSheet.autoResizeColumn(i);
      }
      Logger.log('Created Master sheet');
    }

    const existingRow = findRecordRow(masterSheet, recordId);
    if (existingRow > 0) {
      masterSheet.getRange(existingRow, 1, 1, rowData.length).setValues([rowData]);
    } else {
      masterSheet.appendRow(rowData);
    }

    Logger.log('Master sheet updated for record_id: ' + recordId);
  } catch (error) {
    // Log but do not fail the whole request if Master sheet write fails
    Logger.log('Warning: failed to update Master sheet: ' + error.toString());
  }
}

/**
 * Get or create sheet for a time slot
 */
function getOrCreateSheet(timeSlot) {
  const sheetName = CONFIG.SHEETS[timeSlot];
  
  if (!sheetName) {
    Logger.log('Invalid time slot: ' + timeSlot);
    return null;
  }
  
  const spreadsheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(sheetName);
  
  if (!sheet) {
    // Create new sheet
    sheet = spreadsheet.insertSheet(sheetName);
    
    // Set headers
    sheet.getRange(1, 1, 1, CONFIG.HEADERS.length).setValues([CONFIG.HEADERS]);
    
    // Format header row
    const headerRange = sheet.getRange(1, 1, 1, CONFIG.HEADERS.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#f97316');
    headerRange.setFontColor('#ffffff');
    
    // Freeze header row
    sheet.setFrozenRows(1);
    
    // Auto-resize columns
    for (let i = 1; i <= CONFIG.HEADERS.length; i++) {
      sheet.autoResizeColumn(i);
    }
    
    Logger.log('Created new sheet: ' + sheetName);
  }
  
  return sheet;
}

/**
 * Find row number for a given record ID in a sheet
 * Optimized to read only the record_id column for faster search
 */
function findRecordRow(sheet, recordId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1; // No data rows (only header or empty)
  
  // Read only first column (record IDs) - 10-20x faster than reading all columns
  const recordIds = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  
  for (let i = 0; i < recordIds.length; i++) {
    if (recordIds[i][0] === recordId) {
      return i + 2; // Return 1-based row number (row 2 = first data row)
    }
  }
  
  return -1; // Not found
}

// ========================================
// GOOGLE DRIVE HELPERS
// ========================================

/**
 * Upload image to Google Drive
 */
function uploadImageToDrive(base64Data, fileName, recordId) {
  try {
    const folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
    
    // Decode base64
    const blob = Utilities.newBlob(
      Utilities.base64Decode(base64Data),
      'image/jpeg',
      fileName || 'attendance_' + recordId + '_' + new Date().getTime() + '.jpg'
    );
    
    // Upload file
    const file = folder.createFile(blob);
    
    // Make file publicly accessible
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    // Return viewable URL
    return file.getUrl();
    
  } catch (error) {
    Logger.log('Error uploading image: ' + error.toString());
    return '';
  }
}

// ========================================
// RESPONSE HELPERS
// ========================================

/**
 * Create JSON response
 */
function createResponse(data, statusCode) {
  statusCode = statusCode || 200;
  
  const response = ContentService.createTextOutput(
    JSON.stringify(data)
  ).setMimeType(ContentService.MimeType.JSON);
  
  return response;
}

// ========================================
// UTILITY FUNCTIONS
// ========================================

/**
 * Initialize all sheets (run this once)
 */
function initializeSheets() {
  // Create Master sheet first (index 0) so it becomes the default tab
  // and is exported by the published CSV URL without a gid= parameter
  const spreadsheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let masterSheet = spreadsheet.getSheetByName(CONFIG.MASTER_SHEET);
  if (!masterSheet) {
    masterSheet = spreadsheet.insertSheet(CONFIG.MASTER_SHEET, 0);
    const headerRange = masterSheet.getRange(1, 1, 1, CONFIG.HEADERS.length);
    headerRange.setValues([CONFIG.HEADERS]);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#1a73e8');
    headerRange.setFontColor('#ffffff');
    masterSheet.setFrozenRows(1);
    for (let i = 1; i <= CONFIG.HEADERS.length; i++) {
      masterSheet.autoResizeColumn(i);
    }
    Logger.log('Created Master sheet at position 0');
  } else {
    // Ensure Master is at position 0 (first/default tab)
    spreadsheet.setActiveSheet(masterSheet);
    spreadsheet.moveActiveSheet(1);
    Logger.log('Master sheet already exists, moved to position 1');
  }

  const timeSlots = ['9AM-11AM', '11AM-1PM', '1PM-4PM', '4PM-6PM'];
  for (const timeSlot of timeSlots) {
    getOrCreateSheet(timeSlot);
    Logger.log('Initialized sheet for ' + timeSlot);
  }

  Logger.log('All sheets initialized successfully. Master sheet is the default CSV export tab.');
}

/**
 * Manual testing function
 */
function testSubmit() {
  const testData = {
    record_id: 'test123',
    user_email: 'test@example.com',
    exam_date: '2026-03-03',
    exam_time: '9AM-11AM',
    faculty_invigilator1: 'Dr. Smith',
    faculty_invigilator2: 'Dr. Jones',
    faculty_invigilator3: '',
    blank_copies_received: 100,
    copies_used: 85,
    cancelled_copies: 2,
    copies_returned: 13,
    room_number: '113A',
    class1: 'B.Sc. (H) Computer Science - Sem 3',
    subject_class1: 'CS301 - Data Structures',
    students_class1: 30,
    class2: '',
    subject_class2: '',
    students_class2: 0,
    class3: '',
    subject_class3: '',
    students_class3: 0,
    remarks: 'Test submission',
    image_payloads: [] // Add image data for full testing
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
 * Debug sheets in the spreadsheet
 */
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