const { AttachmentBuilder } = require("discord.js");
const { resolveEconomyMode } = require("../../Services/Community/activeEconomyService");
const { transferGaleoni } = require("../../Services/Community/galeoniEconomyService");
const { buildImageButtonPayload } = require("../../Utils/Economy/guiPanelPayload");
const { replyDeny, resolveEconomyUserArg, runEconomyPanelCommand } = require("../../Utils/Economy/economyCommandHelpers");
const { economyUsername } = require("../../Utils/Economy/economyDisplayHelpers");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const DISABLED_MESSAGE = "Il comando `+pay` è riservato all'evento Hogwarts e non fa parte dell'economia Vinili & Caffè.";

function extractUserId(value) {
  const clean = String(value || "").replace(/[<@!>]/g, "").trim();
  return /^\d{16,20}$/.test(clean) ? clean : "";
}

module.exports = {
  name: "pay",
  description: "Invia Galeoni a un altro utente (evento Hogwarts).",
  usage: "+pay <@utente|username> <importo>",
  examples: ["+pay @Mario 50", "+paga username 120"],
  async execute(message, args, client) {
    await runEconomyPanelCommand(message, client, "PAY", async ({ message: msg, client: c, replyDeny: deny }) => {
      if (resolveEconomyMode(c) !== "galeoni") {
        await deny(msg, DISABLED_MESSAGE);
        return;
      }
      const mention = msg.mentions.users.first();
      let targetUser = mention || null;
      let amountRaw = null;
      if (mention) {
        // Con menzione l'importo è di solito args[0], oppure args[1] se args[0] è la menzione.
        if (args?.[1] != null && extractUserId(args?.[0])) amountRaw = args[1];
        else amountRaw = args?.[0];
      } else if (args?.[0]) {
        targetUser = await resolveEconomyUserArg(msg, args[0]);
        amountRaw = args?.[1];
      }
      if (!targetUser) {
        await deny(msg, "Indica un utente valido: `+pay @utente <importo>` oppure `+pay username <importo>`.");
        return;
      }
      if (amountRaw == null || String(amountRaw).trim() === "") {
        await deny(msg, "Inserisci l'importo da inviare.");
        return;
      }
      const result = await transferGaleoni(c, msg, targetUser, amountRaw);
      if (!result.ok) {
        await deny(msg, result.message);
        return;
      }
      const senderName = economyUsername(msg.author);
      const recipientName = economyUsername(targetUser, `Utente ${String(targetUser.id).slice(-4)}`);
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
        const file = new AttachmentBuilder(rendered.buffer, { name: rendered.name || "pay.png" });
        await safeMessageReply(msg, buildImageButtonPayload({ files: [file], components: [] }));
      } catch (err) {
        global.logger?.warn?.("[PAY] canvas:", err?.message || err);
        await safeMessageReply(msg, {
          content: `✅ Hai inviato **${result.amount}** Galeoni a **${recipientName}**.`,
          allowedMentions: { repliedUser: false },
        });
      }
    });
  },
};
