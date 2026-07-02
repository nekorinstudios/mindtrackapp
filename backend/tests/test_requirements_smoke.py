"""Smoke tests after requirements.txt cleanup (iteration_6)."""
import os
import requests

BASE_URL = "http://localhost:8001"


def test_health():
    r = requests.get(f"{BASE_URL}/api/health", timeout=10)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("ok") is True
    assert body.get("service") == "mindtrack-api"


def _login():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"identifier": "admin@mindtrack.app", "password": "Admin@12345"},
        timeout=10,
    )
    assert r.status_code == 200, r.text
    tok = r.json().get("access_token")
    assert tok
    return tok


def test_login():
    assert _login()


def test_auth_me():
    tok = _login()
    r = requests.get(
        f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {tok}"}, timeout=10
    )
    assert r.status_code == 200, r.text
    assert "id" in r.json() or "email" in r.json()


def test_catalog_symptoms():
    tok = _login()
    r = requests.get(
        f"{BASE_URL}/api/catalog/symptoms",
        headers={"Authorization": f"Bearer {tok}"},
        timeout=10,
    )
    assert r.status_code == 200, r.text


def test_journal_create_and_delete():
    tok = _login()
    h = {"Authorization": f"Bearer {tok}"}
    r = requests.post(
        f"{BASE_URL}/api/journal",
        headers=h,
        json={"text": "reqs cleanup smoke test"},
        timeout=10,
    )
    assert r.status_code == 200, r.text
    entry_id = r.json().get("id") or r.json().get("entry_id") or r.json().get("_id")
    assert entry_id, r.json()
    d = requests.delete(f"{BASE_URL}/api/journal/{entry_id}", headers=h, timeout=10)
    assert d.status_code == 200, d.text


def test_awards_progress():
    tok = _login()
    r = requests.get(
        f"{BASE_URL}/api/awards/progress",
        headers={"Authorization": f"Bearer {tok}"},
        timeout=10,
    )
    assert r.status_code == 200, r.text
