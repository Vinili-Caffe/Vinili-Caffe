"use strict";
const __path = require("path") as typeof import("path");
const __eventCoreVinili = (rel: string) => __path.join(__path.resolve(__dirname, "../../../../../../src/Vinili"), rel);
const { EmbedBuilder, ChannelType, PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const { SiteDocument, SITE_DOCUMENT_TYPE, ActivityUserProfile } = require(__eventCoreVinili("Community/schemas/communitySchemas"));
const IDs = require(__eventCoreVinili("Config/ids"));
const { FEATURES, canAutoSpawnFeature, getRuntimeFlags, isHighStaffMember } = require("../../Utils/Eventi/starWarsRuntimeGate") as typeof import("../../Utils/Eventi/starWarsRuntimeGate");
const { EPOCHS, resolveFeatureStateNow } = require("../../Utils/Eventi/starWarsEventCalendar") as typeof import("../../Utils/Eventi/starWarsEventCalendar");
const { grantStarWarsReward, grantStarWarsMinigameWinReward, grantStarWarsGlobalMinigameWinBonus } = require("./starWarsRewardsService") as typeof import("./starWarsRewardsService");
const { formatCrateMention } = require("../../Utils/Eventi/starWarsCrateEmojis") as typeof import("../../Utils/Eventi/starWarsCrateEmojis");
const { getConfig } = require(__eventCoreVinili("Minigames/services/minigameConfig")) as typeof import("../../../../../../src/Vinili/Minigames/services/minigameConfig");
const { sendMinigameRolePing } = require(__eventCoreVinili("Minigames/services/minigameRolePing")) as typeof import("../../../../../../src/Vinili/Minigames/services/minigameRolePing");
const {
  reactMinigameWin,
  reactMinigameWrongEmoji,
} = require(__eventCoreVinili("Minigames/services/minigameDiscord")) as typeof import("../../../../../../src/Vinili/Minigames/services/minigameDiscord");

const DOC_TYPE = SITE_DOCUMENT_TYPE.STARWARS_EVENT_STATE;
const OWNER = "__starwars_mg__";
const CREDITI = "<a:VC_crediti:1567852561543733338>";
const loopState = new WeakSet();
const claimLocks = new Set();
const huntTimeouts = new Map();
const ordine66Timeouts = new Map();
const scovaTimeouts = new Map();
const reactTimeouts = new Map();
const deckTimeouts = new Map();
const conquistaTimeouts = new Map();
const convoglioTimeouts = new Map();
const attaccaTimeouts = new Map();
/** Stessa durata dei minigames classici SW (quiz / guess / findbot). */
const SW_EXTRA_DURATION_MS = 3 * 60 * 1000;
const CONVOGLIO_DURATION_MS = SW_EXTRA_DURATION_MS;
const ATTACCA_DURATION_MS = SW_EXTRA_DURATION_MS;
const HUNT_DURATION_MS = SW_EXTRA_DURATION_MS;
const ORDINE66_DURATION_MS = SW_EXTRA_DURATION_MS;
const JEDI_ROLE_NAME = "༄ Jedi"; /* legacy alias; resolve via starWarsCalendarRoleSync */
const cacciatoreTimeouts = new Map();
const CACCIATORE_DURATION_MS = SW_EXTRA_DURATION_MS;
const SCOVA_DURATION_MS = SW_EXTRA_DURATION_MS;
const REACT_DURATION_MS = SW_EXTRA_DURATION_MS;
const DECK_DURATION_MS = SW_EXTRA_DURATION_MS;
const SW_FACTION_PATH = "profile.events.starwars.factionId";

const F1_STEP_MS = 2400;
const F1_HOLD_MIN_MS = 1800;
const F1_HOLD_MAX_MS = 3200;
const F1_GO_HOLD_MS = 1800;
const PODRACE_CDN = "https://cdn.viniliecaffe.it/images/starwars";
const PODRACE_IMG_V = "20261110pr2";
const PODRACE_IMAGES = Object.freeze({
  lights1: `${PODRACE_CDN}/podrace-lights-1.jpg?v=${PODRACE_IMG_V}`,
  lights2: `${PODRACE_CDN}/podrace-lights-2.jpg?v=${PODRACE_IMG_V}`,
  lights3: `${PODRACE_CDN}/podrace-lights-3.jpg?v=${PODRACE_IMG_V}`,
  lightsGo: `${PODRACE_CDN}/podrace-lights-go.jpg?v=${PODRACE_IMG_V}`,
  start: `${PODRACE_CDN}/podrace-start.jpg?v=${PODRACE_IMG_V}`,
  win: `${PODRACE_CDN}/podrace-win.jpg?v=${PODRACE_IMG_V}`,
  lose: `${PODRACE_CDN}/podrace-lose.jpg?v=${PODRACE_IMG_V}`,
});

function sleep(ms?) {
  const n = Math.max(0, Number(ms) || 0);
  return new Promise((resolve?) => setTimeout(resolve, n));
}

/**
 * Claim solo via reazione (persistono al riavvio; i click ai bottoni Discord no).
 */
const CONQUISTA_CLAIM_REACT = "🛰️";
const CONVOGLIO_CONTINUE_REACT = "✅";
const CONVOGLIO_INTERCEPT_REACT = "💥";

function emojiNameMatches(reactionOrEmoji?, wanted?) {
  const want = String(wanted || "").replace(/\ufe0f/g, "");
  if (!want) return false;
  const name = String(reactionOrEmoji?.emoji?.name || reactionOrEmoji?.name || reactionOrEmoji || "").replace(/\ufe0f/g, "");
  if (name === want) return true;
  if (want === "🏁" && (name === "checkered_flag" || name === "🏁")) return true;
  if (want === "🐾" && (name === "paw_prints" || name === "🐾")) return true;
  if (want === "📜" && (name === "scroll" || name === "📜")) return true;
  if (want === "🛰️" && (name === "artificial_satellite" || name === "🛰️")) return true;
  if (want === "✅" && (name === "white_check_mark" || name === "✅")) return true;
  if (want === "💥" && (name === "boom" || name === "💥")) return true;
  return false;
}

async function seedClaimReaction(message?, emoji?) {
  if (!message?.react || !emoji) return;
  await message.react(emoji).catch(() => null);
}

function makeSwButtonShim({ client, guildId, user, message, customId }) {
  return {
    client,
    guildId: normalizeId(guildId) || normalizeId(message?.guildId),
    user,
    message,
    customId: String(customId || ""),
    deferred: true,
    replied: true,
    deferReply: async () => {},
    editReply: async () => {},
    reply: async () => {},
  };
}

/** Ping ruolo Minigames prima dell'annuncio (stesso anti-doppione del pool normale). */
async function pingMinigamesRole(client?, channel?) {
  if (!channel?.send) return null;
  try {
    const cfg = getConfig(client);
    return (await sendMinigameRolePing(channel, cfg)) || null;
  } catch (_) {
    return null;
  }
}

async function deleteSwChannelMessage(client?, channelId?, messageId?) {
  const chId = normalizeId(channelId);
  const msgId = normalizeId(messageId);
  if (!client || !chId || !msgId) return;
  const ch = client.channels.cache.get(chId) || (await client.channels.fetch(chId).catch(() => null));
  if (!ch?.messages?.fetch) return;
  const msg = await ch.messages.fetch(msgId).catch(() => null);
  if (msg?.deletable) await msg.delete().catch(() => null);
  else if (msg?.edit) await msg.edit({ components: [], content: null }).catch(() => null);
}

function msUntilExpiresAt(expiresAt?, fallbackMs = SW_EXTRA_DURATION_MS) {
  const end = expiresAt ? new Date(expiresAt).getTime() : NaN;
  if (!Number.isFinite(end)) return Math.max(1000, Number(fallbackMs) || SW_EXTRA_DURATION_MS);
  return Math.max(0, end - Date.now());
}

async function reactSwWin(message?) {
  await reactMinigameWin(message).catch(() => null);
}

async function reactSwWrong(message?) {
  await reactMinigameWrongEmoji(message).catch(() => null);
}

function randomF1HoldMs() {
  return F1_HOLD_MIN_MS + Math.floor(Math.random() * (F1_HOLD_MAX_MS - F1_HOLD_MIN_MS + 1));
}

function podracerLightsEmbed(stage?) {
  const s = String(stage || "1");
  const map = {
    "1": { image: PODRACE_IMAGES.lights1, color: 0xb91c1c },
    "2": { image: PODRACE_IMAGES.lights2, color: 0xb91c1c },
    "3": { image: PODRACE_IMAGES.lights3, color: 0xb91c1c },
    go: { image: PODRACE_IMAGES.lightsGo, color: 0x16a34a },
  };
  const meta = map[s] || map["1"];
  /* Solo colore + immagine: niente setTitle (undefined crasha shapeshift). */
  return new EmbedBuilder().setColor(meta.color).setImage(meta.image);
}

/** Countdown semaforo podracer: embed grafico 1→2→3 rossi, poi verde, poi delete. */
async function playF1StartLights(channel?) {
  if (!channel?.send) return;
  const msg = await channel
    .send({ embeds: [podracerLightsEmbed("1")] })
    .catch(() => null);
  if (!msg) return;

  await sleep(F1_STEP_MS);
  await msg.edit({ embeds: [podracerLightsEmbed("2")] }).catch(() => null);

  await sleep(F1_STEP_MS);
  await msg.edit({ embeds: [podracerLightsEmbed("3")] }).catch(() => null);

  await sleep(randomF1HoldMs());
  await msg.edit({ embeds: [podracerLightsEmbed("go")] }).catch(() => null);
  await sleep(F1_GO_HOLD_MS);
  await msg.delete().catch(() => null);
}

const REACT_GAMES = Object.freeze({
  podrace: {
    feature: FEATURES.MINIGAME_PODRACE,
    emoji: "🏁",
    title: "Gara di Podracer",
    crate: "alpha",
    exp: 100,
    startImage: PODRACE_IMAGES.start,
    winImage: PODRACE_IMAGES.win,
    loseImage: PODRACE_IMAGES.lose,
  },
});

/** Hide-and-seek stile “trova il bot”: hub + messaggio nascosto con reazione. */
const HUNT_CDN = "https://cdn.viniliecaffe.it/images/starwars";
const HUNT_IMG_V = "20261110h2";

const HUNT_GAMES = Object.freeze({
  ewok: {
    feature: FEATURES.MINIGAME_CACCIA_EWOK,
    title: "Caccia all'Ewok",
    crate: "alpha",
    exp: 100,
    emoji: "🐾",
    btn: "Ho trovato l'Ewok!",
    blurb: "Un Ewok si è nascosto in **un canale a caso** del server. Trova il messaggio e reagisci!",
    hiddenBlurb: "Shh… l'Ewok è qui. Chi reagisce per primo vince!",
    hubImage: `${HUNT_CDN}/sw-ewok-hunt-hub.jpg?v=${HUNT_IMG_V}`,
    hiddenImage: `${HUNT_CDN}/sw-ewok-hunt-hidden.jpg?v=${HUNT_IMG_V}`,
    winImage: `${HUNT_CDN}/sw-ewok-hunt-win.jpg?v=${HUNT_IMG_V}`,
    loseImage: `${HUNT_CDN}/sw-ewok-hunt-lose.jpg?v=${HUNT_IMG_V}`,
  },
  olocron: {
    feature: FEATURES.GAME_OLOCRON,
    title: "Caccia all'Olocron",
    crate: "alpha",
    exp: 100,
    emoji: "📜",
    btn: "Prendi l'Olocron",
    blurb: "Un Olocron è apparso in **un canale a caso** del server. Trovalo e reagisci per reclamarlo!",
    hiddenBlurb: "Hai trovato l'Olocron. Reagisci per reclamarlo!",
    hubImage: `${HUNT_CDN}/sw-olocron-hunt-hub.jpg?v=${HUNT_IMG_V}`,
    hiddenImage: `${HUNT_CDN}/sw-olocron-hunt-hidden.jpg?v=${HUNT_IMG_V}`,
    winImage: `${HUNT_CDN}/sw-olocron-hunt-win.jpg?v=${HUNT_IMG_V}`,
    loseImage: `${HUNT_CDN}/sw-olocron-hunt-lose.jpg?v=${HUNT_IMG_V}`,
  },
});

const BUTTON_GAMES = HUNT_GAMES;

function normalizeId(v?) {
  return String(v || "").trim();
}

function readTestGuildForceLive(client?) {
  try {
    const { resolveStarWarsEventConfig } = require("../../Utils/Eventi/starWarsEventConfig") as typeof import("../../Utils/Eventi/starWarsEventConfig");
    if (client) return Boolean(resolveStarWarsEventConfig(client)?.testGuildForceLive);
  } catch (_) {}
  try {
    const cfg = require(__eventCoreVinili("config.json"));
    const raw = cfg?.starWarsEvent && typeof cfg.starWarsEvent === "object" ? cfg.starWarsEvent : {};
    const v = process.env.STARWARS_TEST_FORCE_LIVE ?? raw.testGuildForceLive;
    if (v === true || v === false) return v;
    const s = String(v ?? "").trim().toLowerCase();
    return ["1", "true", "yes", "on"].includes(s);
  } catch (_) {
    return false;
  }
}

/** Guild evento Discord: test se staging force-live, altrimenti main. */
function mainGuildId(client?) {
  if (readTestGuildForceLive(client)) {
    const test = normalizeId(IDs.guilds?.test);
    if (test) return test;
  }
  return normalizeId(IDs.guilds?.main);
}

/** Guild wallet/smistamento in DB (sempre main ufficiale, come site API). */
function walletGuildId(client?) {
  try {
    const fromCfg = normalizeId(client?.config?.mainGuildId);
    if (fromCfg) return fromCfg;
  } catch (_) {}
  return normalizeId(IDs.guilds?.main);
}

const UNSORTED_MG_MSG = "<a:VC_Alert:1482706673176150077> Devi essere **smistato** nell'evento Star Wars per partecipare.";

/** Legge factionId dal DB (wallet main, fallback guild Discord). */
async function resolveStarWarsFactionId(client?, discordGuildId?, userId?) {
  const uid = normalizeId(userId);
  if (!uid) return "";
  const { getStarWarsWallet } = require("./starWarsEventWalletService") as typeof import("./starWarsEventWalletService");
  const ids = [
    ...new Set([walletGuildId(client), normalizeId(IDs.guilds?.main), normalizeId(discordGuildId)].filter(Boolean)),
  ];
  for (const gid of ids) {
    const wallet = await getStarWarsWallet(gid, uid);
    const fid = normalizeId(wallet?.factionId).toLowerCase();
    if (fid) return fid;
  }
  return "";
}

async function isStarWarsSortedParticipant(client?, discordGuildId?, userId?) {
  return Boolean(await resolveStarWarsFactionId(client, discordGuildId, userId));
}

function remapChannelForGuild(guildId?, channelId?) {
  const gid = normalizeId(guildId);
  const base = normalizeId(channelId);
  if (!gid || !base) return base;
  try {
    const { remapChannelIdForGuild, isTestMirrorGuild } = require(__eventCoreVinili("Config/testGuildMirrorRemap")) as typeof import("../../../../../../src/Vinili/Config/testGuildMirrorRemap");
    if (isTestMirrorGuild(gid)) return remapChannelIdForGuild(gid, base) || base;
  } catch (_) {}
  return base;
}

function chatChannelId(client?, guildId?) {
  const flags = getRuntimeFlags(client);
  const base = flags.chatChannelId || normalizeId(IDs.channels?.chat);
  const gid = normalizeId(guildId) || mainGuildId(client);
  return remapChannelForGuild(gid, base);
}

async function resolveSpawnTarget(client?, channelId?, preferredGuildId?) {
  const chId = normalizeId(channelId);
  if (chId && client) {
    const ch =
      client.channels.cache.get(chId) || (await client.channels.fetch(chId).catch(() => null));
    if (ch?.guildId) {
      return { guildId: normalizeId(ch.guildId), channelId: chId };
    }
  }
  const guildId = normalizeId(preferredGuildId) || mainGuildId(client);
  return { guildId, channelId: chId || chatChannelId(client, guildId) };
}

function dedupe(kind?) {
  return `sw_mg_active_${kind}`;
}

async function getActiveRound(kind?) {
  return SiteDocument.findOne({ docType: DOC_TYPE, ownerId: OWNER, dedupeKey: dedupe(kind), "payload.status": "active" })
    .lean()
    .catch(() => null);
}

async function setRound(kind?, payload?) {
  const guildId = normalizeId(payload?.guildId) || mainGuildId() || "0";
  await SiteDocument.findOneAndUpdate(
    { docType: DOC_TYPE, ownerId: OWNER, dedupeKey: dedupe(kind) },
    {
      $set: { payload, updatedAt: new Date() },
      $setOnInsert: { docType: DOC_TYPE, ownerId: OWNER, dedupeKey: dedupe(kind), guildId },
    },
    { upsert: true },
  ).catch(() => null);
}

async function claimRound(kind?, userId?) {
  const now = new Date();
  return SiteDocument.findOneAndUpdate(
    { docType: DOC_TYPE, ownerId: OWNER, dedupeKey: dedupe(kind), "payload.status": "active" },
    {
      $set: {
        "payload.status": "completed",
        "payload.winnerId": String(userId),
        "payload.completedAt": now.toISOString(),
        updatedAt: now,
      },
    },
    { new: true },
  ).catch(() => null);
}

async function spawnReactGame(client?, kind?, { channelId = null, force = false } = {}) {
  const meta = REACT_GAMES[kind];
  if (!meta) return { ok: false, error: "unknown" };
  if (!force && !canAutoSpawnFeature(client, meta.feature)) return { ok: false, error: "gated" };

  const target = await resolveSpawnTarget(client, channelId);
  const guildId = target.guildId;
  const chId = target.channelId;
  if (!guildId || !chId) return { ok: false, error: "no_channel" };
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  const channel = guild?.channels?.cache?.get(chId) || (await guild?.channels?.fetch?.(chId).catch(() => null));
  if (!channel?.isTextBased?.()) return { ok: false, error: "bad_channel" };

  const existing = await getActiveRound(kind);
  const existingStatus = String(existing?.payload?.status || "");
  if (existingStatus === "active" || existingStatus === "arming") {
    return { ok: false, error: "already_active" };
  }

  await setRound(kind, {
    status: "arming",
    kind,
    channelId: channel.id,
    guildId,
    emoji: meta.emoji,
    createdAt: new Date().toISOString(),
  });

  try {
    await pingMinigamesRole(client, channel);
    await playF1StartLights(channel);

  const embed = new EmbedBuilder()
      .setColor(0x22c55e)
      .setTitle(meta.title)
      .setDescription(
        `<a:VC_Events:1482706144953897223> **VIA!**\nPrimo a reagire con ${meta.emoji} vince ${formatCrateMention(meta.crate)} + **${meta.exp} exp**.`,
      );
    if (meta.startImage) embed.setImage(meta.startImage);
  const msg = await channel.send({ embeds: [embed] }).catch(() => null);
    if (!msg) {
      await setRound(kind, { status: "aborted", kind, guildId, channelId: channel.id });
      return { ok: false, error: "send_failed" };
    }
  await msg.react(meta.emoji).catch(() => null);

  await setRound(kind, {
    status: "active",
    kind,
    messageId: msg.id,
    channelId: channel.id,
    guildId,
    emoji: meta.emoji,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + REACT_DURATION_MS).toISOString(),
  });
  scheduleReactTimeout(client, kind, REACT_DURATION_MS);
  return { ok: true, messageId: msg.id, channelId: channel.id };
  } catch (err) {
    await setRound(kind, {
      status: "aborted",
      kind,
      guildId,
      channelId: channel.id,
      error: String(err?.message || err || "arming_failed"),
    }).catch(() => null);
    throw err;
  }
}

function clearHuntTimeout(kind?) {
  const key = String(kind || "");
  const t = huntTimeouts.get(key);
  if (t) clearTimeout(t);
  huntTimeouts.delete(key);
}

function clearReactTimeout(kind?) {
  const key = String(kind || "");
  const t = reactTimeouts.get(key);
  if (t) clearTimeout(t);
  reactTimeouts.delete(key);
}

async function finalizeReactTimeout(client?, kind?) {
  clearReactTimeout(kind);
  if (String(kind) === "podrace" && (await catchUpPodraceFromHistory(client))) return;
  const round = await getActiveRound(kind);
  if (!round?.payload || round.payload.status !== "active") return;
  const payload = round.payload;
  await setRound(kind, { ...payload, status: "expired", expiredAt: new Date().toISOString() });
  const meta = REACT_GAMES[kind];
  const channelId = normalizeId(payload.channelId);
  if (!client || !channelId || !meta) return;
  const channel = client.channels.cache.get(channelId) || (await client.channels.fetch(channelId).catch(() => null));
  if (!channel?.messages?.fetch || !payload.messageId) return;
  const msg = await channel.messages.fetch(normalizeId(payload.messageId)).catch(() => null);
  if (!msg?.edit) return;
  const loseEmbed = new EmbedBuilder()
    .setColor(0x6b7280)
    .setTitle(`${meta.title}`)
    .setDescription("<a:VC_pixeltime:1482535344103620771> Tempo scaduto: nessuno ha reagito in tempo.");
  if (meta.loseImage) loseEmbed.setImage(meta.loseImage);
  await msg.edit({ embeds: [loseEmbed] }).catch(() => null);
}

function scheduleReactTimeout(client?, kind?, durationMs = REACT_DURATION_MS) {
  clearReactTimeout(kind);
  const t = setTimeout(() => {
    void finalizeReactTimeout(client, kind);
  }, Math.max(1000, Number(durationMs) || REACT_DURATION_MS));
  t.unref?.();
  reactTimeouts.set(String(kind), t);
}

function clearScovaTimeout() {
  const t = scovaTimeouts.get("scova");
  if (t) clearTimeout(t);
  scovaTimeouts.delete("scova");
}

async function finalizeScovaTimeout(client?) {
  clearScovaTimeout();
  if (await catchUpScovaFromHistory(client)) return;
  const round = await getActiveRound("scova");
  if (!round?.payload || round.payload.status !== "active") return;
  const payload = round.payload;
  await setRound("scova", { ...payload, status: "expired", expiredAt: new Date().toISOString() });
  await deleteSwChannelMessage(client, payload.channelId, payload.rolePingMessageId);
  const channelId = normalizeId(payload.channelId);
  if (!client || !channelId) return;
  const channel = client.channels.cache.get(channelId) || (await client.channels.fetch(channelId).catch(() => null));
  if (!channel?.send) return;
  await channel
    .send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x6b7280)
          .setTitle("Scova il pianeta")
          .setDescription("<a:VC_pixeltime:1482535344103620771> Tempo scaduto: il settore resta sconosciuto.")
          .setImage(SCOVA_LOSE_IMAGE),
      ],
    })
    .catch(() => null);
}

function scheduleScovaTimeout(client?, durationMs = SCOVA_DURATION_MS) {
  clearScovaTimeout();
  const t = setTimeout(() => {
    void finalizeScovaTimeout(client);
  }, Math.max(1000, Number(durationMs) || SCOVA_DURATION_MS));
  t.unref?.();
  scovaTimeouts.set("scova", t);
}

function clearDeckTimeout(kind?) {
  const key = String(kind || "");
  const t = deckTimeouts.get(key);
  if (t) clearTimeout(t);
  deckTimeouts.delete(key);
}

async function finalizeDeckTimeout(client?, kind?) {
  clearDeckTimeout(kind);
  if (await catchUpDeckFromHistory(client, kind)) return;
  const round = await getActiveRound(kind);
  if (!round?.payload || round.payload.status !== "active") return;
  const payload = round.payload;
  await setRound(kind, { ...payload, status: "expired", expiredAt: new Date().toISOString() });
  const channelId = normalizeId(payload.channelId);
  if (!client || !channelId) return;
  const channel = client.channels.cache.get(channelId) || (await client.channels.fetch(channelId).catch(() => null));
  if (!channel?.messages?.fetch || !payload.messageId) return;
  const msg = await channel.messages.fetch(normalizeId(payload.messageId)).catch(() => null);
  if (!msg?.edit) return;
  const isPg = kind === "deck_pg";
  const label = payload.label || "oggetto";
  /* art generica “scappato / sparita” (stesso mood per tutti); fallback catalogo item */
  let loseImage = null;
  try {
    const { STAR_WARS_CLASSIC_EMBED_ART } = require("../../Utils/Minigames/starWarsMinigameHooks") as typeof import("../../Utils/Minigames/starWarsMinigameHooks");
    loseImage = isPg ? STAR_WARS_CLASSIC_EMBED_ART?.pgEscaped : STAR_WARS_CLASSIC_EMBED_ART?.reliquiaPerduta;
  } catch (_) {}
  if (!loseImage && payload.itemId) {
    try {
      if (isPg) {
        const { pgImageUrl: img } = require("../../Utils/Eventi/starWarsPgCatalog") as typeof import("../../Utils/Eventi/starWarsPgCatalog");
        loseImage = img(payload.itemId);
      } else {
        const { reliquieImageUrl: img } = require("../../Utils/Eventi/starWarsReliquieCatalog") as typeof import("../../Utils/Eventi/starWarsReliquieCatalog");
        loseImage = img(payload.itemId);
      }
    } catch (_) {}
  }
  const loseEmbed = new EmbedBuilder()
    .setColor(0x6b7280)
    .setTitle(isPg ? "PG sfuggito" : "Reliquia perduta")
    .setDescription(`<a:VC_pixeltime:1482535344103620771> Tempo scaduto: **${label}** non è stato reclamato.`);
  if (loseImage) loseEmbed.setImage(String(loseImage));
  await msg
    .edit({
      embeds: [loseEmbed],
    })
    .catch(() => null);
}

function scheduleDeckTimeout(client?, kind?, durationMs = DECK_DURATION_MS) {
  clearDeckTimeout(kind);
  const t = setTimeout(() => {
    void finalizeDeckTimeout(client, kind);
  }, Math.max(1000, Number(durationMs) || DECK_DURATION_MS));
  t.unref?.();
  deckTimeouts.set(String(kind), t);
}

function clearConquistaTimeout() {
  const t = conquistaTimeouts.get("conquista");
  if (t) clearTimeout(t);
  conquistaTimeouts.delete("conquista");
}

async function finalizeConquistaTimeout(client?) {
  clearConquistaTimeout();
  await catchUpConquistaFromReactions(client);
  const round = await getActiveRound("conquista");
  if (!round?.payload || round.payload.status !== "active") return;
  const payload = { ...round.payload };
  const systems = payload.systems && typeof payload.systems === "object" ? { ...payload.systems } : {};
  /* Cancella subito gli embed sistema ancora aperti negli altri canali. */
  for (const [key, system] of Object.entries(systems)) {
    if (normalizeId(system?.claimedBy)) continue;
    await deleteSwChannelMessage(client, system?.channelId, system?.messageId);
    systems[key] = { ...system, expired: true, messageId: null };
  }
  payload.systems = systems;
  await deleteSwChannelMessage(client, payload.hubChannelId, payload.rolePingMessageId);
  await deleteSwChannelMessage(client, payload.hubChannelId, payload.hubMessageId);
  const scores = countFactionConquistaClaims(systems);
  const winner =
    scores.repubblica === scores.separatisti
      ? null
      : scores.repubblica > scores.separatisti
        ? "repubblica"
        : "separatisti";
  let winGrant = null;
  if (winner) {
    winGrant = await grantConquistaWinTroops(client, { winnerFaction: winner });
  }
  await setRound("conquista", {
    ...payload,
    status: "expired",
    expiredAt: new Date().toISOString(),
    scores,
    winner,
    winGrant,
  });
  const hubId = normalizeId(payload.hubChannelId);
  if (!client || !hubId) return;
  const hub = client.channels.cache.get(hubId) || (await client.channels.fetch(hubId).catch(() => null));
  if (!hub?.send) return;
  const content =
    winner === "repubblica"
      ? "🔵 Tempo scaduto — la **Repubblica** domina i sistemi conquistati!"
      : winner === "separatisti"
        ? "🟣 Tempo scaduto — i **Separatisti** dominano i sistemi conquistati!"
        : "<a:VC_pixeltime:1482535344103620771> Tempo scaduto — nessun dominio sul settore.";
  const embed = winner
    ? buildConquistaWinAnnounceEmbed({ winner, scores, winGrant })
    : new EmbedBuilder()
        .setColor(0x6b7280)
        .setTitle("Conquista il sistema")
        .setDescription(
          `<a:VC_pixeltime:1482535344103620771> Tempo scaduto.\nSistemi: **Repubblica ${scores.repubblica}** — **Separatisti ${scores.separatisti}**`,
        )
        .setImage(CONQUISTA_LOSE_IMAGE);
  await hub.send({ content, embeds: [embed] }).catch(() => null);
}

function scheduleConquistaTimeout(client?, durationMs = CONQUISTA_DURATION_MS) {
  clearConquistaTimeout();
  const t = setTimeout(() => {
    void finalizeConquistaTimeout(client);
  }, Math.max(1000, Number(durationMs) || CONQUISTA_DURATION_MS));
  t.unref?.();
  conquistaTimeouts.set("conquista", t);
}

async function pickRandomHuntChannel(guild?, excludeChannelIds = []) {
  if (!guild) return null;
  await guild.channels.fetch().catch(() => null);
  const me = guild.members.me || guild.members.cache.get(guild.client?.user?.id);
  const excluded = new Set(
    (Array.isArray(excludeChannelIds) ? excludeChannelIds : [])
      .map((id?) => normalizeId(id))
      .filter(Boolean),
  );
  const list = [...guild.channels.cache.values()].filter((channel?) => {
    if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) return false;
    if (excluded.has(normalizeId(channel.id))) return false;
    if (!channel.viewable) return false;
    if (
      me &&
      !me.permissions?.has?.(PermissionsBitField.Flags.Administrator) &&
      !channel.permissionsFor?.(me)?.has?.([PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages])
    ) {
      return false;
    }
    const everyone = channel.permissionsFor?.(guild.roles.everyone);
    if (!everyone?.has?.(PermissionsBitField.Flags.ViewChannel)) return false;
    return true;
  });
  if (!list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}

async function deleteHuntHiddenMessage(client?, payload?) {
  const channelId = normalizeId(payload?.targetChannelId || payload?.channelId);
  const messageId = normalizeId(payload?.messageId);
  if (!client || !channelId || !messageId) return;
  const ch =
    client.channels.cache.get(channelId) || (await client.channels.fetch(channelId).catch(() => null));
  if (!ch?.messages?.fetch) return;
  const msg = await ch.messages.fetch(messageId).catch(() => null);
  if (msg?.deletable) await msg.delete().catch(() => null);
  else if (msg?.edit) await msg.edit({ components: [] }).catch(() => null);
}

async function finalizeHuntTimeout(client?, kind?) {
  clearHuntTimeout(kind);
  if (await catchUpHuntFromReactions(client, kind)) return;
  const round = await getActiveRound(kind);
  if (!round?.payload || round.payload.status !== "active") return;
  const payload = round.payload;
  await setRound(kind, { ...payload, status: "expired", expiredAt: new Date().toISOString() });
  await deleteHuntHiddenMessage(client, payload);
  await deleteSwChannelMessage(client, payload.hubChannelId || payload.channelId, payload.rolePingMessageId);
  await deleteSwChannelMessage(client, payload.hubChannelId || payload.channelId, payload.mainMessageId || payload.hubMessageId);
  const hubId = normalizeId(payload.hubChannelId);
  if (!hubId || !client) return;
  const hub = client.channels.cache.get(hubId) || (await client.channels.fetch(hubId).catch(() => null));
  const meta = HUNT_GAMES[kind];
  if (hub?.send && meta) {
    const loseEmbed = new EmbedBuilder()
      .setColor(0x6b7280)
      .setTitle(`${meta.emoji} ${meta.title}`)
      .setDescription("<a:VC_pixeltime:1482535344103620771> Tempo scaduto: nessuno ha trovato il messaggio nascosto.");
    if (meta.loseImage) loseEmbed.setImage(meta.loseImage);
    await hub.send({ embeds: [loseEmbed] }).catch(() => null);
  }
}

function scheduleHuntTimeout(client?, kind?, durationMs = HUNT_DURATION_MS) {
  clearHuntTimeout(kind);
  const t = setTimeout(() => {
    void finalizeHuntTimeout(client, kind);
  }, Math.max(1000, Number(durationMs) || HUNT_DURATION_MS));
  t.unref?.();
  huntTimeouts.set(String(kind), t);
}

/** Ewok / Olocron: stile “trova il bot” (hub + reazione sul messaggio nascosto). */
async function spawnHuntGame(client?, kind?, { channelId = null, force = false } = {}) {
  const meta = HUNT_GAMES[kind];
  if (!meta) return { ok: false, error: "unknown" };
  if (!force && !canAutoSpawnFeature(client, meta.feature)) return { ok: false, error: "gated" };

  const hubTarget = await resolveSpawnTarget(client, channelId);
  const guildId = hubTarget.guildId;
  const hubChannelId = hubTarget.channelId;
  if (!guildId || !hubChannelId) return { ok: false, error: "no_channel" };
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  const hub =
    guild?.channels?.cache?.get(hubChannelId) || (await guild?.channels?.fetch?.(hubChannelId).catch(() => null));
  if (!hub?.isTextBased?.()) return { ok: false, error: "bad_channel" };

  const existing = await getActiveRound(kind);
  const existingStatus = String(existing?.payload?.status || "");
  if (existingStatus === "active" || existingStatus === "arming") {
    return { ok: false, error: "already_active" };
  }

  const hidden = await pickRandomHuntChannel(guild, [hubChannelId]);
  if (!hidden?.isTextBased?.()) return { ok: false, error: "no_hide_channel" };

  await setRound(kind, {
    status: "arming",
    kind,
    guildId,
    hubChannelId,
    channelId: hubChannelId,
    createdAt: new Date().toISOString(),
  });

  const durationMs = HUNT_DURATION_MS;
  const customId = `sw_mg:${kind}:${Date.now().toString(36)}`;
  const pingMsg = await pingMinigamesRole(client, hub);
  const hubEmbed = new EmbedBuilder()
    .setColor(0x2f6fed)
    .setTitle(`${meta.emoji}  ${meta.title}`)
    .setDescription(
      `${meta.blurb}\n\nPremio: ${formatCrateMention(meta.crate)} + **${meta.exp} exp**.\nHai **${Math.round(durationMs / 60000)} minuti**.`,
    );
  if (meta.hubImage) hubEmbed.setImage(meta.hubImage);
  const hubMsg = await hub.send({ embeds: [hubEmbed] }).catch(() => null);

  const hiddenEmbed = new EmbedBuilder()
    .setColor(0xc9a227)
    .setTitle(`${meta.emoji}  ${meta.title}`)
    .setDescription(`${meta.hiddenBlurb}\n\nReagisci con ${meta.emoji} per reclamare!`);
  if (meta.hiddenImage) hiddenEmbed.setImage(meta.hiddenImage);
  const hiddenMsg = await hidden.send({ embeds: [hiddenEmbed] }).catch(() => null);
  if (!hiddenMsg) {
    await setRound(kind, { status: "aborted", kind, guildId, hubChannelId, error: "hide_send_failed" });
    return { ok: false, error: "send_failed" };
  }
  await seedClaimReaction(hiddenMsg, meta.emoji);

  await setRound(kind, {
    status: "active",
    kind,
    guildId,
    hubChannelId,
    channelId: hubChannelId,
    targetChannelId: hidden.id,
    messageId: hiddenMsg.id,
    mainMessageId: hubMsg?.id || null,
    hubMessageId: hubMsg?.id || null,
    rolePingMessageId: pingMsg?.id || null,
    customId,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + durationMs).toISOString(),
  });
  scheduleHuntTimeout(client, kind, durationMs);
  return { ok: true, messageId: hiddenMsg.id, channelId: hidden.id, hubChannelId };
}

async function handleStarWarsReaction(client?, reaction?, user?) {
  if (!user || user.bot) return false;
  try {
    if (reaction.partial) await reaction.fetch().catch(() => null);
  } catch (_) {}
  const messageId = normalizeId(reaction?.message?.id);
  if (!messageId) return false;

  for (const kind of Object.keys(REACT_GAMES)) {
    const round = await getActiveRound(kind);
    if (!round?.payload || round.payload.status !== "active") continue;
    if (normalizeId(round.payload.messageId) !== messageId) continue;
    const meta = REACT_GAMES[kind];
    if (!emojiNameMatches(reaction, meta.emoji)) continue;
    const guildId = normalizeId(round.payload.guildId) || normalizeId(reaction.message?.guildId) || mainGuildId(client);
    if (!(await isStarWarsSortedParticipant(client, guildId, user.id))) {
      await reaction.users?.remove?.(user.id).catch(() => null);
      return true;
    }
    const lock = `${kind}:${messageId}`;
    if (claimLocks.has(lock)) return true;
    claimLocks.add(lock);
    try {
      const claimed = await claimRound(kind, user.id);
      if (!claimed) return true;
      clearReactTimeout(kind);
      await grantStarWarsMinigameWinReward(client, {
        guildId: walletGuildId(client) || guildId,
        userId: user.id,
        reason: kind,
        grant: { crateId: meta.crate, crateQty: 1, exp: meta.exp },
      });
      const winEmbed = new EmbedBuilder()
        .setColor(0xeab308)
        .setTitle(`${meta.title} terminata!`)
        .setDescription(
          `🏁 <@${user.id}> vince e si porta a casa: ${formatCrateMention(meta.crate, 1, { open: true })} + **${meta.exp} exp** + 15 ${CREDITI}`,
        );
      if (meta.winImage) winEmbed.setImage(meta.winImage);
      await reaction.message
        ?.edit?.({ embeds: [winEmbed] })
        .catch(() => null);
      await reactSwWin(reaction.message).catch(() => null);
      return true;
    } finally {
      claimLocks.delete(lock);
    }
  }

  /* Claim via reazione: hunt / conquista / convoglio */
  if (await tryButtonGameClaimFromReaction(client, reaction, user)) return true;
  return false;
}

async function tryButtonGameClaimFromReaction(client?, reaction?, user?) {
  const messageId = normalizeId(reaction?.message?.id);
  const msg = reaction?.message;
  if (!messageId || !msg || !user) return false;

  for (const kind of Object.keys(HUNT_GAMES)) {
    const round = await getActiveRound(kind);
    if (!round?.payload || round.payload.status !== "active") continue;
    if (normalizeId(round.payload.messageId) !== messageId) continue;
    if (!emojiNameMatches(reaction, HUNT_GAMES[kind].emoji)) continue;
    return handleStarWarsButton(
      makeSwButtonShim({
        client,
        guildId: round.payload.guildId || msg.guildId,
        user,
        message: msg,
        customId: round.payload.customId,
      }),
    );
  }

  {
    const round = await getActiveRound("conquista");
    if (round?.payload?.status === "active" && round.payload.systems && typeof round.payload.systems === "object") {
      for (const [systemKey, system] of Object.entries(round.payload.systems)) {
        if (normalizeId(system?.claimedBy)) continue;
        if (normalizeId(system?.messageId) !== messageId) continue;
        if (!emojiNameMatches(reaction, CONQUISTA_CLAIM_REACT)) continue;
        return handleStarWarsButton(
          makeSwButtonShim({
            client,
            guildId: round.payload.guildId || msg.guildId,
            user,
            message: msg,
            customId: system?.customId || `sw_mg:conquista:claim:${systemKey}`,
          }),
        );
      }
    }
  }

  {
    const round = await getActiveRound("convoglio");
    if (round?.payload?.status === "active" && normalizeId(round.payload.messageId) === messageId) {
      let actionCustomId = null;
      if (emojiNameMatches(reaction, CONVOGLIO_CONTINUE_REACT)) actionCustomId = round.payload.customContinue;
      else if (emojiNameMatches(reaction, CONVOGLIO_INTERCEPT_REACT)) actionCustomId = round.payload.customIntercept;
      if (actionCustomId) {
        return handleStarWarsButton(
          makeSwButtonShim({
            client,
            guildId: round.payload.guildId || msg.guildId,
            user,
            message: msg,
            customId: actionCustomId,
          }),
        );
      }
    }
  }

  return false;
}

async function handleStarWarsButton(interaction?) {
  const id = String(interaction?.customId || "");
  if (!id.startsWith("sw_mg:")) return false;
  const parts = id.split(":");
  const kind = parts[1];
  /* convoglio / conquista buttons */
  if (kind === "convoglio") {
    return handleConvoglioButton(interaction, parts);
  }
  if (kind === "conquista") {
    return handleConquistaButton(interaction, parts);
  }
  const meta = HUNT_GAMES[kind] || null;
  if (!meta) return false;
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: 1 << 6 }).catch(() => null);
  }
  if (!(await isStarWarsSortedParticipant(interaction.client, interaction.guildId, interaction.user.id))) {
    await interaction.editReply({ content: UNSORTED_MG_MSG }).catch(() => null);
    return true;
  }
  const round = await getActiveRound(kind);
  if (!round?.payload || round.payload.status !== "active") {
    await interaction.editReply({ content: "<a:VC_Alert:1482706673176150077>Round già chiuso." }).catch(() => null);
    return true;
  }
  if (normalizeId(round.payload.customId) && normalizeId(round.payload.customId) !== id) {
    await interaction.editReply({ content: "<a:VC_Alert:1482706673176150077> Questo messaggio non è più valido." }).catch(() => null);
    return true;
  }
  const claimed = await claimRound(kind, interaction.user.id);
  if (!claimed) {
    await interaction.editReply({ content: "<a:VC_Alert:1482706673176150077> Qualcun altro è stato più veloce." }).catch(() => null);
    return true;
  }
  clearHuntTimeout(kind);
  /* come find-bot: l’embed nascosto sparisce subito al click */
  await interaction.message?.delete?.().catch(() => null);
  await deleteHuntHiddenMessage(interaction.client, round.payload);
  await grantStarWarsMinigameWinReward(interaction.client, {
    guildId: walletGuildId(interaction.client) || normalizeId(interaction.guildId) || normalizeId(round.payload.guildId),
    userId: interaction.user.id,
    reason: kind,
    grant: { crateId: meta.crate, crateQty: 1, exp: meta.exp },
  });
  await interaction
    .editReply({
      content: `<a:VC_Events:1482706144953897223> Hai vinto! +${formatCrateMention(meta.crate, 1, { open: true })} + ${meta.exp} exp + 15 ${CREDITI}`,
    })
    .catch(() => null);
  const hubId = normalizeId(round.payload.hubChannelId || round.payload.channelId);
  if (hubId) {
    const hub =
      interaction.client.channels.cache.get(hubId) ||
      (await interaction.client.channels.fetch(hubId).catch(() => null));
    if (hub?.send) {
      const winEmbed = new EmbedBuilder()
        .setColor(0xeab308)
        .setTitle(`${meta.emoji} ${meta.title}`)
        .setDescription(
          `<@${interaction.user.id}> ha vinto! +${formatCrateMention(meta.crate, 1, { open: true })} + **${meta.exp} exp** + 15 ${CREDITI}`,
        );
      if (meta.winImage) winEmbed.setImage(meta.winImage);
      await hub.send({ embeds: [winEmbed] }).catch(() => null);
    }
  }
  return true;
}

/* ——— Ordine 66 ——— */
function isVisibleOnlinePresence(presence?) {
  const s = String(presence?.status || "offline").toLowerCase();
  return s === "online" || s === "idle" || s === "dnd";
}

function resolveJediRole(guild?) {
  try {
    const { resolveHuntTargetRole } = require("./starWarsCalendarRoleSync") as typeof import("./starWarsCalendarRoleSync");
    const role = resolveHuntTargetRole(guild);
    if (role) return role;
  } catch (_) {}
  if (!guild?.roles?.cache) return null;
  const wanted = JEDI_ROLE_NAME.normalize("NFC").trim().toLowerCase();
  return (
    [...guild.roles.cache.values()].find((r?) => {
      const bare = String(r?.name || "")
        .normalize("NFC")
        .replace(/^༄\s*/u, "")
        .trim()
        .toLowerCase();
      const full = String(r?.name || "").normalize("NFC").trim().toLowerCase();
      return full === wanted || bare === "jedi" || bare === "cacciatore di taglie";
    }) || null
  );
}

async function listStarWarsSortedUserIds(guildIds?) {
  const ids = [...new Set((Array.isArray(guildIds) ? guildIds : [guildIds]).map((g?) => normalizeId(g)).filter(Boolean))];
  if (!ids.length) return new Set();
  const rows = await ActivityUserProfile.find({
    guildId: ids.length === 1 ? ids[0] : { $in: ids },
    [SW_FACTION_PATH]: { $exists: true, $nin: [null, ""] },
  })
    .select({ userId: 1, guildId: 1, [SW_FACTION_PATH]: 1 })
    .lean()
    .catch(() => []);
  return new Set((Array.isArray(rows) ? rows : []).map((r?) => normalizeId(r?.userId)).filter(Boolean));
}

async function clearJediRoleFromMember(guild?, role?, userId?, reason = "Ordine 66") {
  const uid = normalizeId(userId);
  if (!guild || !role || !uid) return;
  const member = guild.members.cache.get(uid) || (await guild.members.fetch(uid).catch(() => null));
  if (!member?.roles?.cache?.has?.(role.id)) return;
  await member.roles.remove(role, reason).catch(() => null);
}

async function clearAllJediRoleHolders(guild?, role?, reason = "Ordine 66 reset") {
  if (!guild || !role) return;
  await guild.members.fetch().catch(() => null);
  const holders = [...(role.members?.values?.() || [])];
  for (const member of holders) {
    if (!member?.roles?.cache?.has?.(role.id)) continue;
    await member.roles.remove(role, reason).catch(() => null);
  }
}

const ORDINE66_CDN = "https://cdn.viniliecaffe.it/images/starwars";
const ORDINE66_IMG_V = "20261110o66b";
const ORDINE66_HUB_IMAGE = `${ORDINE66_CDN}/ordine66-hub.jpg?v=${ORDINE66_IMG_V}`;
const ORDINE66_WIN_IMAGE = `${ORDINE66_CDN}/ordine66-win.jpg?v=${ORDINE66_IMG_V}`;
const ORDINE66_LOSE_IMAGE = `${ORDINE66_CDN}/ordine66-lose.jpg?v=${ORDINE66_IMG_V}`;

function clearOrdine66Timeout() {
  const t = ordine66Timeouts.get("ordine66");
  if (t) clearTimeout(t);
  ordine66Timeouts.delete("ordine66");
}

async function finalizeOrdine66Timeout(client?) {
  clearOrdine66Timeout();
  if (await catchUpOrdine66FromHistory(client)) return;
  const round = await getActiveRound("ordine66");
  if (!round?.payload || round.payload.status !== "active") return;
  const payload = round.payload;
  await setRound("ordine66", { ...payload, status: "expired", expiredAt: new Date().toISOString() });
  const guildId = normalizeId(payload.guildId);
  const guild = client?.guilds?.cache?.get(guildId) || (await client?.guilds?.fetch?.(guildId).catch(() => null));
  const role = resolveJediRole(guild);
  await clearJediRoleFromMember(guild, role, payload.targetId, "Ordine 66 scaduto");
  /* togli solo il ping ruolo; l’embed hub resta in chat */
  await deleteSwChannelMessage(client, payload.channelId, payload.rolePingMessageId);
  const chId = normalizeId(payload.channelId);
  if (!chId || !client) return;
  const channel = client.channels.cache.get(chId) || (await client.channels.fetch(chId).catch(() => null));
  if (channel?.send) {
    await channel
      .send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x6b7280)
            .setTitle("Ordine 66")
            .setDescription("<a:VC_pixeltime:1482535344103620771> Tempo scaduto: il Jedi è fuggito.")
            .setImage(ORDINE66_LOSE_IMAGE),
        ],
      })
      .catch(() => null);
  }
}

function scheduleOrdine66Timeout(client?, durationMs = ORDINE66_DURATION_MS) {
  clearOrdine66Timeout();
  const t = setTimeout(() => {
    void finalizeOrdine66Timeout(client);
  }, Math.max(1000, Number(durationMs) || ORDINE66_DURATION_MS));
  if (typeof t.unref === "function") t.unref();
  ordine66Timeouts.set("ordine66", t);
}

async function pickOrdine66JediTarget(client?, guild?) {
  if (!guild) return null;
  await guild.members.fetch({ withPresences: true }).catch(() => null);
  /* Smistamento = solo DB (factionId), mai ruoli Discord fazione. */
  const profileGuild = walletGuildId(client);
  const discordGuild = normalizeId(guild.id);
  const sortedIds = await listStarWarsSortedUserIds(
    [profileGuild, discordGuild, normalizeId(IDs.guilds?.main), normalizeId(IDs.guilds?.test)].filter(Boolean),
  );
  if (!sortedIds.size) return null;
  const candidates = [...guild.members.cache.values()].filter(
    (m?) => !m?.user?.bot && sortedIds.has(normalizeId(m.id)) && isVisibleOnlinePresence(m.presence),
  );
  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

async function startOrdine66(client?, { channelId = null, force = false } = {}) {
  if (!force && !canAutoSpawnFeature(client, FEATURES.MINIGAME_ORDINE66)) return { ok: false, error: "gated" };
  const targetCtx = await resolveSpawnTarget(client, channelId);
  const guildId = targetCtx.guildId;
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return { ok: false, error: "no_guild" };

  const existing = await getActiveRound("ordine66");
  if (String(existing?.payload?.status || "") === "active") {
    return { ok: false, error: "already_active" };
  }

  try {
    const { syncStarWarsFactionRolesOnTestFromDb } = require("./starWarsFactionTestRoles") as typeof import("./starWarsFactionTestRoles");
    await syncStarWarsFactionRolesOnTestFromDb(client);
  } catch (_) {}
  try {
    const { syncStarWarsCalendarRoleNames } = require("./starWarsCalendarRoleSync") as typeof import("./starWarsCalendarRoleSync");
    await syncStarWarsCalendarRoleNames(client);
  } catch (_) {}

  await guild.roles.fetch().catch(() => null);
  const jediRole = resolveJediRole(guild);
  if (!jediRole) return { ok: false, error: "no_jedi_role" };

  const target = await pickOrdine66JediTarget(client, guild);
  if (!target) return { ok: false, error: "no_candidates" };

  const chId = targetCtx.channelId;
  const channel = guild.channels.cache.get(chId) || (await guild.channels.fetch(chId).catch(() => null));
  if (!channel?.isTextBased?.()) return { ok: false, error: "bad_channel" };

  await clearAllJediRoleHolders(guild, jediRole, "Ordine 66 nuovo round");
  const roleOk = await target.roles.add(jediRole, "Ordine 66 — Jedi nascosto").then(() => true).catch(() => false);
  if (!roleOk) return { ok: false, error: "role_assign_failed" };

  const expiresAt = new Date(Date.now() + ORDINE66_DURATION_MS).toISOString();
  scheduleOrdine66Timeout(client, ORDINE66_DURATION_MS);
  const pingMsg = await pingMinigamesRole(client, channel);
  const hubMsg = await channel
    .send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x8b1a1a)
          .setTitle("Ordine 66")
          .setDescription(
            `Un Jedi è tra gli utenti **smistati online**… **Pingalo** in chat per eseguire l'Ordine 66.\nVince chi lo menziona per primo.\nHai **${Math.round(ORDINE66_DURATION_MS / 60000)} minuti**.`,
          )
          .setImage(ORDINE66_HUB_IMAGE),
      ],
    })
    .catch(() => null);
  await setRound("ordine66", {
    status: "active",
    kind: "ordine66",
    targetId: target.id,
    roleId: jediRole.id,
    channelId: channel.id,
    guildId,
    hubMessageId: hubMsg?.id || null,
    rolePingMessageId: pingMsg?.id || null,
    createdAt: new Date().toISOString(),
    expiresAt,
  });
  return { ok: true, targetId: target.id, roleId: jediRole.id };
}

/** Vince chi pinga/menziona il Jedi (niente comando). */
async function tryOrdine66Mention(message?, client?) {
  const round = await getActiveRound("ordine66");
  if (!round?.payload || round.payload.status !== "active") return false;
  const guildId = normalizeId(round.payload.guildId);
  if (guildId && normalizeId(message.guildId) !== guildId) return false;
  const targetId = normalizeId(round.payload.targetId);
  if (!targetId) return false;
  if (normalizeId(message.author?.id) === targetId) return false;

  const mentionColl = message.mentions?.users;
  const mentioned = [...(mentionColl?.values?.() || mentionColl?.cache?.values?.() || [])].filter(
    (u?) => u && !u.bot && normalizeId(u.id) !== normalizeId(message.author?.id),
  );
  if (!mentioned.length) return false;

  if (!(await isStarWarsSortedParticipant(client || message.client, message.guildId, message.author.id))) {
    return false;
  }

  const hit = mentioned.some((u?) => normalizeId(u.id) === targetId);
  if (!hit) {
    await reactSwWrong(message);
    await message.reply("Non è quello lo Jedi.").catch(() => null);
    return true;
  }

  const claimed = await claimRound("ordine66", message.author.id);
  if (!claimed) {
    await reactSwWrong(message);
    await message.reply("Qualcun altro ha già eseguito l'Ordine 66.").catch(() => null);
    return true;
  }
  clearOrdine66Timeout();
  const guild =
    message.guild ||
    client?.guilds?.cache?.get(guildId) ||
    (await client?.guilds?.fetch?.(guildId).catch(() => null));
  const role =
    (normalizeId(round.payload.roleId) && guild?.roles?.cache?.get(normalizeId(round.payload.roleId))) ||
    resolveJediRole(guild);
  await clearJediRoleFromMember(guild, role, targetId, "Ordine 66 eseguito");
  await grantStarWarsMinigameWinReward(client, {
    guildId: walletGuildId(client) || message.guildId,
    userId: message.author.id,
    reason: "ordine66",
    grant: { crateId: "alpha", crateQty: 1, exp: 100, troops: { tier1: 5 } },
  });
  await reactSwWin(message);
  await message
    .reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x8b1a1a)
          .setTitle("<a:VC_Events:1482706144953897223> Ordine eseguito!")
          .setDescription(
            `<@${message.author.id}> ottiene ${formatCrateMention("alpha", 1, { open: true })} + 100 exp + 5 truppe (${CREDITI} +5 · +10 banca).`,
          )
          .setImage(ORDINE66_WIN_IMAGE),
      ],
    })
    .catch(() => null);
  return true;
}

/* ——— Cacciatore di taglie (come Ordine 66, ruolo rinominato) ——— */
const CACCIATORE_CDN = "https://cdn.viniliecaffe.it/images/starwars";
const CACCIATORE_IMG_V = "20261110ct2";
const CACCIATORE_HUB_IMAGE = `${CACCIATORE_CDN}/cacciatore-taglie-hub.jpg?v=${CACCIATORE_IMG_V}`;
const CACCIATORE_WIN_IMAGE = `${CACCIATORE_CDN}/cacciatore-taglie-win.jpg?v=${CACCIATORE_IMG_V}`;
const CACCIATORE_LOSE_IMAGE = `${CACCIATORE_CDN}/cacciatore-taglie-lose.jpg?v=${CACCIATORE_IMG_V}`;
/** 2 unità a potenza 1 (non tier): Cloni/Droidi, Ribelli/Stormtrooper, Repubblicano/Assaltatore. */
const CACCIATORE_TROOP_POWER = 1;
const CACCIATORE_TROOP_QTY = 2;

/** Stesso stile del win embed (`**2 Cloni**`), con entrambe le fazioni dell'epoca. */
function cacciatorePower1PrizeBlurb(now = new Date()) {
  try {
    const { pickUnitForPower, unitLabelForFaction, EPOCH_FACTIONS } = require("../../Utils/Eventi/starWarsEconomyCatalog") as typeof import("../../Utils/Eventi/starWarsEconomyCatalog");
    const epoch = resolveFeatureStateNow(now).epoch || EPOCHS.CLONE_WARS;
    const unit = pickUnitForPower(epoch, null, CACCIATORE_TROOP_POWER);
    if (!unit) throw new Error("no_unit");
    const factions = EPOCH_FACTIONS[epoch] || Object.keys(unit.labels || {});
    const parts = [];
    const seen = new Set();
    for (const fid of factions) {
      const label = unitLabelForFaction(unit, fid);
      if (!label || seen.has(label)) continue;
      seen.add(label);
      parts.push(`**${CACCIATORE_TROOP_QTY} ${label}**`);
    }
    if (parts.length) return parts.join(" / ");
  } catch (_) {}
  return `**${CACCIATORE_TROOP_QTY} truppe potenza ${CACCIATORE_TROOP_POWER}**`;
}

async function resolveCacciatoreTroopGrant(client?, guildId?, userId?) {
  const { getStarWarsWallet } = require("./starWarsEventWalletService") as typeof import("./starWarsEventWalletService");
  const {
    pickUnitForPower,
    unitLabelForFaction,
  } = require("../../Utils/Eventi/starWarsEconomyCatalog") as typeof import("../../Utils/Eventi/starWarsEconomyCatalog");
  const g = normalizeId(guildId) || walletGuildId(client) || mainGuildId(client);
  const u = normalizeId(userId);
  const wallet = await getStarWarsWallet(g, u);
  const factionId = normalizeId(wallet?.factionId).toLowerCase() || null;
  const epoch = wallet?.epoch || resolveFeatureStateNow().epoch || EPOCHS.CLONE_WARS;
  const unit = pickUnitForPower(epoch, factionId, CACCIATORE_TROOP_POWER);
  if (!unit?.id) {
    return {
      troops: null,
      label: `truppe potenza ${CACCIATORE_TROOP_POWER}`,
      qty: CACCIATORE_TROOP_QTY,
    };
  }
  return {
    troops: { [unit.id]: CACCIATORE_TROOP_QTY },
    label: unitLabelForFaction(unit, factionId),
    qty: CACCIATORE_TROOP_QTY,
  };
}

function clearCacciatoreTimeout() {
  const t = cacciatoreTimeouts.get("cacciatore");
  if (t) clearTimeout(t);
  cacciatoreTimeouts.delete("cacciatore");
}

async function finalizeCacciatoreTimeout(client?) {
  clearCacciatoreTimeout();
  if (await catchUpCacciatoreFromHistory(client)) return;
  const round = await getActiveRound("cacciatore");
  if (!round?.payload || round.payload.status !== "active") return;
  const payload = round.payload;
  await setRound("cacciatore", { ...payload, status: "expired", expiredAt: new Date().toISOString() });
  const guildId = normalizeId(payload.guildId);
  const guild = client?.guilds?.cache?.get(guildId) || (await client?.guilds?.fetch?.(guildId).catch(() => null));
  const role = resolveJediRole(guild);
  await clearJediRoleFromMember(guild, role, payload.targetId, "Cacciatore di taglie scaduto");
  /* togli solo il ping ruolo; l’embed hub resta in chat */
  await deleteSwChannelMessage(client, payload.channelId, payload.rolePingMessageId);
  const chId = normalizeId(payload.channelId);
  if (!chId || !client) return;
  const channel = client.channels.cache.get(chId) || (await client.channels.fetch(chId).catch(() => null));
  if (channel?.send) {
    await channel
      .send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x6b7280)
            .setTitle("Cacciatore di taglie")
            .setDescription("<a:VC_pixeltime:1482535344103620771> Tempo scaduto: il bersaglio è fuggito.")
            .setImage(CACCIATORE_LOSE_IMAGE),
        ],
      })
      .catch(() => null);
  }
}

function scheduleCacciatoreTimeout(client?, durationMs = CACCIATORE_DURATION_MS) {
  clearCacciatoreTimeout();
  const t = setTimeout(() => {
    void finalizeCacciatoreTimeout(client);
  }, Math.max(1000, Number(durationMs) || CACCIATORE_DURATION_MS));
  if (typeof t.unref === "function") t.unref();
  cacciatoreTimeouts.set("cacciatore", t);
}

async function startCacciatoreTaglie(client?, { channelId = null, force = false } = {}) {
  if (!force && !canAutoSpawnFeature(client, FEATURES.MINIGAME_CACCIATORE)) return { ok: false, error: "gated" };
  const targetCtx = await resolveSpawnTarget(client, channelId);
  const guildId = targetCtx.guildId;
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return { ok: false, error: "no_guild" };

  const existing = await getActiveRound("cacciatore");
  if (String(existing?.payload?.status || "") === "active") {
    return { ok: false, error: "already_active" };
  }

  try {
    const { syncStarWarsCalendarRoleNames } = require("./starWarsCalendarRoleSync") as typeof import("./starWarsCalendarRoleSync");
    await syncStarWarsCalendarRoleNames(client);
  } catch (_) {}

  await guild.roles.fetch().catch(() => null);
  const huntRole = resolveJediRole(guild);
  if (!huntRole) return { ok: false, error: "no_hunt_role" };

  const target = await pickOrdine66JediTarget(client, guild);
  if (!target) return { ok: false, error: "no_candidates" };

  const chId = targetCtx.channelId;
  const channel = guild.channels.cache.get(chId) || (await guild.channels.fetch(chId).catch(() => null));
  if (!channel?.isTextBased?.()) return { ok: false, error: "bad_channel" };

  await clearAllJediRoleHolders(guild, huntRole, "Cacciatore di taglie nuovo round");
  const roleOk = await target.roles.add(huntRole, "Cacciatore di taglie").then(() => true).catch(() => false);
  if (!roleOk) return { ok: false, error: "role_assign_failed" };

  const expiresAt = new Date(Date.now() + CACCIATORE_DURATION_MS).toISOString();
  scheduleCacciatoreTimeout(client, CACCIATORE_DURATION_MS);
  const pingMsg = await pingMinigamesRole(client, channel);
  const hubMsg = await channel
    .send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xb45309)
          .setTitle("Cacciatore di taglie")
          .setDescription(
            `Un bersaglio è tra gli utenti **smistati online**… taggalo in chat per riscuotere la taglia.\nAvete **${Math.round(CACCIATORE_DURATION_MS / 60000)} minuti** per trovare l'obiettivo. Vince chi lo menziona per primo.\n\n<a:VC_Events:1482706144953897223> Premio: ${formatCrateMention("alpha", 1, { open: true })} + 100 exp + ${cacciatorePower1PrizeBlurb()}.`,
          )
          .setImage(CACCIATORE_HUB_IMAGE),
      ],
    })
    .catch(() => null);
  await setRound("cacciatore", {
    status: "active",
    kind: "cacciatore",
    targetId: target.id,
    roleId: huntRole.id,
    channelId: channel.id,
    guildId,
    hubMessageId: hubMsg?.id || null,
    rolePingMessageId: pingMsg?.id || null,
    createdAt: new Date().toISOString(),
    expiresAt,
  });
  return { ok: true, targetId: target.id, roleId: huntRole.id };
}

async function tryCacciatoreMention(message?, client?) {
  const round = await getActiveRound("cacciatore");
  if (!round?.payload || round.payload.status !== "active") return false;
  const guildId = normalizeId(round.payload.guildId);
  if (guildId && normalizeId(message.guildId) !== guildId) return false;
  const targetId = normalizeId(round.payload.targetId);
  if (!targetId) return false;

  const authorId = normalizeId(message.author?.id);
  const selfIsTarget = Boolean(authorId && authorId === targetId);
  const mentionColl = message.mentions?.users;
  const mentioned = [...(mentionColl?.values?.() || mentionColl?.cache?.values?.() || [])].filter((u?) => {
    if (!u || u.bot) return false;
    const id = normalizeId(u.id);
    /* Auto-tag del bersaglio: vale come taglia riscossa. */
    if (id === authorId) return selfIsTarget;
    return true;
  });
  if (!mentioned.length) return false;

  if (!(await isStarWarsSortedParticipant(client || message.client, message.guildId, message.author.id))) {
    return false;
  }

  const hit = mentioned.some((u?) => normalizeId(u.id) === targetId);
  if (!hit) {
    await reactSwWrong(message);
    await message.reply("<a:VC_Alert:1482706673176150077> Non è quello il bersaglio.").catch(() => null);
    return true;
  }

  const claimed = await claimRound("cacciatore", message.author.id);
  if (!claimed) {
    await reactSwWrong(message);
    await message.reply("<a:VC_Alert:1482706673176150077> Qualcun altro ha già riscosso la taglia.").catch(() => null);
    return true;
  }
  clearCacciatoreTimeout();
  const guild =
    message.guild ||
    client?.guilds?.cache?.get(guildId) ||
    (await client?.guilds?.fetch?.(guildId).catch(() => null));
  const role =
    (normalizeId(round.payload.roleId) && guild?.roles?.cache?.get(normalizeId(round.payload.roleId))) ||
    resolveJediRole(guild);
  await clearJediRoleFromMember(guild, role, targetId, "Cacciatore di taglie eseguito");
  const troopGrant = await resolveCacciatoreTroopGrant(client, message.guildId, message.author.id);
  const troopLine = `**${troopGrant.qty} ${troopGrant.label}**`;
  await grantStarWarsMinigameWinReward(client, {
    guildId: walletGuildId(client) || message.guildId,
    userId: message.author.id,
    reason: "cacciatore",
    grant: {
      crateId: "alpha",
      crateQty: 1,
      exp: 100,
      ...(troopGrant.troops ? { troops: troopGrant.troops } : {}),
    },
  });
  await reactSwWin(message);
  await message
    .reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xb45309)
          .setTitle("<a:VC_Events:1482706144953897223> Obiettivo trovato!")
          .setDescription(
            `<@${message.author.id}> ha riscosso la taglia guadagnando: ${formatCrateMention("alpha", 1, { open: true })} + 100 exp + ${troopLine}.`,
          )
          .setImage(CACCIATORE_WIN_IMAGE),
      ],
    })
    .catch(() => null);
  return true;
}

/* ——— Scova il pianeta ——— */
const SCOVA_CDN = "https://cdn.viniliecaffe.it/images/starwars";
const SCOVA_IMG_V = "20261110sc2";
const SCOVA_MAP_IMAGE = `${SCOVA_CDN}/galaxy-map-scova.jpg?v=${SCOVA_IMG_V}`;
const SCOVA_WIN_IMAGE = `${SCOVA_CDN}/scova-win.jpg?v=${SCOVA_IMG_V}`;
const SCOVA_LOSE_IMAGE = `${SCOVA_CDN}/scova-lose.jpg?v=${SCOVA_IMG_V}`;

const SCOVA_PLANETS = Object.freeze([
  { id: "dantooine", name: "Dantooine", aliases: ["dantooine"], coords: ["L4", "L04"] },
  { id: "iridonia", name: "Iridonia", aliases: ["iridonia"], coords: ["J7", "J07"] },
  { id: "felucia", name: "Felucia", aliases: ["felucia", "galush"], coords: ["R6", "R06"] },
  { id: "moncala", name: "Mon Cala", aliases: ["mon cala", "moncala", "dac"], coords: ["U6", "U06"] },
  { id: "mandalore", name: "Mandalore", aliases: ["mandalore"], coords: ["O7", "O07"] },
  { id: "exegol", name: "Exegol", aliases: ["exegol", "ixigul"], coords: ["E8", "E08"] },
  { id: "jedha", name: "Jedha", aliases: ["jedha"], coords: ["H10"] },
  {
    id: "coruscant",
    name: "Coruscant",
    aliases: ["coruscant", "notron"],
    coords: ["K9", "K09", "L9", "L09", "K10", "L10"],
  },
  { id: "alderaan", name: "Alderaan", aliases: ["alderaan"], coords: ["M10"] },
  { id: "onderon", name: "Onderon", aliases: ["onderon"], coords: ["O9", "O09"] },
  { id: "kessel", name: "Kessel", aliases: ["kessel"], coords: ["T10"] },
  { id: "jakku", name: "Jakku", aliases: ["jakku"], coords: ["I13"] },
  { id: "vandor", name: "Vandor", aliases: ["vandor"], coords: ["P14"] },
  { id: "kamino", name: "Kamino", aliases: ["kamino"], coords: ["S15"] },
  { id: "endor", name: "Endor", aliases: ["endor"], coords: ["H16"] },
  { id: "naboo", name: "Naboo", aliases: ["naboo"], coords: ["O17"] },
  { id: "tatooine", name: "Tatooine", aliases: ["tatooine"], coords: ["R16"] },
  {
    id: "ortoplutonia",
    name: "Orto Plutonia",
    aliases: ["orto plutonia", "ortoplutonia", "pantora"],
    coords: ["P19"],
  },
]);

function scovaPlanetImageUrl(planetId?) {
  const id = normalizeId(planetId).toLowerCase();
  if (!id) return "";
  return `${SCOVA_CDN}/planets/planet-${id}.jpg?v=${SCOVA_IMG_V}`;
}

function normalizeScovaGuess(raw?) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findScovaPlanetByGuess(guess?) {
  const g = normalizeScovaGuess(guess);
  if (!g) return null;
  return (
    SCOVA_PLANETS.find((p?) => {
      const names = [p.name, ...(p.aliases || [])].map((x?) => normalizeScovaGuess(x));
      return names.includes(g);
    }) || null
  );
}

function pickRandomScovaPlanet() {
  return SCOVA_PLANETS[Math.floor(Math.random() * SCOVA_PLANETS.length)];
}

function pickRandomScovaCoord(planet?) {
  const list = Array.isArray(planet?.coords) ? planet.coords : [];
  if (!list.length) return "";
  return String(list[Math.floor(Math.random() * list.length)]);
}

/** L04 → L-04, H10 → H-10 */
function formatScovaGridCoord(raw?) {
  const s = String(raw || "").trim().toUpperCase();
  const m = /^([A-Z]+)\s*-?\s*(\d+)$/.exec(s);
  if (!m) return s;
  return `${m[1]}-${m[2]}`;
}

function randomScovaNumericCoords() {
  const a = (Math.random() * 9999999).toFixed(3);
  const b = (Math.random() * 9999999).toFixed(3);
  return `${a} - ${b}`;
}

async function startScovaPianeta(client?, { channelId = null, force = false } = {}) {
  if (!force && !canAutoSpawnFeature(client, FEATURES.MINIGAME_SCOVA)) return { ok: false, error: "gated" };
  const existing = await getActiveRound("scova");
  if (String(existing?.payload?.status || "") === "active") return { ok: false, error: "already_active" };

  const planet = pickRandomScovaPlanet();
  const coord = formatScovaGridCoord(pickRandomScovaCoord(planet));
  const numericCoords = randomScovaNumericCoords();
  const targetCtx = await resolveSpawnTarget(client, channelId);
  const guildId = targetCtx.guildId;
  const chId = targetCtx.channelId;
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  const channel = guild?.channels?.cache?.get(chId) || (await guild?.channels?.fetch?.(chId).catch(() => null));
  if (!channel?.isTextBased?.()) return { ok: false, error: "bad_channel" };

  const pingMsg = await pingMinigamesRole(client, channel);
  const embed = new EmbedBuilder()
    .setColor(0x2f6fed)
    .setTitle("Scova il pianeta")
    .setDescription(
      `La mappa galattica non risulta aggiornata. Cerca il pianeta nel settore **\`${coord}\`** alle coordinate \`${numericCoords}\`\nConsulta la mappa e scrivi in chat il nome del pianeta.\nHai **${Math.round(SCOVA_DURATION_MS / 60000)} minuti**.`,
    )
    .setImage(SCOVA_MAP_IMAGE);
  const hubMsg = await channel.send({ embeds: [embed] }).catch(() => null);
  await setRound("scova", {
    status: "active",
    kind: "scova",
    planetId: planet.id,
    answer: planet.id,
    coord,
    numericCoords,
    channelId: channel.id,
    guildId,
    hubMessageId: hubMsg?.id || null,
    rolePingMessageId: pingMsg?.id || null,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + SCOVA_DURATION_MS).toISOString(),
  });
  scheduleScovaTimeout(client, SCOVA_DURATION_MS);
  return { ok: true, planetId: planet.id, coord, numericCoords };
}

async function tryScovaMessage(message?, client?) {
  const round = await getActiveRound("scova");
  if (!round?.payload || round.payload.status !== "active") return false;
  if (normalizeId(message.channelId) !== normalizeId(round.payload.channelId)) return false;
  const guessPlanet = findScovaPlanetByGuess(message.content);
  if (!guessPlanet) return false;
  const answerId = normalizeId(round.payload.planetId || round.payload.answer).toLowerCase();
  if (guessPlanet.id !== answerId) {
    await reactSwWrong(message);
    return true;
  }
  if (!(await isStarWarsSortedParticipant(client || message.client, message.guildId, message.author.id))) {
    return false;
  }

  const claimed = await claimRound("scova", message.author.id);
  if (!claimed) {
    await reactSwWrong(message);
    return true;
  }
  clearScovaTimeout();

  const clientRef = client || message.client;
  const walletGid = walletGuildId(clientRef) || normalizeId(message.guildId);
  const factionId = await resolveStarWarsFactionId(clientRef, message.guildId, message.author.id);
  const SCOVA_FACTION_EXP = 1000;
  const SCOVA_BANK_CREDITS = 200_000;

  if (factionId) {
    const { listFactionMembers } = require("./starWarsQuizMalusService") as typeof import("./starWarsQuizMalusService");
    const members = await listFactionMembers(clientRef, [factionId]);
    for (const m of Array.isArray(members) ? members : []) {
      const uid = normalizeId(m?.userId);
      if (!uid) continue;
      await grantStarWarsReward(clientRef, {
        guildId: walletGid,
        userId: uid,
        reason: "scova_faction",
        grant: { exp: SCOVA_FACTION_EXP },
      }).catch(() => null);
    }
    const { addFactionBankCredits } = require("./starWarsEconomyService") as typeof import("./starWarsEconomyService");
    await addFactionBankCredits(clientRef, factionId, SCOVA_BANK_CREDITS, {
      guildId: walletGid,
      userId: message.author.id,
    }).catch(() => null);
  } else {
    await grantStarWarsReward(clientRef, {
      guildId: walletGid,
      userId: message.author.id,
      reason: "scova",
      grant: { exp: SCOVA_FACTION_EXP },
    }).catch(() => null);
  }
  await grantStarWarsGlobalMinigameWinBonus(clientRef, {
    guildId: walletGid,
    userId: message.author.id,
  }).catch(() => null);

  const sector = round.payload.coord ? formatScovaGridCoord(round.payload.coord) : "";
  const bankName =
    factionId === "repubblica"
      ? "della Repubblica"
      : factionId === "separatisti"
        ? "della Confederazione dei Sistemi Indipendenti"
        : factionId === "ribellione"
          ? "della Ribellione"
          : factionId === "impero"
            ? "dell'Impero"
            : factionId === "nuova_repubblica"
              ? "della Nuova Repubblica"
              : factionId === "nuovo_ordine"
                ? "del Nuovo Ordine"
                : null;
  const winColor =
    factionId === "repubblica" || factionId === "ribellione" || factionId === "nuova_repubblica"
      ? 0x2f6fed
      : factionId === "separatisti" || factionId === "impero" || factionId === "nuovo_ordine"
        ? 0xb45309
        : 0x22c55e;
  const foundLine =
    `<@${message.author.id}> ha individuato **${guessPlanet.name}**` + (sector ? ` (\`${sector}\`)` : "") + ".";
  const rewardLine = bankName
    ? ` Per il suo contributo ha guadagnato **${SCOVA_FACTION_EXP.toLocaleString("it-IT")} exp** e ha aggiunto **${SCOVA_BANK_CREDITS.toLocaleString("it-IT")}** ${CREDITI} nella banca ${bankName}.`
    : ` Per il suo contributo ha guadagnato **${SCOVA_FACTION_EXP.toLocaleString("it-IT")} exp**.`;
  const winEmbed = new EmbedBuilder()
    .setColor(winColor)
    .setTitle("Mappa aggiornata!")
    .setDescription(foundLine + rewardLine)
    .setImage(SCOVA_WIN_IMAGE);
  const planetThumb = scovaPlanetImageUrl(guessPlanet.id);
  if (planetThumb) winEmbed.setThumbnail(planetThumb);
  await reactSwWin(message);
  await message.reply({ embeds: [winEmbed] }).catch(() => null);
  return true;
}
/* ——— Attacca la base ——— */
const ATTACCA_MAX_HP = 100;
const ATTACCA_DAMAGE = 5;
const ATTACCA_MIN_CHARS = 5;
const ATTACCA_MAX_HITS_PER_USER = 5;
const ATTACCA_BAR_WIDTH = 10;
const ATTACCA_CDN = "https://cdn.viniliecaffe.it/images/starwars";
const ATTACCA_VS_V = "20261104sq1";
/** Civil War: Yavin IV vs Morte Nera. Sequel (dal 29 gen): Nuova Repubblica vs Primo Ordine. */
const ATTACCA_SKINS = Object.freeze({
  civil: Object.freeze({
    leftLabel: "Yavin IV",
    rightLabel: "Morte Nera",
    leftEmoji: "🌲",
    rightEmoji: "🌑",
    vs: `${ATTACCA_CDN}/attacca-base-vs.jpg?v=20261104vs2`,
    leftDead: `${ATTACCA_CDN}/attacca-base-vs-yavin-dead.jpg?v=${ATTACCA_VS_V}`,
    rightDead: `${ATTACCA_CDN}/attacca-base-vs-deathstar-dead.jpg?v=${ATTACCA_VS_V}`,
    draw: `${ATTACCA_CDN}/attacca-base-vs-draw.jpg?v=${ATTACCA_VS_V}`,
  }),
  sequel: Object.freeze({
    leftLabel: "Nuova Repubblica",
    rightLabel: "Primo Ordine",
    leftEmoji: "✨",
    rightEmoji: "⚫",
    vs: `${ATTACCA_CDN}/attacca-base-vs-sequel.jpg?v=${ATTACCA_VS_V}`,
    leftDead: `${ATTACCA_CDN}/attacca-base-vs-nuova-repubblica-dead.jpg?v=${ATTACCA_VS_V}`,
    rightDead: `${ATTACCA_CDN}/attacca-base-vs-primo-ordine-dead.jpg?v=${ATTACCA_VS_V}`,
    draw: `${ATTACCA_CDN}/attacca-base-vs-sequel-draw.jpg?v=${ATTACCA_VS_V}`,
  }),
});

function attaccaSkinForNow(now = new Date()) {
  const epoch = resolveFeatureStateNow(now).epoch || EPOCHS.CLONE_WARS;
  return epoch === EPOCHS.SEQUEL ? ATTACCA_SKINS.sequel : ATTACCA_SKINS.civil;
}

function attaccaSkinFromPayload(payload?) {
  const key = String(payload?.skin || "").toLowerCase();
  if (key === "sequel") return ATTACCA_SKINS.sequel;
  if (key === "civil") return ATTACCA_SKINS.civil;
  return attaccaSkinForNow();
}

/** winnerLabel = base distrutta (label skin | "pareggio"/"draw"). */
function attaccaVsImageForDestroyed(destroyedLabel?, skin?) {
  const art = skin || attaccaSkinForNow();
  const s = String(destroyedLabel || "").toLowerCase();
  if (s.includes("pareggio") || s.includes("draw") || s.includes("tie")) return art.draw;
  if (s === art.leftLabel.toLowerCase() || s.includes("yavin") || s.includes("nuova repubblica")) {
    return art.leftDead;
  }
  if (s === art.rightLabel.toLowerCase() || s.includes("morte") || s.includes("death") || s.includes("primo ordine")) {
    return art.rightDead;
  }
  return art.vs;
}

function safeHp(v?) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function attaccaHpBar(hp?, maxHp = ATTACCA_MAX_HP, width = ATTACCA_BAR_WIDTH) {
  const cur = Math.max(0, Math.min(maxHp, safeHp(hp)));
  const filled = Math.round((cur / maxHp) * width);
  const empty = Math.max(0, width - filled);
  const pip = cur > 60 ? "🟩" : cur > 30 ? "🟨" : cur > 0 ? "🟥" : "⬛";
  return `${pip.repeat(filled)}${"⬛".repeat(empty)}`;
}

function attaccaBaseBoardEmbed(payload?, { lastHit = null, finished = false } = {}) {
  const skin = attaccaSkinFromPayload(payload);
  const left = safeHp(payload?.hpYavin);
  const right = safeHp(payload?.hpDeathStar);
  const lines = [
    `${skin.leftEmoji} **${skin.leftLabel}**`,
    `\`${String(left).padStart(3, " ")}/${ATTACCA_MAX_HP}\`  ${attaccaHpBar(left)}`,
    "",
    `${skin.rightEmoji} **${skin.rightLabel}**`,
    `\`${String(right).padStart(3, " ")}/${ATTACCA_MAX_HP}\`  ${attaccaHpBar(right)}`,
  ];
  if (lastHit?.userId && lastHit?.label) {
    lines.push(
      "",
      `💥 Ultimo colpo: <@${lastHit.userId}> → **${lastHit.label}** (−${ATTACCA_DAMAGE} HP)`,
    );
  }
  if (!finished) {
    lines.push(
      "",
      `Regole: messaggio ≥ **${ATTACCA_MIN_CHARS}** caratteri · max **${ATTACCA_MAX_HITS_PER_USER}** colpi a testa · −**${ATTACCA_DAMAGE} HP** a una base a caso.`,
    );
  } else if (lastHit?.winnerLabel) {
    const wl = String(lastHit.winnerLabel);
    if (/tempo scaduto|timeout/i.test(wl)) lines.push("", "<a:VC_pixeltime:1482535344103620771> **Tempo scaduto** — nessuna base distrutta.");
    else if (/pareggio|draw|tie/i.test(wl)) lines.push("", "⚖️ **Pareggio** — entrambe le basi a pezzi.");
    else lines.push("", `🏆 **${wl}** distrutta!`);
  }
  const bothDead = finished && left <= 0 && right <= 0;
  const timedOut = finished && /tempo scaduto|timeout/i.test(String(lastHit?.winnerLabel || ""));
  const color = finished
    ? bothDead || timedOut || /pareggio|draw|tie/i.test(String(lastHit?.winnerLabel || ""))
      ? 0x9ca3af
      : 0x22c55e
    : left <= 30 || right <= 30
      ? 0xef4444
      : 0xc9a227;
  let image: string = skin.vs;
  if (finished) {
    if (timedOut) image = skin.vs;
    else if (bothDead || /pareggio|draw|tie/i.test(String(lastHit?.winnerLabel || ""))) image = skin.draw;
    else if (lastHit?.winnerLabel) image = attaccaVsImageForDestroyed(lastHit.winnerLabel, skin);
  }
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(finished ? "Attacca la base — fine" : "Attacca la base")
    .setDescription(lines.join("\n"))
    .setImage(image);
}

async function editAttaccaBaseBoard(client?, payload?, opts?) {
  const channelId = normalizeId(payload?.channelId);
  const messageId = normalizeId(payload?.boardMessageId || payload?.messageId);
  if (!client || !channelId || !messageId) return;
  const ch =
    client.channels.cache.get(channelId) || (await client.channels.fetch(channelId).catch(() => null));
  if (!ch?.messages?.fetch) return;
  const msg = await ch.messages.fetch(messageId).catch(() => null);
  if (!msg?.edit) return;
  await msg.edit({ embeds: [attaccaBaseBoardEmbed(payload, opts)] }).catch(() => null);
}

async function startAttaccaBase(client?, { channelId = null, force = false } = {}) {
  if (!force && !canAutoSpawnFeature(client, FEATURES.MINIGAME_ATTACCA_BASE)) return { ok: false, error: "gated" };
  const existing = await getActiveRound("attacca_base");
  if (String(existing?.payload?.status || "") === "active") return { ok: false, error: "already_active" };

  const targetCtx = await resolveSpawnTarget(client, channelId);
  const guildId = targetCtx.guildId;
  const chId = targetCtx.channelId;
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  const channel = guild?.channels?.cache?.get(chId) || (await guild?.channels?.fetch?.(chId).catch(() => null));
  if (!channel?.isTextBased?.()) return { ok: false, error: "bad_channel" };

  const hp = ATTACCA_MAX_HP;
  const skinKey = resolveFeatureStateNow().epoch === EPOCHS.SEQUEL ? "sequel" : "civil";
  const boardPayload = { hpYavin: hp, hpDeathStar: hp, skin: skinKey };
  const pingMsg = await pingMinigamesRole(client, channel);
  const boardMsg = await channel
    .send({
      embeds: [attaccaBaseBoardEmbed(boardPayload)],
    })
    .catch(() => null);
  if (!boardMsg) return { ok: false, error: "send_failed" };
  const expiresAt = new Date(Date.now() + ATTACCA_DURATION_MS).toISOString();
  const payload = {
    status: "active",
    kind: "attacca_base",
    skin: skinKey,
    hpYavin: hp,
    hpDeathStar: hp,
    hitsByUser: {},
    channelId: channel.id,
    guildId,
    boardMessageId: boardMsg.id,
    messageId: boardMsg.id,
    rolePingMessageId: pingMsg?.id || null,
    createdAt: new Date().toISOString(),
    expiresAt,
  };
  await setRound("attacca_base", payload);
  scheduleAttaccaTimeout(client, ATTACCA_DURATION_MS);
  return { ok: true, messageId: boardMsg.id };
}

function clearAttaccaTimeout() {
  const t = attaccaTimeouts.get("attacca_base");
  if (t) clearTimeout(t);
  attaccaTimeouts.delete("attacca_base");
}

async function finalizeAttaccaTimeout(client?) {
  clearAttaccaTimeout();
  if (await catchUpAttaccaFromHistory(client)) return;
  const round = await getActiveRound("attacca_base");
  if (!round?.payload || round.payload.status !== "active") return;
  const payload = { ...round.payload, status: "expired", expiredAt: new Date().toISOString() };
  await setRound("attacca_base", payload);
  await deleteSwChannelMessage(client, payload.channelId, payload.rolePingMessageId);
  const skin = attaccaSkinFromPayload(payload);
  await editAttaccaBaseBoard(client, payload, { finished: true, lastHit: { winnerLabel: "Tempo scaduto" } });
  const chId = normalizeId(payload.channelId);
  if (!chId || !client) return;
  const channel = client.channels.cache.get(chId) || (await client.channels.fetch(chId).catch(() => null));
  if (!channel?.send) return;
  await channel
    .send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x6b7280)
          .setTitle("Attacca la base")
          .setDescription(
            `<a:VC_pixeltime:1482535344103620771> Tempo scaduto: nessuna base è stata distrutta.\n` +
              `**${skin.leftLabel}** ${safeHp(payload.hpYavin)}/${ATTACCA_MAX_HP} · **${skin.rightLabel}** ${safeHp(payload.hpDeathStar)}/${ATTACCA_MAX_HP}`,
          )
          .setImage(skin.vs),
      ],
    })
    .catch(() => null);
}

function scheduleAttaccaTimeout(client?, durationMs = ATTACCA_DURATION_MS) {
  clearAttaccaTimeout();
  const t = setTimeout(() => {
    void finalizeAttaccaTimeout(client);
  }, Math.max(1000, Number(durationMs) || ATTACCA_DURATION_MS));
  t.unref?.();
  attaccaTimeouts.set("attacca_base", t);
}

async function tryAttaccaBaseMessage(message?, client?) {
  const round = await getActiveRound("attacca_base");
  if (!round?.payload || round.payload.status !== "active") return false;
  if (normalizeId(message.channelId) !== normalizeId(round.payload.channelId)) return false;
  if (message.author?.bot) return false;

  const text = String(message.content || "").trim();
  if (text.length < ATTACCA_MIN_CHARS) return false;
  if (!(await isStarWarsSortedParticipant(client || message.client, message.guildId, message.author.id))) {
    return false;
  }

  const uid = normalizeId(message.author.id);
  const hitsByUser = { ...(round.payload.hitsByUser && typeof round.payload.hitsByUser === "object" ? round.payload.hitsByUser : {}) };
  const used = Math.max(0, Math.floor(Number(hitsByUser[uid]) || 0));
  if (used >= ATTACCA_MAX_HITS_PER_USER) {
    await message.react("🛑").catch(() => null);
    return true;
  }

  const skin = attaccaSkinFromPayload(round.payload);
  const target = Math.random() < 0.5 ? "hpYavin" : "hpDeathStar";
  const label = target === "hpYavin" ? skin.leftLabel : skin.rightLabel;
  const before = safeHp(round.payload[target]);
  const next = Math.max(0, before - ATTACCA_DAMAGE);
  hitsByUser[uid] = used + 1;

  const payload = {
    ...round.payload,
    skin: round.payload.skin || (skin === ATTACCA_SKINS.sequel ? "sequel" : "civil"),
    [target]: next,
    hitsByUser,
    lastHitAt: new Date().toISOString(),
    lastHitUserId: uid,
    lastHitTarget: target,
  };

  let winner = null;
  if (next <= 0) {
    payload.status = "completed";
    payload.winnerId = uid;
    payload.completedAt = new Date().toISOString();
    winner = label;
  }
  await setRound("attacca_base", payload);

  const lastHit = { userId: uid, label, winnerLabel: winner || null };
  await editAttaccaBaseBoard(client || message.client, payload, { lastHit, finished: Boolean(winner) });

  if (winner) {
    clearAttaccaTimeout();
    await grantStarWarsMinigameWinReward(client || message.client, {
      guildId: walletGuildId(client || message.client) || message.guildId,
      userId: uid,
      reason: "attacca_base",
      grant: { crateId: "omega", crateQty: 1, exp: 100 },
    });
    await reactSwWin(message);
    await message.channel
      .send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xef4444)
            .setTitle("Base distrutta")
            .setDescription(
              `💥 <@${uid}> azzera **${winner}**!\nPremio: ${formatCrateMention("omega", 1, { open: true })} + **100 exp**.`,
            )
            .setImage(attaccaVsImageForDestroyed(winner, skin)),
        ],
      })
      .catch(() => null);
  } else {
    await message.react("💥").catch(() => null);
  }
  return true;
}
/* ——— Proteggi convoglio ——— */
const CONVOGLIO_NEED_HOPS = 3;
const CONVOGLIO_CDN = "https://cdn.viniliecaffe.it/images/starwars";
const CONVOGLIO_IMG_V = "20261111cv1";
const CONVOGLIO_HUB_IMAGE = `${CONVOGLIO_CDN}/convoglio-hub.jpg?v=${CONVOGLIO_IMG_V}`;
const CONVOGLIO_IMAGES = Object.freeze({
  hub: CONVOGLIO_HUB_IMAGE,
  1: `${CONVOGLIO_CDN}/convoglio-hop1.jpg?v=${CONVOGLIO_IMG_V}`,
  2: `${CONVOGLIO_CDN}/convoglio-hop2.jpg?v=${CONVOGLIO_IMG_V}`,
  3: `${CONVOGLIO_CDN}/convoglio-hop3.jpg?v=${CONVOGLIO_IMG_V}`,
  intercepted: `${CONVOGLIO_CDN}/convoglio-intercepted.jpg?v=${CONVOGLIO_IMG_V}`,
});

function convoglioFactionLabel(factionId?) {
  const f = normalizeId(factionId).toLowerCase();
  if (f === "repubblica") return "Repubblica";
  if (f === "separatisti") return "Separatisti";
  return f || "sconosciuta";
}

function resolvePinnedCommunityCategoryIds(guild?) {
  if (!guild?.channels?.cache) return [];
  const byName = [...guild.channels.cache.values()]
    .filter((c?) => c?.type === ChannelType.GuildCategory)
    .filter((c?) => {
      const n = String(c.name || "");
      return /pinned/i.test(n) || /community/i.test(n);
    })
    .map((c?) => normalizeId(c.id))
    .filter(Boolean);
  if (byName.length) return [...new Set(byName)];
  const fallback = ["1442569064793903356", "1442569067473928243"];
  return fallback
    .map((id?) => {
      try {
        const { remapChannelIdForGuild, isTestMirrorGuild } = require(__eventCoreVinili(
          "Config/testGuildMirrorRemap",
        )) as typeof import("../../../../../../src/Vinili/Config/testGuildMirrorRemap");
        if (isTestMirrorGuild(guild.id)) return remapChannelIdForGuild(guild.id, id) || id;
      } catch (_) {}
      return id;
    })
    .filter(Boolean);
}

async function pickRandomConvoglioHideChannel(guild?, excludeChannelIds = []) {
  if (!guild) return null;
  await guild.channels.fetch().catch(() => null);
  const parents = new Set(resolvePinnedCommunityCategoryIds(guild));
  if (!parents.size) return pickRandomHuntChannel(guild, excludeChannelIds);
  const me = guild.members.me || guild.members.cache.get(guild.client?.user?.id);
  const excluded = new Set(
    (Array.isArray(excludeChannelIds) ? excludeChannelIds : []).map((id?) => normalizeId(id)).filter(Boolean),
  );
  const list = [...guild.channels.cache.values()].filter((channel?) => {
    if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) return false;
    if (!parents.has(normalizeId(channel.parentId))) return false;
    if (excluded.has(normalizeId(channel.id))) return false;
    if (!channel.viewable) return false;
    if (
      me &&
      !me.permissions?.has?.(PermissionsBitField.Flags.Administrator) &&
      !channel
        .permissionsFor?.(me)
        ?.has?.([PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages])
    ) {
      return false;
    }
    const everyone = channel.permissionsFor?.(guild.roles.everyone);
    if (!everyone?.has?.(PermissionsBitField.Flags.ViewChannel)) return false;
    return true;
  });
  if (!list.length) return pickRandomHuntChannel(guild, excludeChannelIds);
  return list[Math.floor(Math.random() * list.length)];
}

function buildConvoglioActionIds(token?) {
  const t = String(token || Date.now().toString(36));
  return {
    customContinue: `sw_mg:convoglio:continua:${t}`,
    customIntercept: `sw_mg:convoglio:intercetta:${t}`,
  };
}

const CONVOGLIO_CLEANUP_MS = 12_000;

function scheduleConvoglioMessageCleanup(...messages) {
  const list = (Array.isArray(messages) ? messages : []).filter(Boolean);
  if (!list.length) return;
  setTimeout(() => {
    void (async () => {
      for (const msg of list) {
        try {
          if (msg?.deletable) await msg.delete().catch(() => null);
          else if (msg?.delete) await msg.delete().catch(() => null);
        } catch (_) {}
      }
    })();
  }, CONVOGLIO_CLEANUP_MS);
}

function convoglioEmbed({
  escort,
  hop,
  needHops = CONVOGLIO_NEED_HOPS,
  mode = "active",
}: {
  escort?: string;
  hop?: number;
  needHops?: number;
  mode?: string;
} = {}) {
  const hopN = Math.max(1, Math.min(needHops, safeHp(hop) || 1));
  const escortLabel = convoglioFactionLabel(escort);
  if (mode === "intercepted") {
    return new EmbedBuilder()
      .setColor(0x6b7280)
      .setTitle("Convoglio intercettato")
      .setDescription("Il convoglio è stato fermato. **Nessuna ricompensa** per questa corsa.")
      .setImage(CONVOGLIO_IMAGES.intercepted);
  }
  if (mode === "arrived") {
    return new EmbedBuilder()
      .setColor(0x22c55e)
      .setTitle("Convoglio a destinazione")
      .setDescription(`La scorta **${escortLabel}** ha portato a casa il carico.`)
      .setImage(CONVOGLIO_IMAGES[3]);
  }
  const titles = {
    1: "Proteggi convoglio — Partenza",
    2: "Proteggi convoglio — In rotta",
    3: "Proteggi convoglio — Ultimo tratto",
  };
  return new EmbedBuilder()
    .setColor(0x8b1a1a)
    .setTitle(titles[hopN] || "Proteggi convoglio")
    .setDescription(
      `Tappa **${hopN}/${needHops}**\nFazione di scorta: **${escortLabel}**.\n` +
        `Se qualcuno **Intercetta**, la corsa finisce subito e **si perdono le ricompense**.\n` +
        `Reazioni: ${CONVOGLIO_CONTINUE_REACT} Continua · ${CONVOGLIO_INTERCEPT_REACT} Intercetta.`,
    )
    .setImage(CONVOGLIO_IMAGES[hopN] || CONVOGLIO_IMAGES[1]);
}

async function startConvoglio(client?, { channelId = null, force = false } = {}) {
  if (!force && !canAutoSpawnFeature(client, FEATURES.MINIGAME_PROTEGGI)) return { ok: false, error: "gated" };
  const existing = await getActiveRound("convoglio");
  if (String(existing?.payload?.status || "") === "active") return { ok: false, error: "already_active" };

  const targetCtx = await resolveSpawnTarget(client, channelId);
  const guildId = targetCtx.guildId;
  const hubChannelId = targetCtx.channelId;
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  const hub =
    guild?.channels?.cache?.get(hubChannelId) || (await guild?.channels?.fetch?.(hubChannelId).catch(() => null));
  if (!hub?.isTextBased?.()) return { ok: false, error: "bad_channel" };

  const hideChannel = await pickRandomConvoglioHideChannel(guild, [hubChannelId]);
  if (!hideChannel?.isTextBased?.()) return { ok: false, error: "no_hide_channel" };

  const escort = Math.random() < 0.5 ? "repubblica" : "separatisti";
  const hop = 1;
  const actionIds = buildConvoglioActionIds();
  const durationMs = CONVOGLIO_DURATION_MS;
  const escortLabel = convoglioFactionLabel(escort);
  const pingMsg = await pingMinigamesRole(client, hub);
  const hubMsg = await hub
    .send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x8b1a1a)
          .setTitle("Proteggi convoglio")
          .setDescription(
            `Un convoglio della **${escortLabel}** è in viaggio.\n` +
              `Le tappe appaiono a caso nei canali **Community** e **Pinned** — scortalo o intercettalo.\n` +
              `Reazioni: ${CONVOGLIO_CONTINUE_REACT} Continua (solo scorta) · ${CONVOGLIO_INTERCEPT_REACT} Intercetta (fazione opposta).\n` +
              `Hai **${Math.round(durationMs / 60000)} minuti**.`,
          )
          .setImage(CONVOGLIO_HUB_IMAGE),
      ],
    })
    .catch(() => null);
  if (!hubMsg) return { ok: false, error: "hub_send_failed" };

  const msg = await hideChannel
    .send({
      embeds: [convoglioEmbed({ escort, hop, mode: "active" })],
    })
    .catch(() => null);
  if (!msg) {
    await hubMsg.delete().catch(() => null);
    await setRound("convoglio", { status: "aborted", kind: "convoglio", guildId, hubChannelId, error: "hop_send_failed" });
    return { ok: false, error: "send_failed" };
  }
  await seedClaimReaction(msg, CONVOGLIO_CONTINUE_REACT);
  await seedClaimReaction(msg, CONVOGLIO_INTERCEPT_REACT);

  const expiresAt = new Date(Date.now() + durationMs).toISOString();
  await setRound("convoglio", {
    status: "active",
    kind: "convoglio",
    escort,
    hops: hop,
    needHops: CONVOGLIO_NEED_HOPS,
    messageId: msg.id,
    channelId: hideChannel.id,
    hubChannelId,
    hubMessageId: hubMsg.id,
    usedChannelIds: [hubChannelId, hideChannel.id].map(normalizeId).filter(Boolean),
    guildId,
    rolePingMessageId: pingMsg?.id || null,
    customContinue: actionIds.customContinue,
    customIntercept: actionIds.customIntercept,
    createdAt: new Date().toISOString(),
    expiresAt,
  });
  scheduleConvoglioTimeout(client, durationMs);
  return { ok: true, hop, channelId: hideChannel.id, hubChannelId };
}

function clearConvoglioTimeout() {
  const t = convoglioTimeouts.get("convoglio");
  if (t) clearTimeout(t);
  convoglioTimeouts.delete("convoglio");
}

async function finalizeConvoglioTimeout(client?) {
  clearConvoglioTimeout();
  if (await catchUpConvoglioFromReactions(client)) return;
  const round = await getActiveRound("convoglio");
  if (!round?.payload || round.payload.status !== "active") return;
  const payload = round.payload;
  await setRound("convoglio", { ...payload, status: "expired", expiredAt: new Date().toISOString() });
  await deleteSwChannelMessage(client, payload.channelId, payload.messageId);
  await deleteSwChannelMessage(client, payload.hubChannelId || payload.channelId, payload.hubMessageId);
  await deleteSwChannelMessage(client, payload.hubChannelId || payload.channelId, payload.rolePingMessageId);
  const hubId = normalizeId(payload.hubChannelId) || chatChannelId(client, payload.guildId);
  if (!hubId || !client) return;
  const hub = client.channels.cache.get(hubId) || (await client.channels.fetch(hubId).catch(() => null));
  if (!hub?.send) return;
  await hub
    .send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x6b7280)
          .setTitle("Proteggi convoglio")
          .setDescription("<a:VC_pixeltime:1482535344103620771> Tempo scaduto: il convoglio non è arrivato a destinazione.")
          .setImage(CONVOGLIO_IMAGES.intercepted),
      ],
    })
    .catch(() => null);
}

function scheduleConvoglioTimeout(client?, durationMs = CONVOGLIO_DURATION_MS) {
  clearConvoglioTimeout();
  const t = setTimeout(() => {
    void finalizeConvoglioTimeout(client);
  }, Math.max(1000, Number(durationMs) || CONVOGLIO_DURATION_MS));
  t.unref?.();
  convoglioTimeouts.set("convoglio", t);
}

async function handleConvoglioButton(interaction?, parts?) {
  const action = parts[2]; // continua | intercetta
  const round = await getActiveRound("convoglio");
  if (!round?.payload || round.payload.status !== "active") {
    await interaction.reply({ content: "Convoglio già risolto.", flags: 1 << 6 }).catch(() => null);
    return true;
  }
  if (
    normalizeId(round.payload.messageId) &&
    normalizeId(interaction.message?.id) &&
    normalizeId(round.payload.messageId) !== normalizeId(interaction.message.id)
  ) {
    await interaction.reply({ content: "Questo convoglio non è più quello attivo.", flags: 1 << 6 }).catch(() => null);
    return true;
  }

  const faction = await resolveStarWarsFactionId(interaction.client, interaction.guildId, interaction.user.id);
  if (!faction) {
    await interaction.reply({ content: UNSORTED_MG_MSG, flags: 1 << 6 }).catch(() => null);
    return true;
  }
  const escort = round.payload.escort;
  const needHops = Math.max(1, safeHp(round.payload.needHops) || CONVOGLIO_NEED_HOPS);
  const currentHop = Math.max(1, safeHp(round.payload.hops) || 1);

  if (action === "intercetta") {
    if (faction === escort) {
      await interaction.reply({ content: "Non puoi intercettare il tuo convoglio.", flags: 1 << 6 }).catch(() => null);
      return true;
    }
    clearConvoglioTimeout();
    await setRound("convoglio", {
      ...round.payload,
      status: "intercepted",
      interceptedBy: interaction.user.id,
      completedAt: new Date().toISOString(),
    });
    const hopMsg = interaction.message;
    await hopMsg?.delete?.().catch(() => null);
    await deleteSwChannelMessage(
      interaction.client,
      round.payload.hubChannelId,
      round.payload.hubMessageId,
    );
    await interaction
      .reply({
        content: `💥 Hai intercettato il convoglio alla tappa **${currentHop}/${needHops}**. **Nessuna ricompensa.**`,
        flags: 1 << 6,
      })
      .catch(() => null);
    const hubId =
      normalizeId(round.payload.hubChannelId) ||
      chatChannelId(interaction.client, round.payload.guildId || interaction.guildId);
    if (hubId) {
      const hub =
        interaction.client.channels.cache.get(hubId) ||
        (await interaction.client.channels.fetch(hubId).catch(() => null));
      if (hub?.send) {
        await hub
          .send({
            content: `💥 <@${interaction.user.id}> ha intercettato il convoglio alla tappa **${currentHop}/${needHops}**. **Nessuna ricompensa.**`,
            embeds: [convoglioEmbed({ escort, hop: currentHop, needHops, mode: "intercepted" })],
          })
          .catch(() => null);
      }
    }
    return true;
  }

  if (action === "continua") {
    if (faction !== escort) {
      await interaction.reply({ content: "Solo la fazione di scorta può continuare.", flags: 1 << 6 }).catch(() => null);
      return true;
    }

    const hopMsg = interaction.message;
    await hopMsg?.delete?.().catch(() => null);

    if (currentHop >= needHops) {
      clearConvoglioTimeout();
      await claimRound("convoglio", interaction.user.id);
      await grantStarWarsMinigameWinReward(interaction.client, {
        guildId: walletGuildId(interaction.client) || interaction.guildId,
        userId: interaction.user.id,
        reason: "convoglio_escort",
        grant: { crateId: "omega", crateQty: 1, exp: 100 },
      });
      await deleteSwChannelMessage(
        interaction.client,
        round.payload.hubChannelId,
        round.payload.hubMessageId,
      );
      await interaction
        .reply({
          content: `🏁 Convoglio a destinazione! (+${formatCrateMention("omega", 1, { open: true })} + 100 exp)`,
          flags: 1 << 6,
        })
        .catch(() => null);
      const hubId =
        normalizeId(round.payload.hubChannelId) ||
        chatChannelId(interaction.client, round.payload.guildId || interaction.guildId);
      if (hubId) {
        const hub =
          interaction.client.channels.cache.get(hubId) ||
          (await interaction.client.channels.fetch(hubId).catch(() => null));
        if (hub?.send) {
          await hub
            .send({
              content: `🏁 <@${interaction.user.id}> ha portato il convoglio a destinazione! (+${formatCrateMention("omega", 1, { open: true })} + 100 exp)`,
              embeds: [convoglioEmbed({ escort, hop: needHops, needHops, mode: "arrived" })],
            })
            .catch(() => null);
        }
      }
      return true;
    }

    const nextHop = currentHop + 1;
    const guild =
      interaction.guild ||
      interaction.client.guilds.cache.get(normalizeId(round.payload.guildId)) ||
      (await interaction.client.guilds.fetch(normalizeId(round.payload.guildId)).catch(() => null));
    const used = Array.isArray(round.payload.usedChannelIds) ? round.payload.usedChannelIds.map(normalizeId) : [];
    const nextChannel = await pickRandomConvoglioHideChannel(guild, used);
    if (!nextChannel?.isTextBased?.()) {
      await setRound("convoglio", { ...round.payload, status: "aborted", error: "no_hide_channel" });
      await interaction.reply({ content: "Nessun canale libero per la prossima tappa.", flags: 1 << 6 }).catch(() => null);
      return true;
    }

    const actionIds = buildConvoglioActionIds(`${Date.now().toString(36)}${nextHop}`);
    const nextMsg = await nextChannel
      .send({
        embeds: [convoglioEmbed({ escort, hop: nextHop, needHops, mode: "active" })],
      })
      .catch(() => null);
    if (!nextMsg) {
      await setRound("convoglio", { ...round.payload, status: "aborted", error: "next_send_failed" });
      await interaction.reply({ content: "Impossibile spawnare la prossima tappa.", flags: 1 << 6 }).catch(() => null);
      return true;
    }
    await seedClaimReaction(nextMsg, CONVOGLIO_CONTINUE_REACT);
    await seedClaimReaction(nextMsg, CONVOGLIO_INTERCEPT_REACT);

    await setRound("convoglio", {
      ...round.payload,
      hops: nextHop,
      messageId: nextMsg.id,
      channelId: nextChannel.id,
      usedChannelIds: [...used, normalizeId(nextChannel.id)].filter(Boolean),
      customContinue: actionIds.customContinue,
      customIntercept: actionIds.customIntercept,
      lastMovedAt: new Date().toISOString(),
    });

    await interaction
      .reply({
        content: `✅ Tappa **${currentHop}/${needHops}** ok. Il convoglio è ripartito in un altro canale — trovalo!`,
        flags: 1 << 6,
      })
      .catch(() => null);
    return true;
  }
  return true;
}

/* ——— Conquista il sistema ——— */
const CONQUISTA_CDN = "https://cdn.viniliecaffe.it/images/starwars";
const CONQUISTA_IMG_V = "20261111cq1";
const CONQUISTA_HUB_IMAGE = `${CONQUISTA_CDN}/conquista-hub.jpg?v=${CONQUISTA_IMG_V}`;
const CONQUISTA_WIN_IMAGES = Object.freeze({
  repubblica: `${CONQUISTA_CDN}/conquista-win-repubblica.jpg?v=${CONQUISTA_IMG_V}`,
  separatisti: `${CONQUISTA_CDN}/conquista-win-separatisti.jpg?v=${CONQUISTA_IMG_V}`,
  draw: `${CONQUISTA_CDN}/conquista-win-draw.jpg?v=${CONQUISTA_IMG_V}`,
});
const CONQUISTA_MAX_PER_USER = 2;
const CONQUISTA_DURATION_MS = SW_EXTRA_DURATION_MS;
const CONQUISTA_LOSE_IMAGE = `${CONQUISTA_CDN}/conquista-lose.jpg?v=${CONQUISTA_IMG_V}`;
/** Bonus vittoria: unità bank fazione (cloni/droidi), non per singolo membro. */
const CONQUISTA_WIN_UNIT_ID = "cloni_droidi";
const CONQUISTA_WIN_UNIT_QTY = 4;

const CONQUISTA_PLANET_BLURBS = Object.freeze({
  dantooine: "Pianure remote e rovine Jedi: un avamposto fragile, ma strategico.",
  iridonia: "Mondo natale degli Zabrak, aspro e vulcanico. Chi lo tiene controlla le rotte vicine.",
  felucia: "Giungla fungina ostile: visibilità zero, imboscate infinite.",
  moncala: "Mondo oceanico e cantieri stellari. Dominarlo significa navi fresche.",
  mandalore: "Ferro e onore. Chi conquista Mandalore impone la propria legge sul settore.",
  exegol: "Mondi sepolti nella Unknown Regions: potere oscuro, rischio estremo.",
  jedha: "Deserto sacro e cristalli kyber. Un faro per chi cerca risorse rare.",
  coruscant: "Cuore della galassia. Tenere Coruscant è tenere lo scacchiere intero.",
  alderaan: "Pace e diplomazia… finché qualcuno non decide altrimenti.",
  onderon: "Giungle e città murate: resistenza locale garantita.",
  kessel: "Miniere e spezia. Chi controlla Kessel controlla flussi illeciti.",
  jakku: "Cimitero di navi e tempeste di sabbia. Scrap e segreti.",
  vandor: "Ghiaccio e montagne: ideale per depositi nascosti.",
  kamino: "Piogge eterne e cloni. Infrastruttura militare di primo livello.",
  endor: "Lune boscose e scudi planetari. Facile da sottovalutare.",
  naboo: "Regge e pianure: bellezza, politica e punti di rifornimento.",
  tatooine: "Due soli, Hutt e contrabbando. Nodo di passaggio obbligato.",
  ortoplutonia: "Ghiaccio e tensioni pandoriane. Un sistema di confine instabile.",
});

function shuffleCopy(list?) {
  const arr = [...(Array.isArray(list) ? list : [])];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function conquistaPlanetBlurb(planetId?) {
  const id = normalizeId(planetId).toLowerCase();
  return CONQUISTA_PLANET_BLURBS[id] || "Sistema strategico in bilico tra le fazioni.";
}

function conquistaFactionLabel(factionId?) {
  const f = normalizeId(factionId).toLowerCase();
  if (f === "repubblica") return "Repubblica";
  if (f === "separatisti") return "Separatisti";
  return f || "sconosciuta";
}

function conquistaFactionColor(factionId?) {
  const f = normalizeId(factionId).toLowerCase();
  if (f === "repubblica") return 0x3b82f6;
  if (f === "separatisti") return 0xa855f7;
  return 0x6b7280;
}

async function listPinnedCommunityTextChannels(guild?) {
  if (!guild) return [];
  await guild.channels.fetch().catch(() => null);
  const parents = new Set(resolvePinnedCommunityCategoryIds(guild));
  if (!parents.size) return [];
  const me = guild.members.me || guild.members.cache.get(guild.client?.user?.id);
  return [...guild.channels.cache.values()].filter((channel?) => {
    if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) return false;
    if (!parents.has(normalizeId(channel.parentId))) return false;
    if (!channel.viewable) return false;
    if (
      me &&
      !me.permissions?.has?.(PermissionsBitField.Flags.Administrator) &&
      !channel
        .permissionsFor?.(me)
        ?.has?.([PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages])
    ) {
      return false;
    }
    const everyone = channel.permissionsFor?.(guild.roles.everyone);
    if (!everyone?.has?.(PermissionsBitField.Flags.ViewChannel)) return false;
    return true;
  });
}

function buildConquistaClaimId(systemKey?) {
  const key = String(systemKey || Date.now().toString(36));
  return { customId: `sw_mg:conquista:claim:${key}` };
}

function conquistaSystemEmbed(planet?, { claimedBy = null, claimedFaction = null } = {}) {
  const name = planet?.name || "Sistema sconosciuto";
  const blurb = conquistaPlanetBlurb(planet?.id);
  const image = scovaPlanetImageUrl(planet?.id);
  if (claimedBy) {
    const factionLabel = conquistaFactionLabel(claimedFaction);
    const embed = new EmbedBuilder()
      .setColor(conquistaFactionColor(claimedFaction))
      .setTitle(`Sistema conquistato — ${name}`)
      .setDescription(
        `${blurb}\n\nPreso da <@${claimedBy}> per la **${factionLabel}**.`,
      );
    if (image) embed.setImage(image);
    return embed;
  }
  const embed = new EmbedBuilder()
    .setColor(0xc2410c)
    .setTitle(`Sistema in bilico — ${name}`)
    .setDescription(`${blurb}\n\nReagisci con ${CONQUISTA_CLAIM_REACT} per conquistarlo.`);
  if (image) embed.setImage(image);
  return embed;
}

function countUserConquistaClaims(systems?, userId?) {
  const uid = normalizeId(userId);
  if (!uid || !systems || typeof systems !== "object") return 0;
  return Object.values(systems).filter((s?) => normalizeId(s?.claimedBy) === uid).length;
}

function countFactionConquistaClaims(systems?) {
  const out = { repubblica: 0, separatisti: 0 };
  if (!systems || typeof systems !== "object") return out;
  for (const s of Object.values(systems)) {
    const f = normalizeId(s?.claimedFaction).toLowerCase();
    if (f === "repubblica" || f === "separatisti") out[f] += 1;
  }
  return out;
}

function conquistaTroopLabel(factionId?) {
  const f = normalizeId(factionId).toLowerCase();
  if (f === "repubblica") return "Cloni";
  if (f === "separatisti") return "Droidi";
  return "truppe";
}

async function grantConquistaWinTroops(client?, { winnerFaction }: { winnerFaction?: string } = {}) {
  const winner = normalizeId(winnerFaction).toLowerCase();
  if (!winner || (winner !== "repubblica" && winner !== "separatisti")) return { granted: 0 };
  try {
    const { getFactionBank, saveFactionBank } = require("./starWarsEconomyService") as typeof import("./starWarsEconomyService");
    const { resolveStarWarsEventConfig } = require("../../Utils/Eventi/starWarsEventConfig") as typeof import("../../Utils/Eventi/starWarsEventConfig");
    const { ADVENT_EVENT_KEY } = require("../../Utils/Eventi/starWarsAdventCatalog") as typeof import("../../Utils/Eventi/starWarsAdventCatalog");
    const cfg = resolveStarWarsEventConfig(client);
    const eventKey = cfg.eventKey || ADVENT_EVENT_KEY;
    const bank = await getFactionBank(eventKey, winner);
    bank.units = bank.units && typeof bank.units === "object" ? { ...bank.units } : {};
    bank.units[CONQUISTA_WIN_UNIT_ID] = Math.max(0, Number(bank.units[CONQUISTA_WIN_UNIT_ID]) || 0) + CONQUISTA_WIN_UNIT_QTY;
    await saveFactionBank(eventKey, winner, bank);
    return {
      granted: 1,
      troopLabel: conquistaTroopLabel(winner),
      qty: CONQUISTA_WIN_UNIT_QTY,
      unitId: CONQUISTA_WIN_UNIT_ID,
      bankUnits: bank.units[CONQUISTA_WIN_UNIT_ID],
    };
  } catch (_) {
    return { granted: 0, troopLabel: conquistaTroopLabel(winner), qty: CONQUISTA_WIN_UNIT_QTY };
  }
}

function buildConquistaWinAnnounceEmbed({
  winner = null,
  scores = {},
  winGrant = null,
}: {
  winner?: string | null;
  scores?: { repubblica?: number; separatisti?: number };
  winGrant?: { qty?: number; granted?: number; troopLabel?: string } | null;
} = {}) {
  const r = safeHp(scores.repubblica);
  const s = safeHp(scores.separatisti);
  const scoreLine = `Sistemi: **Repubblica ${r}** — **Separatisti ${s}**`;

  if (winner === "repubblica") {
    const troopLine = winGrant?.qty
      ? `\n\nBonus di guerra alla **fazione**: **+${winGrant.qty} Cloni** nell'esercito della Repubblica.`
      : "";
    return new EmbedBuilder()
      .setColor(0x3b82f6)
      .setTitle("Vittoria della Repubblica")
      .setDescription(
        `I cloni alzano la bandiera sui sistemi contesi.\nIl Senato celebra: il settore è sotto controllo.\n\n${scoreLine}${troopLine}`,
      )
      .setImage(CONQUISTA_WIN_IMAGES.repubblica);
  }

  if (winner === "separatisti") {
    const troopLine = winGrant?.qty
      ? `\n\nBonus di guerra alla **fazione**: **+${winGrant.qty} Droidi** nell'esercito Separatista.`
      : "";
    return new EmbedBuilder()
      .setColor(0xa855f7)
      .setTitle("Vittoria dei Separatisti")
      .setDescription(
        `Le armate droide chiudono la morsa.\nI sistemi cadono sotto il comando della Confederazione.\n\n${scoreLine}${troopLine}`,
      )
      .setImage(CONQUISTA_WIN_IMAGES.separatisti);
  }

  return new EmbedBuilder()
    .setColor(0xeab308)
    .setTitle("Stallo galattico")
    .setDescription(
      `Nessuna fazione domina i sistemi.\nIl fronte resta in bilico… per ora.\n\n${scoreLine}`,
    )
    .setImage(CONQUISTA_WIN_IMAGES.draw);
}

async function maybeFinalizeConquista(client?, payload?) {
  const systems = payload?.systems && typeof payload.systems === "object" ? payload.systems : {};
  const entries = Object.values(systems);
  if (!entries.length) return;
  if (!entries.every((s?) => normalizeId(s?.claimedBy))) return;
  clearConquistaTimeout();
  const scores = countFactionConquistaClaims(systems);
  const winner =
    scores.repubblica === scores.separatisti
      ? null
      : scores.repubblica > scores.separatisti
        ? "repubblica"
        : "separatisti";

  let winGrant = null;
  if (winner) {
    winGrant = await grantConquistaWinTroops(client, {
      winnerFaction: winner,
    });
  }

  await setRound("conquista", {
    ...payload,
    status: "completed",
    completedAt: new Date().toISOString(),
    scores,
    winner,
    winGrant,
  });

  const guildId = normalizeId(payload.guildId);
  const hubId = chatChannelId(client, guildId) || normalizeId(payload.hubChannelId);
  if (!hubId || !client) return;
  const hub = client.channels.cache.get(hubId) || (await client.channels.fetch(hubId).catch(() => null));
  if (!hub?.send) return;

  const content =
    winner === "repubblica"
      ? "🔵 La **Repubblica** conquista il settore!"
      : winner === "separatisti"
        ? "🟣 I **Separatisti** conquistano il settore!"
        : "⚖️ Nessun vincitore — settore in stallo.";

  await hub
    .send({
      content,
      embeds: [buildConquistaWinAnnounceEmbed({ winner, scores, winGrant })],
    })
    .catch(() => null);
}

async function startConquista(client?, { channelId = null, force = false } = {}) {
  if (!force && !canAutoSpawnFeature(client, FEATURES.GAME_CONQUISTA)) return { ok: false, error: "gated" };
  const existing = await getActiveRound("conquista");
  if (String(existing?.payload?.status || "") === "active") return { ok: false, error: "already_active" };

  const targetCtx = await resolveSpawnTarget(client, channelId);
  const guildId = targetCtx.guildId;
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return { ok: false, error: "no_guild" };

  const hubId = chatChannelId(client, guildId) || targetCtx.channelId;
  const hub =
    guild.channels.cache.get(hubId) || (await guild.channels.fetch(hubId).catch(() => null));
  if (!hub?.isTextBased?.()) return { ok: false, error: "bad_hub" };

  const channels = shuffleCopy(await listPinnedCommunityTextChannels(guild));
  if (!channels.length) return { ok: false, error: "no_target_channels" };

  const planets = shuffleCopy(SCOVA_PLANETS);
  const pairCount = Math.min(channels.length, planets.length);
  if (!pairCount) return { ok: false, error: "no_planets" };

  const pingMsg = await pingMinigamesRole(client, hub);
  const hubMsg = await hub
    .send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xc2410c)
          .setTitle("Conquista il sistema")
          .setDescription(
            "I sistemi sono apparsi nei canali **Community** e **Pinned**.\n" +
              `Repubblica e Separatisti: reagite con ${CONQUISTA_CLAIM_REACT} per rivendicarli.\n` +
              `Ogni sistema vale **100 exp**. Max **${CONQUISTA_MAX_PER_USER}** a testa.\n` +
              `Hai **${Math.round(CONQUISTA_DURATION_MS / 60000)} minuti**.\n` +
              `La fazione vincente riceve **+${CONQUISTA_WIN_UNIT_QTY} Cloni/Droidi** nell'esercito di fazione.`,
          )
          .setImage(CONQUISTA_HUB_IMAGE),
      ],
    })
    .catch(() => null);
  if (!hubMsg) return { ok: false, error: "hub_send_failed" };

  const systems = {};
  let spawned = 0;
  for (let i = 0; i < pairCount; i += 1) {
    const channel = channels[i];
    const planet = planets[i];
    const systemKey = `${Date.now().toString(36)}${i.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const claim = buildConquistaClaimId(systemKey);
    const msg = await channel
      .send({
        embeds: [conquistaSystemEmbed(planet)],
      })
      .catch(() => null);
    if (!msg) continue;
    await seedClaimReaction(msg, CONQUISTA_CLAIM_REACT);
    systems[systemKey] = {
      planetId: planet.id,
      planetName: planet.name,
      channelId: channel.id,
      messageId: msg.id,
      claimedBy: null,
      claimedFaction: null,
      customId: claim.customId,
    };
    spawned += 1;
  }

  if (!spawned) {
    await hubMsg.delete().catch(() => null);
    await setRound("conquista", { status: "aborted", kind: "conquista", guildId, error: "spawn_failed" });
    return { ok: false, error: "spawn_failed" };
  }

  await setRound("conquista", {
    status: "active",
    kind: "conquista",
    guildId,
    hubChannelId: hub.id,
    hubMessageId: hubMsg.id,
    rolePingMessageId: pingMsg?.id || null,
    systems,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + CONQUISTA_DURATION_MS).toISOString(),
  });
  scheduleConquistaTimeout(client, CONQUISTA_DURATION_MS);
  return { ok: true, spawned, hubChannelId: hub.id };
}

async function handleConquistaButton(interaction?, parts?) {
  const action = parts[2];
  const systemKey = String(parts[3] || "");
  if (action !== "claim" || !systemKey) return false;

  const round = await getActiveRound("conquista");
  if (!round?.payload || round.payload.status !== "active") {
    await interaction.reply({ content: "Round di conquista già chiuso.", flags: 1 << 6 }).catch(() => null);
    return true;
  }

  const systems = { ...(round.payload.systems || {}) };
  const system = systems[systemKey];
  if (!system) {
    await interaction.reply({ content: "Questo sistema non fa parte del round attivo.", flags: 1 << 6 }).catch(() => null);
    return true;
  }
  if (normalizeId(system.messageId) && normalizeId(interaction.message?.id) && normalizeId(system.messageId) !== normalizeId(interaction.message.id)) {
    await interaction.reply({ content: "Messaggio non più valido.", flags: 1 << 6 }).catch(() => null);
    return true;
  }
  if (normalizeId(system.claimedBy)) {
    await interaction.reply({ content: "Sistema già conquistato.", flags: 1 << 6 }).catch(() => null);
    return true;
  }

  const faction = await resolveStarWarsFactionId(interaction.client, interaction.guildId, interaction.user.id);
  if (!faction) {
    await interaction.reply({ content: UNSORTED_MG_MSG, flags: 1 << 6 }).catch(() => null);
    return true;
  }

  const lock = `conquista:${systemKey}`;
  if (claimLocks.has(lock)) {
    await interaction.reply({ content: "Qualcun altro sta rivendicando questo sistema…", flags: 1 << 6 }).catch(() => null);
    return true;
  }
  claimLocks.add(lock);
  try {
    const fresh = await getActiveRound("conquista");
    if (!fresh?.payload || fresh.payload.status !== "active") {
      await interaction.reply({ content: "Round di conquista già chiuso.", flags: 1 << 6 }).catch(() => null);
      return true;
    }
    const freshSystems = { ...(fresh.payload.systems || {}) };
    const target = freshSystems[systemKey];
    if (!target || normalizeId(target.claimedBy)) {
      await interaction.reply({ content: "Sistema già conquistato.", flags: 1 << 6 }).catch(() => null);
      return true;
    }
    if (countUserConquistaClaims(freshSystems, interaction.user.id) >= CONQUISTA_MAX_PER_USER) {
      await interaction
        .reply({ content: `Hai già conquistato ${CONQUISTA_MAX_PER_USER} sistemi in questo round.`, flags: 1 << 6 })
        .catch(() => null);
      return true;
    }

    const planet = SCOVA_PLANETS.find((p?) => p.id === target.planetId) || {
      id: target.planetId,
      name: target.planetName || "Sistema",
    };
    target.claimedBy = interaction.user.id;
    target.claimedFaction = faction;
    target.claimedAt = new Date().toISOString();
    freshSystems[systemKey] = target;
    const nextPayload = { ...fresh.payload, systems: freshSystems };
    await setRound("conquista", nextPayload);

    await grantStarWarsMinigameWinReward(interaction.client, {
      guildId: walletGuildId(interaction.client) || interaction.guildId,
      userId: interaction.user.id,
      reason: "conquista",
      grant: { exp: 100 },
    });

    /* come find-bot: l’embed del sistema sparisce subito al claim */
    await interaction.message?.delete?.().catch(() => null);

    /* nel canale nascosto solo ACK ephemeral; l’announce pubblico va in chat hub */
    await interaction
      .reply({
        content: `🛰️ Hai conquistato **${planet.name}** per la **${conquistaFactionLabel(faction)}**! (+100 exp)`,
        flags: 1 << 6,
      })
      .catch(() => null);

    const hubId =
      normalizeId(fresh.payload.hubChannelId) ||
      chatChannelId(interaction.client, fresh.payload.guildId || interaction.guildId);
    if (hubId) {
      const hub =
        interaction.client.channels.cache.get(hubId) ||
        (await interaction.client.channels.fetch(hubId).catch(() => null));
      if (hub?.send) {
        await hub
          .send({
            content: `🛰️ <@${interaction.user.id}> conquista **${planet.name}** per la **${conquistaFactionLabel(faction)}**! (+100 exp)`,
          })
          .catch(() => null);
      }
    }

    await maybeFinalizeConquista(interaction.client, nextPayload);
    return true;
  } finally {
    claimLocks.delete(lock);
  }
}

/** @deprecated comando +conquista rimosso */
async function tryConquistaCommand() {
  return false;
}

/* ——— Deck PG / Reliquie ——— */
const {
  pickRandomReliquie,
  findReliquieByGuess,
  reliquieImageUrl,
  getReliquieById,
} = require("../../Utils/Eventi/starWarsReliquieCatalog") as typeof import("../../Utils/Eventi/starWarsReliquieCatalog");
const {
  pickRandomPg,
  findPgByGuess,
  getPgById,
  pgImageUrl,
} = require("../../Utils/Eventi/starWarsPgCatalog") as typeof import("../../Utils/Eventi/starWarsPgCatalog");

async function spawnDeckDrop(client?, kind?, { channelId = null, force = false } = {}) {
  const isPg = kind === "pg";
  const feature = isPg ? FEATURES.GAME_COLLEZIONA_PG : FEATURES.GAME_RELIQUIE;
  if (!force && !canAutoSpawnFeature(client, feature)) return { ok: false, error: "gated" };

  const item = isPg ? pickRandomPg() : pickRandomReliquie();
  if (!item?.id) return { ok: false, error: "no_item" };

  const existing = await getActiveRound(isPg ? "deck_pg" : "deck_relic");
  if (String(existing?.payload?.status || "") === "active") return { ok: false, error: "already_active" };

  const targetCtx = await resolveSpawnTarget(client, channelId);
  const guildId = targetCtx.guildId;
  const chId = targetCtx.channelId;
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  const channel = guild?.channels?.cache?.get(chId) || (await guild?.channels?.fetch?.(chId).catch(() => null));
  if (!channel?.isTextBased?.()) return { ok: false, error: "bad_channel" };

  const roundKind = isPg ? "deck_pg" : "deck_relic";
  const image = isPg ? pgImageUrl(item.id) : reliquieImageUrl(item.id);
  await pingMinigamesRole(client, channel);
  const embed = new EmbedBuilder()
    .setColor(isPg ? 0x2f6fed : 0xc9a227)
    .setTitle(isPg ? `Colleziona PG — ${item.name}` : `Colleziona reliquie — ${item.name}`)
    .setDescription(
      `**${item.name}**\nPrimo a scrivere il nome in chat se lo aggiunge al deck!`,
    );
  if (image) embed.setImage(image);

  const msg = await channel.send({ embeds: [embed] }).catch(() => null);
  if (!msg) return { ok: false, error: "send_failed" };

  await setRound(roundKind, {
    status: "active",
    kind: roundKind,
    itemId: item.id,
    label: item.name,
    messageId: msg.id,
    channelId: channel.id,
    guildId,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + DECK_DURATION_MS).toISOString(),
  });
  scheduleDeckTimeout(client, roundKind, DECK_DURATION_MS);
  return { ok: true, itemId: item.id, name: item.name };
}

async function tryDeckMessage(message?, client?) {
  for (const kind of ["deck_pg", "deck_relic"]) {
    const round = await getActiveRound(kind);
    if (!round?.payload || round.payload.status !== "active") continue;
    if (normalizeId(message.channelId) !== normalizeId(round.payload.channelId)) continue;

    const isPg = kind === "deck_pg";
    const matched = isPg
      ? findPgByGuess(message.content)
      : findReliquieByGuess(message.content);
    if (!matched) continue;
    if (matched.id !== round.payload.itemId) {
      await reactSwWrong(message);
      return true;
    }

    if (!(await isStarWarsSortedParticipant(client || message.client, message.guildId, message.author.id))) {
      await message.reply(UNSORTED_MG_MSG).catch(() => null);
      return true;
    }

    const claimed = await claimRound(kind, message.author.id);
    if (!claimed) {
      await reactSwWrong(message);
      await message.reply("Qualcun altro è stato più veloce.").catch(() => null);
      return true;
    }
    clearDeckTimeout(kind);

    const item = isPg ? getPgById(matched.id) : getReliquieById(matched.id);
    const label = item?.name || round.payload.label || matched.name;
    const field = isPg ? "deckPG" : "deckReliquie";
    const { ROOT, getStarWarsWallet } = require("./starWarsEventWalletService") as typeof import("./starWarsEventWalletService");
    const walletGid = walletGuildId(client || message.client) || normalizeId(message.guildId);
    const before = await getStarWarsWallet(walletGid, message.author.id);
    const alreadyOwned = (Array.isArray(before?.[field]) ? before[field] : []).includes(matched.id);

    await ActivityUserProfile.findOneAndUpdate(
      { guildId: walletGid, userId: message.author.id },
      {
        $addToSet: { [`${ROOT}.${field}`]: matched.id },
        $set: { [`${ROOT}.updatedAt`]: new Date().toISOString() },
        $setOnInsert: { guildId: walletGid, userId: message.author.id },
      },
      { upsert: true },
    ).catch(() => null);

    await grantStarWarsMinigameWinReward(client, {
      guildId: walletGid,
      userId: message.author.id,
      reason: kind,
      grant: { crateId: "solare", crateQty: 1, exp: 100 },
    });

    const boardMsgId = normalizeId(round.payload.messageId);
    if (boardMsgId && message.channel?.messages?.fetch) {
      const board = await message.channel.messages.fetch(boardMsgId).catch(() => null);
      if (board?.edit) {
        const done = new EmbedBuilder()
          .setColor(0x22c55e)
          .setTitle(isPg ? "PG reclamato" : "Reliquia reclamata")
          .setDescription(`**${label}** — trovato da <@${message.author.id}>`);
        const winImg = isPg ? pgImageUrl(matched.id) : reliquieImageUrl(matched.id);
        if (winImg) done.setImage(winImg);
        await board.edit({ embeds: [done] }).catch(() => null);
      }
    }

    await reactSwWin(message);
    await message
      .reply(
        alreadyOwned
          ? `✨ <@${message.author.id}> indovina **${label}**! (+${formatCrateMention("solare", 1, { open: true })} + 100 exp) — già nel tuo deck.`
          : `✨ <@${message.author.id}> reclama **${label}**! (+${formatCrateMention("solare", 1, { open: true })} + 100 exp) — aggiunta al deck profilo.`,
      )
    .catch(() => null);
    return true;
  }
  return false;
}

/** Scommesse Podracer rimosse — niente +punta. */
async function tryPuntaCommand() {
  return false;
}

/* ——— Staff spawn + loop ——— */
async function staffSpawn(client?, kind?, channelId?) {
  switch (kind) {
    case "podrace":
      return spawnReactGame(client, "podrace", { channelId, force: true });
    case "ewok":
      return spawnHuntGame(client, "ewok", { channelId, force: true });
    case "olocron":
      return spawnHuntGame(client, "olocron", { channelId, force: true });
    case "ordine66":
      return startOrdine66(client, { channelId, force: true });
    case "cacciatore":
    case "cacciatore_taglie":
      return startCacciatoreTaglie(client, { channelId, force: true });
    case "scova":
      return startScovaPianeta(client, { channelId, force: true });
    case "attacca_base":
      return startAttaccaBase(client, { channelId, force: true });
    case "convoglio":
      return startConvoglio(client, { channelId, force: true });
    case "conquista":
      return startConquista(client, { force: true });
    case "pg":
      return spawnDeckDrop(client, "pg", { channelId, force: true });
    case "reliquie":
      return spawnDeckDrop(client, "relic", { channelId, force: true });
    default:
      return { ok: false, error: "unknown_kind" };
  }
}

/** Spawn da rotazione chat 15′ (stessi starter dello staff, senza force). */
async function startSpecialFromRotation(client?, kind?, { channelId = null } = {}) {
  const k = String(kind || "").trim();
  switch (k) {
    case "podrace":
      return spawnReactGame(client, "podrace", { channelId, force: false });
    case "ewok":
      return spawnHuntGame(client, "ewok", { channelId, force: false });
    case "olocron":
      return spawnHuntGame(client, "olocron", { channelId, force: false });
    case "ordine66":
      return startOrdine66(client, { channelId, force: false });
    case "cacciatore":
      return startCacciatoreTaglie(client, { channelId, force: false });
    case "scova":
      return startScovaPianeta(client, { channelId, force: false });
    case "attacca_base":
      return startAttaccaBase(client, { channelId, force: false });
    case "convoglio":
      return startConvoglio(client, { channelId, force: false });
    case "conquista":
      return startConquista(client, { force: false });
    case "pg":
      return spawnDeckDrop(client, "pg", { channelId, force: false });
    case "reliquie":
      return spawnDeckDrop(client, "relic", { channelId, force: false });
    default:
      return { ok: false, error: "unknown_kind" };
  }
}

/** Solo sync ruoli calendario (spawn speciali = rotazione 15′ chat). */
async function tickCalendarRoleSync(client?) {
  const flags = getRuntimeFlags(client);
  if (!flags.enabled) return;
  try {
    const { syncStarWarsCalendarRoleNames } = require("./starWarsCalendarRoleSync") as typeof import("./starWarsCalendarRoleSync");
    await syncStarWarsCalendarRoleNames(client);
  } catch (_) {}
  try {
    const { maybeAnnounceDuePeiStandings } = require("./starWarsPeiStandingService") as typeof import("./starWarsPeiStandingService");
    await maybeAnnounceDuePeiStandings(client);
  } catch (_) {}
  try {
    const { maybeAnnounceDuePhasePodiums } = require("./starWarsPhasePodiumService") as typeof import("./starWarsPhasePodiumService");
    await maybeAnnounceDuePhasePodiums(client);
  } catch (_) {}
  try {
    const { settleMinieraKyberIfDue } = require("./starWarsSiteGamesService") as typeof import("./starWarsSiteGamesService");
    await settleMinieraKyberIfDue(client);
  } catch (_) {}
}

/* ——— Catch-up dopo riavvio (come i minigames classici): risposte perse + scaduti ——— */
function snowflakeAfter(messageId?, afterId?) {
  const mid = normalizeId(messageId);
  const aid = normalizeId(afterId);
  if (!aid) return true;
  if (!mid) return false;
  try {
    return BigInt(mid) > BigInt(aid);
  } catch (_) {
    return mid !== aid;
  }
}

function messageMentionsUserId(message?, userId?) {
  const targetId = normalizeId(userId);
  if (!targetId || !message) return false;
  const mentionColl = message.mentions?.users;
  const fromApi = [...(mentionColl?.values?.() || mentionColl?.cache?.values?.() || [])].some(
    (u?) => normalizeId(u?.id) === targetId,
  );
  if (fromApi) return true;
  const content = String(message.content || "");
  return content.includes(`<@${targetId}>`) || content.includes(`<@!${targetId}>`);
}

async function resolveSwRoundChannel(client?, channelId?) {
  const chId = normalizeId(channelId);
  if (!client || !chId) return null;
  const channel = client.channels.cache.get(chId) || (await client.channels.fetch(chId).catch(() => null));
  return channel?.messages?.fetch ? channel : null;
}

async function fetchSwCatchupMessages(channel?, { afterId = null, startedAt = null, endsAt = null, afterTs = null, limit = 100 } = {}) {
  if (!channel?.messages?.fetch) return [];
  const batch = await channel.messages.fetch({ limit: Math.max(20, Math.min(100, Number(limit) || 100)) }).catch(() => null);
  if (!batch?.size) return [];
  const startMs = startedAt ? new Date(startedAt).getTime() : NaN;
  const endMs = endsAt ? new Date(endsAt).getTime() : NaN;
  const afterMs = afterTs ? new Date(afterTs).getTime() : NaN;
  return [...batch.values()]
    .filter((m?) => {
      if (!m || m.author?.bot || m.system || m.webhookId) return false;
      if (!snowflakeAfter(m.id, afterId)) return false;
      const ts = Number(m.createdTimestamp || 0);
      if (Number.isFinite(startMs) && ts && ts < startMs - 2000) return false;
      if (Number.isFinite(endMs) && ts && ts > endMs + 1500) return false;
      if (Number.isFinite(afterMs) && ts && ts <= afterMs + 250) return false;
      return true;
    })
    .sort(
      (a?, b?) =>
        Number(a.createdTimestamp || 0) - Number(b.createdTimestamp || 0) ||
        String(a.id).localeCompare(String(b.id)),
    );
}

async function catchUpOrdine66FromHistory(client?) {
  const round = await getActiveRound("ordine66");
  if (!round?.payload || round.payload.status !== "active") return false;
  const payload = round.payload;
  const targetId = normalizeId(payload.targetId);
  if (!targetId) return false;
  const channel = await resolveSwRoundChannel(client, payload.channelId);
  if (!channel) return false;
  const messages = await fetchSwCatchupMessages(channel, {
    afterId: payload.hubMessageId || payload.rolePingMessageId,
    startedAt: payload.createdAt,
    endsAt: payload.expiresAt,
  });
  for (const msg of messages) {
    if (normalizeId(msg.author?.id) === targetId) continue;
    if (!messageMentionsUserId(msg, targetId)) continue;
    const ok = await tryOrdine66Mention(msg, client);
    if (ok) {
      const fresh = await getActiveRound("ordine66");
      if (!fresh || fresh.payload?.status !== "active") {
        global.logger?.info?.(`[SW MG] catch-up win ordine66 from ${msg.author?.id}`);
        return true;
      }
    }
  }
  return false;
}

async function catchUpCacciatoreFromHistory(client?) {
  const round = await getActiveRound("cacciatore");
  if (!round?.payload || round.payload.status !== "active") return false;
  const payload = round.payload;
  const targetId = normalizeId(payload.targetId);
  if (!targetId) return false;
  const channel = await resolveSwRoundChannel(client, payload.channelId);
  if (!channel) return false;
  const messages = await fetchSwCatchupMessages(channel, {
    afterId: payload.hubMessageId || payload.rolePingMessageId,
    startedAt: payload.createdAt,
    endsAt: payload.expiresAt,
  });
  for (const msg of messages) {
    if (!messageMentionsUserId(msg, targetId)) continue;
    const ok = await tryCacciatoreMention(msg, client);
    if (ok) {
      const fresh = await getActiveRound("cacciatore");
      if (!fresh || fresh.payload?.status !== "active") {
        global.logger?.info?.(`[SW MG] catch-up win cacciatore from ${msg.author?.id}`);
        return true;
      }
    }
  }
  return false;
}

async function catchUpScovaFromHistory(client?) {
  const round = await getActiveRound("scova");
  if (!round?.payload || round.payload.status !== "active") return false;
  const payload = round.payload;
  const answerId = normalizeId(payload.planetId || payload.answer).toLowerCase();
  if (!answerId) return false;
  const channel = await resolveSwRoundChannel(client, payload.channelId);
  if (!channel) return false;
  const messages = await fetchSwCatchupMessages(channel, {
    afterId: payload.hubMessageId || payload.rolePingMessageId || payload.messageId,
    startedAt: payload.createdAt,
    endsAt: payload.expiresAt,
  });
  for (const msg of messages) {
    const guess = findScovaPlanetByGuess(msg.content);
    if (!guess || guess.id !== answerId) continue;
    const ok = await tryScovaMessage(msg, client);
    if (ok) {
      const fresh = await getActiveRound("scova");
      if (!fresh || fresh.payload?.status !== "active") {
        global.logger?.info?.(`[SW MG] catch-up win scova from ${msg.author?.id}`);
        return true;
      }
    }
  }
  return false;
}

async function catchUpDeckFromHistory(client?, kind?) {
  const round = await getActiveRound(kind);
  if (!round?.payload || round.payload.status !== "active") return false;
  const payload = round.payload;
  const itemId = normalizeId(payload.itemId).toLowerCase();
  if (!itemId) return false;
  const isPg = kind === "deck_pg";
  const channel = await resolveSwRoundChannel(client, payload.channelId);
  if (!channel) return false;
  const messages = await fetchSwCatchupMessages(channel, {
    afterId: payload.messageId || payload.hubMessageId,
    startedAt: payload.createdAt,
    endsAt: payload.expiresAt,
  });
  for (const msg of messages) {
    const matched = isPg ? findPgByGuess(msg.content) : findReliquieByGuess(msg.content);
    if (!matched || matched.id !== itemId) continue;
    const ok = await tryDeckMessage(msg, client);
    if (ok) {
      const fresh = await getActiveRound(kind);
      if (!fresh || fresh.payload?.status !== "active") {
        global.logger?.info?.(`[SW MG] catch-up win ${kind} from ${msg.author?.id}`);
        return true;
      }
    }
  }
  return false;
}

async function catchUpAttaccaFromHistory(client?) {
  const round = await getActiveRound("attacca_base");
  if (!round?.payload || round.payload.status !== "active") return false;
  const payload = round.payload;
  const channel = await resolveSwRoundChannel(client, payload.channelId);
  if (!channel) return false;
  const messages = await fetchSwCatchupMessages(channel, {
    afterId: payload.boardMessageId || payload.messageId,
    startedAt: payload.createdAt,
    endsAt: payload.expiresAt,
    afterTs: payload.lastHitAt || null,
  });
  let applied = 0;
  for (const msg of messages) {
    const text = String(msg.content || "").trim();
    if (text.length < ATTACCA_MIN_CHARS) continue;
    const before = await getActiveRound("attacca_base");
    if (!before?.payload || before.payload.status !== "active") {
      global.logger?.info?.(`[SW MG] catch-up attacca completed after ${applied} hits`);
      return true;
    }
    const ok = await tryAttaccaBaseMessage(msg, client);
    if (ok) applied += 1;
    const after = await getActiveRound("attacca_base");
    if (!after || after.payload?.status !== "active") {
      global.logger?.info?.(`[SW MG] catch-up win attacca_base from ${msg.author?.id}`);
      return true;
    }
  }
  if (applied) global.logger?.info?.(`[SW MG] catch-up attacca applied ${applied} hits`);
  return false;
}

async function listReactionClaimUsers(message?, emoji?, client?) {
  if (!message?.reactions?.cache || !emoji) return [];
  const reaction =
    [...(message.reactions.cache.values() || [])].find((row?) => emojiNameMatches(row, emoji)) || null;
  if (!reaction) return [];
  const users = await reaction.users.fetch().catch(() => null);
  if (!users?.size) return [];
  const botId = normalizeId(client?.user?.id);
  return [...users.values()]
    .filter((u?) => u && !u.bot && normalizeId(u.id) !== botId)
    .sort((a?, b?) => String(a.id).localeCompare(String(b.id)))
    .map((user?) => ({ user, reaction }));
}

async function catchUpPodraceFromHistory(client?) {
  const kind = "podrace";
  const round = await getActiveRound(kind);
  if (!round?.payload || round.payload.status !== "active") return false;
  const payload = round.payload;
  const meta = REACT_GAMES[kind];
  const messageId = normalizeId(payload.messageId);
  if (!meta || !messageId) return false;
  const channel = await resolveSwRoundChannel(client, payload.channelId);
  if (!channel) return false;
  const msg = await channel.messages.fetch(messageId).catch(() => null);
  if (!msg) return false;
  const candidates = await listReactionClaimUsers(msg, meta.emoji, client);
  for (const { user, reaction } of candidates) {
    const fakeReaction = { ...reaction, message: msg, emoji: reaction.emoji, users: reaction.users };
    const ok = await handleStarWarsReaction(client, fakeReaction, user);
    if (ok) {
      const fresh = await getActiveRound(kind);
      if (!fresh || fresh.payload?.status !== "active") {
        global.logger?.info?.(`[SW MG] catch-up win podrace from ${user.id}`);
        return true;
      }
    }
  }
  return false;
}

async function catchUpHuntFromReactions(client?, kind?) {
  const meta = HUNT_GAMES[kind];
  const round = await getActiveRound(kind);
  if (!meta || !round?.payload || round.payload.status !== "active") return false;
  const channel = await resolveSwRoundChannel(client, round.payload.targetChannelId || round.payload.channelId);
  const messageId = normalizeId(round.payload.messageId);
  if (!channel || !messageId) return false;
  const msg = await channel.messages.fetch(messageId).catch(() => null);
  if (!msg) return false;
  const candidates = await listReactionClaimUsers(msg, meta.emoji, client);
  for (const { user, reaction } of candidates) {
    const fakeReaction = { ...reaction, message: msg, emoji: reaction.emoji, users: reaction.users };
    const ok = await tryButtonGameClaimFromReaction(client, fakeReaction, user);
    if (ok) {
      const fresh = await getActiveRound(kind);
      if (!fresh || fresh.payload?.status !== "active") {
        global.logger?.info?.(`[SW MG] catch-up win ${kind} reaction from ${user.id}`);
        return true;
      }
    }
  }
  return false;
}

async function catchUpConquistaFromReactions(client?) {
  const round = await getActiveRound("conquista");
  if (!round?.payload || round.payload.status !== "active") return false;
  const systems = round.payload.systems && typeof round.payload.systems === "object" ? round.payload.systems : {};
  let claimedAny = false;
  for (const [systemKey, system] of Object.entries(systems)) {
    if (normalizeId(system?.claimedBy)) continue;
    const channel = await resolveSwRoundChannel(client, system?.channelId);
    const messageId = normalizeId(system?.messageId);
    if (!channel || !messageId) continue;
    const msg = await channel.messages.fetch(messageId).catch(() => null);
    if (!msg) continue;
    const candidates = await listReactionClaimUsers(msg, CONQUISTA_CLAIM_REACT, client);
    for (const { user, reaction } of candidates) {
      const fakeReaction = { ...reaction, message: msg, emoji: reaction.emoji, users: reaction.users };
      const ok = await tryButtonGameClaimFromReaction(client, fakeReaction, user);
      if (!ok) continue;
      claimedAny = true;
      break;
    }
    /* un sistema alla volta: ricarica stato prima del prossimo */
    const fresh = await getActiveRound("conquista");
    if (!fresh?.payload || fresh.payload.status !== "active") {
      global.logger?.info?.(`[SW MG] catch-up conquista settled via reactions`);
      return true;
    }
  }
  if (claimedAny) global.logger?.info?.(`[SW MG] catch-up conquista applied reaction claims`);
  /* conquista resta active finché non finiscono i sistemi / timeout */
  return false;
}

async function catchUpConvoglioFromReactions(client?) {
  const round = await getActiveRound("convoglio");
  if (!round?.payload || round.payload.status !== "active") return false;
  const channel = await resolveSwRoundChannel(client, round.payload.channelId);
  const messageId = normalizeId(round.payload.messageId);
  if (!channel || !messageId) return false;
  const msg = await channel.messages.fetch(messageId).catch(() => null);
  if (!msg) return false;

  const continueUsers = await listReactionClaimUsers(msg, CONVOGLIO_CONTINUE_REACT, client);
  const interceptUsers = await listReactionClaimUsers(msg, CONVOGLIO_INTERCEPT_REACT, client);
  const merged = [
    ...interceptUsers.map((x?) => ({ ...x, emoji: CONVOGLIO_INTERCEPT_REACT })),
    ...continueUsers.map((x?) => ({ ...x, emoji: CONVOGLIO_CONTINUE_REACT })),
  ].sort((a?, b?) => String(a.user.id).localeCompare(String(b.user.id)));

  for (const { user, reaction, emoji } of merged) {
    const fakeReaction = {
      ...reaction,
      message: msg,
      emoji: { name: emoji },
      users: reaction.users,
    };
    const before = await getActiveRound("convoglio");
    if (!before?.payload || before.payload.status !== "active") return true;
    const ok = await tryButtonGameClaimFromReaction(client, fakeReaction, user);
    if (!ok) continue;
    const after = await getActiveRound("convoglio");
    if (!after || after.payload?.status !== "active") {
      global.logger?.info?.(`[SW MG] catch-up convoglio settled from ${user.id}`);
      return true;
    }
    /* hop avanzato: messaggio cambiato, stop questo pass */
    if (normalizeId(after.payload?.messageId) !== messageId) {
      global.logger?.info?.(`[SW MG] catch-up convoglio hop advanced from ${user.id}`);
      return false;
    }
  }
  return false;
}

async function catchUpSpecialRoundFromHistory(client?, kind?) {
  const k = String(kind || "");
  try {
    if (k === "ordine66") return await catchUpOrdine66FromHistory(client);
    if (k === "cacciatore") return await catchUpCacciatoreFromHistory(client);
    if (k === "scova") return await catchUpScovaFromHistory(client);
    if (k === "attacca_base") return await catchUpAttaccaFromHistory(client);
    if (k === "deck_pg" || k === "deck_relic") return await catchUpDeckFromHistory(client, k);
    if (k === "podrace") return await catchUpPodraceFromHistory(client);
    if (k === "ewok" || k === "olocron") return await catchUpHuntFromReactions(client, k);
    if (k === "conquista") return await catchUpConquistaFromReactions(client);
    if (k === "convoglio") return await catchUpConvoglioFromReactions(client);
  } catch (err) {
    global.logger?.warn?.(`[SW MG] catch-up ${k}:`, err?.message || err);
  }
  return false;
}

async function restoreActiveStarWarsTimeouts(client?) {
  if (!client) return;
  const jobs = [
    { kind: "conquista", schedule: scheduleConquistaTimeout, finalize: finalizeConquistaTimeout },
    { kind: "convoglio", schedule: scheduleConvoglioTimeout, finalize: finalizeConvoglioTimeout },
    { kind: "ordine66", schedule: scheduleOrdine66Timeout, finalize: finalizeOrdine66Timeout },
    { kind: "cacciatore", schedule: scheduleCacciatoreTimeout, finalize: finalizeCacciatoreTimeout },
    { kind: "scova", schedule: scheduleScovaTimeout, finalize: finalizeScovaTimeout },
    { kind: "attacca_base", schedule: scheduleAttaccaTimeout, finalize: finalizeAttaccaTimeout },
    { kind: "ewok", schedule: (c?, ms?) => scheduleHuntTimeout(c, "ewok", ms), finalize: (c?) => finalizeHuntTimeout(c, "ewok") },
    { kind: "olocron", schedule: (c?, ms?) => scheduleHuntTimeout(c, "olocron", ms), finalize: (c?) => finalizeHuntTimeout(c, "olocron") },
    { kind: "podrace", schedule: (c?, ms?) => scheduleReactTimeout(c, "podrace", ms), finalize: (c?) => finalizeReactTimeout(c, "podrace") },
    { kind: "deck_pg", schedule: (c?, ms?) => scheduleDeckTimeout(c, "deck_pg", ms), finalize: (c?) => finalizeDeckTimeout(c, "deck_pg") },
    { kind: "deck_relic", schedule: (c?, ms?) => scheduleDeckTimeout(c, "deck_relic", ms), finalize: (c?) => finalizeDeckTimeout(c, "deck_relic") },
  ];
  for (const job of jobs) {
    try {
      const round = await getActiveRound(job.kind);
      if (!round?.payload || round.payload.status !== "active") continue;
      const caught = await catchUpSpecialRoundFromHistory(client, job.kind);
      if (caught) {
        global.logger?.info?.(`[SW MG] restore catch-up settled kind=${job.kind}`);
        continue;
      }
      const still = await getActiveRound(job.kind);
      if (!still?.payload || still.payload.status !== "active") continue;
      const left = msUntilExpiresAt(still.payload.expiresAt, SW_EXTRA_DURATION_MS);
      if (left <= 0) {
        global.logger?.info?.(`[SW MG] restore timeout immediate finalize kind=${job.kind}`);
        await job.finalize(client);
      } else {
        global.logger?.info?.(`[SW MG] restore timeout kind=${job.kind} in ${Math.round(left / 1000)}s`);
        job.schedule(client, left);
      }
    } catch (err) {
      global.logger?.warn?.(`[SW MG] restore timeout ${job.kind}:`, err?.message || err);
    }
  }
}

function startStarWarsMinigamesLoop(client?) {
  if (!client || loopState.has(client)) return;
  loopState.add(client);
  void (async () => {
    try {
      const { syncStarWarsFactionRolesOnTestFromDb } = require("./starWarsFactionTestRoles") as typeof import("./starWarsFactionTestRoles");
      await syncStarWarsFactionRolesOnTestFromDb(client);
    } catch (_) {}
    try {
      const { syncStarWarsCalendarRoleNames } = require("./starWarsCalendarRoleSync") as typeof import("./starWarsCalendarRoleSync");
      await syncStarWarsCalendarRoleNames(client);
    } catch (_) {}
    try {
      await restoreActiveStarWarsTimeouts(client);
    } catch (err) {
      global.logger?.warn?.("[SW MG] restore timeouts:", err?.message || err);
    }
  })();
  const schedule = () => {
    const t = setTimeout(async () => {
      try {
        await tickCalendarRoleSync(client);
      } catch (err) {
        global.logger?.warn?.("[SW MG] role sync:", err?.message || err);
      }
      schedule();
    }, 60_000);
    t.unref?.();
  };
  schedule();
}

async function handleStarWarsMessage(message?, client?) {
  if (!message?.guild || message.author?.bot) return false;
  if (await tryOrdine66Mention(message, client)) return true;
  if (await tryCacciatoreMention(message, client)) return true;
  if (await tryScovaMessage(message, client)) return true;
  if (await tryAttaccaBaseMessage(message, client)) return true;
  if (await tryDeckMessage(message, client)) return true;
  return false;
}

export = {
  startStarWarsMinigamesLoop,
  staffSpawn,
  startSpecialFromRotation,
  handleStarWarsReaction,
  handleStarWarsButton,
  handleStarWarsMessage,
  tryOrdine66Mention,
  tryCacciatoreMention,
  tryPuntaCommand,
  tryConquistaCommand,
  isHighStaffMember,
  isStarWarsSortedParticipant,
  UNSORTED_MG_MSG,
};
