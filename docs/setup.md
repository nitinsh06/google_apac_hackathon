# Setup from scratch

Start from an empty machine and an empty Google account. Roughly 15 minutes.

## Prerequisites

```bash
node --version     # 20 or newer
npm install -g firebase-tools
# gcloud only needed for deployment: https://cloud.google.com/sdk/docs/install
```

## Create the Google Cloud project and enable APIs

```bash
gcloud auth login
gcloud projects create reflectai-$RANDOM --name="ReflectAI"
gcloud config set project YOUR_PROJECT_ID

# Billing must be linked before the Maps and Gemini APIs will serve traffic.
gcloud billing projects link YOUR_PROJECT_ID --billing-account=YOUR_BILLING_ACCOUNT_ID

gcloud services enable \
  run.googleapis.com \
  secretmanager.googleapis.com \
  firestore.googleapis.com \
  identitytoolkit.googleapis.com \
  generativelanguage.googleapis.com \
  maps-backend.googleapis.com \
  places-backend.googleapis.com \
  geocoding-backend.googleapis.com
```

## Add Firebase, then turn on Auth and Firestore

1. Open the [Firebase console](https://console.firebase.google.com/) → **Add project** → pick the
   Cloud project you just created.
2. **Build → Authentication → Get started → Sign-in method → Google → Enable.** Set a support email.
3. **Authentication → Settings → Authorized domains**: add `localhost` and, later, your Cloud Run
   hostname. Sign-in silently fails from any domain not on this list.
4. **Build → Firestore Database → Create database.** Pick a region.
   - If you create a **named** database rather than `(default)`, note the name — it goes in
     `firestoreDatabaseId` below and is passed to `getFirestore(app, id)`.
5. **Project settings → General → Your apps → Web app (`</>`)** → register the app and copy the
   config object.

## Fill in the web config

`firebase-applet-config.json` is committed on purpose — Firebase web config is public by design and
is not a secret. Access control is enforced by `firestore.rules`, not by hiding these values.

```jsonc
{
  "projectId":          "your-project-id",
  "appId":              "1:000000000000:web:abc123",
  "apiKey":             "AIza...",          // browser key, restrict it (§2.5)
  "authDomain":         "your-project-id.firebaseapp.com",
  "firestoreDatabaseId": "",                 // "" or omit for (default)
  "storageBucket":      "your-project-id.appspot.com",
  "messagingSenderId":  "000000000000"
}
```

## Get a Gemini API key

Create one in [Google AI Studio](https://aistudio.google.com/apikey). This key is read **only** by
`server.ts`; it must never be prefixed `VITE_` or it will be inlined into the browser bundle.

## Get a Maps Platform key and a Map ID

1. **Prototyping:** grab a zero-cost
   [Maps Demo Key](https://mapsplatform.google.com/maps-demo-key?utm_campaign=gmp_mcp_codeassist_v1_aistudio)
   — no billing card required.
2. **Production:** create a key in the
   [Credentials page](https://console.cloud.google.com/google/maps-apis/credentials?utm_campaign=gmp_mcp_codeassist_v1_aistudio), then restrict it:
   - **Application restriction → HTTP referrers**: `https://your-service.run.app/*`
   - **API restriction →** *Maps JavaScript API*, *Places API (New)*, *Geocoding API* only.
   - Reference: [Restricting an API key](https://docs.cloud.google.com/api-keys/docs/add-restrictions-api-keys?utm_campaign=gmp_mcp_codeassist_v1_aistudio)
3. **Map ID** (required — `AdvancedMarker` will not render without one): create one under
   [Maps Studio → Map styles](https://console.cloud.google.com/google/maps-apis/studio/maps?utm_campaign=gmp_mcp_codeassist_v1_aistudio),
   choosing **JavaScript / Vector**. `DEMO_MAP_ID` works for local development.

Apply the same referrer + API restrictions to the Firebase `apiKey` in the Cloud Console — it is
public, so restriction is the only thing limiting its use.

## Local environment

```bash
cp .env.example .env
```

```bash
GEMINI_API_KEY="AIza..."                  # server-side only
VITE_GOOGLE_MAPS_API_KEY="AIza..."        # browser
VITE_GOOGLE_MAPS_MAP_ID="DEMO_MAP_ID"     # or your own vector Map ID

# Optional
RESEND_API_KEY=""                         # email notification channel
RESEND_FROM=""                            # e.g. "ReflectAI <hello@yourdomain.com>"
WEBHOOK_BLOCK_PRIVATE_TARGETS="true"      # refuse localhost/RFC1918 webhook targets
```

`.env` is gitignored. Nothing in it is ever committed.

## Deploy the security rules, then run

Rules are **not** optional — the app fails closed without them, and analytics writes are rejected
by shape.

```bash
firebase login
firebase deploy --only firestore:rules

npm install
npm run dev                   # http://localhost:3000
```

This project uses a **named** Firestore database, not `(default)`. `firebase.json` pins both the
project and that database id, so the deploy above targets the right one — deploying without it
writes the rules to `(default)`, where nothing reads them, and every write fails closed with
*Missing or insufficient permissions*. Redeploy whenever `firestore.rules` changes: a feature whose
rules are still local is a feature that fails in the browser.

Sign in with Google. If the popup closes immediately, `localhost` is missing from Authorized
domains (§2.2 step 3).

## Verify the wiring

```bash
curl localhost:3000/api/health
# {"status":"ok","timestamp":"...","env":"development"}

curl localhost:3000/api/analytics/schema
# {"schemaVersion":1,"models":["gemini-3.1-flash-lite", ...]}

# Both analytics routes must reject an unauthenticated caller:
curl -o /dev/null -w '%{http_code}\n' -X POST localhost:3000/api/analytics/extract
# 401
```
