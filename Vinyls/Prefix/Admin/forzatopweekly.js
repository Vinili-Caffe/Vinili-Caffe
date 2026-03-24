const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { publishWeeklyActivityWinners } = require("../../Services/Community/weeklyActivityWinnersService");

module.exports = {
  name: "forzatopweekly",
  aliases: ["forza-top-weekly", "topweekly"],
  description: "Forza l'invio della classifica settimanale (NO EVENTO).",
  
  async execute(message, args = []) {
    await message.channel.sendTyping().catch(() => {});
    
    let targetChannelId = null;
    const channelMention = message.mentions.channels.first();
    if (channelMention) {
      targetChannelId = channelMention.id;
    } else if (args[0] && /^\d{17,19}$/.test(args[0])) {
      targetChannelId = args[0];
    }

    await safeMessageReply(message, { 
      content: `<:VC_EXP:1482534670896730143> Calcolando ed inviando la top settimanale NORMALE (escludendo premi evento)${targetChannelId ? ` in <#${targetChannelId}>` : ''}...`, 
      allowedMentions: { repliedUser: false } 
    });

    try {
      await publishWeeklyActivityWinners(message.client, { 
        skipEvent: true, 
        targetChannelId: targetChannelId || "1470183921236049940" 
      });
      await message.channel.send({ content: `<:vegacheckmark:1443666279058772028> Classifica settimanale **NORMALE** inviata con successo${targetChannelId ? ` in <#${targetChannelId}>` : ' nel canale di default'}!` });
    } catch (err) {
      global.logger?.error?.("[forzatopweekly] Error:", err);
      await message.channel.send({ content: "<:vegax:1443934876440068179> Errore durante l'invio della classifica. Controlla i log." });
    }
  }
};