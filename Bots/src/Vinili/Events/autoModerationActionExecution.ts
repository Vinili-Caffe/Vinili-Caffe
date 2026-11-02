const {
  runDiscordNativeAutomodExecution,
  pingStaffForAutomodExecution,
} = require("../Moderation/services/automodService") as typeof import("../Moderation/services/automodService");
const { RULE_PREFIX, resolveAutomodExecutionRule } = require("../Moderation/services/discordAutomodRulesService") as typeof import("../Moderation/services/discordAutomodRulesService");

function scheduleAutomodSanzioniStickyReposition(client?) {
  if (!client) return;
  try {
    const { maybeRepositionModerationSticky } = require("../Moderation/utils/moderationStickyPanelRuntime") as typeof import("../Moderation/utils/moderationStickyPanelRuntime");
    void maybeRepositionModerationSticky(null, client, { delayMs: 3000 }).catch(() => null);
  } catch (_) {}
}

export = {
  name: "autoModerationActionExecution",
  async execute(execution?) {
    try {
            await pingStaffForAutomodExecution(execution);

      const rule = await resolveAutomodExecutionRule(execution);
      const ruleName = String(rule?.name || "");
      if (!ruleName.startsWith(RULE_PREFIX)) {
        scheduleAutomodSanzioniStickyReposition(execution?.client);
        return;
      }
      await runDiscordNativeAutomodExecution(execution, rule);
      scheduleAutomodSanzioniStickyReposition(execution?.client);
    } catch (error) {
      global.logger?.error?.(
        "[autoModerationActionExecution]",
        error?.message || error,
      );
    }
  },
};
