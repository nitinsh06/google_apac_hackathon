import React from 'react';
import { ArrowRight, Loader2, Sparkles, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { DOMAIN_BY_ID, monthLabel } from '../../lib/analyticsTypes.ts';
import type { MonthlySummary } from '../../lib/analyticsTypes.ts';
import { domainColor, valenceColor } from '../../lib/analyticsDerive.ts';
import { useThemeValue } from '../../lib/theme.ts';

/**
 * The year, read downward. Each closed month gets one card on a spine, so a
 * long stretch of journalling becomes something you can scroll rather than
 * something you have to remember.
 */

interface Props {
  summaries: MonthlySummary[];
  pending: string[];
  busyMonth: string | null;
  error: string | null;
  onGenerate: (month: string) => void;
}

const TREND_ICON = {
  rising: TrendingUp,
  falling: TrendingDown,
  steady: Minus,
} as const;

export const MonthTimeline: React.FC<Props> = ({
  summaries,
  pending,
  busyMonth,
  error,
  onGenerate,
}) => {
  const isDark = useThemeValue() === 'dark';

  if (summaries.length === 0 && pending.length === 0) {
    return (
      <p className="px-1 py-6 text-center text-xs leading-relaxed text-slate-500">
        Monthly summaries are written once a month is over. Keep journalling and the first one will
        appear here at the turn of the month.
      </p>
    );
  }

  return (
    <div className="relative">
      {error && (
        <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </p>
      )}

      {pending.length > 0 && (
        <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-3.5">
          <p className="text-xs font-semibold text-slate-800">
            {pending.length === 1
              ? '1 finished month has not been summarised yet'
              : `${pending.length} finished months have not been summarised yet`}
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {pending.map((month) => (
              <button
                key={month}
                type="button"
                onClick={() => onGenerate(month)}
                disabled={busyMonth !== null}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1.5 text-[11px] font-semibold text-accent-fg transition-colors cursor-pointer hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busyMonth === month ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                {monthLabel(month)}
              </button>
            ))}
          </div>
        </div>
      )}

      <ol className="relative space-y-4 border-l border-slate-200 pl-6">
        {summaries.map((summary) => {
          const TrendIcon = TREND_ICON[summary.trend];
          return (
            <li key={summary.month} className="relative">
              <span
                className="absolute -left-[30px] top-5 flex h-3 w-3 items-center justify-center rounded-full ring-4 ring-slate-50"
                style={{ backgroundColor: valenceColor(summary.valence, isDark) }}
              />

              <article className="rounded-xl border border-slate-200 bg-surface p-4 shadow-xs sm:p-5">
                <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      {monthLabel(summary.month)} · {summary.entryCount}{' '}
                      {summary.entryCount === 1 ? 'reflection' : 'reflections'}
                    </p>
                    <h3 className="mt-0.5 text-base font-bold tracking-tight text-slate-900">
                      {summary.headline}
                    </h3>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                    <TrendIcon className="h-3 w-3" />
                    {summary.trend}
                  </span>
                </header>

                <p className="mt-2.5 text-sm leading-relaxed text-slate-700">{summary.narrative}</p>

                {summary.topDomains.length > 0 && (
                  <div className="mt-3.5 flex h-1.5 w-full overflow-hidden rounded-full">
                    {summary.topDomains.map((domain) => (
                      <div
                        key={domain.id}
                        style={{
                          width: `${domain.weight * 100}%`,
                          backgroundColor: domainColor(DOMAIN_BY_ID[domain.id]?.hue ?? 210, isDark),
                        }}
                        title={`${DOMAIN_BY_ID[domain.id]?.label ?? domain.id} · ${Math.round(domain.weight * 100)}%`}
                      />
                    ))}
                  </div>
                )}
                {summary.topDomains.length > 0 && (
                  <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-semibold text-slate-500">
                    {summary.topDomains.map((domain) => (
                      <span key={domain.id} className="inline-flex items-center gap-1">
                        <span
                          className="inline-block h-1.5 w-1.5 rounded-full"
                          style={{
                            backgroundColor: domainColor(DOMAIN_BY_ID[domain.id]?.hue ?? 210, isDark),
                          }}
                        />
                        {DOMAIN_BY_ID[domain.id]?.label ?? domain.id}
                      </span>
                    ))}
                  </p>
                )}

                {(summary.emergingPatterns.length > 0 || summary.fadingPatterns.length > 0) && (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {summary.emergingPatterns.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                          Taking hold
                        </p>
                        <ul className="mt-1 space-y-0.5">
                          {summary.emergingPatterns.map((pattern) => (
                            <li key={pattern} className="text-xs text-slate-700">
                              {pattern}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {summary.fadingPatterns.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                          Letting go
                        </p>
                        <ul className="mt-1 space-y-0.5">
                          {summary.fadingPatterns.map((pattern) => (
                            <li key={pattern} className="text-xs text-slate-500 line-through decoration-slate-300">
                              {pattern}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {summary.beliefShifts.length > 0 && (
                  <ul className="mt-4 space-y-1.5">
                    {summary.beliefShifts.map((shift, index) => (
                      <li
                        key={index}
                        className="flex flex-wrap items-center gap-1.5 text-[11px] leading-relaxed"
                      >
                        <span className="text-slate-500 line-through decoration-slate-300">
                          {shift.from}
                        </span>
                        <ArrowRight className="h-3 w-3 shrink-0 text-slate-400" />
                        <span className="font-medium text-slate-800">{shift.to}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {summary.question && (
                  <p className="mt-4 border-l-2 border-blue-300 pl-3 text-xs italic leading-relaxed text-slate-600">
                    {summary.question}
                  </p>
                )}
              </article>
            </li>
          );
        })}
      </ol>
    </div>
  );
};
