import React from 'react';
import { Moon, Sun } from 'lucide-react';
import type { Theme } from '../lib/theme.ts';

interface ThemeToggleProps {
  theme: Theme;
  onToggle: () => void;
  /** Collapsed rails have no room for the track, so fall back to a plain icon. */
  compact?: boolean;
  className?: string;
}

/**
 * Light/dark switch. The track shows both destinations at once and the knob
 * travels between them, so the control reads as a state rather than a command.
 */
export const ThemeToggle: React.FC<ThemeToggleProps> = ({
  theme,
  onToggle,
  compact = false,
  className = '',
}) => {
  const isDark = theme === 'dark';
  const label = isDark ? 'Switch to light theme' : 'Switch to dark theme';

  if (compact) {
    return (
      <button
        id="theme-toggle-compact"
        type="button"
        onClick={onToggle}
        title={label}
        aria-label={label}
        className={`flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-slate-100 text-slate-700 transition-colors cursor-pointer hover:bg-slate-200 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${className}`}
      >
        {isDark ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
      </button>
    );
  }

  return (
    <button
      id="theme-toggle"
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={label}
      title={label}
      onClick={onToggle}
      className={`group relative flex h-8 w-[60px] shrink-0 items-center rounded-full border border-slate-300 bg-slate-200 px-1 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 ${className}`}
    >
      {/* The destination you are not on stays visible on the open half. */}
      <span className="pointer-events-none absolute inset-y-0 left-0 flex w-1/2 items-center justify-center">
        <Sun className="h-3.5 w-3.5 text-slate-500" />
      </span>
      <span className="pointer-events-none absolute inset-y-0 right-0 flex w-1/2 items-center justify-center">
        <Moon className="h-3.5 w-3.5 text-slate-500" />
      </span>
      {/* The knob is filled rather than white-on-near-white: it has to be the
          first thing you find in the footer, at a glance and from an angle. */}
      <span
        aria-hidden
        className={`relative flex h-6 w-6 items-center justify-center rounded-full bg-accent shadow-sm shadow-scrim/30 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          isDark ? 'translate-x-[26px]' : 'translate-x-0'
        }`}
      >
        {isDark ? (
          <Moon className="h-3.5 w-3.5 text-accent-fg" />
        ) : (
          <Sun className="h-3.5 w-3.5 text-accent-fg" />
        )}
      </span>
    </button>
  );
};
