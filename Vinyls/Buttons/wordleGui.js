const {
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require("discord.js");
const wordle = require("../Services/Minigames/wordleService");
const prefixWordle = require("../Prefix/Minigames/wordle");

const PRIVATE = MessageFlags.Ephemeral;

function match(interaction) {
  const id = String(interaction?.customId || "");
  if (!wordle.isWordleCustomId(id)) return false;
  if (interaction?.isButton?.()) return true;
  if (interaction?.isModalSubmit?.()) return true;
  return false;
}

async function replyPrivate(interaction, content) {
  const payload = { content, flags: PRIVATE };
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload).catch(() => {});
  } else {
    await interaction.reply(payload).catch(() => {});
  }
}

async function ensureDict(client) {
  const cfg = client?.config?.minigames?.wordle || null;
  await wordle.ensureReady(cfg);
}

async function refreshPanel(interaction, session, note) {
  const payload = prefixWordle.boardPayload(session, note);
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => {});
  }
  await interaction.message?.edit?.(payload).catch(() => {});
  if (interaction.message) wordle.bindBoardMessage(session, interaction.message);
}

async function execute(interaction, client) {
  const parsed = wordle.parseWordleCustomId(interaction.customId);
  if (!parsed) return false;

  const uid = String(interaction.user?.id || "");
  if (parsed.userId && parsed.userId !== uid) {
    await replyPrivate(interaction, "Questa partita Wordle non è tua. Usa `+wordle` per aprirne una.");
    return true;
  }

  await ensureDict(client);

  if (parsed.action === "help") {
    if (interaction.isButton()) {
      await interaction.reply({ embeds: [prefixWordle.helpEmbed()], flags: PRIVATE }).catch(() => {});
      return true;
    }
  }

  if (parsed.action === "lang" && interaction.isButton()) {
    const lang = parsed.lang === "en" ? "en" : "it";
    const session = wordle.getOrCreateSession(uid, lang);
    await refreshPanel(
      interaction,
      session,
      lang === "en" ? "Puzzle giornaliero in inglese." : "Puzzle giornaliero in italiano.",
    );
    return true;
  }

  if (parsed.action === "guess" && interaction.isButton()) {
    const lang = wordle.resolveUserLang(uid, null);
    const session = wordle.getOrCreateSession(uid, lang);
    if (session.won || session.lost) {
      await replyPrivate(
        interaction,
        "Hai già finito il Wordle di oggi per questa lingua. Cambia lingua con IT/EN.",
      );
      return true;
    }
    const modal = new ModalBuilder()
      .setCustomId(`wordle:modal:${uid}`)
      .setTitle(`Wordle ${wordle.langLabel(session.lang)} · veloce`);
    const input = new TextInputBuilder()
      .setCustomId("guess")
      .setLabel(`Parola di ${wordle.WORD_LEN} lettere`)
      .setStyle(TextInputStyle.Short)
      .setMinLength(wordle.WORD_LEN)
      .setMaxLength(wordle.WORD_LEN)
      .setPlaceholder(session.lang === "en" ? "es. crane" : "es. cuore")
      .setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal).catch(() => null);
    return true;
  }

  if (parsed.action === "modal" && interaction.isModalSubmit()) {
    const lang = wordle.resolveUserLang(uid, null);
    const session = wordle.getOrCreateSession(uid, lang);
    if (session.won || session.lost) {
      await replyPrivate(interaction, "Partita già conclusa per oggi su questa lingua.");
      return true;
    }
    const guessRaw = String(interaction.fields.getTextInputValue("guess") || "");
    const result = wordle.applyGuess(session, guessRaw);
    if (!result.ok) {
      if (result.reason === "len") {
        await replyPrivate(
          interaction,
          `Serve una parola di **${wordle.WORD_LEN} lettere** (hai inviato \`${wordle.normalizeWord(guessRaw) || "?"}\`).`,
        );
        return true;
      }
      if (result.reason === "dict") {
        await replyPrivate(
          interaction,
          `\`${wordle.normalizeWord(guessRaw).toUpperCase()}\` non è nel dizionario.`,
        );
        return true;
      }
      if (result.reason === "dup") {
        await replyPrivate(interaction, "Hai già provato questa parola.");
        return true;
      }
      await replyPrivate(interaction, "Tentativo non valido.");
      return true;
    }

    // Update the board message if this modal came from it
    const payload = prefixWordle.boardPayload(session);
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate().catch(() => {});
    }
    if (interaction.message?.edit) {
      await interaction.message.edit(payload).catch(() => {});
      wordle.bindBoardMessage(session, interaction.message);
    } else if (session.channelId && session.messageId) {
      try {
        const ch = await client.channels.fetch(session.channelId).catch(() => null);
        const msg = await ch?.messages?.fetch?.(session.messageId).catch(() => null);
        if (msg) {
          await msg.edit(payload).catch(() => {});
          wordle.bindBoardMessage(session, msg);
        }
      } catch (eMsg) {}
    }
    return true;
  }

  return false;
}

module.exports = {
  name: "wordleGui",
  order: 35,
  match,
  execute,
};
