const IDs: any = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { getGuildChannelCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { resolveStaffRole } = require("./weeklyStaffResocontoService") as typeof import("./weeklyStaffResocontoService");
const { hasActiveAcceptedStaffPause } = require("../../site/staff/pause/pauseHandlersUtils") as typeof import("../../site/staff/pause/pauseHandlersUtils");
const {
  getSerataFilmSaturdayKeyForSession,
  isSerataFilmAbsentExcused,
  loadSerataFilmStaffAttendanceByUserId,
} = require("../../Staff/utils/serataFilmAttendanceUtils") as typeof import("../../Staff/utils/serataFilmAttendanceUtils");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const path = require("path") as typeof import("path");
const fs = require("fs") as typeof import("fs");

const MAIN_GUILD_ID = String(IDs.guilds?.main || "");
const SERATA_FILM_CHANNEL_ID = String(IDs.channels?.serataFilm || "1497535199813042306").trim();
const SERATA_FILM_MIN_MS = 30 * 60 * 1000;
const SERATA_SESSION_FILE = path.join(__dirname, "../../Data/serataFilmSessions.json");

const serataFilmSessions = new Map();
let serataPersistTimer = null;

function isStaffMember(member?) {
  if (!member || member.user?.bot) return false;
  if (member.roles?.cache?.has(String(IDs.roles?.Founder))) return false;
  return Boolean(
    member.roles?.cache?.has(String(IDs.roles?.Staff)) ||
    resolveStaffRole(member) ||
    member.roles?.cache?.has(String(IDs.roles?.HighStaff)),
  );
}

function isExemptFromSerataFilmAutoValutazione(member?) {
  const managerId = String(IDs.roles?.Manager || "").trim();
  return Boolean(managerId && member?.roles?.cache?.has(managerId));
}

function isSerataFilmTrackableStaff(member?) {
  return isStaffMember(member) && !isExemptFromSerataFilmAutoValutazione(member);
}

async function fetchMainGuildStaffMembers(client?, options: Record<string, any> = {}) {
  const withPresences = options.withPresences === true;
  const preferCache = options.preferCache === true;
  const guild = client?.guilds?.cache?.get(MAIN_GUILD_ID) || (await client?.guilds?.fetch?.(MAIN_GUILD_ID).catch(() => null));
  if (!guild) return [];
  if (preferCache) {
    return [...guild.members.cache.values()].filter(isStaffMember);
  }
  const members = withPresences
    ? await guild.members.fetch({ withPresences: true, force: false }).catch(() => guild.members.cache)
    : await guild.members.fetch({ force: false }).catch(() => guild.members.cache);
  return [...members.values()].filter(isStaffMember);
}

function ensureAutoValutazioneFromMain() {
  return require("./staffAutoValutazioniService").ensureAutoValutazione as typeof import("./staffAutoValutazioniService").ensureAutoValutazione;
}

function isSerataFilmEvent(event?) {
  const name = String(event?.name || "").toUpperCase();
  return name.includes("SERATA FILM") && String(event?.channelId || "") === SERATA_FILM_CHANNEL_ID;
}

function serataSessionKey(event?) {
  return `${String(event?.guildId || event?.guild?.id || "")}:${String(event?.id || "")}`;
}

function serializeSerataSessions() {
  const out = [];
  for (const [key, session] of serataFilmSessions.entries()) {
    out.push({
      key,
      eventId: String(session.eventId || ""),
      guildId: String(session.guildId || ""),
      startedAt: Number(session.startedAt || 0),
      presentSince: [...(session.presentSince || new Map()).entries()],
      attendanceMs: [...(session.attendanceMs || new Map()).entries()],
    });
  }
  return out;
}

function persistSerataFilmSessionsSoon() {
  if (serataPersistTimer) return;
  serataPersistTimer = setTimeout(() => {
    serataPersistTimer = null;
    try {
      const dir = path.dirname(SERATA_SESSION_FILE);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(SERATA_SESSION_FILE, JSON.stringify({ ts: Date.now(), sessions: serializeSerataSessions() }), "utf8");
    } catch (err) {
      global.logger?.warn?.("[STAFF AUTO VALUTAZIONI] serata session persist failed:", err?.message || err);
    }
  }, 400);
  serataPersistTimer.unref?.();
}

function hydrateSerataFilmSessionsFromDisk() {
  try {
    if (!fs.existsSync(SERATA_SESSION_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(SERATA_SESSION_FILE, "utf8"));
    const list = Array.isArray(raw?.sessions) ? raw.sessions : [];
    for (const row of list) {
      const key = String(row?.key || "");
      const eventId = String(row?.eventId || "");
      const guildId = String(row?.guildId || "");
      if (!key || !eventId || !guildId) continue;
      if (serataFilmSessions.has(key)) continue;
      const session = {
        eventId,
        guildId,
        startedAt: Number(row.startedAt || Date.now()),
        presentSince: new Map(),
        attendanceMs: new Map(),
      };
      for (const [uid, ms] of Array.isArray(row.attendanceMs) ? row.attendanceMs : []) {
        if (uid) session.attendanceMs.set(String(uid), Math.max(0, Number(ms) || 0));
      }
      for (const [uid, since] of Array.isArray(row.presentSince) ? row.presentSince : []) {
        if (uid) session.presentSince.set(String(uid), Math.max(0, Number(since) || Date.now()));
      }
      serataFilmSessions.set(key, session);
    }
  } catch (err) {
    global.logger?.warn?.("[STAFF AUTO VALUTAZIONI] serata session hydrate failed:", err?.message || err);
  }
}

function clearPersistedSerataFilmSessions() {
  try {
    if (fs.existsSync(SERATA_SESSION_FILE)) fs.unlinkSync(SERATA_SESSION_FILE);
  } catch (_) {}
}

function closeAttendance(session?, userId?, now = Date.now()) {
  const uid = String(userId || "");
  const started = Number(session.presentSince.get(uid) || 0);
  if (!started) return;
  session.presentSince.delete(uid);
  session.attendanceMs.set(uid, Number(session.attendanceMs.get(uid) || 0) + Math.max(0, now - started));
  persistSerataFilmSessionsSoon();
}

async function startSerataFilmSession(event?) {
  if (!isSerataFilmEvent(event)) return;
  const guild = event.guild || (await event.client?.guilds?.fetch?.(event.guildId).catch(() => null));
  if (!guild) return;
  const key = serataSessionKey(event);
  if (serataFilmSessions.has(key)) return;
  const session = { eventId: String(event.id), guildId: String(guild.id), startedAt: Date.now(), presentSince: new Map(), attendanceMs: new Map() };
  serataFilmSessions.set(key, session);

  const channel = guild.channels.cache.get(SERATA_FILM_CHANNEL_ID) || (await getGuildChannelCached(guild, SERATA_FILM_CHANNEL_ID));
  if (channel?.members?.size) {
    for (const member of channel.members.values()) {
      if (isSerataFilmTrackableStaff(member)) session.presentSince.set(String(member.id), Date.now());
    }
  }
  persistSerataFilmSessionsSoon();
}

function serataFilmEvalDateUtc(session?) {
  const startedAt = Number(session?.startedAt || 0);
  const base = startedAt > 0 ? new Date(startedAt) : new Date();
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
}

async function loadStaffPausesByUserId(guildId?, userIds?) {
  const ids = [...new Set(userIds.map((id?) => String(id || "")).filter(Boolean))];
  if (!ids.length) return new Map();
  const docs = await ActivityUserProfile.find(
    { guildId: String(guildId), userId: { $in: ids } },
    { userId: 1, "staff.pauses": 1 },
  )
    .lean()
    .catch(() => []);
  const map = new Map();
  for (const doc of docs) {
    const uid = String(doc?.userId || "");
    if (!uid) continue;
    map.set(uid, Array.isArray(doc?.staff?.pauses) ? doc.staff.pauses : []);
  }
  return map;
}

function attendanceMapFromSnapshot(snapshot?) {
  const map = new Map();
  if (!(snapshot instanceof Map)) return map;
  for (const [uid, ms] of snapshot.entries()) {
    const id = String(uid || "");
    if (!id) continue;
    map.set(id, Math.max(0, Number(ms) || 0));
  }
  return map;
}

async function finishSerataFilmSession(event?, opts: Record<string, any> = {}) {
  if (!isSerataFilmEvent(event) && !(event?.__vcForceSerataFinish && String(event?.channelId || "") === SERATA_FILM_CHANNEL_ID)) {
    return { ok: false, skipped: true, reason: "not_serata_event" };
  }
  const key = serataSessionKey(event);
  let session = serataFilmSessions.get(key);
  const seededAttendance = attendanceMapFromSnapshot(opts.attendanceSnapshot);
  if (!session && event?.__vcForceSerataFinish) {
    if (!seededAttendance.size && !opts.allowEmptyAttendance) {
      return { ok: false, skipped: true, reason: "no_session_no_attendance" };
    }
    session = {
      eventId: String(event.id || opts.eventId || `stage-${Date.now()}`),
      guildId: String(event.guildId || event.guild?.id || ""),
      startedAt: Number(opts.startedAt || Date.now()),
      presentSince: new Map(),
      attendanceMs: new Map(seededAttendance),
    };
  }
  if (!session) return { ok: false, skipped: true, reason: "no_session" };
  if (seededAttendance.size) {
    for (const [uid, ms] of seededAttendance.entries()) {
      session.attendanceMs.set(uid, Math.max(Number(session.attendanceMs.get(uid) || 0), ms));
    }
  }
  serataFilmSessions.delete(key);
  persistSerataFilmSessionsSoon();
  const guild = event.guild || (await event.client?.guilds?.fetch?.(event.guildId).catch(() => null));
  if (!guild) return { ok: false, skipped: true, reason: "guild_unavailable" };
  const now = Date.now();
  for (const uid of [...session.presentSince.keys()]) closeAttendance(session, uid, now);
  const evalDateUtc = serataFilmEvalDateUtc(session);
  const saturdayKey = getSerataFilmSaturdayKeyForSession(session);
  const staffMembers = await fetchMainGuildStaffMembers(guild.client, { preferCache: false });
  const memberIds = staffMembers.map((member?) => member.id);
  const [pausesByUserId, attendanceByUserId] = await Promise.all([
    loadStaffPausesByUserId(guild.id, memberIds),
    loadSerataFilmStaffAttendanceByUserId(guild.id, memberIds),
  ]);
  const ensureAutoValutazione = ensureAutoValutazioneFromMain();
  let applied = 0;
  let skippedPresent = 0;
  let skippedExcused = 0;
  let skippedPause = 0;
  const appliedUserIds = [];
  for (const member of staffMembers) {
    if (isExemptFromSerataFilmAutoValutazione(member)) continue;
    const uid = String(member.id);
    const pauses = pausesByUserId.get(uid) || [];
    if (hasActiveAcceptedStaffPause(pauses, evalDateUtc)) {
      skippedPause += 1;
      continue;
    }
    const ms = Number(session.attendanceMs.get(uid) || 0);
    const staffAttendance = attendanceByUserId.get(uid);
    if (ms >= SERATA_FILM_MIN_MS) {
      skippedPresent += 1;
      continue;
    }
    if (isSerataFilmAbsentExcused(staffAttendance, saturdayKey)) {
      skippedExcused += 1;
      continue;
    }
    const result = await ensureAutoValutazione(guild, member, `serata_film:${session.eventId}`, "negative", "Non si presenta durante la serata film o rimane per meno di 30 minuti.").catch((err?) => {
      global.logger?.warn?.("[STAFF AUTO VALUTAZIONI] serata film negative failed:", member.id, err?.message || err);
      return null;
    });
    if (result?.ok && !result.skipped) {
      applied += 1;
      appliedUserIds.push(uid);
    }
  }
  if (!serataFilmSessions.size) clearPersistedSerataFilmSessions();
  return {
    ok: true,
    eventId: session.eventId,
    applied,
    skippedPresent,
    skippedExcused,
    skippedPause,
    appliedUserIds,
    staffCount: staffMembers.length,
  };
}

async function finishSerataFilmSessionsForChannel(guild?, channelId?, opts: Record<string, any> = {}) {
  if (!guild || String(channelId || "") !== SERATA_FILM_CHANNEL_ID) {
    return { ok: false, skipped: true, reason: "wrong_channel" };
  }
  hydrateSerataFilmSessionsFromDisk();
  let sessions = [...serataFilmSessions.values()]
    .filter((session?) => String(session.guildId || "") === String(guild.id || ""));
  const seededAttendance = attendanceMapFromSnapshot(opts.attendanceSnapshot);
  if (!sessions.length && (seededAttendance.size || opts.allowEmptyAttendance)) {
    const eventId = String(opts.eventId || `stage-${Date.now()}`);
    const session = {
      eventId,
      guildId: String(guild.id || ""),
      startedAt: Number(opts.startedAt || Date.now()),
      presentSince: new Map(),
      attendanceMs: new Map(seededAttendance),
    };
    sessions = [session];
    serataFilmSessions.set(`${session.guildId}:${session.eventId}`, session);
    global.logger?.warn?.(
      "[STAFF AUTO VALUTAZIONI] serata stage closed with no live session — using synthetic session from attendance/opts",
      "eventId=",
      eventId,
      "attendance=",
      seededAttendance.size,
    );
  }
  if (!sessions.length) {
    const self = finishSerataFilmSessionsForChannel as any;
    if (Date.now() - Number(self._lastNoSessionWarnAt || 0) > 6 * 60 * 60 * 1000) {
      self._lastNoSessionWarnAt = Date.now();
      global.logger?.warn?.(
        "[STAFF AUTO VALUTAZIONI] serata stage closed but no session in memory/disk — skip auto negatives (avoid mass false positives)",
      );
    }
    return { ok: false, skipped: true, reason: "no_session" };
  }
  const results = [];
  for (const session of sessions) {
    serataFilmSessions.set(`${session.guildId}:${session.eventId}`, session);
    results.push(
      await finishSerataFilmSession(
        {
          id: session.eventId,
          guildId: session.guildId,
          guild,
          client: guild.client,
          name: "SERATA FILM",
          channelId: SERATA_FILM_CHANNEL_ID,
          __vcForceSerataFinish: true,
        },
        {
          attendanceSnapshot: opts.attendanceSnapshot,
          startedAt: opts.startedAt || session.startedAt,
          allowEmptyAttendance: Boolean(opts.allowEmptyAttendance),
          eventId: session.eventId,
        },
      ),
    );
  }
  return { ok: true, results };
}

async function handleSerataFilmScheduledEventUpdate(oldEvent?, newEvent?) {
  const oldStatus = Number(oldEvent?.status || 0);
  const newStatus = Number(newEvent?.status || 0);
  if (newStatus === 2 && oldStatus !== 2) await startSerataFilmSession(newEvent);
  if ((newStatus === 3 || newStatus === 4) && oldStatus !== newStatus) {
    hydrateSerataFilmSessionsFromDisk();
    await finishSerataFilmSession({
      id: newEvent?.id,
      guildId: newEvent?.guildId || newEvent?.guild?.id,
      guild: newEvent?.guild,
      client: newEvent?.client || newEvent?.guild?.client,
      name: newEvent?.name || "SERATA FILM",
      channelId: newEvent?.channelId || SERATA_FILM_CHANNEL_ID,
      __vcForceSerataFinish: true,
    }).catch((err?) => {
      global.logger?.warn?.("[STAFF AUTO VALUTAZIONI] serata finish on event end failed:", err?.message || err);
    });
  }
}

async function handleSerataFilmVoiceState(oldState?, newState?) {
  const guildId = String(newState?.guild?.id || oldState?.guild?.id || "");
  const userId = String(newState?.id || oldState?.id || "");
  if (!guildId || !userId) return;
  if (!serataFilmSessions.size) hydrateSerataFilmSessionsFromDisk();
  if (!serataFilmSessions.size) return;
  const member = newState?.member || oldState?.member || null;
  if (member && isExemptFromSerataFilmAutoValutazione(member)) return;
  const now = Date.now();
  const oldInChannel = String(oldState?.channelId || "") === SERATA_FILM_CHANNEL_ID;
  const newInChannel = String(newState?.channelId || "") === SERATA_FILM_CHANNEL_ID;
  const joined = !oldInChannel && newInChannel;
  const left = oldInChannel && !newInChannel;
  let touched = false;
  for (const session of serataFilmSessions.values()) {
    if (String(session.guildId) !== guildId) continue;
    if (joined && (!member || isSerataFilmTrackableStaff(member))) {
      session.presentSince.set(userId, now);
      touched = true;
    }
    if (left) {
      closeAttendance(session, userId, now);
      touched = true;
    }
  }
  if (touched) persistSerataFilmSessionsSoon();
}

async function restoreActiveSerataFilmSessions(client?) {
  hydrateSerataFilmSessionsFromDisk();
  const guild = client?.guilds?.cache?.get(MAIN_GUILD_ID) || (await client?.guilds?.fetch?.(MAIN_GUILD_ID).catch(() => null));
  if (!guild?.scheduledEvents?.fetch) return;
  const events = await guild.scheduledEvents.fetch().catch(() => null);
  if (!events?.size) return;
  for (const event of events.values()) {
    if (Number(event.status) === 2 && isSerataFilmEvent(event)) await startSerataFilmSession(event);
  }
}

export = {
  startSerataFilmSession,
  finishSerataFilmSessionsForChannel,
  handleSerataFilmScheduledEventUpdate,
  handleSerataFilmVoiceState,
  restoreActiveSerataFilmSessions,
};
