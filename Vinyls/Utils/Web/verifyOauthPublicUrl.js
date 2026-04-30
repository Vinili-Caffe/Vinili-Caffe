const IDs = require("../Config/ids");

function resolvePublicSiteBase() {
  return String(process.env.WEBSITE_PUBLIC_URL || "https://www.viniliecaffe.it")
    .trim()
    .replace(/\/+$/, "");
}

/** URL assoluto del “ponte” HTTP: una risposta HTML imposta il nonce OAuth e reindirizza a discord.com/oauth2/authorize. */
function buildSiteVerifyOAuthStartUrl(guildId) {
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

module.exports = {
  buildSiteVerifyOAuthStartUrl,
  resolvePublicSiteBase,
  resolveDiscordOauthClientIdForSite,
  resolveDiscordOauthRedirectUriForSite,
};