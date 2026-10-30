const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");
const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { ActivityUserProfile, SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { getGuildChannelCached, getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { accountUsername } = require("../../Utils/Discord/guildDiscordIdentity") as typeof import("../../Utils/Discord/guildDiscordIdentity");
const { sendDm } = require("../../Utils/noDmList") as typeof import("../../Utils/noDmList");
const { resolveHogwartsEventConfig } = require("../../Utils/Web/hogwartsSortingConfig") as typeof import("../../Utils/Web/hogwartsSortingConfig");
const { getShopItemById, SHOP_CATEGORY_LABELS } = require("../../Utils/Web/hogwartsShopCatalog") as typeof import("../../Utils/Web/hogwartsShopCatalog");
const { getConsumableById, CONSUMABLE_CATEGORY_LABELS } = require("../../Utils/Web/hogwartsShopConsumablesCatalog") as typeof import("../../Utils/Web/hogwartsShopConsumablesCatalog");
const { getHouseMeta } = require("../../Utils/Web/hogwartsSortingBank") as typeof import("../../Utils/Web/hogwartsSortingBank");
const { buildHouseCrestAttachment, buildShopItemImageAttachment, resolveHouseCrestPublicUrl, resolveShopItemPublicImageUrl } = require("../../Utils/Web/hogwartsEventAssets") as typeof import("../../Utils/Web/hogwartsEventAssets");
const LOG_DIR = path.resolve(__dirname, "../../Data/Hogwarts");
const LOG_FILE = path.join(LOG_DIR, "shop-log.jsonl");
const SORT_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_SORTING;
const SHOP_CATEGORIES = ["wand", "broom", "pet"];
const BACKFILL_DISCORD_DELAY_MS = 400;

function sleep(ms?) {
  return new Promise((resolve?) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

function formatPurchasedAtIt(ms?, timezone = "Europe/Rome") {
  const n = Number(ms || Date.now());
  if (!Number.isFinite(n)) return "";
  return new Date(n).toLocaleString("it-IT", {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function buildDedupeKey({ userId, kind, itemId, purchasedAtMs }) {
  const uid = String(userId || "").trim();
  const id = String(itemId || "").trim();
  const ms = Math.floor(Number(purchasedAtMs || 0));
  const k = String(kind || "item").trim();
  if (!uid || !id || !Number.isFinite(ms) || ms <= 0) return "";
  return `${uid}:${k}:${id}:${ms}`;
}

function loadLoggedDedupeKeys() {
  const keys = new Set();
  try {
    if (!fs.existsSync(LOG_FILE)) return keys;
    const raw = fs.readFileSync(LOG_FILE, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const row = JSON.parse(trimmed);
        const key = String(row?.dedupeKey || buildDedupeKey(row) || "").trim();
        if (key) keys.add(key);
      } catch {
      }
    }
  } catch (err) {
    global.logger?.warn?.("[hogwarts-shop-log] read file:", err?.message || err);
  }
  return keys;
}

function appendShopLogFile(entry?) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, `${JSON.stringify(entry)}\n`, "utf8");
    return true;
  } catch (err) {
    global.logger?.warn?.("[hogwarts-shop-log] file:", err?.message || err);
    return false;
  }
}

function resolveLogChannelId(cfg?) {
  return String(cfg?.shopLogChannelId || cfg?.sortingLogChannelId || IDs.channels?.hogwartsSortingLog || "").trim();
}

function modeLabel(mode?) {
  if (mode === "upgrade") return "Miglioramento";
  if (mode === "consumable") return "Consumabile";
  return "Acquisto";
}

function shopDmTitle(mode?, itemName?) {
  const name = String(itemName || "Oggetto").trim();
  if (mode === "upgrade") return `<a:VC_Events:1482706144953897223> Miglioramento Emporio — ${name}`;
  if (mode === "consumable") return `<a:VC_Events:1482706144953897223> Consumabile attivato — ${name}`;
  return `<a:VC_Events:1482706144953897223> Acquisto Emporio — ${name}`;
}

function resolveShopPurchaseVisual(client?, cfg?, entry?) {
  const mode = String(entry.mode || "purchase").trim();
  const catalog = mode === "consumable" ? null : getShopItemById(entry.itemId);
  const consumable = mode === "consumable" ? getConsumableById(entry.itemId) : null;
  const accent = String(catalog?.accent || consumable?.accent || "#c9a227").trim();
  const files = [];
  if (catalog?.imageFile) {
    const local = buildShopItemImageAttachment(catalog.imageFile);
    if (local?.attachment) {
      files.push(local.attachment);
      return { accent, imageUrl: local.url, files };
    }
    const remote = resolveShopItemPublicImageUrl(client, catalog.imageFile);
    if (remote) return { accent, imageUrl: remote, files };
  }
  const houseId = String(entry.houseId || "").trim();
  if (houseId) {
    const crest = buildHouseCrestAttachment(houseId);
    if (crest?.attachment) {
      files.push(crest.attachment);
      return { accent, imageUrl: crest.url, files };
    }
    const crestUrl = resolveHouseCrestPublicUrl(client, houseId, cfg?.houses?.[houseId]?.crestUrl);
    if (crestUrl) return { accent, imageUrl: crestUrl, files };
  }
  return { accent, imageUrl: "", files };
}

async function sendShopPurchaseDm(client?, guild?, cfg?, entry?, member?, options: Record<string, any> = {}) {
  if (options.skipDm === true || !client || !guild || !entry?.userId) return { ok: false, reason: "skipped" };
  const uid = String(entry.userId || "").trim();
  const user =
    member?.user ||
    (await client.users.fetch(uid).catch(() => null));
  if (!user?.send) return { ok: false, reason: "no_user" };
  const mode = String(entry.mode || "purchase").trim();
  const catalog = mode === "consumable" ? null : getShopItemById(entry.itemId);
  const consumable = mode === "consumable" ? getConsumableById(entry.itemId) : null;
  const detail = String(catalog?.detail || consumable?.detail || "").trim();
  const description = String(catalog?.description || consumable?.description || "").trim();
  const priceLine = Number(entry.galeoniPaid || 0) > 0 ? `**${entry.galeoniPaid}** Galeoni` : "—";
  const visual = resolveShopPurchaseVisual(client, cfg, entry);
  const embed = new EmbedBuilder()
    .setColor(visual.accent || "#c9a227")
    .setTitle(shopDmTitle(mode, entry.itemName))
    .setDescription(
      [
        mode === "upgrade"
          ? `Hai migliorato il tuo equipaggiamento con **${entry.itemName}**.`
          : mode === "consumable"
            ? `Hai attivato **${entry.itemName}**.`
            : `Hai acquistato **${entry.itemName}**.`,
        description ? `> ${description}` : "",
        detail ? `<:VC_Info:1482526956703580372> **Dettaglio:** ${detail}` : "",
        `<:VC_Modifica:1478859646587633717> **Categoria:** ${entry.categoryLabel || entry.category || "—"}`,
        entry.houseLabel ? `<:VC_Color:1482532543273238569> **Casata:** ${entry.houseLabel}` : "",
        `<:VC_Money:1482534806314287387> **Spesa:** ${priceLine}`,
        `<a:VC_Calendar:1482706208149475358> **Orario:** ${entry.purchasedAtLabel}`,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .setTimestamp(new Date(entry.purchasedAtMs || Date.now()));
  if (visual.imageUrl) embed.setImage(visual.imageUrl);
  const payload = {
    embeds: [embed],
    files: visual.files?.length ? visual.files : undefined,
  };
  const sent = await sendDm(user, payload, { guildId: guild.id, bypassNoDm: true });
  return sent ? { ok: true } : { ok: false, reason: "dm_blocked" };
}

async function sendShopLogDiscord(client?, guild?, cfg?, entry?) {
  const channelId = resolveLogChannelId(cfg);
  if (!channelId || !guild) return { ok: false, reason: "no_channel" };
  const channel = await getGuildChannelCached(guild, channelId);
  if (!channel?.isTextBased?.()) return { ok: false, reason: "channel_unavailable" };
  const priceLine = Number(entry.galeoniPaid || 0) > 0 ? `**${entry.galeoniPaid}** Galeoni` : "—";
  const embed = new EmbedBuilder()
    .setColor("#c9a227")
    .setTitle("<a:VC_Events:1482706144953897223> Acquisto Emporio")
    .setDescription(
      [
        `<:VC_addperson:1485419347068588073> **Utente:** ${entry.username}`,
        `<:VC_Info:1482526956703580372> **ID:** \`${entry.userId}\``,
        `<a:VC_Calendar:1482706208149475358> **Orario:** ${entry.purchasedAtLabel}`,
        `<:VC_tools:1478862265305272364> **Oggetto:** ${entry.itemName}`,
        `<:VC_Modifica:1478859646587633717> **Categoria:** ${entry.categoryLabel}`,
        `<:VC_Modifica:1478859646587633717> **Tipo:** ${modeLabel(entry.mode)}`,
        `<:VC_Color:1482532543273238569> **Casata:** ${entry.houseLabel || "—"}`,
        `<:VC_Money:1482534806314287387> **Spesa:** ${priceLine}`,
      ].join("\n"),
    )
    .setTimestamp(new Date(entry.purchasedAtMs || Date.now()));
  await channel.send({ embeds: [embed] }).catch(() => null);
  return { ok: true };
}

async function logHogwartsShopPurchase({
  client,
  guild,
  cfg,
  member,
  userId,
  itemId,
  itemName,
  category,
  categoryLabel,
  galeoniPaid,
  mode,
  houseId,
  houseLabel,
  purchasedAtMs,
  source,
  skipDiscord = false,
  skipDm = false,
  knownDedupeKeys,
}: any = {}) {
  const uid = String(userId || member?.id || "").trim();
  if (!uid) return { ok: false, reason: "no_user" };
  const ms = Number(purchasedAtMs || Date.now());
  const purchasedAt = Number.isFinite(ms) ? ms : Date.now();
  const kind = mode === "consumable" ? "consumable" : "catalog";
  const dedupeKey = buildDedupeKey({ userId: uid, kind, itemId, purchasedAtMs: purchasedAt });
  if (!dedupeKey) return { ok: false, reason: "invalid_entry" };
  const keys = knownDedupeKeys || loadLoggedDedupeKeys();
  if (keys.has(dedupeKey)) return { ok: false, reason: "duplicate", dedupeKey };
  const username = accountUsername(member?.user || member) || String(member?.user?.username || uid);
  const entry = {
    dedupeKey,
    userId: uid,
    username,
    purchasedAtMs: purchasedAt,
    purchasedAtLabel: formatPurchasedAtIt(purchasedAt, cfg?.timezone),
    itemId: String(itemId || "").trim(),
    itemName: String(itemName || itemId || "").trim(),
    category: String(category || "").trim(),
    categoryLabel: String(categoryLabel || category || "").trim(),
    galeoniPaid: Math.max(0, Math.floor(Number(galeoniPaid) || 0)),
    mode: String(mode || "purchase").trim(),
    houseId: String(houseId || "").trim(),
    houseLabel: String(houseLabel || "").trim(),
    guildId: String(guild?.id || ""),
    eventKey: String(cfg?.eventKey || ""),
    source: String(source || "site").trim(),
  };
  appendShopLogFile(entry);
  keys.add(dedupeKey);
  if (client && guild && !skipDiscord) {
    await sendShopLogDiscord(client, guild, cfg, entry).catch(() => null);
  }
  if (client && guild && !skipDm) {
    await sendShopPurchaseDm(client, guild, cfg, entry, member, { skipDm: false }).catch(() => null);
  }
  return { ok: true, entry, dedupeKey };
}

async function findUserHouseId(guildId?, userId?, eventKey?) {
  const doc = await SiteDocument.findOne({
    docType: SORT_DOC,
    guildId: String(guildId || ""),
    userId: String(userId || ""),
    dedupeKey: String(eventKey || ""),
  })
    .lean()
    .catch(() => null);
  return String(doc?.status || "").trim();
}

function collectCatalogPurchasesFromProfile(doc?, eventKey?) {
  const out = [];
  const gid = String(doc?.guildId || "");
  const uid = String(doc?.userId || "");
  const shop = doc?.profile?.events?.hogwarts?.shop;
  if (!gid || !uid || !shop || typeof shop !== "object") return out;
  if (eventKey && String(shop.eventKey || "").trim() && String(shop.eventKey) !== String(eventKey)) return out;
  const items = shop.items && typeof shop.items === "object" ? shop.items : {};
  for (const category of SHOP_CATEGORIES) {
    const row = items[category] && typeof items[category] === "object" ? items[category] : null;
    if (!row?.id) continue;
    const catalog = getShopItemById(row.id);
    const purchasedAtMs = new Date(row.purchasedAt || shop.updatedAt || 0).getTime();
    if (!Number.isFinite(purchasedAtMs) || purchasedAtMs <= 0) continue;
    out.push({
      userId: uid,
      guildId: gid,
      itemId: row.id,
      itemName: catalog?.name || row.id,
      category,
      categoryLabel: SHOP_CATEGORY_LABELS[category] || category,
      galeoniPaid: Math.max(0, Math.floor(Number(row.pricePaid) || catalog?.price || 0)),
      mode: "purchase",
      purchasedAtMs,
    });
  }
  return out;
}

let shopLogBackfillStarted = false;

async function syncHogwartsShopLogsOnStartup(client?) {
  if (shopLogBackfillStarted) return { ok: false, reason: "already_running" };
  shopLogBackfillStarted = true;
  const cfg = resolveHogwartsEventConfig(client);
  const guildId = String(IDs.guilds?.main || "").trim();
  if (!guildId || !client) return { ok: false, reason: "no_guild" };
  const guild =
    client.guilds.cache.get(guildId) ||
    (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return { ok: false, reason: "guild_unavailable" };
  const eventKey = String(cfg.eventKey || "").trim();
  const keys = loadLoggedDedupeKeys();
  const filter = {
    guildId,
    $or: SHOP_CATEGORIES.map((cat?) => ({
      [`profile.events.hogwarts.shop.items.${cat}.id`]: { $exists: true, $ne: "" },
    })),
  };
  const docs = await ActivityUserProfile.find(filter)
    .select("guildId userId profile.events.hogwarts.shop")
    .lean()
    .catch(() => []);
  let announced = 0;
  let skipped = 0;
  for (const doc of Array.isArray(docs) ? docs : []) {
    const purchases = collectCatalogPurchasesFromProfile(doc, eventKey);
    for (const row of purchases) {
      const houseId = await findUserHouseId(guildId, row.userId, eventKey);
      const houseMeta = houseId ? getHouseMeta(houseId, cfg?.houses?.[houseId]?.crestUrl) : null;
      const member = await getGuildMemberCached(guild, row.userId).catch(() => null);
      const result = await logHogwartsShopPurchase({
        client,
        guild,
        cfg,
        member,
        userId: row.userId,
        itemId: row.itemId,
        itemName: row.itemName,
        category: row.category,
        categoryLabel: row.categoryLabel,
        galeoniPaid: row.galeoniPaid,
        mode: row.mode,
        houseId,
        houseLabel: houseMeta?.label || houseId || "",
        purchasedAtMs: row.purchasedAtMs,
        source: "backfill",
        skipDm: true,
        knownDedupeKeys: keys,
      });
      if (result.ok) {
        announced += 1;
        await sleep(BACKFILL_DISCORD_DELAY_MS);
      } else if (result.reason === "duplicate") {
        skipped += 1;
      }
    }
  }
  return { ok: true, announced, skipped, profiles: docs.length };
}

export = { logHogwartsShopPurchase, syncHogwartsShopLogsOnStartup, LOG_FILE, buildDedupeKey };