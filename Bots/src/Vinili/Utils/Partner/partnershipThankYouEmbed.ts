const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { guildIconUrl, guildMemberDisplayAvatarUrlDynamic } = require("../Discord/guildDiscordIdentity") as typeof import("../Discord/guildDiscordIdentity");
const { getGuildMemberCached } = require("../Interaction/interactionEntityCache") as typeof import("../Interaction/interactionEntityCache");
const { buildThankYouTemplateVars, applyPartnershipEmbedTemplate, parseEmbedColorInput } = require("./partnershipEmbedTemplate") as typeof import("./partnershipEmbedTemplate");
const { formatPartnershipManagerLine, stripTrailingManagerLine } = require("./partnershipMessageUtils") as typeof import("./partnershipMessageUtils");
const { embedHasMeaningfulContent } = require("../Embeds/embedMediaFallback") as typeof import("../Embeds/embedMediaFallback");

function resolveThankYouManagerOutsideEmbed(
  description?,
  managerId?,
  includeManagerInContent = false,
  badgeEmojis = null,
) {
  const raw = String(description || "").trim();
  const stripped = stripTrailingManagerLine(raw);
  const managerOutside =
    Boolean(managerId) && (Boolean(includeManagerInContent) || stripped !== raw);
  return {
    description: stripped,
    managerContent: managerOutside
      ? formatPartnershipManagerLine(managerId, badgeEmojis).trim()
      : null,
  };
}

/* thankYouSpendableOnly1: “Ora sei a X partner” = solo saldo spendibile
   ({user.points}/{points} = earned − shop). Niente totale fatti / riga extra. */
const DEFAULT_THANK_YOU_DESCRIPTION_BASE =
  `<a:ThankYou:1329504268369002507> Grazie per aver _effettuato_ una **partner** con \`{guild}\`
<:mariolevelup:1443679595084910634> Ora sei a **\`{user.points}\`** partner!
<:Money:1330544713463500970> Continua ad __effettuare__ partner per riscattare i **premi**.`;

function resolveDefaultThankYouDescription(guildId = null) {
  return DEFAULT_THANK_YOU_DESCRIPTION_BASE;
}

const DEFAULT_THANK_YOU_EMBED_FIELDS = Object.freeze({
  color: "",
  authorIconUrl: "",
  authorName: "{user.username}",
  title: "**<:partneredserverowner:1443651871125409812> __PARTNER EFFETTUATA__**",
  thumbnailUrl: "",
  description: resolveDefaultThankYouDescription(null),
  imageUrl: "",
  footerText: "{partner.name}",
  footerIconUrl: "",
  timestampEnabled: true,
});

function defaultThankYouEmbedFieldsForGuild(guildId = null) {
  return {
    ...DEFAULT_THANK_YOU_EMBED_FIELDS,
    description: resolveDefaultThankYouDescription(guildId),
  };
}

function hasThankYouEmbedContent(thankYouEmbed?) {
  if (!thankYouEmbed || typeof thankYouEmbed !== "object") return false;
  if (thankYouEmbed.enabled === true) return true;
  return Boolean(
    thankYouEmbed.color ||
      thankYouEmbed.authorIconUrl ||
      thankYouEmbed.authorName ||
      thankYouEmbed.title ||
      thankYouEmbed.thumbnailUrl ||
      thankYouEmbed.description ||
      thankYouEmbed.imageUrl ||
      thankYouEmbed.footerText ||
      thankYouEmbed.footerIconUrl ||
      thankYouEmbed.timestampEnabled === false,
  );
}

function resolveThankYouEmbedEditorValues(thankYouEmbed?, guildId = null) {
  const defaults = defaultThankYouEmbedFieldsForGuild(guildId);
  const saved = thankYouEmbed && typeof thankYouEmbed === "object" ? thankYouEmbed : {};
  const pick = (key?) => {
    const value = saved[key];
    if (value === null || value === undefined) return defaults[key];
    if (typeof value === "string" && !value.trim() && key !== "color") {
      return defaults[key];
    }
    return value;
  };
  return {
    color: pick("color"),
    authorIconUrl: pick("authorIconUrl"),
    authorName: pick("authorName"),
    title: pick("title"),
    thumbnailUrl: pick("thumbnailUrl"),
    description: pick("description"),
    imageUrl: pick("imageUrl"),
    footerText: pick("footerText"),
    footerIconUrl: pick("footerIconUrl"),
    timestampEnabled: saved.timestampEnabled === false ? false : true,
  };
}

function truncateModalValue(value?, max = 4000) {
  const text = String(value ?? "");
  return text.length > max ? text.slice(0, max) : text;
}

function formatThankYouEmbedValueForModal(value?) {
  return String(value ?? "")
    .replace(/<a?:[^\s>]+:\d+>/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function seedDefaultThankYouEmbedIfEmpty(guildId?) {
  const {
    getPartnershipConfigSync,
    savePartnershipConfig,
    normalizeThankYouEmbed,
  } = require("../../MultiGuild/core/tenantPartnershipSettings") as typeof import("../../MultiGuild/core/tenantPartnershipSettings");
  const prev = getPartnershipConfigSync(guildId);
  const saved = prev?.thankYouEmbed;
  if (saved?.description && saved?.title) {
    return { ok: true, seeded: false };
  }
  const result = await savePartnershipConfig(guildId, {
    thankYouEmbed: normalizeThankYouEmbed({
      ...defaultThankYouEmbedFieldsForGuild(guildId),
      enabled: false,
    }),
  });
  return { ...result, seeded: Boolean(result?.ok) };
}

async function buildThankYouEmbed({
  guild,
  actorMember,
  partnershipCfg,
  serverName,
  serverIcon,
  shownPartnerPoints,
  totalPartnerEarned = null,
  legacy = false,
  managerId = null,
  appendManagerToDescription = false,
  includeManagerInContent = false,
  staffPartnerActions = [],
  pingPlan = null,
}) {
  const customRaw = partnershipCfg?.thankYouEmbed;
  let custom = customRaw;
  if (custom && guild?.id) {
    try {
      const { isTenantPremiumActive } = require("../../MultiGuild/core/tenantPremium") as typeof import("../../MultiGuild/core/tenantPremium");
      const premium = await isTenantPremiumActive(guild.id);
      if (!premium) custom = null;
    } catch (_) {
      custom = null;
    }
  }

  const putManagerOutside =
    Boolean(includeManagerInContent) || Boolean(appendManagerToDescription);

  let managerMember = null;
  if (managerId && guild) {
    managerMember = await getGuildMemberCached(guild, managerId).catch(() => null);
  }

  let managerBadgeEmojis = [];
  if (managerId && guild?.id) {
    try {
      const { resolveManagerSelectedBadgeEmojis } = require("../../MultiGuild/services/Partner/tenantProfilePreferencesService") as typeof import("../../MultiGuild/services/Partner/tenantProfilePreferencesService");
      managerBadgeEmojis = await resolveManagerSelectedBadgeEmojis(guild.id, managerId);
    } catch {
      managerBadgeEmojis = [];
    }
  }

  const templateVars = buildThankYouTemplateVars({
    guild,
    actorMember,
    managerId,
    managerMember,
    managerBadgeEmojis,
    partnershipCfg,
    partnerServerName: serverName,
    partnerIcon: serverIcon,
    shownPartnerPoints,
    totalPartnerEarned:
      totalPartnerEarned != null ? totalPartnerEarned : shownPartnerPoints,
    staffPartnerActions,
    pingPlan,
  });

  if (hasThankYouEmbedContent(custom)) {
    const fields = resolveThankYouEmbedEditorValues(custom, guild?.id);
    const embed = new EmbedBuilder();
    const color = parseEmbedColorInput(fields.color) || "#6f4e37";
    embed.setColor(color);

    const title = fields.title
      ? applyPartnershipEmbedTemplate(fields.title, templateVars)
      : `**<:partneredserverowner:1443651871125409812> __PARTNER EFFETTUATA__**`;
    if (title) embed.setTitle(title);

    let description = fields.description
      ? applyPartnershipEmbedTemplate(fields.description, templateVars)
      : applyPartnershipEmbedTemplate(resolveDefaultThankYouDescription(guild?.id), templateVars);
    const resolved = resolveThankYouManagerOutsideEmbed(
      description,
      managerId,
      putManagerOutside,
      managerBadgeEmojis,
    );
    description = resolved.description;
    if (description) embed.setDescription(description);

    const authorName = fields.authorName
      ? applyPartnershipEmbedTemplate(fields.authorName, templateVars)
      : templateVars.actorLabel;
    const authorIcon =
      (fields.authorIconUrl
        ? applyPartnershipEmbedTemplate(fields.authorIconUrl, templateVars)
        : "") ||
      guildMemberDisplayAvatarUrlDynamic(actorMember) ||
      undefined;
    if (authorName) {
      embed.setAuthor({ name: authorName.slice(0, 256), iconURL: authorIcon || undefined });
    }

    const thumbnail =
      (fields.thumbnailUrl
        ? applyPartnershipEmbedTemplate(fields.thumbnailUrl, templateVars)
        : "") ||
      guildIconUrl(guild, { size: 256 }) ||
      undefined;
    if (thumbnail) embed.setThumbnail(thumbnail);

    const imageUrl = fields.imageUrl
      ? applyPartnershipEmbedTemplate(fields.imageUrl, templateVars)
      : "";
    if (imageUrl) embed.setImage(imageUrl);

    const footerText = fields.footerText
      ? applyPartnershipEmbedTemplate(fields.footerText, templateVars)
      : serverName || templateVars.partnerServerName || undefined;
    const footerIcon =
      (fields.footerIconUrl
        ? applyPartnershipEmbedTemplate(fields.footerIconUrl, templateVars)
        : "") ||
      serverIcon ||
      undefined;
    if (footerText) {
      embed.setFooter({ text: footerText.slice(0, 2048), iconURL: footerIcon || undefined });
    }

    if (fields.timestampEnabled !== false) embed.setTimestamp();

    if (embedHasMeaningfulContent(embed)) {
      return { embed, managerContent: resolved.managerContent };
    }
  }

  const defaultResolved = resolveThankYouManagerOutsideEmbed(
    applyPartnershipEmbedTemplate(resolveDefaultThankYouDescription(guild?.id), templateVars),
    managerId,
    putManagerOutside,
    managerBadgeEmojis,
  );

  const embed = new EmbedBuilder()
    .setAuthor({
      name: templateVars.actorLabel,
      iconURL: guildMemberDisplayAvatarUrlDynamic(actorMember) || undefined,
    })
    .setTitle(`**<:partneredserverowner:1443651871125409812> __PARTNER EFFETTUATA__**`)
    .setDescription(defaultResolved.description)
    .setFooter({ text: serverName || "Server", iconURL: serverIcon || undefined })
    .setColor("#6f4e37")
    .setTimestamp()
    .setThumbnail(guildIconUrl(guild, { size: 256 }) || undefined);

  return { embed, managerContent: defaultResolved.managerContent };
}

export = {
  DEFAULT_THANK_YOU_EMBED_FIELDS,
  resolveDefaultThankYouDescription,
  defaultThankYouEmbedFieldsForGuild,
  hasThankYouEmbedContent,
  resolveThankYouEmbedEditorValues,
  truncateModalValue,
  formatThankYouEmbedValueForModal,
  seedDefaultThankYouEmbedIfEmpty,
  buildThankYouEmbed,
  resolveThankYouManagerOutsideEmbed,
};
