const { ThreadAutoArchiveDuration, ChannelType, MessageType } = require("discord.js");
const IDs = require("../../Utils/Config/ids");
const { getGuildChannelCached } = require("../../Utils/Interaction/interactionEntityCache");
const {
  getStaffCmdsThreadIds,
  setStaffCmdsThreadId,
  getStaffCmdsHubMessageId,
  setStaffCmdsHubMessageId,
  getPartnerPmDailyThreadId,
  setPartnerPmDailyThreadId,
} = require("../../Utils/Global/globalSettingsBucket");
const { addUserIdsToThread, hydrateGuildMembersForRolePings, collectHumanMemberIdsWithRole } = require("../../Utils/Discord/threadRoleMembers");
const { setStaffCmdsThreadIdsCache } = require("../../Utils/Staff/staffCmdsChannelUtils");
const {
  resolveStaffThreadQualifyingRoleIds,
  memberHasStaffThreadAccess,
  memberQualifiesForStaffThreadSpec,
  alwaysAccessStaffThreadRoleIds,
} = require("../../Utils/Staff/staffThreadQualification");
const { getResocontoReviewerUserIdsForSegment } = require("../../Utils/Staff/resocontoAccess");

const STAFF_CMDS_THREAD_SPECS = [
  {
    key: "pm",
    name: "Comandi Partner Manager",
    roleIds: () => [IDs.roles?.PartnerManager].filter(Boolean).map(String),
        reviewerUserIds: () => getResocontoReviewerUserIdsForSegment("pm"),
    introLines: (mentions) => [
      `${mentions} **Comandi Partner Manager**`,
      "Partnership, classifica PM, blacklist, pannello profilo PM e comandi dedicati vanno usati solo qui.",
    ],
  },
  {
    key: "high",
    name: "Comandi High Staff",
    roleIds: () => [IDs.roles?.HighStaff].filter(Boolean).map(String),
    introLines: (mentions) => [
      `${mentions} **Comandi High Staff**`,
      "Comandi riservati all'High Staff (backup, security, moderazione avanzata, giveaway, ecc.).",
    ],
  },
];

function alwaysAccessRoleIds() {
  return alwaysAccessStaffThreadRoleIds();
}

function specRoleIds(spec) {
  return resolveStaffThreadQualifyingRoleIds(spec);
}

function memberQualifiesForSpec(member, spec) {
  return memberQualifiesForStaffThreadSpec(member, spec);
}

function buildStaffCmdsParentRoleOverwrite(roleId) {
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

async function ensureStaffCmdsParentRoleOverwrite(parent, roleId) {
  if (!parent?.permissionOverwrites?.edit || !roleId) return;
  await parent.permissionOverwrites
    .edit(
      String(roleId),
      buildStaffCmdsParentRoleOverwrite(roleId),
      { reason: "Accesso thread comandi staff (solo thread, non canale padre)" },
    )
    .catch((err) => {
      global.logger?.warn?.("[STAFF CMDS THREAD] Overwrite ruolo fallito:", roleId, err?.message || err);
    });
}

async function ensureStaffCmdsParentRoleOverwrites(parent) {
  const pmRole = String(IDs.roles?.PartnerManager || "").trim();
  const highRole = String(IDs.roles?.HighStaff || "").trim();
  if (pmRole) await ensureStaffCmdsParentRoleOverwrite(parent, pmRole);
  if (highRole) await ensureStaffCmdsParentRoleOverwrite(parent, highRole);
}

async function deleteThreadOpeningMessage(thread) {
  if (!thread?.id) return;
  try {
    if (typeof thread.fetchStarterMessage === "function") {
      const starter = await thread.fetchStarterMessage().catch(() => null);
      if (starter?.deletable) {
        await starter.delete("Rimozione messaggio apertura thread comandi staff").catch(() => {});
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
  const logTag = opts.logTag || "[STAFF CMDS THREAD]";
  if (thread?.members?.fetch) {
    await thread.members.fetch().catch(() => null);
  }
  if (opts.hydrate !== false) {
    await hydrateGuildMembersForRolePings(guild, logTag);
  }
  const totals = { added: 0, failed: 0, skipped: 0 };
  const allowedUserIds = new Set();
  for (const roleId of roleIds) {
    const memberIds = await collectHumanMemberIdsWithRole(guild, roleId, { logTag, hydrate: false });
    for (const userId of memberIds) {
      let member = guild.members.cache.get(userId) || null;
      if (!member && String(spec.key) === "high") {
        member = await guild.members.fetch(userId).catch(() => null);
      }
      if (member && !memberQualifiesForSpec(member, spec)) {
        totals.skipped += 1;
        continue;
      }
      allowedUserIds.add(String(userId));
    }
  }
  if (allowedUserIds.size) {
    const userStats = await addUserIdsToThread(thread, [...allowedUserIds], { logTag });
    totals.added += userStats.added;
    totals.failed += userStats.failed;
    totals.skipped += userStats.skipped;
  }
  const reviewerUserIds = spec.reviewerUserIds?.() || [];
  if (reviewerUserIds.length) {
    const userStats = await addUserIdsToThread(thread, reviewerUserIds, { logTag });
    totals.added += userStats.added;
    totals.failed += userStats.failed;
    totals.skipped += userStats.skipped;
  }
    try {
    const { pruneUnauthorizedStaffThreadMembers } = require("../../Utils/Staff/staffManagedThreadsGuard");
    await pruneUnauthorizedStaffThreadMembers(thread, {
      zone: "cmds",
      spec,
      memberQualifiesForSpec,
    }, null);
  } catch (_) {}
  return totals;
}

async function sendThreadIntro(thread, spec) {
  const roleIds = spec.roleIds?.() || [];
  const userIds = spec.reviewerUserIds?.() || [];
  const mentions = [
    ...roleIds.map((rid) => `<@&${rid}>`),
    ...userIds.map((uid) => `<@${uid}>`),
  ].join(" ");
  const content = spec.introLines(mentions).join("\n");
  await thread
    .send({
      content,
      allowedMentions: { roles: roleIds, users: userIds },
    })
    .catch((err) => {
      global.logger?.warn?.("[STAFF CMDS THREAD] Intro fallita:", spec.key, err?.message || err);
    });
}

async function deleteThreadIfAny(client, threadId) {
  const id = String(threadId || "").trim();
  if (!/^\d{16,22}$/.test(id)) return;
  const ch = client.channels?.cache?.get(id) || (await client.channels.fetch(id).catch(() => null));
  if (!ch?.isThread?.()) return;
  await ch.delete("Sostituzione thread comandi staff").catch((err) => {
    global.logger?.warn?.("[STAFF CMDS THREAD] Eliminazione thread fallita:", id, err?.message || err);
  });
}

async function createStaffCmdsThread(parent, guild, spec) {
  let name = String(spec.name || "Comandi staff").replace(/\s+/g, " ").trim();
  if (name.length > 100) name = name.slice(0, 100);
  const thread = await parent.threads
    .create({
      name,
      type: ChannelType.PrivateThread,
      autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
      invitable: false,
      reason: `Thread comandi staff — ${spec.name}`,
    })
    .catch((err) => {
      global.logger?.error?.("[STAFF CMDS THREAD] Creazione fallita:", spec.key, err?.message || err);
      return null;
    });
  if (!thread) return null;
  await deleteThreadOpeningMessage(thread);
  await populateThreadMembers(thread, guild, spec);
  await sendThreadIntro(thread, spec);
  return thread;
}

async function ensureStaffCmdsThread(client, guild, parent, spec, savedId) {
  const parentId = String(parent.id);
  if (savedId) {
    const existing =
      client.channels?.cache?.get(savedId) || (await client.channels.fetch(savedId).catch(() => null));
    if (existing?.isThread?.() && String(existing.parentId || "") === parentId) {
      return existing;
    }
    await deleteThreadIfAny(client, savedId);
    await setStaffCmdsThreadId(spec.key, null);
  }
  const thread = await createStaffCmdsThread(parent, guild, spec);
  if (!thread) return null;
  await setStaffCmdsThreadId(spec.key, thread.id);
  return thread;
}

async function retireStaffCmdsHubMessage(parent) {
  if (!parent?.messages?.fetch) return;
  const existingId = await getStaffCmdsHubMessageId();
  if (existingId) {
    const msg = await parent.messages.fetch(existingId).catch(() => null);
    if (msg?.deletable) await msg.delete().catch(() => null);
    else if (msg?.pinned) await msg.unpin().catch(() => null);
    await setStaffCmdsHubMessageId(null);
  }
  const recent = await parent.messages.fetch({ limit: 25 }).catch(() => null);
  if (!recent?.size) return;
  for (const message of recent.values()) {
    if (Number(message.type) === MessageType.ChannelPinnedMessage) {
      await message.delete().catch(() => null);
    }
  }
}

async function ensureStaffCmdsThreadsOnReady(client) {
  const guildId = String(IDs.guilds?.main || "");
  const parentId = String(IDs.channels?.staffCmds || "").trim();
  if (!guildId || !parentId) {
    global.logger?.warn?.("[STAFF CMDS THREAD] Manca main guild o staffCmds in ids.");
    return;
  }
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return;
  const parent = guild.channels.cache.get(parentId) || (await getGuildChannelCached(guild, parentId));
  if (!parent?.threads?.create) {
    global.logger?.warn?.("[STAFF CMDS THREAD] Canale non valido per thread:", parentId);
    return;
  }
  await ensureStaffCmdsParentRoleOverwrites(parent);
  const saved = await getStaffCmdsThreadIds();
  setStaffCmdsThreadIdsCache(saved);
  const threadIds = { ...saved };
  for (const spec of STAFF_CMDS_THREAD_SPECS) {
    const thread = await ensureStaffCmdsThread(client, guild, parent, spec, saved[spec.key]);
    if (thread?.id) threadIds[spec.key] = String(thread.id);
  }
  setStaffCmdsThreadIdsCache(threadIds);
  await hydrateGuildMembersForRolePings(guild, "[STAFF CMDS THREAD]");
  for (const spec of STAFF_CMDS_THREAD_SPECS) {
    const threadId = threadIds[spec.key];
    if (!threadId) continue;
    const thread =
      client.channels?.cache?.get(threadId) || (await client.channels.fetch(threadId).catch(() => null));
    if (thread?.isThread?.()) {
      const stats = await populateThreadMembers(thread, guild, spec, { hydrate: false });
      if (spec.key === "pm" && stats && (stats.added > 0 || stats.failed > 0)) {
        global.logger?.info?.(
          `[STAFF CMDS THREAD] PM sync membri: added=${stats.added} failed=${stats.failed} skipped=${stats.skipped}`,
        );
      }
    }
  }
  await retireStaffCmdsHubMessage(parent);
  await retireLegacyPartnerPmCommandsThread(client);
}

async function retireLegacyPartnerPmCommandsThread(client) {
  const legacyId = await getPartnerPmDailyThreadId();
  if (!legacyId) return;
  await deleteThreadIfAny(client, legacyId);
  await setPartnerPmDailyThreadId(null);
}

async function syncStaffCmdsThreadsForMemberChange(oldMember, newMember) {
  if (String(newMember.guild?.id || "") !== String(IDs.guilds?.main || "")) return;
  const client = newMember.client;
  const saved = await getStaffCmdsThreadIds();
  setStaffCmdsThreadIdsCache(saved);
  for (const spec of STAFF_CMDS_THREAD_SPECS) {
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
    const parentId = String(IDs.channels?.staffCmds || "").trim();
    const parent =
      newMember.guild.channels.cache.get(parentId) ||
      (await getGuildChannelCached(newMember.guild, parentId).catch(() => null));
    if (parent) {
      for (const roleId of spec.roleIds?.() || []) {
        await ensureStaffCmdsParentRoleOverwrite(parent, roleId);
      }
    }
    await thread.members.add(newMember.id).catch(() => {});
  }
}

function startStaffCmdsThreadsLoop(client) {
  setImmediate(() => {
    getStaffCmdsThreadIds()
      .then((ids) => setStaffCmdsThreadIdsCache(ids))
      .catch(() => null);
    ensureStaffCmdsThreadsOnReady(client).catch((err) =>
      global.logger?.warn?.("[STAFF CMDS THREAD] Avvio immediato fallito:", err?.message || err),
    );
  });
}

module.exports = {
  STAFF_CMDS_THREAD_SPECS,
  startStaffCmdsThreadsLoop,
  ensureStaffCmdsThreadsOnReady,
  syncStaffCmdsThreadsForMemberChange,
  memberQualifiesForSpec,
};