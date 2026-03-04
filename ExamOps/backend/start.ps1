# Start Backend Server - PowerShell Script
# Run this script from the backend directory

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Exam Invigilation System - Backend" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Check if virtual environment exists
if (Test-Path "venv") {
    Write-Host "[OK] Virtual environment found" -ForegroundColor Green
    
    # Activate virtual environment
    Write-Host "Activating virtual environment..." -ForegroundColor Yellow
    & .\venv\Scripts\Activate.ps1
    
} else {
    Write-Host "[!] Virtual environment not found" -ForegroundColor Yellow
    Write-Host "Creating virtual environment..." -ForegroundColor Yellow
    python -m venv venv
    
    Write-Host "Activating virtual environment..." -ForegroundColor Yellow
    & .\venv\Scripts\Activate.ps1
    
    Write-Host "Installing dependencies..." -ForegroundColor Yellow
    pip install -r requirements.txt
}

# Check if .env file exists
if (Test-Path ".env") {
    Write-Host "[OK] .env file found" -ForegroundColor Green
} else {
    Write-Host "[!] .env file not found" -ForegroundColor Yellow
    Write-Host "Copying .env.example to .env..." -ForegroundColor Yellow
    Copy-Item .env.example .env
    Write-Host ""
    Write-Host "IMPORTANT: Edit .env file with your configuration before continuing!" -ForegroundColor Red
    Write-Host ""
    $continue = Read-Host "Press Enter to continue or Ctrl+C to exit and edit .env"
}

Write-Host ""
Write-Host "Starting FastAPI server..." -ForegroundColor Green
Write-Host "Server will be available at: http://localhost:8010" -ForegroundColor Cyan
Write-Host "API documentation at: http://localhost:8010/docs" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host ""

# Start the server
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8010
