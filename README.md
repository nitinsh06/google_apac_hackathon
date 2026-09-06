# ReflectAI — Gemini Reflection Journal

A private, user-authenticated journal. You write; Gemini reflects back; entries can be pinned to
a map; and a cheap second model pass turns what you wrote into charts and monthly retrospectives.
Everything is stored per-user in Cloud Firestore behind owner-bound rules.

---

## 1. Google services in this app

Seven Google products do real work here. This table is the map from product → what it actually
does in this codebase → where it is wired → what credential it needs.

| Google service | What it does here | Where it is integrated | Credential |
| :--- | :--- | :--- | :--- |
| **Gemini API** (`@google/genai`) | Two separate jobs on two model ladders: the reflection dialogue (`gemini-3.6-flash` first) and the analytics extraction pass (`gemini-3.1-flash-lite` first, JSON-schema constrained). | `server.ts` — `generateContentWithFallback()`, routes `/api/gemini/*` and `/api/analytics/*`. Prompts and schemas live in `src/server/analyticsExtract.ts`. | `GEMINI_API_KEY` — **server-side only**, never sent to the browser. |
| **Firebase Authentication** | Google federated sign-in. The app never sees or stores a password. Every server route that touches user data verifies the caller's Firebase ID token. | Client: `src/lib/firebaseApp.ts` (`getAuth`, `GoogleAuthProvider`), `src/lib/firebase.ts` (`signInWithPopup`). Server: `src/server/firebaseAuth.ts` verifies RS256 against Google's public x509 certs — **no Admin SDK, no service account**. | Public web config in `firebase-applet-config.json`. |
| **Cloud Firestore** | All persistence: reflections, integration settings, appearance preferences, per-entry analytics readings, monthly summaries. | Client SDK throughout `src/lib/`. The server reads one document over the **Firestore REST API using the caller's own ID token** (`src/server/firestoreRest.ts`), so security rules still apply and the server needs no elevated credentials. | Same web config; access governed entirely by `firestore.rules`. |
| **Maps JavaScript API** | The Places Map canvas, `AdvancedMarker` pins, clustering, and light/dark `colorScheme` that follows the app theme. | `src/components/PlacesMap.tsx` via `@vis.gl/react-google-maps`. | `VITE_GOOGLE_MAPS_API_KEY` + `VITE_GOOGLE_MAPS_MAP_ID` (Advanced Markers require a Map ID). |
| **Places API (New)** | Landmark and place search when pinning a reflection — `AutocompleteSuggestion.fetchAutocompleteSuggestions()` and `place.fetchFields()`. Legacy `Autocomplete`/`PlacesService` are deliberately not used. | `src/components/LocationPickerModal.tsx`. | Same Maps key. |
| **Geocoding API** | Forward lookup for typed coordinates, and reverse lookup to name a dropped pin. | `src/components/LocationPickerModal.tsx` (`geocodingLib.Geocoder`). | Same Maps key. |
| **Cloud Run** | Hosts the single Express service that serves both the built SPA and the API. | `server.ts`, deployed from source. | — |
| **Secret Manager** | Holds `GEMINI_API_KEY` in production and injects it into Cloud Run. | `--set-secrets` at deploy time. | IAM binding, see §4. |

> **Not a Google service:** the optional email notification channel uses [Resend](https://resend.com).
> Leave `RESEND_API_KEY` unset and the Email destination simply reports that it is not configured.

### How a request actually flows

```
Browser ──► Firebase Auth (Google popup) ──► ID token held in the SDK
   │
   ├─► Cloud Firestore  (direct, client SDK, owner-bound rules)
   │
   └─► Express server (server.ts)
          ├─ /api/gemini/*      ──► Gemini API          (GEMINI_API_KEY, server-side)
          ├─ /api/analytics/*   ──► Gemini API (lite)   verify ID token first
          └─ /api/webhooks/*    ──► Discord / Slack / Resend
                                    destination read from the caller's own
                                    Firestore doc, never from the request body
```

Two invariants worth knowing before you change anything:

- **The browser never names an outbound destination.** For webhooks it names an *event*; the server
  reads where to send it from the caller's own settings document. Otherwise this is an open proxy.
- **No service account exists.** The server authenticates *as the caller* for the one Firestore read
  it makes, so a server compromise cannot read another user's data.

---

## 2. Setup from scratch

Start from an empty machine and an empty Google account. Roughly 15 minutes.

### 2.0 Prerequisites

```bash
node --version     # 20 or newer
npm install -g firebase-tools
# gcloud only needed for deployment: https://cloud.google.com/sdk/docs/install
```

### 2.1 Create the Google Cloud project and enable APIs

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

### 2.2 Add Firebase, then turn on Auth and Firestore

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

### 2.3 Fill in the web config

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

### 2.4 Get a Gemini API key

Create one in [Google AI Studio](https://aistudio.google.com/apikey). This key is read **only** by
`server.ts`; it must never be prefixed `VITE_` or it will be inlined into the browser bundle.

### 2.5 Get a Maps Platform key and a Map ID

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

### 2.6 Local environment

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

### 2.7 Deploy the security rules, then run

Rules are **not** optional — the app fails closed without them, and analytics writes are rejected
by shape.

```bash
firebase login
firebase use --add            # select your project
firebase deploy --only firestore:rules

npm install
npm run dev                   # http://localhost:3000
```

Sign in with Google. If the popup closes immediately, `localhost` is missing from Authorized
domains (§2.2 step 3).

### 2.8 Verify the wiring

```bash
curl localhost:3000/api/health
# {"status":"ok","timestamp":"...","env":"development"}

curl localhost:3000/api/analytics/schema
# {"schemaVersion":1,"models":["gemini-3.1-flash-lite", ...]}

# Both analytics routes must reject an unauthenticated caller:
curl -o /dev/null -w '%{http_code}\n' -X POST localhost:3000/api/analytics/extract
# 401
```

---

## 3. Firestore data model and security rules

Every document lives under `users/{uid}`. There is no shared collection and no admin path.

| Path | Written by | Holds |
| :--- | :--- | :--- |
| `users/{uid}/reflections/{entryId}` | Client | The journal entry: title, category, turns, optional location. |
| `users/{uid}/preferences/appearance` | Client | Theme (`light`/`dark`) and accent choice, synced across devices. |
| `users/{uid}/preferences/integrations` | Client | Webhook destinations and their event/category filters. |
| `users/{uid}/insights/{entryId}` | Client, from the extraction endpoint's response | Domains, mood (valence + energy), belief shifts, recurring patterns. |
| `users/{uid}/monthlySummaries/{YYYY-MM}` | Client, from the summary endpoint's response | The written retrospective for a closed month. |

The live rules are in [`firestore.rules`](./firestore.rules). Two things about their shape are
deliberate and easy to get wrong:

- **No `{allSubcollections=**}` wildcard.** Firestore ORs matching rules, so a broad `allow write`
  sitting beside a validated one means the validation never runs. Every path is named explicitly —
  **adding a subcollection means adding a rule**, or it is denied.
- **Analytics documents are shape-checked**, not just owner-checked. They are written straight from
  the browser, so the rule pins the field set, the enum values, and the array lengths rather than
  trusting the client.

```javascript
match /users/{userId}/insights/{entryId} {
  allow read, delete: if isOwner(userId);
  allow create, update: if isOwner(userId)
    && request.resource.data.keys().hasOnly([
         'entryId', 'entryTitle', 'entryCreatedAt', 'category',
         'domains', 'primaryDomain', 'valence', 'energy', 'sentiment',
         'emotions', 'beliefShifts', 'patterns', 'depth', 'summary',
         'extractedAt', 'model', 'schemaVersion'
       ])
    && request.resource.data.entryId == entryId
    && request.resource.data.valence >= -1 && request.resource.data.valence <= 1
    && request.resource.data.domains.size() <= 4;
}
```

---

## 4. Deploying to Cloud Run

```bash
# 1. Store the Gemini key in Secret Manager
gcloud secrets create GEMINI_API_KEY --replication-policy="automatic"
echo -n "YOUR_API_KEY" | gcloud secrets versions add GEMINI_API_KEY --data-file=-

gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --member="serviceAccount:YOUR_PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# 2. Deploy
gcloud run deploy reflectai \
  --source . \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest \
  --set-env-vars NODE_ENV=production,VITE_GOOGLE_MAPS_API_KEY=...,VITE_GOOGLE_MAPS_MAP_ID=...
```

> **`NODE_ENV=production` is load-bearing.** `startServer()` branches on it, and `npm start` does
> not set it. Without it Cloud Run boots the **Vite dev server** in production. Do not drop that flag.

After the first deploy, add the Cloud Run hostname to **Firebase Auth → Authorized domains** and to
the Maps key's HTTP-referrer restriction, or sign-in and the map will both fail on the deployed URL.

### Known production gaps

Carried from the security review and **not yet fixed** — read before exposing this publicly:

| | Issue | Impact |
| :--- | :--- | :--- |
| **HIGH** | `/api/gemini/reflect` and `/api/gemini/suggest-title` are unauthenticated | Anyone with the URL spends your Gemini quota. `/api/analytics/*` and `/api/webhooks/*` *are* authenticated. |
| **HIGH** | `vite build` and the server bundle share `dist/`, which `express.static` serves | `GET /server.cjs` and `/server.cjs.map` return your server source. |
| **MEDIUM** | Upstream error text is returned verbatim to the client | Leaks provider detail on failure. |
| **MEDIUM** | No CSP, `X-Frame-Options`, HSTS, or `Referrer-Policy` | Clickjackable; no defence in depth. |

---

## 5. Threat model

| Threat Zone | Identified Risks | Countermeasures & Implementation Strategy |
| :--- | :--- | :--- |
| **1. Input Surfaces** | Prompt injection in journal entries, oversized text payloads, malicious coordinates/geocoding injections, XSS via rendered AI responses, and hostile output from the analytics extraction model. | Strict character limit (`maxLength: 8000`), HTML/Markdown entity encoding via safe React Markdown rendering, coordinate bounds checking, and re-clamping of every extraction field (closed domain enum, bounded numbers, capped arrays) before it reaches Firestore or a chart axis. |
| **2. Planning & Reasoning** | Prompt injection attempting to leak system instructions or bypass reflection guidelines. | Server-side prompt encapsulation with strict system instructions; untrusted user inputs wrapped strictly as reflection context. |
| **3. Tool Execution & API** | Direct exposure of Gemini API key or unrestricted Maps keys; SSRF or unauthorized proxy endpoints. | Full-stack architecture (`server.ts`) proxying all Gemini calls; `GEMINI_API_KEY` accessed exclusively server-side; client Maps key scoped by HTTP referrer; zero hardcoded credentials. |
| **4. Memory & State** | Cross-user data leakage, unauthenticated document reads/writes, orphaned interactions, update gaps. | Owner-bound Firestore rules on every named path (`request.auth.uid == userId`); no `{allSubcollections=**}` wildcard, so per-document shape validation on `insights` and `monthlySummaries` is not silently OR-ed away; zero insecure defaults (`allow read, write: if true;` prohibited). |
| **5. Inter-System Communication** | Token leakage, forged auth sessions, unverified Firebase identity tokens, unmetered external map tile requests. | Google Sign-In via Firebase Auth (popup flow avoiding credential handling in app code); defensive payload serialization removing `undefined` properties; Google Maps Platform Code Assist usage attribution (`gmp_mcp_codeassist_v1_aistudio`). |

---

---

## 6. Functional walkthrough

Every process and interaction a user can trigger is mapped to a verification test case below:

### Test Case 1: Unauthenticated User Landing & Authentication Flow
- **Step 1.1**: Open the root URL (`/`).
- **Step 1.2**: Verify the landing page displays the hero, the "Continue with Google" button, and the **How it works** section with four numbered steps. Verify there is no demo or preview entry point, and no private journal content is reachable.
- **Step 1.3**: Click "Continue with Google". Complete the federated popup.
- **Step 1.4**: Confirm redirection to the authenticated dashboard displaying user profile avatar, display name, and active session status.

### Test Case 2: Multi-Turn Journal Entry Creation & Gemini Reflection
- **Step 2.1**: Select the default "Reflect" focus mode pill.
- **Step 2.2**: Type a personal reflection into the prompt input (e.g. *"Today I struggled to prioritize between two critical projects. How can I gain perspective?"*).
- **Step 2.3**: Press `Ctrl+Enter` or click the Send button.
- **Step 2.4**: Verify the input textarea displays a generating spinner while preserving text safety.
- **Step 2.5**: Confirm receipt of Gemini 3.6 Flash reflection with empathetic mirroring and follow-up introspection questions formatted in clean Markdown.
- **Step 2.6**: Send a follow-up turn (e.g. *"I will focus on the first project first"*). Verify conversation history is maintained across multiple turns.

### Test Case 3: Mode Switching (Brainstorm, Summarize, Dialogue)
- **Step 3.1**: Click the "Brainstorm" focus chip. Send a prompt (e.g. *"Brainstorm 3 ways to automate my daily review"*). Verify output provides categorized, creative ideas.
- **Step 3.2**: Click the "Summarize" focus chip. Send a prompt. Verify output yields an executive summary with bulleted action items.
- **Step 3.3**: Click the "Dialogue" focus chip. Verify conversational continuity.

### Test Case 4: Cloud Firestore Persistence & User Isolation
- **Step 4.1**: Check the top-right header for the "Saved" indicator with a green bookmark badge.
- **Step 4.2**: Verify the document is stored under `/users/{USER_ID}/reflections/{ENTRY_ID}` in Cloud Firestore.
- **Step 4.3**: Open an incognito session and sign in with a different Google account. Verify that the second user cannot view or access the first user's reflections.

### Test Case 5: AI Title Generation & Metadata Editing
- **Step 5.1**: Click the magic wand icon next to the title field.
- **Step 5.2**: Verify Gemini suggests a poetic 3-6 word title based on the entry's content.
- **Step 5.3**: Click a category pill (e.g., *Work*, *Ideas*, *Gratitude*, *Mindfulness*). Verify the change is instantly persisted to Firestore.

### Test Case 6: Journal History, Filtering, & Search
- **Step 6.1**: Click **Journal History** in the left sidebar (`#nav-tab-history`). On a narrow viewport, open the drawer first (`#nav-open-sidebar-btn`).
- **Step 6.2**: Verify all past sessions appear as cards with titles, turn counts, and preview snippets.
- **Step 6.3**: Type a keyword into the search input. Verify list filters in real time.
- **Step 6.4**: Click a category filter pill. Verify only reflections belonging to that category are shown.
- **Step 6.5**: Click the Pin icon on a card. Verify it sticks to the top with an amber border.
- **Step 6.6**: Click "Open" on a card. Verify the multi-turn session reloads into the active reflection editor.

### Test Case 7: Entry Deletion with Safeguard
- **Step 7.1**: In History View, click the trash can icon on an entry card.
- **Step 7.2**: Verify the confirmation overlay appears asking *"Permanently delete this reflection?"*.
- **Step 7.3**: Click *"Yes, Delete"*. Verify the card is removed from both the UI and Cloud Firestore.

### Test Case 8: Sign Out
- **Step 8.1**: Open **Profile** from the sidebar (`#nav-profile-btn`), stay on the **Account** section.
- **Step 8.2**: Click **Sign out** (`#profile-sign-out-btn`).
- **Step 8.3**: Confirm the session is terminated and the user is returned to the landing page with no journal content reachable.

### Test Case 9: Location-Aware Entries, Draggable Maps, & Landmark Autocomplete Search
- **Step 9.1**: In the active reflection editor, locate the top header card and click the `"Pin Location"` chip button.
- **Step 9.2**: Verify the `LocationPickerModal` opens with an interactive Google Map preview, coordinate indicators, place presets, and the prominent `"Search Place or Landmark"` input bar.
- **Step 9.3**: **Landmark Autocomplete Search**: Type a landmark name into the search bar (e.g., *"Eiffel Tower"*, *"Golden Gate Park"*, *"Kyoto"*, *"Central Park"*). Verify the live suggestions dropdown appears with categorized landmark entries and Google Places results.
- **Step 9.4**: **Select Place**: Click any suggestion in the dropdown. Verify that the place name and address auto-populate into the details fields, the map smoothly pans to the destination, and the pin marker relocates to the coordinates.
- **Step 9.5**: **Direct Coordinate Input**: Enter raw coordinates (e.g., `35.6762, 139.6503` or `37.7749, -122.4194`) into the search bar. Verify the `"Jump to Direct Coordinates"` option appears and navigates directly to the target location upon selection.
- **Step 9.6**: **Free Map Panning & Dragging**: Click and drag anywhere on the map surface. Verify the map pans fluidly in all directions with inertia and without snapping back to previous positions.
- **Step 9.7**: **Marker Dragging & Repositioning**: Click and drag the blue pin marker directly on the map. Verify the pin is draggable (`gmpDraggable`), and releasing the pin updates coordinates and the coordinate pill in real time.
- **Step 9.8**: **Click-to-Pin**: Click any point on the map. Verify the pin immediately jumps to the clicked point and updates coordinates.
- **Step 9.9**: **Geolocation with Consent**: Click `"Use My Current Location"`. Confirm the browser requests permission (`navigator.geolocation`). Upon granting, verify the pin and coordinates align to the user's physical position.
- **Step 9.10**: **Persistence & AI Context**: Click `"Pin to Reflection"`. Verify the modal closes, the active location badge appears in the reflection editor header, and the location is saved to Firestore. Subsequent AI reflection prompts transmitted to Gemini 3.6 Flash are grounded in the physical setting.
- **Step 9.11**: **History Filtering & Removal**: Navigate to `"Journal History"`. Verify entries with pinned locations display location badges. Search by location name. Open the reflection, click the location badge, and select `"Remove Pin"`. Verify the pin is removed and updated in Firestore.

### Test Case 10: Places Map (Photos-style pins)
- **Step 10.1**: Click **Places Map** in the sidebar (`#nav-tab-map`). Verify a full-bleed Google Map with floating search and category chips, and a draggable bottom sheet.
- **Step 10.2**: **Pins**: verify every reflection carrying a location renders as a photo-style pin. Where several entries share a place, verify the stacked "photo backs" and a count badge.
- **Step 10.3**: **Clustering**: zoom out and verify nearby pins merge into one group; zoom in past the split threshold and verify they separate again.
- **Step 10.4**: **Select**: click a pin. Verify the sheet expands to that place, the camera lifts the pin clear of the sheet, and the entries at that place are listed.
- **Step 10.5**: **Search and filter**: type into the search field and verify only matching places remain; click a category chip and verify pins and list both narrow.
- **Step 10.6**: **Fit all / locate me / map type**: use the right-hand rail to frame every pin, centre on your own position (granting permission), and toggle Map ↔ Satellite.
- **Step 10.7**: **Drop a pin**: click **Drop a pin**, click the map, and verify a new reflection is started at those coordinates.
- **Step 10.8**: **Empty state**: with an account that has no located entries, verify the sheet reads *"No reflection has a location yet."* and that no sample or demo places appear anywhere.
- **Step 10.9**: **Theme**: switch to dark. Verify the map itself renders in Google's dark colour scheme, not just the surrounding chrome.

### Test Case 11: Analytics
- **Step 11.1**: Click **Analytics** in the sidebar (`#nav-tab-analytics`).
- **Step 11.2**: On a fresh account, verify the empty state explains that entries are read shortly after saving.
- **Step 11.3**: Write an entry of at least a few sentences, wait ~45 seconds, and verify a reading appears — or click **Analyse N entries** to run the backfill immediately.
- **Step 11.4**: **Domain scatter**: verify each reflection appears as a dot on its domain lane, sized by depth and coloured by mood, with share bars on the right identifying the dominant domain.
- **Step 11.5**: **Mood**: verify the ribbon plots per-entry mood against a smoothed trend around a zero baseline, and the field plots mood against energy in four quadrants.
- **Step 11.6**: **Belief shifts / patterns**: verify shifts render as struck-through *from* → highlighted *to* with the source entry, and that a pattern appears in the recurrence grid only once it has occurred more than once.
- **Step 11.7**: **Range**: switch between 3 months / 12 months / All time and verify every panel re-scales.
- **Step 11.8**: **Monthly summary**: for a finished month, click its **Generate** chip. Verify a retrospective card is written with a headline, narrative, trend, patterns and a closing question, and that it persists across a reload.
- **Step 11.9**: **Deletion**: delete an analysed reflection and verify its dot leaves the charts.

### Test Case 12: Preferences (theme and accent)
- **Step 12.1**: Open **Profile → Preferences**.
- **Step 12.2**: Pick each of the five accents and verify buttons, links, active nav, chips and map highlights all follow, while success / warning / destructive colours stay fixed.
- **Step 12.3**: Toggle **Light / Dark** and verify the whole app inverts, including the map.
- **Step 12.4**: Verify the status line reads *"Saved to your account"*, then reload and confirm the choice survives with no flash of the default theme.
- **Step 12.5**: Sign in on a second device or browser profile and verify the same theme and accent arrive.

### Test Case 13: Integrations (webhooks)
- **Step 13.1**: Open **Profile → Integrations** and add a Discord or Slack destination.
- **Step 13.2**: Click **Send test** and verify the message arrives, and that the row records the outcome.
- **Step 13.3**: Enter a `http://localhost:...` URL on an **Other** destination. Verify the severe insecure-endpoint warning appears and the destination is still allowed unless `WEBHOOK_BLOCK_PRIVATE_TARGETS=true`.
- **Step 13.4**: Restrict a destination by event, category and reflection mode. Write an entry that does not match and verify nothing is delivered; write one that matches and verify it is.
- **Step 13.5**: Verify destination URLs are masked everywhere in the UI, and that a failed delivery never surfaces as a save error on the entry.
