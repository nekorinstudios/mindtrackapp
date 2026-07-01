"""Iteration 2: Verify 'giftcard' -> 'toy_surprise' rename & prize options API.

Runs the 9 tests specified by the main agent:
 1. GET /api/prizes/options?category=toy_surprise -> 200
 2. GET /api/prizes/options?category=giftcard    -> 400
 3-5. GET /api/prizes/options?category=flowers|candy|treasure_chest -> 200
 6. POST /api/prizes/options (admin) then GET verifies presence
 7. Fresh user -> POST /api/awards/choice {"choice":"toy_surprise"} -> 200,
    GET /api/awards/progress -> choice == "toy_surprise"
 8. Backend logs: no migration errors
 9. DELETE prize option cleanup
"""

import os
import time
import uuid
import subprocess
import pytest
import requests

BASE_URL = "https://symptom-journal-12.preview.emergentagent.com"

TINY_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADh"
    "gGAWjR9awAAAABJRU5ErkJggg=="
)


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def admin_headers():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"identifier": "admin@mindtrack.app", "password": "Admin@12345"},
        timeout=20,
    )
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    tok = r.json()["access_token"]
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def user_headers():
    suffix = f"{int(time.time())}_{uuid.uuid4().hex[:6]}"
    email = f"test_toy_{suffix}@example.com"
    username = f"toy_{suffix}"
    r = requests.post(
        f"{BASE_URL}/api/auth/register",
        json={
            "email": email,
            "username": username,
            "password": "Test@12345",
            "first_name": "Toy",
            "last_name": "Tester",
        },
        timeout=20,
    )
    assert r.status_code == 200, f"Register failed: {r.status_code} {r.text}"
    tok = r.json()["access_token"]
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def created_option_id(admin_headers):
    """Used by test 6 & 9 (cleanup at module end)."""
    return {"id": None}


# ---------- Tests: category listings ----------
class TestPrizeOptionsCategories:
    def test_1_toy_surprise_ok(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/prizes/options",
            params={"category": "toy_surprise"},
            headers=admin_headers,
            timeout=20,
        )
        assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert isinstance(data, list), f"expected list, got {type(data)}"

    def test_2_giftcard_rejected(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/prizes/options",
            params={"category": "giftcard"},
            headers=admin_headers,
            timeout=20,
        )
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
        body = r.json()
        # FastAPI error shape: {"detail": "Invalid category"}
        detail = body.get("detail") if isinstance(body, dict) else None
        assert detail == "Invalid category", f"unexpected error body: {body}"

    def test_3_flowers_ok(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/prizes/options",
            params={"category": "flowers"},
            headers=admin_headers,
            timeout=20,
        )
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_4_candy_ok(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/prizes/options",
            params={"category": "candy"},
            headers=admin_headers,
            timeout=20,
        )
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_5_treasure_chest_ok(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/prizes/options",
            params={"category": "treasure_chest"},
            headers=admin_headers,
            timeout=20,
        )
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)


# ---------- Test 6: Admin create toy_surprise option, verify presence ----------
class TestCreateAndListToySurprise:
    def test_6a_admin_create_option(self, admin_headers, created_option_id):
        payload = {
            "category": "toy_surprise",
            "name": "Test Toy",
            "description": "A small test toy",
            "mime": "image/png",
            "image_base64": TINY_PNG_B64,
        }
        r = requests.post(
            f"{BASE_URL}/api/prizes/options",
            json=payload,
            headers=admin_headers,
            timeout=20,
        )
        assert r.status_code == 200, f"POST create failed: {r.status_code} {r.text}"
        body = r.json()
        assert body.get("ok") is True
        oid = body.get("option_id")
        assert oid and isinstance(oid, str) and oid.startswith("po_"), (
            f"missing/invalid option_id: {body}"
        )
        created_option_id["id"] = oid

    def test_6b_verify_option_appears_in_list(self, admin_headers, created_option_id):
        oid = created_option_id["id"]
        assert oid, "test_6a must run first to create option"
        r = requests.get(
            f"{BASE_URL}/api/prizes/options",
            params={"category": "toy_surprise"},
            headers=admin_headers,
            timeout=20,
        )
        assert r.status_code == 200, r.text
        items = r.json()
        assert isinstance(items, list)
        match = next((it for it in items if it.get("option_id") == oid), None)
        assert match is not None, f"created option {oid} not present in list"
        assert match.get("category") == "toy_surprise"
        assert match.get("name") == "Test Toy"
        assert match.get("description") == "A small test toy"
        assert match.get("mime") == "image/png"
        assert match.get("image_base64") == TINY_PNG_B64
        # ensure Mongo _id is not leaked
        assert "_id" not in match


# ---------- Test 7: Fresh user picks toy_surprise ----------
class TestUserAwardChoiceToySurprise:
    def test_7a_user_choose_toy_surprise(self, user_headers):
        r = requests.post(
            f"{BASE_URL}/api/awards/choice",
            json={"choice": "toy_surprise"},
            headers=user_headers,
            timeout=20,
        )
        assert r.status_code == 200, (
            f"POST /api/awards/choice failed: {r.status_code} {r.text}"
        )
        body = r.json()
        assert body.get("ok") is True
        assert body.get("choice") == "toy_surprise"

    def test_7b_progress_reflects_toy_surprise(self, user_headers):
        r = requests.get(
            f"{BASE_URL}/api/awards/progress", headers=user_headers, timeout=20
        )
        assert r.status_code == 200, r.text
        prog = r.json()
        assert prog.get("choice") == "toy_surprise", (
            f"progress.choice mismatch: {prog}"
        )
        # Should be in_progress with 0 points at start
        assert "points" in prog
        assert "status" in prog


# ---------- Test 8: Migration errors in backend logs ----------
class TestBackendLogsForMigrationErrors:
    def test_8_no_migration_errors(self):
        # Combine both stderr/stdout backend logs; look for the specific error tag
        cmd = (
            "grep -h 'migration] giftcard->toy_surprise failed' "
            "/var/log/supervisor/backend.*.log 2>/dev/null || true"
        )
        out = subprocess.run(
            cmd, shell=True, capture_output=True, text=True, timeout=10
        ).stdout
        assert out.strip() == "", f"Migration errors found in backend logs:\n{out}"


# ---------- Test 9: Cleanup: DELETE created option ----------
class TestCleanupDeleteOption:
    def test_9_admin_delete_option(self, admin_headers, created_option_id):
        oid = created_option_id["id"]
        if not oid:
            pytest.skip("no option created to delete")
        r = requests.delete(
            f"{BASE_URL}/api/prizes/options/{oid}",
            headers=admin_headers,
            timeout=20,
        )
        assert r.status_code == 200, f"DELETE failed: {r.status_code} {r.text}"
        assert r.json().get("ok") is True

        # verify gone
        r2 = requests.get(
            f"{BASE_URL}/api/prizes/options",
            params={"category": "toy_surprise"},
            headers=admin_headers,
            timeout=20,
        )
        assert r2.status_code == 200
        assert not any(it.get("option_id") == oid for it in r2.json()), (
            "option still present after delete"
        )
