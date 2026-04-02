const IDs = require("../Config/ids");
const { getClientGuildCached, getGuildChannelCached, getClientChannelCached } = require("../Interaction/interactionEntityCache");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const STAFF_LIST_MARKER = "staff list";
const STAFF_LIST_PM_SUBHEADER = "· Partner Manager";
const STAFF_LIST_PM_HEADER = `## STAFF LIST ${STAFF_LIST_PM_SUBHEADER}\n\n`;
const STAFF_LIST_HASH_SPLIT = "\n---STAFF_LIST_SPLIT---\n";
const STAFF_NEW_EMOJI = "<:VC_New:1471891729471770819>";
const STAFF_NEW_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const ROLE_UP = { [String(IDs.roles.Member || "")]: String(IDs.roles.Helper), [String(IDs.roles.Helper)]: String(IDs.roles.Mod), [String(IDs.roles.Mod)]: String(IDs.roles.Coordinator), [String(IDs.roles.Coordinator)]: String(IDs.roles.Supervisor) };
const ROLE_EMOJIS = {
  [IDs.roles.PartnerManager]: { emoji: "<:VC_partnermanager:1479442411037003897>" },
  [IDs.roles.Helper]: { emoji: "<:VC_Helper:1479442372994666607>" },
  [IDs.roles.Mod]: { emoji: "<:VC_mod:1479442444939690117>" },
  [IDs.roles.Coordinator]: { emoji: "<:VC_coordinator:1479442481308373032>" },
  [IDs.roles.Supervisor]: { emoji: "<:VC_supervisor:1479442514430656532>" },
  [IDs.roles.Admin]: { emoji: "<:VC_admin:1479442544831103109>" },
  [IDs.roles.Manager]: { emoji: "<:VC_manager:1479442578217767053>" },
  [IDs.roles.CoFounder]: { emoji: "<:VC_cofounder:1479442609112879276>" },
  [IDs.roles.Founder]: { emoji: "<:VC_founder:1479442642671632557>" },
};
const ROLE_EXCLUSIONS = { [IDs.roles.PartnerManager]: ["1442568907801100419"], };
const STAFF_ROLE_IDS = Object.keys(ROLE_EMOJIS);

function wait(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

function ensureState(client) {
  if (!client._staffListState) {
    client._staffListState = {
      messageIdsByGuild: new Map(),
      contentHashByGuild: new Map(),
      timersByGuild: new Map(),
    };
  }
  return client._staffListState;
}

function iterMembers(membersSource) {
  if (!membersSource) return [];
  if (typeof membersSource.values === "function") return membersSource.values();
  if (Array.isArray(membersSource)) return membersSource.values();
  return [];
}

function memberHasStaffRole(member) {
  return STAFF_ROLE_IDS.some((roleId) => member?.roles?.cache?.has?.(roleId));
}

function didStaffMembershipChange(oldMember, newMember) {
  return memberHasStaffRole(oldMember) !== memberHasStaffRole(newMember);
}

function didStaffRolesChange(oldMember, newMember) {
  const oldStaffIds = new Set(STAFF_ROLE_IDS.filter((id) => oldMember?.roles?.cache?.has?.(id)));
  const newStaffIds = new Set(STAFF_ROLE_IDS.filter((id) => newMember?.roles?.cache?.has?.(id)));
  if (oldStaffIds.size !== newStaffIds.size) return true;
  for (const id of oldStaffIds) if (!newStaffIds.has(id)) return true;
  for (const id of newStaffIds) if (!oldStaffIds.has(id)) return true;
  return false;
}

function isPexEntry(row) {
  const oldRole = String(row?.oldRole || "");
  const newRole = String(row?.newRole || "");
  const isPromotion = oldRole && newRole && ROLE_UP[oldRole] === newRole;
  const reasonHasPex = String(row?.reason || "").toLowerCase().includes("pex");
  const isPartnerManagerPex = newRole === String(IDs.roles.PartnerManager || "");
  const hadStaffRoleBefore = oldRole && STAFF_ROLE_IDS.includes(oldRole);
  const partnerManagerPexCountsAsNew = isPartnerManagerPex && !hadStaffRoleBefore;
  return isPromotion || reasonHasPex || partnerManagerPexCountsAsNew;
}

async function getStaffPexedLast7Days(guildId) {
  const since = new Date(Date.now() - STAFF_NEW_DAYS_MS);
  const docs = await ActivityUserProfile.find(
    { guildId: String(guildId), staff: { $exists: true } },
    { userId: 1, "staff.rolesHistory": 1 },
  )
    .lean()
    .catch(() => []);
  const out = new Set();
  for (const doc of docs || []) {
    const history = Array.isArray(doc?.staff?.rolesHistory) ? doc.staff.rolesHistory : [];
    const pexedInWindow = history.some((row) => {
      const when = row?.date ? new Date(row.date) : null;
      if (!when || Number.isNaN(when.getTime())) return false;
      if (when.getTime() < since.getTime()) return false;
      return isPexEntry(row);
    });
    if (pexedInWindow && doc?.userId) out.add(String(doc.userId));
  }
  return out;
}

function buildRoleSection(roleId, guild, membersSource, pexedLast7Days) {
  const role = guild.roles.cache.get(roleId);
  if (!role) return "";
  const excludedMembers = new Set(ROLE_EXCLUSIONS[roleId] || []);
  const filteredMembers = [];
  for (const member of iterMembers(membersSource)) {
    if (!member?.roles?.cache?.has?.(roleId)) continue;
    if (excludedMembers.has(member.id)) continue;
    filteredMembers.push(member);
  }
  const memberCount = filteredMembers.length;
  const { emoji } = ROLE_EMOJIS[roleId];
  const membersList = filteredMembers
    .map((member) => {
      const newBadge = pexedLast7Days.has(member.id) ? ` ${STAFF_NEW_EMOJI}` : "";
      return `<:VC_Dot:1482532364222595303> <@${member.id}>${newBadge}`;
    })
    .join("\n") || "<:VC_Dot:1482532364222595303>";
  return `${emoji} **<@&${roleId}>︲\`${memberCount}\`**\n\n${membersList}\n\n`;
}

function buildStaffListParts(guild, membersSource = guild.members.cache, pexedLast7Days = new Set()) {
  const staffRoleIds = STAFF_ROLE_IDS.slice().reverse();
  const pmRoleId = String(IDs.roles.PartnerManager || "");
  let main = "## STAFF LIST\n\n";
  let pm = "";
  for (const roleId of staffRoleIds) {
    const section = buildRoleSection(roleId, guild, membersSource, pexedLast7Days);
    if (!section) continue;
    if (String(roleId) === pmRoleId) {
      pm = STAFF_LIST_PM_HEADER + section;
    } else {
      main += section;
    }
  }
  if (!pm) {
    pm = `${STAFF_LIST_PM_HEADER}<:VC_Dot:1482532364222595303>`;
  }
  return { main, pm };
}

async function fetchChannelMessage(channel, messageId) {
  if (!messageId) return null;
  return channel.messages.cache.get(messageId) || (await channel.messages.fetch(messageId).catch(() => null));
}

async function resolveStaffListMessages(channel, client, guildId) {
  const state = ensureState(client);
  const known = state.messageIdsByGuild.get(guildId);
  if (Array.isArray(known) && known[0] && known[1]) {
    const main = await fetchChannelMessage(channel, known[0]);
    const pm = await fetchChannelMessage(channel, known[1]);
    if (main && pm) return { main, pm };
    state.messageIdsByGuild.delete(guildId);
  }

  const batch = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  const botId = client.user?.id;
  const candidates = batch
    ? [...batch.values()].filter(
        (m) => m.author?.id === botId && String(m.content || "").toLowerCase().includes(STAFF_LIST_MARKER),
      )
    : [];
  const pmMsg = candidates.find((m) => String(m.content || "").includes(STAFF_LIST_PM_SUBHEADER));
  const mainMsg = candidates.find((m) => m !== pmMsg && String(m.content || "").toLowerCase().includes(STAFF_LIST_MARKER));
  if (mainMsg && pmMsg) {
    state.messageIdsByGuild.set(guildId, [mainMsg.id, pmMsg.id]);
  }
  return { main: mainMsg || null, pm: pmMsg || null };
}

async function fetchMembersForStaffList(guild) {
  const all = new Map();
  let after = null;
  const limit = 1000;

  while (true) {
    const chunk = await guild.members
      .fetch({ limit, after: after ?? undefined, force: true })
      .catch(() => null);
    if (!chunk?.size) break;

    for (const [id, member] of chunk) all.set(id, member);

    if (chunk.size < limit) break;
    const last = chunk.last?.();
    after = last?.id ?? null;
    await wait(400);
  }

  for (const [id, m] of guild.members.cache) {
    all.set(id, m);
  }
  return all.size ? all : guild.members.cache;
}

async function refreshStaffList(client, guildId = IDs.guilds.main, { force = false } = {}) {
  const state = ensureState(client);
  const guild = client.guilds.cache.get(guildId) || (await getClientGuildCached(client, guildId));
  if (!guild) return;

  const channelId = IDs.channels.staffList;
  const channel = guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId)) || (await getClientChannelCached(client, channelId));
  if (!channel?.isTextBased?.()) return;

  const membersSource = await fetchMembersForStaffList(guild);
  const pexedLast7Days = await getStaffPexedLast7Days(guild.id);

  const parts = buildStaffListParts(guild, membersSource, pexedLast7Days);
  const serial = `${parts.main}${STAFF_LIST_HASH_SPLIT}${parts.pm}`;

  if (parts.main.trim() === "## STAFF LIST") {
    const staffRoleIds = STAFF_ROLE_IDS.slice().reverse();
    const roleDebug = staffRoleIds.map((roleId) => {
      const role = guild.roles.cache.get(roleId);
      if (!role) return { roleId, name: null, memberCount: 0 };
      const count = Array.from(iterMembers(membersSource)).filter((m) => m?.roles?.cache?.has?.(roleId)).length;
      return { roleId, name: role.name, memberCount: count };
    });
    global.logger?.error?.("[STAFF LIST] Empty content debug", {
      guildId: guild.id,
      guildName: guild.name,
      staffRoles: roleDebug,
    });
  }

  const previousHash = state.contentHashByGuild.get(guildId);
  if (!force && previousHash === serial) return;

  let { main: mainMsg, pm: pmMsg } = await resolveStaffListMessages(channel, client, guildId);

  if (
    !force &&
    !previousHash &&
    mainMsg &&
    pmMsg &&
    mainMsg.content !== null &&
    mainMsg.content !== undefined &&
    pmMsg.content !== null &&
    pmMsg.content !== undefined
  ) {
    if (String(mainMsg.content).trim() === String(parts.main).trim() && String(pmMsg.content).trim() === String(parts.pm).trim()) {
      state.contentHashByGuild.set(guildId, serial);
      return;
    }
  }

  let synced = false;
  let mainId = null;
  let pmId = null;

  if (mainMsg) {
    if (force || mainMsg.content !== parts.main) {
      const edited = await mainMsg.edit(parts.main).catch((err) => {
        global.logger?.warn?.("[STAFF LIST] main message.edit failed:", err?.message || err);
        return null;
      });
      if (edited) mainId = edited.id;
    } else {
      mainId = mainMsg.id;
    }
  } else {
    const sent = await channel.send(parts.main).catch((err) => {
      global.logger?.warn?.("[STAFF LIST] main channel.send failed:", err?.message || err);
      return null;
    });
    if (sent) mainId = sent.id;
  }

  if (mainId) {
    if (pmMsg) {
      if (force || pmMsg.content !== parts.pm) {
        const editedPm = await pmMsg.edit(parts.pm).catch((err) => {
          global.logger?.warn?.("[STAFF LIST] pm message.edit failed:", err?.message || err);
          return null;
        });
        if (editedPm) pmId = editedPm.id;
      } else {
        pmId = pmMsg.id;
      }
    } else {
      const sentPm = await channel.send(parts.pm).catch((err) => {
        global.logger?.warn?.("[STAFF LIST] pm channel.send failed:", err?.message || err);
        return null;
      });
      if (sentPm) pmId = sentPm.id;
    }
  }

  if (mainId && pmId) {
    state.messageIdsByGuild.set(guildId, [mainId, pmId]);
    synced = true;
  }

  if (synced) state.contentHashByGuild.set(guildId, serial);
}

const STAFF_LIST_PERIODIC_REFRESH_MS = 15 * 60 * 1000;

function startStaffListPeriodicRefreshLoop(client) {
  if (!client || client._staffListPeriodicRefreshStarted) return;
  const gid = String(IDs.guilds.main || "");
  if (!gid || !client.guilds.cache.has(gid)) return;
  client._staffListPeriodicRefreshStarted = true;
  const tick = () => {
    refreshStaffList(client, gid).catch((err) => {
      global.logger?.warn?.("[STAFF LIST] periodic refresh failed:", err?.message || err);
    });
  };
  client._staffListPeriodicInterval = setInterval(tick, STAFF_LIST_PERIODIC_REFRESH_MS);
  tick();
}

function scheduleStaffListRefresh(client, guildId = IDs.guilds.main, delayMs = 500) {
  const state = ensureState(client);
  const existingTimer = state.timersByGuild.get(guildId);
  if (existingTimer) clearTimeout(existingTimer);

  const timer = setTimeout(() => { state.timersByGuild.delete(guildId); refreshStaffList(client, guildId).catch((err) => { global.logger.error("[STAFF LIST] refresh failed:", err); }); }, delayMs);
  timer.unref?.();

  state.timersByGuild.set(guildId, timer);
}

module.exports = {
  STAFF_ROLE_IDS,
  memberHasStaffRole,
  didStaffMembershipChange,
  didStaffRolesChange,
  refreshStaffList,
  scheduleStaffListRefresh,
  startStaffListPeriodicRefreshLoop,
};