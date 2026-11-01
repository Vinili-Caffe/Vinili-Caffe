"use strict";

const IDs = require("../Utils/Config/ids") as typeof import("../Utils/Config/ids");
const { getProfile, upsertProfile } = require("../Services/Community/profileStore") as typeof import("../Services/Community/profileStore");
const { shouldBlockDm } = require("../Utils/noDmList") as typeof import("../Utils/noDmList");
const { memberHasStaffRole } = require("../Utils/Community/staffListUtils") as typeof import("../Utils/Community/staffListUtils");

/* notifUseful1: extended site notif groups + digest queue toggles */
const SITE_NOTIF_GROUPS = Object.freeze([
  {
    key: "tickets",
    label: "Ticket",
    hint: "Aggiornamenti ticket (risposte, chiusura, serve risposta)",
    kinds: Object.freeze(["web_ticket"]),
  },
  {
    key: "mentions",
    label: "Menzioni @",
    hint: "Quando vieni menzionato in ticket o chat workflow",
    kinds: Object.freeze(["web_ticket_mention", "workflow_mention"]),
  },
  {
    key: "reviews",
    label: "Recensioni",
    hint: "",
    kinds: Object.freeze(["review"]),
  },
  {
    key: "workflow_decision",
    label: "Esiti candidature/appelli",
    hint: "Accettazione o rifiuto della tua candidatura o appello",
    kinds: Object.freeze(["workflow_decision"]),
  },
  {
    key: "ticket_sla",
    label: "Ticket SLA",
    hint: "Ticket non presi o in attesa troppo a lungo",
    kinds: Object.freeze(["web_ticket_sla"]),
    staffOnly: true,
  },
  // staffKindGroup1: separate from "Altri avvisi" so muting general does not hide staff events
  // staffOnly: Filtri UI + mutate — same gate as Inbox (staff role)
  {
    key: "staff",
    label: "Eventi staff",
    hint: "",
    kinds: Object.freeze(["staff"]),
    staffOnly: true,
  },
  // confessionaleInboxCat1: dedicated Inbox category "Confessioni"
  {
    key: "confessionale",
    label: "Confessioni",
    hint: "Nuove confessioni e commenti in discussione",
    kinds: Object.freeze(["confessionale"]),
    staffOnly: true,
  },
  {
    key: "votes",
    label: "Promemoria voti",
    hint: "Quando puoi votare di nuovo su Top.gg / Discadia",
    kinds: Object.freeze(["vote_reminder"]),
  },
  {
    key: "general",
    label: "Altri avvisi sito",
    hint: "",
    kinds: Object.freeze(["info", "success", "suggestion", "mod", "contest"]),
  },
]);

const SITE_NOTIF_DIGEST_QUEUES = Object.freeze([
  {
    key: "resoconti",
    label: "Digest resoconti",
    hint: "Raggruppa più «Nuovo resoconto» in un unico avviso invece di N push",
    staffOnly: true,
    defaultOn: true,
  },
]);

const SITE_NOTIF_GROUP_KEYS = Object.freeze(SITE_NOTIF_GROUPS.map((g?) => g.key));
const SITE_NOTIF_DIGEST_KEYS = Object.freeze(SITE_NOTIF_DIGEST_QUEUES.map((g?) => g.key));
const KIND_TO_GROUP = (() => {
  const map = Object.create(null);
  for (const g of SITE_NOTIF_GROUPS) {
    for (const k of g.kinds) map[k] = g.key;
  }
  return Object.freeze(map);
})();

function resolveGuildId(guildId?) {
  return String(guildId || IDs.guilds?.main || "").trim();
}

/** Same staff gate as siteStaffAccessApi / Inbox tab. */
function memberHasSiteNotifStaffAccess(member?) {
  if (!member) return false;
  if (memberHasStaffRole(member)) return true;
  const staffRoleId = String(IDs.roles?.Staff || "").trim();
  if (staffRoleId && member.roles?.cache?.has?.(staffRoleId)) return true;
  return false;
}

function memberCanSeeSiteNotifGroup(member?, group?) {
  if (!group) return false;
  if (group.staffOnly) return memberHasSiteNotifStaffAccess(member);
  return true;
}

function visibleSiteNotifGroups(member?) {
  return SITE_NOTIF_GROUPS.filter((g?) => memberCanSeeSiteNotifGroup(member, g));
}

function visibleSiteNotifDigestQueues(member?) {
  return SITE_NOTIF_DIGEST_QUEUES.filter((g?) => memberCanSeeSiteNotifGroup(member, g));
}

function normalizeMutedKinds(raw?) {
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

function normalizeDigestQueues(raw?) {
  const arr = Array.isArray(raw) ? raw : null;
  if (arr == null) {
    // default ON for digestable queues
    return SITE_NOTIF_DIGEST_QUEUES.filter((g?) => g.defaultOn !== false).map((g?) => g.key);
  }
  const out = [];
  const seen = new Set();
  for (const x of arr) {
    const k = String(x || "").trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    if (!SITE_NOTIF_DIGEST_KEYS.includes(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

async function getMutedKinds(guildId?, userId?) {
  const gid = resolveGuildId(guildId);
  const uid = String(userId || "").trim();
  if (!gid || !uid) return [];
  const doc = await getProfile(gid, uid, "profile.siteNotifPrefs").catch(() => null);
  return normalizeMutedKinds(doc?.profile?.siteNotifPrefs?.mutedKinds);
}

async function getDigestQueues(guildId?, userId?) {
  const gid = resolveGuildId(guildId);
  const uid = String(userId || "").trim();
  if (!gid || !uid) return normalizeDigestQueues(null);
  const doc = await getProfile(gid, uid, "profile.siteNotifPrefs").catch(() => null);
  const raw = doc?.profile?.siteNotifPrefs?.digestQueues;
  return normalizeDigestQueues(raw === undefined ? null : raw);
}

async function setMutedKinds(guildId?, userId?, mutedKinds?) {
  const gid = resolveGuildId(guildId);
  const uid = String(userId || "").trim();
  if (!gid || !uid) return [];
  const next = normalizeMutedKinds(mutedKinds);
  await upsertProfile(gid, uid, {
    $set: { "profile.siteNotifPrefs.mutedKinds": next },
  });
  return next;
}

async function setDigestQueues(guildId?, userId?, digestQueues?) {
  const gid = resolveGuildId(guildId);
  const uid = String(userId || "").trim();
  if (!gid || !uid) return [];
  const next = normalizeDigestQueues(Array.isArray(digestQueues) ? digestQueues : []);
  await upsertProfile(gid, uid, {
    $set: { "profile.siteNotifPrefs.digestQueues": next },
  });
  return next;
}

function serializeSiteNotifPrefs(mutedKinds?, digestQueues?, { member }: any = {}) {
  const muted = new Set(normalizeMutedKinds(mutedKinds));
  const digests = new Set(normalizeDigestQueues(digestQueues));
  return {
    groups: visibleSiteNotifGroups(member).map((g?) => {
      const enabled = !g.kinds.some((k?) => muted.has(k));
      return {
        key: g.key,
        label: g.label,
        hint: g.hint || "",
        enabled,
        kinds: [...g.kinds],
      };
    }),
    digests: visibleSiteNotifDigestQueues(member).map((g?) => ({
      key: g.key,
      label: g.label,
      hint: g.hint || "",
      enabled: digests.has(g.key),
    })),
  };
}

async function getSerializedSiteNotifPrefs(guildId?, userId?, { member }: any = {}) {
  const muted = await getMutedKinds(guildId, userId).catch(() => []);
  const digests = await getDigestQueues(guildId, userId).catch(() => normalizeDigestQueues(null));
  return serializeSiteNotifPrefs(muted, digests, { member });
}

async function mutateSiteNotifPrefs(guildId?, userId?, payload?, { member }: any = {}) {
  const action = String(payload?.action || "").trim();
  const muted = new Set(await getMutedKinds(guildId, userId).catch(() => []));
  const digests = new Set(await getDigestQueues(guildId, userId).catch(() => normalizeDigestQueues(null)));
  const visible = visibleSiteNotifGroups(member);
  const visibleDigests = visibleSiteNotifDigestQueues(member);

  if (action === "all_on") {
    const visibleKinds = new Set(visible.flatMap((g?) => g.kinds));
    await setMutedKinds(
      guildId,
      userId,
      [...muted].filter((k?) => !visibleKinds.has(k)),
    );
    await setDigestQueues(
      guildId,
      userId,
      [...new Set([...digests, ...visibleDigests.map((g?) => g.key)])],
    );
  } else if (action === "all_off") {
    const visibleKinds = visible.flatMap((g?) => g.kinds);
    await setMutedKinds(guildId, userId, [...new Set([...muted, ...visibleKinds])]);
    await setDigestQueues(
      guildId,
      userId,
      [...digests].filter((k?) => !visibleDigests.some((g?) => g.key === k)),
    );
  } else if (action === "toggle") {
    const key = String(payload?.key || "").trim();
    const group = SITE_NOTIF_GROUPS.find((g?) => g.key === key);
    if (!group || !memberCanSeeSiteNotifGroup(member, group)) {
      return { ok: false, reason: "invalid_params", message: "Gruppo notifiche sito non valido." };
    }
    const isEnabled = !group.kinds.some((k?) => muted.has(k));
    if (isEnabled) {
      for (const k of group.kinds) muted.add(k);
    } else {
      for (const k of group.kinds) muted.delete(k);
    }
    await setMutedKinds(guildId, userId, [...muted]);
  } else if (action === "toggle_digest") {
    const key = String(payload?.key || "").trim().toLowerCase();
    const group = SITE_NOTIF_DIGEST_QUEUES.find((g?) => g.key === key);
    if (!group || !memberCanSeeSiteNotifGroup(member, group)) {
      return { ok: false, reason: "invalid_params", message: "Preferenza digest non valida." };
    }
    if (digests.has(key)) digests.delete(key);
    else digests.add(key);
    await setDigestQueues(guildId, userId, [...digests]);
  } else {
    return { ok: false, reason: "invalid_action", message: "Azione notifiche sito non valida." };
  }

  const prefs = await getSerializedSiteNotifPrefs(guildId, userId, { member });
  return { ok: true, siteNotif: prefs, message: "Preferenze notifiche sito aggiornate." };
}

function isKindMuted(mutedKinds?, kind?) {
  const k = String(kind || "").trim().toLowerCase();
  if (!k) return false;
  return normalizeMutedKinds(mutedKinds).includes(k);
}

function prefersDigestQueue(digestQueues?, queue?) {
  const q = String(queue || "").trim().toLowerCase();
  if (!q) return false;
  return normalizeDigestQueues(digestQueues).includes(q);
}

async function userPrefersNotifDigest(guildId?, userId?, queue?) {
  const digests = await getDigestQueues(guildId, userId).catch(() => normalizeDigestQueues(null));
  return prefersDigestQueue(digests, queue);
}

async function shouldSkipSiteInAppNotif(
  guildId?,
  userId?,
  { kind, title, body, dedupeKey, openUrl, mutedKinds, voteBlocked }: any = {},
) {
  const gid = resolveGuildId(guildId);
  const uid = String(userId || "").trim();
  if (!uid) return false;

  const k = String(kind || "info").trim().toLowerCase();

  if (k === "vote_reminder") {
    /* votePushNoDmFix1: NoDM Discord NON silenzia push sito — solo mute gruppo site (se presente) */
    if (KIND_TO_GROUP[k]) {
      const muted = Array.isArray(mutedKinds)
        ? normalizeMutedKinds(mutedKinds)
        : await getMutedKinds(gid, uid).catch(() => []);
      if (isKindMuted(muted, k)) return true;
    }
    return false;
  }

  if (KIND_TO_GROUP[k]) {
    const muted = Array.isArray(mutedKinds)
      ? normalizeMutedKinds(mutedKinds)
      : await getMutedKinds(gid, uid).catch(() => []);
    if (isKindMuted(muted, k)) return true;
  }

  return false;
}

async function buildSkipContext(guildId?, userId?) {
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

async function shouldSkipDiscordDmForActiveWebPush(guildId?, userId?, notifMeta: Record<string, any> = {}) {
  const uid = String(userId || "").trim();
  if (!uid) return false;
  const soft = await shouldSkipSiteInAppNotif(guildId, uid, notifMeta).catch(() => false);
  if (soft) return false;
  const { userHasActiveWebPush } = require("./siteWebPushService") as typeof import("./siteWebPushService");
  return userHasActiveWebPush(uid).catch(() => false);
}

export = {
  KIND_TO_GROUP,
  getSerializedSiteNotifPrefs,
  mutateSiteNotifPrefs,
  isKindMuted,
  userPrefersNotifDigest,
  shouldSkipSiteInAppNotif,
  buildSkipContext,
  shouldSkipDiscordDmForActiveWebPush,
};
