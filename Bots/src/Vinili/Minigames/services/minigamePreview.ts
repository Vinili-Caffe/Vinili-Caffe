/**
 * Anteprima dashboard (Livelli › Minigiochi): l'immagine del round fatta coi generatori VERI del bot
 * (card canvas, foto censurate, card con foto) e, dove servono, dati veri dalle stesse fonti dei giochi.
 * Restituisce un data URL PNG (o un URL remoto). Cache 15 minuti per tipo: le fonti remote sono lente.
 */
const images = require("./minigameImages") as typeof import("./minigameImages");

type Attachment = { attachment?: any; name?: string } | null | undefined;
/** note: perché non c'è l'immagine vera (fonte irraggiungibile, canvas mancante…), mostrato in dashboard */
type PreviewOut = { image: string; source: "canvas" | "remote" | "none"; note?: string };

/** canvas c'è in questo processo? */
function canvasAvailable() {
  try {
    const c = require("canvas");
    c.createCanvas(1, 1);
    return true;
  } catch {
    return false;
  }
}

const CACHE_MS = 15 * 60 * 1000;
const cache = new Map<string, { at: number; out: PreviewOut }>();

function toDataUrl(att: Attachment): string {
  const buf = att?.attachment;
  if (!buf || !Buffer.isBuffer(buf)) return "";
  const name = String(att?.name || "").toLowerCase();
  const mime = name.endsWith(".jpg") || name.endsWith(".jpeg") ? "image/jpeg" : name.endsWith(".gif") ? "image/gif" : "image/png";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

function minigameConfig(client?) {
  try {
    const { getConfig } = require("./minigameConfig") as typeof import("./minigameConfig");
    /* nel processo del sito client.config non c'è: si usa il config.json del bot (nomi famosi, campionati…) */
    const withConfig = client?.config?.minigames ? client : { ...(client || {}), config: require("../../config.json") };
    return getConfig(withConfig) || (withConfig.config as any)?.minigames || {};
  } catch {
    try {
      return (require("../../config.json") as any)?.minigames || {};
    } catch {
      return {};
    }
  }
}

/** Card canvas "classica" (titolo + righe) come buildPromptImageAttachment. */
function card(title: string, lines: string[], base: string, client?) {
  return toDataUrl(images.buildPromptImageAttachment(title, lines, base, "", client) as Attachment);
}

/** Card coi temi del bot (Star Wars/Halloween se attivi) come resolveMinigamePromptAttachment. */
async function themedCard(cfg: any, title: string, lines: string[], base: string, client?) {
  const out: any = await images.resolveMinigamePromptAttachment(cfg, title, lines, base, client).catch(() => null);
  return toDataUrl(out?.attachment) || card(title, lines, base, client);
}

/**
 * Foto dentro la card canvas. Prova più URL; se nessuno carica → card solo testo (sempre data URL).
 * Mai URL remoti nudi: in dashboard spesso non si vedono (hotlink/CORS).
 * Nota: solo se la foto non entra nella card (niente messaggi “fonte giù” quando c’è comunque la foto).
 */
async function photoCardOut(
  imageUrls: string | string[],
  title: string,
  base: string,
  fallbackLines: string[],
  client?,
  missingPhotoNote?: string,
): Promise<PreviewOut> {
  const list = (Array.isArray(imageUrls) ? imageUrls : [imageUrls])
    .map((u) => String(u || "").trim())
    .filter((u, i, a) => u && a.indexOf(u) === i);
  for (const remote of list) {
    const att = (await images.buildRemoteGuessImageCardAttachment(remote, title, `${base}.png`).catch(() => null)) as Attachment;
    const url = toDataUrl(att);
    if (url) return { image: url, source: "canvas" };
  }
  const c = card(title, fallbackLines, base, client);
  return { image: c, source: c ? "canvas" : "none", note: missingPhotoNote || "Foto non disponibile." };
}

/** Crest / copertine sempre raggiungibili (niente upload.wikimedia hardcodati: 400 senza query API). */
const SAMPLE = {
  team: [
    "https://crests.football-data.org/108.png",
    "https://crests.football-data.org/109.png",
    "https://crests.football-data.org/98.png",
    "https://crests.football-data.org/86.png",
  ],
  album: [
    "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/48/53/43/485343e3-dd6a-0034-faec-f4b6403f8108/13UMGIM63890.rgb.jpg/600x600bb.jpg",
    "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/32/4f/fd/324ffda2-9e51-8f6a-0c2d-c6fd2b41ac55/074643811224.jpg/600x600bb.jpg",
    "https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/45/b2/24/45b224b7-baa4-c320-9e3b-fd37dcfcdcb1/mzi.nkvwvqxf.jpg/600x600bb.jpg",
  ],
};

/** Copertina censurata come all'inizio del round (canzone, album). */
async function censored(artwork: string, name: string, cardTitle = "") {
  if (!artwork) return "";
  const out: any = await images.censorArtworkImage(artwork, { attachmentName: name, overlayAlpha: 0.98, cardTitle }).catch(() => null);
  if (out?.buffer) return `data:image/png;base64,${Buffer.from(out.buffer).toString("base64")}`;
  return artwork;
}

const pick = <T>(list: T[] | null | undefined): T | null => (Array.isArray(list) && list.length ? list[Math.floor(Math.random() * list.length)] : null);

async function render(type: string, client?): Promise<PreviewOut> {
  const cfg: any = minigameConfig(client);
  const src = require("./minigameSources") as typeof import("./minigameSources");
  const canvasOut = (image: string): PreviewOut => ({ image, source: image ? "canvas" : "none" });

  switch (type) {
    case "guessNumber": {
      const min = Math.max(1, Number(cfg?.guessNumber?.min || 1));
      const max = Math.max(min, Number(cfg?.guessNumber?.max || 100));
      return canvasOut(await themedCard(cfg, "Indovina il numero", [`Tra ${min} e ${max}`], "guess_number", client));
    }
    case "guessWord":
      return canvasOut(card("Indovina la parola", ["aeplp"], "guess_word", client));
    case "fastType":
      return canvasOut(await themedCard(cfg, "Scrivi la frase", ["Il caffè del mattino è sacro"], "fast_type", client));
    case "hangman":
      return canvasOut(await themedCard(cfg, "Impiccato", ["_ _ _ _ _", "Errori: 0/10"], "hangman", client));
    case "italianGK":
      return canvasOut(card("Cultura generale", ["Qual è il fiume più lungo d'Italia?"], "italian_gk", client));
    case "mathExpression":
      return canvasOut(toDataUrl(images.buildMathExpressionImageAttachment("12 + 8 × 2") as Attachment) || card("Calcola", ["12 + 8 × 2"], "math", client));
    case "memoryEmoji":
      return canvasOut(await themedCard(cfg, "Memoria", ["⭐ 🎵 🎮 🔥", "Memorizza la sequenza"], "memory_emoji", client));
    case "findBot":
      return canvasOut(await themedCard(cfg, "Trova il bot", ["Cerca il messaggio nascosto in un canale del server.", "Reagisci con il cuore quando lo trovi!"], "find_bot", client));
    case "findBotVoice":
      return canvasOut(await themedCard(cfg, "Trova il bot in vocale", ["Il bot si è nascosto in una vocale vuota del server.", "Entra in quella vocale per vincere!"], "find_bot", client));
    case "guessYear":
      return canvasOut(card("Indovina l'anno", ["Inception", "Film"], "guess_year", client));
    case "completeVerse":
      return canvasOut(await themedCard(cfg, "Completa il verso", ["Nel blu dipinto di blu…", "Volare — Domenico Modugno"], "complete_verse", client));
    case "guessEmoji": {
      const att = (await images.buildEmojiRichPromptImageAttachment("Indovina da emoji", ["🦁👑", "Categoria: Film"], "guess_emoji").catch(() => null)) as Attachment;
      return canvasOut(toDataUrl(att) || card("Indovina da emoji", ["🦁👑", "Categoria: Film"], "guess_emoji", client));
    }
    case "quoteFilm":
      return canvasOut(card("Citazione da film/serie", ["\"Che la forza sia con te\""], "quote_film", client));
    case "completeProverb":
      return canvasOut(card("Completa il proverbio", ["Chi dorme…"], "complete_proverb", client));
    case "synonymAntonym":
      return canvasOut(card("Trova il sinonimo", ["Parola: bello", "Scrivi un sinonimo di questa parola."], "synonym_antonym", client));
    case "guessCity":
      return canvasOut(card("Indovina la città", ["Il Colosseo", "Paese: Italia"], "guess_city", client));
    case "guessRegionCapital":
      return canvasOut(toDataUrl(images.buildRegionNameImageAttachment("Lazio") as Attachment) || card("Indovina il capoluogo", ["Lazio"], "guess_region_capital", client));
    case "guessCapital": {
      /* come nel round: la bandiera del paese, non il nome scritto */
      const bank: any[] = await src.loadCapitalQuestionBank(cfg).catch(() => []);
      const withFlag = bank.filter((r) => r?.image);
      const row = pick(withFlag) || pick(bank.filter((r) => r?.country));
      const flag = String(row?.image || "https://flagcdn.com/w320/it.png");
      return photoCardOut([flag, "https://flagcdn.com/w320/it.png", "https://flagcdn.com/w320/fr.png"], "Indovina la capitale", "guess_capital", [String(row?.country || "Italia")], client);
    }
    case "guessReverseCapital": {
      const bank: any[] = await src.loadReverseCapitalQuestionBank(cfg).catch(() => []);
      const withFlag = bank.filter((r) => r?.image);
      const row = pick(withFlag) || pick(bank.filter((r) => r?.capital));
      if (row?.image) return photoCardOut([String(row.image), "https://flagcdn.com/w320/it.png"], "Capitale inverso", "guess_reverse_capital", [String(row?.capital || "Roma")], client);
      return canvasOut(card("Capitale inverso", [String(row?.capital || "Roma")], "guess_reverse_capital", client));
    }
    case "guessFlag": {
      const list: any[] = await src.loadCountryList(cfg).catch(() => []);
      const row = pick(list.filter((c) => c?.flagUrl));
      const flag = String(row?.flagUrl || "https://flagcdn.com/w320/it.png");
      return photoCardOut([flag, "https://flagcdn.com/w320/it.png", "https://flagcdn.com/w320/br.png"], "Indovina la bandiera", "guess_flag", ["Quale nazione è?"], client);
    }
    case "guessPlayer": {
      const info: any =
        (await src.fetchFamousPlayer(cfg).catch(() => null)) ||
        (await src.fetchLeagueFamousPlayer(cfg).catch(() => null)) ||
        (await src.fetchPlayerFromRandomLetter(cfg).catch(() => null)) ||
        (await src.fetchSampleFamousPlayer().catch(() => null));
      const wikiExtra =
        info?.image
          ? ""
          : (await src.fetchWikipediaImage?.("Lionel Messi").catch(() => "")) ||
            (await src.fetchWikipediaImage?.("Cristiano Ronaldo").catch(() => "")) ||
            "";
      return photoCardOut(
        [String(info?.image || ""), String(wikiExtra || "")],
        "Indovina il calciatore",
        "guess_player",
        ["Chi è questo calciatore?"],
        client,
        "Anteprima senza foto del calciatore.",
      );
    }
    case "guessTeam": {
      const teams: any[] = await src.loadFootballTeamsFromApi(cfg).catch(() => []);
      const row = pick(teams.filter((t) => t?.image)) || (await src.fetchSampleFootballTeam().catch(() => null));
      return photoCardOut(
        [String(row?.image || ""), ...SAMPLE.team],
        "Indovina la squadra",
        "guess_team",
        ["Quale squadra è?"],
        client,
        "Anteprima senza logo della squadra.",
      );
    }
    case "guessSinger": {
      const singers: any[] = await src.loadSingersFromApi(cfg).catch(() => []);
      const row: any = pick(singers.filter((s) => s?.image || s?.name));
      const img = String(
        row?.image ||
          (row?.name ? await images.fetchSingerImageFallback(row.name, cfg).catch(() => "") : "") ||
          (await src.fetchWikipediaImage?.("Adele").catch(() => "")) ||
          (await src.fetchWikipediaImage?.("Taylor Swift").catch(() => "")) ||
          "",
      );
      return photoCardOut([img], "Indovina il cantante", "guess_singer", ["Chi è questo cantante?"], client, "Anteprima senza foto del cantante.");
    }
    case "guessSong": {
      const info: any = await src.fetchPopularSong(cfg).catch(() => null);
      const artwork = String(info?.artwork || SAMPLE.album[0] || "");
      const img = artwork ? await censored(artwork, "minigame_song.png", "Indovina la canzone") : "";
      if (img?.startsWith("data:")) return { image: img, source: "canvas" };
      return photoCardOut([artwork, ...SAMPLE.album], "Indovina la canzone", "guess_song", ["Ascolta l'anteprima"], client, "Anteprima senza copertina.");
    }
    case "guessAlbum": {
      const albums: any[] = await src.loadAlbumsFromApi(cfg).catch(() => []);
      const row: any = pick(albums.filter((a) => a?.image)) || (await src.fetchSampleAlbum().catch(() => null));
      const raw = String(row?.image || "");
      const img = raw ? await censored(raw, "minigame_album.png", "Indovina l'album") : "";
      if (img?.startsWith("data:")) return { image: img, source: "canvas" };
      return photoCardOut(
        [raw, ...SAMPLE.album],
        "Indovina l'album",
        "guess_album",
        [String(row?.album || "Album"), String(row?.artist || "")].filter(Boolean),
        client,
        "Anteprima senza copertina dell'album.",
      );
    }
    case "drivingQuiz": {
      const sample = {
        questionType: "boolean",
        statement: "In curva il veicolo tende a sbandare.",
      };
      const att = images.buildDrivingQuizPromptImage(sample) as Attachment;
      return canvasOut(toDataUrl(att) || card("Quiz patente", ["In curva il veicolo tende a sbandare.", "Rispondi: Vero o Falso"], "driving_quiz", client));
    }
    case "treasureHunt":
      return canvasOut(await themedCard(cfg, "Caccia al tesoro", ["Trova la reaction nascosta", "nei prossimi messaggi"], "treasure_hunt", client));
    default: {
      let label = type;
      try {
        const { minigameTypeLabel } = require("./minigameClassicDrafts") as typeof import("./minigameClassicDrafts");
        label = minigameTypeLabel(type) || type;
      } catch {}
      return canvasOut(await themedCard(cfg, label, [label], String(type).replace(/[^\w]+/g, "_"), client));
    }
  }
}

function isUsablePreviewImage(image?: string) {
  return Boolean(image && String(image).startsWith("data:image/"));
}

async function renderMinigamePreview(type?: string, client?): Promise<PreviewOut> {
  const t = String(type || "").trim().slice(0, 40);
  if (!t) return { image: "", source: "none" };
  if (!canvasAvailable()) return { image: "", source: "none", note: "Canvas non disponibile nel processo del bot: niente immagine vera." };
  const hit = cache.get(t);
  if (hit && Date.now() - hit.at < CACHE_MS && isUsablePreviewImage(hit.out.image)) return hit.out;
  const out: PreviewOut = await render(t, client).catch((e: any) => ({ image: "", source: "none" as const, note: `Errore: ${String(e?.message || e).slice(0, 120)}` }));
  if (!out.image && !out.note) out.note = "Il bot non è riuscito a generare l'immagine.";
  /* solo data URL in cache/store: gli URL remoti in dashboard spesso non si vedono */
  if (isUsablePreviewImage(out.image)) {
    out.source = "canvas";
    cache.set(t, { at: Date.now(), out });
  } else if (out.image && !isUsablePreviewImage(out.image)) {
    out.image = "";
    out.source = "none";
    if (!out.note) out.note = "Immagine remota scartata: serve la card canvas.";
  }
  return out;
}

/* ── anteprime preparate dal processo dei minigiochi ──
 * Il processo del sito non raggiunge le fonti esterne (TheSportsDB, Deezer…): le immagini le genera il processo
 * che fa girare i minigiochi veri, le salva nel database e il sito le legge da lì. */
/* v4: visual system Vinili (glass viola) — invalida le card crema/marroni. */
const STORE_PREFIX = "minigamePreview.v4.";
const WANTED_KEY = "minigamePreviewWanted.v4.list";
const FRESH_MS = 12 * 60 * 60 * 1000;
type StoredPreview = PreviewOut & { at: number };

function botState() {
  return require("../../../shared/botState/botStateStore") as typeof import("../../../shared/botState/botStateStore");
}

async function readStoredPreview(type: string): Promise<StoredPreview | null> {
  const v: any = await botState().getBotState(STORE_PREFIX + type, null).catch(() => null);
  return v && typeof v === "object" ? (v as StoredPreview) : null;
}

/** Il sito chiede un'immagine (nuova o mancante): la prepara il processo dei minigiochi al prossimo giro. */
async function requestPreview(type: string) {
  const list: string[] = (await botState().getBotState(WANTED_KEY, []).catch(() => [])) || [];
  if (Array.isArray(list) && list.includes(type)) return;
  await botState().setBotState(WANTED_KEY, [...(Array.isArray(list) ? list : []), type].slice(-60)).catch(() => false);
}

function isPhotoFailureNote(note?: string) {
  return /senza foto|senza logo|senza copertina|foto non disponibile|canvas non disponibile|errore:/i.test(String(note || ""));
}

/** Per il sito: immagine salvata (se c'è) e richiesta di rinfresco quando è vecchia o manca. */
async function getStoredMinigamePreview(type?: string): Promise<PreviewOut> {
  const t = String(type || "").trim().slice(0, 40);
  if (!t) return { image: "", source: "none" };
  const stored = await readStoredPreview(t);
  const photoOk = stored && isUsablePreviewImage(stored.image) && !isPhotoFailureNote(stored.note);
  const fresh = Boolean(photoOk && Date.now() - Number(stored!.at || 0) <= FRESH_MS);
  if (!fresh) await requestPreview(t);
  if (fresh) return { image: stored!.image, source: "canvas" };
  /* se c’è già una card (anche solo testo) mostrala subito mentre il worker rifà quella con foto */
  if (stored && isUsablePreviewImage(stored.image)) {
    return { image: stored.image, source: "canvas", ...(isPhotoFailureNote(stored.note) ? { note: stored.note } : {}) };
  }
  if (stored?.note) return { image: "", source: "none", note: stored.note };
  return { image: "", source: "none", note: "Il bot sta preparando l'immagine: compare tra poco." };
}

async function renderAndStore(type: string, client?) {
  cache.delete(type);
  const out = await renderMinigamePreview(type, client);
  if (isUsablePreviewImage(out.image)) {
    await botState().setBotState(STORE_PREFIX + type, { ...out, at: Date.now() }).catch(() => false);
  }
  return out;
}

let previewWorker: NodeJS.Timeout | null = null;
/** Processo dei minigiochi: ogni 20 s prepara le immagini chieste dal sito; all'avvio quelle che mancano. */
function startMinigamePreviewWorker(client?) {
  if (previewWorker) return;
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const list: string[] = (await botState().getBotState(WANTED_KEY, []).catch(() => [])) || [];
      if (Array.isArray(list) && list.length) {
        await botState().setBotState(WANTED_KEY, []).catch(() => false);
        for (const t of [...new Set(list)].slice(0, 20)) await renderAndStore(String(t), client).catch(() => null);
      }
    } finally {
      busy = false;
    }
  };
  previewWorker = setInterval(() => void tick(), 20_000);
  previewWorker.unref?.();
  /* all'avvio, piano piano: tutti i tipi senza immagine o vecchi */
  void (async () => {
    let types: string[] = [];
    try {
      const { MINIGAME_TYPE_LABELS } = require("./minigameClassicDrafts") as typeof import("./minigameClassicDrafts");
      types = Object.keys(MINIGAME_TYPE_LABELS || {});
    } catch {}
    for (const t of types) {
      const stored = await readStoredPreview(t);
      if (stored?.image && Date.now() - Number(stored.at || 0) < FRESH_MS) continue;
      await renderAndStore(t, client).catch(() => null);
      await new Promise((r) => setTimeout(r, 2500));
    }
  })();
}

export = { renderMinigamePreview, getStoredMinigamePreview, startMinigamePreviewWorker };
