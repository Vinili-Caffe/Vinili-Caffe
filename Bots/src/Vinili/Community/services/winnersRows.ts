/** Vincitori attività: righe di attività del periodo e classifiche. */
const { VOICE_EXP_PER_MINUTE } = require("../../Level/services/expService") as typeof import("../../Level/services/expService");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { isChannelInTicketCategory } = require("../../../MultiGuild/tickets/discord/ticketCategoryUtils") as typeof import("../../../MultiGuild/tickets/discord/ticketCategoryUtils");
const { getGuildRoleCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { getLastSunday21BoundaryMsAtOrBefore, buildLast7DaysHourKeys, buildCalendarMonthHourKeys, buildLastHoursHourKeys, hourKeyToBoundsMs, overlapRangeMs } = require("./winnersTime") as typeof import("./winnersTime");

const REQUIRED_MEMBER_ROLE_ID = String(IDs.roles.Member || "");
const WEEKLY_WINNERS_EXCLUDED_ROLE_IDS = new Set( [IDs.roles.Staff, IDs.roles.HighStaff, IDs.roles.Helper, IDs.roles.Mod, IDs.roles.SeniorModerator, IDs.roles.Director, IDs.roles.Admin, IDs.roles.Manager, IDs.roles.Founder].filter(Boolean).map((id?) => String(id)));
const BACKFILL_HOUR_SUFFIX = "T12";

function shouldSkipBackfillRow(hourKey?, hourSet?) {
  if (!hourKey || typeof hourKey !== "string") return false;
  if (!hourKey.endsWith(BACKFILL_HOUR_SUFFIX)) return false;
  const dateKey = hourKey.slice(0, -BACKFILL_HOUR_SUFFIX.length);
  return [...hourSet].some((k?) => k.startsWith(`${dateKey}T`) && k !== hourKey);
}

function wasStaffDuringWeeklyActivityWindow(staff?, weekPeriodStartMs?, weekPeriodEndMs?, trackedStaffRoleIds?, staffRolesHistoryRetention?) {
  const set =
    trackedStaffRoleIds instanceof Set
      ? trackedStaffRoleIds
      : new Set((Array.isArray(trackedStaffRoleIds) ? trackedStaffRoleIds : []).map((id?) => String(id)).filter(Boolean));
  const start = Number(weekPeriodStartMs);
  const end = Number(weekPeriodEndMs);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return false;
  const isStaffRole = (roleId?) => {
    const id = String(roleId || "").trim();
    return Boolean(id && set.has(id));
  };
  const fromStaff = Array.isArray(staff?.rolesHistory) ? staff.rolesHistory : [];
  const fromRetention = Array.isArray(staffRolesHistoryRetention) ? staffRolesHistoryRetention : [];
  const history = [...fromStaff, ...fromRetention].sort((a?, b?) => new Date(a?.date || 0).getTime() - new Date(b?.date || 0).getTime());
  let roleAtPeriodStart = null;
  for (const row of history) {
    const t = new Date(row?.date || 0).getTime();
    if (Number.isNaN(t)) continue;
    if (t >= start) break;
    if (row?.newRole != null) roleAtPeriodStart = String(row.newRole);
  }
  if (isStaffRole(roleAtPeriodStart)) return true;
  for (const row of history) {
    const t = new Date(row?.date || 0).getTime();
    if (Number.isNaN(t) || t < start) continue;
    if (t > end) break;
    if (isStaffRole(row?.newRole)) return true;
  }
  return false;
}

function effectiveMinigameWeeklyScoreForRankWeek(doc?, rankWeekKey?) {
  const rk = String(rankWeekKey || "").trim();
  if (!rk) return 0;
  const mg = doc?.profile?.totals?.exp?.minigame || {};
  const weekKey = String(mg.weeklyKey || "").trim();
  const prevKey = String(mg.prevWeekKey || "").trim();
  const weekExp = Math.max(0, Math.floor(Number(mg.weeklyExp || 0)));
  const prevExp = Math.max(0, Math.floor(Number(mg.prevWeekExp || 0)));
  /* Dopo resetWeekly: weeklyKey può restare/coincidere con la settimana chiusa e weeklyExp
     è 0 o punti della settimana nuova. Il podio della settimana annunciata è in prevWeek*. */
  if (prevKey === rk && prevExp > 0) return prevExp;
  if (weekKey === rk && weekExp > 0) return weekExp;
  if (prevKey === rk) return prevExp;
  if (weekKey === rk) return weekExp;
  return 0;
}

async function loadMonthlyRowsFromRomeCalendarMonth(guild?, year?, month1to12?) {
  const eligible = await getEligibleChannelSets(guild);
  const hourKeys = buildCalendarMonthHourKeys(year, month1to12);
  return loadRowsFromHourlyWindowByHourKeys(guild, eligible, hourKeys);
}

async function resolveMemberRole(guild?) {
  if (!guild) return null;
  if (REQUIRED_MEMBER_ROLE_ID) {
    const role = guild.roles.cache.get(REQUIRED_MEMBER_ROLE_ID) || (await getGuildRoleCached(guild, REQUIRED_MEMBER_ROLE_ID));
    if (role) return role;
  }
  return guild.roles.everyone || null;
}

async function ensureGuildChannelsCached(guild?) {
  if (!guild?.channels?.cache) return;
  if (guild.channels.cache.size > 0) return;
  if (typeof guild.channels.fetch !== "function") return;
  /* bot-workers / site-api: guild lite senza canali → senza fetch la top weekly resta a 0 */
  await guild.channels.fetch().catch((err?) => {
    global.logger?.warn?.("[HOURLY WINDOW] guild.channels.fetch failed:", err?.message || err);
  });
}

async function getEligibleChannelSets(guild?) {
  await ensureGuildChannelsCached(guild);
  const role = await resolveMemberRole(guild);
  if (!role) return { text: new Set(), voice: new Set() };
  const excludedChannelIds = new Set(
    [IDs.channels?.ticket, IDs.channels?.ticketLogs]
      .filter(Boolean)
      .map((id?) => String(id)),
  );
  const excludedCategoryIds = new Set(
    [IDs.categories?.categoryPrivate]
      .filter(Boolean)
      .map((id?) => String(id)),
  );
  const text = new Set();
  const voice = new Set();
  for (const channel of guild.channels.cache.values()) {
    if (excludedChannelIds.has(String(channel?.id || ""))) continue;
    if (excludedCategoryIds.has(String(channel?.id || ""))) continue;
    if (excludedCategoryIds.has(String(channel?.parentId || ""))) continue;
    if (isChannelInTicketCategory(channel)) continue;
    const perms = channel?.permissionsFor?.(role);
    if (!perms?.has("ViewChannel")) continue;
    if (perms.has("SendMessages")) text.add(String(channel.id));
    if (perms.has("Connect") && perms.has("Speak")) voice.add(String(channel.id));
  }
  return { text, voice };
}

async function loadWeeklyRowsFromHourlyWindow(guild?, anchorDate = new Date()) {
  const eligible = await getEligibleChannelSets(guild);
  /* eligible vuoto → loadRows usa totali riga (niente early return a zero) */
  const endMs = getLastSunday21BoundaryMsAtOrBefore(anchorDate);
  const hourKeys = buildLast7DaysHourKeys(endMs);
  return loadRowsFromHourlyWindowByHourKeys(guild, eligible, hourKeys);
}

async function loadRowsFromHourlyWindowByHourKeys(guild?, eligible?, hourKeys?, clipRange = null) {
  const keys = [...new Set((hourKeys || []).map((k?) => String(k || "").trim()).filter(Boolean))];
  if (!keys.length || !guild?.id) return [];
  const clipStart = Number(clipRange?.startMs);
  const clipEnd = Number(clipRange?.endMs);
  const hasClip = Number.isFinite(clipStart) && Number.isFinite(clipEnd) && clipEnd > clipStart;
  const wanted = new Set(keys);
  const filterByChannel = Boolean(eligible?.text?.size || eligible?.voice?.size);
  const perUser = new Map();
  try {
    /* compact (prod): ActivityGuildHourly; dual/legacy: anche profile.totals.hourly */
    const { loadHourlyRows } = require("./activityRows") as typeof import("./activityRows");
    const hourlyRows = await loadHourlyRows(guild.id, keys);
    for (const row of hourlyRows || []) {
      const userId = String(row?.userId || "");
      if (!userId) continue;
      const hourKey = String(row?.hourKey || "");
      if (hourKey && !wanted.has(hourKey)) continue;
      if (hourKey && shouldSkipBackfillRow(hourKey, wanted)) continue;
      let scale = 1;
      if (hasClip && hourKey) {
        const bounds = hourKeyToBoundsMs(hourKey);
        const overlap = overlapRangeMs(bounds.startMs, bounds.endMs, clipStart, clipEnd);
        if (overlap <= 0) continue;
        scale = overlap / (60 * 60 * 1000);
      }
      let messageCount = 0;
      let voiceSeconds = 0;
      if (filterByChannel) {
        for (const [channelId, raw] of extractMapEntries(row?.textChannels)) {
          if (!eligible.text.has(String(channelId))) continue;
          messageCount += Math.max(0, Number(raw || 0)) * scale;
        }
        for (const [channelId, raw] of extractMapEntries(row?.voiceChannels)) {
          if (!eligible.voice.has(String(channelId))) continue;
          voiceSeconds += Math.max(0, Number(raw || 0)) * scale;
        }
      } else {
        /* canali non disponibili (REST senza cache): come leaderboard weekly, usa i totali riga */
        messageCount = Math.max(0, Number(row?.textCount || 0)) * scale;
        voiceSeconds = Math.max(0, Number(row?.voiceSeconds || 0)) * scale;
      }
      if (messageCount <= 0 && voiceSeconds <= 0) continue;
      const current = perUser.get(userId) || { userId, messageCount: 0, voiceSeconds: 0 };
      current.messageCount += messageCount;
      current.voiceSeconds += voiceSeconds;
      perUser.set(userId, current);
    }
  } catch (eLoad) {
    global.logger?.error?.("[HOURLY WINDOW] loadRows failed:", eLoad?.message || eLoad);
    return [];
  }
  return Array.from(perUser.values()).map((row?) => ({
    userId: row.userId,
    messageCount: Math.max(0, Math.floor(row.messageCount)),
    voiceExp: Math.max(0, Math.floor((Math.max(0, row.voiceSeconds) / 60) * VOICE_EXP_PER_MINUTE)),
  }));
}

async function loadDailyRowsFromHourlyWindow(guild?, anchorDate = new Date()) {
  const eligible = await getEligibleChannelSets(guild);
  const endMs = anchorDate instanceof Date ? anchorDate.getTime() : Date.now();
  const hourKeys = buildLastHoursHourKeys(endMs, 24);
  return loadRowsFromHourlyWindowByHourKeys(guild, eligible, hourKeys);
}

function extractMapEntries(raw?) {
  if (!raw) return [];
  if (raw instanceof Map) return Array.from(raw.entries());
  if (typeof raw === "object") return Object.entries(raw);
  return [];
}

async function resolveTopThreeUsers(client?, guild?, docs?, valueGetter?, limit = 3, excludedRoleIds = WEEKLY_WINNERS_EXCLUDED_ROLE_IDS) {
  const cap = Math.max(1, Math.min(25, Number(limit) || 3));
  const excludedSet =
    excludedRoleIds instanceof Set
      ? excludedRoleIds
      : new Set((Array.isArray(excludedRoleIds) ? excludedRoleIds : []).map((id?) => String(id)).filter(Boolean));
  const out = [];
  for (const doc of docs) {
    if (out.length >= cap) break;
    const userId = String(doc.userId || "");
    if (!userId) continue;
    let user = client.users.cache.get(userId) || null;
    if (!user) user = await client.users.fetch(userId).catch(() => null);
    if (!user || user.bot) continue;
    const member = guild.members.cache.get(userId) || (await guild.members.fetch(userId).catch(() => null));
    if (!member) continue;
    if (REQUIRED_MEMBER_ROLE_ID && !member.roles.cache.has(REQUIRED_MEMBER_ROLE_ID)) continue;
    const hasExcludedRole = Array.from(excludedSet).some((roleId?) => member.roles.cache.has(roleId));
    if (hasExcludedRole) continue;
    const value = Math.max(0, Math.floor(Number(valueGetter(doc) || 0)));
    if (value <= 0) continue;
    out.push({ userId, value });
  }
  return out;
}

async function resolveMinigameTopForced(client?, guild?, docs?, valueGetter?, limit = 10, excludedRoleIdsFirst = WEEKLY_WINNERS_EXCLUDED_ROLE_IDS) {
  const cap = Math.max(1, Math.min(25, Number(limit) || 10));
  let rows = await resolveTopThreeUsers(client, guild, docs, valueGetter, cap, excludedRoleIdsFirst);
  if (rows.length) return rows;
  rows = await resolveTopThreeUsers(client, guild, docs, valueGetter, cap, new Set());
  if (rows.length) return rows;
  const out = [];
  const list = Array.isArray(docs) ? docs : [];
  for (const doc of list) {
    if (out.length >= cap) break;
    const userId = String(doc?.userId || "");
    if (!userId) continue;
    const value = Math.max(0, Math.floor(Number(valueGetter(doc) || 0)));
    if (value <= 0) continue;
    const user = client.users.cache.get(userId) || (await client.users.fetch(userId).catch(() => null));
    if (!user || user.bot) continue;
    out.push({ userId, value });
  }
  return out;
}

function uniqueRankingByUserId(rows?, limit = 3) {
  const cap = Math.max(1, Math.min(25, Number(limit) || 3));
  const out = [];
  const seen = new Set();
  const list = Array.isArray(rows) ? rows : [];
  for (const row of list) {
    const userId = String(row?.userId || "").trim();
    if (!userId || seen.has(userId)) continue;
    out.push(row);
    seen.add(userId);
    if (out.length >= cap) break;
  }
  return out;
}

function deduplicateTopTwoLists(topA?, topB?, sortedA?, sortedB?, targetSize = 3) {
  const cap = Math.max(1, Math.min(25, Number(targetSize) || 3));
  const takeA = (topA || []).slice(0, cap);
  const takeB = (topB || []).slice(0, cap);
  const poolA = Array.isArray(sortedA) && sortedA.length ? sortedA : takeA;
  const poolB = Array.isArray(sortedB) && sortedB.length ? sortedB : takeB;
  const idsA = new Set(takeA.map((r?) => r?.userId).filter(Boolean));
  const idsB = new Set(takeB.map((r?) => r?.userId).filter(Boolean));
  const keptInA = new Set();
  const keptInB = new Set();
  for (const uid of idsA) {
    if (!idsB.has(uid)) {
      keptInA.add(uid);
      continue;
    }
    const rankA = takeA.findIndex((r?) => r?.userId === uid) + 1;
    const rankB = takeB.findIndex((r?) => r?.userId === uid) + 1;
    if (rankA <= rankB) keptInA.add(uid);
    else keptInB.add(uid);
  }
  for (const uid of idsB) {
    if (!idsA.has(uid)) keptInB.add(uid);
  }
  const resultA = [];
  const resultB = [];
  const usedInA = new Set();
  const usedInB = new Set();
  for (let i = 0; i < cap; i += 1) {
    if (i < takeA.length && keptInA.has(takeA[i].userId)) {
      resultA.push(takeA[i]);
      usedInA.add(takeA[i].userId);
    } else {
      for (const row of poolA) {
        if (!row?.userId || usedInA.has(row.userId) || keptInB.has(row.userId)) continue;
        resultA.push(row);
        usedInA.add(row.userId);
        break;
      }
    }
  }
  for (let i = 0; i < cap; i += 1) {
    if (i < takeB.length && keptInB.has(takeB[i].userId)) {
      resultB.push(takeB[i]);
      usedInB.add(takeB[i].userId);
    } else {
      for (const row of poolB) {
        if (!row?.userId || usedInB.has(row.userId) || keptInA.has(row.userId)) continue;
        resultB.push(row);
        usedInB.add(row.userId);
        break;
      }
    }
  }
  return { listA: resultA, listB: resultB };
}

export = { REQUIRED_MEMBER_ROLE_ID, WEEKLY_WINNERS_EXCLUDED_ROLE_IDS, wasStaffDuringWeeklyActivityWindow, effectiveMinigameWeeklyScoreForRankWeek, loadMonthlyRowsFromRomeCalendarMonth, loadWeeklyRowsFromHourlyWindow, loadRowsFromHourlyWindowByHourKeys, loadDailyRowsFromHourlyWindow, resolveTopThreeUsers, resolveMinigameTopForced, uniqueRankingByUserId, deduplicateTopTwoLists };
