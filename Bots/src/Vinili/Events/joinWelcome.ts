/** Ingresso membri: benvenuto nel canale e in DM. */
const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const IDs = require("../Utils/Config/ids") as typeof import("../Utils/Config/ids");
const { shouldBlockDm } = require("../Utils/noDmList") as typeof import("../Utils/noDmList");
const { notifyDmPrivacyBlockedInCommands } = require("../../shared/discord/dmPrivacyNotice") as typeof import("../../shared/discord/dmPrivacyNotice");
const { guildIconUrl, accountUsername } = require("../Utils/Discord/guildDiscordIdentity") as typeof import("../Utils/Discord/guildDiscordIdentity");
const { getVerifiedPlusBotsCount } = require("./joinBots") as typeof import("./joinBots");

function buildDmWelcomeEmbed(member?) {
  const visibleCount = getVerifiedPlusBotsCount(member.guild);
  const dmGuildIcon = guildIconUrl(member.guild, { size: 256 });
  const dmFooterIcon = guildIconUrl(member.guild, { size: 64 });
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<a:VC_RightWing:1448672889845973214> Benvento in Vinili & Caffè!")
    .setDescription(
      [
        `Ciao **${accountUsername(member)}**, grazie per esserti unito a noi!`,
        "",
        "Entrando nel server accetti automaticamente le nostre regole.",
        "<a:VC_Arrow:1482706699365257397> <https://discord.com/channels/1329080093599076474/1442569111119990887/1470102236527853661>",
        "------------------------------",
        "<:VC_Dot:1482532364222595303> Controlla le nostre GUILD TAGS",
        "<a:VC_Moon:1482724651430838406>[⭑.ᐟ](<https://discord.gg/E6vrm5zE6B>)<:VC_Femboy1:1528177995095867515><:VC_Femboy2:1528178060581671084> & [⭑.ᐟ](<https://discord.gg/QnTN5P578g>)<:VC_666_1:1528177848890691684><:VC_666_2:1528177905404870828>",
        "<:VC_Firework:1470796227913322658>[⭑.ᐟ](<https://discord.gg/WMuZ4EMAkc>)<:VC_Porn1:1482497744513011944><:VC_Porn2:1482497774892089547> & <a:VC_PepeEggPlant:1331622686014570588>[⭑.ᐟ](<https://discord.gg/uqUNS9f5m5>)<:VC_Cat1:1528177482807640125><:VC_Cat2:1528177684843073546>",
        "<a:VC_PepeSmoke:1331590685673132103>[⭑.ᐟ](<https://discord.gg/SzBwnxHXNv>)<:VC_Weed1:1482497951686201534><:VC_Weed2:1482497986910097592> & <a:VC_PepeExcited:1331621719093284956>[⭑.ᐟ](<https://discord.gg/z3EXtJwvQH>)<:VC_Figa1:1482495980275499169><:VC_Figa2:1482496046222544937>",
        "<a:VC_Arrow:1482706699365257397> <https://discord.com/channels/1329080093599076474/1442569111119990887/1470102239094767699>",
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
