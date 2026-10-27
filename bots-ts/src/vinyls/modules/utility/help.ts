import { baseEmbed, replyEmbed, replyErr } from "../../../shared/embeds";
import { listPrefixCommands } from "../../prefix/registry";
import type { PrefixCommand } from "../../prefix/types";
import { sendHelpPanel } from "./helpNav";

export const helpCommand: PrefixCommand = {
  name: "help",
  description: "Elenco comandi (navigazione categorie).",
  usage: "+help [comando|categoria]",
  category: "utility",
  aliases: ["comandi"],
  async execute({ message, args, prefix }) {
    const all = listPrefixCommands();
    const want = String(args[0] || "")
      .trim()
      .toLowerCase();

    if (want) {
      const cmd = all.find((c) => c.name === want || (c.aliases || []).includes(want));
      if (cmd) {
        const embed = baseEmbed()
          .setTitle(`${prefix}${cmd.name}`)
          .setDescription(cmd.description)
          .addFields(
            { name: "Uso", value: `\`${cmd.usage || prefix + cmd.name}\``, inline: true },
            { name: "Categoria", value: cmd.category, inline: true },
          );
        if (cmd.aliases?.length) {
          embed.addFields({
            name: "Alias",
            value: cmd.aliases.map((a) => `\`${prefix}${a}\``).join(", "),
          });
        }
        await replyEmbed(message, embed);
        return;
      }
      const cats = [...new Set(all.map((c) => c.category))];
      if (cats.includes(want)) {
        await sendHelpPanel(message, prefix, want);
        return;
      }
      await replyErr(message, `Comando/categoria \`${want}\` non trovato.`);
      return;
    }

    await sendHelpPanel(message, prefix);
  },
};
