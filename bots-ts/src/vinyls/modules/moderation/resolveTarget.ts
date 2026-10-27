import type { GuildMember, Message, User } from "discord.js";

export function extractUserId(raw: string | undefined): string | null {
  const s = String(raw || "").trim();
  const mention = s.match(/^<@!?(\d{17,20})>$/);
  if (mention) return mention[1];
  if (/^\d{17,20}$/.test(s)) return s;
  return null;
}

export async function resolveTargetMember(
  message: Message,
  args: string[],
): Promise<{ member: GuildMember; user: User } | { error: string }> {
  const guild = message.guild;
  if (!guild) return { error: "Comando solo in server." };

  const fromMention = message.mentions.members?.first() || null;
  const fromArg = extractUserId(args[0]);
  let member = fromMention;

  if (!member && fromArg) {
    member =
      guild.members.cache.get(fromArg) ||
      (await guild.members.fetch(fromArg).catch(() => null));
  }

  if (!member) return { error: "Specifica un utente (mention o ID)." };
  if (member.id === message.author.id) return { error: "Non puoi usare questo comando su te stesso." };
  if (member.id === message.client.user?.id) return { error: "Non posso moderare me stesso." };

  const actor = message.member;
  if (!actor) return { error: "Membro autore non trovato." };

  if (member.roles.highest.position >= actor.roles.highest.position && guild.ownerId !== actor.id) {
    return { error: "Non puoi moderare qualcuno con ruolo pari o superiore al tuo." };
  }

  return { member, user: member.user };
}

export function reasonFromArgs(args: string[], startIndex = 1): string {
  const reason = args.slice(startIndex).join(" ").trim();
  return reason || "Nessun motivo specificato";
}
