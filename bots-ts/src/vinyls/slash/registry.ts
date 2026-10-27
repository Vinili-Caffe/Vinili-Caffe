import type {
  ChatInputCommandInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord.js";

export type SlashCommand = {
  data: RESTPostAPIChatInputApplicationCommandsJSONBody;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
};

const byName = new Map<string, SlashCommand>();

export function registerSlashCommand(cmd: SlashCommand): void {
  byName.set(cmd.data.name, cmd);
}

export function listSlashCommands(): SlashCommand[] {
  return [...byName.values()];
}

export function getSlashCommand(name: string): SlashCommand | undefined {
  return byName.get(name);
}
