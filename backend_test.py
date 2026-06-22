"""
Backend test for: Admin prize options catalog + claim flow with option_id.
10 scenarios per review request.
Targets http://localhost:8001/api.
Admin: admin@mindtrack.app / Admin@12345
"""
import base64
import os
import sys
import uuid
import time
import requests
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

API = "http://localhost:8001/api"
ADMIN_EMAIL = "admin@mindtrack.app"
ADMIN_PASS = "Admin@12345"

mongo = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

results = []  # list of (label, pass_bool, detail)


def record(label, ok, detail=""):
    results.append((label, ok, detail))
    icon = "PASS" if ok else "FAIL"
    print(f"[{icon}] {label} :: {detail}")


def register_user(suffix=""):
    suf = suffix or uuid.uuid4().hex[:8]
    body = {
        "email": f"prizetest_{suf}@test.dev",
        "username": f"prize_{suf}",
        "password": "Test@12345",
        "first_name": "Prize",
        "last_name": "Tester",
    }
    r = requests.post(f"{API}/auth/register", json=body, timeout=15)
    if r.status_code != 200:
        raise RuntimeError(f"register failed {r.status_code} {r.text}")
    data = r.json()
    return data["access_token"], data["user"]


def admin_login():
    r = requests.post(
        f"{API}/auth/login",
        json={"identifier": ADMIN_EMAIL, "password": ADMIN_PASS},
        timeout=15,
    )
    if r.status_code != 200:
        raise RuntimeError(f"admin login failed {r.status_code} {r.text}")
    data = r.json()
    return data["access_token"], data["user"]


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


# Tiny 1x1 PNG
PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xff\xff?"
    b"\x00\x05\xfe\x02\xfeA\xc3\x9aR\x00\x00\x00\x00IEND\xaeB`\x82"
)
PNG_B64 = base64.b64encode(PNG_BYTES).decode()


def main():
    # --- Login admin + register first regular user
    print("Setting up actors...")
    admin_tok, admin_user = admin_login()
    print(f"  admin role={admin_user.get('role')} uid={admin_user.get('user_id')}")
    user_tok, user1 = register_user()
    uid1 = user1["user_id"]
    print(f"  user1 uid={uid1}")

    # --- Scenario 1: GET options as fresh user, empty list
    # Clean any pre-existing flowers options to make this assertion meaningful
    mongo.prize_options.delete_many({"category": "flowers"})
    r = requests.get(f"{API}/prizes/options?category=flowers", headers=H(user_tok), timeout=10)
    ok = r.status_code == 200 and r.json() == []
    record("S1 GET /prizes/options?category=flowers as fresh user → 200 []",
           ok, f"status={r.status_code} body={r.text[:120]}")

    # --- Scenario 2: POST as regular user → 403 Admin only
    body = {
        "category": "flowers",
        "name": "Pastel mix",
        "description": "Soft pastel bouquet of roses and tulips",
        "mime": "image/png",
        "image_base64": PNG_B64,
    }
    r = requests.post(f"{API}/prizes/options", json=body, headers=H(user_tok), timeout=10)
    ok = r.status_code == 403 and "Admin only" in r.text
    record("S2 POST /prizes/options as regular user → 403 Admin only",
           ok, f"status={r.status_code} body={r.text[:120]}")

    # --- Scenario 3: POST as admin → 200 ok
    r = requests.post(f"{API}/prizes/options", json=body, headers=H(admin_tok), timeout=10)
    ok = r.status_code == 200 and r.json().get("ok") is True and (r.json().get("option_id") or "").startswith("po_")
    option_id = r.json().get("option_id") if r.status_code == 200 else None
    record("S3 POST /prizes/options as admin → 200 {ok:true, option_id:po_...}",
           ok, f"status={r.status_code} option_id={option_id}")

    # --- Scenario 4: GET as user → 200 with 1 item, fields present
    r = requests.get(f"{API}/prizes/options?category=flowers", headers=H(user_tok), timeout=10)
    body4 = r.json() if r.status_code == 200 else []
    item_ok = False
    if r.status_code == 200 and isinstance(body4, list) and len(body4) == 1:
        it = body4[0]
        item_ok = (
            it.get("option_id") == option_id
            and it.get("category") == "flowers"
            and "description" in it
            and it.get("description") == "Soft pastel bouquet of roses and tulips"
        )
    record("S4 GET /prizes/options?category=flowers → 200 with 1 item (option_id/category/description)",
           item_ok, f"status={r.status_code} count={len(body4) if isinstance(body4, list) else '?'} sample_keys={list(body4[0].keys()) if isinstance(body4, list) and body4 else []}")

    # --- Scenario 5: GET ?category=invalid → 400
    r = requests.get(f"{API}/prizes/options?category=invalid", headers=H(user_tok), timeout=10)
    ok = r.status_code == 400
    record("S5 GET /prizes/options?category=invalid → 400",
           ok, f"status={r.status_code} body={r.text[:120]}")

    # --- Scenario 6: New user picks flowers, force-bump, claim with option_id
    user2_tok, user2 = register_user()
    uid2 = user2["user_id"]
    r = requests.post(f"{API}/awards/choice", json={"choice": "flowers"}, headers=H(user2_tok), timeout=10)
    assert r.status_code == 200, f"choice failed {r.status_code} {r.text}"
    mongo.award_progress.update_one(
        {"user_id": uid2},
        {"$set": {"points": 100, "status": "ready_to_claim"}},
    )
    claim_body = {
        "full_name": "Test User",
        "address": "123 Main St",
        "email": "test@example.com",
        "phone": "5551234",
        "option_id": option_id,
    }
    r = requests.post(f"{API}/awards/claim", json=claim_body, headers=H(user2_tok), timeout=10)
    claim_id = None
    if r.status_code == 200:
        j = r.json()
        claim_id = j.get("claim_id")
        ok6a = j.get("ok") is True and (claim_id or "").startswith("claim_")
    else:
        ok6a = False
    record("S6a POST /awards/claim (valid option) → 200 {ok:true, claim_id:claim_...}",
           ok6a, f"status={r.status_code} claim_id={claim_id} body={r.text[:160]}")

    # After claim, progress should reset
    r = requests.get(f"{API}/awards/progress", headers=H(user2_tok), timeout=10)
    pj = r.json() if r.status_code == 200 else {}
    ok6b = (
        r.status_code == 200
        and pj.get("status") == "picking"
        and pj.get("choice") in (None,)
        and pj.get("points") == 0
    )
    record("S6b After claim, GET /awards/progress → status:picking, choice:null, points:0",
           ok6b, f"status={r.status_code} body={pj}")

    # --- Scenario 7: Same user picks candy, force-bump, try claim with flowers option → 400
    r = requests.post(f"{API}/awards/choice", json={"choice": "candy"}, headers=H(user2_tok), timeout=10)
    assert r.status_code == 200, f"second choice failed {r.status_code} {r.text}"
    mongo.award_progress.update_one(
        {"user_id": uid2},
        {"$set": {"points": 100, "status": "ready_to_claim"}},
    )
    r = requests.post(f"{API}/awards/claim", json=claim_body, headers=H(user2_tok), timeout=10)
    ok7 = (
        r.status_code == 400
        and "does not belong" in r.text.lower() or "category" in r.text.lower()
    )
    # tighter check
    detail_text = ""
    try:
        detail_text = r.json().get("detail", "")
    except Exception:
        detail_text = r.text
    ok7 = r.status_code == 400 and "Selected option does not belong to your earned prize category" in detail_text
    record("S7 Claim flowers option_id while choice=candy → 400 'does not belong to earned prize category'",
           ok7, f"status={r.status_code} detail={detail_text}")

    # --- Scenario 8: same user (still ready_to_claim for candy), claim with nonexistent option
    # progress was NOT reset by S7 failure, so should still be ready_to_claim
    bad_body = dict(claim_body)
    bad_body["option_id"] = "po_nonexistent"
    r = requests.post(f"{API}/awards/claim", json=bad_body, headers=H(user2_tok), timeout=10)
    try:
        detail_text = r.json().get("detail", "")
    except Exception:
        detail_text = r.text
    ok8 = r.status_code == 400 and "Selected prize option not found" in detail_text
    record("S8 Claim with option_id=po_nonexistent → 400 'Selected prize option not found'",
           ok8, f"status={r.status_code} detail={detail_text}")

    # --- Scenario 9: DELETE option as regular user → 403; as admin → 200
    r = requests.delete(f"{API}/prizes/options/{option_id}", headers=H(user_tok), timeout=10)
    ok9a = r.status_code == 403
    record("S9a DELETE /prizes/options/{option_id} as regular user → 403",
           ok9a, f"status={r.status_code} body={r.text[:120]}")

    r = requests.delete(f"{API}/prizes/options/{option_id}", headers=H(admin_tok), timeout=10)
    ok9b = r.status_code == 200 and r.json().get("ok") is True
    record("S9b DELETE /prizes/options/{option_id} as admin → 200 ok",
           ok9b, f"status={r.status_code} body={r.text[:120]}")

    # --- Scenario 10: Mongo verification — award_claims has option_id + option_name; admin_notices has 'Pastel mix'
    claim_doc = mongo.award_claims.find_one({"claim_id": claim_id}) if claim_id else None
    ok10a = bool(
        claim_doc
        and claim_doc.get("option_id") == option_id
        and claim_doc.get("option_name") == "Pastel mix"
    )
    record("S10a db.award_claims has claim doc with option_id & option_name='Pastel mix'",
           ok10a,
           f"option_id_in_doc={claim_doc.get('option_id') if claim_doc else None} option_name={claim_doc.get('option_name') if claim_doc else None}")

    notice = mongo.admin_notices.find_one({"claim_id": claim_id}) if claim_id else None
    ok10b = bool(notice and "Pastel mix" in (notice.get("message") or ""))
    record("S10b db.admin_notices has doc whose message includes 'Pastel mix'",
           ok10b,
           f"message={(notice.get('message') if notice else None)}")

    # Summary
    print("\n=== SUMMARY ===")
    n_pass = sum(1 for _, ok, _ in results if ok)
    n_total = len(results)
    for label, ok, detail in results:
        print(f"  [{'PASS' if ok else 'FAIL'}] {label}")
    print(f"\nTotal: {n_pass}/{n_total} passed")
    sys.exit(0 if n_pass == n_total else 1)


if __name__ == "__main__":
    main()
