const { PLB_MODE_PREFIX, PLB_NAV_PREFIX, buildPartnerLeaderboardPayload } = require("../Utils/Partner/partnerLeaderboardRuntime") as typeof import("../Utils/Partner/partnerLeaderboardRuntime");
const { partnersChatPartnerCommandDeniedReplyContent, schedulePartnersDeniedDeleteReply } = require("../Utils/Partner/partnersChatChannelUtils") as typeof import("../Utils/Partner/partnersChatChannelUtils");
const { safePanelMessageUpdate } = require("../../shared/discord/replyRuntime") as typeof import("../../shared/discord/replyRuntime");

function match(interaction?) {
  const id = String(interaction?.customId || "");
  return interaction?.isButton?.() && (id.startsWith(PLB_MODE_PREFIX) || id.startsWith(PLB_NAV_PREFIX));
}

async function execute(interaction?) {
  const id = String(interaction.customId || "");
  const guild = interaction.guild;
  if (!guild) return false;
  const denied = await partnersChatPartnerCommandDeniedReplyContent(interaction.channel);
  if (denied) {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: denied, flags: 1 << 6 }).catch(() => {});
    } else {
      await interaction.reply({ content: denied, flags: 1 << 6 }).catch(() => {});
      schedulePartnersDeniedDeleteReply(interaction);
    }
    return true;
  }
  let mode = "totale";
  if (id.startsWith(PLB_MODE_PREFIX)) {
    const raw = id.slice(PLB_MODE_PREFIX.length).trim().toLowerCase();
    mode = raw === "settimanale" ? "settimanale" : "totale";
  } else if (id.startsWith(PLB_NAV_PREFIX)) {
    const body = id.slice(PLB_NAV_PREFIX.length);
    const parts = body.split(":");
    const modeRaw = String(parts[0] || "totale").toLowerCase();
    mode = modeRaw === "settimanale" ? "settimanale" : "totale";
  }
  const payload = await buildPartnerLeaderboardPayload(interaction.client, guild, mode, 1);
  await safePanelMessageUpdate(interaction, payload);
  return true;
}

export = { name: "partnerLeaderboardToggle", order: 10, match, execute };