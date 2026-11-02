const {
  parseProfileCustomId,
  buildTenantProfilePayload,
  safeUpdateTenantProfilePanel,
  ensurePanelInteractionDeferred,
  TENANT_PROFILE_SECTIONS,
  MAX_SELECTED_BADGES,
  PREFIX,
  isBadgeBrowsePanel,
  readBadgeBrowsePageFromMessage,
} = require("../../tenant/tenantProfileRuntime") as typeof import("../../tenant/tenantProfileRuntime");
const {
  partnersChatPartnerCommandDeniedReplyContent,
  schedulePartnersDeniedDeleteReply,
} = require("../../runtime/partnersChatChannelUtils") as typeof import("../../runtime/partnersChatChannelUtils");
const {
  getTenantProfilePrefs,
  updateTenantProfilePrefs,
} = require("../../services/tenantProfilePreferencesService") as typeof import("../../services/tenantProfilePreferencesService");
const { t, normalizeTenantLanguage } = require("../../tenant/tenantProfileConstants") as typeof import("../../tenant/tenantProfileConstants");
const { resolveTenantLanguageForInteraction } = require("../../tenant/tenantPartnershipPrefixMessages") as typeof import("../../tenant/tenantPartnershipPrefixMessages");
const { setTenantObjectiveFlag } = require("../../services/tenantObjectiveService") as typeof import("../../services/tenantObjectiveService");

const EPHEMERAL = 1 << 6;

function isViewOnlyPanel(parsed?) {
  return String(parsed?.ownerId || "") !== String(parsed?.targetUserId || "");
}

function match(interaction?) {
  const id = String(interaction?.customId || "");
  return id.startsWith(PREFIX);
}

async function replyEphemeral(interaction?, content?) {
  const payload = { content, flags: EPHEMERAL };
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload).catch(() => {});
  } else {
    await interaction.reply(payload).catch(() => {});
  }
}

function sectionFromAction(action?) {
  if (action === TENANT_PROFILE_SECTIONS.BADGE_SELECT) return TENANT_PROFILE_SECTIONS.BADGES;
  if (Object.values(TENANT_PROFILE_SECTIONS).includes(action)) return action;
  return TENANT_PROFILE_SECTIONS.HOME;
}

function resolveBadgePanelContext(message?) {
  if (isBadgeBrowsePanel(message)) {
    return {
      section: TENANT_PROFILE_SECTIONS.BADGE_BROWSE,
      page: readBadgeBrowsePageFromMessage(message),
    };
  }
  return { section: TENANT_PROFILE_SECTIONS.BADGES, page: 1 };
}

export = {
  name: "tenantProfile",
  order: 11,
  match,
  async execute(interaction?) {
    const parsed = parseProfileCustomId(interaction.customId);
    if (!parsed || !interaction.guild) return false;
    // Bind tenant al guild dell'interazione (customId non deve spostare le prefs altrove)
    parsed.guildId = String(interaction.guild.id);

    if (String(interaction.user?.id || "") !== parsed.ownerId) {
      const lang = await resolveTenantLanguageForInteraction(interaction);
      await replyEphemeral(interaction, `<:vegax:1443934876440068179> ${t(lang, "notYourPanel")}`);
      return true;
    }

    const denied = await partnersChatPartnerCommandDeniedReplyContent(interaction.channel).catch(() => null);
    if (denied) {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: denied, flags: EPHEMERAL }).catch(() => {});
      } else {
        await interaction.reply({ content: denied, flags: EPHEMERAL }).catch(() => {});
        schedulePartnersDeniedDeleteReply(interaction);
      }
      return true;
    }

    if (parsed.action === "noop") {
      await interaction.deferUpdate().catch(() => {});
      return true;
    }

    if (isViewOnlyPanel(parsed)) {
      await interaction.deferUpdate().catch(() => {});
      return true;
    }

    if (parsed.action !== "noop") {
      await ensurePanelInteractionDeferred(interaction);
    }

    let section = TENANT_PROFILE_SECTIONS.HOME;
    let page = 1;

    if (parsed.action === "set_pings") {
      const prefs = await getTenantProfilePrefs(parsed.guildId, parsed.targetUserId);
      await updateTenantProfilePrefs(parsed.guildId, parsed.targetUserId, {
        suppressManagerPing: !prefs.suppressManagerPing,
      });
      section = (TENANT_PROFILE_SECTIONS.SETTINGS as any);
    } else if (parsed.action === "set_privacy") {
      const prefs = await getTenantProfilePrefs(parsed.guildId, parsed.targetUserId);
      await updateTenantProfilePrefs(parsed.guildId, parsed.targetUserId, {
        ephemeralCommands: !prefs.ephemeralCommands,
      });
      void setTenantObjectiveFlag(interaction.client, parsed.guildId, parsed.targetUserId, "privacySet", {
        discordLocale: interaction.locale,
      }).catch(() => null);
      section = (TENANT_PROFILE_SECTIONS.SETTINGS as any);
    } else if (parsed.action === "open_lang") {
      section = (TENANT_PROFILE_SECTIONS.LANGUAGE as any);
    } else if (parsed.action === "lang_pick") {
      const nextLang = normalizeTenantLanguage(parsed.extra);
      await updateTenantProfilePrefs(parsed.guildId, parsed.targetUserId, {
        language: nextLang,
        languageManual: true,
      });
      await replyEphemeral(interaction, `<:success:1461731530333229226> ${t(nextLang, "languageUpdated")}`);
      section = (TENANT_PROFILE_SECTIONS.LANGUAGE as any);
    } else if (parsed.action === "bsel_slot") {
      const slotIndex = Math.max(0, Math.min(1, Number(parsed.extra) || 0));
      const prefs = await getTenantProfilePrefs(parsed.guildId, parsed.targetUserId);
      const lang = await resolveTenantLanguageForInteraction(interaction, parsed.ownerId);
      const selected = [...(prefs.selectedBadges || [])];
      const badgeId = selected[slotIndex];
      if (!badgeId) return true;
      selected.splice(slotIndex, 1);
      await updateTenantProfilePrefs(parsed.guildId, parsed.targetUserId, { selectedBadges: selected });
      await replyEphemeral(interaction, `<:success:1461731530333229226> ${t(lang, "badgeRemoved")}`);
      const ctx = resolveBadgePanelContext(interaction.message);
      const payload = await buildTenantProfilePayload(interaction.client, interaction.guild, {
        ownerId: parsed.ownerId,
        targetUserId: parsed.targetUserId,
        section: ctx.section,
        page: ctx.page,
        discordLocale: interaction.locale ?? interaction.user?.locale,
      });
      await safeUpdateTenantProfilePanel(interaction, payload);
      return true;
    } else if (parsed.action === "bsel_toggle") {
      const badgeId = String(parsed.extra || "").trim();
      const prefs = await getTenantProfilePrefs(parsed.guildId, parsed.targetUserId);
      const lang = await resolveTenantLanguageForInteraction(interaction, parsed.ownerId);
      const selected = [...(prefs.selectedBadges || [])];
      const idx = selected.indexOf(badgeId);
      if (idx >= 0) {
        selected.splice(idx, 1);
        await updateTenantProfilePrefs(parsed.guildId, parsed.targetUserId, { selectedBadges: selected });
        await replyEphemeral(interaction, `<:success:1461731530333229226> ${t(lang, "badgeRemoved")}`);
      } else if (selected.length >= MAX_SELECTED_BADGES) {
        await replyEphemeral(interaction, `<:vegax:1443934876440068179> ${t(lang, "badgeLimit")}`);
        return true;
      } else {
        selected.push(badgeId);
        await updateTenantProfilePrefs(parsed.guildId, parsed.targetUserId, { selectedBadges: selected });
        await replyEphemeral(interaction, `<:success:1461731530333229226> ${t(lang, "badgeSelected")}`);
      }
      const ctx = resolveBadgePanelContext(interaction.message);
      const payload = await buildTenantProfilePayload(interaction.client, interaction.guild, {
        ownerId: parsed.ownerId,
        targetUserId: parsed.targetUserId,
        section: ctx.section,
        page: ctx.page,
        discordLocale: interaction.locale ?? interaction.user?.locale,
      });
      await safeUpdateTenantProfilePanel(interaction, payload);
      return true;
    } else if (parsed.action === "badge_collapse") {
      section = (TENANT_PROFILE_SECTIONS.BADGES as any);
      page = 1;
    } else if (parsed.action === "obj_p") {
      section = (TENANT_PROFILE_SECTIONS.OBJECTIVES as any);
      page = Math.max(1, Number(parsed.extra) || 1);
    } else if (parsed.action === "bbrowse_p") {
      section = (TENANT_PROFILE_SECTIONS.BADGE_BROWSE as any);
      page = Math.max(1, Number(parsed.extra) || 1);
    } else {
      section = sectionFromAction(parsed.action);
      if ((section as any) === TENANT_PROFILE_SECTIONS.NOTIFICATIONS && !isViewOnlyPanel(parsed)) {
        await updateTenantProfilePrefs(parsed.guildId, parsed.targetUserId, {
          notificationsReadAt: new Date(),
        });
      }
      if ((section as any) === TENANT_PROFILE_SECTIONS.BADGE_BROWSE) {
        page = 1;
      }
    }

    const payload = await buildTenantProfilePayload(interaction.client, interaction.guild, {
      ownerId: parsed.ownerId,
      targetUserId: parsed.targetUserId,
      section,
      page,
      discordLocale: interaction.locale ?? interaction.user?.locale,
    });
    await safeUpdateTenantProfilePanel(interaction, payload);
    return true;
  },
};
