"""
FastAPI Backend for Exam Invigilation Reporting System
Updated: March 3, 2026 - Added Google Auth, Time-slot based storage, Edit functionality
"""

import hashlib
import base64
from datetime import datetime
from typing import Optional, List, Union
from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import httpx
from pydantic import BaseModel, validator
import logging

from config import settings

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Exam Invigilation Reporting System",
    description="Backend API for managing exam invigilation reports with time-slot based storage",
    version="2.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ========================================
# PYDANTIC MODELS
# ========================================

class ReportBase(BaseModel):
    """Base model for report data"""
    user_email: str
    exam_date: str
    exam_time: str
    faculty_invigilator1: str
    faculty_invigilator2: str
    faculty_invigilator3: Optional[str] = ''
    blank_copies_received: int
    copies_used: int
    cancelled_copies: int = 0
    copies_returned: int
    room_number: str
    class1: str
    subject_class1: str
    students_class1: int
    class2: Optional[str] = ''
    subject_class2: Optional[str] = ''
    students_class2: Optional[int] = 0
    class3: Optional[str] = ''
    subject_class3: Optional[str] = ''
    students_class3: Optional[int] = 0
    remarks: Optional[str] = ''
    
    @validator('user_email', 'faculty_invigilator1', 'faculty_invigilator2', 'room_number', 'class1', 'subject_class1')
    def validate_not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError('Field cannot be empty')
        return v.strip()
    
    @validator('exam_time')
    def validate_time_slot(cls, v):
        valid_slots = ['9AM-11AM', '11AM-1PM', '1PM-4PM', '4PM-6PM']
        if v not in valid_slots:
            raise ValueError(f'Time slot must be one of: {", ".join(valid_slots)}')
        return v
    
    @validator('blank_copies_received', 'copies_used', 'cancelled_copies', 'copies_returned', 'students_class1')
    def validate_positive(cls, v):
        if v < 0:
            raise ValueError('Value must be non-negative')
        return v


class ReportResponse(BaseModel):
    """Response model"""
    success: bool
    message: str
    data: Optional[dict] = None


# ========================================
# HELPER FUNCTIONS
# ========================================

def generate_record_id(user_email: str, exam_date: str, exam_time: str) -> str:
    """
    Generate unique record ID using hash of unique fields
    
    Args:
        user_email: User's email address
        exam_date: Exam date
        exam_time: Time slot
        
    Returns:
        SHA256 hash string (first 16 characters)
    """
    unique_string = f"{user_email.lower()}|{exam_date}|{exam_time}"
    hash_object = hashlib.sha256(unique_string.encode())
    return hash_object.hexdigest()[:16]


async def send_to_google_apps_script(
    endpoint: str,
    data: dict,
    files: Optional[dict] = None
) -> dict:
    """
    Send request to Google Apps Script Web App.

    GAS web-app execution model:
      1. POST  → script.google.com/macros/s/<ID>/exec   (doPost runs here; data written to sheet)
                  → 302  Location: script.googleusercontent.com/macros/echo?...
      2. GET   → echo URL                                (retrieve the pre-computed JSON response)

    httpx's default follow_redirects=True converts POST→GET on a 302 (RFC-correct),
    which means doGet() runs at the echo URL instead of the intended doPost(), so the
    request body is never seen and nothing gets written.
    Fix: disable auto-redirect, capture the Location, then GET it to read the response.
    """
    url = (
        f"{settings.GOOGLE_APPS_SCRIPT_URL}"
        f"?action={endpoint}&apiKey={settings.GOOGLE_APPS_SCRIPT_API_KEY}"
    )

    try:
        timeout = httpx.Timeout(settings.APPS_SCRIPT_TIMEOUT_SECONDS)
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:

            # ── Step 1: POST (executes doPost / writes to sheet) ──────────────
            if files:
                post_response = await client.post(url, data=data, files=files)
            else:
                post_response = await client.post(url, json=data)

            # GAS always responds with a 302 after executing doPost
            if post_response.status_code not in (301, 302, 303, 307, 308):
                # Unexpected: GAS returned a direct response; try to parse it
                logger.warning(
                    f"GAS POST returned {post_response.status_code} (expected 302). "
                    f"Body[:200]: {post_response.text[:200]}"
                )
                post_response.raise_for_status()
                return post_response.json()

            echo_url = post_response.headers.get("location", "")
            if not echo_url:
                raise HTTPException(
                    status_code=502,
                    detail="Google Apps Script redirect missing Location header"
                )

            logger.info(f"GAS executed doPost → fetching response from echo URL")

            # ── Step 2: GET the echo URL to retrieve the JSON response ────────
            get_response = await client.get(echo_url)
            get_response.raise_for_status()

            content_type = get_response.headers.get("content-type", "")
            if "json" not in content_type and get_response.text.strip().startswith("<"):
                logger.error(
                    f"GAS echo URL returned HTML instead of JSON "
                    f"(content-type: {content_type}). "
                    f"Make sure the GAS web app is deployed as "
                    f"'Execute as: Me' and 'Who has access: Anyone'."
                    f"\nBody[:300]: {get_response.text[:300]}"
                )
                raise HTTPException(
                    status_code=502,
                    detail=(
                        "Google Apps Script returned HTML instead of JSON. "
                        "Ensure the web app is deployed with "
                        "'Execute as: Me' and 'Who has access: Anyone'."
                    )
                )

            try:
                result = get_response.json()
            except Exception:
                logger.error(
                    f"GAS non-JSON response ({get_response.status_code}): "
                    f"{get_response.text[:500]}"
                )
                raise HTTPException(
                    status_code=502,
                    detail="Google Apps Script returned a non-JSON response"
                )

            if not result.get("success"):
                logger.warning(
                    f"GAS returned failure for '{endpoint}': {result.get('message')}"
                )

            return result

    except httpx.TimeoutException:
        logger.error(f"Timeout while calling Google Apps Script: {endpoint}")
        raise HTTPException(
            status_code=504,
            detail="Request to Google Apps Script timed out"
        )
    except httpx.HTTPStatusError as e:
        logger.error(
            f"HTTP {e.response.status_code} from Google Apps Script: "
            f"{e.response.text[:300]}"
        )
        raise HTTPException(
            status_code=502,
            detail=f"Google Apps Script returned HTTP {e.response.status_code}"
        )
    except httpx.HTTPError as e:
        logger.error(f"HTTP error calling Google Apps Script: {str(e)}")
        raise HTTPException(
            status_code=502,
            detail=f"Error communicating with Google Apps Script: {str(e)}"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error calling Google Apps Script: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected error: {str(e)}"
        )


def validate_image_file(file: UploadFile) -> None:
    """
    Validate uploaded image file
    
    Args:
        file: Uploaded file
        
    Raises:
        HTTPException: If validation fails
    """
    # Check file type
    if not file.content_type.startswith('image/'):
        raise HTTPException(
            status_code=400,
            detail="File must be an image"
        )
    
    # Check file size (max 10MB after compression)
    file.file.seek(0, 2)  # Seek to end
    file_size = file.file.tell()
    file.file.seek(0)  # Reset to beginning
    
    max_size = 10 * 1024 * 1024  # 10MB
    if file_size > max_size:
        raise HTTPException(
            status_code=400,
            detail=f"File size exceeds maximum allowed size ({max_size / (1024*1024)}MB)"
        )


# ========================================
# API ENDPOINTS
# ========================================

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Exam Invigilation Reporting System API",
        "version": "1.0.0",
        "status": "running"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat()
    }


@app.post("/api/submit-report", response_model=ReportResponse)
async def submit_report(
    user_email: str = Form(...),
    exam_date: str = Form(...),
    exam_time: str = Form(...),
    faculty_invigilator1: str = Form(...),
    faculty_invigilator2: str = Form(...),
    faculty_invigilator3: str = Form(''),
    blank_copies_received: int = Form(...),
    copies_used: int = Form(...),
    cancelled_copies: int = Form(0),
    copies_returned: int = Form(...),
    room_number: str = Form(...),
    class1: str = Form(...),
    subject_class1: str = Form(...),
    students_class1: int = Form(...),
    class2: str = Form(''),
    subject_class2: str = Form(''),
    students_class2: int = Form(0),
    class3: str = Form(''),
    subject_class3: str = Form(''),
    students_class3: int = Form(0),
    remarks: str = Form(''),
    attendance_images: List[UploadFile] = File(...),
    record_id: Optional[str] = Form(None)
):
    """
    Submit new exam invigilation report
    Data is stored in different Google Sheets based on time slot
    """
    try:
        logger.info(f"Submitting report for {user_email} - {exam_date} - {exam_time}")
        
        # Generate record ID
        computed_record_id = generate_record_id(user_email, exam_date, exam_time)
        
        # Validate and process image(s)
        if not attendance_images:
            raise HTTPException(
                status_code=400,
                detail="At least one attendance image is required"
            )

        image_payloads = []
        for image in attendance_images:
            validate_image_file(image)
            image_data = await image.read()
            image_payloads.append({
                "image_data": base64.b64encode(image_data).decode('utf-8'),
                "image_filename": image.filename,
                "image_content_type": image.content_type
            })
        
        # Prepare data for Google Apps Script
        payload = {
            "record_id": computed_record_id,
            "user_email": user_email.strip(),
            "exam_date": exam_date,
            "exam_time": exam_time,
            "faculty_invigilator1": faculty_invigilator1.strip(),
            "faculty_invigilator2": faculty_invigilator2.strip(),
            "faculty_invigilator3": faculty_invigilator3.strip() if faculty_invigilator3 else '',
            "blank_copies_received": blank_copies_received,
            "copies_used": copies_used,
            "cancelled_copies": cancelled_copies,
            "copies_returned": copies_returned,
            "room_number": room_number.strip(),
            "class1": class1.strip(),
            "subject_class1": subject_class1.strip(),
            "students_class1": students_class1,
            "class2": class2.strip() if class2 else '',
            "subject_class2": subject_class2.strip() if subject_class2 else '',
            "students_class2": students_class2 if students_class2 else 0,
            "class3": class3.strip() if class3 else '',
            "subject_class3": subject_class3.strip() if subject_class3 else '',
            "students_class3": students_class3 if students_class3 else 0,
            "remarks": remarks.strip() if remarks else '',
            "image_payloads": image_payloads
        }
        
        # Send to Google Apps Script
        result = await send_to_google_apps_script("submit", payload)
        
        if result.get("success"):
            logger.info(f"Successfully submitted report with record_id: {computed_record_id}")
            return ReportResponse(
                success=True,
                message=result.get("message", "Report submitted successfully"),
                data={"record_id": computed_record_id}
            )
        else:
            raise HTTPException(
                status_code=400,
                detail=result.get("message", "Failed to submit report")
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error submitting report: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )


@app.get("/api/get-report", response_model=ReportResponse)
async def get_report(record_id: str):
    """
    Retrieve existing exam invigilation report by record ID
    """
    try:
        logger.info(f"Fetching report with record_id: {record_id}")
        
        # Request from Google Apps Script
        payload = {
            "record_id": record_id
        }
        
        result = await send_to_google_apps_script("get", payload)
        
        if result.get("success") and result.get("data"):
            logger.info(f"Successfully fetched report with record_id: {record_id}")
            return ReportResponse(
                success=True,
                message="Report retrieved successfully",
                data=result["data"]
            )
        else:
            raise HTTPException(
                status_code=404,
                detail="Report not found"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching report: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )


@app.post("/api/update-report", response_model=ReportResponse)
async def update_report(
    user_email: str = Form(...),
    exam_date: str = Form(...),
    exam_time: str = Form(...),
    faculty_invigilator1: str = Form(...),
    faculty_invigilator2: str = Form(...),
    faculty_invigilator3: str = Form(''),
    blank_copies_received: int = Form(...),
    copies_used: int = Form(...),
    cancelled_copies: int = Form(0),
    copies_returned: int = Form(...),
    room_number: str = Form(...),
    class1: str = Form(...),
    subject_class1: str = Form(...),
    students_class1: int = Form(...),
    class2: str = Form(''),
    subject_class2: str = Form(''),
    students_class2: int = Form(0),
    class3: str = Form(''),
    subject_class3: str = Form(''),
    students_class3: int = Form(0),
    remarks: str = Form(''),
    record_id: str = Form(...),
    attendance_images: Optional[Union[UploadFile, List[UploadFile]]] = File(None),
    existing_image_urls: Optional[str] = Form(None)
):
    """
    Update existing exam invigilation report
    """
    try:
        logger.info(f"Updating report with record_id: {record_id}")
        
        # Prepare data
        payload = {
            "record_id": record_id,
            "user_email": user_email.strip(),
            "exam_date": exam_date,
            "exam_time": exam_time,
            "faculty_invigilator1": faculty_invigilator1.strip(),
            "faculty_invigilator2": faculty_invigilator2.strip(),
            "faculty_invigilator3": faculty_invigilator3.strip() if faculty_invigilator3 else '',
            "blank_copies_received": blank_copies_received,
            "copies_used": copies_used,
            "cancelled_copies": cancelled_copies,
            "copies_returned": copies_returned,
            "room_number": room_number.strip(),
            "class1": class1.strip(),
            "subject_class1": subject_class1.strip(),
            "students_class1": students_class1,
            "class2": class2.strip() if class2 else '',
            "subject_class2": subject_class2.strip() if subject_class2 else '',
            "students_class2": students_class2 if students_class2 else 0,
            "class3": class3.strip() if class3 else '',
            "subject_class3": subject_class3.strip() if subject_class3 else '',
            "students_class3": students_class3 if students_class3 else 0,
            "remarks": remarks.strip() if remarks else ''
        }
        
        # Handle image update (optional)
        if isinstance(attendance_images, list):
            uploaded_images = attendance_images
        elif attendance_images:
            uploaded_images = [attendance_images]
        else:
            uploaded_images = []

        valid_images = [img for img in uploaded_images if img and getattr(img, 'filename', None)]
        if valid_images:
            image_payloads = []
            for image in valid_images:
                validate_image_file(image)
                image_data = await image.read()
                image_payloads.append({
                    "image_data": base64.b64encode(image_data).decode('utf-8'),
                    "image_filename": image.filename,
                    "image_content_type": image.content_type
                })

            payload["image_payloads"] = image_payloads
        else:
            payload["existing_image_urls"] = existing_image_urls
        
        # Send to Google Apps Script
        result = await send_to_google_apps_script("update", payload)
        
        if result.get("success"):
            logger.info(f"Successfully updated report with record_id: {record_id}")
            return ReportResponse(
                success=True,
                message="Report updated successfully",
                data={"record_id": record_id}
            )
        else:
            raise HTTPException(
                status_code=400,
                detail=result.get("message", "Failed to update report")
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating report: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )


# ========================================
# ERROR HANDLERS
# ========================================

@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    """Handle HTTP exceptions"""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "message": exc.detail
        }
    )


@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    """Handle general exceptions"""
    logger.error(f"Unhandled exception: {str(exc)}")
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "message": "Internal server error"
        }
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG
    )
