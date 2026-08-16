const { EmbedBuilder } = require("discord.js");
const { randomInt } = require("crypto");
const path = require("path");
const { readSnapshotWithMeta, writeSnapshotWithMeta } = require("../../../shared/recovery/snapshotStore");
const { registerShutdownFlush, armShutdownCheckpoint } = require("../../../shared/recovery/shutdownCheckpoint");
const { chatReminderRotationFindOneLean, chatReminderRotationFindOneAndUpdate, chatReminderScheduleCreate, chatReminderScheduleUpdateOne, chatReminderScheduleDeleteOne, chatReminderScheduleFindLatestFuture, chatReminderScheduleFindDueLean, chatReminderScheduleDeleteManyFuture } = require("../../../Vinyls/Utils/BotState/domainStatesStore");
const { getClientChannelCached } = require("../../Utils/Interaction/entityCache");
const IDs = require("../../Utils/Config/ids");
const { isChatHubMinigameActive } = require("../../../shared/discord/chatHubMinigameGate");
const {
  CHAT_HUB_SOURCES,
  DEFAULT_CROSS_BOT_GAP_MS,
  recordChatHubBotPost,
  extendChatHubQuietForMs,
  waitForChatHubSlot,
} = require("../../../shared/discord/chatHubBotPacing");
const CHAT_HUB_CROSS_BOT_GAP_MS = Math.max(
  3 * 60 * 1000,
  Number(process.env.VC_CHAT_HUB_CROSS_BOT_GAP_MS || DEFAULT_CROSS_BOT_GAP_MS),
);
const REMINDER_CHAT_DEFER_MS = Math.max(
  5 * 60 * 1000,
  Number(process.env.VC_CHAT_REMINDER_DEFER_MS || 10 * 60 * 1000),
);
const DEFAULT_TIME_ZONE = "Europe/Rome";
const DEFAULT_START_HOUR = 9;
const DEFAULT_END_HOUR = 21;
const REMINDER_FIXED_INTERVAL_MINUTES = 45;
const DEFAULT_MIN_GAP_MS = 30 * 60 * 1000;
const MIN_CHAT_MESSAGES_45M = 10;
const CHAT_ACTIVITY_WINDOW_45M_MS = 45 * 60 * 1000;
const scheduledHours = new Map();
const scheduledTimeouts = new Map();
let lastReminderSlotKey = null;
let rotationDate = null;
let rotationQueue = [];
let rotationGuildId = null;
let lastSentAt = null;
let currentCycleStartKey = "";
const reminderActivity = new Map();
let hourlyLoopHandle = null;
const REMINDER_RUNTIME_SNAPSHOT_PATH = path.join(__dirname, "..", "..", "Data", "chatReminderRuntimeSnapshot.json");
let reminderRuntimeLoaded = false;

function persistReminderRuntimeNow() {
  const payload = {
    scheduledHours: Object.fromEntries(scheduledHours.entries()),
  };
  writeSnapshotWithMeta({
    filePath: REMINDER_RUNTIME_SNAPSHOT_PATH,
    walPath: `${REMINDER_RUNTIME_SNAPSHOT_PATH}.wal`,
    key: "coffee_chat_reminder_runtime",
    version: 1,
    payload,
  });
}

function ensureReminderRuntimeLoaded() {
  if (reminderRuntimeLoaded) return;
  reminderRuntimeLoaded = true;
  const raw = readSnapshotWithMeta({
    filePath: REMINDER_RUNTIME_SNAPSHOT_PATH,
    walPath: `${REMINDER_RUNTIME_SNAPSHOT_PATH}.wal`,
    key: "coffee_chat_reminder_runtime",
    version: 1,
    fallback: { scheduledHours: {} },
  });
  for (const [k, v] of Object.entries(raw?.scheduledHours || {})) {
    const at = Number(v || 0);
    if (!k || !Number.isFinite(at) || at <= 0) continue;
    scheduledHours.set(String(k), at);
  }
  armShutdownCheckpoint();
  registerShutdownFlush("coffee_chat_reminder_runtime", () => persistReminderRuntimeNow());
}

function cleanupScheduledHourKeys() {
  ensureReminderRuntimeLoaded();
  const now = Date.now();
  const maxAgeMs = 6 * 60 * 60 * 1000;
  for (const [key, createdAt] of scheduledHours.entries()) {
    if (!Number.isFinite(createdAt) || now - createdAt > maxAgeMs) {
      scheduledHours.delete(key);
    }
  }
  persistReminderRuntimeNow();
}

function attachScheduleTimeout(scheduleId, timeout) {
  if (!scheduleId) return;
  const id = String(scheduleId);
  const existing = scheduledTimeouts.get(id);
  if (existing) clearTimeout(existing);
  scheduledTimeouts.set(id, timeout);
}

function clearScheduleTimeout(scheduleId) {
  if (!scheduleId) return;
  const id = String(scheduleId);
  const existing = scheduledTimeouts.get(id);
  if (existing) clearTimeout(existing);
  scheduledTimeouts.delete(id);
}

const reminderPool = [
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<a:VC_Vote:1482535223001485473> Vota ogni giorno!")
      .setDescription(
        [
          "<:VC_EXP:1482534670896730143> Con il tuo primo voto otterrai **250 EXP** mentre le volte successive un semplice boost di EXP che ti aiuteranno a scalare la classifica settimanale! Grazie per il tuo sostegno!",
          "<:VC_Link:1482460590894088222> Vota [qui](https://www.viniliecaffe.it/vote) ogni giorno!",
        ].join("\n"),
      ),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<:VC_bump:1482531857521311885> La tua opinione è importante!")
      .setDescription([
        `<:VC_LevelUp2:1482527047871107143> Lascia una recensione e aiuta Vinili & Caffè a migliorare costantemente. Con la tua recensione potrai riscattare **5 livelli** come ringraziamento.`,
        "<:VC_Link:1482460590894088222> Lascia la tua recensione [qui](https://viniliecaffe.it/recensioni)",
      ].join("\n")),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<a:VC_PepeFoto:1479131953100750882> Sblocca subito i PicPerms!")
      .setDescription([
        '<:VC_Link:1482460590894088222> Stanco di non poter inviare immagini in <#1442569130573303898>? Inserisci “.gg/viniliecaffe” o “viniliecaffe.it” nel tuo stato, boosta il server o raggiungi <@&1442568936423034940> per sbloccare velocemente il permesso!',
        `> <a:VC_Arrow:1482706699365257397> Scopri tutte le ricompense di boost & livelli [sul nostro sito](https://viniliecaffe.it/perks)`,
      ].join("\n")),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<:VC_Color:1482532543273238569> Sblocca i colori gradienti esclusivi!")
      .setDescription([
        "<:VC_Vip:1482534921472835895> Ottieni i colori PLUS con i ruoli <@&1329497467481493607> o <@&1442568932136587297> e ricorda: con <@&1442568950805430312> puoi crearne uno personalizzato! Per impostare il tuo colore usa il comando `+profile` in <#1442569138114662490>",
      ].join("\n")),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<:VC_Color:1482532543273238569> Personalizza il tuo profilo del server!")
      .setDescription([
        "<:VC_Vip:1482534921472835895> Digita `+profile` in <#1442569138114662490> e imposta il tuo compleanno, attiva i reminder del nostro bot per accumulare EXP!",
        "",
        `<a:VC_Boost:1482706171386269830> Alcuni colori si sbloccano con livelli o boost: rendi il tuo profilo davvero personale!`,
      ].join("\n")),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<:VC_Link:1482460590894088222> Aggiungi un posto a tavola che c’è un amico in più!")
      .setDescription([
        "<a:VC_FlowerPink:1468688049725636903> In gruppo il divertimento raddoppia! Invitando i tuoi amici  su Vinili & Caffè contribuirai a realizzare una community sempre più unita e animata aumentando anche i tuoi punti EXP con l’attività che ne deriverebbe!",
        "",
        "<a:VC_Beer:1448687940560490547> Basta condividere il link del server o quello nelle info!",
      ].join("\n")),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<a:VC_HeartsBlue:1468686100045369404> Vieni in vocale con noi!")
      .setDescription([
        "<a:VC_Flowers:1468687836055212174> Oltre alla chat, unisciti ai **canali vocali** per musica, giochi e chiacchiere live. La voce ci rende una vera famiglia!",
        "",
        "<a:VC_Mute:1482534751511515238> Nessuno è obbligato: puoi parlare oppure solo ascoltare. Trova la categoria vocali e entra quando vuoi.",
      ].join("\n")),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<a:VC_Announce:1482534613568979007> Resta sempre aggiornato!")
      .setDescription([
        "<:VC_Eye:1331619214410383381> Eventi, novità e annunci? Li trovi nei canali del server! Rimani sintonizzato su <#1442569115972669541>!",
        "",
        `<a:VC_Flowers:1468687836055212174> Tutto su livelli, premi e iniziative sempre [sul nostro sito](https://viniliecaffe.it/perks)!`,
      ].join("\n")),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<a:VC_Events:1482706144953897223> TOP WEEKLY!")
      .setDescription([
        "<a:VC_HelloKittyGift:1329447876857958471> Ogni domenica alle 21:00 scopriamo l’utente più attivo del server su <#1470183921236049940>! Sfida gli altri e scala la classifica della settimana per avere vantaggi settimanali!",
      ].join("\n")),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<:VC_Collab:1482534540089098260> Vuoi sponsorizzare il tuo server o social network?")
      .setDescription([
        "<a:VC_ThankYou:1330186319673950401> Vinili & Caffè offre sponsorizzazioni per i tuoi progetti. Apri un <#1442569095068254219> `HIGH STAFF` per avere più info!",
        "<:VC_Ticket:1482535175283019888> Trovi tutte le info sulle sponsorizzazioni [sul nostro sito](https://viniliecaffe.it/sponsor)",
      ].join("\n")),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<a:VC_Events:1482706144953897223> Giveaway per tutti!")
      .setDescription([
        "<:VC_Wallet:1482534947574124584> Partecipa ai nostri giveaway! Li trovi in <#1442569115972669541> e sono aperti a tutti i membri: non perdere le prossime estrazioni!",
      ].join("\n")),
];

function getDateKey(parts) {
  const y = parts.year;
  const m = String(parts.month).padStart(2, "0");
  const d = String(parts.day).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getCfg(client) {
  return client?.config?.chatReminder || {};
}

function getReminderChannelId(client) {
  const channelId = getCfg(client)?.channelId || IDs.channels?.chat;
  return channelId || null;
}

function getTimeZone(client) {
  return getCfg(client)?.timeZone || DEFAULT_TIME_ZONE;
}

function getStartHour(client) {
  return Number.isFinite(Number(getCfg(client)?.startHour))
    ? Number(getCfg(client)?.startHour)
    : DEFAULT_START_HOUR;
}

function getEndHour(client) {
  return Number.isFinite(Number(getCfg(client)?.endHour))
    ? Number(getCfg(client)?.endHour)
    : DEFAULT_END_HOUR;
}

function getMinGapMs(client) {
  return Math.max(
    60 * 1000,
    Number(getCfg(client)?.minGapMs || DEFAULT_MIN_GAP_MS),
  );
}

function getFirstThreshold(client) {
  return Math.max(1, Number(getCfg(client)?.firstReminderMinMessages30m || 5));
}

function getSecondThreshold(client) {
  return Math.max(
    1,
    Number(getCfg(client)?.secondReminderMinMessages30m || 20),
  );
}

async function saveRotationState() {
  if (!rotationGuildId || !rotationDate) return;
  await chatReminderRotationFindOneAndUpdate(
    { guildId: rotationGuildId },
    {
      $set: {
        dateKey: rotationDate,
        queue: rotationQueue,
        lastSentAt: lastSentAt ? new Date(lastSentAt) : null,
        cycleStartKey: currentCycleStartKey || "",
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => { });
}

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildShuffledQueueAvoiding(avoidCommaKey) {
  const base = reminderPool.map((_, idx) => idx);
  const avoid = String(avoidCommaKey || "").trim();
  let out = shuffleArray(base);
  let guard = 0;
  while (
    avoid &&
    out.join(",") === avoid &&
    reminderPool.length > 1 &&
    guard < 64
  ) {
    out = shuffleArray(base);
    guard += 1;
  }
  return out;
}

async function loadRotationState(guildId, dateKey) {
  rotationGuildId = guildId;
  const doc = await chatReminderRotationFindOneLean({ guildId }).catch(() => null);
  const normDate = dateKey ? String(dateKey) : "";
  if (doc && normDate && String(doc.dateKey || "") === normDate && Array.isArray(doc.queue)) {
    const filtered = doc.queue.filter((i) => Number.isInteger(i) && i >= 0 && i < reminderPool.length);
    if (filtered.length > 0) {
      rotationDate = doc.dateKey;
      lastSentAt = doc.lastSentAt ? new Date(doc.lastSentAt).getTime() : null;
      rotationQueue = filtered.slice();
      currentCycleStartKey = String(doc.cycleStartKey || "").trim();
      return;
    }
  }
  rotationDate = normDate;
  rotationQueue = [];
  currentCycleStartKey = "";
  lastSentAt = doc?.lastSentAt ? new Date(doc.lastSentAt).getTime() : null;
}

async function nextReminderEmbed(parts, guildId) {
  const key = getDateKey(parts);
  const gid = guildId || rotationGuildId;
  if (gid) await loadRotationState(gid, key);

  if (rotationDate !== key) {
    rotationDate = key;
    rotationQueue = [];
    currentCycleStartKey = "";
  }

  if (rotationQueue.length === 0) {
    let avoidKey = "";
    if (gid && String(rotationDate || "") === key) {
      const prevDoc = await chatReminderRotationFindOneLean({ guildId: gid }).catch(() => null);
      if (
        prevDoc &&
        String(prevDoc.dateKey || "") === key &&
        String(prevDoc.cycleStartKey || "").trim()
      ) {
        avoidKey = String(prevDoc.cycleStartKey).trim();
      }
    }
    rotationQueue = buildShuffledQueueAvoiding(avoidKey);
    currentCycleStartKey = rotationQueue.join(",");
    await saveRotationState();
  }
  if (rotationQueue.length === 0) {
    const next = reminderPool[0];
    return next ? next() : null;
  }
  const index = rotationQueue.shift();
  await saveRotationState();
  const next = Number.isFinite(index) ? reminderPool[index] : reminderPool[0];
  return next ? next() : null;
}

function getRomeParts(date, client) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: getTimeZone(client),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const map = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function getHourKey(parts) {
  return `${parts.year}-${parts.month}-${parts.day}_${parts.hour}`;
}

function isReminderFixedSlot(parts, client) {
  const { hour, minute } = parts;
  const start = getStartHour(client);
  const end = getEndHour(client);
  if (hour < start || hour > end) return false;
  const totalMins = hour * 60 + minute;
  const startMins = start * 60 + 1;
  if (totalMins < startMins) return false;
  return (totalMins - startMins) % REMINDER_FIXED_INTERVAL_MINUTES === 0;
}

function rand(max) {
  if (max <= 0) return 0;
  return randomInt(0, max + 1);
}

function recordReminderActivity(channelId) {
  if (!channelId) return;
  const now = Date.now();
  const list = reminderActivity.get(channelId) || [];
  list.push(now);
  const cutoff = now - 60 * 60 * 1000;
  const trimmed = list.filter((ts) => ts >= cutoff);
  reminderActivity.set(channelId, trimmed);
}

function getRecentReminderCount(channelId, windowMs = 60 * 60 * 1000) {
  if (!channelId) return 0;
  const now = Date.now();
  const list = reminderActivity.get(channelId) || [];
  const cutoff = now - windowMs;
  const trimmed = list.filter((ts) => ts >= cutoff);
  reminderActivity.set(channelId, trimmed);
  return trimmed.length;
}

async function getRecentChannelMessageCount(client, channelId, windowMs = 60 * 60 * 1000) {
  if (!client || !channelId) return 0;
  const channel = await getClientChannelCached(client, channelId);
  if (!channel?.isTextBased?.()) return 0;
  const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!messages?.size) return 0;
  const cutoff = Date.now() - windowMs;
  let count = 0;
  for (const msg of messages.values()) {
    if (msg?.author?.bot) continue;
    const ts = msg?.createdTimestamp || 0;
    if (ts >= cutoff) count += 1;
  }
  return count;
}

async function hasMinimumChatActivity45m(client) {
  const channelId = getReminderChannelId(client);
  if (!channelId) return false;
  const count45m = await getRecentChannelMessageCount(client, channelId, CHAT_ACTIVITY_WINDOW_45M_MS);
  return count45m >= MIN_CHAT_MESSAGES_45M;
}

async function getActivityCounts(client) {
  const channelId = getReminderChannelId(client);
  if (!channelId) return { count30m: 0, count60m: 0 };
  const mem30 = getRecentReminderCount(channelId, 30 * 60 * 1000);
  const mem60 = getRecentReminderCount(channelId, 60 * 60 * 1000);
  const hist30 = await getRecentChannelMessageCount(client, channelId, 30 * 60 * 1000);
  const hist60 = await getRecentChannelMessageCount(client, channelId, 60 * 60 * 1000);
  return {
    count30m: Math.max(mem30, hist30),
    count60m: Math.max(mem60, hist60),
  };
}

async function canPostReminderNow(client, channelId) {
  const cid = String(channelId || "").trim();
  if (!cid) return false;
  const guildId = client.guilds?.cache?.first()?.id ?? null;
  if (guildId && (await isChatHubMinigameActive(guildId, cid))) return false;
  return waitForChatHubSlot(cid, CHAT_HUB_SOURCES.COFFEE, {
    crossBotGapMs: CHAT_HUB_CROSS_BOT_GAP_MS,
    sameBotGapMs: Math.max(DEFAULT_MIN_GAP_MS, getMinGapMs(client)),
    maxWaitMs: 8 * 60 * 1000,
    pollMs: 15_000,
  });
}

function deferScheduledReminder(client, scheduleId, kind) {
  if (!scheduleId) return;
  const nextAt = new Date(Date.now() + REMINDER_CHAT_DEFER_MS);
  void chatReminderScheduleUpdateOne(
    { scheduleId },
    { $set: { fireAt: nextAt, kind } },
  ).catch(() => { });
  const delay = Math.max(1, nextAt.getTime() - Date.now());
  const timeout = setTimeout(() => {
    scheduledTimeouts.delete(String(scheduleId));
    sendReminder(client, scheduleId, kind).catch(() => { });
  }, delay);
  timeout.unref?.();
  attachScheduleTimeout(scheduleId, timeout);
}

async function sendReminder(client, scheduleId, kind = "first") {
  clearScheduleTimeout(scheduleId);
  const hasActivity = await hasMinimumChatActivity45m(client);
  if (!hasActivity) {
    if (scheduleId)
      await chatReminderScheduleDeleteOne({ scheduleId }).catch(() => { });
    clearScheduleTimeout(scheduleId);
    return;
  }
  const nowMs = Date.now();
  const minGapMs = getMinGapMs(client);
  if (lastSentAt && nowMs - lastSentAt < minGapMs && scheduleId) {
    const nextAt = new Date(lastSentAt + minGapMs);
    await chatReminderScheduleUpdateOne(
      { scheduleId },
      { $set: { fireAt: nextAt, kind } },
    ).catch(() => { });
    const delay = Math.max(1, nextAt.getTime() - Date.now());
    const timeout = setTimeout(() => {
      scheduledTimeouts.delete(String(scheduleId));
      sendReminder(client, scheduleId, kind).catch(() => { });
    }, delay);
    timeout.unref?.();
    attachScheduleTimeout(scheduleId, timeout);
    return;
  }
  const { count30m: activityCount30m } = await getActivityCounts(client);
  if (kind === "second" && activityCount30m < getSecondThreshold(client)) {
    if (scheduleId)
      await chatReminderScheduleDeleteOne({ scheduleId }).catch(() => { });
    clearScheduleTimeout(scheduleId);
    return;
  }
  if (kind !== "second" && activityCount30m < getFirstThreshold(client)) {
    if (scheduleId)
      await chatReminderScheduleDeleteOne({ scheduleId }).catch(() => { });
    clearScheduleTimeout(scheduleId);
    return;
  }
  const channelId = getReminderChannelId(client);
  if (!channelId) return;
  const channel =
    client.channels.cache.get(channelId) ||
    (await client.channels.fetch(channelId).catch(() => null));
  if (!channel) return;
  const guildId = client.guilds?.cache?.first()?.id ?? null;
  const ready = await canPostReminderNow(client, channelId);
  if (!ready) {
    deferScheduledReminder(client, scheduleId, kind);
    return;
  }
  const parts = getRomeParts(new Date(), client);
  const embed = await nextReminderEmbed(parts, guildId);
  await channel.send({ embeds: [embed] }).catch(() => { });
  recordChatHubBotPost(channelId, CHAT_HUB_SOURCES.COFFEE);
  extendChatHubQuietForMs(channelId, 45_000);
  lastSentAt = Date.now();
  await saveRotationState();
  if (scheduleId) {
    await chatReminderScheduleDeleteOne({ scheduleId }).catch(() => { });
    clearScheduleTimeout(scheduleId);
  }
}

async function sendReminderAtFixedSlot(client, parts, slotKey) {
  const channelId = getReminderChannelId(client);
  if (!channelId) return;
  const hasActivity = await hasMinimumChatActivity45m(client);
  if (!hasActivity) return;
  const { count30m: activityCount30m } = await getActivityCounts(client);
  const minForSlot = Math.max(1, Number(getCfg(client)?.minMessagesForFixedSlot ?? 1));
  if (activityCount30m < minForSlot) return;
  const channel = await getClientChannelCached(client, channelId);
  if (!channel) return;
  const guildId = client.guilds?.cache?.first()?.id ?? null;
  const ready = await canPostReminderNow(client, channelId);
  if (!ready) return;
  const embed = await nextReminderEmbed(parts, guildId);
  await channel.send({ embeds: [embed] }).catch(() => { });
  recordChatHubBotPost(channelId, CHAT_HUB_SOURCES.COFFEE);
  extendChatHubQuietForMs(channelId, 45_000);
  lastSentAt = Date.now();
  lastReminderSlotKey = slotKey;
  await saveRotationState();
}

async function scheduleForHour(client, parts, guildId) {
  cleanupScheduledHourKeys();
  const key = getHourKey(parts);
  if (scheduledHours.has(key)) return;

  const totalSeconds = parts.minute * 60 + parts.second;
  const remainingMs = Math.max(1, (60 * 60 - totalSeconds) * 1000);
  const now = Date.now();
  const minGapMs = getMinGapMs(client);
  let baseLast = lastSentAt || 0;
  const latestScheduled = await chatReminderScheduleFindLatestFuture({
    guildId,
    now: new Date(),
  }).catch(() => null);
  if (latestScheduled?.fireAt) {
    baseLast = Math.max(baseLast, new Date(latestScheduled.fireAt).getTime());
  }
  const minStartDelay = baseLast ? Math.max(0, baseLast + minGapMs - now) : 0;
  if (minStartDelay >= remainingMs) return;
  const availableMs = Math.max(0, remainingMs - minStartDelay);
  const { count30m: activityCount30m } = await getActivityCounts(client);
  const allowFirst = activityCount30m >= getFirstThreshold(client);
  const allowSecond =
    activityCount30m >= getSecondThreshold(client) && availableMs > minGapMs;
  const delays = [];
  if (allowFirst) {
    const firstDelay = minStartDelay + rand(availableMs);
    delays.push(firstDelay);
  }
  if (allowSecond) {
    const baseDelay = delays.length ? delays[0] : minStartDelay;
    const secondMin = baseDelay + minGapMs;
    if (secondMin < remainingMs) {
      const secondDelay = rand(remainingMs - secondMin) + secondMin;
      delays.push(secondDelay);
    }
  }
  const fireTimes = delays
    .sort((a, b) => a - b)
    .map((delay, idx) => ({
      fireAt: new Date(Date.now() + delay),
      kind: idx === 0 ? "first" : "second",
    }));
  if (!fireTimes.length) return;
  scheduledHours.set(key, Date.now());
  persistReminderRuntimeNow();
  for (const item of fireTimes) {
    const fireAt = item.fireAt;
    const adjusted = baseLast
      ? Math.max(fireAt.getTime(), baseLast + minGapMs)
      : fireAt.getTime();
    baseLast = adjusted;
    const doc = await chatReminderScheduleCreate({
      guildId,
      fireAt,
      kind: item.kind,
    }).catch(() => null);
    if (!doc) continue;
    if (adjusted !== fireAt.getTime()) {
      await chatReminderScheduleUpdateOne(
        { scheduleId: doc.scheduleId },
        { $set: { fireAt: new Date(adjusted), kind: item.kind } },
      ).catch(() => { });
    }
    const timeout = setTimeout(() => {
      scheduledTimeouts.delete(String(doc.scheduleId));
      sendReminder(client, doc.scheduleId, item.kind).catch(() => { });
    }, Math.max(1, adjusted - Date.now()));
    timeout.unref?.();
    attachScheduleTimeout(doc.scheduleId, timeout);
  }
}

async function restoreSchedules(client) {
  const channelId = getReminderChannelId(client);
  if (!channelId) return;
  const now = new Date();
  const parts = getRomeParts(now, client);
  const key = getDateKey(parts);
  const guildId = client.guilds.cache.first()?.id || null;
  if (!guildId) return;
  await loadRotationState(guildId, key);
  const due = await chatReminderScheduleFindDueLean(now);
  for (const item of due) {
    await sendReminder(client, item.scheduleId, item.kind || "first").catch(() => { });
  }
  await chatReminderScheduleDeleteManyFuture(now).catch(() => { });
}

function startHourlyReminderLoop(client) {
  ensureReminderRuntimeLoaded();
  if (!getReminderChannelId(client)) return null;
  if (hourlyLoopHandle) return hourlyLoopHandle;
  const tick = async () => {
    cleanupScheduledHourKeys();
    const parts = getRomeParts(new Date(), client);
    const slotKey = `${getDateKey(parts)}_${parts.hour}_${parts.minute}`;
    const guildId = client.guilds.cache.first()?.id || null;

    if (!isReminderFixedSlot(parts, client)) return;
    if (slotKey === lastReminderSlotKey) return;
    if (!guildId) return;
    await loadRotationState(guildId, getDateKey(parts));
    await sendReminderAtFixedSlot(client, parts, slotKey);
  };
  const runTick = () => {
    void tick().catch((err) => {
      global.logger?.warn?.("[CHAT REMINDER] hourly tick failed:", err?.message || err);
    });
  };
  restoreSchedules(client).catch((err) => {
    global.logger?.warn?.("[CHAT REMINDER] restore schedules failed:", err?.message || err);
  });
  runTick();
  hourlyLoopHandle = setInterval(runTick, 60 * 1000);
  hourlyLoopHandle.unref?.();
  return hourlyLoopHandle;
}

function getChatReminderLoopStatus() {
  return {
    active: Boolean(hourlyLoopHandle),
    scheduledHours: Number(scheduledHours.size || 0),
    scheduledTimeouts: Number(scheduledTimeouts.size || 0),
    timezone: DEFAULT_TIME_ZONE,
  };
}

module.exports = { startHourlyReminderLoop, recordReminderActivity, getChatReminderLoopStatus };