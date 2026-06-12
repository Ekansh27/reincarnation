import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchCommentators, fetchMoments, logClip } from "./db.js";
import { readStyle } from "./xtrace.js";
import { identifyMoment, generateCall, generateOpen } from "./rocketride.js";
import { synthesize } from "./elevenlabs.js";
import type { Commentator, IconicMoment } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(__dirname, "../frontend/app.html");
const PORT = Number(process.env.PORT ?? 3000);
const TARGET_COMMENTATOR = "Harsha Bhogle";

interface AppState {
  harsha: Commentator;
  moments: IconicMoment[];
}

async function loadState(): Promise<AppState> {
  const [commentators, moments] = await Promise.all([fetchCommentators(), fetchMoments()]);
  const harsha = commentators.find((c) => c.name === TARGET_COMMENTATOR);
  if (!harsha) throw new Error(`${TARGET_COMMENTATOR} not found in DB — run npm run seed first`);
  if (!harsha.xtrace_group_id) throw new Error(`${TARGET_COMMENTATOR} has no XTrace group — run npm run seed first`);
  return { harsha, moments };
}

async function handleCommentary(state: AppState, query: string): Promise<Buffer> {
  const { harsha, moments } = state;
  const style = await readStyle(harsha.xtrace_group_id!, harsha.name);

  let scriptText: string;
  let matchedTitle = "";
  let originalCommentator = "";

  const seeded = await identifyMoment(query, moments);
  if (seeded) {
    scriptText = await generateCall(seeded, harsha.name, style.context);
    matchedTitle = seeded.title;
    originalCommentator = seeded.original_commentator;
  } else {
    const open = await generateOpen(query, harsha.name, style.context);
    if (open.needMoment) {
      throw new UserError('Which moment? Name a specific cricket event — e.g. "the 2011 WC final" or "Botham at Headingley 1981".');
    }
    scriptText = open.commentary;
    matchedTitle = open.moment;
    originalCommentator = open.original_commentator;
  }

  // Best-effort logging
  logClip({ user_handle: "web", query, target_commentator: harsha.name, matched_moment: matchedTitle, script_text: scriptText }).catch(() => {});

  const audio = await synthesize(scriptText);
  console.log(`[commentary] "${query}" → "${matchedTitle}" (${originalCommentator}) — ${audio.byteLength} bytes`);
  return audio;
}

class UserError extends Error {}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  // Serve frontend
  if (req.method === "GET" && url.pathname === "/") {
    try {
      const html = fs.readFileSync(FRONTEND);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    } catch {
      res.writeHead(404);
      res.end("frontend/app.html not found");
    }
    return;
  }

  // Commentary endpoint
  if (req.method === "POST" && url.pathname === "/commentary") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const { query } = JSON.parse(body) as { query?: string };
        if (!query?.trim()) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "query is required" }));
          return;
        }

        const audio = await handleCommentary(state!, query.trim());
        res.writeHead(200, { "Content-Type": "audio/mpeg" });
        res.end(audio);
      } catch (err) {
        if (err instanceof UserError) {
          res.writeHead(422, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        } else {
          console.error("[server] error:", err);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Something went wrong — check server logs." }));
        }
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

let state: AppState | null = null;

console.log("[server] loading commentators + moments...");
loadState()
  .then((s) => {
    state = s;
    server.listen(PORT, () => {
      console.log(`[server] ready → http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("[server] startup failed:", err);
    process.exit(1);
  });
