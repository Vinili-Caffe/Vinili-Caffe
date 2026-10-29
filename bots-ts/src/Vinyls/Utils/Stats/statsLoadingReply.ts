const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime") as typeof import("../../../shared/discord/replyRuntime");

function buildStatsLoadingEmbed(title?, lookbackDays?) {
  const days = Math.max(1, Number(lookbackDays || 14));
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle(String(title || "Statistiche"))
    .setDescription(`<a:VC_pixeltime:1482535344103620771> Caricamento ultimi **${days}** giorni…`);
}

async function replyStatsLoadingThenEdit(message, { title, lookbackDays, buildPayload, deliverPayload }) {
  const loadingMsg = await safeMessageReply(message, {
    embeds: [buildStatsLoadingEmbed(title, lookbackDays)],
    allowedMentions: { repliedUser: false },
  });

  const payload = await buildPayload();

  if (typeof deliverPayload === "function") {
    await deliverPayload(loadingMsg, payload, message);
    return loadingMsg;
  }

  if (loadingMsg?.edit) {
    await loadingMsg.edit({
      content: payload.content ?? "",
      embeds: Array.isArray(payload.embeds) ? payload.embeds : [],
      files: payload.files || [],
      components: payload.components || [],
      allowedMentions: { repliedUser: false },
    }).catch(async () => {
      await safeMessageReply(message, { ...payload, allowedMentions: { repliedUser: false } });
    });
    return loadingMsg;
  }

  await safeMessageReply(message, { ...payload, allowedMentions: { repliedUser: false } });
  return null;
}

export = {
  buildStatsLoadingEmbed,
  replyStatsLoadingThenEdit,
};
