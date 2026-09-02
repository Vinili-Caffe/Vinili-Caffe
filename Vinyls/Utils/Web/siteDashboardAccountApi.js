const {
  ensureTenantPremiumCacheFresh,
  getTenantPremiumSync,
  serializePremiumPublic,
} = require("../../MultiGuild/core/tenantPremium");
const { isViniliProtectedGuild } = require("../../MultiGuild/core/viniliProtectedGuilds");
const { getClientGuildCached } = require("../Interaction/interactionEntityCache");
const {
  assertDashboardHighStaffAccess,
  listDashboardGuilds,
} = require("./siteDashboardApi");
const { getPremiumCredits } = require("../../Services/Community/premiumCreditsService");

function guildDisplayIcon(guild) {
  if (!guild) return null;
  try {
    if (typeof guild.iconURL === "function") {
      return guild.iconURL({ size: 64, extension: "png" }) || null;
    }
  } catch {
      }
  return null;
}

async function getDashboardAccountSummary(client, accessToken) {
  const gate = await assertDashboardHighStaffAccess(client, accessToken);
  if (!gate.ok) return gate;

  await ensureTenantPremiumCacheFresh({ force: true }).catch(() => null);

  const uid = String(gate.userId || "").trim();
  const guildsOut = await listDashboardGuilds(client, accessToken);
  if (!guildsOut.ok) return guildsOut;

  const premiumGuilds = [];
  for (const row of Array.isArray(guildsOut.guilds) ? guildsOut.guilds : []) {
    const gid = String(row?.id || "").trim();
    if (!gid) continue;

    const prem = getTenantPremiumSync(gid);
    const pub = serializePremiumPublic(prem);
    if (!pub.active) continue;

    let name = row.name || null;
    let iconUrl = row.iconUrl || null;
    let botPresent = row.botPresent === true;
    if (!name || !iconUrl) {
      const guild =
        (await getClientGuildCached(client, gid).catch(() => null)) || client.guilds?.cache?.get(gid);
      if (guild) {
        name = name || String(guild.name || "").trim() || null;
        iconUrl = iconUrl || guildDisplayIcon(guild);
        botPresent = true;
      }
    }
    if (!name) name = "Server";

    premiumGuilds.push({
      id: gid,
      name,
      iconUrl,
      botPresent,
      plan: pub.plan || "premium",
      until: pub.until,
      renewsAt: null,
      startsAt: null,
      lifetime: pub.until == null,
      canceling: false,
      ownedByYou: String(prem.updatedBy || "").trim() === uid,
      source: prem.source || "credits",
      isMainGuild: row.isMainGuild === true || isViniliProtectedGuild(gid),
    });
  }

  premiumGuilds.sort((a, b) =>
    String(a.name || "").localeCompare(String(b.name || ""), "it", { sensitivity: "base" }),
  );

  const credits = await getPremiumCredits(uid);
  const ownedSlots = premiumGuilds.filter((g) => g.ownedByYou).length;

  const plans = premiumGuilds.map((g) => ({
    id: `premium:${g.id}`,
    kind: "credits",
    label: "Personalizzazione",
    plan: g.plan || "premium",
    guildId: g.id,
    guildName: g.name,
    guildIconUrl: g.iconUrl,
    until: g.until,
    renewsAt: null,
    lifetime: g.lifetime === true,
    canceling: false,
    storeUrl: null,
    interval: null,
  }));

  return {
    ok: true,
    status: 200,
    user: guildsOut.user || { id: uid },
    subscription: {
      active: plans.length > 0,
      plans,
      storePacks: [],
      tiers: [],
      roles: { donator: false, vip: false, vipPlus: false },
    },
    premium: {
      label: "Personalizzazione",
      activeSlots: premiumGuilds.length,
      ownedSlots,
      availableSlots: premiumGuilds.length,
      guilds: premiumGuilds,
    },
    credits: {
      balance: credits,
    },
    store: {
      premium: null,
      donator: null,
      vip: null,
      vipPlus: null,
    },
  };
}

module.exports = {
  getDashboardAccountSummary,
};
