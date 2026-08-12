import { env } from "./env.js";

/**
 * LLM = Groq's OpenAI-compatible chat completions API (free tier, open-source
 * Llama models). Single entry point (`chat`) with an OpenAI-style message shape;
 * system messages pass through in the messages array (no hoisting needed).
 */
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Map legacy model strings to Groq models: any "haiku" request → the fast tier,
 * any other Anthropic alias → the default model, a real Groq model name passes
 * through. Lets callers keep their fast/default intent without knowing Groq's ids.
 */
function resolveModel(requested?: string): string {
  if (!requested) return env.groq.model;
  if (/haiku/i.test(requested)) return env.groq.fastModel;
  if (/^claude/i.test(requested)) return env.groq.model;
  return requested;
}

export async function chat(messages: ChatMessage[], opts: { temperature?: number; maxTokens?: number; model?: string } = {}): Promise<string> {
  const res = await withRetry(async () => {
    const r = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.groq.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: resolveModel(opts.model),
        max_tokens: opts.maxTokens ?? 600,
        temperature: opts.temperature ?? 0.8,
        messages,
      }),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      const err = new Error(`Groq ${r.status}: ${body}`) as Error & { status?: number };
      err.status = r.status;
      throw err;
    }
    return (await r.json()) as { choices?: { message?: { content?: string } }[] };
  }, "Groq");

  const text = (res.choices?.[0]?.message?.content ?? "").trim();
  if (!text) throw new Error("Groq returned no text content");
  return text;
}

/** Retry transient failures only — network errors, 429, and 5xx. 4xx fail fast. */
async function withRetry<T>(fn: () => Promise<T>, label: string, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number }).status;
      const transient = status === undefined || status === 429 || status >= 500;
      if (!transient || i === attempts) break;
      await new Promise((r) => setTimeout(r, 400 * i));
      console.warn(`[${label}] transient failure, retry ${i + 1}/${attempts}`);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`${label} failed`);
}
