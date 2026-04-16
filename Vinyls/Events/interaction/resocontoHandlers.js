const { EmbedBuilder, ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle, } = require("discord.js");
const IDs = require("../../Utils/Config/ids");
const { getGuildChannelCached, getGuildMemberCached, getClientChannelCached, } = require("../../Utils/Interaction/interactionEntityCache");
const { getOrCreateStaffDoc, deleteThreadForMessage, ensureStaff } = require("../../Utils/Staff/staffDocUtils");
const { initPartnerManagerFieldsIfMissing, syncStaffDbAndPauseChannelAfterDepex } = require("../../Utils/Staff/staffPmUtils");
const { addStaffWarnFromNegatives, applyFullDepex, getHighestStaffRoleId } = require("../../Services/Staff/staffWarnService");
const { memberHasStaffRole } = require("../../Utils/Community/staffListUtils");
const { getStaffRoleEmojiByRoleId } = require("../../Utils/Community/staffRoleEmoji");
const { clearStaffPendingPurgeAt } = require("../../Services/Community/userLeaveBackupService");
const RESOCONTO_APPLY_PREFIX = "resoconto_apply";
const RESOCONTO_REJECT_PREFIX = "resoconto_reject";
const RESOCONTO_OVERRIDE_PREFIX = "resoconto_override";
const RESOCONTO_REASON_MODAL_PREFIX = "resoconto_reason";
const RESOCONTO_REASON_INPUT_ID = "reason";
const STAFF_ACTIONS = new Set(["px", "dp", "vp", "vn", "nl"]);
const PM_ACTIONS = new Set(["dp", "rc", "nl"]);
const ROLE_UP = { [String(IDs.roles.Helper)]: String(IDs.roles.Mod), [String(IDs.roles.Mod)]: String(IDs.roles.Coordinator), [String(IDs.roles.Coordinator)]: String(IDs.roles.Supervisor), };
const ROLE_PARTNER_MANAGER = String(IDs.roles.PartnerManager);
const ROLE_MEMBER = String(IDs.roles.Member || "");
const ROLE_STAFF = String(IDs.roles.Staff);
const ROLE_HIGH_STAFF = String(IDs.roles.HighStaff);
const ROLE_HELPER = String(IDs.roles.Helper);
const ROLE_MODERATOR = String(IDs.roles.Mod);
const ROLE_COORDINATOR = String(IDs.roles.Coordinator);
const ROLE_SUPERVISOR = String(IDs.roles.Supervisor);
const ROLE_ADMIN = String(IDs.roles.Admin);
const ROLE_CO_OWNER = String(IDs.roles.CoFounder);
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

function hasResocontoHighStaffAccess(interaction) {
  return Boolean(
    interaction?.member?.roles?.cache?.has?.(ROLE_HIGH_STAFF),
  );
}

function isModOrAboveRoleId(roleId) {
  const normalized = String(roleId || "");
  const modOrAbove = [
    ROLE_MODERATOR,
    ROLE_COORDINATOR,
    ROLE_SUPERVISOR,
    ROLE_ADMIN,
    ROLE_CO_OWNER,
    ROLE_OWNER,
  ].filter(Boolean);
  return modOrAbove.includes(normalized);
}

function resolveAutoReasonForResocontoAction(payload) {
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
  if (["vp", "vn"].includes(payload.actionKey)) return true;
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

async function sendValutazioneLogEmbed(guild, actor, targetUser, reason, positive) {
  const channel = await getGuildChannelCached(guild, IDs.channels.valutazioniStaff);
  if (!channel?.isTextBased?.()) return;

  const title = positive ? "<:thumbsup:1471292172145004768> **__VALUTAZIONE POSITIVA__**" : "<:thumbsdown:1471292163957457013> **__VALUTAZIONE NEGATIVA__**";
  const embed = new EmbedBuilder()
    .setAuthor({
      name: `Valutazione eseguita da ${actor.username}`,
      iconURL: actor.displayAvatarURL(),
    })
    .setTitle(title)
    .setThumbnail(targetUser.displayAvatarURL())
    .setDescription(
      [
        `<:VC_Staff:1494286904089247754> <a:VC_Arrow:1482706699365257397> <@${targetUser.id}>`,
        `<:VC_reason:1478517122929004544> __${reason}__`,
      ].join("\n"),
    )
    .setColor("#6f4e37");

  await channel.send({ content: `<@${targetUser.id}>`, embeds: [embed] }).catch(() => null);
}

async function applyAutomaticValutazione(guild, client, targetUser, positive, reason) {
  if (!guild || !client?.user || !targetUser?.id) return;
  const profileDoc = await getOrCreateStaffDoc(guild.id, targetUser.id);
  const s = ensureStaff(profileDoc);
  const reasonStr = String(reason || "").trim() || (positive ? "Limite sanzioni settimanale completato" : "Limite sanzioni settimanale non completato");
  s.valutazioniCount = Math.max(0, Number(s.valutazioniCount || 0)) + 1;
  if (positive) {
    s.positiveCount = Math.max(0, Number(s.positiveCount || 0)) + 1;
    if (!Array.isArray(s.positiveReasons)) s.positiveReasons = [];
    s.positiveReasons.push(reasonStr);
  } else {
    s.negativeCount = Math.max(0, Number(s.negativeCount || 0)) + 1;
    if (!Array.isArray(s.negativeReasons)) s.negativeReasons = [];
    s.negativeReasons.push(reasonStr);
  }
  profileDoc.markModified("staff");
  await profileDoc.save();
  await sendValutazioneLogEmbed(guild, client.user, targetUser, reasonStr, positive);
}

async function applyPexSideEffects(guild, member, roleId) {
  if (roleId === ROLE_HELPER) {
    return ensureRoleAdded(guild, member, ROLE_STAFF);
  }
  if (roleId === ROLE_MODERATOR) return ensureRoleRemoved(guild, member, ROLE_HELPER);
  if (roleId === ROLE_COORDINATOR) return ensureRoleRemoved(guild, member, ROLE_MODERATOR);
  if (roleId === ROLE_SUPERVISOR) return ensureRoleRemoved(guild, member, ROLE_COORDINATOR);
  if (roleId === ROLE_ADMIN) {
    const supervisorRemoved = await ensureRoleRemoved(guild, member, ROLE_SUPERVISOR);
    const highStaffAdded = await ensureRoleAdded(guild, member, ROLE_HIGH_STAFF);
    return supervisorRemoved && highStaffAdded;
  }
  if (roleId === ROLE_CO_OWNER) return ensureRoleRemoved(guild, member, ROLE_ADMIN);
  if (roleId === ROLE_OWNER) return ensureRoleRemoved(guild, member, ROLE_CO_OWNER);
  return true;
}

async function applyDepexSideEffects(guild, member, roleId) {
  if (roleId === ROLE_PARTNER_MANAGER) {
    const roleRemoved = await ensureRoleRemoved(guild, member, roleId);
    const memberAdded = ROLE_MEMBER ? await ensureRoleAdded(guild, member, ROLE_MEMBER) : true;
    return roleRemoved && memberAdded;
  }
  if (roleId === ROLE_HELPER || roleId === ROLE_MODERATOR) {
    const roleRemoved = await ensureRoleRemoved(guild, member, roleId);
    const staffRemoved = await ensureRoleRemoved(guild, member, ROLE_STAFF);
    const memberAdded = ROLE_MEMBER ? await ensureRoleAdded(guild, member, ROLE_MEMBER) : true;
    return roleRemoved && staffRemoved && memberAdded;
  }
  if (roleId === ROLE_COORDINATOR) {
    const coordinatorRemoved = await ensureRoleRemoved(guild, member, ROLE_COORDINATOR);
    const moderatorAdded = await ensureRoleAdded(guild, member, ROLE_MODERATOR);
    const staffAdded = await ensureRoleAdded(guild, member, ROLE_STAFF);
    return coordinatorRemoved && moderatorAdded && staffAdded;
  }
  if (roleId === ROLE_SUPERVISOR) {
    const supervisorRemoved = await ensureRoleRemoved(guild, member, ROLE_SUPERVISOR);
    const coordinatorAdded = await ensureRoleAdded(guild, member, ROLE_COORDINATOR);
    const staffAdded = await ensureRoleAdded(guild, member, ROLE_STAFF);
    return supervisorRemoved && coordinatorAdded && staffAdded;
  }
  if (roleId === ROLE_ADMIN || roleId === ROLE_CO_OWNER) {
    const roleRemoved = await ensureRoleRemoved(guild, member, roleId);
    const staffRemoved = await ensureRoleRemoved(guild, member, ROLE_STAFF);
    const highStaffRemoved = await ensureRoleRemoved(guild, member, ROLE_HIGH_STAFF);
    const memberAdded = ROLE_MEMBER ? await ensureRoleAdded(guild, member, ROLE_MEMBER) : true;
    return roleRemoved && staffRemoved && highStaffRemoved && memberAdded;
  }
  if (roleId === ROLE_OWNER) {
    const roleRemoved = await ensureRoleRemoved(guild, member, ROLE_OWNER);
    const coOwnerRemoved = await ensureRoleRemoved(guild, member, ROLE_CO_OWNER);
    const staffRemoved = await ensureRoleRemoved(guild, member, ROLE_STAFF);
    const highStaffRemoved = await ensureRoleRemoved(guild, member, ROLE_HIGH_STAFF);
    const memberAdded = ROLE_MEMBER ? await ensureRoleAdded(guild, member, ROLE_MEMBER) : true;
    return roleRemoved && coOwnerRemoved && staffRemoved && highStaffRemoved && memberAdded;
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
    const s = ensureStaff(profileDoc);
    const reason = String(reasonOverride || "").trim() || "<:success:1461731530333229226> Limiti settimanali rispettati";
    s.valutazioniCount = Math.max(0, Number(s.valutazioniCount || 0)) + 1;
    s.positiveCount = Math.max(0, Number(s.positiveCount || 0)) + 1;
    if (!Array.isArray(s.positiveReasons)) s.positiveReasons = [];
    s.positiveReasons.push(reason);
    profileDoc.markModified("staff");
    await profileDoc.save();
    await sendValutazioneLogEmbed(guild, actor, targetUser, reason, true);
    return "<:thumbsup:1471292172145004768> Registrata Valutazione Positiva.";
  }

  if (payload.actionKey === "vn") {
    const profileDoc = await getOrCreateStaffDoc(guild.id, payload.userId);
    const s = ensureStaff(profileDoc);
    const reason = String(reasonOverride || "").trim() || "<:cancel:1461730653677551691> Limiti settimanali non rispettati";
    s.valutazioniCount = Math.max(0, Number(s.valutazioniCount || 0)) + 1;
    s.negativeCount = Math.max(0, Number(s.negativeCount || 0)) + 1;
    if (!Array.isArray(s.negativeReasons)) s.negativeReasons = [];
    s.negativeReasons.push(reason);
    profileDoc.markModified("staff");
    await profileDoc.save();
    await sendValutazioneLogEmbed(guild, actor, targetUser, reason, false);

    const warnResult = await addStaffWarnFromNegatives(guild.id, payload.userId, s.negativeCount, reason);
    if (warnResult.added) {
      const warnChannel = await getGuildChannelCached(guild, IDs.channels?.warnStaff);
      if (warnChannel?.isTextBased?.()) {
        const warnLogEmbed = new EmbedBuilder()
          .setAuthor({ name: `Warn automatico (3 valutazioni negative) da ${actor.username}`, iconURL: actor.displayAvatarURL() })
          .setTitle(`<a:VC_Alert:1482706673176150077> • **__WARN STAFF__** \`#${warnResult.warnCount}\``)
          .setThumbnail(targetUser.displayAvatarURL())
          .setDescription(`<@${payload.userId}>\n<:VC_reason:1478517122929004544> __${String(reason).slice(0, 400)}__`)
          .setColor("#E74C3C");
        await warnChannel.send({ content: `<@${payload.userId}>`, embeds: [warnLogEmbed] }).catch(() => null);
        if (warnResult.shouldAskDepex) {
          const embed = new EmbedBuilder()
            .setColor("#E74C3C")
            .setTitle("<a:VC_Alert:1482706673176150077> 2 warn staff — Decidi azione")
            .setDescription(
              `<@${payload.userId}> ha raggiunto **2 warn staff** (da valutazioni negative).\n\n` +
              "**Depex ora** = un livello in basso .\n" +
              "**No** = nessuna azione ora; al **3° warn** scatterà il **depex completo**.",
            )
            .setThumbnail(targetUser.displayAvatarURL());
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`staff_warn_depex:${payload.userId}:yes`).setLabel("Depex ora").setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`staff_warn_depex:${payload.userId}:no`).setLabel("No (al 3° warn depex completo)").setStyle(ButtonStyle.Secondary),
          );
          await warnChannel.send({ content: `<@${payload.userId}>`, embeds: [embed], components: [row] }).catch(() => null);
        }
      }
    }
    if (warnResult.added && warnResult.shouldFullDepex) {
      const roleId = String(payload.roleId || "");
      const fullResult = await applyFullDepex(guild, member, roleId || null);
      if (fullResult.ok) {
        const memberAfterFull = await getGuildMemberCached(guild, payload.userId, { preferFresh: true }).catch(() => member);
        await syncStaffDbAndPauseChannelAfterDepex(guild, payload.userId, memberAfterFull);
        const roleAfterId = resolvePexDepexLogRoleAfterId(memberAfterFull);
        await sendPexDepexLog(guild, "depex", targetUser, roleId, roleAfterId, `Depex automatico: 3 warn staff (valutazioni negative).`);
      }
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
    return "<:success:1461731530333229226> Pex applicato.";
  }

  if (payload.actionKey === "dp") {
    if (!member.roles.cache.has(roleBeforeId)) return "<a:VC_Alert:1482706673176150077> Depex non applicato: ruolo corrente non presente.";

    const roleRemoved = await ensureRoleRemoved(guild, member, roleBeforeId);
    if (!roleRemoved) return "<a:VC_Alert:1482706673176150077> Depex non applicato: impossibile rimuovere il ruolo corrente.";
    const sideEffectsApplied = await applyDepexSideEffects(guild, member, roleBeforeId);
    if (!sideEffectsApplied) return "<a:VC_Alert:1482706673176150077> Depex applicato parzialmente: side-effect ruoli non completati.";
    const memberAfterDepex = await getGuildMemberCached(guild, payload.userId, { preferFresh: true }).catch(() => member);
    await syncStaffDbAndPauseChannelAfterDepex(guild, payload.userId, memberAfterDepex);
    const roleAfterId = resolvePexDepexLogRoleAfterId(memberAfterDepex);
    await sendPexDepexLog(guild, "depex", targetUser, roleBeforeId, roleAfterId, reason);
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
  await member.roles.remove(ROLE_COORDINATOR).catch(() => null);
  await member.roles.remove(ROLE_SUPERVISOR).catch(() => null);
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
  if (!hasResocontoHighStaffAccess(interaction)) {
    await interaction
      .reply({
        content: "<a:VC_Alert:1482706673176150077> Questo controllo è riservato all'High Staff.",
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

  const statusText = payload.kind === "s"
    ? await applyStaffAction(interaction.guild, interaction.user, payload, autoReason || null)
    : await applyPmAction(interaction.guild, payload, autoReason || null);

  await appendOutcomeToMessage(
    interaction.guild,
    interaction.channelId,
    payload.messageId || interaction.message.id,
    interaction.user.id,
    true,
    statusText,
  );
  if (parsedOverride) {
    await interaction
      .update({
        content: `<:success:1461731530333229226> Azione alternativa applicata: ${statusText}`,
        components: [],
      })
      .catch(() => null);
  } else {
    await interaction.deferUpdate().catch(() => null);
  }
  return true;
}

async function handleResocontoModal(interaction) {
  const parsed = parseResocontoModalCustomId(interaction.customId);
  if (!parsed) return false;
  if (!interaction.guild) return true;
  if (!hasResocontoHighStaffAccess(interaction)) {
    await interaction
      .reply({
        content: "<a:VC_Alert:1482706673176150077> Questo modulo è riservato all'High Staff.",
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

  const statusText = await applyStaffAction(interaction.guild, interaction.user, parsed, reason);
  await appendOutcomeToMessage(
    interaction.guild,
    interaction.channelId,
    parsed.messageId,
    interaction.user.id,
    true,
    statusText,
  );
  await interaction
    .reply({
      content: `<:success:1461731530333229226> Azione eseguita: ${statusText}`,
      flags: 1 << 6,
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

module.exports = { RESOCONTO_APPLY_PREFIX, RESOCONTO_REJECT_PREFIX, applyAutomaticValutazione, handleResocontoActionInteraction, applyDepexSideEffects, sendPexDepexLog };