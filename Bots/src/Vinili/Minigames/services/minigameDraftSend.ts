/** Minigiochi: draft inizio/vittoria condivisi dalla dashboard (testo/v2); files e components restano del fallback. */
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { applyDefaultFooterToEmbeds } = require("../../../shared/embeds/defaultFooter") as typeof import("../../../shared/embeds/defaultFooter");

function getScoring() {
  try {
    const LVL = require("../../../MultiGuild/services/levelsRuntime") as typeof import("../../../MultiGuild/services/levelsRuntime");
    return LVL.getMinigameScoringSync(String(IDs.guilds?.main || ""));
  } catch {
    return null;
  }
}

function getTypeRow(type?) {
  const t = String(type || "").trim();
  if (!t) return null;
  const scoring = getScoring();
  const rows = Array.isArray(scoring?.rewardExpByType) ? scoring.rewardExpByType : [];
  return rows.find((r?) => String(r?.type || "") === t) || null;
}

function getMinigameTypeDraft(_type?, kind: "start" | "win" = "start") {
  const scoring = getScoring();
  if (!scoring) return null;
  const draft = kind === "win" ? scoring.winDraft : scoring.startDraft;
  if (!draft || typeof draft !== "object") return null;
  try {
    const T = require("../../../MultiGuild/core/tenantCommunityTools") as typeof import("../../../MultiGuild/core/tenantCommunityTools");
    if (T.draftIsEmpty(draft)) return null;
    return draft;
  } catch {
    return null;
  }
}

function embedImageUrl(embed?) {
  if (!embed) return "";
  try {
    if (typeof embed.toJSON === "function") {
      const j = embed.toJSON();
      return String(j?.image?.url || "").trim();
    }
  } catch (_) {}
  return String(embed?.image?.url || embed?.data?.image?.url || "").trim();
}

function embedDescription(embed?) {
  if (!embed) return "";
  try {
    if (typeof embed.toJSON === "function") {
      const j = embed.toJSON();
      return String(j?.description || "").trim();
    }
  } catch (_) {}
  return String(embed?.description || embed?.data?.description || "").trim();
}

/** Fields dell'embed classico (es. sequenza Memoria) — il draft condiviso altrimenti li perde. */
function embedFieldsText(embed?) {
  let fields: any[] = [];
  try {
    if (typeof embed?.toJSON === "function") {
      const j = embed.toJSON();
      fields = Array.isArray(j?.fields) ? j.fields : [];
    } else if (Array.isArray(embed?.data?.fields)) {
      fields = embed.data.fields;
    } else if (Array.isArray(embed?.fields)) {
      fields = embed.fields;
    }
  } catch (_) {
    fields = [];
  }
  return fields
    .map((f?) => String(f?.value || "").trim())
    .filter(Boolean)
    .join("\n");
}

/** C'è già una galleria/miniatura con quell'immagine (es. {image} messo a mano nel V2)? */
function v2HasImage(components: any[], url: string): boolean {
  const walk = (list: any[]): boolean =>
    (Array.isArray(list) ? list : []).some((c) => {
      if (!c || typeof c !== "object") return false;
      if (c.type === 12 && Array.isArray(c.items) && c.items.some((i: any) => String(i?.media?.url || "") === url)) return true;
      if (c.type === 11 && String(c?.media?.url || "") === url) return true;
      if (c.accessory?.type === 11 && String(c.accessory?.media?.url || "") === url) return true;
      return walk(c.components);
    });
  return walk(components);
}

/** Messaggio V2: aggiunge l'immagine del round (allegato canvas o foto) in fondo, dentro il contenitore se c'è. */
function withRoundImageV2(components: any[], url?: string) {
  const u = String(url || "").trim();
  if (!u || !Array.isArray(components) || v2HasImage(components, u)) return components;
  const gallery = { type: 12, items: [{ media: { url: u } }] };
  /* in fondo, ma prima delle righe di pulsanti finali (come l'immagine sopra i pulsanti negli embed) */
  const insert = (list: any[]) => {
    let at = list.length;
    while (at > 0 && list[at - 1]?.type === 1) at -= 1;
    return [...list.slice(0, at), gallery, ...list.slice(at)];
  };
  const containerIdx = components.findIndex((c) => c?.type === 17);
  if (containerIdx >= 0) {
    const c = components[containerIdx];
    const next = [...components];
    next[containerIdx] = { ...c, components: insert(Array.isArray(c.components) ? c.components : []) };
    return next;
  }
  return insert(components);
}

/** Prima riga utile dell'embed classico (senza citazioni tempo/profilo) → {prompt}. */
function promptFromFallbackDescription(desc?) {
  const lines = String(desc || "")
    .replace(/```[\s\S]*?```/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  /* via le emoji in testa alla riga: il messaggio della dashboard ha già la sua */
  const LEAD = /^(?:(?:<a?:\w{1,64}:\d{15,22}>|\p{Extended_Pictographic}\uFE0F?|[\u{1F1E6}-\u{1F1FF}]{2})\s*)+/u;
  const useful = lines.filter((l) => !l.startsWith(">") && !/^hai\s/i.test(l)).map((l) => l.replace(LEAD, "").trim()).filter(Boolean);
  if (useful.length) return useful.join("\n");
  return lines[0] || "Partecipa per vincere **{exp} exp**.";
}

/** Righe con pulsanti “di gioco” (customId), non link della dashboard. */
function isGameActionRow(row?) {
  if (!row) return false;
  try {
    const j = typeof row.toJSON === "function" ? row.toJSON() : row;
    if (Number(j?.type) !== 1) return false;
    const comps = Array.isArray(j?.components) ? j.components : [];
    return comps.some((c?) => c && (c.custom_id || c.customId));
  } catch {
    return false;
  }
}

function rowToJson(row?) {
  if (!row) return null;
  try {
    return typeof row.toJSON === "function" ? row.toJSON() : row;
  } catch {
    return row;
  }
}

/**
 * Testo/embed dal draft dashboard; i components di gioco del fallback (es. Ascolta anteprima)
 * restano SEMPRE, anche se il draft ha già pulsanti link.
 */
function mergeMinigameComponents(draftComponents?, fallbackComponents?) {
  const draft = (Array.isArray(draftComponents) ? draftComponents : []).map(rowToJson).filter(Boolean);
  const fb = (Array.isArray(fallbackComponents) ? fallbackComponents : []).map(rowToJson).filter(Boolean);
  const gameRows = fb.filter(isGameActionRow);
  if (!draft.length && !fb.length) return undefined;
  if (!draft.length) return fb;
  if (!gameRows.length) return draft;
  const draftIds = new Set(
    draft.flatMap((r?) =>
      (Array.isArray(r?.components) ? r.components : [])
        .map((c?) => String(c?.custom_id || c?.customId || ""))
        .filter(Boolean),
    ),
  );
  const extra = gameRows.filter((r?) => {
    const ids = (Array.isArray(r?.components) ? r.components : [])
      .map((c?) => String(c?.custom_id || c?.customId || ""))
      .filter(Boolean);
    return ids.some((id) => !draftIds.has(id));
  });
  return [...draft, ...extra].slice(0, 5);
}

/**
 * Se c’è un draft non vuoto per kind (condiviso), sostituisce content/embeds del draft
 * e tiene files + components di gioco del fallback (Ascolta anteprima, ecc.).
 * Se il draft non ha immagine, eredita quella del fallback (bandiere, foto, allegati).
 */
function applyMinigameDraftToPayload(fallbackPayload?, opts: { type?: string; kind?: "start" | "win"; vars?: Record<string, string>; mentionUserId?: string | null; guild?: any } = {}) {
  const draft = getMinigameTypeDraft(opts.type, opts.kind || "start");
  if (!draft) return fallbackPayload;
  try {
    const T = require("../../../MultiGuild/core/tenantCommunityTools") as typeof import("../../../MultiGuild/core/tenantCommunityTools");
    const fb = fallbackPayload && typeof fallbackPayload === "object" && !Array.isArray(fallbackPayload) ? fallbackPayload : {};
    const vars: Record<string, string> = { ...(opts.vars || {}) };
    if (!vars.minigame) {
      try {
        const { minigameTypeLabel } = require("./minigameClassicDrafts") as typeof import("./minigameClassicDrafts");
        vars.minigame = minigameTypeLabel(opts.type);
      } catch {
        vars.minigame = String(opts.type || "Minigioco");
      }
    }
    const fbEmbeds = Array.isArray(fb.embeds) ? fb.embeds : [];
    if ((opts.kind || "start") === "start") {
      if (!vars.prompt) {
        const descPrompt = promptFromFallbackDescription(embedDescription(fbEmbeds[0]));
        const fieldExtra = embedFieldsText(fbEmbeds[0]);
        vars.prompt = fieldExtra ? `${descPrompt}\n${fieldExtra}` : descPrompt;
      }
      /* Nested {exp}/{quote} dentro prompt (draft custom / anteprima) */
      if (vars.prompt && /\{[a-zA-Z_.]+\}/.test(vars.prompt)) {
        vars.prompt = vars.prompt.replace(/\{([a-zA-Z_.]+)\}/g, (m, k: string) =>
          Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m,
        );
      }
      if (!vars.image) {
        const fbImg = embedImageUrl(fbEmbeds[0]);
        if (fbImg) vars.image = fbImg;
      }
      /* Se c’è un file allegato ma manca {image}, collega il primo attachment:// */
      if (!vars.image && Array.isArray(fb.files) && fb.files[0]) {
        const name = String(fb.files[0]?.name || fb.files[0]?.attachment?.name || "").trim();
        if (name) vars.image = `attachment://${name}`;
      }
    }
    const body: any = T.buildMessageBody(draft, vars, [], { mentionUserId: opts.mentionUserId || null });
    let embeds = body.embeds;
    if (Array.isArray(embeds) && embeds[0] && fbEmbeds[0] && !embedImageUrl(embeds[0])) {
      const fbImg = embedImageUrl(fbEmbeds[0]);
      if (fbImg) {
        embeds = [{ ...embeds[0], image: { url: fbImg } }];
      }
    }
    let components = mergeMinigameComponents(body.components, fb.components);
    const isV2 = (Number(body.flags) & (1 << 15)) !== 0;
    if (isV2 && (opts.kind || "start") === "start") {
      const roundImg = vars.image || embedImageUrl(fbEmbeds[0]);
      components = withRoundImageV2(components || [], roundImg);
    }
    const out: Record<string, any> = {
      content: body.content,
      embeds,
      flags: body.flags,
      allowedMentions: body.allowed_mentions,
    };
    if (components?.length) out.components = components;
    if (fb.files) out.files = fb.files;
    /* V2: niente classic embeds residui (come preparePanelDiscordPayload / sendOrEdit). */
    if (isV2) {
      out.embeds = [];
      out.flags = Number(out.flags || 0) | (1 << 15);
      if (out.content === undefined) out.content = "";
    }
    return applyDefaultFooterToEmbeds(out, opts.guild || null);
  } catch {
    return fallbackPayload;
  }
}

function minigameDraftVars(channelOrGuild?, extra: Record<string, string | number | null | undefined> = {}) {
  const guild = channelOrGuild?.guild || channelOrGuild || null;
  const out: Record<string, string> = {
    server: String(guild?.name || ""),
  };
  for (const [k, v] of Object.entries(extra)) {
    if (v == null) continue;
    /* quoteFilmBug1: non esporre durationMs grezzo (180000) — nei draft veniva
       scambiato per {exp} e stampava "180000 exp" al posto della ricompensa. */
    if (k === "durationMs") continue;
    if (k === "exp") {
      const n = Number(v);
      /* valori tipo 180000 = durata ms finita per sbaglio in {exp} */
      if (!Number.isFinite(n) || n <= 0) continue;
      if (n > 10_000) {
        try {
          const { normalizeRewardExp } = require("./minigameText") as typeof import("./minigameText");
          out.exp = String(normalizeRewardExp(150));
        } catch {
          out.exp = "150";
        }
        continue;
      }
      out.exp = String(Math.floor(n));
      continue;
    }
    out[k] = String(v);
  }
  if (extra.durationMs != null) {
    const ms = Number(extra.durationMs) || 0;
    if (out.duration == null) out.duration = String(Math.max(1, Math.round(ms / 1000)));
    const minutes = Math.max(1, Math.round(ms / 60_000));
    if (out.minutes == null) out.minutes = String(minutes);
    if (out.minutesLabel == null) out.minutesLabel = minutes === 1 ? "**1 minuto**" : `**${minutes} minuti**`;
  }
  if (extra.type != null && out.minigame == null) {
    try {
      const { minigameTypeLabel } = require("./minigameClassicDrafts") as typeof import("./minigameClassicDrafts");
      out.minigame = minigameTypeLabel(extra.type);
    } catch {
      out.minigame = String(extra.type);
    }
  }
  /* {exp} dentro {prompt} (es. anteprime dashboard) → risolvi subito */
  if (out.prompt && /\{[a-zA-Z_.]+\}/.test(out.prompt)) {
    out.prompt = out.prompt.replace(/\{([a-zA-Z_.]+)\}/g, (m, k: string) =>
      Object.prototype.hasOwnProperty.call(out, k) ? out[k] : m,
    );
  }
  return out;
}

async function sendMinigameStartOrWin(channel?, fallbackPayload?, opts: { type?: string; kind?: "start" | "win"; vars?: Record<string, string>; mentionUserId?: string | null } = {}) {
  const { sendMinigameMessage } = require("./minigameDiscord") as typeof import("./minigameDiscord");
  if (!channel?.send) return null;
  return sendMinigameMessage(channel, fallbackPayload, opts);
}

export = {
  getTypeRow,
  getMinigameTypeDraft,
  applyMinigameDraftToPayload,
  minigameDraftVars,
  sendMinigameStartOrWin,
};
