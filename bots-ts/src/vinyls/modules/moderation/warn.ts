import { PermissionFlagsBits } from "discord.js";
import { baseEmbed, replyEmbed, replyErr, replyOk } from "../../../shared/embeds";
import type { PrefixCommand } from "../../prefix/types";
import { memberHas } from "./permissions";
import { recordModAction } from "./record";
import { extractUserId, resolveTargetMember } from "./resolveTarget";
import { clearWarns, listWarns } from "./warnStore";

function stripTarget(args: string[]): string {
  const rest = extractUserId(args[0]) ? args.slice(1) : args.filter((a) => !/^<@!?\d+>$/.test(a));
  return rest.join(" ").trim() || "Nessun motivo specificato";
}

export const warnCommand: PrefixCommand = {
  name: "warn",
  description: "Avverte un utente (ModCase + modlog).",
  usage: "+warn <@utente|id> [motivo]",
  category: "moderation",
  async execute({ message, args }) {
    if (!memberHas(message, PermissionFlagsBits.ModerateMembers)) {
      await replyErr(message, "Ti serve il permesso **Moderare i membri**.");
      return;
    }
    const guild = message.guild;
    if (!guild) {
      await replyErr(message, "Comando solo in server.");
      return;
    }
    const target = await resolveTargetMember(message, args);
    if ("error" in target) {
      await replyErr(message, target.error);
      return;
    }
    const reason = stripTarget(args);
    const entry = await recordModAction(message, {
      type: "warn",
      userId: target.user.id,
      reason,
      targetTag: target.user.tag,
    });
    const total = listWarns(guild.id, target.user.id).length;
    await replyOk(
      message,
      `Warn a **${target.user.tag}** (\`${entry.id}\`). Totale: **${total}**.\nMotivo: ${reason}`,
    );
  },
};

export const warningsCommand: PrefixCommand = {
  name: "warnings",
  description: "Elenca i warn di un utente.",
  usage: "+warnings <@utente|id>",
  category: "moderation",
  aliases: ["warns"],
  async execute({ message, args }) {
    if (!memberHas(message, PermissionFlagsBits.ModerateMembers)) {
      await replyErr(message, "Ti serve il permesso **Moderare i membri**.");
      return;
    }
    const guild = message.guild;
    if (!guild) {
      await replyErr(message, "Comando solo in server.");
      return;
    }
    const target = await resolveTargetMember(message, args);
    if ("error" in target) {
      await replyErr(message, target.error);
      return;
    }
    const list = listWarns(guild.id, target.user.id);
    if (!list.length) {
      await replyOk(message, `Nessun warn per **${target.user.tag}**.`);
      return;
    }
    const lines = list
      .slice(-15)
      .map((w, i) => `**${i + 1}.** \`${w.id}\` — ${w.reason} (<t:${Math.floor(w.at / 1000)}:R>)`)
      .join("\n");
    await replyEmbed(
      message,
      baseEmbed().setTitle(`Warn · ${target.user.tag}`).setDescription(lines),
    );
  },
};

export const clearwarnCommand: PrefixCommand = {
  name: "clearwarn",
  description: "Cancella tutti i warn di un utente (store locale).",
  usage: "+clearwarn <@utente|id>",
  category: "moderation",
  aliases: ["clearwarns"],
  async execute({ message, args }) {
    if (!memberHas(message, PermissionFlagsBits.ModerateMembers)) {
      await replyErr(message, "Ti serve il permesso **Moderare i membri**.");
      return;
    }
    const guild = message.guild;
    if (!guild) {
      await replyErr(message, "Comando solo in server.");
      return;
    }
    const target = await resolveTargetMember(message, args);
    if ("error" in target) {
      await replyErr(message, target.error);
      return;
    }
    const n = clearWarns(guild.id, target.user.id);
    await replyOk(message, `Rimossi **${n}** warn da **${target.user.tag}**.`);
  },
};
