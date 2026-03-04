"""
Shared pytest fixtures for the Seat Allocation System test suite.

Provides:
- Isolated temporary SQLite database per test
- Flask test client with fresh DB
- Pre-registered test users (User A, User B) with JWT tokens
- Helpers for common operations (create session, upload students, add classroom)
"""
import os
import sys
import json
import pytest
import tempfile
import sqlite3
from pathlib import Path
from unittest.mock import patch

# Ensure the project root is on sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))


# ---------------------------------------------------------------------------
# 1. TEMPORARY DATABASE FIXTURE
# ---------------------------------------------------------------------------

@pytest.fixture()
def tmp_db(tmp_path):
    """Create a fresh temporary SQLite database and patch Config.DB_PATH."""
    db_path = tmp_path / "test.db"

    # Patch Config.DB_PATH everywhere it's read
    with patch("algo.config.settings.Config.DB_PATH", db_path), \
         patch("algo.config.settings.Config.DB_NAME", "test.db"):
        yield db_path


# ---------------------------------------------------------------------------
# 2. FLASK APP + CLIENT FIXTURE
# ---------------------------------------------------------------------------

@pytest.fixture()
def app(tmp_db):
    """Create a Flask application with an isolated test database."""
    from algo.main import create_app

    test_app = create_app(test_config={
        "TESTING": True,
        "DB_PATH": str(tmp_db),
    })
    test_app.config["DB_PATH"] = str(tmp_db)

    yield test_app


@pytest.fixture()
def client(app):
    """Flask test client."""
    return app.test_client()


@pytest.fixture()
def app_ctx(app):
    """Application context for direct service/query calls."""
    with app.app_context():
        yield app


# ---------------------------------------------------------------------------
# 3. AUTH HELPERS
# ---------------------------------------------------------------------------

def _signup_user(client, username, email, password, role="faculty"):
    """Register a user via the API and return (user_data, token)."""
    resp = client.post("/api/auth/signup", json={
        "username": username,
        "email": email,
        "password": password,
        "role": role,
    })
    data = resp.get_json()
    return data.get("user"), data.get("token")


def _login_user(client, email, password):
    """Login a user via the API and return (user_data, token)."""
    resp = client.post("/api/auth/login", json={
        "email": email,
        "password": password,
    })
    data = resp.get_json()
    return data.get("user"), data.get("token")


def _auth_header(token):
    """Return Authorization header dict."""
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def user_a(client):
    """Pre-registered User A (admin) with JWT token."""
    user, token = _signup_user(client, "alice", "alice@test.com", "Password1!", "admin")
    return {"user": user, "token": token, "email": "alice@test.com", "password": "Password1!"}


@pytest.fixture()
def user_b(client):
    """Pre-registered User B (faculty) with JWT token."""
    user, token = _signup_user(client, "bob", "bob@test.com", "Password2!", "faculty")
    return {"user": user, "token": token, "email": "bob@test.com", "password": "Password2!"}


@pytest.fixture()
def user_c(client):
    """Pre-registered User C (faculty) with JWT token."""
    user, token = _signup_user(client, "carol", "carol@test.com", "Password3!", "faculty")
    return {"user": user, "token": token, "email": "carol@test.com", "password": "Password3!"}


# ---------------------------------------------------------------------------
# 4. DATA HELPERS
# ---------------------------------------------------------------------------

def create_classroom(client, token, name, rows=5, cols=6, block_width=3):
    """Create a classroom via the API."""
    resp = client.post(
        "/api/classrooms",
        json={"name": name, "rows": rows, "cols": cols, "block_width": block_width},
        headers=_auth_header(token),
    )
    return resp.get_json(), resp.status_code


def start_session(client, token, name="Test Session", upload_ids=None):
    """Start a new allocation session via the API."""
    body = {"upload_ids": upload_ids or [], "force_new": True}
    resp = client.post(
        "/api/sessions/start",
        json=body,
        headers=_auth_header(token),
    )
    return resp.get_json(), resp.status_code


def create_session_direct(app, user_id, name="Test Session"):
    """Create a session using the service layer directly (within app context).

    Returns dict with session_id, plan_id, user_id, name.
    Use this when you need a session without going through the API
    (which requires upload_ids).
    """
    from algo.services.session_service import SessionService
    with app.app_context():
        return SessionService.create_session(name, user_id=user_id)


def make_csv_file(students, filename="batch1.csv"):
    """Create an in-memory CSV file for upload.

    students: list of (enrollment, name) tuples
    """
    import io
    lines = ["Enrollment,Name"]
    for enrollment, name in students:
        lines.append(f"{enrollment},{name}")
    content = "\n".join(lines)
    return (io.BytesIO(content.encode()), filename)


def upload_students(client, token, session_id, plan_id, students, batch_name="CSE"):
    """Upload a CSV of students to a session (preview + confirm)."""
    csv_file, fname = make_csv_file(students, f"{batch_name}.csv")

    # Step 1: Upload (preview)
    resp = client.post(
        "/api/upload",
        data={
            "file": (csv_file, fname),
            "session_id": str(session_id),
            "plan_id": plan_id,
            "batch_name": batch_name,
        },
        headers=_auth_header(token),
        content_type="multipart/form-data",
    )
    preview = resp.get_json()

    # Step 2: Commit upload to DB
    if resp.status_code == 200 and preview.get("batch_id"):
        resp2 = client.post(
            "/api/commit-upload",
            json={
                "batch_id": preview["batch_id"],
                "session_id": session_id,
                "plan_id": plan_id,
                "batch_name": batch_name,
            },
            headers=_auth_header(token),
        )
        return resp2.get_json(), resp2.status_code, preview.get("batch_id")

    return preview, resp.status_code, None


# ---------------------------------------------------------------------------
# 5. DATABASE HELPERS
# ---------------------------------------------------------------------------

def get_raw_db(tmp_db):
    """Get a raw sqlite3 connection to the test database."""
    conn = sqlite3.connect(str(tmp_db))
    conn.row_factory = sqlite3.Row
    return conn
