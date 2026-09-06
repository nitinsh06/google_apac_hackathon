# The journal card

An earned, shareable object: a portrait card whose art is generated from the writer's own domain
distribution, and whose frame colour is set by rarity. Nothing about it is published without an
explicit act, and what a published card contains is a deliberately narrow list.

## What it is made of

| Element | Source |
| :--- | :--- |
| **Title** — "Wanderer Thinker" | Two axes: how many places you write from, and the domain you return to most. `titleFor()` in `src/lib/cardTypes.ts`. |
| **Level** and **rarity** | Derived from score against widening thresholds, so an early level arrives quickly and a late one means something. |
| **Emblem** | One soft bloom per domain, placed around a circle and sized by that domain's share. Screen-blended so overlaps glow. The art is the data — every card genuinely differs. |
| **Orbit ring** | One mark per place pinned, capped at 18 so it stays a ring. |
| **Stats plate** | Reflections, places, months active, belief shifts. |

## Scoring

Weighted so the rarer signals count for more. Writing often is the baseline; writing from many
places, across many months, and actually changing your mind are what move the number.

| Signal | Points each |
| :--- | ---: |
| Reflection written | 10 |
| Place pinned | 25 |
| Domain touched | 15 |
| Month active | 20 |
| Belief shift | 30 |

Rarity escalates with level, and reads at a glance before the label does — common is brushed
graphite, then green, azure, violet, and gold. Saturation climbs with the tier, as does the shadow
weight and the foil; the top two tiers catch the light on their own.

## Privacy

The published document is the only place in this app where anything escapes the owner's tree, so
what goes into it is narrow by construction:

!!! success "What a published card contains"

    Title, level, score and counts. Your domain mix, as proportions.

!!! failure "What it never contains"

    No entries, titles or excerpts. No place names. No coordinates. A domain distribution is
    abstract; "Luxembourg Gardens" is not.

Two rules enforce this rather than convention:

- **The field allowlist in `firestore.rules`** is the privacy guarantee. `hasOnly` is what stops a
  modified client from ever placing an entry title or a coordinate into a world-readable document.
  Adding a field to that allowlist is a decision that it is safe to publish.
- **`publicCards` grants `get`, not `read`.** `read` would also grant `list`, letting anyone
  enumerate every published card and making the unguessable slug pointless. The link *is* the
  access control.

## Sharing

Publishing copies a narrowed card to `publicCards/{slug}` and writes a pointer at
`users/{uid}/preferences/card`. The slug is random and unguessable — never the user's uid.

- **A published card is a snapshot.** It does not update on its own; republish after writing more.
- **New link** mints a fresh slug and deletes the old document, which is how you revoke a link you
  have shared too widely. The new document is written before the old one is removed, so a rotation
  never leaves the card unreachable in between.
- **Unpublish** deletes the public document and the pointer. The URL is not recoverable.
- **Anonymous publishing** leaves the display name off the card entirely — the field is written
  empty, not hidden at render time.

The public page at `/c/{slug}` renders with no session. A visitor is not signed in and must not be
pushed to sign in before they can see what they were sent; it reads one world-readable document and
nothing else.

## Where the code lives

| Concern | File |
| :--- | :--- |
| Scoring, levels, rarity, titles | `src/lib/cardTypes.ts` |
| Building, publishing, rotating, fetching | `src/lib/card.ts` |
| The card itself | `src/components/JournalCard.tsx` and the `.jm-card` block in `src/index.css` |
| Owner's panel and share controls | `src/components/CardPanel.tsx` |
| Public share page | `src/components/PublicCardPage.tsx` |

!!! warning "Rules must be deployed before sharing works"

    The card rules were added alongside the feature. Until `firebase deploy --only firestore:rules`
    has run, every publish fails closed with *Missing or insufficient permissions*. See
    [Setup](setup.md).
