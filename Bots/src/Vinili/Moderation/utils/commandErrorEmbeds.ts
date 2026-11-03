const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { TENANT_EMBED_COLOR } = require("../../MultiGuild/utils/tenantEmbedBranding") as typeof import("../../MultiGuild/utils/tenantEmbedBranding");
const { createCommandErrorEmbeds } = require("../../../shared/moderation/createCommandErrorEmbeds") as typeof import("../../../shared/moderation/createCommandErrorEmbeds");

export = createCommandErrorEmbeds({
  color: TENANT_EMBED_COLOR,
  cancelEmoji: "<:cancel:1461730653677551691>",
  cooldownDescription: (remaining?) =>
    [
      `<:VC_Attention:1482534443632558151> Aspetta **${remaining}s** prima di usare un altro comando.`,
      "",
      "<a:VC_Timer:1482527426557775954> Il cooldown si riduce con i ruoli:",
      `<:VC_Dot:1482532364222595303> <@&${IDs.roles.Level30}>, <@&${IDs.roles.ServerBooster}> o <@&${IDs.roles.VIP}> <a:VC_Arrow:1482706699365257397> **15s**`,
      `<:VC_Dot:1482532364222595303> <@&${IDs.roles.Level50}>, <@&${IDs.roles.VIPplus}> o <@&${IDs.roles.DoubleBooster}> <a:VC_Arrow:1482706699365257397> **5s**`,
    ].join("\n"),
});
