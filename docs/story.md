# ReflectAI — A Journal That Reads You Back

*Building a private, location-aware reflection journal on Gemini, Firebase and Google Maps Platform.*

---

<!-- SCREENSHOT: Hero shot of the landing page. Full-width, light theme.
     Suggested file: docs/screenshots/01-landing.png -->

---

## Table of contents

1. [Why we built it](#1-why-we-built-it)
2. [What ReflectAI is](#2-what-reflectai-is)
3. [How it works](#3-how-it-works)
4. [The features, one by one](#4-the-features-one-by-one)
5. [Google services we used](#5-google-services-we-used)
6. [The tech stack](#6-the-tech-stack)
7. [Security and privacy by construction](#7-security-and-privacy-by-construction)
8. [Deploying it](#8-deploying-it)
9. [What was hard](#9-what-was-hard)
10. [What's next](#10-whats-next)

---

## 1. Why we built it

Most journaling apps are a text box with a date on it. You write, you close the tab, and the
writing goes into a drawer you never open again. The value of journaling is supposed to come from
*re-reading* — noticing that you have written about the same argument four times, that your mood
dips every February, that you changed your mind about something important six weeks ago and never
registered it.

Nobody does that re-reading. It is tedious, and the raw material is a wall of prose.

So we asked a narrower question: **what if the journal did the re-reading for you?**

Not "summarise my diary." Something more specific — a system that responds thoughtfully while you
write, quietly reads each finished entry against a fixed vocabulary of life domains, and turns
months of unstructured writing into something you can actually look at. A chart of what you talk
about. A trace of your mood over time. A list of the beliefs you have visibly revised.

And because *where* you write turns out to matter — a reflection written in a hospital waiting room
is not the same reflection written on a beach — we pinned entries to a map.

That is ReflectAI.

---

## 2. What ReflectAI is

A private, single-user-per-account journal with four surfaces:

| Surface | What it does |
| :--- | :--- |
| **Current Reflection** | A multi-turn conversation with Gemini in one of four focus modes. |
| **Journal History** | Every past session, searchable, filterable by category, pinnable. |
| **Places Map** | A Google Map of everywhere you have written from, with photo-style stacked pins. |
| **Analytics** | Charts derived from a second, cheaper model pass over what you wrote. |

Plus a fifth thing that is more of a flourish than a feature: a **Journal Card** — a collectible-card
style object that levels up as you write, and which you can publish to a public link if you want to.

Everything is stored per-user in Cloud Firestore behind owner-bound security rules. There is no
shared collection, no admin path, and — deliberately — **no service account anywhere in the
backend**. More on why that matters in §7.

<!-- SCREENSHOT: 2x2 grid or carousel of the four main views.
     Suggested file: docs/screenshots/02-four-views.png -->

---

## 3. How it works

### The shape of the system

One Express service on Cloud Run serves both the built React SPA and the API. There is no second
deploy unit, no Cloud Functions, no separate worker container.

```
Browser ──► Firebase Auth (Google popup) ──► ID token held in the SDK
   │
   ├─► Cloud Firestore  (direct, client SDK, owner-bound rules)
   │
   └─► Express server (server.ts, on Cloud Run)
          ├─ /api/gemini/*      ──► Gemini API           (GEMINI_API_KEY, server-side only)
          ├─ /api/analytics/*   ──► Gemini API (lite)    ID token verified first
          ├─ /api/tasks/*       ◄── Eventarc             OIDC-signed, principal-pinned
          └─ /api/webhooks/*    ──► Discord / Slack / Email
```

The client talks to Firestore **directly** for all reads and writes. The server is only in the path
when something needs a secret the browser must never hold — which, in practice, means the Gemini
API key and the outbound webhook calls.

### The two model passes

ReflectAI calls Gemini twice, for two completely different jobs, on two different model ladders.

**Pass one — the reflection.** When you send a turn, `POST /api/gemini/reflect` runs on the
`gemini-3.6-flash` ladder with a system instruction shaped by your chosen focus mode. It answers in
Markdown, it has the whole session's turn history, and if you have pinned a location it is told
where you are writing from. This is the conversational half, and it is tuned for warmth over speed.

**Pass two — the extraction.** Roughly 45 seconds after you stop writing (or immediately, from the
background worker in production), a second call runs on the `gemini-3.1-flash-lite` ladder with a
**JSON response schema attached**. It does not chat. It reads the finished entry and returns
structured data:

```jsonc
{
  "domains":     [{ "id": "career", "weight": 0.6 }, { "id": "inner-life", "weight": 0.4 }],
  "valence":     -0.3,          // −1 … 1
  "energy":      0.7,           //  0 … 1
  "sentiment":   "unsettled",
  "emotions":    ["frustration", "resolve"],
  "beliefShifts": [{ "from": "I need to do both", "to": "one of these can wait" }],
  "patterns":    ["over-committing before a deadline"],
  "depth":       0.8,
  "summary":     "..."
}
```

Both ladders fall back model-by-model, so a single model being unavailable degrades quality rather
than breaking the feature.

### Why the vocabulary is closed

The ten life domains — career, relationships, family, health, inner life, creativity, learning,
money, purpose, habits — are a **fixed enum declared in `src/lib/analyticsTypes.ts`** and shared by
the browser, the server and the Firestore security rules.

This was the single most important design decision in the analytics half of the app. An open set of
domains would give the scatter plot a new lane every week, and "what do I talk about most?" would
become unanswerable, because the labels would drift under you. Closed vocabulary, bounded numbers,
capped arrays — and every field re-clamped server-side before it is written, so a model that drifts
cannot widen the shape of what gets stored.

<!-- SCREENSHOT: Architecture diagram — hand-drawn or excalidraw, showing the flow above.
     Suggested file: docs/screenshots/03-architecture.png -->

### The background worker

Triggering extraction from the browser has an obvious hole: close the tab too soon and the entry is
never analysed until someone opens Analytics and runs a backfill.

In production we move the trigger server-side using **Eventarc**, without adding a deploy unit.
Eventarc watches the Firestore collection `users/{uid}/reflections/{entryId}` and calls
`POST /api/tasks/reflection-written` on the *same* Cloud Run service. Per delivery, the worker:

1. Verifies the Eventarc OIDC token — signature, audience, and that the caller is exactly the
   dedicated worker service account.
2. Reads the document path from the `ce-subject` header and re-reads the authoritative document.
3. **Skips if the stored reading is already newer than the entry.** Firestore fires on every
   persisted turn; only meaningful change should cost a model call.
4. Extracts on the cheap ladder and writes `users/{uid}/insights/{entryId}`.
5. Closes out any finished month that has readings but no summary — event-driven, so no scheduler.

Failures return 5xx so Eventarc retries with backoff. Malformed subjects return 204, because
retrying an event that will never parse only burns the retry budget.

---

## 4. The features, one by one

### 4.1 Multi-turn reflection with four focus modes

The editor is a conversation, not a form. Four modes change the system instruction:

| Mode | What Gemini does |
| :--- | :--- |
| **Reflect** | Empathetic mirroring, introspective reframing, follow-up questions |
| **Brainstorm** | Creative exploration, diverse angles, practical next steps |
| **Summarize** | Executive summary, key insights, structured action bullets |
| **Dialogue** | Open conversational continuity across the session |

Turn history is preserved across the session, entries autosave to Firestore with a visible "Saved"
indicator, and there is an AI title suggestion behind a magic-wand icon that proposes a poetic
three-to-six-word title from the entry's content.

<!-- SCREENSHOT: The reflection editor mid-conversation, showing mode pills, a Gemini response
     rendered in Markdown, and the Saved badge.
     Suggested file: docs/screenshots/04-editor.png -->

<!-- SCREENSHOT: Close-up of the four focus mode pills with one active.
     Suggested file: docs/screenshots/05-modes.png -->

---

### 4.2 Journal history — search, filter, pin

Every past session as a card: title, turn count, preview snippet, category, and a location badge if
the entry is pinned. Real-time keyword search, category filter pills, pin-to-top with an amber
border, and deletion behind a confirmation overlay.

<!-- SCREENSHOT: History view with several entry cards, the search field in use, and a pinned
     entry visibly stuck to the top.
     Suggested file: docs/screenshots/06-history.png -->

---

### 4.3 Location-aware entries

Any reflection can be pinned to a place. The picker modal is a full Google Maps surface with:

- **Landmark autocomplete** via the Places API (New) — type "Eiffel Tower", get live suggestions.
- **Direct coordinate entry** — paste `35.6762, 139.6503` and jump straight there.
- **A draggable Advanced Marker** — drag the pin, or click anywhere on the map to move it.
- **Reverse geocoding** — drop a pin and the Geocoding API names it for you.
- **Browser geolocation** — "Use my current location", behind an explicit permission prompt.

Once pinned, the location is saved to the entry *and* passed to Gemini, so subsequent reflections
are grounded in the physical setting you are writing from.

<!-- SCREENSHOT: The location picker modal open, with the autocomplete dropdown showing landmark
     suggestions and the pin visible on the map.
     Suggested file: docs/screenshots/07-location-picker.png -->

---

### 4.4 The Places Map

A full-bleed map of everywhere you have ever written from. Entries render as photo-style pins;
where several entries share a place, they stack as "photo backs" with a count badge. Nearby pins
cluster as you zoom out and split as you zoom in.

Selecting a pin expands a draggable bottom sheet listing the entries at that place — and the camera
lifts the pin clear of the sheet so it stays visible. There is search, category filtering, fit-all,
locate-me, a Map/Satellite toggle, and a **Drop a pin** mode that starts a brand-new reflection at
whatever coordinates you click.

The map itself follows the app theme via Google's `colorScheme` — dark mode darkens the *map*, not
just the chrome around it.

<!-- SCREENSHOT: Places Map in light theme, zoomed to show clustered photo-style pins and the
     bottom sheet partially expanded.
     Suggested file: docs/screenshots/08-places-map.png -->

<!-- SCREENSHOT: Same view in dark theme, to show the map's own colorScheme switching.
     Suggested file: docs/screenshots/09-places-map-dark.png -->

---

### 4.5 Analytics

This is where the second model pass pays off. Four panels, all drawn from structured readings:

**Domain constellation.** Every reflection is a dot on its domain lane — sized by depth, coloured
by mood. Share bars on the right identify the dominant domain. This is the "what do I actually
think about" view.

**Mood.** A ribbon plotting per-entry mood against a smoothed trend around a zero baseline, plus a
valence-versus-energy field split into four quadrants.

**Belief shifts.** Rendered as struck-through *from* → highlighted *to*, with the source entry
attached. These are the moments the model detected you changing your mind — arguably the most
valuable thing the app surfaces, and the one you would never find by scrolling.

**Recurring patterns.** A recurrence grid. A pattern only appears once it has happened more than
once, which keeps the panel from filling with noise.

Everything re-scales across a 3-month / 12-month / all-time range switch. And for any finished
month, a **Generate** chip writes a retrospective card — headline, narrative, trend, patterns, and
a closing question — which persists in Firestore.

<!-- SCREENSHOT: The full Analytics view, scrolled to show the domain constellation and the
     share bars.
     Suggested file: docs/screenshots/10-analytics-domains.png -->

<!-- SCREENSHOT: The mood ribbon and the valence/energy quadrant field.
     Suggested file: docs/screenshots/11-analytics-mood.png -->

<!-- SCREENSHOT: Belief shifts panel showing struck-through "from" and highlighted "to".
     Suggested file: docs/screenshots/12-belief-shifts.png -->

<!-- SCREENSHOT: A generated monthly retrospective card.
     Suggested file: docs/screenshots/13-monthly-summary.png -->

---

### 4.6 The Journal Card

A small, earned object. Your card has a **level**, a **rarity** (common → legendary), a **score**,
and a **two-word title** assembled from two independent axes: how far you range, and what you keep
returning to.

Scoring is weighted so the rarer signals count for more:

| Signal | Points each |
| :--- | ---: |
| Reflections written | 10 |
| Distinct places pinned | 25 |
| Distinct domains touched | 15 |
| Months active | 20 |
| Belief shifts detected | 30 |

Writing often is the baseline. Writing from many places, across many months, and *actually changing
your mind* are what move the number.

The title comes from a movement word (Rooted → Settled → Roaming → Wanderer → Voyager, by places
pinned) plus a domain noun (Builder, Confidant, Keeper, Tender, Thinker, Maker, Scholar, Steward,
Seeker, Shaper). So you might end up a **Wanderer Thinker** — someone who writes from many places,
mostly about their inner life — with a one-line explanation underneath so the title never feels
arbitrary.

Level thresholds widen as you climb (`0, 60, 150, 300, 550, 900, 1400, 2100, 3000, 4200`), so an
early level arrives quickly and a late one means something. Rarity drives the card's foil sweep,
saturation, shadow weight and resting shimmer.

You can **publish** the card to a public link at `/c/:slug`, optionally anonymously, and rotate or
revoke the link at any time.

<!-- SCREENSHOT: The card panel, showing the card itself plus the score breakdown lines.
     Suggested file: docs/screenshots/14-journal-card.png -->

<!-- SCREENSHOT: A few cards at different rarities side by side, to show the foil progression.
     Suggested file: docs/screenshots/15-card-rarities.png -->

<!-- SCREENSHOT: The public card page at /c/:slug as an anonymous visitor sees it.
     Suggested file: docs/screenshots/16-public-card.png -->

> **What a published card contains:** counts and distributions only. No titles, no excerpts, no
> place names, no coordinates. A domain distribution is abstract; "Luxembourg Gardens" is not. The
> field allowlist in the security rules *is* the privacy guarantee — see §7.

---

### 4.7 Integrations

Optional outbound notifications to **Discord**, **Slack**, a generic webhook, or **email** (via
Resend — the one non-Google service in the stack). Four events fire: `reflection.created`,
`reflection.updated`, `reflection.located`, `reflection.deleted`.

Each destination can be restricted by event, by category, and by reflection mode. URLs are masked
everywhere in the UI, and a failed delivery never surfaces as a save error on the entry.

<!-- SCREENSHOT: The integrations panel with a Discord destination configured and its filters
     visible.
     Suggested file: docs/screenshots/17-integrations.png -->

---

### 4.8 Theme and accent

Light and dark, plus five accents (blue, violet, emerald, amber, rose). Preferences sync to
Firestore, so they follow you across devices, and a small inline script in `index.html` paints the
stored theme *before first render* so a dark session never flashes white.

Success, warning and destructive colours stay fixed regardless of accent — a red delete button
should be red no matter what.

<!-- SCREENSHOT: The preferences panel with the five accent swatches and the light/dark toggle.
     Suggested file: docs/screenshots/18-preferences.png -->

---

## 5. Google services we used

Seven Google products do real work in this app — not badge-collecting, actual load-bearing work.

| Google service | What it does here | Where |
| :--- | :--- | :--- |
| **Gemini API** (`@google/genai`) | Two jobs on two ladders: the reflection dialogue (`gemini-3.6-flash`) and the JSON-schema-constrained analytics extraction (`gemini-3.1-flash-lite`) | `server.ts`, `src/server/analyticsExtract.ts` |
| **Firebase Authentication** | Google federated sign-in. The app never sees a password. Every data route verifies the caller's Firebase ID token | `src/lib/firebaseApp.ts`, `src/server/firebaseAuth.ts` |
| **Cloud Firestore** | All persistence — reflections, preferences, insights, monthly summaries, published cards | `src/lib/*`, `firestore.rules` |
| **Maps JavaScript API** | The Places Map canvas, Advanced Markers, clustering, theme-following `colorScheme` | `src/components/PlacesMap.tsx` |
| **Places API (New)** | Landmark search when pinning — `AutocompleteSuggestion.fetchAutocompleteSuggestions()` and `place.fetchFields()`. Legacy `Autocomplete`/`PlacesService` deliberately unused | `src/components/LocationPickerModal.tsx` |
| **Geocoding API** | Forward lookup for typed coordinates, reverse lookup to name a dropped pin | `src/components/LocationPickerModal.tsx` |
| **Cloud Run** | Hosts the single Express service serving both the SPA and the API | `server.ts` |
| **Eventarc** | Watches Firestore writes and drives the server-side analytics worker | `/api/tasks/reflection-written` |
| **Secret Manager** | Holds `GEMINI_API_KEY` in production, injected into Cloud Run at deploy | `--set-secrets` |

<!-- SCREENSHOT: Google Cloud console showing the enabled APIs list, or the Cloud Run service
     detail page. Optional but nice for credibility.
     Suggested file: docs/screenshots/19-gcp-console.png -->

---

## 6. The tech stack

**Frontend**

- React 19 + TypeScript
- Vite 6
- Tailwind CSS 4 (via `@tailwindcss/vite`)
- `@vis.gl/react-google-maps` for the Maps integration
- `motion` for animation, `lucide-react` for icons, `react-markdown` for rendering Gemini's output
- Leaflet, as a lightweight fallback picker map

**Backend**

- Express 4 on Node 20, written in TypeScript, bundled with esbuild
- `@google/genai` SDK
- **No Firebase Admin SDK.** ID tokens are verified by checking the RS256 signature against
  Google's public x509 certificates directly (`src/server/firebaseAuth.ts`)

**Infra**

- Cloud Run (deployed from source)
- Eventarc → Cloud Run for the analytics worker
- Secret Manager for the Gemini key
- Firestore security rules as the single source of authorization truth

---

## 7. Security and privacy by construction

This is a journal. People write things in it that they would not say out loud. We treated the
security model as a product feature rather than a checklist, and two invariants shaped the whole
backend.

### Invariant 1: no service account exists

The server has no elevated Firestore credential. For the one document it needs to read on a user's
behalf, it uses the **Firestore REST API with the caller's own ID token** (`src/server/firestoreRest.ts`).
Security rules therefore still apply to the server's own reads.

The consequence: a full server compromise cannot read another user's data. There is no key sitting
there that grants it.

### Invariant 2: the browser never names an outbound destination

For webhooks, the client names an **event** — `reflection.created`, say. The server then reads
*where to send it* from the caller's own Firestore settings document. If the client could name a
URL, this would be an open proxy for anyone with the app's address.

### The rules themselves

Every document lives under `users/{uid}`. There is no shared collection and no admin path.

| Path | Holds |
| :--- | :--- |
| `users/{uid}/reflections/{entryId}` | Journal entry: title, category, turns, optional location |
| `users/{uid}/preferences/appearance` | Theme and accent |
| `users/{uid}/preferences/integrations` | Webhook destinations and filters |
| `users/{uid}/preferences/card` | Which share link, if any, is published |
| `users/{uid}/insights/{entryId}` | Domains, mood, belief shifts, patterns |
| `users/{uid}/monthlySummaries/{YYYY-MM}` | The written retrospective for a closed month |
| **`publicCards/{slug}`** | **The one world-readable collection** |

Three deliberate choices in the rule shape:

**No `{allSubcollections=**}` wildcard.** Firestore ORs matching rules together, so a broad
`allow write` sitting beside a validated one means the validation never runs. Every path is named
explicitly. Adding a subcollection means adding a rule, or it is denied.

**Analytics documents are shape-checked, not just owner-checked.** They are written straight from
the browser, so the rule pins the field set, the enum values and the array lengths rather than
trusting the client:

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

**`publicCards` field allowlist is the privacy guarantee.** It is what stops a modified client ever
placing an entry title, an excerpt, a place name or a coordinate into a world-readable document.
Both copies of `ownerId` are pinned on update, so one user cannot overwrite another's slug and an
owner cannot reassign their own card. Adding a field to that allowlist is a decision that it is
safe to publish.

### Threat model summary

| Zone | Risk | Countermeasure |
| :--- | :--- | :--- |
| **Input surfaces** | Prompt injection in entries, oversized payloads, XSS via rendered AI output, hostile extraction output | 8000-char limit, safe React Markdown rendering, coordinate bounds checks, every extraction field re-clamped before storage |
| **Planning & reasoning** | Injection attempting to leak system instructions | Server-side prompt encapsulation; user input wrapped strictly as reflection context |
| **Tool execution & API** | Gemini key exposure, SSRF, open proxy | All Gemini calls proxied server-side; key never `VITE_`-prefixed; Maps key referrer-restricted; destinations read from the caller's own settings |
| **Memory & state** | Cross-user leakage, unauthenticated writes | Owner-bound rules on every named path; no wildcard; per-document shape validation; no `allow read, write: if true` anywhere |
| **Inter-system comms** | Forged sessions, unverified tokens | Firebase Auth popup flow; RS256 verification against Google's x509 certs; Eventarc deliveries pinned to a single service-account principal and audience |

---

## 8. Deploying it

The whole thing is one Cloud Run service.

```bash
# 1. Store the Gemini key in Secret Manager
gcloud secrets create GEMINI_API_KEY --replication-policy="automatic"
echo -n "YOUR_API_KEY" | gcloud secrets versions add GEMINI_API_KEY --data-file=-

# 2. Deploy from source
gcloud run deploy reflectai \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest \
  --set-env-vars NODE_ENV=production,VITE_GOOGLE_MAPS_API_KEY=...,VITE_GOOGLE_MAPS_MAP_ID=...
```

Two things that will bite you if you skip them:

- **`NODE_ENV=production` is load-bearing.** `startServer()` branches on it and `npm start` does not
  set it. Without the flag, Cloud Run boots the *Vite dev server* in production.
- After the first deploy, add the Cloud Run hostname to **Firebase Auth → Authorized domains** and
  to the Maps key's HTTP-referrer restriction, or both sign-in and the map will fail on the live URL.

Full setup — project creation, API enablement, Firestore rules deployment, the Eventarc trigger —
is in the [Setup guide](setup.md).

---

## 9. What was hard

**Firestore ORs its rules.** This is the single most dangerous thing about Firestore security
rules, and it is easy to miss. We started with a convenient `{allSubcollections=**}` wildcard for
owner-bound access, then added carefully validated per-document rules for analytics — and the
validation silently never ran, because the broad rule already granted the write. Removing the
wildcard means every new subcollection needs an explicit rule or it fails closed, which is exactly
the failure direction you want.

**Named databases.** This project uses a *named* Firestore database rather than `(default)`.
`firebase deploy --only firestore:rules` without pinning the database id writes the rules to
`(default)`, where nothing reads them, and every write in the app then fails with *Missing or
insufficient permissions* — with no indication that the rules landed somewhere else entirely. That
one cost us an evening. `firebase.json` now pins both.

**Firestore fires on every persisted turn.** The Eventarc trigger initially re-ran extraction on
every keystroke-batch save, which is a model call per autosave. The fix is a freshness check: skip
if the stored reading is already newer than the entry. Obvious in hindsight, invisible until the
bill.

**Advanced Markers need a Map ID.** They simply do not render without one, and the failure is
silent. `DEMO_MAP_ID` works locally; production needs a real vector Map ID from Maps Studio.

**Constraining the extraction model.** The first version let the model name domains freely. It
produced beautiful, useless data — "work stress", "career anxiety" and "job worry" as three separate
lanes on a chart. Closing the vocabulary to ten domains and attaching a JSON response schema turned
the analytics from a novelty into something you can actually read a trend off.

---

## 10. What's next

Known gaps we have not closed yet, stated plainly:

- `/api/gemini/reflect` and `/api/gemini/suggest-title` are still **unauthenticated** — anyone with
  the URL can spend the Gemini quota. (`/api/analytics/*` and `/api/webhooks/*` *are* authenticated.)
- `vite build` and the server bundle share `dist/`, which `express.static` serves — so `GET /server.cjs`
  returns the server source. Needs separate output directories.
- Upstream error text is returned verbatim to the client, leaking provider detail on failure.
- No CSP, `X-Frame-Options`, HSTS or `Referrer-Policy` headers.

Beyond hardening, the things we most want to build:

- **Entry-level search over insights**, not just text — "show me everything where my mood dropped
  below −0.5 and the domain was family."
- **Year-in-review**, the monthly retrospective scaled up.
- **Export** — your journal is yours; you should be able to leave with it.

---

## Try it

<!-- SCREENSHOT: A short demo GIF or video thumbnail covering: sign in → write an entry →
     pin a location → see it appear on the map → open Analytics.
     Suggested file: docs/screenshots/20-demo.gif -->

**Live:** `https://<your-cloud-run-service>.run.app`
**Source:** `https://github.com/<your-org>/<your-repo>`

---

*Built with Gemini, Firebase, Google Maps Platform and Cloud Run.*
