"""Backend API tests for MindTrack mental health tracker."""
import time
import pytest
import requests
from datetime import datetime, timezone


BASE_URL = "https://symptom-journal-12.preview.emergentagent.com"


# --- Health / root ---
def test_root():
    r = requests.get(f"{BASE_URL}/api/", timeout=10)
    assert r.status_code == 200
    assert r.json().get("message") == "MindTrack API"


# --- Auth ---
class TestAuth:
    def test_register_returns_token_and_user(self, test_user):
        assert "token" in test_user and len(test_user["token"]) > 20
        u = test_user["user"]
        assert u["email"] == test_user["email"]
        assert u["username"] == test_user["username"]
        assert u["role"] == "user"
        assert u["disorders"] == []

    def test_register_duplicate(self, test_user):
        r = requests.post(
            f"{BASE_URL}/api/auth/register",
            json={
                "email": test_user["email"],
                "username": test_user["username"],
                "password": test_user["password"],
            },
            timeout=10,
        )
        assert r.status_code == 400

    def test_register_short_password(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": "shortpw_x@example.com", "username": "shortpwx", "password": "123"},
            timeout=10,
        )
        assert r.status_code == 400

    def test_login_via_email(self, test_user):
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"identifier": test_user["email"], "password": test_user["password"]},
            timeout=10,
        )
        assert r.status_code == 200
        assert "access_token" in r.json()

    def test_login_via_username(self, test_user):
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"identifier": test_user["username"], "password": test_user["password"]},
            timeout=10,
        )
        assert r.status_code == 200
        assert "access_token" in r.json()

    def test_login_bad_password(self, test_user):
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"identifier": test_user["email"], "password": "wrong_password"},
            timeout=10,
        )
        assert r.status_code == 401

    def test_me_with_bearer(self, test_user):
        r = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {test_user['token']}"},
            timeout=10,
        )
        assert r.status_code == 200
        assert r.json()["email"] == test_user["email"]

    def test_me_unauth(self):
        r = requests.get(f"{BASE_URL}/api/auth/me", timeout=10)
        assert r.status_code == 401

    def test_google_invalid_session(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/google",
            json={"session_id": "invalid_fake_session_123"},
            timeout=20,
        )
        assert r.status_code == 401


# --- Disorders + Catalog ---
class TestDisordersAndCatalog:
    def test_update_disorders(self, test_user):
        r = requests.post(
            f"{BASE_URL}/api/auth/disorders",
            headers={"Authorization": f"Bearer {test_user['token']}"},
            json={"disorders": ["ADHD", "Bipolar"]},
            timeout=10,
        )
        assert r.status_code == 200
        assert set(r.json()["disorders"]) == {"ADHD", "Bipolar"}

        # verify persistence
        me = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {test_user['token']}"},
            timeout=10,
        )
        assert set(me.json()["disorders"]) == {"ADHD", "Bipolar"}

    def test_catalog_symptoms_filtered(self, test_user):
        r = requests.get(
            f"{BASE_URL}/api/catalog/symptoms",
            headers={"Authorization": f"Bearer {test_user['token']}"},
            timeout=10,
        )
        assert r.status_code == 200
        data = r.json()
        assert "ADHD" in data
        assert "Bipolar" in data
        assert "Autism" not in data
        assert len(data["ADHD"]) > 0

    def test_catalog_assessment(self, test_user):
        r = requests.get(
            f"{BASE_URL}/api/catalog/assessment",
            headers={"Authorization": f"Bearer {test_user['token']}"},
            timeout=10,
        )
        assert r.status_code == 200
        data = r.json()
        for k in ["ADHD", "Bipolar", "Autism"]:
            assert k in data and len(data[k]) == 5


# --- Symptom & energy logs ---
class TestSymptomEnergy:
    def test_log_symptoms(self, test_user):
        r = requests.post(
            f"{BASE_URL}/api/symptoms/log",
            headers={"Authorization": f"Bearer {test_user['token']}"},
            json={"symptoms": ["Trouble focusing", "Restlessness"], "note": "morning"},
            timeout=10,
        )
        assert r.status_code == 200
        assert r.json()["symptoms"] == ["Trouble focusing", "Restlessness"]

        # verify via get
        g = requests.get(
            f"{BASE_URL}/api/symptoms/logs",
            headers={"Authorization": f"Bearer {test_user['token']}"},
            timeout=10,
        )
        assert g.status_code == 200
        assert any("Trouble focusing" in (x.get("symptoms") or []) for x in g.json())

    def test_log_energy_valid(self, test_user):
        r = requests.post(
            f"{BASE_URL}/api/energy/log",
            headers={"Authorization": f"Bearer {test_user['token']}"},
            json={"percent": 65},
            timeout=10,
        )
        assert r.status_code == 200
        assert r.json()["percent"] == 65

    def test_log_energy_invalid(self, test_user):
        r = requests.post(
            f"{BASE_URL}/api/energy/log",
            headers={"Authorization": f"Bearer {test_user['token']}"},
            json={"percent": 150},
            timeout=10,
        )
        assert r.status_code == 422


# --- Tasks ---
class TestTasks:
    def test_task_full_flow_and_anticheat(self, test_user):
        h = {"Authorization": f"Bearer {test_user['token']}"}
        # Create two tasks
        r1 = requests.post(f"{BASE_URL}/api/tasks", headers=h,
                           json={"title": "TEST_task_1", "notify_interval_minutes": 10}, timeout=10)
        assert r1.status_code == 200
        t1 = r1.json()["task_id"]

        r2 = requests.post(f"{BASE_URL}/api/tasks", headers=h,
                           json={"title": "TEST_task_2", "notify_interval_minutes": 15}, timeout=10)
        assert r2.status_code == 200
        t2 = r2.json()["task_id"]

        # List
        lst = requests.get(f"{BASE_URL}/api/tasks", headers=h, timeout=10)
        assert lst.status_code == 200
        titles = [x["title"] for x in lst.json()]
        assert "TEST_task_1" in titles and "TEST_task_2" in titles

        # Start + done task 1
        s1 = requests.post(f"{BASE_URL}/api/tasks/check", headers=h,
                           json={"task_id": t1, "action": "start"}, timeout=10)
        assert s1.status_code == 200
        d1 = requests.post(f"{BASE_URL}/api/tasks/check", headers=h,
                           json={"task_id": t1, "action": "done"}, timeout=10)
        assert d1.status_code == 200

        # Start task 2 then done immediately -> anti-cheat 429
        requests.post(f"{BASE_URL}/api/tasks/check", headers=h,
                      json={"task_id": t2, "action": "start"}, timeout=10)
        d2 = requests.post(f"{BASE_URL}/api/tasks/check", headers=h,
                           json={"task_id": t2, "action": "done"}, timeout=10)
        assert d2.status_code == 429, f"Expected 429 got {d2.status_code}: {d2.text}"
        assert "10 minutes" in d2.json().get("detail", "")

        # Delete task 2
        dl = requests.delete(f"{BASE_URL}/api/tasks/{t2}", headers=h, timeout=10)
        assert dl.status_code == 200

        # Delete unknown -> 404
        dl2 = requests.delete(f"{BASE_URL}/api/tasks/nonexistent", headers=h, timeout=10)
        assert dl2.status_code == 404


# --- Journal ---
class TestJournal:
    def test_create_update_delete_with_linked_symptoms(self, test_user):
        h = {"Authorization": f"Bearer {test_user['token']}"}
        # Log a symptom first so journal auto-links
        requests.post(f"{BASE_URL}/api/symptoms/log", headers=h,
                      json={"symptoms": ["Racing thoughts"]}, timeout=10)

        c = requests.post(f"{BASE_URL}/api/journal", headers=h,
                          json={"text": "TEST journal entry"}, timeout=10)
        assert c.status_code == 200
        entry = c.json()
        assert entry["text"] == "TEST journal entry"
        assert entry.get("linked_symptoms") is not None
        assert "Racing thoughts" in entry["linked_symptoms"]
        entry_id = entry["entry_id"]

        # Patch text + timestamp
        new_ts = datetime(2025, 1, 1, 12, 0, tzinfo=timezone.utc).isoformat()
        p = requests.patch(f"{BASE_URL}/api/journal/{entry_id}", headers=h,
                           json={"text": "edited text", "timestamp": new_ts}, timeout=10)
        assert p.status_code == 200

        # Verify via list
        lst = requests.get(f"{BASE_URL}/api/journal", headers=h, timeout=10).json()
        updated = next(x for x in lst if x["entry_id"] == entry_id)
        assert updated["text"] == "edited text"
        assert "2025-01-01" in updated["timestamp"]

        # Delete
        dl = requests.delete(f"{BASE_URL}/api/journal/{entry_id}", headers=h, timeout=10)
        assert dl.status_code == 200


# --- Awards ---
class TestAwards:
    def test_progress_and_choice(self, test_user):
        h = {"Authorization": f"Bearer {test_user['token']}"}
        p = requests.get(f"{BASE_URL}/api/awards/progress", headers=h, timeout=10)
        assert p.status_code == 200
        data = p.json()
        assert data["goal"] == 30
        # count should be 1 from earlier completed task (TestTasks)
        assert data["count"] >= 1

        c = requests.post(f"{BASE_URL}/api/awards/choice", headers=h,
                          json={"choice": "candy"}, timeout=10)
        assert c.status_code == 200
        assert c.json()["choice"] == "candy"

        p2 = requests.get(f"{BASE_URL}/api/awards/progress", headers=h, timeout=10)
        assert p2.json()["choice"] == "candy"

    def test_invalid_choice(self, test_user):
        h = {"Authorization": f"Bearer {test_user['token']}"}
        r = requests.post(f"{BASE_URL}/api/awards/choice", headers=h,
                          json={"choice": "cash"}, timeout=10)
        assert r.status_code == 422


# --- Report (mocked) ---
class TestReport:
    def test_send_report_mocked(self, test_user):
        h = {"Authorization": f"Bearer {test_user['token']}"}
        r = requests.post(f"{BASE_URL}/api/reports/send", headers=h,
                          json={"doctor_email": "doctor@example.com", "days": 30}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["ok"] is True
        assert data["doctor_email"] == "doctor@example.com"
        assert "MOCKED" in data.get("note", "")


# --- Admin / Music ---
class TestAdmin:
    def test_admin_login_and_notices(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/admin/notices",
                         headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_non_admin_forbidden_notices(self, test_user):
        r = requests.get(f"{BASE_URL}/api/admin/notices",
                         headers={"Authorization": f"Bearer {test_user['token']}"}, timeout=10)
        assert r.status_code == 403

    def test_music_upload_admin_and_non_admin(self, admin_token, test_user):
        # Non-admin forbidden
        import base64
        data_b64 = base64.b64encode(b"fake-audio-bytes").decode()
        r_non = requests.post(
            f"{BASE_URL}/api/music/upload",
            headers={"Authorization": f"Bearer {test_user['token']}"},
            data={"title": "TEST_track", "mime": "audio/mpeg", "data_base64": data_b64},
            timeout=10,
        )
        assert r_non.status_code == 403

        # Admin ok
        r_ok = requests.post(
            f"{BASE_URL}/api/music/upload",
            headers={"Authorization": f"Bearer {admin_token}"},
            data={"title": "TEST_track", "mime": "audio/mpeg", "data_base64": data_b64},
            timeout=10,
        )
        assert r_ok.status_code == 200
        track_id = r_ok.json()["track_id"]

        # list
        lst = requests.get(f"{BASE_URL}/api/music",
                           headers={"Authorization": f"Bearer {test_user['token']}"}, timeout=10)
        assert lst.status_code == 200
        assert any(t["track_id"] == track_id for t in lst.json())

        # cleanup
        requests.delete(f"{BASE_URL}/api/music/{track_id}",
                        headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
