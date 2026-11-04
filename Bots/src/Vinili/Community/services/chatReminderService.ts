const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { randomInt } = require("crypto") as typeof import("crypto");
const path = require("path") as typeof import("path");
const { readSnapshotWithMeta, writeSnapshotWithMeta } = require("../../../shared/recovery/snapshotStore") as typeof import("../../../shared/recovery/snapshotStore");
const { registerShutdownFlush, armShutdownCheckpoint } = require("../../../shared/recovery/shutdownCheckpoint") as typeof import("../../../shared/recovery/shutdownCheckpoint");
const { chatReminderRotationFindOneLean, chatReminderRotationFindOneAndUpdate, chatReminderScheduleUpdateOne, chatReminderScheduleDeleteOne, chatReminderScheduleFindDueLean, chatReminderScheduleDeleteManyFuture } = require("../../../shared/botState/domainStatesStore") as typeof import("../../../shared/botState/domainStatesStore");
const { getClientChannelCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { siteTicketsPageDiscordRef } = require("../../../shared/web/siteTicketsPageRef") as typeof import("../../../shared/web/siteTicketsPageRef");
const { isChatHubMinigameActive } = require("../../../shared/discord/chatHubMinigameGate") as typeof import("../../../shared/discord/chatHubMinigameGate");
const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const {
  CHAT_HUB_SOURCES,
  CHAT_HUB_KINDS,
  DEFAULT_CROSS_BOT_GAP_MS,
  DEFAULT_SAME_BOT_GAP_MS,
  DEFAULT_AFTER_MINIGAME_GAP_MS,
  recordChatHubBotPost,
  extendChatHubQuietForMs,
  claimChatHubSlot,
} = require("../../../shared/discord/chatHubBotPacing") as typeof import("../../../shared/discord/chatHubBotPacing");
const CHAT_HUB_CROSS_BOT_GAP_MS = Math.max(
  3 * 60 * 1000,
  Number(process.env.VC_CHAT_HUB_CROSS_BOT_GAP_MS || DEFAULT_CROSS_BOT_GAP_MS),
);
const CHAT_HUB_SAME_BOT_GAP_MS = Math.max(
  60_000,
  Number(process.env.VC_CHAT_HUB_SAME_BOT_GAP_MS || DEFAULT_SAME_BOT_GAP_MS),
);
const CHAT_HUB_AFTER_MINIGAME_MS = Math.max(
  90_000,
  Number(process.env.VC_CHAT_HUB_AFTER_MINIGAME_MS || DEFAULT_AFTER_MINIGAME_GAP_MS),
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
    key: "vinyls_chat_reminder_runtime",
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
    key: "vinyls_chat_reminder_runtime",
    version: 1,
    fallback: { scheduledHours: {} },
  });
  for (const [k, v] of Object.entries(raw?.scheduledHours || {})) {
    const at = Number(v || 0);
    if (!k || !Number.isFinite(at) || at <= 0) continue;
    scheduledHours.set(String(k), at);
  }
  armShutdownCheckpoint();
  registerShutdownFlush("vinyls_chat_reminder_runtime", () => persistReminderRuntimeNow());
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

function attachScheduleTimeout(scheduleId?, timeout?) {
  if (!scheduleId) return;
  const id = String(scheduleId);
  const existing = scheduledTimeouts.get(id);
  if (existing) clearTimeout(existing);
  scheduledTimeouts.set(id, timeout);
}

function clearScheduleTimeout(scheduleId?) {
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
      .setTitle(`${E.VC_Vote} Vota ogni giorno!`)
      .setDescription(
        [
          `${E.VC_EXP} Con il tuo primo voto otterrai **250 EXP** mentre le volte successive un boost di EXP che ti aiuteranno a scalare la classifica settimanale! Grazie per il tuo sostegno!`,
          `${E.VC_Link} Vota [qui](https://www.viniliecaffe.it/vote) ogni giorno!`,
        ].join("\n"),
      ),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle(`${E.VC_bump} La tua opinione è importante!`)
      .setDescription([
        `${E.VC_LevelUp2} Lascia una recensione e aiuta Vinili & Caffè a migliorare costantemente. Con la tua recensione potrai riscattare **5 livelli** come ringraziamento.`,
        `${E.VC_Link} Lascia la tua recensione [qui](https://viniliecaffe.it/recensioni)`,
      ].join("\n")),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle(`${E.VC_PepeFoto} Sblocca subito i PicPerms!`)
      .setDescription([
        `${E.VC_Link} Stanco di non poter inviare immagini in <#1442569130573303898>? Inserisci “.gg/viniliecaffe” o “viniliecaffe.it” nel tuo stato, boosta il server o raggiungi <@&1544830753815134320> per sbloccare velocemente il permesso!`,
        `> ${E.VC_Arrow} Scopri tutte le ricompense di boost & livelli [sul nostro sito](https://viniliecaffe.it/perks)`,
      ].join("\n")),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle(`${E.VC_Color} Sblocca i colori gradienti esclusivi!`)
      .setDescription([
        `${E.VC_Vip} Ottieni i colori PLUS con i ruoli <@&1329497467481493607> o <@&1544830759741825145> e ricorda: con <@&1544830866616754257> puoi crearne uno personalizzato! Per impostare il tuo colore usa la pagina [Personalizza](https://www.viniliecaffe.it/personalizza/) del nostro sito.`,
      ].join("\n")),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle(`${E.VC_EXP} Personalizza il tuo profilo del server!`)
      .setDescription([
        `${E.VC_Color} Apri la pagina [Personalizza](https://www.viniliecaffe.it/personalizza/) del nostro sito e imposta il tuo compleanno. Non dimenticare di attivare i reminder del nostro bot per accumulare EXP extra!`,
        "",
        `${E.VC_Boost} Alcuni colori si sbloccano con livelli o boost: rendi il tuo profilo davvero personale!`,
      ].join("\n")),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle(`${E.VC_WingYellow} Più di 90 ruoli a tua disposizione!`)
      .setDescription([
        `${E.VC_uaskelly} Colori, giochi, ping, hobby e molto altro! [Personalizza](https://www.viniliecaffe.it/personalizza/) il tuo profilo ottenendo i giusti ruoli per connetterti con la community!`,
      ].join("\n")),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle(`${E.VC_BestStaff} Il gaming approda su Vinili & Caffè!`)
      .setDescription([
        "🎮 Vocali e testuali appositamente realizzate per giocare insieme. [Personalizza](https://www.viniliecaffe.it/personalizza/) il tuo profilo e indica i giochi che usi di più e divertiti in compagnia!",
      ].join("\n")),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle(`${E.VC_Link} Aggiungi un posto a tavola che c’è un amico in più!`)
      .setDescription([
        `${E.VC_FlowerPink} In gruppo il divertimento raddoppia! Invitando i tuoi amici su Vinili & Caffè per contribuire alla realizzazione di una community sempre più unita e animata aumentando anche i tuoi punti EXP con l’attività che ne deriverebbe!`,
        "",
        `${E.VC_Beer} Basta condividere il link del server o quello nelle info!`,
      ].join("\n")),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle(`${E.VC_HeartsBlue} Vieni in vocale con noi!`)
      .setDescription([
        `${E.VC_Flowers} Oltre alla chat, unisciti ai **canali vocali** per musica, giochi e chiacchiere live. La voce ci rende una vera famiglia!`,
        "",
        `${E.VC_Mute} Se non puoi parlare utilizza il nostro bot! La compagnia alla portata di tutti.`,
      ].join("\n")),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle(`${E.VC_Announce} Resta sempre aggiornato!`)
      .setDescription([
        `${E.VC_Eye} Eventi, novità e annunci? Li trovi nei canali del server! Rimani sintonizzato su <#1442569115972669541>!`,
        "",
        `${E.VC_Flowers} Informazioni su livelli e premi sono disponibili su [sul nostro sito](https://viniliecaffe.it/perks)!`,
      ].join("\n")),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle(`${E.VC_Events} TOP WEEKLY!`)
      .setDescription([
        `${E.VC_HelloKittyGift} Alle 21:00 di ogni domenica scopri l’utente più attivo del server su <#1470183921236049940>! Sfida gli altri e scala la classifica della settimana per vincere e avere vantaggi settimanali!`,
      ].join("\n")),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle(`${E.VC_Collab} Vuoi sponsorizzare il tuo server o social network?`)
      .setDescription([
        `${E.VC_ThankYou} Cerchi visibilità per il tuo progetto? Vinili & Caffè offre sponsorizzazioni studiati per aiutarti. Apri un \` + siteTicketsPageDiscordRef(`HIGH STAFF") + " per avere più info!",
        `${E.VC_Ticket} Trovi tutte le info sulle sponsorizzazioni [sul nostro sito](https://viniliecaffe.it/sponsor).`,
      ].join("\n")),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle(`${E.VC_ThankYou} Hai bisogno di supporto?`)
      .setDescription([
        `${E.VC_Ticket} Che sia una partnership, un supporto per le nostre feautures o una richiesta di sponsor, recati [sul nostro sito](https://viniliecaffe.it/ticket) e apri un ticket. Saremo pronti ad aiutarti!`,
      ].join("\n")),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("🎞️ Il cinema su Discord come non lo hai mai visto!")
      .setDescription([
        "🍿 Guardare un film è sempre bello ma farlo insieme lo è ancora di più! [Attiva le notifiche](https://discord.gg/s4eatFC5ke?event=1497535662445039646) delle nostre serate cinema. Prendi posto, scalda i popcorn e togli dal frigo una bella bibita fresca: il film sta per iniziare!",
      ].join("\n")),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle(`${E.VC_Collab} Vinili & Caffè ha bisogno di te!`)
      .setDescription([
        `${E.VC_Mod} Se Vinili & Caffè ti piace da morire e vuoi aiutare la crescita della mostra community attivamente, il ruolo da Staffer è quello che fa per te. Candidati [sul nostro sito](https://viniliecaffe.it/candidature/) per la posizione che preferisci!`,
        `${E.VC_Boost} Paghiamo i Partner Manager e ringraziamo il miglior staffer del mese con Nitro Boost! Che aspetti?`,
      ].join("\n")),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle(`${E.VC_Collab} Un bot stabile e sicuro per la gestione del tuo server!`)
      .setDescription([
        `${E.VC_Mention} Se gestire i Partner Manager, contare le partnership e controllare ping o requisiti delle tue collaborazioni ti stanca, è il momento giusto di aggiungere <@1329118940110127204> al tuo server! Fare partnership non è mai stato così facile!`,
        `${E.VC_MilkExclaim} Per supporto alla configurazione, non esitare ad aprire un ticket \` + siteTicketsPageDiscordRef(`SUPPORTO") + "!"
      ].join("\n")),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle(`${E.VC_Events} Giveaway per tutti!`)
      .setDescription([
        `${E.VC_Wallet} Partecipa ai nostri giveaway! Li trovi in <#1442569115972669541> e sono aperti a tutti. Non perdere le prossime estrazioni!`,
      ].join("\n")),
];

function getDateKey(parts?) {
  const y = parts.year;
  const m = String(parts.month).padStart(2, "0");
  const d = String(parts.day).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getCfg(client?) {
  return client?.config?.chatReminder || {};
}

function getReminderChannelId(client?) {
  const channelId = getCfg(client)?.channelId || IDs.channels?.chat;
  return channelId || null;
}

function getTimeZone(client?) {
  return getCfg(client)?.timeZone || DEFAULT_TIME_ZONE;
}

function getStartHour(client?) {
  return Number.isFinite(Number(getCfg(client)?.startHour))
    ? Number(getCfg(client)?.startHour)
    : DEFAULT_START_HOUR;
}

function getEndHour(client?) {
  return Number.isFinite(Number(getCfg(client)?.endHour))
    ? Number(getCfg(client)?.endHour)
    : DEFAULT_END_HOUR;
}

function getMinGapMs(client?) {
  return Math.max(
    60 * 1000,
    Number(getCfg(client)?.minGapMs || DEFAULT_MIN_GAP_MS),
  );
}

function getFirstThreshold(client?) {
  return Math.max(1, Number(getCfg(client)?.firstReminderMinMessages30m || 5));
}

function getSecondThreshold(client?) {
  return Math.max(
    1,
    Number(getCfg(client)?.secondReminderMinMessages30m || 20),
  );
}

async function saveRotationState() {
  if (!rotationGuildId || !rotationDate) return;
  await (chatReminderRotationFindOneAndUpdate as any)(
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

function shuffleArray(arr?) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildShuffledQueueAvoiding(avoidCommaKey?) {
  const base = reminderPool.map((_?, idx?) => idx);
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

async function loadRotationState(guildId?, dateKey?) {
  rotationGuildId = guildId;
  const doc = await chatReminderRotationFindOneLean({ guildId }).catch(() => null);
  const normDate = dateKey ? String(dateKey) : "";
  if (doc && normDate && String(doc.dateKey || "") === normDate && Array.isArray(doc.queue)) {
    const filtered = doc.queue.filter((i?) => Number.isInteger(i) && i >= 0 && i < reminderPool.length);
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

async function nextReminderEmbed(parts?, guildId?) {
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

function getRomeParts(date?, client?) {
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
  const map: Record<string, any> = {};
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

function isReminderFixedSlot(parts?, client?) {
  const { hour, minute } = parts;
  const start = getStartHour(client);
  const end = getEndHour(client);
  if (hour < start || hour > end) return false;
  const totalMins = hour * 60 + minute;
  const startMins = start * 60 + 1;
  if (totalMins < startMins) return false;
  return (totalMins - startMins) % REMINDER_FIXED_INTERVAL_MINUTES === 0;
}

function recordReminderActivity(channelId?) {
  if (!channelId) return;
  const now = Date.now();
  const list = reminderActivity.get(channelId) || [];
  list.push(now);
  const cutoff = now - 60 * 60 * 1000;
  const trimmed = list.filter((ts?) => ts >= cutoff);
  reminderActivity.set(channelId, trimmed);
}

function getRecentReminderCount(channelId?, windowMs = 60 * 60 * 1000) {
  if (!channelId) return 0;
  const now = Date.now();
  const list = reminderActivity.get(channelId) || [];
  const cutoff = now - windowMs;
  const trimmed = list.filter((ts?) => ts >= cutoff);
  reminderActivity.set(channelId, trimmed);
  return trimmed.length;
}

async function getRecentChannelMessageCount(client?, channelId?, windowMs = 60 * 60 * 1000) {
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

async function hasMinimumChatActivity45m(client?) {
  const channelId = getReminderChannelId(client);
  if (!channelId) return false;
  const count45m = await getRecentChannelMessageCount(client, channelId, CHAT_ACTIVITY_WINDOW_45M_MS);
  return count45m >= MIN_CHAT_MESSAGES_45M;
}

async function getActivityCounts(client?) {
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

async function canPostReminderNow(client?, channelId?) {
  const cid = String(channelId || "").trim();
  if (!cid) return false;
  const guildId = client.guilds?.cache?.first()?.id ?? null;
  if (guildId && (await isChatHubMinigameActive(guildId, cid))) return false;
  return claimChatHubSlot(cid, {
    kind: CHAT_HUB_KINDS.REMINDER,
    source: CHAT_HUB_SOURCES.VINILI,
    crossBotGapMs: CHAT_HUB_CROSS_BOT_GAP_MS,
    sameBotGapMs: CHAT_HUB_SAME_BOT_GAP_MS,
    kindGapMs: Math.max(DEFAULT_MIN_GAP_MS, getMinGapMs(client)),
    afterKindGaps: { [CHAT_HUB_KINDS.MINIGAME]: CHAT_HUB_AFTER_MINIGAME_MS },
    maxWaitMs: 8 * 60 * 1000,
    pollMs: 15_000,
  });
}

function deferScheduledReminder(client?, scheduleId?, kind?) {
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

async function sendReminder(client?, scheduleId?, kind = "first") {
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
  recordChatHubBotPost(channelId, CHAT_HUB_SOURCES.VINILI, CHAT_HUB_KINDS.REMINDER);
  extendChatHubQuietForMs(channelId, 45_000);
  lastSentAt = Date.now();
  await saveRotationState();
  if (scheduleId) {
    await chatReminderScheduleDeleteOne({ scheduleId }).catch(() => { });
    clearScheduleTimeout(scheduleId);
  }
}

async function sendReminderAtFixedSlot(client?, parts?, slotKey?) {
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
  recordChatHubBotPost(channelId, CHAT_HUB_SOURCES.VINILI, CHAT_HUB_KINDS.REMINDER);
  extendChatHubQuietForMs(channelId, 45_000);
  lastSentAt = Date.now();
  lastReminderSlotKey = slotKey;
  await saveRotationState();
}

async function restoreSchedules(client?) {
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

function startHourlyReminderLoop(client?) {
  const { shouldStartExternalWorkerLoop } = require("../../../shared/runtime/externalWorkerGate") as typeof import("../../../shared/runtime/externalWorkerGate");
  if (!shouldStartExternalWorkerLoop("BOT_SCHEDULER")) return null;
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
    void tick().catch((err?) => {
      global.logger?.warn?.("[CHAT REMINDER] hourly tick failed:", err?.message || err);
    });
  };
  restoreSchedules(client).catch((err?) => {
    global.logger?.warn?.("[CHAT REMINDER] restore schedules failed:", err?.message || err);
  });
  runTick();
  hourlyLoopHandle = setInterval(runTick, 60 * 1000);
  hourlyLoopHandle.unref?.();
  return hourlyLoopHandle;
}

export = { startHourlyReminderLoop, recordReminderActivity };