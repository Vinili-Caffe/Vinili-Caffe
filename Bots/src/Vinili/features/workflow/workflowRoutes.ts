/** Rotte HTTP delle richieste allo staff (workflow) e delle loro chat. */
function mountWorkflowRoutes(app?, client?, ctx: Record<string, any> = {}) {
  const { handleSiteStaffWorkflowGet, handleSiteStaffWorkflowPost } = require("./siteStaffWorkflowApi") as typeof import("./siteStaffWorkflowApi");
  app.get("/webhooks/site-staff-workflows", (req?, res?) => handleSiteStaffWorkflowGet(client, req, res));
  app.post("/webhooks/site-staff-workflows", (req?, res?) => handleSiteStaffWorkflowPost(client, req, res));
  const {
    handleSiteStaffWorkflowChatGet,
    handleSiteStaffWorkflowChatPost,
    handleSiteStaffWorkflowChatReadPost,
    handleSiteStaffWorkflowChatReactionPost,
    handleSiteStaffWorkflowChatEmojisGet,
    handleSiteStaffWorkflowChatFileGet,
    handleSiteStaffWorkflowChatSubjectPost,
    handleSiteStaffWorkflowChatMessagePatch,
    handleSiteStaffWorkflowChatMessageDelete,
    handleSiteStaffWorkflowChatTypingPost,
    handleSiteStaffWorkflowChatMentionsGet,
  } = require("./siteStaffWorkflowChatApi") as typeof import("./siteStaffWorkflowChatApi");
  app.get("/webhooks/site-staff-workflow-chat/emojis", (req?, res?) => handleSiteStaffWorkflowChatEmojisGet(client, req, res));
  app.get("/webhooks/site-staff-workflow-chat/mentions", (req?, res?) =>
    handleSiteStaffWorkflowChatMentionsGet(client, req, res),
  );
  app.post("/webhooks/site-staff-workflow-chat/typing", (req?, res?) =>
    handleSiteStaffWorkflowChatTypingPost(client, req, res),
  );
  app.post("/webhooks/site-staff-workflow-chat/read", (req?, res?) =>
    handleSiteStaffWorkflowChatReadPost(client, req, res),
  );
  app.get("/webhooks/site-staff-workflow-chat/files/:folderKey/:fileName", (req?, res?) =>
    handleSiteStaffWorkflowChatFileGet(client, req, res),
  );
  app.post("/webhooks/site-staff-workflow-chat/reactions", (req?, res?) =>
    handleSiteStaffWorkflowChatReactionPost(client, req, res),
  );
  app.post("/webhooks/site-staff-workflow-chat/subject", (req?, res?) =>
    handleSiteStaffWorkflowChatSubjectPost(client, req, res),
  );
  app.patch("/webhooks/site-staff-workflow-chat/messages/:messageId", (req?, res?) =>
    handleSiteStaffWorkflowChatMessagePatch(client, req, res),
  );
  app.delete("/webhooks/site-staff-workflow-chat/messages/:messageId", (req?, res?) =>
    handleSiteStaffWorkflowChatMessageDelete(client, req, res),
  );
  app.get("/webhooks/site-staff-workflow-chat", (req?, res?) => handleSiteStaffWorkflowChatGet(client, req, res));
  app.post("/webhooks/site-staff-workflow-chat", (req?, res?) => handleSiteStaffWorkflowChatPost(client, req, res));
  app.get("/webhooks/site-user-workflow-chat/emojis", (req?, res?) => handleSiteStaffWorkflowChatEmojisGet(client, req, res));
  app.get("/webhooks/site-user-workflow-chat/mentions", (req?, res?) =>
    handleSiteStaffWorkflowChatMentionsGet(client, req, res),
  );
  app.post("/webhooks/site-user-workflow-chat/typing", (req?, res?) =>
    handleSiteStaffWorkflowChatTypingPost(client, req, res),
  );
  app.post("/webhooks/site-user-workflow-chat/read", (req?, res?) =>
    handleSiteStaffWorkflowChatReadPost(client, req, res),
  );
  app.get("/webhooks/site-user-workflow-chat/files/:folderKey/:fileName", (req?, res?) =>
    handleSiteStaffWorkflowChatFileGet(client, req, res),
  );
  app.post("/webhooks/site-user-workflow-chat/reactions", (req?, res?) =>
    handleSiteStaffWorkflowChatReactionPost(client, req, res),
  );
  app.patch("/webhooks/site-user-workflow-chat/messages/:messageId", (req?, res?) =>
    handleSiteStaffWorkflowChatMessagePatch(client, req, res),
  );
  app.delete("/webhooks/site-user-workflow-chat/messages/:messageId", (req?, res?) =>
    handleSiteStaffWorkflowChatMessageDelete(client, req, res),
  );
  app.get("/webhooks/site-user-workflow-chat", (req?, res?) => handleSiteStaffWorkflowChatGet(client, req, res));
  app.post("/webhooks/site-user-workflow-chat", (req?, res?) => handleSiteStaffWorkflowChatPost(client, req, res));
}

export = { mountWorkflowRoutes };
