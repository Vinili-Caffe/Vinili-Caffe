const VANITY_INVITE_RE = /(?:discord\.gg|dsc\.gg|\.gg|discord\.com\/invite|discord\.me)\s*(?:\/|\\)?\s*viniliecaff[eèé]/i;
const SITE_LINK_RE = /(?:^|[^a-z0-9-])(?:https?:\/\/)?(?:www\.)?viniliecaff[eèé]\.it(?![a-z0-9-])(?:\/[^\s]*)?/i;
const SUPPORTER_STATUS_LINK_HINT_IT = "`.gg/viniliecaffe`, `discord.gg/viniliecaffe` o `viniliecaffe.it`";
const SUPPORTER_STATUS_LINK_HINT_PLAIN_IT = '".gg/viniliecaffe", "discord.gg/viniliecaffe" o "viniliecaffe.it"';

function normalizeSupporterStatusText(text) {
  return String(text || "")
    .replace(/\u2044|\u2215|\uFF0F/g, "/")
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function textHasSupporterStatusLink(text) {
  const blob = normalizeSupporterStatusText(text);
  if (!blob) return false;
  return VANITY_INVITE_RE.test(blob) || SITE_LINK_RE.test(blob);
}

module.exports = { VANITY_INVITE_RE, SITE_LINK_RE, SUPPORTER_STATUS_LINK_HINT_IT, SUPPORTER_STATUS_LINK_HINT_PLAIN_IT, normalizeSupporterStatusText, textHasSupporterStatusLink };