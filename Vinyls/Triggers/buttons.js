const { EmbedBuilder, Events, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, AttachmentBuilder, } = require("discord.js");
const { decrementQuoteCount } = require("../Utils/Quote/quoteCounter");
const { ROLE_MULTIPLIERS } = require("../Services/Community/expService");
const { AvatarPrivacy, BannerPrivacy, ActivityUserProfile, } = require("../Schemas/Community/communitySchemas");
const IDs = require("../Utils/Config/ids");
const { ZODIAC_ROLE_IDS } = require("../Utils/Community/zodiacRoles");
const { PERSONALITY_NORMAL_COLOR_ROLE_IDS_ALL } = require("../Utils/Community/personalityColorUnlocks");
const { PERSONALITY_MENTION_ROLE_IDS, PERSONALITY_HOBBY_ROLE_IDS } = require("../Utils/Community/personalityRolePersistence");
const { getGuildMemberCached, getUserCached } = require("../Utils/Interaction/interactionEntityCache");
const { applyDepexOneLevel } = require("../Services/Staff/staffWarnService");
const { syncStaffDbAndPauseChannelAfterDepex } = require("../Utils/Staff/staffPmUtils");
const { appendStaffRolesHistoryEntry } = require("../Utils/Staff/staffDocUtils");
const { sendPexDepexLog } = require("../Events/interaction/resocontoHandlers");
const { checkButtonPermission, checkStringSelectPermission, buildGlobalPermissionDeniedEmbed, buildGlobalChannelDeniedEmbed, buildGlobalNotYourControlEmbed, } = require("../Utils/Moderation/commandPermissions");
const { ROLE_TRY_AGAIN, ROLE_PLUS_FORBIDDEN } = require("../Utils/Text/replyMessages");
const { applyDefaultFooterToEmbeds } = require("../Utils/Embeds/defaultFooter");
const { TENANT_EMBED_COLOR } = require("../MultiGuild/utils/tenantEmbedBranding");
const { accountUsername, guildMemberDisplayAvatarUrlDynamic } = require("../Utils/Discord/guildDiscordIdentity");
const PRIVATE_FLAG = 1 << 6;
const MONO_GUILD_DENIED_TEXT = "Questo bot è utilizzabile solo sul server principale di Vinili & Caffè.";
const { buildStaffGuideMenuRow, STAFF_GUIDE_MENU_ID, STAFF_GUIDE_SECTION_IDS } = require("../Utils/Staff/staffGuideMenuComponents");
const { buildStaffGuideEmbed } = require("../Embeds/staff");
const { applyDefaultFooter } = require("../Utils/Embeds/defaultFooter");
const { MOD_RULE_DETAIL } = require("../Utils/Moderation/modRegolamentoConstants");
const { buildStaffGuideSectionMarkdown } = require("../Utils/Staff/staffGuideContent");
const {
  buildModerationGuideStickyPayload,
  moderationGuideEmbedColor,
} = require("../Utils/Moderation/moderationGuidePanelComponents");
const {
  panelSelectFollowUp,
  buildFollowUpInteractionProxy,
  resetPanelSelectMenu,
} = require("../../shared/discord/panelSelectMenuRuntime");

function v2Text(content) {
  return new TextDisplayBuilder().setContent(String(content || ""));
}

function v2Separator() {
  return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
}

function v2PrivateFlags() {
  return PRIVATE_FLAG | MessageFlags.IsComponentsV2;
}
const IGNORED_BUTTON_LOG_CODES = new Set([
  10062, // Unknown interaction
  10015, // Unknown webhook
  10011, // Unknown Role (ruolo cancellato dal server, menu ruoli)
  40060, // Interaction has already been acknowledged
]);

function logButtonErr(err, opts = {}) {
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

function onlyExistingRoleIds(guild, roleIds) {
  if (!guild?.roles?.cache || !Array.isArray(roleIds)) return [];
  return roleIds.filter((id) => id && guild.roles.cache.has(id));
}

function partitionRoleIdsByExisting(guild, roleIds, context) {
  if (!guild?.roles?.cache || !Array.isArray(roleIds)) return { existing: [], missing: [] };
  const existing = roleIds.filter((id) => id && guild.roles.cache.has(id));
  const missing = roleIds.filter((id) => id && !guild.roles.cache.has(id));
  if (missing.length) {
    global.logger?.warn?.("[buttons] Ruolo/i non più presenti sul server (Unknown Role).", context, "ID eliminati:", missing);
  }
  return { existing, missing };
}

async function removeMemberRolesSequential(member, roleIds) {
  if (!member?.guild || !Array.isArray(roleIds)) return;
  let m = await member.guild.members.fetch(member.id).catch((err) => { logButtonErr(err, { warn: true }); return member; });
  for (const rid of roleIds) {
    if (!rid) continue;
    await m.roles.remove(rid).catch((err) => { logButtonErr(err); });
    m = await member.guild.members.fetch(member.id).catch((err) => { logButtonErr(err, { warn: true }); return m; });
  }
}

async function setMemberRolesBulk(member, roleIdsToRemove, roleIdsToAdd = []) {
  if (!member?.guild || !Array.isArray(roleIdsToRemove)) return;
  const m = await member.guild.members.fetch(member.id).catch((err) => { logButtonErr(err, { warn: true }); return member; });
  const removeSet = new Set(roleIdsToRemove.filter(Boolean));
  const current = [...m.roles.cache.keys()].filter((id) => id !== member.guild?.id);
  const next = current.filter((id) => !removeSet.has(id)).concat(roleIdsToAdd.filter(Boolean));
  await m.edit({ roles: [...new Set(next)] }).catch((err) => { logButtonErr(err); });
}

function buildMiddleGuideNavRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("middle_ticket").setLabel("︲GESTIONE TICKET").setEmoji("<:VC_Ticket:1482535175283019888>").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("middle_selfie").setLabel("︲VERIFICA SELFIE").setEmoji("<a:VC_Verified:1482532479637127188>").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("middle_follower").setLabel("︲FOLLOWER & SUPPORTER").setEmoji("<a:VC_Verified:1482532479637127188>").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("middle_partnership").setLabel("︲GESTIONE PARTNER").setEmoji("<:VC_Collab:1482534540089098260>").setStyle(ButtonStyle.Secondary),
  );
}

function rebuildStaffGuideMenuComponents() {
  return [buildStaffGuideMenuRow()];
}

function rebuildStaffGuidePanelEmbeds(interaction) {
  const embed = applyDefaultFooter(buildStaffGuideEmbed(), interaction.guild);
  if (embed) embed.__skipFooterIcon = true;
  return [embed];
}

const staffGuidePanelResetOptions = {
  rebuildEmbeds: rebuildStaffGuidePanelEmbeds,
  includeBanner: false,
  includeThumbnail: false,
  includeAuthor: false,
  clearAttachments: true,
};

async function handleStaffGuideSelectMenu(interaction) {
  if (!interaction.isStringSelectMenu?.() || interaction.customId !== STAFF_GUIDE_MENU_ID) return false;

  const sectionId = String(interaction.values?.[0] || "").trim();
  if (!STAFF_GUIDE_SECTION_IDS.has(sectionId)) return false;

  const sectionInteraction = Object.assign(
    buildFollowUpInteractionProxy(interaction, { treatAsButton: true }),
    { customId: sectionId },
  );

  const gate = await checkButtonPermission(sectionInteraction);
  if (!gate.allowed) {
    await panelSelectFollowUp(
      interaction,
      rebuildStaffGuideMenuComponents,
      { embeds: [buildDeniedEmbedFromGate(gate, "menu", interaction)] },
      staffGuidePanelResetOptions,
    );
    return true;
  }

  await resetPanelSelectMenu(interaction, rebuildStaffGuideMenuComponents, staffGuidePanelResetOptions);
  return handleStaffButtons(sectionInteraction);
}

async function handleStaffButtons(interaction) {
  if (!interaction.isButton()) return false;

  if (interaction.customId && interaction.customId.startsWith("staff_warn_depex:")) {
    const parts = String(interaction.customId).split(":");
    const userId = parts[1];
    const choice = parts[2];
    if (!userId || !/^\d{16,20}$/.test(userId) || !["yes", "no"].includes(choice)) return false;
    const hasHighStaff = interaction.member?.roles?.cache?.has?.(IDs.roles?.HighStaff);
    if (!hasHighStaff) {
      await interaction.reply({ content: "<a:VC_Alert:1482706673176150077> Solo l'High Staff può usare questo pulsante.", flags: PRIVATE_FLAG }).catch((err) => { logButtonErr(err); return null; });
      return true;
    }
    const guild = interaction.guild;
    const member = await getGuildMemberCached(guild, userId);
    const targetUser = member?.user;
    if (choice === "no") {
      await interaction.update({
        content: "<:VC_OnlineStatus:1482527088912240650> Nessuna azione. Al **3° warn staff** scatterà il depex completo.",
        embeds: [],
        components: [],
      }).catch((err) => { logButtonErr(err); return null; });
      return true;
    }
    if (!member) {
      await interaction.reply({ content: "<a:VC_Alert:1482706673176150077> Utente non trovato nel server.", flags: PRIVATE_FLAG }).catch((err) => { logButtonErr(err); return null; });
      return true;
    }
    const result = await applyDepexOneLevel(guild, member);
    if (!result.ok) {
      await interaction.reply({ content: `<a:VC_Alert:1482706673176150077> ${result.reason || "Depex non applicato."}`, flags: PRIVATE_FLAG }).catch((err) => { logButtonErr(err); return null; });
      return true;
    }
    const freshMember = await getGuildMemberCached(guild, userId, { preferFresh: true }).catch(() => member);
    await syncStaffDbAndPauseChannelAfterDepex(guild, userId, freshMember);
    const oldRoleId = result.roleRemoved;
    const newRoleId = result.newRole || (result.fullDepex ? String(IDs.roles?.Member || "") : "");
    await appendStaffRolesHistoryEntry(guild.id, userId, {
      oldRole: oldRoleId,
      newRole: newRoleId,
      reason: "Depex da 2 warn staff (scelta High Staff).",
      displayName: (freshMember?.displayName || targetUser?.globalName || targetUser?.username || "").trim() || null,
      username: String(targetUser?.username || "").trim() || null,
      avatarUrl:
        (typeof freshMember?.displayAvatarURL === "function" && freshMember.displayAvatarURL({ size: 128 })) ||
        (typeof targetUser?.displayAvatarURL === "function" && targetUser.displayAvatarURL({ size: 128 })) ||
        null,
    });
    await sendPexDepexLog(guild, "depex", targetUser, oldRoleId, newRoleId, "Depex da 2 warn staff (scelta High Staff).");
    try {
      const { notifyStaffPexDepex, memberDisplayName } = require("../Utils/Web/siteStaffEventNotifications");
      void notifyStaffPexDepex({
        guild,
        kind: "depex",
        targetUserId: userId,
        targetName: memberDisplayName(freshMember, targetUser, userId),
        oldRoleId,
        newRoleId,
        reason: "Depex da 2 warn staff (scelta High Staff).",
        actorUserId: String(interaction.user.id),
        actorName: memberDisplayName(interaction.member, interaction.user, interaction.user.id),
        sourceHint: `warn-depex-btn:${userId}`,
      }).catch(() => 0);
    } catch (_) {}
    await interaction.update({
      content: "<:vegacheckmark:1443666279058772028> Depex applicato (un livello in basso).",
      embeds: [],
      components: [],
    }).catch((err) => { logButtonErr(err); return null; });
    return true;
  }

  /*if (interaction.customId == "sanzioni") {
    const embed = new EmbedBuilder()
      .setColor("#6f4e37")
      .setDescription([
      "<:reportmessage:1443670575376765130> Ogni staffer per sanzionare dovrà __seguire__ la <#1442569237142044773>.",
      "",
      "> <a:VC_Arrow:1482706699365257397> **__LIMITI SETTIMANALI SULLE SANZIONI__**",
      "<:VC_Dot:1482532364222595303> Ogni <@&" + IDs.roles.Helper + "> dovrà __eseguire__ almeno: **`1 sanzione`**",
      "<:VC_Dot:1482532364222595303> Ogni <@&" + IDs.roles.Mod + "> dovrà __eseguire__ almeno: **`2 sanzioni`**",
      "<:VC_Dot:1482532364222595303> Ogni <@&" + IDs.roles.SeniorModerator + "> dovrà __eseguire__ almeno: **`2 sanzioni`**",
      "<:VC_Dot:1482532364222595303> Ogni <@&" + IDs.roles.Director + "> dovrà __eseguire__ almeno: **`1 sanzione`**",
      "<:VC_Dot:1482532364222595303> Ogni <@&" + IDs.roles.Admin + "> dovrà __eseguire__ almeno: **`1 sanzione`**",
      "",
      "> Chi __rispetterà__ questi limiti riceverà **una valutazione positiva**.",
    ].join("\n"));
    await interaction.reply({ embeds: [embed], flags: PRIVATE_FLAG }).catch((err) => { logButtonErr(err); return null; });
    return true;
  }*/

  if (interaction.customId == "moderazione_staff") {
    const payload = buildModerationGuideStickyPayload();
    await interaction
      .reply({ embeds: payload.embeds, components: payload.components, flags: PRIVATE_FLAG })
      .catch((err) => {
        logButtonErr(err);
        return null;
      });
    return true;
  }

  if (interaction.customId == "warnstaff") {
    const embed = new EmbedBuilder()

      .setColor("#6f4e37")
      .setDescription(
        "<:banhammer:1443651875441217639> I **warn staff** vengono __assegnati__ dopo **3 valutazioni negative**. Raggiunti i `2` **warn staff** si verrà depexati al ruolo precedente. **__(Per i Mod sarà depex completo)__**\n\n" +
        "> L'<@&1442568894349840435> può decidere di graziare qualcuno al secondo warn, ma in caso di **terzo warn** lo staffer verrà depexato **__completamente__**\n\n" +
        "<:VC_Attention:1482534443632558151> I **warn staff** non possono essere __rimossi__. Il **reset** dei __warn staff__ avviene ogni **__6 mesi__**."
      );
    await interaction.reply({ embeds: [embed], flags: PRIVATE_FLAG }).catch((err) => { logButtonErr(err); return null; });
    return true;
  }

  if (interaction.customId == "pex") {
    const embed = new EmbedBuilder()
      .setColor("#6f4e37")
      .setDescription(
        "<a:VC_LevelUp:1482527020641419415> **__GUIDA PEX__**\n\n" +
        "> <:VC_Clock:1473359204189474886> Ogni ruolo, per essere assegnato, richiede un certo tempo per essere ottenuto, ma non è detto che al raggiungimento di questo tempo venga assegnato il ruolo.\n" +
        "<:VC_Dot:1482532364222595303> Il ruolo <@&" + IDs.roles.Helper + "> è un ruolo di prova, **con un periodo variabile di 1-2 settimane**.\n" +
        "<:VC_Dot:1482532364222595303> Il ruolo <@&" + IDs.roles.Mod + "> **richiede un periodo variabile di 1-2 mesi**.\n" +
        "<:VC_Dot:1482532364222595303> Il ruolo <@&" + IDs.roles.SeniorModerator + "> **richiede un periodo variabile di 2-3 mesi**.\n" +
        "<:VC_Dot:1482532364222595303> Il ruolo <@&" + IDs.roles.Director + "> **richiede un periodo variabile di 3-4 mesi**, essendo esso un ruolo di prova per entrare a tutti gli effetti nell'<@&" + IDs.roles.HighStaff + ">.\n\n" +
        "> <:VC_Attention:1482534443632558151> Il **pex** viene assegnato quando uno staffer dimostra __costanza__, **qualità** nel lavoro e un comportamento utile alla community.\n" +
        "<:VC_1:1482706338021642333> **Limiti settimanali** completati con continuità.\n" +
        "<:VC_2:1482706376525611090> **Presenza vocale** reale e utile, soprattutto nelle vocali pubbliche.\n" +
        "<:VC_3:1482706404773990460> **Moderazione corretta**, con prove, articoli giusti e buon criterio.\n" +
        "<:VC_4:1482706432347344916> **Valutazioni positive** e contributi extra al server.\n" +
        "<:VC_5:1482706459765637272> **Comportamento maturo**, nessun abuso di potere e rispetto della guida staff.\n\n");
    await interaction.reply({ embeds: [embed], flags: PRIVATE_FLAG }).catch((err) => { logButtonErr(err); return null; });
    return true;
  }

  if (interaction.customId == "valutazioni") {
    const embed = new EmbedBuilder().setColor("#6f4e37").setDescription(
      "<a:1370everythingisstable:1444006799643508778> **__VALUTAZIONI POSITIVE__**\n\n" +
      "<a:questionexclaimanimated:1443660299994533960> Le **valutazioni positive** aumentano la possibilità di essere **pexati** e si possono **ottenere** generando un'__attività__ **superiore** a quella richiesta nei _limiti settimanali_ o facendo qualcosa per dare un **vantaggio** al __server__.\n\n" +
      "> Le **valutazioni positive** si possono **__scambiare__** per dei giorni in più di **pausa**.\n\n" +
      "<a:laydowntorest:1444006796661358673> **__VALUTAZIONI NEGATIVE__**\n\n" +
      "<a:questionexclaimanimated:1443660299994533960> Le **valutazioni negative** diminuiscono la possibilità di essere **pexati** e si ottengono **non completando** i _limiti settimanali_ o facendo qualcosa di _nocivo_ per il **server**.\n\n" +
      "> Le **valutazioni negative** possono essere **__rimosse__** completando compiti extra assegnati dall'<@&1442568894349840435> o rinunciando ad almeno `3 o più valutazioni positive` in base al motivo per cui è stata assegnata la valutazione.\n\n" +
      "<a:VC_NewsExclamation:1471891662786527253> **__VALUTAZIONI AUTOMATICHE__**\n\n" +
      "> Ogni settimana si possono ottenere delle **valutazioni automatiche** in base a tre fattori:\n" +
      "<:VC_1:1482706338021642333> **Completamento dei limiti settimanali superandoli __almeno del doppio__**\n" +
      "<:VC_2:1482706376525611090> **Completamento dei compiti extra o settimanali**\n" +
      "<:VC_3:1482706404773990460> **Completamento dei limiti sanzioni**\n\n" +
      "> Inoltre si possono ottenere delle valutazioni extra in base a alcuni ruoli:\n" +
      "<:VC_1:1482706338021642333> **Mettendo il link vanity o il sito nello status o nella bio, o mettendo una nostra GUILD TAGS**\n" +
      "<:VC_2:1482706376525611090> **Seguendo le pagine social**\n" +
      "<:VC_3:1482706404773990460> **Mettendo una recensione sul [nostro sito](https://www.viniliecaffe.it/recensioni)**\n" +
      "<:VC_4:1482706432347344916> **Boostando il server o comprando un ruolo come Donator, VIP o VIP+ \n(<:VC_Attention:1482534443632558151> __Attenzione: per i boost varrà anche solo con un boost, se viene trasferito verrà rimossa anche la valutazione.__ Solo per il ruolo Supporter e Follower bisognerà aprire un ticket \`PERKS\`)**\n\n" +
      "> L'<@&" + IDs.roles.HighStaff + "> può inoltre decidere di assegnare valutazioni extra a discrezione in base a comportamenti particolarmente virtuosi o dannosi per la community."
    );
    await interaction.reply({ embeds: [embed], flags: PRIVATE_FLAG }).catch((err) => { logButtonErr(err); return null; });
    return true;
  }

  if (interaction.customId == "pause") {
    let pauseHint =
      "> Per __richiedere__ una pausa apri la pagina sul **sito**: https://www.viniliecaffe.it/staff/pause/\n\n";
    try {
      const { siteWorkflowUrl } = require("../Utils/Web/discordWorkflowUiGate");
      pauseHint = `> Per __richiedere__ una pausa apri la pagina sul **sito**: ${siteWorkflowUrl("pause")}\n\n`;
    } catch (_) {}
    const embed = new EmbedBuilder().setColor("#6f4e37").setDescription(
      "<:Clock:1330530065133338685> Vinili & Caffè presenta un **sistema** di **`pause`** _sofisticato_, infatti è tutto __organizzato__ per **garantire** al meglio l'__attività__ del server.\n" +
      pauseHint +
      "<a:VC_Arrow:1482706699365257397> **__LIMITI__**\n" +
      "<a:loading:1443934440614264924> In un anno si possono chiedere __massimo__ **`60 giorni`** di pausa che si possono usufruire in __tutti__ i **12 mesi** dell'anno.\n\n" +
      "> Nei giorni **festivi** avrete anche dei giorni in più **ulteriori** al __normale mese__:\n" +
      "<:VC_Dot:1482532364222595303> **24**, **25**, **26**, **31** __Dicembre__\n" +
      "<:VC_Dot:1482532364222595303> **1** Gennaio\n" +
      "<:VC_Dot:1482532364222595303> **Pasqua** e **Pasquetta**\n" +
      "<:VC_Dot:1482532364222595303> **25** __Aprile__\n" +
      "<:VC_Dot:1482532364222595303> **1** __Maggio__\n" +
      "<:VC_Dot:1482532364222595303> **2** __Giugno__\n" +
      "<:VC_Dot:1482532364222595303> **15** __Agosto__\n\n" +
      "> Naturalmente per **garantire** al meglio l'attività del server ci sono dei __limiti__ di staffer che possono essere in pausa nello __stesso periodo__\n" +
      "<:VC_Dot:1482532364222595303> <@&1442568904311570555> <a:VC_Arrow:1482706699365257397> __2__ **staffer**\n" +
      "<:VC_Dot:1482532364222595303> <@&" + IDs.roles.Mod + "> <a:VC_Arrow:1482706699365257397> __2__ **staffer**\n" +
      "<:VC_Dot:1482532364222595303> <@&" + IDs.roles.SeniorModerator + "> <a:VC_Arrow:1482706699365257397> __2__ **staffer**\n" +
      "<:VC_Dot:1482532364222595303> <@&" + IDs.roles.Director + "> <a:VC_Arrow:1482706699365257397> __1__ **staffer**\n" +
      "<:VC_Dot:1482532364222595303> <@&" + IDs.roles.Admin + "> <a:VC_Arrow:1482706699365257397> __1__ **staffer**\n" +
      "<:VC_Dot:1482532364222595303> <@&" + IDs.roles.Manager + "> <a:VC_Arrow:1482706699365257397> __1__ **staffer**\n\n" +
      "<:VC_Attention:1482534443632558151> Potrai chiedere __una pausa__ **ogni mese**. Se quest'ultima cade in `2` **__mesi diversi__**, verrà contato il mese in cui viene **chiesta** la __pausa__, a patto che non superi i primi __`5` giorni__ dell'altro mese. Per chiedere un'altra pausa dovrai aspettare almeno **__`1 settimana`__**\n\n" +
      "> <:banhammer:1443651875441217639> Se l'<@&1442568894349840435> verrà a conoscenza di uno **staffer** __in pausa__ ma **attivo** in un **altro server** nel periodo di tempo della pausa, **toglierà** la pausa e **sanzionerà** lo staffer."
    );
    await interaction.reply({ embeds: [embed], flags: PRIVATE_FLAG }).catch((err) => { logButtonErr(err); return null; });
    return true;
  }

  if (interaction.customId == "limiti") {
    const embed = new EmbedBuilder().setColor("#6f4e37").setDescription(
      "<:VC_Info:1482526956703580372> I **`limiti settimanali`** sono dei **messaggi** e delle **ore vocali** che entro una __settimana__ si devono __raggiungere__.\n\n" +
      "> <:VC_Attention:1482534443632558151> **Superare** i limiti di __poco__ potrebbe comportare un **depex**, mentre **superarli** di __tanto__ **__non garantisce__** un **pex**.\n\n" +
      "<a:VC_Arrow:1482706699365257397> <@&" + IDs.roles.Helper + ">\n" +
      "<:VC_DoubleReply:1482532332509466797> **__400__** messaggi\n" +
      "<:VC_Reply:1482532158080942191> **__4h__** in vocale\n\n" +
      "<a:VC_Arrow:1482706699365257397> <@&" + IDs.roles.Mod + ">\n" +
      "<:VC_DoubleReply:1482532332509466797> **__500__** messaggi\n" +
      "<:VC_Reply:1482532158080942191> **__5h__** in vocale\n\n" +
      "<a:VC_Arrow:1482706699365257397> <@&" + IDs.roles.SeniorModerator + ">\n" +
      "<:VC_DoubleReply:1482532332509466797> **__600__** messaggi\n" +
      "<:VC_Reply:1482532158080942191> **__6h__** in vocale\n\n" +
      "<a:VC_Arrow:1482706699365257397> <@&" + IDs.roles.Director + ">\n" +
      "<:VC_DoubleReply:1482532332509466797> **__550__** messaggi\n" +
      "<:VC_Reply:1482532158080942191> **__5,5h__** in vocale\n\n" +
      "> <:VC_Attention:1482534443632558151> Verrà **valutato** anche il **modo** in cui questi __limiti__ vengono raggiunti, ovvero se lo **staffer** è stato costante o no.\n" +
      "> <:reportmessage:1443670575376765130> Ogni staffer per sanzionare dovrà __seguire__ la <#1442569237142044773>.\n\n" +
      "> <a:VC_Arrow:1482706699365257397> **__LIMITI SETTIMANALI SULLE SANZIONI__**\n" +
      "<:VC_Dot:1482532364222595303> Ogni <@&" + IDs.roles.Helper + "> dovrà __eseguire__ almeno: **`1 sanzione`**\n" +
      "<:VC_Dot:1482532364222595303> Ogni <@&" + IDs.roles.Mod + "> dovrà __eseguire__ almeno: **`2 sanzioni`**\n" +
      "<:VC_Dot:1482532364222595303> Ogni <@&" + IDs.roles.SeniorModerator + "> dovrà __eseguire__ almeno: **`2 sanzioni`**\n" +
      "<:VC_Dot:1482532364222595303> Ogni <@&" + IDs.roles.Director + "> dovrà __eseguire__ almeno: **`1 sanzione`**\n" +
      "",
      "> Chi __rispetterà__ questi limiti riceverà **una valutazione positiva**.",
    );
    await interaction.reply({ embeds: [embed], flags: PRIVATE_FLAG }).catch((err) => { logButtonErr(err); return null; });
    return true;
  }

  if (interaction.customId == "lineeguida") {
    const embed = new EmbedBuilder().setColor("#6f4e37").setDescription(
      "Per avere un server attivo bisogna prima di tutto avere un legame con la community. Ecco alcuni consigli per instaurare dei discorsi con i nuovi utenti ma anche con quelli anziani.\n\n" +
      "> ### Presentarsi è sempre una buona base!\n" +
      "Nel momento in cui un utente approda nel server, è buona prassi far capire cosa può fare qui con noi. Quando si unisce sa già che come topic abbiamo il chatting quindi si deve puntare a quella che si chiama **profilazione** ovvero la raccolta di dati dell'utente. Per farlo, abbiamo realizzato diversi ruoli che l'utente può prendere. Tutto questo è già possibile con l'inserimento ma, nel caso volesse cambiarli o aggiungerli (cosa su cui dovreste spingere), invece di usare il semplice \"wlc\" potete tranquillamente dire:\n" +
      `benvenutx @tag_utente! passa in <#${IDs.channels.commands}> e fai il comando +profile per prenderti i colori e tanti altri ruoli <3\n\n` +
      "> ### Cerca di capire chi hai davanti!\n" +
      "Per avere attività alla base, come abbiamo detto, c'è un rapporto di fiducia con l'utente. Per creare e rafforzare quest'ultimo, nel momento in cui una persona joina nel server può essere utile:\n" +
      "- guardare la foto profilo e il banner;\n" +
      "- guardare la descrizione e lo status;\n" +
      "- controllare i ruoli presi con l'inserimento.\n" +
      "Questo può servire per trovare degli interessi dell'utente poiché può avere immagini di un determinato film o una descrizione o attività dove è indicato un gioco o un brano in riproduzione utile per ingaggiare il dialogo. Non abbiate paura di dire cosa pensate ma fatelo con leggerezza e divertimento. Se, per esempio, sta ascoltando un brano che non vi piace e questo è l'unico dato che avete in vostro possesso, invece di non fare niente si può dire \"oddio ma ascolti X, a me non piace\" oppure ancora \"oddio X, meglio Y\".\n\n" +
      "> ### La costanza è fondamentale!\n" +
      "Un semplice dialogo che dura poco, non porta a niente. Cercate, anche nei giorni seguenti, di ricordarvi di quell'utente e di cosa avete trattato. Se avete parlato di musica potete condividere il giorno dopo lo screen della vostra riproduzione e taggarlo dicendo \"meglio questa!!\" oppure un semplice \"conosci?\" o nel caso di un gioco potere dire \"come va su gta?\" o robe del genere.\n\n" +
      "> ### Sii preparato a qualsiasi domanda.\n" +
      `Spesso e sicuramente un nuovo utente, specialmente di discord, non sa che ci sono determinati requisiti per fare determinate azioni. Un esempio può essere il <@&${IDs.roles.PicPerms}>. L'utente medio non lo sa e invia sempre a sua insaputa un media. Quest'ultimo, nel caso non si trovasse in possesso del ruolo, il bot <@${IDs.bots.ViniliCaffeBot}> elimina subito il messaggio e scrive che serve questo requisito MA ribaditelo anche voi. In questa maniera il dialogo continua ad esserci e non si interromperà davanti a un messaggio di un bot programmato per farlo!\n\n` +
      "Per portare avanti un progetto, renderlo bello e arricchirlo personalmente sono necessari davvero pochi e piccoli passi. Seguiteli e vedrete che andrà tutto bene! **E ricordati di divertirti!**",
    );
    await interaction.reply({ embeds: [embed], flags: PRIVATE_FLAG }).catch((err) => { logButtonErr(err); return null; });
    return true;
  }

  if (interaction.customId == "comandi") {
    const embed = new EmbedBuilder().setColor("#6f4e37").setDescription(
      "<a:VC_StarPink:1330194976440848500> Visto l'alto flusso di utenti che entrano solo per trollare o flammare, abbiamo deciso di creare una guida dedicata ai comandi sulla moderazione, ulteriore a quella già presente in <#" + IDs.channels.guidaStaff + ">.\n" +
      "> <:VC_Quest:1482534879257165865> Per i tempi e le regole è necessario seguire sempre <#" + IDs.channels.guidaStaff + "> sezione `MODERAZIONE`. Inoltre avete tutti un limite di sanzioni che dovrete fare ogni settimana per ricevere una valutazione positiva (Helper: **1**, Mod/Senior: **2**, Director: **1**). Non è un obbligo ma aiuta noi a capire chi è più attivo nello staff e a tenere pulito il server.\n\n" +
      "<:VC_BanHammer:1482534474502897795> **LISTA DEI COMANDI**\n\n" +
      "`+purge` <a:VC_Arrow:1482706699365257397> Serve per cancellare i messaggi di un determinato canale o utente, utilizzabile solo dall'<@&" + IDs.roles.HighStaff + ">\n\n" +
      "`+warn` <a:VC_Arrow:1482706699365257397> Serve per dare un avviso a un utente, esso è eseguibile da tutti. I warn vengono dati anche a chi apre un ticket e non risponde nell'arco delle 24 ore oppure trolla all'interno.\n\n" +
      "`+mute` <a:VC_Arrow:1482706699365257397> serve per silenziare un membro che commette un infrazione delle regole. Questo comando oltre a mutare mette in \"quarantena\" l'utente, ovvero toglie completamente i ruoli all'utente e ne mette uno con cui non può fare nulla.\n\n" +
      "`+kick` <a:VC_Arrow:1482706699365257397> Serve per buttare fuori, in modo temporaneo, un utente dal server. Utilizzabile solo dal <@&" + IDs.roles.Director + ">.\n\n" +
      "`+ban` <a:VC_Arrow:1482706699365257397> Serve per bannare in modo permanente un utente ed è utilizzabile solo dal <@&" + IDs.roles.Director + "> in sù.\n\n" +
      "`+modlogs` <a:VC_Arrow:1482706699365257397> Serve per controllare quante sanzioni ha un utente e vi è molto utile a capire se un utente ha già infranto una determinata regola e quindi quale tempistica applicare.\n\n" +
      "`+duration` e `+reason` <a:VC_Arrow:1482706699365257397> Servono rispettivamente per cambiare la durata e la reason di una sanzione, utilizzabile solo dal <@&" + IDs.roles.Director + "> in sù.\n\n" +
      "`+case` <a:VC_Arrow:1482706699365257397> Serve per controllare dettagliatamente un caso di moderazione e capire quando, da chi e perchè è stato fatto.\n\n" +
      "`+moderations` <a:VC_Arrow:1482706699365257397> Serve per mostrare le sanzioni **temporanee** attive su un utente.\n\n" +
      "`+warnings` <a:VC_Arrow:1482706699365257397> Serve per mostrare tutti i **warn** ottenuti da un utente.\n\n" +
      "`+clearwarn`, `+delwarn`, `+unmute` e `+unban` <a:VC_Arrow:1482706699365257397> Usati solo per rimuovere rispettivamente un warn (o tutti i warn col primo), un mute e un ban. Utilizzabili solo da <@&" + IDs.roles.Director + "> in sù.\n\n" +
      "## <a:VC_Alert:1482706673176150077> Prendi tempo per sanzionare!\n" +
      "È meglio una sanzione legittima con una motivazione corretta e una tempistica giusta rispetto a un utente che si lamenta dello staff del server!\n\n" +
      "<a:VC_Exclamation:1482534702077444217> Ricordo naturalmente di seguire anche le altre linee guida su come sanzionare in modo corretto un utente in <#" + IDs.channels.guidaStaff + ">.",
    );
    await interaction.reply({ embeds: [embed], flags: PRIVATE_FLAG }).catch((err) => { logButtonErr(err); return null; });
    return true;
  }

  if (interaction.customId == "compiti_fissi") {
    const embed = new EmbedBuilder().setColor("#6f4e37").setDescription(
      "<:VC_Quest:1482534879257165865> **__COMPITI FISSI__**\n\n" +
      "<a:VC_NewsExclamation:1471891662786527253> Ogni staffer deve **svolgere** ogni settimana **ALMENO UNO** dei seguenti **compiti**:\n" +
      "<:VC_Dot:1482532364222595303> **Trovare un nuovo staffer**\n" +
      "<:VC_Dot:1482532364222595303> **Trovare un server che dovrà effettuare una sponsor con il nostro server**\n" +
      "<:VC_Dot:1482532364222595303> **Trovare un server disponibili a effettuare un trasferimento nel nostro server**\n" +
      "<:VC_Dot:1482532364222595303> **Invitare nuovi utenti tenedoli attivi**\n" +
      "<:VC_Dot:1482532364222595303> **Convincere nuovi utenti a boostare il server o acquistare un pacchetto come Donator, VIP o VIP+**\n\n" +
      "<:VC_bluthumbsup:1482458262401061044> Svolgere uno tra questi compiti ogni settimana garantirà una **valutazione positiva** e maggiore possibilità di essere pexato.\n" +
      "<:VC_bluthumbsdown:1482458289131360306> Non farlo garantirà una **valutazione negativa** e maggiore possibilità di essere depexato.\n\n" +
      "<:VC_Ticket:1482535175283019888> Per garantire la correttezza dei compiti è necessario allegare le prove in un <#" + IDs.channels.ticket + "> `HIGH STAFF`.",
    );
    await interaction.reply({ embeds: [embed], flags: PRIVATE_FLAG }).catch((err) => { logButtonErr(err); return null; });
    return true;
  }

  if (interaction.customId == "guidapartners") {
    const body = buildStaffGuideSectionMarkdown("guidapartners");
    const embed = new EmbedBuilder().setColor("#6f4e37").setDescription(body || "Sezione non disponibile.");
    await interaction.reply({ embeds: [embed], flags: PRIVATE_FLAG }).catch((err) => { logButtonErr(err); return null; });
    return true;
  }

  if (interaction.customId == "guidamiddle") {
    const embed = new EmbedBuilder().setColor("#6f4e37").setDescription(
      `<:discordstaff:1443651872258003005> La **__guida middle__** di __Vinili & Caffè__ è dedicata a <@&${IDs.roles.SeniorModerator}> e <@&${IDs.roles.Director}>: qui trovate le procedure per i compiti di livello superiore che richiedono coordinamento e supervisione del low staff.

> La guida si divide in **__\`4\` sezioni__** accessibili **schiacciando** i \`bottoni\` sottostanti:
<:VC_1:1482706338021642333> **Gestione Ticket**
<:VC_2:1482706376525611090> **Gestione Verifica Selfie**
<:VC_3:1482706404773990460> **Gestione Follower & Supporter**
<:VC_4:1482706432347344916> **Gestione Partnership**`,
    );
    const rowMiddle = buildMiddleGuideNavRow();
    await interaction.reply({ embeds: [embed], components: [rowMiddle], flags: PRIVATE_FLAG }).catch((err) => { logButtonErr(err); return null; });
    return true;
  }

  if (interaction.customId == "middle_ticket") {
    const embed = new EmbedBuilder().setColor("#6f4e37").setDescription(
      "<:VC_Ticket:1482535175283019888> Naturalmente, essendo voi un ruolo superiore non vi è richiesto di rispondere prontamente ai ticket. Anzi, dovrete cercare di dare supporto ai low staff e intervenire solo facendovi aggiungere.\n\n" +
      "<a:VC_pixeltime:1482535344103620771> Se un ticket rimarrà non claimato per più di 5 minuti allora **dovete** claimarlo e gestirlo voi.",
    );
    await interaction.reply({ embeds: [embed], flags: PRIVATE_FLAG }).catch((err) => { logButtonErr(err); return null; });
    return true;
  }

  if (interaction.customId == "middle_selfie") {
    const embed = new EmbedBuilder().setColor("#6f4e37").setDescription(
      "<:VC_Ticket:1482535175283019888> Con l'aggiunta dei ticket `PERKS` tutti voi avrete accesso ad esso per gestire i ruoli e <@&" + IDs.roles.Verificato + "> / <@&" + IDs.roles.VerifiedNeo + "> / <@&" + IDs.roles.Verificata + ">.\n\n" +
      "<a:VC_Alert:1482706673176150077> Quando un utente aprirà il ticket per chiedere la verifica selfie sarà necessario da parte vostra controllare facendo seguire i passaggi in foto e una volta accertatovi, se siete <@&" + IDs.roles.SeniorModerator + "> dovrete taggare un <@&" + IDs.roles.Director + "> oppure da <@&" + IDs.roles.Director + "> potrete direttamente mettere il ruolo\n" +
      "> PS: Occhio a dare ruoli sbagliati, il bot potrebbe bannarvi <:VC_Eye:1331619214410383381>",
    );
    await interaction.reply({ embeds: [embed], flags: PRIVATE_FLAG }).catch((err) => { logButtonErr(err); return null; });
    return true;
  }

  if (interaction.customId == "middle_follower") {
    const embed = new EmbedBuilder().setColor("#6f4e37").setDescription(
      "<a:VC_Calendar:1482706208149475358> Ogni settimana vi dovrete organizzare per decidere chi deve controllare queste due liste.\n\n" +
      "<a:VC_Verified:1482532479637127188> Per controllare le liste dovrete usare [questo documento](<https://docs.google.com/spreadsheets/d/1rsyOqlveEraSv2YeSCY9Qg_xF3Rn6bqLj6G3-FI4Zu0/edit?usp=sharing>) chiedendo l'accesso a <@295500038401163264>.\n\n" +
      "<:VC_Quest:1482534879257165865> Ognuno di voi può controllare al **massimo 1 lista** a settimana. Ogni Sabato in questo post uno di voi compilerà un modulo come questo:\n\n" +
      "```\n@staffer -> lista che controlla\n@staff -> lista che controlla\n```\n\n" +
      "<:VC_Ticket:1482535175283019888> Con l'aggiunta dei ticket `PERKS` tutti voi avrete accesso ad esso per gestire i ruoli <@&" + IDs.roles.Follower + "> & <@&" + IDs.roles.SocialSupporter + ">, quando un utente aprirà un ticket per chiedere uno di questi due ruoli accertatevi con delle prove e, se siete <@&" + IDs.roles.SeniorModerator + "> chiamate un <@&" + IDs.roles.Director + "> per assegnare il ruolo.\n" +
      "> PS: Gentilmente, ogni volta che viene dato anche questo ruolo aggiornate le liste <a:VC_Alarm:1482706641618079816>\n\n" +
      "<a:VC_Alert:1482706673176150077> Naturalmente, fare questo compito vi garantirà una **valutazione positiva**, non presentare la lista dei compiti il sabato o non fare il compito che vi siete assegnati comporterà a una **valutazione negativa**.",
    );
    await interaction.reply({ embeds: [embed], flags: PRIVATE_FLAG }).catch((err) => { logButtonErr(err); return null; });
    return true;
  }

  if (interaction.customId == "middle_partnership") {
    const embed = new EmbedBuilder().setColor("#6f4e37").setDescription(
      "<a:VC_Calendar:1482706208149475358> Ogni settimana un <@&" + IDs.roles.Director + "> dovrà controllare tutte le <#" + IDs.channels.partnerships + "> e assicurarsi che rispettino la guida partners\n\n" +
      "<:VC_Quest:1482534879257165865> Qualsiasi partner che non rispetta quelle regole dovrà essere reportata qua settimanalmente tramite un semplice modulo\n\n" +
      "```\nlink messaggio -> regola infranta -> @partner manager\n```\n\n" +
      "<:VC_Attention:1482534443632558151> Molte regole sono già coperte da <@" + IDs.bots.ViniliCaffeBot + "> e prima di segnalare una partner controlla la pagina **Punti tolti PM** sul sito staff per capire se il bot ha già tolto il punto o meno.",
    );
    await interaction.reply({ embeds: [embed], flags: PRIVATE_FLAG }).catch((err) => { logButtonErr(err); return null; });
    return true;
  }

  if (interaction.customId == "regolamento") {
    const payload = buildModerationGuideStickyPayload();
    await interaction
      .reply({ embeds: payload.embeds, components: payload.components, flags: PRIVATE_FLAG })
      .catch((err) => {
        logButtonErr(err);
        return null;
      });
    return true;
  }

  if (interaction.customId == "regole_staff") {
    const embed = new EmbedBuilder().setColor("#6f4e37").setDescription(
      "<:rules:1443307208543703131> **__REGOLAMENTO STAFF__**\n\n" +
      `<:VC_1:1482706338021642333> **Rispettare** le regole del server.\n` +
      `<:VC_2:1482706376525611090> __Non__ **chiedere** pex _continuamente_.\n` +
      `<:VC_3:1482706404773990460> __Non__ **istigare** o creare **flame** tra lo **\`staff\`** e gli **\`utenti\`**.\n` +
      `<:VC_4:1482706432347344916> __Non__ **abusare** di potere, ad esempio **sanzionando** un __utente__ \`senza un vero motivo\`.\n` +
      `<:VC_5:1482706459765637272> Se si è in una **vocale pubblica** da __mutati__ siete **obbligati** a scrivere in <#1442569130573303898>.\n` +
      `<:VC_6:1482706490769801327> __Non__ **floodare**, **spammare** e **usare bot** per completare i **\`limiti settimanali testuali\`**.\n` +
      `<:VC_7:1482706523330183218> __Non__ passare la maggior parte del **tempo** nei **canali vocali privati**, poiché non vengono **conteggiati** al fine dei __limiti settimanali__.\n` +
      `<:VC_8:1482706553281708092> __Non__ **stare da soli** in una __vocale pubblica__ se in un'altra vi è già un altro **staffer** da solo. Inoltre, almeno uno dei due **deve** essere __smutato__.\n` +
      `> <a:VC_Alert:1482706673176150077> La violazione di una di queste regole può comportare una **sanzione** da parte dello staff, quindi è importante __conoscerle__ e __rispettarle__.`);
    await interaction.reply({ embeds: [embed], flags: PRIVATE_FLAG }).catch((err) => { logButtonErr(err); return null; });
    return true;
  }

  if (interaction.customId == "generalimoderazione") {
    const body = buildStaffGuideSectionMarkdown("generalimoderazione");
    const embed = new EmbedBuilder()
      .setColor(moderationGuideEmbedColor())
      .setDescription(body || "Sezione non disponibile.");
    await interaction.reply({ embeds: [embed], flags: PRIVATE_FLAG }).catch((err) => { logButtonErr(err); return null; });
    return true;
  }

  if (interaction.customId == "testualimoderazione") {
    const body = buildStaffGuideSectionMarkdown("testualimoderazione");
    const embed = new EmbedBuilder()
      .setColor(moderationGuideEmbedColor())
      .setDescription(body || "Sezione non disponibile.");
    await interaction.reply({ embeds: [embed], flags: PRIVATE_FLAG }).catch((err) => { logButtonErr(err); return null; });
    return true;
  }

  if (interaction.customId == "vocalimoderazione") {
    const body = buildStaffGuideSectionMarkdown("vocalimoderazione");
    const embed = new EmbedBuilder()
      .setColor(moderationGuideEmbedColor())
      .setDescription(body || "Sezione non disponibile.");
    await interaction.reply({ embeds: [embed], flags: PRIVATE_FLAG }).catch((err) => { logButtonErr(err); return null; });
    return true;
  }

  return false;
}

function buildDeniedEmbedFromGate(gate, kind, interaction = null) {
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

async function enforceInteractionPermissions(interaction) {
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
        .catch((err) => { logButtonErr(err); });
      return false;
    }
  }

  if (interaction.isStringSelectMenu && interaction.isStringSelectMenu()) {
    const gate = await checkStringSelectPermission(interaction);
    if (!gate.allowed) {
      const deniedEmbed = buildDeniedEmbedFromGate(gate, "menu", interaction);
      await interaction
        .reply({ embeds: [deniedEmbed], flags: PRIVATE_FLAG })
        .catch((err) => { logButtonErr(err); });
      return false;
    }
  }

  if (interaction.isUserSelectMenu && interaction.isUserSelectMenu()) {
    const gate = await checkStringSelectPermission(interaction);
    if (!gate.allowed) {
      const deniedEmbed = buildDeniedEmbedFromGate(gate, "menu", interaction);
      await interaction
        .reply({ embeds: [deniedEmbed], flags: PRIVATE_FLAG })
        .catch((err) => { logButtonErr(err); });
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
        .catch((err) => { logButtonErr(err); });
      return false;
    }
  }

  return true;
}

async function resolveMentionLabel(interaction, userId) {
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

async function sendPrivacyViewsLeaderboard(interaction, kind, title) {
  await interaction.deferReply({ flags: PRIVATE_FLAG }).catch((err) => { logButtonErr(err); return null; });
  const guildId = interaction.guild.id;
  const top = await ActivityUserProfile.find({ guildId }).sort({ [`profile.privacy.${kind}.views`]: -1 }).limit(10).lean().catch((err) => { logButtonErr(err, { warn: true }); return []; });

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

  if (interaction.deferred) return interaction.editReply({ embeds: [embed] }).catch((err) => { logButtonErr(err); return null; });
  return interaction.reply({ embeds: [embed], flags: PRIVATE_FLAG }).catch((err) => { logButtonErr(err); return null; });
}

module.exports = {
  handleStaffButtons,

  async execute(interaction, client) {
    if (!interaction.guild) return;
    if (!interaction.message) return;
    if (interaction.replied || interaction.deferred) return;
    const allowed = await enforceInteractionPermissions(interaction);
    if (!allowed) return;
    const levelPanelIds = ["info_boost_levels", "info_levels", "torna_indietro"];
    let levelPanelDeferred = false;
    if (interaction.isButton() && interaction.customId === "info_boost_levels") {
      const deferred = await interaction.deferReply({ flags: PRIVATE_FLAG }).catch((err) => { logButtonErr(err); return null; });
      levelPanelDeferred = !!deferred && !!interaction.deferred;
    }
    const guild = interaction.guild;
    const withFooter = (p) => (p && typeof p === "object" && Array.isArray(p.embeds) && p.embeds.length ? applyDefaultFooterToEmbeds(p, guild) : p);
    const origReply = interaction.reply.bind(interaction);
    interaction.reply = (p) => origReply(withFooter(p));
    const origEditReply = interaction.editReply.bind(interaction);
    interaction.editReply = (p) => origEditReply(withFooter(p));
    const origUpdate = interaction.update?.bind(interaction);
    if (origUpdate) interaction.update = (p) => origUpdate(withFooter(p));
    if (await handleStaffGuideSelectMenu(interaction)) return;
    if (await handleStaffButtons(interaction)) return;
    if (interaction.isStringSelectMenu()) {
      const menuId = interaction.customId;
      const values = Array.isArray(interaction.values) ? interaction.values : [];
      const categories = { personality_pronouns: ["1442568997848743997", "1442568999043989565", "1442569000063074498", "1442569001367769210",], personality_age: ["1442568993197265021", "1442568994581381170", "1442568995348807691", "1442568996774871194",], personality_region: ["1442569021861007443", "1442569023303974922", "1442569024486506498", "1442569025790939167",], personality_dm: ["1442569004215697438", "1442569005071077417", "1442569006543274126",], personality_relationship: ["1442569028173299732", "1442569029263818906",], personality_zodiac: ZODIAC_ROLE_IDS, personality_mentions: PERSONALITY_MENTION_ROLE_IDS, personality_hobby: PERSONALITY_HOBBY_ROLE_IDS, personality_colors_1: PERSONALITY_NORMAL_COLOR_ROLE_IDS_ALL, personality_colors_plus: [IDs.roles.redPlus, IDs.roles.orangePlus, IDs.roles.yellowPlus, IDs.roles.greenPlus, IDs.roles.bluePlus, IDs.roles.purplePlus, IDs.roles.pinkPlus, IDs.roles.blackPlus, IDs.roles.grayPlus, IDs.roles.whitePlus, IDs.roles.orangeBlackPlus, IDs.roles.greenBlackPlus, IDs.roles.aquaBlackPlus,], };
      const colorMenuIds = ["personality_colors_1", "personality_colors_plus"];
      const allColorRoleIds = colorMenuIds.flatMap((id) => categories[id] || []);

      const roleIds = categories[menuId];
      const rolesToRemove = colorMenuIds.includes(menuId) ? allColorRoleIds : roleIds;
      if (!roleIds) return;
      const member = interaction.member;
      if (!member) return;
      const guild = interaction.guild;
      const { existing: rolesToRemoveExisting } = partitionRoleIdsByExisting(guild, rolesToRemove || [], `menu=${menuId} (config)`);

      if (menuId === "personality_colors_plus" && values.length && !values.includes("remove")) {
        const unlocks = require("../Utils/Community/personalityColorUnlocks");
        const allowed = await unlocks.memberHasPlusColorFullEligibilityAsync(member);
        if (!allowed) {
          return interaction.reply({ content: ROLE_PLUS_FORBIDDEN, flags: PRIVATE_FLAG }).catch((err) => {
            logButtonErr(err);
            return null;
          });
        }
        const level = await unlocks.fetchNumericProfileLevel(guild.id, member.id);
        const bad = values.find((v) => v !== "remove" && !unlocks.isAllowedColorValue(v, member, level, allowed));
        if (bad) {
          return interaction.reply({
            content: "<:vegax:1443934876440068179> Non hai i requisiti per quel colore Plus (livello o permessi).",
            flags: PRIVATE_FLAG,
          }).catch((err) => {
            logButtonErr(err);
            return null;
          });
        }
      }

      await interaction.deferUpdate().catch((err) => {
        logButtonErr(err);
        return null;
      });
      if (!interaction.deferred) {
        return interaction.reply({ content: ROLE_TRY_AGAIN, flags: PRIVATE_FLAG }).catch((err) => {
          logButtonErr(err);
          return null;
        });
      }

      try {
        const beforeMember = await interaction.guild.members.fetch(interaction.user.id).catch((err) => {
          logButtonErr(err, { warn: true });
          return member;
        });
        const trackedRoleIds = (colorMenuIds.includes(menuId) ? allColorRoleIds : roleIds).filter(Boolean);
        const beforeRoleSet = new Set(beforeMember?.roles?.cache?.keys?.() || []);
        const isRemoveAction = !values.length || values.includes("remove");
        let valuesExisting = [];

        if (!isRemoveAction) {
          const partitioned = partitionRoleIdsByExisting(guild, values, `menu=${menuId} (selezione utente)`);
          valuesExisting = partitioned.existing;
        }

        let memberAfterDirectAdd = null;
        if (isRemoveAction) {
          if (colorMenuIds.includes(menuId)) {
            await setMemberRolesBulk(member, rolesToRemoveExisting, []);
          } else {
            await removeMemberRolesSequential(member, rolesToRemoveExisting);
          }
        } else if (colorMenuIds.includes(menuId)) {
          await setMemberRolesBulk(member, rolesToRemoveExisting, valuesExisting);
        } else {
          await removeMemberRolesSequential(member, rolesToRemoveExisting);
          const mAdd = await interaction.guild.members.fetch(interaction.user.id).catch((err) => {
            logButtonErr(err, { warn: true });
            return member;
          });
          const afterAdd = await mAdd.roles.add(valuesExisting).catch((err) => {
            logButtonErr(err);
            return null;
          });
          if (afterAdd) memberAfterDirectAdd = afterAdd;
          if (!afterAdd && valuesExisting.length) {
            logButtonErr(new Error(`roles.add fallita (menu=${menuId})`), { warn: true });
          }
        }

        let m = memberAfterDirectAdd;
        if (!m) {
          m = await interaction.guild.members
            .fetch({ user: interaction.user.id, force: true })
            .catch((err) => {
              logButtonErr(err, { warn: true });
              return member;
            });
        }
        const afterRoleSet = new Set(m?.roles?.cache?.keys?.() || []);
        const removedRoleIds = trackedRoleIds.filter((rid) => beforeRoleSet.has(rid) && !afterRoleSet.has(rid));
        const addedRoleIds = trackedRoleIds.filter((rid) => !beforeRoleSet.has(rid) && afterRoleSet.has(rid));
        const toRoleLabel = (rid) => {
          const role = guild?.roles?.cache?.get?.(rid);
          return role ? `<@&${rid}>` : null;
        };
        const removedRows = removedRoleIds.map(toRoleLabel).filter(Boolean).map((label) => `[-] ${label}`);
        const addedRows = addedRoleIds.map(toRoleLabel).filter(Boolean).map((label) => `[+] ${label}`);
        const header = colorMenuIds.includes(menuId) ? "Colore aggiornato:" : "Ruoli aggiornati:";
        const summaryLines = [...removedRows, ...addedRows];
        await interaction.followUp({
          content: summaryLines.length ? [header, ...summaryLines].join("\n") : `${header}\nNessuna modifica.`,
          flags: PRIVATE_FLAG,
        }).catch((err) => {
          logButtonErr(err);
          return null;
        });
        if (isRemoveAction) {
          const { persistPersonalityRoleDelta } = require("../Utils/Community/personalityRolePersistence");
          await persistPersonalityRoleDelta(guild.id, interaction.user.id, { removed: removedRoleIds }).catch((err) => logButtonErr(err, { warn: true }));
          return;
        }
        const appliedAll = valuesExisting.length ? valuesExisting.every((roleId) => m?.roles?.cache?.has?.(roleId)) : true;
        const stillOld = rolesToRemoveExisting.some(
          (rid) => valuesExisting.every((v) => String(v) !== String(rid)) && m?.roles?.cache?.has?.(rid),
        );
        if (menuId === "personality_dm" && stillOld) {
          logButtonErr(new Error("personality_dm: vecchio ruolo DM ancora presente dopo sync"), { warn: true });
          return;
        }
        if (colorMenuIds.includes(menuId) && stillOld) {
          logButtonErr(new Error(`personality color menu ${menuId}: vecchio colore ancora presente`), { warn: true });
          return;
        }
        if (!appliedAll) {
          logButtonErr(new Error(`ruoli pannello non applicati del tutto (menu=${menuId})`), { warn: true });
          return;
        }
        const { persistPersonalityRoleDelta } = require("../Utils/Community/personalityRolePersistence");
        await persistPersonalityRoleDelta(guild.id, interaction.user.id, {
          added: addedRoleIds,
          removed: removedRoleIds,
        }).catch((err) => logButtonErr(err, { warn: true }));
        return;
      } catch (err) {
        logButtonErr(err);
        return;
      }
    }
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
        }).catch((err) => { logButtonErr(err); return null; });
      }
      if (interaction.user.id !== targetId) {
        return interaction.reply({
          content:
            "<:vegax:1443934876440068179> Non puoi sbloccare l'avatar di un altro utente.",
          flags: 1 << 6,
        }).catch((err) => { logButtonErr(err); return null; });
      }
      try {
        await AvatarPrivacy.findOneAndUpdate(
          { guildId: interaction.guild.id, userId: targetId },
          {
            $set: { blocked: false },
            $setOnInsert: { guildId: interaction.guild.id, userId: targetId },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        );
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
        }).catch((err) => { logButtonErr(err); return null; });
      }
      if (interaction.user.id !== targetId) {
        return interaction.reply({
          content:
            "<:vegax:1443934876440068179> Non puoi sbloccare il banner di un altro utente.",
          flags: 1 << 6,
        }).catch((err) => { logButtonErr(err); return null; });
      }
      try {
        await BannerPrivacy.findOneAndUpdate(
          { guildId: interaction.guild.id, userId: targetId },
          {
            $set: { blocked: false },
            $setOnInsert: { guildId: interaction.guild.id, userId: targetId },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        );
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
        }).catch((err) => { logButtonErr(err); return null; });
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
          text: `Puoi bloccare le future quote tramite il comando \`+profile\` \u2022 Oggi alle ${timeStr}`,
        });
      if (originChannelId && originMessageId && originMessageId !== "0") {
        const originChannel = interaction.guild?.channels?.cache?.get(originChannelId) || (await interaction.guild?.channels?.fetch(originChannelId).catch((err) => { logButtonErr(err); return null; }));
        if (originChannel?.isTextBased?.()) {
          const originMessage = await originChannel.messages.fetch(originMessageId).catch((err) => { logButtonErr(err); return null; });
          if (originMessage) await originMessage.delete().catch((err) => { logButtonErr(err); });
        }
      }
      try {
        await decrementQuoteCount(interaction.guild?.id);
      } catch (err) {
        logButtonErr(err, { warn: true });
      }
      try {
        const { deleteQuoteBoardRecordByMessage } = require("../Utils/Quote/quoteBoardService");
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
        .catch(async (err) => {
          logButtonErr(err, { warn: true });
          await interaction
            .reply({ embeds: [removedEmbed], flags: PRIVATE_FLAG })
            .catch((e) => { logButtonErr(e); });
        });
    }

    if (interaction.customId == "metodi") {
      await interaction.reply({
        components: [
          v2Text("<:Money:1330544713463500970> Per effettuare una sponsor con __Vinili & Caffè__ ci sono due modalità: **pagando** oppure esponendo una **collaborazione** in un <#" + IDs.channels.ticket + "> `HIGH STAFF`."),
          v2Separator(),
          v2Text([
            "<:VC_Dot:1482532364222595303> **€1,50** <a:VC_Arrow:1482706699365257397> sponsor per **2** settimane",
            "<:VC_Dot:1482532364222595303> **€3** <a:VC_Arrow:1482706699365257397> sponsor per **1** mese",
            "<:VC_Dot:1482532364222595303> **€5** <a:VC_Arrow:1482706699365257397> sponsor **lifetime**",
          ].join("\n")),
        ],
        flags: v2PrivateFlags(),
      }).catch((err) => { logButtonErr(err); return null; });
    }
    if (interaction.customId == "ping") {
      await interaction.reply({
        components: [
          v2Text("<:Discord_Mention:1329524304790028328> Quando pubblichi una **partnership** viene menzionato il ruolo <@&" + IDs.roles.Partnership + "> in fondo al messaggio."),
        ],
        flags: v2PrivateFlags(),
      }).catch((err) => { logButtonErr(err); return null; });
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
      }).catch((err) => { logButtonErr(err); return null; });
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
        "<:VC_Dot:1482532364222595303> Il ruolo <@&1442568916114346096> **permanente**",
        "<:VC_Dot:1482532364222595303> Possibilità di allegare link e immagini in chat",
        "<:VC_Dot:1482532364222595303> Possibilità di usare le soundboard di altri server",
        "<:VC_Dot:1482532364222595303> Possibilità di mandare sticker ed emoji di altri server",
        "<:VC_Dot:1482532364222595303> Bypass dei requisiti nei giveaway",
        "<:VC_Dot:1482532364222595303> Possibilità di cambiare il tuo nickname",
        "<:VC_Dot:1482532364222595303> Sblocchi i COLORI PLUS in \`+profile\` <:VC_New:1471891729471770819>",
        "<:VC_Dot:1482532364222595303> Sblocchi i comandi `+quote`, `+repost` e `+myrepost`",
        "<:VC_Dot:1482532364222595303> X4 EXP boost",
      ].join("\n");

      const vip = [
        "**Vuoi sostenere il server?** Acquista il VIP e riscatta tutti i vantaggi che hai sbloccato qui nel server! <a:VC_HeartsBlue:1468686100045369404>",
        "",
        "ACQUISTA IL <@&1442568950805430312> <a:VC_HeartsPink:1468685897389052008>",
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
          v2Text("## Acquista ora!\n<:blueflash:1470064803157643468> Apri un ticket `HIGH STAFF` in: <#1442569095068254219>."),
        ],
        flags: v2PrivateFlags(),
      }).catch((err) => { logButtonErr(err); return null; });
    }

    if (interaction.customId == "info_sponsor") {
      const sponsorText = "<:pinnednew:1443670849990430750> **Vinili & Caffè** offre un servizio di __sponsor__ con dei **requisiti** da rispettare. Per fare una __sponsor__ bisognerà aprire un <#1442569095068254219> `HIGH STAFF`.\n\n"
        + "> Ogni server che vorrà effettuare una **sponsor** dovrà rispettare questi 3 requisiti:\n"
        + "> <:VC_Dot:1482532364222595303> Rispettare i [**ToS di Discord**](https://discord.com/terms)\n"
        + "> <:VC_Dot:1482532364222595303> Rispettare le [**Linee Guida di Discord**](https://discord.com/guidelines)\n"
        + "> <:VC_Dot:1482532364222595303> Rispettare il [**Regolamento di Vinili & Caffè**](https://discord.com/channels/1329080093599076474/1442569111119990887)";
      const rowSponsor = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("metodi").setLabel("︲METODI").setEmoji("<:Money:1330544713463500970>").setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId("ping").setLabel("︲PING").setEmoji("<:Discord_Mention:1329524304790028328>").setStyle(ButtonStyle.Secondary));
      await interaction.reply({ components: [v2Text(sponsorText), rowSponsor], flags: v2PrivateFlags() }).catch((err) => { logButtonErr(err); return null; });
    }

    if (interaction.customId == "candidature_premi_partner") {
      const {
        buildPartnerRewardDiscountBanner,
        buildPartnerRewardDiscordEmbedLines,
        getPartnerRewardPointCost,
      } = require("../../shared/partner/partnerManagerRewardTiers");
      const tierLines = buildPartnerRewardDiscordEmbedLines();
      const discountBanner = buildPartnerRewardDiscountBanner();
      const autoRedeemCosts = [getPartnerRewardPointCost(50), getPartnerRewardPointCost(100)].join("** e **");
      const premiPartnerEmbed = new EmbedBuilder()
        .setColor("#6f4e37")
        .setDescription(
          "<:partneredserverowner:1443651871125409812> **__Vinili & Caffè__** offre un servizio di __pagamento__ in base al numero di **partner** effettuate.\n" +
          "> Per riscattare eventuali premi bisognerà aprire un <#1442569095068254219> **__`HIGH STAFF`__**\n\n" +
          (discountBanner ? `${discountBanner}\n\n` : "") +
          tierLines.join("\n") +
          `\n\n> Dal pannello \`+profile\` (High Staff): i riscatti **${autoRedeemCosts}** fanno in automatico **scalatura + premio** (CR+Voc/VIP 30 giorni). **Decorazione**, **Nitro** e **PayPal**: premio a mano.\n\n` +
          `<a:VC_Winner:1482535294757507255> Inoltre, ogni mese, il miglior <@&${IDs.roles.Staff}> riceverà un **Nitro __Boost__** come premio.\n\n` +
          "<a:flyingnitroboost:1443652205705170986> Naturalmente almeno un **boost** dovrà andare a **__Vinili & Caffè__**.",
        )
        ;
      await interaction.reply({ embeds: [premiPartnerEmbed], flags: PRIVATE_FLAG }).catch((err) => { logButtonErr(err); return null; });
    }

    const sendUpdatedView = async (payload) => {
      if (levelPanelDeferred || interaction.deferred) {
        return interaction.editReply(payload).catch((err) => {
          if (err?.code === 10062) return;
          global.logger?.error?.("[buttons] sendUpdatedView editReply error:", err?.message ?? err, err?.code);
        });
      }
      const updated = await interaction.update(payload).catch((err) => {
        if (err?.code === 10062) return null;
        logButtonErr(err);
        return null;
      });
      if (updated !== null) return;
      return interaction.reply({ ...payload, flags: PRIVATE_FLAG }).catch((err) => {
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
      }).catch((err) => { logButtonErr(err); return null; });
    }

    if (interaction.customId === "info_buttons_test_ok") {
      await interaction.reply({ content: "Perfetto: i bottoni standard stanno funzionando <a:VC_Verified:1482532479637127188>", flags: PRIVATE_FLAG }).catch((err) => { logButtonErr(err); return null; });
    }

    if (interaction.customId === "info_buttons_test_no") {
      await interaction.reply({ content: "Ricevuto <a:VC_Cross:1482532424570376253>: i bottoni standard non stanno rispondendo come previsto.", flags: PRIVATE_FLAG }).catch((err) => { logButtonErr(err); return null; });
    }

    if (interaction.customId === "info_buttons_test_ping") {
      await interaction.reply({ content: "pong", flags: PRIVATE_FLAG }).catch((err) => { logButtonErr(err); return null; });
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
          "<:blueflash:1470064803157643468> Sblocchi i COLORI PLUS in \`+profile\` <:VC_New:1471891729471770819>",
          "<a:VC_CrownYellow:1482706085440651428> Aggiungi reazioni al messaggio quando ti @menzionano in chat (max. 3)",
          MENTION_RESPONSE_PERK_LINE_DISCORD,
          "<a:reddiamond:1443652837346377841> Sblocchi i comandi `+quote`, `+repost` e `+myrepost`",
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
          `Usa \`+profile\` in <#${IDs.channels.commands}> per creare e configurare il ruolo, la vocale, le reaction e la Mention Response.`,
          `Usa \`+profile\` in <#${IDs.channels.commands}> per scegliere il colore gradiente del tuo ruolo.`,
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
              "<:VC_DoubleReply:1482532332509466797> Sblocchi i comandi \`+quote\`, \`+repost\` e \`+myrepost\`",
              `<:VC_Reply:1482532158080942191> <:VC_New:1471891729471770819> Nuovo colore gradiente sbloccato con \`+profile\`<@&${IDs.roles.colorUnlockLv10}>`
            ].join("\n"),
            inline: true,
          },
          {
            name: "\`LIVELLO 20-29\`",
            value: [
              `<@&${IDs.roles.Level20}>`,
              "Tutte le ricompense precedenti",
              "<:VC_DoubleReply:1482532332509466797> Possibilità di aggiungere reazioni ai messaggi in chat",
              `<:VC_Reply:1482532158080942191> <:VC_New:1471891729471770819> Nuovo colore gradiente sbloccato con \`+profile\`<@&${IDs.roles.colorUnlockLv20}>`
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
              `<:VC_Reply:1482532158080942191> <:VC_New:1471891729471770819> Nuovo colore gradiente sbloccato con \`+profile\`<@&${IDs.roles.colorUnlockLv30}>`
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
              `<:VC_Reply:1482532158080942191> <:VC_New:1471891729471770819> Nuovo colore gradiente sbloccato con \`+profile\`<@&${IDs.roles.colorUnlockLv50}>`
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
              `<:VC_Reply:1482532158080942191> <:VC_New:1471891729471770819> Nuovo colore gradiente sbloccato con \`+profile\`<@&${IDs.roles.colorUnlockLv70}>`
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
              `<:VC_Reply:1482532158080942191> <:VC_New:1471891729471770819> Nuovo colore gradiente sbloccato con \`+profile\`<@&${IDs.roles.colorUnlockLv100}>`
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
              `<:VC_Reply:1482532158080942191> <:VC_New:1471891729471770819> Nuovo **Plus combo Black** con \`+profile\` <@&${IDs.roles.orangeBlackPlus}>`,
            ].join("\n"),
            inline: true,
          },
          {
            name: "\`LIVELLO 150-199\`",
            value: [
              `<@&${IDs.roles.Level150}>`,
              "Tutte le ricompense precedenti",
              "<:VC_DoubleReply:1482532332509466797> Bonus EXP permanente +25%",
              `<:VC_Reply:1482532158080942191> <:VC_New:1471891729471770819> Nuovo **Plus combo Black** con \`+profile\` <@&${IDs.roles.greenBlackPlus}>`,
              "<:VC_DoubleReply:1482532332509466797> Decorazione a scelta riscattabile tramite ticket **HIGH STAFF**",
            ].join("\n"),
            inline: true,
          },
          {
            name: "\`LIVELLO 200+\`",
            value: [
              `<@&${IDs.roles.Level200}>`,
              "Tutte le ricompense precedenti",
              `<:VC_Reply:1482532158080942191> <:VC_New:1471891729471770819> Nuovo **Plus combo Black** con \`+profile\` <@&${IDs.roles.aquaBlackPlus}>`,
              "<:VC_DoubleReply:1482532332509466797> Nitro Boost mensile riscattabile tramite ticket **HIGH STAFF**",
            ].join("\n"),
            inline: true,
          },
        )

        .setFooter({ text: "Se esci dal server o cambi account, i livelli ti verranno tolti e NON rimessi." });

      const howtoEmbed = new EmbedBuilder().setColor("#6f4e37").setTitle("<:nitroboost:1470064881674883326> **__Come creare ruolo personalizzato e vocale privata__**").setDescription([
        `Usa \`+profile\` in <#${IDs.channels.commands}> per creare e configurare il ruolo, la vocale, le reaction e la Mention Response.`,
        `Usa \`+profile\` in <#${IDs.channels.commands}> per scegliere il colore gradiente del tuo ruolo.`,
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
              "<@&1468674837957574757>/<@&1468674787399172208>",
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
              "<@&1468266342682722679>",
              "Ottenibile votando il server dalla [pagina Voti](<https://www.viniliecaffe.it/vote>) del sito (Discadia e Top.gg).",
              "<:VC_DoubleReply:1482532332509466797> EXP casuale da 100 a 250.",
              "<:VC_Reply:1482532158080942191> Ruolo esclusivo per 12 o 24 ore.",
            ].join("\n"),
            inline: true,
          },
          {
            name: "`PROMOTER`",
            value: [
              "<@&1469758545263198442>",
              "Ottenibile invitando 5 persone nel server, attraverso [custom link](<https://imgur.com/a/3wpDOVj>)",
              "<:VC_DoubleReply:1482532332509466797> Permesso di allegare link e immagini in chat",
              "<:VC_Reply:1482532158080942191> Permesso di cambiare il tuo nickname",
            ].join("\n"),
            inline: true,
          },
          {
            name: "`PROPULSOR`",
            value: [
              "<@&1474357579143577610>",
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
              "<@&1474361806956007425>",
              "Ottenibile invitando 100 persone nel server, attraverso [custom link](<https://imgur.com/a/3wpDOVj>)",
              "९ Tutte le ricompense precedenti",
              "<:VC_Reply:1482532158080942191> Usare SoundBoard esterne nelle vocali",
            ].join("\n"),
            inline: true,
          },
          {
            name: "`GUILDED`",
            value: [
              "<@&1471955147692179497>",
              "Ottenibile mettendo una delle nostre guild tags",
              "९ Esclusività del ruolo.",
            ].join("\n"),
            inline: true,
          },
          {
            name: "`VETERANO`",
            value: [
              "<@&1469073503025103113>",
              "Ottenibile stando nel server per almeno 1 mese",
              "९ Esclusività del ruolo.",
            ].join("\n"),
            inline: true,
          },
          {
            name: "`OG`",
            value: [
              "<@&1469041493401534644>",
              "Ottenibile stando nel server per almeno 1 anno",
              "९ Esclusività del ruolo.",
            ].join("\n"),
            inline: true,
          },
        )
        .setFooter({
          text: "⚠️ ▸ Se dovessi uscire dal server o cambiare account perderai i tuoi badge e i vantaggi annessi.",
        });

      await interaction.reply({ embeds: [badgesEmbed], flags: PRIVATE_FLAG }).catch((err) => { logButtonErr(err); return null; });
    }

    /*
    if (interaction.customId == "r_multiplier_info") {
      const entries = ROLE_MULTIPLIERS instanceof Map ? Array.from(ROLE_MULTIPLIERS.entries()) : Array.isArray(ROLE_MULTIPLIERS) ? ROLE_MULTIPLIERS : Object.entries(ROLE_MULTIPLIERS || {});

      const lines = entries.length ? entries.map(([roleId, multi]) => `<@&${roleId}><a:VC_Arrow:1482706699365257397>x${multi}`,
      )
        : ["Nessun moltiplicatore attivo."];

      const embed = new EmbedBuilder().setColor("#6f4e37").setTitle("<:VC_EXP:1482534670896730143> Informazioni sui moltiplicatori",).setDescription(["I moltiplicatori sono ruoli che ti consentono di avere un boost di exp sui messaggi in chat e minuti di vocale.", `I ruoli sono sbloccabili in diversi modi, scopri come nel canale: <#${IDs.channels.info}>`,
        "",
        "**Moltiplicatori attivi:**",
        ...lines,
        "",
        "**Nota sulla classifica settimanale:**",
        "Gli exp che determinano la classifica settimanale non vengono influenzati dai moltiplicatori per garantire parità tra gli utenti.",
        "",
        "Puoi vedere la classifica settimanale con il comando \`+classifica\`",
      ].join("\n"),
      );

      await interaction.reply({ embeds: [embed], flags: PRIVATE_FLAG }).catch((err) => { logButtonErr(err); return null; });
    }
    */

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