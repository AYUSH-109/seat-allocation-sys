# Authentication service providing JWT-based security and user management.
# Handles login, signup, role-based access control, and Google OAuth integration.
import sqlite3
import os
import secrets
import time
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

from algo.config.settings import Config

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-stable-secret-key-change-in-prod")
JWT_ALGORITHM = "HS256"
TOKEN_EXPIRATION_DAYS = 7
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")

# Production safety check
if os.getenv('FLASK_ENV') == 'production' and JWT_SECRET_KEY == "dev-stable-secret-key-change-in-prod":
    print("⚠️  CRITICAL: Using default JWT_SECRET_KEY in production! Set JWT_SECRET_KEY env variable.")

# ============================================================================
# ROLE DEFINITIONS
# ============================================================================
# Roles must match the users table CHECK constraint in schema.py
VALID_ROLES = ['developer', 'admin', 'faculty', 'STUDENT', 'ADMIN', 'TEACHER', 'FACULTY']
VALID_ROLES_LOWERCASE = ['developer', 'admin', 'faculty']
DEFAULT_ROLE = 'faculty'

def _get_conn():
    """Get a standalone connection to the consolidated database."""
    conn = sqlite3.connect(str(Config.DB_PATH), timeout=20)
    conn.row_factory = sqlite3.Row
    return conn

# ============================================================================
# ADMIN EMAIL LIST (Optional: auto-assign developer role to these emails)
# ============================================================================
ADMIN_EMAILS = [
    # Add admin emails here — they will be auto-assigned 'developer' role on Google signup
]

# Temporary cache for role-selection continuation in Google signup flow.
# Key: signup_token, Value: {'google_id', 'email', 'full_name', 'expires_at'}
PENDING_GOOGLE_SIGNUPS = {}
PENDING_GOOGLE_SIGNUP_TTL_SECONDS = 15 * 60


def _cleanup_pending_google_signups() -> None:
    now = time.time()
    expired = [k for k, v in PENDING_GOOGLE_SIGNUPS.items() if v.get('expires_at', 0) <= now]
    for key in expired:
        PENDING_GOOGLE_SIGNUPS.pop(key, None)


def _create_pending_google_signup(*, google_id: str, email: str, full_name: str) -> str:
    _cleanup_pending_google_signups()
    signup_token = secrets.token_urlsafe(32)
    PENDING_GOOGLE_SIGNUPS[signup_token] = {
        'google_id': google_id,
        'email': email,
        'full_name': full_name,
        'expires_at': time.time() + PENDING_GOOGLE_SIGNUP_TTL_SECONDS,
    }
    return signup_token


def _consume_pending_google_signup(signup_token: str) -> Optional[Dict]:
    _cleanup_pending_google_signups()
    payload = PENDING_GOOGLE_SIGNUPS.pop(signup_token, None)
    if not payload:
        return None
    if payload.get('expires_at', 0) <= time.time():
        return None
    return payload

def token_required(f):
    """Decorator to require valid JWT token"""
    from functools import wraps
    from flask import request, jsonify
    
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            if auth_header.startswith('Bearer '):
                token = auth_header.split(" ")[1]
        
        if not token:
            return jsonify({'message': 'Token is missing!'}), 401
            
        try:
            payload = verify_token(token)
            if not payload:
                return jsonify({'message': 'Token is invalid or expired!'}), 401

            user_id = payload.get('user_id')
            token_role = payload.get('role')

            # Prefer live role from DB so role changes apply immediately.
            db_user = get_user_by_id(user_id) if user_id else None
            resolved_role = _normalize_role(db_user.get('role')) if db_user else _normalize_role(token_role)

            # Set user info on request object
            request.user_id = user_id
            request.user_role = resolved_role
        except Exception as e:
            return jsonify({'message': f'Error verifying token: {str(e)}'}), 401
            
        return f(*args, **kwargs)
    
    return decorated

def admin_required(f):
    """Decorator to require admin-level role. Must be used AFTER @token_required."""
    from functools import wraps
    from flask import request, jsonify
    
    @wraps(f)
    def decorated(*args, **kwargs):
        user_role = getattr(request, 'user_role', None)
        if user_role not in ('developer', 'admin', 'ADMIN'):
            return jsonify({'status': 'error', 'message': 'Admin access required'}), 403
        return f(*args, **kwargs)
    
    return decorated

def role_required(*allowed_roles):
    """Decorator to restrict access to specific roles. Must be used AFTER @token_required.
    Usage: @token_required\n           @role_required('developer', 'admin')"""
    from functools import wraps
    from flask import request, jsonify
    
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            user_role = getattr(request, 'user_role', DEFAULT_ROLE)
            if user_role not in allowed_roles:
                return jsonify({
                    'status': 'error',
                    'message': f'Access denied. Required role: {", ".join(allowed_roles)}',
                    'required_roles': list(allowed_roles)
                }), 403
            return f(*args, **kwargs)
        return decorated
    return decorator

# No separate init needed — schema.py handles the unified users table via ensure_demo_db()

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
        conn = _get_conn()
        row = conn.execute(
            "SELECT id, username, email, password_hash, role, full_name, auth_provider FROM users WHERE email = ?", 
            (email,)
        ).fetchone()
        conn.close()
        return dict(row) if row else None
    except Exception as e:
        print(f"Auth DB Error: {e}")
    return None

def get_user_by_id(user_id: int) -> Optional[Dict]:
    """Get user by ID"""
    try:
        conn = _get_conn()
        row = conn.execute(
            "SELECT id, username, email, role, full_name, auth_provider FROM users WHERE id = ?", 
            (user_id,)
        ).fetchone()
        conn.close()
        if row:
            return {
                "id": row["id"],
                "username": row["username"],
                "email": row["email"],
                "role": row["role"],
                "fullName": row["full_name"],
                "auth_provider": row["auth_provider"]
            }
    except Exception as e:
        print(f"Auth DB Error: {e}")
    return None

def get_user_by_google_id(google_id: str) -> Optional[Dict]:
    """Get user by Google ID"""
    try:
        conn = _get_conn()
        row = conn.execute(
            "SELECT id, username, email, role, full_name FROM users WHERE google_id = ?", 
            (google_id,)
        ).fetchone()
        conn.close()
        if row:
            return {
                "id": row["id"],
                "username": row["username"],
                "email": row["email"],
                "role": row["role"],
                "fullName": row["full_name"],
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
        conn = _get_conn()
        row = conn.execute(
            "SELECT id, username, email, role, full_name FROM users WHERE id = ?",
            (user_id,)
        ).fetchone()
        conn.close()
        if row:
            return {
                "id": row["id"],
                "username": row["username"],
                "email": row["email"],
                "role": row["role"],
                "fullName": row["full_name"],
            }
    except Exception as e:
        print(f"Auth DB Error: {e}")
    return None

# ============================================================================
# AUTH FUNCTIONS
# ============================================================================

def signup(username: str, email: str, password: str, role: str = "faculty") -> Tuple[bool, Dict, str]:
    """
    Sign up a new user with email/password.
    Role must be one of: developer, admin, faculty.
    
    Returns:
        (success: bool, user_data: dict or error_msg: str, token: str or empty_string)
    """
    if not username or not email or not password:
        return False, "All fields are required.", ""
    
    # Validate and normalize role to lowercase
    selected_role = role.lower() if role else DEFAULT_ROLE
    if selected_role not in VALID_ROLES_LOWERCASE:
        return False, f"Invalid role. Must be one of: {', '.join(VALID_ROLES_LOWERCASE)}", ""
    
    if get_user_by_email(email):
        return False, "User with this email already exists.", ""
    
    password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
    try:
        conn = _get_conn()
        # Ensure database is not locked
        conn.execute("PRAGMA busy_timeout=20000")
        conn.execute("PRAGMA journal_mode=WAL")
        
        cursor = conn.execute(
            """INSERT INTO users 
               (username, email, password_hash, role, auth_provider) 
               VALUES (?, ?, ?, ?, ?)""",
            (username, email, password_hash, selected_role, 'local')
        )
        conn.commit()
        user_id = cursor.lastrowid
        conn.close()
        
        # Create auth token immediately
        token = create_auth_token(user_id, selected_role)
        
        user_data = {
            "id": user_id,
            "username": username,
            "email": email,
            "role": selected_role,
            "fullName": "",
        }
        
        print(f"✅ User registered: {email} (role: {selected_role})")
        return True, user_data, token
        
    except sqlite3.Error as e:
        error_msg = f"Database error: {str(e)}"
        print(f"❌ Signup error: {error_msg}")
        return False, error_msg, ""

def _normalize_role(role_str):
    """Normalize legacy role strings to new system."""
    role_map = {
        'ADMIN': 'admin', 'FACULTY': 'faculty', 'STUDENT': 'faculty',
        'user': 'faculty', 'User': 'faculty',
    }
    if role_str in VALID_ROLES:
        return role_str
    return role_map.get(role_str, DEFAULT_ROLE)

def login(email: str, password: str) -> Tuple[bool, Optional[Dict], str]:
    """Login user with email/password"""
    user = get_user_by_email(email)
    if not user:
        return False, "Invalid email or password.", ""
    
    # Check password
    if not user.get('password_hash'):
        return False, "User registered via Google. Use Google sign-in.", ""
    
    if bcrypt.checkpw(password.encode('utf-8'), user['password_hash'].encode('utf-8')):
        role = _normalize_role(user['role'])
        token = create_auth_token(user['id'], role)
        user_data = {
            "id": user['id'],
            "username": user['username'],
            "email": user['email'],
            "role": role,
            "fullName": user.get("full_name"),
        }
        return True, user_data, token
    else:
        return False, "Invalid email or password.", ""

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
        conn = _get_conn()
        conn.execute(query, tuple(params))
        conn.commit()
        conn.close()
        return True, "Profile updated successfully."
    except sqlite3.Error as e:
        return False, f"Update failed: {str(e)}"

# ============================================================================
# GOOGLE OAUTH (WITH ADMIN ROLE SUPPORT)
# ============================================================================

def google_auth_handler(token: str, role: str = None, signup_token: str = None) -> Tuple[bool, Optional[Dict], str]:
    """
    Handle Google OAuth token verification and user creation/update.
    - Existing users: log in with their stored role (role param ignored).
    - New users: require role selection. If role not provided, returns needs_role=True.
    """
    
    if not GOOGLE_AUTH_AVAILABLE:
        return False, "Google auth library not installed", ""
    
    if not GOOGLE_CLIENT_ID:
        return False, "Google Client ID not configured", ""
    
    # Normalize role to lowercase for consistency
    if role:
        role = role.lower()
    
    try:
        google_id = None
        email = None
        full_name = ''

        # Continue signup using server-issued pending token when role is chosen.
        if signup_token and role in VALID_ROLES_LOWERCASE:
            pending = _consume_pending_google_signup(signup_token)
            if not pending:
                return False, "Signup session expired. Please sign in with Google again.", ""
            google_id = pending.get('google_id')
            email = pending.get('email')
            full_name = pending.get('full_name', '')
        else:
            # Verify Google token
            idinfo = id_token.verify_oauth2_token(token, requests.Request(), GOOGLE_CLIENT_ID)

            google_id = idinfo.get('sub')
            email = idinfo.get('email')
            full_name = idinfo.get('name', '')

            if not google_id or not email:
                return False, "Invalid Google token", ""
        
        # Check if user exists by email
        existing_user = get_user_by_email(email)
        
        if existing_user:
            # ========== EXISTING USER — LOGIN ==========
            user = existing_user
            user_id = user['id']
            user_role = _normalize_role(user.get('role', DEFAULT_ROLE))
            
            # Update google_id if not set
            try:
                conn = _get_conn()
                updates = []
                params = []
                
                if not existing_user.get('google_id'):
                    updates.append("google_id = ?")
                    params.append(google_id)
                
                # Normalize role in DB if it was a legacy value
                if user.get('role') != user_role:
                    updates.append("role = ?")
                    params.append(user_role)
                
                if updates:
                    updates.append("auth_provider = 'google'")
                    updates.append("updated_at = CURRENT_TIMESTAMP")
                    query = f"UPDATE users SET {', '.join(updates)} WHERE id = ?"
                    params.append(user_id)
                    conn.execute(query, tuple(params))
                    conn.commit()
                
                conn.close()
            except Exception as e:
                print(f"Warning: Could not update user: {e}")
            
            auth_token = create_auth_token(user_id, user_role)
            
            user_data = {
                "id": user.get('id', user_id),
                "username": user.get('username', email.split('@')[0]),
                "email": user.get('email', email),
                "role": user_role,
                "fullName": user.get('full_name', full_name),
                "is_new_user": False,
            }
            
            print(f"✅ Google login: {email} (role: {user_role})")
            return True, user_data, auth_token
        
        else:
            # ========== NEW USER — NEEDS ROLE SELECTION ==========
            
            # Auto-assign developer role for ADMIN_EMAILS
            if email.lower() in [ae.lower() for ae in ADMIN_EMAILS]:
                role = 'developer'
                print(f"👑 Auto-assigning developer role (ADMIN_EMAILS): {email}")
            
            # If no role provided, tell frontend to ask
            if not role or role not in VALID_ROLES:
                pending_signup_token = _create_pending_google_signup(
                    google_id=google_id,
                    email=email,
                    full_name=full_name,
                )
                return True, {
                    "needs_role": True,
                    "email": email,
                    "full_name": full_name,
                    "google_id": google_id,
                    "signup_token": pending_signup_token,
                }, ""
            
            # Create new user with selected role
            username = email.split('@')[0]
            
            try:
                conn = _get_conn()
                cursor = conn.execute(
                    """INSERT INTO users 
                       (username, email, full_name, auth_provider, google_id, role) 
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    (username, email, full_name, 'google', google_id, role)
                )
                conn.commit()
                user_id = cursor.lastrowid
                conn.close()
                
                print(f"✅ New Google user created: {email} (role: {role})")
            except sqlite3.Error as e:
                return False, f"Database error: {str(e)}", ""
            
            auth_token = create_auth_token(user_id, role)
            
            user_data = {
                "id": user_id,
                "username": username,
                "email": email,
                "role": role,
                "fullName": full_name,
                "is_new_user": True,
            }
            
            return True, user_data, auth_token
        
    except Exception as e:
        print(f"Google auth error: {e}")
        return False, f"Google authentication failed: {str(e)}", ""

if __name__ == "__main__":
    print("✅ Auth service module loaded successfully")