/**
 * Presenze in voce durante la serata film (canale stage): chi c'era e per quanto.
 * Le usano le convalide automatiche dello staff alla chiusura della serata.
 * Era dentro la classifica case di Hogwarts (ora in Bots/archivio), che ci calcolava i punti casa.
 */
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { getGuildChannelCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const attendanceSessions = new Map();
const SERATA_FILM_VOICE_CHANNEL_ID = String(IDs.channels?.serataFilm || "1497535199813042306").trim();

function getAttendanceSession(guildId?) {
  return attendanceSessions.get(String(guildId || "").trim()) || null;
}

function closeAttendance(session?, userId?, now = Date.now()) {
  const uid = String(userId || "").trim();
  const started = Number(session?.presentSince?.get(uid) || 0);
  if (!started) return;
  session.presentSince.delete(uid);
  session.attendanceMs.set(uid, Number(session.attendanceMs.get(uid) || 0) + Math.max(0, now - started));
}

async function startSerataFilmAttendanceSession(guild?) {
  const guildId = String(guild?.id || "").trim();
  if (!guildId || getAttendanceSession(guildId)) return;
  const session = {
    guildId,
    startedAt: Date.now(),
    presentSince: new Map(),
    attendanceMs: new Map(),
  };
  attendanceSessions.set(guildId, session);
  const channel = guild.channels.cache.get(SERATA_FILM_VOICE_CHANNEL_ID)
    || (await getGuildChannelCached(guild, SERATA_FILM_VOICE_CHANNEL_ID).catch(() => null));
  if (!channel?.members?.size) return;
  const now = Date.now();
  for (const member of channel.members.values()) {
    if (member?.user?.bot) continue;
    session.presentSince.set(String(member.id), now);
  }
}

function handleSerataFilmAttendanceVoiceState(oldState?, newState?) {
  if (!attendanceSessions.size) return;
  const guildId = String(newState?.guild?.id || oldState?.guild?.id || "").trim();
  const userId = String(newState?.id || oldState?.id || "").trim();
  if (!guildId || !userId || newState?.member?.user?.bot || oldState?.member?.user?.bot) return;
  const session = getAttendanceSession(guildId);
  if (!session) return;
  const now = Date.now();
  const oldInChannel = String(oldState?.channelId || "") === SERATA_FILM_VOICE_CHANNEL_ID;
  const newInChannel = String(newState?.channelId || "") === SERATA_FILM_VOICE_CHANNEL_ID;
  if (!oldInChannel && newInChannel) session.presentSince.set(userId, now);
  if (oldInChannel && !newInChannel) closeAttendance(session, userId, now);
}

function snapshotSerataFilmAttendance(guildId?, nowMs = Date.now()) {
  const session = getAttendanceSession(guildId);
  if (!session) return new Map();
  const out = new Map();
  for (const [uid, ms] of session.attendanceMs.entries()) {
    const key = String(uid || "").trim();
    if (!key) continue;
    out.set(key, Math.max(0, Number(ms) || 0));
  }
  for (const [uid, started] of session.presentSince.entries()) {
    const key = String(uid || "").trim();
    if (!key) continue;
    const pending = Math.max(0, nowMs - Number(started || 0));
    out.set(key, (out.get(key) || 0) + pending);
  }
  return out;
}

function clearSerataFilmAttendanceSession(guildId?) {
  attendanceSessions.delete(String(guildId || "").trim());
}

async function restoreSerataFilmAttendanceSession(guild?) {
  if (!guild?.id || getAttendanceSession(guild.id)) return;
  const channel = guild.channels.cache.get(SERATA_FILM_VOICE_CHANNEL_ID)
    || (await getGuildChannelCached(guild, SERATA_FILM_VOICE_CHANNEL_ID).catch(() => null));
  if (!channel?.stageInstance) return;
  await startSerataFilmAttendanceSession(guild);
}


export = {
  startSerataFilmAttendanceSession,
  handleSerataFilmAttendanceVoiceState,
  snapshotSerataFilmAttendance,
  clearSerataFilmAttendanceSession,
  restoreSerataFilmAttendanceSession,
};
