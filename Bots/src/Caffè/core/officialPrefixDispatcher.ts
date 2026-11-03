const path = require("path") as typeof import("path");
const IDs: any = require("../Config/ids") as typeof import("../Config/ids");
const {
  checkPrefixPermission,
  getPrefixRequiredRoles,
  buildGlobalPermissionDeniedEmbed,
  buildGlobalChannelDeniedEmbed,
} = require("../Moderation/utils/commandPermissions") as typeof import("../Moderation/utils/commandPermissions");
const {
  buildCooldownErrorEmbed,
  buildBusyCommandErrorEmbed,
  buildMissingArgumentsErrorEmbed,
  buildInternalCommandErrorEmbed,
} = require("../Moderation/utils/commandErrorEmbeds") as typeof import("../Moderation/utils/commandErrorEmbeds");
const { getCentralChannel } = require("./events/interaction/commandUsageLogger") as typeof import("./events/interaction/commandUsageLogger");
const { createOfficialPrefixDispatcher } = require("../../shared/prefix/createOfficialPrefixDispatcher") as typeof import("../../shared/prefix/createOfficialPrefixDispatcher");

export = createOfficialPrefixDispatcher({
  ids: IDs,
  botDataDir: path.join(__dirname, "..", "Data"),
  snapshotKey: "coffee_prefix_queue",
  snapshotPath: path.join(__dirname, "..", "Data", "prefixQueueSnapshot.json"),
  checkPrefixPermission,
  getPrefixRequiredRoles,
  buildGlobalPermissionDeniedEmbed,
  buildGlobalChannelDeniedEmbed,
  buildCooldownErrorEmbed,
  buildBusyCommandErrorEmbed,
  buildMissingArgumentsErrorEmbed,
  buildInternalCommandErrorEmbed,
  getCentralChannel,
  cooldownBypassRoleId: IDs.roles?.HighStaff || IDs.roles?.Founder || null,
  precheckTimeoutMs: 4000,
  mapCooldownMs: Math.max(0, Number(process.env.COFFEE_PREFIX_COOLDOWN_MS || 0)),
});
