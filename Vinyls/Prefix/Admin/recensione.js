const { EmbedBuilder } = require("discord.js");
const IDs = require("../../Utils/Config/ids");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { getLevelInfo, addExpWithLevel, } = require("../../Services/Community/expService");
const{getGuildChannelCached,getUserCached,}=require("../../Utils/Interaction/interactionEntityCache");

const FALLBACK_REVIEW_CHANNEL_ID = IDs.channels.supporters;
const LEVELS_TO_ADD = 5;

function roundToNearest50(value) {
  return Math.round(value / 50) * 50;
}

function getLevelStep(level) {
  const safeLevel = Math.max(1, Math.floor(Number(level || 1)));
  let step = 90 + Math.floor(safeLevel * 12) + (safeLevel % 4) * 15;

  if (safeLevel >= 10) {
    const over10 = safeLevel - 9;
    step += 120 + over10 * 28 + Math.floor(over10 * over10 * 1.3);
  }
  if (safeLevel >= 30) {
    step += 120 + (safeLevel - 30) * 18;
  }
  if (safeLevel >= 50) {
    step += 220 + (safeLevel - 50) * 25;
  }

  return Math.max(110, step);
}

function getTotalExpForLevel(level) {
  const targetLevel = Math.max(0, Math.floor(Number(level || 0)));
  if (targetLevel <= 0) return 0;

  let threshold = 100;
  for (let l = 1; l < targetLevel; l += 1) {
    threshold = roundToNearest50(threshold + Math.max(110, getLevelStep(l)));
  }
  return threshold;
}

async function resolveTargetUser(message, raw) {
  const fromMention = message.mentions?.users?.first();
  if (fromMention) return fromMention;
  const id = String(raw || "").replace(/[<@!>]/g, "");
  if (!/^\d{16,20}$/.test(id)) return null;
  return getUserCached(message.client, id);
}

module.exports = {
  name: "recensione",

  async execute(message, args = []) {
    await message.channel.sendTyping().catch(() => {});

    const target = await resolveTargetUser(message, args[0]);
    if (!target) {
      const help = new EmbedBuilder()
        .setColor("Red")
        .setDescription("<:vegax:1443934876440068179> Uso corretto: `+recensione <@utente | id>`");
      await safeMessageReply(message, {
        embeds: [help],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const guildId = message.guild?.id;
    if (!guildId) return;

    const alreadyRewarded=await ActivityUserProfile.findOne({ guildId, userId: target.id, "bumpVoteRewards.disboard_review.rewardedAt": { $ne: null } })
      .select("_id")
      .lean()
      .catch(() => null);
    if (alreadyRewarded) {
      const blocked = new EmbedBuilder()
        .setColor("Red")
        .setTitle("Recensione già riscattata")
        .setDescription("<:vegax:1443934876440068179> Su questo utente la ricompensa recensione è già stata assegnata.");
      await safeMessageReply(message, {
        embeds: [blocked],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const profile = await ActivityUserProfile.findOne({ guildId, userId: target.id }).select("exp.totalExp").lean().catch(() => null);
    const currentExp = Number(profile?.exp?.totalExp || 0);
    const currentLevel = getLevelInfo(currentExp).level;
    const targetLevel = currentLevel + LEVELS_TO_ADD;
    const targetExp = getTotalExpForLevel(targetLevel);
    const finalExp = Math.max(currentExp, targetExp);
    const addedExp = Math.max(0, finalExp - currentExp);

    if (addedExp <= 0) {
      const nothing = new EmbedBuilder()
        .setColor("Red")
        .setDescription("<:vegax:1443934876440068179> Non posso assegnare livelli: il target ha già una soglia EXP superiore.");
      await safeMessageReply(message, {
        embeds: [nothing],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const levelResult=await addExpWithLevel(message.guild,target.id,addedExp,false,false,);
    const finalLevel=Number(levelResult?.levelInfo?.level??getLevelInfo(finalExp).level,);
    await ActivityUserProfile.updateOne(
      { guildId, userId: target.id },
      {
        $setOnInsert: { guildId, userId: target.id },
        $set: {
          "bumpVoteRewards.disboard_review.rewardedBy": message.author.id,
          "bumpVoteRewards.disboard_review.rewardedAt": new Date(),
        },
      },
      { upsert: true },
    ).catch(() => {});

    const dr = message.client.config?.disboardReviews || {};
    const announceId = dr.channelId || FALLBACK_REVIEW_CHANNEL_ID;
    const reviewPageUrl = String(
      dr.reviewUrl || "https://disboard.org/it/server/reviews/1329080093599076474",
    );
    const reviewChannel =
      message.guild.channels.cache.get(announceId) ||
      (await getGuildChannelCached(message.guild, announceId));
    if (reviewChannel) {
      const member =
        message.guild.members.cache.get(target.id) ||
        (await message.guild.members.fetch(target.id).catch(() => null));
      const authorName = member?.displayName || target.globalName || target.username;
      const avatarUrl =
        target.displayAvatarURL({ size: 256 }) || "https://disboard.org/images/no-icon.png";
      const ts = Math.floor(Date.now() / 1000);
      const reviewEmbed = new EmbedBuilder()
        .setColor("#6f4e37")
        .setAuthor({
          name: `Nuova recensione da ${authorName}`,
          iconURL: avatarUrl,
          url: reviewPageUrl,
        })
        .setTitle("Valutazione DISBOARD")
        .setURL(reviewPageUrl)
        .setThumbnail(avatarUrl)
        .setDescription(
          `**Valutazione:** ${"⭐".repeat(5)}\n\n> Recensione registrata dallo staff dopo verifica su DISBOARD.`,
        )
        .addFields(
          {
            name: "<:VC_Dot:1482532364222595303> Info",
            value: `<:VC_bump:1482531857521311885> Registrata: **<t:${ts}:F>**`,
            inline: true,
          },
          {
            name: "<:VC_Dot:1482532364222595303> Link",
            value: `[Vai alla recensione](<${reviewPageUrl}>)`,
            inline: true,
          },
          {
            name: "<:VC_LevelUp2:1482527047871107143> Ricompensa Automatica",
            value: `<a:VC_StarPink:1330194976440848500> Grazie **<@${target.id}>**, ti sono stati assegnati **+5 livelli** per il tuo supporto!`,
            inline: false,
          },
        )
        .setFooter({
          text: ".gg/viniliecaffe ⭑.ᐟ 💞 Grazie mille!",
          iconURL: message.client.user.displayAvatarURL(),
        })
        .setTimestamp();

      await reviewChannel
        .send({ content: `${target}`, embeds: [reviewEmbed] })
        .catch(() => {});
    }

    const done = new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<:vegacheckmark:1443666279058772028> Recensione Registrata")
      .setDescription(`Ho assegnato la ricompensa recensione a ${target}.`)
      .addFields(
        { name: "Livello", value: `\`${currentLevel}\` -> \`${finalLevel}\``, inline: true },
        { name: "EXP Aggiunta", value: `\`+${addedExp}\``, inline: true },
        { name: "Ricompensa", value: `\`+${LEVELS_TO_ADD} livelli\``, inline: true },
      )
      .setThumbnail(target.displayAvatarURL({ size: 256 }));

    await safeMessageReply(message, {
      embeds: [done],
      allowedMentions: { repliedUser: false, users: [target.id] },
    });
  },
};