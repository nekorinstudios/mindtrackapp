"""Backend tests for MindTrack focus areas:
1. GET /api/journal/today-context
2. POST /api/journal (same-day linking)
3. POST /api/reports/send (Resend integration)
"""
import os
import sys
import json
import uuid
import requests

BASE = os.environ.get("BACKEND_URL", "https://symptom-journal-12.preview.emergentagent.com").rstrip("/")
API = BASE + "/api"

results = []

def log(name, ok, detail=""):
    status = "PASS" if ok else "FAIL"
    print(f"[{status}] {name} :: {detail}")
    results.append({"name": name, "ok": ok, "detail": detail})


def register_user():
    suffix = uuid.uuid4().hex[:8]
    email = f"jamie.test.{suffix}@example.com"
    username = f"jamie_{suffix}"
    payload = {
        "email": email,
        "username": username,
        "password": "Strong#Pass123",
        "name": "Jamie Tester",
    }
    r = requests.post(f"{API}/auth/register", json=payload, timeout=20)
    r.raise_for_status()
    data = r.json()
    return data["access_token"], data["user"], payload


def main():
    print(f"BASE = {BASE}")
    token, user, creds = register_user()
    h = {"Authorization": f"Bearer {token}"}
    print(f"Registered: {user.get('email')} / {user.get('user_id')}")

    # 1a. today-context fresh
    r = requests.get(f"{API}/journal/today-context", headers=h, timeout=20)
    ok = r.status_code == 200
    body = r.json() if ok else r.text
    log(
        "1a today-context fresh user",
        ok and body.get("symptoms") == [] and body.get("energy_percent") is None,
        f"status={r.status_code} body={body}",
    )

    # 1b. log energy + symptoms then verify
    r2 = requests.post(f"{API}/energy/log", headers=h, json={"percent": 72}, timeout=20)
    log("1b POST /energy/log", r2.status_code == 200, f"status={r2.status_code} body={r2.text[:200]}")

    r3 = requests.post(
        f"{API}/symptoms/log",
        headers=h,
        json={"symptoms": ["Restless", "Low mood"]},
        timeout=20,
    )
    log("1b POST /symptoms/log", r3.status_code == 200, f"status={r3.status_code} body={r3.text[:200]}")

    r4 = requests.get(f"{API}/journal/today-context", headers=h, timeout=20)
    body4 = r4.json() if r4.ok else r4.text
    sset = set(body4.get("symptoms") or []) if isinstance(body4, dict) else set()
    log(
        "1b today-context after logs",
        r4.status_code == 200
        and {"Restless", "Low mood"}.issubset(sset)
        and body4.get("energy_percent") == 72,
        f"status={r4.status_code} body={body4}",
    )

    # 2. POST /api/journal
    r5 = requests.post(f"{API}/journal", headers=h, json={"text": "test entry"}, timeout=20)
    body5 = r5.json() if r5.ok else r5.text
    if isinstance(body5, dict):
        ls = set(body5.get("linked_symptoms") or [])
        ok5 = (
            r5.status_code == 200
            and {"Restless", "Low mood"}.issubset(ls)
            and body5.get("linked_energy_percent") == 72
            and body5.get("entry_id")
            and body5.get("text") == "test entry"
            and isinstance(body5.get("timestamp"), str)
        )
    else:
        ok5 = False
    log("2 POST /journal linking", ok5, f"status={r5.status_code} body={body5}")

    # GET /api/journal contains the entry with linked fields
    r6 = requests.get(f"{API}/journal", headers=h, timeout=20)
    body6 = r6.json() if r6.ok else r6.text
    found = None
    if isinstance(body6, list):
        for e in body6:
            if e.get("entry_id") == (body5.get("entry_id") if isinstance(body5, dict) else None):
                found = e
                break
    ok6 = bool(found) and {"Restless", "Low mood"}.issubset(set(found.get("linked_symptoms") or [])) and found.get("linked_energy_percent") == 72
    log("2 GET /journal entry visible with linked fields", ok6, f"found={found}")

    # 3. POST /api/reports/send
    r7 = requests.post(
        f"{API}/reports/send",
        headers=h,
        json={"doctor_email": "test@example.com", "days": 30},
        timeout=60,
    )
    try:
        body7 = r7.json()
    except Exception:
        body7 = r7.text
    print(f"reports/send raw status={r7.status_code} body={body7}")
    ok7_status = r7.status_code in (200, 502)
    ok7 = False
    note = ""
    if r7.status_code == 200 and isinstance(body7, dict):
        st = body7.get("status")
        ok7 = (
            body7.get("ok") is True
            and isinstance(body7.get("report_id"), str)
            and body7["report_id"].startswith("rep_")
            and body7.get("doctor_email") == "test@example.com"
            and isinstance(body7.get("symptom_entries"), int)
            and isinstance(body7.get("energy_entries"), int)
            and isinstance(body7.get("medicine_entries"), int)
            and isinstance(body7.get("journal_entries"), int)
            and st in ("sent", "not_configured")
        )
        if st == "sent":
            ok7 = ok7 and isinstance(body7.get("resend_id"), str) and len(body7["resend_id"]) > 0
        note = f"status={st} resend_id={body7.get('resend_id')}"
    elif r7.status_code == 502 and isinstance(body7, dict):
        detail = body7.get("detail", "")
        # Expected test-mode restriction
        if "testing emails" in detail or "verify a domain" in detail or "own email address" in detail:
            note = f"EXPECTED Resend test-mode restriction: {detail}"
            ok7 = True  # request DID reach Resend
        else:
            note = f"Unexpected 502: {detail}"
    log("3 POST /reports/send", ok7, f"http={r7.status_code} {note}")

    # Summary
    print("\n=== SUMMARY ===")
    n_ok = sum(1 for r in results if r["ok"])
    print(f"{n_ok}/{len(results)} passed")
    for r in results:
        print(f" - [{'OK' if r['ok'] else 'FAIL'}] {r['name']}")
    sys.exit(0 if n_ok == len(results) else 1)


if __name__ == "__main__":
    main()
