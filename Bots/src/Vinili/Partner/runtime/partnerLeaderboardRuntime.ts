const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js") as typeof import("discord.js");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { getPartnerLeaderboardWeekBoundsUtc } = require("../../Staff/services/weeklyStaffResocontoService") as typeof import("../../Staff/services/weeklyStaffResocontoService");
const { TOP_LIMIT, rankLabel, formatUserLabel, fetchMembers } = require("../../Utils/Community/leaderboardHelpers") as typeof import("../../Utils/Community/leaderboardHelpers");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const PLB_MODE_PREFIX = "plb_mode:";
const {
  resolvePartnerPointsShown,
} = require("../../Staff/utils/partnerPointsDisplayUtils") as typeof import("../../Staff/utils/partnerPointsDisplayUtils");
const { guildIconUrl } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");
const { getPartnerManagerRoleId } = require("../core/partnershipConfigResolver") as typeof import("../core/partnershipConfigResolver");
const { applyPartnershipPayloadBranding, resolveEmbedColorForGuild } = require("../../MultiGuild/utils/tenantEmbedBranding") as typeof import("../../MultiGuild/utils/tenantEmbedBranding");

function computeTotalPartnerScore(staff?) {
    return resolvePartnerPointsShown(staff || {});
}

function isPartnerCreateInResocontoWeek(action?, weekStart?, weekEndExclusive?) {
  if (!action || String(action.action || "").toLowerCase() !== "create") return false;
  if (Array.isArray(action.auditPenaltyDates) && action.auditPenaltyDates.length > 0) return false;
  const raw = action.date != null ? action.date : null;
  const when = raw != null ? new Date(raw) : null;
  if (!when || Number.isNaN(when.getTime())) return false;
  const t = when.getTime();
  return t >= weekStart.getTime() && t < weekEndExclusive.getTime();
}

function buildPartnerLbShellEmbed(guild?, isWeekly?, bodyLines?) {
  const title = isWeekly ? "Classifica partnership [Weekly]" : "Classifica partnership [All Time]";
  const icon = guildIconUrl(guild, { size: 128 });
  return new EmbedBuilder()
    .setColor(resolveEmbedColorForGuild(guild?.id))
    .setAuthor({ name: guild.name, iconURL: icon })
    .setTitle(title)
    .setThumbnail(icon)
    .setDescription([bodyLines.join("\n")].join("\n"));
}

async function buildPartnerLbEmbed(guild?, visibleRows?, isWeekly?) {
  const members = await fetchMembers(guild, visibleRows.map((r?) => r.userId));
  const lines = [];
  visibleRows.forEach((row?, index?) => {
    const member = members.get(row.userId);
    const label = formatUserLabel(member, row.userId);
    const score = Number(row.score || 0);
    lines.push(`${rankLabel(index)} ${label}`);
    lines.push(
      `<:VC_Reply:1482532158080942191> __${score}__ partnership <:VC_Partner:1482527213780729896>`,
    );
  });
  if (lines.length === 0) {
    lines.push(
      isWeekly ? "Nessun dato disponibile per questa settimana." : "Nessun dato disponibile.",
    );
  }
  return buildPartnerLbShellEmbed(guild, isWeekly, lines);
}

async function fetchSortedPartners(guild?, isWeekly?) {
  const allStaff = await ActivityUserProfile.find({ guildId: guild.id })
    .select("userId staff.partnerCount staff.partnerActions staff.partnerRedeemSpend staff.partnerServerResetAt")
    .lean();
  const weekBounds = isWeekly ? getPartnerLeaderboardWeekBoundsUtc(new Date()) : null;
  return allStaff
    .map((row?) => {
      const staff: any = row.staff || {};
      if (!isWeekly) {
        return { userId: row.userId, score: computeTotalPartnerScore(staff) };
      }
      const actions = Array.isArray(staff.partnerActions) ? staff.partnerActions : [];
      const weeklyCount = actions.reduce(
        (total?, action?) =>
          total + (isPartnerCreateInResocontoWeek(action, weekBounds.weekStart, weekBounds.weekEndExclusive) ? 1 : 0),
        0,
      );
      return { userId: row.userId, score: weeklyCount };
    })
    .filter((p?) => p.score > 0)
    .sort((a?, b?) => b.score - a.score);
}

function buildPartnerLbToggleRow(mode = "totale") {
  const active = mode === "settimanale" ? "settimanale" : "totale";
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${PLB_MODE_PREFIX}settimanale`)
      .setStyle(active === "settimanale" ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setEmoji("<a:vegaleftarrow:1462914743416131816>"),
    new ButtonBuilder()
      .setCustomId(`${PLB_MODE_PREFIX}totale`)
      .setStyle(active === "totale" ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setEmoji("<a:vegarightarrow:1443673039156936837>"),
  );
}

async function pickTopPartnerRowsInGuild(sortedAll?, guild?, limit?) {
  const partnerManagerRoleId = String(getPartnerManagerRoleId(guild?.id) || IDs.roles?.PartnerManager || "").trim();
  const members = await fetchMembers(guild, sortedAll.map((r?) => r.userId));
  const out = [];
  for (const row of sortedAll) {
    const member = members.get(row.userId);
    if (!member) continue;
    if (partnerManagerRoleId && !member.roles?.cache?.has(partnerManagerRoleId)) continue;
    out.push(row);
    if (out.length >= limit) break;
  }
  return out;
}

async function buildPartnerLeaderboardPayload(client?, guild?, mode = "totale", _page = 1) {
  const isWeekly = mode === "settimanale";
  const sortedAll = await fetchSortedPartners(guild, isWeekly);
  const toggleRow = buildPartnerLbToggleRow(isWeekly ? "settimanale" : "totale");
  const visible = await pickTopPartnerRowsInGuild(sortedAll, guild, TOP_LIMIT);
  const embed = await buildPartnerLbEmbed(guild, visible, isWeekly);
  return applyPartnershipPayloadBranding(
    { embeds: [embed], components: [toggleRow] },
    { guildId: guild?.id, guild, client },
  );
}

export = { TOP_LIMIT, PLB_MODE_PREFIX: "plb_mode:", PLB_NAV_PREFIX: "plb_nav:", buildPartnerLeaderboardPayload, fetchSortedPartners, pickTopPartnerRowsInGuild };