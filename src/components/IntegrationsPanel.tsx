import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Mail,
  Pencil,
  Plus,
  Send,
  Trash2,
  TriangleAlert,
  Webhook,
  X,
} from 'lucide-react';
import {
  saveWebhooks,
  sendTestDelivery,
  subscribeIntegrationPreferences,
} from '../lib/webhooks.ts';
import {
  checkWebhookUrl,
  maskWebhookUrl,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_MODES,
  WEBHOOK_EVENTS,
} from '../lib/webhookTypes.ts';
import type {
  NotificationMode,
  PlacementFilter,
  WebhookConfig,
  WebhookEventId,
  WebhookProvider,
} from '../lib/webhookTypes.ts';

interface IntegrationsPanelProps {
  userId: string;
}

const PROVIDERS: Array<{
  id: WebhookProvider;
  label: string;
  hint: string;
  accent: string;
  placeholder: string;
}> = [
  {
    id: 'discord',
    label: 'Discord',
    hint: 'Server Settings → Integrations → Webhooks → Copy Webhook URL. Arrives as a rich embed.',
    accent: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    placeholder: 'https://discord.com/api/webhooks/…',
  },
  {
    id: 'slack',
    label: 'Slack',
    hint: 'Slack app → Incoming Webhooks → Add New Webhook to Workspace. Arrives as Block Kit.',
    accent: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    placeholder: 'https://hooks.slack.com/services/…',
  },
  {
    id: 'email',
    label: 'Email',
    hint: 'Sent to your own account address. Nothing to paste, and no other recipient can be set.',
    accent: 'bg-blue-50 text-blue-700 border-blue-200',
    placeholder: '',
  },
  {
    id: 'generic',
    label: 'Other',
    hint: 'Any HTTP endpoint — an automation runner, a bot, a listener on your own machine. Receives plain JSON.',
    accent: 'bg-slate-100 text-slate-700 border-slate-200',
    placeholder: 'https://example.com/hooks/reflectai',
  },
];

const providerMeta = (provider: WebhookProvider) =>
  PROVIDERS.find((candidate) => candidate.id === provider) ?? PROVIDERS[0];

const newId = (): string =>
  `wh-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const relativeTime = (iso?: string | null): string => {
  const ms = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(ms)) return '';
  const seconds = Math.round((Date.now() - ms) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

interface DraftState {
  id: string | null;
  label: string;
  provider: WebhookProvider;
  url: string;
  events: WebhookEventId[];
  categories: string[];
  modes: NotificationMode[];
  placement: PlacementFilter;
}

const emptyDraft = (): DraftState => ({
  id: null,
  label: '',
  provider: 'discord',
  url: '',
  events: ['reflection.created', 'reflection.located'],
  categories: [],
  modes: [],
  placement: 'any',
});

const MODE_LABELS: Record<NotificationMode, string> = {
  reflect: 'Reflect',
  summarize: 'Summarize',
  brainstorm: 'Brainstorm',
  chat: 'Chat',
};

const PLACEMENT_OPTIONS: Array<{ id: PlacementFilter; label: string }> = [
  { id: 'any', label: 'Anywhere' },
  { id: 'pinned', label: 'Pinned to a place' },
  { id: 'unpinned', label: 'Not pinned' },
];

/** One-line summary of a saved endpoint's entry filters, or null if unfiltered. */
function filterSummary(webhook: WebhookConfig): string | null {
  const parts: string[] = [];
  if (webhook.categories?.length) parts.push(webhook.categories.join(', '));
  if (webhook.modes?.length) parts.push(webhook.modes.map((m) => MODE_LABELS[m]).join(', '));
  if (webhook.placement && webhook.placement !== 'any') {
    parts.push(webhook.placement === 'pinned' ? 'pinned only' : 'unpinned only');
  }
  return parts.length ? parts.join(' · ') : null;
}

export const IntegrationsPanel: React.FC<IntegrationsPanelProps> = ({ userId }) => {
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    const unsubscribe = subscribeIntegrationPreferences(
      userId,
      (preferences) => {
        setWebhooks(preferences.webhooks);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsubscribe();
  }, [userId]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const urlCheck = useMemo(() => {
    if (!draft || !draft.url.trim()) return null;
    return checkWebhookUrl(draft.url.trim(), draft.provider);
  }, [draft]);

  const urlProblem = urlCheck && !urlCheck.ok ? urlCheck.reason ?? 'That URL cannot be used.' : null;
  const urlWarning = urlCheck?.ok ? urlCheck.warning ?? null : null;

  const persist = async (next: WebhookConfig[]) => {
    setSaving(true);
    try {
      await saveWebhooks(userId, next);
      setWebhooks(next);
      return true;
    } catch (error: any) {
      console.error('Could not save integrations:', error);
      setNotice({ tone: 'error', text: 'Could not save to Firestore. Check your connection.' });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft) return;

    const label = draft.label.trim();
    const url = draft.url.trim();

    if (!label) return setFormError('Give this endpoint a name you will recognise.');
    // Email has no destination to enter — it always goes to your own address.
    if (!url && draft.provider !== 'email') {
      return setFormError('Paste the webhook URL from Discord or Slack.');
    }

    const check = checkWebhookUrl(url, draft.provider);
    if (!check.ok) return setFormError(check.reason ?? 'That URL cannot be used.');
    if (draft.events.length === 0) return setFormError('Choose at least one event to send.');

    setFormError(null);

    const existing = draft.id ? webhooks.find((webhook) => webhook.id === draft.id) : undefined;
    const record: WebhookConfig = {
      id: draft.id ?? newId(),
      label,
      provider: draft.provider,
      url,
      events: draft.events,
      categories: draft.categories,
      modes: draft.modes,
      placement: draft.placement,
      enabled: existing?.enabled ?? true,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      lastDeliveryAt: existing?.lastDeliveryAt ?? null,
      lastStatus: existing?.lastStatus ?? null,
      lastError: existing?.lastError ?? null,
    };

    const next = existing
      ? webhooks.map((webhook) => (webhook.id === record.id ? record : webhook))
      : [...webhooks, record];

    if (await persist(next)) {
      setDraft(null);
      setNotice({ tone: 'ok', text: existing ? 'Endpoint updated.' : 'Endpoint added.' });
    }
  };

  const handleToggle = async (webhook: WebhookConfig) => {
    await persist(
      webhooks.map((candidate) =>
        candidate.id === webhook.id ? { ...candidate, enabled: !candidate.enabled } : candidate
      )
    );
  };

  const handleDelete = async (webhookId: string) => {
    if (await persist(webhooks.filter((webhook) => webhook.id !== webhookId))) {
      setConfirmDeleteId(null);
      setNotice({ tone: 'ok', text: 'Endpoint removed.' });
    }
  };

  const handleTest = async (webhook: WebhookConfig) => {
    setTestingId(webhook.id);
    setNotice(null);
    try {
      const result = await sendTestDelivery(webhook);
      setNotice(
        result.ok
          ? { tone: 'ok', text: `Test message delivered to ${webhook.label}.` }
          : { tone: 'error', text: result.error ?? `Delivery to ${webhook.label} failed.` }
      );
    } catch (error: any) {
      setNotice({ tone: 'error', text: error?.message || 'Could not reach the dispatch service.' });
    } finally {
      setTestingId(null);
    }
  };

  return (
    <>
      <section className="rounded-xl border border-slate-200 bg-surface shadow-xs">
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h3 className="text-sm font-bold tracking-tight text-slate-900">Webhooks</h3>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
              Send your reflections to Discord, Slack, your inbox, or any endpoint of your own, as you write them.
            </p>
          </div>
          {!draft && webhooks.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setDraft(emptyDraft());
                setFormError(null);
              }}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-accent-fg shadow-sm transition-colors hover:bg-accent-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </button>
          )}
        </header>

        {notice && (
          <p
            role="status"
            className={`flex items-start gap-2 border-b px-4 py-2.5 text-xs font-medium sm:px-5 ${
              notice.tone === 'ok'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-rose-200 bg-rose-50 text-rose-800'
            }`}
          >
            {notice.tone === 'ok' ? (
              <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" />
            ) : (
              <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
            )}
            {notice.text}
          </p>
        )}

        {loading ? (
          <p className="flex items-center justify-center gap-2 px-4 py-8 text-xs text-slate-600">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading your endpoints…
          </p>
        ) : webhooks.length === 0 && !draft ? (
          <div className="px-4 py-8 text-center sm:px-5">
            <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
              <Webhook className="h-5 w-5" />
            </span>
            <p className="text-sm font-semibold text-slate-900">No endpoints yet</p>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-slate-600">
              Paste a Discord or Slack webhook URL and pick the events you want to hear about.
            </p>
            <button
              type="button"
              onClick={() => {
                setDraft(emptyDraft());
                setFormError(null);
              }}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-accent-fg shadow-sm transition-colors hover:bg-accent-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              Add endpoint
            </button>
          </div>
        ) : (
          <ul className="px-4 sm:px-5">
            {webhooks.map((webhook) => {
              const meta = providerMeta(webhook.provider);
              const isTesting = testingId === webhook.id;
              const risk = checkWebhookUrl(webhook.url, webhook.provider).warning ?? null;
              return (
                <li key={webhook.id} className="border-b border-slate-100 py-4 last:border-b-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-bold ${meta.accent}`}
                        >
                          {meta.label}
                        </span>
                        <h4 className="truncate text-sm font-semibold text-slate-900">
                          {webhook.label}
                        </h4>
                        {!webhook.enabled && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                            Paused
                          </span>
                        )}
                        {risk && (
                          <span
                            title={risk}
                            className="inline-flex items-center gap-1 rounded border border-amber-400 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-900"
                          >
                            <TriangleAlert className="h-3 w-3" aria-hidden="true" />
                            Insecure
                          </span>
                        )}
                      </div>

                      {risk && (
                        <p className="mt-1.5 text-[11px] leading-relaxed text-amber-900">{risk}</p>
                      )}

                      <p className="mt-1 truncate font-mono text-[11px] text-slate-600">
                        {maskWebhookUrl(webhook.url)}
                      </p>

                      <ul className="mt-2 flex flex-wrap gap-1">
                        {WEBHOOK_EVENTS.filter((event) => webhook.events.includes(event.id)).map(
                          (event) => (
                            <li
                              key={event.id}
                              className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-700"
                            >
                              {event.id}
                            </li>
                          )
                        )}
                      </ul>

                      {filterSummary(webhook) && (
                        <p className="mt-1.5 text-[11px] text-slate-600">
                          <span className="font-semibold text-slate-700">Only for:</span>{' '}
                          {filterSummary(webhook)}
                        </p>
                      )}

                      {webhook.lastDeliveryAt && (
                        <p
                          className={`mt-2 inline-flex items-center gap-1.5 text-[11px] ${
                            webhook.lastStatus === 'ok' ? 'text-slate-600' : 'text-rose-700'
                          }`}
                        >
                          {webhook.lastStatus === 'ok' ? (
                            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                          ) : (
                            <AlertCircle className="h-3 w-3" />
                          )}
                          {webhook.lastStatus === 'ok'
                            ? `Delivered ${relativeTime(webhook.lastDeliveryAt)}`
                            : webhook.lastError || 'Last delivery failed'}
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleTest(webhook)}
                        disabled={isTesting || saving}
                        title="Send a test message"
                        aria-label={`Send a test message to ${webhook.label}`}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                      >
                        {isTesting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Send className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDraft({
                            id: webhook.id,
                            label: webhook.label,
                            provider: webhook.provider,
                            url: webhook.url,
                            events: webhook.events,
                            categories: webhook.categories ?? [],
                            modes: webhook.modes ?? [],
                            placement: webhook.placement ?? 'any',
                          });
                          setFormError(null);
                        }}
                        title="Edit"
                        aria-label={`Edit ${webhook.label}`}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(webhook.id)}
                        title="Remove"
                        aria-label={`Remove ${webhook.label}`}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-rose-50 hover:text-rose-700 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={webhook.enabled}
                        aria-label={`${webhook.enabled ? 'Pause' : 'Resume'} ${webhook.label}`}
                        onClick={() => handleToggle(webhook)}
                        disabled={saving}
                        className={`ml-1 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors disabled:opacity-50 cursor-pointer ${
                          webhook.enabled ? 'bg-accent' : 'bg-slate-300'
                        }`}
                      >
                        <span
                          className={`h-4 w-4 rounded-full bg-surface shadow-sm transition-transform ${
                            webhook.enabled ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  {confirmDeleteId === webhook.id && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5">
                      <p className="text-xs text-rose-900">
                        Remove <span className="font-semibold">{webhook.label}</span>? Deliveries
                        stop immediately.
                      </p>
                      <span className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="rounded-lg border border-slate-200 bg-surface px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 cursor-pointer"
                        >
                          Keep
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(webhook.id)}
                          disabled={saving}
                          className="rounded-lg bg-danger px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-danger-strong disabled:opacity-60 cursor-pointer"
                        >
                          Remove
                        </button>
                      </span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* Add / edit form */}
        {draft && (
          <form onSubmit={handleSubmit} className="border-t border-slate-200 bg-slate-50 px-4 py-4 sm:px-5">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-xs font-bold text-slate-900">
                {draft.id ? 'Edit endpoint' : 'New endpoint'}
              </h4>
              <button
                type="button"
                onClick={() => {
                  setDraft(null);
                  setFormError(null);
                }}
                aria-label="Cancel"
                className="flex h-7 w-7 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <fieldset className="mt-3">
              <legend className="text-[11px] font-semibold text-slate-900">Destination</legend>
              <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {PROVIDERS.map((provider) => (
                  <label
                    key={provider.id}
                    className={`flex-1 cursor-pointer rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                      draft.provider === provider.id
                        ? 'border-blue-500 bg-surface text-blue-700 ring-1 ring-blue-500/30'
                        : 'border-slate-200 bg-surface text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="provider"
                      value={provider.id}
                      checked={draft.provider === provider.id}
                      onChange={() => setDraft({ ...draft, provider: provider.id })}
                      className="sr-only"
                    />
                    {provider.label}
                  </label>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600">
                {providerMeta(draft.provider).hint}
              </p>
            </fieldset>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-[11px] font-semibold text-slate-900">Name</span>
                <input
                  type="text"
                  value={draft.label}
                  onChange={(event) => setDraft({ ...draft, label: event.target.value })}
                  placeholder="#journal in my server"
                  maxLength={60}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-surface px-3 py-2 text-xs text-slate-900 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </label>

              {draft.provider === 'email' ? (
                <div className="block">
                  <span className="text-[11px] font-semibold text-slate-900">Recipient</span>
                  <p className="mt-1 flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-[11px] text-slate-700">
                    <Mail className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
                    Your account email
                  </p>
                  <span className="mt-1 block text-[11px] leading-relaxed text-slate-600">
                    Taken from your verified sign-in, so notifications can only ever reach you.
                  </span>
                </div>
              ) : (
              <label className="block">
                <span className="text-[11px] font-semibold text-slate-900">Webhook URL</span>
                <input
                  type="url"
                  value={draft.url}
                  onChange={(event) => setDraft({ ...draft, url: event.target.value })}
                  placeholder={providerMeta(draft.provider).placeholder}
                  autoComplete="off"
                  spellCheck={false}
                  className={`mt-1 w-full rounded-lg border bg-surface px-3 py-2 font-mono text-[11px] text-slate-900 placeholder:font-sans placeholder:text-slate-500 focus:outline-none focus:ring-2 ${
                    urlProblem
                      ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/20'
                      : urlWarning
                      ? 'border-amber-400 focus:border-amber-500 focus:ring-amber-500/20'
                      : 'border-slate-200 focus:border-blue-500 focus:ring-blue-500/20'
                  }`}
                />
                {urlProblem && <span className="mt-1 block text-[11px] text-rose-700">{urlProblem}</span>}
              </label>
              )}
            </div>

            {/* Allowed, but the risk is spelled out and stays visible after saving. */}
            {urlWarning && (
              <div className="mt-3 flex items-start gap-2.5 rounded-lg border-2 border-amber-400 bg-amber-50 px-3 py-2.5">
                <TriangleAlert className="mt-px h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-amber-900">
                    Insecure endpoint
                  </p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-amber-900">{urlWarning}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-amber-800">
                    You can save it anyway — useful against a listener on your own machine.
                  </p>
                </div>
              </div>
            )}

            {draft.provider === 'generic' && (
              <details className="mt-3 rounded-lg border border-slate-200 bg-surface px-3 py-2">
                <summary className="cursor-pointer text-[11px] font-semibold text-slate-900">
                  What your endpoint will receive
                </summary>
                <pre className="thin-scroll mt-2 overflow-x-auto rounded bg-inverse p-3 font-mono text-[10px] leading-relaxed text-inverse-fg">{`POST  content-type: application/json

{
  "event": "reflection.created",
  "sentAt": "2026-09-06T10:24:11.204Z",
  "reflection": {
    "id": "entry-1757150651204",
    "title": "Morning Fog & Reflection",
    "category": "Mindfulness",
    "excerpt": "Sitting quietly among the redwoods…",
    "turnCount": 2,
    "place": {
      "name": "Golden Gate Park",
      "address": "San Francisco, CA, USA",
      "lat": 37.7694,
      "lng": -122.4862
    },
    "createdAt": "2026-08-25T08:12:00.000Z",
    "updatedAt": "2026-09-06T10:24:11.204Z"
  }
}`}</pre>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
                  <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[10px]">place</code>{' '}
                  is <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[10px]">null</code>{' '}
                  when the reflection is not pinned.
                </p>
              </details>
            )}

            <fieldset className="mt-3">
              <legend className="text-[11px] font-semibold text-slate-900">Send on</legend>
              <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                {WEBHOOK_EVENTS.map((event) => {
                  const checked = draft.events.includes(event.id);
                  return (
                    <label
                      key={event.id}
                      className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 transition-colors ${
                        checked
                          ? 'border-blue-500 bg-surface ring-1 ring-blue-500/30'
                          : 'border-slate-200 bg-surface hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setDraft({
                            ...draft,
                            events: checked
                              ? draft.events.filter((id) => id !== event.id)
                              : [...draft.events, event.id],
                          })
                        }
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-blue-600"
                      />
                      <span className="min-w-0">
                        <span className="block font-mono text-[11px] font-semibold text-slate-900">
                          {event.id}
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-600">
                          {event.description}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {/* Which kinds of entry qualify. Nothing selected means every kind. */}
            <div className="mt-3 rounded-lg border border-slate-200 bg-surface p-3">
              <p className="text-[11px] font-semibold text-slate-900">Only for these entries</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">
                Leave a row untouched to include everything in it.
              </p>

              <fieldset className="mt-2.5">
                <legend className="text-[11px] font-medium text-slate-700">Category</legend>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {NOTIFICATION_CATEGORIES.map((category) => {
                    const checked = draft.categories.includes(category);
                    return (
                      <label
                        key={category}
                        className={`cursor-pointer rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                          checked
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-slate-200 bg-surface text-slate-700 hover:border-slate-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setDraft({
                              ...draft,
                              categories: checked
                                ? draft.categories.filter((value) => value !== category)
                                : [...draft.categories, category],
                            })
                          }
                          className="sr-only"
                        />
                        {category}
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <fieldset className="mt-3">
                <legend className="text-[11px] font-medium text-slate-700">Reflection mode</legend>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {NOTIFICATION_MODES.map((mode) => {
                    const checked = draft.modes.includes(mode);
                    return (
                      <label
                        key={mode}
                        className={`cursor-pointer rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                          checked
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-slate-200 bg-surface text-slate-700 hover:border-slate-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setDraft({
                              ...draft,
                              modes: checked
                                ? draft.modes.filter((value) => value !== mode)
                                : [...draft.modes, mode],
                            })
                          }
                          className="sr-only"
                        />
                        {MODE_LABELS[mode]}
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <fieldset className="mt-3">
                <legend className="text-[11px] font-medium text-slate-700">Location</legend>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {PLACEMENT_OPTIONS.map((option) => (
                    <label
                      key={option.id}
                      className={`cursor-pointer rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                        draft.placement === option.id
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-slate-200 bg-surface text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="placement"
                        checked={draft.placement === option.id}
                        onChange={() => setDraft({ ...draft, placement: option.id })}
                        className="sr-only"
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>

            {formError && (
              <p className="mt-3 flex items-start gap-1.5 text-[11px] font-medium text-rose-700">
                <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
                {formError}
              </p>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDraft(null);
                  setFormError(null);
                }}
                className="rounded-lg border border-slate-200 bg-surface px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-accent-fg shadow-sm transition-colors hover:bg-accent-strong disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 cursor-pointer"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {draft.id ? 'Save changes' : 'Add endpoint'}
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-surface shadow-xs">
        <header className="border-b border-slate-200 px-4 py-3 sm:px-5">
          <h3 className="text-sm font-bold tracking-tight text-slate-900">How delivery works</h3>
        </header>
        <div className="space-y-2.5 px-4 py-4 text-xs leading-relaxed text-slate-600 sm:px-5">
          <p>
            Deliveries are sent by the ReflectAI server, never from your browser, and your webhook
            URL is only ever read from your own account. Discord and Slack are pinned to their own
            hostnames. Anything else is resolved from the server, so an endpoint on your own machine
            works in development but not once this is deployed — those are flagged as insecure
            rather than blocked.
          </p>
          <p>
            Edits are grouped: typing a title fires one{' '}
            <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[10px] text-slate-700">
              reflection.updated
            </code>{' '}
            after you stop, not one per keystroke. Creations, pins and deletions are sent
            immediately.
          </p>
          <p>Mentions inside a reflection are stripped, so nothing you write can ping a channel.</p>
        </div>
      </section>
    </>
  );
};
