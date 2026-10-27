import type { ButtonInteraction, ModalSubmitInteraction, StringSelectMenuInteraction } from "discord.js";

export type InteractionHandler = {
  name: string;
  match: (interaction: ButtonInteraction | ModalSubmitInteraction | StringSelectMenuInteraction) => boolean;
  execute: (
    interaction: ButtonInteraction | ModalSubmitInteraction | StringSelectMenuInteraction,
  ) => Promise<void>;
};

const handlers: InteractionHandler[] = [];

export function registerInteractionHandler(handler: InteractionHandler): void {
  const i = handlers.findIndex((h) => h.name === handler.name);
  if (i >= 0) handlers[i] = handler;
  else handlers.push(handler);
}

export function listInteractionHandlers(): InteractionHandler[] {
  return [...handlers];
}

export async function dispatchInteraction(
  interaction: ButtonInteraction | ModalSubmitInteraction | StringSelectMenuInteraction,
): Promise<boolean> {
  for (const h of handlers) {
    if (!h.match(interaction)) continue;
    await h.execute(interaction);
    return true;
  }
  return false;
}
