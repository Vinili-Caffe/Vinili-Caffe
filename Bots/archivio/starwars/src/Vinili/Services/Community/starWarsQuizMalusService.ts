/**
 * Stato/annuncio/freeze malus quiz Star Wars.
 */
"use strict";

const __path = require("path") as typeof import("path");
const __eventCoreVinili = (rel: string) => __path.join(__path.resolve(__dirname, "../../../../../../src/Vinili"), rel);

const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { SiteDocument, SITE_DOCUMENT_TYPE, ActivityUserProfile } = require(__eventCoreVinili(
  "Community/schemas/communitySchemas",
));
const IDs = require(__eventCoreVinili("Config/ids"));
const { listQuizMalus, getQuizMalus, pickRandomQuizMalus } = require("../../Utils/Eventi/starWarsQuizMalusCatalog") as typeof import("../../Utils/Eventi/starWarsQuizMalusCatalog");
const { applyMalusToQuizDisplay } = require("../../Utils/Eventi/starWarsQuizMalusTransforms") as typeof import("../../Utils/Eventi/starWarsQuizMalusTransforms");
const {
  isStarWarsEventLive,
  resolveStarWarsEventConfig,
  getTestGuildIdSafe,
} = require("../../Utils/Eventi/starWarsEventConfig") as typeof import("../../Utils/Eventi/starWarsEventConfig");
const { canPostStarWarsToGuildChat } = require("../../Utils/Eventi/starWarsRuntimeGate") as typeof import("../../Utils/Eventi/starWarsRuntimeGate");
const {
  SW_MALUS_INTERVAL_MS,
  isWithinStarWarsMalusHours,
} = require("../../Utils/Minigames/starWarsMinigameHooks") as typeof import("../../Utils/Minigames/starWarsMinigameHooks");
const { MINIGAME_EMBED_COLOR } = require(__eventCoreVinili("Minigames/services/minigameEmbeds"));
const { sendMinigameMessage } = require(__eventCoreVinili("Minigames/services/minigameDiscord"));
const { E } = require(__eventCoreVinili("../shared/emojis/emojiCatalog"));

const DOC_TYPE = SITE_DOCUMENT_TYPE.STARWARS_EVENT_STATE;
const OWNER = "__starwars_quiz_malus__";
const DEDUPE = "sw_quiz_malus_active";
const SW_FACTION_PATH = "profile.events.starwars.factionId";
/** Safety cap: se nessun minigame parte, scade comunque. */
const DEFAULT_DURATION_MS = 20 * 60 * 1000;
const MALUS_INTERVAL_MS = SW_MALUS_INTERVAL_MS;

const loopState = new WeakSet();

function normalizeId(v?) {
  return String(v || "").trim();
}

function safeInt(v?, fb = 0) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(0, n) : fb;
}

function factionLabel(fid?) {
  const f = normalizeId(fid).toLowerCase();
  if (f === "repubblica") return "Repubblica";
  if (f === "separatisti") return "Separatisti";
  return f || "sconosciuta";
}

function walletGuildId(client?) {
  try {
    const fromCfg = normalizeId(client?.config?.mainGuildId);
    if (fromCfg) return fromCfg;
  } catch (_) {}
  return normalizeId(IDs.guilds?.main);
}

function eventDiscordGuildId(client?) {
  try {
    if (resolveStarWarsEventConfig(client)?.testGuildForceLive) {
      const test = normalizeId(getTestGuildIdSafe() || IDs.guilds?.test);
      if (test) return test;
    }
  } catch (_) {}
  return normalizeId(IDs.guilds?.main);
}

function remapChannelForGuild(guildId?, channelId?) {
  const gid = normalizeId(guildId);
  const base = normalizeId(channelId);
  if (!gid || !base) return base;
  try {
    const { remapChannelIdForGuild, isTestMirrorGuild } = require(__eventCoreVinili(
      "Config/testGuildMirrorRemap",
    )) as typeof import("../../../../../../src/Vinili/Config/testGuildMirrorRemap");
    if (isTestMirrorGuild(gid)) return remapChannelIdForGuild(gid, base) || base;
  } catch (_) {}
  return base;
}

function chatChannelId(client?, guildId?) {
  const base = normalizeId(IDs.channels?.chat);
  const gid = normalizeId(guildId) || eventDiscordGuildId(client);
  return remapChannelForGuild(gid, base);
}

async function getActiveMalusDoc() {
  const doc = await SiteDocument.findOne({ docType: DOC_TYPE, ownerId: OWNER, dedupeKey: DEDUPE })
    .lean()
    .catch(() => null);
  const payload = doc?.payload && typeof doc.payload === "object" ? doc.payload : null;
  if (!payload || payload.status !== "active") return null;
  const endsAt = Date.parse(String(payload.endsAt || ""));
  if (Number.isFinite(endsAt) && endsAt <= Date.now()) {
    await clearActiveMalus("expired");
    return null;
  }
  return payload;
}

async function setActiveMalus(payload?) {
  const guildId = normalizeId(payload?.guildId) || eventDiscordGuildId() || "0";
  await SiteDocument.findOneAndUpdate(
    { docType: DOC_TYPE, ownerId: OWNER, dedupeKey: DEDUPE },
    {
      $set: { payload, updatedAt: new Date(), guildId },
      $setOnInsert: { docType: DOC_TYPE, ownerId: OWNER, dedupeKey: DEDUPE },
    },
    { upsert: true },
  ).catch(() => null);
}

async function clearActiveMalus(reason = "cleared") {
  await SiteDocument.findOneAndUpdate(
    { docType: DOC_TYPE, ownerId: OWNER, dedupeKey: DEDUPE },
    {
      $set: {
        "payload.status": "ended",
        "payload.endedReason": String(reason || "").slice(0, 40),
        "payload.endedAt": new Date().toISOString(),
        updatedAt: new Date(),
      },
    },
  ).catch(() => null);
}

async function listFactionMembers(client?, factionIds = ["repubblica", "separatisti"]) {
  const gids = [...new Set([walletGuildId(client), normalizeId(IDs.guilds?.main)].filter(Boolean))];
  const wanted = new Set((Array.isArray(factionIds) ? factionIds : []).map((f) => normalizeId(f).toLowerCase()).filter(Boolean));
  const rows = await ActivityUserProfile.find({
    guildId: gids.length === 1 ? gids[0] : { $in: gids },
    [SW_FACTION_PATH]: { $in: [...wanted] },
  })
    .select({
      userId: 1,
      [SW_FACTION_PATH]: 1,
      "profile.totals.messagesWeekly": 1,
      "profile.totals.exp.total": 1,
      "profile.totals.exp.minigame.totalExp": 1,
    })
    .lean()
    .catch(() => []);

  const byUser = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const uid = normalizeId(row?.userId);
    const fid = normalizeId(row?.profile?.events?.starwars?.factionId || row?.[SW_FACTION_PATH]).toLowerCase();
    if (!uid || !wanted.has(fid)) continue;
    const activity =
      safeInt(row?.profile?.totals?.messagesWeekly) * 10 +
      safeInt(row?.profile?.totals?.exp?.minigame?.totalExp) +
      safeInt(row?.profile?.totals?.exp?.total);
    const prev = byUser.get(uid);
    if (!prev || activity > prev.activity) byUser.set(uid, { userId: uid, factionId: fid, activity });
  }
  return [...byUser.values()];
}

/**
 * Freeze 1 più attivo + (count-1) random nella fazione.
 * Campo (sospensione) = globale su ogni fazione; Hansicle = una sola fazione.
 */
function pickFreezeTargetsForFaction(members?, count = 3) {
  const list = (Array.isArray(members) ? members : []).slice();
  if (!list.length) {
    return { userIds: [], activeUserId: null, randomUserIds: [] };
  }
  list.sort((a, b) => b.activity - a.activity || a.userId.localeCompare(b.userId));
  const activeUserId = list[0].userId;
  const rest = list.slice(1);
  for (let i = rest.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = rest[i];
    rest[i] = rest[j];
    rest[j] = t;
  }
  const needRandom = Math.max(0, count - 1);
  const randomUserIds = rest.slice(0, needRandom).map((m) => m.userId);
  return {
    userIds: [activeUserId, ...randomUserIds],
    activeUserId,
    randomUserIds,
  };
}

async function buildFreezeSelection(client?, malusId?) {
  const members = await listFactionMembers(client);
  const byFaction = { repubblica: [], separatisti: [] };
  for (const m of members) {
    if (byFaction[m.factionId]) byFaction[m.factionId].push(m);
  }
  const frozenUserIds = [];
  const frozenByFaction = {};
  const freezeDetailByFaction = {};
  let focusFaction = null;

  // Invertito: Congelamento ↔ Campo
  // Congelamento = per fazione (1+2 su ogni fazione)
  // Campo = globale (1+2 su una sola fazione)
  if (malusId === "hansicle") {
    for (const f of ["repubblica", "separatisti"]) {
      const picked = pickFreezeTargetsForFaction(byFaction[f], 3);
      if (picked.userIds.length) {
        frozenByFaction[f] = picked.userIds;
        freezeDetailByFaction[f] = picked;
        frozenUserIds.push(...picked.userIds);
      }
    }
  } else if (malusId === "sospensione") {
    const factions = ["repubblica", "separatisti"].filter((f) => byFaction[f]?.length);
    focusFaction = factions[Math.floor(Math.random() * factions.length)] || null;
    if (focusFaction) {
      const picked = pickFreezeTargetsForFaction(byFaction[focusFaction], 3);
      frozenByFaction[focusFaction] = picked.userIds;
      freezeDetailByFaction[focusFaction] = picked;
      frozenUserIds.push(...picked.userIds);
    }
  }

  return {
    frozenUserIds: [...new Set(frozenUserIds)],
    frozenByFaction,
    freezeDetailByFaction,
    focusFaction,
  };
}

function isUserFrozenByPayload(payload?, userId?) {
  const uid = normalizeId(userId);
  if (!uid || !payload) return false;
  const list = Array.isArray(payload.frozenUserIds) ? payload.frozenUserIds : [];
  return list.map(normalizeId).includes(uid);
}

async function isUserFrozenForQuiz(userId?) {
  const active = await getActiveMalusDoc();
  if (!active) return false;
  return isUserFrozenByPayload(active, userId);
}

function buildMalusAnnounceEmbed(def?, payload?, _durationMs?) {
  const short = String(def?.short || "").trim();
  const lines = [
    `${E.VC_EXP} **Malus attivo:** ${short || def?.title || "effetto speciale"}`,
    String(def?.description || "").trim(),
  ].filter(Boolean);

  if (def.id === "hansicle") {
    lines.push(`> ${E.VC_Flame} Ambito: **per fazione** (ogni fazione)`);
  }
  if (payload?.focusFaction && (def.id === "sospensione" || def.id === "geonosiana")) {
    lines.push(
      def.id === "sospensione"
        ? `> ${E.VC_Flame} Ambito: **globale** · fazione **${factionLabel(payload.focusFaction)}**`
        : `> ${E.VC_Flame} Fazione bersaglio: **${factionLabel(payload.focusFaction)}**`,
    );
  }

  if (payload?.freezeDetailByFaction && typeof payload.freezeDetailByFaction === "object") {
    for (const [fid, detail] of Object.entries(payload.freezeDetailByFaction)) {
      const d = detail || {};
      const active = d.activeUserId ? `<@${d.activeUserId}>` : null;
      const randoms = (Array.isArray(d.randomUserIds) ? d.randomUserIds : []).map((id) => `<@${id}>`);
      const parts = [];
      if (active) parts.push(`attivo ${active}`);
      if (randoms.length) parts.push(`random ${randoms.join(", ")}`);
      if (parts.length) lines.push(`🧊 **${factionLabel(fid)}:** ${parts.join(" · ")}`);
    }
  } else if (payload?.frozenByFaction && typeof payload.frozenByFaction === "object") {
    for (const [fid, ids] of Object.entries(payload.frozenByFaction)) {
      const mentions = (Array.isArray(ids) ? ids : []).map((id) => `<@${id}>`).join(", ");
      if (mentions) lines.push(`🧊 **${factionLabel(fid)}:** ${mentions}`);
    }
  }

  lines.push(
    `> ${E.VC_pixeltime} Vale per **il prossimo minigame**, poi sparisce.`,
    `> ${E.VC_Winner} Statistiche e premi nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
  );

  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle(`${def.title} ${E.VC_Exclamation}`)
    .setDescription(lines.join("\n"));
  if (def?.artUrl) embed.setImage(String(def.artUrl));
  return embed;
}

async function announceAndActivateMalus(client?, { malusId = null, channelId = null, durationMs = DEFAULT_DURATION_MS, force = false } = {}) {
  const guildId = eventDiscordGuildId(client);
  /* Hard gate: niente malus in chat pubblica del MAIN finché publicEnabled=false. */
  if (!canPostStarWarsToGuildChat(client, guildId)) {
    return { ok: false, error: "main_locked" };
  }
  if (!force && !isStarWarsEventLive(client, new Date(), guildId)) {
    return { ok: false, error: "event_off" };
  }
  const existing = await getActiveMalusDoc();
  if (existing && !force) return { ok: false, error: "already_active", payload: existing };

  const def = malusId ? getQuizMalus(malusId) : pickRandomQuizMalus(existing?.malusId);
  if (!def) return { ok: false, error: "unknown_malus" };

  const chId = normalizeId(channelId) || chatChannelId(client, guildId);
  const channel =
    client?.channels?.cache?.get(chId) || (await client?.channels?.fetch?.(chId).catch(() => null));
  if (!channel?.isTextBased?.()) return { ok: false, error: "no_channel" };

  const channelGuildId = normalizeId(channel.guildId || channel.guild?.id);
  if (channelGuildId && !canPostStarWarsToGuildChat(client, channelGuildId)) {
    return { ok: false, error: "main_locked_channel" };
  }

  let freeze = { frozenUserIds: [], frozenByFaction: {}, freezeDetailByFaction: {}, focusFaction: null };
  if (def.freezesUsers) {
    freeze = await buildFreezeSelection(client, def.id);
  }
  let geoFaction = null;
  if (def.teamWin) {
    const members = await listFactionMembers(client);
    const factions = [...new Set(members.map((m) => m.factionId))].filter(Boolean);
    geoFaction = factions[Math.floor(Math.random() * factions.length)] || "repubblica";
  }

  const dur = Math.max(60_000, Number(durationMs) || DEFAULT_DURATION_MS);
  const now = Date.now();
  const payload = {
    status: "active",
    malusId: def.id,
    title: def.title,
    guildId,
    channelId: chId,
    startedAt: new Date(now).toISOString(),
    endsAt: new Date(now + dur).toISOString(),
    oneShot: true,
    attachedToGame: false,
    frozenUserIds: freeze.frozenUserIds,
    frozenByFaction: freeze.frozenByFaction,
    freezeDetailByFaction: freeze.freezeDetailByFaction,
    focusFaction: freeze.focusFaction || geoFaction,
    geoFactionId: geoFaction,
  };

  await setActiveMalus(payload);

  const embed = buildMalusAnnounceEmbed(def, payload, dur);

  const msg = await sendMinigameMessage(channel, {
    embeds: [embed],
  }).catch(() => null);

  if (msg?.id) {
    payload.announceMessageId = msg.id;
    await setActiveMalus(payload);
  }

  return { ok: true, payload, def, messageId: msg?.id || null };
}

async function resolveMalusForQuizStart(client?) {
  const active = await getActiveMalusDoc();
  if (!active) return null;
  const def = getQuizMalus(active.malusId);
  if (!def) return null;
  if (!active.attachedToGame) {
    active.attachedToGame = true;
    await setActiveMalus(active);
  }
  return { ...active, def };
}

/** Marca il malus come agganciato al minigame appena partito (one-shot). */
async function attachMalusToStartedGame(client?, gameType?) {
  const active = await getActiveMalusDoc();
  if (!active) return null;
  const def = getQuizMalus(active.malusId);
  if (!def) return null;
  if (!active.attachedToGame) {
    active.attachedToGame = true;
    active.attachedGameType = String(gameType || "");
    await setActiveMalus(active);
  }
  return { ...active, def };
}

/** Dopo fine minigame: se il malus era one-shot e agganciato, chiudi. */
async function consumeMalusAfterGame(game?) {
  try {
    const active = await getActiveMalusDoc();
    if (!active) return false;
    const gameHadMalus = Boolean(game?.malusId) || Boolean(game?.swMalusAttached);
    if (active.oneShot && (active.attachedToGame || gameHadMalus)) {
      await clearActiveMalus("consumed_one_shot");
      return true;
    }
  } catch (err) {
    global.logger?.warn?.("[SW Quiz Malus] consume:", err?.message || err);
  }
  return false;
}

function applyActiveMalusToPrepared(prepared?, malus?) {
  if (!prepared || !malus?.def?.transformsText) {
    return {
      displayQuestion: prepared?.question,
      displayChoices: prepared?.choices || [],
      malusId: malus?.malusId || null,
    };
  }
  const transformed = applyMalusToQuizDisplay(malus.malusId, prepared.question, prepared.choices || []);
  return {
    displayQuestion: transformed.question,
    displayChoices: transformed.choices,
    malusId: malus.malusId,
  };
}

/**
 * Gestione risposta con malus: freeze / mente geonosiana.
 * @returns {{ blocked?: boolean, pendingTeam?: boolean, teamReady?: boolean, correctUserIds?: string[] } | null}
 */
async function evaluateStarWarsQuizAnswerGates(message?, game?, isCorrect?) {
  const uid = normalizeId(message?.author?.id);
  if (!uid) return null;

  const malusId = normalizeId(game?.malusId).toLowerCase();
  if (Array.isArray(game.frozenUserIds) && game.frozenUserIds.map(normalizeId).includes(uid)) {
    await message.react("🧊").catch(() => null);
    return { blocked: true };
  }
  // Mongo freeze solo con malus freeze (o freeze list già sul game sopra)
  if (malusId === "hansicle" || malusId === "sospensione") {
    if (await isUserFrozenForQuiz(uid)) {
      await message.react("🧊").catch(() => null);
      return { blocked: true };
    }
  }

  if (!malusId) return null;
  if (!isCorrect) return null;

  if (malusId === "geonosiana") {
    const needFaction = normalizeId(game.geoFactionId || game.malusFocusFaction).toLowerCase();
    const { getStarWarsWallet } = require("./starWarsEventWalletService") as typeof import("./starWarsEventWalletService");
    let userFaction = "";
    for (const gid of [...new Set([walletGuildId(message.client), normalizeId(IDs.guilds?.main), normalizeId(message.guildId)].filter(Boolean))]) {
      const wallet = await getStarWarsWallet(gid, uid);
      userFaction = normalizeId(wallet?.factionId).toLowerCase();
      if (userFaction) break;
    }
    if (!needFaction || userFaction !== needFaction) {
      await message.react("❌").catch(() => null);
      return { blocked: true, wrongFaction: true };
    }
    const set = new Set((Array.isArray(game.geonosianCorrectIds) ? game.geonosianCorrectIds : []).map(normalizeId).filter(Boolean));
    if (set.has(uid)) {
      await message.react("👌").catch(() => null);
      return { pendingTeam: true, correctUserIds: [...set] };
    }
    set.add(uid);
    game.geonosianCorrectIds = [...set];
    if (set.size < 3) {
      await message.react("✅").catch(() => null);
      await message
        .reply({
          content: `🧠 Mente Geonosiana: **${set.size}/3** risposte corrette della **${factionLabel(needFaction)}**.`,
          allowedMentions: { repliedUser: false },
        })
        .catch(() => null);
      return { pendingTeam: true, correctUserIds: [...set] };
    }
    return { teamReady: true, correctUserIds: [...set] };
  }

  return null;
}

async function maybeAnnounceRandomMalus(client?) {
  const guildId = eventDiscordGuildId(client);
  if (!canPostStarWarsToGuildChat(client, guildId)) {
    /* Se un malus era partito per errore sul main, spegnilo subito. */
    const leaked = await getActiveMalusDoc();
    if (leaked) await clearActiveMalus("main_locked");
    return { ok: false, error: "main_locked" };
  }
  if (!isStarWarsEventLive(client, new Date(), guildId)) return { ok: false, error: "event_off" };
  if (!isWithinStarWarsMalusHours()) return { ok: false, error: "outside_hours" };
  const active = await getActiveMalusDoc();
  if (active) return { ok: false, error: "already_active" };
  return announceAndActivateMalus(client, { force: false });
}

function startStarWarsQuizMalusLoop(client?) {
  if (!client || loopState.has(client)) return;
  loopState.add(client);
  const schedule = () => {
    const wait = MALUS_INTERVAL_MS;
    const t = setTimeout(async () => {
      try {
        await maybeAnnounceRandomMalus(client);
      } catch (err) {
        global.logger?.warn?.("[SW Quiz Malus] tick:", err?.message || err);
      }
      schedule();
    }, wait);
    t.unref?.();
  };
  schedule();
}

export = {
  DEFAULT_DURATION_MS,
  MALUS_INTERVAL_MS,
  listQuizMalus,
  getQuizMalus,
  getActiveMalusDoc,
  clearActiveMalus,
  announceAndActivateMalus,
  resolveMalusForQuizStart,
  attachMalusToStartedGame,
  consumeMalusAfterGame,
  applyActiveMalusToPrepared,
  evaluateStarWarsQuizAnswerGates,
  isUserFrozenForQuiz,
  startStarWarsQuizMalusLoop,
  maybeAnnounceRandomMalus,
  factionLabel,
  listFactionMembers,
};
