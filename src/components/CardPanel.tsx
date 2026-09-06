import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  EyeOff,
  Globe,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { JournalEntry, UserProfile } from '../types.ts';
import type { EntryInsight } from '../lib/analyticsTypes.ts';
import { subscribeInsights } from '../lib/analytics.ts';
import {
  buildCard,
  cardUrl,
  publishCard,
  subscribeCardPointer,
  unpublishCard,
} from '../lib/card.ts';
import type { CardPointer } from '../lib/card.ts';
import { levelProgress, scoreBreakdown } from '../lib/cardTypes.ts';
import { JournalCard } from './JournalCard.tsx';

/**
 * The card, plus everything the owner needs to decide whether to share it.
 *
 * The card is always computed and always visible to its owner; publishing is a
 * separate, explicit act that copies a narrowed version into a world-readable
 * collection. The panel says plainly what does and does not travel with it,
 * because that is the only way an informed choice is possible.
 */
export const CardPanel: React.FC<{ user: UserProfile; entries: JournalEntry[] }> = ({
  user,
  entries,
}) => {
  const [insights, setInsights] = useState<EntryInsight[]>([]);
  const [pointer, setPointer] = useState<CardPointer | null>(null);
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState<'publish' | 'rotate' | 'remove' | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user.uid) return;
    const stopInsights = subscribeInsights(user.uid, setInsights);
    const stopPointer = subscribeCardPointer(user.uid, (next) => {
      setPointer(next);
      if (next) setAnonymous(next.anonymous);
    });
    return () => {
      stopInsights();
      stopPointer();
    };
  }, [user.uid]);

  const card = useMemo(
    () =>
      buildCard({
        ownerId: user.uid,
        displayName: anonymous ? '' : user.displayName ?? '',
        entries,
        insights,
        slug: pointer?.slug ?? 'preview',
      }),
    [user.uid, user.displayName, anonymous, entries, insights, pointer?.slug]
  );

  const breakdown = useMemo(() => scoreBreakdown(card.stats), [card.stats]);
  const { toNext } = useMemo(() => levelProgress(card.score), [card.score]);
  const empty = card.score === 0;

  // Backing out of the confirm step should not leave it armed for later.
  useEffect(() => {
    if (!confirmRemove) return;
    const timer = window.setTimeout(() => setConfirmRemove(false), 6000);
    return () => window.clearTimeout(timer);
  }, [confirmRemove]);

  const run = async (
    mode: 'publish' | 'rotate' | 'remove',
    action: () => Promise<unknown>
  ) => {
    setBusy(mode);
    setError(null);
    try {
      await action();
      setConfirmRemove(false);
    } catch (err: any) {
      // `permission-denied` on this collection means one thing in practice:
      // the card rules have never been deployed. Say that rather than passing
      // Firestore's own wording through, which names no recovery.
      setError(
        err?.code === 'permission-denied'
          ? 'The database refused this. The card rules in firestore.rules have not been deployed to this project yet — run `firebase deploy --only firestore:rules`.'
          : err?.message || 'That did not work. Try again.'
      );
    } finally {
      setBusy(null);
    }
  };

  const copyLink = async () => {
    if (!pointer) return;
    try {
      await navigator.clipboard.writeText(cardUrl(pointer.slug));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard can be blocked; the input below stays selectable.
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-200 bg-surface shadow-xs">
        <header className="border-b border-slate-200 px-4 py-3 sm:px-5">
          <h3 className="text-sm font-bold tracking-tight text-slate-900">Your card</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
            Earned from what you have written, where from, and how much of it changed your mind.
          </p>
        </header>

        <div className="flex flex-col items-center gap-6 px-4 py-6 sm:px-5 lg:flex-row lg:items-start lg:gap-8">
          <JournalCard card={card} />

          <div className="min-w-0 flex-1 self-stretch">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
              How this score is built
            </p>

            {empty ? (
              <p className="mt-2.5 rounded-lg border border-dashed border-slate-300 px-3.5 py-4 text-xs leading-relaxed text-slate-600">
                Nothing to weigh yet. Your first reflection starts the card — and writing from a new
                place, in a new month, or changing your mind about something all count for more than
                simply writing again.
              </p>
            ) : (
              <>
                {/* Each line carries its own share of the total, so the number is
                    a composition you can see rather than a column to add up. */}
                <dl className="mt-2.5 space-y-2.5">
                  {breakdown.map((line) => (
                    <div key={line.label}>
                      <div className="flex items-baseline justify-between gap-3">
                        <dt className="text-xs text-slate-600">
                          {line.label}
                          <span className="ml-1.5 tabular-nums text-slate-400">×{line.count}</span>
                        </dt>
                        <dd className="text-xs font-bold tabular-nums text-slate-800">
                          {line.points.toLocaleString()}
                        </dd>
                      </div>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-200">
                        <span
                          className="block h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
                          style={{ width: `${(line.points / card.score) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </dl>

                <div className="mt-3.5 flex items-baseline justify-between gap-3 border-t border-slate-200 pt-2.5">
                  <p className="text-xs font-bold text-slate-900">Total</p>
                  <p className="text-sm font-bold tabular-nums text-accent">
                    {card.score.toLocaleString()}
                  </p>
                </div>
              </>
            )}

            <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
              {toNext === null
                ? 'You are at the highest level. The card keeps counting.'
                : `${toNext.toLocaleString()} points to level ${card.level + 1}.`}{' '}
              The title comes from two things: how many places you write from, and the domain you
              return to most.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-surface shadow-xs">
        <header className="border-b border-slate-200 px-4 py-3 sm:px-5">
          <h3 className="text-sm font-bold tracking-tight text-slate-900">Share it</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
            Publishing puts a copy of the card at a public link that anyone can open.
          </p>
        </header>

        <div className="space-y-4 px-4 py-4 sm:px-5">
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700"
            >
              {error}
            </p>
          )}

          {/* Stated before the button, not after: this is the decision. */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
              What a published card contains
            </p>
            <div className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
              <p className="flex items-start gap-1.5 text-xs text-slate-700">
                <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
                Title, level, score and counts
              </p>
              <p className="flex items-start gap-1.5 text-xs text-slate-700">
                <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
                Your domain mix, as proportions
              </p>
              <p className="flex items-start gap-1.5 text-xs text-slate-500">
                <EyeOff className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
                No entries, titles or excerpts
              </p>
              <p className="flex items-start gap-1.5 text-xs text-slate-500">
                <EyeOff className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
                No place names or coordinates
              </p>
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={anonymous}
              onChange={(event) => setAnonymous(event.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 cursor-pointer accent-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            />
            <span className="text-xs leading-relaxed text-slate-700">
              Publish anonymously
              <span className="block text-[11px] text-slate-500">
                Leaves your name off the card. Republish to apply a change.
              </span>
            </span>
          </label>

          {pointer ? (
            <>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  readOnly
                  aria-label="Public link to your card"
                  value={cardUrl(pointer.slug)}
                  onFocus={(event) => event.target.select()}
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                />
                <button
                  type="button"
                  onClick={copyLink}
                  className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-accent-fg transition-colors cursor-pointer hover:bg-accent-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  <span aria-live="polite">{copied ? 'Copied' : 'Copy link'}</span>
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() =>
                    run('publish', () =>
                      publishCard({
                        entries,
                        insights,
                        displayName: user.displayName ?? '',
                        anonymous,
                        existingSlug: pointer.slug,
                      })
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-surface px-3 py-2 text-xs font-semibold text-slate-700 transition-colors cursor-pointer hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                >
                  {busy === 'publish' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Update published card
                </button>

                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() =>
                    run('rotate', () =>
                      publishCard({
                        entries,
                        insights,
                        displayName: user.displayName ?? '',
                        anonymous,
                        existingSlug: pointer.slug,
                        rotate: true,
                      })
                    )
                  }
                  title="Mints a new link and retires the old one"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-surface px-3 py-2 text-xs font-semibold text-slate-700 transition-colors cursor-pointer hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                >
                  {busy === 'rotate' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  New link
                </button>

                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() =>
                    confirmRemove
                      ? run('remove', () => unpublishCard(pointer.slug))
                      : setConfirmRemove(true)
                  }
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
                    confirmRemove
                      ? 'border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 focus-visible:ring-rose-500'
                      : 'border-slate-200 bg-surface text-slate-700 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 focus-visible:ring-accent'
                  }`}
                >
                  {busy === 'remove' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  {confirmRemove ? 'Take the card down?' : 'Unpublish'}
                </button>

                {confirmRemove && (
                  <button
                    type="button"
                    onClick={() => setConfirmRemove(false)}
                    className="inline-flex items-center rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-600 transition-colors cursor-pointer hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                  >
                    Keep it up
                  </button>
                )}
              </div>

              <p className="text-[11px] leading-relaxed text-slate-500">
                The published card is a snapshot — it does not update on its own. Republish after you
                have written more, or take it down at any time. <strong>New link</strong> revokes the
                old URL for anyone who already has it.
              </p>
            </>
          ) : (
            <button
              type="button"
              disabled={busy !== null || card.stats.entries === 0}
              onClick={() =>
                run('publish', () =>
                  publishCard({
                    entries,
                    insights,
                    displayName: user.displayName ?? '',
                    anonymous,
                  })
                )
              }
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-xs font-semibold text-accent-fg shadow-xs transition-colors cursor-pointer hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              {busy === 'publish' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Globe className="h-3.5 w-3.5" />
              )}
              {card.stats.entries === 0 ? 'Write a reflection first' : 'Publish my card'}
            </button>
          )}
        </div>
      </section>
    </div>
  );
};
