require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const { Client, GatewayIntentBits, Partials } = require("discord.js");
const IDs = require("../Vinyls/Utils/Config/ids");
const guildMemberUpdateExtras = require("../Vinyls/Events/guildMemberUpdate");

const userId = String(process.argv[2] || "").trim();
if (!/^\d{17,20}$/.test(userId)) {
  console.error("Uso: node scripts/recover-boost-user.js <userId>");
  process.exit(1);
}

const token = process.env.DISCORD_TOKEN_OFFICIAL || process.env.DISCORD_TOKEN;
if (!token) {
  console.error("Token Discord mancante in .env");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel],
});

client.once("ready", async () => {
  try {
    const guildId = String(IDs.guilds.main || "");
    const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId));
    await guild.members.fetch().catch(() => null);
    const correct = await guildMemberUpdateExtras.correctMisleadingSingleBoostEmbedsOnStartup(client);
    const recover = await guildMemberUpdateExtras.recoverMissingBoostEmbedsForUser(guild, userId, {
      knownNativeSlots: 2,
      expectedSlots: 2,
      startedAt: Date.now(),
      nativeLookbackMs: 7 * 24 * 60 * 60 * 1000,
    });
    console.log("correctMisleading:", JSON.stringify(correct));
    console.log("recoverMissingBoostEmbedsForUser:", JSON.stringify(recover));
  } catch (err) {
    console.error(err?.message || err);
    process.exitCode = 1;
  } finally {
    client.destroy().catch(() => null);
    process.exit(process.exitCode || 0);
  }
});

client.login(token).catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});