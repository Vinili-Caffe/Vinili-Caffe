/** Number Quiz: elenco delle categorie e voci per giocare. Tutto pubblico, nessun login. */
import fs = require("fs");
import os = require("os");
import path = require("path");
const data = require("./siteNumberQuizData") as typeof import("./siteNumberQuizData");

const PLAYS_FILE = path.join(os.homedir(), ".vc-state", "number-quiz-plays.json");
let plays: Record<string, number> = {};
try {
  plays = JSON.parse(fs.readFileSync(PLAYS_FILE, "utf8")) || {};
} catch {
  plays = {};
}
let playsTimer: NodeJS.Timeout | null = null;
function savePlays() {
  if (playsTimer) return;
  playsTimer = setTimeout(() => {
    playsTimer = null;
    try {
      fs.mkdirSync(path.dirname(PLAYS_FILE), { recursive: true });
      fs.writeFileSync(PLAYS_FILE, JSON.stringify(plays), "utf8");
    } catch {
      /* il contatore non è importante */
    }
  }, 5000);
}

function publicCategory(c: (typeof data.CATEGORIES)[number]) {
  const st = data.categoryStatus(c.id);
  /* copertina: la prima voce con immagine tra le prime, così cambia poco */
  const cover = st.items.slice(0, 40).find((x) => x.image)?.image || "";
  return {
    id: c.id,
    topic: c.topic,
    title: c.title,
    question: c.question,
    description: c.description,
    emoji: c.emoji,
    unit: c.unit,
    format: c.format,
    count: st.count,
    ready: st.ready,
    cover,
    plays: plays[c.id] || 0,
  };
}

function handleNumberQuizCategoriesGet(_client?, _req?, res?) {
  data.warmNumberQuiz();
  res.set?.("Cache-Control", "public, max-age=60");
  return res.json({ ok: true, categories: data.CATEGORIES.map(publicCategory) });
}

function sample<T>(arr: T[], n: number) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a.slice(0, n);
}

async function handleNumberQuizCategoryGet(_client?, req?, res?) {
  try {
    data.warmNumberQuiz();
    const id = String(req.params?.id || "").trim();
    const cat = data.CATEGORIES.find((c) => c.id === id);
    if (!cat) return res.status(404).json({ ok: false, error: "not_found", message: "Questa categoria non esiste." });
    const items = await data.categoryItems(id, false);
    if (!items?.length) {
      return res.status(202).json({ ok: false, error: "preparing", message: "Stiamo preparando questa categoria: riprova tra un minuto." });
    }
    const n = Math.max(10, Math.min(120, Number(req.query?.n) || 80));
    let min = Infinity;
    let max = -Infinity;
    for (const x of items) {
      if (x.value < min) min = x.value;
      if (x.value > max) max = x.value;
    }
    return res.json({ ok: true, category: publicCategory(cat), items: sample(items, n), min, max });
  } catch (err: any) {
    global.logger?.warn?.("[number-quiz] categoria:", err?.message || err);
    return res.status(500).json({ ok: false, error: "category_error" });
  }
}

function handleNumberQuizPlayPost(_client?, req?, res?) {
  const id = String(req.params?.id || "").trim();
  if (data.CATEGORIES.some((c) => c.id === id)) {
    plays[id] = (plays[id] || 0) + 1;
    savePlays();
  }
  return res.json({ ok: true });
}

export = { handleNumberQuizCategoriesGet, handleNumberQuizCategoryGet, handleNumberQuizPlayPost };
