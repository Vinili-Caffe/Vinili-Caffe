const { AttachmentBuilder } = require("discord.js");
const { transferGaleoni } = require("../../Services/Community/galeoniEconomyService");
const { buildImageButtonPayload } = require("../../Utils/Economy/guiPanelPayload");
const { replyDeny, runEconomyPanelCommand } = require("../../Utils/Economy/economyCommandHelpers");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");

function extractUserId(value) {
  const clean = String(value || "").replace(/[<@!>]/g, "").trim();
  return /^\d{16,20}$/.test(clean) ? clean : "";
}

module.exports = {
  name: "pay",
  aliases: ["paga", "invia", "send"],
  description: "Invia Galeoni a un altro utente (serve smistamento Hogwarts).",
  usage: "+pay @utente <importo>",
  examples: ["+pay @Mario 50", "+paga @utente 120"],
  async execute(message, args, client) {
    await runEconomyPanelCommand(message, client, "PAY", async ({ message: msg, client: c, replyDeny: deny }) => {
      const mention = msg.mentions.users.first();
      const targetId = mention?.id || extractUserId(args?.[0]);
      const amountRaw = mention ? args?.[0] : args?.[1];
      if (!targetId) {
        await deny(msg, "Meniona un utente valido: `+pay @utente <importo>`.");
        return;
      }
      if (amountRaw == null || String(amountRaw).trim() === "") {
        await deny(msg, "Inserisci l'importo da inviare.");
        return;
      }
      const targetUser = mention || (await c.users.fetch(targetId).catch(() => null));
      if (!targetUser) {
        await deny(msg, "Utente non trovato.");
        return;
      }
      const result = await transferGaleoni(c, msg, targetUser, amountRaw);
      if (!result.ok) {
        await deny(msg, result.message);
        return;
      }
      const senderName = msg.member?.displayName || msg.author.displayName || msg.author.username;
      const recipientName = targetUser.displayName || targetUser.username || `Utente ${targetUser.id.slice(-4)}`;
      try {
        const renderPayCanvas = require("../../Utils/Render/payCanvas");
        if (typeof renderPayCanvas.warmup === "function") renderPayCanvas.warmup();
        const rendered = await renderPayCanvas({
          amount: result.amount,
          senderName,
          recipientName,
          senderBalance: result.senderState?.balance ?? 0,
          recipientBalance: result.recipientState?.balance ?? 0,
        });
        const fileName = "pay-receipt.png";
        const files = [new AttachmentBuilder(Buffer.from(rendered.buffer), { name: fileName })];
        await safeMessageReply(msg, buildImageButtonPayload({ files, components: [] }));
      } catch (err) {
        global.logger?.warn?.("[PAY] render:", err?.message || err);
        await safeMessageReply(msg, {
          content: `✅ Pagamento completato: **${result.amount}** Galeoni inviati a **${recipientName}**.`,
          allowedMentions: { repliedUser: false },
        });
      }
    });
  },
};