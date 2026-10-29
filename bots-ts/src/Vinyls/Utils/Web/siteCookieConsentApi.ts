"use strict";

const IDs = require("../Config/ids") as typeof import("../Config/ids");
const { resolveWebsiteGuildMember } = require("./siteRoleRequestApi") as typeof import("./siteRoleRequestApi");

const VIP_ROLE_ID = String(IDs?.roles?.VIP || "").trim();
const VIP_PLUS_ROLE_ID = String(IDs?.roles?.VIPplus || IDs?.roles?.["VIP+"] || "").trim();
const DOUBLE_BOOSTER_ROLE_ID = String(IDs?.roles?.DoubleBooster || "").trim();

function normalizeHeaderSecret(raw?) {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s) return "";
  const lower = s.toLowerCase();
  if (lower.startsWith("bearer ")) return s.slice(7).trim();
  return s;
}

function memberHasRoleId(member?, roleId?) {
  const rid = String(roleId || "").trim();
  if (!rid || !member) return false;
  try {
    if (member.roles?.cache?.has?.(rid)) return true;
  } catch (_) {}
  try {
    const roles = member.roles?.cache || member.roles;
    if (roles && typeof roles.has === "function") return Boolean(roles.has(rid));
  } catch (_) {}
  return false;
}

function evaluateCookieRejectEligibility(member?) {
  const hasVip = memberHasRoleId(member, VIP_ROLE_ID);
  const hasVipPlus = memberHasRoleId(member, VIP_PLUS_ROLE_ID);
  const hasDoubleBooster = memberHasRoleId(member, DOUBLE_BOOSTER_ROLE_ID);
  const canReject = Boolean(hasVip || hasVipPlus || hasDoubleBooster);
  return {
    canReject,
    hasVip: Boolean(hasVip || hasVipPlus),
    hasVipPlus: Boolean(hasVipPlus),
    hasDoubleBooster: Boolean(hasDoubleBooster),
  };
}

async function getCookieConsentEligibility(client?, accessToken?) {
  const token = String(accessToken || "").trim();
  if (!token) {
    return {
      ok: false,
      status: 401,
      error: "missing_token",
      message: "Authorization Bearer richiesto.",
      canAccept: false,
      canReject: false,
    };
  }
  const resolved = await resolveWebsiteGuildMember(client, token);
  if (!resolved.ok) {
    return {
      ok: false,
      status: Number(resolved.status) || 401,
      error: resolved.error || "unauthorized",
      message: resolved.message || "Login Discord richiesto.",
      canAccept: false,
      canReject: false,
    };
  }
  const flags = evaluateCookieRejectEligibility(resolved.member);
  return {
    ok: true,
    status: 200,
    userId: resolved.userId,
    canAccept: true,
    ...flags,
    rejectRequirement: "vip_or_double_booster",
  };
}

async function handleSiteCookieConsentGet(client?, req?, res?) {
  try {
    res.set("Cache-Control", "private, no-store, no-cache, must-revalidate");
    res.set("Pragma", "no-cache");
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    const out = await getCookieConsentEligibility(client, accessToken);
    return res.status(Number(out.status) || (out.ok ? 200 : 401)).json(out);
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-cookie-consent get:", err);
    return res.status(500).json({
      ok: false,
      error: "internal",
      message: "Errore interno.",
      canAccept: false,
      canReject: false,
    });
  }
}

export = {
  handleSiteCookieConsentGet,
  getCookieConsentEligibility,
  evaluateCookieRejectEligibility,
  VIP_ROLE_ID,
  VIP_PLUS_ROLE_ID,
  DOUBLE_BOOSTER_ROLE_ID,
};
