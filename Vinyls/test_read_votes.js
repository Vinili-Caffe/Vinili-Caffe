const { Client, GatewayIntentBits } = require("discord.js");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

client.once("ready", async () => {
    try {
        const channelId = "1442569123426074736";
        const channel = await client.channels.fetch(channelId).catch(() => null);
        const fetched = await channel.messages.fetch({ limit: 100 });
        const pattern = /un nuovo voto!/i;
        
        for (const m of fetched.values()) {
            for (const e of m.embeds) {
                if (pattern.test(e.description || "") || pattern.test(e.title || "")) {
                    const mention = (e.description || "").match(/<@!?(\d+)>/);
                    console.log(`FOUND_VOTE_FOR: ${mention ? mention[1] : "NOT_FOUND"}`);
                    console.log(`SNIPPET: ${(e.description || "").slice(0, 50)}`);
                }
            }
        }
        process.exit(0);
    } catch (err) { console.error(err); process.exit(1); }
});

client.login(process.env.DISCORD_TOKEN || process.env.DISCORD_TOKEN_OFFICIAL);
