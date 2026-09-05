import type { ReflectionMode } from '../types.ts';

export interface GenerateReflectionRequest {
  prompt: string;
  history?: Array<{ role: 'user' | 'model'; text: string }>;
  mode?: ReflectionMode;
  location?: {
    name: string;
    address?: string;
    lat?: number;
    lng?: number;
  } | null;
}

export interface GenerateReflectionResponse {
  success: boolean;
  response: string;
  modelUsed: string;
  mode: ReflectionMode;
}

export async function requestGeminiReflection(
  request: GenerateReflectionRequest
): Promise<GenerateReflectionResponse> {
  const res = await fetch('/api/gemini/reflect', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: 'Network error occurred' }));
    throw new Error(errorData.error || `Server responded with status ${res.status}`);
  }

  return res.json();
}

export async function requestSuggestedTitle(text: string): Promise<string> {
  try {
    const res = await fetch('/api/gemini/suggest-title', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) return '';
    const data = await res.json();
    return data.title || '';
  } catch (err) {
    console.warn('Could not auto-generate title:', err);
    return '';
  }
}
