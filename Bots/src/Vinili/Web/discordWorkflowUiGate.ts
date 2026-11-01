const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js") as typeof import("discord.js");

const {
  sitePublicOrigin: sharedSitePublicOrigin,
  siteTicketsPageDiscordRef,
  siteUserProfilePageDiscordRef,
  siteUserProfilePagePlainRef,
} = require("../../shared/web/siteTicketsPageRef") as typeof import("../../shared/web/siteTicketsPageRef");
const EPHEMERAL = 1 << 6;

function envFlagOn(name?) {
  return ["1", "true", "yes", "on"].includes(String(process.env[name] || "").trim().toLowerCase());
}

function envFlagOff(name?) {
  return ["0", "false", "no", "off"].includes(String(process.env[name] || "").trim().toLowerCase());
}

function isDiscordWorkflowUiEnabled() {
  return envFlagOn("DISCORD_WORKFLOW_UI");
}

function isDiscordWorkflowChannelPostsEnabled() {
  if (envFlagOff("DISCORD_WORKFLOW_LOGS")) return false;
  if (envFlagOn("DISCORD_WORKFLOW_LOGS")) return true;
  return isDiscordWorkflowUiEnabled();
}

function isDiscordStaffChannelPostsEnabled() {
  return envFlagOn("DISCORD_STAFF_CHANNEL_POSTS");
}

function newSiteWorkflowMessageId() {
  try {
    const { Types } = require("mongoose") as typeof import("mongoose");
    return String(new Types.ObjectId());
  } catch {
    return `site${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`.slice(0, 24);
  }
}

function isWorkflowMessageId(id?) {
  const s = String(id || "").trim();
  return /^[a-f0-9]{24}$/i.test(s) || /^\d{16,22}$/.test(s);
}

function sitePublicOrigin() {
  return sharedSitePublicOrigin();
}

function siteAbsoluteUrl(pathOrUrl?) {
  const raw = String(pathOrUrl || "").trim();
  if (!raw) return sitePublicOrigin();
  if (/^https?:\/\//i.test(raw)) return raw;
  const origin = sitePublicOrigin();
  return `${origin}${raw.startsWith("/") ? raw : `/${raw}`}`;
}

const WORKFLOW_SITE_PATHS = {
  pause: "/staff/pause/",
  /* pauseResoNotifProfile1: pause/resoconti fuori inbox → profilo staff */
  pauseInbox: "/user/?tab=staff&staffOpen=pause",
  candidature: "/candidature/",
  candidatureInbox: "/staff/inbox/?tab=candidature",
  appelli: "/appelli/",
  appelliInbox: "/staff/inbox/?tab=appelli",
  resocontiInbox: "/user/?tab=staff&staffOpen=resoconto",
  inbox: "/staff/inbox/",
  staff: "/staff/",
  organico: "/staff/organico/",
  gestione: "/staff/organico/",
  puntiTolti: "/user/?tab=staff&staffOpen=pm-punti-tolti",
  guida: "/staff/guida/",
  compiti: "/staff/compiti/",
  tickets: "/tickets/",
  ticketsStaff: "/tickets/?view=staff",
  userProfile: "/user/",
  userPersonalize: "/personalizza/",
};

function isDiscordTicketsEnabled() {
  return envFlagOn("DISCORD_TICKETS_UI");
}

function siteWorkflowPath(kind?) {
  return WORKFLOW_SITE_PATHS[kind] || WORKFLOW_SITE_PATHS.inbox;
}

function siteWorkflowUrl(kind?) {
  return siteAbsoluteUrl(siteWorkflowPath(kind));
}

function buildSiteLinkRow(label?, pathOrUrl?) {
  const url = siteAbsoluteUrl(pathOrUrl);
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel(String(label || "Apri sul sito").slice(0, 80))
      .setURL(url),
  );
}

function subjectWorkflowChatPath(queue?, dedupeKey?) {
  const q = String(queue || "").trim().toLowerCase();
  const key = String(dedupeKey || "").trim();
  if (!key) return siteWorkflowPath(q === "appelli" ? "appelli" : "candidature");
  const base = q === "appelli" ? WORKFLOW_SITE_PATHS.appelli : WORKFLOW_SITE_PATHS.candidature;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}chat=${encodeURIComponent(key)}`;
}

function buildInboxManageLinkRow(queue?) {
  const map = {
    pause: "pauseInbox",
    candidature: "candidatureInbox",
    appelli: "appelliInbox",
    resoconti: "resocontiInbox",
  };
  const kind = map[String(queue || "").trim()] || "inbox";
  return buildSiteLinkRow("Gestisci sul sito", siteWorkflowPath(kind));
}

export = {
  isDiscordWorkflowUiEnabled,
  isDiscordWorkflowChannelPostsEnabled,
  isDiscordStaffChannelPostsEnabled,
  isDiscordTicketsEnabled,
  newSiteWorkflowMessageId,
  isWorkflowMessageId,
  sitePublicOrigin,
  siteWorkflowUrl,
  siteTicketsPageDiscordRef,
  siteUserProfilePageDiscordRef,
  siteUserProfilePagePlainRef,
  buildSiteLinkRow,
  subjectWorkflowChatPath,
  buildInboxManageLinkRow,
};
