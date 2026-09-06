# ReflectAI

A private, user-authenticated journal. You write; Gemini reflects back; entries can be pinned to a
map; and a cheap second model pass turns what you wrote into charts and monthly retrospectives.
Everything is stored per-user in Cloud Firestore behind owner-bound rules.

<div class="grid cards" markdown>

-   :material-rocket-launch: **[Setup from scratch](setup.md)**

    From an empty machine and an empty Google account to a running app, in about fifteen minutes.

-   :material-google: **[Google services](services.md)**

    Seven Google products do real work here. What each one does, where it is wired, what it costs
    you in credentials.

-   :material-database-lock: **[Data model and rules](data-model.md)**

    Every collection, who writes it, and why the security rules are shaped the way they are.

-   :material-shield-alert: **[Threat model](threat-model.md)**

    The risks that shaped the architecture, and what actually mitigates each one.

</div>

## The two invariants

Everything else in this codebase is negotiable. These are not.

!!! danger "The browser never names an outbound destination"

    For webhooks the browser names an *event*; the server reads where to send it from the caller's
    own settings document. A server that accepts a destination from the request body is an open
    proxy, and an open proxy on someone else's credentials is a liability, not a feature.

!!! danger "No service account exists"

    The server authenticates *as the caller* for the one Firestore read it makes, over the REST API
    with the caller's own ID token. Security rules still apply to it. A server compromise therefore
    cannot read another user's data — there is no elevated credential to steal.

## How a request flows

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

## Where things live

| Area | Path |
| :--- | :--- |
| React app | `src/App.tsx`, `src/components/` |
| Client data access | `src/lib/` — one module per concern, all Firestore reads and writes |
| Express server and API routes | `server.ts` |
| Server-only logic | `src/server/` — token verification, Gemini prompts, REST reads |
| Security rules | `firestore.rules` — the live access-control policy |
