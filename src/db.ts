import { createClient } from "@supabase/supabase-js";
import { env } from "./env.js";

/**
 * Database = Supabase (Postgres). Uses the service-role key, which bypasses RLS
 * — this is a trusted server process (identity-gated by the Photon number), so
 * no row-level policies are needed.
 */
export const db = createClient(env.supabase.url, env.supabase.serviceKey, {
  auth: { persistSession: false },
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
  const { data, error } = await db.from("commentators").select("*");
  if (error) throw new Error(`Supabase commentators read failed: ${error.message}`);
  return (data ?? []) as Commentator[];
}

export async function fetchMoments(): Promise<IconicMoment[]> {
  const { data, error } = await db.from("iconic_moments").select("*");
  if (error) throw new Error(`Supabase moments read failed: ${error.message}`);
  return (data ?? []) as IconicMoment[];
}

export async function logClip(row: {
  user_handle: string;
  query: string;
  target_commentator: string;
  matched_moment: string;
  script_text: string;
}): Promise<void> {
  const { error } = await db.from("generated_clips").insert(row);
  // Logging is best-effort — never block a reply on it.
  if (error) console.warn("[db] clip log failed (non-fatal):", error.message);
}
