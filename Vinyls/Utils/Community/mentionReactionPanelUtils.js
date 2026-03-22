const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

const MAX_REACTIONS = 3;

function parseReactionTokens(input, max = MAX_REACTIONS) {
  const text = String(input || "").trim();
  if (!text) return [];
  const out = [];
  const customRegex = /<a?:[a-zA-Z0-9_]{2,}:(\d{16,20})>/g;
  let match;
  while ((match = customRegex.exec(text)) !== null) {
    out.push(`custom:${match[1]}`);
  }
  const cleaned = text.replace(customRegex, " ").trim();
  const segments = new Intl.Segmenter(undefined, { granularity: "grapheme" });

  for (const part of cleaned.split(/\s+/).filter(Boolean)) {
    if (/^\d{16,20}$/.test(part)) {
      out.push(`custom:${part}`);
    } else {
      for (const seg of segments.segment(part)) {
        const char = seg.segment.trim();
        if (char) out.push(`unicode:${char}`);
      }
    }
  }
  return Array.from(new Set(out)).slice(0, max);
}

function toDisplay(token) {
  if (String(token).startsWith("custom:")) {
    const id = token.slice("custom:".length);
    return `<:emoji:${id}>`;
  }
  if (String(token).startsWith("unicode:")) {
    return token.slice("unicode:".length);
  }
  return token;
}

function buildCustomReactionPanelEmbed(reactions) {
  const current = Array.isArray(reactions) ? reactions : [];
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Reaction alle menzioni")
    .setDescription(
      current.length
        ? `Le tue reaction (${current.length}/${MAX_REACTIONS}): ${current.map(toDisplay).join(" ")}`
        : "Nessuna reaction attiva. Usa **Aggiungi** per impostarne fino a tre.",
    )
    .setFooter({ text: "Il bot aggiunge queste reaction solo quando sei menzionato nel messaggio." });
}

function buildCustomReactionPanelRows(ownerId) {
  const safeOwner = String(ownerId || "").trim();
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`customreaction_add:${safeOwner}`)
        .setLabel("Aggiungi")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`customreaction_remove:${safeOwner}`)
        .setLabel("Rimuovi")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`customreaction_clear:${safeOwner}`)
        .setLabel("Azzera tutto")
        .setStyle(ButtonStyle.Danger),
    ),
  ];
}

module.exports = {
  MAX_REACTIONS,
  parseReactionTokens,
  toDisplay,
  buildCustomReactionPanelEmbed,
  buildCustomReactionPanelRows,
};