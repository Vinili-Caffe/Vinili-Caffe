const IDs = require("../Utils/Config/ids") as typeof import("../Utils/Config/ids");
const {
  ActivityUserProfile,
  SiteDocument,
  SITE_DOCUMENT_TYPE,
} = require("../Schemas/Community/communitySchemas") as typeof import("../Schemas/Community/communitySchemas");
const {
  parseItalianDate,
  filterPausesByMonth,
  getPausePhase,
  getTodayUtc,
  MS_PER_DAY,
  getMemberPauseRoleChoices,
  normalizePauseRoleChoice,
  formatPauseRoleLabelForMessage,
  getMemberRoleLabel,
  getPauseStatusLabel,
  PAUSE_ROLE_STAFF,
  PAUSE_ROLE_PM,
  PAUSE_ROLE_BOTH,
} = require("../Utils/Pause/pauseHandlersUtils") as typeof import("../Utils/Pause/pauseHandlersUtils");
const { createPauseRequest } = require("../Utils/Pause/pauseRequestRuntime") as typeof import("../Utils/Pause/pauseRequestRuntime");
const { memberCanRequestPause } = require("../Utils/Pause/pauseRequestSubmitRuntime") as typeof import("../Utils/Pause/pauseRequestSubmitRuntime");
const { assertWebsiteStaffAccess, normalizeHeaderSecret } = require("./siteStaffAccessApi") as typeof import("./siteStaffAccessApi");
const {
  getPendingPauseWorkflowForMember,
  buildWorkflowDedupeKey,
} = require("./siteStaffWorkflowStore") as typeof import("./siteStaffWorkflowStore");
const {
  resolveWebUserIdentitiesBatch,
  safeDisplayLabel,
} = require("./siteWebUserIdentity") as typeof import("./siteWebUserIdentity");
const mongoose = require("mongoose") as typeof import("mongoose");
const { sendJsonWithEtag, weakEtagFromJson } = require("./siteHttpEtag") as typeof import("./siteHttpEtag");

const CAL_CACHE_TTL_MS = 45_000;
const CAL_CACHE_MAX = 24;
const calendarCache = new Map();
const REASON_MIN = 8;
const REASON_MAX = 500;
const recentRequestLocks = new Map();
const REQUEST_DEDUP_MS = 45_000;

function requestDedupKey(userId?, startIso?, endIso?, reason?, role?) {
  return [String(userId || ""), startIso, endIso, reason, role || ""].join("|");
}

function claimRequestDedup(key?) {
  const now = Date.now();
  for (const [k, exp] of recentRequestLocks) {
    if (Number(exp) <= now) recentRequestLocks.delete(k);
  }
  const existing = recentRequestLocks.get(key);
  if (existing && Number(existing) > now) return false;
  recentRequestLocks.set(key, now + REQUEST_DEDUP_MS);
  return true;
}

function toIsoDay(date?) {
  if (!date || !Number.isFinite(date.getTime?.())) return "";
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDisplayDate(raw?) {
  const d = parseItalianDate(raw);
  if (!d) return String(raw || "").trim();
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${d.getUTCFullYear()}`;
}

function isoToItalianSlash(iso?) {
  const m = String(iso || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function tomorrowIsoUtc() {
  const t = getTodayUtc();
  return toIsoDay(new Date(t.getTime() + MS_PER_DAY));
}

function sanitizePauseReason(value?) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .slice(0, REASON_MAX);
}

function stripDiscordDecorations(text?) {
  return String(text || "")
    .replace(/<a?:[\w~]+:\d+>/g, "")
    .replace(/<[@#&!]?\d+>/g, "")
    .replace(/[*_`~|]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function roleChoiceLabel(choice?, member?) {
  if (choice === PAUSE_ROLE_PM) return "Partner Manager";
  if (choice === PAUSE_ROLE_BOTH) return "Entrambi";
  try {
    const labeled = formatPauseRoleLabelForMessage(member?.guild || null, PAUSE_ROLE_STAFF, member);
    if (labeled && !/^(staff)$/i.test(String(labeled).trim())) return labeled;
  } catch (_) {}
  try {
    const ranked = getMemberRoleLabel(member);
    if (ranked && !/^(staff)$/i.test(String(ranked).trim())) return ranked;
  } catch (_) {}
  return "Staff";
}

function buildRequestMeta(member?) {
  const canRequest = memberCanRequestPause(member);
  const roleChoices = canRequest ? getMemberPauseRoleChoices(member) : [];
  return {
    canRequest,
    roleChoices: roleChoices.map((value?) => ({
      value,
      label: roleChoiceLabel(value, member),
    })),
    needsRolePick: roleChoices.length > 1,
    minStartIso: tomorrowIsoUtc(),
    reasonMin: REASON_MIN,
    reasonMax: REASON_MAX,
  };
}

function serializePendingPauseChat(item?) {
  if (!item) return null;
  const dedupeKey = String(item.dedupeKey || "").trim();
  if (!dedupeKey) return null;
  return {
    dedupeKey,
    pauseId: String(item.pauseId || item.id || "").trim(),
    status: String(item.status || "pending"),
    statusLabel: String(item.statusLabel || "In attesa"),
    preview: String(item.preview || item.motivazione || "").slice(0, 400),
    start: String(item.start || ""),
    end: String(item.end || ""),
    ruoloRichiesto: String(item.ruoloRichiesto || ""),
    createdAt: item.createdAt || null,
  };
}

function defaultAvatarUrl(_userId?) {
  // Site JSON only: empty → frontend silhouette (no Discord embed defaults).
  return "";
}

function resolveMemberDisplay(guild?, userId?, identityMap = null) {
  const id = String(userId || "").trim();
  if (!id) return { displayName: "Staff", username: "", avatarUrl: "" };
  if (identityMap && identityMap.has(id)) {
    const hit = identityMap.get(id);
    return {
      displayName: safeDisplayLabel(hit.displayName, id, "Staff"),
      username: hit.username || "",
      avatarUrl: hit.avatarUrl || defaultAvatarUrl(id),
    };
  }
  const member = guild?.members?.cache?.get?.(id) || null;
  const user = member?.user || null;
  const displayName = safeDisplayLabel(
    member?.displayName || user?.globalName || user?.username,
    id,
    "Staff",
  );
  const username = String(user?.username || "").trim();
  let avatarUrl = "";
  try {
    if (typeof member?.displayAvatarURL === "function") {
      avatarUrl = member.displayAvatarURL({ size: 64, extension: "webp" });
    } else if (typeof user?.displayAvatarURL === "function") {
      avatarUrl = user.displayAvatarURL({ size: 64, extension: "webp" });
    }
  } catch (e) {}
  if (!avatarUrl) avatarUrl = defaultAvatarUrl(id);
  return { displayName, username, avatarUrl };
}

function expandPauseDayKeys(startRaw?, endRaw?) {
  const start = parseItalianDate(startRaw);
  const end = parseItalianDate(endRaw);
  if (!start || !end || end < start) return [];
  const keys = [];
  for (let t = start.getTime(); t <= end.getTime(); t += MS_PER_DAY) {
    keys.push(toIsoDay(new Date(t)));
  }
  return keys;
}

function serializePause(doc?, pause?, guild?, today?, identityMap = null) {
  const userId = String(doc?.userId || "").trim();
  const identity = resolveMemberDisplay(guild, userId, identityMap);
  const startRaw = String(pause?.dataRichiesta || "").trim();
  const endRaw = String(pause?.dataRitorno || "").trim();
  const status = String(pause?.status || "").trim() || "pending";
  const cancelled = status === "cancelled" || status === "canceled";
  const phase = cancelled ? "cancelled" : getPausePhase(startRaw, endRaw, today);
  const dayKeys = cancelled ? [] : expandPauseDayKeys(startRaw, endRaw);
  const member = guild?.members?.cache?.get?.(userId) || null;
  const trackRaw = String(pause?.ruolo || pause?.ruoloRichiesto || "").trim();
  let ruoloLabel = "";
  try {
    ruoloLabel = formatPauseRoleLabelForMessage(guild, trackRaw || PAUSE_ROLE_STAFF, member);
  } catch (_) {
    ruoloLabel = "";
  }
  if (!ruoloLabel || /^(staff)$/i.test(ruoloLabel)) {
    try {
      ruoloLabel = getMemberRoleLabel(member) || trackRaw || "Staff";
    } catch (_) {
      ruoloLabel = trackRaw || "Staff";
    }
  }
  ruoloLabel = String(ruoloLabel || "")
    .replace(/<a?:[^:]+:\d+>/gi, "")
    .replace(/^[\s༄✦✧★☆◆◇•·❖✵]+/, "")
    .replace(/\s+/g, " ")
    .trim();
  return {
    id: String(pause?._id || ""),
    userId,
    displayName: identity.displayName,
    username: identity.username,
    avatarUrl: identity.avatarUrl,
    start: formatDisplayDate(startRaw),
    end: formatDisplayDate(endRaw),
    startIso: toIsoDay(parseItalianDate(startRaw)),
    endIso: toIsoDay(parseItalianDate(endRaw)),
    dayKeys,
    motivazione: String(pause?.motivazione || "").trim(),
    ruolo: ruoloLabel || trackRaw || "Staff",
    ruoloTrack: trackRaw || null,
    status,
    statusLabel: cancelled ? "Annullata" : getPauseStatusLabel(pause, today),
    phase,
    cancelled,
  };
}

function calCacheKey(year?, month?) {
  return `${String(IDs.guilds.main || "")}:${year}:${month}`;
}

function readCalCache(year?, month?) {
  const key = calCacheKey(year, month);
  const entry = calendarCache.get(key);
  if (!entry || Number(entry.exp || 0) <= Date.now()) {
    calendarCache.delete(key);
    return null;
  }
  return entry.payload;
}

function writeCalCache(year?, month?, payload?) {
  if (calendarCache.size >= CAL_CACHE_MAX) {
    const first = calendarCache.keys().next().value;
    if (first) calendarCache.delete(first);
  }
  calendarCache.set(calCacheKey(year, month), {
    exp: Date.now() + CAL_CACHE_TTL_MS,
    payload,
  });
}

function invalidateStaffPauseCalendarCache() {
  calendarCache.clear();
}

async function hydrateMembersForUserIds(client?, guild?, userIds?) {
  return resolveWebUserIdentitiesBatch(client, guild, userIds, {
    cap: 60,
    budgetMs: 4000,
  });
}

function pauseEntryFromWorkflowDoc(doc?) {
  const fields = doc?.workflowFields && typeof doc.workflowFields === "object" ? doc.workflowFields : {};
  const start = String(fields.start || fields.dataRichiesta || "").trim();
  const end = String(fields.end || fields.dataRitorno || "").trim();
  const pauseId = String(doc?.workflowPauseId || "").trim();
  if (!pauseId || !start || !end) return null;
  return {
    _id: pauseId,
    dataRichiesta: start,
    dataRitorno: end,
    motivazione: String(doc?.preview || doc?.content || doc?.body || "").trim(),
    ruolo: String(fields.ruoloLabel || fields.ruoloRichiesto || "").trim(),
    ruoloRichiesto: String(fields.ruoloRichiesto || fields.ruoloLabel || "").trim(),
    status: "accepted",
    createdAt: doc?.createdAt || null,
  };
}

async function healAcceptedPausesFromWorkflowStore(guildId?, workflowDocs?) {
  const gid = String(guildId || "").trim();
  if (!gid || !Array.isArray(workflowDocs) || !workflowDocs.length) return 0;
  let healed = 0;
  for (const w of workflowDocs) {
    const uid = String(w?.userId || "").trim();
    const pause = pauseEntryFromWorkflowDoc(w);
    if (!uid || !pause) continue;
    const pauseId = String(pause._id);
    const existing = await ActivityUserProfile.findOne(
      { guildId: gid, userId: uid },
      { "staff.pauses._id": 1 },
    )
      .lean()
      .catch(() => null);
    const has = (Array.isArray(existing?.staff?.pauses) ? existing.staff.pauses : []).some(
      (p?) => String(p?._id || "") === pauseId,
    );
    if (has) continue;
    const oid = mongoose.Types.ObjectId.isValid(pauseId) ? new mongoose.Types.ObjectId(pauseId) : pauseId;
    const entry = {
      _id: oid,
      dataRichiesta: pause.dataRichiesta,
      dataRitorno: pause.dataRitorno,
      motivazione: pause.motivazione,
      ruolo: pause.ruolo || null,
      ruoloRichiesto: pause.ruoloRichiesto || null,
      status: "accepted",
      giorniUsati: 0,
      createdAt: pause.createdAt ? new Date(pause.createdAt) : new Date(),
    };
    const res = await ActivityUserProfile.updateOne(
      { guildId: gid, userId: uid, staff: { $exists: true } },
      { $push: { "staff.pauses": entry } },
    ).catch(() => null);
    if (Number(res?.modifiedCount || 0) > 0) {
      healed += 1;
      continue;
    }
        await ActivityUserProfile.updateOne(
      { guildId: gid, userId: uid },
      {
        $setOnInsert: { guildId: gid, userId: uid },
        $push: { "staff.pauses": entry },
      },
      { upsert: true },
    ).catch(() => null);
    healed += 1;
  }
  return healed;
}

async function buildStaffPauseCalendarPayload(client?, year?, month?) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    return { ok: false, status: 400, error: "bad_month", message: "Parametri year/month non validi." };
  }

  const cached = readCalCache(y, m);
  if (cached) {
    return { ...cached, cached: true };
  }

  const guildId = String(IDs.guilds.main || "").trim();
  if (!guildId) {
    return { ok: false, status: 500, error: "no_guild", message: "Guild principale non configurata." };
  }

  let guild = client.guilds.cache.get(guildId) || null;
  if (!guild) {
    guild = await client.guilds.fetch(guildId).catch(() => null);
  }

  const [docs, workflowDocs] = await Promise.all([
    ActivityUserProfile.find(
      { guildId, "staff.pauses.status": { $in: ["accepted", "cancelled"] } },
      { userId: 1, "staff.pauses": 1 },
    )
      .lean()
      .catch(() => []),
    SiteDocument.find({
      docType: SITE_DOCUMENT_TYPE.STAFF_WORKFLOW,
      guildId,
      workflowQueue: "pause",
      status: "accepted",
    })
      .select(
        "userId workflowPauseId workflowFields preview content body createdAt workflowSubjectName workflowSubjectAvatarUrl title",
      )
      .lean()
      .catch(() => []),
  ]);

    void healAcceptedPausesFromWorkflowStore(guildId, workflowDocs).catch(() => 0);

  const today = getTodayUtc();
  const pending = [];
  const seenPauseKeys = new Set();

  for (const doc of docs || []) {
    const all = Array.isArray(doc?.staff?.pauses) ? doc.staff.pauses : [];
    const kept = all.filter((p?) => {
      const s = String(p?.status || "");
      return s === "accepted" || s === "cancelled";
    });
    const inMonth = filterPausesByMonth(kept, y, m);
    for (const pause of inMonth) {
      const key = `${String(doc.userId || "")}:${String(pause?._id || "")}`;
      if (seenPauseKeys.has(key)) continue;
      seenPauseKeys.add(key);
      pending.push({ doc, pause });
    }
  }

  for (const w of workflowDocs || []) {
    const pause = pauseEntryFromWorkflowDoc(w);
    if (!pause) continue;
    const uid = String(w.userId || "").trim();
    if (!uid) continue;
    const key = `${uid}:${String(pause._id)}`;
    if (seenPauseKeys.has(key)) continue;
    if (!filterPausesByMonth([pause], y, m).length) continue;
    seenPauseKeys.add(key);
    pending.push({
      doc: {
        userId: uid,
        displayNameHint: w.workflowSubjectName || w.title || "",
        avatarHint: w.workflowSubjectAvatarUrl || "",
      },
      pause,
    });
  }

  const needIds = [
    ...new Set(pending.map((row?) => String(row.doc?.userId || "").trim()).filter(Boolean)),
  ];
  const identityMap = await hydrateMembersForUserIds(client, guild, needIds);

  let knownStaffIds = null;
  try {
    const { loadRosterSnapshot } = require("./siteStaffRosterCache") as typeof import("./siteStaffRosterCache");
    const snap = await loadRosterSnapshot(guildId).catch(() => null);
    if (Array.isArray(snap?.userIds) && snap.userIds.length) {
      knownStaffIds = new Set(snap.userIds.map((id?) => String(id || "").trim()).filter(Boolean));
    }
  } catch (_) {}

  const {
    memberHasAnyStaffPresenceForDepexSync,
    memberHasPartnerManagerRole,
  } = require("../Utils/Staff/staffPmUtils") as typeof import("../Utils/Staff/staffPmUtils");
  function calendarMemberEligible(member?, ruoloRaw?) {
    if (!member) return false;
    const role = String(ruoloRaw || "Staff")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "");
    if (role === "partnermanager" || role === "pm") return memberHasPartnerManagerRole(member);
    if (role === "entrambi" || role === "both") {
      return memberHasAnyStaffPresenceForDepexSync(member) || memberHasPartnerManagerRole(member);
    }
    return memberHasAnyStaffPresenceForDepexSync(member);
  }
  const pauses = pending
    .filter(({ doc, pause }) => {
      const uid = String(doc?.userId || "").trim();
      if (!uid) return false;
      const st = String(pause?.status || "");
            if (st === "cancelled" || st === "canceled") return true;
      const member = guild?.members?.cache?.get?.(uid) || null;
      const ruolo = pause?.ruoloRichiesto || pause?.ruolo || "Staff";
      if (member) return calendarMemberEligible(member, ruolo);
      if (knownStaffIds) return knownStaffIds.has(uid);
      return false;
    })
    .map(({ doc, pause }) => serializePause(doc, pause, guild, today, identityMap));

  pauses.sort((a?, b?) => {
    if (Boolean(a.cancelled) !== Boolean(b.cancelled)) return a.cancelled ? 1 : -1;
    const as = String(a.startIso || "");
    const bs = String(b.startIso || "");
    if (as !== bs) return as < bs ? -1 : 1;
    return String(a.displayName || "").localeCompare(String(b.displayName || ""), "it");
  });

  const days: Record<string, any> = {};
  for (const pause of pauses) {
    if (pause.cancelled) continue;
    for (const key of pause.dayKeys || []) {
      const [ky, km] = key.split("-").map(Number);
      if (ky !== y || km !== m) continue;
      if (!days[key]) days[key] = [];
      days[key].push({
        id: pause.id,
        userId: pause.userId,
        displayName: pause.displayName,
        avatarUrl: pause.avatarUrl,
        phase: pause.phase,
        ruolo: pause.ruolo,
        start: pause.start,
        end: pause.end,
      });
    }
  }

  const pausesOut = pauses.map((p?) => {
    const { dayKeys, ...rest } = p;
    return rest;
  });

  const payload = {
    ok: true,
    status: 200,
    year: y,
    month: m,
    today: toIsoDay(today),
    timezone: "Europe/Rome",
    count: pausesOut.length,
    pauses: pausesOut,
    days,
  };
  writeCalCache(y, m, payload);
  return payload;
}

async function handleSiteStaffPauseGet(client?, req?, res?) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    const access = await assertWebsiteStaffAccess(client, accessToken, { req });
    if (!access.ok) {
      return res.status(access.status).json({
        ok: false,
        error: access.error,
        message: access.message,
      });
    }

    const now = getTodayUtc();
    const year = req.query?.year != null ? Number(req.query.year) : now.getUTCFullYear();
    const month = req.query?.month != null ? Number(req.query.month) : now.getUTCMonth() + 1;
    const out = await buildStaffPauseCalendarPayload(client, year, month);
    const guildId = String(access.member?.guild?.id || IDs.guilds.main || "").trim();
    const pendingChat = guildId
      ? await getPendingPauseWorkflowForMember(guildId, access.member.id, client).catch(() => null)
      : null;
    const payload = {
      ...out,
      me: {
        ...buildRequestMeta(access.member),
        pendingRequest: serializePendingPauseChat(pendingChat),
      },
    };
    /* siteApiW6: ETag/304 on pause calendar GET */
    return sendJsonWithEtag(req, res, payload, {
      status: Number(payload.status) || 500,
      cacheControl: "private, no-cache",
      etag: weakEtagFromJson(payload),
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-pause:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSiteStaffPausePost(client?, req?, res?) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    const access = await assertWebsiteStaffAccess(client, accessToken, { req });
    if (!access.ok) {
      return res.status(access.status).json({
        ok: false,
        error: access.error,
        message: access.message,
      });
    }

    const member = access.member;
    if (!memberCanRequestPause(member)) {
      return res.status(403).json({
        ok: false,
        error: "cannot_request",
        message: "Non hai i permessi per richiedere una pausa.",
      });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const startIso = String(body.start || body.startIso || "").trim();
    const endIso = String(body.end || body.endIso || "").trim();
    const reason = sanitizePauseReason(body.reason || body.motivazione);
    const roleChoices = getMemberPauseRoleChoices(member);
    let requestedRole = normalizePauseRoleChoice(body.role || body.requestedRole || body.ruolo);

    if (!isoToItalianSlash(startIso) || !isoToItalianSlash(endIso)) {
      return res.status(400).json({
        ok: false,
        error: "bad_dates",
        message: "Indica date di inizio e ritorno valide.",
      });
    }
    if (reason.length < REASON_MIN) {
      return res.status(400).json({
        ok: false,
        error: "reason_too_short",
        message: `Scrivi una motivazione di almeno ${REASON_MIN} caratteri.`,
      });
    }
    if (!roleChoices.length) {
      return res.status(403).json({
        ok: false,
        error: "cannot_request",
        message: "Non hai i permessi per richiedere una pausa.",
      });
    }
    if (roleChoices.length > 1) {
      if (!requestedRole || !roleChoices.includes(requestedRole)) {
        return res.status(400).json({
          ok: false,
          error: "role_required",
          message: "Scegli per quale ruolo vuoi chiedere la pausa.",
          roleChoices: roleChoices.map((value?) => ({ value, label: roleChoiceLabel(value, member) })),
        });
      }
    } else {
      requestedRole = roleChoices[0];
    }

    const dedupKey = requestDedupKey(member.id, startIso, endIso, reason, requestedRole);
    if (!claimRequestDedup(dedupKey)) {
      return res.status(429).json({
        ok: false,
        error: "duplicate_request",
        message: "Richiesta già inviata. Attendi qualche secondo prima di riprovare.",
      });
    }

    const result = await createPauseRequest({
      guild: member.guild,
      userId: member.id,
      requesterMention: `<@${member.id}>`,
      rawStart: isoToItalianSlash(startIso),
      rawEnd: isoToItalianSlash(endIso),
      reason,
      member,
      requestedRole,
    });

    if (!result?.ok) {
      recentRequestLocks.delete(dedupKey);
      return res.status(400).json({
        ok: false,
        error: "request_failed",
        message: stripDiscordDecorations(result?.error) || "Impossibile inviare la richiesta pausa.",
      });
    }

    res.setHeader("Cache-Control", "private, no-store");
    const pauseId = String(result.pauseId || "").trim();
    const pauseIds = Array.isArray(result.pauseIds)
      ? result.pauseIds.map((id?) => String(id || "").trim()).filter(Boolean)
      : pauseId
        ? [pauseId]
        : [];
    const dedupeKey = pauseId ? buildWorkflowDedupeKey("pause", [member.id, pauseId]) : "";
    return res.status(200).json({
      ok: true,
      pauseId,
      pauseIds,
      dedupeKey,
      message:
        pauseIds.length > 1
          ? "Richieste inviate (una per ruolo). L'High Staff può accettarle o rifiutarle in modo indipendente."
          : "Richiesta inviata. Puoi discutere con gli High Staff dalla chat qui sotto (come il thread Discord). Si chiude automaticamente a decisione.",
      role: requestedRole,
      roleTracks: Array.isArray(result.roleTracks) ? result.roleTracks : undefined,
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-pause POST:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

export = {
  handleSiteStaffPauseGet,
  handleSiteStaffPausePost,
  buildStaffPauseCalendarPayload,
  invalidateStaffPauseCalendarCache,
};
