import { PermissionFlagsBits, type Message } from "discord.js";

export function memberHas(
  message: Message,
  ...flags: (bigint | keyof typeof PermissionFlagsBits)[]
): boolean {
  const perms = message.member?.permissions;
  if (!perms) return false;
  for (const flag of flags) {
    const bit = typeof flag === "bigint" ? flag : PermissionFlagsBits[flag];
    if (!perms.has(bit)) return false;
  }
  return true;
}
