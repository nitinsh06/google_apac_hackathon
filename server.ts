import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import firebaseConfig from './firebase-applet-config.json';
import { verifyFirebaseIdToken } from './src/server/firebaseAuth.ts';
import { readIntegrationPreferences } from './src/server/firestoreRest.ts';
import { assertPublicHost } from './src/server/netGuard.ts';
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

// Standard Fallback Ladder
const FALLBACK_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
  'gemini-3.7-flash',
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
  systemInstruction?: string
): Promise<{ text: string; modelUsed: string }> {
  const ai = getGeminiClient();
  let lastError: any = null;

  for (const model of FALLBACK_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: systemInstruction ? { systemInstruction } : undefined,
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
