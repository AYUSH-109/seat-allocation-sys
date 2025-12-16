import sqlite3
import os
import secrets
from datetime import datetime, timedelta, timezone
import jwt
import bcrypt
from typing import Tuple, Optional, Dict
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# ============================================================================
# CONFIGURATION & INITIALIZATION
# ============================================================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, 'user_auth.db')

# FIX: Use a stable fallback key for development so server restarts don't log you out.
# In production, ALWAYS set JWT_SECRET_KEY in your .env file.
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-stable-secret-key-change-in-prod")
JWT_ALGORITHM = "HS256"
TOKEN_EXPIRATION_DAYS = 7

def init_user_database():
    """Initializes the SQLite database and creates the users table."""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'STUDENT',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
             # MIGRATION: Check if 'full_name' column exists, if not add it
        try:
            cursor.execute("SELECT full_name FROM users LIMIT 1")
        except sqlite3.OperationalError:
            print("⚠️ 'full_name' column missing. Migrating database...")
            cursor.execute("ALTER TABLE users ADD COLUMN full_name TEXT")
        conn.commit()
        conn.close()
        print(f"✅ Auth Database initialized at: {DB_PATH}")
    except Exception as e:
        print(f"❌ Failed to init Auth Database: {e}")

# Initialize on import
init_user_database()

# ============================================================================
# JWT HANDLERS
# ============================================================================

def create_auth_token(user_id: int, role: str) -> str:
    expiration_time = datetime.now(timezone.utc) + timedelta(days=TOKEN_EXPIRATION_DAYS)
    payload = {
        'exp': expiration_time,
        'iat': datetime.now(timezone.utc),
        'sub': str(user_id),
        'user_id': user_id,
        'role': role
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)

def verify_token(token: str) -> Optional[Dict]:
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None

# ============================================================================
# USER HELPERS
# ============================================================================

def get_user_by_email(email: str) -> Optional[Dict]:
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT id, username, email, password_hash, role,full_name FROM users WHERE email = ?", (email,))
        user_data = cursor.fetchone()
        conn.close()
        
        if user_data:
            return {
                "id": user_data[0],
                "username": user_data[1],
                "email": user_data[2],
                "password_hash": user_data[3],
                "role": user_data[4],
                "full_name": user_data[5],
}

    except Exception as e:
        print(f"Auth DB Error: {e}")
    return None

def get_user_by_token(token: str) -> Optional[Dict]:
    payload = verify_token(token)
    if not payload: return None
    
    user_id = payload.get('user_id')
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute(
    "SELECT id, username, email, role, full_name FROM users WHERE id = ?")
        user_data = cursor.fetchone()
        conn.close()
        
        if user_data:
            return {
                "id": user_data[0],
                "username": user_data[1],
                "email": user_data[2],
                "role": user_data[3],
                "full_name": user_data[4],
}
    except Exception:
        pass
    return None

# ============================================================================
# ENDPOINTS
# ============================================================================

def signup(username: str, email: str, password: str, role: str) -> Tuple[bool, str]:
    if not username or not email or not password:
        return False, "All fields are required."
    
    if get_user_by_email(email):
        return False, "User with this email already exists."
    
    password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)",
            (username, email, password_hash, role.upper())
        )
        conn.commit()
        conn.close()
        return True, "User registered successfully."
    except sqlite3.Error as e:
        return False, f"Database error: {str(e)}"

def login(email: str, password: str) -> Tuple[bool, Optional[Dict], str]:
    user = get_user_by_email(email)
    if not user:
        return False, None, "Invalid email or password."
    
    # Check password
    if bcrypt.checkpw(password.encode('utf-8'), user['password_hash'].encode('utf-8')):
        token = create_auth_token(user['id'], user['role'])
        user_data = {
                "id": user['id'],
                "username": user['username'],
                "email": user['email'],
                "role": user['role'],
                "full_name": user.get("full_name"),
            }

        return True, user_data, token
    else:
        return False, None, "Invalid email or password."

def update_user_profile(user_id: int, username: str = None, email: str = None) -> Tuple[bool, str]:
    updates = []
    params = []
    if username:
        updates.append("username = ?")
        params.append(username)
    if email:
        updates.append("email = ?")
        params.append(email)
        
    if not updates: return False, "No data provided."
        
    query = f"UPDATE users SET {', '.join(updates)} WHERE id = ?"
    params.append(user_id)
    
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute(query, tuple(params))
        conn.commit()
        conn.close()
        return True, "Profile updated successfully."
    except sqlite3.Error as e:
        return False, f"Update failed: {str(e)}"