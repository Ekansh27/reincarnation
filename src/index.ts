import "dotenv/config";
import express from "express";
import { createAgent } from "./agent.js";

function twimlReply(message: string): string {
  const safe = message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${safe}</Message></Response>`;
}

console.log("Loading catalogue from Supabase...");
const agent = await createAgent();
console.log(`  ${agent.commentators.length} commentators loaded.`);

const app = express();
app.use(express.urlencoded({ extended: false }));

app.post("/sms", async (req, res) => {
  const from: string = req.body.From ?? "unknown";
  const text: string = (req.body.Body ?? "").trim();
  console.log(`[sms] from=${from} text="${text}"`);

  try {
    const reply = await agent.handle(from, text);
    res.type("text/xml").send(twimlReply(reply.text));
  } catch (err) {
    console.error("[sms] handler error:", err);
    res.type("text/xml").send(twimlReply("Something went wrong. Try again."));
  }
});

const port = process.env.PORT ?? 3000;
app.listen(port, () => console.log(`SMS webhook listening on :${port}`));
