const {
  runDiscordNativeAutomodExecution,
  pingStaffForAutomodExecution,
} = require("../Services/Moderation/automodService") as typeof import("../Services/Moderation/automodService");
const { RULE_PREFIX, resolveAutomodExecutionRule } = require("../Services/Moderation/discordAutomodRulesService") as typeof import("../Services/Moderation/discordAutomodRulesService");

function scheduleAutomodSanzioniStickyReposition(client?) {
  if (!client) return;
  try {
    const { maybeRepositionModerationSticky } = require("../Utils/Moderation/moderationStickyPanelRuntime") as typeof import("../Utils/Moderation/moderationStickyPanelRuntime");
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
