const { ThreadAutoArchiveDuration, ChannelType, MessageType } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { getGuildChannelCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const {
  getStaffChatThreadIds,
  setStaffChatThreadId,
  getStaffChatHubMessageId,
  setStaffChatHubMessageId,
} = require("../../Utils/Global/globalSettingsBucket") as typeof import("../../Utils/Global/globalSettingsBucket");
const { addUserIdsToThread, hydrateGuildMembersForRolePings, collectHumanMemberIdsWithRole } = require("../../Utils/Discord/threadRoleMembers") as typeof import("../../Utils/Discord/threadRoleMembers");
const {
  resolveStaffThreadQualifyingRoleIds,
  memberHasStaffThreadAccess,
  memberQualifiesForStaffThreadSpec,
} = require("../../Staff/utils/staffThreadQualification") as typeof import("../../Staff/utils/staffThreadQualification");
const { getResocontoReviewerUserIdsForSegment } = require("../../Staff/utils/resocontoAccess") as typeof import("../../Staff/utils/resocontoAccess");
const { resolveExistingStaffThread } = require("../../Staff/utils/staffManagedThreadResolve") as typeof import("../../Staff/utils/staffManagedThreadResolve");

let ensureChatThreadsPromise = null;

const STAFF_CHAT_THREAD_SPECS = [
  {
    key: "pm",
    name: "Chat Partner Manager",
    roleIds: () => [IDs.roles?.PartnerManager].filter(Boolean).map(String),
        reviewerUserIds: () => getResocontoReviewerUserIdsForSegment("pm"),
    introLines: (mentions?) => [
      `${mentions} **Chat Partner Manager**`,
      "Thread dedicato ai Partner Manager: coordinamento, aggiornamenti e comunicazione interna PM.",
    ],
  },
  /* bloggerChat1: come la chat PM, per i Blogger */
  {
    key: "blogger",
    name: "Chat Blogger",
    roleIds: () => [IDs.roles?.Blogger].filter(Boolean).map(String),
    introLines: (mentions?) => [
      `${mentions} **Chat Blogger**`,
      "Thread dedicato ai Blogger: coordinamento, idee per gli articoli e comunicazione interna.",
    ],
  },
  {
    key: "senior",
    name: "Chat Senior Mod & Director",
    roleIds: () => [IDs.roles?.SeniorModerator, IDs.roles?.Director].filter(Boolean).map(String),
    introLines: (mentions?) => [
      `${mentions} **Chat Senior Mod & Director**`,
      "Thread dedicato a Senior Moderator e Director.",
    ],
  },
  {
    key: "highStaff",
    name: "Chat High Staff",
    roleIds: () => [IDs.roles?.HighStaff].filter(Boolean).map(String),
    introLines: (mentions?) => [
      `${mentions} **Chat High Staff**`,
      "Thread dedicato all'High Staff.",
    ],
  },
];

function specRoleIds(spec?) {
  return resolveStaffThreadQualifyingRoleIds(spec);
}

function memberQualifiesForSpec(member?, spec?) {
  return memberQualifiesForStaffThreadSpec(member, spec);
}

function buildStaffChatParentRoleOverwrite(roleId?) {
  return {
    ViewChannel: true,
    ReadMessageHistory: true,
    SendMessages: false,
    SendMessagesInThreads: true,
    AttachFiles: true,
    EmbedLinks: true,
    AddReactions: true,
    UseExternalEmojis: true,
  };
}

async function ensureStaffChatParentRoleOverwrite(parent?, roleId?) {
  if (!parent?.permissionOverwrites?.edit || !roleId) return;
  await parent.permissionOverwrites
    .edit(
      String(roleId),
      buildStaffChatParentRoleOverwrite(roleId),
      { reason: "Accesso thread chat staff (solo thread, non canale padre)" },
    )
    .catch((err?) => {
      global.logger?.warn?.("[STAFF CHAT THREAD] Overwrite ruolo fallito:", roleId, err?.message || err);
    });
}

async function ensureStaffChatParentRoleOverwrites(parent?) {
  const roleIds = new Set();
  for (const spec of STAFF_CHAT_THREAD_SPECS) {
    for (const roleId of spec.roleIds?.() || []) {
      if (roleId) roleIds.add(String(roleId));
    }
  }
  for (const roleId of roleIds) {
    await ensureStaffChatParentRoleOverwrite(parent, roleId);
  }
}

async function deleteThreadOpeningMessage(thread?) {
  if (!thread?.id) return;
  try {
    if (typeof thread.fetchStarterMessage === "function") {
      const starter = await thread.fetchStarterMessage().catch(() => null);
      if (starter?.deletable) {
        await starter.delete("Rimozione messaggio apertura thread chat staff").catch(() => {});
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

async function populateThreadMembers(thread?, guild?, spec?, opts: Record<string, any> = {}) {
  const roleIds = specRoleIds(spec);
  const logTag = opts.logTag || "[STAFF CHAT THREAD]";
  if (thread?.members?.fetch) {
    await thread.members.fetch().catch(() => null);
  }
  if (opts.hydrate !== false) {
    await hydrateGuildMembersForRolePings(guild, logTag);
  }
  const allowedUserIds = new Set();
  for (const roleId of roleIds) {
    const memberIds = await collectHumanMemberIdsWithRole(guild, roleId, { logTag, hydrate: false });
    for (const userId of memberIds) {
      let member = guild.members.cache.get(userId) || null;
      if (!member && String(spec.key) === "highStaff") {
        member = await guild.members.fetch(userId).catch(() => null);
      }
      if (member && !memberQualifiesForSpec(member, spec)) continue;
      allowedUserIds.add(String(userId));
    }
  }
  if (allowedUserIds.size) {
    await addUserIdsToThread(thread, [...allowedUserIds], { logTag });
  }
  const reviewerUserIds = spec.reviewerUserIds?.() || [];
  if (reviewerUserIds.length) {
    await addUserIdsToThread(thread, reviewerUserIds, { logTag });
  }
  try {
    const { pruneUnauthorizedStaffThreadMembers } = require("../../Staff/utils/staffManagedThreadsGuard") as typeof import("../../Staff/utils/staffManagedThreadsGuard");
    await pruneUnauthorizedStaffThreadMembers(
      thread,
      { zone: "chat", spec, memberQualifiesForSpec },
      null,
    );
  } catch (_) {}
}

async function sendThreadIntro(thread?, spec?) {
  const roleIds = spec.roleIds?.() || [];
  const userIds = spec.reviewerUserIds?.() || [];
  const mentions = [
    ...roleIds.map((rid?) => `<@&${rid}>`),
    ...userIds.map((uid?) => `<@${uid}>`),
  ].join(" ");
  const content = spec.introLines(mentions).join("\n");
  await thread
    .send({
      content,
      allowedMentions: { roles: roleIds, users: userIds },
    })
    .catch((err?) => {
      global.logger?.warn?.("[STAFF CHAT THREAD] Intro fallita:", spec.key, err?.message || err);
    });
}

async function createStaffChatThread(parent?, guild?, spec?) {
  let name = String(spec.name || "Chat staff").replace(/\s+/g, " ").trim();
  if (name.length > 100) name = name.slice(0, 100);
  const thread = await parent.threads
    .create({
      name,
      type: ChannelType.PrivateThread,
      autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
      invitable: false,
      reason: `Thread chat staff — ${spec.name}`,
    })
    .catch((err?) => {
      global.logger?.error?.("[STAFF CHAT THREAD] Creazione fallita:", spec.key, err?.message || err);
      return null;
    });
  if (!thread) return null;
  await deleteThreadOpeningMessage(thread);
  await populateThreadMembers(thread, guild, spec);
  await sendThreadIntro(thread, spec);
  return thread;
}

async function ensureStaffChatThread(client?, guild?, parent?, spec?, savedId?) {
  const logTag = "[STAFF CHAT THREAD]";
  const existing = await resolveExistingStaffThread(client, parent, spec.name, savedId, logTag);
  if (existing) {
    if (String(existing.id) !== String(savedId || "")) {
      await setStaffChatThreadId(spec.key, existing.id);
    }
    return existing;
  }

  const thread = await createStaffChatThread(parent, guild, spec);
  if (!thread) return null;
  await setStaffChatThreadId(spec.key, thread.id);
  return thread;
}

async function retireStaffChatHubMessage(parent?) {
  if (!parent?.messages?.fetch) return;
  const existingId = await getStaffChatHubMessageId();
  if (existingId) {
    const msg = await parent.messages.fetch(existingId).catch(() => null);
    if (msg?.deletable) await msg.delete().catch(() => null);
    else if (msg?.pinned) await msg.unpin().catch(() => null);
    await setStaffChatHubMessageId(null);
  }
  const recent = await parent.messages.fetch({ limit: 25 }).catch(() => null);
  if (!recent?.size) return;
  for (const message of recent.values()) {
    if (Number(message.type) === MessageType.ChannelPinnedMessage) {
      await message.delete().catch(() => null);
    }
  }
}

async function ensureStaffChatThreadsOnReadyImpl(client?) {
  const guildId = String(IDs.guilds?.main || "");
  const parentId = String(IDs.channels?.staffChat || "").trim();
  if (!guildId || !parentId) {
    global.logger?.warn?.("[STAFF CHAT THREAD] Manca main guild o staffChat in ids.");
    return;
  }
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return;
  const parent = guild.channels.cache.get(parentId) || (await getGuildChannelCached(guild, parentId));
  if (!parent?.threads?.create) {
    global.logger?.warn?.("[STAFF CHAT THREAD] Canale non valido per thread:", parentId);
    return;
  }
  await ensureStaffChatParentRoleOverwrites(parent);
  const saved = await getStaffChatThreadIds();
  const threadIds = { ...saved };
  for (const spec of STAFF_CHAT_THREAD_SPECS) {
    const thread = await ensureStaffChatThread(client, guild, parent, spec, saved[spec.key]);
    if (thread?.id) threadIds[spec.key] = String(thread.id);
  }
  await hydrateGuildMembersForRolePings(guild, "[STAFF CHAT THREAD]");
  for (const spec of STAFF_CHAT_THREAD_SPECS) {
    const threadId = threadIds[spec.key];
    if (!threadId) continue;
    const thread =
      client.channels?.cache?.get(threadId) || (await client.channels.fetch(threadId).catch(() => null));
    if (thread?.isThread?.()) {
      await populateThreadMembers(thread, guild, spec, { hydrate: false });
    }
  }
  await retireStaffChatHubMessage(parent);
}

function ensureStaffChatThreadsOnReady(client?) {
  if (ensureChatThreadsPromise) return ensureChatThreadsPromise;
  ensureChatThreadsPromise = ensureStaffChatThreadsOnReadyImpl(client).finally(() => {
    ensureChatThreadsPromise = null;
  });
  return ensureChatThreadsPromise;
}

async function syncStaffChatThreadsForMemberChange(oldMember?, newMember?) {
  if (String(newMember.guild?.id || "") !== String(IDs.guilds?.main || "")) return;
  const client = newMember.client;
  const saved = await getStaffChatThreadIds();
  for (const spec of STAFF_CHAT_THREAD_SPECS) {
    const threadId = saved[spec.key];
    if (!threadId) continue;
    const thread =
      client.channels?.cache?.get(threadId) || (await client.channels.fetch(threadId).catch(() => null));
    if (!thread?.isThread?.() || !thread.members) continue;
    const had = memberHasStaffThreadAccess(oldMember, spec);
    const has = memberHasStaffThreadAccess(newMember, spec);
    if (had === has) continue;
    if (had === true && has === false) {
      await thread.members.remove(newMember.id).catch(() => {});
      continue;
    }
    if (has !== true) continue;
    const parentId = String(IDs.channels?.staffChat || "").trim();
    const parent =
      newMember.guild.channels.cache.get(parentId) ||
      (await getGuildChannelCached(newMember.guild, parentId).catch(() => null));
    if (parent) {
      for (const roleId of spec.roleIds?.() || []) {
        await ensureStaffChatParentRoleOverwrite(parent, roleId);
      }
    }
    await thread.members.add(newMember.id).catch(() => {});
  }
}

function startStaffChatThreadsLoop(client?) {
  setImmediate(() => {
    ensureStaffChatThreadsOnReady(client).catch((err?) =>
      global.logger?.warn?.("[STAFF CHAT THREAD] Avvio immediato fallito:", err?.message || err),
    );
  });
}

export = {
  STAFF_CHAT_THREAD_SPECS,
  startStaffChatThreadsLoop,
  syncStaffChatThreadsForMemberChange,
  memberQualifiesForSpec,
};