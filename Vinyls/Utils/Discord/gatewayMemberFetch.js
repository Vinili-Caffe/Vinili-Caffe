function isGatewayMemberListRateLimit(err) {
  if (!err) return false;
  if (err.name === "GatewayRateLimitError") return true;
  const op = err?.data?.opcode;
  const ra = Number(err?.data?.retry_after);
  return (op === 8 || op === "8") && Number.isFinite(ra) && ra > 0;
}

function gatewayMemberListRetryAfterSeconds(err) {
  const fromData = Number(err?.data?.retry_after);
  if (Number.isFinite(fromData) && fromData > 0) return fromData;
  const fromMsg = Number(String(err?.message || "").match(/Retry after ([\d.]+) seconds/i)?.[1] || 0);
  if (Number.isFinite(fromMsg) && fromMsg > 0) return fromMsg;
  return 12;
}

/**
 * @param {import("discord.js").Guild} guild
 * @param {{ maxAttempts?: number, onRateLimit?: (waitMs: number, attempt: number, maxAttempts: number) => void }} [opts]
 */
async function fetchGuildMembersRespectingGatewayRateLimit(guild, opts = {}) {
  const maxAttempts = Math.max(1, Number(opts.maxAttempts) || 15);
  const onRateLimit = typeof opts.onRateLimit === "function" ? opts.onRateLimit : null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await guild.members.fetch();
    } catch (err) {
      if (!isGatewayMemberListRateLimit(err) || attempt >= maxAttempts - 1) {
        throw err;
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
  fetchGuildMembersRespectingGatewayRateLimit,
};