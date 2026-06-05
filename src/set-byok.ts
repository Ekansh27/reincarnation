import "dotenv/config";
import { env } from "./env.js";

/**
 * Configure the Butterbase AI gateway to use a Bring-Your-Own-Key (BYOK)
 * upstream key, read from ANTHROPIC_BYOK_KEY in .env so the secret never
 * touches the chat transcript. Then verify with a tiny test call.
 *
 *   npm run set-byok
 */
const byok = process.env.ANTHROPIC_BYOK_KEY;
if (!byok) {
  console.error("Add ANTHROPIC_BYOK_KEY=sk-ant-... to .env first.");
  process.exit(1);
}

const base = `${env.butterbase.apiUrl}/v1/${env.butterbase.appId}`;
const headers = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${env.butterbase.serviceKey}`,
};

async function main() {
  console.log(`Setting BYOK on ${env.butterbase.appId} (key ${byok!.slice(0, 7)}…, ${byok!.length} chars)`);

  // PUT the gateway config with the BYOK upstream key.
  const put = await fetch(`${base}/ai/config`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ byokKey: byok, defaultModel: env.butterbase.model }),
  });
  console.log(`config PUT → ${put.status}`);
  if (!put.ok) console.log(await put.text().catch(() => ""));

  // Verify with a 1-token test call through the gateway.
  const test = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: env.butterbase.model,
      messages: [{ role: "user", content: "Reply with exactly: byok-ok" }],
      max_tokens: 16,
    }),
  });
  const body = await test.text();
  console.log(`\ntest chat → ${test.status}`);
  console.log(body.slice(0, 400));
  if (test.ok) console.log("\n✅ BYOK works — run `npm run smoke` next.");
  else console.log("\n❌ Still failing — BYOK via this field may not be supported; we'll pivot.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
