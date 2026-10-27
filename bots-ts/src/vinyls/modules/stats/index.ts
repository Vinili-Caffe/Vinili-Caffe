import { baseEmbed, replyEmbed, replyOk } from "../../../shared/embeds";
import { logger } from "../../../shared";
import { registerPrefixCommand } from "../../prefix/registry";
import type { PrefixCommand } from "../../prefix/types";
import { getGuildMessageCount } from "../activity/counters";
import { getLevelInfo, getUserExpStats, getUserRank, listTopExp } from "../activity/exp";
import { extractUserId } from "../moderation/resolveTarget";

/** Live Stats/* — payload ridotto su store TS (niente panel button completo ancora). */

const meCommand: PrefixCommand = {
  name: "me",
  description: "Le tue stats attività/EXP.",
  usage: "+me",
  category: "stats",
  async execute({ message }) {
    const guild = message.guild;
    if (!guild) return;
    const st = getUserExpStats(guild.id, message.author.id);
    const info = getLevelInfo(st.totalExp);
    await replyEmbed(
      message,
      baseEmbed()
        .setTitle(`Me · ${message.author.tag}`)
        .setDescription(
          [
            `Livello **${info.level}** · rank **#${getUserRank(guild.id, message.author.id) || "—"}**`,
            `EXP **${st.totalExp}** · msg **${st.messages}** · vocali **${st.voiceMinutes}** min`,
          ].join("\n"),
        ),
    );
  },
};

const topCommand: PrefixCommand = {
  name: "top",
  description: "Top EXP guild.",
  usage: "+top",
  category: "stats",
  async execute({ message }) {
    const guild = message.guild;
    if (!guild) return;
    const top = listTopExp(guild.id, 10);
    if (!top.length) {
      await replyOk(message, "Nessun dato EXP ancora.");
      return;
    }
    const lines = top
      .map((s, i) => `**${i + 1}.** <@${s.userId}> — Lv ${getLevelInfo(s.totalExp).level} · ${s.totalExp}`)
      .join("\n");
    await replyEmbed(message, baseEmbed().setTitle("Top EXP").setDescription(lines));
  },
};

const serverCommand: PrefixCommand = {
  name: "server",
  description: "Stats server.",
  usage: "+server",
  category: "stats",
  async execute({ message }) {
    const guild = message.guild;
    if (!guild) return;
    await replyEmbed(
      message,
      baseEmbed()
        .setTitle(guild.name)
        .setDescription(
          [
            `Membri: **${guild.memberCount}**`,
            `Msg (sessione bot TS): **${getGuildMessageCount(guild.id)}**`,
            `Canali: **${guild.channels.cache.size}**`,
          ].join("\n"),
        ),
    );
  },
};

const channelCommand: PrefixCommand = {
  name: "channel",
  description: "Info canale corrente.",
  usage: "+channel",
  category: "stats",
  async execute({ message }) {
    const ch = message.channel;
    await replyOk(
      message,
      `Canale: **${"name" in ch ? ch.name : ch.id}** (\`${ch.id}\`) · tipo \`${ch.type}\``,
    );
  },
};

const membercountCommand: PrefixCommand = {
  name: "membercount",
  description: "Conteggio membri.",
  usage: "+membercount",
  category: "stats",
  async execute({ message }) {
    const guild = message.guild;
    if (!guild) return;
    await replyOk(message, `Membri: **${guild.memberCount}**`);
  },
};

const userCommand: PrefixCommand = {
  name: "user",
  description: "Info utente / EXP.",
  usage: "+user [@utente]",
  category: "stats",
  async execute({ message, args }) {
    const guild = message.guild;
    if (!guild) return;
    const uid = extractUserId(args[0]) || message.author.id;
    const user =
      uid === message.author.id
        ? message.author
        : await message.client.users.fetch(uid).catch(() => null);
    if (!user) {
      await replyOk(message, "Utente non trovato.");
      return;
    }
    const st = getUserExpStats(guild.id, uid);
    const info = getLevelInfo(st.totalExp);
    await replyEmbed(
      message,
      baseEmbed()
        .setTitle(user.tag)
        .setThumbnail(user.displayAvatarURL({ size: 128 }))
        .setDescription(
          `ID \`${user.id}\`\nLv **${info.level}** · EXP **${st.totalExp}** · rank **#${getUserRank(guild.id, uid) || "—"}**`,
        ),
    );
  },
};

export function registerStatsModule(): void {
  registerPrefixCommand(meCommand);
  registerPrefixCommand(topCommand);
  registerPrefixCommand(serverCommand);
  registerPrefixCommand(channelCommand);
  registerPrefixCommand(membercountCommand);
  registerPrefixCommand(userCommand);
  logger.info("[stats] me/top/server/channel/membercount/user on");
}
