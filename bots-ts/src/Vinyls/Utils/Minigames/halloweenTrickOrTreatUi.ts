const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js") as typeof import("discord.js");

const SITE = "https://www.viniliecaffe.it";
const HALLOWEEN_EMOJI = "<:VC_Halloween:1558964785113206824>";
const COLOR_ROUND = 0xe85d04;
const COLOR_TRICK = 0x6d28d9;
const COLOR_DONE = 0x78716c;

const ROUND_BANNER = `${SITE}/images/halloween/tot-knock.gif`;
const ENDED_BANNER = `${SITE}/images/halloween/tot-door.gif`;
const TRICK_GIFS = Object.freeze([
  `${SITE}/images/halloween/tot-trick1.gif`,
  `${SITE}/images/halloween/tot-trick2.gif`,
  `${SITE}/images/halloween/tot-trick3.gif`,
  `${SITE}/images/halloween/tot-door.gif`,
]);

const ENDED_LINES = Object.freeze([
  "Le luci si spengono. La porta resta chiusa fino al prossimo toc toc.",
  "La nebbia riprende la strada. A presto, sacchetti.",
  "Ultimo soffio di zucca… e silenzio. Torna a bussare più tardi.",
]);

const TRICK_LINES = Object.freeze([
  "Boo! Dietro la porta… solo un soffio di nebbia.",
  "Uno scheletro ti fa la linguaccia e chiude lo sportello.",
  "Un gattino nero ti soffia il sacchetto. Miao.",
  "Zucca vuota, sorriso pieno. Classicissimo.",
  "I fantasmini ridacchiano. Tu resti a mani vuote.",
  "Toc toc… *nessuno*. Solo un ragnetto educato.",
  "Scherzetto soft: ti hanno lasciato un «ciao» scritto col fumo.",
  "La streghetta scuote la testa. «Riprova al prossimo round.»",
]);

function pick(arr?) {
  const list = Array.isArray(arr) && arr.length ? arr : [];
  if (!list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}

function buildTrickOrTreatRoundEmbed({ minutes = 3, testHint = false } = {}) {
  const mins = Math.max(1, Math.floor(Number(minutes) || 3));
  const embed = new EmbedBuilder()
    .setColor(COLOR_ROUND)
    .setTitle("Trick or Treat!")
    .setDescription(
      [
        `${HALLOWEEN_EMOJI} *Toc toc…* qualcuno bussa alla porta.`,
        "",
        "Premi il pulsante e scopri cosa c’è dietro.",
      ].join("\n"),
    )
    .setImage(ROUND_BANNER)
    .setFooter({
      text: testHint
        ? `Prova · una volta · ${mins} min`
        : `Una volta a testa · aperto ${mins} min`,
    });
  return embed;
}

function buildTrickOrTreatEndedEmbed(claimed = 0) {
  const n = Math.max(0, Math.floor(Number(claimed) || 0));
  const vibe = pick(ENDED_LINES) || ENDED_LINES[0];
  const who =
    n > 1
      ? `Hanno bussato in **${n}**.`
      : n === 1
        ? "Ha bussato **1** anima coraggiosa."
        : "Nessuno ha bussato. Che quiete.";
  return new EmbedBuilder()
    .setColor(COLOR_DONE)
    .setAuthor({ name: "Trick or Treat", iconURL: ROUND_BANNER })
    .setTitle("La porta si chiude")
    .setDescription([`${HALLOWEEN_EMOJI} ${vibe}`, "", who, "", "Alla prossima notte 🎃"].join("\n"))
    .setImage(ENDED_BANNER)
    .setFooter({ text: "Halloween · Vinili & Caffè" });
}

function buildTrickReplyEmbed() {
  const line = pick(TRICK_LINES) || TRICK_LINES[0];
  const gif = pick(TRICK_GIFS) || TRICK_GIFS[0];
  const embed = new EmbedBuilder()
    .setColor(COLOR_TRICK)
    .setTitle("Scherzetto!")
    .setDescription(`👻 ${line}`)
    .setFooter({ text: "Riprova al prossimo round" });
  if (gif) embed.setImage(gif);
  return embed;
}

function buildAlreadyKnockedEmbed() {
  return new EmbedBuilder()
    .setColor(COLOR_DONE)
    .setTitle("Hai già bussato")
    .setDescription("Una porta, un tentativo. Torna al prossimo round 🎃");
}

function buildTrickOrTreatJumpUrl(guildId?, channelId?, messageId?) {
  const g = String(guildId || "").trim();
  const c = String(channelId || "").trim();
  const m = String(messageId || "").trim();
  if (!g || !c || !m) return "";
  return `https://discord.com/channels/${g}/${c}/${m}`;
}

function buildTrickOrTreatHintEmbed({ remainingMs = 0, claimedCount = 0, jumpUrl = "" } = {}) {
  const mins = Math.max(1, Math.round(Number(remainingMs || 0) / 60000));
  const claimed = Math.max(0, Math.floor(Number(claimedCount) || 0));
  const link = String(jumpUrl || "").trim();
  const who =
    claimed > 0
      ? `Hanno già bussato in **${claimed}**.`
      : "Ancora nessuno ha bussato…";
  const tip = link
    ? "Se non hai ancora giocato, apri il messaggio del round e premi il pulsante."
    : "Se non hai ancora giocato, premi il pulsante del round!";
  return new EmbedBuilder()
    .setColor(0xf59e0b)
    .setAuthor({ name: "Promemoria Trick or Treat", iconURL: ROUND_BANNER })
    .setTitle("La porta è ancora aperta")
    .setDescription(
      [
        `${HALLOWEEN_EMOJI} ${who}`,
        "",
        tip,
        `Tempo rimasto: circa **${mins} min**.`,
      ].join("\n"),
    )
    .setImage(ROUND_BANNER)
    .setFooter({ text: "Aiuto a metà round · Halloween" });
}

/** Payload promemoria: embed + bottone link al messaggio col Trick or Treat. */
function buildTrickOrTreatHintMessage({ remainingMs = 0, claimedCount = 0, jumpUrl = "" } = {}) {
  const link = String(jumpUrl || "").trim();
  const payload = {
    embeds: [buildTrickOrTreatHintEmbed({ remainingMs, claimedCount, jumpUrl: link })],
  };
  if (link) {
    payload.components = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel("Vai al messaggio")
          .setEmoji("🎃")
          .setURL(link),
      ),
    ];
  }
  return payload;
}

export = {
  HALLOWEEN_EMOJI,
  COLOR_ROUND,
  COLOR_TRICK,
  buildTrickOrTreatRoundEmbed,
  buildTrickOrTreatEndedEmbed,
  buildTrickReplyEmbed,
  buildAlreadyKnockedEmbed,
  buildTrickOrTreatHintEmbed,
  buildTrickOrTreatJumpUrl,
  buildTrickOrTreatHintMessage,
};
