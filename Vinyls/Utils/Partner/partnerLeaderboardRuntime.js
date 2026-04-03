const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { getPartnerLeaderboardWeekBoundsUtc } = require("../../Services/Staff/weeklyStaffResocontoService");

const PARTNERS_PER_PAGE = 10;
const UNKNOWN_USERNAME = "Utente sconosciuto";
const PLB_MODE_PREFIX = "plb_mode:";
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

function buildNoDataEmbed(isWeekly) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      isWeekly
        ? "<:VC_Attention:1482534443632558151> Nessuna partnership in questa settimana resoconto (dom 20:00 → dom 20:00)!"
        : "<:VC_Attention:1482534443632558151> Nessuno ha ancora effettuato partner!",
    );
}

async function buildLeaderboardEmbed(partners, currentPage, totalPages, isWeekly, resolveUsername) {
  const startIndex = (currentPage - 1) * PARTNERS_PER_PAGE;
  const currentPartners = partners.slice(startIndex, startIndex + PARTNERS_PER_PAGE);
  const usernames = await Promise.all(currentPartners.map((partner) => resolveUsername(partner.userId)));
  const rows = currentPartners.map(
    (partner, index) =>
      `**${startIndex + index + 1}.**${usernames[index] || UNKNOWN_USERNAME} - <:VC_Partner:1482527213780729896> ${partner.score} partnership`,
  );
  const titleSuffix = isWeekly ? "Settimanale (dom 20:00 → dom 20:00)" : "Totale";
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle(`<a:VC_Winner:1482535294757507255> Classifica Partnership (${titleSuffix})`)
    .setDescription(rows.join("\n"))
    .setFooter({ text: `Pagina ${currentPage} di ${totalPages}` })
    .setTimestamp();
}

function createUsernameResolver(client) {
  const usernameCache = new Map();
  const pendingFetches = new Map();
  return async (userId) => {
    const key = String(userId || "");
    if (!key) return UNKNOWN_USERNAME;
    if (usernameCache.has(key)) return usernameCache.get(key);
    const cachedUser = client.users.cache.get(key);
    if (cachedUser?.username) {
      usernameCache.set(key, cachedUser.username);
      return cachedUser.username;
    }
    if (pendingFetches.has(key)) return pendingFetches.get(key);
    const fetchPromise = client.users
      .fetch(key)
      .then((user) => {
        const username = user?.username || UNKNOWN_USERNAME;
        usernameCache.set(key, username);
        pendingFetches.delete(key);
        return username;
      })
      .catch(() => {
        pendingFetches.delete(key);
        usernameCache.set(key, UNKNOWN_USERNAME);
        return UNKNOWN_USERNAME;
      });
    pendingFetches.set(key, fetchPromise);
    return fetchPromise;
  };
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
      .setCustomId(`${PLB_MODE_PREFIX}totale`)
      .setLabel("Totale")
      .setStyle(active === "totale" ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${PLB_MODE_PREFIX}settimanale`)
      .setLabel("Settimanale")
      .setStyle(active === "settimanale" ? ButtonStyle.Primary : ButtonStyle.Secondary),
  );
}

function buildPartnerLbNavRow(mode, currentPage, totalPages) {
  const m = mode === "settimanale" ? "settimanale" : "totale";
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${PLB_NAV_PREFIX}${m}:${currentPage}:p`)
      .setEmoji("<a:vegaleftarrow:1462914743416131816>")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(currentPage <= 1),
    new ButtonBuilder()
      .setCustomId(`${PLB_NAV_PREFIX}${m}:${currentPage}:n`)
      .setEmoji("<a:vegarightarrow:1443673039156936837>")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(currentPage >= totalPages),
  );
}

async function buildPartnerLeaderboardPayload(client, guild, mode = "totale", page = 1) {
  const isWeekly = mode === "settimanale";
  const partners = await fetchSortedPartners(guild, isWeekly);
  const toggleRow = buildPartnerLbToggleRow(isWeekly ? "settimanale" : "totale");
  if (!partners.length) {
    return { embeds: [buildNoDataEmbed(isWeekly)], components: [toggleRow] };
  }
  const totalPages = Math.max(1, Math.ceil(partners.length / PARTNERS_PER_PAGE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const resolveUsername = createUsernameResolver(client);
  const embed = await buildLeaderboardEmbed(partners, safePage, totalPages, isWeekly, resolveUsername);
  const components = [toggleRow];
  if (totalPages > 1) components.push(buildPartnerLbNavRow(isWeekly ? "settimanale" : "totale", safePage, totalPages));
  return { embeds: [embed], components };
}

module.exports = {
  PARTNERS_PER_PAGE,
  PLB_MODE_PREFIX,
  PLB_NAV_PREFIX,
  buildPartnerLeaderboardPayload,
  fetchSortedPartners,
  countValidAllTimePartners,
};