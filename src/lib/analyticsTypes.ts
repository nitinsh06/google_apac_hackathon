/**
 * Analytics contract.
 *
 * Dependency-free and importable by both the browser and the server, like
 * `webhookTypes.ts`. Everything the extraction model is allowed to say about a
 * reflection is declared here — a closed domain vocabulary, bounded numbers,
 * clamped strings — so the charts have a stable axis to draw against and a
 * model that drifts cannot widen the shape of what gets stored.
 */

export const ANALYTICS_SCHEMA_VERSION = 1;

// ── Domains ───────────────────────────────────────────────────────────────
//
// A fixed vocabulary, not free text. An open set would give the scatter plot a
// new lane every week and make "what do I talk about most" unanswerable.

export const DOMAIN_IDS = [
  'career',
  'relationships',
  'family',
  'health',
  'inner-life',
  'creativity',
  'learning',
  'money',
  'purpose',
  'habits',
] as const;

export type DomainId = (typeof DOMAIN_IDS)[number];

export interface DomainMeta {
  id: DomainId;
  label: string;
  /** What belongs here, stated for the model as much as for the legend. */
  blurb: string;
  hue: number;
}

export const DOMAINS: DomainMeta[] = [
  { id: 'career', label: 'Career', blurb: 'work, craft, ambition, colleagues, professional direction', hue: 214 },
  { id: 'relationships', label: 'Relationships', blurb: 'friendships, partner, dating, social life, conflict with others', hue: 340 },
  { id: 'family', label: 'Family', blurb: 'parents, siblings, children, home life, family obligation', hue: 12 },
  { id: 'health', label: 'Health', blurb: 'body, sleep, exercise, illness, energy, food', hue: 152 },
  { id: 'inner-life', label: 'Inner life', blurb: 'emotions, anxiety, self-image, therapy, mental state', hue: 268 },
  { id: 'creativity', label: 'Creativity', blurb: 'making things, art, writing, side projects, taste', hue: 40 },
  { id: 'learning', label: 'Learning', blurb: 'study, skills, curiosity, books, understanding something new', hue: 190 },
  { id: 'money', label: 'Money', blurb: 'finances, security, spending, saving, material worry', hue: 98 },
  { id: 'purpose', label: 'Purpose', blurb: 'meaning, values, mortality, what matters, life direction', hue: 288 },
  { id: 'habits', label: 'Habits', blurb: 'routines, discipline, systems, procrastination, follow-through', hue: 24 },
];

export const DOMAIN_BY_ID: Record<DomainId, DomainMeta> = DOMAINS.reduce(
  (acc, domain) => ({ ...acc, [domain.id]: domain }),
  {} as Record<DomainId, DomainMeta>
);

export const isDomainId = (value: unknown): value is DomainId =>
  typeof value === 'string' && (DOMAIN_IDS as readonly string[]).includes(value);

// ── Sentiment ─────────────────────────────────────────────────────────────

export const SENTIMENT_LABELS = [
  'heavy',
  'unsettled',
  'flat',
  'steady',
  'hopeful',
  'energised',
] as const;

export type SentimentLabel = (typeof SENTIMENT_LABELS)[number];

export const isSentimentLabel = (value: unknown): value is SentimentLabel =>
  typeof value === 'string' && (SENTIMENT_LABELS as readonly string[]).includes(value);

/** Maps a valence reading onto the label the model should have chosen. */
export function labelForValence(valence: number, energy: number): SentimentLabel {
  if (valence <= -0.55) return 'heavy';
  if (valence <= -0.2) return 'unsettled';
  if (valence < 0.2) return energy < 0.4 ? 'flat' : 'steady';
  if (valence < 0.55) return 'hopeful';
  return 'energised';
}

// ── Stored shapes ─────────────────────────────────────────────────────────

export interface DomainWeight {
  id: DomainId;
  /** 0–1. Weights across one entry sum to roughly 1. */
  weight: number;
}

export interface BeliefShift {
  /** What the writer used to hold. */
  from: string;
  /** What they appear to hold now. */
  to: string;
  /** 0–1: how firmly the text supports the reading. */
  confidence: number;
}

export interface EntryInsight {
  entryId: string;
  entryTitle: string;
  /** The reflection's own timestamp — the x-axis of every chart here. */
  entryCreatedAt: string;
  category: string;
  domains: DomainWeight[];
  primaryDomain: DomainId;
  /** -1 (heavy) to 1 (bright). */
  valence: number;
  /** 0 (depleted) to 1 (activated). */
  energy: number;
  sentiment: SentimentLabel;
  emotions: string[];
  beliefShifts: BeliefShift[];
  patterns: string[];
  /** 0–1: how substantive the entry is, drives dot size in the scatter. */
  depth: number;
  summary: string;
  extractedAt: string;
  model: string;
  schemaVersion: number;
}

export interface MonthlySummary {
  /** `YYYY-MM`, and the document id. */
  month: string;
  entryCount: number;
  headline: string;
  narrative: string;
  topDomains: DomainWeight[];
  valence: number;
  energy: number;
  trend: 'rising' | 'falling' | 'steady';
  emergingPatterns: string[];
  fadingPatterns: string[];
  beliefShifts: BeliefShift[];
  question: string;
  generatedAt: string;
  model: string;
  schemaVersion: number;
}

// ── Clamps ────────────────────────────────────────────────────────────────
//
// Model output is untrusted input (OWASP LLM05). Everything below narrows it to
// the declared shape before it reaches Firestore or a chart axis.

export const clampNumber = (value: unknown, min: number, max: number, fallback: number): number => {
  // `Number(null)`, `Number('')` and `Number([])` are all 0, which would record a
  // missing reading as a real one at the bottom of the scale. Only an actual
  // number, or a string that is entirely a number, counts as an answer.
  let n: number;
  if (typeof value === 'number') {
    n = value;
  } else if (typeof value === 'string' && value.trim() !== '') {
    n = Number(value);
  } else {
    return fallback;
  }

  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

export const clampText = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';

export const clampList = (value: unknown, max: number, itemMax: number): string[] =>
  Array.isArray(value)
    ? value
        .map((item) => clampText(item, itemMax).toLowerCase())
        .filter((item, index, all) => item.length > 1 && all.indexOf(item) === index)
        .slice(0, max)
    : [];

export function normaliseDomains(value: unknown): DomainWeight[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<DomainId>();
  const weights: DomainWeight[] = [];

  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const record = raw as Record<string, unknown>;
    if (!isDomainId(record.id) || seen.has(record.id)) continue;
    seen.add(record.id);
    weights.push({ id: record.id, weight: clampNumber(record.weight, 0, 1, 0) });
  }

  // Renormalise so a model that returns 0.9/0.9 cannot inflate one entry's
  // contribution to the totals the charts add up.
  const total = weights.reduce((sum, entry) => sum + entry.weight, 0);
  if (total <= 0) return weights.slice(0, 3).map((entry) => ({ ...entry, weight: 1 / Math.max(1, Math.min(3, weights.length)) }));

  return weights
    .map((entry) => ({ id: entry.id, weight: Math.round((entry.weight / total) * 1000) / 1000 }))
    .filter((entry) => entry.weight > 0.02)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 4);
}

export function normaliseBeliefShifts(value: unknown, max = 3): BeliefShift[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      if (!raw || typeof raw !== 'object') return null;
      const record = raw as Record<string, unknown>;
      const from = clampText(record.from, 160);
      const to = clampText(record.to, 160);
      if (!from || !to) return null;
      return { from, to, confidence: clampNumber(record.confidence, 0, 1, 0.5) };
    })
    .filter((shift): shift is BeliefShift => shift !== null)
    .slice(0, max);
}

/** The month key a timestamp belongs to, in UTC so it never drifts by device. */
export function monthKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number);
  if (!year || !month) return key;
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
