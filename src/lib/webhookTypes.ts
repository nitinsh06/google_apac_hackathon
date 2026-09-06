/**
 * Shared, dependency-free webhook contract.
 *
 * Imported by both the browser bundle and the Express server, so it must not
 * touch the DOM, Firebase, or Node built-ins.
 */

export type WebhookProvider = 'discord' | 'slack' | 'generic' | 'email';

/** Reflection modes, mirrored from types.ts so this module stays dependency-free. */
export type NotificationMode = 'reflect' | 'summarize' | 'brainstorm' | 'chat';

export const NOTIFICATION_MODES: NotificationMode[] = [
  'reflect',
  'summarize',
  'brainstorm',
  'chat',
];

export const NOTIFICATION_CATEGORIES = [
  'Personal',
  'Work',
  'Ideas',
  'Gratitude',
  'Mindfulness',
] as const;

/** Whether an entry must be pinned to a place for a notification to fire. */
export type PlacementFilter = 'any' | 'pinned' | 'unpinned';

export type WebhookEventId =
  | 'reflection.created'
  | 'reflection.updated'
  | 'reflection.located'
  | 'reflection.deleted';

/** Not selectable — only ever sent by the "Send test" button. */
export type DispatchEventId = WebhookEventId | 'test';

export interface WebhookConfig {
  id: string;
  label: string;
  provider: WebhookProvider;
  /**
   * Destination endpoint. Empty for the email channel, whose recipient is the
   * signed-in user's own verified address, taken from their ID token on the
   * server — never a value the browser supplies.
   */
  url: string;
  /** Lifecycle events this endpoint listens for. */
  events: WebhookEventId[];
  /** Which kinds of entry qualify. An empty or absent list means all of them. */
  categories?: string[];
  modes?: NotificationMode[];
  placement?: PlacementFilter;
  enabled: boolean;
  createdAt: string;
  lastDeliveryAt?: string | null;
  lastStatus?: 'ok' | 'failed' | null;
  lastError?: string | null;
}

export interface IntegrationPreferences {
  webhooks: WebhookConfig[];
  updatedAt: string;
}

/** The slice of a reflection that travels to a webhook. Never the full turns. */
export interface WebhookEntrySummary {
  id: string;
  title: string;
  category: string;
  excerpt: string;
  turnCount: number;
  /** Modes present in this reflection's dialogue, newest first. */
  modes?: NotificationMode[];
  placeName?: string;
  placeAddress?: string;
  lat?: number;
  lng?: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Does this reflection qualify for the endpoint, beyond the lifecycle event?
 * Every filter is opt-in: an unset list means "no opinion", never "none".
 */
export function matchesEntryFilters(
  config: Pick<WebhookConfig, 'categories' | 'modes' | 'placement'>,
  entry: WebhookEntrySummary
): boolean {
  if (config.categories?.length && !config.categories.includes(entry.category)) {
    return false;
  }

  if (config.modes?.length) {
    const entryModes = entry.modes ?? [];
    if (!entryModes.some((mode) => config.modes!.includes(mode))) return false;
  }

  const placement = config.placement ?? 'any';
  if (placement !== 'any') {
    const pinned = Boolean(entry.placeName);
    if (placement === 'pinned' && !pinned) return false;
    if (placement === 'unpinned' && pinned) return false;
  }

  return true;
}

export interface DispatchRequest {
  event: DispatchEventId;
  entry: WebhookEntrySummary;
  /** Set by "Send test" to target one endpoint regardless of its event filter. */
  webhookId?: string;
}

export interface DeliveryResult {
  id: string;
  label: string;
  ok: boolean;
  status: number | null;
  error?: string;
}

export const WEBHOOK_EVENTS: Array<{
  id: WebhookEventId;
  label: string;
  description: string;
}> = [
  {
    id: 'reflection.created',
    label: 'Created',
    description: 'A new reflection is saved for the first time.',
  },
  {
    id: 'reflection.updated',
    label: 'Updated',
    description: 'An existing reflection changes title, body or category.',
  },
  {
    id: 'reflection.located',
    label: 'Pinned',
    description: 'A reflection is pinned to a place on the map.',
  },
  {
    id: 'reflection.deleted',
    label: 'Deleted',
    description: 'A reflection is removed from the journal.',
  },
];

export const EVENT_IDS: WebhookEventId[] = WEBHOOK_EVENTS.map((event) => event.id);

export const EVENT_HEADLINES: Record<DispatchEventId, string> = {
  'reflection.created': 'New reflection',
  'reflection.updated': 'Reflection updated',
  'reflection.located': 'Reflection pinned to a place',
  'reflection.deleted': 'Reflection deleted',
  test: 'Test delivery',
};

/** Category accents, matching the pins on the Places Map. */
const CATEGORY_HEX: Record<string, string> = {
  Personal: '#7c3aed',
  Work: '#0284c7',
  Ideas: '#d97706',
  Gratitude: '#e11d48',
  Mindfulness: '#059669',
};

const NEUTRAL_HEX = '#475569';

const accentHex = (category: string): string => CATEGORY_HEX[category] ?? NEUTRAL_HEX;

// ── Destination allowlist ─────────────────────────────────────────────────
// Only these hosts and path shapes are ever contacted, so the dispatch
// endpoint cannot be steered at an arbitrary internal or third-party address.

const DISCORD_HOSTS = new Set([
  'discord.com',
  'discordapp.com',
  'ptb.discord.com',
  'canary.discord.com',
]);

const SLACK_HOSTS = new Set(['hooks.slack.com']);

/** Names that never belong to a public endpoint. */
const LOCAL_SUFFIXES = ['.local', '.localhost', '.internal', '.home.arpa', '.localdomain'];

const IPV4_LITERAL = /^\d{1,3}(\.\d{1,3}){3}$/;

const PRIVATE_V4_PREFIXES = [
  /^127\./,
  /^10\./,
  /^0\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
];

export function isLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || LOCAL_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;
  if (IPV4_LITERAL.test(host)) return PRIVATE_V4_PREFIXES.some((pattern) => pattern.test(host));
  // Bracketless IPv6 from URL.hostname; loopback and link/unique-local.
  if (host.includes(':')) return /^(::1?$|fc|fd|fe8|fe9|fea|feb)/.test(host);
  return false;
}

const isIpLiteral = (hostname: string): boolean =>
  IPV4_LITERAL.test(hostname) || hostname.includes(':');

export interface UrlCheck {
  /** False only for URLs that cannot be saved at all. */
  ok: boolean;
  reason?: string;
  /** Saveable, but carries a risk the user is choosing to accept. */
  warning?: string;
}

export function checkWebhookUrl(rawUrl: string, provider: WebhookProvider): UrlCheck {
  // Email has no destination to validate — it always goes to the signed-in
  // user's own verified address, resolved on the server.
  if (provider === 'email') return { ok: true };

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'That is not a valid URL.' };
  }

  if (provider === 'discord') {
    if (url.protocol !== 'https:') return { ok: false, reason: 'Webhook URLs must use https.' };
    if (!DISCORD_HOSTS.has(url.hostname)) {
      return { ok: false, reason: 'Discord webhooks must be on discord.com.' };
    }
    if (!url.pathname.startsWith('/api/webhooks/')) {
      return { ok: false, reason: 'That does not look like a Discord webhook URL.' };
    }
    return { ok: true };
  }

  if (provider === 'slack') {
    if (url.protocol !== 'https:') return { ok: false, reason: 'Webhook URLs must use https.' };
    if (!SLACK_HOSTS.has(url.hostname)) {
      return { ok: false, reason: 'Slack webhooks must be on hooks.slack.com.' };
    }
    if (!url.pathname.startsWith('/services/')) {
      return { ok: false, reason: 'That does not look like a Slack webhook URL.' };
    }
    return { ok: true };
  }

  // Generic destinations are the developer's own. Anything that is not an
  // attack primitive is allowed through, but risks are named and stay visible.
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, reason: 'Only http and https URLs can be used.' };
  }
  if (!url.hostname) {
    return { ok: false, reason: 'That URL has no host.' };
  }

  const risks: string[] = [];
  if (url.protocol === 'http:') {
    risks.push('Reflections travel unencrypted, so anyone on the network can read them.');
  }
  if (isLocalHostname(url.hostname)) {
    risks.push(
      'This address is resolved by the ReflectAI server, not your browser — once deployed it means the server itself, not your computer.'
    );
  } else if (isIpLiteral(url.hostname)) {
    risks.push('A raw IP address cannot be verified by certificate and may change.');
  }
  if (url.username || url.password) {
    risks.push('Credentials written into a URL are stored as-is and show up in logs.');
  }

  return risks.length > 0 ? { ok: true, warning: risks.join(' ') } : { ok: true };
}

/** Show enough of a URL to recognise it, never enough to reuse it. */
export function maskWebhookUrl(rawUrl: string): string {
  if (!rawUrl) return 'Your account email';
  try {
    const url = new URL(rawUrl);
    const segments = url.pathname.split('/').filter(Boolean);
    const head = segments.slice(0, 2).join('/');
    return `${url.hostname}/${head}/…`;
  } catch {
    return 'Invalid URL';
  }
}

// ── Payload building ──────────────────────────────────────────────────────

const clamp = (value: string, max: number): string =>
  value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1))}…`;

/**
 * Journal text is user and model generated. It is quoted into a chat message as
 * inert data: mentions are disabled on Discord and control characters escaped
 * for Slack, so nothing in a reflection can address a channel.
 */
const escapeSlack = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const placeLine = (entry: WebhookEntrySummary): string | null => {
  if (!entry.placeName) return null;
  return entry.placeAddress ? `${entry.placeName} — ${entry.placeAddress}` : entry.placeName;
};

function discordPayload(event: DispatchEventId, entry: WebhookEntrySummary): unknown {
  const fields: Array<{ name: string; value: string; inline: boolean }> = [
    { name: 'Category', value: clamp(entry.category || 'Uncategorised', 1024), inline: true },
    { name: 'Turns', value: String(entry.turnCount), inline: true },
  ];

  const place = placeLine(entry);
  if (place) fields.push({ name: 'Place', value: clamp(place, 1024), inline: false });

  return {
    username: 'ReflectAI',
    // No mention in a reflection can ever ping a channel.
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: clamp(entry.title || 'Untitled reflection', 256),
        description: clamp(entry.excerpt || '_No reflection text._', 4096),
        color: Number.parseInt(accentHex(entry.category).slice(1), 16),
        fields,
        timestamp: entry.updatedAt,
        footer: { text: `${EVENT_HEADLINES[event]} · ${event}` },
      },
    ],
  };
}

function slackPayload(event: DispatchEventId, entry: WebhookEntrySummary): unknown {
  const headline = EVENT_HEADLINES[event];
  const title = entry.title || 'Untitled reflection';
  const place = placeLine(entry);

  const context = [`*${escapeSlack(entry.category || 'Uncategorised')}*`, `${entry.turnCount} turns`];
  if (place) context.push(escapeSlack(place));

  return {
    text: clamp(`${headline}: ${escapeSlack(title)}`, 3000),
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: clamp(`${headline}`, 150), emoji: true },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: clamp(
            `*${escapeSlack(title)}*\n${escapeSlack(entry.excerpt || '_No reflection text._')}`,
            3000
          ),
        },
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: clamp(context.join('  ·  '), 3000) }],
      },
    ],
  };
}

/** A plain, self-describing envelope for anything that is not a chat app. */
function genericPayload(event: DispatchEventId, entry: WebhookEntrySummary): unknown {
  return {
    event,
    sentAt: new Date().toISOString(),
    reflection: {
      id: entry.id,
      title: entry.title,
      category: entry.category,
      excerpt: entry.excerpt,
      turnCount: entry.turnCount,
      place: entry.placeName
        ? {
            name: entry.placeName,
            address: entry.placeAddress ?? null,
            lat: entry.lat ?? null,
            lng: entry.lng ?? null,
          }
        : null,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    },
  };
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export interface EmailPayload {
  subject: string;
  html: string;
  text: string;
}

/**
 * Reflection text is user and model generated, so every interpolation is
 * HTML-escaped before it reaches a mail client.
 */
export function buildEmailPayload(
  event: DispatchEventId,
  entry: WebhookEntrySummary
): EmailPayload {
  const headline = EVENT_HEADLINES[event];
  const title = entry.title || 'Untitled reflection';
  const place = placeLine(entry);
  const accent = accentHex(entry.category);

  const meta = [entry.category || 'Uncategorised', `${entry.turnCount} turns`];
  if (place) meta.push(place);

  const text = [`${headline}: ${title}`, '', entry.excerpt || 'No reflection text.', '', meta.join(' · ')]
    .join('\n');

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
    <tr><td style="height:4px;background:${accent};"></td></tr>
    <tr><td style="padding:20px 24px;">
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#64748b;">${escapeHtml(headline)}</p>
      <h1 style="margin:0 0 12px;font-size:19px;line-height:1.3;color:#0f172a;">${escapeHtml(clamp(title, 240))}</h1>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.65;color:#334155;white-space:pre-wrap;">${escapeHtml(clamp(entry.excerpt || 'No reflection text.', 1200))}</p>
      <p style="margin:0;padding-top:14px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;">${escapeHtml(meta.join('  ·  '))}</p>
    </td></tr>
  </table>
  <p style="max-width:520px;margin:14px auto 0;font-size:11px;color:#94a3b8;text-align:center;">Sent by ReflectAI because you enabled this notification.</p>
</body></html>`;

  return { subject: clamp(`${headline}: ${title}`, 180), html, text };
}

export function buildWebhookPayload(
  provider: WebhookProvider,
  event: DispatchEventId,
  entry: WebhookEntrySummary
): unknown {
  if (provider === 'slack') return slackPayload(event, entry);
  if (provider === 'generic') return genericPayload(event, entry);
  if (provider === 'email') return buildEmailPayload(event, entry);
  return discordPayload(event, entry);
}
