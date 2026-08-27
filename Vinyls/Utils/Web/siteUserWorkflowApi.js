const { normalizeHeaderSecret } = require("./siteStaffAccessApi");
const { resolveWebsiteGuildMember } = require("./siteRoleRequestApi");
const {
  getUserWorkflowDetailFromDb,
  listUserWorkflowsForMember,
} = require("./siteStaffWorkflowStore");

function isPauseDedupeKey(key) {
  return String(key || "")
    .trim()
    .toLowerCase()
    .startsWith("pause:");
}

/**
 * Solo pause pending del richiedente (chat live come thread Discord).
 * Candidature/appelli/resoconti non espongono chat al soggetto.
 */
async function handleSiteUserWorkflowsGet(client, req, res) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    const user = await resolveWebsiteGuildMember(client, accessToken);
    if (!user.ok) {
      return res.status(user.status || 401).json({
        ok: false,
        error: user.error || "unauthorized",
        message: user.message || "Sessione non valida.",
      });
    }

    const dedupeKey = String(req.query?.dedupeKey || req.query?.key || "").trim();
    if (dedupeKey) {
      if (!isPauseDedupeKey(dedupeKey)) {
        return res.status(403).json({
          ok: false,
          error: "forbidden",
          message: "Puoi aprire solo le chat delle tue richieste pausa.",
        });
      }
      const item = await getUserWorkflowDetailFromDb(user.guild.id, user.userId, dedupeKey);
      if (!item) {
        return res.status(404).json({ ok: false, error: "not_found", message: "Richiesta non trovata." });
      }
      return res.status(200).json({ ok: true, item });
    }

    const scope = String(req.query?.scope || "pending").trim().toLowerCase();
    const items = (await listUserWorkflowsForMember(user.guild.id, user.userId, { scope }))
      .filter((row) => isPauseDedupeKey(row?.dedupeKey) || String(row?.queue || "").toLowerCase() === "pause");
    return res.status(200).json({ ok: true, scope: scope === "all" ? "all" : "pending", items });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-user-workflows GET:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

module.exports = {
  handleSiteUserWorkflowsGet,
};
