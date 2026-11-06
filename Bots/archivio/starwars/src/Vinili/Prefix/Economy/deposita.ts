/**
 * +deposita <importo> — versa crediti evento personali nella banca della fazione.
 * Unico modo per contribuire crediti alla banca (niente UI sito).
 */
"use strict";

const __path = require("path") as typeof import("path");
const __eventCoreVinili = (rel: string) => __path.join(__path.resolve(__dirname, "../../../../../../src/Vinili"), rel);

const IDs = require(__eventCoreVinili("Config/ids"));
const { depositPersonalCreditsToFaction } = require("../../Services/Community/starWarsEconomyService") as typeof import("../../Services/Community/starWarsEconomyService");
const {
  isStarWarsSortedParticipant,
  UNSORTED_MG_MSG,
} = require("../../Services/Community/starWarsDiscordMinigamesService") as typeof import("../../Services/Community/starWarsDiscordMinigamesService");

function normalizeId(v?) {
  return String(v || "").trim();
}

function walletGuildId(client?) {
  try {
    const fromCfg = normalizeId(client?.config?.mainGuildId);
    if (fromCfg) return fromCfg;
  } catch (_) {}
  return normalizeId(IDs.guilds?.main);
}

function parseAmount(raw?) {
  const s = String(raw || "")
    .trim()
    .replace(/\./g, "")
    .replace(/,/g, "")
    .replace(/_/g, "");
  if (!/^\d+$/.test(s)) return 0;
  const n = Math.floor(Number(s));
  return Number.isFinite(n) ? n : 0;
}

export = {
  name: "deposita",
  aliases: ["deposit", "versa"],
  description: "Versa crediti evento nella banca della tua fazione.",
  usage: "+deposita <importo>",
  examples: ["+deposita 1000", "+deposita 50000"],

  async execute(message?, args = []) {
    if (!message?.guild || !message.author) return;
    const amount = parseAmount(args[0]);
    if (!amount) {
      await message
        .reply("Uso: `+deposita <importo>` — es. `+deposita 1000`")
        .catch(() => null);
      return;
    }

    const client = message.client;
    const sorted = await isStarWarsSortedParticipant(client, message.guild.id, message.author.id);
    if (!sorted) {
      await message.reply(UNSORTED_MG_MSG).catch(() => null);
      return;
    }

    const out = await depositPersonalCreditsToFaction(client, {
      guildId: walletGuildId(client),
      userId: message.author.id,
      amount,
    });

    if (!out?.ok) {
      await message.reply(out?.message || "Deposito non riuscito.").catch(() => null);
      return;
    }

    const deposited = Math.max(0, Math.floor(Number(out.deposited) || 0)).toLocaleString("it-IT");
    const bank = Math.max(0, Math.floor(Number(out.bankCredits) || 0)).toLocaleString("it-IT");
    const given = Math.max(0, Math.floor(Number(out.factionBankGiven) || 0)).toLocaleString("it-IT");
    await message
      .reply(
        `Hai versato **${deposited}** crediti alla banca della fazione.\n` +
          `Caveau: **${bank}** · Il tuo contributo: **${given}**`,
      )
      .catch(() => null);
  },
};
