const { shouldSyncOnStartup } = require("./discordAutomodKeywords") as typeof import("./discordAutomodKeywords");
const { shouldResyncAutomodForChannel } = require("./discordAutomodExemptCollect") as typeof import("./discordAutomodExemptCollect");
const {
  RULE_PREFIX,
  syncDiscordAutomodRulesForClient,
  scheduleDiscordAutomodRulesResync,
  resolveAutomodExecutionRule,
  mapRuleNameToViolationKey,
} = require("./discordAutomodSyncApply") as typeof import("./discordAutomodSyncApply");

export = {
  RULE_PREFIX,
  shouldSyncOnStartup,
  shouldResyncAutomodForChannel,
  syncDiscordAutomodRulesForClient,
  scheduleDiscordAutomodRulesResync,
  resolveAutomodExecutionRule,
  mapRuleNameToViolationKey,
};
