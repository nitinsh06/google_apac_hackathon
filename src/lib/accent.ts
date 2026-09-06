/**
 * Accent primitives: the DOM attribute and the paint cache.
 *
 * Like the theme, the choice lives on `document.documentElement` — here as
 * `data-accent` — and `index.css` keys the palette off it. Each accent
 * re-points Tailwind's whole `blue-*` ramp as well as the `accent` tokens, so
 * every chip, link, focus ring and active state in the app moves together
 * without a single component knowing which colour is in play.
 *
 * The preference itself is owned by `appearance.ts` and stored on the user's
 * Firestore document; localStorage here is only the pre-mount paint cache.
 */

export type Accent = 'blue' | 'violet' | 'emerald' | 'amber' | 'rose';

const STORAGE_KEY = 'reflectai:accent';

export const DEFAULT_ACCENT: Accent = 'blue';

/**
 * `swatch` is the light-theme mid-tone used to paint the picker, and `ink` is
 * what stays legible on top of it — Ember is light enough to need dark ink.
 */
export const ACCENTS: Array<{ id: Accent; label: string; swatch: string; ink: string }> = [
  { id: 'blue', label: 'Cobalt', swatch: '#2563eb', ink: '#ffffff' },
  { id: 'violet', label: 'Iris', swatch: '#7c3aed', ink: '#ffffff' },
  { id: 'emerald', label: 'Pine', swatch: '#059669', ink: '#ffffff' },
  { id: 'amber', label: 'Ember', swatch: '#d97706', ink: '#2a1a06' },
  { id: 'rose', label: 'Rosewood', swatch: '#e11d48', ink: '#ffffff' },
];

export const isAccent = (value: unknown): value is Accent =>
  ACCENTS.some((option) => option.id === value);

export function readCachedAccent(): Accent | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isAccent(stored) ? stored : null;
  } catch {
    // Blocked storage — fall back to the default rather than failing to render.
    return null;
  }
}

export function resolveAccent(): Accent {
  return readCachedAccent() ?? DEFAULT_ACCENT;
}

export function cacheAccent(accent: Accent): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, accent);
  } catch {
    // Cache miss next load costs a repaint, nothing more.
  }
}

export function applyAccent(accent: Accent): void {
  document.documentElement.dataset.accent = accent;
}
