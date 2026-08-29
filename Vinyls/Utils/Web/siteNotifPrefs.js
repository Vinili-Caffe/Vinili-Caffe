"use strict";

const IDs = require("../Config/ids");
const { getProfile, upsertProfile } = require("../../Services/Community/profileStore");
const { shouldBlockDm } = require("../noDmList");

const SITE_NOTIF_GROUPS = Object.freeze([
  {
    key: "tickets",
    label: "Ticket/menzioni",
    hint: "",
    kinds: Object.freeze(["web_ticket", "web_ticket_mention"]),
  },
  {
    key: "reviews",
    label: "Recensioni",
    hint: "",
    kinds: Object.freeze(["review"]),
  },
  {
    key: "general",
    label: "Altri avvisi sito",
    hint: "",
    kinds: Object.freeze(["info", "success", "suggestion", "mod"]),
  },
]);

const SITE_NOTIF_GROUP_KEYS = Object.freeze(SITE_NOTIF_GROUPS.map((g) => g.key));
const KIND_TO_GROUP = (() => {
  const map = Object.create(null);
  for (const g of SITE_NOTIF_GROUPS) {
    for (const k of g.kinds) map[k] = g.key;
  }
  return Object.freeze(map);
})();

function resolveGuildId(guildId) {
  return String(guildId || IDs.guilds?.main || "").trim();
}

function normalizeMutedKinds(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const x of arr) {
    const k = String(x || "").trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    if (!KIND_TO_GROUP[k]) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

async function getMutedKinds(guildId, userId) {
  const gid = resolveGuildId(guildId);
  const uid = String(userId || "").trim();
  if (!gid || !uid) return [];
  const doc = await getProfile(gid, uid, "profile.siteNotifPrefs").catch(() => null);
  return normalizeMutedKinds(doc?.profile?.siteNotifPrefs?.mutedKinds);
}

async function setMutedKinds(guildId, userId, mutedKinds) {
  const gid = resolveGuildId(guildId);
  const uid = String(userId || "").trim();
  if (!gid || !uid) return [];
  const next = normalizeMutedKinds(mutedKinds);
  await upsertProfile(gid, uid, {
    $set: { "profile.siteNotifPrefs.mutedKinds": next },
  });
  return next;
}

function serializeSiteNotifPrefs(mutedKinds) {
  const muted = new Set(normalizeMutedKinds(mutedKinds));
  return {
    groups: SITE_NOTIF_GROUPS.map((g) => {
      const enabled = !g.kinds.some((k) => muted.has(k));
      return {
        key: g.key,
        label: g.label,
        hint: g.hint || "",
        enabled,
        kinds: [...g.kinds],
      };
    }),
  };
}

async function getSerializedSiteNotifPrefs(guildId, userId) {
  const muted = await getMutedKinds(guildId, userId).catch(() => []);
  return serializeSiteNotifPrefs(muted);
}

async function mutateSiteNotifPrefs(guildId, userId, payload) {
  const action = String(payload?.action || "").trim();
  const muted = new Set(await getMutedKinds(guildId, userId).catch(() => []));

  if (action === "all_on") {
    await setMutedKinds(guildId, userId, []);
  } else if (action === "all_off") {
    const allKinds = SITE_NOTIF_GROUPS.flatMap((g) => g.kinds);
    await setMutedKinds(guildId, userId, allKinds);
  } else if (action === "toggle") {
    const key = String(payload?.key || "").trim();
    const group = SITE_NOTIF_GROUPS.find((g) => g.key === key);
    if (!group) return { ok: false, reason: "invalid_params", message: "Gruppo notifiche sito non valido." };
    const isEnabled = !group.kinds.some((k) => muted.has(k));
    if (isEnabled) {
      for (const k of group.kinds) muted.add(k);
    } else {
      for (const k of group.kinds) muted.delete(k);
    }
    await setMutedKinds(guildId, userId, [...muted]);
  } else {
    return { ok: false, reason: "invalid_action", message: "Azione notifiche sito non valida." };
  }

  const prefs = await getSerializedSiteNotifPrefs(guildId, userId);
  return { ok: true, siteNotif: prefs, message: "Preferenze notifiche sito aggiornate." };
}

function isKindMuted(mutedKinds, kind) {
  const k = String(kind || "").trim().toLowerCase();
  if (!k) return false;
  return normalizeMutedKinds(mutedKinds).includes(k);
}

/**
 * Infer vote listing (topgg | discadia) from vote_reminder payload fields.
 */
function inferVoteListingFromNotif({ title, body, dedupeKey, openUrl } = {}) {
  const blob = [title, body, dedupeKey, openUrl]
    .map((x) => String(x || "").toLowerCase())
    .join(" ");
  if (/top\.?gg|topgg|vote_topgg|_topgg|topgg/.test(blob)) return "topgg";
  if (/discadia|_discadia|bump/.test(blob)) return "discadia";
  if (/topgg/.test(String(dedupeKey || "").toLowerCase())) return "topgg";
  if (/discadia/.test(String(dedupeKey || "").toLowerCase())) return "discadia";
  return "discadia";
}

/**
 * True if this in-app item is muted by site/DM prefs (soft-filter).
 * Soft-filtered items are still stored, but skip push and stay out of the bell;
 * they appear only on /notifications under the "Filtrate" view.
 * Pass preloaded mutedKinds / voteBlocked to avoid repeated DB reads.
 */
async function shouldSkipSiteInAppNotif(
  guildId,
  userId,
  { kind, title, body, dedupeKey, openUrl, mutedKinds, voteBlocked } = {},
) {
  const gid = resolveGuildId(guildId);
  const uid = String(userId || "").trim();
  if (!uid) return false;

  const k = String(kind || "info").trim().toLowerCase();

  if (k === "vote_reminder") {
    const listing = inferVoteListingFromNotif({ title, body, dedupeKey, openUrl });
    const category = listing === "topgg" ? "vote_topgg" : "bump";
    if (voteBlocked && typeof voteBlocked === "object") {
      if (voteBlocked[category]) return true;
    } else if (gid && (await shouldBlockDm(gid, uid, category).catch(() => false))) {
      return true;
    }
  }

  if (KIND_TO_GROUP[k]) {
    const muted = Array.isArray(mutedKinds)
      ? normalizeMutedKinds(mutedKinds)
      : await getMutedKinds(gid, uid).catch(() => []);
    if (isKindMuted(muted, k)) return true;
  }

  return false;
}

async function buildSkipContext(guildId, userId) {
  const gid = resolveGuildId(guildId);
  const uid = String(userId || "").trim();
  const mutedKinds = uid ? await getMutedKinds(gid, uid).catch(() => []) : [];
  const voteBlocked = { bump: false, vote_topgg: false };
  if (gid && uid) {
    voteBlocked.bump = await shouldBlockDm(gid, uid, "bump").catch(() => false);
    voteBlocked.vote_topgg = await shouldBlockDm(gid, uid, "vote_topgg").catch(() => false);
  }
  return { mutedKinds, voteBlocked };
}

/**
 * Se la push web è attiva e la notifica sito non è soft-filtrata, evita il DM Discord
 * duplicato (stesso evento già in campanella + OS push).
 */
async function shouldSkipDiscordDmForActiveWebPush(guildId, userId, notifMeta = {}) {
  const uid = String(userId || "").trim();
  if (!uid) return false;
  const soft = await shouldSkipSiteInAppNotif(guildId, uid, notifMeta).catch(() => false);
  if (soft) return false;
  const { userHasActiveWebPush } = require("./siteWebPushService");
  return userHasActiveWebPush(uid).catch(() => false);
}

module.exports = {
  SITE_NOTIF_GROUPS,
  SITE_NOTIF_GROUP_KEYS,
  KIND_TO_GROUP,
  getMutedKinds,
  setMutedKinds,
  serializeSiteNotifPrefs,
  getSerializedSiteNotifPrefs,
  mutateSiteNotifPrefs,
  isKindMuted,
  inferVoteListingFromNotif,
  shouldSkipSiteInAppNotif,
  buildSkipContext,
  shouldSkipDiscordDmForActiveWebPush,
};
