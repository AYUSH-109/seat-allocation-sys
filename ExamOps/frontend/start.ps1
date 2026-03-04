# Start Frontend Server - PowerShell Script
# Run this script from the frontend directory

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Exam Invigilation System - Frontend" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Check if index.html exists
if (Test-Path "index.html") {
    Write-Host "[OK] Frontend files found" -ForegroundColor Green
} else {
    Write-Host "[!] Error: index.html not found" -ForegroundColor Red
    Write-Host "Make sure you're in the frontend directory" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "Starting HTTP server..." -ForegroundColor Green
Write-Host "Frontend will be available at: http://localhost:3000" -ForegroundColor Cyan
Write-Host ""
Write-Host "IMPORTANT: Make sure the backend is running at http://localhost:8010" -ForegroundColor Yellow
Write-Host "(Fallback is supported for http://localhost:8000)" -ForegroundColor DarkYellow
Write-Host ""
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host ""

# Start Python HTTP server
python -m http.server 3000
