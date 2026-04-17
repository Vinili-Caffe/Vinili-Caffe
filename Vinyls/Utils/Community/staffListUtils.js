const IDs = require("../Config/ids");
const { getClientGuildCached, getGuildChannelCached, getClientChannelCached } = require("../Interaction/interactionEntityCache");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const STAFF_LIST_HASH_SPLIT = "\n---STAFF_LIST_SPLIT---\n";
const STAFF_LIST_PM_TOP_SPACER = "\u200B";

function staffListFirstLine(content) {
  return String(content || "").trimStart().split("\n")[0] || "";
}

function isMainStaffListMessageContent(content) {
  const firstLine = staffListFirstLine(content);
  if (!/^##\s*staff\s*list\b/i.test(firstLine)) return false;
  if (/[·•]\s*partner\s*manager/i.test(firstLine)) return false;
  return true;
}

function isPmStaffListMessageContent(content) {
  if (isMainStaffListMessageContent(content)) return false;
  const c = String(content || "").trimStart();
  if (/^##\s*partner manager/i.test(c)) return true;
  if (/[·•]\s*partner\s*manager/i.test(c)) return true;
  const pmId = String(IDs.roles.PartnerManager || "");
  if (pmId && c.includes(`<@&${pmId}>`) && c.includes("︲")) return true;
  return false;
}
const STAFF_NEW_EMOJI = "<:VC_New:1471891729471770819>";
const STAFF_NEW_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const ROLE_EMOJIS = {
  [IDs.roles.PartnerManager]: { emoji: "<:VC_PartnerManager:1494286911286808576>" },
  [IDs.roles.Helper]: { emoji: "<:VC_Helper:1494287601266331829>" },
  [IDs.roles.Mod]: { emoji: "<:VC_Mod:1494287597952958514>" },
  [IDs.roles.Coordinator]: { emoji: "<:VC_Coordinator:1494286913744539648>" },
  [IDs.roles.Supervisor]: { emoji: "<:VC_Supervisor:1494286915778641941>" },
  [IDs.roles.Admin]: { emoji: "<:VC_Admin:1494286848686686209>" },
  [IDs.roles.CoFounder]: { emoji: "<:VC_CoFounder:1494286898535862333>" },
  [IDs.roles.Founder]: { emoji: "<:VC_Founder:1494286918974963732>" },
};
const ROLE_EXCLUSIONS = { [IDs.roles.PartnerManager]: ["1442568907801100419"], };
const STAFF_ROLE_IDS = Object.keys(ROLE_EMOJIS);
const STAFF_LIST_ROLE_ID_SET = new Set(STAFF_ROLE_IDS.map((id) => String(id)));
const MEMBER_ROLE_ID = String(IDs.roles.Member || "");
const PM_ROLE_ID = String(IDs.roles.PartnerManager || "");
const STAFF_GENERIC_ROLE_ID = String(IDs.roles.Staff || "");
const STAFF_LIST_EXTRA_PM_SECTIONS = [
  { roleId: "1494089487863644330", emoji: "<:VC_EventManager:1494286896459681924>" },
];
const STAFF_LIST_WATCH_ROLE_IDS = Array.from(
  new Set([
    ...STAFF_ROLE_IDS.map((id) => String(id)),
    ...STAFF_LIST_EXTRA_PM_SECTIONS.map((row) => String(row?.roleId || "")).filter(Boolean),
  ]),
);

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
  const oldStaffIds = new Set(STAFF_LIST_WATCH_ROLE_IDS.filter((id) => oldMember?.roles?.cache?.has?.(id)));
  const newStaffIds = new Set(STAFF_LIST_WATCH_ROLE_IDS.filter((id) => newMember?.roles?.cache?.has?.(id)));
  if (oldStaffIds.size !== newStaffIds.size) return true;
  for (const id of oldStaffIds) if (!newStaffIds.has(id)) return true;
  for (const id of newStaffIds) if (!oldStaffIds.has(id)) return true;
  return false;
}

function rowQualifiesForStaffListNewBadge(row) {
  const oldRole = String(row?.oldRole || "");
  const newRole = String(row?.newRole || "");
  if (!newRole || !STAFF_LIST_ROLE_ID_SET.has(newRole)) return false;

  const fromMember = MEMBER_ROLE_ID && oldRole === MEMBER_ROLE_ID;

  const oldWasStaffForPm =
    oldRole &&
    oldRole !== PM_ROLE_ID &&
    (STAFF_LIST_ROLE_ID_SET.has(oldRole) || (STAFF_GENERIC_ROLE_ID && oldRole === STAFF_GENERIC_ROLE_ID));
  const staffToPm = newRole === PM_ROLE_ID && oldWasStaffForPm;

  return fromMember || staffToPm;
}

async function getStaffListNewBadgeRoleIdsByUser(guildId) {
  const cutoff = Date.now() - STAFF_NEW_DAYS_MS;
  const docs = await ActivityUserProfile.find(
    { guildId: String(guildId), staff: { $exists: true } },
    { userId: 1, "staff.rolesHistory": 1 },
  )
    .lean()
    .catch(() => []);

  const out = new Map();
  for (const doc of docs || []) {
    const uid = doc?.userId != null ? String(doc.userId) : "";
    if (!uid) continue;
    const history = Array.isArray(doc?.staff?.rolesHistory) ? doc.staff.rolesHistory : [];
    for (const row of history) {
      const when = row?.date ? new Date(row.date) : null;
      if (!when || Number.isNaN(when.getTime())) continue;
      if (when.getTime() < cutoff) continue;
      if (!rowQualifiesForStaffListNewBadge(row)) continue;
      const nr = String(row?.newRole || "");
      if (!STAFF_LIST_ROLE_ID_SET.has(nr)) continue;
      if (!out.has(uid)) out.set(uid, new Set());
      out.get(uid).add(nr);
    }
  }
  return out;
}

function buildRoleSection(roleId, guild, membersSource, newBadgeRoleIdsByUser) {
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
  const rid = String(roleId);
  const membersList = filteredMembers
    .map((member) => {
      const rolesWithNew = newBadgeRoleIdsByUser.get(String(member.id));
      const newBadge = rolesWithNew?.has(rid) ? ` ${STAFF_NEW_EMOJI}` : "";
      return `<:VC_Dot:1482532364222595303> <@${member.id}>${newBadge}`;
    })
    .join("\n") || "<:VC_Dot:1482532364222595303>";
  return `${emoji} **<@&${roleId}>︲\`${memberCount}\`**\n\n${membersList}\n\n`;
}

function buildRoleSectionWithCustomEmoji(roleId, emoji, guild, membersSource) {
  const role = guild.roles.cache.get(String(roleId));
  if (!role) return "";
  const filteredMembers = [];
  for (const member of iterMembers(membersSource)) {
    if (!member?.roles?.cache?.has?.(String(roleId))) continue;
    filteredMembers.push(member);
  }
  const memberCount = filteredMembers.length;
  const membersList = filteredMembers
    .map((member) => `<:VC_Dot:1482532364222595303> <@${member.id}>`)
    .join("\n") || "<:VC_Dot:1482532364222595303>";
  return `${String(emoji || "")} **<@&${roleId}>︲\`${memberCount}\`**\n\n${membersList}\n\n`;
}

function buildStaffListParts(guild, membersSource = guild.members.cache, newBadgeRoleIdsByUser = new Map()) {
  const staffRoleIds = STAFF_ROLE_IDS.slice().reverse();
  const pmRoleId = String(IDs.roles.PartnerManager || "");
  let main = "## STAFF LIST\n\n";
  let pm = "";
  for (const roleId of staffRoleIds) {
    const section = buildRoleSection(roleId, guild, membersSource, newBadgeRoleIdsByUser);
    if (!section) continue;
    if (String(roleId) === pmRoleId) {
      pm = section;
    } else {
      main += section;
    }
  }
  if (!pm) {
    const rid = IDs.roles.PartnerManager;
    if (rid) {
      pm = `${ROLE_EMOJIS[rid]?.emoji || ""} **<@&${rid}>︲\`0\`**\n\n<:VC_Dot:1482532364222595303>\n\n`;
    } else {
      pm = "<:VC_Dot:1482532364222595303>";
    }
  }
  let pmExtras = "";
  for (const section of STAFF_LIST_EXTRA_PM_SECTIONS) {
    const roleId = String(section?.roleId || "");
    if (!roleId) continue;
    pmExtras += buildRoleSectionWithCustomEmoji(roleId, section?.emoji, guild, membersSource);
  }
  const mainWithNaturalGap = `${String(main || "").trimEnd()}\n\n`;
  const pmWithNaturalGap = `${STAFF_LIST_PM_TOP_SPACER}\n${pm}${pmExtras}`;
  return { main: mainWithNaturalGap, pm: pmWithNaturalGap };
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
        (m) =>
          m.author?.id === botId &&
          (isMainStaffListMessageContent(m.content) || isPmStaffListMessageContent(m.content)),
      )
    : [];
  const mainMsg = candidates.find((m) => isMainStaffListMessageContent(m.content));
  const pmMsg = candidates.find((m) => m !== mainMsg && isPmStaffListMessageContent(m.content));
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
  const newBadgeRoleIdsByUser = await getStaffListNewBadgeRoleIdsByUser(guild.id);

  const parts = buildStaffListParts(guild, membersSource, newBadgeRoleIdsByUser);
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
  STAFF_NEW_EMOJI,
  STAFF_ROLE_IDS,
  memberHasStaffRole,
  didStaffMembershipChange,
  didStaffRolesChange,
  refreshStaffList,
  scheduleStaffListRefresh,
  startStaffListPeriodicRefreshLoop,
};