const IDs = require("../Utils/Config/ids") as typeof import("../Utils/Config/ids");
const { assertWebsiteStaffAccess, normalizeHeaderSecret } = require("./siteStaffAccessApi") as typeof import("./siteStaffAccessApi");
const { memberHasStaffRole } = require("../Utils/Community/staffListUtils") as typeof import("../Utils/Community/staffListUtils");

function stripDiscordDecorations(text?) {
  return String(text || "")
    .replace(/<a?:[\w~]+:\d+>/g, "")
    .replace(/<[@#&!]?\d+>/g, "")
    .replace(/[*_`~|]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function handleSiteStaffModLookupGet(client?, req?, res?) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    const access = await assertWebsiteStaffAccess(client, accessToken, { req });
    if (!access.ok) {
      return res.status(access.status).json({ ok: false, error: access.error, message: access.message });
    }

    if (!memberHasStaffRole(access.member)) {
      return res.status(403).json({ ok: false, error: "forbidden", message: "Solo staff del server principale." });
    }

    const userId = String(req.query?.userId || req.query?.id || "").trim();
    if (!/^\d{16,20}$/.test(userId)) {
      return res.status(400).json({ ok: false, error: "invalid_user", message: "ID utente non valido." });
    }

    const guildId = String(IDs.guilds.main || "").trim();
    const guild =
      client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
    if (!guild) {
      return res.status(503).json({ ok: false, error: "guild_unavailable", message: "Server non disponibile." });
    }

    const member = await guild.members.fetch(userId).catch(() => null);
    const ban = await guild.bans.fetch(userId).catch(() => null);

    if (!member && !ban) {
      return res.status(404).json({ ok: false, error: "not_found", message: "Utente non trovato nel server." });
    }

    const user = member?.user || ban?.user;
    const timeoutUntil = member?.communicationDisabledUntil
      ? member.communicationDisabledUntil.toISOString()
      : null;
    const roles = member
      ? [...member.roles.cache.values()]
          .filter((r?) => r.id !== guild.id)
          .sort((a?, b?) => b.position - a.position)
          .slice(0, 12)
          .map((r?) => ({ id: r.id, name: stripDiscordDecorations(r.name) || r.name, color: r.hexColor }))
      : [];

    return res.status(200).json({
      ok: true,
      user: {
        userId,
        displayName: stripDiscordDecorations(member?.displayName || user?.globalName || user?.username) || userId,
        username: String(user?.username || ""),
        avatarUrl: member?.displayAvatarURL?.({ size: 128, extension: "webp" }) || "",
        joinedAt: member?.joinedAt ? member.joinedAt.toISOString() : null,
        isBanned: Boolean(ban),
        banReason: ban ? stripDiscordDecorations(ban.reason) || null : null,
        timeoutUntil,
        roles,
      },
      note: "Per warn/mute/kick/ban usa il menu contestuale Sanziona su Discord finché la modifica completa non sarà disponibile qui.",
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-mod GET:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

export = { handleSiteStaffModLookupGet };
