/**
 * +deposita <importo> — versa crediti evento personali nella banca della fazione.
 * Unico modo per contribuire crediti alla banca (niente UI sito).
 * Risposta canvas allineata agli altri comandi economy SW.
 */
"use strict";

const __path = require("path") as typeof import("path");
const __eventCoreVinili = (rel: string) => __path.join(__path.resolve(__dirname, "../../../../../../src/Vinili"), rel);
const __giochiEconomia = (rel: string) =>
  __path.join(__path.resolve(__dirname, "../../../../../giochi-economia/src/Vinili"), rel);

const { AttachmentBuilder } = require("discord.js") as typeof import("discord.js");
const IDs = require(__eventCoreVinili("Config/ids"));
const { depositPersonalCreditsToFaction } = require("../../Services/Community/starWarsEconomyService") as typeof import("../../Services/Community/starWarsEconomyService");
const {
  isStarWarsSortedParticipant,
  UNSORTED_MG_MSG,
} = require("../../Services/Community/starWarsDiscordMinigamesService") as typeof import("../../Services/Community/starWarsDiscordMinigamesService");

const CREDITI = "<a:VC_crediti:1567852561543733338>";
const EMOJI_DENY = "<:vegax:1443934876440068179>";

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

function replyOpts() {
  return { allowedMentions: { repliedUser: false } };
}

async function resolveFactionLabel(client?, factionId?) {
  const fid = normalizeId(factionId).toLowerCase();
  if (!fid) return "Fazione";
  try {
    const { resolveFeatureStateNow } = require("../../Utils/Eventi/starWarsEventCalendar") as typeof import("../../Utils/Eventi/starWarsEventCalendar");
    const { factionDisplayName } = require("../../Services/Community/starWarsPeiStandingService") as typeof import("../../Services/Community/starWarsPeiStandingService");
    const epoch = resolveFeatureStateNow(new Date())?.epoch;
    const label = factionDisplayName(epoch, fid);
    if (label) return String(label);
  } catch (_) {}
  try {
    const { getFactionMeta } = require("../../Utils/Eventi/starWarsSortingBank") as typeof import("../../Utils/Eventi/starWarsSortingBank");
    const meta = getFactionMeta(fid);
    if (meta?.label) return String(meta.label);
  } catch (_) {}
  return fid.replace(/_/g, " ");
}

async function buildDepositPayload(client?, out?) {
  const renderDepositCanvas = require(__giochiEconomia("Utils/Render/depositCanvas")) as typeof import("../../../../../giochi-economia/src/Vinili/Utils/Render/depositCanvas");
  const factionLabel = await resolveFactionLabel(client, out.factionId);
  const rendered = await renderDepositCanvas({
    client,
    deposited: out.deposited,
    bankCredits: out.bankCredits,
    contribution: out.factionBankGiven,
    walletCredits: out.wallet?.credits,
    factionId: out.factionId,
    factionLabel,
  });
  const fileName = "deposita-banca.png";
  return {
    content: null,
    embeds: [],
    components: [],
    files: [new AttachmentBuilder(Buffer.from(rendered.buffer), { name: fileName })],
    attachments: [],
    ...replyOpts(),
  };
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
        .reply({
          content: `${EMOJI_DENY} Uso: \`+deposita <importo>\` — es. \`+deposita 1000\``,
          ...replyOpts(),
        })
        .catch(() => null);
      return;
    }

    const client = message.client;
    const sorted = await isStarWarsSortedParticipant(client, message.guild.id, message.author.id);
    if (!sorted) {
      await message.reply({ content: UNSORTED_MG_MSG, ...replyOpts() }).catch(() => null);
      return;
    }

    await message.channel?.sendTyping?.().catch(() => {});

    const out = await depositPersonalCreditsToFaction(client, {
      guildId: walletGuildId(client),
      userId: message.author.id,
      amount,
    });

    if (!out?.ok) {
      await message
        .reply({
          content: `${EMOJI_DENY} ${out?.message || "Deposito non riuscito."}`,
          ...replyOpts(),
        })
        .catch(() => null);
      return;
    }

    try {
      const payload = await buildDepositPayload(client, out);
      await message.reply(payload).catch(() => null);
    } catch (err) {
      global.logger?.warn?.("[deposita] canvas:", (err as Error)?.message || err);
      const deposited = Math.max(0, Math.floor(Number(out.deposited) || 0)).toLocaleString("it-IT");
      const bank = Math.max(0, Math.floor(Number(out.bankCredits) || 0)).toLocaleString("it-IT");
      const given = Math.max(0, Math.floor(Number(out.factionBankGiven) || 0)).toLocaleString("it-IT");
      await message
        .reply({
          content:
            `${CREDITI} Hai versato **${deposited}** crediti alla banca della fazione.\n` +
            `Caveau: **${bank}** · Il tuo contributo: **${given}**`,
          ...replyOpts(),
        })
        .catch(() => null);
    }
  },
};
