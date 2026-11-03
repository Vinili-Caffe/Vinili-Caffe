/** Attività: canali esclusi dal conteggio. */
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { isChannelInTicketCategory } = require("../../../MultiGuild/tickets/discord/ticketCategoryUtils") as typeof import("../../../MultiGuild/tickets/discord/ticketCategoryUtils");

const EXCLUDED_ACTIVITY_CHANNEL_IDS = new Set(
  [IDs.channels?.ticket, IDs.channels?.ticketLogs]
    .filter(Boolean)
    .map((id?) => String(id)),
);
const EXCLUDED_ACTIVITY_CATEGORY_IDS = new Set(
  []
    .filter(Boolean)
    .map((id?) => String(id)),
);

function resolveChannelFromLike(channelLike?) {
  if (!channelLike) return null;
  if (channelLike.parentId !== undefined || channelLike.type !== undefined) return channelLike;
  const guild = channelLike.guild || null;
  const id = String(channelLike.id || channelLike.channelId || "");
  if (!id) return null;
  return guild?.channels?.cache?.get(id) || null;
}

function isChannelInExcludedActivityCategory(channelLike?) {
  if (EXCLUDED_ACTIVITY_CATEGORY_IDS.size === 0) return false;
  const channel = resolveChannelFromLike(channelLike);
  if (!channel) return false;
  if (EXCLUDED_ACTIVITY_CATEGORY_IDS.has(String(channel.id || ""))) return true;
  const parentId = String(channel.parentId || "");
  if (parentId && EXCLUDED_ACTIVITY_CATEGORY_IDS.has(parentId)) return true;
  return false;
}

function isExcludedActivityChannel(channelLike?) {
  const channelId = String(channelLike?.id || channelLike?.channelId || "");
  if (channelId && EXCLUDED_ACTIVITY_CHANNEL_IDS.has(channelId)) return true;
  if (isChannelInTicketCategory(channelLike)) return true;
  if (isChannelInExcludedActivityCategory(channelLike)) return true;
  return false;
}

export = { isExcludedActivityChannel };
