import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction,
  type Message,
} from "discord.js";
import { logger } from "../../../shared";
import { registerInteractionHandler } from "../../interactions/registry";
import { addCoins, getBalance } from "./wallet";

/**
 * Panel GUI testo per giochi Keep — customId allineati al live (`*_gui:action:ownerId`).
 * Canvas GIF 1:1 resta deepen successivo.
 */

type GuiKind = "rps" | "coinflip" | "roulette" | "blackjack" | "scratch" | "tris";

interface GuiSession {
  kind: GuiKind;
  ownerId: string;
  guildId: string;
  bet: number;
  extra?: Record<string, unknown>;
}

const sessions = new Map<string, GuiSession>();

const PREFIX: Record<GuiKind, string> = {
  rps: "rps_gui",
  coinflip: "coinflip_gui",
  roulette: "roulette_gui",
  blackjack: "blackjack_gui",
  scratch: "scratch_gui",
  tris: "tris_gui",
};

function cid(kind: GuiKind, action: string, ownerId: string): string {
  return `${PREFIX[kind]}:${action}:${ownerId}`;
}

function parse(customId: string): { kind: GuiKind; action: string; ownerId: string } | null {
  for (const kind of Object.keys(PREFIX) as GuiKind[]) {
    const p = PREFIX[kind];
    if (!customId.startsWith(`${p}:`)) continue;
    const parts = customId.split(":");
    if (parts.length < 3) return null;
    return { kind, action: parts[1]!, ownerId: parts[2]! };
  }
  return null;
}

async function open(
  message: Message,
  kind: GuiKind,
  bet: number,
  content: string,
  buttons: Array<{ action: string; label: string; style?: ButtonStyle }>,
): Promise<void> {
  if (!message.guild) return;
  const ownerId = message.author.id;
  const session: GuiSession = { kind, ownerId, guildId: message.guild.id, bet };
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...buttons.slice(0, 5).map((b) =>
      new ButtonBuilder()
        .setCustomId(cid(kind, b.action, ownerId))
        .setLabel(b.label)
        .setStyle(b.style ?? ButtonStyle.Primary),
    ),
  );
  const sent = await message.reply({
    content: `${content}\n_Puntata **${bet}** · saldo **${getBalance(message.guild.id, ownerId)}**_`,
    components: [row],
    allowedMentions: { repliedUser: false },
  });
  sessions.set(sent.id, session);
}

function take(guildId: string, userId: string, bet: number): string | null {
  if (getBalance(guildId, userId) < bet) return "Saldo insufficiente.";
  addCoins(guildId, userId, -bet);
  return null;
}

export async function openRpsGui(message: Message, bet: number): Promise<void> {
  await open(message, "rps", bet, "✊ **RPS** — scegli", [
    { action: "rock", label: "Sasso" },
    { action: "paper", label: "Carta" },
    { action: "scissors", label: "Forbici" },
  ]);
}

export async function openCoinflipGui(message: Message, bet: number): Promise<void> {
  await open(message, "coinflip", bet, "🪙 **Coinflip**", [
    { action: "heads", label: "Testa" },
    { action: "tails", label: "Croce" },
  ]);
}

export async function openRouletteGui(message: Message, bet: number): Promise<void> {
  await open(message, "roulette", bet, "🎡 **Roulette**", [
    { action: "rosso", label: "Rosso", style: ButtonStyle.Danger },
    { action: "nero", label: "Nero", style: ButtonStyle.Secondary },
    { action: "verde", label: "Verde", style: ButtonStyle.Success },
  ]);
}

export async function openBlackjackGui(message: Message, bet: number): Promise<void> {
  await open(message, "blackjack", bet, "🃏 **Blackjack** (hit/stand semplificato)", [
    { action: "hit", label: "Hit" },
    { action: "stand", label: "Stand" },
  ]);
}

export async function openScratchGui(message: Message, bet: number): Promise<void> {
  await open(message, "scratch", bet, "🎫 **Scratch**", [
    { action: "scratch", label: "Gratta" },
  ]);
}

export async function openTrisGui(message: Message, bet: number): Promise<void> {
  await open(message, "tris", bet, "⭕ **Tris** vs bot", [
    { action: "0", label: "1" },
    { action: "1", label: "2" },
    { action: "2", label: "3" },
    { action: "4", label: "5" },
    { action: "8", label: "9" },
  ]);
}

async function finish(interaction: ButtonInteraction, text: string): Promise<void> {
  sessions.delete(interaction.message.id);
  await interaction.update({ content: text, components: [] });
}

async function handle(interaction: ButtonInteraction): Promise<void> {
  const parsed = parse(interaction.customId);
  if (!parsed || !interaction.guild) return;
  if (interaction.user.id !== parsed.ownerId) {
    await interaction.reply({ content: "Non è la tua partita.", ephemeral: true });
    return;
  }
  const session = sessions.get(interaction.message.id);
  if (!session) {
    await interaction.reply({ content: "Sessione scaduta.", ephemeral: true });
    return;
  }
  const err = take(session.guildId, session.ownerId, session.bet);
  if (err) {
    await interaction.reply({ content: err, ephemeral: true });
    return;
  }

  const { kind, action } = parsed;
  const bet = session.bet;

  if (kind === "rps") {
    const map: Record<string, string> = { rock: "sasso", paper: "carta", scissors: "forbici" };
    const you = map[action] || action;
    const opts = ["sasso", "carta", "forbici"];
    const bot = opts[Math.floor(Math.random() * 3)]!;
    let win = 0;
    if (you === bot) win = bet;
    else if (
      (you === "sasso" && bot === "forbici") ||
      (you === "carta" && bot === "sasso") ||
      (you === "forbici" && bot === "carta")
    ) {
      win = bet * 2;
    }
    if (win) addCoins(session.guildId, session.ownerId, win);
    await finish(
      interaction,
      `RPS: tu **${you}** vs **${bot}** → ${win > bet ? `+${win}` : win === bet ? "pareggio" : `−${bet}`} · saldo **${getBalance(session.guildId, session.ownerId)}**`,
    );
    return;
  }

  if (kind === "coinflip") {
    const side = Math.random() < 0.5 ? "heads" : "tails";
    const win = side === action ? bet * 2 : 0;
    if (win) addCoins(session.guildId, session.ownerId, win);
    await finish(
      interaction,
      `Moneta: **${side === "heads" ? "testa" : "croce"}** → ${win ? `+${win}` : `−${bet}`} · saldo **${getBalance(session.guildId, session.ownerId)}**`,
    );
    return;
  }

  if (kind === "roulette") {
    const roll = Math.floor(Math.random() * 37);
    const color = roll === 0 ? "verde" : roll % 2 === 0 ? "nero" : "rosso";
    let mul = 0;
    if (action === color) mul = color === "verde" ? 14 : 2;
    const win = bet * mul;
    if (win) addCoins(session.guildId, session.ownerId, win);
    await finish(
      interaction,
      `Roulette: **${roll}** (${color}) · scelta **${action}** → ${win ? `+${win}` : `−${bet}`} · saldo **${getBalance(session.guildId, session.ownerId)}**`,
    );
    return;
  }

  if (kind === "blackjack") {
    const draw = () => 2 + Math.floor(Math.random() * 10);
    let player = draw() + draw();
    let dealer = draw() + draw();
    if (action === "hit") player += draw();
    while (dealer < 17) dealer += draw();
    let win = 0;
    if (player <= 21 && (dealer > 21 || player > dealer)) win = bet * 2;
    else if (player === dealer && player <= 21) win = bet;
    if (win) addCoins(session.guildId, session.ownerId, win);
    await finish(
      interaction,
      `BJ: tu **${player}** vs dealer **${dealer}** → ${win > bet ? `+${win}` : win === bet ? "push" : `−${bet}`} · saldo **${getBalance(session.guildId, session.ownerId)}**`,
    );
    return;
  }

  if (kind === "scratch") {
    const win = Math.random() < 0.3 ? bet * (1 + Math.floor(Math.random() * 5)) : 0;
    if (win) addCoins(session.guildId, session.ownerId, win);
    await finish(
      interaction,
      `Scratch → ${win ? `+${win}` : `−${bet}`} · saldo **${getBalance(session.guildId, session.ownerId)}**`,
    );
    return;
  }

  if (kind === "tris") {
    const win = Math.random() < 0.45 ? bet * 2 : 0;
    if (win) addCoins(session.guildId, session.ownerId, win);
    await finish(
      interaction,
      `Tris cella **${action}** → ${win ? "vinto" : "perso"} · saldo **${getBalance(session.guildId, session.ownerId)}**`,
    );
  }
}

export function registerSimpleGuiInteractions(): void {
  registerInteractionHandler({
    name: "economySimpleGuis",
    match: (i) => i.isButton() && Boolean(parse(i.customId)),
    execute: async (i) => {
      if (!i.isButton()) return;
      await handle(i);
    },
  });
  logger.info("[economy] rps/coinflip/roulette/blackjack/scratch/tris GUI on");
}
