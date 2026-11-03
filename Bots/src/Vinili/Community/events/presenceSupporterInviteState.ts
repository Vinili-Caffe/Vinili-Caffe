const { ActivityType } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const {
  textHasSupporterStatusLink,
  normalizeSupporterStatusText,
} = require("../../Community/utils/supporterStatusLink") as typeof import("../../Community/utils/supporterStatusLink");

const MAIN_GUILD_ID = String(IDs.guilds?.main || "");
const ROLE_ID = IDs.roles.Fan;
const PERK_ROLE_ID = IDs.roles.PicPerms;
const CHANNEL_ID = IDs.channels.supporters;
const KNOWN_BOT_IDS = new Set(
  Object.values(IDs.bots || {})
    .map((id?) => String(id || "").trim())
    .filter(Boolean),
);
const STABLE_NO_INVITE_MS = 75 * 1000;

function isBotMember(member?) {
  if (!member) return true;
  if (KNOWN_BOT_IDS.has(String(member.id || ""))) return true;
  const user = member.user || member.client?.users?.cache?.get(member.id);
  if (user?.bot) return true;
  return false;
}

function getActivitiesArray(presence?) {
  const list = presence?.activities;
  return Array.isArray(list) ? list : [];
}

const RICH_PRESENCE_TYPES = new Set([ActivityType.Playing, ActivityType.Streaming, ActivityType.Listening, ActivityType.Watching]);

function hasRichPresenceWithoutCustom(presence?) {
  const list = getActivitiesArray(presence);
  if (!list.length) return false;
  let hasRich = false;
  let hasCustom = false;
  for (const a of list) {
    const t = Number(a?.type);
    if (t === ActivityType.Custom) hasCustom = true;
    if (RICH_PRESENCE_TYPES.has(t)) hasRich = true;
  }
  return hasRich && !hasCustom;
}

function collectActivitySearchStrings(activity?) {
  if (!activity || typeof activity !== "object") return [];
  const parts = [];
  const push = (v?) => {
    if (v == null || v === "") return;
    if (typeof v === "string") {
      const t = v.trim();
      if (t) parts.push(t);
      return;
    }
    if (typeof v === "number" && Number.isFinite(v)) parts.push(String(v));
  };
  push(activity.state);
  push(activity.name);
  push(activity.details);
  push(activity.url);
  const assets = activity.assets;
  if (assets && typeof assets === "object") {
    push(assets.largeText);
    push(assets.smallText);
  }
  const btns = activity.buttons;
  if (Array.isArray(btns)) {
    for (const b of btns) {
      if (typeof b === "string") push(b);
      else if (b && typeof b === "object") {
        push(b.label);
        push(b.url);
      }
    }
  }
  return parts;
}

function normalizeStatusForMatch(text?) {
  return normalizeSupporterStatusText(text);
}

function allActivitiesSearchText(presence?) {
  const list = getActivitiesArray(presence);
  if (!list.length) return "";
  return list.flatMap((a?) => collectActivitySearchStrings(a)).join(" ");
}

function hasInvite(presence?) {
  const blob = normalizeStatusForMatch(allActivitiesSearchText(presence));
  return textHasSupporterStatusLink(blob);
}

function hasCustomActivity(presence?) {
  return getActivitiesArray(presence).some((a?) => Number(a?.type) === ActivityType.Custom);
}

function isCustomStatusTextMissing(presence?) {
  const customs = getActivitiesArray(presence).filter((a?) => Number(a?.type) === ActivityType.Custom);
  if (!customs.length) return false;
  for (const a of customs) {
    for (const raw of collectActivitySearchStrings(a)) {
      const t = normalizeStatusForMatch(raw).replace(/[^a-z0-9./]/g, "");
      if (!t || t === "customstatus") continue;
      return false;
    }
  }
  return true;
}

function getInviteState(presence?, prevHas = false) {
  if (!presence) return null;
  if (isOfflinePresence(presence)) return null;
  if (hasInvite(presence)) return true;
  if (!getActivitiesArray(presence).length && prevHas) return null;
  if (prevHas && hasRichPresenceWithoutCustom(presence)) return null;
    if (prevHas && hasCustomActivity(presence) && isCustomStatusTextMissing(presence)) return null;
  return false;
}

function readInvitePresence(presence?, assumeHadLink = false) {
  return getInviteState(presence, assumeHadLink);
}

function resolveInviteState(presence?, fallback = false) {
  const inviteState = getInviteState(presence, fallback);
  if (inviteState === null) return Boolean(fallback);
  return inviteState;
}

function computeSupporterLinkState(prev: Record<string, any> = {}, presence?) {
  const prevHas = typeof prev?.hasLink === "boolean" ? prev.hasLink : false;
  let inviteMissSince = prev?.inviteMissSince != null ? prev.inviteMissSince : null;

  if (!presence || isOfflinePresence(presence)) {
    return { newHas: prevHas, inviteMissSince };
  }

  const inviteState = getInviteState(presence, prevHas);
  if (inviteState === null) {
    return { newHas: prevHas, inviteMissSince };
  }
  if (inviteState === true) {
    return { newHas: true, inviteMissSince: null };
  }

  if (prevHas) {
    if (inviteMissSince == null) inviteMissSince = Date.now();
    if (Date.now() - inviteMissSince >= STABLE_NO_INVITE_MS) {
      return { newHas: false, inviteMissSince: null };
    }
    return { newHas: true, inviteMissSince };
  }

  return { newHas: false, inviteMissSince: null };
}

function isOfflinePresence(presence?) {
  return !presence || ["offline", "invisible"].includes(presence.status);
}

export = {
  MAIN_GUILD_ID,
  ROLE_ID,
  PERK_ROLE_ID,
  CHANNEL_ID,
  STABLE_NO_INVITE_MS,
  isBotMember,
  hasInvite,
  isOfflinePresence,
  readInvitePresence,
  resolveInviteState,
  computeSupporterLinkState,
};
