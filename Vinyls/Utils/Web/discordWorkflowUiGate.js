const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

/**
 * Gate UI Discord per pause / candidature / appelli / resoconti.
 * Default OFF: create/review solo sul sito, senza post nei canali Discord.
 * - DISCORD_WORKFLOW_UI=1 → bottoni + post Discord (canali devono esistere)
 * - DISCORD_WORKFLOW_LOGS=1 → solo post log (senza bottoni), anche se UI off
 * - DISCORD_WORKFLOW_LOGS=0 → forza zero post anche se UI on
 *
 * Post canali staff legacy (staff-list, pex-depex, valutazioni, warn, resoconti, punti-tolti):
 * - Default OFF (dati solo Mongo / sito)
 * - DISCORD_STAFF_CHANNEL_POSTS=1 per riattivare
 */
const DEFAULT_SITE_ORIGIN = "https://www.viniliecaffe.it";
const EPHEMERAL = 1 << 6;

function envFlagOn(name) {
  return ["1", "true", "yes", "on"].includes(String(process.env[name] || "").trim().toLowerCase());
}

function envFlagOff(name) {
  return ["0", "false", "no", "off"].includes(String(process.env[name] || "").trim().toLowerCase());
}

function isDiscordWorkflowUiEnabled() {
  return envFlagOn("DISCORD_WORKFLOW_UI");
}

/** Post nei canali pause / visioneModuli / resoconti. Default: solo se UI Discord attiva. */
function isDiscordWorkflowChannelPostsEnabled() {
  if (envFlagOff("DISCORD_WORKFLOW_LOGS")) return false;
  if (envFlagOn("DISCORD_WORKFLOW_LOGS")) return true;
  return isDiscordWorkflowUiEnabled();
}

/**
 * Post Discord su canali staff legacy.
 * Staff-list, pex/depex, valutazioni/warn, resoconti, punti-tolti.
 * Default OFF.
 */
function isDiscordStaffChannelPostsEnabled() {
  return envFlagOn("DISCORD_STAFF_CHANNEL_POSTS");
}

function newSiteWorkflowMessageId() {
  try {
    const { Types } = require("mongoose");
    return String(new Types.ObjectId());
  } catch {
    return `site${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`.slice(0, 24);
  }
}

function isWorkflowMessageId(id) {
  const s = String(id || "").trim();
  return /^[a-f0-9]{24}$/i.test(s) || /^\d{16,22}$/.test(s);
}

function sitePublicOrigin() {
  const raw = String(
    process.env.WEBSITE_PUBLIC_ORIGIN || process.env.WEBSITE_PUBLIC_URL || DEFAULT_SITE_ORIGIN,
  ).trim();
  try {
    const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return u.origin.replace("://viniliecaffe.it", "://www.viniliecaffe.it");
  } catch {
    return DEFAULT_SITE_ORIGIN;
  }
}

function siteAbsoluteUrl(pathOrUrl) {
  const raw = String(pathOrUrl || "").trim();
  if (!raw) return sitePublicOrigin();
  if (/^https?:\/\//i.test(raw)) return raw;
  const origin = sitePublicOrigin();
  return `${origin}${raw.startsWith("/") ? raw : `/${raw}`}`;
}

const WORKFLOW_SITE_PATHS = {
  pause: "/staff/pause/",
  pauseInbox: "/staff/inbox/?tab=pause",
  candidature: "/candidature/",
  candidatureInbox: "/staff/inbox/?tab=candidature",
  appelli: "/appelli/",
  appelliInbox: "/staff/inbox/?tab=appelli",
  resocontiInbox: "/staff/inbox/?tab=resoconti",
  inbox: "/staff/inbox/",
  staff: "/staff/",
  organico: "/staff/organico/",
  gestione: "/staff/organico/",
  puntiTolti: "/staff/punti-tolti/",
  guida: "/staff/guida/",
  tickets: "/tickets/",
  ticketsStaff: "/staff/ticket/",
};

function siteWorkflowPath(kind) {
  return WORKFLOW_SITE_PATHS[kind] || WORKFLOW_SITE_PATHS.inbox;
}

function siteWorkflowUrl(kind) {
  return siteAbsoluteUrl(siteWorkflowPath(kind));
}

function buildSiteLinkRow(label, pathOrUrl) {
  const url = siteAbsoluteUrl(pathOrUrl);
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel(String(label || "Apri sul sito").slice(0, 80))
      .setURL(url),
  );
}

/** Deep-link chat richiedente (?chat=<dedupeKey>) su candidature / appelli. */
function subjectWorkflowChatPath(queue, dedupeKey) {
  const q = String(queue || "").trim().toLowerCase();
  const key = String(dedupeKey || "").trim();
  if (!key) return siteWorkflowPath(q === "appelli" ? "appelli" : "candidature");
  const base = q === "appelli" ? WORKFLOW_SITE_PATHS.appelli : WORKFLOW_SITE_PATHS.candidature;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}chat=${encodeURIComponent(key)}`;
}

/** Link "gestisci in inbox" per i log Discord (senza bottoni Accetta/Rifiuta). */
function buildInboxManageLinkRow(queue) {
  const map = {
    pause: "pauseInbox",
    candidature: "candidatureInbox",
    appelli: "appelliInbox",
    resoconti: "resocontiInbox",
  };
  const kind = map[String(queue || "").trim()] || "inbox";
  return buildSiteLinkRow("Gestisci sul sito", siteWorkflowPath(kind));
}

function workflowMovedToSiteMessage(kind) {
  const url = siteWorkflowUrl(kind);
  return `<a:VC_Alert:1482706673176150077> Questa pratica si gestisce **solo sul sito**:\n${url}`;
}

async function replyWorkflowMovedToSite(interaction, kind) {
  const content = workflowMovedToSiteMessage(kind);
  try {
    if (interaction?.deferred || interaction?.replied) {
      await interaction.followUp({ content, flags: EPHEMERAL }).catch(() => null);
      return true;
    }
    await interaction.reply({ content, flags: EPHEMERAL }).catch(() => null);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  isDiscordWorkflowUiEnabled,
  isDiscordWorkflowChannelPostsEnabled,
  isDiscordStaffChannelPostsEnabled,
  newSiteWorkflowMessageId,
  isWorkflowMessageId,
  sitePublicOrigin,
  siteAbsoluteUrl,
  siteWorkflowPath,
  siteWorkflowUrl,
  buildSiteLinkRow,
  subjectWorkflowChatPath,
  buildInboxManageLinkRow,
  workflowMovedToSiteMessage,
  replyWorkflowMovedToSite,
  WORKFLOW_SITE_PATHS,
};
