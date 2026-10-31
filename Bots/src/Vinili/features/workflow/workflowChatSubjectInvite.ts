/** Chat del workflow: aggiunta e rimozione della persona interessata. */
const { notifyWorkflowSubjectInvited, notifyWorkflowSubjectRemoved } = require("./siteStaffWorkflowNotifications") as typeof import("./siteStaffWorkflowNotifications");
const { displayNameForMember } = require("./workflowChatAuthors") as typeof import("./workflowChatAuthors");
const { subjectChatHasActive, serializeSubjectChatMeta, patchSubjectChat, sendSubjectInviteDmOnce, createSystemChatMessage, resolveSubjectDisplayName, emitChatEvent } = require("./workflowChatSubject") as typeof import("./workflowChatSubject");
const { bearerFromRequest, resolveWorkflowChatAccess } = require("./workflowChatAccess") as typeof import("./workflowChatAccess");

async function handleSiteStaffWorkflowChatSubjectPost(client?, req?, res?) {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const dedupeKey = String(body.dedupeKey || body.key || req.query?.dedupeKey || "").trim();
    const action = String(body.action || body.op || "").trim().toLowerCase();
    if (action !== "invite" && action !== "remove") {
      return res.status(400).json({
        ok: false,
        error: "bad_action",
        message: 'Azione non valida (usa "invite" o "remove").',
      });
    }

    const access = await resolveWorkflowChatAccess(client, bearerFromRequest(req), dedupeKey, { req });
    if (!access.ok) {
      return res.status(access.status).json({ ok: false, error: access.error, message: access.message });
    }
    if (!access.isStaffReviewer) {
      return res.status(403).json({ ok: false, error: "forbidden", message: "Solo lo staff può gestire la chat." });
    }
    if (!access.inviteOnly) {
      return res.status(400).json({
        ok: false,
        error: "not_supported",
        message: "Questa pratica non supporta l'invito del richiedente.",
      });
    }
    if (String(access.status || "").toLowerCase() !== "pending" && action === "invite") {
      return res.status(409).json({
        ok: false,
        error: "closed",
        message: "La pratica è chiusa: non puoi più aggiungere il richiedente.",
      });
    }

    let chat = null;
    let dm: Record<string, any> = { sent: false };
    if (action === "invite") {
      if (subjectChatHasActive(access.subjectChat)) {
        return res.status(409).json({
          ok: false,
          error: "already_active",
          message: "Il richiedente è già nella discussione.",
        });
      }
      chat = await patchSubjectChat(access.guild.id, access.dedupeKey, async (next?) => {
        next.windows.push({ joinedAt: new Date(), leftAt: null });
        dm = await sendSubjectInviteDmOnce(client, access, next);
      });
      if (!chat) {
        return res.status(500).json({ ok: false, error: "save_failed", message: "Salvataggio fallito." });
      }
      const subjectName = await resolveSubjectDisplayName(client, access);
      await createSystemChatMessage(
        access,
        `${subjectName} è stato aggiunto alla discussione.`,
      );
      try {
        await notifyWorkflowSubjectInvited({
          guild: access.guild,
          queue: access.queue,
          subjectUserId: access.subjectUserId,
          dedupeKey: access.dedupeKey,
          actorId: String(access.member?.id || ""),
          actorName: displayNameForMember(access.member),
          workflow: access.workflow,
          kind: access.workflow?.workflowKind,
          roleId: access.workflow?.workflowRoleId || access.workflow?.workflowFields?.roleId,
        });
      } catch (_) {}
    } else {
      if (!subjectChatHasActive(access.subjectChat)) {
        return res.status(409).json({
          ok: false,
          error: "not_active",
          message: "Il richiedente non è nella discussione.",
        });
      }
      const subjectName = await resolveSubjectDisplayName(client, access);
      const sysMsg = await createSystemChatMessage(
        access,
        `${subjectName} è stato rimosso dalla discussione.`,
      );
      const leftAt = sysMsg?.createdAt ? new Date(sysMsg.createdAt) : new Date();
      chat = await patchSubjectChat(access.guild.id, access.dedupeKey, (next?) => {
        for (const w of next.windows) {
          if (!w.leftAt) w.leftAt = leftAt;
        }
      });
      if (!chat) {
        return res.status(500).json({ ok: false, error: "save_failed", message: "Salvataggio fallito." });
      }
      try {
        await notifyWorkflowSubjectRemoved({
          guild: access.guild,
          queue: access.queue,
          subjectUserId: access.subjectUserId,
          dedupeKey: access.dedupeKey,
          actorId: String(access.member?.id || ""),
          actorName: displayNameForMember(access.member),
          workflow: access.workflow,
          kind: access.workflow?.workflowKind,
          roleId: access.workflow?.workflowRoleId || access.workflow?.workflowFields?.roleId,
        });
      } catch (_) {}
    }

    const subjectChatMeta = serializeSubjectChatMeta(chat, {
      inviteOnly: true,
      status: access.status,
      isStaffReviewer: true,
    });
    emitChatEvent("workflow_chat_subject", {
      dedupeKey: access.dedupeKey,
      queue: access.queue,
      action,
      subjectChat: subjectChatMeta,
      subjectUserId: access.subjectUserId,
    });

    const inviteDmSent = Boolean(dm?.sent);
    let message = action === "invite" ? "Richiedente aggiunto alla chat." : "Richiedente rimosso dalla chat.";
    if (action === "invite" && !inviteDmSent) {
      message =
        dm?.reason === "dm_unavailable"
          ? "Richiedente aggiunto. DM Discord non disponibile (es. fuori server / unban): notificato sul sito."
          : "Richiedente aggiunto. DM non inviato: notificato sul sito.";
    }

    return res.status(200).json({
      ok: true,
      action,
      subjectChat: subjectChatMeta,
      inviteDmSent,
      inviteDmReason: dm?.reason || null,
      message,
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-workflow-chat subject:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

export = { handleSiteStaffWorkflowChatSubjectPost };
