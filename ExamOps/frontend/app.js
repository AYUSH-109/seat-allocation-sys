/**
 * Exam Invigilation Reporting System - Frontend Logic
 * Mobile-first, Vanilla JavaScript implementation
 */

// ========================================
// CONFIGURATION
// ========================================
const CONFIG = {
    API_BASE_URL: 'http://localhost:8010/api',
    API_BASE_URLS: [
        'http://localhost:8010/api',
        'http://localhost:8000/api'
    ],
    MAX_IMAGE_SIZE_MB: 5,
    MAX_IMAGE_DIMENSION: 1920,
    IMAGE_QUALITY: 0.8,
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY_MS: 1000
};

function getApiBaseUrls() {
    const configured = Array.isArray(CONFIG.API_BASE_URLS) ? CONFIG.API_BASE_URLS : [];
    const urls = [CONFIG.API_BASE_URL, ...configured]
        .filter(Boolean)
        .map(url => url.trim());
    return [...new Set(urls)];
}

// ========================================
// STATE MANAGEMENT
// ========================================
let isEditMode = false;
let currentRecordId = null;

// ========================================
// DOM ELEMENTS
// ========================================
const elements = {
    form: document.getElementById('invigilationForm'),
    submitBtn: document.getElementById('submitBtn'),
    editBtn: document.getElementById('editBtn'),
    resetBtn: document.getElementById('resetBtn'),
    formTitle: document.getElementById('formTitle'),
    alertBox: document.getElementById('alertBox'),
    alertMessage: document.getElementById('alertMessage'),
    loadingSpinner: document.getElementById('loadingSpinner'),
    editModal: document.getElementById('editModal'),
    attendanceImage: document.getElementById('attendanceImage'),
    fileNameDisplay: document.getElementById('fileNameDisplay'),
    imagePreview: document.getElementById('imagePreview'),
    recordIdField: document.getElementById('recordId'),
    existingImageUrl: document.getElementById('existingImageUrl')
};

// ========================================
// INITIALIZATION
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    initializeEventListeners();
    setMaxDateToToday();
});

/**
 * Initialize all event listeners
 */
function initializeEventListeners() {
    // Form submission
    elements.form.addEventListener('submit', handleFormSubmit);
    
    // Edit button
    elements.editBtn.addEventListener('click', openEditModal);
    
    // File input change
    elements.attendanceImage.addEventListener('change', handleFileSelect);
    
    // Real-time validation
    const inputs = elements.form.querySelectorAll('input, select');
    inputs.forEach(input => {
        input.addEventListener('blur', () => validateField(input));
        input.addEventListener('input', () => clearFieldError(input.id));
    });
}

/**
 * Set maximum date to today for date input
 */
function setMaxDateToToday() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('examDate').setAttribute('max', today);
    document.getElementById('editExamDate').setAttribute('max', today);
}

// ========================================
// FORM VALIDATION
// ========================================

/**
 * Validate individual field
 */
function validateField(field) {
    const id = field.id;
    const value = field.value.trim();
    let isValid = true;
    let errorMessage = '';
    
    switch(id) {
        case 'examCode':
            if (!value) {
                errorMessage = 'Exam code is required';
                isValid = false;
            } else if (!/^[A-Za-z0-9\s\-]+$/.test(value)) {
                errorMessage = 'Invalid exam code format';
                isValid = false;
            }
            break;
            
        case 'examDate':
            if (!value) {
                errorMessage = 'Exam date is required';
                isValid = false;
            }
            break;
            
        case 'session':
            if (!value) {
                errorMessage = 'Session is required';
                isValid = false;
            }
            break;
            
        case 'roomNumber':
            if (!value) {
                errorMessage = 'Room number is required';
                isValid = false;
            }
            break;
            
        case 'studentsPresent':
        case 'mainSheets':
        case 'supplementarySheets':
            if (value === '' || value < 0) {
                errorMessage = 'Please enter a valid number (0 or greater)';
                isValid = false;
            }
            break;
            
        case 'attendanceImage':
            if (!isEditMode && !field.files.length) {
                errorMessage = 'Attendance sheet image is required';
                isValid = false;
            }
            break;
    }
    
    if (!isValid) {
        showFieldError(id, errorMessage);
    } else {
        clearFieldError(id);
    }
    
    return isValid;
}

/**
 * Validate entire form
 */
function validateForm() {
    let isValid = true;
    const requiredFields = [
        'examCode', 'examDate', 'session', 'roomNumber',
        'studentsPresent', 'mainSheets', 'supplementarySheets'
    ];
    
    requiredFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (!validateField(field)) {
            isValid = false;
        }
    });
    
    // Validate attendance image
    const imageField = elements.attendanceImage;
    if (!isEditMode && !imageField.files.length && !elements.existingImageUrl.value) {
        showFieldError('attendanceImage', 'Attendance sheet image is required');
        isValid = false;
    }
    
    return isValid;
}

/**
 * Show field error
 */
function showFieldError(fieldId, message) {
    const errorElement = document.getElementById(`${fieldId}Error`);
    if (errorElement) {
        errorElement.textContent = message;
    }
}

/**
 * Clear field error
 */
function clearFieldError(fieldId) {
    const errorElement = document.getElementById(`${fieldId}Error`);
    if (errorElement) {
        errorElement.textContent = '';
    }
}

// ========================================
// FILE HANDLING & IMAGE COMPRESSION
// ========================================

/**
 * Handle file selection
 */
async function handleFileSelect(event) {
    const files = Array.from(event.target.files || []);
    
    if (!files.length) {
        elements.fileNameDisplay.textContent = 'No file chosen';
        elements.imagePreview.classList.add('hidden');
        return;
    }

    for (const file of files) {
        // Validate file type
        if (!file.type.startsWith('image/')) {
            showAlert('Please select valid image files only', 'error');
            elements.attendanceImage.value = '';
            elements.fileNameDisplay.textContent = 'No file chosen';
            elements.imagePreview.classList.add('hidden');
            return;
        }

        // Validate file size (before compression)
        const fileSizeMB = file.size / (1024 * 1024);
        if (fileSizeMB > CONFIG.MAX_IMAGE_SIZE_MB * 2) {
            showAlert(`Image ${file.name} is too large (${fileSizeMB.toFixed(2)}MB). Maximum size is ${CONFIG.MAX_IMAGE_SIZE_MB * 2}MB`, 'error');
            elements.attendanceImage.value = '';
            elements.fileNameDisplay.textContent = 'No file chosen';
            elements.imagePreview.classList.add('hidden');
            return;
        }
    }

    elements.fileNameDisplay.textContent = files.length === 1
        ? files[0].name
        : `${files.length} files selected`;
    
    // Show preview
    try {
        const previewUrls = await Promise.all(
            files.slice(0, 3).map(file => new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = () => reject(new Error('Failed to preview image'));
                reader.readAsDataURL(file);
            }))
        );

        const remainingCount = files.length - previewUrls.length;
        const previewImages = previewUrls
            .map(url => `<img src="${url}" alt="Attendance Sheet Preview">`)
            .join('');
        const extraInfo = remainingCount > 0
            ? `<p style="margin-top: 8px; font-size: 0.875rem; color: var(--text-secondary);">+${remainingCount} more image(s)</p>`
            : '';

        elements.imagePreview.innerHTML = `${previewImages}${extraInfo}`;
        elements.imagePreview.classList.remove('hidden');
    } catch (error) {
        console.error('Error previewing image:', error);
    }
}

/**
 * Compress image before upload
 */
async function compressImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            const img = new Image();
            
            img.onload = () => {
                // Calculate new dimensions
                let width = img.width;
                let height = img.height;
                
                if (width > CONFIG.MAX_IMAGE_DIMENSION || height > CONFIG.MAX_IMAGE_DIMENSION) {
                    if (width > height) {
                        height = (height / width) * CONFIG.MAX_IMAGE_DIMENSION;
                        width = CONFIG.MAX_IMAGE_DIMENSION;
                    } else {
                        width = (width / height) * CONFIG.MAX_IMAGE_DIMENSION;
                        height = CONFIG.MAX_IMAGE_DIMENSION;
                    }
                }
                
                // Create canvas and compress
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                canvas.toBlob(
                    (blob) => {
                        resolve({
                            blob,
                            originalSize: file.size,
                            compressedSize: blob.size,
                            fileName: file.name
                        });
                    },
                    'image/jpeg',
                    CONFIG.IMAGE_QUALITY
                );
            };
            
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = e.target.result;
        };
        
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}

// ========================================
// FORM SUBMISSION
// ========================================

/**
 * Handle form submission
 */
async function handleFormSubmit(event) {
    event.preventDefault();
    
    // Validate form
    if (!validateForm()) {
        showAlert('Please correct the errors in the form', 'error');
        return;
    }
    
    // Disable submit button
    elements.submitBtn.disabled = true;
    elements.submitBtn.textContent = 'Submitting...';
    
    try {
        showLoading(true);
        
        // Prepare form data
        const formData = new FormData();
        
        // Add text fields
        formData.append('exam_code', document.getElementById('examCode').value.trim());
        formData.append('exam_date', document.getElementById('examDate').value);
        formData.append('session', document.getElementById('session').value);
        formData.append('room_number', document.getElementById('roomNumber').value.trim());
        formData.append('students_present', parseInt(document.getElementById('studentsPresent').value));
        formData.append('main_sheets', parseInt(document.getElementById('mainSheets').value));
        formData.append('supplementary_sheets', parseInt(document.getElementById('supplementarySheets').value));
        
        // Handle image(s)
        if (elements.attendanceImage.files.length > 0) {
            const imageFiles = Array.from(elements.attendanceImage.files);

            showAlert(
                imageFiles.length === 1
                    ? 'Compressing image...'
                    : `Compressing ${imageFiles.length} images...`,
                'warning'
            );

            for (const imageFile of imageFiles) {
                const compressed = await compressImage(imageFile);
                formData.append('attendance_image', compressed.blob, compressed.fileName);

                console.log(`Image compressed (${imageFile.name}): ${(compressed.originalSize / 1024).toFixed(2)}KB → ${(compressed.compressedSize / 1024).toFixed(2)}KB`);
            }
        } else if (isEditMode && elements.existingImageUrl.value) {
            formData.append('existing_image_url', elements.existingImageUrl.value);
        }
        
        // Add record_id if in edit mode
        if (isEditMode && currentRecordId) {
            formData.append('record_id', currentRecordId);
        }
        
        // Submit to backend
        const response = await submitWithRetry(formData, isEditMode);
        
        if (response.success) {
            showAlert(
                isEditMode 
                    ? 'Report updated successfully!' 
                    : 'Report submitted successfully!',
                'success'
            );
            resetForm();
        } else {
            throw new Error(response.message || 'Submission failed');
        }
        
    } catch (error) {
        console.error('Submission error:', error);
        showAlert(error.message || 'Failed to submit report. Please try again.', 'error');
    } finally {
        showLoading(false);
        elements.submitBtn.disabled = false;
        elements.submitBtn.textContent = 'Submit Report';
    }
}

/**
 * Submit form with retry logic
 */
async function submitWithRetry(formData, isUpdate = false) {
    const endpoint = isUpdate ? '/update-report' : '/submit-report';
    const baseUrls = getApiBaseUrls();
    let lastError = null;
    
    for (let attempt = 1; attempt <= CONFIG.RETRY_ATTEMPTS; attempt++) {
        for (const baseUrl of baseUrls) {
            try {
                const response = await fetch(`${baseUrl}${endpoint}`, {
                    method: 'POST',
                    body: formData
                });
                
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.detail || `HTTP ${response.status}`);
                }
                
                return await response.json();
                
            } catch (error) {
                lastError = error;
                console.error(`Attempt ${attempt} failed on ${baseUrl}:`, error);
            }
        }

        if (attempt < CONFIG.RETRY_ATTEMPTS) {
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY_MS * attempt));
        }
    }

    throw lastError || new Error(`Request failed on all API endpoints: ${baseUrls.join(', ')}`);
}

// ========================================
// EDIT FUNCTIONALITY
// ========================================

/**
 * Open edit modal
 */
function openEditModal() {
    elements.editModal.classList.remove('hidden');
}

/**
 * Close edit modal
 */
function closeEditModal() {
    elements.editModal.classList.add('hidden');
    // Clear modal fields
    document.getElementById('editExamCode').value = '';
    document.getElementById('editExamDate').value = '';
    document.getElementById('editSession').value = '';
    document.getElementById('editRoomNumber').value = '';
}

/**
 * Fetch report for editing
 */
async function fetchReportForEdit() {
    const examCode = document.getElementById('editExamCode').value.trim();
    const examDate = document.getElementById('editExamDate').value;
    const session = document.getElementById('editSession').value;
    const roomNumber = document.getElementById('editRoomNumber').value.trim();
    
    if (!examCode || !examDate || !session || !roomNumber) {
        showAlert('Please fill in all fields to fetch the report', 'error');
        return;
    }
    
    try {
        showLoading(true);
        
        const params = new URLSearchParams({
            exam_code: examCode,
            exam_date: examDate,
            session: session,
            room_number: roomNumber
        });
        
        const baseUrls = getApiBaseUrls();
        let response = null;
        let lastError = null;

        for (const baseUrl of baseUrls) {
            try {
                response = await fetch(`${baseUrl}/get-report?${params}`);
                if (response.ok || response.status === 404) {
                    break;
                }
                throw new Error(`HTTP ${response.status}`);
            } catch (error) {
                lastError = error;
                response = null;
            }
        }

        if (!response) {
            throw lastError || new Error('Failed to connect to backend');
        }

        if (!response.ok) {
            if (response.status === 404) {
                throw new Error('No report found with the provided details');
            }
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success && data.data) {
            populateFormForEdit(data.data);
            closeEditModal();
            showAlert('Report loaded successfully. You can now edit it.', 'success');
        } else {
            throw new Error(data.message || 'Failed to fetch report');
        }
        
    } catch (error) {
        console.error('Fetch error:', error);
        showAlert(error.message || 'Failed to fetch report', 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * Populate form with existing data
 */
function populateFormForEdit(data) {
    isEditMode = true;
    currentRecordId = data.record_id;
    
    elements.formTitle.textContent = 'Edit Existing Report';
    elements.submitBtn.textContent = 'Update Report';
    
    document.getElementById('examCode').value = data.exam_code;
    document.getElementById('examDate').value = data.exam_date;
    document.getElementById('session').value = data.session;
    document.getElementById('roomNumber').value = data.room_number;
    document.getElementById('studentsPresent').value = data.students_present;
    document.getElementById('mainSheets').value = data.main_sheets;
    document.getElementById('supplementarySheets').value = data.supplementary_sheets;
    
    elements.recordIdField.value = data.record_id;
    elements.existingImageUrl.value = data.attendance_image_url || '';
    
    // Make unique fields readonly
    document.getElementById('examCode').readOnly = true;
    document.getElementById('examDate').readOnly = true;
    document.getElementById('session').disabled = true;
    document.getElementById('roomNumber').readOnly = true;
    
    // Image is optional in edit mode
    elements.attendanceImage.removeAttribute('required');
    
    // Show existing image if available
    const imageUrls = Array.isArray(data.attendance_image_urls) && data.attendance_image_urls.length
        ? data.attendance_image_urls
        : (data.attendance_image_url ? [data.attendance_image_url] : []);

    if (imageUrls.length) {
        const imageLinks = imageUrls
            .map((url, index) => `<li><a href="${url}" target="_blank">View Attendance Sheet ${index + 1}</a></li>`)
            .join('');

        elements.imagePreview.innerHTML = `
            <p><strong>Current Image(s):</strong></p>
            <ul style="padding-left: 20px; margin: 6px 0;">${imageLinks}</ul>
            <p style="margin-top: 8px; font-size: 0.875rem; color: var(--text-secondary);">
                Upload new image(s) to replace existing ones (optional)
            </p>
        `;
        elements.imagePreview.classList.remove('hidden');
    }
    
    // Scroll to form
    elements.form.scrollIntoView({ behavior: 'smooth' });
}

// ========================================
// RESET FORM
// ========================================

/**
 * Reset form to initial state
 */
function resetForm() {
    elements.form.reset();
    isEditMode = false;
    currentRecordId = null;
    
    elements.formTitle.textContent = 'Submit New Report';
    elements.submitBtn.textContent = 'Submit Report';
    
    elements.fileNameDisplay.textContent = 'No file chosen';
    elements.imagePreview.classList.add('hidden');
    elements.imagePreview.innerHTML = '';
    
    elements.recordIdField.value = '';
    elements.existingImageUrl.value = '';
    
    // Re-enable unique fields
    document.getElementById('examCode').readOnly = false;
    document.getElementById('examDate').readOnly = false;
    document.getElementById('session').disabled = false;
    document.getElementById('roomNumber').readOnly = false;
    
    // Make image required again
    elements.attendanceImage.setAttribute('required', 'required');
    
    // Clear all error messages
    const errorElements = document.querySelectorAll('.error-message');
    errorElements.forEach(el => el.textContent = '');
}

// ========================================
// UI HELPERS
// ========================================

/**
 * Show alert message
 */
function showAlert(message, type = 'success') {
    elements.alertMessage.textContent = message;
    elements.alertBox.className = `alert ${type}`;
    elements.alertBox.classList.remove('hidden');
    
    // Auto-hide after 5 seconds for success/warning
    if (type !== 'error') {
        setTimeout(closeAlert, 5000);
    }
}

/**
 * Close alert
 */
function closeAlert() {
    elements.alertBox.classList.add('hidden');
}

/**
 * Show/hide loading spinner
 */
function showLoading(show) {
    if (show) {
        elements.loadingSpinner.classList.remove('hidden');
    } else {
        elements.loadingSpinner.classList.add('hidden');
    }
}

// ========================================
// NETWORK STATUS MONITORING
// ========================================

window.addEventListener('online', () => {
    showAlert('Connection restored', 'success');
});

window.addEventListener('offline', () => {
    showAlert('No internet connection. Please check your network.', 'error');
});
