import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { db, fetchCommentators } from "./db.js";
import { createCommentatorGroup, seedNotes, groupHasMemories } from "./xtrace.js";

/**
 * One-shot setup: load the cricket catalogue into Supabase, ensure each
 * commentator has an XTrace style-memory group, and seed its notes.
 * Idempotent — safe to re-run. A preset `xtrace_group_id` in the seed reuses
 * an existing XTrace group (preserving notes + feedback) instead of creating one.
 * Assumes the Supabase tables exist (see backend/schema.sql).
 *
 *   npm run seed
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = <T>(p: string): T => JSON.parse(readFileSync(join(root, p), "utf8")) as T;

interface SeedCommentator {
  slug: string;
  name: string;
  sport: string;
  notes: string[];
  xtrace_group_id?: string;
}
interface SeedMoment {
  slug: string;
  title: string;
  year: number;
  original_commentator: string;
  original_line: string;
  context: string;
}

async function existingSlugs(table: string): Promise<Set<string>> {
  const { data } = await db.from(table).select("slug");
  return new Set((data ?? []).map((r: { slug: string }) => r.slug));
}

async function main() {
  const commentators = readJson<SeedCommentator[]>("seed/commentators.json");
  const moments = readJson<SeedMoment[]>("seed/moments.json");

  const haveMoments = await existingSlugs("iconic_moments");
  console.log(`Seeding moments → Supabase (${haveMoments.size} already present)...`);
  for (const m of moments) {
    if (haveMoments.has(m.slug)) {
      console.log(`  • ${m.title} (exists, skipped)`);
      continue;
    }
    const { error } = await db.from("iconic_moments").insert(m);
    if (error) console.warn(`  ⚠ ${m.slug}: ${error.message}`);
    else console.log(`  ✓ ${m.title}`);
  }

  const existing = await fetchCommentators();
  const groupBySlug = new Map(existing.map((c) => [c.slug, c.xtrace_group_id]));
  console.log(`\nSeeding commentators → XTrace groups + Supabase...`);
  for (const c of commentators) {
    // Reuse an existing group: DB row → preset seed id → otherwise create a new one.
    let groupId = groupBySlug.get(c.slug) ?? c.xtrace_group_id ?? null;
    const isNewGroup = !groupBySlug.get(c.slug) && !c.xtrace_group_id;
    if (isNewGroup) groupId = await createCommentatorGroup(c.name);

    if (!groupBySlug.has(c.slug)) {
      const { error } = await db
        .from("commentators")
        .insert({ slug: c.slug, name: c.name, sport: c.sport, xtrace_group_id: groupId });
      if (error) {
        console.warn(`  ⚠ ${c.slug}: ${error.message}`);
        continue;
      }
      console.log(`  ✓ ${c.name}  (row inserted, group ${groupId})`);
    }

    // Ensure style notes exist (skipped for preserved groups that already have them).
    if (groupId && !(await groupHasMemories(groupId, c.name))) {
      await seedNotes(groupId, c.slug, c.name, c.notes);
      console.log(`  ✓ ${c.name}  (seeded ${c.notes.length} style notes)`);
    } else {
      console.log(`  • ${c.name} notes already in memory (skipped)`);
    }
  }

  console.log("\nDone. Run `npm start` to launch the iMessage agent.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
