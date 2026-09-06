import { DOMAINS, monthKey } from './analyticsTypes.ts';
import type { BeliefShift, DomainId, EntryInsight } from './analyticsTypes.ts';

/** Chart-ready aggregates. Pure functions — the SVG components stay dumb. */

export interface DomainShare {
  id: DomainId;
  label: string;
  hue: number;
  /** Summed weight across the window. */
  total: number;
  /** 0–1 of the window's total weight. */
  share: number;
  entries: number;
}

export function domainShares(insights: EntryInsight[]): DomainShare[] {
  const totals = new Map<DomainId, { total: number; entries: number }>();

  for (const insight of insights) {
    for (const domain of insight.domains) {
      const current = totals.get(domain.id) ?? { total: 0, entries: 0 };
      current.total += domain.weight;
      current.entries += 1;
      totals.set(domain.id, current);
    }
  }

  const grand = [...totals.values()].reduce((sum, value) => sum + value.total, 0) || 1;

  return DOMAINS.map((domain) => {
    const found = totals.get(domain.id) ?? { total: 0, entries: 0 };
    return {
      id: domain.id,
      label: domain.label,
      hue: domain.hue,
      total: found.total,
      share: found.total / grand,
      entries: found.entries,
    };
  });
}

export interface MoodPoint {
  t: number;
  valence: number;
  energy: number;
  insight: EntryInsight;
}

export function moodSeries(insights: EntryInsight[]): MoodPoint[] {
  return insights
    .map((insight) => ({
      t: Date.parse(insight.entryCreatedAt),
      valence: insight.valence,
      energy: insight.energy,
      insight,
    }))
    .filter((point) => Number.isFinite(point.t))
    .sort((a, b) => a.t - b.t);
}

/**
 * Centred rolling mean. A journal is written in bursts, so a raw line is mostly
 * noise; this is the shape underneath it.
 */
export function smooth(points: MoodPoint[], window = 5): Array<{ t: number; value: number }> {
  if (points.length === 0) return [];
  const half = Math.floor(window / 2);

  return points.map((point, index) => {
    const from = Math.max(0, index - half);
    const to = Math.min(points.length, index + half + 1);
    const slice = points.slice(from, to);
    return {
      t: point.t,
      value: slice.reduce((sum, item) => sum + item.valence, 0) / slice.length,
    };
  });
}

export interface PatternRow {
  pattern: string;
  /** Count per month key. */
  byMonth: Map<string, number>;
  total: number;
  first: string;
  last: string;
}

export function patternRows(insights: EntryInsight[], limit = 8): PatternRow[] {
  const rows = new Map<string, PatternRow>();

  for (const insight of insights) {
    const month = monthKey(insight.entryCreatedAt);
    for (const pattern of insight.patterns) {
      const row =
        rows.get(pattern) ??
        ({
          pattern,
          byMonth: new Map<string, number>(),
          total: 0,
          first: insight.entryCreatedAt,
          last: insight.entryCreatedAt,
        } satisfies PatternRow);

      row.byMonth.set(month, (row.byMonth.get(month) ?? 0) + 1);
      row.total += 1;
      if (insight.entryCreatedAt < row.first) row.first = insight.entryCreatedAt;
      if (insight.entryCreatedAt > row.last) row.last = insight.entryCreatedAt;
      rows.set(pattern, row);
    }
  }

  return [...rows.values()]
    .filter((row) => row.total > 1)
    .sort((a, b) => b.total - a.total || a.pattern.localeCompare(b.pattern))
    .slice(0, limit);
}

/** Every month between the first and last reading, so gaps stay visible. */
export function monthSpan(insights: EntryInsight[]): string[] {
  if (insights.length === 0) return [];

  const keys = insights.map((insight) => monthKey(insight.entryCreatedAt)).filter((key) => key !== 'unknown');
  if (keys.length === 0) return [];

  const sorted = [...keys].sort();
  const [startYear, startMonth] = sorted[0].split('-').map(Number);
  const [endYear, endMonth] = sorted[sorted.length - 1].split('-').map(Number);

  const span: string[] = [];
  let year = startYear;
  let month = startMonth;
  // Bounded: a decade of months is plenty and stops a bad timestamp looping.
  for (let guard = 0; guard < 240; guard += 1) {
    span.push(`${year}-${String(month).padStart(2, '0')}`);
    if (year === endYear && month === endMonth) break;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return span;
}

export interface DatedShift extends BeliefShift {
  at: string;
  entryId: string;
  entryTitle: string;
  domain: DomainId;
}

export function datedShifts(insights: EntryInsight[]): DatedShift[] {
  return insights
    .flatMap((insight) =>
      insight.beliefShifts.map((shift) => ({
        ...shift,
        at: insight.entryCreatedAt,
        entryId: insight.entryId,
        entryTitle: insight.entryTitle,
        domain: insight.primaryDomain,
      }))
    )
    .sort((a, b) => b.at.localeCompare(a.at));
}

export function averageMood(insights: EntryInsight[]): { valence: number; energy: number } {
  if (insights.length === 0) return { valence: 0, energy: 0.5 };
  return {
    valence: insights.reduce((sum, item) => sum + item.valence, 0) / insights.length,
    energy: insights.reduce((sum, item) => sum + item.energy, 0) / insights.length,
  };
}

/** Compares the newest third of the window with the oldest third. */
export function moodDelta(insights: EntryInsight[]): number | null {
  if (insights.length < 6) return null;
  const sorted = [...insights].sort((a, b) => a.entryCreatedAt.localeCompare(b.entryCreatedAt));
  const size = Math.max(2, Math.floor(sorted.length / 3));
  const early = sorted.slice(0, size);
  const late = sorted.slice(-size);
  return averageMood(late).valence - averageMood(early).valence;
}

// ── Colour ────────────────────────────────────────────────────────────────

/**
 * Diverging mood scale: deep blue through neutral grey to warm gold. Chosen to
 * sit outside the accent ramp, since the user can repaint that at will.
 */
export function valenceColor(valence: number, isDark: boolean): string {
  const v = Math.max(-1, Math.min(1, valence));
  const light = isDark ? 62 : 50;

  if (v < 0) {
    const k = Math.abs(v);
    return `hsl(${228 - k * 8} ${12 + k * 46}% ${light + (isDark ? 0 : 2) - k * 2}%)`;
  }
  return `hsl(${215 - v * 180} ${12 + v * 74}% ${light + v * 3}%)`;
}

export function domainColor(hue: number, isDark: boolean, alpha = 1): string {
  return `hsl(${hue} ${isDark ? 58 : 62}% ${isDark ? 58 : 48}% / ${alpha})`;
}
