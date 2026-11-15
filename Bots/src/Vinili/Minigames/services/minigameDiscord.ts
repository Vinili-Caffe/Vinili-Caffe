/** Minigiochi: invio dei messaggi e reazioni di risposta giusta/sbagliata. */
const { applyDefaultFooterToEmbeds } = require("../../../shared/embeds/defaultFooter") as typeof import("../../../shared/embeds/defaultFooter");
const { warnMinigame } = require("./minigameLog") as typeof import("./minigameLog");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const MINIGAME_WIN_EMOJI = E.VC_Events;
const MINIGAME_CORRECT_FALLBACK_EMOJI = "\u2714";
const MINIGAME_WRONG_EMOJI = E.VC_Cross;

/**
 * @param opts.type tipo minigioco — se presente, prova start/win draft dalla dashboard
 * @param opts.kind 'start' | 'win' (default start)
 * @param opts.vars placeholder del draft
 */
async function sendMinigameMessage(channel?, payload?, opts: { type?: string; kind?: "start" | "win"; vars?: Record<string, string>; mentionUserId?: string | null } = {}) {
  if (!channel?.send) return null;
  try {
    let body = payload;
    if (opts?.type) {
      try {
        const { applyMinigameDraftToPayload } = require("./minigameDraftSend") as typeof import("./minigameDraftSend");
        body = applyMinigameDraftToPayload(payload, {
          type: opts.type,
          kind: opts.kind || "start",
          vars: opts.vars || {},
          mentionUserId: opts.mentionUserId || null,
          guild: channel.guild || null,
        });
      } catch (_) {}
    }
    const outgoing =
      body && typeof body === "object" && !Array.isArray(body)
        ? applyDefaultFooterToEmbeds(body, channel.guild)
        : body;
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
