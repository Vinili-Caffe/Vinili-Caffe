import { Client, GatewayIntentBits, Partials, type ClientOptions } from "discord.js";

/** Prepara libsodium per @discordjs/voice (encryption). */
export async function prepareVoiceCrypto(): Promise<void> {
  try {
    const sodium = await import("libsodium-wrappers");
    await sodium.default.ready;
  } catch {
    /* opusscript/ffmpeg path può bastare in alcuni ambienti */
  }
}

/** Client core Vinyls/Coffee. Intents: messaggi + membri + vocali (mod/music). */
export function createBotClient(overrides: Partial<ClientOptions> = {}): Client {
  const baseIntents = [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildVoiceStates,
  ];
  const extra = overrides.intents;
  const intents = extra
    ? [...baseIntents, ...(Array.isArray(extra) ? extra : [extra])]
    : baseIntents;
  const { intents: _drop, ...rest } = overrides;
  return new Client({
    intents,
    partials: [Partials.Channel, Partials.GuildMember],
    ...rest,
  });
}
