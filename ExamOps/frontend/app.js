/**
 * Hall Audit — Exam Invigilation Reporting System
 * Complete frontend rewrite — March 2026
 */

// ═══════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════
const CONFIG = {
    API_BASE: 'http://localhost:8010/api',
    MAX_IMAGE_MB: 5,
    MAX_IMAGE_DIM: 1920,
    IMAGE_QUALITY: 0.8,
    RETRIES: 3,
    RETRY_DELAY: 1000,
    GOOGLE_CLIENT_ID: '647849200108-2t4bc5a9q85ppoqhmh8t6rftk923ql9s.apps.googleusercontent.com',
};

// ═══════════════════════════════════════════
// State
// ═══════════════════════════════════════════
let user = null;
let lastRecordId = null;
let editMode = false;
let existingImgUrls = '';
let selectedFiles = [];
let datePicker = null;

// ═══════════════════════════════════════════
// DOM Refs
// ═══════════════════════════════════════════
const $ = (id) => document.getElementById(id);

const el = {
    loginView: $('loginView'),
    appView: $('appView'),
    userPhoto: $('userPhoto'),
    userName: $('userName'),
    themeBtn: $('themeBtn'),
    signOutBtn: $('signOutBtn'),
    form: $('reportForm'),
    submitBtn: $('submitBtn'),
    resetBtn: $('resetBtn'),
    overlay: $('overlay'),
    overlayMsg: $('overlayMsg'),
    toasts: $('toasts'),
    successPanel: $('successPanel'),
    successMsg: $('successMsg'),
    editBtn: $('editBtn'),
    newBtn: $('newBtn'),
    examDate: $('examDate'),
    examTime: $('examTime'),
    roomNumber: $('roomNumber'),
    facultyCount: $('facultyCount'),
    classCount: $('classCount'),
    dropZone: $('dropZone'),
    fileInput: $('fileInput'),
    browseBtn: $('browseBtn'),
    previewGrid: $('previewGrid'),
    existingImages: $('existingImages'),
    userEmail: $('userEmail'),
    recordId: $('recordId'),
    blankReceived: $('blankReceived'),
    copiesUsed: $('copiesUsed'),
    cancelled: $('cancelled'),
    returned: $('returned'),
    tallyReceived: $('tallyReceived'),
    tallyAccounted: $('tallyAccounted'),
    tallyFill: $('tallyFill'),
    tallyStatus: $('tallyStatus'),
};

// ═══════════════════════════════════════════
// Initialization
// ═══════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    syncGoogleClientId();
    initTheme();
    restoreSession();
    bindEvents();
    initDatePicker();
});

function syncGoogleClientId() {
    const container = $('g_id_onload');
    if (container) container.setAttribute('data-client_id', CONFIG.GOOGLE_CLIENT_ID);
}

function initDatePicker() {
    const now = new Date();
    const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    el.examDate._maxISO = todayISO;

    datePicker = flatpickr(el.examDate, {
        dateFormat: 'd/m/Y',
        maxDate: 'today',
        disableMobile: true,
        clickOpens: true,
        onChange() { clearErr('examDate'); },
    });

    // Calendar toggle button
    const toggleBtn = $('calendarToggle');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            datePicker.toggle();
        });
    }
}

function restoreSession() {
    const saved = localStorage.getItem('hallaudit_user');
    if (saved) {
        user = JSON.parse(saved);
        showApp();
    }
}

// ═══════════════════════════════════════════
// Google Auth
// ═══════════════════════════════════════════
function handleCredentialResponse(response) {
    const payload = parseJwt(response.credential);
    user = { email: payload.email, name: payload.name, picture: payload.picture };
    localStorage.setItem('hallaudit_user', JSON.stringify(user));
    showApp();
}

window.handleCredentialResponse = handleCredentialResponse;

function parseJwt(token) {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(
        decodeURIComponent(
            atob(b64)
                .split('')
                .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                .join('')
        )
    );
}

function signOut() {
    user = null;
    lastRecordId = null;
    localStorage.removeItem('hallaudit_user');
    el.appView.classList.add('hidden');
    el.loginView.classList.remove('hidden');
    resetForm();
}

function showApp() {
    el.loginView.classList.add('hidden');
    el.appView.classList.remove('hidden');
    el.userName.textContent = user.name;
    el.userPhoto.src = user.picture;
    el.userEmail.value = user.email;
}

// ═══════════════════════════════════════════
// Theme
// ═══════════════════════════════════════════
function initTheme() {
    const saved = localStorage.getItem('hallaudit_theme');
    applyTheme(saved || 'light');
}

function applyTheme(t) {
    document.body.classList.toggle('dark', t === 'dark');
    const icon = document.getElementById('themeIcon');
    if (icon) {
        icon.innerHTML = t === 'dark'
            ? '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>'
            : '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>';
    }
}

function toggleTheme() {
    const next = document.body.classList.contains('dark') ? 'light' : 'dark';
    localStorage.setItem('hallaudit_theme', next);
    applyTheme(next);
}

// ═══════════════════════════════════════════
// Event Binding
// ═══════════════════════════════════════════
function bindEvents() {
    el.signOutBtn.addEventListener('click', signOut);
    el.themeBtn.addEventListener('click', toggleTheme);
    el.form.addEventListener('submit', handleSubmit);
    el.resetBtn.addEventListener('click', resetForm);
    el.editBtn.addEventListener('click', loadForEdit);
    el.newBtn.addEventListener('click', () => {
        resetForm();
        el.successPanel.classList.add('hidden');
        el.form.classList.remove('hidden');
        toast('Ready for a new report', 'info');
    });

    // Faculty count dropdown
    el.facultyCount.addEventListener('change', updateFacultyPanels);

    // Branch count
    el.classCount.addEventListener('change', updateClassPanels);

    // Copy tally
    [el.blankReceived, el.copiesUsed, el.cancelled, el.returned].forEach((inp) => {
        inp.addEventListener('input', updateTally);
    });

    // File handling
    el.browseBtn.addEventListener('click', () => el.fileInput.click());
    el.dropZone.addEventListener('click', (e) => {
        if (e.target === el.dropZone || e.target.closest('.drop-zone-prompt'))
            el.fileInput.click();
    });
    el.fileInput.addEventListener('change', (e) => {
        addFiles(Array.from(e.target.files));
        el.fileInput.value = '';
    });

    // Drag & drop
    ['dragenter', 'dragover'].forEach((ev) =>
        el.dropZone.addEventListener(ev, (e) => {
            e.preventDefault();
            el.dropZone.classList.add('dragover');
        })
    );
    ['dragleave', 'drop'].forEach((ev) =>
        el.dropZone.addEventListener(ev, (e) => {
            e.preventDefault();
            el.dropZone.classList.remove('dragover');
        })
    );
    el.dropZone.addEventListener('drop', (e) => {
        addFiles(Array.from(e.dataTransfer.files));
    });

    // Inline validation — clear error on input
    el.form.querySelectorAll('input[required], select[required]').forEach((inp) => {
        inp.addEventListener('blur', () => validateField(inp));
        inp.addEventListener('input', () => clearErr(inp.id));
    });
}

// ═══════════════════════════════════════════
// Date Helpers
// ═══════════════════════════════════════════

function parseDateDDMMYYYY(str) {
    const m = String(str).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return null;
    const day = parseInt(m[1]), month = parseInt(m[2]), year = parseInt(m[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const d = new Date(year, month - 1, day);
    if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
    return d;
}

function dateToISO(str) {
    const d = parseDateDDMMYYYY(str);
    if (!d) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isoToDDMMYYYY(iso) {
    if (!iso) return '';
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return '';
    return `${m[3]}/${m[2]}/${m[1]}`;
}

// ═══════════════════════════════════════════
// Faculty Panels
// ═══════════════════════════════════════════
function updateFacultyPanels() {
    const count = parseInt(el.facultyCount.value) || 1;
    for (let i = 1; i <= 3; i++) {
        const panel = $(`facultyPanel${i}`);
        if (i <= count) {
            panel.classList.remove('hidden');
        } else {
            panel.classList.add('hidden');
            panel.querySelectorAll('input').forEach((inp) => (inp.value = ''));
        }
    }
}

// ═══════════════════════════════════════════
// Branch Panels
// ═══════════════════════════════════════════
function updateClassPanels() {
    const count = parseInt(el.classCount.value) || 1;
    for (let i = 1; i <= 3; i++) {
        const panel = $(`classPanel${i}`);
        if (i <= count) {
            panel.classList.remove('hidden');
        } else {
            panel.classList.add('hidden');
            panel.querySelectorAll('input').forEach((inp) => (inp.value = ''));
        }
    }
}

// ═══════════════════════════════════════════
// Copy Tally
// ═══════════════════════════════════════════
function updateTally() {
    const received = parseInt(el.blankReceived.value) || 0;
    const used = parseInt(el.copiesUsed.value) || 0;
    const canc = parseInt(el.cancelled.value) || 0;
    const ret = parseInt(el.returned.value) || 0;
    const accounted = used + canc + ret;

    el.tallyReceived.textContent = received;
    el.tallyAccounted.textContent = accounted;

    const pct = received > 0 ? Math.min((accounted / received) * 100, 100) : 0;
    el.tallyFill.style.width = pct + '%';
    el.tallyFill.className = 'tally-fill';

    if (received === 0 && accounted === 0) {
        el.tallyStatus.textContent = '';
        el.tallyStatus.className = 'tally-status';
    } else if (accounted === received) {
        el.tallyFill.classList.add('match');
        el.tallyStatus.textContent = 'Copies tally perfectly';
        el.tallyStatus.className = 'tally-status ok';
    } else if (accounted > received) {
        el.tallyFill.classList.add('over');
        el.tallyStatus.textContent = `${accounted - received} more than received`;
        el.tallyStatus.className = 'tally-status bad';
    } else {
        el.tallyStatus.textContent = `${received - accounted} copies unaccounted`;
        el.tallyStatus.className = 'tally-status warn';
    }
}

// ═══════════════════════════════════════════
// File Handling
// ═══════════════════════════════════════════
function addFiles(files) {
    for (const f of files) {
        if (!f.type.startsWith('image/')) {
            toast('Only image files are allowed', 'error');
            continue;
        }
        if (f.size > CONFIG.MAX_IMAGE_MB * 1024 * 1024) {
            toast(`${f.name} exceeds ${CONFIG.MAX_IMAGE_MB} MB`, 'error');
            continue;
        }
        selectedFiles.push(f);
    }
    renderPreviews();
    clearErr('fileInput');
    if (selectedFiles.length > 0) {
        el.existingImages.classList.add('hidden');
        el.existingImages.innerHTML = '';
    }
}

function removeFile(index) {
    selectedFiles.splice(index, 1);
    renderPreviews();
    if (selectedFiles.length === 0 && editMode && existingImgUrls) {
        renderExistingImages(existingImgUrls);
    }
}

function renderPreviews() {
    el.previewGrid.innerHTML = '';
    if (selectedFiles.length === 0) {
        el.previewGrid.classList.add('hidden');
        return;
    }
    el.previewGrid.classList.remove('hidden');

    selectedFiles.forEach((f, i) => {
        const item = document.createElement('div');
        item.className = 'preview-item';

        const img = document.createElement('img');
        img.src = URL.createObjectURL(f);
        img.alt = f.name;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'preview-remove';
        btn.innerHTML = '<svg width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><line x1=\"18\" y1=\"6\" x2=\"6\" y2=\"18\"/><line x1=\"6\" y1=\"6\" x2=\"18\" y2=\"18\"/></svg>';
        btn.onclick = () => removeFile(i);

        item.appendChild(img);
        item.appendChild(btn);
        el.previewGrid.appendChild(item);
    });
}

function renderExistingImages(urlString) {
    const urls = String(urlString || '')
        .split(',')
        .map((u) => u.trim())
        .filter(Boolean);
    if (urls.length === 0) {
        el.existingImages.classList.add('hidden');
        return;
    }

    el.existingImages.innerHTML = '';
    el.existingImages.classList.remove('hidden');

    const label = document.createElement('div');
    label.className = 'existing-label';
    label.textContent = 'Previously uploaded (kept unless you upload new files):';
    el.existingImages.appendChild(label);

    urls.forEach((url, i) => {
        const item = document.createElement('div');
        item.className = 'preview-item';
        const img = document.createElement('img');
        img.src = url;
        img.alt = `Existing ${i + 1}`;
        img.loading = 'lazy';
        item.appendChild(img);
        el.existingImages.appendChild(item);
    });
}

async function compressImage(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let w = img.width,
                    h = img.height;
                if (w > CONFIG.MAX_IMAGE_DIM || h > CONFIG.MAX_IMAGE_DIM) {
                    if (w > h) {
                        h = (h / w) * CONFIG.MAX_IMAGE_DIM;
                        w = CONFIG.MAX_IMAGE_DIM;
                    } else {
                        w = (w / h) * CONFIG.MAX_IMAGE_DIM;
                        h = CONFIG.MAX_IMAGE_DIM;
                    }
                }
                canvas.width = w;
                canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                canvas.toBlob((blob) => resolve(blob), 'image/jpeg', CONFIG.IMAGE_QUALITY);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// ═══════════════════════════════════════════
// Validation
// ═══════════════════════════════════════════
function validateField(inp) {
    const val = inp.value.trim();
    const id = inp.id;

    if (inp.required && !val) {
        showErr(id, 'Required');
        return false;
    }

    if (id === 'examDate' && val) {
        const d = parseDateDDMMYYYY(val);
        if (!d) {
            showErr(id, 'Enter a valid date as DD/MM/YYYY');
            return false;
        }
        const iso = dateToISO(val);
        if (el.examDate._maxISO && iso > el.examDate._maxISO) {
            showErr(id, 'Cannot be a future date');
            return false;
        }
    }

    clearErr(id);
    return true;
}

function validateForm() {
    let ok = true;

    // Date
    if (!el.examDate.value.trim()) {
        showErr('examDate', 'Required');
        ok = false;
    } else if (!validateField(el.examDate)) {
        ok = false;
    }

    // Room
    if (!validateField(el.roomNumber)) ok = false;

    // Time slot (now a select)
    if (!el.examTime.value) {
        showErr('examTime', 'Select a time slot');
        ok = false;
    }

    // Faculty — validate based on count
    const fCount = parseInt(el.facultyCount.value) || 1;
    for (let i = 1; i <= fCount; i++) {
        if (!$(`faculty${i}`).value.trim()) {
            showErr(`faculty${i}`, 'Required');
            ok = false;
        }
    }

    // Copy counts
    ['blankReceived', 'copiesUsed', 'returned'].forEach((id) => {
        if (!$(id).value.trim()) {
            showErr(id, 'Required');
            ok = false;
        }
    });

    // Branch 1
    ['class1', 'subject1', 'students1'].forEach((id) => {
        if (!$(id).value.trim()) {
            showErr(id, 'Required');
            ok = false;
        }
    });

    // Files
    if (!editMode && selectedFiles.length === 0) {
        showErr('fileInput', 'Upload at least one image');
        ok = false;
    }
    if (editMode && selectedFiles.length === 0 && !existingImgUrls) {
        showErr('fileInput', 'Upload at least one image');
        ok = false;
    }

    return ok;
}

function showErr(id, msg) {
    const errEl = $(id + 'Err');
    if (errEl) errEl.textContent = msg;
    const field = $(id);
    if (field && field.style) field.style.borderColor = 'var(--c-error)';
}

function clearErr(id) {
    const errEl = $(id + 'Err');
    if (errEl) errEl.textContent = '';
    const field = $(id);
    if (field && field.style) field.style.borderColor = '';
}

// ═══════════════════════════════════════════
// Form Submission
// ═══════════════════════════════════════════
async function handleSubmit(e) {
    e.preventDefault();
    if (!validateForm()) {
        toast('Please fix the errors above', 'error');
        return;
    }

    const isUpdate = Boolean(el.recordId.value);
    showOverlay(isUpdate ? 'Updating report…' : 'Submitting report…');

    try {
        const fd = new FormData();
        const t = (v) => String(v ?? '').trim();
        const n = (v) => {
            const x = parseInt(v);
            return String(Number.isFinite(x) ? x : 0);
        };

        fd.append('user_email', user.email);
        fd.append('exam_date', dateToISO(el.examDate.value));
        fd.append('exam_time', el.examTime.value);
        fd.append('faculty_invigilator1', t($('faculty1').value));
        fd.append('faculty_invigilator2', t($('faculty2').value));
        fd.append('faculty_invigilator3', t($('faculty3').value));
        fd.append('blank_copies_received', n(el.blankReceived.value));
        fd.append('copies_used', n(el.copiesUsed.value));
        fd.append('cancelled_copies', n(el.cancelled.value));
        fd.append('copies_returned', n(el.returned.value));
        fd.append('room_number', t(el.roomNumber.value));

        fd.append('class1', t($('class1').value));
        fd.append('subject_class1', t($('subject1').value));
        fd.append('students_class1', n($('students1').value));

        fd.append('class2', t($('class2').value));
        fd.append('subject_class2', t($('subject2').value));
        fd.append('students_class2', n($('students2').value));

        fd.append('class3', t($('class3').value));
        fd.append('subject_class3', t($('subject3').value));
        fd.append('students_class3', n($('students3').value));

        fd.append('remarks', t($('remarks').value));

        if (el.recordId.value) fd.append('record_id', el.recordId.value);

        // Compress and attach images
        for (const file of selectedFiles) {
            const blob = await compressImage(file);
            fd.append('attendance_images', blob, file.name);
        }

        // Keep previous images when updating without new uploads
        if (isUpdate && selectedFiles.length === 0 && existingImgUrls) {
            fd.append('existing_image_urls', existingImgUrls);
        }

        const endpoint = isUpdate ? '/update-report' : '/submit-report';
        const result = await apiPost(endpoint, fd);

        if (result.success) {
            lastRecordId = result.data?.record_id;
            toast(result.message || 'Report saved!', 'success');
            el.form.classList.add('hidden');
            el.successMsg.textContent = isUpdate
                ? 'Report updated successfully!'
                : 'Report submitted successfully!';
            el.successPanel.classList.remove('hidden');
        } else {
            toast(result.message || 'Submission failed', 'error');
        }
    } catch (err) {
        console.error('Submission error:', err);
        toast(err.message || 'An error occurred', 'error');
    } finally {
        hideOverlay();
    }
}

async function apiPost(endpoint, formData) {
    let lastErr;
    for (let i = 0; i < CONFIG.RETRIES; i++) {
        try {
            const res = await fetch(CONFIG.API_BASE + endpoint, {
                method: 'POST',
                body: formData,
            });

            if (res.ok) return await res.json();

            // Parse error details from backend
            let msg = `HTTP ${res.status}`;
            try {
                const j = await res.json();
                if (j.message) {
                    msg = j.message;
                } else if (Array.isArray(j.detail)) {
                    msg = j.detail
                        .map((d) => {
                            const path = Array.isArray(d.loc) ? d.loc.join('.') : 'field';
                            return `${path}: ${d.msg || 'invalid'}`;
                        })
                        .join('; ');
                }
            } catch {
                /* use default msg */
            }
            throw new Error(msg);
        } catch (err) {
            lastErr = err;
            // Only retry on network failures (TypeError)
            if (!(err instanceof TypeError)) throw err;
            if (i < CONFIG.RETRIES - 1)
                await new Promise((r) => setTimeout(r, CONFIG.RETRY_DELAY));
        }
    }
    throw lastErr || new Error('Request failed');
}

// ═══════════════════════════════════════════
// Edit Mode
// ═══════════════════════════════════════════
async function loadForEdit() {
    if (!lastRecordId) {
        toast('No recent submission to edit', 'error');
        return;
    }

    showOverlay('Loading submission…');

    try {
        const res = await fetch(`${CONFIG.API_BASE}/get-report?record_id=${lastRecordId}`);
        const data = await res.json();

        if (data.success && data.data) {
            populateEdit(data.data);
            el.successPanel.classList.add('hidden');
            el.form.classList.remove('hidden');
            toast('Editing your submission', 'info');
        } else {
            toast('Could not load report', 'error');
        }
    } catch (err) {
        toast('Failed to load report', 'error');
        console.error(err);
    } finally {
        hideOverlay();
    }
}

function populateEdit(d) {
    editMode = true;

    const dateISO = toDateVal(d.exam_date);
    if (datePicker && dateISO) {
        datePicker.setDate(dateISO, true);
    } else {
        el.examDate.value = isoToDDMMYYYY(dateISO);
    }
    el.examTime.value = d.exam_time || '';
    el.roomNumber.value = d.room_number || '';

    $('faculty1').value = d.faculty_invigilator1 || '';
    $('faculty2').value = d.faculty_invigilator2 || '';
    $('faculty3').value = d.faculty_invigilator3 || '';

    // Auto-detect faculty count
    let fCount = 1;
    if (d.faculty_invigilator2) fCount = 2;
    if (d.faculty_invigilator3) fCount = 3;
    el.facultyCount.value = fCount;
    updateFacultyPanels();

    el.blankReceived.value = d.blank_copies_received ?? '';
    el.copiesUsed.value = d.copies_used ?? '';
    el.cancelled.value = d.cancelled_copies ?? 0;
    el.returned.value = d.copies_returned ?? '';

    $('class1').value = d.class1 || '';
    $('subject1').value = d.subject_class1 || '';
    $('students1').value = d.students_class1 ?? '';

    // Auto-detect class count
    let count = 1;
    if (d.class2) count = 2;
    if (d.class3) count = 3;
    el.classCount.value = count;
    updateClassPanels();

    $('class2').value = d.class2 || '';
    $('subject2').value = d.subject_class2 || '';
    $('students2').value = d.students_class2 ?? '';

    $('class3').value = d.class3 || '';
    $('subject3').value = d.subject_class3 || '';
    $('students3').value = d.students_class3 ?? '';

    $('remarks').value = d.remarks || '';
    el.recordId.value = d.record_id || '';

    // Existing images
    if (Array.isArray(d.attendance_image_urls)) {
        existingImgUrls = d.attendance_image_urls.join(', ');
    } else if (typeof d.attendance_image_urls === 'string') {
        existingImgUrls = d.attendance_image_urls;
    } else if (typeof d.attendance_images === 'string') {
        existingImgUrls = d.attendance_images;
    } else {
        existingImgUrls = '';
    }
    renderExistingImages(existingImgUrls);

    updateTally();
    el.submitBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg> Update Report';
}

function toDateVal(v) {
    if (!v) return '';
    const s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(s);
    if (isNaN(d)) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ═══════════════════════════════════════════
// Reset
// ═══════════════════════════════════════════
function resetForm() {
    el.form.reset();
    editMode = false;
    selectedFiles = [];
    existingImgUrls = '';

    if (datePicker) datePicker.clear();
    el.examTime.value = '';
    el.facultyCount.value = '2';
    updateFacultyPanels();
    el.classCount.value = '1';
    updateClassPanels();

    el.previewGrid.innerHTML = '';
    el.previewGrid.classList.add('hidden');
    el.existingImages.innerHTML = '';
    el.existingImages.classList.add('hidden');
    el.recordId.value = '';

    el.submitBtn.textContent = 'Submit Report';

    // Clear all error states
    el.form.querySelectorAll('.field-err').forEach((e) => (e.textContent = ''));
    el.form.querySelectorAll('input, select, textarea').forEach((e) => (e.style.borderColor = ''));

    updateTally();
    el.successPanel.classList.add('hidden');
    el.form.classList.remove('hidden');
}

// ═══════════════════════════════════════════
// UI Helpers
// ═══════════════════════════════════════════
function showOverlay(msg) {
    el.overlayMsg.textContent = msg || 'Processing…';
    el.overlay.classList.remove('hidden');
}

function hideOverlay() {
    el.overlay.classList.add('hidden');
}

function toast(msg, type = 'info') {
    const icons = {
        success: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
        error:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
        info:    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
    };
    const div = document.createElement('div');
    div.className = `toast toast-${type}`;
    div.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.info}</span>
        <span class="toast-msg">${escapeHtml(msg)}</span>
        <button class="toast-close" onclick="this.parentElement.remove()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    `;
    el.toasts.appendChild(div);
    setTimeout(() => {
        div.classList.add('out');
        setTimeout(() => div.remove(), 300);
    }, 4500);
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Network status
window.addEventListener('online', () => toast('Connection restored', 'success'));
window.addEventListener('offline', () => toast('No internet connection', 'error'));
