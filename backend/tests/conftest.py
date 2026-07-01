import os
import pytest
import requests

# Use EXPO_PUBLIC_BACKEND_URL from frontend env (actual ingress URL)
BASE_URL = "https://symptom-journal-12.preview.emergentagent.com"


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"identifier": "admin@mindtrack.app", "password": "Admin@12345"},
        timeout=20,
    )
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def test_user():
    import uuid
    suffix = uuid.uuid4().hex[:8]
    email = f"test_{suffix}@example.com"
    username = f"test_{suffix}"
    password = "Test@12345"
    r = requests.post(
        f"{BASE_URL}/api/auth/register",
        json={
            "email": email,
            "username": username,
            "password": password,
            "first_name": "Test",
            "last_name": "User",
        },
        timeout=20,
    )
    assert r.status_code == 200, f"Register failed: {r.status_code} {r.text}"
    data = r.json()
    return {
        "email": email,
        "username": username,
        "password": password,
        "token": data["access_token"],
        "user": data["user"],
    }
