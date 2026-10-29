const { SitePmShopRedeemEntry } = require("../../Schemas/Web/sitePmShopRedeemSchemas") as typeof import("../../Schemas/Web/sitePmShopRedeemSchemas");
const { PARTNER_REWARD_LABELS } = require("../../../shared/partner/partnerManagerRewardTiers") as typeof import("../../../shared/partner/partnerManagerRewardTiers");

function entryId(doc?) {
  return String(doc?._id || doc?.id || "");
}

function docToApiItem(doc?) {
  const tier = Math.max(0, Math.floor(Number(doc?.tier) || 0));
  return {
    id: entryId(doc),
    createdAt: doc?.createdAt ? new Date(doc.createdAt).toISOString() : null,
    pmUserId: String(doc?.pmUserId || ""),
    actorUserId: doc?.actorUserId ? String(doc.actorUserId) : null,
    tier,
    pointCost: Math.max(0, Math.floor(Number(doc?.pointCost) || 0)),
    rewardLabel: String(doc?.rewardLabel || PARTNER_REWARD_LABELS[tier] || `Premio ${tier}`),
    reason: String(doc?.reason || "").trim(),
    pointsBefore: doc?.pointsBefore == null ? null : Math.floor(Number(doc.pointsBefore)),
    pointsAfter: doc?.pointsAfter == null ? null : Math.floor(Number(doc.pointsAfter)),
    source: String(doc?.source || "site_hs_manual"),
  };
}

async function logPmShopRedeem(payload: Record<string, any> = {}) {
  const guildId = String(payload.guildId || "").trim();
  const pmUserId = String(payload.pmUserId || "").trim();
  const tier = Math.floor(Number(payload.tier) || 0);
  if (!guildId || !/^\d{16,22}$/.test(pmUserId) || tier < 1) return null;

  const pointCost = Math.max(0, Math.floor(Number(payload.pointCost) || 0));
  const doc = await SitePmShopRedeemEntry.create({
    guildId,
    pmUserId,
    actorUserId: payload.actorUserId ? String(payload.actorUserId) : null,
    tier,
    pointCost,
    rewardLabel: String(
      payload.rewardLabel || PARTNER_REWARD_LABELS[tier] || `Premio ${tier}`,
    ).slice(0, 200),
    reason: String(payload.reason || "").trim().slice(0, 400),
    pointsBefore:
      payload.pointsBefore == null ? null : Math.floor(Number(payload.pointsBefore)),
    pointsAfter: payload.pointsAfter == null ? null : Math.floor(Number(payload.pointsAfter)),
    source: String(payload.source || "site_hs_manual"),
  }).catch((err?) => {
    global.logger?.warn?.("[pmShopRedeemStore] create failed:", err?.message || err);
    return null;
  });

  return doc?.toObject ? doc.toObject() : doc;
}

async function listPmShopRedeems({ guildId, pmUserId, limit = 30, before = null } = {}) {
  const gid = String(guildId || "").trim();
  const uid = String(pmUserId || "").trim();
  if (!gid || !/^\d{16,22}$/.test(uid)) {
    return { items: [], hasMore: false, nextBefore: null };
  }

  const lim = Math.max(1, Math.min(50, Math.floor(Number(limit) || 30)));
  const query = { guildId: gid, pmUserId: uid };
  if (before) {
    const d = new Date(before);
    if (!Number.isNaN(d.getTime())) query.createdAt = { $lt: d };
  }

  const rows = await SitePmShopRedeemEntry.find(query)
    .sort({ createdAt: -1, _id: -1 })
    .limit(lim + 1)
    .lean()
    .catch(() => []);

  const hasMore = rows.length > lim;
  const slice = hasMore ? rows.slice(0, lim) : rows;
  const items = slice.map(docToApiItem);
  const nextBefore = hasMore && slice.length ? slice[slice.length - 1].createdAt : null;
  return { items, hasMore, nextBefore };
}

export = {
  logPmShopRedeem,
  listPmShopRedeems,
  docToApiItem,
};
