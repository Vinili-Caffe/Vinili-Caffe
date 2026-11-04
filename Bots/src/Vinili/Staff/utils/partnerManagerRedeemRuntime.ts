const { redeemPartnerManagerPointsForDisplay, getPartnerRewardPointCost } = require("./partnerPointsUtils") as typeof import("./partnerPointsUtils");
const { applyPartnerManagerRedeem50, applyPartnerManagerRedeem100 } = require("./partnerManagerTimedPerks") as typeof import("./partnerManagerTimedPerks");
const { PARTNER_REWARD_LABELS } = require("../../../shared/partner/partnerManagerRewardTiers") as typeof import("../../../shared/partner/partnerManagerRewardTiers");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
async function completePartnerManagerRedeemForGuild(
  guild?,
  client?,
  { targetUserId, redeemTier, actorUser, reason = "", source = "discord_hs" }: any = {},
) {
  const gid = String(guild?.id || "").trim();
  const uid = String(targetUserId || "").trim();
  const tier = Math.floor(Number(redeemTier) || 0);
  if (!gid || !uid || tier < 1) {
    return { ok: false, code: "bad_input", userMessage: `${E.VC_Cross} Richiesta non valida.` };
  }

  const pointCost = getPartnerRewardPointCost(tier);
  const redeemRes = await redeemPartnerManagerPointsForDisplay(gid, uid, pointCost);
  if (!redeemRes.ok) {
    if (redeemRes.code === "insufficient") {
      return {
        ok: false,
        code: "insufficient",
        userMessage: `${E.VC_Cross} Punti insufficienti: saldo \`${redeemRes.before ?? 0}\`, servono \`${pointCost}\`.`,
        before: redeemRes.before,
      };
    }
    return {
      ok: false,
      code: redeemRes.code || "save_failed",
      userMessage: `${E.VC_Cross} Impossibile aggiornare i punti. Riprova.`,
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

  const reasonText = String(reason || "").trim().slice(0, 400);
  const actorId = String(actorUser?.id || "").trim() || null;
  try {
    const { logPmShopRedeem } = require("../../Partner/runtime/pmShopRedeemStore") as typeof import("../../Partner/runtime/pmShopRedeemStore");
    await logPmShopRedeem({
      guildId: gid,
      pmUserId: uid,
      actorUserId: actorId,
      tier,
      pointCost,
      rewardLabel: PARTNER_REWARD_LABELS[tier] || `premio ${tier}`,
      reason: reasonText,
      pointsBefore: ptsBefore,
      pointsAfter: ptsAfter,
      source: String(source || "discord_hs"),
    });
  } catch (logErr) {
    global.logger?.warn?.("[partnerManagerRedeem] history log failed:", logErr?.message || logErr);
  }

  /* Shop/punti PM: solo sito (niente post canale Discord). */
  const targetPmUser = await client.users.fetch(uid).catch(() => null);
  const pmMention = targetPmUser ? String(targetPmUser) : `<@${uid}>`;
  const rewardName = PARTNER_REWARD_LABELS[tier] || `premio ${tier}`;

  const userMessage =
    `${E.VC_Verified} Riscattati **${pointCost}** punti a ${pmMention} (${rewardName}). Nuovo saldo: \`${ptsAfter}\`.` +
    (reasonText ? `\nMotivo: ${reasonText}` : "") +
    (postRedeemNote ? `\n${postRedeemNote.trim()}` : "") +
    (autoApplySummary ? `\n${autoApplySummary}` : "");

  return {
    ok: true,
    tier,
    pointCost,
    ptsBefore,
    ptsAfter,
    postRedeemNote,
    autoApplySummary,
    userMessage,
    reason: reasonText,
  };
}

export = { completePartnerManagerRedeemForGuild };
