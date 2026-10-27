import { baseEmbed, replyEmbed, replyErr } from "../../../shared/embeds";
import type { PrefixCommand } from "../../prefix/types";
import { extractUserId } from "../moderation/resolveTarget";
import { getGuildMessageCount } from "./counters";
import {
  getLevelInfo,
  getUserExpStats,
  getUserRank,
  listTopExp,
  MESSAGE_EXP,
  VOICE_EXP_PER_MINUTE,
} from "./exp";

async function resolveUserId(
  message: import("discord.js").Message,
  args: string[],
): Promise<string> {
  const fromArg = extractUserId(args[0]);
  if (fromArg) return fromArg;
  return message.author.id;
}

export const rankCommand: PrefixCommand = {
  name: "rank",
  description: "Livello / EXP (store TS isolato).",
  usage: "+rank [@utente]",
  category: "level",
  aliases: ["r"],
  async execute({ message, args }) {
    const guild = message.guild;
    if (!guild) return;
    const userId = await resolveUserId(message, args);
    const user =
      userId === message.author.id
        ? message.author
        : await message.client.users.fetch(userId).catch(() => null);
    if (!user) {
      await replyErr(message, "Utente non trovato.");
      return;
    }
    let st = getUserExpStats(guild.id, userId);
    try {
      const { tryReadLiveUserExp } = await import("../../../shared/liveMongo.js");
      const live = await tryReadLiveUserExp(guild.id, userId);
      if (live && live.totalExp > st.totalExp) {
        st = {
          guildId: guild.id,
          userId,
          totalExp: live.totalExp,
          messages: live.messages || st.messages,
          voiceMinutes: live.voiceMinutes || st.voiceMinutes,
        };
      }
    } catch {
      /* ignore */
    }
    const info = getLevelInfo(st.totalExp);
    const rank = getUserRank(guild.id, userId);
    const filled = Math.round(info.progressPercent / 10);
    const bar = `${"█".repeat(filled)}${"░".repeat(10 - filled)}`;
    const top = listTopExp(guild.id, 3);
    const near =
      top.length > 0
        ? top
            .map((s, i) => {
              const lv = getLevelInfo(s.totalExp).level;
              const mark = s.userId === userId ? " ←" : "";
              return `\`${i + 1}.\` <@${s.userId}> Lv ${lv}${mark}`;
            })
            .join("\n")
        : "_nessuno_";
    const { renderRankCard } = await import("./rankCanvas.js");
    const card = await renderRankCard({
      tag: user.tag,
      avatarUrl: user.displayAvatarURL({ extension: "png", size: 256 }),
      level: info.level,
      rank: rank || 0,
      totalExp: info.totalExp,
      nextThreshold: info.nextThreshold,
      progressPercent: info.progressPercent,
      messages: st.messages,
      voiceMinutes: st.voiceMinutes,
    });
    const embed = baseEmbed()
      .setTitle(`Rank · ${user.tag}`)
      .setDescription(
        [
          `**Livello** ${info.level} · **#${rank || "—"}** · \`${bar}\` ${info.progressPercent}%`,
          `EXP **${info.totalExp}** → **${info.nextThreshold}** (−${info.remainingToNext})`,
          `_Gain: ${MESSAGE_EXP}/msg · ${VOICE_EXP_PER_MINUTE}/min voce_`,
          "",
          "**Top 3**",
          near,
        ].join("\n"),
      );
    if (card) {
      embed.setImage("attachment://rank.png");
      await message.reply({ embeds: [embed], files: [card], allowedMentions: { repliedUser: false } });
    } else {
      embed.setThumbnail(user.displayAvatarURL({ size: 128 }));
      await replyEmbed(message, embed);
    }
  },
};

export const mstatsCommand: PrefixCommand = {
  name: "mstats",
  description: "Stats attività messaggi guild (contatore TS).",
  usage: "+mstats",
  category: "level",
  async execute({ message }) {
    const guild = message.guild;
    if (!guild) return;
    const top = listTopExp(guild.id, 5);
    const lines =
      top.length === 0
        ? "_Nessun EXP ancora._"
        : top
            .map((s, i) => {
              const lv = getLevelInfo(s.totalExp).level;
              return `**${i + 1}.** <@${s.userId}> — Lv ${lv} · ${s.totalExp} EXP`;
            })
            .join("\n");
    await replyEmbed(
      message,
      baseEmbed()
        .setTitle(`Activity · ${guild.name}`)
        .setDescription(
          [
            `Messaggi guild (sessione): **${getGuildMessageCount(guild.id)}**`,
            "",
            "**Top EXP (TS)**",
            lines,
          ].join("\n"),
        ),
    );
  },
};
