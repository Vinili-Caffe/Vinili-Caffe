const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const wordle = require("../../Services/Minigames/wordleService");

const PLAY_URL = "https://www.viniliecaffe.it/wordle/";

function helpEmbed() {
  return new EmbedBuilder()
    .setColor(0xc9a227)
    .setTitle("Wordle · Vinili & Caffè")
    .setDescription(
      [
        "Il Wordle **vero** è sul sito: griglia + tastiera, come il gioco online.",
        "",
        `🎮 **[Gioca ora](${PLAY_URL})**`,
        "",
        "• Stesso puzzle giornaliero di Discord (`Europe/Rome`)",
        "• IT / EN dal toggle in pagina",
        "• Oppure da qui: `+wordle <parola>` per una partita veloce in chat",
      ].join("\n"),
    );
}

function playUrlFor(lang) {
  const l = lang === "en" ? "en" : "it";
  return `${PLAY_URL}?lang=${l}`;
}

function buildControls(session, disabled = false) {
  const uid = String(session.userId || "");
  const done = Boolean(session.won || session.lost || disabled);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("Gioca sul sito")
      .setStyle(ButtonStyle.Link)
      .setURL(playUrlFor(session.lang)),
    new ButtonBuilder()
      .setCustomId(`wordle:guess:${uid}`)
      .setLabel("Veloce qui")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(done),
    new ButtonBuilder()
      .setCustomId(`wordle:lang:it:${uid}`)
      .setLabel("IT")
      .setStyle(session.lang === "it" ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`wordle:lang:en:${uid}`)
      .setLabel("EN")
      .setStyle(session.lang === "en" ? ButtonStyle.Success : ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`wordle:help:${uid}`)
      .setLabel("Aiuto")
      .setStyle(ButtonStyle.Secondary),
  );
  return [row, row2];
}

function boardEmbed(session, note) {
  const lang = wordle.langLabel(session.lang);
  const hasGuesses = Array.isArray(session.guesses) && session.guesses.length > 0;
  const lines = [
    note ? `*${note}*` : null,
    hasGuesses ? wordle.buildBoardText(session) : null,
    "",
    wordle.statusLabel(session),
    "",
    hasGuesses
      ? `Continua sul sito → ${playUrlFor(session.lang)}`
      : `Apri la griglia interattiva → **[Gioca](${playUrlFor(session.lang)})**`,
  ].filter((x) => x != null);

  return new EmbedBuilder()
    .setColor(session.won ? 0x58a64b : session.lost ? 0xc23b3b : 0xc9a227)
    .setTitle(`Wordle ${lang} · ${session.day}`)
    .setDescription(lines.join("\n"))
    .setFooter({
      text: session.won || session.lost
        ? "Torna domani · oppure cambia lingua IT/EN"
        : "Gioca sul sito (consigliato) oppure Veloce qui",
    });
}

function deny(text) {
  return new EmbedBuilder().setColor(0xc23b3b).setDescription(text);
}

function boardPayload(session, note) {
  return {
    embeds: [boardEmbed(session, note)],
    components: buildControls(session),
  };
}

async function sendOrUpdateBoard(message, session, note) {
  const payload = boardPayload(session, note);
  if (session.messageId && session.channelId && message.channel?.id === session.channelId) {
    try {
      const prev = await message.channel.messages.fetch(session.messageId).catch(() => null);
      if (prev && prev.author?.id === message.client.user?.id) {
        await prev.edit(payload);
        wordle.bindBoardMessage(session, prev);
        return prev;
      }
    } catch (eEdit) {}
  }
  const sent = await safeMessageReply(message, payload);
  if (sent) wordle.bindBoardMessage(session, sent);
  return sent;
}

module.exports = {
  name: "wordle",
  aliases: ["wdl", "parola"],
  allowEmptyArgs: true,
  description: "Wordle giornaliero interattivo (sito) + partita veloce in chat.",
  usage: "+wordle [it|en|<parola>]",
  examples: ["+wordle", "+wordle en", "+wordle cuore"],
  boardPayload,
  boardEmbed,
  buildControls,
  helpEmbed,
  PLAY_URL,
  async execute(message, args) {
    const userId = message.author.id;
    const rawArgs = Array.isArray(args) ? args.map((a) => String(a || "").trim()).filter(Boolean) : [];
    const joined = rawArgs.join(" ").trim();
    const wordleCfg = message.client?.config?.minigames?.wordle || null;
    await wordle.ensureReady(wordleCfg);

    if (!joined || /^(help|aiuto|\?)$/i.test(joined)) {
      if (!joined) {
        const lang = wordle.resolveUserLang(userId, null);
        const session = wordle.getOrCreateSession(userId, lang);
        return sendOrUpdateBoard(
          message,
          session,
          "Apri **Gioca sul sito** per la griglia interattiva (come Wordle online).",
        );
      }
      return safeMessageReply(message, { embeds: [helpEmbed()] });
    }

    const asLang = wordle.parseLang(rawArgs[0]);
    if (asLang && rawArgs.length === 1) {
      const session = wordle.getOrCreateSession(userId, asLang);
      return sendOrUpdateBoard(
        message,
        session,
        asLang === "en" ? "Puzzle giornaliero in inglese." : "Puzzle giornaliero in italiano.",
      );
    }

    let lang = wordle.resolveUserLang(userId, null);
    let guessRaw = joined;
    if (asLang && rawArgs.length >= 2) {
      lang = asLang;
      guessRaw = rawArgs.slice(1).join("");
    } else if (rawArgs.length === 1) {
      guessRaw = rawArgs[0];
    } else {
      guessRaw = rawArgs.join("");
    }

    const session = wordle.getOrCreateSession(userId, lang);
    if (session.won || session.lost) {
      return sendOrUpdateBoard(
        message,
        session,
        "Hai già finito il Wordle di oggi per questa lingua. Cambia lingua con IT/EN.",
      );
    }

    const result = wordle.applyGuess(session, guessRaw);
    if (!result.ok) {
      if (result.reason === "len") {
        return safeMessageReply(message, {
          embeds: [
            deny(
              `La parola deve avere **${wordle.WORD_LEN} lettere** (hai inviato \`${wordle.normalizeWord(guessRaw) || "?"}\`).`,
            ),
          ],
        });
      }
      if (result.reason === "dict") {
        return safeMessageReply(message, {
          embeds: [deny(`\`${wordle.normalizeWord(guessRaw).toUpperCase()}\` non è nel dizionario.`)],
        });
      }
      if (result.reason === "dup") {
        return safeMessageReply(message, { embeds: [deny("Hai già provato questa parola.")] });
      }
      return safeMessageReply(message, { embeds: [deny("Tentativo non valido.")] });
    }

    return sendOrUpdateBoard(message, session);
  },
};
