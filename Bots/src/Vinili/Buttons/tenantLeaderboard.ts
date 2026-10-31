const {
  parseLeaderboardCustomId,
  buildLeaderboardPayload,
} = require("../MultiGuild/utils/Partner/tenantLeaderboardRuntime") as typeof import("../MultiGuild/utils/Partner/tenantLeaderboardRuntime");
const {
  partnersChatPartnerCommandDeniedReplyContent,
  schedulePartnersDeniedDeleteReply,
} = require("../Utils/Partner/partnersChatChannelUtils") as typeof import("../Utils/Partner/partnersChatChannelUtils");
const { resolveTenantLanguageForInteraction } = require("../MultiGuild/utils/Partner/tenantPartnershipPrefixMessages") as typeof import("../MultiGuild/utils/Partner/tenantPartnershipPrefixMessages");
const { evaluateTenantObjectives } = require("../MultiGuild/services/Partner/tenantObjectiveService") as typeof import("../MultiGuild/services/Partner/tenantObjectiveService");
const { t } = require("../MultiGuild/utils/Partner/tenantPartnershipI18n/index") as typeof import("../MultiGuild/utils/Partner/tenantPartnershipI18n/index");
const { safePanelMessageUpdate } = require("../../shared/discord/replyRuntime") as typeof import("../../shared/discord/replyRuntime");

function match(interaction?) {
  const id = String(interaction?.customId || "");
  if (interaction?.isButton?.() && id.startsWith("tlb:")) return true;
  if (interaction?.isStringSelectMenu?.() && id.startsWith("tlb:cat:")) return true;
  return false;
}

async function execute(interaction?) {
  const parsed = parseLeaderboardCustomId(interaction.customId);
  if (!parsed || !interaction.guild) return false;

  if (String(interaction.user?.id || "") !== String(parsed.ownerId || "")) {
    const lang = await resolveTenantLanguageForInteraction(interaction);
    const reply = {
      content: `<:vegax:1443934876440068179> ${t(lang, "notYourPanel")}`,
      flags: 1 << 6,
    };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(reply).catch(() => {});
    } else {
      await interaction.reply(reply).catch(() => {});
    }
    return true;
  }

  const denied = await partnersChatPartnerCommandDeniedReplyContent(interaction.channel).catch(() => null);
  if (denied) {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: denied, flags: 1 << 6 }).catch(() => {});
    } else {
      await interaction.reply({ content: denied, flags: 1 << 6 }).catch(() => {});
      schedulePartnersDeniedDeleteReply(interaction);
    }
    return true;
  }

  let category = parsed.category;
  let period = parsed.period;
  let page = parsed.page;
  let targetGuildId = parsed.targetGuildId;

  if (parsed.action === "cat" && interaction.isStringSelectMenu?.()) {
    category = String(interaction.values?.[0] || category).toLowerCase();
    page = 1;
    if (category === "partners") {
      targetGuildId = interaction.guild.id;
    } else {
      targetGuildId = null;
    }
  } else if (parsed.action === "prev") {
    page = Math.max(1, page - 1);
  } else if (parsed.action === "next") {
    page = page + 1;
  }

  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => {});
  }

  const lang = await resolveTenantLanguageForInteraction(interaction, parsed.ownerId);
  void evaluateTenantObjectives(interaction.client, interaction.guild.id, parsed.ownerId, {
    discordLocale: interaction.locale,
  }).catch(() => null);
  const { payload } = await buildLeaderboardPayload(
    interaction.client,
    interaction.guild,
    {
      ownerId: parsed.ownerId,
      category,
      period,
      page,
      targetGuildId,
      lang,
    },
    interaction.user.id,
  );

  await safePanelMessageUpdate(interaction, payload);
  return true;
}

export = { name: "tenantLeaderboard", order: 12, match, execute };
