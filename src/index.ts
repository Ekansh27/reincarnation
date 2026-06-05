import { Spectrum } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { env } from "./env.js";
import { createAgent } from "./agent.js";

/** Photon (Spectrum) = the iMessage delivery layer over the shared agent. */
async function main() {
  console.log("Loading catalogue from Butterbase...");
  const agent = await createAgent();
  console.log(`  ${agent.commentators.length} commentators loaded.`);

  const app = await Spectrum({
    projectId: env.photon.projectId,
    projectSecret: env.photon.projectSecret,
    providers: [imessage.config()],
  });

  console.log("📨 iMessage agent live. Text it a moment + a commentator.");

  for await (const [space, message] of app.messages) {
    if (message.content.type !== "text") {
      await space.send('Send me a moment + a commentator as text, e.g. "Harsha Bhogle, 2011 WC final".');
      continue;
    }
    const text = message.content.text.trim();
    const senderId = message.sender?.id ?? "unknown";

    try {
      await space.responding(async () => {
        await space.send(await agent.handle(senderId, text));
      });
    } catch (err) {
      console.error("handler error:", err);
      await space.send(`⚠️ ${err instanceof Error ? err.message : "Something went wrong."}`);
    }
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
