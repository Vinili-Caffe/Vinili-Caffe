/** Factory comandi Music twin Vinili/Caffè (controllo coda). */
const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { safeMessageReply } = require("../../discord/replyRuntime") as typeof import("../../discord/replyRuntime");
const music = require("../services/lavalinkMusicService") as typeof import("../services/lavalinkMusicService");

const { E } = require("../../emojis/emojiCatalog") as typeof import("../../emojis/emojiCatalog");
function profileOf(opts: Record<string, any> = {}) {
  const prefix = String(opts.prefix || "+");
  const coffee = Boolean(opts.coffee);
  return {
    prefix,
    coffee,
    err(msg?) {
      if (coffee) return `${E.VC_Cross} ${msg}`;
      return `**${msg}**`;
    },
  };
}

async function replyOk(message?, description?) {
  const embed = new EmbedBuilder().setColor(0x2ecc71).setDescription(String(description || ""));
  await safeMessageReply(message, {
    embeds: [embed],
    allowedMentions: { repliedUser: false, users: message?.author?.id ? [message.author.id] : undefined },
  }).catch(() => null);
}

async function replyErr(message?, description?) {
  const embed = new EmbedBuilder().setColor(0xff0000).setDescription(String(description || ""));
  await safeMessageReply(message, {
    embeds: [embed],
    allowedMentions: { repliedUser: false },
  }).catch(() => null);
}

function createSkipCommand(opts: Record<string, any> = {}) {
  const p = profileOf(opts);
  return {
    name: "skip",
    description: p.coffee
      ? "Salta il brano in riproduzione e passa alla successiva in coda."
      : "Salta la traccia in riproduzione e passa alla successiva in coda.",
    usage: `${p.prefix}skip`,
    examples: [`${p.prefix}skip`],
    async execute(message?) {
      const result: any = await music.skipGuild(message);
      if (result.ok && typeof result.embedDescription === "string" && result.embedDescription.trim()) {
        await replyOk(
          message,
          p.coffee ? "**Il brano in riproduzione è stato saltato** 🔄" : result.embedDescription.trim(),
        );
        return;
      }
      await replyErr(message, p.err(result.message));
    },
  };
}

function createStopCommand(opts: Record<string, any> = {}) {
  const p = profileOf(opts);
  return {
    name: "stop",
    description: p.coffee ? "Ferma la musica e svuota la coda." : "Ferma la riproduzione e svuota la coda.",
    usage: `${p.prefix}stop`,
    examples: [`${p.prefix}stop`],
    async execute(message?) {
      const result: any = await music.stopGuild(message);
      if (result.ok) {
        await replyOk(
          message,
          p.coffee
            ? "**Musica fermata** ⏹️"
            : typeof result.embedDescription === "string" && result.embedDescription.trim()
              ? result.embedDescription.trim()
              : String(result.message || "Musica fermata."),
        );
        return;
      }
      await replyErr(message, p.err(result.message));
    },
  };
}

function createPauseCommand(opts: Record<string, any> = {}) {
  const p = profileOf(opts);
  return {
    name: "pause",
    description: p.coffee ? "Mette in pausa il brano in riproduzione." : "Mette in pausa la traccia in riproduzione.",
    usage: `${p.prefix}pause`,
    examples: [`${p.prefix}pause`],
    async execute(message?) {
      const result: any = await music.pauseGuildTrack(message);
      if (result.ok) {
        await replyOk(
          message,
          p.coffee
            ? `**La traccia è stata messa in pausa** a **${result.positionLabel}**`
            : `Traccia messa in pausa a **${result.positionLabel}** ⏸️`,
        );
        return;
      }
      await replyErr(message, p.coffee ? `**${result.message}**` : p.err(result.message));
    },
  };
}

function createResumeCommand(opts: Record<string, any> = {}) {
  const p = profileOf(opts);
  return {
    name: "resume",
    description: "Riprende la riproduzione in pausa.",
    usage: `${p.prefix}resume`,
    examples: [`${p.prefix}resume`],
    async execute(message?) {
      const result: any = await music.resumeGuildTrack(message);
      if (result.ok) {
        await replyOk(
          message,
          p.coffee
            ? `**Riproduzione ripresa** da **${result.positionLabel}**`
            : `Riproduzione ripresa da **${result.positionLabel}** ▶️`,
        );
        return;
      }
      await replyErr(message, p.coffee ? `**${result.message}**` : p.err(result.message));
    },
  };
}

function createShuffleCommand(opts: Record<string, any> = {}) {
  const p = profileOf(opts);
  return {
    name: "shuffle",
    description: "Mescola la coda.",
    usage: `${p.prefix}shuffle`,
    examples: [`${p.prefix}shuffle`],
    async execute(message?) {
      const result: any = await music.shuffleGuildQueue(message);
      if (result.ok) {
        await replyOk(message, p.coffee ? "**Coda mescolata** 🔀" : String(result.message || "Coda mescolata."));
        return;
      }
      await replyErr(message, p.err(result.message));
    },
  };
}

function createClearCommand(opts: Record<string, any> = {}) {
  const p = profileOf(opts);
  return {
    name: "clear",
    description: "Svuota la coda mantenendo il brano attuale.",
    usage: `${p.prefix}clear`,
    examples: [`${p.prefix}clear`],
    async execute(message?) {
      const result: any = await music.clearGuildQueue(message);
      if (result.ok) {
        await replyOk(message, p.coffee ? "**Coda svuotata** 🧹" : String(result.message || "Coda svuotata."));
        return;
      }
      await replyErr(message, p.err(result.message));
    },
  };
}

function createRepeatCommand(opts: Record<string, any> = {}) {
  const p = profileOf(opts);
  return {
    name: "repeat",
    description: "Attiva/disattiva il repeat della traccia.",
    usage: `${p.prefix}repeat`,
    examples: [`${p.prefix}repeat`],
    async execute(message?) {
      const result: any = await music.toggleRepeatOneGuild(message);
      if (result.ok) {
        await replyOk(message, String(result.message || (result.enabled ? "Repeat on" : "Repeat off")));
        return;
      }
      await replyErr(message, p.err(result.message));
    },
  };
}

function createRestartCommand(opts: Record<string, any> = {}) {
  const p = profileOf(opts);
  return {
    name: "restart",
    description: "Riavvia la coda dall'inizio.",
    usage: `${p.prefix}restart`,
    examples: [`${p.prefix}restart`],
    async execute(message?) {
      const result: any = await music.restartQueueGuild(message);
      if (result.ok) {
        await replyOk(message, String(result.message || "Coda riavviata."));
        return;
      }
      await replyErr(message, p.err(result.message));
    },
  };
}

function createRewindCommand(opts: Record<string, any> = {}) {
  const p = profileOf(opts);
  return {
    name: "rewind",
    description: "Riavvolge la traccia corrente.",
    usage: `${p.prefix}rewind`,
    examples: [`${p.prefix}rewind`],
    async execute(message?) {
      const result: any = await music.rewindGuildTrack(message);
      if (result.ok) {
        await replyOk(message, String(result.message || result.embedDescription || "Rewind ok."));
        return;
      }
      await replyErr(message, p.err(result.message));
    },
  };
}

function createVolumeCommand(opts: Record<string, any> = {}) {
  const p = profileOf(opts);
  return {
    name: "volume",
    args: true,
    description: "Imposta il volume della musica.",
    usage: p.coffee ? `${p.prefix}volume <0-100>` : `${p.prefix}volume <volume>`,
    examples: [`${p.prefix}volume 35`, `${p.prefix}volume 75`],
    async execute(message?, args?) {
      const raw = Array.isArray(args) ? args[0] : "";
      const result: any = await music.setGuildMusicVolume(message.client, message.guild, raw, message.author.id);
      if (result.ok) {
        await replyOk(message, `🔊 Il volume è stato impostato a **${result.volumePercent}**`);
        return;
      }
      await replyErr(message, p.err(result.message));
    },
  };
}

function buildMusicControlCommands(opts: Record<string, any> = {}) {
  return [
    createSkipCommand(opts),
    createStopCommand(opts),
    createPauseCommand(opts),
    createResumeCommand(opts),
    createShuffleCommand(opts),
    createClearCommand(opts),
    createRepeatCommand(opts),
    createRestartCommand(opts),
    createRewindCommand(opts),
    createVolumeCommand(opts),
  ];
}

export = {
  createSkipCommand,
  createStopCommand,
  createPauseCommand,
  createResumeCommand,
  createShuffleCommand,
  createClearCommand,
  createRepeatCommand,
  createRestartCommand,
  createRewindCommand,
  createVolumeCommand,
  buildMusicControlCommands,
};
