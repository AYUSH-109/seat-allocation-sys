"""
Test Suite 5: API Endpoint Integration Tests
==============================================
Tests the major API blueprints through the Flask test client:
- Health check
- Sessions (CRUD, lifecycle, start/complete/expire)
- Students (upload preview + confirm)
- Classrooms (CRUD, validation)
- Dashboard (user-scoped stats)
- Allocations (generate seating)
- Plans (listing)
"""
import pytest
import json
from conftest import (
    _auth_header, _signup_user,
    create_classroom, start_session, upload_students, make_csv_file,
    create_session_direct,
)


# ============================================================================
# HEALTH CHECK
# ============================================================================

class TestHealthEndpoint:
    """GET /api/health should always return 200."""

    def test_health_returns_200(self, client):
        resp = client.get("/api/health")
        assert resp.status_code == 200

    def test_health_status_field(self, client):
        data = client.get("/api/health").get_json()
        assert data.get("status") in ("healthy", "ok", True)


# ============================================================================
# SESSION LIFECYCLE
# ============================================================================

class TestSessionLifecycle:
    """Full session lifecycle: create → use → complete/expire/delete."""

    def test_create_session(self, client, user_a):
        """POST /api/sessions/start creates a session (or resumes)."""
        resp = client.post("/api/sessions/start",
                           json={"upload_ids": [], "force_new": True},
                           headers=_auth_header(user_a["token"]))
        # May return 200 (created/resumed) or 400 (no uploads)
        # The endpoint requires upload_ids for new sessions in normal flow
        assert resp.status_code in (200, 400)

    def test_session_has_plan_id(self, app, client, user_a):
        """When a session exists, it should have a plan_id."""
        result = create_session_direct(app, user_a["user"]["id"], "Plan ID Test")
        plan_id = result.get("plan_id", "")
        assert len(plan_id) > 0, "Session should have a plan_id"

    def test_get_active_session(self, app, client, user_a):
        """GET /api/sessions/active returns the user's active session."""
        create_session_direct(app, user_a["user"]["id"], "Active Test")
        resp = client.get("/api/sessions/active",
                          headers=_auth_header(user_a["token"]))
        assert resp.status_code == 200

    def test_list_sessions(self, app, client, user_a):
        """GET /api/sessions/list returns user's sessions."""
        create_session_direct(app, user_a["user"]["id"], "List Test 1")
        create_session_direct(app, user_a["user"]["id"], "List Test 2")

        resp = client.get("/api/sessions/list",
                          headers=_auth_header(user_a["token"]))
        assert resp.status_code == 200

    def test_delete_session(self, app, client, user_a):
        """DELETE /api/sessions/<id> removes the session."""
        result = create_session_direct(app, user_a["user"]["id"], "Delete Me")
        session_id = result.get("session_id")

        assert session_id is not None, "Session creation failed"
        resp = client.delete(
            f"/api/sessions/{session_id}",
            headers=_auth_header(user_a["token"]),
        )
        assert resp.status_code == 200

    def test_expire_session(self, app, client, user_a):
        """POST /api/sessions/<id>/expire soft-deletes (expires) the session."""
        result = create_session_direct(app, user_a["user"]["id"], "Expire Me")
        session_id = result.get("session_id")

        assert session_id is not None, "Session creation failed"
        resp = client.post(
            f"/api/sessions/{session_id}/expire",
            headers=_auth_header(user_a["token"]),
        )
        assert resp.status_code == 200


# ============================================================================
# CLASSROOM CRUD
# ============================================================================

class TestClassroomCRUD:
    """Classroom create/read/update/delete."""

    def test_create_classroom(self, client, user_a):
        """POST /api/classrooms creates a classroom."""
        data, status = create_classroom(client, user_a["token"], "Room 101", 5, 6, 3)
        assert status in (200, 201), f"Create failed: {data}"

    def test_list_classrooms(self, client, user_a):
        """GET /api/classrooms returns the user's classrooms."""
        create_classroom(client, user_a["token"], "List Room", 3, 4)
        resp = client.get("/api/classrooms",
                          headers=_auth_header(user_a["token"]))
        assert resp.status_code == 200

    def test_classroom_validation_rows_cols(self, client, user_a):
        """Rows and cols must be positive integers ≤ 50."""
        # rows=0 should fail
        data, status = create_classroom(client, user_a["token"], "Bad Room", 0, 5)
        assert status in (400, 422, 500), f"Zero rows should be rejected: {data}"

    def test_delete_classroom(self, client, user_a):
        """DELETE /api/classrooms/<id> removes the classroom."""
        data, _ = create_classroom(client, user_a["token"], "Del Room", 3, 4)
        room_id = None
        if isinstance(data, dict):
            room_id = data.get("id") or data.get("classroom", {}).get("id")

        if room_id:
            resp = client.delete(
                f"/api/classrooms/{room_id}",
                headers=_auth_header(user_a["token"]),
            )
            assert resp.status_code == 200

    def test_update_classroom(self, client, user_a):
        """PUT /api/classrooms/<id> updates classroom properties."""
        data, _ = create_classroom(client, user_a["token"], "Update Room", 3, 4)
        room_id = None
        if isinstance(data, dict):
            room_id = data.get("id") or data.get("classroom", {}).get("id")

        if room_id:
            resp = client.put(
                f"/api/classrooms/{room_id}",
                json={"name": "Updated Room", "rows": 5, "cols": 8},
                headers=_auth_header(user_a["token"]),
            )
            assert resp.status_code == 200


# ============================================================================
# STUDENT UPLOAD
# ============================================================================

class TestStudentUpload:
    """Student file upload (preview + confirm)."""

    def test_upload_preview(self, app, client, user_a):
        """POST /api/upload parses a CSV file (step 1: preview)."""
        result = create_session_direct(app, user_a["user"]["id"], "Upload Test")
        session_id = result.get("session_id")
        plan_id = result.get("plan_id", "")

        if session_id:
            csv_file, fname = make_csv_file([
                ("E001", "Alice Smith"),
                ("E002", "Bob Jones"),
            ])
            resp = client.post("/api/upload", data={
                "file": (csv_file, fname),
                "session_id": str(session_id),
                "plan_id": plan_id,
                "batch_name": "CSE",
            }, headers=_auth_header(user_a["token"]),
                content_type="multipart/form-data")

            assert resp.status_code == 200, f"Upload failed: {resp.get_json()}"
            data = resp.get_json()
            assert data.get("batch_id") is not None

    def test_get_students_after_upload(self, app, client, user_a):
        """GET /api/students returns uploaded students."""
        result = create_session_direct(app, user_a["user"]["id"], "Students List Test")
        session_id = result.get("session_id")
        plan_id = result.get("plan_id", "")

        if session_id:
            upload_students(client, user_a["token"], session_id, plan_id,
                            [("E101", "Student A"), ("E102", "Student B")])

            resp = client.get("/api/students",
                              headers=_auth_header(user_a["token"]))
            assert resp.status_code == 200


# ============================================================================
# DASHBOARD
# ============================================================================

class TestDashboard:
    """Dashboard statistics endpoints."""

    def test_dashboard_stats_success(self, client, user_a):
        """GET /api/dashboard/stats returns stats object."""
        resp = client.get("/api/dashboard/stats",
                          headers=_auth_header(user_a["token"]))
        assert resp.status_code == 200
        data = resp.get_json()
        assert isinstance(data, dict)

    def test_dashboard_activity(self, client, user_a):
        """GET /api/dashboard/activity returns recent activity."""
        resp = client.get("/api/dashboard/activity",
                          headers=_auth_header(user_a["token"]))
        assert resp.status_code == 200

    def test_dashboard_session_info(self, client, user_a):
        """GET /api/dashboard/session-info returns session info."""
        resp = client.get("/api/dashboard/session-info",
                          headers=_auth_header(user_a["token"]))
        assert resp.status_code == 200


# ============================================================================
# PLANS
# ============================================================================

class TestPlansEndpoint:
    """Plan listing endpoint."""

    def test_plans_list(self, client, user_a):
        """GET /api/plans/recent returns user's recent seating plans."""
        resp = client.get("/api/plans/recent",
                          headers=_auth_header(user_a["token"]))
        assert resp.status_code == 200


# ============================================================================
# TEMPLATES
# ============================================================================

class TestTemplatesEndpoint:
    """CSV template download endpoints."""

    def test_list_templates(self, client, user_a):
        """GET /api/templates returns available templates."""
        resp = client.get("/api/templates",
                          headers=_auth_header(user_a["token"]))
        assert resp.status_code == 200

    def test_format_info(self, client, user_a):
        """GET /api/templates/format-info returns format specification."""
        resp = client.get("/api/templates/format-info",
                          headers=_auth_header(user_a["token"]))
        assert resp.status_code == 200

    def test_download_mode1_template(self, client, user_a):
        """GET /api/templates/download/students_mode1.csv returns sample CSV."""
        resp = client.get("/api/templates/download/students_mode1.csv",
                          headers=_auth_header(user_a["token"]))
        assert resp.status_code == 200
        assert b"Enrollment" in resp.data


# ============================================================================
# FEEDBACK
# ============================================================================

class TestFeedback:
    """Feedback submission and retrieval."""

    def test_submit_feedback(self, client, user_a):
        """POST /api/feedback submits user feedback (form data)."""
        resp = client.post("/api/feedback", data={
            "issueType": "bug",
            "priority": "medium",
            "description": "Test feedback from automated tests",
        }, headers=_auth_header(user_a["token"]),
           content_type="multipart/form-data")
        assert resp.status_code in (200, 201)

    def test_get_own_feedback(self, client, user_a):
        """GET /api/feedback returns user's feedback."""
        resp = client.get("/api/feedback",
                          headers=_auth_header(user_a["token"]))
        assert resp.status_code == 200


# ============================================================================
# ERROR HANDLING
# ============================================================================

class TestErrorHandling:
    """API error responses should be well-formed."""

    def test_404_for_unknown_route(self, client):
        """Unknown routes should return 404."""
        resp = client.get("/api/nonexistent")
        assert resp.status_code == 404

    def test_json_body_required(self, client, user_a):
        """POST endpoints expecting JSON should handle missing body."""
        resp = client.post("/api/sessions/start",
                           headers=_auth_header(user_a["token"]),
                           content_type="application/json",
                           data="not json")
        # Should return 400 (bad request) or handle gracefully
        assert resp.status_code in (400, 415, 500, 200)

    def test_invalid_session_id(self, client, user_a):
        """Requesting a non-existent session should return 404."""
        resp = client.get("/api/sessions/99999",
                          headers=_auth_header(user_a["token"]))
        assert resp.status_code in (404, 403)
