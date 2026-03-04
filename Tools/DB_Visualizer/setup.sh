#!/bin/bash
# DB Visualizer Setup Script - Linux/Mac

set -e

echo "🚀 DB Visualizer - Automated Setup"
echo "===================================="

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Backend Setup
echo -e "${BLUE}Setting up Backend...${NC}"

cd backend

# Create virtual environment
if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install dependencies
echo "Installing Python dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

echo -e "${GREEN}✓ Backend setup complete${NC}"
echo "Start backend with: cd backend && source venv/bin/activate && python main.py"

# Frontend Setup
echo -e "${BLUE}Setting up Frontend...${NC}"

cd ../frontend

# Install dependencies
echo "Installing Node dependencies..."
npm install

echo -e "${GREEN}✓ Frontend setup complete${NC}"
echo "Start frontend with: cd frontend && npm run dev"

echo ""
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Open terminal 1: cd backend && source venv/bin/activate && python main.py"
echo "2. Open terminal 2: cd frontend && npm run dev"
echo "3. Open http://localhost:3000 in your browser"
echo "4. Upload a database file to get started"
