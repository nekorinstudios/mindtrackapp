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
import asyncio
import resend
import stripe
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

# --- Resend email config ---
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")
if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

# --- Stripe subscription config ---
STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY", "")
STRIPE_PAYMENT_LINK = os.environ.get("STRIPE_PAYMENT_LINK", "")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
SUBSCRIPTION_PRICE_USD = os.environ.get("SUBSCRIPTION_PRICE_USD", "1.99")
SUBSCRIPTION_TRIAL_DAYS = int(os.environ.get("SUBSCRIPTION_TRIAL_DAYS", "7"))
if STRIPE_SECRET_KEY:
    stripe.api_key = STRIPE_SECRET_KEY


def _has_subscription_access(user: dict) -> bool:
    """Return True if user currently has paid access (trialing/active or admin)."""
    if (user.get("role") or "") == "admin":
        return True
    sub_status = (user.get("subscription_status") or "").lower()
    if sub_status in ("trialing", "active"):
        # If trialing, also check trial_end is in the future
        if sub_status == "trialing":
            trial_end = user.get("trial_end")
            if isinstance(trial_end, datetime):
                if trial_end.tzinfo is None:
                    trial_end = trial_end.replace(tzinfo=timezone.utc)
                return trial_end > datetime.now(timezone.utc)
        return True
    return False


async def require_subscription(user: dict = None):
    """Dependency that raises 402 if the user has no active subscription/trial."""
    # placeholder; resolved in endpoint level using current user
    return user

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
    first_name: str
    last_name: str

class LoginIn(BaseModel):
    identifier: str  # email or username
    password: str

class UserOut(BaseModel):
    user_id: str
    email: str
    username: str
    name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    picture: Optional[str] = None
    disorders: List[str] = []
    role: str = "user"
    subscription_status: Optional[str] = None  # trialing|active|past_due|canceled|expired
    trial_end: Optional[datetime] = None
    has_access: bool = False

class AuthOut(BaseModel):
    access_token: str
    user: UserOut

class UpdateDisordersIn(BaseModel):
    disorders: List[Literal["ADHD", "AuDHD", "Bipolar", "Autism"]]

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
    choice: Literal["flowers", "candy", "giftcard", "treasure_chest"]


class AwardClaimIn(BaseModel):
    full_name: str
    address: str
    email: EmailStr
    phone: str

class SendReportIn(BaseModel):
    doctor_email: EmailStr
    days: int = 30

class GoogleAuthIn(BaseModel):
    session_id: str

class MedicineCreateIn(BaseModel):
    name: str
    dosage: Optional[str] = None
    notes: Optional[str] = None

class TestSubmitIn(BaseModel):
    test_id: Literal["asrs", "raads14", "mdq", "gad7"]
    answers: List[int]
    extra: Optional[dict] = None  # for MDQ Q2/Q3


# --- App ---
app = FastAPI(title="MindTrack API")
api = APIRouter(prefix="/api")


# --- Seed / catalog ---
SYMPTOM_CATALOG = {
    "ADHD": [
        "I can't stay on task",
        "Distractions keep pulling me away",
        "I feel restless and on edge",
        "My memory keeps slipping",
        "I act before I think",
        "Starting feels heavy",
        "I can't finish what I start",
        "I keep fidgeting",
        "Everything feels scattered",
        "Time slips away from me",
        "Juggling tasks feels overwhelming",
        "Planning ahead feels impossible",
        "Little things frustrate me fast",
        "My moods shift suddenly",
        "My temper flares quickly",
        "Stress is overwhelming me",
    ],
    "AuDHD": [
        "My focus swings between hyperfocus and total distraction",
        "Routines comfort me but transitions exhaust me",
        "I crave novelty and dread change at the same time",
        "Masking around people leaves me drained",
        "My emotions feel huge and out of sync",
        "Sensory overload tips into shutdown",
        "I overshare or freeze mid-conversation",
        "Self-regulation feels like constant work",
        "I forget to eat, drink or sleep when I hyperfocus",
        "Time blindness makes everything feel urgent",
        "Small decisions paralyze me",
        "Rest feels guilty but burnout is closer than I think",
        "Switching tasks costs me a huge amount of energy",
        "I'm overstimulated and bored at the same time",
    ],
    "Autism": [
        "It's hard to look at or listen to people",
        "I don't always respond when called",
        "Touch can feel like too much",
        "I prefer to be alone",
        "My face doesn't show what I feel inside",
        "Starting or keeping a conversation feels hard",
        "I sense when someone tunes out of my favorite topic",
        "My speech patterns feel different from others",
        "Naming my own emotions is hard",
        "Reading other people's emotions is hard",
        "Subtle social cues go over my head",
        "Simple directions can confuse me",
        "I can't predict how someone will react",
        "Social moments come out wrong",
        "Body language doesn't register for me",
        "I rock or sway to self-regulate",
        "I have my own repetitive movements",
        "My routines must not be disrupted",
        "Sometimes I bite, scratch or hit myself",
        "I repeat words or phrases",
        "I'm intensely fascinated by one topic",
        "Lights and sounds hit me harder than they should",
        "Lights and sounds feel duller than they should",
        "I fixate on certain objects or activities",
        "Specific food textures or flavors are a must",
        "Some food textures make eating impossible",
    ],
    "Bipolar": [
        # Hypomanic / manic
        "I feel unstoppable and on top of the world",
        "My thoughts race faster than I can speak",
        "I barely need sleep and feel fine",
        "Words tumble out faster than I can catch them",
        "I'm taking risks I'd normally avoid",
        "I'm spending more money than I should",
        "Ideas come faster than I can finish them",
        "I'm unusually social and outgoing",
        "I feel irritable for no clear reason",
        "Confidence feels limitless right now",
        "I'm hyperaware of every detail around me",
        "I keep starting projects I don't finish",
        "I crave constant stimulation",
        # Depressive
        "Hopelessness sits in my chest",
        "Getting out of bed feels impossible",
        "I feel empty inside",
        "Things I usually love feel flat",
        "I'm exhausted no matter how much I sleep",
        "I can't focus on anything",
        "I feel worthless or guilty for no real reason",
        "Dark thoughts keep visiting me",
        "Eating feels off — too much or too little",
        "I cry without warning",
        "Everything feels heavy",
        # Mixed / cycling
        "My mood shifts inside the same day",
        "I feel up and down at the same time",
        "Anger and sadness blur together",
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
def _user_out_dict(u: dict) -> dict:
    """Normalize a user document into a UserOut payload (incl. subscription)."""
    sub_status = (u.get("subscription_status") or "").lower() or None
    trial_end = u.get("trial_end")
    if isinstance(trial_end, datetime) and trial_end.tzinfo is None:
        trial_end = trial_end.replace(tzinfo=timezone.utc)
    # Auto-expire trial if past trial_end and still marked trialing
    if sub_status == "trialing" and isinstance(trial_end, datetime):
        if trial_end <= datetime.now(timezone.utc):
            sub_status = "expired"
    has_access = _has_subscription_access({**u, "subscription_status": sub_status, "trial_end": trial_end})
    return {
        "user_id": u["user_id"],
        "email": u["email"],
        "username": u["username"],
        "name": u.get("name"),
        "first_name": u.get("first_name"),
        "last_name": u.get("last_name"),
        "picture": u.get("picture"),
        "disorders": u.get("disorders") or [],
        "role": u.get("role") or "user",
        "subscription_status": sub_status,
        "trial_end": trial_end,
        "has_access": has_access,
    }


@api.post("/auth/register", response_model=AuthOut)
async def register(body: RegisterIn):
    email = body.email.lower().strip()
    username = body.username.lower().strip()
    first_name = body.first_name.strip()
    last_name = body.last_name.strip()
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    if not first_name:
        raise HTTPException(status_code=400, detail="First name is required")
    if not last_name:
        raise HTTPException(status_code=400, detail="Last name is required")
    if await db.users.find_one({"$or": [{"email": email}, {"username": username}]}):
        raise HTTPException(status_code=400, detail="Email or username already taken")
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    full_name = f"{first_name} {last_name}"
    now = datetime.now(timezone.utc)
    trial_end = now + timedelta(days=SUBSCRIPTION_TRIAL_DAYS)
    doc = {
        "user_id": user_id,
        "email": email,
        "username": username,
        "name": full_name,
        "first_name": first_name,
        "last_name": last_name,
        "picture": None,
        "password_hash": hash_password(body.password),
        "disorders": [],
        "role": "user",
        "auth_provider": "password",
        "created_at": now,
        # Subscription bootstrap: every new user gets a local 7-day trial.
        "subscription_status": "trialing",
        "trial_start": now,
        "trial_end": trial_end,
        "stripe_customer_id": None,
        "stripe_subscription_id": None,
    }
    await db.users.insert_one(doc)
    token = create_access_token(user_id, email)
    return AuthOut(access_token=token, user=UserOut(**_user_out_dict(doc)))


@api.post("/auth/login", response_model=AuthOut)
async def login(body: LoginIn):
    ident = body.identifier.lower().strip()
    user = await db.users.find_one({"$or": [{"email": ident}, {"username": ident}]})
    if not user or not user.get("password_hash") or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    # Backfill trial for legacy users that don't yet have subscription fields
    if user.get("subscription_status") is None and (user.get("role") or "user") != "admin":
        now = datetime.now(timezone.utc)
        trial_end = now + timedelta(days=SUBSCRIPTION_TRIAL_DAYS)
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {
                "subscription_status": "trialing",
                "trial_start": now,
                "trial_end": trial_end,
            }},
        )
        user["subscription_status"] = "trialing"
        user["trial_start"] = now
        user["trial_end"] = trial_end
    token = create_access_token(user["user_id"], user["email"])
    return AuthOut(access_token=token, user=UserOut(**_user_out_dict(user)))


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
    return UserOut(**_user_out_dict(user))


@api.post("/auth/disorders", response_model=UserOut)
async def update_disorders(body: UpdateDisordersIn, user: dict = Depends(get_current_user)):
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"disorders": body.disorders}})
    user["disorders"] = body.disorders
    return UserOut(**_user_out_dict(user))


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
    # Award progress: add 1 point to current award (if user has an active choice)
    AWARD_GOAL = 100
    award = await db.award_progress.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if award and award.get("choice") and (award.get("status") or "in_progress") == "in_progress":
        new_points = (award.get("points") or award.get("count") or 0) + 1
        new_status = "ready_to_claim" if new_points >= AWARD_GOAL else "in_progress"
        update = {
            "$set": {
                "points": new_points,
                "last_increment": now,
                "status": new_status,
            },
        }
        await db.award_progress.update_one({"user_id": user["user_id"]}, update)
        if new_status == "ready_to_claim" and not award.get("notified_admin"):
            await db.admin_notices.insert_one(
                {
                    "notice_id": f"notice_{uuid.uuid4().hex[:10]}",
                    "user_id": user["user_id"],
                    "email": user["email"],
                    "choice": award.get("choice"),
                    "created_at": now,
                    "message": f"User {_display_name(user)} ({user['email']}) reached 100 points and is ready to claim their {award.get('choice')} reward.",
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
def _day_window_utc(ts: datetime) -> tuple[datetime, datetime]:
    """Return (start_of_day, end_of_day) UTC for the given timestamp."""
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    start = ts.replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=1)
    return start, end


async def _build_day_context(user_id: str, ts: datetime) -> dict:
    """Aggregate today's symptom logs + latest energy for a given timestamp's calendar day."""
    start, end = _day_window_utc(ts)
    sym_cursor = db.symptom_logs.find(
        {"user_id": user_id, "created_at": {"$gte": start, "$lt": end}},
        {"_id": 0},
    ).sort("created_at", -1)
    symptoms: list[str] = []
    seen: set[str] = set()
    async for s in sym_cursor:
        for name in (s.get("symptoms") or []):
            if name not in seen:
                seen.add(name)
                symptoms.append(name)
    energy_doc = await db.energy_logs.find_one(
        {"user_id": user_id, "created_at": {"$gte": start, "$lt": end}},
        {"_id": 0},
        sort=[("created_at", -1)],
    )
    energy_percent = int(energy_doc["percent"]) if energy_doc and energy_doc.get("percent") is not None else None
    return {"symptoms": symptoms, "energy_percent": energy_percent}


@api.get("/journal/today-context")
async def journal_today_context(user: dict = Depends(get_current_user)):
    """Returns today's symptom snapshot so the compose UI can preview what will be linked."""
    ctx = await _build_day_context(user["user_id"], datetime.now(timezone.utc))
    return ctx


@api.post("/journal")
async def create_journal(body: JournalIn, user: dict = Depends(get_current_user)):
    entry_id = f"j_{uuid.uuid4().hex[:12]}"
    ts = body.timestamp or datetime.now(timezone.utc)
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    # Auto-link every symptom logged on the SAME calendar day as the entry timestamp
    ctx = await _build_day_context(user["user_id"], ts)
    doc = {
        "entry_id": entry_id,
        "user_id": user["user_id"],
        "text": body.text,
        "timestamp": ts,
        "linked_symptoms": ctx["symptoms"] or None,
        "linked_energy_percent": ctx["energy_percent"],
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
AWARD_GOAL = 100


@api.get("/awards/progress")
async def award_progress(user: dict = Depends(get_current_user)):
    doc = await db.award_progress.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not doc:
        return {
            "choice": None,
            "points": 0,
            "goal": AWARD_GOAL,
            "status": "picking",
        }
    # Normalize legacy fields (count → points)
    points = doc.get("points") if doc.get("points") is not None else (doc.get("count") or 0)
    status = doc.get("status")
    if not status:
        if not doc.get("choice"):
            status = "picking"
        elif points >= AWARD_GOAL:
            status = "ready_to_claim"
        else:
            status = "in_progress"
    for k in ["month_start", "last_increment"]:
        if isinstance(doc.get(k), datetime):
            doc[k] = doc[k].isoformat()
    doc["points"] = points
    doc["status"] = status
    doc["goal"] = AWARD_GOAL
    return doc


@api.post("/awards/choice")
async def set_award_choice(body: AwardChoiceIn, user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    existing = await db.award_progress.find_one({"user_id": user["user_id"]}, {"_id": 0})
    # Lock: cannot change while an award is in progress or ready_to_claim
    if existing and existing.get("choice"):
        status = existing.get("status")
        points = existing.get("points") if existing.get("points") is not None else (existing.get("count") or 0)
        if not status:
            status = "ready_to_claim" if points >= AWARD_GOAL else "in_progress"
        if status in ("in_progress", "ready_to_claim"):
            raise HTTPException(
                status_code=409,
                detail="You already have a prize in progress. Claim it before picking a new one.",
            )
    if not existing:
        await db.award_progress.insert_one(
            {
                "user_id": user["user_id"],
                "choice": body.choice,
                "points": 0,
                "status": "in_progress",
                "month_start": now.replace(day=1, hour=0, minute=0, second=0, microsecond=0),
                "last_increment": None,
                "notified_admin": False,
            }
        )
    else:
        await db.award_progress.update_one(
            {"user_id": user["user_id"]},
            {"$set": {
                "choice": body.choice,
                "points": 0,
                "status": "in_progress",
                "notified_admin": False,
                "last_increment": None,
            }},
        )
    return {"ok": True, "choice": body.choice}


@api.post("/awards/claim")
async def claim_award(body: AwardClaimIn, user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    award = await db.award_progress.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not award or not award.get("choice"):
        raise HTTPException(status_code=400, detail="No prize to claim")
    points = award.get("points") if award.get("points") is not None else (award.get("count") or 0)
    status = award.get("status") or ("ready_to_claim" if points >= AWARD_GOAL else "in_progress")
    if status != "ready_to_claim":
        raise HTTPException(
            status_code=400,
            detail=f"You need {AWARD_GOAL - points} more points before you can claim this prize.",
        )

    claim_id = f"claim_{uuid.uuid4().hex[:10]}"
    claim_doc = {
        "claim_id": claim_id,
        "user_id": user["user_id"],
        "choice": award.get("choice"),
        "full_name": body.full_name.strip(),
        "address": body.address.strip(),
        "email": body.email.lower().strip(),
        "phone": body.phone.strip(),
        "points_at_claim": points,
        "created_at": now,
        "fulfilled": False,
    }
    await db.award_claims.insert_one(claim_doc)

    # Notify admin to fulfill
    await db.admin_notices.insert_one(
        {
            "notice_id": f"notice_{uuid.uuid4().hex[:10]}",
            "user_id": user["user_id"],
            "email": user["email"],
            "choice": award.get("choice"),
            "claim_id": claim_id,
            "created_at": now,
            "message": (
                f"User {_display_name(user)} ({user['email']}) claimed their {award.get('choice')} prize. "
                f"Ship to: {body.full_name} · {body.address} · {body.phone} · {body.email}"
            ),
        }
    )

    # Reset award progress so user can pick a new prize
    await db.award_progress.update_one(
        {"user_id": user["user_id"]},
        {"$set": {
            "choice": None,
            "points": 0,
            "status": "picking",
            "notified_admin": False,
            "last_increment": None,
            "last_claim_id": claim_id,
            "last_claim_at": now,
        }},
    )

    return {"ok": True, "claim_id": claim_id}


# --- Billing / Stripe subscription ---
@api.get("/billing/status")
async def billing_status(user: dict = Depends(get_current_user)):
    out = _user_out_dict(user)
    return {
        "subscription_status": out["subscription_status"],
        "trial_end": out["trial_end"].isoformat() if isinstance(out.get("trial_end"), datetime) else None,
        "has_access": out["has_access"],
        "price_usd": SUBSCRIPTION_PRICE_USD,
        "trial_days": SUBSCRIPTION_TRIAL_DAYS,
    }


@api.post("/billing/checkout")
async def billing_checkout(user: dict = Depends(get_current_user)):
    """Return the Stripe Payment Link URL with the user's ID attached as client_reference_id."""
    if not STRIPE_PAYMENT_LINK:
        raise HTTPException(status_code=500, detail="Payment link not configured")
    # Stripe Payment Links accept client_reference_id and prefilled_email query params
    sep = "&" if "?" in STRIPE_PAYMENT_LINK else "?"
    url = (
        f"{STRIPE_PAYMENT_LINK}{sep}"
        f"client_reference_id={user['user_id']}"
        f"&prefilled_email={user['email']}"
    )
    return {"checkout_url": url}


@api.post("/billing/portal")
async def billing_portal(user: dict = Depends(get_current_user)):
    """Open the Stripe Customer Portal so user can cancel/manage subscription."""
    customer_id = user.get("stripe_customer_id")
    if not customer_id:
        raise HTTPException(
            status_code=400,
            detail="No subscription yet. Start your subscription first.",
        )
    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=500, detail="Stripe is not configured")
    try:
        session = await asyncio.to_thread(
            stripe.billing_portal.Session.create,
            customer=customer_id,
            return_url=os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://mindtrack.app/"),
        )
        return {"portal_url": session.url}
    except Exception as e:
        logger = logging.getLogger("uvicorn.error")
        logger.error(f"Stripe portal session failed: {e}")
        raise HTTPException(status_code=502, detail=f"Could not create portal session: {e}")


async def _apply_stripe_subscription(user_id: str, sub: dict, customer_id: Optional[str] = None):
    """Persist a Stripe subscription object onto the local user doc."""
    status = (sub.get("status") or "").lower() or None
    set_doc: dict = {"subscription_status": status}
    if sub.get("id"):
        set_doc["stripe_subscription_id"] = sub["id"]
    if customer_id:
        set_doc["stripe_customer_id"] = customer_id
    # current_period_end as datetime
    cpe = sub.get("current_period_end")
    if cpe:
        try:
            set_doc["current_period_end"] = datetime.fromtimestamp(int(cpe), tz=timezone.utc)
        except Exception:
            pass
    # trial_end from Stripe overrides local
    te = sub.get("trial_end")
    if te:
        try:
            set_doc["trial_end"] = datetime.fromtimestamp(int(te), tz=timezone.utc)
        except Exception:
            pass
    await db.users.update_one({"user_id": user_id}, {"$set": set_doc})


@api.post("/billing/webhook")
async def billing_webhook(request: Request):
    """Receive Stripe webhook events and sync subscription status."""
    payload = await request.body()
    sig_header = request.headers.get("Stripe-Signature") or ""
    event = None
    if STRIPE_WEBHOOK_SECRET:
        try:
            event = stripe.Webhook.construct_event(
                payload=payload, sig_header=sig_header, secret=STRIPE_WEBHOOK_SECRET
            )
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid signature: {e}")
    else:
        # No webhook secret configured yet — accept unverified events (test mode).
        import json as _json
        try:
            event = _json.loads(payload.decode("utf-8"))
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid payload")

    etype = event.get("type") if isinstance(event, dict) else event["type"]
    data_obj = (event.get("data") or {}).get("object", {}) if isinstance(event, dict) else event["data"]["object"]

    # Always log the event so we can debug
    await db.stripe_events.insert_one({
        "event_id": event.get("id") if isinstance(event, dict) else event.get("id"),
        "type": etype,
        "received_at": datetime.now(timezone.utc),
    })

    try:
        if etype == "checkout.session.completed":
            client_ref = data_obj.get("client_reference_id")
            customer_id = data_obj.get("customer")
            subscription_id = data_obj.get("subscription")
            if client_ref:
                update = {
                    "subscription_status": "trialing" if (SUBSCRIPTION_TRIAL_DAYS or 0) > 0 else "active",
                }
                if customer_id:
                    update["stripe_customer_id"] = customer_id
                if subscription_id:
                    update["stripe_subscription_id"] = subscription_id
                await db.users.update_one({"user_id": client_ref}, {"$set": update})
                if subscription_id and STRIPE_SECRET_KEY:
                    try:
                        sub = await asyncio.to_thread(stripe.Subscription.retrieve, subscription_id)
                        await _apply_stripe_subscription(client_ref, sub, customer_id)
                    except Exception:
                        pass
        elif etype in ("customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"):
            customer_id = data_obj.get("customer")
            user = await db.users.find_one({"stripe_customer_id": customer_id})
            if user:
                if etype == "customer.subscription.deleted":
                    await db.users.update_one(
                        {"user_id": user["user_id"]},
                        {"$set": {"subscription_status": "canceled"}},
                    )
                else:
                    await _apply_stripe_subscription(user["user_id"], data_obj, customer_id)
        elif etype == "invoice.payment_failed":
            customer_id = data_obj.get("customer")
            user = await db.users.find_one({"stripe_customer_id": customer_id})
            if user:
                await db.users.update_one(
                    {"user_id": user["user_id"]},
                    {"$set": {"subscription_status": "past_due"}},
                )
    except Exception as e:
        logger = logging.getLogger("uvicorn.error")
        logger.error(f"Webhook handler error for {etype}: {e}")

    return {"received": True}




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


class MusicUploadIn(BaseModel):
    title: str
    mime: str = "audio/mpeg"
    data_base64: str


@api.post("/music/upload")
async def upload_music(
    body: MusicUploadIn,
    user: dict = Depends(get_current_user),
):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    if not body.title or not body.title.strip():
        raise HTTPException(status_code=400, detail="Title is required")
    if not body.data_base64:
        raise HTTPException(status_code=400, detail="No audio data provided")
    track_id = f"trk_{uuid.uuid4().hex[:12]}"
    await db.music.insert_one(
        {
            "track_id": track_id,
            "title": body.title.strip(),
            "mime": body.mime or "audio/mpeg",
            "data_base64": body.data_base64,
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


# --- Send report via Resend email ---
def _display_name(user: dict) -> str:
    """Return the user's real full name (First Last) for reports/emails.
    Falls back to 'name' field, then email local-part if first/last missing
    (pre-existing accounts created before first_name/last_name were required)."""
    first = (user.get("first_name") or "").strip()
    last = (user.get("last_name") or "").strip()
    if first or last:
        return (f"{first} {last}").strip()
    name = (user.get("name") or "").strip()
    if name:
        return name
    email = user.get("email") or ""
    return email.split("@")[0] if email else "(unnamed user)"


def _render_report_html(
    user: dict,
    days: int,
    sym: list,
    eng: list,
    meds: list,
    jrnl: list,
) -> str:
    """Build a simple, email-client-safe HTML report from raw logs."""
    # Aggregate symptoms by calendar day (UTC)
    day_map: dict[str, dict] = {}
    for s in sym:
        ts = s.get("created_at")
        if not isinstance(ts, datetime):
            continue
        key = ts.strftime("%Y-%m-%d")
        bucket = day_map.setdefault(key, {"symptoms": set(), "energy": [], "meds": [], "notes": []})
        for name in (s.get("symptoms") or []):
            bucket["symptoms"].add(name)
        if s.get("note"):
            bucket["notes"].append(s["note"])
    for e in eng:
        ts = e.get("created_at")
        if not isinstance(ts, datetime):
            continue
        key = ts.strftime("%Y-%m-%d")
        bucket = day_map.setdefault(key, {"symptoms": set(), "energy": [], "meds": [], "notes": []})
        if e.get("percent") is not None:
            bucket["energy"].append(int(e["percent"]))
    for m in meds:
        ts = m.get("taken_at")
        if not isinstance(ts, datetime):
            continue
        key = ts.strftime("%Y-%m-%d")
        bucket = day_map.setdefault(key, {"symptoms": set(), "energy": [], "meds": [], "notes": []})
        label = m.get("name") or ""
        bucket["meds"].append(f"{label} @ {ts.strftime('%H:%M')}")
    rows = []
    for key in sorted(day_map.keys(), reverse=True):
        d = day_map[key]
        energy = d["energy"]
        e_avg = f"{sum(energy) // len(energy)}%" if energy else "—"
        syms = ", ".join(sorted(d["symptoms"])) if d["symptoms"] else "—"
        mds = ", ".join(d["meds"]) if d["meds"] else "—"
        note = "<br>".join(d["notes"]) if d["notes"] else ""
        rows.append(
            f"""
            <tr style="border-bottom:1px solid #e5e7eb;">
              <td style="padding:10px 8px;font-weight:700;color:#111827;white-space:nowrap;">{key}</td>
              <td style="padding:10px 8px;color:#111827;">{e_avg}</td>
              <td style="padding:10px 8px;color:#374151;">{syms}</td>
              <td style="padding:10px 8px;color:#374151;">{mds}</td>
              <td style="padding:10px 8px;color:#6b7280;font-style:italic;">{note}</td>
            </tr>
            """
        )
    day_table = "".join(rows) or '<tr><td colspan="5" style="padding:16px;color:#6b7280;">No logs in this period.</td></tr>'

    # Journal entries
    j_items = []
    for j in jrnl:
        ts = j.get("timestamp")
        ts_str = ts.strftime("%Y-%m-%d %H:%M") if isinstance(ts, datetime) else ""
        linked = j.get("linked_symptoms") or []
        linked_html = ""
        if linked:
            chips = "".join(
                f'<span style="display:inline-block;background:#eff6ff;color:#1e40af;padding:3px 9px;border-radius:99px;font-size:12px;margin:2px;">{x}</span>'
                for x in linked
            )
            linked_html = f'<div style="margin-top:6px;">{chips}</div>'
        energy = j.get("linked_energy_percent")
        energy_html = (
            f'<div style="margin-top:4px;color:#6b7280;font-size:12px;">Energy that day: <b>{int(energy)}%</b></div>'
            if energy is not None
            else ""
        )
        text = (j.get("text") or "").replace("\n", "<br>")
        j_items.append(
            f"""
            <div style="border:1px solid #e5e7eb;border-radius:12px;padding:14px;margin-bottom:10px;background:#ffffff;">
              <div style="color:#6b7280;font-size:12px;font-weight:700;">{ts_str}</div>
              <div style="color:#111827;margin-top:6px;line-height:1.5;">{text}</div>
              {linked_html}
              {energy_html}
            </div>
            """
        )
    j_block = "".join(j_items) or '<div style="color:#6b7280;">No journal entries in this period.</div>'

    name = _display_name(user)
    return f"""
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
  <table width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;padding:24px 0;">
    <tr><td align="center">
      <table width="640" cellspacing="0" cellpadding="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
        <tr><td style="background:#4F8FF7;padding:24px 28px;">
          <div style="color:#ffffff;font-size:22px;font-weight:800;">MindTrack report</div>
          <div style="color:#dbeafe;margin-top:4px;">Last {days} days · {name}</div>
        </td></tr>
        <tr><td style="padding:22px 28px;">
          <h2 style="margin:0 0 12px 0;color:#111827;font-size:18px;">Daily snapshot</h2>
          <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:13px;">
            <thead>
              <tr style="background:#f9fafb;">
                <th align="left" style="padding:10px 8px;color:#6b7280;font-weight:700;">Date</th>
                <th align="left" style="padding:10px 8px;color:#6b7280;font-weight:700;">Energy</th>
                <th align="left" style="padding:10px 8px;color:#6b7280;font-weight:700;">Feelings / symptoms</th>
                <th align="left" style="padding:10px 8px;color:#6b7280;font-weight:700;">Medicines</th>
                <th align="left" style="padding:10px 8px;color:#6b7280;font-weight:700;">Notes</th>
              </tr>
            </thead>
            <tbody>{day_table}</tbody>
          </table>

          <h2 style="margin:26px 0 12px 0;color:#111827;font-size:18px;">Journal entries</h2>
          {j_block}

          <p style="margin-top:24px;color:#6b7280;font-size:12px;line-height:1.5;">
            This report was generated from <b>MindTrack</b> on behalf of {name}. It contains self-reported data and is intended to support — not replace — clinical assessment.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
"""


@api.post("/reports/send")
async def send_report(body: SendReportIn, user: dict = Depends(get_current_user)):
    since = datetime.now(timezone.utc) - timedelta(days=body.days)
    sym = await db.symptom_logs.find(
        {"user_id": user["user_id"], "created_at": {"$gte": since}}, {"_id": 0}
    ).to_list(5000)
    eng = await db.energy_logs.find(
        {"user_id": user["user_id"], "created_at": {"$gte": since}}, {"_id": 0}
    ).to_list(5000)
    meds = await db.medicine_logs.find(
        {"user_id": user["user_id"], "taken_at": {"$gte": since}}, {"_id": 0}
    ).to_list(5000)
    jrnl = await db.journal.find(
        {"user_id": user["user_id"], "timestamp": {"$gte": since}}, {"_id": 0}
    ).sort("timestamp", -1).to_list(2000)

    report_id = f"rep_{uuid.uuid4().hex[:12]}"
    html = _render_report_html(user, body.days, sym, eng, meds, jrnl)

    send_status = "queued"
    send_error: Optional[str] = None
    resend_id: Optional[str] = None

    if RESEND_API_KEY:
        full_name = _display_name(user)
        params = {
            "from": f"MindTrack <{SENDER_EMAIL}>",
            "to": [body.doctor_email],
            "subject": f"MindTrack report — {full_name} · last {body.days} days",
            "html": html,
            "reply_to": user.get("email"),
        }
        try:
            email_result = await asyncio.to_thread(resend.Emails.send, params)
            resend_id = (email_result or {}).get("id") if isinstance(email_result, dict) else getattr(email_result, "id", None)
            send_status = "sent"
        except Exception as e:
            send_status = "failed"
            send_error = str(e)
            logger = logging.getLogger("uvicorn.error")
            logger.error(f"Resend send failed: {send_error}")
    else:
        send_status = "not_configured"
        send_error = "RESEND_API_KEY missing on server"

    await db.reports_sent.insert_one(
        {
            "report_id": report_id,
            "user_id": user["user_id"],
            "doctor_email": body.doctor_email,
            "days": body.days,
            "symptom_count": len(sym),
            "energy_count": len(eng),
            "medicine_count": len(meds),
            "journal_count": len(jrnl),
            "status": send_status,
            "resend_id": resend_id,
            "error": send_error,
            "created_at": datetime.now(timezone.utc),
        }
    )

    if send_status == "failed":
        raise HTTPException(
            status_code=502,
            detail=f"Email provider rejected the send: {send_error}",
        )

    note_map = {
        "sent": None,
        "not_configured": "Server is not configured to send email (RESEND_API_KEY missing). Report recorded.",
    }
    return {
        "ok": True,
        "report_id": report_id,
        "doctor_email": body.doctor_email,
        "symptom_entries": len(sym),
        "energy_entries": len(eng),
        "medicine_entries": len(meds),
        "journal_entries": len(jrnl),
        "status": send_status,
        "resend_id": resend_id,
        "note": note_map.get(send_status),
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


# --- Mental health screening tests (MHA-style) ---
TESTS = {
    "asrs": {
        "test_id": "asrs",
        "title": "Adult ADHD Self-Report Scale (ASRS v1.1)",
        "short": "ADHD",
        "description": "Six-question screen developed by the WHO. Reflect on how you've felt and conducted yourself over the past 6 months.",
        "scale": ["Never", "Rarely", "Sometimes", "Often", "Very Often"],
        "type": "scaled",
        "questions": [
            {"text": "How often do you have trouble wrapping up the final details of a project, once the challenging parts have been done?", "threshold": 2},
            {"text": "How often do you have difficulty getting things in order when you have to do a task that requires organization?", "threshold": 2},
            {"text": "How often do you have problems remembering appointments or obligations?", "threshold": 2},
            {"text": "When you have a task that requires a lot of thought, how often do you avoid or delay getting started?", "threshold": 3},
            {"text": "How often do you fidget or squirm with your hands or feet when you have to sit down for a long time?", "threshold": 3},
            {"text": "How often do you feel overly active and compelled to do things, like you were driven by a motor?", "threshold": 3},
        ],
    },
    "gad7": {
        "test_id": "gad7",
        "title": "Generalized Anxiety Disorder (GAD-7)",
        "short": "Anxiety",
        "description": "Over the last 2 weeks, how often have you been bothered by the following problems?",
        "scale": ["Not at all", "Several days", "More than half the days", "Nearly every day"],
        "type": "scaled",
        "questions": [
            {"text": "Feeling nervous, anxious, or on edge"},
            {"text": "Not being able to stop or control worrying"},
            {"text": "Worrying too much about different things"},
            {"text": "Trouble relaxing"},
            {"text": "Being so restless that it is hard to sit still"},
            {"text": "Becoming easily annoyed or irritable"},
            {"text": "Feeling afraid, as if something awful might happen"},
        ],
    },
    "mdq": {
        "test_id": "mdq",
        "title": "Mood Disorder Questionnaire (MDQ)",
        "short": "Bipolar",
        "description": "Has there ever been a period of time when you were not your usual self and...",
        "scale": ["No", "Yes"],
        "type": "mdq",
        "questions": [
            {"text": "...you felt so good or so hyper that other people thought you were not your normal self, or you were so hyper that you got into trouble?"},
            {"text": "...you were so irritable that you shouted at people or started fights or arguments?"},
            {"text": "...you felt much more self-confident than usual?"},
            {"text": "...you got much less sleep than usual and found that you didn't really miss it?"},
            {"text": "...you were much more talkative or spoke much faster than usual?"},
            {"text": "...thoughts raced through your head or you couldn't slow your mind down?"},
            {"text": "...you were so easily distracted by things around you that you had trouble concentrating or staying on track?"},
            {"text": "...you had much more energy than usual?"},
            {"text": "...you were much more active or did many more things than usual?"},
            {"text": "...you were much more social or outgoing than usual; for example, you telephoned friends in the middle of the night?"},
            {"text": "...you were much more interested in sex than usual?"},
            {"text": "...you did things that were unusual for you or that other people might have thought were excessive, foolish, or risky?"},
            {"text": "...spending money got you or your family into trouble?"},
        ],
        "extra_q2": "Have several of these ever happened during the same period of time?",
        "extra_q3": "How much of a problem did any of these cause you?",
        "extra_q3_options": ["No problem", "Minor problem", "Moderate problem", "Serious problem"],
    },
    "raads14": {
        "test_id": "raads14",
        "title": "RAADS-14 Autism Screen",
        "short": "AuDHD / Autism",
        "description": "Indicate how each statement applies to you and your behavior. (Reverse-scored items are accounted for automatically.)",
        "scale": [
            "True only when I was younger than 16",
            "True now and when I was younger than 16",
            "True now only",
            "Never true",
        ],
        "type": "raads",
        "questions": [
            {"text": "It is difficult for me to understand how other people are feeling when we are talking.", "reverse": False},
            {"text": "Some ordinary textures that do not bother others feel very offensive when they touch my skin.", "reverse": False},
            {"text": "It is very difficult for me to work and function in groups.", "reverse": False},
            {"text": "It is difficult to figure out what other people expect of me.", "reverse": False},
            {"text": "I often don't know how to act in social situations.", "reverse": False},
            {"text": "I can chat and make small talk with people.", "reverse": True},
            {"text": "When I feel overwhelmed by my senses, I have to isolate myself to shut them down.", "reverse": False},
            {"text": "How to make friends and socialize is a mystery to me.", "reverse": False},
            {"text": "When talking to someone, I have a hard time telling when it is my turn to talk or to listen.", "reverse": False},
            {"text": "I am considered a compassionate type of person.", "reverse": True},
            {"text": "I get extremely upset when the way I like to do things is suddenly changed.", "reverse": False},
            {"text": "I have always had difficulty getting others to understand me.", "reverse": False},
            {"text": "It is difficult for me to understand what other people are feeling when we are talking.", "reverse": False},
            {"text": "I like to talk things over with my friends.", "reverse": True},
        ],
    },
}


def _score_test(test_id: str, answers: List[int], extra: Optional[dict] = None) -> dict:
    t = TESTS.get(test_id)
    if not t:
        raise HTTPException(status_code=404, detail="Unknown test")
    qcount = len(t["questions"])
    if len(answers) != qcount:
        raise HTTPException(status_code=400, detail=f"Expected {qcount} answers, got {len(answers)}")

    if test_id == "asrs":
        positives = 0
        for i, a in enumerate(answers):
            thr = t["questions"][i].get("threshold", 2)
            if a >= thr:
                positives += 1
        outcome = (
            "Highly consistent with adult ADHD — recommend professional evaluation."
            if positives >= 4
            else "Few markers detected — ADHD is not strongly indicated by this short screen."
        )
        return {"score": positives, "max": 6, "category": "Positive markers", "interpretation": outcome}

    if test_id == "gad7":
        total = sum(answers)
        if total <= 4:
            cat = "Minimal anxiety"
        elif total <= 9:
            cat = "Mild anxiety"
        elif total <= 14:
            cat = "Moderate anxiety"
        else:
            cat = "Severe anxiety"
        return {
            "score": total,
            "max": 21,
            "category": cat,
            "interpretation": f"GAD-7 score: {total}/21 — {cat}.",
        }

    if test_id == "mdq":
        yes_count = sum(1 for a in answers if a == 1)
        q2 = bool((extra or {}).get("q2", False))
        q3 = int((extra or {}).get("q3", 0))  # 0..3
        positive = yes_count >= 7 and q2 and q3 >= 2
        cat = "Positive screen for bipolar spectrum" if positive else "Below screening threshold"
        return {
            "score": yes_count,
            "max": 13,
            "category": cat,
            "interpretation": (
                f"{yes_count}/13 yes responses; same-period: {'yes' if q2 else 'no'}; impact: {q3}/3. "
                + ("Positive screen — please discuss with a mental-health professional." if positive
                   else "Not a positive screen by MDQ criteria.")
            ),
        }

    if test_id == "raads14":
        # Each scaled answer maps to a value depending on reverse flag
        # Forward: True now+childhood=3, True now=2, True younger=1, Never=0
        # Reverse: same options, but inverted
        total = 0
        forward_map = [1, 3, 2, 0]
        reverse_map = [2, 0, 1, 3]
        for i, a in enumerate(answers):
            rev = t["questions"][i].get("reverse", False)
            v = (reverse_map if rev else forward_map)[a]
            total += v
        cat = "Likely autistic traits" if total >= 14 else "Below RAADS-14 threshold"
        return {
            "score": total,
            "max": 42,
            "category": cat,
            "interpretation": (
                f"RAADS-14 total: {total}/42. "
                + ("Score is at or above the 14-point cutoff — consider a follow-up assessment." if total >= 14
                   else "Below cutoff for autism spectrum traits.")
            ),
        }

    return {"score": 0, "max": 0, "category": "", "interpretation": ""}


@api.get("/tests/catalog")
async def tests_catalog():
    # Strip internal fields like "threshold"/"reverse"
    out = {}
    for k, t in TESTS.items():
        qs = []
        for q in t["questions"]:
            qs.append({"text": q["text"]})
        copy = {k2: v for k2, v in t.items() if k2 != "questions"}
        copy["questions"] = qs
        out[k] = copy
    return out


@api.post("/tests/submit")
async def submit_test(body: TestSubmitIn, user: dict = Depends(get_current_user)):
    res = _score_test(body.test_id, body.answers, body.extra)
    sub_id = f"sub_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    await db.test_submissions.insert_one(
        {
            "submission_id": sub_id,
            "user_id": user["user_id"],
            "test_id": body.test_id,
            "answers": body.answers,
            "extra": body.extra or {},
            "score": res["score"],
            "max_score": res["max"],
            "category": res["category"],
            "interpretation": res["interpretation"],
            "created_at": now,
        }
    )
    return {
        "submission_id": sub_id,
        "test_id": body.test_id,
        **res,
        "created_at": now.isoformat(),
    }


@api.get("/tests/results")
async def tests_results(user: dict = Depends(get_current_user)):
    cursor = db.test_submissions.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1)
    items = []
    async for d in cursor:
        if isinstance(d.get("created_at"), datetime):
            d["created_at"] = d["created_at"].isoformat()
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
                "name": "Admin User",
                "first_name": "Admin",
                "last_name": "User",
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
