/**
 * Anteprima dashboard (Livelli › Minigiochi): l'immagine del round fatta coi generatori VERI del bot
 * (card canvas, foto censurate, card con foto) e, dove servono, dati veri dalle stesse fonti dei giochi.
 * Restituisce un data URL PNG (o un URL remoto). Cache 15 minuti per tipo: le fonti remote sono lente.
 */
const images = require("./minigameImages") as typeof import("./minigameImages");

type Attachment = { attachment?: any; name?: string } | null | undefined;
type PreviewOut = { image: string; source: "canvas" | "remote" | "none" };

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

/** Foto dentro la card del bot (calciatore, squadra, cantante). */
async function photoCard(imageUrl: string, title: string, base: string, fallbackLines: string[], client?) {
  if (imageUrl) {
    const att = (await images.buildRemoteGuessImageCardAttachment(imageUrl, title, `${base}.png`).catch(() => null)) as Attachment;
    const url = toDataUrl(att);
    if (url) return url;
  }
  return card(title, fallbackLines, base, client);
}

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
      return canvasOut(await photoCard(flag, "Indovina la capitale", "guess_capital", [String(row?.country || "Italia")], client));
    }
    case "guessReverseCapital": {
      const bank: any[] = await src.loadReverseCapitalQuestionBank(cfg).catch(() => []);
      const withFlag = bank.filter((r) => r?.image);
      const row = pick(withFlag) || pick(bank.filter((r) => r?.capital));
      if (row?.image) return canvasOut(await photoCard(String(row.image), "Capitale inverso", "guess_reverse_capital", [String(row?.capital || "Roma")], client));
      return canvasOut(card("Capitale inverso", [String(row?.capital || "Roma")], "guess_reverse_capital", client));
    }
    case "guessFlag": {
      /* bandiera dentro la card canvas (come calciatore/squadra), non solo il PNG nudo */
      const list: any[] = await src.loadCountryList(cfg).catch(() => []);
      const row = pick(list.filter((c) => c?.flagUrl));
      const flag = String(row?.flagUrl || "https://flagcdn.com/w320/it.png");
      return canvasOut(await photoCard(flag, "Indovina la bandiera", "guess_flag", ["Quale nazione è?"], client));
    }
    case "guessPlayer": {
      const info: any =
        (await src.fetchFamousPlayer(cfg).catch(() => null)) ||
        (await src.fetchLeagueFamousPlayer(cfg).catch(() => null)) ||
        (await src.fetchPlayerFromRandomLetter(cfg).catch(() => null));
      const img = String(
        info?.image ||
          "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b4/Lionel-Messi-Argentina-2022-FIFA-World-Cup_%28cropped%29.jpg/320px-Lionel-Messi-Argentina-2022-FIFA-World-Cup_%28cropped%29.jpg",
      );
      return canvasOut(await photoCard(img, "Indovina il calciatore", "guess_player", ["Chi è questo calciatore?"], client));
    }
    case "guessTeam": {
      const teams: any[] = await src.loadFootballTeamsFromApi(cfg).catch(() => []);
      const row = pick(teams.filter((t) => t?.image));
      const img = String(row?.image || "https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/FC_Internazionale_Milano_2021.svg/240px-FC_Internazionale_Milano_2021.svg.png");
      return canvasOut(await photoCard(img, "Indovina la squadra", "guess_team", ["Quale squadra è?"], client));
    }
    case "guessSinger": {
      const singers: any[] = await src.loadSingersFromApi(cfg).catch(() => []);
      const row: any = pick(singers.filter((s) => s?.name));
      const img = String(row?.image || (row?.name ? await images.fetchSingerImageFallback(row.name, cfg).catch(() => "") : "") || "");
      return canvasOut(await photoCard(img, "Indovina il cantante", "guess_singer", ["Chi è questo cantante?"], client));
    }
    case "guessSong": {
      const info: any = await src.fetchPopularSong(cfg).catch(() => null);
      const img = await censored(String(info?.artwork || ""), "minigame_song.png", "Indovina la canzone");
      return img ? { image: img, source: img.startsWith("data:") ? "canvas" : "remote" } : canvasOut(card("Indovina la canzone", ["Ascolta l'anteprima"], "guess_song", client));
    }
    case "guessAlbum": {
      const albums: any[] = await src.loadAlbumsFromApi(cfg).catch(() => []);
      const row: any = pick(albums.filter((a) => a?.image || a?.album));
      const raw = String(
        row?.image ||
          "https://upload.wikimedia.org/wikipedia/en/4/42/Beatles_-_Abbey_Road.jpg",
      );
      const img = (await censored(raw, "minigame_album.png", "Indovina l'album")) || raw;
      return img ? { image: img, source: img.startsWith("data:") ? "canvas" : "remote" } : canvasOut(card("Indovina l'album", [String(row?.album || "Album"), String(row?.artist || "")], "guess_album", client));
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

async function renderMinigamePreview(type?: string, client?): Promise<PreviewOut> {
  const t = String(type || "").trim().slice(0, 40);
  if (!t) return { image: "", source: "none" };
  const hit = cache.get(t);
  if (hit && Date.now() - hit.at < CACHE_MS && hit.out.image) return hit.out;
  const out = await render(t, client).catch(() => ({ image: "", source: "none" as const }));
  if (out.image) cache.set(t, { at: Date.now(), out });
  return out;
}

export = { renderMinigamePreview };
