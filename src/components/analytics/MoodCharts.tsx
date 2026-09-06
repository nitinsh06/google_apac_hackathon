import React, { useMemo } from 'react';
import type { EntryInsight } from '../../lib/analyticsTypes.ts';
import { moodSeries, smooth, valenceColor } from '../../lib/analyticsDerive.ts';
import { useThemeValue } from '../../lib/theme.ts';

/**
 * Mood, twice. The ribbon is how it moved; the field is where it settles.
 * Neither reads well alone — a rising line says nothing about whether the
 * writer is calm or wired, and a cloud says nothing about direction.
 */

const W = 720;
const H = 200;
const PAD = { top: 16, right: 14, bottom: 22, left: 34 };

export const MoodRibbon: React.FC<{ insights: EntryInsight[] }> = ({ insights }) => {
  const isDark = useThemeValue() === 'dark';
  const points = useMemo(() => moodSeries(insights), [insights]);
  const trend = useMemo(() => smooth(points, 5), [points]);

  const geometry = useMemo(() => {
    if (points.length === 0) return null;
    const min = points[0].t;
    const max = points[points.length - 1].t;
    const span = Math.max(1, max - min);
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;

    const x = (t: number) => PAD.left + ((t - min) / span) * plotW;
    const y = (value: number) => PAD.top + ((1 - value) / 2) * plotH;
    return { x, y, zero: PAD.top + plotH / 2, min, max };
  }, [points]);

  if (!geometry || points.length === 0) return null;

  const { x, y, zero } = geometry;
  const line = trend.map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(point.t)} ${y(point.value)}`).join(' ');
  const area = `${line} L ${x(trend[trend.length - 1].t)} ${zero} L ${x(trend[0].t)} ${zero} Z`;

  return (
    <div className="overflow-x-auto thin-scroll">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full min-w-[520px]"
        style={{ height: H }}
        role="img"
        aria-label="Mood over time"
      >
        <defs>
          <linearGradient id="mood-ribbon" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={valenceColor(0.85, isDark)} stopOpacity={0.42} />
            <stop offset="50%" stopColor={valenceColor(0, isDark)} stopOpacity={0.08} />
            <stop offset="100%" stopColor={valenceColor(-0.85, isDark)} stopOpacity={0.42} />
          </linearGradient>
          {/* Clip the fill to the baseline so above and below read differently. */}
          <clipPath id="mood-clip">
            <rect x={0} y={0} width={W} height={H} />
          </clipPath>
        </defs>

        {[1, 0.5, 0, -0.5, -1].map((value) => (
          <g key={value}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(value)}
              y2={y(value)}
              className={value === 0 ? 'stroke-slate-300' : 'stroke-slate-200'}
              strokeWidth={value === 0 ? 1.25 : 1}
              strokeDasharray={value === 0 ? undefined : '3 4'}
            />
            <text
              x={PAD.left - 8}
              y={y(value) + 3}
              textAnchor="end"
              className="fill-slate-400"
              style={{ fontSize: 9 }}
            >
              {value > 0 ? `+${value}` : value}
            </text>
          </g>
        ))}

        <path d={area} fill="url(#mood-ribbon)" clipPath="url(#mood-clip)" />
        <path d={line} fill="none" stroke={valenceColor(0.2, isDark)} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" opacity={0.55} />

        {points.map((point) => (
          <circle
            key={point.insight.entryId + point.t}
            cx={x(point.t)}
            cy={y(point.valence)}
            r={2.6 + point.insight.depth * 2.4}
            fill={valenceColor(point.valence, isDark)}
            stroke={isDark ? '#0c0c0e' : '#ffffff'}
            strokeWidth={1}
          >
            <title>
              {`${point.insight.entryTitle} — ${point.insight.sentiment}`}
            </title>
          </circle>
        ))}

        <text x={PAD.left} y={H - 6} className="fill-slate-400" style={{ fontSize: 9 }}>
          {new Date(geometry.min).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </text>
        <text x={W - PAD.right} y={H - 6} textAnchor="end" className="fill-slate-400" style={{ fontSize: 9 }}>
          {new Date(geometry.max).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </text>
      </svg>
    </div>
  );
};

const FIELD = 260;

/**
 * Valence against energy. The quadrant a writer lives in says more than an
 * average does: "low mood" is a very different month when it is agitated
 * rather than flat.
 */
export const MoodField: React.FC<{ insights: EntryInsight[] }> = ({ insights }) => {
  const isDark = useThemeValue() === 'dark';
  const pad = 30;
  const size = FIELD - pad * 2;

  const x = (valence: number) => pad + ((valence + 1) / 2) * size;
  const y = (energy: number) => pad + (1 - energy) * size;

  // Pushed into the corners and drawn under the dots: they name the space, and
  // a label that competes with the data it describes is worse than no label.
  const quadrants = [
    { label: 'Agitated', at: [0.13, 0.07], anchor: 'start' as const },
    { label: 'Driven', at: [0.87, 0.07], anchor: 'end' as const },
    { label: 'Flat', at: [0.13, 0.96], anchor: 'start' as const },
    { label: 'Calm', at: [0.87, 0.96], anchor: 'end' as const },
  ];

  if (insights.length === 0) return null;

  return (
    <svg
      viewBox={`0 0 ${FIELD} ${FIELD}`}
      className="mx-auto w-full max-w-[280px]"
      role="img"
      aria-label="Mood distribution by valence and energy"
    >
      <rect x={pad} y={pad} width={size} height={size} rx={10} className="fill-slate-100" opacity={0.6} />

      {quadrants.map((quadrant) => (
        <text
          key={quadrant.label}
          x={pad + quadrant.at[0] * size}
          y={pad + quadrant.at[1] * size}
          textAnchor={quadrant.anchor}
          className="fill-slate-400"
          style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase' }}
        >
          {quadrant.label}
        </text>
      ))}

      <line x1={pad + size / 2} x2={pad + size / 2} y1={pad} y2={pad + size} className="stroke-slate-300" strokeDasharray="3 4" />
      <line x1={pad} x2={pad + size} y1={pad + size / 2} y2={pad + size / 2} className="stroke-slate-300" strokeDasharray="3 4" />

      {insights.map((insight) => (
        <circle
          key={insight.entryId}
          cx={x(insight.valence)}
          cy={y(insight.energy)}
          r={3 + insight.depth * 3.5}
          fill={valenceColor(insight.valence, isDark)}
          opacity={0.72}
          stroke={isDark ? '#0c0c0e' : '#ffffff'}
          strokeWidth={1}
        >
          <title>{`${insight.entryTitle} — ${insight.sentiment}`}</title>
        </circle>
      ))}

      <text x={pad} y={FIELD - 8} className="fill-slate-500" style={{ fontSize: 9, fontWeight: 600 }}>
        heavy
      </text>
      <text x={pad + size} y={FIELD - 8} textAnchor="end" className="fill-slate-500" style={{ fontSize: 9, fontWeight: 600 }}>
        bright
      </text>
      <text
        x={12}
        y={pad + size / 2}
        textAnchor="middle"
        className="fill-slate-500"
        style={{ fontSize: 9, fontWeight: 600 }}
        transform={`rotate(-90 12 ${pad + size / 2})`}
      >
        energy
      </text>
    </svg>
  );
};
