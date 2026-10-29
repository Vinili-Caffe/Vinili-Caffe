"use strict";

const IDs = require("../Config/ids") as typeof import("../Config/ids");
const { fetchDiscordOAuthMe } = require("./discordOauthMe") as typeof import("./discordOauthMe");

const JOIN_COOLDOWN_MS = 60_000;
const recentJoinByUser = new Map();

function normalizeBearer(req?) {
  const raw = String(req?.headers?.authorization || req?.headers?.Authorization || "").trim();
  if (!raw) return "";
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return String(m ? m[1] : raw).trim();
}

function resolveMainGuildId(client?) {
  return String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
}

function pruneJoinCooldown() {
  const now = Date.now();
  for (const [k, at] of recentJoinByUser) {
    if (now - at > JOIN_COOLDOWN_MS * 4) recentJoinByUser.delete(k);
  }
}

/**
 * Auto-join main Discord guild after site OAuth (requires guilds.join on the user token).
 * Bot must have Create Instant Invite in the guild.
 */
async function handleSiteGuildJoinPost(client?, req?, res?) {
  try {
    res.set("Cache-Control", "private, no-store, no-cache, must-revalidate");
    res.set("Pragma", "no-cache");

    const accessToken = normalizeBearer(req);
    if (!accessToken) {
      return res.status(401).json({ ok: false, error: "unauthorized", message: "Token mancante." });
    }

    const me = await fetchDiscordOAuthMe(accessToken, { timeoutMs: 4500 }).catch(() => null);
    const userId = String(me?.me?.id || me?.id || "").trim();
    if (!me?.ok || !/^\d{16,22}$/.test(userId)) {
      return res.status(401).json({ ok: false, error: "unauthorized", message: "Sessione Discord non valida." });
    }

    pruneJoinCooldown();
    const last = Number(recentJoinByUser.get(userId) || 0);
    if (Date.now() - last < JOIN_COOLDOWN_MS) {
      return res.status(200).json({ ok: true, joined: false, already: true, cooled: true });
    }
    recentJoinByUser.set(userId, Date.now());

    const guildId = resolveMainGuildId(client);
    if (!guildId) {
      return res.status(500).json({ ok: false, error: "no_guild", message: "Guild non configurata." });
    }

    let guild = client?.guilds?.cache?.get?.(guildId) || null;
    if (!guild && client?.guilds?.fetch) {
      guild = await client.guilds.fetch(guildId).catch(() => null);
    }
    if (!guild) {
      return res.status(503).json({ ok: false, error: "guild_unavailable", message: "Server non raggiungibile." });
    }

    const existing = guild.members?.cache?.get?.(userId) || null;
    if (existing) {
      return res.status(200).json({ ok: true, joined: false, already: true });
    }

    try {
      const fetched = await guild.members.fetch(userId).catch(() => null);
      if (fetched) {
        return res.status(200).json({ ok: true, joined: false, already: true });
      }
    } catch (_) {}

    try {
      await guild.members.add(userId, { accessToken });
      return res.status(200).json({ ok: true, joined: true, already: false });
    } catch (err) {
      const code = Number(err?.code || err?.rawError?.code || 0);
      const status = Number(err?.status || err?.httpStatus || err?.rawError?.status || 0);
      const msg = String(err?.rawError?.message || err?.message || err || "");
      /* Already a member / unknown member race */
      if (code === 10007 || status === 204 || /already a member/i.test(msg)) {
        return res.status(200).json({ ok: true, joined: false, already: true });
      }
      /* logStormKill1: banned = expected, no warn spam */
      if (code === 40007 || /banned from this guild/i.test(msg)) {
        return res.status(200).json({
          ok: true,
          joined: false,
          banned: true,
          message: "Utente bannato dal server.",
        });
      }
      /* Missing Access / invalid token scope */
      if (code === 50013 || code === 50025 || status === 403) {
        if (/banned from this guild/i.test(msg)) {
          return res.status(200).json({
            ok: true,
            joined: false,
            banned: true,
            message: "Utente bannato dal server.",
          });
        }
        global.logger?.debug?.("[guild-join] forbidden:", userId, msg);
        return res.status(403).json({
          ok: false,
          error: "forbidden",
          message: "Impossibile aggiungere al server (permessi o scope).",
        });
      }
      global.logger?.warn?.("[guild-join] failed:", userId, code || status, msg);
      return res.status(502).json({
        ok: false,
        error: "join_failed",
        message: "Join non riuscito.",
      });
    }
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-guild-join:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

export = {
  handleSiteGuildJoinPost,
};
