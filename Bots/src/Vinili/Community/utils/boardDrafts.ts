/**
 * Bacheca (Quote, Repost, Clip, Skullboard): messaggi personalizzati dalla dashboard.
 *
 * I costruttori degli embed "marcano" l'embed con tipo, messaggio e segnaposto (tagBoardEmbed).
 * Al momento dell'invio withBoardDraft guarda se il server ha salvato un messaggio personalizzato
 * per quel punto: se sì lo usa (testo + embed o Components V2, pulsanti link) e ci aggiunge sotto
 * i pulsanti del bot (Reposta, Rimuovi…); se no lascia il messaggio com'era.
 */
type BoardKind = "quote" | "repost" | "clip" | "skull";
type BoardSlot = "post" | "reply" | "roulette";
type TagInfo = { guildId: string; kind: BoardKind; slot: BoardSlot; vars: Record<string, string> };

const tags = new WeakMap<object, TagInfo>();

/** Segna un embed (EmbedBuilder o oggetto) come messaggio della bacheca personalizzabile. */
function tagBoardEmbed<T extends object>(embed: T, info: { guildId?: string | null; kind: BoardKind; slot: BoardSlot; vars?: Record<string, unknown> }): T {
  if (!embed || typeof embed !== "object") return embed;
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(info.vars || {})) vars[k] = String(v ?? "");
  tags.set(embed, { guildId: String(info.guildId || ""), kind: info.kind, slot: info.slot, vars });
  return embed;
}

/** Messaggio personalizzato salvato per quel punto (null = si usa quello predefinito). */
function boardDraftFor(guildId?: string, kind?: BoardKind, slot?: BoardSlot) {
  try {
    const { getBoardKindPresentationSync } = require("./boardsPresentation") as typeof import("./boardsPresentation");
    const T = require("../../../MultiGuild/core/tenantCommunityTools") as typeof import("../../../MultiGuild/core/tenantCommunityTools");
    const pr: any = getBoardKindPresentationSync(guildId, kind);
    const raw = pr?.drafts?.[slot as string];
    if (!raw) return null;
    const draft = T.normalizeDraft(raw);
    return T.draftIsEmpty(draft) ? null : draft;
  } catch {
    return null;
  }
}

function toJson(c?: any) {
  return c && typeof c.toJSON === "function" ? c.toJSON() : c;
}

function fileName(f?: any) {
  return String(f?.name || f?.attachment?.name || "").trim();
}

/** Ha dentro pulsanti del bot (con custom_id)? */
function hasCustomId(c?: any): boolean {
  const j = toJson(c);
  if (!j || typeof j !== "object") return false;
  if (j.custom_id || j.customId) return true;
  const kids = [...(Array.isArray(j.components) ? j.components : []), ...(j.accessory ? [j.accessory] : [])];
  return kids.some((k) => hasCustomId(k));
}

/**
 * Applica il messaggio personalizzato a un invio della bacheca (send, reply, edit).
 * `edit`: si sta modificando un messaggio già mandato (svuota testo/embed vecchi se serve).
 */
function withBoardDraft<P extends Record<string, any>>(input: P, opts: { edit?: boolean } = {}): P {
  let payload = input;
  try {
    const first = Array.isArray(payload?.embeds) ? payload.embeds[0] : null;
    const info = first ? tags.get(first) : null;
    if (!info) return payload;
    /* Quote: risposta al comando senza l'immagine, se la dashboard lo chiede */
    if (info.slot === "reply" && hideReplyImage(info.guildId, info.kind) && Array.isArray(payload.files)) {
      payload = { ...payload, files: payload.files.filter((f) => !/\.(png|jpe?g|gif|webp)$/i.test(fileName(f))) };
    }
    const draft = boardDraftFor(info.guildId, info.kind, info.slot);
    if (!draft) return payload;
    const T = require("../../../MultiGuild/core/tenantCommunityTools") as typeof import("../../../MultiGuild/core/tenantCommunityTools");

    const files = Array.isArray(payload.files) ? payload.files : [];
    const isImageName = (n?: string) => /\.(png|jpe?g|gif|webp)$/i.test(String(n || ""));
    const isUsableImage = (raw?: string) => {
      const s = String(raw || "").trim();
      return /^https?:\/\/\S+$/i.test(s) || /^attachment:\/\/[\w.-]{1,100}$/i.test(s);
    };
    const names = files.map(fileName).filter(Boolean);
    const imageFile = names.find(isImageName);
    const taggedImage = String(info.vars.image || "").trim();
    /* niente immagine → {image} vuoto, così l'embed/media non la mostra */
    const resolvedImage = imageFile
      ? `attachment://${imageFile}`
      : isUsableImage(taggedImage)
        ? taggedImage
        : "";
    const vars = { ...info.vars, image: resolvedImage };
    const botRows = (Array.isArray(payload.components) ? payload.components : []).map(toJson);
    const body: any = T.buildMessageBody(draft, vars, botRows, {});

    /* senza immagine: non allegare file immagine orfani (né forzarli in V2) */
    const sendFiles = resolvedImage ? files : files.filter((f) => !isImageName(fileName(f)));
    const sendNames = sendFiles.map(fileName).filter(Boolean);

    /* Components V2: i file vanno mostrati da un componente, altrimenti non si vedono */
    if (body.flags && sendNames.length) {
      const text = JSON.stringify(body.components || []);
      const missing = sendNames.filter((n) => !text.includes(`attachment://${n}`));
      const media = resolvedImage ? missing.filter(isImageName) : [];
      const others = missing.filter((n) => !isImageName(n));
      const extra: any[] = [];
      if (media.length) extra.push({ type: 12, items: media.map((n) => ({ media: { url: `attachment://${n}` } })) });
      for (const n of others) extra.push({ type: 13, file: { url: `attachment://${n}` } });
      body.components = [...extra, ...(body.components || [])];
    }

    const out: Record<string, any> = { ...payload };
    delete out.embeds;
    delete out.content;
    delete out.allowedMentions;
    out.components = body.components || [];
    if (sendFiles.length) out.files = sendFiles;
    else delete out.files;
    if (body.flags) {
      out.flags = body.flags;
      out.embeds = [];
      if (opts.edit) out.content = null;
    } else {
      if (body.embeds) out.embeds = body.embeds;
      else out.embeds = [];
      const content = body.content && body.content !== "​" ? body.content : "";
      if (content) out.content = content;
      else if (opts.edit) out.content = null;
      /* senza testo né embed Discord rifiuta il messaggio: basta l'allegato, altrimenti uno spazio invisibile */
      if (!content && !body.embeds && !sendFiles.length) out.content = "​";
    }
    const am = body.allowed_mentions || { parse: [] };
    out.allowedMentions = {
      parse: am.parse || [],
      ...(am.users ? { users: am.users } : {}),
      ...(am.roles ? { roles: am.roles } : {}),
      ...(payload.allowedMentions && "repliedUser" in payload.allowedMentions ? { repliedUser: payload.allowedMentions.repliedUser } : {}),
    };
    return out as P;
  } catch (err) {
    global.logger?.warn?.("[bacheca] messaggio personalizzato non applicato:", (err as any)?.message || err);
    return payload;
  }
}

function hideReplyImage(guildId?: string, kind?: BoardKind) {
  try {
    const { getBoardKindPresentationSync } = require("./boardsPresentation") as typeof import("./boardsPresentation");
    return (getBoardKindPresentationSync(guildId, kind) as any)?.hideReplyImage === true;
  } catch {
    return false;
  }
}

/**
 * Pulsanti del bot da rimettere su un messaggio già mandato senza cancellare il resto:
 * tiene le parti del messaggio personalizzato (Components V2, pulsanti link) e sostituisce solo le file coi pulsanti del bot.
 */
function mergeBoardComponents(message?: any, botRows: any[] = []) {
  const existing = Array.isArray(message?.components) ? message.components : [];
  const keep = existing.filter((c?: any) => !hasCustomId(c)).map(toJson);
  return [...keep, ...botRows.map(toJson)];
}

export = { tagBoardEmbed, withBoardDraft, mergeBoardComponents, boardDraftFor };
