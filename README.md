# Gemini Reflection Journal

A secure, user-authenticated personal reflection and brainstorming journal application powered by the Gemini 3.6 Flash API and Google Cloud Firestore.

---

## System Architecture & Threat Model

| Threat Zone | Identified Risks | Countermeasures & Implementation Strategy |
| :--- | :--- | :--- |
| **1. Input Surfaces** | Prompt injection in journal entries, oversized text payloads leading to excessive latency or memory bloat, XSS via rendered AI responses. | Strict character limit (`maxLength: 8000`), HTML/Markdown entity encoding and sanitization via safe React Markdown rendering. |
| **2. Planning & Reasoning** | Prompt injection attempting to leak system instructions or bypass reflection guidelines. | Server-side prompt encapsulation with strict system instructions; untrusted user inputs wrapped strictly as reflection context. |
| **3. Tool Execution & API** | Direct exposure of Gemini API key to client; SSRF or unauthorized proxy endpoints. | Full-stack architecture (`server.ts`) proxying all Gemini calls; `GEMINI_API_KEY` accessed exclusively server-side; API key never sent to the browser. |
| **4. Memory & State** | Cross-user data leakage, unauthenticated document reads/writes, orphaned interactions, update gaps. | Cloud Firestore security rules enforcing owner-isolated paths (`request.auth.uid == userId`); `allow read, write: if request.auth != null && request.auth.uid == userId;` with strict schema validation; zero insecure defaults (`allow read, write: if true;` prohibited). |
| **5. Inter-System Communication** | Token leakage, forged auth sessions, unverified Firebase identity tokens. | Google Sign-In via Firebase Auth (popup flow avoiding credential handling in app code); defensive payload serialization removing `undefined` properties. |

---

## 1. Environment & Prerequisites

1. **Google Cloud SDK**: Install and initialize the [gcloud CLI](https://cloud.google.com/sdk/docs/install):
   ```bash
   gcloud init
   gcloud auth application-default login
   ```
2. **Enable Required Cloud APIs**:
   ```bash
   gcloud services enable \
     run.googleapis.com \
     secretmanager.googleapis.com \
     firestore.googleapis.com \
     identitytoolkit.googleapis.com
   ```
3. **Node.js & Dependencies**:
   - Node.js 20+ installed
   - Run `npm install` to install project dependencies.

---

## 2. Secret Management & Zero-Hardcoding Setup

Store your `GEMINI_API_KEY` in Google Cloud Secret Manager:

```bash
# Create and populate the secret
gcloud secrets create GEMINI_API_KEY --replication-policy="automatic"
echo -n "YOUR_API_KEY" | gcloud secrets versions add GEMINI_API_KEY --data-file=-

# Grant the default Cloud Run service account access to read the secret
gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --member="serviceAccount:YOUR_PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

---

## 3. Database Security Configuration (Cloud Firestore)

Deploy secure, owner-bound security rules to ensure user data isolation:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Prohibit unauthorized reads and writes by default
    match /{document=**} {
      allow read, write: if false;
    }

    // Owner-isolated document path: only the authenticated user can access their records
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;

      match /{allSubcollections=**} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }

    match /users/{userId}/interactions/{interactionId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    match /users/{userId}/reflections/{reflectionId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

Deploy rules using the Firebase CLI:
```bash
firebase deploy --only firestore:rules
```

---

## 4. Google Cloud Run Deployment Flow

Build and deploy the containerized application to Google Cloud Run:

```bash
# Build and deploy the full-stack service to Cloud Run
gcloud run deploy gemini-reflection-journal \
  --source . \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest \
  --set-env-vars NODE_ENV=production
```

### Required Campaign Labeling
To register the service for automated challenge verification:
```bash
gcloud run services update gemini-reflection-journal \
  --update-labels=dev-tutorial=cloud-run-ai-challenge \
  --region=us-central1
```

---

## 5. End-to-End Functional Walkthrough & Verification Steps

Every process and interaction a user can trigger is mapped to a verification test case below:

### Test Case 1: Unauthenticated User Landing & Authentication Flow
- **Step 1.1**: Open the root URL (`/`).
- **Step 1.2**: Verify the landing page displays the greeting title, architecture badges, and "Continue with Google" button. Verify no private journal content is accessible.
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
- **Step 6.1**: Click "Journal History" in the top navigation.
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
- **Step 8.1**: Click the Sign Out icon in the top right.
- **Step 8.2**: Confirm the session is terminated and the user is redirected back to the secure landing page.
