const {
  parseLeaderboardCustomId,
  buildLeaderboardPayload,
} = require("../../tenant/tenantLeaderboardRuntime") as typeof import("../../tenant/tenantLeaderboardRuntime");
const {
  partnersChatPartnerCommandDeniedReplyContent,
  schedulePartnersDeniedDeleteReply,
} = require("../../runtime/partnersChatChannelUtils") as typeof import("../../runtime/partnersChatChannelUtils");
const { resolveTenantLanguageForInteraction } = require("../../tenant/tenantPartnershipPrefixMessages") as typeof import("../../tenant/tenantPartnershipPrefixMessages");
const { evaluateTenantObjectives } = require("../../services/tenantObjectiveService") as typeof import("../../services/tenantObjectiveService");
const { t } = require("../../i18n/tenantPartnershipI18n/index") as typeof import("../../i18n/tenantPartnershipI18n/index");
const { safePanelMessageUpdate } = require("../../../../shared/discord/replyRuntime") as typeof import("../../../../shared/discord/replyRuntime");

const { E } = require("../../../../shared/emojis/emojiCatalog") as typeof import("../../../../shared/emojis/emojiCatalog");
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
      content: `${E.vegax} ${t(lang, "notYourPanel")}`,
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
