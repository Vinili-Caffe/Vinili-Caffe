const { applyPronounGenderToTextForMember } = require("../Community/pronounGenderUtils");

const PARTNER_MANAGER_WELCOME_BODY = `# Benvenutx nei Partner Manager <:VC_PartnerManager:1494286911286808576>

> **Per iniziare al meglio controlla:** <:VC_id:1478517313618575419>
<:VC_Reply:1482532158080942191> <#1442569199229730836>

__Per qualsiasi cosa l'High Staff è disponibile__ <:VC_Staff:1494286904089247754>`;

const HELPER_STAFF_WELCOME_BODY = `# Benvenutx nello staff <:VC_Staff:1494286904089247754>

> **Per iniziare al meglio controlla:** <:VC_id:1478517313618575419>
<:VC_DoubleReply:1482532332509466797> <#1442569237142044773>
<:VC_DoubleReply:1482532332509466797> <#1442569239063167139>
<:VC_Reply:1482532158080942191> <#1506250576722137179>

__Per qualsiasi cosa l'High Staff è disponibile__ <:VC_Staff:1494286904089247754>`;

function buildStaffWelcomeContent(member, body) {
  const user = member?.user || member;
  const mention = user?.id ? `<@${user.id}>` : String(user || "");
  return applyPronounGenderToTextForMember(`${mention}\n${body}`, member);
}

async function sendPartnerManagerWelcome(pmChannel, member) {
  if (!pmChannel?.isTextBased?.()) return;
  await pmChannel
    .send({ content: buildStaffWelcomeContent(member, PARTNER_MANAGER_WELCOME_BODY) })
    .catch(() => null);
}

async function sendHelperWelcome(staffChannel, member) {
  if (!staffChannel?.isTextBased?.()) return;
  await staffChannel
    .send({ content: buildStaffWelcomeContent(member, HELPER_STAFF_WELCOME_BODY) })
    .catch(() => null);
}

module.exports = { sendPartnerManagerWelcome, sendHelperWelcome };