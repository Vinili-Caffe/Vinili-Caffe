/** Resoconti settimanali: classificazione revisori e claim compito. */
const { getClientChannelCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { getResocontoCycleWeekKey } = require("./resocontoAutoValShared") as typeof import("./resocontoAutoValShared");

function parseResocontoReviewerTaskKey(keyStr?) {
  const m = /^resoconto_reviewer_task:([^:]+):([^:]+):(\d{17,20})$/.exec(String(keyStr || ""));
  if (!m) return null;
  return { weekKey: m[1], segment: m[2], userId: m[3] };
}

function hasResocontoReviewerTaskAutoEntry(staff, { weekKey, segment, userId, type, reason }) {
  const autoEntries = Array.isArray(staff?.autoValutazioni) ? staff.autoValutazioni : [];
  const reasonStr = String(reason || "");
  const seg = String(segment || "");
  const uid = String(userId || "");
  const wk = String(weekKey || "");
  return autoEntries.some((entry?) => {
    if (String(entry?.type || "") !== String(type || "")) return false;
    const parsed = parseResocontoReviewerTaskKey(String(entry?.key || ""));
    if (!parsed) return false;
    return (
      parsed.segment === seg &&
      parsed.userId === uid &&
      parsed.weekKey === wk &&
      String(entry?.reason || "") === reasonStr
    );
  });
}

async function classifyResocontoReviewerAutoEntry(guild?, entry?, expectedReason = "") {
  if (!entry) return "stale";
  if (entry.spentByTrade) return "spent";

  const parsed = parseResocontoReviewerTaskKey(String(entry?.key || ""));
  const currentWeekKey = getResocontoCycleWeekKey();
  if (parsed?.weekKey && parsed.weekKey !== currentWeekKey) return "stale";

    if (parsed?.weekKey && parsed.weekKey === currentWeekKey) {
    const channelId = String(entry.channelId || "");
    const messageId = String(entry.messageId || "");
    if (!channelId || !messageId || !guild) return "spent";

    const channel =
      guild.channels?.cache?.get(channelId) ||
      (await getClientChannelCached(guild.client, channelId).catch(() => null));
    if (!channel?.messages?.fetch) return "spent";

    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (!message) return "spent";

    const expected = String(expectedReason || entry?.reason || "").trim();
    if (!expected) return "active";
    const embedDesc = String(message.embeds?.[0]?.description || "");
    const embedTitle = String(message.embeds?.[0]?.title || "");
    const blob = `${embedTitle}\n${embedDesc}\n${String(message.content || "")}`;
    return blob.includes(expected) ? "active" : "spent";
  }

  return "stale";
}

function buildResocontoCompitoClaimId(weekKey?, segment?, userId?) {
  return `${String(weekKey || "").trim()}:${String(segment || "").trim()}:${String(userId || "").trim()}`;
}

function staffHasResocontoCompitoClaim(staff?, weekKey?, segment?, userId?) {
  const id = buildResocontoCompitoClaimId(weekKey, segment, userId);
  if (!id || id.startsWith("::") || id.endsWith(":")) return false;
  const rows = Array.isArray(staff?.resocontoCompitoClaims) ? staff.resocontoCompitoClaims : [];
  if (rows.some((row?) => {
    if (row == null) return false;
    if (typeof row === "string") return row === id;
    return String(row.id || row.key || "") === id;
  })) {
    return true;
  }
    const wk = String(weekKey || "");
  const uid = String(userId || "");
  if (!wk || !uid) return false;
  return (Array.isArray(staff?.autoValutazioni) ? staff.autoValutazioni : []).some((entry?) => {
    const parsed = parseResocontoReviewerTaskKey(String(entry?.key || ""));
    return Boolean(parsed && parsed.weekKey === wk && parsed.userId === uid);
  });
}

function rememberResocontoCompitoClaim(staff?, weekKey?, segment?, userId?) {
  if (!staff || typeof staff !== "object") return false;
  const id = buildResocontoCompitoClaimId(weekKey, segment, userId);
  if (!id || id.includes("::") || id.startsWith(":") || id.endsWith(":")) return false;
  if (staffHasResocontoCompitoClaim(staff, weekKey, segment, userId)) return false;
  if (!Array.isArray(staff.resocontoCompitoClaims)) staff.resocontoCompitoClaims = [];
  staff.resocontoCompitoClaims.push({
    id,
    weekKey: String(weekKey || ""),
    segment: String(segment || ""),
    userId: String(userId || ""),
    at: new Date(),
  });
    if (staff.resocontoCompitoClaims.length > 40) {
    staff.resocontoCompitoClaims = staff.resocontoCompitoClaims.slice(-40);
  }
  return true;
}

export = {
  parseResocontoReviewerTaskKey,
  hasResocontoReviewerTaskAutoEntry,
  classifyResocontoReviewerAutoEntry,
  staffHasResocontoCompitoClaim,
  rememberResocontoCompitoClaim,
};
