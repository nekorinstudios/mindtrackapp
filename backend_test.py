"""
Backend test for MindTrack points system.
Covers 8 scenarios per agent_communication block (test_sequence 5).
"""

import os
import sys
import uuid
from datetime import datetime, timezone

import requests
from pymongo import MongoClient

BASE_URL = "http://localhost:8001/api"
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "mental_health_app")

mongo = MongoClient(MONGO_URL)
db = mongo[DB_NAME]

results = []


def log(scenario, ok, detail):
    status = "PASS" if ok else "FAIL"
    print(f"[{status}] {scenario}: {detail}")
    results.append((scenario, ok, detail))


def register_user():
    suffix = uuid.uuid4().hex[:8]
    payload = {
        "email": f"points_tester_{suffix}@test.dev",
        "username": f"points_tester_{suffix}",
        "password": "Str0ngPass!2026",
        "first_name": "Riley",
        "last_name": "Chen",
    }
    r = requests.post(f"{BASE_URL}/auth/register", json=payload, timeout=30)
    r.raise_for_status()
    data = r.json()
    return data["access_token"], data["user"]["user_id"], payload["email"]


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def main():
    print(f"=== MindTrack Points System Backend Test ===")
    print(f"BASE_URL = {BASE_URL}")
    print(f"MONGO_URL = {MONGO_URL}  DB_NAME = {DB_NAME}")

    token, user_id, email = register_user()
    print(f"Registered user_id={user_id} email={email}")

    h = auth_headers(token)

    r = requests.get(f"{BASE_URL}/awards/progress", headers=h, timeout=20)
    print(f"Initial /awards/progress -> {r.status_code} {r.json()}")
    assert r.json().get("status") == "picking"

    r = requests.post(f"{BASE_URL}/awards/choice", json={"choice": "flowers"}, headers=h, timeout=20)
    assert r.status_code == 200, f"choice failed: {r.status_code} {r.text}"

    prog = requests.get(f"{BASE_URL}/awards/progress", headers=h, timeout=20).json()
    print(f"After choice /awards/progress -> {prog}")
    assert prog["status"] == "in_progress" and prog["points"] == 0

    # ----- S1: energy_log +1/day cap 1 -----
    r = requests.post(f"{BASE_URL}/energy/log", json={"percent": 50}, headers=h, timeout=20)
    body = r.json()
    print(f"S1a energy/log #1 -> {r.status_code} body={body}")
    log("S1a energy first log awards 1", r.status_code == 200 and body.get("points_awarded") == 1,
        f"points_awarded={body.get('points_awarded')}")

    prog = requests.get(f"{BASE_URL}/awards/progress", headers=h, timeout=20).json()
    log("S1b award_progress.points==1 after one energy log", prog.get("points") == 1, f"progress={prog}")

    # ----- S2: second energy_log same day capped -----
    r = requests.post(f"{BASE_URL}/energy/log", json={"percent": 60}, headers=h, timeout=20)
    body = r.json()
    print(f"S2 energy/log #2 -> {r.status_code} body={body}")
    log("S2 second energy log same day awards 0 (cap)",
        r.status_code == 200 and body.get("points_awarded") == 0,
        f"points_awarded={body.get('points_awarded')}")

    # ----- S3: symptoms_log +2/log cap 5/day -----
    sym_awards = []
    for i in range(6):
        r = requests.post(
            f"{BASE_URL}/symptoms/log",
            json={"symptoms": ["Restless"], "note": f"call {i+1}"},
            headers=h,
            timeout=20,
        )
        b = r.json()
        sym_awards.append(b.get("points_awarded"))
        print(f"S3 symptoms/log #{i+1} -> status={r.status_code} body={b}")

    log("S3 symptoms_log awards 2x5 then 0 (cap)",
        sym_awards[:5] == [2, 2, 2, 2, 2] and sym_awards[5] == 0,
        f"sequence={sym_awards}")

    prog = requests.get(f"{BASE_URL}/awards/progress", headers=h, timeout=20).json()
    log("S3b award_progress.points==11 after energy+symptoms",
        prog.get("points") == 11, f"progress.points={prog.get('points')}")

    # ----- S4: tasks by duration_minutes -----
    duration_results = {}
    duration_buckets = [5, 10, 15, 20, 25, 30]
    for dur in duration_buckets:
        db.tasks.update_many(
            {"user_id": user_id},
            {"$set": {"done_at": None, "status": "pending"}},
        )
        r = requests.post(
            f"{BASE_URL}/tasks",
            json={"title": f"task-{dur}min", "duration_minutes": dur, "notify_interval_minutes": 10},
            headers=h,
            timeout=20,
        )
        assert r.status_code == 200, f"task create failed: {r.text}"
        tjson = r.json()
        task_id = tjson["task_id"]
        assert tjson["duration_minutes"] == dur, f"expected duration_minutes={dur} got {tjson['duration_minutes']}"
        r = requests.post(
            f"{BASE_URL}/tasks/check",
            json={"task_id": task_id, "action": "done"},
            headers=h,
            timeout=20,
        )
        b = r.json()
        duration_results[dur] = b.get("points_awarded")
        print(f"S4 task duration={dur}min -> status={r.status_code} body={b}")

    expected = {5: 1, 10: 1, 15: 1, 20: 2, 25: 2, 30: 2}
    log("S4 task duration -> points mapping correct",
        duration_results == expected,
        f"results={duration_results} expected={expected}")

    prog = requests.get(f"{BASE_URL}/awards/progress", headers=h, timeout=20).json()
    log("S4b award_progress.points==20 after tasks",
        prog.get("points") == 20, f"progress.points={prog.get('points')}")

    # ----- S5: journal +1/day cap 1 -----
    r = requests.post(f"{BASE_URL}/journal", json={"text": "first journal of the day"}, headers=h, timeout=20)
    j1 = r.json()
    print(f"S5a journal #1 -> status={r.status_code} body={j1}")
    log("S5a first journal awards 1",
        r.status_code == 200 and j1.get("points_awarded") == 1,
        f"points_awarded={j1.get('points_awarded')}")

    r = requests.post(f"{BASE_URL}/journal", json={"text": "second journal same day"}, headers=h, timeout=20)
    j2 = r.json()
    print(f"S5b journal #2 -> status={r.status_code} body={j2}")
    log("S5b second journal awards 0 (cap)",
        r.status_code == 200 and j2.get("points_awarded") == 0,
        f"points_awarded={j2.get('points_awarded')}")

    prog = requests.get(f"{BASE_URL}/awards/progress", headers=h, timeout=20).json()
    log("S5c award_progress.points==21 after journal",
        prog.get("points") == 21, f"progress.points={prog.get('points')}")

    # ----- S6: reports/send -----
    report_send_status = None
    report_points = None
    try:
        r = requests.post(
            f"{BASE_URL}/reports/send",
            json={"doctor_email": "nekorinstudios@gmail.com", "days": 30},
            headers=h,
            timeout=60,
        )
        print(f"S6 reports/send -> status={r.status_code} body={r.text[:400]}")
        if r.status_code == 200:
            b = r.json()
            report_send_status = b.get("status")
            report_points = b.get("points_awarded")
    except Exception as e:
        print(f"  exception: {e}")

    if report_send_status == "sent":
        log("S6a report_send awards 5 when status==sent",
            report_points == 5, f"points_awarded={report_points}")
        r = requests.post(
            f"{BASE_URL}/reports/send",
            json={"doctor_email": "nekorinstudios@gmail.com", "days": 30},
            headers=h,
            timeout=60,
        )
        print(f"S6b second reports/send -> {r.status_code} {r.text[:300]}")
        if r.status_code == 200:
            b = r.json()
            log("S6b second report same week awards 0 (cap)",
                b.get("points_awarded") == 0, f"points_awarded={b.get('points_awarded')}")
        else:
            log("S6b second report failed at provider", False,
                f"status={r.status_code} body={r.text[:200]}")
    else:
        rs_count = db.points_ledger.count_documents({"user_id": user_id, "action": "report_send"})
        log("S6 report_send did not succeed -> no ledger row",
            rs_count == 0,
            f"points_ledger report_send rows={rs_count}, report status={report_send_status}")

    # ----- S7: ledger integrity -----
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    iso = datetime.now(timezone.utc).isocalendar()
    week = f"{iso[0]}-W{iso[1]:02d}"

    rows = list(db.points_ledger.find({"user_id": user_id}, {"_id": 0}))
    by_action = {}
    for row in rows:
        by_action.setdefault(row["action"], []).append(row)
    print(f"S7 points_ledger ({len(rows)} rows for user):")
    for action, lst in by_action.items():
        print(f"   {action}: count={len(lst)} period_keys={[r['period_key'] for r in lst]} "
              f"applied={[r['applied_to_prize'] for r in lst]} points={[r['points'] for r in lst]}")

    expected_counts = {
        "energy_log": 1,
        "symptoms_log": 5,
        "task_5min": 1,
        "task_10min": 1,
        "task_15min": 1,
        "task_20min": 1,
        "task_25min": 1,
        "task_30min": 1,
        "journal": 1,
    }
    s7_ok = True
    s7_details = []
    for action, expected_n in expected_counts.items():
        actual_n = len(by_action.get(action, []))
        if actual_n != expected_n:
            s7_ok = False
            s7_details.append(f"{action} count={actual_n} expected={expected_n}")
        for row in by_action.get(action, []):
            if row["period_key"] != today:
                s7_ok = False
                s7_details.append(f"{action} period_key={row['period_key']} expected={today}")
            if not row.get("applied_to_prize"):
                s7_ok = False
                s7_details.append(f"{action} applied_to_prize=False")
    log("S7 points_ledger row counts + period_keys + applied_to_prize",
        s7_ok, "; ".join(s7_details) if s7_details else "all expected rows present, daily period_key correct, applied_to_prize=True")

    if "report_send" in by_action:
        rok = all(r["period_key"] == week for r in by_action["report_send"])
        log("S7b report_send weekly period_key",
            rok, f"period_keys={[r['period_key'] for r in by_action['report_send']]} expected_week={week}")

    # ----- S8: award_progress.points == sum credited -----
    prog = requests.get(f"{BASE_URL}/awards/progress", headers=h, timeout=20).json()
    final_points = prog.get("points")
    credited = sum(r["points"] for r in rows if r.get("applied_to_prize"))
    print(f"S8 final award_progress.points={final_points}, sum(credited ledger)={credited}")
    log("S8 award_progress.points == sum of credited ledger rows (capped at 100)",
        final_points == min(credited, 100),
        f"progress={final_points} sum={credited}")

    print("\n=== SUMMARY ===")
    failed = [r for r in results if not r[1]]
    for s, ok, d in results:
        print(f"  [{'PASS' if ok else 'FAIL'}] {s} :: {d}")
    print(f"\n{len(results) - len(failed)}/{len(results)} passed; {len(failed)} failed.")
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
