import { deleteDoc, doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import type { JournalEntry } from '../types.ts';
import { auth, db, sanitizePayload } from './firebaseApp.ts';
import { clampNumber, clampText, monthKey, normaliseDomains } from './analyticsTypes.ts';
import type { DomainId, EntryInsight } from './analyticsTypes.ts';
import { domainShares } from './analyticsDerive.ts';
import {
  CARD_SCHEMA_VERSION,
  isRarity,
  levelFor,
  rarityFor,
  titleFor,
  totalScore,
} from './cardTypes.ts';
import type { CardStats, JournalCard } from './cardTypes.ts';

/**
 * Card computation and publishing.
 *
 * The card is derived on demand from entries and insights — there is no stored
 * copy until the owner publishes one. Publishing writes a second document to a
 * world-readable collection, which is the only place in this app where anything
 * escapes the owner's tree, so what goes into it is deliberately narrow.
 */

const cardPointer = (userId: string) => doc(db, 'users', userId, 'preferences', 'card');
const publicCard = (slug: string) => doc(db, 'publicCards', slug);

/** URL-safe, unguessable, and short enough to read aloud. */
function makeSlug(): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

export function cardUrl(slug: string): string {
  return `${window.location.origin}/c/${slug}`;
}

// ── Derivation ────────────────────────────────────────────────────────────

export function buildStats(entries: JournalEntry[], insights: EntryInsight[]): CardStats {
  const places = new Set(
    entries
      .map((entry) => entry.location)
      .filter((location): location is NonNullable<typeof location> => !!location)
      // Round so two pins metres apart are the same place, not two.
      .map((location) => `${location.lat.toFixed(3)},${location.lng.toFixed(3)}`)
  );

  const months = new Set(
    entries.map((entry) => monthKey(entry.createdAt)).filter((month) => month !== 'unknown')
  );

  const domains = new Set(insights.flatMap((insight) => insight.domains.map((d) => d.id)));
  const shifts = insights.reduce((sum, insight) => sum + insight.beliefShifts.length, 0);
  const depth = insights.length
    ? insights.reduce((sum, insight) => sum + insight.depth, 0) / insights.length
    : 0;

  return {
    entries: entries.length,
    places: places.size,
    domains: domains.size,
    months: months.size,
    shifts,
    depth: Math.round(depth * 100) / 100,
  };
}

export function buildCard(options: {
  ownerId: string;
  displayName: string;
  entries: JournalEntry[];
  insights: EntryInsight[];
  slug?: string;
}): JournalCard {
  const { ownerId, displayName, entries, insights } = options;

  const stats = buildStats(entries, insights);
  const score = totalScore(stats);
  const level = levelFor(score);

  const topDomains = domainShares(insights)
    .filter((share) => share.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)
    .map((share) => ({ id: share.id, weight: Math.round(share.share * 1000) / 1000 }));

  const topDomain: DomainId | null = topDomains[0]?.id ?? null;

  const earliest = entries
    .map((entry) => entry.createdAt)
    .filter(Boolean)
    .sort()[0];

  return {
    slug: options.slug ?? '',
    ownerId,
    displayName,
    title: titleFor(stats.places, topDomain),
    level,
    rarity: rarityFor(level),
    score,
    stats,
    topDomains,
    since: earliest ? monthKey(earliest) : monthKey(new Date().toISOString()),
    updatedAt: new Date().toISOString(),
    schemaVersion: CARD_SCHEMA_VERSION,
  };
}

// ── Stored-shape validation ───────────────────────────────────────────────

export function toJournalCard(raw: unknown): JournalCard | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;

  const slug = clampText(record.slug, 32);
  const ownerId = clampText(record.ownerId, 128);
  if (!slug || !ownerId) return null;

  const statsRaw = (record.stats ?? {}) as Record<string, unknown>;
  const stats: CardStats = {
    entries: clampNumber(statsRaw.entries, 0, 1_000_000, 0),
    places: clampNumber(statsRaw.places, 0, 1_000_000, 0),
    domains: clampNumber(statsRaw.domains, 0, 10, 0),
    months: clampNumber(statsRaw.months, 0, 10_000, 0),
    shifts: clampNumber(statsRaw.shifts, 0, 1_000_000, 0),
    depth: clampNumber(statsRaw.depth, 0, 1, 0),
  };

  const level = clampNumber(record.level, 1, 10, 1);

  return {
    slug,
    ownerId,
    displayName: clampText(record.displayName, 60),
    title: clampText(record.title, 40) || 'Rooted Journaler',
    level,
    rarity: isRarity(record.rarity) ? record.rarity : rarityFor(level),
    score: clampNumber(record.score, 0, 10_000_000, 0),
    stats,
    topDomains: normaliseDomains(record.topDomains),
    since: clampText(record.since, 7),
    updatedAt: clampText(record.updatedAt, 40),
    schemaVersion: clampNumber(record.schemaVersion, 0, 99, 0),
  };
}

// ── Publishing ────────────────────────────────────────────────────────────

export interface CardPointer {
  slug: string;
  anonymous: boolean;
  publishedAt: string;
}

export function subscribeCardPointer(
  userId: string,
  onChange: (pointer: CardPointer | null) => void
) {
  if (!userId) {
    onChange(null);
    return () => {};
  }

  return onSnapshot(
    cardPointer(userId),
    (snapshot) => {
      const data = snapshot.data() as Record<string, unknown> | undefined;
      const slug = clampText(data?.slug, 32);
      onChange(
        slug
          ? {
              slug,
              anonymous: data?.anonymous === true,
              publishedAt: clampText(data?.publishedAt, 40),
            }
          : null
      );
    },
    (error) => {
      console.error('Could not read card settings:', error);
      onChange(null);
    }
  );
}

/**
 * Publishes, or refreshes an already-published card. Reuses the existing slug
 * so a link someone already has keeps working; `rotate` mints a new one, which
 * is how you revoke a link you have shared too widely.
 */
export async function publishCard(options: {
  entries: JournalEntry[];
  insights: EntryInsight[];
  displayName: string;
  anonymous: boolean;
  existingSlug?: string | null;
  rotate?: boolean;
}): Promise<CardPointer> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in to publish your card.');

  const previousSlug = options.existingSlug ?? null;
  const slug = options.rotate || !previousSlug ? makeSlug() : previousSlug;

  const card = buildCard({
    ownerId: user.uid,
    displayName: options.anonymous ? '' : options.displayName.slice(0, 60),
    entries: options.entries,
    insights: options.insights,
    slug,
  });

  await setDoc(publicCard(slug), sanitizePayload(card), { merge: false });

  // Retire the old link only once the new one is live, so a rotation never
  // leaves the card unreachable in between.
  if (previousSlug && previousSlug !== slug) {
    await deleteDoc(publicCard(previousSlug)).catch(() => {});
  }

  const pointer: CardPointer = {
    slug,
    anonymous: options.anonymous,
    publishedAt: new Date().toISOString(),
  };
  await setDoc(cardPointer(user.uid), sanitizePayload(pointer), { merge: false });
  return pointer;
}

export async function unpublishCard(slug: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;

  await deleteDoc(publicCard(slug)).catch(() => {});
  await deleteDoc(cardPointer(user.uid)).catch(() => {});
}

/** Reads a published card by slug. Used by the public page, with no auth. */
export async function fetchPublicCard(slug: string): Promise<JournalCard | null> {
  if (!/^[a-z0-9]{6,32}$/.test(slug)) return null;
  try {
    const snapshot = await getDoc(publicCard(slug));
    if (!snapshot.exists()) return null;
    return toJournalCard(snapshot.data());
  } catch (error) {
    console.error('Could not load that card:', error);
    return null;
  }
}
