const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { ActivityUserProfile } = require("../../../Community/schemas/communitySchemas") as typeof import("../../../Community/schemas/communitySchemas");
const { getOrCreateStaffDoc, ensureStaff } = require("../staffDocUtils") as typeof import("../staffDocUtils");
const { guildMemberDisplayAvatarUrlDynamic } = require("../../../../shared/discord/guildDiscordIdentity") as typeof import("../../../../shared/discord/guildDiscordIdentity");
const { resolveStaffValutazioniChannel } = require("../staffChannelUtils") as typeof import("../staffChannelUtils");
const { SUCCESS_COLOR } = require("./helpers") as typeof import("./helpers");

const { E } = require("../../../../shared/emojis/emojiCatalog") as typeof import("../../../../shared/emojis/emojiCatalog");
async function runProfileStaffWarnAdd(guild?, client?, targetUser?, actorUser?, reason?) {
  if (String(targetUser.id) === String(actorUser.id)) {
    return { ok: false, message: `${E.VC_Attention} Non puoi usare questa azione su te stesso.` };
  }
  const warnChannel = await resolveStaffValutazioniChannel(guild, client);
  await ActivityUserProfile.findOneAndUpdate(
    { guildId: guild.id, userId: targetUser.id },
    {
      $setOnInsert: { guildId: guild.id, userId: targetUser.id },
      $inc: { "staff.idCount": 1, "staff.warnCount": 1 },
      $push: { "staff.warnReasons": String(reason || "").slice(0, 500) },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  const profileDoc = await getOrCreateStaffDoc(guild.id, targetUser.id);
  const s = ensureStaff(profileDoc);
  try {
    const { appendStaffTrackHistory, actorLabelFromUser } = require("../staffTrackHistory") as typeof import("../staffTrackHistory");
    await appendStaffTrackHistory(guild.id, targetUser.id, {
      kind: "warn",
      reason,
      date: new Date(),
      actorId: String(actorUser?.id || "").trim() || null,
      actorName: actorLabelFromUser(actorUser, actorUser?.id),
      entryId: Math.max(0, Math.floor(Number(s.warnCount) || 0)) || null,
    });
  } catch (_) {}
  const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
  const warnEmbed = new EmbedBuilder()
    .setAuthor({
      name: `Warn eseguito da ${actorUser.username}`,
      iconURL: guildMemberDisplayAvatarUrlDynamic(actorUser) || undefined,
    })
    .setTitle(`${E.VC_Alert} • **__WARN STAFF__**\`#${s.warnCount}\``)
    .setThumbnail(guildMemberDisplayAvatarUrlDynamic(targetMember || targetUser) || undefined)
    .setDescription(
      `${E.VC_Staff} ${E.VC_Arrow} ${targetUser}
            ${E.VC_reason} __${reason}__ 
            ${E.VC_id} **ID Warn:** __\`${s.warnCount}\`__`,
    )
    .setColor(SUCCESS_COLOR);
  /* Warn staff: solo sito (niente post canale Discord). */
  try {
    const freshDoc = await getOrCreateStaffDoc(guild.id, targetUser.id);
    const warnCount = Math.max(0, Number(ensureStaff(freshDoc)?.warnCount || s.warnCount || 0));
    const { notifyStaffWarn, memberDisplayName } = require("../../../site/staff/siteStaffEventNotifications") as typeof import("../../../site/staff/siteStaffEventNotifications");
    void notifyStaffWarn({
      guild,
      staffUserId: targetUser.id,
      staffName: memberDisplayName(targetMember, targetUser, targetUser.id),
      warnCount,
      reason,
      actorName: memberDisplayName(null, actorUser, actorUser?.id),
      needsDepexDecision: warnCount === 2,
    }).catch(() => 0);
  } catch (_) {}
  try {
    require("../../../site/staff/siteStaffProfileApi").clearStaffProfileCacheForUser(targetUser.id, {
      action: "warn_add",
    });
  } catch (_) {}
  return { ok: true };
}

const WARN_REMOVE_POS_TRADE_MAX = 100;

async function runProfileStaffWarnRemove(guild?, client?, targetUser?, actorUser?, removeId?, reason?, options: Record<string, any> = {}) {
  const tradeCountRaw = Math.floor(Number(options?.positiveTradeCount || 0));
  const tradeCount = Number.isFinite(tradeCountRaw) && tradeCountRaw > 0 ? tradeCountRaw : 0;
  const profileDoc = await getOrCreateStaffDoc(guild.id, targetUser.id);
  const s = ensureStaff(profileDoc);
  const idx = removeId - 1;
  if (!Number.isInteger(removeId) || removeId < 1 || !s.warnReasons?.[idx]) {
    return { ok: false, message: `${E.VC_Attention} ID warn non valido (usa il numero dalla lista in **Warn staff**).` };
  }
  if (tradeCount > 0) {
    if (tradeCount > WARN_REMOVE_POS_TRADE_MAX) {
      return {
        ok: false,
        message: `${E.VC_Attention} Massimo \`${WARN_REMOVE_POS_TRADE_MAX}\` positive per scambio.`,
      };
    }
    const available = Array.isArray(s.positiveReasons) ? s.positiveReasons.length : 0;
    if (available < tradeCount) {
      return {
        ok: false,
        message: `${E.VC_Attention} Servono **almeno ${tradeCount} valutazioni positive** per lo scambio (ne ha \`${available}\`).`,
      };
    }
  }

  const warnChannel = await resolveStaffValutazioniChannel(guild, client);
  let tradedPositives = 0;
  if (tradeCount > 0) {
    const { removeOldestPositiveValutazioni } = require("../valutazionePanelActions") as typeof import("../valutazionePanelActions");
    const tradeReason = `Scambio: ${tradeCount} positive → rimozione warn staff #${removeId}`;
    const posResult = await removeOldestPositiveValutazioni(
      s,
      tradeCount,
      actorUser,
      targetUser,
      warnChannel,
      guild,
      tradeReason,
      (finalPos?) =>
        `${E.VC_OnlineStatus} Ora ${targetUser?.id ? `<@${targetUser.id}>` : "lo staffer"} è a \`${finalPos}\` valutazioni positive!`,
    );
    tradedPositives = Number(posResult?.removed || tradeCount);
  }

  s.warnReasons.splice(idx, 1);
  s.warnCount = Math.max(0, Number(s.warnCount || 0) - 1);
  profileDoc.markModified("staff");
  await profileDoc.save();
  try {
    const { appendStaffTrackHistory, actorLabelFromUser } = require("../staffTrackHistory") as typeof import("../staffTrackHistory");
    await appendStaffTrackHistory(guild.id, targetUser.id, {
      kind: "warn_rm",
      reason: reason || `Rimozione warn #${removeId}`,
      date: new Date(),
      actorId: String(actorUser?.id || "").trim() || null,
      actorName: actorLabelFromUser(actorUser, actorUser?.id),
      entryId: removeId,
    });
  } catch (_) {}

  if (warnChannel?.isTextBased?.()) {
    const tradeLine = tradedPositives
      ? `\n${E.thumbsup} **Scambio:** rimosse **${tradedPositives}** positive più vecchie.`
      : "";
    const embed = new EmbedBuilder()
      .setAuthor({
        name: `Warn staff rimosso da ${actorUser.username}`,
        iconURL: guildMemberDisplayAvatarUrlDynamic(actorUser) || undefined,
      })
      .setTitle(`${E.VC_Alert} • **__WARN STAFF RIMOSSO__**`)
      .setThumbnail(guildMemberDisplayAvatarUrlDynamic(targetUser) || undefined)
      .setDescription(
        `${E.VC_Staff} ${targetUser}\n${E.VC_reason} __${String(reason).slice(0, 500)}__\n**Rimosso warn #${removeId}**${tradeLine}`,
      )
      .setColor(SUCCESS_COLOR);
  }
  try {
    const { notifyStaffWarnRemoved, memberDisplayName } = require("../../../site/staff/siteStaffEventNotifications") as typeof import("../../../site/staff/siteStaffEventNotifications");
    void notifyStaffWarnRemoved({
      guild,
      staffUserId: targetUser.id,
      removeId,
      reason: reason || `Rimozione warn #${removeId}`,
      actorName: memberDisplayName(null, actorUser, actorUser?.id),
      warnCountAfter: Math.max(0, Number(s.warnCount || 0)),
    }).catch(() => 0);
  } catch (_) {}
  try {
    require("../../../site/staff/siteStaffProfileApi").clearStaffProfileCacheForUser(targetUser.id, {
      action: "warn_rm",
    });
  } catch (_) {}
  return {
    ok: true,
    tradedPositives,
    message: tradedPositives
      ? `${E.VC_Verified} Warn rimosso. Scambiate anche **${tradedPositives}** positive.`
      : null,
  };
}

export = {
  runProfileStaffWarnAdd,
  runProfileStaffWarnRemove,
};
