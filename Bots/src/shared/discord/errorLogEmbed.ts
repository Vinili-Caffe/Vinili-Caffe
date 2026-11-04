const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { E } = require("../emojis/emojiCatalog") as typeof import("../emojis/emojiCatalog");
const EMBED_FIELD_VALUE_MAX = 1024;
const EMBED_FIELD_NAME_MAX = 256;
const ERROR_TEXT_MAX = EMBED_FIELD_VALUE_MAX - 10;

function getFullErrorText(error?) {
  const raw = error?.stack || error?.message || String(error);
  return typeof raw === "string" ? raw : String(raw);
}

function truncateFieldValue(value?, max = EMBED_FIELD_VALUE_MAX) {
  const str = typeof value === "string" ? value : String(value ?? "");
  if (str.length <= max) return str;
  return `${str.slice(0, max - 3)}...`;
}

function buildErrorLogEmbed({ contextLabel, contextValue, userTag, error, title = `${E.VC_Alert} Log errori`, serverName = null, }) {
  const fullError = getFullErrorText(error);
  const errorInBlock = fullError.length > ERROR_TEXT_MAX ? `${fullError.slice(0, ERROR_TEXT_MAX)}...` : fullError;
  const safeContext = truncateFieldValue(contextValue || "—", EMBED_FIELD_VALUE_MAX - 6);
  const safeUserTag = truncateFieldValue(userTag || "—", EMBED_FIELD_VALUE_MAX - 6);
  const safeLabel = truncateFieldValue(contextLabel || "Contesto", EMBED_FIELD_NAME_MAX - 30);
  const safeTitle = truncateFieldValue(title || `${E.VC_Alert} Log errori`, EMBED_FIELD_NAME_MAX);
  const safeServer = truncateFieldValue(serverName || "—", EMBED_FIELD_VALUE_MAX - 6);

  return new EmbedBuilder().setColor("#6f4e37").setTitle(safeTitle).addFields({ name: `${E.VC_Poll} ${safeLabel}`, value: `\`\`\`${safeContext}\`\`\`` }, { name: `${E.VC_Channel} Server`, value: `\`\`\`${safeServer}\`\`\`` }, { name: `${E.member_role_icon} Utente`, value: `\`\`\`${safeUserTag}\`\`\`` }, { name: `${E.VC_Alert} Errore`, value: `\`\`\`${errorInBlock}\`\`\`` }).setTimestamp();
}

export = { buildErrorLogEmbed };