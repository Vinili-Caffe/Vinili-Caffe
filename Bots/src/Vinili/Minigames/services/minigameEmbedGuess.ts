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
      `${E.VC_EXP} Indovina il calciatore più famoso per ottenere **${rewardExp} exp**.`,
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

function buildFastTypeEmbed(phrase?, rewardExp?, durationMs?) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle(`Scrivi per primo la frase ${E.VC_Exclamation}`)
    .setDescription(
      [
        `${E.VC_EXP} Il primo che scrive questa frase ottiene **${rewardExp} exp**.`,
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
      `${E.VC_EXP} Indovina il cantante dalla foto per ottenere **${rewardExp} exp**.`,
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

function buildHangmanEmbed(maskedWord?, rewardExp?, durationMs?) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle(`Impiccato ${E.VC_Exclamation}`)
    .setDescription(
      [
        `${E.VC_EXP} Scrivi una lettera o prova la parola intera per ottenere **${rewardExp} exp**.`,
        `> ${E.VC_pixeltime} Hai ${formatItalianMinutesBold(minutes)} per indovinare la parola.`,
        `> ${E.VC_Winner} Guarda le tue statistiche dei minigiochi nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
      ].join("\n"),
    );
}

function buildItalianGkEmbed(question?, rewardExp?, durationMs?) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle(`Cultura generale ${E.VC_Exclamation}`)
    .setDescription(
      [
        `${E.VC_EXP} **Domanda:** ${question} per ottenere **${rewardExp} exp**.`,
        `> ${E.VC_pixeltime} Hai ${formatItalianMinutesBold(minutes)} per rispondere alla domanda.`,
        `> ${E.VC_Winner} Guarda le tue statistiche dei minigiochi nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
      ].join("\n"),
    );
}

function buildStarWarsQuizEmbed(kind?, rewardExp?, durationMs?, rewardCredits = 5000, malus = null) {
  const minutes = Math.max(1, Math.round(Number(durationMs || 0) / 60000));
  const k = String(kind || "text");
  let how = "Scrivi la risposta in chat.";
  if (k === "mc") how = "Rispondi con la lettera (**A–D**), il numero (**1–4**) o il testo della risposta.";
  else if (k === "vf") how = "Rispondi con **vero** o **falso**.";
  const creditsLabel = Number(rewardCredits || 0).toLocaleString("it-IT");
  const lines = [
    `${E.VC_EXP} Rispondi alla domanda sull'immagine per ottenere **${rewardExp} exp** + ${E.VC_crediti} **${creditsLabel}** crediti.`,
    `Ogni **10** risposte corrette → **Cassa Alpha**.`,
    how,
  ];
  if (malus?.def) {
    lines.push(`⚠️ **Malus attivo: ${malus.def.title}** — ${malus.def.short}`);
    if (malus.def.teamWin && malus.geoFactionId) {
      try {
        const { factionLabel } = require("../../../../archivio/starwars/src/Vinili/Services/Community/starWarsQuizMalusService") as typeof import("../../../../archivio/starwars/src/Vinili/Services/Community/starWarsQuizMalusService");
        lines.push(`🧠 Servono **3** risposte corrette dalla fazione **${factionLabel(malus.geoFactionId)}**.`);
      } catch (_) {}
    }
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

function buildMathExpressionEmbed( expression?, rewardExp?, durationMs?, imageName = null) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle(`Espressione matematica ${E.VC_Exclamation}`)
    .setDescription([
      `${E.VC_EXP} Risolvi: **${expression}** per ottenere **${rewardExp} exp**.`,
      `> ${E.VC_pixeltime} Hai ${formatItalianMinutesBold(minutes)} per risolvere l'espressione.`,
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
    .setTitle(`Trova il bot ${E.VC_Exclamation}`)
    .setDescription(
      [
        `${E.VC_EXP} Trova il messaggio del bot tra i canali del server, reagisci con ${E.VC_Heart} per ottenere **${rewardExp} exp**.`,
        `> ${E.VC_pixeltime} Hai ${formatItalianMinutesBold(minutes)} per trovarlo.`,
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
        `${E.VC_EXP} Hai trovato il messaggio nascosto: reagisci con ${E.VC_Heart} per ottenere **${rewardExp} exp**.`,
        `> ${E.VC_pixeltime} Hai ${formatItalianMinutesBold(minutes)} per reclamare.`,
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
        `${E.VC_EXP} Il bot si è nascosto in una **vocale vuota** del server: entra in quella vocale per ottenere **${rewardExp} exp**.`,
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
      `${E.VC_EXP} Memorizza questa sequenza e riscrivila per ottenere **${rewardExp} exp**.`,
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
      ? `${E.VC_EXP} Ora riscrivi la sequenza per ottenere **${exp} exp**.`
      : "Riscrivi in chat la sequenza di emoji esatta.";
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle(`Sequenza svanita ${E.VC_Exclamation}`)
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
    .setTitle(`Indovina l'anno ${E.VC_Exclamation}`)
    .setDescription([
      `${E.VC_EXP} In che anno è uscito **${title}**${sub}? Scrivi l'anno per **${rewardExp} exp**.`,
      `> ${E.VC_pixeltime} Hai ${formatItalianMinutesBold(minutes)} per rispondere!`,
      `> ${E.VC_Winner} Guarda le tue statistiche nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
    ].join("\n"));
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildCompleteVerseEmbed(verse?, rewardExp?, durationMs?, imageUrl = null) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const promptLine = imageUrl
    ? `${E.VC_EXP} Completa il verso **nell'immagine** per **${rewardExp} exp**.`
    : `${E.VC_EXP} Completa: **${verse}** per **${rewardExp} exp**.`;
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle(`Completa il verso ${E.VC_Exclamation}`)
    .setDescription([
      promptLine,
      `> ${E.VC_pixeltime} Hai ${formatItalianMinutesBold(minutes)} per rispondere!`,
      `> ${E.VC_Winner} Guarda le tue statistiche nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
    ].join("\n"));
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildGuessEmojiEmbed(emojis?, rewardExp?, durationMs?, imageUrl = null) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle(`Indovina da emoji ${E.VC_Exclamation}`)
    .setDescription([
      `${E.VC_EXP} Cosa rappresenta **${emojis}**? Scrivi film, serie o canzone per **${rewardExp} exp**.`,
      `> ${E.VC_pixeltime} Hai ${formatItalianMinutesBold(minutes)} per rispondere!`,
      `> ${E.VC_Winner} Guarda le tue statistiche nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
    ].join("\n"));
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildQuoteFilmEmbed(quote?, rewardExp?, durationMs?, imageUrl = null) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle(`Citazione da film/serie ${E.VC_Exclamation}`)
    .setDescription([
      `${E.VC_EXP} *"${quote}"* — Da quale film o serie? **${rewardExp} exp**.`,
      `> ${E.VC_pixeltime} Hai ${formatItalianMinutesBold(minutes)} per rispondere!`,
      `> ${E.VC_Winner} Guarda le tue statistiche nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
    ].join("\n"));
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildCompleteProverbEmbed(start?, rewardExp?, durationMs?, imageUrl = null) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const promptLine = imageUrl
    ? `${E.VC_EXP} Completa il proverbio **nell'immagine** per **${rewardExp} exp**.`
    : `${E.VC_EXP} **${start}** ... Completa il proverbio per **${rewardExp} exp**.`;
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle(`Completa il proverbio ${E.VC_Exclamation}`)
    .setDescription([
      promptLine,
      `> ${E.VC_pixeltime} Hai ${formatItalianMinutesBold(minutes)} per rispondere!`,
      `> ${E.VC_Winner} Guarda le tue statistiche nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
    ].join("\n"));
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildSynonymAntonymEmbed(word?, kind?, rewardExp?, durationMs?, imageUrl = null) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const label = kind === "antonym" ? "il contrario" : "un sinonimo";
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle(kind === "antonym" ? `Trova il contrario ${E.VC_Exclamation}` : `Trova il sinonimo ${E.VC_Exclamation}`)
    .setDescription([
      `${E.VC_EXP} Scrivi ${label} di **${word}** per **${rewardExp} exp**.`,
      `> ${E.VC_pixeltime} Hai ${formatItalianMinutesBold(minutes)} per rispondere!`,
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
      `${E.VC_EXP} In quale città si trova **${landmark}**? **${rewardExp} exp**.`,
      `> ${E.VC_pixeltime} Hai ${formatItalianMinutesBold(minutes)} per rispondere!`,
      `> ${E.VC_Winner} Guarda le tue statistiche nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
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
    .setTitle(`${E.VC_Events} Caccia al tesoro${E.VC_Exclamation}`)
    .setDescription(
      [
        `${E.VC_Stats} Sui prossimi messaggi in chat metterò la reaction ${decoyText}.`,
        `${E.VC_Flame} Su **uno solo** comparirà ${winnerText}: trovalo e cliccaci sopra per primo!`,
        "",
        `${E.VC_EXP} In palio: **${rewardExp} exp**`,
        `${E.VC_pixeltime} Hai circa **${minutes} min** prima che la caccia finisca.`,
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
