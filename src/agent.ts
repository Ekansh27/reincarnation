import { fetchCommentators, fetchMoments, logClip, type Commentator, type IconicMoment } from "./butterbase.js";
import { readStyle, recordFeedback } from "./xtrace.js";
import { reimagine, classifyIntent, NeedMomentError } from "./rocketride.js";

/**
 * Channel-agnostic orchestration shared by the Photon iMessage layer and the CLI.
 *   • name a known commentator → reimagine request (any moment — open-ended).
 *   • name an unknown commentator → "not in my roster yet".
 *   • reply without a name → feedback that refines the last voice (XTrace write).
 */

export type Routable = Commentator & { firstName: string; tokens: string[] };

export interface Agent {
  commentators: Routable[];
  handle: (senderId: string, text: string) => Promise<string>;
  helpText: () => string;
}

const nameTokens = (name: string): string[] =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3);

export async function createAgent(): Promise<Agent> {
  const [rawCommentators, moments] = await Promise.all([fetchCommentators(), fetchMoments()]);
  const commentators: Routable[] = rawCommentators.map((c) => ({
    ...c,
    firstName: c.name.split(" ")[0]!.toLowerCase(),
    tokens: nameTokens(c.name),
  }));

  const firstNames = new Set(commentators.map((c) => c.firstName));
  // "Strong" tokens = surname + nicknames (everything but the first name). Surnames/nicknames
  // are unique across the roster, so a strong token pins down exactly one commentator.
  const strongOwner = new Map<string, string>();
  for (const c of commentators) for (const tok of c.tokens) if (tok !== c.firstName) strongOwner.set(tok, c.slug);
  // first name → slugs (collides for the two Ians)
  const firstOwner = new Map<string, string[]>();
  for (const c of commentators) firstOwner.set(c.firstName, [...(firstOwner.get(c.firstName) ?? []), c.slug]);

  // Words allowed to follow a bare first name without implying a *different* surname.
  const FOLLOWERS = new Set(
    "the a an would have has will please can could do doing on in at for as vs against of and to call calling commentate version style".split(" "),
  );

  const lastCommentator = new Map<string, Routable>();
  const names = commentators.map((c) => c.name).join(", ");
  const bySlug = (slug: string) => commentators.find((c) => c.slug === slug);
  const normName = (c: Routable) => c.name.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

  /** Match by priority: full name → unique surname/nickname → bare first name (adjacency-guarded). */
  const matchCommentator = (text: string): Routable | undefined => {
    const norm = text.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
    const words = norm.split(" ").filter(Boolean);

    // 1. Full name present → most specific wins.
    const full = commentators.filter((c) => norm.includes(normName(c))).sort((a, b) => normName(b).length - normName(a).length);
    if (full[0]) return full[0];

    // 2. Unique surname/nickname token (e.g. "Holding", "Bishop", "Bumble").
    for (const w of words) {
      const slug = strongOwner.get(w);
      if (slug) return bySlug(slug);
    }

    // 3. Bare first name — only if it uniquely maps AND isn't paired with a different surname.
    for (let i = 0; i < words.length; i++) {
      const owners = firstOwner.get(words[i]!);
      if (!owners || owners.length !== 1) continue; // unknown or ambiguous (e.g. "ian")
      const next = words[i + 1];
      // reject "Tony Cozier" (next word is an unknown alphabetic surname, not a follower word)
      if (next && /^[a-z]+$/.test(next) && !FOLLOWERS.has(next) && !firstNames.has(next)) continue;
      return bySlug(owners[0]!);
    }
    return undefined;
  };

  const helpText = (): string =>
    "🏏 Reincarnation — hear any cricket moment in a legend's voice.\n\n" +
    `Name a commentator + a moment, e.g.:\n  "What would Harsha Bhogle have done at the 2011 World Cup final?"\n\n` +
    `Voices: ${names}\n` +
    "Reply without naming a commentator to refine the last one's voice (e.g. \"he gets way louder on a six\").";

  const handleRequest = async (text: string, target: Routable): Promise<string> => {
    if (!target.xtrace_group_id) return `${target.name} isn't set up yet — run \`npm run seed\` first.`;

    const style = await readStyle(target.xtrace_group_id, target.name);
    let result;
    try {
      result = await reimagine({ query: text, targetCommentatorName: target.name, styleContext: style.context, moments });
    } catch (err) {
      if (err instanceof NeedMomentError) {
        return `Which moment should ${target.firstName} call? Name one — any famous cricket moment works (e.g. "the 2011 WC final" or "Stokes at Headingley 2019").`;
      }
      throw err;
    }

    await logClip({
      user_handle: "cli",
      query: text,
      target_commentator: target.name,
      matched_moment: result.matchedTitle,
      script_text: result.scriptText,
    });

    const origin = result.originalCommentator ? ` (originally ${result.originalCommentator})` : "";
    const header = result.matchedTitle ? `${target.name} on ${result.matchedTitle}${origin}` : `${target.name}`;
    return `🎙️ ${header}:\n\n${result.scriptText}\n\n↩️ Not quite? Reply with a tweak and I'll remember it for ${target.firstName}.`;
  };

  const handle = async (senderId: string, text: string): Promise<string> => {
    const target = matchCommentator(text);
    if (target) {
      lastCommentator.set(senderId, target);
      return handleRequest(text, target);
    }

    // No known commentator named — is this a request for a voice we don't have, or feedback?
    const intent = await classifyIntent(text);
    if (intent === "request") {
      return (
        "I don't have that commentator in my roster yet 🎙️\n\n" +
        `Voices I can do: ${names}\n\n` +
        'Name one of them + a moment (e.g. "Harsha Bhogle, the 2011 WC final").'
      );
    }

    const c = lastCommentator.get(senderId);
    if (c?.xtrace_group_id) {
      const summary = await recordFeedback(c.xtrace_group_id, c.name, senderId, text);
      return `${summary}\n\nAsk me to call a moment as ${c.name} again to hear the difference.`;
    }
    return helpText();
  };

  return { commentators, handle, helpText };
}
