const {
  runDiscordNativeAutomodExecution,
  pingStaffForAutomodExecution,
} = require("../Services/Moderation/automodService");
const { RULE_PREFIX, resolveAutomodExecutionRule } = require("../Services/Moderation/discordAutomodRulesService");

function scheduleAutomodSanzioniStickyReposition(client) {
  if (!client) return;
  try {
    const { maybeRepositionModerationSticky } = require("../Utils/Moderation/moderationStickyPanelRuntime");
    void maybeRepositionModerationSticky(null, client, { delayMs: 3000 }).catch(() => null);
  } catch (_) {}
}

module.exports = {
  name: "autoModerationActionExecution",
  async execute(execution) {
    try {
      // Ping @Staff nel canale sanzioni per ogni blocco AutoMod (l'alert nativo non tagga).
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
