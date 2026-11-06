#!/bin/bash
set -euo pipefail
cd /opt/bot

echo "=== canvas ==="
if node -e "require('canvas'); console.log('canvas ok');" 2>/dev/null; then
  echo "canvas already present"
else
  echo "installing system deps + canvas..."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev pkg-config
  npm install canvas@2.11.2 --no-fund --no-audit
  node -e "require('canvas'); console.log('canvas ok after install');"
fi

echo "=== force friday final announce (Perfetti) ==="
node <<'NODE'
const fs = require("fs");
function env(k) {
  const line = fs.readFileSync("/opt/bot/.env", "utf8").split(/\r?\n/).find((l) => l.startsWith(k + "="));
  if (!line) return "";
  let v = line.slice(k.length + 1);
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  return v;
}

(async () => {
  const mongoose = require("/opt/bot/node_modules/mongoose");
  await mongoose.connect((env("MONGO_URI") || env("MONGODB_URI") || env("MONGO_URL") || "").replace(/^["']|["']$/g, ""));
  const { createSiteApiRestClient } = require("/opt/bot/bots-ts/src/Vinili/site/http/siteApiRestClient.js");
  const token = env("DISCORD_TOKEN_OFFICIAL") || env("DISCORD_TOKEN");
  const client = await createSiteApiRestClient({}, token, { restTimeoutMs: 20000, meAttempts: 5 });
  global.botClient = client;
  global.logger = console;

  const col = mongoose.connection.db.collection("botstates");
  const STATE_KEY = "movieNightAnnouncement.v1";
  const doc = await col.findOne({ key: STATE_KEY });
  const state = { ...(doc?.value || {}) };

  // Clear false spareggio leftovers so final announce is allowed
  state.tieBreakerPollMessageId = "";
  state.tiedMovieTitles = [];
  if (!Array.isArray(state.voteResults) || !state.voteResults.length) {
    throw new Error("voteResults missing — run vote repair first");
  }
  await col.updateOne(
    { key: STATE_KEY },
    {
      $set: {
        "value.tieBreakerPollMessageId": "",
        "value.tiedMovieTitles": [],
      },
    }
  );

  // Prefer direct call if exported after deploy; else inline announce
  let out;
  try {
    const svc = require("/opt/bot/bots-ts/src/Vinili/Community/services/movieNightAnnouncementService.js");
    if (typeof svc.runMovieNightFinalAnnouncementCheck === "function") {
      out = await svc.runMovieNightFinalAnnouncementCheck(client, {
        force: true,
        slot: "friday",
        now: new Date(),
      });
      console.log("via service", out);
    } else {
      throw new Error("not_exported");
    }
  } catch (e) {
    if (String(e?.message || e) !== "not_exported" && !String(e).includes("not_exported")) {
      // fall through to inline if missing export only
      if (!String(e?.message || "").includes("not_exported") && typeof e === "object") {
        console.warn("service call failed, inline fallback:", e?.message || e);
      }
    }
    const votes = require("/opt/bot/bots-ts/src/Vinili/Community/services/movieNightVotes.js");
    const msgs = require("/opt/bot/bots-ts/src/Vinili/Community/services/movieNightMessages.js");
    const desc = require("/opt/bot/bots-ts/src/Vinili/Community/services/movieNightDescriptions.js");
    const sched = require("/opt/bot/bots-ts/src/Vinili/Community/services/movieNightSchedule.js");
    const IDs = require("/opt/bot/bots-ts/src/Vinili/Config/ids.js");
    const { getBotState, setBotState } = require("/opt/bot/bots-ts/src/shared/botState/botStateStore.js");

    const now = new Date();
    const weekKey = sched.getRomeWeekKey(now);
    const saturdayKey = sched.getRomeSaturdayKeyForWeek(now);
    const title =
      (await votes.resolveFinalMovieTitle(client, state, now).catch(() => null)) ||
      state.voteResults?.[0]?.title;
    if (!title) throw new Error("no title");
    const description = await desc.fetchItalianMovieDescription(title);
    const channel =
      (await client.channels.fetch(votes.ANNOUNCEMENT_CHANNEL_ID).catch(() => null)) ||
      client.channels.cache.get(votes.ANNOUNCEMENT_CHANNEL_ID);
    const eventUrl = msgs.buildDiscordEventUrl(state.guildId || IDs.guilds?.main, state.eventId);
    const content = msgs.buildFinalMovieNightAnnouncementMessage({
      title,
      description,
      eventUrl,
      saturdayKey,
      announceSlot: "friday",
    });
    const message = await channel.send({
      content,
      allowedMentions: {
        roles: [...new Set([msgs.EVENTS_ROLE_ID, msgs.SERATA_FILM_ROLE_ID].filter(Boolean))],
      },
      __skipNoticeEmbed: true,
    });
    await setBotState(STATE_KEY, {
      ...state,
      weekKey,
      finalMovieTitle: title,
      finalMovieDescription: description,
      finalAnnouncementMessageId: String(message.id || ""),
      finalAnnouncedSaturdayKey: saturdayKey,
      finalAnnouncedAt: new Date().toISOString(),
      tieBreakerPollMessageId: "",
      tiedMovieTitles: [],
    });
    out = { ok: true, title, messageId: String(message.id || ""), inline: true };
    console.log("via inline", out);
  }

  const after = (await col.findOne({ key: STATE_KEY }))?.value || {};
  console.log("final state", {
    title: after.finalMovieTitle,
    messageId: after.finalAnnouncementMessageId,
    at: after.finalAnnouncedAt,
  });
  await mongoose.disconnect().catch(() => null);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
NODE

echo "=== restart site-api ==="
pm2 restart site-api --update-env
sleep 2
pm2 logs site-api --lines 15 --nostream | tail -20 || true
echo DONE
