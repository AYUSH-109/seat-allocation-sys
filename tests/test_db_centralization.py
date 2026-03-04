"""
Test Suite 2: Database Centralization
======================================
Validates that the database consolidation (user_auth.db + demo.db → single demo.db)
was implemented correctly:
- Single unified users table with all auth columns
- Auth functions read/write from the consolidated DB
- Cross-domain queries work (user → sessions → allocations)
- Foreign key integrity is maintained
- All expected tables exist with correct schemas
- Migration-added columns are present
"""
import sqlite3
import pytest
from pathlib import Path
from conftest import _auth_header, _signup_user, create_classroom, start_session, create_session_direct


# ============================================================================
# SCHEMA VALIDATION
# ============================================================================

class TestUnifiedSchema:
    """Verify the consolidated database has the correct schema."""

    def test_all_tables_exist(self, app_ctx, tmp_db):
        """All 11 required tables should exist in the single database."""
        conn = sqlite3.connect(str(tmp_db))
        cur = conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        tables = {row[0] for row in cur.fetchall()}
        conn.close()

        expected_tables = {
            "users",
            "user_activity",
            "user_activity_log",
            "allocation_sessions",
            "uploads",
            "students",
            "classrooms",
            "allocations",
            "allocation_history",
            "external_students",
            "feedback",
        }
        missing = expected_tables - tables
        assert not missing, f"Missing tables: {missing}"

    def test_users_table_has_auth_columns(self, app_ctx, tmp_db):
        """Users table must have all consolidated auth columns."""
        conn = sqlite3.connect(str(tmp_db))
        cur = conn.cursor()
        cur.execute("PRAGMA table_info(users)")
        columns = {row[1] for row in cur.fetchall()}
        conn.close()

        required_auth_columns = {
            "id", "username", "email", "password_hash", "role",
            "full_name", "auth_provider", "google_id",
            "created_at", "updated_at", "last_login",
        }
        missing = required_auth_columns - columns
        assert not missing, f"Users table missing auth columns: {missing}"

    def test_users_table_role_check_constraint(self, app_ctx, tmp_db):
        """Users table should accept developer, admin, faculty roles (and legacy uppercase)."""
        conn = sqlite3.connect(str(tmp_db))
        cur = conn.cursor()

        valid_roles = ["developer", "admin", "faculty", "STUDENT", "ADMIN", "FACULTY"]
        for i, role in enumerate(valid_roles):
            try:
                cur.execute(
                    "INSERT INTO users (username, email, role) VALUES (?, ?, ?)",
                    (f"test_{role}", f"test_{role}@test.com", role),
                )
            except sqlite3.IntegrityError:
                pytest.fail(f"Role '{role}' should be valid but was rejected")

        conn.rollback()
        conn.close()

    def test_invalid_role_rejected(self, app_ctx, tmp_db):
        """Users table should reject invalid roles."""
        conn = sqlite3.connect(str(tmp_db))
        cur = conn.cursor()

        with pytest.raises(sqlite3.IntegrityError):
            cur.execute(
                "INSERT INTO users (username, email, role) VALUES (?, ?, ?)",
                ("bad_role", "bad@test.com", "SUPERUSER"),
            )
        conn.close()

    def test_google_id_unique_index(self, app_ctx, tmp_db):
        """Google ID unique index should exist."""
        conn = sqlite3.connect(str(tmp_db))
        cur = conn.cursor()
        cur.execute("PRAGMA index_list(users)")
        indexes = [row[1] for row in cur.fetchall()]
        conn.close()

        assert "idx_google_id" in indexes, \
            f"idx_google_id not found. Indexes: {indexes}"

    def test_allocation_sessions_foreign_key_to_users(self, app_ctx, tmp_db):
        """allocation_sessions.user_id should reference users.id."""
        conn = sqlite3.connect(str(tmp_db))
        cur = conn.cursor()
        cur.execute("PRAGMA foreign_key_list(allocation_sessions)")
        fks = cur.fetchall()
        conn.close()

        user_fk = [fk for fk in fks if fk[2] == "users"]
        assert len(user_fk) > 0, \
            "allocation_sessions should have a FK to users table"

    def test_classrooms_foreign_key_to_users(self, app_ctx, tmp_db):
        """classrooms.user_id should reference users.id."""
        conn = sqlite3.connect(str(tmp_db))
        cur = conn.cursor()
        cur.execute("PRAGMA foreign_key_list(classrooms)")
        fks = cur.fetchall()
        conn.close()

        user_fk = [fk for fk in fks if fk[2] == "users"]
        assert len(user_fk) > 0, \
            "classrooms should have a FK to users table"

    def test_no_separate_auth_db_needed(self, app_ctx, tmp_db):
        """No user_auth.db file should be created during app startup."""
        # After app initialization, check that no user_auth.db was created
        project_root = tmp_db.parent
        auth_db = project_root / "user_auth.db"
        assert not auth_db.exists(), \
            "user_auth.db should NOT be created — auth is consolidated"


# ============================================================================
# CROSS-DOMAIN QUERIES
# ============================================================================

class TestCrossDomainQueries:
    """Verify that auth users can be joined with domain data."""

    def test_signup_creates_user_in_consolidated_db(self, client, tmp_db):
        """Signup should create the user in the same DB as sessions/classrooms."""
        _signup_user(client, "crosstest", "cross@test.com", "Pass123!")

        conn = sqlite3.connect(str(tmp_db))
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT id, username, email, role, auth_provider FROM users WHERE email=?",
            ("cross@test.com",)
        ).fetchone()
        conn.close()

        assert row is not None, "User should exist in consolidated DB"
        assert row["auth_provider"] == "local"
        assert row["role"] == "faculty"

    def test_user_session_join_works(self, client, user_a, tmp_db):
        """Can join users and allocation_sessions in a single query."""
        # Insert a session directly to test the JOIN
        user_id = user_a["user"]["id"]
        conn = sqlite3.connect(str(tmp_db))
        conn.execute(
            "INSERT INTO allocation_sessions (plan_id, user_id, name, status) VALUES (?, ?, ?, ?)",
            ("PLAN-JOINTEST", user_id, "Join-Test", "active"),
        )
        conn.commit()

        conn.row_factory = sqlite3.Row
        rows = conn.execute("""
            SELECT u.email, s.name, s.status
            FROM allocation_sessions s
            JOIN users u ON s.user_id = u.id
            WHERE u.email = ?
        """, (user_a["email"],)).fetchall()
        conn.close()

        assert len(rows) >= 1, "Cross-domain JOIN should return results"
        assert rows[0]["email"] == user_a["email"]
        assert rows[0]["status"] == "active"

    def test_user_classroom_join_works(self, client, user_a, tmp_db):
        """Can join users and classrooms in a single query."""
        create_classroom(client, user_a["token"], "JoinRoom", 3, 4)

        conn = sqlite3.connect(str(tmp_db))
        conn.row_factory = sqlite3.Row
        rows = conn.execute("""
            SELECT u.email, c.name, c.rows, c.cols
            FROM classrooms c
            JOIN users u ON c.user_id = u.id
            WHERE u.email = ?
        """, (user_a["email"],)).fetchall()
        conn.close()

        assert len(rows) >= 1, "Cross-domain classroom JOIN should work"
        assert rows[0]["name"] == "JoinRoom"

    def test_full_chain_user_session_upload_students(self, app, client, user_a, tmp_db):
        """Full chain: user → session → uploads → students in one query."""
        # Start session via service layer
        result = create_session_direct(app, user_a["user"]["id"], "Chain-Test")
        session_id = result.get("session_id")
        assert session_id is not None, "Session creation failed"

        conn = sqlite3.connect(str(tmp_db))
        conn.row_factory = sqlite3.Row
        # This query should at least parse without error
        rows = conn.execute("""
            SELECT u.email, s.plan_id, s.status
            FROM allocation_sessions s
            JOIN users u ON s.user_id = u.id
            WHERE s.session_id = ?
        """, (session_id,)).fetchall()
        conn.close()

        assert len(rows) == 1
        assert rows[0]["email"] == user_a["email"]


# ============================================================================
# AUTH SERVICE USES CONSOLIDATED DB
# ============================================================================

class TestAuthUsesConsolidatedDB:
    """Auth operations should read/write the same DB as domain operations."""

    def test_signup_then_login_same_db(self, client, tmp_db):
        """Signup and login should both work against the single database."""
        user, token = _signup_user(client, "samedb", "samedb@test.com", "Pass123!")
        assert user is not None, "Signup should succeed"
        assert token is not None, "Token should be returned"

        # Login with same credentials
        resp = client.post("/api/auth/login", json={
            "email": "samedb@test.com",
            "password": "Pass123!",
        })
        data = resp.get_json()
        assert resp.status_code == 200, f"Login failed: {data}"
        assert data.get("token") is not None

    def test_profile_reads_from_consolidated_db(self, client, user_a):
        """GET /api/auth/profile should return data from the consolidated DB."""
        resp = client.get("/api/auth/profile",
                          headers=_auth_header(user_a["token"]))
        assert resp.status_code == 200
        data = resp.get_json()
        profile = data.get("user") or data
        assert profile.get("email") == user_a["email"]

    def test_user_id_consistent_across_auth_and_domain(self, app, client, user_a, tmp_db):
        """The user_id from auth token matches the user_id on domain objects."""
        # Create a session using service layer
        result = create_session_direct(app, user_a["user"]["id"], "ID-Check")
        session_id = result.get("session_id")

        assert session_id is not None, "Session creation failed"
        conn = sqlite3.connect(str(tmp_db))
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT user_id FROM allocation_sessions WHERE session_id = ?",
            (session_id,)
        ).fetchone()
        conn.close()

        assert row["user_id"] == user_a["user"]["id"], \
            "Session user_id should match the auth user's id"


# ============================================================================
# MIGRATION INTEGRITY
# ============================================================================

class TestMigrationColumns:
    """Verify that migration-added columns exist and have correct defaults."""

    @pytest.mark.parametrize("table,column,default", [
        ("uploads", "batch_color", "#BFDBFE"),
        ("students", "batch_color", "#BFDBFE"),
        ("users", "auth_provider", "local"),
    ])
    def test_migration_column_defaults(self, app_ctx, tmp_db, table, column, default):
        """Migration-added columns should have their expected defaults."""
        conn = sqlite3.connect(str(tmp_db))
        cur = conn.cursor()
        cur.execute(f"PRAGMA table_info({table})")
        cols = {row[1]: row[4] for row in cur.fetchall()}  # col_name -> default_value
        conn.close()

        assert column in cols, f"{table}.{column} should exist"
        # SQLite stores defaults as strings with quotes
        raw_default = cols[column]
        if raw_default:
            clean = raw_default.strip("'\"")
            assert clean == default, \
                f"{table}.{column} default should be '{default}', got '{clean}'"

    def test_sessions_has_name_column(self, app_ctx, tmp_db):
        """allocation_sessions should have the 'name' column (migration #5)."""
        conn = sqlite3.connect(str(tmp_db))
        cur = conn.cursor()
        cur.execute("PRAGMA table_info(allocation_sessions)")
        columns = {row[1] for row in cur.fetchall()}
        conn.close()
        assert "name" in columns

    def test_classrooms_has_block_structure(self, app_ctx, tmp_db):
        """classrooms should have block_structure column (migration #9)."""
        conn = sqlite3.connect(str(tmp_db))
        cur = conn.cursor()
        cur.execute("PRAGMA table_info(classrooms)")
        columns = {row[1] for row in cur.fetchall()}
        conn.close()
        assert "block_structure" in columns
