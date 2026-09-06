import React, { useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import { DOMAIN_BY_ID, monthLabel } from '../../lib/analyticsTypes.ts';
import type { EntryInsight } from '../../lib/analyticsTypes.ts';
import { datedShifts, domainColor, monthSpan, patternRows } from '../../lib/analyticsDerive.ts';
import { useThemeValue } from '../../lib/theme.ts';

/**
 * Recurrence, not frequency. A pattern that shows up once is an anecdote; the
 * grid only earns its space by showing which ones persist, and where they stop.
 */
export const PatternGrid: React.FC<{ insights: EntryInsight[] }> = ({ insights }) => {
  const isDark = useThemeValue() === 'dark';
  const rows = useMemo(() => patternRows(insights, 8), [insights]);
  const months = useMemo(() => monthSpan(insights).slice(-12), [insights]);

  if (rows.length === 0) {
    return (
      <p className="px-1 py-6 text-center text-xs leading-relaxed text-slate-500">
        No pattern has recurred yet. Once a behaviour shows up in more than one reflection, it
        appears here with the months it surfaced in.
      </p>
    );
  }

  const peak = Math.max(...rows.flatMap((row) => [...row.byMonth.values()]));

  return (
    <div className="overflow-x-auto thin-scroll">
      <table className="w-full min-w-[520px] border-collapse">
        <thead>
          <tr>
            <th className="w-[42%] pb-2 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Recurring pattern
            </th>
            {months.map((month) => (
              <th
                key={month}
                className="pb-2 text-center text-[10px] font-semibold text-slate-400"
                title={monthLabel(month)}
              >
                {monthLabel(month).slice(0, 3)}
              </th>
            ))}
            <th className="pb-2 pl-2 text-right text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.pattern} className="border-t border-slate-200">
              <td className="py-1.5 pr-3 text-xs font-medium text-slate-800">{row.pattern}</td>
              {months.map((month) => {
                const count = row.byMonth.get(month) ?? 0;
                return (
                  <td key={month} className="px-0.5 py-1.5">
                    <div
                      title={count ? `${count} in ${monthLabel(month)}` : monthLabel(month)}
                      className="mx-auto h-5 w-full max-w-[26px] rounded"
                      style={{
                        backgroundColor: count
                          ? `hsl(${isDark ? 190 : 205} 70% ${isDark ? 30 + (count / peak) * 34 : 88 - (count / peak) * 44}%)`
                          : undefined,
                      }}
                    >
                      {!count && <div className="h-full w-full rounded bg-slate-100" />}
                    </div>
                  </td>
                );
              })}
              <td className="py-1.5 pl-2 text-right text-xs font-bold tabular-nums text-slate-700">
                {row.total}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/**
 * Belief shifts read as a ledger, not a chart: there are few of them, each one
 * matters, and the interesting content is the sentence on either side of the
 * arrow. Ordered newest first, because the recent ones are still live.
 */
export const BeliefLedger: React.FC<{ insights: EntryInsight[] }> = ({ insights }) => {
  const isDark = useThemeValue() === 'dark';
  const shifts = useMemo(() => datedShifts(insights), [insights]);

  if (shifts.length === 0) {
    return (
      <p className="px-1 py-6 text-center text-xs leading-relaxed text-slate-500">
        Nothing yet. When a reflection shows you moving from one position to another — "I used to
        think… now I think…" — the change is recorded here with the entry it came from.
      </p>
    );
  }

  return (
    <ol className="divide-y divide-slate-200">
      {shifts.slice(0, 12).map((shift, index) => {
        const domain = DOMAIN_BY_ID[shift.domain];
        return (
          <li key={`${shift.entryId}-${index}`} className="py-3.5 first:pt-1">
            <div className="mb-2 flex items-center gap-2">
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: domainColor(domain?.hue ?? 210, isDark) }}
              />
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                {domain?.label ?? 'General'}
              </span>
              <span className="text-[10px] text-slate-400">
                {new Date(shift.at).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
              {shift.confidence < 0.5 && (
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500">
                  Tentative
                </span>
              )}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
              <p className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-500 line-through decoration-slate-300">
                {shift.from}
              </p>
              <span className="flex shrink-0 items-center justify-center text-slate-400">
                <ArrowRight className="h-3.5 w-3.5 rotate-90 sm:rotate-0" />
              </span>
              <p className="flex-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium leading-relaxed text-slate-800">
                {shift.to}
              </p>
            </div>

            <p className="mt-1.5 truncate text-[11px] text-slate-500">from “{shift.entryTitle}”</p>
          </li>
        );
      })}
    </ol>
  );
};
