const { ChannelType, PermissionsBitField, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js") as typeof import("discord.js");
const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../../../../../src/Vinili/Community/schemas/communitySchemas") as typeof import("../../../../../../src/Vinili/Community/schemas/communitySchemas");
const { resolveHogwartsEventConfig } = require("../../Utils/Web/hogwartsSortingConfig") as typeof import("../../Utils/Web/hogwartsSortingConfig");
const { getHouseMeta, HOUSES } = require("../../Utils/Web/hogwartsSortingBank") as typeof import("../../Utils/Web/hogwartsSortingBank");
const { pickSpellListPair, formatSpellListBody } = require("../../Utils/Community/hogwartsForbiddenSpellLists") as typeof import("../../Utils/Community/hogwartsForbiddenSpellLists");
const { assignManualHousePoints } = require("./hogwartsManualHousePointsService") as typeof import("./hogwartsManualHousePointsService");
const { addGaleoni, formatGaleoni } = require("./gringottService") as typeof import("./gringottService");
const { isUserHighStaffExcludedFromHogwartsEvent } = require("../../Utils/Web/hogwartsEventParticipation") as typeof import("../../Utils/Web/hogwartsEventParticipation");
const { getGuildMemberCached, getGuildChannelCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const HUNT_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_SPELL_LIST_HUNT;
const SORTING_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_SORTING;
const EVENT_OWNER_ID = "__event__";
const TIME_ZONE = "Europe/Rome";
const BUTTON_PREFIX = "hogwarts_spell_list";
const SPELL_LIST_CLAIM_FIX_MARKER = "spellListChaosContest1";
const DEFAULT_CONFIG = {
  enabled: true,
  eventKey: "hogwarts_spell_list_hunt_2026",
  eventDate: "2026-08-22",
  eventEndDate: "2026-08-23",
  startHour: 12,
  endHour: 12,
  roundDurationMs: 55 * 60 * 1000,
  rewardHousePoints: 100,
  rewardGaleoni: 50,
  slotIntervalMs: 60 * 60 * 1000,
  spawnMinOffsetMs: 3 * 60 * 1000,
  spawnMaxOffsetMs: 52 * 60 * 1000,
  hintBeforeExpiryMs: 5 * 60 * 1000,
};
const loopState = new WeakSet();

function normalizeId(value?) {
  return String(value || "").trim();
}

function safeInt(value?, fallback?, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function cfg(client?) {
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
  out.rewardGaleoni = Math.max(0, Math.floor(Number(out.rewardGaleoni) || DEFAULT_CONFIG.rewardGaleoni));
  out.slotIntervalMs = safeInt(out.slotIntervalMs, DEFAULT_CONFIG.slotIntervalMs, 60_000, 24 * 60 * 60 * 1000);
  out.spawnMinOffsetMs = safeInt(out.spawnMinOffsetMs, DEFAULT_CONFIG.spawnMinOffsetMs, 0, out.slotIntervalMs - 60_000);
  out.spawnMaxOffsetMs = safeInt(
    out.spawnMaxOffsetMs,
    DEFAULT_CONFIG.spawnMaxOffsetMs,
    out.spawnMinOffsetMs,
    out.slotIntervalMs - 60_000,
  );
  out.hintBeforeExpiryMs = safeInt(
    out.hintBeforeExpiryMs,
    DEFAULT_CONFIG.hintBeforeExpiryMs,
    60_000,
    out.roundDurationMs,
  );
  out.announceChannelId = normalizeId(out.announceChannelId || IDs.channels?.chat);
  out.eventsRoleId = normalizeId(out.eventsRoleId || IDs.roles?.HogwartsEventParticipant);
  out.leaderboardChannelId = normalizeId(out.leaderboardChannelId || IDs.channels?.eventAnnouncements);
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
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p?) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function romeDateKey(parts?) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function nextDateKey(dateKey?) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || "").trim());
  if (!m) return "";
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1);
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function isWithinHuntWindow(parts?, c?) {
  const today = romeDateKey(parts);
  const hour = parts.hour;
  if (c.endHour > c.startHour) {
    return today === c.eventDate && hour >= c.startHour && hour < c.endHour;
  }
  if (today === c.eventDate && hour >= c.startHour) return true;
  if (today === c.eventEndDate && hour < c.endHour) return true;
  return false;
}

function huntRoundIndex(parts?, c?) {
  const today = romeDateKey(parts);
  const hour = parts.hour;
  if (today === c.eventDate) return hour - c.startHour;
  if (today === c.eventEndDate) return 24 - c.startHour + hour;
  return 0;
}

function isHuntCalendarDay(parts?, c?) {
  const today = romeDateKey(parts);
  return today === c.eventDate || today === c.eventEndDate;
}

function isSpellListHuntEventEnded(c?, date = new Date()) {
  if (!c?.enabled) return false;
  const parts = getRomeParts(date);
  const today = romeDateKey(parts);
  if (today > c.eventEndDate) return true;
  if (today < c.eventEndDate) return false;
  return parts.hour >= c.endHour;
}

function roundIdFromParts(parts?) {
  return `${String(parts.year)}${String(parts.month).padStart(2, "0")}${String(parts.day).padStart(2, "0")}T${String(parts.hour).padStart(2, "0")}`;
}

function lastRoundHour(c?) {
  if (c.endHour > c.startHour) return Math.max(c.startHour, c.endHour - 1);
  return Math.max(0, c.endHour - 1);
}

function isFirstRoundSlot(parts?, c?) {
  return romeDateKey(parts) === c.eventDate && parts.hour === c.startHour;
}

function isLastRoundSlot(parts?, c?) {
  return romeDateKey(parts) === c.eventEndDate && parts.hour === lastRoundHour(c);
}

function slotSpawnOffsetMs(c?, roundId?, parts?) {
  if (parts && (isFirstRoundSlot(parts, c) || isLastRoundSlot(parts, c))) return 0;
  const intervalMs = safeInt(c.slotIntervalMs, DEFAULT_CONFIG.slotIntervalMs, 60_000, 24 * 60 * 60 * 1000);
  const minOffset = safeInt(c.spawnMinOffsetMs, DEFAULT_CONFIG.spawnMinOffsetMs, 0, intervalMs - 60_000);
  const maxOffset = safeInt(c.spawnMaxOffsetMs, DEFAULT_CONFIG.spawnMaxOffsetMs, minOffset, intervalMs - 60_000);
  const span = Math.max(0, maxOffset - minOffset);
  const seed = `${normalizeId(c.eventKey)}:${normalizeId(roundId)}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return minOffset + (span > 0 ? hash % (span + 1) : 0);
}

function shouldSpawnHourSlot(parts?, c?) {
  if (!isWithinHuntWindow(parts, c)) return false;
  const roundId = roundIdFromParts(parts);
  const offsetMs = slotSpawnOffsetMs(c, roundId, parts);
  const elapsedMs = Math.max(0, Math.floor(Number(parts.minute) || 0)) * 60 * 1000;
  return elapsedMs >= offsetMs;
}

function dedupeKeyFromRoundId(eventKey?, roundId?) {
  return `${normalizeId(eventKey)}:${normalizeId(roundId)}`;
}

function parseButtonCustomId(customId?) {
  const raw = String(customId || "");
  if (!raw.startsWith(`${BUTTON_PREFIX}:`)) return null;
  const parts = raw.split(":");
  if (parts.length < 3) return null;
  const roundId = normalizeId(parts[1]);
  const slot = normalizeId(parts[2]).toLowerCase();
  if (!roundId || (slot !== "a" && slot !== "b")) return null;
  return { roundId, slot };
}

function buildButtonCustomId(roundId?, slot?) {
  return `${BUTTON_PREFIX}:${normalizeId(roundId)}:${slot}`;
}

function normalizeHouseId(value?) {
  const house = normalizeId(value).toLowerCase();
  return HOUSES.includes(house) ? house : "";
}

function houseLabel(houseId?, client?) {
  const eventCfg = resolveHogwartsEventConfig(client);
  const crest = String(eventCfg?.houses?.[houseId]?.crestUrl || "").trim();
  return getHouseMeta(houseId, crest || undefined)?.label || houseId;
}

async function resolveSortedHouse(guildId?, userId?, hogwartsEventKey?) {
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

async function pickRandomHuntChannel(guild?, c?) {
  if (!guild) return null;
  await guild.channels.fetch().catch(() => null);
  const me = guild.members.me || guild.members.cache.get(guild.client?.user?.id);
  const excluded = new Set(c.excludedChannelIds);
  const client = guild.client;
  if (client) {
    try {
      const { isHouseChannelQuietHours, listHouseChannelIds } = require("./hogwartsHouseChannelMinigameService") as typeof import("./hogwartsHouseChannelMinigameService");
      if (isHouseChannelQuietHours(client)) {
        for (const id of listHouseChannelIds()) excluded.add(id);
      }
    } catch (_) {}
  }
  const memberRoleId = normalizeId(IDs.roles?.Member);
  const roleToCheck = memberRoleId ? guild.roles.cache.get(memberRoleId) : guild.roles.everyone;
  const channels = guild.channels.cache.filter((channel?) => {
    if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) return false;
    if (excluded.has(channel.id)) return false;
    if (!channel.viewable) return false;
    if (me && !me.permissions?.has(PermissionsBitField.Flags.Administrator)) {
      const perms = channel.permissionsFor(me);
      if (!perms?.has([PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages])) return false;
    }
    const memberPerms = channel.permissionsFor(roleToCheck);
    if (!memberPerms?.has(PermissionsBitField.Flags.ViewChannel)) return false;
    return true;
  });
  const list = [...channels.values()];
  if (!list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}

function buildListEmbed(pair?, slot?, roundId?) {
  const isA = slot === "a";
  const title = isA ? pair.titleA : pair.titleB;
  const spells = isA ? pair.spellsA : pair.spellsB;
  return new EmbedBuilder()
    .setColor(0x2b1a10)
    .setTitle(`<:VC_emoji:1485419161168511036> ${title}`)
    .setDescription(
      [
        "<a:VC_Events:1482706144953897223> **Lista della Sezione Proibita**.",
        "",
        formatSpellListBody(spells),
        "",
        "> Premi il bottone qui sotto.",
      ].join("\n"),
    )
    .setFooter({ text: `Turno ${roundId.replace("T", " \u2022 ")}` });
}

async function disableListButtons(message?, reason?) {
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

async function deleteSpawnedListMessages(guild?, doc?, fallbackReason = "Turno concluso") {
  const lists = doc?.rawWebhook?.lists;
  if (!lists || typeof lists !== "object") return;
  for (const key of ["a", "b"]) {
    const row = lists[key];
    if (!row?.messageId || !row?.channelId) continue;
    const ch = await getGuildChannelCached(guild, row.channelId).catch(() => null);
    if (!ch?.messages?.fetch) continue;
    const msg = await ch.messages.fetch(row.messageId).catch(() => null);
    if (!msg) continue;
    if (msg.deletable) {
      await msg.delete().catch(() => disableListButtons(msg, fallbackReason));
    } else {
      await disableListButtons(msg, fallbackReason);
    }
  }
}

async function loadRound(guildId?, eventKey?, roundId?) {
  return SiteDocument.findOne({
    docType: HUNT_DOC,
    guildId: normalizeId(guildId),
    userId: EVENT_OWNER_ID,
    dedupeKey: dedupeKeyFromRoundId(eventKey, roundId),
  })
    .lean()
    .catch(() => null);
}

async function loadActiveRoundByRoundId(guildId?, roundId?) {
  const rid = normalizeId(roundId);
  if (!rid) return null;
  return SiteDocument.findOne({
    docType: HUNT_DOC,
    guildId: normalizeId(guildId),
    userId: EVENT_OWNER_ID,
    status: "active",
    "rawWebhook.roundId": rid,
  })
    .lean()
    .catch(() => null);
}

async function saveRound(doc?) {
  if (!doc?._id) return doc;
  await SiteDocument.updateOne({ _id: doc._id }, { $set: { status: doc.status, rawWebhook: doc.rawWebhook } }).catch(() => null);
  return doc;
}

function readClaims(doc?) {
  return doc?.rawWebhook?.claims && typeof doc.rawWebhook.claims === "object" ? doc.rawWebhook.claims : {};
}

async function atomicClaimSlot(docId?, slot?, claim?, expectedSlotUserId = null) {
  if (!docId || (slot !== "a" && slot !== "b") || !claim?.userId) return null;
  const userField = `rawWebhook.claims.${slot}.userId`;
  const claimField = `rawWebhook.claims.${slot}`;
  const filter: Record<string, any> = { _id: docId, status: "active" };
  if (expectedSlotUserId) {
    filter[userField] = normalizeId(expectedSlotUserId);
  } else {
    filter.$or = [{ [userField]: { $exists: false } }, { [userField]: null }, { [userField]: "" }];
  }
  return SiteDocument.findOneAndUpdate(filter, { $set: { [claimField]: claim } }, { new: true })
    .lean()
    .catch(() => null);
}

function canOverwriteSpellListSlot(slotClaim?, otherClaim?, houseId?) {
  const slotHouse = normalizeHouseId(slotClaim?.houseId);
  if (!slotClaim?.userId || !houseId || slotHouse === houseId) return false;
  if (!otherClaim?.userId) return true;
  return normalizeHouseId(otherClaim.houseId) === houseId;
}

function spellListAlreadyFoundReply(otherListOpen = true) {
  const tail = otherListOpen
    ? " Cerca **l'altra lista** in un altro canale del server."
    : "";
  return `<a:VC_Alert:1482706673176150077> Questa lista \u00e8 gi\u00e0 stata trovata da un altro mago.${tail}`;
}

function spellListCrossHouseReply(client?, houseId?, otherHouse?) {
  const label = houseLabel(houseId, client);
  const otherLabel = houseLabel(otherHouse, client);
  return `<a:VC_Alert:1482706673176150077> Liste trovate da **case diverse** (**${label}** e **${otherLabel}**). Il turno **resta aperto**: un compagno di casata pu\u00f2 riprendere lo slot sbagliato, oppure si attende la scadenza.`;
}

async function announceInChat(client?, guild?, c?, text?, embeds = []) {
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

function announceCfgForDoc(c?, doc?) {
  const fc = doc?.rawWebhook?.finaleChaos && typeof doc.rawWebhook.finaleChaos === "object"
    ? doc.rawWebhook.finaleChaos
    : null;
  if (!fc) return c;
  return {
    ...c,
    announceChannelId: normalizeId(fc.announceChannelId) || c.announceChannelId,
    eventsRoleId: normalizeId(fc.pingRoleId) || c.eventsRoleId,
    hintBeforeExpiryMs: safeInt(fc.hintBeforeExpiryMs, c.hintBeforeExpiryMs, 60_000, 24 * 60 * 60 * 1000),
    roundDurationMs: safeInt(fc.durationMs, c.roundDurationMs, 5 * 60 * 1000, 24 * 60 * 60 * 1000),
  };
}

function formatSpellListHousePointsAward(points?, award?) {
  const pts = Math.max(0, Math.floor(Number(points) || 0));
  if (pts <= 0) return "";
  const mult = Math.max(1, Number(award?.multiplier) || 1);
  if (mult <= 1) return `**+${pts} punti casa**`;
  const boostName = String(award?.petName || award?.consumableLabels?.[0] || "boost").trim();
  return `**+${pts} punti casa** (×${mult}${boostName ? ` ${boostName}` : ""})`;
}

async function peekSpellListHousePointsAward(client?, guildId?, userId?, houseId?, basePoints?) {
  const base = Math.max(0, Math.floor(Number(basePoints) || 0));
  const uid = normalizeId(userId);
  const hid = normalizeHouseId(houseId);
  const gid = normalizeId(guildId);
  if (base <= 0 || !uid || !gid) {
    return { userId: uid, points: base, multiplier: 1, petMult: 1, consumableMult: 1, petName: "", consumableLabels: [], petUsable: false };
  }
  const {
    isHogwartsShopBoostActive,
    loadShopInventory,
    petHousePointsMultiplier,
    getShopDurableBoostUsage,
  } = require("./hogwartsShopBoostsService") as typeof import("./hogwartsShopBoostsService");
  const { SHOP_CATEGORIES } = require("../../Utils/Web/hogwartsShopCatalog") as typeof import("../../Utils/Web/hogwartsShopCatalog");
  const { resolveHousePointsConsumableMultiplier } = require("./hogwartsConsumableBoostsService") as typeof import("./hogwartsConsumableBoostsService");
  if (!isHogwartsShopBoostActive(client)) {
    return { userId: uid, points: base, multiplier: 1, petMult: 1, consumableMult: 1, petName: "", consumableLabels: [], petUsable: false };
  }
  const inventory = await loadShopInventory(gid, uid);
  const pet = inventory[SHOP_CATEGORIES.PET];
  let petMult = petHousePointsMultiplier(pet);
  let petUsable = petMult > 1;
  if (petUsable) {
    const usage: any = await getShopDurableBoostUsage(client, gid, uid, SHOP_CATEGORIES.PET);
    if (usage?.exhausted) {
      petMult = 1;
      petUsable = false;
    }
  }
  const consumable = await resolveHousePointsConsumableMultiplier(client, gid, uid, hid);
  const consumableMult = Math.max(1, Number(consumable?.multiplier) || 1);
  const multiplier = (petMult > 1 ? petMult : 1) * consumableMult;
  return {
    userId: uid,
    points: Math.max(0, Math.floor(base * multiplier)),
    multiplier,
    petMult: petMult > 1 ? petMult : 1,
    consumableMult,
    petName: petMult > 1 ? String(pet?.name || "").trim() : "",
    consumableLabels: Array.isArray(consumable?.labels) ? consumable.labels.filter(Boolean) : [],
    petUsable,
  };
}

async function resolveBestSpellListHousePointsAward(client?, guildId?, houseId?, userIds?, basePoints?) {
  const base = Math.max(0, Math.floor(Number(basePoints) || 0));
  const ids = [...new Set((Array.isArray(userIds) ? userIds : []).map((id?) => normalizeId(id)).filter(Boolean))];
  if (base <= 0 || !ids.length) {
    return { points: 0, multiplier: 1, petMult: 1, consumableMult: 1, petName: "", consumableLabels: [], userId: "" };
  }
  let best = await peekSpellListHousePointsAward(client, guildId, ids[0], houseId, base);
  for (let i = 1; i < ids.length; i += 1) {
    const row = await peekSpellListHousePointsAward(client, guildId, ids[i], houseId, base);
    if (row.points > best.points || (row.points === best.points && row.multiplier > best.multiplier)) best = row;
  }
  if (best.petUsable && best.petMult > 1 && best.userId) {
    const { tryConsumeShopDurableBoostUse, ensureShopBoostMinigameBackfill } = require("./hogwartsShopBoostsService") as typeof import("./hogwartsShopBoostsService");
    const { SHOP_CATEGORIES } = require("../../Utils/Web/hogwartsShopCatalog") as typeof import("../../Utils/Web/hogwartsShopCatalog");
    await ensureShopBoostMinigameBackfill(client, guildId, best.userId).catch(() => null);
    const consume = await tryConsumeShopDurableBoostUse(client, guildId, best.userId, SHOP_CATEGORIES.PET);
    if (!consume.ok) {
      best = {
        ...best,
        points: Math.max(0, Math.floor(base * best.consumableMult)),
        multiplier: best.consumableMult,
        petMult: 1,
        petName: "",
        petUsable: false,
      };
    }
  }
  return best;
}

async function awardSpellListGaleoniToWinners(client?, guildId?, eventKey?, roundId?, userIds?, amount?) {
  const gid = normalizeId(guildId);
  const ek = normalizeId(eventKey) || DEFAULT_CONFIG.eventKey;
  const rid = normalizeId(roundId);
  const credit = Math.max(0, Math.floor(Number(amount) || 0));
  const ids = [...new Set((Array.isArray(userIds) ? userIds : []).map((id?) => normalizeId(id)).filter(Boolean))];
  if (!gid || !rid || credit <= 0 || !ids.length) {
    return { paid: 0, total: 0, perUser: credit, payouts: [] };
  }
  const payouts = [];
  for (const uid of ids) {
    const result = await addGaleoni({
      guildId: gid,
      userId: uid,
      amount: credit,
      reason: "Caccia alle liste — turno vinto",
      actorId: "bot",
      source: "hogwarts_spell_list_hunt",
      eventKey: ek,
      rewardKey: `${ek}:${rid}:galeoni:${uid}`,
    });
    if (result?.ok === true) {
      payouts.push({ userId: uid, amount: credit });
    }
  }
  const total = payouts.reduce((sum?, row?) => sum + row.amount, 0);
  return { paid: payouts.length, total, perUser: credit, payouts };
}

function formatSpellListGaleoniLine(payouts?) {
  const rows = Array.isArray(payouts) ? payouts : [];
  if (!rows.length) return "";
  return rows.map((row?) => `<@${row.userId}> — **${formatGaleoni(row.amount)}**`).join("\n");
}

async function finalizeHouseWin(client?, guild?, c?, doc?, houseId?, claimA?, claimB?) {
  doc.status = "won";
  doc.rawWebhook.resolvedAt = new Date();
  doc.rawWebhook.winningHouseId = houseId;
  await saveRound(doc);
  const basePts = c.rewardHousePoints;
  const award = await resolveBestSpellListHousePointsAward(
    client,
    guild.id,
    houseId,
    [claimA?.userId, claimB?.userId],
    basePts,
  );
  const pts = award.points;
  if (pts > 0) {
    await assignManualHousePoints(client, {
      guildId: guild.id,
      houseId,
      points: pts,
      actorId: "bot",
      reason: `Caccia alle liste ${doc.rawWebhook?.roundLabel || ""}`,
    });
  }
  const galeoniAward = await awardSpellListGaleoniToWinners(
    client,
    guild.id,
    c.eventKey,
    doc.rawWebhook?.roundId || doc.dedupeKey,
    [claimA?.userId, claimB?.userId],
    c.rewardGaleoni,
  );
  const label = houseLabel(houseId, client);
  const rewardLines = [];
  if (pts > 0) rewardLines.push(`<a:VC_Winner:1482535294757507255> ${formatSpellListHousePointsAward(pts, award)} alla ${label}.`);
  const galeoniLines = formatSpellListGaleoniLine(galeoniAward.payouts);
  if (galeoniLines) {
    rewardLines.push("", "**Galeoni ai due maghi:**", galeoniLines);
  }
  const embed = new EmbedBuilder()
    .setColor(0xd4af37)
    .setTitle("<a:VC_Events:1482706144953897223> Caccia alle liste — Vittoria!")
    .setDescription(
      [
        `La **${label}** ha trovato **entrambe** le liste con due maghi diversi:`,
        `• <@${claimA.userId}>`,
        `• <@${claimB.userId}>`,
        "",
        ...rewardLines,
      ].join("\n"),
    )
    .setTimestamp();
  await announceInChat(client, guild, announceCfgForDoc(c, doc), "", [embed]);
  await deleteSpawnedListMessages(guild, doc, "Lista raccolta");
  return { ...award, galeoniAward };
}

function formatChaosBoostLine(boostType?, boostScope?) {
  const kind = String(boostType || "").toLowerCase() === "exp" ? "EXP" : "punti casa";
  const scope = String(boostScope || "").toLowerCase() === "house" ? "di casata" : "personale";
  return `2× ${kind} ${scope}`;
}

async function finalizeChaosSpellListWin(client?, guild?, c?, doc?, houseId?, winnerUserId?) {
  const fc = doc.rawWebhook?.finaleChaos && typeof doc.rawWebhook.finaleChaos === "object"
    ? doc.rawWebhook.finaleChaos
    : {};
  const uid = normalizeId(winnerUserId);
  doc.status = "won";
  doc.rawWebhook.resolvedAt = new Date();
  doc.rawWebhook.winningHouseId = houseId;
  doc.rawWebhook.winnerUserId = uid;
  await saveRound(doc);

  const { grantFinaleChaosWinRewards } = require("./hogwartsFinaleChaosDayService") as typeof import("./hogwartsFinaleChaosDayService");
  const rewardGaleoni = Math.max(0, Math.floor(Number(fc.rewardGaleoni) || c.rewardGaleoni || 0));
  const rewardHousePoints = Math.max(0, Math.floor(Number(fc.rewardHousePoints) || c.rewardHousePoints || 0));
  const chaosCfg = {
    eventKey: normalizeId(fc.chaosEventKey) || c.eventKey,
    rewardGaleoni,
    rewardHousePoints,
    firstSlotBoostDurationMs: Math.max(60_000, Math.floor(Number(fc.firstSlotBoostDurationMs) || 3600000)),
  };
  const rewards = await grantFinaleChaosWinRewards(client, {
    guildId: guild.id,
    userIds: [uid],
    c: chaosCfg,
    rewardKeyPrefix: `${chaosCfg.eventKey}:${fc.slotKey || doc.rawWebhook?.roundId || "lists"}:spellListHunt`,
    reason: `Finale chaos — Caccia alle liste ${fc.slotKey || ""}`,
    firstSlot: fc.firstSlot === true,
    boostType: fc.boostType || "housePoints",
    boostScope: fc.boostScope || "personal",
  });
  const award = rewards[0];
  const awardedPts = Math.max(0, Math.floor(Number(award?.house?.points) || 0));
  const mult = Math.max(1, Number(award?.house?.multiplier) || 1);
  const petBit = award?.house?.petName ? ` · ${award.house.petName}` : "";
  const consLabels = Array.isArray(award?.house?.consumableLabels)
    ? award.house.consumableLabels.filter(Boolean)
    : [];
  const consBit = consLabels.length ? ` · ${consLabels.join(", ")}` : "";
  const ptsLine =
    mult > 1 && awardedPts > 0
      ? `<a:VC_Winner:1482535294757507255> **${awardedPts} punti casa** (base ${rewardHousePoints} ×${mult}${petBit}${consBit})`
      : `<a:VC_Winner:1482535294757507255> **${awardedPts || rewardHousePoints} punti casa**${
          awardedPts > 0 ? " (multi animale / boost se attivi)" : ""
        }`;
  const label = houseLabel(houseId, client);
  const embed = new EmbedBuilder()
    .setColor(0xd4af37)
    .setTitle("<a:VC_Events:1482706144953897223> Caccia alle liste — vittoria!")
    .setDescription(
      [
        `<@${uid}> (**${label}**) ha trovato **entrambe** le liste!`,
        "",
        `**${formatGaleoni(rewardGaleoni)}**`,
        ptsLine,
        fc.firstSlot
          ? `<a:VC_Events:1482706144953897223> Boost attivo: **${formatChaosBoostLine(fc.boostType, fc.boostScope)}**`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .setTimestamp();
  await announceInChat(client, guild, announceCfgForDoc(c, doc), "", [embed]);
  await deleteSpawnedListMessages(guild, doc, "Liste raccolte");
  return { ok: true, rewards };
}

async function spawnRound(client?, guild?, c?, parts?) {
  const roundId = roundIdFromParts(parts);
  const dedupeKey = dedupeKeyFromRoundId(c.eventKey, roundId);
  const existing = await loadRound(guild.id, c.eventKey, roundId);
  if (existing) return false;
  const pair = pickSpellListPair(huntRoundIndex(parts, c));
  if (!pair) {
    global.logger?.warn?.(`[HOGWARTS SPELL LIST HUNT] Turno ${roundId} non avviato: coppia liste assente.`);
    return false;
  }
  let channelA = await pickRandomHuntChannel(guild, c);
  let channelB = await pickRandomHuntChannel(guild, c);
  if (!channelA || !channelB) {
    global.logger?.warn?.(`[HOGWARTS SPELL LIST HUNT] Turno ${roundId} non avviato: canali insufficienti.`);
    return false;
  }
  if (channelA.id === channelB.id) {
    channelB = await pickRandomHuntChannel(guild, { ...c, excludedChannelIds: [...c.excludedChannelIds, channelA.id] });
  }
  if (!channelB || channelB.id === channelA.id) {
    global.logger?.warn?.(`[HOGWARTS SPELL LIST HUNT] Turno ${roundId} non avviato: servono due canali distinti.`);
    return false;
  }
  const expiresAt = new Date(Date.now() + c.roundDurationMs);
  const roundLabel = `${parts.hour}:00`;
  const postList = async (channel?, slot?) => {
    const embed = buildListEmbed(pair, slot, roundId);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(buildButtonCustomId(roundId, slot))
        .setLabel(slot === "a" ? "Ho trovato questa lista" : "Ho trovato questa lista")
        .setStyle(ButtonStyle.Primary)
        .setEmoji({ id: "1485419161168511036" }),
    );
    const msg = await channel.send({ embeds: [embed], components: [row] }).catch(() => null);
    return msg?.id ? { channelId: channel.id, messageId: msg.id } : null;
  };
  const listA = await postList(channelA, "a");
  const listB = await postList(channelB, "b");
  if (!listA || !listB) {
    global.logger?.warn?.(`[HOGWARTS SPELL LIST HUNT] Turno ${roundId} non avviato: invio liste fallito (#${channelA?.name || "?"}, #${channelB?.name || "?"}).`);
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
    .setTitle("<a:VC_Events:1482706144953897223> Caccia alle liste \u2014 Sezione Proibita")
    .setDescription(
      [
        "Sono state nascoste **due liste di incantesimi** della Sezione Proibita in **due canali** del server.",
        "",
        "Per vincere **punti casa** servono **due maghi diversi della stessa casa**: uno per lista.",
        "Se le trovano case diverse il turno **resta aperto**: un compagno di casa pu\u00f2 riprendere lo slot sbagliato, oppure si attende la scadenza.",
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

async function spawnFinaleChaosSpellListHunt(client?, guild?, opts: Record<string, any> = {}) {
  const { isHouseChannelQuietHours } = require("./hogwartsHouseChannelMinigameService") as typeof import("./hogwartsHouseChannelMinigameService");
  if (isHouseChannelQuietHours(client)) return false;
  const base = cfg(client);
  const chaosEventKey = normalizeId(opts.chaosEventKey) || "hogwarts_finale_chaos";
  const eventKey = `${chaosEventKey}_spell`;
  const slotKey = normalizeId(opts.slotKey);
  if (!slotKey) return false;
  const roundId = `chaos_${slotKey.replace(/[^a-zA-Z0-9]/g, "_")}`;
  const dedupeKey = dedupeKeyFromRoundId(eventKey, roundId);
  const existing = await loadRound(guild.id, eventKey, roundId);
  if (existing) return Boolean(existing.status === "active" || existing.status === "won" || existing.status === "expired");

  const durationMs = safeInt(opts.durationMs, 15 * 60 * 1000, 5 * 60 * 1000, 24 * 60 * 60 * 1000);
  const hintBeforeExpiryMs = safeInt(opts.hintBeforeExpiryMs, 7 * 60 * 1000, 60_000, durationMs);
  const announceChannelId = normalizeId(opts.announceChannelId) || base.announceChannelId;
  const pingRoleId = normalizeId(opts.pingRoleId) || base.eventsRoleId;
  const huntCfg = {
    ...base,
    eventKey,
    announceChannelId,
    eventsRoleId: pingRoleId,
    excludedChannelIds: [...new Set([...(base.excludedChannelIds || []), announceChannelId].filter(Boolean))],
    roundDurationMs: durationMs,
    hintBeforeExpiryMs,
    rewardGaleoni: Math.max(0, Math.floor(Number(opts.rewardGaleoni) || base.rewardGaleoni || 0)),
    rewardHousePoints: Math.max(0, Math.floor(Number(opts.rewardHousePoints) || base.rewardHousePoints || 0)),
  };

  let seed = 0;
  for (let i = 0; i < slotKey.length; i += 1) seed = (seed * 31 + slotKey.charCodeAt(i)) >>> 0;
  const pair = pickSpellListPair(seed % 1000);
  if (!pair) {
    global.logger?.warn?.(`[FINALE CHAOS SPELL LIST] Turno ${roundId}: coppia liste assente.`);
    return false;
  }

  let channelA = await pickRandomHuntChannel(guild, huntCfg);
  let channelB = await pickRandomHuntChannel(guild, huntCfg);
  if (!channelA || !channelB) {
    global.logger?.warn?.(`[FINALE CHAOS SPELL LIST] Turno ${roundId}: canali insufficienti.`);
    return false;
  }
  if (channelA.id === channelB.id) {
    channelB = await pickRandomHuntChannel(guild, {
      ...huntCfg,
      excludedChannelIds: [...huntCfg.excludedChannelIds, channelA.id],
    });
  }
  if (!channelB || channelB.id === channelA.id) {
    global.logger?.warn?.(`[FINALE CHAOS SPELL LIST] Turno ${roundId}: servono due canali distinti.`);
    return false;
  }

  const expiresAt = new Date(Date.now() + durationMs);
  const roundLabel = slotKey;
  const postList = async (channel?, slot?) => {
    const embed = buildListEmbed(pair, slot, roundId);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(buildButtonCustomId(roundId, slot))
        .setLabel("Ho trovato questa lista")
        .setStyle(ButtonStyle.Primary)
        .setEmoji({ id: "1485419161168511036" }),
    );
    const msg = await channel.send({ embeds: [embed], components: [row] }).catch(() => null);
    return msg?.id ? { channelId: channel.id, messageId: msg.id } : null;
  };
  const listA = await postList(channelA, "a");
  const listB = await postList(channelB, "b");
  if (!listA || !listB) {
    global.logger?.warn?.(`[FINALE CHAOS SPELL LIST] Turno ${roundId}: invio liste fallito.`);
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

  const firstSlot = opts.firstSlot === true;
  const boostType = normalizeId(opts.boostType) || "housePoints";
  const boostScope = normalizeId(opts.boostScope) || "personal";
  const intro = new EmbedBuilder()
    .setColor(0xd4af37)
    .setTitle("<a:VC_Events:1482706144953897223> Finale Chaos — Caccia alle liste")
    .setDescription(
      [
        "Sono state nascoste **due liste di incantesimi** in **due canali** del server.",
        "",
        "Vince **un solo mago**: deve trovare **entrambe** le liste e premere i bottoni.",
        "Finché nessuno ha chiuso il turno, le liste restano **contendibili** (puoi riprendere uno slot già segnalato).",
        "",
        `Premio: **${formatGaleoni(huntCfg.rewardGaleoni)}** + **${huntCfg.rewardHousePoints} punti casa**.`,
        firstSlot
          ? `Bonus 1° slot: boost **${formatChaosBoostLine(boostType, boostScope)}** per 1 ora.`
          : "",
        "",
        `<a:VC_pixeltime:1482535344103620771> Hai **${Math.max(1, Math.round(durationMs / 60000))} minuti**.`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  const announceMsg = await announceInChat(client, guild, huntCfg, "", [intro]);
  await SiteDocument.findOneAndUpdate(
    { docType: HUNT_DOC, guildId: guild.id, userId: EVENT_OWNER_ID, dedupeKey },
    {
      $setOnInsert: {
        docType: HUNT_DOC,
        guildId: guild.id,
        userId: EVENT_OWNER_ID,
        dedupeKey,
        createdBy: "finale_chaos",
      },
      $set: {
        status: "active",
        planKey: eventKey,
        rawWebhook: {
          eventKey,
          roundId,
          roundLabel,
          expiresAt,
          announceMessageId: announceMsg?.id || "",
          pairIndex: seed % 1000,
          lists: { a: listA, b: listB },
          claims: {},
          finaleChaos: {
            chaosEventKey,
            slotKey,
            firstSlot,
            boostType,
            boostScope,
            firstSlotBoostDurationMs: Math.max(
              60_000,
              Math.floor(Number(opts.firstSlotBoostDurationMs) || 3600000),
            ),
            rewardGaleoni: huntCfg.rewardGaleoni,
            rewardHousePoints: huntCfg.rewardHousePoints,
            announceChannelId,
            pingRoleId,
            durationMs,
            hintBeforeExpiryMs,
            singleWinner: true,
          },
        },
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  global.logger?.info?.(
    `[FINALE CHAOS SPELL LIST] Turno ${roundId} avviato (#${channelA.name}, #${channelB.name}).`,
  );
  return true;
}

async function expireRound(client?, guild?, c?, doc?) {
  if (!doc || doc.status !== "active") return;
  doc.status = "expired";
  doc.rawWebhook.resolvedAt = new Date();
  await saveRound(doc);
  const isChaos = Boolean(doc.rawWebhook?.finaleChaos);
  await announceInChat(
    client,
    guild,
    announceCfgForDoc(c, doc),
    isChaos
      ? `<a:VC_Alert:1482706673176150077> **Caccia alle liste** — tempo scaduto senza vincitore.`
      : `<a:VC_Alert:1482706673176150077> **Caccia alle liste** — turno **${doc.rawWebhook?.roundLabel || ""}** scaduto senza vittoria di casata.`,
  );
  await deleteSpawnedListMessages(guild, doc, "Turno scaduto");
}

function spellListHintDue(doc?, c?, nowMs = Date.now()) {
  if (!doc || normalizeId(doc.status) !== "active") return false;
  if (doc.rawWebhook?.hintSentAt) return false;
  const expMs = new Date(doc.rawWebhook?.expiresAt || 0).getTime();
  if (!Number.isFinite(expMs) || expMs <= nowMs) return false;
  const hintBeforeMs = safeInt(c.hintBeforeExpiryMs, DEFAULT_CONFIG.hintBeforeExpiryMs, 60_000, c.roundDurationMs);
  return nowMs >= expMs - hintBeforeMs;
}

async function announceSpellListHint(client?, guild?, c?, doc?) {
  const expMs = new Date(doc.rawWebhook?.expiresAt || 0).getTime();
  const nowMs = Date.now();
  if (!Number.isFinite(expMs) || expMs <= nowMs) return false;
  const hintClaim = await SiteDocument.findOneAndUpdate(
    {
      _id: doc._id,
      status: "active",
      $or: [{ "rawWebhook.hintSentAt": { $exists: false } }, { "rawWebhook.hintSentAt": null }],
    },
    { $set: { "rawWebhook.hintSentAt": new Date() } },
    { new: true },
  )
    .lean()
    .catch(() => null);
  if (!hintClaim) return false;
  const listA = doc.rawWebhook?.lists?.a;
  const listB = doc.rawWebhook?.lists?.b;
  const chA = listA?.channelId ? `<#${listA.channelId}>` : "un canale del server";
  const chB = listB?.channelId ? `<#${listB.channelId}>` : "un altro canale del server";
  const remainingMin = Math.max(1, Math.ceil((expMs - nowMs) / 60_000));
  const claims = doc.rawWebhook?.claims && typeof doc.rawWebhook.claims === "object" ? doc.rawWebhook.claims : {};
  const isChaos = Boolean(doc.rawWebhook?.finaleChaos);
  const lines = [
    isChaos
      ? `<:VC_Owlcall:1510941826176126976> Nessuno ha ancora trovato **entrambe** le liste.`
      : `<:VC_Owlcall:1510941826176126976> Nessuna casata ha ancora completato entrambe le liste del turno **${doc.rawWebhook?.roundLabel || ""}**.`,
    "",
    `<:VC_Dobby:1510941838138413146> **Indizio:** le liste sono in ${chA} e ${chB}.`,
  ];
  if (claims.a?.userId || claims.b?.userId) {
    lines.push(
      "",
      isChaos
        ? "Una lista è già stata segnalata: serve lo **stesso mago** sull'altra lista."
        : "Una o entrambe le liste sono già state segnalate: serve un **secondo mago della stessa casa** per chiudere il turno.",
    );
  }
  lines.push("", `<a:VC_pixeltime:1482535344103620771> Restano circa **${remainingMin} minuti**.`);
  const embed = new EmbedBuilder()
    .setColor(0xd4af37)
    .setTitle("<a:VC_Events:1482706144953897223> Caccia alle liste — indizio!")
    .setDescription(lines.join("\n"))
    .setTimestamp();
  const sent = await announceInChat(client, guild, announceCfgForDoc(c, doc), "", [embed]);
  return Boolean(sent?.id);
}

async function maybeAnnounceSpellListHint(client?, guild?, c?, doc?) {
  const cfgDoc = announceCfgForDoc(c, doc);
  if (!spellListHintDue(doc, cfgDoc)) return false;
  return announceSpellListHint(client, guild, c, doc);
}

async function tickRounds(client?) {
  const c = cfg(client);
  if (!c.enabled && !(await hasActiveChaosSpellListRound(client))) return;
  const parts = getRomeParts();
  const guildId = normalizeId(IDs.guilds?.main || client?.guilds?.cache?.first?.()?.id);
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return;
  if (c.enabled && isHuntCalendarDay(parts, c) && shouldSpawnHourSlot(parts, c)) {
    const roundId = roundIdFromParts(parts);
    const existing = await loadRound(guild.id, c.eventKey, roundId);
    if (!existing) await spawnRound(client, guild, c, parts);
  }
  const active = await SiteDocument.find({
    docType: HUNT_DOC,
    guildId: guild.id,
    userId: EVENT_OWNER_ID,
    status: "active",
  })
    .lean()
    .catch(() => []);
  const now = Date.now();
  for (const doc of active) {
    const exp = doc?.rawWebhook?.expiresAt ? new Date(doc.rawWebhook.expiresAt).getTime() : 0;
    if (Number.isFinite(exp) && now > exp) {
      await expireRound(client, guild, c, doc);
      continue;
    }
    await maybeAnnounceSpellListHint(client, guild, c, doc);
  }
}

async function hasActiveChaosSpellListRound(client?) {
  const guildId = normalizeId(IDs.guilds?.main || client?.guilds?.cache?.first?.()?.id);
  if (!guildId) return false;
  const n = await SiteDocument.countDocuments({
    docType: HUNT_DOC,
    guildId,
    userId: EVENT_OWNER_ID,
    status: "active",
    "rawWebhook.finaleChaos": { $exists: true },
  }).catch(() => 0);
  return n > 0;
}

async function handleSpellListHuntButton(interaction?, client?) {
  const parsed = parseButtonCustomId(interaction.customId);
  if (!parsed) return false;
  const c = cfg(client);
  const guildId = normalizeId(interaction.guild?.id);
  const uid = normalizeId(interaction.user?.id);
  if (!guildId || !uid) return true;
  let doc = await loadRound(guildId, c.eventKey, parsed.roundId);
  if (!doc || doc.status !== "active") {
    doc = await loadActiveRoundByRoundId(guildId, parsed.roundId);
  }
  if (!doc || doc.status !== "active") {
    await interaction
      .reply({ content: "<a:VC_Alert:1482706673176150077> Questo turno non \u00e8 pi\u00f9 attivo.", flags: 1 << 6 })
      .catch(() => null);
    return true;
  }
  const exp = doc.rawWebhook?.expiresAt ? new Date(doc.rawWebhook.expiresAt).getTime() : 0;
  if (Number.isFinite(exp) && Date.now() > exp) {
    await interaction
      .reply({ content: "<a:VC_Alert:1482706673176150077> Il tempo per questo turno \u00e8 scaduto.", flags: 1 << 6 })
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
  const isChaos = Boolean(doc.rawWebhook?.finaleChaos);
  const claims = readClaims(doc);
  const slot = parsed.slot;
  const otherSlot = slot === "a" ? "b" : "a";
  const slotClaim = claims[slot];
  const otherClaim = claims[otherSlot];
  const claimPayload = { userId: uid, houseId, at: new Date().toISOString() };
  const ephemeral = { flags: 1 << 6 };

  if (isChaos) {
    if (slotClaim?.userId && normalizeId(slotClaim.userId) === uid) {
      await interaction
        .reply({ content: "<a:VC_Alert:1482706673176150077> Hai gi\u00e0 segnalato questa lista.", ...ephemeral })
        .catch(() => null);
      return true;
    }
            const stoleSlot = Boolean(slotClaim?.userId);
    const updated = await atomicClaimSlot(
      doc._id,
      slot,
      claimPayload,
      stoleSlot ? normalizeId(slotClaim.userId) : null,
    );
    if (!updated) {
      await interaction
        .reply({
          content:
            "<a:VC_Alert:1482706673176150077> Un altro mago ha appena preso questa lista. Riprova subito o cerca l'altra.",
          ...ephemeral,
        })
        .catch(() => null);
      return true;
    }
    doc = updated;
    const freshClaims = readClaims(doc);
    const label = houseLabel(houseId, client);
    const otherOwner = normalizeId(freshClaims[otherSlot]?.userId);
    if (!otherOwner) {
      await interaction
        .reply({
          content: stoleSlot
            ? `<a:VC_Events:1482706144953897223> Hai **ripreso** questa lista (**${label}**)! Ora trova **l'altra lista** tu stesso per vincere.`
            : `<a:VC_Events:1482706144953897223> Lista segnalata! Ora trova **l'altra lista** tu stesso per vincere (**${label}**).`,
          ...ephemeral,
        })
        .catch(() => null);
      return true;
    }
    if (otherOwner !== uid) {
      await interaction
        .reply({
          content: stoleSlot
            ? `<a:VC_Events:1482706144953897223> Hai preso questa lista, ma l'altra \u00e8 di un altro mago. **Trovala e riprendila** per chiudere il turno (**${label}**).`
            : `<a:VC_Events:1482706144953897223> Lista segnalata, ma l'altra \u00e8 di un altro mago. **Trovala e riprendila** per vincere (**${label}**).`,
          ...ephemeral,
        })
        .catch(() => null);
      return true;
    }
    await finalizeChaosSpellListWin(client, interaction.guild, c, doc, houseId, uid);
    await interaction
      .reply({
        content: stoleSlot
          ? `<a:VC_Events:1482706144953897223> **Hai ripreso la seconda lista!** Vittoria Finale Chaos per la **${label}**.`
          : `<a:VC_Events:1482706144953897223> **Hai trovato entrambe le liste!** Vittoria Finale Chaos per la **${label}**.`,
        ...ephemeral,
      })
      .catch(() => null);
    return true;
  }

  if (slotClaim?.userId && normalizeId(slotClaim.userId) === uid) {
    await interaction
      .reply({ content: "<a:VC_Alert:1482706673176150077> Hai gi\u00e0 segnalato questa lista.", ...ephemeral })
      .catch(() => null);
    return true;
  }
  if (otherClaim?.userId && normalizeId(otherClaim.userId) === uid) {
    await interaction
      .reply({
        content: "<a:VC_Alert:1482706673176150077> Hai gi\u00e0 trovato l'altra lista: serve un **secondo mago** della tua casata.",
        ...ephemeral,
      })
      .catch(() => null);
    return true;
  }
  const canOverwriteSlot = canOverwriteSpellListSlot(slotClaim, otherClaim, houseId);
  if (slotClaim?.userId && !canOverwriteSlot) {
    await interaction
      .reply({ content: spellListAlreadyFoundReply(Boolean(!otherClaim?.userId)), ...ephemeral })
      .catch(() => null);
    return true;
  }
  const stoleSlot = Boolean(slotClaim?.userId) && canOverwriteSlot;
  const updated = await atomicClaimSlot(
    doc._id,
    slot,
    claimPayload,
    stoleSlot ? normalizeId(slotClaim.userId) : null,
  );
  if (!updated) {
    await interaction
      .reply({
        content: "<a:VC_Alert:1482706673176150077> Un altro mago ha appena segnalato questa lista. Controlla l'altra lista o riprova tra un attimo.",
        ...ephemeral,
      })
      .catch(() => null);
    return true;
  }
  doc = updated;
  const freshClaims = readClaims(doc);
  const label = houseLabel(houseId, client);
  if (!freshClaims[otherSlot]?.userId) {
    await interaction
      .reply({
        content: `<a:VC_Events:1482706144953897223> Lista segnalata per la **${label}**! Manca ancora l'altra lista da un altro mago della tua casata.`,
        ...ephemeral,
      })
      .catch(() => null);
    return true;
  }
  const otherHouse = normalizeHouseId(freshClaims[otherSlot].houseId);
  if (otherHouse && otherHouse !== houseId) {
    await interaction
      .reply({ content: spellListCrossHouseReply(client, houseId, otherHouse), ...ephemeral })
      .catch(() => null);
    return true;
  }
  const award = await finalizeHouseWin(client, interaction.guild, c, doc, houseId, freshClaims.a, freshClaims.b);
  const pointsLine = formatSpellListHousePointsAward(award.points, award);
  const selfPayout = (award.galeoniAward?.payouts || []).find((row?) => normalizeId(row.userId) === uid);
  const galeoniLine = selfPayout
    ? ` Tu ricevi **${formatGaleoni(selfPayout.amount)}**.`
    : award.galeoniAward?.perUser > 0
      ? ` ${formatGaleoni(award.galeoniAward.perUser)} a ciascuno dei due maghi.`
      : "";
  await interaction
    .reply({
      content: stoleSlot
        ? `<a:VC_Events:1482706144953897223> **${label}** completa il turno riprendendo lo slot! ${pointsLine}.${galeoniLine}`
        : `<a:VC_Events:1482706144953897223> **${label}** completa il turno! ${pointsLine}.${galeoniLine}`,
      flags: 1 << 6,
    })
    .catch(() => null);
  return true;
}

async function tickFinaleChaosSpellListRounds(client?, guild?, chaosCfg?, nowMs = Date.now()) {
  const c = cfg(client);
  const gid = normalizeId(guild?.id);
  if (!gid) return;
  const active = await SiteDocument.find({
    docType: HUNT_DOC,
    guildId: gid,
    userId: EVENT_OWNER_ID,
    status: "active",
    "rawWebhook.finaleChaos": { $exists: true },
  })
    .lean()
    .catch(() => []);
  for (const doc of active) {
    const exp = doc?.rawWebhook?.expiresAt ? new Date(doc.rawWebhook.expiresAt).getTime() : 0;
    if (Number.isFinite(exp) && nowMs > exp) {
      await expireRound(client, guild, c, doc);
      continue;
    }
    const cfgDoc = {
      ...announceCfgForDoc(c, doc),
      hintBeforeExpiryMs: safeInt(
        chaosCfg?.hintBeforeExpiryMs ?? doc?.rawWebhook?.finaleChaos?.hintBeforeExpiryMs,
        c.hintBeforeExpiryMs,
        60_000,
        24 * 60 * 60 * 1000,
      ),
    };
    if (!spellListHintDue(doc, cfgDoc, nowMs)) continue;
    await announceSpellListHint(client, guild, c, doc);
  }
}

function startHogwartsSpellListHuntLoop(client?) {
  const { isHogwartsRuntimeDisabled } = require("../../Utils/Web/hogwartsRuntimeKillSwitch") as typeof import("../../Utils/Web/hogwartsRuntimeKillSwitch");
  if (isHogwartsRuntimeDisabled(client)) return;
  if (!client || loopState.has(client)) return;
  loopState.add(client);
  const tick = () => {
    tickRounds(client).catch((err?) => global.logger?.warn?.("[HOGWARTS SPELL LIST HUNT] tick:", err?.message || err));
  };
  tick();
  const interval = setInterval(tick, 60 * 1000);
  if (typeof interval.unref === "function") interval.unref();
}

export = {
  cfg,
  isSpellListHuntEventEnded,
  handleSpellListHuntButton,
  startHogwartsSpellListHuntLoop,
  spawnFinaleChaosSpellListHunt,
  tickFinaleChaosSpellListRounds,
};