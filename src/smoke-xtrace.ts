import { fetchCommentators } from "./butterbase.js";
import { readStyle } from "./xtrace.js";

/**
 * Verify the XTrace memory read path: pull a commentator's group and confirm
 * style notes come back.
 *
 *   npm run smoke:xtrace
 */
async function main() {
  const commentators = await fetchCommentators();
  const harsha = commentators.find((c) => c.slug === "harsha-bhogle");
  if (!harsha?.xtrace_group_id) throw new Error("Harsha not seeded — run `npm run seed`.");

  console.log(`Reading XTrace style memory for ${harsha.name} (group ${harsha.xtrace_group_id})...\n`);
  const style = await readStyle(harsha.xtrace_group_id, harsha.name);

  console.log(`✓ ${style.notes.length} style notes returned:`);
  for (const n of style.notes) console.log(`  - ${n}`);
}

main().catch((err) => {
  console.error("\nXTrace smoke failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
