/** Resoconti: helper DB/hydration. Post/thread/scan Discord dismessi (inbox solo sito). */
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { aggregateSanctionsByModInWeek } = require("../../Utils/Moderation/modCaseStore") as typeof import("../../Utils/Moderation/modCaseStore");
const { fetchGuildMembersRespectingGatewayRateLimit } = require("../../Utils/Discord/gatewayMemberFetch") as typeof import("../../Utils/Discord/gatewayMemberFetch");
const { isGuildMemberCacheLikelyComplete, fetchGuildMembersByPagesForResoconto } = require("./resocontoActivity") as typeof import("./resocontoActivity");

const SANCTION_ACTIONS = new Set(["WARN", "MUTE", "KICK", "BAN"]);
const resocontoMemberHydrationStateByGuild = new Map();
const RESOCONTO_MEMBER_HYDRATE_TTL_MS = 2 * 60 * 1000;

function buildResocontoButtons(_kind?, _userId?, _actionKey?, _roleId = null) {
  return null;
}

async function createResocontoThread(_message?, _userId?, _userLabel = null, _staffDoc = null, _segment = null, _staffRoleId = null) {
  return;
}

async function recentStaffResocontoMessageExists(_channel?, _userId?, _roleId?, _sinceDate?) {
  return false;
}

async function recentPmResocontoMessageExists(_channel?, _userId?, _sinceDate?) {
  return false;
}

async function sendResocontoMessageWithRetry(_channel?, _payload?, _meta?) {
  return null;
}

async function resolveChannel(_client?, _channelId?) {
  return null;
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

export = {
  buildResocontoButtons,
  createResocontoThread,
  countPmWeeklyPartners,
  getWeeklySanctionCountByMod,
  resolveChannel,
  recentStaffResocontoMessageExists,
  recentPmResocontoMessageExists,
  sendResocontoMessageWithRetry,
  hydrateGuildMembersForResoconto,
};
