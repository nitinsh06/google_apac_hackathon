import React, { useMemo, useState } from 'react';
import {
  Check,
  Cloud,
  Copy,
  Database,
  LogOut,
  Moon,
  IdCard,
  Palette,
  ShieldAlert,
  ShieldCheck,
  Sun,
  UserRound,
  Webhook,
} from 'lucide-react';
import type { JournalCategory, JournalEntry, UserProfile } from '../types.ts';
import { buildPlaces, categoryStyle } from '../lib/places.ts';
import { IntegrationsPanel } from './IntegrationsPanel.tsx';
import { CardPanel } from './CardPanel.tsx';
import type { AppearanceSync } from '../lib/appearance.ts';
import { ACCENTS } from '../lib/accent.ts';
import { useAppearance } from '../lib/appearance.ts';

interface ProfileViewProps {
  user: UserProfile;
  entries: JournalEntry[];
  onSignOut: () => void;
}

type SectionId = 'account' | 'card' | 'preferences' | 'integrations';

const SECTIONS: Array<{ id: SectionId; label: string; icon: typeof UserRound; blurb: string }> = [
  { id: 'account', label: 'Account', icon: UserRound, blurb: 'Who you are and where your journal lives' },
  { id: 'card', label: 'My card', icon: IdCard, blurb: 'The badge you have earned, and its share link' },
  { id: 'preferences', label: 'Preferences', icon: Palette, blurb: 'How ReflectAI looks on this device' },
  { id: 'integrations', label: 'Integrations', icon: Webhook, blurb: 'Send your journal events elsewhere' },
];

const CATEGORY_ORDER: JournalCategory[] = [
  'Personal',
  'Work',
  'Ideas',
  'Gratitude',
  'Mindfulness',
];

const monthYear = (iso?: string | null): string | null => {
  const ms = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
};

const Row: React.FC<{ label: string; children: React.ReactNode; hint?: string }> = ({
  label,
  children,
  hint,
}) => (
  <div className="flex flex-col gap-1 border-b border-slate-100 py-3.5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
    <div className="min-w-0">
      <dt className="text-xs font-semibold text-slate-900">{label}</dt>
      {hint && <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">{hint}</p>}
    </div>
    <dd className="min-w-0 shrink-0 text-xs text-slate-700 sm:text-right">{children}</dd>
  </div>
);

const Block: React.FC<{ title: string; description?: string; children: React.ReactNode }> = ({
  title,
  description,
  children,
}) => (
  <section className="rounded-xl border border-slate-200 bg-surface shadow-xs">
    <header className="border-b border-slate-200 px-4 py-3 sm:px-5">
      <h3 className="text-sm font-bold tracking-tight text-slate-900">{title}</h3>
      {description && <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{description}</p>}
    </header>
    <div className="px-4 sm:px-5">{children}</div>
  </section>
);

const CopyableId: React.FC<{ value: string }> = ({ value }) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be blocked; the value stays selectable either way.
    }
  };

  return (
    <span className="inline-flex max-w-full items-center gap-1.5">
      <code className="truncate rounded bg-slate-100 px-2 py-1 font-mono text-[11px] text-slate-700">
        {value}
      </code>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? 'Copied' : 'Copy to clipboard'}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </span>
  );
};

const SYNC_COPY: Record<AppearanceSync, string> = {
  local: 'Saved on this device. Sign in to carry it across your devices.',
  syncing: 'Saving to your account…',
  synced: 'Saved to your account and synced across your devices.',
  error: 'Could not reach your account — this device is up to date, others may not be.',
};

/**
 * Appearance settings, stored on the user's own Firestore document so the
 * choice follows them rather than the browser they happened to pick it in.
 */
const PreferencesPanel: React.FC = () => {
  const { theme, accent, sync, setTheme, setAccent } = useAppearance();

  const modes: Array<{ id: 'light' | 'dark'; label: string; icon: typeof Sun }> = [
    { id: 'light', label: 'Light', icon: Sun },
    { id: 'dark', label: 'Dark', icon: Moon },
  ];

  return (
    <>
      <Block
        title="Accent"
        description="Sets the colour of buttons, links, active tabs and map highlights."
      >
        <div className="py-4">
          <div className="flex flex-wrap gap-2.5">
            {ACCENTS.map(({ id, label, swatch, ink }) => {
              const active = accent === id;
              return (
                <button
                  key={id}
                  id={`accent-option-${id}`}
                  type="button"
                  onClick={() => setAccent(id)}
                  aria-pressed={active}
                  title={label}
                  className={`group flex min-w-[92px] flex-1 flex-col items-center gap-2 rounded-xl border px-3 py-3 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                    active
                      ? 'border-blue-300 bg-blue-50'
                      : 'border-slate-200 bg-surface hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <span
                    aria-hidden
                    style={{ backgroundColor: swatch }}
                    className={`flex h-7 w-7 items-center justify-center rounded-full shadow-sm shadow-scrim/25 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                      active ? 'scale-110 ring-2 ring-slate-50 ring-offset-2 ring-offset-blue-300' : 'group-hover:scale-105'
                    }`}
                  >
                    {active && <Check className="h-3.5 w-3.5 stroke-[3]" style={{ color: ink }} />}
                  </span>
                  <span
                    className={`text-[11px] font-semibold ${active ? 'text-blue-700' : 'text-slate-600'}`}
                  >
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
            Status colours stay fixed — success, warnings and destructive actions never borrow the
            accent, so they keep meaning the same thing whichever you pick.
          </p>
        </div>
      </Block>

      <Block title="Theme" description="Follows your system until you choose one here.">
        <div className="py-4">
          <div className="flex gap-2.5">
            {modes.map(({ id, label, icon: Icon }) => {
              const active = theme === id;
              return (
                <button
                  key={id}
                  id={`theme-option-${id}`}
                  type="button"
                  onClick={() => setTheme(id)}
                  aria-pressed={active}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                    active
                      ? 'border-blue-300 bg-blue-50 text-blue-700'
                      : 'border-slate-200 bg-surface text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <Icon className={`h-3.5 w-3.5 ${active ? 'text-blue-600' : 'text-slate-500'}`} />
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </Block>

      {/* Where it went, in a line — a preference the user cannot confirm landed
          is a preference they will set twice. */}
      <p
        id="appearance-sync-status"
        role="status"
        className={`flex items-center gap-1.5 px-1 text-[11px] ${
          sync === 'error' ? 'text-rose-700' : 'text-slate-500'
        }`}
      >
        {sync === 'synced' ? (
          <Check className="h-3 w-3 shrink-0 text-emerald-600" />
        ) : sync === 'error' ? (
          <ShieldAlert className="h-3 w-3 shrink-0" />
        ) : (
          <Cloud className="h-3 w-3 shrink-0" />
        )}
        {SYNC_COPY[sync]}
      </p>
    </>
  );
};

export const ProfileView: React.FC<ProfileViewProps> = ({
  user,
  entries,
  onSignOut,
}) => {
  const [section, setSection] = useState<SectionId>('account');

  const stats = useMemo(() => {
    const byCategory = new Map<JournalCategory, number>();
    let earliest = Number.POSITIVE_INFINITY;

    for (const entry of entries) {
      if (entry.category) {
        byCategory.set(entry.category, (byCategory.get(entry.category) ?? 0) + 1);
      }
      const created = Date.parse(entry.createdAt);
      if (Number.isFinite(created) && created < earliest) earliest = created;
    }

    return {
      total: entries.length,
      places: buildPlaces(entries).length,
      located: entries.filter((entry) => !!entry.location).length,
      byCategory,
      firstEntry: Number.isFinite(earliest) ? new Date(earliest).toISOString() : null,
    };
  }, [entries]);

  const initials = (user.displayName || user.email || 'U').slice(0, 2).toUpperCase();
  const memberSince = monthYear(user.createdAt) ?? monthYear(stats.firstEntry);

  return (
    <div id="profile-view" className="flex-1 min-h-0 overflow-y-auto bg-slate-50">
      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Profile</h1>
        <p className="mt-1 text-sm text-slate-600">
          Manage your account and connect ReflectAI to the rest of your tools.
        </p>

        <div className="mt-6 flex flex-col gap-6 md:flex-row md:gap-8">
          {/* Section rail */}
          <nav
            aria-label="Profile sections"
            className="no-scrollbar -mx-1 flex shrink-0 gap-1 overflow-x-auto px-1 md:mx-0 md:w-56 md:flex-col md:px-0"
          >
            {SECTIONS.map(({ id, label, icon: Icon }) => {
              const active = section === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSection(id)}
                  aria-current={active ? 'page' : undefined}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors cursor-pointer md:w-full ${
                    active
                      ? 'bg-surface text-blue-700 shadow-xs ring-1 ring-slate-200'
                      : 'text-slate-600 hover:bg-surface/70 hover:text-slate-900'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${active ? 'text-blue-600' : 'text-slate-500'}`} />
                  {label}
                </button>
              );
            })}
          </nav>

          <div className="min-w-0 flex-1 space-y-5">
            {section === 'account' ? (
              <>
                {/* Identity */}
                <section className="flex items-center gap-4 rounded-xl border border-slate-200 bg-surface p-4 shadow-xs sm:p-5">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="h-14 w-14 shrink-0 rounded-full border border-slate-200 object-cover"
                    />
                  ) : (
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600 ring-1 ring-slate-200">
                      {initials}
                    </span>
                  )}

                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-base font-bold tracking-tight text-slate-900">
                      {user.displayName || 'Unnamed explorer'}
                    </h2>
                    <p className="truncate text-xs text-slate-600">{user.email}</p>
                    <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                        Google account
                      </span>
                      {memberSince && (
                        <span className="text-[11px] text-slate-600">Journaling since {memberSince}</span>
                      )}
                    </p>
                  </div>
                </section>

                {/* Journal shape */}
                <Block
                  title="Your journal"
                  description={
                    stats.total === 0
                      ? 'Nothing written yet — your first reflection will show up here.'
                      : `${stats.total} ${
                          stats.total === 1 ? 'reflection' : 'reflections'
                        }, ${stats.located} pinned across ${stats.places} ${
                          stats.places === 1 ? 'place' : 'places'
                        }.`
                  }
                >
                  {stats.total > 0 && (
                    <div className="py-4">
                      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                        {CATEGORY_ORDER.map((category) => {
                          const count = stats.byCategory.get(category) ?? 0;
                          if (count === 0) return null;
                          const style = categoryStyle(category);
                          return (
                            <span
                              key={category}
                              className="h-full"
                              style={{
                                width: `${(count / stats.total) * 100}%`,
                                backgroundImage: `linear-gradient(140deg, ${style.from}, ${style.to})`,
                              }}
                            />
                          );
                        })}
                      </div>

                      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                        {CATEGORY_ORDER.map((category) => {
                          const count = stats.byCategory.get(category) ?? 0;
                          if (count === 0) return null;
                          return (
                            <li
                              key={category}
                              className="inline-flex items-center gap-1.5 text-[11px] text-slate-700"
                            >
                              <span
                                className={`h-2 w-2 rounded-full ${categoryStyle(category).dot}`}
                                aria-hidden="true"
                              />
                              <span className="font-semibold text-slate-900">{category}</span>
                              <span className="text-slate-600">{count}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </Block>

                {/* Storage */}
                <Block
                  title="Storage"
                  description="Reflections are stored per user, so no other account can read them."
                >
                  <dl>
                    <Row label="User ID" hint="Used to scope every read and write.">
                      <CopyableId value={user.uid} />
                    </Row>
                    <Row label="Collection" hint="Where your reflections live in Cloud Firestore.">
                      <code className="rounded bg-slate-100 px-2 py-1 font-mono text-[11px] text-slate-700">
                        users/{'{uid}'}/reflections
                      </code>
                    </Row>
                    <Row label="Isolation">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Owner-bound rules active
                      </span>
                    </Row>
                    <Row label="Sync">
                      <span className="inline-flex items-center gap-1.5 text-slate-700">
                        <Database className="h-3.5 w-3.5 text-slate-500" />
                        Live with Cloud Firestore
                      </span>
                    </Row>
                  </dl>
                </Block>

                {/* Session */}
                <Block title="Session" description="Signing out clears this session on this device.">
                  <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs leading-relaxed text-slate-600">
                      Your reflections stay safe in Firestore and return when you sign back in.
                    </p>
                    <button
                      id="profile-sign-out-btn"
                      type="button"
                      onClick={onSignOut}
                      className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-surface px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 cursor-pointer"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Sign out
                    </button>
                  </div>
                </Block>
              </>
            ) : section === 'card' ? (
              <CardPanel user={user} entries={entries} />
            ) : section === 'preferences' ? (
              <PreferencesPanel />
            ) : (
              <IntegrationsPanel userId={user.uid} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
