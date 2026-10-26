/**
 * Engine Discord Star Wars — reaction race + button hunt + stateful minigames.
 * Auto-spawn SOLO se pubblico aperto (o previewAutoSpawn). HS: +swspawn.
 */
"use strict";

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas");
const IDs = require("../../Utils/Config/ids");
const {
  FEATURES,
  canAutoSpawnFeature,
  getRuntimeFlags,
  isHighStaffMember,
} = require("../../Utils/Web/starWarsRuntimeGate");
const { grantStarWarsReward } = require("./starWarsRewardsService");

const DOC_TYPE = SITE_DOCUMENT_TYPE.STARWARS_EVENT_STATE;
const OWNER = "__starwars_mg__";
const loopState = new WeakSet();
const claimLocks = new Set();

const REACT_GAMES = Object.freeze({
  podrace: { feature: FEATURES.MINIGAME_PODRACE, emoji: "🏁", title: "Gara di Podracer", crate: "alpha", exp: 100 },
  ewok: { feature: FEATURES.MINIGAME_CACCIA_EWOK, emoji: "🐾", title: "Caccia all'Ewok", crate: "alpha", exp: 100 },
});

const BUTTON_GAMES = Object.freeze({
  olocron: { feature: FEATURES.GAME_OLOCRON, title: "Caccia all'Olocron", crate: "alpha", exp: 100, btn: "Prendi l'Olocron" },
});

function normalizeId(v) {
  return String(v || "").trim();
}

function mainGuildId() {
  return normalizeId(IDs.guilds?.main);
}

function chatChannelId(client) {
  const flags = getRuntimeFlags(client);
  return flags.chatChannelId || normalizeId(IDs.channels?.chat);
}

function dedupe(kind) {
  return `sw_mg_active_${kind}`;
}

async function getActiveRound(kind) {
  return SiteDocument.findOne({ docType: DOC_TYPE, ownerId: OWNER, dedupeKey: dedupe(kind), "payload.status": "active" })
    .lean()
    .catch(() => null);
}

async function setRound(kind, payload) {
  await SiteDocument.findOneAndUpdate(
    { docType: DOC_TYPE, ownerId: OWNER, dedupeKey: dedupe(kind) },
    {
      $set: { payload, updatedAt: new Date() },
      $setOnInsert: { docType: DOC_TYPE, ownerId: OWNER, dedupeKey: dedupe(kind), guildId: mainGuildId() || "0" },
    },
    { upsert: true },
  ).catch(() => null);
}

async function claimRound(kind, userId) {
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

async function spawnReactGame(client, kind, { channelId = null, force = false } = {}) {
  const meta = REACT_GAMES[kind];
  if (!meta) return { ok: false, error: "unknown" };
  if (!force && !canAutoSpawnFeature(client, meta.feature)) return { ok: false, error: "gated" };

  const guildId = mainGuildId();
  const chId = normalizeId(channelId) || chatChannelId(client);
  if (!guildId || !chId) return { ok: false, error: "no_channel" };
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  const channel = guild?.channels?.cache?.get(chId) || (await guild?.channels?.fetch?.(chId).catch(() => null));
  if (!channel?.isTextBased?.()) return { ok: false, error: "bad_channel" };

  const existing = await getActiveRound(kind);
  if (existing?.payload?.status === "active") return { ok: false, error: "already_active" };

  const embed = new EmbedBuilder()
    .setColor(0xc9a227)
    .setTitle(`${meta.emoji} ${meta.title}`)
    .setDescription(`3… 2… 1… **VIA!**\nPrimo a reagire con ${meta.emoji} vince **cassa ${meta.crate}** + **${meta.exp} exp**.`);
  const msg = await channel.send({ embeds: [embed] }).catch(() => null);
  if (!msg) return { ok: false, error: "send_failed" };
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
}

async function spawnButtonGame(client, kind, { channelId = null, force = false } = {}) {
  const meta = BUTTON_GAMES[kind];
  if (!meta) return { ok: false, error: "unknown" };
  if (!force && !canAutoSpawnFeature(client, meta.feature)) return { ok: false, error: "gated" };

  const guildId = mainGuildId();
  const chId = normalizeId(channelId) || chatChannelId(client);
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  const channel = guild?.channels?.cache?.get(chId) || (await guild?.channels?.fetch?.(chId).catch(() => null));
  if (!channel?.isTextBased?.()) return { ok: false, error: "bad_channel" };

  const customId = `sw_mg:${kind}:${Date.now().toString(36)}`;
  const embed = new EmbedBuilder()
    .setColor(0x2f6fed)
    .setTitle(meta.title)
    .setDescription(`Un artefatto è apparso. Premi il bottone per reclamarlo!\nPremio: **cassa ${meta.crate}** + **${meta.exp} exp**.`);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(customId).setLabel(meta.btn).setStyle(ButtonStyle.Primary),
  );
  const msg = await channel.send({ embeds: [embed], components: [row] }).catch(() => null);
  if (!msg) return { ok: false, error: "send_failed" };

  await setRound(kind, {
    status: "active",
    kind,
    messageId: msg.id,
    channelId: channel.id,
    guildId,
    customId,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });
  return { ok: true, messageId: msg.id };
}

async function handleStarWarsReaction(client, reaction, user) {
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
    const lock = `${kind}:${messageId}`;
    if (claimLocks.has(lock)) return true;
    claimLocks.add(lock);
    try {
      const claimed = await claimRound(kind, user.id);
      if (!claimed) return true;
      const guildId = normalizeId(round.payload.guildId) || mainGuildId();
      await grantStarWarsReward(client, {
        guildId,
        userId: user.id,
        reason: kind,
        grant: { crateId: meta.crate, crateQty: 1, exp: meta.exp },
      });
      const ch = reaction.message?.channel;
      if (ch?.send) {
        await ch.send({ content: `🏁 <@${user.id}> vince **${meta.title}**! (+${meta.crate} + ${meta.exp} exp)` }).catch(() => null);
      }
      return true;
    } finally {
      claimLocks.delete(lock);
    }
  }
  return false;
}

async function handleStarWarsButton(interaction) {
  const id = String(interaction?.customId || "");
  if (!id.startsWith("sw_mg:")) return false;
  const parts = id.split(":");
  const kind = parts[1];
  const meta = BUTTON_GAMES[kind] || null;
  /* convoglio buttons */
  if (kind === "convoglio") {
    return handleConvoglioButton(interaction, parts);
  }
  if (!meta) return false;
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ ephemeral: true }).catch(() => null);
  }
  const round = await getActiveRound(kind);
  if (!round?.payload || round.payload.status !== "active") {
    await interaction.editReply({ content: "Round già chiuso." }).catch(() => null);
    return true;
  }
  if (normalizeId(round.payload.customId) && normalizeId(round.payload.customId) !== id) {
    /* allow prefix match sw_mg:olocron: */
  }
  const claimed = await claimRound(kind, interaction.user.id);
  if (!claimed) {
    await interaction.editReply({ content: "Qualcun altro è stato più veloce." }).catch(() => null);
    return true;
  }
  const guildId = normalizeId(interaction.guildId) || mainGuildId();
  await grantStarWarsReward(interaction.client, {
    guildId,
    userId: interaction.user.id,
    reason: kind,
    grant: { crateId: meta.crate, crateQty: 1, exp: meta.exp },
  });
  await interaction.editReply({ content: `Hai preso l'artefatto! (+${meta.crate} + ${meta.exp} exp)` }).catch(() => null);
  await interaction.message?.edit?.({ components: [] }).catch(() => null);
  return true;
}

/* ——— Ordine 66 ——— */
async function startOrdine66(client, { channelId = null, force = false } = {}) {
  if (!force && !canAutoSpawnFeature(client, FEATURES.MINIGAME_ORDINE66)) return { ok: false, error: "gated" };
  const guildId = mainGuildId();
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return { ok: false, error: "no_guild" };

  /* Pick random online non-bot member as Jedi target (simplified: random from cache) */
  const members = [...guild.members.cache.filter((m) => !m.user.bot).values()];
  if (!members.length) return { ok: false, error: "no_members" };
  const target = members[Math.floor(Math.random() * members.length)];
  const chId = normalizeId(channelId) || chatChannelId(client);
  const channel = guild.channels.cache.get(chId) || (await guild.channels.fetch(chId).catch(() => null));
  if (!channel?.isTextBased?.()) return { ok: false, error: "bad_channel" };

  await setRound("ordine66", {
    status: "active",
    kind: "ordine66",
    targetId: target.id,
    channelId: channel.id,
    guildId,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  });
  await channel
    .send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x8b1a1a)
          .setTitle("Ordine 66")
          .setDescription(`Un Jedi è tra voi… Eseguite **+ordine66 @utente**.\nVince chi indovina.`),
      ],
    })
    .catch(() => null);
  return { ok: true, targetId: target.id };
}

async function tryOrdine66Command(message, client) {
  const round = await getActiveRound("ordine66");
  if (!round?.payload || round.payload.status !== "active") return false;
  const mentioned = message.mentions?.users?.first?.() || null;
  const argId = normalizeId(message.content?.split(/\s+/)[1]?.replace(/[<@!>]/g, ""));
  const guessId = normalizeId(mentioned?.id || argId);
  if (!guessId) {
    await message.reply("Usa `+ordine66 @utente`.").catch(() => null);
    return true;
  }
  if (guessId !== normalizeId(round.payload.targetId)) {
    await message.reply("Non è quello lo Jedi.").catch(() => null);
    return true;
  }
  const claimed = await claimRound("ordine66", message.author.id);
  if (!claimed) {
    await message.reply("Qualcun altro ha già eseguito l'Ordine 66.").catch(() => null);
    return true;
  }
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
const PLANETS = ["Tatooine", "Coruscant", "Naboo", "Kamino", "Geonosis", "Mustafar", "Kashyyyk", "Utapau", "Mygeeto", "Felucia"];

async function startScovaPianeta(client, { channelId = null, force = false } = {}) {
  if (!force && !canAutoSpawnFeature(client, FEATURES.MINIGAME_SCOVA)) return { ok: false, error: "gated" };
  const planet = PLANETS[Math.floor(Math.random() * PLANETS.length)];
  const sector = `${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${1 + Math.floor(Math.random() * 9)}`;
  const coords = `${(Math.random() * 999999).toFixed(3)}-${(Math.random() * 999999).toFixed(3)}`;
  const guildId = mainGuildId();
  const chId = normalizeId(channelId) || chatChannelId(client);
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  const channel = guild?.channels?.cache?.get(chId) || (await guild?.channels?.fetch?.(chId).catch(() => null));
  if (!channel?.isTextBased?.()) return { ok: false, error: "bad_channel" };

  await setRound("scova", {
    status: "active",
    kind: "scova",
    answer: planet.toLowerCase(),
    channelId: channel.id,
    guildId,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    wins: {},
  });
  await channel
    .send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x2f6fed)
          .setTitle("Scova il pianeta")
          .setDescription(`Settore **${sector}** · coordinate \`${coords}\`\nScrivi il nome del pianeta in chat!`),
      ],
    })
    .catch(() => null);
  return { ok: true, planet };
}

async function tryScovaMessage(message, client) {
  const round = await getActiveRound("scova");
  if (!round?.payload || round.payload.status !== "active") return false;
  if (normalizeId(message.channelId) !== normalizeId(round.payload.channelId)) return false;
  const guess = String(message.content || "").trim().toLowerCase();
  if (!guess || guess.length > 40) return false;
  if (guess !== round.payload.answer) return false;

  const claimed = await claimRound("scova", message.author.id);
  if (!claimed) return true;
  await grantStarWarsReward(client, {
    guildId: message.guildId,
    userId: message.author.id,
    reason: "scova",
    grant: { exp: 1000, credits: 0 },
  });
  /* banca fazione +250k gestita a fine periodo — qui premio individuale */
  await message.reply(`Pianeta corretto! <@${message.author.id}> (+1000 exp)`).catch(() => null);
  return true;
}

/* ——— Attacca la base ——— */
async function startAttaccaBase(client, { channelId = null, force = false } = {}) {
  if (!force && !canAutoSpawnFeature(client, FEATURES.MINIGAME_ATTACCA_BASE)) return { ok: false, error: "gated" };
  const guildId = mainGuildId();
  const chId = normalizeId(channelId) || chatChannelId(client);
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  const channel = guild?.channels?.cache?.get(chId) || (await guild?.channels?.fetch?.(chId).catch(() => null));
  if (!channel?.isTextBased?.()) return { ok: false, error: "bad_channel" };

  const hp = 100;
  await setRound("attacca_base", {
    status: "active",
    kind: "attacca_base",
    hpYavin: hp,
    hpDeathStar: hp,
    channelId: channel.id,
    guildId,
    createdAt: new Date().toISOString(),
  });
  await channel
    .send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xc9a227)
          .setTitle("Attacca la base")
          .setDescription(`Yavin IV **${hp} HP** · Morte Nera **${hp} HP**\nOgni messaggio in questo canale toglie **2 HP** a caso.\nChi azzera una base vince cassa omega + 100 exp.`),
      ],
    })
    .catch(() => null);
  return { ok: true };
}

async function tryAttaccaBaseMessage(message, client) {
  const round = await getActiveRound("attacca_base");
  if (!round?.payload || round.payload.status !== "active") return false;
  if (normalizeId(message.channelId) !== normalizeId(round.payload.channelId)) return false;
  if (message.author.bot) return false;

  const target = Math.random() < 0.5 ? "hpYavin" : "hpDeathStar";
  const next = Math.max(0, safeHp(round.payload[target]) - 2);
  const payload = { ...round.payload, [target]: next };
  let winner = null;
  if (next <= 0) {
    payload.status = "completed";
    payload.winnerId = message.author.id;
    winner = target === "hpYavin" ? "Yavin IV" : "Morte Nera";
  }
  await setRound("attacca_base", payload);
  if (winner) {
    await grantStarWarsReward(client, {
      guildId: message.guildId,
      userId: message.author.id,
      reason: "attacca_base",
      grant: { crateId: "omega", crateQty: 1, exp: 100 },
    });
    await message.channel
      .send(`💥 <@${message.author.id}> distrugge **${winner}**! (+omega + 100 exp)`)
      .catch(() => null);
  }
  return true;
}

function safeHp(v) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? n : 0;
}

/* ——— Proteggi convoglio ——— */
async function startConvoglio(client, { channelId = null, force = false } = {}) {
  if (!force && !canAutoSpawnFeature(client, FEATURES.MINIGAME_PROTEGGI)) return { ok: false, error: "gated" };
  const guildId = mainGuildId();
  const chId = normalizeId(channelId) || chatChannelId(client);
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  const channel = guild?.channels?.cache?.get(chId) || (await guild?.channels?.fetch?.(chId).catch(() => null));
  if (!channel?.isTextBased?.()) return { ok: false, error: "bad_channel" };

  const escort = Math.random() < 0.5 ? "repubblica" : "separatisti";
  const customContinue = `sw_mg:convoglio:continua:${Date.now().toString(36)}`;
  const customIntercept = `sw_mg:convoglio:intercetta:${Date.now().toString(36)}`;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(customContinue).setLabel("Continua").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(customIntercept).setLabel("Intercetta").setStyle(ButtonStyle.Danger),
  );
  const msg = await channel
    .send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x8b1a1a)
          .setTitle("Proteggi convoglio")
          .setDescription(`La fazione di scorta è **${escort}** (solo loro possono Continuare).\nGli altri devono Intercettare.`),
      ],
      components: [row],
    })
    .catch(() => null);
  if (!msg) return { ok: false, error: "send_failed" };

  await setRound("convoglio", {
    status: "active",
    kind: "convoglio",
    escort,
    hops: 0,
    needHops: 3,
    messageId: msg.id,
    channelId: channel.id,
    guildId,
    customContinue,
    customIntercept,
    createdAt: new Date().toISOString(),
  });
  return { ok: true };
}

async function handleConvoglioButton(interaction, parts) {
  const action = parts[2]; // continua | intercetta
  const round = await getActiveRound("convoglio");
  if (!round?.payload || round.payload.status !== "active") {
    await interaction.reply({ content: "Convoglio già risolto.", ephemeral: true }).catch(() => null);
    return true;
  }
  const { getStarWarsWallet } = require("./starWarsEventWalletService");
  const wallet = await getStarWarsWallet(interaction.guildId, interaction.user.id);
  const faction = wallet?.factionId;
  const escort = round.payload.escort;

  if (action === "continua") {
    if (faction !== escort) {
      await interaction.reply({ content: "Solo la fazione di scorta può Continuare.", ephemeral: true }).catch(() => null);
      return true;
    }
    const hops = safeHp(round.payload.hops) + 1;
    if (hops >= safeHp(round.payload.needHops) || hops >= 3) {
      await claimRound("convoglio", interaction.user.id);
      await grantStarWarsReward(interaction.client, {
        guildId: interaction.guildId,
        userId: interaction.user.id,
        reason: "convoglio_escort",
        grant: { crateId: "omega", crateQty: 1, exp: 100 },
      });
      await interaction.reply({ content: "Convoglio a destinazione! (+omega + 100 exp)" }).catch(() => null);
      await interaction.message?.edit?.({ components: [] }).catch(() => null);
      return true;
    }
    await setRound("convoglio", { ...round.payload, hops });
    await interaction.reply({ content: `Scorta ok (${hops}/3).`, ephemeral: true }).catch(() => null);
    return true;
  }

  if (action === "intercetta") {
    if (faction === escort) {
      await interaction.reply({ content: "Non puoi intercettare il tuo convoglio.", ephemeral: true }).catch(() => null);
      return true;
    }
    await claimRound("convoglio", interaction.user.id);
    await grantStarWarsReward(interaction.client, {
      guildId: interaction.guildId,
      userId: interaction.user.id,
      reason: "convoglio_intercept",
      grant: { crateId: "omega", crateQty: 1, exp: 100 },
    });
    await interaction.reply({ content: "Convoglio intercettato! (+omega + 100 exp)" }).catch(() => null);
    await interaction.message?.edit?.({ components: [] }).catch(() => null);
    return true;
  }
  return true;
}

/* ——— Conquista sistema (claim channel) ——— */
async function startConquista(client, { force = false } = {}) {
  if (!force && !canAutoSpawnFeature(client, FEATURES.GAME_CONQUISTA)) return { ok: false, error: "gated" };
  const guildId = mainGuildId();
  const chId = chatChannelId(client);
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  const channel = guild?.channels?.cache?.get(chId) || (await guild?.channels?.fetch?.(chId).catch(() => null));
  if (!channel?.isTextBased?.()) return { ok: false, error: "bad_channel" };

  await setRound("conquista", {
    status: "active",
    kind: "conquista",
    claims: {},
    guildId,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  });
  await channel
    .send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x2f6fed)
          .setTitle("Conquista il sistema")
          .setDescription("Scrivi `+conquista` in un canale community per reclamarlo (max 2 a testa). Vince chi ne tiene di più a fine round."),
      ],
    })
    .catch(() => null);
  return { ok: true };
}

async function tryConquistaCommand(message, client) {
  const round = await getActiveRound("conquista");
  if (!round?.payload || round.payload.status !== "active") return false;
  const uid = message.author.id;
  const claims = { ...(round.payload.claims || {}) };
  const mine = Object.entries(claims).filter(([, v]) => v === uid);
  if (mine.length >= 2) {
    await message.reply("Hai già conquistato 2 canali.").catch(() => null);
    return true;
  }
  if (claims[message.channelId]) {
    await message.reply("Canale già conquistato.").catch(() => null);
    return true;
  }
  claims[message.channelId] = uid;
  await setRound("conquista", { ...round.payload, claims });
  await grantStarWarsReward(client, {
    guildId: message.guildId,
    userId: uid,
    reason: "conquista",
    grant: { exp: 100, troops: { tier1: 1 } },
  });
  await message.reply(`Canale conquistato (+100 exp + 1 truppa).`).catch(() => null);
  return true;
}

/* ——— Deck PG / Reliquie ——— */
const PG_NAMES = ["Anakin", "Obi-Wan", "Padmé", "Ahsoka", "Rex", "Grievous", "Dooku", "Maul", "Yoda", "Mace"];
const RELIC_NAMES = ["Kyber blu", "Kyber rosso", "Olocron Sith", "Olocron Jedi", "Holocron", "Darksaber shard"];

async function spawnDeckDrop(client, kind, { channelId = null, force = false } = {}) {
  const feature = kind === "pg" ? FEATURES.GAME_COLLEZIONA_PG : FEATURES.GAME_RELIQUIE;
  const pool = kind === "pg" ? PG_NAMES : RELIC_NAMES;
  if (!force && !canAutoSpawnFeature(client, feature)) return { ok: false, error: "gated" };
  const name = pool[Math.floor(Math.random() * pool.length)];
  const guildId = mainGuildId();
  const chId = normalizeId(channelId) || chatChannelId(client);
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  const channel = guild?.channels?.cache?.get(chId) || (await guild?.channels?.fetch?.(chId).catch(() => null));
  if (!channel?.isTextBased?.()) return { ok: false, error: "bad_channel" };

  const roundKind = kind === "pg" ? "deck_pg" : "deck_relic";
  await setRound(roundKind, {
    status: "active",
    kind: roundKind,
    answer: name.toLowerCase(),
    label: name,
    channelId: channel.id,
    guildId,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  });
  await channel
    .send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xc9a227)
          .setTitle(kind === "pg" ? "Colleziona PG" : "Colleziona reliquie")
          .setDescription(`Apparso: **???**\nScrivi il nome corretto per reclamarlo!`),
      ],
    })
    .catch(() => null);
  /* reveal after short delay in same message edit would be nicer — send hint */
  await channel.send(`Hint: inizia con **${name[0]}**…`).catch(() => null);
  return { ok: true, name };
}

async function tryDeckMessage(message, client) {
  for (const kind of ["deck_pg", "deck_relic"]) {
    const round = await getActiveRound(kind);
    if (!round?.payload || round.payload.status !== "active") continue;
    if (normalizeId(message.channelId) !== normalizeId(round.payload.channelId)) continue;
    const guess = String(message.content || "").trim().toLowerCase();
    if (guess !== round.payload.answer) continue;
    const claimed = await claimRound(kind, message.author.id);
    if (!claimed) return true;
    const field = kind === "deck_pg" ? "deckPG" : "deckReliquie";
    const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
    const { ROOT } = require("./starWarsEventWalletService");
    await ActivityUserProfile.findOneAndUpdate(
      { guildId: message.guildId, userId: message.author.id },
      {
        $addToSet: { [`${ROOT}.${field}`]: round.payload.label },
        $set: { [`${ROOT}.updatedAt`]: new Date().toISOString() },
        $setOnInsert: { guildId: message.guildId, userId: message.author.id },
      },
      { upsert: true },
    ).catch(() => null);
    await grantStarWarsReward(client, {
      guildId: message.guildId,
      userId: message.author.id,
      reason: kind,
      grant: { exp: 50 },
    });
    await message.reply(`Reclamato **${round.payload.label}**! (+50 exp)`).catch(() => null);
    return true;
  }
  return false;
}

/* ——— Scommessa podracer ——— */
async function startScommessa(client, { channelId = null, force = false } = {}) {
  if (!force && !canAutoSpawnFeature(client, FEATURES.MINIGAME_SCOMMESSA)) return { ok: false, error: "gated" };
  const racers = ["Sebulba", "Anakin", "Gasgano", "Teemto", "Ben Quadinaros"];
  const guildId = mainGuildId();
  const chId = normalizeId(channelId) || chatChannelId(client);
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  const channel = guild?.channels?.cache?.get(chId) || (await guild?.channels?.fetch?.(chId).catch(() => null));
  if (!channel?.isTextBased?.()) return { ok: false, error: "bad_channel" };

  await setRound("scommessa", {
    status: "active",
    kind: "scommessa",
    racers,
    bets: {},
    channelId: channel.id,
    guildId,
    createdAt: new Date().toISOString(),
    resolvesAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  });
  await channel
    .send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xc9a227)
          .setTitle("Scommessa ai Podracer")
          .setDescription(
            `Corridori: ${racers.map((r) => `**${r}**`).join(", ")}\nUsa \`+punta <corridore> <importo>\` (min 9000).\nEsito tra 5 minuti.`,
          ),
      ],
    })
    .catch(() => null);
  setTimeout(() => {
    void resolveScommessa(client).catch(() => null);
  }, 5 * 60 * 1000);
  return { ok: true, racers };
}

async function tryPuntaCommand(message, client) {
  const round = await getActiveRound("scommessa");
  if (!round?.payload || round.payload.status !== "active") return false;
  const parts = String(message.content || "").trim().split(/\s+/);
  /* +punta Name amount OR +punta Name Name amount */
  if (parts.length < 3) {
    await message.reply("Uso: `+punta <corridore> <importo>`").catch(() => null);
    return true;
  }
  const amount = safeHp(parts[parts.length - 1]);
  const name = parts.slice(1, -1).join(" ");
  const racer = round.payload.racers.find((r) => r.toLowerCase() === name.toLowerCase());
  if (!racer) {
    await message.reply("Corridore non in gara.").catch(() => null);
    return true;
  }
  if (amount < 9000) {
    await message.reply("Importo minimo 9000.").catch(() => null);
    return true;
  }
  const { getStarWarsWallet } = require("./starWarsEventWalletService");
  const wallet = await getStarWarsWallet(message.guildId, message.author.id);
  if (wallet.credits < amount) {
    await message.reply("Crediti insufficienti.").catch(() => null);
    return true;
  }
  const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
  const { ROOT } = require("./starWarsEventWalletService");
  await ActivityUserProfile.findOneAndUpdate(
    { guildId: message.guildId, userId: message.author.id, [`${ROOT}.credits`]: { $gte: amount } },
    { $inc: { [`${ROOT}.credits`]: -amount } },
  ).catch(() => null);

  const bets = { ...(round.payload.bets || {}) };
  bets[message.author.id] = { racer, amount };
  await setRound("scommessa", { ...round.payload, bets });
  await message.reply(`Puntata **${amount}** su **${racer}**.`).catch(() => null);
  return true;
}

async function resolveScommessa(client) {
  const round = await getActiveRound("scommessa");
  if (!round?.payload || round.payload.status !== "active") return;
  const racers = round.payload.racers || [];
  const winner = racers[Math.floor(Math.random() * racers.length)];
  const bets = round.payload.bets || {};
  await setRound("scommessa", { ...round.payload, status: "completed", winner });
  for (const [uid, bet] of Object.entries(bets)) {
    const won = bet.racer === winner;
    await grantStarWarsReward(client, {
      guildId: round.payload.guildId,
      userId: uid,
      reason: "scommessa",
      grant: won
        ? { crateId: "beta", crateQty: 1, exp: 100, credits: 6000 + Math.floor(bet.amount * 1.5) }
        : { exp: 100, credits: 6000 },
    });
  }
  const ch =
    client.channels.cache.get(round.payload.channelId) ||
    (await client.channels.fetch(round.payload.channelId).catch(() => null));
  if (ch?.send) {
    await ch.send(`🏁 Vince **${winner}**! Tutti i partecipanti ricevono premio base; chi ha puntato giusto prende di più.`).catch(() => null);
  }
}

/* ——— Staff spawn + loop ——— */
async function staffSpawn(client, kind, channelId) {
  switch (kind) {
    case "podrace":
      return spawnReactGame(client, "podrace", { channelId, force: true });
    case "ewok":
      return spawnReactGame(client, "ewok", { channelId, force: true });
    case "olocron":
      return spawnButtonGame(client, "olocron", { channelId, force: true });
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
      return startScommessa(client, { channelId, force: true });
    default:
      return { ok: false, error: "unknown_kind" };
  }
}

async function tickAutoSpawns(client) {
  const flags = getRuntimeFlags(client);
  if (!flags.enabled) return;
  if (!flags.publicEnabled && !flags.previewAutoSpawn) return;

  const jobs = [
    () => spawnReactGame(client, "podrace"),
    () => spawnReactGame(client, "ewok"),
    () => spawnButtonGame(client, "olocron"),
    () => startOrdine66(client),
    () => startScovaPianeta(client),
    () => startAttaccaBase(client),
    () => startConvoglio(client),
    () => startConquista(client),
    () => spawnDeckDrop(client, "pg"),
    () => spawnDeckDrop(client, "relic"),
    () => startScommessa(client),
  ];
  /* sparse: one random eligible attempt per tick */
  const job = jobs[Math.floor(Math.random() * jobs.length)];
  await job().catch(() => null);
}

function startStarWarsMinigamesLoop(client) {
  if (!client || loopState.has(client)) return;
  loopState.add(client);
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

async function handleStarWarsMessage(message, client) {
  if (!message?.guild || message.author?.bot) return false;
  if (await tryScovaMessage(message, client)) return true;
  if (await tryAttaccaBaseMessage(message, client)) return true;
  if (await tryDeckMessage(message, client)) return true;
  return false;
}

module.exports = {
  startStarWarsMinigamesLoop,
  staffSpawn,
  handleStarWarsReaction,
  handleStarWarsButton,
  handleStarWarsMessage,
  tryOrdine66Command,
  tryPuntaCommand,
  tryConquistaCommand,
  isHighStaffMember,
};
