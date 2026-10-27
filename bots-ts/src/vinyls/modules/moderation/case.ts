import { PermissionFlagsBits } from "discord.js";
import { baseEmbed, replyEmbed, replyErr, replyOk } from "../../../shared/embeds";
import type { PrefixCommand } from "../../prefix/types";
import { getCase, listCasesForUser, listRecentGuildCases } from "./modCaseStore";
import { memberHas } from "./permissions";
import { resolveTargetMember } from "./resolveTarget";

export const caseCommand: PrefixCommand = {
  name: "case",
  description: "Mostra un caso moderazione per id.",
  usage: "+case <id>",
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
    const id = String(args[0] || "").trim();
    if (!id) {
      await replyErr(message, "Uso: `+case <id>`");
      return;
    }
    const c = getCase(guild.id, id);
    if (!c) {
      await replyErr(message, `Caso \`${id}\` non trovato.`);
      return;
    }
    await replyEmbed(
      message,
      baseEmbed()
        .setTitle(`Caso ${c.id}`)
        .setDescription(
          [
            `**Action:** ${c.action || c.type.toUpperCase()} · active=${c.active !== false}`,
            `**User:** <@${c.userId}> (\`${c.userId}\`)`,
            `**Mod:** <@${c.moderatorId}>`,
            `**Quando:** <t:${Math.floor(c.at / 1000)}:F>`,
            c.durationMs != null ? `**Durata:** ${Math.round(c.durationMs / 1000)}s` : null,
            c.expiresAt ? `**Scade:** <t:${Math.floor(c.expiresAt / 1000)}:R>` : null,
            `**Motivo:** ${c.reason}`,
          ]
            .filter(Boolean)
            .join("\n"),
        ),
    );
  },
};

/** Live name: `modlogs` (Vinyls/Prefix/Moderation/modlogs.js). */
export const casesCommand: PrefixCommand = {
  name: "modlogs",
  description: "Elenca casi recenti (guild o utente).",
  usage: "+modlogs [@utente|id]",
  category: "moderation",
  aliases: ["cases"],
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

    if (args[0]) {
      const target = await resolveTargetMember(message, args);
      if ("error" in target) {
        await replyErr(message, target.error);
        return;
      }
      const list = listCasesForUser(guild.id, target.user.id).slice(-15);
      if (!list.length) {
        await replyOk(message, `Nessun caso per **${target.user.tag}**.`);
        return;
      }
      const lines = list
        .map((c) => `\`${c.id}\` **${c.type}** — ${c.reason} (<t:${Math.floor(c.at / 1000)}:R>)`)
        .join("\n");
      await replyEmbed(
        message,
        baseEmbed().setTitle(`Casi · ${target.user.tag}`).setDescription(lines),
      );
      return;
    }

    const list = listRecentGuildCases(guild.id, 15);
    if (!list.length) {
      await replyOk(message, "Nessun caso in memoria su questa guild.");
      return;
    }
    const lines = list
      .map(
        (c) =>
          `\`${c.id}\` **${c.type}** <@${c.userId}> — ${c.reason} (<t:${Math.floor(c.at / 1000)}:R>)`,
      )
      .join("\n");
    await replyEmbed(message, baseEmbed().setTitle("Casi recenti").setDescription(lines));
  },
};
