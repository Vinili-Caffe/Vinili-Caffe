import { replyErr, replyOk } from "../../shared/embeds";
import { registerPrefixCommand } from "../prefix/registry";
import type { PrefixCommand } from "../prefix/types";

/**
 * Prefix Event live (registrati solo se il plugin è enabled).
 * Nomi: punta, ordine66, conquista, ship, swspawn — niente inventati.
 */

function eventShell(name: string, usage: string, description: string, plugin: string): PrefixCommand {
  return {
    name,
    description,
    usage,
    category: "event",
    async execute({ message, args }) {
      await replyOk(
        message,
        `Event \`${name}\` (${plugin}): args=\`${args.join(" ").slice(0, 80) || "—"}\` — logica service live TBD in TS; comando registrato 1:1.`,
      );
    },
  };
}

export function registerStarWarsEventCommands(): void {
  registerPrefixCommand(eventShell("punta", "+punta <corridore> <importo>", "Punta crediti podracer.", "starwars"));
  registerPrefixCommand({
    name: "ordine66",
    description: "Minigioco Ordine 66.",
    usage: "+ordine66",
    category: "event",
    async execute({ message }) {
      await replyOk(message, "Event `ordine66` (starwars) — shell TS.");
    },
  });
  registerPrefixCommand({
    name: "conquista",
    description: "Minigioco conquista SW.",
    usage: "+conquista",
    category: "event",
    async execute({ message }) {
      await replyOk(message, "Event `conquista` (starwars) — shell TS.");
    },
  });
  registerPrefixCommand({
    name: "swspawn",
    description: "Spawn minigioco SW.",
    usage: "+swspawn",
    category: "event",
    async execute({ message }) {
      await replyOk(message, "Event `swspawn` (starwars) — shell TS.");
    },
  });
}

export function registerShipEventCommand(): void {
  registerPrefixCommand({
    name: "ship",
    description: "Ship due utenti (Event/Later — canvas live TBD).",
    usage: "+ship <@a> <@b>",
    category: "event",
    async execute({ message }) {
      const a = message.mentions.users.at(0);
      const b = message.mentions.users.at(1) || message.author;
      if (!a) {
        await replyErr(message, "Uso: `+ship <@utente> [@utente]`");
        return;
      }
      const score = Math.floor(Math.random() * 101);
      await replyOk(message, `💕 **${a.username}** × **${b.username}**: **${score}%** _(canvas GIF Later)_`);
    },
  });
}

export function registerHalloweenEventCommands(): void {
  // Live halloween è soprattutto service (candy/emoji) — nessun prefix candy inventato.
  // Se in futuro esistono prefix live, registrarli qui 1:1.
}
