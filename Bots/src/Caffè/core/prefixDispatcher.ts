const path = require("path") as typeof import("path");
const IDs: any = require("../Config/ids") as typeof import("../Config/ids");
const {
  checkPrefixPermission,
  getPrefixRequiredRoles,
  buildGlobalPermissionDeniedEmbed,
  buildGlobalChannelDeniedEmbed,
} = require("../Moderation/utils/commandPermissions") as typeof import("../Moderation/utils/commandPermissions");
const { createCommandErrorEmbeds } = require("../../shared/moderation/createCommandErrorEmbeds") as typeof import("../../shared/moderation/createCommandErrorEmbeds");
const {
  buildCooldownErrorEmbed,
  buildBusyCommandErrorEmbed,
  buildMissingArgumentsErrorEmbed,
  buildInternalCommandErrorEmbed,
} = createCommandErrorEmbeds({ color: "Red" });
const { getCentralChannel } = require("./events/interactionCreateCommandLogging") as typeof import("./events/interactionCreateCommandLogging");
const { getGuildMemberCached } = require("../../shared/discord/interactionEntityCache") as typeof import("../../shared/discord/interactionEntityCache");
const { createOfficialPrefixDispatcher } = require("../../shared/prefix/createOfficialPrefixDispatcher") as typeof import("../../shared/prefix/createOfficialPrefixDispatcher");
const { createDispatchPrefixMessage } = require("../../shared/prefix/createDispatchPrefixMessage") as typeof import("../../shared/prefix/createDispatchPrefixMessage");

const official = createOfficialPrefixDispatcher({
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

const dispatch = createDispatchPrefixMessage({
  ids: IDs,
  handleOfficialPrefixMessage: official.handleOfficialPrefixMessage,
  getCachedOrFetchMember: getGuildMemberCached,
  defaultPrefixFallback: ",",
});

export = {
  ...official,
  ...dispatch,
};
