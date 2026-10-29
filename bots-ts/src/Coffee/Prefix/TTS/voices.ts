const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime") as typeof import("../../../shared/discord/replyRuntime");
const { TTS_LANGUAGE_OPTIONS } = require("../../Services/TTS/ttsLanguages") as typeof import("../../Services/TTS/ttsLanguages");
const { getUserTtsLang, hydrateUserTtsLangForUser } = require("../../Services/TTS/ttsService") as typeof import("../../Services/TTS/ttsService");
const { userAvatarUrlDynamic } = require("../../Utils/Discord/guildDiscordIdentity") as typeof import("../../Utils/Discord/guildDiscordIdentity");
const DISPLAY_LANGUAGE_CODES=["af","am","ar","az","be","bg","bn","bs","ca","ceb","co","cs","cy","da","de","el","en","en-gb","eo","es","es-mx","et","eu","fa","fi","fil","fr-ca","ga","gd","gl","gu","haw","he","hi","hr","hu","hy","id","ig","is","it","ja","jw","ka","kk","km","kn","ko","ku","ky","la","lb","lo","lt","lv","mg","mk","ml","mn","mr","ms","mt","my","ne","nl","no","pa","pl","ps","pt","pt-br","ro","ru","sd","si","sk","sl","sm","sn","so","sq","sr","st","su","sv","sw","ta","te","tg","th","tr","uk","ur","uz","vi","xh","yo","zh","zh-tw","zu",];

export = {
  name: "voices",
  allowEmptyArgs: true,
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
      .setTitle("Voices TTS 🎤")
      .setDescription(
        ["**Voci supportate**", chunks.join("\n"), "", "**Voce attualmente in uso**", `\`${current}\``].join("\n"),
      );

    await safeMessageReply(message, { embeds: [embed] });
  },
};