import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { butterbase, fetchCommentators } from "./butterbase.js";
import { createCommentatorGroup, seedNotes, groupHasMemories } from "./xtrace.js";

/**
 * One-shot setup: load the cricket catalogue into Butterbase, create one
 * XTrace group per commentator, and seed each group's style notes.
 * Assumes the Butterbase tables already exist (see README for the schema).
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
  const { data } = await butterbase.from(table).select("slug");
  return new Set((data ?? []).map((r: { slug: string }) => r.slug));
}

async function main() {
  const commentators = readJson<SeedCommentator[]>("seed/commentators.json");
  const moments = readJson<SeedMoment[]>("seed/moments.json");

  // Idempotent: skip rows already present (moments are pre-seeded via the MCP).
  const haveMoments = await existingSlugs("iconic_moments");
  console.log(`Seeding moments → Butterbase (${haveMoments.size} already present)...`);
  for (const m of moments) {
    if (haveMoments.has(m.slug)) {
      console.log(`  • ${m.title} (exists, skipped)`);
      continue;
    }
    const { error } = await butterbase.from("iconic_moments").insert(m);
    if (error) console.warn(`  ⚠ ${m.slug}: ${error.message ?? error}`);
    else console.log(`  ✓ ${m.title}`);
  }

  const existing = await fetchCommentators();
  const groupBySlug = new Map(existing.map((c) => [c.slug, c.xtrace_group_id]));
  console.log(`\nSeeding commentators → XTrace groups + Butterbase...`);
  for (const c of commentators) {
    // Ensure the commentator row + its XTrace group exist.
    let groupId = groupBySlug.get(c.slug) ?? null;
    if (!groupId) {
      groupId = await createCommentatorGroup(c.name);
      const { error } = await butterbase.from("commentators").insert({
        slug: c.slug,
        name: c.name,
        sport: c.sport,
        xtrace_group_id: groupId,
      });
      if (error) {
        console.warn(`  ⚠ ${c.slug}: ${error.message ?? error}`);
        continue;
      }
      console.log(`  ✓ ${c.name}  (created group ${groupId})`);
    }
    // Ensure style notes are ingested (idempotent — skip if the group is populated).
    if (await groupHasMemories(groupId, c.name)) {
      console.log(`  • ${c.name} notes already in memory (skipped)`);
    } else {
      await seedNotes(groupId, c.slug, c.name, c.notes);
      console.log(`  ✓ ${c.name}  (seeded ${c.notes.length} style notes)`);
    }
  }

  console.log("\nDone. Run `npm start` to launch the iMessage agent.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
