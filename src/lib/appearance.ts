import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { useCallback, useSyncExternalStore } from 'react';
import { db, sanitizePayload } from './firebaseApp.ts';
import { applyTheme, cacheTheme, resolveTheme, type Theme } from './theme.ts';
import { applyAccent, cacheAccent, isAccent, resolveAccent, type Accent } from './accent.ts';

/**
 * Appearance preferences, owned by the account.
 *
 * The document lives at `users/{uid}/preferences/appearance`, beside the
 * webhook settings, so it inherits the same owner-bound rule and travels with
 * the user rather than the browser.
 *
 * localStorage still holds a copy, but only as a paint cache: Firestore cannot
 * answer before React mounts, and a signed-in user must not watch their theme
 * flip from the default to their own a beat after load. The account document is
 * the source of truth; the cache is what the page draws until it arrives.
 */

export interface AppearancePreferences {
  theme: Theme;
  accent: Accent;
  updatedAt: string;
}

/** Whether what you see has made it to the account yet. */
export type AppearanceSync = 'local' | 'syncing' | 'synced' | 'error';

const appearanceRef = (userId: string) =>
  doc(db, 'users', userId, 'preferences', 'appearance');

interface StoreState {
  theme: Theme;
  accent: Accent;
  sync: AppearanceSync;
}

let state: StoreState = {
  theme: typeof document === 'undefined' ? 'light' : resolveTheme(),
  accent: typeof document === 'undefined' ? 'blue' : resolveAccent(),
  sync: 'local',
};

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

function setState(next: Partial<StoreState>): void {
  const merged = { ...state, ...next };
  if (
    merged.theme === state.theme &&
    merged.accent === state.accent &&
    merged.sync === state.sync
  ) {
    return;
  }
  state = merged;
  emit();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getSnapshot = () => state;

// ── Account binding ───────────────────────────────────────────────────────

let activeUserId: string | null = null;
let detach: (() => void) | null = null;

/**
 * Point the store at a signed-in user, or at nothing. Called once from App on
 * every auth transition; a signed-out visitor stays device-local.
 */
export function bindAppearanceAccount(userId: string | null): void {
  if (userId === activeUserId) return;

  detach?.();
  detach = null;
  activeUserId = userId;

  if (!userId) {
    setState({ sync: 'local' });
    return;
  }

  setState({ sync: 'syncing' });

  detach = onSnapshot(
    appearanceRef(userId),
    (snapshot) => {
      const data = snapshot.data() as Record<string, unknown> | undefined;

      if (!data) {
        // First sign-in on this account: adopt whatever the device was using
        // rather than resetting someone to the defaults.
        void writeRemote(userId, { theme: state.theme, accent: state.accent });
        return;
      }

      const theme: Theme = data.theme === 'dark' ? 'dark' : 'light';
      const accent: Accent = isAccent(data.accent) ? data.accent : 'blue';

      applyTheme(theme);
      applyAccent(accent);
      cacheTheme(theme);
      cacheAccent(accent);
      setState({ theme, accent, sync: 'synced' });
    },
    (error) => {
      console.error('Could not read appearance settings:', error);
      setState({ sync: 'error' });
    }
  );
}

async function writeRemote(
  userId: string,
  values: { theme: Theme; accent: Accent }
): Promise<void> {
  const preferences: AppearancePreferences = {
    ...values,
    updatedAt: new Date().toISOString(),
  };
  try {
    await setDoc(appearanceRef(userId), sanitizePayload(preferences), { merge: true });
    setState({ sync: 'synced' });
  } catch (error) {
    console.error('Could not save appearance settings:', error);
    setState({ sync: 'error' });
  }
}

// ── Mutations ─────────────────────────────────────────────────────────────

/**
 * Paint first, persist second. A preference the user can see change is worth
 * more than one that waits on a round trip, and a failed write is reported
 * through `sync` rather than by reverting what they just picked.
 */
function commit(next: Partial<{ theme: Theme; accent: Accent }>): void {
  const theme = next.theme ?? state.theme;
  const accent = next.accent ?? state.accent;

  if (next.theme) {
    applyTheme(next.theme);
    cacheTheme(next.theme);
  }
  if (next.accent) {
    applyAccent(next.accent);
    cacheAccent(next.accent);
  }

  setState({ theme, accent, sync: activeUserId ? 'syncing' : 'local' });
  if (activeUserId) void writeRemote(activeUserId, { theme, accent });
}

export function setStoredTheme(theme: Theme): void {
  commit({ theme });
}

export function setStoredAccent(accent: Accent): void {
  commit({ accent });
}

/** Keeps the store honest when the OS flips and the user has no stored choice. */
export function noteSystemTheme(theme: Theme): void {
  applyTheme(theme);
  setState({ theme });
}

export function useAppearance(): {
  theme: Theme;
  accent: Accent;
  sync: AppearanceSync;
  setTheme: (theme: Theme) => void;
  setAccent: (accent: Accent) => void;
  toggleTheme: () => void;
} {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const toggleTheme = useCallback(() => {
    setStoredTheme(state.theme === 'dark' ? 'light' : 'dark');
  }, []);

  return {
    theme: snapshot.theme,
    accent: snapshot.accent,
    sync: snapshot.sync,
    setTheme: setStoredTheme,
    setAccent: setStoredAccent,
    toggleTheme,
  };
}
