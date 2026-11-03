const {
  checkButtonPermission,
  checkStringSelectPermission,
  buildGlobalPermissionDeniedEmbed,
  buildGlobalChannelDeniedEmbed,
  buildGlobalNotYourControlEmbed,
} = require("../commandPermissions") as typeof import("../commandPermissions");
const { PRIVATE_FLAG, MONO_GUILD_DENIED_TEXT, logButtonErr } = require("./shared") as typeof import("./shared");

function buildDeniedEmbedFromGate(gate?, kind?, interaction = null) {
  const guild = interaction?.guild ?? null;
  let embed = null;
  if (gate.reason === "not_owner") embed = buildGlobalNotYourControlEmbed();
  if (gate.reason === "mono_guild") {
    embed = buildGlobalPermissionDeniedEmbed([], kind, MONO_GUILD_DENIED_TEXT, guild);
  }
  if (gate.reason === "channel") {
    embed = buildGlobalChannelDeniedEmbed(gate.channels || [], kind, interaction?.member || null);
  }
  if (!embed) {
    embed = buildGlobalPermissionDeniedEmbed(gate.requiredRoles || [], kind, null, guild);
  }
  return embed;
}

async function enforceInteractionPermissions(interaction?) {
  if (interaction.isButton && interaction.isButton()) {
    const gate = await checkButtonPermission(interaction);
    if (!gate.allowed) {
      const customId = String(interaction.customId || "");
      const kind =
        customId.startsWith("repost_btn:") || customId.startsWith("repost_src:")
          ? "comando"
          : "bottone";
      const deniedEmbed = buildDeniedEmbedFromGate(gate, kind, interaction);
      await interaction
        .reply({ embeds: [deniedEmbed], flags: PRIVATE_FLAG })
        .catch((err?) => { logButtonErr(err); });
      return false;
    }
  }

  if (interaction.isStringSelectMenu && interaction.isStringSelectMenu()) {
    const gate = await checkStringSelectPermission(interaction);
    if (!gate.allowed) {
      const deniedEmbed = buildDeniedEmbedFromGate(gate, "menu", interaction);
      await interaction
        .reply({ embeds: [deniedEmbed], flags: PRIVATE_FLAG })
        .catch((err?) => { logButtonErr(err); });
      return false;
    }
  }

  if (interaction.isUserSelectMenu && interaction.isUserSelectMenu()) {
    const gate = await checkStringSelectPermission(interaction);
    if (!gate.allowed) {
      const deniedEmbed = buildDeniedEmbedFromGate(gate, "menu", interaction);
      await interaction
        .reply({ embeds: [deniedEmbed], flags: PRIVATE_FLAG })
        .catch((err?) => { logButtonErr(err); });
      return false;
    }
  }

  if (
    (interaction.isChannelSelectMenu && interaction.isChannelSelectMenu()) ||
    (interaction.isRoleSelectMenu && interaction.isRoleSelectMenu())
  ) {
    const gate = await checkStringSelectPermission(interaction);
    if (!gate.allowed) {
      const deniedEmbed = buildDeniedEmbedFromGate(gate, "menu", interaction);
      await interaction
        .reply({ embeds: [deniedEmbed], flags: PRIVATE_FLAG })
        .catch((err?) => { logButtonErr(err); });
      return false;
    }
  }

  return true;
}

export = { buildDeniedEmbedFromGate, enforceInteractionPermissions };
