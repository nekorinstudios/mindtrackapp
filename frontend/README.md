# MindTrack Journey — Frontend

This directory contains the **Expo (React Native) mobile & web app** for MindTrack Journey — a mental-health tracker for ADHD, Bipolar, Autism, and AuDHD.

> **📖 The main project README is at the repo root:** [`../README.md`](../README.md)
>
> That file covers project overview, features, tech stack, environment variables, deployment guides, and license.

---

## Frontend-specific quickstart

```bash
yarn install
yarn start                    # or: npx expo start
```

Open the app:
- **Expo Go** — scan the QR code with the Expo Go app on iOS/Android
- **iOS Simulator** — press `i` in the terminal
- **Android Emulator** — press `a`
- **Web** — press `w`

---

## Routing

This app uses **Expo Router** with file-based routing. Every file inside `app/` becomes a route:

```
app/index.tsx                  → /
app/login.tsx                  → /login
app/(tabs)/home.tsx            → /home  (inside the tab bar)
app/(tabs)/tasks.tsx           → /tasks
```

The `(tabs)` folder groups the bottom-tab navigator. `_layout.tsx` files define layout wrappers.

---

## Configuration files

| File | Purpose |
|---|---|
| `app.json` | Expo config — app name, icon, splash, bundle IDs, permissions |
| `eas.json` | EAS Build profiles (development / preview / production) |
| `tsconfig.json` | TypeScript compiler options |
| `metro.config.js` | Metro bundler config **(do not modify)** |
| `.env` | Local dev environment variables (optional; not committed) |

---

## Build & release

See [`../EAS_BUILD_GUIDE.md`](../EAS_BUILD_GUIDE.md) for the full walkthrough from `eas build` to Google Play submission.

Quick reference:

```bash
eas login
eas build --platform android --profile production
eas build --platform ios --profile production
```

Production builds automatically pick up `EXPO_PUBLIC_BACKEND_URL` from `eas.json` — no `.env.production` file needed.

---

## License

Proprietary — © 2026 Nekorin Studios. See root [`README.md`](../README.md#-license) for details.
