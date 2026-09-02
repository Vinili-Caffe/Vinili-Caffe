const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const IDs = require("../Config/ids");

const MAX_REACTIONS = 3;
const MAX_REACTIONS_PREMIUM = 5;
const CUSTOM_REACTION_FIVE_ROLE_IDS = [
  IDs?.roles?.DoubleBooster,
  IDs?.roles?.VIPplus,
  IDs?.roles?.["VIP+"],
].filter(Boolean);

const CUSTOM_REACTION_ROLE_IDS = [
  IDs?.roles?.VIP,
  IDs?.roles?.DoubleBooster,
  IDs?.roles?.ServerBooster,
  IDs?.roles?.Level70,
  IDs?.roles?.VIPplus,
].filter(Boolean);

function memberHasCustomReactionRoleAccess(member) {
  return Boolean(
    member?.roles?.cache && CUSTOM_REACTION_ROLE_IDS.some((roleId) => member.roles.cache.has(roleId)),
  );
}

function getCustomReactionMax(member) {
  if (!member?.roles?.cache) return MAX_REACTIONS;
  return CUSTOM_REACTION_FIVE_ROLE_IDS.some((roleId) => member.roles.cache.has(roleId))
    ? MAX_REACTIONS_PREMIUM
    : MAX_REACTIONS;
}

function findEmojiByShortName(guild, shortName) {
  const name = String(shortName || "");
  if (!name || !guild?.emojis?.cache) return null;
  const local = guild.emojis.cache.find((e) => e.name === name);
  if (local) return local;
  const client = guild.client;
  if (!client?.guilds?.cache) return null;
  const candidates = [];
  for (const g of client.guilds.cache.values()) {
    if (String(g.id) === String(guild.id)) continue;
    const e = g.emojis?.cache?.find((em) => em.name === name);
    if (e) candidates.push(e);
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => String(a.guild?.id || "").localeCompare(String(b.guild?.id || "")));
  return candidates[0];
}

function resolveStoredCustomEmojiFromClient(client, emojiId) {
  const id = String(emojiId || "").trim();
  if (!/^\d{16,20}$/.test(id) || !client?.guilds?.cache) return null;
  for (const g of client.guilds.cache.values()) {
    const e = g.emojis?.cache?.get(id);
    if (e) return e;
  }
  return null;
}

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
      const found = findEmojiByShortName(guild, name);
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

function toDisplay(token, clientOrGuild = null) {
  const raw = String(token || "");
  if (raw.startsWith("custom:")) {
    const id = raw.slice("custom:".length);
    const client = clientOrGuild?.client || clientOrGuild;
    const guild = clientOrGuild?.emojis ? clientOrGuild : null;
    const emoji =
      (guild?.emojis?.cache?.get?.(id) || null) ||
      resolveStoredCustomEmojiFromClient(client, id) ||
      null;
    if (emoji?.id) {
      const name = String(emoji.name || "emoji").replace(/[^\w]/g, "").slice(0, 32) || "emoji";
      return `<${emoji.animated ? "a" : ""}:${name}:${emoji.id}>`;
    }
            return `\`custom:${id}\``;
  }
  if (raw.startsWith("unicode:")) {
    return raw.slice("unicode:".length);
  }
  return raw;
}

function buildCustomReactionPanelEmbed(reactions, maxReactions = MAX_REACTIONS, clientOrGuild = null) {
  const current = Array.isArray(reactions) ? reactions : [];
  const safeMax = Math.max(1, Number(maxReactions) || MAX_REACTIONS);
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Reaction alle menzioni")
    .setDescription(
      current.length
        ? `Le tue reaction (${current.length}/${safeMax}): ${current.map((t) => toDisplay(t, clientOrGuild)).join(" ")}`
        : `Nessuna reaction attiva. Usa **Aggiungi** per impostarne fino a ${safeMax}.`,
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
  MAX_REACTIONS_PREMIUM,
  CUSTOM_REACTION_ROLE_IDS,
  CUSTOM_REACTION_FIVE_ROLE_IDS,
  memberHasCustomReactionRoleAccess,
  getCustomReactionMax,
  parseReactionTokens,
  findEmojiByShortName,
  resolveStoredCustomEmojiFromClient,
  toDisplay,
  buildCustomReactionPanelEmbed,
  buildCustomReactionPanelRows,
};