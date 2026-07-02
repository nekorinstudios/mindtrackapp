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

# Install expo-dev-client (needed for the development profile in eas.json)
yarn expo install expo-dev-client
```

Then install the EAS CLI globally (v16+ required for SDK 54):

```bash
npm install -g eas-cli@latest
eas --version   # verify it's >= 16.6.1
```

---

## 🅲 Step C — Confirm your production API URL

**Good news: nothing to do here for now.** Your production backend URL is already baked into `frontend/eas.json` under the `production` profile's `env` block:

```json
"production": {
  ...
  "env": {
    "EXPO_PUBLIC_BACKEND_URL": "https://api.mindtrackjourney.com"
  }
}
```

EAS injects this value at build time, so **you don't need to create a `.env` file** for production builds. If you ever change your API domain, just update this single line in `eas.json`, commit, and rebuild.

> **For local dev only:** if you want to run `npx expo start` locally against your Render backend (instead of the Emergent preview), create a plain `.env` file in `frontend/` with `EXPO_PUBLIC_BACKEND_URL=https://api.mindtrackjourney.com`. This does **not** affect EAS production builds — `eas.json` always wins for those.

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

**Track the build progress:** The `eas build` command prints a **build URL** immediately after the build is queued (looks like `https://expo.dev/accounts/<account>/projects/<slug>/builds/<uuid>`). Copy that URL and open it in your browser to watch progress live. Alternatively, log into **https://expo.dev**, open your account, and click your project to find the build under the **Builds** tab. The exact URL varies per account/project, so use whatever the CLI prints.

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

> **📄 Before you submit: your Privacy Policy page MUST exist and be publicly reachable.**
> Google Play **will reject your submission** during review if `https://mindtrackjourney.com/privacy` returns a 404, a coming-soon page, or a broken link. Host at minimum a plain HTML page that lists: what data you collect (email, symptoms, journal entries, payment info via Stripe), how it's stored (MongoDB Atlas), who it's shared with (only your doctor when you tap Send), and how a user can delete their account. A single well-written page is enough — no fancy template required. **Do this before starting Step G.**

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
   - **App content:** privacy policy URL (must be live at `https://mindtrackjourney.com/privacy` — see callout above), data safety declarations, ads (No), target audience (18+ recommended for a mental health app).
   - **Main store listing** — assets Google requires:
     - **App icon:** 512×512 PNG (Play Store pulls a hi-res version — separate from your in-app icon).
     - **Feature graphic:** 1024×500 PNG or JPG, no alpha channel.
     - **Phone screenshots:** **minimum 2, maximum 8**. JPEG or 24-bit PNG (no alpha). Each side between **320px and 3840px**, and the long side can't be more than 2× the short side. 16:9 or 9:16 aspect ratio recommended.
     - **7-inch tablet screenshots:** optional but **strongly recommended** since your app declares tablet support (`ios.supportsTablet: true` in `app.json`, and Android tablets can install the AAB). Min 1, max 8, same file spec as phone.
     - **10-inch tablet screenshots:** optional but **strongly recommended** for the same reason. Min 1, max 8. Without tablet screenshots your listing is de-prioritised on tablet search results.
     - **Short description:** up to 80 characters.
     - **Full description:** up to 4000 characters.
   - **Pricing:** Free.

4. When the checklist is 100% complete, promote your internal testing build to **Production** or leave it in **Closed testing** while you invite testers.

5. Submit for review. Google takes **1–7 days** for the first review.

---

## 🔁 Rebuilding after code changes

With `appVersionSource: "remote"` and `autoIncrement: true` in `eas.json`, EAS manages `versionCode`/`buildNumber` automatically — you don't have to bump them by hand.

1. Pull the latest code (`git pull`).
2. Optionally increment the **user-facing** `expo.version` in `app.json` (e.g. `1.0.0` → `1.0.1`) — this is what shows on the store listing.
3. Run `eas build --platform android --profile production`.
4. Upload the new `.aab` to Play Console → **Create new release** → **Roll out to production**.

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
| API calls fail in production build | Wrong `EXPO_PUBLIC_BACKEND_URL` value in `frontend/eas.json` (`production.env` block). Update it there, commit, and rebuild. |
| Build succeeds but AAB won't upload | Google Play requires `android.package` in `app.json` to be unique and not already used. You have `com.nekorinstudios.mindtrackjourney` — should be fine. |

---

## 📚 Reference links

- Expo EAS docs: https://docs.expo.dev/build/introduction/
- Play Console guide: https://support.google.com/googleplay/android-developer/answer/9859152
- App Store guide: https://developer.apple.com/app-store/submissions/
