import { PermissionFlagsBits } from "discord.js";
import { baseEmbed, replyEmbed, replyErr } from "../../../shared/embeds";
import type { PrefixCommand } from "../../prefix/types";
import { listCasesForUser } from "./modCaseStore";
import { memberHas } from "./permissions";
import { extractUserId } from "./resolveTarget";

/** Live: +info — snapshot membro (ridotto vs panel automod live). */
export const infoCommand: PrefixCommand = {
  name: "info",
  description: "Info moderazione su un membro.",
  usage: "+info [@utente|id]",
  category: "moderation",
  async execute({ message, args }) {
    if (!memberHas(message, PermissionFlagsBits.ModerateMembers)) {
      await replyErr(message, "Ti serve **Moderare i membri**.");
      return;
    }
    const guild = message.guild;
    if (!guild) return;
    const uid =
      message.mentions.users.first()?.id ||
      extractUserId(args[0]) ||
      message.author.id;
    const member =
      guild.members.cache.get(uid) || (await guild.members.fetch(uid).catch(() => null));
    if (!member) {
      await replyErr(message, "Membro non trovato.");
      return;
    }
    const user = member.user;
    const cases = listCasesForUser(guild.id, user.id);
    const timedOut = Boolean(member.communicationDisabledUntilTimestamp);
    await replyEmbed(
      message,
      baseEmbed()
        .setTitle(`Info · ${user.tag}`)
        .setThumbnail(user.displayAvatarURL({ size: 128 }))
        .setDescription(
          [
            `ID \`${user.id}\``,
            `Joined: ${member.joinedAt ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>` : "—"}`,
            `Timeout: **${timedOut ? "sì" : "no"}**`,
            `Casi in store: **${cases.length}**`,
            `Ruoli: ${member.roles.cache.filter((r) => r.id !== guild.id).size}`,
          ].join("\n"),
        ),
    );
  },
};
