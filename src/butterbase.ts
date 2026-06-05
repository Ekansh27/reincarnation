import { createClient } from "@butterbase/sdk";
import { env } from "./env.js";

/**
 * Butterbase = our backend. Two responsibilities here:
 *  1. Database: read seeded commentators / iconic moments, log generated clips.
 *  2. AI Model Gateway: a single OpenAI-compatible chat() helper that every
 *     LLM step routes through (so "integrate the AI gateway" is satisfied in
 *     one place, and RocketRide's LLM node points at this same endpoint).
 */
export const butterbase = createClient({
  appId: env.butterbase.appId,
  apiUrl: env.butterbase.apiUrl,
  anonKey: env.butterbase.anonKey,
});

export interface Commentator {
  slug: string;
  name: string;
  sport: string;
  /** XTrace group id holding this commentator's evolving style notes. */
  xtrace_group_id: string | null;
}

export interface IconicMoment {
  slug: string;
  title: string;
  year: number;
  original_commentator: string;
  original_line: string;
  context: string;
}

export async function fetchCommentators(): Promise<Commentator[]> {
  const { data, error } = await butterbase.from("commentators").select("*");
  if (error) throw new Error(`Butterbase commentators read failed: ${error.message ?? error}`);
  return (data ?? []) as Commentator[];
}

export async function fetchMoments(): Promise<IconicMoment[]> {
  const { data, error } = await butterbase.from("iconic_moments").select("*");
  if (error) throw new Error(`Butterbase moments read failed: ${error.message ?? error}`);
  return (data ?? []) as IconicMoment[];
}

export async function logClip(row: {
  user_handle: string;
  query: string;
  target_commentator: string;
  matched_moment: string;
  script_text: string;
}): Promise<void> {
  const { error } = await butterbase.from("generated_clips").insert(row);
  // Logging is best-effort — never block a reply on it.
  if (error) console.warn("[butterbase] clip log failed (non-fatal):", error.message ?? error);
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Call an LLM through the Butterbase AI Model Gateway (OpenAI-compatible).
 * This is the single Claude entry point for the whole app.
 */
export async function chat(messages: ChatMessage[], opts: { temperature?: number; maxTokens?: number } = {}): Promise<string> {
  // The gateway is app-scoped: https://api.butterbase.ai/v1/<app_id>/chat/completions
  const url = `${env.butterbase.apiUrl}/v1/${env.butterbase.appId}/chat/completions`;
  const init: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.butterbase.serviceKey}`,
    },
    body: JSON.stringify({
      model: env.butterbase.model,
      messages,
      max_tokens: opts.maxTokens ?? 600,
      temperature: opts.temperature ?? 0.8,
      stream: false,
    }),
  };

  const res = await withRetry(() => fetch(url, init), "AI gateway");

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Butterbase AI gateway ${res.status}: ${body}`);
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = json.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Butterbase AI gateway returned no content");
  return text;
}

/**
 * Retry an async fetch on transient failures only — network errors
 * (fetch failed / ETIMEDOUT) and 5xx. 4xx (e.g. 402) fail fast.
 */
async function withRetry(fn: () => Promise<Response>, label: string, attempts = 3): Promise<Response> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fn();
      if (res.status >= 500 && i < attempts) {
        lastErr = new Error(`${label} ${res.status}`);
      } else {
        return res;
      }
    } catch (err) {
      lastErr = err; // network-level failure (fetch failed / ETIMEDOUT)
      if (i === attempts) break;
    }
    await new Promise((r) => setTimeout(r, 400 * i)); // 400ms, 800ms backoff
    console.warn(`[${label}] transient failure, retry ${i + 1}/${attempts}`);
  }
  throw lastErr instanceof Error ? lastErr : new Error(`${label} failed`);
}
