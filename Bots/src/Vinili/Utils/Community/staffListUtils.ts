const { ChannelType, PermissionFlagsBits } = require("discord.js") as typeof import("discord.js");
const IDs = require("../Config/ids") as typeof import("../Config/ids");
const { getClientGuildCached, getGuildChannelCached, getClientChannelCached } = require("../Interaction/interactionEntityCache") as typeof import("../Interaction/interactionEntityCache");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { getBotState, setBotState } = require("../BotState/botStateStore") as typeof import("../BotState/botStateStore");
const { wasRoleRestoredByMuteMirror } = require("../Moderation/muteRestoreAnnounceSuppress") as typeof import("../Moderation/muteRestoreAnnounceSuppress");
const STAFF_LIST_HASH_SPLIT = "\n---STAFF_LIST_SPLIT---\n";
const STAFF_LIST_STARTUP_REFRESH_MS = 4500;
const STAFF_LIST_DISCORD_MAX = 2000;
const STAFF_LIST_REJOIN_MAX = 1850;
const BOT_STATE_KEY_STAFF_LIST_SYNC_PREFIX = "staffListSync";
const STAFF_LIST_LAYOUT_REV = "helper-with-pm-v12-msg-gap";

function normalizeStaffListContent(raw?) {
  return String(raw || "")
    .replace(/\u200B|\u200C|\u200D|\uFEFF/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
}

function staffListContentEquals(stored?, expected?) {
  return (
    String(stored || "")
      .replace(/\r\n/g, "\n")
      .trimEnd() ===
    String(expected || "")
      .replace(/\r\n/g, "\n")
      .trimEnd()
  );
}

function buildStaffListSerial(parts?) {
  return `${STAFF_LIST_LAYOUT_REV}${STAFF_LIST_HASH_SPLIT}${String(parts.main || "").replace(/\r\n/g, "\n").trimEnd()}${STAFF_LIST_HASH_SPLIT}${String(parts.pm || "").replace(/\r\n/g, "\n").trimEnd()}`;
}

function joinStaffListMainWithPm(mainBody?, pmBody?) {
  const left = String(mainBody || "").replace(/\n\n$/, "").trimEnd();
  const right = String(pmBody || "").trim();
  if (!right) return left;
  if (!left) return right;
  return `${left}\n\n${right}`;
}

function staffListFirstLine(content?) {
  return String(content || "").trimStart().split("\n")[0] || "";
}

function isMainStaffListMessageContent(content?) {
  const firstLine = staffListFirstLine(content);
  if (!/^##\s*staff\s*list\b/i.test(firstLine)) return false;
  if (/[·•]\s*_?continua_?/i.test(firstLine)) return false;
  if (/[·•]\s*partner\s*manager/i.test(firstLine)) return false;
  return true;
}

function isPmStaffListMessageContent(content?) {
  if (isMainStaffListMessageContent(content)) return false;
  const c = String(content || "").trimStart();
    if (/^##\s*staff\s*list\s*·\s*_?continua_?/i.test(c)) return true;
  if (/^##\s*partner manager/i.test(c)) return true;
  if (/[·•]\s*partner\s*manager/i.test(c)) return true;
  if (!c.includes("︲")) return false;
  for (const roleId of STAFF_LIST_SECTION_ROLE_IDS) {
    if (c.includes(`<@&${roleId}>`)) return true;
  }
  return false;
}
const STAFF_NEW_EMOJI = "<:VC_New:1471891729471770819>";
const STAFF_PAUSE_EMOJI = "<:VC_PausedStatus:1482527157283455086>";
const STAFF_NEW_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const ROLE_EMOJIS = {
  [IDs.roles.PartnerManager]: { emoji: "<:VC_PartnerManager:1494286911286808576>" },
  [IDs.roles.Helper]: { emoji: "<:VC_Helper:1502328751638450426>" },
  [IDs.roles.Mod]: { emoji: "<:VC_Mod:1494287597952958514>" },
  [IDs.roles.SeniorModerator]: { emoji: "<:VC_SeniorModerator:1494286913744539648>" },
  [IDs.roles.Director]: { emoji: "<:VC_Director:1494286915778641941>" },
  [IDs.roles.Admin]: { emoji: "<:VC_Admin:1494286848686686209>" },
  [IDs.roles.Manager]: { emoji: "<:VC_Manager:1521629610876338307>" },
  [IDs.roles.Founder]: { emoji: "<:VC_Founder:1494286918974963732>" },
};
const ROLE_EXCLUSIONS = {
  [IDs.roles.PartnerManager]: ["1442568907801100419"],
  [IDs.roles.Director]: ["1259884798688759839"],
};
const STAFF_LIST_SECTION_ROLE_IDS = Object.keys(ROLE_EMOJIS);
const HIGH_STAFF_ROLE_ID = String(IDs.roles.HighStaff || "").trim();
const STAFF_ROLE_IDS =
  HIGH_STAFF_ROLE_ID && !STAFF_LIST_SECTION_ROLE_IDS.includes(HIGH_STAFF_ROLE_ID)
    ? [...STAFF_LIST_SECTION_ROLE_IDS, HIGH_STAFF_ROLE_ID]
    : [...STAFF_LIST_SECTION_ROLE_IDS];
const STAFF_LIST_ROLE_ID_SET = new Set(STAFF_LIST_SECTION_ROLE_IDS.map((id?) => String(id)));
const MEMBER_ROLE_ID = String(IDs.roles.Member || "");
const PM_ROLE_ID = String(IDs.roles.PartnerManager || "");
const STAFF_GENERIC_ROLE_ID = String(IDs.roles.Staff || "");
const STAFF_LIST_EXTRA_PM_SECTIONS = [];

function wait(ms?) {
  return new Promise((resolve?) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

function maxMemberSnowflakeInChunk(chunk?) {
  if (!chunk?.size) return null;
  let max = null;
  for (const id of chunk.keys()) {
    const s = String(id);
    if (!max || BigInt(s) > BigInt(max)) max = s;
  }
  return max;
}

function ensureState(client?) {
  if (!client._staffListState) {
    client._staffListState = {
      messageIdsByGuild: new Map(),
      contentHashByGuild: new Map(),
      timersByGuild: new Map(),
    };
  }
  return client._staffListState;
}

function iterMembers(membersSource?) {
  if (!membersSource) return [];
  if (typeof membersSource.values === "function") return membersSource.values();
  if (Array.isArray(membersSource)) return membersSource.values();
  return [];
}

function memberHasStaffRole(member?) {
  return STAFF_ROLE_IDS.some((roleId?) => member?.roles?.cache?.has?.(roleId));
}

function didStaffMembershipChange(oldMember?, newMember?) {
  return memberHasStaffRole(oldMember) !== memberHasStaffRole(newMember);
}

function didStaffListDisplayRolesChange(oldMember?, newMember?) {
  const oldStaffIds = new Set(STAFF_LIST_SECTION_ROLE_IDS.filter((id?) => oldMember?.roles?.cache?.has?.(id)));
  const newStaffIds = new Set(STAFF_LIST_SECTION_ROLE_IDS.filter((id?) => newMember?.roles?.cache?.has?.(id)));
  if (oldStaffIds.size !== newStaffIds.size) return true;
  for (const id of oldStaffIds) if (!newStaffIds.has(id)) return true;
  for (const id of newStaffIds) if (!oldStaffIds.has(id)) return true;
  return false;
}

function buildStaffListSyncStateKey(guildId?) {
  return `${BOT_STATE_KEY_STAFF_LIST_SYNC_PREFIX}:${String(guildId || "").trim()}`;
}

async function hydrateStaffListPersistedState(client?, guildId?) {
  const state = ensureState(client);
  const gk = String(guildId || "").trim();
  if (!gk) return;
  if (state.contentHashByGuild.has(gk) && state.messageIdsByGuild.has(gk)) return;

  const persisted = await getBotState(buildStaffListSyncStateKey(gk), null);
  if (!persisted || typeof persisted !== "object") return;

  if (!state.contentHashByGuild.has(gk) && persisted.hash) {
    state.contentHashByGuild.set(gk, String(persisted.hash));
  }
  if (!state.messageIdsByGuild.has(gk) && Array.isArray(persisted.messageIds) && persisted.messageIds[0]) {
    state.messageIdsByGuild.set(
      gk,
      persisted.messageIds.map((id?) => String(id || "").trim()).filter(Boolean),
    );
  }
}

async function persistStaffListSyncState(guildId?, serial?, messageIds?) {
  const gk = String(guildId || "").trim();
  if (!gk || !serial) return;
  const ids = (Array.isArray(messageIds) ? messageIds : [])
    .map((id?) => String(id || "").trim())
    .filter(Boolean);
  await setBotState(buildStaffListSyncStateKey(gk), {
    hash: String(serial),
    messageIds: ids,
    at: Date.now(),
  });
}

function pickNewestStaffListCandidate(candidates?, predicate?) {
  return [...candidates]
    .filter(predicate)
    .sort((a?, b?) => Number(b?.createdTimestamp || 0) - Number(a?.createdTimestamp || 0))[0] || null;
}

function staffListContentMatches(storedMain?, storedPm?, parts?) {
  return (
    staffListContentEquals(storedMain, parts.main) &&
    staffListContentEquals(storedPm, parts.pm)
  );
}

function userPreviouslyHeldStaffListRole(history?, roleId?, beforeWhen?) {
  const rid = String(roleId || "").trim();
  if (!rid) return false;
  const beforeMs = beforeWhen instanceof Date ? beforeWhen.getTime() : Number(beforeWhen);
  if (!Number.isFinite(beforeMs)) return false;
  const rows = Array.isArray(history) ? history : [];
  return rows.some((row?) => {
    if (String(row?.newRole || "").trim() !== rid) return false;
    const when = row?.date ? new Date(row.date) : null;
    if (!when || Number.isNaN(when.getTime())) return false;
    return when.getTime() < beforeMs;
  });
}

function rowQualifiesForStaffListNewBadge(row?, history = []) {
  const oldRole = String(row?.oldRole || "");
  const newRole = String(row?.newRole || "");
  if (!newRole || !STAFF_LIST_ROLE_ID_SET.has(newRole)) return false;

  const when = row?.date ? new Date(row.date) : null;
  if (when && !Number.isNaN(when.getTime()) && userPreviouslyHeldStaffListRole(history, newRole, when)) {
    return false;
  }

  const fromMember = MEMBER_ROLE_ID && oldRole === MEMBER_ROLE_ID;

  const oldWasStaffForPm =
    oldRole &&
    oldRole !== PM_ROLE_ID &&
    (STAFF_LIST_ROLE_ID_SET.has(oldRole) ||
      (HIGH_STAFF_ROLE_ID && oldRole === HIGH_STAFF_ROLE_ID) ||
      (STAFF_GENERIC_ROLE_ID && oldRole === STAFF_GENERIC_ROLE_ID));
  const staffToPm = newRole === PM_ROLE_ID && oldWasStaffForPm;

  const pmToStaffLadder =
    oldRole === PM_ROLE_ID &&
    newRole !== PM_ROLE_ID &&
    STAFF_LIST_ROLE_ID_SET.has(newRole);

  const ontoStaffListFromNonListRole =
    oldRole &&
    !STAFF_LIST_ROLE_ID_SET.has(oldRole) &&
    newRole !== PM_ROLE_ID;

  return fromMember || staffToPm || pmToStaffLadder || ontoStaffListFromNonListRole;
}

async function getStaffListNewBadgeRoleIdsByUser(guildId?) {
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
      if (!rowQualifiesForStaffListNewBadge(row, history)) continue;
      const nr = String(row?.newRole || "");
      if (!STAFF_LIST_ROLE_ID_SET.has(nr)) continue;
      if (!out.has(uid)) out.set(uid, new Set());
      out.get(uid).add(nr);
    }
  }
  return out;
}

async function getStaffListPausedUserIds(guildId?) {
  const { hasActiveAcceptedStaffPause, getTodayUtc } = require("../Pause/pauseHandlersUtils") as typeof import("../Pause/pauseHandlersUtils");
  const today = getTodayUtc();
  const gid = String(guildId);
  const docs = await ActivityUserProfile.find(
    {
      guildId: gid,
      "staff.pauses": { $elemMatch: { status: "accepted" } },
    },
    { userId: 1, "staff.pauses": 1 },
  )
    .lean()
    .catch(() => []);

  const out = new Set();
  for (const doc of docs || []) {
    const uid = doc?.userId != null ? String(doc.userId) : "";
    if (!uid) continue;
    const pauses = Array.isArray(doc?.staff?.pauses) ? doc.staff.pauses : [];
    if (hasActiveAcceptedStaffPause(pauses, today)) out.add(uid);
  }

  try {
    const mongoose = require("mongoose") as typeof import("mongoose");
    const legacy = await mongoose.connection.db
      .collection("staffs")
      .find({ guildId: gid, "pauses.status": "accepted" }, { projection: { userId: 1, pauses: 1 } })
      .toArray();
    for (const row of legacy || []) {
      const uid = String(row?.userId || "").trim();
      if (!uid || out.has(uid)) continue;
      const pauses = Array.isArray(row?.pauses) ? row.pauses : [];
      if (hasActiveAcceptedStaffPause(pauses, today)) out.add(uid);
    }
  } catch (_) {
      }

  return out;
}

function buildRoleSection(roleId?, guild?, membersSource?, newBadgeRoleIdsByUser?, pausedUserIds = new Set()) {
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
  filteredMembers.sort((a?, b?) => {
    if (isFounderRole) {
      const ownerId = String(guild?.ownerId || "");
      const aOwner = String(a?.id || "") === ownerId ? 1 : 0;
      const bOwner = String(b?.id || "") === ownerId ? 1 : 0;
      if (bOwner !== aOwner) return bOwner - aOwner;
    }
    const ai = BigInt(String(a?.id || "0"));
    const bi = BigInt(String(b?.id || "0"));
    if (ai < bi) return -1;
    if (ai > bi) return 1;
    return 0;
  });
  const memberCount = filteredMembers.length;
  const { emoji } = ROLE_EMOJIS[roleId];
  const rid = String(roleId);
  const membersList = filteredMembers
    .map((member?) => {
      const uid = String(member.id);
      const rolesWithNew = newBadgeRoleIdsByUser.get(uid);
      const newBadge = rolesWithNew?.has(rid) ? ` ${STAFF_NEW_EMOJI}` : "";
      const pauseBadge = pausedUserIds.has(uid) ? ` ${STAFF_PAUSE_EMOJI}` : "";
      return `<:VC_Dot:1482532364222595303> <@${member.id}>${newBadge}${pauseBadge}`;
    })
    .join("\n") || "<:VC_Dot:1482532364222595303>";
  return `${emoji} **<@&${roleId}>︲\`${memberCount}\`**\n\n${membersList}\n\n`;
}

function buildRoleSectionWithCustomEmoji(roleId?, emoji?, guild?, membersSource?) {
  const role = guild.roles.cache.get(String(roleId));
  if (!role) return "";
  const filteredMembers = [];
  for (const member of iterMembers(membersSource)) {
    if (!member?.roles?.cache?.has?.(String(roleId))) continue;
    filteredMembers.push(member);
  }
  filteredMembers.sort((a?, b?) => {
    const ai = BigInt(String(a?.id || "0"));
    const bi = BigInt(String(b?.id || "0"));
    if (ai < bi) return -1;
    if (ai > bi) return 1;
    return 0;
  });
  const memberCount = filteredMembers.length;
  const membersList = filteredMembers
    .map((member?) => `<:VC_Dot:1482532364222595303> <@${member.id}>`)
    .join("\n") || "<:VC_Dot:1482532364222595303>";
  return `${String(emoji || "")} **<@&${roleId}>︲\`${memberCount}\`**\n\n${membersList}\n\n`;
}

function finalizeStaffListMain(text?, { hasContinuation = false, leadingGap = false } = {}) {
  const raw = String(text || "");
  if (!raw.trim()) return "";
  const withoutTrailingSpaces = raw.replace(/[ \t\u00A0]+$/g, "");
  let body = hasContinuation ? withoutTrailingSpaces : `${withoutTrailingSpaces.trimEnd()}\n\n`;
  if (leadingGap) {
        const trimmed = body.replace(/^\u200b?\r?\n*/, "");
    body = `\u200b\n${trimmed}`;
  }
  return body;
}

function buildStaffListParts(
  guild?,
  membersSource = guild.members.cache,
  newBadgeRoleIdsByUser = new Map(),
  opts: Record<string, any> = {},
  pausedUserIds = new Set(),
) {
  const preferSplit = opts?.preferSplit === true;
  const staffRoleIds = STAFF_LIST_SECTION_ROLE_IDS.slice().reverse();
  const pmRoleId = String(IDs.roles.PartnerManager || "");
  const helperRoleId = String(IDs.roles.Helper || "");
  let main = "## STAFF LIST\n\n";
  let helper = "";
  let pm = "";

  for (const roleId of staffRoleIds) {
    const section = buildRoleSection(roleId, guild, membersSource, newBadgeRoleIdsByUser, pausedUserIds);
    if (!section) continue;
    const rid = String(roleId);
    if (rid === pmRoleId) {
      pm = section;
    } else if (rid === helperRoleId) {
      helper = section;
    } else {
      main += section;
    }
  }

  if (!pm && pmRoleId) {
    const rid = IDs.roles.PartnerManager;
    pm = `${ROLE_EMOJIS[rid]?.emoji || ""} **<@&${rid}>︲\`0\`**\n\n<:VC_Dot:1482532364222595303>\n\n`;
  }

  let pmExtras = "";
  for (const section of STAFF_LIST_EXTRA_PM_SECTIONS) {
    const roleId = String(section?.roleId || "");
    if (!roleId) continue;
    pmExtras += buildRoleSectionWithCustomEmoji(roleId, section?.emoji, guild, membersSource);
  }

  const pmOnlyBody = `${pm}${pmExtras}`.trim();
  const continuationBody = joinStaffListMainWithPm(helper, pmOnlyBody);
  const hasContinuation = Boolean(continuationBody);

  const fullCombined = hasContinuation ? joinStaffListMainWithPm(main, continuationBody) : main;
  const fullSingle = finalizeStaffListMain(fullCombined);
  const mustSplit =
    fullSingle.length > STAFF_LIST_DISCORD_MAX ||
    (preferSplit && hasContinuation && fullSingle.length > STAFF_LIST_REJOIN_MAX);
  if (!mustSplit) {
    return { main: fullSingle, pm: "" };
  }

  const mainPart = finalizeStaffListMain(main, { hasContinuation });
  const pmPart = finalizeStaffListMain(continuationBody, { leadingGap: true });

  if (mainPart.length <= STAFF_LIST_DISCORD_MAX && pmPart.length <= STAFF_LIST_DISCORD_MAX) {
    return { main: mainPart, pm: pmPart };
  }

  global.logger?.error?.("[STAFF LIST] contenuto supera il limite Discord (2000)", {
    guildId: String(guild?.id || ""),
    mainLen: mainPart.length,
    pmLen: pmPart.length,
  });
  return { main: mainPart, pm: pmPart };
}

async function deleteStaffListMessages(mainMsg?, pmMsg?) {
  const tasks = [];
  if (pmMsg?.deletable) tasks.push(pmMsg.delete().catch(() => null));
  if (mainMsg?.deletable) tasks.push(mainMsg.delete().catch(() => null));
  if (tasks.length) await Promise.all(tasks);
}

async function pruneStaleStaffListMessages(channel?, client?, keepIds = []) {
  const keep = new Set((Array.isArray(keepIds) ? keepIds : []).map((id?) => String(id || "").trim()).filter(Boolean));
  const batch = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  const botId = String(client?.user?.id || "");
  if (!batch?.size || !botId) return 0;
  let removed = 0;
  for (const msg of batch.values()) {
    if (String(msg?.author?.id || "") !== botId) continue;
    if (keep.has(String(msg.id))) continue;
    const content = String(msg.content || "");
    if (!isMainStaffListMessageContent(content) && !isPmStaffListMessageContent(content)) continue;
    const ok = await msg.delete().catch(() => null);
    if (ok) removed += 1;
  }
  return removed;
}

async function sendStaffListParts(channel?, parts?, needsPmMessage?) {
  const sentMain = await channel.send(parts.main).catch((err?) => {
    global.logger?.error?.("[STAFF LIST] main channel.send failed:", err?.message || err, {
      code: err?.code,
      channelId: String(channel?.id || ""),
    });
    return null;
  });
  if (!sentMain) return { mainId: null, pmId: null };

  if (!needsPmMessage) return { mainId: sentMain.id, pmId: null };

  const sentPm = await channel.send(parts.pm).catch((err?) => {
    global.logger?.error?.("[STAFF LIST] pm channel.send failed:", err?.message || err, {
      code: err?.code,
      channelId: String(channel?.id || ""),
    });
    return null;
  });
  return { mainId: sentMain.id, pmId: sentPm?.id || null };
}

async function fetchChannelMessage(channel?, messageId?) {
  if (!messageId || !channel?.messages?.fetch) return null;
  const cached = channel.messages.cache?.get?.(messageId);
  if (cached) return cached;
  return channel.messages.fetch(messageId).catch(() => null);
}

async function resolveMessageChannel(client?, channel?) {
  if (!channel) return null;
  if (channel.messages?.fetch) return channel;
  const channelId = String(channel.id || "").trim();
  if (!channelId || !client) return null;
  const fetched =
    (await getClientChannelCached(client, channelId, { ttlMs: 0 }).catch(() => null)) ||
    (await client.channels?.fetch?.(channelId).catch(() => null));
  return fetched?.messages?.fetch ? fetched : null;
}

async function resolveStaffListMessages(channel?, client?, guildId?) {
  const state = ensureState(client);
  const gk = String(guildId ?? "").trim();
  if (!channel?.messages?.fetch) return { main: null, pm: null };
  const known = state.messageIdsByGuild.get(gk);
  if (Array.isArray(known) && known[0]) {
    const main = await fetchChannelMessage(channel, known[0]);
    const pm = known[1] ? await fetchChannelMessage(channel, known[1]) : null;
    if (main && (!known[1] || pm)) return { main, pm };
        if (main && known[1] && !pm) {
      state.messageIdsByGuild.set(gk, [main.id]);
      return { main, pm: null };
    }
    state.messageIdsByGuild.delete(gk);
  }

  const batch = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  const botId = client.user?.id;
  const candidates = batch
    ? [...batch.values()].filter(
        (m?) =>
          m.author?.id === botId &&
          (isMainStaffListMessageContent(m.content) || isPmStaffListMessageContent(m.content)),
      )
    : [];
  const mainMsg = pickNewestStaffListCandidate(candidates, (m?) => isMainStaffListMessageContent(m.content));
  const pmMsg = pickNewestStaffListCandidate(
    candidates,
    (m?) => m !== mainMsg && isPmStaffListMessageContent(m.content),
  );
  if (mainMsg && pmMsg) {
    state.messageIdsByGuild.set(gk, [mainMsg.id, pmMsg.id]);
  } else if (mainMsg) {
    state.messageIdsByGuild.set(gk, [mainMsg.id]);
  }
  return { main: mainMsg || null, pm: pmMsg || null };
}

async function fetchMembersForStaffList(guild?) {
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
      .catch((err?) => {
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

async function refreshStaffList(client?, guildId = IDs.guilds.main, opts: Record<string, any> = {}) {
  const { isDiscordStaffChannelPostsEnabled } = require("../../Web/discordWorkflowUiGate") as typeof import("../../Web/discordWorkflowUiGate");
  if (!isDiscordStaffChannelPostsEnabled()) return;
  const force = Boolean(opts?.force);
  const bootstrapOnly = Boolean(opts?.bootstrapOnly);
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
  let channel = guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId)) || (await getClientChannelCached(client, channelId));
  if (!channel?.isTextBased?.()) {
    global.logger?.error?.("[STAFF LIST] canale staff list assente o non testuale", {
      guildId: gidKey,
      channelId: String(channelId || ""),
      channelType: channel?.type ?? null,
    });
    return;
  }

  channel = (await resolveMessageChannel(client, channel)) || channel;
  if (!channel?.messages?.fetch) {
    global.logger?.error?.("[STAFF LIST] canale staff list senza message manager (canale parziale o tipo non supportato)", {
      guildId: gidKey,
      channelId: String(channel.id || channelId || ""),
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
  await hydrateStaffListPersistedState(client, gidKey);

  let { main: mainMsg, pm: pmMsg } = await resolveStaffListMessages(channel, client, gidKey);
  const preferSplit = Boolean(mainMsg && pmMsg);

  const membersSource = await fetchMembersForStaffList(guild);
  const [newBadgeRoleIdsByUser, pausedUserIds] = await Promise.all([
    getStaffListNewBadgeRoleIdsByUser(guild.id),
    getStaffListPausedUserIds(guild.id),
  ]);
  const parts = buildStaffListParts(guild, membersSource, newBadgeRoleIdsByUser, { preferSplit }, pausedUserIds);
  const serial = buildStaffListSerial(parts);
  const needsPmMessage = Boolean(String(parts.pm || "").trim());

  if (bootstrapOnly && !force) {
    if (mainMsg && (!needsPmMessage || pmMsg)) {
      if (staffListContentMatches(mainMsg.content, pmMsg?.content || "", parts)) {
        const syncedIds = needsPmMessage ? [mainMsg.id, pmMsg.id] : [mainMsg.id];
        state.messageIdsByGuild.set(gidKey, syncedIds);
        state.contentHashByGuild.set(gidKey, serial);
        await persistStaffListSyncState(gidKey, serial, syncedIds);
        return;
      }
    }
  }

  if (parts.main.trim() === "## STAFF LIST") {
    const staffRoleIds = STAFF_LIST_SECTION_ROLE_IDS.slice().reverse();
    const roleDebug = staffRoleIds.map((roleId?) => {
      const role = guild.roles.cache.get(roleId);
      if (!role) return { roleId, name: null, memberCount: 0 };
      const count = Array.from(iterMembers(membersSource)).filter((m?: any) => m?.roles?.cache?.has?.(roleId)).length;
      return { roleId, name: role.name, memberCount: count };
    });
    global.logger?.error?.("[STAFF LIST] Empty content debug", {
      guildId: guild.id,
      guildName: guild.name,
      staffRoles: roleDebug,
    });
  }

  if (!mainMsg) {
    state.contentHashByGuild.delete(gidKey);
  }

  const previousHash = state.contentHashByGuild.get(gidKey);
    const contentAlreadySynced =
    mainMsg &&
    staffListContentEquals(mainMsg.content, parts.main) &&
    (!needsPmMessage || (pmMsg && staffListContentEquals(pmMsg.content, parts.pm)));

  if (contentAlreadySynced) {
    const syncedIds = needsPmMessage ? [mainMsg.id, pmMsg?.id].filter(Boolean) : [mainMsg.id];
    state.messageIdsByGuild.set(gidKey, syncedIds);
    state.contentHashByGuild.set(gidKey, serial);
    await persistStaffListSyncState(gidKey, serial, syncedIds);
    return;
  }

  if (!force && previousHash === serial && mainMsg && (!needsPmMessage || pmMsg)) {
    const syncedIds = needsPmMessage ? [mainMsg.id, pmMsg?.id].filter(Boolean) : [mainMsg.id];
    state.messageIdsByGuild.set(gidKey, syncedIds);
    await persistStaffListSyncState(gidKey, serial, syncedIds);
    return;
  }

  const maxLen = STAFF_LIST_DISCORD_MAX;
  if (parts.main.length > maxLen || (needsPmMessage && parts.pm.length > maxLen)) {
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

  const mainChanged = !mainMsg || !staffListContentEquals(mainMsg.content, parts.main);
  const pmChanged =
    needsPmMessage && (!pmMsg || !staffListContentEquals(pmMsg.content, parts.pm));

  async function resendStaffListTogether() {
    await deleteStaffListMessages(mainMsg, pmMsg);
    await pruneStaleStaffListMessages(channel, client, []);
    state.messageIdsByGuild.delete(gidKey);
    const sent = await sendStaffListParts(channel, parts, needsPmMessage);
    mainId = sent.mainId;
    pmId = sent.pmId;
  }

  async function editOrResendMain() {
    if (!mainMsg) return false;
    const edited = await mainMsg.edit(parts.main).catch((err?) => {
      global.logger?.error?.("[STAFF LIST] main message.edit failed:", err?.message || err, {
        code: err?.code,
        guildId: gidKey,
      });
      return null;
    });
    if (edited) {
      mainId = edited.id;
      return true;
    }
    return false;
  }

  if (!mainMsg) {
    const sent = await sendStaffListParts(channel, parts, needsPmMessage);
    mainId = sent.mainId;
    pmId = sent.pmId;
  } else if (needsPmMessage && !pmMsg) {
        const mainOk = mainChanged ? await editOrResendMain() : true;
    if (!mainOk) {
      await resendStaffListTogether();
    } else {
      if (!mainChanged) mainId = mainMsg.id;
      const sentPm = await channel.send(parts.pm).catch((err?) => {
        global.logger?.error?.("[STAFF LIST] pm channel.send failed:", err?.message || err, {
          code: err?.code,
          channelId: String(channel?.id || ""),
        });
        return null;
      });
      pmId = sentPm?.id || null;
      if (!pmId) {
                await resendStaffListTogether();
      }
    }
  } else if (needsPmMessage && (mainChanged || pmChanged)) {
    if (mainChanged) {
      const mainOk = await editOrResendMain();
      if (!mainOk) {
        await resendStaffListTogether();
      } else {
        if (pmChanged && pmMsg) {
          const editedPm = await pmMsg.edit(parts.pm).catch((err?) => {
            global.logger?.warn?.("[STAFF LIST] pm message.edit failed:", err?.message || err);
            return null;
          });
          if (!editedPm) await resendStaffListTogether();
          else pmId = editedPm.id;
        } else if (pmMsg) {
          pmId = pmMsg.id;
        }
      }
    } else if (pmChanged && pmMsg) {
      const editedPm = await pmMsg.edit(parts.pm).catch((err?) => {
        global.logger?.warn?.("[STAFF LIST] pm message.edit failed:", err?.message || err);
        return null;
      });
      if (editedPm) {
        mainId = mainMsg.id;
        pmId = editedPm.id;
      } else {
        await resendStaffListTogether();
      }
    }
  } else if (mainChanged) {
    const mainOk = await editOrResendMain();
    if (!mainOk) {
      await deleteStaffListMessages(mainMsg, pmMsg);
      const sent = await channel.send(parts.main).catch(() => null);
      if (sent) mainId = sent.id;
    }
    if (pmMsg) {
      await pmMsg.delete().catch((err?) => {
        global.logger?.warn?.("[STAFF LIST] pm message.delete failed:", err?.message || err);
      });
    }
  } else {
    mainId = mainMsg.id;
    if (needsPmMessage && pmMsg) pmId = pmMsg.id;
  }

  if (mainId && (!needsPmMessage || pmId)) {
    state.messageIdsByGuild.set(gidKey, needsPmMessage ? [mainId, pmId] : [mainId]);
    synced = true;
  } else if (!mainId || (needsPmMessage && !pmId)) {
    global.logger?.error?.("[STAFF LIST] sync incompleto (manca main o pm)", {
      guildId: gidKey,
      channelId: String(channelId || ""),
      mainId: mainId || null,
      pmId: pmId || null,
      needsPmMessage,
    });
  }

  if (synced) {
    state.contentHashByGuild.set(gidKey, serial);
    const syncedIds = state.messageIdsByGuild.get(gidKey) || (needsPmMessage ? [mainId, pmId] : [mainId]);
    await persistStaffListSyncState(gidKey, serial, syncedIds);
    const pruned = await pruneStaleStaffListMessages(channel, client, syncedIds);
    if (pruned > 0) {
      global.logger?.info?.("[STAFF LIST] removed stale messages:", { guildId: gidKey, pruned });
    }
  }
  } finally {
    client._staffListRefreshInFlight = false;
  }
}

function startStaffListPeriodicRefreshLoop(client?) {
  const { isDiscordStaffChannelPostsEnabled } = require("../../Web/discordWorkflowUiGate") as typeof import("../../Web/discordWorkflowUiGate");
  if (!isDiscordStaffChannelPostsEnabled()) return;
  if (!client || client._staffListPeriodicRefreshStarted) return;
  client._staffListPeriodicRefreshStarted = true;
    scheduleStaffListRefresh(client, IDs.guilds.main, STAFF_LIST_STARTUP_REFRESH_MS, { bootstrapOnly: true });
}

function scheduleStaffListRefresh(client?, guildId = IDs.guilds.main, delayMs = 500, opts: Record<string, any> = {}) {
  const { isDiscordStaffChannelPostsEnabled } = require("../../Web/discordWorkflowUiGate") as typeof import("../../Web/discordWorkflowUiGate");
  if (!isDiscordStaffChannelPostsEnabled()) return;
  const state = ensureState(client);
  const gidKey = String(guildId ?? IDs.guilds.main ?? "").trim();
  if (!gidKey) return;
  const existingTimer = state.timersByGuild.get(gidKey);
  if (existingTimer) clearTimeout(existingTimer);

  const timer = setTimeout(() => {
    state.timersByGuild.delete(gidKey);
    refreshStaffList(client, gidKey, opts).catch((err?) => {
      global.logger.error("[STAFF LIST] refresh failed:", err);
    });
  }, delayMs);
  timer.unref?.();

  state.timersByGuild.set(gidKey, timer);
}

function queueStaffListRefreshAfterRoleMutation(client?, guildId = IDs.guilds.main) {
  const gid = String(guildId || "").trim();
  if (!client?.guilds || !gid) return;
  const mainGid = String(IDs.guilds?.main || "").trim();
  if (mainGid && gid !== mainGid) return;
  scheduleStaffListRefresh(client, gid, 750);
}

export = {
  STAFF_NEW_EMOJI,
  STAFF_PAUSE_EMOJI,
  STAFF_LIST_SECTION_ROLE_IDS,
  STAFF_ROLE_IDS,
  memberHasStaffRole,
  didStaffMembershipChange,
  didStaffListDisplayRolesChange,
  getStaffListPausedUserIds,
  getStaffListNewBadgeRoleIdsByUser,
  fetchMembersForStaffList,
  refreshStaffList,
  scheduleStaffListRefresh,
  queueStaffListRefreshAfterRoleMutation,
  startStaffListPeriodicRefreshLoop,
};