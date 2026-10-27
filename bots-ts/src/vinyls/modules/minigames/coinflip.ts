import type { PrefixCommand } from "../../prefix/types";
import { openCoinflipGui } from "../economy/simpleGuis";

export const coinflipCommand: PrefixCommand = {
  name: "coinflip",
  description: "Testa o croce (GUI).",
  usage: "+coinflip [importo]",
  category: "minigames",
  aliases: ["cf", "flip"],
  async execute({ message, args }) {
    if (!message.guild) return;
    const bet = Math.max(1, Math.floor(Number(args.find((a) => /^\d+$/.test(a)) || 50)));
    await openCoinflipGui(message, Math.min(50_000, bet));
  },
};
