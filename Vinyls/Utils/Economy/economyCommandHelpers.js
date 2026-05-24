const { safeMessageReply } = require("../../../shared/discord/replyRuntime");

const EMOJI_DENY = "<:vegax:1443934876440068179>";
const EMOJI_GAMBLE_DENY = "<a:VC_Cross:1482532424570376253>";

function replyOptions() {
  return { allowedMentions: { repliedUser: false } };
}

async function ensureGuild(message) {
  if (message?.guild) return true;
  await safeMessageReply(message, {
    content: `${EMOJI_DENY} Questo comando va usato in un server.`,
    ...replyOptions(),
  });
  return false;
}

async function sendTyping(message) {
  await message.channel?.sendTyping?.().catch(() => {});
}

async function replyDeny(message, text, opts = {}) {
  const icon = opts.gambling ? EMOJI_GAMBLE_DENY : EMOJI_DENY;
  await safeMessageReply(message, { content: `${icon} ${text}`, ...replyOptions() });
}

async function postGuiPanel(message, { payload, session, setSession, label }) {
  const sent = await safeMessageReply(message, payload);
  if (!sent?.id) {
    await replyDeny(message, `Impossibile aprire il pannello ${label}. Riprova.`);
    return null;
  }
  if (session && typeof setSession === "function") setSession(sent.id, session);
  return sent;
}

async function runEconomyPanelCommand(message, client, logTag, fn) {
  try {
    if (!(await ensureGuild(message))) return;
    await sendTyping(message);
    await fn({ message, client, replyDeny, postGuiPanel, sendTyping, ensureGuild, replyOptions });
  } catch (err) {
    global.logger?.error?.(`[${logTag}]`, err?.message || err);
    await replyDeny(message, "Errore imprevisto. Riprova tra poco.").catch(() => {});
  }
}

async function runIncomeCommand(client, message, incomeType) {
  const labels = { daily: "giornaliera", weekly: "settimanale", monthly: "mensile", work: "lavoro" };
  await runEconomyPanelCommand(message, client, incomeType.toUpperCase(), async ({ message: msg, client: c, replyDeny: deny, postGuiPanel: post }) => {
    const { openIncomePanel, setSession } = require("./incomeClaimGuiRuntime");
    const opened = await openIncomePanel(c, msg, incomeType);
    if (!opened.ok) {
      await deny(msg, opened.message);
      return;
    }
    await post(msg, {
      payload: opened.payload,
      session: opened.session,
      setSession,
      label: labels[incomeType] || incomeType,
    });
  });
}

module.exports = {
  EMOJI_DENY,
  EMOJI_GAMBLE_DENY,
  ensureGuild,
  sendTyping,
  replyDeny,
  postGuiPanel,
  runEconomyPanelCommand,
  runIncomeCommand,
  replyOptions,
};