import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

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
