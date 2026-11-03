const { AVATAR_MODE_PREFIX, buildAvatarPayload } = require("../prefix/avatar") as typeof import("../prefix/avatar");
const { BANNER_MODE_PREFIX, buildBannerPayload } = require("../prefix/banner") as typeof import("../prefix/banner");
const { getGuildMemberCached } = require("../../../../shared/discord/interactionEntityCache") as typeof import("../../../../shared/discord/interactionEntityCache");

function match(interaction?) {
  if (!interaction?.isButton?.()) return false;
  const id = String(interaction.customId || "");
  return id.startsWith(AVATAR_MODE_PREFIX) || id.startsWith(BANNER_MODE_PREFIX);
}

function parseModePayload(customId?, prefix?) {
  const raw = String(customId || "").slice(prefix.length);
  const [ownerId = "", targetId = "", modeRaw = "user", stateRaw = "00"] = raw.split(":");
  const mode = modeRaw === "server" ? "server" : "user";
  const normalizedState = String(stateRaw || "00").replace(/[^01]/g, "");
  const user = normalizedState.charAt(0) === "1";
  const server = normalizedState.charAt(1) === "1";
  return { ownerId, targetId, mode, viewState: { user, server } };
}

async function execute(interaction?) {
  const id = String(interaction.customId || "");
  const isAvatar = id.startsWith(AVATAR_MODE_PREFIX);
  const prefix = isAvatar ? AVATAR_MODE_PREFIX : BANNER_MODE_PREFIX;
  const { ownerId, targetId, mode, viewState } = parseModePayload(id, prefix);
  const guild = interaction.guild;
  if (!guild) return false;

  if (ownerId && interaction.user?.id && String(ownerId) !== String(interaction.user.id)) {
    await interaction.reply({ content: "<a:VC_Alert:1482706673176150077> Questo controllo non è tuo.", flags: 1 << 6 }).catch(() => { });
    return true;
  }

  const member = await getGuildMemberCached(guild, targetId).catch(() => null);
  if (!member?.user) return true;

  const payload = isAvatar
    ? await buildAvatarPayload({ guild, targetMember: member, fallbackUser: member.user, requesterId: ownerId || interaction.user?.id, mode, viewState })
    : await buildBannerPayload({ guild, targetMember: member, fallbackUser: member.user, requesterId: ownerId || interaction.user?.id, mode, viewState });

  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload).catch(() => interaction.followUp(payload).catch(() => { }));
  } else {
    await interaction.update(payload).catch(() => interaction.reply(payload).catch(() => { }));
  }
  return true;
}

export = { name: "avatarBannerToggle", order: 8, match, execute };