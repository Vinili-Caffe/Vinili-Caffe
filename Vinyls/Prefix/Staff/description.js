const Ticket = require("../../Schemas/Ticket/ticketSchema");

function _stripRef(p) {
  if (!p || typeof p !== "object") return p;
  const o = { ...p }; delete o.reply; delete o.messageReference; delete o.failIfNotExists;
  if (o.allowedMentions && typeof o.allowedMentions === "object") o.allowedMentions = { ...o.allowedMentions, repliedUser: false };
  return o;
}
async function _reply(message, payload) {
  if (!message || typeof message.reply !== "function") {
    return (message.channel && message.channel.send) ? message.channel.send(_stripRef(payload)).catch(() => null) : null;
  }
  try { return await message.reply(payload); } catch (e) {
    if (e && e.code === 10008) return null;
    if (e && e.code === 50035 && e.rawError && e.rawError.errors && e.rawError.errors.message_reference) {
      return message.channel.send(_stripRef(payload)).catch(() => null);
    }
    return null;
  }
}

async function resolveTargetUser(message, rawArg) {
  if (!rawArg) return null;

  const value = String(rawArg).trim();
  const mentionMatch = value.match(/^<@!?(\d+)>$/);
  const id = (mentionMatch ? mentionMatch[1] : null) || (/^\d{17,20}$/.test(value) ? value : null);
  if (!id) return null;
  return message.client.users.fetch(id).catch(() => null);
}

module.exports = {
  name: "desc",
  allowEmptyArgs: true,

  async execute(message, args = []) {
    await message.channel.sendTyping();
    const descriptionText = [
      "## 𓂃 [Benvenuti su ⟢ ``📀`` Vinili  & Caffè! ``☕``](<https://discord.gg/viniliecaffe>)",
      "**⊹  | ** `🫂` **__Community attiva e accogliente__** ୧",
      "　✨ Una community, **chill** e **non toxic**, per __divertirsi__ e __conoscere__ nuove persone!",
      "**⊹  | ** `🔈` **__Chat vocali & testuali attive!__** ୧",
      "　💬 Chat **attive** per parlare di __ciò che preferisci__, **minigames** e tante **funzionalità** grazie ai __nostri bot__!",
      "**⊹  | ** `🛠️` **__Candidature STAFF aperte!__** ୧",
      "　💼 Ogni mese il __miglior__ staffer viene **ricompensato** con un **Nitro Boost**!",
      "**⊹  | ** `🤝` **__Candidature PARTNER MANAGER aperte!__** ୧",
      "　💎 Ricompensiamo i nostri **Partner Manager** con **Nitro Boost** e **ricompense**!",
      "",
      "**⊹  | ** `🎉` **__EVENTO STAGIONALE A TEMA HARRY POTTER__** ୧",
      "🎁 __Ogni mese__ in palio **Nitro Boost**, **decorazione a scelta** (2°) e **VIP+** (3°). Ogni **sabato sera** un film da guardare __tutti insieme__!",
 
    ].join("\n");
    if (!message.inGuild?.() || !message.guild || !message.member) return;

    const ticketDoc=await Ticket.findOne({channelId:message.channel.id,open:true,}).lean().catch(() => null);
    if (!ticketDoc) {
      return _reply(
        message,
        "<:vegax:1443934876440068179> Questo comando può essere usato **solo in un canale ticket aperto**.",
      );
    }

    let target = null;
    const mode = String(args[0] || "").toLowerCase();
    if (mode === "user" || mode === "utente" || mode === "id") {
      target = await resolveTargetUser(message, args[1]);
      if (!target) {
        await _reply(message, {
          content:
            "<:vegax:1443934876440068179> Usa: `+desc user <@utente | id>`",
          allowedMentions: { repliedUser: false },
        });
        return;
      }
    } else if (args[0]) {
      target = await resolveTargetUser(message, args[0]);
    }

    if (!target) {
      await _reply(message, {
        content: descriptionText,
        allowedMentions: { parse: [], repliedUser: false },
      });
      return;
    }

    const delivered=await target.send({content:descriptionText,allowedMentions:{parse:[]},}).then(() => true).catch(() => false);
    if (!delivered) {
      await _reply(message, {
        content: `<:vegax:1443934876440068179> Non riesco a inviare DM a ${target}.`,
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    await _reply(message, {
      content: `<:vegacheckmark:1443666279058772028> Description inviata in DM a ${target}.`,
      allowedMentions: { repliedUser: false },
    });
  },
};