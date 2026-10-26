const { EmbedBuilder } = require("discord.js");

const SITE = "https://www.viniliecaffe.it";
const COLOR = 0x7c3aed;

/** GIF a tema fantasma / Halloween — una a caso sull’embed nascosto. */
const GHOST_FOUND_GIFS = Object.freeze([
  `${SITE}/images/halloween/ghost1.gif`,
  `${SITE}/images/halloween/ghost2.gif`,
  `${SITE}/images/halloween/ghost3.gif`,
  `${SITE}/images/halloween/tot-trick1.gif`,
  `${SITE}/images/halloween/tot-trick2.gif`,
  `${SITE}/images/halloween/tot-trick3.gif`,
  `${SITE}/images/halloween/tot-knock.gif`,
  `${SITE}/images/halloween/tot-door.gif`,
]);

function pickGhostFoundGif() {
  const list = GHOST_FOUND_GIFS;
  return list[Math.floor(Math.random() * list.length)] || list[0];
}

function formatItalianMinutesBold(minutes) {
  const m = Math.max(1, Math.floor(Number(minutes) || 1));
  return `**${m} minut${m === 1 ? "o" : "i"}**`;
}

/** Embed del messaggio nascosto (bottone “Ho trovato il fantasma!”). */
function buildHalloweenFindGhostFoundEmbed(rewardExp, durationMs) {
  const minutes = Math.max(1, Math.round(Number(durationMs || 0) / 60000));
  const exp = Math.max(0, Math.floor(Number(rewardExp) || 0));
  const gif = pickGhostFoundGif();
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle("👻 Fantasma trovato?")
    .setDescription(
      [
        `<:VC_EXP:1482534670896730143> Hai trovato il messaggio nascosto: clicca il bottone per ottenere **${exp} exp**.`,
        `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per cliccare il bottone.`,
        `> <a:VC_Winner:1482535294757507255> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`,
      ].join("\n"),
    )
    .setFooter({ text: "© 2026 Vinili & Caffè. Tutti i diritti riservati." });
  if (gif) embed.setImage(gif);
  return embed;
}

module.exports = {
  GHOST_FOUND_GIFS,
  pickGhostFoundGif,
  buildHalloweenFindGhostFoundEmbed,
};
