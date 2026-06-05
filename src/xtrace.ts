import { MemoryClient } from "@xtraceai/memory";
import { env } from "./env.js";

/**
 * XTrace = the brain. Each commentator is an XTrace GROUP (shared, cross-user
 * memory — the "group memory" bonus), holding evolving style notes as facts.
 *
 *  - READ  : readStyle() pulls a commentator's notes to condition generation.
 *  - WRITE : seedNotes() at setup, and recordFeedback() when a user corrects
 *            the agent. New facts that contradict old ones are reconciled by
 *            XTrace automatically — that's the self-revising memory demo.
 *  - extract_artifacts defaults true on ingest → "artifacts" bonus for free.
 */
export const xtrace = new MemoryClient({
  apiKey: env.xtrace.apiKey,
  orgId: env.xtrace.orgId,
  baseUrl: env.xtrace.baseUrl,
});

const SEED_USER = "studio";

/** Create (or return) the shared group that holds a commentator's style memory. */
export async function createCommentatorGroup(name: string): Promise<string> {
  const group = await xtrace.groups.create({
    name: `Commentary style — ${name}`,
    prompt: `The signature commentary style of ${name}: tone, energy, signature phrases, pacing, and what they emphasize. Facts here describe HOW ${name} calls a moment.`,
  });
  return group.id;
}

/** Seed a commentator's group with initial style notes. */
export async function seedNotes(groupId: string, slug: string, name: string, notes: string[]): Promise<void> {
  // XTrace extracts facts from declarative prose in the user turn — a
  // question + bullet-list reply extracts nothing, so state the notes as facts.
  await xtrace.memories.ingest(
    {
      messages: [{ role: "user", content: `${name}'s commentary style: ${notes.join(" ")}` }],
      user_id: SEED_USER,
      conv_id: `seed:${slug}`,
      group_ids: [groupId],
    },
    { wait: true },
  );
}

/** Cheap check (no LLM compose) for whether a group already holds any memory. */
export async function groupHasMemories(groupId: string, name: string): Promise<boolean> {
  const res = await xtrace.memories.search({
    query: `${name} commentary style`,
    group_ids: [groupId],
    limit: 1,
    mode: "retrieve",
  });
  return (res.data ?? []).length > 0;
}

export interface StyleMemory {
  context: string; // LLM-ready assembled style context
  notes: string[]; // individual ranked notes (for display / debugging)
}

/** Read the current style memory for a commentator group. */
export async function readStyle(groupId: string, name: string): Promise<StyleMemory> {
  const res = await xtrace.memories.search({
    query: `How does ${name} commentate? Tone, energy, signature phrases, pacing, what they emphasize.`,
    group_ids: [groupId],
    limit: 12,
    mode: "retrieve",
  });
  const notes = (res.data ?? []).map((m: { text?: string }) => m.text ?? "").filter(Boolean);
  const context = notes.map((n) => `- ${n}`).join("\n");
  return { context, notes };
}

/**
 * Record a user's correction about a commentator's voice. XTrace extracts the
 * new fact(s) and supersedes any contradicting prior belief automatically.
 * Returns a short human-readable summary of what was learned.
 */
export async function recordFeedback(
  groupId: string,
  name: string,
  userHandle: string,
  feedback: string,
): Promise<string> {
  const job = await xtrace.memories.ingest(
    {
      messages: [
        { role: "user", content: `About how ${name} should sound: ${feedback}` },
      ],
      user_id: userHandle,
      conv_id: `imsg:${userHandle}:${slugify(name)}`,
      group_ids: [groupId],
    },
    { wait: true },
  );

  const created = (job.result?.memories_created ?? []) as { text?: string }[];
  if (created.length === 0) return `Noted — I'll keep refining ${name}'s voice.`;
  const learned = created.map((m) => m.text).filter(Boolean).slice(0, 3).join("; ");
  return `Got it — updated ${name}'s voice: ${learned}`;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
