const { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");
const { ActivityUserProfile, SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { isValidGuildUserId } = require("../../Utils/DB/validateWriteIds") as typeof import("../../Utils/DB/validateWriteIds");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { getGuildChannelCached, getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { resolveHogwartsEventConfig } = require("../../Utils/Web/hogwartsSortingConfig") as typeof import("../../Utils/Web/hogwartsSortingConfig");
const { HOUSE_META } = require("../../Utils/Web/hogwartsSortingBank") as typeof import("../../Utils/Web/hogwartsSortingBank");
const { applyDefaultFooter } = require("../../Utils/Embeds/defaultFooter") as typeof import("../../Utils/Embeds/defaultFooter");
const { economyConfig } = require("./galeoniEconomyService") as typeof import("./galeoniEconomyService");
const { spendGaleoni } = require("./gringottService") as typeof import("./gringottService");
const { CONSUMABLE_BOOST_SCOPES, CONSUMABLE_BOOST_TYPES, consumablePrice, getConsumableById } = require("../../Utils/Web/hogwartsShopConsumablesCatalog") as typeof import("../../Utils/Web/hogwartsShopConsumablesCatalog");
const { isHogwartsShopBoostActive } = require("./hogwartsShopBoostsService") as typeof import("./hogwartsShopBoostsService");
const HOUSE_POINTS_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_HOUSE_POINTS;
const HOUSE_POINTS_OWNER_ID = "__event__";
const PERSONAL_BOOSTS_PATH = "profile.events.hogwarts.consumableBoosts";
const GUILD_BOOSTS_PATH = "rawWebhook.consumableBoosts";
const SORTED_HOUSE_IDS = ["gryffindor", "hufflepuff", "ravenclaw", "slytherin"];
const BOOST_TYPES_LIST = [CONSUMABLE_BOOST_TYPES.HOUSE_POINTS, CONSUMABLE_BOOST_TYPES.EXP];
const EXPIRY_ANNOUNCE_MAX_AGE_MS = 3 * 60 * 60 * 1000;
const DEFAULT_SHOP_URL = "https://viniliecaffe.it/evento/shop";
const HOGWARTS_IMG_DIR = path.resolve(__dirname, "../../Assets/evento-hogwarts");
const HOUSE_BOOST_ANNOUNCE_CHANNEL_BY_ID = {
  gryffindor: () => IDs.channels?.hogwartsHouseGryffindor,
  hufflepuff: () => IDs.channels?.hogwartsHouseHufflepuff,
  ravenclaw: () => IDs.channels?.hogwartsHouseRavenclaw,
  slytherin: () => IDs.channels?.hogwartsHouseSlytherin,
};
const expiryLoopClients = new WeakSet();
const expiryAnnounceLocks = new Set();
const consumablePurchaseLocks = new Map();

function normalizeId(value?) {
  return String(value || "").trim();
}

function normalizeHouseId(value?) {
  const house = normalizeId(value).toLowerCase();
  return SORTED_HOUSE_IDS.includes(house) ? house : "";
}

function safeMs(value?) {
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function isBoostRowActive(row?, nowMs = Date.now()) {
  if (!row || typeof row !== "object") return false;
  const expiresAt = safeMs(row.expiresAt);
  return expiresAt > Number(nowMs || Date.now());
}

function normalizeBoostRow(row?) {
  if (!isBoostRowActive(row)) return null;
  return {
    itemId: normalizeId(row.itemId),
    itemName: normalizeId(row.itemName),
    activatedBy: normalizeId(row.activatedBy),
    expiresAt: new Date(safeMs(row.expiresAt)),
    remainingMs: Math.max(0, safeMs(row.expiresAt) - Date.now()),
  };
}

function isEconomyConsumablesUnlocked(client?, nowMs = Date.now()) {
  const cfg: any = economyConfig(client);
  if (!cfg.enabled) return false;
  if (Number.isFinite(cfg.startMs) && Number(nowMs || Date.now()) < cfg.startMs) return false;
  return true;
}

function economyConsumablesLockMessage(client?) {
  const cfg: any = economyConfig(client);
  if (!cfg.enabled) return "I boost consumabili non sono disponibili.";
  if (Number.isFinite(cfg.startMs) && Date.now() < cfg.startMs) {
    return "I boost consumabili si sbloccano lunedì 10 agosto alle 14:00 con l'economia Galeoni.";
  }
  return "";
}

async function loadGuildConsumableBoosts(client?, guildId?) {
  const eventKey = normalizeId(resolveHogwartsEventConfig(client)?.eventKey) || "hogwarts";
  const doc = await SiteDocument.findOne({
    docType: HOUSE_POINTS_DOC,
    guildId: normalizeId(guildId),
    userId: HOUSE_POINTS_OWNER_ID,
    dedupeKey: eventKey,
  })
    .select(`${GUILD_BOOSTS_PATH}`)
    .lean()
    .catch(() => null);
  return doc?.rawWebhook?.consumableBoosts && typeof doc.rawWebhook.consumableBoosts === "object"
    ? doc.rawWebhook.consumableBoosts
    : {};
}

async function loadPersonalConsumableBoosts(guildId?, userId?) {
  const doc = await ActivityUserProfile.findOne({
    guildId: normalizeId(guildId),
    userId: normalizeId(userId),
  })
    .select(PERSONAL_BOOSTS_PATH)
    .lean()
    .catch(() => null);
  return doc?.profile?.events?.hogwarts?.consumableBoosts && typeof doc.profile.events.hogwarts.consumableBoosts === "object"
    ? doc.profile.events.hogwarts.consumableBoosts
    : {};
}

function resolveScopeBoost(boostType?, scope?, guildBoosts?, personalBoosts?, houseId?, nowMs = Date.now()) {
  if (scope === CONSUMABLE_BOOST_SCOPES.PERSONAL) {
    return normalizeBoostRow(personalBoosts?.[boostType], nowMs);
  }
  const typeBucket = guildBoosts?.[boostType] && typeof guildBoosts[boostType] === "object" ? guildBoosts[boostType] : {};
  if (scope === CONSUMABLE_BOOST_SCOPES.GLOBAL) {
    return normalizeBoostRow(typeBucket.global, nowMs);
  }
  const house = normalizeHouseId(houseId);
  if (!house) return null;
  const houses = typeBucket.houses && typeof typeBucket.houses === "object" ? typeBucket.houses : {};
  return normalizeBoostRow(houses[house], nowMs);
}

async function getActiveConsumableBoosts(client?, guildId?, userId?, houseId?) {
  const nowMs = Date.now();
  const [guildBoosts, personalBoosts] = await Promise.all([
    loadGuildConsumableBoosts(client, guildId),
    loadPersonalConsumableBoosts(guildId, userId),
  ]);
  const house = normalizeHouseId(houseId);
  const out = {
    housePoints: {
      global: resolveScopeBoost(CONSUMABLE_BOOST_TYPES.HOUSE_POINTS, CONSUMABLE_BOOST_SCOPES.GLOBAL, guildBoosts, personalBoosts, house, nowMs),
      house: resolveScopeBoost(CONSUMABLE_BOOST_TYPES.HOUSE_POINTS, CONSUMABLE_BOOST_SCOPES.HOUSE, guildBoosts, personalBoosts, house, nowMs),
      personal: resolveScopeBoost(CONSUMABLE_BOOST_TYPES.HOUSE_POINTS, CONSUMABLE_BOOST_SCOPES.PERSONAL, guildBoosts, personalBoosts, house, nowMs),
    },
    exp: {
      global: resolveScopeBoost(CONSUMABLE_BOOST_TYPES.EXP, CONSUMABLE_BOOST_SCOPES.GLOBAL, guildBoosts, personalBoosts, house, nowMs),
      house: resolveScopeBoost(CONSUMABLE_BOOST_TYPES.EXP, CONSUMABLE_BOOST_SCOPES.HOUSE, guildBoosts, personalBoosts, house, nowMs),
      personal: resolveScopeBoost(CONSUMABLE_BOOST_TYPES.EXP, CONSUMABLE_BOOST_SCOPES.PERSONAL, guildBoosts, personalBoosts, house, nowMs),
    },
  };
  return out;
}

function computeConsumableMultiplier(activeBoosts?, boostType?) {
  const bucket = boostType === CONSUMABLE_BOOST_TYPES.EXP ? activeBoosts?.exp : activeBoosts?.housePoints;
  if (!bucket) return { multiplier: 1, labels: [] };
  let multiplier = 1;
  const labels = [];
  for (const scope of ["global", "house", "personal"]) {
    const row = bucket[scope];
    if (!row) continue;
    multiplier *= 2;
    labels.push(row.itemName || scope);
  }
  return { multiplier, labels };
}

async function resolveHousePointsConsumableMultiplier(client?, guildId?, userId?, houseId?) {
  if (!isHogwartsShopBoostActive(client)) return { multiplier: 1, labels: [] };
  const active = await getActiveConsumableBoosts(client, guildId, userId, houseId);
  return computeConsumableMultiplier(active, CONSUMABLE_BOOST_TYPES.HOUSE_POINTS);
}

async function resolveExpConsumableMultiplier(client?, guildId?, userId?, houseId?) {
  if (!isHogwartsShopBoostActive(client)) return { multiplier: 1, labels: [] };
  const active = await getActiveConsumableBoosts(client, guildId, userId, houseId);
  return computeConsumableMultiplier(active, CONSUMABLE_BOOST_TYPES.EXP);
}

function anyActiveHouseBoost(guildBoosts?, boostType?, nowMs = Date.now()) {
  const houses = guildBoosts?.[boostType]?.houses;
  if (!houses || typeof houses !== "object") return null;
  for (const [houseId, row] of Object.entries(houses)) {
    const normalized = normalizeBoostRow(row, nowMs);
    if (normalized) return { ...normalized, houseId: normalizeHouseId(houseId) };
  }
  return null;
}

function boostTypeLabel(boostType?) {
  return boostType === CONSUMABLE_BOOST_TYPES.EXP ? "EXP" : "punti casa";
}

function normalizePublicBoostType(value?) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === CONSUMABLE_BOOST_TYPES.EXP || raw === "exp") return CONSUMABLE_BOOST_TYPES.EXP;
  if (raw === CONSUMABLE_BOOST_TYPES.HOUSE_POINTS || raw === "housepoints" || raw === "house_points") {
    return CONSUMABLE_BOOST_TYPES.HOUSE_POINTS;
  }
  if (raw === "punti casa" || raw.includes("punti")) return CONSUMABLE_BOOST_TYPES.HOUSE_POINTS;
  return "";
}

function consumablePurchaseLockKey(guildId?, userId?, houseId?, item?) {
  const gid = normalizeId(guildId);
  const boostType = normalizePublicBoostType(item?.boostType) || normalizeId(item?.boostType);
  const scope = normalizeId(item?.scope);
  if (scope === CONSUMABLE_BOOST_SCOPES.GLOBAL) return `global:${gid}:${boostType}`;
  if (scope === CONSUMABLE_BOOST_SCOPES.HOUSE) {
    return `house:${gid}:${normalizeHouseId(houseId)}:${boostType}`;
  }
  return `personal:${gid}:${normalizeId(userId)}:${boostType}`;
}

async function withConsumablePurchaseLock(lockKey?, fn?) {
  const key = normalizeId(lockKey);
  if (!key) return fn();
  while (consumablePurchaseLocks.has(key)) {
    try {
      await consumablePurchaseLocks.get(key);
    } catch (_) {
          }
  }
  let release;
  const gate = new Promise((resolve?) => {
    release = resolve;
  });
  consumablePurchaseLocks.set(key, gate);
  try {
    return await fn();
  } finally {
    consumablePurchaseLocks.delete(key);
    if (typeof release === "function") release();
  }
}

function resolveConsumablePurchaseBlock(activeBoosts?, item?, guildBoosts?, nowMs = Date.now()) {
  const boostType = normalizePublicBoostType(item?.boostType) || normalizePublicBoostType(item?.boostTypeLabel);
  if (!boostType) return { blocked: true, reason: "Oggetto non valido." };
  const bucket = boostType === CONSUMABLE_BOOST_TYPES.EXP ? activeBoosts?.exp : activeBoosts?.housePoints;
  if (!bucket) return { blocked: false };
  const typeLabel = boostTypeLabel(boostType);

  if (bucket.global) {
    return {
      blocked: true,
      code: "boost_active",
      reason: `È attivo un boost globale ${typeLabel} (${bucket.global.itemName}). Nessun altro boost ${typeLabel} può essere attivato finché non scade.`,
      blocking: bucket.global,
    };
  }

  if (item.scope === CONSUMABLE_BOOST_SCOPES.GLOBAL) {
    const houseConflict = anyActiveHouseBoost(guildBoosts, boostType, nowMs);
    if (houseConflict) {
      return {
        blocked: true,
        code: "boost_active",
        reason: `Una casa ha già un boost ${typeLabel} attivo (${houseConflict.itemName}). Attendi la scadenza prima di attivarne uno globale.`,
        blocking: houseConflict,
      };
    }
    return { blocked: false };
  }

  if (item.scope === CONSUMABLE_BOOST_SCOPES.HOUSE) {
    if (bucket.house) {
      return {
        blocked: true,
        code: "boost_active",
        reason: `La tua casa ha già un boost ${typeLabel} attivo (${bucket.house.itemName}). Un altro membro deve attendere la scadenza prima di attivarne uno nuovo per la casa.`,
        blocking: bucket.house,
      };
    }
    return { blocked: false };
  }

  if (bucket.personal) {
    return {
      blocked: true,
      code: "boost_active",
      reason: `Hai già un boost ${typeLabel} personale attivo (${bucket.personal.itemName}). Attendi la scadenza prima di attivarne un altro.`,
      blocking: bucket.personal,
    };
  }
  return { blocked: false };
}

function boostConflictMessage(item?, activeRow?) {
  const name = activeRow?.itemName || "boost attivo";
  const typeLabel = boostTypeLabel(normalizePublicBoostType(item?.boostType) || normalizePublicBoostType(item?.boostTypeLabel) || item?.boostType);
  if (item?.scope === CONSUMABLE_BOOST_SCOPES.GLOBAL) {
    return `Non puoi attivare un boost globale ${typeLabel}: ${name} è già attivo per una casa.`;
  }
  if (item?.scope === CONSUMABLE_BOOST_SCOPES.HOUSE) {
    return `La tua casa ha già un boost ${typeLabel} attivo (${name}). Attendi la scadenza.`;
  }
  return `Hai già un boost ${typeLabel} personale attivo (${name}). Attendi la scadenza.`;
}

async function assertConsumableActivationAllowed(client?, guildId?, userId?, houseId?, item?) {
  if (!item?.id) return { ok: false, code: "invalid_item", message: "Oggetto consumabile non valido." };
  if (!isEconomyConsumablesUnlocked(client)) {
    return { ok: false, code: "economy_locked", message: economyConsumablesLockMessage(client) };
  }
  if (!isHogwartsShopBoostActive(client)) {
    return { ok: false, code: "event_closed", message: "I boost consumabili sono disponibili solo durante l'evento Hogwarts." };
  }
  const house = normalizeHouseId(houseId);
  if (!house && item.scope !== CONSUMABLE_BOOST_SCOPES.GLOBAL) {
    return { ok: false, code: "not_sorted", message: "Completa lo smistamento per attivare questo boost." };
  }
  const nowMs = Date.now();
  const [active, guildBoosts] = await Promise.all([
    getActiveConsumableBoosts(client, guildId, userId, house),
    loadGuildConsumableBoosts(client, guildId),
  ]);
  const block = resolveConsumablePurchaseBlock(active, item, guildBoosts, nowMs);
  if (block.blocked) {
    return { ok: false, code: block.code || "boost_active", message: block.reason || boostConflictMessage(item, block.blocking) };
  }
  return { ok: true, houseId: house };
}

function formatDurationIt(durationMs?) {
  const totalMin = Math.max(1, Math.ceil(Number(durationMs || 0) / 60000));
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
}

function resolveHouseBoostAnnounceChannelId(houseId?) {
  const house = normalizeHouseId(houseId);
  if (!house) return "";
  const pick = HOUSE_BOOST_ANNOUNCE_CHANNEL_BY_ID[house];
  return pick ? normalizeId(pick()) : "";
}

function resolveHouseBoostAnnounceRoleId(client?, houseId?) {
  const house = normalizeHouseId(houseId);
  if (!house) return "";
  const cfg = resolveHogwartsEventConfig(client);
  return normalizeId(cfg?.houses?.[house]?.roleId);
}

function resolveEventBoostAnnounceRoleId(client?) {
  const cfg = resolveHogwartsEventConfig(client);
  return normalizeId(
    cfg?.completionRoleId
    || IDs.roles?.HogwartsEventParticipant
    || "1507000390493798511",
  );
}

function resolveShopPageUrl(client?) {
  const raw = String(
    client?.config?.siteUrl
    || client?.config?.websiteUrl
    || process.env.VC_SITE_URL
    || process.env.SITE_URL
    || "",
  ).trim();
  if (!raw) return DEFAULT_SHOP_URL;
  try {
    const base = raw.endsWith("/") ? raw.slice(0, -1) : raw;
    return `${base}/evento/shop`;
  } catch {
    return DEFAULT_SHOP_URL;
  }
}

function buildShopLinkRow(client?) {
  const url = resolveShopPageUrl(client);
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setURL(url)
      .setLabel("Apri lo shop")
      .setEmoji("<:VC_FrogCute:1331620415185096746>"),
  );
}

function effectLabelForItem(item?) {
  return item?.boostType === CONSUMABLE_BOOST_TYPES.EXP ? "EXP" : "punti casa";
}

function scopeLabelForItem(item?) {
  if (item?.scope === CONSUMABLE_BOOST_SCOPES.GLOBAL) return "Globale";
  if (item?.scope === CONSUMABLE_BOOST_SCOPES.HOUSE) return "Casata";
  if (item?.scope === CONSUMABLE_BOOST_SCOPES.PERSONAL) return "Personale";
  return "Boost";
}

function advantageTextForItem(item?) {
  const mult = Math.max(1, Math.floor(Number(item?.multiplier) || 2));
  const effect = effectLabelForItem(item);
  if (item?.scope === CONSUMABLE_BOOST_SCOPES.GLOBAL) return `×${mult} ${effect} per tutto il castello`;
  if (item?.scope === CONSUMABLE_BOOST_SCOPES.HOUSE) return `×${mult} ${effect} per tutta la casata`;
  return `×${mult} ${effect} personale`;
}

function findHogwartsImagePath(relativePath?) {
  const rel = String(relativePath || "").replace(/^[/\\]+/, "");
  const candidates = [
    path.join(HOGWARTS_IMG_DIR, rel),
    path.resolve(process.cwd(), "Vinyls/Assets/evento-hogwarts", rel),
    path.resolve("/opt/bot/Vinyls/Assets/evento-hogwarts", rel),
    path.resolve("/var/www/viniliecaffe/images/evento-hogwarts", rel),
    path.resolve("/var/www/viniliecaffe-react/images/evento-hogwarts", rel),
  ];
  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) return filePath;
    } catch (_) {}
  }
  return "";
}

function resolveBoostAnnounceImageAsset(item?, houseId?) {
  const house = normalizeHouseId(houseId);
  let filePath = "";
  let name = "vc-boost.png";
  if (item?.scope === CONSUMABLE_BOOST_SCOPES.GLOBAL) {
    filePath = findHogwartsImagePath("crests/hat.png");
    name = "vc-boost-global.png";
  } else if (house) {
    const crestFile = String(HOUSE_META[house]?.crestFile || `${house}.png`).trim();
    filePath = findHogwartsImagePath(`crests/${crestFile}`) || findHogwartsImagePath(`crests/${house}.png`);
    name = `vc-boost-${house}.png`;
  }
  if (!filePath) {
    filePath = findHogwartsImagePath("crests/hat.png");
    name = "vc-boost.png";
  }
  if (!filePath) return null;
  return { filePath, name };
}

function displayNameOrFallback(value?) {
  const name = String(value || "").trim();
  return name || "Un mago";
}

function buildConsumableBoostEmbed({
  item,
  buyerDisplayName,
  houseLabel,
  houseId,
  guild,
  scopeOverrideLabel = "",
  imageAttachmentName = "",
  mode = "activate",
}) {
  const buyer = displayNameOrFallback(buyerDisplayName);
  const duration = formatDurationIt(item.durationMs);
  const advantage = advantageTextForItem(item);
  const scopeLabel = scopeOverrideLabel || scopeLabelForItem(item);
  const house = normalizeHouseId(houseId);
  const colorRaw = String(
    mode === "expire"
      ? "#7f8c8d"
      : (item?.accent || HOUSE_META[house]?.primary || "#d4af37"),
  ).replace("#", "");
  const color = Number.parseInt(colorRaw, 16);
  const houseTag = String(houseLabel || "").trim();
  const isExpire = mode === "expire";
  const embed = new EmbedBuilder()
    .setColor(Number.isFinite(color) ? color : (isExpire ? 0x7f8c8d : 0xd4af37))
    .setTitle(isExpire ? `${String(item.name || "Boost")} — scaduto` : String(item.name || "Boost"))
    .setDescription(
      isExpire
        ? `<a:VC_pixeltime:1482535344103620771> Il boost di **${buyer}**${houseTag ? ` (${houseTag})` : ""} è **terminato**.`
        : `<a:VC_Events:1482706144953897223> **${buyer}**${houseTag ? ` (${houseTag})` : ""} ha attivato questo boost!`,
    )
    .addFields(
      { name: "Vantaggio", value: isExpire ? `~~**${advantage}**~~` : `**${advantage}**`, inline: true },
      { name: "Durata", value: `**${duration}**`, inline: true },
      { name: "Portata", value: `**${scopeLabel}**`, inline: true },
    )
    .setTimestamp(new Date());
  if (!isExpire && item?.description) {
    embed.addFields({ name: "Dettaglio", value: String(item.description).slice(0, 300) });
  }
  if (imageAttachmentName) {
    embed.setImage(`attachment://${imageAttachmentName}`);
  }
  return applyDefaultFooter(embed, guild);
}

async function sendConsumableBoostAnnounce(channel, {
  content,
  allowedMentions,
  item,
  buyerDisplayName,
  houseLabel,
  houseId,
  guild,
  scopeOverrideLabel,
  mode = "activate",
}) {
  if (!channel?.isTextBased?.()) return;
  const imageAsset = resolveBoostAnnounceImageAsset(item, houseId);
  const files = [];
  if (imageAsset?.filePath) {
    files.push(new AttachmentBuilder(imageAsset.filePath, { name: imageAsset.name }));
  }
  const embed = buildConsumableBoostEmbed({
    item,
    buyerDisplayName,
    houseLabel,
    houseId,
    guild,
    scopeOverrideLabel,
    imageAttachmentName: imageAsset?.name || "",
    mode,
  });
  const payload: Record<string, any> = {
    content: content || undefined,
    embeds: [embed],
    files: files.length ? files : undefined,
    allowedMentions: allowedMentions || { parse: [] },
  };
  if (mode !== "expire") {
    payload.components = [buildShopLinkRow(channel.client)];
  }
  await channel.send(payload);
}

async function announceGlobalConsumableBoost(client, guildId, { item, buyerDisplayName, houseLabel, houseId, mode = "activate" }) {
    const channelId = normalizeId(IDs.channels?.chat || IDs.channels?.eventAnnouncements);
  if (!channelId) return false;
  const guild = client?.guilds?.cache?.get(normalizeId(guildId)) || (await client?.guilds?.fetch?.(normalizeId(guildId)).catch(() => null));
  if (!guild) return false;
  const channel = guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId).catch(() => null));
  if (!channel?.isTextBased?.()) return false;
  const eventRoleId = resolveEventBoostAnnounceRoleId(client);
  const content = eventRoleId ? `<@&${eventRoleId}>` : "";
  try {
    await sendConsumableBoostAnnounce(channel, {
    content,
    allowedMentions: eventRoleId ? { parse: [], roles: [eventRoleId] } : { parse: [] },
      item,
      buyerDisplayName,
      houseLabel,
      houseId,
      guild,
      scopeOverrideLabel: "Globale · tutto il server",
      mode,
    });
    return true;
  } catch (err) {
    global.logger?.warn?.("[hogwarts-consumable-boost] announce:", err?.message || err);
    return false;
  }
}

async function announceHouseConsumableBoost(client, guildId, houseId, { item, buyerDisplayName, houseLabel, mode = "activate" }) {
  try {
    const { isHouseChannelQuietHours } = require("./hogwartsHouseChannelMinigameService") as typeof import("./hogwartsHouseChannelMinigameService");
    if (isHouseChannelQuietHours(client)) return false;
  } catch (_) {}
  const channelId = resolveHouseBoostAnnounceChannelId(houseId);
  if (!channelId) return false;
  const guild = client?.guilds?.cache?.get(normalizeId(guildId)) || (await client?.guilds?.fetch?.(normalizeId(guildId)).catch(() => null));
  if (!guild) return false;
  const channel = guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId).catch(() => null));
  if (!channel?.isTextBased?.()) return false;
  const label = String(houseLabel || "").trim() || HOUSE_META[normalizeHouseId(houseId)]?.label || houseId;
  const roleId = resolveHouseBoostAnnounceRoleId(client, houseId);
  const content = roleId ? `<@&${roleId}>` : "";
  try {
    await sendConsumableBoostAnnounce(channel, {
    content,
    allowedMentions: roleId ? { parse: [], roles: [roleId] } : { parse: [] },
      item,
      buyerDisplayName,
      houseLabel: label,
      houseId,
      guild,
      scopeOverrideLabel: `Casata · ${label}`,
      mode,
    });
    return true;
  } catch (err) {
    global.logger?.warn?.("[hogwarts-consumable-boost] house announce:", err?.message || err);
    return false;
  }
}

async function announcePersonalConsumableBoost(client, guildId, houseId, userId, { item, buyerDisplayName, mode = "activate" }) {
  try {
    const { isHouseChannelQuietHours } = require("./hogwartsHouseChannelMinigameService") as typeof import("./hogwartsHouseChannelMinigameService");
    if (isHouseChannelQuietHours(client)) return false;
  } catch (_) {}
  const channelId = resolveHouseBoostAnnounceChannelId(houseId);
  if (!channelId) return false;
  const uid = normalizeId(userId);
  if (!uid) return false;
  const guild = client?.guilds?.cache?.get(normalizeId(guildId)) || (await client?.guilds?.fetch?.(normalizeId(guildId)).catch(() => null));
  if (!guild) return false;
  const channel = guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId).catch(() => null));
  if (!channel?.isTextBased?.()) return false;
  const houseRoleId = resolveHouseBoostAnnounceRoleId(client, houseId);
  const label = HOUSE_META[normalizeHouseId(houseId)]?.label || "";
  const pings = [houseRoleId ? `<@&${houseRoleId}>` : "", `<@${uid}>`].filter(Boolean).join(" ");
  try {
    await sendConsumableBoostAnnounce(channel, {
      content: pings,
      allowedMentions: {
        parse: [],
        users: [uid],
        roles: houseRoleId ? [houseRoleId] : [],
      },
      item,
      buyerDisplayName,
      houseLabel: label,
      houseId,
      guild,
      scopeOverrideLabel: "Personale",
      mode,
    });
    return true;
  } catch (err) {
    global.logger?.warn?.("[hogwarts-consumable-boost] personal announce:", err?.message || err);
    return false;
  }
}

function resolveItemFromBoostRow(row?, boostType?, scope?) {
  const fromCatalog = getConsumableById(row?.itemId);
  if (fromCatalog) return fromCatalog;
  return {
    id: normalizeId(row?.itemId) || "unknown",
    name: normalizeId(row?.itemName) || "Boost",
    boostType: boostType || CONSUMABLE_BOOST_TYPES.HOUSE_POINTS,
    scope: scope || CONSUMABLE_BOOST_SCOPES.PERSONAL,
    multiplier: 2,
    durationMs: Math.max(0, safeMs(row?.expiresAt) - safeMs(row?.activatedAt)) || 60 * 60 * 1000,
    accent: "#7f8c8d",
    description: "",
  };
}

async function resolveBuyerDisplayName(client?, guild?, userId?, fallback = "") {
  const uid = normalizeId(userId);
  if (!uid || !guild) return displayNameOrFallback(fallback);
  try {
    const member = guild.members?.cache?.get(uid)
      || (await getGuildMemberCached(guild, uid).catch(() => null));
    const name = String(member?.displayName || member?.user?.globalName || member?.user?.username || "").trim();
    if (name) return name;
  } catch (_) {}
  return displayNameOrFallback(fallback || uid);
}

function guildBoostMongoPath(boostType?, scope?, houseId = "") {
  if (scope === CONSUMABLE_BOOST_SCOPES.GLOBAL) return `${GUILD_BOOSTS_PATH}.${boostType}.global`;
  return `${GUILD_BOOSTS_PATH}.${boostType}.houses.${normalizeHouseId(houseId)}`;
}

async function claimExpiredGuildBoostRow(client?, guildId?, boostType?, scope?, houseId = "") {
  const gid = normalizeId(guildId);
  const ek = normalizeId(resolveHogwartsEventConfig(client)?.eventKey) || "hogwarts";
  const rowPath = guildBoostMongoPath(boostType, scope, houseId);
  const now = new Date();
  const lockKey = `guild:${gid}:${rowPath}`;
  if (expiryAnnounceLocks.has(lockKey)) return null;
  expiryAnnounceLocks.add(lockKey);
  try {
    const before = await SiteDocument.findOneAndUpdate(
      {
        docType: HOUSE_POINTS_DOC,
        guildId: gid,
        userId: HOUSE_POINTS_OWNER_ID,
        dedupeKey: ek,
        [`${rowPath}.itemId`]: { $exists: true, $nin: [null, ""] },
        [`${rowPath}.expiresAt`]: { $lte: now },
        [`${rowPath}.endAnnounced`]: { $ne: true },
      },
      {
        $set: {
          [`${rowPath}.endAnnounced`]: true,
          [`${rowPath}.endAnnouncedAt`]: now,
        },
      },
      { new: false },
    ).lean().catch(() => null);
    if (!before) {
      expiryAnnounceLocks.delete(lockKey);
      return null;
    }
    const parts = rowPath.split(".");
    let cursor = before;
    for (const part of parts) {
      cursor = cursor?.[part];
      if (!cursor) {
        expiryAnnounceLocks.delete(lockKey);
        return null;
      }
    }
    return { row: cursor, rowPath, lockKey };
  } catch (err) {
    expiryAnnounceLocks.delete(lockKey);
    throw err;
  }
}

async function unclaimExpiredGuildBoostRow(client?, guildId?, rowPath?) {
  const gid = normalizeId(guildId);
  const ek = normalizeId(resolveHogwartsEventConfig(client)?.eventKey) || "hogwarts";
  await SiteDocument.updateOne(
    {
      docType: HOUSE_POINTS_DOC,
      guildId: gid,
      userId: HOUSE_POINTS_OWNER_ID,
      dedupeKey: ek,
    },
    {
      $unset: {
        [`${rowPath}.endAnnounced`]: 1,
        [`${rowPath}.endAnnouncedAt`]: 1,
      },
    },
  ).catch(() => null);
}

async function claimExpiredPersonalBoostRow(guildId?, userId?, boostType?) {
  const gid = normalizeId(guildId);
  const uid = normalizeId(userId);
  const rowPath = `${PERSONAL_BOOSTS_PATH}.${boostType}`;
  const now = new Date();
  const lockKey = `personal:${gid}:${uid}:${boostType}`;
  if (expiryAnnounceLocks.has(lockKey)) return null;
  expiryAnnounceLocks.add(lockKey);
  try {
    const before = await ActivityUserProfile.findOneAndUpdate(
      {
        guildId: gid,
        userId: uid,
        [`${rowPath}.itemId`]: { $exists: true, $nin: [null, ""] },
        [`${rowPath}.expiresAt`]: { $lte: now },
        [`${rowPath}.endAnnounced`]: { $ne: true },
      },
      {
        $set: {
          [`${rowPath}.endAnnounced`]: true,
          [`${rowPath}.endAnnouncedAt`]: now,
        },
      },
      { new: false },
    ).lean().catch(() => null);
    if (!before) {
      expiryAnnounceLocks.delete(lockKey);
      return null;
    }
    const row = before?.profile?.events?.hogwarts?.consumableBoosts?.[boostType] || null;
    if (!row) {
      expiryAnnounceLocks.delete(lockKey);
      return null;
    }
    return { row, rowPath, lockKey, userId: uid };
  } catch (err) {
    expiryAnnounceLocks.delete(lockKey);
    throw err;
  }
}

async function unclaimExpiredPersonalBoostRow(guildId?, userId?, boostType?) {
  const rowPath = `${PERSONAL_BOOSTS_PATH}.${boostType}`;
  await ActivityUserProfile.updateOne(
    { guildId: normalizeId(guildId), userId: normalizeId(userId) },
    {
      $unset: {
        [`${rowPath}.endAnnounced`]: 1,
        [`${rowPath}.endAnnouncedAt`]: 1,
      },
    },
  ).catch(() => null);
}

async function announceExpiredConsumableBoost(client, guildId, {
  item,
  scope,
  houseId,
  userId,
  buyerDisplayName,
  houseLabel,
}) {
  if (scope === CONSUMABLE_BOOST_SCOPES.GLOBAL) {
    return announceGlobalConsumableBoost(client, guildId, {
      item,
      buyerDisplayName,
      houseLabel,
      houseId,
      mode: "expire",
    });
  }
  if (scope === CONSUMABLE_BOOST_SCOPES.HOUSE) {
    return announceHouseConsumableBoost(client, guildId, houseId, {
      item,
      buyerDisplayName,
      houseLabel,
      mode: "expire",
    });
  }
  return announcePersonalConsumableBoost(client, guildId, houseId, userId, {
    item,
    buyerDisplayName,
    mode: "expire",
  });
}

function shouldAnnounceExpiredBoost(row?, nowMs = Date.now()) {
  const exp = safeMs(row?.expiresAt);
  if (!exp) return false;
  return exp > Number(nowMs) - EXPIRY_ANNOUNCE_MAX_AGE_MS;
}

async function processExpiredGuildBoosts(client?, guildId?) {
  const gid = normalizeId(guildId);
  let announced = 0;
  for (const boostType of BOOST_TYPES_LIST) {
    const globalClaim = await claimExpiredGuildBoostRow(client, gid, boostType, CONSUMABLE_BOOST_SCOPES.GLOBAL);
    if (globalClaim?.row) {
      if (!shouldAnnounceExpiredBoost(globalClaim.row)) {
        expiryAnnounceLocks.delete(globalClaim.lockKey);
      } else {
        const item = resolveItemFromBoostRow(globalClaim.row, boostType, CONSUMABLE_BOOST_SCOPES.GLOBAL);
        const guild = client?.guilds?.cache?.get(gid) || (await client?.guilds?.fetch?.(gid).catch(() => null));
        const buyerDisplayName = await resolveBuyerDisplayName(client, guild, globalClaim.row.activatedBy, globalClaim.row.itemName);
        const houseId = normalizeHouseId(globalClaim.row.houseId) || "";
        const houseLabel = houseId ? (HOUSE_META[houseId]?.label || "") : "";
        const ok = await announceExpiredConsumableBoost(client, gid, {
          item,
          scope: CONSUMABLE_BOOST_SCOPES.GLOBAL,
          houseId,
          userId: globalClaim.row.activatedBy,
          buyerDisplayName,
          houseLabel,
        });
        if (!ok) await unclaimExpiredGuildBoostRow(client, gid, globalClaim.rowPath);
        else announced += 1;
        expiryAnnounceLocks.delete(globalClaim.lockKey);
      }
    }

    for (const houseId of SORTED_HOUSE_IDS) {
      const houseClaim = await claimExpiredGuildBoostRow(client, gid, boostType, CONSUMABLE_BOOST_SCOPES.HOUSE, houseId);
      if (!houseClaim?.row) continue;
      if (!shouldAnnounceExpiredBoost(houseClaim.row)) {
        expiryAnnounceLocks.delete(houseClaim.lockKey);
        continue;
      }
      const item = resolveItemFromBoostRow(houseClaim.row, boostType, CONSUMABLE_BOOST_SCOPES.HOUSE);
      const guild = client?.guilds?.cache?.get(gid) || (await client?.guilds?.fetch?.(gid).catch(() => null));
      const buyerDisplayName = await resolveBuyerDisplayName(client, guild, houseClaim.row.activatedBy);
      const label = HOUSE_META[houseId]?.label || houseId;
      const ok = await announceExpiredConsumableBoost(client, gid, {
        item,
        scope: CONSUMABLE_BOOST_SCOPES.HOUSE,
        houseId,
        userId: houseClaim.row.activatedBy,
        buyerDisplayName,
        houseLabel: label,
      });
      if (!ok) await unclaimExpiredGuildBoostRow(client, gid, houseClaim.rowPath);
      else announced += 1;
      expiryAnnounceLocks.delete(houseClaim.lockKey);
    }
  }
  return announced;
}

async function processExpiredPersonalBoosts(client?, guildId?) {
  const gid = normalizeId(guildId);
  const now = new Date();
  const docs = await ActivityUserProfile.find({
    guildId: gid,
    $or: BOOST_TYPES_LIST.map((boostType?) => ({
      [`${PERSONAL_BOOSTS_PATH}.${boostType}.itemId`]: { $exists: true, $nin: [null, ""] },
      [`${PERSONAL_BOOSTS_PATH}.${boostType}.expiresAt`]: { $lte: now },
      [`${PERSONAL_BOOSTS_PATH}.${boostType}.endAnnounced`]: { $ne: true },
    })),
  })
    .select(`userId ${PERSONAL_BOOSTS_PATH}`)
    .limit(80)
    .lean()
    .catch(() => []);

  let announced = 0;
  for (const doc of Array.isArray(docs) ? docs : []) {
    const uid = normalizeId(doc?.userId);
    if (!uid) continue;
    for (const boostType of BOOST_TYPES_LIST) {
      const claim = await claimExpiredPersonalBoostRow(gid, uid, boostType);
      if (!claim?.row) continue;
      if (!shouldAnnounceExpiredBoost(claim.row)) {
        expiryAnnounceLocks.delete(claim.lockKey);
        continue;
      }
      const item = resolveItemFromBoostRow(claim.row, boostType, CONSUMABLE_BOOST_SCOPES.PERSONAL);
      let houseId = normalizeHouseId(claim.row.houseId);
      if (!houseId) {
        const { resolveSortedHouseForUser } = require("./galeoniEconomyService") as typeof import("./galeoniEconomyService");
        houseId = await resolveSortedHouseForUser(gid, uid, client).catch(() => "");
      }
      if (!houseId) {
                expiryAnnounceLocks.delete(claim.lockKey);
        continue;
      }
      const guild = client?.guilds?.cache?.get(gid) || (await client?.guilds?.fetch?.(gid).catch(() => null));
      const buyerDisplayName = await resolveBuyerDisplayName(client, guild, uid);
      const ok = await announceExpiredConsumableBoost(client, gid, {
        item,
        scope: CONSUMABLE_BOOST_SCOPES.PERSONAL,
        houseId,
        userId: uid,
        buyerDisplayName,
        houseLabel: HOUSE_META[houseId]?.label || "",
      });
      if (!ok) await unclaimExpiredPersonalBoostRow(gid, uid, boostType);
      else announced += 1;
      expiryAnnounceLocks.delete(claim.lockKey);
    }
  }
  return announced;
}

async function runConsumableBoostExpiryTick(client?) {
  if (!client || !isHogwartsShopBoostActive(client)) return { announced: 0 };
  const guildId = normalizeId(IDs.guilds?.main);
  if (!guildId) return { announced: 0 };
  const [guildCount, personalCount] = await Promise.all([
    processExpiredGuildBoosts(client, guildId),
    processExpiredPersonalBoosts(client, guildId),
  ]);
  return { announced: guildCount + personalCount };
}

function startConsumableBoostExpiryLoop(client?) {
  const { isHogwartsRuntimeDisabled } = require("../../Utils/Web/hogwartsRuntimeKillSwitch") as typeof import("../../Utils/Web/hogwartsRuntimeKillSwitch");
  if (isHogwartsRuntimeDisabled(client)) return;
  if (!client || expiryLoopClients.has(client)) return;
  expiryLoopClients.add(client);
  const cron = require("node-cron") as typeof import("node-cron");
  const { runCronDetached } = require("../../../shared/scheduling/cronDetached") as typeof import("../../../shared/scheduling/cronDetached");
  const tick = () => {
    runConsumableBoostExpiryTick(client).catch((err?) => {
      global.logger?.warn?.("[hogwarts-consumable-boost] expiry tick:", err?.message || err);
    });
  };
  const first = setTimeout(tick, 25_000);
  if (typeof first.unref === "function") first.unref();
  cron.schedule(
    "* * * * *",
    runCronDetached("[HOGWARTS CONSUMABLE BOOST EXPIRY]", () => runConsumableBoostExpiryTick(client)),
    { timezone: "Europe/Rome", noOverlap: true, recoverMissedExecutions: false },
  );
}

async function activateConsumableBoost(client, { guildId, userId, houseId, item, eventKey, buyerDisplayName, houseLabel, skipPrecheck = false }) {
  const check = skipPrecheck
    ? { ok: true, houseId: normalizeHouseId(houseId) }
    : await assertConsumableActivationAllowed(client, guildId, userId, houseId, item);
  if (!check.ok) return check;
  const gid = normalizeId(guildId);
  const uid = normalizeId(userId);
  const house = check.houseId || normalizeHouseId(houseId);
  if (!isValidGuildUserId(gid, uid)) return { ok: false, code: "invalid_ids", message: "Attivazione non valida." };
  if (!item?.boostType || !item?.scope) {
    return { ok: false, code: "invalid_item", message: "Oggetto consumabile non valido." };
  }
  const now = new Date();
  const expiresAt = new Date(now.getTime() + Math.max(60000, Math.floor(Number(item.durationMs) || 0)));
  const boostRow = {
    itemId: item.id,
    itemName: item.name,
    activatedBy: uid,
    activatedAt: now,
    expiresAt,
    scope: item.scope,
    boostType: item.boostType,
    houseId: house || "",
    endAnnounced: false,
  };

  const inactiveOrMissing = (fieldPath?) => ([
    { [fieldPath]: { $exists: false } },
    { [`${fieldPath}.expiresAt`]: { $exists: false } },
    { [`${fieldPath}.expiresAt`]: null },
    { [`${fieldPath}.expiresAt`]: { $lte: now } },
  ]);

  let wrote = null;
  if (item.scope === CONSUMABLE_BOOST_SCOPES.PERSONAL) {
    const path = `${PERSONAL_BOOSTS_PATH}.${item.boostType}`;
    await ActivityUserProfile.updateOne(
      { guildId: gid, userId: uid },
      { $setOnInsert: { guildId: gid, userId: uid } },
      { upsert: true },
    ).catch(() => null);
    wrote = await ActivityUserProfile.findOneAndUpdate(
      {
        guildId: gid,
        userId: uid,
        $or: inactiveOrMissing(path),
      },
      {
        $set: {
          [path]: boostRow,
          "profile.events.hogwarts.consumableBoosts.eventKey": normalizeId(eventKey) || "hogwarts",
          "profile.events.hogwarts.consumableBoosts.updatedAt": now,
        },
      },
      { new: true },
    ).catch(() => null);
  } else {
    const ek = normalizeId(eventKey) || "hogwarts";
    const scopePath = item.scope === CONSUMABLE_BOOST_SCOPES.GLOBAL
      ? `${GUILD_BOOSTS_PATH}.${item.boostType}.global`
      : `${GUILD_BOOSTS_PATH}.${item.boostType}.houses.${house}`;
    if (item.scope === CONSUMABLE_BOOST_SCOPES.HOUSE && !house) {
      return { ok: false, code: "not_sorted", message: "Completa lo smistamento per attivare questo boost." };
    }
    await SiteDocument.updateOne(
      {
        docType: HOUSE_POINTS_DOC,
        guildId: gid,
        userId: HOUSE_POINTS_OWNER_ID,
        dedupeKey: ek,
      },
      {
        $setOnInsert: {
          docType: HOUSE_POINTS_DOC,
          guildId: gid,
          userId: HOUSE_POINTS_OWNER_ID,
          dedupeKey: ek,
          createdBy: "hogwarts_consumable_boost",
          status: "active",
          planKey: "hogwarts_house_points",
        },
      },
      { upsert: true },
    ).catch(() => null);
    wrote = await SiteDocument.findOneAndUpdate(
      {
        docType: HOUSE_POINTS_DOC,
        guildId: gid,
        userId: HOUSE_POINTS_OWNER_ID,
        dedupeKey: ek,
        $or: inactiveOrMissing(scopePath),
      },
      {
        $set: {
          [scopePath]: boostRow,
          "rawWebhook.eventKey": ek,
          "rawWebhook.updatedAt": now,
        },
      },
      { new: true },
    ).catch(() => null);
  }

  if (!wrote) {
    return {
      ok: false,
      code: "boost_active",
      message: boostConflictMessage(item, null) || "Questo boost è già attivo. Attendi la scadenza.",
    };
  }

  if (item.scope === CONSUMABLE_BOOST_SCOPES.PERSONAL) {
    const personalAfter = await loadPersonalConsumableBoosts(gid, uid);
    const persisted = normalizeBoostRow(personalAfter?.[item.boostType]);
    if (!persisted || normalizeId(persisted.itemId) !== normalizeId(item.id)) {
      return {
        ok: false,
        code: "persist_failed",
        message: "Attivazione non salvata. Riprova tra poco (nessun addebito se l'acquisto fallisce).",
      };
    }
  }

  if (item.scope === CONSUMABLE_BOOST_SCOPES.GLOBAL) {
    void announceGlobalConsumableBoost(client, gid, { item, buyerDisplayName, houseLabel, houseId: house });
  } else if (item.scope === CONSUMABLE_BOOST_SCOPES.HOUSE && house) {
    void announceHouseConsumableBoost(client, gid, house, { item, buyerDisplayName, houseLabel });
  } else if (item.scope === CONSUMABLE_BOOST_SCOPES.PERSONAL && house) {
    void announcePersonalConsumableBoost(client, gid, house, uid, { item, buyerDisplayName });
  }
  const active = await getActiveConsumableBoosts(client, gid, uid, house);
  return {
    ok: true,
    expiresAt,
    activeBoosts: active,
    message: `${item.name} attivato! Boost ×2 fino alle ${expiresAt.toLocaleString("it-IT", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}.`,
  };
}

async function purchaseAndActivateConsumable(client, { guildId, userId, houseId, itemId, eventKey, buyerDisplayName, houseLabel }) {
  const item = getConsumableById(itemId);
  if (!item?.id) return { ok: false, code: "invalid_item", message: "Oggetto consumabile non valido." };
  const lockKey = consumablePurchaseLockKey(guildId, userId, houseId, item);
  return withConsumablePurchaseLock(lockKey, async () => {
    const check = await assertConsumableActivationAllowed(client, guildId, userId, houseId, item);
    if (!check.ok) return check;
    const price = consumablePrice(item);
    const payment = await spendGaleoni({
      guildId,
      userId,
      amount: price,
      reason: `Shop Hogwarts: ${item.name}`,
      actorId: "site",
      source: "hogwarts_shop_consumable",
      eventKey,
    });
    if (!payment?.ok) {
      return {
        ok: false,
        code: payment?.code || "payment_failed",
        message: payment?.code === "insufficient_funds"
          ? "Non hai abbastanza Galeoni per attivare questo boost."
          : "Attivazione non completata. Riprova tra poco.",
      };
    }
    const activated = await activateConsumableBoost(client, {
      guildId,
      userId,
      houseId,
      item,
      eventKey,
      buyerDisplayName,
      houseLabel,
      skipPrecheck: true,
    });
    if (!activated.ok) {
      const { addGaleoni } = require("./gringottService") as typeof import("./gringottService");
      await addGaleoni({
        guildId,
        userId,
        amount: price,
        reason: `Rimborso boost: ${item.name}`,
        actorId: "site",
        source: "hogwarts_shop_consumable_refund",
        eventKey,
      }).catch(() => null);
      return activated;
    }
    return { ...activated, spent: price, item };
  });
}

function publicActiveBoostsPayload(activeBoosts?) {
  const mapScope = (row?) => {
    if (!row) return null;
    const expiresAtMs = safeMs(row.expiresAt);
    return {
      itemId: row.itemId,
      itemName: row.itemName,
      expiresAt: expiresAtMs ? new Date(expiresAtMs).toISOString() : null,
      remainingMs: row.remainingMs,
    };
  };
  return {
    housePoints: {
      global: mapScope(activeBoosts?.housePoints?.global),
      house: mapScope(activeBoosts?.housePoints?.house),
      personal: mapScope(activeBoosts?.housePoints?.personal),
    },
    exp: {
      global: mapScope(activeBoosts?.exp?.global),
      house: mapScope(activeBoosts?.exp?.house),
      personal: mapScope(activeBoosts?.exp?.personal),
    },
  };
}

function publicConsumablesCatalogWithAvailability(catalog?, activeBoosts?, guildBoosts?) {
  const base = catalog && typeof catalog === "object" ? catalog : { categories: [] };
  const categories = Array.isArray(base.categories) ? base.categories : [];
  return {
    categories: categories.map((cat?) => ({
      ...cat,
      items: (Array.isArray(cat.items) ? cat.items : []).map((item?) => {
        const block = resolveConsumablePurchaseBlock(activeBoosts, item, guildBoosts);
        const blocking = block.blocking || null;
        const blockedUntilMs = blocking?.expiresAt ? safeMs(blocking.expiresAt) : 0;
        return {
          ...item,
          purchaseBlocked: block.blocked,
          purchaseBlockedReason: block.blocked ? block.reason || "" : "",
          purchaseBlockedBy: block.blocked && blocking?.itemName ? String(blocking.itemName) : "",
          purchaseBlockedUntil: block.blocked && blockedUntilMs > Date.now()
            ? new Date(blockedUntilMs).toISOString()
            : "",
          purchaseBlockedRemainingMs: block.blocked && blockedUntilMs > Date.now()
            ? Math.max(0, blockedUntilMs - Date.now())
            : 0,
        };
      }),
    })),
  };
}

export = {
  activateConsumableBoost,
  assertConsumableActivationAllowed,
  economyConsumablesLockMessage,
  getActiveConsumableBoosts,
  isEconomyConsumablesUnlocked,
  loadGuildConsumableBoosts,
  publicActiveBoostsPayload,
  publicConsumablesCatalogWithAvailability,
  purchaseAndActivateConsumable,
  resolveConsumablePurchaseBlock,
  resolveExpConsumableMultiplier,
  resolveHousePointsConsumableMultiplier,
  runConsumableBoostExpiryTick,
  startConsumableBoostExpiryLoop,
};