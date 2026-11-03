const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { assertWebsiteStaffAccess, normalizeHeaderSecret } = require("../../site/staff/siteStaffAccessApi") as typeof import("../../site/staff/siteStaffAccessApi");
const { memberIsPm } = require("../../site/staff/siteStaffRosterCache") as typeof import("../../site/staff/siteStaffRosterCache");
const { resolvePartnerPointsShown, resolvePartnerTotalEarned } = require("../../Staff/utils/partnerPointsDisplayUtils") as typeof import("../../Staff/utils/partnerPointsDisplayUtils");
const {
  PARTNER_MANAGER_REDEEM_TIERS,
  partnerManagerCanAffordReward,
  getPartnerRewardPointCost,
} = require("../../Staff/utils/partnerPointsUtils") as typeof import("../../Staff/utils/partnerPointsUtils");
const {
  PARTNER_REWARD_LABELS,
  buildPartnerRewardDiscountBanner,
  isPartnerRewardDiscountActive,
} = require("../../../shared/partner/partnerManagerRewardTiers") as typeof import("../../../shared/partner/partnerManagerRewardTiers");
const { completePartnerManagerRedeemForGuild } = require("../../Staff/utils/partnerManagerRedeemRuntime") as typeof import("../../Staff/utils/partnerManagerRedeemRuntime");
const { openPartnerManagerShopWebTicketForMember } = require("../../MultiGuild/tickets/discord/partnerManagerShopWebTicketOpen") as typeof import("../../MultiGuild/tickets/discord/partnerManagerShopWebTicketOpen");
const { ActivityUserProfile } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const { clearStaffProfileCacheForUser } = require("../../site/staff/siteStaffProfileApi") as typeof import("../../site/staff/siteStaffProfileApi");
const { resolvePartnerManagerShopInstantBlocks } = require("../../Staff/utils/partnerManagerTimedPerks") as typeof import("../../Staff/utils/partnerManagerTimedPerks");
const { listPmShopRedeems } = require("../../Partner/runtime/pmShopRedeemStore") as typeof import("../../Partner/runtime/pmShopRedeemStore");

function stripDiscordMessage(text?) {
  return String(text || "")
    .replace(/<a?:[\w~]+:\d+>/g, "")
    .replace(/<:[\w~]+:\d+>/g, "")
    .replace(/<[@#&!]?\d+>/g, "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildPmShopCatalogForWeb(balance?, opts?) {
  const now = Number.isFinite(Number(opts?.nowMs)) ? Number(opts.nowMs) : Date.now();
  const points = Math.max(0, Math.floor(Number(balance) || 0));
  const discountActive = isPartnerRewardDiscountActive(now);
  const blocks = resolvePartnerManagerShopInstantBlocks(opts?.member || null, opts?.lean || null);
  const tiers = PARTNER_MANAGER_REDEEM_TIERS.map((tier?) => {
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

function memberIsHighStaff(member?) {
  try {
    const { memberIsHighStaffEligible } = require("../../Staff/utils/staffRoleHierarchy") as typeof import("../../Staff/utils/staffRoleHierarchy");
    return Boolean(memberIsHighStaffEligible(member));
  } catch (_) {
    return false;
  }
}

function partnerSnapshotFromLean(lean?) {
  const staff = lean?.staff || {};
  const points = resolvePartnerPointsShown(staff);
  const redeemSpend = Math.max(0, Math.floor(Number(staff.partnerRedeemSpend || 0)));
  let pointsEarned = points + redeemSpend;
  try {
    pointsEarned = Math.max(0, Math.floor(Number(resolvePartnerTotalEarned(staff) || 0)));
  } catch (_) {}
  return {
    points,
    redeemSpend,
    partnerCount: Math.max(0, Math.floor(Number(staff.partnerCount || 0))),
    pointsEarned,
  };
}

async function handleSiteStaffPmShopGet(client?, req?, res?) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    const access = await assertWebsiteStaffAccess(client, accessToken, { req });
    if (!access.ok) {
      return res.status(access.status).json({ ok: false, error: access.error, message: access.message });
    }

    const userId = String(req.query?.userId || "").trim();
    if (!/^\d{16,20}$/.test(userId)) {
      return res.status(400).json({ ok: false, error: "invalid_user", message: "Utente non valido." });
    }

    const isSelf = String(access.member?.id || "") === userId;
    const isHs = memberIsHighStaff(access.member);
    if (!isSelf && !isHs) {
      return res.status(403).json({
        ok: false,
        error: "forbidden",
        message: "Puoi vedere solo i tuoi riscatti shop (o quelli di un PM se sei High Staff).",
      });
    }

    const guildId = String(IDs.guilds.main || "").trim();
    const listed = await listPmShopRedeems({
      guildId,
      pmUserId: userId,
      limit: Math.min(50, Math.max(1, Number(req.query?.limit) || 30)),
      before: req.query?.before || null,
    });

    /* pmShopManualOnly1: partner da lean subito — niente members.fetch che bloccava lo storico */
    let partner = null;
    try {
      const lean = await ActivityUserProfile.findOne({ guildId, userId })
        .select("staff")
        .lean()
        .catch(() => null);
      const snap = partnerSnapshotFromLean(lean);
      partner = {
        ...snap,
        shop: buildPmShopCatalogForWeb(snap.points, { member: null, lean }),
      };
    } catch (_) {
      partner = null;
    }

    return res.status(200).json({
      ok: true,
      userId,
      items: listed.items,
      hasMore: listed.hasMore,
      nextBefore: listed.nextBefore,
      partner,
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-pm-shop GET:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleHsManualRedeem(client?, guild?, access?, body?) {
  const targetUserId = String(body.userId || "").trim();
  const tier = Math.floor(Number(body.tier));
  const reason = String(body.reason || body.motivo || "").trim().slice(0, 400);

  if (!memberIsHighStaff(access.member)) {
    return {
      status: 403,
      json: { ok: false, error: "forbidden", message: "Solo High Staff può riscattare premi per un altro PM." },
    };
  }
  if (!/^\d{16,20}$/.test(targetUserId)) {
    return { status: 400, json: { ok: false, error: "invalid_user", message: "Utente non valido." } };
  }
  if (!PARTNER_MANAGER_REDEEM_TIERS.includes(tier)) {
    return { status: 400, json: { ok: false, error: "invalid_tier", message: "Premio non valido." } };
  }
  /* pmShopManualOnly1: HS da sheet = solo premi a consegna manuale (ticket), non Custom/VIP automatici */
  if (tier === 50 || tier === 100) {
    return {
      status: 400,
      json: {
        ok: false,
        error: "instant_only",
        message: "Custom Role e VIP si riscattano automaticamente dallo shop PM, non da qui.",
      },
    };
  }

  const targetMember = await guild.members.fetch(targetUserId).catch(() => null);
  if (!targetMember || !memberIsPm(targetMember)) {
    return {
      status: 400,
      json: { ok: false, error: "not_pm", message: "L'utente non è Partner Manager." },
    };
  }

  const guildId = String(guild.id);
  const lean = await ActivityUserProfile.findOne({ guildId, userId: targetUserId })
    .select("staff")
    .lean()
    .catch(() => null);
  const balance = resolvePartnerPointsShown(lean?.staff);
  const cost = getPartnerRewardPointCost(tier);
  const blocks = resolvePartnerManagerShopInstantBlocks(targetMember, lean);

  if (tier === 50 && blocks.customBlocked) {
    return {
      status: 400,
      json: {
        ok: false,
        error: "already_owned",
        message: blocks.customBlockedReason,
        ...partnerSnapshotFromLean(lean),
        shop: buildPmShopCatalogForWeb(balance, { member: targetMember, lean }),
      },
    };
  }
  if (tier === 100 && blocks.vipBlocked) {
    return {
      status: 400,
      json: {
        ok: false,
        error: "already_owned",
        message: blocks.vipBlockedReason,
        ...partnerSnapshotFromLean(lean),
        shop: buildPmShopCatalogForWeb(balance, { member: targetMember, lean }),
      },
    };
  }
  if (balance < cost) {
    return {
      status: 400,
      json: {
        ok: false,
        error: "insufficient",
        message: `Servono ${cost} punti (saldo attuale: ${balance}).`,
        ...partnerSnapshotFromLean(lean),
      },
    };
  }

  const actorUser = access.member.user || (await client.users.fetch(access.member.id).catch(() => null));
  const resRedeem = await completePartnerManagerRedeemForGuild(guild, client, {
    targetUserId,
    redeemTier: tier,
    actorUser,
    reason: reason || "Riscatto manuale High Staff (sito)",
    source: "site_hs_manual",
  });
  clearStaffProfileCacheForUser(targetUserId);

  if (!resRedeem.ok) {
    return {
      status: 400,
      json: {
        ok: false,
        error: resRedeem.code || "redeem_failed",
        message: stripDiscordMessage(resRedeem.userMessage) || "Riscatto non riuscito.",
      },
    };
  }

  const afterLean = await ActivityUserProfile.findOne({ guildId, userId: targetUserId })
    .select("staff")
    .lean()
    .catch(() => null);
  const snap = partnerSnapshotFromLean(afterLean);
  const history = await listPmShopRedeems({ guildId, pmUserId: targetUserId, limit: 30 });

  return {
    status: 200,
    json: {
      ok: true,
      mode: "hs_manual",
      tier,
      message: stripDiscordMessage(resRedeem.userMessage) || "Premio riscattato.",
      ...snap,
      shop: buildPmShopCatalogForWeb(snap.points, { member: targetMember, lean: afterLean }),
      redeems: history.items,
    },
  };
}

async function handleSiteStaffPmShopPost(client?, req?, res?) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    const access = await assertWebsiteStaffAccess(client, accessToken, { req });
    if (!access.ok) {
      return res.status(access.status).json({ ok: false, error: access.error, message: access.message });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const tier = Math.floor(Number(body.tier));
    const targetUserId = String(body.userId || "").trim();
    const selfId = String(access.member?.id || "");

    const guildId = String(IDs.guilds.main || "").trim();
    const guild =
      access.member.guild ||
      client.guilds.cache.get(guildId) ||
      (await client.guilds.fetch(guildId).catch(() => null));
    if (!guild) {
      return res.status(503).json({ ok: false, error: "guild_unavailable", message: "Server non disponibile." });
    }

    /* pmShopHsRedeem1: High Staff su profilo altrui → riscatto manuale immediato (tutti i tier) */
    if (targetUserId && targetUserId !== selfId) {
      const out = await handleHsManualRedeem(client, guild, access, body);
      return res.status(out.status).json(out.json);
    }

    const member = access.member;
    if (!memberIsPm(member)) {
      return res.status(403).json({ ok: false, error: "forbidden", message: "Solo i Partner Manager possono usare lo shop." });
    }

    if (!PARTNER_MANAGER_REDEEM_TIERS.includes(tier)) {
      return res.status(400).json({ ok: false, error: "invalid_tier", message: "Premio non valido." });
    }

    const userId = selfId;
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
        reason: String(body.reason || "").trim().slice(0, 400) || "Riscatto shop (sito)",
        source: "site_self",
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

export = {
  buildPmShopCatalogForWeb,
  handleSiteStaffPmShopPost,
  handleSiteStaffPmShopGet,
};
