const cron = require("node-cron") as typeof import("node-cron");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { ActivityUserProfile } = require("../schemas/communitySchemas") as typeof import("../schemas/communitySchemas");
const { listBirthdayDue, markBirthdayCelebratedByIds } = require("./profileStore") as typeof import("./profileStore");
const { applyAgeBracketRoleFromBirthday } = require("../utils/ageBracketRoles") as typeof import("../utils/ageBracketRoles");
const { getGuildMemberCached, getGuildChannelCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { shouldStartExternalWorkerLoop } = require("../../../shared/runtime/externalWorkerGate") as typeof import("../../../shared/runtime/externalWorkerGate");
const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const DEFAULT_TIME_ZONE = "Europe/Rome";
const BIRTHDAY_ROLE_ID = String(IDs?.roles?.birthdayFlair || "").trim();
const BIRTHDAY_REACTIONS = [E.VC_Events, E.VC_HelloKittyGift,];
let birthdayCronMain = null;
let birthdayCronBackup = null;
let birthdayTickRunning = false;

function getRomeDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: DEFAULT_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", });
  const parts = formatter.formatToParts(date);
  const map: Record<string, any> = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
  };
}

function inferBirthYearFromAge(day?, month?, age?, now = new Date()) {
  const safeAge = Math.max(1, Number(age || 0));
  const today = getRomeDateParts(now);
  const birthdayAlreadyPassed = today.month > month || (today.month === month && today.day >= day);
  const birthYear = today.year - safeAge - (birthdayAlreadyPassed ? 0 : 1);
  return Math.max(1900, birthYear);
}

function joinMentionsNicely(mentions?) {
  if (!mentions.length) return "";
  if (mentions.length === 1) return mentions[0];
  if (mentions.length === 2) return `${mentions[0]} e ${mentions[1]}`;
  return `${mentions.slice(0, -1).join(", ")} e ${mentions[mentions.length - 1]}`;
}

const BIRTHDAY_PERSONALIZZA_URL = "https://www.viniliecaffe.it/personalizza/";
const BIRTHDAY_CTA =
  `${E.VC_Arrow} Vuoi festeggiare anche tu? Aggiungi il compleanno su ${BIRTHDAY_PERSONALIZZA_URL} — il giorno del tuo compleanno ricevi un **multi EXP ×2** per tutta la giornata.`;

function buildBirthdayAnnouncement(docs?, currentYear?) {
  const mentions = docs.map((doc?) => `<@${doc.userId}>`);
  const who = joinMentionsNicely(mentions);
  const intro = `${E.creation} Oggi è il compleanno di ${who}.`;

  const visibleAges = docs
    .filter((doc?) => doc.showAge && Number.isFinite(Number(doc.birthYear)))
    .map((doc?) => Math.max(1, currentYear - Number(doc.birthYear)));

  let body = "";
  if (!visibleAges.length) {
    body = `${intro}\n${E.VC_Events} Fate gli auguri!`;
  } else if (visibleAges.length === 1) {
    body = `${intro}\n${E.VC_Events} Oggi compie **${visibleAges[0]}** anni. Tantissimi auguri — e un **×2 EXP** per oggi.`;
  } else {
    body = `${intro}\n${E.VC_Events} Oggi compiono **${visibleAges.join(", ")}** anni. Tantissimi auguri — multi **×2 EXP** per tutta la giornata.`;
  }
  return `${body}\n\n${BIRTHDAY_CTA}`;
}

function isMemberGoneError(err?) {
  if (!err) return false;
  const code = err.code ?? err.status;
  if (code === 10007 || code === 10013) return true;
  const msg = (err.message || String(err)).toLowerCase();
  return /unknown (member|user)|(member|user) (not )?found/i.test(msg);
}

async function assignBirthdayRole(guild?, userId?) {
  if (!guild || !userId || !BIRTHDAY_ROLE_ID) return;
  const member = guild.members.cache.get(userId) || (await getGuildMemberCached(guild, userId));
  if (!member) return;
  if (member.roles.cache.has(BIRTHDAY_ROLE_ID)) return;
  let addErr = null;
  await member.roles.add(BIRTHDAY_ROLE_ID).catch((e?) => { addErr = e; });
  if (addErr && isMemberGoneError(addErr)) return;
  const refreshedMember = await getGuildMemberCached(guild, userId, { preferFresh: true });
  if (!refreshedMember?.roles?.cache?.has(BIRTHDAY_ROLE_ID)) {
    global.logger?.warn?.("[BIRTHDAY] role assign failed:", guild.id, userId, BIRTHDAY_ROLE_ID, addErr?.message || addErr);
  }
}

async function stripBirthdayFlairRoleFromGuild(guild?) {
  if (!guild || !BIRTHDAY_ROLE_ID) return;
  let role = guild.roles.cache.get(BIRTHDAY_ROLE_ID);
  if (!role) role = await guild.roles.fetch(BIRTHDAY_ROLE_ID).catch(() => null);
  if (!role) return;
  const reason = "Compleanno: fine giornata";
  for (const member of role.members.values()) {
    await member.roles.remove(BIRTHDAY_ROLE_ID, reason).catch(() => {});
  }
}

async function stripBirthdayFlairRoleFromAllGuilds(client?) {
  if (!client?.guilds?.cache?.size) return;
  for (const guild of client.guilds.cache.values()) {
    await stripBirthdayFlairRoleFromGuild(guild).catch(() => {});
  }
}

async function deliverBirthdayAnnouncementsForGuild(guild?, guildDocs?, today?) {
  const channelId = IDs.channels.chat || null;
  let channel =
    (channelId ? (guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId))) : null) || null;
  if (!channel?.isTextBased?.()) {
    channel =
      guild.channels.cache.find(
        (c?) => c?.isTextBased?.() && /chat|chatting/i.test(c.name),
      ) || null;
  }
  if (!channel?.isTextBased?.()) {
    global.logger?.warn?.(
      "[BIRTHDAY] Nessun canale testuale per annuncio (config chat=",
      channelId || "—",
      ", fallback nome chat/chatting). Guild:",
      guild.id,
      "Utenti:",
      guildDocs.map((d?) => d.userId).join(","),
    );
    return;
  }

  const content = buildBirthdayAnnouncement(guildDocs, today.year);
  let sendErr = null;
  const sent = await channel.send({ content }).catch((e?) => {
    sendErr = e;
    return null;
  });
  if (!sent) {
    global.logger?.error?.(
      "[BIRTHDAY] Invio messaggio fallito:",
      guild.id,
      "canale",
      channel.id,
      sendErr?.message || sendErr || "(sconosciuto)",
      "— non marco lastCelebratedYear (retry al prossimo tick).",
    );
    return;
  }

  for (const reaction of BIRTHDAY_REACTIONS) {
    await sent.react(reaction).catch(() => {});
  }

  for (const doc of guildDocs) {
    const uid = String(doc.userId || "");
    const b = doc?.profile?.birthday || doc;
    await assignBirthdayRole(guild, uid);
    await applyAgeBracketRoleFromBirthday(
      guild,
      uid,
      Number(b.day),
      Number(b.month),
      Number(b.birthYear),
    ).catch(() => {});
  }

  const ids = guildDocs.map((doc?) => String(doc._id)).filter(Boolean);
  if (ids.length) {
    await markBirthdayCelebratedByIds(ids, today.year).catch(() => {});
  }
}

/**
 * Accetta (client, guildId, userId) oppure (guild, userId, client?) — fix legacy call invertita.
 */
async function tryCelebrateBirthdayAfterProfileSave(arg1?, arg2?, arg3?) {
  let client = null;
  let guildId = "";
  let userId = "";
  let guildHint = null;
  if (arg1 && (arg1.guilds?.cache || typeof arg1.guilds?.fetch === "function")) {
    client = arg1;
    guildId = String(arg2 || "").trim();
    userId = String(arg3 || "").trim();
  } else if (arg1?.id && (arg1.members || arg1.client)) {
    guildHint = arg1;
    client = arg1.client || arg3 || null;
    guildId = String(arg1.id || "").trim();
    userId = String(arg2 || "").trim();
  }
  if (!client || !guildId || !userId) return;

  const today = getRomeDateParts(new Date());
  const doc = await ActivityUserProfile.findOne({ guildId: String(guildId), userId: String(userId) })
    .select("_id guildId userId profile.birthday")
    .lean()
    .catch(() => null);
  if (!doc?._id) return;
  const b = doc.profile?.birthday;
  if (!b) return;
  if (Number(b.day) !== today.day || Number(b.month) !== today.month) return;
  if (Number(b.lastCelebratedYear) === today.year) return;

  const guild =
    guildHint ||
    client.guilds.cache.get(String(guildId)) ||
    (await client.guilds.fetch(String(guildId)).catch(() => null));
  if (!guild) return;

  const guildDocs = [{ _id: doc._id, guildId: doc.guildId, userId: doc.userId, ...b }];
  await deliverBirthdayAnnouncementsForGuild(guild, guildDocs, today);
}

/** True se giorno/mese non si possono più cambiare (annuncio già uscito quest'anno o ruolo flair attivo). */
async function isBirthdayDayChangeLocked(guild?, userId?, currentBirthday?) {
  const today = getRomeDateParts(new Date());
  const celebratedThisYear = Number(currentBirthday?.lastCelebratedYear) === today.year;
  if (celebratedThisYear) return true;
  if (!guild || !userId || !BIRTHDAY_ROLE_ID) return false;
  const member =
    guild.members?.cache?.get?.(String(userId)) ||
    (await getGuildMemberCached(guild, String(userId)).catch(() => null));
  return Boolean(member?.roles?.cache?.has?.(BIRTHDAY_ROLE_ID));
}

async function runBirthdayTick(client?, opts: Record<string, any> = {}) {
  if (!client || birthdayTickRunning) return;
  birthdayTickRunning = true;
  try {
    if (opts.stripFlairFirst) {
      await stripBirthdayFlairRoleFromAllGuilds(client).catch((e?) =>
        global.logger?.warn?.("[BIRTHDAY] strip flair failed:", e?.message || e),
      );
    }

    const today = getRomeDateParts(new Date());
    const docs = await listBirthdayDue(today.day, today.month, today.year);

    if (!docs.length) return;

    const byGuild = new Map();
    for (const doc of docs) {
      const guildKey = String(doc.guildId || "");
      if (!guildKey) continue;
      const list = byGuild.get(guildKey) || [];
      list.push(doc);
      byGuild.set(guildKey, list);
    }

    for (const [guildId, guildDocs] of byGuild.entries()) {
      const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
      if (!guild) {
        global.logger?.warn?.(
          "[BIRTHDAY] Guild non in cache:",
          guildId,
          "— salto",
          guildDocs.length,
          "compleanni.",
        );
        continue;
      }

      await deliverBirthdayAnnouncementsForGuild(guild, guildDocs, today);
    }
  } catch (error) {
    global.logger?.error?.("[BIRTHDAY] Tick failed:", error);
  } finally {
    birthdayTickRunning = false;
  }
}

function startBirthdayLoop(client?) {
  if (!shouldStartExternalWorkerLoop("COMMUNITY_POLL")) return null;
  if (!client || birthdayCronMain) return birthdayCronMain;
  birthdayCronMain = cron.schedule(
    "0 0 * * *",
    () => {
      void runBirthdayTick(client, { stripFlairFirst: true }).catch((error?) =>
        global.logger?.error?.("[BIRTHDAY] Scheduled tick failed:", error),
      );
    },
    { timezone: DEFAULT_TIME_ZONE },
  );

  birthdayCronBackup = cron.schedule(
    "15 0 * * *",
    () => {
      void runBirthdayTick(client, { stripFlairFirst: false }).catch((error?) =>
        global.logger?.error?.("[BIRTHDAY] Backup tick (00:15) failed:", error),
      );
    },
    { timezone: DEFAULT_TIME_ZONE },
  );

  global.logger?.info?.("[BIRTHDAY] cron Europe/Rome 00:00+00:15");

  setImmediate(() => {
    runBirthdayTick(client, { stripFlairFirst: false }).catch((err?) =>
      global.logger?.warn?.("[BIRTHDAY] Recovery tick on start failed:", err?.message || err),
    );
  });

  return birthdayCronMain;
}

export = {
  startBirthdayLoop,
  getRomeDateParts,
  inferBirthYearFromAge,
  tryCelebrateBirthdayAfterProfileSave,
  isBirthdayDayChangeLocked,
};