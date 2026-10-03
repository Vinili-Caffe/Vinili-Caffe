const { resolveWebsiteGuildMember } = require("./siteRoleRequestApi");
const IDs = require("../Config/ids");
const { isEconomyCommandsVisible } = require("../../Services/Community/activeEconomyService");
const {
  normalizeViewAs,
  canUseViewAs,
  roleIdsForViewAsPreset,
} = require("./siteViewAsPreview");

function collectMemberRoleIds(member) {
  try {
    if (member?.roles?.cache && typeof member.roles.cache.keys === "function") {
      return [...member.roles.cache.keys()].map(String);
    }
  } catch (_) {}
  return [];
}

function buildCatalogSafe(client, roleIds) {
  try {
    const help = require("../../Prefix/Utility/help");
    if (typeof help.buildWikiHelpCatalog !== "function") return null;
    return help.buildWikiHelpCatalog(client, roleIds);
  } catch (err) {
    global.logger?.warn?.("[site-wiki-help] catalog:", err?.message || err);
    return null;
  }
}

function resolveCoffeeWikiHelpUrl(roleIds) {
  const host = String(process.env.COFFEE_HEALTH_HOST || "127.0.0.1").trim() || "127.0.0.1";
  const port = Number(process.env.COFFEE_HEALTH_PORT || 3011);
  const safePort = Number.isFinite(port) && port > 0 ? Math.floor(port) : 3011;
  const roles = (Array.isArray(roleIds) ? roleIds : [])
    .map((id) => String(id || "").trim())
    .filter((id) => /^\d{17,22}$/.test(id))
    .join(",");
  const q = roles ? `?roles=${encodeURIComponent(roles)}` : "";
  return `http://${host}:${safePort}/webhooks/site-wiki-help${q}`;
}

async function fetchCoffeeWikiCatalog(roleIds) {
  const url = resolveCoffeeWikiHelpUrl(roleIds);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 4500);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: ac.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok || !data?.catalog) {
      return {
        ok: false,
        status: res.status || 502,
        error: data?.error || "coffee_catalog_failed",
      };
    }
    return { ok: true, status: 200, catalog: data.catalog };
  } catch (err) {
    global.logger?.warn?.("[site-wiki-help] coffee fetch:", err?.message || err);
    return { ok: false, status: 502, error: "coffee_unreachable" };
  } finally {
    clearTimeout(timer);
  }
}

function normalizeWikiBot(raw) {
  const v = String(raw || "prod").trim().toLowerCase();
  if (v === "test" || v === "coffee" || v === "caffe" || v === "caffè") return "coffee";
  return "prod";
}

async function resolveWikiRoleContext(client, payload) {
  const accessToken = String(payload?.accessToken || "").trim();
  const memberRoleId = String(IDs?.roles?.Member || "").trim();
  const vipRoleId = String(IDs?.roles?.VIP || "").trim();
  const economyVisible = Boolean(isEconomyCommandsVisible(client));
  const viewAs = normalizeViewAs(payload?.viewAs);

  if (!accessToken) {
    const roleIds = memberRoleId ? [memberRoleId] : [];
    return {
      guest: true,
      roleIds,
      memberRoleId,
      vipRoleId,
      economyVisible,
      viewAs: null,
    };
  }

  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) {
    const roleIds = memberRoleId ? [memberRoleId] : [];
    return {
      guest: true,
      roleIds,
      memberRoleId,
      vipRoleId,
      economyVisible,
      authError: resolved.error || "member_unresolved",
      viewAs: null,
    };
  }

  let roleIds = collectMemberRoleIds(resolved.member);
  if (memberRoleId && !roleIds.includes(memberRoleId)) roleIds.push(memberRoleId);

  let guest = false;
  let viewAsActive = null;
  if (viewAs && canUseViewAs(resolved.member, { userId: resolved.userId, roleIds })) {
    const fake = roleIdsForViewAsPreset(viewAs);
    if (Array.isArray(fake)) {
      roleIds = fake.length ? fake : memberRoleId ? [memberRoleId] : [];
      guest = viewAs === "logout";
      viewAsActive = viewAs;
    }
  }

  return {
    guest,
    userId: resolved.userId,
    roleIds,
    memberRoleId,
    vipRoleId,
    economyVisible,
    viewAs: viewAsActive,
  };
}

async function getWikiHelpAccess(client, payload) {
  const bot = normalizeWikiBot(payload?.bot);
  const ctx = await resolveWikiRoleContext(client, payload);

  if (bot === "coffee") {
    const coffee = await fetchCoffeeWikiCatalog(ctx.roleIds);
    if (!coffee.ok) {
      return {
        ok: true,
        status: 200,
        bot: "coffee",
        guest: ctx.guest,
        userId: ctx.userId,
        roleIds: ctx.roleIds,
        memberRoleId: ctx.memberRoleId,
        vipRoleId: ctx.vipRoleId,
        economyVisible: ctx.economyVisible,
        authError: ctx.authError,
        coffeeError: coffee.error || "coffee_catalog_failed",
        catalog: { categories: [], commandCount: 0 },
        viewAs: ctx.viewAs || null,
      };
    }
    return {
      ok: true,
      status: 200,
      bot: "coffee",
      guest: ctx.guest,
      userId: ctx.userId,
      roleIds: ctx.roleIds,
      memberRoleId: ctx.memberRoleId,
      vipRoleId: ctx.vipRoleId,
      economyVisible: ctx.economyVisible,
      authError: ctx.authError,
      catalog: coffee.catalog,
      viewAs: ctx.viewAs || null,
    };
  }

  const catalog = buildCatalogSafe(client, ctx.roleIds);
  return {
    ok: true,
    status: 200,
    bot: "prod",
    guest: ctx.guest,
    userId: ctx.userId,
    roleIds: ctx.roleIds,
    memberRoleId: ctx.memberRoleId,
    vipRoleId: ctx.vipRoleId,
    economyVisible: catalog?.economyVisible ?? ctx.economyVisible,
    authError: ctx.authError,
    viewAs: ctx.viewAs || null,
    /* mai null: il frontend trattava catalog null come errore “Impossibile caricare” */
    catalog: catalog && typeof catalog === "object"
      ? catalog
      : { categories: [], commandCount: 0 },
  };
}

module.exports = {
  getWikiHelpAccess,
};
