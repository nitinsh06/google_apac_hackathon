import { collection, deleteDoc, doc, onSnapshot, query, setDoc } from 'firebase/firestore';
import type { JournalEntry } from '../types.ts';
import { auth, db, sanitizePayload } from './firebaseApp.ts';
import {
  ANALYTICS_SCHEMA_VERSION,
  clampList,
  clampNumber,
  clampText,
  isDomainId,
  isSentimentLabel,
  monthKey,
  normaliseBeliefShifts,
  normaliseDomains,
} from './analyticsTypes.ts';
import type { EntryInsight, MonthlySummary } from './analyticsTypes.ts';

/**
 * The analytics pipeline's browser half.
 *
 * A reflection is analysed after it settles, not on every keystroke: the editor
 * persists constantly, so extraction is debounced and skipped entirely when the
 * stored reading is already newer than the entry. The server does the model
 * call; the browser writes the result under its own uid, which is why no
 * service account exists anywhere in this app.
 */

const insightsRef = (userId: string) => collection(db, 'users', userId, 'insights');
const insightDoc = (userId: string, entryId: string) =>
  doc(db, 'users', userId, 'insights', entryId);
const summariesRef = (userId: string) => collection(db, 'users', userId, 'monthlySummaries');
const summaryDoc = (userId: string, month: string) =>
  doc(db, 'users', userId, 'monthlySummaries', month);

/** Long enough that a writing session produces one analysis, not thirty. */
const EXTRACT_DEBOUNCE_MS = 45_000;
/** Below this there is nothing to read, and the call would be wasted spend. */
const MIN_TEXT_LENGTH = 40;

// ── Reading stored records back ───────────────────────────────────────────
//
// These documents are client-writable, so re-validate on read exactly as the
// webhook settings do. A chart axis must never be handed an arbitrary number.

export function toEntryInsight(raw: unknown): EntryInsight | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;

  const entryId = clampText(record.entryId, 200);
  const entryCreatedAt = clampText(record.entryCreatedAt, 40);
  if (!entryId || !entryCreatedAt) return null;

  const domains = normaliseDomains(record.domains);
  const valence = clampNumber(record.valence, -1, 1, 0);
  const energy = clampNumber(record.energy, 0, 1, 0.5);

  return {
    entryId,
    entryTitle: clampText(record.entryTitle, 120) || 'Untitled reflection',
    entryCreatedAt,
    category: clampText(record.category, 40),
    domains,
    primaryDomain: isDomainId(record.primaryDomain)
      ? record.primaryDomain
      : domains[0]?.id ?? 'inner-life',
    valence,
    energy,
    sentiment: isSentimentLabel(record.sentiment) ? record.sentiment : 'steady',
    emotions: clampList(record.emotions, 4, 24),
    beliefShifts: normaliseBeliefShifts(record.beliefShifts, 3),
    patterns: clampList(record.patterns, 4, 48),
    depth: clampNumber(record.depth, 0, 1, 0.4),
    summary: clampText(record.summary, 200),
    extractedAt: clampText(record.extractedAt, 40),
    model: clampText(record.model, 60),
    schemaVersion: clampNumber(record.schemaVersion, 0, 99, 0),
  };
}

export function toMonthlySummary(raw: unknown): MonthlySummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;

  const month = clampText(record.month, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) return null;

  const trend = record.trend;
  return {
    month,
    entryCount: clampNumber(record.entryCount, 0, 10_000, 0),
    headline: clampText(record.headline, 90),
    narrative: clampText(record.narrative, 900),
    topDomains: normaliseDomains(record.topDomains),
    valence: clampNumber(record.valence, -1, 1, 0),
    energy: clampNumber(record.energy, 0, 1, 0.5),
    trend: trend === 'rising' || trend === 'falling' ? trend : 'steady',
    emergingPatterns: clampList(record.emergingPatterns, 3, 48),
    fadingPatterns: clampList(record.fadingPatterns, 3, 48),
    beliefShifts: normaliseBeliefShifts(record.beliefShifts, 4),
    question: clampText(record.question, 240),
    generatedAt: clampText(record.generatedAt, 40),
    model: clampText(record.model, 60),
    schemaVersion: clampNumber(record.schemaVersion, 0, 99, 0),
  };
}

// ── Subscriptions ─────────────────────────────────────────────────────────

export function subscribeInsights(
  userId: string,
  onChange: (insights: EntryInsight[]) => void,
  onError?: (error: Error) => void
) {
  if (!userId) {
    onChange([]);
    return () => {};
  }

  return onSnapshot(
    query(insightsRef(userId)),
    (snapshot) => {
      const insights = snapshot.docs
        .map((document) => toEntryInsight(document.data()))
        .filter((insight): insight is EntryInsight => insight !== null)
        .sort((a, b) => a.entryCreatedAt.localeCompare(b.entryCreatedAt));
      knownInsights = new Map(insights.map((insight) => [insight.entryId, insight]));
      onChange(insights);
    },
    (error) => {
      console.error('Could not read analytics:', error);
      onError?.(error);
    }
  );
}

export function subscribeMonthlySummaries(
  userId: string,
  onChange: (summaries: MonthlySummary[]) => void,
  onError?: (error: Error) => void
) {
  if (!userId) {
    onChange([]);
    return () => {};
  }

  return onSnapshot(
    query(summariesRef(userId)),
    (snapshot) => {
      onChange(
        snapshot.docs
          .map((document) => toMonthlySummary(document.data()))
          .filter((summary): summary is MonthlySummary => summary !== null)
          .sort((a, b) => b.month.localeCompare(a.month))
      );
    },
    (error) => {
      console.error('Could not read monthly summaries:', error);
      onError?.(error);
    }
  );
}

// ── Extraction ────────────────────────────────────────────────────────────

/** Kept current by the subscription, so the trigger needs no extra read. */
let knownInsights = new Map<string, EntryInsight>();
const pending = new Map<string, ReturnType<typeof setTimeout>>();
const inFlight = new Set<string>();

/** The writer's own words. Model replies are not evidence about the writer. */
function writerText(entry: JournalEntry): string {
  return entry.turns
    .filter((turn) => turn.role === 'user')
    .map((turn) => turn.text.trim())
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

function needsExtraction(entry: JournalEntry): boolean {
  if (writerText(entry).length < MIN_TEXT_LENGTH) return false;

  const existing = knownInsights.get(entry.id);
  if (!existing) return true;
  if (existing.schemaVersion !== ANALYTICS_SCHEMA_VERSION) return true;

  // Re-analyse only when the entry has actually moved on since we last read it.
  return entry.updatedAt > existing.extractedAt;
}

async function runExtraction(entry: JournalEntry): Promise<EntryInsight | null> {
  const user = auth.currentUser;
  if (!user || inFlight.has(entry.id)) return null;

  inFlight.add(entry.id);
  try {
    const token = await user.getIdToken();
    const response = await fetch('/api/analytics/extract', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        entry: {
          id: entry.id,
          title: entry.title,
          category: entry.category,
          createdAt: entry.createdAt,
          text: writerText(entry),
          turnCount: entry.turns.length,
        },
      }),
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as { insight?: unknown };
    const insight = toEntryInsight(payload.insight);
    if (!insight) return null;

    await setDoc(insightDoc(user.uid, entry.id), sanitizePayload(insight), { merge: false });
    knownInsights.set(entry.id, insight);
    return insight;
  } catch (error) {
    // Analysis is derived data: a failure must never surface as a save error.
    console.warn('Could not analyse reflection:', error);
    return null;
  } finally {
    inFlight.delete(entry.id);
  }
}

/**
 * Called on every persisted create or update. Debounced, so a writing session
 * costs one extraction rather than one per autosave.
 */
export function queueEntryExtraction(entry: JournalEntry): void {
  if (!auth.currentUser) return;

  const existing = pending.get(entry.id);
  if (existing) clearTimeout(existing);

  pending.set(
    entry.id,
    setTimeout(() => {
      pending.delete(entry.id);
      if (needsExtraction(entry)) void runExtraction(entry);
    }, EXTRACT_DEBOUNCE_MS)
  );
}

/** Analyses anything the debounce never covered — old entries, missed writes. */
export async function backfillInsights(
  entries: JournalEntry[],
  onProgress?: (done: number, total: number) => void
): Promise<number> {
  const outstanding = entries.filter(needsExtraction);
  onProgress?.(0, outstanding.length);

  let done = 0;
  // Serial on purpose: the server's per-user budget is 20/min, and a backfill
  // racing itself would spend it in one burst.
  for (const entry of outstanding) {
    await runExtraction(entry);
    done += 1;
    onProgress?.(done, outstanding.length);
  }
  return done;
}

export function countOutstanding(entries: JournalEntry[]): number {
  return entries.filter(needsExtraction).length;
}

/** A deleted reflection leaves no reading behind to skew the charts. */
export async function deleteInsight(userId: string, entryId: string): Promise<void> {
  forgetInsight(entryId);
  try {
    await deleteDoc(insightDoc(userId, entryId));
  } catch (error) {
    console.warn('Could not remove analytics for deleted reflection:', error);
  }
}

export function forgetInsight(entryId: string): void {
  knownInsights.delete(entryId);
  const timer = pending.get(entryId);
  if (timer) {
    clearTimeout(timer);
    pending.delete(entryId);
  }
}

// ── Monthly summaries ─────────────────────────────────────────────────────

export async function generateMonthlySummary(
  month: string,
  insights: EntryInsight[]
): Promise<MonthlySummary | null> {
  const user = auth.currentUser;
  if (!user) return null;

  const forMonth = insights.filter((insight) => monthKey(insight.entryCreatedAt) === month);
  if (forMonth.length === 0) return null;

  const token = await user.getIdToken();
  const response = await fetch('/api/analytics/monthly', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ month, insights: forMonth }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error || 'Could not write that monthly summary.');
  }

  const payload = (await response.json()) as { summary?: unknown };
  const summary = toMonthlySummary(payload.summary);
  if (!summary) throw new Error('The summary came back in an unexpected shape.');

  await setDoc(summaryDoc(user.uid, month), sanitizePayload(summary), { merge: false });
  return summary;
}

/** Months that are over, have readings, and have no summary written yet. */
export function pendingMonths(
  insights: EntryInsight[],
  summaries: MonthlySummary[]
): string[] {
  const now = new Date();
  const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const written = new Set(summaries.map((summary) => summary.month));

  const months = new Set(insights.map((insight) => monthKey(insight.entryCreatedAt)));
  return [...months]
    .filter((month) => month !== 'unknown' && month < currentMonth && !written.has(month))
    .sort();
}
