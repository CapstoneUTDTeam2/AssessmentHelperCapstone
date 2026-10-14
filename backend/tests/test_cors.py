"""CORS for the React frontend."""

FRONTEND = "http://localhost:5173"


def test_frontend_can_call_the_api(client):
    response = client.get("/api/evaluation-cycles/current", headers={"Origin": FRONTEND})
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == FRONTEND


def test_frontend_can_post_a_signup(client):
    response = client.options(
        "/api/signups",
        headers={
            "Origin": FRONTEND,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == FRONTEND


def test_unknown_site_is_not_allowed(client):
    response = client.get(
        "/api/evaluation-cycles/current", headers={"Origin": "http://evil.example"}
    )
    assert "access-control-allow-origin" not in response.headers
