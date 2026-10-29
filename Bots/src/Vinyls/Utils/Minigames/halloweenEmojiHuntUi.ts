const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");

const SITE = "https://www.viniliecaffe.it";
const HALLOWEEN_EMOJI = "<:VC_Halloween:1558964785113206824>";
const COLOR_SPAWN = 0xe85d04;
const COLOR_HINT = 0xf59e0b;
const COLOR_ENDED = 0x78716c;
const COLOR_WIN = 0xff7a18;

const BANNER_SPAWN = `${SITE}/images/halloween/tot-trick1.gif`;
const BANNER_HINT = `${SITE}/images/halloween/tot-trick2.gif`;
const BANNER_ENDED = `${SITE}/images/halloween/tot-door.gif`;

function minsLabel(ms?) {
  return Math.max(1, Math.round(Number(ms || 0) / 60000));
}

function buildHuntSpawnEmbed({ jumpUrl = "", durationMs = 900000 } = {}) {
  const mins = minsLabel(durationMs);
  const link = String(jumpUrl || "").trim();
  const where = link
    ? `C’è un’emoji Halloween nascosta su [questo messaggio](${link}).`
    : "C’è un’emoji Halloween nascosta su un messaggio recente in chat.";
  return new EmbedBuilder()
    .setColor(COLOR_SPAWN)
    .setAuthor({ name: "Caccia all’emoji", iconURL: BANNER_SPAWN })
    .setTitle("Reagisci e prendi la caramella!")
    .setDescription(
      [
        `${HALLOWEEN_EMOJI} ${where}`,
        "",
        "Tocca la reazione Halloween prima degli altri.",
        `Hai circa **${mins} min**.`,
      ].join("\n"),
    )
    .setImage(BANNER_SPAWN)
    .setFooter({ text: "Halloween · Vinili & Caffè" });
}

function buildHuntHintEmbed({ jumpUrl = "", remainingMs = 0 } = {}) {
  const mins = minsLabel(remainingMs);
  const link = String(jumpUrl || "").trim();
  const tip = link
    ? `Ancora nascosta qui → [apri il messaggio](${link})`
    : "Scorri i messaggi recenti in chat e cerca la reazione Halloween.";
  return new EmbedBuilder()
    .setColor(COLOR_HINT)
    .setAuthor({ name: "Promemoria caccia", iconURL: BANNER_HINT })
    .setTitle("Qualcuno l’ha già vista?")
    .setDescription(
      [
        `${HALLOWEEN_EMOJI} ${tip}`,
        "",
        "Reagisci con l’emoji Halloween sul messaggio giusto.",
        mins > 0 ? `Tempo rimasto: circa **${mins} min**.` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .setImage(BANNER_HINT)
    .setFooter({ text: "Aiuto a metà round · Halloween" });
}

function buildHuntEndedEmbed() {
  return new EmbedBuilder()
    .setColor(COLOR_ENDED)
    .setAuthor({ name: "Caccia all’emoji", iconURL: BANNER_ENDED })
    .setTitle("L’emoji sparisce nella nebbia")
    .setDescription(
      [
        `${HALLOWEEN_EMOJI} Nessuno l’ha trovata in tempo.`,
        "",
        "La reazione si dissolve… alla prossima caccia 🎃",
      ].join("\n"),
    )
    .setImage(BANNER_ENDED)
    .setFooter({ text: "Halloween · Vinili & Caffè" });
}

function buildHuntFoundAnnounceEmbed({ userId = "" } = {}) {
  const uid = String(userId || "").trim();
  const who = uid ? `<@${uid}>` : "Qualcuno";
  return new EmbedBuilder()
    .setColor(COLOR_WIN)
    .setAuthor({ name: "Trovata!", iconURL: BANNER_SPAWN })
    .setTitle("Emoji Halloween scoperta")
    .setDescription(`${HALLOWEEN_EMOJI} ${who} ha fiutato la caramella nascosta.`)
    .setFooter({ text: "Halloween · Vinili & Caffè" });
}

export = {
  HALLOWEEN_EMOJI,
  buildHuntSpawnEmbed,
  buildHuntHintEmbed,
  buildHuntEndedEmbed,
  buildHuntFoundAnnounceEmbed,
};
