const { ChannelType, PermissionsBitField, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas");
const { resolveHogwartsEventConfig } = require("../../Utils/Web/hogwartsSortingConfig");
const { getHouseMeta, HOUSES } = require("../../Utils/Web/hogwartsSortingBank");
const { pickSpellListPair, formatSpellListBody } = require("../../Utils/Community/hogwartsForbiddenSpellLists");
const { assignManualHousePoints } = require("./hogwartsManualHousePointsService");
const { isUserHighStaffExcludedFromHogwartsEvent } = require("../../Utils/Web/hogwartsEventParticipation");
const { getGuildMemberCached, getGuildChannelCached } = require("../../Utils/Interaction/interactionEntityCache");
const IDs = require("../../Utils/Config/ids");
const HUNT_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_SPELL_LIST_HUNT;
const SORTING_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_SORTING;
const EVENT_OWNER_ID = "__event__";
const TIME_ZONE = "Europe/Rome";
const BUTTON_PREFIX = "hogwarts_spell_list";
const DEFAULT_CONFIG = {
  enabled: true,
  eventKey: "hogwarts_spell_list_hunt_2026",
  eventDate: "2026-08-22",
  eventEndDate: "2026-08-23",
  startHour: 12,
  endHour: 10,
  roundDurationMs: 55 * 60 * 1000,
  rewardHousePoints: 100,
};
const loopState = new WeakSet();

function normalizeId(value) {
  return String(value || "").trim();
}

function cfg(client) {
  const raw = client?.config?.hogwartsSpellListHunt && typeof client.config.hogwartsSpellListHunt === "object"
    ? client.config.hogwartsSpellListHunt
    : {};
  const out = { ...DEFAULT_CONFIG, ...raw };
  out.enabled = out.enabled !== false;
  out.eventKey = normalizeId(out.eventKey) || DEFAULT_CONFIG.eventKey;
  out.eventDate = normalizeId(out.eventDate) || DEFAULT_CONFIG.eventDate;
  out.startHour = Math.max(0, Math.min(23, Math.floor(Number(out.startHour) || DEFAULT_CONFIG.startHour)));
  out.endHour = Math.max(0, Math.min(24, Math.floor(Number(out.endHour) ?? DEFAULT_CONFIG.endHour)));
  const overnight = out.endHour <= out.startHour;
  out.eventEndDate = normalizeId(out.eventEndDate) || (overnight ? nextDateKey(out.eventDate) : out.eventDate);
  out.roundDurationMs = Math.max(5 * 60 * 1000, Math.floor(Number(out.roundDurationMs) || DEFAULT_CONFIG.roundDurationMs));
  out.rewardHousePoints = Math.max(0, Math.floor(Number(out.rewardHousePoints) || DEFAULT_CONFIG.rewardHousePoints));
  out.announceChannelId = normalizeId(out.announceChannelId || IDs.channels?.chat);
  out.eventsRoleId = normalizeId(out.eventsRoleId || IDs.roles?.HogwartsEventParticipant);
  out.leaderboardChannelId = normalizeId(out.leaderboardChannelId || IDs.channels?.hogwartsHouseActivityReport);
  out.excludedChannelIds = (Array.isArray(out.excludedChannelIds) ? out.excludedChannelIds : [])
    .map(normalizeId)
    .filter(Boolean);
  if (!out.excludedChannelIds.includes(out.announceChannelId)) out.excludedChannelIds.push(out.announceChannelId);
  return out;
}

function getRomeParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function romeDateKey(parts) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function nextDateKey(dateKey) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || "").trim());
  if (!m) return "";
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1);
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function isWithinHuntWindow(parts, c) {
  const today = romeDateKey(parts);
  const hour = parts.hour;
  if (c.endHour > c.startHour) {
    return today === c.eventDate && hour >= c.startHour && hour < c.endHour;
  }
  if (today === c.eventDate && hour >= c.startHour) return true;
  if (today === c.eventEndDate && hour < c.endHour) return true;
  return false;
}

function huntRoundIndex(parts, c) {
  const today = romeDateKey(parts);
  const hour = parts.hour;
  if (today === c.eventDate) return hour - c.startHour;
  if (today === c.eventEndDate) return 24 - c.startHour + hour;
  return 0;
}

function isHuntCalendarDay(parts, c) {
  const today = romeDateKey(parts);
  return today === c.eventDate || today === c.eventEndDate;
}

function isSpellListHuntEventEnded(c, date = new Date()) {
  if (!c?.enabled) return false;
  const parts = getRomeParts(date);
  const today = romeDateKey(parts);
  if (today > c.eventEndDate) return true;
  if (today < c.eventEndDate) return false;
  return parts.hour >= c.endHour;
}

function roundIdFromParts(parts) {
  return `${String(parts.year)}${String(parts.month).padStart(2, "0")}${String(parts.day).padStart(2, "0")}T${String(parts.hour).padStart(2, "0")}`;
}

function dedupeKeyFromRoundId(eventKey, roundId) {
  return `${normalizeId(eventKey)}:${normalizeId(roundId)}`;
}

function parseButtonCustomId(customId) {
  const raw = String(customId || "");
  if (!raw.startsWith(`${BUTTON_PREFIX}:`)) return null;
  const parts = raw.split(":");
  if (parts.length < 3) return null;
  const roundId = normalizeId(parts[1]);
  const slot = normalizeId(parts[2]).toLowerCase();
  if (!roundId || (slot !== "a" && slot !== "b")) return null;
  return { roundId, slot };
}

function buildButtonCustomId(roundId, slot) {
  return `${BUTTON_PREFIX}:${normalizeId(roundId)}:${slot}`;
}

function normalizeHouseId(value) {
  const house = normalizeId(value).toLowerCase();
  return HOUSES.includes(house) ? house : "";
}

function houseLabel(houseId, client) {
  const eventCfg = resolveHogwartsEventConfig(client);
  const crest = String(eventCfg?.houses?.[houseId]?.crestUrl || "").trim();
  return getHouseMeta(houseId, crest || undefined)?.label || houseId;
}

async function resolveSortedHouse(guildId, userId, hogwartsEventKey) {
  const doc = await SiteDocument.findOne({
    docType: SORTING_DOC,
    guildId: normalizeId(guildId),
    userId: normalizeId(userId),
    dedupeKey: normalizeId(hogwartsEventKey) || "hogwarts",
  })
    .select("status planKey rawWebhook.houseId")
    .lean()
    .catch(() => null);
  return normalizeHouseId(doc?.status || doc?.rawWebhook?.houseId || doc?.planKey);
}

async function pickRandomHuntChannel(guild, c) {
  if (!guild) return null;
  await guild.channels.fetch().catch(() => null);
  const me = guild.members.me || guild.members.cache.get(guild.client?.user?.id);
  const excluded = new Set(c.excludedChannelIds);
  const memberRoleId = normalizeId(IDs.roles?.Member);
  const roleToCheck = memberRoleId ? guild.roles.cache.get(memberRoleId) : guild.roles.everyone;
  const channels = guild.channels.cache.filter((channel) => {
    if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) return false;
    if (excluded.has(channel.id)) return false;
    if (!channel.viewable) return false;
    if (me && !me.permissions?.has(PermissionsBitField.Flags.Administrator)) {
      const perms = channel.permissionsFor(me);
      if (!perms?.has([PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages])) return false;
    }
    const memberPerms = channel.permissionsFor(roleToCheck);
    if (!memberPerms?.has([PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages])) return false;
    return true;
  });
  const list = [...channels.values()];
  if (!list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}

function buildListEmbed(pair, slot, roundId) {
  const isA = slot === "a";
  const title = isA ? pair.titleA : pair.titleB;
  const spells = isA ? pair.spellsA : pair.spellsB;
  return new EmbedBuilder()
    .setColor(0x2b1a10)
    .setTitle(`📜 ${title}`)
    .setDescription(
      [
        "<a:VC_Events:1482706144953897223> **Lista della Sezione Proibita**.",
        "",
        formatSpellListBody(spells),
        "",
        "> Premi il bottone qui sotto.",
      ].join("\n"),
    )
    .setFooter({ text: `Turno ${roundId.replace("T", " · ")}` });
}

async function disableListButtons(message, reason) {
  if (!message?.editable) return;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("hogwarts_spell_list_disabled")
      .setLabel(String(reason || "Turno concluso").slice(0, 80))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
  );
  await message.edit({ components: [row] }).catch(() => null);
}

async function loadRound(guildId, eventKey, roundId) {
  return SiteDocument.findOne({
    docType: HUNT_DOC,
    guildId: normalizeId(guildId),
    userId: EVENT_OWNER_ID,
    dedupeKey: dedupeKeyFromRoundId(eventKey, roundId),
  })
    .lean()
    .catch(() => null);
}

async function saveRound(doc) {
  if (!doc?._id) return doc;
  await SiteDocument.updateOne({ _id: doc._id }, { $set: { status: doc.status, rawWebhook: doc.rawWebhook } }).catch(() => null);
  return doc;
}

async function announceInChat(client, guild, c, text, embeds = []) {
  const channel = await getGuildChannelCached(guild, c.announceChannelId).catch(() => null);
  if (!channel?.isTextBased?.()) return null;
  const ping = c.eventsRoleId ? `<@&${c.eventsRoleId}>` : "";
  return channel
    .send({
      content: [ping, text].filter(Boolean).join("\n"),
      embeds,
      allowedMentions: c.eventsRoleId ? { roles: [c.eventsRoleId] } : { parse: [] },
    })
    .catch(() => null);
}

async function finalizeMixedHouses(client, guild, c, doc, houseA, houseB) {
  doc.status = "mixed_houses";
  doc.rawWebhook.resolvedAt = new Date();
  await saveRound(doc);
  const labelA = houseLabel(houseA, client);
  const labelB = houseLabel(houseB, client);
  await announceInChat(
    client,
    guild,
    c,
    `<a:VC_Alert:1482706673176150077> **Caccia alle liste** — le due liste sono state trovate da case diverse (**${labelA}** e **${labelB}**). Nessun punto casa assegnato per questo turno.`,
  );
  for (const key of ["a", "b"]) {
    const row = doc.rawWebhook?.lists?.[key];
    if (!row?.messageId || !row?.channelId) continue;
    const ch = await getGuildChannelCached(guild, row.channelId).catch(() => null);
    const msg = ch ? await ch.messages.fetch(row.messageId).catch(() => null) : null;
    if (msg) await disableListButtons(msg, "Case diverse — nessun premio");
  }
}

async function finalizeHouseWin(client, guild, c, doc, houseId, claimA, claimB) {
  doc.status = "won";
  doc.rawWebhook.resolvedAt = new Date();
  doc.rawWebhook.winningHouseId = houseId;
  await saveRound(doc);
  const pts = c.rewardHousePoints;
  if (pts > 0) {
    await assignManualHousePoints(client, {
      guildId: guild.id,
      houseId,
      points: pts,
      actorId: "bot",
      reason: `Caccia alle liste ${doc.rawWebhook?.roundLabel || ""}`,
    });
  }
  const label = houseLabel(houseId, client);
  const embed = new EmbedBuilder()
    .setColor(0xd4af37)
    .setTitle("<a:VC_Events:1482706144953897223> Caccia alle liste — Vittoria!")
    .setDescription(
      [
        `La **${label}** ha trovato **entrambe** le liste con due maghi diversi:`,
        `• <@${claimA.userId}>`,
        `• <@${claimB.userId}>`,
        "",
        pts > 0 ? `<a:VC_Winner:1482535294757507255> **+${pts} punti casa** alla ${label}.` : "",
      ].join("\n"),
    )
    .setTimestamp();
  await announceInChat(client, guild, c, "", [embed]);
  for (const key of ["a", "b"]) {
    const row = doc.rawWebhook?.lists?.[key];
    if (!row?.messageId || !row?.channelId) continue;
    const ch = await getGuildChannelCached(guild, row.channelId).catch(() => null);
    const msg = ch ? await ch.messages.fetch(row.messageId).catch(() => null) : null;
    if (msg) await disableListButtons(msg, "Lista raccolta");
  }
}

async function spawnRound(client, guild, c, parts) {
  const roundId = roundIdFromParts(parts);
  const dedupeKey = dedupeKeyFromRoundId(c.eventKey, roundId);
  const existing = await loadRound(guild.id, c.eventKey, roundId);
  if (existing) return false;
  const pair = pickSpellListPair(huntRoundIndex(parts, c));
  if (!pair) return false;
  let channelA = await pickRandomHuntChannel(guild, c);
  let channelB = await pickRandomHuntChannel(guild, c);
  if (!channelA || !channelB) return false;
  if (channelA.id === channelB.id) {
    channelB = await pickRandomHuntChannel(guild, { ...c, excludedChannelIds: [...c.excludedChannelIds, channelA.id] });
  }
  if (!channelB || channelB.id === channelA.id) return false;
  const expiresAt = new Date(Date.now() + c.roundDurationMs);
  const roundLabel = `${parts.hour}:00`;
  const postList = async (channel, slot) => {
    const embed = buildListEmbed(pair, slot, roundId);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(buildButtonCustomId(roundId, slot))
        .setLabel(slot === "a" ? "Ho trovato questa lista" : "Ho trovato questa lista")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("📜"),
    );
    const msg = await channel.send({ embeds: [embed], components: [row] }).catch(() => null);
    return msg?.id ? { channelId: channel.id, messageId: msg.id } : null;
  };
  const listA = await postList(channelA, "a");
  const listB = await postList(channelB, "b");
  if (!listA || !listB) {
    if (listA?.messageId) {
      const ch = await getGuildChannelCached(guild, listA.channelId).catch(() => null);
      const msg = ch ? await ch.messages.fetch(listA.messageId).catch(() => null) : null;
      if (msg) await msg.delete().catch(() => null);
    }
    if (listB?.messageId) {
      const ch = await getGuildChannelCached(guild, listB.channelId).catch(() => null);
      const msg = ch ? await ch.messages.fetch(listB.messageId).catch(() => null) : null;
      if (msg) await msg.delete().catch(() => null);
    }
    return false;
  }
  const intro = new EmbedBuilder()
    .setColor(0xd4af37)
    .setTitle("<a:VC_Events:1482706144953897223> Caccia alle liste — Sezione Proibita")
    .setDescription(
      [
        "Sono state nascoste **due liste di incantesimi** della Sezione Proibita in **due canali** del server.",
        "",
        "Per vincere **punti casa** servono **due maghi diversi della stessa casa**: uno per lista.",
        "Se le trovano case diverse, **nessun punto** per questo turno.",
        "",
        `> Turno attivo fino alle **${String(parts.hour + 1).padStart(2, "0")}:00**.`,
      ].join("\n"),
    );
  const announceMsg = await announceInChat(client, guild, c, "", [intro]);
  await SiteDocument.findOneAndUpdate(
    { docType: HUNT_DOC, guildId: guild.id, userId: EVENT_OWNER_ID, dedupeKey },
    {
      $setOnInsert: {
        docType: HUNT_DOC,
        guildId: guild.id,
        userId: EVENT_OWNER_ID,
        dedupeKey,
        createdBy: "bot",
      },
      $set: {
        status: "active",
        planKey: c.eventKey,
        rawWebhook: {
          eventKey: c.eventKey,
          roundId,
          roundLabel,
          expiresAt,
          announceMessageId: announceMsg?.id || "",
          pairIndex: huntRoundIndex(parts, c),
          lists: { a: listA, b: listB },
          claims: {},
        },
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  global.logger?.info?.(`[HOGWARTS SPELL LIST HUNT] Turno ${roundId} avviato (#${channelA.name}, #${channelB.name}).`);
  return true;
}

async function expireRound(client, guild, c, doc) {
  if (!doc || doc.status !== "active") return;
  doc.status = "expired";
  doc.rawWebhook.resolvedAt = new Date();
  await saveRound(doc);
  await announceInChat(
    client,
    guild,
    c,
    `<a:VC_Alert:1482706673176150077> **Caccia alle liste** — turno **${doc.rawWebhook?.roundLabel || ""}** scaduto senza vittoria di casata.`,
  );
  for (const key of ["a", "b"]) {
    const row = doc.rawWebhook?.lists?.[key];
    if (!row?.messageId || !row?.channelId) continue;
    const ch = await getGuildChannelCached(guild, row.channelId).catch(() => null);
    const msg = ch ? await ch.messages.fetch(row.messageId).catch(() => null) : null;
    if (msg) await disableListButtons(msg, "Turno scaduto");
  }
}

async function tickRounds(client) {
  const c = cfg(client);
  if (!c.enabled) return;
  const parts = getRomeParts();
  if (!isHuntCalendarDay(parts, c)) return;
  const guildId = normalizeId(IDs.guilds?.main || client?.guilds?.cache?.first?.()?.id);
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return;
  const hogwartsEventKey = normalizeId(resolveHogwartsEventConfig(client)?.eventKey) || "hogwarts";
  if (isWithinHuntWindow(parts, c) && parts.minute < 8) {
    await spawnRound(client, guild, c, parts);
  }
  const active = await SiteDocument.find({
    docType: HUNT_DOC,
    guildId: guild.id,
    userId: EVENT_OWNER_ID,
    status: "active",
    planKey: c.eventKey,
  })
    .lean()
    .catch(() => []);
  const now = Date.now();
  for (const doc of active) {
    const exp = doc?.rawWebhook?.expiresAt ? new Date(doc.rawWebhook.expiresAt).getTime() : 0;
    if (Number.isFinite(exp) && now > exp) await expireRound(client, guild, c, doc);
  }
}

async function handleSpellListHuntButton(interaction, client) {
  const parsed = parseButtonCustomId(interaction.customId);
  if (!parsed) return false;
  const c = cfg(client);
  const guildId = normalizeId(interaction.guild?.id);
  const uid = normalizeId(interaction.user?.id);
  if (!guildId || !uid) return true;
  const doc = await loadRound(guildId, c.eventKey, parsed.roundId);
  if (!doc || doc.status !== "active") {
    await interaction
      .reply({ content: "<a:VC_Alert:1482706673176150077> Questo turno non è più attivo.", flags: 1 << 6 })
      .catch(() => null);
    return true;
  }
  const exp = doc.rawWebhook?.expiresAt ? new Date(doc.rawWebhook.expiresAt).getTime() : 0;
  if (Number.isFinite(exp) && Date.now() > exp) {
    await interaction
      .reply({ content: "<a:VC_Alert:1482706673176150077> Il tempo per questo turno è scaduto.", flags: 1 << 6 })
      .catch(() => null);
    return true;
  }
  const member = interaction.member || (await getGuildMemberCached(interaction.guild, uid).catch(() => null));
  if (await isUserHighStaffExcludedFromHogwartsEvent(client, uid, member)) {
    await interaction
      .reply({ content: "<a:VC_Alert:1482706673176150077> Non puoi partecipare a questo evento.", flags: 1 << 6 })
      .catch(() => null);
    return true;
  }
  const hogwartsEventKey = normalizeId(resolveHogwartsEventConfig(client)?.eventKey) || "hogwarts";
  const houseId = await resolveSortedHouse(guildId, uid, hogwartsEventKey);
  if (!houseId) {
    await interaction
      .reply({
        content: "<a:VC_Alert:1482706673176150077> Completa lo **smistamento** per segnalare una lista.",
        flags: 1 << 6,
      })
      .catch(() => null);
    return true;
  }
  const claims = doc.rawWebhook?.claims && typeof doc.rawWebhook.claims === "object" ? { ...doc.rawWebhook.claims } : {};
  const slot = parsed.slot;
  const otherSlot = slot === "a" ? "b" : "a";
  if (claims[slot]?.userId) {
    const same = normalizeId(claims[slot].userId) === uid;
    await interaction
      .reply({
        content: same
          ? "<a:VC_Alert:1482706673176150077> Hai già segnalato questa lista."
          : "<a:VC_Alert:1482706673176150077> Questa lista è già stata trovata da un altro mago.",
        flags: 1 << 6,
      })
      .catch(() => null);
    return true;
  }
  if (claims[otherSlot]?.userId && normalizeId(claims[otherSlot].userId) === uid) {
    await interaction
      .reply({
        content: "<a:VC_Alert:1482706673176150077> Hai già trovato l'altra lista: serve un **secondo mago** della tua casata.",
        flags: 1 << 6,
      })
      .catch(() => null);
    return true;
  }
  claims[slot] = { userId: uid, houseId, at: new Date().toISOString() };
  doc.rawWebhook.claims = claims;
  await saveRound(doc);
  const label = houseLabel(houseId, client);
  if (!claims[otherSlot]?.userId) {
    await interaction
      .reply({
        content: `<a:VC_Events:1482706144953897223> Lista segnalata per la **${label}**! Manca ancora l'altra lista da un altro mago della tua casata.`,
        flags: 1 << 6,
      })
      .catch(() => null);
    return true;
  }
  const otherHouse = normalizeHouseId(claims[otherSlot].houseId);
  if (otherHouse && otherHouse !== houseId) {
    await finalizeMixedHouses(client, interaction.guild, c, doc, houseId, otherHouse);
    await interaction
      .reply({
        content: `<a:VC_Alert:1482706673176150077> Liste trovate da **case diverse** (${label} e ${houseLabel(otherHouse, client)}): nessun punto casa questo turno.`,
        flags: 1 << 6,
      })
      .catch(() => null);
    return true;
  }
  await finalizeHouseWin(client, interaction.guild, c, doc, houseId, claims.a, claims.b);
  await interaction
    .reply({
      content: `<a:VC_Events:1482706144953897223> **${label}** completa il turno! +${c.rewardHousePoints} punti casa.`,
      flags: 1 << 6,
    })
    .catch(() => null);
  return true;
}

function startHogwartsSpellListHuntLoop(client) {
  if (!client || loopState.has(client)) return;
  loopState.add(client);
  const tick = () => {
    tickRounds(client).catch((err) => global.logger?.warn?.("[HOGWARTS SPELL LIST HUNT] tick:", err?.message || err));
  };
  const first = setTimeout(tick, 45 * 1000);
  if (typeof first.unref === "function") first.unref();
  const interval = setInterval(tick, 60 * 1000);
  if (typeof interval.unref === "function") interval.unref();
}

module.exports = { cfg, isSpellListHuntEventEnded, handleSpellListHuntButton, startHogwartsSpellListHuntLoop };