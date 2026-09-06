import React, { useMemo, useRef, useState } from 'react';
import { DOMAIN_BY_ID, monthLabel } from '../lib/analyticsTypes.ts';
import { RARITIES, levelProgress } from '../lib/cardTypes.ts';
import type { JournalCard as CardData } from '../lib/cardTypes.ts';

/**
 * The card.
 *
 * A trinket, so it is built like one: fixed portrait proportions, a foil frame
 * whose hue is set by rarity, a plate of stats, and an emblem generated from
 * the owner's own domain distribution — every card genuinely differs because
 * the art is the data.
 *
 * The tilt follows the pointer and is pure decoration, so it degrades to a flat
 * card under `prefers-reduced-motion` and on touch, where there is no hover.
 */

interface Props {
  card: CardData;
  /** Renders at half scale for tight spaces. */
  compact?: boolean;
}

const STAT_LINES: Array<{ key: keyof CardData['stats']; label: string }> = [
  { key: 'entries', label: 'Reflections' },
  { key: 'places', label: 'Places' },
  { key: 'months', label: 'Months' },
  { key: 'shifts', label: 'Shifts' },
];

/**
 * The emblem: one soft bloom per domain, placed around a circle and sized by
 * how much of the journal that domain is. Screen-blended so overlaps glow.
 */
const Emblem: React.FC<{ card: CardData }> = ({ card }) => {
  const petals = card.topDomains.length
    ? card.topDomains
    : [{ id: 'inner-life' as const, weight: 1 }];

  return (
    <svg viewBox="0 0 200 200" className="h-full w-full" aria-hidden>
      <defs>
        <radialGradient id={`core-${card.slug}`}>
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <filter id={`soft-${card.slug}`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>

      <g style={{ mixBlendMode: 'screen' }} filter={`url(#soft-${card.slug})`}>
        {petals.map((petal, index) => {
          const meta = DOMAIN_BY_ID[petal.id];
          const angle = (index / petals.length) * Math.PI * 2 - Math.PI / 2;
          // One bloom has nothing to arrange itself around — centre it rather
          // than pushing a solitary blob to the top of the window.
          const distance = petals.length === 1 ? 0 : 26 + petal.weight * 20;
          const radius = petals.length === 1 ? 46 : 20 + petal.weight * 40;
          return (
            <circle
              key={petal.id}
              cx={100 + Math.cos(angle) * distance}
              cy={100 + Math.sin(angle) * distance}
              r={radius}
              fill={`hsl(${meta?.hue ?? 210} 85% 62%)`}
              opacity={0.55 + petal.weight * 0.4}
            />
          );
        })}
      </g>

      {/* Orbit ring: one mark per place pinned, capped so it stays a ring. */}
      {card.stats.places > 0 && (
        <g opacity={0.5}>
          {Array.from({ length: Math.min(card.stats.places, 18) }).map((_, index, all) => {
            const angle = (index / all.length) * Math.PI * 2;
            return (
              <circle
                key={index}
                cx={100 + Math.cos(angle) * 78}
                cy={100 + Math.sin(angle) * 78}
                r={1.8}
                fill="#ffffff"
              />
            );
          })}
        </g>
      )}

      <circle cx="100" cy="100" r="34" fill={`url(#core-${card.slug})`} opacity={0.5} />
    </svg>
  );
};

export const JournalCard: React.FC<Props> = ({ card, compact = false }) => {
  const frame = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0, active: false });

  const rarity = RARITIES[card.rarity] ?? RARITIES.common;
  const { progress, toNext } = useMemo(() => levelProgress(card.score), [card.score]);

  const onPointerMove = (event: React.PointerEvent) => {
    if (event.pointerType === 'touch' || !frame.current) return;
    const rect = frame.current.getBoundingClientRect();
    setTilt({
      x: (event.clientX - rect.left) / rect.width - 0.5,
      y: (event.clientY - rect.top) / rect.height - 0.5,
      active: true,
    });
  };

  const [h1, h2, h3] = rarity.hues;

  return (
    <div
      ref={frame}
      onPointerMove={onPointerMove}
      onPointerLeave={() => setTilt({ x: 0, y: 0, active: false })}
      className="jm-card"
      style={
        {
          '--tilt-x': `${tilt.y * -9}deg`,
          '--tilt-y': `${tilt.x * 11}deg`,
          '--foil-x': `${50 + tilt.x * 100}%`,
          '--foil-y': `${50 + tilt.y * 100}%`,
          '--h1': h1,
          '--h2': h2,
          '--h3': h3,
          '--card-scale': compact ? 0.62 : 1,
        } as React.CSSProperties
      }
      data-active={tilt.active ? '' : undefined}
    >
      <div className="jm-card__frame">
        <div className="jm-card__inner">
          {/* Header */}
          <header className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="jm-card__eyebrow">ReflectAI · Journal card</p>
              <h3 className="jm-card__title">{card.title}</h3>
            </div>
            <div className="jm-card__level">
              <span className="jm-card__level-num">{card.level}</span>
              <span className="jm-card__level-word">LVL</span>
            </div>
          </header>

          {/* Art */}
          <div className="jm-card__art">
            <Emblem card={card} />
            <span className="jm-card__rarity">{rarity.label}</span>
          </div>

          {/* Domain distribution */}
          {card.topDomains.length > 0 && (
            <div className="jm-card__domains">
              <div className="jm-card__bar">
                {card.topDomains.map((domain) => (
                  <span
                    key={domain.id}
                    style={{
                      width: `${domain.weight * 100}%`,
                      background: `hsl(${DOMAIN_BY_ID[domain.id]?.hue ?? 210} 70% 58%)`,
                    }}
                  />
                ))}
              </div>
              <p className="jm-card__domain-labels">
                {card.topDomains.slice(0, 3).map((domain) => (
                  <span key={domain.id}>
                    <i style={{ background: `hsl(${DOMAIN_BY_ID[domain.id]?.hue ?? 210} 70% 58%)` }} />
                    {DOMAIN_BY_ID[domain.id]?.label ?? domain.id}
                  </span>
                ))}
              </p>
            </div>
          )}

          {/* Stats plate */}
          <dl className="jm-card__stats">
            {STAT_LINES.map((line) => (
              <div key={line.key}>
                <dt>{line.label}</dt>
                <dd>{card.stats[line.key]}</dd>
              </div>
            ))}
          </dl>

          {/* Footer */}
          <footer className="jm-card__foot">
            <div className="jm-card__xp" aria-hidden>
              <span style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <div className="jm-card__meta">
              <span className="truncate">
                {card.displayName || 'Anonymous journaler'}
              </span>
              <span className="jm-card__score">{card.score.toLocaleString()} pts</span>
            </div>
            <p className="jm-card__since">
              {card.since ? `Since ${monthLabel(card.since)}` : 'New card'}
              {toNext !== null && ` · ${toNext.toLocaleString()} to level ${card.level + 1}`}
            </p>
          </footer>
        </div>

        <span aria-hidden className="jm-card__foil" />
        <span aria-hidden className="jm-card__glare" />
      </div>
    </div>
  );
};
