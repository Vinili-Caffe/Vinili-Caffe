import { PermissionFlagsBits } from "discord.js";
import { baseEmbed, replyEmbed, replyErr, replyOk } from "../../../shared/embeds";
import type { PrefixCommand } from "../../prefix/types";
import { memberHas } from "../moderation/permissions";
import { extractUserId } from "../moderation/resolveTarget";
import { getStaffPoints, listStaffLeaderboard } from "./points";

/** Nomi live Staff/* — payload semplificato finché non c’è tenant/PM runtime completo. */

export const leaderboardCommand: PrefixCommand = {
  name: "leaderboard",
  description: "Classifica punti.",
  usage: "+leaderboard",
  category: "staff",
  aliases: ["lb"],
  async execute({ message }) {
    const guild = message.guild;
    if (!guild) return;
    const list = listStaffLeaderboard(guild.id, 10);
    if (!list.length) {
      await replyOk(message, "Classifica vuota (store TS / tenant runtime TBD).");
      return;
    }
    const lines = list.map((s, i) => `**${i + 1}.** <@${s.userId}> — **${s.points}**`).join("\n");
    await replyEmbed(message, baseEmbed().setTitle("Leaderboard").setDescription(lines));
  },
};

export const historyCommand: PrefixCommand = {
  name: "history",
  description: "Storico punti utente.",
  usage: "+history [@utente]",
  category: "staff",
  async execute({ message, args }) {
    const guild = message.guild;
    if (!guild) return;
    const uid = extractUserId(args[0]) || message.author.id;
    await replyOk(message, `<@${uid}> punti: **${getStaffPoints(guild.id, uid)}**`);
  },
};

export const badgesCommand: PrefixCommand = {
  name: "badges",
  description: "Badge utente.",
  usage: "+badges [@utente]",
  category: "staff",
  async execute({ message, args }) {
    const uid = extractUserId(args[0]) || message.author.id;
    await replyOk(message, `Badge di <@${uid}>: _store TS vuoto_ (parità live TBD).`);
  },
};

export const randomCommand: PrefixCommand = {
  name: "random",
  description: "Membro random.",
  usage: "+random",
  category: "staff",
  async execute({ message }) {
    const guild = message.guild;
    if (!guild) return;
    if (!memberHas(message, PermissionFlagsBits.ModerateMembers)) {
      await replyErr(message, "Permesso insufficiente.");
      return;
    }
    const members = guild.members.cache.filter((m) => !m.user.bot);
    if (!members.size) {
      await replyErr(message, "Nessun membro in cache.");
      return;
    }
    const pick = members.random();
    await replyOk(message, `Random: **${pick?.user.tag}** (<@${pick?.id}>)`);
  },
};

export const pointsCommand: PrefixCommand = {
  name: "points",
  description: "Consulta punti PM/staff (store TS).",
  usage: "+points [@utente]",
  category: "staff",
  async execute({ message, args }) {
    const guild = message.guild;
    if (!guild) return;
    const uid = extractUserId(args[0]) || message.author.id;
    await replyOk(message, `<@${uid}> ha **${getStaffPoints(guild.id, uid)}** punti.`);
  },
};
