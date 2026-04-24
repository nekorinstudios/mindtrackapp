# MindTrack — Mental Health Symptom Tracker (MVP PRD)

## Overview
Mobile-first React Native Expo app for daily tracking of mental health symptoms and energy, with gamified rewards and doctor-shareable reports. Supports ADHD, Bipolar, and Autism.

## Stack
- **Frontend:** Expo SDK 54, expo-router, react-native-svg, expo-av, expo-notifications, expo-document-picker
- **Backend:** FastAPI, Motor/MongoDB, JWT (PyJWT), bcrypt
- **Auth:** Email/username + password (JWT Bearer) AND Emergent-managed Google OAuth

## Core Features
1. **Auth** — Sign up with email + username + password, or Google. Login by email OR username.
2. **Onboarding** — Pick disorders (ADHD/Bipolar/Autism) OR take a scored 15-question self-assessment.
3. **Home tab** — Touch-drag energy meter with 5 color bands (green 90-100, yellow 51-89, orange 41-50, red 31-40, black 1-30); symptom chips per selected disorder; "Submit check-in" logs and navigates to Rewards.
4. **Tasks tab** — Create tasks with 5/10/15/20/25/30-minute notification interval. Start → scheduled local notifications ("is this done yet?"). Done → increments reward. 10-minute anti-cheat minimum between completions (429 error). Admin-uploaded focus music plays in loop.
5. **Rewards tab** — Pick monthly reward (flowers / candy / giftcard). Visual puzzle fills with emoji items (up to 30). At 30 items an admin notice is created.
6. **Journal tab** — Auto-timestamped entries (editable timestamp via ± preset adjusters). Entries auto-link to recent symptom logs (<= 2h).
7. **Graphs tab** — SVG line chart for energy (last 30 readings), bar chart for symptoms per day (14 days), top-symptoms ranking.
8. **Send tab** — Enter doctor email + date range; records a report request. **MOCKED** (no real email provider configured).
9. **Admin panel** — `/admin` for admin role: upload audio (base64 stored in MongoDB), delete tracks, view reward notices.
10. **Daily notification** — Schedules "have you used the app today?" reminder at 8pm local time on first login.

## Data Model
Collections: `users`, `symptom_logs`, `energy_logs`, `tasks`, `journal`, `award_progress`, `admin_notices`, `music`, `reports_sent`.

## Seeded Admin
- Email: `admin@mindtrack.app`
- Username: `admin`
- Password: `Admin@12345`

## Known Limits / MOCKED
- Send report email is MOCKED.
- Google OAuth works on device via expo-web-browser; on web, use email/password.
- Push notifications require dev build or standalone app (limited in Expo Go).
