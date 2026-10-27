import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction,
  type Message,
} from "discord.js";
import { logger } from "../../../shared";
import { registerInteractionHandler } from "../../interactions/registry";
import { renderSlotsPng } from "./slotsCanvas";
import { addCoins, getBalance } from "./wallet";

/** CustomId live: `slots_gui:<action>:<ownerId>` */
const PREFIX = "slots_gui";
const SYM = ["🍒", "🍋", "🔔", "⭐", "7️⃣"] as const;
const MIN_BET = 5;
const MAX_BET = 5_000;
const STEP = 5;

interface SlotsSession {
  ownerId: string;
  guildId: string;
  bet: number;
  bank: number;
  spins: number;
  lastReels: string[] | null;
  lastPayout: number;
  messageId?: string;
}

const byMessage = new Map<string, SlotsSession>();
const byOwner = new Map<string, string>(); // ownerKey → messageId

function ownerKey(guildId: string, ownerId: string): string {
  return `${guildId}:${ownerId}`;
}

function controlId(action: string, ownerId: string): string {
  return `${PREFIX}:${action}:${ownerId}`;
}

export function isSlotsGuiCustomId(customId: string): boolean {
  return String(customId || "").startsWith(`${PREFIX}:`);
}

export function parseSlotsGuiCustomId(customId: string): { action: string; ownerId: string } | null {
  const parts = String(customId || "").split(":");
  if (parts[0] !== PREFIX || parts.length < 3) return null;
  return { action: parts[1]!, ownerId: parts[2]! };
}

function clampBet(n: number, balance: number): number {
  return Math.max(MIN_BET, Math.min(MAX_BET, Math.min(balance || MAX_BET, Math.floor(n) || MIN_BET)));
}

function spinReels(): { reels: string[]; payoutMul: number } {
  const a = SYM[Math.floor(Math.random() * SYM.length)]!;
  const b = SYM[Math.floor(Math.random() * SYM.length)]!;
  const c = SYM[Math.floor(Math.random() * SYM.length)]!;
  let mul = 0;
  if (a === b && b === c) mul = a === "7️⃣" ? 10 : 5;
  else if (a === b || b === c || a === c) mul = 2;
  return { reels: [a, b, c], payoutMul: mul };
}

function buildRows(session: SlotsSession, balance: number, disabled = false): ActionRowBuilder<ButtonBuilder>[] {
  const { ownerId, bet } = session;
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(controlId("minus", ownerId))
        .setLabel(`-${STEP}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled || bet <= MIN_BET),
      new ButtonBuilder()
        .setCustomId(controlId("bet", ownerId))
        .setLabel(`Bet ${bet}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(controlId("plus", ownerId))
        .setLabel(`+${STEP}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled || bet >= Math.min(MAX_BET, Math.max(MIN_BET, balance))),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(controlId("spin", ownerId))
        .setLabel("Gira")
        .setEmoji("🎰")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(controlId("close", ownerId))
        .setLabel("Chiudi")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(disabled),
    ),
  ];
}

function panelContent(session: SlotsSession, balance: number, notice = ""): string {
  return [
    `🎰 **Slots** · puntata **${session.bet}** · banca **${session.bank}** · giri ${session.spins}`,
    `Saldo: **${balance}**`,
    notice || null,
  ]
    .filter(Boolean)
    .join("\n");
}

async function panelFile(session: SlotsSession, balance: number): Promise<AttachmentBuilder | null> {
  return renderSlotsPng({
    reels: session.lastReels || ["❔", "❔", "❔"],
    bet: session.bet,
    payout: session.lastPayout,
    win: session.lastPayout > 0,
    hasResult: Boolean(session.lastReels),
    bank: session.bank,
    balance,
  });
}

export async function openSlotsGui(message: Message, rawBet?: string): Promise<void> {
  const guild = message.guild;
  if (!guild) return;
  const balance = getBalance(guild.id, message.author.id);
  const bet = clampBet(rawBet != null ? Number(rawBet) : MIN_BET, balance);
  const session: SlotsSession = {
    ownerId: message.author.id,
    guildId: guild.id,
    bet,
    bank: 0,
    spins: 0,
    lastReels: null,
    lastPayout: 0,
  };
  const file = await panelFile(session, balance);
  const sent = await message.reply({
    content: panelContent(session, balance),
    components: buildRows(session, balance),
    files: file ? [file] : [],
    allowedMentions: { repliedUser: false },
  });
  session.messageId = sent.id;
  byMessage.set(sent.id, session);
  byOwner.set(ownerKey(guild.id, message.author.id), sent.id);
}

async function refreshPanel(interaction: ButtonInteraction, session: SlotsSession, notice = ""): Promise<void> {
  const balance = getBalance(session.guildId, session.ownerId);
  const file = await panelFile(session, balance);
  await interaction.update({
    content: panelContent(session, balance, notice),
    components: buildRows(session, balance),
    files: file ? [file] : [],
  });
}

async function handleSlotsButton(interaction: ButtonInteraction): Promise<void> {
  const parsed = parseSlotsGuiCustomId(interaction.customId);
  if (!parsed || !interaction.guild) return;
  if (interaction.user.id !== parsed.ownerId) {
    await interaction.reply({ content: "Non è la tua sessione.", ephemeral: true });
    return;
  }
  const session = byMessage.get(interaction.message.id);
  if (!session) {
    await interaction.reply({ content: "Sessione scaduta. Rilancia `+slots`.", ephemeral: true });
    return;
  }

  if (parsed.action === "close") {
    if (session.bank > 0) addCoins(session.guildId, session.ownerId, session.bank);
    byMessage.delete(interaction.message.id);
    byOwner.delete(ownerKey(session.guildId, session.ownerId));
    await interaction.update({
      content: `Slot chiusa. Banca accreditata: **${session.bank}**.`,
      components: [],
    });
    return;
  }

  if (parsed.action === "minus") {
    session.bet = clampBet(session.bet - STEP, getBalance(session.guildId, session.ownerId));
    await refreshPanel(interaction, session);
    return;
  }
  if (parsed.action === "plus") {
    session.bet = clampBet(session.bet + STEP, getBalance(session.guildId, session.ownerId));
    await refreshPanel(interaction, session);
    return;
  }
  if (parsed.action === "bet") {
    await interaction.reply({
      content: `Puntata attuale **${session.bet}**. Usa +/- (modal live TBD).`,
      ephemeral: true,
    });
    return;
  }
  if (parsed.action === "spin") {
    const bal = getBalance(session.guildId, session.ownerId);
    if (bal < session.bet) {
      await interaction.reply({ content: "Saldo insufficiente.", ephemeral: true });
      return;
    }
    addCoins(session.guildId, session.ownerId, -session.bet);
    const { reels, payoutMul } = spinReels();
    const payout = session.bet * payoutMul;
    session.lastReels = reels;
    session.lastPayout = payout;
    session.spins += 1;
    if (payout > 0) session.bank += payout;
    await refreshPanel(
      interaction,
      session,
      payout > 0 ? `🎉 +${payout} in banca sessione` : `💀 −${session.bet}`,
    );
    return;
  }
}

export function registerSlotsGuiInteractions(): void {
  registerInteractionHandler({
    name: "slotsGui",
    match: (i) => i.isButton() && isSlotsGuiCustomId(i.customId),
    execute: async (i) => {
      if (!i.isButton()) return;
      await handleSlotsButton(i);
    },
  });
  logger.info("[economy] slots GUI interactions on (customId live)");
}
