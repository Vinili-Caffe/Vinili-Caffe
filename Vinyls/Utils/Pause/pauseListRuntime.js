const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const Staff = require("../../Schemas/Staff/staffSchema");
const { MS_PER_DAY, countOverlapDays, countEffectiveOverlapDays, getPauseReasonFromMessage, filterPausesByMonth } = require("./pauseHandlersUtils");

const MONTH_LABELS = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

function buildPauseListMonthRows(targetUserId, year) {
  const uid = String(targetUserId ?? "").trim();
  const y = String(Number(year) || new Date().getUTCFullYear());
  if (!uid) return [];
  const rows = [];
  let current = new ActionRowBuilder();
  for (let m = 1; m <= 12; m++) {
    if (current.components.length >= 5) {
      rows.push(current);
      current = new ActionRowBuilder();
    }
    current.addComponents(
      new ButtonBuilder()
        .setCustomId(`pause_list_month:${uid}:${y}:${m}`)
        .setLabel(MONTH_LABELS[m - 1])
        .setStyle(ButtonStyle.Secondary),
    );
  }
  if (current.components.length) rows.push(current);

  const rowYear = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`pause_list:${uid}:`)
      .setLabel("Anno intero")
      .setStyle(ButtonStyle.Primary),
  );
  rows.push(rowYear);

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

async function buildPauseListPayload({ guildId, requesterId, targetUser, isHighStaff, client, filterMonth }) {
  if (!isHighStaff && String(targetUser?.id || "") !== String(requesterId || "")) {
    return { ok: false, error: "<:vegax:1443934876440068179> Puoi vedere solo le tue pause." };
  }
  const g = String(guildId ?? "").trim();
  const u = String(targetUser?.id ?? "").trim();
  if (!g || !u) {
    const y = getCurrentYearBoundsUtc().yearStart.getUTCFullYear();
    return { ok: true, embeds: [new EmbedBuilder().setColor("#6f4e37").setDescription(`<:attentionfromvega:1443651874032062505> Nessuna pausa trovata per ${targetUser} nell'anno **${y}**.`)], components: buildPauseListMonthRows(u, y) };
  }
  const stafferRecord = await Staff.findOne({ guildId: g, userId: u }, { pauses: 1 }).lean().catch(() => null);
  let pauses = Array.isArray(stafferRecord?.pauses) ? stafferRecord.pauses : [];
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
    return `<:VC_Dot:1482532364222595303> \`${pause.dataRichiesta}\` <a:VC_Arrow:1482706699365257397> \`${pause.dataRitorno}\` | **${getPauseStatusLabel(pause, todayUtc)}** | <:VC_Clock:1473359204189474886> Giorni scalati: \`${computePauseScaledDaysThisYear(pause, todayUtc, yearStart, yearEnd)}\`\n\n<:VC_reason:1478517122929004544> ${reason}`;
  });
  const rows = (await Promise.all(rowPromises)).filter(Boolean);
  const monthLabel = monthFilter >= 1 && monthFilter <= 12 ? ` ${MONTH_LABELS[monthFilter - 1]} ${currentYear}` : "";
  if (!rows.length) {
    const desc = monthLabel
      ? `<:attentionfromvega:1443651874032062505> Nessuna pausa trovata per ${targetUser} nel mese **${MONTH_LABELS[monthFilter - 1]} ${currentYear}**.`
      : `<:attentionfromvega:1443651874032062505> Nessuna pausa trovata per ${targetUser} nell'anno **${currentYear}**.`;
    return {
      ok: true,
      embeds: [new EmbedBuilder().setColor("#6f4e37").setDescription(desc)],
      components: buildPauseListMonthRows(u, currentYear),
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
  return { ok: true, embeds, components: buildPauseListMonthRows(u, currentYear) };
}

module.exports = { buildPauseListPayload, buildPauseListMonthRows };