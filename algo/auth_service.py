import sqlite3
import os
import secrets
from datetime import datetime, timedelta, timezone
import jwt
import bcrypt
from typing import Tuple, Optional, Dict
from dotenv import load_dotenv

# For Google OAuth
try:
    from google.auth.transport import requests
    from google.oauth2 import id_token
    GOOGLE_AUTH_AVAILABLE = True
except ImportError:
    GOOGLE_AUTH_AVAILABLE = False
    print("⚠️  Google auth library not installed. Run: pip install google-auth")

# Load environment variables
load_dotenv()

# ============================================================================
# CONFIGURATION & INITIALIZATION
# ============================================================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, 'user_auth.db')

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-stable-secret-key-change-in-prod")
JWT_ALGORITHM = "HS256"
TOKEN_EXPIRATION_DAYS = 7
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")

# ============================================================================
# ADMIN EMAIL LIST (Add admin emails here)
# ============================================================================
# When a user signs in with Google using these emails, they get ADMIN role
ADMIN_EMAILS = [
    "your-email@gmail.com",  # ← Add your admin email here
    "admin@example.com",      # ← Add other admin emails
]

def init_user_database():
    """Initializes the SQLite database and creates the users table."""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Create main users table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT,
                role TEXT NOT NULL DEFAULT 'STUDENT',
                full_name TEXT,
                auth_provider TEXT DEFAULT 'local',
                google_id TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # ========== SAFE DATABASE MIGRATIONS ==========
        try:
            cursor.execute("SELECT full_name FROM users LIMIT 1")
        except sqlite3.OperationalError:
            print("⚠️  Adding 'full_name' column...")
            cursor.execute("ALTER TABLE users ADD COLUMN full_name TEXT")
        
        try:
            cursor.execute("SELECT auth_provider FROM users LIMIT 1")
        except sqlite3.OperationalError:
            print("⚠️  Adding 'auth_provider' column...")
            cursor.execute("ALTER TABLE users ADD COLUMN auth_provider TEXT DEFAULT 'local'")
        
        try:
            cursor.execute("SELECT google_id FROM users LIMIT 1")
        except sqlite3.OperationalError:
            print("⚠️  Adding 'google_id' column...")
            cursor.execute("ALTER TABLE users ADD COLUMN google_id TEXT")
        
        try:
            cursor.execute("SELECT updated_at FROM users LIMIT 1")
        except sqlite3.OperationalError:
            print("⚠️  Adding 'updated_at' column...")
            cursor.execute("ALTER TABLE users ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
        
        # ========== CREATE UNIQUE INDEX FOR GOOGLE_ID ==========
        try:
            cursor.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS idx_google_id 
                ON users(google_id) 
                WHERE google_id IS NOT NULL
            """)
        except sqlite3.OperationalError:
            pass
        
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
    """Create JWT token for user"""
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
    """Verify JWT token"""
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None

# ============================================================================
# USER HELPERS
# ============================================================================

def get_user_by_email(email: str) -> Optional[Dict]:
    """Get user by email address"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, username, email, password_hash, role, full_name, auth_provider FROM users WHERE email = ?", 
            (email,)
        )
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
                "auth_provider": user_data[6],
            }
    except Exception as e:
        print(f"Auth DB Error: {e}")
    return None

def get_user_by_google_id(google_id: str) -> Optional[Dict]:
    """Get user by Google ID"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, username, email, role, full_name FROM users WHERE google_id = ?", 
            (google_id,)
        )
        user_data = cursor.fetchone()
        conn.close()
        
        if user_data:
            return {
                "id": user_data[0],
                "username": user_data[1],
                "email": user_data[2],
                "role": user_data[3],
                "fullName": user_data[4],
            }
    except Exception as e:
        print(f"Auth DB Error: {e}")
    return None

def get_user_by_token(token: str) -> Optional[Dict]:
    """Get user info from JWT token"""
    payload = verify_token(token)
    if not payload: 
        return None
    
    user_id = payload.get('user_id')
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, username, email, role, full_name FROM users WHERE id = ?",
            (user_id,)
        )
        user_data = cursor.fetchone()
        conn.close()
        
        if user_data:
            return {
                "id": user_data[0],
                "username": user_data[1],
                "email": user_data[2],
                "role": user_data[3],
                "fullName": user_data[4],
            }
    except Exception as e:
        print(f"Auth DB Error: {e}")
    return None

# ============================================================================
# AUTH FUNCTIONS
# ============================================================================

def signup(username: str, email: str, password: str, role: str) -> Tuple[bool, str]:
    """Sign up a new user with email/password"""
    if not username or not email or not password:
        return False, "All fields are required."
    
    if get_user_by_email(email):
        return False, "User with this email already exists."
    
    password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO users (username, email, password_hash, role, auth_provider) VALUES (?, ?, ?, ?, ?)",
            (username, email, password_hash, role.upper(), 'local')
        )
        conn.commit()
        conn.close()
        return True, "User registered successfully."
    except sqlite3.Error as e:
        return False, f"Database error: {str(e)}"

def login(email: str, password: str) -> Tuple[bool, Optional[Dict], str]:
    """Login user with email/password"""
    user = get_user_by_email(email)
    if not user:
        return False, None, "Invalid email or password."
    
    # Check password
    if not user.get('password_hash'):
        return False, None, "User registered via Google. Use Google sign-in."
    
    if bcrypt.checkpw(password.encode('utf-8'), user['password_hash'].encode('utf-8')):
        token = create_auth_token(user['id'], user['role'])
        user_data = {
            "id": user['id'],
            "username": user['username'],
            "email": user['email'],
            "role": user['role'],
            "fullName": user.get("full_name"),
        }
        return True, user_data, token
    else:
        return False, None, "Invalid email or password."

def update_user_profile(user_id: int, username: str = None, email: str = None) -> Tuple[bool, str]:
    """Update user profile (username and email only)"""
    updates = []
    params = []
    
    if username:
        updates.append("username = ?")
        params.append(username)
    if email:
        updates.append("email = ?")
        params.append(email)
        
    if not updates: 
        return False, "No data provided."
    
    # Add updated_at timestamp
    updates.append("updated_at = CURRENT_TIMESTAMP")
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

# ============================================================================
# GOOGLE OAUTH (WITH ADMIN ROLE SUPPORT)
# ============================================================================

def google_auth_handler(token: str) -> Tuple[bool, Optional[Dict], str]:
    """
    Handle Google OAuth token verification and user creation/update.
    Users with emails in ADMIN_EMAILS list get ADMIN role.
    """
    
    if not GOOGLE_AUTH_AVAILABLE:
        return False, "Google auth library not installed", ""
    
    if not GOOGLE_CLIENT_ID:
        return False, "Google Client ID not configured", ""
    
    try:
        # Verify Google token
        idinfo = id_token.verify_oauth2_token(token, requests.Request(), GOOGLE_CLIENT_ID)
        
        google_id = idinfo.get('sub')
        email = idinfo.get('email')
        full_name = idinfo.get('name', '')
        picture = idinfo.get('picture')
        
        if not google_id or not email:
            return False, "Invalid Google token", ""
        
        # ========== DETERMINE ROLE ==========
        # Check if email is in admin list
        if email.lower() in [admin_email.lower() for admin_email in ADMIN_EMAILS]:
            user_role = 'ADMIN'
            print(f"👑 Admin user detected: {email}")
        else:
            user_role = 'STUDENT'
        
        # Check if user exists by email
        existing_user = get_user_by_email(email)
        
        if existing_user:
            # User already exists
            user = existing_user
            user_id = user['id']
            
            # Update google_id if not set, and update role if needed
            try:
                conn = sqlite3.connect(DB_PATH)
                cursor = conn.cursor()
                
                updates = []
                params = []
                
                if not existing_user.get('google_id'):
                    updates.append("google_id = ?")
                    params.append(google_id)
                
                # Update role if user was STUDENT and is now in ADMIN list
                if existing_user.get('role') == 'STUDENT' and user_role == 'ADMIN':
                    updates.append("role = ?")
                    params.append('ADMIN')
                    print(f"📝 Updated {email} to ADMIN role")
                
                if updates:
                    updates.append("auth_provider = 'google'")
                    query = f"UPDATE users SET {', '.join(updates)} WHERE id = ?"
                    params.append(user_id)
                    cursor.execute(query, tuple(params))
                    conn.commit()
                
                conn.close()
            except Exception as e:
                print(f"Warning: Could not update user: {e}")
            
            # Use actual role from database
            user_role = existing_user.get('role', user_role)
        else:
            # Create new user from Google data
            username = email.split('@')[0]  # Use email prefix as username
            
            try:
                conn = sqlite3.connect(DB_PATH)
                cursor = conn.cursor()
                cursor.execute(
                    """INSERT INTO users 
                       (username, email, full_name, auth_provider, google_id, role) 
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    (username, email, full_name, 'google', google_id, user_role)
                )
                conn.commit()
                user_id = cursor.lastrowid
                conn.close()
                
                role_text = "ADMIN 👑" if user_role == 'ADMIN' else "STUDENT"
                print(f"✅ New user created: {email} ({role_text})")
            except sqlite3.Error as e:
                return False, f"Database error: {str(e)}", ""
            
            user = {
                "id": user_id,
                "username": username,
                "email": email,
                "role": user_role,
                "full_name": full_name,
            }
        
        # Create JWT token
        auth_token = create_auth_token(user_id, user_role)
        
        user_data = {
            "id": user.get('id', user_id),
            "username": user.get('username', email.split('@')[0]),
            "email": user.get('email', email),
            "role": user_role,
            "fullName": user.get('full_name', full_name),
        }
        
        return True, user_data, auth_token
        
    except Exception as e:
        print(f"Google auth error: {e}")
        return False, f"Google authentication failed: {str(e)}", ""

if __name__ == "__main__":
    print("✅ Auth service module loaded successfully")