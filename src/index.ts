import "dotenv/config";
import express from "express";
import twilio from "twilio";
import { createAgent } from "./agent.js";

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL; // full public URL, e.g. https://xxx.railway.app/sms

if (!ACCOUNT_SID || !AUTH_TOKEN) {
  console.error("Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN");
  process.exit(1);
}

console.log("Loading catalogue from Supabase...");
const agent = await createAgent();
console.log(`  ${agent.commentators.length} commentators loaded.`);

const app = express();
app.use(express.urlencoded({ extended: false }));

app.post("/sms", async (req, res) => {
  // Validate Twilio signature when WEBHOOK_URL is set (skip in local dev if unset)
  if (WEBHOOK_URL) {
    const valid = twilio.validateRequest(
      AUTH_TOKEN,
      req.headers["x-twilio-signature"] as string ?? "",
      WEBHOOK_URL,
      req.body
    );
    if (!valid) {
      res.status(403).send("Forbidden");
      return;
    }
  }

  const from: string = req.body.From ?? "unknown";
  const text: string = (req.body.Body ?? "").trim();

  const twiml = new twilio.twiml.MessagingResponse();

  try {
    const reply = await agent.handle(from, text);
    twiml.message(reply.text);
  } catch (err) {
    console.error("handler error:", err);
    twiml.message("Something went wrong. Try again.");
  }

  res.type("text/xml").send(twiml.toString());
});

const port = process.env.PORT ?? 3000;
app.listen(port, () => console.log(`SMS webhook listening on :${port}`));
