# Authentication & Database Integration Setup Guide

## Overview
Your seat allocation system now has full authentication integrated with a SQLite database backend.

## What's Been Set Up

### Backend (Python/Flask)
1. **`Backend/database.py`** - SQLite database handler
   - Creates users and sessions tables
   - Manages database connections
   
2. **`Backend/auth_service.py`** - Authentication service
   - Password hashing with bcrypt
   - JWT token generation and verification
   - User signup, login, profile updates
   
3. **`algo/app.py`** - Updated Flask app with auth endpoints
   - `POST /api/auth/signup` - Create new user account
   - `POST /api/auth/login` - Authenticate and get token
   - `GET /api/auth/profile` - Get current user profile (protected)
   - `PUT /api/auth/profile` - Update profile (protected)
   - `POST /api/auth/logout` - Logout

### Frontend (React)
1. **`Frontend/src/context/AuthContext.jsx`** - Updated context
   - Real API calls to backend
   - Token storage in localStorage
   - User data persistence
   - Profile update methods
   
2. **`Frontend/src/pages/LoginPage.jsx`** - Login page
   - Connected to real backend authentication
   
3. **`Frontend/src/pages/ProfilePage.jsx`** - Profile page
   - Displays actual user data
   - Edit profile functionality
   - Real-time data updates
   
4. **`Frontend/src/pages/SignupPage.jsx`** - Signup page
   - Creates accounts with username, email, password, role

## Installation & Running

### Backend Setup
```bash
cd algo
pip install -r requirements.txt
python app.py
```
**
cd Backend
python database.py (To initialize a new database)
**
The Flask server will run on `http://localhost:5000`

### Frontend Setup
```bash
cd Frontend
npm install
npm start
```
The React app will run on `http://localhost:3000`

## Database Details

### Users Table
```
id (PRIMARY KEY)
username (UNIQUE)
email (UNIQUE)
password (hashed with bcrypt)
role (STUDENT, ADMIN, FACULTY)
created_at (timestamp)
```

### Sessions Table
```
id (PRIMARY KEY)
user_id (FOREIGN KEY to users)
token (JWT token)
created_at (timestamp)
```

## API Endpoints

### Authentication

**Signup**
```
POST /api/auth/signup
Body: {
  "username": "john_doe",
  "email": "john@example.com",
  "password": "secure_password",
  "role": "STUDENT"
}
Response: { "success": true, "message": "Account created successfully" }
```

**Login**
```
POST /api/auth/login
Body: {
  "email": "john@example.com",
  "password": "secure_password"
}
Response: {
  "success": true,
  "token": "jwt_token_here",
  "user": {
    "id": 1,
    "name": "john_doe",
    "email": "john@example.com",
    "role": "STUDENT"
  }
}
```

**Get Profile** (Protected - requires Bearer token)
```
GET /api/auth/profile
Headers: { "Authorization": "Bearer <token>" }
Response: {
  "success": true,
  "user": { ... }
}
```

**Update Profile** (Protected)
```
PUT /api/auth/profile
Headers: { "Authorization": "Bearer <token>" }
Body: {
  "username": "new_username",
  "email": "new_email@example.com"
}
Response: {
  "success": true,
  "message": "Profile updated successfully",
  "user": { ... }
}
```

**Logout**
```
POST /api/auth/logout
Headers: { "Authorization": "Bearer <token>" }
Response: { "success": true, "message": "Logged out successfully" }
```

## Key Features

✅ **Secure Password Hashing** - bcrypt with salt
✅ **JWT Authentication** - Token-based auth
✅ **Protected Routes** - Backend endpoints protected with token middleware
✅ **User Registration** - Full signup flow
✅ **Profile Management** - View and edit user profiles
✅ **Session Management** - Login/logout functionality
✅ **CORS Enabled** - Frontend-backend communication
✅ **Database Persistence** - All data stored in SQLite

## Configuration

### Change API URL
If your backend runs on a different port/URL, update in `Frontend/src/context/AuthContext.jsx`:
```javascript
const API_BASE_URL = 'http://your-backend-url:port';
```

### Change JWT Secret (IMPORTANT FOR PRODUCTION)
In `Backend/auth_service.py`:
```python
SECRET_KEY = "your-secret-key-change-in-production"
```

## Testing the Flow

1. **Signup**: Visit signup page, create account
2. **Login**: Use credentials to login
3. **Profile**: View and edit profile information
4. **Logout**: Logout from account

## Next Steps

- [ ] Deploy to production
- [ ] Change JWT_SECRET_KEY for production
- [ ] Set up environment variables for API_URL
- [ ] Add email verification
- [ ] Add password reset functionality
- [ ] Implement 2FA (Two-Factor Authentication)
