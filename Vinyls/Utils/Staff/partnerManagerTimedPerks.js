const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const IDs = require("../Config/ids");

const THIRTY_DAYS_MS = 30 * 86400000;

function partnerManagerPerkDateActive(raw) {
  if (!raw) return false;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) && t > Date.now();
}

async function fetchPartnerManagerTimedPerkLean(guildId, userId) {
  const g = String(guildId ?? "").trim();
  const u = String(userId ?? "").trim();
  if (!g || !u) return null;
  return ActivityUserProfile.findOne({ guildId: g, userId: u })
    .select("staff.partnerManagerCustomPerksUntil staff.partnerManagerVipUntil")
    .lean()
    .catch(() => null);
}

function partnerManagerCustomBundleActiveFromLean(lean) {
  return partnerManagerPerkDateActive(lean?.staff?.partnerManagerCustomPerksUntil);
}

function partnerManagerVipActiveFromLean(lean) {
  return partnerManagerPerkDateActive(lean?.staff?.partnerManagerVipUntil);
}

function memberHasVipRole(member) {
  if (!member?.roles?.cache) return false;
  const vipIds = [IDs.roles?.VIP, IDs.roles?.VIPplus, IDs.roles?.["VIP+"]]
    .map((id) => String(id || "").trim())
    .filter(Boolean);
  return vipIds.some((roleId) => member.roles.cache.has(roleId));
}

function memberHasVipPlusRole(member) {
  if (!member?.roles?.cache) return false;
  const plusIds = [IDs.roles?.VIPplus, IDs.roles?.["VIP+"]]
    .map((id) => String(id || "").trim())
    .filter(Boolean);
  return plusIds.some((roleId) => member.roles.cache.has(roleId));
}

function memberHasCustomRoleOrVocPermission(member) {
  if (!member?.roles?.cache) return false;
  try {
    const { memberHasCustomRolePanelAccess } = require("../Community/customRoleSlots");
    if (memberHasCustomRolePanelAccess(member)) return true;
  } catch (_) {}
  const vocRoleIds = [
    IDs?.roles?.VIP,
    IDs?.roles?.DoubleBooster,
    IDs?.roles?.VIPplus,
    IDs?.roles?.["VIP+"],
    IDs?.roles?.Level50,
  ]
    .map((id) => String(id || "").trim())
    .filter(Boolean);
  return vocRoleIds.some((roleId) => member.roles.cache.has(roleId));
}

/**
 * Premi istantanei già goduti → bloccati (come richiesto sullo shop web/Discord).
 * - 50: custom role/voc già attivi (bundle PM o permesso ruolo)
 * - 100: VIP già attivo (timer PM, ruolo VIP o VIP+)
 */
function resolvePartnerManagerShopInstantBlocks(member, lean) {
  const customActive = partnerManagerCustomBundleActiveFromLean(lean);
  const vipActive = partnerManagerVipActiveFromLean(lean);
  const hasVipPlus = memberHasVipPlusRole(member);
  const hasVip = memberHasVipRole(member);
  const hasCustomPerm = memberHasCustomRoleOrVocPermission(member);
  return {
    customBlocked: Boolean(customActive || hasCustomPerm),
    vipBlocked: Boolean(vipActive || hasVip),
    customBlockedReason: customActive
      ? "Hai già Custom Role / Custom Voc attivi dallo shop (30 giorni)."
      : "Hai già il permesso Custom Role / Custom Voc.",
    vipBlockedReason: vipActive
      ? "Hai già il premio VIP attivo dallo shop (30 giorni)."
      : hasVipPlus
        ? "Hai già il ruolo VIP+."
        : "Hai già il ruolo VIP.",
  };
}

async function applyPartnerManagerRedeem50(guildId, userId) {
  const until = new Date(Date.now() + THIRTY_DAYS_MS);
  const g = String(guildId ?? "").trim();
  const u = String(userId ?? "").trim();
  if (!g || !u) return { ok: false, code: "bad_input" };
  const doc = await ActivityUserProfile.findOneAndUpdate(
    { guildId: g, userId: u },
    { $set: { "staff.partnerManagerCustomPerksUntil": until } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  return doc ? { ok: true, until } : { ok: false, code: "db" };
}

async function applyPartnerManagerRedeem100(guild, userId) {
  const g = String(guild?.id ?? "").trim();
  const u = String(userId ?? "").trim();
  const vipId = String(IDs.roles?.VIP || "").trim();
  if (!g || !u || !vipId) return { ok: false, code: "bad_input" };
  const until = new Date(Date.now() + THIRTY_DAYS_MS);
  const doc = await ActivityUserProfile.findOneAndUpdate(
    { guildId: g, userId: u },
    { $set: { "staff.partnerManagerVipUntil": until } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  if (!doc) return { ok: false, code: "db" };
  const member = await guild.members.fetch(u).catch(() => null);
  if (!member) return { ok: true, until, vipApplied: false };
  const vipApplied = await member.roles
    .add(vipId, "Premio Partner Manager 100 pt (30 giorni)")
    .then(() => true)
    .catch(() => false);
  return { ok: true, until, vipApplied };
}

async function sweepExpiredPartnerManagerTimedPerks(client) {
  const guildId = String(IDs.guilds?.main || "").trim();
  if (!guildId || !client) return;
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return;
  const now = new Date();
  const vipId = String(IDs.roles?.VIP || "").trim();

  const vipRows = await ActivityUserProfile.find({
    guildId,
    "staff.partnerManagerVipUntil": { $lte: now },
  })
    .select("userId")
    .limit(40)
    .lean()
    .catch(() => []);

  for (const row of vipRows || []) {
    const uid = String(row?.userId || "").trim();
    if (!uid) continue;
    const m = await guild.members.fetch(uid).catch(() => null);
    if (m && vipId && m.roles.cache.has(vipId)) {
      // VIP è un ruolo condiviso (donazioni, premi, ecc.): toglilo solo se non
      // resta un altro entitlement evidente, altrimenti sparisce ai riavvii/sweep.
      const keepVip =
        Boolean(IDs.roles?.VIPplus && m.roles.cache.has(IDs.roles.VIPplus)) ||
        Boolean(IDs.roles?.Donator && m.roles.cache.has(IDs.roles.Donator)) ||
        Boolean(IDs.roles?.MVP && m.roles.cache.has(IDs.roles.MVP)) ||
        Boolean(IDs.roles?.DoubleBooster && m.roles.cache.has(IDs.roles.DoubleBooster));
      if (!keepVip) {
        await m.roles.remove(vipId, "Scadenza premio Partner Manager VIP (30 giorni)").catch(() => {});
      }
    }
    await ActivityUserProfile.updateOne(
      { guildId, userId: uid },
      { $unset: { "staff.partnerManagerVipUntil": "" } },
    ).catch(() => null);
  }

  await ActivityUserProfile.updateMany(
    {
      guildId,
      "staff.partnerManagerCustomPerksUntil": { $lte: now },
    },
    { $unset: { "staff.partnerManagerCustomPerksUntil": "" } },
  ).catch(() => null);
}

module.exports = {
  THIRTY_DAYS_MS,
  partnerManagerPerkDateActive,
  fetchPartnerManagerTimedPerkLean,
  partnerManagerCustomBundleActiveFromLean,
  partnerManagerVipActiveFromLean,
  memberHasVipRole,
  memberHasCustomRoleOrVocPermission,
  resolvePartnerManagerShopInstantBlocks,
  applyPartnerManagerRedeem50,
  applyPartnerManagerRedeem100,
  sweepExpiredPartnerManagerTimedPerks,
};