const axios = require("axios");
const IDs = require("../../Utils/Config/ids");
const { isVoteListingRecordedAtOrAfter } = require("./bumpService");
const { processDiscadiaVote } = require("../../Utils/Message/officialMessageAutomationHandlers");

const TOPGG_VOTES_API = "https://top.gg/api/v1/projects/@me/votes";
const DEFAULT_LOOKBACK_HOURS = 72;
const MAX_PAGES = 25;

function shouldRunTopggVoteRecoveryOnStartup(client) {
  const env = String(process.env.TOPGG_VOTE_RECOVERY_ON_STARTUP || "").trim().toLowerCase();
  if (["0", "false", "no", "off"].includes(env)) return false;
  if (["1", "true", "yes", "on"].includes(env)) return true;
  if (client?.config?.topgg?.voteRecoveryOnStartup === false) return false;
  return true;
}

function resolveLookbackMs(client) {
  const raw = Number(client?.config?.topgg?.voteRecoveryLookbackHours ?? DEFAULT_LOOKBACK_HOURS);
  const hours = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_LOOKBACK_HOURS;
  return hours * 60 * 60 * 1000;
}

async function topggGet(url, token) {
  return axios.get(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 20_000,
    validateStatus: () => true,
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchRecentTopggVotes(token, lookbackMs) {
  const cutoff = Date.now() - lookbackMs;
  const startDate = new Date(cutoff).toISOString();
  const collected = [];
  let cursor = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL(TOPGG_VOTES_API);
    if (cursor) {
      url.searchParams.set("cursor", cursor);
    } else {
      url.searchParams.set("startDate", startDate);
    }

    let res = await topggGet(url, token);
    // 5xx = outage Top.gg: un retry breve, poi soft-skip
    if (res.status >= 500 && res.status < 600) {
      await sleep(2500);
      res = await topggGet(url, token);
    }

    if (res.status !== 200) {
      const detail =
        res.data && typeof res.data === "object"
          ? JSON.stringify(res.data).slice(0, 240)
          : String(res.data || "").slice(0, 240);
      const kind = res.status >= 500 ? "upstream_5xx" : "api_error";
      return {
        votes: collected,
        error: `${kind}_${res.status}${detail ? `:${detail}` : ""}`,
      };
    }

    const rows = Array.isArray(res.data?.data) ? res.data.data : [];
    let reachedCutoff = false;

    for (const row of rows) {
      const userId = String(row?.platform_id || row?.user_id || "").trim();
      const createdAtMs = new Date(row?.created_at || "").getTime();
      if (!userId || !/^\d{17,22}$/.test(userId) || !Number.isFinite(createdAtMs)) continue;
      if (createdAtMs < cutoff) {
        reachedCutoff = true;
        break;
      }
      collected.push({ userId, createdAtMs });
    }

    if (reachedCutoff || !rows.length) break;
    cursor = String(res.data?.cursor || "").trim() || null;
    if (!cursor) break;
  }

  collected.sort((a, b) => a.createdAtMs - b.createdAtMs);
  return { votes: collected, error: null };
}

async function recoverMissedTopggVotesOnStartup(client) {
  if (!shouldRunTopggVoteRecoveryOnStartup(client)) {
    return { skipped: true, reason: "disabled" };
  }

  const token = String(process.env.TOPGG_API_TOKEN || "").trim();
  if (!token) {
    global.logger?.warn?.(
      "[TOPGG VOTE RECOVERY] Saltato: manca TOPGG_API_TOKEN nel .env (API Top.gg → token). I voti persi mentre il webhook era offline non possono essere recuperati automaticamente.",
    );
    return { skipped: true, reason: "no_token" };
  }

  const guildId = String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
  if (!guildId) return { skipped: true, reason: "no_guild" };

  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return { skipped: true, reason: "guild_not_found" };

  const lookbackMs = resolveLookbackMs(client);
  const { votes, error } = await fetchRecentTopggVotes(token, lookbackMs);
  if (error) {
    const upstream = String(error).startsWith("upstream_5xx");
    global.logger?.[upstream ? "info" : "warn"]?.(
      upstream
        ? `[TOPGG VOTE RECOVERY] Top.gg down (${error}) — recovery saltata, webhook resta attivo`
        : `[TOPGG VOTE RECOVERY] API Top.gg non disponibile: ${error}`,
    );
    return { skipped: true, reason: error };
  }

  let recovered = 0;
  let skipped = 0;
  let failed = 0;

  for (const vote of votes) {
    const already = await isVoteListingRecordedAtOrAfter(guildId, vote.userId, "topgg", vote.createdAtMs);
    if (already) {
      skipped += 1;
      continue;
    }

    const user = await client.users.fetch(vote.userId).catch(() => null);
    if (!user) {
      failed += 1;
      continue;
    }

    const ok = await processDiscadiaVote(guild, user, client, { voteListing: "topgg" });
    if (ok) {
      recovered += 1;
    } else {
      failed += 1;
    }
  }

  return { recovered, skipped, failed, scanned: votes.length };
}

module.exports = {
  recoverMissedTopggVotesOnStartup,
  shouldRunTopggVoteRecoveryOnStartup,
};
