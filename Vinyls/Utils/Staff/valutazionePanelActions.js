const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { getOrCreateStaffDoc, ensureStaff, incrementStaffValutazioneCounters } = require("../../Utils/Staff/staffDocUtils");
const IDs = require("../../Utils/Config/ids");
const { getGuildChannelCached, getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache");
const {
  addStaffWarnFromNegatives,
  applyFullDepex,
  getHighestStaffRoleId,
  STAFF_WARN_THREE_NEGATIVES_REASON,
} = require("../../Services/Staff/staffWarnService");
const { syncStaffDbAndPauseChannelAfterDepex } = require("../../Utils/Staff/staffPmUtils");
const { accountUsername, guildMemberDisplayAvatarUrlDynamic } = require("../Discord/guildDiscordIdentity");

async function ensureStaffProfileDoc(profileDoc, guildId, userId) {
  if (profileDoc) {
    ensureStaff(profileDoc);
    return profileDoc;
  }
  return getOrCreateStaffDoc(guildId, userId);
}

async function getStaffDoc(guildId, userId) {
  const g = String(guildId ?? "").trim();
  const u = String(userId ?? "").trim();
  if (!g || !u) return null;
  return ActivityUserProfile.findOne({ guildId: g, userId: u });
}

function makeLogEmbed(
  actor,
  user,
  title,
  reason,
  idValue,
  color = "#6f4e37",
  guild = null,
) {
  const actorLike = actor.member || actor.user;
  const targetMember = guild?.members?.cache?.get(user.id) || null;
  return new EmbedBuilder()
    .setAuthor({
      name: `Valutazione eseguita da ${accountUsername(actorLike)}`,
      iconURL: guildMemberDisplayAvatarUrlDynamic(actorLike) || undefined,
    })
    .setTitle(title)
    .setThumbnail(guildMemberDisplayAvatarUrlDynamic(targetMember || user) || undefined)
    .setDescription(
      [
        `<:VC_Staff:1494286904089247754> <a:VC_Arrow:1482706699365257397> ${user}`,
        `<:VC_reason:1478517122929004544> __${reason}__`,
        `<:VC_id:1478517313618575419> **ID Valutazione** __\`${idValue}\`__`,
      ].join("\n"),
    )
    .setColor(color);
}

/** Embed warn automatico: stesso author/descrizione delle valutazioni da pannello (`makeLogEmbed`). */
function buildAutoStaffWarnFromNegativesEmbed(actorLike, targetUser, warnCount, guild = null) {
  const actorForAuthor = actorLike?.member || actorLike?.user || actorLike;
  const username = accountUsername(actorForAuthor) || "Staff";
  const targetMention = targetUser?.id ? `<@${targetUser.id}>` : String(targetUser || "");
  const targetMember = guild?.members?.cache?.get(targetUser.id) || null;
  const thumb = guildMemberDisplayAvatarUrlDynamic(targetMember || targetUser);
  return new EmbedBuilder()
    .setAuthor({
      name: `Valutazione eseguita da ${username}`,
      iconURL: guildMemberDisplayAvatarUrlDynamic(actorForAuthor) || undefined,
    })
    .setTitle(`<a:VC_Alert:1482706673176150077> • **__WARN STAFF__** \`#${warnCount}\``)
    .setThumbnail(thumb)
    .setDescription(
      [
        `<:VC_Staff:1494286904089247754> <a:VC_Arrow:1482706699365257397> ${targetMention}`,
        `<:VC_reason:1478517122929004544> __${STAFF_WARN_THREE_NEGATIVES_REASON}__`,
        `<:VC_id:1478517313618575419> **ID Warn** __\`${warnCount}\`__`,
      ].join("\n"),
    )
    .setColor("#E74C3C");
}

function makeRemovalEmbed(actor, user, title, description, reason, updatedLabel, updatedValue) {
  const actorLike = actor.member || actor.user;
  const safeDescriptionRaw = String(description || "").trim();
  const safeDescription = safeDescriptionRaw
    ? safeDescriptionRaw.replace("{user}", user.toString())
    : `<:VC_Staff:1494286904089247754> <a:VC_Arrow:1482706699365257397> ${user}`;
  const safeReasonField = String(reason || "").trim() || "—";
  const safeUpdatedLabel = String(updatedLabel || "").trim() || "Aggiornamento";
  const safeUpdatedValue = String(updatedValue || "").trim() || "—";
  return new EmbedBuilder()
    .setAuthor({
      name: `Valutazione rimossa da ${accountUsername(actorLike)}`,
      iconURL: guildMemberDisplayAvatarUrlDynamic(actorLike) || undefined,
    })
    .setTitle(title)
    .setDescription(safeDescription)
    .addFields(
      { name: "<:VC_reason:1478517122929004544> Motivazione: ", value: safeReasonField, inline: false },
      { name: safeUpdatedLabel, value: safeUpdatedValue, inline: false },
    )
    .setColor("#6f4e37");
}

async function sendChannelEmbed(channel, payload) {
  if (!channel) return null;
  return channel.send(payload).catch(() => null);
}

function getValutazioneEntry(staff, kind, index, reason) {
  const listName = kind === "negative" ? "negativeValutazioni" : "positiveValutazioni";
  const reasonsName = kind === "negative" ? "negativeReasons" : "positiveReasons";
  const list = Array.isArray(staff?.[listName]) ? staff[listName] : [];
  const reasons = Array.isArray(staff?.[reasonsName]) ? staff[reasonsName] : [];
  const byIndex = list[index] || null;
  if (byIndex?.messageId && byIndex?.channelId) return byIndex;

  const targetReason = String(reason || "");
  let reasonOccurrenceAtIndex = 0;
  for (let i = 0; i <= index && i < reasons.length; i += 1) {
    if (String(reasons[i] || "") === targetReason) reasonOccurrenceAtIndex += 1;
  }
  if (reasonOccurrenceAtIndex <= 0) return null;

  const auto = Array.isArray(staff?.autoValutazioni) ? staff.autoValutazioni : [];
  let seen = 0;
  for (const entry of auto) {
    if (String(entry?.type || "") !== kind) continue;
    if (String(entry?.reason || "") !== targetReason) continue;
    if (!String(entry?.messageId || "") || !String(entry?.channelId || "")) continue;
    seen += 1;
    if (seen === reasonOccurrenceAtIndex) return entry;
  }
  return null;
}

function removeLinkedAutoValutazioneEntry(staff, resolvedEntry) {
  const messageId = String(resolvedEntry?.messageId || "").trim();
  if (!messageId || !Array.isArray(staff?.autoValutazioni)) return;
  staff.autoValutazioni = staff.autoValutazioni.filter(
    (entry) => String(entry?.messageId || "") !== messageId,
  );
}

function pushValutazioneEntry(staff, kind, reason, message) {
  const listName = kind === "negative" ? "negativeValutazioni" : "positiveValutazioni";
  if (!Array.isArray(staff[listName])) staff[listName] = [];
  staff[listName].push({
    reason: String(reason || ""),
    channelId: message?.channelId ? String(message.channelId) : null,
    messageId: message?.id ? String(message.id) : null,
    createdAt: new Date(),
  });
}

function removeValutazioneEntry(staff, kind, index) {
  const listName = kind === "negative" ? "negativeValutazioni" : "positiveValutazioni";
  if (!Array.isArray(staff?.[listName])) return;
  if (index >= 0 && index < staff[listName].length) staff[listName].splice(index, 1);
}

async function editOriginalValutazioneMessage(guild, entry, embed) {
  const channelId = String(entry?.channelId || "").trim();
  const messageId = String(entry?.messageId || "").trim();
  if (!guild || !channelId || !messageId) return false;
  const channel = guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId));
  if (!channel?.messages?.fetch) return false;
  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message?.edit) return false;
  return message.edit({ content: "", embeds: [embed], components: [] }).then(() => true).catch(() => false);
}

async function syncProfileStaffFromDb(profileDoc, guildId, userId) {
  const g = String(guildId ?? "").trim();
  const u = String(userId ?? "").trim();
  if (!profileDoc || !g || !u) return ensureStaff(profileDoc);
  const fresh = await ActivityUserProfile.findOne({ guildId: g, userId: u }).catch(() => null);
  if (fresh?.staff) profileDoc.staff = fresh.staff;
  return ensureStaff(profileDoc);
}

async function valutazionePositiveAddCore(profileDoc, staffUser, reason, actor, channel) {
  const guildId = String(profileDoc?.guildId || channel?.guild?.id || "");
  const userId = String(staffUser?.id || "");
  let counts = await incrementStaffValutazioneCounters(guildId, userId, "positive", reason);
  if (!counts) {
    await getOrCreateStaffDoc(guildId, userId);
    counts = await incrementStaffValutazioneCounters(guildId, userId, "positive", reason);
  }
  if (!counts) return { message: null };
  const s = await syncProfileStaffFromDb(profileDoc, guildId, userId);
  const embed = makeLogEmbed(
    actor,
    staffUser,
    `<:thumbsup:1471292172145004768> **__VALUTAZIONE POSITIVA__** #${counts.sectionCount}`,
    reason,
    counts.valutazioniCount,
    "#6f4e37",
    channel.guild,
  );
  const message = await sendChannelEmbed(channel, { content: `${staffUser}`, embeds: [embed] });
  pushValutazioneEntry(s, "positive", reason, message);
  profileDoc.markModified("staff");
  await profileDoc.save();
  return { message };
}

async function valutazionePositiveRemoveCore(profileDoc, staffUser, removeId, reason, actor, channel) {
  const s = ensureStaff(profileDoc);
  if (
    !Number.isInteger(removeId) ||
    removeId < 1 ||
    !s.positiveReasons?.[removeId - 1]
  ) {
    return { ok: false, message: "<:VC_Attention:1482534443632558151> ID non valido" };
  }
  const index = removeId - 1;
  const removedReason = s.positiveReasons[index];
  const originalEntry = getValutazioneEntry(s, "positive", index, removedReason);
  s.positiveReasons.splice(removeId - 1, 1);
  removeValutazioneEntry(s, "positive", index);
  removeLinkedAutoValutazioneEntry(s, originalEntry);
  s.positiveCount = Math.max(0, s.positiveCount - 1);
  s.valutazioniCount = Math.max(0, s.valutazioniCount - 1);
  profileDoc.markModified("staff");
  await profileDoc.save();
  const embed = makeRemovalEmbed(
    actor,
    staffUser,
    "<:cancel:1461730653677551691> **__VALUTAZIONE POSITIVA RIMOSSA__**",
    `<:VC_reason:1478517122929004544> A __${accountUsername(staffUser)}__ è stata **rimossa** una _Valutazione Positiva!_`,
    reason,
    "<:VC_update:1478721333096349817> __Valutazioni Positive Totali__",
    `<:VC_OnlineStatus:1482527088912240650> Ora sei a \`${s.positiveCount}\` valutazioni positive!`,
  );
  const edited = await editOriginalValutazioneMessage(channel.guild, originalEntry, embed);
  if (!edited) await sendChannelEmbed(channel, { embeds: [embed] });
  return { ok: true };
}

async function valutazioneNegativeAddCore(guild, profileDoc, staffUser, reason, actor, channel) {
  const guildId = String(profileDoc?.guildId || guild?.id || "");
  const userId = String(staffUser?.id || "");
  let counts = await incrementStaffValutazioneCounters(guildId, userId, "negative", reason);
  if (!counts) {
    await getOrCreateStaffDoc(guildId, userId);
    counts = await incrementStaffValutazioneCounters(guildId, userId, "negative", reason);
  }
  if (!counts) return { message: null };
  const s = await syncProfileStaffFromDb(profileDoc, guildId, userId);
  const embed = makeLogEmbed(
    actor,
    staffUser,
    `<:thumbsdown:1471292163957457013> **__VALUTAZIONE NEGATIVA__** #${counts.sectionCount}`,
    reason,
    counts.valutazioniCount,
    "#6f4e37",
    guild,
  );
  const message = await sendChannelEmbed(channel, { content: `${staffUser}`, embeds: [embed] });
  pushValutazioneEntry(s, "negative", reason, message);
  profileDoc.markModified("staff");
  await profileDoc.save();
  const warnResult = await addStaffWarnFromNegatives(guild.id, staffUser.id, s.negativeCount, reason);
  const warnChannel = channel?.isTextBased?.() ? channel : null;
  if (warnResult.added && warnChannel) {
    const warnEmbed = buildAutoStaffWarnFromNegativesEmbed(actor, staffUser, warnResult.warnCount, guild);
    await warnChannel.send({ content: `${staffUser}`, embeds: [warnEmbed] }).catch(() => null);
    if (warnResult.shouldAskDepex) {
      const staffMemberForThumb = await getGuildMemberCached(guild, staffUser.id).catch(() => null);
      const promptEmbed = new EmbedBuilder()
        .setColor("#E74C3C")
        .setTitle("<a:VC_Alert:1482706673176150077> 2 warn staff — Decidi azione")
        .setDescription(
          `${staffUser} ha raggiunto **2 warn staff** (da valutazioni negative).\n\n` +
          "**Depex ora** = un livello in basso.\n" +
          "**No** = nessuna azione ora; al **3° warn** scatterà il **depex completo**.",
        )
        .setThumbnail(guildMemberDisplayAvatarUrlDynamic(staffMemberForThumb || staffUser) || undefined);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`staff_warn_depex:${staffUser.id}:yes`).setLabel("Depex ora").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`staff_warn_depex:${staffUser.id}:no`).setLabel("No (al 3° warn depex completo)").setStyle(ButtonStyle.Secondary),
      );
      await warnChannel.send({ content: `${staffUser}`, embeds: [promptEmbed], components: [row] }).catch(() => null);
    }
  }
  if (warnResult.added && warnResult.shouldFullDepex) {
    const member = await getGuildMemberCached(guild, staffUser.id);
    if (member) {
      const currentRoleId = getHighestStaffRoleId(member);
      const fullResult = await applyFullDepex(guild, member, currentRoleId);
      if (fullResult.ok) {
        const memberAfterFull = await getGuildMemberCached(guild, staffUser.id, { preferFresh: true }).catch(() => member);
        await syncStaffDbAndPauseChannelAfterDepex(guild, staffUser.id, memberAfterFull);
        const pexDepexChannel = await getGuildChannelCached(guild, IDs.channels?.pexDepex);
        if (pexDepexChannel?.isTextBased?.()) {
          await pexDepexChannel.send({
            content: `**<:cancel:1461730653677551691> DEPEX** ${staffUser}\n` +
              `<:VC_Staff:1494286904089247754> \`${currentRoleId}\` <a:VC_Arrow:1482706699365257397> Nessuno\n` +
              `<:VC_reason:1478517122929004544> __Depex automatico: 3 warn staff (valutazioni negative).__`,
          }).catch(() => null);
        }
      }
    }
  }
  return { message, warnResult };
}

async function valutazioneNegativeRemoveCore(profileDoc, staffUser, removeId, reason, actor, channel) {
  const s = ensureStaff(profileDoc);
  if (
    !Number.isInteger(removeId) ||
    removeId < 1 ||
    !s.negativeReasons?.[removeId - 1]
  ) {
    return { ok: false, message: "<:VC_Attention:1482534443632558151> ID non valido" };
  }
  const index = removeId - 1;
  const removedReason = s.negativeReasons[index];
  const originalEntry = getValutazioneEntry(s, "negative", index, removedReason);
  s.negativeReasons.splice(removeId - 1, 1);
  removeValutazioneEntry(s, "negative", index);
  removeLinkedAutoValutazioneEntry(s, originalEntry);
  s.negativeCount = Math.max(0, s.negativeCount - 1);
  s.valutazioniCount = Math.max(0, s.valutazioniCount - 1);
  profileDoc.markModified("staff");
  await profileDoc.save();
  const embed = makeRemovalEmbed(
    actor,
    staffUser,
    "<:cancel:1461730653677551691> **__VALUTAZIONE NEGATIVA RIMOSSA__**",
    `<:VC_reason:1478517122929004544> A __${accountUsername(staffUser)}__ è stata **rimossa** una _Valutazione Negativa!_`,
    reason,
    "<:VC_update:1478721333096349817> __Valutazioni Negative Totali__",
    `<:VC_OnlineStatus:1482527088912240650> Ora sei a \`${s.negativeCount}\` valutazioni negative!`,
  );
  const edited = await editOriginalValutazioneMessage(channel.guild, originalEntry, embed);
  if (!edited) await sendChannelEmbed(channel, { embeds: [embed] });
  return { ok: true };
}

function actorFromMember(member) {
  if (!member?.user) return { user: member, member: null };
  return { user: member.user, member };
}

function memberIsHighStaffOrAbove(member) {
  const cache = member?.roles?.cache;
  if (!cache) return false;
  const allowRoles = [IDs.roles?.Admin, IDs.roles?.Director, IDs.roles?.Founder, IDs.roles?.HighStaff].filter(Boolean);
  return allowRoles.some((roleId) => cache.has(roleId));
}

async function removeOldestPositiveValutazioni(s, count, actor, staffUser, channel, guild, removalReason, finalPosLabel) {
  const posEdits = [];
  const n = Math.floor(Number(count || 0));
  for (let i = 0; i < n; i += 1) {
    const removedReason = s.positiveReasons[0];
    const originalEntry = getValutazioneEntry(s, "positive", 0, removedReason);
    s.positiveReasons.splice(0, 1);
    removeValutazioneEntry(s, "positive", 0);
    s.positiveCount = Math.max(0, s.positiveCount - 1);
    s.valutazioniCount = Math.max(0, s.valutazioniCount - 1);
    posEdits.push({ entry: originalEntry });
  }
  const finalPos = s.positiveCount;
  for (const row of posEdits) {
    const embed = makeRemovalEmbed(
      actor,
      staffUser,
      "<:cancel:1461730653677551691> **__VALUTAZIONE POSITIVA RIMOSSA__** (scambio)",
      `<:VC_reason:1478517122929004544> A __${accountUsername(staffUser)}__ è stata **rimossa** una _Valutazione Positiva_ (scambio).`,
      removalReason,
      "<:VC_update:1478721333096349817> __Valutazioni Positive Totali__",
      finalPosLabel(finalPos),
    );
    const edited = await editOriginalValutazioneMessage(guild, row.entry, embed);
    if (!edited) await sendChannelEmbed(channel, { embeds: [embed] });
  }
  return { removed: n, finalPos };
}

async function runValutazionePositiveAddForPanel(guild, actorMember, staffUser, reason) {
  try {
    const channel =
      guild.channels.cache.get(IDs.channels?.valutazioniStaff) ||
      (await getGuildChannelCached(guild, IDs.channels?.valutazioniStaff));
    const profileDoc = await ensureStaffProfileDoc(
      await getStaffDoc(guild.id, staffUser.id),
      guild.id,
      staffUser.id,
    );
    await valutazionePositiveAddCore(profileDoc, staffUser, reason, actorFromMember(actorMember), channel);
    return { ok: true };
  } catch (err) {
    global.logger.error(err);
    return { ok: false, message: "<:vegax:1443934876440068179> Errore valutazione positiva." };
  }
}

async function runValutazioneNegativeAddForPanel(guild, actorMember, staffUser, reason) {
  try {
    const channel =
      guild.channels.cache.get(IDs.channels?.valutazioniStaff) ||
      (await getGuildChannelCached(guild, IDs.channels?.valutazioniStaff));
    const profileDoc = await ensureStaffProfileDoc(
      await getStaffDoc(guild.id, staffUser.id),
      guild.id,
      staffUser.id,
    );
    await valutazioneNegativeAddCore(guild, profileDoc, staffUser, reason, actorFromMember(actorMember), channel);
    return { ok: true };
  } catch (err) {
    global.logger.error(err);
    return { ok: false, message: "<:vegax:1443934876440068179> Errore valutazione negativa." };
  }
}

async function runValutazionePositiveRemoveForPanel(guild, actorMember, staffUser, removeId, reason) {
  try {
    const channel =
      guild.channels.cache.get(IDs.channels?.valutazioniStaff) ||
      (await getGuildChannelCached(guild, IDs.channels?.valutazioniStaff));
    const profileDoc = await ensureStaffProfileDoc(
      await getStaffDoc(guild.id, staffUser.id),
      guild.id,
      staffUser.id,
    );
    const res = await valutazionePositiveRemoveCore(
      profileDoc,
      staffUser,
      removeId,
      reason,
      actorFromMember(actorMember),
      channel,
    );
    return res.ok ? { ok: true } : { ok: false, message: res.message };
  } catch (err) {
    global.logger.error(err);
    return { ok: false, message: "<:vegax:1443934876440068179> Errore rimozione valutazione positiva." };
  }
}

async function runValutazioneNegativeRemoveForPanel(guild, actorMember, staffUser, removeId, reason) {
  try {
    const channel =
      guild.channels.cache.get(IDs.channels?.valutazioniStaff) ||
      (await getGuildChannelCached(guild, IDs.channels?.valutazioniStaff));
    const profileDoc = await ensureStaffProfileDoc(
      await getStaffDoc(guild.id, staffUser.id),
      guild.id,
      staffUser.id,
    );
    const res = await valutazioneNegativeRemoveCore(
      profileDoc,
      staffUser,
      removeId,
      reason,
      actorFromMember(actorMember),
      channel,
    );
    return res.ok ? { ok: true } : { ok: false, message: res.message };
  } catch (err) {
    global.logger.error(err);
    return { ok: false, message: "<:vegax:1443934876440068179> Errore rimozione valutazione negativa." };
  }
}

const SELF_NEG_TRADE_REASON = "Compensazione volontaria: 3 valutazioni positive scambiate per rimuovere 1 negativa";
const HS_NEG_TRADE_REASON = "Compensazione: 3 valutazioni positive scambiate per rimuovere 1 negativa";
const POS_PAUSE_TRADE_REASON = "Scambio valutazioni positive per giorni pausa extra";

async function valutazioneSelfNegTradeThreePosOneNegCore(profileDoc, staffUser, negativeRemoveId1Based, actor, channel, guild, tradeReason = SELF_NEG_TRADE_REASON) {
  const s = ensureStaff(profileDoc);
  const guildRef = guild || channel?.guild;
  if (!guildRef) return { ok: false, message: "<:VC_Attention:1482534443632558151> Server non valido." };
  if (!Number.isInteger(negativeRemoveId1Based) || negativeRemoveId1Based < 1) {
    return { ok: false, message: "<:VC_Attention:1482534443632558151> **Numero negativa non valido.** Usa l’indice della lista (es. **1** per −1)." };
  }
  if (!Array.isArray(s.positiveReasons) || s.positiveReasons.length < 3) {
    return { ok: false, message: "<:VC_Attention:1482534443632558151> Servono **almeno 3 valutazioni positive** per questa opzione." };
  }
  if (!Array.isArray(s.negativeReasons) || !s.negativeReasons[negativeRemoveId1Based - 1]) {
    return { ok: false, message: "<:VC_Attention:1482534443632558151> **Numero negativa non valido.** Controlla la lista ( −1, −2, … )." };
  }
  const posResult = await removeOldestPositiveValutazioni(
    s,
    3,
    actor,
    staffUser,
    channel,
    guildRef,
    tradeReason,
    (finalPos) => `<:VC_OnlineStatus:1482527088912240650> Ora ${staffUser.id ? `<@${staffUser.id}>` : "lo staffer"} è a \`${finalPos}\` valutazioni positive!`,
  );
  const negIdx = negativeRemoveId1Based - 1;
  const removedNegReason = s.negativeReasons[negIdx];
  const negEntry = getValutazioneEntry(s, "negative", negIdx, removedNegReason);
  s.negativeReasons.splice(negIdx, 1);
  removeValutazioneEntry(s, "negative", negIdx);
  s.negativeCount = Math.max(0, s.negativeCount - 1);
  s.valutazioniCount = Math.max(0, s.valutazioniCount - 1);
  profileDoc.markModified("staff");
  await profileDoc.save();
  const finalPos = posResult.finalPos;
  const finalNeg = s.negativeCount;
  const negEmbed = makeRemovalEmbed(
    actor,
    staffUser,
    "<:cancel:1461730653677551691> **__VALUTAZIONE NEGATIVA RIMOSSA__**",
    `<:VC_reason:1478517122929004544> A __${accountUsername(staffUser)}__ è stata **rimossa** una _Valutazione Negativa!_`,
    tradeReason,
    "<:VC_update:1478721333096349817> __Valutazioni Negative Totali__",
    `<:VC_OnlineStatus:1482527088912240650> Ora ${staffUser.id ? `<@${staffUser.id}>` : "lo staffer"} è a \`${finalNeg}\` valutazioni negative!`,
  );
  const negEdited = await editOriginalValutazioneMessage(guildRef, negEntry, negEmbed);
  if (!negEdited) await sendChannelEmbed(channel, { embeds: [negEmbed] });
  const actorLike = actor.member || actor.user;
  const summary = new EmbedBuilder()
    .setAuthor({
      name: `Valutazione negativa rimossa — ${accountUsername(actorLike)}`,
      iconURL: guildMemberDisplayAvatarUrlDynamic(actorLike) || undefined,
    })
    .setTitle("<:thumbsup:1471292172145004768><:thumbsdown:1471292163957457013> **Scambio 3 positive → 1 negativa**")
    .setThumbnail(guildMemberDisplayAvatarUrlDynamic((await getGuildMemberCached(guildRef, staffUser.id).catch(() => null)) || staffUser) || undefined)
    .setDescription(
      [
        `<:VC_Staff:1494286904089247754> ${staffUser}`,
        "",
        `**Rimossa negativa n°** \`${negativeRemoveId1Based}\` — _${String(removedNegReason || "—").slice(0, 400)}_`,
        "",
        "**Rimosse le 3 positive più vecchie** come contropartita.",
        "",
        `**Conteggi attuali:** <:thumbsup:1471292172145004768> \`${finalPos}\` · <:thumbsdown:1471292163957457013> \`${finalNeg}\``,
      ].join("\n"),
    )
    .setColor("#6f4e37");
  await sendChannelEmbed(channel, { embeds: [summary] });
  return { ok: true };
}

async function valutazionePosForPauseTradeCore(profileDoc, staffUser, positiveCount, pauseDays, actor, channel, guild) {
  const s = ensureStaff(profileDoc);
  const guildRef = guild || channel?.guild;
  if (!guildRef) return { ok: false, message: "<:VC_Attention:1482534443632558151> Server non valido." };
  const posCount = Math.floor(Number(positiveCount || 0));
  const days = Math.floor(Number(pauseDays || 0));
  if (posCount < 1 || days < 1) {
    return { ok: false, message: "<:VC_Attention:1482534443632558151> Inserisci **numeri validi** (almeno 1 positiva e 1 giorno pausa)." };
  }
  if (!Array.isArray(s.positiveReasons) || s.positiveReasons.length < posCount) {
    return { ok: false, message: `<:VC_Attention:1482534443632558151> Servono **almeno ${posCount} valutazioni positive** disponibili.` };
  }
  const tradeReason = `${POS_PAUSE_TRADE_REASON}: ${posCount} positive → +${days} giorni pausa`;
  const posResult = await removeOldestPositiveValutazioni(
    s,
    posCount,
    actor,
    staffUser,
    channel,
    guildRef,
    tradeReason,
    (finalPos) => `<:VC_OnlineStatus:1482527088912240650> Ora ${staffUser.id ? `<@${staffUser.id}>` : "lo staffer"} è a \`${finalPos}\` valutazioni positive!`,
  );
  const prevBonus = Math.max(0, Math.floor(Number(s.valPosTradedPauseBonusDays || 0)));
  s.valPosTradedPauseBonusDays = prevBonus + days;
  profileDoc.markModified("staff");
  await profileDoc.save();
  const actorLike = actor.member || actor.user;
  const summary = new EmbedBuilder()
    .setAuthor({
      name: `Scambio pause — ${accountUsername(actorLike)}`,
      iconURL: guildMemberDisplayAvatarUrlDynamic(actorLike) || undefined,
    })
    .setTitle("<:thumbsup:1471292172145004768> **Positive → giorni pausa extra**")
    .setThumbnail(guildMemberDisplayAvatarUrlDynamic((await getGuildMemberCached(guildRef, staffUser.id).catch(() => null)) || staffUser) || undefined)
    .setDescription(
      [
        `<:VC_Staff:1494286904089247754> ${staffUser}`,
        "",
        `**Rimosse** \`${posCount}\` valutazioni positive.`,
        `**Aggiunti** \`+${days}\` giorni pausa extra (totale scambio: \`${s.valPosTradedPauseBonusDays}\`).`,
        "",
        `**Positive rimaste:** \`${posResult.finalPos}\``,
      ].join("\n"),
    )
    .setColor("#6f4e37");
  await sendChannelEmbed(channel, { embeds: [summary] });
  return { ok: true, pauseBonusTotal: s.valPosTradedPauseBonusDays };
}

async function runValutazioneNegTradeForPanel(guild, actorMember, staffUser, negativeRemoveId1Based) {
  const actorId = String(actorMember?.user?.id || "");
  const targetId = String(staffUser?.id || "");
  const isSelf = actorId && targetId && actorId === targetId;
  if (!isSelf && !memberIsHighStaffOrAbove(actorMember)) {
    return { ok: false, message: "<:VC_Attention:1482534443632558151> Solo **High Staff** può eseguire questo scambio per un altro staffer." };
  }
  try {
    const channel =
      guild.channels.cache.get(IDs.channels?.valutazioniStaff) ||
      (await getGuildChannelCached(guild, IDs.channels?.valutazioniStaff));
    const profileDoc = await ensureStaffProfileDoc(
      await getStaffDoc(guild.id, staffUser.id),
      guild.id,
      staffUser.id,
    );
    const tradeReason = isSelf ? SELF_NEG_TRADE_REASON : HS_NEG_TRADE_REASON;
    return await valutazioneSelfNegTradeThreePosOneNegCore(
      profileDoc,
      staffUser,
      negativeRemoveId1Based,
      actorFromMember(actorMember),
      channel,
      guild,
      tradeReason,
    );
  } catch (err) {
    global.logger.error(err);
    return { ok: false, message: "<:vegax:1443934876440068179> Errore durante la compensazione delle valutazioni." };
  }
}

async function runValutazionePosPauseTradeForPanel(guild, actorMember, staffUser, positiveCount, pauseDays) {
  if (!memberIsHighStaffOrAbove(actorMember)) {
    return { ok: false, message: "<:VC_Attention:1482534443632558151> Solo **High Staff** può registrare questo scambio." };
  }
  try {
    const channel =
      guild.channels.cache.get(IDs.channels?.valutazioniStaff) ||
      (await getGuildChannelCached(guild, IDs.channels?.valutazioniStaff));
    const profileDoc = await ensureStaffProfileDoc(
      await getStaffDoc(guild.id, staffUser.id),
      guild.id,
      staffUser.id,
    );
    return await valutazionePosForPauseTradeCore(
      profileDoc,
      staffUser,
      positiveCount,
      pauseDays,
      actorFromMember(actorMember),
      channel,
      guild,
    );
  } catch (err) {
    global.logger.error(err);
    return { ok: false, message: "<:vegax:1443934876440068179> Errore durante lo scambio positive → pausa." };
  }
}

async function runValutazioneSelfNegTradeForPanel(guild, actorMember, staffUser, negativeRemoveId1Based) {
  return runValutazioneNegTradeForPanel(guild, actorMember, staffUser, negativeRemoveId1Based);
}

module.exports = { buildAutoStaffWarnFromNegativesEmbed, ensureStaffProfileDoc, getStaffDoc, valutazionePositiveAddCore, valutazioneNegativeAddCore, runValutazionePositiveAddForPanel, runValutazioneNegativeAddForPanel, runValutazionePositiveRemoveForPanel, runValutazioneNegativeRemoveForPanel, runValutazioneNegTradeForPanel, runValutazionePosPauseTradeForPanel, runValutazioneSelfNegTradeForPanel };