import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  Compass,
  Loader2,
  RefreshCw,
  Repeat,
  Shuffle,
  Sparkles,
} from 'lucide-react';
import type { JournalEntry } from '../types.ts';
import type { EntryInsight, MonthlySummary } from '../lib/analyticsTypes.ts';
import { DOMAIN_BY_ID, monthKey } from '../lib/analyticsTypes.ts';
import {
  averageMood,
  domainShares,
  moodDelta,
  valenceColor,
} from '../lib/analyticsDerive.ts';
import {
  backfillInsights,
  countOutstanding,
  generateMonthlySummary,
  pendingMonths,
  subscribeInsights,
  subscribeMonthlySummaries,
} from '../lib/analytics.ts';
import { useThemeValue } from '../lib/theme.ts';
import { DomainConstellation } from './analytics/DomainConstellation.tsx';
import { MoodField, MoodRibbon } from './analytics/MoodCharts.tsx';
import { BeliefLedger, PatternGrid } from './analytics/PatternGrid.tsx';
import { MonthTimeline } from './analytics/MonthTimeline.tsx';

interface AnalyticsViewProps {
  userId: string;
  entries: JournalEntry[];
  onSelectEntry?: (entryId: string) => void;
}

type Range = '3m' | '12m' | 'all';

const RANGES: Array<{ id: Range; label: string; months: number | null }> = [
  { id: '3m', label: '3 months', months: 3 },
  { id: '12m', label: '12 months', months: 12 },
  { id: 'all', label: 'All time', months: null },
];

const Panel: React.FC<{
  title: string;
  description: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  aside?: React.ReactNode;
}> = ({ title, description, icon, children, aside }) => (
  <section className="rounded-xl border border-slate-200 bg-surface shadow-xs">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-3.5 sm:px-5">
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-bold tracking-tight text-slate-900">{title}</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{description}</p>
        </div>
      </div>
      {aside}
    </header>
    <div className="px-4 py-4 sm:px-5">{children}</div>
  </section>
);

const Stat: React.FC<{ label: string; value: string; hint?: string; tint?: string }> = ({
  label,
  value,
  hint,
  tint,
}) => (
  <div className="rounded-xl border border-slate-200 bg-surface px-4 py-3 shadow-xs">
    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
    <p
      className="mt-1 truncate text-lg font-bold tracking-tight text-slate-900"
      style={tint ? { color: tint } : undefined}
    >
      {value}
    </p>
    {hint && <p className="mt-0.5 truncate text-[11px] text-slate-500">{hint}</p>}
  </div>
);

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  userId,
  entries,
  onSelectEntry,
}) => {
  const isDark = useThemeValue() === 'dark';
  const [insights, setInsights] = useState<EntryInsight[]>([]);
  const [summaries, setSummaries] = useState<MonthlySummary[]>([]);
  const [range, setRange] = useState<Range>('12m');
  const [backfilling, setBackfilling] = useState<{ done: number; total: number } | null>(null);
  const [busyMonth, setBusyMonth] = useState<string | null>(null);
  const [monthError, setMonthError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    const stop = subscribeInsights(userId, setInsights);
    const stopSummaries = subscribeMonthlySummaries(userId, setSummaries);
    return () => {
      stop();
      stopSummaries();
    };
  }, [userId]);

  const windowed = useMemo(() => {
    const months = RANGES.find((option) => option.id === range)?.months ?? null;
    if (months === null) return insights;
    const cutoff = Date.now() - months * 30.5 * 24 * 60 * 60 * 1000;
    return insights.filter((insight) => Date.parse(insight.entryCreatedAt) >= cutoff);
  }, [insights, range]);

  const shares = useMemo(() => domainShares(windowed), [windowed]);
  const leading = useMemo(
    () => [...shares].sort((a, b) => b.total - a.total)[0],
    [shares]
  );
  const mood = useMemo(() => averageMood(windowed), [windowed]);
  const delta = useMemo(() => moodDelta(windowed), [windowed]);
  const patternCount = useMemo(
    () => new Set(windowed.flatMap((insight) => insight.patterns)).size,
    [windowed]
  );
  const shiftCount = useMemo(
    () => windowed.reduce((sum, insight) => sum + insight.beliefShifts.length, 0),
    [windowed]
  );
  const outstanding = useMemo(() => countOutstanding(entries), [entries, insights]);
  const unwritten = useMemo(() => pendingMonths(insights, summaries), [insights, summaries]);

  const runBackfill = async () => {
    setBackfilling({ done: 0, total: outstanding });
    await backfillInsights(entries, (done, total) => setBackfilling({ done, total }));
    setBackfilling(null);
  };

  const writeMonth = async (month: string) => {
    setBusyMonth(month);
    setMonthError(null);
    try {
      await generateMonthlySummary(month, insights);
    } catch (error: any) {
      setMonthError(error?.message || 'Could not write that summary.');
    } finally {
      setBusyMonth(null);
    }
  };

  const hasData = insights.length > 0;

  return (
    <div id="analytics-view" className="flex-1 min-h-0 overflow-y-auto bg-slate-50">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Analytics</h1>
            <p className="mt-1 text-sm text-slate-600">
              What you write about, how it feels, and what has changed.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-slate-200 bg-surface p-0.5 shadow-xs">
              {RANGES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setRange(option.id)}
                  aria-pressed={range === option.id}
                  className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-colors cursor-pointer ${
                    range === option.id
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {outstanding > 0 && (
              <button
                type="button"
                onClick={runBackfill}
                disabled={backfilling !== null}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-accent-fg shadow-xs transition-colors cursor-pointer hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
              >
                {backfilling ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Analysing {backfilling.done}/{backfilling.total}
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3.5 w-3.5" />
                    Analyse {outstanding} {outstanding === 1 ? 'entry' : 'entries'}
                  </>
                )}
              </button>
            )}
          </div>
        </header>

        {!hasData ? (
          <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-surface/50 px-6 py-14 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <Sparkles className="h-5 w-5" />
            </span>
            <h2 className="mt-4 text-base font-bold tracking-tight text-slate-900">
              Nothing analysed yet
            </h2>
            <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-slate-600">
              {entries.length === 0
                ? 'Write your first reflection and it will be read for domains, mood and patterns a moment after you save.'
                : 'Your reflections have not been analysed yet. Run the pass above and the charts will fill in.'}
            </p>
          </div>
        ) : (
          <>
            <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat
                label="Analysed"
                value={String(windowed.length)}
                hint={`of ${entries.length} ${entries.length === 1 ? 'reflection' : 'reflections'}`}
              />
              <Stat
                label="Most on your mind"
                value={leading && leading.total > 0 ? leading.label : '—'}
                hint={leading && leading.total > 0 ? `${Math.round(leading.share * 100)}% of what you write` : undefined}
              />
              <Stat
                label="Average mood"
                value={mood.valence >= 0 ? `+${mood.valence.toFixed(2)}` : mood.valence.toFixed(2)}
                tint={valenceColor(mood.valence, isDark)}
                hint={
                  delta === null
                    ? 'needs a few more entries'
                    : `${delta >= 0 ? 'up' : 'down'} ${Math.abs(delta).toFixed(2)} across the window`
                }
              />
              <Stat
                label="Tracked"
                value={`${patternCount} / ${shiftCount}`}
                hint="patterns / belief shifts"
              />
            </div>

            <div className="mt-6 space-y-5">
              <Panel
                icon={<Compass className="h-3.5 w-3.5" />}
                title="What you write about"
                description="One dot per reflection, placed on the domain it belongs to. Size is how worked-through it was; colour is how it felt. The bars are the same dots collapsed into a share."
              >
                <DomainConstellation insights={windowed} onSelectEntry={onSelectEntry} />
              </Panel>

              <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
                <Panel
                  icon={<Activity className="h-3.5 w-3.5" />}
                  title="How it has felt"
                  description="Mood per entry against a smoothed trend. Above the line is bright, below is heavy."
                >
                  <MoodRibbon insights={windowed} />
                </Panel>

                <Panel
                  icon={<BarChart3 className="h-3.5 w-3.5" />}
                  title="Where you sit"
                  description="Mood against energy. The quadrant matters more than the average."
                >
                  <MoodField insights={windowed} />
                </Panel>
              </div>

              <Panel
                icon={<Shuffle className="h-3.5 w-3.5" />}
                title="What you have changed your mind about"
                description="Positions you moved away from, and what replaced them."
              >
                <BeliefLedger insights={windowed} />
              </Panel>

              <Panel
                icon={<Repeat className="h-3.5 w-3.5" />}
                title="What keeps coming back"
                description="Patterns that surfaced in more than one reflection, by the month they appeared in."
              >
                <PatternGrid insights={windowed} />
              </Panel>

              <Panel
                icon={<Sparkles className="h-3.5 w-3.5" />}
                title="Month by month"
                description="A written retrospective for each finished month, kept so you can read the year back."
              >
                <MonthTimeline
                  summaries={summaries}
                  pending={unwritten}
                  busyMonth={busyMonth}
                  error={monthError}
                  onGenerate={writeMonth}
                />
              </Panel>
            </div>

            <p className="mt-5 px-1 text-[11px] leading-relaxed text-slate-500">
              Readings are produced by a lightweight model pass over your own words and stored under
              your account. Domains come from a fixed vocabulary of{' '}
              {Object.keys(DOMAIN_BY_ID).length}, so they stay comparable month to month. Deleting a
              reflection deletes its reading.
            </p>
          </>
        )}
      </div>
    </div>
  );
};
