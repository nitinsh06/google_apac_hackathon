import React, { useMemo, useRef, useState } from 'react';
import { DOMAINS } from '../../lib/analyticsTypes.ts';
import type { EntryInsight } from '../../lib/analyticsTypes.ts';
import { domainColor, domainShares, valenceColor } from '../../lib/analyticsDerive.ts';
import { useThemeValue } from '../../lib/theme.ts';

/**
 * Every reflection as one dot: time across, domain down, size by how worked-
 * through it was, colour by how it felt. The bars on the right are the same
 * data collapsed onto one axis, so "what do I keep coming back to" is legible
 * before you read a single label.
 */

interface Props {
  insights: EntryInsight[];
  onSelectEntry?: (entryId: string) => void;
}

const LANE_HEIGHT = 34;
const PAD_LEFT = 108;
const PAD_RIGHT = 92;
const PAD_TOP = 26;
const PAD_BOTTOM = 26;
const WIDTH = 900;

export const DomainConstellation: React.FC<Props> = ({ insights, onSelectEntry }) => {
  const theme = useThemeValue();
  const isDark = theme === 'dark';
  const [hover, setHover] = useState<{ x: number; y: number; insight: EntryInsight } | null>(null);
  const frame = useRef<HTMLDivElement>(null);

  const shares = useMemo(() => domainShares(insights), [insights]);
  const lanes = useMemo(
    () =>
      [...shares]
        .sort((a, b) => b.total - a.total)
        .filter((share, index) => share.total > 0 || index < 4),
    [shares]
  );

  const dots = useMemo(() => {
    const times = insights
      .map((insight) => Date.parse(insight.entryCreatedAt))
      .filter(Number.isFinite);
    if (times.length === 0) return [];

    const min = Math.min(...times);
    const max = Math.max(...times);
    const span = Math.max(1, max - min);
    // Inset both ends so the earliest dot clears its lane label and the latest
    // clears the share bars, rather than sitting half on top of them.
    const gutter = 14;
    const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT - gutter * 2;

    return insights.flatMap((insight) => {
      const t = Date.parse(insight.entryCreatedAt);
      if (!Number.isFinite(t)) return [];
      const x = PAD_LEFT + gutter + ((t - min) / span) * plotWidth;

      // One dot per domain the entry touches, faded by how much of the entry
      // that domain actually was — a passing mention should not read as a theme.
      return insight.domains.flatMap((domain) => {
        const laneIndex = lanes.findIndex((lane) => lane.id === domain.id);
        if (laneIndex < 0) return [];
        return [
          {
            key: `${insight.entryId}-${domain.id}`,
            x,
            y: PAD_TOP + laneIndex * LANE_HEIGHT + LANE_HEIGHT / 2,
            r: 3.5 + insight.depth * 7 * (0.55 + domain.weight * 0.45),
            opacity: 0.35 + domain.weight * 0.6,
            fill: valenceColor(insight.valence, isDark),
            insight,
          },
        ];
      });
    });
  }, [insights, lanes, isDark]);

  const height = PAD_TOP + lanes.length * LANE_HEIGHT + PAD_BOTTOM;
  const maxShare = Math.max(0.0001, ...lanes.map((lane) => lane.share));

  const timeTicks = useMemo(() => {
    const times = insights.map((i) => Date.parse(i.entryCreatedAt)).filter(Number.isFinite);
    if (times.length < 2) return [];
    const min = Math.min(...times);
    const max = Math.max(...times);
    const gutter = 14;
    const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT - gutter * 2;
    return [0, 0.5, 1].map((fraction) => ({
      x: PAD_LEFT + gutter + fraction * plotWidth,
      label: new Date(min + (max - min) * fraction).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      }),
    }));
  }, [insights]);

  if (insights.length === 0) return null;

  return (
    <div ref={frame} className="relative">
      <div className="overflow-x-auto thin-scroll">
        <svg
          viewBox={`0 0 ${WIDTH} ${height}`}
          className="w-full min-w-[640px]"
          style={{ height }}
          role="img"
          aria-label="Reflections plotted by domain over time"
        >
          {lanes.map((lane, index) => {
            const y = PAD_TOP + index * LANE_HEIGHT + LANE_HEIGHT / 2;
            return (
              <g key={lane.id}>
                {index % 2 === 0 && (
                  <rect
                    x={0}
                    y={y - LANE_HEIGHT / 2}
                    width={WIDTH}
                    height={LANE_HEIGHT}
                    className="fill-slate-100"
                    opacity={0.55}
                  />
                )}
                <line
                  x1={PAD_LEFT}
                  x2={WIDTH - PAD_RIGHT}
                  y1={y}
                  y2={y}
                  stroke={domainColor(lane.hue, isDark, 0.22)}
                  strokeWidth={1}
                />
                <text
                  x={PAD_LEFT - 12}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-slate-600"
                  style={{ fontSize: 11, fontWeight: 600 }}
                >
                  {lane.label}
                </text>
                <circle cx={PAD_LEFT - 100} cy={y} r={3.5} fill={domainColor(lane.hue, isDark)} />

                {/* Marginal share: the same dots, collapsed onto one axis. */}
                <rect
                  x={WIDTH - PAD_RIGHT + 12}
                  y={y - 6}
                  width={Math.max(1.5, (lane.share / maxShare) * (PAD_RIGHT - 46))}
                  height={12}
                  rx={3}
                  fill={domainColor(lane.hue, isDark, 0.8)}
                />
                <text
                  x={WIDTH - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-slate-500"
                  style={{ fontSize: 10, fontVariantNumeric: 'tabular-nums' }}
                >
                  {Math.round(lane.share * 100)}%
                </text>
              </g>
            );
          })}

          {timeTicks.map((tick) => (
            <text
              key={tick.label + tick.x}
              x={tick.x}
              y={height - 8}
              textAnchor="middle"
              className="fill-slate-400"
              style={{ fontSize: 10 }}
            >
              {tick.label}
            </text>
          ))}

          {dots.map((dot) => (
            <circle
              key={dot.key}
              cx={dot.x}
              cy={dot.y}
              r={dot.r}
              fill={dot.fill}
              opacity={dot.opacity}
              stroke={isDark ? '#0c0c0e' : '#ffffff'}
              strokeWidth={1.25}
              className="cursor-pointer transition-[r] duration-150"
              onMouseEnter={() =>
                setHover({
                  x: (dot.x / WIDTH) * 100,
                  y: dot.y,
                  insight: dot.insight,
                })
              }
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelectEntry?.(dot.insight.entryId)}
            />
          ))}
        </svg>
      </div>

      {hover && (
        <div
          className="pointer-events-none absolute z-20 w-60 -translate-x-1/2 rounded-lg border border-slate-200 bg-surface p-2.5 shadow-lg shadow-scrim/20"
          style={{
            left: `${Math.min(88, Math.max(12, hover.x))}%`,
            top: hover.y + 14,
          }}
        >
          <p className="truncate text-xs font-bold text-slate-900">{hover.insight.entryTitle}</p>
          <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-slate-600">
            {hover.insight.summary}
          </p>
          <p className="mt-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: valenceColor(hover.insight.valence, isDark) }}
            />
            {hover.insight.sentiment}
            <span className="text-slate-300">·</span>
            {new Date(hover.insight.entryCreatedAt).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            })}
          </p>
        </div>
      )}
    </div>
  );
};
