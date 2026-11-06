"use strict";

const __path = require("path") as typeof import("path");
const __eventCoreVinili = (rel: string) => __path.join(__path.resolve(__dirname, "../../../../../../src/Vinili"), rel);
const IDs = require(__eventCoreVinili("Config/ids"));
const { demoteFactionMember } = require("../../Services/Community/starWarsFactionRankService") as typeof import("../../Services/Community/starWarsFactionRankService");

function walletGuildId(client?) {
  try {
    const fromCfg = String(client?.config?.mainGuildId || "").trim();
    if (fromCfg) return fromCfg;
  } catch (_) {}
  return String(IDs.guilds?.main || "").trim();
}

function mentionUserId(message?, args?) {
  const m = message.mentions?.users?.first();
  if (m?.id) return String(m.id);
  const raw = String(args?.[0] || "").replace(/[<@!>]/g, "");
  return /^\d{16,20}$/.test(raw) ? raw : null;
}

export = {
  name: "declassa",
  aliases: ["declassare", "demote"],
  description: "Declassa di un rango un membro della fazione (solo rango massimo).",
  usage: "+declassa @utente",
  examples: ["+declassa @Utente"],

  async execute(message?, args = []) {
    if (!message?.guild || !message.author) return;
    const targetId = mentionUserId(message, args);
    if (!targetId) {
      await message.reply("Uso: `+declassa @utente`").catch(() => null);
      return;
    }
    const out = await demoteFactionMember(message.client, {
      guildId: walletGuildId(message.client),
      actorUserId: message.author.id,
      targetUserId: targetId,
    });
    await message.reply(out?.message || "Declassamento fallito.").catch(() => null);
  },
};
