/**
 * Edit/send sicuri per messaggi classic vs Components V2 (dashboard / bacheche / pannelli).
 * V2 non accetta embeds classici nello stesso messaggio: si converte o si forza embeds=[].
 */
const {
  MessageFlags,
  isComponentsV2Message,
  isComponentsV2Payload,
  buildVcRichFromClassicFields,
} = require("../embeds/vcPageEmbedV2") as typeof import("../embeds/vcPageEmbedV2");

const V2_FLAG = Number(MessageFlags?.IsComponentsV2 || 1 << 15);

function embedToPlain(embed?) {
  if (!embed) return null;
  try {
    if (typeof embed.toJSON === "function") return embed.toJSON();
  } catch (_) {}
  return embed?.data && typeof embed.data === "object" ? embed.data : embed;
}

/** REST/discord.js body: su V2 azzera embeds e assicura il flag. */
function prepareComponentsV2Body(body?) {
  const p = body && typeof body === "object" && !Array.isArray(body) ? { ...body } : {};
  if (!isComponentsV2Payload(p) && (Number(p.flags) & V2_FLAG) === 0) return p;
  p.flags = Number(p.flags || 0) | V2_FLAG;
  p.embeds = [];
  if (p.content === undefined) p.content = "";
  if (Array.isArray(p.files) && p.files.length) p.attachments = [];
  return p;
}

/**
 * Sostituisce il contenuto di un messaggio esistente con un embed classico
 * (o equivalente V2 se il messaggio è già Components V2).
 */
async function editMessageEmbedAware(
  message?,
  opts: { embed?: any; components?: any[]; files?: any[]; attachments?: any[] } = {},
) {
  if (!message?.edit) return { ok: false, reason: "no_edit" };
  const components = Array.isArray(opts.components) ? opts.components : [];
  const files = Array.isArray(opts.files) ? opts.files : [];
  const plain = embedToPlain(opts.embed);

  if (isComponentsV2Message(message)) {
    const v2 = buildVcRichFromClassicFields({
      title: plain?.title,
      description: plain?.description,
      fields: Array.isArray(plain?.fields) ? plain.fields : [],
      footer: plain?.footer?.text || plain?.footerText,
      footerText: plain?.footer?.text || plain?.footerText,
      color: plain?.color,
      accentColor: plain?.color,
      imageUrl: plain?.image?.url,
      thumbnailUrl: plain?.thumbnail?.url,
      rows: components,
      files,
    });
    const payload = prepareComponentsV2Body({
      ...v2,
      content: null,
      embeds: [],
      components: v2.components || [],
      files: files.length ? files : undefined,
      attachments: [],
      flags: V2_FLAG,
    });
    try {
      const edited = await message.edit(payload);
      return { ok: true, message: edited };
    } catch (err: any) {
      /* fallback: togli il post se Discord rifiuta il cambio di layout */
      await message.delete?.().catch?.(() => null);
      return { ok: false, reason: "v2_edit_failed", error: err, deleted: true };
    }
  }

  const payload: Record<string, any> = {
    embeds: plain ? [opts.embed || plain] : [],
    components,
  };
  if (files.length) {
    payload.files = files;
    payload.attachments = Array.isArray(opts.attachments) ? opts.attachments : [];
  } else {
    payload.attachments = [];
    payload.files = [];
  }
  try {
    const edited = await message.edit(payload);
    return { ok: true, message: edited };
  } catch (err: any) {
    await message.delete?.().catch?.(() => null);
    return { ok: false, reason: "classic_edit_failed", error: err, deleted: true };
  }
}

export = {
  V2_FLAG,
  prepareComponentsV2Body,
  editMessageEmbedAware,
  isComponentsV2Message,
  isComponentsV2Payload,
};
