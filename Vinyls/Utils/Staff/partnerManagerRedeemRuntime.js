const { redeemPartnerManagerPointsForDisplay, getPartnerRewardPointCost } = require("./partnerPointsUtils");
const { applyPartnerManagerRedeem50, applyPartnerManagerRedeem100 } = require("./partnerManagerTimedPerks");
const { PARTNER_REWARD_LABELS } = require("../../../shared/partner/partnerManagerRewardTiers");
const IDs = require("../Config/ids");

async function completePartnerManagerRedeemForGuild(guild, client, { targetUserId, redeemTier, actorUser }) {
  const gid = String(guild?.id || "").trim();
  const uid = String(targetUserId || "").trim();
  const tier = Math.floor(Number(redeemTier) || 0);
  if (!gid || !uid || tier < 1) {
    return { ok: false, code: "bad_input", userMessage: "<a:VC_Cross:1482532424570376253> Richiesta non valida." };
  }

  const pointCost = getPartnerRewardPointCost(tier);
  const redeemRes = await redeemPartnerManagerPointsForDisplay(gid, uid, pointCost);
  if (!redeemRes.ok) {
    if (redeemRes.code === "insufficient") {
      return {
        ok: false,
        code: "insufficient",
        userMessage: `<a:VC_Cross:1482532424570376253> Punti insufficienti: saldo \`${redeemRes.before ?? 0}\`, servono \`${pointCost}\`.`,
        before: redeemRes.before,
      };
    }
    return {
      ok: false,
      code: redeemRes.code || "save_failed",
      userMessage: "<a:VC_Cross:1482532424570376253> Impossibile aggiornare i punti. Riprova.",
    };
  }

  const ptsBefore = redeemRes.before;
  const ptsAfter = redeemRes.after;
  let postRedeemNote = "";
  let autoApplySummary = "";

  if (tier === 50) {
    postRedeemNote = " Premio incluso: **Custom Role e Custom Voc per 30 giorni**.";
    const gr = await applyPartnerManagerRedeem50(gid, uid);
    if (!gr.ok) {
      autoApplySummary = "Applicazione **Custom Role e Custom Voc per 30 giorni** non riuscita.";
    } else if (gr.until) {
      autoApplySummary = "Permessi **Custom Role e Custom Voc per 30 giorni** attivi **30 giorni**.";
    }
  } else if (tier === 100) {
    postRedeemNote = " Premio incluso: **Ruolo VIP per 30 giorni**.";
    const gr = await applyPartnerManagerRedeem100(guild, uid);
    if (!gr.ok) {
      autoApplySummary = "Applicazione **Ruolo VIP per 30 giorni** non riuscita.";
    } else if (gr.until) {
      autoApplySummary =
        gr.vipApplied === false
          ? "**Ruolo VIP per 30 giorni** registrato fino — **membro assente dal server**: assegna il ruolo VIP a mano."
          : "**Ruolo VIP per 30 giorni** assegnato **30 giorni**.";
    }
  } else if (tier === 150) {
    postRedeemNote = " Premio **Decorazione a scelta** (max 15,99 €): consegnato manualmente.";
  } else if (tier === 200) {
    postRedeemNote = " Premio **Nitro Boost** consegnato manualmente.";
  } else if (tier === 250) {
    postRedeemNote = " Premio **5 € PayPal** consegnato manualmente.";
  }

  const { getPartnershipLogChannelIds } = require("../Partner/partnershipConfigResolver");
  const { primary: logChannelId } = getPartnershipLogChannelIds(guild?.id);
  const removedPointsChannel = logChannelId ? guild.channels?.cache?.get(logChannelId) : null;
  const actor = actorUser;
  const targetPmUser = await client.users.fetch(uid).catch(() => null);
  const pmMention = targetPmUser ? String(targetPmUser) : `<@${uid}>`;
  const rewardName = PARTNER_REWARD_LABELS[tier] || `premio ${tier}`;
  if (removedPointsChannel) {
    await removedPointsChannel
      .send({
        content:
          `<:VC_PartnerManager:1494286911286808576> Partner Manager\: ${pmMention}\n` +
          `<:VC_Staff:1494286904089247754> Staffer: ${actor}\n` +
          `<:VC_reason:1478517122929004544> **Premio riscattato** (\`${pointCost}\` punti — ${rewardName}).\n` +
          `<:VC_Partner:1482527213780729896> Nuovo Saldo: \`${ptsBefore}\` → \`${ptsAfter}\`` +
          (postRedeemNote ? `\n${postRedeemNote.trim()}` : "") +
          (autoApplySummary ? `\n${autoApplySummary}` : ""),
      })
      .catch(() => null);
  }

  const userMessage =
    `<a:VC_Verified:1482532479637127188> Riscattati **${pointCost}** punti a ${pmMention} (${rewardName}). Nuovo saldo: \`${ptsAfter}\`.` +
    (postRedeemNote ? `\n${postRedeemNote.trim()}` : "") +
    (autoApplySummary ? `\n${autoApplySummary}` : "");

  return { ok: true, tier, ptsBefore, ptsAfter, postRedeemNote, autoApplySummary, userMessage };
}

module.exports = { completePartnerManagerRedeemForGuild };