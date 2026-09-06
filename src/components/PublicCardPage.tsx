import React, { useEffect, useState } from 'react';
import { ArrowRight, Loader2, Sparkles } from 'lucide-react';
import { fetchPublicCard } from '../lib/card.ts';
import type { JournalCard as CardData } from '../lib/cardTypes.ts';
import { RARITIES, titleReason } from '../lib/cardTypes.ts';
import { JournalCard } from './JournalCard.tsx';
import { ThemeToggle } from './ThemeToggle.tsx';
import type { Theme } from '../lib/theme.ts';

/**
 * The public card page at `/c/:slug`.
 *
 * Renders with no session — a visitor is not signed in and must not be pushed
 * to sign in before they can see what they were sent. It reads one world-
 * readable document and nothing else.
 */
export const PublicCardPage: React.FC<{
  slug: string;
  theme: Theme;
  onToggleTheme: () => void;
}> = ({ slug, theme, onToggleTheme }) => {
  const [card, setCard] = useState<CardData | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');

  useEffect(() => {
    let live = true;
    fetchPublicCard(slug).then((found) => {
      if (!live) return;
      setCard(found);
      setState(found ? 'ready' : 'missing');
    });
    return () => {
      live = false;
    };
  }, [slug]);

  useEffect(() => {
    if (card) document.title = `${card.title} · ReflectAI card`;
    return () => {
      document.title = 'Gemini Reflection Journal';
    };
  }, [card]);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 font-sans text-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 bg-surface px-4 py-3 sm:px-6">
        <a href="/" className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-accent shadow-xs">
            <Sparkles className="h-3.5 w-3.5 stroke-[2.2] text-accent-fg" />
          </span>
          <span className="text-base font-bold tracking-tight text-slate-800">ReflectAI</span>
        </a>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} compact />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
        {state === 'loading' && (
          <div className="flex flex-col items-center gap-6">
            <div
              className="aspect-[5/7] w-[min(320px,100%)] animate-pulse rounded-[20px] bg-slate-200"
              aria-hidden
            />
            <p className="flex items-center gap-2 text-xs font-semibold text-slate-500" role="status">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading card…
            </p>
          </div>
        )}

        {state === 'missing' && (
          <div className="max-w-sm text-center">
            <h1 className="text-lg font-bold tracking-tight text-slate-900">
              This card is not available
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              The link may have been retired by its owner, or it was never published. Cards can be
              unpublished at any time.
            </p>
            <a
              href="/"
              className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-xs font-semibold text-accent-fg shadow-xs transition-colors hover:bg-accent-strong"
            >
              Start your own journal
              <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
        )}

        {state === 'ready' && card && (
          <div
            className="relative flex flex-col items-center gap-8"
            style={
              {
                '--stage-h': RARITIES[card.rarity]?.hues[0] ?? 214,
                '--stage-s': `${RARITIES[card.rarity]?.sat ?? 18}%`,
              } as React.CSSProperties
            }
          >
            {/* The stage takes its colour from the card's own rarity, so a
                legendary link does not arrive on the same flat grey as a common
                one. Explicitly stacked under the card rather than trusting
                paint order. */}
            <div
              aria-hidden
              className="pointer-events-none absolute -top-20 left-1/2 z-0 h-[26rem] w-[26rem] -translate-x-1/2 rounded-full opacity-60 blur-3xl"
              style={{
                background:
                  'radial-gradient(circle, hsl(var(--stage-h) var(--stage-s) 62%), transparent 70%)',
              }}
            />

            <div className="relative z-10 w-[min(320px,100%)]">
              <JournalCard card={card} headingLevel={1} className="jm-card--reveal" />
            </div>

            <div className="relative z-10 max-w-sm text-center">
              <p className="text-sm leading-relaxed text-slate-600">
                <strong className="font-semibold text-slate-900">
                  {card.displayName || 'An anonymous journaler'}
                </strong>{' '}
                is a <strong className="font-semibold text-slate-900">{card.title}</strong> —{' '}
                {titleReason(card.stats.places, card.topDomains[0]?.id ?? null)}
              </p>
              <p className="mt-4 text-xs leading-relaxed text-slate-500">
                Cards show counts and proportions only. Nothing that was written, and no place, is
                shared.
              </p>
              <a
                href="/"
                className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-xs font-semibold text-accent-fg shadow-xs transition-colors hover:bg-accent-strong"
              >
                Earn your own card
                <ArrowRight className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-slate-200 py-5 text-center text-xs text-slate-500">
        <p>ReflectAI · Powered by Gemini &amp; Cloud Firestore</p>
      </footer>
    </div>
  );
};
