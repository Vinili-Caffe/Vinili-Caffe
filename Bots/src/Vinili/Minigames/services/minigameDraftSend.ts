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
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const useful = lines.filter((l) => !l.startsWith(">") && !/^hai\s/i.test(l));
  if (useful.length) return useful.join("\n");
  return lines[0] || "Partecipa per vincere **{exp} exp**.";
}

/**
 * Se c’è un draft non vuoto per kind (condiviso), sostituisce content/embeds/components del draft
 * e tiene files (+ components extra del fallback se il draft non ne ha).
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
      if (!vars.prompt) vars.prompt = promptFromFallbackDescription(embedDescription(fbEmbeds[0]));
      if (!vars.image) {
        const fbImg = embedImageUrl(fbEmbeds[0]);
        if (fbImg) vars.image = fbImg;
      }
    }
    const body: any = T.buildMessageBody(draft, vars, [], { mentionUserId: opts.mentionUserId || null });
    const draftHasComponents = Array.isArray(body.components) && body.components.length > 0;
    let embeds = body.embeds;
    if (Array.isArray(embeds) && embeds[0] && fbEmbeds[0] && !embedImageUrl(embeds[0])) {
      const fbImg = embedImageUrl(fbEmbeds[0]);
      if (fbImg) {
        embeds = [{ ...embeds[0], image: { url: fbImg } }];
      }
    }
    let components = draftHasComponents ? body.components : fb.components;
    const isV2 = (Number(body.flags) & (1 << 15)) !== 0;
    if (isV2 && (opts.kind || "start") === "start") {
      const roundImg = vars.image || embedImageUrl(fbEmbeds[0]);
      components = withRoundImageV2(components, roundImg);
    }
    const out: Record<string, any> = {
      content: body.content,
      embeds,
      components,
      flags: body.flags,
      allowedMentions: body.allowed_mentions,
    };
    if (fb.files) out.files = fb.files;
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
