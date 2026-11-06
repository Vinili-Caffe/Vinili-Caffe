"use strict";

const __path = require("path") as typeof import("path");
const __eventCoreVinili = (rel: string) => __path.join(__path.resolve(__dirname, "../../../../../../src/Vinili"), rel);
const IDs = require(__eventCoreVinili("Config/ids"));
const { memberIsHighStaffEligible } = require(__eventCoreVinili("Staff/utils/staffRoleHierarchy"));
const { staffSetFactionRank } = require("../../Services/Community/starWarsFactionRankService") as typeof import("../../Services/Community/starWarsFactionRankService");

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
  name: "swrango",
  aliases: ["swrank", "factionrank"],
  description: "High Staff: imposta il rango fazione di un utente (1–4 o nome).",
  usage: "+swrango @utente <tier|nome>",
  examples: ["+swrango @Utente 4", "+swrango @Utente Grand Moff"],

  async execute(message?, args = []) {
    if (!message?.guild || !message.member) return;
    if (!memberIsHighStaffEligible(message.member)) {
      await message.reply("Solo High Staff.").catch(() => null);
      return;
    }
    const targetId = mentionUserId(message, args);
    const tierArg = args.slice(1).join(" ").trim() || args[1];
    if (!targetId || !tierArg) {
      await message.reply("Uso: `+swrango @utente <1-4|nome rango>`").catch(() => null);
      return;
    }
    const out = await staffSetFactionRank(message.client, {
      guildId: walletGuildId(message.client),
      targetUserId: targetId,
      tierOrName: tierArg,
    });
    await message.reply(out?.message || "Impostazione rango fallita.").catch(() => null);
  },
};
