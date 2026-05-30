"""
Backend tests for MindTrack Awards state machine + claim flow.

Targets http://localhost:8001/api (per main agent instructions).
Uses pymongo for the force-bump-to-100-points step.
"""

import os
import sys
import uuid
import traceback
from typing import Optional

import requests
from pymongo import MongoClient

BASE_URL = "http://localhost:8001/api"
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "mental_health_app")

mongo = MongoClient(MONGO_URL)
db = mongo[DB_NAME]

results = []  # list of (name, passed, detail)


def record(name: str, passed: bool, detail: str = ""):
    status = "PASS" if passed else "FAIL"
    print(f"[{status}] {name}: {detail}")
    results.append((name, passed, detail))


def register_user():
    suffix = uuid.uuid4().hex[:8]
    payload = {
        "email": f"awards_tester_{suffix}@test.dev",
        "username": f"awards_{suffix}",
        "password": "AwardsP@ss123",
        "first_name": "Amelia",
        "last_name": "Reyes",
    }
    r = requests.post(f"{BASE_URL}/auth/register", json=payload, timeout=15)
    r.raise_for_status()
    data = r.json()
    return data["access_token"], data["user"], payload


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def main() -> int:
    try:
        token, user, reg = register_user()
        user_id = user["user_id"]
        print(f"Registered: {user_id} / {user['email']}")
    except Exception as e:
        record("Register fresh user", False, f"{type(e).__name__}: {e}")
        return 1

    h = auth_headers(token)

    # --- Scenario 1 ---
    try:
        r = requests.get(f"{BASE_URL}/awards/progress", headers=h, timeout=10)
        assert r.status_code == 200, f"HTTP {r.status_code} body={r.text}"
        data = r.json()
        ok = (
            data.get("choice") is None
            and data.get("points") == 0
            and data.get("goal") == 100
            and data.get("status") == "picking"
        )
        record("S1 GET /awards/progress on fresh user", ok, f"shape={data}")
    except Exception as e:
        record("S1 GET /awards/progress on fresh user", False, f"{type(e).__name__}: {e}")

    # --- Scenario 2 ---
    try:
        r = requests.post(
            f"{BASE_URL}/awards/choice", headers=h,
            json={"choice": "treasure_chest"}, timeout=10,
        )
        assert r.status_code == 200, f"HTTP {r.status_code} body={r.text}"
        choice_resp = r.json()
        r2 = requests.get(f"{BASE_URL}/awards/progress", headers=h, timeout=10)
        assert r2.status_code == 200, f"HTTP {r2.status_code} body={r2.text}"
        prog = r2.json()
        ok = (
            choice_resp.get("ok") is True
            and choice_resp.get("choice") == "treasure_chest"
            and prog.get("choice") == "treasure_chest"
            and prog.get("status") == "in_progress"
            and prog.get("points") == 0
            and prog.get("goal") == 100
        )
        record("S2 POST /awards/choice treasure_chest then GET progress",
               ok, f"choice_resp={choice_resp} progress={prog}")
    except Exception as e:
        record("S2 POST /awards/choice treasure_chest then GET progress",
               False, f"{type(e).__name__}: {e}")

    # --- Scenario 3 ---
    try:
        r = requests.post(
            f"{BASE_URL}/awards/choice", headers=h,
            json={"choice": "flowers"}, timeout=10,
        )
        ok = r.status_code == 409 and "in progress" in (r.text or "").lower()
        record("S3 POST /awards/choice while in_progress -> 409",
               ok, f"HTTP {r.status_code} body={r.text[:200]}")
    except Exception as e:
        record("S3 POST /awards/choice while in_progress -> 409",
               False, f"{type(e).__name__}: {e}")

    # --- Scenario 4 ---
    try:
        rc = requests.post(
            f"{BASE_URL}/tasks", headers=h,
            json={"title": "Drink water", "notify_interval_minutes": 10},
            timeout=10,
        )
        assert rc.status_code == 200, f"create HTTP {rc.status_code} body={rc.text}"
        task = rc.json()
        task_id = task["task_id"]
        rd = requests.post(
            f"{BASE_URL}/tasks/check", headers=h,
            json={"task_id": task_id, "action": "done"},
            timeout=10,
        )
        assert rd.status_code == 200, f"check HTTP {rd.status_code} body={rd.text}"
        r2 = requests.get(f"{BASE_URL}/awards/progress", headers=h, timeout=10)
        prog = r2.json()
        ok = (
            prog.get("points") == 1
            and prog.get("status") == "in_progress"
            and prog.get("choice") == "treasure_chest"
            and prog.get("goal") == 100
        )
        record("S4 Task done increments points to 1, status remains in_progress",
               ok, f"progress={prog}")
    except Exception as e:
        record("S4 Task done increments points to 1, status remains in_progress",
               False, f"{type(e).__name__}: {e}")

    # --- Scenario 5 ---
    try:
        upd = db.award_progress.update_one(
            {"user_id": user_id},
            {"$set": {"points": 100, "status": "ready_to_claim"}},
        )
        assert upd.matched_count == 1, f"matched_count={upd.matched_count}"
        r2 = requests.get(f"{BASE_URL}/awards/progress", headers=h, timeout=10)
        prog = r2.json()
        ok = (
            prog.get("points") == 100
            and prog.get("status") == "ready_to_claim"
            and prog.get("choice") == "treasure_chest"
            and prog.get("goal") == 100
        )
        record("S5 Force-bump to 100 -> status=ready_to_claim", ok, f"progress={prog}")
    except Exception as e:
        record("S5 Force-bump to 100 -> status=ready_to_claim", False,
               f"{type(e).__name__}: {e}")

    # --- Scenario 5b ---
    try:
        r = requests.post(
            f"{BASE_URL}/awards/choice", headers=h,
            json={"choice": "candy"}, timeout=10,
        )
        ok = r.status_code == 409
        record("S5b POST /awards/choice while ready_to_claim -> 409",
               ok, f"HTTP {r.status_code} body={r.text[:200]}")
    except Exception as e:
        record("S5b POST /awards/choice while ready_to_claim -> 409",
               False, f"{type(e).__name__}: {e}")

    # --- Scenario 6 ---
    claim_payload = {
        "full_name": "Amelia Reyes",
        "address": "742 Evergreen Terrace, Springfield, IL 62704",
        "email": "amelia.reyes@test.dev",
        "phone": "+1-555-867-5309",
    }
    claim_id: Optional[str] = None
    try:
        r = requests.post(f"{BASE_URL}/awards/claim", headers=h,
                          json=claim_payload, timeout=10)
        assert r.status_code == 200, f"HTTP {r.status_code} body={r.text}"
        data = r.json()
        claim_id = data.get("claim_id")
        r2 = requests.get(f"{BASE_URL}/awards/progress", headers=h, timeout=10)
        prog = r2.json()
        ok = (
            data.get("ok") is True
            and bool(claim_id)
            and claim_id.startswith("claim_")
            and prog.get("status") == "picking"
            and prog.get("choice") is None
            and prog.get("points") == 0
            and prog.get("goal") == 100
        )
        record("S6 POST /awards/claim ready_to_claim -> 200, resets to picking",
               ok, f"claim_resp={data} progress_after={prog}")
    except Exception as e:
        record("S6 POST /awards/claim ready_to_claim -> 200, resets to picking",
               False, f"{type(e).__name__}: {e}")

    # --- Scenario 7 ---
    try:
        r = requests.post(f"{BASE_URL}/awards/claim", headers=h,
                          json=claim_payload, timeout=10)
        ok = r.status_code == 400 and "no prize" in (r.text or "").lower()
        record("S7 POST /awards/claim while picking -> 400 'No prize to claim'",
               ok, f"HTTP {r.status_code} body={r.text[:200]}")
    except Exception as e:
        record("S7 POST /awards/claim while picking -> 400 'No prize to claim'",
               False, f"{type(e).__name__}: {e}")

    # --- Scenario 7b: claim while in_progress -> 400 'more points' ---
    try:
        r0 = requests.post(f"{BASE_URL}/awards/choice", headers=h,
                           json={"choice": "flowers"}, timeout=10)
        assert r0.status_code == 200, f"choice flowers HTTP {r0.status_code} body={r0.text}"
        r = requests.post(f"{BASE_URL}/awards/claim", headers=h,
                          json=claim_payload, timeout=10)
        ok = r.status_code == 400 and "more points" in (r.text or "").lower()
        record("S7b POST /awards/claim while in_progress (not ready) -> 400",
               ok, f"HTTP {r.status_code} body={r.text[:200]}")
    except Exception as e:
        record("S7b POST /awards/claim while in_progress (not ready) -> 400",
               False, f"{type(e).__name__}: {e}")

    # --- Scenario 8 ---
    try:
        r = requests.post(f"{BASE_URL}/awards/choice", headers=h,
                          json={"choice": "invalid"}, timeout=10)
        ok = r.status_code == 422
        record("S8 POST /awards/choice invalid -> 422", ok,
               f"HTTP {r.status_code} body={r.text[:200]}")
    except Exception as e:
        record("S8 POST /awards/choice invalid -> 422", False,
               f"{type(e).__name__}: {e}")

    # --- Scenario 9 ---
    try:
        notice = None
        if claim_id:
            notice = db.admin_notices.find_one({"claim_id": claim_id})
        if notice is None:
            notice = db.admin_notices.find_one(
                {"user_id": user_id, "claim_id": {"$exists": True}}
            )
        msg = (notice or {}).get("message", "")
        ok = (
            notice is not None
            and claim_payload["full_name"] in msg
            and claim_payload["address"] in msg
            and claim_payload["phone"] in msg
            and claim_payload["email"] in msg
        )
        record("S9 admin_notices doc contains full_name + address + phone (+ email)",
               ok, f"notice_message={msg!r}")
    except Exception as e:
        record("S9 admin_notices doc contains full_name + address + phone (+ email)",
               False, f"{type(e).__name__}: {e}")

    # --- Summary ---
    print("\n========== SUMMARY ==========")
    passed = sum(1 for _, p, _ in results if p)
    total = len(results)
    for name, p, _ in results:
        print(f"  [{'PASS' if p else 'FAIL'}] {name}")
    print(f"\n{passed}/{total} scenarios passed")
    return 0 if passed == total else 2


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        traceback.print_exc()
        sys.exit(1)
