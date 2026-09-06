/**
 * Theme primitives: the DOM attribute and the paint cache.
 *
 * The choice lives on `document.documentElement` as `data-theme`, which is what
 * the dark palette in `index.css` keys off, and it is written before React
 * mounts (see the inline bootstrap in `index.html`) so the first paint is
 * already the right colour.
 *
 * Ownership of the *preference* belongs to `appearance.ts`, which syncs it to
 * the user's Firestore document; localStorage here is only the cache that lets
 * the page paint before that document arrives.
 */

import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'reflectai:theme';

export function systemTheme(): Theme {
  return typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

/** A cached choice wins; absent one, follow the operating system. */
export function readCachedTheme(): Theme | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'dark' || stored === 'light' ? stored : null;
  } catch {
    // Private browsing or blocked storage — fall back to the system preference.
    return null;
  }
}

export function resolveTheme(): Theme {
  return readCachedTheme() ?? systemTheme();
}

export function cacheTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Cache miss next load costs a repaint, nothing more.
  }
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.dataset.theme = theme;

  // Suppress every colour transition for one frame so the whole page flips at
  // once instead of a few hundred elements easing independently.
  root.setAttribute('data-theme-switching', '');
  window.setTimeout(() => root.removeAttribute('data-theme-switching'), 0);
}

/**
 * Read-only view of the active theme for components too deep to thread a prop
 * through. It watches the same `data-theme` attribute everything else writes.
 */
export function useThemeValue(): Theme {
  const [theme, setTheme] = useState<Theme>(() =>
    typeof document === 'undefined'
      ? 'light'
      : (document.documentElement.dataset.theme as Theme | undefined) ?? 'light'
  );

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      setTheme((root.dataset.theme as Theme | undefined) ?? 'light');
    });
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    setTheme((root.dataset.theme as Theme | undefined) ?? 'light');
    return () => observer.disconnect();
  }, []);

  return theme;
}
