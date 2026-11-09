const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require("discord.js") as typeof import("discord.js");
const { TENANT_EMBED_COLOR } = require("../../../MultiGuild/utils/tenantEmbedBranding") as typeof import("../../../MultiGuild/utils/tenantEmbedBranding");
const { applyPartnershipPayloadBranding } = require("../../../MultiGuild/utils/tenantEmbedBranding") as typeof import("../../../MultiGuild/utils/tenantEmbedBranding");
const { applyDefaultFooterToEmbeds } = require("../../../shared/embeds/defaultFooter") as typeof import("../../../shared/embeds/defaultFooter");
const { fetchLeaderboardRows, findRankEntry, normalizeCategory, normalizePeriod } = require("../services/tenantLeaderboardService") as typeof import("../services/tenantLeaderboardService");
const { getPartnershipConfigSync } = require("../core/tenantPartnershipSettings") as typeof import("../core/tenantPartnershipSettings");
const { getManagedInvite } = require("../../../MultiGuild/services/guildJoinAlertService") as typeof import("../../../MultiGuild/services/guildJoinAlertService");
const { getPartnerManagerRoleId } = require("../core/partnershipConfigResolver") as typeof import("../core/partnershipConfigResolver");
const { formatUserLabel, fetchMembers, rankLabel } = require("../../Community/utils/leaderboardHelpers") as typeof import("../../Community/utils/leaderboardHelpers");
const { guildIconUrl } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");
const { t } = require("../i18n/tenantPartnershipI18n/index") as typeof import("../i18n/tenantPartnershipI18n/index");
const { TENANT_PARTNERSHIP_ARROWS } = require("./tenantPartnershipArrows") as typeof import("./tenantPartnershipArrows");
const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const PAGE_SIZE = 10;
const PREFIX = "tlb";

const CATEGORY_KEYS = {
  join: { label: "leaderboard_catJoin", desc: "leaderboard_joinDesc", intro: "leaderboard_joinIntro" },
  partners: { label: "leaderboard_catPartners", desc: "leaderboard_partnersDesc", intro: "leaderboard_partnersGlobal" },
  servers: { label: "leaderboard_catServers", desc: "leaderboard_serversDesc", intro: "leaderboard_serversIntro" },
};

const PERIOD_KEYS = {
  total: { label: "leaderboard_periodTotal", adj: "leaderboard_periodTotalAdj" },
  daily: { label: "leaderboard_periodDaily", adj: "leaderboard_periodDailyAdj" },
  weekly: { label: "leaderboard_periodWeekly", adj: "leaderboard_periodWeeklyAdj" },
};

function resolveLeaderboardScope(lang?, period?) {
  if (period === "daily") return t(lang, "leaderboard_periodDailyAdj");
  if (period === "weekly") return t(lang, "leaderboard_periodWeeklyAdj");
  return t(lang, "leaderboard_scopeGlobal");
}

function buildPartnersDescription(guild?, partnerGuildId?, period?, lang?) {
  const periodKey = PERIOD_KEYS[period]?.adj || PERIOD_KEYS.total.adj;
  const periodText = t(lang, periodKey);
  const scopedGuildId = String(partnerGuildId || "").trim();
  const isOtherServer = scopedGuildId && guild?.id && scopedGuildId !== guild.id;
  if (isOtherServer) {
    return t(lang, "leaderboard_partnersScoped", { period: periodText, guildId: scopedGuildId });
  }
  return t(lang, "leaderboard_partnersLocal", {
    period: periodText,
    guildName: guild?.name || t(lang, "history_thisServer"),
  });
}

function buildDescriptionIntro(category?, period?, lang?, guild?, partnerGuildId?) {
  if (category === "partners") {
    return buildPartnersDescription(guild, partnerGuildId, period, lang);
  }
  const scope = resolveLeaderboardScope(lang, period);
  const introKey = CATEGORY_KEYS[category]?.intro || CATEGORY_KEYS.servers.intro;
  return t(lang, introKey, { scope });
}

function resolvePartnerGuildScope(category?, sourceGuildId?, targetGuildId?) {
  if (normalizeCategory(category) !== "partners") return null;
  const explicit = String(targetGuildId || "").trim();
  if (/^\d{16,20}$/.test(explicit)) return explicit;
  const source = String(sourceGuildId || "").trim();
  return /^\d{16,20}$/.test(source) ? source : null;
}
function parseLeaderboardArgs(args = []) {
  let period = "total";
  let category = "servers";
  let targetGuildId = null;
  const tokens = (Array.isArray(args) ? args : []).map((t?) => String(t || "").trim()).filter(Boolean);

  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (["daily", "d", "week", "weekly", "w"].includes(lower)) {
      period = normalizePeriod(lower === "d" ? "daily" : lower === "w" || lower === "week" ? "weekly" : lower);
      continue;
    }
    if (["join", "joins", "partner", "partners", "pm", "server", "servers"].includes(lower)) {
      category = normalizeCategory(lower);
      continue;
    }
    if (/^\d{16,20}$/.test(token)) {
      targetGuildId = token;
      category = "partners";
      continue;
    }
  }

  return { period, category, targetGuildId, page: 1 };
}

function buildStateCustomId(action?, ownerId?, category?, period?, page?, targetGuildId?) {
  const tg = targetGuildId ? String(targetGuildId) : "0";
  return `${PREFIX}:${action}:${ownerId}:${category}:${period}:${page}:${tg}`;
}

function parseLeaderboardCustomId(customId?) {
  const parts = String(customId || "").split(":");
  if (parts.length < 7 || parts[0] !== PREFIX) return null;
  const action = parts[1];
  const ownerId = parts[2];
  const category = normalizeCategory(parts[3]);
  const period = normalizePeriod(parts[4]);
  const page = Math.max(1, Number.parseInt(parts[5], 10) || 1);
  const targetGuildId = parts[6] && parts[6] !== "0" ? parts[6] : null;
  if (!/^\d{16,20}$/.test(ownerId)) return null;
  return { action, ownerId, category, period, page, targetGuildId };
}

function escapeMd(value?) {
  return String(value || "")
    .replace(/([\\`*_~|>[\]()])/g, "\\$1")
    .replace(/\s+/g, " ")
    .trim();
}

async function resolveGuildInviteUrl(client?, guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid) return null;
  const cfg = getPartnershipConfigSync(gid);
  const fromPartnership = String(cfg?.invite?.url || "").trim();
  if (fromPartnership) return fromPartnership;
  const managed = await getManagedInvite(gid).catch(() => null);
  if (managed?.url) return String(managed.url).trim();
  const guild = client?.guilds?.cache?.get(gid) || (await client?.guilds?.fetch?.(gid).catch(() => null));
  if (!guild) return null;
  const me = guild.members?.me;
  if (!me) return null;
  const channel = guild.systemChannel || guild.channels?.cache?.find((ch?) => ch?.isTextBased?.() && ch.permissionsFor(me)?.has("CreateInstantInvite"));
  if (!channel) return null;
  const invite = await channel.createInvite({ maxAge: 0, maxUses: 0, reason: "Tenant leaderboard link" }).catch(() => null);
  return invite?.url || null;
}

async function resolveGuildDisplay(client?, guildId?) {
  const gid = String(guildId || "").trim();
  const cached = client?.guilds?.cache?.get(gid);
  const guild = cached || (await client?.guilds?.fetch?.(gid).catch(() => null));
  const name = guild?.name || gid;
  const url = await resolveGuildInviteUrl(client, gid);
  const safeName = escapeMd(name);
  return url ? `[${safeName}](${url})` : safeName;
}

function formatScoreLine(score?, category?, lang?) {
  const n = Math.max(0, Number(score) || 0);
  if (category === "join") {
    const unit = t(lang, "leaderboard_unitJoin");
    return `${E.VC_Reply} __${n}__ ${unit}`;
  }
  const unit = t(lang, "leaderboard_unitPartnership");
  return `${E.VC_Reply} __${n}__ ${unit} ${E.VC_Partner}`;
}

async function buildLeaderboardLines(client?, category?, rows?, page?, guildForMembers?, lang?) {
  const start = (page - 1) * PAGE_SIZE;
  const slice = rows.slice(start, start + PAGE_SIZE);
  const lines = [];

  if (category === "partners") {
    const userIds = slice.map((r?) => r.userId).filter(Boolean);
    const members = guildForMembers ? await fetchMembers(guildForMembers, userIds) : new Map();
    for (let i = 0; i < slice.length; i += 1) {
      const row = slice[i];
      const globalIndex = start + i;
      const member = members.get(row.userId);
      const label = formatUserLabel(member, row.userId);
      lines.push(`${rankLabel(globalIndex)} ${label}`);
      lines.push(formatScoreLine(row.score, category, lang));
    }
    return lines;
  }

  for (let i = 0; i < slice.length; i += 1) {
    const row = slice[i];
    const globalIndex = start + i;
    const label = await resolveGuildDisplay(client, row.guildId);
    lines.push(`${rankLabel(globalIndex)} ${label}`);
    lines.push(formatScoreLine(row.score, category, lang));
  }
  return lines;
}

async function buildDetachedRow(client?, category?, rows?, context?, lang?) {
  if (!rows.length) return null;
  const pageStart = (context.page - 1) * PAGE_SIZE + 1;
  const pageEnd = context.page * PAGE_SIZE;
  const inPage = (rank?) => rank >= pageStart && rank <= pageEnd;

  const formatDetached = (rank?, label?, score?) =>
    `\n${rankLabel(rank - 1)} ${label}\n${formatScoreLine(score, category, lang)}`;

  if (category === "partners" && context.partnerGuildId && context.viewerUserId) {
    const entry = findRankEntry(rows, (r?) => String(r.userId) === String(context.viewerUserId));
    if (!entry || inPage(entry.rank)) return null;
    const members = context.guild ? await fetchMembers(context.guild, [entry.row.userId]) : new Map();
    const label = formatUserLabel(members.get(entry.row.userId), entry.row.userId);
    return formatDetached(entry.rank, label, entry.row.score);
  }

  if ((category === "servers" || category === "join") && context.sourceGuildId) {
    const entry = findRankEntry(rows, (r?) => String(r.guildId) === String(context.sourceGuildId));
    if (!entry || inPage(entry.rank)) return null;
    const label = await resolveGuildDisplay(client, entry.row.guildId);
    return formatDetached(entry.rank, label, entry.row.score);
  }

  return null;
}

async function filterPartnerRowsForGuildPm(client?, partnerGuildId?, rows?) {
  const guildId = String(partnerGuildId || "").trim();
  const roleId = String(getPartnerManagerRoleId(guildId) || "").trim();
  if (!roleId || !rows.length || !guildId) return rows;
  const guild =
    client?.guilds?.cache?.get(guildId) ||
    (await client?.guilds?.fetch?.(guildId).catch(() => null));
  if (!guild) return rows;
  const members = await fetchMembers(guild, rows.map((r?) => r.userId));
  return rows.filter((row?) => members.get(row.userId)?.roles?.cache?.has(roleId));
}

async function buildLeaderboardPayload(client?, guild?, state?, viewerUserId?) {
  const lang = state.lang || "it";
  const category = normalizeCategory(state.category);
  const period = normalizePeriod(state.period);
  const page = Math.max(1, Number(state.page) || 1);
  const targetGuildId = state.targetGuildId || null;
  const partnerGuildId = resolvePartnerGuildScope(category, guild?.id, targetGuildId);
  const categoryMeta = CATEGORY_KEYS[category] || CATEGORY_KEYS.servers;
  const periodMeta = PERIOD_KEYS[period] || PERIOD_KEYS.total;

  let rows = await fetchLeaderboardRows(category, period, partnerGuildId, client);
  let partnerGuild = guild;
  if (category === "partners" && partnerGuildId) {
    partnerGuild =
      client?.guilds?.cache?.get(partnerGuildId) ||
      (await client?.guilds?.fetch?.(partnerGuildId).catch(() => null)) ||
      guild;
    rows = await filterPartnerRowsForGuildPm(client, partnerGuildId, rows);
  }
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const lines = await buildLeaderboardLines(
    client,
    category,
    rows,
    safePage,
    category === "partners" ? partnerGuild : null,
    lang,
  );

  const detached = await buildDetachedRow(client, category, rows, {
    page: safePage,
    sourceGuildId: guild?.id,
    partnerGuildId,
    viewerUserId,
    guild: partnerGuild,
    targetGuildId,
  }, lang);

  const descriptionIntro = buildDescriptionIntro(category, period, lang, guild, partnerGuildId);
  const description = [
    descriptionIntro,
    "",
    lines.length ? lines.join("\n") : t(lang, "leaderboard_empty"),
    detached || "",
  ].join("\n");

  const icon = guildIconUrl(guild, { size: 128 });
  const embed = new EmbedBuilder()
    .setColor(TENANT_EMBED_COLOR)
    .setAuthor(icon ? { name: guild.name, iconURL: icon } : { name: guild.name })
    .setDescription(description.slice(0, 4096))
    .setFooter({
      text: t(lang, "leaderboard_footerPage", {
        page: safePage,
        total: totalPages,
        category: t(lang, categoryMeta.label),
        period: t(lang, periodMeta.label),
      }),
    });

  const ownerId = String(state.ownerId || viewerUserId || "").trim();
  const components = buildLeaderboardComponents(
    ownerId,
    category,
    period,
    safePage,
    totalPages,
    guild?.id,
    partnerGuildId,
    lang,
  );

  const payload = applyPartnershipPayloadBranding(
    applyDefaultFooterToEmbeds({ embeds: [embed], components }, guild),
    { guildId: guild.id, guild, client },
  );

  return { payload, totalPages, page: safePage };
}

function buildLeaderboardComponents(ownerId?, category?, period?, page?, totalPages?, sourceGuildId?, targetGuildId?, lang = "it") {
  const cat = normalizeCategory(category);
  const per = normalizePeriod(period);
  const scopeGuildId = resolvePartnerGuildScope(cat, sourceGuildId, targetGuildId);
  const tg = scopeGuildId || "0";

  const select = new StringSelectMenuBuilder()
    .setCustomId(buildStateCustomId("cat", ownerId, cat, per, page, tg))
    .setPlaceholder(t(lang, "leaderboard_selectPlaceholder"))
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel(t(lang, CATEGORY_KEYS.join.label))
        .setEmoji(TENANT_PARTNERSHIP_ARROWS.up)
        .setDescription(t(lang, CATEGORY_KEYS.join.desc))
        .setValue("join")
        .setDefault(cat === "join"),
      new StringSelectMenuOptionBuilder()
        .setLabel(t(lang, CATEGORY_KEYS.partners.label))
        .setEmoji(E["981353partner"])
        .setDescription(t(lang, CATEGORY_KEYS.partners.desc))
        .setValue("partners")
        .setDefault(cat === "partners"),
      new StringSelectMenuOptionBuilder()
        .setLabel(t(lang, CATEGORY_KEYS.servers.label))
        .setEmoji(E["510611star"])
        .setDescription(t(lang, CATEGORY_KEYS.servers.desc))
        .setValue("servers")
        .setDefault(cat === "servers"),
    );

  const rows = [new ActionRowBuilder().addComponents(select)];

  if (totalPages > 1) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(buildStateCustomId("prev", ownerId, cat, per, page, tg))
          .setStyle(ButtonStyle.Secondary)
          .setEmoji(TENANT_PARTNERSHIP_ARROWS.left)
          .setDisabled(page <= 1),
        new ButtonBuilder()
          .setCustomId(buildStateCustomId("page", ownerId, cat, per, page, tg))
          .setStyle(ButtonStyle.Secondary)
          .setLabel(`${page}/${totalPages}`)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId(buildStateCustomId("next", ownerId, cat, per, page, tg))
          .setStyle(ButtonStyle.Secondary)
          .setEmoji(TENANT_PARTNERSHIP_ARROWS.right)
          .setDisabled(page >= totalPages),
      ),
    );
  }

  return rows;
}

export = { PAGE_SIZE, PREFIX, parseLeaderboardArgs, parseLeaderboardCustomId, buildLeaderboardPayload, buildStateCustomId, resolveGuildInviteUrl };