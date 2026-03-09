#!/usr/bin/env bash
# Start Backend Server
# Run this script from the backend directory

set -e

echo "====================================="
echo "Exam Invigilation System - Backend"
echo "====================================="
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "[!] Virtual environment not found"
    echo "Creating virtual environment..."
    python3 -m venv venv
    echo "Installing dependencies..."
    venv/bin/pip install --upgrade pip -q
    venv/bin/pip install -r requirements.txt
else
    echo "[OK] Virtual environment found"
fi

# Activate virtual environment
source venv/bin/activate

# Install/update dependencies if requirements changed
pip install -r requirements.txt -q

# Set up .env if it doesn't exist
if [ ! -f ".env" ]; then
    echo "[!] .env file not found"
    echo "Copying .env.example to .env..."
    cp .env.example .env
    echo ""
    echo "IMPORTANT: Edit .env with your configuration before re-running!"
    echo "           At minimum, set GOOGLE_APPS_SCRIPT_URL and GOOGLE_APPS_SCRIPT_API_KEY"
    echo ""
    read -rp "Press Enter to continue or Ctrl+C to exit and edit .env first: "
else
    echo "[OK] .env file found"
fi

echo ""
echo "Starting FastAPI server..."
echo "Server:      http://localhost:8010"
echo "API docs:    http://localhost:8010/docs"
echo ""
echo "Press Ctrl+C to stop"
echo ""

python -m uvicorn main:app --reload --host 0.0.0.0 --port 8010
