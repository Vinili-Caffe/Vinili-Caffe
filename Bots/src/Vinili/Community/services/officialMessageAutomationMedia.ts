const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const MEDIA_BLOCK_ROLE_IDS = [IDs.roles.PicPerms].filter(Boolean);

function hasMediaPermission(member?) {
  return MEDIA_BLOCK_ROLE_IDS.some((roleId?) =>
    member?.roles?.cache?.has(roleId),
  );
}

function channelAllowsMedia(message?) {
  const channel = message?.channel;
  const member = message?.member;
  if (!channel || !member) return false;
  const perms = channel.permissionsFor(member);
  if (!perms) return false;
  const hasAttachment = Boolean(message.attachments?.size);
  const hasLink = /https?:\/\/\S+/i.test(String(message.content || "")) || /discord\.gg\/\S+|\.gg\/\S+/i.test(String(message.content || ""));
  if (hasAttachment) return perms.has("AttachFiles");
  if (hasLink) return perms.has("EmbedLinks");
  return perms.has("AttachFiles") || perms.has("EmbedLinks");
}

function normalizeUrlToken(raw?) {
  return String(raw || "")
    .trim()
    .replace(/[.,;:!?)>\]]+$/g, "");
}

function extractHttpUrlsFromContent(content?) {
  const text = String(content || "");
  const re = /https?:\/\/[^\s<>`]+/gi;
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push(normalizeUrlToken(m[0]));
  }
  return out;
}

function isSameGuildDiscordChannelOrJumpUrl(url?, guildId?) {
  if (!url || !guildId) return false;
  const base = String(url).split("?")[0].split("#")[0];
  const m = base.match(
    /^https?:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/channels\/(\d{17,22})\/(\d{17,22})(?:\/(\d{17,22}))?\/?$/i,
  );
  if (!m) return false;
  return String(m[1]) === String(guildId);
}

function isMediaMessage(message?) {
  if (message.attachments?.size) return true;
  const content = String(message.content || "");
  if (/discord\.gg\/\S+|\.gg\/\S+/i.test(content)) return true;
  const guildId = message.guild?.id;
  const urls = extractHttpUrlsFromContent(content);
  if (!urls.length) return false;
  if (!guildId) return true;
  for (const url of urls) {
    if (!isSameGuildDiscordChannelOrJumpUrl(url, guildId)) return true;
  }
  return false;
}

function isDiscordInviteLinkMessage(message?) {
  const content = String(message?.content || "");
  return /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/[a-z0-9-]{2,}/i.test(
    content,
  );
}

export = {
  hasMediaPermission,
  channelAllowsMedia,
  isMediaMessage,
  isDiscordInviteLinkMessage,
};
