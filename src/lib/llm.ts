import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Single LLM entry point for the app.
 *
 * Primary: OpenRouter's OpenAI-compatible chat completions API (default model:
 * Z.ai GLM 5.3 Flash), configured with OPENROUTER_API_KEY and optional OPENROUTER_MODEL.
 * Fallback: Gemini (GEMINI_API_KEY) when OpenRouter is unconfigured or a call fails
 * (e.g. 402 when the OpenRouter account is out of credits).
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const DEFAULT_LLM_MODEL = 'z-ai/glm-5.3-flash';
const GEMINI_FALLBACK_MODEL = 'gemini-2.5-flash';
const FALLBACK_WARN_INTERVAL_MS = 10 * 60 * 1000;

let lastFallbackWarnAt = 0;

function readEnv(name: string): string | undefined {
  // Local .env.local values pulled via the Vercel CLI can carry a literal trailing "\n".
  const value = process.env[name]?.replace(/\\n$/, '').trim();
  return value || undefined;
}

export function isLLMConfigured(): boolean {
  return Boolean(readEnv('OPENROUTER_API_KEY') || readEnv('GEMINI_API_KEY'));
}

export interface LLMImage {
  /** Base64-encoded image bytes (no data: prefix). */
  data: string;
  mimeType: string;
}

export interface GenerateTextOptions {
  system?: string;
  /** Images sent alongside the prompt (the default GLM 5.3 Flash model accepts image input). */
  images?: LLMImage[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  /** Ask for a JSON object response. Only use when the prompt expects an object, not an array. */
  jsonObject?: boolean;
  model?: string;
}

async function generateWithOpenRouter(apiKey: string, prompt: string, options: GenerateTextOptions): Promise<string> {
  const images = options.images ?? [];
  const userContent = images.length === 0
    ? prompt
    : [
        { type: 'text', text: prompt },
        ...images.map(image => ({
          type: 'image_url',
          image_url: { url: `data:${image.mimeType};base64,${image.data}` },
        })),
      ];

  const messages = [
    ...(options.system ? [{ role: 'system', content: options.system }] : []),
    { role: 'user', content: userContent },
  ];

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://fitdash.viraat.dev',
      'X-Title': 'Fit Dash',
    },
    body: JSON.stringify({
      model: options.model ?? readEnv('OPENROUTER_MODEL') ?? DEFAULT_LLM_MODEL,
      messages,
      temperature: options.temperature ?? 0.2,
      ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
      ...(options.jsonObject ? { response_format: { type: 'json_object' } } : {}),
    }),
    signal: AbortSignal.timeout(options.timeoutMs ?? 60_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`OpenRouter ${response.status}: ${body.slice(0, 300)}`);
  }

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string | null } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenRouter returned an empty response');
  return content;
}

async function generateWithGemini(apiKey: string, prompt: string, options: GenerateTextOptions): Promise<string> {
  const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
    model: GEMINI_FALLBACK_MODEL,
    ...(options.system ? { systemInstruction: options.system } : {}),
    generationConfig: {
      temperature: options.temperature ?? 0.2,
      ...(options.maxTokens ? { maxOutputTokens: options.maxTokens } : {}),
      ...(options.jsonObject ? { responseMimeType: 'application/json' } : {}),
    },
  });
  const images = options.images ?? [];
  const result = await model.generateContent(
    images.length === 0 ? prompt : [prompt, ...images.map(image => ({ inlineData: image }))]
  );
  const text = result.response.text();
  if (!text) throw new Error('Gemini returned an empty response');
  return text;
}

export async function generateText(prompt: string, options: GenerateTextOptions = {}): Promise<string> {
  const openRouterKey = readEnv('OPENROUTER_API_KEY');
  const geminiKey = readEnv('GEMINI_API_KEY');

  if (openRouterKey) {
    try {
      return await generateWithOpenRouter(openRouterKey, prompt, options);
    } catch (err) {
      if (!geminiKey) throw err;
      if (Date.now() - lastFallbackWarnAt > FALLBACK_WARN_INTERVAL_MS) {
        lastFallbackWarnAt = Date.now();
        console.warn('[llm] OpenRouter failed, falling back to Gemini:', err instanceof Error ? err.message : err);
      }
    }
  }

  if (!geminiKey) throw new Error('No LLM configured: set OPENROUTER_API_KEY');
  return generateWithGemini(geminiKey, prompt, options);
}

/** Extracts the first JSON object or array from a model response (tolerates code fences / prose). */
export function extractJson<T>(text: string, shape: 'object' | 'array' = 'object'): T | null {
  const match = shape === 'array' ? text.match(/\[[\s\S]*\]/) : text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}
