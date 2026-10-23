"""CourseBook ingest refuses to run without Nebula credentials."""

import os


def test_ingest_without_api_key_is_unavailable(client, monkeypatch):
    monkeypatch.delenv("NEBULALABS_API_KEY", raising=False)
    monkeypatch.setenv("ANONYMIZATION_KEY", "test-key")
    os.environ.pop("NEBULALABS_API_KEY", None)
    response = client.post("/api/coursebook/ingest")
    assert response.status_code == 503
    assert "NEBULALABS_API_KEY" in response.json()["detail"]
