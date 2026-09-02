function isGatewayMemberListRateLimit(err) {
  if (!err) return false;
  if (err.name === "GatewayRateLimitError") return true;
  const op = err?.data?.opcode;
  const ra = Number(err?.data?.retry_after);
  return (op === 8 || op === "8") && Number.isFinite(ra) && ra > 0;
}

function isGuildMembersTimeout(err) {
  if (!err) return false;
  if (err.code === "GuildMembersTimeout") return true;
  return /Members didn't arrive in time/i.test(String(err?.message || ""));
}

function gatewayMemberListRetryAfterSeconds(err) {
  const fromData = Number(err?.data?.retry_after);
  if (Number.isFinite(fromData) && fromData > 0) return fromData;
  const fromMsg = Number(String(err?.message || "").match(/Retry after ([\d.]+) seconds/i)?.[1] || 0);
  if (Number.isFinite(fromMsg) && fromMsg > 0) return fromMsg;
  return 12;
}

function resolveMemberFetchTimeoutMs(guild, opts = {}) {
  const explicit = Number(opts.time);
  if (Number.isFinite(explicit) && explicit > 0) return Math.floor(explicit);
  const count = Math.max(0, Number(guild?.memberCount || 0));
    const scaled = 180_000 + Math.ceil(count / 40) * 1000;
  return Math.min(900_000, Math.max(180_000, scaled));
}

async function fetchGuildMembersRespectingGatewayRateLimit(guild, opts = {}) {
  const maxAttempts = Math.max(1, Number(opts.maxAttempts) || 15);
  const onRateLimit = typeof opts.onRateLimit === "function" ? opts.onRateLimit : null;
  const onTimeout = typeof opts.onTimeout === "function" ? opts.onTimeout : null;
  let timeMs = resolveMemberFetchTimeoutMs(guild, opts);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await guild.members.fetch({ time: timeMs });
    } catch (err) {
      const canRetryRl = isGatewayMemberListRateLimit(err) && attempt < maxAttempts - 1;
      const canRetryTo = isGuildMembersTimeout(err) && attempt < maxAttempts - 1;
      if (!canRetryRl && !canRetryTo) throw err;

      if (canRetryTo) {
                timeMs = Math.min(900_000, Math.ceil(timeMs * 1.5));
        onTimeout?.(timeMs, attempt + 1, maxAttempts);
        await new Promise((r) => setTimeout(r, 1500 + Math.floor(Math.random() * 1000)));
        continue;
      }

      const retryAfterSec = gatewayMemberListRetryAfterSeconds(err);
      const waitMs = Math.ceil(retryAfterSec * 1000) + 250 + Math.floor(Math.random() * 400);
      onRateLimit?.(waitMs, attempt + 1, maxAttempts);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw new Error("fetch membri: tentativi esauriti");
}

module.exports = {
  isGatewayMemberListRateLimit,
  isGuildMembersTimeout,
  resolveMemberFetchTimeoutMs,
  fetchGuildMembersRespectingGatewayRateLimit,
};
