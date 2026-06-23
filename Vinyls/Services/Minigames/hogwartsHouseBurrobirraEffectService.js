const cron = require("node-cron");
const { EmbedBuilder } = require("discord.js");
const { runCronDetached } = require("../../../shared/scheduling/cronDetached");
const { resolveHogwartsEventConfig, isEventWindowOpen } = require("../../Utils/Web/hogwartsSortingConfig");
const { HOUSES, HOUSE_META } = require("../../Utils/Web/hogwartsSortingBank");
const IDs = require("../../Utils/Config/ids");
const { getClientChannelCached } = require("../../Utils/Interaction/interactionEntityCache");
const { resolveHouseChannelId } = require("../Community/hogwartsBasiliskService");
const { getHouseIdForChannel, resolveHouseRoleId } = require("../Community/hogwartsHouseChannelMinigameService");
const { BURROBIRRA_EMBED_IMAGE_URL } = require("../../Utils/Minigames/burrobirraEmbedImage");
const TIME_ZONE = "Europe/Rome";
const loopState = new WeakSet();
const activeByClient = new WeakMap();
const lastStrikeHouseByClient = new WeakMap();
const lastStrikeAtByClient = new WeakMap();

function normalizeId(value) {
  return String(value || "").trim();
}

function safeInt(value, fallback, min, max) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function resolveCfg(client) {
  const raw = client?.config?.minigames?.hogwartsHouseBurrobirraEffect;
  const o = raw && typeof raw === "object" ? raw : {};
  return {
    enabled: o.enabled !== false,
    onlyDuringHogwartsEvent: o.onlyDuringHogwartsEvent !== false,
    spawnChancePercent: Math.min(100, Math.max(0, Number(o.spawnChancePercent) || 2)),
    durationMs: safeInt(o.durationMs, 45 * 60 * 1000, 10 * 60 * 1000, 3 * 60 * 60 * 1000),
    minGapBetweenMs: safeInt(o.minGapBetweenMs, 2 * 60 * 60 * 1000, 0, 12 * 60 * 60 * 1000),
    avoidRepeatHouses: safeInt(o.avoidRepeatHouses, 2, 0, 3),
    mainChannelId: normalizeId(o.mainChannelId || IDs.channels?.chat || ""),
  };
}

function eventGateOpen(client, nowMs = Date.now()) {
  const cfg = resolveCfg(client);
  if (!cfg.enabled) return false;
  if (!cfg.onlyDuringHogwartsEvent) return true;
  const eventCfg = resolveHogwartsEventConfig(client);
  return Boolean(isEventWindowOpen(eventCfg, nowMs)?.open);
}

function houseLabel(houseId) {
  return HOUSE_META[String(houseId || "").trim()]?.label || houseId || "casa";
}

function pickRandomHouse(client) {
  const cfg = resolveCfg(client);
  const recent = lastStrikeHouseByClient.get(client) || [];
  const avoid = new Set(recent.slice(-Math.max(0, cfg.avoidRepeatHouses || 0)));
  let pool = HOUSES.filter((houseId) => !avoid.has(houseId));
  if (!pool.length) pool = HOUSES.slice();
  const picked = pool[Math.floor(Math.random() * pool.length)] || HOUSES[0];
  lastStrikeHouseByClient.set(client, [...recent, picked].slice(-8));
  lastStrikeAtByClient.set(client, Date.now());
  return picked;
}

function readActive(client, nowMs = Date.now()) {
  const row = activeByClient.get(client);
  if (!row) return null;
  const endAtMs = Math.floor(Number(row.endAtMs) || 0);
  if (!row.houseId || !endAtMs || nowMs >= endAtMs) return null;
  return row;
}

function buildStartEmbed(houseId, endAtMs, inHouseChannel = false) {
  const label = houseLabel(houseId);
  const meta = HOUSE_META[houseId];
  const endSec = Math.floor(Number(endAtMs) / 1000);
  const lines = inHouseChannel
    ? [
      "<a:VC_Alert:1482706673176150077> **Attenzione:** nella sala comune di **" + label + "** aleggia **Burrobirra**!",
      "",
      "<a:VC_catRAVE:1506009917906227200> I **minigame di casata** diventeranno **strani** per un po'.",
      "> <a:VC_catdemon:1505995179738403017> Frasi confuse, immagini capovolte, reaction **esca** e **vincente** che si scambiano….",
    ]
    : [
      "<a:VC_Alert:1482706673176150077> **Attenzione:** l'effetto **Burrobirra** colpisce **" + label + "**!",
      "",
      "<a:VC_catRAVE:1506009917906227200> Per un po' i **minigame nella sala comune di " + label + "** diventeranno **strani**.",
      "> <a:VC_catdemon:1505995179738403017> Frasi confuse, immagini capovolte, reaction **esca** e **vincente** che si scambiano….",
    ];
  if (endSec > 0) lines.push("", `<a:VC_pixeltime:1482535344103620771> L'effetto termina <t:${endSec}:R>.`);
  return new EmbedBuilder()
    .setColor(meta?.primary || "#c9a227")
    .setTitle("<a:VC_Beer:1448687940560490547> Burrobirra in casata")
    .setDescription([...lines, "", "*Buona fortuna — servirà.* <a:VC_Beer:1448687940560490547>"].join("\n"))
    .setImage(BURROBIRRA_EMBED_IMAGE_URL);
}

function buildEndEmbed(houseId, inHouseChannel = false) {
  const label = houseLabel(houseId);
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<a:VC_Beer:1448687940560490547> Burrobirra in casata terminata")
    .setDescription(
      inHouseChannel
        ? `<a:VC_pixeltime:1482535344103620771> La Burrobirra ha smesso di fare effetto nella sala comune di **${label}**.`
        : `<a:VC_pixeltime:1482535344103620771> L'effetto Burrobirra su **${label}** è terminato.`,
    )
    .setImage(BURROBIRRA_EMBED_IMAGE_URL);
}

async function sendHouseBurrobirraEmbed(client, channelId, embed, houseId) {
  const chId = normalizeId(channelId);
  if (!chId || !embed) return false;
  const channel = client.channels.cache.get(chId) || (await getClientChannelCached(client, chId, { ttlMs: 60_000 }));
  if (!channel?.isTextBased?.()) return false;
  const roleId = normalizeId(resolveHouseRoleId(client, houseId));
  const content = roleId ? `<@&${roleId}>` : "";
  await channel.send({
    content: content || undefined,
    embeds: [embed],
    allowedMentions: roleId ? { roles: [roleId] } : { parse: [] },
  }).catch(() => null);
  return true;
}

async function publishStartNotices(client, _cfg, houseId, endAtMs) {
  const houseChannelId = resolveHouseChannelId(houseId);
  if (!houseChannelId) return;
  await sendHouseBurrobirraEmbed(client, houseChannelId, buildStartEmbed(houseId, endAtMs, true), houseId);
}

async function publishEndNotices(client, _cfg, houseId) {
  const houseChannelId = resolveHouseChannelId(houseId);
  if (!houseChannelId) return;
  await sendHouseBurrobirraEmbed(client, houseChannelId, buildEndEmbed(houseId, true), houseId);
}

function passMinGap(client, cfg, nowMs = Date.now()) {
  const minGap = Math.max(0, Number(cfg.minGapBetweenMs) || 0);
  if (minGap <= 0) return true;
  const lastAt = Math.floor(Number(lastStrikeAtByClient.get(client)) || 0);
  return !(lastAt > 0 && nowMs - lastAt < minGap);
}

async function tryStartHouseBurrobirra(client, nowMs = Date.now()) {
  return false;
}

async function rollHouseBurrobirraForMinigameStart(client, channelId, houseId, gameDurationMs = 60_000, nowMs = Date.now()) {
  if (!eventGateOpen(client, nowMs)) return false;
  const { isWithinHouseChannelMinigameHours } = require("../Community/hogwartsHouseChannelMinigameService");
  if (!isWithinHouseChannelMinigameHours(client, nowMs)) return false;
  const hid = String(houseId || getHouseIdForChannel(channelId) || "").trim();
  if (!hid) return false;
  const active = readActive(client, nowMs);
  if (active?.houseId === hid) return true;
  const cfg = resolveCfg(client);
  if (!passMinGap(client, cfg, nowMs)) return false;
  if (Math.random() * 100 >= cfg.spawnChancePercent) return false;
  const durationMs = Math.max(60_000, Math.floor(Number(cfg.durationMs) || 45 * 60 * 1000));
  const endAtMs = nowMs + durationMs;
  activeByClient.set(client, { houseId: hid, startAtMs: nowMs, endAtMs, endSent: false });
  await publishStartNotices(client, cfg, hid, endAtMs);
  return true;
}

function isHouseBurrobirraLiveForChannel(client, channelId, nowMs = Date.now()) {
  if (!eventGateOpen(client, nowMs)) return false;
  const chId = String(channelId || "").trim();
  if (!chId) return false;
  try {
    const { isMinigameChannelBusy } = require("./minigameService");
    if (!isMinigameChannelBusy(chId)) return false;
  } catch (_) {
    return false;
  }
  const active = readActive(client, nowMs);
  if (!active?.houseId) return false;
  const houseId = getHouseIdForChannel(chId);
  return Boolean(houseId && houseId === active.houseId);
}

async function refreshHouseBurrobirraCache(client, nowMs = Date.now()) {
  if (!client) return false;
  const active = readActive(client, nowMs);
  return Boolean(active?.houseId);
}

async function runHouseBurrobirraTick(client) {
  if (!client) return;
  const nowMs = Date.now();
  const cfg = resolveCfg(client);
  const active = readActive(client, nowMs);
  if (active && nowMs >= active.endAtMs && !active.endSent) {
    await publishEndNotices(client, cfg, active.houseId);
    active.endSent = true;
    activeByClient.delete(client);
  }
}

function startHouseBurrobirraEffectLoop(client) {
  if (!client || loopState.has(client)) return;
  loopState.add(client);
  const tick = () => {
    runHouseBurrobirraTick(client).catch((err) => {
      global.logger?.warn?.("[HOUSE BURROBIRRA] tick:", err?.message || err);
    });
  };
  const first = setTimeout(tick, 45_000);
  if (typeof first.unref === "function") first.unref();
  cron.schedule(
    "*/5 * * * *",
    runCronDetached("[HOUSE BURROBIRRA]", () => runHouseBurrobirraTick(client)),
    { timezone: TIME_ZONE, noOverlap: true },
  );
}

module.exports = {
  resolveCfg,
  isHouseBurrobirraLiveForChannel,
  refreshHouseBurrobirraCache,
  rollHouseBurrobirraForMinigameStart,
  runHouseBurrobirraTick,
  startHouseBurrobirraEffectLoop,
};