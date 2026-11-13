const {
  runDiscordNativeAutomodExecution,
  pingStaffForAutomodExecution,
} = require("../../Moderation/services/automodService") as typeof import("../../Moderation/services/automodService");
const { RULE_PREFIX, resolveAutomodExecutionRule } = require("../../Moderation/services/discordAutomodRulesService") as typeof import("../../Moderation/services/discordAutomodRulesService");

export = {
  name: "autoModerationActionExecution",
  async execute(execution?) {
    try {
            await pingStaffForAutomodExecution(execution);

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
