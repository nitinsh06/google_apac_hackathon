# Firestore data model and security rules

Every document lives under `users/{uid}`. There is no shared collection and no admin path.

| Path | Written by | Holds |
| :--- | :--- | :--- |
| `users/{uid}/reflections/{entryId}` | Client | The journal entry: title, category, turns, optional location. |
| `users/{uid}/preferences/appearance` | Client | Theme (`light`/`dark`) and accent choice, synced across devices. |
| `users/{uid}/preferences/integrations` | Client | Webhook destinations and their event/category filters. |
| `users/{uid}/insights/{entryId}` | Client, from the extraction endpoint's response | Domains, mood (valence + energy), belief shifts, recurring patterns. |
| `users/{uid}/monthlySummaries/{YYYY-MM}` | Client, from the summary endpoint's response | The written retrospective for a closed month. |
| `users/{uid}/preferences/card` | Client | Which share link, if any, the user has published. |
| **`publicCards/{slug}`** | Client, on an explicit publish | **The one world-readable collection.** A journal card: title, level, score, counts and domain proportions. |

The live rules are in [`firestore.rules`](https://github.com/nitinsh06/google_apac_hackathon/blob/main/firestore.rules). Two things about their shape are
deliberate and easy to get wrong:

- **No `{allSubcollections=**}` wildcard.** Firestore ORs matching rules, so a broad `allow write`
  sitting beside a validated one means the validation never runs. Every path is named explicitly —
  **adding a subcollection means adding a rule**, or it is denied.
- **Analytics documents are shape-checked**, not just owner-checked. They are written straight from
  the browser, so the rule pins the field set, the enum values, and the array lengths rather than
  trusting the client.
- **`publicCards` grants `get`, not `read`.** `read` also grants `list`, which would let anyone
  enumerate every published card and make the unguessable slug pointless — the link *is* the access
  control, so the rule permits fetching a known slug and denies listing the collection. Its field
  allowlist is the second half of the privacy guarantee rather than a formality — it is what stops a modified client ever placing an entry title, an excerpt, a
  place name or a coordinate into a world-readable document. Both copies of `ownerId` are pinned on
  update, so one user cannot overwrite another's slug and an owner cannot reassign their own card.
  **Adding a field to that allowlist is a decision that it is safe to publish.**

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
