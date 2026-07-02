"""
CORS allowlist regression tests for /app/backend/server.py.

We hit the backend directly at http://localhost:8001 because the ingress
strips/normalizes CORS headers. Each test asserts on the
Access-Control-Allow-Origin (ACAO) and Access-Control-Allow-Credentials (ACAC)
response headers as the browser would see them.
"""
import os
import subprocess
import pytest
import requests

BASE_URL = "http://localhost:8001"


def _curl(args):
    """Run curl -i with args, return (status_code, headers_dict, body)."""
    result = subprocess.run(
        ["curl", "-s", "-i", *args, "--max-time", "15"],
        capture_output=True, text=True,
    )
    # subprocess text mode collapses \r\n -> \n on read
    raw = result.stdout.replace("\r\n", "\n")
    parts = raw.split("\n\n", 1)
    header_block = parts[0]
    body = parts[1] if len(parts) > 1 else ""
    lines = header_block.split("\n")
    status_line = lines[0] if lines else ""
    try:
        status = int(status_line.split(" ")[1])
    except Exception:
        status = 0
    headers = {}
    for line in lines[1:]:
        if ":" in line:
            k, v = line.split(":", 1)
            headers[k.strip().lower()] = v.strip()
    return status, headers, body


# ---------------------------------------------------------------------------
# CORS header tests
# ---------------------------------------------------------------------------
class TestCORSAllowlist:
    def test_1_allowed_prod_apex(self):
        status, h, _ = _curl(["-H", "Origin: https://mindtrackjourney.com",
                              f"{BASE_URL}/api/health"])
        assert status == 200, f"expected 200, got {status}"
        assert h.get("access-control-allow-origin") == "https://mindtrackjourney.com", h
        assert h.get("access-control-allow-credentials") == "true", h

    def test_2_allowed_prod_www(self):
        status, h, _ = _curl(["-H", "Origin: https://www.mindtrackjourney.com",
                              f"{BASE_URL}/api/health"])
        assert status == 200
        assert h.get("access-control-allow-origin") == "https://www.mindtrackjourney.com", h
        assert h.get("access-control-allow-credentials") == "true", h

    def test_3_allowed_regex_emergent(self):
        origin = "https://job-abc-123.preview.emergentagent.com"
        status, h, _ = _curl(["-H", f"Origin: {origin}", f"{BASE_URL}/api/health"])
        assert status == 200
        assert h.get("access-control-allow-origin") == origin, h

    def test_4_allowed_regex_mindtrack_sub(self):
        origin = "https://staging.mindtrackjourney.com"
        status, h, _ = _curl(["-H", f"Origin: {origin}", f"{BASE_URL}/api/health"])
        assert status == 200
        assert h.get("access-control-allow-origin") == origin, h

    def test_5_allowed_local_dev(self):
        origin = "http://localhost:3000"
        status, h, _ = _curl(["-H", f"Origin: {origin}", f"{BASE_URL}/api/health"])
        assert status == 200
        assert h.get("access-control-allow-origin") == origin, h

    def test_6_blocked_random_domain(self):
        status, h, _ = _curl(["-H", "Origin: https://evil.example.com",
                              f"{BASE_URL}/api/health"])
        # Body still returns 200 (curl ignores CORS) but ACAO must be absent.
        assert status == 200
        acao = h.get("access-control-allow-origin")
        assert not acao, f"ACAO should be absent for blocked origin, got: {acao!r}"

    def test_7_blocked_http_apex(self):
        # Regex requires https:// — plain http should be rejected.
        status, h, _ = _curl(["-H", "Origin: http://mindtrackjourney.com",
                              f"{BASE_URL}/api/health"])
        assert status == 200
        acao = h.get("access-control-allow-origin")
        assert not acao, f"ACAO should be absent for http scheme, got: {acao!r}"

    def test_8_preflight_allowed_origin(self):
        status, h, _ = _curl([
            "-X", "OPTIONS",
            "-H", "Origin: https://mindtrackjourney.com",
            "-H", "Access-Control-Request-Method: POST",
            "-H", "Access-Control-Request-Headers: Content-Type,Authorization",
            f"{BASE_URL}/api/auth/login",
        ])
        assert status == 200, f"expected 200, got {status}; headers={h}"
        assert h.get("access-control-allow-origin") == "https://mindtrackjourney.com", h
        methods = (h.get("access-control-allow-methods") or "").upper()
        assert "POST" in methods, f"POST missing in {methods!r}"
        allowed_headers = (h.get("access-control-allow-headers") or "").lower()
        assert "content-type" in allowed_headers, allowed_headers
        assert "authorization" in allowed_headers, allowed_headers

    def test_9_preflight_blocked_origin(self):
        status, h, _ = _curl([
            "-X", "OPTIONS",
            "-H", "Origin: https://evil.example.com",
            "-H", "Access-Control-Request-Method: POST",
            f"{BASE_URL}/api/auth/login",
        ])
        acao = h.get("access-control-allow-origin")
        # Either non-2xx OR ACAO absent counts as a rejection.
        assert status >= 400 or not acao, \
            f"Preflight should be rejected: status={status}, ACAO={acao!r}"


# ---------------------------------------------------------------------------
# Regression — endpoints still functional
# ---------------------------------------------------------------------------
class TestRegression:
    token = None

    def test_10_health_no_origin(self):
        r = requests.get(f"{BASE_URL}/api/health", timeout=10)
        assert r.status_code == 200
        assert r.json() == {"ok": True, "service": "mindtrack-api"}

    def test_11_login_admin(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"identifier": "admin@mindtrack.app", "password": "Admin@12345"},
            timeout=10,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "access_token" in data, data
        TestRegression.token = data["access_token"]

    def test_12_auth_me(self):
        assert TestRegression.token, "login must run first"
        r = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {TestRegression.token}"},
            timeout=10,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("email") == "admin@mindtrack.app"

    def test_13_catalog_symptoms(self):
        assert TestRegression.token
        r = requests.get(
            f"{BASE_URL}/api/catalog/symptoms",
            headers={"Authorization": f"Bearer {TestRegression.token}"},
            timeout=10,
        )
        assert r.status_code == 200, r.text
        # Endpoint returns a mapping of disorder -> list[symptom]
        payload = r.json()
        assert isinstance(payload, (list, dict)), payload
        assert len(payload) > 0

    def test_14_music_request_roundtrip(self):
        assert TestRegression.token
        headers = {"Authorization": f"Bearer {TestRegression.token}"}
        r = requests.post(
            f"{BASE_URL}/api/music/requests",
            json={"message": "TEST_cors regression"},
            headers=headers,
            timeout=10,
        )
        assert r.status_code == 200, r.text
        payload = r.json()
        rid = payload.get("id") or payload.get("request_id")
        assert rid, payload
        # Cleanup (best effort — endpoint may not exist for admin-side delete)
        d = requests.delete(
            f"{BASE_URL}/api/music/requests/{rid}",
            headers=headers, timeout=10,
        )
        assert d.status_code in (200, 204, 404), d.text


# ---------------------------------------------------------------------------
# Env override sanity check — grep server.py
# ---------------------------------------------------------------------------
def test_15_env_vars_read_from_os_environ():
    with open("/app/backend/server.py") as f:
        src = f.read()
    assert 'os.environ.get("CORS_ORIGINS"' in src, "CORS_ORIGINS not read from env"
    assert 'os.environ.get(\n    "CORS_ORIGIN_REGEX"' in src \
        or 'os.environ.get("CORS_ORIGIN_REGEX"' in src, \
        "CORS_ORIGIN_REGEX not read from env"
