import { Spectrum, attachment } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { env } from "./env.js";
import { createAgent } from "./agent.js";
import { synthesize } from "./elevenlabs.js";

/** Photon (Spectrum) = the iMessage delivery layer over the shared agent. */
async function main() {
  console.log("Loading catalogue from Supabase...");
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
        const reply = await agent.handle(senderId, text);
        await space.send(reply.text); // text first — lands instantly
        if (reply.speech) {
          try {
            const audio = await synthesize(reply.speech); // MP3 buffer (env voice)
            console.log(`[imessage] audio ${audio.byteLength} bytes for "${reply.speech.slice(0, 50)}…"`);
            // attachment() (not voice()) — voice() transcodes to M4A + isAudioMessage, which the
            // relay renders as a broken 0s bubble. A plain audio attachment plays inline reliably.
            await space.send(attachment(audio, { mimeType: "audio/mpeg", name: "commentary.mp3" }));
          } catch (ttsErr) {
            console.error("TTS failed (text already sent):", ttsErr); // best-effort — text already delivered
          }
        }
      });
    } catch (err) {
      console.error("handler error:", err);
      await space.send(`⚠️ ${err instanceof Error ? err.message : "Something went wrong."}`);
    }
  }

  // The Photon stream should stay open indefinitely; if it ends, exit non-zero
  // so the host (Railway restartPolicy: ON_FAILURE) restarts and reconnects.
  throw new Error("Photon message stream ended unexpectedly");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
