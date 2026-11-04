const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { ensureStaff } = require("../staffDocUtils") as typeof import("../staffDocUtils");
const { getGuildMemberCached } = require("../../../../shared/discord/interactionEntityCache") as typeof import("../../../../shared/discord/interactionEntityCache");
const { accountUsername, guildMemberDisplayAvatarUrlDynamic } = require("../../../../shared/discord/guildDiscordIdentity") as typeof import("../../../../shared/discord/guildDiscordIdentity");
const { E } = require("../../../../shared/emojis/emojiCatalog") as typeof import("../../../../shared/emojis/emojiCatalog");
const {
  VALUTAZIONE_EMBED_COLOR,
  clearWebStaffProfileCache,
  formatStaffMention,
  ensureStaffProfileDoc,
  getStaffDoc,
  makeRemovalEmbed,
  sendChannelEmbed,
  getValutazioneEntry,
  removeValutazioneEntry,
  resolveValutazioneRemoveIndexFull,
  editOriginalValutazioneMessage,
} = require("./shared") as typeof import("./shared");
const {
  actorFromMember,
  memberIsHighStaffOrAbove,
  removeOldestPositiveValutazioni,
} = require("./trades") as typeof import("./trades");
const {
  valutazionePositiveAddCore,
  valutazionePositiveRemoveCore,
  valutazioneNegativeAddCore,
  valutazioneNegativeRemoveCore,
} = require("./cores") as typeof import("./cores");

async function runValutazionePositiveAddForPanel(guild?, actorMember?, staffUser?, reason?) {
  try {
    const profileDoc = await ensureStaffProfileDoc(
      await getStaffDoc(guild.id, staffUser.id),
      guild.id,
      staffUser.id,
    );
    await valutazionePositiveAddCore(profileDoc, staffUser, reason, actorFromMember(actorMember), null);
    return { ok: true };
  } catch (err) {
    global.logger.error(err);
    return { ok: false, message: `${E.vegax} Errore valutazione positiva.` };
  }
}

async function runValutazioneNegativeAddForPanel(guild?, actorMember?, staffUser?, reason?) {
  try {
    const profileDoc = await ensureStaffProfileDoc(
      await getStaffDoc(guild.id, staffUser.id),
      guild.id,
      staffUser.id,
    );
    await valutazioneNegativeAddCore(guild, profileDoc, staffUser, reason, actorFromMember(actorMember), null);
    return { ok: true };
  } catch (err) {
    global.logger.error(err);
    return { ok: false, message: `${E.vegax} Errore valutazione negativa.` };
  }
}

async function runValutazionePositiveRemoveForPanel(guild?, actorMember?, staffUser?, removeId?, reason?) {
  try {
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
      null,
    );
    return res.ok ? { ok: true } : { ok: false, message: res.message };
  } catch (err) {
    global.logger.error(err);
    return { ok: false, message: `${E.vegax} Errore rimozione valutazione positiva.` };
  }
}

async function runValutazioneNegativeRemoveForPanel(guild?, actorMember?, staffUser?, removeId?, reason?, options: Record<string, any> = {}) {
  try {
    const tradeCountRaw = Math.floor(Number(options?.positiveTradeCount || 0));
    const tradeCount = Number.isFinite(tradeCountRaw) && tradeCountRaw > 0 ? tradeCountRaw : 0;
    const channel = null;
    const profileDoc = await ensureStaffProfileDoc(
      await getStaffDoc(guild.id, staffUser.id),
      guild.id,
      staffUser.id,
    );
    const s = ensureStaff(profileDoc);
    if (tradeCount > 0) {
      const available = Array.isArray(s.positiveReasons) ? s.positiveReasons.length : 0;
      if (available < tradeCount) {
        return {
          ok: false,
          message: `${E.VC_Attention} Servono **almeno ${tradeCount} valutazioni positive** per lo scambio (ne ha \`${available}\`).`,
        };
      }
      const tradeReason = `Scambio: ${tradeCount} positive → rimozione valutazione negativa #${removeId}`;
      await removeOldestPositiveValutazioni(
        s,
        tradeCount,
        actorFromMember(actorMember),
        staffUser,
        channel,
        guild,
        tradeReason,
        (finalPos?) =>
          `${E.VC_OnlineStatus} Ora ${staffUser?.id ? `<@${staffUser.id}>` : "lo staffer"} è a \`${finalPos}\` valutazioni positive!`,
      );
    }
    const res = await valutazioneNegativeRemoveCore(
      profileDoc,
      staffUser,
      removeId,
      reason ||
        (tradeCount
          ? `Scambio ${tradeCount} valutazioni positive → rimozione negativa #${removeId}`
          : `Rimozione val − #${removeId}`),
      actorFromMember(actorMember),
      channel,
    );
    if (!res.ok) return { ok: false, message: res.message };
    return {
      ok: true,
      tradedPositives: tradeCount,
      message: tradeCount
        ? `${E.VC_Verified} Valutazione negativa rimossa. Scambiate anche **${tradeCount}** positive.`
        : null,
    };
  } catch (err) {
    global.logger.error(err);
    return { ok: false, message: `${E.vegax} Errore rimozione valutazione negativa.` };
  }
}

const SELF_NEG_TRADE_REASON = "Compensazione volontaria: 3 valutazioni positive scambiate per rimuovere 1 negativa";
const HS_NEG_TRADE_REASON = "Compensazione: 3 valutazioni positive scambiate per rimuovere 1 negativa";
const POS_PAUSE_TRADE_REASON = "Scambio valutazioni positive per giorni pausa extra";

async function valutazioneSelfNegTradeThreePosOneNegCore(profileDoc?, staffUser?, negativeRemoveId1Based?, actor?, channel?, guild?, tradeReason = SELF_NEG_TRADE_REASON) {
  const s = ensureStaff(profileDoc);
  const guildRef = guild || channel?.guild;
  if (!guildRef) return { ok: false, message: `${E.VC_Attention} Server non valido.` };
  if (!Number.isInteger(negativeRemoveId1Based) || negativeRemoveId1Based < 1) {
    return { ok: false, message: `${E.VC_Attention} **Numero negativa non valido.** Usa l’indice della lista (es. **1** per −1).` };
  }
  if (!Array.isArray(s.positiveReasons) || s.positiveReasons.length < 3) {
    return { ok: false, message: `${E.VC_Attention} Servono **almeno 3 valutazioni positive** per questa opzione.` };
  }
  const negIdx = await resolveValutazioneRemoveIndexFull(guildRef, s, "negative", negativeRemoveId1Based, staffUser?.id);
  if (negIdx < 0 || !Array.isArray(s.negativeReasons) || !s.negativeReasons[negIdx]) {
    return { ok: false, message: `${E.VC_Attention} **Numero negativa non valido.** Controlla la lista ( −1, −2, … ).` };
  }
  const posResult = await removeOldestPositiveValutazioni(
    s,
    3,
    actor,
    staffUser,
    channel,
    guildRef,
    tradeReason,
    (finalPos?) => `${E.VC_OnlineStatus} Ora ${staffUser.id ? `<@${staffUser.id}>` : "lo staffer"} è a \`${finalPos}\` valutazioni positive!`,
  );
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
    `${E.cancel} **__VALUTAZIONE NEGATIVA RIMOSSA__**`,
    `${E.VC_reason} A __${accountUsername(staffUser)}__ è stata **rimossa** una _Valutazione Negativa!_`,
    tradeReason,
    `${E.VC_update} __Valutazioni Negative Totali__`,
    `${E.VC_OnlineStatus} Ora ${staffUser.id ? `<@${staffUser.id}>` : "lo staffer"} è a \`${finalNeg}\` valutazioni negative!`,
  );
  const negEdited = await editOriginalValutazioneMessage(guildRef, negEntry, negEmbed);
  if (!negEdited) await sendChannelEmbed(channel, { embeds: [negEmbed] });
  const actorLike = actor?.member || actor?.user || actor;
  const summary = new EmbedBuilder()
    .setAuthor({
      name: `Valutazione negativa rimossa — ${accountUsername(actorLike)}`,
      iconURL: guildMemberDisplayAvatarUrlDynamic(actorLike) || undefined,
    })
    .setTitle(`${E.thumbsup}${E.thumbsdown} **Scambio 3 positive → 1 negativa**`)
    .setThumbnail(guildMemberDisplayAvatarUrlDynamic((await getGuildMemberCached(guildRef, staffUser.id).catch(() => null)) || staffUser) || undefined)
    .setDescription(
      [
        `${E.VC_Staff} ${formatStaffMention(staffUser)}`,
        "",
        `**Rimossa negativa n°** \`${negativeRemoveId1Based}\` — _${String(removedNegReason || "—").slice(0, 400)}_`,
        "",
        "**Rimosse le 3 positive più vecchie** come contropartita.",
        "",
        `**Conteggi attuali:** ${E.thumbsup} \`${finalPos}\` · ${E.thumbsdown} \`${finalNeg}\``,
      ].join("\n"),
    )
    .setColor(VALUTAZIONE_EMBED_COLOR);
  await sendChannelEmbed(channel, { embeds: [summary] });
  clearWebStaffProfileCache(staffUser?.id);
  return { ok: true };
}

async function valutazionePosForPauseTradeCore(profileDoc?, staffUser?, positiveCount?, pauseDays?, actor?, channel?, guild?) {
  const s = ensureStaff(profileDoc);
  const guildRef = guild || channel?.guild;
  if (!guildRef) return { ok: false, message: `${E.VC_Attention} Server non valido.` };
  const posCount = Math.floor(Number(positiveCount || 0));
  const days = Math.floor(Number(pauseDays || 0));
  if (posCount < 1 || days < 1) {
    return { ok: false, message: `${E.VC_Attention} Inserisci **numeri validi** (almeno 1 positiva e 1 giorno pausa).` };
  }
  if (!Array.isArray(s.positiveReasons) || s.positiveReasons.length < posCount) {
    return { ok: false, message: `${E.VC_Attention} Servono **almeno ${posCount} valutazioni positive** disponibili.` };
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
    (finalPos?) => `${E.VC_OnlineStatus} Ora ${staffUser.id ? `<@${staffUser.id}>` : "lo staffer"} è a \`${finalPos}\` valutazioni positive!`,
  );
  const prevBonus = Math.max(0, Math.floor(Number(s.valPosTradedPauseBonusDays || 0)));
  s.valPosTradedPauseBonusDays = prevBonus + days;
  profileDoc.markModified("staff");
  await profileDoc.save();
  const actorLike = actor?.member || actor?.user || actor;
  const summary = new EmbedBuilder()
    .setAuthor({
      name: `Scambio pause — ${accountUsername(actorLike)}`,
      iconURL: guildMemberDisplayAvatarUrlDynamic(actorLike) || undefined,
    })
    .setTitle(`${E.thumbsup} **Positive → giorni pausa extra**`)
    .setThumbnail(guildMemberDisplayAvatarUrlDynamic((await getGuildMemberCached(guildRef, staffUser.id).catch(() => null)) || staffUser) || undefined)
    .setDescription(
      [
        `${E.VC_Staff} ${formatStaffMention(staffUser)}`,
        "",
        `**Rimosse** \`${posCount}\` valutazioni positive.`,
        `**Aggiunti** \`+${days}\` giorni pausa extra (totale scambio: \`${s.valPosTradedPauseBonusDays}\`).`,
        "",
        `**Positive rimaste:** \`${posResult.finalPos}\``,
      ].join("\n"),
    )
    .setColor(VALUTAZIONE_EMBED_COLOR);
  await sendChannelEmbed(channel, { embeds: [summary] });
  clearWebStaffProfileCache(staffUser?.id);
  return { ok: true, pauseBonusTotal: s.valPosTradedPauseBonusDays };
}

async function runValutazioneNegTradeForPanel(guild?, actorMember?, staffUser?, negativeRemoveId1Based?) {
  const actorId = String(actorMember?.user?.id || "");
  const targetId = String(staffUser?.id || "");
  const isSelf = actorId && targetId && actorId === targetId;
  if (!isSelf && !memberIsHighStaffOrAbove(actorMember)) {
    return { ok: false, message: `${E.VC_Attention} Solo **High Staff** può eseguire questo scambio per un altro staffer.` };
  }
  try {
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
      null,
      guild,
      tradeReason,
    );
  } catch (err) {
    global.logger.error(err);
    return { ok: false, message: `${E.vegax} Errore durante la compensazione delle valutazioni.` };
  }
}

async function runValutazionePosPauseTradeForPanel(guild?, actorMember?, staffUser?, positiveCount?, pauseDays?) {
  if (!memberIsHighStaffOrAbove(actorMember)) {
    return { ok: false, message: `${E.VC_Attention} Solo **High Staff** può registrare questo scambio.` };
  }
  try {
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
      null,
      guild,
    );
  } catch (err) {
    global.logger.error(err);
    return { ok: false, message: `${E.vegax} Errore durante lo scambio positive → pausa.` };
  }
}

export = {
  runValutazionePositiveAddForPanel,
  runValutazioneNegativeAddForPanel,
  runValutazionePositiveRemoveForPanel,
  runValutazioneNegativeRemoveForPanel,
  runValutazioneNegTradeForPanel,
  runValutazionePosPauseTradeForPanel,
};
