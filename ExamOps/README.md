# Exam Invigilation Reporting System

A comprehensive web-based system for managing exam invigilation reports with Google Sheets as the database and Google Drive for file storage.

## 🚀 Features

- **Mobile-First Responsive Design**: Works seamlessly on all devices
- **Duplicate Prevention**: Automatic detection and updating of existing records
- **Multi-Image Upload**: Upload one or more attendance images per report
- **Image Compression**: Client-side image compression before upload
- **Real-time Validation**: Form validation with helpful error messages
- **Edit Functionality**: Fetch and update existing reports
- **Secure API**: API key authentication between services
- **Reliable**: Retry mechanism for network failures
- **Google Integration**: Sheets for database, Drive for file storage

## 📋 Tech Stack

### Frontend
- HTML5
- CSS3 (Mobile-first responsive design)
- Vanilla JavaScript (ES6+)

### Backend
- Python 3.9+
- FastAPI
- Uvicorn

### Integration Layer
- Google Apps Script (Web App)

### Storage
- Google Sheets (Database)
- Google Drive (File Storage)

## 📁 Project Structure

```
ExamOps/
├── frontend/
│   ├── index.html          # Main HTML file
│   ├── styles.css          # Mobile-first CSS
│   └── app.js              # JavaScript logic
│
├── backend/
│   ├── main.py             # FastAPI application
│   ├── config.py           # Configuration settings
│   ├── requirements.txt    # Python dependencies
│   └── .env.example        # Environment variables template
│
├── google-apps-script/
│   └── Code.gs             # Google Apps Script code
│
├── .gitignore
├── README.md
└── DEPLOYMENT.md
```

## 🔑 Key Concepts

### Unique Record Identification

A unique record is defined by the combination of:
- Exam Code
- Exam Date
- Session (Morning/Afternoon)
- Room Number

A SHA256 hash of these fields creates the `record_id`, ensuring no duplicate rows.

### Workflow

1. **Submit New Report**:
   - User fills the form
   - Frontend validates and compresses image
   - FastAPI generates `record_id`
   - Checks if record exists in Google Sheets
   - If exists → UPDATE, else → INSERT

2. **Edit Existing Report**:
   - User clicks "Edit Existing Report"
   - Enters unique identifiers
   - System fetches record from Sheets
   - Form auto-fills with existing data
   - User modifies and updates

## 🎯 Core Logic (IMPORTANT)

```
record_id = SHA256(exam_code + exam_date + session + room_number)

IF record_id EXISTS in Google Sheets:
    UPDATE the row
ELSE:
    INSERT new row
```

## 🔒 Security

- API key authentication between FastAPI and Google Apps Script
- CORS configuration for frontend access
- Input validation on both frontend and backend
- File type and size validation
- Google Drive file permissions (view-only via link)

## 📱 Responsive Design

Mobile-first approach with breakpoints:
- Mobile: < 640px
- Tablet: 640px - 1024px
- Desktop: > 1024px

## 🖼️ Image Handling

- **Client-side compression**: Reduces upload size
- **Max dimensions**: 1920px (auto-scaled)
- **Quality**: 80% JPEG compression
- **Storage**: Google Drive with shareable links
- **Database**: Only URL stored in Sheets

## 📊 Google Sheets Structure

| Column | Data Type | Description |
|--------|-----------|-------------|
| record_id | String | Unique identifier (hash) |
| exam_code | String | Exam code |
| exam_date | Date | Exam date |
| session | String | Morning/Afternoon |
| room_number | String | Room number |
| students_present | Number | Number of students |
| main_sheets | Number | Main answer sheets used |
| supplementary_sheets | Number | Supplementary sheets used |
| attendance_image_url(s) | String/JSON | Google Drive link (single) or JSON array of links (multiple) |
| last_updated | DateTime | Last update timestamp |

## 🛠️ Local Development

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed setup instructions.

### Quick Start

1. **Frontend**: Open `frontend/index.html` in a browser
2. **Backend**: 
   ```bash
   cd backend
   pip install -r requirements.txt
   python -m uvicorn main:app --reload --host 0.0.0.0 --port 8010
   ```
3. **Google Apps Script**: Deploy as Web App (see DEPLOYMENT.md)

## 📝 API Endpoints

### FastAPI Backend

- `POST /api/submit-report`: Submit new report
- `GET /api/get-report`: Retrieve existing report
- `POST /api/update-report`: Update existing report
- `GET /health`: Health check

### Google Apps Script

- `?action=submit`: Insert or update record
- `?action=get`: Retrieve record
- `?action=update`: Update existing record

## 🤝 Contributing

This is a production-ready system. For modifications:
1. Test thoroughly on local environment
2. Update documentation
3. Follow existing code style
4. Ensure mobile responsiveness

## 📄 License

This project is provided as-is for educational and production use.

## 👨‍💻 Author

Senior Full-Stack Engineer

## 🆘 Support

For issues or questions, refer to:
- [DEPLOYMENT.md](DEPLOYMENT.md) for setup help
- Code comments for implementation details
- Google Apps Script and FastAPI documentation

---

**Built with ❤️ for efficient exam management**
