const { safeMessageReply } = require("../../../shared/discord/replyRuntime") as typeof import("../../../shared/discord/replyRuntime");

const EMOJI_DENY = "<:vegax:1443934876440068179>";
const EMOJI_GAMBLE_DENY = "<a:VC_Cross:1482532424570376253>";

function replyOptions() {
  return { allowedMentions: { repliedUser: false } };
}

async function ensureGuild(message?) {
  if (message?.guild) return true;
  await safeMessageReply(message, {
    content: `${EMOJI_DENY} Questo comando va usato in un server.`,
    ...replyOptions(),
  });
  return false;
}

async function sendTyping(message?) {
  await message.channel?.sendTyping?.().catch(() => {});
}

async function replyDeny(message?, text?, opts: Record<string, any> = {}) {
  const icon = opts.gambling ? EMOJI_GAMBLE_DENY : EMOJI_DENY;
  await safeMessageReply(message, { content: `${icon} ${text}`, ...replyOptions() });
}

function sessionSpendOptions(session?) {
  return { skipCooldown: Boolean(session?.stakeCooldownApplied) };
}

function markSessionStakeCooldown(session?) {
  if (session && typeof session === "object") session.stakeCooldownApplied = true;
}

async function finalizeEconomyGuiClose({
  interaction,
  session,
  cfg,
  notice,
  keepOpen,
  setSession,
  deleteSession,
  updatePanel,
  updateExtraArgs = [],
}) {
  const messageId = interaction?.message?.id;
  if (keepOpen) {
    if (typeof setSession === "function" && messageId) {
      const live = setSession(messageId, session);
      if (live?.persistPromise) await live.persistPromise.catch(() => null);
      else if (live && typeof live.then === "function") await live.catch(() => null);
    }
    await updatePanel(interaction, session, cfg, notice, false, ...updateExtraArgs);
    return { closed: false };
  }
  if (typeof deleteSession === "function") {
    const cleared = deleteSession(messageId, session);
    if (cleared && typeof cleared.then === "function") await cleared.catch(() => null);
  }
  await updatePanel(interaction, session, cfg, notice, true, ...updateExtraArgs);
  return { closed: true };
}

async function postGuiPanel(message, { payload, session, setSession, label }) {
  const sent = await safeMessageReply(message, payload);
  if (!sent?.id) {
    await replyDeny(message, `Impossibile aprire il pannello ${label}. Riprova.`);
    return null;
  }
  if (session && typeof setSession === "function") {
    session.messageId = String(sent.id || session.messageId || "");
    session.channelId = String(sent.channelId || sent.channel?.id || session.channelId || message?.channelId || message?.channel?.id || "");
    const live = setSession(sent.id, session);
    if (live && typeof live.then === "function") {
      await live.catch(() => null);
    } else if (live?.persistPromise) {
      await live.persistPromise.catch(() => null);
    }
  }
  return sent;
}

async function runEconomyPanelCommand(message?, client?, logTag?, fn?) {
  try {
    if (!(await ensureGuild(message))) return;
    await sendTyping(message);
    await fn({ message, client, replyDeny, postGuiPanel, sendTyping, ensureGuild, replyOptions });
  } catch (err) {
    global.logger?.error?.(`[${logTag}]`, err?.message || err);
    await replyDeny(message, "Errore imprevisto. Riprova tra poco.").catch(() => {});
  }
}

async function runIncomeCommand(client?, message?, incomeType?) {
  const labels = { daily: "giornaliera", weekly: "settimanale", monthly: "mensile", work: "lavoro" };
  await runEconomyPanelCommand(message, client, incomeType.toUpperCase(), async ({ message: msg, client: c, replyDeny: deny, postGuiPanel: post }) => {
    const { runIncomeDirect } = require("./incomeClaimGuiRuntime") as typeof import("./incomeClaimGuiRuntime");
    const result = await runIncomeDirect(c, msg, incomeType);
    if (!result.ok) {
      await deny(msg, result.message);
      return;
    }
    await post(msg, {
      payload: result.payload,
      session: null,
      setSession: null,
      label: labels[incomeType] || incomeType,
    });
  });
}

async function resolveEconomyUserArg(message?, raw?) {
  const token = String(raw || "").trim();
  if (!token || !message?.guild) return null;
  const { resolveTarget } = require("../Moderation/prefixModeration") as typeof import("../Moderation/prefixModeration");
  const resolved = await resolveTarget(message, [token], 0);
  return resolved?.user || null;
}

async function resolveEconomyOpponentArg(message?, args?, options: Record<string, any> = {}) {
  const mentioned = message?.mentions?.users?.first();
  if (mentioned) return mentioned;
  const skipToken = typeof options.skipToken === "function" ? options.skipToken : () => false;
  const list = Array.isArray(args) ? args : [];
  for (let i = 0; i < Math.min(2, list.length); i += 1) {
    const token = String(list[i] || "").trim();
    if (!token || skipToken(token)) continue;
    const user = await resolveEconomyUserArg(message, token);
    if (user) return user;
  }
  return null;
}

export = {
  EMOJI_DENY,
  EMOJI_GAMBLE_DENY,
  ensureGuild,
  sendTyping,
  replyDeny,
  postGuiPanel,
  runEconomyPanelCommand,
  runIncomeCommand,
  resolveEconomyUserArg,
  resolveEconomyOpponentArg,
  replyOptions,
  sessionSpendOptions,
  markSessionStakeCooldown,
  finalizeEconomyGuiClose,
};
