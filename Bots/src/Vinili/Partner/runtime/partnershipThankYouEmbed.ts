const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { guildIconUrl, guildMemberDisplayAvatarUrlDynamic } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");
const { getGuildMemberCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { buildThankYouTemplateVars, applyPartnershipEmbedTemplate, parseEmbedColorInput } = require("./partnershipEmbedTemplate") as typeof import("./partnershipEmbedTemplate");
const { formatPartnershipManagerLine, stripTrailingManagerLine } = require("./partnershipMessageUtils") as typeof import("./partnershipMessageUtils");
const { embedHasMeaningfulContent } = require("../../../shared/embeds/embedMediaFallback") as typeof import("../../../shared/embeds/embedMediaFallback");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
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
  `${E.ThankYou} Grazie per aver _effettuato_ una **partner** con \`{guild}\`
${E.mariolevelup} Ora sei a **\`{user.points}\`** partner!
${E.Money} Continua ad __effettuare__ partner per riscattare i **premi**.`;

function resolveDefaultThankYouDescription(guildId = null) {
  return DEFAULT_THANK_YOU_DESCRIPTION_BASE;
}

const DEFAULT_THANK_YOU_EMBED_FIELDS = Object.freeze({
  color: "",
  authorIconUrl: "",
  authorName: "{user.username}",
  title: `**${E.partneredserverowner} __PARTNER EFFETTUATA__**`,
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
  } = require("../../Partner/core/tenantPartnershipSettings") as typeof import("../../Partner/core/tenantPartnershipSettings");
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
      const { isTenantPremiumActive } = require("../../../MultiGuild/core/tenantPremium") as typeof import("../../../MultiGuild/core/tenantPremium");
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
      const { resolveManagerSelectedBadgeEmojis } = require("../../Partner/services/tenantProfilePreferencesService") as typeof import("../../Partner/services/tenantProfilePreferencesService");
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

  /* messaggio completo della dashboard: segnaposto della partnership in ogni testo, poi corpo Discord */
  if (custom?.draft && typeof custom.draft === "object") {
    try {
      const T = require("../../../MultiGuild/core/tenantCommunityTools") as typeof import("../../../MultiGuild/core/tenantCommunityTools");
      const draft = T.normalizeDraft(custom.draft);
      if (!T.draftIsEmpty(draft)) {
        const fillDeep = (v?) =>
          typeof v === "string" ? applyPartnershipEmbedTemplate(v, templateVars) : Array.isArray(v) ? v.map(fillDeep) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fillDeep(x)])) : v;
        const body = T.buildMessageBody(fillDeep(draft), {});
        return { embed: null, body, managerContent: null };
      }
    } catch (err) {
      global.logger?.warn?.("[PARTNER] ringraziamento completo:", (err as any)?.message || err);
    }
  }

  if (hasThankYouEmbedContent(custom)) {
    const fields = resolveThankYouEmbedEditorValues(custom, guild?.id);
    const embed = new EmbedBuilder();
    const color = parseEmbedColorInput(fields.color) || "#6f4e37";
    embed.setColor(color);

    const title = fields.title
      ? applyPartnershipEmbedTemplate(fields.title, templateVars)
      : `**${E.partneredserverowner} __PARTNER EFFETTUATA__**`;
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
      return { embed, body: null, managerContent: resolved.managerContent };
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
    .setTitle(`**${E.partneredserverowner} __PARTNER EFFETTUATA__**`)
    .setDescription(defaultResolved.description)
    .setFooter({ text: serverName || "Server", iconURL: serverIcon || undefined })
    .setColor("#6f4e37")
    .setTimestamp()
    .setThumbnail(guildIconUrl(guild, { size: 256 }) || undefined);

  return { embed, body: null, managerContent: defaultResolved.managerContent };
}

/**
 * Manda il ringraziamento: embed classico o messaggio completo della dashboard.
 * `above` = ping/riga sopra; con Components V2 (niente testo libero) parte come messaggio a sé prima.
 * Ritorna il messaggio inviato (con id) o null.
 */
async function sendThankYouMessage(channel?, ty?, above?: string | null, allowedMentions?) {
  if (!channel || !ty) return null;
  if (!ty.body) {
    const payload: Record<string, any> = { embeds: [ty.embed] };
    if (above) {
      payload.content = above;
      if (allowedMentions) payload.allowedMentions = allowedMentions;
    }
    return channel.send(payload).catch(() => null);
  }
  const { Routes } = require("discord.js") as typeof import("discord.js");
  const body: Record<string, any> = { ...ty.body };
  const isV2 = (Number(body.flags) & 32768) === 32768;
  if (above) {
    if (isV2) {
      await channel.send({ content: above, ...(allowedMentions ? { allowedMentions } : {}) }).catch(() => null);
    } else {
      body.content = [above, body.content].filter(Boolean).join("\n").slice(0, 2000);
      if (allowedMentions) body.allowed_mentions = { parse: allowedMentions.parse || [], users: allowedMentions.users || [], roles: allowedMentions.roles || [] };
    }
  }
  return channel.client.rest.post(Routes.channelMessages(channel.id), { body }).catch((err?) => {
    global.logger?.warn?.("[PARTNER] invio ringraziamento:", err?.rawError?.message || err?.message || err);
    return null;
  });
}

export = {
  defaultThankYouEmbedFieldsForGuild,
  hasThankYouEmbedContent,
  resolveThankYouEmbedEditorValues,
  truncateModalValue,
  formatThankYouEmbedValueForModal,
  seedDefaultThankYouEmbedIfEmpty,
  buildThankYouEmbed,
  sendThankYouMessage,
};
