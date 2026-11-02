const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { assertWebsiteStaffAccess, normalizeHeaderSecret } = require("./siteStaffAccessApi") as typeof import("./siteStaffAccessApi");
const { memberIsHighStaffEligible } = require("./siteStaffDashboardApi") as typeof import("./siteStaffDashboardApi");
const {
  runValutazioneNegTradeForPanel,
  runValutazionePosPauseTradeForPanel,
} = require("../../Staff/utils/valutazionePanelActions") as typeof import("../../Staff/utils/valutazionePanelActions");

function stripDiscordDecorations(text?) {
  return String(text || "")
    .replace(/<a?:[\w~]+:\d+>/g, "")
    .replace(/<[@#&!]?\d+>/g, "")
    .replace(/[*_`~|]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function handleSiteStaffValTradePost(client?, req?, res?) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    const access = await assertWebsiteStaffAccess(client, accessToken, { req });
    if (!access.ok) {
      return res.status(access.status).json({ ok: false, error: access.error, message: access.message });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const action = String(body.action || "").trim().toLowerCase();
    const guildId = String(IDs.guilds.main || "").trim();
    const guild =
      client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
    if (!guild) {
      return res.status(503).json({ ok: false, error: "guild_unavailable", message: "Server non disponibile." });
    }

    let targetId = String(body.userId || body.targetUserId || access.member.id).trim();
    if (!/^\d{16,20}$/.test(targetId)) {
      return res.status(400).json({ ok: false, error: "invalid_user", message: "Utente non valido." });
    }

    const targetMember = await guild.members.fetch(targetId).catch(() => null);
    if (!targetMember) {
      return res.status(404).json({ ok: false, error: "not_found", message: "Utente non trovato nel server." });
    }

    const isSelf = String(targetId) === String(access.member.id);
    const isHighStaff = memberIsHighStaffEligible(access.member);
    if (!isSelf && !isHighStaff) {
      return res.status(403).json({ ok: false, error: "forbidden", message: "Non autorizzato." });
    }
        if (isSelf && action !== "neg_trade") {
      return res.status(403).json({
        ok: false,
        error: "forbidden",
        message:
          action === "pos_pause_trade"
            ? "Solo High Staff può convertire val + in giorni pausa."
            : "Sul tuo profilo puoi solo compensare una val − con 3 val +.",
      });
    }

    let result = null;
    if (action === "neg_trade") {
      const negId = Number.parseInt(String(body.negativeId || body.negId || "1"), 10);
      if (!Number.isInteger(negId) || negId < 1) {
        return res.status(400).json({ ok: false, error: "invalid_neg", message: "Indice valutazione negativa non valido." });
      }
      result = await runValutazioneNegTradeForPanel(guild, access.member, targetMember.user, negId);
    } else if (action === "pos_pause_trade") {
      if (!isHighStaff) {
        return res.status(403).json({ ok: false, error: "forbidden", message: "Solo High Staff." });
      }
      const posCount = Number.parseInt(String(body.positiveCount || body.posCount || ""), 10);
      const pauseDays = Number.parseInt(String(body.pauseDays || body.days || ""), 10);
      if (!Number.isInteger(posCount) || posCount < 1) {
        return res.status(400).json({ ok: false, error: "invalid_pos", message: "Numero val+ non valido." });
      }
      if (!Number.isInteger(pauseDays) || pauseDays < 1) {
        return res.status(400).json({ ok: false, error: "invalid_days", message: "Giorni pausa non validi." });
      }
      result = await runValutazionePosPauseTradeForPanel(
        guild,
        access.member,
        targetMember.user,
        posCount,
        pauseDays,
      );
    } else {
      return res.status(400).json({ ok: false, error: "bad_action", message: "Azione non valida." });
    }

    const ok = Boolean(result?.ok);
    if (ok) {
      try {
        const { clearStaffProfileCacheForUser } = require("./siteStaffProfileApi") as typeof import("./siteStaffProfileApi");
        clearStaffProfileCacheForUser(targetId);
      } catch (_) {}
    }
    return res.status(ok ? 200 : 400).json({
      ok,
      message: stripDiscordDecorations(result?.message) || (ok ? "Scambio completato." : "Operazione non riuscita."),
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-valtrade POST:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

export = { handleSiteStaffValTradePost };
