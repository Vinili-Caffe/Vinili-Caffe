const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { getOrCreateStaffDoc, ensureStaff } = require("../../Utils/Staff/staffDocUtils");
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
  const list = Array.isArray(staff?.[listName]) ? staff[listName] : [];
  const byIndex = list[index] || null;
  if (byIndex?.messageId && byIndex?.channelId) return byIndex;
  const auto = Array.isArray(staff?.autoValutazioni) ? staff.autoValutazioni : [];
  return auto.find((entry) =>
    String(entry?.type || "") === kind &&
    String(entry?.reason || "") === String(reason || "") &&
    String(entry?.messageId || "") &&
    String(entry?.channelId || "")
  ) || null;
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

async function valutazionePositiveAddCore(profileDoc, staffUser, reason, actor, channel) {
  const s = ensureStaff(profileDoc);
  s.valutazioniCount += 1;
  s.positiveCount += 1;
  if (!Array.isArray(s.positiveReasons)) s.positiveReasons = [];
  s.positiveReasons.push(reason);
  profileDoc.markModified("staff");
  await profileDoc.save();
  const embed = makeLogEmbed(actor, staffUser, `<:thumbsup:1471292172145004768> **__VALUTAZIONE POSITIVA__** #${s.positiveCount}`, reason, s.valutazioniCount, "#6f4e37", channel.guild);
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
  const s = ensureStaff(profileDoc);
  s.valutazioniCount += 1;
  s.negativeCount += 1;
  if (!Array.isArray(s.negativeReasons)) s.negativeReasons = [];
  s.negativeReasons.push(reason);
  profileDoc.markModified("staff");
  await profileDoc.save();
  const embed = makeLogEmbed(actor, staffUser, `<:thumbsdown:1471292163957457013> **__VALUTAZIONE NEGATIVA__** #${s.negativeCount}`, reason, s.valutazioniCount, "#6f4e37", guild);
  const message = await sendChannelEmbed(channel, { content: `${staffUser}`, embeds: [embed] });
  pushValutazioneEntry(s, "negative", reason, message);
  profileDoc.markModified("staff");
  await profileDoc.save();
  const warnResult = await addStaffWarnFromNegatives(guild.id, staffUser.id, s.negativeCount, reason);
  const warnChannel = guild.channels.cache.get(IDs.channels?.warnStaff) || (await getGuildChannelCached(guild, IDs.channels?.warnStaff));
  if (warnResult.added && warnChannel?.isTextBased?.()) {
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

module.exports = {
  buildAutoStaffWarnFromNegativesEmbed,
  ensureStaffProfileDoc,
  getStaffDoc,
  valutazionePositiveAddCore,
  valutazioneNegativeAddCore,
  runValutazionePositiveAddForPanel,
  runValutazioneNegativeAddForPanel,
  runValutazionePositiveRemoveForPanel,
  runValutazioneNegativeRemoveForPanel,
};