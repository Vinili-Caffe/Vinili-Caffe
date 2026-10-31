/** Workflow staff: salvataggio di candidature, appelli e resoconti appena inviati. */
const { getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { stripDiscordDecorations, weekKeyFromDate, buildWorkflowDedupeKey, normalizeStatus, statusLabelFor, resocontoActionLabelForKey, extractResocontoAzioneText, formatResocontoProposedLabel, buildResocontoInboxPreview, deriveResocontoStatusLabel, resolveResocontoDocStatus, normalizeResocontoActionKey } = require("./workflowLabels") as typeof import("./workflowLabels");
const { memberToSubjectFields, resolveWorkflowSubject } = require("./workflowSubjects") as typeof import("./workflowSubjects");
const { parseNumberedQaBlocks } = require("./workflowSerialize") as typeof import("./workflowSerialize");
const { upsertStaffWorkflowItem } = require("./workflowWrites") as typeof import("./workflowWrites");

async function persistCandidatureWorkflowFromMessage(guild?, message?, type?, userId?, status = "pending") {
  if (!guild || !message) return null;
  const embed = message.embeds?.[0];
  const fullBody = (Array.isArray(message.embeds) ? message.embeds : [])
    .map((e?) => String(e?.description || "").trim())
    .filter(Boolean)
    .join("\n\n");
  const body = stripDiscordDecorations(fullBody || String(embed?.description || ""), { keepNewlines: true });
  const fieldsFromEmbed = (Array.isArray(embed?.fields) ? embed.fields : [])
    .map((field?) => ({
      name: String(field?.name || "").trim(),
      value: stripDiscordDecorations(field?.value || ""),
    }))
    .filter((field?) => field.name || field.value);
  const fieldsFromBody = parseNumberedQaBlocks(body);
  const fields = fieldsFromBody.length ? fieldsFromBody : fieldsFromEmbed;
  return persistCandidatureWorkflowFromPayload(guild, {
    messageId: message.id,
    channelId: message.channelId,
    type,
    userId,
    status,
    title: stripDiscordDecorations(embed?.title || "Candidatura") || "Candidatura",
    body,
    fields,
    createdAt: message.createdAt,
  });
}

async function persistCandidatureWorkflowFromPayload(guild?, payload: Record<string, any> = {}) {
  if (!guild) return null;
  const messageId = String(payload.messageId || "").trim();
  const userId = String(payload.userId || "").trim();
  if (!messageId || !userId) return null;
  const body = stripDiscordDecorations(String(payload.body || ""), { keepNewlines: true });
  const fieldsFromBody = parseNumberedQaBlocks(body);
  const fields =
    Array.isArray(payload.fields) && payload.fields.length
      ? payload.fields
      : fieldsFromBody;
  const member = await getGuildMemberCached(guild, userId).catch(() => null);
  const subject = await resolveWorkflowSubject(guild?.client, guild, userId);
  const fromMember = memberToSubjectFields(member, userId);
  return upsertStaffWorkflowItem({
    guildId: guild.id,
    queue: "candidature",
    dedupeKey: buildWorkflowDedupeKey("candidature", [messageId]),
    userId,
    type: payload.type,
    messageId,
    channelId: String(payload.channelId || "site"),
    status: payload.status || "pending",
    title: stripDiscordDecorations(payload.title || "Candidatura") || "Candidatura",
    preview: body.slice(0, 400),
    content: body,
    fields,
    workflowFields: fields.length ? fields : null,
    createdAt: payload.createdAt || new Date(),
    displayName: fromMember.displayName || subject.displayName || "",
    avatarUrl: fromMember.avatarUrl || subject.avatarUrl || "",
  });
}

async function persistResocontoWorkflowFromMessage(guild?, message?, payload?, status = "pending") {
  if (!guild || !message || !payload) return null;
  const rawBody = String(message.content || "");
  return persistResocontoWorkflowFromPayload(guild, {
    messageId: message.id,
    channelId: message.channelId,
    userId: payload.userId,
    kind: payload.kind,
    roleId: payload.roleId,
    actionKey: payload.actionKey,
    content: rawBody,
    createdAt: message.createdAt,
    status,
    weekKey: payload.weekKey,
    workflowFields: payload.workflowFields || null,
  });
}

async function persistResocontoWorkflowFromPayload(guild?, payload: Record<string, any> = {}) {
  if (!guild) return null;
  const messageId = String(payload.messageId || "").trim();
  const userId = String(payload.userId || "").trim();
  if (!messageId || !userId) return null;
  const rawBody = String(payload.content || payload.body || "");
  const kind = String(payload.kind || "").trim();
  const title =
    kind === "p"
      ? `Resoconto PM · ${payload.actionKey || ""}`.trim()
      : `Resoconto staff · ${payload.actionKey || ""}`.trim();
  const createdAt = payload.createdAt || new Date();
  const member = await getGuildMemberCached(guild, userId).catch(() => null);
  const subject = await resolveWorkflowSubject(guild?.client, guild, userId);
  const fromMember = memberToSubjectFields(member, userId);
  const extraFields =
    payload.workflowFields && typeof payload.workflowFields === "object" && !Array.isArray(payload.workflowFields)
      ? payload.workflowFields
      : null;
  return upsertStaffWorkflowItem({
    guildId: guild.id,
    queue: "resoconti",
    dedupeKey: buildWorkflowDedupeKey("resoconti", [messageId]),
    userId,
    kind,
    roleId: payload.roleId,
    actionKey: payload.actionKey,
    messageId,
    channelId: String(payload.channelId || "site"),
    status: payload.status || "pending",
    title,
    preview: rawBody.slice(0, 400),
    content: rawBody,
    createdAt,
    weekKey: String(payload.weekKey || weekKeyFromDate(createdAt) || "").trim(),
    displayName: fromMember.displayName || subject.displayName || "",
    avatarUrl: fromMember.avatarUrl || subject.avatarUrl || "",
    ...(extraFields ? { workflowFields: extraFields } : {}),
  });
}

function workflowActorExtras(actorMember?) {
  const id = String(actorMember?.id || actorMember?.user?.id || "").trim();
  const name = String(
    actorMember?.displayName || actorMember?.user?.globalName || actorMember?.user?.username || "",
  ).trim();
  return {
    ...(id ? { decidedBy: id } : {}),
    ...(name ? { decidedByName: name } : {}),
  };
}

function resocontoWorkflowItemFromDoc(doc?) {
  if (!doc) return null;
  const status = resolveResocontoDocStatus(doc);
  const actionKey = normalizeResocontoActionKey(doc?.workflowActionKey || "");
  const body = String(doc?.content || doc?.body || "");
  const proposedLabel = formatResocontoProposedLabel(extractResocontoAzioneText(body), actionKey);
  return {
    messageId: String(doc?.workflowMessageId || ""),
    channelId: String(doc?.workflowChannelId || ""),
    dedupeKey: String(doc?.dedupeKey || ""),
    userId: String(doc?.userId || ""),
    kind: String(doc?.workflowKind || ""),
    roleId: doc?.workflowRoleId ? String(doc.workflowRoleId) : null,
    actionKey,
    proposedLabel,
    status,
    statusLabel: deriveResocontoStatusLabel(doc),
    canAct: status === "pending",
    body,
    content: body,
    preview: buildResocontoInboxPreview(body, {
      kind: String(doc?.workflowKind || ""),
      proposedLabel,
    }) ||
      stripDiscordDecorations(doc?.body || doc?.content || "", {
        keepNewlines: false,
        keepCustomEmoji: false,
      }).slice(0, 180),
  };
}

function resocontoWorkflowItemFromSnapshot(fields: Record<string, any> = {}) {
  const messageId = String(fields.messageId || "").trim();
  const status = normalizeStatus(fields.status, "accepted");
  const actionKey = normalizeResocontoActionKey(fields.actionKey || "");
  const body = String(fields.body || fields.content || "");
  const statusLabel =
    String(fields.statusLabel || "").trim() ||
    resocontoActionLabelForKey(actionKey) ||
    (status === "rejected" ? "Azione negata" : statusLabelFor(status));
  return {
    messageId,
    channelId: String(fields.channelId || ""),
    dedupeKey: String(fields.dedupeKey || buildWorkflowDedupeKey("resoconti", [messageId])),
    userId: String(fields.userId || ""),
    kind: String(fields.kind || ""),
    roleId: fields.roleId ? String(fields.roleId) : null,
    actionKey,
    status,
    statusLabel,
    canAct: status === "pending",
    body,
    content: body,
    preview: buildResocontoInboxPreview(body, {
      kind: String(fields.kind || ""),
      proposedLabel: resocontoActionLabelForKey(actionKey),
    }) ||
      stripDiscordDecorations(body, {
        keepNewlines: false,
        keepCustomEmoji: false,
      }).slice(0, 180),
  };
}

export = { persistCandidatureWorkflowFromMessage, persistCandidatureWorkflowFromPayload, persistResocontoWorkflowFromMessage, persistResocontoWorkflowFromPayload, workflowActorExtras, resocontoWorkflowItemFromDoc, resocontoWorkflowItemFromSnapshot };
