require("dotenv").config();

const mongoose = require("mongoose");
const { Client, GatewayIntentBits } = require("discord.js");
const IDs = require("../Vinyls/Utils/Config/ids");
const config = require("../Vinyls/config.json");
const { runWeeklyLimitAutoValutazioniCatchupSegment, runWeeklyStaffResocontoSegment } = require("../Vinyls/Services/Staff/weeklyStaffResocontoService");

function argValue(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => String(arg || "").startsWith(prefix));
  return hit ? String(hit).slice(prefix.length).trim() : "";
}

function resolveMongoUrl() {
  return (
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGODB_URI_LOCAL ||
    process.env.MONGO_URL ||
    process.env.MONGODB_URI ||
    config.mongoURL
  );
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const userId = argValue("user");
  const segment = argValue("segment") || "mod";
  const autovalutazioni = hasFlag("autovalutazioni");
  const forceAutoValutazioni = hasFlag("force-autovalutazioni");
  if (userId && !/^\d{16,20}$/.test(userId)) {
    throw new Error("Uso: node scripts/rerun-staff-resoconto.js --segment=mod [--user=ID]");
  }

  const token = process.env.DISCORD_TOKEN || process.env.DISCORD_TOKEN_OFFICIAL || config.token;
  const mongoUrl = resolveMongoUrl();
  if (!token) throw new Error("Token Discord mancante.");
  if (!mongoUrl) throw new Error("Mongo URL mancante.");

  await mongoose.connect(mongoUrl, { serverSelectionTimeoutMS: 15000 });
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
    ],
  });

  await client.login(token);
  await new Promise((resolve) => client.once("ready", resolve));
  if (autovalutazioni) {
    const result = await runWeeklyLimitAutoValutazioniCatchupSegment(client, segment, new Date(), {
      forceAutoValutazioni,
    });
    client.destroy();
    await mongoose.disconnect();
    console.log(
      `RERUN_STAFF_AUTOVALUTAZIONI_OK segment=${segment} created=${Number(result?.applied || 0)} existing=${Number(result?.existing || 0)} eligible=${Number(result?.eligible || 0)} skipped=${Number(result?.skipped || 0)} force=${forceAutoValutazioni ? "true" : "false"}`,
    );
    return;
  }
  const result = await runWeeklyStaffResocontoSegment(
    client,
    segment,
    userId ? { userId, force: true } : { recovery: true },
  );
  client.destroy();
  await mongoose.disconnect();
  const skipped = result?.skipped || {};
  console.log(
    `RERUN_STAFF_RESOCONTO_OK segment=${segment}${userId ? ` user=${userId}` : " missing-only=true"} sent=${Number(result?.sent || 0)} eligible=${Number(result?.eligible || 0)} completed=${Number(result?.completed || 0)} skippedAlready=${Number(skipped.alreadyPosted || 0)} skippedPex=${Number(skipped.pexWindow || 0)} sendFailed=${Number(skipped.sendFailed || 0)}`,
  );
}

main().catch(async (err) => {
  console.error(err?.stack || err?.message || err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});