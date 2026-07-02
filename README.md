# MindTrack Journey

A mental-health symptom-tracking mobile app for people managing **ADHD, Bipolar, Autism, and AuDHD**. Log symptoms as they happen, keep on top of medications, journal your day, earn rewards for consistency, and share full progress reports with your doctor — all in one gentle, gamified place.

Built with Expo SDK 54, FastAPI, and MongoDB Atlas. Runs on iOS, Android, and the web.

---

## ✨ Main features

- **Daily symptom tracking** — pick from a curated catalog per disorder (ADHD, Bipolar, Autism, AuDHD). Every check is timestamped so patterns become visible over time.
- **Energy meter** — touch-and-drag gradient meter to log how much energy you have right now.
- **Medications** — track what you take, when you took it, and skipped doses. Contributes to points.
- **Task manager** — set duration-based tasks (5 / 10 / 30 minutes) with a 10-minute anti-cheat gap between claims. Points scale with duration.
- **Journal** — auto date-and-time-stamped entries. Today's symptom + energy context is shown alongside so journaling feels less like a blank page.
- **Focus music** — user-uploaded personal tracks (5 MB max, private) plus admin-provided community tracks. Long-press to delete your own uploads.
- **Music requests** — ask the admin to add a specific song or genre; get notified when it's fulfilled or declined.
- **Rewards & Points Ledger** — every action feeds a points ledger (daily caps per action type). Pick a monthly reward category (Bouquet, Candy Jar, Toy Surprise, Treasure Chest); the picture fills up dynamically across 5 tiers (0 → 25 → 50 → 75 → 100 points).
- **Trophy Room** — permanent history of claimed prizes.
- **Custom Admin Prizes** — the admin uploads real prize variations per category so users can pick a specific one when they hit 100 points.
- **Streak counter** — home-screen streak that grows for consecutive daily check-ins.
- **Graphs** — fluctuation charts for symptoms, energy, and medicine adherence.
- **Send-to-Doctor reports** — one tap emails a full HTML progress report (via Resend) to a saved doctor profile.
- **Email verification & password reset** — full auth flow with signed JWT tokens.
- **Stripe subscription paywall** — $1.99/month with a 7-day free trial. Live webhooks with signature verification. Admins bypass the paywall automatically.

---

## 🧱 Tech stack

| Layer | Technology |
|---|---|
| **Mobile & Web frontend** | Expo SDK 54, React Native, TypeScript, Expo Router (file-based routing), React Navigation, `react-native-reanimated`, `@shopify/flash-list`, `react-native-svg` |
| **State & storage** | React Context, `@react-native-async-storage/async-storage`, `expo-secure-store` |
| **Media** | `expo-audio` / `expo-av` (music playback), `expo-document-picker`, `expo-file-system` |
| **Backend** | FastAPI (Python 3.12+), Motor (async MongoDB driver), Pydantic v2 |
| **Auth** | Custom JWT (`pyjwt`), bcrypt password hashing |
| **Database** | MongoDB Atlas (free-tier compatible, 512 MB) |
| **Payments** | Stripe (subscriptions + webhooks) |
| **Email** | Resend (transactional emails, doctor reports, password reset) |
| **Hosting** | Render (backend), Custom domain via CNAME |
| **Mobile builds** | EAS Build (free tier), Google Play & App Store submission |

---

## 📁 Project structure

```
mindtrackapp/
├── frontend/                    # Expo (React Native) app
│   ├── app/                     # File-based routes (Expo Router)
│   │   ├── _layout.tsx          # Root layout + Stripe paywall gate
│   │   ├── index.tsx            # Landing page
│   │   ├── login.tsx
│   │   ├── signup.tsx
│   │   ├── forgot-password.tsx
│   │   ├── paywall.tsx
│   │   ├── admin.tsx            # Admin panel
│   │   ├── admin-prize.tsx      # Admin custom-prize uploads
│   │   ├── claim.tsx            # Prize claim flow
│   │   ├── claim-options.tsx
│   │   └── (tabs)/
│   │       ├── _layout.tsx      # Bottom-tab navigator
│   │       ├── home.tsx         # Energy, symptoms, streak
│   │       ├── tasks.tsx        # Medicines, tasks, music
│   │       ├── rewards.tsx      # Points progression, trophy room
│   │       ├── journal.tsx
│   │       ├── graphs.tsx
│   │       └── send.tsx         # Doctor reports
│   ├── src/
│   │   ├── api.ts               # Axios client
│   │   ├── auth.tsx             # Auth context
│   │   └── notify.ts            # Local notification helpers
│   ├── assets/                  # Icons, splash, prize tier images
│   ├── app.json                 # Expo config
│   ├── eas.json                 # EAS Build profiles
│   └── package.json
│
├── backend/                     # FastAPI service
│   ├── server.py                # All API routes (auth, symptoms, tasks,
│   │                            # medicines, journal, rewards, stripe,
│   │                            # resend, music, requests, admin)
│   ├── requirements.txt
│   └── .env                     # Local-dev env vars (not committed)
│
├── render.yaml                  # Render Blueprint (deploys backend)
├── RENDER_DEPLOY.md             # Backend deployment walkthrough
├── EAS_BUILD_GUIDE.md           # Mobile build & Google Play submission
└── README.md                    # This file
```

---

## 🛠 Local development

### Prerequisites

- Node.js 20+
- Yarn 1.x (`npm install -g yarn`)
- Python 3.11+ with `pip`
- A running MongoDB instance (local Docker or MongoDB Atlas free tier)
- Optional: [Expo Go](https://expo.dev/client) on your phone for live-reload testing

### 1. Clone

```bash
git clone https://github.com/nekorinstudios/mindtrackapp.git
cd mindtrackapp
```

### 2. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Create a .env with the variables listed below
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

The API is now live at `http://localhost:8001/api/...`.
Health check: `curl http://localhost:8001/api/health` → `{"ok": true, "service": "mindtrack-api"}`.

### 3. Frontend

```bash
cd frontend
yarn install
yarn start                       # or: npx expo start
```

Scan the QR code with Expo Go, or press `w` to open the web preview.

By default the frontend reads `EXPO_PUBLIC_BACKEND_URL` from `frontend/.env` (create one if needed for local dev). Production builds read the same variable from `eas.json`.

---

## 🚀 Deployment

Detailed step-by-step guides live at the root of the repo:

- **Backend → Render + MongoDB Atlas + custom domain** → see [`RENDER_DEPLOY.md`](./RENDER_DEPLOY.md)
- **Mobile app → EAS Build + Google Play Store** → see [`EAS_BUILD_GUIDE.md`](./EAS_BUILD_GUIDE.md)

Both guides are written for the free tier and include verification checklists.

---

## 🔐 Environment variables

### Backend (`backend/.env` for local, Render dashboard for production)

**Required:**
- `MONGO_URL`
- `DB_NAME`
- `JWT_SECRET`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `ADMIN_USERNAME`

**Recommended (paywall):**
- `STRIPE_SECRET_KEY`
- `STRIPE_PAYMENT_LINK`
- `STRIPE_WEBHOOK_SECRET`
- `SUBSCRIPTION_PRICE_USD`
- `SUBSCRIPTION_TRIAL_DAYS`

**Optional (email features gracefully degrade if omitted):**
- `RESEND_API_KEY`
- `SENDER_EMAIL`

**Backend base URL (used for Stripe return URLs, etc.):**
- `EXPO_PUBLIC_BACKEND_URL`

### Frontend (production values live in `frontend/eas.json` under `build.production.env`; local dev via `frontend/.env`)

- `EXPO_PUBLIC_BACKEND_URL`

> **Never** put secret keys in any `EXPO_PUBLIC_*` variable — they're bundled into the client JavaScript and readable by anyone who unpacks the app.

---

## 🧰 Build & run commands

### Backend

```bash
# Local dev (auto-reload)
uvicorn server:app --host 0.0.0.0 --port 8001 --reload

# Production (Render uses this)
uvicorn server:app --host 0.0.0.0 --port $PORT

# Install / freeze dependencies
pip install -r requirements.txt
pip freeze > requirements.txt
```

### Frontend

```bash
# Start dev server
yarn start                                   # or: npx expo start
yarn start --clear                           # clear Metro cache
yarn android                                 # open on Android
yarn ios                                     # open on iOS
yarn web                                     # open web preview

# Install / update dependencies (respects Expo-managed versions)
yarn expo install <package-name>

# Lint
yarn lint

# EAS builds (requires `eas-cli` v16.6.1+ and `eas login`)
eas init                                     # first-time project setup
eas build --platform android --profile production
eas build --platform ios --profile production
eas build --platform android --profile preview       # internal test APK

# Submit to store (after credentials configured)
eas submit --platform android
eas submit --platform ios
```

---

## 🧪 Testing

- Backend integration tests / smoke checks live under `/app/test_reports/` (JSON reports from the automated testing agent).
- Manual auth credentials for local admin testing are documented in `/app/memory/test_credentials.md` (not part of the deployed app; local development reference only).

---

## 📄 License

**Proprietary — © 2026 Nekorin Studios. All rights reserved.**

This source code is provided for the sole purpose of building and operating the MindTrack Journey mobile application. Redistribution, modification, or public reuse in any form is not permitted without explicit written consent from the copyright holder.

If you are a contractor or contributor working on the project, refer to your engagement agreement for permitted use.

---

## 🙋 Support & contact

- Bugs, feature ideas: open a GitHub issue on this repo.
- Business / partnership inquiries: hello@mindtrackjourney.com
- Website: https://mindtrackjourney.com
