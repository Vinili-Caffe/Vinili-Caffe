/** Minigiochi: embed di avvio delle domande. */
const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { formatItalianMinutesBold } = require("../../../shared/utils/italianDurationLabels") as typeof import("../../../shared/utils/italianDurationLabels");
const { MINIGAME_EMBED_COLOR, DRIVING_QUIZ_LETTERS } = require("./minigameEmbedShared") as typeof import("./minigameEmbedShared");

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

export = {
  buildGuessNumberEmbed,
  buildGuessWordEmbed,
  buildGuessFlagEmbed,
  buildGuessPlayerEmbed,
  buildGuessSongEmbed,
  buildGuessCapitalEmbed,
  buildGuessRegionCapitalEmbed,
  buildGuessReverseCapitalEmbed,
  buildFastTypeEmbed,
  buildGuessTeamEmbed,
  buildGuessSingerEmbed,
  buildGuessAlbumEmbed,
  buildHangmanEmbed,
  buildItalianGkEmbed,
  buildDrivingQuizEmbed,
  buildMathExpressionEmbed,
  buildFindBotEmbed,
  buildFindBotButtonEmbed,
  buildFindBotVoiceEmbed,
  buildMemorySequenceEmbed,
  buildMemoryRecallEmbed,
  buildGuessYearEmbed,
  buildCompleteVerseEmbed,
  buildGuessEmojiEmbed,
  buildQuoteFilmEmbed,
  buildCompleteProverbEmbed,
  buildSynonymAntonymEmbed,
  buildGuessCityEmbed,
  buildTreasureHuntStartEmbed,
};
