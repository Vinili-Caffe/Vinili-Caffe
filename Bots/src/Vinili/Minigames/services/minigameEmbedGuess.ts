/** Minigiochi: embed di avvio delle domande. */
const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { formatItalianMinutesBold } = require("../../../shared/utils/italianDurationLabels") as typeof import("../../../shared/utils/italianDurationLabels");
const { MINIGAME_EMBED_COLOR, DRIVING_QUIZ_LETTERS } = require("./minigameEmbedShared") as typeof import("./minigameEmbedShared");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
function buildGuessNumberEmbed(min?, max?, rewardExp?, durationMs?) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle(`Indovina il numero ${E.VC_Exclamation}`)
    .setDescription(
      [
        `${E.VC_EXP} Indovina un numero tra **${min}** e **${max}** per ottenere **${rewardExp} exp**.`,
        `> ${E.VC_pixeltime} Hai ${formatItalianMinutesBold(minutes)} per indovinarlo!`,
        `> ${E.VC_Winner} Guarda le tue statistiche dei minigiochi nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
      ].join("\n"),
    );
}

function buildGuessWordEmbed(scrambled?, rewardExp?, durationMs?) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle(`Indovina la parola ${E.VC_Exclamation}`)
    .setDescription(
      [
        `${E.VC_EXP} Indovina la parola da queste lettere: **${scrambled}** per ottenere **${rewardExp} exp**.`,
        `> ${E.VC_pixeltime} Hai ${formatItalianMinutesBold(minutes)} per indovinarla!`,
        `> ${E.VC_Winner} Guarda le tue statistiche dei minigiochi nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
      ].join("\n"),
    );
}

function buildGuessFlagEmbed(flagUrl?, rewardExp?, durationMs?) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle(`Indovina la bandiera ${E.VC_Exclamation}`)
    .setDescription(
      [
        `${E.VC_EXP} Indovina la nazione da questa bandiera per ottenere **${rewardExp} exp**.`,
        `> ${E.VC_pixeltime} Hai ${formatItalianMinutesBold(minutes)} per indovinarla!`,
        `> ${E.VC_Winner} Guarda le tue statistiche dei minigiochi nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
      ].join("\n"),
    )
    .setImage(flagUrl);
}

function buildGuessPlayerEmbed(rewardExp?, durationMs?, imageUrl?) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle(`Indovina il calciatore ${E.VC_Exclamation}`)
    .setDescription([
      `${E.VC_EXP} Indovina il calciatore per ottenere **${rewardExp} exp**.`,
      `> ${E.VC_pixeltime} Hai ${formatItalianMinutesBold(minutes)} per indovinarlo!`,
      `> ${E.VC_Winner} Guarda le tue statistiche dei minigiochi nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
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
    .setTitle(`Indovina la canzone ${E.VC_Exclamation}`)
    .setDescription([
      `${E.VC_EXP} Indovina la canzone per ottenere **${rewardExp} exp**.`,
      `> ${E.VC_pixeltime} Hai ${formatItalianMinutesBold(minutes)} per indovinarla!`,
      `> ${E.VC_Winner} Guarda le tue statistiche dei minigiochi nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
    ].join("\n"),);
  if (artworkUrl) embed.setImage(artworkUrl);
  return embed;
}

function buildGuessCapitalEmbed(country?, rewardExp?, durationMs?, imageUrl = null) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle(`Indovina la capitale ${E.VC_Exclamation}`)
    .setDescription([
      `${E.VC_EXP} Indovina la capitale di **${country}** per ottenere **${rewardExp} exp**.`,
      `> ${E.VC_pixeltime} Hai ${formatItalianMinutesBold(minutes)} per rispondere!`,
      `> ${E.VC_Winner} Guarda le tue statistiche dei minigiochi nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
    ].join("\n"),
    );
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildGuessRegionCapitalEmbed(region?, rewardExp?, durationMs?, imageUrl = null, imageName = null) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle(`Indovina il capoluogo ${E.VC_Exclamation}`)
    .setDescription([
      `${E.VC_EXP} Indovina il capoluogo della regione **${region}** per ottenere **${rewardExp} exp**.`,
      `> ${E.VC_pixeltime} Hai ${formatItalianMinutesBold(minutes)} per rispondere!`,
      `> ${E.VC_Winner} Guarda le tue statistiche dei minigiochi nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
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
    .setTitle(`Capitale inverso ${E.VC_Exclamation}`)
    .setDescription([
      `${E.VC_EXP} **${capital}** è la capitale di quale Stato? Indovina per **${rewardExp} exp**.`,
      `> ${E.VC_pixeltime} Hai ${formatItalianMinutesBold(minutes)} per rispondere!`,
      `> ${E.VC_Winner} Guarda le tue statistiche dei minigiochi nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
    ].join("\n"),
    );
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildFastTypeEmbed(rewardExp?, durationMs?) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle(`Gara di digitazione ${E.VC_Exclamation}`)
    .setDescription(
      [
        `${E.VC_EXP} Scrivi la frase più velocemente per ottenere **${rewardExp} exp**.`,
        `> ${E.VC_pixeltime} Hai ${formatItalianMinutesBold(minutes)} per scrivere la frase.`,
        `> ${E.VC_Winner} Guarda le tue statistiche dei minigiochi nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
      ].join("\n"),
    );
}

function buildGuessTeamEmbed(rewardExp?, durationMs?, imageUrl?) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle(`Indovina la squadra di calcio ${E.VC_Exclamation}`)
    .setDescription([
      `${E.VC_EXP} Indovina la squadra di calcio dal logo per ottenere **${rewardExp} exp**.`,
      `> ${E.VC_pixeltime} Hai ${formatItalianMinutesBold(minutes)} per indovinare la squadra.`,
      `> ${E.VC_Winner} Guarda le tue statistiche dei minigiochi nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
    ].join("\n"),
    );
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildGuessSingerEmbed(rewardExp?, durationMs?, imageUrl?) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle(`Indovina il cantante ${E.VC_Exclamation}`)
    .setDescription([
      `${E.VC_EXP} Indovina il cantante in foto per ottenere **${rewardExp} exp**.`,
      `> ${E.VC_pixeltime} Hai ${formatItalianMinutesBold(minutes)} per indovinare il cantante.`,
      `> ${E.VC_Winner} Guarda le tue statistiche dei minigiochi nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
    ].join("\n"),
    );
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildGuessAlbumEmbed(rewardExp?, durationMs?, imageUrlOrAttachment?) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle(`Indovina l'album ${E.VC_Exclamation}`)
    .setDescription([
      `${E.VC_EXP} Indovina l'album dalla copertina per ottenere **${rewardExp} exp**.`,
      `> ${E.VC_pixeltime} Hai ${formatItalianMinutesBold(minutes)} per indovinare l'album.`,
      `> ${E.VC_Winner} Guarda le tue statistiche dei minigiochi nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
    ].join("\n"),
    );
  if (imageUrlOrAttachment) embed.setImage(imageUrlOrAttachment);
  return embed;
}

function buildHangmanEmbed(rewardExp?, durationMs?) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle(`Indovina la parola ${E.VC_Exclamation}`)
    .setDescription(
      [
        `${E.VC_EXP} Scrivi una lettera o prova a indovinare la parola intera per ottenere **${rewardExp} exp**.`,
        `> ${E.VC_pixeltime} Hai ${formatItalianMinutesBold(minutes)} per indovinare la parola.`,
        `> ${E.VC_Winner} Guarda le tue statistiche dei minigiochi nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
      ].join("\n"),
    );
}

function buildItalianGkEmbed(rewardExp?, durationMs?) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle(`Quiz Cultura Generale ${E.VC_Exclamation}`)
    .setDescription(
      [
        `${E.VC_EXP} Indovina la risposta alla domanda per ottenere **${rewardExp} exp**.`,
        `> ${E.VC_pixeltime} Hai ${formatItalianMinutesBold(minutes)} per rispondere alla domanda.`,
        `> ${E.VC_Winner} Guarda le tue statistiche dei minigiochi nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
      ].join("\n"),
    );
}

function buildStarWarsQuizEmbed(rewardExp?, durationMs?, rewardCredits = 5000, malus = null) {
  const minutes = Math.max(1, Math.round(Number(durationMs || 0) / 60000));
  const creditsLabel = Number(rewardCredits || 0).toLocaleString("it-IT");
  const lines = [
    `${E.VC_EXP} Rispondi alla domanda per ottenere **${rewardExp} exp** + ${E.VC_crediti} **${creditsLabel}** crediti.`,
  ];
  if (malus?.def) {
    lines.push(`⚠️ **Malus attivo:** ${malus.def.title} — ${malus.def.short}`);
  }
  lines.push(
    `> ${E.VC_pixeltime} Hai ${formatItalianMinutesBold(minutes)} per rispondere!`,
    `> ${E.VC_Winner} Guarda le tue statistiche dei minigiochi nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
  );
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle(`Quiz Star Wars ${E.VC_Exclamation}`)
    .setDescription(lines.join("\n"));
}

function buildGuessPlanetEmbed(rewardExp?, durationMs?, hint = null) {
  const minutes = Math.max(1, Math.round(Number(durationMs || 0) / 60000));
  const lines = [
    `${E.VC_EXP} Indovina il pianeta da questa immagine per ottenere **${rewardExp} exp**.`,
  ];
  if (hint) lines.push(`Hint: \`${hint}\``);
  lines.push(
    `> ${E.VC_pixeltime} Hai ${formatItalianMinutesBold(minutes)} per indovinarlo!`,
    `> ${E.VC_Winner} Guarda le tue statistiche dei minigiochi nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
  );
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle(`Indovina il pianeta ${E.VC_Exclamation}`)
    .setDescription(lines.join("\n"));
}

function buildDrivingQuizEmbed(row?, rewardExp?, durationMs?) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const statement = row?.statement ?? "";
  const isMultiple = row?.questionType === "multiple" && Array.isArray(row.options) && row.options.length >= 2;
  const lines = [`${E.VC_EXP} **${isMultiple ? "Domanda" : "Affermazione"}:** ${statement}`,
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
    `> ${E.VC_pixeltime} Hai ${formatItalianMinutesBold(minutes)}.`,
  );
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle(`Quiz patente ${E.VC_Exclamation}`)
    .setDescription(lines.join("\n"));
}

function buildMathExpressionEmbed(rewardExp?, durationMs?, imageName = null) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle(`Risolvi l'espressione matematica ${E.VC_Exclamation}`)
    .setDescription([
      `${E.VC_EXP} Risolvi l'espressione matematica per ottenere **${rewardExp} exp**.`,
      `> ${E.VC_pixeltime} Hai ${formatItalianMinutesBold(minutes)} per rispondere!`,
      `> ${E.VC_Winner} Guarda le tue statistiche dei minigiochi nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
    ].join("\n"),
    );
  if (imageName) embed.setImage(`attachment://${imageName}`);
  return embed;
}

function buildFindBotEmbed(rewardExp?, durationMs?) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle(`Trova il messaggio del bot ${E.VC_Exclamation}`)
    .setDescription(
      [
        `${E.VC_EXP} Trova il messaggio del bot tra i canali del server per ottenere **${rewardExp} exp**.`,
        `> ${E.VC_pixeltime} Hai ${formatItalianMinutesBold(minutes)} per trovarlo!`,
        `> ${E.VC_Winner} Guarda le tue statistiche dei minigiochi nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
      ].join("\n"),
    );
}

function buildFindBotButtonEmbed(rewardExp?, durationMs?, imageUrl = null) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle(`Sei vicino al bot ${E.VC_Exclamation}`)
    .setDescription(
      [
        `${E.VC_EXP} Hai trovato il messaggio nascosto del bot? Reagisci con ${E.VC_Heart} per ottenere **${rewardExp} exp**.`,
        `> ${E.VC_pixeltime} Hai ${formatItalianMinutesBold(minutes)} per reclamare il messaggio!`,
        `> ${E.VC_Winner} Guarda le tue statistiche dei minigiochi nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
      ].join("\n"),
    );
  if (imageUrl) embed.setImage(String(imageUrl));
  return embed;
}

function buildFindBotVoiceEmbed(rewardExp?, durationMs?) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle(`Trova il bot in vocale ${E.VC_Exclamation}`)
    .setDescription(
      [
        `${E.VC_EXP} Il bot si è nascosto in una **vocale vuota** del server per ottenere **${rewardExp} exp**.`,
        `> ${E.VC_pixeltime} Hai ${formatItalianMinutesBold(minutes)} per trovarlo.`,
        `> ${E.VC_Winner} Guarda le tue statistiche dei minigiochi nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
      ].join("\n"),
    );
}

function buildMemorySequenceEmbed(sequence?, rewardExp?, displayMs?) {
  const seconds = Math.max(1, Math.round(Number(displayMs || 8000) / 1000));
  const safeSequence = String(sequence || "").trim();
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle(`Memoria ${E.VC_Exclamation}`)
    .setDescription([
      `${E.VC_EXP} Memorizza la sequenza e riscrivila per ottenere **${rewardExp} exp**.`,
      "",
      `> ${E.VC_pixeltime} La sequenza sparirà tra **${seconds} secondi**.`,
    ].join("\n"))
    .addFields({
      name: "Sequenza",
      value: safeSequence || "—",
      inline: false,
    });
}

function buildMemoryRecallEmbed(durationMs?, imageUrl = null, rewardExp = null) {
  const minutes = Math.max(1, Math.round(Number(durationMs || 180000) / 60000));
  const exp = Math.max(0, Math.floor(Number(rewardExp) || 0));
  const lead =
    exp > 0
      ? `${E.VC_EXP} Ora riscrivi la sequenza di emoji esatta per ottenere **${exp} exp**.`
      : `${E.VC_EXP} Riscrivi la sequenza di emoji esatta per ottenere **${rewardExp} exp**.`;
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle(`Sequenza di emoji svanita ${E.VC_Exclamation}`)
    .setDescription([
      lead,
      `> ${E.VC_pixeltime} Hai ${formatItalianMinutesBold(minutes)} per rispondere!`,
      `> ${E.VC_Winner} Guarda le tue statistiche dei minigiochi nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
    ].join("\n"));
  if (imageUrl) embed.setImage(String(imageUrl));
  return embed;
}

function buildGuessYearEmbed(title?, subtitle?, rewardExp?, durationMs?, imageUrl = null) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const sub = subtitle ? ` — ${subtitle}` : "";
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle(`Indovina l'anno di uscita ${E.VC_Exclamation}`)
    .setDescription([
      `${E.VC_EXP} Indovina l'anno di uscita di **${title}**${sub} per ottenere **${rewardExp} exp**.`,
      `> ${E.VC_pixeltime} Hai ${formatItalianMinutesBold(minutes)} per rispondere!`,
      `> ${E.VC_Winner} Guarda le tue statistiche nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
    ].join("\n"));
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildCompleteVerseEmbed(rewardExp?, durationMs?, imageUrl = null) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle(`Completa la frase ${E.VC_Exclamation}`)
    .setDescription([
      `${E.VC_EXP} Completa la frase per ottenere **${rewardExp} exp**.`,
      `> ${E.VC_pixeltime} Hai ${formatItalianMinutesBold(minutes)} per rispondere!`,
      `> ${E.VC_Winner} Guarda le tue statistiche nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
    ].join("\n"));
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildGuessEmojiEmbed(rewardExp?, durationMs?, imageUrl = null) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle(`Indovina dall'emoji ${E.VC_Exclamation}`)
    .setDescription([
      `${E.VC_EXP} Indovina cosa rappresenta l'emoji per ottenere **${rewardExp} exp**.`,
      `> ${E.VC_pixeltime} Hai ${formatItalianMinutesBold(minutes)} per indovinare!`,
      `> ${E.VC_Winner} Guarda le tue statistiche nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
    ].join("\n"));
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildQuoteFilmEmbed(quote?, rewardExp?, durationMs?, imageUrl = null) {
  const minutes = Math.max(1, Math.round(Number(durationMs || 0) / 60000));
  const q = String(quote || "").trim() || "…";
  const exp = Math.max(1, Math.floor(Number(rewardExp) || 150));
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle(`Citazione da film/serie ${E.VC_Exclamation}`)
    .setDescription([
      `${E.VC_EXP} *“${q}”* — Da quale film o serie? **${exp} exp**.`,
      `> ${E.VC_pixeltime} Hai ${formatItalianMinutesBold(minutes)} per indovinare!`,
      `> ${E.VC_Winner} Guarda le tue statistiche nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
    ].join("\n"));
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildCompleteProverbEmbed(rewardExp?, durationMs?, imageUrl = null) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle(`Completa il proverbio ${E.VC_Exclamation}`)
    .setDescription([
      `${E.VC_EXP} Completa il proverbio per ottenere **${rewardExp} exp**.`,
      `> ${E.VC_pixeltime} Hai ${formatItalianMinutesBold(minutes)} per rispondere!`,
      `> ${E.VC_Winner} Guarda le tue statistiche nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
    ].join("\n"));
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildSynonymAntonymEmbed(word?, kind?, rewardExp?, durationMs?, imageUrl = null) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const isSyn = String(kind || "").toLowerCase().includes("sinonim");
  const label = isSyn ? "sinonimo" : "contrario";
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle(`Trova il ${label} ${E.VC_Exclamation}`)
    .setDescription([
      `${E.VC_EXP} Scrivi un **${label}** di **${word}** per ottenere **${rewardExp} exp**.`,
      `> ${E.VC_pixeltime} Hai ${formatItalianMinutesBold(minutes)} per indovinare!`,
      `> ${E.VC_Winner} Guarda le tue statistiche nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
    ].join("\n"));
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildGuessCityEmbed(landmark?, rewardExp?, durationMs?, imageUrl = null) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle(`Indovina la città ${E.VC_Exclamation}`)
    .setDescription([
      `${E.VC_EXP} Indovina dove si trova **${landmark}** per ottenere **${rewardExp} exp**.`,
      `> ${E.VC_pixeltime} Hai ${formatItalianMinutesBold(minutes)} per indovinare!`,
      `> ${E.VC_Winner} Guarda le tue statistiche nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
    ].join("\n"));
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildTreasureHuntStartEmbed(decoyDisplay?, winnerDisplay?, durationMs?, rewardExp?) {
  const minutes = Math.max(1, Math.round(Number(durationMs || 0) / 60000));
  const decoy = String(decoyDisplay || "❓").trim() || "❓";
  const winner = String(winnerDisplay || "🏆").trim() || "🏆";
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle(`Caccia al tesoro ${E.VC_Exclamation}`)
    .setDescription(
      [
        `${E.VC_EXP} Sui prossimi messaggi metterò ${decoy} per ottenere **${rewardExp} exp**.`,
        `${E.VC_Flame} Su **uno solo** comparirà ${winner}: trovalo e cliccaci sopra per primo!`,
        "",
        `${E.VC_pixeltime} Hai circa **${minutes} min** prima che la caccia finisca.`,
      ].join("\n"),
    );
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
  buildStarWarsQuizEmbed,
  buildGuessPlanetEmbed,
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
