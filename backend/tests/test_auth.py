"""Login against Professors.Email and pass_hash (SHA-256 hex)."""

import hashlib

import psycopg
import pytest

from tests.conftest import TEST_DATABASE_URL, _raw_conninfo


def _db():
    return psycopg.connect(_raw_conninfo(TEST_DATABASE_URL), autocommit=True)


def _set_password(professor_id, password):
    with _db() as conn:
        conn.execute(
            "UPDATE Professors SET pass_hash = %s WHERE ProfessorID = %s",
            (hashlib.sha256(password.encode()).hexdigest(), professor_id),
        )


def _login(client, email, password):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def test_email_is_filled_from_name(client):
    with _db() as conn:
        email = conn.execute("SELECT Email FROM Professors WHERE ProfessorID = 1").fetchone()[0]
    assert email == "alicejohnson@utdallas.edu"


def test_login_success(client):
    _set_password(1, "correct horse")
    response = _login(client, "AliceJohnson@UTDallas.edu ", "correct horse")
    assert response.status_code == 200
    body = response.json()
    assert body["professor_id"] == 1
    assert body["name"] == "Alice Johnson"
    assert body["department_name"] == "Computer Science"
    assert "pass_hash" not in body
    assert body["is_ac"] is False


def test_login_shows_committee_members(client):
    _set_password(2, "committee pw")
    with _db() as conn:
        conn.execute("UPDATE Professors SET isAC = TRUE WHERE ProfessorID = 2")
    response = _login(client, "robertsmith@utdallas.edu", "committee pw")
    assert response.status_code == 200, response.text
    assert response.json()["is_ac"] is True


def test_hash_matches_postgres_sha256(client):
    # The database team can set passwords in SQL with pgcrypto and they still work.
    with _db() as conn:
        conn.execute("UPDATE Professors SET pass_hash = encode(digest('from sql', 'sha256'), 'hex') WHERE ProfessorID = 2")
    assert _login(client, "robertsmith@utdallas.edu", "from sql").status_code == 200


@pytest.mark.parametrize(
    "email, password",
    [
        ("alicejohnson@utdallas.edu", "wrong"),
        ("nobody@utdallas.edu", "correct horse"),
        ("alicejohnson@utdallas.edu", ""),
        ("", "correct horse"),
    ],
)
def test_login_failures_look_the_same(client, email, password):
    _set_password(1, "correct horse")
    response = _login(client, email, password)
    assert response.status_code == 401
    assert response.json()["detail"] == "Incorrect email or password"


def test_account_without_password_cannot_log_in(client):
    # Sample professors have no password set yet.
    assert _login(client, "carolwilliams@utdallas.edu", "").status_code == 401
    assert _login(client, "carolwilliams@utdallas.edu", "anything").status_code == 401


def test_duplicate_emails_are_refused(client):
    with _db() as conn:
        conn.execute("INSERT INTO Professors (ProfessorID, ProfessorName, ProfessorDepartment) VALUES (600, 'Alice Johnson', 2)")
    _set_password(1, "pw")
    response = _login(client, "alicejohnson@utdallas.edu", "pw")
    assert response.status_code == 409
