# 🏏 Reincarnation

**Hear an iconic cricket moment in a different legend's voice — over iMessage.**

You text the agent something like *"What would Harsha Bhogle have done at the 2011 World Cup final?"* — you never say who originally called it. The agent figures out the moment, knows it was **Ravi Shastri's** *"Dhoni finishes off in style"*, pulls **Harsha's stored style notes**, and texts back how *Harsha* would have called it. Correct it — *"he gets way louder on a six"* — and it permanently updates Harsha's voice, so the next call is better. Any famous moment works (open-ended), across a roster of 15 commentators.

---

## Architecture

```
iMessage: "what would Harsha do at the 2011 WC final?"
   │
   ▼  Photon (spectrum-ts)  ── iMessage in/out
TS orchestrator (src/agent.ts):
   1. Supabase   → fetch commentators + iconic moments         [DATABASE]
   2. XTrace     → read target commentator's style notes       [MEMORY · READ]
   3. identify moment → reimagine in target voice (Anthropic)  [LLM]
   4. Photon     → reply over iMessage                         [DELIVERY]
   5. Supabase   ← log the generated clip
   (reply with a correction)
   6. XTrace     ← ingest feedback; contradictions self-revise [MEMORY · WRITE]
```

| Concern | Tech | Where |
|---------|------|-------|
| **Database** | Supabase (Postgres, service-role) | [`src/db.ts`](src/db.ts), [`backend/schema.sql`](backend/schema.sql) |
| **LLM** | Anthropic Messages API (`claude-sonnet-4-6`) | [`src/llm.ts`](src/llm.ts) |
| **Memory** | XTrace — one self-revising **group** of style notes per commentator | [`src/xtrace.ts`](src/xtrace.ts) |
| **Delivery** | Photon / Spectrum (iMessage, cloud-routed) | [`src/index.ts`](src/index.ts) |
| **Reasoning** | identify-moment → reimagine, with shortform/fuzzy/year-anchored matching, open-ended (AMA) fallback | [`src/rocketride.ts`](src/rocketride.ts), [`src/agent.ts`](src/agent.ts) |

---

## Setup

### 1. Supabase (database)
- Create a project at **supabase.com** → **Settings → API** → copy the **Project URL** and the **service_role** key.
- Open the project's **SQL editor** and run [`backend/schema.sql`](backend/schema.sql) (creates `commentators`, `iconic_moments`, `generated_clips`).
- Put the values in `.env`: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`.

### 2. Keys in `.env`
```bash
cp .env.example .env   # then fill in:
# SUPABASE_URL, SUPABASE_SERVICE_KEY
# ANTHROPIC_API_KEY        (claude via the Messages API)
# XTRACE_API_KEY, XTRACE_ORG_ID   (app.xtrace.ai → Settings → API Keys)
# PHOTON_PROJECT_ID, PHOTON_PROJECT_SECRET   (app.photon.codes)
npm install
```

### 3. Seed
```bash
npm run seed
```
Loads the 15 moments + 15 commentators into Supabase, and ensures each commentator has an XTrace style-memory group (a preset `xtrace_group_id` in [`seed/commentators.json`](seed/commentators.json) reuses an existing group so notes/feedback are preserved). Idempotent.

### 4. Run
- **Solo / terminal demo:** `npm run chat` — same agent, typed in the terminal (no phone needed).
- **iMessage:** `npm start` connects to your Photon project (app.photon.codes) over the cloud and answers the agent's Photon-assigned number — text *that* number, not your own. It connects *outbound* to `spectrum.photon.codes`, so it runs on any machine with internet (see **Deploy** below for always-on hosting).

### Smoke tests
```bash
npm run smoke         # Supabase read → XTrace read → identify → reimagine (Anthropic)
npm run smoke:xtrace  # XTrace memory read for a commentator
```

---

## Deploy (always-on · Railway)

The iMessage agent is a **persistent listener** that connects *outbound* to the Photon cloud (`spectrum.photon.codes:443`, gRPC) using your project credentials — so it runs on any always-on host. **No Mac, no Full Disk Access, no inbound port** (those only matter for running locally). Vercel can't host it (it's not serverless). Railway is the easy fit:

1. **Push** this repo to GitHub.
2. **Create a Railway project** → *Deploy from GitHub repo* → select this repo. Nixpacks auto-detects Node + `npm start`; restart policy lives in [`railway.json`](railway.json).
3. **Set variables** (Railway → *Variables*) — same values as your local `.env`:
   - **Required:** `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ANTHROPIC_API_KEY`, `XTRACE_API_KEY`, `XTRACE_ORG_ID`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `PHOTON_PROJECT_ID`, `PHOTON_PROJECT_SECRET`
   - **Optional:** `ANTHROPIC_MODEL` (default `claude-sonnet-4-6`), `XTRACE_BASE_URL`, `ROCKETRIDE_FALLBACK` (leave unset → `true`)
4. **Seed once** against the same Supabase/XTrace (run `npm run seed` locally — the deployed app reads the same DB). Idempotent.
5. **Deploy.** Watch logs for `📨 iMessage agent live.` — the bot now answers 24/7.

> CLI alternative: `npm i -g @railway/cli && railway login && railway init && railway up`, then set each variable with `railway variables --set KEY=value`.

> Built for a **controlled audience.** Two things to know before sharing widely: there's no per-user rate limiting (each text fires ~3 Claude calls + ElevenLabs TTS), and feedback writes to a **shared** style memory per commentator — anyone's correction changes the voice for everyone.

---

## Demo script
1. *"What would Harsha Bhogle have done at the 2011 World Cup final?"* → Harsha's measured call of Dhoni's six (knows the original was Shastri).
2. *"He should get way louder and more excited on the six."* → XTrace ingests the correction; the contradicting *measured* note is superseded.
3. Ask **#1 again** → the call is now more animated — the memory changed the output.
4. **AMA:** *"Michael Holding, Stokes at Headingley 2019"* (or any moment) → an off-roster moment recalled from the model's knowledge.

---

## Notes
- **Open-ended moments:** seeded moments use a hand-verified original line; off-roster moments are recalled by the model (minor original-caller details may be approximate).
- **`src/rocketride.ts`** keeps an `identify → reimagine` two-step structure; `ROCKETRIDE_FALLBACK=true` runs both steps directly via Anthropic. (The optional RocketRide engine path is retained but unused by default.)
- **Stretch:** add ElevenLabs TTS after generation + Supabase Storage to send spoken audio over iMessage.
