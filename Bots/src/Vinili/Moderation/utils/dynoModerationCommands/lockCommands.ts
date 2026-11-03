const { EmbedBuilder, PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const {
  reasonFrom,
  reply,
  successReply,
  makeCase,
  parseLockDuration,
} = require("./helpers") as typeof import("./helpers");

async function runLockOrUnlock(cmd?, message?, args?, client?) {
  if (!args.length) {
    if (cmd === "lock") {
      const helpEmbed = new EmbedBuilder()
        .setColor("#3498DB")
        .setDescription(
          ["**Comando: +lock**", "", "**Descrizione:** Blocca un canale con timer e messaggio opzionali.", "**Cooldown:** 5 secondi", "**Uso:**", "+lock [canale] (durata) (messaggio)", "**Esempio:**", "+lock #general Torniamo subito", "+lock #support 2h Questo canale resterà bloccato per due ore.", "+lock #help 4h"].join("\n"),
        );
      return message.channel.send({ embeds: [helpEmbed] }).catch(() => null);
    }
    const helpEmbed = new EmbedBuilder()
      .setColor("#3498DB")
      .setDescription(
        ["**Comando: +unlock**", "", "**Descrizione:** Sblocca un canale bloccato in precedenza.", "**Cooldown:** 5 secondi", "**Uso:**", "+unlock [canale] (messaggio)", "**Esempio:**", "+unlock #general", "+unlock #support Siamo tornati!"].join("\n"),
      );
    return message.channel.send({ embeds: [helpEmbed] }).catch(() => null);
  }

  const channel = message.mentions?.channels?.first() || message.guild.channels.cache.get(String(args[0] || "").replace(/[<#>]/g, "")) || message.channel;
  const start = message.mentions?.channels?.size ? 1 : 0;
  const duration = cmd === "lock" ? parseLockDuration(args[start]) : null;
  const reasonStart = cmd === "lock" && duration ? start + 1 : start;
  const reason = reasonFrom(args, reasonStart, cmd === "lock" ? "Canale bloccato." : "Canale sbloccato.");
  const me = message.guild.members.me;
  const perms = channel?.permissionsFor?.(me);
  if (!perms?.has(PermissionsBitField.Flags.ManageChannels)) return reply(message, client, cmd, "<:VC_Lock:1482526739044368476> Non posso gestire quel canale.", "Red");
  await channel.permissionOverwrites
    .edit(
      message.guild.roles.everyone,
      cmd === "lock"
        ? { SendMessages: false, SendMessagesInThreads: false }
        : { SendMessages: null, SendMessagesInThreads: null },
      { reason },
    )
    .catch(() => null);

  if (cmd === "lock") {
    await channel
      .send({
        embeds: [
          new EmbedBuilder()
            .setColor("#ED4245")
            .setTitle("<:VC_Lock:1482526739044368476> Canale bloccato")
            .setDescription(`<:VC_Lock:1482526739044368476> Lock: ${reason}`),
        ],
      })
      .catch(() => null);
    if (duration) {
      setTimeout(() => {
        channel.permissionOverwrites
          .edit(
            message.guild.roles.everyone,
            { SendMessages: null, SendMessagesInThreads: null },
            { reason: "<a:VC_Unlock:1482532082466029608> Sbloccato automaticamente." },
          )
          .catch(() => null);
      }, duration);
    }
  }

  await makeCase(client, message, cmd.toUpperCase(), `CHANNEL:${channel.id}`, reason, duration || null);
  return successReply(
    message,
    `<#${channel.id}>`,
    cmd === "lock" ? "è stato bloccato" : "è stato sbloccato",
  );
}

export = { runLockOrUnlock };
