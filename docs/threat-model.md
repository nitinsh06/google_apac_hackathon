# Threat model

| Threat Zone | Identified Risks | Countermeasures & Implementation Strategy |
| :--- | :--- | :--- |
| **1. Input Surfaces** | Prompt injection in journal entries, oversized text payloads, malicious coordinates/geocoding injections, XSS via rendered AI responses, and hostile output from the analytics extraction model. | Strict character limit (`maxLength: 8000`), HTML/Markdown entity encoding via safe React Markdown rendering, coordinate bounds checking, and re-clamping of every extraction field (closed domain enum, bounded numbers, capped arrays) before it reaches Firestore or a chart axis. |
| **2. Planning & Reasoning** | Prompt injection attempting to leak system instructions or bypass reflection guidelines. | Server-side prompt encapsulation with strict system instructions; untrusted user inputs wrapped strictly as reflection context. |
| **3. Tool Execution & API** | Direct exposure of Gemini API key or unrestricted Maps keys; SSRF or unauthorized proxy endpoints. | Full-stack architecture (`server.ts`) proxying all Gemini calls; `GEMINI_API_KEY` accessed exclusively server-side; client Maps key scoped by HTTP referrer; zero hardcoded credentials. |
| **4. Memory & State** | Cross-user data leakage, unauthenticated document reads/writes, orphaned interactions, update gaps. | Owner-bound Firestore rules on every named path (`request.auth.uid == userId`); no `{allSubcollections=**}` wildcard, so per-document shape validation on `insights` and `monthlySummaries` is not silently OR-ed away; zero insecure defaults (`allow read, write: if true;` prohibited). |
| **5. Inter-System Communication** | Token leakage, forged auth sessions, unverified Firebase identity tokens, unmetered external map tile requests. | Google Sign-In via Firebase Auth (popup flow avoiding credential handling in app code); defensive payload serialization removing `undefined` properties; Google Maps Platform Code Assist usage attribution (`gmp_mcp_codeassist_v1_aistudio`). |

---
