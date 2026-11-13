/** Ingresso membri: messaggio privato di benvenuto (testi della dashboard → Benvenuto). */
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { shouldBlockDm } = require("../../Community/utils/noDmList") as typeof import("../../Community/utils/noDmList");
const { notifyDmPrivacyBlockedInCommands } = require("../../../shared/discord/dmPrivacyNotice") as typeof import("../../../shared/discord/dmPrivacyNotice");

function isMainGuildJoin(guildId?) {
  const gid = String(guildId || "");
  const mainId = String(IDs.guilds?.main || "");
  return Boolean(gid && mainId && gid === mainId);
}

async function maybeNotifyDiscordPrivacyBlockForMember(member?) {
  if (!member?.guild?.id || !member?.id) return;
  const optedOut = await shouldBlockDm(member.guild.id, member.id, null).catch(() => false);
  if (optedOut) return;
  await notifyDmPrivacyBlockedInCommands({
    guildId: member.guild.id,
    userId: member.id,
    commandsChannelId: IDs.channels.commands,
    client: member.client,
  }).catch(() => false);
}

async function sendDmWelcome(member?) {
  if (!isMainGuildJoin(member?.guild?.id)) return;
  if (!(require("../../../MultiGuild/core/moduleSwitches") as typeof import("../../../MultiGuild/core/moduleSwitches")).isModuleOn(member?.guild?.id, "benvenuto")) return;
  try {
    const { sendDashboardWelcomeDm } = require("../../../MultiGuild/services/welcomeRuntime") as typeof import("../../../MultiGuild/services/welcomeRuntime");
    const out = await sendDashboardWelcomeDm(member);
    if (out.dmClosed) await maybeNotifyDiscordPrivacyBlockForMember(member);
  } catch (err) {
    global.logger?.warn?.("[guildMemberAdd] dashboard DM:", err?.message || err);
  }
}

export = { sendDmWelcome };
