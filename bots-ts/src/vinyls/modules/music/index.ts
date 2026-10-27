import type { Client } from "discord.js";
import { logger } from "../../../shared";
import { registerPrefixCommand } from "../../prefix/registry";
import {
  clearCommand,
  nextCommand,
  nowCommand,
  pauseCommand,
  playCommand,
  previousCommand,
  queueCommand,
  repeatCommand,
  requestedCommand,
  restartCommand,
  resumeCommand,
  rewindCommand,
  shuffleCommand,
  skipCommand,
  stopCommand,
  upcomingCommand,
  volumeCommand,
} from "./commands";
import { initLavalinkStub, markVoiceReady, wantShoukakuConnect } from "./lavalink";
import { lyricsCommand } from "./lyrics";
import { initShoukaku, isVoicePlayerReady } from "./player";

export async function registerMusicModule(client?: Client): Promise<void> {
  await initLavalinkStub();
  registerPrefixCommand(playCommand);
  registerPrefixCommand(skipCommand);
  registerPrefixCommand(stopCommand);
  registerPrefixCommand(nowCommand);
  registerPrefixCommand(queueCommand);
  registerPrefixCommand(pauseCommand);
  registerPrefixCommand(resumeCommand);
  registerPrefixCommand(volumeCommand);
  registerPrefixCommand(shuffleCommand);
  registerPrefixCommand(clearCommand);
  registerPrefixCommand(nextCommand);
  registerPrefixCommand(previousCommand);
  registerPrefixCommand(repeatCommand);
  registerPrefixCommand(rewindCommand);
  registerPrefixCommand(restartCommand);
  registerPrefixCommand(requestedCommand);
  registerPrefixCommand(upcomingCommand);
  registerPrefixCommand(lyricsCommand);

  if (client && wantShoukakuConnect()) {
    const boot = () => {
      initShoukaku(client);
      // poll breve: node ready async
      const t = setInterval(() => {
        if (isVoicePlayerReady()) {
          markVoiceReady(true);
          logger.info("[music] voice player ready");
          clearInterval(t);
        }
      }, 500);
      t.unref?.();
      setTimeout(() => clearInterval(t), 30_000).unref?.();
    };
    if (client.isReady()) boot();
    else client.once("clientReady", boot);
  }
}
