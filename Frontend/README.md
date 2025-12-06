# Frontend  Guide

**Date**: December 6, 2025  
**Status**: ✅ Setup Complete (Node.js Required)


---


 ## Frontend (React)
- **Location**: `Frontend/` folder  
- **Technology**: React 19.2.0 + Tailwind CSS
- **Status**: ⏳ Needs Node.js to run
- **Current**: Standalone (no backend connection yet)
- **Purpose**: Modern UI for seat allocation

---

## 🚀 How to Run 


### Run Frontend  (After Node.js)
```bash
cd Frontend
npm install
npm start
# Opens http://localhost:3000
```

---


## 🔌 Current Architecture

```
Algo/                          Frontend/
├── index.html ───┐           ├── src/
│                 │           │   ├── components/
│ (UI + Logic)    │           │   ├── pages/
│ (PDF Gen)       │           │   └── App.js
└─────────────────┼───────────┴─ (UI components)
                  │
                  NO CONNECTION YET
```

---


## 📂 File Locations Quick Reference

| Component | Path |
|-----------|------|
| Algo UI | `algo/index.html` |
| Algo Logic | `algo/algo.py` |
| PDF Generation | `algo/index.html` (lines ~390-650) |
| Frontend App | `Frontend/src/App.js` |
| React Components | `Frontend/src/components/` |
| Frontend Config | `Frontend/package.json` |
| Tailwind Config | `Frontend/tailwind.config.js` |

---

## 💾 Storage of Seating Data

Currently data is **NOT PERSISTENT**:
- Generated seating stored in browser memory
- Lost on page refresh
- No database

To add persistence:
1. Create backend API with database
2. Store seating arrangements in database
3. Retrieve from backend when needed
4. Export to PDF as needed

---

## ⚡ Performance Notes

- **Algo**: Fast (runs immediately, no setup)
- **Frontend**: Requires Node.js (slower startup)
- **Combined**: Both can run on localhost simultaneously

---

## 🎓 Summary

| Task | Status | How |
|------|--------|-----|
| Run algo/backend | ✅ Ready | Open `algo/index.html` |
| Run frontend | ⏳ Blocked | Install Node.js first |
| Connect them | ⏳ Planned | Create API endpoints |
| Minimal chat usage | ✅ Done | Using brief docs |

---

## 📞 Quick Commands

```bash
# Frontend setup (after Node.js installed)
cd Frontend && npm install && npm start

# Backend (already ready)
# Just open algo/index.html in browser

# Check Node.js
node --version
npm --version

# Stop development server
# Ctrl + C in terminal
```

---

**Created**: 6 December 2025  
**Status**: ✅ Documentation Complete  
**Action Needed**: Install Node.js on syste