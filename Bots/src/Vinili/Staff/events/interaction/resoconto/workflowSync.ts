const { getGuildChannelCached } = require("../../../../../shared/discord/interactionEntityCache") as typeof import("../../../../../shared/discord/interactionEntityCache");
const { deleteThreadForMessage } = require("../../../../Staff/utils/staffDocUtils") as typeof import("../../../../Staff/utils/staffDocUtils");

async function fetchActiveResocontoMessage(guild?, channelId?, messageId?) {
  const channel = await getGuildChannelCached(guild, channelId);
  if (!channel?.isTextBased?.()) return null;
  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message) return null;
  const rows = Array.isArray(message.components) ? message.components : [];
  if (rows.length === 0) return null;
  return message;
}

async function fetchResocontoMessage(guild?, channelId?, messageId?) {
  const channel = await getGuildChannelCached(guild, channelId);
  if (!channel?.isTextBased?.()) return null;
  return channel.messages.fetch(messageId).catch(() => null);
}

async function syncResocontoWorkflowOutcome(guild?, channelId?, messageId?, opts: Record<string, any> = {}) {
  const mid = String(messageId || "").trim();
  let idOk = /^\d{16,22}$/.test(mid);
  if (!idOk) {
    try {
      const { isWorkflowMessageId } = require("../../../../site/http/discordWorkflowUiGate") as typeof import("../../../../site/http/discordWorkflowUiGate");
      idOk = isWorkflowMessageId(mid);
    } catch (_) {}
  }
  if (!guild?.id || !idOk) return null;
  const accepted = opts.accepted !== false;
  let status = accepted ? "accepted" : "rejected";
  let statusLabel = String(opts.statusLabel || "").trim();
  let workflowActionKey = String(opts.actionKey || opts.workflowActionKey || "").trim().toLowerCase();
  const actorId = String(opts.actorId || "").trim();
  const actorName = String(opts.actorName || opts.decidedByName || "").trim();
  let msg = opts.message || null;
  if (!msg) {
    msg = await fetchResocontoMessage(guild, channelId, mid).catch(() => null);
  }
  const rawBody = String(msg?.content || "");

  if (!statusLabel && !accepted) statusLabel = "Azione negata";
  if (!statusLabel && accepted) {
    try {
      const { resocontoActionLabelForKey } = require("../../../../site/workflow/siteStaffWorkflowStore") as typeof import("../../../../site/workflow/siteStaffWorkflowStore");
      statusLabel = resocontoActionLabelForKey(workflowActionKey) || "Accettata";
    } catch {
      statusLabel = "Accettata";
    }
  }

  if (/azione confermata da|azione negata da/i.test(rawBody)) {
    try {
      const { parseResocontoOutcomeFromContent } = require("../../../../site/workflow/siteStaffWorkflowStore") as typeof import("../../../../site/workflow/siteStaffWorkflowStore");
      const outcome = parseResocontoOutcomeFromContent(rawBody);
      status = outcome?.rejected ? "rejected" : "accepted";
      if (outcome?.label) statusLabel = outcome.label;
      if (outcome?.actionKey) workflowActionKey = outcome.actionKey;
    } catch (_) {}
  }

  const syncExtras = {
    ...(actorId ? { decidedBy: actorId } : {}),
    ...(actorName ? { decidedByName: actorName } : {}),
    ...(String(opts.userId || "").trim() ? { userId: String(opts.userId).trim() } : {}),
    ...(String(opts.kind || "").trim() ? { kind: String(opts.kind).trim() } : {}),
    ...(opts.roleId != null && String(opts.roleId).trim() ? { roleId: String(opts.roleId).trim() } : {}),
    ...(String(channelId || "").trim() ? { channelId: String(channelId).trim() } : {}),
    statusLabel,
    ...(workflowActionKey ? { workflowActionKey } : {}),
    ...(rawBody ? { messageContent: rawBody } : {}),
  };

  try {
    const {
      updateStaffWorkflowFromMessage,
      upsertStaffWorkflowItem,
      buildWorkflowDedupeKey,
      parseResocontoFromMessage,
      resocontoWorkflowItemFromDoc,
    } = require("../../../../site/workflow/siteStaffWorkflowStore") as typeof import("../../../../site/workflow/siteStaffWorkflowStore");
    let doc = await updateStaffWorkflowFromMessage(guild.id, "resoconti", mid, status, syncExtras);
    if (!doc && msg) {
      const payload = parseResocontoFromMessage(msg);
      if (payload) {
        doc = await upsertStaffWorkflowItem({
          guildId: guild.id,
          queue: "resoconti",
          dedupeKey: buildWorkflowDedupeKey("resoconti", [mid]),
          userId: payload.userId,
          messageId: mid,
          channelId: String(msg.channelId || channelId || ""),
          kind: payload.kind,
          roleId: payload.roleId,
          actionKey: workflowActionKey || payload.actionKey,
          status,
          statusLabel,
          staffReason: statusLabel,
          title:
            payload.kind === "p"
              ? `Resoconto PM · ${payload.actionKey || ""}`.trim()
              : `Resoconto staff · ${payload.actionKey || ""}`.trim(),
          preview: rawBody.slice(0, 400),
          content: rawBody,
          createdAt: msg.createdAt,
          ...(actorId ? { decidedBy: actorId } : {}),
          ...(actorName ? { decidedByName: actorName } : {}),
        });
        if (doc && status !== "pending") {
          try {
            const { broadcastSiteStaffWorkflowChanged } = require("../../../../site/suggestions/siteSuggestionsBroadcast") as typeof import("../../../../site/suggestions/siteSuggestionsBroadcast");
            broadcastSiteStaffWorkflowChanged("resoconti");
          } catch (_) {}
        }
      }
    }
    if (!doc) {
      const uid = String(opts.userId || "").trim();
      if (/^\d{16,22}$/.test(uid)) {
        doc = await upsertStaffWorkflowItem({
          guildId: guild.id,
          queue: "resoconti",
          dedupeKey: buildWorkflowDedupeKey("resoconti", [mid]),
          userId: uid,
          messageId: mid,
          channelId: String(channelId || msg?.channelId || ""),
          kind: String(opts.kind || ""),
          roleId: opts.roleId != null ? String(opts.roleId) : "",
          actionKey: workflowActionKey,
          status,
          statusLabel,
          staffReason: statusLabel,
          preview: rawBody.slice(0, 400),
          content: rawBody,
          ...(actorId ? { decidedBy: actorId } : {}),
          ...(actorName ? { decidedByName: actorName } : {}),
        });
        if (doc && status !== "pending") {
          try {
            const { broadcastSiteStaffWorkflowChanged } = require("../../../../site/suggestions/siteSuggestionsBroadcast") as typeof import("../../../../site/suggestions/siteSuggestionsBroadcast");
            broadcastSiteStaffWorkflowChanged("resoconti");
          } catch (_) {}
        }
      }
    }
    return doc ? resocontoWorkflowItemFromDoc(doc) : null;
  } catch (err) {
    global.logger?.warn?.("[RESOCONTO] workflow sync:", err?.message || err);
    return null;
  }
}

function resocontoActorFields(actor?) {
  const member = actor?.member || actor;
  const user = actor?.user || member?.user || actor;
  const id = String(user?.id || member?.id || actor?.id || "").trim();
  const name = String(
    member?.displayName || user?.globalName || user?.username || actor?.displayName || "",
  ).trim();
  return { actorId: id, actorName: name };
}

async function appendOutcomeToMessage(guild?, channelId?, messageId?, actorId?, accepted?, statusText?) {
  const channel = await getGuildChannelCached(guild, channelId);
  if (!channel?.isTextBased?.()) return null;
  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message) return null;
  const existingContent = String(message.content || "");
  const line = accepted ? `\n\n<:success:1461731530333229226> Azione confermata da <@${actorId}>:${statusText}`
    : `\n\n<:cancel:1461730653677551691> Azione negata da <@${actorId}>`;
  const content = `${existingContent}${line}`.slice(0, 1900);
  const edited = await message.edit({ content, components: [] }).catch(() => null);
  void deleteThreadForMessage(guild, message).catch(() => null);
  return edited || Object.assign(message, { content });
}

export = {
  fetchActiveResocontoMessage,
  fetchResocontoMessage,
  syncResocontoWorkflowOutcome,
  resocontoActorFields,
  appendOutcomeToMessage,
};
