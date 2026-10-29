const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const {
  addUserIdsToThread,
  collectHumanMemberIdsWithRolesOnGuild,
} = require("../../Utils/Discord/threadRoleMembers") as typeof import("../../Utils/Discord/threadRoleMembers");

const DEFAULT_CONFIG = {
  enabled: false,
  guildId: "1462458562507964584",
  channelId: "1526900797936242718",
  channelIds: ["1526900797936242718", "1528439672219500734"],
  mainGuildId: IDs.guilds?.main || "1329080093599076474",
  staffRoleIds: [IDs.roles?.HighStaff].filter(Boolean).map(String),
  threadName: "Prove richiesta",
  prompt: "Manda qui le prove",
  autoArchiveDuration: 10080,
};

function normalizeId(value?) {
  return String(value || "").trim();
}

function cfg(client?) {
  const raw =
    client?.config?.staffProofRequestThreads &&
    typeof client.config.staffProofRequestThreads === "object"
      ? client.config.staffProofRequestThreads
      : {};
  const merged = { ...DEFAULT_CONFIG, ...raw };
  const roleIds = Array.isArray(merged.staffRoleIds) ? merged.staffRoleIds : DEFAULT_CONFIG.staffRoleIds;
  merged.staffRoleIds = [...new Set(roleIds.map((id?) => String(id || "").trim()).filter(Boolean))];

  const fromList = Array.isArray(merged.channelIds) ? merged.channelIds : [];
  const single = normalizeId(merged.channelId);
  merged.channelIds = [
    ...new Set(
      [...fromList, single]
        .map((id?) => normalizeId(id))
        .filter((id?) => /^\d{16,22}$/.test(id)),
    ),
  ];
  return merged;
}

function isEnabledForMessage(message?, c?) {
  if (!c.enabled) return false;
  if (!message?.guild || !message?.author || message.author.bot) return false;
  if (message.system || message.webhookId || message.applicationId) return false;
  if (message.channel?.isThread?.()) return false;
  if (String(message.guild.id) !== normalizeId(c.guildId)) return false;
  const channelId = normalizeId(message.channelId || message.channel?.id || "");
  if (!c.channelIds.includes(channelId)) return false;
  return true;
}

async function resolveGuild(client?, guildId?) {
  const id = normalizeId(guildId);
  if (!id) return null;
  return client.guilds.cache.get(id) || (await client.guilds.fetch(id).catch(() => null));
}

async function ensureBotJoinedThread(thread?, guild?) {
  if (!thread?.members?.add || !guild) return;
  const me = String(guild.members?.me?.id || guild.client?.user?.id || "").trim();
  if (!me) return;
  await thread.members.add(me).catch(() => null);
}

async function handleStaffProofRequestMessage(message?) {
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
  let staffIds = [];
  if (mainGuild && c.staffRoleIds.length) {
    staffIds = await collectHumanMemberIdsWithRolesOnGuild(mainGuild, targetGuild, c.staffRoleIds, {
      logTag: "[STAFF PROOF THREAD]",
    });
  }

  let threadName = String(c.threadName || DEFAULT_CONFIG.threadName).trim() || DEFAULT_CONFIG.threadName;
  if (threadName.length > 100) threadName = threadName.slice(0, 100);

  const thread = await message
    .startThread({
      name: threadName,
      autoArchiveDuration: Number(c.autoArchiveDuration) || DEFAULT_CONFIG.autoArchiveDuration,
      reason: "Thread prove richiesta staff",
    })
    .catch((err?) => {
      global.logger?.warn?.("[STAFF PROOF THREAD] create failed:", message.id, err?.message || err);
      return null;
    });

  if (!thread?.isTextBased?.()) return Boolean(thread);

  await ensureBotJoinedThread(thread, targetGuild);

    const threadMemberIds = [...new Set([authorId, ...staffIds].filter((id?) => /^\d{16,22}$/.test(id)))];
  await addUserIdsToThread(thread, threadMemberIds, {
    logTag: "[STAFF PROOF THREAD]",
    throttleEvery: 6,
    throttleMs: 40,
  });

  const prompt = String(c.prompt || DEFAULT_CONFIG.prompt).trim() || DEFAULT_CONFIG.prompt;
  await thread
    .send({
      content: prompt,
      allowedMentions: { parse: [] },
    })
    .catch((err?) => {
      global.logger?.warn?.("[STAFF PROOF THREAD] prompt failed:", thread.id, err?.message || err);
    });

  return true;
}

export = {
  handleStaffProofRequestMessage,
};
