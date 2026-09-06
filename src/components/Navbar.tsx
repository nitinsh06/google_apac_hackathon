import React from 'react';
import { Menu, Sparkles } from 'lucide-react';
import type { Theme } from '../lib/theme.ts';
import { ThemeToggle } from './ThemeToggle.tsx';

interface NavbarProps {
  /** A signed-in session navigates from the sidebar, so this bar is only the
   *  mobile handle for it — hidden once the rail is on screen. */
  variant: 'app' | 'landing';
  onOpenNav?: () => void;
  theme: Theme;
  onToggleTheme: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  variant,
  onOpenNav,
  theme,
  onToggleTheme,
}) => (
  <header
    id="app-navbar"
    className={`sticky top-0 z-40 shrink-0 border-b border-slate-200 bg-surface text-slate-900 shadow-xs ${
      variant === 'app' ? 'lg:hidden' : ''
    }`}
  >
    <div
      className={`flex h-16 items-center justify-between gap-3 px-4 sm:px-6 ${
        variant === 'landing' ? 'mx-auto max-w-7xl lg:px-8' : ''
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        {variant === 'app' && (
          <button
            id="nav-open-sidebar-btn"
            type="button"
            onClick={onOpenNav}
            aria-label="Open navigation"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors cursor-pointer hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <Menu className="h-3.5 w-3.5" />
          </button>
        )}

        <div className="flex min-w-0 items-center gap-2.5 select-none">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-accent shadow-xs">
            <Sparkles className="h-3.5 w-3.5 stroke-[2.2] text-white" />
          </div>
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-lg font-bold tracking-tight text-slate-800">
              ReflectAI
            </span>
            <span className="hidden rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-700 sm:inline-block">
              Gemini 3.6
            </span>
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <ThemeToggle theme={theme} onToggle={onToggleTheme} compact />
      </div>
    </div>
  </header>
);
