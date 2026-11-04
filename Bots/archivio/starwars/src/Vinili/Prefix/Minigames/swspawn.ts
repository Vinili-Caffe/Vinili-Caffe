const __path = require("path") as typeof import("path");
const __eventCoreVinili = (rel: string) => __path.join(__path.resolve(__dirname, "../../../../../../src/Vinili"), rel);
const { memberIsHighStaffEligible } = require(__eventCoreVinili("Staff/utils/staffRoleHierarchy"));
const { staffSpawn } = require("../../Services/Community/starWarsDiscordMinigamesService") as typeof import("../../Services/Community/starWarsDiscordMinigamesService");

const KINDS = [
  "podrace",
  "ewok",
  "olocron",
  "ordine66",
  "scova",
  "attacca_base",
  "convoglio",
  "conquista",
  "pg",
  "reliquie",
];

export = {
  name: "swspawn",
  aliases: ["swmg", "starwarsspawn"],
  allowEmptyArgs: true,
  description: "Spawn minigioco Star Wars.",
  usage: "+swspawn <tipo>",
  examples: ["+swspawn podrace", "+swspawn scova"],

  async execute(message?, args = []) {
    if (!message.guild || !message.member) return;
    if (!memberIsHighStaffEligible(message.member)) {
      await message.reply("Solo High Staff.").catch(() => null);
      return;
    }
    const kind = String(args[0] || "").trim().toLowerCase();
    if (!kind || !KINDS.includes(kind)) {
      await message
        .reply(`Tipi: ${KINDS.join(", ")}`)
        .catch(() => null);
      return;
    }
    const out = await staffSpawn(message.client, kind, message.channelId);
    if (!out?.ok) {
      await message.reply(`Spawn fallito: ${out?.error || "unknown"}`).catch(() => null);
      return;
    }
    await message.reply(`Spawn **${kind}** ok.`).catch(() => null);
  },
};
