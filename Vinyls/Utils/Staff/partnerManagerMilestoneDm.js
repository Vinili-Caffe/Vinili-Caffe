const { EmbedBuilder } = require("discord.js");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const IDs = require("../Config/ids");
const { getGuildMemberCached } = require("../Interaction/interactionEntityCache");

/** Stesse soglie di `PARTNER_MANAGER_REDEEM_TIERS` in `partnerPointsUtils.js`. */
const PARTNER_MILESTONE_POINT_TIERS = Object.freeze([50, 75, 150]);

/** Premi PM per soglia (stesso ordine di `PARTNER_MANAGER_REDEEM_TIERS`). */
const PARTNER_MILESTONE_REWARD_LABELS = Object.freeze({
  50: "2,50 €",
  75: "5 €",
  150: "Discord Nitro Basic oppure Nitro Boost",
});

/**
 * Invia in DM i promemoria riscatto premi quando i punti partner mostrati superano 50, 75 o 150.
 * Usa `staff.partnerMilestoneDmSent` per non duplicare lo stesso avviso.
 */
async function maybeSendPartnerManagerRewardMilestoneDms(client, guild, userId, beforePoints, afterPoints) {
  const gid = String(guild?.id || "").trim();
  const uid = String(userId || "").trim();
  if (!client || !guild || !gid || !uid) return;

  const pmRole = String(IDs.roles?.PartnerManager || "").trim();
  if (!pmRole) return;

  const b = Math.max(0, Math.floor(Number(beforePoints || 0)));
  const a = Math.max(0, Math.floor(Number(afterPoints || 0)));
  if (a <= b) return;

  const crossed = PARTNER_MILESTONE_POINT_TIERS.filter((tier) => a >= tier && b < tier);
  if (!crossed.length) return;

  const member =
    (await getGuildMemberCached(guild, uid).catch(() => null)) ||
    (await guild.members.fetch(uid).catch(() => null));
  if (!member?.roles?.cache?.has(pmRole)) return;

  const ticketCh = String(IDs.channels?.ticket || "").trim();
  const ticketLine = ticketCh
    ? `Apri un ticket **High Staff** da ${`<#${ticketCh}>`} e indica che vuoi riscattare il premio Partner Manager alla soglia **{tier}**.`
    : "Apri un ticket **High Staff** sul server e indica che vuoi riscattare il premio Partner Manager.";

  const fresh = await ActivityUserProfile.findOne({ guildId: gid, userId: uid })
    .select("staff.partnerMilestoneDmSent")
    .lean()
    .catch(() => null);
  const sentList = Array.isArray(fresh?.staff?.partnerMilestoneDmSent) ? fresh.staff.partnerMilestoneDmSent : [];
  const already = new Set(sentList.map((n) => Math.floor(Number(n))));

  const user = member.user;
  for (const tier of crossed) {
    if (already.has(tier)) continue;
    const reward = PARTNER_MILESTONE_REWARD_LABELS[tier];
    if (!reward) continue;

    const howTo = ticketLine.replace(/\{tier\}/g, String(tier));
    const embed = new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle(`<:VC_PartnerManager:1494286911286808576> Soglia ${tier} partner`)
      .setDescription(
        [
          `Hai raggiunto **${tier}** punti partner validi (ora **${a}**).`,
          "",
          `Puoi riscattare: **${reward}**.`,
          "",
          howTo,
          "",
          "Se non ricevi altri avvisi da questo bot, controlla che i messaggi diretti siano consentiti.",
        ].join("\n"),
      );

    try {
      await user.send({ embeds: [embed] });
    } catch {
      continue;
    }

    await ActivityUserProfile.updateOne(
      { guildId: gid, userId: uid },
      { $addToSet: { "staff.partnerMilestoneDmSent": tier } },
    ).catch(() => null);
    already.add(tier);
  }
}

module.exports = {
  maybeSendPartnerManagerRewardMilestoneDms,
  PARTNER_MILESTONE_REWARD_LABELS,
  PARTNER_MILESTONE_POINT_TIERS,
};