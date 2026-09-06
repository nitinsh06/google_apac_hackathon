import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import type { JournalEntry } from '../types.ts';
import { auth, db, sanitizePayload } from './firebaseApp.ts';
import type {
  DeliveryResult,
  DispatchEventId,
  IntegrationPreferences,
  WebhookConfig,
  WebhookEntrySummary,
  WebhookEventId,
  NotificationMode,
} from './webhookTypes.ts';
import { EVENT_IDS, matchesEntryFilters, NOTIFICATION_MODES } from './webhookTypes.ts';

const PREFERENCES_DOC = ['users', '', 'preferences', 'integrations'];

const preferencesRef = (userId: string) =>
  doc(db, PREFERENCES_DOC[0], userId, PREFERENCES_DOC[2], PREFERENCES_DOC[3]);

export const EMPTY_PREFERENCES: IntegrationPreferences = {
  webhooks: [],
  updatedAt: new Date(0).toISOString(),
};

/** Stored data is user-writable, so re-validate its shape whenever it is read. */
function toWebhookConfig(raw: unknown): WebhookConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.id !== 'string') return null;

  const provider: WebhookConfig['provider'] =
    record.provider === 'slack' || record.provider === 'generic' || record.provider === 'email'
      ? record.provider
      : 'discord';

  // Every channel but email needs somewhere to post.
  const url = typeof record.url === 'string' ? record.url : '';
  if (provider !== 'email' && !url) return null;

  return {
    id: record.id,
    label: typeof record.label === 'string' ? record.label : 'Untitled webhook',
    provider,
    url,
    events: Array.isArray(record.events)
      ? (record.events.filter((event) =>
          EVENT_IDS.includes(event as WebhookEventId)
        ) as WebhookEventId[])
      : [],
    categories: Array.isArray(record.categories)
      ? record.categories.filter((value): value is string => typeof value === 'string')
      : [],
    modes: Array.isArray(record.modes)
      ? (record.modes.filter((value) =>
          NOTIFICATION_MODES.includes(value as NotificationMode)
        ) as NotificationMode[])
      : [],
    placement:
      record.placement === 'pinned' || record.placement === 'unpinned' ? record.placement : 'any',
    enabled: record.enabled !== false,
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : new Date().toISOString(),
    lastDeliveryAt: typeof record.lastDeliveryAt === 'string' ? record.lastDeliveryAt : null,
    lastStatus:
      record.lastStatus === 'ok' || record.lastStatus === 'failed' ? record.lastStatus : null,
    lastError: typeof record.lastError === 'string' ? record.lastError : null,
  };
}

/** Kept in sync by the subscription so dispatch never needs an extra read. */
let cachedPreferences: IntegrationPreferences = EMPTY_PREFERENCES;
let cachedUserId: string | null = null;

export function subscribeIntegrationPreferences(
  userId: string,
  onSuccess: (preferences: IntegrationPreferences) => void,
  onError?: (error: Error) => void
) {
  if (!userId) {
    onSuccess(EMPTY_PREFERENCES);
    return () => {};
  }

  cachedUserId = userId;

  return onSnapshot(
    preferencesRef(userId),
    (snapshot) => {
      const data = snapshot.data() as Record<string, unknown> | undefined;
      const webhooks = Array.isArray(data?.webhooks) ? data!.webhooks : [];
      const preferences: IntegrationPreferences = {
        webhooks: webhooks
          .map(toWebhookConfig)
          .filter((config): config is WebhookConfig => config !== null),
        updatedAt:
          typeof data?.updatedAt === 'string' ? data.updatedAt : new Date().toISOString(),
      };
      cachedPreferences = preferences;
      onSuccess(preferences);
    },
    (error) => {
      console.error('Could not read integration settings:', error);
      onError?.(error);
    }
  );
}

export async function saveWebhooks(userId: string, webhooks: WebhookConfig[]): Promise<void> {
  if (!userId) throw new Error('User ID is required to save integrations.');
  const preferences: IntegrationPreferences = {
    webhooks,
    updatedAt: new Date().toISOString(),
  };
  await setDoc(preferencesRef(userId), sanitizePayload(preferences), { merge: false });
}

// ── Entry summaries ───────────────────────────────────────────────────────

const firstUserText = (entry: JournalEntry): string =>
  entry.turns.find((turn) => turn.role === 'user')?.text?.trim() ||
  entry.turns[0]?.text?.trim() ||
  '';

/** Modes used anywhere in this reflection's dialogue, newest turn first. */
function entryModes(entry: JournalEntry): NotificationMode[] {
  const seen: NotificationMode[] = [];
  for (let index = entry.turns.length - 1; index >= 0; index -= 1) {
    const mode = entry.turns[index]?.mode;
    if (mode && !seen.includes(mode)) seen.push(mode);
  }
  return seen;
}

export function summariseEntry(entry: JournalEntry): WebhookEntrySummary {
  const body = entry.summary?.trim() || firstUserText(entry);
  const summary: WebhookEntrySummary = {
    id: entry.id,
    title: entry.title?.trim() || 'Untitled reflection',
    category: entry.category ?? '',
    excerpt: body.length > 900 ? `${body.slice(0, 899)}…` : body,
    modes: entryModes(entry),
    turnCount: entry.turns.length,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };

  if (entry.location) {
    summary.placeName = entry.location.name;
    if (entry.location.address) summary.placeAddress = entry.location.address;
    if (typeof entry.location.lat === 'number' && typeof entry.location.lng === 'number') {
      summary.lat = entry.location.lat;
      summary.lng = entry.location.lng;
    }
  }

  return summary;
}

// ── What changed ──────────────────────────────────────────────────────────

interface KnownEntry {
  locationKey: string | null;
}

const known = new Map<string, KnownEntry>();

const locationKeyOf = (entry: JournalEntry): string | null =>
  entry.location && typeof entry.location.lat === 'number'
    ? `${entry.location.lat.toFixed(5)},${entry.location.lng.toFixed(5)}`
    : null;

/** Seeded from the live Firestore subscription on every snapshot. */
export function noteKnownEntries(entries: JournalEntry[]): void {
  for (const entry of entries) {
    if (!known.has(entry.id)) known.set(entry.id, { locationKey: locationKeyOf(entry) });
  }
}

/**
 * Decide which event a pending save represents, using the state we already hold
 * rather than an extra Firestore read.
 */
export function classifyWrite(entry: JournalEntry): WebhookEventId | null {
  const previous = known.get(entry.id);
  const locationKey = locationKeyOf(entry);

  if (!previous) {
    known.set(entry.id, { locationKey });
    return 'reflection.created';
  }

  const gainedPlace = locationKey !== null && locationKey !== previous.locationKey;
  known.set(entry.id, { locationKey });

  return gainedPlace ? 'reflection.located' : 'reflection.updated';
}

export function forgetEntry(entryId: string): void {
  known.delete(entryId);
}

// ── Delivery ──────────────────────────────────────────────────────────────

/**
 * The editor writes to Firestore on every keystroke of the title, so plain
 * edits are coalesced into one delivery per entry. Creations, pins and
 * deletions are one-off and go out immediately.
 */
const UPDATE_COALESCE_MS = 15_000;
const pendingUpdates = new Map<string, ReturnType<typeof setTimeout>>();
const recentlyCreated = new Map<string, number>();

async function postDispatch(
  event: DispatchEventId,
  entry: WebhookEntrySummary,
  webhookId?: string
): Promise<DeliveryResult[]> {
  const user = auth.currentUser;
  if (!user) return [];

  const token = await user.getIdToken();
  const response = await fetch('/api/webhooks/dispatch', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ event, entry, webhookId }),
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail?.error || `Delivery failed (${response.status}).`);
  }

  const result = (await response.json()) as { delivered?: DeliveryResult[] };
  return result.delivered ?? [];
}

/** Record how the last delivery went, so the Integrations panel can show it. */
async function recordDeliveries(results: DeliveryResult[]): Promise<void> {
  if (results.length === 0 || !cachedUserId) return;

  const byId = new Map(results.map((result) => [result.id, result]));
  const next = cachedPreferences.webhooks.map((webhook) => {
    const result = byId.get(webhook.id);
    if (!result) return webhook;
    return {
      ...webhook,
      lastDeliveryAt: new Date().toISOString(),
      lastStatus: result.ok ? ('ok' as const) : ('failed' as const),
      lastError: result.ok ? null : result.error ?? 'Delivery failed.',
    };
  });

  try {
    await saveWebhooks(cachedUserId, next);
  } catch (error) {
    console.error('Could not record webhook delivery status:', error);
  }
}

/**
 * Would anything actually be delivered? Mirrors the server's own filtering so a
 * reflection nobody subscribed to never leaves the browser at all. The server
 * re-applies these checks regardless — this is a shortcut, not the gate.
 */
function hasSubscriber(event: DispatchEventId, entry: JournalEntry): boolean {
  const summary = summariseEntry(entry);
  return cachedPreferences.webhooks.some(
    (webhook) =>
      webhook.enabled &&
      webhook.events.includes(event as WebhookEventId) &&
      matchesEntryFilters(webhook, summary)
  );
}

async function deliver(event: DispatchEventId, entry: JournalEntry): Promise<void> {
  try {
    const results = await postDispatch(event, summariseEntry(entry));
    await recordDeliveries(results);
  } catch (error) {
    // A webhook problem is never allowed to surface as a failed save.
    console.error(`Webhook delivery for ${event} failed:`, error);
  }
}

/**
 * Announce a reflection change. Safe to call unconditionally: it returns
 * immediately when the user has no matching endpoint.
 */
export async function emitReflectionEvent(
  event: WebhookEventId,
  entry: JournalEntry
): Promise<void> {
  if (!auth.currentUser) return;

  if (event === 'reflection.created') {
    recentlyCreated.set(entry.id, Date.now());
  }

  if (event !== 'reflection.updated') {
    const timer = pendingUpdates.get(entry.id);
    if (timer) {
      clearTimeout(timer);
      pendingUpdates.delete(entry.id);
    }
    if (event === 'reflection.deleted') {
      forgetEntry(entry.id);
      recentlyCreated.delete(entry.id);
    }
    if (!hasSubscriber(event, entry)) return;
    await deliver(event, entry);
    return;
  }

  // An edit moments after creation is part of the same act of writing.
  const createdAt = recentlyCreated.get(entry.id);
  if (createdAt && Date.now() - createdAt < UPDATE_COALESCE_MS) return;

  if (!hasSubscriber(event, entry)) return;

  const existing = pendingUpdates.get(entry.id);
  if (existing) clearTimeout(existing);

  pendingUpdates.set(
    entry.id,
    setTimeout(() => {
      pendingUpdates.delete(entry.id);
      void deliver('reflection.updated', entry);
    }, UPDATE_COALESCE_MS)
  );
}

/** Fires one endpoint regardless of its event filter, for the Test button. */
export async function sendTestDelivery(webhook: WebhookConfig): Promise<DeliveryResult> {
  const sample: WebhookEntrySummary = {
    id: 'test-delivery',
    title: 'Hello from ReflectAI',
    category: 'Personal',
    excerpt:
      'If you can read this in your channel, your webhook is configured correctly. Real reflections will arrive here as you write them.',
    turnCount: 2,
    placeName: 'Golden Gate Park',
    placeAddress: 'San Francisco, CA, USA',
    lat: 37.7694,
    lng: -122.4862,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const results = await postDispatch('test', sample, webhook.id);
  const result = results.find((item) => item.id === webhook.id);
  const outcome: DeliveryResult = result ?? {
    id: webhook.id,
    label: webhook.label,
    ok: false,
    status: null,
    error: 'The endpoint was not found in your saved settings.',
  };

  await recordDeliveries([outcome]);
  return outcome;
}
