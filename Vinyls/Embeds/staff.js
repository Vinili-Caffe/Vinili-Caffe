const IDs = require("../Utils/Config/ids");
const { getClientChannelCached, getClientGuildCached, getGuildChannelCached } = require("../Utils/Interaction/interactionEntityCache");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { buildStaffGuideMenuRow } = require("../Utils/Staff/staffGuideMenuComponents");
const { upsertPanelMessage } = require("../../shared/discord/panelUpsertRuntime");
const { DIVIDER_URL } = require("../../shared/discord/constants");
const SHOW_SANZIONI_IN_GUIDA_STAFF = true;

function buildStaffGuideEmbed() {
  const ch = IDs.channels;

  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      [
        "<:discordstaff:1443651872258003005> La **guida staff** è il manuale ufficiale di **Vinili & Caffè**: qui trovi regole, obiettivi di attività, procedure di moderazione e criteri di carriera.",
        "",
        "<a:VC_Alert:1482706673176150077> Ogni membro dello staff deve **conoscerla e rispettarla**. In caso di violazioni si possono ricevere **valutazioni negative**, **warn staff** e, nei casi più gravi, il **depex**.",
        "",
        "> <a:VC_Rule:1482706839928967280> Apri una sezione dal **menu qui sotto** per leggere il capitolo completo.",
      ].join("\n"),
    )
    .addFields(
      {
        name: "<:VC_Attention:1482534443632558151> Canali di riferimento",
        value: [
          `<:VC_Dot:1482532364222595303> Sanzioni utenti: <#${ch.sanzioniUtenti}>`,
          `<:VC_Dot:1482532364222595303> Richiesta pause: <#${ch.pause}>`,
          `<:VC_Dot:1482532364222595303> Valutazioni e Warn staff: <#${ch.valutazioniStaff}>`,
        ].join("\n"),
        inline: false,
      },
    )
}

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
    buildStaffGuideEmbed(),
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

  const staffGuideMenuRow = buildStaffGuideMenuRow();
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
      components: [staffGuideMenuRow],
    });
  }
  if (moderationChannel?.isTextBased?.()) {
    await upsertPanelMessage(moderationChannel, client, {
      embeds: [embeds[1]],
      components: [rowModeration],
    });
  }
}

module.exports = {
  name: "staff", order: 30, section: "embedWithButtons", run, buildStaffGuideEmbed };