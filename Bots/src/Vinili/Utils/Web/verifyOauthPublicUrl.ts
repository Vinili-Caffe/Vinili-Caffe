const IDs = require("../Config/ids") as typeof import("../Config/ids");

function resolvePublicSiteBase() {
  return String(process.env.WEBSITE_PUBLIC_URL || "https://www.viniliecaffe.it")
    .trim()
    .replace(/\/+$/, "");
}

function buildSiteVerifyOAuthStartUrl(guildId?) {
  const base = resolvePublicSiteBase();
  const params = new URLSearchParams();
  const gid = String(guildId || "").trim();
  if (/^\d{17,22}$/.test(gid)) params.set("guildId", gid);
  const q = params.toString();
  return `${base}/webhooks/site-verify/oauth-start${q ? `?${q}` : ""}`;
}

function resolveDiscordOauthClientIdForSite() {
  return String(
    process.env.DISCORD_OAUTH_CLIENT_ID ||
      process.env.WEBSITE_OAUTH_CLIENT_ID ||
      IDs?.bots?.ViniliCaffeBot ||
      "",
  ).trim();
}

function resolveDiscordOauthRedirectUriForSite() {
  const fromEnv = String(process.env.DISCORD_OAUTH_REDIRECT_URI || process.env.WEBSITE_OAUTH_REDIRECT_URI || "").trim();
  if (fromEnv) return fromEnv;
  return `${resolvePublicSiteBase()}/`;
}

function normalizeSiteOAuthReturnPath(raw?) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  let decoded = s;
  try {
    decoded = decodeURIComponent(s);
  } catch {
    return "";
  }
  if (decoded.indexOf("://") !== -1) return "";
  if (!decoded.startsWith("/")) return "";
  if (decoded.startsWith("//")) return "";
  if (decoded.indexOf("\0") !== -1) return "";
  return decoded;
}

export = {
  buildSiteVerifyOAuthStartUrl,
  resolvePublicSiteBase,
  resolveDiscordOauthClientIdForSite,
  resolveDiscordOauthRedirectUriForSite,
  normalizeSiteOAuthReturnPath,
};