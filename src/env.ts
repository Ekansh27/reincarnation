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
  butterbase: {
    appId: req("BUTTERBASE_APP_ID"),
    apiUrl: opt("BUTTERBASE_API_URL", "https://api.butterbase.ai"),
    anonKey: process.env.BUTTERBASE_ANON_KEY ?? "",
    serviceKey: req("BUTTERBASE_SERVICE_KEY"),
    model: opt("BUTTERBASE_MODEL", "anthropic/claude-3.5-sonnet"),
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
    projectId: req("PHOTON_PROJECT_ID"),
    projectSecret: req("PHOTON_PROJECT_SECRET"),
  },
} as const;
