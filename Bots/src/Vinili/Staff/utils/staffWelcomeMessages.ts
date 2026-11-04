const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { getStaffChatThreadIds, getStaffCmdsThreadIds } = require("../../Community/services/globalSettingsBucket") as typeof import("../../Community/services/globalSettingsBucket");
const { applyPronounGenderToTextForMember } = require("../../Community/utils/pronounGenderUtils") as typeof import("../../Community/utils/pronounGenderUtils");
const { resolveStaffChatPmThread } = require("./staffChatChannelUtils") as typeof import("./staffChatChannelUtils");
const { getGuildChannelCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { siteWorkflowUrl } = require("../../site/http/discordWorkflowUiGate") as typeof import("../../site/http/discordWorkflowUiGate");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
function buildHelperStaffWelcomeBody() {
  const staffNews = String(IDs.channels?.staffNews || "").trim();
  const lines = [
    `# Benvenutx nello staff ${E.VC_Staff}`,
    "",
    `> **Per iniziare al meglio controlla:** ${E.VC_id}`,
  ];
  lines.push(`${E.VC_DoubleReply} Guida staff: ${siteWorkflowUrl("guida")}`);
  if (staffNews) lines.push(`${E.VC_DoubleReply} News staff: <#${staffNews}>`);
  lines.push(
    `${E.VC_DoubleReply} Area Staff: ${siteWorkflowUrl("staff")}`,
    "",
    `__Per qualsiasi cosa l'High Staff è disponibile__ ${E.VC_Staff}`,
  );
  return lines.join("\n");
}

function buildStaffWelcomeContent(member?, body?) {
  const user = member?.user || member;
  const mention = user?.id ? `<@${user.id}>` : String(user || "");
  return applyPronounGenderToTextForMember(`${mention}\n${body}`, member);
}

async function buildPartnerManagerWelcomeBody() {
  const [chatIds, cmdsIds] = await Promise.all([getStaffChatThreadIds(), getStaffCmdsThreadIds()]);
  const lines = [
    `# Benvenutx nei Partner Manager ${E.VC_PartnerManager}`,
    "",
    `> **Per iniziare al meglio controlla:** ${E.VC_id}`,
  ];
  if (chatIds.pm) lines.push(`${E.VC_DoubleReply} Chat PM: <#${chatIds.pm}>`);
  if (cmdsIds.pm) lines.push(`${E.VC_DoubleReply} Comandi PM: <#${cmdsIds.pm}>`);
  lines.push(`${E.VC_DoubleReply} Guida staff: ${siteWorkflowUrl("guida")}`);
  lines.push(
    `${E.VC_DoubleReply} Profilo e shop PM sul sito: ${siteWorkflowUrl("staff")}`,
    `${E.VC_Reply} Punti tolti PM: ${siteWorkflowUrl("puntiTolti")}`,
    "",
    `__Per qualsiasi cosa l'High Staff è disponibile__ ${E.VC_Staff}`,
  );
  return lines.join("\n");
}

async function resolvePartnerManagerWelcomeChannel(client?, guild?) {
  const thread = await resolveStaffChatPmThread(client);
  if (thread?.isTextBased?.()) return thread;
  const staffChatId = String(IDs.channels?.staffChat || "").trim();
  if (guild && staffChatId) {
    const parent =
      guild.channels.cache.get(staffChatId) || (await getGuildChannelCached(guild, staffChatId).catch(() => null));
    if (parent?.isTextBased?.()) return parent;
  }
  return null;
}

async function sendPartnerManagerWelcome(clientOrChannel?, member?) {
  const client = clientOrChannel?.client || clientOrChannel;
  const guild = member?.guild;
  const channel = await resolvePartnerManagerWelcomeChannel(client, guild);
  if (!channel?.isTextBased?.()) return;
  const body = await buildPartnerManagerWelcomeBody();
  await channel
    .send({ content: buildStaffWelcomeContent(member, body) })
    .catch(() => null);
}

async function sendHelperWelcome(staffChannel?, member?) {
  if (!staffChannel?.isTextBased?.()) return;
  await staffChannel
    .send({ content: buildStaffWelcomeContent(member, buildHelperStaffWelcomeBody()) })
    .catch(() => null);
}

export = { sendPartnerManagerWelcome, sendHelperWelcome };
