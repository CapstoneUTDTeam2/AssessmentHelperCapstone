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
