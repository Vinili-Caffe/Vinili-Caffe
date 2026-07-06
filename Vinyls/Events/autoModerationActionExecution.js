const { runDiscordNativeAutomodExecution } = require("../Services/Moderation/automodService");
const { RULE_PREFIX, resolveAutomodExecutionRule } = require("../Services/Moderation/discordAutomodRulesService");

module.exports = {
  name: "autoModerationActionExecution",
  async execute(execution) {
    try {
      const rule = await resolveAutomodExecutionRule(execution);
      const ruleName = String(rule?.name || "");
      if (!ruleName.startsWith(RULE_PREFIX)) return;
      await runDiscordNativeAutomodExecution(execution, rule);
    } catch (error) {
      global.logger?.error?.(
        "[autoModerationActionExecution]",
        error?.message || error,
      );
    }
  },
};