/** Factory comandi TTS twin Vinili/Caffè (join/leave/set/voices). */
const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { getVoiceConnection } = require("@discordjs/voice") as typeof import("@discordjs/voice");
const { safeMessageReply } = require("../../discord/replyRuntime") as typeof import("../../discord/replyRuntime");
const { buildMusicBlocksTtsUserMessage } = require("../../discord/musicTtsVoiceGuard") as typeof import("../../discord/musicTtsVoiceGuard");
const { userAvatarUrlDynamic } = require("../../discord/guildDiscordIdentity") as typeof import("../../discord/guildDiscordIdentity");
const { EPHEMERAL_TTL_SHORT_MS, scheduleMessageDeletion } = require("../../utils/ephemeralMessageTtl") as typeof import("../../utils/ephemeralMessageTtl");
const { E } = require("../../emojis/emojiCatalog") as typeof import("../../emojis/emojiCatalog");
const {
  markMusicVoiceLeaveIntentional,
  getGuildMusicVoiceChannelId,
  guildMusicSessionBlocksOtherVoiceChannels,
} = require("../../music/services/lavalinkMusicService") as typeof import("../../music/services/lavalinkMusicService");
const {
  joinTtsChannel,
  leaveTtsGuild,
  setUserTtsLang,
  getUserTtsLang,
  hydrateUserTtsLangForUser,
} = require("../services/ttsService") as typeof import("../services/ttsService");
const {
  TTS_LANGUAGE_OPTIONS,
  normalizeTtsLanguageInput,
} = require("../services/ttsLanguages") as typeof import("../services/ttsLanguages");

const DISPLAY_LANGUAGE_CODES = [
  "af", "am", "ar", "az", "be", "bg", "bn", "bs", "ca", "ceb", "co", "cs", "cy", "da", "de", "el", "en",
  "en-gb", "eo", "es", "es-mx", "et", "eu", "fa", "fi", "fil", "fr-ca", "ga", "gd", "gl", "gu", "haw",
  "he", "hi", "hr", "hu", "hy", "id", "ig", "is", "it", "ja", "jw", "ka", "kk", "km", "kn", "ko", "ku",
  "ky", "la", "lb", "lo", "lt", "lv", "mg", "mk", "ml", "mn", "mr", "ms", "mt", "my", "ne", "nl", "no",
  "pa", "pl", "ps", "pt", "pt-br", "ro", "ru", "sd", "si", "sk", "sl", "sm", "sn", "so", "sq", "sr",
  "st", "su", "sv", "sw", "ta", "te", "tg", "th", "tr", "uk", "ur", "uz", "vi", "xh", "yo", "zh",
  "zh-tw", "zu",
];

function profileOf(opts: Record<string, any> = {}) {
  const prefix = String(opts.prefix || "+");
  const coffee = Boolean(opts.coffee);
  return {
    prefix,
    coffee,
    getVoiceSession: typeof opts.getVoiceSession === "function" ? opts.getVoiceSession : null,
    setVoiceSession: typeof opts.setVoiceSession === "function" ? opts.setVoiceSession : null,
    clearVoiceSession: typeof opts.clearVoiceSession === "function" ? opts.clearVoiceSession : null,
    executeLeavePartnership:
      typeof opts.executeLeavePartnership === "function" ? opts.executeLeavePartnership : null,
    cross(msg?) {
      if (coffee) return `${E.VC_Cross} ${msg}`;
      return String(msg || "");
    },
    ok(msg?) {
      if (coffee) return `${E.VC_Verified} ${msg}`;
      return `${E.vegacheckmark} ${msg}`;
    },
    bad(msg?) {
      if (coffee) return `${E.VC_Cross} ${msg}`;
      return `${E.vegax} ${msg}`;
    },
    attention(msg?) {
      if (coffee) return `${E.VC_Attention} ${msg}`;
      return String(msg || "");
    },
  };
}

function isLeaveInBotVoiceChat(message?, botChannelId?) {
  const id = String(botChannelId || "");
  if (!id || !message?.channel) return false;
  if (String(message.channel.id) === id) return true;
  if (message.channel.isThread?.() && String(message.channel.parentId || "") === id) return true;
  return false;
}

function hasActiveTtsOrMusicSession(message?, botChannelId?) {
  const gid = String(message.guild?.id || "");
  if (!gid) return false;
  if (getVoiceConnection(gid)) return true;
  const music = guildMusicSessionBlocksOtherVoiceChannels(message.client, gid);
  if (music?.blocked) return true;
  const musicVc = getGuildMusicVoiceChannelId(gid);
  if (musicVc && botChannelId && String(musicVc) === String(botChannelId)) return true;
  const shoukakuConn = message.client?.shoukaku?.connections?.get(gid);
  if (shoukakuConn?.channelId) return true;
  return false;
}

function createJoinCommand(opts: Record<string, any> = {}) {
  const p = profileOf(opts);
  return {
    name: "join",
    allowEmptyArgs: true,
    description: p.coffee
      ? "Fa entrare il bot TTS nel tuo canale vocale."
      : "Fa entrare il bot TTS nel tuo canale vocale.",
    usage: `${p.prefix}join`,
    examples: [`${p.prefix}join`],
    async execute(message?) {
      await message.channel.sendTyping();
      const voiceChannel = message.member?.voice?.channel;

      if (!voiceChannel) {
        const warnEmbed = new EmbedBuilder()
          .setColor("#ED4245")
          .setDescription(p.cross("Devi essere in un canale vocale."));
        const warn = await safeMessageReply(message, { embeds: [warnEmbed] });
        if (warn) scheduleMessageDeletion(warn, EPHEMERAL_TTL_SHORT_MS);
        return;
      }

      if (!voiceChannel.joinable) {
        const noPermEmbed = new EmbedBuilder()
          .setColor("#ED4245")
          .setDescription(p.cross("Non ho i permessi per entrare in quel canale vocale."));
        return safeMessageReply(message, { embeds: [noPermEmbed] });
      }

      const ttsResult = await joinTtsChannel(voiceChannel);
      if (!ttsResult.ok && ttsResult.reason === "music_active") {
        const musicEmbed = new EmbedBuilder()
          .setColor("#ED4245")
          .setDescription(buildMusicBlocksTtsUserMessage(ttsResult.musicChannelId, p.prefix));
        const w = await safeMessageReply(message, { embeds: [musicEmbed] });
        if (w) scheduleMessageDeletion(w, EPHEMERAL_TTL_SHORT_MS);
        return;
      }
      if (!ttsResult.ok && ttsResult.reason === "locked") {
        const lockedEmbed = new EmbedBuilder()
          .setColor("#ED4245")
          .setDescription(
            p.cross(
              `Il TTS è già attivo in un altro canale vocale. Usa \`${p.prefix}leave\` in quel vocale, poi \`${p.prefix}join\` qui.`,
            ),
          );
        const w = await safeMessageReply(message, { embeds: [lockedEmbed] });
        if (w) scheduleMessageDeletion(w, EPHEMERAL_TTL_SHORT_MS);
        return;
      }
      if (!ttsResult.ok) {
        const failedEmbed = new EmbedBuilder()
          .setColor("#ED4245")
          .setDescription(
            p.cross("Non riesco a connettermi al canale vocale in questo momento. Riprova tra qualche secondo."),
          );
        const w = await safeMessageReply(message, { embeds: [failedEmbed] });
        if (w) scheduleMessageDeletion(w, EPHEMERAL_TTL_SHORT_MS);
        return;
      }

      if (p.setVoiceSession) {
        p.setVoiceSession(message.guild?.id, {
          mode: "tts",
          channelId: voiceChannel.id,
          ownerId: message.author?.id,
        });
      }

      const okEmbed = new EmbedBuilder()
        .setColor("#57F287")
        .setDescription(p.coffee ? "🔊 Connesso al canale vocale." : "Connesso al canale vocale.");
      return safeMessageReply(message, { embeds: [okEmbed] });
    },
  };
}

function createLeaveCommand(opts: Record<string, any> = {}) {
  const p = profileOf(opts);
  return {
    name: "leave",
    allowEmptyArgs: true,
    description: p.coffee
      ? "Fa uscire il bot dal canale vocale TTS/musica."
      : "Fa uscire il bot dal canale vocale TTS/musica.",
    usage: p.executeLeavePartnership
      ? `${p.prefix}leave [partnership]`
      : `${p.prefix}leave`,
    examples: p.executeLeavePartnership
      ? [`${p.prefix}leave`, `${p.prefix}leave partnership`]
      : [`${p.prefix}leave`],
    /** `+leave partnership` è solo tenant; `+leave` vocale resta main. */
    tenantOnlySubcommands: p.executeLeavePartnership ? ["partnership"] : undefined,
    async execute(message?, args = []) {
      const sub = String(args[0] || "").toLowerCase();
      if (sub === "partnership" && p.executeLeavePartnership) {
        return p.executeLeavePartnership(message);
      }

      await message.channel.sendTyping();

      const session = p.getVoiceSession ? p.getVoiceSession(message.guild?.id) : null;
      const ownerId = session?.ownerId ? String(session.ownerId) : "";
      const botChannelId = message.guild?.members?.me?.voice?.channelId
        ? String(message.guild.members.me.voice.channelId)
        : "";

      if (botChannelId && !isLeaveInBotVoiceChat(message, botChannelId)) {
        const wrongChannel = new EmbedBuilder()
          .setColor("#ED4245")
          .setDescription(
            p.attention(
              `Usa \`${p.prefix}leave\` nel canale vocale in cui è connesso il bot: <#${botChannelId}>.`,
            ),
          );
        return safeMessageReply(message, { embeds: [wrongChannel] });
      }
      if (ownerId && botChannelId && String(message.author?.id || "") !== ownerId) {
        const ownerMember = await message.guild.members.fetch(ownerId).catch(() => null);
        const ownerInBotChannel = Boolean(
          ownerMember?.voice?.channelId && String(ownerMember.voice.channelId) === botChannelId,
        );
        if (ownerInBotChannel) {
          const denied = new EmbedBuilder()
            .setColor("#ED4245")
            .setDescription(
              p.attention(
                `Solo chi ha avviato la sessione può usare \`${p.prefix}leave\` finché è in vocale: <@${ownerId}>.`,
              ),
            );
          return safeMessageReply(message, { embeds: [denied], allowedMentions: { users: [] } });
        }
      }

      if (!hasActiveTtsOrMusicSession(message, botChannelId)) {
        if (botChannelId) {
          markMusicVoiceLeaveIntentional(message.client, message.guild.id);
          const ttsVc = getVoiceConnection(String(message.guild.id));
          if (ttsVc) ttsVc.destroy();
          const me =
            message.guild.members.me ||
            (await message.guild.members.fetch(message.client.user.id).catch(() => null));
          if (me?.voice?.channel) {
            await me.voice.setChannel(null).catch(() => null);
          }
          await leaveTtsGuild(message.guild.id, message.client);
          if (p.clearVoiceSession) p.clearVoiceSession(message.guild.id);
        }
        const notConnectedEmbed = new EmbedBuilder()
          .setColor("#ED4245")
          .setDescription(p.cross("Il bot non è connesso a nessun canale vocale."));
        return safeMessageReply(message, { embeds: [notConnectedEmbed] });
      }

      markMusicVoiceLeaveIntentional(message.client, message.guild.id);

      const wasInVoice = Boolean(botChannelId);
      const ttsVc = getVoiceConnection(String(message.guild.id));
      if (ttsVc) ttsVc.destroy();
      const me =
        message.guild.members.me ||
        (await message.guild.members.fetch(message.client.user.id).catch(() => null));
      if (me?.voice?.channel) {
        await me.voice.setChannel(null).catch(() => null);
      }

      const ttsResult = await leaveTtsGuild(message.guild.id, message.client);
      if (p.clearVoiceSession) p.clearVoiceSession(message.guild.id);

      if (!ttsResult.ok && ttsResult.reason === "not_connected" && !wasInVoice) {
        const notConnectedEmbed = new EmbedBuilder()
          .setColor("#ED4245")
          .setDescription(p.cross("Il bot non è connesso a nessun canale vocale."));
        return safeMessageReply(message, { embeds: [notConnectedEmbed] });
      }

      const okEmbed = new EmbedBuilder()
        .setColor("#ED4245")
        .setDescription(p.coffee ? "👋 Grazie per aver usato il servizio." : "Grazie per aver usato il servizio.");
      return safeMessageReply(message, { embeds: [okEmbed] });
    },
  };
}

function createSetCommand(opts: Record<string, any> = {}) {
  const p = profileOf(opts);
  return {
    name: "set",
    allowEmptyArgs: false,
    description: p.coffee
      ? "Impostazioni TTS: autojoin e voce personale."
      : "Impostazioni TTS: autojoin e voce personale.",
    usage: `${p.prefix}set <voice | autojoin> <valore>`,
    examples: [`${p.prefix}set voice it`, `${p.prefix}set autojoin on`],
    subcommands: ["voice", "autojoin"],
    subcommandDescriptions: {
      voice: "Imposta la lingua/voce TTS personale.",
      autojoin: "Attiva o disattiva l'autojoin TTS del bot.",
    },
    subcommandUsages: {
      voice: `${p.prefix}set voice <codice | reset>`,
      autojoin: `${p.prefix}set autojoin <on | off>`,
    },
    async execute(message?, args = []) {
      const sub = String(args[0] || "").toLowerCase();
      if (!sub || !["voice", "autojoin"].includes(sub)) {
        return safeMessageReply(
          message,
          p.bad(
            `Uso: \`${p.prefix}set voice <codice | reset>\` oppure \`${p.prefix}set autojoin <on | off>\`.`,
          ),
        );
      }

      if (sub === "autojoin") {
        const raw = String(args[1] || "").trim().toLowerCase();
        if (!raw) {
          return safeMessageReply(message, p.bad("Specifica `on` oppure `off`."));
        }
        const onValues = new Set(["on", "true", "1", "yes", "si", "enable", "enabled"]);
        const offValues = new Set(["off", "false", "0", "no", "disable", "disabled"]);
        if (!onValues.has(raw) && !offValues.has(raw)) {
          return safeMessageReply(message, p.bad("Valore non valido. Usa `on` oppure `off`."));
        }
        message.client.config = message.client.config || {};
        message.client.config.tts = message.client.config.tts || {};
        message.client.config.tts.autojoin = onValues.has(raw);
        return safeMessageReply(
          message,
          p.ok(`Autojoin TTS impostato su \`${onValues.has(raw) ? "attivo" : "disattivato"}\`.`),
        );
      }

      const input = String(args.slice(1).join(" ") || "").trim();
      if (!input) {
        return safeMessageReply(
          message,
          p.bad("Specifica una lingua (es: `it`) oppure `reset`."),
        );
      }
      if (["reset", "default", "off", "none"].includes(input.toLowerCase())) {
        setUserTtsLang(message.author.id, null);
        return safeMessageReply(
          message,
          p.ok(
            p.coffee
              ? "La voce TTS personale è stata resettata."
              : "Voce TTS personale resettata.",
          ),
        );
      }

      const language = normalizeTtsLanguageInput(input);
      if (!language) {
        return safeMessageReply(
          message,
          p.bad(
            p.coffee
              ? `La voce non è valida. Usa \`${p.prefix}voices\`.`
              : `Voce non valida. Usa \`${p.prefix}voices\`.`,
          ),
        );
      }

      setUserTtsLang(message.author.id, language);
      return safeMessageReply(
        message,
        p.ok(
          p.coffee
            ? `La voce TTS è stata impostata su \`${language}\`.`
            : `Voce TTS impostata su \`${language}\`.`,
        ),
      );
    },
  };
}

function createVoicesCommand(opts: Record<string, any> = {}) {
  const p = profileOf(opts);
  return {
    name: "voices",
    allowEmptyArgs: true,
    description: p.coffee
      ? "Mostra le voci TTS disponibili."
      : "Mostra le voci TTS disponibili.",
    usage: `${p.prefix}voices`,
    examples: [`${p.prefix}voices`],
    async execute(message?, _args?, client?) {
      const supportedCodes = new Set(TTS_LANGUAGE_OPTIONS.map((x?) => x.code));
      const codes = DISPLAY_LANGUAGE_CODES.filter((code?) => supportedCodes.has(code));
      await hydrateUserTtsLangForUser(message.author?.id);
      const current =
        getUserTtsLang(message.author?.id) || client?.config?.tts?.lang || "it";
      const chunks = [];
      for (let i = 0; i < codes.length; i += 24) {
        chunks.push(codes.slice(i, i + 24).map((code?) => `\`${code}\``).join(", "));
      }

      const embed = new EmbedBuilder()
        .setColor("#6f4e37")
        .setAuthor({
          name: message.author?.username || "Utente",
          iconURL: userAvatarUrlDynamic(message.author) || undefined,
        })
        .setTitle(p.coffee ? "Voices TTS 🎤" : "TTS Bot Voices | Mode: `gTTS`")
        .setDescription(
          p.coffee
            ? ["**Voci supportate**", chunks.join("\n"), "", "**Voce attualmente in uso**", `\`${current}\``].join(
                "\n",
              )
            : [
                "**Currently supported voices**",
                chunks.join("\n"),
                "",
                "**Current voice used**",
                `\`${current}\``,
              ].join("\n"),
        );

      await safeMessageReply(message, { embeds: [embed] });
    },
  };
}

function buildTtsCommands(opts: Record<string, any> = {}) {
  return [
    createJoinCommand(opts),
    createLeaveCommand(opts),
    createSetCommand(opts),
    createVoicesCommand(opts),
  ];
}

export = {
  createJoinCommand,
  createLeaveCommand,
  createSetCommand,
  createVoicesCommand,
  buildTtsCommands,
};
