const fs = require("fs");

process.chdir("/opt/bot");
for (const envPath of ["/opt/bot/.env", "/opt/bot/bots-ts/.env", "/opt/bot/bots-ts/src/.env"]) {
  try {
    if (!fs.existsSync(envPath)) continue;
    for (const line of fs.readFileSync(envPath, "utf8").split(/\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 1) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (key && process.env[key] == null) process.env[key] = val;
    }
  } catch (_) {}
}

/* Connetti PRIMA di caricare i servizi: stesso mongoose dei schema. */
const mongoose = require("mongoose");
const SRC = "/opt/bot/bots-ts/src";

const mode = String(process.argv[2] || "dry").trim().toLowerCase();
const doSend = mode === "send" || mode === "edit";
const GID = "1329080093599076474";

(async () => {
  const mongo = String(process.env.MONGO_URL || process.env.MONGODB_URI || "").trim();
  const token = String(process.env.DISCORD_TOKEN || process.env.DISCORD_TOKEN_OFFICIAL || "").trim();
  if (!mongo || !token) throw new Error(`missing mongo/token mongo=${Boolean(mongo)} token=${Boolean(token)}`);
  await mongoose.connect(mongo, { maxPoolSize: 2, serverSelectionTimeoutMS: 12000 });
  console.log("[weekly] mongo readyState", mongoose.connection.readyState);

  const { loadVinylsConfig, installConsoleLogger } = require(`${SRC}/Vinili/site/workers/workerAppBootstrap.js`);
  installConsoleLogger();
  const { createSiteApiRestClient } = require(`${SRC}/Vinili/site/http/siteApiRestClient.js`);
  const {
    publishWeeklyActivityWinners,
    TARGET_CHANNEL_ID,
  } = require(`${SRC}/Vinili/Community/services/winnersWeekly.js`);
  const {
    getMinigameRankWeekKeyForPublish,
    getNextWeekKeyAfterSunday21Boundary,
    getWeekKey,
  } = require(`${SRC}/Vinili/Community/services/winnersTime.js`);
  const { effectiveMinigameWeeklyScoreForRankWeek } = require(`${SRC}/Vinili/Community/services/winnersRows.js`);

  const now = new Date();
  const rankKey = getMinigameRankWeekKeyForPublish(now);
  const nextKey = getNextWeekKeyAfterSunday21Boundary(now);
  const weekNow = getWeekKey(now);
  console.log(JSON.stringify({ now: now.toISOString(), rankKey, nextKey, weekNow }, null, 2));

  const col = mongoose.connection.db.collection("activityuserprofiles");
  const stuck = await col.countDocuments({
    guildId: GID,
    "profile.totals.exp.minigame.weeklyKey": rankKey,
    "profile.totals.exp.minigame.prevWeekKey": rankKey,
  });
  if (stuck > 0 && nextKey && nextKey !== rankKey) {
    const res = await col.updateMany(
      {
        guildId: GID,
        "profile.totals.exp.minigame.weeklyKey": rankKey,
        "profile.totals.exp.minigame.prevWeekKey": rankKey,
      },
      { $set: { "profile.totals.exp.minigame.weeklyKey": nextKey } },
    );
    console.log(`[repair] weeklyKey ${rankKey}→${nextKey} matched=${res.matchedCount} modified=${res.modifiedCount}`);
  } else {
    console.log(`[repair] skip stuck=${stuck} nextKey=${nextKey}`);
  }

  const topPrev = await col
    .find({
      guildId: GID,
      "profile.totals.exp.minigame.prevWeekKey": rankKey,
      "profile.totals.exp.minigame.prevWeekExp": { $gt: 0 },
    })
    .project({ userId: 1, profile: 1 })
    .sort({ "profile.totals.exp.minigame.prevWeekExp": -1 })
    .limit(5)
    .toArray();
  console.log(
    "[top prevWeek]",
    topPrev.map((d) => ({
      userId: d.userId,
      score: effectiveMinigameWeeklyScoreForRankWeek(d, rankKey),
      wk: d.profile?.totals?.exp?.minigame?.weeklyKey,
      we: d.profile?.totals?.exp?.minigame?.weeklyExp,
      pe: d.profile?.totals?.exp?.minigame?.prevWeekExp,
    })),
  );

  const config = loadVinylsConfig();
  const client = await createSiteApiRestClient(config, token, {
    restTimeoutMs: 20000,
    meAttempts: 5,
  });
  console.log(`[weekly] mode=${doSend ? "EDIT" : "DRY"} guilds=${client.guilds?.cache?.size || 0} me=${client.user?.id}`);

  let editMessage = null;
  if (doSend) {
    const channel = await client.channels.fetch(TARGET_CHANNEL_ID);
    const msgs = await channel.messages.fetch({ limit: 25 });
    const arr = [...msgs.values()];
    editMessage =
      arr.find(
        (m) =>
          String(m.author?.id || "") === String(client.user?.id || "") &&
          /Classifica minigames|Annunciamo i vincitori/i.test(
            String(m.content || "") + (m.embeds?.[0]?.description || ""),
          ),
      ) || null;
    if (!editMessage) throw new Error("messaggio top-weekly da editare non trovato");
    console.log(`[weekly] edit message=${editMessage.id} channel=${TARGET_CHANNEL_ID}`);
  }

  await publishWeeklyActivityWinners(client, {
    force: true,
    skipDiscordSends: !doSend,
    skipWeeklyRoles: !doSend,
    editMessage: editMessage || undefined,
    dryRunLogger: (d) => {
      console.log(
        JSON.stringify(
          {
            awarded: d.awarded,
            displayTopMinigame: d.displayTopMinigame,
            minigameRows: d.minigameRows,
            minigameRankWeekKey: d.minigameRankWeekKey,
            displayTopMessages: (d.displayTopMessages || []).slice(0, 3),
            displayTopVoice: (d.displayTopVoice || []).slice(0, 3),
          },
          null,
          2,
        ),
      );
    },
  });

  await mongoose.disconnect().catch(() => {});
  console.log("[weekly] done");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
