const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js") as typeof import("discord.js");
const { TENANT_EMBED_COLOR } = require("../../MultiGuild/utils/tenantEmbedBranding") as typeof import("../../MultiGuild/utils/tenantEmbedBranding");
const { applyPartnershipPayloadBranding } = require("../../MultiGuild/utils/tenantEmbedBranding") as typeof import("../../MultiGuild/utils/tenantEmbedBranding");
const { safePanelMessageUpdate } = require("../../../shared/discord/replyRuntime") as typeof import("../../../shared/discord/replyRuntime");
const { applyDefaultFooterToEmbeds } = require("../../../shared/embeds/defaultFooter") as typeof import("../../../shared/embeds/defaultFooter");
const { getDevIds } = require("../../Moderation/utils/commandPermissions") as typeof import("../../Moderation/utils/commandPermissions");
const { memberDisplayName, userAvatarUrlDynamic } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");
const { TENANT_PROFILE_SECTIONS, OBJECTIVES_PER_PAGE, NOTIFICATIONS_LIMIT, BADGE_DEFS, MAX_SELECTED_BADGES, BADGES_BROWSE_PER_PAGE, TENANT_PROFILE_BADGE_ARROWS, TENANT_PARTNERSHIP_ARROWS, t, getLanguageFlag, getLanguageLabel, LANGUAGE_PICKER_ROWS } = require("./tenantProfileConstants") as typeof import("./tenantProfileConstants");
const { getTenantProfileSnapshot } = require("../services/tenantProfileProgressService") as typeof import("../services/tenantProfileProgressService");
const { listTenantStaffNotifications, countUnreadNotifications } = require("../services/tenantStaffNotificationService") as typeof import("../services/tenantStaffNotificationService");
const { getTenantProfilePrefs } = require("../services/tenantProfilePreferencesService") as typeof import("../services/tenantProfilePreferencesService");
const { embedTwoColumnStack } = require("../../../shared/discord/embedTwoColumnFields") as typeof import("../../../shared/discord/embedTwoColumnFields");
const { formatTenantEmoji, toButtonEmoji } = require("./tenantPartnershipEmojis") as typeof import("./tenantPartnershipEmojis");
const SNOWFLAKE_RE = /^\d{16,20}$/;
const PREFIX = "tprof:";

function inlineCode(value?) {
  return `\`${String(value ?? "").replace(/`/g, "'")}\``;
}

function isBotDev(userId?, client?) {
  const uid = String(userId || "").trim();
  if (!uid) return false;
  return getDevIds(client).includes(uid);
}

function buildStateCustomId(action?, guildId?, ownerId?, targetUserId?, extra = "") {
  const base = `${PREFIX}${action}:${guildId}:${ownerId}:${targetUserId}`;
  return extra ? `${base}:${extra}` : base;
}

function parseProfileCustomId(customId?) {
  const raw = String(customId || "");
  if (!raw.startsWith(PREFIX)) return null;
  const body = raw.slice(PREFIX.length);
  const parts = body.split(":");
  const action = String(parts[0] || "").trim();
  const guildId = String(parts[1] || "").trim();
  const ownerId = String(parts[2] || "").trim();
  const targetUserId = String(parts[3] || "").trim();
  const extra = parts.slice(4).join(":");
  if (!action || !SNOWFLAKE_RE.test(guildId) || !SNOWFLAKE_RE.test(ownerId) || !SNOWFLAKE_RE.test(targetUserId)) {
    return null;
  }
  return { action, guildId, ownerId, targetUserId, extra };
}

function navButton(label?, emoji?, customId?, style = ButtonStyle.Secondary, disabled = false) {
  const btn = new ButtonBuilder().setCustomId(customId).setStyle(style).setDisabled(disabled);
  const resolvedEmoji = toButtonEmoji(emoji);
  if (resolvedEmoji) btn.setEmoji(resolvedEmoji);
  if (label) btn.setLabel(label);
  return btn;
}

function buildMainNavRow(state?, activeSection?) {
  const { guildId, ownerId, targetUserId } = state;
  const isBadgesSection =
    activeSection === TENANT_PROFILE_SECTIONS.BADGES ||
    activeSection === TENANT_PROFILE_SECTIONS.BADGE_SELECT ||
    activeSection === TENANT_PROFILE_SECTIONS.BADGE_BROWSE;
  const mk = (section?, emoji?, activeMatch = null) =>
    navButton(
      null,
      emoji,
      buildStateCustomId(section, guildId, ownerId, targetUserId),
      (activeMatch ?? activeSection) === section ? ButtonStyle.Primary : ButtonStyle.Secondary,
    );
  return new ActionRowBuilder().addComponents(
    mk(TENANT_PROFILE_SECTIONS.NOTIFICATIONS, "bell"),
    mk(TENANT_PROFILE_SECTIONS.OBJECTIVES, "giveaway"),
    mk(
      TENANT_PROFILE_SECTIONS.BADGES,
      "star",
      isBadgesSection ? TENANT_PROFILE_SECTIONS.BADGES : null,
    ),
    mk(TENANT_PROFILE_SECTIONS.SETTINGS, "staff"),
  );
}

function buildBackRow(state?) {
  return new ActionRowBuilder().addComponents(
    navButton(
      null,
      TENANT_PARTNERSHIP_ARROWS.left,
      buildStateCustomId(TENANT_PROFILE_SECTIONS.HOME, state.guildId, state.ownerId, state.targetUserId),
    ),
  );
}

function paginateRows(items?, page?, perPage?) {
  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * perPage;
  return {
    page: safePage,
    totalPages,
    slice: items.slice(start, start + perPage),
  };
}

async function resolveDisplayUser(client?, guild?, userId?) {
  const member =
    guild?.members?.cache?.get(userId) ||
    (await guild?.members?.fetch?.(userId).catch(() => null));
  const user =
    member?.user ||
    client?.users?.cache?.get(userId) ||
    (await client?.users?.fetch?.(userId).catch(() => null));
  const username = memberDisplayName(member || user) || `User ${userId}`;
  const avatarUrl = userAvatarUrlDynamic(member || user, { size: 256 }) || null;
  return { member, user, username, avatarUrl };
}

function profileStatLine(icon?, label?, value?) {
  return `${icon} **${label}:** ${value}`;
}

async function buildHomeEmbed(client?, guild?, targetUserId?, snapshot?) {
  const { avatarUrl } = await resolveDisplayUser(client, guild, targetUserId);
  const lang = snapshot.lang;
  const notifications = await listTenantStaffNotifications(guild.id, NOTIFICATIONS_LIMIT);
  const alerts = countUnreadNotifications(notifications, snapshot.prefs.notificationsReadAt);
  const selected = (snapshot.prefs.selectedBadges || [])
    .map((id?) => resolveBadgeEmoji(snapshot, id))
    .filter(Boolean);
  const badgesValue = selected.length ? selected.join(" ") : inlineCode("—");
  const descriptionLines = [
    `<:VC_Mention:1482526855289634997> **${t(lang, "user")}:** <@${targetUserId}>`,
    `${formatTenantEmoji("search")} **${t(lang, "id")}:** ${inlineCode(targetUserId)}`,
  ];
  if (isBotDev(targetUserId, client)) {
    descriptionLines.push(
      `${formatTenantEmoji("staffBadge")} **${t(lang, "admin")}:** ${inlineCode(t(lang, "true"))}`,
    );
  }

  return new EmbedBuilder()
    .setColor(TENANT_EMBED_COLOR)
    .setThumbnail(avatarUrl || null)
    .setDescription(descriptionLines.join("\n"))
    .addFields(
      ...embedTwoColumnStack(
        [
          profileStatLine(formatTenantEmoji("bell"), t(lang, "alerts"), inlineCode(alerts)),
          profileStatLine(formatTenantEmoji("giveaway"), t(lang, "awards"), inlineCode(`${snapshot.awardsPercent}%`)),
          profileStatLine(formatTenantEmoji("star"), t(lang, "badges"), badgesValue),
        ],
        [
          profileStatLine(formatTenantEmoji("partner"), t(lang, "count"), inlineCode(snapshot.scores.total)),
          profileStatLine(formatTenantEmoji("bolt"), t(lang, "daily"), inlineCode(snapshot.scores.daily)),
          profileStatLine(formatTenantEmoji("planet"), t(lang, "weekly"), inlineCode(snapshot.scores.weekly)),
        ],
      ),
    );
}

function buildNotificationsEmbed(lang?, notifications?) {
  const intro = t(lang, "notificationsTitle", { n: NOTIFICATIONS_LIMIT });
  const body = notifications.length
    ? notifications.map((row?) => row.content).join("\n\n")
    : t(lang, "notificationsEmpty");
  return new EmbedBuilder()
    .setColor(TENANT_EMBED_COLOR)
    .setDescription(`${intro}\n\`\`\`\n${body.slice(0, 3800)}\n\`\`\``);
}

function formatObjectiveLine(row?) {
  return `${row.emoji} **${row.title}**\n> ${row.desc}`;
}

function buildObjectivesEmbed(lang?, objectives?, page?) {
  const pending = objectives.filter((row?) => !row.progress.done);
  const completedCount = objectives.length - pending.length;
  const title = pending.length ? t(lang, "objectivesTitle") : t(lang, "objectivesUnlockedTitle");
  const { slice, page: safePage, totalPages } = paginateRows(objectives, page, OBJECTIVES_PER_PAGE);
  const lines = slice.map((row?) => formatObjectiveLine(row));
  if (!lines.length) lines.push(t(lang, "notificationsEmpty"));
  const embed = new EmbedBuilder()
    .setColor(TENANT_EMBED_COLOR)
    .setDescription(`${title}\n\n${lines.join("\n")}`);
  return { embed, page: safePage, totalPages, completedCount, totalCount: objectives.length };
}

function buildBadgesEmbed(lang?, viewOnly = false) {
  return new EmbedBuilder()
    .setColor(TENANT_EMBED_COLOR)
    .setDescription(viewOnly ? t(lang, "badgesViewOnlyTitle") : t(lang, "badgesSelectTitle"));
}

function resolveBadgeDef(badgeId?) {
  return BADGE_DEFS.find((row?) => row.id === badgeId) || null;
}

function resolveBadgeEmoji(snapshot?, badgeId?) {
  return snapshot.badgeMap.get(badgeId)?.emoji || resolveBadgeDef(badgeId)?.emoji || "🎯";
}

function buildSelectedSlotButton(state?, snapshot?, slotIndex?) {
  const { guildId, ownerId, targetUserId, viewOnly } = state;
  const unlockedIds = new Set(snapshot.unlockedBadges.map((b?) => b.id));
  const selected = (snapshot.prefs.selectedBadges || []).slice(0, MAX_SELECTED_BADGES);
  const badgeId = selected[slotIndex];
  const badge = badgeId ? resolveBadgeDef(badgeId) : null;
  const badgeEmoji = badgeId ? resolveBadgeEmoji(snapshot, badgeId) : null;
  if (!badge || !unlockedIds.has(badge.id)) {
    return navButton(
      null,
      "➖",
      buildStateCustomId("noop", guildId, ownerId, targetUserId, `slot${slotIndex}`),
      ButtonStyle.Secondary,
      true,
    );
  }
  if (viewOnly) {
    return navButton(
      null,
      badgeEmoji,
      buildStateCustomId("noop", guildId, ownerId, targetUserId, `viewslot${slotIndex}`),
      ButtonStyle.Secondary,
      true,
    );
  }
  return navButton(
    null,
    badgeEmoji,
    buildStateCustomId("bsel_slot", guildId, ownerId, targetUserId, String(slotIndex)),
    ButtonStyle.Secondary,
  );
}

function buildBadgeToggleButton(state?, snapshot?, badge?) {
  const unlockedIds = new Set(snapshot.unlockedBadges.map((b?) => b.id));
  const unlocked = unlockedIds.has(badge.id);
  return new ButtonBuilder()
    .setCustomId(
      buildStateCustomId("bsel_toggle", state.guildId, state.ownerId, state.targetUserId, badge.id),
    )
    .setEmoji(toButtonEmoji(resolveBadgeEmoji(snapshot, badge.id)))
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(!unlocked || Boolean(state.viewOnly));
}

function buildBadgeGridRow(state?, snapshot?, badges?, padKeyPrefix?) {
  const row = new ActionRowBuilder();
  for (let i = 0; i < 4; i += 1) {
    const badge = badges[i];
    if (badge) {
      row.addComponents(buildBadgeToggleButton(state, snapshot, badge));
    } else {
      row.addComponents(
        navButton(
          null,
          "➖",
          buildStateCustomId("noop", state.guildId, state.ownerId, state.targetUserId, `${padKeyPrefix}${i}`),
          ButtonStyle.Secondary,
          true,
        ),
      );
    }
  }
  return row;
}

function isBadgeBrowsePanel(message?) {
  for (const row of message?.components || []) {
    for (const comp of row?.components || []) {
      const parsed = parseProfileCustomId(comp?.customId);
      if (!parsed) continue;
      if (parsed.action === "bbrowse_p") return true;
      if (parsed.action === "noop" && /^r[123]p\d+/.test(String(parsed.extra || ""))) return true;
    }
  }
  return false;
}

function readBadgeBrowsePageFromMessage(message?) {
  for (const row of message?.components || []) {
    for (const comp of row?.components || []) {
      const parsed = parseProfileCustomId(comp?.customId);
      if (!parsed || parsed.action !== "noop") continue;
      const match = String(parsed.extra || "").match(/^r[123]p(\d+)/);
      if (match) return Math.max(1, Number(match[1]) || 1);
    }
  }
  return 1;
}

function buildBadgeBrowsePaginationRow(state?, snapshot?, trailingBadges?, page?, totalPages?) {
  const safePage = Math.min(Math.max(1, page), totalPages);
  const row = new ActionRowBuilder().addComponents(
    navButton(
      null,
      TENANT_PARTNERSHIP_ARROWS.left,
      buildStateCustomId("bbrowse_p", state.guildId, state.ownerId, state.targetUserId, String(Math.max(1, safePage - 1))),
      ButtonStyle.Secondary,
      safePage <= 1,
    ),
  );
  for (let i = 0; i < 2; i += 1) {
    const badge = trailingBadges[i];
    if (badge) {
      row.addComponents(buildBadgeToggleButton(state, snapshot, badge));
    } else {
      row.addComponents(
        navButton(
          null,
          "➖",
          buildStateCustomId("noop", state.guildId, state.ownerId, state.targetUserId, `bbpad${safePage}${i}`),
          ButtonStyle.Secondary,
          true,
        ),
      );
    }
  }
  row.addComponents(
    navButton(
      null,
      TENANT_PARTNERSHIP_ARROWS.right,
      buildStateCustomId("bbrowse_p", state.guildId, state.ownerId, state.targetUserId, String(Math.min(totalPages, safePage + 1))),
      ButtonStyle.Secondary,
      safePage >= totalPages,
    ),
  );
  return row;
}

function buildBadgesCompactRow(state?, snapshot?, { expanded = false } = {}) {
  const { guildId, ownerId, targetUserId } = state;
  return new ActionRowBuilder().addComponents(
    navButton(
      null,
      TENANT_PROFILE_BADGE_ARROWS.back,
      buildStateCustomId(TENANT_PROFILE_SECTIONS.HOME, guildId, ownerId, targetUserId),
    ),
    buildSelectedSlotButton(state, snapshot, 0),
    buildSelectedSlotButton(state, snapshot, 1),
    navButton(
      null,
      expanded ? TENANT_PROFILE_BADGE_ARROWS.collapseUp : TENANT_PROFILE_BADGE_ARROWS.expandDown,
      expanded
        ? buildStateCustomId("badge_collapse", guildId, ownerId, targetUserId, "toggle")
        : buildStateCustomId(TENANT_PROFILE_SECTIONS.BADGE_BROWSE, guildId, ownerId, targetUserId),
    ),
  );
}

function buildBadgesCompactComponents(state?, snapshot?) {
  const lang = snapshot.lang;
  return {
    embed: buildBadgesEmbed(lang, Boolean(state.viewOnly)),
    components: [buildBadgesCompactRow(state, snapshot)],
  };
}

function buildBadgeBrowseComponents(state?, snapshot?, page?) {
  const lang = snapshot.lang;
  const { slice, page: safePage, totalPages } = paginateRows(BADGE_DEFS, page, BADGES_BROWSE_PER_PAGE);
  const rows = [
    buildBadgesCompactRow(state, snapshot, { expanded: true }),
    buildBadgeGridRow(state, snapshot, slice.slice(0, 4), `r1p${safePage}`),
    buildBadgeGridRow(state, snapshot, slice.slice(4, 8), `r2p${safePage}`),
    buildBadgeGridRow(state, snapshot, slice.slice(8, 12), `r3p${safePage}`),
    buildBadgeBrowsePaginationRow(state, snapshot, slice.slice(12, 14), safePage, totalPages),
  ];
  return { embed: buildBadgesEmbed(lang, Boolean(state.viewOnly)), components: rows };
}

function buildSettingsEmbed(lang?, prefs?, viewOnly = false) {
  const langLabel = getLanguageLabel(lang);
  return new EmbedBuilder()
    .setColor(TENANT_EMBED_COLOR)
    .setDescription(
      [
        viewOnly ? t(lang, "settingsViewOnlyTitle") : t(lang, "settingsTitle"),
        "",
        `<:VC_Mention:1482526855289634997> **${t(lang, "pings")}:** ${inlineCode(prefs.suppressManagerPing ? t(lang, "true") : t(lang, "false"))}`,
        `> ${t(lang, "pingsHint")}`,
        "",
        `${formatTenantEmoji("locked")} **${t(lang, "privacy")}:** ${inlineCode(prefs.ephemeralCommands ? t(lang, "true") : t(lang, "false"))}`,
        `> ${t(lang, "privacyHint")}`,
        "",
        `${formatTenantEmoji("website")} **${t(lang, "language")}:** ${inlineCode(langLabel)}`,
        `> ${t(lang, "languageHint")}`,
      ].join("\n"),
    );
}

function buildLanguageEmbed(lang?) {
  return new EmbedBuilder()
    .setColor(TENANT_EMBED_COLOR)
    .setDescription(t(lang, "languagePickerTitle"));
}

function buildLanguageRows(state?, activeLanguage?) {
  const { guildId, ownerId, targetUserId, viewOnly } = state;
  return LANGUAGE_PICKER_ROWS.map((codes?, index?) => {
    const buttons = codes.map((code?) =>
      navButton(
        null,
        getLanguageFlag(code),
        buildStateCustomId("lang_pick", guildId, ownerId, targetUserId, code),
        activeLanguage === code ? ButtonStyle.Primary : ButtonStyle.Secondary,
        Boolean(viewOnly),
      ),
    );
    if (index === LANGUAGE_PICKER_ROWS.length - 1) {
      buttons.push(
        navButton(
          null,
          TENANT_PARTNERSHIP_ARROWS.left,
          buildStateCustomId(TENANT_PROFILE_SECTIONS.SETTINGS, guildId, ownerId, targetUserId),
        ),
      );
    }
    return new ActionRowBuilder().addComponents(...buttons);
  });
}

function buildSettingsRows(state?, activeLanguage = "it") {
  const { guildId, ownerId, targetUserId, viewOnly } = state;
  if (viewOnly) {
    return [
      new ActionRowBuilder().addComponents(
        navButton(null, TENANT_PARTNERSHIP_ARROWS.left, buildStateCustomId(TENANT_PROFILE_SECTIONS.HOME, guildId, ownerId, targetUserId)),
      ),
    ];
  }
  return [
    new ActionRowBuilder().addComponents(
      navButton(null, TENANT_PARTNERSHIP_ARROWS.left, buildStateCustomId(TENANT_PROFILE_SECTIONS.HOME, guildId, ownerId, targetUserId)),
      navButton(null, "<:VC_Mention:1482526855289634997>", buildStateCustomId("set_pings", guildId, ownerId, targetUserId)),
      navButton(null, "locked", buildStateCustomId("set_privacy", guildId, ownerId, targetUserId)),
      navButton(null, getLanguageFlag(activeLanguage), buildStateCustomId("open_lang", guildId, ownerId, targetUserId)),
    ),
  ];
}

function buildPaginationRow(state?, prefix?, page?, totalPages?, options: Record<string, any> = {}) {
  const prevToHome = Boolean(options.prevToHome);
  const centerLabel = options.centerLabel || `${page} / ${totalPages}`;
  const prevCustomId =
    page <= 1 && prevToHome
      ? buildStateCustomId(TENANT_PROFILE_SECTIONS.HOME, state.guildId, state.ownerId, state.targetUserId)
      : buildStateCustomId(`${prefix}_p`, state.guildId, state.ownerId, state.targetUserId, String(Math.max(1, page - 1)));
  return new ActionRowBuilder().addComponents(
    navButton(null, TENANT_PARTNERSHIP_ARROWS.left, prevCustomId, ButtonStyle.Secondary, page <= 1 && !prevToHome),
    navButton(centerLabel, null, buildStateCustomId("noop", state.guildId, state.ownerId, state.targetUserId), ButtonStyle.Secondary, true),
    navButton(null, TENANT_PARTNERSHIP_ARROWS.right, buildStateCustomId(`${prefix}_p`, state.guildId, state.ownerId, state.targetUserId, String(Math.min(totalPages, page + 1))), ButtonStyle.Secondary, page >= totalPages),
  );
}

async function buildTenantProfilePayload(client?, guild?, options: Record<string, any> = {}) {
  const guildId = String(guild?.id || "").trim();
  const ownerId = String(options.ownerId || options.targetUserId || "").trim();
  const targetUserId = String(options.targetUserId || ownerId).trim();
  const section = String(options.section || TENANT_PROFILE_SECTIONS.HOME).trim();
  const page = Math.max(1, Number(options.page) || 1);

  const snapshot = await getTenantProfileSnapshot(guildId, targetUserId, {
    langUserId: ownerId,
    client,
    guildPreferredLocale: guild?.preferredLocale,
    discordLocale: options.discordLocale,
    userId: ownerId,
  });
  const lang = snapshot.lang;
  const viewOnly = ownerId !== targetUserId;
  const state = { guildId, ownerId, targetUserId, viewOnly };

  if (viewOnly) {
    const embed = await buildHomeEmbed(client, guild, targetUserId, snapshot);
    return wrapPayload(guild, client, embed, [], lang);
  }

  let embed;
  let components = [];

  if (section === TENANT_PROFILE_SECTIONS.HOME) {
    embed = await buildHomeEmbed(client, guild, targetUserId, snapshot);
    components = [buildMainNavRow(state, section)];
  } else if (section === TENANT_PROFILE_SECTIONS.NOTIFICATIONS) {
    const notifications = await listTenantStaffNotifications(guildId, NOTIFICATIONS_LIMIT);
    embed = buildNotificationsEmbed(lang, notifications);
    components = [buildBackRow(state)];
  } else if (section === TENANT_PROFILE_SECTIONS.OBJECTIVES) {
    const built = buildObjectivesEmbed(lang, snapshot.objectives, page);
    embed = built.embed;
    components = [
      buildPaginationRow(state, "obj", built.page, built.totalPages, {
        prevToHome: true,
        centerLabel: `${built.completedCount} / ${built.totalCount}`,
      }),
    ];
  } else if (section === TENANT_PROFILE_SECTIONS.BADGES || section === TENANT_PROFILE_SECTIONS.BADGE_SELECT) {
    const built = buildBadgesCompactComponents(state, snapshot);
    return wrapPayload(guild, client, built.embed, built.components, lang);
  } else if (section === TENANT_PROFILE_SECTIONS.BADGE_BROWSE) {
    const built = buildBadgeBrowseComponents(state, snapshot, page);
    return wrapPayload(guild, client, built.embed, built.components, lang);
  } else if (section === TENANT_PROFILE_SECTIONS.SETTINGS) {
    embed = buildSettingsEmbed(lang, snapshot.prefs, viewOnly);
    components = buildSettingsRows(state, lang);
  } else if (section === TENANT_PROFILE_SECTIONS.LANGUAGE) {
    embed = buildLanguageEmbed(lang);
    components = buildLanguageRows(state, lang);
  } else {
    embed = await buildHomeEmbed(client, guild, targetUserId, snapshot);
    components = [buildMainNavRow(state, TENANT_PROFILE_SECTIONS.HOME)];
  }

  return wrapPayload(guild, client, embed, components, lang);
}

function wrapPayload(guild?, client?, embed?, components?, lang = "it") {
  embed.setFooter({ text: t(lang, "footerCopyright") });
  return applyPartnershipPayloadBranding(
    applyDefaultFooterToEmbeds(
      {
        embeds: [embed],
        components: components.filter(Boolean),
        allowedMentions: { repliedUser: false },
      },
      guild,
    ),
    { guildId: guild?.id, guild, client },
  );
}

async function ensurePanelInteractionDeferred(interaction?) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => {});
  }
}

async function safeUpdateTenantProfilePanel(interaction?, payload?) {
  return safePanelMessageUpdate(interaction, payload);
}

export = {
  PREFIX,
  buildStateCustomId,
  parseProfileCustomId,
  buildTenantProfilePayload,
  safeUpdateTenantProfilePanel,
  ensurePanelInteractionDeferred,
  isBotDev,
  TENANT_PROFILE_SECTIONS,
  MAX_SELECTED_BADGES,
  isBadgeBrowsePanel,
  readBadgeBrowsePageFromMessage,
};