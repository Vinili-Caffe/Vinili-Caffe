const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js") as typeof import("discord.js");
const { safeMessageReply } = require("../../../../shared/discord/replyRuntime") as typeof import("../../../../shared/discord/replyRuntime");
const IDs = require("../../../Config/ids") as typeof import("../../../Config/ids");
const { listPartnershipBlacklistGuilds } = require("../../services/partnershipBlacklistService") as typeof import("../../services/partnershipBlacklistService");
const {
  listTenantPartnershipBlacklistGuilds,
  addTenantPartnershipBlacklistGuild,
  removeTenantPartnershipBlacklistGuild,
  normalizeTargetGuildId,
} = require("../../services/tenantPartnershipBlacklistService") as typeof import("../../services/tenantPartnershipBlacklistService");
const { resolvePartnershipBlacklistEntryDisplay } = require("../../runtime/partnershipBlacklistDisplay") as typeof import("../../runtime/partnershipBlacklistDisplay");
const {
  partnersChatPartnerCommandDeniedReplyContent,
  sendPartnersChatDeniedPrefixCleanup,
} = require("../../runtime/partnersChatChannelUtils") as typeof import("../../runtime/partnersChatChannelUtils");
const {
  shouldApplyMainPartnershipFilters,
  isPartnershipOperational,
  memberHasPartnerManagerRole,
} = require("../../core/partnershipConfigResolver") as typeof import("../../core/partnershipConfigResolver");
const { rejectIfPartnershipToolkitBlocked } = require("../../core/partnershipPrefixToolkit") as typeof import("../../core/partnershipPrefixToolkit");
const { memberCanManageTenantPartnershipSettings } = require("../../core/tenantPartnershipAdminAccess") as typeof import("../../core/tenantPartnershipAdminAccess");
const { fetchInviteGuildMeta } = require("../../runtime/partnershipBlacklistDisplay") as typeof import("../../runtime/partnershipBlacklistDisplay");
const {
  resolveTenantLanguageForMessage,
  tenantNoPermissionError,
  tenantNoticePayload,
} = require("../../tenant/tenantPartnershipPrefixMessages") as typeof import("../../tenant/tenantPartnershipPrefixMessages");
const { replyPrefixSetupRequired } = require("../../tenant/tenantSetupRequiredReply") as typeof import("../../tenant/tenantSetupRequiredReply");
const { applyPartnershipPayloadBranding } = require("../../../MultiGuild/utils/tenantEmbedBranding") as typeof import("../../../MultiGuild/utils/tenantEmbedBranding");
const { applyDefaultFooterToEmbeds } = require("../../../../shared/embeds/defaultFooter") as typeof import("../../../../shared/embeds/defaultFooter");
const { t } = require("../../i18n/tenantPartnershipI18n/index") as typeof import("../../i18n/tenantPartnershipI18n/index");

const PANEL_PREFIX = "blacklist_ui";

function hasBlacklistManageRole(member?) {
  const roles = member?.roles?.cache;
  if (!roles) return false;
  const highStaffRoleId = IDs?.roles?.HighStaff;
  return Boolean(highStaffRoleId && roles.has(highStaffRoleId));
}

function hasBlacklistViewRole(member?) {
  const roles = member?.roles?.cache;
  if (!roles) return false;
  const guildId = member?.guild?.id;
  const { getPartnerManagerRoleId } = require("../../core/partnershipConfigResolver") as typeof import("../../core/partnershipConfigResolver");
  const partnerManagerRoleId = getPartnerManagerRoleId(guildId);
  const staffRoleId = IDs?.roles?.Staff;
  const highStaffRoleId = IDs?.roles?.HighStaff;
  const legacyPartnerManagerRoleId = IDs?.roles?.PartnerManager;
  return Boolean(
    (staffRoleId && roles.has(staffRoleId)) ||
      (highStaffRoleId && roles.has(highStaffRoleId)) ||
      (legacyPartnerManagerRoleId && roles.has(legacyPartnerManagerRoleId)) ||
      (partnerManagerRoleId && roles.has(partnerManagerRoleId)),
  );
}

function memberCanUseTenantBlacklist(member?, guild?) {
  const guildId = String(guild?.id || "").trim();
  if (!guildId || !member) return false;
  return (
    memberHasPartnerManagerRole(member, guildId) ||
    memberCanManageTenantPartnershipSettings(member, guild)
  );
}

function memberCanManageTenantBlacklist(member?, guild?) {
  return memberCanManageTenantPartnershipSettings(member, guild);
}

function normalizePageIndex(pageIndex?, total?) {
  if (!total) return 0;
  const raw = Number(pageIndex);
  if (!Number.isFinite(raw)) return 0;
  return ((Math.floor(raw) % total) + total) % total;
}

function formatAddedAt(value?) {
  const ms = new Date(value || 0).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  return `<t:${Math.floor(ms / 1000)}:d>`;
}

async function buildBlacklistEntryEmbed(client?, entry?, pageIndex?, total?) {
  const display = await resolvePartnershipBlacklistEntryDisplay(client, entry);
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle(`<a:VC_Verified:1482532479637127188> ${display.guildName}`)
    .setDescription(
      display.note
        ? `<:VC_Info:1482526956703580372> **Motivo**\n${display.note.slice(0, 3500)}`
        : "<:VC_Info:1482526956703580372> Nessun motivo registrato.",
    )
    .addFields(
      { name: "Guild ID", value: `\`${display.guildId}\``, inline: true },
      {
        name: "Invito",
        value: display.invite ? `[Apri invito](${display.invite})` : "—",
        inline: true,
      },
      { name: "Aggiunto il", value: formatAddedAt(display.addedAt), inline: true },
    )
    .setFooter({ text: `Server ${pageIndex + 1} di ${total}` });
  if (display.iconUrl) embed.setThumbnail(display.iconUrl);
  return embed;
}

function buildBlacklistPanelComponents(ownerId?, canManage?, pageIndex?, total?) {
  const components = [];
  if (total > 0) {
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${PANEL_PREFIX}:prev:${ownerId}:${pageIndex}`)
          .setEmoji("<a:vegaleftarrow:1462914743416131816>")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(total <= 1),
        new ButtonBuilder()
          .setCustomId(`${PANEL_PREFIX}:next:${ownerId}:${pageIndex}`)
          .setEmoji("<a:vegarightarrow:1443673039156936837>")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(total <= 1),
      ),
    );
  }
  if (canManage) {
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${PANEL_PREFIX}:add:${ownerId}`)
          .setLabel("Aggiungi")
          .setEmoji("<a:VC_Verified:1482532479637127188>")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`${PANEL_PREFIX}:remove:${ownerId}`)
          .setLabel("Rimuovi")
          .setEmoji("<a:VC_Cross:1482532424570376253>")
          .setStyle(ButtonStyle.Danger),
      ),
    );
  }
  return components;
}

async function buildBlacklistPanelPayload(client?, ownerId?, canView?, canManage?, rows = [], pageIndex = 0, guild = null) {
  let payload;
  if (!canView) {
    payload = {
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setTitle("Server in blacklist partnership")
          .setDescription("<:vegax:1443934876440068179> Non hai i ruoli necessari per gestire la blacklist."),
      ],
      components: [],
    };
  } else if (!rows.length) {
    payload = {
      embeds: [
        new EmbedBuilder()
          .setColor("#6f4e37")
          .setTitle("<a:VC_Verified:1482532479637127188> Server in blacklist partnership")
          .setDescription("<a:VC_Cross:1482532424570376253> Nessun server in blacklist partnership."),
      ],
      components: buildBlacklistPanelComponents(ownerId, canManage, 0, 0),
    };
  } else {
    const safeIndex = normalizePageIndex(pageIndex, rows.length);
    const embed = await buildBlacklistEntryEmbed(client, rows[safeIndex], safeIndex, rows.length);
    payload = {
      embeds: [embed],
      components: buildBlacklistPanelComponents(ownerId, canManage, safeIndex, rows.length),
    };
  }

  if (!guild?.id) return payload;
  return applyPartnershipPayloadBranding(payload, {
    guildId: guild.id,
    guild,
    client: client || guild.client,
  });
}

async function buildTenantBlacklistListPayload(client?, guild?, rows?, lang?) {
  if (!rows.length) {
    return applyPartnershipPayloadBranding(
      applyDefaultFooterToEmbeds(
        {
          embeds: [
            new EmbedBuilder()
              .setColor("#6f4e37")
              .setTitle(t(lang, "blacklist_listTitle"))
              .setDescription(t(lang, "blacklist_empty")),
          ],
          allowedMentions: { repliedUser: false },
        },
        guild,
      ),
      { guildId: guild.id, guild, client },
    );
  }

  const lines = [];
  for (const entry of rows.slice(0, 25)) {
    const display = await resolvePartnershipBlacklistEntryDisplay(client, entry);
    const note = display.note ? ` — ${display.note.slice(0, 80)}` : "";
    lines.push(`• **${display.guildName}** (\`${display.guildId}\`)${note}`);
  }

  return applyPartnershipPayloadBranding(
    applyDefaultFooterToEmbeds(
      {
        embeds: [
          new EmbedBuilder()
            .setColor("#6f4e37")
            .setTitle(t(lang, "blacklist_listTitle"))
            .setDescription(lines.join("\n").slice(0, 4000)),
        ],
        allowedMentions: { repliedUser: false },
      },
      guild,
    ),
    { guildId: guild.id, guild, client },
  );
}

async function resolveTenantBlacklistTarget(rawInput?, guildId?) {
  const input = String(rawInput || "").trim();
  if (!input) return null;

  const directId = normalizeTargetGuildId(input);
  if (directId) {
    if (directId === String(guildId || "").trim()) {
      return { error: "self" };
    }
    return { guildId: directId, meta: {} };
  }

  const meta = await fetchInviteGuildMeta(input);
  if (!meta?.guildId) return { error: "invalid" };
  if (meta.guildId === String(guildId || "").trim()) {
    return { error: "self" };
  }
  return {
    guildId: meta.guildId,
    meta: {
      invite: meta.invite,
      guildName: meta.guildName,
      iconUrl: meta.iconUrl,
    },
    displayName: meta.guildName,
  };
}

async function executeTenantBlacklist(message?, args = []) {
  await message.channel.sendTyping().catch(() => null);
  const guildId = message.guild.id;
  const lang = await resolveTenantLanguageForMessage(message);

  if (await rejectIfPartnershipToolkitBlocked(message, "+blacklist")) return;

  if (!isPartnershipOperational(guildId)) {
    return replyPrefixSetupRequired(message);
  }

  const denied = await partnersChatPartnerCommandDeniedReplyContent(message.channel).catch(() => null);
  if (denied) {
    return sendPartnersChatDeniedPrefixCleanup(message, denied);
  }

  if (!memberCanUseTenantBlacklist(message.member, message.guild)) {
    return safeMessageReply(message, {
      ...(await tenantNoPermissionError(message, "`+blacklist`")),
      allowedMentions: { repliedUser: false },
    });
  }

  const action = String(args[0] || "").trim().toLowerCase();
  const canManage = memberCanManageTenantBlacklist(message.member, message.guild);

  if (action === "add") {
    if (!canManage) {
      return safeMessageReply(message, {
        ...(await tenantNoPermissionError(message, "`+blacklist add`")),
        allowedMentions: { repliedUser: false },
      });
    }
    const targetInput = String(args[1] || "").trim();
    if (!targetInput) {
      return safeMessageReply(message, {
        ...(await tenantNoticePayload(message, "blacklist_usage")),
        allowedMentions: { repliedUser: false },
      });
    }
    const note = args.slice(2).join(" ").trim();
    const resolved = await resolveTenantBlacklistTarget(targetInput, guildId);
    if (!resolved) {
      return safeMessageReply(message, {
        ...(await tenantNoticePayload(message, "blacklist_invalidTarget")),
        allowedMentions: { repliedUser: false },
      });
    }
    if (resolved.error === "self") {
      return safeMessageReply(message, {
        ...(await tenantNoticePayload(message, "blacklist_self")),
        allowedMentions: { repliedUser: false },
      });
    }
    if (resolved.error === "invalid" || !resolved.guildId) {
      return safeMessageReply(message, {
        ...(await tenantNoticePayload(message, "blacklist_invalidTarget")),
        allowedMentions: { repliedUser: false },
      });
    }

    const result = await addTenantPartnershipBlacklistGuild(
      guildId,
      resolved.guildId,
      message.author.id,
      note,
      resolved.meta || {},
    );
    if (!result?.ok) {
      return safeMessageReply(message, {
        ...(await tenantNoticePayload(message, "blacklist_invalidTarget")),
        allowedMentions: { repliedUser: false },
      });
    }

    const displayName =
      resolved.displayName ||
      resolved.meta?.guildName ||
      `Server ${resolved.guildId}`;
    return safeMessageReply(message, {
      ...(await tenantNoticePayload(message, "blacklist_added", { guildName: displayName })),
      allowedMentions: { repliedUser: false },
    });
  }

  if (action === "remove") {
    if (!canManage) {
      return safeMessageReply(message, {
        ...(await tenantNoPermissionError(message, "`+blacklist remove`")),
        allowedMentions: { repliedUser: false },
      });
    }
    const targetId = normalizeTargetGuildId(args[1]);
    if (!targetId) {
      return safeMessageReply(message, {
        ...(await tenantNoticePayload(message, "blacklist_usage")),
        allowedMentions: { repliedUser: false },
      });
    }
    const result = await removeTenantPartnershipBlacklistGuild(guildId, targetId);
    if (!result?.ok || !result.deleted) {
      return safeMessageReply(message, {
        ...(await tenantNoticePayload(message, "blacklist_notFound")),
        allowedMentions: { repliedUser: false },
      });
    }
    return safeMessageReply(message, {
      ...(await tenantNoticePayload(message, "blacklist_removed", { guildId: targetId })),
      allowedMentions: { repliedUser: false },
    });
  }

  if (args.length > 0 && action !== "list") {
    return safeMessageReply(message, {
      ...(await tenantNoticePayload(message, "blacklist_usage")),
      allowedMentions: { repliedUser: false },
    });
  }

  const rows = await listTenantPartnershipBlacklistGuilds(guildId, 200).catch(() => []);
  const payload = await buildTenantBlacklistListPayload(message.client, message.guild, rows, lang);
  return safeMessageReply(message, payload);
}

export = {
  name: "blacklist",
  allowEmptyArgs: true,
  description: "Gestisce l’elenco dei server esclusi dalle partnership.",
  usage: "+blacklist | +blacklist add <invito|guildId> [motivo] | +blacklist remove <guildId>",
  examples: ["+blacklist", "+blacklist add discord.gg/esempio motivo", "+blacklist remove 123456789012345678"],
  buildBlacklistPanelPayload,
  hasBlacklistManageRole,
  hasBlacklistViewRole,
  normalizePageIndex,
  async execute(message?, args?) {
    if (shouldApplyMainPartnershipFilters(message.guild?.id)) {
      return executeMainBlacklist(message, args);
    }
    return executeTenantBlacklist(message, args);
  },
};

async function executeMainBlacklist(message?, _args?) {
  const denied = await partnersChatPartnerCommandDeniedReplyContent(message.channel);
  if (denied) {
    return sendPartnersChatDeniedPrefixCleanup(message, denied);
  }
  const canView = hasBlacklistViewRole(message.member);
  const canManage = hasBlacklistManageRole(message.member);
  const rows = canView ? await listPartnershipBlacklistGuilds(200).catch(() => []) : [];
  const payload = await buildBlacklistPanelPayload(
    message.client,
    message.author.id,
    canView,
    canManage,
    rows,
    0,
    message.guild,
  );
  return safeMessageReply(message, {
    ...payload,
    allowedMentions: { repliedUser: false },
  });
}
