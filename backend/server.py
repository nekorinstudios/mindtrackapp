from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import uuid
import logging
import bcrypt
import jwt
import httpx
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request, UploadFile, File, Form
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field

# --- DB ---
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

# --- Auth helpers ---
JWT_ALGORITHM = "HS256"

def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False

def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(days=30),
        "type": "access",
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

async def get_current_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    token = None
    if auth.startswith("Bearer "):
        token = auth[7:]
    if not token:
        token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# --- Models ---
class RegisterIn(BaseModel):
    email: EmailStr
    username: str
    password: str
    name: Optional[str] = None

class LoginIn(BaseModel):
    identifier: str  # email or username
    password: str

class UserOut(BaseModel):
    user_id: str
    email: str
    username: str
    name: Optional[str] = None
    picture: Optional[str] = None
    disorders: List[str] = []
    role: str = "user"

class AuthOut(BaseModel):
    access_token: str
    user: UserOut

class UpdateDisordersIn(BaseModel):
    disorders: List[Literal["ADHD", "Bipolar", "Autism"]]

class SymptomLogIn(BaseModel):
    symptoms: List[str]
    note: Optional[str] = None

class EnergyLogIn(BaseModel):
    percent: int = Field(ge=0, le=100)

class TaskCreateIn(BaseModel):
    title: str
    notify_interval_minutes: int = 10

class TaskCheckIn(BaseModel):
    task_id: str
    action: Literal["start", "done"]

class JournalIn(BaseModel):
    text: str
    timestamp: Optional[datetime] = None

class JournalUpdateIn(BaseModel):
    text: Optional[str] = None
    timestamp: Optional[datetime] = None

class AwardChoiceIn(BaseModel):
    choice: Literal["flowers", "candy", "giftcard"]

class SendReportIn(BaseModel):
    doctor_email: EmailStr
    days: int = 30

class GoogleAuthIn(BaseModel):
    session_id: str

class MedicineCreateIn(BaseModel):
    name: str
    dosage: Optional[str] = None
    notes: Optional[str] = None


# --- App ---
app = FastAPI(title="MindTrack API")
api = APIRouter(prefix="/api")


# --- Seed / catalog ---
SYMPTOM_CATALOG = {
    "ADHD": [
        "Trouble focusing",
        "Easily distracted",
        "Restlessness",
        "Forgetfulness",
        "Impulsive actions",
        "Procrastination",
        "Trouble finishing tasks",
        "Fidgeting",
    ],
    "Bipolar": [
        "Elevated mood",
        "Racing thoughts",
        "Low mood",
        "Irritability",
        "Hopelessness",
        "Excess energy",
        "Little need for sleep",
        "Anxiety",
    ],
    "Autism": [
        "Sensory overload",
        "Social fatigue",
        "Repetitive behaviors",
        "Strong focus on interests",
        "Difficulty with change",
        "Eye contact discomfort",
        "Sound sensitivity",
        "Stimming",
    ],
}

ASSESSMENT_QUESTIONS = {
    "ADHD": [
        "I often have trouble wrapping up the final details of a project.",
        "I have difficulty getting things in order.",
        "I have problems remembering appointments or obligations.",
        "I avoid or delay tasks that require a lot of thought.",
        "I fidget or squirm when I have to sit for a long time.",
    ],
    "Bipolar": [
        "I have periods of unusually high energy and little need for sleep.",
        "I experience rapid mood swings between highs and lows.",
        "I have periods of racing thoughts or pressured speech.",
        "I experience long stretches of sadness or hopelessness.",
        "I make impulsive decisions during high-energy periods.",
    ],
    "Autism": [
        "I find social small talk draining or confusing.",
        "I'm bothered by certain textures, sounds or lights.",
        "I prefer routine and feel uncomfortable with sudden changes.",
        "I have deep focused interests I can talk about for hours.",
        "I use repetitive movements to self-regulate.",
    ],
}


# --- Auth endpoints ---
@api.post("/auth/register", response_model=AuthOut)
async def register(body: RegisterIn):
    email = body.email.lower().strip()
    username = body.username.lower().strip()
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    if await db.users.find_one({"$or": [{"email": email}, {"username": username}]}):
        raise HTTPException(status_code=400, detail="Email or username already taken")
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    doc = {
        "user_id": user_id,
        "email": email,
        "username": username,
        "name": body.name or username,
        "picture": None,
        "password_hash": hash_password(body.password),
        "disorders": [],
        "role": "user",
        "auth_provider": "password",
        "created_at": datetime.now(timezone.utc),
    }
    await db.users.insert_one(doc)
    token = create_access_token(user_id, email)
    return AuthOut(access_token=token, user=UserOut(**{k: doc[k] for k in ["user_id", "email", "username", "name", "picture", "disorders", "role"]}))


@api.post("/auth/login", response_model=AuthOut)
async def login(body: LoginIn):
    ident = body.identifier.lower().strip()
    user = await db.users.find_one({"$or": [{"email": ident}, {"username": ident}]})
    if not user or not user.get("password_hash") or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token(user["user_id"], user["email"])
    u = {k: user.get(k) for k in ["user_id", "email", "username", "name", "picture", "disorders", "role"]}
    u["disorders"] = u.get("disorders") or []
    u["role"] = u.get("role") or "user"
    return AuthOut(access_token=token, user=UserOut(**u))


@api.post("/auth/google", response_model=AuthOut)
async def google_auth(body: GoogleAuthIn):
    """Exchange Emergent session_id for user info and issue our JWT."""
    try:
        async with httpx.AsyncClient(timeout=15) as hc:
            r = await hc.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": body.session_id},
            )
            if r.status_code != 200:
                raise HTTPException(status_code=401, detail="Invalid session")
            data = r.json()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Auth service error: {e}")

    email = (data.get("email") or "").lower().strip()
    if not email:
        raise HTTPException(status_code=400, detail="No email in auth response")
    name = data.get("name") or email.split("@")[0]
    picture = data.get("picture")

    user = await db.users.find_one({"email": email})
    if not user:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        username = email.split("@")[0] + "_" + uuid.uuid4().hex[:4]
        user = {
            "user_id": user_id,
            "email": email,
            "username": username,
            "name": name,
            "picture": picture,
            "password_hash": None,
            "disorders": [],
            "role": "user",
            "auth_provider": "google",
            "created_at": datetime.now(timezone.utc),
        }
        await db.users.insert_one(user)
    else:
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"name": name, "picture": picture or user.get("picture")}},
        )
        user["name"] = name
        user["picture"] = picture or user.get("picture")

    token = create_access_token(user["user_id"], email)
    u = {k: user.get(k) for k in ["user_id", "email", "username", "name", "picture", "disorders", "role"]}
    u["disorders"] = u.get("disorders") or []
    u["role"] = u.get("role") or "user"
    return AuthOut(access_token=token, user=UserOut(**u))


@api.get("/auth/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)):
    u = {k: user.get(k) for k in ["user_id", "email", "username", "name", "picture", "disorders", "role"]}
    u["disorders"] = u.get("disorders") or []
    u["role"] = u.get("role") or "user"
    return UserOut(**u)


@api.post("/auth/disorders", response_model=UserOut)
async def update_disorders(body: UpdateDisordersIn, user: dict = Depends(get_current_user)):
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"disorders": body.disorders}})
    user["disorders"] = body.disorders
    return UserOut(
        user_id=user["user_id"],
        email=user["email"],
        username=user["username"],
        name=user.get("name"),
        picture=user.get("picture"),
        disorders=body.disorders,
        role=user.get("role") or "user",
    )


# --- Catalog ---
@api.get("/catalog/symptoms")
async def symptom_catalog(user: dict = Depends(get_current_user)):
    result = {}
    for d in user.get("disorders") or []:
        result[d] = SYMPTOM_CATALOG.get(d, [])
    if not result:
        # default: return all
        result = SYMPTOM_CATALOG
    return result


@api.get("/catalog/assessment")
async def assessment_questions():
    return ASSESSMENT_QUESTIONS


# --- Symptom logs ---
@api.post("/symptoms/log")
async def log_symptoms(body: SymptomLogIn, user: dict = Depends(get_current_user)):
    log_id = f"slog_{uuid.uuid4().hex[:12]}"
    doc = {
        "log_id": log_id,
        "user_id": user["user_id"],
        "symptoms": body.symptoms,
        "note": body.note,
        "created_at": datetime.now(timezone.utc),
    }
    await db.symptom_logs.insert_one(doc)
    doc.pop("_id", None)
    doc["created_at"] = doc["created_at"].isoformat()
    return doc


@api.get("/symptoms/logs")
async def get_symptom_logs(days: int = 30, user: dict = Depends(get_current_user)):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    cursor = db.symptom_logs.find(
        {"user_id": user["user_id"], "created_at": {"$gte": since}},
        {"_id": 0},
    ).sort("created_at", -1)
    items = []
    async for d in cursor:
        if isinstance(d.get("created_at"), datetime):
            d["created_at"] = d["created_at"].isoformat()
        items.append(d)
    return items


# --- Energy meter ---
@api.post("/energy/log")
async def log_energy(body: EnergyLogIn, user: dict = Depends(get_current_user)):
    log_id = f"elog_{uuid.uuid4().hex[:12]}"
    doc = {
        "log_id": log_id,
        "user_id": user["user_id"],
        "percent": body.percent,
        "created_at": datetime.now(timezone.utc),
    }
    await db.energy_logs.insert_one(doc)
    doc.pop("_id", None)
    doc["created_at"] = doc["created_at"].isoformat()
    return doc


@api.get("/energy/logs")
async def get_energy_logs(days: int = 30, user: dict = Depends(get_current_user)):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    cursor = db.energy_logs.find(
        {"user_id": user["user_id"], "created_at": {"$gte": since}},
        {"_id": 0},
    ).sort("created_at", -1)
    items = []
    async for d in cursor:
        if isinstance(d.get("created_at"), datetime):
            d["created_at"] = d["created_at"].isoformat()
        items.append(d)
    return items


# --- Tasks ---
@api.post("/tasks")
async def create_task(body: TaskCreateIn, user: dict = Depends(get_current_user)):
    task_id = f"task_{uuid.uuid4().hex[:12]}"
    doc = {
        "task_id": task_id,
        "user_id": user["user_id"],
        "title": body.title,
        "notify_interval_minutes": body.notify_interval_minutes,
        "started_at": None,
        "done_at": None,
        "status": "pending",
        "created_at": datetime.now(timezone.utc),
    }
    await db.tasks.insert_one(doc)
    doc.pop("_id", None)
    for k in ["started_at", "done_at", "created_at"]:
        if isinstance(doc.get(k), datetime):
            doc[k] = doc[k].isoformat()
    return doc


@api.get("/tasks")
async def list_tasks(user: dict = Depends(get_current_user)):
    cursor = db.tasks.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1)
    items = []
    async for d in cursor:
        for k in ["started_at", "done_at", "created_at"]:
            if isinstance(d.get(k), datetime):
                d[k] = d[k].isoformat()
        items.append(d)
    return items


@api.post("/tasks/check")
async def check_task(body: TaskCheckIn, user: dict = Depends(get_current_user)):
    task = await db.tasks.find_one({"task_id": body.task_id, "user_id": user["user_id"]}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    now = datetime.now(timezone.utc)

    if body.action == "start":
        await db.tasks.update_one(
            {"task_id": body.task_id}, {"$set": {"started_at": now, "status": "in_progress"}}
        )
        return {"ok": True, "status": "in_progress"}

    # action == done
    # Anti-cheat: last done task must be >= 10 minutes old
    last_done = await db.tasks.find_one(
        {"user_id": user["user_id"], "status": "done", "done_at": {"$ne": None}},
        {"_id": 0},
        sort=[("done_at", -1)],
    )
    if last_done and last_done.get("done_at"):
        last_dt = last_done["done_at"]
        if last_dt.tzinfo is None:
            last_dt = last_dt.replace(tzinfo=timezone.utc)
        delta = (now - last_dt).total_seconds()
        if delta < 600:
            wait = int((600 - delta) / 60) + 1
            raise HTTPException(
                status_code=429,
                detail=f"Please wait at least 10 minutes between task completions. Try again in ~{wait} min.",
            )

    await db.tasks.update_one(
        {"task_id": body.task_id},
        {"$set": {"done_at": now, "status": "done"}},
    )
    # Award progress: add 1 item to current award
    award = await db.award_progress.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not award:
        await db.award_progress.insert_one(
            {
                "user_id": user["user_id"],
                "choice": "flowers",
                "count": 1,
                "month_start": now.replace(day=1, hour=0, minute=0, second=0, microsecond=0),
                "last_increment": now,
                "notified_admin": False,
            }
        )
    else:
        update = {"$inc": {"count": 1}, "$set": {"last_increment": now}}
        await db.award_progress.update_one({"user_id": user["user_id"]}, update)
        new_count = (award.get("count") or 0) + 1
        if new_count >= 30 and not award.get("notified_admin"):
            await db.admin_notices.insert_one(
                {
                    "notice_id": f"notice_{uuid.uuid4().hex[:10]}",
                    "user_id": user["user_id"],
                    "email": user["email"],
                    "choice": award.get("choice", "flowers"),
                    "created_at": now,
                    "message": f"User {user['email']} completed 30 tasks and earned their monthly reward!",
                }
            )
            await db.award_progress.update_one(
                {"user_id": user["user_id"]}, {"$set": {"notified_admin": True}}
            )

    return {"ok": True, "status": "done"}


@api.delete("/tasks/{task_id}")
async def delete_task(task_id: str, user: dict = Depends(get_current_user)):
    r = await db.tasks.delete_one({"task_id": task_id, "user_id": user["user_id"]})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


# --- Journal ---
@api.post("/journal")
async def create_journal(body: JournalIn, user: dict = Depends(get_current_user)):
    entry_id = f"j_{uuid.uuid4().hex[:12]}"
    ts = body.timestamp or datetime.now(timezone.utc)
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    # Attach recent symptom log if exists within last 2 hours
    recent = await db.symptom_logs.find_one(
        {"user_id": user["user_id"]}, {"_id": 0}, sort=[("created_at", -1)]
    )
    linked = None
    if recent:
        rts = recent.get("created_at")
        if isinstance(rts, datetime):
            if rts.tzinfo is None:
                rts = rts.replace(tzinfo=timezone.utc)
            if (datetime.now(timezone.utc) - rts).total_seconds() <= 7200:
                linked = recent.get("symptoms") or []
    doc = {
        "entry_id": entry_id,
        "user_id": user["user_id"],
        "text": body.text,
        "timestamp": ts,
        "linked_symptoms": linked,
        "created_at": datetime.now(timezone.utc),
    }
    await db.journal.insert_one(doc)
    doc.pop("_id", None)
    for k in ["timestamp", "created_at"]:
        if isinstance(doc.get(k), datetime):
            doc[k] = doc[k].isoformat()
    return doc


@api.get("/journal")
async def list_journal(user: dict = Depends(get_current_user)):
    cursor = db.journal.find({"user_id": user["user_id"]}, {"_id": 0}).sort("timestamp", -1)
    items = []
    async for d in cursor:
        for k in ["timestamp", "created_at"]:
            if isinstance(d.get(k), datetime):
                d[k] = d[k].isoformat()
        items.append(d)
    return items


@api.patch("/journal/{entry_id}")
async def update_journal(entry_id: str, body: JournalUpdateIn, user: dict = Depends(get_current_user)):
    updates = {}
    if body.text is not None:
        updates["text"] = body.text
    if body.timestamp is not None:
        ts = body.timestamp
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        updates["timestamp"] = ts
    if not updates:
        return {"ok": True}
    r = await db.journal.update_one(
        {"entry_id": entry_id, "user_id": user["user_id"]}, {"$set": updates}
    )
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


@api.delete("/journal/{entry_id}")
async def delete_journal(entry_id: str, user: dict = Depends(get_current_user)):
    r = await db.journal.delete_one({"entry_id": entry_id, "user_id": user["user_id"]})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


# --- Awards ---
@api.get("/awards/progress")
async def award_progress(user: dict = Depends(get_current_user)):
    doc = await db.award_progress.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not doc:
        return {"choice": "flowers", "count": 0, "goal": 30}
    for k in ["month_start", "last_increment"]:
        if isinstance(doc.get(k), datetime):
            doc[k] = doc[k].isoformat()
    doc["goal"] = 30
    return doc


@api.post("/awards/choice")
async def set_award_choice(body: AwardChoiceIn, user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    existing = await db.award_progress.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not existing:
        await db.award_progress.insert_one(
            {
                "user_id": user["user_id"],
                "choice": body.choice,
                "count": 0,
                "month_start": now.replace(day=1, hour=0, minute=0, second=0, microsecond=0),
                "last_increment": None,
                "notified_admin": False,
            }
        )
    else:
        await db.award_progress.update_one(
            {"user_id": user["user_id"]}, {"$set": {"choice": body.choice}}
        )
    return {"ok": True, "choice": body.choice}


# --- Music (admin-uploaded) ---
@api.get("/music")
async def list_music(user: dict = Depends(get_current_user)):
    cursor = db.music.find({}, {"_id": 0, "data_base64": 0}).sort("created_at", -1)
    items = []
    async for d in cursor:
        if isinstance(d.get("created_at"), datetime):
            d["created_at"] = d["created_at"].isoformat()
        items.append(d)
    return items


@api.get("/music/{track_id}/data")
async def get_music_data(track_id: str, user: dict = Depends(get_current_user)):
    doc = await db.music.find_one({"track_id": track_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    return {
        "track_id": doc["track_id"],
        "title": doc["title"],
        "mime": doc.get("mime", "audio/mpeg"),
        "data_base64": doc["data_base64"],
    }


@api.post("/music/upload")
async def upload_music(
    title: str = Form(...),
    mime: str = Form("audio/mpeg"),
    data_base64: str = Form(...),
    user: dict = Depends(get_current_user),
):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    track_id = f"trk_{uuid.uuid4().hex[:12]}"
    await db.music.insert_one(
        {
            "track_id": track_id,
            "title": title,
            "mime": mime,
            "data_base64": data_base64,
            "uploaded_by": user["user_id"],
            "created_at": datetime.now(timezone.utc),
        }
    )
    return {"ok": True, "track_id": track_id}


@api.delete("/music/{track_id}")
async def delete_music(track_id: str, user: dict = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    r = await db.music.delete_one({"track_id": track_id})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


# --- Send report (mock email) ---
@api.post("/reports/send")
async def send_report(body: SendReportIn, user: dict = Depends(get_current_user)):
    since = datetime.now(timezone.utc) - timedelta(days=body.days)
    sym = await db.symptom_logs.find(
        {"user_id": user["user_id"], "created_at": {"$gte": since}}, {"_id": 0}
    ).to_list(1000)
    eng = await db.energy_logs.find(
        {"user_id": user["user_id"], "created_at": {"$gte": since}}, {"_id": 0}
    ).to_list(1000)
    report_id = f"rep_{uuid.uuid4().hex[:12]}"
    await db.reports_sent.insert_one(
        {
            "report_id": report_id,
            "user_id": user["user_id"],
            "doctor_email": body.doctor_email,
            "days": body.days,
            "symptom_count": len(sym),
            "energy_count": len(eng),
            "created_at": datetime.now(timezone.utc),
        }
    )
    # In production: integrate real email. For now, mocked send.
    return {
        "ok": True,
        "report_id": report_id,
        "doctor_email": body.doctor_email,
        "symptom_entries": len(sym),
        "energy_entries": len(eng),
        "note": "MOCKED email: report recorded. Email delivery is not configured.",
    }


# --- Admin ---
@api.get("/admin/notices")
async def admin_notices(user: dict = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    cursor = db.admin_notices.find({}, {"_id": 0}).sort("created_at", -1)
    items = []
    async for d in cursor:
        if isinstance(d.get("created_at"), datetime):
            d["created_at"] = d["created_at"].isoformat()
        items.append(d)
    return items


@api.get("/")
async def root():
    return {"message": "MindTrack API"}


# --- Medicines ---
@api.post("/medicines")
async def create_medicine(body: MedicineCreateIn, user: dict = Depends(get_current_user)):
    med_id = f"med_{uuid.uuid4().hex[:12]}"
    doc = {
        "med_id": med_id,
        "user_id": user["user_id"],
        "name": body.name.strip(),
        "dosage": (body.dosage or "").strip() or None,
        "notes": (body.notes or "").strip() or None,
        "created_at": datetime.now(timezone.utc),
    }
    await db.medicines.insert_one(doc)
    doc.pop("_id", None)
    if isinstance(doc.get("created_at"), datetime):
        doc["created_at"] = doc["created_at"].isoformat()
    return doc


@api.get("/medicines")
async def list_medicines(user: dict = Depends(get_current_user)):
    cursor = db.medicines.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1)
    items = []
    async for d in cursor:
        if isinstance(d.get("created_at"), datetime):
            d["created_at"] = d["created_at"].isoformat()
        last = await db.medicine_logs.find_one(
            {"user_id": user["user_id"], "med_id": d["med_id"]},
            {"_id": 0},
            sort=[("taken_at", -1)],
        )
        if last and isinstance(last.get("taken_at"), datetime):
            last["taken_at"] = last["taken_at"].isoformat()
        d["last_taken"] = last.get("taken_at") if last else None
        items.append(d)
    return items


@api.delete("/medicines/{med_id}")
async def delete_medicine(med_id: str, user: dict = Depends(get_current_user)):
    r = await db.medicines.delete_one({"med_id": med_id, "user_id": user["user_id"]})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    await db.medicine_logs.delete_many({"med_id": med_id, "user_id": user["user_id"]})
    return {"ok": True}


@api.post("/medicines/{med_id}/log")
async def log_medicine(med_id: str, user: dict = Depends(get_current_user)):
    med = await db.medicines.find_one({"med_id": med_id, "user_id": user["user_id"]}, {"_id": 0})
    if not med:
        raise HTTPException(status_code=404, detail="Medicine not found")
    log_id = f"mlog_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    await db.medicine_logs.insert_one(
        {
            "log_id": log_id,
            "user_id": user["user_id"],
            "med_id": med_id,
            "name": med["name"],
            "taken_at": now,
        }
    )
    return {"ok": True, "log_id": log_id, "taken_at": now.isoformat()}


@api.get("/medicines/{med_id}/logs")
async def get_medicine_logs(med_id: str, days: int = 30, user: dict = Depends(get_current_user)):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    cursor = db.medicine_logs.find(
        {"user_id": user["user_id"], "med_id": med_id, "taken_at": {"$gte": since}},
        {"_id": 0},
    ).sort("taken_at", -1)
    items = []
    async for d in cursor:
        if isinstance(d.get("taken_at"), datetime):
            d["taken_at"] = d["taken_at"].isoformat()
        items.append(d)
    return items


@api.get("/medicine-logs")
async def get_all_medicine_logs(days: int = 30, user: dict = Depends(get_current_user)):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    cursor = db.medicine_logs.find(
        {"user_id": user["user_id"], "taken_at": {"$gte": since}},
        {"_id": 0},
    ).sort("taken_at", -1)
    items = []
    async for d in cursor:
        if isinstance(d.get("taken_at"), datetime):
            d["taken_at"] = d["taken_at"].isoformat()
        items.append(d)
    return items



# --- Startup ---
@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("username", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.symptom_logs.create_index([("user_id", 1), ("created_at", -1)])
    await db.energy_logs.create_index([("user_id", 1), ("created_at", -1)])
    await db.tasks.create_index([("user_id", 1), ("created_at", -1)])
    await db.journal.create_index([("user_id", 1), ("timestamp", -1)])
    await db.music.create_index("track_id", unique=True)
    await db.medicines.create_index([("user_id", 1), ("created_at", -1)])
    await db.medicine_logs.create_index([("user_id", 1), ("med_id", 1), ("taken_at", -1)])

    # Seed admin
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@mindtrack.app")
    admin_password = os.environ.get("ADMIN_PASSWORD", "Admin@12345")
    admin_username = os.environ.get("ADMIN_USERNAME", "admin")
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one(
            {
                "user_id": f"user_{uuid.uuid4().hex[:12]}",
                "email": admin_email,
                "username": admin_username,
                "name": "Admin",
                "picture": None,
                "password_hash": hash_password(admin_password),
                "disorders": [],
                "role": "admin",
                "auth_provider": "password",
                "created_at": datetime.now(timezone.utc),
            }
        )
    else:
        updates = {"role": "admin"}
        if not verify_password(admin_password, existing.get("password_hash") or ""):
            updates["password_hash"] = hash_password(admin_password)
        await db.users.update_one({"email": admin_email}, {"$set": updates})


@app.on_event("shutdown")
async def shutdown():
    client.close()


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)
