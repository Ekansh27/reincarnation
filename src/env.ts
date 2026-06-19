import "dotenv/config";

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name} (see .env.example)`);
  return v;
}

function opt(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

export const env = {
  supabase: {
    url: req("SUPABASE_URL"),
    serviceKey: req("SUPABASE_SERVICE_KEY"),
  },
  anthropic: {
    apiKey: req("ANTHROPIC_API_KEY"),
    model: opt("ANTHROPIC_MODEL", "claude-sonnet-4-6"),
  },
  xtrace: {
    apiKey: req("XTRACE_API_KEY"),
    orgId: req("XTRACE_ORG_ID"),
    baseUrl: opt("XTRACE_BASE_URL", "https://api.production.xtrace.ai"),
  },
  rocketride: {
    url: opt("ROCKETRIDE_URL", "http://localhost:5565"),
    pipeline: opt("ROCKETRIDE_PIPELINE", "reimagine"),
    fallback: opt("ROCKETRIDE_FALLBACK", "true") === "true",
  },
  twilio: {
    accountSid: opt("TWILIO_ACCOUNT_SID", ""),
    authToken: opt("TWILIO_AUTH_TOKEN", ""),
    webhookUrl: opt("WEBHOOK_URL", ""),
  },
  elevenlabs: {
    apiKey: opt("ELEVENLABS_API_KEY", ""),
    voiceId: opt("ELEVENLABS_VOICE_ID", ""),
  },
} as const;
