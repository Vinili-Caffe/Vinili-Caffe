/**
 * site-boot: un round-trip per me skim + unread count + chrome prefs/theme.
 * Additive — gli endpoint dedicati restano disponibili.
 */
"use strict";

const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { fetchDiscordOAuthMe } = require("./discordOauthMe") as typeof import("./discordOauthMe");
const { resolveWebsiteGuildMember } = require("./siteRoleRequestApi") as typeof import("./siteRoleRequestApi");
const { sanitizeChromePrefs } = require("./siteChromePrefsApi") as typeof import("./siteChromePrefsApi");
const { countSiteInAppUnreadForUser } = require("../notifications/siteInAppNotificationsService") as typeof import("../notifications/siteInAppNotificationsService");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");

function normalizeHeaderSecret(raw?) {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s) return "";
  const lower = s.toLowerCase();
  if (lower.startsWith("bearer ")) return s.slice(7).trim();
  return s;
}

function resolveGuildId(client?) {
  return String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
}

async function handleSiteBootGet(client?, req?, res?) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    if (!accessToken) {
      return res.status(401).json({ ok: false, error: "missing_token", message: "401" });
    }

    res.set("Cache-Control", "private, max-age=30, stale-while-revalidate=60");
    res.set("Vary", "Authorization");

    const out = {
      ok: true,
      me: null,
      theme: null,
      unread: null,
      prefs: null,
      partial: false,
    };

    const mePromise = fetchDiscordOAuthMe(accessToken, { timeoutMs: 9000 }).catch((err?) => ({
      ok: false,
      error: "me_fail",
      message: String(err?.message || err || ""),
    }));

    const prefsPromise = (async () => {
      const resolved = await resolveWebsiteGuildMember(client, accessToken);
      if (!resolved.ok) return { ok: false, status: resolved.status, error: resolved.error };
      const guildId = resolveGuildId(client) || resolved.guild?.id;
      const doc = await ActivityUserProfile.findOne({
        guildId: String(guildId || ""),
        userId: resolved.userId,
      })
        .select("profile.siteChromePrefs")
        .lean()
        .catch(() => null);
      return {
        ok: true,
        userId: resolved.userId,
        prefs: sanitizeChromePrefs(doc?.profile?.siteChromePrefs || {}),
      };
    })().catch((err?) => ({ ok: false, error: "prefs_fail", message: String(err?.message || err || "") }));

    const [meOut, prefsOut] = await Promise.all([mePromise, prefsPromise]);

    if (meOut?.ok && meOut.me) {
      out.me = meOut.me;
    } else {
      out.partial = true;
    }

    if (prefsOut?.ok && (prefsOut as any).prefs) {
      out.prefs = (prefsOut as any).prefs;
      if ((prefsOut as any).prefs.theme) out.theme = (prefsOut as any).prefs.theme;
    } else {
      out.partial = true;
    }

    const uid = String(out.me?.id || (prefsOut as any)?.userId || "").trim();
    if (uid) {
      try {
        const counted = await countSiteInAppUnreadForUser(uid);
        out.unread = {
          unread: counted.unread,
          total: counted.total,
          revision: counted.revision,
          latestAt: counted.latestAt || 0,
        };
      } catch (eUnread) {
        out.partial = true;
      }
    } else {
      out.partial = true;
    }

    if (!out.me && !out.prefs && !out.unread) {
      const status = Number(meOut?.status) || Number((prefsOut as any)?.status) || 503;
      return res.status(status).json({
        ok: false,
        error: meOut?.error || prefsOut?.error || "boot_unavailable",
        message: meOut?.message || (prefsOut as any)?.message || "503",
      });
    }

    return res.status(200).json(out);
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-boot:", err);
    return res.status(503).json({ ok: false, error: "internal", message: "503" });
  }
}

export = {
  handleSiteBootGet,
};
