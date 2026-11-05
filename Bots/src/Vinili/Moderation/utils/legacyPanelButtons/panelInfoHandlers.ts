const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js") as typeof import("discord.js");
const { decrementQuoteCount } = require("../../../Community/utils/Quote/quoteCounter") as typeof import("../../../Community/utils/Quote/quoteCounter");
const { AvatarPrivacy, BannerPrivacy } = require("../../../Community/schemas/communitySchemas") as typeof import("../../../Community/schemas/communitySchemas");
const IDs = require("../../../Config/ids") as typeof import("../../../Config/ids");
const { MENTION_RESPONSE_PERK_BODY, MENTION_RESPONSE_PERK_LINE_DISCORD } = require("../../../Community/utils/mentionResponseAccessUtils") as typeof import("../../../Community/utils/mentionResponseAccessUtils");
const { siteTicketsPageDiscordRef } = require("../../../../shared/web/siteTicketsPageRef") as typeof import("../../../../shared/web/siteTicketsPageRef");
const { TENANT_EMBED_COLOR } = require("../../../../MultiGuild/utils/tenantEmbedBranding") as typeof import("../../../../MultiGuild/utils/tenantEmbedBranding");
const { MOD_RULE_DETAIL } = require("../modRegolamentoConstants") as typeof import("../modRegolamentoConstants");
const { PRIVATE_FLAG, v2Text, v2Separator, v2PrivateFlags, logButtonErr } = require("./shared") as typeof import("./shared");
const { sendPrivacyViewsLeaderboard } = require("./privacyViews") as typeof import("./privacyViews");

const { E } = require("../../../../shared/emojis/emojiCatalog") as typeof import("../../../../shared/emojis/emojiCatalog");
async function handleLegacyPanelInfoButtons(interaction?, opts: Record<string, any> = {}) {
  const levelPanelDeferred = Boolean(opts.levelPanelDeferred);
  if (!interaction.isButton()) return;

  if (
    interaction.customId &&
    interaction.customId.startsWith("avatar_unblock:")
  ) {
    const targetId = interaction.customId.split(":")[1] || "";
    if (!targetId) {
      return interaction.reply({
        content: `${E.vegax} Link non valido.`,
        flags: 1 << 6,
      }).catch((err?) => { logButtonErr(err); return null; });
    }
    if (interaction.user.id !== targetId) {
      return interaction.reply({
        content:
          `${E.vegax} Non puoi sbloccare l'avatar di un altro utente.`,
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
        content: `${E.vegax} Link non valido.`,
        flags: 1 << 6,
      }).catch((err?) => { logButtonErr(err); return null; });
    }
    if (interaction.user.id !== targetId) {
      return interaction.reply({
        content:
          `${E.vegax} Non puoi sbloccare il banner di un altro utente.`,
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
        content: `${E.vegax} Link non valido.`,
        flags: 1 << 6,
      }).catch((err?) => { logButtonErr(err); return null; });
    }
    const targetId = parts[1];
    const originChannelId = parts[2] || null;
    const originMessageId = parts[3] || null;
    if (interaction.user.id !== targetId) {
      const denied = new EmbedBuilder().setColor("#e74c3c").setTitle(`${E.vegax} Accesso negato`).setDescription("Solo l'autore della citazione può rimuoverla.");
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
      const { deleteQuoteBoardRecordByMessage } = require("../../../Community/utils/Quote/quoteBoardService") as typeof import("../../../Community/utils/Quote/quoteBoardService");
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
        v2Text(`${E.Money} Per effettuare una sponsor con __Vinili & Caffè__ ci sono due modalità: **pagando** oppure esponendo una **collaborazione** in un ` + siteTicketsPageDiscordRef("HIGH STAFF") + "."),
        v2Separator(),
        v2Text([
          `${E.VC_Dot} **€1,50** ${E.VC_Arrow} sponsor per **2** settimane`,
          `${E.VC_Dot} **€3** ${E.VC_Arrow} sponsor per **1** mese`,
          `${E.VC_Dot} **€5** ${E.VC_Arrow} sponsor **lifetime**`,
        ].join("\n")),
      ],
      flags: v2PrivateFlags(),
    }).catch((err?) => { logButtonErr(err); return null; });
  }
  if (interaction.customId == "ping") {
    await interaction.reply({
      components: [
        v2Text(`${E.Discord_Mention} Quando pubblichi una **partnership** viene menzionato il ruolo <@&` + IDs.roles.Partnership + "> in fondo al messaggio."),
      ],
      flags: v2PrivateFlags(),
    }).catch((err?) => { logButtonErr(err); return null; });
  }

  if (interaction.customId == "info_rules") {
    const generalRules = [
      `${E.rules} **\`REGOLA GENERALE 1.1\`**`,
      `${E.VC_Reply} ${MOD_RULE_DETAIL["1.1"]}`,
      "",
      `${E.rules} **\`REGOLA GENERALE 1.2\`**`,
      `${E.VC_Reply} ${MOD_RULE_DETAIL["1.2"]}`,
      "",
      `${E.rules} **\`REGOLA GENERALE 1.3\`**`,
      `${E.VC_Reply} ${MOD_RULE_DETAIL["1.3"]}`,
      "",
      `${E.rules} **\`REGOLA GENERALE 1.4\`**`,
      `${E.VC_Reply} ${MOD_RULE_DETAIL["1.4"]}`,
      "",
      `${E.rules} **\`REGOLA GENERALE 1.5\`**`,
      `${E.VC_Reply} ${MOD_RULE_DETAIL["1.5"]}`,
      "",
      `${E.rules} **\`REGOLA GENERALE 1.6\`**`,
      `${E.VC_Reply} ${MOD_RULE_DETAIL["1.6"]}`,
    ].join("\n");
    const textRules = [
      `${E.rules} **\`REGOLA TESTUALE 2.1\`**`,
      `${E.VC_Reply} ${MOD_RULE_DETAIL["2.1"]}`,
      "",
      `${E.rules} **\`REGOLA TESTUALE 2.2\`**`,
      `${E.VC_Reply} ${MOD_RULE_DETAIL["2.2"]}`,
      "",
      `${E.rules} **\`REGOLA TESTUALE 2.3\`**`,
      `${E.VC_Reply} ${MOD_RULE_DETAIL["2.3"]}`,
      "",
      `${E.rules} **\`REGOLA TESTUALE 2.4\`**`,
      `${E.VC_Reply} ${MOD_RULE_DETAIL["2.4"]}`,
    ].join("\n");
    const voiceRules = [
      `${E.rules} **\`REGOLA VOCALE 3.1\`**`,
      `${E.VC_Reply} ${MOD_RULE_DETAIL["3.1"]}`,
      "",
      `${E.rules} **\`REGOLA VOCALE 3.2\`**`,
      `${E.VC_Reply} ${MOD_RULE_DETAIL["3.2"]}`,
      "",
      `${E.rules} **\`REGOLA VOCALE 3.3\`**`,
      `${E.VC_Reply} ${MOD_RULE_DETAIL["3.3"]}`,
      "",
      `${E.rules} **\`REGOLA VOCALE 3.4\`**`,
      `${E.VC_Reply} ${MOD_RULE_DETAIL["3.4"]}`,
      "",
      `${E.rules} **\`REGOLA VOCALE 3.5\`**`,
      `${E.VC_Reply} ${MOD_RULE_DETAIL["3.5"]}`,
    ].join("\n");
    await interaction.reply({
      components: [
        v2Text(generalRules),
        v2Separator(),
        v2Text(textRules),
        v2Separator(),
        v2Text(voiceRules),
        v2Separator(),
        v2Text(`${E["5751attentionfromvega"]} __Lo staff si riserva il diritto di cambiare sanzioni e regole in base alla situazione.__`),
      ],
      flags: v2PrivateFlags(),
    }).catch((err?) => { logButtonErr(err); return null; });
  }

  if (interaction.customId == "info_donations") {
    const donations = [
      `## ${E.VC_Sparkles} Supporta il server con l'acquisto di un VIP o una donazione!`,
      "",
      "Usiamo i soldi donati per portare eventi con premi migliori, come Discord Nitro o gift card, e per cercare collaborazioni interessanti per voi utenti.",
      "Le donazioni sono completamente volontarie e contribuiscono alla nostra crescita. In anticipo, grazie.",
      "",
      "**Vuoi acquistare direttamente tutti i vantaggi permanenti e differenti dal VIP?**",
      "`5,00 €`✩",
      `${E.VC_Dot} Il ruolo <@&1544830864565735515> **permanente**`,
      `${E.VC_Dot} Possibilità di allegare link e immagini in chat`,
      `${E.VC_Dot} Possibilità di usare le soundboard di altri server`,
      `${E.VC_Dot} Possibilità di mandare sticker ed emoji di altri server`,
      `${E.VC_Dot} Bypass dei requisiti nei giveaway`,
      `${E.VC_Dot} Possibilità di cambiare il tuo nickname`,
      `${E.VC_Dot} Sblocchi i COLORI PLUS in [Personalizza](https://www.viniliecaffe.it/personalizza/) ${E.VC_New}`,
      `${E.VC_Dot} Sblocchi i comandi \`+quote\` e \`+repost\``,
      `${E.VC_Dot} X4 EXP boost`,
    ].join("\n");

    const vip = [
      `**Vuoi sostenere il server?** Acquista il VIP e riscatta tutti i vantaggi che hai sbloccato qui nel server! ${E.VC_HeartsBlue}`,
      "",
      `ACQUISTA IL <@&1544830866616754257> ${E.VC_HeartsPink}`,
      "`10,00 €`✩",
      "",
      `${E.sparkledred} Sbloccherai:`,
      `${E.VC_Dot} Permesso di allegare link e immagini in chat`,
      `${E.VC_Dot} Permesso di usare soundboard di altri server`,
      `${E.VC_Dot} Possibilità di mandare sticker ed emoji di altri server`,
      `${E.VC_Dot} Bypass dei requisiti nei giveaway`,
      `${E.VC_Dot} Possibilità di creare una vocale privata per te e i tuoi amici`,
      `${E.VC_Dot} Reazioni al messaggio quando vieni @menzionato in chat (max. 3 reazioni).`,
      `${E.VC_Dot} ${MENTION_RESPONSE_PERK_BODY}`,
      `${E.VC_Dot} Potrai crearti un ruolo personalizzato con colore GRADIENTE scelto da te.`,
      `${E.VC_Dot} X5 EXP boost`,
      "",
      `${E.VC_Attention} DISCLAIMER / I soldi non sono rimborsabili, essendo volontari.`,
      "I vantaggi segnati con \"✩\" vengono rimossi qualora l'utente violi il regolamento, porti un'immagine negativa al server o sia inattivo per mesi.",
    ].join("\n");

    await interaction.reply({
      components: [
        v2Text(donations),
        v2Separator(),
        v2Text(vip),
        v2Separator(),
        v2Text(`## Acquista ora!\n${E.blueflash} Apri un ticket \`HIGH STAFF\` sul sito: ` + siteTicketsPageDiscordRef("HIGH STAFF") + "."),
      ],
      flags: v2PrivateFlags(),
    }).catch((err?) => { logButtonErr(err); return null; });
  }

  if (interaction.customId == "info_sponsor") {
    const sponsorText = `${E.pinnednew} **Vinili & Caffè** offre un servizio di __sponsor__ con dei **requisiti** da rispettare. Per fare una __sponsor__ bisognerà aprire un ` + siteTicketsPageDiscordRef("HIGH STAFF") + ".\n\n"
      + "> Ogni server che vorrà effettuare una **sponsor** dovrà rispettare questi 3 requisiti:\n"
      + `> ${E.VC_Dot} Rispettare i [**ToS di Discord**](https://discord.com/terms)\n`
      + `> ${E.VC_Dot} Rispettare le [**Linee Guida di Discord**](https://discord.com/guidelines)\n`
      + `> ${E.VC_Dot} Rispettare il [**Regolamento di Vinili & Caffè**](https://discord.com/channels/1329080093599076474/1442569111119990887)`;
    const rowSponsor = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("metodi").setLabel("︲METODI").setEmoji(E.Money).setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId("ping").setLabel("︲PING").setEmoji(E.Discord_Mention).setStyle(ButtonStyle.Secondary));
    await interaction.reply({ components: [v2Text(sponsorText), rowSponsor], flags: v2PrivateFlags() }).catch((err?) => { logButtonErr(err); return null; });
  }

  if (interaction.customId == "candidature_premi_partner") {
    const {
      buildPartnerRewardDiscountBanner,
      buildPartnerRewardDiscordEmbedLines,
      getPartnerRewardPointCost,
    } = require("../../../../shared/partner/partnerManagerRewardTiers") as typeof import("../../../../shared/partner/partnerManagerRewardTiers");
    const tierLines = buildPartnerRewardDiscordEmbedLines();
    const discountBanner = buildPartnerRewardDiscountBanner();
    const autoRedeemCosts = [getPartnerRewardPointCost(50), getPartnerRewardPointCost(100)].join("** e **");
    const premiPartnerEmbed = new EmbedBuilder()
      .setColor("#6f4e37")
      .setDescription(
        `${E.partneredserverowner} **__Vinili & Caffè__** offre un servizio di __pagamento__ in base al numero di **partner** effettuate.\n` +
        "> Per riscattare eventuali premi bisognerà aprire un " + siteTicketsPageDiscordRef("HIGH STAFF") + "\n\n" +
        (discountBanner ? `${discountBanner}\n\n` : "") +
        tierLines.join("\n") +
        `\n\n> Dal pannello [Personalizza](https://www.viniliecaffe.it/personalizza/) (High Staff): i riscatti **${autoRedeemCosts}** fanno in automatico **scalatura + premio** (CR+Voc/VIP 30 giorni). **Decorazione**, **Nitro** e **PayPal**: premio a mano.\n\n` +
        `${E.VC_Winner} Inoltre, ogni mese, il miglior <@&${IDs.roles.Staff}> riceverà un **Nitro __Boost__** come premio.\n\n` +
        `${E.flyingnitroboost} Naturalmente almeno un **boost** dovrà andare a **__Vinili & Caffè__**.`,
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
    await interaction.reply({ content: `Perfetto: i bottoni standard stanno funzionando ${E.VC_Verified}`, flags: PRIVATE_FLAG }).catch((err?) => { logButtonErr(err); return null; });
  }

  if (interaction.customId === "info_buttons_test_no") {
    await interaction.reply({ content: `Ricevuto ${E.VC_Cross}: i bottoni standard non stanno rispondendo come previsto.`, flags: PRIVATE_FLAG }).catch((err?) => { logButtonErr(err); return null; });
  }

  if (interaction.customId === "info_buttons_test_ping") {
    await interaction.reply({ content: "pong", flags: PRIVATE_FLAG }).catch((err?) => { logButtonErr(err); return null; });
  }

  const buildBoostLevelsPayload = () => {
    const boostEmbed = new EmbedBuilder()

      .setColor("#6f4e37")
      .setTitle(`${E.VC_HeartWhite} **__Potenzia il server e sblocca vantaggi unici__**`)
      .setDescription([
        "Un modo per sostenere il server è potenziarlo: se hai un Nitro Boost (quello da 9,99€) hai a disposizione 2 potenziamenti che puoi utilizzare in qualunque server tu voglia. Se deciderai di potenziare noi, __Vinili & Caffè__, sbloccherai un sacco di vantaggi.",
        `**Non sai cos'è Discord Nitro?** ${E.link} [Scoprilo qui](<https://discord.com/nitro>).`,
        "",
        `${E.VC_Boost} **Boostando il server una volta sbloccherai questi vantaggi:**`,
        `${E.sparkledred} Ruolo <@&${IDs.roles.ServerBooster}> con badge speciale`,
        `${E.VC_Dot} Permesso di cambiare il nickname`,
        `${E.moon} Permesso di allegare immagini e link in chat`,
        `${E.pinkstar} Permesso di mandare emoji e adesivi di altri server`,
        `${E.sparkle} Permesso di usare le Soundboard del server`,
        `${E.blueflash} Sblocchi i COLORI PLUS in [Personalizza](https://www.viniliecaffe.it/personalizza/) ${E.VC_New}`,
        `${E.VC_CrownYellow} Aggiungi reazioni al messaggio quando ti @menzionano in chat (max. 3)`,
        MENTION_RESPONSE_PERK_LINE_DISCORD,
        `${E.reddiamond} Sblocchi i comandi \`+quote\` e \`+repost\``,
        `${E.exp} X2 EXP Boost`,
        "",
        `${E.VC_Boost} **Inoltre boostando il server due volte sbloccherai altri vantaggi:**`,
        `${E.sparkledred} Ruolo <@&${IDs.roles.DoubleBooster}> con badge speciale`,
        `${E.moon} Tutti i perks precedenti`,
        `${E.sparkle} Permesso di usare le Soundboard esterne`,
        `${E.blueflash} Possibilità di creare un ruolo **custom** e un canale **vocale privato custom**`,
        `${E.VC_CrownYellow} Cooldown sui comandi del nostro bot ridotto (da 30 secondi a 5 secondi).`,
        MENTION_RESPONSE_PERK_LINE_DISCORD,
        `${E.reddiamond} Bypass requisiti dei giveaway`,
        `${E.exp} X3 EXP Boost`,
      ].join("\n"))
      ;

    const howtoEmbed = new EmbedBuilder()

      .setColor("#6f4e37")
      .setTitle(`${E.nitroboost} **__Come creare ruolo personalizzato e vocale privata__**`)
      .setDescription([
        `Usa [Personalizza](https://www.viniliecaffe.it/personalizza/) in <#${IDs.channels.commands}> per creare e configurare il ruolo, la vocale, le reaction e la Mention Response.`,
        `Usa [Personalizza](https://www.viniliecaffe.it/personalizza/) in <#${IDs.channels.commands}> per scegliere il colore gradiente del tuo ruolo.`,
        "Digita \`+help\` per la lista completa dei comandi.",
      ].join("\n"));

    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("info_levels").setLabel("︲INFO & VANTAGGI RUOLI").setEmoji(E.exp).setStyle(ButtonStyle.Secondary),);

    return { embeds: [boostEmbed, howtoEmbed], components: [row] };
  };

  const buildLevelsPayload = () => {
    const levelEmbed = new EmbedBuilder()

      .setColor("#6f4e37")
      .setTitle(`${E.exp} **__Sali di livello e sblocca vantaggi sempre migliori__**`)
      .setDescription([
        "I livelli nel server rappresentano la tua attività: scrivendo in chat testuale e stando nei canali vocali, guadagnerai esperienza che verrà aggiunta al tuo livello globale.",
        "Una volta raggiunta una certa somma di esperienza, farai un **level up**!",
        "",
        `${E.VC_Dot} Per __vedere i tuoi EXP__ e le tue statistiche, usa il comando \`+rank\` in <#${IDs.channels.commands}>.`,
        "",
        `${E.VC_Dot} ──────────────── ${E.exp} ──────────────── ${E.VC_Dot}`,
        "",
        `${E.VC_Arrow} **LISTA DEI LIVELLI:**`,
      ].join("\n"))
      .addFields(
        {
          name: "\`LIVELLO 10-19\`",
          value: [
            `<@&${IDs.roles.Level10}>`,
            `${E.VC_DoubleReply} Permesso di cambiare nickname`,
            `${E.VC_DoubleReply} Permesso di allegare link e immagini in chat`,
            `${E.VC_DoubleReply} Permesso di inviare messaggi vocali in chat`,
            `${E.VC_DoubleReply} Sblocchi i comandi \`+quote\` e \`+repost\``,
            `${E.VC_Reply} ${E.VC_New} Nuovo colore gradiente sbloccato con [Personalizza](https://www.viniliecaffe.it/personalizza/)<@&${IDs.roles.colorUnlockLv10}>`
          ].join("\n"),
          inline: true,
        },
        {
          name: "\`LIVELLO 20-29\`",
          value: [
            `<@&${IDs.roles.Level20}>`,
            "Tutte le ricompense precedenti",
            `${E.VC_DoubleReply} Possibilità di aggiungere reazioni ai messaggi in chat`,
            `${E.VC_Reply} ${E.VC_New} Nuovo colore gradiente sbloccato con [Personalizza](https://www.viniliecaffe.it/personalizza/)<@&${IDs.roles.colorUnlockLv20}>`
          ].join("\n"),
          inline: true,
        },
        {
          name: "\`LIVELLO 30-49\`",
          value: [
            `<@&${IDs.roles.Level30}>`,
            "Tutte le ricompense precedenti",
            `${E.VC_DoubleReply} Permesso di usare soundboard di altri server`,
            `${E.VC_DoubleReply} Cooldown sui comandi del nostro bot ridotto (da 30 secondi a 15 secondi).`,
            `${E.VC_Reply} ${E.VC_New} Nuovo colore gradiente sbloccato con [Personalizza](https://www.viniliecaffe.it/personalizza/)<@&${IDs.roles.colorUnlockLv30}>`
          ].join("\n"),
          inline: true,
        },
        {
          name: "\`LIVELLO 50-69\`",
          value: [
            `<@&${IDs.roles.Level50}>`,
            "Tutte le ricompense precedenti",
            `${E.VC_DoubleReply} Possibilità di creare un ruolo __personalizzato PERMANENTE__ e un canale vocale privato __personalizzato PERMANENTE__.`,
            `${E.VC_DoubleReply} Cooldown sui comandi del nostro bot ridotto (da 30 secondi a 5 secondi).`,
            `${E.VC_Reply} ${E.VC_New} Nuovo colore gradiente sbloccato con [Personalizza](https://www.viniliecaffe.it/personalizza/)<@&${IDs.roles.colorUnlockLv50}>`
          ].join("\n"),
          inline: true,
        },
        {
          name: "\`LIVELLO 70-99\`",
          value: [
            `<@&${IDs.roles.Level70}>`,
            "Tutte le ricompense precedenti",
            `${E.VC_DoubleReply} Permesso di usare sticker ed emoji di altri server`,
            `${E.VC_DoubleReply} Aggiungi reazioni al messaggio quando ti @menzionano in chat (max. 3)`,
            `${E.VC_Reply} ${E.VC_New} Nuovo colore gradiente sbloccato con [Personalizza](https://www.viniliecaffe.it/personalizza/)<@&${IDs.roles.colorUnlockLv70}>`
          ].join("\n"),
          inline: true,
        },
        {
          name: "\`LIVELLO 100-119\`",
          value: [
            `<@&${IDs.roles.Level100}>`,
            "Tutte le ricompense precedenti",
            `${E.VC_DoubleReply} Cooldown sui comandi del nostro bot ridotto (da 30 secondi a 1 secondo).`,
            `${E.VC_DoubleReply} Bypass requisiti per le candidature`,
            `${E.VC_DoubleReply} Bonus EXP permanente +15%`,
            `${E.VC_DoubleReply} ${MENTION_RESPONSE_PERK_BODY}`,
            `${E.VC_Reply} ${E.VC_New} Nuovo colore gradiente sbloccato con [Personalizza](https://www.viniliecaffe.it/personalizza/)<@&${IDs.roles.colorUnlockLv100}>`
          ].join("\n"),
          inline: true,
        },
        {
          name: "\`LIVELLO 125-149\`",
          value: [
            `<@&${IDs.roles.Level120}>`,
            "Tutte le ricompense precedenti",
            `${E.VC_DoubleReply} Bypass requisiti per i giveaway`,
            `${E.VC_DoubleReply} Bonus EXP permanente +20%`,
            `${E.VC_DoubleReply} Sblocchi il secondo custom role`,
            `${E.VC_Reply} ${E.VC_New} Nuovo **Plus combo Black** con [Personalizza](https://www.viniliecaffe.it/personalizza/) <@&${IDs.roles.orangeBlackPlus}>`,
          ].join("\n"),
          inline: true,
        },
        {
          name: "\`LIVELLO 150-199\`",
          value: [
            `<@&${IDs.roles.Level150}>`,
            "Tutte le ricompense precedenti",
            `${E.VC_DoubleReply} Bonus EXP permanente +25%`,
            `${E.VC_Reply} ${E.VC_New} Nuovo **Plus combo Black** con [Personalizza](https://www.viniliecaffe.it/personalizza/) <@&${IDs.roles.greenBlackPlus}>`,
            `${E.VC_DoubleReply} Decorazione a scelta riscattabile tramite ticket **HIGH STAFF**`,
          ].join("\n"),
          inline: true,
        },
        {
          name: "\`LIVELLO 200+\`",
          value: [
            `<@&${IDs.roles.Level200}>`,
            "Tutte le ricompense precedenti",
            `${E.VC_Reply} ${E.VC_New} Nuovo **Plus combo Black** con [Personalizza](https://www.viniliecaffe.it/personalizza/) <@&${IDs.roles.aquaBlackPlus}>`,
            `${E.VC_DoubleReply} Nitro Boost mensile riscattabile tramite ticket **HIGH STAFF**`,
          ].join("\n"),
          inline: true,
        },
      )

      .setFooter({ text: "Se esci dal server o cambi account, i livelli ti verranno tolti e NON rimessi." });

    const howtoEmbed = new EmbedBuilder().setColor("#6f4e37").setTitle(`${E.nitroboost} **__Come creare ruolo personalizzato e vocale privata__**`).setDescription([
      `Usa [Personalizza](https://www.viniliecaffe.it/personalizza/) in <#${IDs.channels.commands}> per creare e configurare il ruolo, la vocale, le reaction e la Mention Response.`,
      `Usa [Personalizza](https://www.viniliecaffe.it/personalizza/) in <#${IDs.channels.commands}> per scegliere il colore gradiente del tuo ruolo.`,
      "Digita \`+help\` per la lista completa dei comandi.",
    ].join("\n"));

    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel("︲CANALE PER I COMANDI").setEmoji(E.VC_Bot).setStyle(ButtonStyle.Link).setURL("https://discord.com/channels/1329080093599076474/1442569138114662490",), new ButtonBuilder().setCustomId("torna_indietro").setLabel("︲TORNA INDIETRO").setEmoji(E.vegaleftarrow).setStyle(ButtonStyle.Primary),);

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
      .setTitle(`${E.pinkstar}・**__Ottieni un ruolo speciale per il tuo profilo!__**`)
      .setDescription([
        "I badge sono dei ruoli __aggiuntivi__ che ti permettono di sbloccare vantaggi e permessi all'interno del server. Possono essere ottenuti in diversi modi e tutti danno vantaggi diversi.",
        "",
        `${E.VC_Dot} ────⋆⋅☆⋅⋆──── ୨♡୧ ────⋆⋅☆⋅⋆──── ${E.VC_Dot}`,
        "",
        `${E.VC_Arrow} **LISTA DEI BADGES:**`,
      ].join("\n"))
      .addFields(
        {
          name: "`WEEKLY WINNERS`",
          value: [
            "<@&1544830834849087630>/<@&1544830836686200992>",
            "Ottenibile arrivando primo per exp in messaggi o exp in vocale nella [classifica settimanale](<https://discord.com/channels/1329080093599076474/1470183921236049940>).",
            "९ Tutte le ricompense precedenti",
            `${E.VC_DoubleReply} Ruolo esclusivo per 7 giorni.`,
            `${E.VC_Reply} Permesso di usare soundboard esterne`,
          ].join("\n"),
          inline: true,
        },
        {
          name: "`FAN`",
          value: [
            `<@&${IDs.roles.Fan}>`,
            'Ottenibile mettendo ".gg/viniliecaffe", "discord.gg/viniliecaffe" o "viniliecaffe.it" nello status del tuo profilo Discord!',
            "Nello stato, non nella bio; se viene tolto o se sei offline, non ti verranno assegnati i vantaggi.",
            `${E.VC_DoubleReply} Permesso di allegare link e immagini in chat`,
            `${E.VC_Reply} Permesso di cambiare il tuo nickname`,
          ].join("\n"),
          inline: true,
        },
        {
          name: "`VOTER`",
          value: [
            "<@&1544830805455544360>",
            "Ottenibile votando il server dalla [pagina Voti](<https://www.viniliecaffe.it/vote>) del sito (Discadia e Top.gg).",
            `${E.VC_DoubleReply} EXP casuale da 100 a 250.`,
            `${E.VC_Reply} Ruolo esclusivo per 12 o 24 ore.`,
          ].join("\n"),
          inline: true,
        },
        {
          name: "`PROMOTER`",
          value: [
            "<@&1544830824300417094>",
            "Ottenibile invitando 5 persone nel server, attraverso [custom link](<https://imgur.com/a/3wpDOVj>)",
            `${E.VC_DoubleReply} Permesso di allegare link e immagini in chat`,
            `${E.VC_Reply} Permesso di cambiare il tuo nickname`,
          ].join("\n"),
          inline: true,
        },
        {
          name: "`PROPULSOR`",
          value: [
            "<@&1544830827026849872>",
            "Ottenibile invitando 25 persone nel server, attraverso [custom link](<https://imgur.com/a/3wpDOVj>)",
            "९ Tutte le ricompense precedenti",
            `${E.VC_DoubleReply} Inviare emoji e adesivi esterni`,
            `${E.VC_Reply} Aggiungi reazioni ai messaggi`,
          ].join("\n"),
          inline: true,
        },
        {
          name: "`CATALYST`",
          value: [
            "<@&1544830828331270282>",
            "Ottenibile invitando 100 persone nel server, attraverso [custom link](<https://imgur.com/a/3wpDOVj>)",
            "९ Tutte le ricompense precedenti",
            `${E.VC_Reply} Usare SoundBoard esterne nelle vocali`,
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
      `${E.VC_CrownYellow} Classifica Visualizzazioni Avatar`,
    );
  }

  if (interaction.customId == "banner_views") {
    return sendPrivacyViewsLeaderboard(
      interaction,
      "banner",
      `${E.VC_CrownYellow} Classifica Visualizzazioni Banner`,
    );
  }
}

export = { handleLegacyPanelInfoButtons };
