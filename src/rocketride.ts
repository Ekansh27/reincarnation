import { env } from "./env.js";
import { chat, type IconicMoment } from "./butterbase.js";

/**
 * RocketRide = the AI pipeline. The `reimagine` pipeline has two LLM nodes:
 *   1. identify — match the user's free-text query to a seeded moment and
 *      recover its ORIGINAL commentator + line (the user never names them).
 *   2. generate — rewrite that moment in the TARGET commentator's voice using
 *      the style notes read from XTrace.
 * Both nodes route through the Butterbase AI gateway.
 *
 * ROCKETRIDE_FALLBACK=true runs the same two steps directly against the gateway
 * (so the demo always works); flip it false once the .pipe is live in VS Code.
 */

export interface ReimagineInput {
  query: string;
  targetCommentatorName: string;
  styleContext: string;
  moments: IconicMoment[];
}

export interface ReimagineResult {
  scriptText: string;
  matchedTitle: string;
  originalCommentator: string;
}

export async function reimagine(input: ReimagineInput): Promise<ReimagineResult> {
  if (env.rocketride.fallback) return reimagineDirect(input);

  // RocketRide engine path: hand the whole job to the pipeline webhook.
  const res = await fetch(`${env.rocketride.url}/webhook/${env.rocketride.pipeline}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: input.query,
      target_commentator: input.targetCommentatorName,
      style_context: input.styleContext,
      candidate_moments: input.moments,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`RocketRide pipeline ${res.status}: ${body}`);
  }
  const json = (await res.json()) as {
    script_text?: string;
    matched_title?: string;
    original_commentator?: string;
  };
  if (!json.script_text) throw new Error("RocketRide pipeline returned no script_text");
  return {
    scriptText: json.script_text,
    matchedTitle: json.matched_title ?? "",
    originalCommentator: json.original_commentator ?? "",
  };
}

// ── Fallback: the two pipeline steps, run directly against the gateway ───────

/** Thrown when the request names no recognisable moment — the agent nudges for one. */
export class NeedMomentError extends Error {
  constructor() {
    super("no moment in request");
    this.name = "NeedMomentError";
  }
}

async function reimagineDirect(input: ReimagineInput): Promise<ReimagineResult> {
  // Anchored fast-path: a seeded moment → use its verified original line + context.
  const seeded = await identifyMoment(input.query, input.moments);
  if (seeded) {
    const scriptText = await generateCall(seeded, input.targetCommentatorName, input.styleContext);
    return { scriptText, matchedTitle: seeded.title, originalCommentator: seeded.original_commentator };
  }

  // Open-ended (AMA): let the model recall any moment from its own cricket knowledge.
  const open = await generateOpen(input.query, input.targetCommentatorName, input.styleContext);
  if (open.needMoment) throw new NeedMomentError();
  return { scriptText: open.commentary, matchedTitle: open.moment, originalCommentator: open.original_commentator };
}

interface OpenResult {
  moment: string;
  original_commentator: string;
  commentary: string;
  needMoment: boolean;
}

/** Open-ended generation: recall any moment from the model's knowledge and recommentate it. */
export async function generateOpen(query: string, targetCommentatorName: string, styleContext: string): Promise<OpenResult> {
  const raw = await chat(
    [
      {
        role: "system",
        content:
          `You reimagine famous cricket moments in the voice of ${targetCommentatorName}, using these style notes:\n${styleContext}\n\n` +
          "From the user's request, identify the specific cricket moment they mean (use your own knowledge). " +
          "Reply with ONLY a JSON object, no prose, of the form:\n" +
          '{"moment":"<short title incl. year>","original_commentator":"<who likely called it live, or empty>",' +
          '"commentary":"<2-4 sentences of live commentary in ' +
          targetCommentatorName +
          "'s voice — no quotes, no stage directions>\",\"needMoment\":false}\n" +
          'If no specific moment is identifiable, return {"moment":"","original_commentator":"","commentary":"","needMoment":true}.',
      },
      { role: "user", content: query },
    ],
    { temperature: 0.85, maxTokens: 500 },
  );

  try {
    const json = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim()) as Partial<OpenResult>;
    return {
      moment: json.moment ?? "",
      original_commentator: json.original_commentator ?? "",
      commentary: (json.commentary ?? "").trim(),
      needMoment: Boolean(json.needMoment) || !(json.commentary ?? "").trim(),
    };
  } catch {
    // Model ignored the JSON contract — treat its whole reply as the commentary.
    return { moment: "", original_commentator: "", commentary: raw.trim(), needMoment: !raw.trim() };
  }
}

/** Common cricket shorthand → expanded terms, applied before matching. */
const SHORTFORMS: [RegExp, string][] = [
  [/\bw\.?t\.?20\b/gi, "world t20 twenty20"],
  [/\bt20\s*wc\b/gi, "world t20 twenty20"],
  [/\bt20\b/gi, "twenty20"],
  [/\bwc\b/gi, "world cup"],
  [/\bworld\s*cup\b/gi, "world cup"],
  [/\bodi\b/gi, "one day international"],
  [/\bipl\b/gi, "indian premier league"],
];

/** Expand shorthand and apostrophe-years (e.g. '11 → 2011) to help matching. */
export function expandShortforms(text: string): string {
  let t = text;
  for (const [re, full] of SHORTFORMS) t = t.replace(re, full);
  // '11 → 2011, '93 → 1993 (two-digit ≤ current year → 2000s, else 1900s)
  t = t.replace(/'(\d{2})\b/g, (_, yy: string) => {
    const n = Number(yy);
    return String(n <= 26 ? 2000 + n : 1900 + n);
  });
  return t;
}

/** Friendly list of what the agent knows, for the no-match reply. */
export function momentCatalogue(moments: IconicMoment[]): string {
  return moments.map((m) => `• ${m.title} (${m.year})`).join("\n");
}

// Generic cricket/filler words excluded from fuzzy scoring — only distinctive
// tokens (player/place names, years) should drive a match, else AMA queries
// get hijacked onto the wrong seeded moment.
const STOPWORDS = new Set(
  ("the a an of in on at to as is was what would have has had did do does call called like about me you when how who " +
    "world cup final match game cricket commentary moment one day international twenty20 odi test over ball balls " +
    "runs run innings wicket wickets bat batting bowl bowling").split(" "),
);
const tokens = (s: string): string[] =>
  expandShortforms(s.toLowerCase())
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));

const yearsIn = (s: string): string[] => s.match(/\b(19|20)\d{2}\b/g) ?? [];

/** Title-token overlap (event-specific words only — never `context`, which shares players/teams across moments). */
const titleOverlap = (q: Set<string>, m: IconicMoment): number => {
  let n = 0;
  for (const w of new Set(tokens(m.title))) if (q.has(w)) n++;
  return n;
};

/**
 * Conservative, year-anchored keyword fallback for when the LLM doesn't return a
 * clean slug. If the user names a year, only same-year moments are eligible (so
 * "Dhoni's 2012 six" never snaps to the 2011 final). With no year, require ≥2
 * distinctive title words. Off-roster queries fall through to open-ended generation.
 */
function fuzzyMatch(query: string, moments: IconicMoment[]): IconicMoment | null {
  const q = new Set(tokens(query));
  const qYears = yearsIn(query);

  if (qYears.length) {
    const sameYear = moments.filter((m) => qYears.includes(String(m.year)));
    if (sameYear.length === 1) return sameYear[0]!;
    return uniqueTop(sameYear, q, 1); // multiple that year → need title overlap to disambiguate
  }
  return uniqueTop(moments, q, 2); // no year → require ≥2 distinctive title words
}

/** Single moment with the highest title overlap ≥ min, or null if tied/none. */
function uniqueTop(cands: IconicMoment[], q: Set<string>, min: number): IconicMoment | null {
  let best: IconicMoment | null = null;
  let bestScore = 0;
  let tie = false;
  for (const m of cands) {
    const score = titleOverlap(q, m);
    if (score > bestScore) ((best = m), (bestScore = score), (tie = false));
    else if (score === bestScore && score > 0) tie = true;
  }
  return bestScore >= min && !tie ? best : null;
}

/** Step 1 — match free-text to a seeded moment. Returns null if nothing fits. */
export async function identifyMoment(query: string, moments: IconicMoment[]): Promise<IconicMoment | null> {
  const catalogue = moments
    .map((m) => `slug=${m.slug} | ${m.title} (${m.year}) | originally called by ${m.original_commentator}`)
    .join("\n");

  const raw = await chat(
    [
      {
        role: "system",
        content:
          "You match a fan's request to a cricket moment in the catalogue ONLY if it refers to that exact same event. " +
          "Interpret common shorthand: 'wc' = World Cup, 'wt20'/'t20 wc'/'t20' = World T20 / Twenty20, " +
          "'odi' = One Day International, 'ipl' = Indian Premier League, and apostrophe years like '11 = 2011. " +
          "A shared player, year, or tournament is NOT enough — if the request describes a DIFFERENT event than every " +
          'catalogue entry (even one involving the same player), reply "none". ' +
          'Reply with ONLY the matching slug, or "none".',
      },
      { role: "user", content: `Catalogue:\n${catalogue}\n\nRequest: "${query}"\n\nBest-match slug:` },
    ],
    { temperature: 0, maxTokens: 30 },
  );

  const slug = raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
  const llm = moments.find((m) => m.slug === slug);
  // Year-consistency guard: if the user named a year, the LLM's pick must match it,
  // otherwise it's a different event (e.g. a 2012 six matched to the 2011 final) → treat as no match.
  const qYears = yearsIn(query);
  if (llm && (!qYears.length || qYears.includes(String(llm.year)))) return llm;
  return fuzzyMatch(query, moments);
}

/**
 * Classify a message that named no known commentator: is it a fresh REQUEST
 * (naming a voice/moment) or FEEDBACK refining the last call? Defaults to
 * "request" when unsure, so unknown names aren't written into a commentator's memory.
 */
export async function classifyIntent(text: string): Promise<"request" | "feedback"> {
  const raw = await chat(
    [
      {
        role: "system",
        content:
          "A user is talking to a cricket commentary bot. Reply with exactly one word: " +
          "'feedback' if the message is a correction/adjustment to a previous commentary " +
          "(e.g. 'make him louder', 'more excited', 'too calm'); otherwise 'request'.",
      },
      { role: "user", content: text },
    ],
    { temperature: 0, maxTokens: 5 },
  );
  return raw.toLowerCase().includes("feedback") ? "feedback" : "request";
}

/** Step 2 — reimagine the moment in the target commentator's voice. */
export async function generateCall(
  moment: IconicMoment,
  targetCommentatorName: string,
  styleContext: string,
): Promise<string> {
  return chat(
    [
      {
        role: "system",
        content:
          `You are reimagining a famous cricket moment as if ${targetCommentatorName} were on the mic instead of the original commentator. ` +
          `Capture ${targetCommentatorName}'s voice precisely using these style notes:\n${styleContext}\n\n` +
          "Output ONLY the live commentary — 2 to 4 sentences, as it would be spoken in the moment. No preamble, no quotation marks, no stage directions.",
      },
      {
        role: "user",
        content:
          `Moment: ${moment.title} (${moment.year})\n` +
          `What happens: ${moment.context}\n` +
          `Originally called by ${moment.original_commentator}: "${moment.original_line}"\n\n` +
          `Now call it as ${targetCommentatorName}:`,
      },
    ],
    { temperature: 0.85, maxTokens: 350 },
  );
}
