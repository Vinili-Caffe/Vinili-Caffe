const { EmbedBuilder, ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle, } = require("discord.js");
const IDs = require("../../Utils/Config/ids");
const { getGuildChannelCached, getGuildMemberCached, getClientChannelCached, } = require("../../Utils/Interaction/interactionEntityCache");
const { getOrCreateStaffDoc, deleteThreadForMessage, ensureStaff } = require("../../Utils/Staff/staffDocUtils");
const { initPartnerManagerFieldsIfMissing, syncStaffDbAndPauseChannelAfterDepex } = require("../../Utils/Staff/staffPmUtils");
const { addStaffWarnFromNegatives, applyFullDepex, applyDepexOneLevel, getHighestStaffRoleId } = require("../../Services/Staff/staffWarnService");
const { buildAutoStaffWarnFromNegativesEmbed } = require("../../Utils/Staff/valutazionePanelActions");
const { memberHasStaffRole, queueStaffListRefreshAfterRoleMutation } = require("../../Utils/Community/staffListUtils");
const { getStaffRoleEmojiByRoleId } = require("../../Utils/Community/staffRoleEmoji");
const { clearStaffPendingPurgeAt } = require("../../Services/Community/userLeaveBackupService");
const { userAvatarUrlDynamic } = require("../../Utils/Discord/guildDiscordIdentity");
const {
  memberHasResocontoButtonAccess,
} = require("../../Utils/Staff/resocontoAccess");
const { onResocontoOutcomeRecorded } = require("../../Services/Staff/resocontoReviewerRewardService");
const RESOCONTO_APPLY_PREFIX = "resoconto_apply";
const RESOCONTO_REJECT_PREFIX = "resoconto_reject";
const RESOCONTO_OVERRIDE_PREFIX = "resoconto_override";
const RESOCONTO_REASON_MODAL_PREFIX = "resoconto_reason";
const RESOCONTO_REASON_INPUT_ID = "reason";
const WEEKLY_LIMITS_POSITIVE_REASON = "Limiti settimanali completati.";
const WEEKLY_LIMITS_NEGATIVE_REASON = "Limiti settimanali non raggiunti.";
const STAFF_ACTIONS = new Set(["px", "dp", "vp", "vn", "nl", "batch"]);
const PM_ACTIONS = new Set(["dp", "rc", "nl"]);

function fireResocontoPexDepexNotif(guild, actor, targetUser, kind, oldRoleId, newRoleId, reason, sourceHint) {
  try {
    const { notifyStaffPexDepex, memberDisplayName } = require("../../Utils/Web/siteStaffEventNotifications");
    const actorUser = actor?.user || actor;
    void notifyStaffPexDepex({
      guild,
      kind,
      targetUserId: String(targetUser?.id || ""),
      targetName: memberDisplayName(null, targetUser, targetUser?.id),
      oldRoleId,
      newRoleId,
      reason,
      actorUserId: String(actorUser?.id || ""),
      actorName: memberDisplayName(actor?.member || actor, actorUser, actorUser?.id),
      sourceHint,
    }).catch(() => 0);
  } catch (_) {}
}

const ROLE_UP = {
  [String(IDs.roles.Helper)]: String(IDs.roles.Mod),
  [String(IDs.roles.Mod)]: String(IDs.roles.SeniorModerator),
  [String(IDs.roles.SeniorModerator)]: String(IDs.roles.Director),
  [String(IDs.roles.Director)]: String(IDs.roles.Admin),
  [String(IDs.roles.Admin)]: String(IDs.roles.Manager),
};
const ROLE_PARTNER_MANAGER = String(IDs.roles.PartnerManager);
const ROLE_MEMBER = String(IDs.roles.Member || "");
const ROLE_STAFF = String(IDs.roles.Staff);
const ROLE_HELPER = String(IDs.roles.Helper);
const ROLE_MODERATOR = String(IDs.roles.Mod);
const ROLE_SENIOR_MODERATOR = String(IDs.roles.SeniorModerator);
const ROLE_DIRECTOR = String(IDs.roles.Director);
const ROLE_ADMIN = String(IDs.roles.Admin);
const ROLE_MANAGER = String(IDs.roles.Manager || "");
const ROLE_HIGH_STAFF = String(IDs.roles.HighStaff || "");
const ROLE_CO_OWNER = "";
const ROLE_OWNER = String(IDs.roles.Founder);

function resolvePexDepexLogRoleAfterId(member) {
  if (!member?.roles?.cache) return ROLE_MEMBER || "";
  if (!memberHasStaffRole(member)) return ROLE_MEMBER || "";
  const ladderHi = getHighestStaffRoleId(member);
  if (ladderHi) return ladderHi;
  if (ROLE_PARTNER_MANAGER && member.roles.cache.has(ROLE_PARTNER_MANAGER)) return ROLE_PARTNER_MANAGER;
  return ROLE_MEMBER || "";
}

function parseResocontoButtonCustomId(customId) {
  const raw = String(customId || "");
  const isApply = raw.startsWith(`${RESOCONTO_APPLY_PREFIX}:`);
  const isReject = raw.startsWith(`${RESOCONTO_REJECT_PREFIX}:`);
  if (!isApply && !isReject) return null;

  const parts = raw.split(":");
  const mode = parts[0] === RESOCONTO_APPLY_PREFIX ? "apply" : "reject";
  const kind = String(parts[1] || "");
  const userId = String(parts[2] || "");

  if (!/^\d{16,20}$/.test(userId)) return null;
  if (kind === "s") {
    const roleId = String(parts[3] || "");
    const actionKey = String(parts[4] || "");
    if (!/^\d{16,20}$/.test(roleId) || !STAFF_ACTIONS.has(actionKey)) {
      return null;
    }
    return { mode, kind, userId, roleId, actionKey };
  }

  if (kind === "p") {
    const actionKey = String(parts[3] || "");
    if (!PM_ACTIONS.has(actionKey)) return null;
    return { mode, kind, userId, roleId: null, actionKey };
  }

  return null;
}

function parseResocontoOverrideCustomId(customId) {
  const raw = String(customId || "");
  if (!raw.startsWith(`${RESOCONTO_OVERRIDE_PREFIX}:`)) return null;
  const parts = raw.split(":");
  if (parts.length < 6) return null;
  const kind = String(parts[1] || "");
  const userId = String(parts[2] || "");
  const roleIdRaw = String(parts[3] || "");
  const actionKey = String(parts[4] || "");
  const messageId = String(parts[5] || "");
  if (!/^\d{16,20}$/.test(userId) || !/^\d{16,20}$/.test(messageId)) return null;
  if (kind === "s") {
    if (!/^\d{16,20}$/.test(roleIdRaw) || !STAFF_ACTIONS.has(actionKey)) return null;
    return { mode: "apply", kind, userId, roleId: roleIdRaw, actionKey, messageId, explicitChoice: true };
  }
  if (kind === "p") {
    if (!PM_ACTIONS.has(actionKey)) return null;
    return { mode: "apply", kind, userId, roleId: null, actionKey, messageId, explicitChoice: true };
  }
  return null;
}

function hasResocontoButtonAccess(interaction, payload) {
  return memberHasResocontoButtonAccess(interaction?.member, payload);
}

function isModOrAboveRoleId(roleId) {
  const normalized = String(roleId || "");
  const modOrAbove = [
    ROLE_MODERATOR,
    ROLE_SENIOR_MODERATOR,
    ROLE_DIRECTOR,
    ROLE_ADMIN,
    ROLE_MANAGER,
    ROLE_CO_OWNER,
    ROLE_OWNER,
  ].filter(Boolean);
  return modOrAbove.includes(normalized);
}

function resolveAutoReasonForResocontoAction(payload) {
  if (String(payload?.actionKey || "") === "vp" && String(payload?.kind || "") === "s") {
    return String(payload?.resocontoReason || "").trim() || WEEKLY_LIMITS_POSITIVE_REASON;
  }
  if (String(payload?.actionKey || "") === "vn" && String(payload?.kind || "") === "s") {
    return String(payload?.resocontoReason || "").trim() || WEEKLY_LIMITS_NEGATIVE_REASON;
  }
  if (String(payload?.actionKey || "") === "px" && String(payload?.kind || "") === "s") {
    const roleId = String(payload?.roleId || "");
    if (roleId === ROLE_HELPER) return "Prova superata";
  }
  if (String(payload?.actionKey || "") !== "dp") return "";
  if (String(payload?.kind || "") === "p") return "Limiti settimanali non raggiunti";
  const roleId = String(payload?.roleId || "");
  if (roleId === ROLE_PARTNER_MANAGER) return "Limiti settimanali non raggiunti";
  if (roleId === ROLE_HELPER) return "Prova non superata";
  return "";
}

function shouldOpenReasonModalForResocontoApply(payload) {
  if (!payload || payload.mode !== "apply") return false;
  if (payload.kind !== "s") return false;
  if (payload.actionKey === "px") {
    return resolveAutoReasonForResocontoAction(payload) === "";
  }
  if (["vp", "vn"].includes(payload.actionKey)) {
    return resolveAutoReasonForResocontoAction(payload) === "";
  }
  if (payload.actionKey !== "dp") return false;
  return isModOrAboveRoleId(payload.roleId);
}

function parseResocontoModalCustomId(customId) {
  const raw = String(customId || "");
  if (!raw.startsWith(`${RESOCONTO_REASON_MODAL_PREFIX}:`)) return null;
  const parts = raw.split(":");
  if (parts.length < 6) return null;
  const kind = String(parts[1] || "");
  const userId = String(parts[2] || "");
  const roleId = String(parts[3] || "");
  const actionKey = String(parts[4] || "");
  const messageId = String(parts[5] || "");
  if (!/^\d{16,20}$/.test(userId)) return null;
  if (!/^\d{16,20}$/.test(messageId)) return null;
  if (kind !== "s" || !STAFF_ACTIONS.has(actionKey) || !/^\d{16,20}$/.test(roleId)) {
    return null;
  }
  if (!["px", "dp", "vp", "vn", "batch"].includes(actionKey)) return null;
  return { kind, userId, roleId, actionKey, messageId };
}

async function hasRoleAfterRefresh(guild, userId, roleId) {
  if (!roleId) return false;
  const freshMember = await getGuildMemberCached(guild, userId, { preferFresh: true }).catch(() => null);
  return Boolean(freshMember?.roles?.cache?.has?.(String(roleId)));
}

async function ensureRoleAdded(guild, member, roleId) {
  if (!roleId) return false;
  const roleApplied = await member.roles.add(roleId).then(() => true).catch(() => false);
  if (roleApplied) return true;
  return await hasRoleAfterRefresh(guild, member.id, roleId);
}

async function ensureRoleRemoved(guild, member, roleId) {
  if (!roleId) return true;
  const roleRemoved = await member.roles.remove(roleId).then(() => true).catch(() => false);
  if (roleRemoved) return true;
  const stillHasRole = await hasRoleAfterRefresh(guild, member.id, roleId);
  return !stillHasRole;
}

async function sendValutazioneLogEmbed(guild, actor, targetUser, reason, positive, valutazioniCount, sectionOrdinal) {
  const { resolveStaffValutazioniChannel } = require("../../Utils/Staff/staffChannelUtils");
  const channel = await resolveStaffValutazioniChannel(guild);
  if (!channel?.isTextBased?.()) return;

  const ord = Math.max(0, Math.floor(Number(sectionOrdinal || 0)));
  const vid = Math.max(0, Math.floor(Number(sectionOrdinal || 0)));
  const actorUser = actor?.user || actor;
  const iconSource = actor?.user ? actor : actorUser;
  const actorName = String(actorUser?.username || actor?.username || "Staff");
  const title = positive
    ? `<:thumbsup:1471292172145004768> **__VALUTAZIONE POSITIVA__** #${ord}`
    : `<:thumbsdown:1471292163957457013> **__VALUTAZIONE NEGATIVA__** #${ord}`;
  const embed = new EmbedBuilder()
    .setAuthor({
      name: `Valutazione eseguita da ${actorName}`,
      iconURL: userAvatarUrlDynamic(iconSource) || undefined,
    })
    .setTitle(title)
    .setThumbnail(userAvatarUrlDynamic(targetUser) || undefined)
    .setDescription(
      [
        `<:VC_Staff:1494286904089247754> <a:VC_Arrow:1482706699365257397> <@${targetUser.id}>`,
        `<:VC_reason:1478517122929004544> __${reason}__`,
        `<:VC_id:1478517313618575419> **ID Valutazione** __\`${vid}\`__`,
      ].join("\n"),
    )
    .setColor("#6f4e37");

  await channel.send({ content: `<@${targetUser.id}>`, embeds: [embed] }).catch(() => null);
}

async function applyPexSideEffects(guild, member, roleId) {
  if (roleId === ROLE_HELPER) {
    return ensureRoleAdded(guild, member, ROLE_STAFF);
  }
  if (roleId === ROLE_MODERATOR) return ensureRoleRemoved(guild, member, ROLE_HELPER);
  if (roleId === ROLE_SENIOR_MODERATOR) return ensureRoleRemoved(guild, member, ROLE_MODERATOR);
  if (roleId === ROLE_DIRECTOR) {
    return ensureRoleRemoved(guild, member, ROLE_SENIOR_MODERATOR);
  }
  if (roleId === ROLE_ADMIN) {
    const modRemoved = await ensureRoleRemoved(guild, member, ROLE_DIRECTOR);
    const highStaffAdded = await ensureRoleAdded(guild, member, ROLE_HIGH_STAFF);
    return modRemoved && highStaffAdded;
  }
  if (roleId === ROLE_MANAGER) {
    const adminRemoved = await ensureRoleRemoved(guild, member, ROLE_ADMIN);
    const highStaffAdded = await ensureRoleAdded(guild, member, ROLE_HIGH_STAFF);
    return adminRemoved && highStaffAdded;
  }
  if (roleId === ROLE_CO_OWNER) return ensureRoleRemoved(guild, member, ROLE_ADMIN);
  if (roleId === ROLE_OWNER) {
    const managerRemoved = ROLE_MANAGER ? await ensureRoleRemoved(guild, member, ROLE_MANAGER) : true;
    const coOwnerRemoved = ROLE_CO_OWNER ? await ensureRoleRemoved(guild, member, ROLE_CO_OWNER) : true;
    return managerRemoved && coOwnerRemoved;
  }
  return true;
}

async function bumpCandidatureCooldownAfterStaffRemoval(userId) {
  const uid = String(userId || "").trim();
  if (!/^\d{16,20}$/.test(uid)) return;
  try {
    const { bumpApplicationCooldownAfterStaffDepex } = require("./candidatureApplicationHandlers");
    if (typeof bumpApplicationCooldownAfterStaffDepex === "function") {
      await bumpApplicationCooldownAfterStaffDepex(uid);
    }
  } catch (_) {}
}

async function applyDepexSideEffects(guild, member, roleId) {
  if (roleId === ROLE_PARTNER_MANAGER) {
    const roleRemoved = await ensureRoleRemoved(guild, member, roleId);
    const memberAdded = ROLE_MEMBER ? await ensureRoleAdded(guild, member, ROLE_MEMBER) : true;
    const ok = roleRemoved && memberAdded;
    if (ok && member?.id) await bumpCandidatureCooldownAfterStaffRemoval(member.id);
    return ok;
  }
  if (roleId === ROLE_HELPER || roleId === ROLE_MODERATOR || roleId === ROLE_SENIOR_MODERATOR) {
    const roleRemoved = await ensureRoleRemoved(guild, member, roleId);
    const staffRemoved = await ensureRoleRemoved(guild, member, ROLE_STAFF);
    const highStaffRemoved = await ensureRoleRemoved(guild, member, ROLE_HIGH_STAFF);
    const memberAdded = ROLE_MEMBER ? await ensureRoleAdded(guild, member, ROLE_MEMBER) : true;
    const ok = roleRemoved && staffRemoved && highStaffRemoved && memberAdded;
    if (ok && member?.id) await bumpCandidatureCooldownAfterStaffRemoval(member.id);
    return ok;
  }
  if (roleId === ROLE_DIRECTOR) {
    const roleRemoved = await ensureRoleRemoved(guild, member, roleId);
    const staffRemoved = await ensureRoleRemoved(guild, member, ROLE_STAFF);
    const memberAdded = ROLE_MEMBER ? await ensureRoleAdded(guild, member, ROLE_MEMBER) : true;
    const ok = roleRemoved && staffRemoved && memberAdded;
    if (ok && member?.id) await bumpCandidatureCooldownAfterStaffRemoval(member.id);
    return ok;
  }
  if (roleId === ROLE_ADMIN || roleId === ROLE_MANAGER || roleId === ROLE_CO_OWNER) {
    const roleRemoved = await ensureRoleRemoved(guild, member, roleId);
    const staffRemoved = await ensureRoleRemoved(guild, member, ROLE_STAFF);
    const highStaffRemoved = await ensureRoleRemoved(guild, member, ROLE_HIGH_STAFF);
    const memberAdded = ROLE_MEMBER ? await ensureRoleAdded(guild, member, ROLE_MEMBER) : true;
    const ok = roleRemoved && staffRemoved && highStaffRemoved && memberAdded;
    if (ok && member?.id) await bumpCandidatureCooldownAfterStaffRemoval(member.id);
    return ok;
  }
  if (roleId === ROLE_OWNER) {
    const roleRemoved = await ensureRoleRemoved(guild, member, ROLE_OWNER);
    const managerRemoved = ROLE_MANAGER ? await ensureRoleRemoved(guild, member, ROLE_MANAGER) : true;
    const coOwnerRemoved = ROLE_CO_OWNER ? await ensureRoleRemoved(guild, member, ROLE_CO_OWNER) : true;
    const staffRemoved = await ensureRoleRemoved(guild, member, ROLE_STAFF);
    const highStaffRemoved = await ensureRoleRemoved(guild, member, ROLE_HIGH_STAFF);
    const memberAdded = ROLE_MEMBER ? await ensureRoleAdded(guild, member, ROLE_MEMBER) : true;
    const ok = roleRemoved && managerRemoved && coOwnerRemoved && staffRemoved && highStaffRemoved && memberAdded;
    if (ok && member?.id) await bumpCandidatureCooldownAfterStaffRemoval(member.id);
    return ok;
  }
  return true;
}

async function resolvePexDepexChannel(guild) {
  const { resolveStaffPexDepexChannel } = require("../../Utils/Staff/staffChannelUtils");
  return resolveStaffPexDepexChannel(guild);
}

async function sendPexDepexLog(guild, type, targetUser, oldRoleId, newRoleId, reason) {
  const { isDiscordStaffChannelPostsEnabled } = require("../../Utils/Web/discordWorkflowUiGate");
  if (!isDiscordStaffChannelPostsEnabled()) return;
  const channel = await resolvePexDepexChannel(guild);
  if (!channel?.isTextBased?.()) return;
  const oldRole = guild.roles.cache.get(String(oldRoleId || ""));
  const newRole = guild.roles.cache.get(String(newRoleId || ""));
  const typeLabel = type === "pex" ? "**<:success:1461731530333229226> PEX**" : "**<:cancel:1461730653677551691> DEPEX**";
  const actionEmoji = type === "pex"
    ? getStaffRoleEmojiByRoleId(newRoleId)
    : getStaffRoleEmojiByRoleId(oldRoleId);
  await channel
    .send({
      content: `${typeLabel} <@${targetUser.id}>
${actionEmoji} \`${oldRole?.name || oldRoleId}\` <a:VC_Arrow:1482706699365257397> \`${newRole?.name || newRoleId || "Nessuno"}\`
<:VC_reason:1478517122929004544> __${reason}__`,
    __skipNoticeEmbed: true,
    })
    .catch(() => null);
}

async function fetchActiveResocontoMessage(guild, channelId, messageId) {
  const channel = await getGuildChannelCached(guild, channelId);
  if (!channel?.isTextBased?.()) return null;
  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message) return null;
  const rows = Array.isArray(message.components) ? message.components : [];
  if (rows.length === 0) return null;
  return message;
}

async function fetchResocontoMessage(guild, channelId, messageId) {
  const channel = await getGuildChannelCached(guild, channelId);
  if (!channel?.isTextBased?.()) return null;
  return channel.messages.fetch(messageId).catch(() => null);
}

async function syncResocontoWorkflowOutcome(guild, channelId, messageId, opts = {}) {
  const mid = String(messageId || "").trim();
  let idOk = /^\d{16,22}$/.test(mid);
  if (!idOk) {
    try {
      const { isWorkflowMessageId } = require("../../Utils/Web/discordWorkflowUiGate");
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
      const { resocontoActionLabelForKey } = require("../../Utils/Web/siteStaffWorkflowStore");
      statusLabel = resocontoActionLabelForKey(workflowActionKey) || "Accettata";
    } catch {
      statusLabel = "Accettata";
    }
  }

  if (/azione confermata da|azione negata da/i.test(rawBody)) {
    try {
      const { parseResocontoOutcomeFromContent } = require("../../Utils/Web/siteStaffWorkflowStore");
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
    } = require("../../Utils/Web/siteStaffWorkflowStore");
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
            const { broadcastSiteStaffWorkflowChanged } = require("../../Utils/Web/siteSuggestionsBroadcast");
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
            const { broadcastSiteStaffWorkflowChanged } = require("../../Utils/Web/siteSuggestionsBroadcast");
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

function resocontoActorFields(actor) {
  const member = actor?.member || actor;
  const user = actor?.user || member?.user || actor;
  const id = String(user?.id || member?.id || actor?.id || "").trim();
  const name = String(
    member?.displayName || user?.globalName || user?.username || actor?.displayName || "",
  ).trim();
  return { actorId: id, actorName: name };
}

async function appendOutcomeToMessage(guild, channelId, messageId, actorId, accepted, statusText) {
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

async function applyStaffAction(guild, actor, payload, reasonOverride = null) {
  const member = await getGuildMemberCached(guild, payload.userId);
  if (!member) return "<a:VC_Alert:1482706673176150077> Utente non trovato nel server.";

  if (payload.actionKey === "nl") return "<a:VC_Alert:1482706673176150077> Nessuna azione applicata.";

  const targetUser = member.user;
  if (payload.actionKey === "vp") {
    const profileDoc = await getOrCreateStaffDoc(guild.id, payload.userId);
    const {
      shouldSkipManualResocontoVp,
      resolveResocontoWeekKey,
    } = require("../../Services/Staff/weeklyStaffResocontoService");
    const staffDoc = ensureStaff(profileDoc);
    const reason = String(reasonOverride || "").trim() || WEEKLY_LIMITS_POSITIVE_REASON;
    if (
      staffDoc &&
      shouldSkipManualResocontoVp(staffDoc, resolveResocontoWeekKey(), payload.roleId, reason)
    ) {
      return "<:success:1461731530333229226> Valutazione Positiva già registrata.";
    }
    const { resolveStaffValutazioniChannel } = require("../../Utils/Staff/staffChannelUtils");
    const channel = await resolveStaffValutazioniChannel(guild);
    const { valutazionePositiveAddCore } = require("../../Utils/Staff/valutazionePanelActions");
    const result = await valutazionePositiveAddCore(profileDoc, targetUser, reason, actor, channel);
    if (!(result?.ok || result?.message)) {
      return "<a:VC_Alert:1482706673176150077> Errore registrazione valutazione positiva.";
    }
    return "<:thumbsup:1471292172145004768> Registrata Valutazione Positiva.";
  }

  if (payload.actionKey === "vn") {
    const profileDoc = await getOrCreateStaffDoc(guild.id, payload.userId);
    const {
      shouldSkipManualResocontoVn,
      resolveResocontoWeekKey,
    } = require("../../Services/Staff/weeklyStaffResocontoService");
    const staffDoc = ensureStaff(profileDoc);
    const reason = String(reasonOverride || "").trim() || WEEKLY_LIMITS_NEGATIVE_REASON;
    if (
      staffDoc &&
      shouldSkipManualResocontoVn(staffDoc, resolveResocontoWeekKey(), payload.roleId, reason)
    ) {
      return "<:success:1461731530333229226> Valutazione Negativa già registrata.";
    }
    const { resolveStaffValutazioniChannel } = require("../../Utils/Staff/staffChannelUtils");
    const channel = await resolveStaffValutazioniChannel(guild);
    const { valutazioneNegativeAddCore } = require("../../Utils/Staff/valutazionePanelActions");
    const result = await valutazioneNegativeAddCore(guild, profileDoc, targetUser, reason, actor, channel);
    if (!(result?.ok || result?.message)) {
      return "<a:VC_Alert:1482706673176150077> Errore registrazione valutazione negativa.";
    }
    return "<:thumbsdown:1471292163957457013> Registrata Valutazione Negativa.";
  }

  const roleBeforeId = String(payload.roleId || "");
  const reason = String(reasonOverride || "").trim();
  if (!reason) return "<a:VC_Alert:1482706673176150077> Motivazione mancante.";

  if (payload.actionKey === "px") {
    const roleAfterId = ROLE_UP[roleBeforeId] || null;
    if (!roleAfterId) return "<a:VC_Alert:1482706673176150077> Pex non applicato: nessun ruolo successivo configurato.";
    if (member.roles.cache.has(roleAfterId)) return "<a:VC_Alert:1482706673176150077> Pex non applicato: utente ha già il ruolo successivo.";

    const roleAdded = await ensureRoleAdded(guild, member, roleAfterId);
    if (!roleAdded) return "<a:VC_Alert:1482706673176150077> Pex non applicato: impossibile assegnare il ruolo successivo.";
    const sideEffectsApplied = await applyPexSideEffects(guild, member, roleAfterId);
    if (!sideEffectsApplied) return "<a:VC_Alert:1482706673176150077> Pex applicato parzialmente: side-effect ruoli non completati.";
    const profileDoc = await getOrCreateStaffDoc(guild.id, payload.userId);
    const s = ensureStaff(profileDoc);
    if (roleAfterId === ROLE_PARTNER_MANAGER) {
      initPartnerManagerFieldsIfMissing(s);
    }
    if (!Array.isArray(s.rolesHistory)) s.rolesHistory = [];
    s.rolesHistory.push({
      oldRole: roleBeforeId,
      newRole: roleAfterId,
      reason,
      date: new Date(),
    });
    profileDoc.markModified("staff");
    await profileDoc.save();
    await clearStaffPendingPurgeAt(guild.id, payload.userId);
    await sendPexDepexLog(guild, "pex", targetUser, roleBeforeId, roleAfterId, reason);
    fireResocontoPexDepexNotif(guild, actor, targetUser, "pex", roleBeforeId, roleAfterId, reason, `resoconto-pex:${payload.userId}`);
    queueStaffListRefreshAfterRoleMutation(guild.client, guild.id);
    return "<:success:1461731530333229226> Pex applicato.";
  }

  if (payload.actionKey === "dp") {
    if (!member.roles.cache.has(roleBeforeId)) return "<a:VC_Alert:1482706673176150077> Depex non applicato: ruolo corrente non presente.";

    let roleAfterId = "";
    if (String(roleBeforeId) === String(ROLE_PARTNER_MANAGER)) {
      const roleRemoved = await ensureRoleRemoved(guild, member, roleBeforeId);
      if (!roleRemoved) return "<a:VC_Alert:1482706673176150077> Depex non applicato: impossibile rimuovere il ruolo corrente.";
      const sideEffectsApplied = await applyDepexSideEffects(guild, member, roleBeforeId);
      if (!sideEffectsApplied) return "<a:VC_Alert:1482706673176150077> Depex applicato parzialmente: side-effect ruoli non completati.";
    } else {
      const step = await applyDepexOneLevel(guild, member, roleBeforeId);
      if (!step?.ok) {
        return `<a:VC_Alert:1482706673176150077> Depex non applicato: ${String(step?.reason || "errore sconosciuto")}`;
      }
      roleAfterId = step.newRole != null && step.newRole !== "" ? String(step.newRole) : "";
    }

    const memberAfterDepex = await getGuildMemberCached(guild, payload.userId, { preferFresh: true }).catch(() => member);
    await syncStaffDbAndPauseChannelAfterDepex(guild, payload.userId, memberAfterDepex);
    if (!roleAfterId) roleAfterId = resolvePexDepexLogRoleAfterId(memberAfterDepex);
    const profileDoc = await getOrCreateStaffDoc(guild.id, payload.userId);
    const s = ensureStaff(profileDoc);
    if (!Array.isArray(s.rolesHistory)) s.rolesHistory = [];
    s.rolesHistory.push({
      oldRole: roleBeforeId,
      newRole: roleAfterId || "",
      reason,
      date: new Date(),
    });
    profileDoc.markModified("staff");
    await profileDoc.save().catch(() => null);
    await sendPexDepexLog(guild, "depex", targetUser, roleBeforeId, roleAfterId, reason);
    fireResocontoPexDepexNotif(guild, actor, targetUser, "depex", roleBeforeId, roleAfterId, reason, `resoconto-depex:${payload.userId}`);
    queueStaffListRefreshAfterRoleMutation(guild.client, guild.id);
    return "<:success:1461731530333229226> Depex applicato.";
  }

  return "<a:VC_Alert:1482706673176150077> Nessuna operazione eseguita.";
}

async function applyPmAction(guild, payload, reasonOverride = null) {
  const member = await getGuildMemberCached(guild, payload.userId);
  if (!member) return "<a:VC_Alert:1482706673176150077> Utente non trovato nel server.";

  if (payload.actionKey === "nl") return "<a:VC_Alert:1482706673176150077> Nessuna azione applicata.";
  if (payload.actionKey === "rc") return "<a:VC_Alert:1482706673176150077> Richiamo non applica modifiche automatiche.";
  if (payload.actionKey !== "dp") return "<a:VC_Alert:1482706673176150077> Nessuna operazione eseguita.";

  const partnerRoleRemoved = await ensureRoleRemoved(guild, member, ROLE_PARTNER_MANAGER);
  if (!partnerRoleRemoved) return "<a:VC_Alert:1482706673176150077> Depex PM non applicato: impossibile rimuovere il ruolo Partner Manager.";
  await member.roles.remove(ROLE_HELPER).catch(() => null);
  await member.roles.remove(ROLE_MODERATOR).catch(() => null);
  await member.roles.remove(ROLE_SENIOR_MODERATOR).catch(() => null);
  await member.roles.remove(ROLE_DIRECTOR).catch(() => null);
  await member.roles.remove(ROLE_STAFF).catch(() => null);
  await member.roles.remove(ROLE_HIGH_STAFF).catch(() => null);
  if (ROLE_MEMBER) {
    const memberRoleAdded = await ensureRoleAdded(guild, member, ROLE_MEMBER);
    if (!memberRoleAdded) return "<a:VC_Alert:1482706673176150077> Depex PM applicato parzialmente: impossibile ripristinare il ruolo Member.";
  }
  const memberAfterPmDepex = await getGuildMemberCached(guild, payload.userId, { preferFresh: true }).catch(() => member);
  await syncStaffDbAndPauseChannelAfterDepex(guild, payload.userId, memberAfterPmDepex);
  await sendPexDepexLog(
    guild,
    "depex",
    member.user,
    ROLE_PARTNER_MANAGER,
    ROLE_MEMBER || "",
    String(reasonOverride || "").trim() || "Limiti settimanali non raggiunti",
  );
  await bumpCandidatureCooldownAfterStaffRemoval(payload.userId);
  return "<:success:1461731530333229226> Depex PM applicato e dati partner rimossi.";
}

async function applyStaffResocontoPendingValutazioni(
  guild,
  actor,
  payload,
  pendingActions,
  reasonOverride = null,
  reasonActionKey = null,
) {
  const {
    shouldSkipManualResocontoVp,
    shouldSkipManualResocontoVn,
    resolveResocontoWeekKey,
  } = require("../../Services/Staff/weeklyStaffResocontoService");
  const actions = Array.isArray(pendingActions) ? pendingActions : [];
  if (!actions.length) {
    return "<:success:1461731530333229226> Valutazioni già registrate dal sistema.";
  }

  const resocontoWeekKey = resolveResocontoWeekKey();
  const profileDoc = await getOrCreateStaffDoc(guild.id, payload.userId).catch(() => null);
  const staffDoc = profileDoc ? ensureStaff(profileDoc) : null;
  const actionPriority = { px: 0, dp: 0, vp: 1, vn: 1, nl: 2 };
  const sortedActions = [...actions].sort(
    (left, right) =>
      (actionPriority[String(left?.actionKey || "")] ?? 9) -
      (actionPriority[String(right?.actionKey || "")] ?? 9),
  );

  const lines = [];
  for (const action of sortedActions) {
    const actionKey = String(action?.actionKey || "").trim();
    if (!actionKey) continue;
    if (
      actionKey === "vp" &&
      staffDoc &&
      shouldSkipManualResocontoVp(staffDoc, resocontoWeekKey, payload.roleId, action?.reason)
    ) {
      lines.push("<:success:1461731530333229226> Valutazione Positiva già registrata.");
      continue;
    }
    if (
      actionKey === "vn" &&
      staffDoc &&
      shouldSkipManualResocontoVn(staffDoc, resocontoWeekKey, payload.roleId, action?.reason)
    ) {
      lines.push("<:success:1461731530333229226> Valutazione Negativa già registrata.");
      continue;
    }
    const useOverride = Boolean(
      reasonOverride &&
        (!reasonActionKey || actionKey === String(reasonActionKey || "").trim()),
    );
    const reason = useOverride
      ? String(reasonOverride).trim()
      : String(action?.reason || "").trim() ||
        resolveAutoReasonForResocontoAction({
          ...payload,
          actionKey,
          resocontoReason: action?.reason,
        });
    const line = await applyStaffAction(guild, actor, { ...payload, actionKey }, reason);
    if (line) lines.push(line);
  }
  return lines.length ? lines.join(" ") : "<a:VC_Alert:1482706673176150077> Nessuna operazione eseguita.";
}

async function resolveStaffResocontoApplyExecution(guild, payload) {
  if (payload?.kind !== "s") {
    return {
      pendingManualActions: [],
      requiresModal: shouldOpenReasonModalForResocontoApply(payload),
      autoReason: resolveAutoReasonForResocontoAction(payload),
    };
  }

  // Scelta esplicita dal menu dopo la X (Pex/Depex/Val+/Val-/Nulla): non ricalcolare
  // il piano automatico, altrimenti "Nulla" viene sovrascritto da un Pex in coda e apre Motivo Pex.
  if (payload?.explicitChoice === true || String(payload?.actionKey || "") === "nl") {
    const actionKey = String(payload.actionKey || "").trim();
    if (actionKey === "nl") {
      return {
        pendingManualActions: [],
        requiresModal: false,
        autoReason: null,
        mergedPayload: payload,
      };
    }
    const mergedPayload = { ...payload, actionKey };
    const reason = resolveAutoReasonForResocontoAction(mergedPayload) || "";
    if (actionKey === "vp" || actionKey === "vn") {
      const {
        shouldSkipManualResocontoVp,
        shouldSkipManualResocontoVn,
        resolveResocontoWeekKey,
      } = require("../../Services/Staff/weeklyStaffResocontoService");
      const profileDoc = await getOrCreateStaffDoc(guild.id, payload.userId).catch(() => null);
      const staffDoc = profileDoc ? ensureStaff(profileDoc) : null;
      const weekKey = resolveResocontoWeekKey();
      const skip =
        actionKey === "vp"
          ? staffDoc &&
            shouldSkipManualResocontoVp(staffDoc, weekKey, payload.roleId, reason)
          : staffDoc &&
            shouldSkipManualResocontoVn(staffDoc, weekKey, payload.roleId, reason);
      if (skip) {
    return {
          pendingManualActions: [],
          requiresModal: false,
          autoReason: null,
          mergedPayload,
          alreadyHandled: true,
          alreadyHandledActionKey: actionKey,
        };
      }
    }
    return {
      pendingManualActions: [{ actionKey, reason }],
      requiresModal: shouldOpenReasonModalForResocontoApply(mergedPayload),
      autoReason: resolveAutoReasonForResocontoAction(mergedPayload),
      mergedPayload,
    };
  }

  const { buildStaffResocontoApplyPlanForMember } = require("../../Services/Staff/weeklyStaffResocontoService");
  const plan = await buildStaffResocontoApplyPlanForMember(
    guild,
    payload.userId,
    payload.roleId,
  );
  const pendingManualActions = Array.isArray(plan?.pendingManualActions) ? plan.pendingManualActions : [];

  const findModalPendingAction = (actions) =>
    actions.find((action) =>
      shouldOpenReasonModalForResocontoApply({
        ...payload,
        actionKey: action.actionKey,
        resocontoReason: action.reason,
      }),
    ) || null;

  if (payload.actionKey === "batch" || pendingManualActions.length > 1) {
    if (String(payload.actionKey || "") === "batch" && !pendingManualActions.length) {
      return {
        pendingManualActions: [],
        requiresModal: false,
        autoReason: null,
        plan,
        alreadyHandled: true,
        alreadyHandledActionKey: "batch",
      };
    }
    const modalAction = findModalPendingAction(pendingManualActions);
    return {
      pendingManualActions,
      requiresModal: Boolean(modalAction),
      autoReason: null,
      plan,
      mergedPayload: modalAction
        ? { ...payload, actionKey: modalAction.actionKey, resocontoReason: modalAction.reason }
        : null,
    };
  }

  if (pendingManualActions.length === 1) {
    const only = pendingManualActions[0];
    const mergedPayload = {
      ...payload,
      actionKey: only.actionKey,
      resocontoReason: only.reason,
    };
    return {
      pendingManualActions,
      requiresModal: shouldOpenReasonModalForResocontoApply(mergedPayload),
      autoReason: resolveAutoReasonForResocontoAction(mergedPayload),
      plan,
      mergedPayload,
    };
  }

  if (["vp", "vn", "batch"].includes(String(payload?.actionKey || "")) && !pendingManualActions.length) {
    return {
      pendingManualActions: [],
      requiresModal: false,
      autoReason: null,
      plan,
      alreadyHandled: true,
    };
  }

  return {
    pendingManualActions: [],
    requiresModal: shouldOpenReasonModalForResocontoApply(payload),
    autoReason: resolveAutoReasonForResocontoAction(payload),
    plan,
  };
}

function buildResocontoOverrideRows(payload, messageId) {
  const mid = String(messageId || "");
  const base = {
    kind: String(payload?.kind || ""),
    userId: String(payload?.userId || ""),
    roleId: String(payload?.roleId || ""),
  };
  if (!/^\d{16,20}$/.test(base.userId) || !/^\d{16,20}$/.test(mid)) return [];
  const mk = (actionKey) => `${RESOCONTO_OVERRIDE_PREFIX}:${base.kind}:${base.userId}:${base.roleId || "0"}:${actionKey}:${mid}`;
  if (base.kind === "s") {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(mk("px")).setLabel("Pex").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(mk("dp")).setLabel("Depex").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(mk("vp")).setLabel("Valutazione +").setStyle(ButtonStyle.Primary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(mk("vn")).setLabel("Valutazione -").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(mk("nl")).setLabel("Nulla").setStyle(ButtonStyle.Secondary),
      ),
    ];
  }
  if (base.kind === "p") {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(mk("dp")).setLabel("Depex").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(mk("rc")).setLabel("Richiamo").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(mk("nl")).setLabel("Nulla").setStyle(ButtonStyle.Secondary),
      ),
    ];
  }
  return [];
}

async function showReasonModal(interaction, payload, sourceMessageId = null) {
  const messageId = String(sourceMessageId || interaction.message?.id || "");
  if (!/^\d{16,20}$/.test(messageId)) return;
  const modalId = [RESOCONTO_REASON_MODAL_PREFIX, payload.kind, payload.userId, payload.roleId, payload.actionKey, messageId].join(":");

  const titleByAction = { px: "Motivo Pex", dp: "Motivo Depex", vp: "Motivo Valutazione Positiva", vn: "Motivo Valutazione Negativa", };
  const rawTitle = titleByAction[payload.actionKey] || "Motivo Azione";
  const modal = new ModalBuilder().setCustomId(modalId).setTitle(String(rawTitle).slice(0, 45));
  const input = new TextInputBuilder().setCustomId(RESOCONTO_REASON_INPUT_ID).setLabel("Inserisci il motivo").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500);
  if (payload.actionKey === "vp") {
    input.setPlaceholder("Es: Limiti settimanali completati");
  }
  if (payload.actionKey === "vn") {
    input.setPlaceholder("Es: Limiti settimanali non rispettati");
  }
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal).catch(() => null);
}

async function handleResocontoButton(interaction) {
  const parsed = parseResocontoButtonCustomId(interaction.customId);
  const parsedOverride = parsed ? null : parseResocontoOverrideCustomId(interaction.customId);
  const payload = parsed || parsedOverride;
  if (!payload) return false;
  if (!interaction.guild) return true;
  if (!hasResocontoButtonAccess(interaction, payload)) {
    await interaction
      .reply({
        content: "<a:VC_Alert:1482706673176150077> Questo controllo non è disponibile per il tuo ruolo.",
        flags: 1 << 6,
      })
      .catch(() => null);
    return true;
  }
  const activeMessage = await fetchActiveResocontoMessage(
    interaction.guild,
    interaction.channelId,
    payload.messageId || interaction.message?.id,
  );
  if (!activeMessage) {
    await interaction
      .reply({
        content: "<a:VC_Alert:1482706673176150077> Questo controllo è già stato gestito.",
        flags: 1 << 6,
      })
      .catch(() => null);
    return true;
  }

  if (payload.mode === "reject") {
    const rows = buildResocontoOverrideRows(payload, interaction.message?.id);
    if (!rows.length) {
      await interaction
        .reply({
          content: "<a:VC_Alert:1482706673176150077> Non riesco a proporti azioni alternative per questo controllo.",
          flags: 1 << 6,
        })
        .catch(() => null);
      return true;
    }
    await interaction
      .reply({
        content: "Azione rifiutata. Quale azione vuoi applicare al posto di quella proposta?",
        components: rows,
        flags: 1 << 6,
      })
      .catch(() => null);
    return true;
  }

  const autoReason = resolveAutoReasonForResocontoAction(payload);
  const execution = await resolveStaffResocontoApplyExecution(interaction.guild, payload);

  if (execution.alreadyHandled) {
    await interaction.deferUpdate().catch(() => null);
    const handledMessageId = payload.messageId || interaction.message.id;
    await appendOutcomeToMessage(
      interaction.guild,
      interaction.channelId,
      handledMessageId,
      interaction.user.id,
      true,
      "<:success:1461731530333229226> Valutazioni già registrate dal sistema.",
    );
    await onResocontoOutcomeRecorded(
      interaction.guild,
      interaction.channel,
      interaction.user.id,
      payload,
    );
    await syncResocontoWorkflowOutcome(
      interaction.guild,
      interaction.channelId,
      handledMessageId,
      {
        ...resocontoActorFields(interaction),
        actionKey: payload.actionKey,
        accepted: true,
        statusLabel: "Azioni multiple",
      },
    );
    return true;
  }

  if (execution.requiresModal) {
    const modalPayload = execution.mergedPayload || payload;
    await showReasonModal(interaction, modalPayload, payload.messageId || interaction.message?.id);
    return true;
  }

  await interaction.deferUpdate().catch(() => null);

  let statusText;
  if (execution.pendingManualActions?.length) {
    statusText = await applyStaffResocontoPendingValutazioni(
      interaction.guild,
      interaction.member || interaction.user,
      payload,
      execution.pendingManualActions,
      null,
    );
  } else if (payload.kind === "s") {
    statusText = await applyStaffAction(
      interaction.guild,
      interaction.member || interaction.user,
      payload,
      autoReason || execution.autoReason || null,
    );
  } else {
    statusText = await applyPmAction(interaction.guild, payload, autoReason || null);
  }

  await appendOutcomeToMessage(
    interaction.guild,
    interaction.channelId,
    payload.messageId || interaction.message.id,
    interaction.user.id,
    true,
    statusText,
  );
  await onResocontoOutcomeRecorded(
    interaction.guild,
    interaction.channel,
    interaction.user.id,
    payload,
  );
  await syncResocontoWorkflowOutcome(
    interaction.guild,
    interaction.channelId,
    payload.messageId || interaction.message.id,
    {
      ...resocontoActorFields(interaction),
      actionKey: payload.actionKey,
      accepted: true,
      statusLabel: stripResocontoWebMessage(statusText) || undefined,
    },
  );
  if (parsedOverride) {
    await interaction
      .editReply({
        content: `<:success:1461731530333229226> Azione alternativa applicata: ${statusText}`,
        components: [],
      })
      .catch(() => null);
  }
  return true;
}

async function handleResocontoModal(interaction) {
  const parsed = parseResocontoModalCustomId(interaction.customId);
  if (!parsed) return false;
  if (!interaction.guild) return true;
  if (!hasResocontoButtonAccess(interaction, { kind: parsed.kind, roleId: parsed.roleId })) {
    await interaction
      .reply({
        content: "<a:VC_Alert:1482706673176150077> Questo modulo non è disponibile per il tuo ruolo.",
        flags: 1 << 6,
      })
      .catch(() => null);
    return true;
  }
  const activeMessage = await fetchActiveResocontoMessage(
    interaction.guild,
    interaction.channelId,
    parsed.messageId,
  );
  if (!activeMessage) {
    await interaction
      .reply({
        content: "<a:VC_Alert:1482706673176150077> Questo controllo è già stato gestito.",
        flags: 1 << 6,
      })
      .catch(() => null);
    return true;
  }
  const reason = String(interaction.fields?.getTextInputValue(RESOCONTO_REASON_INPUT_ID) || "",).trim().slice(0, 500);
  if (!reason) {
    await interaction
      .reply({
        content: "<a:VC_Alert:1482706673176150077> Motivazione non valida.",
        flags: 1 << 6,
      })
      .catch(() => null);
    return true;
  }
  await interaction.deferReply({ flags: 1 << 6 }).catch(() => null);

  const execution = await resolveStaffResocontoApplyExecution(interaction.guild, parsed);
  const statusText = execution.pendingManualActions?.length
    ? await applyStaffResocontoPendingValutazioni(
        interaction.guild,
        interaction.member || interaction.user,
        parsed,
        execution.pendingManualActions,
        reason,
        parsed.actionKey,
      )
    : await applyStaffAction(interaction.guild, interaction.member || interaction.user, parsed, reason);
  await appendOutcomeToMessage(
    interaction.guild,
    interaction.channelId,
    parsed.messageId,
    interaction.user.id,
    true,
    statusText,
  );
  await onResocontoOutcomeRecorded(
    interaction.guild,
    interaction.channel,
    interaction.user.id,
    parsed,
  );
  await syncResocontoWorkflowOutcome(interaction.guild, interaction.channelId, parsed.messageId, {
    ...resocontoActorFields(interaction),
    actionKey: parsed.actionKey,
    accepted: true,
    statusLabel: stripResocontoWebMessage(statusText) || undefined,
  });
  await interaction
    .editReply({
      content: `<:success:1461731530333229226> Azione eseguita: ${statusText}`,
    })
    .catch(() => null);
  return true;
}

async function handleResocontoActionInteraction(interaction) {
  if (interaction?.isButton?.()) {
    return handleResocontoButton(interaction);
  }
  if (interaction?.isModalSubmit?.()) {
    return handleResocontoModal(interaction);
  }
  return false;
}

function stripResocontoWebMessage(text) {
  return String(text || "")
    .replace(/<a?:[\w~-]+:\d+>/g, "")
    .replace(/<[@#&!]?\d+>/g, "")
    .replace(/[*_`~|]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveResocontoChannelId(channelId) {
  const fromArg = String(channelId || "").trim();
  if (fromArg === "site") return "site";
  if (/^\d{16,22}$/.test(fromArg)) return fromArg;
  const configured = String(IDs.channels?.resocontiStaff || IDs.channels?.valutazioniStaff || "").trim();
  if (configured) return configured;
  try {
    const { isDiscordWorkflowChannelPostsEnabled } = require("../../Utils/Web/discordWorkflowUiGate");
    if (!isDiscordWorkflowChannelPostsEnabled()) return "site";
  } catch (_) {}
  return "";
}

function buildWebResocontoAlternatives(kind) {
  if (String(kind || "") === "p") {
    return [
      { actionKey: "dp", label: "Depex" },
      { actionKey: "rc", label: "Richiamo" },
      { actionKey: "nl", label: "Nulla" },
    ];
  }
  return [
    { actionKey: "px", label: "Pex" },
    { actionKey: "dp", label: "Depex" },
    { actionKey: "vp", label: "Valutazione +" },
    { actionKey: "vn", label: "Valutazione -" },
    { actionKey: "nl", label: "Nulla" },
  ];
}

/**
 * Accetta/Rifiuta resoconto dal sito (stessa logica Discord).
 * reject senza overrideActionKey = sola chiusura ("azione negata").
 * reject/accept con overrideActionKey = azione esplicita (come menu dopo Rifiuta su Discord).
 */
async function decideResocontoFromWeb(guild, actorMember, opts = {}) {
  const action = String(opts.action || "").trim().toLowerCase();
  const messageId = String(opts.messageId || "").trim();
  const userId = String(opts.userId || "").trim();
  const kind = String(opts.kind || "").trim().toLowerCase();
  const roleId = String(opts.roleId || "").trim();
  let channelId = resolveResocontoChannelId(opts.channelId);
  const reason = String(opts.reason || opts.motivo || "").trim().slice(0, 500);
  const overrideActionKey = String(opts.overrideActionKey || opts.altActionKey || "").trim().toLowerCase();
  const proposedActionKey = String(opts.actionKey || "").trim().toLowerCase();

  const { isWorkflowMessageId, isDiscordWorkflowChannelPostsEnabled } = require("../../Utils/Web/discordWorkflowUiGate");
  const discordPosts = isDiscordWorkflowChannelPostsEnabled();
  if (!channelId && !discordPosts) channelId = "site";

  if (!guild || !actorMember?.id) {
    return { ok: false, status: 400, error: "bad_request", message: "Richiesta non valida." };
  }
  if (!["accept", "reject"].includes(action)) {
    return { ok: false, status: 400, error: "bad_action", message: "Azione non valida." };
  }
  if (!isWorkflowMessageId(messageId) || !/^\d{16,22}$/.test(userId)) {
    return {
      ok: false,
      status: 400,
      error: "missing_fields",
      message: "messageId e userId richiesti.",
    };
  }
  if (discordPosts && !channelId) {
    return {
      ok: false,
      status: 400,
      error: "missing_fields",
      message: "messageId, userId e canale resoconti richiesti.",
    };
  }
  if (kind !== "s" && kind !== "p") {
    return { ok: false, status: 400, error: "bad_kind", message: "Tipo resoconto non valido." };
  }

  const accessPayload = { kind, userId, roleId: kind === "s" ? roleId : null };
  if (!memberHasResocontoButtonAccess(actorMember, accessPayload)) {
    return {
      ok: false,
      status: 403,
      error: "forbidden",
      message: "Non autorizzato a gestire questo resoconto.",
    };
  }

  const resocontoItemCtx = { messageId, userId, kind, roleId, channelId };
  const ensureResocontoItem = (syncedItem, extra = {}) => {
    if (syncedItem) return syncedItem;
    try {
      const { resocontoWorkflowItemFromSnapshot } = require("../../Utils/Web/siteStaffWorkflowStore");
      return resocontoWorkflowItemFromSnapshot({ ...resocontoItemCtx, ...extra });
    } catch {
      return null;
    }
  };

  const activeMessage =
    channelId && channelId !== "site"
      ? await fetchActiveResocontoMessage(guild, channelId, messageId)
      : null;

  let dbWorkflowDetail = null;
  if (!activeMessage) {
    try {
      const { getStaffWorkflowDetailFromDb } = require("../../Utils/Web/siteStaffWorkflowStore");
      dbWorkflowDetail = await getStaffWorkflowDetailFromDb(
        guild.client,
        guild.id,
        "resoconti",
        messageId,
        userId,
      );
    } catch (_) {
      dbWorkflowDetail = null;
    }
    const dbPending = String(dbWorkflowDetail?.status || "").toLowerCase() === "pending";
    if (!dbPending) {
      const syncedItem = await syncResocontoWorkflowOutcome(guild, channelId, messageId, {
        ...resocontoActorFields(actorMember),
        userId,
        kind,
        roleId: kind === "s" ? roleId : null,
        channelId,
      });
      const item = ensureResocontoItem(syncedItem, { status: "accepted", statusLabel: "Accettata" });
      return {
        ok: false,
        status: 409,
        error: "already_handled",
        message: "Questo resoconto è già stato gestito.",
        ...(item ? { item } : {}),
      };
    }
  }

  const channel =
    channelId && channelId !== "site"
      ? (await getGuildChannelCached(guild, channelId).catch(() => null)) || activeMessage?.channel || null
      : null;
  const markWorkflow = async (status, statusLabel, appliedActionKey = "", editedMessage = null) => {
    return syncResocontoWorkflowOutcome(guild, channelId, messageId, {
      ...resocontoActorFields(actorMember),
      userId,
      kind,
      roleId: kind === "s" ? roleId : null,
      channelId,
      actionKey: appliedActionKey,
      accepted: status !== "rejected",
      statusLabel,
      ...(editedMessage ? { message: editedMessage } : {}),
    });
  };
  const decisionLabel = (actionKey, rejected = false) => {
    if (rejected) return "Azione negata";
    try {
      const { resocontoActionLabelForKey } = require("../../Utils/Web/siteStaffWorkflowStore");
      return resocontoActionLabelForKey(actionKey) || "Accettata";
    } catch {
      return "Accettata";
    }
  };

  // Rifiuta senza alternativa → chiudi come "azione negata" (senza Pex/Depex/VP).
  if (action === "reject" && !overrideActionKey) {
    const editedMsg = await appendOutcomeToMessage(guild, channelId, messageId, actorMember.id, false, "");
    const syncedItem = await markWorkflow("rejected", decisionLabel("", true), "", editedMsg);
    void onResocontoOutcomeRecorded(guild, channel, actorMember.id, accessPayload).catch(() => null);
    const item = ensureResocontoItem(syncedItem, {
      status: "rejected",
      statusLabel: decisionLabel("", true),
      body: String(editedMsg?.content || ""),
    });
    return {
      ok: true,
      status: 200,
      message: "Resoconto rifiutato (nessuna azione applicata).",
      alternatives: buildWebResocontoAlternatives(kind),
      ...(item ? { item } : {}),
    };
  }

  let resolvedProposedKey = proposedActionKey;
  if (!overrideActionKey && !resolvedProposedKey && activeMessage) {
    try {
      const { parseResocontoFromMessage } = require("../../Utils/Web/siteStaffWorkflowStore");
      const parsed = parseResocontoFromMessage(activeMessage);
      resolvedProposedKey = String(parsed?.actionKey || "").trim().toLowerCase();
    } catch (_) {}
  }
  if (!overrideActionKey && !resolvedProposedKey && dbWorkflowDetail) {
    resolvedProposedKey = String(dbWorkflowDetail.actionKey || "").trim().toLowerCase();
  }

  const acceptDefaultKey = kind === "p" ? "nl" : "batch";
  const effectiveActionKey =
    overrideActionKey ||
    (action === "accept" ? resolvedProposedKey || acceptDefaultKey : "");
  if (kind === "s" && effectiveActionKey && !STAFF_ACTIONS.has(effectiveActionKey)) {
    return { ok: false, status: 400, error: "bad_action_key", message: "Azione staff non valida." };
  }
  if (kind === "p" && effectiveActionKey && !PM_ACTIONS.has(effectiveActionKey)) {
    return { ok: false, status: 400, error: "bad_action_key", message: "Azione PM non valida." };
  }

  const payload = {
    mode: "apply",
    kind,
    userId,
    roleId: kind === "s" ? roleId : null,
    actionKey: effectiveActionKey || (kind === "s" ? "batch" : "nl"),
    messageId,
    explicitChoice: Boolean(overrideActionKey),
  };

  const execution = await resolveStaffResocontoApplyExecution(guild, payload);
  if (execution.alreadyHandled) {
    const handledKey = String(execution.alreadyHandledActionKey || payload.actionKey || "batch").trim();
    const handledLabel = decisionLabel(handledKey);
    const handledStatus =
      handledKey === "vp"
        ? "<:success:1461731530333229226> Valutazione Positiva già registrata."
        : handledKey === "vn"
          ? "<:success:1461731530333229226> Valutazione Negativa già registrata."
          : "<:success:1461731530333229226> Valutazioni già registrate dal sistema.";
    await appendOutcomeToMessage(
      guild,
      channelId,
      messageId,
      actorMember.id,
      true,
      handledStatus,
    );
    await onResocontoOutcomeRecorded(guild, channel, actorMember.id, payload);
    const syncedItem = await markWorkflow("accepted", handledLabel, handledKey);
    const item = ensureResocontoItem(syncedItem, {
      status: "accepted",
      actionKey: handledKey,
      statusLabel: handledLabel,
    });
    return {
      ok: true,
      status: 200,
      message:
        handledKey === "vp"
          ? "Valutazione Positiva già registrata."
          : handledKey === "vn"
            ? "Valutazione Negativa già registrata."
            : "Valutazioni già registrate dal sistema.",
      ...(item ? { item } : {}),
    };
  }

  if (execution.requiresModal && !reason) {
    const modalKey = String(execution.mergedPayload?.actionKey || payload.actionKey || "").trim();
    return {
      ok: false,
      status: 400,
      error: "reason_required",
      message:
        modalKey === "px"
          ? "Inserisci il motivo del Pex."
          : modalKey === "dp"
            ? "Inserisci il motivo del Depex."
            : "Inserisci una motivazione per proseguire.",
      needsReason: true,
      actionKey: modalKey || null,
      alternatives: buildWebResocontoAlternatives(kind),
    };
  }

  let statusText;
  if (execution.pendingManualActions?.length) {
    statusText = await applyStaffResocontoPendingValutazioni(
      guild,
      actorMember,
      payload,
      execution.pendingManualActions,
      reason || null,
      reason ? String(execution.mergedPayload?.actionKey || payload.actionKey || "") : null,
    );
  } else if (payload.kind === "s") {
    statusText = await applyStaffAction(
      guild,
      actorMember,
      execution.mergedPayload || payload,
      reason || execution.autoReason || resolveAutoReasonForResocontoAction(payload) || null,
    );
  } else {
    statusText = await applyPmAction(
      guild,
      payload,
      reason || resolveAutoReasonForResocontoAction(payload) || null,
    );
  }

  const editedMsg = await appendOutcomeToMessage(guild, channelId, messageId, actorMember.id, true, statusText);
  const appliedKey = effectiveActionKey || payload.actionKey;
  const appliedLabel = decisionLabel(appliedKey);
  const syncedItem = await markWorkflow("accepted", appliedLabel, appliedKey, editedMsg);
  void onResocontoOutcomeRecorded(guild, channel, actorMember.id, payload).catch(() => null);

  const item = ensureResocontoItem(syncedItem, {
    status: "accepted",
    actionKey: appliedKey,
    statusLabel: appliedLabel,
    body: String(editedMsg?.content || ""),
  });

  return {
    ok: true,
    status: 200,
    message: stripResocontoWebMessage(statusText) || "Resoconto applicato.",
    ...(item ? { item } : {}),
  };
}

module.exports = {
  RESOCONTO_APPLY_PREFIX,
  RESOCONTO_REJECT_PREFIX,
  handleResocontoActionInteraction,
  applyDepexSideEffects,
  sendPexDepexLog,
  decideResocontoFromWeb,
  buildWebResocontoAlternatives,
};