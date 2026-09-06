# Functional walkthrough

Every process and interaction a user can trigger is mapped to a verification test case below:

## Test Case 1: Unauthenticated User Landing & Authentication Flow
- **Step 1.1**: Open the root URL (`/`).
- **Step 1.2**: Verify the landing page displays the hero, the "Continue with Google" button, and the **How it works** section with four numbered steps. Verify there is no demo or preview entry point, and no private journal content is reachable.
- **Step 1.3**: Click "Continue with Google". Complete the federated popup.
- **Step 1.4**: Confirm redirection to the authenticated dashboard displaying user profile avatar, display name, and active session status.

## Test Case 2: Multi-Turn Journal Entry Creation & Gemini Reflection
- **Step 2.1**: Select the default "Reflect" focus mode pill.
- **Step 2.2**: Type a personal reflection into the prompt input (e.g. *"Today I struggled to prioritize between two critical projects. How can I gain perspective?"*).
- **Step 2.3**: Press `Ctrl+Enter` or click the Send button.
- **Step 2.4**: Verify the input textarea displays a generating spinner while preserving text safety.
- **Step 2.5**: Confirm receipt of Gemini 3.6 Flash reflection with empathetic mirroring and follow-up introspection questions formatted in clean Markdown.
- **Step 2.6**: Send a follow-up turn (e.g. *"I will focus on the first project first"*). Verify conversation history is maintained across multiple turns.

## Test Case 3: Mode Switching (Brainstorm, Summarize, Dialogue)
- **Step 3.1**: Click the "Brainstorm" focus chip. Send a prompt (e.g. *"Brainstorm 3 ways to automate my daily review"*). Verify output provides categorized, creative ideas.
- **Step 3.2**: Click the "Summarize" focus chip. Send a prompt. Verify output yields an executive summary with bulleted action items.
- **Step 3.3**: Click the "Dialogue" focus chip. Verify conversational continuity.

## Test Case 4: Cloud Firestore Persistence & User Isolation
- **Step 4.1**: Check the top-right header for the "Saved" indicator with a green bookmark badge.
- **Step 4.2**: Verify the document is stored under `/users/{USER_ID}/reflections/{ENTRY_ID}` in Cloud Firestore.
- **Step 4.3**: Open an incognito session and sign in with a different Google account. Verify that the second user cannot view or access the first user's reflections.

## Test Case 5: AI Title Generation & Metadata Editing
- **Step 5.1**: Click the magic wand icon next to the title field.
- **Step 5.2**: Verify Gemini suggests a poetic 3-6 word title based on the entry's content.
- **Step 5.3**: Click a category pill (e.g., *Work*, *Ideas*, *Gratitude*, *Mindfulness*). Verify the change is instantly persisted to Firestore.

## Test Case 6: Journal History, Filtering, & Search
- **Step 6.1**: Click **Journal History** in the left sidebar (`#nav-tab-history`). On a narrow viewport, open the drawer first (`#nav-open-sidebar-btn`).
- **Step 6.2**: Verify all past sessions appear as cards with titles, turn counts, and preview snippets.
- **Step 6.3**: Type a keyword into the search input. Verify list filters in real time.
- **Step 6.4**: Click a category filter pill. Verify only reflections belonging to that category are shown.
- **Step 6.5**: Click the Pin icon on a card. Verify it sticks to the top with an amber border.
- **Step 6.6**: Click "Open" on a card. Verify the multi-turn session reloads into the active reflection editor.

## Test Case 7: Entry Deletion with Safeguard
- **Step 7.1**: In History View, click the trash can icon on an entry card.
- **Step 7.2**: Verify the confirmation overlay appears asking *"Permanently delete this reflection?"*.
- **Step 7.3**: Click *"Yes, Delete"*. Verify the card is removed from both the UI and Cloud Firestore.

## Test Case 8: Sign Out
- **Step 8.1**: Open **Profile** from the sidebar (`#nav-profile-btn`), stay on the **Account** section.
- **Step 8.2**: Click **Sign out** (`#profile-sign-out-btn`).
- **Step 8.3**: Confirm the session is terminated and the user is returned to the landing page with no journal content reachable.

## Test Case 9: Location-Aware Entries, Draggable Maps, & Landmark Autocomplete Search
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

## Test Case 10: Places Map (Photos-style pins)
- **Step 10.1**: Click **Places Map** in the sidebar (`#nav-tab-map`). Verify a full-bleed Google Map with floating search and category chips, and a draggable bottom sheet.
- **Step 10.2**: **Pins**: verify every reflection carrying a location renders as a photo-style pin. Where several entries share a place, verify the stacked "photo backs" and a count badge.
- **Step 10.3**: **Clustering**: zoom out and verify nearby pins merge into one group; zoom in past the split threshold and verify they separate again.
- **Step 10.4**: **Select**: click a pin. Verify the sheet expands to that place, the camera lifts the pin clear of the sheet, and the entries at that place are listed.
- **Step 10.5**: **Search and filter**: type into the search field and verify only matching places remain; click a category chip and verify pins and list both narrow.
- **Step 10.6**: **Fit all / locate me / map type**: use the right-hand rail to frame every pin, centre on your own position (granting permission), and toggle Map ↔ Satellite.
- **Step 10.7**: **Drop a pin**: click **Drop a pin**, click the map, and verify a new reflection is started at those coordinates.
- **Step 10.8**: **Empty state**: with an account that has no located entries, verify the sheet reads *"No reflection has a location yet."* and that no sample or demo places appear anywhere.
- **Step 10.9**: **Theme**: switch to dark. Verify the map itself renders in Google's dark colour scheme, not just the surrounding chrome.

## Test Case 11: Analytics
- **Step 11.1**: Click **Analytics** in the sidebar (`#nav-tab-analytics`).
- **Step 11.2**: On a fresh account, verify the empty state explains that entries are read shortly after saving.
- **Step 11.3**: Write an entry of at least a few sentences, wait ~45 seconds, and verify a reading appears — or click **Analyse N entries** to run the backfill immediately.
- **Step 11.4**: **Domain scatter**: verify each reflection appears as a dot on its domain lane, sized by depth and coloured by mood, with share bars on the right identifying the dominant domain.
- **Step 11.5**: **Mood**: verify the ribbon plots per-entry mood against a smoothed trend around a zero baseline, and the field plots mood against energy in four quadrants.
- **Step 11.6**: **Belief shifts / patterns**: verify shifts render as struck-through *from* → highlighted *to* with the source entry, and that a pattern appears in the recurrence grid only once it has occurred more than once.
- **Step 11.7**: **Range**: switch between 3 months / 12 months / All time and verify every panel re-scales.
- **Step 11.8**: **Monthly summary**: for a finished month, click its **Generate** chip. Verify a retrospective card is written with a headline, narrative, trend, patterns and a closing question, and that it persists across a reload.
- **Step 11.9**: **Deletion**: delete an analysed reflection and verify its dot leaves the charts.

## Test Case 12: Preferences (theme and accent)
- **Step 12.1**: Open **Profile → Preferences**.
- **Step 12.2**: Pick each of the five accents and verify buttons, links, active nav, chips and map highlights all follow, while success / warning / destructive colours stay fixed.
- **Step 12.3**: Toggle **Light / Dark** and verify the whole app inverts, including the map.
- **Step 12.4**: Verify the status line reads *"Saved to your account"*, then reload and confirm the choice survives with no flash of the default theme.
- **Step 12.5**: Sign in on a second device or browser profile and verify the same theme and accent arrive.

## Test Case 13: Integrations (webhooks)
- **Step 13.1**: Open **Profile → Integrations** and add a Discord or Slack destination.
- **Step 13.2**: Click **Send test** and verify the message arrives, and that the row records the outcome.
- **Step 13.3**: Enter a `http://localhost:...` URL on an **Other** destination. Verify the severe insecure-endpoint warning appears and the destination is still allowed unless `WEBHOOK_BLOCK_PRIVATE_TARGETS=true`.
- **Step 13.4**: Restrict a destination by event, category and reflection mode. Write an entry that does not match and verify nothing is delivered; write one that matches and verify it is.
- **Step 13.5**: Verify destination URLs are masked everywhere in the UI, and that a failed delivery never surfaces as a save error on the entry.
