/** Ingresso membri: benvenuto nel canale e in DM. */
const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { shouldBlockDm } = require("../../Community/utils/noDmList") as typeof import("../../Community/utils/noDmList");
const { notifyDmPrivacyBlockedInCommands } = require("../../../shared/discord/dmPrivacyNotice") as typeof import("../../../shared/discord/dmPrivacyNotice");
const { guildIconUrl, accountUsername } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");
const { getVerifiedPlusBotsCount } = require("../../Moderation/events/joinBots") as typeof import("../../Moderation/events/joinBots");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
function buildDmWelcomeEmbed(member?) {
  const visibleCount = getVerifiedPlusBotsCount(member.guild);
  const dmGuildIcon = guildIconUrl(member.guild, { size: 256 });
  const dmFooterIcon = guildIconUrl(member.guild, { size: 64 });
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle(`${E.VC_RightWing} Benvento in Vinili & Caffè!`)
    .setDescription(
      [
        `Ciao **${accountUsername(member)}**, grazie per esserti unito a noi!`,
        "",
        "Entrando nel server accetti automaticamente le nostre regole.",
        `${E.VC_Arrow} <https://discord.com/channels/1329080093599076474/1442569111119990887/1470102236527853661>`,
        "------------------------------",
        `${E.VC_Dot} Metti la nostra GUILD TAG **V&C** sul tuo profilo`,
        `${E.VC_Arrow} <https://discord.com/channels/1329080093599076474/1442569111119990887/1470102239094767699>`,
                      ].join("\n"),
    )
    .setThumbnail(dmGuildIcon || undefined)
    .setFooter({
      text: `${member.guild.name} • Ora siamo in ${visibleCount} membri`,
      iconURL: dmFooterIcon || undefined,
    })
    .setTimestamp();
}

function isUserDmUnavailableError(err?) {
  const code = Number(err?.code ?? err?.rawError?.code ?? 0);
  if ([50007, 50278].includes(code)) return true;
  const msg = String(err?.message || err?.rawError?.message || "").toLowerCase();
  if (!msg) return false;
  if (msg.includes("cannot send messages")) return true;
  if (msg.includes("no mutual guild")) return true;
  return false;
}

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
  /* DM salvato dalla dashboard: usa quello (anche spento) */
  try {
    const { hasSavedWelcome } = require("../../../MultiGuild/core/tenantCommunityTools") as typeof import("../../../MultiGuild/core/tenantCommunityTools");
    if (await hasSavedWelcome(member.guild.id)) {
      const { sendDashboardWelcomeDm } = require("../../../MultiGuild/services/welcomeRuntime") as typeof import("../../../MultiGuild/services/welcomeRuntime");
      const out = await sendDashboardWelcomeDm(member);
      if (out.dmClosed) await maybeNotifyDiscordPrivacyBlockForMember(member);
      return;
    }
  } catch (err) {
    global.logger?.warn?.("[guildMemberAdd] dashboard DM:", err?.message || err);
  }
  const dmEmbed = buildDmWelcomeEmbed(member);
  const payload = { embeds: [dmEmbed] };

  try {
    await member.send(payload);
    return;
  } catch (err) {
    if (isUserDmUnavailableError(err)) {
      await maybeNotifyDiscordPrivacyBlockForMember(member);
      return;
    }
  }

  await new Promise((resolve?) => {
    const t = setTimeout(resolve, 2000);
    t.unref?.();
  });

  try {
    await member.send(payload);
  } catch (err) {
    if (isUserDmUnavailableError(err)) {
      await maybeNotifyDiscordPrivacyBlockForMember(member);
      return;
    }
    global.logger.warn(
      `[guildMemberAdd] Could not send DM to ${member.user.tag}: ${err?.message || err}${err?.code != null ? ` [${err.code}]` : ""}`,
    );
  }
}

export = { sendDmWelcome };
