# 🚀 Deploy MindTrack Backend to Render (Free)

This is a step-by-step guide to run your FastAPI backend + MongoDB **outside Emergent** on the free tier of Render + MongoDB Atlas.

**Total time:** ~30–45 minutes (mostly clicking through setup wizards).
**Total cost:** $0 to deploy. You already have `mindtrackjourney.com`.

---

## 📋 What you'll end up with

| Piece | Service | Free tier limits |
|---|---|---|
| FastAPI backend | **Render.com** | Sleeps after 15 min idle, ~750 hrs/month, wakes on first request |
| MongoDB database | **MongoDB Atlas** | 512 MB storage forever free |
| Custom subdomain | `api.mindtrackjourney.com` → Render | Free with your existing domain |
| Frontend web build | Render Static Site (later) | 100 GB bandwidth/month |

---

## 🅰️ Step A — Create a free MongoDB Atlas cluster

1. Go to **https://www.mongodb.com/cloud/atlas/register** and sign up (Google/GitHub sign-in works).
2. On the "Deploy a database" screen, choose **M0 Free**.
   - Provider: **AWS**, Region: pick one close to you (e.g. `us-east-1`).
   - Cluster name: `mindtrack-cluster` (or anything).
   - Click **Create Deployment**.
3. **"How would you like to authenticate?"** → pick **Username and Password**.
   - Username: `mindtrack_app`
   - Password: click "Autogenerate Secure Password" → **copy it to a text file** (you'll paste it into Render).
   - Click **Create Database User**.
4. **"Where would you like to connect from?"** → allow access from anywhere so Render can reach the DB.
   - **Newer Atlas UI:** click **"Allow Access From Anywhere"** — this button auto-fills the required entry for you.
   - **Older Atlas UI:** click **"Add a Different IP Address"** and enter `0.0.0.0/0` manually.
   - Both do exactly the same thing (whitelist all IPs); use whichever your dashboard shows. This is safe because the DB is still password-protected.
   - Also click **Add My Current IP Address** so you can connect from your laptop later.
   - Click **Finish and Close**.
5. On the cluster page, click **Connect** → **Drivers** → Python → 3.12+.
   - Copy the connection string. It looks like:
     `mongodb+srv://mindtrack_app:<db_password>@mindtrack-cluster.abcde.mongodb.net/?retryWrites=true&w=majority`
6. Replace `<db_password>` with the password from step 3. Add the database name at the end:
   `mongodb+srv://mindtrack_app:YOURPASS@mindtrack-cluster.abcde.mongodb.net/mindtrack?retryWrites=true&w=majority`
7. Save this final string — you'll paste it into Render as `MONGO_URL`.

---

## 🅱️ Step B — Deploy the backend to Render

1. Go to **https://render.com** and sign in with your GitHub account (free).
2. Click the purple **New +** button (top right) → **Blueprint**.
3. Connect your repo: `nekorinstudios/mindtrackapp` (if not shown, click "Configure account" and grant Render access to that repo).
4. Render reads `render.yaml` from the repo root and shows a preview. Click **Apply**.
5. Render will now ask you to fill in the **secret env vars** (any with `sync: false`). Paste values:

   | Key | Required? | Value |
   |---|---|---|
   | `MONGO_URL` | **required** | The full Atlas URI from Step A6 |
   | `ADMIN_PASSWORD` | **required** | Pick a strong password (e.g. `Admin@YourStrongPass!`) |
   | `STRIPE_SECRET_KEY` | recommended | Your `rk_live_...` restricted key (needed for the paywall) |
   | `STRIPE_PAYMENT_LINK` | recommended | Your `https://buy.stripe.com/...` payment link |
   | `STRIPE_WEBHOOK_SECRET` | recommended | Your `whsec_...` from Stripe dashboard |
   | `RESEND_API_KEY` | **optional — see note below** | Your `re_...` key |

   > **⚠️ You can skip `RESEND_API_KEY` for the first deploy.** See Step D for details on what breaks without it and how to add it later.

6. Click **Create Blueprint**. Render will start building — takes ~3–5 minutes.
7. When the deploy is **Live**, note the URL **that Render assigns to your service** — it's shown at the top of your service dashboard and looks like `https://<something>.onrender.com`. The exact subdomain depends on availability; Render may pick something like `mindtrack-api.onrender.com`, `mindtrack-api-abc12.onrender.com`, or another variant. **Copy whatever URL Render actually gave you.**
8. Test it in your browser: visit `https://<your-render-url>/api/health` — should return `{"ok": true, "service": "mindtrack-api"}`.

---

## 🅲 Step C — Point `api.mindtrackjourney.com` to Render

1. In Render dashboard → your `mindtrack-api` service → **Settings** → **Custom Domains** → **Add Custom Domain**.
2. Enter: `api.mindtrackjourney.com`. Render shows you a CNAME record like: `mindtrack-api-abc123.onrender.com`.
3. Go to your **DNS registrar** for `mindtrackjourney.com` (wherever you bought the domain — Namecheap, Google Domains, GoDaddy, Cloudflare, etc.):
   - Add a **CNAME record**:
     - Host: `api`
     - Value: (the target Render gave you)
     - TTL: Auto (or 300)
4. Wait 5–30 min for DNS to propagate. Render will auto-verify and issue a free SSL cert.
5. Test: `https://api.mindtrackjourney.com/api/health` should now return your backend's response.

---

## 🅳 Step D — Update Stripe & configure Resend (Resend is optional)

**Stripe (required if you want the paywall to work):**
1. Go to **https://dashboard.stripe.com/webhooks** → click your existing webhook.
2. Click **Update endpoint** and change the URL to:
   `https://api.mindtrackjourney.com/api/stripe/webhook`
3. Save. (The `STRIPE_WEBHOOK_SECRET` stays the same.)

**Resend (OPTIONAL — skip on first deploy if you want):**

Resend is **not required** for the initial deployment. The backend gracefully degrades when `RESEND_API_KEY` is missing — you can add it later without redeploying anything else.

**What works without Resend configured:**
- ✅ Signup, login, JWT auth
- ✅ All symptom, task, medicine, journal, energy, rewards tracking
- ✅ Stripe subscriptions and the paywall
- ✅ Admin panel and music/prize management
- ✅ Streaks, graphs, points ledger, trophy room

**What DOESN'T work until you configure Resend:**
- ❌ **"Send to Doctor" reports** — the Send tab won't email HTML summaries
- ❌ **Password reset emails** — users can't reset a forgotten password via email
- ❌ **Email verification banner** — the "verify your email" flow won't send the verification link
- ❌ **Admin notifications** when a user claims a reward

**To configure Resend when you're ready:**
1. Go to **https://resend.com/domains** → **Add Domain**.
2. Enter: `mindtrackjourney.com`.
3. Resend gives you DNS records (SPF, DKIM, DMARC). Add each one at your registrar just like the CNAME in Step C.
4. Wait for verification (usually < 1 hour). Once verified, Resend will send emails from `noreply@mindtrackjourney.com` to **any** address (not just your own).
5. In Render dashboard → your service → **Environment** → add `RESEND_API_KEY` and update `SENDER_EMAIL` to `noreply@mindtrackjourney.com` → click **Save Changes**. Render will auto-redeploy.

---

## 🅴 Step E — Point your app's frontend at the new backend

Your production backend URL is already configured in **`frontend/eas.json`** under the `production` profile's `env` block:

```json
"env": {
  "EXPO_PUBLIC_BACKEND_URL": "https://api.mindtrackjourney.com"
}
```

EAS injects this at build time, so **no `.env.production` file is needed**. If your API domain ever changes, edit this single line in `eas.json`, commit, and rebuild.

That's it — your next `eas build --platform android --profile production` will call your Render backend automatically. See `EAS_BUILD_GUIDE.md` for the full build walkthrough.

---

## 🆘 Troubleshooting

| Symptom | Fix |
|---|---|
| `500 Internal Server Error` on first request | Free tier sleeps after 15 min. First request wakes it (~30s cold start). Normal. |
| `pymongo.errors.ServerSelectionTimeoutError` | Your Atlas IP whitelist doesn't include `0.0.0.0/0`. Fix in Atlas → Network Access. |
| Backend logs show "MONGO_URL not set" | You forgot to paste it in Render env vars. Add and redeploy. |
| Custom domain shows "Certificate pending" for > 1 hour | Double-check the CNAME points to the exact target Render gave you (no trailing dot issues). |
| Stripe webhook returns 400 | The `STRIPE_WEBHOOK_SECRET` in Render doesn't match the one shown in the Stripe dashboard. Regenerate and re-paste. |

---

## ✅ Deployment Verification Checklist

Before moving on to `EAS_BUILD_GUIDE.md`, confirm **every** item below passes. If any fail, fix them first — a broken backend will make the mobile app appear broken in ways that are hard to debug from the client side.

### 🔗 Backend reachability
- [ ] Render dashboard shows your service status as **Live** (green dot).
- [ ] `https://<your-render-url>/api/health` returns `{"ok": true, "service": "mindtrack-api"}` in a browser.
- [ ] `https://api.mindtrackjourney.com/api/health` returns the same response (custom domain propagated + SSL cert issued).
- [ ] Render → **Logs** tab shows the line `INFO: Application startup complete.` with no red error stack traces.

### 🗄️ Database connectivity
- [ ] Render logs do **not** contain `ServerSelectionTimeoutError` or `MONGO_URL not set`.
- [ ] MongoDB Atlas → **Network Access** shows the "allow anywhere" (`0.0.0.0/0`) entry as **Active**.
- [ ] Atlas → **Database Users** shows `mindtrack_app` with **Read and write to any database** privilege.

### 🔐 Auth smoke test
- [ ] `POST https://api.mindtrackjourney.com/api/auth/login` with body `{"identifier":"admin@mindtrackjourney.com","password":"<your ADMIN_PASSWORD>"}` returns HTTP **200** with an `access_token` field.
  - (You can test this with a browser extension like **Talend API Tester**, **Postman**, or the free web app **hoppscotch.io**.)
- [ ] `POST /api/auth/register` with a fresh test user returns **200** and creates the account (verifiable in Atlas → Collections → `users`).

### 💳 Stripe wiring (if you set the Stripe keys)
- [ ] Stripe dashboard → **Webhooks** → your endpoint shows the URL is now `https://api.mindtrackjourney.com/api/stripe/webhook`.
- [ ] Click **Send test webhook** in Stripe → pick `checkout.session.completed` → response should be **200 OK** (Render logs should show the event was received).

### ⚙️ Env vars sanity check
- [ ] Render → your service → **Environment** tab lists all 14 keys from `render.yaml` with non-empty values (except `RESEND_API_KEY` if you chose to skip it).
- [ ] `EXPO_PUBLIC_BACKEND_URL` in Render equals `https://api.mindtrackjourney.com` exactly.
- [ ] `DB_NAME` value matches the database segment in your `MONGO_URL` (default: `mindtrack`).

### 🚫 Regression check
- [ ] `GET /api/catalog/symptoms` **without** an Authorization header returns **401** (endpoint is auth-gated — expected behavior).
- [ ] Same request **with** a valid `Bearer <token>` returns **200** with the symptom catalog JSON.

### 📧 Resend (only if you configured it)
- [ ] Resend → **Domains** shows `mindtrackjourney.com` as **Verified**.
- [ ] `POST /api/auth/forgot-password` for your own email successfully sends a reset link (check your inbox within ~1 min).

---

Once every applicable box is checked, you're clear to move on to **`EAS_BUILD_GUIDE.md`** and build your Android app.

---

## 🎯 What's next

Once the backend is live, follow **`EAS_BUILD_GUIDE.md`** to build your Android app and publish to Google Play.
