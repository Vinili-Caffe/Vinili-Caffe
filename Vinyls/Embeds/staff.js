const IDs = require("../Utils/Config/ids");
const { getClientChannelCached, getClientGuildCached, getGuildChannelCached } = require("../Utils/Interaction/interactionEntityCache");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { upsertPanelMessage } = require("../../shared/discord/panelUpsertRuntime");
const { DIVIDER_URL } = require("../../shared/discord/constants");
const SHOW_SANZIONI_IN_GUIDA_STAFF = true;

async function resolveBestStaffChannel(client) {
  const channelId = String(IDs.channels?.bestStaff || "").trim();
  if (!client || !channelId) return null;
  const fromCache = client.channels?.cache?.get(channelId) || null;
  if (fromCache?.isTextBased?.()) return fromCache;
  const fromClient = (await getClientChannelCached(client, channelId).catch(() => null)) || null;
  if (fromClient?.isTextBased?.()) return fromClient;

  const guildId = String(IDs.guilds?.main || "").trim();
  if (!guildId) return null;
  const guild = (await getClientGuildCached(client, guildId).catch(() => null)) || null;
  if (!guild) return null;
  const fromGuild = (await getGuildChannelCached(guild, channelId).catch(() => null)) || null;
  return fromGuild?.isTextBased?.() ? fromGuild : null;
}

async function run(client) {
  const moderationChannel = client.channels.cache.get(IDs.channels.moderazioneStaff) || (await getClientChannelCached(client, IDs.channels.moderazioneStaff));
  const guideChannel = client.channels.cache.get(IDs.channels.guidaStaff) || (await getClientChannelCached(client, IDs.channels.guidaStaff));

  const stafferDelMeseRoleId = String(IDs.roles?.StafferDelMese || "").trim();
  const stafferDelMeseMention = stafferDelMeseRoleId ? `<@&${stafferDelMeseRoleId}>` : "**Staffer del Mese**";

  const embedStaffDelMese = new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      [
        "<:VC_Leaderboard:1482534806314287387> Ogni mese viene scelto **un solo** staffer da premiare, escluso l'<@&1442568894349840435>.",
        "",
        "<:VC_PinkQuestionMark:1471892611026391306> **Come si decide?**",
        "La scelta tiene conto di **attività nel server**, **presenza** e **contributo** allo staff.",
        "",
        "<a:VC_Winner:1482535294757507255> **Premi per il vincitore**",
        `<:VC_Dot:1482532364222595303> Ruolo ${stafferDelMeseMention}`,
        "<:VC_Dot:1482532364222595303> **5 giorni di pausa in più**",
        "<:VC_Dot:1482532364222595303> **Nitro Boost**",
        "",
        "<a:flyingnitroboost:1443652205705170986> Naturalmente almeno un **boost** dovrà andare a **__Vinili & Caffè__**.",
      ].join("\n"),
    )

  const embeds = [
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setDescription(
        `<:discordstaff:1443651872258003005> La **__guida staff__** di __Vinili & Caffè__ serve per portare **ordine** tra lo __staff__, infatti sono presenti delle **__regole__** che __tutti__ dovranno **rispettare**; in __caso__ vengano \`trasgredite\`, potreste andare **incontro** a **__sanzioni__**, come **__\`valutazioni negative\`__** o in casi estremi il **__\`depex\`__**.

> La __guida staff__ si divide in **__\`11\` sezioni__** che sono __accessibili__ **schiacciando** i \`bottoni\` sottostanti:
<:VC_1:1482706338021642333> **Regolamento**
<:VC_2:1482706376525611090> **Limiti Settimanali**
<:VC_3:1482706404773990460> **Pause**
<:VC_4:1482706432347344916> **Valutazioni**
<:VC_5:1482706459765637272> **Moderazione**
<:VC_6:1482706490769801327> **Warn Staff**
<:VC_7:1482706523330183218> **Guida Pex**
<:VC_8:1482706553281708092> **Linee Guida**
<:VC_9:1482706583438889051> **Comandi**
<:VC_10:1482706613663174707> **Guida Partners**
<:VC_11:1519322162329026812> **Guida Middle**
`,
      ),
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setDescription(
        `<a:VC_Alarm:1482706641618079816> Per **applicare** le __sanzioni__, è necessario __attenersi__ alle **indicazioni** riportate di seguito e **consultare** le procedure disponibili __cliccando__ sui **bottoni** alla fine del messaggio.

<:VC_1:1482706338021642333> <a:VC_Arrow:1482706699365257397> Bisogna **__sempre__** allegare le **prove** (screen, video, link di messaggi).

<:VC_2:1482706376525611090> <a:VC_Arrow:1482706699365257397> Il __numero__ della **sanzione** si basa su quante volte l'**utente** è stato **sanzionato __specificatamente__ per quella regola**.

<:VC_3:1482706404773990460> <a:VC_Arrow:1482706699365257397> Quando **sanzionate**, usate sempre l'**__articolo__** del **regolamento** infranto.

<:VC_4:1482706432347344916> <a:VC_Arrow:1482706699365257397> Per visualizzare **quante** volte un __utente__ è stato **sanzionato** usate il comando +modlogs **__\`ID\`__**

<:VC_5:1482706459765637272> <a:VC_Arrow:1482706699365257397> Bisogna **__sempre__** sanzionare nel canale <#1442569245878648924> usando i comandi di <@1329118940110127204>

<:VC_6:1482706490769801327> <a:VC_Arrow:1482706699365257397> Ogni volta che si __oltrepassa__ il numero di **sanzioni ottenibili** si **ricomincia** il __ciclo__ di sanzioni per quella **specifica __regola__**.`,
      )
  ];

  const cleanRowGuideMain = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("regolamento").setLabel("︲REGOLAMENTO").setEmoji("<:rules:1443307208543703131>").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("limiti").setLabel("︲LIMITI").setEmoji("<:reportmessage:1443670575376765130>").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("pause").setLabel("︲PAUSE").setEmoji("<:Clock:1330530065133338685>").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("valutazioni").setLabel("︲VALUTAZIONI").setEmoji("<a:loading:1443934440614264924>").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("moderazione_staff").setLabel("︲MODERAZIONE").setEmoji("<:discordstaff:1443651872258003005>").setStyle(ButtonStyle.Secondary),
  );
  const cleanRowGuideSecondary = new ActionRowBuilder().addComponents(
    /*
    ...(SHOW_SANZIONI_IN_GUIDA_STAFF
      ? [new ButtonBuilder().setCustomId("sanzioni").setLabel("︲SANZIONI").setEmoji("<a:VC_Alarm:1482706641618079816>").setStyle(ButtonStyle.Secondary)]
      : []),
    */
    new ButtonBuilder().setCustomId("warnstaff").setLabel("︲WARN STAFF").setEmoji("<:banhammer:1443651875441217639>").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("pex").setLabel("︲PEX").setEmoji("<a:VC_LevelUp:1482527020641419415>").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("lineeguida").setLabel("︲LINEE GUIDA").setEmoji("<:VC_PinkQuestionMark:1471892611026391306>").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("comandi").setLabel("︲COMANDI").setEmoji("<:VC_Bot:1482526555174604964>").setStyle(ButtonStyle.Secondary),
  );
  const cleanRowGuidePartners = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("guidapartners").setLabel("︲GUIDA PARTNERS").setEmoji("<:VC_PartnerManager:1494286911286808576>").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("guidamiddle").setLabel("︲GUIDA MIDDLE").setEmoji("<:discordstaff:1443651872258003005>").setStyle(ButtonStyle.Secondary),
  );
  const rowModeration = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("generalimoderazione").setLabel("︲GENERALI").setEmoji("<:appdirectoryallwhite:1443308556995788840>").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("testualimoderazione").setLabel("︲TESTUALI").setEmoji("<:discordchannelwhite:1443308552536985810>").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("vocalimoderazione").setLabel("︲VOCALI").setEmoji("<:microphone:1443307206824169573>").setStyle(ButtonStyle.Secondary),
  );

  const bestStaffChannel = await resolveBestStaffChannel(client);
  if (!bestStaffChannel) {
    global.logger?.error?.(
      "[staff embed] Staff del Mese: canale `bestStaff` non risolvibile o non postabile (serve un canale testuale). ID:",
      String(IDs.channels?.bestStaff || ""),
    );
  } else {
    await upsertPanelMessage(bestStaffChannel, client, {
      embeds: [embedStaffDelMese],
      components: [],
    }).catch((err) => {
      global.logger?.error?.("[staff embed] Staff del Mese: upsert su bestStaff fallito:", err?.message || err);
    });
  }
  if (guideChannel?.isTextBased?.()) {
    await upsertPanelMessage(guideChannel, client, {
      embeds: [embeds[0]],
      components: [cleanRowGuideMain, cleanRowGuideSecondary, cleanRowGuidePartners],
    });
  }
  if (moderationChannel?.isTextBased?.()) {
    await upsertPanelMessage(moderationChannel, client, {
      embeds: [embeds[1]],
      components: [rowModeration],
    });
  }
}

module.exports = { name: "staff", order: 30, section: "embedWithButtons", run };