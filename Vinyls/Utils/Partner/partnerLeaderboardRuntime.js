const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { getPartnerLeaderboardWeekBoundsUtc } = require("../../Services/Staff/weeklyStaffResocontoService");
const { TOP_LIMIT, rankLabel, formatUserLabel, fetchMembers } = require("../../Prefix/Level/classifica");

const PLB_MODE_PREFIX = "plb_mode:";
/** Legacy messaggi con paginazione: aggiorna senza freccie pagina. */
const PLB_NAV_PREFIX = "plb_nav:";

function countValidAllTimePartners(actions) {
  if (!Array.isArray(actions)) return 0;
  return actions.reduce((total, action) => {
    if (String(action?.action || "").toLowerCase() !== "create") return total;
    return total + 1;
  }, 0);
}

function computeTotalPartnerScore(staff) {
  const s = staff || {};
  const totalCount = Number(s.partnerCount);
  const fromActions = countValidAllTimePartners(Array.isArray(s.partnerActions) ? s.partnerActions : []);
  const safeCounter = Number.isFinite(totalCount) && totalCount >= 0 ? totalCount : 0;
  return Math.max(safeCounter, fromActions);
}

function isPartnerCreateInResocontoWeek(action, weekStart, weekEndExclusive) {
  if (!action || String(action.action || "").toLowerCase() !== "create") return false;
  const raw = action.date != null ? action.date : null;
  const when = raw != null ? new Date(raw) : null;
  if (!when || Number.isNaN(when.getTime())) return false;
  const t = when.getTime();
  return t >= weekStart.getTime() && t < weekEndExclusive.getTime();
}

function partnerLbSubtitle(isWeekly) {
  return isWeekly
    ? "<a:VC_Sparkles:1468546911936974889> I 10 utenti con più partnership nella settimana resoconto [Settimanale]"
    : "<a:VC_Sparkles:1468546911936974889> I 10 utenti con più partnership [Totale]";
}

function buildPartnerLbShellEmbed(guild, isWeekly, bodyLines) {
  const title = isWeekly ? "Classifica partnership [Settimanale]" : "Classifica partnership [Totale]";
  const icon = guild.iconURL({ size: 128 });
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setAuthor({ name: guild.name, iconURL: icon })
    .setTitle(title)
    .setThumbnail(icon)
    .setDescription([partnerLbSubtitle(isWeekly), "", bodyLines.join("\n")].join("\n"));
}

async function buildPartnerLbEmbed(guild, visibleRows, isWeekly) {
  const members = await fetchMembers(guild, visibleRows.map((r) => r.userId));
  const lines = [];
  visibleRows.forEach((row, index) => {
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

async function fetchSortedPartners(guild, isWeekly) {
  const allStaff = await ActivityUserProfile.find({ guildId: guild.id })
    .select("userId staff.partnerCount staff.partnerActions")
    .lean();
  const weekBounds = isWeekly ? getPartnerLeaderboardWeekBoundsUtc(new Date()) : null;
  return allStaff
    .map((row) => {
      const staff = row.staff || {};
      if (!isWeekly) {
        return { userId: row.userId, score: computeTotalPartnerScore(staff) };
      }
      const actions = Array.isArray(staff.partnerActions) ? staff.partnerActions : [];
      const weeklyCount = actions.reduce(
        (total, action) =>
          total + (isPartnerCreateInResocontoWeek(action, weekBounds.weekStart, weekBounds.weekEndExclusive) ? 1 : 0),
        0,
      );
      return { userId: row.userId, score: weeklyCount };
    })
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score);
}

function buildPartnerLbToggleRow(mode = "totale") {
  const active = mode === "settimanale" ? "settimanale" : "totale";
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${PLB_MODE_PREFIX}settimanale`)
      .setStyle(active === "settimanale" ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setEmoji("⬅️"),
    new ButtonBuilder()
      .setCustomId(`${PLB_MODE_PREFIX}totale`)
      .setStyle(active === "totale" ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setEmoji("➡️"),
  );
}

async function pickTopPartnerRowsInGuild(sortedAll, guild, limit) {
  const members = await fetchMembers(guild, sortedAll.map((r) => r.userId));
  const out = [];
  for (const row of sortedAll) {
    if (!members.has(row.userId)) continue;
    out.push(row);
    if (out.length >= limit) break;
  }
  return out;
}

async function buildPartnerLeaderboardPayload(client, guild, mode = "totale", _page = 1) {
  const isWeekly = mode === "settimanale";
  const sortedAll = await fetchSortedPartners(guild, isWeekly);
  const toggleRow = buildPartnerLbToggleRow(isWeekly ? "settimanale" : "totale");
  const visible = await pickTopPartnerRowsInGuild(sortedAll, guild, TOP_LIMIT);
  const embed = await buildPartnerLbEmbed(guild, visible, isWeekly);
  return { embeds: [embed], components: [toggleRow] };
}

module.exports = {
  TOP_LIMIT,
  PARTNERS_PER_PAGE: TOP_LIMIT,
  PLB_MODE_PREFIX,
  PLB_NAV_PREFIX,
  buildPartnerLeaderboardPayload,
  fetchSortedPartners,
  countValidAllTimePartners,
};