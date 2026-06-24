const { ThreadAutoArchiveDuration, ChannelType, MessageType } = require("discord.js");
const IDs = require("../../Utils/Config/ids");
const { getGuildChannelCached } = require("../../Utils/Interaction/interactionEntityCache");
const {
  getStaffChatThreadIds,
  setStaffChatThreadId,
  getStaffChatHubMessageId,
  setStaffChatHubMessageId,
} = require("../../Utils/Global/globalSettingsBucket");
const { addAllRoleMembersToThread, hydrateGuildMembersForRolePings } = require("../../Utils/Discord/threadRoleMembers");

const STAFF_CHAT_THREAD_SPECS = [
  {
    key: "pm",
    name: "Chat Partner Manager",
    roleIds: () => [IDs.roles?.PartnerManager].filter(Boolean).map(String),
    introLines: (mentions) => [
      `${mentions} **Chat Partner Manager**`,
      "Thread dedicato ai Partner Manager: coordinamento, aggiornamenti e comunicazione interna PM.",
    ],
  },
  {
    key: "senior",
    name: "Chat Senior Mod & Director",
    roleIds: () => [IDs.roles?.SeniorModerator, IDs.roles?.Director].filter(Boolean).map(String),
    introLines: (mentions) => [
      `${mentions} **Chat Senior Mod & Director**`,
      "Thread dedicato a Senior Moderator e Director.",
    ],
  },
  {
    key: "highStaff",
    name: "Chat High Staff",
    roleIds: () => [IDs.roles?.HighStaff].filter(Boolean).map(String),
    introLines: (mentions) => [
      `${mentions} **Chat High Staff**`,
      "Thread dedicato all'High Staff.",
    ],
  },
];

function alwaysAccessRoleIds() {
  return [IDs.roles?.Founder, IDs.roles?.Admin].filter(Boolean).map(String);
}

function specRoleIds(spec) {
  return [...new Set([...(spec.roleIds?.() || []), ...alwaysAccessRoleIds()])];
}

function memberHasAnyRole(member, roleIds) {
  if (!member?.roles?.cache || !roleIds?.length) return false;
  return roleIds.some((rid) => member.roles.cache.has(String(rid)));
}

function memberQualifiesForSpec(member, spec) {
  return memberHasAnyRole(member, specRoleIds(spec));
}

async function ensureStaffChatParentRoleOverwrite(parent, roleId) {
  if (!parent?.permissionOverwrites?.edit || !roleId) return;
  await parent.permissionOverwrites
    .edit(
      String(roleId),
      {
        ViewChannel: true,
        ReadMessageHistory: true,
        SendMessages: false,
        SendMessagesInThreads: true,
        AttachFiles: true,
        EmbedLinks: true,
        AddReactions: true,
        UseExternalEmojis: true,
      },
      { reason: "Accesso thread chat staff (solo thread, non canale padre)" },
    )
    .catch((err) => {
      global.logger?.warn?.("[STAFF CHAT THREAD] Overwrite ruolo fallito:", roleId, err?.message || err);
    });
}

async function ensureStaffChatParentRoleOverwrites(parent) {
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

async function deleteThreadOpeningMessage(thread) {
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

async function populateThreadMembers(thread, guild, spec, opts = {}) {
  const roleIds = specRoleIds(spec);
  const logTag = opts.logTag || "[STAFF CHAT THREAD]";
  if (opts.hydrate !== false) {
    await hydrateGuildMembersForRolePings(guild, logTag);
  }
  for (const roleId of roleIds) {
    await addAllRoleMembersToThread(thread, guild, roleId, { logTag, hydrate: false });
  }
}

async function sendThreadIntro(thread, spec) {
  const roleIds = spec.roleIds?.() || [];
  const mentions = roleIds.map((rid) => `<@&${rid}>`).join(" ");
  const content = spec.introLines(mentions).join("\n");
  await thread
    .send({
      content,
      allowedMentions: { roles: roleIds },
    })
    .catch((err) => {
      global.logger?.warn?.("[STAFF CHAT THREAD] Intro fallita:", spec.key, err?.message || err);
    });
}

async function deleteThreadIfAny(client, threadId) {
  const id = String(threadId || "").trim();
  if (!/^\d{16,22}$/.test(id)) return;
  const ch = client.channels?.cache?.get(id) || (await client.channels.fetch(id).catch(() => null));
  if (!ch?.isThread?.()) return;
  await ch.delete("Sostituzione thread chat staff").catch((err) => {
    global.logger?.warn?.("[STAFF CHAT THREAD] Eliminazione thread fallita:", id, err?.message || err);
  });
}

async function createStaffChatThread(parent, guild, spec) {
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
    .catch((err) => {
      global.logger?.error?.("[STAFF CHAT THREAD] Creazione fallita:", spec.key, err?.message || err);
      return null;
    });
  if (!thread) return null;
  await deleteThreadOpeningMessage(thread);
  await populateThreadMembers(thread, guild, spec);
  await sendThreadIntro(thread, spec);
  return thread;
}

async function ensureStaffChatThread(client, guild, parent, spec, savedId) {
  const parentId = String(parent.id);
  if (savedId) {
    const existing =
      client.channels?.cache?.get(savedId) || (await client.channels.fetch(savedId).catch(() => null));
    if (existing?.isThread?.() && String(existing.parentId || "") === parentId) {
      return existing;
    }
    await deleteThreadIfAny(client, savedId);
    await setStaffChatThreadId(spec.key, null);
  }
  const thread = await createStaffChatThread(parent, guild, spec);
  if (!thread) return null;
  await setStaffChatThreadId(spec.key, thread.id);
  return thread;
}

function buildHubMessageContent(threadIds) {
  const pm = threadIds.pm ? `<#${threadIds.pm}>` : "—";
  const senior = threadIds.senior ? `<#${threadIds.senior}>` : "—";
  const highStaff = threadIds.highStaff ? `<#${threadIds.highStaff}>` : "—";
  return (
    "<:VC_Staff:1494286904089247754> **Hub chat staff**\n\n" +
    "• **Chat generale** — questo canale, per tutto lo staff\n" +
    `• ${pm} — Partner Manager\n` +
    `• ${senior} — Senior Moderator e Director\n` +
    `• ${highStaff} — High Staff\n\n` +
    "_I thread sono privati: ogni livello ha il proprio spazio. PM, Senior/Director e High Staff vedono il canale ma scrivono solo nel proprio thread. Founder e Admin hanno accesso a tutti i thread._"
  );
}

async function ensureStaffChatHubMessage(parent, threadIds) {
  if (!parent?.send) return;
  const content = buildHubMessageContent(threadIds);
  const existingId = await getStaffChatHubMessageId();
  if (existingId) {
    const msg = await parent.messages.fetch(existingId).catch(() => null);
    if (msg?.editable) {
      await msg.edit({ content, allowedMentions: { parse: [] } }).catch(() => null);
      return;
    }
    await setStaffChatHubMessageId(null);
  }
  const sent = await parent.send({ content, allowedMentions: { parse: [] } }).catch((err) => {
    global.logger?.warn?.("[STAFF CHAT THREAD] Hub message fallito:", err?.message || err);
    return null;
  });
  if (!sent?.id) return;
  await setStaffChatHubMessageId(sent.id);
  await sent.pin().catch(() => null);
}

async function ensureStaffChatThreadsOnReady(client) {
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
  await ensureStaffChatHubMessage(parent, threadIds);
}

async function syncStaffChatThreadsForMemberChange(oldMember, newMember) {
  if (String(newMember.guild?.id || "") !== String(IDs.guilds?.main || "")) return;
  const client = newMember.client;
  const saved = await getStaffChatThreadIds();
  for (const spec of STAFF_CHAT_THREAD_SPECS) {
    const threadId = saved[spec.key];
    if (!threadId) continue;
    const thread =
      client.channels?.cache?.get(threadId) || (await client.channels.fetch(threadId).catch(() => null));
    if (!thread?.isThread?.() || !thread.members) continue;
    const had = memberQualifiesForSpec(oldMember, spec);
    const has = memberQualifiesForSpec(newMember, spec);
    if (had === has) continue;
    if (had && !has) {
      await thread.members.remove(newMember.id).catch(() => {});
      continue;
    }
    if (!had && has) {
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
}

function startStaffChatThreadsLoop(client) {
  setImmediate(() => {
    ensureStaffChatThreadsOnReady(client).catch((err) =>
      global.logger?.warn?.("[STAFF CHAT THREAD] Avvio immediato fallito:", err?.message || err),
    );
  });
}

module.exports = {
  STAFF_CHAT_THREAD_SPECS,
  startStaffChatThreadsLoop,
  ensureStaffChatThreadsOnReady,
  syncStaffChatThreadsForMemberChange,
  memberQualifiesForSpec,
};