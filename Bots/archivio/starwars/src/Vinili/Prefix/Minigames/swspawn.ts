const __path = require("path") as typeof import("path");
const __eventCoreVinili = (rel: string) => __path.join(__path.resolve(__dirname, "../../../../../../src/Vinili"), rel);
const { memberIsHighStaffEligible } = require(__eventCoreVinili("Staff/utils/staffRoleHierarchy"));
const { staffSpawn } = require("../../Services/Community/starWarsDiscordMinigamesService") as typeof import("../../Services/Community/starWarsDiscordMinigamesService");

const KINDS = [
  "podrace",
  "ewok",
  "olocron",
  "ordine66",
  "cacciatore",
  "cacciatore_taglie",
  "scova",
  "attacca_base",
  "convoglio",
  "conquista",
  "pg",
  "reliquie",
  "quiz",
  "quiz_mc",
  "quiz_vf",
  "quiz_text",
  "planet",
  "memory",
  "hangman",
  "guessnumber",
  "fasttype",
  "completequote",
  "findbot",
  "findbotvoice",
  "malus",
  "malus_yoda",
  "malus_spotchka",
  "malus_hansicle",
  "malus_sospensione",
  "malus_cortocircuito",
  "malus_geonosiana",
  "malus_jarjar",
];

export = {
  name: "swspawn",
  aliases: ["swmg", "starwarsspawn"],
  allowEmptyArgs: true,
  description: "Spawn minigioco Star Wars.",
  usage: "+swspawn <tipo>",
  examples: ["+swspawn podrace", "+swspawn quiz", "+swspawn malus_yoda"],

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
    if (kind === "malus" || kind.startsWith("malus_")) {
      const { announceAndActivateMalus } = require("../../Services/Community/starWarsQuizMalusService") as typeof import("../../Services/Community/starWarsQuizMalusService");
      const malusId = kind === "malus" ? null : kind.replace(/^malus_/, "");
      const out = await announceAndActivateMalus(message.client, {
        malusId,
        channelId: message.channelId,
        force: true,
      });
      if (!out?.ok) {
        await message.reply(`Spawn malus fallito: ${out?.error || "unknown"}`).catch(() => null);
        return;
      }
      await message.reply(`Spawn malus **${out.def?.id || malusId || "random"}** ok.`).catch(() => null);
      return;
    }
    if (kind === "quiz" || kind === "quiz_mc" || kind === "quiz_vf" || kind === "quiz_text") {
      const { getConfig } = require(__eventCoreVinili("Minigames/services/minigameConfig")) as typeof import("../../../../../../src/Vinili/Minigames/services/minigameConfig");
      const { activeGames, clearActiveGame, clearMinigameRoundTimers, endMinigameWinClose } = require(__eventCoreVinili("Minigames/services/minigameState"));
      const { startStarWarsQuizGame } = require("../../Services/Minigames/minigameStarWarsQuiz") as typeof import("../../Services/Minigames/minigameStarWarsQuiz");
      const cfg = { ...(getConfig(message.client) || {}), channelId: message.channelId, starWarsEventLive: true, guildId: message.guild.id };
      if (activeGames.has(message.channelId)) {
        clearMinigameRoundTimers(activeGames.get(message.channelId));
        endMinigameWinClose(message.channelId);
        await clearActiveGame(message.client, cfg).catch(() => null);
      }
      const forceKind = kind === "quiz" ? "" : kind.replace(/^quiz_/, "");
      const ok = await startStarWarsQuizGame(message.client, cfg, {
        channelId: message.channelId,
        forceKind,
      });
      if (!ok) {
        await message.reply("Spawn quiz fallito (bank vuota o errore avvio).").catch(() => null);
        return;
      }
      await message.reply(`Spawn **${kind}** ok.`).catch(() => null);
      return;
    }
    const chatMgMap = {
      planet: "starWarsGuessPlanet",
      memory: "memoryEmoji",
      hangman: "hangman",
      guessnumber: "guessNumber",
      fasttype: "fastType",
      completequote: "completeVerse",
      findbot: "findBot",
      findbotvoice: "findBotVoice",
    };
    if (chatMgMap[kind]) {
      const { getConfig } = require(__eventCoreVinili("Minigames/services/minigameConfig")) as typeof import("../../../../../../src/Vinili/Minigames/services/minigameConfig");
      const { activeGames, clearActiveGame, clearMinigameRoundTimers, endMinigameWinClose } = require(__eventCoreVinili("Minigames/services/minigameState"));
      const { startGuessNumberGame, startFastTypeGame, startHangmanGame } = require(__eventCoreVinili("Minigames/services/quizWords"));
      const { startCompleteVerseGame } = require(__eventCoreVinili("Minigames/services/quizCulture"));
      const { startStandardMemoryEmojiGame } = require(__eventCoreVinili("Minigames/services/minigameMemory"));
      const { startFindBotGame, startFindBotVoiceGame } = require(__eventCoreVinili("Minigames/services/minigameFindBot"));
      const { startStarWarsGuessPlanetGame } = require("../../Services/Minigames/minigameStarWarsGuessPlanet");
      const cfg = { ...(getConfig(message.client) || {}), channelId: message.channelId, starWarsEventLive: true, guildId: message.guild.id };
      // Staff force: libera canale se c'è una partita bloccata
      if (activeGames.has(message.channelId)) {
        clearMinigameRoundTimers(activeGames.get(message.channelId));
        endMinigameWinClose(message.channelId);
        await clearActiveGame(message.client, cfg).catch(() => null);
      }
      const starters = {
        starWarsGuessPlanet: startStarWarsGuessPlanetGame,
        memoryEmoji: startStandardMemoryEmojiGame,
        hangman: startHangmanGame,
        guessNumber: startGuessNumberGame,
        fastType: startFastTypeGame,
        completeVerse: startCompleteVerseGame,
        findBot: startFindBotGame,
        findBotVoice: startFindBotVoiceGame,
      };
      const starter = starters[chatMgMap[kind]];
      const ok = starter ? await starter(message.client, cfg) : false;
      if (!ok) {
        await message.reply(`Spawn **${kind}** fallito (bank vuota o errore avvio).`).catch(() => null);
        return;
      }
      await message.reply(`Spawn **${kind}** ok.`).catch(() => null);
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
