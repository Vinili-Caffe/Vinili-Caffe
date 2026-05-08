const { ChannelType, PermissionFlagsBits } = require("discord.js");
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
  [IDs.roles.Helper]: { emoji: "<:VC_Helper:1502328751638450426>" },
  [IDs.roles.Mod]: { emoji: "<:VC_Mod:1494287597952958514>" },
  [IDs.roles.SeniorModerator]: { emoji: "<:VC_SeniorModerator:1494286913744539648>" },
  [IDs.roles.Director]: { emoji: "<:VC_Director:1494286915778641941>" },
  [IDs.roles.Admin]: { emoji: "<:VC_Admin:1494286848686686209>" },
  [IDs.roles.Founder]: { emoji: "<:VC_Founder:1494286918974963732>" },
};
const ROLE_EXCLUSIONS = { [IDs.roles.PartnerManager]: ["1442568907801100419"], };
const STAFF_LIST_SECTION_ROLE_IDS = Object.keys(ROLE_EMOJIS);
const HIGH_STAFF_ROLE_ID = String(IDs.roles.HighStaff || "").trim();
const STAFF_ROLE_IDS =
  HIGH_STAFF_ROLE_ID && !STAFF_LIST_SECTION_ROLE_IDS.includes(HIGH_STAFF_ROLE_ID)
    ? [...STAFF_LIST_SECTION_ROLE_IDS, HIGH_STAFF_ROLE_ID]
    : [...STAFF_LIST_SECTION_ROLE_IDS];
const STAFF_LIST_ROLE_ID_SET = new Set(STAFF_LIST_SECTION_ROLE_IDS.map((id) => String(id)));
const MEMBER_ROLE_ID = String(IDs.roles.Member || "");
const PM_ROLE_ID = String(IDs.roles.PartnerManager || "");
const STAFF_GENERIC_ROLE_ID = String(IDs.roles.Staff || "");
const STAFF_LIST_EXTRA_PM_SECTIONS = [
  { roleId: "1494089487863644330", emoji: "<:VC_EventManager:1494286896459681924>" },
];
const STAFF_LIST_WATCH_ROLE_IDS = Array.from(
  new Set([
    ...STAFF_LIST_SECTION_ROLE_IDS.map((id) => String(id)),
    ...STAFF_LIST_EXTRA_PM_SECTIONS.map((row) => String(row?.roleId || "")).filter(Boolean),
    ...(HIGH_STAFF_ROLE_ID ? [HIGH_STAFF_ROLE_ID] : []),
    ...(STAFF_GENERIC_ROLE_ID ? [STAFF_GENERIC_ROLE_ID] : []),
  ]),
);

function wait(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

/** Discord LIST /members richiede `after` = max user id della pagina precedente, non l’ultimo in Collection order. */
function maxMemberSnowflakeInChunk(chunk) {
  if (!chunk?.size) return null;
  let max = null;
  for (const id of chunk.keys()) {
    const s = String(id);
    if (!max || BigInt(s) > BigInt(max)) max = s;
  }
  return max;
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
    (STAFF_LIST_ROLE_ID_SET.has(oldRole) ||
      (HIGH_STAFF_ROLE_ID && oldRole === HIGH_STAFF_ROLE_ID) ||
      (STAFF_GENERIC_ROLE_ID && oldRole === STAFF_GENERIC_ROLE_ID));
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
  const isFounderRole = String(roleId) === String(IDs.roles.Founder || "");
  if (isFounderRole) {
    const ownerId = String(guild?.ownerId || "");
    filteredMembers.sort((a, b) => {
      const aOwner = String(a?.id || "") === ownerId ? 1 : 0;
      const bOwner = String(b?.id || "") === ownerId ? 1 : 0;
      return bOwner - aOwner;
    });
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
  const staffRoleIds = STAFF_LIST_SECTION_ROLE_IDS.slice().reverse();
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
  const gk = String(guildId ?? "").trim();
  const known = state.messageIdsByGuild.get(gk);
  if (Array.isArray(known) && known[0] && known[1]) {
    const main = await fetchChannelMessage(channel, known[0]);
    const pm = await fetchChannelMessage(channel, known[1]);
    if (main && pm) return { main, pm };
    state.messageIdsByGuild.delete(gk);
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
    state.messageIdsByGuild.set(gk, [mainMsg.id, pmMsg.id]);
  }
  return { main: mainMsg || null, pm: pmMsg || null };
}

async function fetchMembersForStaffList(guild) {
  const gid = String(guild?.id || "");
  const mc = Number(guild?.memberCount ?? 0) || 0;
  const cs = guild?.members?.cache?.size ?? 0;

  if (mc > 0 && cs >= mc) {
    return guild.members.cache;
  }

  const all = new Map();
  let after = null;
  const limit = 1000;
  let page = 0;
  const maxPages = Math.min(50, Math.max(1, Math.ceil((mc || 25000) / limit) + 2));

  while (page < maxPages) {
    page += 1;
    const chunk = await guild.members
      .fetch({ limit, after: after ?? undefined, force: true })
      .catch((err) => {
        global.logger?.error?.("[STAFF LIST] fetch membri chunk fallito", {
          guildId: gid,
          page,
          after: after ?? null,
          err: err?.message || String(err),
          code: err?.code,
        });
        return null;
      });
    if (!chunk?.size) break;

    const before = all.size;
    for (const [id, member] of chunk) all.set(id, member);
    if (all.size === before) {
      break;
    }

    if (chunk.size < limit) break;

    const nextAfter = maxMemberSnowflakeInChunk(chunk);
    if (!nextAfter || String(nextAfter) === String(after ?? "")) {
      global.logger?.warn?.("[STAFF LIST] fetch membri: cursore after non avanza (stop)", {
        guildId: gid,
        page,
        after: after ?? null,
        nextAfter,
      });
      break;
    }
    after = nextAfter;
    await wait(400);
  }

  if (page >= maxPages && mc > 0 && all.size < mc - 1) {
    global.logger?.warn?.("[STAFF LIST] fetch membri: limite pagine raggiunto", { guildId: gid, maxPages, accumulated: all.size, memberCount: mc });
  }

  for (const [id, m] of guild.members.cache) {
    all.set(id, m);
  }
  const out = all.size ? all : guild.members.cache;
  return out;
}

async function refreshStaffList(client, guildId = IDs.guilds.main, { force = false } = {}) {
  const state = ensureState(client);
  const gidKey = String(guildId ?? IDs.guilds.main ?? "").trim();
  if (!gidKey) {
    global.logger?.error?.("[STAFF LIST] guildId main non configurato");
    return;
  }
  const guild = client.guilds.cache.get(gidKey) || (await getClientGuildCached(client, gidKey));
  if (!guild) {
    global.logger?.error?.("[STAFF LIST] guild non disponibile (né cache né fetch)", { guildId: gidKey });
    return;
  }

  const channelId = IDs.channels.staffList;
  const channel = guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId)) || (await getClientChannelCached(client, channelId));
  if (!channel?.isTextBased?.()) {
    global.logger?.error?.("[STAFF LIST] canale staff list assente o non testuale", {
      guildId: gidKey,
      channelId: String(channelId || ""),
      channelType: channel?.type ?? null,
    });
    return;
  }

  if (channel.type === ChannelType.GuildForum) {
    global.logger?.error?.(
      "[STAFF LIST] il canale `staffList` è un forum: Discord non consente messaggi diretti sul canale; usa un canale testo o un thread dedicato e aggiorna `IDs.channels.staffList`.",
      { guildId: gidKey, channelId: String(channel.id) },
    );
    return;
  }

  const me = guild.members?.me;
  if (me && channel.permissionsFor?.(me)?.has?.(PermissionFlagsBits.SendMessages) === false) {
    global.logger?.error?.("[STAFF LIST] bot senza permesso SendMessages nel canale staff list", {
      guildId: gidKey,
      channelId: String(channel.id),
    });
    return;
  }

  if (client._staffListRefreshInFlight) {
    return;
  }
  client._staffListRefreshInFlight = true;
  try {
  const membersSource = await fetchMembersForStaffList(guild);
  const newBadgeRoleIdsByUser = await getStaffListNewBadgeRoleIdsByUser(guild.id);
  const parts = buildStaffListParts(guild, membersSource, newBadgeRoleIdsByUser);
  const serial = `${parts.main}${STAFF_LIST_HASH_SPLIT}${parts.pm}`;

  if (parts.main.trim() === "## STAFF LIST") {
    const staffRoleIds = STAFF_LIST_SECTION_ROLE_IDS.slice().reverse();
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

  let { main: mainMsg, pm: pmMsg } = await resolveStaffListMessages(channel, client, gidKey);
  if (!mainMsg || !pmMsg) {
    state.contentHashByGuild.delete(gidKey);
  }

  const previousHash = state.contentHashByGuild.get(gidKey);
  if (!force && previousHash === serial && mainMsg && pmMsg) {
    return;
  }

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
      state.contentHashByGuild.set(gidKey, serial);
      return;
    }
  }

  const maxLen = 2000;
  if (parts.main.length > maxLen || parts.pm.length > maxLen) {
    global.logger?.error?.("[STAFF LIST] contenuto supera il limite Discord (2000)", {
      guildId: gidKey,
      mainLen: parts.main.length,
      pmLen: parts.pm.length,
    });
    return;
  }

  let synced = false;
  let mainId = null;
  let pmId = null;

  if (mainMsg) {
    if (force || mainMsg.content !== parts.main) {
      const edited = await mainMsg.edit(parts.main).catch((err) => {
        global.logger?.error?.("[STAFF LIST] main message.edit failed:", err?.message || err, {
          code: err?.code,
          guildId: gidKey,
        });
        return null;
      });
      if (edited) {
        mainId = edited.id;
      } else {
        state.messageIdsByGuild.delete(gidKey);
        const sent = await channel.send(parts.main).catch((err) => {
          global.logger?.warn?.("[STAFF LIST] main channel.send (after edit fail):", err?.message || err);
          return null;
        });
        if (sent) mainId = sent.id;
      }
    } else {
      mainId = mainMsg.id;
    }
  } else {
    const sent = await channel.send(parts.main).catch((err) => {
      global.logger?.error?.("[STAFF LIST] main channel.send failed:", err?.message || err, {
        code: err?.code,
        guildId: gidKey,
        channelId: String(channel.id),
      });
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
        if (editedPm) {
          pmId = editedPm.id;
        } else {
          state.messageIdsByGuild.delete(gidKey);
          const sentPm = await channel.send(parts.pm).catch((err) => {
            global.logger?.error?.("[STAFF LIST] pm channel.send (after edit fail):", err?.message || err, {
              code: err?.code,
              guildId: gidKey,
              channelId: String(channel.id),
            });
            return null;
          });
          if (sentPm) pmId = sentPm.id;
        }
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
    state.messageIdsByGuild.set(gidKey, [mainId, pmId]);
    synced = true;
  } else if (!mainId || !pmId) {
    global.logger?.error?.("[STAFF LIST] sync incompleto (manca main o pm)", {
      guildId: gidKey,
      channelId: String(channelId || ""),
      mainId: mainId || null,
      pmId: pmId || null,
    });
  }

  if (synced) state.contentHashByGuild.set(gidKey, serial);
  } finally {
    client._staffListRefreshInFlight = false;
  }
}

function startStaffListPeriodicRefreshLoop(client) {
  if (!client || client._staffListPeriodicRefreshStarted) return;
  // Staff list is event-driven: startup render plus pex/depex role mutations only.
  client._staffListPeriodicRefreshStarted = true;
}

function scheduleStaffListRefresh(client, guildId = IDs.guilds.main, delayMs = 500, { force = false } = {}) {
  const state = ensureState(client);
  const gidKey = String(guildId ?? IDs.guilds.main ?? "").trim();
  if (!gidKey) return;
  const existingTimer = state.timersByGuild.get(gidKey);
  if (existingTimer) clearTimeout(existingTimer);

  const timer = setTimeout(() => {
    state.timersByGuild.delete(gidKey);
    refreshStaffList(client, gidKey, { force }).catch((err) => {
      global.logger.error("[STAFF LIST] refresh failed:", err);
    });
  }, delayMs);
  timer.unref?.();

  state.timersByGuild.set(gidKey, timer);
}

function queueStaffListRefreshAfterRoleMutation(client, guildId = IDs.guilds.main) {
  const gid = String(guildId || "").trim();
  if (!client?.guilds || !gid) return;
  const mainGid = String(IDs.guilds?.main || "").trim();
  if (mainGid && gid !== mainGid) return;
  scheduleStaffListRefresh(client, gid, 750);
}

module.exports = {
  STAFF_NEW_EMOJI,
  STAFF_ROLE_IDS,
  memberHasStaffRole,
  didStaffMembershipChange,
  didStaffRolesChange,
  refreshStaffList,
  scheduleStaffListRefresh,
  queueStaffListRefreshAfterRoleMutation,
  startStaffListPeriodicRefreshLoop,
};
