import type {
  IntegrationPreferences,
  NotificationMode,
  WebhookConfig,
} from '../lib/webhookTypes.ts';
import { EVENT_IDS, NOTIFICATION_MODES } from '../lib/webhookTypes.ts';

/**
 * Reads a user's own Firestore document over the REST API using their ID token,
 * so security rules still apply and the server needs no elevated credentials.
 */

type FirestoreValue = Record<string, any>;

function decodeValue(value: FirestoreValue): unknown {
  if (value === null || typeof value !== 'object') return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) {
    return (value.arrayValue?.values ?? []).map((item: FirestoreValue) => decodeValue(item));
  }
  if ('mapValue' in value) return decodeFields(value.mapValue?.fields ?? {});
  return null;
}

function decodeFields(fields: Record<string, FirestoreValue>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) out[key] = decodeValue(value);
  return out;
}

const asString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

/** Stored config is user-writable data, so re-validate its shape on read. */
function toWebhookConfig(raw: unknown): WebhookConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;

  const id = asString(record.id);
  const url = asString(record.url);
  const provider: WebhookConfig['provider'] =
    record.provider === 'slack' || record.provider === 'generic' || record.provider === 'email'
      ? record.provider
      : 'discord';

  if (!id) return null;
  // Every channel but email needs somewhere to post.
  if (provider !== 'email' && !url) return null;

  const events = Array.isArray(record.events)
    ? record.events.filter((event): event is (typeof EVENT_IDS)[number] =>
        EVENT_IDS.includes(event as (typeof EVENT_IDS)[number])
      )
    : [];

  return {
    id,
    label: asString(record.label, 'Untitled webhook'),
    provider,
    url,
    events,
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
    createdAt: asString(record.createdAt, new Date().toISOString()),
  };
}

export async function readIntegrationPreferences(options: {
  projectId: string;
  databaseId?: string;
  uid: string;
  idToken: string;
}): Promise<IntegrationPreferences | null> {
  const database = options.databaseId || '(default)';
  const path = `projects/${options.projectId}/databases/${encodeURIComponent(
    database
  )}/documents/users/${encodeURIComponent(options.uid)}/preferences/integrations`;

  const response = await fetch(`https://firestore.googleapis.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${options.idToken}` },
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Could not read integration settings (${response.status}).`);
  }

  const document = (await response.json()) as { fields?: Record<string, FirestoreValue> };
  const decoded = decodeFields(document.fields ?? {});
  const rawWebhooks = Array.isArray(decoded.webhooks) ? decoded.webhooks : [];

  return {
    webhooks: rawWebhooks
      .map(toWebhookConfig)
      .filter((config): config is WebhookConfig => config !== null),
    updatedAt: asString(decoded.updatedAt, new Date().toISOString()),
  };
}
