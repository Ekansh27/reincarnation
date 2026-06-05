import { fetchMoments, fetchCommentators } from "./butterbase.js";
import { readStyle } from "./xtrace.js";
import { identifyMoment, generateCall } from "./rocketride.js";

/**
 * End-to-end smoke test of the core loop WITHOUT Photon:
 *   Butterbase DB read → XTrace style read → identify (gateway) → reimagine (gateway)
 *
 *   npm run smoke
 */
async function main() {
  const query = "What would Harsha Bhogle have done at the 2011 World Cup final?";
  console.log(`Query: ${query}\n`);

  const [moments, commentators] = await Promise.all([fetchMoments(), fetchCommentators()]);
  console.log(`✓ Butterbase: ${moments.length} moments, ${commentators.length} commentators`);

  const harsha = commentators.find((c) => c.slug === "harsha-bhogle");
  if (!harsha?.xtrace_group_id) throw new Error("Harsha not seeded — run `npm run seed`.");

  const style = await readStyle(harsha.xtrace_group_id, harsha.name);
  console.log(`✓ XTrace: ${style.notes.length} style note(s) for ${harsha.name}`);

  const moment = await identifyMoment(query, moments);
  if (!moment) throw new Error("identify returned no match");
  console.log(`✓ Identify: "${moment.title}" — originally ${moment.original_commentator}\n`);

  const script = await generateCall(moment, harsha.name, style.context);
  console.log(`🎙️ ${harsha.name}:\n` + script);
}

main().catch((err) => {
  console.error("\nSmoke failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
