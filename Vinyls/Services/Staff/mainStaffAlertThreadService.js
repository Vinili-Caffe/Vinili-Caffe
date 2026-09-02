const IDs = require("../../Utils/Config/ids");
const {
  addUserIdsToThread,
  collectHumanMemberIdsWithRolesOnGuild,
} = require("../../Utils/Discord/threadRoleMembers");

const DEFAULT_CONFIG = {
  enabled: true,
  guildId: "1462458562507964584",
  channelId: "1526909652967751741",
  mainGuildId: IDs.guilds?.main || "1329080093599076474",
  staffRoleIds: [IDs.roles?.Helper, IDs.roles?.Mod].filter(Boolean).map(String),
  threadName: "Richiesta staff",
  autoArchiveDuration: 10080,
};

function cfg(client) {
  const raw =
    client?.config?.mainStaffAlertThreads &&
    typeof client.config.mainStaffAlertThreads === "object"
      ? client.config.mainStaffAlertThreads
      : {};
  const merged = { ...DEFAULT_CONFIG, ...raw };
  const roleIds = Array.isArray(merged.staffRoleIds) ? merged.staffRoleIds : DEFAULT_CONFIG.staffRoleIds;
  merged.staffRoleIds = [...new Set(roleIds.map((id) => String(id || "").trim()).filter(Boolean))];
  return merged;
}

function normalizeId(value) {
  return String(value || "").trim();
}

function isEnabledForMessage(message, c) {
  if (!c.enabled) return false;
  if (!message?.guild || !message?.author || message.author.bot) return false;
  if (message.system || message.webhookId || message.applicationId) return false;
  if (message.channel?.isThread?.()) return false;
  if (String(message.guild.id) !== normalizeId(c.guildId)) return false;
  if (String(message.channelId || message.channel?.id || "") !== normalizeId(c.channelId)) return false;
  return true;
}

async function resolveGuild(client, guildId) {
  const id = normalizeId(guildId);
  if (!id) return null;
  return client.guilds.cache.get(id) || (await client.guilds.fetch(id).catch(() => null));
}

async function ensureBotJoinedThread(thread, guild) {
  if (!thread?.members?.add || !guild) return;
  const me = String(guild.members?.me?.id || guild.client?.user?.id || "").trim();
  if (!me) return;
  await thread.members.add(me).catch(() => null);
}

async function handleMainStaffAlertThreadMessage(message) {
  const client = message?.client || message?.guild?.client;
  const c = cfg(client);
  if (!isEnabledForMessage(message, c)) return false;
  if (!message.startThread) return false;

  if (message.hasThread) {
    const existing = message.thread || (await message.fetch().catch(() => null))?.thread;
    if (existing?.isTextBased?.()) return true;
  }

  const authorId = normalizeId(message.author.id);
  if (!/^\d{16,22}$/.test(authorId)) return false;

  const targetGuild = message.guild;
  const mainGuild = await resolveGuild(client, c.mainGuildId);
  if (!mainGuild) {
    global.logger?.warn?.("[MAIN STAFF ALERT THREAD] main guild missing:", c.mainGuildId);
    return false;
  }

  const staffIds = await collectHumanMemberIdsWithRolesOnGuild(mainGuild, targetGuild, c.staffRoleIds, {
    logTag: "[MAIN STAFF ALERT THREAD]",
  });

  let threadName = String(c.threadName || DEFAULT_CONFIG.threadName).trim() || DEFAULT_CONFIG.threadName;
  if (threadName.length > 100) threadName = threadName.slice(0, 100);

  const thread = await message
    .startThread({
      name: threadName,
      autoArchiveDuration: Number(c.autoArchiveDuration) || DEFAULT_CONFIG.autoArchiveDuration,
      reason: "Thread alert staff Helper/Mod",
    })
    .catch((err) => {
      global.logger?.warn?.("[MAIN STAFF ALERT THREAD] create failed:", message.id, err?.message || err);
      return null;
    });

  if (!thread?.isTextBased?.()) return Boolean(thread);

  await ensureBotJoinedThread(thread, targetGuild);

    const threadMemberIds = [...new Set([authorId, ...staffIds].filter((id) => /^\d{16,22}$/.test(id)))];
  await addUserIdsToThread(thread, threadMemberIds, {
    logTag: "[MAIN STAFF ALERT THREAD]",
    throttleEvery: 6,
    throttleMs: 40,
  });

  return true;
}

module.exports = {
  handleMainStaffAlertThreadMessage,
};
