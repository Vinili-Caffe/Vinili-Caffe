const { EmbedBuilder } = require("discord.js");
const IDs = require("../Config/ids");

const TICKET_UX_COLOR = "#6f4e37";
const TICKET_ALERT = "<a:VC_Alert:1482706673176150077>";
const TICKET_X = "<:vegax:1443934876440068179>";
const TICKET_ATTENTION = "<:VC_Attention:1482534443632558151>";
const TICKET_FILE = "<:VC_file:1478515880722698300>";
const TICKET_ICON = "<:VC_Ticket:1482535175283019888>";
const TICKET_OPEN = "<:VC_open:1478517277279129712>";
const TICKET_CLAIM = "<:VC_claim:1478517202016669887>";
const MAIN_HIGH_STAFF_HELP_CHANNEL = "1442569095068254219";

const DAY_IT = Object.freeze({
  monday: "Lunedì",
  tuesday: "Martedì",
  wednesday: "Mercoledì",
  thursday: "Giovedì",
  friday: "Venerdì",
  saturday: "Sabato",
  sunday: "Domenica",
});

function makeTicketErrorEmbed(title, description) {
  const rawTitle = String(title || "Errore").trim() || "Errore";
  const withAlert = rawTitle.includes("VC_Alert") ? rawTitle : `${TICKET_ALERT} ${rawTitle}`;
  return new EmbedBuilder()
    .setTitle(withAlert)
    .setDescription(String(description || "").trim() || `${TICKET_X} Operazione non riuscita.`)
    .setColor(TICKET_UX_COLOR);
}

function makeTicketSuccessEmbed(title, description) {
  return new EmbedBuilder()
    .setTitle(String(title || "").trim() || `${TICKET_ICON} • **__OK__**`)
    .setDescription(String(description || "").trim())
    .setColor(TICKET_UX_COLOR);
}

function resolveBlacklistHelpHint(guildId) {
  const gid = String(guildId || "").trim();
  const mainId = String(IDs?.guilds?.main || "").trim();
  const helpChannelId = String(IDs?.channels?.ticket || MAIN_HIGH_STAFF_HELP_CHANNEL).trim();
  if (mainId && gid === mainId && helpChannelId) {
    return `Se pensi sia un errore apri un <#${helpChannelId}> \`HIGH STAFF\`.`;
  }
  return "Se pensi sia un errore, contatta lo staff del server.";
}

function blacklistBlockedDescription(kind, guildId) {
  const help = resolveBlacklistHelpHint(guildId);
  if (kind === "partner") {
    return `${TICKET_ALERT} Non puoi usare questo bottone poiché sei blacklistato dalle partner. ${help}`;
  }
  return `${TICKET_X} Non puoi usare questo bottone poiché sei blacklistato dai ticket. ${help}`;
}

function formatSupportHoursSchedule(hours) {
  if (!hours || typeof hours !== "object") return "24/7";
  const days = hours.days || {};
  const tz = String(hours.timezone || "Europe/Rome").trim() || "Europe/Rome";
  const lines = [];
  for (const key of Object.keys(DAY_IT)) {
    const day = days[key];
    if (!day || day.enabled !== true) continue;
    const label = DAY_IT[key];
    if (day.allDay) lines.push(`• **${label}**: tutto il giorno`);
    else lines.push(`• **${label}**: ${day.start || "09:00"}–${day.end || "17:00"}`);
  }
  if (!lines.length) return "24/7";
  return `${lines.join("\n")}\n_Fuso: ${tz}_`;
}

function supportHoursBlockedDescription(hours, gate = {}) {
  const schedule = formatSupportHoursSchedule(hours);
  const dayLabel = DAY_IT[gate.day] || gate.day || "oggi";
  const tz = String(gate.timezone || hours?.timezone || "Europe/Rome").trim() || "Europe/Rome";
  if (gate.reason === "closed_hours" && gate.start && gate.end) {
    return (
      `${TICKET_ATTENTION} Questo pannello non è disponibile in questo momento.\n` +
      `Oggi (**${dayLabel}**) l'orario è **${gate.start}–${gate.end}** (${tz}).\n\n` +
      `**Orari di supporto**\n${schedule}`
    );
  }
  return (
    `${TICKET_ATTENTION} Questo pannello non è disponibile in questo momento` +
    (dayLabel ? ` (**${dayLabel}** chiuso)` : "") +
    `.\n\n**Orari di supporto**\n${schedule}`
  );
}

function transcriptReadyDescription(ticketNumber, options = {}) {
  const num = ticketNumber != null ? String(ticketNumber) : "?";
  const viewUrl = String(options.viewUrl || "").trim();
  const hasFile = options.hasFile === true;
  if (viewUrl) {
    return (
      `${TICKET_ICON} Transcript del ticket **#${num}**.\n\n` +
      `${TICKET_OPEN} Apri nel browser: ${viewUrl}` +
      (hasFile ? `\n\n${TICKET_FILE} In allegato anche il file HTML.` : "")
    );
  }
  if (hasFile) {
    return (
      `${TICKET_ICON} In allegato il file HTML del transcript del ticket **#${num}**.\n\n` +
      `${TICKET_OPEN} Apri il file nel browser per visualizzare la conversazione.`
    );
  }
  return `${TICKET_X} Transcript del ticket **#${num}** non disponibile.`;
}

function claimOverwriteWarnDescription() {
  return (
    `${TICKET_ATTENTION} Claim registrato, ma non è stato possibile aggiornare i permessi del canale.\n` +
    `Controlla che il bot abbia **Gestisci canali** / overwrite su questa categoria.`
  );
}

function closeDmFailedNote() {
  return (
    `\n\n${TICKET_ATTENTION} Non è stato possibile inviare il messaggio di chiusura in DM all'utente ` +
    `(DM chiusi o privacy).`
  );
}

module.exports = {
  TICKET_UX_COLOR,
  TICKET_ALERT,
  TICKET_X,
  TICKET_ATTENTION,
  TICKET_FILE,
  TICKET_ICON,
  TICKET_OPEN,
  TICKET_CLAIM,
  makeTicketErrorEmbed,
  makeTicketSuccessEmbed,
  resolveBlacklistHelpHint,
  blacklistBlockedDescription,
  formatSupportHoursSchedule,
  supportHoursBlockedDescription,
  transcriptReadyDescription,
  claimOverwriteWarnDescription,
  closeDmFailedNote,
};
