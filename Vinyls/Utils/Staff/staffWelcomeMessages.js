const IDs = require("../Config/ids");
const { getStaffChatThreadIds, getStaffCmdsThreadIds } = require("../Global/globalSettingsBucket");
const { applyPronounGenderToTextForMember } = require("../Community/pronounGenderUtils");
const { resolveStaffChatPmThread } = require("./staffChatChannelUtils");
const { getGuildChannelCached } = require("../Interaction/interactionEntityCache");
const { siteWorkflowUrl } = require("../Web/discordWorkflowUiGate");

function buildHelperStaffWelcomeBody() {
  const staffNews = String(IDs.channels?.staffNews || "").trim();
  const lines = [
    "# Benvenutx nello staff <:VC_Staff:1494286904089247754>",
    "",
    "> **Per iniziare al meglio controlla:** <:VC_id:1478517313618575419>",
  ];
  lines.push(`<:VC_DoubleReply:1482532332509466797> Guida staff: ${siteWorkflowUrl("guida")}`);
  if (staffNews) lines.push(`<:VC_DoubleReply:1482532332509466797> News staff: <#${staffNews}>`);
  lines.push(
    `<:VC_DoubleReply:1482532332509466797> Area Staff: ${siteWorkflowUrl("staff")}`,
    "",
    "__Per qualsiasi cosa l'High Staff è disponibile__ <:VC_Staff:1494286904089247754>",
  );
  return lines.join("\n");
}

function buildStaffWelcomeContent(member, body) {
  const user = member?.user || member;
  const mention = user?.id ? `<@${user.id}>` : String(user || "");
  return applyPronounGenderToTextForMember(`${mention}\n${body}`, member);
}

async function buildPartnerManagerWelcomeBody() {
  const [chatIds, cmdsIds] = await Promise.all([getStaffChatThreadIds(), getStaffCmdsThreadIds()]);
  const lines = [
    "# Benvenutx nei Partner Manager <:VC_PartnerManager:1494286911286808576>",
    "",
    "> **Per iniziare al meglio controlla:** <:VC_id:1478517313618575419>",
  ];
  if (chatIds.pm) lines.push(`<:VC_DoubleReply:1482532332509466797> Chat PM: <#${chatIds.pm}>`);
  if (cmdsIds.pm) lines.push(`<:VC_DoubleReply:1482532332509466797> Comandi PM: <#${cmdsIds.pm}>`);
  lines.push(`<:VC_DoubleReply:1482532332509466797> Guida staff: ${siteWorkflowUrl("guida")}`);
  lines.push(
    `<:VC_DoubleReply:1482532332509466797> Profilo e shop PM sul sito: ${siteWorkflowUrl("staff")}`,
    `<:VC_Reply:1482532158080942191> Punti tolti PM: ${siteWorkflowUrl("puntiTolti")}`,
    "",
    "__Per qualsiasi cosa l'High Staff è disponibile__ <:VC_Staff:1494286904089247754>",
  );
  return lines.join("\n");
}

async function resolvePartnerManagerWelcomeChannel(client, guild) {
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

async function sendPartnerManagerWelcome(clientOrChannel, member) {
  const client = clientOrChannel?.client || clientOrChannel;
  const guild = member?.guild;
  const channel = await resolvePartnerManagerWelcomeChannel(client, guild);
  if (!channel?.isTextBased?.()) return;
  const body = await buildPartnerManagerWelcomeBody();
  await channel
    .send({ content: buildStaffWelcomeContent(member, body) })
    .catch(() => null);
}

async function sendHelperWelcome(staffChannel, member) {
  if (!staffChannel?.isTextBased?.()) return;
  await staffChannel
    .send({ content: buildStaffWelcomeContent(member, buildHelperStaffWelcomeBody()) })
    .catch(() => null);
}

module.exports = { sendPartnerManagerWelcome, sendHelperWelcome };
