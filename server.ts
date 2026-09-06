import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import firebaseConfig from './firebase-applet-config.json';
import { verifyFirebaseIdToken } from './src/server/firebaseAuth.ts';
import { readIntegrationPreferences } from './src/server/firestoreRest.ts';
import { assertPublicHost } from './src/server/netGuard.ts';
import { extractEntryInsight, summariseMonth } from './src/server/analyticsExtract.ts';
import { verifyGoogleIdToken } from './src/server/googleAuth.ts';
import {
  adminGetDocument,
  adminListCollection,
  adminWriteDocument,
} from './src/server/firestoreAdmin.ts';
import type { ExtractionSource, GenerateJson } from './src/server/analyticsExtract.ts';
import {
  ANALYTICS_SCHEMA_VERSION,
  clampNumber,
  clampText,
  monthKey,
} from './src/lib/analyticsTypes.ts';
import type { EntryInsight } from './src/lib/analyticsTypes.ts';
import {
  buildEmailPayload,
  buildWebhookPayload,
  checkWebhookUrl,
  EVENT_IDS,
  matchesEntryFilters,
  NOTIFICATION_MODES,
} from './src/lib/webhookTypes.ts';
import type {
  DeliveryResult,
  DispatchEventId,
  NotificationMode,
  WebhookEntrySummary,
} from './src/lib/webhookTypes.ts';

dotenv.config();

const app = express();
const PORT = 3000;

// Standard Fallback Ladder — conversation quality first.
const FALLBACK_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
  'gemini-3.7-flash',
];

// Extraction is a mechanical classification over text the user already wrote,
// not a conversation, so it runs the cheap end of the ladder first and only
// climbs if the lite models are unavailable.
const EXTRACTION_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3.6-flash',
];

// 1. Top-Level Request Deserialization (Ordering Guarantee)
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Lazy initializer for Gemini client to prevent crash if key is momentarily unset
function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is missing.');
  }
  return new GoogleGenAI({ apiKey });
}

// Resilient Model Fallback Helper
async function generateContentWithFallback(
  contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>,
  systemInstruction?: string,
  options?: { models?: string[]; responseSchema?: Record<string, unknown> }
): Promise<{ text: string; modelUsed: string }> {
  const ai = getGeminiClient();
  let lastError: any = null;

  for (const model of options?.models ?? FALLBACK_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          ...(systemInstruction ? { systemInstruction } : {}),
          ...(options?.responseSchema
            ? {
                responseMimeType: 'application/json',
                responseSchema: options.responseSchema,
                temperature: 0.2,
              }
            : {}),
        },
      });

      if (response && response.text) {
        return {
          text: response.text,
          modelUsed: model,
        };
      }
    } catch (err: any) {
      console.warn(`[Gemini Fallback] Model ${model} encountered error:`, err?.message || err);
      lastError = err;
      // Continue to next model in ladder
    }
  }

  throw lastError || new Error('All Gemini fallback models were exhausted.');
}

// 2. Defensive Payload Ingestion & API Routes
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
  });
});

app.post('/api/gemini/reflect', async (req, res) => {
  try {
    // Null-safe destructuring
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    const rawHistory = Array.isArray(body.history) ? body.history : [];
    const mode = typeof body.mode === 'string' ? body.mode : 'reflect';

    if (!prompt) {
      return res.status(400).json({
        error: 'Prompt cannot be empty.',
      });
    }

    // Sanitize and format history
    const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

    for (const item of rawHistory) {
      if (item && typeof item.text === 'string' && (item.role === 'user' || item.role === 'model')) {
        contents.push({
          role: item.role,
          parts: [{ text: item.text }],
        });
      }
    }

    // Append latest user prompt
    contents.push({
      role: 'user',
      parts: [{ text: prompt }],
    });

    let systemInstruction = `You are a thoughtful, empathetic, and intellectually astute AI Reflection & Journaling Companion.
Your role is to help the user unpack their thoughts, feelings, plans, and experiences with clarity, warmth, and depth.
Format your responses using clean Markdown with clear headings, bullet points, and emphasis where appropriate.`;

    const location = body.location && typeof body.location === 'object' ? body.location : null;
    if (location && typeof location.name === 'string' && location.name.trim()) {
      systemInstruction += `\n\nContextual Location: This journal reflection is pinned to "${location.name.trim()}"${
        location.address ? ` (${location.address.trim()})` : ''
      }. When appropriate or insightful, you may subtly acknowledge this physical setting, environment, or sense of place to enrich the user's reflection.`;
    }

    if (mode === 'reflect') {
      systemInstruction += `
Focus mode: DEEP REFLECTION.
- Actively mirror and validate core feelings and insights.
- Provide thoughtful reframing or alternative perspectives.
- Ask 1-2 open-ended, high-leverage introspection questions to invite deeper clarity.`;
    } else if (mode === 'brainstorm') {
      systemInstruction += `
Focus mode: CREATIVE BRAINSTORMING.
- Offer 4 to 6 divergent, innovative ideas or angles.
- Categorize the concepts (e.g., Quick Wins, High Impact, Experimental).
- Suggest one small, concrete step the user could take today.`;
    } else if (mode === 'summarize') {
      systemInstruction += `
Focus mode: SYNTHESIS & KEY TAKEAWAYS.
- Provide a crisp Executive Summary of the user's reflection or dialogue.
- Highlight Core Themes & Emotions identified.
- List Action Items or Decisions with clear checkable bullets.`;
    } else {
      systemInstruction += `
Focus mode: OPEN DIALOGUE.
- Engage warmly in a collaborative dialogue about whatever the user brings up.`;
    }

    const { text, modelUsed } = await generateContentWithFallback(contents, systemInstruction);

    return res.json({
      success: true,
      response: text,
      modelUsed,
      mode,
    });
  } catch (error: any) {
    console.error('Error generating reflection:', error);
    return res.status(500).json({
      error: error?.message || 'Failed to generate response from Gemini.',
    });
  }
});

app.post('/api/gemini/suggest-title', async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const text = typeof body.text === 'string' ? body.text.trim() : '';

    if (!text) {
      return res.status(400).json({ error: 'Text cannot be empty.' });
    }

    const contents = [
      {
        role: 'user' as const,
        parts: [
          {
            text: `Generate a short, poetic or descriptive 3-6 word title for this journal reflection. Return ONLY the title with no quotation marks or extra explanation:\n\n${text.slice(0, 1000)}`,
          },
        ],
      },
    ];

    const { text: title, modelUsed } = await generateContentWithFallback(
      contents,
      'You generate succinct, elegant journal entry titles. Return only the title text.'
    );

    return res.json({
      success: true,
      title: title.trim().replace(/^["']|["']$/g, ''),
      modelUsed,
    });
  } catch (error: any) {
    console.error('Error suggesting title:', error);
    return res.status(500).json({
      error: error?.message || 'Failed to suggest title.',
    });
  }
});

// ─── Analytics extraction ──────────────────────────────────────────────────
//
// Turns reflections into the structured readings the analytics tab charts.
// Authenticated per call, rate limited per user, and run on the cheap end of
// the model ladder — this is classification, not conversation.
//
// The endpoint returns the reading rather than writing it: Firestore writes in
// this app are made by the browser with the user's own token, so the server
// never needs a service account and the security rules stay the only authority
// on what may land in the document.

const ANALYTICS_RATE_WINDOW_MS = 60_000;
const ANALYTICS_RATE_MAX = 20;
const analyticsLimiter = new Map<string, { count: number; resetAt: number }>();

function overAnalyticsLimit(uid: string): boolean {
  const now = Date.now();
  const bucket = analyticsLimiter.get(uid);
  if (!bucket || bucket.resetAt <= now) {
    analyticsLimiter.set(uid, { count: 1, resetAt: now + ANALYTICS_RATE_WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > ANALYTICS_RATE_MAX;
}

setInterval(() => {
  const now = Date.now();
  for (const [uid, bucket] of analyticsLimiter) {
    if (bucket.resetAt <= now) analyticsLimiter.delete(uid);
  }
}, ANALYTICS_RATE_WINDOW_MS).unref?.();

/** Verifies the caller and applies the analytics budget. Returns null on failure. */
async function requireAnalyticsCaller(
  req: express.Request,
  res: express.Response
): Promise<string | null> {
  const header = req.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    res.status(401).json({ error: 'Missing Firebase ID token.' });
    return null;
  }

  let uid: string;
  try {
    uid = (await verifyFirebaseIdToken(token, firebaseConfig.projectId)).uid;
  } catch (error: any) {
    res.status(401).json({ error: error?.message || 'Could not verify your session.' });
    return null;
  }

  if (overAnalyticsLimit(uid)) {
    res.status(429).json({ error: 'Too many analysis requests. Try again shortly.' });
    return null;
  }
  return uid;
}

const generateAnalyticsJson: GenerateJson = ({ systemInstruction, userText, responseSchema }) =>
  generateContentWithFallback(
    [{ role: 'user', parts: [{ text: userText }] }],
    systemInstruction,
    { models: EXTRACTION_MODELS, responseSchema }
  );

/** Narrows the request body to the fields extraction is allowed to read. */
function toExtractionSource(raw: unknown): ExtractionSource | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;

  const id = clampText(record.id, 200);
  const text = typeof record.text === 'string' ? record.text.trim() : '';
  if (!id || text.length < 40) return null;

  return {
    id,
    title: clampText(record.title, 120),
    category: clampText(record.category, 40),
    createdAt: clampText(record.createdAt, 40) || new Date().toISOString(),
    text,
    turnCount: clampNumber(record.turnCount, 0, 500, 1),
  };
}

app.post('/api/analytics/extract', async (req, res) => {
  const uid = await requireAnalyticsCaller(req, res);
  if (!uid) return;

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const source = toExtractionSource(body.entry);
  if (!source) {
    return res.status(400).json({ error: 'Reflection is missing or too short to analyse.' });
  }

  try {
    const insight = await extractEntryInsight(source, generateAnalyticsJson);
    return res.json({ success: true, insight });
  } catch (error: any) {
    // The upstream message can carry provider detail; log it, return a generic.
    console.error('Analytics extraction failed:', error?.message || error);
    return res.status(502).json({ error: 'Could not analyse this reflection right now.' });
  }
});

/** Re-validates stored readings before they are summarised. */
function toInsightList(raw: unknown): EntryInsight[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is EntryInsight => {
      if (!item || typeof item !== 'object') return false;
      const record = item as Record<string, unknown>;
      return (
        typeof record.entryId === 'string' &&
        typeof record.entryCreatedAt === 'string' &&
        Array.isArray(record.domains)
      );
    })
    .slice(0, 200);
}

app.post('/api/analytics/monthly', async (req, res) => {
  const uid = await requireAnalyticsCaller(req, res);
  if (!uid) return;

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const month = clampText(body.month, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: 'Month must be formatted YYYY-MM.' });
  }

  const insights = toInsightList(body.insights).filter(
    (insight) => monthKey(insight.entryCreatedAt) === month
  );
  if (insights.length === 0) {
    return res.status(400).json({ error: 'That month has no analysed reflections yet.' });
  }

  try {
    const summary = await summariseMonth({ month, insights }, generateAnalyticsJson);
    return res.json({ success: true, summary });
  } catch (error: any) {
    console.error('Monthly summary failed:', error?.message || error);
    return res.status(502).json({ error: 'Could not write that monthly summary right now.' });
  }
});

// ─── Analytics background worker ───────────────────────────────────────────
//
// Eventarc delivers a Firestore write on users/{uid}/reflections/{entryId} to
// this route. The extraction that the browser used to debounce now happens
// server-side, so an entry is analysed whether or not the tab that wrote it is
// still open.
//
// The CloudEvent payload for Firestore is protobuf-encoded, which would need a
// proto runtime to read. It is not needed: the document path arrives in the
// `ce-subject` header as plain text, and the worker re-reads the document from
// Firestore anyway — the authoritative copy, not whatever the event carried.

const WORKER_ENABLED = process.env.ANALYTICS_WORKER_ENABLED === 'true';
const EVENTARC_SERVICE_ACCOUNT = process.env.EVENTARC_SERVICE_ACCOUNT ?? '';
const EVENTARC_AUDIENCE = process.env.EVENTARC_AUDIENCE ?? '';

const firestoreTarget = {
  projectId: firebaseConfig.projectId,
  databaseId: firebaseConfig.firestoreDatabaseId,
};

/** `documents/users/{uid}/reflections/{entryId}` → its two ids. */
function parseReflectionSubject(subject: string): { uid: string; entryId: string } | null {
  const match = /^documents\/users\/([^/]+)\/reflections\/([^/]+)$/.exec(subject.trim());
  if (!match) return null;

  const [, uid, entryId] = match;
  // Path segments come from the event, so refuse anything that could traverse.
  if (!uid || !entryId || uid.includes('..') || entryId.includes('..')) return null;
  return { uid, entryId };
}

/** The writer's own words. Model replies are not evidence about the writer. */
function writerTextFrom(turns: unknown): { text: string; count: number } {
  if (!Array.isArray(turns)) return { text: '', count: 0 };

  const parts: string[] = [];
  for (const turn of turns) {
    if (!turn || typeof turn !== 'object') continue;
    const record = turn as Record<string, unknown>;
    if (record.role !== 'user') continue;
    if (typeof record.text === 'string' && record.text.trim()) parts.push(record.text.trim());
  }
  return { text: parts.join('\n\n'), count: Array.isArray(turns) ? turns.length : 0 };
}

/**
 * Closes out any finished month for this user that has readings but no summary.
 * Event-driven rather than scheduled: the first entry written in a new month is
 * exactly the moment the previous one became complete.
 */
async function rollUpFinishedMonths(uid: string): Promise<string[]> {
  const [rawInsights, rawSummaries] = await Promise.all([
    adminListCollection(firestoreTarget, `users/${uid}/insights`),
    adminListCollection(firestoreTarget, `users/${uid}/monthlySummaries`),
  ]);

  const insights = rawInsights
    .map(toStoredInsight)
    .filter((insight): insight is EntryInsight => insight !== null);
  if (insights.length === 0) return [];

  const written = new Set(
    rawSummaries.map((summary) => clampText(summary.month, 7)).filter(Boolean)
  );

  const now = new Date();
  const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

  const months = [...new Set(insights.map((insight) => monthKey(insight.entryCreatedAt)))]
    .filter((month) => month !== 'unknown' && month < currentMonth && !written.has(month))
    .sort()
    // Only the most recent few, so a long-dormant account does not fan out into
    // a dozen model calls on one delivery.
    .slice(-2);

  const done: string[] = [];
  for (const month of months) {
    const forMonth = insights.filter((insight) => monthKey(insight.entryCreatedAt) === month);
    if (forMonth.length === 0) continue;

    const summary = await summariseMonth({ month, insights: forMonth }, generateAnalyticsJson);
    await adminWriteDocument(
      firestoreTarget,
      `users/${uid}/monthlySummaries/${month}`,
      summary as unknown as Record<string, unknown>
    );
    done.push(month);
  }
  return done;
}

/** Re-validates a stored reading read back through the admin path. */
function toStoredInsight(raw: Record<string, unknown>): EntryInsight | null {
  const entryId = clampText(raw.entryId, 200);
  const entryCreatedAt = clampText(raw.entryCreatedAt, 40);
  if (!entryId || !entryCreatedAt) return null;
  return { ...(raw as unknown as EntryInsight), entryId, entryCreatedAt };
}

app.post('/api/tasks/reflection-written', async (req, res) => {
  if (!WORKER_ENABLED) {
    return res.status(404).json({ error: 'Analytics worker is not enabled.' });
  }
  if (!EVENTARC_SERVICE_ACCOUNT || !EVENTARC_AUDIENCE) {
    console.error('Analytics worker is enabled but EVENTARC_SERVICE_ACCOUNT/AUDIENCE are unset.');
    return res.status(500).json({ error: 'Worker is misconfigured.' });
  }

  // This route is publicly routable because the service is, so the OIDC token
  // Eventarc attaches is the only thing separating it from the open internet.
  const header = req.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return res.status(401).json({ error: 'Missing identity token.' });

  try {
    await verifyGoogleIdToken(token, {
      audience: EVENTARC_AUDIENCE,
      serviceAccount: EVENTARC_SERVICE_ACCOUNT,
    });
  } catch (error: any) {
    console.warn('Rejected analytics worker delivery:', error?.message || error);
    return res.status(401).json({ error: 'Could not verify the delivery.' });
  }

  const subject = req.get('ce-subject') ?? '';
  const target = parseReflectionSubject(subject);
  if (!target) {
    // Ack rather than fail: retrying an event we will never understand just
    // burns the retry budget.
    console.warn('Analytics worker ignored an unexpected subject:', subject.slice(0, 120));
    return res.status(204).end();
  }

  const { uid, entryId } = target;

  try {
    const entry = await adminGetDocument(
      firestoreTarget,
      `users/${uid}/reflections/${entryId}`
    );

    if (!entry) {
      // Deleted between the write and this delivery: drop the reading with it.
      await adminWriteDocument(firestoreTarget, `users/${uid}/insights/${entryId}`, {
        deletedAt: new Date().toISOString(),
      }).catch(() => {});
      return res.status(204).end();
    }

    const { text, count } = writerTextFrom(entry.turns);
    if (text.length < 40) return res.status(204).end();

    const updatedAt = clampText(entry.updatedAt, 40);
    const existing = await adminGetDocument(
      firestoreTarget,
      `users/${uid}/insights/${entryId}`
    );

    // Firestore fires on every persisted turn; only re-read what has moved on.
    if (
      existing &&
      clampNumber(existing.schemaVersion, 0, 99, 0) === ANALYTICS_SCHEMA_VERSION &&
      clampText(existing.extractedAt, 40) >= updatedAt
    ) {
      return res.status(204).end();
    }

    const insight = await extractEntryInsight(
      {
        id: entryId,
        title: clampText(entry.title, 120),
        category: clampText(entry.category, 40),
        createdAt: clampText(entry.createdAt, 40) || new Date().toISOString(),
        text,
        turnCount: count,
      },
      generateAnalyticsJson
    );

    await adminWriteDocument(
      firestoreTarget,
      `users/${uid}/insights/${entryId}`,
      insight as unknown as Record<string, unknown>
    );

    const rolled = await rollUpFinishedMonths(uid).catch((error) => {
      console.error('Monthly rollup failed:', error?.message || error);
      return [] as string[];
    });

    return res.status(200).json({ ok: true, entryId, months: rolled });
  } catch (error: any) {
    // A 5xx tells Eventarc to retry with backoff, which is what we want for a
    // transient Firestore or model failure.
    console.error('Analytics worker failed:', error?.message || error);
    return res.status(500).json({ error: 'Extraction failed.' });
  }
});

app.get('/api/analytics/schema', (_req, res) => {
  res.json({
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    models: EXTRACTION_MODELS,
    // When the worker is live the browser must not also debounce an extraction,
    // or every entry is analysed twice and billed twice.
    workerEnabled: WORKER_ENABLED,
  });
});

// ─── Webhook dispatch ──────────────────────────────────────────────────────
//
// The browser never tells this endpoint where to POST. It names an event; the
// server reads the caller's own integration settings out of Firestore with the
// caller's token, and only ever contacts an allowlisted Discord or Slack host.

const WEBHOOK_TIMEOUT_MS = 8000;
const BLOCK_PRIVATE_TARGETS = process.env.WEBHOOK_BLOCK_PRIVATE_TARGETS === 'true';
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;

const rateLimiter = new Map<string, { count: number; resetAt: number }>();

function overRateLimit(uid: string): boolean {
  const now = Date.now();
  const bucket = rateLimiter.get(uid);

  if (!bucket || bucket.resetAt <= now) {
    rateLimiter.set(uid, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT_MAX;
}

// Keep the map from growing without bound on a long-lived instance.
setInterval(() => {
  const now = Date.now();
  for (const [uid, bucket] of rateLimiter) {
    if (bucket.resetAt <= now) rateLimiter.delete(uid);
  }
}, RATE_LIMIT_WINDOW_MS).unref?.();

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/**
 * Sends one notification email through Resend. The recipient is always the
 * caller's own verified address — never a value taken from the request — so
 * this cannot be turned into a mail relay.
 */
async function sendEmail(
  webhook: { id: string; label: string },
  event: DispatchEventId,
  entry: WebhookEntrySummary,
  recipient?: string
): Promise<DeliveryResult> {
  const base = { id: webhook.id, label: webhook.label };
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return { ...base, ok: false, status: null, error: 'Email is not configured on the server.' };
  }
  if (!recipient) {
    return {
      ...base,
      ok: false,
      status: null,
      error: 'Your account has no verified email address.',
    };
  }

  const { subject, html, text: plain } = buildEmailPayload(event, entry);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || 'ReflectAI <onboarding@resend.dev>',
        to: [recipient],
        subject,
        html,
        text: plain,
      }),
      signal: controller.signal,
    });

    return {
      ...base,
      ok: response.ok,
      status: response.status,
      error: response.ok ? undefined : `Mail provider replied ${response.status}.`,
    };
  } catch (error: any) {
    return {
      ...base,
      ok: false,
      status: null,
      error: error?.name === 'AbortError' ? 'Mail provider timed out.' : 'Could not send the email.',
    };
  } finally {
    clearTimeout(timer);
  }
}

const isDispatchEvent = (value: unknown): value is DispatchEventId =>
  value === 'test' || EVENT_IDS.includes(value as (typeof EVENT_IDS)[number]);

const text = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.slice(0, max) : '';

const coordinate = (value: unknown, limit: number): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit
    ? value
    : undefined;

/** Reflection content arrives from the browser, so re-shape it strictly. */
function toEntrySummary(raw: unknown): WebhookEntrySummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;

  const id = text(record.id, 200);
  if (!id) return null;

  const turnCount =
    typeof record.turnCount === 'number' && Number.isFinite(record.turnCount)
      ? Math.max(0, Math.min(9999, Math.trunc(record.turnCount)))
      : 0;

  const summary: WebhookEntrySummary = {
    id,
    title: text(record.title, 240) || 'Untitled reflection',
    category: text(record.category, 60),
    excerpt: text(record.excerpt, 1500),
    turnCount,
    createdAt: text(record.createdAt, 40),
    updatedAt: text(record.updatedAt, 40) || new Date().toISOString(),
    modes: Array.isArray(record.modes)
      ? (record.modes.filter((mode) =>
          NOTIFICATION_MODES.includes(mode as NotificationMode)
        ) as NotificationMode[])
      : [],
  };

  const placeName = text(record.placeName, 200);
  if (placeName) summary.placeName = placeName;
  const placeAddress = text(record.placeAddress, 300);
  if (placeAddress) summary.placeAddress = placeAddress;

  const lat = coordinate(record.lat, 90);
  const lng = coordinate(record.lng, 180);
  if (lat !== undefined && lng !== undefined) {
    summary.lat = lat;
    summary.lng = lng;
  }

  return summary;
}

app.post('/api/webhooks/dispatch', async (req, res) => {
  const header = req.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    return res.status(401).json({ error: 'Missing Firebase ID token.' });
  }

  let uid: string;
  let callerEmail: string | undefined;
  try {
    const verified = await verifyFirebaseIdToken(token, firebaseConfig.projectId);
    uid = verified.uid;
    callerEmail = verified.email;
  } catch (error: any) {
    return res.status(401).json({ error: error?.message || 'Could not verify your session.' });
  }

  if (overRateLimit(uid)) {
    return res.status(429).json({ error: 'Too many webhook deliveries. Try again shortly.' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  if (!isDispatchEvent(body.event)) {
    return res.status(400).json({ error: 'Unknown webhook event.' });
  }
  const entry = toEntrySummary(body.entry);
  if (!entry) {
    return res.status(400).json({ error: 'Reflection payload is missing or malformed.' });
  }
  const targetId = typeof body.webhookId === 'string' ? body.webhookId : null;

  let preferences;
  try {
    preferences = await readIntegrationPreferences({
      projectId: firebaseConfig.projectId,
      databaseId: firebaseConfig.firestoreDatabaseId,
      uid,
      idToken: token,
    });
  } catch (error: any) {
    console.error('Could not read integration settings:', error);
    return res.status(502).json({ error: 'Could not read your integration settings.' });
  }

  // A "Send test" names one endpoint and bypasses its filters on purpose.
  // Everything else must clear both the lifecycle event and the entry filters,
  // re-checked here because the browser's copy of them is only a shortcut.
  const targets = (preferences?.webhooks ?? []).filter((webhook) => {
    if (targetId) return webhook.id === targetId;
    return (
      webhook.enabled &&
      webhook.events.includes(body.event) &&
      matchesEntryFilters(webhook, entry)
    );
  });

  if (targets.length === 0) {
    return res.json({ delivered: [] as DeliveryResult[] });
  }

  const delivered = await Promise.all(
    targets.map(async (webhook): Promise<DeliveryResult> => {
      // Email never takes a destination from the request. It goes to the
      // address inside the verified ID token, so this endpoint cannot be used
      // to mail anyone but the person who called it.
      if (webhook.provider === 'email') {
        return sendEmail(webhook, body.event, entry, callerEmail);
      }

      const check = checkWebhookUrl(webhook.url, webhook.provider);
      if (!check.ok) {
        return { id: webhook.id, label: webhook.label, ok: false, status: null, error: check.reason };
      }

      // Discord and Slack are pinned by hostname already. Generic endpoints are
      // the developer's own, so loopback and private addresses are allowed by
      // default — set WEBHOOK_BLOCK_PRIVATE_TARGETS=true to refuse them on a
      // shared deployment.
      if (webhook.provider === 'generic' && BLOCK_PRIVATE_TARGETS) {
        try {
          await assertPublicHost(new URL(webhook.url).hostname);
        } catch (error: any) {
          return {
            id: webhook.id,
            label: webhook.label,
            ok: false,
            status: null,
            error: error?.message || 'That host cannot be reached.',
          };
        }
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

      try {
        const response = await fetch(webhook.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(buildWebhookPayload(webhook.provider, body.event, entry)),
          // Never chase a redirect off the allowlisted host.
          redirect: 'manual',
          signal: controller.signal,
        });

        return {
          id: webhook.id,
          label: webhook.label,
          ok: response.status >= 200 && response.status < 300,
          status: response.status,
          // The upstream body is deliberately not forwarded to the browser.
          error:
            response.status >= 200 && response.status < 300
              ? undefined
              : `Endpoint replied ${response.status}.`,
        };
      } catch (error: any) {
        const aborted = error?.name === 'AbortError';
        return {
          id: webhook.id,
          label: webhook.label,
          ok: false,
          status: null,
          error: aborted ? 'Endpoint timed out.' : 'Could not reach the endpoint.',
        };
      } finally {
        clearTimeout(timer);
      }
    })
  );

  return res.json({ delivered });
});

// 3. Vite Middleware integration
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
