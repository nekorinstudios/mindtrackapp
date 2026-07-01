"""Tests for MindTrack music upload and music request features (iteration 3).

Covers:
- User private music uploads (/api/music/upload/user)
- Listing / fetching / deleting user tracks (/api/music, /api/music/{id}/data, DELETE)
- Ownership isolation between users
- Music request lifecycle (/api/music/requests, .../mine, PATCH, DELETE)
- Admin-only enforcement
"""

import os
import time
import base64
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/") or os.environ.get(
    "EXPO_BACKEND_URL", ""
).rstrip("/")

ADMIN_EMAIL = "admin@mindtrack.app"
ADMIN_PASSWORD = "Admin@12345"

TINY_B64 = "SGVsbG8gV29ybGQ="  # "Hello World"


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _register(email: str, username: str, password: str = "Test@12345") -> str:
    r = requests.post(
        f"{BASE_URL}/api/auth/register",
        json={
            "email": email,
            "username": username,
            "password": password,
            "first_name": "Test",
            "last_name": "User",
        },
        timeout=30,
    )
    assert r.status_code in (200, 201), f"register failed: {r.status_code} {r.text}"
    data = r.json()
    return data.get("access_token") or data.get("token")


def _login(identifier: str, password: str) -> str:
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"identifier": identifier, "password": password},
        timeout=30,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    return data.get("access_token") or data.get("token")


@pytest.fixture(scope="module")
def context():
    """Set up two fresh users + admin token. Shared across tests in this module."""
    assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL not set"
    ts = int(time.time())
    u1_email = f"test_music_{ts}@example.com"
    u1_username = f"musicuser{ts}"
    u2_email = f"test_music2_{ts}@example.com"
    u2_username = f"musicuser2{ts}"

    u1_token = _register(u1_email, u1_username)
    u2_token = _register(u2_email, u2_username)
    admin_token = _login(ADMIN_EMAIL, ADMIN_PASSWORD)

    return {
        "u1_email": u1_email,
        "u1_token": u1_token,
        "u2_email": u2_email,
        "u2_token": u2_token,
        "admin_token": admin_token,
        "track_id": None,
        "request_id": None,
    }


# ---------------- User music upload (private) ----------------

class TestUserMusicUpload:
    def test_01_upload_user_track(self, context):
        r = requests.post(
            f"{BASE_URL}/api/music/upload/user",
            headers=_auth_headers(context["u1_token"]),
            json={"title": "My Test Song", "mime": "audio/mpeg", "data_base64": TINY_B64},
            timeout=30,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        body = r.json()
        assert body.get("ok") is True
        assert "track_id" in body and body["track_id"]
        context["track_id"] = body["track_id"]

    def test_02_list_music_includes_own_track(self, context):
        assert context["track_id"], "prior upload must succeed"
        r = requests.get(
            f"{BASE_URL}/api/music",
            headers=_auth_headers(context["u1_token"]),
            timeout=30,
        )
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        mine = [x for x in items if x.get("track_id") == context["track_id"]]
        assert len(mine) == 1, f"track not in list: {items}"
        assert mine[0].get("is_mine") is True
        assert mine[0].get("title") == "My Test Song"
        # data_base64 should NOT be present in list view
        assert "data_base64" not in mine[0]

    def test_03_get_track_data_as_owner(self, context):
        tid = context["track_id"]
        r = requests.get(
            f"{BASE_URL}/api/music/{tid}/data",
            headers=_auth_headers(context["u1_token"]),
            timeout=30,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        body = r.json()
        assert body.get("track_id") == tid
        assert body.get("data_base64") == TINY_B64
        assert body.get("mime") == "audio/mpeg"

    def test_04_upload_too_large_returns_413(self, context):
        # Create a base64 string whose implied byte count exceeds 5 MB.
        # approx_bytes = (len * 3) // 4. We want > 5 * 1024 * 1024 = 5,242,880 bytes.
        # Use string length > 8_000_000 as specified.
        big_b64 = "A" * 8_400_000  # ~6.3 MB decoded
        r = requests.post(
            f"{BASE_URL}/api/music/upload/user",
            headers=_auth_headers(context["u1_token"]),
            json={"title": "Big Song", "mime": "audio/mpeg", "data_base64": big_b64},
            timeout=60,
        )
        assert r.status_code == 413, f"expected 413, got {r.status_code} {r.text[:200]}"
        detail = r.json().get("detail", "")
        assert "File too large" in detail, f"unexpected detail: {detail}"

    def test_05_other_user_cannot_get_data(self, context):
        tid = context["track_id"]
        r = requests.get(
            f"{BASE_URL}/api/music/{tid}/data",
            headers=_auth_headers(context["u2_token"]),
            timeout=30,
        )
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"
        assert "Not allowed" in r.json().get("detail", "")

    def test_06_other_user_list_does_not_include_track(self, context):
        r = requests.get(
            f"{BASE_URL}/api/music",
            headers=_auth_headers(context["u2_token"]),
            timeout=30,
        )
        assert r.status_code == 200
        items = r.json()
        tids = [x.get("track_id") for x in items]
        assert context["track_id"] not in tids, f"user2 saw user1's track: {tids}"

    def test_07_owner_can_delete_track(self, context):
        tid = context["track_id"]
        r = requests.delete(
            f"{BASE_URL}/api/music/{tid}",
            headers=_auth_headers(context["u1_token"]),
            timeout=30,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        # Verify it's gone from list
        r2 = requests.get(
            f"{BASE_URL}/api/music",
            headers=_auth_headers(context["u1_token"]),
            timeout=30,
        )
        assert r2.status_code == 200
        tids = [x.get("track_id") for x in r2.json()]
        assert tid not in tids, "track still visible after delete"

    def test_08_non_admin_cannot_delete_admin_track(self, context):
        # Look for an existing admin-uploaded track (owner=None). If none, skip.
        r = requests.get(
            f"{BASE_URL}/api/music",
            headers=_auth_headers(context["u1_token"]),
            timeout=30,
        )
        assert r.status_code == 200
        # is_mine=False => owner is None (admin track) since only own tracks + admin tracks appear
        admin_tracks = [x for x in r.json() if x.get("is_mine") is False]
        if not admin_tracks:
            pytest.skip("No admin-uploaded tracks exist; sub-test skipped as allowed")
        atid = admin_tracks[0]["track_id"]
        rd = requests.delete(
            f"{BASE_URL}/api/music/{atid}",
            headers=_auth_headers(context["u1_token"]),
            timeout=30,
        )
        assert rd.status_code == 403, f"expected 403, got {rd.status_code} {rd.text}"


# ---------------- Music requests ----------------

class TestMusicRequests:
    def test_09_create_request_as_user(self, context):
        r = requests.post(
            f"{BASE_URL}/api/music/requests",
            headers=_auth_headers(context["u1_token"]),
            json={"message": "Please add some lo-fi hip hop tracks"},
            timeout=30,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        body = r.json()
        assert body.get("ok") is True
        assert body.get("request_id")
        context["request_id"] = body["request_id"]

    def test_10_list_mine_includes_pending(self, context):
        rid = context["request_id"]
        r = requests.get(
            f"{BASE_URL}/api/music/requests/mine",
            headers=_auth_headers(context["u1_token"]),
            timeout=30,
        )
        assert r.status_code == 200
        items = r.json()
        mine = [x for x in items if x.get("request_id") == rid]
        assert len(mine) == 1
        assert mine[0].get("status") == "pending"
        assert mine[0].get("message") == "Please add some lo-fi hip hop tracks"

    def test_11_non_admin_cannot_list_all(self, context):
        r = requests.get(
            f"{BASE_URL}/api/music/requests",
            headers=_auth_headers(context["u1_token"]),
            timeout=30,
        )
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"

    def test_12_admin_can_list_all(self, context):
        rid = context["request_id"]
        r = requests.get(
            f"{BASE_URL}/api/music/requests",
            headers=_auth_headers(context["admin_token"]),
            timeout=30,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        items = r.json()
        assert any(x.get("request_id") == rid for x in items), "created request not in admin list"

    def test_13_admin_patch_request(self, context):
        rid = context["request_id"]
        r = requests.patch(
            f"{BASE_URL}/api/music/requests/{rid}",
            headers=_auth_headers(context["admin_token"]),
            json={"status": "fulfilled", "admin_note": "Added lo-fi playlist"},
            timeout=30,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        assert r.json().get("ok") is True

    def test_14_user_sees_fulfilled_status(self, context):
        rid = context["request_id"]
        r = requests.get(
            f"{BASE_URL}/api/music/requests/mine",
            headers=_auth_headers(context["u1_token"]),
            timeout=30,
        )
        assert r.status_code == 200
        mine = [x for x in r.json() if x.get("request_id") == rid]
        assert len(mine) == 1
        assert mine[0].get("status") == "fulfilled"
        assert mine[0].get("admin_note") == "Added lo-fi playlist"

    def test_15_user_deletes_own_request(self, context):
        rid = context["request_id"]
        r = requests.delete(
            f"{BASE_URL}/api/music/requests/{rid}",
            headers=_auth_headers(context["u1_token"]),
            timeout=30,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        # Verify gone
        r2 = requests.get(
            f"{BASE_URL}/api/music/requests/mine",
            headers=_auth_headers(context["u1_token"]),
            timeout=30,
        )
        assert r2.status_code == 200
        assert not any(x.get("request_id") == rid for x in r2.json())

    def test_16_empty_message_rejected(self, context):
        r = requests.post(
            f"{BASE_URL}/api/music/requests",
            headers=_auth_headers(context["u1_token"]),
            json={"message": "   "},
            timeout=30,
        )
        assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text}"
