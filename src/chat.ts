import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createAgent } from "./agent.js";

/**
 * Interactive terminal version of the agent — the exact same orchestration as
 * the iMessage layer (commentator routing → XTrace read → gateway generate →
 * feedback/self-revision), but typed in the terminal. Lets you demo solo,
 * without a second phone.
 *
 *   npm run chat
 */
async function main() {
  console.log("Loading catalogue from Butterbase...");
  const agent = await createAgent();
  console.log(`  ${agent.commentators.length} commentators loaded.\n`);
  console.log(agent.helpText());
  console.log("\n(type 'exit' to quit)\n");

  const rl = readline.createInterface({ input: stdin, output: stdout });
  const senderId = "cli-user"; // stable id → feedback refines the last commentator

  while (true) {
    let text: string;
    try {
      text = (await rl.question("you ▸ ")).trim();
    } catch {
      break; // stdin closed (Ctrl+D / EOF)
    }
    if (!text) continue;
    if (text.toLowerCase() === "exit" || text.toLowerCase() === "quit") break;

    try {
      const reply = await agent.handle(senderId, text);
      console.log("\n" + reply + "\n");
    } catch (err) {
      console.error("⚠️ " + (err instanceof Error ? err.message : err) + "\n");
    }
  }

  rl.close();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
