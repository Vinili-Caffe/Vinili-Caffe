"use strict";
const __path = require("path") as typeof import("path");
const __eventCoreVinili = (rel: string) => __path.join(__path.resolve(__dirname, "../../../../../../src/Vinili"), rel);
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField,
} = require("discord.js") as typeof import("discord.js");
const { SiteDocument, SITE_DOCUMENT_TYPE, ActivityUserProfile } = require(__eventCoreVinili("Community/schemas/communitySchemas"));
const IDs = require(__eventCoreVinili("Config/ids"));
const { FEATURES, canAutoSpawnFeature, getRuntimeFlags, isHighStaffMember } = require("../../Utils/Eventi/starWarsRuntimeGate") as typeof import("../../Utils/Eventi/starWarsRuntimeGate");
const { grantStarWarsReward } = require("./starWarsRewardsService") as typeof import("./starWarsRewardsService");

const DOC_TYPE = SITE_DOCUMENT_TYPE.STARWARS_EVENT_STATE;
const OWNER = "__starwars_mg__";
const loopState = new WeakSet();
const claimLocks = new Set();
const huntTimeouts = new Map();
const ordine66Timeouts = new Map();
const HUNT_DURATION_MS = 5 * 60 * 1000;
const ORDINE66_DURATION_MS = 15 * 60 * 1000;
const JEDI_ROLE_NAME = "༄ Jedi";
const SW_FACTION_PATH = "profile.events.starwars.factionId";

const F1_STEP_MS = 2400;
const F1_HOLD_MIN_MS = 1800;
const F1_HOLD_MAX_MS = 3200;
const F1_GO_HOLD_MS = 1800;
const PODRACE_CDN = "https://cdn.viniliecaffe.it/images/starwars";
const PODRACE_IMG_V = "20261104pr1";
const PODRACE_IMAGES = Object.freeze({
  lights1: `${PODRACE_CDN}/podrace-lights-1.jpg?v=${PODRACE_IMG_V}`,
  lights2: `${PODRACE_CDN}/podrace-lights-2.jpg?v=${PODRACE_IMG_V}`,
  lights3: `${PODRACE_CDN}/podrace-lights-3.jpg?v=${PODRACE_IMG_V}`,
  lightsGo: `${PODRACE_CDN}/podrace-lights-go.jpg?v=${PODRACE_IMG_V}`,
  start: `${PODRACE_CDN}/podrace-start.jpg?v=${PODRACE_IMG_V}`,
  win: `${PODRACE_CDN}/podrace-win.jpg?v=${PODRACE_IMG_V}`,
});

function sleep(ms?) {
  const n = Math.max(0, Number(ms) || 0);
  return new Promise((resolve?) => setTimeout(resolve, n));
}

function randomF1HoldMs() {
  return F1_HOLD_MIN_MS + Math.floor(Math.random() * (F1_HOLD_MAX_MS - F1_HOLD_MIN_MS + 1));
}

function podracerLightsEmbed(stage?) {
  const s = String(stage || "1");
  const map = {
    "1": { title: "Semaforo — 1", image: PODRACE_IMAGES.lights1, color: 0xb91c1c },
    "2": { title: "Semaforo — 2", image: PODRACE_IMAGES.lights2, color: 0xb91c1c },
    "3": { title: "Semaforo — 3", image: PODRACE_IMAGES.lights3, color: 0xb91c1c },
    go: { title: "VIA!", image: PODRACE_IMAGES.lightsGo, color: 0x16a34a },
  };
  const meta = map[s] || map["1"];
  return new EmbedBuilder().setColor(meta.color).setTitle(meta.title).setImage(meta.image);
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
  },
});

/** Hide-and-seek stile “trova il bot”: hub + messaggio/bottone nascosto in un canale a caso. */
const HUNT_CDN = "https://cdn.viniliecaffe.it/images/starwars";
const HUNT_IMG_V = "20261103it1";

const HUNT_GAMES = Object.freeze({
  ewok: {
    feature: FEATURES.MINIGAME_CACCIA_EWOK,
    title: "Caccia all'Ewok",
    crate: "alpha",
    exp: 100,
    emoji: "🐾",
    btn: "Ho trovato l'Ewok!",
    blurb: "Un Ewok si è nascosto in **un canale a caso** del server. Trova il messaggio e clicca il pulsante!",
    hiddenBlurb: "Shh… l'Ewok è qui. Chi clicca per primo vince!",
    hubImage: `${HUNT_CDN}/sw-ewok-hunt-hub.jpg?v=${HUNT_IMG_V}`,
    hiddenImage: `${HUNT_CDN}/sw-ewok-hunt-hidden.jpg?v=${HUNT_IMG_V}`,
  },
  olocron: {
    feature: FEATURES.GAME_OLOCRON,
    title: "Caccia all'Olocron",
    crate: "alpha",
    exp: 100,
    emoji: "📜",
    btn: "Prendi l'Olocron",
    blurb: "Un Olocron è apparso in **un canale a caso** del server. Trovalo e reclamalo!",
    hiddenBlurb: "Hai trovato l'Olocron. Premi il pulsante per reclamarlo!",
    hubImage: `${HUNT_CDN}/sw-olocron-hunt-hub.jpg?v=${HUNT_IMG_V}`,
    hiddenImage: `${HUNT_CDN}/sw-olocron-hunt-hidden.jpg?v=${HUNT_IMG_V}`,
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

const UNSORTED_MG_MSG = "Devi essere **smistato** nell'evento Star Wars per partecipare.";

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
    await playF1StartLights(channel);

    const embed = new EmbedBuilder()
      .setColor(0x22c55e)
      .setTitle(meta.title)
      .setDescription(
        `**VIA!**\nPrimo a reagire con ${meta.emoji} vince **cassa ${meta.crate}** + **${meta.exp} exp**.`,
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
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
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
  const round = await getActiveRound(kind);
  if (!round?.payload || round.payload.status !== "active") return;
  const payload = round.payload;
  await setRound(kind, { ...payload, status: "expired", expiredAt: new Date().toISOString() });
  await deleteHuntHiddenMessage(client, payload);
  const hubId = normalizeId(payload.hubChannelId);
  if (!hubId || !client) return;
  const hub = client.channels.cache.get(hubId) || (await client.channels.fetch(hubId).catch(() => null));
  const meta = HUNT_GAMES[kind];
  if (hub?.send && meta) {
    await hub
      .send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x6b7280)
            .setTitle(`${meta.emoji}  ${meta.title}`)
            .setDescription("Tempo scaduto: nessuno ha trovato il messaggio nascosto."),
        ],
      })
      .catch(() => null);
  }
}

function scheduleHuntTimeout(client?, kind?, durationMs = HUNT_DURATION_MS) {
  clearHuntTimeout(kind);
  const t = setTimeout(() => {
    void finalizeHuntTimeout(client, kind);
  }, Math.max(60_000, Number(durationMs) || HUNT_DURATION_MS));
  t.unref?.();
  huntTimeouts.set(String(kind), t);
}

/** Ewok / Olocron: stile “trova il bot” (hub + bottone nascosto). */
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
  const hubEmbed = new EmbedBuilder()
    .setColor(0x2f6fed)
    .setTitle(`${meta.emoji}  ${meta.title}`)
    .setDescription(
      `${meta.blurb}\n\nPremio: **cassa ${meta.crate}** + **${meta.exp} exp**.\nHai **${Math.round(durationMs / 60000)} minuti**.`,
    );
  if (meta.hubImage) hubEmbed.setImage(meta.hubImage);
  const hubMsg = await hub.send({ embeds: [hubEmbed] }).catch(() => null);

  const hiddenEmbed = new EmbedBuilder()
    .setColor(0xc9a227)
    .setTitle(`${meta.emoji}  ${meta.title}`)
    .setDescription(meta.hiddenBlurb);
  if (meta.hiddenImage) hiddenEmbed.setImage(meta.hiddenImage);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(customId).setEmoji(meta.emoji).setLabel(meta.btn).setStyle(ButtonStyle.Primary),
  );
  const hiddenMsg = await hidden.send({ embeds: [hiddenEmbed], components: [row] }).catch(() => null);
  if (!hiddenMsg) {
    await setRound(kind, { status: "aborted", kind, guildId, hubChannelId, error: "hide_send_failed" });
    return { ok: false, error: "send_failed" };
  }

  await setRound(kind, {
    status: "active",
    kind,
    guildId,
    hubChannelId,
    channelId: hubChannelId,
    targetChannelId: hidden.id,
    messageId: hiddenMsg.id,
    mainMessageId: hubMsg?.id || null,
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
    const emoji = normalizeId(reaction.emoji?.name) || reaction.emoji?.toString?.();
    if (emoji !== meta.emoji && reaction.emoji?.name !== "🏁" && reaction.emoji?.name !== "paw_prints") {
      /* allow unicode match */
      if (String(reaction.emoji?.name || "") !== meta.emoji.replace(/\ufe0f/g, "")) {
        if (meta.emoji === "🏁" && reaction.emoji?.name !== "checkered_flag" && reaction.emoji?.name !== "🏁") continue;
        if (meta.emoji === "🐾" && reaction.emoji?.name !== "paw_prints" && reaction.emoji?.name !== "🐾") continue;
      }
    }
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
      await grantStarWarsReward(client, {
        guildId,
        userId: user.id,
        reason: kind,
        grant: { crateId: meta.crate, crateQty: 1, exp: meta.exp },
      });
      const winEmbed = new EmbedBuilder()
        .setColor(0xeab308)
        .setTitle(`${meta.title} — Arrivo!`)
        .setDescription(`🏁 <@${user.id}> vince!\n**+${meta.crate}** + **${meta.exp} exp**`);
      if (meta.winImage) winEmbed.setImage(meta.winImage);
      await reaction.message
        ?.edit?.({ embeds: [winEmbed] })
        .catch(() => null);
      const ch = reaction.message?.channel;
      if (ch?.send) {
        await ch
          .send({ content: `🏁 <@${user.id}> vince **${meta.title}**! (+${meta.crate} + ${meta.exp} exp)` })
          .catch(() => null);
      }
      return true;
    } finally {
      claimLocks.delete(lock);
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
    await interaction.editReply({ content: "Round già chiuso." }).catch(() => null);
    return true;
  }
  if (normalizeId(round.payload.customId) && normalizeId(round.payload.customId) !== id) {
    await interaction.editReply({ content: "Questo messaggio non è più valido." }).catch(() => null);
    return true;
  }
  const claimed = await claimRound(kind, interaction.user.id);
  if (!claimed) {
    await interaction.editReply({ content: "Qualcun altro è stato più veloce." }).catch(() => null);
    return true;
  }
  clearHuntTimeout(kind);
  const guildId = normalizeId(interaction.guildId) || normalizeId(round.payload.guildId) || mainGuildId();
  await grantStarWarsReward(interaction.client, {
    guildId,
    userId: interaction.user.id,
    reason: kind,
    grant: { crateId: meta.crate, crateQty: 1, exp: meta.exp },
  });
  await interaction.editReply({ content: `Hai vinto! (+${meta.crate} + ${meta.exp} exp)` }).catch(() => null);
  await deleteHuntHiddenMessage(interaction.client, round.payload);
  const hubId = normalizeId(round.payload.hubChannelId || round.payload.channelId);
  if (hubId) {
    const hub =
      interaction.client.channels.cache.get(hubId) ||
      (await interaction.client.channels.fetch(hubId).catch(() => null));
    if (hub?.send) {
      await hub
        .send({
          content: `${meta.emoji} <@${interaction.user.id}> ha vinto **${meta.title}**! (+${meta.crate} + ${meta.exp} exp)`,
        })
        .catch(() => null);
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
  if (!guild?.roles?.cache) return null;
  const wanted = JEDI_ROLE_NAME.normalize("NFC").trim().toLowerCase();
  const exact = [...guild.roles.cache.values()].find(
    (r?) => String(r?.name || "").normalize("NFC").trim().toLowerCase() === wanted,
  );
  if (exact) return exact;
  return (
    [...guild.roles.cache.values()].find((r?) => {
      const bare = String(r?.name || "")
        .normalize("NFC")
        .replace(/^༄\s*/u, "")
        .trim()
        .toLowerCase();
      return bare === "jedi";
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

function clearOrdine66Timeout() {
  const t = ordine66Timeouts.get("ordine66");
  if (t) clearTimeout(t);
  ordine66Timeouts.delete("ordine66");
}

async function finalizeOrdine66Timeout(client?) {
  clearOrdine66Timeout();
  const round = await getActiveRound("ordine66");
  if (!round?.payload || round.payload.status !== "active") return;
  const payload = round.payload;
  await setRound("ordine66", { ...payload, status: "expired", expiredAt: new Date().toISOString() });
  const guildId = normalizeId(payload.guildId);
  const guild = client?.guilds?.cache?.get(guildId) || (await client?.guilds?.fetch?.(guildId).catch(() => null));
  const role = resolveJediRole(guild);
  await clearJediRoleFromMember(guild, role, payload.targetId, "Ordine 66 scaduto");
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
            .setDescription("Tempo scaduto: il Jedi è fuggito."),
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
  await setRound("ordine66", {
    status: "active",
    kind: "ordine66",
    targetId: target.id,
    roleId: jediRole.id,
    channelId: channel.id,
    guildId,
    createdAt: new Date().toISOString(),
    expiresAt,
  });
  scheduleOrdine66Timeout(client, ORDINE66_DURATION_MS);
  await channel
    .send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x8b1a1a)
          .setTitle("Ordine 66")
          .setDescription(
            `Un Jedi è tra gli utenti **smistati online**… **Pingalo** in chat per eseguire l'Ordine 66.\nVince chi lo menziona per primo.\nHai **${Math.round(ORDINE66_DURATION_MS / 60000)} minuti**.`,
          ),
      ],
    })
    .catch(() => null);
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
    await message.reply("Non è quello lo Jedi.").catch(() => null);
    return true;
  }

  const claimed = await claimRound("ordine66", message.author.id);
  if (!claimed) {
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
  await grantStarWarsReward(client, {
    guildId: message.guildId,
    userId: message.author.id,
    reason: "ordine66",
    grant: { crateId: "alpha", crateQty: 1, exp: 100, troops: { tier1: 5 } },
  });
  await message.reply(`Eseguito. <@${message.author.id}> ottiene cassa alpha + 100 exp + 5 truppe.`).catch(() => null);
  return true;
}

/* ——— Scova il pianeta ——— */
const SCOVA_CDN = "https://cdn.viniliecaffe.it/images/starwars";
const SCOVA_IMG_V = "20261104a";
const SCOVA_MAP_IMAGE = `${SCOVA_CDN}/galaxy-map-scova.jpg?v=${SCOVA_IMG_V}`;

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

  await setRound("scova", {
    status: "active",
    kind: "scova",
    planetId: planet.id,
    answer: planet.id,
    coord,
    numericCoords,
    channelId: channel.id,
    guildId,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });
  const embed = new EmbedBuilder()
    .setColor(0x2f6fed)
    .setTitle("Scova il pianeta")
    .setDescription(
      `Settore **\`${coord}\`** · coordinate \`${numericCoords}\`\nConsulta la mappa e scrivi in chat il **nome del pianeta**.`,
    )
    .setImage(SCOVA_MAP_IMAGE);
  await channel.send({ embeds: [embed] }).catch(() => null);
  return { ok: true, planetId: planet.id, coord, numericCoords };
}

async function tryScovaMessage(message?, client?) {
  const round = await getActiveRound("scova");
  if (!round?.payload || round.payload.status !== "active") return false;
  if (normalizeId(message.channelId) !== normalizeId(round.payload.channelId)) return false;
  const guessPlanet = findScovaPlanetByGuess(message.content);
  if (!guessPlanet) return false;
  const answerId = normalizeId(round.payload.planetId || round.payload.answer).toLowerCase();
  if (guessPlanet.id !== answerId) return false;
  if (!(await isStarWarsSortedParticipant(client || message.client, message.guildId, message.author.id))) {
    return false;
  }

  const claimed = await claimRound("scova", message.author.id);
  if (!claimed) return true;
  await grantStarWarsReward(client, {
    guildId: message.guildId,
    userId: message.author.id,
    reason: "scova",
    grant: { exp: 1000, credits: 0 },
  });
  const sector = round.payload.coord ? formatScovaGridCoord(round.payload.coord) : "";
  const winEmbed = new EmbedBuilder()
    .setColor(0x22c55e)
    .setTitle("Pianeta trovato!")
    .setDescription(
      `<@${message.author.id}> ha individuato **${guessPlanet.name}**` +
        (sector ? ` (\`${sector}\`)` : "") +
        `.\nPremio: **+1000 exp**.`,
    )
    .setImage(scovaPlanetImageUrl(guessPlanet.id));
  await message.reply({ embeds: [winEmbed] }).catch(() => null);
  return true;
}
/* ——— Attacca la base ——— */
const ATTACCA_MAX_HP = 100;
const ATTACCA_DAMAGE = 5;
const ATTACCA_MIN_CHARS = 5;
const ATTACCA_MAX_HITS_PER_USER = 5;
const ATTACCA_BAR_WIDTH = 10;
const ATTACCA_VS_IMAGE = "https://cdn.viniliecaffe.it/images/starwars/attacca-base-vs.jpg?v=20261104vs2";
const ATTACCA_VS_V = "20261104ko3";
const ATTACCA_VS_YAVIN_DEAD = `https://cdn.viniliecaffe.it/images/starwars/attacca-base-vs-yavin-dead.jpg?v=${ATTACCA_VS_V}`;
const ATTACCA_VS_DEATHSTAR_DEAD = `https://cdn.viniliecaffe.it/images/starwars/attacca-base-vs-deathstar-dead.jpg?v=${ATTACCA_VS_V}`;
const ATTACCA_VS_DRAW = `https://cdn.viniliecaffe.it/images/starwars/attacca-base-vs-draw.jpg?v=${ATTACCA_VS_V}`;

/** winnerLabel = base distrutta ("Yavin IV" | "Morte Nera" | "pareggio"/"draw"). */
function attaccaVsImageForDestroyed(destroyedLabel?) {
  const s = String(destroyedLabel || "").toLowerCase();
  if (s.includes("pareggio") || s.includes("draw") || s.includes("tie")) return ATTACCA_VS_DRAW;
  if (s.includes("yavin")) return ATTACCA_VS_YAVIN_DEAD;
  if (s.includes("morte") || s.includes("death")) return ATTACCA_VS_DEATHSTAR_DEAD;
  return ATTACCA_VS_IMAGE;
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
  const yavin = safeHp(payload?.hpYavin);
  const death = safeHp(payload?.hpDeathStar);
  const lines = [
    `🌲 **Yavin IV**`,
    `\`${String(yavin).padStart(3, " ")}/${ATTACCA_MAX_HP}\`  ${attaccaHpBar(yavin)}`,
    "",
    `🌑 **Morte Nera**`,
    `\`${String(death).padStart(3, " ")}/${ATTACCA_MAX_HP}\`  ${attaccaHpBar(death)}`,
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
    if (/pareggio|draw|tie/i.test(wl)) lines.push("", "⚖️ **Pareggio** — entrambe le basi a pezzi.");
    else lines.push("", `🏆 **${wl}** distrutta!`);
  }
  const bothDead = finished && yavin <= 0 && death <= 0;
  const color = finished ? (bothDead || /pareggio|draw|tie/i.test(String(lastHit?.winnerLabel || "")) ? 0x9ca3af : 0x22c55e) : yavin <= 30 || death <= 30 ? 0xef4444 : 0xc9a227;
  let image = ATTACCA_VS_IMAGE;
  if (finished) {
    if (bothDead || /pareggio|draw|tie/i.test(String(lastHit?.winnerLabel || ""))) image = ATTACCA_VS_DRAW;
    else if (lastHit?.winnerLabel) image = attaccaVsImageForDestroyed(lastHit.winnerLabel);
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
  const boardMsg = await channel
    .send({
      embeds: [
        attaccaBaseBoardEmbed({
          hpYavin: hp,
          hpDeathStar: hp,
        }),
      ],
    })
    .catch(() => null);
  if (!boardMsg) return { ok: false, error: "send_failed" };
  const payload = {
    status: "active",
    kind: "attacca_base",
    hpYavin: hp,
    hpDeathStar: hp,
    hitsByUser: {},
    channelId: channel.id,
    guildId,
    boardMessageId: boardMsg.id,
    messageId: boardMsg.id,
    createdAt: new Date().toISOString(),
  };
  await setRound("attacca_base", payload);
  return { ok: true, messageId: boardMsg.id };
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

  const target = Math.random() < 0.5 ? "hpYavin" : "hpDeathStar";
  const label = target === "hpYavin" ? "Yavin IV" : "Morte Nera";
  const before = safeHp(round.payload[target]);
  const next = Math.max(0, before - ATTACCA_DAMAGE);
  hitsByUser[uid] = used + 1;

  const payload = {
    ...round.payload,
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
    await grantStarWarsReward(client || message.client, {
      guildId: message.guildId,
      userId: uid,
      reason: "attacca_base",
      grant: { crateId: "omega", crateQty: 1, exp: 100 },
    });
    await message.channel
      .send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xef4444)
            .setTitle("Base distrutta")
            .setDescription(`💥 <@${uid}> azzera **${winner}**!\nPremio: **cassa omega** + **100 exp**.`)
            .setImage(attaccaVsImageForDestroyed(winner)),
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
const CONVOGLIO_IMG_V = "20261104cv2";
const CONVOGLIO_IMAGES = Object.freeze({
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

function buildConvoglioButtons(token?) {
  const t = String(token || Date.now().toString(36));
  return {
    customContinue: `sw_mg:convoglio:continua:${t}`,
    customIntercept: `sw_mg:convoglio:intercetta:${t}`,
    row: new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`sw_mg:convoglio:continua:${t}`).setLabel("Continua").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`sw_mg:convoglio:intercetta:${t}`).setLabel("Intercetta").setStyle(ButtonStyle.Danger),
    ),
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
      .setDescription(`La scorta **${escortLabel}** ha portato a casa il carico (**${needHops}/${needHops}**).`)
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
      `Tappa **${hopN}/${needHops}**\nFazione di scorta: **${escortLabel}** (solo loro possono **Continua**).\n` +
        `Se qualcuno **Intercetta**, la corsa finisce subito e **si perdono le ricompense**.`,
    )
    .setImage(CONVOGLIO_IMAGES[hopN] || CONVOGLIO_IMAGES[1]);
}

async function startConvoglio(client?, { channelId = null, force = false } = {}) {
  if (!force && !canAutoSpawnFeature(client, FEATURES.MINIGAME_PROTEGGI)) return { ok: false, error: "gated" };
  const existing = await getActiveRound("convoglio");
  if (String(existing?.payload?.status || "") === "active") return { ok: false, error: "already_active" };

  const targetCtx = await resolveSpawnTarget(client, channelId);
  const guildId = targetCtx.guildId;
  const chId = targetCtx.channelId;
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  const channel = guild?.channels?.cache?.get(chId) || (await guild?.channels?.fetch?.(chId).catch(() => null));
  if (!channel?.isTextBased?.()) return { ok: false, error: "bad_channel" };

  const escort = Math.random() < 0.5 ? "repubblica" : "separatisti";
  const hop = 1;
  const btns = buildConvoglioButtons();
  const msg = await channel
    .send({
      embeds: [convoglioEmbed({ escort, hop, mode: "active" })],
      components: [btns.row],
    })
    .catch(() => null);
  if (!msg) return { ok: false, error: "send_failed" };

  await setRound("convoglio", {
    status: "active",
    kind: "convoglio",
    escort,
    hops: hop,
    needHops: CONVOGLIO_NEED_HOPS,
    messageId: msg.id,
    channelId: channel.id,
    hubChannelId: channel.id,
    usedChannelIds: [channel.id],
    guildId,
    customContinue: btns.customContinue,
    customIntercept: btns.customIntercept,
    createdAt: new Date().toISOString(),
  });
  return { ok: true, hop, channelId: channel.id };
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
    await setRound("convoglio", {
      ...round.payload,
      status: "intercepted",
      interceptedBy: interaction.user.id,
      completedAt: new Date().toISOString(),
    });
    await interaction.message
      ?.edit?.({
        embeds: [convoglioEmbed({ escort, hop: currentHop, needHops, mode: "intercepted" })],
        components: [],
      })
      .catch(() => null);
    await interaction
      .reply({
        content: `💥 <@${interaction.user.id}> ha intercettato il convoglio alla tappa **${currentHop}/${needHops}**. **Nessuna ricompensa.**`,
      })
      .catch(() => null);
    const announce = await interaction.fetchReply().catch(() => null);
    scheduleConvoglioMessageCleanup(interaction.message, announce);
    return true;
  }

  if (action === "continua") {
    if (faction !== escort) {
      await interaction.reply({ content: "Solo la fazione di scorta può Continuare.", flags: 1 << 6 }).catch(() => null);
      return true;
    }

    await interaction.message?.edit?.({ components: [] }).catch(() => null);

    if (currentHop >= needHops) {
      await claimRound("convoglio", interaction.user.id);
      await grantStarWarsReward(interaction.client, {
        guildId: interaction.guildId,
        userId: interaction.user.id,
        reason: "convoglio_escort",
        grant: { crateId: "omega", crateQty: 1, exp: 100 },
      });
      await interaction.message
        ?.edit?.({
          embeds: [convoglioEmbed({ escort, hop: needHops, needHops, mode: "arrived" })],
          components: [],
        })
        .catch(() => null);
      await interaction
        .reply({ content: `🏁 Convoglio a destinazione! <@${interaction.user.id}> (+omega + 100 exp)` })
        .catch(() => null);
      const announce = await interaction.fetchReply().catch(() => null);
      scheduleConvoglioMessageCleanup(interaction.message, announce);
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

    const btns = buildConvoglioButtons(`${Date.now().toString(36)}${nextHop}`);
    const nextMsg = await nextChannel
      .send({
        embeds: [convoglioEmbed({ escort, hop: nextHop, needHops, mode: "active" })],
        components: [btns.row],
      })
      .catch(() => null);
    if (!nextMsg) {
      await setRound("convoglio", { ...round.payload, status: "aborted", error: "next_send_failed" });
      await interaction.reply({ content: "Impossibile spawnare la prossima tappa.", flags: 1 << 6 }).catch(() => null);
      return true;
    }

    await setRound("convoglio", {
      ...round.payload,
      hops: nextHop,
      messageId: nextMsg.id,
      channelId: nextChannel.id,
      usedChannelIds: [...used, normalizeId(nextChannel.id)].filter(Boolean),
      customContinue: btns.customContinue,
      customIntercept: btns.customIntercept,
      lastMovedAt: new Date().toISOString(),
    });

    await interaction
      .reply({
        content: `✅ Tappa **${currentHop}/${needHops}** ok. Il convoglio è ripartito in un altro canale — trovalo!`,
        flags: 1 << 6,
      })
      .catch(() => null);
    await interaction.message?.delete?.().catch(() => null);
    return true;
  }
  return true;
}

/* ——— Conquista il sistema ——— */
const CONQUISTA_CDN = "https://cdn.viniliecaffe.it/images/starwars";
const CONQUISTA_IMG_V = "20261104cq2";
const CONQUISTA_HUB_IMAGE = `${CONQUISTA_CDN}/conquista-hub.jpg?v=${CONQUISTA_IMG_V}`;
const CONQUISTA_WIN_IMAGES = Object.freeze({
  repubblica: `${CONQUISTA_CDN}/conquista-win-repubblica.jpg?v=${CONQUISTA_IMG_V}`,
  separatisti: `${CONQUISTA_CDN}/conquista-win-separatisti.jpg?v=${CONQUISTA_IMG_V}`,
  draw: `${CONQUISTA_CDN}/conquista-win-draw.jpg?v=${CONQUISTA_IMG_V}`,
});
const CONQUISTA_MAX_PER_USER = 2;
const CONQUISTA_DURATION_MS = 30 * 60 * 1000;
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

function buildConquistaClaimButton(systemKey?) {
  const key = String(systemKey || Date.now().toString(36));
  return {
    customId: `sw_mg:conquista:claim:${key}`,
    row: new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`sw_mg:conquista:claim:${key}`).setLabel("Conquista").setStyle(ButtonStyle.Danger),
    ),
  };
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
    .setDescription(`${blurb}\n\nClicca **Conquista** per rivendicarlo (max **${CONQUISTA_MAX_PER_USER}** a testa).`);
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

  const hubMsg = await hub
    .send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xc2410c)
          .setTitle("Conquista il sistema")
          .setDescription(
            "I sistemi sono apparsi nei canali **Community** e **Pinned**.\n" +
              "Repubblica e Separatisti: rivendicateli il prima possibile.\n" +
              `Ogni sistema vale **100 exp**. Max **${CONQUISTA_MAX_PER_USER}** a testa.\n` +
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
    const btns = buildConquistaClaimButton(systemKey);
    const msg = await channel
      .send({
        embeds: [conquistaSystemEmbed(planet)],
        components: [btns.row],
      })
      .catch(() => null);
    if (!msg) continue;
    systems[systemKey] = {
      planetId: planet.id,
      planetName: planet.name,
      channelId: channel.id,
      messageId: msg.id,
      claimedBy: null,
      claimedFaction: null,
      customId: btns.customId,
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
    systems,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + CONQUISTA_DURATION_MS).toISOString(),
  });
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

    await grantStarWarsReward(interaction.client, {
      guildId: walletGuildId(interaction.client) || interaction.guildId,
      userId: interaction.user.id,
      reason: "conquista",
      grant: { exp: 100 },
    });

    await interaction.message
      ?.edit?.({
        embeds: [conquistaSystemEmbed(planet, { claimedBy: interaction.user.id, claimedFaction: faction })],
        components: [],
      })
      .catch(() => null);

    await interaction
      .reply({
        content: `🛰️ <@${interaction.user.id}> conquista **${planet.name}** per la **${conquistaFactionLabel(faction)}**! (+100 exp)`,
      })
      .catch(() => null);

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
  const image = isPg ? "" : reliquieImageUrl(item.id);
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
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  });
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
    if (!matched || matched.id !== round.payload.itemId) continue;

    if (!(await isStarWarsSortedParticipant(client || message.client, message.guildId, message.author.id))) {
      await message.reply(UNSORTED_MG_MSG).catch(() => null);
      return true;
    }

    const claimed = await claimRound(kind, message.author.id);
    if (!claimed) {
      await message.reply("Qualcun altro è stato più veloce.").catch(() => null);
      return true;
    }

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

    await grantStarWarsReward(client, {
      guildId: walletGid,
      userId: message.author.id,
      reason: kind,
      grant: { exp: 50 },
    });

    const boardMsgId = normalizeId(round.payload.messageId);
    if (boardMsgId && message.channel?.messages?.fetch) {
      const board = await message.channel.messages.fetch(boardMsgId).catch(() => null);
      if (board?.edit) {
        const done = new EmbedBuilder()
          .setColor(0x22c55e)
          .setTitle(isPg ? "PG reclamato" : "Reliquia reclamata")
          .setDescription(`**${label}** — trovato da <@${message.author.id}>`);
        const winImg = isPg ? "" : reliquieImageUrl(matched.id);
        if (winImg) done.setImage(winImg);
        await board.edit({ embeds: [done] }).catch(() => null);
      }
    }

    await message
      .reply(
        alreadyOwned
          ? `✨ <@${message.author.id}> indovina **${label}**! (+50 exp) — già nel tuo deck.`
          : `✨ <@${message.author.id}> reclama **${label}**! (+50 exp) — aggiunta al deck profilo.`,
      )
      .catch(() => null);
    return true;
  }
  return false;
}

/** Scommesse solo sul sito (/gara/) — niente spawn Discord / +punta. */
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
    case "scommessa":
      return { ok: false, error: "site_only_gara" };
    default:
      return { ok: false, error: "unknown_kind" };
  }
}

async function tickAutoSpawns(client?) {
  const flags = getRuntimeFlags(client);
  if (!flags.enabled) return;
  if (!flags.publicEnabled && !flags.previewAutoSpawn) return;

  const jobs = [
    () => spawnReactGame(client, "podrace"),
    () => spawnHuntGame(client, "ewok"),
    () => spawnHuntGame(client, "olocron"),
    () => startOrdine66(client),
    () => startScovaPianeta(client),
    () => startAttaccaBase(client),
    () => startConvoglio(client),
    () => startConquista(client),
    () => spawnDeckDrop(client, "pg"),
    () => spawnDeckDrop(client, "relic"),
  ];
  /* sparse: one random eligible attempt per tick */
  const job = jobs[Math.floor(Math.random() * jobs.length)];
  await job().catch(() => null);
}

function startStarWarsMinigamesLoop(client?) {
  if (!client || loopState.has(client)) return;
  loopState.add(client);
  void (async () => {
    try {
      const { syncStarWarsFactionRolesOnTestFromDb } = require("./starWarsFactionTestRoles") as typeof import("./starWarsFactionTestRoles");
      await syncStarWarsFactionRolesOnTestFromDb(client);
    } catch (_) {}
  })();
  const schedule = () => {
    const t = setTimeout(async () => {
      try {
        await tickAutoSpawns(client);
      } catch (err) {
        global.logger?.warn?.("[SW MG] tick:", err?.message || err);
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
  if (await tryScovaMessage(message, client)) return true;
  if (await tryAttaccaBaseMessage(message, client)) return true;
  if (await tryDeckMessage(message, client)) return true;
  return false;
}

export = {
  startStarWarsMinigamesLoop,
  staffSpawn,
  handleStarWarsReaction,
  handleStarWarsButton,
  handleStarWarsMessage,
  tryOrdine66Mention,
  tryPuntaCommand,
  tryConquistaCommand,
  isHighStaffMember,
};
