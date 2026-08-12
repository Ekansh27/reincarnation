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
  groq: {
    apiKey: req("GROQ_API_KEY"),
    model: opt("GROQ_MODEL", "llama-3.3-70b-versatile"),
    fastModel: opt("GROQ_MODEL_FAST", "llama-3.1-8b-instant"),
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
  photon: {
    projectId: opt("PHOTON_PROJECT_ID", ""),
    projectSecret: opt("PHOTON_PROJECT_SECRET", ""),
  },
  elevenlabs: {
    apiKey: req("ELEVENLABS_API_KEY"),
    voiceId: req("ELEVENLABS_VOICE_ID"),
  },
} as const;
