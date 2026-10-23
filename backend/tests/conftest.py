"""Tests run against a throwaway database set in TEST_DATABASE_URL (see app/README.md)."""

import os
from datetime import timedelta
from pathlib import Path

import pytest

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")

if TEST_DATABASE_URL:
    os.environ["DATABASE_URL"] = TEST_DATABASE_URL

REPO_ROOT = Path(__file__).resolve().parents[2]
SQL_FILES = [
    REPO_ROOT / "Databasing" / "CapstoneDDLScript.sql",
    REPO_ROOT / "Databasing" / "CapstoneDMLScript.sql",
    REPO_ROOT / "Databasing" / "ProfEvalStat.sql",
]


def _raw_conninfo(url):
    return url.replace("postgresql+psycopg://", "postgresql://", 1)


@pytest.fixture
def client():
    if not TEST_DATABASE_URL:
        pytest.skip("TEST_DATABASE_URL not set")

    import psycopg
    from fastapi.testclient import TestClient

    from app.main import app

    with psycopg.connect(_raw_conninfo(TEST_DATABASE_URL), autocommit=True) as conn:
        today = conn.execute(
            "SELECT (now() AT TIME ZONE 'America/Chicago')::date"
        ).fetchone()[0]
        for sql_file in SQL_FILES:
            conn.execute(sql_file.read_text())
        # Sample signup deadline (2026-09-15) has passed, so move cycle 2 forward.
        conn.execute(
            """
            UPDATE EvaluationCycle
            SET SignUpDeadLine = %s,
                ObservationDeadLine = %s,
                PostObservationFeedbackDeadLine = %s,
                AppFeedbackDeadLine = %s
            WHERE CycleID = 2
            """,
            (
                today + timedelta(days=30),
                today + timedelta(days=60),
                today + timedelta(days=90),
                today + timedelta(days=90),
            ),
        )

    with TestClient(app) as test_client:
        yield test_client


def _next_weekday(start, weekday):
    return start + timedelta(days=(weekday - start.weekday()) % 7 or 7)


@pytest.fixture
def fresh_signups(client):
    """Carol's (3) and David's (4) signups as if nobody has sent requests yet.

    The sample data already gives them accepted requests and scheduled observations,
    so this clears those and moves their preferred dates to the next Monday and Wednesday.
    """
    import psycopg

    with psycopg.connect(_raw_conninfo(TEST_DATABASE_URL), autocommit=True) as conn:
        today = conn.execute("SELECT (now() AT TIME ZONE 'America/Chicago')::date").fetchone()[0]
        monday, wednesday = _next_weekday(today, 0), _next_weekday(today, 2)
        conn.execute("DELETE FROM Observation WHERE SignupID IN (3, 4)")
        conn.execute("DELETE FROM ObserverRequest WHERE SignupID IN (3, 4)")
        conn.execute("DELETE FROM SignupPreferredDate WHERE SignupID IN (3, 4)")
        for signup_id in (3, 4):
            conn.execute(
                "INSERT INTO SignupPreferredDate VALUES (%s, %s), (%s, %s)",
                (signup_id, monday, signup_id, wednesday),
            )
    return {"monday": monday, "wednesday": wednesday}
