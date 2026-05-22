"""
Backend test for MindTrack Stripe subscription + first/last name flow.
Tests the 8 scenarios in the review request.
"""
import os
import json
import uuid
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = "https://symptom-journal-12.preview.emergentagent.com/api"

def _rand():
    return uuid.uuid4().hex[:10]

def _print(label, r):
    body_snip = r.text[:400]
    print(f"[{label}] HTTP {r.status_code} :: {body_snip}")

results = {}

def record(name, ok, detail=""):
    results[name] = {"ok": ok, "detail": detail}
    flag = "PASS" if ok else "FAIL"
    print(f"  -> {flag}: {name} :: {detail}\n")

# ----------------------------------------------------------------------------
# Scenario 1: Register WITH first_name + last_name
# ----------------------------------------------------------------------------
email1 = f"jordan_{_rand()}@test.dev"
username1 = f"jordan_{_rand()}"
body1 = {
    "email": email1,
    "username": username1,
    "password": "secret6",
    "first_name": "Jordan",
    "last_name": "Lee",
}
print("\n=== Scenario 1: register WITH first/last name ===")
r1 = requests.post(f"{BASE_URL}/auth/register", json=body1, timeout=30)
_print("S1 register", r1)

token1 = None
user1 = None
user_id1 = None
if r1.status_code == 200:
    j = r1.json()
    token1 = j.get("access_token")
    user1 = j.get("user") or {}
    user_id1 = user1.get("user_id")
    checks = []
    checks.append(("access_token present", bool(token1)))
    checks.append(("user.first_name=='Jordan'", user1.get("first_name") == "Jordan"))
    checks.append(("user.last_name=='Lee'", user1.get("last_name") == "Lee"))
    checks.append(("user.name=='Jordan Lee'", user1.get("name") == "Jordan Lee"))
    checks.append(("user.subscription_status=='trialing'", user1.get("subscription_status") == "trialing"))
    checks.append(("user.has_access==True", user1.get("has_access") is True))
    trial_end_str = user1.get("trial_end")
    te_ok = False
    if trial_end_str:
        try:
            te = datetime.fromisoformat(trial_end_str.replace("Z", "+00:00"))
            delta_days = (te - datetime.now(timezone.utc)).total_seconds() / 86400
            te_ok = 6.5 <= delta_days <= 7.5
            checks.append((f"trial_end ~7d from now (got {delta_days:.2f}d)", te_ok))
        except Exception as e:
            checks.append((f"trial_end parse error: {e}", False))
    else:
        checks.append(("trial_end present", False))
    all_ok = all(ok for _, ok in checks)
    record("Scenario 1 (register w/ first+last name)", all_ok, "; ".join(f"{k}={v}" for k, v in checks))
else:
    record("Scenario 1 (register w/ first+last name)", False, f"HTTP {r1.status_code}: {r1.text[:200]}")

# ----------------------------------------------------------------------------
# Scenario 2: Register WITHOUT first_name field → expect 422
# ----------------------------------------------------------------------------
print("\n=== Scenario 2: register WITHOUT first_name ===")
body2 = {
    "email": f"noFn_{_rand()}@test.dev",
    "username": f"nofn_{_rand()}",
    "password": "secret6",
    "last_name": "Lee",
}
r2 = requests.post(f"{BASE_URL}/auth/register", json=body2, timeout=30)
_print("S2 register no first_name", r2)
record("Scenario 2 (missing first_name -> 422)", r2.status_code == 422, f"got HTTP {r2.status_code}")

# ----------------------------------------------------------------------------
# Scenario 3: Register with empty first_name -> 400
# ----------------------------------------------------------------------------
print("\n=== Scenario 3: register with empty first_name ===")
body3 = {
    "email": f"empty_{_rand()}@test.dev",
    "username": f"empty_{_rand()}",
    "password": "secret6",
    "first_name": "",
    "last_name": "Lee",
}
r3 = requests.post(f"{BASE_URL}/auth/register", json=body3, timeout=30)
_print("S3 register empty first_name", r3)
detail3 = ""
try:
    detail3 = r3.json().get("detail", "")
except Exception:
    detail3 = r3.text
ok3 = r3.status_code == 400 and "First name is required" in detail3
record("Scenario 3 (empty first_name -> 400)", ok3, f"HTTP {r3.status_code}, detail='{detail3}'")

# ----------------------------------------------------------------------------
# Scenario 4: GET /api/auth/me using token from scenario 1
# ----------------------------------------------------------------------------
print("\n=== Scenario 4: GET /api/auth/me ===")
if token1:
    r4 = requests.get(f"{BASE_URL}/auth/me", headers={"Authorization": f"Bearer {token1}"}, timeout=30)
    _print("S4 /auth/me", r4)
    if r4.status_code == 200:
        u = r4.json()
        checks = [
            ("first_name=='Jordan'", u.get("first_name") == "Jordan"),
            ("last_name=='Lee'", u.get("last_name") == "Lee"),
            ("name=='Jordan Lee'", u.get("name") == "Jordan Lee"),
            ("subscription_status=='trialing'", u.get("subscription_status") == "trialing"),
            ("has_access==True", u.get("has_access") is True),
        ]
        te = u.get("trial_end")
        te_ok = False
        if te:
            try:
                tedt = datetime.fromisoformat(te.replace("Z", "+00:00"))
                d = (tedt - datetime.now(timezone.utc)).total_seconds() / 86400
                te_ok = 6.5 <= d <= 7.5
                checks.append((f"trial_end ~7d (got {d:.2f}d)", te_ok))
            except Exception as e:
                checks.append((f"trial_end parse err {e}", False))
        all_ok = all(ok for _, ok in checks)
        record("Scenario 4 (/auth/me)", all_ok, "; ".join(f"{k}={v}" for k, v in checks))
    else:
        record("Scenario 4 (/auth/me)", False, f"HTTP {r4.status_code}: {r4.text[:200]}")
else:
    record("Scenario 4 (/auth/me)", False, "skipped - no token from S1")

# ----------------------------------------------------------------------------
# Scenario 5: GET /api/billing/status
# ----------------------------------------------------------------------------
print("\n=== Scenario 5: GET /api/billing/status ===")
if token1:
    r5 = requests.get(f"{BASE_URL}/billing/status", headers={"Authorization": f"Bearer {token1}"}, timeout=30)
    _print("S5 /billing/status", r5)
    if r5.status_code == 200:
        b = r5.json()
        checks = [
            ("subscription_status=='trialing'", b.get("subscription_status") == "trialing"),
            ("has_access==True", b.get("has_access") is True),
            ("price_usd=='1.99'", str(b.get("price_usd")) == "1.99"),
            ("trial_days==7", b.get("trial_days") == 7),
            ("trial_end is ISO string", isinstance(b.get("trial_end"), str) and "T" in (b.get("trial_end") or "")),
        ]
        all_ok = all(ok for _, ok in checks)
        record("Scenario 5 (/billing/status)", all_ok, "; ".join(f"{k}={v}" for k, v in checks))
    else:
        record("Scenario 5 (/billing/status)", False, f"HTTP {r5.status_code}: {r5.text[:200]}")
else:
    record("Scenario 5 (/billing/status)", False, "skipped - no token")

# ----------------------------------------------------------------------------
# Scenario 6: POST /api/billing/checkout
# ----------------------------------------------------------------------------
print("\n=== Scenario 6: POST /api/billing/checkout ===")
if token1:
    r6 = requests.post(f"{BASE_URL}/billing/checkout", headers={"Authorization": f"Bearer {token1}"}, timeout=30)
    _print("S6 /billing/checkout", r6)
    if r6.status_code == 200:
        url = (r6.json() or {}).get("checkout_url", "")
        checks = [
            ("starts with stripe payment link", url.startswith("https://buy.stripe.com/fZu7sK4Nj96b0qn6nI0Ny02")),
            (f"contains client_reference_id={user_id1}", f"client_reference_id={user_id1}" in url),
            (f"contains prefilled_email={email1}", f"prefilled_email={email1}" in url),
        ]
        all_ok = all(ok for _, ok in checks)
        record("Scenario 6 (/billing/checkout)", all_ok, f"url='{url}' :: " + "; ".join(f"{k}={v}" for k, v in checks))
    else:
        record("Scenario 6 (/billing/checkout)", False, f"HTTP {r6.status_code}: {r6.text[:200]}")
else:
    record("Scenario 6 (/billing/checkout)", False, "skipped - no token")

# ----------------------------------------------------------------------------
# Scenario 7: POST /api/billing/portal — no stripe_customer_id -> 400
# ----------------------------------------------------------------------------
print("\n=== Scenario 7: POST /api/billing/portal (no customer yet) ===")
if token1:
    r7 = requests.post(f"{BASE_URL}/billing/portal", headers={"Authorization": f"Bearer {token1}"}, timeout=30)
    _print("S7 /billing/portal", r7)
    detail7 = ""
    try:
        detail7 = r7.json().get("detail", "")
    except Exception:
        detail7 = r7.text
    ok7 = r7.status_code == 400 and detail7.startswith("No subscription yet")
    record("Scenario 7 (/billing/portal w/o customer -> 400)", ok7,
           f"HTTP {r7.status_code}, detail='{detail7}'")
else:
    record("Scenario 7 (/billing/portal w/o customer -> 400)", False, "skipped - no token")

# ----------------------------------------------------------------------------
# Scenario 8: POST /api/billing/webhook (no signature, no secret)
# ----------------------------------------------------------------------------
print("\n=== Scenario 8: POST /api/billing/webhook (no signature, no secret) ===")
if user_id1:
    webhook_payload = {
        "id": "evt_test_1",
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "client_reference_id": user_id1,
                "customer": "cus_test123",
                "subscription": "sub_test456",
            }
        },
    }
    r8 = requests.post(
        f"{BASE_URL}/billing/webhook",
        data=json.dumps(webhook_payload),
        headers={"Content-Type": "application/json"},
        timeout=30,
    )
    _print("S8 /billing/webhook", r8)
    received_ok = False
    if r8.status_code == 200:
        try:
            received_ok = r8.json().get("received") is True
        except Exception:
            pass
    record("Scenario 8a (webhook returns {received:true})", received_ok,
           f"HTTP {r8.status_code}, body={r8.text[:200]}")

    # 8b: GET /api/auth/me — still trialing
    if token1:
        r8b = requests.get(f"{BASE_URL}/auth/me", headers={"Authorization": f"Bearer {token1}"}, timeout=30)
        _print("S8b /auth/me after webhook", r8b)
        still_trialing = r8b.status_code == 200 and r8b.json().get("subscription_status") == "trialing"
        record("Scenario 8b (/auth/me still trialing)", still_trialing,
               f"subscription_status={r8b.json().get('subscription_status') if r8b.status_code == 200 else 'n/a'}")

        # 8c: POST /api/billing/portal — should NOT be 'No subscription yet' now
        r8c = requests.post(f"{BASE_URL}/billing/portal", headers={"Authorization": f"Bearer {token1}"}, timeout=30)
        _print("S8c /billing/portal after webhook", r8c)
        det8c = ""
        try:
            det8c = r8c.json().get("detail", "")
        except Exception:
            det8c = r8c.text
        no_longer_missing = not det8c.startswith("No subscription yet")
        record("Scenario 8c (/billing/portal no longer 'No subscription yet')", no_longer_missing,
               f"HTTP {r8c.status_code}, detail='{det8c[:200]}'")
else:
    record("Scenario 8 (webhook)", False, "skipped - no user_id from S1")

# ----------------------------------------------------------------------------
print("\n\n================ SUMMARY ================")
passes = sum(1 for v in results.values() if v["ok"])
fails = sum(1 for v in results.values() if not v["ok"])
for name, v in results.items():
    flag = "PASS" if v["ok"] else "FAIL"
    print(f"  {flag}: {name}")
print(f"\nTotal: {passes} passed, {fails} failed of {len(results)}")
