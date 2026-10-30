const __path = require("path") as typeof import("path");
const __eventCoreVinili = (rel: string) => __path.join(__path.resolve(__dirname, "../../../../../../src/Vinili"), rel);

/**
 * Classifica reaction Halloween (caccia emoji) + embed a fine evento.
 * Canale test default: 1562454089801928764
 */
const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { SiteDocument, SITE_DOCUMENT_TYPE } = require(__eventCoreVinili("Schemas/Community/communitySchemas"));
const IDs = require(__eventCoreVinili("Utils/Config/ids"));
const {
  resolveHalloweenEventConfig,
  isHalloweenEventWindowOpen,
} = require("../../Utils/Eventi/halloweenEventConfig") as typeof import("../../Utils/Eventi/halloweenEventConfig");

const DOC_TYPE = SITE_DOCUMENT_TYPE.HOGWARTS_REACT_PRESS;
const DOC_OWNER = "__halloween_react_lb__";
const loopState = new WeakSet();

const DEFAULT_FINALE_CHANNEL_ID = "1562454089801928764";
const TOP_N = 15;

function normalizeId(value?) {
  return String(value || "").trim();
}

function dedupeKeyFor(eventKey?) {
  return `halloween_react_lb_${normalizeId(eventKey) || "halloween_2026"}`;
}

function getFinaleChannelId(client?) {
  const raw =
    client?.config?.halloweenEvent && typeof client.config.halloweenEvent === "object"
      ? client.config.halloweenEvent
      : {};
  return (
    normalizeId(process.env.HALLOWEEN_REACT_LB_CHANNEL || raw.reactLeaderboardChannelId) ||
    DEFAULT_FINALE_CHANNEL_ID
  );
}

async function loadLbDoc(guildId?, eventKey?) {
  const gid = normalizeId(guildId);
  if (!gid) return null;
  return SiteDocument.findOne({
    guildId: gid,
    docType: DOC_TYPE,
    dedupeKey: dedupeKeyFor(eventKey),
  })
    .lean()
    .catch(() => null);
}

async function recordHalloweenReactWin({ guildId, userId, eventKey, amount = 1 }: any = {}) {
  const gid = normalizeId(guildId);
  const uid = normalizeId(userId);
  const ek = normalizeId(eventKey) || "halloween_2026";
  const add = Math.max(1, Math.floor(Number(amount) || 1));
  if (!gid || !uid) return null;
  const path = `rawWebhook.scores.${uid}`;
  return SiteDocument.findOneAndUpdate(
    { guildId: gid, docType: DOC_TYPE, dedupeKey: dedupeKeyFor(ek) },
    {
      $inc: { [path]: add },
      $set: { "rawWebhook.updatedAtMs": Date.now(), updatedAt: new Date() },
      $setOnInsert: {
        guildId: gid,
        docType: DOC_TYPE,
        userId: DOC_OWNER,
        dedupeKey: dedupeKeyFor(ek),
        "rawWebhook.eventKey": ek,
        "rawWebhook.finalePostedAtMs": 0,
      },
    },
    { upsert: true, new: true },
  ).catch((err?) => {
    global.logger?.warn?.("[HALLOWEEN-REACT-LB] record failed:", err?.message || err);
    return null;
  });
}

function readScores(doc?) {
  const raw = doc?.rawWebhook && typeof doc.rawWebhook === "object" ? doc.rawWebhook : {};
  const scores = raw.scores && typeof raw.scores === "object" ? raw.scores : {};
  return Object.entries(scores)
    .map(([userId, n]) => ({ userId: normalizeId(userId), wins: Math.max(0, Math.floor(Number(n) || 0)) }))
    .filter((r?) => r.userId && r.wins > 0)
    .sort((a?, b?) => b.wins - a.wins || a.userId.localeCompare(b.userId));
}

function medal(i?) {
  if (i === 0) return "🥇";
  if (i === 1) return "🥈";
  if (i === 2) return "🥉";
  return `\`${i + 1}.\``;
}

function buildReactLeaderboardEmbed({ rows, eventKey, endsAtMs }) {
  const lines =
    rows.length > 0
      ? rows.slice(0, TOP_N).map((r?, i?) => `${medal(i)} <@${r.userId}> — **${r.wins}** react`)
      : ["_Nessuna react registrata durante l’evento._"];
  const embed = new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle("🎃 Classifica React Halloween")
    .setDescription(
      [
        "Chi ha trovato più emoji Halloween durante l’evento!",
        "",
        ...lines,
      ].join("\n"),
    )
    .setFooter({ text: `${eventKey || "halloween"} · Vinili & Caffè` })
    .setTimestamp(endsAtMs && Number.isFinite(endsAtMs) ? new Date(endsAtMs) : new Date());
  return embed;
}

async function postHalloweenReactLeaderboard(client?, options: Record<string, any> = {}) {
  const cfg = resolveHalloweenEventConfig(client);
  const eventKey = cfg.eventKey || "halloween_2026";
  const mainId = normalizeId(IDs.guilds?.main);
  if (!mainId) return { ok: false, reason: "no_main_guild" };

  const doc = await loadLbDoc(mainId, eventKey);
  const raw = doc?.rawWebhook && typeof doc.rawWebhook === "object" ? doc.rawWebhook : {};
  if (!options.force && Number(raw.finalePostedAtMs) > 0) {
    return { ok: true, skipped: true, reason: "already_posted" };
  }

  const rows = readScores(doc);
  const channelId = getFinaleChannelId(client);
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.send) return { ok: false, reason: "no_channel", channelId };

  const embed = buildReactLeaderboardEmbed({
    rows,
    eventKey,
    endsAtMs: Number(cfg.endMs) || Date.now(),
  });
  const msg = await channel
    .send({
      content: "<:VC_Halloween:1558964785113206824> **Fine evento Halloween** — classifica react",
      embeds: [embed],
      allowedMentions: { parse: [] },
    })
    .catch((err?) => {
      global.logger?.warn?.("[HALLOWEEN-REACT-LB] send failed:", err?.message || err);
      return null;
    });
  if (!msg) return { ok: false, reason: "send_failed", channelId };

  await SiteDocument.findOneAndUpdate(
    { guildId: mainId, docType: DOC_TYPE, dedupeKey: dedupeKeyFor(eventKey) },
    {
      $set: {
        "rawWebhook.finalePostedAtMs": Date.now(),
        "rawWebhook.finaleMessageId": String(msg.id),
        "rawWebhook.finaleChannelId": channelId,
        updatedAt: new Date(),
      },
      $setOnInsert: {
        guildId: mainId,
        docType: DOC_TYPE,
        userId: DOC_OWNER,
        dedupeKey: dedupeKeyFor(eventKey),
        "rawWebhook.eventKey": eventKey,
        "rawWebhook.scores": {},
      },
    },
    { upsert: true },
  ).catch(() => null);

  return { ok: true, channelId, messageId: msg.id, rows: rows.length };
}

async function maybePostHalloweenReactLeaderboard(client?, nowMs = Date.now()) {
  const cfg = resolveHalloweenEventConfig(client);
  if (!cfg.enabled) return { ok: false, reason: "disabled" };
  const phase = isHalloweenEventWindowOpen(cfg, nowMs);
  if (phase?.phase !== "after_end") return { ok: true, skipped: true, reason: phase?.phase || "not_ended" };
  return postHalloweenReactLeaderboard(client);
}

function startHalloweenReactLeaderboardLoop(client?) {
  if (!client || loopState.has(client)) return;
  loopState.add(client);

  const tick = async () => {
    try {
      await maybePostHalloweenReactLeaderboard(client);
    } catch (err) {
      global.logger?.warn?.("[HALLOWEEN-REACT-LB] tick:", err?.message || err);
    }
  };

  const schedule = () => {
    const timer = setTimeout(async () => {
      await tick();
      schedule();
    }, 60_000);
    timer.unref?.();
    client._halloweenReactLbTimer = timer;
  };

  if (client.isReady?.()) {
    setTimeout(() => void tick(), 25_000).unref?.();
  } else {
    client.once("ready", () => setTimeout(() => void tick(), 25_000).unref?.());
  }
  schedule();
}

export = {
  recordHalloweenReactWin,
  postHalloweenReactLeaderboard,
  maybePostHalloweenReactLeaderboard,
  startHalloweenReactLeaderboardLoop,
  buildReactLeaderboardEmbed,
  getFinaleChannelId,
  DEFAULT_FINALE_CHANNEL_ID,
};
