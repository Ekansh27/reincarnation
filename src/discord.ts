import "dotenv/config";
import { Client, GatewayIntentBits, ChannelType } from "discord.js";
import { createAgent } from "./agent.js";

const token = process.env["DISCORD_BOT_TOKEN"];
if (!token) throw new Error("Missing required env var: DISCORD_BOT_TOKEN");

console.log("Loading catalogue from Supabase...");
const agent = await createAgent();
console.log(`  ${agent.commentators.length} commentators loaded.`);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const isDM = message.channel.type === ChannelType.DM;
  const isMentioned = message.mentions.has(client.user!);
  if (!isDM && !isMentioned) return;

  const text = message.content.replace(/<@!?\d+>/g, "").trim();
  if (!text) return;

  const senderId = message.author.id;
  console.log(`[discord] from=${senderId} text="${text}"`);

  try {
    await message.channel.sendTyping();
    const reply = await agent.handle(senderId, text);
    await message.reply(reply.text);
  } catch (err) {
    console.error("[discord] handler error:", err);
    await message.reply("Something went wrong. Try again.");
  }
});

client.once("ready", () => {
  console.log(`Discord bot ready as ${client.user?.tag}`);
});

console.log("Connecting to Discord...");
client.login(token);
