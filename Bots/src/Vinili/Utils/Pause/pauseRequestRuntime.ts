const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require("discord.js") as typeof import("discord.js");
const { getOrCreateStaffDoc } = require("../Staff/staffDocUtils") as typeof import("../Staff/staffDocUtils");
const IDs = require("../Config/ids") as typeof import("../Config/ids");
const { getOnePausePerMonthWarning, getOneWeekBetweenWarning, normalizePauseRoleChoice, PAUSE_ROLE_STAFF, PAUSE_ROLE_PM, PAUSE_ROLE_BOTH } = require("./pauseHandlersUtils") as typeof import("./pauseHandlersUtils");
const { getGuildChannelCached, getClientChannelCached } = require("../Interaction/interactionEntityCache") as typeof import("../Interaction/interactionEntityCache");
const { hydrateGuildMembersForRolePings } = require("../Discord/threadRoleMembers") as typeof import("../Discord/threadRoleMembers");
const {
  isDiscordWorkflowUiEnabled,
  isDiscordWorkflowChannelPostsEnabled,
  buildInboxManageLinkRow,
} = require("../../Web/discordWorkflowUiGate") as typeof import("../../Web/discordWorkflowUiGate");
const { getTodayUtc: getRomeTodayUtc } = require("./pauseDates") as typeof import("./pauseDates");
const { normalizeHalfDay, halfDayLabel, canRequestHalfDayToday, getHalfDayConflict, getHalfDayLimitWarnings } = require("./pauseHalfDay") as typeof import("./pauseHalfDay");
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const IT_MONTHS = { gennaio: 1, feb: 2, febbraio: 2, mar: 3, marzo: 3, apr: 4, aprile: 4, mag: 5, maggio: 5, giu: 6, giugno: 6, lug: 7, luglio: 7, ago: 8, agosto: 8, set: 9, sett: 9, settembre: 9, ott: 10, ottobre: 10, nov: 11, novembre: 11, dic: 12, dicembre: 12 };
const PAUSE_REQUEST_ROLE_IDS = [
  IDs.roles.PartnerManager,
  IDs.roles.Staff,
  IDs.roles.SeniorModerator,
  IDs.roles.Director,
  IDs.roles.HighStaff,
].filter(Boolean);

/** "oggi" in ora di Roma (non UTC: tra mezzanotte e l'una sarebbe ancora ieri) */
function getTodayUtc() {
  return getRomeTodayUtc();
}

function parseUserDateInput(raw?) {
  if (!raw || typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  if (value === "oggi" || value === "today") {
    const today = getTodayUtc();
    return { day: today.getUTCDate(), month: today.getUTCMonth() + 1, year: today.getUTCFullYear(), hasYear: true };
  }
  if (value === "domani" || value === "tomorrow") {
    const today = getTodayUtc();
    const tomorrow = new Date(today.getTime() + MS_PER_DAY);
    return { day: tomorrow.getUTCDate(), month: tomorrow.getUTCMonth() + 1, year: tomorrow.getUTCFullYear(), hasYear: true };
  }
  const slash = value.match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?$/);
  if (slash) {
    const day = Number(slash[1]);
    const month = Number(slash[2]);
    let year = slash[3] ? Number(slash[3]) : null;
    if (year !== null && year < 100) year += 2000;
    return { day, month, year, hasYear: year !== null };
  }
  const words = value.match(/^(\d{1,2})\s+([a-zàèéìòù]+)(?:\s+(\d{2,4}))?$/i);
  if (!words) return null;
  const day = Number(words[1]);
  const monthName = words[2].normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const month = IT_MONTHS[monthName];
  if (!month) return null;
  let year = words[3] ? Number(words[3]) : null;
  if (year !== null && year < 100) year += 2000;
  return { day, month, year, hasYear: year !== null };
}

function tryParseDateFromTokens(tokens?, startIndex?) {
  for (let n = 1; n <= 3 && startIndex + n <= tokens.length; n++) {
    const candidate = tokens.slice(startIndex, startIndex + n).join(" ");
    if (parseUserDateInput(candidate)) {
      return { raw: candidate, nextIndex: startIndex + n };
    }
  }
  return null;
}

const USER_DATE_SCAN_PATTERN = /\b(?:oggi|today|domani|tomorrow|\d{1,2}[\/\-.]\d{1,2}(?:[\/\-.]\d{2,4})?|\d{1,2}\s+(?:gennaio|feb|febbraio|mar|marzo|apr|aprile|mag|maggio|giu|giugno|lug|luglio|ago|agosto|set|sett|settembre|ott|ottobre|nov|novembre|dic|dicembre)(?:\s+\d{2,4})?)\b/gi;

function scanUserDates(raw?) {
  const dates = [];
  const text = String(raw || "");
  for (const match of text.matchAll(USER_DATE_SCAN_PATTERN)) {
    const value = String(match[0] || "").trim();
    if (!value || !parseUserDateInput(value)) continue;
    dates.push({ raw: value, index: match.index || 0, end: (match.index || 0) + value.length });
  }
  return dates;
}

function cleanPauseReasonCandidate(value?) {
  return String(value || "")
    .replace(/\b(?:data\s+)?(?:inizio|richiesta|ritorno|fine|start|end)\b\s*[:=\-–—]*/gi, " ")
    .replace(/\b(?:dal|da|al|a)\b\s*[:=\-–—]*/gi, " ")
    .replace(/\b(?:motivo|motivazione|reason|perche|perché)\b\s*[:=\-–—]*/gi, " ")
    .replace(/[|•·]+/g, " ")
    .replace(/\s*[-–—]{1,3}\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractLabelledPauseReason(raw?) {
  const text = String(raw || "");
  const match = text.match(/\b(?:motivo|motivazione|reason|perche|perché)\b\s*[:=\-–—]?\s*([\s\S]+)$/i);
  if (!match) return "";
  const afterLabel = String(match[1] || "");
  const nextDateLabel = afterLabel.search(/\b(?:data\s+)?(?:inizio|richiesta|ritorno|fine|start|end)\b\s*[:=\-–—]?|\b(?:dal|da|al)\b\s*[:=\-–—]?/i);
  const candidate = nextDateLabel >= 0 ? afterLabel.slice(0, nextDateLabel) : afterLabel;
  return cleanPauseReasonCandidate(candidate);
}

function parsePauseContentByDateScan(trimmed?) {
  const dates = scanUserDates(trimmed);
  if (dates.length < 2) return null;
  const rawStart = dates[0].raw;
  const rawEnd = dates[1].raw;
  const withoutDates = `${trimmed.slice(0, dates[0].index)} ${trimmed.slice(dates[0].end, dates[1].index)} ${trimmed.slice(dates[1].end)}`;
  const reason = extractLabelledPauseReason(trimmed) || cleanPauseReasonCandidate(withoutDates);
  if (!reason) return null;
  return { rawStart, rawEnd, reason };
}

const HALF_DAY_WORDS = /\b(mezza\s+giornata|mattina|mattino|pomeriggio|sera)\b/gi;

/** pauseHalfDay1: "oggi pomeriggio - visita" / "12/11 mattina esame" → una data + fascia. */
function parseHalfDayPauseContent(trimmed?) {
  const words = [...trimmed.matchAll(HALF_DAY_WORDS)].map((m?) => m[1].toLowerCase());
  if (!words.length) return null;
  const dates = scanUserDates(trimmed);
  if (dates.length !== 1) return null;
  const slot = words.some((w?) => w === "mattina" || w === "mattino")
    ? "mattina"
    : words.some((w?) => w === "pomeriggio" || w === "sera")
      ? "pomeriggio"
      : null;
  const reason = cleanPauseReasonCandidate(
    `${trimmed.slice(0, dates[0].index)} ${trimmed.slice(dates[0].end)}`.replace(HALF_DAY_WORDS, " "),
  );
  return { rawStart: dates[0].raw, rawEnd: dates[0].raw, reason, halfDay: slot, halfDayMissingSlot: !slot };
}

function parsePauseChannelMessageContent(raw?) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return null;
  const half = parseHalfDayPauseContent(trimmed);
  if (half) return half;
  const scanned = parsePauseContentByDateScan(trimmed);
  if (scanned) return scanned;
  const hyphen = trimmed.match(/^(.+?)\s-\s(.+?)\s-\s(.+)$/);
  if (hyphen) {
    const rawStart = String(hyphen[1] || "").trim();
    const rawEnd = String(hyphen[2] || "").trim();
    const reason = String(hyphen[3] || "").trim();
    if (!reason) return null;
    return { rawStart, rawEnd, reason };
  }
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length < 3) return null;
  const first = tryParseDateFromTokens(tokens, 0);
  if (!first) return null;
  const second = tryParseDateFromTokens(tokens, first.nextIndex);
  if (!second) return null;
  const reason = tokens.slice(second.nextIndex).join(" ").trim();
  if (!reason) return null;
  return { rawStart: first.raw, rawEnd: second.raw, reason };
}

function buildUtcDate(day?, month?, year?) {
  if (!day || !month || !year) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date;
}

function formatDateDDMMYYYY(date?) {
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = String(date.getUTCFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

function normalizePauseDates(startRaw?, endRaw?) {
  const startParsed = parseUserDateInput(startRaw);
  const endParsed = parseUserDateInput(endRaw);
  if (!startParsed || !endParsed) return null;
  const currentYear = getTodayUtc().getUTCFullYear();
  let startYear = startParsed.hasYear ? startParsed.year : currentYear;
  let endYear;
  if (endParsed.hasYear) {
    endYear = endParsed.year;
  } else if (startParsed.hasYear) {
    endYear = startYear;
  } else {
    endYear = currentYear;
  }
  let startDate = buildUtcDate(startParsed.day, startParsed.month, startYear);
  let endDate = buildUtcDate(endParsed.day, endParsed.month, endYear);
  if (!startDate || !endDate) return null;
  if (!endParsed.hasYear && endDate < startDate) {
    endYear += 1;
    endDate = buildUtcDate(endParsed.day, endParsed.month, endYear);
    if (!endDate) return null;
  }
  if (!startParsed.hasYear && endParsed.hasYear && startDate > endDate) {
    startYear = endYear - 1;
    startDate = buildUtcDate(startParsed.day, startParsed.month, startYear);
    if (!startDate) return null;
  }
  if (endDate < startDate) return null;
  return { dataRichiesta: formatDateDDMMYYYY(startDate), dataRitorno: formatDateDDMMYYYY(endDate), startDate };
}

function formatRuoloPausaRichiestoInMessage(guild?, normalizedOrRawRole?) {
  const n = normalizePauseRoleChoice(normalizedOrRawRole);
  const staffRole = guild?.roles?.cache?.get(String(IDs.roles?.Staff || ""));
  const pmRole = guild?.roles?.cache?.get(String(IDs.roles?.PartnerManager || ""));
  const staffName = staffRole?.name || "Staff";
  const pmName = pmRole?.name || "Partner Manager";
  if (n === PAUSE_ROLE_BOTH) return `${staffName} e ${pmName}`;
  if (n === PAUSE_ROLE_PM) return pmName;
  if (n === PAUSE_ROLE_STAFF) return staffName;
  return String(normalizedOrRawRole || "").trim() || staffName;
}

function isSiteApiProcess() {
  return ["1", "true", "yes", "on"].includes(String(process.env.SITE_API_PROCESS || "").trim().toLowerCase());
}

async function createPauseRequest({ guild, userId, requesterMention, rawStart, rawEnd, reason, member = null, requestedRole = null, halfDay = null }) {
  /* pauseHalfDay1: mezza giornata = una data sola + fascia; si può chiedere anche per oggi se la fascia non è iniziata */
  const halfSlot = normalizeHalfDay(halfDay);
  const memberHasStaff = Boolean(member?.roles?.cache?.has(IDs.roles.Staff));
  const memberHasPm = Boolean(member?.roles?.cache?.has(IDs.roles.PartnerManager));
  const fallbackRole = memberHasPm && !memberHasStaff ? "PartnerManager" : PAUSE_ROLE_STAFF;
  const normalizedRequestedRole = normalizePauseRoleChoice(requestedRole) || fallbackRole;
  const guildId = String(guild?.id ?? "").trim();
  const uid = String(userId ?? "").trim();
  if (!guild || !guildId || !uid) return { ok: false, error: "<a:VC_Alert:1482706673176150077> Dati pausa non validi." };
  const mention =
    typeof requesterMention === "string" && /<@!?\d+>/.test(requesterMention)
      ? requesterMention
      : `<@${uid}>`;
  const client = guild.client;
  const normalized = normalizePauseDates(rawStart, halfSlot ? rawStart : rawEnd);
  if (!normalized) {
    return { ok: false, error: "<a:VC_Alert:1482706673176150077> Date non valide. Formati supportati: `oggi`, `domani`, `GG/MM`, `GG/MM/AAAA`, `1 agosto`, `1 agosto 2027`." };
  }
  const romeToday = getRomeTodayUtc();
  const sameDay = Boolean(halfSlot) && normalized.startDate.getTime() === romeToday.getTime();
  if (halfSlot) {
    if (normalized.startDate < romeToday) {
      return { ok: false, error: "<a:VC_Alert:1482706673176150077> Non puoi chiedere una mezza giornata per una data già passata." };
    }
    if (sameDay && !canRequestHalfDayToday(halfSlot)) {
      return {
        ok: false,
        error: `<a:VC_Alert:1482706673176150077> La fascia **${halfDayLabel(halfSlot)}** di oggi è già iniziata: per oggi la mattina si chiede entro le 9, il pomeriggio entro le 14.`,
      };
    }
  } else if (normalized.startDate <= getTodayUtc()) {
    return { ok: false, error: "<a:VC_Alert:1482706673176150077> La pausa deve iniziare almeno da domani. Per oggi puoi chiedere solo una mezza giornata." };
  }
  if (!String(reason || "").trim()) {
    return { ok: false, error: "<a:VC_Alert:1482706673176150077> Devi specificare una motivazione valida." };
  }
  const discordPosts = isDiscordWorkflowChannelPostsEnabled();
  const pauseChannel = discordPosts
    ? guild.channels.cache.get(IDs.channels?.pause) ||
      (await getGuildChannelCached(guild, IDs.channels?.pause)) ||
      (await getClientChannelCached(client, IDs.channels?.pause))
    : null;
  if (discordPosts && !pauseChannel?.isTextBased?.()) {
    return { ok: false, error: "<a:VC_Alert:1482706673176150077> Canale pause non disponibile." };
  }
  const stafferDoc = await getOrCreateStaffDoc(guildId, uid);
  if (!stafferDoc) {
    global.logger?.error?.("[createPauseRequest] getOrCreateStaffDoc returned null", { guildId, userId: uid });
    return { ok: false, error: "<a:VC_Alert:1482706673176150077> Impossibile creare il record staff (guild/user non validi)." };
  }
  if (!stafferDoc.staff) stafferDoc.staff = {};
  if (!Array.isArray(stafferDoc.staff.pauses)) stafferDoc.staff.pauses = [];
  if (halfSlot) {
    const conflict = getHalfDayConflict(stafferDoc.staff.pauses, { day: normalized.startDate, slot: halfSlot });
    if (conflict) return { ok: false, error: `<a:VC_Alert:1482706673176150077> ${conflict}` };
  }
  /* pauseBothSplit1: Entrambi → due richieste indipendenti (Staff + Partner Manager) */
  const roleTracks =
    normalizedRequestedRole === PAUSE_ROLE_BOTH
      ? [PAUSE_ROLE_STAFF, PAUSE_ROLE_PM]
      : [normalizedRequestedRole];
  const pauseGroupId =
    roleTracks.length > 1
      ? `both:${uid}:${normalized.dataRichiesta}:${normalized.dataRitorno}:${Date.now().toString(36)}`
      : null;
  const createdAt = new Date();
  for (const track of roleTracks) {
    stafferDoc.staff.pauses.push({
      dataRichiesta: normalized.dataRichiesta,
      dataRitorno: normalized.dataRitorno,
      motivazione: reason,
      ruoloRichiesto: track,
      pauseGroupId,
      halfDay: halfSlot,
      richiestaInGiornata: sameDay,
      status: "pending",
      createdAt,
    });
  }
  stafferDoc.markModified("staff");
  try {
    await stafferDoc.save();
  } catch (err) {
    global.logger?.error?.("[createPauseRequest] save failed", err);
    return { ok: false, error: "<a:VC_Alert:1482706673176150077> Errore nel salvataggio della richiesta pausa. Riprova o contatta chi gestisce il bot." };
  }
  const createdPauses = stafferDoc.staff.pauses.slice(-roleTracks.length);
  const pauseIds = createdPauses.map((p?) => String(p?._id || "")).filter(Boolean);
  const primaryPause = createdPauses[0];
  const pauseId = pauseIds[0] || "";

  const requisitiNonRispettati = [];
  if (halfSlot) {
    for (const w of getHalfDayLimitWarnings(stafferDoc.staff.pauses, { day: normalized.startDate, excludePauseIds: pauseIds })) {
      requisitiNonRispettati.push(`<:VC_Attention:1482534443632558151> ${w}`);
    }
  } else if (getOnePausePerMonthWarning(stafferDoc, { ...normalized, excludePauseIds: pauseIds })) {
    requisitiNonRispettati.push("<:VC_Attention:1482534443632558151> **Una pausa al mese:** hai già una richiesta pausa in questo mese.");
  }
  if (!halfSlot && getOneWeekBetweenWarning(stafferDoc, pauseIds)) {
    requisitiNonRispettati.push("<:VC_Attention:1482534443632558151> **Almeno 1 settimana tra richieste:** l'ultima richiesta pausa è stata fatta da meno di 7 giorni.");
  }
  const warningBlock = requisitiNonRispettati.length
    ? "\n\n<a:VC_Alert:1482706673176150077> **Requisiti non rispettati:**\n" + requisitiNonRispettati.map((r?) => `• ${r}`).join("\n") + "\n\n_L'High Staff può accettare comunque._"
    : "";

  const highStaffRoleMention =
    pauseChannel?.guild?.roles?.cache?.get(IDs.roles.HighStaff) ? `<@&${IDs.roles.HighStaff}>` : "High Staff";

  if (discordPosts && pauseChannel?.isTextBased?.()) {
    const discordUi = isDiscordWorkflowUiEnabled();
    let sharedThread = null;
    for (let i = 0; i < createdPauses.length; i += 1) {
      const createdPause = createdPauses[i];
      const thisPauseId = String(createdPause?._id || "");
      const trackLabel = formatRuoloPausaRichiestoInMessage(guild, createdPause.ruoloRichiesto);
      const pairNote =
        createdPauses.length > 1
          ? `\n<:VC_Attention:1482534443632558151> Richiesta separata (${i + 1}/${createdPauses.length}): puoi accettare/rifiutare questo ruolo indipendentemente dall'altro.`
          : "";
      const periodLines = halfSlot
        ? `<a:VC_Calendar:1482706208149475358> Giorno: ${normalized.dataRichiesta}${sameDay ? " (oggi)" : ""}\n<:VC_Clock:1473359204189474886> Fascia: **${halfDayLabel(halfSlot)}**`
        : `<a:VC_Calendar:1482706208149475358> Data richiesta: ${normalized.dataRichiesta}\n<a:VC_Calendar:1482706208149475358> Data ritorno: ${normalized.dataRitorno}`;
      const content = `<:VC_Staff:1494286904089247754> ${highStaffRoleMention} ${mention} ha richiesto ${halfSlot ? "una mezza giornata di pausa" : "una pausa"}.\n<:VC_Mention:1482526855289634997> Ruolo pausa richiesto: **${trackLabel}**${pairNote}\n${periodLines}\n<:VC_reason:1478517122929004544> Motivo: ${reason}${i === 0 ? warningBlock : ""}`;
      const pauseComponents = [buildInboxManageLinkRow("pause")];
      const posted = await pauseChannel
        .send({
          content,
          components: pauseComponents,
          __skipNoticeEmbed: true,
        })
        .catch(() => null);
      if (!posted) {
        for (const p of createdPauses) p.status = "cancelled";
        stafferDoc.markModified("staff");
        await stafferDoc.save().catch(() => null);
        return {
          ok: false,
          error:
            "<a:VC_Alert:1482706673176150077> Non sono riuscito a inviare la richiesta nel canale.",
        };
      }
      createdPause.requestChannelId = String(pauseChannel.id ?? "").trim();
      createdPause.requestMessageId = posted.id ? String(posted.id) : null;

      if (discordUi && i === 0) {
        try {
          sharedThread = await pauseChannel.threads.create({
            name: `Pausa – ${(member?.user?.username || userId).toString().slice(0, 80)}`,
            type: ChannelType.PrivateThread,
            reason: "Richiesta pausa staff",
          });
        } catch (_) {
          sharedThread = null;
        }
        if (sharedThread) {
          await sharedThread.members.add(uid).catch(() => null);
          const highStaffRoleId = String(IDs.roles.HighStaff || "");
          if (highStaffRoleId) {
            await hydrateGuildMembersForRolePings(guild, "[pause thread HighStaff]");
            const membersWithHighStaff = guild.members.cache.filter((m?) =>
              m.roles.cache.has(highStaffRoleId),
            );
            for (const m of membersWithHighStaff.values()) {
              if (m.user?.bot) continue;
              await sharedThread.members.add(m.id).catch(() => null);
            }
          }
          await sharedThread
            .send({
              content:
                createdPauses.length > 1
                  ? `<:VC_Staff:1494286904089247754> Discussione per le richieste pausa di ${mention} (ruoli separati: accettazione indipendente). I messaggi con i pulsanti sono nel canale.`
                  : `<:VC_Staff:1494286904089247754> Discussione per la richiesta pausa di ${mention}. Il messaggio con i pulsanti è nel canale.`,
              __skipNoticeEmbed: true,
            })
            .catch(() => null);
          if (warningBlock) {
            await sharedThread
              .send({ content: warningBlock.trim(), __skipNoticeEmbed: true })
              .catch(() => null);
          }
        }
      }
      if (sharedThread) createdPause.requestThreadId = String(sharedThread.id ?? "").trim();
    }
    stafferDoc.markModified("staff");
    try {
      await stafferDoc.save();
    } catch (err) {
      global.logger?.error?.("[createPauseRequest] save (messageId) failed", err);
    }
    if (!isSiteApiProcess()) {
    }
  }

  try {
    const { upsertPauseWorkflowFromPause, syncPausesToWorkflowStore } = require("../../features/workflow/siteStaffWorkflowStore") as typeof import("../../features/workflow/siteStaffWorkflowStore");
    for (const createdPause of createdPauses) {
      await upsertPauseWorkflowFromPause(client, guild, uid, createdPause);
    }
    void syncPausesToWorkflowStore(guild.client, guild.id).catch(() => 0);
  } catch (_) {}

  /* pauseHalfDay1: mezza giornata per oggi nei limiti → accettata subito; l'High Staff può revocarla dalla pratica */
  let autoAccepted = false;
  if (halfSlot && sameDay && !requisitiNonRispettati.length) {
    try {
      const { updatePauseInDb } = require("./pauseDb") as typeof import("./pauseDb");
      const { acceptPauseRequestWeb } = require("./pauseWebActionsRuntime") as typeof import("./pauseWebActionsRuntime");
      const botMember = guild.members?.me || null;
      autoAccepted = true;
      for (const createdPause of createdPauses) {
        const thisId = String(createdPause?._id || "");
        if (!thisId) continue;
        await updatePauseInDb(guildId, uid, thisId, { autoAccepted: true });
        const accepted = await acceptPauseRequestWeb(client, guild, botMember, uid, thisId);
        if (!accepted?.ok) {
          autoAccepted = false;
          await updatePauseInDb(guildId, uid, thisId, { autoAccepted: false });
        }
      }
    } catch (err) {
      autoAccepted = false;
      global.logger?.error?.("[createPauseRequest] auto-accept mezza giornata", err);
    }
  }

  try {
    const { notifyInboxStaffNewItem } = require("../../features/workflow/siteStaffWorkflowNotifications") as typeof import("../../features/workflow/siteStaffWorkflowNotifications");
    const subjectName =
      String(member?.displayName || member?.user?.globalName || member?.user?.username || "").trim() ||
      uid;
    const period = halfSlot
      ? `${normalized.dataRichiesta}${sameDay ? " (oggi)" : ""} · ${halfDayLabel(halfSlot).toLowerCase()}`
      : `${normalized.dataRichiesta} → ${normalized.dataRitorno}`;
    for (const createdPause of createdPauses) {
      const thisId = String(createdPause?._id || "");
      if (!thisId) continue;
      const trackLabel = formatRuoloPausaRichiestoInMessage(guild, createdPause.ruoloRichiesto);
      void notifyInboxStaffNewItem({
        guild,
        queue: "pause",
        subjectUserId: uid,
        subjectName,
        title: autoAccepted ? "Mezza giornata accettata in automatico" : halfSlot ? "Nuova richiesta mezza giornata" : "Nuova richiesta pausa",
        body: autoAccepted
          ? `${subjectName} ha una mezza giornata di pausa · ${trackLabel} (${period}). Se non va bene puoi revocarla dalla pratica.`
          : `${subjectName} ha richiesto ${halfSlot ? "una mezza giornata" : "una pausa"} · ${trackLabel} (${period}).`,
        pauseId: thisId,
        dedupeKey: `inbox:pause:new:${thisId}`,
      }).catch(() => 0);
    }
  } catch (_) {}
  return {
    ok: true,
    pauseId,
    pauseIds,
    roleTracks,
    pauseGroupId,
    primaryPauseId: pauseId,
    halfDay: halfSlot,
    autoAccepted,
  };
}

export = { PAUSE_REQUEST_ROLE_IDS, createPauseRequest, parsePauseChannelMessageContent, formatRuoloPausaRichiestoInMessage };