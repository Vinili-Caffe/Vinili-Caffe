const cron = require("node-cron");
const { ThreadAutoArchiveDuration, ChannelType, MessageType } = require("discord.js");
const IDs = require("../../Utils/Config/ids");
const { getGuildChannelCached } = require("../../Utils/Interaction/interactionEntityCache");
const { getPartnerPmDailyThreadId, setPartnerPmDailyThreadId } = require("../../Utils/Global/globalSettingsBucket");

const TIME_ZONE = "Europe/Rome";
let task = null;

function formatDateTitleRome(d = new Date()) {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

async function deleteThreadOpeningMessage(thread) {
  if (!thread?.id) return;
  try {
    if (typeof thread.fetchStarterMessage === "function") {
      const starter = await thread.fetchStarterMessage().catch(() => null);
      if (starter?.deletable) {
        await starter.delete("Rimozione messaggio apertura thread comandi PM").catch(() => {});
        return;
      }
    }
  } catch (_) {}
  const batch = await thread.messages.fetch({ limit: 5 }).catch(() => null);
  if (!batch?.size) return;
  for (const m of batch.values()) {
    const t = Number(m.type);
    if (t === MessageType.ThreadCreated || t === MessageType.ThreadStarterMessage) {
      await m.delete().catch(() => {});
      return;
    }
  }
}

async function notifyPartnerManagersInNewThread(thread, guild) {
  const pmRoleId = String(IDs.roles?.PartnerManager || "").trim();
  if (!pmRoleId || !thread?.members) return;

  await deleteThreadOpeningMessage(thread);

  const role =
    guild.roles.cache.get(pmRoleId) || (await guild.roles.fetch(pmRoleId).catch(() => null));
  if (role?.members?.size) {
    for (const m of role.members.values()) {
      if (m.user?.bot) continue;
      await thread.members.add(m.id).catch(() => {});
    }
  }

  const line =
    `<@&${pmRoleId}> **Nuovo thread comandi PM** (${formatDateTitleRome(new Date())}).\n` +
    "Usate questo thread per i comandi / interazioni PM della giornata.";
  await thread
    .send({
      content: line,
      allowedMentions: { roles: [pmRoleId] },
    })
    .catch((err) => {
      global.logger?.warn?.("[PARTNER PM THREAD] Ping PM fallito:", err?.message || err);
    });
}

async function deleteThreadIfAny(client, threadId) {
  const id = String(threadId || "").trim();
  if (!/^\d{16,22}$/.test(id)) return;
  const ch = client.channels?.cache?.get(id) || (await client.channels.fetch(id).catch(() => null));
  if (!ch?.isThread?.()) return;
  await ch.delete("Rotazione giornaliera thread comandi PM").catch((err) => {
    global.logger?.warn?.("[PARTNER PM THREAD] Eliminazione thread precedente fallita:", id, err?.message || err);
  });
}

/**
 * All’avvio del bot: non ruotare se il thread salvato esiste ancora sotto #partnersChat.
 * La rotazione (delete + create) resta solo al cron di mezzanotte.
 */
async function ensurePartnerPmDailyThreadOnReady(client) {
  const guildId = String(IDs.guilds?.main || "");
  const parentId = String(IDs.channels?.partnersChat || "").trim();
  if (!guildId || !parentId) {
    global.logger?.warn?.("[PARTNER PM THREAD] Manca main guild o partnersChat in ids.");
    return;
  }
  const previousId = await getPartnerPmDailyThreadId();
  if (!previousId) {
    await rotatePartnerPmDailyThread(client);
    return;
  }
  const ch =
    client.channels?.cache?.get(previousId) || (await client.channels.fetch(previousId).catch(() => null));
  if (ch?.isThread?.() && String(ch.parentId || "") === parentId) {
    return;
  }
  await rotatePartnerPmDailyThread(client);
}

async function rotatePartnerPmDailyThread(client) {
  const guildId = String(IDs.guilds?.main || "");
  const parentId = String(IDs.channels?.partnersChat || "").trim();
  if (!guildId || !parentId) {
    global.logger?.warn?.("[PARTNER PM THREAD] Manca main guild o partnersChat in ids.");
    return;
  }
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return;

  const parent = guild.channels.cache.get(parentId) || (await getGuildChannelCached(guild, parentId));
  if (!parent?.threads?.create) {
    global.logger?.warn?.("[PARTNER PM THREAD] Canale non valido per thread:", parentId);
    return;
  }

  const previousId = await getPartnerPmDailyThreadId();
  await deleteThreadIfAny(client, previousId);
  await setPartnerPmDailyThreadId(null);

  const dateLabel = formatDateTitleRome(new Date());
  let name = `Comandi PM · ${dateLabel}`.replace(/\s+/g, " ").trim();
  if (name.length > 100) name = name.slice(0, 100);

  const thread = await parent.threads
    .create({
      name,
      type: ChannelType.PublicThread,
      autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
      invitable: false,
      reason: "Rotazione giornaliera comandi Partner Manager",
    })
    .catch((err) => {
      global.logger?.error?.("[PARTNER PM THREAD] Creazione thread pubblico fallita:", err?.message || err);
      return null;
    });
  if (!thread) return;

  await setPartnerPmDailyThreadId(thread.id);
  await notifyPartnerManagersInNewThread(thread, guild);
}

async function syncPartnerPmThreadForMemberChange(oldMember, newMember) {
  if (String(newMember.guild?.id || "") !== String(IDs.guilds?.main || "")) return;
  const pmId = String(IDs.roles?.PartnerManager || "").trim();
  if (!pmId) return;
  const had = Boolean(oldMember?.roles?.cache?.has(pmId));
  const has = Boolean(newMember?.roles?.cache?.has(pmId));
  if (had === has) return;
  const threadId = await getPartnerPmDailyThreadId();
  if (!threadId) return;
  const client = newMember.client;
  const thread =
    client.channels?.cache?.get(threadId) || (await client.channels.fetch(threadId).catch(() => null));
  if (!thread?.isThread?.() || !thread.members) return;
  if (had && !has) {
    await thread.members.remove(newMember.id).catch(() => {});
    return;
  }
  if (!had && has) {
    await thread.members.add(newMember.id).catch(() => {});
  }
}

function startPartnerPmDailyThreadLoop(client) {
  if (task) return task;
  task = cron.schedule(
    "0 0 * * *",
    async () => {
      try {
        await rotatePartnerPmDailyThread(client);
      } catch (err) {
        global.logger?.error?.("[PARTNER PM THREAD] Tick fallito:", err);
      }
    },
    { timezone: TIME_ZONE },
  );
  setImmediate(() => {
    ensurePartnerPmDailyThreadOnReady(client).catch((err) =>
      global.logger?.warn?.("[PARTNER PM THREAD] Avvio immediato fallito:", err?.message || err),
    );
  });
  return task;
}

module.exports = {
  startPartnerPmDailyThreadLoop,
  rotatePartnerPmDailyThread,
  ensurePartnerPmDailyThreadOnReady,
  syncPartnerPmThreadForMemberChange,
};