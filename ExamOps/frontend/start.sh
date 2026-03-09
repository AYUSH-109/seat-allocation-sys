#!/usr/bin/env bash
# Start Frontend Server
# Run this script from the frontend directory

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "====================================="
echo "Exam Invigilation System - Frontend"
echo "====================================="
echo ""

if [ ! -f "index.html" ]; then
    echo "[!] Error: index.html not found"
    echo "    Make sure you're running from the frontend directory"
    exit 1
fi

echo "[OK] Frontend files found"
echo ""
echo "Starting HTTP server..."
echo "Frontend:  http://localhost:3000"
echo ""
echo "IMPORTANT: Make sure the backend is running at http://localhost:8010"
echo ""
echo "Press Ctrl+C to stop"
echo ""

python3 -m http.server 3000
