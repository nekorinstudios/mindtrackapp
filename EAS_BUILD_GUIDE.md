# 📱 Build MindTrack for Google Play (Free with EAS)

Step-by-step guide to build your Android app **for free** using Expo's EAS Build service and publish to the Google Play Store.

**Prerequisite:** Backend deployed to Render — see `RENDER_DEPLOY.md`.

**Total cost:** $25 one-time to Google Play. EAS free tier covers your builds.

**Time:** ~1–2 hours the first time (Google Play account approval can add 24–48 hrs).

---

## 📋 Overview of what you'll do

1. Clone your repo locally (or use your dev machine).
2. Set the production API URL for the frontend.
3. Install Expo CLI + EAS CLI.
4. Run `eas build --platform android --profile production`.
5. Wait ~15–25 minutes → download the `.aab` file.
6. Create a Google Play developer account ($25 one-time).
7. Upload the `.aab`, fill out the store listing, submit for review.

---

## 🅰️ Step A — Get your code locally

If you don't have the repo cloned yet:

```bash
cd ~
git clone https://github.com/nekorinstudios/mindtrackapp.git
cd mindtrackapp/frontend
```

If you already have it, just `cd` into `mindtrackapp/frontend` and `git pull`.

---

## 🅱️ Step B — Install dependencies

You need **Node.js 20+** (download from https://nodejs.org if you don't have it) and **Yarn 1.x**.

```bash
# Install Yarn if needed
npm install -g yarn

# In the frontend directory:
yarn install
```

Then install the EAS CLI globally:

```bash
npm install -g eas-cli
```

---

## 🅲 Step C — Point the frontend at your production backend

Create a `.env.production` file in the **frontend/** directory (or copy the example):

```bash
cp .env.production.example .env.production
```

Edit `.env.production` and make sure it says:

```env
EXPO_PUBLIC_BACKEND_URL=https://api.mindtrackjourney.com
```

**⚠️ Do NOT commit** `.env.production` to Git if you have secrets in there. It's fine to commit if it only contains public URLs.

---

## 🅳 Step D — Log into Expo & configure the project

```bash
eas login
# Enter your Expo credentials: username = nekorinstudios
```

Then, from inside the `frontend/` directory:

```bash
eas init
```

This will:
- Create an Expo project on your account (called `mindtrack`).
- Add a `projectId` to your `app.json` under `expo.extra.eas.projectId`.
- **Commit this change** to Git so future builds have it.

If prompted about `eas.json`, it will create one — a version is already provided in the repo, but let EAS overwrite it if needed.

---

## 🅴 Step E — Build the app for Android

```bash
eas build --platform android --profile production
```

You'll see prompts like:

- **"Generate a new Android Keystore?"** → **Yes** (EAS stores it securely on their servers; you can download a backup any time).
- The build will queue and run on Expo's servers.

Watch progress at `https://expo.dev/accounts/nekorinstudios/projects/mindtrack/builds`.

**Free tier notes:**
- Free tier = ~1 concurrent build, ~30 builds/month (more than enough for a solo dev).
- Build time: ~15–25 minutes for a fresh Android build.

When done, EAS gives you a **download link** to your `.aab` (Android App Bundle). Download it.

---

## 🅵 Step F — Create a Google Play developer account ($25 one-time)

1. Go to **https://play.google.com/console/signup**
2. Sign in with a Google account (personal or business).
3. Pay the **$25 one-time fee**.
4. Fill out the developer profile (name, contact, etc.).
5. Wait for Google to approve — usually **a few hours** for personal accounts, can take up to **48 hours** for business.

---

## 🅶 Step G — Upload your `.aab` and publish

1. In Play Console → click **Create app**.
   - App name: `MindTrack Journey`
   - Default language: English (US)
   - App or game: **App**
   - Free or paid: **Free** (your paywall is in-app, so the app itself is free to download)
   - Accept declarations, click **Create app**.

2. Left sidebar → **Testing** → **Internal testing** (start here to test the build before public release).
   - Click **Create new release** → **Upload** → drop the `.aab` file → click **Next**.
   - Fill in release notes: e.g. `First release — track ADHD/Bipolar/Autism symptoms, tasks, medicines, journal, and rewards.`
   - Click **Save**.

3. Left sidebar → **Dashboard** → work through the setup checklist:
   - **App content:** privacy policy URL (host a simple page at `https://mindtrackjourney.com/privacy`), data safety declarations, ads (No), target audience (18+ recommended for a mental health app).
   - **Main store listing:** app description (short + full), screenshots (need 2 phone, 1 tablet if you support tablets), feature graphic (1024×500 PNG), icon (already in `frontend/assets/images/icon.png`).
   - **Pricing:** Free.

4. When the checklist is 100% complete, promote your internal testing build to **Production** or leave it in **Closed testing** while you invite testers.

5. Submit for review. Google takes **1–7 days** for the first review.

---

## 🔁 Rebuilding after code changes

Every time you update the app:

1. Pull the latest code (`git pull`).
2. Increment `expo.version` in `app.json` (e.g. `1.0.0` → `1.0.1`).
3. Also increment `expo.android.versionCode` (integer, starts at 1) in `app.json` — Google Play REQUIRES this to be higher than the last upload.
4. Run `eas build --platform android --profile production` again.
5. Upload the new `.aab` to Play Console → **Create new release** → **Roll out to production**.

---

## 🍎 Later: iOS (App Store)

Same flow but:
- Requires an **Apple Developer account ($99/year)**.
- Requires a **Mac** OR use EAS with credentials (EAS can build for iOS without a Mac).
- Run `eas build --platform ios --profile production`.
- Upload via `eas submit --platform ios` or Xcode's Transporter app.

You already have `bundleIdentifier: com.nekorinstudios.mindtrackjourney` set in `app.json`, so you're ready when the budget allows.

---

## 🆘 Common issues

| Problem | Fix |
|---|---|
| `EAS Build failed: Metro bundling error` | Run `yarn install` again locally, then re-try. |
| `Insufficient permissions on Play Console` | Google's account approval isn't complete yet. Wait it out. |
| App crashes on real device but works in Expo Go | Some libraries only run in a native build. Check `expo-notifications` needs a build, not Expo Go. |
| API calls fail in production build | Wrong `EXPO_PUBLIC_BACKEND_URL` in `.env.production`. Check the value and rebuild. |
| Build succeeds but AAB won't upload | Google Play requires `android.package` in `app.json` to be unique and not already used. You have `com.nekorinstudios.mindtrackjourney` — should be fine. |

---

## 📚 Reference links

- Expo EAS docs: https://docs.expo.dev/build/introduction/
- Play Console guide: https://support.google.com/googleplay/android-developer/answer/9859152
- App Store guide: https://developer.apple.com/app-store/submissions/
