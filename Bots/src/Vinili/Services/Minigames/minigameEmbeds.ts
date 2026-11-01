/** Minigiochi: messaggi (embed) di avvio, indizi, vittoria e tempo scaduto di ogni gioco. */
const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { accountUsername, guildMemberDisplayAvatarUrlDynamic } = require("../../Utils/Discord/guildDiscordIdentity") as typeof import("../../Utils/Discord/guildDiscordIdentity");
const { formatItalianMinutesBold } = require("../../Utils/Text/italianDurationLabels") as typeof import("../../Utils/Text/italianDurationLabels");
const { TENANT_EMBED_COLOR } = require("../../MultiGuild/utils/tenantEmbedBranding") as typeof import("../../MultiGuild/utils/tenantEmbedBranding");

const MINIGAME_EMBED_COLOR = TENANT_EMBED_COLOR;
const EXP_REWARDS = [{ exp: 500, roleId: IDs.roles.Rookie }, { exp: 1000, roleId: IDs.roles.Scout }, { exp: 1500, roleId: IDs.roles.Explorer }, { exp: 2500, roleId: IDs.roles.Tracker }, { exp: 5000, roleId: IDs.roles.Achiever }, { exp: 10000, roleId: IDs.roles.Vanguard }, { exp: 50000, roleId: IDs.roles.Mentor }, { exp: 100000, roleId: IDs.roles.Strategist },];

function buildGuessNumberEmbed(min?, max?, rewardExp?, durationMs?) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Indovina il numero <a:VC_Exclamation:1482534702077444217>")
    .setDescription(
      [
        `<:VC_EXP:1482534670896730143> Indovina un numero tra **${min}** e **${max}** per ottenere **${rewardExp} exp**.`,
        `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per indovinarlo!`,
        `> <a:VC_Winner:1482535294757507255> Guarda le tue statistiche dei minigiochi nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
      ].join("\n"),
    );
}

function buildGuessWordEmbed(scrambled?, rewardExp?, durationMs?) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Indovina la parola <a:VC_Exclamation:1482534702077444217>")
    .setDescription(
      [
        `<:VC_EXP:1482534670896730143> Indovina la parola da queste lettere: **${scrambled}** per ottenere **${rewardExp} exp**.`,
        `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per indovinarla!`,
        `> <a:VC_Winner:1482535294757507255> Guarda le tue statistiche dei minigiochi nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
      ].join("\n"),
    );
}

function buildGuessFlagEmbed(flagUrl?, rewardExp?, durationMs?) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Indovina la bandiera <a:VC_Exclamation:1482534702077444217>")
    .setDescription(
      [
        `<:VC_EXP:1482534670896730143> Indovina la nazione da questa bandiera per ottenere **${rewardExp} exp**.`,
        `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per indovinarla!`,
        `> <a:VC_Winner:1482535294757507255> Guarda le tue statistiche dei minigiochi nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
      ].join("\n"),
    )
    .setImage(flagUrl);
}

function buildGuessPlayerEmbed(rewardExp?, durationMs?, imageUrl?) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Indovina il calciatore <a:VC_Exclamation:1482534702077444217>")
    .setDescription([
      `<:VC_EXP:1482534670896730143> Indovina il calciatore più famoso per ottenere **${rewardExp} exp**.`,
      `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per indovinarlo!`,
      `> <a:VC_Winner:1482535294757507255> Guarda le tue statistiche dei minigiochi nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
    ].join("\n"),);
  if (imageUrl) {
    embed.setImage(imageUrl);
  }
  return embed;
}

function buildGuessSongEmbed(rewardExp?, durationMs?, artworkUrl?) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Indovina la canzone <a:VC_Exclamation:1482534702077444217>")
    .setDescription([
      `<:VC_EXP:1482534670896730143> Indovina la canzone per ottenere **${rewardExp} exp**.`,
      `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per indovinarla!`,
      `> <a:VC_Winner:1482535294757507255> Guarda le tue statistiche dei minigiochi nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
    ].join("\n"),);
  if (artworkUrl) embed.setImage(artworkUrl);
  return embed;
}

function buildGuessCapitalEmbed(country?, rewardExp?, durationMs?, imageUrl = null) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Indovina la capitale <a:VC_Exclamation:1482534702077444217>")
    .setDescription([
      `<:VC_EXP:1482534670896730143> Indovina la capitale di **${country}** per ottenere **${rewardExp} exp**.`,
      `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per rispondere!`,
      `> <a:VC_Winner:1482535294757507255> Guarda le tue statistiche dei minigiochi nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
    ].join("\n"),
    );
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildGuessRegionCapitalEmbed(region?, rewardExp?, durationMs?, imageUrl = null, imageName = null) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Indovina il capoluogo <a:VC_Exclamation:1482534702077444217>")
    .setDescription([
      `<:VC_EXP:1482534670896730143> Indovina il capoluogo della regione **${region}** per ottenere **${rewardExp} exp**.`,
      `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per rispondere!`,
      `> <a:VC_Winner:1482535294757507255> Guarda le tue statistiche dei minigiochi nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
    ].join("\n"),
    );
  if (imageName) embed.setImage(`attachment://${imageName}`);
  else if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildGuessReverseCapitalEmbed(capital?, rewardExp?, durationMs?, imageUrl = null) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Capitale inverso <a:VC_Exclamation:1482534702077444217>")
    .setDescription([
      `<:VC_EXP:1482534670896730143> **${capital}** è la capitale di quale Stato? Indovina per **${rewardExp} exp**.`,
      `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per rispondere!`,
      `> <a:VC_Winner:1482535294757507255> Guarda le tue statistiche dei minigiochi nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
    ].join("\n"),
    );
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildFastTypeEmbed(phrase?, rewardExp?, durationMs?) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Scrivi per primo la frase <a:VC_Exclamation:1482534702077444217>")
    .setDescription(
      [
        `<:VC_EXP:1482534670896730143> Il primo che scrive questa frase ottiene **${rewardExp} exp**.`,
        `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per scrivere la frase.`,
        `> <a:VC_Winner:1482535294757507255> Guarda le tue statistiche dei minigiochi nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
      ].join("\n"),
    );
}

function buildGuessTeamEmbed(rewardExp?, durationMs?, imageUrl?) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Indovina la squadra di calcio <a:VC_Exclamation:1482534702077444217>")
    .setDescription([
      `<:VC_EXP:1482534670896730143> Indovina la squadra di calcio dal logo per ottenere **${rewardExp} exp**.`,
      `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per indovinare la squadra.`,
      `> <a:VC_Winner:1482535294757507255> Guarda le tue statistiche dei minigiochi nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
    ].join("\n"),
    );
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildGuessSingerEmbed(rewardExp?, durationMs?, imageUrl?) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Indovina il cantante <a:VC_Exclamation:1482534702077444217>")
    .setDescription([
      `<:VC_EXP:1482534670896730143> Indovina il cantante dalla foto per ottenere **${rewardExp} exp**.`,
      `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per indovinare il cantante.`,
      `> <a:VC_Winner:1482535294757507255> Guarda le tue statistiche dei minigiochi nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
    ].join("\n"),
    );
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildGuessAlbumEmbed(rewardExp?, durationMs?, imageUrlOrAttachment?) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Indovina l'album <a:VC_Exclamation:1482534702077444217>")
    .setDescription([
      `<:VC_EXP:1482534670896730143> Indovina l'album dalla copertina per ottenere **${rewardExp} exp**.`,
      `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per indovinare l'album.`,
      `> <a:VC_Winner:1482535294757507255> Guarda le tue statistiche dei minigiochi nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
    ].join("\n"),
    );
  if (imageUrlOrAttachment) embed.setImage(imageUrlOrAttachment);
  return embed;
}

function buildHangmanEmbed(maskedWord?, rewardExp?, durationMs?) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Impiccato <a:VC_Exclamation:1482534702077444217>")
    .setDescription(
      [
        `<:VC_EXP:1482534670896730143> Scrivi una lettera o prova la parola intera per ottenere **${rewardExp} exp**.`,
        `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per indovinare la parola.`,
        `> <a:VC_Winner:1482535294757507255> Guarda le tue statistiche dei minigiochi nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
      ].join("\n"),
    );
}

function buildItalianGkEmbed(question?, rewardExp?, durationMs?) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Cultura generale <a:VC_Exclamation:1482534702077444217>")
    .setDescription(
      [
        `<:VC_EXP:1482534670896730143> **Domanda:** ${question} per ottenere **${rewardExp} exp**.`,
        `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per rispondere alla domanda.`,
        `> <a:VC_Winner:1482535294757507255> Guarda le tue statistiche dei minigiochi nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
      ].join("\n"),
    );
}

const DRIVING_QUIZ_LETTERS = ["A", "B", "C", "D"];

function buildDrivingQuizEmbed(row?, rewardExp?, durationMs?) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const statement = row?.statement ?? "";
  const isMultiple = row?.questionType === "multiple" && Array.isArray(row.options) && row.options.length >= 2;
  const lines = [`<:VC_EXP:1482534670896730143> **${isMultiple ? "Domanda" : "Affermazione"}:** ${statement}`,
  ];
  if (isMultiple) {
    row.options.forEach((opt?, i?) => {
      const letter = DRIVING_QUIZ_LETTERS[i] ?? String(i + 1);
      lines.push(`**${letter})** ${opt}`);
    });
    lines.push("Rispondi con la lettera (A, B, C, D), il numero (1-4) o il testo della risposta.");
  } else {
    lines.push("Rispondi con `vero` o `falso`.");
  }
  lines.push(
    `Ricompensa: **${rewardExp} exp**`,
    `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)}.`,
  );
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Quiz patente <a:VC_Exclamation:1482534702077444217>")
    .setDescription(lines.join("\n"));
}

function buildMathExpressionEmbed( expression?, rewardExp?, durationMs?, imageName = null) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Espressione matematica <a:VC_Exclamation:1482534702077444217>")
    .setDescription([
      `<:VC_EXP:1482534670896730143> Risolvi: **${expression}** per ottenere **${rewardExp} exp**.`,
      `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per risolvere l'espressione.`,
      `> <a:VC_Winner:1482535294757507255> Guarda le tue statistiche dei minigiochi nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
    ].join("\n"),
    );
  if (imageName) embed.setImage(`attachment://${imageName}`);
  return embed;
}

function buildFindBotEmbed(rewardExp?, durationMs?) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Trova il bot <a:VC_Exclamation:1482534702077444217>")
    .setDescription(
      [
        `<:VC_EXP:1482534670896730143> Trova il messaggio del bot tra i canali del server, premi il bottone per ottenere **${rewardExp} exp**.`,
        `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per trovarlo.`,
        `> <a:VC_Winner:1482535294757507255> Guarda le tue statistiche dei minigiochi nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
      ].join("\n"),
    );
}

function buildFindBotButtonEmbed(rewardExp?, durationMs?) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Sei vicino al bot <a:VC_Exclamation:1482534702077444217>")
    .setDescription(
      [
        `<:VC_EXP:1482534670896730143> Hai trovato il messaggio nascosto: clicca il bottone per ottenere **${rewardExp} exp**.`,
        `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per cliccare il bottone.`,
        `> <a:VC_Winner:1482535294757507255> Guarda le tue statistiche dei minigiochi nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
      ].join("\n"),
    );
}

function buildFindBotVoiceEmbed(rewardExp?, durationMs?) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Trova il bot in vocale <a:VC_Exclamation:1482534702077444217>")
    .setDescription(
      [
        `<:VC_EXP:1482534670896730143> Il bot si è nascosto in una **vocale vuota** del server: entra in quella vocale per ottenere **${rewardExp} exp**.`,
        `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per trovarlo.`,
        `> <a:VC_Winner:1482535294757507255> Guarda le tue statistiche dei minigiochi nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
      ].join("\n"),
    );
}

function buildMinuteHintEmbed(channelId?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("<a:VC_Heart:1448672728822448141> Indizio")
    .setDescription(`<a:VC_Arrow:1482706699365257397> <#${channelId}>`);
}

function buildGenericHintEmbed(text?) {
  const safeText = typeof text === "string" ? text : String(text ?? "");
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("<a:VC_Heart:1448672728822448141> Indizio")
    .setDescription(`<a:VC_Arrow:1482706699365257397> ${safeText}`);
}

function buildHintEmbed(isHigher?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      isHigher
        ? "<:thumbsup:1471292172145004768> <a:VC_Arrow:1482706699365257397> Più alto!"
        : "<:thumbsdown:1471292163957457013> <a:VC_Arrow:1482706699365257397> Più basso!",
    );
}

function buildYearHintEmbed(guessBeforeTarget?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      guessBeforeTarget
        ? "<:thumbsup:1471292172145004768> <a:VC_Arrow:1482706699365257397> Dopo!"
        : "<:thumbsdown:1471292163957457013> <a:VC_Arrow:1482706699365257397> Prima!",
    );
}

function buildWinEmbed(winnerId?, effectiveExp?, totalExp?, details = null) {
  const lines = [`<a:VC_Winner:1482535294757507255> Complimenti <@${winnerId}>, hai vinto e guadagnato **${effectiveExp} exp**<a:VC_Exclamation:1482534702077444217>`];
  if (details) {
    const extras = [];
    if (details.fastBonus > 0) extras.push(`<a:VC_Flame:1482725674711126140> Risposta fulminea **+${details.fastBonus} exp**`);
    if (details.streakBonus > 0) extras.push(`<a:VC_Flame:1482725674711126140> Streak ${details.newStreak} **+${details.streakBonus} exp**`);
    if (extras.length) lines.push("", ...extras);
  }
  lines.push("", "<:VC_Stats:1482527532682055780> **Le tue statistiche:**", `<a:VC_Arrow:1482706699365257397> Ora hai un totale di **${totalExp} exp**`);
  if (details?.newStreak > 1) lines.push(`<a:VC_Arrow:1482706699365257397> Serie di vittorie: **${details.newStreak}** (record: **${details.bestStreak}**)`);
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("<a:VC_Events:1482706144953897223> Un utente ha vinto<a:VC_Exclamation:1482534702077444217>")
    .setDescription(lines.join("\n"))
    .setFooter({
      text: "I tuoi progressi sono nel profilo su viniliecaffe.it/profilo",
    });
}

function getNextReward(totalExp?) {
  const expValue = Number(totalExp || 0);
  return EXP_REWARDS.find((reward?) => expValue < reward.exp) || null;
}

function buildRewardEmbed(member?, reward?, totalExp?) {
  const nextReward = getNextReward(totalExp);
  const remaining = nextReward ? Math.max(0, nextReward.exp - Number(totalExp || 0)) : 0;

  const description = [
    "<a:VC_Flower:1468685050966179841> Premio ricevuto <a:VC_Flower:1468685050966179841>",
    "",
    `<a:VC_Events:1482706144953897223> **__<@${member.id}>__**`,
    `hai ottenuto il ruolo <@&${reward.roleId}> per aver raggiunto **${reward.exp}** exp ai **Minigiochi** <a:VC_HeartsPink:1468685897389052008>`,
    "",
    nextReward
      ? `<a:VC_HeartsBlue:1468686100045369404> / ti mancano **${remaining}** exp per la prossima ricompensa!`
      : "<a:VC_HeartsBlue:1468686100045369404> / hai raggiunto la ricompensa **massima**!",
  ].join("\n");

  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setAuthor({
      name: accountUsername(member),
      iconURL: guildMemberDisplayAvatarUrlDynamic(member) || undefined,
    })
    .setDescription(description)
    .setFooter({
      text: "Gli exp guadagnati si sommano al tuo livello globale! Controlla le tue statistiche su viniliecaffe.it/profilo",
    });
}

function buildTimeoutNumberEmbed(number?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! Il numero era **${number}**.`,
    );
}

function buildTimeoutWordEmbed(word?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! La parola era **${word}**.`,
    );
}

function buildTimeoutFlagEmbed(name?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! La bandiera era **${name}**.`,
    );
}

function buildTimeoutPlayerEmbed(name?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! Il calciatore era **${name}**.`,
    );
}

function buildTimeoutSongEmbed(title?, artist?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! Era **${title}** \u2014 ${artist}.`,
    );
}

function buildTimeoutFindBotEmbed() {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      "<a:VC_pixeltime:1482535344103620771> Tempo scaduto! Nessuno ha trovato il bot.",
    );
}

function buildTimeoutFindBotVoiceEmbed() {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      "<a:VC_pixeltime:1482535344103620771> Tempo scaduto! Nessuno è entrato nella vocale del bot.",
    );
}

function buildMemorySequenceEmbed(sequence?, rewardExp?, displayMs?) {
  const seconds = Math.max(1, Math.round(Number(displayMs || 8000) / 1000));
  const safeSequence = String(sequence || "").trim();
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Memoria <a:VC_Exclamation:1482534702077444217>")
    .setDescription([
      `<:VC_EXP:1482534670896730143> Memorizza questa sequenza e riscrivila per ottenere **${rewardExp} exp**.`,
      "",
      `> <a:VC_pixeltime:1482535344103620771> La sequenza sparirà tra **${seconds} secondi**.`,
    ].join("\n"))
    .addFields({
      name: "Sequenza",
      value: safeSequence || "—",
      inline: false,
    });
}

function buildMemoryRecallEmbed(durationMs?) {
  const minutes = Math.max(1, Math.round(Number(durationMs || 180000) / 60000));
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Sequenza svanita <a:VC_Exclamation:1482534702077444217>")
    .setDescription([
      "Riscrivi in chat la sequenza di emoji esatta.",
      `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per riscriverla.`,
    ].join("\n"));
}

function buildMemoryTimeoutEmbed(sequence?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! La sequenza era: **${sequence}**`,
    );
}

function buildTimeoutCapitalEmbed(country?, answer?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! La capitale di **${country}** era **${answer}**.`,
    );
}

function buildTimeoutRegionCapitalEmbed(region?, answer?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! Il capoluogo di **${region}** era **${answer}**.`,
    );
}

function buildTimeoutReverseCapitalEmbed(capital?, answer?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! **${capital}** è la capitale di **${answer}**.`,
    );
}

function buildTimeoutFastTypeEmbed(phrase?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! La frase era \`${phrase}\`.`,
    );
}

function buildTimeoutTeamEmbed(team?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! La squadra era **${team}**.`,
    );
}

function buildTimeoutSingerEmbed(name?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! Il cantante era **${name}**.`,
    );
}

function buildTimeoutAlbumEmbed(name?, artist?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! Era **${name}** di ${artist}.`,
    );
}

function buildTimeoutHangmanEmbed(word?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! La parola era **${word}**.`,
    );
}

function buildHangmanLossEmbed(word?) {
  return new EmbedBuilder()
    .setColor("#ED4245")
    .setDescription(
      `<a:VC_pixeltime:1482535344103620771> Errori esauriti! La parola era **${word}**.`,
    );
}

function buildTimeoutItalianGkEmbed(answer?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! La risposta era **${answer}**.`,
    );
}

function buildTimeoutDrivingQuizEmbed(game?) {
  const isMultiple = game?.questionType === "multiple" && Array.isArray(game?.options) && Number.isFinite(game?.correctIndex);
  let text;
  if (isMultiple && game.options[game.correctIndex] != null) {
    const letter = DRIVING_QUIZ_LETTERS[game.correctIndex] ?? String(game.correctIndex + 1);
    text = `La risposta corretta era **${letter}) ${game.options[game.correctIndex]}**.`;
  } else {
    text = `La risposta corretta era **${game?.answer ? "vero" : "falso"}**.`;
  }
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! ${text}`,
    );
}

function buildTimeoutMathEmbed(answer?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! Il risultato corretto era **${answer}**.`,
    );
}

function buildTimeoutGuessYearEmbed(title?, subtitle?, year?) {
  const sub = subtitle ? ` — ${subtitle}` : "";
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! **${title}**${sub} era del **${year}**.`,
    );
}

function buildTimeoutCompleteVerseEmbed(answer?, song?, artist?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! La risposta era **${answer}** (${song} — ${artist}).`,
    );
}

function buildTimeoutGuessEmojiEmbed(emojis?, answer?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! ${emojis} era **${answer}**.`,
    );
}

function buildTimeoutQuoteFilmEmbed(quote?, answer?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! La citazione è da **${answer}**.`,
    );
}

function buildTimeoutCompleteProverbEmbed(start?, end?) {
  const full = String(end || "").trim() ? `${start} ${end}`.trim() : start;
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! Il proverbio completo: **${full}**.`,
    );
}

function buildTimeoutSynonymAntonymEmbed(word?, answer?, kind?) {
  const label = kind === "antonym" ? "Il contrario" : "Un sinonimo";
  const safeWord = word != null && String(word).trim() !== "" ? String(word) : "—";
  const safeAnswer = answer != null && String(answer).trim() !== "" ? String(answer) : "—";
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! ${label} di **${safeWord}** era **${safeAnswer}**.`,
    );
}

function buildTimeoutGuessCityEmbed(landmark?, city?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! **${landmark}** si trova a **${city}**.`,
    );
}

function buildGuessYearEmbed(title?, subtitle?, rewardExp?, durationMs?, imageUrl = null) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const sub = subtitle ? ` — ${subtitle}` : "";
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Indovina l'anno <a:VC_Exclamation:1482534702077444217>")
    .setDescription([
      `<:VC_EXP:1482534670896730143> In che anno è uscito **${title}**${sub}? Scrivi l'anno per **${rewardExp} exp**.`,
      `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per rispondere!`,
      `> <a:VC_Winner:1482535294757507255> Guarda le tue statistiche nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
    ].join("\n"));
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildCompleteVerseEmbed(verse?, rewardExp?, durationMs?, imageUrl = null) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const promptLine = imageUrl
    ? `<:VC_EXP:1482534670896730143> Completa il verso **nell'immagine** per **${rewardExp} exp**.`
    : `<:VC_EXP:1482534670896730143> Completa: **${verse}** per **${rewardExp} exp**.`;
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Completa il verso <a:VC_Exclamation:1482534702077444217>")
    .setDescription([
      promptLine,
      `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per rispondere!`,
      `> <a:VC_Winner:1482535294757507255> Guarda le tue statistiche nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
    ].join("\n"));
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildGuessEmojiEmbed(emojis?, rewardExp?, durationMs?, imageUrl = null) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Indovina da emoji <a:VC_Exclamation:1482534702077444217>")
    .setDescription([
      `<:VC_EXP:1482534670896730143> Cosa rappresenta **${emojis}**? Scrivi film, serie o canzone per **${rewardExp} exp**.`,
      `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per rispondere!`,
      `> <a:VC_Winner:1482535294757507255> Guarda le tue statistiche nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
    ].join("\n"));
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildQuoteFilmEmbed(quote?, rewardExp?, durationMs?, imageUrl = null) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Citazione da film/serie <a:VC_Exclamation:1482534702077444217>")
    .setDescription([
      `<:VC_EXP:1482534670896730143> *"${quote}"* — Da quale film o serie? **${rewardExp} exp**.`,
      `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per rispondere!`,
      `> <a:VC_Winner:1482535294757507255> Guarda le tue statistiche nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
    ].join("\n"));
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildCompleteProverbEmbed(start?, rewardExp?, durationMs?, imageUrl = null) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const promptLine = imageUrl
    ? `<:VC_EXP:1482534670896730143> Completa il proverbio **nell'immagine** per **${rewardExp} exp**.`
    : `<:VC_EXP:1482534670896730143> **${start}** ... Completa il proverbio per **${rewardExp} exp**.`;
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Completa il proverbio <a:VC_Exclamation:1482534702077444217>")
    .setDescription([
      promptLine,
      `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per rispondere!`,
      `> <a:VC_Winner:1482535294757507255> Guarda le tue statistiche nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
    ].join("\n"));
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildSynonymAntonymEmbed(word?, kind?, rewardExp?, durationMs?, imageUrl = null) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const label = kind === "antonym" ? "il contrario" : "un sinonimo";
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle(kind === "antonym" ? "Trova il contrario <a:VC_Exclamation:1482534702077444217>" : "Trova il sinonimo <a:VC_Exclamation:1482534702077444217>")
    .setDescription([
      `<:VC_EXP:1482534670896730143> Scrivi ${label} di **${word}** per **${rewardExp} exp**.`,
      `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per rispondere!`,
      `> <a:VC_Winner:1482535294757507255> Guarda le tue statistiche nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
    ].join("\n"));
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildGuessCityEmbed(landmark?, rewardExp?, durationMs?, imageUrl = null) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Indovina la città <a:VC_Exclamation:1482534702077444217>")
    .setDescription([
      `<:VC_EXP:1482534670896730143> In quale città si trova **${landmark}**? **${rewardExp} exp**.`,
      `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per rispondere!`,
      `> <a:VC_Winner:1482535294757507255> Guarda le tue statistiche nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
    ].join("\n"));
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildTreasureHuntStartEmbed(decoyDisplay?, winnerDisplay?, targetCount?, durationMs?, rewardExp?) {
  const minutes = Math.max(1, Math.round(Number(durationMs || 0) / 60000));
  const decoyText = String(decoyDisplay || "").trim() || "la reaction indicata";
  const winnerText = String(winnerDisplay || "").trim() || "quella vincente";
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("<a:VC_Events:1482706144953897223> Caccia al tesoro<a:VC_Exclamation:1482534702077444217>")
    .setDescription(
      [
        `<:VC_Stats:1482527532682055780> Sui prossimi messaggi in chat metterò la reaction ${decoyText}.`,
        `<a:VC_Flame:1482725674711126140> Su **uno solo** comparirà ${winnerText}: trovalo e cliccaci sopra per primo!`,
        "",
        `<:VC_EXP:1482534670896730143> In palio: **${rewardExp} exp**`,
        `<a:VC_pixeltime:1482535344103620771> Hai circa **${minutes} min** prima che la caccia finisca.`,
      ].join("\n"),
    )
    .setFooter({ text: 'Clicca la reaction "vincente" sul messaggio giusto per vincere.' });
}

function buildTreasureHuntTimeoutEmbed(decoyDisplay?, winnerDisplay?, winnerMessageUrl?) {
  const decoyText = String(decoyDisplay || "").trim() || "le reaction";
  const winnerText = String(winnerDisplay || "").trim() || "quella vincente";
  const lines = [
    `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! Nessuno ha trovato la reaction ${winnerText} tra le ${decoyText}.`,
  ];
  if (winnerMessageUrl) {
    lines.push("", `<a:VC_Arrow:1482706699365257397> Era questo messaggio: ${winnerMessageUrl}`);
  }
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("<a:VC_Alert:1482706673176150077> Caccia al tesoro conclusa")
    .setDescription(lines.join("\n"));
}

function buildTreasureHuntFoundEmbed(winnerMessageUrl?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("<a:VC_Winner:1482535294757507255> Tesoro trovato<a:VC_Exclamation:1482534702077444217>")
    .setDescription(
      winnerMessageUrl
        ? `<a:VC_Arrow:1482706699365257397> Il messaggio nascosto era: ${winnerMessageUrl}`
        : "<a:VC_Arrow:1482706699365257397> La caccia è terminata.",
    );
}

export = { MINIGAME_EMBED_COLOR, EXP_REWARDS, buildGuessNumberEmbed, buildGuessWordEmbed, buildGuessFlagEmbed, buildGuessPlayerEmbed, buildGuessSongEmbed, buildGuessCapitalEmbed, buildGuessRegionCapitalEmbed, buildGuessReverseCapitalEmbed, buildFastTypeEmbed, buildGuessTeamEmbed, buildGuessSingerEmbed, buildGuessAlbumEmbed, buildHangmanEmbed, buildItalianGkEmbed, DRIVING_QUIZ_LETTERS, buildDrivingQuizEmbed, buildMathExpressionEmbed, buildFindBotEmbed, buildFindBotButtonEmbed, buildFindBotVoiceEmbed, buildMinuteHintEmbed, buildGenericHintEmbed, buildHintEmbed, buildYearHintEmbed, buildWinEmbed, buildRewardEmbed, buildTimeoutNumberEmbed, buildTimeoutWordEmbed, buildTimeoutFlagEmbed, buildTimeoutPlayerEmbed, buildTimeoutSongEmbed, buildTimeoutFindBotEmbed, buildTimeoutFindBotVoiceEmbed, buildMemorySequenceEmbed, buildMemoryRecallEmbed, buildMemoryTimeoutEmbed, buildTimeoutCapitalEmbed, buildTimeoutRegionCapitalEmbed, buildTimeoutReverseCapitalEmbed, buildTimeoutFastTypeEmbed, buildTimeoutTeamEmbed, buildTimeoutSingerEmbed, buildTimeoutAlbumEmbed, buildTimeoutHangmanEmbed, buildHangmanLossEmbed, buildTimeoutItalianGkEmbed, buildTimeoutDrivingQuizEmbed, buildTimeoutMathEmbed, buildTimeoutGuessYearEmbed, buildTimeoutCompleteVerseEmbed, buildTimeoutGuessEmojiEmbed, buildTimeoutQuoteFilmEmbed, buildTimeoutCompleteProverbEmbed, buildTimeoutSynonymAntonymEmbed, buildTimeoutGuessCityEmbed, buildGuessYearEmbed, buildCompleteVerseEmbed, buildGuessEmojiEmbed, buildQuoteFilmEmbed, buildCompleteProverbEmbed, buildSynonymAntonymEmbed, buildGuessCityEmbed, buildTreasureHuntStartEmbed, buildTreasureHuntTimeoutEmbed, buildTreasureHuntFoundEmbed };
