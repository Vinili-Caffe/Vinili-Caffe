const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require("discord.js");
const { getOrCreateStaffDoc } = require("../Staff/staffDocUtils");
const IDs = require("../Config/ids");
const { getOnePausePerMonthWarning, getOneWeekBetweenWarning, normalizePauseRoleChoice, PAUSE_ROLE_STAFF } = require("./pauseHandlersUtils");
const { getGuildChannelCached, getClientChannelCached } = require("../Interaction/interactionEntityCache");
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const IT_MONTHS = { gennaio: 1, feb: 2, febbraio: 2, mar: 3, marzo: 3, apr: 4, aprile: 4, mag: 5, maggio: 5, giu: 6, giugno: 6, lug: 7, luglio: 7, ago: 8, agosto: 8, set: 9, sett: 9, settembre: 9, ott: 10, ottobre: 10, nov: 11, novembre: 11, dic: 12, dicembre: 12 };
const PAUSE_REQUEST_ROLE_IDS = [
  IDs.roles.PartnerManager,
  IDs.roles.Staff,
  IDs.roles.SeniorModerator,
  IDs.roles.Director,
  IDs.roles.HighStaff,
].filter(Boolean);

function getTodayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function parseUserDateInput(raw) {
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

/** Prova a consumare una data dall'array di token (1–3 token: es. `01/02`, `1 agosto`, `1 agosto 2027`). */
function tryParseDateFromTokens(tokens, startIndex) {
  for (let n = 1; n <= 3 && startIndex + n <= tokens.length; n++) {
    const candidate = tokens.slice(startIndex, startIndex + n).join(" ");
    if (parseUserDateInput(candidate)) {
      return { raw: candidate, nextIndex: startIndex + n };
    }
  }
  return null;
}

/**
 * Messaggio canale pause: `<data> - <data> - <motivo>` oppure `<data> <data> <motivo>` (stesso ordine, senza trattini).
 */
function parsePauseChannelMessageContent(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return null;
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

function buildUtcDate(day, month, year) {
  if (!day || !month || !year) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date;
}

function formatDateDDMMYYYY(date) {
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = String(date.getUTCFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

function normalizePauseDates(startRaw, endRaw) {
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
  return { dataRichiesta: formatDateDDMMYYYY(startDate), dataRitorno: formatDateDDMMYYYY(endDate) };
}

function buildPauseRequestButtonsRow(userId, pauseId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`pause_accept:${userId}:${pauseId}`).setLabel("Accetta").setEmoji("<:vegacheckmark:1443666279058772028>").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`pause_reject:${userId}:${pauseId}`).setLabel("Rifiuta").setEmoji("<:vegax:1443934876440068179>").setStyle(ButtonStyle.Danger),
  );
}

async function createPauseRequest({ guild, userId, requesterMention, rawStart, rawEnd, reason, member = null, requestedRole = null }) {
  const memberHasStaff = Boolean(member?.roles?.cache?.has(IDs.roles.Staff));
  const memberHasPm = Boolean(member?.roles?.cache?.has(IDs.roles.PartnerManager));
  const fallbackRole = memberHasPm && !memberHasStaff ? "PartnerManager" : PAUSE_ROLE_STAFF;
  const normalizedRequestedRole = normalizePauseRoleChoice(requestedRole) || fallbackRole;
  const guildId = String(guild?.id ?? "").trim();
  const uid = String(userId ?? "").trim();
  if (!guild || !guildId || !uid) return { ok: false, error: "<a:VC_Alert:1482706673176150077> Dati pausa non validi." };
  const client = guild.client;
  const pauseChannel = guild.channels.cache.get(IDs.channels?.pause) || (await getGuildChannelCached(guild, IDs.channels?.pause)) || (await getClientChannelCached(client, IDs.channels?.pause));
  const normalized = normalizePauseDates(rawStart, rawEnd);
  if (!normalized) {
    return { ok: false, error: "<a:VC_Alert:1482706673176150077> Date non valide. Formati supportati: `oggi`, `domani`, `GG/MM`, `GG/MM/AAAA`, `1 agosto`, `1 agosto 2027`." };
  }
  if (!String(reason || "").trim()) {
    return { ok: false, error: "<a:VC_Alert:1482706673176150077> Devi specificare una motivazione valida." };
  }
  if (!pauseChannel?.isTextBased?.()) {
    return { ok: false, error: "<a:VC_Alert:1482706673176150077> Canale pause non disponibile." };
  }
  const stafferDoc = await getOrCreateStaffDoc(guildId, uid);
  if (!stafferDoc) {
    global.logger?.error?.("[createPauseRequest] getOrCreateStaffDoc returned null", { guildId, userId: uid });
    return { ok: false, error: "<a:VC_Alert:1482706673176150077> Impossibile creare il record staff (guild/user non validi)." };
  }
  if (!stafferDoc.staff) stafferDoc.staff = {};
  if (!Array.isArray(stafferDoc.staff.pauses)) stafferDoc.staff.pauses = [];
  stafferDoc.staff.pauses.push({
    dataRichiesta: normalized.dataRichiesta,
    dataRitorno: normalized.dataRitorno,
    motivazione: reason,
    ruoloRichiesto: normalizedRequestedRole,
    status: "pending",
    createdAt: new Date(),
  });
  stafferDoc.markModified("staff");
  try {
    await stafferDoc.save();
  } catch (err) {
    global.logger?.error?.("[createPauseRequest] save failed", err);
    return { ok: false, error: "<a:VC_Alert:1482706673176150077> Errore nel salvataggio della richiesta pausa. Riprova o contatta chi gestisce il bot." };
  }
  const createdPause = stafferDoc.staff.pauses[stafferDoc.staff.pauses.length - 1];
  const pauseId = String(createdPause?._id || "");

  const requisitiNonRispettati = [];
  if (getOnePausePerMonthWarning(stafferDoc, { ...normalized, excludePauseId: pauseId })) {
    requisitiNonRispettati.push("<:VC_Attention:1482534443632558151> **Una pausa al mese:** hai già una richiesta pausa in questo mese.");
  }
  if (getOneWeekBetweenWarning(stafferDoc, pauseId)) {
    requisitiNonRispettati.push("<:VC_Attention:1482534443632558151> **Almeno 1 settimana tra richieste:** l'ultima richiesta pausa è stata fatta da meno di 7 giorni.");
  }
  const warningBlock = requisitiNonRispettati.length
    ? "\n\n<a:VC_Alert:1482706673176150077> **Requisiti non rispettati:**\n" + requisitiNonRispettati.map((r) => `• ${r}`).join("\n") + "\n\n_L'High Staff può accettare comunque._"
    : "";

  const content = `<:VC_Staff:1494286904089247754> <@&${IDs.roles.HighStaff}> ${requesterMention} ha richiesto una pausa.\n<:VC_Mention:1482526855289634997> Ruolo pausa richiesto: \`${normalizedRequestedRole}\`\n<a:VC_Calendar:1482706208149475358> Data richiesta: ${normalized.dataRichiesta}\n<a:VC_Calendar:1482706208149475358> Data ritorno: ${normalized.dataRitorno}\n<:VC_reason:1478517122929004544> Motivo: ${reason}`;
  const posted = await pauseChannel.send({
    content,
    components: [buildPauseRequestButtonsRow(uid, pauseId)],
  }).catch(() => null);
  if (!posted) {
    createdPause.status = "cancelled";
    stafferDoc.markModified("staff");
    await stafferDoc.save().catch(() => null);
    return { ok: false, error: "<a:VC_Alert:1482706673176150077> Non sono riuscito a inviare la richiesta nel canale." };
  }
  createdPause.requestChannelId = String(pauseChannel.id ?? "").trim();
  createdPause.requestMessageId = posted.id ? String(posted.id) : null;
  stafferDoc.markModified("staff");
  try {
    await stafferDoc.save();
  } catch (err) {
    global.logger?.error?.("[createPauseRequest] save (messageId) failed", err);
  }

  let thread = null;
  try {
    thread = await pauseChannel.threads.create({
      name: `Pausa – ${(member?.user?.username || userId).toString().slice(0, 80)}`,
      type: ChannelType.PrivateThread,
      reason: "Richiesta pausa staff",
    });
  } catch (e) {
    return { ok: true, pauseId };
  }
  await thread.members.add(uid).catch(() => null);
  const highStaffRoleId = String(IDs.roles.HighStaff || "");
  if (highStaffRoleId) {
    const membersWithHighStaff = guild.members.cache.filter((m) => m.roles.cache.has(highStaffRoleId));
    for (const m of membersWithHighStaff.values()) {
      await thread.members.add(m.id).catch(() => null);
    }
  }
  await thread.send({
    content: `<:VC_Staff:1494286904089247754> Discussione per la richiesta pausa di ${requesterMention}. Il messaggio con i pulsanti è nel canale.`,
  }).catch(() => null);
  if (warningBlock) {
    await thread.send({ content: warningBlock.trim() }).catch(() => null);
  }
  createdPause.requestThreadId = String(thread.id ?? "").trim();
  stafferDoc.markModified("staff");
  try {
    await stafferDoc.save();
  } catch (err) {
    global.logger?.error?.("[createPauseRequest] save (threadId) failed", err);
  }
  return { ok: true, pauseId };
}

module.exports = { PAUSE_REQUEST_ROLE_IDS, createPauseRequest, parsePauseChannelMessageContent };
