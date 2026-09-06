import React, { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  ChevronsLeft,
  ChevronsRight,
  Database,
  MapPin,
  PenLine,
  Plus,
  Sparkles,
  UserRound,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { UserProfile } from '../types.ts';
import type { Theme } from '../lib/theme.ts';
import { ThemeToggle } from './ThemeToggle.tsx';

export type NavView = 'editor' | 'history' | 'map' | 'analytics' | 'profile';

const COLLAPSE_KEY = 'reflectai:nav-collapsed';

interface NavItem {
  view: NavView;
  id: string;
  label: string;
  short: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { view: 'editor', id: 'nav-tab-editor', label: 'Current Reflection', short: 'Reflection', icon: PenLine },
  { view: 'history', id: 'nav-tab-history', label: 'Journal History', short: 'History', icon: BookOpen },
  { view: 'map', id: 'nav-tab-map', label: 'Places Map', short: 'Map', icon: MapPin },
  { view: 'analytics', id: 'nav-tab-analytics', label: 'Analytics', short: 'Analytics', icon: BarChart3 },
  { view: 'profile', id: 'nav-profile-btn', label: 'Profile', short: 'Profile', icon: UserRound },
];

interface SidebarProps {
  user: UserProfile | null;
  onNewEntry: () => void;
  activeView: NavView;
  onSelectView: (view: NavView) => void;
  entryCount: number;
  taggedCount: number;
  theme: Theme;
  onToggleTheme: () => void;
  /** Mobile drawer state, owned by App so the top bar can open it. */
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === 'true';
  } catch {
    return false;
  }
}

export const Sidebar: React.FC<SidebarProps> = ({
  user,
  onNewEntry,
  activeView,
  onSelectView,
  entryCount,
  taggedCount,
  theme,
  onToggleTheme,
  mobileOpen,
  onCloseMobile,
}) => {
  const [collapsed, setCollapsed] = useState(readCollapsed);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, String(next));
      } catch {
        // Layout preference is a nicety; losing it costs nothing.
      }
      return next;
    });
  }, []);

  // The drawer is a modal surface on mobile: Escape closes it, and the page
  // behind it must not scroll away underneath.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseMobile();
    };
    window.addEventListener('keydown', onKeyDown);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [mobileOpen, onCloseMobile]);

  const counts: Partial<Record<NavView, number>> = {
    history: entryCount,
    map: taggedCount,
  };

  const select = (view: NavView) => {
    onSelectView(view);
    onCloseMobile();
  };

  const railed = collapsed;

  const brand = (
    <div className={`flex min-w-0 flex-1 items-center gap-2.5 ${railed ? 'lg:justify-center' : ''}`}>
      <button
        id="brand-logo-button"
        type="button"
        onClick={() => select('editor')}
        title="ReflectAI"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-accent shadow-xs transition-colors cursor-pointer hover:bg-accent-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <Sparkles className="h-[15px] w-[15px] stroke-[2.2] text-white" />
      </button>
      <span className={`min-w-0 ${railed ? 'lg:hidden' : ''}`}>
        <span className="block truncate text-sm font-bold leading-tight tracking-tight text-slate-900">
          ReflectAI
        </span>
        <span className="block text-[10px] font-bold uppercase leading-tight tracking-wide text-blue-700">
          Gemini 3.6
        </span>
      </span>
    </div>
  );

  const panel = (
    <div className="flex h-full flex-col gap-4 overflow-y-auto overflow-x-hidden px-3 py-4 thin-scroll">
      <div className="flex items-center justify-between gap-2">
        {brand}
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors cursor-pointer hover:bg-slate-100 hover:text-slate-900 lg:hidden"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Primary action sits above the destinations: it is what the app is for. */}
      <button
        id="nav-new-entry-btn"
        type="button"
        onClick={() => {
          onNewEntry();
          onCloseMobile();
        }}
        title="New Reflection"
        className={`inline-flex items-center gap-2 rounded-xl bg-accent px-3 py-2.5 text-xs font-semibold text-accent-fg shadow-xs transition-colors cursor-pointer hover:bg-accent-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
          railed ? 'lg:justify-center lg:px-0' : ''
        }`}
      >
        <Plus className="h-3.5 w-3.5 shrink-0 stroke-[2.4]" />
        <span className={railed ? 'lg:hidden' : ''}>New Reflection</span>
      </button>

      <nav aria-label="Primary" className="flex flex-col gap-0.5">
        {NAV_ITEMS.map(({ view, id, label, icon: Icon }) => {
          const active = activeView === view;
          const count = counts[view] ?? 0;
          return (
            <button
              key={view}
              id={id}
              type="button"
              onClick={() => select(view)}
              aria-current={active ? 'page' : undefined}
              title={label}
              className={`group relative flex items-center gap-2.5 rounded-lg py-2 pl-3 pr-2.5 text-xs font-semibold transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                active
                  ? 'bg-surface text-blue-700 shadow-xs ring-1 ring-slate-200'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              } ${railed ? 'lg:justify-center lg:px-0' : ''}`}
            >
              {/* Rail marker: keeps the active row legible once labels are gone. */}
              <span
                aria-hidden
                className={`absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-accent transition-opacity ${
                  active ? 'opacity-100' : 'opacity-0'
                }`}
              />
              <Icon
                className={`h-[15px] w-[15px] shrink-0 stroke-[1.9] ${active ? 'text-blue-600' : 'text-slate-500 group-hover:text-slate-700'}`}
              />
              <span className={`flex-1 truncate text-left ${railed ? 'lg:hidden' : ''}`}>{label}</span>
              {count > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                    active ? 'bg-blue-50 text-blue-700' : 'bg-slate-200 text-slate-700'
                  } ${railed ? 'lg:hidden' : ''}`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="flex-1" />

      <div className="flex flex-col gap-3 border-t border-slate-200 pt-3">
        <div className={`flex items-center gap-2 ${railed ? 'lg:flex-col' : 'justify-between'}`}>
          <span className={`text-[11px] font-semibold text-slate-500 ${railed ? 'lg:hidden' : ''}`}>
            Appearance
          </span>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} className={railed ? 'lg:hidden' : ''} />
          <ThemeToggle
            theme={theme}
            onToggle={onToggleTheme}
            compact
            className={railed ? 'hidden lg:flex' : 'hidden'}
          />
        </div>

        <div
          id="firestore-status-badge"
          title="Cloud Firestore user-isolated storage active"
          className={`flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 ${
            railed ? 'lg:hidden' : ''
          }`}
        >
          <Database className="h-2.5 w-2.5 shrink-0 text-slate-500" />
          <span className="truncate">Firestore Synced</span>
        </div>

        {user && (
          <button
            type="button"
            onClick={() => select('profile')}
            title="Profile and account settings"
            className={`flex items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              activeView === 'profile' ? 'bg-blue-50' : 'hover:bg-slate-100'
            } ${railed ? 'lg:justify-center' : ''}`}
          >
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt=""
                referrerPolicy="no-referrer"
                className="h-7 w-7 shrink-0 rounded-full border border-slate-300 object-cover"
              />
            ) : (
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-slate-200 text-[10px] font-bold text-slate-600">
                {(user.displayName || user.email || 'U').slice(0, 2).toUpperCase()}
              </span>
            )}
            <span className={`min-w-0 flex-1 ${railed ? 'lg:hidden' : ''}`}>
              <span className="block truncate text-xs font-semibold leading-tight text-slate-800">
                {user.displayName || 'User'}
              </span>
              <span className="block truncate text-[11px] leading-tight text-slate-500">
                {user.email}
              </span>
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          className={`hidden items-center gap-2 rounded-lg py-1.5 text-[11px] font-semibold text-slate-500 transition-colors cursor-pointer hover:bg-slate-100 hover:text-slate-800 lg:flex ${
            collapsed ? 'lg:justify-center lg:px-0' : 'px-2.5'
          }`}
        >
          {collapsed ? (
            <ChevronsRight className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <>
              <ChevronsLeft className="h-3.5 w-3.5 shrink-0" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop rail */}
      <aside
        id="app-sidebar"
        className={`hidden shrink-0 border-r border-slate-200 bg-slate-50 lg:block ${
          collapsed ? 'w-[76px]' : 'w-64'
        }`}
      >
        {panel}
      </aside>

      {/* Mobile drawer */}
      <div
        className={`fixed inset-0 z-[900] lg:hidden ${mobileOpen ? '' : 'pointer-events-none'}`}
        aria-hidden={!mobileOpen}
      >
        <div
          onClick={onCloseMobile}
          className={`absolute inset-0 bg-scrim/55 backdrop-blur-[2px] transition-opacity duration-200 ${
            mobileOpen ? 'opacity-100' : 'opacity-0'
          }`}
        />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
          className={`absolute inset-y-0 left-0 w-[17rem] max-w-[85vw] border-r border-slate-200 bg-slate-50 shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {panel}
        </aside>
      </div>
    </>
  );
};
