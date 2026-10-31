const { normalizeHeaderSecret } = require("../features/staff/siteStaffAccessApi") as typeof import("../features/staff/siteStaffAccessApi");
const { resolveWebsiteGuildMember } = require("./siteRoleRequestApi") as typeof import("./siteRoleRequestApi");
const {
  getUserWorkflowDetailFromDb,
  listUserWorkflowsForMember,
  listUserInvitedSubjectChats,
} = require("../features/workflow/siteStaffWorkflowStore") as typeof import("../features/workflow/siteStaffWorkflowStore");

function isPauseDedupeKey(key?) {
  return String(key || "")
    .trim()
    .toLowerCase()
    .startsWith("pause:");
}

function pageQueueFromPath(pathHint?) {
  const p = String(pathHint || "")
    .trim()
    .toLowerCase();
  if (p.indexOf("candidature") >= 0) return "candidature";
  if (p.indexOf("appelli") >= 0 || p.indexOf("unban") >= 0 || p.indexOf("unmute") >= 0) return "appelli";
  return "";
}

async function handleSiteUserWorkflowsGet(client?, req?, res?) {
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

    // subjectLiveChat1: list invited appelli/candidature chats for FAB popup
    const subjectChats = String(req.query?.subjectChats || req.query?.liveChats || "")
      .trim()
      .toLowerCase();
    if (subjectChats === "1" || subjectChats === "true" || subjectChats === "yes") {
      const queueHint =
        String(req.query?.queue || "").trim().toLowerCase() ||
        pageQueueFromPath(req.query?.page || req.query?.path || "");
      const items = await listUserInvitedSubjectChats(user.guild.id, user.userId, {
        queue: queueHint || "all",
        includeClosed: String(req.query?.includeClosed || "").trim() === "1",
      });
      return res.status(200).json({
        ok: true,
        kind: "subject_chats",
        queue: queueHint || "all",
        items,
      });
    }

    const scope = String(req.query?.scope || "pending").trim().toLowerCase();
    const items = (await listUserWorkflowsForMember(user.guild.id, user.userId, { scope }))
      .filter((row?: any) => isPauseDedupeKey(row?.dedupeKey) || String(row?.queue || "").toLowerCase() === "pause");
    return res.status(200).json({ ok: true, scope: scope === "all" ? "all" : "pending", items });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-user-workflows GET:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

export = {
  handleSiteUserWorkflowsGet,
};
