const { channelAllowsMedia, hasMediaPermission, isDiscordInviteLinkMessage, isMediaMessage } = require("./officialMessageAutomationMedia") as typeof import("./officialMessageAutomationMedia");
const { getCachedOrFetchMember } = require("./officialMessageAutomationMemberCache") as typeof import("./officialMessageAutomationMemberCache");
const { handleMovieNightVoteMessage } = require("./officialMessageAutomationMovieNight") as typeof import("./officialMessageAutomationMovieNight");
const { handleDisboardBump, handleDiscadiaBump } = require("./officialMessageAutomationBumps") as typeof import("./officialMessageAutomationBumps");
const { handleVoteManagerMessage, processDiscadiaVote } = require("./officialMessageAutomationVotes") as typeof import("./officialMessageAutomationVotes");
const { handlePauseChannelMessage, handleSanzioniChannelMessage } = require("./officialMessageAutomationModChannels") as typeof import("./officialMessageAutomationModChannels");
const { processRecentVoteChannelMessages, processRecentCommandsChannelMessages, processAllRecentAutomationMessages } = require("./officialMessageAutomationStartup") as typeof import("./officialMessageAutomationStartup");

export = { channelAllowsMedia, getCachedOrFetchMember, handleDisboardBump, handleDiscadiaBump, handlePauseChannelMessage, handleSanzioniChannelMessage, handleMovieNightVoteMessage, handleVoteManagerMessage, hasMediaPermission, isDiscordInviteLinkMessage, isMediaMessage, processRecentVoteChannelMessages, processRecentCommandsChannelMessages, processAllRecentAutomationMessages, processDiscadiaVote };
