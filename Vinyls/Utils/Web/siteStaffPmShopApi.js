const IDs = require("../Config/ids");
const { assertWebsiteStaffAccess, normalizeHeaderSecret } = require("./siteStaffAccessApi");
const { memberIsPm } = require("./siteStaffRosterCache");
const { resolvePartnerPointsShown } = require("../Staff/partnerPointsDisplayUtils");
const {
  PARTNER_MANAGER_REDEEM_TIERS,
  partnerManagerCanAffordReward,
  getPartnerRewardPointCost,
} = require("../Staff/partnerPointsUtils");
const {
  PARTNER_REWARD_LABELS,
  buildPartnerRewardDiscountBanner,
  isPartnerRewardDiscountActive,
} = require("../../../shared/partner/partnerManagerRewardTiers");
const { completePartnerManagerRedeemForGuild } = require("../Staff/partnerManagerRedeemRuntime");
const { openPartnerManagerShopWebTicketForMember } = require("../Ticket/partnerManagerShopWebTicketOpen");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { clearStaffProfileCacheForUser } = require("./siteStaffProfileApi");
const { resolvePartnerManagerShopInstantBlocks } = require("../Staff/partnerManagerTimedPerks");

function stripDiscordMessage(text) {
  return String(text || "")
    .replace(/<a?:[\w~]+:\d+>/g, "")
    .replace(/<:[\w~]+:\d+>/g, "")
    .replace(/<[@#&!]?\d+>/g, "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildPmShopCatalogForWeb(balance, opts) {
  const now = Number.isFinite(Number(opts?.nowMs)) ? Number(opts.nowMs) : Date.now();
  const points = Math.max(0, Math.floor(Number(balance) || 0));
  const discountActive = isPartnerRewardDiscountActive(now);
  const blocks = resolvePartnerManagerShopInstantBlocks(opts?.member || null, opts?.lean || null);
  const tiers = PARTNER_MANAGER_REDEEM_TIERS.map((tier) => {
    const cost = getPartnerRewardPointCost(tier, now);
    const instant = tier === 50 || tier === 100;
    const blocked =
      tier === 50 ? blocks.customBlocked : tier === 100 ? blocks.vipBlocked : false;
    const blockedReason =
      tier === 50
        ? blocks.customBlockedReason
        : tier === 100
          ? blocks.vipBlockedReason
          : "";
    const canAfford = !blocked && partnerManagerCanAffordReward(points, tier, now);
    return {
      tier,
      cost,
      baseCost: tier,
      reward: PARTNER_REWARD_LABELS[tier] || "",
      mode: instant ? "instant" : "ticket",
      blocked: Boolean(blocked),
      blockedReason: blocked ? blockedReason : "",
      canAfford,
      discountActive: discountActive && cost < tier,
    };
  });
  return {
    discountBanner: stripDiscordMessage(buildPartnerRewardDiscountBanner(now)),
    discountActive,
    ticketsPath: "/tickets/?view=staff",
    tiers,
  };
}

async function handleSiteStaffPmShopPost(client, req, res) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    const access = await assertWebsiteStaffAccess(client, accessToken);
    if (!access.ok) {
      return res.status(access.status).json({ ok: false, error: access.error, message: access.message });
    }

    const member = access.member;
    if (!memberIsPm(member)) {
      return res.status(403).json({ ok: false, error: "forbidden", message: "Solo i Partner Manager possono usare lo shop." });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const tier = Math.floor(Number(body.tier));
    if (!PARTNER_MANAGER_REDEEM_TIERS.includes(tier)) {
      return res.status(400).json({ ok: false, error: "invalid_tier", message: "Premio non valido." });
    }

    const guildId = String(IDs.guilds.main || "").trim();
    const guild =
      member.guild ||
      client.guilds.cache.get(guildId) ||
      (await client.guilds.fetch(guildId).catch(() => null));
    if (!guild) {
      return res.status(503).json({ ok: false, error: "guild_unavailable", message: "Server non disponibile." });
    }

    const userId = String(member.id);
    const lean = await ActivityUserProfile.findOne({ guildId, userId })
      .select("staff")
      .lean()
      .catch(() => null);
    const balance = resolvePartnerPointsShown(lean?.staff);
    const cost = getPartnerRewardPointCost(tier);
    const blocks = resolvePartnerManagerShopInstantBlocks(member, lean);
    if (tier === 50 && blocks.customBlocked) {
      return res.status(400).json({
        ok: false,
        error: "already_owned",
        message: blocks.customBlockedReason,
        points: balance,
        shop: buildPmShopCatalogForWeb(balance, { member, lean }),
      });
    }
    if (tier === 100 && blocks.vipBlocked) {
      return res.status(400).json({
        ok: false,
        error: "already_owned",
        message: blocks.vipBlockedReason,
        points: balance,
        shop: buildPmShopCatalogForWeb(balance, { member, lean }),
      });
    }
    if (balance < cost) {
      return res.status(400).json({
        ok: false,
        error: "insufficient",
        message: `Ti servono ${cost} punti (saldo attuale: ${balance}).`,
        points: balance,
      });
    }

    if (tier === 50 || tier === 100) {
      const actorUser = member.user || (await client.users.fetch(userId).catch(() => null));
      const resRedeem = await completePartnerManagerRedeemForGuild(guild, client, {
        targetUserId: userId,
        redeemTier: tier,
        actorUser,
      });
      clearStaffProfileCacheForUser(userId);
      if (!resRedeem.ok) {
        return res.status(400).json({
          ok: false,
          error: resRedeem.code || "redeem_failed",
          message: stripDiscordMessage(resRedeem.userMessage) || "Riscatto non riuscito.",
        });
      }
      const afterLean = await ActivityUserProfile.findOne({ guildId, userId }).select("staff").lean().catch(() => null);
      const pointsAfter = resolvePartnerPointsShown(afterLean?.staff);
      return res.status(200).json({
        ok: true,
        mode: "instant",
        tier,
        points: pointsAfter,
        message: stripDiscordMessage(resRedeem.userMessage) || "Premio riscattato.",
        shop: buildPmShopCatalogForWeb(pointsAfter, { member, lean: afterLean }),
      });
    }

    if (tier === 150 || tier === 200 || tier === 250) {
      const opened = await openPartnerManagerShopWebTicketForMember(client, guild, member, tier);
      if (!opened.ok) {
        const status = opened.code === "already_open" ? 409 : 400;
        return res.status(status).json({
          ok: false,
          error: opened.code || "ticket_failed",
          message: stripDiscordMessage(opened.userMessage) || "Impossibile aprire il ticket.",
          ticketId: opened.ticketId || null,
          ticketUrl: opened.ticketUrl || null,
          ticketsPath: "/tickets/?view=staff",
        });
      }
      return res.status(200).json({
        ok: true,
        mode: "ticket",
        tier,
        message:
          stripDiscordMessage(opened.userMessage) ||
          "Ticket High Staff aperto sul sito, dedicato a questo premio.",
        ticketsPath: "/tickets/?view=staff",
        ticketId: opened.ticketId,
        ticketUrl: opened.ticketUrl || `/tickets/?ticketId=${encodeURIComponent(opened.ticketId)}#${opened.ticketId}`,
        ticketNumber: opened.ticketNumber,
        shop: buildPmShopCatalogForWeb(balance, { member, lean }),
      });
    }

    return res.status(400).json({ ok: false, error: "invalid_tier", message: "Premio non valido." });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-pm-shop POST:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

module.exports = {
  buildPmShopCatalogForWeb,
  stripDiscordMessage,
  handleSiteStaffPmShopPost,
};
