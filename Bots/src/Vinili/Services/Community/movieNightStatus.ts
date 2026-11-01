/** Serata film: controllo di cosa è già stato pubblicato (annuncio finale, messaggio staff, chiusura stage). */
const { getRomeWeekKey, getRomeSaturdayKeyForWeek, isMovieNightFixedScheduleSkipWeek, getFixedMovieTitleForWeek, getWeekKeyStartMs } = require("./movieNightSchedule") as typeof import("./movieNightSchedule");
const { ANNOUNCEMENT_CHANNEL_ID } = require("./movieNightVotes") as typeof import("./movieNightVotes");
const { setBotState } = require("../../Utils/BotState/botStateStore") as typeof import("../../Utils/BotState/botStateStore");
const { getClientGuildCached, getGuildChannelCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");

const STATE_KEY = "movieNightAnnouncement.v1";
const STAFF_COMMUNICATION_CHANNEL_ID = String(IDs.channels?.staffNews || "1442569239063167139");

function isStageCloseMessageForWeekKey(message?, weekKey?) {
  if (!message?.id) return false;
  const wk = String(weekKey || "").trim();
  if (!wk) return false;
  const created = Number(message.createdTimestamp || 0);
  if (!created) return false;
  return getRomeWeekKey(new Date(created)) === wk;
}

async function fetchStageCloseMessageForWeek(clientOrGuild?, weekKey?, state?) {
  const channel = await resolveTextChannelForMovieNight(clientOrGuild);
  if (!channel?.messages?.fetch) return null;
  const messageId = String(state?.stageCloseMessageId || "").trim();
  if (!messageId || messageId === "pending") return null;
  /* serataExtraWeek1: il messaggio salvato deve essere di QUESTA serata. La serata extra del mercoledì
     salva il suo con weekKey = data (es. 2026-10-28): stessa settimana, e il sabato risultava già chiuso. */
  if (String(state?.weekKey || "").trim() !== String(weekKey || "").trim()) return null;
  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message || !isStageCloseMessageForWeekKey(message, weekKey)) return null;
  return message;
}

async function fetchAnnouncementChannel(client?) {
  return (
    client.channels.cache.get(ANNOUNCEMENT_CHANNEL_ID) ||
    (await client.channels.fetch(ANNOUNCEMENT_CHANNEL_ID).catch(() => null))
  );
}

async function finalAnnouncementMessageStillExists(client?, messageId?) {
  const id = String(messageId || "").trim();
  if (!id) return false;
  const channel = await fetchAnnouncementChannel(client);
  if (!channel?.messages?.fetch) return false;
  const message = await channel.messages.fetch(id).catch(() => null);
  return Boolean(message?.id);
}

async function fetchStaffCommunicationChannel(client?) {
  const cached = client.channels.cache.get(STAFF_COMMUNICATION_CHANNEL_ID) || null;
  if (cached?.isTextBased?.()) return cached;
  const fetched = await client.channels.fetch(STAFF_COMMUNICATION_CHANNEL_ID).catch(() => null);
  if (fetched?.isTextBased?.()) return fetched;
  const guildId = String(IDs.guilds?.main || client?.config?.mainGuildId || "");
  const guild = guildId ? await getClientGuildCached(client, guildId).catch(() => null) : null;
  if (!guild) return null;
  return getGuildChannelCached(guild, STAFF_COMMUNICATION_CHANNEL_ID).catch(() => null);
}

function messageTextHaystack(message?) {
  const parts = [String(message?.content || "")];
  const embeds = Array.isArray(message?.embeds) ? message.embeds : [];
  for (const embed of embeds) {
    parts.push(String(embed?.title || ""), String(embed?.description || ""));
  }
  return parts.join("\n");
}

async function staffCommunicationPostExistsInChannel(client?, { title, weekKey, sinceMs }: any = {}) {
  const channel = await fetchStaffCommunicationChannel(client);
  if (!channel?.messages?.fetch) return false;
  const film = String(title || "").trim();
  if (!film) return false;
  const since = Number(sinceMs) || getWeekKeyStartMs(weekKey) || Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (!recent?.size) return false;
  const marker = /COMUNICAZIONE SERATA FILM/i;
  for (const message of recent.values()) {
    if (Number(message.createdTimestamp || 0) < since) continue;
    const haystack = messageTextHaystack(message);
    if (!marker.test(haystack)) continue;
    if (haystack.includes(film)) return true;
  }
  return false;
}

async function isMovieNightFinalPublicAnnouncePresent(client?, state?, weekKey?, now = new Date()) {
  if (isMovieNightFixedScheduleSkipWeek(now)) return false;
  const messageId = String(state?.finalAnnouncementMessageId || "").trim();
  if (messageId && (await finalAnnouncementMessageStillExists(client, messageId))) return true;
  const wk = String(weekKey || "").trim();
  const sat = String(getRomeSaturdayKeyForWeek(now) || "").trim();
  if (!wk) return false;
  const announceStatus = await resolveMovieNightFinalAnnounceStatus(client, state, wk, sat, now);
  return Boolean(announceStatus.done);
}

function movieNightStaffCommunicationStatePatch(staffResult?, saturdayKey?) {
  if (!staffResult?.ok || staffResult.skipped) return {};
  const messageId = String(staffResult.messageId || "").trim();
  if (!messageId) return {};
  return {
    staffCommunicationMessageId: messageId,
    staffCommunicationAt: new Date().toISOString(),
    staffAnnouncedSaturdayKey: String(saturdayKey || ""),
  };
}

async function fetchFinalAnnouncementMessage(client?, messageId?) {
  const id = String(messageId || "").trim();
  if (!id) return null;
  const channel = await fetchAnnouncementChannel(client);
  if (!channel?.messages?.fetch) return null;
  return channel.messages.fetch(id).catch(() => null);
}

async function resolveMovieNightFinalAnnounceStatus(client?, state?, weekKey?, saturdayKey?, now = new Date()) {
  const wk = String(weekKey || "").trim();
  const sat = String(saturdayKey || "").trim();
  if (!wk) return { done: false };
  const expectedTitle = getFixedMovieTitleForWeek(now) || null;
  const messageId = String(state?.finalAnnouncementMessageId || "").trim();
  const message = messageId ? await fetchFinalAnnouncementMessage(client, messageId) : null;
  const messageValid = Boolean(message?.id && isStageCloseMessageForWeekKey(message, wk));
  if (sat && String(state?.finalAnnouncedSaturdayKey || "") === sat) {
    const savedTitle = String(state?.finalMovieTitle || "").trim();
    if (expectedTitle && savedTitle !== expectedTitle) {
      if (messageValid) {
        return { done: true, reason: "already_announced_saturday_title_drift", repairTitle: expectedTitle };
      }
      return { done: false };
    }
    if (!messageId || messageValid) {
      return { done: true, reason: "already_announced_saturday" };
    }
    return { done: false };
  }
  if (messageId && String(state?.weekKey || "") === wk && messageValid) {
    const content = String(message.content || "");
    if (expectedTitle && !content.includes(expectedTitle)) {
      return {
        done: true,
        reason: "already_announced_title_drift",
        repairTitle: expectedTitle,
        repairSaturdayKey: Boolean(sat && String(state?.finalAnnouncedSaturdayKey || "") !== sat),
      };
    }
    return {
      done: true,
      reason: "already_announced",
      repairSaturdayKey: Boolean(sat && String(state?.finalAnnouncedSaturdayKey || "") !== sat),
      repairWeekKey: false,
    };
  }
  return { done: false };
}

async function resolveMovieNightStaffCommunicationStatus(client?, state?, saturdayKey?, title?, now = new Date(), weekKey = "") {
  if (isMovieNightFixedScheduleSkipWeek(now)) {
    return { done: true, reason: "fixed_schedule_skip" };
  }
  const sat = String(saturdayKey || "").trim();
  const resolvedTitle =
    String(title || state?.finalMovieTitle || "").trim() ||
    getFixedMovieTitleForWeek(now) ||
    "";
  if (!resolvedTitle) return { done: false, reason: "title_unavailable" };
  if (!sat || String(state?.staffAnnouncedSaturdayKey || "") !== sat) {
    return { done: false, reason: "different_week" };
  }
  const messageId = String(state?.staffCommunicationMessageId || "").trim();
  if (messageId) {
    const channel = await fetchStaffCommunicationChannel(client);
    const message = channel?.messages?.fetch ? await channel.messages.fetch(messageId).catch(() => null) : null;
    if (message?.id && messageTextHaystack(message).includes(resolvedTitle)) {
      return { done: true, reason: "already_announced_this_week", messageId: String(message.id || "") };
    }
  }
  if (await staffCommunicationPostExistsInChannel(client, { title: resolvedTitle, weekKey })) {
    return { done: true, reason: "already_announced_channel_scan" };
  }
  return { done: false, reason: "needs_send" };
}

async function resolveMovieNightEventStartStatus(client?, state?, weekKey?) {
  const wk = String(weekKey || "").trim();
  if (!wk || String(state?.weekKey || "") !== wk) return { done: false };
  const messageId = String(state?.eventStartMessageId || "").trim();
  if (!messageId) return { done: false };
  const announcedAt = String(state?.eventStartAnnouncedAt || "").trim();
  if (announcedAt && getRomeWeekKey(new Date(announcedAt)) !== wk) return { done: false };
  const channel = await fetchAnnouncementChannel(client);
  if (!channel?.messages?.fetch) return { done: false };
  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message?.id) return { done: false };
  if (getRomeWeekKey(new Date(Number(message.createdTimestamp || 0))) !== wk) return { done: false };
  return { done: true, reason: "already_announced" };
}

async function repairMovieNightFinalAnnounceState(client?, state?, weekKey?, saturdayKey?, status?) {
  if (!status || typeof state !== "object") return state;
  const sat = String(saturdayKey || "").trim();
  const needsRepair =
    status.repairSaturdayKey || status.repairWeekKey || status.repairTitle;
  if (!needsRepair) return state;
  const next = {
    ...state,
    weekKey: String(weekKey || state.weekKey || ""),
  };
  if (sat && status.repairSaturdayKey) next.finalAnnouncedSaturdayKey = sat;
  if (status.repairTitle) next.finalMovieTitle = String(status.repairTitle);
  await setBotState(STATE_KEY, next);
  return next;
}

function logMovieNightFinalResult(result?, label = "") {
  if (!result || result.ok || result.skipped) return;
  const tag = label ? `[MOVIE NIGHT FINAL] ${label}` : "[MOVIE NIGHT FINAL]";
  global.logger?.warn?.(`${tag} errore:`, result.reason || "unknown");
}

async function resolveTextChannelForMovieNight(clientOrGuild?) {
  const guild = clientOrGuild?.guilds ? null : clientOrGuild;
  const client = clientOrGuild?.guilds ? clientOrGuild : guild?.client;
  if (guild) {
    return guild.channels.cache.get(ANNOUNCEMENT_CHANNEL_ID) || (await getGuildChannelCached(guild, ANNOUNCEMENT_CHANNEL_ID));
  }
  return client?.channels?.cache?.get(ANNOUNCEMENT_CHANNEL_ID) || (await client?.channels?.fetch?.(ANNOUNCEMENT_CHANNEL_ID).catch(() => null));
}

export = { STATE_KEY, STAFF_COMMUNICATION_CHANNEL_ID, isStageCloseMessageForWeekKey, fetchStageCloseMessageForWeek, fetchAnnouncementChannel, fetchStaffCommunicationChannel, isMovieNightFinalPublicAnnouncePresent, movieNightStaffCommunicationStatePatch, fetchFinalAnnouncementMessage, resolveMovieNightFinalAnnounceStatus, resolveMovieNightStaffCommunicationStatus, resolveMovieNightEventStartStatus, repairMovieNightFinalAnnounceState, logMovieNightFinalResult, resolveTextChannelForMovieNight };
