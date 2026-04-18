const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const IDs = require("../Config/ids");
const {
  MS_PER_DAY,
  countOverlapDays,
  countEffectiveOverlapDays,
  getPauseReasonFromMessage,
  filterPausesByMonth,
  roleChoiceAppliesTo,
  PAUSE_ROLE_PM,
  PAUSE_ROLE_STAFF,
} = require("./pauseHandlersUtils");

const MONTH_LABELS = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

const RESOCONTO_ROLE_RANK = new Map(
  [
    IDs.roles.Member,
    IDs.roles.Helper,
    IDs.roles.Mod,
    IDs.roles.Coordinator,
    IDs.roles.Supervisor,
    IDs.roles.Admin,
    IDs.roles.CoFounder,
    IDs.roles.Founder,
    IDs.roles.PartnerManager,
  ]
    .filter(Boolean)
    .map((roleId, index) => [String(roleId), index]),
);
const ROLE_UP = {
  [String(IDs.roles.Member || "")]: String(IDs.roles.Helper || ""),
  [String(IDs.roles.Helper || "")]: String(IDs.roles.Mod || ""),
  [String(IDs.roles.Mod || "")]: String(IDs.roles.Coordinator || ""),
  [String(IDs.roles.Coordinator || "")]: String(IDs.roles.Supervisor || ""),
};

function isStaffRolesHistoryPexRow(row) {
  const oldRole = String(row?.oldRole || "");
  const newRole = String(row?.newRole || "");
  const oldRank = RESOCONTO_ROLE_RANK.has(oldRole) ? Number(RESOCONTO_ROLE_RANK.get(oldRole)) : null;
  const newRank = RESOCONTO_ROLE_RANK.has(newRole) ? Number(RESOCONTO_ROLE_RANK.get(newRole)) : null;
  const isRankPromotion =
    oldRank != null &&
    newRank != null &&
    newRole &&
    oldRole &&
    newRole !== oldRole &&
    newRank > oldRank;
  const isMappedPromotion = oldRole && newRole && ROLE_UP[oldRole] === newRole;
  const reasonNorm = String(row?.reason || "").toLowerCase();
  const reasonHasDepex = reasonNorm.includes("depex");
  const reasonHasPex = reasonNorm.includes("pex") && !reasonHasDepex;
  return Boolean(isRankPromotion || isMappedPromotion || reasonHasPex);
}

function getFirstRelevantStaffDateForPauseUi(staff, pauseRoleFilter) {
  const prf = String(pauseRoleFilter || "").toLowerCase();
  const history = Array.isArray(staff?.rolesHistory) ? staff.rolesHistory : [];
  let best = null;
  for (const row of history) {
    if (!isStaffRolesHistoryPexRow(row)) continue;
    const d = row?.date ? new Date(row.date) : null;
    if (!d || Number.isNaN(d.getTime())) continue;
    if (!best || d.getTime() < best.getTime()) best = d;
  }
  if (!best && prf === "pm") {
    const pmId = String(IDs.roles.PartnerManager || "");
    if (pmId) {
      for (const row of history) {
        if (String(row?.newRole || "") !== pmId) continue;
        const d = row?.date ? new Date(row.date) : null;
        if (!d || Number.isNaN(d.getTime())) continue;
        if (!best || d.getTime() < best.getTime()) best = d;
      }
    }
  }
  return best;
}

function resolvePauseMonthButtonRange(displayYear, staff, pauseRoleFilter) {
  const now = new Date();
  const todayY = now.getUTCFullYear();
  const todayM = now.getUTCMonth() + 1;
  const y = Number(displayYear);
  if (!Number.isFinite(y)) return { startMonth: 1, endMonth: 12 };
  if (y < todayY) return { startMonth: 1, endMonth: 12 };
  if (y > todayY) return { startMonth: 1, endMonth: 12 };

  const first = getFirstRelevantStaffDateForPauseUi(staff, pauseRoleFilter);
  let startMonth = 1;
  if (first && !Number.isNaN(first.getTime())) {
    const fy = first.getUTCFullYear();
    if (fy < y) startMonth = 1;
    else if (fy === y) startMonth = Math.max(1, Math.min(12, first.getUTCMonth() + 1));
    else startMonth = 1;
  }
  let endMonth = Math.min(12, Math.max(1, todayM));
  startMonth = Math.min(12, Math.max(1, startMonth));
  endMonth = Math.min(12, Math.max(1, endMonth));
  if (startMonth > endMonth) return { startMonth: endMonth, endMonth };
  return { startMonth, endMonth };
}

function buildPauseListMonthRows(targetUserId, year, options = {}) {
  const uid = String(targetUserId ?? "").trim();
  const y = String(Number(year) || new Date().getUTCFullYear());
  if (!uid) return [];
  const prf = String(options.pauseRoleFilter || "").toLowerCase();
  const filtSuffix = prf === "pm" || prf === "staff" ? `:${prf}` : "";
  const { startMonth, endMonth } = resolvePauseMonthButtonRange(Number(y), options.staff, prf);
  const months = [];
  for (let m = startMonth; m <= endMonth; m += 1) months.push(m);
  if (!months.length) {
    const fb = Math.min(12, Math.max(1, new Date().getUTCMonth() + 1));
    months.push(fb);
  }

  const rows = [];
  let current = new ActionRowBuilder();
  for (const m of months) {
    if (current.components.length >= 5) {
      rows.push(current);
      current = new ActionRowBuilder();
    }
    current.addComponents(
      new ButtonBuilder()
        .setCustomId(`pause_list_month:${uid}:${y}:${m}${filtSuffix}`)
        .setLabel(MONTH_LABELS[m - 1])
        .setStyle(ButtonStyle.Secondary),
    );
  }

  const yearCustomId = filtSuffix ? `pause_list:${uid}${filtSuffix}` : `pause_list:${uid}:`;
  const yearBtn = new ButtonBuilder().setCustomId(yearCustomId).setLabel("Anno intero").setStyle(ButtonStyle.Primary);
  if (current.components.length >= 5) {
    rows.push(current);
    current = new ActionRowBuilder();
  }
  current.addComponents(yearBtn);
  rows.push(current);

  return rows;
}

function parseItalianDate(value) {
  if (!value || typeof value !== "string") return null;
  const raw = value.trim();
  let match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  let day = null;
  let month = null;
  let year = null;
  if (match) {
    day = Number(match[1]);
    month = Number(match[2]);
    year = Number(match[3]);
  } else {
    match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  }
  if (!day || !month || !year) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

function getTodayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function getCurrentYearBoundsUtc() {
  const today = getTodayUtc();
  const year = today.getUTCFullYear();
  return { yearStart: new Date(Date.UTC(year, 0, 1)), yearEnd: new Date(Date.UTC(year, 11, 31)) };
}

function getCancelledPauseEffectiveEnd(pause, start, plannedEnd) {
  let effectiveEnd = null;
  if (pause.cancelledAt) {
    const cancelled = new Date(pause.cancelledAt);
    effectiveEnd = new Date(Date.UTC(cancelled.getUTCFullYear(), cancelled.getUTCMonth(), cancelled.getUTCDate()));
  } else if (start) {
    const consumed = Number(pause.giorniUsati);
    if (Number.isFinite(consumed) && consumed > 0) {
      effectiveEnd = new Date(start.getTime() + (consumed - 1) * MS_PER_DAY);
    }
  }
  if (plannedEnd && effectiveEnd && effectiveEnd > plannedEnd) {
    effectiveEnd = plannedEnd;
  }
  return effectiveEnd;
}

function computePauseScaledDaysThisYear(pause, todayUtc, yearStart, yearEnd) {
  const start = parseItalianDate(pause?.dataRichiesta);
  const plannedEnd = parseItalianDate(pause?.dataRitorno);
  if (!start || !plannedEnd) return 0;
  if (pause.status === "cancelled") {
    return countEffectiveOverlapDays(start, getCancelledPauseEffectiveEnd(pause, start, plannedEnd), yearStart, yearEnd);
  }
  if (pause.status === "accepted") {
    if (todayUtc < start) return 0;
    return countEffectiveOverlapDays(start, todayUtc > plannedEnd ? plannedEnd : todayUtc, yearStart, yearEnd);
  }
  return 0;
}

function computeConsumedPauseDays(pauses) {
  if (!Array.isArray(pauses)) return 0;
  const { yearStart, yearEnd } = getCurrentYearBoundsUtc();
  return pauses.reduce((total, pause) => {
    if (!pause) return total;
    const start = parseItalianDate(pause.dataRichiesta);
    const plannedEnd = parseItalianDate(pause.dataRitorno);
    if (pause.status === "accepted") {
      return total + countEffectiveOverlapDays(start, plannedEnd, yearStart, yearEnd);
    }
    if (pause.status === "cancelled") {
      return total + countEffectiveOverlapDays(start, getCancelledPauseEffectiveEnd(pause, start, plannedEnd), yearStart, yearEnd);
    }
    return total;
  }, 0);
}

function getPauseStatusLabel(pause, todayUtc) {
  if (!pause) return "Sconosciuta";
  if (pause.status === "cancelled") return "Annullata";
  if (pause.status === "pending") return "Richiesta";
  if (pause.status !== "accepted") return pause.status;
  const start = parseItalianDate(pause.dataRichiesta);
  const end = parseItalianDate(pause.dataRitorno);
  if (!start || !end) return "Accettata";
  if (todayUtc < start) return "Programmata";
  if (todayUtc > end) return "Finita";
  return "In corso";
}

function splitRowsForEmbeds(rows, limit = 3500) {
  const chunks = [];
  let current = "";
  for (const row of rows) {
    if ((current + "\n" + row).length > limit) {
      chunks.push(current);
      current = row;
      continue;
    }
    current = current ? `${current}\n${row}` : row;
  }
  if (current) chunks.push(current);
  return chunks;
}

async function buildPauseListPayload({ guildId, requesterId, targetUser, isHighStaff, client, filterMonth, pauseRoleFilter }) {
  if (!isHighStaff && String(targetUser?.id || "") !== String(requesterId || "")) {
    return { ok: false, error: "<:vegax:1443934876440068179> Puoi vedere solo le tue pause." };
  }
  const prf = String(pauseRoleFilter || "").toLowerCase();
  const monthOpts = prf === "pm" || prf === "staff" ? { pauseRoleFilter: prf } : {};
  const g = String(guildId ?? "").trim();
  const u = String(targetUser?.id ?? "").trim();
  if (!g || !u) {
    const y = getCurrentYearBoundsUtc().yearStart.getUTCFullYear();
    return {
      ok: true,
      embeds: [
        new EmbedBuilder()
          .setColor("#6f4e37")
          .setDescription(`<:VC_Attention:1482534443632558151> Nessuna pausa trovata per ${targetUser} nell'anno **${y}**.`),
      ],
      components: buildPauseListMonthRows(u, y, { ...monthOpts, staff: null }),
    };
  }
  const stafferRecord = await ActivityUserProfile.findOne(
    { guildId: g, userId: u },
    { "staff.pauses": 1, "staff.rolesHistory": 1 },
  )
    .lean()
    .catch(() => null);
  const monthOptsWithStaff = { ...monthOpts, staff: stafferRecord?.staff ?? null };
  let pauses = Array.isArray(stafferRecord?.staff?.pauses) ? stafferRecord.staff.pauses : [];
  if (prf === "pm") {
    pauses = pauses.filter((p) => roleChoiceAppliesTo(PAUSE_ROLE_PM, p?.ruolo || p?.ruoloRichiesto));
  } else if (prf === "staff") {
    pauses = pauses.filter((p) => roleChoiceAppliesTo(PAUSE_ROLE_STAFF, p?.ruolo || p?.ruoloRichiesto));
  }
  const todayUtc = getTodayUtc();
  const { yearStart, yearEnd } = getCurrentYearBoundsUtc();
  const currentYear = yearStart.getUTCFullYear();
  const monthFilter = Number(filterMonth);
  if (Number.isFinite(monthFilter) && monthFilter >= 1 && monthFilter <= 12) {
    pauses = filterPausesByMonth(pauses, currentYear, monthFilter);
  }
  const rowPromises = pauses.map(async (pause) => {
    const start = parseItalianDate(pause?.dataRichiesta);
    const end = parseItalianDate(pause?.dataRitorno);
    if (!start || !end || countOverlapDays(start, end, yearStart, yearEnd) <= 0) return null;
    const reasonFromMsg = client ? await getPauseReasonFromMessage(client, pause) : null;
    const reason = (reasonFromMsg || String(pause?.motivazione || "").trim().slice(0, 800) || "—");
    const pauseRole = String(pause?.ruolo || pause?.ruoloRichiesto || "Staff");
    return `<:VC_Dot:1482532364222595303> \`${pause.dataRichiesta}\` <a:VC_Arrow:1482706699365257397> \`${pause.dataRitorno}\` | **${getPauseStatusLabel(pause, todayUtc)}** | <:VC_Clock:1473359204189474886> Giorni scalati: \`${computePauseScaledDaysThisYear(pause, todayUtc, yearStart, yearEnd)}\`\n<:VC_Mention:1482526855289634997> Ruolo pausa: \`${pauseRole}\`\n\n<:VC_reason:1478517122929004544> ${reason}`;
  });
  const rows = (await Promise.all(rowPromises)).filter(Boolean);
  const monthLabel = monthFilter >= 1 && monthFilter <= 12 ? ` ${MONTH_LABELS[monthFilter - 1]} ${currentYear}` : "";
  if (!rows.length) {
    const desc = monthLabel
      ? `<:VC_Attention:1482534443632558151> Nessuna pausa trovata per ${targetUser} nel mese **${MONTH_LABELS[monthFilter - 1]} ${currentYear}**.`
      : `<:VC_Attention:1482534443632558151> Nessuna pausa trovata per ${targetUser} nell'anno **${currentYear}**.`;
    return {
      ok: true,
      embeds: [new EmbedBuilder().setColor("#6f4e37").setDescription(desc)],
      components: buildPauseListMonthRows(u, currentYear, monthOptsWithStaff),
    };
  }
  const totalScaledDays = computeConsumedPauseDays(pauses);
  const titleSuffix = monthLabel ? `${MONTH_LABELS[monthFilter - 1]} ${currentYear}` : `${currentYear}-${targetUser.username}`;
  const embeds = splitRowsForEmbeds(rows).map((chunk, index, chunks) =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle(`<a:VC_Calendar:1482706208149475358> Pause ${titleSuffix}${chunks.length > 1 ? ` (${index + 1}/${chunks.length})` : ""}`)
      .setDescription(`${chunk}\n\n<:VC_Clock:1473359204189474886> Totale giorni scalati${monthLabel ? " nel mese" : " anno corrente"}: \`${totalScaledDays}\``),
  );
  return { ok: true, embeds, components: buildPauseListMonthRows(u, currentYear, monthOptsWithStaff) };
}

module.exports = { buildPauseListPayload, buildPauseListMonthRows };