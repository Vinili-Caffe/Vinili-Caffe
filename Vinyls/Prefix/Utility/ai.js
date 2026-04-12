const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const {
  OLLAMA_MAX_PROMPT_CHARS,
  OLLAMA_FALLBACK_MODEL,
  pruneCooldown,
  aiUserCooldownKey,
  userCooldownMap,
  AI_USER_COOLDOWN_MS,
  callOllama,
  enqueueAiTask,
  looksLikeBadRefusal,
  isAiQueueSaturated,
} = require("../../Services/AI/ollamaChatRuntime");

module.exports = {
  name: "ai",
  args: true,
  async execute(message, args) {
    const nowTs = Date.now();
    pruneCooldown(nowTs);
    const userKey = aiUserCooldownKey(message);
    const cooldownUntil = Number(userCooldownMap.get(userKey) || 0);
    if (cooldownUntil > nowTs) {
      const remaining = Math.max(1, Math.ceil((cooldownUntil - nowTs) / 1000));
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              `<:vegax:1443934876440068179> Aspetta **${remaining}s** prima di usare di nuovo \`+ai\`.`,
            ),
        ],
        allowedMentions: { repliedUser: false, parse: [] },
      });
    }

    const rawPrompt = Array.isArray(args) ? args.join(" ").trim() : "";
    if (!rawPrompt) {
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              "<:vegax:1443934876440068179> Uso: `+ai <domanda>`",
            ),
        ],
        allowedMentions: { repliedUser: false, parse: [] },
      });
    }

    const prompt = rawPrompt.slice(0, OLLAMA_MAX_PROMPT_CHARS);
    if (isAiQueueSaturated()) {
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              "<:vegax:1443934876440068179> AI occupata in questo momento. Riprova tra poco.",
            ),
        ],
        allowedMentions: { repliedUser: false, parse: [] },
      });
    }

    userCooldownMap.set(userKey, nowTs + AI_USER_COOLDOWN_MS);
    await message.channel.sendTyping().catch(() => {});
    try {
      const text = await enqueueAiTask(() => callOllama(prompt, null));
      let finalText = text;
      if (looksLikeBadRefusal(finalText) && OLLAMA_FALLBACK_MODEL) {
        try {
          finalText = await enqueueAiTask(() =>
            callOllama(prompt, OLLAMA_FALLBACK_MODEL),
          );
        } catch (_) {}
      }
      return safeMessageReply(message, {
        content: finalText,
        allowedMentions: { repliedUser: false, parse: [] },
      });
    } catch (error) {
      const errMessage = String(error?.message || "");
      if (errMessage === "ai_queue_full") {
        return safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription(
                "<:vegax:1443934876440068179> Coda AI piena. Riprova tra poco.",
              ),
          ],
          allowedMentions: { repliedUser: false, parse: [] },
        });
      }
      if (errMessage.includes("AbortError")) {
        return safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription(
                "<:vegax:1443934876440068179> Timeout AI locale. Riprova con una richiesta piu corta.",
              ),
          ],
          allowedMentions: { repliedUser: false, parse: [] },
        });
      }
      global.logger?.warn?.("[+ai] failed:", errMessage || error);
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              "<:vegax:1443934876440068179> AI locale non disponibile. Controlla che Ollama sia attivo sulla VPS.",
            ),
        ],
        allowedMentions: { repliedUser: false, parse: [] },
      });
    }
  },
};