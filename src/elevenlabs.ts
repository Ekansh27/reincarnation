import { env } from "./env.js";

const BASE = "https://api.elevenlabs.io/v1";

/**
 * Convert text to speech using ElevenLabs. Returns an MP3 buffer.
 * Uses the voice_id from env (cloned Harsha Bhogle voice).
 */
export async function synthesize(text: string): Promise<Buffer> {
  const res = await fetch(`${BASE}/text-to-speech/${env.elevenlabs.voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": env.elevenlabs.apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.58, similarity_boost: 0.80, style: 0.50, use_speaker_boost: true },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ElevenLabs TTS ${res.status}: ${body}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
