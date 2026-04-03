const {
  PARTNERS_PER_PAGE,
  PLB_MODE_PREFIX,
  PLB_NAV_PREFIX,
  buildPartnerLeaderboardPayload,
  fetchSortedPartners,
} = require("../Utils/Partner/partnerLeaderboardRuntime");

function match(interaction) {
  const id = String(interaction?.customId || "");
  return interaction?.isButton?.() && (id.startsWith(PLB_MODE_PREFIX) || id.startsWith(PLB_NAV_PREFIX));
}

async function execute(interaction) {
  const id = String(interaction.customId || "");
  const guild = interaction.guild;
  if (!guild) return false;
  let mode = "totale";
  let page = 1;
  if (id.startsWith(PLB_MODE_PREFIX)) {
    const raw = id.slice(PLB_MODE_PREFIX.length).trim().toLowerCase();
    mode = raw === "settimanale" ? "settimanale" : "totale";
    page = 1;
  } else if (id.startsWith(PLB_NAV_PREFIX)) {
    const body = id.slice(PLB_NAV_PREFIX.length);
    const parts = body.split(":");
    const modeRaw = String(parts[0] || "totale").toLowerCase();
    mode = modeRaw === "settimanale" ? "settimanale" : "totale";
    const curPage = Math.max(1, Number.parseInt(parts[1], 10) || 1);
    const dir = String(parts[2] || "").toLowerCase();
    const partners = await fetchSortedPartners(guild);
    const totalPages = Math.max(1, Math.ceil(Math.max(partners.length, 1) / PARTNERS_PER_PAGE));
    if (dir === "n") page = Math.min(totalPages, curPage + 1);
    else if (dir === "p") page = Math.max(1, curPage - 1);
    else page = curPage;
  }
  const payload = await buildPartnerLeaderboardPayload(interaction.client, guild, mode, page);
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload).catch(() => interaction.followUp({ ...payload, ephemeral: true }).catch(() => {}));
  } else {
    await interaction.update(payload).catch(async () => {
      await interaction.reply(payload).catch(() => {});
    });
  }
  return true;
}

module.exports = { name: "partnerLeaderboardToggle", order: 10, match, execute };