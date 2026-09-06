import React, { useEffect, useId, useMemo, useRef } from 'react';
import { DOMAIN_BY_ID, monthLabel } from '../lib/analyticsTypes.ts';
import type { DomainId } from '../lib/analyticsTypes.ts';
import { RARITIES, levelProgress } from '../lib/cardTypes.ts';
import type { JournalCard as CardData } from '../lib/cardTypes.ts';

/**
 * The card.
 *
 * A trinket, so it is built like one: fixed portrait proportions, a foil frame
 * whose colour and intensity are set by rarity, a plate of stats, and an emblem
 * generated from the owner's own domain distribution — every card genuinely
 * differs because the art is the data.
 *
 * The tilt follows the pointer and is pure decoration, so it is written
 * straight to the node's custom properties rather than through state (a
 * pointermove should not re-render an SVG), and it degrades to a flat card
 * under `prefers-reduced-motion` and on touch, where there is no hover.
 */

interface Props {
  card: CardData;
  /**
   * Renders small enough for a list or a preview strip. The card drops its
   * legend and date line at this size rather than shrinking them past reading.
   */
  compact?: boolean;
  /**
   * Heading level for the card title. The card is a section of a larger page
   * in the owner's panel and the entire subject of the public page, so the
   * document outline has to be settled by the caller, not assumed here.
   */
  headingLevel?: 1 | 2 | 3;
  /** Extra classes on the card root, for a caller-owned reveal. */
  className?: string;
}

const STAT_LINES: Array<{ key: keyof CardData['stats']; label: string; hint: string }> = [
  { key: 'entries', label: 'Reflections', hint: 'Entries written' },
  { key: 'places', label: 'Places', hint: 'Distinct places pinned' },
  { key: 'months', label: 'Months', hint: 'Months with at least one entry' },
  { key: 'shifts', label: 'Shifts', hint: 'Beliefs that changed' },
];

/** The three domains named in the legend, plus whatever else is left over. */
function barSegments(card: CardData) {
  const named = card.topDomains.slice(0, 3);
  const rest = 1 - named.reduce((sum, domain) => sum + domain.weight, 0);
  return { named, rest: rest > 0.01 ? rest : 0 };
}

const domainColour = (id: DomainId) => `hsl(${DOMAIN_BY_ID[id]?.hue ?? 210} 70% 58%)`;

/**
 * The emblem: one soft bloom per domain, placed around a circle and sized by
 * how much of the journal that domain is. Screen-blended so overlaps glow.
 */
const Emblem: React.FC<{ card: CardData; uid: string }> = ({ card, uid }) => {
  const petals = card.topDomains.length
    ? card.topDomains
    : [{ id: 'inner-life' as const, weight: 1 }];

  return (
    <svg viewBox="0 0 200 200" className="h-full w-full" aria-hidden>
      <defs>
        <radialGradient id={`core-${uid}`}>
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <filter id={`soft-${uid}`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>

      <g style={{ mixBlendMode: 'screen' }} filter={`url(#soft-${uid})`}>
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

      <circle cx="100" cy="100" r="34" fill={`url(#core-${uid})`} opacity={0.5} />
    </svg>
  );
};

export const JournalCard: React.FC<Props> = ({
  card,
  compact = false,
  headingLevel = 3,
  className = '',
}) => {
  const root = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);
  const point = useRef({ x: 0, y: 0 });
  const uid = useId().replace(/:/g, '');

  const rarity = RARITIES[card.rarity] ?? RARITIES.common;
  const { progress, toNext } = useMemo(() => levelProgress(card.score), [card.score]);
  const { named, rest } = useMemo(() => barSegments(card), [card]);
  const Title = `h${headingLevel}` as 'h1' | 'h2' | 'h3';

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);

  /** Writes the pointer's position onto the node, one frame at a time. */
  const paintTilt = () => {
    frame.current = null;
    const node = root.current;
    if (!node) return;
    const { x, y } = point.current;
    node.style.setProperty('--tilt-x', `${y * -9}deg`);
    node.style.setProperty('--tilt-y', `${x * 11}deg`);
    node.style.setProperty('--foil-x', `${50 + x * 100}%`);
    node.style.setProperty('--foil-y', `${50 + y * 100}%`);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (event.pointerType === 'touch' || !root.current) return;
    const rect = root.current.getBoundingClientRect();
    point.current = {
      x: (event.clientX - rect.left) / rect.width - 0.5,
      y: (event.clientY - rect.top) / rect.height - 0.5,
    };
    root.current.dataset.active = '';
    if (frame.current === null) frame.current = requestAnimationFrame(paintTilt);
  };

  const onPointerLeave = () => {
    const node = root.current;
    if (!node) return;
    point.current = { x: 0, y: 0 };
    delete node.dataset.active;
    if (frame.current === null) frame.current = requestAnimationFrame(paintTilt);
  };

  const [h1, h2, h3] = rarity.hues;

  return (
    <div
      ref={root}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      className={`jm-card ${className}`.trim()}
      data-tier={rarity.tier}
      data-compact={compact ? '' : undefined}
      style={
        {
          '--h1': h1,
          '--h2': h2,
          '--h3': h3,
          '--sat': rarity.sat,
          '--tier': rarity.tier,
          '--card-max': compact ? '224px' : '320px',
        } as React.CSSProperties
      }
    >
      <div className="jm-card__frame">
        <div className="jm-card__inner">
          {/* Header */}
          <header className="jm-card__head">
            <Title className="jm-card__title">{card.title}</Title>
            <div className="jm-card__level">
              <span className="sr-only">Level {card.level}</span>
              <span className="jm-card__level-num" aria-hidden>
                {card.level}
              </span>
              <span className="jm-card__level-word" aria-hidden>
                LVL
              </span>
            </div>
          </header>

          {/* Art */}
          <div className="jm-card__art">
            <Emblem card={card} uid={uid} />
            <span className="jm-card__set">ReflectAI</span>
            <span className="jm-card__rarity">{rarity.label}</span>
          </div>

          {/* Domain distribution */}
          {named.length > 0 && (
            <div className="jm-card__domains">
              <div className="jm-card__bar">
                {named.map((domain) => (
                  <span
                    key={domain.id}
                    style={{
                      width: `${domain.weight * 100}%`,
                      background: domainColour(domain.id),
                    }}
                  />
                ))}
                {rest > 0 && (
                  <span
                    className="jm-card__bar-rest"
                    style={{ width: `${rest * 100}%` }}
                  />
                )}
              </div>
              <p className="jm-card__domain-labels">
                {named.map((domain) => (
                  <span key={domain.id}>
                    <i style={{ background: domainColour(domain.id) }} />
                    {DOMAIN_BY_ID[domain.id]?.label ?? domain.id}
                    <b>{Math.round(domain.weight * 100)}%</b>
                  </span>
                ))}
              </p>
            </div>
          )}

          {/* Stats plate */}
          <dl className="jm-card__stats">
            {STAT_LINES.map((line) => (
              <div key={line.key} title={line.hint}>
                <dt>{line.label}</dt>
                <dd>{card.stats[line.key]}</dd>
              </div>
            ))}
          </dl>

          {/* Footer */}
          <footer className="jm-card__foot">
            <div
              className="jm-card__xp"
              role="progressbar"
              aria-label={`Progress to level ${card.level + 1}`}
              aria-valuenow={Math.round(progress * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <div className="jm-card__meta">
              <span className="truncate">{card.displayName || 'Anonymous journaler'}</span>
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
