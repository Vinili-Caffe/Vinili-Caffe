const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

const DEFAULT_SITE_ORIGIN = "https://www.viniliecaffe.it";
const {
  sitePublicOrigin: sharedSitePublicOrigin,
  siteTicketsPageUrl,
  siteTicketsPageDiscordRef,
  siteTicketsPagePlainRef,
  siteUserProfilePageUrl,
  siteUserProfilePageDiscordRef,
  siteUserProfilePagePlainRef,
} = require("../../../shared/web/siteTicketsPageRef");
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
  return sharedSitePublicOrigin();
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
  puntiTolti: "/notifications/?view=staff&inbox=punti-tolti",
  guida: "/staff/guida/",
  tickets: "/tickets/",
  ticketsStaff: "/tickets/?view=staff",
  userProfile: "/user/",
  userPersonalize: "/personalizza/",
};

function isDiscordProfileEnabled() {
  return envFlagOn("DISCORD_PROFILE_UI");
}

function isTenantPrefixProfileEmbedAllowed(guildId) {
  const gid = String(guildId || "").trim();
  if (!gid) return false;
  try {
    const { isViniliFullFeatureGuild } = require("../../MultiGuild/core/guildFeatureScope");
    if (isViniliFullFeatureGuild(gid)) return false;
  } catch {
    return false;
  }
  try {
    const {
      isPartnershipOperational,
      shouldBlockTenantPartnershipPrefixCommands,
      isTenantPartnershipPrefixToolkitEnabled,
    } = require("../Partner/partnershipConfigResolver");
    if (shouldBlockTenantPartnershipPrefixCommands(guildId)) return false;
    if (!isTenantPartnershipPrefixToolkitEnabled(guildId)) return false;
    return isPartnershipOperational(guildId);
  } catch {
    return false;
  }
}

function isDiscordTicketsEnabled() {
  return envFlagOn("DISCORD_TICKETS_UI");
}

function profileMovedToSiteMessage() {
  const url = siteWorkflowUrl("userPersonalize");
  let staffCmdsMention = "#staff-cmds";
  try {
    const IDs = require("../Config/ids");
    const id = String(IDs.channels?.staffCmds || "").trim();
    if (/^\d{16,20}$/.test(id)) staffCmdsMention = `<#${id}>`;
  } catch (_) {}
  return `<a:VC_Alert:1482706673176150077> Il **profilo community** si gestisce **solo sul sito**:\n${url}\n\nPartner Manager: usa \`+profile\` nel thread **Comandi Partner Manager** sotto ${staffCmdsMention}.`;
}

async function replyProfileMovedToSite(interaction) {
  const content = profileMovedToSiteMessage();
  const row = buildSiteLinkRow("Apri il tuo profilo", siteWorkflowPath("userPersonalize"));
  try {
    if (interaction?.deferred || interaction?.replied) {
      await interaction.followUp({ content, components: [row], flags: EPHEMERAL }).catch(() => null);
      return true;
    }
    await interaction.reply({ content, components: [row], flags: EPHEMERAL }).catch(() => null);
    return true;
  } catch {
    return false;
  }
}

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

function subjectWorkflowChatPath(queue, dedupeKey) {
  const q = String(queue || "").trim().toLowerCase();
  const key = String(dedupeKey || "").trim();
  if (!key) return siteWorkflowPath(q === "appelli" ? "appelli" : "candidature");
  const base = q === "appelli" ? WORKFLOW_SITE_PATHS.appelli : WORKFLOW_SITE_PATHS.candidature;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}chat=${encodeURIComponent(key)}`;
}

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
  isDiscordProfileEnabled,
  isTenantPrefixProfileEmbedAllowed,
  isDiscordTicketsEnabled,
  profileMovedToSiteMessage,
  replyProfileMovedToSite,
  newSiteWorkflowMessageId,
  isWorkflowMessageId,
  sitePublicOrigin,
  siteAbsoluteUrl,
  siteWorkflowPath,
  siteWorkflowUrl,
  siteTicketsPageUrl,
  siteTicketsPageDiscordRef,
  siteTicketsPagePlainRef,
  siteUserProfilePageUrl,
  siteUserProfilePageDiscordRef,
  siteUserProfilePagePlainRef,
  buildSiteLinkRow,
  subjectWorkflowChatPath,
  buildInboxManageLinkRow,
  workflowMovedToSiteMessage,
  replyWorkflowMovedToSite,
  WORKFLOW_SITE_PATHS,
};
