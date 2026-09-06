import { DOMAIN_BY_ID } from './analyticsTypes.ts';
import type { DomainId, DomainWeight } from './analyticsTypes.ts';

/**
 * The journal card: a small, earned object.
 *
 * Shared by the owner's view, the public page and the security rules, so the
 * scoring is defined once and in the open. Two rules govern what may appear
 * here, because this document is world-readable once published:
 *
 *   - Counts and distributions only. No titles, no excerpts, no place names,
 *     no coordinates — nothing that could identify where someone lives or what
 *     they wrote. A domain distribution is abstract; "Luxembourg Gardens" is not.
 *   - Nothing is published without an explicit act. Absence of a card document
 *     is the default state.
 */

export const CARD_SCHEMA_VERSION = 1;

// ── Scoring ───────────────────────────────────────────────────────────────
//
// Weighted so the rarer signals count for more. Writing often is the baseline;
// writing from many places, across many months, and actually changing your mind
// are what move the number.

export const SCORE_WEIGHTS = {
  entry: 10,
  place: 25,
  domain: 15,
  month: 20,
  shift: 30,
} as const;

export interface CardStats {
  entries: number;
  places: number;
  domains: number;
  months: number;
  shifts: number;
  /** 0–1 average depth across analysed entries. */
  depth: number;
}

export interface ScoreLine {
  label: string;
  count: number;
  points: number;
}

export function scoreBreakdown(stats: CardStats): ScoreLine[] {
  return [
    { label: 'Reflections', count: stats.entries, points: stats.entries * SCORE_WEIGHTS.entry },
    { label: 'Places', count: stats.places, points: stats.places * SCORE_WEIGHTS.place },
    { label: 'Domains', count: stats.domains, points: stats.domains * SCORE_WEIGHTS.domain },
    { label: 'Months active', count: stats.months, points: stats.months * SCORE_WEIGHTS.month },
    { label: 'Belief shifts', count: stats.shifts, points: stats.shifts * SCORE_WEIGHTS.shift },
  ];
}

export const totalScore = (stats: CardStats): number =>
  scoreBreakdown(stats).reduce((sum, line) => sum + line.points, 0);

// ── Levels and rarity ─────────────────────────────────────────────────────
//
// Gaps widen so an early level arrives quickly and a late one means something.

const LEVEL_THRESHOLDS = [0, 60, 150, 300, 550, 900, 1400, 2100, 3000, 4200];

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface RarityMeta {
  id: Rarity;
  label: string;
  /** Foil sweep for the card frame. */
  hues: [number, number, number];
}

export const RARITIES: Record<Rarity, RarityMeta> = {
  common: { id: 'common', label: 'Common', hues: [212, 220, 205] },
  uncommon: { id: 'uncommon', label: 'Uncommon', hues: [152, 168, 140] },
  rare: { id: 'rare', label: 'Rare', hues: [205, 225, 190] },
  epic: { id: 'epic', label: 'Epic', hues: [268, 292, 250] },
  legendary: { id: 'legendary', label: 'Legendary', hues: [38, 22, 48] },
};

export function levelFor(score: number): number {
  let level = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i += 1) {
    if (score >= LEVEL_THRESHOLDS[i]) level = i + 1;
  }
  return level;
}

export function rarityFor(level: number): Rarity {
  if (level >= 9) return 'legendary';
  if (level >= 7) return 'epic';
  if (level >= 5) return 'rare';
  if (level >= 3) return 'uncommon';
  return 'common';
}

/** Progress toward the next level, and how many points remain. */
export function levelProgress(score: number): { progress: number; toNext: number | null } {
  const level = levelFor(score);
  if (level >= LEVEL_THRESHOLDS.length) return { progress: 1, toNext: null };

  const floor = LEVEL_THRESHOLDS[level - 1];
  const ceiling = LEVEL_THRESHOLDS[level];
  return {
    progress: Math.min(1, Math.max(0, (score - floor) / (ceiling - floor))),
    toNext: ceiling - score,
  };
}

// ── Titles ────────────────────────────────────────────────────────────────
//
// Two halves, each earned from a different axis: how far you range, and what
// you keep returning to. "Wanderer Thinker" is someone who writes from many
// places, mostly about their inner life.

const MOVEMENT: Array<{ min: number; word: string }> = [
  { min: 12, word: 'Voyager' },
  { min: 6, word: 'Wanderer' },
  { min: 3, word: 'Roaming' },
  { min: 1, word: 'Settled' },
  { min: 0, word: 'Rooted' },
];

const DOMAIN_NOUN: Record<DomainId, string> = {
  career: 'Builder',
  relationships: 'Confidant',
  family: 'Keeper',
  health: 'Tender',
  'inner-life': 'Thinker',
  creativity: 'Maker',
  learning: 'Scholar',
  money: 'Steward',
  purpose: 'Seeker',
  habits: 'Shaper',
};

export function movementWord(places: number): string {
  return MOVEMENT.find((tier) => places >= tier.min)?.word ?? 'Rooted';
}

export function titleFor(places: number, topDomain: DomainId | null): string {
  const noun = topDomain ? DOMAIN_NOUN[topDomain] : 'Journaler';
  return `${movementWord(places)} ${noun}`;
}

/** One line explaining why this title, shown under it so it never feels arbitrary. */
export function titleReason(places: number, topDomain: DomainId | null): string {
  const where =
    places === 0
      ? 'writing from wherever you are'
      : places === 1
      ? 'writing from one pinned place'
      : `writing from ${places} pinned places`;
  const what = topDomain
    ? `mostly about ${DOMAIN_BY_ID[topDomain]?.label.toLowerCase() ?? topDomain}`
    : 'across everything on your mind';
  return `${where}, ${what}.`;
}

// ── The published document ────────────────────────────────────────────────

export interface JournalCard {
  /** Random, rotatable share id. Never the user's uid. */
  slug: string;
  ownerId: string;
  /** Empty when the owner chose to publish anonymously. */
  displayName: string;
  title: string;
  level: number;
  rarity: Rarity;
  score: number;
  stats: CardStats;
  topDomains: DomainWeight[];
  /** ISO month the journal starts at, for the "since" line. */
  since: string;
  updatedAt: string;
  schemaVersion: number;
}

export const isRarity = (value: unknown): value is Rarity =>
  typeof value === 'string' && value in RARITIES;
