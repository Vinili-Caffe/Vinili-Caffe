/** Workflow staff: da documento del database a voce di elenco e dettaglio. */
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { getPauseStatusLabel, getPausePhase, getTodayUtc, formatPauseRoleLabelForMessage } = require("../../site/staff/pause/pauseHandlersUtils") as typeof import("../../site/staff/pause/pauseHandlersUtils");
const { stripDiscordDecorations, weekKeyFromDate, formatWeekLabel, normalizeStatus, statusLabelFor, pauseTrackRoleKey, cleanPauseSubjectDisplayName, pauseRoleDisplayLabel, extractResocontoAzioneText, formatResocontoProposedLabel, buildResocontoInboxPreview, deriveResocontoStaffFlags, deriveResocontoStatusLabel, resolveResocontoDocStatus, normalizeResocontoActionKey, parseResocontoBodyFields } = require("./workflowLabels") as typeof import("./workflowLabels");
const { pickSubjectDisplayName, hasRealDiscordAvatarUrl, preferAnimatedStoredAvatarUrl, liveWorkflowAvatarUrl, cleanAppealPreviewText, readStoredSubject } = require("./workflowSubjects") as typeof import("./workflowSubjects");

function docToListItem(doc?, memberCache?) {
  const queue = String(doc?.workflowQueue || "");
  const status = queue === "resoconti" ? resolveResocontoDocStatus(doc) : normalizeStatus(doc?.status, "pending");
  const userId = String(doc?.userId || "");
  const member = memberCache?.get?.(userId) || null;
  const stored = readStoredSubject(doc);
  const displayName =
    pickSubjectDisplayName(
      userId,
      member?.displayName,
      member?.user?.globalName,
      member?.user?.username,
      stored.displayName,
    ) || stored.displayName || "";
  const decidedBy = String(doc?.workflowDecidedBy || "").trim();
  const decidedMember = decidedBy && !/^system$/i.test(decidedBy) ? memberCache?.get?.(decidedBy) || null : null;
  const storedDecidedName = String(doc?.workflowDecidedByName || "").trim();
  let decidedByName = "";
  if (/^system$/i.test(decidedBy) || /^system$/i.test(storedDecidedName)) {
    decidedByName = "Sistema";
  } else {
    decidedByName =
      pickSubjectDisplayName(
        decidedBy,
        storedDecidedName,
        decidedMember?.displayName,
        decidedMember?.user?.globalName,
        decidedMember?.user?.username,
      ) ||
      (storedDecidedName && !/^\d{16,22}$/.test(storedDecidedName) ? storedDecidedName.slice(0, 120) : "") ||
      "";
  }
  const createdFromMsg = snowflakeToDate(doc?.workflowMessageId);
  const createdAt = createdFromMsg || (doc?.createdAt ? new Date(doc.createdAt) : null);
  const avatarUrl =
    liveWorkflowAvatarUrl(member, member?.user, 128) ||
    preferAnimatedStoredAvatarUrl(stored.avatarUrl, 128) ||
    (hasRealDiscordAvatarUrl(stored.avatarUrl) ? String(stored.avatarUrl).trim() : "") ||
    "";
  const base = {
    recordId: String(doc?._id || ""),
    dedupeKey: String(doc?.dedupeKey || ""),
    userId,
    displayName: stripDiscordDecorations(displayName) || displayName,
    avatarUrl,
    title: stripDiscordDecorations(doc?.title || ""),
    preview: stripDiscordDecorations(doc?.body || ""),
    createdAt: createdAt ? createdAt.toISOString() : null,
    status,
    statusLabel: statusLabelFor(status, doc?.workflowFields?.statusLabel || doc?.staffReason || null),
    canAct: status === "pending",
    decidedBy: decidedBy || null,
    decidedByName: decidedByName || null,
    decidedAt: doc?.decidedAt ? new Date(doc.decidedAt).toISOString() : null,
  };
  if (queue === "pause") {
    const track = pauseTrackRoleKey(doc?.workflowFields || {});
    const roleLabel = pauseRoleDisplayLabel(doc?.workflowFields || {}, member, member?.guild || null);
    const start = String(doc?.workflowFields?.start || doc?.workflowFields?.dataRichiesta || "");
    const end = String(doc?.workflowFields?.end || doc?.workflowFields?.dataRitorno || "");
    const today = getTodayUtc();
    const liveStatusLabel =
      status === "accepted"
        ? getPauseStatusLabel(
            { status: "accepted", dataRichiesta: start, dataRitorno: end },
            today,
          )
        : statusLabelFor(status, doc?.workflowFields?.statusLabel || doc?.staffReason || null);
    const cleanedName =
      cleanPauseSubjectDisplayName(displayName, userId) ||
      cleanPauseSubjectDisplayName(stored.displayName, userId) ||
      displayName;
    return {
      ...base,
      displayName: cleanedName || base.displayName,
      id: String(doc?.workflowPauseId || ""),
      start,
      end,
      motivazione: stripDiscordDecorations(doc?.reason || doc?.body || ""),
      ruolo: roleLabel || track,
      ruoloLabel: roleLabel || track,
      ruoloRichiesto: roleLabel || track,
      ruoloTrack: track,
      phase: getPausePhase(start, end, today),
      statusLabel: liveStatusLabel,
      halfDay: doc?.workflowFields?.halfDay || null,
      autoAccepted: Boolean(doc?.workflowFields?.autoAccepted),
    };
  }
  if (queue === "candidature") {
    return {
      ...base,
      messageId: String(doc?.workflowMessageId || ""),
      channelId: String(doc?.workflowChannelId || ""),
      type: String(doc?.workflowType || ""),
    };
  }
  if (queue === "appelli") {
    return {
      ...base,
      preview: cleanAppealPreviewText(doc?.body || doc?.content || base.preview || ""),
      messageId: String(doc?.workflowMessageId || ""),
      channelId: String(doc?.workflowChannelId || ""),
      kind: String(doc?.workflowKind || ""),
    };
  }
  /* boardsSchedaIdFix1: revisione → id scheda = workflowMessageId (NON _id workflow) */
  if (queue === "revisione") {
    const listingId = String(doc?.workflowMessageId || "").trim();
    const kind = String(doc?.workflowKind || doc?.workflowType || "server").trim().toLowerCase() || "server";
    return {
      ...base,
      id: listingId,
      listingId,
      messageId: listingId,
      channelId: String(doc?.workflowChannelId || ""),
      kind: kind === "bot" || kind === "bots" ? "bot" : "server",
      type: kind === "bot" || kind === "bots" ? "bot" : "server",
    };
  }
  if (queue === "resoconti") {
    const weekKey =
      String(doc?.workflowWeekKey || "").trim() ||
      weekKeyFromDate(createdFromMsg || doc?.createdAt) ||
      "";
    const actionKey = normalizeResocontoActionKey(doc?.workflowActionKey || "");
    const fullContent = String(doc?.content || doc?.body || "");
    const azioneText = extractResocontoAzioneText(fullContent);
    const proposedLabel = formatResocontoProposedLabel(azioneText, actionKey);
    const wf =
      doc?.workflowFields && typeof doc.workflowFields === "object" && !Array.isArray(doc.workflowFields)
        ? doc.workflowFields
        : {};
    const flags = deriveResocontoStaffFlags(fullContent, {
      azioneText,
      workflowFields: wf,
    });
    return {
      ...base,
      preview:
        buildResocontoInboxPreview(fullContent, {
          kind: String(doc?.workflowKind || ""),
          proposedLabel,
          weeklyMessages: wf.weeklyMessages,
          weeklyVoiceSeconds: wf.weeklyVoiceSeconds,
          weeklyPartners: wf.weeklyPartners,
        }) ||
        stripDiscordDecorations(fullContent, { keepNewlines: false, keepCustomEmoji: false }).slice(0, 180),
      messageId: String(doc?.workflowMessageId || ""),
      channelId: String(doc?.workflowChannelId || ""),
      kind: String(doc?.workflowKind || ""),
      actionKey,
      proposedLabel,
      roleId: doc?.workflowRoleId ? String(doc.workflowRoleId) : null,
      roleLabel: (() => {
        /* pauseRolePrecise1 / resoRolePrecise1: mai lasciare generico "Staff" se abbiamo roleId */
        const kind = String(doc?.workflowKind || "").trim().toLowerCase();
        if (kind === "p") return "Partner Manager";
        const rid = String(doc?.workflowRoleId || "").trim();
        const guild = member?.guild || null;
        const byId = {
          [String(IDs.roles.Helper || "")]: "Helper",
          [String(IDs.roles.Mod || "")]: "Mod",
          [String(IDs.roles.SeniorModerator || "")]: "Senior Moderator",
          [String(IDs.roles.Director || "")]: "Director",
          [String(IDs.roles.HighStaff || "")]: "High Staff",
          [String(IDs.roles.PartnerManager || "")]: "Partner Manager",
          [String(IDs.roles.Staff || "")]: "Staff",
        };
        if (rid) {
          const live = guild?.roles?.cache?.get?.(rid);
          const name = String(live?.name || byId[rid] || "").trim();
          if (name) return name;
        }
        try {
          if (member) {
            const ranked = formatPauseRoleLabelForMessage(guild, "Staff", member);
            if (ranked && !/^(staff)$/i.test(ranked)) return ranked;
          }
        } catch (_) {}
        if (kind === "s") return byId[rid] || "";
        return "";
      })(),
      weekKey,
      weekLabel: formatWeekLabel(weekKey),
      statusLabel: deriveResocontoStatusLabel(doc),
      isNewStaff: flags.isNewStaff,
      inPause: flags.inPause,
      pauseEnded: flags.pauseEnded,
      pauseNote: flags.pauseNote,
      weeklyMessages: wf.weeklyMessages != null ? Number(wf.weeklyMessages) : null,
      weeklyVoiceSeconds: wf.weeklyVoiceSeconds != null ? Number(wf.weeklyVoiceSeconds) : null,
      weeklyPartners: wf.weeklyPartners != null ? Number(wf.weeklyPartners) : null,
      weeklySanctions: wf.weeklySanctions != null ? Number(wf.weeklySanctions) : null,
      activityGrade: wf.activityGrade != null ? String(wf.activityGrade) : "",
      behaviorGrade: wf.behaviorGrade != null ? String(wf.behaviorGrade) : "",
      azioneDisplay: wf.azioneDisplay != null ? String(wf.azioneDisplay) : "",
      activityLimits:
        wf.activityLimits && typeof wf.activityLimits === "object" && !Array.isArray(wf.activityLimits)
          ? {
              messages: Number(wf.activityLimits.messages) || 0,
              hours: Number(wf.activityLimits.hours) || 0,
            }
          : null,
      sanctionLimit:
        wf.sanctionLimit != null && Number.isFinite(Number(wf.sanctionLimit))
          ? Number(wf.sanctionLimit)
          : null,
      costanzaChart: Array.isArray(wf.costanzaChart)
        ? wf.costanzaChart
            .map((p?) => ({
              dayKey: String(p?.dayKey || "").trim(),
              text: Math.max(0, Math.floor(Number(p?.text) || 0)),
              voiceSeconds: Math.max(0, Math.floor(Number(p?.voiceSeconds) || 0)),
            }))
            .filter((p?) => p.dayKey)
            .sort((a?, b?) => String(a.dayKey).localeCompare(String(b.dayKey)))
        : [],
      rolesHistory: Array.isArray(wf.rolesHistory) ? wf.rolesHistory : [],
    };
  }
  return base;
}

function parseNumberedQaBlocks(text?) {
  const raw = stripDiscordDecorations(text || "", { keepNewlines: true });
  if (!raw) return [];
  const normalized = raw
    .replace(/(\d{1,2})\\\./g, "$1.")
    .replace(/\*\*/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!normalized) return [];

  const lines = normalized.split("\n");
  const blocks = [];
  let expected = 1;
  let current = null;

  const flush = () => {
    if (!current) return;
    const name = String(current.name || "").trim();
    let value = String(current.value || "").trim();
    if (!name && !value) {
      current = null;
      return;
    }
    const qInline = name.match(/^(\d{1,2}\.\s*[\s\S]{1,280}?\?)\s+([\s\S]+)$/);
    if (qInline && !value) {
      blocks.push({ name: qInline[1].trim(), value: qInline[2].trim() || "—" });
    } else {
      blocks.push({ name: name || `Domanda ${blocks.length + 1}`, value: value || "—" });
    }
    current = null;
  };

  for (const line of lines) {
    const m = String(line || "").match(/^(\d{1,2})\.\s*(.*)$/);
    const num = m ? Number(m[1]) : 0;
    if (m && Number.isFinite(num) && num === expected) {
      flush();
      const rest = String(m[2] || "").trim();
      /* idDiscordLabelFix1: "ID Discord" non deve diventare name=ID value=Discord. */
      const idLine =
        rest.match(/^(ID\s+Discord)(?:\s+(.+))?$/i) || rest.match(/^(ID)(?:\s+(.+))?$/i);
      const ageLine = rest.match(/^(Et[aà])(?:\s+(.+))?$/i);
      if (idLine) {
        current = { name: `${num}. ${idLine[1]}`, value: String(idLine[2] || "").trim() };
      } else if (ageLine) {
        current = { name: `${num}. ${ageLine[1]}`, value: String(ageLine[2] || "").trim() };
      } else {
        current = { name: `${num}. ${rest}`.trim(), value: "" };
      }
      expected += 1;
      continue;
    }
    if (!current) continue;
    current.value = current.value ? `${current.value}\n${line}` : line;
  }
  flush();
  return blocks;
}

function buildDetailFields(doc?, member = null) {
  const queue = String(doc?.workflowQueue || "");
  const keepEmoji = false;
  const body = stripDiscordDecorations(doc?.content || doc?.body || "", {
    keepNewlines: true,
    keepCustomEmoji: keepEmoji,
  });
  if (queue === "resoconti") {
    const resocontoFields = parseResocontoBodyFields(body);
    if (resocontoFields.length) return resocontoFields;
  }
  if (queue === "candidature") {
    const candidatureFields = parseNumberedQaBlocks(doc?.content || doc?.body || "");
    if (candidatureFields.length) return candidatureFields;
  }
  const wf = doc?.workflowFields;
  if (Array.isArray(wf) && wf.length) {
    const status = normalizeStatus(doc?.status, "pending");
    const rows = wf
      .map((field?) => {
        const name = stripDiscordDecorations(field?.name || "", { keepNewlines: true });
        let value = stripDiscordDecorations(field?.value || "", { keepNewlines: true });
        if (queue === "pause") {
          if (/^stato$/i.test(name)) value = statusLabelFor(status, value);
          if (/^ruolo/i.test(name)) {
            value = pauseRoleDisplayLabel(
              { ruoloRichiesto: value, ruoloLabel: String(doc?.workflowFields?.ruoloLabel || "") },
              member,
              member?.guild || null,
            );
          }
        }
        return { name, value };
      })
      .filter((field?) => field.name || field.value);
    if (rows.length) return rows;
  }
  /* boardsRevSheetUi1: meta object con rows QA */
  if (
    queue === "revisione" &&
    wf &&
    typeof wf === "object" &&
    !Array.isArray(wf) &&
    Array.isArray(wf.rows) &&
    wf.rows.length
  ) {
    return wf.rows
      .map((field?) => ({
        name: stripDiscordDecorations(field?.name || "", { keepNewlines: true }),
        value: stripDiscordDecorations(field?.value || "", { keepNewlines: true }),
      }))
      .filter((field?) => field.name || field.value);
  }
  if (wf && typeof wf === "object" && !Array.isArray(wf)) {
    const rows = [];
    const status = normalizeStatus(doc?.status, "pending");
    if (wf.start || wf.end) rows.push({ name: "Periodo", value: `${wf.start || "?"} → ${wf.end || "?"}` });
    if (queue === "pause") {
      const roleLabel = pauseRoleDisplayLabel(wf, member, member?.guild || null);
      if (roleLabel) rows.push({ name: "Ruolo richiesto", value: roleLabel });
    } else if (wf.ruoloRichiesto) {
      rows.push({ name: "Ruolo richiesto", value: String(wf.ruoloRichiesto) });
    }
    const motivazione = stripDiscordDecorations(doc?.content || doc?.reason || doc?.body || "", {
      keepNewlines: true,
    });
    if (motivazione) rows.push({ name: "Motivazione", value: motivazione });
    rows.push({
      name: "Stato",
      value: statusLabelFor(status, wf.statusLabel || doc?.staffReason || null),
    });
    if (rows.length) return rows;
  }
  return parseNumberedQaBlocks(doc?.content || doc?.body || "");
}

function docToDetail(doc?, member?, memberCache?) {
  const cache =
    memberCache ||
    (member && doc?.userId ? new Map([[String(doc.userId || ""), member]]) : null);
  const item: any = docToListItem(doc, cache);
  const keepEmoji = false;
  const body = stripDiscordDecorations(doc?.content || doc?.body || "", {
    keepNewlines: true,
    keepCustomEmoji: keepEmoji,
  });
  const fields = buildDetailFields(doc, member);
  const wf =
    doc?.workflowFields && typeof doc.workflowFields === "object" && !Array.isArray(doc.workflowFields)
      ? doc.workflowFields
      : {};
  const costanzaChart = Array.isArray(wf.costanzaChart)
    ? wf.costanzaChart
        .map((p?) => ({
          dayKey: String(p?.dayKey || "").trim(),
          text: Math.max(0, Math.floor(Number(p?.text) || 0)),
          voiceSeconds: Math.max(0, Math.floor(Number(p?.voiceSeconds) || 0)),
        }))
        .filter((p?) => p.dayKey)
        .sort((a?, b?) => String(a.dayKey).localeCompare(String(b.dayKey)))
    : [];
  let weeklyPartners = wf.weeklyPartners != null ? Number(wf.weeklyPartners) : null;
  if ((weeklyPartners == null || !Number.isFinite(weeklyPartners)) && String(item.kind || "").toLowerCase() === "p") {
    const partnerField = (Array.isArray(fields) ? fields : []).find((f?) =>
      /^partner$/i.test(stripDiscordDecorations(String(f?.name || ""), { keepCustomEmoji: false }).trim()),
    );
    const digits = String(partnerField?.value || "").replace(/[^\d]/g, "");
    if (digits) weeklyPartners = Math.max(0, Math.floor(Number(digits)));
  }
  return {
    ...item,
    body,
    content: body,
    fields,
    motivazione: stripDiscordDecorations(
      doc?.content || doc?.reason || doc?.body || item.motivazione || "",
      {
        keepNewlines: true,
        keepCustomEmoji: keepEmoji,
      },
    ),
    timing: wf.timing || null,
    giorniScalati: wf.giorniScalati ?? null,
    costanzaChart,
    activityGrade: wf.activityGrade != null ? String(wf.activityGrade) : "",
    behaviorGrade: wf.behaviorGrade != null ? String(wf.behaviorGrade) : "",
    azioneDisplay: wf.azioneDisplay != null ? String(wf.azioneDisplay) : "",
    weeklyMessages: wf.weeklyMessages != null ? Number(wf.weeklyMessages) : null,
    weeklyVoiceSeconds: wf.weeklyVoiceSeconds != null ? Number(wf.weeklyVoiceSeconds) : null,
    weeklyPartners:
      weeklyPartners != null && Number.isFinite(weeklyPartners) ? weeklyPartners : null,
    activityLimits:
      wf.activityLimits && typeof wf.activityLimits === "object" && !Array.isArray(wf.activityLimits)
        ? {
            messages: Number(wf.activityLimits.messages) || 0,
            hours: Number(wf.activityLimits.hours) || 0,
          }
        : null,
    sanctionLimit:
      wf.sanctionLimit != null && Number.isFinite(Number(wf.sanctionLimit))
        ? Number(wf.sanctionLimit)
        : null,
    weeklySanctions:
      wf.weeklySanctions != null && Number.isFinite(Number(wf.weeklySanctions))
        ? Number(wf.weeklySanctions)
        : null,
    rolesHistory: Array.isArray(wf.rolesHistory) ? wf.rolesHistory : [],
  };
}

function snowflakeToDate(id?) {
  const raw = String(id || "").trim();
  if (!/^\d{16,20}$/.test(raw)) return null;
  try {
    const ms = Number((BigInt(raw) >> 22n) + 1420070400000n);
    if (!Number.isFinite(ms) || ms <= 0) return null;
    return new Date(ms);
  } catch {
    return null;
  }
}

export = { docToListItem, parseNumberedQaBlocks, docToDetail, snowflakeToDate };
