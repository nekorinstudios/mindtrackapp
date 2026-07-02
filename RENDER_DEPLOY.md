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
4. **"Where would you like to connect from?"** → choose **My Local Environment**. Click **Add My Current IP Address**, then also click **"Add a Different IP Address"** and enter `0.0.0.0/0` (this allows Render to connect from anywhere — safe because it's still password-protected).
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

   | Key | Value |
   |---|---|
   | `MONGO_URL` | The full Atlas URI from Step A6 |
   | `ADMIN_PASSWORD` | Pick a strong password (e.g. `Admin@YourStrongPass!`) |
   | `RESEND_API_KEY` | Your `re_...` key |
   | `STRIPE_SECRET_KEY` | Your `rk_live_...` restricted key |
   | `STRIPE_PAYMENT_LINK` | Your `https://buy.stripe.com/...` payment link |
   | `STRIPE_WEBHOOK_SECRET` | Your `whsec_...` from Stripe dashboard |

6. Click **Create Blueprint**. Render will start building — takes ~3–5 minutes.
7. When the deploy is **Live**, note the URL: `https://mindtrack-api.onrender.com`
8. Test it in your browser: visit `https://mindtrack-api.onrender.com/api/health` — should return `{"ok": true}` (or similar).

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

## 🅳 Step D — Update Stripe & Resend to use the new URLs

**Stripe:**
1. Go to **https://dashboard.stripe.com/webhooks** → click your existing webhook.
2. Click **Update endpoint** and change the URL to:
   `https://api.mindtrackjourney.com/api/stripe/webhook`
3. Save. (The `STRIPE_WEBHOOK_SECRET` stays the same.)

**Resend:**
1. Go to **https://resend.com/domains** → **Add Domain**.
2. Enter: `mindtrackjourney.com`.
3. Resend gives you DNS records (SPF, DKIM, DMARC). Add each one at your registrar just like the CNAME in Step C.
4. Wait for verification (usually < 1 hour). Once verified, Resend will send emails from `noreply@mindtrackjourney.com` to **any** address (not just your own).

---

## 🅴 Step E — Point your app's frontend at the new backend

The Expo app reads `EXPO_PUBLIC_BACKEND_URL` at build time. When you build with EAS (see `EAS_BUILD_GUIDE.md`), create a file in the `frontend/` folder:

**`frontend/.env.production`** (copy from `.env.production.example`):
```env
EXPO_PUBLIC_BACKEND_URL=https://api.mindtrackjourney.com
```

That's it — your production build will call your Render backend instead of Emergent.

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

## 🎯 What's next

Once the backend is live, follow **`EAS_BUILD_GUIDE.md`** to build your Android app and publish to Google Play.
