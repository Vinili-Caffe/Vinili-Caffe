const cron = require("node-cron");
const { ThreadAutoArchiveDuration, ChannelType } = require("discord.js");
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

async function addCachedPartnerManagersToThread(thread, guild) {
  const pmId = String(IDs.roles?.PartnerManager || "").trim();
  if (!pmId || !thread?.members?.add) return;
  let role = guild.roles.cache.get(pmId);
  if (!role) {
    role = await guild.roles.fetch(pmId).catch(() => null);
  }
  if (!role) return;
  for (const member of role.members.values()) {
    await thread.members.add(member.id).catch(() => {});
  }
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

  let thread = await parent.threads
    .create({
      name,
      autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
      type: ChannelType.PrivateThread,
      invitable: false,
      reason: "Rotazione giornaliera comandi Partner Manager",
    })
    .catch((err) => {
      global.logger?.warn?.("[PARTNER PM THREAD] Thread privato non creato, fallback pubblico:", err?.message || err);
      return null;
    });
  if (!thread) {
    thread = await parent.threads
      .create({
        name,
        autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
        reason: "Rotazione giornaliera comandi Partner Manager",
      })
      .catch((err) => {
        global.logger?.error?.("[PARTNER PM THREAD] Creazione thread fallita:", err?.message || err);
        return null;
      });
  }
  if (!thread) return;

  await setPartnerPmDailyThreadId(thread.id);
  await addCachedPartnerManagersToThread(thread, guild);
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
  if (has && !had) {
    await thread.members.add(newMember.id).catch(() => {});
  } else if (had && !has) {
    await thread.members.remove(newMember.id).catch(() => {});
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
    rotatePartnerPmDailyThread(client).catch((err) =>
      global.logger?.warn?.("[PARTNER PM THREAD] Avvio immediato fallito:", err?.message || err),
    );
  });
  return task;
}

module.exports = {
  startPartnerPmDailyThreadLoop,
  rotatePartnerPmDailyThread,
  syncPartnerPmThreadForMemberChange,
};