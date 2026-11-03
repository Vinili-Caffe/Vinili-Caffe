const { MessageFlags, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize } = require("discord.js") as typeof import("discord.js");

const PRIVATE_FLAG = 1 << 6;
const MONO_GUILD_DENIED_TEXT = "Questo bot è utilizzabile solo sul server principale di Vinili & Caffè.";

function v2Text(content?) {
  return new TextDisplayBuilder().setContent(String(content || ""));
}

function v2Separator() {
  return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
}

function v2PrivateFlags() {
  return PRIVATE_FLAG | MessageFlags.IsComponentsV2;
}
const IGNORED_BUTTON_LOG_CODES = new Set([
  10062,
  10015,
  10011,
  40060,
]);

function logButtonErr(err?, opts: Record<string, any> = {}) {
  if (!err) return;
  if (IGNORED_BUTTON_LOG_CODES.has(err?.code)) return;
  const msg = err?.message ?? err;
  if (
    typeof msg === "string" &&
    msg.startsWith("The reply to this interaction has already been sent or deferred.")
  ) {
    return;
  }
  if (opts.warn) global.logger?.warn?.("[buttons]", msg);
  else global.logger?.error?.("[buttons]", msg);
}

export = {
  PRIVATE_FLAG,
  MONO_GUILD_DENIED_TEXT,
  v2Text,
  v2Separator,
  v2PrivateFlags,
  logButtonErr,
};
