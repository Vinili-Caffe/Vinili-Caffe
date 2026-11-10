const { channelAllowsMedia, hasMediaPermission, isDiscordInviteLinkMessage, isMediaMessage } = require("./officialMessageAutomationMedia") as typeof import("./officialMessageAutomationMedia");
const { getCachedOrFetchMember } = require("./officialMessageAutomationMemberCache") as typeof import("./officialMessageAutomationMemberCache");
const { handleMovieNightVoteMessage } = require("./officialMessageAutomationMovieNight") as typeof import("./officialMessageAutomationMovieNight");
const { handleDisboardBump, handleDiscadiaBump } = require("./officialMessageAutomationBumps") as typeof import("./officialMessageAutomationBumps");
const { handleVoteManagerMessage, processDiscadiaVote } = require("./officialMessageAutomationVotes") as typeof import("./officialMessageAutomationVotes");
const { processRecentVoteChannelMessages, processRecentCommandsChannelMessages, processAllRecentAutomationMessages } = require("./officialMessageAutomationStartup") as typeof import("./officialMessageAutomationStartup");

/* interruttori dalla dashboard (Risposte automatiche → Automazioni del server): spenta = il messaggio passa oltre */
function gated<F extends (...args: any[]) => any>(key: string, fn: F): F {
  return (async (...args: any[]) => {
    const gid = String(args[0]?.guild?.id || args[0]?.guildId || "");
    try {
      const T = require("../../../MultiGuild/core/tenantCommunityTools") as typeof import("../../../MultiGuild/core/tenantCommunityTools");
      if (gid && !(await T.isAutomationEnabled(gid, key))) return false;
    } catch (_) {}
    return fn(...args);
  }) as unknown as F;
}

export = {
  channelAllowsMedia,
  getCachedOrFetchMember,
  handleDisboardBump: gated("bumpDisboard", handleDisboardBump),
  handleDiscadiaBump: gated("bumpDiscadia", handleDiscadiaBump),
  handleMovieNightVoteMessage: gated("movieNight", handleMovieNightVoteMessage),
  handleVoteManagerMessage: gated("votes", handleVoteManagerMessage),
  hasMediaPermission,
  isDiscordInviteLinkMessage,
  isMediaMessage,
  processRecentVoteChannelMessages,
  processRecentCommandsChannelMessages,
  processAllRecentAutomationMessages,
  processDiscadiaVote,
};
