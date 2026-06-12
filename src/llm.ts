import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env.js";

/**
 * LLM = Anthropic Messages API, called directly. Single entry point (`chat`)
 * with the same OpenAI-style message shape the rest of the app already uses;
 * we hoist the system message to Anthropic's top-level `system` param.
 */
const anthropic = new Anthropic({ apiKey: env.anthropic.apiKey });

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function chat(messages: ChatMessage[], opts: { temperature?: number; maxTokens?: number; model?: string } = {}): Promise<string> {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const turns = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const res = await withRetry(
    () =>
      anthropic.messages.create({
        model: opts.model ?? env.anthropic.model,
        max_tokens: opts.maxTokens ?? 600,
        temperature: opts.temperature ?? 0.8,
        ...(system ? { system } : {}),
        messages: turns,
      }),
    "Anthropic",
  );

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  if (!text) throw new Error("Anthropic returned no text content");
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
