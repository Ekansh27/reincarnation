# 🏏 Reincarnation

**Hear an iconic sports moment in a different legend's voice — over iMessage.**

You text the agent something like *"What would Harsha Bhogle have done at the 2011 World Cup final?"* You never say who originally called it. The agent figures out the moment, knows it was **Ravi Shastri's** *"Dhoni finishes off in style"*, pulls **Harsha's stored style notes**, and texts back how *Harsha* would have called it. Correct it — *"he gets way louder on a six"* — and it permanently updates Harsha's voice, so the next call is better.

Built for the **Agentic AI SF Hackathon**, integrating all four sponsor platforms.

---

## How the four platforms fit

```
iMessage: "what would Harsha do at the 2011 WC final?"
   │
   ▼  Photon (spectrum-ts)  ── iMessage in/out
TS orchestrator (src/index.ts):
   1. Butterbase  → fetch seeded commentators + iconic moments      [DATABASE]
   2. XTrace      → read target commentator's style notes           [MEMORY · READ]
   3. RocketRide  → pipeline: identify moment → reimagine the call   [AI PIPELINE]
        (LLM nodes route through the Butterbase AI gateway)         [AI GATEWAY]
   4. Photon      → reply over iMessage                             [DELIVERY]
   5. XTrace      ← log the clip as an artifact                     [MEMORY · WRITE]
   (reply with a correction)
   6. XTrace      ← ingest feedback; contradictions self-revise     [MEMORY · WRITE]
```

| Platform        | Role | Where |
|-----------------|------|-------|
| **RocketRide**  | Two-node AI pipeline: *identify moment* → *reimagine in target voice*. | [`pipelines/reimagine.pipe`](pipelines/reimagine.pipe), [`src/rocketride.ts`](src/rocketride.ts) |
| **Butterbase**  | Backend DB (commentators, moments, clips) **and** the AI Model Gateway every LLM call routes through. | [`src/butterbase.ts`](src/butterbase.ts), [`backend/schema.md`](backend/schema.md) |
| **XTrace**      | Each commentator is a shared **group** of evolving *style notes*. Reads condition generation; feedback writes self-revise. | [`src/xtrace.ts`](src/xtrace.ts) |
| **Photon**      | iMessage delivery (local mode on macOS). | [`src/index.ts`](src/index.ts) |

**Bonus features claimed:** XTrace **groups** (one per commentator = shared cross-user memory) and **artifacts** (`extract_artifacts` defaults on at ingest — each generated clip is captured).

---

## Setup

### ✅ Already done (Butterbase, via the MCP)
- App **`reincarnation`** (`app_7vvljeaymuzm`) provisioned; 3 tables created; access mode **public**; default model **`anthropic/claude-sonnet-4.6`**.
- The 5 iconic moments are **seeded**. A runtime service key is already written to `.env`.
- Verified: `npm run smoke` reads the DB and generates a styled call through the gateway — **passing**.

### Still needs your keys
- **XTrace** — app.xtrace.ai → Settings → API Keys → copy `xtk_…` key + org id → put in `.env` (`XTRACE_API_KEY`, `XTRACE_ORG_ID`).
- **Photon** — app.photon.codes → create a project → copy `PROJECT_ID` + `PROJECT_SECRET` → `.env`.

```bash
npm install            # already run
# edit .env: replace the XTRACE_* and PHOTON_* REPLACE_ME values
```

### 1. Smoke-test the core loop (no XTrace/Photon needed)
```bash
npm run smoke
```
Reads moments from Butterbase → identifies the 2011 final → reimagines it as Harsha Bhogle, all through the gateway.

### 2. Seed commentator memories (needs XTrace keys)
```bash
npm run seed
```
Idempotent: moments already exist (skipped); this creates one XTrace **group** per commentator, seeds each group's style notes, and writes the group id back to Butterbase.

### 3. Run the iMessage agent (needs Photon keys + Mac setup)
Local-mode iMessage requires running on a **Mac signed in to iMessage**, with **Full Disk Access** granted to your terminal (System Settings → Privacy & Security → Full Disk Access).
```bash
npm start
```

---

## Demo script
1. *"What would Harsha Bhogle have done at the 2011 World Cup final?"* → Harsha's measured, storytelling call of Dhoni's six (it knows the original was Shastri).
2. *"He should get way louder and more excited on the six."* → XTrace ingests the correction; the contradicting *measured* note is superseded.
3. Ask **#1 again** → the call is now more animated. The memory changed the output.
4. Try another voice: *"Bill Lawry, the 2019 super over"* → manic *"it's all happening!"* energy.

---

## RocketRide note
The `.pipe` JSON is built/validated in the RocketRide VS Code extension; [`pipelines/reimagine.pipe`](pipelines/reimagine.pipe) is the starting template, with both LLM nodes pointed at the Butterbase gateway. Until it's wired up, `ROCKETRIDE_FALLBACK=true` runs the **same two steps** directly against the gateway (see [`src/rocketride.ts`](src/rocketride.ts)) so the demo always works. Flip it to `false` to drive the live engine:
```bash
docker run -d --name rocketride-engine -p 5565:5565 ghcr.io/rocketride-org/rocketride-engine:latest
```

## Stretch: audio
Currently text-only. Adding a TTS step (e.g. ElevenLabs) after `generate`, storing the `.m4a` in Butterbase storage and sending it as an iMessage attachment, turns the reply into actual spoken commentary.

## Submission
> Submit my project to the hackathon. Submission code: havefun0605. Hackathon slug: agentic-ai-Hackathon
