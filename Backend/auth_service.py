"""
auth_service.py

Authentication service for user login, signup, and token management.
Uses bcrypt for password hashing and JWT for token generation.
"""

import jwt
import bcrypt
from datetime import datetime, timedelta
from typing import Optional, Dict, Tuple
from database import get_db, init_db

# JWT configuration
SECRET_KEY = "your-secret-key-change-in-production"  # Change this in production!
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 7


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))


def create_access_token(user_id: int, email: str, username: str) -> str:
    """Create a JWT access token."""
    payload = {
        'user_id': user_id,
        'email': email,
        'username': username,
        'exp': datetime.utcnow() + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS),
        'iat': datetime.utcnow()
    }
    token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
    return token


def verify_token(token: str) -> Optional[Dict]:
    """Verify a JWT token and return its payload."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def signup(username: str, email: str, password: str, role: str = 'STUDENT') -> Tuple[bool, str]:
    """
    Create a new user account.
    Returns: (success: bool, message: str)
    """
    if not username or not email or not password:
        return False, "Username, email, and password are required"
    
    # Validate password length
    if len(password) < 6:
        return False, "Password must be at least 6 characters"
    
    try:
        conn = get_db()
        cur = conn.cursor()
        
        # Check if user already exists
        cur.execute("SELECT id FROM users WHERE username = ? OR email = ?", (username, email))
        if cur.fetchone():
            conn.close()
            return False, "Username or email already exists"
        
        # Hash password
        hashed_password = hash_password(password)
        
        # Insert new user
        cur.execute(
            "INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)",
            (username, email, hashed_password, role)
        )
        conn.commit()
        conn.close()
        
        return True, "Account created successfully"
    except Exception as e:
        return False, f"Signup failed: {str(e)}"


def login(email: str, password: str) -> Tuple[bool, Optional[Dict], str]:
    """
    Authenticate a user and return a token.
    Returns: (success: bool, user_data: dict or None, message: str)
    """
    if not email or not password:
        return False, None, "Email and password are required"
    
    try:
        conn = get_db()
        cur = conn.cursor()
        
        # Fetch user by email
        cur.execute("SELECT id, username, email, password, role FROM users WHERE email = ?", (email,))
        user = cur.fetchone()
        conn.close()
        
        if not user:
            return False, None, "Invalid email or password"
        
        # Verify password
        if not verify_password(password, user['password']):
            return False, None, "Invalid email or password"
        
        # Create token
        token = create_access_token(user['id'], user['email'], user['username'])
        
        # Prepare user data
        user_data = {
            'id': user['id'],
            'name': user['username'],
            'email': user['email'],
            'role': user['role']
        }
        
        return True, user_data, token
    except Exception as e:
        return False, None, f"Login failed: {str(e)}"


def get_user_by_token(token: str) -> Optional[Dict]:
    """
    Get user info from a valid token.
    Returns: user data dict or None if token is invalid
    """
    payload = verify_token(token)
    if not payload:
        return None
    
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT id, username, email, role FROM users WHERE id = ?", (payload['user_id'],))
        user = cur.fetchone()
        conn.close()
        
        if not user:
            return None
        
        return {
            'id': user['id'],
            'name': user['username'],
            'email': user['email'],
            'role': user['role']
        }
    except Exception as e:
        return None


def update_user_profile(user_id: int, username: str = None, email: str = None) -> Tuple[bool, str]:
    """
    Update user profile information.
    Returns: (success: bool, message: str)
    """
    try:
        conn = get_db()
        cur = conn.cursor()
        
        # Build update query dynamically
        updates = []
        params = []
        
        if username:
            updates.append("username = ?")
            params.append(username)
        
        if email:
            updates.append("email = ?")
            params.append(email)
        
        if not updates:
            conn.close()
            return False, "No updates provided"
        
        params.append(user_id)
        query = f"UPDATE users SET {', '.join(updates)} WHERE id = ?"
        
        cur.execute(query, params)
        conn.commit()
        conn.close()
        
        return True, "Profile updated successfully"
    except Exception as e:
        return False, f"Update failed: {str(e)}"


# Initialize database on module import
init_db()
