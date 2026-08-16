const cron = require("node-cron");
const { EmbedBuilder } = require("discord.js");
const { runCronDetached } = require("../../../shared/scheduling/cronDetached");
const { SiteDocument } = require("../../Schemas/Community/communitySchemas");
const { resolveHogwartsEventConfig, isEventWindowOpen } = require("../../Utils/Web/hogwartsSortingConfig");
const { applyBurrobirraToPayload } = require("../../Utils/Minigames/burrobirraDistortion");
const { BURROBIRRA_EMBED_IMAGE_URL } = require("../../Utils/Minigames/burrobirraEmbedImage");
const IDs = require("../../Utils/Config/ids");
const { getClientChannelCached } = require("../../Utils/Interaction/interactionEntityCache");
const TIME_ZONE = "Europe/Rome";
const DOC_TYPE = "hogwarts_burrobirra_effect";
const DOC_OWNER_ID = "__event__";
const DEFAULT_CONFIG = Object.freeze({
  enabled: true,
  onlyDuringHogwartsEvent: true,
  windowStartHour: 12,
  windowStartMinute: 0,
  windowEndHour: 23,
  windowEndMinute: 59,
  durationMs: 60 * 60 * 1000,
  maxOccurrencesPerDay: 6,
  minGapBetweenMs: 90 * 60 * 1000,
  channelId: "",
});
const loopState = new WeakSet();
const activeCacheByClient = new WeakMap();

function normalizeId(value) {
  return String(value || "").trim();
}

function safeInt(value, fallback, min, max) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function getRomeParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(date).reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  return {
    year: Number(parts.year || 0),
    month: Number(parts.month || 1),
    day: Number(parts.day || 1),
    hour: Number(parts.hour || 0),
    minute: Number(parts.minute || 0),
    second: Number(parts.second || 0),
  };
}

function romeDateKey(date = new Date()) {
  const p = getRomeParts(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function getRomeOffsetMs(utcDate) {
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, timeZoneName: "shortOffset", hour: "2-digit" });
  const zoneName = formatter.formatToParts(utcDate).find((part) => part.type === "timeZoneName")?.value;
  const match = String(zoneName || "GMT+0").match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/i);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  return sign * (hours * 60 + minutes) * 60 * 1000;
}

function createUtcFromRomeLocal(year, month, day, hour, minute, second) {
  const baseUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const firstOffsetMs = getRomeOffsetMs(new Date(baseUtcMs));
  let utcMs = baseUtcMs - firstOffsetMs;
  const secondOffsetMs = getRomeOffsetMs(new Date(utcMs));
  if (secondOffsetMs !== firstOffsetMs) utcMs = baseUtcMs - secondOffsetMs;
  return utcMs;
}

function resolveCfg(client) {
  const raw = client?.config?.minigames?.burrobirraEffect;
  const o = raw && typeof raw === "object" ? raw : {};
  const durationMs = safeInt(o.durationMs, DEFAULT_CONFIG.durationMs, 10 * 60 * 1000, 4 * 60 * 60 * 1000);
  const windowStartHour = safeInt(o.windowStartHour, DEFAULT_CONFIG.windowStartHour, 0, 23);
  const windowStartMinute = safeInt(o.windowStartMinute, DEFAULT_CONFIG.windowStartMinute, 0, 59);
  let windowEndHour = safeInt(o.windowEndHour, DEFAULT_CONFIG.windowEndHour, 0, 23);
  let windowEndMinute = safeInt(o.windowEndMinute, DEFAULT_CONFIG.windowEndMinute, 0, 59);
  const startTotal = windowStartHour * 60 + windowStartMinute;
  let endTotal = windowEndHour * 60 + windowEndMinute;
  if (endTotal <= startTotal) {
    endTotal = Math.min(23 * 60 + 59, startTotal + Math.max(60, Math.floor(durationMs / 60_000)));
    windowEndHour = Math.floor(endTotal / 60);
    windowEndMinute = endTotal % 60;
  }
  const channelId = normalizeId(o.channelId || IDs.channels?.chat || "");
  return {
    enabled: o.enabled !== false,
    onlyDuringHogwartsEvent: o.onlyDuringHogwartsEvent !== false,
    windowStartHour,
    windowStartMinute,
    windowEndHour,
    windowEndMinute,
    durationMs,
    maxOccurrencesPerDay: safeInt(o.maxOccurrencesPerDay, DEFAULT_CONFIG.maxOccurrencesPerDay, 1, 24),
    minGapBetweenMs: safeInt(o.minGapBetweenMs, DEFAULT_CONFIG.minGapBetweenMs, 0, 6 * 60 * 60 * 1000),
    channelId,
  };
}

function eventGateOpen(client, nowMs = Date.now()) {
  const cfg = resolveCfg(client);
  if (!cfg.enabled) return false;
  if (!cfg.onlyDuringHogwartsEvent) return true;
  const eventCfg = resolveHogwartsEventConfig(client);
  return Boolean(isEventWindowOpen(eventCfg, nowMs)?.open);
}

function getWindowMinuteBounds(cfg) {
  const startMin = cfg.windowStartHour * 60 + cfg.windowStartMinute;
  const endMin = cfg.windowEndHour * 60 + cfg.windowEndMinute;
  const durationMin = Math.max(1, Math.ceil(cfg.durationMs / 60_000));
  const latestStartMin = endMin - durationMin;
  return { startMin, endMin, durationMin, latestStartMin };
}

function slotMinuteRangesOverlap(aStart, bStart, durationMin, minGapMin) {
  const gap = Math.max(0, minGapMin);
  const aEnd = aStart + durationMin;
  const bEnd = bStart + durationMin;
  return !(bStart >= aEnd + gap || aStart >= bEnd + gap);
}

function normalizeSlot(raw) {
  const startAtMs = Math.floor(Number(raw?.startAtMs) || 0);
  const endAtMs = Math.floor(Number(raw?.endAtMs) || 0);
  if (!startAtMs || !endAtMs || endAtMs <= startAtMs) return null;
  return {
    startAtMs,
    endAtMs,
    disclaimerSent: Boolean(raw?.disclaimerSent),
    endSent: Boolean(raw?.endSent),
  };
}

function applyConfiguredSlotDuration(slots, durationMs) {
  const dur = Math.max(60_000, Math.floor(Number(durationMs) || 0));
  if (!dur) return { slots: normalizeSlots(slots), changed: false };
  let changed = false;
  const next = normalizeSlots(slots).map((slot) => {
    const endAtMs = slot.startAtMs + dur;
    if (endAtMs !== slot.endAtMs) changed = true;
    return { ...slot, endAtMs };
  });
  return { slots: next, changed };
}

function normalizeSlots(rawSlots) {
  if (!Array.isArray(rawSlots)) return [];
  return rawSlots.map(normalizeSlot).filter(Boolean).sort((a, b) => a.startAtMs - b.startAtMs);
}

function migrateLegacyDayDoc(rawWebhook) {
  const startAtMs = Math.floor(Number(rawWebhook?.startAtMs) || 0);
  const endAtMs = Math.floor(Number(rawWebhook?.endAtMs) || 0);
  if (!startAtMs || !endAtMs || endAtMs <= startAtMs) return [];
  return normalizeSlots([{
    startAtMs,
    endAtMs,
    disclaimerSent: Boolean(rawWebhook?.disclaimerSent),
    endSent: Boolean(rawWebhook?.endSent),
  }]);
}

function generateDaySlots(dateKey, cfg, nowMs = Date.now()) {
  const [y, m, d] = String(dateKey || "").split("-").map((x) => Number(x));
  if (!y || !m || !d) return [];
  const { startMin, durationMin, latestStartMin } = getWindowMinuteBounds(cfg);
  if (latestStartMin < startMin) return [];
  const minGapMin = Math.max(0, Math.floor(cfg.minGapBetweenMs / 60_000));
  const span = Math.max(1, latestStartMin - startMin + 1);
  const maxOccurrences = cfg.maxOccurrencesPerDay;
  const todayKey = romeDateKey(new Date(nowMs));
  const romeNow = getRomeParts(new Date(nowMs));
  const nowMinuteOfDay = todayKey === dateKey ? romeNow.hour * 60 + romeNow.minute : 0;
  const candidates = [];
  for (let i = 0; i < span; i += 1) {
    const minuteOfDay = startMin + i;
    if (dateKey === todayKey && minuteOfDay < nowMinuteOfDay) continue;
    candidates.push(minuteOfDay);
  }
  for (let i = candidates.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const picked = [];
  for (const minuteOfDay of candidates) {
    if (picked.length >= maxOccurrences) break;
    if (picked.some((p) => slotMinuteRangesOverlap(p, minuteOfDay, durationMin, minGapMin))) continue;
    picked.push(minuteOfDay);
  }
  picked.sort((a, b) => a - b);
  return picked.map((minuteOfDay) => {
    const hour = Math.floor(minuteOfDay / 60);
    const minute = minuteOfDay % 60;
    const startAtMs = createUtcFromRomeLocal(y, m, d, hour, minute, 0);
    return {
      startAtMs,
      endAtMs: startAtMs + cfg.durationMs,
      disclaimerSent: false,
      endSent: false,
    };
  });
}

async function loadDayDoc(guildId, dateKey) {
  return SiteDocument.findOne({
    docType: DOC_TYPE,
    guildId: normalizeId(guildId),
    userId: DOC_OWNER_ID,
    dedupeKey: normalizeId(dateKey),
  })
    .lean()
    .catch(() => null);
}

function slotsOverlapWithGap(a, b, gapMs) {
  const gap = Math.max(0, Number(gapMs) || 0);
  return !(a.startAtMs >= b.endAtMs + gap || b.startAtMs >= a.endAtMs + gap);
}

/** Aggiunge slot futuri se il piano giornaliero è sotto maxOccurrences (es. dopo aumento config). */
function topUpDaySlots(existingSlots, dateKey, cfg, nowMs = Date.now()) {
  const current = normalizeSlots(existingSlots);
  if (current.length >= cfg.maxOccurrencesPerDay) return { slots: current, changed: false };
  const generated = generateDaySlots(dateKey, cfg, nowMs);
  if (!generated.length) return { slots: current, changed: false };
  const gapMs = Math.max(0, Number(cfg.minGapBetweenMs) || 0);
  const merged = current.slice();
  let changed = false;
  for (const slot of generated) {
    if (merged.length >= cfg.maxOccurrencesPerDay) break;
    if (slot.endAtMs <= nowMs) continue;
    if (merged.some((s) => slotsOverlapWithGap(s, slot, gapMs))) continue;
    if (merged.some((s) => Math.abs(s.startAtMs - slot.startAtMs) < 60_000)) continue;
    merged.push({
      startAtMs: slot.startAtMs,
      endAtMs: slot.endAtMs,
      disclaimerSent: false,
      endSent: false,
    });
    changed = true;
  }
  return { slots: normalizeSlots(merged), changed };
}

/** Se maxOccurrences scende, elimina gli slot futuri in eccesso (non quelli già partiti). */
function pruneExcessFutureSlots(existingSlots, cfg, nowMs = Date.now()) {
  const all = normalizeSlots(existingSlots);
  const started = all.filter((s) => s.startAtMs <= nowMs);
  const future = all.filter((s) => s.startAtMs > nowMs);
  const budget = Math.max(0, Number(cfg.maxOccurrencesPerDay) || 0);
  const futureBudget = Math.max(0, budget - started.length);
  const keptFuture = future.slice(0, futureBudget);
  const next = normalizeSlots([...started, ...keptFuture]);
  const changed =
    next.length !== all.length ||
    next.some((slot, idx) => slot.startAtMs !== all[idx]?.startAtMs || slot.endAtMs !== all[idx]?.endAtMs);
  return { slots: next, changed };
}

async function persistDaySlots(guildId, dateKey, slots) {
  if (!slots.length) return;
  const lastEndAtMs = slots[slots.length - 1].endAtMs;
  await SiteDocument.findOneAndUpdate(
    {
      docType: DOC_TYPE,
      guildId: normalizeId(guildId),
      userId: DOC_OWNER_ID,
      dedupeKey: normalizeId(dateKey),
    },
    {
      $setOnInsert: {
        docType: DOC_TYPE,
        guildId: normalizeId(guildId),
        userId: DOC_OWNER_ID,
        dedupeKey: normalizeId(dateKey),
        createdBy: "burrobirra_effect",
      },
      $set: {
        status: "scheduled",
        planKey: "burrobirra_effect",
        "rawWebhook.slots": slots,
        "rawWebhook.version": 2,
        cooldownUntil: new Date(lastEndAtMs),
      },
      $unset: {
        "rawWebhook.startAtMs": "",
        "rawWebhook.endAtMs": "",
        "rawWebhook.disclaimerSent": "",
        "rawWebhook.endSent": "",
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);
}

async function ensureDayPlan(client, guildId, dateKey, cfg) {
  const existing = await loadDayDoc(guildId, dateKey);
  const version = Number(existing?.rawWebhook?.version || 0);
  let slots = normalizeSlots(existing?.rawWebhook?.slots);
  if (!slots.length) slots = migrateLegacyDayDoc(existing?.rawWebhook);
  const nowMs = Date.now();
  const durationSynced = applyConfiguredSlotDuration(slots, cfg.durationMs);
  slots = durationSynced.slots;
  let dirty = durationSynced.changed;
  const allPastAndMissed = slots.length > 0 && slots.every((s) => nowMs >= s.endAtMs && !s.disclaimerSent);
  const hasUpcoming = slots.some((s) => s.endAtMs > nowMs);

  if (version >= 2 && slots.length && !allPastAndMissed) {
    const pruned = pruneExcessFutureSlots(slots, cfg, nowMs);
    if (pruned.changed) {
      slots = pruned.slots;
      dirty = true;
    }
    const topped = topUpDaySlots(slots, dateKey, cfg, nowMs);
    if (topped.changed) {
      slots = topped.slots;
      dirty = true;
    }
    if (dirty) await persistDaySlots(guildId, dateKey, slots);
    return { slots, dateKey, guildId };
  }
  if (version >= 2 && slots.length && allPastAndMissed && !hasUpcoming) {
    slots = generateDaySlots(dateKey, cfg, nowMs);
    if (!slots.length) return { slots: [], dateKey, guildId };
  } else if (version >= 2 && slots.length) {
    if (dirty) await persistDaySlots(guildId, dateKey, slots);
    return { slots, dateKey, guildId };
  }
  if (slots.length && findActiveSlot(slots, nowMs)) {
    const topped = topUpDaySlots(slots, dateKey, cfg, nowMs);
    if (topped.changed) {
      slots = topped.slots;
      dirty = true;
    }
    if (dirty) await persistDaySlots(guildId, dateKey, slots);
    return { slots, dateKey, guildId };
  }
  if (!slots.length || allPastAndMissed) slots = generateDaySlots(dateKey, cfg, nowMs);
  if (!slots.length) return { slots: [], dateKey, guildId };
  await persistDaySlots(guildId, dateKey, slots);
  return { slots, dateKey, guildId };
}

function findActiveSlot(slots, nowMs) {
  return slots.find((slot) => nowMs >= slot.startAtMs && nowMs < slot.endAtMs) || null;
}

function findLiveEffectSlot(slots, nowMs) {
  // Resta "live" finché l'end notice non è stato inviato (anche oltre endAtMs se #chat è occupata).
  return (
    slots.find((slot) => slot?.disclaimerSent && !slot.endSent && nowMs >= slot.startAtMs) || null
  );
}

function buildDisclaimerEmbed(endAtMs) {
  const endSec = Math.floor(Number(endAtMs) / 1000);
  return new EmbedBuilder()
    .setColor("#c9a227")
    .setTitle("<a:VC_Beer:1448687940560490547> EFFETTO BURROBIRRA")
    .setDescription(
      [
        "<a:VC_Alert:1482706673176150077> **Attenzione:** l'aria di Hogwarts sa di **Burrobirra**!",
        "",
        "<a:VC_catRAVE:1506009917906227200> Per effetto della burrobirra tutti sembrano **ubriachi**: per un po' i **minigame** diventeranno **strani**.",
        "> <a:VC_catdemon:1505995179738403017> Frasi confuse, immagini capovolte, reaction **esca** e **vincente** che si scambiano….",
        "",
        endSec > 0 ? `<a:VC_pixeltime:1482535344103620771> L'effetto termina <t:${endSec}:R>.` : "<a:VC_pixeltime:1482535344103620771> L'effetto dura ancora un po'.",
        "",
        "*Buona fortuna — servirà.* <a:VC_Beer:1448687940560490547>",
      ].join("\n"),
    )
    .setImage(BURROBIRRA_EMBED_IMAGE_URL);
}

function buildEndEmbed() {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<a:VC_Beer:1448687940560490547> Effetto Burrobirra terminato")
    .setDescription(
      "<a:VC_pixeltime:1482535344103620771> La Burrobirra ha smesso di fare effetto. I minigame tornano **normali**… più o meno.",
    )
    .setImage(BURROBIRRA_EMBED_IMAGE_URL);
}

function resolveDisclaimerPingRoleIds(client) {
  const seen = new Set();
  const roles = [];
  const add = (id) => {
    const rid = normalizeId(id);
    if (!rid || seen.has(rid)) return;
    seen.add(rid);
    roles.push(rid);
  };
  add(IDs.roles?.Minigames);
  const eventRaw = client?.config?.hogwartsEvent;
  if (eventRaw && typeof eventRaw === "object") add(eventRaw.eventsRoleId);
  add(IDs.roles?.HogwartsEventParticipant);
  return roles;
}

async function publishDisclaimer(client, cfg, endAtMs) {
  const channelId = cfg.channelId;
  if (!channelId) return false;
  const channel = client.channels.cache.get(channelId) || (await getClientChannelCached(client, channelId, { ttlMs: 60_000 }));
  if (!channel?.isTextBased?.()) return false;
  const roleIds = resolveDisclaimerPingRoleIds(client);
  const content = roleIds.length ? roleIds.map((id) => `<@&${id}>`).join(" ") : "";
  await channel
    .send({
      content,
      embeds: [buildDisclaimerEmbed(endAtMs)],
      allowedMentions: roleIds.length ? { roles: roleIds } : { parse: [] },
    })
    .catch(() => null);
  return true;
}

async function publishEndNotice(client, cfg) {
  const channelId = cfg.channelId;
  if (!channelId) return false;
  const channel = client.channels.cache.get(channelId) || (await getClientChannelCached(client, channelId, { ttlMs: 60_000 }));
  if (!channel?.isTextBased?.()) return false;
  await channel.send({ embeds: [buildEndEmbed()], allowedMentions: { parse: [] } }).catch(() => null);
  return true;
}

async function markSlotFlag(guildId, dateKey, startAtMs, field, status) {
  const path = `rawWebhook.slots.$[slot].${field}`;
  const update = { $set: { [path]: true } };
  if (status) update.$set.status = status;
  await SiteDocument.updateOne(
    { docType: DOC_TYPE, guildId: normalizeId(guildId), userId: DOC_OWNER_ID, dedupeKey: normalizeId(dateKey) },
    update,
    { arrayFilters: [{ "slot.startAtMs": Math.floor(Number(startAtMs) || 0) }] },
  ).catch(() => null);
}

async function markSlotSkipped(guildId, dateKey, startAtMs) {
  await SiteDocument.updateOne(
    { docType: DOC_TYPE, guildId: normalizeId(guildId), userId: DOC_OWNER_ID, dedupeKey: normalizeId(dateKey) },
    {
      $set: {
        "rawWebhook.slots.$[slot].disclaimerSent": true,
        "rawWebhook.slots.$[slot].endSent": true,
        status: "skipped",
      },
    },
    { arrayFilters: [{ "slot.startAtMs": Math.floor(Number(startAtMs) || 0) }] },
  ).catch(() => null);
}

async function markSlotStarted(guildId, dateKey, startAtMs, endAtMs) {
  await SiteDocument.updateOne(
    { docType: DOC_TYPE, guildId: normalizeId(guildId), userId: DOC_OWNER_ID, dedupeKey: normalizeId(dateKey) },
    {
      $set: {
        "rawWebhook.slots.$[slot].disclaimerSent": true,
        "rawWebhook.slots.$[slot].endAtMs": Math.floor(Number(endAtMs) || 0),
        status: "active",
      },
    },
    { arrayFilters: [{ "slot.startAtMs": Math.floor(Number(startAtMs) || 0) }] },
  ).catch(() => null);
}

async function getBurrobirraWindow(client, nowMs = Date.now()) {
  if (!eventGateOpen(client, nowMs)) return null;
  const cfg = resolveCfg(client);
  const guildId = normalizeId(IDs.guilds?.main || "");
  if (!guildId) return null;
  const dateKey = romeDateKey(new Date(nowMs));
  const plan = await ensureDayPlan(client, guildId, dateKey, cfg);
  if (!plan?.slots?.length) return null;
  const activeSlot = findLiveEffectSlot(plan.slots, nowMs);
  return {
    slots: plan.slots,
    activeSlot,
    active: Boolean(activeSlot),
    cfg,
    guildId,
    dateKey,
    startAtMs: activeSlot?.startAtMs || 0,
    endAtMs: activeSlot?.endAtMs || 0,
  };
}

function isBurrobirraActive(client, nowMs = Date.now()) {
  if (!eventGateOpen(client, nowMs)) return false;
  return Boolean(activeCacheByClient.get(client));
}

async function isBurrobirraActiveAsync(client, nowMs = Date.now()) {
  const window = await getBurrobirraWindow(client, nowMs);
  return Boolean(window?.active);
}

async function applyBurrobirraToClientPayload(client, payload, seed = "minigame", options = null) {
  if (!client || !payload) return payload;
  const active = await isBurrobirraActiveAsync(client);
  if (!active) return payload;
  return applyBurrobirraToPayload(payload, seed, options);
}

async function swapTreasureHuntPairIfBurrobirra(client, pair) {
  if (!pair || typeof pair !== "object") return pair;
  if (!(await isBurrobirraActiveAsync(client))) return pair;
  return {
    ...pair,
    decoy: pair.winner,
    winner: pair.decoy,
    decoyDisplay: pair.winnerDisplay || pair.winner,
    winnerDisplay: pair.decoyDisplay || pair.decoy,
    burrobirraSwapped: true,
  };
}

async function refreshBurrobirraActiveCache(client, nowMs = Date.now()) {
  if (!client) return false;
  const window = await getBurrobirraWindow(client, nowMs).catch(() => null);
  const active = Boolean(window?.active);
  activeCacheByClient.set(client, active);
  return active;
}

async function runBurrobirraTick(client) {
  if (!client) return;
  await refreshBurrobirraActiveCache(client);
  if (!eventGateOpen(client)) return;
  const cfg = resolveCfg(client);
  const guildId = normalizeId(IDs.guilds?.main || "");
  if (!guildId) return;
  const nowMs = Date.now();
  const dateKey = romeDateKey(new Date(nowMs));
  const plan = await ensureDayPlan(client, guildId, dateKey, cfg);
  if (!plan?.slots?.length) return;

  const romeNow = getRomeParts(new Date(nowMs));
  const nowMinuteOfDay = romeNow.hour * 60 + romeNow.minute;
  const { endMin: dayWindowEndMin } = getWindowMinuteBounds(cfg);
  const withinDayWindow = nowMinuteOfDay <= dayWindowEndMin;
  const { isMainChatMinigameChannelBusy } = require("./minigameService");
  const chatBusy = isMainChatMinigameChannelBusy();
  const hasLiveEffect = plan.slots.some((s) => s.disclaimerSent && !s.endSent && nowMs >= s.startAtMs);

  for (const slot of plan.slots) {
    if (slot.disclaimerSent && !slot.endSent && nowMs >= slot.endAtMs) {
      // Non chiudere / annunciare a metà minigame: aspetta che #chat sia libera.
      if (chatBusy) continue;
      const sent = await publishEndNotice(client, cfg);
      if (sent) {
        slot.endSent = true;
        await markSlotFlag(guildId, dateKey, slot.startAtMs, "endSent", "completed");
      }
      continue;
    }

    if (slot.disclaimerSent) continue;

    if (nowMs < slot.startAtMs) continue;

    // Non parte sopra un minigame in corso.
    if (chatBusy) {
      if (withinDayWindow) continue;
      slot.disclaimerSent = true;
      slot.endSent = true;
      await markSlotSkipped(guildId, dateKey, slot.startAtMs);
      continue;
    }

    // Un solo effetto live alla volta.
    if (hasLiveEffect) continue;

    // Durata piena da quando parte davvero.
    const endAtMs = nowMs + cfg.durationMs;
    const sent = await publishDisclaimer(client, cfg, endAtMs);
    if (sent) {
      slot.disclaimerSent = true;
      slot.endAtMs = endAtMs;
      await markSlotStarted(guildId, dateKey, slot.startAtMs, endAtMs);
      break;
    }
    global.logger?.warn?.("[BURROBIRRA EFFECT] publishDisclaimer fallita", {
      channelId: cfg.channelId,
      startAtMs: slot.startAtMs,
    });
  }
}

function startBurrobirraEffectLoop(client) {
  if (!client || loopState.has(client)) return;
  loopState.add(client);
  const tick = () => {
    runBurrobirraTick(client).catch((err) => {
      global.logger?.warn?.("[BURROBIRRA EFFECT] tick:", err?.message || err);
    });
  };
  const first = setTimeout(tick, 20_000);
  if (typeof first.unref === "function") first.unref();
  cron.schedule(
    "* * * * *",
    runCronDetached("[BURROBIRRA EFFECT]", () => runBurrobirraTick(client)),
    { timezone: TIME_ZONE, noOverlap: true, recoverMissedExecutions: false },
  );
}

module.exports = { resolveCfg, isBurrobirraActive, isBurrobirraActiveAsync, refreshBurrobirraActiveCache, getBurrobirraWindow, applyBurrobirraToClientPayload, swapTreasureHuntPairIfBurrobirra, runBurrobirraTick, startBurrobirraEffectLoop };