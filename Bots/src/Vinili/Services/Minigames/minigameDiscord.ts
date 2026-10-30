/** Minigiochi: invio dei messaggi e reazioni di risposta giusta/sbagliata. */
const { applyDefaultFooterToEmbeds } = require("../../Utils/Embeds/defaultFooter") as typeof import("../../Utils/Embeds/defaultFooter");
const { warnMinigame } = require("./minigameLog") as typeof import("./minigameLog");

const MINIGAME_WIN_EMOJI = "<a:VC_Events:1482706144953897223>";
const MINIGAME_CORRECT_FALLBACK_EMOJI = "\u2714";
const MINIGAME_WRONG_EMOJI = "<a:VC_Cross:1482532424570376253>";

async function sendMinigameMessage(channel?, payload?) {
  if (!channel?.send) return null;
  try {
    const outgoing =
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? applyDefaultFooterToEmbeds(payload, channel.guild)
        : payload;
    return await channel.send(outgoing);
  } catch (_) {
    return null;
  }
}

async function reactMinigameWin(message?) {
  let reacted = false;
  try {
    await message.react(MINIGAME_WIN_EMOJI);
    reacted = true;
  } catch (err) {
    warnMinigame(err);
  }
  if (!reacted) {
    await message.react(MINIGAME_CORRECT_FALLBACK_EMOJI).catch(() => {});
  }
}

async function reactMinigameWrongEmoji(message?, _game = null) {
  await message.react(MINIGAME_WRONG_EMOJI).catch(() => {});
}

export = { MINIGAME_CORRECT_FALLBACK_EMOJI, MINIGAME_WRONG_EMOJI, sendMinigameMessage, reactMinigameWin, reactMinigameWrongEmoji };
