const IDs = require("../Config/ids");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const {
  parseItalianDate,
  filterPausesByMonth,
  getPausePhase,
  getTodayUtc,
  MS_PER_DAY,
  getMemberPauseRoleChoices,
  normalizePauseRoleChoice,
  PAUSE_ROLE_STAFF,
  PAUSE_ROLE_PM,
  PAUSE_ROLE_BOTH,
} = require("../Pause/pauseHandlersUtils");
const { createPauseRequest } = require("../Pause/pauseRequestRuntime");
const { memberCanRequestPause } = require("../Pause/pauseRequestSubmitRuntime");
const { assertWebsiteStaffAccess, normalizeHeaderSecret } = require("./siteStaffAccessApi");

const CAL_CACHE_TTL_MS = 45_000;
const CAL_CACHE_MAX = 24;
const calendarCache = new Map();
const REASON_MIN = 8;
const REASON_MAX = 500;
const recentRequestLocks = new Map();
const REQUEST_DEDUP_MS = 45_000;

function requestDedupKey(userId, startIso, endIso, reason, role) {
  return [String(userId || ""), startIso, endIso, reason, role || ""].join("|");
}

function claimRequestDedup(key) {
  const now = Date.now();
  for (const [k, exp] of recentRequestLocks) {
    if (Number(exp) <= now) recentRequestLocks.delete(k);
  }
  const existing = recentRequestLocks.get(key);
  if (existing && Number(existing) > now) return false;
  recentRequestLocks.set(key, now + REQUEST_DEDUP_MS);
  return true;
}

function toIsoDay(date) {
  if (!date || !Number.isFinite(date.getTime?.())) return "";
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDisplayDate(raw) {
  const d = parseItalianDate(raw);
  if (!d) return String(raw || "").trim();
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${d.getUTCFullYear()}`;
}

function isoToItalianSlash(iso) {
  const m = String(iso || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function tomorrowIsoUtc() {
  const t = getTodayUtc();
  return toIsoDay(new Date(t.getTime() + MS_PER_DAY));
}

function sanitizePauseReason(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .slice(0, REASON_MAX);
}

function stripDiscordDecorations(text) {
  return String(text || "")
    .replace(/<a?:[\w~]+:\d+>/g, "")
    .replace(/<[@#&!]?\d+>/g, "")
    .replace(/[*_`~|]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function roleChoiceLabel(choice) {
  if (choice === PAUSE_ROLE_PM) return "Partner Manager";
  if (choice === PAUSE_ROLE_BOTH) return "Entrambi";
  return "Staff";
}

function buildRequestMeta(member) {
  const canRequest = memberCanRequestPause(member);
  const roleChoices = canRequest ? getMemberPauseRoleChoices(member) : [];
  return {
    canRequest,
    roleChoices: roleChoices.map((value) => ({
      value,
      label: roleChoiceLabel(value),
    })),
    needsRolePick: roleChoices.length > 1,
    minStartIso: tomorrowIsoUtc(),
    reasonMin: REASON_MIN,
    reasonMax: REASON_MAX,
  };
}

function defaultAvatarUrl(userId) {
  try {
    const id = BigInt(String(userId || "0"));
    const idx = Number((id >> 22n) % 6n);
    return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
  } catch (e) {
    return "https://cdn.discordapp.com/embed/avatars/0.png";
  }
}

function resolveMemberDisplay(guild, userId) {
  const id = String(userId || "").trim();
  if (!id) return { displayName: "Staff", username: "", avatarUrl: "" };
  const member = guild?.members?.cache?.get?.(id) || null;
  const user = member?.user || null;
  const displayName =
    String(member?.displayName || user?.globalName || user?.username || id).trim() || id;
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

function expandPauseDayKeys(startRaw, endRaw) {
  const start = parseItalianDate(startRaw);
  const end = parseItalianDate(endRaw);
  if (!start || !end || end < start) return [];
  const keys = [];
  for (let t = start.getTime(); t <= end.getTime(); t += MS_PER_DAY) {
    keys.push(toIsoDay(new Date(t)));
  }
  return keys;
}

function serializePause(doc, pause, guild, today) {
  const userId = String(doc?.userId || "").trim();
  const identity = resolveMemberDisplay(guild, userId);
  const startRaw = String(pause?.dataRichiesta || "").trim();
  const endRaw = String(pause?.dataRitorno || "").trim();
  const phase = getPausePhase(startRaw, endRaw, today);
  const status = String(pause?.status || "").trim() || "pending";
  const dayKeys = expandPauseDayKeys(startRaw, endRaw);
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
    ruolo: String(pause?.ruolo || pause?.ruoloRichiesto || "").trim(),
    status,
    phase,
  };
}

function calCacheKey(year, month) {
  return `${String(IDs.guilds.main || "")}:${year}:${month}`;
}

function readCalCache(year, month) {
  const key = calCacheKey(year, month);
  const entry = calendarCache.get(key);
  if (!entry || Number(entry.exp || 0) <= Date.now()) {
    calendarCache.delete(key);
    return null;
  }
  return entry.payload;
}

function writeCalCache(year, month, payload) {
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

async function hydrateMembersForUserIds(guild, userIds) {
  if (!guild || !Array.isArray(userIds) || !userIds.length) return;
  const missing = userIds.filter((id) => id && !guild.members.cache.has(id));
  if (!missing.length) return;
  const chunk = missing.slice(0, 40);
  await Promise.all(chunk.map((id) => guild.members.fetch(id).catch(() => null)));
}

async function buildStaffPauseCalendarPayload(client, year, month) {
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

  const docs = await ActivityUserProfile.find(
    { guildId, "staff.pauses.status": "accepted" },
    { userId: 1, "staff.pauses": 1 },
  )
    .lean()
    .catch(() => []);

  const today = getTodayUtc();
  const pending = [];
  for (const doc of docs) {
    const all = Array.isArray(doc?.staff?.pauses) ? doc.staff.pauses : [];
    const accepted = all.filter((p) => p && String(p.status || "") === "accepted");
    const inMonth = filterPausesByMonth(accepted, y, m);
    for (const pause of inMonth) {
      pending.push({ doc, pause });
    }
  }

  const needIds = [
    ...new Set(pending.map((row) => String(row.doc?.userId || "").trim()).filter(Boolean)),
  ];
  await hydrateMembersForUserIds(guild, needIds);

  const pauses = pending.map(({ doc, pause }) => serializePause(doc, pause, guild, today));

  pauses.sort((a, b) => {
    const as = String(a.startIso || "");
    const bs = String(b.startIso || "");
    if (as !== bs) return as < bs ? -1 : 1;
    return String(a.displayName || "").localeCompare(String(b.displayName || ""), "it");
  });

  const days = {};
  for (const pause of pauses) {
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

  const pausesOut = pauses.map((p) => {
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

/**
 * GET Bearer + ?year=&month= — calendario pause staff accettate (+ meta richiesta).
 */
async function handleSiteStaffPauseGet(client, req, res) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    const access = await assertWebsiteStaffAccess(client, accessToken);
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
    const payload = {
      ...out,
      me: buildRequestMeta(access.member),
    };
    res.setHeader("Cache-Control", "private, max-age=30");
    return res.status(Number(payload.status) || 500).json(payload);
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-pause:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

/**
 * POST Bearer — richiedi pausa (stesso flusso Discord Accetta/Rifiuta).
 * Body: { start: YYYY-MM-DD, end: YYYY-MM-DD, reason: string, role?: Staff|PartnerManager|Entrambi }
 */
async function handleSiteStaffPausePost(client, req, res) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    const access = await assertWebsiteStaffAccess(client, accessToken);
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
          roleChoices: roleChoices.map((value) => ({ value, label: roleChoiceLabel(value) })),
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
    return res.status(200).json({
      ok: true,
      pauseId: String(result.pauseId || ""),
      message:
        "Richiesta inviata. Gli High Staff la vedranno su Discord con i pulsanti Accetta / Rifiuta.",
      role: requestedRole,
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-pause POST:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

module.exports = {
  handleSiteStaffPauseGet,
  handleSiteStaffPausePost,
  buildStaffPauseCalendarPayload,
  invalidateStaffPauseCalendarCache,
};
