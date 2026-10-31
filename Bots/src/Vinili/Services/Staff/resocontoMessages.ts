/** Resoconti settimanali: messaggi e thread su Discord (invio con nuovi tentativi, controllo doppioni). */
const { ChannelType } = require("discord.js") as typeof import("discord.js");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { aggregateSanctionsByModInWeek } = require("../../Utils/Moderation/modCaseStore") as typeof import("../../Utils/Moderation/modCaseStore");
const { getClientChannelCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { fetchGuildMembersRespectingGatewayRateLimit } = require("../../Utils/Discord/gatewayMemberFetch") as typeof import("../../Utils/Discord/gatewayMemberFetch");
const { addAllRoleMembersToThread, addUserIdsToThread } = require("../../Utils/Discord/threadRoleMembers") as typeof import("../../Utils/Discord/threadRoleMembers");
const { getResocontoReviewerUserIdsForSegment, getResocontoReviewerRoleIds } = require("../../Utils/Staff/resocontoAccess") as typeof import("../../Utils/Staff/resocontoAccess");
const { hasActiveAcceptedStaffPause, getTodayUtc } = require("../../Utils/Pause/pauseHandlersUtils") as typeof import("../../Utils/Pause/pauseHandlersUtils");
const { toSafeNumber } = require("./resocontoLimits") as typeof import("./resocontoLimits");
const { formatThreadDateTime } = require("./resocontoTime") as typeof import("./resocontoTime");
const { isGuildMemberCacheLikelyComplete, fetchGuildMembersByPagesForResoconto } = require("./resocontoActivity") as typeof import("./resocontoActivity");
const { getLatestAcceptedPause } = require("./resocontoPauses") as typeof import("./resocontoPauses");
const { STAFF_ROLE_PRIORITY, getPexHistoryRows, roleLabelById } = require("./resocontoMembers") as typeof import("./resocontoMembers");

const SANCTION_ACTIONS = new Set(["WARN", "MUTE", "KICK", "BAN"]);
const resocontoMemberHydrationStateByGuild = new Map();
const RESOCONTO_MEMBER_HYDRATE_TTL_MS = 2 * 60 * 1000;
const RESOCONTO_MESSAGE_SCAN_PAGE = 100;
const RESOCONTO_MESSAGE_SCAN_MAX = 2500;

function buildResocontoButtons(kind?, userId?, actionKey?, roleId = null) {
  const { buildInboxManageLinkRow } = require("../../Web/discordWorkflowUiGate") as typeof import("../../Web/discordWorkflowUiGate");
  return buildInboxManageLinkRow("resoconti");
}

async function sendResocontoThreadSummary(thread?, guild?, staffDoc?) {
  if (!thread?.isTextBased?.()) return;
  const lines = [];

  const latestPause = getLatestAcceptedPause(staffDoc);
  if (latestPause?.start && latestPause?.end) {
    lines.push(
      `<a:VC_Calendar:1482706208149475358> **Pausa:** iniziata il **${formatThreadDateTime(latestPause.start)}**, finita il **${formatThreadDateTime(latestPause.end)}**`,
    );
  }

  const positive = Math.max(0, Math.floor(toSafeNumber(staffDoc?.positiveCount)));
  const negative = Math.max(0, Math.floor(toSafeNumber(staffDoc?.negativeCount)));
  if (positive > 0 || negative > 0) {
    lines.push(`<:VC_Eye:1331619214410383381> **Valutazioni:** positive **${positive}**, negative **${negative}**`);
  }

  const warnCount = Math.max(0, Math.floor(toSafeNumber(staffDoc?.warnCount)));
  if (warnCount > 0) {
    lines.push(`<:VC_BanHammer:1482534474502897795> **Warn staff:** **${warnCount}**`);
  }

  const pexRows = getPexHistoryRows(staffDoc).slice(0, 5);
  if (pexRows.length > 0) {
    lines.push("<:success:1461731530333229226> **Storico PEX recente:**");
    for (const row of pexRows) {
      lines.push(
        `- ${formatThreadDateTime(row.when)} -> \`${roleLabelById(guild, row.oldRole)}\` -> \`${roleLabelById(guild, row.newRole)}\``,
      );
    }
  }

  if (!lines.length) return;
  await thread
    .send({
      content: lines.join("\n").slice(0, 1900),
    })
    .catch(() => null);
}

async function filterResocontoReviewersNotInPause(guildId?, reviewerUserIds?) {
  const gid = String(guildId || "").trim();
  const ids = [...new Set(
    (Array.isArray(reviewerUserIds) ? reviewerUserIds : [])
      .map((id?) => String(id || "").trim())
      .filter((id?) => /^\d{16,22}$/.test(id)),
  )];
  if (!gid || !ids.length) return [];

  const docs = await ActivityUserProfile.find(
    { guildId: gid, userId: { $in: ids } },
    { userId: 1, "staff.pauses": 1 },
  )
    .lean()
    .catch(() => []);

  const pausesByUserId = new Map();
  for (const doc of docs || []) {
    pausesByUserId.set(String(doc?.userId || ""), doc?.staff?.pauses);
  }

  const today = getTodayUtc();
  return ids.filter((uid?) => !hasActiveAcceptedStaffPause(pausesByUserId.get(uid), today));
}

async function createResocontoThread(message?, userId?, userLabel = null, staffDoc = null, segment = null, staffRoleId = null) {
  try {
    const { isDiscordWorkflowUiEnabled } = require("../../Web/discordWorkflowUiGate") as typeof import("../../Web/discordWorkflowUiGate");
    if (!isDiscordWorkflowUiEnabled()) return;
  } catch (_) {}
  if (!message?.startThread) return;
  const safeUserId = String(userId || "");
  if (!/^\d{16,20}$/.test(safeUserId)) return;
  const threadLabel = String(userLabel || safeUserId).trim().slice(0, 70) || safeUserId;

  const thread = await message.startThread({
    name: `Resoconto di ${threadLabel}`,
    autoArchiveDuration: 10080,
    type: ChannelType.PublicThread,
    reason: "Thread automatico resoconto staff/pm",
  })
    .catch(() => null);
  if (!thread?.isTextBased?.()) return;

  const guild = message?.guild;
  const reviewerUserIds = getResocontoReviewerUserIdsForSegment(segment, staffRoleId);
  if (guild && reviewerUserIds.length) {
    const activeReviewers = await filterResocontoReviewersNotInPause(guild.id, reviewerUserIds);
    if (activeReviewers.length) {
      await addUserIdsToThread(thread, activeReviewers, { logTag: "[WEEKLY STAFF RESOCONTO thread]" });
    }
  }
  for (const roleId of getResocontoReviewerRoleIds()) {
    await addAllRoleMembersToThread(thread, roleId, {
      logTag: "[WEEKLY STAFF RESOCONTO thread]",
    }).catch(() => null);
  }

  await sendResocontoThreadSummary(thread, message?.guild, staffDoc);
}

function countPmWeeklyPartners(staffDoc?, weekStart?, weekEnd?) {
  const actions = Array.isArray(staffDoc?.partnerActions) ? staffDoc.partnerActions : [];
  const weekStartMs = Number(weekStart.getTime());
  const weekEndMs = Number(weekEnd.getTime());
  let count = 0;
  for (const action of actions) {
    if (String(action?.action || "").toLowerCase() !== "create") continue;
    const when = action?.date ? new Date(action.date) : null;
    if (!when || Number.isNaN(when.getTime())) continue;
    const whenMs = when.getTime();
    if (whenMs >= weekStartMs && whenMs <= weekEndMs) count += 1;
  }
  return count;
}

async function getWeeklySanctionCountByMod(guildId?, weekStart?, weekEnd?) {
  return aggregateSanctionsByModInWeek(guildId, weekStart, weekEnd, SANCTION_ACTIONS);
}

async function resolveChannel(client?, channelId?) {
  if (!channelId) return null;
  return client.channels.cache.get(channelId) ||
    (await getClientChannelCached(client, String(channelId))) ||
    (await client.channels.fetch(String(channelId)).catch(() => null));
}

async function scanResocontoMessagesSince(channel?, sinceMs?, predicate?) {
  if (!channel?.messages?.fetch || typeof predicate !== "function") return false;
  let before = null;
  let scanned = 0;
  while (scanned < RESOCONTO_MESSAGE_SCAN_MAX) {
    const batch = await channel.messages
      .fetch({
        limit: RESOCONTO_MESSAGE_SCAN_PAGE,
        ...(before ? { before } : {}),
      })
      .catch(() => null);
    if (!batch?.size) break;
    for (const message of batch.values()) {
      scanned += 1;
      const ts = Number(message.createdTimestamp || 0);
      if (sinceMs && ts && ts < sinceMs) continue;
      if (predicate(message, String(message.content || ""))) return true;
    }
    const oldest = batch.last();
    if (sinceMs && oldest && Number(oldest.createdTimestamp || 0) < sinceMs) break;
    before = oldest?.id || null;
    if (!before || batch.size < RESOCONTO_MESSAGE_SCAN_PAGE) break;
  }
  return false;
}

function messageLooksLikeStaffResocontoForUser(content?, userId?, roleId = "") {
  const text = String(content || "");
  if (!text.includes("**Staffer:**")) return false;
  const uid = String(userId || "").trim();
  if (!text.includes(`<@${uid}>`) && !text.includes(`<@!${uid}>`)) return false;
  const rid = String(roleId || "").trim();
  if (rid && text.includes(`<@&${rid}>`)) return true;
  return STAFF_ROLE_PRIORITY.some((id?) => id && text.includes(`<@&${String(id)}>`));
}

async function recentStaffResocontoMessageExists(channel?, userId?, roleId?, sinceDate?) {
  const uid = String(userId || "").trim();
  const sinceMs = sinceDate instanceof Date ? sinceDate.getTime() : 0;
  if (!uid) return false;
  return scanResocontoMessagesSince(
    channel,
    sinceMs,
    (_message?, content?) => messageLooksLikeStaffResocontoForUser(content, uid, roleId),
  );
}

async function recentPmResocontoMessageExists(channel?, userId?, sinceDate?) {
  const uid = String(userId || "").trim();
  const sinceMs = sinceDate instanceof Date ? sinceDate.getTime() : 0;
  if (!uid) return false;
  return scanResocontoMessagesSince(channel, sinceMs, (_message?, content?) => {
    const text = String(content || "");
    if (!text.includes("**Partner Manager:**")) return false;
    return text.includes(`<@${uid}>`) || text.includes(`<@!${uid}>`);
  });
}

async function sendResocontoMessageWithRetry(channel?, payload?, context: Record<string, any> = {}) {
  if (!channel?.send) return null;
  const first = await channel.send(payload).catch((err?) => {
    global.logger?.warn?.("[WEEKLY STAFF RESOCONTO] send failed:", {
      userId: context.userId || null,
      segment: context.segment || null,
      err: err?.message || String(err),
      code: err?.code,
    });
    return null;
  });
  if (first) return first;
  await new Promise((resolve?) => setTimeout(resolve, 1500));
  return channel.send(payload).catch((err?) => {
    global.logger?.error?.("[WEEKLY STAFF RESOCONTO] send retry failed:", {
      userId: context.userId || null,
      segment: context.segment || null,
      err: err?.message || String(err),
      code: err?.code,
    });
    return null;
  });
}

async function hydrateGuildMembersForResoconto(guild?, segment?) {
  if (!guild?.members?.fetch) return false;
  const jobsDebug = String(process.env.DEBUG_JOBS || "").trim() === "1";
  const guildId = String(guild.id || "");
  const now = Date.now();
  const state = resocontoMemberHydrationStateByGuild.get(guildId);
  if (
    state?.lastOkAt &&
    now - Number(state.lastOkAt || 0) < RESOCONTO_MEMBER_HYDRATE_TTL_MS &&
    isGuildMemberCacheLikelyComplete(guild)
  ) {
    return true;
  }
  if (state?.promise) {
    return state.promise;
  }

  const promise = (async () => {
    let ok = false;
    await fetchGuildMembersRespectingGatewayRateLimit(guild, {
      maxAttempts: 12,
      onRateLimit: (waitMs?, attempt?, maxAttempts?) => {
        if (!jobsDebug) return;
        global.logger?.info?.(`[WEEKLY STAFF RESOCONTO] Member fetch rate-limited (${segment || "unknown"}), retry ${attempt}/${maxAttempts} in ~${Math.round(waitMs / 1000)}s.`);
      },
    })
      .then(() => {
        ok = true;
      })
      .catch((err?) => {
        global.logger?.warn?.(
          `[WEEKLY STAFF RESOCONTO] Member fetch failed (${segment || "unknown"}), trying paged fetch:`,
          err?.message || err,
        );
      });

    if (!isGuildMemberCacheLikelyComplete(guild)) {
      const fetched = await fetchGuildMembersByPagesForResoconto(guild, segment);
      ok = ok || fetched > 0;
    }

    if (ok || isGuildMemberCacheLikelyComplete(guild)) {
      resocontoMemberHydrationStateByGuild.set(guildId, { lastOkAt: Date.now(), promise: null });
      return true;
    }

    resocontoMemberHydrationStateByGuild.set(guildId, { lastOkAt: 0, promise: null });
    return false;
  })()
    .catch((err?) => {
      global.logger?.warn?.(`[WEEKLY STAFF RESOCONTO] Member hydration failed (${segment || "unknown"}):`, err?.message || err);
      resocontoMemberHydrationStateByGuild.set(guildId, { lastOkAt: 0, promise: null });
      return false;
    });

  resocontoMemberHydrationStateByGuild.set(guildId, { lastOkAt: Number(state?.lastOkAt || 0), promise });
  return promise;
}

export = { buildResocontoButtons, createResocontoThread, countPmWeeklyPartners, getWeeklySanctionCountByMod, resolveChannel, recentStaffResocontoMessageExists, recentPmResocontoMessageExists, sendResocontoMessageWithRetry, hydrateGuildMembersForResoconto };
