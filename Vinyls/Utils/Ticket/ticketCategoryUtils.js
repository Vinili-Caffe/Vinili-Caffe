const { ChannelType } = require("discord.js");
const TICKETS_CATEGORY_NAME = "⁰⁰・ 　　 　　TICKETS 　　　　　 ・";
const TICKETS_OVERFLOW_SEPARATOR = " • ";

function normalizeCategoryName(name) {
  return String(name || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isTicketCategoryName(name) {
  const normalized = normalizeCategoryName(name);
  if (!normalized) return false;
  if (normalized === normalizeCategoryName(TICKETS_CATEGORY_NAME)) return true;
  if (normalized.includes("tickets")) return true;
  if (normalized.includes("ticket")) return true;
  return false;
}

/** Dashboard mostra "Tickets"; su Discord creiamo/riusiamo il nome fancy storico. */
function resolveDiscordTicketCategoryName(dashboardOrDiscordName) {
  const raw = String(dashboardOrDiscordName || "").trim();
  if (!raw) return TICKETS_CATEGORY_NAME;
  const normalized = normalizeCategoryName(raw);
  if (
    normalized === "tickets" ||
    normalized === normalizeCategoryName(TICKETS_CATEGORY_NAME)
  ) {
    return TICKETS_CATEGORY_NAME;
  }
  return raw.slice(0, 100);
}

function buildOverflowTicketCategoryName(index) {
  return `${TICKETS_CATEGORY_NAME}${TICKETS_OVERFLOW_SEPARATOR}${index}`;
}

function isChannelInTicketCategory(channel) {
  if (!channel?.guild?.channels?.cache) return false;
  const cache = channel.guild.channels.cache;
  const first = channel.parent ?? (channel.parentId ? cache.get(channel.parentId) : null);
  if (!first) return false;

  const category = first.type === ChannelType.GuildCategory ? first : first.parentId ? cache.get(first.parentId) : null;
  if (!category || !category.name) return false;
  return isTicketCategoryName(category.name);
}

const TICKET_CHANNEL_TYPE_MARKERS = ["partnership", "supporto", "highstaff", "perks"];

function isTicketChannelName(name) {
  const raw = String(name || "");
  const normalized = raw.toLowerCase();
  if (!normalized) return false;
  if (normalized.includes("᲼") || raw.includes("︲")) {
    return TICKET_CHANNEL_TYPE_MARKERS.some((marker) => normalized.includes(marker));
  }
  return TICKET_CHANNEL_TYPE_MARKERS.some((marker) => normalized.startsWith(`${marker}-`) || normalized.startsWith(`${marker} `));
}

module.exports = {
  TICKETS_CATEGORY_NAME,
  TICKETS_OVERFLOW_SEPARATOR,
  TICKET_CHANNEL_TYPE_MARKERS,
  buildOverflowTicketCategoryName,
  isChannelInTicketCategory,
  isTicketCategoryName,
  isTicketChannelName,
  resolveDiscordTicketCategoryName,
  normalizeCategoryName,
};