/** Pause: testi e pulsanti dei messaggi di pausa. */
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const IDs = require("../Config/ids") as typeof import("../Config/ids");
const { MS_PER_DAY, parseItalianDate, getTodayUtc, getCurrentYearBoundsUtc, getRomeMonthKey, getMonthKeyForPauseCount, getStaffWeekKeyNow, coerceMonthKey } = require("./pauseDates") as typeof import("./pauseDates");
const { PAUSE_ROLE_STAFF, PAUSE_ROLE_PM, PAUSE_ROLE_BOTH, computeStaffersInPauseByRoleForRange, getStaffRankLimitKey, resolvePauseStaffRankRoleId, computeStaffersInPauseByStaffRankForRange, getMemberRoleLabel, normalizePauseRoleChoice, getPauseRoleLimit, getBasePauseLimit } = require("./pauseRoles") as typeof import("./pauseRoles");

function buildAcceptedPauseLogContent({
  roleLabel,
  effectiveUserId,
  pauseTimingText,
  dataRichiesta,
  dataRitorno,
  giorniUsati,
  maxGiorni,
  giorniRimanenti,
  sameRoleActiveCount,
  roleLimitWarning,
}) {
  return `<a:VC_Calendar:1482706208149475358> **\`${roleLabel}\`** - **<@${effectiveUserId}>** ${pauseTimingText}.\n<:VC_Clock:1473359204189474886> Dal **\`${dataRichiesta}\`** al **\`${dataRitorno}\`**\n<:VC_update:1478721333096349817> __\`${giorniUsati}/${maxGiorni}\`__ giorni utilizzati (\`${giorniRimanenti}\` rimanenti) - <:VC_Staff:1494286904089247754> __\`${sameRoleActiveCount}\`__ staffer in pausa in quel ruolo${roleLimitWarning || ""}`;
}

function buildCancelledPauseLogContent({
  roleLabel,
  effectiveUserId,
  dataRichiesta,
  dataRitorno,
  giorniScalati,
  giorniTotaliUsati,
  maxGiorni,
  giorniRimanenti,
}) {
  return [
    `<a:VC_Calendar:1482706208149475358> **\`${roleLabel}\`** - **<@${effectiveUserId}>** aveva una pausa **annullata**.`,
    `<:VC_Clock:1473359204189474886> Dal **\`${dataRichiesta}\`** al **\`${dataRitorno}\`**`,
    `<:VC_update:1478721333096349817> Giorni scalati: __\`${giorniScalati}\`__ · Totale usati: __\`${giorniTotaliUsati}/${maxGiorni}\`__ (\`${giorniRimanenti}\` rimanenti)`,
    "",
    "<:cancel:1461730653677551691> **__`ANNULLATA`__**",
  ].join("\n");
}

function formatPauseRoleLabelForMessage(guild?, roleChoice?, member?) {
  const normalized = normalizePauseRoleChoice(roleChoice) || PAUSE_ROLE_STAFF;
  const pmRole = guild?.roles?.cache?.get(String(IDs.roles?.PartnerManager || ""));
  const pmLabel = pmRole?.name || "Partner Manager";
  const staffRole = guild?.roles?.cache?.get(String(IDs.roles?.Staff || ""));
  const staffFallback = staffRole?.name || "Staff";
  const staffLabel = member ? getMemberRoleLabel(member) : staffFallback;

  if (normalized === PAUSE_ROLE_PM) return pmLabel;
  if (normalized === PAUSE_ROLE_BOTH) {
    const left = staffLabel || staffFallback;
    if (left && pmLabel && left.toLowerCase() !== pmLabel.toLowerCase()) return `${left} e ${pmLabel}`;
    return left || pmLabel || "Entrambi";
  }
  if (member) return staffLabel;
  return staffFallback;
}

async function buildAcceptedPauseMessageContent(guild?, userId?, pause?, { forPm = false } = {}) {
  const uid = String(userId || "").trim();
  if (!guild || !uid || !pause) return null;
  let member = guild.members?.cache?.get(uid) || null;
  if (!member && guild.members?.fetch) {
    member = await guild.members.fetch(uid).catch(() => null);
  }
  const staffDoc = await getStaffPauseRecord(guild.id, uid);
  const roleChoice = normalizePauseRoleChoice(pause.ruolo || pause.ruoloRichiesto) || PAUSE_ROLE_STAFF;
  const pauseTimingText = pause.halfDay
    ? `ha una mezza giornata di pausa (${pause.halfDay === "mattina" ? "mattina" : "pomeriggio/sera"})`
    : getPauseTimingText(pause.dataRichiesta, pause.dataRitorno);
  const baseLimit = getBasePauseLimit(member, forPm ? PAUSE_ROLE_PM : roleChoice === PAUSE_ROLE_BOTH ? PAUSE_ROLE_STAFF : roleChoice);
  const bonusPause = getStaffPauseBonusDaysTotal(member, staffDoc);
  const maxGiorni = baseLimit + bonusPause;
  const giorniUsati = Number(pause.giorniUsati);
  const used = Number.isFinite(giorniUsati) ? giorniUsati : 0;
  const giorniRimanenti = maxGiorni - used;

  let roleLabel;
  let sameRoleActiveCount = 1;
  let roleLimitWarning = "";

  if (forPm || roleChoice === PAUSE_ROLE_PM) {
    roleLabel = formatPauseRoleLabelForMessage(guild, PAUSE_ROLE_PM, member);
    const overlapPm = await computeStaffersInPauseByRoleForRange(
      guild.id,
      PAUSE_ROLE_PM,
      pause.dataRichiesta,
      pause.dataRitorno,
      uid,
    );
    sameRoleActiveCount = overlapPm + 1;
  } else {
    roleLabel = formatPauseRoleLabelForMessage(guild, PAUSE_ROLE_STAFF, member);
    const rankId = resolvePauseStaffRankRoleId(member, pause);
    if (rankId) {
      const overlap = await computeStaffersInPauseByStaffRankForRange(
        guild,
        guild.id,
        rankId,
        pause.dataRichiesta,
        pause.dataRitorno,
        uid,
        PAUSE_ROLE_STAFF,
      );
      sameRoleActiveCount = overlap + 1;
      const limitKey = getStaffRankLimitKey(rankId);
      const roleLimit = getPauseRoleLimit(limitKey);
      if (roleLimit != null && sameRoleActiveCount > roleLimit) {
        const shown = guild.roles?.cache?.get(rankId)?.name || limitKey;
        roleLimitWarning = `\n\n⚠️ Limite ruolo \`${shown}\` superato (max ${roleLimit} in pausa). Accettata comunque da High Staff.`;
      }
    } else {
      const overlapStaff = await computeStaffersInPauseByRoleForRange(
        guild.id,
        PAUSE_ROLE_STAFF,
        pause.dataRichiesta,
        pause.dataRitorno,
        uid,
      );
      sameRoleActiveCount = overlapStaff + 1;
    }
  }

  return buildAcceptedPauseLogContent({
    roleLabel,
    effectiveUserId: uid,
    pauseTimingText,
    dataRichiesta: pause.dataRichiesta,
    dataRitorno: pause.dataRitorno,
    giorniUsati: used,
    maxGiorni,
    giorniRimanenti,
    sameRoleActiveCount,
    roleLimitWarning,
  });
}

async function getStaffPauseRecord(guildId?, userId?) {
  const g = String(guildId ?? "").trim();
  const u = String(userId ?? "").trim();
  if (!g || !u) return null;
  return ActivityUserProfile.findOne({ guildId: g, userId: u });
}

function getOnePausePerMonthWarning(staffDoc?, normalized?) {
  const pauses = Array.isArray(staffDoc?.staff?.pauses) ? staffDoc.staff.pauses : [];
  const newCountKey = getMonthKeyForPauseCount(normalized?.dataRichiesta, normalized?.dataRitorno);
  if (!newCountKey) return null;
  const excludeIds = new Set();
  if (normalized?.excludePauseId) excludeIds.add(String(normalized.excludePauseId));
  if (Array.isArray(normalized?.excludePauseIds)) {
    for (const id of normalized.excludePauseIds) {
      if (id != null && String(id)) excludeIds.add(String(id));
    }
  }
  const countSameMonth = pauses.filter((p?) => {
    /* pauseHalfDay1: le mezze giornate hanno i loro limiti */
    if (!p || p.status === "rejected" || p.halfDay) return false;
    if (excludeIds.has(String(p._id))) return false;
    const k = getMonthKeyForPauseCount(p.dataRichiesta, p.dataRitorno);
    return k && k.year === newCountKey.year && k.month === newCountKey.month;
  }).length;
  if (countSameMonth >= 1) return "<:VC_Attention:1482534443632558151> Hai già una richiesta pausa in questo mese. L’High Staff può accettare comunque.";
  return null;
}

function getOneWeekBetweenWarning(staffDoc?, excludePauseId = null) {
  const pauses = Array.isArray(staffDoc?.staff?.pauses) ? staffDoc.staff.pauses : [];
  const excludeIds = new Set();
  if (excludePauseId != null && String(excludePauseId)) excludeIds.add(String(excludePauseId));
  if (Array.isArray(excludePauseId)) {
    for (const id of excludePauseId) {
      if (id != null && String(id)) excludeIds.add(String(id));
    }
  }
  const withDate = pauses
    .filter((p?) => p && !p.halfDay && (p.createdAt || p._id) && !excludeIds.has(String(p._id)))
    .map((p?) => ({ ...p, at: p.createdAt ? new Date(p.createdAt).getTime() : 0 }))
    .filter((p?) => p.at > 0)
    .sort((a?, b?) => b.at - a.at);
  const last = withDate[0];
  if (!last) return null;
  const weekAgo = Date.now() - 7 * MS_PER_DAY;
  if (last.at > weekAgo) return "<:VC_Attention:1482534443632558151> Meno di 1 settimana dall’ultima richiesta. L’High Staff può accettare comunque.";
  return null;
}

function getSpanTwoMonthsFiveDaysWarning(normalized?) {
  if (!normalized?.dataRichiesta || !normalized?.dataRitorno) return null;
  const start = parseItalianDate(normalized.dataRichiesta);
  const end = parseItalianDate(normalized.dataRitorno);
  if (!start || !end) return null;
  const startKey = getRomeMonthKey(start);
  const endKey = getRomeMonthKey(end);
  if (!startKey || !endKey) return null;
  if (startKey.year === endKey.year && startKey.month === endKey.month) return null;
  const endDay = end.getUTCDate();
  if (endDay > 5) return "<:VC_Attention:1482534443632558151> La pausa copre due mesi: il ritorno non dovrebbe superare il 5° giorno dell’altro mese. L’High Staff può accettare comunque.";
  return null;
}

function getPauseStatusLabel(pause?, todayUtc?) {
  if (!pause) return "Sconosciuto";
  if (pause.status === "cancelled") return "Annullata";
  if (pause.status === "pending") return "Richiesta";
  if (pause.status === "rejected") return "Rifiutata";
  if (pause.status !== "accepted") return pause.status;

  const start = parseItalianDate(pause.dataRichiesta);
  const end = parseItalianDate(pause.dataRitorno);
  if (!start || !end) return "Accettata";
  if (todayUtc < start) return "Programmata";
  if (todayUtc > end) return "Finita";
  return "In corso";
}

function getPauseTimingText(startRaw?, endRaw?) {
  const start = parseItalianDate(startRaw);
  const end = parseItalianDate(endRaw);
  const today = getTodayUtc();
  if (!start || !end) return "è in pausa";
  if (today < start) return "andrà in pausa";
  if (today > end) return "era in pausa";
  return "è in pausa";
}

function buildPauseInboxLinkRow() {
  const { buildInboxManageLinkRow } = require("../../Web/discordWorkflowUiGate") as typeof import("../../Web/discordWorkflowUiGate");
  return buildInboxManageLinkRow("pause");
}

function buildRequestButtonsRow(_userId?, _pauseId?, _disabled = false) {
  return buildPauseInboxLinkRow();
}

function buildAcceptedButtonsRow(_userId?, _pauseId?, _options: Record<string, any> = {}) {
  return buildPauseInboxLinkRow();
}

async function getPauseReasonFromMessage(client?, pause?) {
  const channelId = pause?.requestChannelId;
  const messageId = pause?.requestMessageId;
  if (!channelId || !messageId || !client) return null;
  try {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased?.()) return null;
    const msg = await channel.messages.fetch(messageId).catch(() => null);
    const content = String(msg?.content ?? "");
    const prefix = "Motivo: ";
    const idx = content.indexOf(prefix);
    if (idx === -1) return null;
    const raw = content.slice(idx + prefix.length).trim();
    return raw ? raw.slice(0, 800) : null;
  } catch {
    return null;
  }
}

function normalizePauseStatusPhrase(content?, targetPhrase?) {
  const raw = String(content || "");
  if (!raw) return raw;
  const target = String(targetPhrase || "");
  const esc = (value?) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return raw
    .replace(new RegExp(esc("è stata in pausa"), "gi"), target)
    .replace(new RegExp(esc("è stato in pausa"), "gi"), target)
    .replace(new RegExp(esc("sarà in pausa"), "gi"), target)
    .replace(new RegExp(esc("andrà in pausa"), "gi"), target)
    .replace(new RegExp(esc("avrà pausa"), "gi"), target)
    .replace(new RegExp(esc("era in pausa"), "gi"), target)
    .replace(new RegExp(esc("è in pausa"), "gi"), target);
}

function getPausePhase(startRaw?, endRaw?, atDate?) {
  const start = parseItalianDate(startRaw);
  const end = parseItalianDate(endRaw);
  const today = atDate instanceof Date ? atDate : getTodayUtc();
  if (!start || !end) return "active";
  if (today < start) return "planned";
  if (today > end) return "ended";
  return "active";
}

function hasActiveAcceptedStaffPause(pauses?, atDate?) {
  if (!Array.isArray(pauses)) return false;
  const today = atDate instanceof Date ? atDate : getTodayUtc();
  return pauses.some((pause?) => {
    if (!pause || pause.status !== "accepted") return false;
    return getPausePhase(pause.dataRichiesta, pause.dataRitorno, today) === "active";
  });
}

function pauseHistoryImpliesBestStaffBonusForYear(pauses?, year?) {
  if (!Number.isFinite(year)) return false;
  if (!Array.isArray(pauses)) return false;
  for (const p of pauses) {
    if (!p || (p.status !== "accepted" && p.status !== "cancelled")) continue;
    if (Number(p.giorniAggiuntivi) < 5) continue;
    const start = parseItalianDate(p.dataRichiesta);
    if (start && start.getUTCFullYear() === year) return true;
    if (p.createdAt) {
      const c = new Date(p.createdAt);
      if (Number.isFinite(c.getTime()) && c.getUTCFullYear() === year) return true;
    }
  }
  return false;
}

function getBestStaffPauseBonusDays(member?, staffDoc?) {
  const roleId = String(IDs.roles?.StafferDelMese || "").trim();
  if (roleId && member?.roles?.cache?.has(roleId)) return 5;
  const y = getTodayUtc().getUTCFullYear();
  const years = Array.isArray(staffDoc?.staff?.bestStaffPauseBonusYears)
    ? staffDoc.staff.bestStaffPauseBonusYears
    : [];
  if (years.includes(y)) return 5;
  const pauses = Array.isArray(staffDoc?.staff?.pauses) ? staffDoc.staff.pauses : [];
  return pauseHistoryImpliesBestStaffBonusForYear(pauses, y) ? 5 : 0;
}

function getValPosTradedPauseBonusDays(staffDoc?) {
  const n = Number(staffDoc?.staff?.valPosTradedPauseBonusDays ?? staffDoc?.valPosTradedPauseBonusDays ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function resolveStafferBonusMonthKey(opts: Record<string, any> = {}) {
  const { resolveStafferBonusMonthKey: resolve } = require("../Staff/stafferDellaSettimanaWeekKey") as typeof import("../Staff/stafferDellaSettimanaWeekKey");
  return resolve(opts);
}

function grantEntryMonthKey(grant?) {
  const mk = coerceMonthKey(grant?.monthKey);
  if (mk) return mk;
  const { monthKeyForStaffWeekKey } = require("../Staff/stafferDellaSettimanaWeekKey") as typeof import("../Staff/stafferDellaSettimanaWeekKey");
  return monthKeyForStaffWeekKey(grant?.weekKey) || "";
}

function listBestStaffWeekPauseGrants(staffDoc?) {
  const raw =
    staffDoc?.staff?.bestStaffWeekPauseBonusWeeks ?? staffDoc?.bestStaffWeekPauseBonusWeeks;
  return Array.isArray(raw) ? raw : [];
}

function getBestStaffWeekPauseBonusGrantedForMonth(
  staffDoc?,
  monthKey = resolveStafferBonusMonthKey({ weekKey: getStaffWeekKeyNow() }),
) {
  const mk = coerceMonthKey(monthKey) || resolveStafferBonusMonthKey({ weekKey: getStaffWeekKeyNow() });
  if (!mk) return 0;
  let total = 0;
  for (const g of listBestStaffWeekPauseGrants(staffDoc)) {
    if (grantEntryMonthKey(g) !== mk) continue;
    const days = Number(g?.days);
    total += Number.isFinite(days) && days > 0 ? Math.floor(days) : 1;
  }
  return total;
}

function computeWeekBonusDaysConsumed(pauses?, monthKey = null) {
  if (!Array.isArray(pauses)) return 0;
  const mk = monthKey == null ? null : coerceMonthKey(monthKey) || String(monthKey || "").trim();
  const { yearStart, yearEnd } = getCurrentYearBoundsUtc();
  let total = 0;
  for (const pause of pauses) {
    if (!pause || (pause.status !== "accepted" && pause.status !== "cancelled")) continue;
    const n = Math.max(0, Math.floor(Number(pause.giorniAggiuntiviSettimana) || 0));
    if (!n) continue;
    const start = parseItalianDate(pause.dataRichiesta);
    if (!start) continue;
    if (start < yearStart || start > yearEnd) continue;
    if (mk) {
      const { monthKeyForRomeDateViaIsoWeek } = require("../Staff/stafferDellaSettimanaWeekKey") as typeof import("../Staff/stafferDellaSettimanaWeekKey");
      if (monthKeyForRomeDateViaIsoWeek(start) !== mk) continue;
    }
    total += n;
  }
  return total;
}

function getBestStaffWeekPauseBonusDaysRemaining(
  staffDoc?,
  monthKey = resolveStafferBonusMonthKey({ weekKey: getStaffWeekKeyNow() }),
) {
  const mk =
    coerceMonthKey(monthKey) || resolveStafferBonusMonthKey({ weekKey: getStaffWeekKeyNow() });
  const granted = getBestStaffWeekPauseBonusGrantedForMonth(staffDoc, mk);
  const spent = computeWeekBonusDaysConsumed(
    Array.isArray(staffDoc?.staff?.pauses) ? staffDoc.staff.pauses : staffDoc?.pauses,
    mk,
  );
  return Math.max(0, granted - spent);
}

function getStaffPauseBonusDaysTotal(member?, staffDoc?) {
  return (
    getBestStaffPauseBonusDays(member, staffDoc) +
    getValPosTradedPauseBonusDays(staffDoc) +
    getBestStaffWeekPauseBonusDaysRemaining(staffDoc)
  );
}

export = { buildAcceptedPauseLogContent, buildCancelledPauseLogContent, formatPauseRoleLabelForMessage, buildAcceptedPauseMessageContent, getStaffPauseRecord, getOnePausePerMonthWarning, getOneWeekBetweenWarning, getPauseStatusLabel, getPauseTimingText, buildPauseInboxLinkRow, buildRequestButtonsRow, buildAcceptedButtonsRow, getPauseReasonFromMessage, normalizePauseStatusPhrase, getPausePhase, hasActiveAcceptedStaffPause, getBestStaffPauseBonusDays, getValPosTradedPauseBonusDays, resolveStafferBonusMonthKey, listBestStaffWeekPauseGrants, computeWeekBonusDaysConsumed, getBestStaffWeekPauseBonusDaysRemaining, getStaffPauseBonusDaysTotal };
