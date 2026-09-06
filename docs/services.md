# Google services in this app

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

## How a request actually flows

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
