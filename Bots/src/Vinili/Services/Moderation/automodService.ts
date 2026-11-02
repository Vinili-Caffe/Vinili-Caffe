/** Facade AutoMod: stessa API pubblica, implementazione nei moduli fratelli. */
const { runAutoModMessage } = require("./automodMessagePipeline") as typeof import("./automodMessagePipeline");
const { runDiscordNativeAutomodExecution } = require("./automodNativeExecution") as typeof import("./automodNativeExecution");
const { pingStaffForAutomodExecution } = require("./automodNative") as typeof import("./automodNative");
const { pingStaffAutomodAlert } = require("./automodEmbeds") as typeof import("./automodEmbeds");
const { getAutoModMemberSnapshot } = require("./automodBadUserTrack") as typeof import("./automodBadUserTrack");
const { isAutoModRoleExemptMember, isLikelyCommandMessage, isCrossServerForwardedMessage, isStaffZoneExemptChannel } = require("./automodExempt") as typeof import("./automodExempt");
const {
  getAutoModConfigSnapshot,
  getAutoModRulesSnapshot,
  updateAutoModConfig,
  getAutoModPanicSnapshot,
  triggerAutoModPanicExternal,
  clearAutoModPanicState,
} = require("./automodRuntime") as typeof import("./automodRuntime");
const { buildAutoModDecisionExplain } = require("./automodDecisions") as typeof import("./automodDecisions");
const { isNsfwUrl } = require("./automodHeat") as typeof import("./automodHeat");
const { isAutomodMediaEmbedUrl, detectScam, detectScamImageBait, buildModerationScanText } = require("./automodText") as typeof import("./automodText");

export = {
  runAutoModMessage,
  runDiscordNativeAutomodExecution,
  pingStaffForAutomodExecution,
  pingStaffAutomodAlert,
  getAutoModMemberSnapshot,
  isAutoModRoleExemptMember,
  getAutoModConfigSnapshot,
  getAutoModRulesSnapshot,
  updateAutoModConfig,
  getAutoModPanicSnapshot,
  triggerAutoModPanicExternal,
  clearAutoModPanicState,
  __test: {
    isLikelyCommandMessage,
    buildAutoModDecisionExplain,
    isAutomodMediaEmbedUrl,
    isNsfwUrl,
    isCrossServerForwardedMessage,
    detectScam,
    detectScamImageBait,
    buildModerationScanText,
    isStaffZoneExemptChannel,
  },
};
