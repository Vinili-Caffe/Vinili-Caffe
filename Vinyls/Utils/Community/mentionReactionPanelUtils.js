const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

const MAX_REACTIONS = 3;

function parseReactionTokens(input, max = MAX_REACTIONS, guild = null) {
  const text = String(input || "").trim();
  if (!text) return [];
  const out = [];
  const customRegex = /<a?:[a-zA-Z0-9_]{2,}:(\d{16,20})>/g;
  let match;
  while ((match = customRegex.exec(text)) !== null) {
    out.push(`custom:${match[1]}`);
  }
  const cleaned = text.replace(customRegex, " ").trim();

  const nameOnlyRegex = /:([a-zA-Z0-9_]{2,32}):/g;
  const processedText = guild
    ? cleaned.replace(nameOnlyRegex, (m, name) => {
      const found = guild.emojis.cache.find(e => e.name === name);
      if (found) {
        out.push(`custom:${found.id}`);
        return " ";
      }
      return m;
    })
    : cleaned;

  const segments = new Intl.Segmenter(undefined, { granularity: "grapheme" });

  for (const part of processedText.split(/\s+/).filter(Boolean)) {
    if (/^\d{16,20}$/.test(part)) {
      out.push(`custom:${part}`);
    } else if (part.startsWith(":") && part.endsWith(":") && part.length > 2) {
      continue;
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
        .setEmoji(`<:VC_emoji:1485419161168511036>`)
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`customreaction_remove:${safeOwner}`)
        .setLabel("Rimuovi")
        .setEmoji(`<:VC_emoji:1485419161168511036>`)
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`customreaction_clear:${safeOwner}`)
        .setLabel("Azzera tutto")
        .setEmoji(`<:VC_delete:1485421886589501511>`)
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