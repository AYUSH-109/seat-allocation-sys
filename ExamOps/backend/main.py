"""
FastAPI Backend for Exam Invigilation Reporting System
Main application file
"""

import hashlib
import base64
from datetime import datetime
from typing import Optional, List
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
    description="Backend API for managing exam invigilation reports",
    version="1.0.0"
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
    exam_code: str
    exam_date: str
    session: str
    room_number: str
    students_present: int
    main_sheets: int
    supplementary_sheets: int
    
    @validator('exam_code', 'room_number')
    def validate_not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError('Field cannot be empty')
        return v.strip()
    
    @validator('session')
    def validate_session(cls, v):
        if v not in ['Morning', 'Afternoon']:
            raise ValueError('Session must be Morning or Afternoon')
        return v
    
    @validator('students_present', 'main_sheets', 'supplementary_sheets')
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

def generate_record_id(exam_code: str, exam_date: str, session: str, room_number: str) -> str:
    """
    Generate unique record ID using hash of unique fields
    
    Args:
        exam_code: Exam code
        exam_date: Exam date
        session: Session (Morning/Afternoon)
        room_number: Room number
        
    Returns:
        SHA256 hash string (first 16 characters)
    """
    unique_string = f"{exam_code.lower()}|{exam_date}|{session.lower()}|{room_number.lower()}"
    hash_object = hashlib.sha256(unique_string.encode())
    return hash_object.hexdigest()[:16]


async def send_to_google_apps_script(
    endpoint: str,
    data: dict,
    files: Optional[dict] = None
) -> dict:
    """
    Send request to Google Apps Script Web App
    
    Args:
        endpoint: API endpoint (submit, get, update)
        data: Request data
        files: Optional files to upload
        
    Returns:
        Response from Google Apps Script
    """
    url = (
        f"{settings.GOOGLE_APPS_SCRIPT_URL}"
        f"?action={endpoint}&apiKey={settings.GOOGLE_APPS_SCRIPT_API_KEY}"
    )
    
    # Keep headers minimal for Apps Script compatibility.
    # Auth is sent as query parameter because Apps Script does not reliably expose custom headers.
    headers = {}
    
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            if files:
                # Send multipart/form-data
                response = await client.post(
                    url,
                    data=data,
                    files=files,
                    headers=headers
                )
            else:
                # Send JSON
                response = await client.post(
                    url,
                    json=data,
                    headers=headers
                )
            
            response.raise_for_status()
            return response.json()
            
    except httpx.TimeoutException:
        logger.error(f"Timeout while calling Google Apps Script: {endpoint}")
        raise HTTPException(
            status_code=504,
            detail="Request to Google Apps Script timed out"
        )
    except httpx.HTTPError as e:
        logger.error(f"HTTP error calling Google Apps Script: {str(e)}")
        raise HTTPException(
            status_code=502,
            detail=f"Error communicating with Google Apps Script: {str(e)}"
        )
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
    exam_code: str = Form(...),
    exam_date: str = Form(...),
    session: str = Form(...),
    room_number: str = Form(...),
    students_present: int = Form(...),
    main_sheets: int = Form(...),
    supplementary_sheets: int = Form(...),
    attendance_image: List[UploadFile] = File(...),
    record_id: Optional[str] = Form(None)
):
    """
    Submit new exam invigilation report
    
    If a report with the same unique identifiers exists, it will be updated.
    Otherwise, a new report will be created.
    """
    try:
        logger.info(f"Submitting report for {exam_code} - {exam_date} - {session} - {room_number}")
        
        # Generate record ID
        computed_record_id = generate_record_id(exam_code, exam_date, session, room_number)
        
        # Validate and process image(s)
        if not attendance_image:
            raise HTTPException(
                status_code=400,
                detail="At least one attendance image is required"
            )

        image_payloads = []
        for image in attendance_image:
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
            "exam_code": exam_code.strip(),
            "exam_date": exam_date,
            "session": session,
            "room_number": room_number.strip(),
            "students_present": students_present,
            "main_sheets": main_sheets,
            "supplementary_sheets": supplementary_sheets,
            "image_payloads": image_payloads,
            "image_data": image_payloads[0]["image_data"],
            "image_filename": image_payloads[0]["image_filename"],
            "image_content_type": image_payloads[0]["image_content_type"]
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
async def get_report(
    exam_code: str,
    exam_date: str,
    session: str,
    room_number: str
):
    """
    Retrieve existing exam invigilation report
    """
    try:
        logger.info(f"Fetching report for {exam_code} - {exam_date} - {session} - {room_number}")
        
        # Generate record ID
        record_id = generate_record_id(exam_code, exam_date, session, room_number)
        
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
    exam_code: str = Form(...),
    exam_date: str = Form(...),
    session: str = Form(...),
    room_number: str = Form(...),
    students_present: int = Form(...),
    main_sheets: int = Form(...),
    supplementary_sheets: int = Form(...),
    record_id: str = Form(...),
    attendance_image: Optional[List[UploadFile]] = File(None),
    existing_image_url: Optional[str] = Form(None)
):
    """
    Update existing exam invigilation report
    """
    try:
        logger.info(f"Updating report with record_id: {record_id}")
        
        # Verify record_id matches the provided data
        computed_record_id = generate_record_id(exam_code, exam_date, session, room_number)
        if computed_record_id != record_id:
            raise HTTPException(
                status_code=400,
                detail="Record ID mismatch. Cannot update unique identifiers."
            )
        
        # Prepare data
        payload = {
            "record_id": record_id,
            "exam_code": exam_code.strip(),
            "exam_date": exam_date,
            "session": session,
            "room_number": room_number.strip(),
            "students_present": students_present,
            "main_sheets": main_sheets,
            "supplementary_sheets": supplementary_sheets
        }
        
        # Handle image update (optional)
        valid_images = [img for img in (attendance_image or []) if img and img.filename]
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
            payload["image_data"] = image_payloads[0]["image_data"]
            payload["image_filename"] = image_payloads[0]["image_filename"]
            payload["image_content_type"] = image_payloads[0]["image_content_type"]
        else:
            payload["existing_image_url"] = existing_image_url
        
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
