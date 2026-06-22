"""Backend tests for MindTrack new endpoints (May 2026).

Covers 5 scenario groups (Streak, Trophy Room, Doctors CRUD, Forgot Password,
Email Verification) per the latest review_request.

Run from /app:
    python /app/backend_test.py
"""

import os
import sys
import uuid
import base64
import time
import requests
from pymongo import MongoClient

API = "http://localhost:8001/api"
ADMIN_EMAIL = "admin@mindtrack.app"
ADMIN_PASSWORD = "Admin@12345"

# 1x1 transparent PNG
TINY_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAASsJTYQAAAAASUVORK5CYII="
)

db = MongoClient("mongodb://localhost:27017")["mental_health_app"]

PASS, FAIL = "PASS", "FAIL"
results = []


def log(name, status, detail=""):
    results.append((name, status, detail))
    icon = "✅" if status == PASS else "❌"
    print(f"{icon} [{status}] {name}")
    if detail:
        print(f"     ↳ {detail}")


def register_fresh(prefix="user"):
    suffix = uuid.uuid4().hex[:8]
    email = f"{prefix}_{suffix}@test.dev"
    username = f"{prefix}_{suffix}"
    password = "Pa$$w0rd123"
    r = requests.post(
        f"{API}/auth/register",
        json={
            "email": email,
            "username": username,
            "password": password,
            "first_name": prefix.capitalize(),
            "last_name": "Tester",
        },
        timeout=20,
    )
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    j = r.json()
    return {
        "token": j["access_token"],
        "user_id": j["user"]["user_id"],
        "email": email,
        "username": username,
        "password": password,
        "headers": {"Authorization": f"Bearer {j['access_token']}"},
    }


def login_admin():
    r = requests.post(
        f"{API}/auth/login",
        json={"identifier": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=20,
    )
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    j = r.json()
    return {"token": j["access_token"], "headers": {"Authorization": f"Bearer {j['access_token']}"}}


# ---------------- SCENARIO 1: Streak ----------------
def scenario_streak():
    print("\n=== Scenario 1: Streak ===")
    u = register_fresh("streak")

    r = requests.get(f"{API}/streak", headers=u["headers"], timeout=15)
    if r.status_code != 200:
        log("S1.1 GET /streak fresh", FAIL, f"HTTP {r.status_code}: {r.text}")
        return
    j = r.json()
    ok = j.get("current_streak") == 0 and j.get("longest_streak") == 0 and j.get("active_today") is False
    log(
        "S1.1 GET /streak fresh user",
        PASS if ok else FAIL,
        f"HTTP 200 body={j}",
    )

    r = requests.post(
        f"{API}/energy/log", json={"percent": 50}, headers=u["headers"], timeout=15
    )
    if r.status_code != 200:
        log("S1.2 POST /energy/log", FAIL, f"HTTP {r.status_code}: {r.text}")
        return
    log("S1.2 POST /energy/log {percent:50}", PASS, f"HTTP 200 points_awarded={r.json().get('points_awarded')}")

    r = requests.get(f"{API}/streak", headers=u["headers"], timeout=15)
    if r.status_code != 200:
        log("S1.3 GET /streak after log", FAIL, f"HTTP {r.status_code}: {r.text}")
        return
    j = r.json()
    ok = j.get("current_streak") == 1 and j.get("active_today") is True
    log(
        "S1.3 GET /streak after energy log",
        PASS if ok else FAIL,
        f"HTTP 200 body={j}",
    )


# ---------------- SCENARIO 2: Trophy room ----------------
def scenario_trophy_room():
    print("\n=== Scenario 2: Trophy Room ===")
    u = register_fresh("trophy")
    admin = login_admin()

    # GET claims fresh → []
    r = requests.get(f"{API}/awards/claims", headers=u["headers"], timeout=15)
    if r.status_code != 200:
        log("S2.1 GET /awards/claims fresh", FAIL, f"HTTP {r.status_code}: {r.text}")
        return
    body = r.json()
    log(
        "S2.1 GET /awards/claims fresh user",
        PASS if body == [] else FAIL,
        f"HTTP 200 body={body}",
    )

    # admin creates prize option
    r = requests.post(
        f"{API}/prizes/options",
        json={
            "category": "flowers",
            "name": "Rose bouquet",
            "description": "Twelve fresh red roses",
            "mime": "image/png",
            "image_base64": TINY_PNG_B64,
        },
        headers=admin["headers"],
        timeout=15,
    )
    if r.status_code != 200:
        log("S2.2 admin POST /prizes/options", FAIL, f"HTTP {r.status_code}: {r.text}")
        return
    option_id = r.json().get("option_id")
    log("S2.2 admin POST /prizes/options", PASS, f"HTTP 200 option_id={option_id}")

    # pick choice
    r = requests.post(
        f"{API}/awards/choice", json={"choice": "flowers"}, headers=u["headers"], timeout=15
    )
    if r.status_code != 200:
        log("S2.3 POST /awards/choice flowers", FAIL, f"HTTP {r.status_code}: {r.text}")
        return
    log("S2.3 POST /awards/choice flowers", PASS, f"HTTP 200 body={r.json()}")

    # force-bump award_progress via pymongo
    res = db.award_progress.update_one(
        {"user_id": u["user_id"]},
        {"$set": {"points": 100, "status": "ready_to_claim"}},
    )
    if res.matched_count != 1:
        log("S2.4 pymongo force-bump", FAIL, f"matched_count={res.matched_count}")
        return
    log("S2.4 pymongo force-bump points=100, status=ready_to_claim", PASS, "matched_count=1")

    # claim
    r = requests.post(
        f"{API}/awards/claim",
        json={
            "full_name": "Trophy Tester",
            "address": "1 Oak Lane, Portland, OR 97201",
            "email": "trophy.tester@example.com",
            "phone": "+1-555-444-3322",
            "option_id": option_id,
        },
        headers=u["headers"],
        timeout=15,
    )
    if r.status_code != 200:
        log("S2.5 POST /awards/claim", FAIL, f"HTTP {r.status_code}: {r.text}")
        return
    claim_id = r.json().get("claim_id")
    log("S2.5 POST /awards/claim", PASS, f"HTTP 200 claim_id={claim_id}")

    # GET claims → 1 with option_image_base64 + option_description
    r = requests.get(f"{API}/awards/claims", headers=u["headers"], timeout=15)
    if r.status_code != 200:
        log("S2.6 GET /awards/claims after claim", FAIL, f"HTTP {r.status_code}: {r.text}")
        return
    body = r.json()
    ok = (
        isinstance(body, list)
        and len(body) == 1
        and body[0].get("claim_id") == claim_id
        and body[0].get("option_image_base64") == TINY_PNG_B64
        and body[0].get("option_description") == "Twelve fresh red roses"
    )
    detail = (
        f"HTTP 200 count={len(body)} "
        f"claim_id={body[0].get('claim_id') if body else None} "
        f"has_image={'option_image_base64' in (body[0] if body else {})} "
        f"option_description={body[0].get('option_description') if body else None}"
    )
    log("S2.6 GET /awards/claims after claim", PASS if ok else FAIL, detail)

    # cleanup: delete the option as admin
    requests.delete(f"{API}/prizes/options/{option_id}", headers=admin["headers"], timeout=15)


# ---------------- SCENARIO 3: Doctors CRUD ----------------
def scenario_doctors():
    print("\n=== Scenario 3: Doctors CRUD + Upsert ===")
    u = register_fresh("doctorcrud")

    r = requests.get(f"{API}/doctors", headers=u["headers"], timeout=15)
    if r.status_code != 200:
        log("S3.1 GET /doctors fresh", FAIL, f"HTTP {r.status_code}: {r.text}")
        return
    log("S3.1 GET /doctors fresh user", PASS if r.json() == [] else FAIL, f"HTTP 200 body={r.json()}")

    r = requests.post(
        f"{API}/doctors",
        json={"name": "Dr. Smith", "email": "smith@clinic.com"},
        headers=u["headers"],
        timeout=15,
    )
    if r.status_code != 200:
        log("S3.2 POST /doctors", FAIL, f"HTTP {r.status_code}: {r.text}")
        return
    j = r.json()
    doctor_id = j.get("doctor_id")
    ok = j.get("ok") is True and isinstance(doctor_id, str) and doctor_id.startswith("doc_")
    log("S3.2 POST /doctors Dr. Smith", PASS if ok else FAIL, f"HTTP 200 doctor_id={doctor_id}")

    r = requests.get(f"{API}/doctors", headers=u["headers"], timeout=15)
    body = r.json() if r.status_code == 200 else []
    ok = r.status_code == 200 and isinstance(body, list) and len(body) == 1 and body[0].get("name") == "Dr. Smith"
    log("S3.3 GET /doctors → 1 item", PASS if ok else FAIL, f"HTTP {r.status_code} count={len(body)} body={body}")

    # Upsert: same email, different name
    r = requests.post(
        f"{API}/doctors",
        json={"name": "Dr. John Smith", "email": "smith@clinic.com"},
        headers=u["headers"],
        timeout=15,
    )
    if r.status_code != 200:
        log("S3.4 POST /doctors upsert", FAIL, f"HTTP {r.status_code}: {r.text}")
        return
    same_id = r.json().get("doctor_id") == doctor_id
    log("S3.4 POST /doctors upsert (same id)", PASS if same_id else FAIL, f"new_id={r.json().get('doctor_id')} prev={doctor_id}")

    r = requests.get(f"{API}/doctors", headers=u["headers"], timeout=15)
    body = r.json() if r.status_code == 200 else []
    ok = r.status_code == 200 and len(body) == 1 and body[0].get("name") == "Dr. John Smith"
    log("S3.5 GET /doctors after upsert (count=1 name updated)", PASS if ok else FAIL, f"count={len(body)} name={body[0].get('name') if body else None}")

    r = requests.delete(f"{API}/doctors/{doctor_id}", headers=u["headers"], timeout=15)
    log("S3.6 DELETE /doctors/{doctor_id}", PASS if r.status_code == 200 else FAIL, f"HTTP {r.status_code} body={r.text}")

    r = requests.get(f"{API}/doctors", headers=u["headers"], timeout=15)
    log("S3.7 GET /doctors after delete", PASS if r.status_code == 200 and r.json() == [] else FAIL, f"HTTP {r.status_code} body={r.json() if r.status_code==200 else r.text}")


# ---------------- SCENARIO 4: Forgot password ----------------
def scenario_forgot_password():
    print("\n=== Scenario 4: Forgot Password ===")
    # Step A: non-existent email — should still return 200 (no enumeration)
    r = requests.post(
        f"{API}/auth/forgot-password",
        json={"email": "nonexistent@nowhere.com"},
        timeout=15,
    )
    ok = r.status_code == 200 and r.json().get("ok") is True
    log("S4.1 forgot-password nonexistent email", PASS if ok else FAIL, f"HTTP {r.status_code} body={r.text}")

    # Step B: real user
    u = register_fresh("forgot")
    r = requests.post(
        f"{API}/auth/forgot-password", json={"email": u["email"]}, timeout=15
    )
    if r.status_code != 200:
        log("S4.2 forgot-password real email", FAIL, f"HTTP {r.status_code}: {r.text}")
        return
    log("S4.2 forgot-password real email", PASS, f"HTTP 200 body={r.text}")

    # Verify reset_code exists in db.users
    user_doc = db.users.find_one({"email": u["email"]})
    reset_code = user_doc.get("reset_code") if user_doc else None
    log(
        "S4.3 db.users.reset_code present",
        PASS if reset_code and len(reset_code) == 6 else FAIL,
        f"reset_code={reset_code}",
    )
    if not reset_code:
        return

    # Step C: reset password using actual code
    new_password = "newPass123"
    r = requests.post(
        f"{API}/auth/reset-password",
        json={"token": reset_code, "new_password": new_password},
        timeout=15,
    )
    log("S4.4 reset-password with valid code", PASS if r.status_code == 200 else FAIL, f"HTTP {r.status_code} body={r.text}")

    # Step D: old password → 401
    r = requests.post(
        f"{API}/auth/login",
        json={"identifier": u["email"], "password": u["password"]},
        timeout=15,
    )
    log("S4.5 login with OLD password → 401", PASS if r.status_code == 401 else FAIL, f"HTTP {r.status_code} body={r.text}")

    # Step E: new password → 200
    r = requests.post(
        f"{API}/auth/login",
        json={"identifier": u["email"], "password": new_password},
        timeout=15,
    )
    log("S4.6 login with NEW password → 200", PASS if r.status_code == 200 else FAIL, f"HTTP {r.status_code}")

    # Step F: bad token → 400
    r = requests.post(
        f"{API}/auth/reset-password",
        json={"token": "000000", "new_password": "anotherPass1"},
        timeout=15,
    )
    body_t = r.text
    ok = r.status_code == 400 and "Invalid or expired reset code" in body_t
    log("S4.7 reset-password with BAD token → 400", PASS if ok else FAIL, f"HTTP {r.status_code} body={body_t}")


# ---------------- SCENARIO 5: Email verification ----------------
def scenario_email_verification():
    print("\n=== Scenario 5: Email Verification ===")
    u = register_fresh("verify")

    r = requests.post(f"{API}/auth/send-verification", headers=u["headers"], timeout=15)
    if r.status_code != 200:
        log("S5.1 POST /auth/send-verification", FAIL, f"HTTP {r.status_code}: {r.text}")
        return
    j = r.json()
    ok = j.get("ok") is True and j.get("sent") is True
    log("S5.1 send-verification → sent:true", PASS if ok else FAIL, f"HTTP 200 body={j}")

    # check verification_code in db
    doc = db.users.find_one({"user_id": u["user_id"]})
    code = doc.get("verification_code") if doc else None
    log(
        "S5.2 db.users.verification_code present",
        PASS if code and len(code) == 6 else FAIL,
        f"verification_code={code}",
    )
    if not code:
        return

    r = requests.post(
        f"{API}/auth/verify-email", json={"code": code}, headers=u["headers"], timeout=15
    )
    ok = r.status_code == 200 and r.json().get("ok") is True
    log("S5.3 verify-email with valid code", PASS if ok else FAIL, f"HTTP {r.status_code} body={r.text}")

    r = requests.get(f"{API}/auth/me", headers=u["headers"], timeout=15)
    me = r.json() if r.status_code == 200 else {}
    log(
        "S5.4 GET /auth/me email_verified:true",
        PASS if r.status_code == 200 and me.get("email_verified") is True else FAIL,
        f"HTTP {r.status_code} email_verified={me.get('email_verified')}",
    )

    # send-verification again → already_verified
    r = requests.post(f"{API}/auth/send-verification", headers=u["headers"], timeout=15)
    j = r.json() if r.status_code == 200 else {}
    ok = r.status_code == 200 and j.get("already_verified") is True
    log("S5.5 send-verification when already verified", PASS if ok else FAIL, f"HTTP {r.status_code} body={j}")


def main():
    print(f"API: {API}")
    print(f"Admin: {ADMIN_EMAIL}")
    try:
        scenario_streak()
        scenario_trophy_room()
        scenario_doctors()
        scenario_forgot_password()
        scenario_email_verification()
    except Exception as exc:
        import traceback
        traceback.print_exc()
        log("UNCAUGHT EXCEPTION", FAIL, str(exc))

    print("\n========= SUMMARY =========")
    passed = sum(1 for _, s, _ in results if s == PASS)
    failed = sum(1 for _, s, _ in results if s == FAIL)
    for name, status, detail in results:
        icon = "✅" if status == PASS else "❌"
        print(f"{icon} {name}")
    print(f"\nTotal: {passed} passed, {failed} failed (of {len(results)})")
    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
