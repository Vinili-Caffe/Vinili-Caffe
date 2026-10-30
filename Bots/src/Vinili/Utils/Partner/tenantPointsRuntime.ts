const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
} = require("discord.js") as typeof import("discord.js");
const { TENANT_EMBED_COLOR } = require("../../MultiGuild/utils/tenantEmbedBranding") as typeof import("../../MultiGuild/utils/tenantEmbedBranding");
const { applyPartnershipPayloadBranding } = require("../../MultiGuild/utils/tenantEmbedBranding") as typeof import("../../MultiGuild/utils/tenantEmbedBranding");
const { applyDefaultFooterToEmbeds } = require("../Embeds/defaultFooter") as typeof import("../Embeds/defaultFooter");
const { getUserPartnershipScoresForGuild } = require("../../Services/Partner/tenantLeaderboardService") as typeof import("../../Services/Partner/tenantLeaderboardService");
const { buildTenantLookupNotFoundPayload } = require("./tenantLookupNotFoundRuntime") as typeof import("./tenantLookupNotFoundRuntime");
const {
  memberDisplayName,
  userAvatarUrlDynamic,
} = require("../Discord/guildDiscordIdentity") as typeof import("../Discord/guildDiscordIdentity");
const { memberHasPartnerManagerRole, isPartnershipOperational } = require("./partnershipConfigResolver") as typeof import("./partnershipConfigResolver");
const { partnersChatPartnerCommandDeniedReplyContent } = require("./partnersChatChannelUtils") as typeof import("./partnersChatChannelUtils");
const { replyInteractionSetupRequired } = require("./tenantSetupRequiredReply") as typeof import("./tenantSetupRequiredReply");
const { t } = require("./tenantPartnershipI18n/index") as typeof import("./tenantPartnershipI18n/index");
const SNOWFLAKE_RE = /^\d{16,20}$/;
const POINTS_ADD_PREFIX = "tpts:a:";
const POINTS_REMOVE_PREFIX = "tpts:r:";
const POINTS_MODAL_PREFIX = "tpts:m:";
const POINTS_AMOUNT_INPUT_ID = "tpts_amount";
const MAX_POINTS_AMOUNT = 10_000;

function inlineCode(value?) {
  return `\`${String(value ?? "").replace(/`/g, "'")}\``;
}

function parseTenantPointsControlId(customId?) {
  const raw = String(customId || "");
  let action = "";
  let body = "";
  if (raw.startsWith(POINTS_MODAL_PREFIX)) {
    body = raw.slice(POINTS_MODAL_PREFIX.length);
    const parts = body.split(":");
    action = String(parts[0] || "").trim();
    body = parts.slice(1).join(":");
  } else if (raw.startsWith(POINTS_ADD_PREFIX)) {
    action = "add";
    body = raw.slice(POINTS_ADD_PREFIX.length);
  } else if (raw.startsWith(POINTS_REMOVE_PREFIX)) {
    action = "remove";
    body = raw.slice(POINTS_REMOVE_PREFIX.length);
  } else {
    return null;
  }
  if (action !== "add" && action !== "remove") return null;

  const parts = String(body || "").split(":");
  const guildId = String(parts[0] || "").trim();
  const targetUserId = String(parts[1] || "").trim();
  const ownerId = String(parts[2] || "").trim();
  if (!SNOWFLAKE_RE.test(guildId) || !SNOWFLAKE_RE.test(targetUserId) || !SNOWFLAKE_RE.test(ownerId)) {
    return null;
  }
  return { action, guildId, targetUserId, ownerId, isModal: raw.startsWith(POINTS_MODAL_PREFIX) };
}

function buildTenantPointsButtonId(action?, guildId?, targetUserId?, ownerId?) {
  const prefix = action === "add" ? POINTS_ADD_PREFIX : POINTS_REMOVE_PREFIX;
  return `${prefix}${String(guildId)}:${String(targetUserId)}:${String(ownerId)}`;
}

function buildTenantPointsModalId(action?, guildId?, targetUserId?, ownerId?) {
  return `${POINTS_MODAL_PREFIX}${action}:${String(guildId)}:${String(targetUserId)}:${String(ownerId)}`;
}

function canManageTenantPoints(actorMember?, targetMember?, guildId?) {
  if (!actorMember?.permissions?.has?.(PermissionFlagsBits.Administrator)) return false;
  if (!targetMember || !memberHasPartnerManagerRole(targetMember, guildId)) return false;
  return true;
}

async function resolveTargetMember(guild?, client?, userId?) {
  const uid = String(userId || "").trim();
  if (!SNOWFLAKE_RE.test(uid)) return { member: null, user: null };

  const member =
    guild?.members?.cache?.get(uid) ||
    (await guild?.members?.fetch?.(uid).catch(() => null));
  if (member?.user) return { member, user: member.user };

  const user =
    client?.users?.cache?.get(uid) ||
    (await client?.users?.fetch?.(uid).catch(() => null));
  return { member: null, user };
}

function buildTenantPointsComponents(guildId?, targetUserId?, ownerId?, lang = "it") {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(buildTenantPointsButtonId("add", guildId, targetUserId, ownerId))
        .setStyle(ButtonStyle.Success)
        .setLabel(t(lang, "points_add"))
        .setEmoji("<:success:1461731530333229226>"),
      new ButtonBuilder()
        .setCustomId(buildTenantPointsButtonId("remove", guildId, targetUserId, ownerId))
        .setStyle(ButtonStyle.Danger)
        .setLabel(t(lang, "points_remove"))
        .setEmoji("<:cancel:1461730653677551691>"),
    ),
  ];
}

function buildTenantPointsModal(action?, guildId?, targetUserId?, ownerId?, lang = "it") {
  const title = action === "add" ? t(lang, "points_modalAdd") : t(lang, "points_modalRemove");
  return new ModalBuilder()
    .setCustomId(buildTenantPointsModalId(action, guildId, targetUserId, ownerId))
    .setTitle(title.slice(0, 45))
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(POINTS_AMOUNT_INPUT_ID)
          .setLabel(t(lang, "points_amount"))
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(5)
          .setPlaceholder(t(lang, "points_placeholder")),
      ),
    );
}

function parsePointsAmount(raw?) {
  const amount = Number.parseInt(String(raw || "").trim(), 10);
  if (!Number.isInteger(amount) || amount < 1) return null;
  if (amount > MAX_POINTS_AMOUNT) return null;
  return amount;
}

async function buildTenantPointsPayload(client?, guild?, options: Record<string, any> = {}) {
  const lang = options.lang || "it";
  const lookupContext = { guild, client, lang };
  const explicitUserId = options.userId ? String(options.userId).trim() : null;

  if (options.invalidId || (explicitUserId && !SNOWFLAKE_RE.test(explicitUserId))) {
    return buildTenantLookupNotFoundPayload("user", lookupContext);
  }

  const guildId = String(guild?.id || "").trim();
  const targetUserId = explicitUserId || String(options.fallbackUserId || "").trim();
  if (!SNOWFLAKE_RE.test(targetUserId) || !SNOWFLAKE_RE.test(guildId)) {
    return {
      content: t(lang, "points_usage"),
      allowedMentions: { repliedUser: false },
    };
  }

  const { member, user } = await resolveTargetMember(guild, client, targetUserId);
  if (explicitUserId && !user && !member) {
    return buildTenantLookupNotFoundPayload("user", lookupContext);
  }

  const scores = await getUserPartnershipScoresForGuild(guildId, targetUserId);
  const displayUser = user || member?.user || null;
  const username = memberDisplayName(member || displayUser) || `User ${targetUserId}`;
  const avatarUrl = userAvatarUrlDynamic(member || displayUser, { size: 256 }) || null;

  const ownerId = String(options.ownerId || options.requesterMember?.id || "").trim();
  let requesterMember = options.requesterMember || null;
  if (!requesterMember && ownerId && guild) {
    requesterMember =
      guild.members?.cache?.get(ownerId) ||
      (await guild.members.fetch(ownerId).catch(() => null));
  }

  const showManageButtons =
    SNOWFLAKE_RE.test(ownerId) && canManageTenantPoints(requesterMember, member, guildId);

  const embed = new EmbedBuilder()
    .setColor(TENANT_EMBED_COLOR)
    .setThumbnail(avatarUrl || null)
    .setDescription(
      [
        t(lang, "points_intro", { username, guildName: guild.name }),
        t(lang, "points_statsNote"),
        "",
        `<:250885giveaway:1524730537770746006> **Points:** ${inlineCode(scores.points)}`,
        `<:981353partner:1524730506531311688> **${t(lang, "count")}:** ${inlineCode(scores.total)}`,
        `<:709897bolt:1524730543122681988> **${t(lang, "daily")}:** ${inlineCode(scores.daily)}`,
        `<:7619planet:1524730515436077187> **${t(lang, "weekly")}:** ${inlineCode(scores.weekly)}`,
      ].join("\n"),
    );

  const components = showManageButtons
    ? buildTenantPointsComponents(guildId, targetUserId, ownerId, lang)
    : [];

  return applyPartnershipPayloadBranding(
    applyDefaultFooterToEmbeds(
      {
        embeds: [embed],
        components,
        allowedMentions: { repliedUser: false, users: [targetUserId] },
      },
      guild,
    ),
    { guildId, guild, client },
  );
}

const EPHEMERAL_FLAG = 1 << 6;

async function executeTenantPointsContextMenu(interaction?, action?) {
  const guild = interaction.guild;
  if (!guild?.id) {
    await interaction.reply({
      content: "<a:VC_Cross:1482532424570376253> Comando disponibile solo in un server.",
      flags: EPHEMERAL_FLAG,
    }).catch(() => null);
    return;
  }

  if (!isPartnershipOperational(guild.id)) {
    await replyInteractionSetupRequired(interaction);
    return;
  }

  const denied = await partnersChatPartnerCommandDeniedReplyContent(interaction.channel).catch(() => null);
  if (denied) {
    await interaction.reply({ content: denied, flags: EPHEMERAL_FLAG }).catch(() => null);
    return;
  }

  const targetUser = interaction.targetUser;
  if (!targetUser?.id) {
    await interaction.reply({
      content: "<a:VC_Cross:1482532424570376253> Indica un **utente** valido.",
      flags: EPHEMERAL_FLAG,
    }).catch(() => null);
    return;
  }

  const actorMember =
    interaction.member ||
    (await guild.members.fetch(interaction.user.id).catch(() => null));
  const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);

  if (!targetMember) {
    await interaction.reply({
      content: "<a:VC_Cross:1482532424570376253> L'utente deve essere **membro di questo server**.",
      flags: EPHEMERAL_FLAG,
    }).catch(() => null);
    return;
  }

  if (!memberHasPartnerManagerRole(targetMember, guild.id)) {
    await interaction.reply({
      content:
        "<a:VC_Cross:1482532424570376253> Puoi modificare i punti solo di utenti con il **ruolo Partner Manager** su questo server.",
      flags: EPHEMERAL_FLAG,
    }).catch(() => null);
    return;
  }

  if (!canManageTenantPoints(actorMember, targetMember, guild.id)) {
    await interaction.reply({
      content:
        "<a:VC_Cross:1482532424570376253> Solo un **Amministratore** può modificare i punti di un **Partner Manager**.",
      flags: EPHEMERAL_FLAG,
    }).catch(() => null);
    return;
  }

  const { resolveTenantLanguageForInteraction } = require("./tenantPartnershipPrefixMessages") as typeof import("./tenantPartnershipPrefixMessages");
  const lang = await resolveTenantLanguageForInteraction(interaction, interaction.user.id);
  const modal = buildTenantPointsModal(action, guild.id, targetUser.id, interaction.user.id, lang);
  await interaction.showModal(modal).catch(async () => {
    await interaction.reply({
      content: "<a:VC_Cross:1482532424570376253> Impossibile aprire il modulo.",
      flags: EPHEMERAL_FLAG,
    }).catch(() => null);
  });
}

export = {
  POINTS_ADD_PREFIX,
  POINTS_REMOVE_PREFIX,
  POINTS_MODAL_PREFIX,
  POINTS_AMOUNT_INPUT_ID,
  MAX_POINTS_AMOUNT,
  parseTenantPointsControlId,
  canManageTenantPoints,
  buildTenantPointsModal,
  buildTenantPointsPayload,
  parsePointsAmount,
  executeTenantPointsContextMenu,
};
