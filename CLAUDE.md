# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run seed          # One-shot setup: seed Supabase DB + XTrace style memory (run once before start)
npm start             # Launch the iMessage agent (Photon/Spectrum layer)
npm run chat          # Interactive terminal version of the same agent (no iMessage needed)
npm run dev           # Watch mode for the iMessage agent
npm run smoke         # End-to-end smoke test: DB read → XTrace read → identify → generate
npm run smoke:xtrace  # Verify XTrace memory read path only
npm run typecheck     # TypeScript type-check (no emit)
```

All scripts use `tsx` directly — no build step required.

## Architecture

**Reincarnation** is a cricket commentary style-transfer agent. It takes a user message (naming a commentator + a moment), then generates live commentary of that moment in the named commentator's voice.

### Three external services

| Service | Role | Module |
|---|---|---|
| **Supabase** (`@supabase/supabase-js`) | Database (Postgres) — commentators, iconic_moments, generated_clips | `src/db.ts` |
| **XTrace** (`@xtraceai/memory`) | Persistent, self-revising style memory per commentator (one group per commentator) | `src/xtrace.ts` |
| **Spectrum/Photon** (`spectrum-ts`) | iMessage delivery layer | `src/index.ts` |

`src/butterbase.ts` is unused dead code — all active imports use `src/db.ts`.

### Data flow

```
User message (iMessage or terminal)
  └─> agent.ts: matchCommentator() → Routable
        └─> xtrace.ts: readStyle(groupId) → style notes
        └─> rocketride.ts: reimagine()
              ├─ ROCKETRIDE_FALLBACK=true (default): runs two LLM steps directly
              │    1. identifyMoment() — LLM slug match + fuzzyMatch() fallback
              │    2. generateCall() / generateOpen() — style-conditioned generation
              └─ ROCKETRIDE_FALLBACK=false: POST to RocketRide pipeline webhook
```

### Key modules

- **`src/db.ts`** — Supabase client (service-role key, RLS bypassed). Exports `fetchCommentators`, `fetchMoments`, `logClip`, and the `Commentator`/`IconicMoment` types used across the app.
- **`src/agent.ts`** — Channel-agnostic orchestration. Handles commentator name matching (priority: full name → unique surname/nickname → bare first name), intent classification (request vs. feedback), and feedback recording back into XTrace.
- **`src/rocketride.ts`** — The AI pipeline. Two steps: `identifyMoment` (LLM slug match with year-consistency guard + keyword fuzzy fallback) and `generateCall`/`generateOpen`. Also exports `expandShortforms` for cricket shorthand (wc, t20, ipl, etc.).
- **`src/llm.ts`** — Direct Anthropic SDK `chat()` helper with retry logic. Used by `rocketride.ts` for all LLM calls.
- **`src/xtrace.ts`** — `readStyle` reads style notes for a commentator group; `recordFeedback` ingests user corrections; XTrace auto-reconciles contradicting facts.

### Seed data

- `seed/commentators.json` — Cricket commentators with slugs, optional preset `xtrace_group_id`, and initial style notes arrays. If `xtrace_group_id` is set, seed reuses the existing XTrace group (preserving notes/feedback) instead of creating a new one.
- `seed/moments.json` — Iconic cricket moments: slug, title, year, original commentator, original line, context.

`npm run seed` is idempotent — re-running skips rows and XTrace groups that already exist.

### Pipeline definition

`pipelines/reimagine.pipe` — RocketRide pipeline spec (webhook → identify LLM → generate LLM → response). Only active when `ROCKETRIDE_FALLBACK=false`.

## Environment variables

Required: `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `XTRACE_API_KEY`, `XTRACE_ORG_ID`, `PHOTON_PROJECT_ID`, `PHOTON_PROJECT_SECRET`

Optional: `ANTHROPIC_MODEL` (default: `claude-sonnet-4-6`), `ROCKETRIDE_FALLBACK` (default: `true`), `ROCKETRIDE_URL`, `ROCKETRIDE_PIPELINE`, `XTRACE_BASE_URL`
