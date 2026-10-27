import type { Client, Message } from "discord.js";

export interface PrefixCommandContext {
  client: Client;
  message: Message;
  args: string[];
  prefix: string;
}

export interface PrefixCommand {
  name: string;
  description: string;
  usage?: string;
  category: string;
  aliases?: string[];
  execute(ctx: PrefixCommandContext): Promise<void>;
}
