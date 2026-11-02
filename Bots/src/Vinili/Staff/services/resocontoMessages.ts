/** Resoconti: helper DB/hydration. Post/thread Discord dismessi (inbox solo sito). */
const { aggregateSanctionsByModInWeek } = require("../../Moderation/utils/modCaseStore") as typeof import("../../Moderation/utils/modCaseStore");
const { fetchGuildMembersRespectingGatewayRateLimit } = require("../../Utils/Discord/gatewayMemberFetch") as typeof import("../../Utils/Discord/gatewayMemberFetch");
const { isGuildMemberCacheLikelyComplete, fetchGuildMembersByPagesForResoconto } = require("./resocontoActivity") as typeof import("./resocontoActivity");

const SANCTION_ACTIONS = new Set(["WARN", "MUTE", "KICK", "BAN"]);
const resocontoMemberHydrationStateByGuild = new Map();
const RESOCONTO_MEMBER_HYDRATE_TTL_MS = 2 * 60 * 1000;

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
  countPmWeeklyPartners,
  getWeeklySanctionCountByMod,
  hydrateGuildMembersForResoconto,
};
