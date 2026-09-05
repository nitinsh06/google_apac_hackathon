# Gemini Reflection Journal

A secure, user-authenticated personal reflection and brainstorming journal application powered by the Gemini 3.6 Flash API and Google Cloud Firestore.

---

## System Architecture & Threat Model

| Threat Zone | Identified Risks | Countermeasures & Implementation Strategy |
| :--- | :--- | :--- |
| **1. Input Surfaces** | Prompt injection in journal entries, oversized text payloads, malicious coordinates/geocoding injections, XSS via rendered AI responses. | Strict character limit (`maxLength: 8000`), HTML/Markdown entity encoding and sanitization via safe React Markdown rendering, coordinate range bounds checking. |
| **2. Planning & Reasoning** | Prompt injection attempting to leak system instructions or bypass reflection guidelines. | Server-side prompt encapsulation with strict system instructions; untrusted user inputs wrapped strictly as reflection context. |
| **3. Tool Execution & API** | Direct exposure of Gemini API key or unrestricted Maps keys; SSRF or unauthorized proxy endpoints. | Full-stack architecture (`server.ts`) proxying all Gemini calls; `GEMINI_API_KEY` accessed exclusively server-side; client Maps key scoped by HTTP referrer; zero hardcoded credentials. |
| **4. Memory & State** | Cross-user data leakage, unauthenticated document reads/writes, orphaned interactions, update gaps. | Cloud Firestore security rules enforcing owner-isolated paths (`request.auth.uid == userId`); `allow read, write: if request.auth != null && request.auth.uid == userId;` with strict schema validation; zero insecure defaults (`allow read, write: if true;` prohibited). |
| **5. Inter-System Communication** | Token leakage, forged auth sessions, unverified Firebase identity tokens, unmetered external map tile requests. | Google Sign-In via Firebase Auth (popup flow avoiding credential handling in app code); defensive payload serialization removing `undefined` properties; Google Maps Platform Code Assist usage attribution (`gmp_mcp_codeassist_v1_aistudio`). |

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

### Google Maps Platform API Key Setup

1. **Prototyping (Zero-Cost Maps Demo Key)**:
   - For immediate local development without a credit card, obtain a free Maps Demo Key:
   - [Maps Demo Key Onboarding](https://mapsplatform.google.com/maps-demo-key?utm_campaign=gmp_mcp_codeassist_v1_aistudio)
   - Add to your local `.env`:
     ```bash
     VITE_GOOGLE_MAPS_API_KEY="YOUR_DEMO_KEY"
     ```

2. **Production Setup & Security Restrictions**:
   - Create an API key in the [Google Cloud Console Credentials Page](https://console.cloud.google.com/google/maps-apis/credentials?utm_campaign=gmp_mcp_codeassist_v1_aistudio).
   - **Application Restriction**: Apply **HTTP Referrers** restriction (e.g. `https://your-domain.run.app/*`).
   - **API Restriction**: Restrict the key exclusively to:
     - *Maps JavaScript API*
     - *Places API (New)*
     - *Geocoding API*
   - Detailed guide: [Restricting an API Key](https://docs.cloud.google.com/api-keys/docs/add-restrictions-api-keys?utm_campaign=gmp_mcp_codeassist_v1_aistudio).
   - Terms of Service: [Google Maps Platform Terms](https://cloud.google.com/maps-platform/terms?utm_campaign=gmp_mcp_codeassist_v1_aistudio).

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

### Test Case 10: Places Map View (Google Photos-Style Memories on Map)
- **Step 10.1**: In the top navigation bar, click the `"Places Map"` tab (`#nav-tab-map`). On mobile, tap the `"Map"` tab in the bottom bar (`#mobile-nav-tab-map`).
- **Step 10.2**: **Navigation Verification**: Verify the active view switches to the Places Map dashboard showing the split view: a Left/Top Memories Sidebar and a Right/Main Interactive Google Map.
- **Step 10.3**: **Location Pins on Map**: Verify all journal reflections with saved locations are rendered as pins on the map (`AdvancedMarker`). If multiple entries were written at the same place, verify a badge with the count (e.g., "2") appears over the pin.
- **Step 10.4**: **Interactive Marker Click**: Click any pin on the map. Verify an `InfoWindow` pops up showing the place name, formatted address, reflection count, and clickable reflection items.
- **Step 10.5**: **Location Focus from Sidebar**: In the left sidebar list of locations, click any location card (`#location-card-*`). Verify the map smoothly centers and zooms into that location (`map.panTo`), while opening the corresponding entries in the sidebar.
- **Step 10.6**: **Search & Category Filtering**: Type a keyword (e.g., place name, title, or turn snippet) in the search bar (`#places-search-input`). Verify only matching location clusters appear. Click a category filter pill (e.g., *Mindfulness*, *Work*). Verify markers and list update accordingly.
- **Step 10.7**: **Fit All & Locate Me**: Click the `"Fit All"` button (`#map-fit-all-btn`). Verify the map bounding box expands to enclose all your pinned memories. Click `"Center on My Location"` (`#map-locate-me-btn`) to center on user coordinates with permission.
- **Step 10.8**: **Untagged Memories Tab**: Click the `"Untagged"` sub-tab in the sidebar (`#tab-untagged-reflections`). Verify reflections that lack coordinates are displayed with a `"Pin Location"` action that jumps directly to the reflection editor to tag them.
- **Step 10.9**: **Direct Navigation to Reflection**: In any location card or on the bottom floating preview pill, click `"Open in Editor"`. Verify the application loads that exact reflection session in the Reflection Editor.
- **Step 10.10**: **Write New Reflection at Location**: Under any location card, click `"+ Write another reflection here"`. Verify a fresh reflection draft is initialized with that place's coordinates and landmark name pre-populated.

