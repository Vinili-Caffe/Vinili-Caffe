const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize } = require("discord.js") as typeof import("discord.js");
const { decrementQuoteCount } = require("../Utils/Quote/quoteCounter") as typeof import("../Utils/Quote/quoteCounter");
const { ROLE_MULTIPLIERS } = require("../Services/Community/expService") as typeof import("../Services/Community/expService");
const { AvatarPrivacy, BannerPrivacy, ActivityUserProfile, } = require("../Schemas/Community/communitySchemas") as typeof import("../Schemas/Community/communitySchemas");
const IDs = require("../Utils/Config/ids") as typeof import("../Utils/Config/ids");
const { MENTION_RESPONSE_PERK_BODY, MENTION_RESPONSE_PERK_LINE_DISCORD } = require("../Utils/Community/mentionResponseAccessUtils") as typeof import("../Utils/Community/mentionResponseAccessUtils");
const { siteTicketsPageDiscordRef } = require("../../shared/web/siteTicketsPageRef") as typeof import("../../shared/web/siteTicketsPageRef");
const { getGuildMemberCached, getUserCached } = require("../Utils/Interaction/interactionEntityCache") as typeof import("../Utils/Interaction/interactionEntityCache");
const { checkButtonPermission, checkStringSelectPermission, buildGlobalPermissionDeniedEmbed, buildGlobalChannelDeniedEmbed, buildGlobalNotYourControlEmbed, } = require("../Utils/Moderation/commandPermissions") as typeof import("../Utils/Moderation/commandPermissions");
const { applyDefaultFooterToEmbeds } = require("../Utils/Embeds/defaultFooter") as typeof import("../Utils/Embeds/defaultFooter");
const { TENANT_EMBED_COLOR } = require("../MultiGuild/utils/tenantEmbedBranding") as typeof import("../MultiGuild/utils/tenantEmbedBranding");
const { accountUsername, guildMemberDisplayAvatarUrlDynamic } = require("../Utils/Discord/guildDiscordIdentity") as typeof import("../Utils/Discord/guildDiscordIdentity");
const PRIVATE_FLAG = 1 << 6;
const MONO_GUILD_DENIED_TEXT = "Questo bot è utilizzabile solo sul server principale di Vinili & Caffè.";
const { MOD_RULE_DETAIL } = require("../Utils/Moderation/modRegolamentoConstants") as typeof import("../Utils/Moderation/modRegolamentoConstants");
const { buildStaffGuideSectionMarkdown } = require("../Utils/Staff/staffGuideContent") as typeof import("../Utils/Staff/staffGuideContent");
const {
  buildModerationGuideStickyPayload,
  moderationGuideEmbedColor,
} = require("../Utils/Moderation/moderationGuidePanelComponents") as typeof import("../Utils/Moderation/moderationGuidePanelComponents");

function v2Text(content?) {
  return new TextDisplayBuilder().setContent(String(content || ""));
}

function v2Separator() {
  return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
}

function v2PrivateFlags() {
  return PRIVATE_FLAG | MessageFlags.IsComponentsV2;
}
const IGNORED_BUTTON_LOG_CODES = new Set([
  10062,
  10015,
  10011,
  40060,
]);

function logButtonErr(err?, opts: Record<string, any> = {}) {
  if (!err) return;
  if (IGNORED_BUTTON_LOG_CODES.has(err?.code)) return;
  const msg = err?.message ?? err;
  if (
    typeof msg === "string" &&
    msg.startsWith("The reply to this interaction has already been sent or deferred.")
  ) {
    return;
  }
  if (opts.warn) global.logger?.warn?.("[buttons]", msg);
  else global.logger?.error?.("[buttons]", msg);
}

/** Sezioni guida staff Discord dismesse → /staff/guida/ (contenuto già sul sito via API). */
const DISCORD_STAFF_GUIDE_REDIRECT_IDS = new Set([
  "warnstaff",
  "pex",
  "valutazioni",
  "pause",
  "limiti",
  "lineeguida",
  "comandi",
  "compiti_fissi",
  "guidapartners",
  "guidamiddle",
  "middle_ticket",
  "middle_selfie",
  "middle_follower",
  "middle_partnership",
  "regole_staff",
]);

async function replyStaffGuideMovedToSite(interaction?) {
  let url = "https://www.viniliecaffe.it/staff/guida/";
  try {
    const { siteWorkflowUrl } = require("../Web/discordWorkflowUiGate") as typeof import("../Web/discordWorkflowUiGate");
    url = siteWorkflowUrl("guida") || url;
  } catch (_) {}
  await interaction
    .reply({
      content: `<:discordstaff:1443651872258003005> La **guida staff** è sul sito: ${url}`,
      flags: PRIVATE_FLAG,
    })
    .catch((err?) => {
      logButtonErr(err);
      return null;
    });
  return true;
}

async function handleStaffButtons(interaction?) {
  if (!interaction.isButton()) return false;

  if (interaction.customId && interaction.customId.startsWith("staff_warn_depex:")) {
    let url = "https://www.viniliecaffe.it/user/?tab=staff";
    try {
      const { siteWorkflowUrl } = require("../Web/discordWorkflowUiGate") as typeof import("../Web/discordWorkflowUiGate");
      const base = siteWorkflowUrl("userProfile") || "https://www.viniliecaffe.it/user/";
      url = `${base}${base.includes("?") ? "&" : "?"}tab=staff`;
    } catch (_) {}
    await interaction
      .reply({
        content: `<:VC_Staff:1494286904089247754> Le azioni warn/depex si gestiscono sul **sito**: ${url}`,
        flags: PRIVATE_FLAG,
      })
      .catch((err?) => {
        logButtonErr(err);
        return null;
      });
    return true;
  }

  /* Sticky sanzioni utenti (#sanzioni) — resta su Discord. */
  if (interaction.customId == "moderazione_staff" || interaction.customId == "regolamento") {
    const payload = buildModerationGuideStickyPayload();
    await interaction
      .reply({ embeds: payload.embeds, components: payload.components, flags: PRIVATE_FLAG })
      .catch((err?) => {
        logButtonErr(err);
        return null;
      });
    return true;
  }

  if (DISCORD_STAFF_GUIDE_REDIRECT_IDS.has(String(interaction.customId || ""))) {
    return replyStaffGuideMovedToSite(interaction);
  }

  if (interaction.customId == "generalimoderazione") {
    const body = buildStaffGuideSectionMarkdown("generalimoderazione");
    const embed = new EmbedBuilder()
      .setColor(moderationGuideEmbedColor())
      .setDescription(body || "Sezione non disponibile.");
    await interaction.reply({ embeds: [embed], flags: PRIVATE_FLAG }).catch((err?) => { logButtonErr(err); return null; });
    return true;
  }

  if (interaction.customId == "testualimoderazione") {
    const body = buildStaffGuideSectionMarkdown("testualimoderazione");
    const embed = new EmbedBuilder()
      .setColor(moderationGuideEmbedColor())
      .setDescription(body || "Sezione non disponibile.");
    await interaction.reply({ embeds: [embed], flags: PRIVATE_FLAG }).catch((err?) => { logButtonErr(err); return null; });
    return true;
  }

  if (interaction.customId == "vocalimoderazione") {
    const body = buildStaffGuideSectionMarkdown("vocalimoderazione");
    const embed = new EmbedBuilder()
      .setColor(moderationGuideEmbedColor())
      .setDescription(body || "Sezione non disponibile.");
    await interaction.reply({ embeds: [embed], flags: PRIVATE_FLAG }).catch((err?) => { logButtonErr(err); return null; });
    return true;
  }

  return false;
}

function buildDeniedEmbedFromGate(gate?, kind?, interaction = null) {
  const guild = interaction?.guild ?? null;
  let embed = null;
  if (gate.reason === "not_owner") embed = buildGlobalNotYourControlEmbed();
  if (gate.reason === "mono_guild") {
    embed = buildGlobalPermissionDeniedEmbed([], kind, MONO_GUILD_DENIED_TEXT, guild);
  }
  if (gate.reason === "channel") {
    embed = buildGlobalChannelDeniedEmbed(gate.channels || [], kind, interaction?.member || null);
  }
  if (!embed) {
    embed = buildGlobalPermissionDeniedEmbed(gate.requiredRoles || [], kind, null, guild);
  }
  return embed;
}

async function enforceInteractionPermissions(interaction?) {
  if (interaction.isButton && interaction.isButton()) {
    const gate = await checkButtonPermission(interaction);
    if (!gate.allowed) {
      const customId = String(interaction.customId || "");
      const kind =
        customId.startsWith("repost_btn:") || customId.startsWith("repost_src:")
          ? "comando"
          : "bottone";
      const deniedEmbed = buildDeniedEmbedFromGate(gate, kind, interaction);
      await interaction
        .reply({ embeds: [deniedEmbed], flags: PRIVATE_FLAG })
        .catch((err?) => { logButtonErr(err); });
      return false;
    }
  }

  if (interaction.isStringSelectMenu && interaction.isStringSelectMenu()) {
    const gate = await checkStringSelectPermission(interaction);
    if (!gate.allowed) {
      const deniedEmbed = buildDeniedEmbedFromGate(gate, "menu", interaction);
      await interaction
        .reply({ embeds: [deniedEmbed], flags: PRIVATE_FLAG })
        .catch((err?) => { logButtonErr(err); });
      return false;
    }
  }

  if (interaction.isUserSelectMenu && interaction.isUserSelectMenu()) {
    const gate = await checkStringSelectPermission(interaction);
    if (!gate.allowed) {
      const deniedEmbed = buildDeniedEmbedFromGate(gate, "menu", interaction);
      await interaction
        .reply({ embeds: [deniedEmbed], flags: PRIVATE_FLAG })
        .catch((err?) => { logButtonErr(err); });
      return false;
    }
  }

  if (
    (interaction.isChannelSelectMenu && interaction.isChannelSelectMenu()) ||
    (interaction.isRoleSelectMenu && interaction.isRoleSelectMenu())
  ) {
    const gate = await checkStringSelectPermission(interaction);
    if (!gate.allowed) {
      const deniedEmbed = buildDeniedEmbedFromGate(gate, "menu", interaction);
      await interaction
        .reply({ embeds: [deniedEmbed], flags: PRIVATE_FLAG })
        .catch((err?) => { logButtonErr(err); });
      return false;
    }
  }

  return true;
}

async function resolveMentionLabel(interaction?, userId?) {
  let label = `<@${userId}>`;
  try {
    const member = await getGuildMemberCached(interaction.guild, userId);
    if (member) return `<@${member.user.id}>`;

    const user = await getUserCached(interaction.client, userId);
    if (user) label = `<@${user.id}>`;
  } catch (err) {
    logButtonErr(err, { warn: true });
  }
  return label;
}

async function sendPrivacyViewsLeaderboard(interaction?, kind?, title?) {
  await interaction.deferReply({ flags: PRIVATE_FLAG }).catch((err?) => { logButtonErr(err); return null; });
  const guildId = interaction.guild.id;
  const top = await ActivityUserProfile.find({ guildId }).sort({ [`profile.privacy.${kind}.views`]: -1 }).limit(10).lean().catch((err?) => { logButtonErr(err, { warn: true }); return []; });

  const rankEmojis = ["<:VC_1:1482706338021642333>", "<:VC_2:1482706376525611090>", "<:VC_3:1482706404773990460>", "<:VC_4:1482706432347344916>", "<:VC_5:1482706459765637272>", "<:VC_6:1482706490769801327>", "<:VC_7:1482706523330183218>", "<:VC_8:1482706553281708092>", "<:VC_9:1482706583438889051>", "<:VC_10:1482706613663174707>",];

  const lines = [];
  let idx = 1;
  for (const entry of top) {
    const views =
      kind === "banner"
        ? Number(entry?.profile?.privacy?.banner?.views ?? 0)
        : Number(entry?.profile?.privacy?.avatar?.views ?? 0);
    const label = await resolveMentionLabel(interaction, entry.userId);
    const rank = rankEmojis[idx - 1] || `${idx}.`;
    lines.push(
      `${rank} ${label} <a:VC_Arrow:1482706699365257397> **${views}** visualizzazioni`,
    );
    idx += 1;
  }

  const description = lines.length ? lines.join("\n") : "Nessuna visualizzazione registrata.";
  const time = new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", });
  const footerText = `Classifica richiesta da ${accountUsername(interaction.member || interaction.user)} \u2022 Oggi alle ${time}`;

  const embed = new EmbedBuilder()

    .setColor("#6f4e37")
    .setTitle(title)
    .setDescription(description)
    .setFooter({
      text: footerText,
      iconURL: guildMemberDisplayAvatarUrlDynamic(interaction.member || interaction.user) || undefined,
    });

  if (interaction.deferred) return interaction.editReply({ embeds: [embed] }).catch((err?) => { logButtonErr(err); return null; });
  return interaction.reply({ embeds: [embed], flags: PRIVATE_FLAG }).catch((err?) => { logButtonErr(err); return null; });
}

export = {

  async execute(interaction?, client?) {
    if (!interaction.guild) return;
    if (!interaction.message) return;
    if (interaction.replied || interaction.deferred) return;
    const allowed = await enforceInteractionPermissions(interaction);
    if (!allowed) return;
    const levelPanelIds = ["info_boost_levels", "info_levels", "torna_indietro"];
    let levelPanelDeferred = false;
    if (interaction.isButton() && interaction.customId === "info_boost_levels") {
      const deferred = await interaction.deferReply({ flags: PRIVATE_FLAG }).catch((err?) => { logButtonErr(err); return null; });
      levelPanelDeferred = !!deferred && !!interaction.deferred;
    }
    const guild = interaction.guild;
    const withFooter = (p?) => (p && typeof p === "object" && Array.isArray(p.embeds) && p.embeds.length ? applyDefaultFooterToEmbeds(p, guild) : p);
    const origReply = interaction.reply.bind(interaction);
    interaction.reply = (p?) => origReply(withFooter(p));
    const origEditReply = interaction.editReply.bind(interaction);
    interaction.editReply = (p?) => origEditReply(withFooter(p));
    const origUpdate = interaction.update?.bind(interaction);
    if (origUpdate) interaction.update = (p?) => origUpdate(withFooter(p));
    if (await handleStaffButtons(interaction)) return;
    if (!interaction.isButton()) return;

    if (
      interaction.customId &&
      interaction.customId.startsWith("avatar_unblock:")
    ) {
      const targetId = interaction.customId.split(":")[1] || "";
      if (!targetId) {
        return interaction.reply({
          content: "<:vegax:1443934876440068179> Link non valido.",
          flags: 1 << 6,
        }).catch((err?) => { logButtonErr(err); return null; });
      }
      if (interaction.user.id !== targetId) {
        return interaction.reply({
          content:
            "<:vegax:1443934876440068179> Non puoi sbloccare l'avatar di un altro utente.",
          flags: 1 << 6,
        }).catch((err?) => { logButtonErr(err); return null; });
      }
      try {
        await (AvatarPrivacy.findOneAndUpdate(
          { guildId: interaction.guild.id, userId: targetId },
          {
            $set: { blocked: false },
            $setOnInsert: { guildId: interaction.guild.id, userId: targetId },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        ) as any);
      } catch (err) {
        logButtonErr(err, { warn: true });
      }
      const embed = new EmbedBuilder().setColor("#6f4e37").setTitle("Comando sbloccato").setDescription("Hai sbloccato con successo la visualizzazione del tuo avatar.",);
      return interaction.reply({ embeds: [embed], flags: PRIVATE_FLAG });
    }

    if (
      interaction.customId &&
      interaction.customId.startsWith("banner_unblock:")
    ) {
      const targetId = interaction.customId.split(":")[1] || "";
      if (!targetId) {
        return interaction.reply({
          content: "<:vegax:1443934876440068179> Link non valido.",
          flags: 1 << 6,
        }).catch((err?) => { logButtonErr(err); return null; });
      }
      if (interaction.user.id !== targetId) {
        return interaction.reply({
          content:
            "<:vegax:1443934876440068179> Non puoi sbloccare il banner di un altro utente.",
          flags: 1 << 6,
        }).catch((err?) => { logButtonErr(err); return null; });
      }
      try {
        await (BannerPrivacy.findOneAndUpdate(
          { guildId: interaction.guild.id, userId: targetId },
          {
            $set: { blocked: false },
            $setOnInsert: { guildId: interaction.guild.id, userId: targetId },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        ) as any);
      } catch (err) {
        logButtonErr(err, { warn: true });
      }
      const embed = new EmbedBuilder().setColor("#6f4e37").setTitle("Comando sbloccato").setDescription("Hai sbloccato con successo la visualizzazione del tuo banner.",);
      return interaction.reply({ embeds: [embed], flags: PRIVATE_FLAG });
    }

    if (
      interaction.customId &&
      interaction.customId.startsWith("quote_remove:")
    ) {
      const parts = String(interaction.customId || "").split(":");
      if (!parts[1]) {
        return interaction.reply({
          content: "<:vegax:1443934876440068179> Link non valido.",
          flags: 1 << 6,
        }).catch((err?) => { logButtonErr(err); return null; });
      }
      const targetId = parts[1];
      const originChannelId = parts[2] || null;
      const originMessageId = parts[3] || null;
      if (interaction.user.id !== targetId) {
        const denied = new EmbedBuilder().setColor("#e74c3c").setTitle("<:vegax:1443934876440068179> Accesso negato").setDescription("Solo l'autore della citazione può rimuoverla.");
        return interaction.reply({ embeds: [denied], flags: PRIVATE_FLAG });
      }
      const now = new Date();
      const dateStr = now.toLocaleDateString("it-IT");
      const timeStr = now.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", });
      const removedEmbed = new EmbedBuilder().setColor(TENANT_EMBED_COLOR).setTitle("\u{1F5D1}\uFE0F Citazione rimossa").setDescription("Questa citazione è stata rimossa dall'autore.").addFields({
        name: "Rimossa da", value: `<@${interaction.user.id}>`,
        inline: true,
      },
        {
          name: "Data rimozione",
          value: `${dateStr} ${timeStr}`,
          inline: true,
        },
      )
        .setFooter({
          text: `Puoi bloccare le future quote tramite la pagina [Personalizza](https://www.viniliecaffe.it/personalizza/) \u2022 Oggi alle ${timeStr}`,
        });
      if (originChannelId && originMessageId && originMessageId !== "0") {
        const originChannel = interaction.guild?.channels?.cache?.get(originChannelId) || (await interaction.guild?.channels?.fetch(originChannelId).catch((err?) => { logButtonErr(err); return null; }));
        if (originChannel?.isTextBased?.()) {
          const originMessage = await originChannel.messages.fetch(originMessageId).catch((err?) => { logButtonErr(err); return null; });
          if (originMessage) await originMessage.delete().catch((err?) => { logButtonErr(err); });
        }
      }
      try {
        await decrementQuoteCount(interaction.guild?.id);
      } catch (err) {
        logButtonErr(err, { warn: true });
      }
      try {
        const { deleteQuoteBoardRecordByMessage } = require("../Utils/Quote/quoteBoardService") as typeof import("../Utils/Quote/quoteBoardService");
        await deleteQuoteBoardRecordByMessage(
          interaction.guild?.id,
          interaction.channel?.id,
          interaction.message?.id,
        );
      } catch (err) {
        logButtonErr(err, { warn: true });
      }
      return interaction
        .update({ embeds: [removedEmbed], components: [], files: [], attachments: [] })
        .catch(async (err?) => {
          logButtonErr(err, { warn: true });
          await interaction
            .reply({ embeds: [removedEmbed], flags: PRIVATE_FLAG })
            .catch((e?) => { logButtonErr(e); });
        });
    }

    if (interaction.customId == "metodi") {
      await interaction.reply({
        components: [
          v2Text("<:Money:1330544713463500970> Per effettuare una sponsor con __Vinili & Caffè__ ci sono due modalità: **pagando** oppure esponendo una **collaborazione** in un " + siteTicketsPageDiscordRef("HIGH STAFF") + "."),
          v2Separator(),
          v2Text([
            "<:VC_Dot:1482532364222595303> **€1,50** <a:VC_Arrow:1482706699365257397> sponsor per **2** settimane",
            "<:VC_Dot:1482532364222595303> **€3** <a:VC_Arrow:1482706699365257397> sponsor per **1** mese",
            "<:VC_Dot:1482532364222595303> **€5** <a:VC_Arrow:1482706699365257397> sponsor **lifetime**",
          ].join("\n")),
        ],
        flags: v2PrivateFlags(),
      }).catch((err?) => { logButtonErr(err); return null; });
    }
    if (interaction.customId == "ping") {
      await interaction.reply({
        components: [
          v2Text("<:Discord_Mention:1329524304790028328> Quando pubblichi una **partnership** viene menzionato il ruolo <@&" + IDs.roles.Partnership + "> in fondo al messaggio."),
        ],
        flags: v2PrivateFlags(),
      }).catch((err?) => { logButtonErr(err); return null; });
    }

    if (interaction.customId == "info_rules") {
      const generalRules = [
        "<:rules:1443307208543703131> **`REGOLA GENERALE 1.1`**",
        `<:VC_Reply:1482532158080942191> ${MOD_RULE_DETAIL["1.1"]}`,
        "",
        "<:rules:1443307208543703131> **`REGOLA GENERALE 1.2`**",
        `<:VC_Reply:1482532158080942191> ${MOD_RULE_DETAIL["1.2"]}`,
        "",
        "<:rules:1443307208543703131> **`REGOLA GENERALE 1.3`**",
        `<:VC_Reply:1482532158080942191> ${MOD_RULE_DETAIL["1.3"]}`,
        "",
        "<:rules:1443307208543703131> **`REGOLA GENERALE 1.4`**",
        `<:VC_Reply:1482532158080942191> ${MOD_RULE_DETAIL["1.4"]}`,
        "",
        "<:rules:1443307208543703131> **`REGOLA GENERALE 1.5`**",
        `<:VC_Reply:1482532158080942191> ${MOD_RULE_DETAIL["1.5"]}`,
        "",
        "<:rules:1443307208543703131> **`REGOLA GENERALE 1.6`**",
        `<:VC_Reply:1482532158080942191> ${MOD_RULE_DETAIL["1.6"]}`,
      ].join("\n");
      const textRules = [
        "<:rules:1443307208543703131> **`REGOLA TESTUALE 2.1`**",
        `<:VC_Reply:1482532158080942191> ${MOD_RULE_DETAIL["2.1"]}`,
        "",
        "<:rules:1443307208543703131> **`REGOLA TESTUALE 2.2`**",
        `<:VC_Reply:1482532158080942191> ${MOD_RULE_DETAIL["2.2"]}`,
        "",
        "<:rules:1443307208543703131> **`REGOLA TESTUALE 2.3`**",
        `<:VC_Reply:1482532158080942191> ${MOD_RULE_DETAIL["2.3"]}`,
        "",
        "<:rules:1443307208543703131> **`REGOLA TESTUALE 2.4`**",
        `<:VC_Reply:1482532158080942191> ${MOD_RULE_DETAIL["2.4"]}`,
      ].join("\n");
      const voiceRules = [
        "<:rules:1443307208543703131> **`REGOLA VOCALE 3.1`**",
        `<:VC_Reply:1482532158080942191> ${MOD_RULE_DETAIL["3.1"]}`,
        "",
        "<:rules:1443307208543703131> **`REGOLA VOCALE 3.2`**",
        `<:VC_Reply:1482532158080942191> ${MOD_RULE_DETAIL["3.2"]}`,
        "",
        "<:rules:1443307208543703131> **`REGOLA VOCALE 3.3`**",
        `<:VC_Reply:1482532158080942191> ${MOD_RULE_DETAIL["3.3"]}`,
        "",
        "<:rules:1443307208543703131> **`REGOLA VOCALE 3.4`**",
        `<:VC_Reply:1482532158080942191> ${MOD_RULE_DETAIL["3.4"]}`,
        "",
        "<:rules:1443307208543703131> **`REGOLA VOCALE 3.5`**",
        `<:VC_Reply:1482532158080942191> ${MOD_RULE_DETAIL["3.5"]}`,
      ].join("\n");
      await interaction.reply({
        components: [
          v2Text(generalRules),
          v2Separator(),
          v2Text(textRules),
          v2Separator(),
          v2Text(voiceRules),
          v2Separator(),
          v2Text("<:5751attentionfromvega:1443651874032062505> __Lo staff si riserva il diritto di cambiare sanzioni e regole in base alla situazione.__"),
        ],
        flags: v2PrivateFlags(),
      }).catch((err?) => { logButtonErr(err); return null; });
    }

    if (interaction.customId == "info_donations") {
      const donations = [
        "## <:VC_Sparkles:1468546911936974889> Supporta il server con l'acquisto di un VIP o una donazione!",
        "",
        "Usiamo i soldi donati per portare eventi con premi migliori, come Discord Nitro o gift card, e per cercare collaborazioni interessanti per voi utenti.",
        "Le donazioni sono completamente volontarie e contribuiscono alla nostra crescita. In anticipo, grazie.",
        "",
        "**Vuoi acquistare direttamente tutti i vantaggi permanenti e differenti dal VIP?**",
        "`5,00 €`✩",
        "<:VC_Dot:1482532364222595303> Il ruolo <@&1544830864565735515> **permanente**",
        "<:VC_Dot:1482532364222595303> Possibilità di allegare link e immagini in chat",
        "<:VC_Dot:1482532364222595303> Possibilità di usare le soundboard di altri server",
        "<:VC_Dot:1482532364222595303> Possibilità di mandare sticker ed emoji di altri server",
        "<:VC_Dot:1482532364222595303> Bypass dei requisiti nei giveaway",
        "<:VC_Dot:1482532364222595303> Possibilità di cambiare il tuo nickname",
        "<:VC_Dot:1482532364222595303> Sblocchi i COLORI PLUS in [Personalizza](https://www.viniliecaffe.it/personalizza/) <:VC_New:1471891729471770819>",
        "<:VC_Dot:1482532364222595303> Sblocchi i comandi `+quote` e `+repost`",
        "<:VC_Dot:1482532364222595303> X4 EXP boost",
      ].join("\n");

      const vip = [
        "**Vuoi sostenere il server?** Acquista il VIP e riscatta tutti i vantaggi che hai sbloccato qui nel server! <a:VC_HeartsBlue:1468686100045369404>",
        "",
        "ACQUISTA IL <@&1544830866616754257> <a:VC_HeartsPink:1468685897389052008>",
        "`10,00 €`✩",
        "",
        "<:sparkledred:1470064814502973591> Sbloccherai:",
        "<:VC_Dot:1482532364222595303> Permesso di allegare link e immagini in chat",
        "<:VC_Dot:1482532364222595303> Permesso di usare soundboard di altri server",
        "<:VC_Dot:1482532364222595303> Possibilità di mandare sticker ed emoji di altri server",
        "<:VC_Dot:1482532364222595303> Bypass dei requisiti nei giveaway",
        "<:VC_Dot:1482532364222595303> Possibilità di creare una vocale privata per te e i tuoi amici",
        "<:VC_Dot:1482532364222595303> Reazioni al messaggio quando vieni @menzionato in chat (max. 3 reazioni).",
        `<:VC_Dot:1482532364222595303> ${MENTION_RESPONSE_PERK_BODY}`,
        "<:VC_Dot:1482532364222595303> Potrai crearti un ruolo personalizzato con colore GRADIENTE scelto da te.",
        "<:VC_Dot:1482532364222595303> X5 EXP boost",
        "",
        "<:VC_Attention:1482534443632558151> DISCLAIMER / I soldi non sono rimborsabili, essendo volontari.",
        "I vantaggi segnati con \"✩\" vengono rimossi qualora l'utente violi il regolamento, porti un'immagine negativa al server o sia inattivo per mesi.",
      ].join("\n");

      await interaction.reply({
        components: [
          v2Text(donations),
          v2Separator(),
          v2Text(vip),
          v2Separator(),
          v2Text("## Acquista ora!\n<:blueflash:1470064803157643468> Apri un ticket `HIGH STAFF` sul sito: " + siteTicketsPageDiscordRef("HIGH STAFF") + "."),
        ],
        flags: v2PrivateFlags(),
      }).catch((err?) => { logButtonErr(err); return null; });
    }

    if (interaction.customId == "info_sponsor") {
      const sponsorText = "<:pinnednew:1443670849990430750> **Vinili & Caffè** offre un servizio di __sponsor__ con dei **requisiti** da rispettare. Per fare una __sponsor__ bisognerà aprire un " + siteTicketsPageDiscordRef("HIGH STAFF") + ".\n\n"
        + "> Ogni server che vorrà effettuare una **sponsor** dovrà rispettare questi 3 requisiti:\n"
        + "> <:VC_Dot:1482532364222595303> Rispettare i [**ToS di Discord**](https://discord.com/terms)\n"
        + "> <:VC_Dot:1482532364222595303> Rispettare le [**Linee Guida di Discord**](https://discord.com/guidelines)\n"
        + "> <:VC_Dot:1482532364222595303> Rispettare il [**Regolamento di Vinili & Caffè**](https://discord.com/channels/1329080093599076474/1442569111119990887)";
      const rowSponsor = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("metodi").setLabel("︲METODI").setEmoji("<:Money:1330544713463500970>").setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId("ping").setLabel("︲PING").setEmoji("<:Discord_Mention:1329524304790028328>").setStyle(ButtonStyle.Secondary));
      await interaction.reply({ components: [v2Text(sponsorText), rowSponsor], flags: v2PrivateFlags() }).catch((err?) => { logButtonErr(err); return null; });
    }

    if (interaction.customId == "candidature_premi_partner") {
      const {
        buildPartnerRewardDiscountBanner,
        buildPartnerRewardDiscordEmbedLines,
        getPartnerRewardPointCost,
      } = require("../../shared/partner/partnerManagerRewardTiers") as typeof import("../../shared/partner/partnerManagerRewardTiers");
      const tierLines = buildPartnerRewardDiscordEmbedLines();
      const discountBanner = buildPartnerRewardDiscountBanner();
      const autoRedeemCosts = [getPartnerRewardPointCost(50), getPartnerRewardPointCost(100)].join("** e **");
      const premiPartnerEmbed = new EmbedBuilder()
        .setColor("#6f4e37")
        .setDescription(
          "<:partneredserverowner:1443651871125409812> **__Vinili & Caffè__** offre un servizio di __pagamento__ in base al numero di **partner** effettuate.\n" +
          "> Per riscattare eventuali premi bisognerà aprire un " + siteTicketsPageDiscordRef("HIGH STAFF") + "\n\n" +
          (discountBanner ? `${discountBanner}\n\n` : "") +
          tierLines.join("\n") +
          `\n\n> Dal pannello [Personalizza](https://www.viniliecaffe.it/personalizza/) (High Staff): i riscatti **${autoRedeemCosts}** fanno in automatico **scalatura + premio** (CR+Voc/VIP 30 giorni). **Decorazione**, **Nitro** e **PayPal**: premio a mano.\n\n` +
          `<a:VC_Winner:1482535294757507255> Inoltre, ogni mese, il miglior <@&${IDs.roles.Staff}> riceverà un **Nitro __Boost__** come premio.\n\n` +
          "<a:flyingnitroboost:1443652205705170986> Naturalmente almeno un **boost** dovrà andare a **__Vinili & Caffè__**.",
        )
        ;
      await interaction.reply({ embeds: [premiPartnerEmbed], flags: PRIVATE_FLAG }).catch((err?) => { logButtonErr(err); return null; });
    }

    const sendUpdatedView = async (payload?) => {
      if (levelPanelDeferred || interaction.deferred) {
        return interaction.editReply(payload).catch((err?) => {
          if (err?.code === 10062) return;
          global.logger?.error?.("[buttons] sendUpdatedView editReply error:", err?.message ?? err, err?.code);
        });
      }
      const updated = await interaction.update(payload).catch((err?) => {
        if (err?.code === 10062) return null;
        logButtonErr(err);
        return null;
      });
      if (updated !== null) return;
      return interaction.reply({ ...payload, flags: PRIVATE_FLAG }).catch((err?) => {
        if (err?.code === 10062) return;
        logButtonErr(err);
      });
    };
    if (interaction.customId === "info_buttons_test") {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("info_buttons_test_ok").setLabel("Funziona").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("info_buttons_test_no").setLabel("Non funziona").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("info_buttons_test_ping").setLabel("Ping test").setStyle(ButtonStyle.Secondary),
      );
      await interaction.reply({
        content: "Test bottoni (nessun embed): clicca uno dei pulsanti qui sotto.",
        components: [row],
        flags: PRIVATE_FLAG,
      }).catch((err?) => { logButtonErr(err); return null; });
    }

    if (interaction.customId === "info_buttons_test_ok") {
      await interaction.reply({ content: "Perfetto: i bottoni standard stanno funzionando <a:VC_Verified:1482532479637127188>", flags: PRIVATE_FLAG }).catch((err?) => { logButtonErr(err); return null; });
    }

    if (interaction.customId === "info_buttons_test_no") {
      await interaction.reply({ content: "Ricevuto <a:VC_Cross:1482532424570376253>: i bottoni standard non stanno rispondendo come previsto.", flags: PRIVATE_FLAG }).catch((err?) => { logButtonErr(err); return null; });
    }

    if (interaction.customId === "info_buttons_test_ping") {
      await interaction.reply({ content: "pong", flags: PRIVATE_FLAG }).catch((err?) => { logButtonErr(err); return null; });
    }

    const buildBoostLevelsPayload = () => {
      const boostEmbed = new EmbedBuilder()

        .setColor("#6f4e37")
        .setTitle("<a:VC_HeartWhite:1448673535253024860> **__Potenzia il server e sblocca vantaggi unici__**")
        .setDescription([
          "Un modo per sostenere il server è potenziarlo: se hai un Nitro Boost (quello da 9,99€) hai a disposizione 2 potenziamenti che puoi utilizzare in qualunque server tu voglia. Se deciderai di potenziare noi, __Vinili & Caffè__, sbloccherai un sacco di vantaggi.",
          "**Non sai cos'è Discord Nitro?** <:link:1470064815899803668> [Scoprilo qui](<https://discord.com/nitro>).",
          "",
          "<a:VC_Boost:1482706171386269830> **Boostando il server una volta sbloccherai questi vantaggi:**",
          `<:sparkledred:1470064814502973591> Ruolo <@&${IDs.roles.ServerBooster}> con badge speciale`,
          "<:VC_Dot:1482532364222595303> Permesso di cambiare il nickname",
          "<:moon:1470064812615667827> Permesso di allegare immagini e link in chat",
          "<:pinkstar:1470064804835229768> Permesso di mandare emoji e adesivi di altri server",
          "<:sparkle:1470064801811140866> Permesso di usare le Soundboard del server",
          "<:blueflash:1470064803157643468> Sblocchi i COLORI PLUS in [Personalizza](https://www.viniliecaffe.it/personalizza/) <:VC_New:1471891729471770819>",
          "<a:VC_CrownYellow:1482706085440651428> Aggiungi reazioni al messaggio quando ti @menzionano in chat (max. 3)",
          MENTION_RESPONSE_PERK_LINE_DISCORD,
          "<a:reddiamond:1443652837346377841> Sblocchi i comandi `+quote` e `+repost`",
          "<:exp:1470067108543987846> X2 EXP Boost",
          "",
          "<a:VC_Boost:1482706171386269830> **Inoltre boostando il server due volte sbloccherai altri vantaggi:**",
          `<:sparkledred:1470064814502973591> Ruolo <@&${IDs.roles.DoubleBooster}> con badge speciale`,
          "<:moon:1470064812615667827> Tutti i perks precedenti",
          "<:sparkle:1470064801811140866> Permesso di usare le Soundboard esterne",
          "<:blueflash:1470064803157643468> Possibilità di creare un ruolo **custom** e un canale **vocale privato custom**",
          "<a:VC_CrownYellow:1482706085440651428> Cooldown sui comandi del nostro bot ridotto (da 30 secondi a 5 secondi).",
          MENTION_RESPONSE_PERK_LINE_DISCORD,
          "<a:reddiamond:1443652837346377841> Bypass requisiti dei giveaway",
          "<:exp:1470067108543987846> X3 EXP Boost",
        ].join("\n"))
        ;

      const howtoEmbed = new EmbedBuilder()

        .setColor("#6f4e37")
        .setTitle("<:nitroboost:1470064881674883326> **__Come creare ruolo personalizzato e vocale privata__**")
        .setDescription([
          `Usa [Personalizza](https://www.viniliecaffe.it/personalizza/) in <#${IDs.channels.commands}> per creare e configurare il ruolo, la vocale, le reaction e la Mention Response.`,
          `Usa [Personalizza](https://www.viniliecaffe.it/personalizza/) in <#${IDs.channels.commands}> per scegliere il colore gradiente del tuo ruolo.`,
          "Digita \`+help\` per la lista completa dei comandi.",
        ].join("\n"));

      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("info_levels").setLabel("︲INFO & VANTAGGI RUOLI").setEmoji("<:exp:1470067108543987846>").setStyle(ButtonStyle.Secondary),);

      return { embeds: [boostEmbed, howtoEmbed], components: [row] };
    };

    const buildLevelsPayload = () => {
      const levelEmbed = new EmbedBuilder()

        .setColor("#6f4e37")
        .setTitle("<:exp:1470067108543987846> **__Sali di livello e sblocca vantaggi sempre migliori__**")
        .setDescription([
          "I livelli nel server rappresentano la tua attività: scrivendo in chat testuale e stando nei canali vocali, guadagnerai esperienza che verrà aggiunta al tuo livello globale.",
          "Una volta raggiunta una certa somma di esperienza, farai un **level up**!",
          "",
          `<:VC_Dot:1482532364222595303> Per __vedere i tuoi EXP__ e le tue statistiche, usa il comando \`+rank\` in <#${IDs.channels.commands}>.`,
          "",
          "<:VC_Dot:1482532364222595303> ──────────────── <:exp:1470067108543987846> ──────────────── <:VC_Dot:1482532364222595303>",
          "",
          "<a:VC_Arrow:1482706699365257397> **LISTA DEI LIVELLI:**",
        ].join("\n"))
        .addFields(
          {
            name: "\`LIVELLO 10-19\`",
            value: [
              `<@&${IDs.roles.Level10}>`,
              "<:VC_DoubleReply:1482532332509466797> Permesso di cambiare nickname",
              "<:VC_DoubleReply:1482532332509466797> Permesso di allegare link e immagini in chat",
              "<:VC_DoubleReply:1482532332509466797> Permesso di inviare messaggi vocali in chat",
              "<:VC_DoubleReply:1482532332509466797> Sblocchi i comandi \`+quote\` e \`+repost\`",
              `<:VC_Reply:1482532158080942191> <:VC_New:1471891729471770819> Nuovo colore gradiente sbloccato con [Personalizza](https://www.viniliecaffe.it/personalizza/)<@&${IDs.roles.colorUnlockLv10}>`
            ].join("\n"),
            inline: true,
          },
          {
            name: "\`LIVELLO 20-29\`",
            value: [
              `<@&${IDs.roles.Level20}>`,
              "Tutte le ricompense precedenti",
              "<:VC_DoubleReply:1482532332509466797> Possibilità di aggiungere reazioni ai messaggi in chat",
              `<:VC_Reply:1482532158080942191> <:VC_New:1471891729471770819> Nuovo colore gradiente sbloccato con [Personalizza](https://www.viniliecaffe.it/personalizza/)<@&${IDs.roles.colorUnlockLv20}>`
            ].join("\n"),
            inline: true,
          },
          {
            name: "\`LIVELLO 30-49\`",
            value: [
              `<@&${IDs.roles.Level30}>`,
              "Tutte le ricompense precedenti",
              "<:VC_DoubleReply:1482532332509466797> Permesso di usare soundboard di altri server",
              "<:VC_DoubleReply:1482532332509466797> Cooldown sui comandi del nostro bot ridotto (da 30 secondi a 15 secondi).",
              `<:VC_Reply:1482532158080942191> <:VC_New:1471891729471770819> Nuovo colore gradiente sbloccato con [Personalizza](https://www.viniliecaffe.it/personalizza/)<@&${IDs.roles.colorUnlockLv30}>`
            ].join("\n"),
            inline: true,
          },
          {
            name: "\`LIVELLO 50-69\`",
            value: [
              `<@&${IDs.roles.Level50}>`,
              "Tutte le ricompense precedenti",
              "<:VC_DoubleReply:1482532332509466797> Possibilità di creare un ruolo __personalizzato PERMANENTE__ e un canale vocale privato __personalizzato PERMANENTE__.",
              "<:VC_DoubleReply:1482532332509466797> Cooldown sui comandi del nostro bot ridotto (da 30 secondi a 5 secondi).",
              `<:VC_Reply:1482532158080942191> <:VC_New:1471891729471770819> Nuovo colore gradiente sbloccato con [Personalizza](https://www.viniliecaffe.it/personalizza/)<@&${IDs.roles.colorUnlockLv50}>`
            ].join("\n"),
            inline: true,
          },
          {
            name: "\`LIVELLO 70-99\`",
            value: [
              `<@&${IDs.roles.Level70}>`,
              "Tutte le ricompense precedenti",
              "<:VC_DoubleReply:1482532332509466797> Permesso di usare sticker ed emoji di altri server",
              "<:VC_DoubleReply:1482532332509466797> Aggiungi reazioni al messaggio quando ti @menzionano in chat (max. 3)",
              `<:VC_Reply:1482532158080942191> <:VC_New:1471891729471770819> Nuovo colore gradiente sbloccato con [Personalizza](https://www.viniliecaffe.it/personalizza/)<@&${IDs.roles.colorUnlockLv70}>`
            ].join("\n"),
            inline: true,
          },
          {
            name: "\`LIVELLO 100-119\`",
            value: [
              `<@&${IDs.roles.Level100}>`,
              "Tutte le ricompense precedenti",
              "<:VC_DoubleReply:1482532332509466797> Cooldown sui comandi del nostro bot ridotto (da 30 secondi a 1 secondo).",
              "<:VC_DoubleReply:1482532332509466797> Bypass requisiti per le candidature",
              "<:VC_DoubleReply:1482532332509466797> Bonus EXP permanente +15%",
              `<:VC_DoubleReply:1482532332509466797> ${MENTION_RESPONSE_PERK_BODY}`,
              `<:VC_Reply:1482532158080942191> <:VC_New:1471891729471770819> Nuovo colore gradiente sbloccato con [Personalizza](https://www.viniliecaffe.it/personalizza/)<@&${IDs.roles.colorUnlockLv100}>`
            ].join("\n"),
            inline: true,
          },
          {
            name: "\`LIVELLO 125-149\`",
            value: [
              `<@&${IDs.roles.Level120}>`,
              "Tutte le ricompense precedenti",
              "<:VC_DoubleReply:1482532332509466797> Bypass requisiti per i giveaway",
              "<:VC_DoubleReply:1482532332509466797> Bonus EXP permanente +20%",
              "<:VC_DoubleReply:1482532332509466797> Sblocchi il secondo custom role",
              `<:VC_Reply:1482532158080942191> <:VC_New:1471891729471770819> Nuovo **Plus combo Black** con [Personalizza](https://www.viniliecaffe.it/personalizza/) <@&${IDs.roles.orangeBlackPlus}>`,
            ].join("\n"),
            inline: true,
          },
          {
            name: "\`LIVELLO 150-199\`",
            value: [
              `<@&${IDs.roles.Level150}>`,
              "Tutte le ricompense precedenti",
              "<:VC_DoubleReply:1482532332509466797> Bonus EXP permanente +25%",
              `<:VC_Reply:1482532158080942191> <:VC_New:1471891729471770819> Nuovo **Plus combo Black** con [Personalizza](https://www.viniliecaffe.it/personalizza/) <@&${IDs.roles.greenBlackPlus}>`,
              "<:VC_DoubleReply:1482532332509466797> Decorazione a scelta riscattabile tramite ticket **HIGH STAFF**",
            ].join("\n"),
            inline: true,
          },
          {
            name: "\`LIVELLO 200+\`",
            value: [
              `<@&${IDs.roles.Level200}>`,
              "Tutte le ricompense precedenti",
              `<:VC_Reply:1482532158080942191> <:VC_New:1471891729471770819> Nuovo **Plus combo Black** con [Personalizza](https://www.viniliecaffe.it/personalizza/) <@&${IDs.roles.aquaBlackPlus}>`,
              "<:VC_DoubleReply:1482532332509466797> Nitro Boost mensile riscattabile tramite ticket **HIGH STAFF**",
            ].join("\n"),
            inline: true,
          },
        )

        .setFooter({ text: "Se esci dal server o cambi account, i livelli ti verranno tolti e NON rimessi." });

      const howtoEmbed = new EmbedBuilder().setColor("#6f4e37").setTitle("<:nitroboost:1470064881674883326> **__Come creare ruolo personalizzato e vocale privata__**").setDescription([
        `Usa [Personalizza](https://www.viniliecaffe.it/personalizza/) in <#${IDs.channels.commands}> per creare e configurare il ruolo, la vocale, le reaction e la Mention Response.`,
        `Usa [Personalizza](https://www.viniliecaffe.it/personalizza/) in <#${IDs.channels.commands}> per scegliere il colore gradiente del tuo ruolo.`,
        "Digita \`+help\` per la lista completa dei comandi.",
      ].join("\n"));

      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel("︲CANALE PER I COMANDI").setEmoji(`<:VC_Bot:1482526555174604964>`).setStyle(ButtonStyle.Link).setURL("https://discord.com/channels/1329080093599076474/1442569138114662490",), new ButtonBuilder().setCustomId("torna_indietro").setLabel("︲TORNA INDIETRO").setEmoji("<a:vegaleftarrow:1462914743416131816>").setStyle(ButtonStyle.Primary),);

      return { embeds: [levelEmbed, howtoEmbed], components: [row] };
    };
    if (interaction.customId == "info_boost_levels") {
      return sendUpdatedView(buildBoostLevelsPayload());
    }
    if (
      interaction.customId == "info_levels" ||
      interaction.customId == "info_level" ||
      interaction.customId == "infolivelli"
    ) {
      return sendUpdatedView(buildLevelsPayload());
    }
    if (interaction.customId == "torna_indietro") {
      return sendUpdatedView(buildBoostLevelsPayload());
    }

    if (interaction.customId == "info_badges_roles") {
      const badgesEmbed = new EmbedBuilder()

        .setColor("#6f4e37")
        .setTitle("<:pinkstar:1470064804835229768>・**__Ottieni un ruolo speciale per il tuo profilo!__**")
        .setDescription([
          "I badge sono dei ruoli __aggiuntivi__ che ti permettono di sbloccare vantaggi e permessi all'interno del server. Possono essere ottenuti in diversi modi e tutti danno vantaggi diversi.",
          "",
          "<:VC_Dot:1482532364222595303> ────⋆⋅☆⋅⋆──── ୨♡୧ ────⋆⋅☆⋅⋆──── <:VC_Dot:1482532364222595303>",
          "",
          "<a:VC_Arrow:1482706699365257397> **LISTA DEI BADGES:**",
        ].join("\n"))
        .addFields(
          {
            name: "`WEEKLY WINNERS`",
            value: [
              "<@&1544830834849087630>/<@&1544830836686200992>",
              "Ottenibile arrivando primo per exp in messaggi o exp in vocale nella [classifica settimanale](<https://discord.com/channels/1329080093599076474/1470183921236049940>).",
              "९ Tutte le ricompense precedenti",
              "<:VC_DoubleReply:1482532332509466797> Ruolo esclusivo per 7 giorni.",
              "<:VC_Reply:1482532158080942191> Permesso di usare soundboard esterne",
            ].join("\n"),
            inline: true,
          },
          {
            name: "`FAN`",
            value: [
              `<@&${IDs.roles.Fan}>`,
              'Ottenibile mettendo ".gg/viniliecaffe", "discord.gg/viniliecaffe" o "viniliecaffe.it" nello status del tuo profilo Discord!',
              "Nello stato, non nella bio; se viene tolto o se sei offline, non ti verranno assegnati i vantaggi.",
              "<:VC_DoubleReply:1482532332509466797> Permesso di allegare link e immagini in chat",
              "<:VC_Reply:1482532158080942191> Permesso di cambiare il tuo nickname",
            ].join("\n"),
            inline: true,
          },
          {
            name: "`VOTER`",
            value: [
              "<@&1544830805455544360>",
              "Ottenibile votando il server dalla [pagina Voti](<https://www.viniliecaffe.it/vote>) del sito (Discadia e Top.gg).",
              "<:VC_DoubleReply:1482532332509466797> EXP casuale da 100 a 250.",
              "<:VC_Reply:1482532158080942191> Ruolo esclusivo per 12 o 24 ore.",
            ].join("\n"),
            inline: true,
          },
          {
            name: "`PROMOTER`",
            value: [
              "<@&1544830824300417094>",
              "Ottenibile invitando 5 persone nel server, attraverso [custom link](<https://imgur.com/a/3wpDOVj>)",
              "<:VC_DoubleReply:1482532332509466797> Permesso di allegare link e immagini in chat",
              "<:VC_Reply:1482532158080942191> Permesso di cambiare il tuo nickname",
            ].join("\n"),
            inline: true,
          },
          {
            name: "`PROPULSOR`",
            value: [
              "<@&1544830827026849872>",
              "Ottenibile invitando 25 persone nel server, attraverso [custom link](<https://imgur.com/a/3wpDOVj>)",
              "९ Tutte le ricompense precedenti",
              "<:VC_DoubleReply:1482532332509466797> Inviare emoji e adesivi esterni",
              "<:VC_Reply:1482532158080942191> Aggiungi reazioni ai messaggi",
            ].join("\n"),
            inline: true,
          },
          {
            name: "`CATALYST`",
            value: [
              "<@&1544830828331270282>",
              "Ottenibile invitando 100 persone nel server, attraverso [custom link](<https://imgur.com/a/3wpDOVj>)",
              "९ Tutte le ricompense precedenti",
              "<:VC_Reply:1482532158080942191> Usare SoundBoard esterne nelle vocali",
            ].join("\n"),
            inline: true,
          },
          {
            name: "`GUILDED`",
            value: [
              "<@&1544830820181745704>",
              "Ottenibile mettendo la nostra guild tag **V&C**",
              "९ Esclusività del ruolo.",
            ].join("\n"),
            inline: true,
          },
          {
            name: "`VETERANO`",
            value: [
              "<@&1544830800984412275>",
              "Ottenibile stando nel server per almeno 1 mese",
              "९ Esclusività del ruolo.",
            ].join("\n"),
            inline: true,
          },
          {
            name: "`OG`",
            value: [
              "<@&1544830802859393045>",
              "Ottenibile stando nel server per almeno 1 anno",
              "९ Esclusività del ruolo.",
            ].join("\n"),
            inline: true,
          },
        )
        .setFooter({
          text: "⚠️ ▸ Se dovessi uscire dal server o cambiare account perderai i tuoi badge e i vantaggi annessi.",
        });

      await interaction.reply({ embeds: [badgesEmbed], flags: PRIVATE_FLAG }).catch((err?) => { logButtonErr(err); return null; });
    }

    
    if (interaction.customId == "avatar_views") {
      return sendPrivacyViewsLeaderboard(
        interaction,
        "avatar",
        "<a:VC_CrownYellow:1482706085440651428> Classifica Visualizzazioni Avatar",
      );
    }

    if (interaction.customId == "banner_views") {
      return sendPrivacyViewsLeaderboard(
        interaction,
        "banner",
        "<a:VC_CrownYellow:1482706085440651428> Classifica Visualizzazioni Banner",
      );
    }
  },
};