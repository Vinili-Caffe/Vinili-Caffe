/** Rotte HTTP dei ticket dal sito (/tickets/). */
function mountWebTicketRoutes(app?, client?, ctx: Record<string, any> = {}) {
  const {
    handleSiteWebTicketsMetaGet,
    handleSiteWebTicketsEmojisGet,
    handleSiteWebTicketsMentionsGet,
    handleSiteWebTicketsResolvePost,
    handleSiteWebTicketsCommandsGet,
    handleSiteWebTicketsListGet,
    handleSiteWebTicketsCreatePost,
    handleSiteWebTicketsDetailGet,
    handleSiteWebTicketsMessagePost,
    handleSiteWebTicketsMessagePatch,
    handleSiteWebTicketsMessageDelete,
    handleSiteWebTicketsReactionPost,
    handleSiteWebTicketsClaimPost,
    handleSiteWebTicketsUnclaimPost,
    handleSiteWebTicketsClosePost,
    handleSiteWebTicketsMembersPost,
    handleSiteWebTicketsMembersRemovePost,
    handleSiteWebTicketsTransferPost,
    handleSiteWebTicketsCategoryPost,
    handleSiteWebTicketsRenamePost,
    handleSiteWebTicketsCloseRequestPost,
    handleSiteWebTicketsCloseRequestAcceptPost,
    handleSiteWebTicketsCloseRequestRejectPost,
    handleSiteWebTicketsCommandPost,
    handleSiteWebTicketsRatePost,
    handleSiteWebTicketsFileGet,
    handleSiteWebTicketsPresencePost,
    handleSiteWebTicketsReadPost,
    handleSiteWebTicketsTypingPost,
  } = require("./siteWebTicketsApi") as typeof import("./siteWebTicketsApi");

  app.get("/webhooks/site-web-tickets/meta", (req?, res?) => {
    try {
      return handleSiteWebTicketsMetaGet(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets meta:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.post("/webhooks/site-web-tickets/presence", async (req?, res?) => {
    try {
      return await handleSiteWebTicketsPresencePost(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets presence:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.post("/webhooks/site-web-tickets/:ticketId/typing", async (req?, res?) => {
    try {
      return await handleSiteWebTicketsTypingPost(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets typing:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.get("/webhooks/site-web-tickets/emojis", async (req?, res?) => {
    try {
      return await handleSiteWebTicketsEmojisGet(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets emojis:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.get("/webhooks/site-web-tickets/mentions", async (req?, res?) => {
    try {
      return await handleSiteWebTicketsMentionsGet(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets mentions:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.post("/webhooks/site-web-tickets/resolve", async (req?, res?) => {
    try {
      return await handleSiteWebTicketsResolvePost(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets resolve:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.get("/webhooks/site-web-tickets/commands", async (req?, res?) => {
    try {
      return await handleSiteWebTicketsCommandsGet(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets commands:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.get("/webhooks/site-web-tickets/files/:ticketId/:fileName", async (req?, res?) => {
    try {
      return await handleSiteWebTicketsFileGet(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets file:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.get("/webhooks/site-web-tickets", async (req?, res?) => {
    try {
      return await handleSiteWebTicketsListGet(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets list:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.post("/webhooks/site-web-tickets", async (req?, res?) => {
    try {
      return await handleSiteWebTicketsCreatePost(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets create:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.get("/webhooks/site-web-tickets/:ticketId", async (req?, res?) => {
    try {
      return await handleSiteWebTicketsDetailGet(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets detail:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.post("/webhooks/site-web-tickets/:ticketId/read", async (req?, res?) => {
    try {
      return await handleSiteWebTicketsReadPost(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets read:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.post("/webhooks/site-web-tickets/:ticketId/messages", async (req?, res?) => {
    try {
      return await handleSiteWebTicketsMessagePost(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets message:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.patch("/webhooks/site-web-tickets/:ticketId/messages/:messageId", async (req?, res?) => {
    try {
      return await handleSiteWebTicketsMessagePatch(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets message patch:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.delete("/webhooks/site-web-tickets/:ticketId/messages/:messageId", async (req?, res?) => {
    try {
      return await handleSiteWebTicketsMessageDelete(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets message delete:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.post("/webhooks/site-web-tickets/:ticketId/messages/:messageId/reactions", async (req?, res?) => {
    try {
      return await handleSiteWebTicketsReactionPost(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets reaction:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.post("/webhooks/site-web-tickets/:ticketId/claim", async (req?, res?) => {
    try {
      return await handleSiteWebTicketsClaimPost(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets claim:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.post("/webhooks/site-web-tickets/:ticketId/unclaim", async (req?, res?) => {
    try {
      return await handleSiteWebTicketsUnclaimPost(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets unclaim:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.post("/webhooks/site-web-tickets/:ticketId/close", async (req?, res?) => {
    try {
      return await handleSiteWebTicketsClosePost(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets close:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.post("/webhooks/site-web-tickets/:ticketId/members", async (req?, res?) => {
    try {
      return await handleSiteWebTicketsMembersPost(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets members:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.post("/webhooks/site-web-tickets/:ticketId/members/remove", async (req?, res?) => {
    try {
      return await handleSiteWebTicketsMembersRemovePost(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets members remove:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.post("/webhooks/site-web-tickets/:ticketId/transfer", async (req?, res?) => {
    try {
      return await handleSiteWebTicketsTransferPost(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets transfer:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.post("/webhooks/site-web-tickets/:ticketId/category", async (req?, res?) => {
    try {
      return await handleSiteWebTicketsCategoryPost(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets category:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.post("/webhooks/site-web-tickets/:ticketId/rename", async (req?, res?) => {
    try {
      return await handleSiteWebTicketsRenamePost(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets rename:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.post("/webhooks/site-web-tickets/:ticketId/close-request", async (req?, res?) => {
    try {
      return await handleSiteWebTicketsCloseRequestPost(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets close-request:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.post("/webhooks/site-web-tickets/:ticketId/close-request/accept", async (req?, res?) => {
    try {
      return await handleSiteWebTicketsCloseRequestAcceptPost(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets close-request accept:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.post("/webhooks/site-web-tickets/:ticketId/close-request/reject", async (req?, res?) => {
    try {
      return await handleSiteWebTicketsCloseRequestRejectPost(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets close-request reject:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.post("/webhooks/site-web-tickets/:ticketId/rate", async (req?, res?) => {
    try {
      return await handleSiteWebTicketsRatePost(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets rate:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.post("/webhooks/site-web-tickets/:ticketId/command", async (req?, res?) => {
    try {
      return await handleSiteWebTicketsCommandPost(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets command:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
}

export = { mountWebTicketRoutes };
