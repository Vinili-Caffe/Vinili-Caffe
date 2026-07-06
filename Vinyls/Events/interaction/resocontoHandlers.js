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
const STAFF_ACTIONS = new Set(["px", "dp", "vp", "vn", "nl"]);
const PM_ACTIONS = new Set(["dp", "rc", "nl"]);
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
    return { mode: "apply", kind, userId, roleId: roleIdRaw, actionKey, messageId };
  }
  if (kind === "p") {
    if (!PM_ACTIONS.has(actionKey)) return null;
    return { mode: "apply", kind, userId, roleId: null, actionKey, messageId };
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
    return "Limiti settimanali rispettati";
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
  if (!["px", "dp", "vp", "vn"].includes(actionKey)) return null;
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
  const channel = await getGuildChannelCached(guild, IDs.channels.valutazioniStaff);
  if (!channel?.isTextBased?.()) return;

  const ord = Math.max(0, Math.floor(Number(sectionOrdinal || 0)));
  const vid = Math.max(0, Math.floor(Number(valutazioniCount || 0)));
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
  const channelId = IDs.channels?.pexDepex;
  if (!guild || !channelId) return null;
  const id = String(channelId);
  return (
    guild.channels?.cache?.get(id) ||
    (await getGuildChannelCached(guild, id)) ||
    (guild.client ? await getClientChannelCached(guild.client, id) : null)
  );
}

async function sendPexDepexLog(guild, type, targetUser, oldRoleId, newRoleId, reason) {
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

async function appendOutcomeToMessage(guild, channelId, messageId, actorId, accepted, statusText) {
  const channel = await getGuildChannelCached(guild, channelId);
  if (!channel?.isTextBased?.()) return;
  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message) return;
  const existingContent = String(message.content || "");
  const line = accepted ? `\n\n<:success:1461731530333229226> Azione confermata da <@${actorId}>:${statusText}`
    : `\n\n<:cancel:1461730653677551691> Azione negata da <@${actorId}>`;
  const content = `${existingContent}${line}`.slice(0, 1900);
  await message.edit({ content, components: [] }).catch(() => null);
  await deleteThreadForMessage(guild, messageId);
}

async function applyStaffAction(guild, actor, payload, reasonOverride = null) {
  const member = await getGuildMemberCached(guild, payload.userId);
  if (!member) return "<a:VC_Alert:1482706673176150077> Utente non trovato nel server.";

  if (payload.actionKey === "nl") return "<a:VC_Alert:1482706673176150077> Nessuna azione applicata.";

  const targetUser = member.user;
  if (payload.actionKey === "vp") {
    const profileDoc = await getOrCreateStaffDoc(guild.id, payload.userId);
    const reason = String(reasonOverride || "").trim() || "<:success:1461731530333229226> Limiti settimanali rispettati";
    const channel = await getGuildChannelCached(guild, IDs.channels.valutazioniStaff);
    if (!channel?.isTextBased?.()) return "<a:VC_Alert:1482706673176150077> Canale valutazioni non disponibile.";
    const { valutazionePositiveAddCore } = require("../../Utils/Staff/valutazionePanelActions");
    const result = await valutazionePositiveAddCore(profileDoc, targetUser, reason, actor, channel);
    if (!result?.message) return "<a:VC_Alert:1482706673176150077> Errore registrazione valutazione positiva.";
    return "<:thumbsup:1471292172145004768> Registrata Valutazione Positiva.";
  }

  if (payload.actionKey === "vn") {
    const profileDoc = await getOrCreateStaffDoc(guild.id, payload.userId);
    const reason = String(reasonOverride || "").trim() || "<:cancel:1461730653677551691> Limiti settimanali non rispettati";
    const channel = await getGuildChannelCached(guild, IDs.channels.valutazioniStaff);
    if (!channel?.isTextBased?.()) return "<a:VC_Alert:1482706673176150077> Canale valutazioni non disponibile.";
    const { valutazioneNegativeAddCore } = require("../../Utils/Staff/valutazionePanelActions");
    const result = await valutazioneNegativeAddCore(guild, profileDoc, targetUser, reason, actor, channel);
    if (!result?.message) return "<a:VC_Alert:1482706673176150077> Errore registrazione valutazione negativa.";
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
    input.setPlaceholder("Es: Limiti settimanali rispettati");
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
  if (shouldOpenReasonModalForResocontoApply(payload)) {
    await showReasonModal(interaction, payload, payload.messageId || interaction.message?.id);
    return true;
  }
  await interaction.deferUpdate().catch(() => null);

  const statusText = payload.kind === "s"
    ? await applyStaffAction(interaction.guild, interaction.member || interaction.user, payload, autoReason || null)
    : await applyPmAction(interaction.guild, payload, autoReason || null);

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

  const statusText = await applyStaffAction(interaction.guild, interaction.member || interaction.user, parsed, reason);
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

module.exports = { RESOCONTO_APPLY_PREFIX, RESOCONTO_REJECT_PREFIX, handleResocontoActionInteraction, applyDepexSideEffects, sendPexDepexLog };