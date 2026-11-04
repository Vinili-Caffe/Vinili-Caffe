/** Minigiochi: embed di tempo scaduto e sconfitta. */
const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { MINIGAME_EMBED_COLOR, DRIVING_QUIZ_LETTERS } = require("./minigameEmbedShared") as typeof import("./minigameEmbedShared");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
function buildTimeoutNumberEmbed(number?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `${E.VC_pixeltime} Tempo scaduto! Il numero era **${number}**.`,
    );
}

function buildTimeoutWordEmbed(word?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `${E.VC_pixeltime} Tempo scaduto! La parola era **${word}**.`,
    );
}

function buildTimeoutFlagEmbed(name?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `${E.VC_pixeltime} Tempo scaduto! La bandiera era **${name}**.`,
    );
}

function buildTimeoutPlayerEmbed(name?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `${E.VC_pixeltime} Tempo scaduto! Il calciatore era **${name}**.`,
    );
}

function buildTimeoutSongEmbed(title?, artist?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `${E.VC_pixeltime} Tempo scaduto! Era **${title}** \u2014 ${artist}.`,
    );
}

function buildTimeoutFindBotEmbed() {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `${E.VC_pixeltime} Tempo scaduto! Nessuno ha trovato il bot.`,
    );
}

function buildTimeoutFindBotVoiceEmbed() {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `${E.VC_pixeltime} Tempo scaduto! Nessuno è entrato nella vocale del bot.`,
    );
}

function buildMemoryTimeoutEmbed(sequence?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `${E.VC_pixeltime} Tempo scaduto! La sequenza era: **${sequence}**`,
    );
}

function buildTimeoutCapitalEmbed(country?, answer?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `${E.VC_pixeltime} Tempo scaduto! La capitale di **${country}** era **${answer}**.`,
    );
}

function buildTimeoutRegionCapitalEmbed(region?, answer?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `${E.VC_pixeltime} Tempo scaduto! Il capoluogo di **${region}** era **${answer}**.`,
    );
}

function buildTimeoutReverseCapitalEmbed(capital?, answer?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `${E.VC_pixeltime} Tempo scaduto! **${capital}** è la capitale di **${answer}**.`,
    );
}

function buildTimeoutFastTypeEmbed(phrase?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `${E.VC_pixeltime} Tempo scaduto! La frase era \`${phrase}\`.`,
    );
}

function buildTimeoutTeamEmbed(team?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `${E.VC_pixeltime} Tempo scaduto! La squadra era **${team}**.`,
    );
}

function buildTimeoutSingerEmbed(name?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `${E.VC_pixeltime} Tempo scaduto! Il cantante era **${name}**.`,
    );
}

function buildTimeoutAlbumEmbed(name?, artist?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `${E.VC_pixeltime} Tempo scaduto! Era **${name}** di ${artist}.`,
    );
}

function buildTimeoutHangmanEmbed(word?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `${E.VC_pixeltime} Tempo scaduto! La parola era **${word}**.`,
    );
}

function buildHangmanLossEmbed(word?) {
  return new EmbedBuilder()
    .setColor("#ED4245")
    .setDescription(
      `${E.VC_pixeltime} Errori esauriti! La parola era **${word}**.`,
    );
}

function buildTimeoutItalianGkEmbed(answer?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `${E.VC_pixeltime} Tempo scaduto! La risposta era **${answer}**.`,
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
      `${E.VC_pixeltime} Tempo scaduto! ${text}`,
    );
}

function buildTimeoutMathEmbed(answer?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `${E.VC_pixeltime} Tempo scaduto! Il risultato corretto era **${answer}**.`,
    );
}

function buildTimeoutGuessYearEmbed(title?, subtitle?, year?) {
  const sub = subtitle ? ` — ${subtitle}` : "";
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `${E.VC_pixeltime} Tempo scaduto! **${title}**${sub} era del **${year}**.`,
    );
}

function buildTimeoutCompleteVerseEmbed(answer?, song?, artist?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `${E.VC_pixeltime} Tempo scaduto! La risposta era **${answer}** (${song} — ${artist}).`,
    );
}

function buildTimeoutGuessEmojiEmbed(emojis?, answer?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `${E.VC_pixeltime} Tempo scaduto! ${emojis} era **${answer}**.`,
    );
}

function buildTimeoutQuoteFilmEmbed(quote?, answer?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `${E.VC_pixeltime} Tempo scaduto! La citazione è da **${answer}**.`,
    );
}

function buildTimeoutCompleteProverbEmbed(start?, end?) {
  const full = String(end || "").trim() ? `${start} ${end}`.trim() : start;
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `${E.VC_pixeltime} Tempo scaduto! Il proverbio completo: **${full}**.`,
    );
}

function buildTimeoutSynonymAntonymEmbed(word?, answer?, kind?) {
  const label = kind === "antonym" ? "Il contrario" : "Un sinonimo";
  const safeWord = word != null && String(word).trim() !== "" ? String(word) : "—";
  const safeAnswer = answer != null && String(answer).trim() !== "" ? String(answer) : "—";
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `${E.VC_pixeltime} Tempo scaduto! ${label} di **${safeWord}** era **${safeAnswer}**.`,
    );
}

function buildTimeoutGuessCityEmbed(landmark?, city?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `${E.VC_pixeltime} Tempo scaduto! **${landmark}** si trova a **${city}**.`,
    );
}

function buildTreasureHuntTimeoutEmbed(decoyDisplay?, winnerDisplay?, winnerMessageUrl?) {
  const decoyText = String(decoyDisplay || "").trim() || "le reaction";
  const winnerText = String(winnerDisplay || "").trim() || "quella vincente";
  const lines = [
    `${E.VC_pixeltime} Tempo scaduto! Nessuno ha trovato la reaction ${winnerText} tra le ${decoyText}.`,
  ];
  if (winnerMessageUrl) {
    lines.push("", `${E.VC_Arrow} Era questo messaggio: ${winnerMessageUrl}`);
  }
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle(`${E.VC_Alert} Caccia al tesoro conclusa`)
    .setDescription(lines.join("\n"));
}

export = {
  buildTimeoutNumberEmbed,
  buildTimeoutWordEmbed,
  buildTimeoutFlagEmbed,
  buildTimeoutPlayerEmbed,
  buildTimeoutSongEmbed,
  buildTimeoutFindBotEmbed,
  buildTimeoutFindBotVoiceEmbed,
  buildMemoryTimeoutEmbed,
  buildTimeoutCapitalEmbed,
  buildTimeoutRegionCapitalEmbed,
  buildTimeoutReverseCapitalEmbed,
  buildTimeoutFastTypeEmbed,
  buildTimeoutTeamEmbed,
  buildTimeoutSingerEmbed,
  buildTimeoutAlbumEmbed,
  buildTimeoutHangmanEmbed,
  buildHangmanLossEmbed,
  buildTimeoutItalianGkEmbed,
  buildTimeoutDrivingQuizEmbed,
  buildTimeoutMathEmbed,
  buildTimeoutGuessYearEmbed,
  buildTimeoutCompleteVerseEmbed,
  buildTimeoutGuessEmojiEmbed,
  buildTimeoutQuoteFilmEmbed,
  buildTimeoutCompleteProverbEmbed,
  buildTimeoutSynonymAntonymEmbed,
  buildTimeoutGuessCityEmbed,
  buildTreasureHuntTimeoutEmbed,
};
