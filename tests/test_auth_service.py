"""
Test Suite 3: Authentication Service
======================================
Tests the auth_service module functions directly and through the API:
- Signup (local), login, profile fetch, profile update
- JWT token generation, verification, and expiry
- Password hashing with bcrypt
- Role-based access (developer, admin, faculty)
- Edge cases (duplicate email, missing fields, wrong password)
- Google OAuth handler logic (mocked)
- token_required / admin_required decorators
"""
import pytest
import time
import jwt as pyjwt
from unittest.mock import patch, MagicMock
from conftest import _auth_header, _signup_user, _login_user


# ============================================================================
# SIGNUP
# ============================================================================

class TestSignup:
    """User registration via /api/auth/signup."""

    def test_signup_success(self, client):
        """Valid signup returns user data and token."""
        resp = client.post("/api/auth/signup", json={
            "username": "newuser",
            "email": "new@test.com",
            "password": "StrongPass1!",
        })
        data = resp.get_json()
        assert resp.status_code == 200, f"Signup failed: {data}"
        assert data.get("token") is not None
        assert data.get("user", {}).get("email") == "new@test.com"

    def test_signup_default_role_is_faculty(self, client):
        """Without a role param, the default role should be faculty."""
        resp = client.post("/api/auth/signup", json={
            "username": "defrole",
            "email": "defrole@test.com",
            "password": "Pass123!",
        })
        data = resp.get_json()
        user = data.get("user", {})
        assert user.get("role") == "faculty"

    def test_signup_with_admin_role(self, client):
        """Signup with explicit admin role."""
        resp = client.post("/api/auth/signup", json={
            "username": "adminuser",
            "email": "admin@test.com",
            "password": "Admin123!",
            "role": "admin",
        })
        data = resp.get_json()
        assert resp.status_code == 200
        assert data.get("user", {}).get("role") == "admin"

    def test_signup_duplicate_email_rejected(self, client):
        """Registering with an existing email should fail."""
        client.post("/api/auth/signup", json={
            "username": "first", "email": "dup@test.com", "password": "Pass123!",
        })
        resp = client.post("/api/auth/signup", json={
            "username": "second", "email": "dup@test.com", "password": "Pass456!",
        })
        assert resp.status_code in (400, 409), \
            f"Duplicate email should be rejected, got {resp.status_code}"

    def test_signup_missing_fields(self, client):
        """Signup with missing required fields should fail."""
        # Missing password
        resp = client.post("/api/auth/signup", json={
            "username": "incomplete",
            "email": "inc@test.com",
        })
        assert resp.status_code in (400, 422, 500)

    def test_signup_missing_email(self, client):
        """Signup without email should fail."""
        resp = client.post("/api/auth/signup", json={
            "username": "noemail",
            "password": "Pass123!",
        })
        assert resp.status_code in (400, 422, 500)


# ============================================================================
# LOGIN
# ============================================================================

class TestLogin:
    """User login via /api/auth/login."""

    def test_login_success(self, client):
        """Correct credentials return a token."""
        _signup_user(client, "logintest", "login@test.com", "Pass123!")
        resp = client.post("/api/auth/login", json={
            "email": "login@test.com",
            "password": "Pass123!",
        })
        data = resp.get_json()
        assert resp.status_code == 200, f"Login failed: {data}"
        assert data.get("token") is not None

    def test_login_wrong_password(self, client):
        """Wrong password returns 401."""
        _signup_user(client, "wrongpw", "wp@test.com", "Correct1!")
        resp = client.post("/api/auth/login", json={
            "email": "wp@test.com",
            "password": "WrongPassword!",
        })
        assert resp.status_code == 401

    def test_login_nonexistent_email(self, client):
        """Login with an email that doesn't exist returns 401."""
        resp = client.post("/api/auth/login", json={
            "email": "ghost@test.com",
            "password": "Anything123!",
        })
        assert resp.status_code == 401

    def test_login_returns_correct_role(self, client):
        """Login response includes the correct role."""
        _signup_user(client, "rolecheck", "role@test.com", "Pass123!", "faculty")
        resp = client.post("/api/auth/login", json={
            "email": "role@test.com",
            "password": "Pass123!",
        })
        data = resp.get_json()
        user = data.get("user", {})
        assert user.get("role") == "faculty"


# ============================================================================
# JWT TOKEN
# ============================================================================

class TestJWTToken:
    """JWT token generation and verification."""

    def test_token_contains_user_id(self, client):
        """Token payload should contain user_id and role."""
        from algo.services.auth_service import verify_token

        user, token = _signup_user(client, "jwttest", "jwt@test.com", "Pass123!")
        payload = verify_token(token)
        assert payload is not None
        assert payload.get("user_id") == user["id"]

    def test_token_contains_role(self, client):
        """Token payload should contain the user's role."""
        from algo.services.auth_service import verify_token

        user, token = _signup_user(client, "roletoken", "rtok@test.com", "Pass123!", "admin")
        payload = verify_token(token)
        assert payload.get("role") == "admin"

    def test_expired_token_rejected(self, client):
        """An expired token should be rejected."""
        from algo.services.auth_service import JWT_SECRET_KEY, JWT_ALGORITHM
        from datetime import datetime, timedelta, timezone

        expired_payload = {
            "exp": datetime.now(timezone.utc) - timedelta(hours=1),
            "iat": datetime.now(timezone.utc) - timedelta(hours=2),
            "sub": "999",
            "user_id": 999,
            "role": "faculty",
        }
        expired_token = pyjwt.encode(expired_payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)

        resp = client.get("/api/auth/profile",
                          headers=_auth_header(expired_token))
        assert resp.status_code == 401

    def test_invalid_token_rejected(self, client):
        """A malformed token should be rejected."""
        resp = client.get("/api/auth/profile",
                          headers={"Authorization": "Bearer not.a.valid.token"})
        assert resp.status_code == 401

    def test_missing_auth_header(self, client):
        """No Authorization header should return 401."""
        resp = client.get("/api/auth/profile")
        assert resp.status_code == 401


# ============================================================================
# PROFILE
# ============================================================================

class TestProfile:
    """Profile retrieval and update."""

    def test_get_profile(self, client, user_a):
        """GET /api/auth/profile returns the logged-in user's data."""
        resp = client.get("/api/auth/profile",
                          headers=_auth_header(user_a["token"]))
        assert resp.status_code == 200
        data = resp.get_json()
        profile = data.get("user") or data
        assert profile.get("email") == user_a["email"]

    def test_update_profile_username(self, client, user_a):
        """PUT /api/auth/profile can update the username."""
        resp = client.put("/api/auth/profile",
                          json={"username": "alice_updated"},
                          headers=_auth_header(user_a["token"]))
        assert resp.status_code == 200

        # Verify update
        resp2 = client.get("/api/auth/profile",
                           headers=_auth_header(user_a["token"]))
        profile = resp2.get_json().get("user") or resp2.get_json()
        assert profile.get("username") == "alice_updated"


# ============================================================================
# ADMIN-REQUIRED DECORATOR
# ============================================================================

class TestAdminRequired:
    """The admin_required decorator should gate admin-only endpoints."""

    def test_admin_can_access_admin_endpoint(self, client, user_a):
        """admin user can access admin-only endpoints."""
        # user_a is admin
        resp = client.get("/api/database/overview",
                          headers=_auth_header(user_a["token"]))
        # Should be 200 or some non-403 status
        assert resp.status_code != 403

    def test_faculty_cannot_access_admin_endpoint(self, client, user_b):
        """faculty user should be denied admin-only endpoints."""
        # The admin data management endpoints in database_bp require admin
        resp = client.get("/api/admin/sessions",
                          headers=_auth_header(user_b["token"]))
        # Should be 403 Forbidden
        assert resp.status_code in (403, 401, 404), \
            f"faculty should be denied admin access, got {resp.status_code}"


# ============================================================================
# PASSWORD HASHING
# ============================================================================

class TestPasswordHashing:
    """Verify bcrypt is used for password storage."""

    def test_password_stored_as_hash(self, client, tmp_db):
        """Password should be stored as a bcrypt hash, not plaintext."""
        import sqlite3

        _signup_user(client, "hashtest", "hash@test.com", "MyPassword123!")
        conn = sqlite3.connect(str(tmp_db))
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT password_hash FROM users WHERE email=?", ("hash@test.com",)
        ).fetchone()
        conn.close()

        assert row is not None
        pw_hash = row["password_hash"]
        assert pw_hash != "MyPassword123!", "Password should NOT be stored in plaintext"
        assert pw_hash.startswith("$2"), "Password should be a bcrypt hash (starts with $2)"

    def test_different_users_different_hashes(self, client, tmp_db):
        """Two users with the same password should have different hashes (salt)."""
        import sqlite3

        _signup_user(client, "hash1", "h1@test.com", "SamePassword!")
        _signup_user(client, "hash2", "h2@test.com", "SamePassword!")

        conn = sqlite3.connect(str(tmp_db))
        conn.row_factory = sqlite3.Row
        h1 = conn.execute("SELECT password_hash FROM users WHERE email=?", ("h1@test.com",)).fetchone()
        h2 = conn.execute("SELECT password_hash FROM users WHERE email=?", ("h2@test.com",)).fetchone()
        conn.close()

        assert h1["password_hash"] != h2["password_hash"], \
            "Same password should produce different hashes (bcrypt salt)"


# ============================================================================
# GOOGLE OAUTH (MOCKED)
# ============================================================================

class TestGoogleOAuth:
    """Google OAuth handler with mocked token verification."""

    def test_google_auth_not_available_error(self, client):
        """When google-auth library isn't available, should return error."""
        with patch("algo.services.auth_service.GOOGLE_AUTH_AVAILABLE", False):
            resp = client.post("/api/auth/google", json={"token": "fake"})
            data = resp.get_json()
            # Should indicate Google auth not available
            assert resp.status_code in (400, 500, 401)

    def test_google_auth_missing_client_id(self, client):
        """When GOOGLE_CLIENT_ID is empty, should return error."""
        with patch("algo.services.auth_service.GOOGLE_AUTH_AVAILABLE", True), \
             patch("algo.services.auth_service.GOOGLE_CLIENT_ID", ""):
            resp = client.post("/api/auth/google", json={"token": "fake"})
            assert resp.status_code in (400, 500, 401)


# ============================================================================
# LOGOUT
# ============================================================================

class TestLogout:
    """Logout endpoint (stateless)."""

    def test_logout_returns_success(self, client, user_a):
        """POST /api/auth/logout should return success."""
        resp = client.post("/api/auth/logout",
                           headers=_auth_header(user_a["token"]))
        assert resp.status_code == 200
